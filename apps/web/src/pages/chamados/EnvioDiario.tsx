/**
 * A página que vira o PDF do envio diário (Patch 1.7, decisão 0038).
 *
 * O servidor abre esta página num Chromium sem janela, com uma chave de uso único (`?chave=…`),
 * espera o `data-envio-pronto` e manda imprimir em A4. Uma pessoa logada também abre (o "Ver como
 * fica" de Administração › Envio automático): é exatamente o que vai no WhatsApp.
 *
 * O que entra, desde o 2.4.5 (decisão 0061), depende de onde o envio sai:
 *  - de um **painel** do Gestor: os números de cima e o gráfico do tempo da **Visão geral de hoje** do painel, os
 *    gráficos marcados (como a equipe arrumou) e os relatórios marcados dos 25, com o período = **hoje** (o
 *    Fechamento do mês, com o mês até hoje);
 *  - do **Legado do Helena** (como do 1.7 ao 2.4.4): os números de cima e os gráficos marcados da aba **Hoje** dos
 *    tickets do LineChat e os relatórios marcados de lá.
 * As peças são as mesmas das telas; aqui nada filtra nem abre janela. A chave do robô abre a página de um envio;
 * uma pessoa abre com `?envio=<id>`.
 */
import { useQuery } from '@tanstack/react-query';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Printer } from 'lucide-react';
import type { ItemPainel, PacoteDoPainel, RelatoriosDoPainel } from '@gestor/shared';
import { api } from '../../api/index.js';
import type { PacoteDoLegado, RelatoriosChamados } from '../../api/types.js';
import { Logotipo } from '../../components/Marca.js';
import { Colunas } from '../../components/graficos.js';
import { Carregando, Kpi, mensagemErro } from '../../components/ui/index.js';
import { useAuth } from '../../lib/auth.js';
import { SemBotaoDeEnvio } from '../../lib/envio.js';
import { Cartao, GraficoLista, type Moldura } from './Index.js';
import { Escada, Gargalo, Prazo, PrimeiraResposta, Prioridade, Relogio } from './relatorios/Tempo.js';
import { DiasForaDaCurva, EntradaSaida, IdadeDaFila, MapaDeCalor, Pareto, Previsao, SobeDesce } from './relatorios/Volume.js';
import { DeQuemEAFalha, Reincidencia, TamanhoDoCliente } from './relatorios/Clientes.js';
import { CardBemPreenchido, QuadroDaEquipe } from './relatorios/Equipe.js';
import { FechamentoDoMes } from './relatorios/Mes.js';
import { Empaca, Escada as EscadaDoPainel, Operadora, Prazo as PrazoDoPainel, PrioridadeFaz, Relogio as RelogioDoPainel, Resposta } from '../atendimento/relatorios/tempo.js';
import { Calor, Curva, Fila, Idade, Previsao as PrevisaoDoPainel } from '../atendimento/relatorios/volume.js';
import { Arvore, Gravidade, Pareto as ParetoDoPainel, Problemas, Sobe } from '../atendimento/relatorios/assuntos.js';
import { Falha, Tamanho, Voltou } from '../atendimento/relatorios/clientes.js';
import { Equipe, Preenchido, TempoGasto } from '../atendimento/relatorios/equipe.js';
import { Fechamento } from '../atendimento/relatorios/mes.js';

const nada = () => {};

/** A moldura de um gráfico fora do Organizar: só o cartão, do jeito que a equipe arrumou. */
const fixa = (item: ItemPainel): Moldura => ({
  item, organizando: false, arrastando: false, primeiro: false, ultimo: false,
  aoPegar: nada, aoMover: nada, aoMudar: nada, aoAbrirGrupos: nada,
});

