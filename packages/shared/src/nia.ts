/**
 * A NIA NA FICHA (Patch 2.0.4.1): o botão que pede à NIA — a IA do suporte, que mora no n8n — para preencher o
 * chamado. O pedido do Luan (23/10): "para eu fazer a ia preencher o chamado hoje eu tenho que etiquetar, só que
 * isso eu acho meio gambiarra, devíamos ter um botão aqui para mandar ela preencher e se já tiver sido feito ele
 * fica com alguma marcação dizendo que já foi feito e se eu clicar ele me mostra algumas informações como data".
 *
 * O combinado com o fluxo do n8n continua sendo a etiqueta, como quando a equipe etiquetava à mão: o botão põe a
 * etiqueta de pedir (NIA - PREENCHER), o Gestor avisa o n8n (o webhook do chamado alterado), e a NIA lê a conversa,
 * preenche pela chave de API e troca a etiqueta pela de pronto (NIA - CONCLUIDO) ou pela de erro (NIA - ERRO).
 * Assim o fluxo do n8n não muda. O que a ficha mostra — se ela já preencheu, quando, quem pediu e o que mudou — sai
 * das etiquetas e do histórico, sem nada guardado à parte: vale também para o que a equipe etiquetou antes do botão.
 */
import { z } from 'zod';
import { chaveDaEtiqueta, etiquetasUnicas, type AnotacaoChamado, type EventoChamado } from './atendimento.js';

/** O nome do campo das etiquetas no histórico (o servidor e a prévia escrevem assim a troca de etiquetas). */
export const CAMPO_DAS_ETIQUETAS = 'Etiquetas';

export type AjustesDaNia = {
  /** o botão aparece na ficha dos chamados (os painéis de Gestão; a negociação não tem a NIA) */
  ligada: boolean;
  /** a etiqueta que pede à NIA para preencher (a que o fluxo do n8n procura) */
  pedir: string;
  /** a que a NIA põe quando preencheu */
  pronto: string;
  /** a que a NIA põe quando não conseguiu */
  erro: string;
};
/** As etiquetas de hoje (as do Helena, que o fluxo da NIA usa desde lá). */
export const NIA_PADRAO: AjustesDaNia = { ligada: true, pedir: 'NIA - PREENCHER', pronto: 'NIA - CONCLUIDO', erro: 'NIA - ERRO' };

const EtiquetaDaNia = z.string().trim().min(1, 'Escreva o nome da etiqueta').max(40, 'A etiqueta vai até 40 letras').transform((s) => s.replace(/\s+/g, ' '));
export const AjustesDaNiaSchema = z.object({ ligada: z.boolean(), pedir: EtiquetaDaNia, pronto: EtiquetaDaNia, erro: EtiquetaDaNia })
  .refine((a) => new Set([a.pedir, a.pronto, a.erro].map(chaveDaEtiqueta)).size === 3, { message: 'As três etiquetas precisam ser diferentes.', path: ['pronto'] });
export type AjustesDaNiaEntrada = z.input<typeof AjustesDaNiaSchema>;

/** Os ajustes guardados, completos: o que falta (ou veio estragado) fica com o padrão. */
export function ajustesDaNiaCompletos(v: unknown): AjustesDaNia {
  const o = v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
  const nome = (x: unknown, padrao: string) => (typeof x === 'string' && x.trim() ? x.trim().replace(/\s+/g, ' ').slice(0, 40) : padrao);
  const r: AjustesDaNia = {
    ligada: typeof o.ligada === 'boolean' ? o.ligada : NIA_PADRAO.ligada,
    pedir: nome(o.pedir, NIA_PADRAO.pedir), pronto: nome(o.pronto, NIA_PADRAO.pronto), erro: nome(o.erro, NIA_PADRAO.erro),
  };
  // três etiquetas iguais não dão para entender o que aconteceu: volta para as de fábrica
  return new Set([r.pedir, r.pronto, r.erro].map(chaveDaEtiqueta)).size === 3 ? r : { ...NIA_PADRAO, ligada: r.ligada };
}

