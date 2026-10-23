/**
 * Painéis › Ajustes › IA (Patch 2.0): onde se escolhe o provedor e se cola a chave do "Preencher com
 * IA" da ficha — o pedido do Luan ("em configurações, para eu definir a chave da API e o provedor").
 *
 * É a MESMA IA da Base de conhecimento (o mesmo cartão de Administração › Ajustes): uma chave só, um
 * provedor só e o uso do mês contado junto. Duas configurações dariam duas contas para pagar e duas
 * chaves para trocar.
 *
 * E a NIA (2.0.4.1): o botão da ficha que pede à IA do suporte (o fluxo do n8n) para preencher o chamado. Por
 * baixo, ele põe a etiqueta de pedir — o combinado com o fluxo —, e a ficha diz se ela já preencheu pela etiqueta de
 * pronto ou de erro. Aqui se liga e desliga o botão e se escrevem as três etiquetas (as do fluxo de vocês).
 */
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Bot } from 'lucide-react';
import { AjustesDaNiaSchema, NIA_PADRAO, type AjustesDaNia } from '@gestor/shared';
import { api } from '../../../api/index.js';
import { Campo, Carregando, Chip, Spinner, mensagemErro, useToast } from '../../../components/ui/index.js';
import { CartaoIa } from '../../admin/Ajustes.js';
import { CartaoAjuste, Explicacao, Interruptor, Resultado, erroLegivel } from './Avisos.js';

const CHAVE_NIA = ['atendimento', 'integracoes', 'nia'];

export function AjustesIa() {
  const ia = useQuery({ queryKey: ['base', 'ia', 'ajustes'], queryFn: () => api.base.iaAjustes() });
  const nia = useQuery({ queryKey: CHAVE_NIA, queryFn: () => api.atendimento.niaAjustes() });
  if (ia.isLoading || nia.isLoading) return <Carregando />;
  if (ia.isError) return <p className="text-bad text-sm" role="alert">{mensagemErro(ia.error)}</p>;
  return (
    <div className="flex flex-col gap-3 max-w-3xl">
      <p className="text-[13.5px] text-ink-2">
        O botão <b>Preencher com IA</b> da ficha do chamado usa esta IA. É a mesma da Base de conhecimento (e do cartão em
        Administração › Ajustes): mudar aqui muda lá.
      </p>
      <CartaoIa inicial={ia.data!} />
      {nia.isError ? <p className="text-bad text-sm" role="alert">{mensagemErro(nia.error)}</p> : <CartaoNia inicial={nia.data!} />}
    </div>
  );
}

function CartaoNia({ inicial }: { inicial: AjustesDaNia }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [f, setF] = useState<AjustesDaNia>(inicial);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const mudar = (o: Partial<AjustesDaNia>) => { setF((x) => ({ ...x, ...o })); setErro(null); };
  const mudou = JSON.stringify(f) !== JSON.stringify(inicial);
  const deFabrica = f.pedir === NIA_PADRAO.pedir && f.pronto === NIA_PADRAO.pronto && f.erro === NIA_PADRAO.erro;

  const salvar = async () => {
    const lido = AjustesDaNiaSchema.safeParse(f);
    if (!lido.success) { setErro(lido.error.issues[0]?.message ?? 'Confira as etiquetas.'); return; }
    setSalvando(true); setErro(null);
    try {
      const r = await api.atendimento.salvarNia(lido.data);
      qc.setQueryData(CHAVE_NIA, r);
      setF(r);
      // a ficha lê o botão das opções do módulo
      void qc.invalidateQueries({ queryKey: ['atendimento', 'opcoes'] });
      toast.push('ok', r.ligada ? 'Salvo: a ficha do chamado mostra o botão da NIA.' : 'Salvo: a ficha não mostra mais o botão da NIA.');
    } catch (e) { setErro(erroLegivel(e)); } finally { setSalvando(false); }
  };

  return (
    <CartaoAjuste id="ajustes-nia" icone={<Bot size={18} />} titulo="A NIA na ficha" ligado={inicial.ligada}
      situacao={inicial.ligada ? <Chip tone="ok">o botão aparece</Chip> : <Chip tone="muted">desligado</Chip>}
      acoes={<Interruptor ligado={f.ligada} onChange={(v) => mudar({ ligada: v })} rotulo={f.ligada ? 'Desligar o botão da NIA' : 'Ligar o botão da NIA'} />}>
      <Explicacao>
        <p>
          O botão <b>Preencher com a NIA</b> da ficha pede à NIA (o fluxo de vocês no n8n) para preencher o chamado: ele põe a
          etiqueta de pedir, como a equipe fazia à mão — o fluxo não muda. Depois, o botão diz se ela já preencheu (a etiqueta de
          pronto) ou se não conseguiu (a de erro), com a data e o que ela mudou.
        </p>
        <p>As etiquetas precisam ser as mesmas que o fluxo da NIA usa. Na negociação (o painel de Vendas), o botão não aparece.</p>
      </Explicacao>
      <form autoComplete="off" className="flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); void salvar(); }}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Campo label="Pedir (o botão põe)"><input className="input" id="nia-etiqueta-pedir" maxLength={40} value={f.pedir} onChange={(e) => mudar({ pedir: e.target.value })} /></Campo>
          <Campo label="Pronto (a NIA põe)"><input className="input" id="nia-etiqueta-pronto" maxLength={40} value={f.pronto} onChange={(e) => mudar({ pronto: e.target.value })} /></Campo>
          <Campo label="Erro (a NIA põe)"><input className="input" id="nia-etiqueta-erro" maxLength={40} value={f.erro} onChange={(e) => mudar({ erro: e.target.value })} /></Campo>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="submit" className="btn-primary" id="nia-salvar" disabled={salvando || !mudou}>{salvando ? <Spinner className="text-white" /> : 'Salvar'}</button>
          {!deFabrica && (
            <button type="button" className="btn-ghost btn-sm" onClick={() => mudar({ pedir: NIA_PADRAO.pedir, pronto: NIA_PADRAO.pronto, erro: NIA_PADRAO.erro })}>
              Voltar às do Helena
            </button>
          )}
          {mudou && <span className="text-[12.5px] text-signal">há mudanças sem salvar</span>}
        </div>
        <Resultado r={erro ? { ok: false, mensagem: erro } : null} className="mt-0" />
      </form>
    </CartaoAjuste>
  );
}
