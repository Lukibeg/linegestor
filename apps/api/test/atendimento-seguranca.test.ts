/**
 * Patch 2.0 — o Gestor dentro de outro site (o menu do LineChat, num iframe).
 *
 *  - o CSP sai do sistema em toda resposta, com as regras que o Caddy mandava, mas com o
 *    `frame-ancestors 'self'` mais os sites escolhidos nas Integrações (na hora em que são gravados);
 *    um site guardado torto não entra no cabeçalho; não há mais X-Frame-Options
 *  - o pedido que muda alguma coisa e vem de outro site (cabeçalho Origin) é recusado: 403; o do
 *    endereço do Gestor e o da própria origem passam; sem Origin passa; a entrada das integrações
 *    (servidor para servidor, com chave de API) não é barrada; "/%61pi/…" não escapa
 *  - o login de dentro do iframe: o cookie vai com SameSite=None, Secure e Partitioned (e funciona,
 *    também com as duas etapas); fora do iframe nada muda (Strict); sair apaga os dois
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { auditLog } from '@gestor/db';
import { makeApp, Session, type App } from './helpers.js';
import { codigo } from '../src/services/totp.js';
import * as integ from '../src/services/integracoes.js';
import { esquecerSitesDoIframe } from '../src/plugins/seguranca.js';

let app: App;
let s: Session;

const CSP_DE_ANTES = (frameAncestors: string) =>
  `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob:; connect-src 'self'; frame-ancestors ${frameAncestors}; object-src 'none'; base-uri 'self'; form-action 'self'`;
const RECUSADO = 'Pedido de outro site recusado.';

/** Um pedido com o cookie da sessão e os cabeçalhos escolhidos (o Session do helpers não deixa mudar o Origin). */
const pedir = (method: 'GET' | 'POST' | 'PUT' | 'DELETE', url: string, headers: Record<string, string> = {}, payload?: unknown) =>
  app.inject({ method, url, headers: { cookie: s.cookie, ...headers }, ...(payload !== undefined ? { payload: payload as any } : {}) });

const cookiesDe = (res: { headers: Record<string, unknown> }) => {
  const set = res.headers['set-cookie'];
  return (Array.isArray(set) ? set : set ? [set] : []) as string[];
};

beforeAll(async () => {
  app = await makeApp();
  s = new Session(app);
  await s.login();
});
afterAll(async () => { await app.close(); });

// =====================================================================

describe('o CSP (quem pode abrir o Gestor dentro de um iframe)', () => {
  it('toda resposta sai com o CSP de antes, mas com frame-ancestors self; sem X-Frame-Options', async () => {
    for (const r of [
      await app.inject({ method: 'GET', url: '/api/health' }),
      await app.inject({ method: 'GET', url: '/api/clients' }), // 401
      await app.inject({ method: 'GET', url: '/api/nao-existe' }), // 404
      await s.get('/atendimento/opcoes'),
    ]) {
      expect(r.headers['content-security-policy']).toBe(CSP_DE_ANTES("'self'"));
      expect(r.headers['x-frame-options']).toBeUndefined();
      // 2.1.2: quanto o servidor levou, para o navegador separar a demora do servidor da demora da rede
      expect(String(r.headers['server-timing'])).toMatch(/^app;dur=\d+(\.\d)?$/);
    }
  });

  it('gravou um site nas Integrações: o frame-ancestors já inclui o site no pedido seguinte', async () => {
    const r = await s.put('/atendimento/integracoes/sites', { sites: ['https://app.exemplo.com.br'] });
    expect(r.statusCode, r.body).toBe(200);
    expect((await app.inject({ method: 'GET', url: '/api/health' })).headers['content-security-policy'])
      .toBe(CSP_DE_ANTES("'self' https://app.exemplo.com.br"));
    await s.put('/atendimento/integracoes/sites', { sites: ['https://app.exemplo.com.br', 'https://outro.exemplo.com.br:8443'] });
    expect((await s.get('/auth/me')).headers['content-security-policy']).toBe(CSP_DE_ANTES("'self' https://app.exemplo.com.br https://outro.exemplo.com.br:8443"));
    await s.put('/atendimento/integracoes/sites', { sites: [] });
    expect((await app.inject({ method: 'GET', url: '/api/health' })).headers['content-security-policy']).toBe(CSP_DE_ANTES("'self'"));
  });

  it('um site guardado torto (mexido fora da tela) não entra no cabeçalho', async () => {
    await integ.gravar(app.db, 'atendimento-integracoes', { sites: ["https://bom.exemplo.com.br", "https://x.com; script-src *", 'http://sem-https.exemplo.com.br'], linkConversa: '' });
    esquecerSitesDoIframe();
    expect((await app.inject({ method: 'GET', url: '/api/health' })).headers['content-security-policy']).toBe(CSP_DE_ANTES("'self' https://bom.exemplo.com.br"));
    await integ.gravar(app.db, 'atendimento-integracoes', { sites: [], linkConversa: '' });
    esquecerSitesDoIframe();
  });
});

