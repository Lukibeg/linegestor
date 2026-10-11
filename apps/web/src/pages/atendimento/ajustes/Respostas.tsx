/**
 * Chamados › Ajustes (Patch 1.10) — Respostas prontas.
 *
 * Um clique na ficha do chamado manda o texto e muda o chamado. A resposta pronta junta o texto (com os
 * marcadores do chamado: {contato}, {codigo}, {cliente}…) e o que ela faz: manda ao cliente pelo
 * WhatsApp (senão o texto vira anotação), marca a espera, põe a etiqueta, quem usa assume, move para
 * uma etapa. O exemplo de sempre: "Pedir teste ao cliente" manda o texto e marca que o chamado espera o
 * cliente (o prazo para enquanto ele não responde).
 *
 * A resposta de um painel só aparece nos chamados dele; a de todos os painéis, em todos — e por isso só
 * a de um painel pode mover o chamado (a etapa é de um painel só; o servidor recusa o resto).
 */
import { useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, Trash2, Zap } from 'lucide-react';
import {
  NOME_ESPERA, preencherModelo,
  type AcaoResposta, type OpcoesAtendimento, type Painel, type RespostaPronta, type RespostaProntaGravarEntrada,
} from '@gestor/shared';
import { api } from '../../../api/index.js';
import { Campo, Carregando, Chip, Confirmar, Modal, Spinner, Toggle, mensagemErro, usePaginaLocal, useToast } from '../../../components/ui/index.js';
import { useAuth } from '../../../lib/auth.js';
import { TdN, ThN } from '../../../lib/contagem.js';
import { ordenarLista, Th, useOrdenacaoLocal } from '../../../lib/ordenacao.js';
import { TOM_DO_PAINEL, useOpcoes } from '../comum.js';
import { BalaoDeMensagem, CartaoAjuste, Explicacao, Marcadores, Resultado, erroLegivel, type Marcador } from './Avisos.js';

const CHAVE = ['atendimento', 'ajustes', 'respostas'];

/** Os marcadores que o servidor preenche quando alguém usa a resposta num chamado. */
const MARCADORES: Marcador[] = [
  { chave: 'contato', dica: 'o nome do contato' },
  { chave: 'codigo', dica: 'o código (SUP-12)' },
  { chave: 'cliente', dica: 'a empresa' },
  { chave: 'titulo', dica: 'o título do chamado' },
  { chave: 'responsavel', dica: 'quem está com o chamado' },
  { chave: 'eu', dica: 'quem usa a resposta' },
];

type Esperar = '' | 'cliente' | 'operadora' | 'nada';
const ESPERAS: Array<{ v: Esperar; nome: string }> = [
  { v: '', nome: 'Não mexe na espera' },
  { v: 'cliente', nome: 'Esperando o cliente (o prazo para)' },
  { v: 'operadora', nome: 'Esperando a operadora' },
  { v: 'nada', nome: 'Tira a marca de espera' },
];

type Form = { nome: string; painelId: string; texto: string; avisarCliente: boolean; etapaId: string; esperar: Esperar; etiqueta: string; assumir: boolean; ativa: boolean };

const VAZIA: Form = { nome: '', painelId: '', texto: '', avisarCliente: false, etapaId: '', esperar: '', etiqueta: '', assumir: false, ativa: true };
/** O exemplo do estado vazio (o mais pedido pela equipe), para começar a lista com um clique. */
const EXEMPLO: Form = {
  ...VAZIA, nome: 'Pedir teste ao cliente', avisarCliente: true, esperar: 'cliente',
  texto: 'Olá, {contato}! Fizemos um ajuste no seu chamado {codigo}. Pode testar e nos dizer se ficou tudo certo?',
};

const formDe = (r: RespostaPronta): Form => ({
  nome: r.nome, painelId: r.painelId ?? '', texto: r.texto, avisarCliente: r.acao.avisarCliente, etapaId: r.acao.etapaId ?? '',
  esperar: r.acao.esperar ?? '', etiqueta: r.acao.etiqueta ?? '', assumir: r.acao.assumir, ativa: r.ativa,
});

const acaoDe = (f: Form): AcaoResposta => ({
  avisarCliente: f.avisarCliente,
  // sem painel não há etapa (ela é de um painel só)
  etapaId: f.painelId && f.etapaId ? f.etapaId : null,
  esperar: f.esperar || null, etiqueta: f.etiqueta.trim() || null, assumir: f.assumir,
});

const paraEntrada = (f: Form): RespostaProntaGravarEntrada => ({ nome: f.nome.trim(), texto: f.texto.trim(), painelId: f.painelId || null, ativa: f.ativa, acao: acaoDe(f) });

