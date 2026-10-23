/**
 * O botão da NIA na barra de ações da ficha (2.1). O pedido do Luan (23/10): "para eu fazer a ia preencher o
 * chamado hoje eu tenho que etiquetar, só que isso eu acho meio gambiarra, devíamos ter um botão aqui para mandar ela
 * preencher e se já tiver sido feito ele fica com alguma marcação dizendo que já foi feito e se eu clicar ele me
 * mostra algumas informações como data".
 *
 * Por baixo, o botão põe a mesma etiqueta que a equipe punha (NIA - PREENCHER): o fluxo da NIA no n8n não muda.
 * O que o botão mostra sai das etiquetas e do histórico (`resumoDaNia`, em @gestor/shared), então vale também para
 * o chamado etiquetado à mão antes do botão:
 *  - nunca pedida: "Preencher com a NIA" (sem a conversa do LineChat, avisa antes: a NIA lê só o chamado);
 *  - pedida: "NIA preenchendo…" — a ficha se relê sozinha até ela responder (e, parada há 10 minutos, dá para pedir de novo);
 *  - pronta: "NIA preencheu" — o clique mostra quando, quem pediu, o que ela mudou e as anotações dela;
 *  - erro: "NIA não preencheu" — e "Tentar de novo".
 * As etiquetas são as dos Ajustes › IA; lá também se desliga o botão.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AlertTriangle, Bot, CheckCircle2, MessagesSquare, RotateCcw } from 'lucide-react';
import { NIA_PEDIR_DE_NOVO_MINUTOS, resumoDaNia, type ResumoDaNia } from '@gestor/shared';
import { api } from '../../../api/index.js';
import { Spinner, useToast } from '../../../components/ui/index.js';
import { dataHoraCurta, haQuanto } from '../comum.js';
import { ErroPerto, lista, useAberta, useAcao, usePosicaoFlutuante } from './base.js';
import { pedirParaLigarAConversa } from './Conversa.js';

/** De quanto em quanto a ficha se relê enquanto a NIA preenche (e até quando: depois disso, só pedindo de novo). */
const RELER_A_CADA_MS = 5_000;
const RELER_ATE_MINUTOS = 15;

