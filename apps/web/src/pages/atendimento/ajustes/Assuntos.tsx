/**
 * Chamados › Ajustes › Campos (Patch 2.0, decisão 0047) — A ÁRVORE DE ASSUNTOS de um painel.
 *
 * É a configuração do campo Assunto (que cada painel liga ou desliga na aba Campos; daqui se volta
 * para lá). A árvore de assuntos de cada painel (até 3 níveis, como Ramal › Configuração › Identidade), o
 * ponto principal para os relatórios: cada assunto com a descrição ("quando usar"), o checklist (os
 * passos que entram no chamado com este assunto) e o de-para (os nomes da lista antiga do LineChat
 * que viram este assunto, para os relatórios compararem o antes e o depois).
 *
 * Nada se apaga: o assunto que não serve mais é desativado (some da lista de quem abre chamado, e os
 * chamados antigos continuam com ele). A lista nasce em branco; quando a lista da equipe fechar, o
 * "Colar a lista" monta tudo de uma vez — com a prévia de como vai ficar antes de gravar.
 */
import { useMemo, useState, type ReactNode } from 'react';
import { ArrowLeft, ArrowLeftRight, ClipboardPaste, CornerDownRight, ListChecks, Pencil, Plus, Search, X } from 'lucide-react';
import {
  MAX_NIVEL_ASSUNTO, assuntoEDescendentes, caminhoDoAssunto, emOrdemDeArvore, lerListaDeAssuntos, nivelDoAssunto, paraBusca,
  type Assunto, type AssuntoGravarEntrada, type Painel,
} from '@gestor/shared';
import { api } from '../../../api/index.js';
import { Carregando, Chip, EscolherComBusca, Modal, Spinner, Toggle, Vazio, mensagemErro, useToast, type OpcaoBusca } from '../../../components/ui/index.js';
import { TOM_DO_PAINEL, useDepoisDeMudar, useOpcoes } from '../comum.js';

/** O exemplo no formato da lista da equipe (o mesmo que o "colar" entende). */
const EXEMPLO = [
  'Ramal - Configuração - Identidade',
  'Ramal - Configuração - Criação',
  'Ramal - Incidente - Sem serviço — o ramal não faz nem recebe ligação',
  'Operadora > Incidente > DID de entrada',
  'Filas',
  '  Configuração',
  '    Agentes',
].join('\n');

/** As partes do caminho de um assunto (para comparar sem ligar para maiúscula e acento). */
function partesDoCaminho(id: string, porId: Map<string, Assunto>): string[] {
  const partes: string[] = [];
  for (let a = porId.get(id), n = 0; a && n < 10; n++) { partes.unshift(a.nome); a = a.paiId ? porId.get(a.paiId) : undefined; }
  return partes;
}
const chaveDoCaminho = (partes: string[]) => partes.map((p) => paraBusca(p)).join('\n');

/** Quantos níveis a árvore de um assunto ocupa (1 = ele sozinho): é o que limita para onde ele pode ir. */
function alturaDoAssunto(id: string, todos: Assunto[], n = 0): number {
  if (n > 10) return 1;
  return 1 + Math.max(0, ...todos.filter((a) => a.paiId === id).map((f) => alturaDoAssunto(f.id, todos, n + 1)));
}

/** Uma linha por item, sem as vazias (o checklist, o de-para). */
const linhas = (t: string) => t.split('\n').map((x) => x.trim()).filter(Boolean);