/** O que a resposta faz, em palavras — a lista e o editor dizem igual. */
function oQueFaz(r: { texto: string; acao: AcaoResposta }, painel: Painel | undefined): string {
  const partes: string[] = [];
  if (r.acao.avisarCliente) partes.push('manda ao cliente pelo WhatsApp');
  // sem texto, não há o que anotar (o servidor também não anota)
  else if (r.texto.trim()) partes.push('anota no chamado');
  if (r.acao.esperar === 'cliente' || r.acao.esperar === 'operadora') partes.push(`marca: ${NOME_ESPERA[r.acao.esperar].toLowerCase()}`);
  else if (r.acao.esperar === 'nada') partes.push('tira a marca de espera');
  if (r.acao.etiqueta) partes.push(`põe a etiqueta "${r.acao.etiqueta}"`);
  if (r.acao.assumir) partes.push('quem usa assume');
  if (r.acao.etapaId) partes.push(`move para ${painel?.etapas.find((e) => e.id === r.acao.etapaId)?.nome ?? 'uma etapa que saiu do painel'}`);
  const t = partes.join(' · ') || 'nada ainda';
  return t[0]!.toUpperCase() + t.slice(1);
}

type Filtro = 'todas' | 'ativas' | 'desativadas';

export function AjustesRespostas() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: CHAVE, queryFn: () => api.atendimento.respostas() });
  const opcoes = useOpcoes();
  const [editando, setEditando] = useState<{ id: string | null; f: Form } | null>(null);
  const [filtro, setFiltro] = useState<Filtro>('todas');
  const [mudando, setMudando] = useState<string | null>(null);
  const [erros, setErros] = useState<Record<string, string>>({});

  if (q.isLoading || opcoes.isLoading) return <Carregando />;
  if (q.isError || !q.data) return <p className="text-bad text-sm" role="alert">{mensagemErro(q.error)}</p>;
  const lista = q.data;
  const paineis = opcoes.data?.paineis ?? [];
  const ativas = lista.filter((r) => r.ativa).length;
  const contagem: Record<Filtro, number> = { todas: lista.length, ativas, desativadas: lista.length - ativas };
  const visiveis = lista.filter((r) => filtro === 'todas' || (filtro === 'ativas') === r.ativa);

  /** Ligar ou desligar direto da lista (vai o resto como está). */
  const alternar = async (r: RespostaPronta, ativa: boolean) => {
    setMudando(r.id); setErros(({ [r.id]: _, ...resto }) => resto);
    try {
      await api.atendimento.salvarResposta(r.id, paraEntrada({ ...formDe(r), ativa }));
      // a ficha lê as ativas nas opções do módulo
      await Promise.all([qc.invalidateQueries({ queryKey: CHAVE }), qc.invalidateQueries({ queryKey: ['atendimento', 'opcoes'] })]);
    } catch (e) { setErros((x) => ({ ...x, [r.id]: erroLegivel(e) })); } finally { setMudando(null); }
  };

  return (
    <div className="flex flex-col gap-4 max-w-5xl">
      <CartaoAjuste
        icone={<Zap size={18} />} titulo="Respostas prontas"
        situacao={lista.length > 0 && (
          <div className="flex flex-wrap gap-1" role="group" aria-label="Mostrar">
            {(['todas', 'ativas', 'desativadas'] as const).map((v) => (
              <button key={v} type="button" aria-pressed={filtro === v} id={`respostas-filtro-${v}`} disabled={!contagem[v] && v !== 'todas'} onClick={() => setFiltro(v)}
                className={`px-2 py-0.5 rounded-md border text-[12.5px] disabled:opacity-40 ${filtro === v ? 'border-accent bg-accent-soft text-accent-ink font-semibold' : 'border-line text-muted hover:bg-surface-2'}`}>
                {v === 'todas' ? 'todas' : v} <span className="tnum">{contagem[v]}</span>
              </button>
            ))}
          </div>
        )}
        acoes={<button type="button" className="btn-primary btn-sm" id="respostas-nova" onClick={() => setEditando({ id: null, f: VAZIA })}><Plus size={15} /> Nova resposta</button>}
      >
        <Explicacao>
          <p>
            Um clique na ficha do chamado manda o texto e muda o chamado. A resposta de um painel só aparece nos chamados dele; a de
            todos os painéis, em todos. Desativada, some da ficha e fica guardada aqui.
          </p>
        </Explicacao>
        {!lista.length ? (
          <div className="rounded-xl border border-dashed border-line-strong p-6 text-center" id="respostas-vazio">
            <div className="font-display font-semibold">Nenhuma resposta pronta ainda</div>
            <p className="text-muted text-sm mt-1 max-w-md mx-auto">
              Exemplo — <b className="text-ink-2">Pedir teste ao cliente</b>: manda o texto e marca que o chamado espera o cliente.
            </p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              <button type="button" className="btn-primary" id="respostas-exemplo" onClick={() => setEditando({ id: null, f: EXEMPLO })}>Começar por este exemplo</button>
              <button type="button" className="btn-secondary" onClick={() => setEditando({ id: null, f: VAZIA })}><Plus size={15} /> Uma em branco</button>
            </div>
          </div>
        ) : (
          <TabelaRespostas lista={visiveis} paineis={paineis} mudando={mudando} erros={erros}
            onAbrir={(r) => setEditando({ id: r.id, f: formDe(r) })} onAlternar={(r, v) => void alternar(r, v)} />
        )}
      </CartaoAjuste>
      {editando && <EditorResposta id={editando.id} inicial={editando.f} opcoes={opcoes.data} onFechar={() => setEditando(null)} />}
    </div>
  );
}

