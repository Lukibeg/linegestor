/**
 * Filhos e ligações: o pai, o problema (de que este chamado é incidente), os filhos (com a situação de
 * cada um), as ligações feitas à mão (relacionado, duplicado, repete — o texto do lado certo) e O
 * DESENHO das ligações, o pedido do Luciu e do Carlos: o chamado no meio, os outros em volta, até dois
 * passos de distância.
 *
 * No desenho, cada tipo de ligação tem um traço diferente (contínuo, grosso, tracejado, traço-ponto,
 * tracejado miúdo, pontilhado) e a legenda escrita embaixo — nunca só a cor. A cor do chamado é a
 * situação (e a palavra vai escrita no próprio nó); o problema tem a borda dupla. Clicar num chamado
 * abre a ficha dele.
 *
 * A negociação (o painel de Vendas) não tem esta parte: não tem pai nem filhos e não se liga a nada (os
 * pedidos do Luan na prévia, em 17/10: "n precisa de pais e filhas aqui" e "n precisa ligações").
 */
import { useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { GitBranch, Link2, Unlink, Waypoints } from 'lucide-react';
import {
  NOME_SITUACAO_CHAMADO, posicoesDoGrafo,
  type ArestaGrafo, type GrafoChamado, type NoGrafo, type SituacaoDoChamado,
} from '@gestor/shared';
import { api } from '../../../api/index.js';
import { Spinner } from '../../../components/ui/index.js';
import { ChipSituacao, CodigoChamado, LinkDoChamado, useAbrirChamado } from '../comum.js';
import { ErroPerto, Secao, useAberta, useAcao } from './base.js';
import { JanelaAbrirLigado, JanelaLigar } from './Janelas.js';
import { LinhaDeChamado } from './Partes.js';

export function Ligacoes() {
  const { painel } = useAberta();
  // a negociação fica sem a parte (2.0.1, decisão 0050)
  if (painel?.tipo === 'vendas') return null;
  return <FilhosELigacoes />;
}

function FilhosELigacoes() {
  const { f, pode, painel, opcoes } = useAberta();
  const [ligando, setLigando] = useState(false);
  // o filho nasce numa janela por cima da ficha (o pedido do Luan na prévia), e não na tela inteira
  const [criandoFilho, setCriandoFilho] = useState(false);
  const tirar = useAcao();
  const [tirando, setTirando] = useState<string | null>(null);

  const no = (id: string | undefined) => (id ? f.grafo.nos.find((n) => n.id === id) : undefined);
  const corDoCodigo = (codigo: string) => opcoes.paineis.find((p) => p.sigla === codigo.split('-')[0])?.cor;
  const filhosAbertos = f.filhosLista.filter((c) => c.situacao === 'aberto').length;
  const vazio = !f.pai && !f.problema && !f.filhosLista.length && !f.ligacoes.length;
  const temDesenho = f.grafo.nos.length > 1 && f.grafo.arestas.length > 0;

  const desfazer = async (chave: string, fazer: () => Promise<unknown>, ok: string, depois?: () => void) => {
    setTirando(chave);
    const r = await tirar.rodar(fazer, ok);
    setTirando(null);
    if (r.ok) depois?.();
  };
  const botaoTirar = (chave: string, rotulo: string, fazer: () => Promise<unknown>, ok: string) => pode && (
    <button type="button" className="btn-ghost btn-sm text-muted" title={rotulo} aria-label={rotulo} disabled={tirar.ocupado} onClick={() => void desfazer(chave, fazer, ok)}>
      {tirar.ocupado && tirando === chave ? <Spinner /> : <><Unlink size={14} /> <span className="hidden sm:inline">Tirar</span></>}
    </button>
  );

  // sem pai, filho, problema, ligação nem chamado citado, a parte sai da ficha (2.2, o Luan: "retirar … filhos e ligações da
  // aba principal … quando for adicionado … uma ligação ele vai aparecer novamente"): o botão Ligações da barra faz tudo
  if (vazio && !temDesenho) return null;

  return (
    <Secao titulo="Filhos e ligações" icone={<Waypoints size={16} />}
      acoes={pode && (
        <>
          <button type="button" className="btn-secondary btn-sm" onClick={() => setCriandoFilho(true)}><GitBranch size={14} /> Criar um filho</button>
          <button type="button" className="btn-secondary btn-sm" onClick={() => setLigando(true)}><Link2 size={14} /> Ligar a outro chamado</button>
        </>
      )}>
      {vazio && <p className="text-[13px] text-muted">Nenhum pai, filho, problema ou ligação: o desenho mostra os chamados citados no texto.</p>}

      {(f.pai || f.problema) && (
        <ul className="flex flex-col divide-y divide-line">
          {f.pai && (
            <LinhaCurta rotulo="Filho de" codigo={f.pai.codigo} cor={corDoCodigo(f.pai.codigo)} no={no(f.pai.id)}
              depois={botaoTirar('pai', `Tirar o pai (${f.pai.codigo})`, () => api.atendimento.definirPai(f.id, null), `${f.codigo} não é mais filho de ${f.pai.codigo}`)} />
          )}
          {f.problema && (
            <LinhaCurta rotulo="Incidente do problema" codigo={f.problema.codigo} cor={corDoCodigo(f.problema.codigo)} no={no(f.problema.id)}
              depois={botaoTirar('problema', `Tirar do problema ${f.problema.codigo}`, () => api.atendimento.definirProblema(f.id, null), `${f.codigo} saiu do problema ${f.problema.codigo}`)} />
          )}
        </ul>
      )}

      {f.filhosLista.length > 0 && (
        <div className="mt-3 first:mt-0">
          <h3 className="text-[13px] font-semibold text-ink-2 flex flex-wrap items-baseline gap-x-2">
            Filhos <span className="font-normal text-muted">{filhosAbertos} em aberto de {f.filhosLista.length}</span>
          </h3>
          {painel?.ajustes.paiEsperaFilhos && filhosAbertos > 0 && (
            <p className="text-[12px] text-muted">Este chamado só resolve com os filhos resolvidos, e só fecha com eles fechados.</p>
          )}
          <ul className="flex flex-col divide-y divide-line">
            {f.filhosLista.map((c) => <li key={c.id}><LinhaDeChamado c={c} /></li>)}
          </ul>
        </div>
      )}

      {f.ligacoes.length > 0 && (
        <div className="mt-3 first:mt-0">
          <h3 className="text-[13px] font-semibold text-ink-2">Ligações</h3>
          <ul className="flex flex-col divide-y divide-line">
            {f.ligacoes.map((l) => (
              <li key={l.id}>
                <LinhaDeChamado c={l.chamado} antes={<span className="text-[12.5px] font-semibold text-ink-2">{l.texto}</span>}
                  depois={botaoTirar(l.id, `Desfazer: ${l.texto} ${l.chamado.codigo}`, () => api.atendimento.desligar(f.id, l.id), `Ligação com ${l.chamado.codigo} desfeita`)} />
              </li>
            ))}
          </ul>
        </div>
      )}
      <ErroPerto erro={tirar.erro} />

      {temDesenho && <Desenho g={f.grafo} />}
      {ligando && <JanelaLigar onFechar={() => setLigando(false)} />}
      {criandoFilho && <JanelaAbrirLigado tipo="filho" onFechar={() => setCriandoFilho(false)} />}
    </Secao>
  );
}

/** O pai ou o problema numa linha: o código, o título e a situação (do desenho). */
function LinhaCurta({ rotulo, codigo, cor, no, depois }: { rotulo: string; codigo: string; cor: Parameters<typeof CodigoChamado>[0]['cor']; no: NoGrafo | undefined; depois?: ReactNode }) {
  return (
    <li className="flex items-start gap-2 py-2 min-w-0">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[12.5px] font-semibold text-ink-2">{rotulo}</span>
          <CodigoChamado codigo={codigo} cor={cor} />
          {no && <ChipSituacao s={no.situacao} />}
        </div>
        {no && <LinkDoChamado codigo={codigo} className="block text-[13.5px] text-ink hover:text-accent mt-0.5 break-words">{no.titulo}</LinkDoChamado>}
      </div>
      {depois && <div className="shrink-0">{depois}</div>}
    </li>
  );
}

// =====================================================================
//  O DESENHO
// =====================================================================

type TipoAresta = ArestaGrafo['tipo'];

/** O traço de cada tipo de ligação: o desenho e a legenda usam o mesmo. */
const TRACO: Record<TipoAresta, { nome: string; sentido: string; dash?: string; largura: number; cor: string; seta: boolean; ponta?: 'round' }> = {
  filho: { nome: 'filho', sentido: 'do pai para o filho', largura: 2, cor: 'var(--accent)', seta: true },
  incidente: { nome: 'incidente', sentido: 'do problema para o incidente', largura: 4, cor: 'var(--rosa)', seta: true },
  relacionado: { nome: 'relacionado', sentido: 'os dois lados', dash: '8 5', largura: 2, cor: 'var(--ink-2)', seta: false },
  duplicado: { nome: 'duplicado', sentido: 'do duplicado para o que segue', dash: '12 4 2 4', largura: 2, cor: 'var(--signal)', seta: true },
  repete: { nome: 'repete', sentido: 'do que voltou para o anterior', dash: '4 3', largura: 2, cor: 'var(--roxo)', seta: true },
  citado: { nome: 'citado no texto', sentido: 'de quem cita para o citado', dash: '0.1 5', largura: 2.6, cor: 'var(--muted)', seta: true, ponta: 'round' },
};
const ORDEM_TIPOS: TipoAresta[] = ['filho', 'incidente', 'relacionado', 'duplicado', 'repete', 'citado'];

const COR_NO: Record<SituacaoDoChamado, { fundo: string; borda: string; texto: string }> = {
  aberto: { fundo: 'var(--accent-soft)', borda: 'var(--accent)', texto: 'var(--accent-ink)' },
  resolvido: { fundo: 'var(--ok-soft)', borda: 'var(--ok)', texto: 'var(--ok)' },
  fechado: { fundo: 'var(--surface-2)', borda: 'var(--line-strong)', texto: 'var(--muted)' },
};

type Caixa = { x: number; y: number; hw: number; hh: number };

/** O ponto da borda do retângulo (centro c, meia largura hw, meia altura hh) na direção (dx, dy). */
function borda(cx: number, cy: number, hw: number, hh: number, dx: number, dy: number): [number, number] {
  const t = Math.min(dx ? hw / Math.abs(dx) : Infinity, dy ? hh / Math.abs(dy) : Infinity);
  return [cx + dx * t, cy + dy * t];
}

/**
 * O traço da ligação: reto, ou curvo quando a reta passaria por cima de outro chamado (os anéis do
 * desenho deixam três chamados em fila) ou quando há mais de uma ligação entre os mesmos dois.
 * `desvio` afasta as ligações repetidas uma da outra.
 */
function caminhoDaAresta(de: Caixa, para: Caixa, outros: Caixa[], desvio: number, W: number, H: number): string {
  const dx = para.x - de.x; const dy = para.y - de.y;
  const dist = Math.hypot(dx, dy) || 1;
  const nx = -dy / dist; const ny = dx / dist;
  const mx = (de.x + para.x) / 2; const my = (de.y + para.y) / 2;
  // o ponto de controle de uma curva que passa a `c` px do meio da reta (c = 0: a própria reta)
  const controle = (c: number) => ({ x: Math.max(8, Math.min(W - 8, mx + nx * c * 2)), y: Math.max(8, Math.min(H - 8, my + ny * c * 2)) });
  // quantos outros chamados o traço atravessa (confere pontos ao longo dele)
  const atravessa = (c: number) => {
    const k = controle(c);
    return outros.filter((o) => {
      for (let i = 2; i < 38; i++) {
        const t = i / 40; const u = 1 - t;
        const x = u * u * de.x + 2 * u * t * k.x + t * t * para.x;
        const y = u * u * de.y + 2 * u * t * k.y + t * t * para.y;
        if (Math.abs(x - o.x) < o.hw + 5 && Math.abs(y - o.y) < o.hh + 5) return true;
      }
      return false;
    }).length;
  };
  // a reta, se não passa por cima de ninguém; senão, a curva mais suave que desvia (de um lado ou do outro)
  const tentativas = desvio ? [desvio, desvio * 2, -desvio] : [0, 40, -40, 75, -75, 110, -110, 150, -150];
  let curva = tentativas[0]!;
  let menor = Infinity;
  for (const c of tentativas) {
    const n = atravessa(c);
    if (n < menor) { menor = n; curva = c; }
    if (n === 0) break;
  }
  if (!curva) {
    const [x1, y1] = borda(de.x, de.y, de.hw + 2, de.hh + 2, dx / dist, dy / dist);
    const [x2, y2] = borda(para.x, para.y, para.hw + 3, para.hh + 3, -dx / dist, -dy / dist);
    return `M${x1.toFixed(1)},${y1.toFixed(1)} L${x2.toFixed(1)},${y2.toFixed(1)}`;
  }
  const { x: cx, y: cy } = controle(curva);
  const ir = (o: Caixa, folga: number) => {
    const ux = cx - o.x; const uy = cy - o.y; const u = Math.hypot(ux, uy) || 1;
    return borda(o.x, o.y, o.hw + folga, o.hh + folga, ux / u, uy / u);
  };
  const [x1, y1] = ir(de, 2);
  const [x2, y2] = ir(para, 3);
  return `M${x1.toFixed(1)},${y1.toFixed(1)} Q${cx.toFixed(1)},${cy.toFixed(1)} ${x2.toFixed(1)},${y2.toFixed(1)}`;
}

/**
 * Nenhum nó em cima do outro: quem encosta no vizinho é empurrado (para o lado de menos encosto; no
 * celular, sempre para cima ou para baixo, que é onde há lugar). O chamado do meio não sai do lugar.
 */
function afastar(caixas: Map<string, Caixa>, fixo: string | undefined, W: number, soNaVertical: boolean) {
  const lista = [...caixas.entries()];
  const noLimite = (c: Caixa) => { c.x = Math.min(W - c.hw - 4, Math.max(c.hw + 4, c.x)); };
  for (let volta = 0; volta < 120; volta++) {
    let mexeu = false;
    for (let i = 0; i < lista.length; i++) {
      for (let j = i + 1; j < lista.length; j++) {
        const [ida, a] = lista[i]!;
        const [idb, b] = lista[j]!;
        const dx = b.x - a.x; const dy = b.y - a.y;
        const encostoX = a.hw + b.hw + 12 - Math.abs(dx);
        const encostoY = a.hh + b.hh + 12 - Math.abs(dy);
        if (encostoX <= 0 || encostoY <= 0) continue;
        mexeu = true;
        const pa = ida === fixo ? 0 : idb === fixo ? 1 : 0.5;
        const pb = idb === fixo ? 0 : ida === fixo ? 1 : 0.5;
        if (!soNaVertical && encostoX < encostoY) {
          const s = dx >= 0 ? 1 : -1;
          a.x -= s * encostoX * pa; b.x += s * encostoX * pb;
          noLimite(a); noLimite(b);
          // encostou na borda do quadro e ainda está em cima: resolve na vertical
          if (a.hw + b.hw + 12 - Math.abs(b.x - a.x) <= 0) continue;
        }
        const s = dy >= 0 ? 1 : -1;
        a.y -= s * encostoY * pa; b.y += s * encostoY * pb;
      }
    }
    if (!mexeu) break;
  }
}

/** O tamanho do quadro: acompanha a largura do cartão (o texto fica do mesmo tamanho no celular e no computador). */
function useLargura<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [largura, setLargura] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setLargura(el.clientWidth);
    const ro = new ResizeObserver(([e]) => { if (e) setLargura(Math.round(e.contentRect.width)); });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return { ref, largura };
}

