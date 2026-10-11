/**
 * A classificação do chamado, na coluna do lado: o assunto (o caminho inteiro, só os ativos do
 * painel), o tipo (as opções do painel), a gravidade (com a dica de cada uma), o alcance e a
 * prioridade — com a sugerida ao lado; escolher outra pede o motivo, que vai junto e fica à vista.
 * Depois, os produtos e as operadoras (os do cliente primeiro, e os outros do catálogo) e as
 * etiquetas, inteiras. ("O que foi afetado" saiu na prévia: "não precisa desse campo", o Luan.)
 *
 * E o cartão do responsável e de quem acompanha o chamado.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Check, Plus, Tags, UserRound, X } from 'lucide-react';
import {
  ALCANCES, caminhoDoAssunto, DICA_GRAVIDADE, DICA_PRIORIDADE, emOrdemDeArvore, etiquetasUnicas, GRAVIDADES, NOME_ALCANCE, NOME_GRAVIDADE,
  NOME_PRIORIDADE, paraBusca, PRIORIDADES,
  type Alcance, type ChamadoAlterarEntrada, type Gravidade, type Prioridade,
} from '@gestor/shared';
import { api } from '../../../api/index.js';
import { Campo, Chip, EscolherComBusca, Modal, Spinner } from '../../../components/ui/index.js';
import { Avatar } from '../comum.js';
import { ErroPerto, MarcaFalta, Secao, useAberta, useAcao, usePosicaoFlutuante } from './base.js';

/** Um campo da classificação: o rótulo (com a marca do que falta e a rodinha), o controle e o erro. */
function Linha({ id, campo, rotulo, ocupado, erro, children, extra }: { id: string; campo: string; rotulo: string; ocupado?: boolean; erro?: string | null; children: ReactNode; extra?: ReactNode }) {
  const { faltando } = useAberta();
  return (
    <div id={id} className={`rounded-md scroll-mt-24 transition-shadow ${faltando.has(campo) ? 'border-l-[3px] border-signal pl-2' : ''}`}>
      <div className="flex flex-wrap items-center gap-1.5 mb-1">
        <span className="label mb-0">{rotulo}</span>
        <MarcaFalta campo={campo} />
        {ocupado && <Spinner className="!w-3.5 !h-3.5" />}
        {extra && <span className="ml-auto">{extra}</span>}
      </div>
      {children}
      <ErroPerto erro={erro} />
    </div>
  );
}

