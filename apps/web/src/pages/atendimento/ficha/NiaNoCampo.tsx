/**
 * O /NIA NO CARD (Patch 2.4, decisão 0058): em QUALQUER campo de texto do card — o título, os textos (o relato, a
 * descrição, a solução, a causa, a solução de contorno, a validação, a "Sobre a negociação", os de texto longo do
 * painel) — e na caixa da anotação, digitar "/nia" abre o menu com TODOS os comandos da NIA (o nome em destaque e,
 * embaixo, a explicação de cada um: o catálogo vem dela, comando novo aparece sozinho). Continuar digitando filtra
 * ("/nia cor"); setas e Enter escolhem, Esc fecha, o clique também escolhe. Escolhido, a pessoa pode continuar o
 * pedido na mesma linha ("/nia corrigir o relato e a causa") e manda com Enter. O "/nia" e o pedido saem do campo.
 *
 * Enquanto a NIA lê, o campo fica parado ("a NIA está lendo…"). O que voltar abre a janela da proposta: o antes e o
 * depois (corrigir, formalizar), o texto (resumir) ou os campos (criar o chamado, preencher o card vazio), com uma
 * caixa por linha. A NIA PROPÕE, a pessoa aplica: nada é gravado até o Aplicar, que grava só o marcado, pelo caminho
 * de sempre da ficha (o Histórico ganha a linha da NIA). Erro: a frase como veio, sem trocar nada, e o campo volta com
 * o texto que tinha.
 *
 * A NIA lê o card como está gravado: num campo com texto ainda sem salvar, o /nia pede para salvar antes (senão ela
 * trabalharia num texto que a pessoa não está vendo). A anotação é a exceção: o rascunho dela vai junto.
 *
 * O teclado: o /nia ouve o campo direto (antes dos atalhos da ficha: o Enter que grava o título, o Ctrl+Enter que
 * salva o texto, o Esc que fecha a janela), e só segura a tecla quando ela é do /nia.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CircleAlert, Info, WandSparkles } from 'lucide-react';
import {
  comComandoEscolhido, diferencaPorPalavras, lerComandoDaNia, NOME_DA_LISTA_DA_NIA, NOME_DO_CAMPO_DA_NIA, NOME_GRAVIDADE, problemaDoTamanho, textoSemOComando,
  type AcaoDaNia, type AlteracaoDaNia, type CatalogoDaNia, type ComandoDigitando, type FichaChamado, type IdsDasListasDaNia, type ListaDaNia,
  type NiaAplicarEntrada, type PropostaDaNia,
} from '@gestor/shared';
import { api } from '../../../api/index.js';
import { Modal, Spinner, mensagemErro } from '../../../components/ui/index.js';
import { ErroPerto, lista, useAberta, useAcao, usePosicaoFlutuante } from './base.js';

/** A mesma frase do servidor, quando a tela nem chegou a ouvir a NIA. */
const NIA_NAO_RESPONDEU = 'A NIA não respondeu agora. Tente de novo.';

/** O catálogo (o menu): 5 minutos guardado, como no servidor. Só para quem pode mexer no card. */
export function useCatalogoDaNia(ligado: boolean) {
  return useQuery<CatalogoDaNia>({ queryKey: ['atendimento', 'nia', 'acoes'], queryFn: () => api.atendimento.niaAcoes(), staleTime: 5 * 60_000, enabled: ligado, retry: false });
}

/** O /nia está disponível neste card? (quem pode mexer, com a NIA configurada) */
export function useNiaNoCard(): boolean {
  const { pode } = useAberta();
  const cat = useCatalogoDaNia(pode);
  return pode && !!cat.data?.configurada;
}

type Campo = HTMLTextAreaElement | HTMLInputElement;
type Aberta = { proposta: PropostaDaNia; acao: AcaoDaNia; campo: string };

/**
 * O /nia num campo. `campo`: onde ele foi digitado (a chave: "solucao", "titulo", "anotacao", "campo:<id>");
 * `salvo`: o que está gravado no card (a anotação não tem); `aoMandar`: a NIA aceitou o pedido (o campo do card fecha
 * o editor: não havia nada sem salvar). Devolve o que desenhar: o menu e a janela (`janelas`), e a linha embaixo do
 * campo (`aviso`: "a NIA está lendo…", ou o erro).
 */
