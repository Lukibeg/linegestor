/**
 * Os textos do chamado, cada um no seu lugar (o pedido da equipe): o "Relato do cliente" (o que ele
 * disse, nas palavras dele), a "Descrição" (o andamento e os dados técnicos), a "Solução" e a "Causa".
 * No problema (ITIL): a causa raiz, a solução de contorno, a solução e a validação.
 *
 * Cada um se edita no lugar (Editar abre a caixa; Salvar grava). Os códigos citados no texto viram
 * link (SUP-3 abre a ficha; IS-4280 abre o card antigo no LineChat). O que a próxima etapa pede e
 * está vazio fica destacado, e o aviso em cima diz tudo o que falta. Os campos de texto longo que o
 * painel criou (Ajustes › Campos) entram aqui, depois dos do chamado.
 */
import { useState } from 'react';
import { CircleAlert, Pencil } from 'lucide-react';
import { campoAparece, campoLigado, chaveDoCampo, idDaChave, MAX_LETRAS_DO_CAMPO, nomeDoObrigatorio, type CampoPersonalizado, type ChamadoAlterarEntrada } from '@gestor/shared';
import { api } from '../../../api/index.js';
import { Spinner } from '../../../components/ui/index.js';
import { ErroPerto, MarcaFalta, TextoComReferencias, useAberta, useAcao } from './base.js';

type CampoTexto = 'relato' | 'descricao' | 'solucao' | 'causa' | 'contorno' | 'validacao';
type Bloco = { campo: CampoTexto; titulo: string; dica: string; max: number; exemplo: string };

const DO_CHAMADO: Bloco[] = [
  { campo: 'relato', titulo: 'Relato do cliente', dica: 'o que ele disse, nas palavras dele', max: 20_000, exemplo: 'Ex.: "Desde as 9h nenhuma ligação para fora completa, dá ocupado."' },
  { campo: 'descricao', titulo: 'Descrição', dica: 'o andamento e os dados técnicos (ramal, número, IP, horário)', max: 20_000, exemplo: 'Ex.: testado o ramal 203 no SBC; registro OK; o problema está na rota de saída da VC1.' },
  { campo: 'solucao', titulo: 'Solução', dica: 'o que resolveu', max: 20_000, exemplo: 'Ex.: ajustada a rota de saída para o tronco 2 e testado com o cliente.' },
  { campo: 'causa', titulo: 'Causa', dica: 'por que aconteceu', max: 5_000, exemplo: 'Ex.: a operadora mudou o IP do SBC sem avisar.' },
];
/** A negociação (o painel de Vendas): a descrição é "Sobre a negociação"; o relato só aparece se chegou (o robô). */
const DA_NEGOCIACAO: Bloco[] = [
  { campo: 'descricao', titulo: 'Sobre a negociação', dica: 'o que o cliente precisa, quem decide, a concorrência', max: 20_000, exemplo: 'Ex.: três lojas e a fábrica; querem o mesmo número para todas e a fila do delivery. Quem decide é o sócio.' },
];
const DO_PROBLEMA: Bloco[] = [
  { campo: 'relato', titulo: 'Relato', dica: 'o que chegou dos clientes', max: 20_000, exemplo: 'Ex.: três clientes da Algar em Salvador sem receber ligação desde as 14h.' },
  { campo: 'descricao', titulo: 'Descrição', dica: 'o andamento e os dados técnicos', max: 20_000, exemplo: 'Ex.: todos no mesmo POP da Algar; protocolo 2026101099871.' },
  { campo: 'causa', titulo: 'Causa raiz', dica: 'o que está por trás dos incidentes', max: 5_000, exemplo: 'Ex.: falha no equipamento da Algar no POP de Salvador.' },
  { campo: 'contorno', titulo: 'Solução de contorno', dica: 'o que fazer enquanto a solução definitiva não vem', max: 10_000, exemplo: 'Ex.: desviar as entradas para o tronco da VC1.' },
  { campo: 'solucao', titulo: 'Solução', dica: 'a solução definitiva', max: 20_000, exemplo: 'Ex.: a Algar trocou o equipamento e normalizou as rotas.' },
  { campo: 'validacao', titulo: 'Validação', dica: 'como foi confirmado que resolveu', max: 5_000, exemplo: 'Ex.: testadas entradas nos três clientes por 24 h, sem queda.' },
];