export function Classificacao() {
  const { f, opcoes, painel, pode } = useAberta();
  const assunto = useAcao();
  const tipo = useAcao();
  const grav = useAcao();
  const alc = useAcao();
  const prio = useAcao();
  const [trocando, setTrocando] = useState<Prioridade | null>(null);

  const mudar = (a: ReturnType<typeof useAcao>, d: ChamadoAlterarEntrada) => void a.rodar(() => api.atendimento.alterar(f.id, d));

  const assuntos = useMemo(() => {
    const doPainel = opcoes.assuntos.filter((a) => a.painelId === f.painelId && (a.ativo || a.id === f.assunto?.id));
    return emOrdemDeArvore(doPainel).map((a) => ({ id: a.id, nome: caminhoDoAssunto(a.id, opcoes.assuntos), dica: a.descricao ?? undefined }));
  }, [opcoes.assuntos, f.painelId, f.assunto?.id]);
  const descricaoDoAssunto = f.assunto ? opcoes.assuntos.find((a) => a.id === f.assunto!.id)?.descricao : null;
  const tipos = painel?.ajustes.tipos ?? [];
  const sugerida = f.prioridadeSugerida;

  const escolherPrioridade = (p: Prioridade | null) => {
    if (p === f.prioridade) return;
    // trocar a sugerida pede o motivo (vai junto e fica no histórico)
    if (p && sugerida && p !== sugerida) { setTrocando(p); return; }
    mudar(prio, { prioridade: p });
  };

  return (
    <Secao titulo="Classificação" icone={<Tags size={16} />}>
      <div className="flex flex-col gap-3.5">
        <Linha id="campo-assunto" campo="assunto" rotulo="Assunto" ocupado={assunto.ocupado} erro={assunto.erro}>
          {pode ? (
            <EscolherComBusca valor={f.assunto?.id ?? ''} opcoes={assuntos} onChange={(id) => mudar(assunto, { assuntoId: id || null })} vazio="Sem assunto"
              placeholder="Escolha o assunto…" procurar="Procurar assunto (ex.: rota, ramal)…" className="input w-full" largura="w-[420px]" rotulo="Assunto" />
          ) : <p className="text-[14px]">{f.assunto?.caminho ?? <span className="text-muted">—</span>}</p>}
          {/* o caminho longo não cabe na caixa: o fim dele (o mais específico) aparece aqui embaixo */}
          {pode && f.assunto && f.assunto.caminho.length > 32 && <p className="text-[12px] text-ink-2 mt-1 break-words">{f.assunto.caminho}</p>}
          {f.assunto && !f.assunto.ativo && <p className="text-[12px] text-signal mt-1">Este assunto foi desativado nos Ajustes.</p>}
          {descricaoDoAssunto && <p className="text-[12px] text-muted mt-1">{descricaoDoAssunto}</p>}
          {!assuntos.length && pode && <p className="text-[12px] text-muted mt-1">O painel {painel?.nome} ainda não tem assuntos (Chamados › Ajustes › Assuntos).</p>}
        </Linha>

        <Linha id="campo-tipo" campo="tipo" rotulo="Tipo" ocupado={tipo.ocupado} erro={tipo.erro}>
          {pode ? (
            <select className="input" value={f.tipo ?? ''} onChange={(e) => mudar(tipo, { tipo: e.target.value || null })} aria-label="Tipo">
              <option value="">—</option>
              {tipos.map((t) => <option key={t} value={t}>{t}</option>)}
              {f.tipo && !tipos.includes(f.tipo) && <option value={f.tipo}>{f.tipo} (fora do painel)</option>}
            </select>
          ) : <p className="text-[14px]">{f.tipo ?? <span className="text-muted">—</span>}</p>}
        </Linha>

        {/* a gravidade e o alcance, juntos, sugerem a prioridade (logo embaixo) */}
        <Linha id="campo-gravidade" campo="gravidade" rotulo="Gravidade" ocupado={grav.ocupado} erro={grav.erro}>
          {pode ? (
            <select className="input" value={f.gravidade ?? ''} onChange={(e) => mudar(grav, { gravidade: (e.target.value || null) as Gravidade | null })} aria-label="Gravidade">
              <option value="">—</option>
              {GRAVIDADES.map((g) => <option key={g} value={g} title={DICA_GRAVIDADE[g]}>{NOME_GRAVIDADE[g]}</option>)}
            </select>
          ) : <p className="text-[14px]">{f.gravidade ? NOME_GRAVIDADE[f.gravidade] : <span className="text-muted">—</span>}</p>}
          {f.gravidade && <p className="text-[12px] text-muted mt-1">{DICA_GRAVIDADE[f.gravidade]}</p>}
        </Linha>

        <Linha id="campo-alcance" campo="alcance" rotulo="Alcance" ocupado={alc.ocupado} erro={alc.erro}>
          {pode ? (
            <select className="input" value={f.alcance ?? ''} onChange={(e) => mudar(alc, { alcance: (e.target.value || null) as Alcance | null })} aria-label="Alcance">
              <option value="">—</option>
              {ALCANCES.map((a) => <option key={a} value={a}>{NOME_ALCANCE[a]}</option>)}
            </select>
          ) : <p className="text-[14px]">{f.alcance ? NOME_ALCANCE[f.alcance] : <span className="text-muted">—</span>}</p>}
        </Linha>

        <Linha id="campo-prioridade" campo="prioridade" rotulo="Prioridade" ocupado={prio.ocupado} erro={prio.erro}
          extra={pode && sugerida && f.prioridade !== sugerida && (
            <button type="button" className="btn-ghost btn-sm -my-1 text-[12px]" onClick={() => escolherPrioridade(sugerida)}>Usar a sugerida</button>
          )}>
          {pode ? (
            <select className="input" value={f.prioridade ?? ''} onChange={(e) => escolherPrioridade((e.target.value || null) as Prioridade | null)} aria-label="Prioridade">
              <option value="">—</option>
              {PRIORIDADES.map((p) => <option key={p} value={p} title={DICA_PRIORIDADE[p]}>{NOME_PRIORIDADE[p]}{p === sugerida ? ' (sugerida)' : ''}</option>)}
            </select>
          ) : <p className="text-[14px]">{f.prioridade ? NOME_PRIORIDADE[f.prioridade] : <span className="text-muted">—</span>}</p>}
          {f.prioridade && <p className="text-[12px] text-muted mt-1">{NOME_PRIORIDADE[f.prioridade]}: {DICA_PRIORIDADE[f.prioridade].toLocaleLowerCase('pt-BR')}.</p>}
          <p className="text-[12px] text-muted mt-0.5">
            {sugerida
              ? <>Sugerida: <b className="text-ink-2">{NOME_PRIORIDADE[sugerida]}</b>, pela gravidade e pelo alcance.</>
              : 'Escolha a gravidade e o alcance para o Gestor sugerir a prioridade.'}
          </p>
          {f.motivoPrioridade && f.prioridade !== sugerida && (
            <p className="text-[12.5px] mt-1 rounded-md bg-surface-2 px-2 py-1"><span className="text-muted">Trocada à mão:</span> {f.motivoPrioridade}</p>
          )}
        </Linha>

        <ProdutosEOperadoras />
        <Etiquetas />
      </div>
      {trocando && <JanelaMotivoPrioridade para={trocando} onFechar={() => setTrocando(null)} />}
    </Secao>
  );
}

