/**
 * As caixinhas em pastas (2.3, o Luan: "como se fosse pastas das configurações, por exemplo configurações do servidor,
 * configuirações do asterisk, do linepbx web, dos módulos, e eu tenho que poder criar e editar facilmente"). Serve aos
 * dois lugares que mudam as caixinhas: Painéis › Ajustes › Campos e o "Editar as caixinhas" do card.
 *
 *  - cada pasta tem o nome (escrito ali mesmo), a ordem, o "Incluir caixinha" e o "Tirar a pasta" (as caixinhas dela
 *    ficam sem pasta: nada se perde);
 *  - cada caixinha sobe e desce (passando de uma pasta para a outra nas pontas), muda o nome e sai (a que já existia fica
 *    desativada: o card que a marcou continua com ela; a nova, ainda não salva, só sai).
 */
import { useState, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, Folder, FolderPlus, Plus, Undo2, X } from 'lucide-react';
import { etiquetasUnicas, MAX_OPCOES_DO_CAMPO, paraBusca, pastasDasCaixinhas, type OpcaoDoCampo } from '@gestor/shared';

export type CaixinhaRascunho = { chave: string; id?: string; nome: string; ativa: boolean };
/** Uma pasta do editor; a de nome vazio e chave `sem` são as caixinhas sem pasta (sempre a primeira). */
export type PastaRascunho = { chave: string; nome: string; caixinhas: CaixinhaRascunho[] };
export type CaixinhaParaGravar = { id?: string; nome: string; ativa: boolean; pasta: string | null };

let sequencia = 0;
const novaChave = (p: string) => `${p}-${++sequencia}`;

/** As opções do campo, nas pastas do editor (a sem pasta sempre primeiro, mesmo vazia). */
export function pastasDoEditor(opcoes: readonly OpcaoDoCampo[]): PastaRascunho[] {
  const grupos = pastasDasCaixinhas(opcoes);
  const comoRascunho = (o: OpcaoDoCampo): CaixinhaRascunho => ({ chave: o.id, id: o.id, nome: o.nome, ativa: o.ativa });
  const sem = grupos.find((g) => g.pasta === null);
  return [
    { chave: 'sem', nome: '', caixinhas: (sem?.opcoes ?? []).map(comoRascunho) },
    ...grupos.filter((g) => g.pasta !== null).map((g) => ({ chave: novaChave('pasta'), nome: g.pasta!, caixinhas: g.opcoes.map(comoRascunho) })),
  ];
}

/** As caixinhas na ordem para gravar (a pasta vazia não fica). */
export function caixinhasParaGravar(pastas: readonly PastaRascunho[]): CaixinhaParaGravar[] {
  return pastas.flatMap((p) => p.caixinhas.map((c) => ({ ...(c.id ? { id: c.id } : {}), nome: c.nome.trim(), ativa: c.ativa, pasta: p.nome.trim() || null })))
    .filter((c) => c.nome || c.id);
}

/** O que impede de salvar (nulo: pode). */
export function problemaNasPastas(pastas: readonly PastaRascunho[]): string | null {
  const todas = pastas.flatMap((p) => p.caixinhas);
  if (todas.some((c) => !c.nome.trim())) return 'Dê um nome a cada caixinha (ou tire a que ficou vazia).';
  if (!todas.some((c) => c.ativa)) return 'As caixinhas precisam de pelo menos uma opção.';
  const vistas = new Set<string>();
  for (const c of todas) {
    if (vistas.has(paraBusca(c.nome))) return `Duas caixinhas com o nome ${c.nome.trim()} (uma delas pode estar desativada).`;
    vistas.add(paraBusca(c.nome));
  }
  const pastasComNome = pastas.filter((p) => p.chave !== 'sem');
  if (pastasComNome.some((p) => !p.nome.trim() && p.caixinhas.length)) return 'Dê um nome a cada pasta.';
  const nomes = new Set<string>();
  for (const p of pastasComNome) {
    if (!p.nome.trim()) continue;
    if (nomes.has(paraBusca(p.nome))) return `Duas pastas com o nome ${p.nome.trim()}.`;
    nomes.add(paraBusca(p.nome));
  }
  return null;
}

