/**
 * Gráficos do sistema — SVG feito à mão, sem biblioteca de fora.
 *
 * As formas, porque são as perguntas que o dia a dia faz:
 *  - `BarrasRanking` — "quem são os maiores?" (barras deitadas, já ordenadas)
 *  - `Proporcao`     — "quanto de um, quanto do outro?" (uma barra só, dividida)
 *  - `Colunas`       — "quanto em cada dia (ou hora)?" (colunas em pé, na ordem do tempo).
 *    Entrou com os Chamados (Patch 1.3): é o "chamados por dia" que o Grafana mostrava.
 *  - `Pizza`         — "de quem é cada fatia do total?" (rosca). Também do Patch 1.3, a pedido
 *    do Luan, como OPÇÃO ao ranking nos Chamados — revê a 0028, que não tinha pizza.
 *
 * Decisões que valem para todas:
 *  - **uma cor só** por gráfico, menos na pizza (que precisa de uma por fatia). Mesmo lá, a
 *    identidade vem do rótulo escrito ao lado, com o número e o %, não da cor — assim ninguém
 *    depende de distinguir verde de laranja (e daltônico lê igual).
 *  - eixos e grades discretos; número em cima só onde ajuda, nunca em todo ponto.
 *  - as cores saem das variáveis do tema, então o modo escuro acompanha sozinho.
 *  - **escolhido em destaque**: quando um valor está no filtro (`selecionado`), ele fica com a cor
 *    cheia e o resto do gráfico esmaece — o gráfico continua inteiro, para dar para clicar de
 *    novo e desfazer, ou escolher outro. Quem clica recebe o evento junto (Ctrl ou Shift + clique
 *    = somar ao filtro, em vez de trocar).
 */
import { useEffect, useId, useState, type MouseEvent, type ReactNode } from 'react';

const TOM = { accent: 'bg-accent', ok: 'bg-ok', signal: 'bg-signal', bad: 'bg-bad', muted: 'bg-line-strong' };

/** Barras deitadas, já na ordem: para "os maiores primeiro". O nome fica à esquerda, o número à direita. */
export function BarrasRanking({ dados, maximo, vazio = 'Nada ainda.', acao, formatar, larguraRotulo = 'w-[140px]', legenda, aoClicarParte, selecionavel = false }: {
  /**
   * `tom` só quando a cor diz alguma coisa (cheio demais, por exemplo).
   * `partes` divide a barra (em estoque × com clientes, por exemplo) — a soma delas é o valor.
   * O número fica escrito do lado de qualquer jeito.
   */
  dados: Array<{
    id: string; rotulo: ReactNode; valor: number; titulo?: string;
    tom?: 'accent' | 'ok' | 'signal' | 'bad';
    /** está no filtro: fica em destaque e o resto esmaece */
    selecionado?: boolean;
    partes?: Array<{ id: string; label: string; n: number; tom: 'accent' | 'ok' | 'signal' | 'bad' | 'muted' }>;
  }>;
  /** força a escala (útil para comparar dois gráficos lado a lado) */
  maximo?: number;
  vazio?: string;
  /** o que fazer ao clicar numa barra (o evento vem junto: Ctrl/Shift + clique soma ao filtro) */
  acao?: (id: string, ev: MouseEvent) => void;
  /** como escrever o número à direita (padrão: o número puro) */
  formatar?: (v: number) => string;
  larguraRotulo?: string;
  /** a legenda das partes, escrita uma vez acima das barras */
  legenda?: Array<{ label: string; tom: 'accent' | 'ok' | 'signal' | 'bad' | 'muted' }>;
  /** clicar numa parte da barra (id da linha, id da parte) */
  aoClicarParte?: (id: string, parteId: string) => void;
  /** as barras ligam e desligam um filtro (o botão diz se está ligado) */
  selecionavel?: boolean;
}) {
  if (!dados.length) return <div className="text-muted text-sm">{vazio}</div>;
  const max = Math.max(1, maximo ?? 0, ...dados.map((d) => d.valor));
  const algumEscolhido = dados.some((d) => d.selecionado);
  return (
    <>
    {legenda && legenda.length > 0 && (
      <div className="flex flex-wrap gap-x-4 gap-y-1 mb-2 text-[12px]">
        {legenda.map((l) => (
          <span key={l.label} className="flex items-center gap-1.5">
            <span className={`h-2 w-2 rounded-full shrink-0 ${TOM[l.tom]}`} />
            <span className="text-muted">{l.label}</span>
          </span>
        ))}
      </div>
    )}
    <ul className="flex flex-col gap-1.5">
      {dados.map((d) => {
        const Tag = acao ? 'button' : 'div';
        return (
          <li key={d.id}>
            <Tag
              {...(acao ? { type: 'button' as const, onClick: (ev: MouseEvent) => acao(d.id, ev) } : {})}
              {...(acao && selecionavel ? { 'aria-pressed': !!d.selecionado } : {})}
              className={`w-full text-left flex items-center gap-2 transition-opacity ${acao ? 'hover:bg-surface-2 rounded-lg px-1 -mx-1 py-0.5' : ''} ${algumEscolhido && !d.selecionado ? 'opacity-40 hover:opacity-80' : ''} ${d.selecionado ? 'bg-accent-soft' : ''}`}
              title={d.titulo}
            >
              <span className={`${larguraRotulo} shrink-0 truncate text-sm ${d.selecionado ? 'font-semibold' : ''}`}>{d.rotulo}</span>
              <span className="flex-1 h-2.5 rounded-full bg-surface-2 overflow-hidden flex">
                {d.partes?.length ? (
                  /* barra mista: uma fatia por parte, com um fio de fundo entre elas */
                  d.partes.filter((x) => x.n > 0).map((x) => (
                    <span
                      key={x.id}
                      onClick={aoClicarParte ? (ev) => { ev.stopPropagation(); aoClicarParte(d.id, x.id); } : undefined}
                      className={`h-full ${TOM[x.tom]} ${aoClicarParte ? 'cursor-pointer hover:opacity-80' : ''} [&+&]:border-l-2 [&+&]:border-surface`}
                      style={{ width: `${(x.n / max) * 100}%` }}
                      title={`${x.label}: ${x.n}`}
                    />
                  ))
                ) : (
                  <span className={`block h-full rounded-full ${TOM[d.tom ?? 'accent']}`} style={{ width: `${Math.max(d.valor ? 3 : 0, (d.valor / max) * 100)}%` }} />
                )}
              </span>
              <span className={`${formatar ? 'w-24' : 'w-9'} text-right font-mono text-[12px] tnum text-ink-2 shrink-0`}>{formatar ? formatar(d.valor) : d.valor}</span>
            </Tag>
          </li>
        );
      })}
    </ul>
    </>
  );
}

