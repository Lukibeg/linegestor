/**
 * Trazer do Helena (Patch 2.0.3, decisão 0054): o painel de vendas do Helena (o "Ingline - Comercial") vem
 * para um painel de Vendas do Gestor, com o histórico de cada negociação — o pedido do Luan, em 21/10: "pegue
 * tudo que já ta no meu painel do helena e migre para o nosso, inclusive o histórico para que eu possa usar o
 * relatório".
 *
 * Três passos, nesta ordem: escolher o painel de lá e o de cá, ler o Helena (a leitura pede o histórico card a
 * card: a barra mostra quantos já vieram) e conferir a prévia — os números de agora e os ganhos mês a mês, para
 * comparar com o relatório do Helena, as etapas, os campos, as pessoas e o que fica de fora. Só o "Trazer"
 * grava; trazendo de novo, o que já veio é atualizado.
 *
 * A planilha do Helena (2.1.1): a chave de API não lê a Conclusão, e a prévia pede a planilha que o "Exportar"
 * do Helena faz — o link do Google Planilhas ou o .csv baixado dela. Com ela, os ganhos caem no mês certo.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, CheckCircle2, FileSpreadsheet, History, RefreshCw, TriangleAlert, Upload } from 'lucide-react';
import {
  LIMITES_DA_PLANILHA_DO_HELENA, NOME_TIPO_CAMPO, reaisCurto, reaisInteiros,
  type LeituraDoHelenaNaTela, type PlanilhaParaALeitura, type PreviaDoHelena, type ResultadoDoTrazerDoHelena,
} from '@gestor/shared';
import { IS_DEMO } from '../../api/index.js';
import { api } from '../../api/index.js';
import { Campo, Chip, Confirmar, Kpi, Spinner, mensagemErro, useToast } from '../../components/ui/index.js';

/** O valor "nenhum painel": a importação cria um painel de Vendas novo. */
const NOVO = '';
const plural = (n: number, um: string, varios: string) => `${n.toLocaleString('pt-BR')} ${n === 1 ? um : varios}`;

