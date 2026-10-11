/**
 * O cabeçalho da ficha: o caminho de volta (a lista com os filtros, ou o quadro do painel — na janela
 * por cima da tela, não precisa: fechar a janela já volta), o código
 * grande na cor do painel, a etapa, a prioridade, os selos (problema, reaberto, esperando, o prazo),
 * o título — que se edita ali mesmo: clicar edita, Enter grava, Esc desiste — e quem abriu, quando
 * e de onde o chamado veio.
 */
import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Bot, CalendarClock, Kanban, Layers, MessageSquare, Monitor, Pencil, Plug, RotateCcw } from 'lucide-react';
import { DICA_TIPO_ETAPA, NOME_ORIGEM, type Origem } from '@gestor/shared';
import { api } from '../../../api/index.js';
import { Chip, Spinner, type TomChip } from '../../../components/ui/index.js';
import { paraALista } from '../../../lib/voltar.js';
import { ChipEspera, ChipPrioridade, CodigoChamado, SeloPrazo, dataHoraCurta, haQuanto } from '../comum.js';
import { ErroPerto, nomeComNivel, useAberta, useAcao } from './base.js';

const ICONE_ORIGEM: Record<Origem, typeof Monitor> = { manual: Monitor, robo: Bot, botao: MessageSquare, agendado: CalendarClock, api: Plug };
const TOM_SITUACAO: Record<string, TomChip> = { aberto: 'accent', resolvido: 'ok', fechado: 'muted' };

/** A data inteira, para o "passar o mouse". */
export const dataCompleta = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' }) : '');
/** "hoje 14:32", "ontem 09:10", "em 08/10 17:45". */
export const emQuando = (iso: string | null | undefined) => {
  const t = dataHoraCurta(iso);
  return /^(hoje|ontem)/.test(t) ? t : `em ${t}`;
};

/**
 * O quadro do painel do chamado: com os filtros que a pessoa deixou nele, quando eram deste painel;
 * senão, o quadro limpo do painel.
 */
function paraOQuadro(painelId: string): string {
  const guardado = paraALista('/atendimento/quadro');
  const busca = new URLSearchParams(guardado.split('?')[1] ?? '');
  if (busca.get('painel') === painelId) return guardado;
  return `/atendimento/quadro?painel=${encodeURIComponent(painelId)}`;
}

export function Cabecalho({ emJanela = false }: { emJanela?: boolean }) {
  const { f, painel, etapa } = useAberta();
  const Icone = ICONE_ORIGEM[f.origem] ?? Monitor;
  return (
    <header className="flex flex-col gap-2 min-w-0">
      {!emJanela && (
        <nav aria-label="Voltar" className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px]">
          <Link to={paraALista('/atendimento/lista')} className="inline-flex items-center gap-1.5 text-muted hover:text-accent"><ArrowLeft size={14} /> Lista de chamados</Link>
          <span className="text-line-strong" aria-hidden>·</span>
          <Link to={paraOQuadro(f.painelId)} className="inline-flex items-center gap-1.5 text-muted hover:text-accent"><Kanban size={14} /> Quadro · {painel?.nome ?? 'painel'}</Link>
        </nav>
      )}

      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
        <CodigoChamado codigo={f.codigo} cor={painel?.cor} link={false} className="!text-[16px] !leading-6 !px-2.5 !py-1" />
        <span className="text-[13px] text-muted font-medium">{painel?.nome ?? 'Painel'}</span>
        {etapa && (
          <Chip tone={TOM_SITUACAO[f.situacao] ?? 'neutral'} title={`Etapa ${etapa.nome}: ${DICA_TIPO_ETAPA[etapa.tipo]}`}>{nomeComNivel(etapa)}</Chip>
        )}
        <ChipPrioridade p={f.prioridade} />
        {f.tipoChamado === 'problema' && <Chip tone="rosa" title="Problema: junta os incidentes de várias empresas"><Layers size={12} /> Problema</Chip>}
        {f.reaberto > 0 && <Chip tone="signal" title={`Reaberto ${f.reaberto} ${f.reaberto === 1 ? 'vez' : 'vezes'}`}><RotateCcw size={11} /> Reaberto {f.reaberto === 1 ? '1 vez' : `${f.reaberto} vezes`}</Chip>}
        <ChipEspera e={f.espera} mostrarDesde />
        <SeloPrazo c={f} />
      </div>

      <Titulo />

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-muted">
        <span>
          Aberto {f.criadoPor && <>por <b className="text-ink-2 font-semibold">{f.criadoPor.nome}</b> </>}
          <time dateTime={f.criadoEm} title={dataCompleta(f.criadoEm)}>{emQuando(f.criadoEm)}</time>
        </span>
        <span className="inline-flex items-center gap-1" title="De onde o chamado veio"><Icone size={13} aria-hidden /> {NOME_ORIGEM[f.origem] ?? f.origem}</span>
        <span title={`Última atividade: ${dataCompleta(f.ultimaAtividadeEm)}`}>mexido {haQuanto(f.ultimaAtividadeEm)}</span>
        {f.fechadoEm ? <span>fechado {emQuando(f.fechadoEm)}</span> : f.resolvidoEm ? <span>resolvido {emQuando(f.resolvidoEm)}</span> : null}
      </div>
    </header>
  );
}

/** O título, que se edita na própria linha: clicar edita, Enter grava, Esc desiste. */
function Titulo() {
  const { f, pode } = useAberta();
  const [editando, setEditando] = useState(false);
  const [texto, setTexto] = useState(f.titulo);
  const acao = useAcao();
  // o Enter grava e tira a caixa da tela; o "sair da caixa" que vem junto não pode gravar de novo
  const fim = useRef(false);

  const abrir = () => { fim.current = false; setTexto(f.titulo); acao.limpar(); setEditando(true); };
  const desistir = () => { fim.current = true; setEditando(false); acao.limpar(); };
  const gravar = async () => {
    if (fim.current) return;
    const t = texto.trim();
    if (t === f.titulo) { desistir(); return; }
    if (t.length < 3) { acao.setErro('O título precisa de pelo menos 3 letras.'); return; }
    fim.current = true;
    const r = await acao.rodar(() => api.atendimento.alterar(f.id, { titulo: t }));
    if (r.ok) setEditando(false); else fim.current = false;
  };

  if (editando) {
    return (
      <div className="min-w-0">
        <label htmlFor="titulo-do-chamado" className="sr-only">Título do chamado</label>
        <div className="flex items-center gap-2">
          <input id="titulo-do-chamado" className="input font-display text-lg sm:text-xl font-semibold py-1.5" autoFocus autoComplete="off" maxLength={200} value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void gravar(); } else if (e.key === 'Escape') { e.preventDefault(); desistir(); } }}
            onBlur={() => { void gravar(); }} />
          {acao.ocupado && <Spinner />}
        </div>
        <p className="text-[12px] text-muted mt-1">Enter grava · Esc desiste</p>
        <ErroPerto erro={acao.erro} />
      </div>
    );
  }
  if (!pode) return <h1 className="font-display text-xl sm:text-2xl font-semibold leading-snug break-words">{f.titulo}</h1>;
  return (
    <h1 className="font-display text-xl sm:text-2xl font-semibold leading-snug min-w-0">
      <button type="button" onClick={abrir} title="Clique para editar o título"
        className="group text-left rounded-lg -mx-1.5 px-1.5 hover:bg-surface-2 focus-visible:bg-surface-2 break-words max-w-full">
        {f.titulo}<Pencil size={15} className="inline-block ml-2 -mt-1 text-muted opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100" aria-hidden />
      </button>
    </h1>
  );
}
