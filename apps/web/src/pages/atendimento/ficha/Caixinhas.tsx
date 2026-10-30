/**
 * As caixinhas (2.3, a implantação): a lista do que já foi feito (a configuração, os testes) e os módulos do produto que
 * o cliente vai usar. Cada caixinha marcada mostra quem marcou e quando. Marcar grava na hora; os cliques seguidos vão um
 * depois do outro (a caixinha muda na tela antes, e volta se o servidor recusar).
 *
 * O anexo vai na caixinha (o clipe ao lado do nome); o campo das caixinhas não tem o Anexar do campo todo.
 *
 * O checklist dos módulos (a Ativação dos módulos da Configuração) mostra só os módulos escolhidos na Curadoria.
 *
 * As caixinhas em pastas (o Servidor, o Asterisk, o LinePBX Web…) ficam juntas, com a conta de cada pasta; quem cuida dos
 * chamados muda as caixinhas e as pastas ali mesmo, no "Editar as caixinhas" (vale para todos os cards do painel).
 */
import { useMemo, useRef, useState } from 'react';
import { Check, ChevronRight, Folder, ListChecks } from 'lucide-react';
import { modulosDoChecklist, pastasDasCaixinhas, type CampoPersonalizado, type OpcaoDoCampo } from '@gestor/shared';
import { api } from '../../../api/index.js';
import { Modal, Spinner, mensagemErro } from '../../../components/ui/index.js';
import { useDepoisDeMudar } from '../comum.js';
import { caixinhasParaGravar, EditorDasCaixinhas, pastasDoEditor, problemaNasPastas, type PastaRascunho } from '../ajustes/EditorDasCaixinhas.js';
import { BotaoAnexar, ListaDeAnexos, useAnexosDe } from './AnexosDoCampo.js';
import { ErroPerto, MarcaFalta, useAberta, useAcao } from './base.js';
import { dataCompleta, emQuando } from './Cabecalho.js';

const comoLista = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);

export function Caixinhas({ c, comTitulo = true }: { c: CampoPersonalizado; comTitulo?: boolean }) {
  const { f, pode, cuida, opcoes: doModulo } = useAberta();
  const acao = useAcao();
  const [editando, setEditando] = useState(false);
  const doServidor = useMemo(() => comoLista(f.campos[c.id]), [f.campos, c.id]);
  // o que está na tela enquanto os cliques vão para o servidor (nulo: o que o servidor tem)
  const [naTela, setNaTela] = useState<string[] | null>(null);
  const indo = useRef(false);
  const depois = useRef<string[] | null>(null);
  const marcados = naTela ?? doServidor;
  // o checklist dos módulos (2.3): só os escolhidos no campo de onde ele vem (a Curadoria), e os que ficaram marcados aqui
  const checklist = c.tipo === 'modulos' && !!c.escolhidosEm;
  const fonte = checklist ? doModulo.campos.find((x) => x.id === c.escolhidosEm) : undefined;
  const doChecklist = checklist ? modulosDoChecklist(c, { ...f.campos, [c.id]: marcados }) : null;
  // as ativas e as desativadas que ficaram marcadas (o módulo que foi para a lixeira, por exemplo)
  const opcoes = doChecklist ? doChecklist.opcoes : c.opcoes.filter((o) => o.ativa || marcados.includes(o.id));
  const fora = doChecklist?.foraDaEscolha ?? new Set<string>();
  const pastas = c.tipo === 'caixinhas' ? pastasDasCaixinhas(opcoes) : [{ pasta: null, opcoes }];
  const emPastas = pastas.some((p) => p.pasta !== null);

  const enviar = async (ids: string[]) => {
    if (indo.current) { depois.current = ids; return; }
    indo.current = true;
    let vez: string[] | null = ids;
    while (vez) {
      const agora: string[] = vez;
      const r = await acao.rodar(() => api.atendimento.alterar(f.id, { campos: { [c.id]: agora.length ? agora : null } }));
      vez = r.ok ? depois.current : null;
      depois.current = null;
    }
    indo.current = false;
    setNaTela(null);
  };
  const trocar = (id: string) => {
    const marcar = !marcados.includes(id);
    // na ordem das opções (o histórico e a conta leem assim)
    const ids = c.opcoes.map((o) => o.id).filter((x) => (x === id ? marcar : marcados.includes(x)));
    setNaTela(ids);
    void enviar(ids);
  };

  const contam = opcoes.filter((o) => !fora.has(o.id));
  const feitos = contam.filter((o) => marcados.includes(o.id)).length;
  const podeEditar = cuida && c.tipo === 'caixinhas' && c.ativo;
  return (
    <div id={`campo-c-${c.id}`} className="min-w-0 scroll-mt-24">
      {comTitulo && (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mb-1.5">
          <h3 className="font-display font-semibold text-[14.5px]">{c.nome}</h3>
          {(c.tipo === 'caixinhas' || checklist) && contam.length > 0 && <span className="text-[12px] text-muted">{feitos} de {contam.length}</span>}
          <MarcaFalta campo={`campo:${c.id}`} />
          {acao.ocupado && <Spinner className="!w-3.5 !h-3.5" />}
          {/* sem o Anexar do campo todo (2.3, o Luan: "nas configurações n precisa de ter anexar"): o anexo vai no clipe de cada caixinha */}
          {podeEditar && (
            <button type="button" className="btn-ghost btn-sm -my-1 ml-auto text-[12.5px]" onClick={() => setEditando(true)} title="Criar, renomear e tirar caixinhas e pastas (vale para todos os cards do painel)">
              <ListChecks size={14} /> Editar as caixinhas
            </button>
          )}
        </div>
      )}
      {c.dica && <p className="text-[12px] text-muted -mt-0.5 mb-2">{c.dica}</p>}
      {!opcoes.length ? (
        <p className="text-[13px] text-muted italic">
          {checklist ? `Nenhum módulo escolhido em ${fonte?.nome ?? 'a escolha dos módulos'}${fonte?.parte ? ` (${fonte.parte})` : ''}.`
            : c.tipo === 'modulos' ? 'O produto ainda não tem módulos no catálogo (Administração › Produtos).' : podeEditar ? 'Nenhuma caixinha: crie no Editar as caixinhas.' : 'Nenhuma caixinha: as opções são criadas em Painéis › Ajustes › Campos.'}
        </p>
      ) : emPastas ? (
        <div className="flex flex-col gap-1.5">
          {pastas.map((p) => <PastaNaFicha key={p.pasta ?? '-'} nome={p.pasta} opcoes={p.opcoes} marcados={marcados} c={c} onTrocar={trocar} />)}
        </div>
      ) : (
        <ListaDeCaixinhas c={c} opcoes={opcoes} marcados={marcados} onTrocar={trocar} fora={fora} foraDe={fonte?.nome} />
      )}
      <ErroPerto erro={acao.erro} />
      {editando && <JanelaDasCaixinhas c={c} onFechar={() => setEditando(false)} />}
    </div>
  );
}

