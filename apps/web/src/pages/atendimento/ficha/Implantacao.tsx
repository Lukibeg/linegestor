/**
 * A implantação na ficha (Patch 2.3, decisão 0057):
 *
 *  - as **partes** (a Curadoria, a Configuração, os Testes, a Implantação): os campos que têm parte (Painéis › Ajustes ›
 *    Campos), com um bloco por produto do card (o LineChat, o LinePBX) e a conta do que já foi feito. Desde o 2.4.8 (decisão
 *    0064, o Luan: "vai ser em uma aba, vai ficar curadoria, configuração, testes, implantação"), as partes são **abas** num
 *    cartão só; abre na da etapa em que o card está (o "Implantado - Em acompanhamento" abre a Implantação). Com uma parte só,
 *    o cartão de antes;
 *  - na negociação, os cards que ela abriu na implantação (a etapa de cada um); no card, a negociação de onde ele veio
 *    fica no cabeçalho.
 */
import { useEffect, useMemo, useState, type KeyboardEvent } from 'react';
import { Check, ChevronRight, ClipboardList, Rocket } from 'lucide-react';
import {
  chaveDoCampo, ehCaixinhas, etapaEhDaParte, gruposNaLateral, larguraDoCampo, paraBusca, partesDoChamado, type BlocoDaParte, type CampoPersonalizado, type ParteDoChamado,
} from '@gestor/shared';
import { ChipSituacao, CodigoChamado, painelDe } from '../comum.js';
import { FaltaNaParte, Secao, useAberta } from './base.js';
import { Caixinhas } from './Caixinhas.js';
import { ChecklistDoCard } from './ChecklistDoCard.js';
import { CampoNaFicha } from './Classificacao.js';
import { BlocoDoCampo } from './Textos.js';

/** As partes do chamado, na ordem dos grupos do painel (nada quando o painel não tem campos com parte). */
export function PartesDoChamado() {
  const { f, opcoes, etapa, faltando, painel } = useAberta();
  const produtos = useMemo(() => f.produtos.map((p) => p.id), [f.produtos]);
  const grupos = painel?.ajustes.partes;
  // o campo com um arquivo anexado conta como feito (2.4.4: "um documento tem q contar como preenchido o campo")
  const comAnexo = useMemo(() => (f.anexosDosCampos ?? []).filter((a) => !a.opcaoId).map((a) => a.campoId), [f.anexosDosCampos]);
  const partes = useMemo(() => partesDoChamado(opcoes.campos.filter((c) => c.painelId === f.painelId), produtos, f.campos, grupos ?? [], comAnexo, f.listas),
    [opcoes.campos, f.painelId, produtos, f.campos, grupos, comAnexo, f.listas]);
  if (!partes.length) return null;
  // a parte da etapa: a do mesmo nome ou da mesma raiz (2.4.8: o "Implantado - Em acompanhamento" é da Implantação)
  const daEtapa = etapa ? partes.find((p) => etapaEhDaParte(etapa.nome, p.nome)) : undefined;
  const temFalta = (p: ParteDoChamado) => p.blocos.some((b) => b.campos.some((c) => faltando.has(chaveDoCampo(c.id))));
  // a chave com a etapa: mover o card abre a parte da etapa nova
  if (partes.length > 1) return <AbasDasPartes key={f.etapaId} partes={partes} daEtapa={daEtapa} temFalta={temFalta} />;
  const p = partes[0]!;
  return <Parte key={`${p.nome}:${f.etapaId}`} p={p} atual={p === daEtapa} abertaDeInicio />;
}

const idDaParte = (nome: string) => `parte-${paraBusca(nome).replace(/[^a-z0-9]+/g, '-')}`;

/**
 * As partes em abas (2.4.8): Curadoria · Configuração · Testes · Implantação, cada uma com a conta (o ✓ quando acabou) e a
 * bolinha vermelha do que a próxima etapa pede. Abre na parte da etapa; sem uma, na primeira que a próxima etapa pede, ou na
 * primeira que falta. As setas do teclado andam entre as abas. O "falta: …" da ficha leva ao campo (e abre a aba dele).
 */
