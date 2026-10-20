/**
 * O sininho dos chamados (Patch 2.0): os avisos que chegaram para a pessoa — recebeu um chamado, o
 * prazo está vencendo, alguém citou a pessoa, chegou um Crítico. O número é o que ela ainda não viu;
 * abrir a lista marca como lidos.
 *
 * Mora no rodapé do menu lateral (no computador a barra de cima saiu, para sobrar espaço — o pedido
 * do Luan) e na barra do celular. `lado` diz para onde a lista abre: para cima no rodapé do menu,
 * para o lado com o menu recolhido, para baixo na barra do celular.
 *
 * Embaixo da lista, "Além do sininho": o cartão na tela e a notificação do navegador (os avisos que
 * chegam, em AvisosQueChegam.tsx), que cada pessoa liga e desliga, e o "Testar o aviso".
 */
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, BellRing, CheckCheck } from 'lucide-react';
import type { AvisoNaTela } from '@gestor/shared';
import { api } from '../../api/index.js';
import { enderecoDoEvento } from '../calendario/comum.js';
import { haQuanto, useAbrirChamado } from './comum.js';
import { Interruptor } from './ajustes/Avisos.js';
import {
  ICONE_DO_AVISO, consultaDosAvisos, dentroDeOutraPagina, mudarComoAvisar, permissaoDoNavegador, segundaLinhaDoAviso, testarOAviso, useComoAvisar,
} from './AvisosQueChegam.js';

const LUGAR_DA_LISTA = {
  cima: 'left-0 bottom-full mb-2',
  lado: 'left-full ml-3 bottom-0',
  baixo: 'right-0 top-full mt-1',
} as const;

export function SinoDeAvisos({ lado = 'baixo' }: { lado?: keyof typeof LUGAR_DA_LISTA }) {
  const [aberto, setAberto] = useState(false);
  const caixa = useRef<HTMLDivElement>(null);
  const abrirChamado = useAbrirChamado();
  const navegar = useNavigate();
  const qc = useQueryClient();
  // quem relê a cada 30 segundos é o vigia dos avisos que chegam (um só para os dois sininhos)
  const q = useQuery(consultaDosAvisos);
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
    // o chamado abre na janela grande, por cima da tela em que a pessoa está; o lembrete, no calendário (2.0.2)
    if (a.chamado) abrirChamado(a.chamado.codigo);
    else if (a.evento) navegar(enderecoDoEvento(a.evento));
  };

  return (
    <div className="relative" ref={caixa}>
      <button className="btn-ghost btn-sm relative" onClick={() => setAberto((x) => !x)} title={naoLidos ? `${naoLidos} aviso(s)` : 'Avisos'} aria-label="Avisos" aria-expanded={aberto}>
        <Bell size={16} />
        {naoLidos > 0 && <span className="absolute -top-0.5 -right-0.5 tnum text-[10px] font-semibold rounded-full bg-bad text-white min-w-4 h-4 px-1 flex items-center justify-center">{naoLidos > 99 ? '99+' : naoLidos}</span>}
      </button>
      {aberto && (
        <div className={`absolute ${LUGAR_DA_LISTA[lado]} z-40 card shadow-lg w-[min(380px,calc(100vw-24px))] max-h-[70vh] flex flex-col`} style={{ boxShadow: '0 10px 30px rgba(0,0,0,.18)' }}>
          <div className="flex items-center justify-between px-3 py-2 border-b border-line">
            {/* "Avisos" (até o 2.0.1, "Avisos dos chamados"): desde o 2.0.2 chegam também os lembretes do calendário */}
            <span className="font-display font-semibold text-[14px]">Avisos</span>
            {naoLidos > 0 && <button className="btn-ghost btn-sm text-[12px]" onClick={marcarTodos}><CheckCheck size={14} /> Marcar todos como lidos</button>}
          </div>
          <ul className="overflow-y-auto">
            {(q.data?.itens ?? []).map((a) => (
              <li key={a.id}>
                <button className={`w-full text-left px-3 py-2 flex gap-2 hover:bg-surface-2 border-b border-line ${a.lido ? 'opacity-70' : ''}`} onClick={() => abrir(a)}>
                  {(() => { const i = ICONE_DO_AVISO[a.tipo] ?? ICONE_DO_AVISO.recebeu; return <i.Icone size={15} className={`shrink-0 mt-0.5 ${i.cor}`} aria-hidden />; })()}
                  <span className="min-w-0 flex-1">
                    <span className={`block text-[13px] ${a.lido ? 'text-ink-2' : 'text-ink font-semibold'}`}>{a.texto}</span>
                    {a.chamado && <span className="block text-[12px] text-muted truncate"><span className="font-mono">{a.chamado.codigo}</span> · {a.chamado.titulo}</span>}
                    {segundaLinhaDoAviso(a) && <span className="block text-[12px] text-muted truncate">{segundaLinhaDoAviso(a)}</span>}
                    <span className="block text-[11.5px] text-muted">{haQuanto(a.em)}</span>
                  </span>
                  {!a.lido && <span className="w-2 h-2 rounded-full bg-accent mt-1.5 shrink-0" aria-label="não lido" role="img" />}
                </button>
              </li>
            ))}
            {!q.data?.itens.length && <li className="px-3 py-6 text-center text-muted text-[13px]">Nenhum aviso por enquanto.</li>}
          </ul>
          <AlemDoSininho onTestar={() => setAberto(false)} />
        </div>
      )}
    </div>
  );
}

