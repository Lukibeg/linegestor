/**
 * "Preencher com IA" (a NIA de hoje, dentro do Gestor): a IA leu a conversa do cliente no LineChat
 * (ou, sem ela, o próprio chamado) e sugeriu o preenchimento. Aqui a pessoa confere campo a campo — o
 * que está agora e o que a IA sugeriu —, marca o que quer e aplica: um PATCH só com os marcados.
 * Nada é gravado sem a pessoa aplicar. As listas (produtos, etiquetas) juntam aos que já estão.
 */
import { useMemo, useState, type ReactNode } from 'react';
import { BookOpenText, MessagesSquare, Sparkles } from 'lucide-react';
import {
  caminhoDoAssunto, campoLigado, etiquetasUnicas, NOME_ALCANCE, NOME_GRAVIDADE, NOME_PRIORIDADE, prioridadeSugeridaDoPainel,
  type CampoDoSistema, type ChamadoAlterarEntrada, type SugestaoIa,
} from '@gestor/shared';
import { api } from '../../../api/index.js';
import { Modal, Spinner, mensagemErro } from '../../../components/ui/index.js';
import { ErroPerto, lista, useAberta, useAcao } from './base.js';

type Chave = 'titulo' | 'relato' | 'descricao' | 'assuntoId' | 'tipo' | 'gravidade' | 'alcance' | 'produtos' | 'etiquetas';
/** De que campo do sistema cada sugestão depende (o painel pode ter desligado). */
const DO_CAMPO: Partial<Record<Chave, CampoDoSistema>> = { assuntoId: 'assunto', tipo: 'tipo', gravidade: 'gravidade', alcance: 'alcance', produtos: 'produtos' };
type Linha = {
  chave: Chave; rotulo: string; atual: ReactNode; sugerido: ReactNode;
  /** a IA sugeriu algo diferente do que está */
  difere: boolean;
  /** o que a IA não sugeriu, ou sugeriu igual: só informa */
  motivo?: string;
  valor: unknown; longo?: boolean;
};

const vazio = <span className="text-muted italic">vazio</span>;

