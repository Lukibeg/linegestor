/**
 * O Painel do Suporte no menu (2.0.2, 20/10, o Luan: "dentro de suporte vai ter o 'painel do suporte' já
 * apontando para o painel do suporte como um atalho, como fizemos no comercial"): abre o quadro do painel
 * Suporte — o que veio com o sistema (`painel-suporte`, a sigla SUP), mesmo que o nome dele mude. Quem não
 * vê esse painel (ou com ele desativado) vai para a tela dos Painéis.
 */
import { Navigate } from 'react-router-dom';
import { Carregando, mensagemErro } from '../../components/ui/index.js';
import { useOpcoes } from './comum.js';

/** O painel do Suporte: o que o sistema cria na instalação (o seed e a prévia: `painel-<chave>`). */
export const PAINEL_DO_SUPORTE = 'painel-suporte';

export function IrParaOSuporte() {
  const opcoes = useOpcoes();
  if (opcoes.isLoading) return <Carregando />;
  if (opcoes.isError) return <div className="text-bad text-sm">{mensagemErro(opcoes.error)}</div>;
  const painel = (opcoes.data?.paineis ?? []).find((p) => p.id === PAINEL_DO_SUPORTE && p.ativo);
  return <Navigate replace to={painel ? `/atendimento/quadro?painel=${encodeURIComponent(painel.id)}` : '/atendimento'} />;
}
