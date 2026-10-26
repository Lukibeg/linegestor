/**
 * Painéis › Ajustes (Patch 2.0) — Chamados agendados: o chamado que nasce sozinho na hora marcada
 * (a verificação dos DIDs em uso, todo dia 15). Quem cria é o relógio do servidor, a cada minuto, pelas
 * mesmas regras do "Abrir chamado" (o painel ativo, o assunto do painel, o responsável ativo), com os
 * passos do agendado no checklist. "Criar agora" faz o mesmo na hora, sem mudar a próxima vez.
 *
 * A hora é sempre a de Brasília. "Todo dia" pode pular o que não é dia de atendimento (o fim de semana e
 * os feriados dos Prazos); "todo mês" no dia 31 nasce no último dia dos meses mais curtos.
 */
import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarClock, Pencil, Play, Plus, Trash2, X } from 'lucide-react';
import {
  caminhoDoAssunto, campoLigado, emOrdemDeArvore, FREQUENCIAS, NOME_FREQUENCIA, NOME_PRIORIDADE, NOMES_DOS_DIAS, PRIORIDADES, proximaExecucao, RegraAgendadoSchema, textoDaRegra,
  type Agendado, type AgendadoGravarEntrada, type OpcoesAtendimento, type Painel, type Prioridade, type RegraAgendado,
} from '@gestor/shared';
import { api } from '../../../api/index.js';
import { Campo, Carregando, Chip, Confirmar, EscolherComBusca, Modal, Spinner, Toggle, mensagemErro, usePaginaLocal, useToast } from '../../../components/ui/index.js';
import { TdN, ThN } from '../../../lib/contagem.js';
import { ordenarLista, Th, useOrdenacaoLocal } from '../../../lib/ordenacao.js';
import { CodigoChamado, TOM_DO_PAINEL, dataHoraCurta, useDepoisDeMudar, useOpcoes } from '../comum.js';
import { CartaoAjuste, Explicacao, Interruptor, Resultado, erroLegivel } from './Avisos.js';

const CHAVE = ['atendimento', 'ajustes', 'agendados'];
type Filtro = 'todos' | 'ligados' | 'desligados';

type Passo = { id: string; texto: string };
type Form = {
  painelId: string; titulo: string; relato: string; clienteId: string; responsavelId: string; assuntoId: string;
  prioridade: '' | Prioridade; passos: Passo[]; regra: RegraAgendado; ativo: boolean;
};

const novoId = () => Math.random().toString(36).slice(2, 10);
const fmtDiaBrasil = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' });
const diaBrasil = (d: Date) => fmtDiaBrasil.format(d);
const amanha = () => diaBrasil(new Date(Date.now() + 86_400_000));

const REGRA_NOVA: RegraAgendado = { frequencia: 'diaria', hora: '08:00', dias: [1], diaDoMes: 1, data: null, soDiasDeAtendimento: true };

const formVazio = (painelId: string): Form => ({
  painelId, titulo: '', relato: '', clienteId: '', responsavelId: '', assuntoId: '', prioridade: '', passos: [], regra: REGRA_NOVA, ativo: true,
});
/** O exemplo do estado vazio: a verificação dos DIDs em uso, todo dia 15 (o pedido que deu origem aos agendados). */
const formExemplo = (painelId: string): Form => ({
  ...formVazio(painelId),
  titulo: 'Verificação dos DIDs em uso',
  relato: 'Conferir os DIDs em uso de cada cliente e o que mudou desde o mês passado.',
  prioridade: 'baixa',
  passos: ['Exportar a lista de DIDs em uso', 'Conferir com o cadastro dos clientes', 'Anotar o que mudou'].map((texto) => ({ id: novoId(), texto })),
  regra: { ...REGRA_NOVA, frequencia: 'mensal', diaDoMes: 15, soDiasDeAtendimento: false },
});
const formDe = (a: Agendado): Form => ({
  painelId: a.painelId, titulo: a.titulo, relato: a.relato ?? '', clienteId: a.clienteId ?? '', responsavelId: a.responsavelId ?? '',
  assuntoId: a.assuntoId ?? '', prioridade: a.prioridade ?? '', passos: a.checklist.map((texto) => ({ id: novoId(), texto })),
  // o que não é da frequência escolhida volta ao padrão: trocar de "todo mês" para "toda semana" já começa com um dia marcado
  regra: { ...a.regra, dias: a.regra.dias.length ? a.regra.dias : [1], diaDoMes: a.regra.diaDoMes ?? 1 }, ativo: a.ativo,
});

