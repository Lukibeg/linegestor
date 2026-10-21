/**
 * A janela do evento (Patch 2.0.1, decisão 0049): ver, criar e editar.
 *
 *  - VER: o tipo, a situação, quando, quem, o cliente, o chamado, o local, a observação e os painéis
 *    (quem vê); para quem trabalha nos chamados, o Feito, o Cancelar, o Duplicar, o Excluir e o Editar;
 *  - CRIAR e EDITAR: o tipo, o título (sugerido até a pessoa escrever o dela), quando, os painéis (que
 *    dizem quem vê o evento), as pessoas (só quem vê um dos painéis), o cliente, o chamado, o local, a
 *    observação, os lembretes (2.0.2: os do tipo, até a pessoa mexer; e quem recebe) e a situação. A folga
 *    e o home office (os tipos da equipe) pedem as pessoas e não mostram o cliente, o chamado e o local (a
 *    não ser que já tenham).
 *
 * As regras são as do servidor (o `EventoGravarSchema` do `@gestor/shared`): a janela confere antes de
 * mandar e mostra a frase de cada caso.
 */
import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import {
  Ban, Bell, Building2, CalendarDays, Check, Copy, Link2, MapPin, Pencil, StickyNote, Ticket, Trash2, Undo2, Users, X,
} from 'lucide-react';
import {
  diaPorExtenso, diasEntre, EventoGravarSchema, lerCodigo, NOME_QUEM_RECEBE_O_LEMBRETE, NOME_SITUACAO_DO_EVENTO, pessoasPossiveis, QUEM_RECEBE_O_LEMBRETE,
  SITUACOES_DO_EVENTO, somarDias, textoDoHorario, textoDoPeriodo, textoDosLembretes, tipoDoEvento, tituloSugerido,
  type CalendarioOpcoes, type CorPainel, type EventoDoCalendario, type EventoGravarEntrada, type QuemRecebeOLembrete, type SituacaoDoEvento,
} from '@gestor/shared';
import { api } from '../../api/index.js';
import { ApiError } from '../../api/types.js';
import { Confirmar, EscolherComBusca, Modal, Spinner, useToast } from '../../components/ui/index.js';
import { useAuth } from '../../lib/auth.js';
import { AMOSTRA_DA_COR, LinkDoChamado } from '../atendimento/comum.js';
import { PontoDoPainel, useClientesParaFiltro } from '../atendimento/quadro/filtros.js';
import { BORDA_DO_TIPO, EditorDeLembretes, erroDoEvento, FUNDO_DO_TIPO, MarcaDaSituacao, nomesDe, useNomesDasPessoas, useRecarregarCalendario } from './comum.js';

/** O que a janela edita (as horas como texto, o chamado com o código para mostrar). */
type Rascunho = {
  tipoId: string; titulo: string; tituloMexido: boolean;
  paineis: string[]; pessoas: string[]; clienteId: string;
  chamado: { id: string; codigo: string; titulo?: string } | null;
  inicio: string; fim: string; diaInteiro: boolean; horaInicio: string; horaFim: string;
  local: string; observacao: string; situacao: SituacaoDoEvento;
  /** os lembretes (minutos antes): os do tipo, até a pessoa mexer (`lembretesMexidos`) */
  lembretes: number[]; lembretesMexidos: boolean; lembrarQuem: QuemRecebeOLembrete;
  /** o aviso de que o evento entrou (2.0.2, só no evento novo): avisar agora, e quem */
  avisar: boolean; avisarQuem: QuemRecebeOLembrete;
};

/** O que vem preenchido num evento novo (o dia clicado, o chamado do Agendar…); `clienteNome` entra no título sugerido. */
export type NovoEvento = Partial<Omit<Rascunho, 'tituloMexido'>> & { clienteNome?: string | null };
/** A janela abre um evento que existe (para ver) ou um novo (já no formulário). */
export type AberturaDoEvento = { evento: EventoDoCalendario } | { novo: NovoEvento };

function doEvento(e: EventoDoCalendario): Rascunho {
  return {
    tipoId: e.tipoId, titulo: e.titulo, tituloMexido: true, paineis: [...e.paineis], pessoas: [...e.pessoas], clienteId: e.clienteId ?? '',
    chamado: e.chamadoId ? { id: e.chamadoId, codigo: e.chamadoCodigo ?? 'chamado' } : null,
    inicio: e.inicio, fim: e.fim, diaInteiro: e.diaInteiro, horaInicio: e.horaInicio ?? '', horaFim: e.horaFim ?? '',
    local: e.local, observacao: e.observacao, situacao: e.situacao,
    lembretes: [...e.lembretes], lembretesMexidos: true, lembrarQuem: e.lembrarQuem,
    avisar: false, avisarQuem: 'pessoas',
  };
}

