/**
 * AS INTEGRAÇÕES DOS CHAMADOS (Patch 2.0, decisão 0047): o que liga o Gestor aos outros sistemas —
 * os webhooks (o Gestor avisa o n8n do que aconteceu), as chaves de API (o robô do LineChat e o n8n
 * abrem e mexem nos chamados), o mapa do robô (2.0.1: de onde vem cada campo do chamado no JSON que o
 * robô manda), os sites que podem abrir o Gestor dentro deles (o menu do LineChat) e o modelo do link
 * da conversa. É da administração (`admin.manage`).
 *
 * Segredo nenhum fica à vista:
 *  - o segredo da assinatura do webhook vai para o cofre e aparece UMA vez, ao criar (ou ao pedir um
 *    novo); depois a tela só sabe que ele existe;
 *  - a chave de API aparece UMA vez, ao criar; no banco fica só o resumo (sha256) e o começo, para a
 *    pessoa reconhecer qual é. Perdeu a chave? Revoga e cria outra.
 *
 * Como no resto do módulo, quem grava a auditoria é a rota: cada função devolve o que a frase precisa
 * (e nunca o segredo nem a chave).
 */
import { randomBytes } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { z } from 'zod';
import { and, desc, eq, inArray, isNull } from 'drizzle-orm';
import { newId, ticketApiKeys, ticketWebhooks, users, type Db } from '@gestor/db';
import {
  CAMPOS_DO_MAPA, NOME_CAMPO_DO_MAPA,
  type ChaveApiTela, type EventoWebhook, type IntegracoesTela, type MapaDoRobo, type RoboTela, type WebhookGravarSchema, type WebhookTela,
} from '@gestor/shared';
import { BadRequest, NotFound } from '../../plugins/errors.js';
import { esquecerSitesDoIframe } from '../../plugins/seguranca.js';
import { enderecoPublico } from '../envio.js';
import * as integ from '../integracoes.js';
// o resumo é o mesmo com que a entrada das integrações confere a chave: uma definição só
import { lerMapaDoRobo, lerUltimoDoRobo, resumoDaChave } from './entrada.js';
import { corpoDoEvento, entregar, problemaDoEndereco } from './webhooks.js';

type WebhookGravar = z.infer<typeof WebhookGravarSchema>;
type LinhaWebhook = typeof ticketWebhooks.$inferSelect;
type LinhaChave = typeof ticketApiKeys.$inferSelect;

/** O que fica em `settings.atendimento-integracoes`. */
export type ConfigIntegracoes = { sites: string[]; linkConversa: string };

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);

/** Um segredo novo: 32 bytes ao acaso, em base64url (cabe em cabeçalho e em endereço). */
const sortear = () => randomBytes(32).toString('base64url');

export async function lerConfig(db: Db): Promise<ConfigIntegracoes> {
  const { valor } = await integ.ler<Partial<ConfigIntegracoes>>(db, 'atendimento-integracoes');
  return {
    sites: Array.isArray(valor.sites) ? valor.sites.filter((s): s is string => typeof s === 'string') : [],
    linkConversa: typeof valor.linkConversa === 'string' ? valor.linkConversa : '',
  };
}

const webhookParaTela = (w: LinhaWebhook): WebhookTela => ({
  id: w.id, nome: w.name, url: w.url, eventos: w.events as EventoWebhook[], ativo: w.active,
  ultimoEm: iso(w.lastAt), ultimoOk: w.lastOk, ultimaMsg: w.lastMessage, temSegredo: !!w.secretId,
});

const chaveParaTela = (k: LinhaChave, nomes: Map<string, string>): ChaveApiTela => ({
  id: k.id, nome: k.name, inicio: k.prefix, criadaEm: k.createdAt.toISOString(),
  criadaPor: k.createdById ? nomes.get(k.createdById) ?? '(pessoa removida)' : null,
  usadaEm: iso(k.lastUsedAt), revogadaEm: iso(k.revokedAt),
});

async function nomesDasPessoas(db: Db, ids: Array<string | null>): Promise<Map<string, string>> {
  const pedidos = [...new Set(ids.filter((x): x is string => !!x))];
  if (!pedidos.length) return new Map();
  const ps = await db.select({ id: users.id, nome: users.name }).from(users).where(inArray(users.id, pedidos));
  return new Map(ps.map((p) => [p.id, p.nome]));
}

