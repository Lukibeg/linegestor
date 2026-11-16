/**
 * O prazo do chamado (2.4.8): a solução, pelo prazo do assunto (o dele, ou o herdado do assunto de
 * cima), com a frase do prazo ("Faltam 2 h úteis (vence às 16:00)"), a barrinha do quanto já correu
 * (verde, laranja, vermelho — sempre com o texto ao lado, nunca só a cor) e a marca de espera: desde
 * quando e por quê. Esperando o cliente, o prazo para; esperando a operadora, continua. A primeira
 * resposta não tem prazo. Sem prazo, a frase diz o porquê (sem assunto, ou o assunto sem prazo).
 */
import { AlarmClock, Hourglass } from 'lucide-react';
import { caminhoDoAssunto, duracaoDoPrazo, NOME_ESPERA, NOME_SITUACAO_PRAZO, prazoDoAssunto, TEXTO_SEM_PRAZO, textoDoPrazo, type EstadoPrazo } from '@gestor/shared';
import { haQuanto, useOpcoes } from '../comum.js';
import { Secao, useAberta } from './base.js';
import { dataCompleta, emQuando } from './Cabecalho.js';

const BARRA: Record<EstadoPrazo['situacao'], string> = {
  vencido: 'bg-bad', estourou: 'bg-bad', perto: 'bg-signal', no_prazo: 'bg-ok', cumprido: 'bg-ok', pausado: 'bg-line-strong', sem: 'bg-line-strong',
};
const TEXTO: Record<EstadoPrazo['situacao'], string> = {
  vencido: 'text-bad', estourou: 'text-bad', perto: 'text-signal', no_prazo: 'text-ink-2', cumprido: 'text-ok', pausado: 'text-muted', sem: 'text-muted',
};
const SELO: Record<EstadoPrazo['situacao'], string> = {
  vencido: 'bg-bad-soft text-bad', estourou: 'bg-bad-soft text-bad', perto: 'bg-signal-soft text-signal', no_prazo: 'bg-ok-soft text-ok', cumprido: 'bg-ok-soft text-ok',
  pausado: 'bg-surface-2 text-muted', sem: 'bg-surface-2 text-muted',
};
/** O que fazer para o chamado ganhar prazo (abaixo da frase do "sem prazo"). */
const COMO_TER_PRAZO: Partial<Record<NonNullable<EstadoPrazo['motivo']>, string>> = {
  sem_assunto: 'O prazo vem do assunto: escolha o assunto do chamado.',
  assunto_sem_prazo: 'Cadastre o prazo de solução do assunto em Configurar › Assuntos (o subtópico sem prazo usa o do assunto de cima).',
};

export function Prazos() {
  const { f, painel } = useAberta();
  const opcoes = useOpcoes();
  const { solucao } = f.prazos;
  // de qual assunto vem o prazo (o do chamado, ou o de cima, quando o subtópico não tem o seu)
  const dono = f.assunto ? prazoDoAssunto(f.assunto.id, opcoes.data?.assuntos ?? []) : null;
  const herdado = dono && f.assunto && dono.deId !== f.assunto.id;
  return (
    <Secao titulo="Prazo" icone={<AlarmClock size={16} />}>
      {solucao.situacao === 'sem' ? (
        <div className="text-[13px]" id="prazo-sem" data-motivo={solucao.motivo ?? ''}>
          <p className="text-ink-2">
            {solucao.motivo === 'painel' && painel ? `Sem prazo: o painel ${painel.nome} não conta prazo.` : TEXTO_SEM_PRAZO[solucao.motivo ?? 'painel']}{solucao.motivo === 'assunto_sem_prazo' && f.assunto ? ` (${f.assunto.caminho})` : ''}.
          </p>
          {solucao.motivo && COMO_TER_PRAZO[solucao.motivo] && <p className="text-[12px] text-muted mt-0.5">{COMO_TER_PRAZO[solucao.motivo]}</p>}
        </div>
      ) : (
        <div className="flex flex-col gap-2" id="prazo-solucao">
          <UmPrazo nome="Solução" e={solucao} />
          <p className="text-[11.5px] text-muted">
            {dono ? <>Prazo do assunto {herdado ? <>{f.assunto!.nome}, herdado de <b className="font-medium text-ink-2">{caminhoDoAssunto(dono.deId, opcoes.data?.assuntos ?? [])}</b></> : <b className="font-medium text-ink-2">{dono.deNome}</b>}: </> : 'Prazo do assunto: '}
            {duracaoDoPrazo(solucao.limite)} úteis para resolver.
          </p>
        </div>
      )}
      <MarcaDeEspera />
    </Secao>
  );
}

function UmPrazo({ nome, e }: { nome: string; e: EstadoPrazo }) {
  const pct = Math.max(0, Math.min(100, e.percentual));
  const terminado = e.situacao === 'cumprido' || e.situacao === 'estourou';
  return (
    <div>
      <div className="flex items-center justify-between gap-2 mb-1">
        <span className="text-[13px] font-semibold">{nome}</span>
        <span className={`chip ${SELO[e.situacao]}`}>{NOME_SITUACAO_PRAZO[e.situacao]}</span>
      </div>
      <div className="h-2 rounded-full bg-surface-2 overflow-hidden" role="progressbar" aria-label={`${nome}: ${e.percentual}% do prazo`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
        <div className={`h-full rounded-full ${BARRA[e.situacao]}`} style={{ width: `${pct}%` }} />
      </div>
      <p className={`text-[12.5px] mt-1 ${TEXTO[e.situacao]}`}>
        {textoDoPrazo(e)}
        <span className="text-muted"> · {e.percentual}% do prazo{terminado && e.cumpridoEm ? ` · ${nome === 'Solução' ? 'resolvido' : 'respondido'} ${emQuando(e.cumpridoEm)}` : ''}</span>
      </p>
    </div>
  );
}

function MarcaDeEspera() {
  const { f } = useAberta();
  if (!f.espera) return null;
  const cliente = f.espera.tipo === 'cliente';
  return (
    <div className={`mt-3.5 rounded-lg border-l-4 px-3 py-2 text-[13px] ${cliente ? 'border-turquesa bg-turquesa-soft' : 'border-roxo bg-roxo-soft'}`}>
      <p className={`font-semibold flex items-center gap-1.5 ${cliente ? 'text-turquesa-ink' : 'text-roxo-ink'}`}>
        <Hourglass size={14} aria-hidden /> {NOME_ESPERA[f.espera.tipo]}
      </p>
      <p className="text-ink-2 mt-0.5">
        desde <time dateTime={f.espera.desde} title={dataCompleta(f.espera.desde)}>{emQuando(f.espera.desde).replace(/^em /, '')}</time> ({haQuanto(f.espera.desde)})
      </p>
      {f.espera.motivo && <p className="text-ink mt-0.5 break-words">{f.espera.motivo}</p>}
      <p className="text-[12px] text-muted mt-1">{cliente ? 'O prazo está parado enquanto espera o cliente.' : 'O prazo continua correndo.'}</p>
    </div>
  );
}