function novoRascunho(n: NovoEvento, opcoes: CalendarioOpcoes, nomes: ReadonlyMap<string, string>): Rascunho {
  const ativos = opcoes.tipos.filter((t) => t.ativo);
  const tipo = ativos.find((t) => t.id === n.tipoId) ?? ativos.find((t) => !t.daEquipe) ?? ativos[0];
  const paineisAtivos = opcoes.paineis.filter((p) => p.ativo);
  const inicio = n.inicio ?? opcoes.hoje;
  return {
    // o título já vem sugerido ("Visita — Clínica Aurora") e acompanha o tipo, o cliente e as pessoas até a pessoa escrever o dela
    tipoId: tipo?.id ?? '', titulo: n.titulo ?? (tipo ? tituloSugerido(tipo, n.clienteNome ?? null, nomesDe(n.pessoas ?? [], nomes)) : ''), tituloMexido: !!n.titulo,
    // um painel só: já vem marcado; mais de um, a pessoa escolhe (é ele que diz quem vê o evento)
    paineis: n.paineis ?? (paineisAtivos.length === 1 ? [paineisAtivos[0]!.id] : []),
    pessoas: n.pessoas ?? [], clienteId: n.clienteId ?? '', chamado: n.chamado ?? null,
    inicio, fim: n.fim && n.fim >= inicio ? n.fim : inicio, diaInteiro: n.diaInteiro ?? true, horaInicio: n.horaInicio ?? '', horaFim: n.horaFim ?? '',
    local: n.local ?? '', observacao: n.observacao ?? '', situacao: 'agendado',
    // os lembretes do tipo (a Visita, 1 dia antes e 1 hora antes) acompanham o tipo até a pessoa mexer neles
    lembretes: n.lembretes ?? [...(tipo?.lembretes ?? [])], lembretesMexidos: !!n.lembretes, lembrarQuem: n.lembrarQuem ?? 'pessoas',
    // o aviso de que o evento entrou é opcional: desligado até a pessoa pedir
    avisar: n.avisar ?? false, avisarQuem: n.avisarQuem ?? 'pessoas',
  };
}

const paraGravar = (r: Rascunho): EventoGravarEntrada => ({
  titulo: r.titulo, tipoId: r.tipoId, paineis: r.paineis, pessoas: r.pessoas, clienteId: r.clienteId || null, chamadoId: r.chamado?.id ?? null,
  inicio: r.inicio, fim: r.fim, diaInteiro: r.diaInteiro,
  horaInicio: r.diaInteiro ? null : r.horaInicio || null, horaFim: r.diaInteiro ? null : r.horaFim || null,
  local: r.local, observacao: r.observacao, situacao: r.situacao, lembretes: r.lembretes, lembrarQuem: r.lembrarQuem,
  avisar: r.avisar ? r.avisarQuem : null,
});

/**
 * Quantas pessoas o aviso de que o evento entrou alcança (a mesma conta do servidor): as pessoas do evento
 * ou todos que veem um dos painéis dele, menos quem pôs.
 */
function quantosAvisados(r: Pick<Rascunho, 'avisarQuem' | 'pessoas'>, possiveis: ReadonlySet<string>, eu: string | undefined): number {
  const para = r.avisarQuem === 'paineis' ? [...possiveis] : r.pessoas.filter((p) => possiveis.has(p));
  return para.filter((p) => p !== eu).length;
}

/** As frases do que não serve (as mesmas do servidor), sem repetir. */
function problemas(r: Rascunho): string[] {
  const v = EventoGravarSchema.safeParse(paraGravar(r));
  return v.success ? [] : [...new Set(v.error.issues.map((i) => i.message))];
}