/** Uma pasta das caixinhas: o nome, a conta e as caixinhas (abre e fecha com um clique; começa aberta). */
function PastaNaFicha({ nome, opcoes, marcados, c, onTrocar }: { nome: string | null; opcoes: OpcaoDoCampo[]; marcados: string[]; c: CampoPersonalizado; onTrocar: (id: string) => void }) {
  const [aberta, setAberta] = useState(true);
  const feitos = opcoes.filter((o) => marcados.includes(o.id)).length;
  const tudo = feitos === opcoes.length;
  return (
    <div className="rounded-lg border border-line min-w-0" role="group" aria-label={nome ? `A pasta ${nome}` : 'As caixinhas sem pasta'}>
      <button type="button" className="w-full flex items-center gap-2 px-2.5 py-1.5 text-left rounded-[inherit] hover:bg-surface-2/60" aria-expanded={aberta} onClick={() => setAberta((v) => !v)}>
        <ChevronRight size={14} className={`text-muted shrink-0 transition-transform ${aberta ? 'rotate-90' : ''}`} aria-hidden />
        <Folder size={14} className="text-muted shrink-0" aria-hidden />
        <span className="text-[13px] font-semibold text-ink-2 min-w-0 flex-1 truncate">{nome ?? 'Sem pasta'}</span>
        <span className={`text-[12px] tnum shrink-0 ${tudo ? 'text-ok font-medium' : 'text-muted'}`}>{feitos} de {opcoes.length}{tudo ? ' · feito' : ''}</span>
      </button>
      {aberta && <div className="px-2.5 pb-1.5"><ListaDeCaixinhas c={c} opcoes={opcoes} marcados={marcados} onTrocar={onTrocar} /></div>}
    </div>
  );
}

function ListaDeCaixinhas({ c, opcoes, marcados, onTrocar, fora, foraDe }: {
  c: CampoPersonalizado; opcoes: OpcaoDoCampo[]; marcados: string[]; onTrocar: (id: string) => void;
  /** no checklist dos módulos: os que ficaram marcados aqui depois de saírem da escolha (`foraDe`: o nome do campo da escolha) */
  fora?: ReadonlySet<string>; foraDe?: string;
}) {
  const { f, pode, opcoes: doModulo } = useAberta();
  // quem marcou: a pessoa (pelo id) ou a integração (pelo nome guardado)
  const quem = (m: { porId: string | null; porNome: string | null }) => (m.porId ? doModulo.pessoas.find((p) => p.id === m.porId)?.nome ?? 'alguém que saiu' : m.porNome ?? 'uma integração');
  const marcas = f.marcas[c.id] ?? {};
  return (
    <ul className={c.tipo === 'modulos' && !c.escolhidosEm ? 'grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-0.5' : 'flex flex-col gap-0.5'}>
      {opcoes.map((o) => (
        <Caixinha key={o.id} c={c} o={o} marcado={marcados.includes(o.id)} m={marcas[o.id]} quem={quem} onTrocar={onTrocar}
          aviso={fora?.has(o.id) ? `saiu de ${foraDe ?? 'a escolha'}` : null} />
      ))}
    </ul>
  );
}