export function JanelaIa({ s, onFechar }: { s: SugestaoIa; onFechar: () => void }) {
  const { f, opcoes, painel } = useAberta();
  const acao = useAcao();
  const [anotarResumo, setAnotarResumo] = useState(false);
  /** o que o painel não usa (desligado em Ajustes › Campos) nem aparece para escolher */
  const usa = (c: CampoDoSistema) => !painel || campoLigado(painel.ajustes, c);

  const linhas = useMemo<Linha[]>(() => {
    const nomeProduto = (id: string) => opcoes.produtos.find((p) => p.id === id)?.nome ?? id;
    const novosProdutos = s.produtos.filter((id) => !f.produtos.some((p) => p.id === id));
    const etiquetas = etiquetasUnicas([...f.etiquetas, ...s.etiquetas]);
    const novasEtiquetas = etiquetas.slice(f.etiquetas.length);
    const texto = (chave: Chave, rotulo: string, atual: string | null, sugerido: string | null, longo = false): Linha => ({
      chave, rotulo, longo, valor: sugerido,
      atual: atual?.trim() ? atual : vazio,
      sugerido: sugerido ?? vazio,
      difere: !!sugerido && sugerido.trim() !== (atual ?? '').trim(),
      motivo: !sugerido ? 'a IA não sugeriu' : sugerido.trim() === (atual ?? '').trim() ? 'igual ao de agora' : undefined,
    });
    const escolha = (chave: Chave, rotulo: string, atual: string | null, sugerido: string | null, valor: unknown, iguais: boolean): Linha => ({
      chave, rotulo, valor, atual: atual ?? vazio, sugerido: sugerido ?? vazio,
      difere: !!sugerido && !iguais, motivo: !sugerido ? 'a IA não sugeriu' : iguais ? 'igual ao de agora' : undefined,
    });
    return [
      texto('titulo', 'Título', f.titulo, s.titulo),
      texto('relato', 'Relato do cliente', f.relato, s.relato, true),
      texto('descricao', 'Descrição', f.descricao, s.descricao, true),
      escolha('assuntoId', 'Assunto', f.assunto?.caminho ?? null, s.assuntoId ? caminhoDoAssunto(s.assuntoId, opcoes.assuntos) : null, s.assuntoId, s.assuntoId === f.assunto?.id),
      escolha('tipo', 'Tipo', f.tipo, s.tipo, s.tipo, s.tipo === f.tipo),
      escolha('gravidade', 'Gravidade', f.gravidade ? NOME_GRAVIDADE[f.gravidade] : null, s.gravidade ? NOME_GRAVIDADE[s.gravidade] : null, s.gravidade, s.gravidade === f.gravidade),
      escolha('alcance', 'Alcance', f.alcance ? NOME_ALCANCE[f.alcance] : null, s.alcance ? NOME_ALCANCE[s.alcance] : null, s.alcance, s.alcance === f.alcance),
      {
        chave: 'produtos', rotulo: 'Produtos', valor: [...f.produtos.map((p) => p.id), ...novosProdutos],
        atual: f.produtos.length ? f.produtos.map((p) => p.nome).join(', ') : vazio,
        sugerido: s.produtos.length ? <>{s.produtos.map(nomeProduto).join(', ')}{novosProdutos.length > 0 && f.produtos.length > 0 && <span className="text-muted"> (junta aos de agora)</span>}</> : vazio,
        difere: novosProdutos.length > 0, motivo: !s.produtos.length ? 'a IA não sugeriu' : !novosProdutos.length ? 'já estão no chamado' : undefined,
      },
      {
        chave: 'etiquetas', rotulo: 'Etiquetas', valor: etiquetas,
        atual: f.etiquetas.length ? f.etiquetas.join(', ') : vazio,
        sugerido: s.etiquetas.length ? <>{s.etiquetas.join(', ')}{novasEtiquetas.length > 0 && f.etiquetas.length > 0 && <span className="text-muted"> (junta às de agora)</span>}</> : vazio,
        difere: novasEtiquetas.length > 0 && etiquetas.length <= 20, motivo: !s.etiquetas.length ? 'a IA não sugeriu' : !novasEtiquetas.length ? 'já estão no chamado' : etiquetas.length > 20 ? 'passaria de 20 etiquetas' : undefined,
      },
    ];
  }, [f, s, opcoes.produtos, opcoes.assuntos]).filter((l) => !DO_CAMPO[l.chave] || usa(DO_CAMPO[l.chave]!));

  const [marcados, setMarcados] = useState<Set<Chave>>(() => new Set(linhas.filter((l) => l.difere).map((l) => l.chave)));
  const alternar = (c: Chave) => setMarcados((m) => { const n = new Set(m); if (n.has(c)) n.delete(c); else n.add(c); return n; });

  // a gravidade e o alcance mudam a prioridade sugerida (e a prioridade, se ela seguia a sugestão)
  const g = marcados.has('gravidade') ? s.gravidade : f.gravidade;
  const al = marcados.has('alcance') ? s.alcance : f.alcance;
  // pelos campos do painel (sem o alcance, só a gravidade)
  const novaSugerida = painel ? prioridadeSugeridaDoPainel(painel.ajustes, g, al, opcoes.prazos) : null;
  const mudaSugestao = (marcados.has('gravidade') || marcados.has('alcance')) && novaSugerida && novaSugerida !== f.prioridadeSugerida;
  const seguia = !f.prioridade || f.prioridade === f.prioridadeSugerida;

  const aplicar = async () => {
    const d: Record<string, unknown> = {};
    for (const l of linhas) if (marcados.has(l.chave) && l.difere) d[l.chave] = l.valor;
    const nomes = linhas.filter((l) => d[l.chave] !== undefined).map((l) => l.rotulo.toLocaleLowerCase('pt-BR'));
    if (!nomes.length && !(anotarResumo && s.resumo)) { acao.setErro('Marque pelo menos um campo para aplicar.'); return; }
    if (nomes.length) {
      const r = await acao.rodar(() => api.atendimento.alterar(f.id, d as ChamadoAlterarEntrada), `Aplicado: ${lista(nomes)}`);
      if (!r.ok) return;
    }
    if (anotarResumo && s.resumo) {
      const r = await acao.rodar(() => api.atendimento.anotar(f.id, { texto: `Resumo da IA: ${s.resumo}`, anexos: [] }), nomes.length ? undefined : 'O resumo virou uma anotação');
      if (!r.ok) return;
    }
    onFechar();
  };

  const algum = linhas.some((l) => l.difere) || !!s.resumo;
  const custo = s.custo == null ? null : s.custo.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 });

  return (
    <Modal open onClose={onFechar} largura="max-w-3xl" titulo={<span className="inline-flex items-center gap-2"><Sparkles size={16} className="text-accent" /> O que a IA sugeriu para {f.codigo}</span>}
      rodape={<>
        <button type="button" className="btn-secondary" onClick={onFechar}>Fechar sem aplicar</button>
        <button type="button" className="btn-primary" disabled={acao.ocupado || !algum} onClick={() => void aplicar()}>{acao.ocupado ? <Spinner className="text-white" /> : 'Aplicar os marcados'}</button>
      </>}>
      <p className="text-[12.5px] text-muted flex flex-wrap items-center gap-x-3 gap-y-1 mb-3">
        <span className="inline-flex items-center gap-1.5 text-ink-2">
          {s.fonte === 'conversa' ? <><MessagesSquare size={14} /> Leu a conversa no LineChat</> : <><BookOpenText size={14} /> Leu o próprio chamado (o título, o relato, a descrição e as anotações)</>}
        </span>
        <span>{s.modelo} · {s.provedor}</span>
        {custo != null && <span>custou uns US$ {custo}</span>}
        <span>Nada foi gravado: marque o que quer e aplique.</span>
      </p>

      {s.resumo && (
        <div className="rounded-lg border border-line bg-surface-2 p-3 mb-3">
          <div className="eyebrow mb-1">Resumo para quem pegar o chamado agora</div>
          <p className="text-[14px] text-ink whitespace-pre-wrap break-words">{s.resumo}</p>
          <label className="mt-2 inline-flex items-center gap-2 text-[13px] cursor-pointer">
            <input type="checkbox" checked={anotarResumo} onChange={(e) => setAnotarResumo(e.target.checked)} /> Guardar o resumo como uma anotação
          </label>
        </div>
      )}

      {!linhas.some((l) => l.difere) && <p className="text-[13.5px] text-muted mb-2">A IA não sugeriu nada diferente do que já está no chamado.</p>}

      <ul className="flex flex-col divide-y divide-line border-y border-line">
        {linhas.map((l) => (
          <li key={l.chave} className={`py-2.5 ${l.difere ? '' : 'opacity-75'}`}>
            <label className={`flex items-start gap-2.5 ${l.difere ? 'cursor-pointer' : ''}`}>
              <input type="checkbox" className="mt-1" disabled={!l.difere} checked={l.difere && marcados.has(l.chave)} onChange={() => alternar(l.chave)} aria-label={`Aplicar ${l.rotulo}`} />
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-baseline gap-x-2">
                  <span className="font-semibold text-[13.5px]">{l.rotulo}</span>
                  {l.motivo && <span className="text-[12px] text-muted">{l.motivo}</span>}
                </span>
                {l.difere && (
                  <span className={`mt-1 grid gap-2 ${l.longo ? 'sm:grid-cols-2' : 'sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]'}`}>
                    <Valor rotulo="Agora" longo={l.longo}>{l.atual}</Valor>
                    <Valor rotulo="Sugerido" longo={l.longo} destaque>{l.sugerido}</Valor>
                  </span>
                )}
              </span>
            </label>
          </li>
        ))}
      </ul>

      {mudaSugestao && (
        <p className="text-[12.5px] text-muted mt-2">
          Com a gravidade e o alcance novos, a prioridade sugerida passa a ser <b className="text-ink-2">{NOME_PRIORIDADE[novaSugerida!]}</b>
          {seguia ? ', e a prioridade do chamado vai junto.' : ` (a prioridade ${f.prioridade ? NOME_PRIORIDADE[f.prioridade] : ''} foi trocada à mão e fica como está).`}
        </p>
      )}
      <ErroPerto erro={acao.erro} />
    </Modal>
  );
}

function Valor({ rotulo, longo, destaque = false, children }: { rotulo: string; longo?: boolean; destaque?: boolean; children: ReactNode }) {
  return (
    <span className={`block rounded-lg border px-2.5 py-1.5 min-w-0 ${destaque ? 'border-accent bg-accent-soft' : 'border-line'}`}>
      <span className="block eyebrow mb-0.5">{rotulo}</span>
      <span className={`block text-[13.5px] whitespace-pre-wrap break-words ${longo ? 'max-h-[180px] overflow-y-auto' : ''}`}>{children}</span>
    </span>
  );
}

/** Pede a sugestão à IA (pode levar uns segundos); o erro volta para quem chamou mostrar perto do botão. */
export async function pedirSugestao(id: string): Promise<{ ok: true; s: SugestaoIa } | { ok: false; erro: string }> {
  try {
    return { ok: true, s: await api.atendimento.preencherComIa(id) };
  } catch (e) {
    return { ok: false, erro: mensagemErro(e) };
  }
}