export function useNiaNoCampo(o: {
  campo: string;
  caixa: RefObject<Campo | null>;
  texto: string;
  setTexto: (t: string) => void;
  salvo?: string;
  aoMandar?: () => void;
}) {
  const { f, pode } = useAberta();
  const cat = useCatalogoDaNia(pode);
  const disponivel = pode && !!cat.data?.configurada;
  const acoes = useMemo(() => (disponivel ? cat.data!.acoes : []), [disponivel, cat.data]);
  const [cursor, setCursor] = useState(0);
  const [foco, setFoco] = useState(false);
  const [marcado, setMarcado] = useState(0);
  /** o /nia (pela posição) cujo menu a pessoa fechou com o Esc: só reabre num /nia novo */
  const [fechado, setFechado] = useState<number | null>(null);
  const [lendo, setLendo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aberta, setAberta] = useState<Aberta | null>(null);
  /** a NIA está com o pedido (o título não grava no "sair da caixa" enquanto isso) */
  const ocupada = useRef(false);

  const d: ComandoDigitando | null = disponivel && (foco || lendo) ? lerComandoDaNia(o.texto, cursor, acoes) : null;
  const menuAberto = !!d && !lendo && foco && !d.passouDaPalavra && fechado !== d.inicio;
  const sugestoes = menuAberto ? d!.sugestoes : [];

  // o campo de agora (o editor abre e fecha: a caixa nasce e some) — os ouvintes vão para o que estiver na tela
  const [el, setEl] = useState<Campo | null>(null);
  useEffect(() => { if (o.caixa.current !== el) setEl(o.caixa.current); });

  const escolher = (a: AcaoDaNia) => {
    const el = o.caixa.current;
    const dd = el ? lerComandoDaNia(el.value, el.selectionStart ?? el.value.length, acoes) : d;
    if (!dd) return;
    const r = comComandoEscolhido(el?.value ?? o.texto, dd, a);
    o.setTexto(r.texto); setCursor(r.cursor); setMarcado(0); setErro(null);
    requestAnimationFrame(() => { const x = o.caixa.current; if (x) { x.focus(); x.setSelectionRange(r.cursor, r.cursor); } });
  };

  const mandar = async (dd: ComandoDigitando, valor: string) => {
    const acao = dd.acao!;
    const resto = textoSemOComando(valor, dd);
    if (o.salvo !== undefined && resto.trim() !== o.salvo.trim()) {
      setErro('Salve o que você escreveu antes de chamar a NIA: ela lê o que está gravado no card.');
      return;
    }
    ocupada.current = true;
    setErro(null); setLendo(true);
    o.setTexto(resto);
    try {
      const r = await api.atendimento.niaPropor(f.id, {
        comando: acao.comando, instrucao: dd.instrucao, campo: o.campo, ...(o.campo === 'anotacao' ? { anotacao: resto } : {}),
      });
      if (!r.ok) { setErro(r.erro?.trim() || NIA_NAO_RESPONDEU); o.setTexto(valor); ocupada.current = false; return; }
      setAberta({ proposta: r, acao, campo: o.campo });
      o.aoMandar?.();
    } catch (e) {
      setErro(mensagemErro(e) || NIA_NAO_RESPONDEU);
      o.setTexto(valor);
      ocupada.current = false;
    } finally {
      setLendo(false);
    }
  };

  // o último estado, para os ouvintes do campo (eles não são recriados a cada tecla)
  const atual = useRef({ marcado, acoes, lendo, fechado, mandar, escolher });
  atual.current = { marcado, acoes, lendo, fechado, mandar, escolher };

  // os ouvintes no próprio campo: veem a tecla antes dos atalhos da ficha (e a seguram só quando ela é do /nia)
  useEffect(() => {
    if (!el || !disponivel) return;
    const ler = () => setCursor(el.selectionStart ?? el.value.length);
    // escrever de novo apaga o erro de antes (e só escrever: o texto que volta depois de um erro não apaga o erro)
    const escreveu = () => { ler(); setErro(null); };
    const tecla = (e: KeyboardEvent) => {
      const a = atual.current;
      if (a.lendo || e.isComposing) return;
      const dd = lerComandoDaNia(el.value, el.selectionStart ?? el.value.length, a.acoes);
      if (!dd) return;
      const segurar = () => { e.preventDefault(); e.stopPropagation(); };
      const { mandar, escolher } = a;
      const menu = !dd.passouDaPalavra && a.fechado !== dd.inicio && dd.sugestoes.length > 0;
      if (menu) {
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          segurar();
          setMarcado((m) => (m + (e.key === 'ArrowDown' ? 1 : -1) + dd.sugestoes.length) % dd.sugestoes.length);
          return;
        }
        if ((e.key === 'Enter' && !e.shiftKey) || e.key === 'Tab') {
          // a palavra já é um comando inteiro ("/nia resumir" + Enter): manda direto
          if (e.key === 'Enter' && dd.acao && dd.sugestoes.length === 1) { segurar(); void mandar(dd, el.value); return; }
          segurar();
          escolher(dd.sugestoes[Math.min(a.marcado, dd.sugestoes.length - 1)]!);
          return;
        }
        if (e.key === 'Escape') { segurar(); setFechado(dd.inicio); return; }
        return;
      }
      if (e.key === 'Enter' && !e.shiftKey) {
        segurar();
        if (dd.acao) void mandar(dd, el.value);
        else setErro(dd.palavra ? `A NIA não tem o comando "${dd.palavra}". Apague e escreva /nia de novo para ver a lista.` : 'Escolha um comando da lista do /nia.');
      }
    };
    const alvo: HTMLElement = el;
    alvo.addEventListener('keydown', tecla);
    el.addEventListener('input', escreveu);
    for (const ev of ['click', 'keyup', 'select'] as const) el.addEventListener(ev, ler);
    const entrou = () => { setFoco(true); ler(); };
    const saiu = () => setFoco(false);
    el.addEventListener('focus', entrou);
    el.addEventListener('blur', saiu);
    if (document.activeElement === el) entrou();
    return () => {
      alvo.removeEventListener('keydown', tecla);
      el.removeEventListener('input', escreveu);
      for (const ev of ['click', 'keyup', 'select'] as const) el.removeEventListener(ev, ler);
      el.removeEventListener('focus', entrou);
      el.removeEventListener('blur', saiu);
    };
  }, [el, disponivel]);

  // o /nia apagado: o Esc de antes deixa de valer
  useEffect(() => { if (!d && fechado !== null) setFechado(null); }, [!!d]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setMarcado(0); }, [d?.palavra]);

  const painel = useRef<HTMLDivElement>(null);
  const pos = usePosicaoFlutuante(menuAberto, o.caixa as RefObject<HTMLElement | null>, painel, 'esquerda');

  const janelas: ReactNode = (
    <>
      {menuAberto && (
        <div ref={painel} role="listbox" id={`nia-menu-${o.campo}`} aria-label="Comandos da NIA" data-nia-menu={o.campo}
          className="fixed z-40 card p-1.5 overflow-y-auto shadow-lg text-left font-normal whitespace-normal"
          onMouseDown={(e) => e.preventDefault()}
          style={{ left: pos?.left ?? -9999, top: pos?.top, bottom: pos?.bottom, maxHeight: Math.min(pos?.maxHeight ?? 380, 380), width: 380, maxWidth: 'calc(100vw - 16px)', visibility: pos ? 'visible' : 'hidden', boxShadow: '0 10px 30px rgba(0,0,0,.18)' }}>
          <div className="eyebrow px-2 pt-1 pb-1.5 flex items-center gap-1.5"><WandSparkles size={12} aria-hidden /> NIA · escolha o que ela vai fazer</div>
          {cat.data?.erro ? <p className="px-2 py-1.5 text-[12.5px] text-bad" role="alert">{cat.data.erro}</p> : sugestoes.length ? sugestoes.map((a, i) => (
            <div key={a.comando} role="option" aria-selected={i === marcado} data-nia-comando={a.comando}
              className={`px-2.5 py-1.5 rounded-lg cursor-pointer ${i === marcado ? 'bg-accent-soft' : 'hover:bg-surface-2'}`}
              onMouseEnter={() => setMarcado(i)} onClick={() => escolher(a)}>
              <span className={`block text-[13.5px] font-semibold ${i === marcado ? 'text-accent-ink' : 'text-ink'}`}>
                {a.nome} <span className="font-mono font-normal text-[11.5px] text-muted">/nia {a.comando}</span>
              </span>
              {a.descricao && <span className="block text-[12px] text-muted leading-snug mt-0.5">{a.descricao}</span>}
            </div>
          )) : <p className="px-2 py-1.5 text-[12.5px] text-muted">Nenhum comando com esse nome.</p>}
          <p className="px-2 pt-1.5 text-[11.5px] text-muted border-t border-line mt-1">↑ ↓ escolhem · Enter usa · depois do comando, escreva o pedido (“o relato e a causa”) e Enter manda · Esc fecha</p>
        </div>
      )}
      {aberta && <JanelaDaProposta a={aberta} setTexto={o.setTexto} onFechar={() => { setAberta(null); ocupada.current = false; }} />}
    </>
  );

  const aviso: ReactNode = lendo ? (
    <p role="status" className="flex items-center gap-1.5 text-[12.5px] text-accent-ink mt-1.5" data-nia-lendo="">
      <Spinner /> a NIA está lendo…
    </p>
  ) : erro ? <ErroPerto erro={erro} /> : null;

  return { disponivel, lendo, ocupada, janelas, aviso, comandoDigitando: d };
}

