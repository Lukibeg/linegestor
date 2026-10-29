/**
 * As caixinhas (2.3, a implantação): a lista do que já foi feito (a configuração, os testes) e os módulos do produto que
 * o cliente vai usar. Cada caixinha marcada mostra quem marcou e quando. Marcar grava na hora; os cliques seguidos vão um
 * depois do outro (a caixinha muda na tela antes, e volta se o servidor recusar).
 *
 * As caixinhas em pastas (o Servidor, o Asterisk, o LinePBX Web…) ficam juntas, com a conta de cada pasta; quem cuida dos
 * chamados muda as caixinhas e as pastas ali mesmo, no "Editar as caixinhas" (vale para todos os cards do painel).
 */
import { useMemo, useRef, useState } from 'react';
import { Check, ChevronRight, Folder, ListChecks } from 'lucide-react';
import { pastasDasCaixinhas, type CampoPersonalizado, type OpcaoDoCampo } from '@gestor/shared';
import { api } from '../../../api/index.js';
import { Modal, Spinner, mensagemErro } from '../../../components/ui/index.js';
import { useDepoisDeMudar } from '../comum.js';
import { caixinhasParaGravar, EditorDasCaixinhas, pastasDoEditor, problemaNasPastas, type PastaRascunho } from '../ajustes/EditorDasCaixinhas.js';
import { ErroPerto, MarcaFalta, useAberta, useAcao } from './base.js';
import { dataCompleta, emQuando } from './Cabecalho.js';

const comoLista = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);

export function Caixinhas({ c, comTitulo = true }: { c: CampoPersonalizado; comTitulo?: boolean }) {
  const { f, pode, cuida } = useAberta();
  const acao = useAcao();
  const [editando, setEditando] = useState(false);
  const doServidor = useMemo(() => comoLista(f.campos[c.id]), [f.campos, c.id]);
  // o que está na tela enquanto os cliques vão para o servidor (nulo: o que o servidor tem)
  const [naTela, setNaTela] = useState<string[] | null>(null);
  const indo = useRef(false);
  const depois = useRef<string[] | null>(null);
  const marcados = naTela ?? doServidor;
  // as ativas e as desativadas que ficaram marcadas (o módulo que foi para a lixeira, por exemplo)
  const opcoes = c.opcoes.filter((o) => o.ativa || marcados.includes(o.id));
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

  const feitos = opcoes.filter((o) => marcados.includes(o.id)).length;
  const podeEditar = cuida && c.tipo === 'caixinhas' && c.ativo;
  return (
    <div id={`campo-c-${c.id}`} className="min-w-0 scroll-mt-24">
      {comTitulo && (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mb-1.5">
          <h3 className="font-display font-semibold text-[14.5px]">{c.nome}</h3>
          {c.tipo === 'caixinhas' && opcoes.length > 0 && <span className="text-[12px] text-muted">{feitos} de {opcoes.length}</span>}
          <MarcaFalta campo={`campo:${c.id}`} />
          {acao.ocupado && <Spinner className="!w-3.5 !h-3.5" />}
          {podeEditar && (
            <button type="button" className="btn-ghost btn-sm ml-auto text-[12.5px]" onClick={() => setEditando(true)} title="Criar, renomear e tirar caixinhas e pastas (vale para todos os cards do painel)">
              <ListChecks size={14} /> Editar as caixinhas
            </button>
          )}
        </div>
      )}
      {c.dica && <p className="text-[12px] text-muted -mt-0.5 mb-2">{c.dica}</p>}
      {!opcoes.length ? (
        <p className="text-[13px] text-muted italic">
          {c.tipo === 'modulos' ? 'O produto ainda não tem módulos no catálogo (Administração › Produtos).' : podeEditar ? 'Nenhuma caixinha: crie no Editar as caixinhas.' : 'Nenhuma caixinha: as opções são criadas em Painéis › Ajustes › Campos.'}
        </p>
      ) : emPastas ? (
        <div className="flex flex-col gap-1.5">
          {pastas.map((p) => <PastaNaFicha key={p.pasta ?? '-'} nome={p.pasta} opcoes={p.opcoes} marcados={marcados} c={c} onTrocar={trocar} />)}
        </div>
      ) : (
        <ListaDeCaixinhas c={c} opcoes={opcoes} marcados={marcados} onTrocar={trocar} />
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

function ListaDeCaixinhas({ c, opcoes, marcados, onTrocar }: { c: CampoPersonalizado; opcoes: OpcaoDoCampo[]; marcados: string[]; onTrocar: (id: string) => void }) {
  const { f, pode, opcoes: doModulo } = useAberta();
  // quem marcou: a pessoa (pelo id) ou a integração (pelo nome guardado)
  const quem = (m: { porId: string | null; porNome: string | null }) => (m.porId ? doModulo.pessoas.find((p) => p.id === m.porId)?.nome ?? 'alguém que saiu' : m.porNome ?? 'uma integração');
  const marcas = f.marcas[c.id] ?? {};
  return (
    <ul className={c.tipo === 'modulos' ? 'grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-0.5' : 'flex flex-col gap-0.5'}>
      {opcoes.map((o) => {
        const marcado = marcados.includes(o.id);
        const m = marcas[o.id];
        return (
          <li key={o.id}>
            <label className={`flex items-start gap-2.5 rounded-md px-1.5 py-1 -mx-1.5 ${pode ? 'cursor-pointer hover:bg-surface-2' : ''}`}>
              <input type="checkbox" className="sr-only peer" checked={marcado} disabled={!pode} onChange={() => onTrocar(o.id)} />
              <span aria-hidden className={`mt-[2px] grid place-items-center w-[17px] h-[17px] rounded-[5px] border shrink-0 peer-focus-visible:ring-2 peer-focus-visible:ring-accent transition-colors ${
                marcado ? 'bg-ok border-ok text-white' : 'border-line-strong bg-surface'}`}>
                {marcado && <Check size={12} strokeWidth={3} />}
              </span>
              <span className="min-w-0 flex-1">
                <span className={`text-[13.5px] leading-snug ${marcado && c.tipo === 'caixinhas' ? 'text-ink-2' : 'text-ink'}`}>
                  {o.nome}{!o.ativa && <span className="text-muted"> (desativada)</span>}
                </span>
                {marcado && m && (
                  <span className="block text-[11.5px] text-muted leading-tight mt-0.5" title={dataCompleta(m.em)}>
                    {quem(m)} · {emQuando(m.em)}
                  </span>
                )}
              </span>
            </label>
          </li>
        );
      })}
    </ul>
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