/**
 * Uma barra dividida em duas ou três partes, com os rótulos escritos embaixo.
 * Serve para "em uso × livre", "em estoque × com clientes" — a leitura de um golpe.
 */
export function Proporcao({ partes, total }: {
  partes: Array<{ id: string; rotulo: string; n: number; cor: 'accent' | 'ok' | 'signal' | 'bad' | 'muted' }>;
  /** o total, quando ele não é a soma das partes */
  total?: number;
}) {
  const id = useId();
  const soma = total ?? partes.reduce((a, x) => a + x.n, 0);
  const CORES = { accent: 'bg-accent', ok: 'bg-ok', signal: 'bg-signal', bad: 'bg-bad', muted: 'bg-line-strong' };
  const PONTOS = { accent: 'bg-accent', ok: 'bg-ok', signal: 'bg-signal', bad: 'bg-bad', muted: 'bg-line-strong' };
  return (
    <div>
      <div className="flex h-3 rounded-full overflow-hidden bg-surface-2" aria-describedby={id}>
        {partes.filter((x) => x.n > 0).map((x) => (
          <span key={x.id} className={`h-full ${CORES[x.cor]}`} style={{ width: `${(x.n / Math.max(soma, 1)) * 100}%` }} title={`${x.rotulo}: ${x.n}`} />
        ))}
      </div>
      <div id={id} className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-[12.5px]">
        {partes.map((x) => (
          <span key={x.id} className="flex items-center gap-1.5">
            <span className={`h-2 w-2 rounded-full shrink-0 ${PONTOS[x.cor]}`} />
            <span className="text-muted">{x.rotulo}</span>
            <b className="tnum">{x.n}</b>
          </span>
        ))}
      </div>
    </div>
  );
}

/**
 * Colunas em pé, na ordem do tempo: chamados por dia, por hora, por faixa de idade.
 * O número fica escrito em cima de cada coluna quando cabe (até 31 colunas); acima disso, aparece
 * ao passar o mouse, e o maior valor fica escrito no canto. A coluna `destaque` (hoje, a hora
 * atual) é a mesma cor, mais forte — nunca uma cor diferente.
 */