export function JanelaDoEvento({ abertura, opcoes, onFechar }: { abertura: AberturaDoEvento; opcoes: CalendarioOpcoes; onFechar: () => void }) {
  const [evento, setEvento] = useState<EventoDoCalendario | null>('evento' in abertura ? abertura.evento : null);
  const [modo, setModo] = useState<'ver' | 'editar' | 'novo'>('evento' in abertura ? 'ver' : 'novo');
  const nomes = useNomesDasPessoas(opcoes);
  const [rascunho, setRascunho] = useState<Rascunho>(() => ('evento' in abertura ? doEvento(abertura.evento) : novoRascunho(abertura.novo, opcoes, nomes)));
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState('');
  const [excluir, setExcluir] = useState(false);
  const toast = useToast();
  const recarregar = useRecarregarCalendario();
  const clientes = useClientesParaFiltro();
  const { user } = useAuth();
  const qc = useQueryClient();

  const editando = modo !== 'ver';
  const tipo = tipoDoEvento(opcoes.tipos, editando ? rascunho.tipoId : evento!.tipoId);

  const salvar = async () => {
    // o título apagado (e não escrito) volta a ser o sugerido
    const r = !rascunho.titulo.trim() && !rascunho.tituloMexido
      ? { ...rascunho, titulo: tituloSugerido(tipo, clientes.find((c) => c.id === rascunho.clienteId)?.nome ?? null, nomesDe(rascunho.pessoas, nomes)) }
      : rascunho;
    const p = problemas(r);
    if (p.length) { setErro(p.join(' ')); return; }
    setOcupado(true); setErro('');
    try {
      const editar = !!evento && modo === 'editar';
      const salvo = editar ? await api.calendario.alterar(evento.id, paraGravar({ ...r, avisar: false })) : await api.calendario.criar(paraGravar(r));
      void recarregar();
      // o aviso de que o evento entrou sai na hora (o sininho de quem recebe já mostra)
      const avisados = !editar && r.avisar ? quantosAvisados(r, pessoasPossiveis(opcoes.paineis, r.paineis), user?.id) : null;
      toast.push('ok', editar ? 'Evento salvo.' : `"${salvo.titulo}" está no calendário.${avisados === null ? '' : avisados ? ` O aviso saiu para ${avisados === 1 ? '1 pessoa' : `${avisados} pessoas`}.` : ' Não havia ninguém para avisar.'}`);
      if (avisados) void qc.invalidateQueries({ queryKey: ['atendimento', 'avisos'] });
      onFechar();
    } catch (e) {
      setErro(erroDoEvento(e));
    } finally {
      setOcupado(false);
    }
  };

  const mudarSituacao = async (s: SituacaoDoEvento) => {
    if (!evento) return;
    setOcupado(true); setErro('');
    try {
      const novo = await api.calendario.situacao(evento.id, s);
      setEvento(novo);
      setRascunho(doEvento(novo));
      void recarregar();
      toast.push('ok', s === 'feito' ? 'Marcado como feito.' : s === 'cancelado' ? 'Evento cancelado (continua no calendário, riscado).' : 'O evento voltou a agendado.');
    } catch (e) {
      setErro(erroDoEvento(e));
    } finally {
      setOcupado(false);
    }
  };

  const mandarParaLixeira = async () => {
    if (!evento) return;
    setOcupado(true);
    try {
      await api.calendario.remover(evento.id);
      void recarregar();
      toast.push('ok', 'O evento foi para a lixeira (volta pela Administração › Lixeira).');
      onFechar();
    } catch (e) {
      setErro(erroDoEvento(e));
      setExcluir(false);
    } finally {
      setOcupado(false);
    }
  };

  // duplicar: um evento novo igual (a pessoa muda o dia); o que é só da pessoa que vê não entra
  const duplicar = () => {
    if (!evento) return;
    const r = doEvento(evento);
    setRascunho({ ...r, titulo: evento.titulo, situacao: 'agendado', paineis: r.paineis.filter((id) => opcoes.paineis.some((p) => p.id === id && p.ativo)) });
    setEvento(null);
    setErro('');
    setModo('novo');
  };

  // desistir da edição volta para o evento como estava; do evento novo, fecha a janela
  const desistir = () => {
    if (modo === 'editar' && evento) { setModo('ver'); setRascunho(doEvento(evento)); setErro(''); } else onFechar();
  };

  const titulo = modo === 'novo' ? 'Novo evento' : modo === 'editar' ? 'Editar o evento' : (
    <span className="inline-flex items-center gap-2"><span className={`w-2.5 h-2.5 rounded-full ${AMOSTRA_DA_COR[tipo.cor]}`} aria-hidden />{tipo.nome}</span>
  );

  const rodape = editando ? (
    <>
      {erro && <p className="text-bad text-[13px] mr-auto basis-full sm:basis-auto sm:flex-1 min-w-0" role="alert" id="evento-erro">{erro}</p>}
      <button type="button" className="btn-secondary" onClick={desistir}>Cancelar</button>
      <button type="submit" form="form-do-evento" className="btn-primary" disabled={ocupado} id="evento-salvar">{ocupado ? <Spinner className="text-white" /> : modo === 'novo' ? 'Pôr no calendário' : 'Salvar'}</button>
    </>
  ) : opcoes.podeEditar && evento ? (
    <>
      {erro && <p className="text-bad text-[13px] basis-full" role="alert">{erro}</p>}
      <button type="button" className="btn-ghost text-bad mr-auto" onClick={() => setExcluir(true)} disabled={ocupado}><Trash2 size={15} /> Excluir</button>
      <button type="button" className="btn-ghost" onClick={duplicar} disabled={ocupado} title="Um evento novo igual a este (para outro dia)"><Copy size={15} /> Duplicar</button>
      {evento.situacao === 'agendado' ? (
        <>
          <button type="button" className="btn-secondary" onClick={() => void mudarSituacao('cancelado')} disabled={ocupado}><Ban size={15} /> Cancelar o evento</button>
          <button type="button" className="btn-secondary" onClick={() => void mudarSituacao('feito')} disabled={ocupado} id="evento-feito"><Check size={15} /> Feito</button>
        </>
      ) : (
        <button type="button" className="btn-secondary" onClick={() => void mudarSituacao('agendado')} disabled={ocupado}><Undo2 size={15} /> Voltar a agendado</button>
      )}
      <button type="button" className="btn-primary" onClick={() => { setModo('editar'); setErro(''); }} disabled={ocupado} id="evento-editar"><Pencil size={15} /> Editar</button>
    </>
  ) : undefined;

  return (
    <>
      <Modal open onClose={onFechar} titulo={titulo} largura="max-w-2xl" rodape={rodape}>
        {editando
          ? <Formulario r={rascunho} mudar={(m) => { setRascunho((x) => ({ ...x, ...m })); setErro(''); }} opcoes={opcoes} nomes={nomes} existente={modo === 'editar'} onSalvar={() => void salvar()} />
          : <Detalhe e={evento!} opcoes={opcoes} nomes={nomes} />}
      </Modal>
      {excluir && evento && (
        <Confirmar open onClose={() => setExcluir(false)} onConfirm={() => void mandarParaLixeira()} loading={ocupado} perigoso botao="Mandar para a lixeira"
          titulo="Excluir o evento"
          texto={<>O evento <b>{evento.titulo}</b> ({textoDoPeriodo(evento)}) sai do calendário de todos e vai para a lixeira. Dá para trazer de volta pela Administração › Lixeira.</>} />
      )}
    </>
  );
}