// =====================================================================
//  A JANELA DA PROPOSTA
// =====================================================================

const ALCANCE: Record<string, string> = { 'campos citados': 'Nos campos citados', 'card inteiro': 'No card inteiro' };

function TextoComDestaque({ pedacos, texto, tipo }: { pedacos: Array<{ texto: string; tipo: string }> | null; texto: string; tipo: 'saiu' | 'entrou' }) {
  if (!texto) return <span className="italic text-muted">(vazio)</span>;
  if (!pedacos) return <>{texto}</>;
  return (
    <>
      {pedacos.map((p, i) => (p.tipo === tipo
        ? <mark key={i} className={tipo === 'saiu' ? 'bg-bad-soft text-bad line-through decoration-1 rounded-sm' : 'bg-ok-soft text-ok rounded-sm'}>{p.texto}</mark>
        : <span key={i}>{p.texto}</span>))}
    </>
  );
}

/** O antes e o depois lado a lado (no celular, um embaixo do outro), com o que mudou em destaque. */
function AntesEDepois({ antes, depois }: { antes: string; depois: string }) {
  const dif = useMemo(() => diferencaPorPalavras(antes, depois), [antes, depois]);
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-1.5 min-w-0">
      <div className="min-w-0">
        <div className="text-[11px] uppercase tracking-wide text-muted font-semibold mb-0.5">Antes</div>
        <div className="rounded-lg border border-line bg-surface-2 px-2.5 py-2 text-[13px] leading-relaxed whitespace-pre-wrap break-words max-h-64 overflow-y-auto" data-antes="">
          <TextoComDestaque pedacos={dif?.antes ?? null} texto={antes} tipo="saiu" />
        </div>
      </div>
      <div className="min-w-0">
        <div className="text-[11px] uppercase tracking-wide text-muted font-semibold mb-0.5">Depois</div>
        <div className="rounded-lg border border-accent/40 border-line bg-surface px-2.5 py-2 text-[13px] leading-relaxed whitespace-pre-wrap break-words max-h-64 overflow-y-auto" data-depois="">
          <TextoComDestaque pedacos={dif?.depois ?? null} texto={depois} tipo="entrou" />
        </div>
      </div>
    </div>
  );
}