/** A tela das Integrações: os webhooks, as chaves (as revogadas também, com a data), os sites, o link e o endereço do Gestor. */
export async function telaDasIntegracoes(app: FastifyInstance): Promise<IntegracoesTela> {
  const db = app.db;
  const [ws, ks, config] = await Promise.all([
    db.select().from(ticketWebhooks).where(isNull(ticketWebhooks.deletedAt)).orderBy(ticketWebhooks.createdAt),
    db.select().from(ticketApiKeys).orderBy(desc(ticketApiKeys.createdAt)),
    lerConfig(db),
  ]);
  const nomes = await nomesDasPessoas(db, ks.map((k) => k.createdById));
  return {
    webhooks: ws.map(webhookParaTela),
    chaves: ks.map((k) => chaveParaTela(k, nomes)),
    sites: config.sites,
    linkConversa: config.linkConversa,
    endereco: enderecoPublico(app),
  };
}

// =====================================================================
//  OS WEBHOOKS
// =====================================================================

async function webhookOu404(db: Db, id: string): Promise<LinhaWebhook> {
  const [w] = await db.select().from(ticketWebhooks).where(and(eq(ticketWebhooks.id, id), isNull(ticketWebhooks.deletedAt))).limit(1);
  if (!w) throw new NotFound('Webhook');
  return w;
}

/** O endereço precisa ser https e da internet (nunca a rede de dentro do servidor). */
async function conferirEndereco(url: string) {
  const problema = await problemaDoEndereco(url);
  if (problema) throw new BadRequest(problema);
}

/** Cria o webhook com um segredo novo (no cofre). O segredo volta só aqui. */
export async function criarWebhook(app: FastifyInstance, d: WebhookGravar, userId: string): Promise<{ webhook: WebhookTela; segredo: string }> {
  await conferirEndereco(d.url);
  const segredo = sortear();
  const secretId = await app.vault.save(app.db, { label: `Assinatura do webhook ${d.nome}`, plain: segredo, userId });
  const [w] = await app.db.insert(ticketWebhooks).values({
    id: newId(), name: d.nome, url: d.url, events: [...new Set(d.eventos)], active: d.ativo, secretId, createdById: userId,
  }).returning();
  return { webhook: webhookParaTela(w!), segredo };
}

/** Muda o webhook. Com `novoSegredo`, troca a assinatura (o segredo novo volta só aqui; o antigo para de valer). */
export async function alterarWebhook(app: FastifyInstance, id: string, d: WebhookGravar, userId: string): Promise<{ webhook: WebhookTela; segredo: string | null; antes: WebhookTela }> {
  const atual = await webhookOu404(app.db, id);
  await conferirEndereco(d.url);
  let segredo: string | null = null;
  let secretId = atual.secretId;
  if (d.novoSegredo) {
    segredo = sortear();
    secretId = await app.vault.save(app.db, { existingId: atual.secretId, label: `Assinatura do webhook ${d.nome}`, plain: segredo, userId });
  }
  const [w] = await app.db.update(ticketWebhooks).set({
    name: d.nome, url: d.url, events: [...new Set(d.eventos)], active: d.ativo, secretId, updatedAt: new Date(),
  }).where(eq(ticketWebhooks.id, id)).returning();
  return { webhook: webhookParaTela(w!), segredo, antes: webhookParaTela(atual) };
}

/** Tira o webhook (lixeira): para de receber os eventos. */
export async function removerWebhook(app: FastifyInstance, id: string): Promise<WebhookTela> {
  const w = await webhookOu404(app.db, id);
  const agora = new Date();
  await app.db.update(ticketWebhooks).set({ deletedAt: agora, updatedAt: agora }).where(eq(ticketWebhooks.id, id));
  return webhookParaTela(w);
}

/** Manda o evento `teste` agora (com a assinatura, como um evento de verdade). O resultado fica no cadastro. */
export async function testarWebhook(app: FastifyInstance, id: string): Promise<{ ok: boolean; mensagem: string; nome: string }> {
  const w = await webhookOu404(app.db, id);
  const r = await entregar(app, w, 'teste', await corpoDoEvento(app, 'teste', null));
  return { ...r, nome: w.name };
}

// =====================================================================
//  AS CHAVES DE API
// =====================================================================