// =====================================================================
//  VER
// =====================================================================

function Detalhe({ e, opcoes, nomes }: { e: EventoDoCalendario; opcoes: CalendarioOpcoes; nomes: ReadonlyMap<string, string> }) {
  const tipo = tipoDoEvento(opcoes.tipos, e.tipoId);
  const paineis = e.paineis.map((id) => opcoes.paineis.find((p) => p.id === id)).filter((p): p is CalendarioOpcoes['paineis'][number] => !!p);
  const escondidos = e.paineis.length - paineis.length;
  const quando = e.inicio === e.fim ? diaPorExtenso(e.inicio) : `de ${diaPorExtenso(e.inicio)} a ${diaPorExtenso(e.fim)}`;
  const pessoas = nomesDe(e.pessoas, nomes);
  const dataCurta = (iso: string) => new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
  return (
    <div className="flex flex-col gap-3" id="evento-detalhe" data-evento={e.id}>
      {(e.situacao !== 'agendado' || (!tipo.ativo && tipo.nome !== 'Outro')) && (
        <div className="flex flex-wrap items-center gap-2 -mb-1">
          {e.situacao !== 'agendado' && <span className={`chip ${e.situacao === 'feito' ? 'bg-ok-soft' : 'bg-surface-2'}`}><MarcaDaSituacao s={e.situacao} /></span>}
          {!tipo.ativo && tipo.nome !== 'Outro' && <span className="text-[12px] text-muted">O tipo {tipo.nome} foi desativado (o evento continua).</span>}
        </div>
      )}
      <h2 className={`font-display text-[19px] font-semibold leading-snug break-words ${e.situacao === 'cancelado' ? 'line-through text-muted' : ''}`}>{e.titulo}</h2>
      <dl className="flex flex-col gap-2 text-[14px]">
        <Item icone={<CalendarDays size={16} />} rotulo="Quando">
          <span className="first-letter:uppercase inline-block">{quando}</span> · <span className="tnum">{textoDoHorario(e)}</span>
          {!e.diaInteiro && e.horaFim && e.horaInicio && e.horaFim <= e.horaInicio && <span className="text-muted"> (vira a noite)</span>}
        </Item>
        {pessoas.length > 0 && <Item icone={<Users size={16} />} rotulo={tipo.daEquipe ? 'Quem' : 'Pessoas'}>{pessoas.join(', ')}</Item>}
        {e.clienteId && (
          <Item icone={<Building2 size={16} />} rotulo="Cliente">
            <Link to={`/clientes/${e.clienteId}`} className="link">{e.clienteNome ?? 'o cliente'}</Link>
          </Item>
        )}
        {e.chamadoCodigo && (
          <Item icone={<Ticket size={16} />} rotulo="Chamado">
            <LinkDoChamado codigo={e.chamadoCodigo} className="link font-mono">{e.chamadoCodigo}</LinkDoChamado>
          </Item>
        )}
        {e.local && <Item icone={<MapPin size={16} />} rotulo="Local"><span className="break-words">{e.local}</span></Item>}
        {e.lembretes.length > 0 && (
          <Item icone={<Bell size={16} />} rotulo="Lembretes">
            <span className="first-letter:uppercase inline-block">{textoDosLembretes(e.lembretes)}</span>
            <span className="text-muted"> · para {e.lembrarQuem === 'paineis' ? 'todos que veem o evento' : e.pessoas.length ? (e.pessoas.length === 1 ? 'a pessoa do evento' : 'as pessoas do evento') : 'quem pôs o evento'}</span>
          </Item>
        )}
        {e.observacao && <Item icone={<StickyNote size={16} />} rotulo="Observação"><span className="whitespace-pre-wrap break-words">{e.observacao}</span></Item>}
      </dl>
      <div className="rounded-lg bg-surface-2 px-3 py-2 text-[12.5px] text-ink-2 flex flex-wrap items-center gap-x-2 gap-y-1" id="evento-quem-ve">
        <span className="font-semibold">Quem vê:</span>
        {paineis.map((p) => <span key={p.id} className="inline-flex items-center gap-1"><PontoDoPainel cor={p.cor as CorPainel} />{p.nome}</span>)}
        {escondidos > 0 && <span className="text-muted">e {escondidos === 1 ? 'mais um painel que você não vê' : `mais ${escondidos} painéis que você não vê`}</span>}
        <span className="text-muted">— quem vê um destes painéis.</span>
      </div>
      <p className="text-[12px] text-muted">
        {e.criadoPor ? `Posto por ${e.criadoPor}` : 'Posto'} em {dataCurta(e.criadoEm)}
        {e.alteradoEm !== e.criadoEm && <> · mudado{e.alteradoPor ? ` por ${e.alteradoPor}` : ''} em {dataCurta(e.alteradoEm)}</>}
      </p>
    </div>
  );
}