function Grafico({ item, p }: { item: ItemPainel; p: PacoteDoLegado }) {
  const r = p.resumo;
  const m = fixa(item);
  if (item.id === 'serie') {
    return <Cartao m={m} titulo={r.serie.titulo} sub={r.serie.sub}><Colunas pontos={r.serie.pontos} vazio="Nenhum chamado aberto hoje ainda." /></Cartao>;
  }
  if (item.id === 'etapa') return <GraficoLista m={m} titulo="Por etapa" sub="na ordem do Kanban" itens={r.porEtapa} aoClicar={nada} semOrdenar />;
  if (item.id === 'responsavel') return <GraficoLista m={m} titulo="Por responsável" itens={r.porResponsavel} aoClicar={nada} />;
  if (item.id === 'etiqueta') return <GraficoLista m={m} titulo="Por etiqueta" sub="um card pode ter várias" multiplo itens={r.porEtiqueta} aoClicar={nada} />;
  const c = r.porCampo.find((x) => `campo:${x.key}` === item.id);
  if (!c) return null;
  return <GraficoLista m={m} titulo={`Por ${c.name.toLowerCase()}`} sub={c.multiplo ? 'um card pode contar em mais de um' : undefined} multiplo={c.multiplo} itens={c.itens} aoClicar={nada} />;
}

function Relatorio({ id, r, primeiroDia }: { id: string; r: RelatoriosChamados; primeiroDia: string }) {
  switch (id) {
    case 'relogio': return <Relogio r={r} abrir={nada} separar={undefined} aoSeparar={nada} />;
    case 'escada': return <Escada r={r} abrir={nada} />;
    case 'gargalo': return <Gargalo r={r} abrir={nada} />;
    case 'primeira': return <PrimeiraResposta r={r} abrir={nada} />;
    case 'prioridade': return <Prioridade r={r} abrir={nada} />;
    case 'prazo': return <Prazo r={r} abrir={nada} />;
    case 'calor': return <MapaDeCalor r={r} abrir={nada} />;
    case 'fila': return <EntradaSaida r={r} abrir={nada} />;
    case 'idade': return <IdadeDaFila r={r} abrir={nada} />;
    case 'picos': return <DiasForaDaCurva r={r} abrir={nada} />;
    case 'sobe': return <SobeDesce r={r} abrir={nada} separado={false} aoSeparar={nada} />;
    case 'pareto': return <Pareto r={r} abrir={nada} aoPor={nada} />;
    case 'previsao': return <Previsao r={r} />;
    case 'tamanho': return <TamanhoDoCliente r={r} abrir={nada} aoRaioX={nada} />;
    case 'reincidencia': return <Reincidencia r={r} juntar={false} aoJuntar={nada} />;
    case 'falha': return <DeQuemEAFalha r={r} abrir={nada} />;
    case 'equipe': return <QuadroDaEquipe r={r} abrir={nada} />;
    case 'preenchimento': return <CardBemPreenchido r={r} abrir={nada} />;
    case 'mes': return <FechamentoDoMes r={r} primeiroDia={primeiroDia} aoMes={nada} abrir={nada} filtrosEscritos={[]} />;
    default: return null;
  }
}

/** Um dos 25 relatórios de um painel (2.4.5), do jeito da tela, sem os cliques. */
function RelatorioDoPainel({ id, r }: { id: string; r: RelatoriosDoPainel }) {
  const p = { r, abrir: nada };
  switch (id) {
    case 'prazo': return <PrazoDoPainel {...p} />;
    case 'relogio': return <RelogioDoPainel {...p} separar={r.relogio.separar} aoSeparar={nada} />;
    case 'resposta': return <Resposta {...p} />;
    case 'escada': return <EscadaDoPainel {...p} />;
    case 'empaca': return <Empaca {...p} />;
    case 'prioridade': return <PrioridadeFaz {...p} />;
    case 'operadora': return <Operadora {...p} />;
    case 'fila': return <Fila {...p} />;
    case 'idade': return <Idade {...p} />;
    case 'calor': return <Calor {...p} />;
    case 'curva': return <Curva {...p} />;
    case 'previsao': return <PrevisaoDoPainel {...p} />;
    case 'arvore': return <Arvore {...p} />;
    case 'sobe': return <Sobe {...p} aoNivel={nada} />;
    case 'gravidade': return <Gravidade {...p} />;
    case 'pareto': return <ParetoDoPainel {...p} aoPor={nada} />;
    case 'problemas': return <Problemas {...p} />;
    case 'tamanho': return <Tamanho {...p} aoRaioX={nada} />;
    case 'voltou': return <Voltou {...p} />;
    case 'falha': return <Falha {...p} podeEscolher={false} aoOrganizar={nada} />;
    case 'equipe': return <Equipe {...p} />;
    case 'tempogasto': return <TempoGasto {...p} />;
    case 'preenchido': return <Preenchido {...p} />;
    case 'fechamento': return <Fechamento {...p} aoMes={nada} />;
    default: return null;
  }
}