function AbasDasPartes({ partes, daEtapa, temFalta }: { partes: ParteDoChamado[]; daEtapa: ParteDoChamado | undefined; temFalta: (p: ParteDoChamado) => boolean }) {
  const inicial = daEtapa ?? partes.find(temFalta) ?? partes.find((p) => p.feitos < p.total) ?? partes[0]!;
  const [nome, setNome] = useState(inicial.nome);
  const aba = partes.find((p) => p.nome === nome) ?? partes[0]!;
  // o aviso do que falta (irParaOCampo) pede a aba do campo antes de rolar até ele
  useEffect(() => {
    const mostrar = (e: Event) => {
      const id = (e as CustomEvent<string>).detail;
      const dona = partes.find((p) => p.blocos.some((b) => b.campos.some((c) => c.id === id)));
      if (dona) setNome(dona.nome);
    };
    window.addEventListener('gestor:mostrar-campo', mostrar);
    return () => window.removeEventListener('gestor:mostrar-campo', mostrar);
  }, [partes]);
  const teclas = (e: KeyboardEvent<HTMLDivElement>) => {
    const i = partes.indexOf(aba);
    const j = e.key === 'ArrowRight' ? i + 1 : e.key === 'ArrowLeft' ? i - 1 : e.key === 'Home' ? 0 : e.key === 'End' ? partes.length - 1 : null;
    if (j === null) return;
    e.preventDefault();
    const alvo = partes[(j + partes.length) % partes.length]!;
    setNome(alvo.nome);
    document.getElementById(`aba-${idDaParte(alvo.nome)}`)?.focus();
  };
  const id = idDaParte(aba.nome);
  const pct = aba.total ? Math.round((aba.feitos / aba.total) * 100) : 0;
  const faltam = new Set(aba.faltam.map(chaveDoCampo));
  return (
    <section className="card min-w-0 scroll-mt-20" aria-label="As partes do card" data-abas-das-partes>
      <div role="tablist" aria-label="As partes do card" className="flex items-stretch gap-1 overflow-x-auto border-b border-line px-2 pt-1.5" onKeyDown={teclas}>
        {partes.map((p) => {
          const sel = p === aba;
          const feita = p.total > 0 && p.feitos >= p.total;
          return (
            <button key={p.nome} type="button" role="tab" id={`aba-${idDaParte(p.nome)}`} aria-selected={sel} aria-controls={idDaParte(p.nome)} tabIndex={sel ? 0 : -1}
              onClick={() => setNome(p.nome)} data-parte={p.nome}
              className={`relative shrink-0 flex items-center gap-1.5 px-3 pt-2 pb-2.5 -mb-px border-b-2 text-[13.5px] whitespace-nowrap rounded-t-md transition-colors ${
                sel ? 'border-accent text-ink font-semibold' : 'border-transparent text-muted hover:text-ink hover:bg-surface-2/60'}`}>
              {temFalta(p) && <span className="w-1.5 h-1.5 rounded-full bg-bad shrink-0" title="A próxima etapa pede algo daqui" aria-label="falta algo para a próxima etapa" />}
              {p.nome}
              {p === daEtapa && <span className="text-[10.5px] font-semibold uppercase tracking-wide text-accent-ink bg-accent-soft rounded px-1 py-px">etapa</span>}
              {feita
                ? <span className="inline-grid place-items-center w-4 h-4 rounded-full bg-ok text-white" title={`Tudo feito (${p.total})`} aria-label="tudo feito"><Check size={11} strokeWidth={3} /></span>
                : p.total > 0 && <span className="text-[11.5px] text-muted tnum font-normal">{p.feitos}/{p.total}</span>}
            </button>
          );
        })}
      </div>
      <div role="tabpanel" id={id} aria-labelledby={`aba-${id}`} className="px-4 pt-3 pb-4 flex flex-col gap-4">
        {aba.total > 0 && (
          <div className="flex items-center gap-2.5 text-[12.5px] text-muted tnum">
            <span className="flex-1 max-w-[16rem] h-1.5 rounded-full bg-surface-2 overflow-hidden" aria-hidden>
              <span className={`block h-full rounded-full ${aba.feitos === aba.total ? 'bg-ok' : 'bg-accent'}`} style={{ width: `${pct}%` }} />
            </span>
            {aba.feitos} de {aba.total}{aba.feitos === aba.total ? ' · tudo feito' : ''}
          </div>
        )}
        <FaltaNaParte.Provider value={faltam}>
          {aba.blocos.map((b) => <Bloco key={b.produtoId ?? '-'} b={b} parte={aba.nome} />)}
        </FaltaNaParte.Provider>
      </div>
    </section>
  );
}