function Item({ icone, rotulo, children }: { icone: ReactNode; rotulo: string; children: ReactNode }) {
  return (
    <div className="flex gap-2.5 min-w-0">
      <dt className="text-muted pt-0.5 shrink-0" title={rotulo} aria-label={rotulo}>{icone}</dt>
      <dd className="min-w-0 m-0">{children}</dd>
    </div>
  );
}

// =====================================================================
//  CRIAR E EDITAR
// =====================================================================

function Formulario({ r, mudar, opcoes, nomes, existente, onSalvar }: {
  r: Rascunho; mudar: (m: Partial<Rascunho>) => void; opcoes: CalendarioOpcoes; nomes: ReadonlyMap<string, string>; existente: boolean; onSalvar: () => void;
}) {
  const { user } = useAuth();
  const clientes = useClientesParaFiltro();
  const tipo = tipoDoEvento(opcoes.tipos, r.tipoId);
  const nomeDoCliente = (id: string) => clientes.find((c) => c.id === id)?.nome ?? null;

  // o título acompanha o tipo, o cliente e as pessoas até a pessoa escrever o dela (e os lembretes, o tipo)
  const comTitulo = (m: Partial<Rascunho>): Partial<Rascunho> => {
    const prox = { ...r, ...m };
    const t = tipoDoEvento(opcoes.tipos, prox.tipoId);
    const lembretes = !prox.lembretesMexidos && m.tipoId && m.tipoId !== r.tipoId ? { lembretes: [...t.lembretes] } : {};
    if (prox.tituloMexido) return { ...m, ...lembretes };
    return { ...m, ...lembretes, titulo: tituloSugerido(t, prox.clienteId ? nomeDoCliente(prox.clienteId) : null, nomesDe(prox.pessoas, nomes)) };
  };
  const sugerido = !r.tituloMexido && !r.titulo ? tituloSugerido(tipo, r.clienteId ? nomeDoCliente(r.clienteId) : null, nomesDe(r.pessoas, nomes)) : '';

  // os tipos: os ativos (e o do evento, mesmo desativado)
  const tipos = opcoes.tipos.filter((t) => t.ativo || t.id === r.tipoId);
  // os painéis: os que a pessoa vê (o desativado só se o evento já estava nele)
  const paineis = opcoes.paineis.filter((p) => p.ativo || r.paineis.includes(p.id));
  const escondidos = r.paineis.filter((id) => !opcoes.paineis.some((p) => p.id === id)).length;
  const possiveis = useMemo(() => pessoasPossiveis(opcoes.paineis, r.paineis), [opcoes.paineis, r.paineis]);
  // as pessoas: quem vê um dos painéis escolhidos (e quem já está no evento, para poder tirar)
  const pessoas = opcoes.pessoas.filter((p) => possiveis.has(p.id) || r.pessoas.includes(p.id));
  const foraDosPaineis = r.pessoas.filter((id) => !possiveis.has(id));
  const vaoVer = possiveis.size;

  const mudarInicio = (inicio: string) => {
    if (!inicio) return;
    // o evento de vários dias anda inteiro (o fim acompanha o começo)
    const dias = r.inicio && r.fim >= r.inicio ? diasEntre(r.inicio, r.fim) : 0;
    mudar({ inicio, fim: somarDias(inicio, dias) });
  };
  const alternarPainel = (id: string) => mudar({ paineis: r.paineis.includes(id) ? r.paineis.filter((x) => x !== id) : [...r.paineis, id] });
  const alternarPessoa = (id: string) => mudar(comTitulo({ pessoas: r.pessoas.includes(id) ? r.pessoas.filter((x) => x !== id) : [...r.pessoas, id] }));
  const mostrarCliente = !tipo.daEquipe || !!r.clienteId || !!r.chamado || !!r.local;

  return (
    <form id="form-do-evento" className="flex flex-col gap-4" autoComplete="off" noValidate onSubmit={(e) => { e.preventDefault(); onSalvar(); }}>
      <fieldset>
        <legend className="label">Tipo</legend>
        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Tipo do evento" id="evento-tipos">
          {tipos.map((t) => {
            const ativo = t.id === r.tipoId;
            return (
              <button key={t.id} type="button" role="radio" aria-checked={ativo} data-tipo={t.id}
                // a folga e o home office são do dia inteiro (dá para desmarcar, se for meio período)
                onClick={() => mudar(comTitulo({ tipoId: t.id, ...(t.daEquipe ? { diaInteiro: true } : {}) }))}
                className={`chip rounded-full border py-1 pl-2 pr-2.5 text-[12.5px] ${ativo ? `${FUNDO_DO_TIPO[t.cor]} ${BORDA_DO_TIPO[t.cor]}` : 'border-line bg-surface text-ink-2 hover:bg-surface-2'}`}>
                <span className={`w-2 h-2 rounded-full ${AMOSTRA_DA_COR[t.cor]}`} aria-hidden />{t.nome}
                {ativo && <Check size={13} aria-hidden />}
              </button>
            );
          })}
        </div>
      </fieldset>

      <div>
        <label className="label" htmlFor="evento-titulo">Título</label>
        <input id="evento-titulo" className="input" maxLength={160} value={r.titulo} placeholder={sugerido || 'Visita — Clínica Aurora'}
          onChange={(e) => mudar({ titulo: e.target.value, tituloMexido: e.target.value.trim() !== '' })} />
      </div>

      <fieldset>
        <legend className="label">Quando</legend>
        <div className="flex flex-wrap items-end gap-x-3 gap-y-2">
          <label className="flex flex-col gap-1 text-[12.5px] text-muted">
            <span>De</span>
            <input type="date" className="input py-1.5 w-[160px]" value={r.inicio} onChange={(e) => mudarInicio(e.target.value)} id="evento-inicio" required />
          </label>
          <label className="flex flex-col gap-1 text-[12.5px] text-muted">
            <span>Até</span>
            <input type="date" className="input py-1.5 w-[160px]" value={r.fim} min={r.inicio} onChange={(e) => e.target.value && mudar({ fim: e.target.value })} id="evento-fim" required />
          </label>
          <label className="inline-flex items-center gap-2 text-sm cursor-pointer select-none pb-2">
            <input type="checkbox" className="w-4 h-4 accent-[var(--accent)]" checked={r.diaInteiro} id="evento-dia-inteiro"
              onChange={(e) => mudar({ diaInteiro: e.target.checked, ...(!e.target.checked && !r.horaInicio ? { horaInicio: '09:00', horaFim: '10:00' } : {}) })} />
            Dia inteiro
          </label>
        </div>
        {!r.diaInteiro && (
          <div className="flex flex-wrap items-end gap-x-3 gap-y-2 mt-2">
            <label className="flex flex-col gap-1 text-[12.5px] text-muted">
              <span>Começa</span>
              <input type="time" className="input py-1.5 w-[130px]" value={r.horaInicio} onChange={(e) => mudar({ horaInicio: e.target.value })} id="evento-hora-inicio" />
            </label>
            <label className="flex flex-col gap-1 text-[12.5px] text-muted">
              <span>Termina</span>
              <input type="time" className="input py-1.5 w-[130px]" value={r.horaFim} onChange={(e) => mudar({ horaFim: e.target.value })} id="evento-hora-fim" />
            </label>
            <span className="text-[12px] text-muted pb-2">Hora de Brasília. A virada que entra na madrugada: termine no dia seguinte.</span>
          </div>
        )}
      </fieldset>

      <fieldset>
        <legend className="label">Painéis <span className="font-normal text-muted">— é o painel que diz quem vê o evento</span></legend>
        <div className="flex flex-wrap gap-1.5" id="evento-paineis">
          {paineis.map((p) => {
            const ativo = r.paineis.includes(p.id);
            return (
              <button key={p.id} type="button" aria-pressed={ativo} onClick={() => alternarPainel(p.id)} data-painel={p.sigla}
                className={`chip border py-1 px-2.5 text-[12.5px] ${ativo ? 'border-accent bg-accent-soft text-accent-ink' : 'border-line bg-surface text-ink-2 hover:bg-surface-2'}`}>
                <PontoDoPainel cor={p.cor as CorPainel} />{p.nome}{ativo && <Check size={13} aria-hidden />}
              </button>
            );
          })}
        </div>
        <p className="text-[12px] text-muted mt-1.5" id="evento-vao-ver">
          {r.paineis.length
            ? <>Vão ver este evento <b className="text-ink-2" title={nomesDe([...possiveis], nomes).join(', ')}>{vaoVer === 1 ? '1 pessoa' : `${vaoVer} pessoas`}</b>: quem vê {r.paineis.length === 1 ? 'esse painel' : 'um desses painéis'}.</>
            : 'Escolha pelo menos um painel.'}
          {escondidos > 0 && <> Ele também está em {escondidos === 1 ? 'um painel que você não vê' : `${escondidos} painéis que você não vê`}: fica como está.</>}
        </p>
      </fieldset>

      <fieldset>
        <legend className="label">{tipo.daEquipe ? 'Quem' : 'Pessoas'} <span className="font-normal text-muted">{tipo.daEquipe ? `— entra no "Hoje, fora do escritório"` : '— quem vai'}</span></legend>
        {pessoas.length ? (
          <div className="flex flex-wrap gap-1.5" id="evento-pessoas">
            {pessoas.map((p) => {
              const ativo = r.pessoas.includes(p.id);
              const fora = ativo && !possiveis.has(p.id);
              return (
                <button key={p.id} type="button" aria-pressed={ativo} onClick={() => alternarPessoa(p.id)} data-pessoa={p.nome}
                  className={`chip border py-1 px-2.5 text-[12.5px] ${fora ? 'border-bad bg-bad-soft text-bad' : ativo ? 'border-accent bg-accent-soft text-accent-ink' : 'border-line bg-surface text-ink-2 hover:bg-surface-2'}`}>
                  {p.nome}{p.id === user?.id ? ' (você)' : ''}{ativo && <Check size={13} aria-hidden />}
                </button>
              );
            })}
          </div>
        ) : <p className="text-[13px] text-muted">Escolha o painel primeiro: as pessoas são as que veem o painel.</p>}
        {foraDosPaineis.length > 0 && !existente && (
          <p className="text-[12.5px] text-bad mt-1.5">{nomesDe(foraDosPaineis, nomes).join(', ')} não {foraDosPaineis.length === 1 ? 'vê' : 'veem'} os painéis escolhidos: inclua o painel ou tire a pessoa.</p>
        )}
      </fieldset>

      {mostrarCliente && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="min-w-0">
            <span className="label">Cliente</span>
            <EscolherComBusca valor={r.clienteId} opcoes={clientes} onChange={(id) => mudar(comTitulo({ clienteId: id }))} vazio="Sem cliente" placeholder="Sem cliente"
              className="input w-full" largura="w-[340px]" id="evento-cliente" rotulo="Cliente do evento" procurar="Procurar o cliente…" />
          </div>
          <Chamado r={r} mudar={(m) => mudar(comTitulo(m))} />
        </div>
      )}

      {mostrarCliente && (
        <div>
          <label className="label" htmlFor="evento-local">Local</label>
          <input id="evento-local" className="input" maxLength={300} value={r.local} onChange={(e) => mudar({ local: e.target.value })} placeholder="O endereço, a sala, Remoto, Google Meet…" />
        </div>
      )}

      <div>
        <label className="label" htmlFor="evento-observacao">Observação</label>
        <textarea id="evento-observacao" className="input min-h-[76px]" maxLength={4000} value={r.observacao} onChange={(e) => mudar({ observacao: e.target.value })}
          placeholder={tipo.daEquipe ? 'Algum combinado (opcional)' : 'O que levar, o que fazer, quem procurar… (opcional)'} />
      </div>

      {!existente && <AvisarAoIncluir r={r} mudar={mudar} possiveis={possiveis} eu={user?.id} />}

      <Lembretes r={r} mudar={mudar} vaoVer={vaoVer} />

      {existente && (
        <fieldset>
          <legend className="label">Situação</legend>
          <div className="inline-flex rounded-lg border border-line-strong p-0.5 bg-surface" role="radiogroup" aria-label="Situação do evento">
            {SITUACOES_DO_EVENTO.map((s) => (
              <button key={s} type="button" role="radio" aria-checked={r.situacao === s} onClick={() => mudar({ situacao: s })}
                className={`px-3 py-1 rounded-md text-[13px] font-semibold ${r.situacao === s ? 'bg-accent-soft text-accent-ink' : 'text-ink-2 hover:bg-surface-2'}`}>
                {NOME_SITUACAO_DO_EVENTO[s]}
              </button>
            ))}
          </div>
        </fieldset>
      )}
    </form>
  );
}

