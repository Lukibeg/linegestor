/**
 * O Comercial no menu (2.0.1, 19/10, o Luan: "uma aba lateral só para o comercial… com acesso direto ao
 * painel do comercial e aos relatórios do comercial… tem q ter um nível de permissão"): o Painel do Comercial
 * (até o 2.0.1, Negociações) abre o quadro do painel de Vendas e o Relatórios, o relatório dele — o painel
 * aberto por último (lembrado neste navegador) ou o primeiro de Vendas que a pessoa vê. A permissão (`sales.read`) quem confere é o
 * servidor: sem ela, a lista de painéis não traz nenhum de Vendas.
 */
import { Link, Navigate } from 'react-router-dom';
import { Carregando, Vazio, mensagemErro } from '../../components/ui/index.js';
import { useAuth } from '../../lib/auth.js';
import { painelLembradoDoComercial } from '../../lib/comercial.js';
import { useOpcoes, usePode } from './comum.js';

export function IrParaOComercial({ parte }: { parte: 'quadro' | 'relatorio' }) {
  const { can } = useAuth();
  const pode = usePode();
  const comercial = can('sales.read');
  const opcoes = useOpcoes();
  if (!comercial) {
    return <Vazio titulo="O Comercial é de quem tem a permissão dele" texto='Peça à administração o papel Comercial (ou a permissão "Ver o Comercial" no seu papel).' />;
  }
  if (opcoes.isLoading) return <Carregando />;
  if (opcoes.isError) return <div className="text-bad text-sm">{mensagemErro(opcoes.error)}</div>;
  const vendas = (opcoes.data?.paineis ?? []).filter((p) => p.tipo === 'vendas' && p.ativo);
  const lembrado = painelLembradoDoComercial();
  const painel = vendas.find((p) => p.id === lembrado) ?? vendas[0];
  if (!painel) {
    return (
      <Vazio titulo="Nenhum painel de Vendas para você"
        texto={pode.cuidar
          ? 'Crie um em Painéis › Ajustes › Painéis › Novo painel, escolhendo Negociações (Vendas), e diga quem vê.'
          : 'Quem cuida dos painéis cria o painel de Vendas e diz quem vê. Fale com a administração.'}
        acao={pode.cuidar ? <Link className="btn-secondary" to="/atendimento/ajustes">Abrir os Ajustes</Link> : undefined} />
    );
  }
  return <Navigate replace to={`/atendimento/${parte}?painel=${encodeURIComponent(painel.id)}`} />;
}