export function Colunas({ pontos, altura = 150, aoClicar, vazio = 'Nada no período.' }: {
  /** `selecionado`: a coluna está no filtro (fica cheia; as outras esmaecem até se desfazer) */
  pontos: Array<{ id: string; rotulo: string; n: number; destaque?: boolean; selecionado?: boolean }>;
  altura?: number;
  /** clicar numa coluna (o id do ponto) — a tela usa para filtrar aquela hora, faixa, dia ou mês */
  aoClicar?: (id: string, ev: MouseEvent) => void;
  vazio?: string;
}) {
  const max = Math.max(0, ...pontos.map((p) => p.n));
  if (!pontos.length || max === 0) return <div className="text-muted text-sm py-6 text-center">{vazio}</div>;
  const comNumero = pontos.length <= 31;
  // com algo escolhido, o destaque é o escolhido (e não mais a hora atual ou o dia de hoje)
  const algumEscolhido = pontos.some((p) => p.selecionado);
  const forte = (p: (typeof pontos)[number]) => (algumEscolhido ? !!p.selecionado : !!p.destaque);
  // o rótulo da coluna escolhida sempre aparece; com muitas colunas, o vizinho cede a vez (senão os dois se atropelam)
  const escolhidas = pontos.flatMap((p, i) => (p.selecionado ? [i] : []));
  const comRotulo = (p: (typeof pontos)[number], i: number) => {
    if (p.selecionado) return true;
    if (i % passo !== 0 && i !== pontos.length - 1) return false;
    return pontos.length <= 12 || !escolhidas.some((k) => Math.abs(k - i) === 1);
  };
  // rótulo embaixo: todos quando cabem, senão um a cada tantos (sempre o primeiro e o último)
  const passo = pontos.length <= 16 ? 1 : Math.ceil(pontos.length / 12);
  return (
    <div>
      {!comNumero && <div className="text-[11.5px] text-muted text-right mb-1">maior: <b className="tnum text-ink-2">{max}</b></div>}
      <div className="flex items-end gap-[3px]" style={{ height: altura }}>
        {pontos.map((p) => {
          const h = p.n ? Math.max(3, (p.n / max) * (altura - (comNumero ? 18 : 2))) : 0;
          // coluna vazia não filtra nada — a não ser que já esteja escolhida (clicar desfaz)
          const clicavel = !!aoClicar && (p.n > 0 || !!p.selecionado);
          const Tag = clicavel ? 'button' : 'div';
          return (
            <Tag
              key={p.id}
              {...(clicavel ? { type: 'button' as const, onClick: (ev: MouseEvent) => aoClicar!(p.id, ev), 'aria-pressed': !!p.selecionado, 'aria-label': `${p.rotulo}: ${p.n}` } : {})}
              className={`flex-1 min-w-0 h-full flex flex-col justify-end items-center group ${clicavel ? 'cursor-pointer' : ''}`}
              title={`${p.rotulo}: ${p.n}${clicavel ? (p.selecionado ? ' — clique para desfazer' : ' — clique para filtrar') : ''}`}
            >
              {comNumero && p.n > 0 && <span className={`text-[10.5px] tnum leading-none mb-1 ${algumEscolhido && !p.selecionado ? 'text-muted' : 'text-ink-2'} ${p.selecionado ? 'font-semibold' : ''}`}>{p.n}</span>}
              <span
                className={`block w-full rounded-t bg-accent transition-opacity ${forte(p) ? '' : algumEscolhido ? 'opacity-25' : 'opacity-50'} ${clicavel ? 'group-hover:opacity-100' : ''}`}
                style={{ height: h }}
              />
            </Tag>
          );
        })}
      </div>
      {/* poucas colunas: o rótulo quebra linha ("Mais de 90 dias"); muitas: um rótulo a cada tantos, sem quebrar */}
      <div className="flex gap-[3px] border-t border-line mt-0.5 pt-1 overflow-hidden">
        {pontos.map((p, i) => (
          <span key={p.id} className={`flex-1 min-w-0 text-center text-[10.5px] leading-tight ${pontos.length <= 12 ? 'break-words' : 'whitespace-nowrap overflow-visible'} ${forte(p) ? 'text-accent font-semibold' : 'text-muted'}`}>
            {comRotulo(p, i) ? p.rotulo : ''}
          </span>
        ))}
      </div>
    </div>
  );
}

/**
 * Pizza (em rosca): "de quem é cada fatia do total?".
 *
 * As regras que fazem a pizza ser lida, e não só olhada:
 *  - **no máximo 6 fatias com cor**, as maiores; o resto vira **"Outros"** (cinza), que abre a
 *    lista do que foi somado ali — nada fica escondido. O "não preenchido" é outro cinza, no fim;
 *  - as seis cores vêm do tema (`--pz-1` a `--pz-6`), **sempre nesta ordem**: é a ordem que deixa
 *    cada cor diferente da vizinha para quem não distingue cores (conferida com o validador de
 *    paleta nos dois temas). Nunca se inventa uma 7ª cor;
 *  - **a legenda escreve nome, número e %** de cada fatia — a cor só ajuda;
 *  - um fio da cor do fundo separa as fatias; passar o mouse destaca a fatia e mostra o número
 *    dela no centro; clicar filtra, como no ranking.
 */
