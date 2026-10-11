/**
 * Os textos do chamado, cada um no seu lugar (o pedido da equipe): o "Relato do cliente" (o que ele
 * disse, nas palavras dele), a "Descrição" (o andamento e os dados técnicos), a "Solução" e a "Causa".
 * No problema (ITIL): a causa raiz, a solução de contorno, a solução e a validação.
 *
 * Cada um se edita no lugar (Editar abre a caixa; Salvar grava). Os códigos citados no texto viram
 * link (SUP-3 abre a ficha; IS-4280 abre o card antigo no LineChat). O que a próxima etapa pede e
 * está vazio fica destacado, e o aviso em cima diz tudo o que falta.
 */
import { useState } from 'react';
import { CircleAlert, Pencil } from 'lucide-react';
import { NOME_CAMPO, type ChamadoAlterarEntrada } from '@gestor/shared';
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
  const el = document.getElementById(ALVO_DO_CAMPO[campo] ?? '');
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
  const { f, pode, proxima } = useAberta();
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
                <button type="button" className="font-semibold underline decoration-dotted underline-offset-2 hover:text-signal" onClick={() => irParaOCampo(x)}>{NOME_CAMPO[x]}</button>
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
  const { f } = useAberta();
  const blocos = f.tipoChamado === 'problema' ? DO_PROBLEMA : DO_CHAMADO;
  return (
    <section className="card p-4 flex flex-col divide-y divide-line min-w-0" aria-label="Os textos do chamado">
      {blocos.map((b) => <BlocoDeTexto key={b.campo} b={b} />)}
    </section>
  );
}

function BlocoDeTexto({ b }: { b: Bloco }) {
  const { f, pode, faltando } = useAberta();
  const valor = f[b.campo] ?? '';
  const [editando, setEditando] = useState(false);
  const [texto, setTexto] = useState('');
  const acao = useAcao();
  const falta = faltando.has(b.campo);

  const abrir = () => { setTexto(valor); acao.limpar(); setEditando(true); };
  const desistir = () => { setEditando(false); acao.limpar(); };
  const salvar = async () => {
    if (texto.trim() === valor.trim()) { desistir(); return; }
    const d = { [b.campo]: texto.trim() ? texto : null } as ChamadoAlterarEntrada;
    const r = await acao.rodar(() => api.atendimento.alterar(f.id, d), `${b.titulo}: salvo`);
    if (r.ok) setEditando(false);
  };
  const linhas = Math.min(18, Math.max(4, texto.split('\n').length + 1));

  return (
    <div id={`campo-${b.campo}`} className="py-3.5 first:pt-0 last:pb-0 min-w-0 rounded-sm scroll-mt-24 transition-shadow">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mb-1.5">
        <h3 className="font-display font-semibold text-[14.5px]">{b.titulo}</h3>
        <span className="text-[12px] text-muted">{b.dica}</span>
        <MarcaFalta campo={b.campo} />
        {pode && !editando && (
          <button type="button" className="btn-ghost btn-sm ml-auto -my-1" onClick={abrir} aria-label={`${valor ? 'Editar' : 'Escrever'}: ${b.titulo}`}>
            <Pencil size={13} /> {valor ? 'Editar' : 'Escrever'}
          </button>
        )}
      </div>
      {editando ? (
        <div>
          <textarea className="input text-[14px] leading-relaxed" rows={linhas} autoFocus maxLength={b.max} value={texto} placeholder={b.exemplo}
            aria-label={b.titulo} onChange={(e) => setTexto(e.target.value)}
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