/** Para onde o aviso "falta" leva quando se clica no nome do campo. */
export const ALVO_DO_CAMPO: Record<string, string> = {
  relato: 'campo-relato', descricao: 'campo-descricao', solucao: 'campo-solucao', causa: 'campo-causa', validacao: 'campo-validacao',
  cliente: 'campo-cliente', contato: 'campo-contato', assunto: 'campo-assunto', tipo: 'campo-tipo', gravidade: 'campo-gravidade', alcance: 'campo-alcance',
  prioridade: 'campo-prioridade', produto: 'campo-produtos', operadora: 'campo-operadoras', responsavel: 'campo-responsavel',
  checklist: 'campo-checklist', tempo: 'campo-tempo',
};

export function irParaOCampo(campo: string) {
  // o campo do painel ("campo:<id>") mora em "campo-c-<id>"
  const id = idDaChave(campo);
  const el = document.getElementById(id ? `campo-c-${id}` : ALVO_DO_CAMPO[campo] ?? '');
  if (!el) return;
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  el.classList.add('ring-2', 'ring-signal');
  window.setTimeout(() => el.classList.remove('ring-2', 'ring-signal'), 1600);
}

/**
 * "Para ir para Resolvido, falta: Assunto, Solução e Causa." — cada nome leva ao campo. Os filhos em
 * aberto que travam a próxima etapa aparecem junto.
 */
export function AvisoDoQueFalta() {
  const { f, opcoes, pode, proxima } = useAberta();
  if (!pode || !proxima) return null;
  const faltam = f.faltam[proxima.id] ?? [];
  const filhos = f.filhosTravam[proxima.id] ?? [];
  if (!faltam.length && !filhos.length) return null;
  return (
    <div className="card border-signal bg-signal-soft px-4 py-3 text-[13.5px] flex items-start gap-2">
      <CircleAlert size={16} className="text-signal shrink-0 mt-0.5" aria-hidden />
      <div className="min-w-0">
        {faltam.length > 0 && (
          <p>
            Para ir para <b>{proxima.nome}</b>, falta preencher:{' '}
            {faltam.map((x, i) => (
              <span key={x}>
                {i > 0 && (i === faltam.length - 1 ? ' e ' : ', ')}
                <button type="button" className="font-semibold underline decoration-dotted underline-offset-2 hover:text-signal" onClick={() => irParaOCampo(x)}>{nomeDoObrigatorio(x, opcoes.campos)}</button>
              </span>
            ))}.
          </p>
        )}
        {filhos.length > 0 && <p className={faltam.length ? 'mt-1' : ''}>Os filhos em aberto precisam fechar antes: <span className="font-mono font-semibold">{filhos.join(', ')}</span>.</p>}
      </div>
    </div>
  );
}

export function Textos() {
  const { f, opcoes, painel } = useAberta();
  const blocos = painel?.tipo === 'vendas'
    ? [...(f.relato ? [{ ...DO_CHAMADO[0]!, titulo: 'O que o cliente pediu', dica: 'como chegou (o robô, a conversa)' }] : []), ...DA_NEGOCIACAO]
    : f.tipoChamado === 'problema' ? DO_PROBLEMA
      // o painel que não usa o relato, a solução e a causa (2.1.2): eles saem da ficha (o problema continua com os dele)
      : DO_CHAMADO.filter((b) => !painel || ((b.campo !== 'relato' || campoLigado(painel.ajustes, 'relato')) && ((b.campo !== 'solucao' && b.campo !== 'causa') || campoLigado(painel.ajustes, 'solucao'))));
  // os campos de texto longo do painel (os ativos), na ordem dos Ajustes — os de uma parte (2.3) ficam nas partes, e o de um
  // produto só aparece no chamado que tem o produto
  const produtos = f.produtos.map((p) => p.id);
  const longos = opcoes.campos.filter((c) => c.painelId === f.painelId && !c.parte && campoAparece(c, produtos) && c.tipo === 'texto_longo');
  return (
    <section className="card p-4 flex flex-col divide-y divide-line min-w-0" aria-label="Os textos do chamado">
      {blocos.map((b) => <BlocoDeTexto key={b.campo} b={b} />)}
      {longos.map((c) => <BlocoDoCampo key={c.id} c={c} />)}
    </section>
  );
}