/**
 * O aviso de que o evento entrou (2.0.2, só no evento novo; o pedido do Luan: "uma notificação de inclusão
 * opcional… com as opções as pessoas do evento ou todos que veem o evento"): sai na hora de pôr no
 * calendário, pelo sininho e pelo WhatsApp de cada pessoa, conforme os Ajustes dos avisos. Quem pôs não recebe.
 */
function AvisarAoIncluir({ r, mudar, possiveis, eu }: { r: Rascunho; mudar: (m: Partial<Rascunho>) => void; possiveis: ReadonlySet<string>; eu: string | undefined }) {
  const n = quantosAvisados(r, possiveis, eu);
  const quem = r.avisarQuem === 'paineis' && !r.paineis.length ? 'Escolha o painel do evento: quem vê o painel recebe.'
    : !n ? (r.avisarQuem === 'pessoas' ? 'Ninguém recebe: o evento ainda não tem outras pessoas além de você.' : 'Ninguém recebe: só você vê o painel do evento.')
      : `${n === 1 ? 'Vai receber 1 pessoa' : `Vão receber ${n} pessoas`}, agora: ${r.avisarQuem === 'paineis' ? `quem vê ${r.paineis.length === 1 ? 'o painel' : 'um dos painéis'} do evento` : 'as pessoas do evento'}.`;
  return (
    <fieldset id="evento-avisar">
      <legend className="label">Avisar <span className="font-normal text-muted">— que o evento entrou no calendário (opcional)</span></legend>
      <label className="inline-flex items-center gap-2 text-sm cursor-pointer select-none">
        <input type="checkbox" className="w-4 h-4 accent-[var(--accent)]" checked={r.avisar} id="evento-avisar-ligado" onChange={(e) => mudar({ avisar: e.target.checked })} />
        Avisar agora, ao pôr no calendário
      </label>
      {r.avisar && (
        <div className="mt-2 flex flex-col gap-1.5">
          <div className="inline-flex flex-wrap rounded-lg border border-line-strong p-0.5 bg-surface self-start" role="radiogroup" aria-label="Quem recebe o aviso" id="evento-avisar-quem">
            {QUEM_RECEBE_O_LEMBRETE.map((q) => (
              <button key={q} type="button" role="radio" aria-checked={r.avisarQuem === q} onClick={() => mudar({ avisarQuem: q })} data-quem={q}
                className={`px-2.5 py-1 rounded-md text-[12.5px] font-semibold ${r.avisarQuem === q ? 'bg-accent-soft text-accent-ink' : 'text-ink-2 hover:bg-surface-2'}`}>
                {NOME_QUEM_RECEBE_O_LEMBRETE[q]}
              </button>
            ))}
          </div>
          <p className="text-[12px] text-muted" id="evento-avisar-quantos">
            {quem} No sininho e no WhatsApp de cada um (o número fica em Administração › Usuários). Você não recebe o aviso do que você mesmo pôs.
          </p>
        </div>
      )}
    </fieldset>
  );
}

