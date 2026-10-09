/**
 * Patch 1.9 — a equipe entra no portal do cliente com o login do Gestor (decisão 0044).
 *
 * Pedido do Luan (09/10): "todos que têm uma senha como usuário do Ingline Gestão têm um login
 * idêntico para o portal do cliente, criado automaticamente". Ficou assim:
 *  - o mesmo e-mail e a mesma senha do Gestor entram no portal; nada a criar (vale para quem já
 *    existe e para quem for criado depois)
 *  - a equipe vê todos os tutoriais publicados (o rascunho, não); a visita dela não conta
 *  - quem usa o código de 6 dígitos no Gestor digita o código no portal também
 *  - desativado no Gestor, não entra, e a sessão aberta cai; senha trocada no Gestor derruba as
 *    sessões do portal
 *  - a senha da equipe não se troca pelo portal; o cookie do portal não abre o Gestor
 *  - um acesso de cliente com o mesmo e-mail continua valendo: a senha decide qual entra
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { newId, portalSessions, productModules, products, subscriptionModules, subscriptions } from '@gestor/db';
import { codigo } from '../src/services/totp.js';
import { makeApp, Session, type App } from './helpers.js';

let app: App;
let s: Session;          // administrador
let operador: Session;   // escreve no portal
let marinaId = '';
let aurora = '';
const ids: Record<string, string> = {};
const numeros: Record<string, number> = {};
const SENHA = 'SenhaDeTeste!123';

/** Um "navegador" no portal: guarda o cookie do portal. */
class NoPortal {
  cookie = '';
  constructor(private app: App) {}
  private guardar(res: Awaited<ReturnType<App['inject']>>) {
    const set = res.headers['set-cookie'];
    const linhas = (Array.isArray(set) ? set : set ? [set] : []).map(String);
    const minha = linhas.find((l) => l.startsWith('gestor_portal='));
    if (minha) this.cookie = minha.split(';')[0]!;
    return res;
  }
  async req(method: 'GET' | 'POST', url: string, payload?: unknown) {
    return this.guardar(await this.app.inject({ method, url: '/api' + url, payload: payload as any, headers: { cookie: this.cookie } }));
  }
  get(url: string) { return this.req('GET', url); }
  post(url: string, payload?: unknown) { return this.req('POST', url, payload); }
  entrar(email: string, senha: string) { return this.post('/portal/entrar', { email, senha }); }
  entrarComCodigo(email: string, senha: string, cod: string) { return this.post('/portal/entrar/codigo', { email, senha, codigo: cod }); }
}

const tutorial = (o: Record<string, unknown> = {}) => ({
  titulo: 'Como transferir uma ligação', resumo: 'Passe a ligação para outro ramal sem derrubar.',
  texto: '1. Aperte TRANSF.\n2. Digite o ramal e aperte TRANSF de novo.', publicar: true, ...o,
});

beforeAll(async () => {
  app = await makeApp();
  s = new Session(app);
  await s.login();
  const papeis = (await s.get('/admin/roles')).json();
  const idDe = (key: string) => papeis.find((r: any) => r.key === key).id;
  marinaId = (await s.post('/admin/users', { name: 'Marina Costa', email: 'marina@gestor.local', password: SENHA, roleId: idDe('operador') })).json().id;
  await s.post('/admin/users', { name: 'Lúcio Andrade', email: 'lucio@gestor.local', password: SENHA, roleId: idDe('tecnico') });
  operador = new Session(app); await operador.login('marina@gestor.local', SENHA);

  aurora = (await s.post('/clients', { tradeName: 'Clínica Aurora', legalName: 'Clínica Aurora LTDA', cnpj: '11.222.333/0001-81' })).json().id;
  const ps = await app.db.select({ id: products.id, code: products.code }).from(products);
  const ms = await app.db.select({ id: productModules.id, code: productModules.code, productId: productModules.productId }).from(productModules);
  ids.linepbx = ps.find((p) => p.code === 'linepbx')!.id;
  ids.linechat = ps.find((p) => p.code === 'linechat')!.id;
  ids.fop2 = ms.find((m) => m.productId === ids.linepbx && m.code === 'fop2')!.id;
  ids.omniboard = ms.find((m) => m.productId === ids.linepbx && m.code === 'omniboard')!.id;
  const sub = newId();
  await app.db.insert(subscriptions).values({ id: sub, clientId: aurora, productId: ids.linepbx, activatedAt: new Date('2024-01-01') });
  await app.db.insert(subscriptionModules).values({ id: newId(), subscriptionId: sub, moduleId: ids.fop2, activatedAt: new Date('2024-01-01') });

  numeros.geral = (await operador.post('/portal-admin/tutoriais', tutorial({ titulo: 'Como abrir um chamado com o suporte' }))).json().numero;
  numeros.linepbx = (await operador.post('/portal-admin/tutoriais', tutorial({ produtoId: ids.linepbx }))).json().numero;
  numeros.fop2 = (await operador.post('/portal-admin/tutoriais', tutorial({ titulo: 'FOP2: ver quem está em ligação', produtoId: ids.linepbx, moduloId: ids.fop2 }))).json().numero;
  numeros.omniboard = (await operador.post('/portal-admin/tutoriais', tutorial({ titulo: 'Omniboard: pegar a chamada da fila', produtoId: ids.linepbx, moduloId: ids.omniboard }))).json().numero;
  numeros.linechat = (await operador.post('/portal-admin/tutoriais', tutorial({ titulo: 'LineChat: responder pelo celular', produtoId: ids.linechat }))).json().numero;
  numeros.rascunho = (await operador.post('/portal-admin/tutoriais', tutorial({ titulo: 'Rascunho do URA', produtoId: ids.linepbx, publicar: false, texto: null }))).json().numero;
});
afterAll(async () => { await app.close(); });

