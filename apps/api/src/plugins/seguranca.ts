/**
 * A SEGURANÇA DAS PÁGINAS (Patch 2.0): quem pode abrir o Gestor dentro de um iframe e a defesa contra
 * o pedido forjado por outro site (CSRF).
 *
 * Por que mudou: o Luan pediu para o Gestor abrir dentro de outros programas ("tire esse bloqueio,
 * quero que abra iframe em outros programas") — o primeiro é o menu do LineChat. Até a 1.9 o Caddy
 * proibia qualquer iframe (`X-Frame-Options: DENY` e `frame-ancestors 'none'`) e o cookie da equipe era
 * `SameSite=Strict`, que já segurava o CSRF sozinho. Agora:
 *
 *  1. **O Content-Security-Policy sai daqui, em toda resposta**, com as mesmas regras que o Caddy
 *     mandava — menos o `frame-ancestors`, que passa a ser `'self'` mais os sites escolhidos em Painéis ›
 *     Ajustes › Integrações (`settings.atendimento-integracoes.sites`). A lista fica 30 segundos na
 *     memória (para não ler o banco a cada pedido) e é esquecida na hora em que alguém a grava. O Caddy
 *     não manda mais CSP nenhum: num lugar só, a regra não briga com ela mesma. A rota que já põe o seu
 *     próprio CSP (a logo do portal, que pode ser SVG) fica com o dela.
 *
 *  2. **A conferência da origem.** Dentro do iframe o cookie precisa ser `SameSite=None` (senão o
 *     navegador nem o manda), e aí o `SameSite` deixa de segurar o pedido forjado. Quem segura passa a
 *     ser o cabeçalho `Origin`, que o navegador põe sozinho e nenhuma página consegue falsificar: todo
 *     POST/PUT/PATCH/DELETE na API que vem de outro site é recusado. Valem o endereço do Gestor
 *     (`WEB_ORIGIN`, pode ser uma lista) e a própria origem do pedido. Sem `Origin` (curl, servidor, um
 *     navegador muito antigo) passa: o CSRF é sempre de navegador, e navegador de hoje sempre manda.
 *     Ficam de fora a entrada das integrações e a integração dos chamados (`/api/atendimento/entrada/`
 *     e `/api/atendimento/integracao/`): são de servidor para servidor, com chave de API, sem cookie.
 */
import fp from 'fastify-plugin';
import type { FastifyInstance } from 'fastify';
import { Forbidden } from './errors.js';
import * as integ from '../services/integracoes.js';

/** O mesmo formato que a tela aceita (`SitesIframeSchema`): só https, só o endereço do site. Conferido de novo na leitura: o que vai para um cabeçalho não pode trazer nada além disso. */
const SITE = /^https:\/\/[a-z0-9.-]+(:\d+)?$/i;

/** A política de conteúdo: a do Caddy até a 1.9, com o `frame-ancestors` aberto para o próprio Gestor e os sites escolhidos. */
export function politicaDeConteudo(sites: string[]): string {
  return [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: blob:",
    "connect-src 'self'",
    ["frame-ancestors 'self'", ...sites].join(' '),
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ');
}

const CACHE_MS = 30_000;
let cache: { sites: string[]; ate: number } | null = null;
/** Muda a cada "esquecer": uma leitura que começou antes da gravação não guarda a lista velha no cache. */
let geracao = 0;

/** Chamado quando a lista de sites é gravada: o próximo pedido já sai com a lista nova. */
export function esquecerSitesDoIframe() {
  cache = null;
  geracao++;
}

async function sitesDoIframe(app: FastifyInstance): Promise<string[]> {
  if (cache && cache.ate > Date.now()) return cache.sites;
  const desta = geracao;
  try {
    const { valor } = await integ.ler<{ sites?: unknown }>(app.db, 'atendimento-integracoes');
    const sites = (Array.isArray(valor.sites) ? valor.sites : []).filter((s): s is string => typeof s === 'string' && SITE.test(s));
    if (desta === geracao) cache = { sites, ate: Date.now() + CACHE_MS };
    return sites;
  } catch (e) {
    // sem o banco, o Gestor abre só nele mesmo (o mais fechado); a próxima resposta tenta ler de novo
    app.log.warn({ err: e }, 'segurança: não deu para ler os sites que podem abrir o Gestor');
    return [];
  }
}

const ESCREVE = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
/** De servidor para servidor (chave de API, sem cookie): o robô do LineChat e o n8n podem mandar qualquer Origin. */
const DE_SERVIDOR = ['/api/atendimento/entrada/', '/api/atendimento/integracao/'];

/** "https://Gestao.exemplo.com.br:443/" → "https://gestao.exemplo.com.br"; o que não for endereço vira nulo. */
function origem(s: string | undefined): string | null {
  if (!s) return null;
  try {
    const o = new URL(s).origin;
    return o === 'null' ? null : o;
  } catch {
    return null;
  }
}

export default fp(async function seguranca(app: FastifyInstance) {
  const daEquipe = new Set(app.config.WEB_ORIGIN.split(',').map((s) => origem(s.trim())).filter((o): o is string => !!o));

  app.addHook('onRequest', async (req) => {
    if (!ESCREVE.has(req.method)) return;
    const pedida = req.headers.origin;
    if (!pedida) return;
    // a rota que casou, e não o endereço cru: "/%61pi/auth/login" casa com "/api/auth/login" e não escapa daqui
    const rota = req.routeOptions.url ?? req.url.split('?')[0] ?? '';
    if (!rota.startsWith('/api/') || DE_SERVIDOR.some((p) => rota.startsWith(p))) return;
    const o = origem(pedida);
    if (o && (daEquipe.has(o) || o === origem(`${req.protocol}://${req.host}`))) return;
    req.log.warn({ origem: pedida, rota }, 'segurança: pedido de outro site recusado');
    throw new Forbidden('Pedido de outro site recusado.');
  });

  app.addHook('onSend', async (_req, reply, payload) => {
    if (!reply.hasHeader('content-security-policy')) reply.header('Content-Security-Policy', politicaDeConteudo(await sitesDoIframe(app)));
    return payload;
  });
});