/** Só o que vale para a frequência escolhida vai para o servidor (o resto do formulário fica na tela). */
const regraLimpa = (r: RegraAgendado): RegraAgendado => ({
  frequencia: r.frequencia, hora: r.hora,
  dias: r.frequencia === 'semanal' ? [...r.dias].sort((a, b) => a - b) : [],
  diaDoMes: r.frequencia === 'mensal' ? r.diaDoMes : null,
  data: r.frequencia === 'uma_vez' ? r.data : null,
  soDiasDeAtendimento: r.frequencia === 'diaria' ? r.soDiasDeAtendimento : false,
});

const paraEntrada = (f: Form): AgendadoGravarEntrada => ({
  painelId: f.painelId, titulo: f.titulo.trim(), relato: f.relato.trim() || null, clienteId: f.clienteId || null,
  responsavelId: f.responsavelId || null, assuntoId: f.assuntoId || null, prioridade: f.prioridade || null,
  checklist: f.passos.map((p) => p.texto.trim()).filter(Boolean), regra: regraLimpa(f.regra), ativo: f.ativo,
});

const fmtProxima = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const fmtDia = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', weekday: 'short', day: '2-digit', month: '2-digit' });
const fmtHora = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' });

/** A regra conferida (a mesma do servidor) e a próxima vez em que o chamado nasce. */
function lerRegra(r: RegraAgendado, opcoes: OpcoesAtendimento | undefined, ativo: boolean): { problema: string | null; proxima: Date | null } {
  const limpa = regraLimpa(r);
  const lida = RegraAgendadoSchema.safeParse(limpa);
  if (!lida.success) return { problema: lida.error.issues[0]?.message ?? 'Confira quando o chamado nasce.', proxima: null };
  const proxima = proximaExecucao(limpa, new Date(), opcoes?.prazos.calendario);
  if (!proxima && ativo && limpa.frequencia === 'uma_vez') return { problema: 'Essa data e hora já passaram: escolha um momento que ainda vai chegar.', proxima: null };
  return { problema: null, proxima };
}