function BlocoDeTexto({ b }: { b: Bloco }) {
  const { f } = useAberta();
  return (
    <TextoEditavel id={`campo-${b.campo}`} chave={b.campo} titulo={b.titulo} dica={b.dica} max={b.max} exemplo={b.exemplo} valor={f[b.campo] ?? ''}
      dados={(texto) => ({ [b.campo]: texto.trim() ? texto : null }) as ChamadoAlterarEntrada} />
  );
}

/** Um campo de texto longo do painel (a "Passos para reproduzir" do Desenvolvimento, por exemplo). */
export function BlocoDoCampo({ c }: { c: CampoPersonalizado }) {
  const { f } = useAberta();
  const v = f.campos[c.id];
  return (
    <TextoEditavel id={`campo-c-${c.id}`} chave={chaveDoCampo(c.id)} titulo={c.nome} dica={c.dica ?? ''} max={MAX_LETRAS_DO_CAMPO.texto_longo} exemplo=""
      valor={typeof v === 'string' ? v : ''} dados={(texto) => ({ campos: { [c.id]: texto.trim() ? texto : null } })} />
  );
}

function TextoEditavel({ id, chave, titulo, dica, max, exemplo, valor, dados }: {
  id: string;
  /** a chave do que falta ("solucao", "campo:<id>") */
  chave: string;
  titulo: string; dica: string; max: number; exemplo: string; valor: string;
  dados: (texto: string) => ChamadoAlterarEntrada;
}) {
  const { f, pode, faltando } = useAberta();
  const [editando, setEditando] = useState(false);
  const [texto, setTexto] = useState('');
  const acao = useAcao();
  const falta = faltando.has(chave);

  const abrir = () => { setTexto(valor); acao.limpar(); setEditando(true); };
  const desistir = () => { setEditando(false); acao.limpar(); };
  const salvar = async () => {
    if (texto.trim() === valor.trim()) { desistir(); return; }
    const r = await acao.rodar(() => api.atendimento.alterar(f.id, dados(texto)), `${titulo}: salvo`);
    if (r.ok) setEditando(false);
  };
  const linhas = Math.min(18, Math.max(4, texto.split('\n').length + 1));

  return (
    <div id={id} className="py-3.5 first:pt-0 last:pb-0 min-w-0 rounded-sm scroll-mt-24 transition-shadow">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mb-1.5">
        <h3 className="font-display font-semibold text-[14.5px]">{titulo}</h3>
        {dica && <span className="text-[12px] text-muted">{dica}</span>}
        <MarcaFalta campo={chave} />
        {pode && !editando && (
          <button type="button" className="btn-ghost btn-sm ml-auto -my-1" onClick={abrir} aria-label={`${valor ? 'Editar' : 'Escrever'}: ${titulo}`}>
            <Pencil size={13} /> {valor ? 'Editar' : 'Escrever'}
          </button>
        )}
      </div>
      {editando ? (
        <div>
          <textarea className="input text-[14px] leading-relaxed" rows={linhas} autoFocus maxLength={max} value={texto} placeholder={exemplo || undefined}
            aria-label={titulo} onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); void salvar(); }
              // Esc só desiste quando nada mudou: não se perde um texto escrito por engano
              else if (e.key === 'Escape' && texto === valor) { e.preventDefault(); desistir(); }
            }} />
          <div className="flex flex-wrap items-center gap-2 mt-2">
            <button type="button" className="btn-primary btn-sm" disabled={acao.ocupado} onClick={() => void salvar()}>{acao.ocupado ? <Spinner className="text-white" /> : 'Salvar'}</button>
            <button type="button" className="btn-secondary btn-sm" onClick={desistir}>Cancelar</button>
            <span className="text-[11.5px] text-muted ml-auto">Ctrl+Enter salva · os códigos (SUP-12) viram link</span>
          </div>
          <ErroPerto erro={acao.erro} />
        </div>
      ) : valor.trim() ? (
        <TextoComReferencias texto={valor} className="block text-[14.5px] leading-relaxed text-ink" />
      ) : falta && pode ? (
        <button type="button" onClick={abrir} className="w-full text-left rounded-lg border border-dashed border-signal px-3 py-2 text-[13px] text-signal hover:bg-signal-soft">
          Ainda vazio — clique para escrever.
        </button>
      ) : (
        <p className="text-[13px] text-muted italic">Ainda não escrito.</p>
      )}
    </div>
  );
}