export function AjustesAssuntos({ painel, onVoltar }: { painel: Painel; onVoltar: () => void }) {
  const opcoes = useOpcoes();
  const [busca, setBusca] = useState('');
  /** a janela de um assunto: editar (assunto) ou incluir (na raiz ou dentro de outro) */
  const [janela, setJanela] = useState<{ assunto: Assunto | null; paiId: string | null } | null>(null);
  const [colando, setColando] = useState(false);

  const assuntos = useMemo(() => (opcoes.data?.assuntos ?? []).filter((a) => a.painelId === painel.id), [opcoes.data, painel.id]);
  const arvore = useMemo(() => emOrdemDeArvore(assuntos), [assuntos]);

  if (opcoes.isLoading) return <Carregando />;
  if (opcoes.isError || !opcoes.data) return <p className="text-bad text-sm" role="alert">{mensagemErro(opcoes.error)}</p>;
  const desativados = assuntos.filter((a) => !a.ativo).length;

  // a busca pelo caminho: "ramal config" acha Ramal › Configuração › Identidade
  const termos = paraBusca(busca).split(/\s+/).filter(Boolean);
  const achados = termos.length ? arvore.filter((a) => { const c = paraBusca(caminhoDoAssunto(a.id, assuntos)); return termos.every((t) => c.includes(t)); }) : arvore;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1" id="assuntos-painel">
        <button type="button" className="btn-ghost btn-sm -ml-2 text-ink-2" onClick={onVoltar} id="assuntos-voltar"><ArrowLeft size={15} /> Os campos</button>
        <span className="text-line-strong" aria-hidden>/</span>
        <h3 className="font-display font-semibold text-[15px] flex flex-wrap items-center gap-2">
          A árvore de assuntos do painel <Chip tone={TOM_DO_PAINEL[painel.cor]} className="font-mono">{painel.sigla}</Chip> {painel.nome}
        </h3>
      </div>

      {!assuntos.length ? (
        <Vazio titulo={`Nenhum assunto no painel ${painel.nome}`}
          texto="A lista de assuntos nasce em branco: cole a lista da equipe quando ela fechar, ou inclua um por um."
          acao={<div className="flex flex-wrap justify-center gap-2">
            <button type="button" className="btn-primary" onClick={() => setColando(true)}><ClipboardPaste size={16} /> Colar a lista</button>
            <button type="button" className="btn-secondary" onClick={() => setJanela({ assunto: null, paiId: null })}><Plus size={16} /> Incluir assunto</button>
          </div>} />
      ) : (
        <section className="card min-w-0 overflow-hidden" aria-label={`Os assuntos do painel ${painel.nome}`}>
          <div className="p-3 sm:p-4 border-b border-line flex flex-wrap items-center gap-2">
            <label className="relative flex-1 min-w-[200px] max-w-md">
              <Search size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
              <input className="input pl-8 pr-8" id="assuntos-busca" autoComplete="off" value={busca} onChange={(e) => setBusca(e.target.value)}
                placeholder="Procurar (ex.: ramal config)" aria-label="Procurar assunto pelo caminho" />
              {busca && <button type="button" className="absolute right-2 top-1/2 -translate-y-1/2 text-muted hover:text-ink" onClick={() => setBusca('')} aria-label="Limpar a busca"><X size={15} /></button>}
            </label>
            <span className="text-[12.5px] text-muted tnum">
              {termos.length ? `${achados.length} de ${assuntos.length}` : `${assuntos.length} ${assuntos.length === 1 ? 'assunto' : 'assuntos'}`}
              {desativados > 0 && !termos.length ? ` (${desativados} ${desativados === 1 ? 'desativado' : 'desativados'})` : ''}
            </span>
            <div className="flex flex-wrap gap-2 ml-auto">
              <button type="button" className="btn-secondary btn-sm" id="assuntos-colar" onClick={() => setColando(true)}><ClipboardPaste size={14} /> Colar a lista</button>
              <button type="button" className="btn-primary btn-sm" id="assuntos-incluir" onClick={() => setJanela({ assunto: null, paiId: null })}><Plus size={14} /> Incluir assunto</button>
            </div>
          </div>
          {!achados.length ? (
            <p className="p-4 text-sm text-muted">Nenhum assunto com "{busca}" no caminho.</p>
          ) : (
            <ul className="divide-y divide-line" id="assuntos-arvore">
              {achados.map((a) => (
                <LinhaAssunto key={a.id} a={a} assuntos={assuntos} buscando={termos.length > 0}
                  onEditar={() => setJanela({ assunto: a, paiId: a.paiId })} onIncluirDentro={() => setJanela({ assunto: null, paiId: a.id })} />
              ))}
            </ul>
          )}
        </section>
      )}

      <p className="text-[12.5px] text-muted max-w-3xl">
        Até {MAX_NIVEL_ASSUNTO} níveis. O assunto que não serve mais é <b className="text-ink-2">desativado</b>, nunca apagado: some da lista de quem abre
        chamado, e os chamados (e os relatórios) que já têm o assunto continuam com ele.
      </p>

      {janela && <JanelaAssunto painel={painel} assuntos={assuntos} assunto={janela.assunto} paiInicial={janela.paiId} onFechar={() => setJanela(null)} />}
      {colando && <JanelaColar painel={painel} assuntos={assuntos} onFechar={() => setColando(false)} />}
    </div>
  );
}