export function TrazerDoHelena() {
  const qc = useQueryClient();
  const toast = useToast();
  const opcoes = useQuery({ queryKey: ['helena-opcoes'], queryFn: api.helena.opcoes });
  const [painel, setPainel] = useState('');
  const [destino, setDestino] = useState<string | null>(null);
  const [leitura, setLeitura] = useState<LeituraDoHelenaNaTela | null>(null);
  const [erro, setErro] = useState('');
  const [confirmar, setConfirmar] = useState(false);
  const [trazendo, setTrazendo] = useState(false);
  const [feito, setFeito] = useState<ResultadoDoTrazerDoHelena | null>(null);

  // o painel de vendas do Helena e, no Gestor, o painel de Vendas que já existe (se for um só) ou um novo
  useEffect(() => {
    const o = opcoes.data;
    if (!o) return;
    if (!painel) setPainel(o.helena.find((p) => p.vendas)?.id ?? o.helena[0]?.id ?? '');
    if (destino === null) setDestino(o.destinos[0]?.id ?? NOVO);
  }, [opcoes.data, painel, destino]);

  // a leitura anda por fora: a tela pergunta como vai até acabar
  useEffect(() => {
    if (!leitura || leitura.estado !== 'lendo') return;
    const t = setTimeout(() => {
      api.helena.leitura(leitura.id).then(setLeitura).catch((e) => { setErro(mensagemErro(e)); setLeitura(null); });
    }, 700);
    return () => clearTimeout(t);
  }, [leitura]);

  const pronta = leitura?.estado === 'pronta';
  const previa = useQuery({
    queryKey: ['helena-previa', leitura?.id, destino],
    queryFn: () => api.helena.previa(leitura!.id, destino || null),
    enabled: pronta && destino !== null, staleTime: Infinity, retry: false,
  });

  const ler = async () => {
    setErro(''); setFeito(null);
    try { setLeitura(await api.helena.ler(painel)); } catch (e) { setErro(mensagemErro(e)); }
  };
  // a planilha completou a leitura (2.1.1): a prévia é refeita com a Conclusão de cada card
  const planilhaUsada = async (l: LeituraDoHelenaNaTela) => {
    setLeitura(l);
    await qc.invalidateQueries({ queryKey: ['helena-previa', l.id] });
  };
  const trazer = async () => {
    if (!leitura) return;
    setTrazendo(true); setErro('');
    try {
      const r = await api.helena.trazer(leitura.id, destino || null);
      setFeito(r); setConfirmar(false); setLeitura(null); setDestino(r.painelId);
      toast.push('ok', r.resumo);
      await qc.invalidateQueries();
    } catch (e) {
      setErro(mensagemErro(e)); setConfirmar(false);
    } finally { setTrazendo(false); }
  };

  const o = opcoes.data;
  const p = previa.data;
  return (
    <section className="card p-4 flex flex-col gap-3 min-w-0 lg:col-span-2">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="font-display font-semibold flex items-center gap-2"><History size={17} /> Trazer do Helena</h2>
          <p className="text-[12.5px] text-muted mt-0.5 max-w-[75ch]">
            O painel de vendas do Helena vem para um painel de Vendas do Gestor: cada negociação com o valor, a empresa, os campos e o ganho e a
            perda no dia da Conclusão (pela planilha que o Helena exporta), e o relatório do Comercial passa a mostrar os meses de antes. As
            anotações e os anexos ficam no Helena. Pode trazer de novo até a virada: o que já veio é atualizado.
          </p>
        </div>
      </div>

      {opcoes.isLoading && <div className="text-sm text-muted flex items-center gap-2"><Spinner /> Falando com o Helena…</div>}
      {opcoes.isError && <Erro>{mensagemErro(opcoes.error)}</Erro>}
      {o && !o.conectado && (
        <Erro>
          Não deu para falar com o Helena: {o.erro} <span className="text-ink-2">A leitura usa a chave de API do LineChat (a mesma dos chamados), em Administração › Ajustes.</span>
        </Erro>
      )}

      {o?.conectado && (
        <div className="grid gap-3 grid-cols-1 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] items-end">
          <Campo label="O painel no Helena">
            <select className="input" value={painel} onChange={(e) => { setPainel(e.target.value); setLeitura(null); setFeito(null); }}>
              {o.helena.map((h) => <option key={h.id} value={h.id}>{h.nome}{h.sigla ? ` (${h.sigla})` : ''}{h.vendas ? '' : ' — não é de vendas'}</option>)}
            </select>
          </Campo>
          <Campo label="Vai para o painel de Vendas">
            <select className="input" value={destino ?? NOVO} onChange={(e) => setDestino(e.target.value)}>
              {o.destinos.map((d) => <option key={d.id} value={d.id}>{d.nome} ({d.sigla}) — {plural(d.negociacoes, 'negociação', 'negociações')}</option>)}
              <option value={NOVO}>Um painel de Vendas novo (Comercial)</option>
            </select>
          </Campo>
          <button className="btn-primary" disabled={!painel || leitura?.estado === 'lendo'} onClick={ler}>
            {leitura?.estado === 'lendo' ? <><Spinner className="text-white" /> Lendo…</> : pronta ? <><RefreshCw size={15} /> Ler de novo</> : 'Ler o Helena'}
          </button>
        </div>
      )}

      {leitura?.estado === 'lendo' && <Progresso l={leitura} />}
      {leitura?.estado === 'erro' && <Erro>A leitura não deu certo: {leitura.erro}</Erro>}
      {erro && <Erro>{erro}</Erro>}

      {feito && (
        <div className="card bg-ok-soft border-ok p-3 text-sm flex flex-col gap-2">
          <div className="flex items-start gap-2 text-ok font-semibold"><CheckCircle2 size={17} className="shrink-0 mt-0.5" /> {feito.resumo}.</div>
          <div className="flex flex-wrap gap-2">
            <Link className="btn-secondary btn-sm" to={`/atendimento/quadro?painel=${encodeURIComponent(feito.painelId)}`}>Abrir o painel {feito.painelNome}</Link>
            <Link className="btn-secondary btn-sm" to={`/atendimento/relatorio?painel=${encodeURIComponent(feito.painelId)}`}>Ver o relatório</Link>
          </div>
        </div>
      )}

      {pronta && previa.isLoading && <div className="text-sm text-muted flex items-center gap-2"><Spinner /> Montando a prévia…</div>}
      {pronta && previa.isError && <Erro>{mensagemErro(previa.error)}</Erro>}
      {pronta && p && leitura && <Previa p={p} leituraId={leitura.id} onPlanilha={planilhaUsada} onTrazer={() => setConfirmar(true)} />}

      {p && (
        <Confirmar
          open={confirmar} onClose={() => setConfirmar(false)} onConfirm={trazer} loading={trazendo}
          titulo="Trazer do Helena" botao={`Trazer ${plural(p.negociacoes.total, 'negociação', 'negociações')}`}
          texto={(
            <div className="flex flex-col gap-2">
              <p>
                {p.destino.novo ? <>Vai criar o painel de Vendas <b>{p.destino.nome} ({p.destino.sigla})</b>, </> : <>O painel <b>{p.destino.nome} ({p.destino.sigla})</b> vai ficar </>}
                com as etapas {p.etapas.ordem.join(', ')}.
                {p.etapas.saem.length > 0 && <> Saem as etapas vazias {p.etapas.saem.join(', ')}.</>}
              </p>
              <p>
                Entram {plural(p.negociacoes.novas, 'negociação nova', 'negociações novas')}
                {p.negociacoes.atualizadas > 0 && <> e {plural(p.negociacoes.atualizadas, 'é atualizada', 'são atualizadas')} (o histórico que veio do Helena é refeito)</>}, com {plural(p.historico.eventos, 'linha', 'linhas')} de histórico.
              </p>
            </div>
          )}
        />
      )}
    </section>
  );
}

