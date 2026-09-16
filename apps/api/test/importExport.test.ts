import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { makeApp, Session, type App } from './helpers.js';

let app: App;
let s: Session;
beforeAll(async () => { app = await makeApp(); s = new Session(app); await s.login(); });
afterAll(async () => { await app.close(); });

describe('importar / exportar', () => {
  it('pré-visualiza clientes: cria, atualiza e aponta erro sem gravar nada', async () => {
    await s.post('/clients', { tradeName: 'Existente', legalName: 'Existente LTDA', cnpj: '11.222.333/0001-81' });
    const csv = [
      'cnpj;nome_fantasia;razao_social;produtos;dominio;ip_servidor;usuario_ssh;senha_ssh',
      '11.222.333/0001-81;Existente Renomeado;Existente LTDA;linepbx|fop2|voicenet;ex.linepbx.com.br;203.0.113.5;root;abc123',
      '22.333.444/0001-81;Novo Cliente;Novo LTDA;voicenet|linechat:nps;;;;',
      '99.999.999/9999-99;Errado;Errado LTDA;;;;;',
    ].join('\n');
    const p = await s.post('/data/import/preview', { entity: 'clients', csv, delimiter: ';' });
    expect(p.statusCode).toBe(200);
    expect(p.json().summary).toMatchObject({ create: 1, update: 1, error: 1 });
    expect(p.json().rows[2].errors[0]).toMatch(/CNPJ inválido/);
    expect(JSON.stringify(p.json())).not.toContain('abc123');
    expect((await s.get('/clients')).json().total).toBe(1);

    const bad = await s.post('/data/import/apply', { entity: 'clients', csv, delimiter: ';' });
    expect(bad.statusCode).toBe(400);
    expect(bad.json().error).toMatch(/nada foi gravado/);

    const ok = await s.post('/data/import/apply', { entity: 'clients', csv: csv.split('\n').slice(0, 3).join('\n'), delimiter: ';' });
    expect(ok.statusCode).toBe(200);
    expect(ok.json()).toMatchObject({ created: 1, updated: 1 });
    const list = (await s.get('/clients')).json();
    expect(list.total).toBe(2);
    const ex = list.items.find((c: any) => c.cnpj === '11222333000181');
    expect(ex.tradeName).toBe('Existente Renomeado');
    expect(ex.products.map((p: any) => p.code).sort()).toEqual(['linepbx', 'voicenet']);
    // "fop2" no CSV do Nexus vira o módulo FOP2 dentro do LinePBX
    expect(ex.products.find((p: any) => p.code === 'linepbx').modules.map((m: any) => m.code)).toEqual(['fop2']);
    expect(ex.links.ssh).toBe('ssh://root@203.0.113.5:22');
    const novo = list.items.find((c: any) => c.cnpj === '22333444000181');
    expect(novo.products.map((p: any) => p.code).sort()).toEqual(['linechat', 'voicenet']);
    expect(novo.products.find((p: any) => p.code === 'linechat').modules.map((m: any) => m.code)).toEqual(['nps']);
    // exportação traz a coluna de módulos
    const exp = await s.get('/data/export/clients');
    expect(exp.body).toContain('modulos');
    expect(exp.body).toContain('linepbx:fop2');
  });

  it('importa DIDs apontando cliente por CNPJ e circuito por código', async () => {
    const carriers = (await s.get('/admin/catalogs/carriers')).json();
    await s.post('/circuits', { name: 'Feixe A', code: '12345', carrierId: carriers[0].id, channels: 5 });
    const csv = 'numero,circuito,cliente,observacao\n(71) 3172-1150,12345,11.222.333/0001-81,principal\n7131721151,12345,livre,\n7131721152,99999,,';
    const p = (await s.post('/data/import/preview', { entity: 'dids', csv, delimiter: ',' })).json();
    expect(p.summary).toMatchObject({ create: 2, error: 1 });
    expect(p.rows[2].errors[0]).toMatch(/Circuito desconhecido/);
    const ok = await s.post('/data/import/apply', { entity: 'dids', csv: csv.split('\n').slice(0, 3).join('\n'), delimiter: ',' });
    expect(ok.statusCode).toBe(200);
    const dids = (await s.get('/dids')).json();
    expect(dids.total).toBe(2);
    expect(dids.items[0].clientName).toBe('Existente Renomeado');
  });

  it('data de ativação vem do CSV, hospedagem errada e CNPJ na lixeira viram erro na prévia', async () => {
    const csv = [
      'cnpj;nome_fantasia;razao_social;produtos;modulos;hospedagem;ativacao_linepbx;ativacao_linepbx:fop2',
      '33.444.555/0001-81;Com Datas;Com Datas LTDA;linepbx;linepbx:fop2;Vultr;23/12/2025;10/01/2026',
    ].join('\n');
    const p = (await s.post('/data/import/preview', { entity: 'clients', csv, delimiter: ';' })).json();
    expect(p.summary).toMatchObject({ create: 1, error: 0 });
    expect((await s.post('/data/import/apply', { entity: 'clients', csv, delimiter: ';' })).statusCode).toBe(200);
    const cliente = (await s.get('/clients')).json().items.find((c: any) => c.cnpj === '33444555000181');
    const detalhe = (await s.get(`/clients/${cliente.id}`)).json();
    const lp = detalhe.subscriptions.find((x: any) => x.productCode === 'linepbx');
    expect(String(lp.activatedAt).slice(0, 10)).toBe('2025-12-23');
    expect(String(lp.modules.find((m: any) => m.moduleCode === 'fop2').activatedAt).slice(0, 10)).toBe('2026-01-10');
    expect(lp.settings.hostingName).toBe('Vultr');

    // hospedagem fora do catálogo e data sem sentido não passam da prévia
    const ruim = [
      'cnpj;nome_fantasia;razao_social;produtos;hospedagem;ativacao_linepbx',
      '44.555.666/0001-81;Ruim;Ruim LTDA;linepbx;Vultur;31/31/2025',
    ].join('\n');
    const pr = (await s.post('/data/import/preview', { entity: 'clients', csv: ruim, delimiter: ';' })).json();
    expect(pr.summary.error).toBe(1);
    expect(pr.rows[0].errors.join(' ')).toMatch(/Hospedagem desconhecida/);
    expect(pr.rows[0].errors.join(' ')).toMatch(/Data de ativação inválida/);

    // CNPJ que está na lixeira: avisa em vez de estourar erro de chave única na gravação
    await s.del(`/clients/${cliente.id}`);
    const pl = (await s.post('/data/import/preview', { entity: 'clients', csv, delimiter: ';' })).json();
    expect(pl.summary.error).toBe(1);
    expect(pl.rows[0].errors[0]).toMatch(/lixeira/);
  });

  it('exporta CSV sem senhas; com senhas exige permissão, senha e sai como ZIP', async () => {
    const r = await s.get('/data/export/clients');
    expect(r.statusCode).toBe(200);
    expect(r.headers['content-type']).toContain('text/csv');
    expect(r.body).toContain('nome_fantasia');
    expect(r.body).not.toContain('senha_ssh');
    expect(r.body).not.toContain('abc123');

    const wrong = await s.post('/data/export/clients/with-secrets', { password: 'errada' });
    expect(wrong.statusCode).toBe(403);
    const z = await s.post('/data/export/clients/with-secrets', { password: 'SenhaDeTeste!123' });
    expect(z.statusCode).toBe(200);
    expect(z.headers['content-type']).toContain('application/zip');
    expect(String(z.headers['x-zip-password']).length).toBeGreaterThan(8);
    expect(z.rawPayload.subarray(0, 2).toString()).toBe('PK');
    const audit = (await s.get('/admin/audit?action=export_secrets')).json();
    expect(audit.total).toBe(1);
  });
});
