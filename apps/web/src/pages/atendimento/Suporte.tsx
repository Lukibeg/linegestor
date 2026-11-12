/**
 * O Painel do Suporte no menu (2.0.2, 20/10, o Luan: "dentro de suporte vai ter o 'painel do suporte' já
 * apontando para o painel do suporte como um atalho, como fizemos no comercial"): abre o quadro do painel
 * Suporte — o que veio com o sistema (`painel-suporte`, a sigla SUP), mesmo que o nome dele mude. Quem não
 * vê esse painel (ou com ele desativado) vai para a tela dos Painéis.
 *
 * Os Relatórios do menu (2.1, decisão 0055) são o mesmo atalho para a vista Relatórios do painel Suporte;
 * os do Helena ficam no Legado do Helena (até o 2.4.6, um item do menu; agora, o botão no alto dos Relatórios do Suporte).
 *
 * O Painel da Implantação (2.3, o Luan: "eu quero q o painel de implantação tenha um botão dentro do menu suporte como o
 * painel do suporte"): o mesmo atalho, para o quadro do painel da implantação.
 *
 * O Painel do Dev (2.4.6, o Luan: "faça um botão dentro do inglinegestao para o painel do dev, dentro do menu suporte
 * mesmo"): o mesmo atalho, para o quadro do painel Desenvolvimento.
 *
 * O Meu painel (2.4.7, o Luan: "quero que apareça ali acima de painel de suporte, dentro da aba suporte - meu painel e cada um
 * já vai ter acesso por ali"): o mesmo atalho, para o quadro do painel pessoal de quem está logado.
 */
import { Link, Navigate } from 'react-router-dom';
import type { Painel } from '@gestor/shared';
import { Carregando, Vazio, mensagemErro } from '../../components/ui/index.js';
import { useAuth } from '../../lib/auth.js';
import { useOpcoes } from './comum.js';
import { enderecoDoRelatorio } from './painel.js';

/** O painel do Suporte: o que o sistema cria na instalação (o seed e a prévia: `painel-<chave>`). */
export const PAINEL_DO_SUPORTE = 'painel-suporte';
/** O painel do Desenvolvimento (a sigla DEV): o outro que o sistema cria na instalação (a migração 0015, o seed e a prévia). */
export const PAINEL_DO_DESENVOLVIMENTO = 'painel-desenvolvimento';

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

/**
 * O painel do Desenvolvimento: o que veio com o sistema, mesmo que o nome dele mude (como o do Suporte). Só o ativo que a
 * pessoa vê (os das opções).
 */
export function painelDoDesenvolvimento(paineis: readonly Painel[]): Painel | null {
  return paineis.find((p) => p.id === PAINEL_DO_DESENVOLVIMENTO && p.ativo) ?? null;
}

export function IrParaODesenvolvimento() {
  const opcoes = useOpcoes();
  if (opcoes.isLoading) return <Carregando />;
  if (opcoes.isError) return <div className="text-bad text-sm">{mensagemErro(opcoes.error)}</div>;
  const painel = painelDoDesenvolvimento(opcoes.data?.paineis ?? []);
  if (!painel) {
    return (
      <Vazio titulo="O painel do Desenvolvimento não está aberto para você"
        texto="Ou ele está desativado (quem cuida dos chamados liga de novo em Painéis › Ajustes › Painéis e etapas), ou você não está entre quem vê o painel."
        acao={<Link className="btn-secondary btn-sm" to="/atendimento">Ir para os Painéis</Link>} />
    );
  }
  return <Navigate replace to={`/atendimento/quadro?painel=${encodeURIComponent(painel.id)}`} />;
}

/** O painel pessoal de quem está logado (2.4.7): o de Gestão que é dele (o donoId), ativo. O administrador vê os dos outros, mas o "meu" é o dele. */
export function meuPainel(paineis: readonly Painel[], eu: string | null | undefined): Painel | null {
  return eu ? paineis.find((p) => p.donoId === eu && p.ativo) ?? null : null;
}

export function IrParaOMeuPainel() {
  const opcoes = useOpcoes();
  const { user } = useAuth();
  if (opcoes.isLoading) return <Carregando />;
  if (opcoes.isError) return <div className="text-bad text-sm">{mensagemErro(opcoes.error)}</div>;
  const painel = meuPainel(opcoes.data?.paineis ?? [], user?.id);
  if (!painel) {
    return (
      <Vazio titulo="O seu painel pessoal não está aberto"
        texto="Ou ele está desativado (ligue de novo em Painéis: o Configurar dele, Painel ativo), ou o seu perfil não trabalha nos chamados."
        acao={<Link className="btn-secondary btn-sm" to="/atendimento">Ir para os Painéis</Link>} />
    );
  }
  return <Navigate replace to={`/atendimento/quadro?painel=${encodeURIComponent(painel.id)}`} />;
}
