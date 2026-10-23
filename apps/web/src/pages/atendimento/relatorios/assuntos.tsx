/**
 * Relatórios › Assuntos (2.1): **Os assuntos** (novo: a árvore do painel, clicando para descer), **Sobe e
 * desce dos assuntos** (no nível escolhido), **Onde está a gravidade** (novo: assunto × gravidade), **Os poucos
 * que pesam muito** (o 80/20) e **Os problemas** (novo: os problemas abertos e os incidentes de cada um).
 */
import { useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { NOME_DO_PARETO, PARETO_DO_PAINEL, type NoDaArvore, type ParetoDoPainel } from '@gestor/shared';
import { Chip, Vazio } from '../../../components/ui/index.js';
import { LinkDoChamado } from '../comum.js';
import { Cartao, NumeroClicavel, Numero, Numeros, corDaCelula, larguraDoTexto, nf, pct, plural, tempoUtil, type PropsDoRelatorio } from './pecas.js';

// ---------- Os assuntos (a árvore) ----------

export function Arvore({ r, abrir }: PropsDoRelatorio) {
  const x = r.arvore;
  const [caminho, setCaminho] = useState<string[]>([]);
  // o nó aberto (o caminho que sumiu com o filtro ou o período volta para o começo)
  const nos: NoDaArvore[] = [];
  let lista = x.raiz;
  for (const id of caminho) {
    const no = lista.find((n) => n.id === id);
    if (!no) break;
    nos.push(no);
    lista = no.filhos;
  }
  const atual = nos[nos.length - 1] ?? null;
  const total = atual ? atual.n : x.comAssunto;
  const resolvidos = atual ? atual.resolvidos : x.raiz.reduce((a, n) => a + n.resolvidos, 0);
  const max = Math.max(1, ...lista.map((n) => n.n));
  const irPara = (i: number) => setCaminho(nos.slice(0, i).map((n) => n.id));
  return (
    <Cartao id="arvore" rodape={<>Os chamados que chegaram no período, pela árvore de assuntos do painel (Ajustes › Campos › O Assunto). Cada assunto soma os de baixo. A mediana e o prazo são dos já resolvidos, em horas úteis. Assunto desativado continua aparecendo nos chamados que o têm.</>}>
      {!x.chegaram ? <Vazio titulo="Nada chegou no período" texto="Escolha um período maior ou tire algum filtro." /> : (
        <>
          <nav aria-label="O caminho na árvore de assuntos" className="flex flex-wrap items-center gap-1 text-[13px] -mt-1">
            <button type="button" className={nos.length ? 'link' : 'font-semibold text-ink'} onClick={() => irPara(0)} disabled={!nos.length}>Todos os assuntos</button>
            {nos.map((n, i) => (
              <span key={n.id} className="inline-flex items-center gap-1">
                <ChevronRight size={13} className="text-muted" aria-hidden />
                <button type="button" className={i === nos.length - 1 ? 'font-semibold text-ink' : 'link'} onClick={() => irPara(i + 1)} disabled={i === nos.length - 1}>{n.nome}</button>
              </span>
            ))}
          </nav>
          <Numeros>
            <Numero valor={nf(total)} rotulo={atual ? `chegaram com ${atual.nome}` : 'chegaram com assunto'} abrir={abrir} ids={atual?.ids} janela={atual ? `Chegaram com ${atual.nome}` : undefined}
              sub={<span className="text-muted">{atual ? `${pct(atual.n, x.chegaram)}% de todos os que chegaram` : `de ${plural(x.chegaram, 'chamado', 'chamados')} no período`}</span>} />
            {atual && (
              <>
                <Numero valor={tempoUtil(r, atual.mediana)} rotulo="mediana até resolver" sub={<span className="text-muted">dos {nf(atual.resolvidos)} já resolvidos</span>} />
                <Numero valor={atual.comPrazo ? `${pct(atual.noPrazo, atual.comPrazo)}%` : '—'} rotulo="resolvidos no prazo" sub={<span className="text-muted">{nf(atual.noPrazo)} de {nf(atual.comPrazo)}</span>} />
                <Numero valor={nf(atual.abertos)} rotulo="ainda em aberto" sub={<span className="text-muted">dos que chegaram no período</span>} />
              </>
            )}
            {!atual && <Numero valor={nf(resolvidos)} rotulo="já resolvidos" />}
          </Numeros>
          {!lista.length ? <p className="text-[13px] text-muted">{atual ? `${atual.nome} não tem assuntos embaixo.` : 'Nenhum chamado com assunto no período.'}</p> : (
            <div className="overflow-x-auto">
              <div className="eyebrow mb-2">{atual ? `Dentro de ${atual.nome}` : 'Os assuntos do 1º nível'} · clique no nome para descer, no número para ver os chamados</div>
              <table className="table">
                <thead><tr><th>Assunto</th><th className="sm:min-w-[150px]">Chamados</th><th className="!text-right">%</th><th className="!text-right">Mediana</th><th className="!text-right">No prazo</th><th className="!text-right">Em aberto</th></tr></thead>
                <tbody>
                  {lista.map((n) => (
                    <tr key={n.id}>
                      <td className="text-[13px]">
                        {n.filhos.length ? (
                          <button type="button" className="text-left font-semibold hover:underline inline-flex items-center gap-1" onClick={() => setCaminho([...nos.map((x) => x.id), n.id])} title="Descer neste assunto">
                            {n.nome} <ChevronRight size={13} className="text-muted" aria-hidden />
                          </button>
                        ) : <span className="font-semibold">{n.nome}</span>}
                        {!n.ativo && <Chip tone="muted" className="ml-1">desativado</Chip>}
                        {n.filhos.length > 0 && <span className="block text-[11.5px] text-muted">{plural(n.filhos.length, 'assunto embaixo', 'assuntos embaixo')}</span>}
                      </td>
                      <td className="text-[13px]">
                        <button type="button" className="w-full flex items-center gap-2 text-left" onClick={() => abrir({ titulo: `Chegaram com ${n.nome}`, ids: n.ids })} title="Clique para ver os chamados">
                          <span className="hidden sm:block flex-1 h-2 rounded-full bg-surface-2 overflow-hidden"><span className="block h-full rounded-full bg-accent" style={{ width: `${Math.max(3, (n.n / max) * 100)}%` }} /></span>
                          <span className="tnum w-[34px] text-right hover:underline">{nf(n.n)}</span>
                        </button>
                      </td>
                      <td className="text-right tnum text-[13px] text-muted">{pct(n.n, total)}%</td>
                      <td className="text-right tnum text-[13px] whitespace-nowrap">{tempoUtil(r, n.mediana)}</td>
                      <td className="text-right tnum text-[13px]">{n.comPrazo ? `${pct(n.noPrazo, n.comPrazo)}%` : <span className="text-muted">—</span>}</td>
                      <td className={`text-right tnum text-[13px] ${n.abertos ? '' : 'text-muted'}`}>{nf(n.abertos)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {!atual && x.semAssunto.n > 0 && (
            <p className="text-[13px] flex flex-wrap items-baseline gap-x-2">
              <span className="text-muted">Ainda sem assunto:</span>
              <NumeroClicavel ids={x.semAssunto.ids} titulo="Chegaram sem assunto" abrir={abrir} tom="font-semibold" />
              <span className="text-muted">({nf(x.semAssunto.abertos)} em aberto; o assunto é pedido para entrar no Resolvido)</span>
            </p>
          )}
        </>
      )}
    </Cartao>
  );
}

// ---------- Sobe e desce dos assuntos ----------

export function Sobe({ r, abrir, aoNivel }: PropsDoRelatorio & { aoNivel: (n: number) => void }) {
  const x = r.sobe;
  const mais = x.subiram[0];
  const menos = x.cairam[0];
  const itens = [...x.subiram, ...x.cairam];
  const max = Math.max(1, ...itens.map((i) => Math.abs(i.delta)));
  // as colunas do fim do tamanho do maior texto: as barras começam todas juntas
  const colunas = `minmax(0,1fr) minmax(60px,34%) ${larguraDoTexto(itens.map((v) => `▲${nf(Math.abs(v.delta))}`))} ${larguraDoTexto(itens.map((v) => `${v.antes} → ${v.agora}`))}`;
  return (
    <Cartao id="sobe"
      acoes={(
        <div className="inline-flex rounded-lg border border-line bg-surface p-0.5" role="group" aria-label="O nível dos assuntos">
          {[1, 2, 3].map((n) => (
            <button key={n} type="button" aria-pressed={x.nivel === n} onClick={() => aoNivel(n)}
              className={`rounded-md px-2 py-0.5 text-[12.5px] font-semibold ${x.nivel === n ? 'bg-accent-soft text-accent-ink' : 'text-ink-2 hover:bg-surface-2'}`}>{n}º nível</button>
          ))}
        </div>
      )}
      rodape={<>Os chamados que chegaram com cada assunto (no nível escolhido), no período e em {r.periodo.anterior.nome} ({r.periodo.anterior.de.slice(8, 10)}/{r.periodo.anterior.de.slice(5, 7)} a {r.periodo.anterior.ate.slice(8, 10)}/{r.periodo.anterior.ate.slice(5, 7)}). Os 8 que mais subiram e os 8 que mais caíram; {x.iguais ? `${plural(x.iguais, 'ficou igual', 'ficaram iguais')}.` : 'nenhum ficou igual.'}</>}>
      {x.semComparacao ? <Vazio titulo="Ainda não há com o que comparar" texto={`O painel não tinha chamados em ${r.periodo.anterior.nome}. A comparação começa quando houver um período inteiro de antes.`} /> : (
        <>
          <Numeros>
            <Numero valor={`${nf(x.agora)} × ${nf(x.antes)}`} rotulo={`chegaram × ${r.periodo.anterior.nome}`} />
            {mais && <Numero valor={mais.rotulo} rotulo={`o que mais subiu: de ${mais.antes} para ${mais.agora}`} tom="signal" abrir={abrir} ids={mais.ids} janela={`Chegaram com ${mais.rotulo}`} />}
            {menos && <Numero valor={menos.rotulo} rotulo={`o que mais caiu: de ${menos.antes} para ${menos.agora}`} tom="ok" abrir={abrir} ids={menos.ids} janela={`Chegaram com ${menos.rotulo}`} />}
          </Numeros>
          {!itens.length ? <p className="text-[13px] text-muted">Nenhum assunto mudou.</p> : (
            <div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 mb-2 text-[12px] text-ink-2">
                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-signal" /> subiu</span>
                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-ok" /> caiu</span>
                <span className="text-muted">clique num assunto para ver os chamados de agora</span>
              </div>
              <ul className="flex flex-col gap-1">
                {itens.map((v) => {
                  const sobe = v.delta > 0;
                  return (
                    <li key={v.chave}>
                      <button type="button" disabled={!v.ids.length} onClick={() => abrir({ titulo: `Chegaram com ${v.rotulo}`, ids: v.ids })}
                        className="w-full grid items-center gap-x-2 text-[13px] text-left rounded-md px-1 -mx-1 py-0.5 enabled:hover:bg-surface-2"
                        style={{ gridTemplateColumns: colunas }}
                        title={`${v.rotulo}: de ${v.antes} para ${v.agora}`}>
                        <span className="truncate">{v.rotulo}</span>
                        <span className="h-2.5 rounded-full bg-surface-2 overflow-hidden"><span className={`block h-full rounded-full ${sobe ? 'bg-signal' : 'bg-ok'}`} style={{ width: `${Math.max(4, (Math.abs(v.delta) / max) * 100)}%` }} /></span>
                        <span className={`text-right whitespace-nowrap tnum text-[12px] font-semibold ${sobe ? 'text-signal' : 'text-ok'}`}>{sobe ? '▲' : '▼'}{nf(Math.abs(v.delta))}</span>
                        <span className="text-right whitespace-nowrap tnum text-[11.5px] text-muted">{v.antes} → {v.agora}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </>
      )}
    </Cartao>
  );
}

// ---------- Onde está a gravidade ----------

export function Gravidade({ r, abrir }: PropsDoRelatorio) {
  const x = r.gravidade;
  const maxDaColuna = x.colunas.map((_, i) => Math.max(1, ...x.linhas.map((l) => l.celulas[i]!.n)));
  const nomeCurto = (g: string, nome: string) => (g === 'nao_se_aplica' ? 'Pedido' : nome);
  return (
    <Cartao id="gravidade" rodape={<>A gravidade de cada chamado (Inoperância, Intermitência, Performance, Disfuncional ou Não se aplica, aqui como Pedido), pelo assunto do 1º nível. Cada coluna é comparada consigo mesma: o mais escuro é o assunto com mais chamados daquela gravidade.{x.semGravidade.n ? ` ${plural(x.semGravidade.n, 'chegou', 'chegaram')} sem gravidade.` : ''}</>}>
      {!x.total ? <Vazio titulo="Nenhum chamado com gravidade no período" texto="Escolha um período maior ou tire algum filtro." /> : (
        <>
          <Numeros>
            <Numero valor={nf(x.inoperancias.n)} rotulo="inoperâncias no período" tom={x.inoperancias.n ? 'signal' : undefined}
              sub={x.inoperancias.topo ? <span className="text-muted">{x.inoperancias.topo.n} em {x.inoperancias.topo.rotulo} ({pct(x.inoperancias.topo.n, x.inoperancias.n)}%)</span> : undefined} />
            <Numero valor={`${pct(x.pedidos, x.total)}%`} rotulo="eram pedidos, não defeito" sub={<span className="text-muted">{nf(x.pedidos)} de {nf(x.total)} com gravidade</span>} />
          </Numeros>
          <div className="overflow-x-auto -mx-1 px-1">
            <table className="border-separate border-spacing-[3px] text-[12.5px] w-full min-w-[520px]">
              <thead>
                <tr>
                  <th className="text-left font-normal text-muted">Assunto (1º nível)</th>
                  {x.colunas.map((c) => <th key={c.gravidade} scope="col" className="font-semibold text-ink-2 text-center">{nomeCurto(c.gravidade, c.nome)}<span className="block font-normal text-muted tnum">{c.n}</span></th>)}
                </tr>
              </thead>
              <tbody>
                {x.linhas.map((l) => (
                  <tr key={l.rotulo}>
                    <th scope="row" className="text-left font-normal text-ink truncate max-w-[180px]">{l.rotulo} <span className="text-muted tnum">({l.total})</span></th>
                    {l.celulas.map((c, i) => (
                      <td key={x.colunas[i]!.gravidade} className="p-0">
                        <button type="button" disabled={!c.n} onClick={() => abrir({ titulo: `${l.rotulo} — ${nomeCurto(x.colunas[i]!.gravidade, x.colunas[i]!.nome)}`, ids: c.ids })}
                          className="w-full h-8 rounded tnum text-ink enabled:hover:ring-2 enabled:hover:ring-accent"
                          style={{ background: c.n ? corDaCelula(c.n / maxDaColuna[i]!) : 'var(--surface-2)' }}
                          title={`${l.rotulo} · ${x.colunas[i]!.nome}: ${c.n}`}>
                          {c.n || ''}
                        </button>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Cartao>
  );
}

// ---------- Os poucos que pesam muito ----------

const NOME_DO_GRUPO: Record<ParetoDoPainel, [string, string]> = {
  assunto: ['assunto', 'assuntos'], assunto1: ['assunto', 'assuntos'], cliente: ['cliente', 'clientes'], produto: ['produto', 'produtos'], operadora: ['operadora', 'operadoras'], tipo: ['tipo', 'tipos'],
};

export function Pareto({ r, abrir, aoPor }: PropsDoRelatorio & { aoPor: (p: ParetoDoPainel) => void }) {
  const x = r.pareto;
  const [todos, setTodos] = useState(false);
  const [um, varios] = NOME_DO_GRUPO[x.por];
  const mostrados = todos ? x.itens : x.itens.slice(0, 12);
  const max = Math.max(1, ...x.itens.map((i) => i.n));
  return (
    <Cartao id="pareto"
      acoes={(
        <select className="input w-auto py-1.5 text-[13px]" aria-label="Por" value={x.por} onChange={(e) => aoPor(e.target.value as ParetoDoPainel)}>
          {PARETO_DO_PAINEL.map((p) => <option key={p} value={p}>por {NOME_DO_PARETO[p].toLocaleLowerCase('pt-BR')}</option>)}
        </select>
      )}
      rodape={<>Os chamados que chegaram no período, do {um} com mais chamados para o com menos; "somando" é a parte acumulada. Um chamado com dois produtos (ou duas operadoras) conta nos dois.{x.naoPreenchido.n ? ` ${plural(x.naoPreenchido.n, 'chegou', 'chegaram')} sem ${um}.` : ''}</>}>
      {!x.total ? <Vazio titulo={`Nenhum chamado com ${um} no período`} texto="Escolha um período maior, outro agrupamento ou tire algum filtro." /> : (
        <>
          <Numeros>
            <Numero valor={`${x.k80} de ${x.distintos}`} rotulo={`${varios} fazem 80% dos chamados`} tom={x.k80 / x.distintos <= 0.3 ? 'signal' : undefined}
              sub={<span className="text-muted">{pct(x.k80, x.distintos)}% dos {varios}</span>} />
            <Numero valor={nf(x.total)} rotulo="chamados contados" />
          </Numeros>
          <div>
            <ul className="flex flex-col gap-1">
              {mostrados.map((i, k) => (
                <li key={i.rotulo}>
                  <button type="button" onClick={() => abrir({ titulo: `Chegaram — ${i.rotulo}`, ids: i.ids })}
                    className={`w-full grid grid-cols-[minmax(0,1fr)_minmax(60px,38%)_auto_auto] items-center gap-2 text-[13px] text-left rounded-md px-1 -mx-1 py-0.5 hover:bg-surface-2 ${k < x.k80 ? '' : 'opacity-70'}`}
                    title={`${i.rotulo}: ${i.n} — somando ${i.somando}%`}>
                    <span className="truncate">{i.rotulo}</span>
                    <span className="h-2 rounded-full bg-surface-2 overflow-hidden"><span className={`block h-full rounded-full ${k < x.k80 ? 'bg-accent' : 'bg-line-strong'}`} style={{ width: `${Math.max(3, (i.n / max) * 100)}%` }} /></span>
                    <span className="font-mono text-[12px] tnum text-ink-2 text-right w-[34px]">{nf(i.n)}</span>
                    <span className={`font-mono text-[11.5px] tnum text-right w-[44px] ${k === x.k80 - 1 ? 'text-signal font-semibold' : 'text-muted'}`}>{i.somando}%</span>
                  </button>
                  {k === x.k80 - 1 && k < mostrados.length - 1 && (
                    <div className="flex items-center gap-2 my-1 text-[11.5px] text-signal" aria-hidden><span className="flex-1 border-t border-dashed border-signal" />80% até aqui<span className="flex-1 border-t border-dashed border-signal" /></div>
                  )}
                </li>
              ))}
            </ul>
            {x.itens.length > 12 && <button type="button" className="btn-ghost btn-sm mt-1" onClick={() => setTodos((v) => !v)}>{todos ? 'Mostrar só os 12 maiores' : `Ver todos (${x.itens.length})`}</button>}
          </div>
        </>
      )}
    </Cartao>
  );
}

// ---------- Os problemas ----------

export function Problemas({ r, abrir }: PropsDoRelatorio) {
  const x = r.problemas;
  return (
    <Cartao id="problemas" rodape={<>O problema (a causa por trás de vários incidentes, como no ITIL) é aberto na tela com "É um problema" e junta os chamados de clientes diferentes. Ele fica fora das contas dos outros relatórios. Os abertos são de agora, de qualquer data.</>}>
      <Numeros>
        <Numero valor={nf(x.abertos.length)} rotulo="problemas abertos agora" tom={x.abertos.length ? 'signal' : undefined} />
        <Numero valor={nf(x.incidentesNoPeriodo.n)} rotulo="incidentes de um problema no período" abrir={abrir} ids={x.incidentesNoPeriodo.ids} janela="Incidentes de um problema no período" />
        <Numero valor={nf(x.semCausa)} rotulo="abertos ainda sem a causa" tom={x.semCausa ? 'signal' : undefined} />
        <Numero valor={nf(x.resolvidosNoPeriodo.n)} rotulo="problemas resolvidos no período" abrir={abrir} ids={x.resolvidosNoPeriodo.ids} janela="Problemas resolvidos no período" />
      </Numeros>
      {!x.abertos.length ? <p className="text-[13px] text-muted">Nenhum problema aberto.</p> : (
        <ul className="divide-y divide-line">
          {x.abertos.map((p) => (
            <li key={p.id} className="py-2 grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 items-baseline text-[13.5px]">
              <span className="min-w-0">
                <LinkDoChamado codigo={p.codigo} className="hover:text-accent"><span className="font-mono text-[12px] text-muted mr-1.5">{p.codigo}</span><span className="font-semibold">{p.titulo}</span></LinkDoChamado>
                <span className="block text-[12px] text-muted">aberto há {plural(p.abertoHaDias, 'dia', 'dias')}{!p.temCausa && <Chip tone="signal" className="ml-2">sem a causa</Chip>}</span>
              </span>
              <span className="text-[12.5px] whitespace-nowrap"><NumeroClicavel ids={p.incidentes.ids} titulo={`Incidentes de ${p.codigo}`} abrir={abrir} tom="font-semibold" /> <span className="text-muted">{p.incidentes.n === 1 ? 'incidente' : 'incidentes'}</span></span>
            </li>
          ))}
        </ul>
      )}
    </Cartao>
  );
}