export function AjustesAgendados() {
  const qc = useQueryClient(); const toast = useToast(); const depois = useDepoisDeMudar();
  const q = useQuery({ queryKey: CHAVE, queryFn: () => api.atendimento.agendados() });
  const opcoes = useOpcoes();
  const [editando, setEditando] = useState<{ id: string | null; f: Form } | null>(null);
  const [mudando, setMudando] = useState<string | null>(null);
  const [erros, setErros] = useState<Record<string, string>>({});
  const [criarAgora, setCriarAgora] = useState<Agendado | null>(null);
  const [criando, setCriando] = useState(false);
  const [erroCriar, setErroCriar] = useState<string | null>(null);
  const [criados, setCriados] = useState<Record<string, string>>({});
  const [filtro, setFiltro] = useState<Filtro>('todos');

  if (q.isLoading || opcoes.isLoading) return <Carregando />;
  if (q.isError || !q.data) return <p className="text-bad text-sm" role="alert">{mensagemErro(q.error)}</p>;
  const lista = q.data;
  const paineis = opcoes.data?.paineis ?? [];
  const primeiro = paineis.find((p) => p.ativo)?.id ?? paineis[0]?.id ?? '';
  const ligados = lista.filter((a) => a.ativo).length;
  const contagem: Record<Filtro, number> = { todos: lista.length, ligados, desligados: lista.length - ligados };
  const visiveis = lista.filter((a) => filtro === 'todos' || (filtro === 'ligados') === a.ativo);

  // o Meu dia mostra os agendados que nascem hoje
  const recarregar = () => Promise.all([qc.invalidateQueries({ queryKey: CHAVE }), qc.invalidateQueries({ queryKey: ['atendimento', 'meu-dia'] })]);

  /** Ligar ou desligar direto da lista (vai o resto como está; salvar recalcula a próxima vez). */
  const alternar = async (a: Agendado, ativo: boolean) => {
    setMudando(a.id); setErros(({ [a.id]: _, ...resto }) => resto);
    try { await api.atendimento.salvarAgendado(a.id, paraEntrada({ ...formDe(a), ativo })); await recarregar(); }
    catch (e) { setErros((x) => ({ ...x, [a.id]: erroLegivel(e) })); } finally { setMudando(null); }
  };
  const criar = async () => {
    if (!criarAgora) return;
    setCriando(true); setErroCriar(null);
    try {
      // o quadro, a lista e o Meu dia releem (o chamado novo aparece lá)
      const r = await depois(api.atendimento.rodarAgendado(criarAgora.id));
      setCriados((x) => ({ ...x, [criarAgora.id]: r.codigo }));
      toast.push('ok', `Chamado ${r.codigo} criado`);
      setCriarAgora(null);
      await recarregar();
    } catch (e) { setErroCriar(erroLegivel(e)); } finally { setCriando(false); }
  };
  const painelDoCriar = criarAgora ? paineis.find((p) => p.id === criarAgora.painelId) : undefined;

  return (
    <div className="flex flex-col gap-4 max-w-6xl">
      <CartaoAjuste
        icone={<CalendarClock size={18} />} titulo="Chamados agendados"
        situacao={lista.length > 0 && (
          <div className="flex flex-wrap gap-1" role="group" aria-label="Mostrar">
            {(['todos', 'ligados', 'desligados'] as const).map((v) => (
              <button key={v} type="button" aria-pressed={filtro === v} id={`agendados-filtro-${v}`} disabled={!contagem[v] && v !== 'todos'} onClick={() => setFiltro(v)}
                className={`px-2 py-0.5 rounded-md border text-[12.5px] disabled:opacity-40 ${filtro === v ? 'border-accent bg-accent-soft text-accent-ink font-semibold' : 'border-line text-muted hover:bg-surface-2'}`}>
                {v} <span className="tnum">{contagem[v]}</span>
              </button>
            ))}
          </div>
        )}
        acoes={<button type="button" className="btn-primary btn-sm" id="agendados-novo" disabled={!primeiro} onClick={() => setEditando({ id: null, f: formVazio(primeiro) })}><Plus size={15} /> Novo agendado</button>}
      >
        <Explicacao>
          <p>
            O chamado que nasce sozinho, na hora marcada (de Brasília), com o título, o relato, o cliente, o responsável e os passos do
            checklist que estiverem aqui — as mesmas regras de quem abre pela tela. "Criar agora" faz nascer na hora, sem mudar a próxima vez.
          </p>
        </Explicacao>
        {!lista.length ? (
          <div className="rounded-xl border border-dashed border-line-strong p-6 text-center" id="agendados-vazio">
            <div className="font-display font-semibold">Nenhum chamado agendado ainda</div>
            <p className="text-muted text-sm mt-1 max-w-md mx-auto">Exemplo — <b className="text-ink-2">a verificação dos DIDs em uso, todo dia 15.</b></p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              <button type="button" className="btn-primary" id="agendados-exemplo" disabled={!primeiro} onClick={() => setEditando({ id: null, f: formExemplo(primeiro) })}>Começar por este exemplo</button>
              <button type="button" className="btn-secondary" disabled={!primeiro} onClick={() => setEditando({ id: null, f: formVazio(primeiro) })}><Plus size={15} /> Um em branco</button>
            </div>
          </div>
        ) : (
          <TabelaAgendados lista={visiveis} paineis={paineis} mudando={mudando} erros={erros} criados={criados}
            onAbrir={(a) => setEditando({ id: a.id, f: formDe(a) })} onAlternar={(a, v) => void alternar(a, v)}
            onCriarAgora={(a) => { setErroCriar(null); setCriarAgora(a); }} />
        )}
      </CartaoAjuste>

      {editando && <EditorAgendado id={editando.id} inicial={editando.f} opcoes={opcoes.data} onFechar={() => setEditando(null)} />}

      {criarAgora && (
        <Confirmar
          open onClose={() => setCriarAgora(null)} onConfirm={() => void criar()} loading={criando} botao="Criar o chamado"
          titulo={`Criar agora "${criarAgora.titulo}"?`}
          texto={<>
            <p>
              O chamado nasce já no painel {painelDoCriar?.nome ?? '?'}, como nasceria na hora marcada
              {criarAgora.clienteNome ? `, para ${criarAgora.clienteNome}` : ''}{criarAgora.responsavelNome ? `, com ${criarAgora.responsavelNome}` : ''}.
              {' '}A próxima vez continua {criarAgora.ativo && criarAgora.proximaEm ? fmtProxima.format(new Date(criarAgora.proximaEm)) : 'como está'}.
            </p>
            <Resultado r={erroCriar ? { ok: false, mensagem: erroCriar } : null} />
          </>}
        />
      )}
    </div>
  );
}

