/**
 * Os avisos para fora (webhooks, Patch 2.0): o Gestor manda o que aconteceu com um chamado para os
 * endereços que a administração cadastrou nas Integrações — o n8n de hoje (a NIA, a "Atualização de
 * Card") passa a ouvir o Gestor em vez do LineChat.
 *
 * Cada envio é um POST com o JSON do evento e a assinatura no cabeçalho `X-Gestor-Assinatura`
 * (`sha256=` + HMAC do corpo com o segredo do webhook, que fica no cofre): o n8n confere que veio
 * mesmo do Gestor. Sai em segundo plano, com até 3 tentativas (na hora, 5 s e 30 s depois); o
 * resultado do último fica no cadastro do webhook (a tela mostra).
 *
 * Só vai para endereço `https://` da internet: um nome que aponta para dentro (o próprio servidor, a
 * rede local) é recusado — senão o webhook viraria uma porta para dentro do servidor.
 */
import { createHmac } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import type { FastifyInstance } from 'fastify';
import { and, arrayContains, eq, isNull } from 'drizzle-orm';
import { ticketWebhooks } from '@gestor/db';
import type { EventoWebhook } from '@gestor/shared';
import { emSegundoPlano, linkDoChamado } from './avisos.js';
import { carregarContexto, cartoesDe } from './contexto.js';

type Ferramentas = { fetchFn: typeof fetch; resolver: (host: string) => Promise<string[]>; esperar: (ms: number) => Promise<void> };
let ferramentas: Ferramentas = {
  fetchFn: (...a) => fetch(...a),
  resolver: async (host) => (await lookup(host, { all: true })).map((x) => x.address),
  esperar: (ms) => new Promise((ok) => setTimeout(ok, ms)),
};
/** Os testes trocam o fetch, a resolução de nomes e a espera entre tentativas. */
export function trocarFerramentasWebhook(f: Partial<Ferramentas>) { ferramentas = { ...ferramentas, ...f }; }

/** IP da rede de dentro (o próprio servidor, a rede local, a nuvem por dentro). */
export function ipInterno(ip: string): boolean {
  const v4 = ip.toLowerCase().startsWith('::ffff:') ? ip.slice(7) : ip;
  if (isIP(v4) === 4) {
    const [a = 0, b = 0] = v4.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 || a >= 224 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254)
      || (a === 172 && b >= 16 && b <= 31) || (a === 192 && (b === 168 || b === 0)) || (a === 198 && (b === 18 || b === 19));
  }
  const s = ip.toLowerCase();
  return s === '::' || s === '::1' || /^f[cd]/.test(s) || /^fe[89ab]/.test(s);
}

/** O endereço precisa ser https e apontar para a internet. Devolve o motivo, ou null se pode. */
export async function problemaDoEndereco(url: string): Promise<string | null> {
  let u: URL;
  try { u = new URL(url); } catch { return 'Endereço inválido.'; }
  if (u.protocol !== 'https:') return 'O endereço precisa começar com https://.';
  const host = u.hostname.replace(/^\[|\]$/g, '').replace(/\.+$/, '');
  if (/^localhost$/i.test(host)) return 'O endereço aponta para o próprio servidor.';
  let ips: string[];
  try { ips = isIP(host) ? [host] : await ferramentas.resolver(host); } catch { return `Não achei o endereço ${host}.`; }
  if (!ips.length) return `Não achei o endereço ${host}.`;
  if (ips.some(ipInterno)) return `O endereço ${host} aponta para a rede de dentro: o webhook precisa ser um serviço da internet.`;
  return null;
}

export const assinatura = (segredo: string, corpo: string) => `sha256=${createHmac('sha256', segredo).update(corpo).digest('hex')}`;

