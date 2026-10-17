/**
 * Painéis › Ajustes › IA (Patch 2.0): onde se escolhe o provedor e se cola a chave do "Preencher com
 * IA" da ficha — o pedido do Luan ("em configurações, para eu definir a chave da API e o provedor").
 *
 * É a MESMA IA da Base de conhecimento (o mesmo cartão de Administração › Ajustes): uma chave só, um
 * provedor só e o uso do mês contado junto. Duas configurações dariam duas contas para pagar e duas
 * chaves para trocar.
 */
import { useQuery } from '@tanstack/react-query';
import { api } from '../../../api/index.js';
import { Carregando, mensagemErro } from '../../../components/ui/index.js';
import { CartaoIa } from '../../admin/Ajustes.js';

export function AjustesIa() {
  const ia = useQuery({ queryKey: ['base', 'ia', 'ajustes'], queryFn: () => api.base.iaAjustes() });
  if (ia.isLoading) return <Carregando />;
  if (ia.isError) return <p className="text-bad text-sm" role="alert">{mensagemErro(ia.error)}</p>;
  return (
    <div className="flex flex-col gap-3 max-w-3xl">
      <p className="text-[13.5px] text-ink-2">
        O botão <b>Preencher com IA</b> da ficha do chamado usa esta IA. É a mesma da Base de conhecimento (e do cartão em
        Administração › Ajustes): mudar aqui muda lá.
      </p>
      <CartaoIa inicial={ia.data!} />
    </div>
  );
}