export type FatiaPizza = {
  id: string; rotulo: string; n: number;
  /** "não preenchido": cinza, sempre no fim */
  neutro?: boolean;
  /** está no filtro: fica cheia, e as outras esmaecem */
  selecionado?: boolean;
};

const MAX_FATIAS = 6;
const OUTROS = '__outros__';

export function Pizza({ partes, rotuloCentro = 'chamados', aoClicar, vazio = 'Nada aqui.', tamanho = 164 }: {
  partes: FatiaPizza[];
  /** o que o número do centro conta ("chamados"; "marcações" quando um card entra em mais de uma fatia) */
  rotuloCentro?: string;
  aoClicar?: (id: string, ev: MouseEvent) => void;
  vazio?: string;
  tamanho?: number;
}) {
  const [ativo, setAtivo] = useState<string | null>(null);
  const [verOutros, setVerOutros] = useState(false);
  const soma = partes.reduce((a, x) => a + x.n, 0);
  // escolhido que caiu em "Outros": a lista de Outros abre sozinha, para ele aparecer
  const escolhidoEmOutros = partes.filter((x) => !x.neutro && x.n > 0).sort((a, b) => b.n - a.n).slice(MAX_FATIAS).some((x) => x.selecionado);
  useEffect(() => { if (escolhidoEmOutros) setVerOutros(true); }, [escolhidoEmOutros]);
  if (!soma) return <div className="text-muted text-sm">{vazio}</div>;

  // as maiores primeiro; o que passa de 6 é somado em "Outros"
  const reais = partes.filter((x) => !x.neutro && x.n > 0).sort((a, b) => b.n - a.n);
  const neutras = partes.filter((x) => x.neutro && x.n > 0);
  const dobradas = reais.slice(MAX_FATIAS);
  const fatias: Array<FatiaPizza & { cor: string; outros?: boolean }> = [
    ...reais.slice(0, MAX_FATIAS).map((x, i) => ({ ...x, cor: `var(--pz-${i + 1})` })),
    // sobrou um só: ele mesmo, em cinza (um "Outros (1)" esconderia o nome à toa)
    ...(dobradas.length === 1 ? [{ ...dobradas[0]!, cor: 'var(--pz-outros)' }] : []),
    ...(dobradas.length > 1 ? [{ id: OUTROS, rotulo: `Outros (${dobradas.length})`, n: dobradas.reduce((a, x) => a + x.n, 0), cor: 'var(--pz-outros)', outros: true, selecionado: dobradas.some((x) => x.selecionado) }] : []),
    ...neutras.map((x) => ({ ...x, cor: 'var(--pz-vazio)' })),
  ];
  const escolhidas = partes.filter((x) => x.selecionado);
  const algumEscolhido = escolhidas.length > 0;
  const somaEscolhida = escolhidas.reduce((a, x) => a + x.n, 0);

  const pct = (n: number) => { const p = (n / soma) * 100; return p > 0 && p < 1 ? '<1%' : `${Math.round(p)}%`; };
  const meio = tamanho / 2;
  const espessura = Math.round(tamanho * 0.17);
  const raio = meio - espessura / 2 - 2;
  const volta = 2 * Math.PI * raio;
  const fio = fatias.length > 1 ? 2 : 0; // o fio da cor do fundo entre as fatias
  let andado = 0;
  const destaque = fatias.find((f) => f.id === ativo) ?? null;
  const clicar = (f: (typeof fatias)[number], ev: MouseEvent) => { if (f.outros) setVerOutros((v) => !v); else aoClicar?.(f.id, ev); };
  // esmaecida: outra fatia sob o mouse, ou há escolhidas e esta não é uma delas
  const apagada = (f: (typeof fatias)[number]) => (ativo ? ativo !== f.id : algumEscolhido && !f.selecionado);

  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
      <svg width={tamanho} height={tamanho} viewBox={`0 0 ${tamanho} ${tamanho}`} role="img" className="shrink-0"
        aria-label={fatias.map((f) => `${f.rotulo}: ${f.n} (${pct(f.n)})`).join('; ')}>
        {fatias.map((f) => {
          const trecho = (f.n / soma) * volta;
          const traco = Math.max(0.01, trecho - fio);
          const el = (
            <circle
              key={f.id} cx={meio} cy={meio} r={raio} fill="none" stroke={f.cor} strokeWidth={espessura}
              strokeDasharray={`${traco} ${volta - traco}`} strokeDashoffset={-andado}
              transform={`rotate(-90 ${meio} ${meio})`}
              className={`transition-opacity ${aoClicar || f.outros ? 'cursor-pointer' : ''}`}
              style={{ opacity: apagada(f) ? (ativo ? 0.3 : 0.22) : 1 }}
              onMouseEnter={() => setAtivo(f.id)} onMouseLeave={() => setAtivo(null)}
              onClick={(ev) => clicar(f, ev)}
            >
              <title>{`${f.rotulo}: ${f.n} (${pct(f.n)})`}</title>
            </circle>
          );
          andado += trecho;
          return el;
        })}
        {/* no centro: o total — a fatia sob o mouse — ou, com algo escolhido, quanto ele é do total */}
        <text x={meio} y={meio - 2} textAnchor="middle" className="fill-ink font-display font-semibold" style={{ fontSize: tamanho * 0.15 }}>
          {destaque ? pct(destaque.n) : algumEscolhido ? somaEscolhida.toLocaleString('pt-BR') : soma.toLocaleString('pt-BR')}
        </text>
        <text x={meio} y={meio + tamanho * 0.1} textAnchor="middle" className="fill-muted" style={{ fontSize: 11 }}>
          {destaque ? `${destaque.n.toLocaleString('pt-BR')} ${rotuloCentro}` : algumEscolhido ? `de ${soma.toLocaleString('pt-BR')} ${rotuloCentro}` : rotuloCentro}
        </text>
      </svg>

      <ul className="flex-1 min-w-[180px] flex flex-col gap-0.5 text-[13px]">
        {fatias.map((f) => (
          <li key={f.id}>
            <button
              type="button"
              className={`w-full flex items-center gap-2 rounded-md px-1.5 py-1 text-left hover:bg-surface-2 transition-opacity ${ativo === f.id ? 'bg-surface-2' : ''} ${f.selecionado && !f.outros ? 'bg-accent-soft' : ''} ${algumEscolhido && !f.selecionado ? 'opacity-50 hover:opacity-100' : ''}`}
              onMouseEnter={() => setAtivo(f.id)} onMouseLeave={() => setAtivo(null)} onFocus={() => setAtivo(f.id)} onBlur={() => setAtivo(null)}
              onClick={(ev) => clicar(f, ev)}
              {...(!f.outros && aoClicar ? { 'aria-pressed': !!f.selecionado } : {})}
              title={f.outros ? (verOutros ? 'Esconder a lista do que foi somado em Outros' : 'Ver o que foi somado em Outros') : aoClicar ? (f.selecionado ? 'Clique para desfazer o filtro' : 'Clique para filtrar (Ctrl+clique soma outro)') : undefined}
            >
              <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: f.cor }} aria-hidden />
              <span className={`flex-1 min-w-0 truncate ${f.neutro ? 'italic text-muted' : ''} ${f.selecionado && !f.outros ? 'font-semibold' : ''}`}>{f.rotulo}</span>
              <span className="font-mono tnum text-[12px] text-ink-2 shrink-0">{f.n.toLocaleString('pt-BR')}</span>
              <span className="w-10 text-right tnum text-[12px] text-muted shrink-0">{pct(f.n)}</span>
            </button>
            {f.outros && verOutros && (
              <ul className="ml-5 mb-1 border-l border-line pl-2 flex flex-col">
                {dobradas.map((d) => (
                  <li key={d.id}>
                    <button
                      type="button"
                      className={`w-full flex items-center gap-2 rounded-md px-1.5 py-0.5 text-left hover:bg-surface-2 ${d.selecionado ? 'bg-accent-soft' : algumEscolhido ? 'opacity-60 hover:opacity-100' : ''}`}
                      onClick={(ev) => aoClicar?.(d.id, ev)}
                      {...(aoClicar ? { 'aria-pressed': !!d.selecionado } : {})}
                      title={aoClicar ? (d.selecionado ? 'Clique para desfazer o filtro' : 'Clique para filtrar (Ctrl+clique soma outro)') : undefined}
                    >
                      <span className={`flex-1 min-w-0 truncate text-ink-2 ${d.selecionado ? 'font-semibold' : ''}`}>{d.rotulo}</span>
                      <span className="font-mono tnum text-[12px] text-ink-2 shrink-0">{d.n.toLocaleString('pt-BR')}</span>
                      <span className="w-10 text-right tnum text-[12px] text-muted shrink-0">{pct(d.n)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
