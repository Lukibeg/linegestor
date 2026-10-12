/**
 * O sininho dos chamados (Patch 1.10): os avisos que chegaram para a pessoa — recebeu um chamado, o
 * prazo está vencendo, o cliente respondeu, chegou um Crítico. O número é o que ela ainda não viu;
 * abrir a lista marca como lidos.
 *
 * Mora no rodapé do menu lateral (no computador a barra de cima saiu, para sobrar espaço — o pedido
 * do Luan) e na barra do celular. `lado` diz para onde a lista abre: para cima no rodapé do menu,
 * para o lado com o menu recolhido, para baixo na barra do celular.
 */
import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, Bell, CheckCheck, Eye, GitBranch, Hourglass, Inbox, MessageSquare, Siren, TriangleAlert, UserX, type LucideIcon } from 'lucide-react';
import type { AvisoNaTela } from '@gestor/shared';
import { api } from '../../api/index.js';
import { haQuanto, useAbrirChamado } from './comum.js';

const ICONE: Record<AvisoNaTela['tipo'], { Icone: LucideIcon; cor: string }> = {
  recebeu: { Icone: Inbox, cor: 'text-accent' }, etapa: { Icone: ArrowRight, cor: 'text-accent' }, prazo_perto: { Icone: Hourglass, cor: 'text-signal' },
  prazo_vencido: { Icone: TriangleAlert, cor: 'text-bad' }, sem_dono: { Icone: UserX, cor: 'text-signal' }, critico: { Icone: Siren, cor: 'text-bad' },
  cliente_respondeu: { Icone: MessageSquare, cor: 'text-ok' }, pai: { Icone: GitBranch, cor: 'text-muted' },
  // o chamado que a pessoa observa (como no Helena: toda atualização)
  observador: { Icone: Eye, cor: 'text-roxo' },
};

const LUGAR_DA_LISTA = {
  cima: 'left-0 bottom-full mb-2',
  lado: 'left-full ml-3 bottom-0',
  baixo: 'right-0 top-full mt-1',
} as const;

export function SinoDeAvisos({ lado = 'baixo' }: { lado?: keyof typeof LUGAR_DA_LISTA }) {
  const [aberto, setAberto] = useState(false);
  const caixa = useRef<HTMLDivElement>(null);
  const abrirChamado = useAbrirChamado();
  const qc = useQueryClient();
  // relê a cada minuto: o aviso do prazo nasce no relógio do servidor
  const q = useQuery({ queryKey: ['atendimento', 'avisos'], queryFn: () => api.atendimento.avisos(), refetchInterval: 60_000, staleTime: 30_000 });
  const naoLidos = q.data?.naoLidos ?? 0;

  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => { if (caixa.current && !caixa.current.contains(e.target as Node)) setAberto(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setAberto(false); };
    document.addEventListener('mousedown', fora);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', fora); document.removeEventListener('keydown', esc); };
  }, [aberto]);

  const marcarTodos = async () => {
    await api.atendimento.marcarAvisosLidos();
    await qc.invalidateQueries({ queryKey: ['atendimento', 'avisos'] });
  };
  const abrir = async (a: AvisoNaTela) => {
    setAberto(false);
    if (!a.lido) { await api.atendimento.marcarAvisosLidos([a.id]).catch(() => undefined); void qc.invalidateQueries({ queryKey: ['atendimento', 'avisos'] }); }
    // o chamado abre na janela grande, por cima da tela em que a pessoa está
    if (a.chamado) abrirChamado(a.chamado.codigo);
  };

  return (
    <div className="relative" ref={caixa}>
      <button className="btn-ghost btn-sm relative" onClick={() => setAberto((x) => !x)} title={naoLidos ? `${naoLidos} aviso(s) dos chamados` : 'Avisos dos chamados'} aria-label="Avisos dos chamados" aria-expanded={aberto}>
        <Bell size={16} />
        {naoLidos > 0 && <span className="absolute -top-0.5 -right-0.5 tnum text-[10px] font-semibold rounded-full bg-bad text-white min-w-4 h-4 px-1 flex items-center justify-center">{naoLidos > 99 ? '99+' : naoLidos}</span>}
      </button>
      {aberto && (
        <div className={`absolute ${LUGAR_DA_LISTA[lado]} z-40 card shadow-lg w-[min(380px,calc(100vw-24px))] max-h-[70vh] flex flex-col`} style={{ boxShadow: '0 10px 30px rgba(0,0,0,.18)' }}>
          <div className="flex items-center justify-between px-3 py-2 border-b border-line">
            <span className="font-display font-semibold text-[14px]">Avisos dos chamados</span>
            {naoLidos > 0 && <button className="btn-ghost btn-sm text-[12px]" onClick={marcarTodos}><CheckCheck size={14} /> Marcar todos como lidos</button>}
          </div>
          <ul className="overflow-y-auto">
            {(q.data?.itens ?? []).map((a) => (
              <li key={a.id}>
                <button className={`w-full text-left px-3 py-2 flex gap-2 hover:bg-surface-2 border-b border-line ${a.lido ? 'opacity-70' : ''}`} onClick={() => abrir(a)}>
                  {(() => { const i = ICONE[a.tipo] ?? ICONE.recebeu; return <i.Icone size={15} className={`shrink-0 mt-0.5 ${i.cor}`} aria-hidden />; })()}
                  <span className="min-w-0 flex-1">
                    <span className={`block text-[13px] ${a.lido ? 'text-ink-2' : 'text-ink font-semibold'}`}>{a.texto}</span>
                    {a.chamado && <span className="block text-[12px] text-muted truncate"><span className="font-mono">{a.chamado.codigo}</span> · {a.chamado.titulo}</span>}
                    <span className="block text-[11.5px] text-muted">{haQuanto(a.em)}</span>
                  </span>
                  {!a.lido && <span className="w-2 h-2 rounded-full bg-accent mt-1.5 shrink-0" aria-label="não lido" role="img" />}
                </button>
              </li>
            ))}
            {!q.data?.itens.length && <li className="px-3 py-6 text-center text-muted text-[13px]">Nenhum aviso por enquanto.</li>}
          </ul>
        </div>
      )}
    </div>
  );
}