function LinhaAssunto({ a, assuntos, buscando, onEditar, onIncluirDentro }: {
  a: Assunto & { profundidade: number }; assuntos: Assunto[]; buscando: boolean; onEditar: () => void; onIncluirDentro: () => void;
}) {
  const caminho = caminhoDoAssunto(a.id, assuntos);
  const pais = caminho.split(' › ').slice(0, -1);
  // buscando, a lista vem sem a árvore: o caminho inteiro diz onde o assunto mora
  const recuo = buscando ? 0 : (a.profundidade - 1) * 24;
  const raiz = !buscando && a.profundidade === 1;
  return (
    // o assunto de cima faz as vezes de título do grupo (com 80 assuntos, é o que guia o olho)
    <li className={`flex items-start gap-2 pr-3 sm:pr-4 py-1 min-w-0 ${raiz ? 'bg-surface-2' : ''}`} style={{ paddingLeft: `calc(${recuo}px + 0.75rem)` }}>
      {!buscando && a.profundidade > 1 && <CornerDownRight size={14} className="text-muted mt-2 shrink-0" aria-hidden />}
      <div className={`min-w-0 flex-1 py-1 ${a.ativo ? '' : 'opacity-60'}`}>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className={`break-words ${a.profundidade === 1 && !buscando ? 'font-semibold text-ink' : 'text-ink'}`}>
            {buscando && pais.length > 0 && <span className="text-muted">{pais.join(' › ')} › </span>}{a.nome}
          </span>
          {!a.ativo && <Chip tone="muted">desativado</Chip>}
          {a.checklist.length > 0 && <Chip tone="neutral" title={`Checklist:\n${a.checklist.join('\n')}`}><ListChecks size={12} /> {a.checklist.length} {a.checklist.length === 1 ? 'passo' : 'passos'}</Chip>}
          {a.dePara.length > 0 && <Chip tone="neutral" title={`Da lista antiga: ${a.dePara.join(', ')}`}><ArrowLeftRight size={12} /> {a.dePara.length} {a.dePara.length === 1 ? 'nome antigo' : 'nomes antigos'}</Chip>}
        </div>
        {a.descricao && <p className="text-[12.5px] text-muted leading-snug break-words">{a.descricao}</p>}
      </div>
      <div className="flex items-center gap-0.5 shrink-0">
        {a.profundidade < MAX_NIVEL_ASSUNTO && (
          <button type="button" className="btn-ghost btn-sm" onClick={onIncluirDentro} aria-label={`Incluir um assunto dentro de ${caminho}`} title={`Incluir um assunto dentro de ${caminho}`}>
            <Plus size={14} /><span className="hidden sm:inline">Dentro</span>
          </button>
        )}
        <button type="button" className="btn-ghost btn-sm" onClick={onEditar} aria-label={`Editar ${caminho}`} title={`Editar ${caminho}`}>
          <Pencil size={14} /><span className="hidden sm:inline">Editar</span>
        </button>
      </div>
    </li>
  );
}

// =====================================================================
//  A JANELA DO ASSUNTO (incluir ou editar)
// =====================================================================

