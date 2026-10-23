/**
 * Relatórios › Clientes (2.1): o **Raio-X do cliente**, os **Chamados pelo tamanho do cliente**, **Voltou
 * com o mesmo problema** e **De quem é a falha?** (pelo campo de lista do painel que a equipe escolheu).
 */
import { Link } from 'react-router-dom';
import { ExternalLink } from 'lucide-react';
import { Chip, EscolherComBusca, Vazio } from '../../../components/ui/index.js';
import { data } from '../../../lib/format.js';
import { LinkDoChamado } from '../comum.js';
import { Barras, Cartao, Colunas, NumeroClicavel, Numero, Numeros, nf, pct, plural, tempoUtil, type PropsDoRelatorio } from './pecas.js';

// ---------- Raio-X do cliente ----------

export function RaioX({ r, abrir, aoEscolher }: PropsDoRelatorio & { aoEscolher: (id: string | null) => void }) {
  const c = r.clientes;
  const x = c.raiox;
  const opcoes = c.lista.map((l) => ({ id: l.id, nome: l.nome, dica: plural(l.n, 'chamado no período', 'chamados no período') }));
  if (x && !opcoes.some((o) => o.id === x.id)) opcoes.unshift({ id: x.id, nome: x.nome, dica: 'nenhum chamado no período' });
  const porId = new Map(r.chamados.map((ch) => [ch.id, ch]));
  return (
    <Cartao id="raiox"
      acoes={<EscolherComBusca className="input py-1.5 text-[13px] w-auto max-w-[260px]" rotulo="Cliente" valor={x?.id ?? ''} vazio="Escolha o cliente" opcoes={opcoes} procurar="Procurar cliente…" onChange={(v) => aoEscolher(v || null)} />}
      rodape={<>Os chamados do cliente no período (os em aberto e os por mês, de qualquer data) e o que ele tem no Gestor: os produtos que assina, os DIDs e os aparelhos com ele (os vendidos não contam, como na ficha).</>}>
      {!x ? (
        <div className="flex flex-col gap-2">
          <p className="text-[13.5px] text-ink-2">Escolha um cliente para ver o suporte dele num lugar só.{c.lista.length ? ' Os que mais abriram chamado no período:' : ''}</p>
          <div className="flex flex-wrap gap-1.5">
            {c.lista.slice(0, 6).map((l) => (
              <button key={l.id} type="button" className="btn-secondary btn-sm" onClick={() => aoEscolher(l.id)}>{l.nome} <span className="text-muted tnum">{l.n}</span></button>
            ))}
          </div>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <h3 className="font-display font-semibold text-[16px]">{x.nome}</h3>
            <Link to={`/clientes/${encodeURIComponent(x.id)}`} className="link text-[12.5px] inline-flex items-center gap-1">a ficha do cliente <ExternalLink size={11} aria-hidden /></Link>
            <span className="text-[12.5px] text-muted">{plural(x.dids, 'DID', 'DIDs')} · {plural(x.aparelhos, 'aparelho', 'aparelhos')}</span>
            <span className="flex flex-wrap gap-1">{x.produtos.map((p) => <Chip key={p}>{p}</Chip>)}</span>
          </div>
          <Numeros>
            <Numero valor={nf(x.chamados.n)} rotulo="chamados no período" abrir={abrir} ids={x.chamados.ids} janela={`${x.nome} — chamados no período`} />
            <Numero valor={tempoUtil(r, x.mediana)} rotulo="mediana até resolver" />
            <Numero valor={nf(x.abertos.n)} rotulo="em aberto agora" abrir={abrir} ids={x.abertos.ids} janela={`${x.nome} — em aberto agora`} tom={x.abertos.n ? 'signal' : undefined} />
            <Numero valor={nf(x.voltaram)} rotulo="voltaram com o mesmo assunto" sub={<span className="text-muted">em até 30 dias</span>} />
          </Numeros>
          <div>
            <div className="eyebrow mb-2">Por mês (12 meses)</div>
            <Colunas altura={90} pontos={x.meses.map((m) => ({ id: m.mes, rotulo: m.rotulo, n: m.n }))} vazio="Nenhum chamado nos últimos 12 meses." />
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="min-w-0">
              <div className="eyebrow mb-2">Os assuntos (1º nível)</div>
              <Barras itens={x.assuntos} abrir={abrir} janela={(a) => `${x.nome} — ${a}`} vazio="Nenhum com assunto no período." />
            </div>
            <div className="min-w-0">
              <div className="eyebrow mb-2">Os tipos</div>
              <Barras itens={x.tipos} abrir={abrir} janela={(t) => `${x.nome} — ${t}`} vazio="Nenhum com tipo no período." />
            </div>
          </div>
          {x.ultimos.length > 0 && (
            <div>
              <div className="eyebrow mb-1">Os últimos</div>
              <ul className="divide-y divide-line">
                {x.ultimos.map((id) => porId.get(id)).filter((ch) => !!ch).map((ch) => (
                  <li key={ch!.id} className="py-1.5 grid grid-cols-[auto_minmax(0,1fr)_auto] gap-x-2 items-baseline text-[13px]">
                    <LinkDoChamado codigo={ch!.codigo} className="link font-mono text-[12px]">{ch!.codigo}</LinkDoChamado>
                    <span className="truncate">{ch!.titulo}</span>
                    <span className="text-[12px] text-muted whitespace-nowrap">{ch!.etapa} · {data(ch!.criadoEm)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </Cartao>
  );
}

// ---------- Chamados pelo tamanho do cliente ----------

export function Tamanho({ r, abrir, aoRaioX }: PropsDoRelatorio & { aoRaioX: (id: string) => void }) {
  const x = r.tamanho;
  const max = Math.max(0, ...x.linhas.map((l) => l.por10Dids ?? 0));
  return (
    <Cartao id="tamanho" rodape={<>Os chamados que chegaram no período a cada 10 DIDs (e a cada 10 aparelhos) do cliente no Gestor: quem abre muito para o tamanho que tem aparece em cima. Cliente sem DID fica no fim. Clique no nome para o Raio-X.</>}>
      {!x.linhas.length ? <Vazio titulo="Nenhum chamado com cliente no período" texto="Escolha um período maior ou tire algum filtro." /> : (
        <div className="overflow-x-auto">
          <table className="table">
            {/* no celular, só as contas (por 10 DIDs, por 10 aparelhos): o DID e o aparelho de cada um ficam na tela larga */}
            <thead><tr><th>Cliente</th><th className="!text-right">Chamados</th><th className="!text-right hidden sm:table-cell">DIDs</th><th className="sm:min-w-[130px]">Por 10 DIDs</th><th className="!text-right hidden sm:table-cell">Aparelhos</th><th className="!text-right">Por 10 aparelhos</th></tr></thead>
            <tbody>
              {x.linhas.map((l) => (
                <tr key={l.id}>
                  <td className="text-[13px]"><button type="button" className="text-left hover:underline" onClick={() => aoRaioX(l.id)} title="Ver o Raio-X">{l.nome}</button></td>
                  <td className="text-right text-[13px]"><NumeroClicavel ids={l.ids} titulo={`${l.nome} — chamados no período`} abrir={abrir} /></td>
                  <td className="text-right tnum text-[13px] text-muted hidden sm:table-cell">{nf(l.dids)}</td>
                  <td className="text-[13px]">{l.por10Dids === null ? <span className="text-muted whitespace-nowrap">sem DID</span> : (
                    <span className="flex items-center gap-2">
                      <span className="hidden sm:block flex-1 h-2 rounded-full bg-surface-2 overflow-hidden"><span className="block h-full rounded-full bg-accent" style={{ width: `${Math.max(3, (l.por10Dids / Math.max(max, 1e-9)) * 100)}%` }} /></span>
                      <span className="tnum w-[38px] text-right">{nf(l.por10Dids)}</span>
                    </span>
                  )}</td>
                  <td className="text-right tnum text-[13px] text-muted hidden sm:table-cell">{nf(l.aparelhos)}</td>
                  <td className="text-right tnum text-[13px]">{l.por10Aparelhos === null ? <span className="text-muted">—</span> : nf(l.por10Aparelhos)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Cartao>
  );
}

// ---------- Voltou com o mesmo problema ----------

export function Voltou({ r, abrir }: PropsDoRelatorio) {
  const x = r.voltou;
  const voltas = x.linhas.reduce((a, l) => a + l.voltas, 0);
  const clientes = new Set(x.linhas.map((l) => l.cliente)).size;
  return (
    <Cartao id="voltou" rodape={<>O mesmo cliente com o mesmo assunto (o de baixo, inteiro) de novo em até 30 dias. A volta conta no período em que aconteceu; a janela mostra a sequência inteira (com a de antes). Junto, os ligados à mão como "repete" e os reabertos.</>}>
      <Numeros>
        <Numero valor={nf(voltas)} rotulo="voltas com o mesmo assunto" sub={<span className="text-muted">de {plural(clientes, 'cliente', 'clientes')}</span>} />
        <Numero valor={nf(x.repetem.n)} rotulo={'ligados como "repete"'} abrir={abrir} ids={x.repetem.ids} janela={'Ligados como "repete"'} />
        <Numero valor={nf(x.reabertos.n)} rotulo="reabertos" abrir={abrir} ids={x.reabertos.ids} janela="Reabertos" tom={x.reabertos.n ? 'signal' : undefined} />
      </Numeros>
      {!x.linhas.length ? <p className="text-[13px] text-muted">Nenhum cliente voltou com o mesmo assunto no período.</p> : (
        <div className="overflow-x-auto">
          <table className="table">
            {/* no celular, o intervalo e a data saem da tabela (a janela de cada linha mostra a sequência) */}
            <thead><tr><th>Cliente</th><th>Assunto</th><th className="!text-right">Vezes</th><th className="!text-right hidden sm:table-cell">Menor intervalo</th><th className="!text-right hidden sm:table-cell">A última</th></tr></thead>
            <tbody>
              {x.linhas.slice(0, 15).map((l) => (
                <tr key={`${l.cliente}|${l.assunto}|${l.ultimo}`}>
                  <td className="text-[13px]">{l.cliente}</td>
                  <td className="text-[13px]">{l.assunto}</td>
                  <td className="text-right text-[13px]"><NumeroClicavel ids={l.ids} titulo={`${l.cliente} — ${l.assunto}`} abrir={abrir} tom="font-semibold" /></td>
                  <td className="text-right tnum text-[13px] whitespace-nowrap hidden sm:table-cell">{plural(l.menorIntervalo, 'dia', 'dias')}</td>
                  <td className="text-right tnum text-[13px] whitespace-nowrap text-muted hidden sm:table-cell">{data(l.ultimo)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {x.linhas.length > 15 && <p className="text-[12px] text-muted mt-1">Os 15 com mais voltas (de {x.linhas.length}).</p>}
        </div>
      )}
    </Cartao>
  );
}

// ---------- De quem é a falha? ----------

const CORES = ['var(--accent)', 'var(--signal)', 'var(--ok)', 'var(--roxo)', 'var(--turquesa)', 'var(--rosa)', 'var(--amarelo)'];

export function Falha({ r, abrir, podeEscolher, aoOrganizar }: PropsDoRelatorio & { podeEscolher: boolean; aoOrganizar: () => void }) {
  const x = r.falha;
  if (!x.campo) {
    return (
      <Cartao id="falha">
        <Vazio titulo="Falta escolher o campo"
          texto={x.possiveis.length
            ? `Diga de qual campo de lista do painel sai a resposta (${x.possiveis.map((c) => c.nome).join(', ')}).${podeEscolher ? '' : ' Quem cuida dos chamados escolhe em Organizar.'}`
            : 'O painel não tem um campo de lista (como "Responsabilidade", com Ingline, Cliente, Operadora…). Crie um em Painéis › Ajustes › Campos.'}
          acao={podeEscolher && x.possiveis.length ? <button type="button" className="btn-secondary btn-sm" onClick={aoOrganizar}>Escolher em Organizar</button> : undefined} />
      </Cartao>
    );
  }
  const total = x.porOpcao.reduce((a, o) => a + o.n, 0) + x.semResposta.n;
  const cor = (i: number) => CORES[i % CORES.length]!;
  const maxMes = Math.max(1, ...x.meses.map((m) => m.porOpcao.reduce((a, n) => a + n, 0) + m.semResposta));
  return (
    <Cartao id="falha" rodape={<>Pelo campo <b>{x.campo.nome}</b> dos chamados resolvidos no período (o campo costuma ser preenchido ao resolver){x.campo.automatico ? '; o campo foi achado pelo nome, e quem cuida dos chamados troca em Organizar' : '; o campo foi escolhido em Organizar'}. Embaixo, os 6 meses até o fim do período, pelo mês em que foram resolvidos.</>}>
      {!x.total ? <Vazio titulo="Nenhum chamado resolvido no período" texto="Escolha um período maior ou tire algum filtro." /> : (
        <>
          <Numeros>
            {x.porOpcao.slice(0, 3).map((o, i) => (
              <Numero key={o.opcao} valor={`${o.pct}%`} rotulo={o.nome} abrir={abrir} ids={o.ids} janela={`${x.campo!.nome}: ${o.nome}`} sub={<span className="text-muted">{plural(o.n, 'resolvido', 'resolvidos')}</span>} titulo={i === 0 ? 'A resposta mais comum' : undefined} />
            ))}
            <Numero valor={`${pct(x.semResposta.n, x.total)}%`} rotulo="sem resposta" abrir={abrir} ids={x.semResposta.ids} janela={`Resolvidos sem ${x.campo.nome}`} sub={<span className="text-muted">{plural(x.semResposta.n, 'resolvido', 'resolvidos')}</span>} />
          </Numeros>
          <div>
            <div className="flex h-7 rounded-md overflow-hidden gap-0.5 bg-surface-2">
              {x.porOpcao.map((o, i) => (
                <button key={o.opcao} type="button" onClick={() => abrir({ titulo: `${x.campo!.nome}: ${o.nome}`, ids: o.ids })} title={`${o.nome}: ${o.n} (${o.pct}%)`}
                  className="h-full hover:brightness-110 text-white text-[12px] font-semibold px-2 overflow-hidden whitespace-nowrap text-left" style={{ width: `${(o.n / Math.max(1, total)) * 100}%`, background: cor(i) }}>
                  {o.n / Math.max(1, total) > 0.12 ? `${o.pct}%` : ''}
                </button>
              ))}
              {x.semResposta.n > 0 && <span className="h-full bg-line-strong" style={{ width: `${(x.semResposta.n / Math.max(1, total)) * 100}%` }} title={`Sem resposta: ${x.semResposta.n}`} />}
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-[12px] text-ink-2">
              {x.porOpcao.map((o, i) => <span key={o.opcao} className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: cor(i) }} /> {o.nome} ({nf(o.n)})</span>)}
              {x.semResposta.n > 0 && <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-line-strong" /> sem resposta ({nf(x.semResposta.n)})</span>}
            </div>
          </div>
          <div>
            <div className="eyebrow mb-2">Mês a mês</div>
            <div className="flex items-end gap-2 h-[110px]">
              {x.meses.map((m) => {
                const soma = m.porOpcao.reduce((a, n) => a + n, 0) + m.semResposta;
                return (
                  <div key={m.mes} className="flex-1 min-w-0 h-full flex flex-col justify-end items-center" title={`${m.rotulo}: ${x.porOpcao.map((o, i) => `${o.nome} ${m.porOpcao[i]}`).join(', ')}${m.semResposta ? `, sem resposta ${m.semResposta}` : ''}`}>
                    {soma > 0 && <span className="text-[10.5px] tnum text-ink-2 mb-0.5">{soma}</span>}
                    <div className="w-full max-w-[44px] flex flex-col-reverse rounded-t overflow-hidden" style={{ height: `${(soma / maxMes) * 88}px` }}>
                      {m.porOpcao.map((n, i) => (n ? <span key={i} style={{ height: `${(n / soma) * 100}%`, background: cor(i) }} /> : null))}
                      {m.semResposta > 0 && <span className="bg-line-strong" style={{ height: `${(m.semResposta / soma) * 100}%` }} />}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="flex gap-2 border-t border-line mt-0.5 pt-1">
              {x.meses.map((m) => <span key={m.mes} className="flex-1 min-w-0 text-center text-[10.5px] text-muted">{m.rotulo}</span>)}
            </div>
          </div>
        </>
      )}
    </Cartao>
  );
}