/** Trocar a prioridade sugerida pede o motivo: ele vai junto no pedido e fica embaixo da prioridade. */
function JanelaMotivoPrioridade({ para, onFechar }: { para: Prioridade; onFechar: () => void }) {
  const { f } = useAberta();
  const acao = useAcao();
  const [motivo, setMotivo] = useState('');
  const texto = useRef<HTMLTextAreaElement>(null);
  const trocar = async () => {
    if (!motivo.trim()) { acao.setErro('Diga por que trocar a prioridade sugerida.'); texto.current?.focus(); return; }
    const r = await acao.rodar(() => api.atendimento.alterar(f.id, { prioridade: para, motivoPrioridade: motivo.trim() }), `Prioridade: ${NOME_PRIORIDADE[para]}`);
    if (r.ok) onFechar();
  };
  return (
    <Modal open onClose={onFechar} titulo={`Prioridade ${NOME_PRIORIDADE[para]} no lugar da sugerida`}
      rodape={<>
        <button type="button" className="btn-secondary" onClick={onFechar}>Cancelar</button>
        <button type="button" className="btn-primary" disabled={acao.ocupado} onClick={() => void trocar()}>{acao.ocupado ? <Spinner className="text-white" /> : 'Trocar a prioridade'}</button>
      </>}>
      <p className="text-sm text-ink-2 mb-3">
        Pela gravidade e pelo alcance, o Gestor sugere <b>{f.prioridadeSugerida ? NOME_PRIORIDADE[f.prioridadeSugerida] : '—'}</b>. A prioridade muda o prazo do chamado; o motivo fica no histórico e embaixo da prioridade.
      </p>
      <Campo label="Por que outra prioridade?">
        <textarea ref={texto} className="input min-h-[80px]" autoFocus maxLength={300} value={motivo} onChange={(e) => setMotivo(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) void trocar(); }}
          placeholder="Ex.: é a recepção do hospital: parada, ninguém marca consulta" />
      </Campo>
      <ErroPerto erro={acao.erro} />
    </Modal>
  );
}

// =====================================================================
//  ESCOLHER VÁRIOS (produtos, operadoras)
// =====================================================================

type Grupo = { titulo: string; itens: Array<{ id: string; nome: string; cor?: string }> };

