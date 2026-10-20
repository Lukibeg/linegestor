/**
 * O seletor das etiquetas (2.0, o pedido do Luan na prévia: "esse menu para escolher as etiquetas não
 * está legal; deixe no padrão do restante do sistema e coloque uma opção de editar a etiqueta — a cor e o
 * nome —, algo parecido com o do Helena").
 *
 * As etiquetas do chamado ficam numa caixa, como os outros campos (cada uma com o X). Clicar na caixa
 * abre a lista, como as outras listas do Gestor: a busca em cima ("Procurar ou criar…"), cada etiqueta
 * com a cor e a marca das que o chamado tem — um clique põe ou tira, e a lista fica aberta para marcar
 * mais de uma. O que foi escrito e não existe vira "Criar etiqueta", com a cor. O lápis de cada uma (para
 * quem cuida dos chamados) abre o editar: o nome e a cor, que valem em todos os chamados que a têm. Usado
 * no Abrir chamado e na ficha.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Check, ChevronDown, Pencil, Plus, Search } from 'lucide-react';
import { chaveDaEtiqueta, corDaEtiqueta, paraBusca, type CorEtiqueta, type EtiquetaComCor } from '@gestor/shared';
import { api } from '../../api/index.js';
import { Spinner, usePosicaoDoPainel } from '../../components/ui/index.js';
import { erroLegivel } from './ajustes/Avisos.js';
import { AMOSTRA_DA_COR, ChipDaEtiqueta, CoresDaEtiqueta } from './comum.js';

/** Quantas etiquetas um chamado pode ter (a regra do servidor). */
const MAXIMO = 20;

type Modo = { tipo: 'lista' } | { tipo: 'criar'; nome: string } | { tipo: 'editar'; nome: string; local: boolean };