/** Uma caixinha: marcar (com quem marcou e quando) e, ao lado, o clipe dos anexos dela (2.3). */
function Caixinha({ c, o, marcado, m, quem, onTrocar, aviso = null }: {
  c: CampoPersonalizado; o: OpcaoDoCampo; marcado: boolean; m: { porId: string | null; porNome: string | null; em: string } | undefined;
  quem: (m: { porId: string | null; porNome: string | null }) => string; onTrocar: (id: string) => void; aviso?: string | null;
}) {
  const { pode } = useAberta();
  const anexos = useAnexosDe(c.id, o.id);
  return (
    <li className="group min-w-0">
      <div className="flex items-start gap-1">
        <label className={`flex flex-1 min-w-0 items-start gap-2.5 rounded-md px-1.5 py-1 -ml-1.5 ${pode ? 'cursor-pointer hover:bg-surface-2' : ''}`}>
          <input type="checkbox" className="sr-only peer" checked={marcado} disabled={!pode} onChange={() => onTrocar(o.id)} />
          <span aria-hidden className={`mt-[2px] grid place-items-center w-[17px] h-[17px] rounded-[5px] border shrink-0 peer-focus-visible:ring-2 peer-focus-visible:ring-accent transition-colors ${
            marcado ? 'bg-ok border-ok text-white' : 'border-line-strong bg-surface'}`}>
            {marcado && <Check size={12} strokeWidth={3} />}
          </span>
          <span className="min-w-0 flex-1">
            <span className={`text-[13.5px] leading-snug ${marcado && c.tipo === 'caixinhas' ? 'text-ink-2' : 'text-ink'}`}>
              {o.nome}{!o.ativa && <span className="text-muted"> (desativada)</span>}{aviso && <span className="text-muted"> ({aviso})</span>}
            </span>
            {marcado && m && (
              <span className="block text-[11.5px] text-muted leading-tight mt-0.5" title={dataCompleta(m.em)}>
                {quem(m)} · {emQuando(m.em)}
              </span>
            )}
          </span>
        </label>
        {/* o clipe fica claro até passar o mouse (ou quando a caixinha já tem anexo) */}
        <BotaoAnexar campoId={c.id} opcaoId={o.id} rotulo={`Anexar em ${o.nome}`} soIcone
          className={`mt-0.5 shrink-0 ${anexos.length ? '' : 'opacity-50 group-hover:opacity-100 focus-within:opacity-100'}`} />
      </div>
      {anexos.length > 0 && <div className="pl-[26px] pb-1"><ListaDeAnexos anexos={anexos} pequeno /></div>}
    </li>
  );
}

/** O "Editar as caixinhas" do card: as caixinhas e as pastas do campo, para todos os cards do painel. */
function JanelaDasCaixinhas({ c, onFechar }: { c: CampoPersonalizado; onFechar: () => void }) {
  const { f, opcoes } = useAberta();
  const depois = useDepoisDeMudar();
  const [pastas, setPastas] = useState<PastaRascunho[]>(() => pastasDoEditor(c.opcoes));
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);
  const painel = opcoes.paineis.find((p) => p.id === f.painelId);
  const produto = c.produtoId ? opcoes.produtos.find((p) => p.id === c.produtoId) : null;
  const salvar = async () => {
    const problema = problemaNasPastas(pastas);
    if (problema) { setErro(problema); return; }
    setSalvando(true); setErro('');
    try {
      await depois(api.atendimento.salvarCaixinhas(c.id, { opcoes: caixinhasParaGravar(pastas) }), `As caixinhas de ${c.nome} foram salvas`);
      onFechar();
    } catch (e) {
      setErro(mensagemErro(e));
    } finally {
      setSalvando(false);
    }
  };
  return (
    <Modal open onClose={onFechar} largura="max-w-xl" titulo={`Editar as caixinhas de ${c.nome}${produto ? ` (${produto.nome})` : ''}`}
      rodape={<>
        {erro && <p className="text-bad text-[13px] mr-auto basis-full sm:basis-auto sm:flex-1" role="alert">{erro}</p>}
        <button type="button" className="btn-secondary" onClick={onFechar}>Cancelar</button>
        <button type="button" className="btn-primary" id="caixinhas-salvar" disabled={salvando} onClick={() => void salvar()}>{salvando ? <Spinner className="text-white" /> : 'Salvar'}</button>
      </>}>
      <p className="text-[13px] text-ink-2 mb-3">
        Vale para todos os cards{painel ? ` do painel ${painel.nome}` : ''}. A caixinha que um card já marcou continua marcada nele, mesmo desativada.
      </p>
      <EditorDasCaixinhas id="ficha-caixinhas" pastas={pastas} onChange={(p) => { setPastas(p); setErro(''); }} />
    </Modal>
  );
}
