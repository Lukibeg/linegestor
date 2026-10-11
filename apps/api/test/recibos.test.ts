/**
 * Patch 1.9 (decisão 0042): o recibo de entrega na movimentação para cliente. As regras do arquivo
 * (tipo de verdade, tamanho, só para cliente, até 5) estão testadas em
 * `packages/shared/src/recibo.test.ts`; aqui se confere que o servidor as aplica, guarda no banco,
 * mostra nas listas sem o conteúdo, entrega o arquivo do jeito certo e nunca apaga de verdade.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { auditLog, deviceMovementReceipts } from '@gestor/db';
import { makeApp, Session, type App } from './helpers.js';

let app: App;
let s: Session;
const id: Record<string, string> = {};

const PDF = Buffer.from('%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF\n');
const JPG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0xff, 0xd9]);
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]);
const SVG = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
const embutido = (b: Buffer, tipo = 'application/pdf') => `data:${tipo};base64,${b.toString('base64')}`;

beforeAll(async () => {
  app = await makeApp();
  s = new Session(app);
  await s.login();
  const cats = (await s.get('/admin/catalogs/categories')).json();
  const modelo = (await s.post('/inventory/models', { code: 'gxp1610', name: 'Grandstream GXP1610', categoryId: cats.find((c: any) => c.name === 'Telefone IP').id, valueCents: 45000 })).json().id;
  id.hosp = (await s.post('/clients', { tradeName: 'Hospital Vale Verde', legalName: 'Hospital Vale Verde Ltda', cnpj: '11.222.333/0001-81' })).json().id;
  expect((await s.put(`/clients/${id.hosp}/subscriptions`, { productCode: 'equipamentos' })).statusCode).toBe(200);
  id.gA = (await s.post('/inventory/devices', { modelId: modelo, mac: '00:0B:82:00:00:01' })).json().id;
  id.gB = (await s.post('/inventory/devices', { modelId: modelo, mac: '00:0B:82:00:00:02' })).json().id;
  const ida = await s.post('/inventory/movements', { modality: 'locacao', toClientId: id.hosp, items: [{ deviceId: id.gA }, { deviceId: id.gB }] });
  expect(ida.statusCode).toBe(201);
  id.ida = ida.json().id;
  const volta = await s.post('/inventory/movements', { modality: 'devolucao', toClientId: null, items: [{ deviceId: id.gB }] });
  id.volta = volta.json().id;
});
afterAll(async () => { await app.close(); });

describe('Recibo de entrega', () => {
  it('anexa o PDF na movimentação para o cliente; as listas mostram o recibo, sem o arquivo', async () => {
    const res = await s.post(`/inventory/movements/${id.ida}/recibos`, { fileName: 'Recibo Hospital — 09-10.pdf', conteudo: embutido(PDF) });
    expect(res.statusCode).toBe(201);
    const r = res.json();
    expect(r).toMatchObject({ fileName: 'Recibo Hospital — 09-10.pdf', mimeType: 'application/pdf', sizeBytes: PDF.length, url: `inventory/recibos/${r.id}` });
    expect(r.quem).toBeTruthy();
    expect(r.dataBase64).toBeUndefined();
    id.pdf = r.id;

    const lista = (await s.get(`/inventory/movements?clientId=${id.hosp}&page=1&pageSize=50`)).json();
    const ida = lista.items.find((m: any) => m.id === id.ida);
    expect(ida.recibos.map((x: any) => x.fileName)).toEqual(['Recibo Hospital — 09-10.pdf']);
    expect(JSON.stringify(lista)).not.toContain(PDF.toString('base64'));
    expect(lista.items.find((m: any) => m.id === id.volta).recibos).toEqual([]);

    // o histórico do aparelho mostra o recibo da movimentação que o levou
    const aparelho = (await s.get(`/inventory/devices/${id.gA}`)).json();
    expect(aparelho.history[0].recibos.map((x: any) => x.id)).toEqual([id.pdf]);
  });

  it('o PDF baixa; a foto abre na tela (ou baixa, se pedir) — sempre com o tipo de verdade', async () => {
    const pdf = await s.get(`/inventory/recibos/${id.pdf}`);
    expect(pdf.statusCode).toBe(200);
    expect(pdf.headers['content-type']).toBe('application/pdf');
    expect(String(pdf.headers['content-disposition'])).toMatch(/^attachment; filename=".+"; filename\*=UTF-8''Recibo%20Hospital/);
    expect(pdf.headers['x-content-type-options']).toBe('nosniff');
    expect(pdf.rawPayload.equals(PDF)).toBe(true);

    // o navegador disse "PDF", mas é uma PNG: fica guardado como PNG
    const png = (await s.post(`/inventory/movements/${id.ida}/recibos`, { fileName: 'foto.pdf', conteudo: embutido(PNG) })).json();
    expect(png.mimeType).toBe('image/png');
    const foto = (await s.post(`/inventory/movements/${id.ida}/recibos`, { fileName: 'foto-do-recibo.jpg', conteudo: embutido(JPG, 'image/jpeg') })).json();
    const naTela = await s.get(`/inventory/recibos/${foto.id}`);
    expect(naTela.headers['content-type']).toBe('image/jpeg');
    expect(String(naTela.headers['content-disposition'])).toMatch(/^inline;/);
    expect(String((await s.get(`/inventory/recibos/${foto.id}?baixar=1`)).headers['content-disposition'])).toMatch(/^attachment;/);
    id.png = png.id;
  });

  it('recusa o que não é PDF nem foto, a devolução e o sexto arquivo', async () => {
    const svg = await s.post(`/inventory/movements/${id.ida}/recibos`, { fileName: 'recibo.pdf', conteudo: embutido(SVG) });
    expect(svg.statusCode).toBe(400);
    expect(svg.json().error).toBe('"recibo.pdf" não é PDF nem foto (JPG, PNG ou WEBP).');

    const devolucao = await s.post(`/inventory/movements/${id.volta}/recibos`, { fileName: 'r.pdf', conteudo: embutido(PDF) });
    expect(devolucao.statusCode).toBe(400);
    expect(devolucao.json().error).toMatch(/devolução não tem/);

    expect((await s.post('/inventory/movements/nao-existe/recibos', { fileName: 'r.pdf', conteudo: embutido(PDF) })).statusCode).toBe(404);

    // já tem 3 (PDF, PNG e JPG): mais 2 chegam a 5, o sexto não entra
    for (const n of [4, 5]) expect((await s.post(`/inventory/movements/${id.ida}/recibos`, { fileName: `pagina-${n}.pdf`, conteudo: embutido(PDF) })).statusCode).toBe(201);
    const sexto = await s.post(`/inventory/movements/${id.ida}/recibos`, { fileName: 'pagina-6.pdf', conteudo: embutido(PDF) });
    expect(sexto.statusCode).toBe(400);
    expect(sexto.json().error).toMatch(/já tem 5/);
  });

  it('tirar só esconde: some da tela, não abre mais, continua no banco e fica na auditoria', async () => {
    expect((await s.del(`/inventory/recibos/${id.png}`)).statusCode).toBe(200);
    expect((await s.get(`/inventory/recibos/${id.png}`)).statusCode).toBe(404);
    const lista = (await s.get(`/inventory/movements?clientId=${id.hosp}&page=1&pageSize=50`)).json();
    expect(lista.items.find((m: any) => m.id === id.ida).recibos).toHaveLength(4);
    const [linha] = await app.db.select().from(deviceMovementReceipts).where(eq(deviceMovementReceipts.id, id.png!));
    expect(linha!.deletedAt).not.toBeNull();
    // e abriu vaga para mais um
    expect((await s.post(`/inventory/movements/${id.ida}/recibos`, { fileName: 'pagina-6.pdf', conteudo: embutido(PDF) })).statusCode).toBe(201);

    const log = await app.db.select().from(auditLog).where(eq(auditLog.entityId, id.ida!));
    const resumos = log.map((l) => l.summary);
    expect(resumos).toContain('Anexou o recibo de entrega "Recibo Hospital — 09-10.pdf" (1 KB) à locação para Hospital Vale Verde');
    expect(resumos).toContain('Tirou o recibo de entrega "foto.pdf" da locação para Hospital Vale Verde');
    // o arquivo nunca vai para a auditoria
    expect(JSON.stringify(log)).not.toContain(PDF.toString('base64'));
  });

  it('quem só lê vê e baixa, mas não anexa nem tira; sem sessão, nada', async () => {
    const leitor = (await s.get('/admin/roles')).json().find((p: any) => p.key === 'leitor');
    expect((await s.post('/admin/users', { name: 'Leitor dos Recibos', email: 'leitorrec@gestor.local', password: 'SenhaDeTeste!123', roleId: leitor.id })).statusCode).toBe(201);
    const outro = new Session(app);
    await outro.login('leitorrec@gestor.local', 'SenhaDeTeste!123');
    expect((await outro.get(`/inventory/recibos/${id.pdf}`)).statusCode).toBe(200);
    expect((await outro.post(`/inventory/movements/${id.ida}/recibos`, { fileName: 'r.pdf', conteudo: embutido(PDF) })).statusCode).toBe(403);
    expect((await outro.del(`/inventory/recibos/${id.pdf}`)).statusCode).toBe(403);
    expect((await app.inject({ method: 'GET', url: `/api/inventory/recibos/${id.pdf}` })).statusCode).toBe(401);
  });
});
