import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { makeApp, Session, type App } from './helpers.js';
import { codigo } from '../src/services/totp.js';

let app: App;
beforeAll(async () => { app = await makeApp(); });
afterAll(async () => { await app.close(); });

describe('sessão', () => {
  it('recusa senha errada com a mesma mensagem de usuário inexistente', async () => {
    const a = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: 'admin@gestor.local', password: 'errada' } });
    const b = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: 'ninguem@x.com', password: 'errada' } });
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
    const r = await app.inject({ method: 'GET', url: '/api/clients' });
    expect(r.statusCode).toBe(401);
  });

  it('a página de documentação existe', async () => {
    const r = await app.inject({ method: 'GET', url: '/api/docs/json' });
    expect(r.statusCode).toBe(200);
    expect(r.json().info.title).toContain('Ingline Gestão');
  });
});

describe('verificação em duas etapas', () => {
  it('liga, exige o código no login e aceita código de recuperação uma vez só', async () => {
    const s = new Session(app);
    await s.login();

    // 1. gerar o segredo (o QR Code)
    const setup = await s.post('/auth/two-factor/setup');
    expect(setup.statusCode).toBe(200);
    const { secret, qrSvg } = setup.json();
    expect(qrSvg).toContain('<svg');

    // 2. código errado não liga
    expect((await s.post('/auth/two-factor/enable', { code: '000000' })).statusCode).toBe(400);

    // 3. código certo liga e devolve os códigos de recuperação (uma vez só)
    const ligar = await s.post('/auth/two-factor/enable', { code: codigo(secret) });
    expect(ligar.statusCode).toBe(200);
    const recuperacao: string[] = ligar.json().recovery;
    expect(recuperacao).toHaveLength(10);
    expect((await s.get('/auth/me')).json()).toMatchObject({ twoFactor: true, recoveryLeft: 10 });

    // 4. agora a senha sozinha não entra: a sessão nasce pendente
    const s2 = new Session(app);
    expect(await s2.login()).toMatchObject({ needsCode: true, user: null });
    expect((await s2.get('/auth/me')).statusCode).toBe(401); // pendente não vale como login
    expect((await s2.get('/clients')).statusCode).toBe(401);

    // 5. código errado é recusado; o certo entra
    expect((await s2.codigo('123456')).statusCode).toBe(401);
    expect((await s2.codigo(codigo(secret))).statusCode).toBe(200);
    expect((await s2.get('/auth/me')).statusCode).toBe(200);

    // 6. código de recuperação serve uma vez e some
    const s3 = new Session(app);
    await s3.login();
    const umCodigo = recuperacao[0]!;
    expect((await s3.codigo(umCodigo)).statusCode).toBe(200);
    expect((await s3.get('/auth/me')).json().recoveryLeft).toBe(9);
    const s4 = new Session(app);
    await s4.login();
    expect((await s4.codigo(umCodigo)).statusCode).toBe(401); // já foi gasto

    // 7. desligar exige a senha
    expect((await s.post('/auth/two-factor/disable', { password: 'errada' })).statusCode).toBe(401);
    expect((await s.post('/auth/two-factor/disable', { password: 'SenhaDeTeste!123' })).statusCode).toBe(200);
    expect((await s.get('/auth/me')).json()).toMatchObject({ twoFactor: false });
  });
});

describe('ajustes (backup e avisos)', () => {
  it('guarda a chave do Drive e o token no cofre, sem devolvê-los', async () => {
    const s = new Session(app);
    await s.login();

    // começa vazio
    expect((await s.get('/settings/backup')).json()).toMatchObject({ ativo: false, temChave: false });

    // chave inválida é recusada com uma explicação em português
    const ruim = await s.put('/settings/backup', { ativo: true, pasta: 'x', pastaId: 'abc', chaveJson: '{"type":"outro"}' });
    expect(ruim.statusCode).toBeGreaterThanOrEqual(400);

    const chave = JSON.stringify({ type: 'service_account', client_email: 'robo@projeto.iam.gserviceaccount.com', private_key: '-----BEGIN PRIVATE KEY-----\nfake\n-----END PRIVATE KEY-----\n' });
    const salvo = await s.put('/settings/backup', { ativo: true, pasta: 'Backups', pastaId: 'ID-DA-PASTA', chaveJson: chave });
    expect(salvo.statusCode).toBe(200);
    expect(salvo.json()).toMatchObject({ ativo: true, pastaId: 'ID-DA-PASTA', temChave: true, contaDeServico: 'robo@projeto.iam.gserviceaccount.com' });
    // a chave NUNCA volta na resposta
    expect(JSON.stringify(salvo.json())).not.toContain('BEGIN PRIVATE KEY');

    // salvar de novo sem mandar a chave mantém a que já estava lá
    const denovo = await s.put('/settings/backup', { ativo: false, pasta: 'Backups', pastaId: 'ID-DA-PASTA' });
    expect(denovo.json()).toMatchObject({ ativo: false, temChave: true });

    // avisos: o token some da resposta do mesmo jeito
    const avisos = await s.put('/settings/alerts', { ativo: true, url: 'https://linechat.exemplo/api', metodo: 'POST', cabecalhos: '{"Authorization":"Bearer {{token}}"}', corpo: '{"mensagem":"{{mensagem}}"}', token: 'segredo-do-linechat' });
    expect(avisos.json()).toMatchObject({ ativo: true, temToken: true });
    expect(JSON.stringify(avisos.json())).not.toContain('segredo-do-linechat');

    // quem não administra não chega perto
    const papeis = (await s.get('/admin/roles')).json();
    const leitorRole = papeis.find((r: any) => r.key === 'leitor');
    const leitor = new Session(app);
    await s.post('/admin/users', { name: 'Leitora', email: 'leitora@gestor.local', password: 'SenhaDeTeste!123', roleId: leitorRole.id });
    await leitor.login('leitora@gestor.local', 'SenhaDeTeste!123');
    expect((await leitor.get('/settings/backup')).statusCode).toBe(403);
    expect((await leitor.put('/settings/alerts', { ativo: false, url: '', metodo: 'POST', cabecalhos: '{}', corpo: '' })).statusCode).toBe(403);
  });
});