/** O nome que a pessoa lê de um campo (o do painel, pelo id). */
function useNomeDoCampo() {
  const { opcoes } = useAberta();
  return (chave: string, nomeDaNia?: string) => {
    if (chave.startsWith('campo:')) return opcoes.campos.find((c) => c.id === chave.slice(6))?.nome ?? nomeDaNia ?? 'Campo';
    return (NOME_DO_CAMPO_DA_NIA as Record<string, string>)[chave] ?? nomeDaNia ?? chave;
  };
}

function JanelaDaProposta({ a, setTexto, onFechar }: { a: Aberta; setTexto: (t: string) => void; onFechar: () => void }) {
  const { proposta: p, acao } = a;
  const entrega = p.entrega ?? acao.entrega;
  const titulo = <span className="inline-flex items-center gap-2"><WandSparkles size={16} className="text-accent" aria-hidden /> A NIA propôs · {acao.nome}</span>;
  return (
    <Modal open onClose={onFechar} titulo={titulo} largura="max-w-4xl">
      <div id="janela-da-nia" data-entrega={entrega} className="min-w-0">
        {entrega === 'campos'
          ? <PropostaDeCampos a={a} onFechar={onFechar} />
          : p.alteracoes?.length || (!p.texto && p.alteracoes)
            ? <PropostaDeAlteracoes a={a} setTexto={setTexto} onFechar={onFechar} />
            : <PropostaDeTexto a={a} setTexto={setTexto} onFechar={onFechar} />}
      </div>
    </Modal>
  );
}