/**
 * Além do sininho: o cartão na tela (ligado de saída) e a notificação do navegador (a pessoa liga, e o
 * navegador pergunta se pode). Vale para este navegador.
 */
function AlemDoSininho({ onTestar }: { onTestar: () => void }) {
  const como = useComoAvisar();
  const [dica, setDica] = useState<{ ruim: boolean; texto: string } | null>(null);
  const permissao = permissaoDoNavegador();
  const navegadorLigado = como.navegador && permissao === 'granted';

  const ligarNavegador = async (ligar: boolean) => {
    setDica(null);
    if (!ligar) { mudarComoAvisar({ navegador: false }); return; }
    if (permissao === 'sem') { setDica({ ruim: true, texto: 'Este navegador não mostra notificações. O cartão na tela continua.' }); return; }
    let p = permissao;
    if (p === 'default' && !dentroDeOutraPagina()) p = await Notification.requestPermission().catch(() => 'denied' as const);
    if (p === 'granted') { mudarComoAvisar({ navegador: true }); setDica({ ruim: false, texto: 'Ligada. Aparece quando o Gestor não está na frente (outra aba, minimizado).' }); return; }
    setDica({
      ruim: true,
      texto: dentroDeOutraPagina()
        ? 'Dentro de outra página (como a prévia) o navegador não deixa pedir a permissão. No Gestor, aberto na própria aba, funciona.'
        : 'O navegador está bloqueando as notificações do Gestor. Libere no cadeado ao lado do endereço e ligue de novo.',
    });
  };
  // o sininho fecha, para o cartão de teste aparecer inteiro (ele mesmo conta como foi a notificação)
  const testar = () => { setDica(null); testarOAviso(); onTestar(); };

  return (
    <div className="border-t border-line px-3 py-2.5 space-y-2 bg-surface-2/40">
      <div className="eyebrow">Além do sininho</div>
      <label className="flex items-center gap-3 cursor-pointer">
        <span className="min-w-0 flex-1">
          <span className="block text-[13px] font-semibold text-ink">Cartão na tela</span>
          <span className="block text-[12px] text-muted">No canto, até você abrir ou fechar</span>
        </span>
        <Interruptor ligado={como.tela} onChange={(v) => mudarComoAvisar({ tela: v })} rotulo="Cartão na tela" />
      </label>
      <label className="flex items-center gap-3 cursor-pointer">
        <span className="min-w-0 flex-1">
          <span className="block text-[13px] font-semibold text-ink">Notificação do navegador</span>
          <span className="block text-[12px] text-muted">Mesmo com o Gestor em outra aba ou minimizado</span>
        </span>
        <Interruptor ligado={navegadorLigado} onChange={(v) => void ligarNavegador(v)} rotulo="Notificação do navegador" />
      </label>
      {como.navegador && permissao === 'denied' && !dica && <p className="text-[12px] text-signal">O navegador passou a bloquear as notificações do Gestor: libere no cadeado ao lado do endereço.</p>}
      {dica && <p className={`text-[12px] ${dica.ruim ? 'text-signal' : 'text-ok'}`} role="status">{dica.texto}</p>}
      <button type="button" className="btn-secondary btn-sm" onClick={testar}><BellRing size={14} /> Testar o aviso</button>
    </div>
  );
}