function Erro({ children }: { children: ReactNode }) {
  return <div className="card bg-bad-soft border-bad p-3 text-bad text-sm flex items-start gap-2"><TriangleAlert size={16} className="shrink-0 mt-0.5" /><div className="min-w-0">{children}</div></div>;
}

function Progresso({ l }: { l: LeituraDoHelenaNaTela }) {
  const pct = l.total ? Math.round((l.lidos / l.total) * 100) : 0;
  return (
    <div className="flex flex-col gap-1.5" role="status" aria-live="polite">
      <div className="text-[12.5px] text-ink-2">
        {l.total === null ? 'Lendo o painel e a lista de cards…' : `Lendo o histórico de cada card: ${l.lidos.toLocaleString('pt-BR')} de ${l.total.toLocaleString('pt-BR')}`}
      </div>
      <div className="h-2 rounded-full bg-surface-2 border border-line overflow-hidden"><div className="h-full bg-accent transition-all" style={{ width: `${l.total === null ? 5 : Math.max(3, pct)}%` }} /></div>
    </div>
  );
}

/** Um bloco da prévia: o título e o que vai acontecer. */
function Bloco({ titulo, children, sub }: { titulo: string; sub?: ReactNode; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 mb-1.5">
        <span className="eyebrow">{titulo}</span>
        {sub && <span className="text-[12px] text-muted">{sub}</span>}
      </div>
      {children}
    </div>
  );
}

/**
 * Os campos que não viram campo, juntos pelo motivo: os que viram outra coisa (os produtos, a mensalidade e a
 * ativação de cada produto, os observadores) e os que ficam de fora.
 */
function porMotivo(fora: PreviaDoHelena['campos']['fora'], viram: boolean) {
  const grupos = new Map<string, string[]>();
  for (const c of fora) if (c.motivo.startsWith('vira ') === viram) grupos.set(c.motivo, [...(grupos.get(c.motivo) ?? []), c.nome]);
  return [...grupos.entries()].map(([motivo, nomes]) => `${nomes.join(', ')} (${viram ? motivo.replace(/^vira /, '') : motivo})`).join('; ');
}

const COMO_PESSOA = { nome: 'pelo nome', primeiro_nome: 'pelo primeiro nome', nenhum: '' } as const;

/** O texto do .csv: o do Google Planilhas é UTF-8; o que passou pelo Excel pode vir no jeito antigo do Windows. */
async function textoDoArquivo(f: File): Promise<string> {
  const bytes = await f.arrayBuffer();
  try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { return new TextDecoder('windows-1252').decode(bytes); }
}