// =====================================================================

describe('a origem do pedido (a defesa contra o pedido forjado)', () => {
  const lidos = '/api/atendimento/avisos/lidos';

  it('o pedido que muda alguma coisa e vem de outro site: 403', async () => {
    const r = await pedir('POST', lidos, { origin: 'https://malvado.exemplo.com' }, {});
    expect(r.statusCode).toBe(403);
    expect(r.json().error).toBe(RECUSADO);
    expect((await pedir('PUT', '/api/atendimento/integracoes/sites', { origin: 'https://app.exemplo.com.br' }, { sites: [] })).statusCode).toBe(403);
    expect((await pedir('DELETE', '/api/atendimento/integracoes/chaves/qualquer', { origin: 'https://malvado.exemplo.com' })).statusCode).toBe(403);
    // o endereço sem origem de verdade (iframe isolado, arquivo aberto do disco) também
    expect((await pedir('POST', lidos, { origin: 'null' }, {})).statusCode).toBe(403);
    // e o próprio login (para ninguém ser logado na conta de outro sem saber)
    const login = await app.inject({ method: 'POST', url: '/api/auth/login', headers: { origin: 'https://malvado.exemplo.com' }, payload: { email: 'admin@gestor.local', password: 'SenhaDeTeste!123' } });
    expect(login.statusCode).toBe(403);
    expect(cookiesDe(login)).toEqual([]);
  });

  it('o endereço cru não engana: "/%61pi/…" é a mesma rota e também é conferido', async () => {
    const r = await pedir('POST', '/%61pi/atendimento/avisos/lidos', { origin: 'https://malvado.exemplo.com' }, {});
    expect(r.statusCode).toBe(403);
  });

  it('do endereço do Gestor (WEB_ORIGIN) ou da própria origem do pedido: passa', async () => {
    expect((await pedir('POST', lidos, { origin: 'http://localhost:5173' }, {})).statusCode).toBe(200);
    // o pedido de teste chega como "localhost:80": a própria origem é http://localhost
    expect((await pedir('POST', lidos, { origin: 'http://localhost' }, {})).statusCode).toBe(200);
    // atrás do Caddy: o https e o domínio vêm nos cabeçalhos do proxy
    expect((await pedir('POST', lidos, {
      origin: 'https://gestao.exemplo.com.br', 'x-forwarded-proto': 'https', 'x-forwarded-host': 'gestao.exemplo.com.br',
    }, {})).statusCode).toBe(200);
  });

  it('sem Origin (curl, servidor, navegador antigo): passa; e só leitura nunca é barrada', async () => {
    expect((await pedir('POST', lidos, {}, {})).statusCode).toBe(200);
    expect((await pedir('GET', '/api/auth/me', { origin: 'https://malvado.exemplo.com' })).statusCode).toBe(200);
  });

  it('a entrada das integrações (servidor para servidor, com chave de API) não é barrada pela origem', async () => {
    for (const url of ['/api/atendimento/entrada/chamado', '/api/atendimento/entrada/robo', '/api/atendimento/integracao/chamados/SUP-1/anotacoes']) {
      const r = await app.inject({ method: 'POST', url, headers: { origin: 'https://n8n.exemplo.com.br' }, payload: { telefone: '71999990000', texto: 'oi' } });
      // sem chave de API válida a rota recusa do jeito dela (ou não existe ainda): o que não pode é ser o 403 da origem
      expect(r.json().error, `${url}: ${r.statusCode}`).not.toBe(RECUSADO);
    }
    // a exceção é só para esses caminhos: as Integrações da tela (com cookie) continuam conferidas, o mapa do robô também
    const parecido = await app.inject({ method: 'POST', url: '/api/atendimento/integracoes/chaves', headers: { origin: 'https://n8n.exemplo.com.br', cookie: s.cookie }, payload: { nome: 'x' } });
    expect(parecido.json().error).toBe(RECUSADO);
    const mapa = await app.inject({ method: 'PUT', url: '/api/atendimento/integracoes/robo', headers: { origin: 'https://n8n.exemplo.com.br', cookie: s.cookie }, payload: {} });
    expect(mapa.json().error).toBe(RECUSADO);
  });
});