function TabelaRespostas({ lista, paineis, mudando, erros, onAbrir, onAlternar }: {
  lista: RespostaPronta[]; paineis: Painel[]; mudando: string | null; erros: Record<string, string>;
  onAbrir: (r: RespostaPronta) => void; onAlternar: (r: RespostaPronta, ativa: boolean) => void;
}) {
  const o = useOrdenacaoLocal('nome');
  const painelDe = (id: string | null) => (id ? paineis.find((p) => p.id === id) : undefined);
  const ordenadas = ordenarLista(lista, o, {
    nome: (r) => r.nome,
    painel: (r) => (r.painelId ? painelDe(r.painelId)?.nome ?? '(painel removido)' : 'Todos os painéis'),
    faz: (r) => oQueFaz(r, painelDe(r.painelId)),
    ativa: (r) => (r.ativa ? 0 : 1),
  });
  const pag = usePaginaLocal(ordenadas, 50);
  if (!lista.length) return <p className="text-[13px] text-muted">Nenhuma resposta com esse filtro.</p>;
  return (
    <>
      <div className="overflow-x-auto rounded-xl border border-line">
        <table className="table" id="respostas-lista">
          <thead>
            <tr><ThN /><Th o={o} col="nome">Nome</Th><Th o={o} col="painel">Vale em</Th><Th o={o} col="faz">O que faz</Th><Th o={o} col="ativa">Ativa</Th><th aria-label="Ações" /></tr>
          </thead>
          <tbody>
            {pag.visiveis.map((r, i) => {
              const painel = painelDe(r.painelId);
              return (
                <tr key={r.id}>
                  <TdN n={pag.numero(i)} />
                  <td className="min-w-[190px] max-w-[340px]">
                    <button type="button" className={`font-semibold text-left hover:text-accent ${r.ativa ? '' : 'text-muted'}`} onClick={() => onAbrir(r)}>{r.nome}</button>
                    {r.texto && <div className="text-[12px] text-muted line-clamp-1" title={r.texto}>{r.texto}</div>}
                  </td>
                  <td className="whitespace-nowrap">
                    {r.painelId ? <Chip tone={painel ? TOM_DO_PAINEL[painel.cor] : 'muted'}>{painel?.nome ?? '(painel removido)'}</Chip> : <Chip tone="neutral">Todos os painéis</Chip>}
                  </td>
                  <td className="text-[13px] min-w-[230px]">{oQueFaz(r, painel)}</td>
                  <td className="whitespace-nowrap">
                    <span className="inline-flex items-center gap-1.5">
                      <Toggle checked={r.ativa} onChange={(v) => onAlternar(r, v)} label={r.ativa ? 'ativa' : 'desativada'} />
                      {mudando === r.id && <Spinner />}
                    </span>
                    {erros[r.id] && <div className="text-bad text-[12px] mt-0.5 whitespace-normal max-w-[260px]" role="alert">{erros[r.id]}</div>}
                  </td>
                  <td className="text-right whitespace-nowrap">
                    <button type="button" className="btn-ghost btn-sm" onClick={() => onAbrir(r)} aria-label={`Editar ${r.nome}`}><Pencil size={14} /> Editar</button>
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

function EditorResposta({ id, inicial, opcoes, onFechar }: { id: string | null; inicial: Form; opcoes: OpcoesAtendimento | undefined; onFechar: () => void }) {
  const qc = useQueryClient(); const toast = useToast(); const { user } = useAuth();
  const [f, setF] = useState<Form>(inicial);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [lixeira, setLixeira] = useState(false);
  const [apagando, setApagando] = useState(false);
  const [erroLixeira, setErroLixeira] = useState<string | null>(null);
  const texto = useRef<HTMLTextAreaElement>(null);
  const paineis = opcoes?.paineis ?? [];
  const painel = paineis.find((p) => p.id === f.painelId);
  const mudar = (m: Partial<Form>) => { setF((x) => ({ ...x, ...m })); setErro(null); };
  /** Outro painel: a etapa escolhida só fica se também for dele. */
  const trocarPainel = (painelId: string) => {
    const p = paineis.find((x) => x.id === painelId);
    mudar({ painelId, etapaId: p?.etapas.some((e) => e.id === f.etapaId) ? f.etapaId : '' });
  };
  const previa = preencherModelo(f.texto, {
    contato: 'Maria', codigo: `${painel?.sigla ?? 'SUP'}-12`, cliente: 'Clínica Aurora', titulo: 'Ligações de saída não completam',
    responsavel: 'José Prado', eu: user?.name ?? 'Você',
  });
  const recarregar = () => Promise.all([qc.invalidateQueries({ queryKey: CHAVE }), qc.invalidateQueries({ queryKey: ['atendimento', 'opcoes'] })]);

  const salvar = async () => {
    if (!f.nome.trim()) { setErro('Dê um nome à resposta: é o que aparece no botão da ficha (ex.: Pedir teste ao cliente).'); return; }
    setSalvando(true); setErro(null);
    try {
      const r = await api.atendimento.salvarResposta(id, paraEntrada(f));
      await recarregar();
      toast.push('ok', id ? `Resposta "${r.nome}" salva` : `Resposta "${r.nome}" criada`);
      onFechar();
    } catch (e) { setErro(erroLegivel(e)); } finally { setSalvando(false); }
  };
  const apagar = async () => {
    if (!id) return;
    setApagando(true); setErroLixeira(null);
    try {
      await api.atendimento.removerResposta(id);
      await recarregar();
      toast.push('ok', `Resposta "${inicial.nome}" foi para a lixeira`);
      onFechar();
    } catch (e) { setErroLixeira(erroLegivel(e)); } finally { setApagando(false); }
  };

  return (
    <Modal
      open onClose={onFechar} largura="max-w-2xl" titulo={id ? `Resposta pronta: ${inicial.nome}` : 'Nova resposta pronta'}
      rodape={<>
        {erro && <Resultado r={{ ok: false, mensagem: erro }} className="w-full" />}
        {id && <button type="button" className="btn-ghost text-bad mr-auto" id="resposta-lixeira" onClick={() => { setErroLixeira(null); setLixeira(true); }}><Trash2 size={15} /> Mandar para a lixeira</button>}
        <button type="button" className="btn-secondary" onClick={onFechar}>Cancelar</button>
        <button type="submit" form="form-resposta" className="btn-primary" id="resposta-salvar" disabled={salvando}>{salvando ? <Spinner className="text-white" /> : 'Salvar'}</button>
      </>}
    >
      <form id="form-resposta" autoComplete="off" className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); void salvar(); }}>
        <div className="grid gap-3 grid-cols-1 sm:grid-cols-[minmax(0,1fr)_220px]">
          <Campo label="Nome" dica="o que aparece no botão da ficha" className="min-w-0">
            <input className="input" id="resposta-nome" maxLength={60} placeholder="ex.: Pedir teste ao cliente" autoFocus value={f.nome} onChange={(e) => mudar({ nome: e.target.value })} />
          </Campo>
          <Campo label="Vale em" className="min-w-0">
            <select className="input" id="resposta-painel" value={f.painelId} onChange={(e) => trocarPainel(e.target.value)}>
              <option value="">Todos os painéis</option>
              {paineis.map((p) => <option key={p.id} value={p.id}>{p.nome} ({p.sigla}){p.ativo ? '' : ' — desativado'}</option>)}
            </select>
          </Campo>
        </div>

        <div className="flex flex-col gap-2 min-w-0">
          <span className="label mb-0">O texto</span>
          <Marcadores marcadores={MARCADORES} campo={texto} valor={f.texto} onChange={(v) => mudar({ texto: v })} />
          <textarea ref={texto} className="input text-[13.5px]" id="resposta-texto" rows={5} maxLength={3000} aria-label="O texto da resposta"
            placeholder="Olá, {contato}! …" value={f.texto} onChange={(e) => mudar({ texto: e.target.value })} />
          <div>
            <div className="eyebrow mb-1.5">Prévia, com um exemplo</div>
            <BalaoDeMensagem texto={previa} vazio="sem texto: a resposta só faz o que está marcado abaixo" />
          </div>
        </div>

        <fieldset className="rounded-xl border border-line p-3 pt-1 flex flex-col gap-3 min-w-0">
          <legend className="px-1 text-[13px] font-semibold text-ink-2">O que ela faz no chamado</legend>
          <label className="flex items-start gap-2 text-sm cursor-pointer">
            <input type="checkbox" id="resposta-avisar" className="mt-1 w-4 h-4 shrink-0" checked={f.avisarCliente} onChange={(e) => mudar({ avisarCliente: e.target.checked })} />
            <span className="min-w-0">
              Manda o texto ao cliente pelo WhatsApp
              <span className="block text-[12.5px] text-muted">desmarcado, o texto vira uma anotação no chamado (o cliente não vê)</span>
            </span>
          </label>
          {f.avisarCliente && opcoes && !opcoes.whatsapp.cliente && (
            <p className="text-[12.5px] text-signal sm:pl-6 -mt-1.5">O WhatsApp para o cliente ainda não está pronto (aba Avisos e WhatsApp): até lá, esta resposta não consegue mandar.</p>
          )}
          {f.avisarCliente && !f.texto.trim() && (
            <p className="text-[12.5px] text-signal sm:pl-6 -mt-1.5">Sem texto, não há o que mandar: escreva a mensagem acima.</p>
          )}
          <div className="grid gap-3 grid-cols-1 sm:grid-cols-2">
            <Campo label="Marca a espera" className="min-w-0">
              <select className="input" id="resposta-esperar" value={f.esperar} onChange={(e) => mudar({ esperar: e.target.value as Esperar })}>
                {ESPERAS.map((x) => <option key={x.v} value={x.v}>{x.nome}</option>)}
              </select>
            </Campo>
            <Campo label="Põe a etiqueta" dica="vazio = não põe" className="min-w-0">
              <input className="input" id="resposta-etiqueta" maxLength={40} list="resposta-etiquetas" placeholder="ex.: aguardando teste" value={f.etiqueta} onChange={(e) => mudar({ etiqueta: e.target.value })} />
              <datalist id="resposta-etiquetas">{(opcoes?.etiquetas ?? []).map((t) => <option key={t} value={t} />)}</datalist>
            </Campo>
            <Campo label="Move para a etapa" className="sm:col-span-2 min-w-0"
              dica={painel ? 'vazio = o chamado fica onde está' : 'escolha um painel em "Vale em" para mover: a etapa é de um painel só'}>
              <select className="input" id="resposta-etapa" disabled={!painel} value={painel ? f.etapaId : ''} onChange={(e) => mudar({ etapaId: e.target.value })}>
                <option value="">Não move</option>
                {painel?.etapas.map((e) => <option key={e.id} value={e.id}>{e.nome}{e.nivel ? ` (nível ${e.nivel})` : ''}</option>)}
              </select>
            </Campo>
          </div>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" id="resposta-assumir" className="w-4 h-4 shrink-0" checked={f.assumir} onChange={(e) => mudar({ assumir: e.target.checked })} />
            Quem usa assume o chamado
          </label>
        </fieldset>

        <div className="flex flex-col gap-1.5">
          <label className="flex items-center gap-2.5 text-sm cursor-pointer">
            <Toggle checked={f.ativa} onChange={(v) => mudar({ ativa: v })} />
            {f.ativa ? 'Ativa: aparece na ficha dos chamados' : 'Desativada: some da ficha e fica guardada aqui'}
          </label>
          <p className="text-[12.5px] text-muted" id="resposta-resumo"><b className="text-ink-2">Em resumo:</b> {oQueFaz({ texto: f.texto, acao: acaoDe(f) }, painel)}.</p>
        </div>
      </form>

      {lixeira && (
        <Confirmar
          open onClose={() => setLixeira(false)} onConfirm={() => void apagar()} loading={apagando} perigoso botao="Mandar para a lixeira"
          titulo={`Mandar "${inicial.nome}" para a lixeira?`}
          texto={<>
            <p>A resposta sai desta lista e da ficha dos chamados, e não volta pela tela. Se é só por um tempo, desative em vez de apagar.</p>
            <Resultado r={erroLixeira ? { ok: false, mensagem: erroLixeira } : null} />
          </>}
        />
      )}
    </Modal>
  );
}