/**
 * A planilha do Helena (2.1.1): a chave de API do LineChat não lê a Conclusão de cada card, e sem ela os ganhos caem
 * no mês da última mudança. O "Exportar" da Lista do painel, no Helena, faz uma planilha (o Google Planilhas) com
 * ela: o link dessa planilha, ou o .csv baixado dela, completa a leitura. Nada é gravado aqui.
 */
function PlanilhaDoHelena({ p, leituraId, onUsada }: { p: PreviaDoHelena; leituraId: string; onUsada: (l: LeituraDoHelenaNaTela) => Promise<void> }) {
  const [link, setLink] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState('');
  const [trocar, setTrocar] = useState(false);
  const arquivo = useRef<HTMLInputElement>(null);
  const pl = p.planilha;
  const usar = async (entrada: PlanilhaParaALeitura) => {
    setEnviando(true); setErro('');
    try {
      await onUsada(await api.helena.planilha(leituraId, entrada));
      setLink(''); setTrocar(false);
    } catch (e) { setErro(mensagemErro(e)); } finally { setEnviando(false); }
  };
  const escolher = async (f: File | null) => {
    if (!f) return;
    if (f.size > LIMITES_DA_PLANILHA_DO_HELENA.letras) { setErro('O arquivo é grande demais (mais de 5 MB): é a planilha do painel de vendas do Helena?'); return; }
    await usar({ csv: await textoDoArquivo(f), nome: f.name });
  };

  if (pl && !trocar) {
    return (
      <div id="helena-planilha" className="card bg-ok-soft border-ok p-3 text-[13px] flex flex-wrap items-start justify-between gap-2">
        <div className="flex items-start gap-2 min-w-0">
          <CheckCircle2 size={16} className="text-ok shrink-0 mt-0.5" />
          <div className="min-w-0">
            <div className="font-semibold text-ink">A Conclusão veio da planilha do Helena{pl.nome ? <span className="font-normal text-ink-2"> ({pl.nome})</span> : <span className="font-normal text-ink-2"> (pelo link)</span>}</div>
            <div className="text-ink-2">
              {plural(pl.linhas, 'linha', 'linhas')}: a Conclusão de {plural(pl.conclusoes, 'negociação', 'negociações')}.
              {pl.semConclusao > 0 && <span className="text-signal"> {plural(pl.semConclusao, 'ganha ou perdida continua', 'ganhas ou perdidas continuam')} sem (fora da planilha).</span>}
              {pl.foraDaLeitura > 0 && <span className="text-muted"> {plural(pl.foraDaLeitura, 'linha não é', 'linhas não são')} de nenhum card lido.</span>}
            </div>
          </div>
        </div>
        <button className="btn-secondary btn-sm" onClick={() => setTrocar(true)}><RefreshCw size={14} /> Trocar a planilha</button>
      </div>
    );
  }

  return (
    <div id="helena-planilha" className="card bg-signal-soft border-signal p-3 text-[13px] flex flex-col gap-2.5">
      <div className="flex items-start gap-2">
        <FileSpreadsheet size={17} className="text-signal shrink-0 mt-0.5" />
        <div className="min-w-0">
          <div className="font-semibold text-ink">A Conclusão de cada card vem da planilha do Helena</div>
          <div className="text-ink-2 mt-0.5 max-w-[80ch]">
            A chave de API do LineChat não lê a Conclusão (o dia do ganho ou da perda): sem ela, os ganhos caem no mês da última mudança do card.
            A planilha que o Helena exporta tem a Conclusão:
          </div>
          <ol className="list-decimal pl-5 mt-1 text-ink-2 flex flex-col gap-0.5">
            <li>No Helena, abra o painel {p.painelHelena.nome} em <b>Lista</b> e clique em <b>Exportar</b>.</li>
            <li>Quando o aviso disser que a exportação terminou, abra a planilha (o Google Planilhas) e copie o endereço dela.</li>
            <li>Cole aqui e clique em <b>Usar a planilha</b>.</li>
          </ol>
        </div>
      </div>
      <div className="grid gap-2 grid-cols-1 sm:grid-cols-[minmax(0,1fr)_auto]">
        <input id="helena-planilha-link" className="input" inputMode="url" spellCheck={false} autoComplete="off" placeholder="https://docs.google.com/spreadsheets/d/…"
          value={link} onChange={(e) => setLink(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && link.trim()) void usar({ link }); }} />
        <button id="helena-planilha-usar" className="btn-primary" disabled={!link.trim() || enviando} onClick={() => void usar({ link })}>
          {enviando ? <><Spinner className="text-white" /> Lendo a planilha…</> : 'Usar a planilha'}
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-ink-2">
        <span>Ou baixe a planilha como .csv (Arquivo › Fazer download) e</span>
        <label className="btn-secondary btn-sm cursor-pointer">
          <Upload size={14} /> escolha o arquivo
          <input ref={arquivo} type="file" accept=".csv,text/csv,.tsv,.txt" className="hidden" disabled={enviando}
            onChange={(e) => { void escolher(e.target.files?.[0] ?? null); e.target.value = ''; }} />
        </label>
        {pl && <button className="btn-ghost btn-sm" onClick={() => { setTrocar(false); setErro(''); }}>Manter a planilha de antes</button>}
      </div>
      {IS_DEMO && <div className="text-[12px] text-muted">Na prévia, qualquer link do Google Planilhas usa a planilha de exemplo (a do Helena de exemplo).</div>}
      {erro && <div className="text-bad flex items-start gap-1.5"><TriangleAlert size={15} className="shrink-0 mt-0.5" /><span className="min-w-0">{erro}</span></div>}
    </div>
  );
}