export function EditorDasCaixinhas({ pastas, onChange, id = 'caixinhas' }: { pastas: PastaRascunho[]; onChange: (p: PastaRascunho[]) => void; id?: string }) {
  const total = pastas.reduce((n, p) => n + p.caixinhas.length, 0);
  const temPastas = pastas.some((p) => p.chave !== 'sem');
  const mudarPasta = (chave: string, o: Partial<PastaRascunho>) => onChange(pastas.map((p) => (p.chave === chave ? { ...p, ...o } : p)));
  const mudarCaixinha = (chave: string, o: Partial<CaixinhaRascunho>) =>
    onChange(pastas.map((p) => ({ ...p, caixinhas: p.caixinhas.map((c) => (c.chave === chave ? { ...c, ...o } : c)) })));
  const tirarCaixinha = (chave: string) => onChange(pastas.map((p) => ({ ...p, caixinhas: p.caixinhas.filter((c) => c.chave !== chave) })));
  // as pastas que aparecem (a "sem pasta" só quando tem caixinha ou quando não há pastas): é por elas que a caixinha anda
  const visiveis = pastas.filter((p) => p.chave !== 'sem' || p.caixinhas.length || !temPastas);
  const moverCaixinha = (pi: number, ci: number, delta: number) => {
    const n = pastas.map((p) => ({ ...p, caixinhas: [...p.caixinhas] }));
    const p = n.findIndex((x) => x.chave === visiveis[pi]!.chave);
    const lista = n[p]!.caixinhas;
    const j = ci + delta;
    if (j >= 0 && j < lista.length) { [lista[ci], lista[j]] = [lista[j]!, lista[ci]!]; onChange(n); return; }
    // na ponta: vai para a pasta de cima (no fim) ou para a de baixo (no começo); a "sem pasta" entra quando há pastas
    const alvo = delta < 0 ? (pi > 0 ? visiveis[pi - 1] : visiveis[pi]!.chave !== 'sem' ? pastas.find((x) => x.chave === 'sem') : undefined) : visiveis[pi + 1];
    if (!alvo) return;
    const [c] = lista.splice(ci, 1);
    const destino = n.find((x) => x.chave === alvo.chave)!.caixinhas;
    if (delta < 0) destino.push(c!); else destino.unshift(c!);
    onChange(n);
  };
  const moverPasta = (chave: string, delta: number) => {
    const so = pastas.filter((p) => p.chave !== 'sem');
    const i = so.findIndex((p) => p.chave === chave);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= so.length) return;
    [so[i], so[j]] = [so[j]!, so[i]!];
    onChange([pastas.find((p) => p.chave === 'sem')!, ...so]);
  };
  const tirarPasta = (chave: string) => {
    // as caixinhas dela ficam sem pasta (nada se perde); as novas, ainda não salvas, também
    const p = pastas.find((x) => x.chave === chave)!;
    onChange(pastas.filter((x) => x.chave !== chave).map((x) => (x.chave === 'sem' ? { ...x, caixinhas: [...x.caixinhas, ...p.caixinhas] } : x)));
  };
  const novaPasta = () => {
    const chave = novaChave('pasta');
    onChange([...pastas, { chave, nome: '', caixinhas: [] }]);
    window.setTimeout(() => document.getElementById(`${id}-pasta-${chave}`)?.focus(), 0);
  };
  const incluir = (chave: string, texto: string) => {
    // várias de uma vez: uma por linha (ou separadas por ponto e vírgula)
    const existentes = pastas.flatMap((p) => p.caixinhas);
    const nomes = etiquetasUnicas(texto.split(/[;\n]/).map((x) => x.trim().slice(0, 60)).filter(Boolean))
      .filter((n) => !existentes.some((o) => paraBusca(o.nome) === paraBusca(n)))
      .slice(0, Math.max(0, MAX_OPCOES_DO_CAMPO - existentes.length));
    if (nomes.length) onChange(pastas.map((p) => (p.chave === chave ? { ...p, caixinhas: [...p.caixinhas, ...nomes.map((nome) => ({ chave: novaChave('nova'), nome, ativa: true }))] } : p)));
  };

  const pastasComNome = pastas.filter((p) => p.chave !== 'sem');
  return (
    <div className="min-w-0 flex flex-col gap-3" id={id}>
      {visiveis.map((p, pi) => {
        const sem = p.chave === 'sem';
        const ativas = p.caixinhas.filter((c) => c.ativa).length;
        const k = pastasComNome.findIndex((x) => x.chave === p.chave);
        return (
          <section key={p.chave} className={temPastas ? 'rounded-lg border border-line' : ''} aria-label={sem ? (temPastas ? 'As caixinhas sem pasta' : 'As caixinhas') : `A pasta ${p.nome || 'nova'}`}>
            {temPastas && (
              <div className="flex items-center gap-1.5 px-2.5 py-2 border-b border-line bg-surface-2/50 rounded-t-lg">
                <Folder size={15} className="text-muted shrink-0" aria-hidden />
                {sem ? (
                  <span className="text-[13px] font-semibold text-ink-2 flex-1">Sem pasta</span>
                ) : (
                  <input className="input py-1 text-[13.5px] font-semibold min-w-0 flex-1" id={`${id}-pasta-${p.chave}`} value={p.nome} maxLength={40} placeholder="Nome da pasta (ex.: Asterisk)"
                    aria-label="Nome da pasta" onChange={(e) => mudarPasta(p.chave, { nome: e.target.value })} />
                )}
                <span className="text-[12px] text-muted tnum shrink-0 px-1">{ativas} {ativas === 1 ? 'caixinha' : 'caixinhas'}</span>
                {!sem && (
                  <span className="flex shrink-0">
                    <IconeDoEditor rotulo={`Subir a pasta ${p.nome || 'nova'}`} desativado={k === 0} onClick={() => moverPasta(p.chave, -1)}><ArrowUp size={14} /></IconeDoEditor>
                    <IconeDoEditor rotulo={`Descer a pasta ${p.nome || 'nova'}`} desativado={k === pastasComNome.length - 1} onClick={() => moverPasta(p.chave, 1)}><ArrowDown size={14} /></IconeDoEditor>
                    <IconeDoEditor rotulo={`Tirar a pasta ${p.nome || 'nova'} (as caixinhas dela ficam sem pasta)`} perigo onClick={() => tirarPasta(p.chave)}><X size={14} /></IconeDoEditor>
                  </span>
                )}
              </div>
            )}
            <div className={temPastas ? 'p-2.5' : ''}>
              {p.caixinhas.length > 0 && (
                <ol className="flex flex-col gap-1 mb-2">
                  {p.caixinhas.map((c, ci) => {
                    const primeira = pi === 0 && ci === 0 && (sem || !temPastas || !pastas.find((x) => x.chave === 'sem'));
                    const ultima = pi === visiveis.length - 1 && ci === p.caixinhas.length - 1;
                    return (
                      <li key={c.chave} className="flex items-center gap-1">
                        <span className="flex shrink-0">
                          <IconeDoEditor rotulo={`Subir ${c.nome || 'a caixinha'}`} desativado={primeira} onClick={() => moverCaixinha(pi, ci, -1)}><ArrowUp size={14} /></IconeDoEditor>
                          <IconeDoEditor rotulo={`Descer ${c.nome || 'a caixinha'}`} desativado={ultima} onClick={() => moverCaixinha(pi, ci, 1)}><ArrowDown size={14} /></IconeDoEditor>
                        </span>
                        <input className={`input py-1.5 text-[13.5px] min-w-0 flex-1 ${c.ativa ? '' : 'line-through text-muted'}`} value={c.nome} maxLength={60} disabled={!c.ativa}
                          aria-label={`Caixinha ${ci + 1}${p.nome ? ` da pasta ${p.nome}` : ''}`} onChange={(e) => mudarCaixinha(c.chave, { nome: e.target.value })} />
                        {c.ativa ? (
                          <IconeDoEditor rotulo={c.id ? `Desativar a caixinha ${c.nome}` : `Tirar a caixinha ${c.nome || 'nova'}`} perigo
                            onClick={() => (c.id ? mudarCaixinha(c.chave, { ativa: false }) : tirarCaixinha(c.chave))}><X size={14} /></IconeDoEditor>
                        ) : (
                          <button type="button" className="btn-ghost btn-sm shrink-0 text-[12.5px]" onClick={() => mudarCaixinha(c.chave, { ativa: true })} title="Os cards que já marcaram esta caixinha continuam com ela">
                            <Undo2 size={13} /> Reativar
                          </button>
                        )}
                      </li>
                    );
                  })}
                </ol>
              )}
              <IncluirCaixinha id={`${id}-incluir-${p.chave}`} cheio={total >= MAX_OPCOES_DO_CAMPO} vazio={!total} onIncluir={(t) => incluir(p.chave, t)} />
            </div>
          </section>
        );
      })}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <button type="button" className="btn-secondary btn-sm" id={`${id}-nova-pasta`} onClick={novaPasta}><FolderPlus size={14} /> Nova pasta</button>
        <span className="text-[12.5px] text-muted">
          Enter inclui (colar uma lista, uma por linha, inclui todas). As setas levam a caixinha de uma pasta para a outra. A caixinha que já foi marcada não some: fica desativada.
        </span>
      </div>
    </div>
  );
}