/** Um painel com caixinhas, em grupos ("Do cliente", "Outros do catálogo"); Salvar manda tudo de uma vez. */
function EscolherVarios({ titulo, grupos, escolhidos, onSalvar, ocupado }: { titulo: string; grupos: Grupo[]; escolhidos: string[]; onSalvar: (ids: string[]) => Promise<boolean>; ocupado: boolean }) {
  const [aberto, setAberto] = useState(false);
  const [marcados, setMarcados] = useState<Set<string>>(new Set());
  const [busca, setBusca] = useState('');
  const caixa = useRef<HTMLDivElement>(null);
  const botao = useRef<HTMLButtonElement>(null);
  const painel = useRef<HTMLDivElement>(null);
  const pos = usePosicaoFlutuante(aberto, botao, painel, 'direita');
  const total = grupos.reduce((s, g) => s + g.itens.length, 0);
  const abrir = () => { setMarcados(new Set(escolhidos)); setBusca(''); setAberto(true); };
  const fechar = (devolver = true) => { setAberto(false); if (devolver) botao.current?.focus(); };
  const alternar = (id: string) => setMarcados((m) => { const n = new Set(m); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const salvar = async () => { if (await onSalvar([...marcados])) fechar(); };
  // clicar fora fecha (sem cobrir a tela: a página continua rolando)
  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => { if (caixa.current && !caixa.current.contains(e.target as Node)) setAberto(false); };
    document.addEventListener('mousedown', fora);
    return () => document.removeEventListener('mousedown', fora);
  }, [aberto]);
  // o foco vai para a busca (ou a primeira caixinha) quando o painel já está à vista
  useEffect(() => { if (aberto && pos) painel.current?.querySelector<HTMLElement>('input')?.focus(); }, [aberto, !!pos]);
  const b = paraBusca(busca);
  return (
    <div className="relative" ref={caixa}>
      <button ref={botao} type="button" className="btn-ghost btn-sm -my-1 text-[12.5px]" aria-expanded={aberto} aria-haspopup="dialog" onClick={() => (aberto ? fechar(false) : abrir())}>Mudar</button>
      {aberto && (
        <div ref={painel} role="dialog" aria-label={titulo} className="fixed z-40 card p-2.5 shadow-lg flex flex-col"
          onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); fechar(); } }}
          style={{ left: pos?.left ?? -9999, top: pos?.top, bottom: pos?.bottom, maxHeight: Math.min(pos?.maxHeight ?? 420, 460), maxWidth: 'calc(100vw - 16px)', visibility: pos ? 'visible' : 'hidden', boxShadow: '0 10px 30px rgba(0,0,0,.18)' }}>
          <div className="w-[300px] max-w-full flex flex-col min-h-0">
            <div className="eyebrow mb-1.5">{titulo}</div>
            {total > 8 && <input className="input py-1.5 text-[13px] mb-1.5" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Procurar…" aria-label="Procurar" />}
            <div className="overflow-y-auto min-h-0 flex-1">
              {grupos.map((g) => {
                const itens = g.itens.filter((i) => !b || paraBusca(i.nome).includes(b));
                if (!itens.length) return null;
                return (
                  <div key={g.titulo} className="mb-1.5">
                    <div className="text-[11.5px] font-semibold text-muted px-1 py-0.5">{g.titulo}</div>
                    {itens.map((i) => (
                      <label key={i.id} className="flex items-center gap-2 px-1 py-1 rounded hover:bg-surface-2 cursor-pointer text-[13.5px]">
                        <input type="checkbox" checked={marcados.has(i.id)} onChange={() => alternar(i.id)} />
                        {i.cor && <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: i.cor }} aria-hidden />}
                        <span className="min-w-0 truncate">{i.nome}</span>
                      </label>
                    ))}
                  </div>
                );
              })}
              {!total && <p className="text-[13px] text-muted px-1">Nada no catálogo.</p>}
            </div>
            <div className="flex justify-end gap-2 pt-2 mt-1 border-t border-line">
              <button type="button" className="btn-secondary btn-sm" onClick={() => fechar()}>Cancelar</button>
              <button type="button" className="btn-primary btn-sm" disabled={ocupado} onClick={() => void salvar()}>{ocupado ? <Spinner className="text-white" /> : <><Check size={14} /> Salvar</>}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ProdutosEOperadoras() {
  const { f, opcoes, cadastro, pode } = useAberta();
  const prod = useAcao();
  const oper = useAcao();
  const doCliente = new Set(cadastro?.produtos.map((p) => p.id) ?? []);
  const operDoCliente = new Set(cadastro?.operadoras.map((o) => o.id) ?? []);
  const gruposProdutos: Grupo[] = [
    ...(cadastro?.produtos.length ? [{ titulo: `Do cliente (${f.cliente?.nome ?? ''})`, itens: cadastro.produtos.map((p) => ({ id: p.id, nome: p.nome, cor: p.cor })) }] : []),
    { titulo: cadastro?.produtos.length ? 'Outros do catálogo' : 'Do catálogo', itens: opcoes.produtos.filter((p) => !doCliente.has(p.id)).map((p) => ({ id: p.id, nome: p.nome, cor: p.cor })) },
  ];
  const gruposOperadoras: Grupo[] = [
    ...(cadastro?.operadoras.length ? [{ titulo: `Dos circuitos do cliente`, itens: cadastro.operadoras }] : []),
    { titulo: cadastro?.operadoras.length ? 'Outras do catálogo' : 'Do catálogo', itens: opcoes.operadoras.filter((o) => !operDoCliente.has(o.id)) },
  ];
  const salvar = (a: ReturnType<typeof useAcao>, d: ChamadoAlterarEntrada) => a.rodar(() => api.atendimento.alterar(f.id, d)).then((r) => r.ok);
  return (
    <>
      <Linha id="campo-produtos" campo="produto" rotulo="Produtos" ocupado={prod.ocupado} erro={prod.erro}
        extra={pode && <EscolherVarios titulo="Produtos do chamado" grupos={gruposProdutos} escolhidos={f.produtos.map((p) => p.id)} ocupado={prod.ocupado} onSalvar={(ids) => salvar(prod, { produtos: ids })} />}>
        {f.produtos.length ? (
          <div className="flex flex-wrap gap-1">{f.produtos.map((p) => <Chip key={p.id} color={p.cor}>{p.nome}</Chip>)}</div>
        ) : <p className="text-[13px] text-muted">Nenhum.</p>}
      </Linha>
      <Linha id="campo-operadoras" campo="operadora" rotulo="Operadoras" ocupado={oper.ocupado} erro={oper.erro}
        extra={pode && <EscolherVarios titulo="Operadoras do chamado" grupos={gruposOperadoras} escolhidos={f.operadoras.map((o) => o.id)} ocupado={oper.ocupado} onSalvar={(ids) => salvar(oper, { operadoras: ids })} />}>
        {f.operadoras.length ? (
          <div className="flex flex-wrap gap-1">{f.operadoras.map((o) => <Chip key={o.id} tone="neutral">{o.nome}</Chip>)}</div>
        ) : <p className="text-[13px] text-muted">Nenhuma.</p>}
      </Linha>
    </>
  );
}

