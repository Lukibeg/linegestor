/**
 * A IA NO CHAMADO (Patch 1.10, decisão 0047): a NIA de hoje, dentro do Gestor. A pessoa clica em
 * "Preencher com a IA" e a IA lê a conversa do cliente no LineChat (ou, sem ela, o que já está no
 * chamado) e sugere o título, o relato, a descrição, o assunto, o tipo, a gravidade, o alcance, os
 * produtos, as etiquetas e um resumo do andamento.
 *
 * Nada é gravado aqui: a sugestão volta para a tela, a pessoa confere e aplica (com o PATCH de sempre,
 * que registra o histórico). O que a IA inventar fica de fora: o assunto, o tipo e os produtos só
 * entram se existirem nas opções do painel (`lerSugestaoDaIa`, a mesma conta da prévia).
 *
 * A IA é a da Base de conhecimento (`baseIa.ts`): a mesma configuração, o mesmo limite de 30 usos por
 * pessoa por hora e a mesma conta do mês. O texto da conversa (ou do chamado) sai do servidor para o
 * provedor escolhido, como já sai o dos artigos.
 */
import type { FastifyInstance } from 'fastify';
import { and, asc, eq, isNull } from 'drizzle-orm';
import { products, ticketNotes } from '@gestor/db';
import {
  caminhoDoAssunto, cortarTexto, emOrdemDeArvore, lerSugestaoDaIa,
  type Painel, type SugestaoIa,
} from '@gestor/shared';
import { BadRequest } from '../../plugins/errors.js';
import { conversarSobreChamado } from '../baseIa.js';
import { lerAjustes as lerAjustesLineChat } from '../linechat.js';
import { carregarContexto, chamadoVisivel, exigirTrabalhar, pessoaCurta, type Ator, type Contexto, type LinhaChamado } from './contexto.js';
import { conversaDaSessao } from './whatsapp.js';

/** O chamado em texto vai até umas 20 mil letras (o começo pesa mais: título, relato, descrição). */
const MAX_LETRAS_DO_CHAMADO = 20_000;

/** O próprio chamado em texto: o título, o relato, a descrição e as anotações, da mais antiga à mais nova. */
async function textoDoChamado(app: FastifyInstance, ctx: Contexto, t: LinhaChamado): Promise<string> {
  const notas = await app.db.select().from(ticketNotes)
    .where(and(eq(ticketNotes.ticketId, t.id), isNull(ticketNotes.deletedAt))).orderBy(asc(ticketNotes.createdAt), asc(ticketNotes.id));
  const partes = [
    `Chamado ${t.code}: ${t.title}`,
    t.customerReport ? `Relato do cliente:\n${t.customerReport}` : null,
    t.description ? `Descrição:\n${t.description}` : null,
    notas.some((n) => n.body.trim())
      ? `Anotações da equipe (da mais antiga à mais nova):\n${notas.filter((n) => n.body.trim()).map((n) => `- ${pessoaCurta(ctx, n.userId)?.nome ?? n.actorName ?? 'Equipe'}: ${n.body.trim()}`).join('\n')}`
      : null,
  ];
  return cortarTexto(partes.filter(Boolean).join('\n\n'), MAX_LETRAS_DO_CHAMADO);
}

/** As opções do painel, para a IA escolher entre elas (e não inventar). */
function listasDoPainel(painel: Painel, ctx: Contexto, produtos: Array<{ nome: string }>): string {
  const caminhos = emOrdemDeArvore(ctx.assuntos.filter((a) => a.painelId === painel.id))
    .filter((a) => a.ativo)
    .map((a) => caminhoDoAssunto(a.id, ctx.assuntos));
  return [
    `Lista de assuntos do painel ${painel.nome} (escolha um caminho exatamente como está escrito):`,
    caminhos.length ? caminhos.map((c) => `- ${c}`).join('\n') : '(o painel ainda não tem assuntos: devolva "")',
    `Opções de tipo: ${painel.ajustes.tipos.length ? painel.ajustes.tipos.join(', ') : '(nenhuma: devolva "")'}`,
    `Produtos: ${produtos.length ? produtos.map((p) => p.nome).join(', ') : '(nenhum)'}`,
  ].join('\n');
}

/**
 * A sugestão da IA para o chamado. A conversa do LineChat vale quando o chamado tem a sessão e a
 * leitura do LineChat está ligada; se ela falhar (ou vier vazia), vai o próprio chamado — a pessoa
 * recebe a sugestão do mesmo jeito, e `fonte` diz de onde a IA leu.
 */
export async function sugestaoDaIa(app: FastifyInstance, ator: Ator, ref: string): Promise<{ sugestao: SugestaoIa; chamado: { id: string; codigo: string } }> {
  exigirTrabalhar(ator);
  const ctx = await carregarContexto(app.db);
  const t = await chamadoVisivel(app.db, ref, ator, ctx);
  const painel = ctx.paineis.find((p) => p.id === t.panelId)!;
  const produtos = await app.db.select({ id: products.id, nome: products.name }).from(products)
    .where(and(isNull(products.deletedAt), eq(products.active, true))).orderBy(asc(products.sortOrder), asc(products.name));

  let fonte: SugestaoIa['fonte'] = 'chamado';
  const montarTexto = async () => {
    let conteudo = '';
    if (t.sessionId && (await lerAjustesLineChat(app.db)).valor.ativo) {
      try {
        conteudo = (await conversaDaSessao(app.db, app.vault, t.sessionId)).trim();
        if (conteudo) fonte = 'conversa';
      } catch (err) {
        app.log.warn({ err, chamado: t.code }, 'IA do chamado: a conversa do LineChat não veio; vai o próprio chamado');
      }
    }
    if (fonte === 'chamado') conteudo = await textoDoChamado(app, ctx, t);
    const titulo = fonte === 'conversa' ? `A conversa do cliente no LineChat (chamado ${t.code}):` : 'O que já está no chamado:';
    return `${titulo}\n${conteudo}\n\n${listasDoPainel(painel, ctx, produtos)}`;
  };

  const r = await conversarSobreChamado(app.db, app.vault, { id: ator.id }, montarTexto);
  const j = r.json && typeof r.json === 'object' && !Array.isArray(r.json) ? (r.json as Record<string, unknown>) : null;
  if (!j) throw new BadRequest(r.cortada ? 'A IA não terminou a sugestão (passou do limite). Tente de novo.' : 'A IA não devolveu a sugestão no formato combinado. Tente de novo.');
  const lida = lerSugestaoDaIa(j, {
    assuntos: ctx.assuntos.filter((a) => a.painelId === painel.id).map((a) => ({ id: a.id, caminho: caminhoDoAssunto(a.id, ctx.assuntos), ativo: a.ativo })),
    tipos: painel.ajustes.tipos,
    produtos,
  });
  return { sugestao: { ...lida, fonte, modelo: r.modelo, provedor: r.provedor, custo: r.custo }, chamado: { id: t.id, codigo: t.code } };
}
