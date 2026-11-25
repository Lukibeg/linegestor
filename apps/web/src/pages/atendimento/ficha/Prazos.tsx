/**
 * O prazo do chamado (2.4.8): a solução, pelo prazo do assunto (o dele, ou o herdado do assunto de
 * cima), com a frase do prazo ("Faltam 2 h úteis (vence às 16:00)"), a barrinha do quanto já correu
 * (verde, laranja, vermelho — sempre com o texto ao lado, nunca só a cor) e a marca de espera: desde
 * quando e por quê. Esperando o cliente, o prazo para; esperando a operadora, continua. A primeira
 * resposta não tem prazo. Sem prazo, a frase diz o porquê (sem assunto, ou o assunto sem prazo).
 *
 * No painel com o prazo escrito em cada chamado (2.4.11, o Luan: "tem q ter a opção do painel dos prazos serem manuais e
 * serem preenchidos em cada chamado"), o prazo é o dia e a hora escritos aqui: quem trabalha no chamado escreve, muda ou
 * tira. Conta em horas corridas e não para esperando o cliente.
 */
import { useState } from 'react';
import { AlarmClock, Hourglass, Pencil } from 'lucide-react';
import {
  caminhoDoAssunto, diaLocal, duracaoDoPrazo, horaLocal, instanteLocal, NOME_ESPERA, NOME_SITUACAO_PRAZO, prazoDoAssunto, prazoEscritoLegivel, prazoEscritoNoChamado,
  TEXTO_SEM_PRAZO, textoDoPrazo, type EstadoPrazo,
} from '@gestor/shared';
import { api } from '../../../api/index.js';
import { Spinner } from '../../../components/ui/index.js';
import { haQuanto, useOpcoes } from '../comum.js';
import { ErroPerto, Secao, useAberta, useAcao } from './base.js';
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
  // o prazo escrito em cada chamado (2.4.11): o dia e a hora, que se escrevem aqui
  if (painel && prazoEscritoNoChamado(painel.ajustes)) {
    return (
      <Secao titulo="Prazo" icone={<AlarmClock size={16} />}>
        <PrazoEscrito />
        <MarcaDeEspera escrito />
      </Secao>
    );
  }
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

/**
 * O prazo escrito no chamado (2.4.11): a barrinha e a frase, como o do assunto, e o dia e a hora para escrever (ou mudar, ou
 * tirar). O "perto de vencer" segue o percentual dos Ajustes › Prazos.
 */
function PrazoEscrito() {
  const { f, pode } = useAberta();
  const acao = useAcao();
  const { solucao } = f.prazos;
  const [editando, setEditando] = useState(false);
  const [dia, setDia] = useState('');
  const [hora, setHora] = useState('');
  const abrir = () => {
    setDia(f.prazoEscrito ? diaLocal(f.prazoEscrito) : '');
    setHora(f.prazoEscrito ? horaLocal(f.prazoEscrito) : '18:00');
    acao.limpar(); setEditando(true);
  };
  const gravar = async (prazo: string | null) => {
    const r = await acao.rodar(() => api.atendimento.alterar(f.id, { prazo }), prazo ? `Prazo: ${prazoEscritoLegivel(prazo)}` : 'Prazo tirado');
    if (r.ok) setEditando(false);
  };
  const salvar = () => {
    if (!dia) { acao.setErro('Escolha o dia do prazo.'); return; }
    const quando = instanteLocal(dia, hora || '18:00');
    if (Number.isNaN(quando.getTime())) { acao.setErro('Escreva o dia e a hora do prazo.'); return; }
    void gravar(quando.toISOString());
  };
  return (
    <div className="flex flex-col gap-2" id="prazo-escrito">
      {solucao.situacao === 'sem' ? (
        <p className="text-[13px] text-ink-2" id="prazo-sem" data-motivo={solucao.motivo ?? ''}>{TEXTO_SEM_PRAZO[solucao.motivo ?? 'sem_prazo_escrito']}.</p>
      ) : <UmPrazo nome="Solução" e={solucao} />}
      {f.prazoEscrito && !editando && (
        <p className="text-[11.5px] text-muted">
          Prazo escrito no chamado: <b className="font-medium text-ink-2">{prazoEscritoLegivel(f.prazoEscrito)}</b> (horas corridas; não para esperando o cliente).
        </p>
      )}
      {pode && !editando && (
        <button type="button" className="btn-ghost btn-sm self-start -ml-1.5" id="prazo-escrever" onClick={abrir}>
          <Pencil size={13} aria-hidden /> {f.prazoEscrito ? 'Mudar o prazo' : 'Escrever o prazo'}
        </button>
      )}
      {editando && (
        <div className="rounded-lg border border-line bg-surface-2 p-2.5 flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <input className="input w-auto" type="date" id="prazo-dia" value={dia} aria-label="O dia do prazo" autoFocus onChange={(e) => setDia(e.target.value)} />
            <input className="input w-auto" type="time" id="prazo-hora" value={hora} aria-label="A hora do prazo" onChange={(e) => setHora(e.target.value)} />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className="btn-primary btn-sm" id="prazo-salvar" disabled={acao.ocupado} onClick={salvar}>{acao.ocupado ? <Spinner className="text-white" /> : 'Salvar'}</button>
            <button type="button" className="btn-secondary btn-sm" disabled={acao.ocupado} onClick={() => { setEditando(false); acao.limpar(); }}>Cancelar</button>
            {f.prazoEscrito && <button type="button" className="btn-ghost btn-sm text-bad ml-auto" disabled={acao.ocupado} onClick={() => void gravar(null)}>Tirar o prazo</button>}
          </div>
          <p className="text-[11.5px] text-muted">No horário de Brasília. O histórico guarda o prazo de antes.</p>
        </div>
      )}
      <ErroPerto erro={acao.erro} />
    </div>
  );
}

function MarcaDeEspera({ escrito = false }: { escrito?: boolean }) {
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
      <p className="text-[12px] text-muted mt-1">{escrito ? 'O prazo escrito continua correndo (ele não para esperando).' : cliente ? 'O prazo está parado enquanto espera o cliente.' : 'O prazo continua correndo.'}</p>
    </div>
  );
}