// =====================================================================
//  AS ETIQUETAS (inteiras: nada de nome cortado)
// =====================================================================

function Etiquetas() {
  const { f, opcoes, pode } = useAberta();
  const acao = useAcao();
  const [nova, setNova] = useState('');
  const sugestoes = opcoes.etiquetas.filter((e) => !f.etiquetas.some((x) => paraBusca(x) === paraBusca(e)));
  const incluir = async () => {
    const t = nova.trim();
    if (!t) return;
    if (f.etiquetas.length >= 20) { acao.setErro('No máximo 20 etiquetas por chamado.'); return; }
    const r = await acao.rodar(() => api.atendimento.alterar(f.id, { etiquetas: etiquetasUnicas([...f.etiquetas, t]) }));
    if (r.ok) setNova('');
  };
  return (
    <Linha id="campo-etiquetas" campo="etiquetas" rotulo="Etiquetas" ocupado={acao.ocupado} erro={acao.erro}>
      {f.etiquetas.length > 0 && (
        <ul className="flex flex-wrap gap-1 mb-1.5">
          {f.etiquetas.map((e) => (
            <li key={e} className="chip bg-surface-2 text-ink-2 font-medium max-w-full">
              <span className="break-words">{e}</span>
              {pode && <button type="button" className="text-muted hover:text-bad -mr-0.5" disabled={acao.ocupado} aria-label={`Tirar a etiqueta ${e}`}
                onClick={() => void acao.rodar(() => api.atendimento.alterar(f.id, { etiquetas: f.etiquetas.filter((x) => x !== e) }))}><X size={12} /></button>}
            </li>
          ))}
        </ul>
      )}
      {!f.etiquetas.length && !pode && <p className="text-[13px] text-muted">Nenhuma.</p>}
      {pode && (
        <form className="flex gap-1.5" autoComplete="off" onSubmit={(e) => { e.preventDefault(); void incluir(); }}>
          <input className="input py-1.5 text-[13px] min-w-0" list="etiquetas-sugeridas" maxLength={40} value={nova} onChange={(e) => setNova(e.target.value)} placeholder="Nova etiqueta" aria-label="Nova etiqueta" />
          <datalist id="etiquetas-sugeridas">{sugestoes.map((e) => <option key={e} value={e} />)}</datalist>
          <button type="submit" className="btn-secondary btn-sm shrink-0" disabled={!nova.trim() || acao.ocupado}><Plus size={14} /> Pôr</button>
        </form>
      )}
    </Linha>
  );
}

