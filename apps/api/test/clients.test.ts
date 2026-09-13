import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { makeApp, Session, type App } from './helpers.js';

let app: App;
let s: Session;
beforeAll(async () => { app = await makeApp(); s = new Session(app); await s.login(); });
afterAll(async () => { await app.close(); });

const cliente = { tradeName: 'Clínica Aurora', legalName: 'Clínica Aurora LTDA', cnpj: '11.222.333/0001-81' };

describe('clientes', () => {
  it('recusa CNPJ inválido com mensagem em português', async () => {
    const r = await s.post('/clients', { ...cliente, cnpj: '11.222.333/0001-82' });
    expect(r.statusCode).toBe(400);
    expect(JSON.stringify(r.json())).toMatch(/CNPJ/);
  });

  it('cria, guarda o CNPJ só com dígitos e não deixa duplicar', async () => {
    const r = await s.post('/clients', cliente);
    expect(r.statusCode).toBe(201);
    expect(r.json().cnpj).toBe('11222333000181');
    const dup = await s.post('/clients', { ...cliente, tradeName: 'Outra' });
    expect(dup.statusCode).toBe(400);
  });

  it('marca produtos, guarda a senha SSH no cofre e monta os atalhos sem senha', async () => {
    const list = await s.get('/clients?q=aurora');
    const id = list.json().items[0].id;
    const r = await s.put(`/clients/${id}/subscriptions`, {
      productCode: 'linepbx',
      settings: { domain: 'aurora.linepbx.com.br', serverIp: '203.0.113.10', sshUser: 'root', sshPort: 22, sshPassword: 'segredo-muito-secreto' },
    });
    expect(r.statusCode).toBe(200);
    // FOP2 é um módulo do LinePBX
    const m = await s.put(`/clients/${id}/modules`, { productCode: 'linepbx', moduleCode: 'fop2', settings: { adminExtension: '1000' } });
    expect(m.statusCode).toBe(200);
    const ficha = (await s.get(`/clients/${id}`)).json();
    const lp = ficha.subscriptions.find((x: any) => x.productCode === 'linepbx');
    expect(lp.settings.sshPassword.hasSecret).toBe(true);
    expect(lp.modules.map((x: any) => x.moduleCode)).toEqual(['fop2']);
    expect(lp.modules[0].settings.adminExtension).toBe('1000');
    expect(JSON.stringify(ficha)).not.toContain('segredo-muito-secreto');
    expect(ficha.links.web).toBe('https://aurora.linepbx.com.br');
    expect(ficha.links.ssh).toBe('ssh://root@203.0.113.10:22');
    expect(ficha.links.fop2).toBe('https://aurora.linepbx.com.br/fop2/');
    // a lista traz os detalhes que viram colunas: ativação, módulos, servidor
    const item = (await s.get('/clients?q=aurora')).json().items[0];
    expect(item.server.serverIp).toBe('203.0.113.10');
    expect(item.products.find((p: any) => p.code === 'linepbx').modules[0].name).toBe('FOP2');

    // revelar exige confirmar a senha e fica na auditoria
    const sid = lp.settings.sshPassword.secretId;
    const bad = await s.post(`/secrets/${sid}/reveal`, { password: 'errada' });
    expect(bad.statusCode).toBe(401);
    const ok = await s.post(`/secrets/${sid}/reveal`, { password: 'SenhaDeTeste!123' });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().value).toBe('segredo-muito-secreto');
    const audit = (await s.get('/admin/audit?action=reveal_secret')).json();
    expect(audit.total).toBe(1);
    expect(audit.items[0].summary).toContain('revelou');

    // gravar de novo sem senha mantém a atual
    await s.put(`/clients/${id}/subscriptions`, { productCode: 'linepbx', settings: { sshPort: 2222 } });
    const again = (await s.get(`/clients/${id}`)).json().subscriptions.find((x: any) => x.productCode === 'linepbx');
    expect(again.settings.sshPort).toBe(2222);
    expect(again.settings.sshPassword.secretId).toBe(sid);
  });

  it('módulo só liga dentro de produto que o cliente assina', async () => {
    const id = (await s.get('/clients?q=aurora')).json().items[0].id;
    const r = await s.put(`/clients/${id}/modules`, { productCode: 'linechat', moduleCode: 'nps' });
    expect(r.statusCode).toBe(400);
    expect(r.json().error).toMatch(/Marque o produto LineChat/);
    const inexistente = await s.put(`/clients/${id}/modules`, { productCode: 'linepbx', moduleCode: 'xyz' });
    expect(inexistente.statusCode).toBe(404);
  });

  it('filtra por produtos e módulos em modo OU e E', async () => {
    await s.post('/clients', { tradeName: 'Só Voz', legalName: 'Só Voz LTDA', cnpj: '22.333.444/0001-81' });
    const voz = (await s.get('/clients?q=voz')).json().items[0].id;
    await s.put(`/clients/${voz}/subscriptions`, { productCode: 'voicenet' });
    const ou = (await s.get('/clients?products=linepbx&products=voicenet&mode=or')).json();
    const e = (await s.get('/clients?products=linepbx&products=voicenet&mode=and')).json();
    expect(ou.total).toBe(2);
    expect(e.total).toBe(0);
    const comFop2 = (await s.get('/clients?modules=linepbx:fop2')).json();
    expect(comFop2.total).toBe(1);
    expect(comFop2.items[0].tradeName).toBe('Clínica Aurora');
    expect((await s.get('/clients?modules=linepbx:nps')).json().total).toBe(0);
  });

  it('desliga um módulo e encerra um produto mantendo o histórico', async () => {
    const id = (await s.get('/clients?q=aurora')).json().items[0].id;
    const r = await s.del(`/clients/${id}/modules/linepbx/fop2`);
    expect(r.statusCode).toBe(200);
    const lp = r.json().subscriptions.find((x: any) => x.productCode === 'linepbx');
    expect(lp.modules[0].active).toBe(false);
    expect(lp.modules[0].deactivatedAt).toBeTruthy();
    expect(r.json().links.fop2).toBeNull();
    // desligar de novo: não há módulo ligado
    expect((await s.del(`/clients/${id}/modules/linepbx/fop2`)).statusCode).toBe(404);
    // religar mantém a configuração antiga
    const again = (await s.put(`/clients/${id}/modules`, { productCode: 'linepbx', moduleCode: 'fop2' })).json();
    expect(again.subscriptions.find((x: any) => x.productCode === 'linepbx').modules[0].settings.adminExtension).toBe('1000');
    expect(again.links.fop2).toBe('https://aurora.linepbx.com.br/fop2/');
    // encerrar o produto inteiro
    const end = await s.del(`/clients/${id}/subscriptions/linepbx`);
    const ended = end.json().subscriptions.find((x: any) => x.productCode === 'linepbx');
    expect(ended.active).toBe(false);
    expect(end.json().links.web).toBeNull();
    // e marcar de novo para os testes seguintes
    await s.put(`/clients/${id}/subscriptions`, { productCode: 'linepbx' });
  });

  it('arquiva, manda para a lixeira e restaura', async () => {
    const id = (await s.get('/clients?q=voz')).json().items[0].id;
    await s.patch(`/clients/${id}`, { archived: true });
    expect((await s.get('/clients?q=voz')).json().total).toBe(0);
    expect((await s.get('/clients?q=voz&includeArchived=true')).json().total).toBe(1);
    await s.del(`/clients/${id}`);
    expect((await s.get('/clients?q=voz&includeArchived=true')).json().total).toBe(0);
    const trash = (await s.get('/admin/trash')).json();
    expect(trash.find((t: any) => t.id === id)).toBeTruthy();
    await s.post(`/admin/trash/client/${id}/restore`);
    expect((await s.get('/clients?q=voz&includeArchived=true')).json().total).toBe(1);
  });
});