/** Um envio, com as tentativas. Devolve como foi o último. */
export async function entregar(app: FastifyInstance, w: typeof ticketWebhooks.$inferSelect, evento: string, corpo: string): Promise<{ ok: boolean; mensagem: string }> {
  const segredo = w.secretId ? await app.vault.read(app.db, w.secretId) : null;
  const problema = await problemaDoEndereco(w.url);
  let resultado: { ok: boolean; mensagem: string };
  if (problema) resultado = { ok: false, mensagem: problema };
  else {
    resultado = { ok: false, mensagem: 'não tentou' };
    for (const [i, espera] of [0, 5_000, 30_000].entries()) {
      if (espera) await ferramentas.esperar(espera);
      try {
        const r = await ferramentas.fetchFn(w.url, {
          method: 'POST', redirect: 'error', signal: AbortSignal.timeout(10_000),
          headers: { 'Content-Type': 'application/json', 'X-Gestor-Evento': evento, ...(segredo ? { 'X-Gestor-Assinatura': assinatura(segredo.value, corpo) } : {}) },
          body: corpo,
        });
        if (r.ok) { resultado = { ok: true, mensagem: `${evento}: recebido (${r.status})${i ? ` na ${i + 1}ª tentativa` : ''}` }; break; }
        resultado = { ok: false, mensagem: `${evento}: respondeu ${r.status}` };
        // erro do lado de quem recebe que não muda tentando de novo
        if (r.status >= 400 && r.status < 500 && r.status !== 408 && r.status !== 429) break;
      } catch (e) {
        resultado = { ok: false, mensagem: `${evento}: ${motivoDaFalha(e)}` };
      }
    }
  }
  await app.db.update(ticketWebhooks).set({ lastAt: new Date(), lastOk: resultado.ok, lastMessage: resultado.mensagem.slice(0, 300) }).where(eq(ticketWebhooks.id, w.id));
  return resultado;
}

/**
 * Por que o envio falhou, em palavras. O `fetch` do Node diz só "fetch failed": o motivo de verdade
 * (o nome que não existe, a porta fechada, o certificado) vem em `cause`.
 */
export function motivoDaFalha(e: unknown): string {
  if (!(e instanceof Error)) return String(e);
  if (e.name === 'TimeoutError') return 'não respondeu em 10 segundos';
  const causa = (e as Error & { cause?: unknown }).cause as { code?: string; message?: string } | undefined;
  const codigo = causa?.code ?? '';
  if (codigo === 'ENOTFOUND' || codigo === 'EAI_AGAIN') return 'o endereço não existe (o nome não foi achado)';
  if (codigo === 'ECONNREFUSED') return 'o endereço recusou a conexão (nada atende nessa porta)';
  if (codigo === 'ECONNRESET' || codigo === 'UND_ERR_SOCKET') return 'a conexão caiu no meio';
  if (codigo.startsWith('CERT_') || codigo.includes('SELF_SIGNED') || codigo === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE') return `o certificado do endereço não vale (${codigo})`;
  if (e.message === 'fetch failed' && causa?.message) return `não consegui falar com o endereço (${causa.message})`;
  return e.message;
}

/** O corpo do evento: o chamado como o n8n precisa (o código, onde está, o cliente, o contato, o link). */
export async function corpoDoEvento(app: FastifyInstance, evento: EventoWebhook | 'teste', ticketId: string | null, extra: Record<string, unknown> = {}) {
  let chamado: Record<string, unknown> | null = null;
  if (ticketId) {
    const ctx = await carregarContexto(app.db);
    const c = (await cartoesDe(app.db, ctx, [ticketId])).get(ticketId);
    if (c) {
      const painel = ctx.paineis.find((p) => p.id === c.painelId);
      const etapa = ctx.etapas.get(c.etapaId)?.etapa;
      chamado = {
        id: c.id, codigo: c.codigo, titulo: c.titulo, tipoChamado: c.tipoChamado,
        painel: painel ? { id: painel.id, nome: painel.nome, sigla: painel.sigla } : null,
        etapa: etapa ? { id: etapa.id, nome: etapa.nome, tipo: etapa.tipo, nivel: etapa.nivel } : null,
        situacao: c.situacao, cliente: c.cliente, contato: c.contato, responsavel: c.responsavel,
        prioridade: c.prioridade, assunto: c.assunto?.caminho ?? null, etiquetas: c.etiquetas, espera: c.espera?.tipo ?? null,
        link: linkDoChamado(app, c.codigo), criadoEm: c.criadoEm,
      };
    }
  }
  return JSON.stringify({ evento, em: new Date().toISOString(), chamado, ...extra });
}

/** Avisa os webhooks ligados a este evento (em segundo plano: o pedido da tela não espera). */
export function emitir(app: FastifyInstance, evento: EventoWebhook, ticketId: string, extra: Record<string, unknown> = {}) {
  emSegundoPlano(app, async () => {
    const ws = await app.db.select().from(ticketWebhooks)
      .where(and(isNull(ticketWebhooks.deletedAt), eq(ticketWebhooks.active, true), arrayContains(ticketWebhooks.events, [evento])));
    if (!ws.length) return;
    const corpo = await corpoDoEvento(app, evento, ticketId, extra);
    for (const w of ws) await entregar(app, w, evento, corpo);
  });
}