describe('a equipe entra no portal com o login do Gestor', () => {
  it('o mesmo e-mail e a mesma senha; nada a criar; vê todos os tutoriais publicados', async () => {
    const marina = new NoPortal(app);
    const r = await marina.entrar('Marina@Gestor.local', SENHA);
    expect(r.statusCode).toBe(200);
    expect(r.json()).toMatchObject({ nome: 'Marina Costa', email: 'marina@gestor.local', equipe: true, cliente: { nome: 'Equipe Ingline', logo: null } });
    expect((await marina.get('/portal/eu')).json().equipe).toBe(true);
    // todos os publicados, de todos os produtos e módulos — o rascunho não
    const vistos = (await marina.get('/portal/tutoriais')).json().items.map((t: any) => t.numero).sort();
    expect(vistos).toEqual([numeros.geral, numeros.linepbx, numeros.fop2, numeros.omniboard, numeros.linechat].sort());
    expect((await marina.get(`/portal/tutoriais/${numeros.rascunho}`)).statusCode).toBe(404);
    const inicio = (await marina.get('/portal/inicio')).json();
    expect(inicio.total).toBe(5);
    expect(inicio.produtos.filter((p: any) => p.tutoriais > 0).map((p: any) => p.id).sort()).toEqual([ids.linepbx, ids.linechat].sort());
    // a visita da equipe não conta: o número é o dos clientes
    expect((await marina.get(`/portal/tutoriais/${numeros.linechat}`)).statusCode).toBe(200);
    const lista = (await s.get('/portal-admin/tutoriais')).json().items;
    expect(lista.find((x: any) => x.numero === numeros.linechat).visualizacoes).toBe(0);
    // o portal não abre o Gestor
    expect((await app.inject({ method: 'GET', url: '/api/clients', headers: { cookie: marina.cookie } })).statusCode).toBe(401);
  });

  it('senha errada: a mesma mensagem de e-mail que não existe; a entrada fica na auditoria', async () => {
    const a = await new NoPortal(app).entrar('marina@gestor.local', 'errada123');
    const b = await new NoPortal(app).entrar('ninguem@gestor.local', 'errada123');
    expect([a.statusCode, b.statusCode]).toEqual([401, 401]);
    expect(a.json().error).toBe(b.json().error);
    const resumos: string[] = (await s.get('/admin/audit?entityType=portal&pageSize=200')).json().items.map((x: any) => x.summary);
    expect(resumos).toContain('Marina Costa entrou no portal do cliente com o login da equipe');
    expect(resumos).toContain('Tentativa de entrar no portal falhou para marina@gestor.local');
  });

  it('a senha da equipe não se troca pelo portal', async () => {
    const marina = new NoPortal(app);
    await marina.entrar('marina@gestor.local', SENHA);
    const r = await marina.post('/portal/senha', { atual: SENHA, nova: 'OutraSenha2026' });
    expect(r.statusCode).toBe(400);
    expect(r.json().error).toMatch(/Ingline Gestão/);
  });

  it('senha trocada no Gestor derruba as sessões do portal; desativado não entra, e a sessão cai', async () => {
    const marina = new NoPortal(app);
    await marina.entrar('marina@gestor.local', SENHA);
    // o administrador redefine a senha: a sessão do portal cai, a senha antiga não entra mais
    expect((await s.patch(`/admin/users/${marinaId}`, { password: 'SenhaNovaDaMarina1' })).statusCode).toBe(200);
    expect((await marina.get('/portal/eu')).statusCode).toBe(401);
    expect((await new NoPortal(app).entrar('marina@gestor.local', SENHA)).statusCode).toBe(401);
    expect((await marina.entrar('marina@gestor.local', 'SenhaNovaDaMarina1')).statusCode).toBe(200);
    // ela mesma troca a senha no Gestor (Minha conta): também cai
    const noGestor = new Session(app); await noGestor.login('marina@gestor.local', 'SenhaNovaDaMarina1');
    expect((await noGestor.post('/auth/change-password', { currentPassword: 'SenhaNovaDaMarina1', newPassword: SENHA })).statusCode).toBe(200);
    expect((await marina.get('/portal/eu')).statusCode).toBe(401);
    expect((await marina.entrar('marina@gestor.local', SENHA)).statusCode).toBe(200);
    // desativado no Gestor: a sessão aberta cai e não entra de novo
    expect((await s.patch(`/admin/users/${marinaId}`, { active: false })).statusCode).toBe(200);
    expect((await marina.get('/portal/eu')).statusCode).toBe(401);
    const recusado = await new NoPortal(app).entrar('marina@gestor.local', SENHA);
    expect(recusado.statusCode).toBe(401);
    expect(recusado.json().error).toBe('E-mail ou senha incorretos');
    // mesmo que a sessão não tivesse sido apagada, a conferência de cada pedido barra o desativado
    const sid = newId();
    await app.db.insert(portalSessions).values({ id: sid, staffUserId: marinaId, expiresAt: new Date(Date.now() + 86_400_000) });
    const assinado = app.signCookie(sid);
    expect((await app.inject({ method: 'GET', url: '/api/portal/eu', headers: { cookie: `gestor_portal=${encodeURIComponent(assinado)}` } })).statusCode).toBe(401);
    await app.db.delete(portalSessions).where(eq(portalSessions.id, sid));
    // reativada, volta com a mesma senha
    await s.patch(`/admin/users/${marinaId}`, { active: true });
    expect((await new NoPortal(app).entrar('marina@gestor.local', SENHA)).statusCode).toBe(200);
  });
});