/**
 * Os lembretes (2.0.2): quanto tempo antes e quem recebe. Vão pelo sininho e pelo WhatsApp de cada pessoa
 * (o número de Administração › Usuários), conforme os Ajustes dos avisos.
 */
function Lembretes({ r, mudar, vaoVer }: { r: Rascunho; mudar: (m: Partial<Rascunho>) => void; vaoVer: number }) {
  const quem = r.lembrarQuem === 'paineis'
    ? !r.paineis.length ? 'Escolha o painel do evento: quem vê o painel recebe.'
      : `${vaoVer === 1 ? 'Vai receber 1 pessoa' : `Vão receber ${vaoVer} pessoas`}: quem vê ${r.paineis.length === 1 ? 'o painel' : 'um dos painéis'} do evento.`
    : r.pessoas.length === 1 ? 'Vai receber a pessoa do evento.'
      : r.pessoas.length > 1 ? `Vão receber as ${r.pessoas.length} pessoas do evento.`
        : 'Sem pessoas no evento, o lembrete vai para quem pôs o evento.';
  return (
    <fieldset id="evento-lembretes">
      <legend className="label">Lembretes <span className="font-normal text-muted">— quanto tempo antes avisar</span></legend>
      <EditorDeLembretes valor={r.lembretes} onChange={(v) => mudar({ lembretes: v, lembretesMexidos: true })} id="evento-lembretes-lista" rotulo="Os lembretes do evento" />
      {r.lembretes.length > 0 && (
        <div className="mt-2.5 flex flex-col gap-1.5">
          <div className="inline-flex flex-wrap rounded-lg border border-line-strong p-0.5 bg-surface self-start" role="radiogroup" aria-label="Quem recebe o lembrete" id="evento-lembrar-quem">
            {QUEM_RECEBE_O_LEMBRETE.map((q) => (
              <button key={q} type="button" role="radio" aria-checked={r.lembrarQuem === q} onClick={() => mudar({ lembrarQuem: q })} data-quem={q}
                className={`px-2.5 py-1 rounded-md text-[12.5px] font-semibold ${r.lembrarQuem === q ? 'bg-accent-soft text-accent-ink' : 'text-ink-2 hover:bg-surface-2'}`}>
                {NOME_QUEM_RECEBE_O_LEMBRETE[q]}
              </button>
            ))}
          </div>
          <p className="text-[12px] text-muted">
            {quem} No sininho e no WhatsApp de cada um (o número fica em Administração › Usuários).{r.diaInteiro ? ' No evento do dia inteiro, a conta é a partir das 8h.' : ''}
          </p>
        </div>
      )}
    </fieldset>
  );
}