// =====================================================================
//  O RESPONSÁVEL E QUEM ACOMPANHA
// =====================================================================

export function Responsavel() {
  const { f, opcoes, pode, eu } = useAberta();
  const resp = useAcao();
  const obs = useAcao();
  const ativas = opcoes.pessoas.filter((p) => p.ativo);
  const opcoesPessoas = ativas.map((p) => ({ id: p.id, nome: p.nome }));
  const fora = ativas.filter((p) => !f.observadores.some((o) => o.id === p.id)).map((p) => ({ id: p.id, nome: p.nome }));
  const acompanhar = (ids: string[], ok: string) => void obs.rodar(() => api.atendimento.alterar(f.id, { observadores: ids }), ok);
  return (
    <Secao titulo="Responsável" icone={<UserRound size={16} />}>
      <Linha id="campo-responsavel" campo="responsavel" rotulo="Quem está com o chamado" ocupado={resp.ocupado} erro={resp.erro}>
        {pode ? (
          <EscolherComBusca valor={f.responsavel?.id ?? ''} opcoes={opcoesPessoas} vazio="Ninguém (fica na fila da etapa)" className="input w-full" rotulo="Responsável" procurar="Procurar pessoa…"
            onChange={(id) => void resp.rodar(() => api.atendimento.alterar(f.id, { responsavelId: id || null }), id ? `Responsável: ${ativas.find((p) => p.id === id)?.nome ?? ''}` : 'O chamado ficou sem responsável')} />
        ) : f.responsavel ? (
          <p className="flex items-center gap-2 text-[14px]"><Avatar nome={f.responsavel.nome} /> {f.responsavel.nome}</p>
        ) : <p className="text-[13px] text-muted italic">Sem dono (na fila da etapa)</p>}
        {pode && eu && f.responsavel?.id !== eu.id && (
          <p className="text-[12px] text-muted mt-1">Para ficar com ele, use <b>Assumir</b> na barra de cima.</p>
        )}
      </Linha>

      <div className="mt-3.5">
        <Linha id="campo-observadores" campo="observadores" rotulo="Quem acompanha" ocupado={obs.ocupado} erro={obs.erro}
          extra={pode && fora.length > 0 && (
            <EscolherComBusca valor="" opcoes={fora} rotulo="Incluir quem acompanha" procurar="Procurar pessoa…"
              onChange={(id) => { const p = ativas.find((x) => x.id === id); if (p) acompanhar([...f.observadores.map((o) => o.id), id], `${p.nome} passou a acompanhar`); }}
              gatilho={(abrir) => <button type="button" className="btn-ghost btn-sm -my-1 text-[12.5px]" onClick={abrir}><Plus size={13} /> Incluir</button>} />
          )}>
          {f.observadores.length ? (
            <ul className="flex flex-wrap gap-1.5">
              {f.observadores.map((o) => (
                <li key={o.id} className="chip bg-surface-2 text-ink-2 font-medium">
                  <Avatar nome={o.nome} tamanho={16} /> {o.nome}{eu?.id === o.id ? ' (você)' : ''}
                  {pode && <button type="button" className="text-muted hover:text-bad -mr-0.5" disabled={obs.ocupado} aria-label={`Tirar ${o.nome} de quem acompanha`}
                    onClick={() => acompanhar(f.observadores.filter((x) => x.id !== o.id).map((x) => x.id), `${o.nome} deixou de acompanhar`)}><X size={12} /></button>}
                </li>
              ))}
            </ul>
          ) : <p className="text-[13px] text-muted">Ninguém. Quem acompanha vê o chamado no Meu dia.</p>}
        </Linha>
      </div>
    </Secao>
  );
}