describe('quem usa o código de 6 dígitos no Gestor', () => {
  it('a senha sozinha não entra; o código errado é recusado; o certo entra; a recuperação vale uma vez', async () => {
    // o Lúcio liga a verificação em duas etapas no Gestor
    const lucioNoGestor = new Session(app);
    await lucioNoGestor.login('lucio@gestor.local', SENHA);
    const { secret } = (await lucioNoGestor.post('/auth/two-factor/setup')).json();
    const recuperacao: string[] = (await lucioNoGestor.post('/auth/two-factor/enable', { code: codigo(secret) })).json().recovery;

    const lucio = new NoPortal(app);
    const so = await lucio.entrar('lucio@gestor.local', SENHA);
    expect(so.statusCode).toBe(200);
    expect(so.json()).toEqual({ precisaCodigo: true });
    expect(lucio.cookie).toBe('');
    expect((await lucio.get('/portal/eu')).statusCode).toBe(401);

    expect((await lucio.entrarComCodigo('lucio@gestor.local', SENHA, '123456')).statusCode).toBe(401);
    expect((await lucio.entrarComCodigo('lucio@gestor.local', 'errada123', codigo(secret))).statusCode).toBe(401);
    expect(lucio.cookie).toBe('');
    const certo = await lucio.entrarComCodigo('lucio@gestor.local', SENHA, codigo(secret));
    expect(certo.statusCode).toBe(200);
    expect(certo.json()).toMatchObject({ nome: 'Lúcio Andrade', equipe: true });
    expect((await lucio.get('/portal/eu')).statusCode).toBe(200);

    // o código de recuperação serve (uma vez) e conta no Gestor
    expect((await new NoPortal(app).entrarComCodigo('lucio@gestor.local', SENHA, recuperacao[0]!)).statusCode).toBe(200);
    expect((await lucioNoGestor.get('/auth/me')).json().recoveryLeft).toBe(9);
    expect((await new NoPortal(app).entrarComCodigo('lucio@gestor.local', SENHA, recuperacao[0]!)).statusCode).toBe(401);

    const resumos: string[] = (await s.get('/admin/audit?entityType=portal&pageSize=200')).json().items.map((x: any) => x.summary);
    expect(resumos).toContain('Código de verificação incorreto ao entrar no portal do cliente');
    expect(resumos).toContain('Lúcio Andrade entrou no portal do cliente com o login da equipe (com verificação em duas etapas)');
    expect(resumos).toContain('Lúcio Andrade entrou no portal do cliente com o login da equipe, usando um código de recuperação');
  });

  it('o acesso de cliente com o mesmo e-mail continua valendo: a senha decide qual entra', async () => {
    const r = await operador.post(`/portal-admin/clientes/${aurora}/acessos`, { nome: 'Marina (teste)', email: 'marina@gestor.local' });
    expect(r.statusCode).toBe(201);
    const cod = r.json().convite.split('/').pop();
    expect((await new NoPortal(app).post(`/portal/convite/${cod}`, { senha: 'Aurora2026!' })).statusCode).toBe(200);
    const comoCliente = await new NoPortal(app).entrar('marina@gestor.local', 'Aurora2026!');
    expect(comoCliente.json()).toMatchObject({ equipe: false, cliente: { nome: 'Clínica Aurora' } });
    const comoEquipe = await new NoPortal(app).entrar('marina@gestor.local', SENHA);
    expect(comoEquipe.json()).toMatchObject({ equipe: true, cliente: { nome: 'Equipe Ingline' } });
  });

  it('o banco não aceita sessão do portal sem dono, nem com dois', async () => {
    const base = { expiresAt: new Date(Date.now() + 86_400_000) };
    await expect(app.db.insert(portalSessions).values({ id: newId(), ...base })).rejects.toThrow();
    const [u] = (await s.get(`/portal-admin/clientes/${aurora}/acessos`)).json().acessos;
    await expect(app.db.insert(portalSessions).values({ id: newId(), portalUserId: u.id, staffUserId: marinaId, ...base })).rejects.toThrow();
  });
});