export function BotaoDaNia() {
  const { f, opcoes, painel, recarregar } = useAberta();
  const toast = useToast();
  const acao = useAcao();
  const [aberto, setAberto] = useState(false);
  const caixa = useRef<HTMLDivElement>(null);
  const botao = useRef<HTMLButtonElement>(null);
  const painelRef = useRef<HTMLDivElement>(null);
  const pos = usePosicaoFlutuante(aberto, botao, painelRef, 'direita');
  const nia = opcoes.nia;
  const r: ResumoDaNia | null = nia ? resumoDaNia(f, { ligada: true, ...nia }) : null;

  // outro chamado na mesma ficha: a janelinha fecha
  useEffect(() => { setAberto(false); }, [f.id]);
  // fechar ao clicar fora e com Esc
  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => { if (caixa.current && !caixa.current.contains(e.target as Node)) setAberto(false); };
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') { setAberto(false); botao.current?.focus(); } };
    document.addEventListener('mousedown', fora);
    document.addEventListener('keydown', tecla);
    return () => { document.removeEventListener('mousedown', fora); document.removeEventListener('keydown', tecla); };
  }, [aberto]);

  // enquanto ela preenche, a ficha se relê sozinha (o n8n responde em segundos); o relógio não recomeça a cada
  // desenho da ficha (quem escreve uma anotação enquanto espera continua vendo a resposta chegar)
  const esperando = r?.situacao === 'pedida' && !!r.pedidaEm && Date.now() - Date.parse(r.pedidaEm) < RELER_ATE_MINUTOS * 60_000;
  const reler = useRef(recarregar);
  reler.current = recarregar;
  useEffect(() => {
    if (!esperando) return;
    const id = window.setInterval(() => reler.current(), RELER_A_CADA_MS);
    return () => window.clearInterval(id);
  }, [esperando]);

  // a resposta chegou com a ficha aberta: avisa (só do mesmo chamado: trocar de ficha não conta como resposta)
  const antes = useRef({ id: f.id, situacao: r?.situacao });
  useEffect(() => {
    const agora = r?.situacao;
    if (antes.current.id === f.id && antes.current.situacao === 'pedida') {
      if (agora === 'pronta') toast.push('ok', `A NIA preencheu o ${f.codigo}${r!.mudou.length ? `: ${lista(r!.mudou)}` : ''}`);
      if (agora === 'erro') toast.push('erro', `A NIA não conseguiu preencher o ${f.codigo}: veja as anotações dela`);
    }
    antes.current = { id: f.id, situacao: agora };
  }, [f.id, r?.situacao]); // eslint-disable-line react-hooks/exhaustive-deps

  // a negociação não tem a NIA; desligada nos Ajustes, o botão some
  if (!nia || !r || painel?.tipo === 'vendas') return null;

  const pedir = async () => {
    const deNovo = r.situacao !== 'nunca';
    const res = await acao.rodar(() => api.atendimento.pedirANia(f.id), deNovo ? 'Pedido de novo à NIA: ela preenche em instantes' : 'Pedido à NIA: ela lê e preenche em instantes');
    // deu certo, a janelinha fecha; não deu, ela mostra o porquê
    setAberto(!res.ok);
  };
  const ligarConversa = () => { setAberto(false); pedirParaLigarAConversa(); };
  // o clique: sem a conversa (ou com algo a mostrar), abre a janelinha; nunca pedida e com a conversa, já pede
  const clicar = () => {
    acao.limpar();
    if (r.situacao === 'nunca' && f.sessaoId) void pedir();
    else setAberto((a) => !a);
  };

  const rotulo: Record<ResumoDaNia['situacao'], ReactNode> = {
    nunca: <><Bot size={14} /> Preencher com a NIA</>,
    pedida: <><Spinner className="!w-3.5 !h-3.5" /> NIA preenchendo…</>,
    pronta: <><CheckCircle2 size={14} /> NIA preencheu</>,
    erro: <><AlertTriangle size={14} /> NIA não preencheu</>,
  };
  const tom = r.situacao === 'pronta' ? 'text-ok' : r.situacao === 'erro' ? 'text-bad' : '';
  const titulo = r.situacao === 'nunca'
    ? (f.sessaoId ? 'A NIA lê a conversa do LineChat e preenche o chamado (põe a etiqueta, como antes)' : 'A NIA preenche o chamado: o chamado não tem a conversa do LineChat')
    : r.situacao === 'pedida' ? 'A NIA está preenchendo: clique para ver desde quando' : r.situacao === 'pronta' ? 'A NIA já preencheu: clique para ver quando e o que mudou' : 'A NIA não conseguiu: clique para ver e tentar de novo';

  return (
    <div className="relative" ref={caixa}>
      <button ref={botao} type="button" id="acao-nia" className={`btn-secondary btn-xs ${tom}`} disabled={acao.ocupado} onClick={clicar} title={titulo}
        aria-haspopup="dialog" aria-expanded={aberto} data-situacao={r.situacao}>
        {acao.ocupado && !aberto ? <><Spinner className="!w-3.5 !h-3.5" /> Pedindo à NIA…</> : rotulo[r.situacao]}
      </button>
      {aberto && (
        <div ref={painelRef} role="dialog" aria-label="A NIA neste chamado" id="nia-janelinha"
          className="fixed z-40 card p-3 overflow-y-auto shadow-lg text-left font-normal whitespace-normal"
          style={{ left: pos?.left ?? -9999, top: pos?.top, bottom: pos?.bottom, maxHeight: pos?.maxHeight ?? 360, maxWidth: 'calc(100vw - 16px)', visibility: pos ? 'visible' : 'hidden', boxShadow: '0 10px 30px rgba(0,0,0,.18)' }}>
          <div className="w-[330px] max-w-full flex flex-col gap-2 text-[13px]">
            <Conteudo r={r} etiquetas={nia} temConversa={!!f.sessaoId} />
            <div className="flex flex-wrap items-center gap-2 pt-1">
              {!f.sessaoId && r.situacao !== 'pedida' && (
                <button type="button" className={r.situacao === 'nunca' ? 'btn-primary btn-sm' : 'btn-secondary btn-sm'} id="nia-ligar-conversa" onClick={ligarConversa}>
                  <MessagesSquare size={14} /> Ligar a conversa
                </button>
              )}
              {r.podePedir && (
                <button type="button" id="nia-pedir" disabled={acao.ocupado} onClick={() => void pedir()}
                  className={r.situacao === 'nunca' && !f.sessaoId ? 'btn-secondary btn-sm' : 'btn-primary btn-sm'}>
                  {acao.ocupado ? <Spinner className="text-white" /> : r.situacao === 'nunca' ? (f.sessaoId ? 'Pedir à NIA' : 'Pedir mesmo assim') : <><RotateCcw size={13} /> {r.situacao === 'erro' ? 'Tentar de novo' : r.situacao === 'pedida' ? 'Pedir de novo' : 'Preencher de novo'}</>}
                </button>
              )}
            </div>
            <ErroPerto erro={acao.erro} className="mt-0" />
          </div>
        </div>
      )}
    </div>
  );
}