export function SeletorDeEtiquetas({ id, valor, catalogo, coresNovas = {}, onMudar, onCriar, onEditarLocal, onEditada, podeMudar, podeEditar, ocupado = false, rotulo = 'Etiquetas' }: {
  id: string;
  /** as etiquetas do chamado (os nomes) */
  valor: string[];
  /** as etiquetas que existem, com a cor (as opções do módulo) */
  catalogo: EtiquetaComCor[];
  /** a cor das novas que ainda não existem (no Abrir chamado, nascem ao abrir) */
  coresNovas?: Record<string, CorEtiqueta>;
  /** pôr ou tirar (a lista nova) */
  onMudar: (v: string[]) => void;
  /** criar uma nova, já no chamado, com a cor */
  onCriar: (nome: string, cor: CorEtiqueta) => void;
  /** editar uma nova que ainda não existe (o Abrir chamado: muda só aqui); sem ele, as novas não se editam */
  onEditarLocal?: (de: string, nome: string, cor: CorEtiqueta) => void;
  /** depois de editar uma que existe (no servidor): o nome antigo e o novo (o Abrir chamado troca na lista dele) */
  onEditada?: (de: string, para: string) => void;
  podeMudar: boolean;
  podeEditar: boolean;
  ocupado?: boolean;
  rotulo?: string;
}) {
  const [aberto, setAberto] = useState(false);
  const [modo, setModo] = useState<Modo>({ tipo: 'lista' });
  const [busca, setBusca] = useState('');
  const [marcado, setMarcado] = useState(0);
  const caixa = useRef<HTMLDivElement>(null);
  const painel = useRef<HTMLDivElement>(null);
  const botao = useRef<HTMLButtonElement>(null);
  const entrada = useRef<HTMLInputElement>(null);
  const pos = usePosicaoDoPainel(aberto, caixa, painel, 'esquerda');

  const mesma = (a: string, b: string) => chaveDaEtiqueta(a) === chaveDaEtiqueta(b);
  const tem = (n: string) => valor.some((v) => mesma(v, n));
  const existe = (n: string) => catalogo.some((e) => mesma(e.nome, n));
  const cor = (n: string) => corDaEtiqueta(catalogo, n, coresNovas);
  const cheio = valor.length >= MAXIMO;

  // a lista: as do chamado primeiro, depois as outras, em ordem de nome (as novas daqui entram também)
  const todas = useMemo(() => {
    const nomes = new Map<string, string>();
    for (const e of catalogo) nomes.set(chaveDaEtiqueta(e.nome), e.nome);
    for (const v of valor) if (!nomes.has(chaveDaEtiqueta(v))) nomes.set(chaveDaEtiqueta(v), v);
    const porNome = (a: string, b: string) => a.localeCompare(b, 'pt-BR', { sensitivity: 'base' });
    const lista = [...nomes.values()];
    return [...lista.filter(tem).sort(porNome), ...lista.filter((n) => !tem(n)).sort(porNome)];
  }, [catalogo, valor]); // eslint-disable-line react-hooks/exhaustive-deps
  const escrito = busca.trim().replace(/\s+/g, ' ');
  const b = paraBusca(escrito);
  const achadas = b ? todas.filter((n) => paraBusca(n).includes(b)) : todas;
  const podeCriar = podeMudar && !!escrito && !todas.some((n) => mesma(n, escrito)) && !cheio;
  /** as linhas da lista (para andar com as setas): as achadas e, no fim, o "Criar" */
  const linhas = podeCriar ? [...achadas, null] : achadas;

  const abrir = () => { if (!podeMudar && !podeEditar) return; setBusca(''); setMarcado(0); setModo({ tipo: 'lista' }); setAberto(true); };
  const fechar = (devolverFoco = true) => { setAberto(false); if (devolverFoco) botao.current?.focus(); };
  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => { if (!caixa.current?.contains(e.target as Node) && !painel.current?.contains(e.target as Node)) fechar(false); };
    document.addEventListener('mousedown', fora);
    return () => document.removeEventListener('mousedown', fora);
  }, [aberto]); // eslint-disable-line react-hooks/exhaustive-deps
  // o foco vai para a busca quando a lista aparece (e volta para ela ao sair do criar e do editar)
  useEffect(() => { if (aberto && pos && modo.tipo === 'lista') entrada.current?.focus(); }, [aberto, !!pos, modo.tipo]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { painel.current?.querySelector<HTMLElement>(`[data-i="${marcado}"]`)?.scrollIntoView({ block: 'nearest' }); }, [marcado]);

  const alternar = (n: string) => {
    if (!podeMudar || ocupado) return;
    if (tem(n)) onMudar(valor.filter((v) => !mesma(v, n)));
    else if (!cheio) onMudar([...valor, n]);
  };
  const escolherLinha = (i: number) => {
    const l = linhas[i];
    if (l === undefined) return;
    if (l === null) setModo({ tipo: 'criar', nome: escrito });
    else alternar(l);
  };
  const tecla = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setMarcado((m) => Math.min(linhas.length - 1, m + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setMarcado((m) => Math.max(0, m - 1)); }
    else if (e.key === 'Enter') { e.preventDefault(); escolherLinha(marcado); }
    // o Esc fecha só a lista, não a janela em volta
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); fechar(); }
    else if (e.key === 'Tab') fechar(false);
  };

  // quem só vê: as etiquetas, sem a caixa de escolher
  if (!podeMudar && !podeEditar) {
    return valor.length
      ? <ul className="flex flex-wrap gap-1">{valor.map((n) => <li key={n} className="max-w-full"><ChipDaEtiqueta nome={n} cor={cor(n)} /></li>)}</ul>
      : <p className="text-[13px] text-muted">Nenhuma.</p>;
  }

  return (
    <div className="relative min-w-0" ref={caixa}>
      {/* a caixa, como os outros campos: clicar no vazio abre a lista */}
      <div className={`input flex flex-wrap items-center gap-1.5 py-1.5 min-h-[40px] ${podeMudar || podeEditar ? 'cursor-pointer' : ''} ${aberto ? 'border-accent' : ''}`}
        onClick={(e) => { if (!(e.target as HTMLElement).closest('button') || e.target === botao.current) { if (aberto) fechar(); else abrir(); } }}>
        {valor.map((n) => (
          <ChipDaEtiqueta key={n} nome={n} cor={cor(n)} desligado={ocupado} onTirar={podeMudar ? () => onMudar(valor.filter((v) => v !== n)) : undefined} />
        ))}
        {(podeMudar || podeEditar) && (
          <button ref={botao} type="button" id={id} className={`inline-flex items-center gap-1 text-[13px] text-muted hover:text-ink ${valor.length ? 'ml-auto px-1' : 'flex-1 text-left'}`}
            aria-haspopup="dialog" aria-expanded={aberto} aria-label={valor.length ? `${rotulo}: escolher mais ou editar` : `${rotulo}: escolher`} onClick={(e) => { e.stopPropagation(); if (aberto) fechar(); else abrir(); }}>
            {!valor.length && <span className="flex-1">Escolher etiquetas…</span>}
            {ocupado ? <Spinner className="w-3.5 h-3.5" /> : <ChevronDown size={15} />}
          </button>
        )}
      </div>

      {aberto && (
        <div ref={painel} role="dialog" aria-label={rotulo} id={`${id}-lista`}
          className="fixed z-40 card p-2 shadow-lg flex flex-col"
          style={{ left: pos?.left ?? -9999, top: pos?.top, bottom: pos?.bottom, maxHeight: Math.min(pos?.maxHeight ?? 380, 440), maxWidth: 'calc(100vw - 16px)', visibility: pos ? 'visible' : 'hidden', boxShadow: '0 10px 30px rgba(0,0,0,.18)' }}>
          <div className="w-[340px] max-w-full flex flex-col min-h-0">
            {modo.tipo === 'lista' ? (
              <>
                <label className="relative block mb-1.5">
                  <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" aria-hidden />
                  <input ref={entrada} className="input py-1.5 pl-8 text-[13.5px]" autoComplete="off" maxLength={40} value={busca} id={`${id}-busca`}
                    placeholder={podeMudar ? 'Procurar ou criar etiqueta…' : 'Procurar etiqueta…'} aria-label="Procurar ou criar etiqueta"
                    onChange={(e) => { setBusca(e.target.value); setMarcado(0); }} onKeyDown={tecla} />
                </label>
                <ul role="listbox" aria-multiselectable="true" aria-label={rotulo} className="overflow-y-auto min-h-0 flex-1">
                  {achadas.map((n, i) => {
                    const marcada = tem(n);
                    const novaDaqui = !existe(n);
                    const editavel = podeEditar && (!novaDaqui || !!onEditarLocal);
                    const travada = !marcada && cheio;
                    return (
                      <li key={n} data-i={i} role="option" aria-selected={marcada} aria-disabled={travada || !podeMudar || undefined} data-etiqueta={n}
                        className={`group flex items-center gap-2 px-2 py-1.5 rounded text-[13.5px] ${i === marcado ? 'bg-surface-2' : ''} ${travada ? 'opacity-50' : podeMudar ? 'cursor-pointer' : ''}`}
                        title={travada ? `No máximo ${MAXIMO} etiquetas por chamado` : undefined}
                        onMouseEnter={() => setMarcado(i)} onMouseDown={(e) => e.preventDefault()} onClick={() => alternar(n)}>
                        <span className={`w-4 h-4 rounded-[4px] border grid place-items-center shrink-0 ${marcada ? 'bg-accent border-accent text-white' : 'border-line-strong'}`} aria-hidden>
                          {marcada && <Check size={12} strokeWidth={3} />}
                        </span>
                        <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${AMOSTRA_DA_COR[cor(n)]}`} aria-hidden />
                        <span className="flex-1 min-w-0 break-words">{n}{novaDaqui && <span className="text-muted text-[12px]"> · nova</span>}</span>
                        {editavel && (
                          <button type="button" className="btn-ghost p-1 -my-1 text-muted hover:text-ink" aria-label={`Editar a etiqueta ${n}`} title="Editar o nome e a cor"
                            onMouseDown={(e) => e.preventDefault()} onClick={(e) => { e.stopPropagation(); setModo({ tipo: 'editar', nome: n, local: novaDaqui }); }}>
                            <Pencil size={13} />
                          </button>
                        )}
                      </li>
                    );
                  })}
                  {podeCriar && (
                    <li data-i={achadas.length} role="option" aria-selected={false} id={`${id}-criar`}
                      className={`flex items-center gap-2 px-2 py-1.5 rounded text-[13.5px] cursor-pointer text-accent-ink ${marcado === achadas.length ? 'bg-surface-2' : ''}`}
                      onMouseEnter={() => setMarcado(achadas.length)} onMouseDown={(e) => e.preventDefault()} onClick={() => setModo({ tipo: 'criar', nome: escrito })}>
                      <Plus size={15} className="shrink-0" /> <span className="min-w-0 break-words">Criar a etiqueta <b>{escrito}</b></span>
                    </li>
                  )}
                  {!achadas.length && !podeCriar && (
                    <li className="px-2 py-2 text-[13px] text-muted">{escrito ? (cheio ? `No máximo ${MAXIMO} etiquetas por chamado.` : `Nada com "${escrito}".`) : 'Nenhuma etiqueta ainda: escreva o nome para criar.'}</li>
                  )}
                </ul>
                {cheio && <p className="text-[12px] text-muted px-2 pt-1.5 border-t border-line mt-1">O chamado já tem {MAXIMO} etiquetas: tire uma para pôr outra.</p>}
              </>
            ) : modo.tipo === 'criar' ? (
              <EditorDeEtiqueta titulo="Nova etiqueta" botao="Criar" inicial={{ nome: modo.nome, cor: 'neutral' }} nomesOcupados={todas}
                onVoltar={() => setModo({ tipo: 'lista' })}
                onSalvar={async (d) => { onCriar(d.nome, d.cor); setBusca(''); setMarcado(0); setModo({ tipo: 'lista' }); }} />
            ) : (
              <EditarNoSeletor nome={modo.nome} cor={cor(modo.nome)} local={modo.local} nomesOcupados={todas.filter((n) => !mesma(n, modo.nome))}
                onEditarLocal={onEditarLocal} onEditada={onEditada} onVoltar={() => setModo({ tipo: 'lista' })} />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** O editar de dentro do seletor: a que existe muda em todos os chamados (pelo servidor); a nova daqui, só aqui. */
function EditarNoSeletor({ nome, cor, local, nomesOcupados, onEditarLocal, onEditada, onVoltar }: {
  nome: string; cor: CorEtiqueta; local: boolean; nomesOcupados: string[];
  onEditarLocal?: (de: string, nome: string, cor: CorEtiqueta) => void; onEditada?: (de: string, para: string) => void; onVoltar: () => void;
}) {
  const qc = useQueryClient();
  return (
    <EditorDeEtiqueta titulo="Editar a etiqueta" botao="Salvar" inicial={{ nome, cor }} nomesOcupados={nomesOcupados} onVoltar={onVoltar}
      dica={local ? 'Ela ainda é nova: nasce assim quando o chamado for aberto.' : 'O nome e a cor valem em todos os chamados que têm a etiqueta.'}
      onSalvar={async (d) => {
        if (local) { onEditarLocal?.(nome, d.nome, d.cor); onVoltar(); return; }
        await api.atendimento.editarEtiquetaPeloNome({ de: nome, nome: d.nome, cor: d.cor });
        onEditada?.(nome, d.nome);
        // o nome novo aparece em todo lugar: nas opções, no quadro, na lista e nas fichas abertas
        await qc.invalidateQueries({ queryKey: ['atendimento'] });
        onVoltar();
      }} />
  );
}

/**
 * O nome e a cor de uma etiqueta (criar ou editar), com a prévia de como ela fica. O nome que já é de
 * outra etiqueta (sem ligar para maiúscula e acento) não passa. Usado no seletor e em Ajustes › Etiquetas.
 */
export function EditorDeEtiqueta({ titulo, botao, inicial, nomesOcupados, dica, onSalvar, onVoltar, naJanela = false }: {
  titulo: string; botao: string; inicial: { nome: string; cor: CorEtiqueta }; nomesOcupados: string[]; dica?: string;
  onSalvar: (d: { nome: string; cor: CorEtiqueta }) => Promise<void>; onVoltar: () => void;
  /** numa janela (Ajustes › Etiquetas): o título é o da janela, e o "Voltar" vira "Cancelar" */
  naJanela?: boolean;
}) {
  const [nome, setNome] = useState(inicial.nome);
  const [cor, setCor] = useState<CorEtiqueta>(inicial.cor);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  const campo = useRef<HTMLInputElement>(null);
  useEffect(() => { campo.current?.focus(); campo.current?.select(); }, []);
  const limpo = nome.trim().replace(/\s+/g, ' ');
  const ocupado = !!limpo && nomesOcupados.some((n) => chaveDaEtiqueta(n) === chaveDaEtiqueta(limpo));
  const salvar = async () => {
    if (!limpo || ocupado || salvando) return;
    setSalvando(true); setErro('');
    try { await onSalvar({ nome: limpo, cor }); } catch (e) { setErro(erroLegivel(e)); setSalvando(false); }
  };
  return (
    <div className="flex flex-col gap-2.5 p-1" data-editor-de-etiqueta=""
      onKeyDown={(e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onVoltar(); } }}>
      {!naJanela && (
        <div className="flex items-center gap-1.5">
          <button type="button" className="btn-ghost p-1 -ml-1" onClick={onVoltar} aria-label="Voltar para a lista" title="Voltar"><ArrowLeft size={15} /></button>
          <span className="font-display font-semibold text-[14px]">{titulo}</span>
        </div>
      )}
      <div>
        <label className="label" htmlFor="editor-etiqueta-nome">Nome</label>
        <input ref={campo} className="input" id="editor-etiqueta-nome" maxLength={40} autoComplete="off" value={nome}
          onChange={(e) => { setNome(e.target.value); setErro(''); }} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void salvar(); } }} />
        {ocupado && <p className="text-[12px] text-signal mt-1">Já existe uma etiqueta com esse nome.</p>}
      </div>
      <div>
        <div className="label" id="editor-etiqueta-cor-rotulo">Cor</div>
        <CoresDaEtiqueta valor={cor} onChange={setCor} id="editor-etiqueta-cor" rotulo="A cor da etiqueta" />
      </div>
      <div className="flex flex-wrap items-center gap-2 text-[12px] text-muted">Fica assim: <ChipDaEtiqueta nome={limpo || 'etiqueta'} cor={cor} /></div>
      {dica && <p className="text-[12px] text-muted">{dica}</p>}
      {erro && <p className="text-bad text-[12.5px]" role="alert">{erro}</p>}
      <div className="flex items-center gap-2">
        <button type="button" className="btn-primary btn-sm" id="editor-etiqueta-salvar" disabled={!limpo || ocupado || salvando} onClick={() => void salvar()}>
          {salvando ? <Spinner className="text-white w-3.5 h-3.5" /> : botao === 'Criar' ? <Plus size={14} /> : <Check size={14} />} {botao}
        </button>
        <button type="button" className="btn-ghost btn-sm" onClick={onVoltar}>{naJanela ? 'Cancelar' : 'Voltar'}</button>
      </div>
    </div>
  );
}
