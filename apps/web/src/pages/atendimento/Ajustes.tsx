/**
 * Chamados › Ajustes (Patch 1.10): o que a administração arruma no módulo. Cada parte numa aba
 * (o endereço guarda a aba: ?aba=assuntos). Painéis, assuntos, prazos, avisos, respostas prontas e
 * agendados são de quem cuida dos chamados; as integrações, da administração do sistema.
 */
import { useSearchParams } from 'react-router-dom';
import { Abas, Vazio } from '../../components/ui/index.js';
import { CabecalhoAtendimento, usePode } from './comum.js';
import { AjustesPaineis } from './ajustes/Paineis.js';
import { AjustesAssuntos } from './ajustes/Assuntos.js';
import { AjustesPrazos } from './ajustes/Prazos.js';
import { AjustesAvisos } from './ajustes/Avisos.js';
import { AjustesRespostas } from './ajustes/Respostas.js';
import { AjustesAgendados } from './ajustes/Agendados.js';
import { AjustesIntegracoes } from './ajustes/Integracoes.js';

type Aba = 'paineis' | 'assuntos' | 'prazos' | 'avisos' | 'respostas' | 'agendados' | 'integracoes';

export function AjustesAtendimento() {
  const pode = usePode();
  const [sp, setSp] = useSearchParams();
  const abas: Array<{ id: Aba; label: string }> = [
    ...(pode.cuidar ? [
      { id: 'paineis' as const, label: 'Painéis e etapas' }, { id: 'assuntos' as const, label: 'Assuntos' }, { id: 'prazos' as const, label: 'Prazos' },
      { id: 'avisos' as const, label: 'Avisos e WhatsApp' }, { id: 'respostas' as const, label: 'Respostas prontas' }, { id: 'agendados' as const, label: 'Agendados' },
    ] : []),
    ...(pode.integrar ? [{ id: 'integracoes' as const, label: 'Integrações' }] : []),
  ];
  const pedida = sp.get('aba') as Aba | null;
  const atual = abas.find((a) => a.id === pedida)?.id ?? abas[0]?.id;
  return (
    <div>
      <CabecalhoAtendimento sub="O que a administração arruma no módulo: vale para a equipe toda." />
      {!atual ? <Vazio titulo="Nada para ajustar" texto="Os ajustes dos chamados são de quem cuida dos chamados (e as integrações, da administração)." /> : (
        <>
          <Abas abas={abas} atual={atual} onChange={(a) => setSp((s) => { const n = new URLSearchParams(s); n.set('aba', a); return n; }, { replace: true })} />
          {atual === 'paineis' && <AjustesPaineis />}
          {atual === 'assuntos' && <AjustesAssuntos />}
          {atual === 'prazos' && <AjustesPrazos />}
          {atual === 'avisos' && <AjustesAvisos />}
          {atual === 'respostas' && <AjustesRespostas />}
          {atual === 'agendados' && <AjustesAgendados />}
          {atual === 'integracoes' && <AjustesIntegracoes />}
        </>
      )}
    </div>
  );
}
