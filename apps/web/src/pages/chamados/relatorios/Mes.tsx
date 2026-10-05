/**
 * Relatórios › Mês: o **Fechamento do mês** — uma página pronta, para ler ou guardar em PDF.
 *
 * O PDF sai pela impressão do navegador ("Salvar como PDF"): a página imprime só o documento, no
 * tema claro, em A4 (as regras estão em `styles.css`, `@media print`). Sem biblioteca nova. O
 * envio diário em PDF pelo WhatsApp (1.7) usa a mesma página, montada no servidor.
 */
import type { ReactNode } from 'react';
import { CalendarCheck, ChevronLeft, ChevronRight, Printer } from 'lucide-react';
import { somarMeses } from '@gestor/shared';
import type { RelatoriosChamados } from '../../../api/types.js';
import { Colunas } from '../../../components/graficos.js';
import { data } from '../../../lib/format.js';
import { BotaoEnvio } from '../../../lib/envio.js';
import { BarrasComparadas, horas, nf, Variacao } from './pecas.js';

export function FechamentoDoMes({ r, primeiroDia, aoMes, abrir, filtrosEscritos }: {
  r: RelatoriosChamados; primeiroDia: string; aoMes: (mes: string) => void; abrir: (peca: string) => void; filtrosEscritos: string[];
}) {
  const m = r.mes;
  const atual = r.hoje.slice(0, 7);
  const primeiro = primeiroDia.slice(0, 7);
  const meses: string[] = [];
  for (let x = atual; x >= primeiro && meses.length < 36; x = somarMeses(x, -1)) meses.push(x);
  const nomeCurto = (mes: string) => new Date(`${mes}-15T12:00:00Z`).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  const ant = m.nomeAnterior.split(' de ')[0];
  return (
    <div className="flex flex-col gap-3">
      <div className="so-tela flex flex-wrap items-center gap-2">
        <button type="button" className="btn-ghost btn-sm" disabled={m.mes <= primeiro} onClick={() => aoMes(somarMeses(m.mes, -1))} aria-label="Mês anterior"><ChevronLeft size={16} /></button>
        <select className="input w-auto py-1.5" value={m.mes} onChange={(e) => aoMes(e.target.value)} aria-label="Mês do fechamento">
          {meses.map((x) => <option key={x} value={x}>{nomeCurto(x)}{x === atual ? ' (até hoje)' : ''}</option>)}
        </select>
        <button type="button" className="btn-ghost btn-sm" disabled={m.mes >= atual} onClick={() => aoMes(somarMeses(m.mes, 1))} aria-label="Próximo mês"><ChevronRight size={16} /></button>
        <span className="ml-auto" />
        <BotaoEnvio tipo="relatorio" id="mes" titulo="Fechamento do mês" />
        <button type="button" className="btn-primary btn-sm" onClick={() => window.print()} title='Abre a impressão: escolha "Salvar como PDF" para guardar o arquivo'>
          <Printer size={14} /> Imprimir ou salvar em PDF
        </button>
      </div>

      <article className="para-imprimir card p-5 sm:p-7 flex flex-col gap-5" aria-label={`Fechamento de ${m.nome}`}>
        <header className="flex flex-wrap items-end justify-between gap-2 border-b border-line pb-3">
          <div>
            <div className="eyebrow flex items-center gap-1.5"><CalendarCheck size={13} /> Fechamento do mês · Suporte Ingline</div>
            <h2 className="font-display text-2xl font-semibold first-letter:uppercase">{m.nome}{m.parcial ? <span className="text-muted text-base font-normal"> · até hoje</span> : ''}</h2>
          </div>
          <div className="text-[12px] text-muted text-right">
            comparado com {m.nomeAnterior}<br />
            gerado em {data(new Date().toISOString(), true)}
          </div>
        </header>

        <div className="grid grid-cols-2 lg:grid-cols-4 print:grid-cols-4 gap-4">
          <Tile valor={nf(m.abertos.n)} rotulo="chamados abertos" sub={<Variacao agora={m.abertos.n} antes={m.abertos.antes} contra={ant} />} aoClicar={() => abrir('mes:abertos')} />
          <Tile valor={nf(m.fechados.n)} rotulo="chamados fechados" sub={<Variacao agora={m.fechados.n} antes={m.fechados.antes} contra={ant} />} aoClicar={() => abrir('mes:fechados')} />
          <Tile valor={horas(m.mediana.h)} rotulo="mediana até fechar" sub={<Variacao agora={m.mediana.h} antes={m.mediana.antes} menorEhMelhor formato="horas" contra={ant} />} />
          <Tile valor={nf(m.filaNoFim.n)} rotulo={m.parcial ? 'na fila hoje' : 'na fila no fim do mês'} sub={<Variacao agora={m.filaNoFim.n} antes={m.filaNoFim.antes} menorEhMelhor formato="n" contra={ant} />} />
        </div>

        {m.destaques.length > 0 && (
          <div className="rounded-lg bg-surface-2 p-4 break-inside-avoid">
            <div className="eyebrow mb-1.5">Destaques</div>
            <ul className="list-disc pl-5 text-[14px] text-ink-2 flex flex-col gap-1">{m.destaques.map((d) => <li key={d}>{d}</li>)}</ul>
          </div>
        )}

        <div>
          <div className="eyebrow mb-2">Abertos por dia</div>
          <Colunas pontos={m.porDia.map((p) => ({ ...p, destaque: true }))} altura={120} aoClicar={(id) => abrir(`mes:${id}`)} vazio="Nenhum chamado no mês." />
        </div>

        <div className="grid gap-5 md:grid-cols-3 print:grid-cols-2 print:gap-x-8 print:gap-y-4">
          <div className="min-w-0 break-inside-avoid">
            <div className="eyebrow mb-2">Os 5 assuntos{m.juntouAssuntos ? ' (com os grupos)' : ''}</div>
            <BarrasComparadas itens={m.assuntos} vazio="—" />
          </div>
          <div className="min-w-0 break-inside-avoid">
            <div className="eyebrow mb-2">Os 5 clientes</div>
            <BarrasComparadas itens={m.clientes} vazio="—" />
          </div>
          <div className="min-w-0 break-inside-avoid">
            <div className="eyebrow mb-2">Por tipo de chamado</div>
            <BarrasComparadas itens={m.tipos} vazio="—" />
          </div>
        </div>
        <p className="text-[12px] text-muted -mt-2">▲▼ = quanto mudou em relação a {m.nomeAnterior}.</p>

        <footer className="text-[11.5px] text-muted border-t border-line pt-2 flex flex-wrap justify-between gap-2">
          <span>{filtrosEscritos.length ? `Filtros: ${filtrosEscritos.join(' · ')}` : 'Todos os chamados do painel de suporte (sem filtro).'}</span>
          <span>Ingline Gestão · Chamados › Relatórios</span>
        </footer>
      </article>
    </div>
  );
}

function Tile({ valor, rotulo, sub, aoClicar }: { valor: string; rotulo: string; sub?: ReactNode; aoClicar?: () => void }) {
  const corpo = (
    <>
      <div className="font-display text-[26px] font-semibold tnum leading-tight">{valor}</div>
      <div className="text-[12.5px] text-muted">{rotulo}</div>
      {sub && <div className="text-[12px] mt-0.5">{sub}</div>}
    </>
  );
  return aoClicar
    ? <button type="button" onClick={aoClicar} className="text-left rounded-lg border border-line p-3 hover:border-line-strong" title="Clique para ver os chamados">{corpo}</button>
    : <div className="rounded-lg border border-line p-3">{corpo}</div>;
}