/** Cria a chave (`gst_` + 32 bytes ao acaso). O valor volta só aqui: no banco fica o sha256 e o começo. */
export async function criarChave(app: FastifyInstance, nome: string, userId: string): Promise<{ chave: ChaveApiTela; valor: string }> {
  const valor = `gst_${sortear()}`;
  const [k] = await app.db.insert(ticketApiKeys).values({
    id: newId(), name: nome, prefix: valor.slice(0, 8), hash: resumoDaChave(valor), createdById: userId,
  }).returning();
  return { chave: chaveParaTela(k!, await nomesDasPessoas(app.db, [userId])), valor };
}

/** Revoga a chave: o robô ou o n8n que a usa para de entrar na hora. Revogar de novo não muda nada. */
export async function revogarChave(app: FastifyInstance, id: string): Promise<{ chave: ChaveApiTela; jaEstava: boolean }> {
  const [k] = await app.db.select().from(ticketApiKeys).where(eq(ticketApiKeys.id, id)).limit(1);
  if (!k) throw new NotFound('Chave');
  if (k.revokedAt) return { chave: chaveParaTela(k, new Map()), jaEstava: true };
  const [r] = await app.db.update(ticketApiKeys).set({ revokedAt: new Date() }).where(eq(ticketApiKeys.id, id)).returning();
  return { chave: chaveParaTela(r!, new Map()), jaEstava: false };
}

// =====================================================================
//  OS SITES DO IFRAME E O LINK DA CONVERSA
// =====================================================================

/**
 * Os sites que podem abrir o Gestor dentro deles (vão para o `frame-ancestors` de toda página, ver
 * `plugins/seguranca.ts`). Guardados como a origem do site, sem repetir. O cache da política é
 * esquecido na hora: o próximo pedido já sai com a lista nova.
 */
export async function gravarSites(app: FastifyInstance, sites: string[], userId: string): Promise<{ sites: string[]; antes: string[] }> {
  const atual = await lerConfig(app.db);
  const limpos = [...new Set(sites.map((s) => new URL(s).origin))];
  await integ.gravar(app.db, 'atendimento-integracoes', { ...atual, sites: limpos }, { userId });
  esquecerSitesDoIframe();
  return { sites: limpos, antes: atual.sites };
}

/** O modelo do link da conversa no LineChat (com {sessao}); vazio = a ficha não mostra o link. */
export async function gravarLinkConversa(app: FastifyInstance, linkConversa: string, userId: string): Promise<{ linkConversa: string; antes: string }> {
  const atual = await lerConfig(app.db);
  await integ.gravar(app.db, 'atendimento-integracoes', { ...atual, linkConversa }, { userId });
  return { linkConversa, antes: atual.linkConversa };
}

// =====================================================================
//  O MAPA DO ROBÔ DO LINECHAT (2.0.1)
// =====================================================================

/** O mapa e o último pedido do robô (as variáveis dele, para montar o mapa, e o que aconteceu). */
export async function roboDaTela(app: FastifyInstance): Promise<RoboTela> {
  const [mapa, ultimo] = await Promise.all([lerMapaDoRobo(app.db), lerUltimoDoRobo(app.db)]);
  return { mapa, ultimo };
}

/** Grava o mapa (os campos do painel sem texto saem: o mapa guarda só o que vem do robô). */
export async function gravarMapaDoRobo(app: FastifyInstance, mapa: MapaDoRobo, userId: string): Promise<{ mapa: MapaDoRobo; antes: MapaDoRobo; mudou: string[] }> {
  const antes = await lerMapaDoRobo(app.db);
  const novo: MapaDoRobo = { ...mapa, campos: Object.fromEntries(Object.entries(mapa.campos).filter(([, t]) => t.trim())) };
  await integ.gravar(app.db, 'atendimento-robo', novo, { userId });
  // o que mudou, com o nome que a pessoa vê (a auditoria diz o quê)
  const mudou: string[] = [];
  if (antes.painel !== novo.painel) mudou.push('Painel');
  for (const c of CAMPOS_DO_MAPA) if (antes[c] !== novo[c]) mudou.push(NOME_CAMPO_DO_MAPA[c]);
  if (JSON.stringify(antes.campos) !== JSON.stringify(novo.campos)) mudou.push('Campos do painel');
  if (antes.mensagem !== novo.mensagem) mudou.push('Mensagem ao cliente');
  return { mapa: novo, antes, mudou };
}
