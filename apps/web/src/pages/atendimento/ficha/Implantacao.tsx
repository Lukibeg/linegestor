/**
 * A implantação na ficha (Patch 2.3, decisão 0057):
 *
 *  - as **partes** (a Curadoria, a Configuração, os Testes): os campos que têm parte (Painéis › Ajustes › Campos), cada
 *    parte num cartão da coluna larga, com um bloco por produto do card (o LineChat, o LinePBX) e a conta do que já foi
 *    feito. A parte da etapa em que o card está fica aberta; as outras, fechadas (um clique abre);
 *  - na negociação, os cards que ela abriu na implantação (a etapa de cada um); no card, a negociação de onde ele veio
 *    fica no cabeçalho.
 */
import { useMemo, useState } from 'react';
import { ChevronRight, ClipboardList, Rocket } from 'lucide-react';
import { chaveDoCampo, ehCaixinhas, paraBusca, partesDoChamado, type BlocoDaParte, type CampoPersonalizado, type ParteDoChamado } from '@gestor/shared';
import { ChipSituacao, CodigoChamado, painelDe } from '../comum.js';
import { Secao, useAberta } from './base.js';
import { Caixinhas } from './Caixinhas.js';
import { CampoNaFicha } from './Classificacao.js';
import { BlocoDoCampo } from './Textos.js';

/** As partes do chamado, na ordem dos campos (nada quando o painel não tem campos com parte). */
export function PartesDoChamado() {
  const { f, opcoes, etapa, faltando } = useAberta();
  const produtos = useMemo(() => f.produtos.map((p) => p.id), [f.produtos]);
  const partes = useMemo(() => partesDoChamado(opcoes.campos.filter((c) => c.painelId === f.painelId), produtos, f.campos), [opcoes.campos, f.painelId, produtos, f.campos]);
  if (!partes.length) return null;
  const daEtapa = etapa ? partes.find((p) => paraBusca(p.nome) === paraBusca(etapa.nome)) : undefined;
  // fora das etapas com o nome de uma parte (o Stand By, o Validado), todas abertas; o que a próxima etapa pede, também
  const temFalta = (p: ParteDoChamado) => p.blocos.some((b) => b.campos.some((c) => faltando.has(chaveDoCampo(c.id))));
  return (
    <>
      {partes.map((p) => (
        // a chave com a etapa: mover o card abre a parte da etapa nova
        <Parte key={`${p.nome}:${f.etapaId}`} p={p} atual={p === daEtapa} abertaDeInicio={!daEtapa || p === daEtapa || temFalta(p)} />
      ))}
    </>
  );
}

function Parte({ p, atual, abertaDeInicio }: { p: ParteDoChamado; atual: boolean; abertaDeInicio: boolean }) {
  const [aberta, setAberta] = useState(abertaDeInicio);
  const pct = p.total ? Math.round((p.feitos / p.total) * 100) : 0;
  const id = `parte-${paraBusca(p.nome).replace(/[^a-z0-9]+/g, '-')}`;
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
        <div id={`${id}-corpo`} className="px-4 pb-4 flex flex-col gap-4">
          {p.blocos.map((b) => <Bloco key={b.produtoId ?? '-'} b={b} />)}
        </div>
      )}
    </section>
  );
}

/** Os campos de um produto (ou os de todo card) numa parte. */
function Bloco({ b }: { b: BlocoDaParte }) {
  const { f, opcoes } = useAberta();
  const produto = b.produtoId ? f.produtos.find((x) => x.id === b.produtoId) ?? opcoes.produtos.find((x) => x.id === b.produtoId) : null;
  return (
    <div className="min-w-0">
      {produto && (
        <p className="flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wide text-ink-2 mb-1.5">
          <span className="w-2 h-2 rounded-full shrink-0" style={{ background: produto.cor }} aria-hidden /> {produto.nome}
        </p>
      )}
      <div className="rounded-lg border border-line px-3.5 py-3 flex flex-col divide-y divide-line">
        {b.campos.map((c) => <div key={c.id} className="py-3 first:pt-0 last:pb-0 min-w-0"><CampoDaParte c={c} /></div>)}
      </div>
    </div>
  );
}

function CampoDaParte({ c }: { c: CampoPersonalizado }) {
  if (ehCaixinhas(c.tipo)) return <Caixinhas c={c} />;
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