/** Quanto esperar antes de deixar pedir de novo o pedido que ainda não teve resposta (a NIA costuma levar segundos). */
export const NIA_PEDIR_DE_NOVO_MINUTOS = 10;

/** As etiquetas do chamado ao pedir à NIA: a de pedir entra; a de pronto e a de erro saem (é um pedido novo). */
export function etiquetasAoPedirANia(etiquetas: string[], nia: AjustesDaNia): string[] {
  const tirar = new Set([nia.pedir, nia.pronto, nia.erro].map(chaveDaEtiqueta));
  return etiquetasUnicas([...etiquetas.filter((e) => !tirar.has(chaveDaEtiqueta(e))), nia.pedir]);
}

/** Tem a etiqueta (sem ligar para maiúscula, acento e espaço a mais)? */
export function temAEtiqueta(etiquetas: string[], nome: string): boolean {
  const k = chaveDaEtiqueta(nome);
  return etiquetas.some((e) => chaveDaEtiqueta(e) === k);
}

export type SituacaoDaNia = 'nunca' | 'pedida' | 'pronta' | 'erro';
export type ResumoDaNia = {
  /** nunca pediram; pedida (ela ainda não respondeu); pronta (ela preencheu); erro (ela não conseguiu) */
  situacao: SituacaoDaNia;
  /** o pedido da vez (o que está esperando, ou o que levou à última resposta): quando e quem pediu */
  pedidaEm: string | null;
  pedidaPor: string | null;
  /** a última resposta da NIA (a etiqueta de pronto ou a de erro): quando e quem pôs (a integração do n8n) */
  respondidaEm: string | null;
  respondidaPor: string | null;
  /** quantas vezes ela já preencheu este chamado */
  vezes: number;
  /** o que ela mudou na última vez: os campos (pelo nome do histórico) e quantas anotações escreveu */
  mudou: string[];
  anotacoes: number;
  /** dá para pedir agora? (sempre, menos no pedido sem resposta há menos de `NIA_PEDIR_DE_NOVO_MINUTOS`) */
  podePedir: boolean;
};

/** A lista de etiquetas como o histórico escreve ("A, B, C"). */
const daLista = (s: unknown): string[] => (typeof s === 'string' && s.trim() ? s.split(', ') : []);
const quemFez = (x: { por: { id: string } | null; porNome: string | null }) => (x.por ? `p:${x.por.id}` : `i:${x.porNome ?? ''}`);
const nomeDeQuem = (x: { por: { nome: string } | null; porNome: string | null }) => x.por?.nome ?? x.porNome ?? null;
/** O que a NIA escreveu logo depois de trocar a etiqueta (as anotações podem vir depois do PATCH) ainda conta. */
const FOLGA_DEPOIS_MS = 2 * 60_000;
/** Sem o pedido no histórico (a etiqueta posta antes do Gestor guardar), o que ela mudou nos 15 minutos antes. */
const ANTES_SEM_PEDIDO_MS = 15 * 60_000;

/**
 * O resumo da NIA num chamado: pelas etiquetas de agora e pelo histórico das trocas de etiqueta (quem pôs a de
 * pedir, quando a NIA pôs a de pronto ou a de erro) — o mesmo no servidor, na prévia e na tela.
 */