/** Uma linha "o quê: quando · quem" da janelinha. */
function Linha({ rotulo, quando, quem }: { rotulo: string; quando: string | null; quem: string | null }) {
  if (!quando) return null;
  return (
    <div className="flex items-baseline gap-2">
      <span className="text-muted w-[78px] shrink-0">{rotulo}</span>
      <span className="min-w-0 text-ink"><span className="tnum">{dataHoraCurta(quando)}</span>{quem && <span className="text-ink-2"> · {quem}</span>}</span>
    </div>
  );
}

function Conteudo({ r, etiquetas, temConversa }: { r: ResumoDaNia; etiquetas: { pedir: string; pronto: string; erro: string }; temConversa: boolean }) {
  const semConversa = !temConversa && (
    <p className="text-[12.5px] rounded-lg bg-signal-soft text-signal p-2 leading-snug" id="nia-sem-conversa">
      Este chamado não tem a conversa do LineChat: a NIA lê só o que está escrito nele (o título, o relato e a descrição).
      No chamado ativo, ligue a conversa antes de pedir.
    </p>
  );
  if (r.situacao === 'nunca') {
    return (
      <>
        <p className="font-semibold text-ink flex items-center gap-1.5"><Bot size={15} /> Preencher com a NIA</p>
        {semConversa}
        <p className="text-[12px] text-muted leading-snug">O botão põe a etiqueta <b>{etiquetas.pedir}</b>, como antes: a NIA lê e preenche em instantes.</p>
      </>
    );
  }
  if (r.situacao === 'pedida') {
    return (
      <>
        <p className="font-semibold text-ink flex items-center gap-1.5"><Spinner className="!w-4 !h-4" /> A NIA está preenchendo</p>
        <Linha rotulo="Pedida" quando={r.pedidaEm} quem={r.pedidaPor} />
        {r.pedidaEm ? (
          <p className="text-[12px] text-muted leading-snug">
            {haQuanto(r.pedidaEm) === 'agora' ? 'Agora há pouco.' : `Faz ${haQuanto(r.pedidaEm).replace(/^há /, '')}.`} A ficha se atualiza sozinha quando ela terminar.
            {r.podePedir && ` Já passou de ${NIA_PEDIR_DE_NOVO_MINUTOS} minutos sem resposta: dá para pedir de novo.`}
          </p>
        ) : (
          <p className="text-[12px] text-muted leading-snug">A etiqueta <b>{etiquetas.pedir}</b> está no chamado, mas o pedido é de antes do histórico. Se ela não responder, peça de novo.</p>
        )}
      </>
    );
  }
  const pronta = r.situacao === 'pronta';
  return (
    <>
      <p className={`font-semibold flex items-center gap-1.5 ${pronta ? 'text-ok' : 'text-bad'}`}>
        {pronta ? <CheckCircle2 size={15} /> : <AlertTriangle size={15} />} {pronta ? 'A NIA preencheu este chamado' : 'A NIA não conseguiu preencher'}
      </p>
      <div className="flex flex-col gap-1">
        <Linha rotulo={pronta ? 'Preencheu' : 'Respondeu'} quando={r.respondidaEm} quem={r.respondidaPor} />
        <Linha rotulo="Pedida" quando={r.pedidaEm} quem={r.pedidaPor} />
        {!r.respondidaEm && (
          <p className="text-[12px] text-muted leading-snug">A etiqueta <b>{pronta ? etiquetas.pronto : etiquetas.erro}</b> está no chamado, de antes do histórico: sem a data.</p>
        )}
        {pronta && r.respondidaEm && (
          <div className="flex items-baseline gap-2">
            <span className="text-muted w-[78px] shrink-0">Mudou</span>
            <span className="min-w-0 text-ink">{r.mudou.length ? lista(r.mudou) : 'nada nos campos'}</span>
          </div>
        )}
        {r.anotacoes > 0 && (
          <div className="flex items-baseline gap-2">
            <span className="text-muted w-[78px] shrink-0">Anotou</span>
            <span className="min-w-0 text-ink">{r.anotacoes === 1 ? '1 anotação' : `${r.anotacoes} anotações`} <span className="text-muted">(na Linha do tempo)</span></span>
          </div>
        )}
        {r.vezes > 1 && <p className="text-[12px] text-muted">Ela já preencheu este chamado {r.vezes} vezes; acima, a última.</p>}
      </div>
      {!pronta && <p className="text-[12px] text-muted leading-snug">O motivo costuma estar nas anotações dela. Confira o chamado e tente de novo.</p>}
      {semConversa}
    </>
  );
}