function Observacao({ p }: { p: PropostaDaNia }) {
  if (!p.observacao && !p.naoPropostos?.length) return null;
  return (
    <div className="flex flex-col gap-1.5 mb-3">
      {p.observacao && (
        <p className="flex items-start gap-1.5 rounded-lg bg-signal-soft text-signal px-3 py-2 text-[13px]" id="nia-observacao">
          <Info size={14} className="shrink-0 mt-0.5" aria-hidden /> <span>{p.observacao}</span>
        </p>
      )}
      {!!p.naoPropostos?.length && (
        <p className="flex items-start gap-1.5 rounded-lg bg-surface-2 text-ink-2 px-3 py-2 text-[13px]" id="nia-nao-propostos">
          <CircleAlert size={14} className="shrink-0 mt-0.5" aria-hidden />
          <span>Ficaram de fora (o painel não tem a lista para a NIA escolher): <b>{lista(p.naoPropostos.map((x) => NOME_DA_LISTA_DA_NIA[x as ListaDaNia] ?? x))}</b>.</span>
        </p>
      )}
    </div>
  );
}

/** O rodapé: o erro perto do Aplicar, o Descartar e o Aplicar. */
function Rodape({ marcados, aplicar, onFechar, acao, rotulo = 'Aplicar' }: { marcados: number; aplicar: () => void; onFechar: () => void; acao: ReturnType<typeof useAcao>; rotulo?: string }) {
  return (
    <div className="mt-4 pt-3 border-t border-line">
      <ErroPerto erro={acao.erro} className="mb-2" />
      <div className="flex flex-wrap items-center justify-end gap-2">
        <span className="text-[12px] text-muted mr-auto">Nada é gravado até o {rotulo}. O que você aplicar fica no Histórico do card.</span>
        <button type="button" className="btn-secondary" id="nia-descartar" onClick={onFechar}>Descartar</button>
        <button type="button" className="btn-primary" id="nia-aplicar" disabled={acao.ocupado || marcados === 0} onClick={aplicar}>
          {acao.ocupado ? <Spinner className="text-white" /> : marcados > 1 ? `${rotulo} (${marcados})` : rotulo}
        </button>
      </div>
    </div>
  );
}

