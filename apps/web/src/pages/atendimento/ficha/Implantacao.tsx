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
import { chaveDoCampo, ehCaixinhas, gruposNaLateral, paraBusca, partesDoChamado, type BlocoDaParte, type CampoPersonalizado, type ParteDoChamado } from '@gestor/shared';
import { ChipSituacao, CodigoChamado, painelDe } from '../comum.js';
import { Secao, useAberta } from './base.js';
import { Caixinhas } from './Caixinhas.js';
import { CampoNaFicha } from './Classificacao.js';
import { BlocoDoCampo } from './Textos.js';

/** As partes do chamado, na ordem dos grupos do painel (nada quando o painel não tem campos com parte). */
export function PartesDoChamado() {
  const { f, opcoes, etapa, faltando, painel } = useAberta();
  const produtos = useMemo(() => f.produtos.map((p) => p.id), [f.produtos]);
  const grupos = painel?.ajustes.partes;
  const partes = useMemo(() => partesDoChamado(opcoes.campos.filter((c) => c.painelId === f.painelId), produtos, f.campos, grupos ?? []), [opcoes.campos, f.painelId, produtos, f.campos, grupos]);
  if (!partes.length) return null;
  const daEtapa = etapa ? partes.find((p) => paraBusca(p.nome) === paraBusca(etapa.nome)) : undefined;
  // fora das etapas com o nome de uma parte (o Stand By, o Concluído, o Implantado), todas abertas; o que a próxima etapa pede, também
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
          {p.blocos.map((b) => <Bloco key={b.produtoId ?? '-'} b={b} parte={p.nome} />)}
        </div>
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
 * abaixo da Classificação, com os campos que o chamado mostra (o texto longo e as caixinhas inteiros, os outros numa linha).
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

/** Os campos do bloco em grupos: os curtos seguidos juntos (vão lado a lado); o texto longo e as caixinhas, um a um. */
function gruposDoBloco(campos: readonly CampoPersonalizado[]): Array<{ curtos: boolean; campos: CampoPersonalizado[] }> {
  const grupos: Array<{ curtos: boolean; campos: CampoPersonalizado[] }> = [];
  for (const c of campos) {
    const curto = c.tipo !== 'texto_longo' && c.tipo !== 'documento' && !ehCaixinhas(c.tipo);
    const ultimo = grupos[grupos.length - 1];
    if (curto && ultimo?.curtos) ultimo.campos.push(c);
    else grupos.push({ curtos: curto, campos: [c] });
  }
  return grupos;
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
