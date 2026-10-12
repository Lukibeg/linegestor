/**
 * Chamados › Ajustes (Patch 1.10): o que a administração arruma no módulo. Cada parte numa aba
 * (o endereço guarda a aba: ?aba=campos). Painéis, campos (os do sistema, a árvore de assuntos e os que a
 * equipe cria em cada painel), etiquetas (a cor de cada uma), prazos, avisos, respostas prontas e
 * agendados são de quem cuida dos chamados; as integrações e a IA (a mesma da Base de conhecimento), da
 * administração do sistema.
 */
import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Abas, Vazio } from '../../components/ui/index.js';
import { CabecalhoAtendimento, usePode } from './comum.js';
import { AjustesPaineis } from './ajustes/Paineis.js';
import { AjustesCampos } from './ajustes/Campos.js';
import { AjustesEtiquetas } from './ajustes/Etiquetas.js';
import { AjustesPrazos } from './ajustes/Prazos.js';
import { AjustesAvisos } from './ajustes/Avisos.js';
import { AjustesRespostas } from './ajustes/Respostas.js';
import { AjustesAgendados } from './ajustes/Agendados.js';
import { AjustesIntegracoes } from './ajustes/Integracoes.js';
import { AjustesIa } from './ajustes/Ia.js';

type Aba = 'paineis' | 'campos' | 'etiquetas' | 'prazos' | 'avisos' | 'respostas' | 'agendados' | 'integracoes' | 'ia';

export function AjustesAtendimento() {
  const pode = usePode();
  const [sp, setSp] = useSearchParams();
  const abas: Array<{ id: Aba; label: string }> = [
    ...(pode.cuidar ? [
      { id: 'paineis' as const, label: 'Painéis e etapas' }, { id: 'campos' as const, label: 'Campos' }, { id: 'etiquetas' as const, label: 'Etiquetas' },
      { id: 'prazos' as const, label: 'Prazos' },
      { id: 'avisos' as const, label: 'Avisos e WhatsApp' }, { id: 'respostas' as const, label: 'Respostas prontas' }, { id: 'agendados' as const, label: 'Agendados' },
    ] : []),
    ...(pode.integrar ? [{ id: 'integracoes' as const, label: 'Integrações' }, { id: 'ia' as const, label: 'IA' }] : []),
  ];
  // o endereço antigo da árvore de assuntos (?aba=assuntos) abre a árvore dentro da aba Campos
  const pedida = (sp.get('aba') === 'assuntos' ? 'campos' : sp.get('aba')) as Aba | null;
  const atual = abas.find((a) => a.id === pedida)?.id ?? abas[0]?.id;
  useEffect(() => {
    if (sp.get('aba') !== 'assuntos') return;
    setSp((s) => { const n = new URLSearchParams(s); n.set('aba', 'campos'); n.set('ver', 'assuntos'); return n; }, { replace: true });
  }, [sp, setSp]);
  return (
    <div>
      <CabecalhoAtendimento />
      {!atual ? <Vazio titulo="Nada para ajustar" texto="Os ajustes dos chamados são de quem cuida dos chamados (e as integrações, da administração)." /> : (
        <>
          <Abas abas={abas} atual={atual} onChange={(a) => setSp((s) => { const n = new URLSearchParams(s); n.set('aba', a); n.delete('ver'); return n; }, { replace: true })} />
          {atual === 'paineis' && <AjustesPaineis />}
          {atual === 'campos' && <AjustesCampos />}
          {atual === 'etiquetas' && <AjustesEtiquetas />}
          {atual === 'prazos' && <AjustesPrazos />}
          {atual === 'avisos' && <AjustesAvisos />}
          {atual === 'respostas' && <AjustesRespostas />}
          {atual === 'agendados' && <AjustesAgendados />}
          {atual === 'integracoes' && <AjustesIntegracoes />}
          {atual === 'ia' && <AjustesIa />}
        </>
      )}
    </div>
  );
}