function Parte({ p, atual, abertaDeInicio }: { p: ParteDoChamado; atual: boolean; abertaDeInicio: boolean }) {
  const [aberta, setAberta] = useState(abertaDeInicio);
  const pct = p.total ? Math.round((p.feitos / p.total) * 100) : 0;
  const id = idDaParte(p.nome);
  // os campos que faltam (2.4.4): a bolinha vermelha antes do nome de cada um
  const faltam = useMemo(() => new Set(p.faltam.map(chaveDoCampo)), [p.faltam]);
  return (
    <section id={id} className={`card min-w-0 scroll-mt-20 ${atual ? 'ring-2 ring-accent-soft' : ''}`} aria-label={`A parte ${p.nome}`}>
      <button type="button" className="w-full flex flex-wrap items-center gap-x-2.5 gap-y-1 px-4 py-3 text-left rounded-[inherit] hover:bg-surface-2/60"
        aria-expanded={aberta} aria-controls={`${id}-corpo`} onClick={() => setAberta((v) => !v)}>
        <ChevronRight size={16} className={`text-muted shrink-0 transition-transform ${aberta ? 'rotate-90' : ''}`} aria-hidden />
        <ClipboardList size={16} className="text-muted shrink-0" aria-hidden />
        <h2 className="font-display font-semibold text-[15px]">{p.nome}</h2>
        {atual && <span className="chip bg-accent-soft text-accent-ink font-medium">etapa atual</span>}
        {p.total > 0 && (
          <span className="ml-auto flex items-center gap-2 text-[12.5px] text-muted tnum">
            <span className="hidden sm:block w-20 h-1.5 rounded-full bg-surface-2 overflow-hidden" aria-hidden>
              <span className={`block h-full rounded-full ${p.feitos === p.total ? 'bg-ok' : 'bg-accent'}`} style={{ width: `${pct}%` }} />
            </span>
            {p.feitos} de {p.total}{p.feitos === p.total ? ' · tudo feito' : ''}
          </span>
        )}
      </button>
      {aberta && (
        <FaltaNaParte.Provider value={faltam}>
          <div id={`${id}-corpo`} className="px-4 pb-4 flex flex-col gap-4">
            {p.blocos.map((b) => <Bloco key={b.produtoId ?? '-'} b={b} parte={p.nome} />)}
          </div>
        </FaltaNaParte.Provider>
      )}
    </section>
  );
}

/** Os campos de um produto (ou os de todo card) numa parte. O produto sem campo nesta parte (2.4) aparece vazio, com o aviso. */
function Bloco({ b, parte }: { b: BlocoDaParte; parte: string }) {
  const { f, opcoes, cuida } = useAberta();
  const produto = b.produtoId ? f.produtos.find((x) => x.id === b.produtoId) ?? opcoes.produtos.find((x) => x.id === b.produtoId) : null;
  return (
    <div className="min-w-0" data-bloco={produto?.nome ?? 'todos'}>
      {produto && (
        <p className="flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wide text-ink-2 mb-1.5">
          <span className="w-2 h-2 rounded-full shrink-0" style={{ background: produto.cor }} aria-hidden /> {produto.nome}
        </p>
      )}
      {!b.campos.length ? (
        // 2.4, o Luan: "deixe todos os produtos mesmo que n tenham alguma curadoria configurada"
        <p className="rounded-lg border border-dashed border-line px-3.5 py-3 text-[13px] text-muted italic">
          Nenhum campo de {parte} {produto ? `para o ${produto.nome}` : ''} ainda.{cuida ? ' Inclua em Painéis › Ajustes › Campos, no grupo ' + parte + '.' : ''}
        </p>
      ) : (
      <div className="rounded-lg border border-line px-3.5 py-3 flex flex-col divide-y divide-line">
        {gruposDoBloco(b.campos).map((g) => (g.curtos ? (
          // os campos curtos seguidos (os números, os textos curtos, as datas): lado a lado (2.3, os Detalhes da proposta)
          <div key={g.campos[0]!.id} className="py-3 first:pt-0 last:pb-0 min-w-0 grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-3">
            {g.campos.map((c) => <div key={c.id} className="min-w-0"><CampoDaParte c={c} /></div>)}
          </div>
        ) : <div key={g.campos[0]!.id} className="py-3 first:pt-0 last:pb-0 min-w-0"><CampoDaParte c={g.campos[0]!} /></div>))}
      </div>
      )}
    </div>
  );
}