/** O corrigir e o formalizar: uma linha por campo, com o antes e o depois e uma caixa (marcada onde mudou). */
function PropostaDeAlteracoes({ a, setTexto, onFechar }: { a: Aberta; setTexto: (t: string) => void; onFechar: () => void }) {
  const { f } = useAberta();
  const acao = useAcao();
  const nomeDe = useNomeDoCampo();
  const p = a.proposta;
  // a anotação só vale quando o /nia foi nela (ela volta ao rascunho, não é gravada)
  const linhas = (p.alteracoes ?? []).filter((x) => x.campo !== 'anotacao' || a.campo === 'anotacao');
  const [marcas, setMarcas] = useState<Record<string, boolean>>(() => Object.fromEntries(linhas.map((x) => [x.campo, x.mudou])));
  const marcadas = linhas.filter((x) => x.mudou && marcas[x.campo]);

  const aplicar = async () => {
    const doCard = marcadas.filter((x) => x.campo !== 'anotacao');
    const daAnotacao = marcadas.find((x) => x.campo === 'anotacao');
    for (const x of doCard) {
      const problema = problemaDoTamanho(x.campo, x.depois, nomeDe(x.campo, x.nome));
      if (problema) { acao.setErro(problema); return; }
    }
    if (doCard.length) {
      const corpo: NiaAplicarEntrada = { comando: a.acao.comando, resumo: p.resumo ?? null, campos: Object.fromEntries(doCard.map((x) => [x.campo, x.depois])) };
      const r = await acao.rodar(() => api.atendimento.niaAplicar(f.id, corpo), `Aplicado: ${lista(doCard.map((x) => nomeDe(x.campo, x.nome)))}`);
      if (!r.ok) return;
    }
    if (daAnotacao) setTexto(daAnotacao.depois);
    onFechar();
  };

  return (
    <>
      <p className="text-[13px] text-ink-2 mb-3 flex flex-wrap items-center gap-2">
        <span className="chip bg-accent-soft text-accent-ink font-semibold" id="nia-alcance">{ALCANCE[p.alcance ?? ''] ?? p.alcance ?? 'A proposta'}</span>
        {p.resumo && <span className="text-muted">{p.resumo}</span>}
      </p>
      <Observacao p={p} />
      {!linhas.length && <p className="text-[13px] text-muted">A NIA não propôs mudança em nenhum campo.</p>}
      <ul className="flex flex-col gap-3">
        {linhas.map((x: AlteracaoDaNia) => (
          <li key={x.campo} className="rounded-xl border border-line p-3 min-w-0" data-nia-linha={x.campo}>
            <div className="flex flex-wrap items-center gap-2">
              {x.mudou ? (
                <label className="inline-flex items-center gap-2 font-semibold text-[14px] cursor-pointer">
                  <input type="checkbox" className="w-4 h-4 accent-[var(--accent)]" checked={!!marcas[x.campo]} onChange={(e) => setMarcas((m) => ({ ...m, [x.campo]: e.target.checked }))}
                    aria-label={`Aplicar em ${nomeDe(x.campo, x.nome)}`} />
                  {nomeDe(x.campo, x.nome)}
                </label>
              ) : (
                <>
                  <span className="font-semibold text-[14px]">{nomeDe(x.campo, x.nome)}</span>
                  <span className="chip bg-ok-soft text-ok">já estava certo</span>
                </>
              )}
              {x.campo === 'anotacao' && <span className="text-[12px] text-muted">volta para o rascunho da anotação (você anota como sempre)</span>}
            </div>
            {x.mudou && <AntesEDepois antes={x.antes} depois={x.depois} />}
          </li>
        ))}
      </ul>
      <Rodape marcados={marcadas.length} aplicar={() => void aplicar()} onFechar={onFechar} acao={acao} />
    </>
  );
}

