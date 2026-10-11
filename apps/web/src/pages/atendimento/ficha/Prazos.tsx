/**
 * Os prazos do chamado: a primeira resposta e a solução, cada um com a frase do prazo ("Faltam 2 h
 * úteis (vence às 16:00)"), a barrinha do quanto já correu (verde, laranja, vermelho — sempre com o
 * texto ao lado, nunca só a cor) e a marca de espera: desde quando e por quê. Esperando o cliente, o
 * prazo para; esperando a operadora, continua.
 */
import { AlarmClock, Hourglass } from 'lucide-react';
import { duracaoDoPrazo, NOME_CONTA, NOME_ESPERA, NOME_PRIORIDADE, NOME_SITUACAO_PRAZO, textoDoPrazo, type EstadoPrazo } from '@gestor/shared';
import { haQuanto } from '../comum.js';
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

export function Prazos() {
  const { f, painel } = useAberta();
  const { resposta, solucao } = f.prazos;
  const semPrazo = resposta.situacao === 'sem' && solucao.situacao === 'sem';
  return (
    <Secao titulo="Prazos" icone={<AlarmClock size={16} />}>
      {semPrazo ? (
        <p className="text-[13px] text-muted">
          {painel && !painel.ajustes.contaPrazo ? `O painel ${painel.nome} não conta prazo.` : !f.prioridade ? 'Sem prazo: escolha a prioridade (ou a gravidade e o alcance, para o Gestor sugerir).' : 'Sem prazo.'}
        </p>
      ) : (
        <div className="flex flex-col gap-3.5">
          <UmPrazo nome="Primeira resposta" e={resposta} />
          <UmPrazo nome="Solução" e={solucao} />
          {f.prioridade && (
            <p className="text-[11.5px] text-muted">
              Prioridade {NOME_PRIORIDADE[f.prioridade]}: {duracaoDoPrazo(resposta.limite)} para responder e {duracaoDoPrazo(solucao.limite)} para resolver, em {NOME_CONTA[solucao.conta]}.
            </p>
          )}
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