function TabelaAgendados({ lista, paineis, mudando, erros, criados, onAbrir, onAlternar, onCriarAgora }: {
  lista: Agendado[]; paineis: Painel[]; mudando: string | null; erros: Record<string, string>; criados: Record<string, string>;
  onAbrir: (a: Agendado) => void; onAlternar: (a: Agendado, ativo: boolean) => void; onCriarAgora: (a: Agendado) => void;
}) {
  const o = useOrdenacaoLocal('proxima');
  const painelDe = (id: string) => paineis.find((p) => p.id === id);
  const ordenadas = ordenarLista(lista, o, {
    titulo: (a) => a.titulo, painel: (a) => painelDe(a.painelId)?.nome ?? null, regra: (a) => a.textoRegra,
    // o desligado não tem próxima vez: vai para o fim
    proxima: (a) => (a.ativo ? a.proximaEm : null), ultima: (a) => a.ultimaEm, ativo: (a) => (a.ativo ? 0 : 1),
  });
  const pag = usePaginaLocal(ordenadas, 50);
  if (!lista.length) return <p className="text-[13px] text-muted">Nenhum agendado com esse filtro.</p>;
  return (
    <>
      <div className="overflow-x-auto rounded-xl border border-line">
        {/* oito colunas: células mais justas, e o que pode quebrar quebra, para a linha caber inteira (com o "Criar agora") */}
        <table className="table [&_td]:px-2.5 [&_th]:px-2.5" id="agendados-lista">
          <thead>
            <tr>
              <ThN /><Th o={o} col="titulo">Chamado</Th><Th o={o} col="painel">Painel</Th><Th o={o} col="regra">Quando</Th>
              <Th o={o} col="proxima">Próxima vez</Th><Th o={o} col="ultima">Última vez</Th><Th o={o} col="ativo">Ligado</Th><th aria-label="Ações" />
            </tr>
          </thead>
          <tbody>
            {pag.visiveis.map((a, i) => {
              const painel = painelDe(a.painelId);
              const detalhes = [a.clienteNome, a.responsavelNome && `com ${a.responsavelNome}`, a.checklist.length ? `${a.checklist.length} ${a.checklist.length === 1 ? 'passo' : 'passos'}` : null].filter(Boolean);
              return (
                <tr key={a.id}>
                  <TdN n={pag.numero(i)} />
                  <td className="min-w-[180px] max-w-[300px]">
                    <button type="button" className={`font-semibold text-left hover:text-accent ${a.ativo ? '' : 'text-muted'}`} onClick={() => onAbrir(a)}>{a.titulo}</button>
                    {detalhes.length > 0 && <div className="text-[12px] text-muted">{detalhes.join(' · ')}</div>}
                  </td>
                  <td className="whitespace-nowrap">{painel ? <Chip tone={TOM_DO_PAINEL[painel.cor]}>{painel.nome}</Chip> : <Chip tone="muted">(painel removido)</Chip>}</td>
                  <td className="text-[13px] min-w-[110px]">{a.textoRegra}</td>
                  <td className="text-[13px] tnum min-w-[84px]">
                    {!a.ativo ? <span className="text-muted">desligado</span> : a.proximaEm ? (
                      <span className="inline-flex flex-wrap gap-x-1">
                        <span className="whitespace-nowrap">{fmtDia.format(new Date(a.proximaEm))}</span>
                        <span className="whitespace-nowrap">{fmtHora.format(new Date(a.proximaEm))}</span>
                      </span>
                    ) : <span className="text-muted">não nasce mais</span>}
                  </td>
                  <td className="text-[13px] min-w-[96px]">
                    {a.ultimaEm ? (
                      // a data e o código quebram em duas linhas quando falta espaço (a linha inteira cabe no cartão)
                      <span className="inline-flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                        <span className="tnum whitespace-nowrap">{dataHoraCurta(a.ultimaEm)}</span>
                        {a.ultimoCodigo && <CodigoChamado codigo={a.ultimoCodigo} cor={painel?.cor} />}
                      </span>
                    ) : <span className="text-muted">ainda não nasceu</span>}
                  </td>
                  <td className="whitespace-nowrap">
                    <span className="inline-flex items-center gap-1.5">
                      <Interruptor ligado={a.ativo} onChange={(v) => onAlternar(a, v)} rotulo={a.ativo ? `Desligar "${a.titulo}"` : `Ligar "${a.titulo}"`} desativado={mudando === a.id} />
                      {mudando === a.id && <Spinner />}
                    </span>
                    {erros[a.id] && <div className="text-bad text-[12px] mt-0.5 whitespace-normal max-w-[220px]" role="alert">{erros[a.id]}</div>}
                  </td>
                  <td className="text-right whitespace-nowrap">
                    <span className="inline-flex items-center gap-1">
                      <button type="button" className="btn-secondary btn-sm" onClick={() => onCriarAgora(a)} title="Cria o chamado já (a próxima vez continua a mesma)"><Play size={13} /> Criar agora</button>
                      <button type="button" className="btn-ghost btn-sm" onClick={() => onAbrir(a)} aria-label={`Editar ${a.titulo}`} title="Editar"><Pencil size={14} /></button>
                    </span>
                    {criados[a.id] && (
                      <div className="text-[12.5px] text-ok mt-1 flex items-center justify-end gap-1.5" role="status">criou agora <CodigoChamado codigo={criados[a.id]!} cor={painel?.cor} /></div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {pag.rodape}
    </>
  );
}

// ---------- o editor ----------

const HORAS = Array.from({ length: 24 }, (_, h) => String(h).padStart(2, '0'));
const MINUTOS = Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, '0'));
const DIAS_CURTOS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
/** A semana começa na segunda (como a equipe pensa); o valor continua 0 = domingo. */
const ORDEM_DA_SEMANA = [1, 2, 3, 4, 5, 6, 0];

function EditorAgendado({ id, inicial, opcoes, onFechar }: { id: string | null; inicial: Form; opcoes: OpcoesAtendimento | undefined; onFechar: () => void }) {
  const qc = useQueryClient(); const toast = useToast();
  const [f, setF] = useState<Form>(inicial);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [lixeira, setLixeira] = useState(false);
  const [apagando, setApagando] = useState(false);
  const [erroLixeira, setErroLixeira] = useState<string | null>(null);
  const [focar, setFocar] = useState<string | null>(null);
  const clientes = useQuery({
    queryKey: ['atendimento', 'ajustes', 'clientes'], staleTime: 5 * 60_000,
    // os internos também: um agendado pode ser da própria Ingline
    queryFn: async () => (await api.clients.options({ includeInternal: true })).map((c) => ({ id: c.id, nome: c.name, dica: c.isInternal ? 'interno' : undefined })),
  });
  // o passo novo já nasce com o cursor dentro
  useEffect(() => {
    if (!focar) return;
    document.querySelector<HTMLInputElement>(`[data-passo="${focar}"]`)?.focus();
    setFocar(null);
  }, [focar]);

  const paineis = opcoes?.paineis ?? [];
  const painel = paineis.find((p) => p.id === f.painelId);
  const todosAssuntos = opcoes?.assuntos ?? [];
  const assuntos = useMemo(
    () => emOrdemDeArvore(todosAssuntos.filter((a) => a.painelId === f.painelId))
      .filter((a) => a.ativo || a.id === f.assuntoId)
      .map((a) => ({ id: a.id, nome: `${caminhoDoAssunto(a.id, todosAssuntos)}${a.ativo ? '' : ' (desativado)'}` })),
    [todosAssuntos, f.painelId, f.assuntoId],
  );
  const pessoas = (opcoes?.pessoas ?? []).filter((p) => p.ativo || p.id === f.responsavelId);
  const mudar = (m: Partial<Form>) => { setF((x) => ({ ...x, ...m })); setErro(null); };
  const mudarRegra = (m: Partial<RegraAgendado>) => setF((x) => ({ ...x, regra: { ...x.regra, ...m } }));
  /** Outro painel: o assunto é do painel, então sai. */
  const trocarPainel = (painelId: string) => mudar({ painelId, assuntoId: '' });
  const r = f.regra;
  const { problema, proxima } = lerRegra(r, opcoes, f.ativo);

  const incluirPasso = (depoisDe?: number) => {
    const novo = { id: novoId(), texto: '' };
    setF((x) => { const ps = [...x.passos]; ps.splice(depoisDe === undefined ? ps.length : depoisDe + 1, 0, novo); return { ...x, passos: ps }; });
    setFocar(novo.id);
  };

  const recarregar = () => Promise.all([qc.invalidateQueries({ queryKey: CHAVE }), qc.invalidateQueries({ queryKey: ['atendimento', 'meu-dia'] })]);
  const salvar = async () => {
    const falta = !f.painelId ? 'Escolha o painel em que o chamado nasce.'
      : f.titulo.trim().length < 3 ? 'Escreva o título do chamado (pelo menos 3 letras).'
        : problema;
    if (falta) { setErro(falta); return; }
    setSalvando(true); setErro(null);
    try {
      const a = await api.atendimento.salvarAgendado(id, paraEntrada(f));
      await recarregar();
      toast.push('ok', a.ativo && a.proximaEm ? `Agendado salvo: nasce ${fmtProxima.format(new Date(a.proximaEm))}` : `Agendado "${a.titulo}" salvo (desligado)`);
      onFechar();
    } catch (e) { setErro(erroLegivel(e)); } finally { setSalvando(false); }
  };
  const apagar = async () => {
    if (!id) return;
    setApagando(true); setErroLixeira(null);
    try {
      await api.atendimento.removerAgendado(id);
      await recarregar();
      toast.push('ok', `Agendado "${inicial.titulo}" foi para a lixeira`);
      onFechar();
    } catch (e) { setErroLixeira(erroLegivel(e)); } finally { setApagando(false); }
  };

  const botaoFrequencia = 'px-3 py-1.5 rounded-lg border text-[13px] font-semibold';
  return (
    <Modal
      open onClose={onFechar} largura="max-w-2xl" titulo={id ? `Agendado: ${inicial.titulo}` : 'Novo chamado agendado'}
      rodape={<>
        {erro && <Resultado r={{ ok: false, mensagem: erro }} className="w-full" />}
        {id && <button type="button" className="btn-ghost text-bad mr-auto" id="agendado-lixeira" onClick={() => { setErroLixeira(null); setLixeira(true); }}><Trash2 size={15} /> Mandar para a lixeira</button>}
        <button type="button" className="btn-secondary" onClick={onFechar}>Cancelar</button>
        <button type="submit" form="form-agendado" className="btn-primary" id="agendado-salvar" disabled={salvando}>{salvando ? <Spinner className="text-white" /> : 'Salvar'}</button>
      </>}
    >
      <form id="form-agendado" autoComplete="off" className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); void salvar(); }}>
        <div className="grid gap-3 grid-cols-1 sm:grid-cols-2">
          <Campo label="Painel" className="min-w-0">
            <select className="input" id="agendado-painel" value={f.painelId} onChange={(e) => trocarPainel(e.target.value)}>
              {!f.painelId && <option value="">Escolha…</option>}
              {paineis.map((p) => <option key={p.id} value={p.id} disabled={!p.ativo && p.id !== f.painelId}>{p.nome} ({p.sigla}){p.ativo ? '' : ' — desativado'}</option>)}
            </select>
          </Campo>
          <Campo label="Prioridade" className="min-w-0">
            <select className="input" id="agendado-prioridade" value={f.prioridade} onChange={(e) => mudar({ prioridade: e.target.value as Form['prioridade'] })}>
              <option value="">Sem prioridade</option>
              {PRIORIDADES.map((p) => <option key={p} value={p}>{NOME_PRIORIDADE[p]}</option>)}
            </select>
          </Campo>
          <Campo label="Título" className="sm:col-span-2 min-w-0">
            <input className="input" id="agendado-titulo" maxLength={200} placeholder="ex.: Verificação dos DIDs em uso" autoFocus={!id} value={f.titulo} onChange={(e) => mudar({ titulo: e.target.value })} />
          </Campo>
          <Campo label="Relato (opcional)" dica="o que o chamado pede, como se alguém tivesse escrito ao abrir" className="sm:col-span-2 min-w-0">
            <textarea className="input text-[13.5px]" id="agendado-relato" rows={3} maxLength={5000} value={f.relato} onChange={(e) => mudar({ relato: e.target.value })} />
          </Campo>
          <Campo label="Cliente (opcional)" className="min-w-0">
            <EscolherComBusca id="agendado-cliente" rotulo="Cliente" className="input w-full" valor={f.clienteId} vazio="Sem cliente" placeholder={clientes.isLoading ? 'Carregando…' : 'Sem cliente'}
              procurar="Procurar o cliente…" opcoes={clientes.data ?? []} onChange={(v) => mudar({ clienteId: v })} />
          </Campo>
          <Campo label="Responsável" className="min-w-0">
            <select className="input" id="agendado-responsavel" value={f.responsavelId} onChange={(e) => mudar({ responsavelId: e.target.value })}>
              <option value="">Ninguém (cai na entrada, sem dono)</option>
              {pessoas.map((p) => <option key={p.id} value={p.id}>{p.nome}{p.ativo ? '' : ' (desativado)'}</option>)}
            </select>
          </Campo>
          {/* o painel sem assunto (desligado em Ajustes › Campos) não mostra a escolha */}
          {(!painel || campoLigado(painel.ajustes, 'assunto')) && (
            <Campo label="Assunto (opcional)" dica={painel ? `os assuntos do painel ${painel.nome}` : undefined} className="sm:col-span-2 min-w-0">
              <EscolherComBusca id="agendado-assunto" rotulo="Assunto" className="input w-full" largura="w-[420px]" valor={f.assuntoId} vazio="Sem assunto"
                placeholder={assuntos.length ? 'Sem assunto' : 'O painel ainda não tem assuntos'} procurar="Procurar o assunto…" opcoes={assuntos} onChange={(v) => mudar({ assuntoId: v })} />
            </Campo>
          )}
        </div>

        <div className="min-w-0">
          <span className="label">Checklist (os passos)</span>
          <div className="flex flex-col gap-1.5" id="agendado-passos">
            {f.passos.map((p, i) => (
              <div key={p.id} className="flex items-center gap-1.5 min-w-0">
                <span className="w-5 shrink-0 text-right text-[12px] text-muted tnum">{i + 1}</span>
                <input className="input py-1.5 min-w-0" data-passo={p.id} maxLength={160} aria-label={`Passo ${i + 1}`} placeholder="ex.: Conferir os DIDs em uso"
                  value={p.texto} onChange={(e) => setF((x) => ({ ...x, passos: x.passos.map((y) => (y.id === p.id ? { ...y, texto: e.target.value } : y)) }))}
                  // Enter cria o passo seguinte (e não salva a janela no meio da lista)
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); if (f.passos.length < 30) incluirPasso(i); } }} />
                <button type="button" className="btn-ghost btn-sm shrink-0" aria-label={`Tirar o passo ${i + 1}`} title="Tirar o passo"
                  onClick={() => setF((x) => ({ ...x, passos: x.passos.filter((y) => y.id !== p.id) }))}><X size={14} /></button>
              </div>
            ))}
            {!f.passos.length && <p className="text-[12.5px] text-muted">Sem passos: o chamado nasce só com o checklist do assunto (se houver).</p>}
            <button type="button" className="btn-secondary btn-sm self-start" id="agendado-incluir-passo" disabled={f.passos.length >= 30} onClick={() => incluirPasso()}><Plus size={14} /> Incluir passo</button>
          </div>
        </div>

        <fieldset className="rounded-xl border border-line p-3 pt-1 flex flex-col gap-3 min-w-0">
          <legend className="px-1 text-[13px] font-semibold text-ink-2">Quando nasce</legend>
          <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Frequência">
            {FREQUENCIAS.map((fr) => (
              <button key={fr} type="button" role="radio" aria-checked={r.frequencia === fr} id={`agendado-freq-${fr}`}
                className={`${botaoFrequencia} ${r.frequencia === fr ? 'border-accent bg-accent-soft text-accent-ink' : 'border-line text-ink-2 hover:bg-surface-2'}`}
                onClick={() => { mudarRegra({ frequencia: fr, ...(fr === 'uma_vez' && !r.data ? { data: amanha() } : {}) }); setErro(null); }}>
                {NOME_FREQUENCIA[fr]}
              </button>
            ))}
          </div>

          {r.frequencia === 'diaria' && (
            <label className="flex items-start gap-2 text-sm cursor-pointer">
              <input type="checkbox" id="agendado-dias-atendimento" className="mt-1 w-4 h-4 shrink-0" checked={r.soDiasDeAtendimento} onChange={(e) => mudarRegra({ soDiasDeAtendimento: e.target.checked })} />
              <span>Só nos dias de atendimento <span className="block text-[12.5px] text-muted">pula o fim de semana e os feriados sem atendimento (aba Prazos)</span></span>
            </label>
          )}
          {r.frequencia === 'semanal' && (
            <div className="min-w-0">
              <span className="label">Os dias</span>
              <div className="flex flex-wrap items-center gap-1" role="group" aria-label="Os dias da semana">
                {ORDEM_DA_SEMANA.map((d) => {
                  const marcado = r.dias.includes(d);
                  return (
                    <button key={d} type="button" aria-pressed={marcado} title={NOMES_DOS_DIAS[d]} id={`agendado-dia-${d}`}
                      onClick={() => mudarRegra({ dias: marcado ? r.dias.filter((x) => x !== d) : [...r.dias, d] })}
                      className={`w-11 py-1.5 rounded-lg border text-[13px] font-semibold ${marcado ? 'border-accent bg-accent-soft text-accent-ink' : 'border-line bg-surface text-muted hover:text-ink'}`}>
                      {DIAS_CURTOS[d]}
                    </button>
                  );
                })}
                <button type="button" className="btn-ghost btn-sm" onClick={() => mudarRegra({ dias: [1, 2, 3, 4, 5] })}>dias úteis</button>
              </div>
            </div>
          )}
          {r.frequencia === 'mensal' && (
            <Campo label="O dia do mês" dica="31 = o último dia (em mês mais curto, nasce no último dia)" className="min-w-0">
              <select className="input w-[110px]" id="agendado-dia-mes" value={r.diaDoMes ?? 1} onChange={(e) => mudarRegra({ diaDoMes: Number(e.target.value) })}>
                {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => <option key={d} value={d}>dia {d}</option>)}
              </select>
            </Campo>
          )}
          {r.frequencia === 'uma_vez' && (
            <Campo label="A data" className="min-w-0">
              <input type="date" className="input w-[180px]" id="agendado-data" min={diaBrasil(new Date())} value={r.data ?? ''} onChange={(e) => mudarRegra({ data: e.target.value || null })} />
            </Campo>
          )}

          <div>
            <span className="label">A hora (de Brasília)</span>
            <div className="flex items-center gap-1">
              <select className="input w-[76px]" id="agendado-hora" aria-label="Hora" value={r.hora.slice(0, 2)} onChange={(e) => mudarRegra({ hora: `${e.target.value}:${r.hora.slice(3, 5)}` })}>
                {HORAS.map((h) => <option key={h} value={h}>{h}</option>)}
              </select>
              <span className="font-semibold">:</span>
              <select className="input w-[76px]" id="agendado-minuto" aria-label="Minuto" value={r.hora.slice(3, 5)} onChange={(e) => mudarRegra({ hora: `${r.hora.slice(0, 2)}:${e.target.value}` })}>
                {[...new Set([...MINUTOS, r.hora.slice(3, 5)])].sort().map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
          </div>

          <p className={`text-[13px] rounded-lg p-2.5 ${problema ? 'bg-signal-soft text-ink' : 'bg-surface-2 text-ink-2'}`} id="agendado-quando" aria-live="polite">
            {problema ?? <>Nasce <b>{textoDaRegra(regraLimpa(r)).toLowerCase()}</b>
              {f.ativo ? <>{' '}· a próxima vez: <b className="tnum">{proxima ? fmtProxima.format(proxima) : '—'}</b></> : ' · desligado: não nasce até ligar'}</>}
          </p>
        </fieldset>

        <label className="flex items-center gap-2.5 text-sm cursor-pointer">
          <Toggle checked={f.ativo} onChange={(v) => mudar({ ativo: v })} />
          {f.ativo ? 'Ligado: nasce sozinho na hora marcada' : 'Desligado: fica guardado e não nasce'}
        </label>
      </form>

      {lixeira && (
        <Confirmar
          open onClose={() => setLixeira(false)} onConfirm={() => void apagar()} loading={apagando} perigoso botao="Mandar para a lixeira"
          titulo={`Mandar "${inicial.titulo}" para a lixeira?`}
          texto={<>
            <p>O agendado para de criar chamados e sai desta lista; não volta pela tela. Os chamados que ele já criou continuam. Se é só por um tempo, desligue em vez de apagar.</p>
            <Resultado r={erroLixeira ? { ok: false, mensagem: erroLixeira } : null} />
          </>}
        />
      )}
    </Modal>
  );
}