function IncluirCaixinha({ id, cheio, vazio, onIncluir }: { id: string; cheio: boolean; vazio: boolean; onIncluir: (t: string) => void }) {
  const [t, setT] = useState('');
  const incluir = (texto = t) => { if (texto.trim()) onIncluir(texto); setT(''); };
  return (
    <div className="flex gap-1.5">
      <input className="input py-1.5 text-[13.5px] min-w-0" id={id} value={t} maxLength={600} placeholder={vazio ? 'Ex.: Criação do ambiente' : 'Incluir caixinha'} aria-label="Incluir caixinha"
        onChange={(e) => setT(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); incluir(); } }}
        onPaste={(e) => {
          const colado = e.clipboardData.getData('text');
          if (colado.includes('\n')) { e.preventDefault(); incluir(colado); }
        }} />
      <button type="button" className="btn-secondary btn-sm shrink-0" onClick={() => incluir()} disabled={!t.trim() || cheio}><Plus size={14} /> Incluir</button>
    </div>
  );
}

function IconeDoEditor({ rotulo, onClick, desativado, perigo, children }: { rotulo: string; onClick: () => void; desativado?: boolean; perigo?: boolean; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} disabled={desativado} aria-label={rotulo} title={rotulo}
      className={`p-1.5 rounded-md text-ink-2 hover:bg-surface-2 disabled:opacity-30 disabled:hover:bg-transparent ${perigo ? 'hover:text-bad' : 'hover:text-ink'}`}>
      {children}
    </button>
  );
}