function JanelaAssunto({ painel, assuntos, assunto, paiInicial, onFechar }: {
  painel: Painel; assuntos: Assunto[]; assunto: Assunto | null; paiInicial: string | null; onFechar: () => void;
}) {
  const depois = useDepoisDeMudar();
  const [f, setF] = useState(() => ({
    paiId: assunto?.paiId ?? paiInicial ?? '',
    nome: assunto?.nome ?? '',
    descricao: assunto?.descricao ?? '',
    ativo: assunto?.ativo ?? true,
    checklist: (assunto?.checklist ?? []).join('\n'),
    dePara: (assunto?.dePara ?? []).join('\n'),
  }));
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);
  const mudar = (o: Partial<typeof f>) => { setF((x) => ({ ...x, ...o })); setErro(''); };

  // para onde o assunto pode ir: nunca para dentro dele mesmo, e a árvore não passa do 3º nível
  const altura = assunto ? alturaDoAssunto(assunto.id, assuntos) : 1;
  const proibidos = assunto ? assuntoEDescendentes(assunto.id, assuntos) : new Set<string>();
  const opcoesPai: OpcaoBusca[] = emOrdemDeArvore(assuntos)
    .filter((a) => !proibidos.has(a.id) && nivelDoAssunto(a.id, assuntos) + altura <= MAX_NIVEL_ASSUNTO)
    .map((a) => ({ id: a.id, nome: caminhoDoAssunto(a.id, assuntos), dica: a.ativo ? undefined : 'desativado' }));
  const caminho = [f.paiId ? caminhoDoAssunto(f.paiId, assuntos) : '', f.nome.trim() || '…'].filter(Boolean).join(' › ');
  const filhos = assunto ? assuntos.filter((a) => a.paiId === assunto.id).length : 0;
  const passos = linhas(f.checklist);
  const nomesAntigos = linhas(f.dePara);

  const salvar = async () => {
    if (!f.nome.trim()) { setErro('Dê um nome ao assunto.'); document.getElementById('assunto-nome')?.focus(); return; }
    if (passos.length > 30) { setErro('O checklist vai até 30 passos.'); return; }
    if (passos.some((p) => p.length > 160)) { setErro('Cada passo do checklist vai até 160 letras.'); return; }
    if (nomesAntigos.length > 50) { setErro('O de-para vai até 50 nomes.'); return; }
    if (nomesAntigos.some((p) => p.length > 120)) { setErro('Cada nome do de-para vai até 120 letras.'); return; }
    const d: AssuntoGravarEntrada = {
      paiId: f.paiId || null, nome: f.nome.trim(), descricao: f.descricao.trim() || null, ativo: f.ativo, checklist: passos, dePara: nomesAntigos,
    };
    setSalvando(true); setErro('');
    try {
      await depois(api.atendimento.salvarAssunto(painel.id, assunto?.id ?? null, d),
        !assunto ? `Assunto ${caminho} incluído` : assunto.ativo !== f.ativo ? `Assunto ${caminho} ${f.ativo ? 'reativado' : 'desativado'}` : `Assunto ${caminho} salvo`);
      onFechar();
    } catch (e) {
      setErro(mensagemErro(e));
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Modal open onClose={onFechar} largura="max-w-xl" titulo={assunto ? 'Editar o assunto' : 'Incluir assunto'}
      rodape={<>
        {erro && <p className="text-bad text-[13px] mr-auto basis-full sm:basis-auto sm:flex-1" role="alert" id="assunto-erro">{erro}</p>}
        <button type="button" className="btn-secondary" onClick={onFechar}>Cancelar</button>
        <button type="button" className="btn-primary" id="assunto-salvar" disabled={salvando} onClick={salvar}>{salvando ? <Spinner className="text-white" /> : assunto ? 'Salvar' : 'Incluir'}</button>
      </>}>
      <form autoComplete="off" onSubmit={(e) => { e.preventDefault(); void salvar(); }} className="flex flex-col gap-4">
        <p className="text-[13px] rounded-lg bg-surface-2 px-3 py-2 break-words">
          <span className="text-muted">No painel {painel.nome}:</span> <b className="text-ink">{caminho}</b>
        </p>
        <Rotulo rotulo="Dentro de" id="assunto-pai"
          dica={altura > 1 ? `Este assunto tem ${filhos} ${filhos === 1 ? 'assunto' : 'assuntos'} dentro dele: só pode ir para onde a árvore continue com até ${MAX_NIVEL_ASSUNTO} níveis.` : `Até ${MAX_NIVEL_ASSUNTO} níveis, como Ramal › Configuração › Identidade.`}>
          <EscolherComBusca valor={f.paiId} onChange={(v) => mudar({ paiId: v })} opcoes={opcoesPai} vazio="Nenhum (na raiz)" procurar="Procurar pelo caminho…"
            className="input w-full" id="assunto-pai" rotulo="Dentro de" largura="w-[440px]" />
        </Rotulo>
        <Rotulo rotulo="Nome" id="assunto-nome">
          <input className="input" id="assunto-nome" value={f.nome} maxLength={80} placeholder="Ex.: Identidade" autoFocus={!assunto} onChange={(e) => mudar({ nome: e.target.value })} />
        </Rotulo>
        <Rotulo rotulo="Quando usar" id="assunto-descricao" dica="Uma frase que ajude quem abre o chamado a escolher certo (aparece como dica na escolha).">
          <textarea className="input min-h-[60px]" id="assunto-descricao" value={f.descricao} maxLength={400} placeholder="Ex.: o nome ou o número que aparece no ramal está errado"
            onChange={(e) => mudar({ descricao: e.target.value })} />
        </Rotulo>
        <label className="flex items-start gap-2.5 text-sm cursor-pointer">
          <Toggle checked={f.ativo} onChange={(v) => mudar({ ativo: v })} />
          <span>Ativo <span className="block text-[12.5px] text-muted">Desativado, some da lista de quem abre chamado; os chamados que já têm este assunto continuam com ele. Os assuntos de dentro não mudam.</span></span>
        </label>
        <Rotulo rotulo={`Checklist${passos.length ? ` (${passos.length} ${passos.length === 1 ? 'passo' : 'passos'})` : ''}`} id="assunto-checklist"
          dica="Um passo por linha. Entram no checklist do chamado que tiver este assunto.">
          <textarea className="input min-h-[84px]" id="assunto-checklist" value={f.checklist} placeholder={'Conferir o nome no PABX\nPedir ao cliente para reiniciar o aparelho'}
            onChange={(e) => mudar({ checklist: e.target.value })} />
        </Rotulo>
        <Rotulo rotulo={`De-para${nomesAntigos.length ? ` (${nomesAntigos.length} ${nomesAntigos.length === 1 ? 'nome' : 'nomes'})` : ''}`} id="assunto-depara"
          dica="Um por linha: os nomes da lista antiga (do LineChat) que viram este assunto. É o que deixa os relatórios compararem o antes e o depois.">
          <textarea className="input min-h-[60px]" id="assunto-depara" value={f.dePara} placeholder={'Ramal - Identidade\nAlteração de nome de ramal'}
            onChange={(e) => mudar({ dePara: e.target.value })} />
        </Rotulo>
        <button type="submit" className="hidden" aria-hidden tabIndex={-1} />
      </form>
    </Modal>
  );
}