/** O resumir: um texto só, que vai para o campo onde o /nia foi digitado (na anotação, para o rascunho dela). */
function PropostaDeTexto({ a, setTexto, onFechar }: { a: Aberta; setTexto: (t: string) => void; onFechar: () => void }) {
  const { f } = useAberta();
  const acao = useAcao();
  const nomeDe = useNomeDoCampo();
  const p = a.proposta;
  const texto = p.texto ?? '';
  const onde = nomeDe(a.campo);
  const aplicar = async () => {
    if (a.campo === 'anotacao') { setTexto(texto); onFechar(); return; }
    const problema = problemaDoTamanho(a.campo, texto, onde);
    if (problema) { acao.setErro(problema); return; }
    const r = await acao.rodar(() => api.atendimento.niaAplicar(f.id, { comando: a.acao.comando, resumo: p.resumo ?? null, campos: { [a.campo]: texto } }), `Aplicado: ${onde}`);
    if (r.ok) onFechar();
  };
  const atual = a.campo === 'anotacao' ? null : valorDoCampo(f, a.campo);
  return (
    <>
      <Observacao p={p} />
      <p className="text-[13px] text-ink-2 mb-2">
        Aplicar põe este texto {a.campo === 'anotacao' ? <>no <b>rascunho da anotação</b> (você anota como sempre)</> : <>em <b>{onde}</b>{atual ? ', no lugar do que está lá' : ''}</>}.
      </p>
      <div className="rounded-lg border border-line bg-surface px-3 py-2.5 text-[14px] leading-relaxed whitespace-pre-wrap break-words max-h-[50vh] overflow-y-auto" id="nia-texto">
        {texto || <span className="italic text-muted">(a NIA não mandou texto)</span>}
      </div>
      {atual && (
        <details className="mt-2 text-[13px]">
          <summary className="cursor-pointer text-muted">Ver o que está em {onde} agora</summary>
          <div className="mt-1 rounded-lg bg-surface-2 px-3 py-2 whitespace-pre-wrap break-words">{atual}</div>
        </details>
      )}
      <Rodape marcados={texto ? 1 : 0} aplicar={() => void aplicar()} onFechar={onFechar} acao={acao} />
    </>
  );
}

function valorDoCampo(f: FichaChamado, chave: string): string {
  if (chave.startsWith('campo:')) { const v = f.campos[chave.slice(6)]; return typeof v === 'string' ? v : ''; }
  return ((f as unknown as Record<string, unknown>)[chave] as string | null | undefined) ?? '';
}

// ---------- a entrega "campos" (criar o chamado, preencher o card vazio) ----------

type LinhaDeCampo = { chave: string; nome: string; atual: string; proposto: string | null; aplicavel: boolean; motivo: string | null };

/** As linhas da tabela: os textos e as listas que vieram, com o valor de agora e o proposto. */
function linhasDosCampos(f: FichaChamado, p: PropostaDaNia, ids: IdsDasListasDaNia): LinhaDeCampo[] {
  const c = p.campos ?? {};
  const linhas: LinhaDeCampo[] = [];
  for (const chave of ['titulo', 'relato', 'descricao'] as const) {
    if (!(chave in c)) continue;
    const v = typeof c[chave] === 'string' ? (c[chave] as string).trim() : '';
    linhas.push({ chave, nome: NOME_DO_CAMPO_DA_NIA[chave], atual: (f[chave] as string | null) ?? '', proposto: v || null, aplicavel: !!v, motivo: v ? null : 'não identificado' });
  }
  const nome = (v: unknown) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string').join(', ') : typeof v === 'string' ? v.trim() : '') || null;
  const listas: Array<[ListaDaNia, string, keyof IdsDasListasDaNia]> = [['cliente', f.cliente?.nome ?? '', 'clienteId'], ['produto', f.produtos.map((x) => x.nome).join(', '), 'produtos'],
    ['tipo', f.tipo ?? '', 'tipo'], ['assunto', f.assunto?.caminho ?? '', 'assunto'], ['gravidade', f.gravidade ? NOME_GRAVIDADE[f.gravidade] : '', 'gravidade']];
  for (const [chave, atual, id] of listas) {
    if (!(chave in c)) continue;
    const proposto = nome((c as Record<string, unknown>)[chave]);
    const temId = ids[id] !== undefined && ids[id] !== null && !(Array.isArray(ids[id]) && !(ids[id] as string[]).length);
    linhas.push({
      chave, nome: NOME_DA_LISTA_DA_NIA[chave], atual, proposto,
      aplicavel: !!proposto && temId, motivo: !proposto ? 'não identificado' : !temId ? 'não está nas opções do painel' : null,
    });
  }
  return linhas;
}

