/**
 * Patch 1.9 — os pedidos do .docx de 09/10 para o portal do cliente (decisão 0045):
 *  - o WhatsApp do suporte já vem nos Ajustes do portal: o "não ajudou" mostra o número
 *  - o vídeo principal: fica no topo do tutorial e basta para publicar; tem de ser um vídeo que
 *    subiu e não é de outro tutorial; o cliente abre (é do tutorial)
 * (O login e a senha criados pelo suporte estão em portal.test.ts.)
 */
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newId, products, subscriptions } from '@gestor/db';
import { makeApp, Session, type App } from './helpers.js';

let app: App;
let s: Session;
let aurora = '';
const ids: Record<string, string> = {};

const VIDEO = Buffer.from(Array.from({ length: 64 }, (_, i) => i));
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

function multipart(nome: string, mime: string, conteudo: Buffer) {
  const limite = `----gestor${Math.random().toString(16).slice(2)}`;
  const corpo = Buffer.concat([
    Buffer.from(`--${limite}\r\nContent-Disposition: form-data; name="arquivo"; filename="${nome}"\r\nContent-Type: ${mime}\r\n\r\n`),
    conteudo, Buffer.from(`\r\n--${limite}--\r\n`),
  ]);
  return { corpo, tipo: `multipart/form-data; boundary=${limite}` };
}
const subir = async (tipo: string, nome: string, mime: string, conteudo: Buffer) => {
  const m = multipart(nome, mime, conteudo);
  const r = await app.inject({ method: 'POST', url: `/api/portal-admin/arquivos?tipo=${tipo}`, payload: m.corpo, headers: { cookie: s.cookie, 'content-type': m.tipo } });
  expect(r.statusCode).toBe(201);
  return r.json().id as string;
};

/** Um "navegador" no portal (o cookie do portal). */
class NoPortal {
  cookie = '';
  constructor(private app: App) {}
  async req(method: 'GET' | 'POST', url: string, payload?: unknown, headers: Record<string, string> = {}) {
    const res = await this.app.inject({ method, url: '/api' + url, payload: payload as any, headers: { cookie: this.cookie, ...headers } });
    const set = res.headers['set-cookie'];
    const minha = (Array.isArray(set) ? set : set ? [set] : []).map(String).find((l) => l.startsWith('gestor_portal='));
    if (minha) this.cookie = minha.split(';')[0]!;
    return res;
  }
}

beforeAll(async () => {
  process.env.PORTAL_DIR = await mkdtemp(join(tmpdir(), 'portal-teste-'));
  app = await makeApp();
  s = new Session(app);
  await s.login();
  aurora = (await s.post('/clients', { tradeName: 'Clínica Aurora', legalName: 'Clínica Aurora LTDA', cnpj: '11.222.333/0001-81' })).json().id;
  const ps = await app.db.select({ id: products.id, code: products.code }).from(products);
  ids.linepbx = ps.find((p) => p.code === 'linepbx')!.id;
  await app.db.insert(subscriptions).values({ id: newId(), clientId: aurora, productId: ids.linepbx, activatedAt: new Date('2024-01-01') });
  await s.post(`/portal-admin/clientes/${aurora}/acessos`, { nome: 'Maria Souza', login: 'maria.souza', senha: 'Aurora2026!' });
});
afterAll(async () => { await app.close(); });

describe('o WhatsApp do suporte no "não ajudou"', () => {
  it('sem os Ajustes salvos, o portal já mostra o (71) 3034-8350; salvos, valem os salvos', async () => {
    expect((await new NoPortal(app).req('GET', '/portal/sobre')).json()).toMatchObject({ whatsapp: '(71) 3034-8350' });
    await s.put('/portal-admin/ajustes', { titulo: 'Central de ajuda Ingline', whatsapp: '(71) 99999-0000' });
    expect((await new NoPortal(app).req('GET', '/portal/sobre')).json()).toMatchObject({ whatsapp: '(71) 99999-0000' });
  });
});

describe('o vídeo principal', () => {
  it('fica no tutorial, basta para publicar, e o cliente abre', async () => {
    const video = await subir('video', 'Transferir.mp4', 'video/mp4', VIDEO);
    const print = await subir('imagem', 'tela.png', 'image/png', PNG);
    const base = { titulo: 'Como transferir uma ligação', produtoId: ids.linepbx, publicar: true };
    // imagem não é vídeo
    expect((await s.post('/portal-admin/tutoriais', { ...base, videoPrincipalId: print })).statusCode).toBe(400);
    // sem texto, sem resumo e sem vídeo: não publica; só com o vídeo, publica
    expect((await s.post('/portal-admin/tutoriais', base)).statusCode).toBe(400);
    const r = await s.post('/portal-admin/tutoriais', { ...base, videoPrincipalId: video });
    expect(r.statusCode).toBe(201);
    const numero = r.json().numero as number;
    const daEquipe = (await s.get(`/portal-admin/tutoriais/${numero}`)).json();
    expect(daEquipe).toMatchObject({ temVideo: true, videoPrincipal: { id: video, tipo: 'video', nome: 'Transferir.mp4' } });

    // o cliente vê o vídeo principal e consegue abrir (com Range)
    const maria = new NoPortal(app);
    await maria.req('POST', '/portal/entrar', { login: 'maria.souza', senha: 'Aurora2026!' });
    const t = (await maria.req('GET', `/portal/tutoriais/${numero}`)).json();
    expect(t.videoPrincipal).toMatchObject({ id: video, url: `portal/arquivos/${video}` });
    expect((await maria.req('GET', '/portal/tutoriais')).json().items[0]).toMatchObject({ numero, temVideo: true });
    expect((await maria.req('GET', `/portal/arquivos/${video}`, undefined, { range: 'bytes=0-3' })).statusCode).toBe(206);

    // o vídeo de um tutorial não vira o principal de outro
    expect((await s.post('/portal-admin/tutoriais', { ...base, titulo: 'Outro tutorial', videoPrincipalId: video })).statusCode).toBe(400);

    // salvar sem o campo (tela antiga) mantém; nulo tira — e sem texto não publica mais
    const v1 = daEquipe.versao as number;
    const semCampo = await s.put(`/portal-admin/tutoriais/${numero}`, { ...base, resumo: 'Passe a ligação para outro ramal.', versao: v1 });
    expect(semCampo.statusCode).toBe(200);
    expect((await s.get(`/portal-admin/tutoriais/${numero}`)).json().videoPrincipal?.id).toBe(video);
    const v2 = (await s.get(`/portal-admin/tutoriais/${numero}`)).json().versao as number;
    expect((await s.put(`/portal-admin/tutoriais/${numero}`, { ...base, videoPrincipalId: null, versao: v2 })).statusCode).toBe(400);
    expect((await s.put(`/portal-admin/tutoriais/${numero}`, { ...base, resumo: 'Passe a ligação.', videoPrincipalId: null, versao: v2 })).statusCode).toBe(200);
    expect((await s.get(`/portal-admin/tutoriais/${numero}`)).json()).toMatchObject({ temVideo: false, videoPrincipal: null });
  });
});
