/**
 * O Painel do Suporte no menu (2.0.2, 20/10, o Luan: "dentro de suporte vai ter o 'painel do suporte' já
 * apontando para o painel do suporte como um atalho, como fizemos no comercial"): abre o quadro do painel
 * Suporte — o que veio com o sistema (`painel-suporte`, a sigla SUP), mesmo que o nome dele mude. Quem não
 * vê esse painel (ou com ele desativado) vai para a tela dos Painéis.
 *
 * Os Relatórios do menu (2.1, decisão 0055) são o mesmo atalho para a vista Relatórios do painel Suporte;
 * os do Helena ficam no item Legado do Helena.
 *
 * O Painel da Implantação (2.3, o Luan: "eu quero q o painel de implantação tenha um botão dentro do menu suporte como o
 * painel do suporte"): o mesmo atalho, para o quadro do painel da implantação.
 */
import { Link, Navigate } from 'react-router-dom';
import type { Painel } from '@gestor/shared';
import { Carregando, Vazio, mensagemErro } from '../../components/ui/index.js';
import { useOpcoes } from './comum.js';
import { enderecoDoRelatorio } from './painel.js';

/** O painel do Suporte: o que o sistema cria na instalação (o seed e a prévia: `painel-<chave>`). */
export const PAINEL_DO_SUPORTE = 'painel-suporte';

export function IrParaOSuporte({ parte = 'quadro' }: { parte?: 'quadro' | 'relatorios' }) {
  const opcoes = useOpcoes();
  if (opcoes.isLoading) return <Carregando />;
  if (opcoes.isError) return <div className="text-bad text-sm">{mensagemErro(opcoes.error)}</div>;
  const painel = (opcoes.data?.paineis ?? []).find((p) => p.id === PAINEL_DO_SUPORTE && p.ativo);
  if (!painel) return <Navigate replace to="/atendimento" />;
  return <Navigate replace to={parte === 'relatorios' ? enderecoDoRelatorio(painel.id) : `/atendimento/quadro?painel=${encodeURIComponent(painel.id)}`} />;
}

/**
 * O painel da implantação: o de Gestão que a etapa do Comercial abre (Ao chegar aqui, abre a implantação); sem ela, o de
 * Gestão que tem a etapa que liga no cadastro (o Implantado). Só os ativos que a pessoa vê (os das opções).
 */
export function painelDaImplantacao(paineis: readonly Painel[]): Painel | null {
  const ativos = paineis.filter((p) => p.ativo);
  const abertos = new Set(ativos.filter((p) => p.tipo === 'vendas').flatMap((p) => p.etapas.map((e) => e.abreImplantacao ?? null)).filter((x): x is string => !!x));
  return ativos.find((p) => p.tipo === 'gestao' && abertos.has(p.id))
    ?? ativos.find((p) => p.tipo === 'gestao' && p.etapas.some((e) => e.ligaNoCadastro))
    ?? null;
}

export function IrParaAImplantacao() {
  const opcoes = useOpcoes();
  if (opcoes.isLoading) return <Carregando />;
  if (opcoes.isError) return <div className="text-bad text-sm">{mensagemErro(opcoes.error)}</div>;
  const painel = painelDaImplantacao(opcoes.data?.paineis ?? []);
  if (!painel) {
    return (
      <Vazio titulo="Nenhum painel da implantação para você"
        texto="Ou ele ainda não existe (quem cuida dos chamados cria em Painéis › Ajustes › Painéis e etapas › Novo painel › Implantação), ou você não está entre quem vê o painel."
        acao={<Link className="btn-secondary btn-sm" to="/atendimento">Ir para os Painéis</Link>} />
    );
  }
  return <Navigate replace to={`/atendimento/quadro?painel=${encodeURIComponent(painel.id)}`} />;
}