/** O chamado ligado: o código (SUP-12) que a pessoa vê; o cliente dele entra junto, se ainda não há cliente. */
function Chamado({ r, mudar }: { r: Rascunho; mudar: (m: Partial<Rascunho>) => void }) {
  const [codigo, setCodigo] = useState('');
  const [buscando, setBuscando] = useState(false);
  const [erro, setErro] = useState('');
  const ligar = async () => {
    const lido = lerCodigo(codigo.trim());
    if (!lido) { setErro('Escreva o código do chamado, como SUP-12.'); return; }
    setBuscando(true); setErro('');
    try {
      const f = await api.atendimento.chamado(`${lido.sigla}-${lido.numero}`);
      mudar({ chamado: { id: f.id, codigo: f.codigo, titulo: f.titulo }, ...(!r.clienteId && f.cliente ? { clienteId: f.cliente.id } : {}) });
      setCodigo('');
    } catch (e) {
      setErro(e instanceof ApiError && e.status === 404 ? `Não achei o ${lido.sigla}-${lido.numero} (ou ele é de um painel que você não vê).` : erroDoEvento(e));
    } finally {
      setBuscando(false);
    }
  };
  return (
    <div className="min-w-0">
      <span className="label">Chamado ligado</span>
      {r.chamado ? (
        <div className="flex items-center gap-2 min-h-[38px]" id="evento-chamado">
          <span className="chip bg-surface-2 text-ink-2 font-mono"><Link2 size={12} aria-hidden />{r.chamado.codigo}</span>
          {r.chamado.titulo && <span className="text-[13px] text-muted truncate min-w-0">{r.chamado.titulo}</span>}
          <button type="button" className="btn-ghost btn-sm px-1.5 text-muted ml-auto" onClick={() => mudar({ chamado: null })} aria-label={`Desligar o ${r.chamado.codigo}`} title="Desligar o chamado"><X size={14} /></button>
        </div>
      ) : (
        <div className="flex gap-1.5">
          <input className="input py-1.5 font-mono uppercase placeholder:normal-case placeholder:font-sans" value={codigo} placeholder="SUP-12 (opcional)" aria-label="Código do chamado"
            onChange={(e) => { setCodigo(e.target.value); setErro(''); }} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void ligar(); } }} id="evento-chamado-codigo" />
          <button type="button" className="btn-secondary btn-sm shrink-0" onClick={() => void ligar()} disabled={buscando || !codigo.trim()}>{buscando ? <Spinner /> : 'Ligar'}</button>
        </div>
      )}
      {erro && <p className="text-bad text-[12.5px] mt-1">{erro}</p>}
    </div>
  );
}