/**
 * Os grupos de campos da lateral (2.4, o Luan: "tem q ter um conjunto para eu alterar as abas laterais"): um cartão por grupo,
 * abaixo dos Detalhes (a Classificação até o 2.4.6), com os campos que o chamado mostra (o texto longo e as caixinhas inteiros, os outros numa linha).
 */
export function GruposDaLateral() {
  const { f, opcoes, painel } = useAberta();
  const produtos = useMemo(() => f.produtos.map((p) => p.id), [f.produtos]);
  const grupos = useMemo(() => gruposNaLateral(opcoes.campos.filter((c) => c.painelId === f.painelId), produtos, painel?.ajustes.partes ?? []),
    [opcoes.campos, f.painelId, produtos, painel?.ajustes.partes]);
  return (
    <>
      {grupos.map((g) => (
        <Secao key={g.nome} id={`grupo-${paraBusca(g.nome).replace(/[^a-z0-9]+/g, '-')}`} titulo={g.nome} icone={<ClipboardList size={16} />}>
          <div className="flex flex-col gap-3.5">
            {g.campos.map((c) => <div key={c.id} className="min-w-0"><CampoDaParte c={c} /></div>)}
          </div>
        </Secao>
      ))}
    </>
  );
}

/**
 * Os campos do bloco em grupos: os de metade seguidos juntos (vão lado a lado); os da linha inteira, um a um. A largura é a
 * escolhida no campo (2.4.7) ou, sem escolha, a do tipo (larguraDoCampo).
 */
function gruposDoBloco(campos: readonly CampoPersonalizado[]): Array<{ curtos: boolean; campos: CampoPersonalizado[] }> {
  const grupos: Array<{ curtos: boolean; campos: CampoPersonalizado[] }> = [];
  for (const c of campos) {
    const curto = larguraDoCampo(c) === 'metade';
    const ultimo = grupos[grupos.length - 1];
    if (curto && ultimo?.curtos) ultimo.campos.push(c);
    else grupos.push({ curtos: curto, campos: [c] });
  }
  return grupos;
}

function CampoDaParte({ c }: { c: CampoPersonalizado }) {
  if (ehCaixinhas(c.tipo)) return <Caixinhas c={c} />;
  if (c.tipo === 'checklist') return <ChecklistDoCard c={c} />;
  if (c.tipo === 'texto_longo') return <BlocoDoCampo c={c} />;
  return <CampoNaFicha c={c} />;
}

/** Na negociação: os cards que ela abriu na implantação (com a etapa de cada um). */
export function ImplantacoesDaNegociacao() {
  const { f, opcoes } = useAberta();
  if (!f.implantacoes.length) return null;
  return (
    <Secao titulo="Implantação" icone={<Rocket size={16} />}>
      <ul className="flex flex-col gap-2">
        {f.implantacoes.map((x) => (
          <li key={x.id} className="flex flex-wrap items-center gap-x-2 gap-y-1 min-w-0">
            <CodigoChamado codigo={x.codigo} cor={painelDe(opcoes, x.painelId)?.cor} link={x.podeAbrir} />
            <span className="text-[13px] text-ink-2 min-w-0">{x.painel} › <b className="font-semibold">{x.etapa}</b></span>
            {x.situacao !== 'aberto' && <ChipSituacao s={x.situacao} />}
          </li>
        ))}
      </ul>
      <p className="text-[12px] text-muted mt-2">Aberto quando a negociação entrou na etapa da implantação. O Ganho continua à parte, quando começar a faturar.</p>
    </Secao>
  );
}