/** Os gráficos marcados de um painel (2.4.5): o do tempo e os de cada campo, como na Visão geral de hoje. */
function GraficosDoPainel({ p }: { p: PacoteDoPainel }) {
  return (
    <div className="grid gap-4 grid-cols-1 md:grid-cols-2 min-w-0">
      {p.graficos.map(({ id, titulo, item, grafico }) => {
        const m = { ...fixa({ ...item, id: `visao:${p.painel.id}:${id}`, grupos: grafico?.grupos } as ItemPainel), semEnvio: true };
        if (id === 'serie') return <Cartao key={id} m={m} titulo={p.serie.titulo} sub={p.serie.sub}><Colunas pontos={p.serie.pontos} vazio="Nenhum chamado chegou hoje ainda." /></Cartao>;
        if (!grafico) return null;
        return <GraficoLista key={id} m={m} titulo={titulo} sub={grafico.sub} itens={grafico.itens} semOrdenar={grafico.naOrdem} multiplo={grafico.multiplo} aoClicar={nada} />;
      })}
    </div>
  );
}

export function EnvioDiario() {
  const [sp] = useSearchParams();
  const nav = useNavigate();
  const { user, loading } = useAuth();
  const chave = sp.get('chave') ?? undefined;
  const envio = sp.get('envio') ?? undefined;
  const q = useQuery({ queryKey: ['envio', 'pacote', chave ?? '', envio ?? ''], queryFn: () => api.envio.pacote({ chave, envio }), retry: false, enabled: !!chave || !!user });
  // sem a chave do robô, é uma pessoa: precisa estar logada
  if (!chave && !loading && !user) return <Navigate to="/entrar" replace />;

  if (q.isError) return <div className="p-6 text-bad text-sm" data-envio-erro={mensagemErro(q.error)}>{mensagemErro(q.error)}</div>;
  if (!q.data) return <div className="p-6"><Carregando /></div>;
  const p = q.data;
  const d = new Date(`${p.dia}T12:00:00Z`);
  const quando = `${d.toLocaleDateString('pt-BR', { weekday: 'long', timeZone: 'UTC' })}, ${d.toLocaleDateString('pt-BR', { timeZone: 'UTC' })}`;
  const nGraficos = p.graficos.length; const nRelatorios = p.relatorioIds.length;
  const doPainel = p.tipo === 'painel';
  const painelNome = doPainel ? p.painel.nome : p.painelNome;
  const kpis = doPainel ? p.kpis : p.resumo.kpis;

  return (
    <SemBotaoDeEnvio>
      <div className="min-h-screen bg-bg">
        {!chave && (
          <div className="so-tela sticky top-0 z-10 border-b border-line bg-surface/95 backdrop-blur px-4 py-2.5 flex flex-wrap items-center gap-2">
            <button type="button" className="btn-ghost btn-sm" onClick={() => nav(-1)}><ArrowLeft size={15} /> Voltar</button>
            <span className="text-[13px] text-ink-2 flex-1 min-w-[200px]">É assim que o PDF do envio diário {doPainel ? `do painel ${painelNome}` : 'do Legado do Helena'} sai agora (com os números de agora).</span>
            <button type="button" className="btn-secondary btn-sm" onClick={() => window.print()}><Printer size={14} /> Imprimir ou salvar em PDF</button>
          </div>
        )}
        <main className="para-imprimir envio-diario mx-auto max-w-[880px] p-4 sm:p-6 flex flex-col gap-4" data-envio-pronto="1" data-envio-origem={doPainel ? p.painel.id : 'legado'}>
          <header className="flex flex-wrap items-end justify-between gap-3 border-b border-line pb-3">
            <div>
              <Logotipo altura={24} />
              <h1 className="font-display font-semibold text-[22px] leading-tight mt-2">Chamados de hoje{doPainel ? ` · ${painelNome}` : ''}</h1>
              <p className="text-[13.5px] text-ink-2 first-letter:uppercase">{quando}, até {p.hhmm}{painelNome && !doPainel ? ` · painel ${painelNome}` : ''}</p>
            </div>
            <p className="text-[12px] text-muted">
              {nGraficos + nRelatorios ? `${nGraficos ? `${nGraficos} ${nGraficos === 1 ? 'gráfico' : 'gráficos'}` : ''}${nGraficos && nRelatorios ? ' e ' : ''}${nRelatorios ? `${nRelatorios} ${nRelatorios === 1 ? 'relatório' : 'relatórios'}` : ''}` : 'só os números do dia'}
              <br />gerado em {new Date(p.geradoEm).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
            </p>
          </header>

          <section aria-label="Os números de hoje" className="grid gap-3 grid-cols-2 md:grid-cols-4">
            {kpis.map((k) => <Kpi key={k.id} label={k.label} valor={k.valor} sub={k.sub} tone={k.tom} />)}
          </section>

          {doPainel ? (
            <>
              {nGraficos > 0 && (
                <>
                  <h2 className="eyebrow mt-2">Os gráficos de hoje · como na Visão geral do painel {painelNome}</h2>
                  <GraficosDoPainel p={p} />
                </>
              )}
              {p.relatorios && nRelatorios > 0 && (
                <>
                  <h2 className="eyebrow mt-2">Os relatórios · período: hoje{p.relatorioIds.includes('fechamento') ? ' (o Fechamento do mês: o mês até hoje)' : ''}</h2>
                  {p.relatorioIds.map((id) => <div key={id} className="envio-bloco min-w-0 flex flex-col"><RelatorioDoPainel id={id} r={p.relatorios!} /></div>)}
                </>
              )}
              <p className="so-tela text-[12px] text-muted border-t border-line pt-3">
                Enviado pelo Ingline Gestão. Os números de cima e os gráficos são os da Visão geral de hoje do painel {painelNome}; os relatórios usam o dia de hoje como período.
                O que vai neste PDF é marcado pela administração em cada gráfico e relatório do painel ("Envio diário").
              </p>
            </>
          ) : <OLegado p={p} />}
        </main>
      </div>
    </SemBotaoDeEnvio>
  );
}

/** O PDF do Legado do Helena (como do 1.7 ao 2.4.4): os gráficos da aba Hoje e os relatórios dos tickets do LineChat. */
function OLegado({ p }: { p: PacoteDoLegado }) {
  const nGraficos = p.graficos.length; const nRelatorios = p.relatorioIds.length;
  return (
    <>

          {nGraficos > 0 && (
            <>
              <h2 className="eyebrow mt-2">Os gráficos de hoje · como na aba Hoje dos tickets do LineChat</h2>
              <div className="grid gap-4 grid-cols-1 md:grid-cols-2 min-w-0">
                {p.graficos.map((item) => <Grafico key={item.id} item={item} p={p} />)}
              </div>
            </>
          )}

          {p.relatorios && nRelatorios > 0 && (
            <>
              <h2 className="eyebrow mt-2">Os relatórios · período: hoje{p.relatorioIds.includes('mes') ? ' (o Fechamento do mês: o mês até hoje)' : ''}</h2>
              {p.relatorioIds.map((id) => <div key={id} className="envio-bloco min-w-0 flex flex-col"><Relatorio id={id} r={p.relatorios!} primeiroDia={p.primeiroDia} /></div>)}
            </>
          )}

          <p className="so-tela text-[12px] text-muted border-t border-line pt-3">
            Enviado pelo Ingline Gestão. Os números de cima e os gráficos são os da aba Hoje dos tickets do LineChat; os relatórios usam o dia de hoje como período.
            O que vai neste PDF é marcado pela administração em cada gráfico e relatório ("Envio diário").
          </p>
    </>
  );
}