function PropostaDeCampos({ a, onFechar }: { a: Aberta; onFechar: () => void }) {
  const { f } = useAberta();
  const acao = useAcao();
  const p = a.proposta;
  const ids = p.idsDasListas ?? {};
  const linhas = useMemo(() => linhasDosCampos(f, p, ids), []); // eslint-disable-line react-hooks/exhaustive-deps
  // marcada por padrão só onde o valor de agora está vazio
  const [marcas, setMarcas] = useState<Record<string, boolean>>(() => Object.fromEntries(linhas.map((l) => [l.chave, l.aplicavel && !l.atual.trim()])));
  const marcadas = linhas.filter((l) => l.aplicavel && marcas[l.chave]);

  const aplicar = async () => {
    const corpo: NiaAplicarEntrada = { comando: a.acao.comando, resumo: p.resumo ?? null, campos: {}, listas: {} };
    for (const l of marcadas) {
      if (l.chave === 'titulo' || l.chave === 'relato' || l.chave === 'descricao') corpo.campos![l.chave] = l.proposto;
      else if (l.chave === 'cliente') corpo.listas!.clienteId = ids.clienteId ?? null;
      else if (l.chave === 'produto') corpo.listas!.produtos = ids.produtos ?? [];
      else if (l.chave === 'tipo') corpo.listas!.tipo = ids.tipo ?? null;
      else if (l.chave === 'assunto') corpo.listas!.assunto = ids.assunto ?? null;
      else if (l.chave === 'gravidade') corpo.listas!.gravidade = ids.gravidade ?? null;
    }
    if (!Object.keys(corpo.listas!).length) delete corpo.listas;
    for (const [chave, texto] of Object.entries(corpo.campos!)) {
      const problema = problemaDoTamanho(chave, texto);
      if (problema) { acao.setErro(problema); return; }
    }
    const r = await acao.rodar(() => api.atendimento.niaAplicar(f.id, corpo), `Aplicado: ${lista(marcadas.map((l) => l.nome))}`);
    if (r.ok) onFechar();
  };

  return (
    <>
      <Observacao p={p} />
      <p className="text-[13px] text-ink-2 mb-2">Marque o que vai para o card. Vem marcado só onde o card ainda está vazio; o que a NIA não identificou fica em branco.</p>
      <div className="overflow-x-auto rounded-lg border border-line">
        <table className="table text-[13px]" id="nia-tabela-campos">
          <thead>
            <tr><th className="w-8" aria-label="Aplicar" /><th>Campo</th><th>Agora</th><th>A NIA propõe</th></tr>
          </thead>
          <tbody>
            {linhas.map((l) => (
              <tr key={l.chave} data-nia-linha={l.chave}>
                <td>
                  {l.aplicavel && (
                    <input type="checkbox" className="w-4 h-4 accent-[var(--accent)]" checked={!!marcas[l.chave]} onChange={(e) => setMarcas((m) => ({ ...m, [l.chave]: e.target.checked }))}
                      aria-label={`Aplicar ${l.nome}`} />
                  )}
                </td>
                <td className="font-semibold whitespace-nowrap">{l.nome}</td>
                <td className="min-w-[140px] max-w-[260px] whitespace-pre-wrap break-words">{l.atual.trim() ? <span className="line-clamp-4">{l.atual}</span> : <span className="text-muted italic">vazio</span>}</td>
                <td className="min-w-[180px] whitespace-pre-wrap break-words">
                  {l.proposto ? <span className={l.aplicavel ? 'text-ink' : 'text-muted'}>{l.proposto}</span> : null}
                  {l.motivo && <span className="text-muted italic">{l.proposto ? ` (${l.motivo})` : `(${l.motivo})`}</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Rodape marcados={marcadas.length} aplicar={() => void aplicar()} onFechar={onFechar} acao={acao} />
    </>
  );
}

/** A dica do relato vazio (o card novo, a ligação): o /nia criar-chamado. */
export function DicaDoCriarChamado({ className = '' }: { className?: string }) {
  return (
    <span className={`text-[12.5px] text-accent-ink ${className}`} data-nia-dica="">
      <WandSparkles size={12} className="inline -mt-0.5 mr-1" aria-hidden />
      Digite <span className="font-mono">/nia criar-chamado</span> e descreva o que aconteceu
    </span>
  );
}