// =====================================================================
//  COLAR A LISTA (o jeito de montar a árvore de uma vez)
// =====================================================================

function JanelaColar({ painel, assuntos, onFechar }: { painel: Painel; assuntos: Assunto[]; onFechar: () => void }) {
  const depois = useDepoisDeMudar();
  const toast = useToast();
  const [texto, setTexto] = useState('');
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);

  // a prévia usa a mesma leitura do servidor (lerListaDeAssuntos) e acha o que já existe pelo caminho
  const existentes = useMemo(() => {
    const porId = new Map(assuntos.map((a) => [a.id, a]));
    return new Set(assuntos.map((a) => chaveDoCaminho(partesDoCaminho(a.id, porId))));
  }, [assuntos]);
  const previa = useMemo(() => lerListaDeAssuntos(texto).map((i) => ({ ...i, existe: existentes.has(chaveDoCaminho([...i.caminho, i.nome])) })), [texto, existentes]);
  const novos = previa.filter((p) => !p.existe).length;

  const colar = async () => {
    if (!previa.length) { setErro('Não achei nenhum assunto no texto. Cole um por linha, como "Ramal - Configuração - Identidade".'); return; }
    setEnviando(true); setErro('');
    try {
      const r = await depois(api.atendimento.colarAssuntos(painel.id, texto));
      toast.push('ok', `${r.criados} ${r.criados === 1 ? 'assunto novo' : 'assuntos novos'}, ${r.jaExistiam} já ${r.jaExistiam === 1 ? 'existia' : 'existiam'}`);
      onFechar();
    } catch (e) {
      setErro(mensagemErro(e));
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Modal open onClose={onFechar} largura="max-w-5xl" titulo={`Colar a lista de assuntos no painel ${painel.nome}`}
      rodape={<>
        {erro && <p className="text-bad text-[13px] mr-auto basis-full sm:basis-auto sm:flex-1" role="alert" id="colar-erro">{erro}</p>}
        <button type="button" className="btn-secondary" onClick={onFechar}>Cancelar</button>
        <button type="button" className="btn-primary" id="colar-confirmar" disabled={enviando || !previa.length} onClick={colar}>
          {enviando ? <Spinner className="text-white" /> : <ClipboardPaste size={15} />} Colar {novos ? `(${novos} ${novos === 1 ? 'novo' : 'novos'})` : ''}
        </button>
      </>}>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="flex flex-col gap-2 min-w-0">
          <label className="label mb-0" htmlFor="colar-texto">A lista, um assunto por linha</label>
          <textarea className="input font-mono text-[12.5px] min-h-[260px] lg:min-h-[360px]" id="colar-texto" value={texto} spellCheck={false} autoFocus
            placeholder={EXEMPLO} onChange={(e) => { setTexto(e.target.value); setErro(''); }} />
          <div className="text-[12.5px] text-muted leading-relaxed">
            <p>O nível vem do caminho, no formato da lista da equipe (<code className="text-ink-2">Ramal - Configuração - Identidade</code>), ou com
              {' '}<code className="text-ink-2">&gt;</code> no lugar do hífen, ou do recuo (2 espaços por nível). A descrição vem depois de um travessão:
              {' '}<code className="text-ink-2">Sem serviço — o ramal não liga</code>.</p>
            <p className="mt-1">Os pais que faltarem entram junto. O que já existe fica como está (nada é apagado nem renomeado).</p>
            {!texto && (
              <button type="button" className="link mt-1" onClick={() => setTexto(EXEMPLO)}>Ver com o exemplo</button>
            )}
          </div>
        </div>
        <div className="flex flex-col gap-2 min-w-0">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="label mb-0">Como vai ficar</span>
            {previa.length > 0 && (
              <span className="text-[12.5px] tnum text-muted" id="colar-contagem">
                <b className="text-ok">{novos} {novos === 1 ? 'novo' : 'novos'}</b>{previa.length - novos > 0 ? `, ${previa.length - novos} já ${previa.length - novos === 1 ? 'existe' : 'existem'}` : ''}
              </span>
            )}
          </div>
          <div className="rounded-lg border border-line bg-surface-2 p-2 min-h-[160px] max-h-[50vh] lg:max-h-[420px] overflow-y-auto" id="colar-previa">
            {!texto.trim() ? <p className="text-[13px] text-muted p-2">Cole a lista ao lado para ver a árvore aqui antes de gravar.</p>
              : !previa.length ? <p className="text-[13px] text-bad p-2">Não achei nenhum assunto no texto.</p>
                : (
                  <ul className="flex flex-col">
                    {previa.map((p, i) => (
                      <ItemPrevia key={i} nivel={p.caminho.length + 1} existe={p.existe}>
                        <span className={p.caminho.length === 0 ? 'font-semibold' : ''}>{p.nome}</span>
                        {p.descricao && <span className="text-muted"> — {p.descricao}</span>}
                      </ItemPrevia>
                    ))}
                  </ul>
                )}
          </div>
        </div>
      </div>
    </Modal>
  );
}

function ItemPrevia({ nivel, existe, children }: { nivel: number; existe: boolean; children: ReactNode }) {
  return (
    <li className="flex items-start gap-1.5 py-0.5 text-[13px] min-w-0" style={{ paddingLeft: (nivel - 1) * 18 }}>
      {nivel > 1 && <CornerDownRight size={13} className="text-muted mt-1 shrink-0" aria-hidden />}
      <span className={`min-w-0 flex-1 break-words ${existe ? 'text-muted' : 'text-ink'}`}>{children}</span>
      {existe ? <Chip tone="muted">já existe</Chip> : <Chip tone="ok">novo</Chip>}
    </li>
  );
}

function Rotulo({ rotulo, id, dica, children }: { rotulo: string; id: string; dica?: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <label className="label" htmlFor={id}>{rotulo}</label>
      {children}
      {dica && <div className="text-muted text-[12.5px] mt-1">{dica}</div>}
    </div>
  );
}