describe('permissões', () => {
  it('operador não cria cliente nem revela senha; leitor não usa atalhos de escrita', async () => {
    const roles = (await s.get('/admin/roles')).json();
    const operador = roles.find((r: any) => r.key === 'operador');
    await s.post('/admin/users', { name: 'Op', email: 'op@gestor.local', password: 'SenhaOperador!1', roleId: operador.id });
    const op = new Session(app);
    await op.login('op@gestor.local', 'SenhaOperador!1');
    expect((await op.get('/clients')).statusCode).toBe(200);
    expect((await op.post('/clients', cliente)).statusCode).toBe(403);
    expect((await op.get('/admin/users')).statusCode).toBe(403);
    const id = (await s.get('/clients?q=aurora')).json().items[0].id;
    const ficha = (await s.get(`/clients/${id}`)).json();
    const sid = ficha.subscriptions.find((x: any) => x.productCode === 'linepbx').settings.sshPassword.secretId;
    expect((await op.post(`/secrets/${sid}/reveal`, { password: 'SenhaOperador!1' })).statusCode).toBe(403);
  });

  it('não deixa o sistema sem administrador ativo', async () => {
    const me = (await s.get('/auth/me')).json();
    const r = await s.patch(`/admin/users/${me.id}`, { active: false });
    expect(r.statusCode).toBe(400);
    expect(r.json().error).toMatch(/único administrador/);
  });
});