function Previa({ p, leituraId, onPlanilha, onTrazer }: { p: PreviaDoHelena; leituraId: string; onPlanilha: (l: LeituraDoHelenaNaTela) => Promise<void>; onTrazer: () => void }) {
  const [todasAsEmpresas, setTodasAsEmpresas] = useState(false);
  const maior = Math.max(1, ...p.ganhosPorMes.map((m) => m.valor));
  const empresas = todasAsEmpresas ? p.empresas.lista : p.empresas.lista.slice(0, 8);
  const novas = new Set(p.etapas.entram);
  const ficam = new Set(p.etapas.ficam);
  return (
    <div className="border-t border-line pt-3 flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="font-semibold">{p.painelHelena.nome}</span>
        <ArrowRight size={15} className="text-muted" />
        <span className="font-semibold">{p.destino.nome} ({p.destino.sigla})</span>
        {p.destino.novo && <Chip tone="ok">painel novo</Chip>}
      </div>

      <div className="grid gap-3 grid-cols-2 xl:grid-cols-4">
        <Kpi label="Negociações" valor={p.negociacoes.total.toLocaleString('pt-BR')}
          sub={[p.negociacoes.novas ? plural(p.negociacoes.novas, 'nova', 'novas') : '', p.negociacoes.atualizadas ? plural(p.negociacoes.atualizadas, 'atualizada', 'atualizadas') : ''].filter(Boolean).join(' · ') || '—'} />
        <Kpi label="Em andamento" tone="accent" valor={reaisInteiros(p.numeros.emAndamento.valor)} sub={plural(p.numeros.emAndamento.qtd, 'negociação', 'negociações')} />
        <Kpi label="Ganhas" tone="ok" valor={reaisInteiros(p.numeros.ganhas.valor)} sub={`${plural(p.numeros.ganhas.qtd, 'negociação', 'negociações')} · mensalidade`} />
        <Kpi label="Perdidas" tone="bad" valor={p.numeros.perdidas.qtd.toLocaleString('pt-BR')} sub="negociações" />
      </div>

      {(p.planilha || p.historico.semConclusao > 0) && <PlanilhaDoHelena p={p} leituraId={leituraId} onUsada={onPlanilha} />}

      <Bloco titulo="Ganhos mês a mês" sub="pela Conclusão do Helena: compare com o Meta vs Ganho mensal de lá">
        <div className="overflow-x-auto">
          <div className="flex items-end gap-1.5 min-w-[560px] h-36 pt-5">
            {p.ganhosPorMes.map((m) => (
              <div key={m.mes} className="flex-1 flex flex-col items-center justify-end h-full gap-1" title={`${m.nome}: ${plural(m.qtd, 'ganha', 'ganhas')} · ${reaisInteiros(m.valor)}`}>
                <span className="text-[10.5px] text-muted tnum whitespace-nowrap">{m.valor ? reaisCurto(m.valor) : ''}</span>
                <div className={`w-full rounded-t ${m.valor ? 'bg-ok' : 'bg-line'}`} style={{ height: `${m.valor ? Math.max(4, Math.round((m.valor / maior) * 100)) : 2}%` }} />
                <span className="text-[10.5px] text-ink-2 whitespace-nowrap">{m.curto}</span>
              </div>
            ))}
          </div>
        </div>
        {(p.historico.semConclusao ?? 0) > 0 && (
          <p className="text-[12.5px] text-signal mt-1.5">
            {p.planilha
              ? <>{plural(p.historico.semConclusao, 'negociação ganha ou perdida continua', 'negociações ganhas ou perdidas continuam')} sem a Conclusão (fora da planilha):</>
              : <>{plural(p.historico.semConclusao, 'negociação ganha ou perdida veio', 'negociações ganhas ou perdidas vieram')} sem a Conclusão do Helena:</>}
            {' '}{p.historico.semConclusao === 1 ? 'ela cai no mês em que foi marcada' : 'elas caem no mês em que foram marcadas'} (ou no da última mudança do card), e este gráfico não bate com o de lá.
            {!p.planilha && ' Use a planilha do Helena, acima.'}
          </p>
        )}
      </Bloco>

      <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
        <Bloco titulo="Etapas do painel" sub="na ordem do Helena; o Ganho e o Perdido no fim">
          <div className="flex flex-wrap gap-1.5">
            {p.etapas.ordem.map((nome) => (
              <Chip key={nome} tone={nome === p.etapas.ganho ? 'ok' : nome === p.etapas.perdido ? 'bad' : novas.has(nome) ? 'accent' : 'neutral'}
                title={novas.has(nome) ? 'entra no painel' : ficam.has(nome) ? 'fica: tem negociações e não está no Helena' : 'já está no painel'}>
                {nome}{!p.destino.novo && novas.has(nome) ? ' · nova' : ''}{ficam.has(nome) ? ' · fica' : ''}
              </Chip>
            ))}
          </div>
          {p.etapas.saem.length > 0 && <p className="text-[12.5px] text-muted mt-1.5">Saem (vazias e fora do Helena): {p.etapas.saem.join(', ')}.</p>}
          {p.etapas.historicas.length > 0 && <p className="text-[12.5px] text-muted mt-1.5">Só no histórico (saíram do Helena; entram já fora do painel): {p.etapas.historicas.join(', ')}.</p>}
        </Bloco>

        <Bloco titulo="Campos">
          <ul className="text-[13px] flex flex-col gap-1">
            {p.campos.usa.length > 0 && <li><span className="text-muted">Usa os que o painel tem:</span> {p.campos.usa.join(', ')}{p.campos.opcoesNovas > 0 && <span className="text-muted"> (as listas ganham {plural(p.campos.opcoesNovas, 'opção', 'opções')})</span>}</li>}
            {p.campos.cria.length > 0 && <li><span className="text-muted">Cria:</span> {p.campos.cria.map((c) => `${c.nome} (${NOME_TIPO_CAMPO[c.tipo].split(' (')[0]})`).join(', ')}</li>}
            {porMotivo(p.campos.fora, true) && <li><span className="text-muted">Viram os valores, os produtos e os observadores:</span> {porMotivo(p.campos.fora, true)}</li>}
            {porMotivo(p.campos.fora, false) && <li><span className="text-muted">Ficam de fora:</span> {porMotivo(p.campos.fora, false)}</li>}
          </ul>
        </Bloco>

        <Bloco titulo="Pessoas" sub="o responsável e quem fez cada linha do histórico">
          <ul className="text-[13px] flex flex-col gap-0.5">
            {p.pessoas.map((x) => (
              <li key={x.nome} className="flex flex-wrap items-center gap-1.5">
                <span>{x.nome}</span><ArrowRight size={13} className="text-muted" />
                {x.pessoa ? <span className="font-medium">{x.pessoa}</span> : <span className="text-signal">ninguém no Gestor (fica sem responsável)</span>}
                {x.pessoa && x.como !== 'nome' && <span className="text-muted">({COMO_PESSOA[x.como]})</span>}
                {x.negociacoes > 0 && <span className="text-muted">· {plural(x.negociacoes, 'negociação', 'negociações')}</span>}
              </li>
            ))}
            {!p.pessoas.length && <li className="text-muted">O Helena não disse quem fez.</li>}
          </ul>
        </Bloco>

        <Bloco titulo="Empresas" sub={`${plural(p.empresas.clientes, 'cliente do cadastro', 'clientes do cadastro')} · ${plural(p.empresas.leads, 'empresa que ainda não é cliente', 'empresas que ainda não são clientes')}`}>
          <ul className="text-[13px] flex flex-col gap-0.5">
            {empresas.map((e) => (
              <li key={e.titulo} className="break-words">
                {e.titulo} <span className="text-muted">→ {e.cliente ? <>cliente {e.cliente} ({e.como === 'cnpj' ? 'pelo CNPJ' : 'pelo nome'})</> : <>empresa {e.empresa}</>}</span>
              </li>
            ))}
          </ul>
          {p.empresas.lista.length > 8 && <button className="btn-ghost btn-sm mt-1" onClick={() => setTodasAsEmpresas((v) => !v)}>{todasAsEmpresas ? 'Mostrar menos' : `Ver as ${p.empresas.lista.length}`}</button>}
        </Bloco>

        <Bloco titulo="Produtos, etiquetas e motivos">
          <ul className="text-[13px] flex flex-col gap-1">
            {p.produtos.ligados.length > 0 && <li><span className="text-muted">Produtos:</span> {p.produtos.ligados.map((x) => (x.helena === x.gestor ? x.gestor : `${x.helena} → ${x.gestor}`)).join(', ')}
              <span className="text-muted"> · {plural(p.produtos.comValorPorProduto, 'com a mensalidade por produto', 'com a mensalidade por produto')}</span></li>}
            {p.produtos.semCadastro.length > 0 && <li className="text-signal">Sem cadastro no Gestor: {p.produtos.semCadastro.join(', ')}</li>}
            <li><span className="text-muted">Etiquetas:</span> {p.etiquetas.total ? plural(p.etiquetas.total, 'etiqueta', 'etiquetas') : 'nenhuma'}{p.etiquetas.novas.length > 0 && <span className="text-muted"> (entram no painel: {p.etiquetas.novas.join(', ')})</span>}</li>
            {p.motivosNovos.length > 0 && <li><span className="text-muted">Motivos de perda que entram no painel:</span> {p.motivosNovos.join(', ')}</li>}
          </ul>
        </Bloco>

        <Bloco titulo="Histórico">
          <p className="text-[13px]">
            {plural(p.historico.eventos, 'linha', 'linhas')}, com {plural(p.historico.movimentos, 'mudança de etapa', 'mudanças de etapa')} (a trajetória do relatório).
            {p.historico.semHistorico > 0 && <span className="text-signal"> {plural(p.historico.semHistorico, 'negociação veio', 'negociações vieram')} sem o histórico.</span>}
            {(p.historico.semConclusao ?? 0) > 0 && <span className="text-signal"> {plural(p.historico.semConclusao, 'ganha ou perdida', 'ganhas ou perdidas')} sem a Conclusão.</span>}
          </p>
        </Bloco>
      </div>

      {p.avisos.length > 0 && (
        <div className="card bg-signal-soft border-signal p-3 text-[13px] text-ink-2">
          <div className="font-semibold text-ink mb-1">Bom saber</div>
          <ul className="list-disc pl-5 flex flex-col gap-0.5">{p.avisos.map((a) => <li key={a}>{a}</li>)}</ul>
        </div>
      )}

      {p.erro
        ? <Erro>{p.erro}</Erro>
        : (
          <div className="flex flex-wrap items-center gap-3">
            <button className="btn-primary" onClick={onTrazer}>Trazer {plural(p.negociacoes.total, 'negociação', 'negociações')}</button>
            <span className="text-[12.5px] text-muted">Nada foi gravado ainda: esta é a prévia.</span>
          </div>
        )}
    </div>
  );
}