export function Desenho({ g }: { g: GrafoChamado }) {
  const abrirChamado = useAbrirChamado();
  const { ref, largura } = useLargura<HTMLDivElement>();
  const posicoes = useMemo(() => posicoesDoGrafo(g), [g]);
  const W = Math.max(280, largura);
  // no celular o quadro é estreito: mais alto, os nós menores, e quem encostar no vizinho desce ou sobe
  const estreito = W < 560;
  const tipos = ORDEM_TIPOS.filter((t) => g.arestas.some((a) => a.tipo === t));
  const situacoes = (['aberto', 'resolvido', 'fechado'] as const).filter((s) => g.nos.some((x) => x.situacao === s));
  const temProblema = g.nos.some((x) => x.tipoChamado === 'problema');
  const fonte = estreito ? { codigo: 11.5, centro: 12.5, situacao: 9.5, linha: 10 } : { codigo: 12.5, centro: 13.5, situacao: 10, linha: 11 };

  // o lugar e o tamanho de cada nó (o código precisa caber): as posições dos anéis, sem um nó em cima do outro;
  // a altura do quadro acompanha o desenho
  const { caixa, H } = useMemo(() => {
    const n = g.nos.length;
    const H0 = n <= 2 ? 200
      : estreito ? Math.round(Math.max(280, W * (n <= 4 ? 0.95 : n <= 10 ? 1.2 : 1.45)))
        : n <= 4 ? 280 : Math.max(320, Math.min(n <= 10 ? 400 : 480, Math.round(W * 0.7)));
    const m = new Map<string, Caixa>();
    for (const no of g.nos) {
      const p = posicoes[no.id] ?? { x: 0.5, y: 0.5 };
      const hw = estreito ? Math.max(no.centro ? 44 : 38, no.codigo.length * 3.7 + 11) : Math.max(no.centro ? 52 : 46, no.codigo.length * 4 + 14);
      const hh = estreito ? (no.centro ? 20 : 17) : (no.centro ? 22 : 19);
      m.set(no.id, { x: Math.min(W - hw - 4, Math.max(hw + 4, p.x * W)), y: p.y * H0, hw, hh });
    }
    afastar(m, g.nos.find((x) => x.centro)?.id, W, estreito);
    // a altura: do nó mais alto ao mais baixo, com a folga
    const topo = Math.min(...[...m.values()].map((c) => c.y - c.hh));
    const fundo = Math.max(...[...m.values()].map((c) => c.y + c.hh));
    const folga = Math.max(16, (H0 - (fundo - topo)) / 2);
    for (const c of m.values()) c.y += folga - topo;
    return { caixa: m, H: Math.round(fundo - topo + 2 * folga) };
  }, [g.nos, posicoes, W, estreito]);

  const abrir = (n: NoGrafo) => { if (!n.centro) abrirChamado(n.codigo); };

  return (
    <figure className="mt-4 min-w-0">
      <figcaption className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 mb-1.5">
        <span className="text-[13px] font-semibold text-ink-2">O desenho das ligações</span>
        <span className="text-[12px] text-muted">até dois passos deste chamado · clique num chamado para abrir</span>
      </figcaption>
      <div ref={ref} className="w-full rounded-lg border border-line bg-bg overflow-hidden">
        {largura > 0 && (
          <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Desenho das ligações: ${g.nos.length} chamados`} className="block max-w-full">
            <defs>
              {tipos.filter((t) => TRACO[t].seta).map((t) => (
                <marker key={t} id={`seta-${t}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth={t === 'incidente' ? 12 : 8} markerHeight={t === 'incidente' ? 12 : 8} orient="auto-start-reverse" markerUnits="userSpaceOnUse">
                  <path d="M0,0 L10,5 L0,10 z" style={{ fill: TRACO[t].cor }} />
                </marker>
              ))}
            </defs>
            {g.arestas.map((a, i) => {
              const de = caixa.get(a.de);
              const para = caixa.get(a.para);
              if (!de || !para) return null;
              // mais de uma ligação entre os mesmos dois: cada uma com a sua curva
              const par = (x: { de: string; para: string }) => [x.de, x.para].sort().join('|');
              const iguais = g.arestas.filter((x) => par(x) === par(a));
              const k = iguais.indexOf(a);
              const desvio = iguais.length > 1 ? (k - (iguais.length - 1) / 2) * 30 * (a.de < a.para ? 1 : -1) : 0;
              const outros = g.nos.filter((n) => n.id !== a.de && n.id !== a.para).map((n) => caixa.get(n.id)!).filter(Boolean);
              const t = TRACO[a.tipo];
              const noDe = g.nos.find((n) => n.id === a.de);
              const noPara = g.nos.find((n) => n.id === a.para);
              return (
                <path key={`${a.de}-${a.para}-${a.tipo}-${i}`} d={caminhoDaAresta(de, para, outros, desvio, W, H)} fill="none"
                  style={{ stroke: t.cor }} strokeWidth={t.largura} strokeDasharray={t.dash} strokeLinecap={t.ponta ?? 'butt'}
                  markerEnd={t.seta ? `url(#seta-${a.tipo})` : undefined}>
                  <title>{`${noDe?.codigo ?? '?'} → ${noPara?.codigo ?? '?'}: ${t.nome}`}</title>
                </path>
              );
            })}
            {g.nos.map((n) => {
              const c = caixa.get(n.id)!;
              const cor = COR_NO[n.situacao];
              const situacao = NOME_SITUACAO_CHAMADO[n.situacao];
              const rotulo = `${n.codigo}${n.tipoChamado === 'problema' ? ' (problema)' : ''}: ${n.titulo} — ${situacao}`;
              return (
                <g key={n.id} transform={`translate(${c.x - c.hw} ${c.y - c.hh})`}
                  role={n.centro ? undefined : 'link'} tabIndex={n.centro ? undefined : 0} aria-label={n.centro ? undefined : `Abrir ${rotulo}`}
                  className={n.centro ? '' : 'cursor-pointer focus:outline-none [&:hover>rect.fora]:stroke-[3px] [&:focus-visible>rect.fora]:stroke-[3.5px]'}
                  onClick={() => abrir(n)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); abrir(n); } }}>
                  <title>{n.centro ? `${rotulo} (este chamado)` : rotulo}</title>
                  <rect className="fora" width={c.hw * 2} height={c.hh * 2} rx={9} style={{ fill: cor.fundo, stroke: cor.borda }} strokeWidth={n.centro ? 3 : 1.5} />
                  {n.tipoChamado === 'problema' && <rect x={3.5} y={3.5} width={c.hw * 2 - 7} height={c.hh * 2 - 7} rx={6} style={{ fill: 'none', stroke: cor.borda }} strokeWidth={1.2} />}
                  <text x={c.hw} y={c.hh - 2} textAnchor="middle" className="font-mono" style={{ fill: cor.texto, fontSize: n.centro ? fonte.centro : fonte.codigo, fontWeight: 700 }}>{n.codigo}</text>
                  <text x={c.hw} y={c.hh + fonte.linha} textAnchor="middle" style={{ fill: 'var(--muted)', fontSize: fonte.situacao }}>{n.centro ? 'este' : situacao.toLocaleLowerCase('pt-BR')}</text>
                </g>
              );
            })}
          </svg>
        )}
      </div>
      {g.cortado && <p className="text-[12.5px] text-signal mt-1.5">Mostrando {g.nos.length} chamados; há mais ligações que não couberam no desenho.</p>}
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1.5 text-[12px] text-ink-2" aria-label="Legenda do desenho">
        {tipos.map((t) => (
          <li key={t} className="inline-flex items-center gap-1.5">
            <AmostraDoTraco tipo={t} />
            <span><b className="font-semibold">{TRACO[t].nome}</b> <span className="text-muted">({TRACO[t].sentido})</span></span>
          </li>
        ))}
        {situacoes.map((s) => (
          <li key={s} className="inline-flex items-center gap-1.5">
            <span className="inline-block w-4 h-3 rounded-[3px] border" style={{ background: COR_NO[s].fundo, borderColor: COR_NO[s].borda }} aria-hidden />
            {NOME_SITUACAO_CHAMADO[s].toLocaleLowerCase('pt-BR')}
          </li>
        ))}
        {temProblema && (
          <li className="inline-flex items-center gap-1.5">
            <span className="inline-block w-4 h-3 rounded-[3px] border-[3px] border-double border-ink-2" aria-hidden /> borda dupla: problema
          </li>
        )}
      </ul>
    </figure>
  );
}

function AmostraDoTraco({ tipo }: { tipo: TipoAresta }) {
  const t = TRACO[tipo];
  return (
    <svg width="38" height="12" viewBox="0 0 38 12" aria-hidden className="shrink-0">
      <line x1="1" y1="6" x2={t.seta ? 30 : 37} y2="6" style={{ stroke: t.cor }} strokeWidth={Math.min(t.largura, 3.5)} strokeDasharray={t.dash} strokeLinecap={t.ponta ?? 'butt'} />
      {t.seta && <path d="M29,1.5 L37,6 L29,10.5 z" style={{ fill: t.cor }} />}
    </svg>
  );
}
