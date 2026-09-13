import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { makeApp, Session, type App } from './helpers.js';

let app: App;
beforeAll(async () => { app = await makeApp(); });
afterAll(async () => { await app.close(); });

describe('sessão', () => {
  it('recusa senha errada com a mesma mensagem de usuário inexistente', async () => {
    const a = await app.inject({ method: 'POST', url: '/auth/login', payload: { email: 'admin@gestor.local', password: 'errada' } });
    const b = await app.inject({ method: 'POST', url: '/auth/login', payload: { email: 'ninguem@x.com', password: 'errada' } });
    expect(a.statusCode).toBe(401);
    expect(b.statusCode).toBe(401);
    expect(a.json().error).toBe(b.json().error);
  });

  it('entra, diz quem sou e sai', async () => {
    const s = new Session(app);
    const me = await s.login();
    expect(me.roleKey).toBe('administrador');
    expect(me.permissions).toContain('secrets.reveal');
    const r = await s.get('/auth/me');
    expect(r.statusCode).toBe(200);
    await s.post('/auth/logout');
    const r2 = await s.get('/auth/me');
    expect(r2.statusCode).toBe(401);
  });

  it('sem login, rotas protegidas respondem 401', async () => {
    const r = await app.inject({ method: 'GET', url: '/clients' });
    expect(r.statusCode).toBe(401);
  });

  it('a página de documentação existe', async () => {
    const r = await app.inject({ method: 'GET', url: '/docs/json' });
    expect(r.statusCode).toBe(200);
    expect(r.json().info.title).toContain('Gestor');
  });
});