export function resumoDaNia(
  f: { etiquetas: string[]; historico: EventoChamado[]; anotacoesLista?: AnotacaoChamado[] },
  nia: AjustesDaNia,
  agora: Date = new Date(),
): ResumoDaNia {
  const eventos = [...f.historico].sort((a, b) => a.em.localeCompare(b.em));
  const daNia = new Set([nia.pedir, nia.pronto, nia.erro].map(chaveDaEtiqueta));
  let pedido: EventoChamado | null = null;
  let resposta: { e: EventoChamado; tipo: 'pronta' | 'erro'; pedido: EventoChamado | null } | null = null;
  let vezes = 0;
  for (const e of eventos) {
    if (e.tipo !== 'campo' || e.dados?.campo !== CAMPO_DAS_ETIQUETAS) continue;
    const de = daLista(e.dados.de);
    const para = daLista(e.dados.para);
    const ganhou = (nome: string) => temAEtiqueta(para, nome) && !temAEtiqueta(de, nome);
    if (ganhou(nia.pedir)) pedido = e;
    if (ganhou(nia.pronto)) { resposta = { e, tipo: 'pronta', pedido }; vezes += 1; }
    else if (ganhou(nia.erro)) resposta = { e, tipo: 'erro', pedido };
  }

  // a resposta vale quando veio depois do último pedido (o pedido novo, depois de pronta, volta a esperar)
  const respondeu = !!resposta && (!pedido || resposta.e.em >= pedido.em);
  const pedidaAgora = temAEtiqueta(f.etiquetas, nia.pedir);
  let situacao: SituacaoDaNia;
  if (respondeu && resposta) situacao = resposta.tipo;
  else if (pedidaAgora) situacao = 'pedida';
  else if (temAEtiqueta(f.etiquetas, nia.erro)) situacao = 'erro';
  else if (temAEtiqueta(f.etiquetas, nia.pronto) || vezes > 0) situacao = 'pronta';
  else situacao = 'nunca';

  // a resposta que a ficha mostra (a última, quando é dela que a situação vem) e o pedido da vez: o que espera
  // (pedida) ou o que levou a essa resposta
  const respostaQueVale = (situacao === 'pronta' || situacao === 'erro') && resposta && (respondeu || resposta.tipo === situacao) ? resposta : null;
  const pedidoDaVez = situacao === 'pedida' ? pedido : respostaQueVale ? respostaQueVale.pedido : null;

  // o que ela mudou: o que a mesma integração (quem pôs a etiqueta de pronto) fez entre o pedido e a resposta
  const mudou = new Set<string>();
  let anotacoes = 0;
  if (respostaQueVale) {
    const autor = quemFez(respostaQueVale.e);
    const ate = new Date(Date.parse(respostaQueVale.e.em) + FOLGA_DEPOIS_MS).toISOString();
    const desde = respostaQueVale.pedido?.em ?? new Date(Date.parse(respostaQueVale.e.em) - ANTES_SEM_PEDIDO_MS).toISOString();
    for (const e of eventos) {
      if (e.em < desde || e.em > ate || quemFez(e) !== autor) continue;
      if (e.tipo === 'campo') {
        if (e.dados?.campo !== CAMPO_DAS_ETIQUETAS) mudou.add(String(e.dados?.campo ?? ''));
        else {
          // a troca das etiquetas da própria NIA não conta; outra etiqueta que ela pôs ou tirou, sim
          const fora = (s: unknown) => daLista(s).filter((x) => !daNia.has(chaveDaEtiqueta(x))).map(chaveDaEtiqueta).sort().join('|');
          if (fora(e.dados.de) !== fora(e.dados.para)) mudou.add(CAMPO_DAS_ETIQUETAS);
        }
      } else if (e.tipo === 'prioridade') mudou.add('Prioridade');
      else if (e.tipo === 'responsavel') mudou.add('Responsável');
      else if (e.tipo === 'etapa') mudou.add('Etapa');
    }
    anotacoes = (f.anotacoesLista ?? []).filter((n) => n.em >= desde && n.em <= ate && quemFez(n) === autor).length;
  }
  mudou.delete('');

  const pedidaEm = pedidoDaVez?.em ?? null;
  const esperaDemais = situacao === 'pedida' && (!pedidaEm || agora.getTime() - Date.parse(pedidaEm) >= NIA_PEDIR_DE_NOVO_MINUTOS * 60_000);
  return {
    situacao,
    pedidaEm, pedidaPor: pedidoDaVez ? nomeDeQuem(pedidoDaVez) : null,
    respondidaEm: respostaQueVale?.e.em ?? null, respondidaPor: respostaQueVale ? nomeDeQuem(respostaQueVale.e) : null,
    vezes, mudou: [...mudou], anotacoes,
    podePedir: situacao !== 'pedida' || esperaDemais,
  };
}