// =====================================================================

describe('o login dentro de outro site (iframe)', () => {
  const entrar = (payload: Record<string, unknown>) => app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: 'admin@gestor.local', password: 'SenhaDeTeste!123', ...payload } });

  it('embutido: o cookie vai com SameSite=None, Secure e Partitioned — e funciona', async () => {
    const r = await entrar({ embutido: true });
    expect(r.statusCode, r.body).toBe(200);
    const [cookie] = cookiesDe(r);
    expect(cookie).toMatch(/; SameSite=None/);
    expect(cookie).toMatch(/; Secure/);
    expect(cookie).toMatch(/; Partitioned/);
    expect(cookie).toMatch(/; HttpOnly/);
    expect((await app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie: cookie!.split(';')[0]! } })).statusCode).toBe(200);
    const audit = JSON.stringify(await app.db.select().from(auditLog));
    expect(audit).toContain('Administrador entrou (com o Gestor aberto dentro de outro site)');
  });

  it('fora do iframe nada muda: SameSite=Strict, sem Partitioned', async () => {
    for (const payload of [{}, { embutido: false }]) {
      const [cookie] = cookiesDe(await entrar(payload));
      expect(cookie).toMatch(/; SameSite=Strict/);
      expect(cookie).not.toMatch(/Partitioned/);
      expect(cookie).not.toMatch(/SameSite=None/);
    }
  });

  it('com as duas etapas: a sessão pendente também ganha o cookie do iframe, e o código confirma', async () => {
    const papeis = (await s.get('/admin/roles')).json();
    await s.post('/admin/users', { name: 'Gestora Duas Etapas', email: 'gestora@gestor.local', password: 'SenhaDeTeste!123', roleId: papeis.find((p: any) => p.key === 'administrador').id });
    const gestora = new Session(app);
    await gestora.login('gestora@gestor.local', 'SenhaDeTeste!123');
    const { secret } = (await gestora.post('/auth/two-factor/setup')).json();
    expect((await gestora.post('/auth/two-factor/enable', { code: codigo(secret) })).statusCode).toBe(200);

    const r = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: 'gestora@gestor.local', password: 'SenhaDeTeste!123', embutido: true } });
    expect(r.json()).toMatchObject({ needsCode: true, user: null });
    const [cookie] = cookiesDe(r);
    expect(cookie).toMatch(/; SameSite=None/);
    expect(cookie).toMatch(/; Partitioned/);
    // a validade inteira no cookie (os 10 minutos da sessão pendente valem no banco)
    expect(cookie).toMatch(/; Max-Age=604800/);
    const sessao = cookie!.split(';')[0]!;
    expect((await app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie: sessao } })).statusCode).toBe(401);
    const confirma = await app.inject({ method: 'POST', url: '/api/auth/login/code', headers: { cookie: sessao }, payload: { code: codigo(secret) } });
    expect(confirma.statusCode, confirma.body).toBe(200);
    expect((await app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie: sessao } })).json().email).toBe('gestora@gestor.local');
  });

  it('sair apaga os dois cookies (o normal e o do iframe)', async () => {
    const r = await entrar({ embutido: true });
    const sessao = cookiesDe(r)[0]!.split(';')[0]!;
    const sair = await app.inject({ method: 'POST', url: '/api/auth/logout', headers: { cookie: sessao } });
    expect(sair.statusCode).toBe(200);
    const apagados = cookiesDe(sair);
    expect(apagados).toHaveLength(2);
    expect(apagados.every((c) => c.startsWith('gestor_session=;') && /Max-Age=0/.test(c))).toBe(true);
    expect(apagados.filter((c) => /Partitioned/.test(c))).toHaveLength(1);
    expect((await app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie: sessao } })).statusCode).toBe(401);
  });
});
