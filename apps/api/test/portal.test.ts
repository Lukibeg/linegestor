/**
 * Patch 1.8 — Portal do cliente (decisão 0040).
 *
 * As contas (quem está na base, o que cada cliente vê, o link) estão testadas em
 * `packages/shared/src/portal.test.ts`. Aqui fica o que é do servidor:
 *  - a equipe escreve tutoriais; o Leitor não; arquivos (print só raster, arquivo baixa, vídeo em
 *    disco com Range)
 *  - o convite: a pessoa cria a senha, o código vale uma vez, só o hash fica no banco
 *  - o que cada cliente vê (Geral + os produtos e módulos ativos), e os arquivos só desses
 *  - saiu da base (produto desativado, arquivado), bloqueado: a sessão aberta cai na hora
 *  - o cookie do portal não abre o Gestor, e o da equipe não abre o portal
 *  - lixeira, ajustes e auditoria (sem o código do convite)
 */
import { mkdtemp, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { clients, newId, portalUsers, productModules, products, subscriptionModules, subscriptions } from '@gestor/db';
import { makeApp, Session, type App } from './helpers.js';

let app: App;
let s: Session;          // administrador
let operador: Session;   // escreve no portal e dá acesso
let leitor: Session;     // só lê
let aurora = '';         // tem LinePBX (com o módulo FOP2)
let norte = '';          // tem LineChat
let subAurora = '';
const ids: Record<string, string> = {};
const numeros: Record<string, number> = {};

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const SVG = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
const PDF = Buffer.from('%PDF-1.4\n%fim\n');
// um "vídeo" pequeno o bastante para o teste: 64 bytes conhecidos (o servidor não abre o vídeo)
const VIDEO = Buffer.from(Array.from({ length: 64 }, (_, i) => i));

/** Um "navegador" do cliente: guarda o cookie do portal. */
class Cliente {
  cookie = '';
  constructor(private app: App) {}
  private guardar(res: Awaited<ReturnType<App['inject']>>) {
    const set = res.headers['set-cookie'];
    const linhas = (Array.isArray(set) ? set : set ? [set] : []).map(String);
    const minha = linhas.find((l) => l.startsWith('gestor_portal='));
    if (minha) this.cookie = minha.split(';')[0]!;
    return res;
  }
  async req(method: 'GET' | 'POST', url: string, payload?: unknown, headers: Record<string, string> = {}) {
    return this.guardar(await this.app.inject({ method, url: '/api' + url, payload: payload as any, headers: { cookie: this.cookie, ...headers } }));
  }
  get(url: string, headers?: Record<string, string>) { return this.req('GET', url, undefined, headers); }
  post(url: string, payload?: unknown) { return this.req('POST', url, payload); }
  entrar(email: string, senha: string) { return this.post('/portal/entrar', { email, senha }); }
}

function multipart(nome: string, mime: string, conteudo: Buffer) {
  const limite = `----gestor${Math.random().toString(16).slice(2)}`;
  const corpo = Buffer.concat([
    Buffer.from(`--${limite}\r\nContent-Disposition: form-data; name="arquivo"; filename="${nome}"\r\nContent-Type: ${mime}\r\n\r\n`),
    conteudo,
    Buffer.from(`\r\n--${limite}--\r\n`),
  ]);
  return { corpo, tipo: `multipart/form-data; boundary=${limite}` };
}
const subir = (quem: Session, tipo: string, nome: string, mime: string, conteudo: Buffer) => {
  const m = multipart(nome, mime, conteudo);
  return app.inject({ method: 'POST', url: `/api/portal-admin/arquivos?tipo=${tipo}`, payload: m.corpo, headers: { cookie: quem.cookie, 'content-type': m.tipo } });
};

const tutorial = (o: Record<string, unknown> = {}) => ({
  titulo: 'Como transferir uma ligação', resumo: 'Passe a ligação para outro ramal sem derrubar.',
  texto: '1. Aperte TRANSF.\n2. Digite o ramal e aperte TRANSF de novo.', publicar: true, ...o,
});

beforeAll(async () => {
  process.env.PORTAL_DIR = await mkdtemp(join(tmpdir(), 'portal-teste-'));
  app = await makeApp();
  s = new Session(app);
  await s.login();
  const papeis = (await s.get('/admin/roles')).json();
  const idDe = (key: string) => papeis.find((r: any) => r.key === key).id;
  await s.post('/admin/users', { name: 'Marina Costa', email: 'marina@gestor.local', password: 'SenhaDeTeste!123', roleId: idDe('operador') });
  await s.post('/admin/users', { name: 'Rita Leitora', email: 'rita@gestor.local', password: 'SenhaDeTeste!123', roleId: idDe('leitor') });
  operador = new Session(app); await operador.login('marina@gestor.local', 'SenhaDeTeste!123');
  leitor = new Session(app); await leitor.login('rita@gestor.local', 'SenhaDeTeste!123');

  aurora = (await s.post('/clients', { tradeName: 'Clínica Aurora', legalName: 'Clínica Aurora LTDA', cnpj: '11.222.333/0001-81' })).json().id;
  norte = (await s.post('/clients', { tradeName: 'Distribuidora Norte', legalName: 'Norte LTDA', cnpj: '22.333.444/0001-81' })).json().id;
  const ps = await app.db.select({ id: products.id, code: products.code }).from(products);
  const ms = await app.db.select({ id: productModules.id, code: productModules.code, productId: productModules.productId }).from(productModules);
  ids.linepbx = ps.find((p) => p.code === 'linepbx')!.id;
  ids.linechat = ps.find((p) => p.code === 'linechat')!.id;
  ids.fop2 = ms.find((m) => m.productId === ids.linepbx && m.code === 'fop2')!.id;
  ids.omniboard = ms.find((m) => m.productId === ids.linepbx && m.code === 'omniboard')!.id;
  subAurora = newId();
  await app.db.insert(subscriptions).values([
    { id: subAurora, clientId: aurora, productId: ids.linepbx, activatedAt: new Date('2024-01-01') },
    { id: newId(), clientId: norte, productId: ids.linechat, activatedAt: new Date('2024-01-01') },
  ]);
  await app.db.insert(subscriptionModules).values({ id: newId(), subscriptionId: subAurora, moduleId: ids.fop2, activatedAt: new Date('2024-01-01') });
});
afterAll(async () => { await app.close(); });

describe('a equipe escreve', () => {
  it('o Leitor não escreve; quem tem portal.write escreve e publica', async () => {
    expect((await leitor.post('/portal-admin/tutoriais', tutorial())).statusCode).toBe(403);
    const geral = await operador.post('/portal-admin/tutoriais', tutorial({ titulo: 'Como abrir um chamado com o suporte', texto: '1. Mande mensagem no WhatsApp do suporte.' }));
    expect(geral.statusCode).toBe(201);
    numeros.geral = geral.json().numero;
    expect(geral.json().caminho).toBe(`/portal/a/${numeros.geral}-como-abrir-um-chamado-com-o-suporte`);
    numeros.linepbx = (await operador.post('/portal-admin/tutoriais', tutorial({ produtoId: ids.linepbx }))).json().numero;
    numeros.fop2 = (await operador.post('/portal-admin/tutoriais', tutorial({ titulo: 'FOP2: ver quem está em ligação', produtoId: ids.linepbx, moduloId: ids.fop2 }))).json().numero;
    numeros.omniboard = (await operador.post('/portal-admin/tutoriais', tutorial({ titulo: 'Omniboard: pegar a chamada da fila', produtoId: ids.linepbx, moduloId: ids.omniboard }))).json().numero;
    numeros.linechat = (await operador.post('/portal-admin/tutoriais', tutorial({ titulo: 'LineChat: responder pelo celular', produtoId: ids.linechat }))).json().numero;
    numeros.rascunho = (await operador.post('/portal-admin/tutoriais', tutorial({ titulo: 'Rascunho do URA', produtoId: ids.linepbx, publicar: false, texto: null }))).json().numero;
    const lista = (await leitor.get('/portal-admin/tutoriais')).json();
    expect(lista.total).toBe(6);
    expect((await leitor.get('/portal-admin/tutoriais?produto=geral')).json().items.map((t: any) => t.numero)).toEqual([numeros.geral]);
    // a busca da equipe mostra onde achou (o trecho), como a da base
    const achados = (await leitor.get('/portal-admin/tutoriais?q=whatsapp')).json().items;
    expect(achados.map((t: any) => t.numero)).toEqual([numeros.geral]);
    expect(achados[0].trecho.some((p: any) => p.achado && /whatsapp/i.test(p.texto))).toBe(true);
    expect(lista.items[0].trecho).toBeNull();
  });

  it('confere o produto, o módulo e o que falta para publicar', async () => {
    expect((await operador.post('/portal-admin/tutoriais', tutorial({ produtoId: 'nao-existe' }))).statusCode).toBe(400);
    expect((await operador.post('/portal-admin/tutoriais', tutorial({ produtoId: ids.linechat, moduloId: ids.fop2 }))).statusCode).toBe(400);
    expect((await operador.post('/portal-admin/tutoriais', tutorial({ texto: null, resumo: null }))).statusCode).toBe(400);
  });

  it('quem salvou no meio não é atropelado', async () => {
    const t = (await operador.get(`/portal-admin/tutoriais/${numeros.linepbx}`)).json();
    expect((await s.put(`/portal-admin/tutoriais/${numeros.linepbx}`, tutorial({ produtoId: ids.linepbx, versao: t.versao, resumo: 'Outro resumo.' }))).statusCode).toBe(200);
    expect((await operador.put(`/portal-admin/tutoriais/${numeros.linepbx}`, tutorial({ produtoId: ids.linepbx, versao: t.versao }))).statusCode).toBe(409);
  });
});

describe('os arquivos', () => {
  it('print só imagem de verdade; arquivo baixa; vídeo vai para o disco e abre com Range', async () => {
    expect((await subir(leitor, 'imagem', 'x.png', 'image/png', PNG)).statusCode).toBe(403);
    expect((await subir(operador, 'imagem', 'desenho.svg', 'image/svg+xml', SVG)).statusCode).toBe(400);
    // o nome e o tipo dizem PNG, mas o conteúdo é SVG: recusado pelos primeiros bytes
    expect((await subir(operador, 'imagem', 'falso.png', 'image/png', SVG)).statusCode).toBe(400);
    const print = await subir(operador, 'imagem', 'tela.png', 'image/png', PNG);
    expect(print.statusCode).toBe(201);
    ids.print = print.json().id;
    ids.pdf = (await subir(operador, 'arquivo', 'Manual do ramal.pdf', 'application/pdf', PDF)).json().id;
    expect((await subir(operador, 'video', 'filme.avi', 'video/x-msvideo', VIDEO)).statusCode).toBe(400);
    const video = await subir(operador, 'video', 'Transferir.mp4', 'video/mp4', VIDEO);
    expect(video.statusCode).toBe(201);
    ids.video = video.json().id;
    expect(await readdir(join(process.env.PORTAL_DIR!, 'videos'))).toEqual([`${ids.video}.mp4`]);

    const inteiro = await leitor.get(`/portal-admin/arquivos/${ids.video}`);
    expect(inteiro.headers['accept-ranges']).toBe('bytes');
    expect(inteiro.rawPayload.length).toBe(64);
    const pedaco = await app.inject({ method: 'GET', url: `/api/portal-admin/arquivos/${ids.video}`, headers: { cookie: leitor.cookie, range: 'bytes=10-19' } });
    expect(pedaco.statusCode).toBe(206);
    expect(pedaco.headers['content-range']).toBe('bytes 10-19/64');
    expect([...pedaco.rawPayload]).toEqual([10, 11, 12, 13, 14, 15, 16, 17, 18, 19]);
    const pdf = await leitor.get(`/portal-admin/arquivos/${ids.pdf}`);
    expect(pdf.headers['content-type']).toBe('application/octet-stream');
    expect(pdf.headers['content-disposition']).toMatch(/^attachment;/);
  });

  it('o tutorial que cita os arquivos fica dono deles; arquivo que não existe é recusado', async () => {
    const texto = `1. Veja o vídeo:\n[video:${ids.video}]\n2. Confira a tela:\n[print:${ids.print}]\n[arquivo:${ids.pdf}]`;
    expect((await operador.post('/portal-admin/tutoriais', tutorial({ texto: `${texto}\n[video:nao-existe]` }))).statusCode).toBe(400);
    const t = (await operador.get(`/portal-admin/tutoriais/${numeros.linepbx}`)).json();
    expect((await operador.put(`/portal-admin/tutoriais/${numeros.linepbx}`, tutorial({ produtoId: ids.linepbx, texto, versao: t.versao }))).statusCode).toBe(200);
    const depois = (await leitor.get(`/portal-admin/tutoriais/${numeros.linepbx}`)).json();
    expect(depois.arquivos.map((a: any) => a.tipo).sort()).toEqual(['arquivo', 'imagem', 'video']);
  });
});

describe('o convite e a senha', () => {
  it('a equipe dá o acesso, a pessoa cria a senha, o código vale uma vez', async () => {
    expect((await leitor.post(`/portal-admin/clientes/${aurora}/acessos`, { nome: 'Maria Souza', email: 'maria@aurora.com.br' })).statusCode).toBe(403);
    const r = await operador.post(`/portal-admin/clientes/${aurora}/acessos`, { nome: 'Maria Souza', email: 'Maria@Aurora.com.br' });
    expect(r.statusCode).toBe(201);
    const caminho: string = r.json().convite;
    expect(caminho).toMatch(/^\/portal\/convite\/[\w-]{40,}$/);
    const codigo = caminho.split('/').pop()!;
    expect((await operador.post(`/portal-admin/clientes/${norte}/acessos`, { nome: 'Outra', email: 'maria@aurora.com.br' })).statusCode).toBe(409);
    // no banco, só o hash do código
    const [u] = await app.db.select().from(portalUsers).where(eq(portalUsers.email, 'maria@aurora.com.br'));
    expect(u!.inviteTokenHash).not.toBe(codigo);
    expect(u!.passwordHash).toBeNull();
    expect((await leitor.get(`/portal-admin/clientes/${aurora}/acessos`)).json().acessos[0].situacao).toBe('convite');

    const maria = new Cliente(app);
    expect((await maria.get(`/portal/convite/${codigo}`)).json()).toMatchObject({ nome: 'Maria Souza', cliente: 'Clínica Aurora', trocando: false });
    expect((await maria.post(`/portal/convite/${codigo}`, { senha: 'curta1' })).statusCode).toBe(400);
    expect((await maria.post(`/portal/convite/${codigo}`, { senha: 'somenteletras' })).statusCode).toBe(400);
    expect((await maria.post(`/portal/convite/${codigo}`, { senha: 'Aurora2026!' })).statusCode).toBe(200);
    expect((await maria.get('/portal/eu')).json()).toMatchObject({ nome: 'Maria Souza', cliente: { nome: 'Clínica Aurora' } });
    expect((await new Cliente(app).get(`/portal/convite/${codigo}`)).statusCode).toBe(404);
    expect((await new Cliente(app).post(`/portal/convite/${codigo}`, { senha: 'Outra2026!' })).statusCode).toBe(404);
    expect((await leitor.get(`/portal-admin/clientes/${aurora}/acessos`)).json().acessos[0].situacao).toBe('ativo');
  });

  it('entra com e-mail e senha; a mesma mensagem para e-mail que não existe e senha errada', async () => {
    const a = await new Cliente(app).entrar('maria@aurora.com.br', 'errada123');
    const b = await new Cliente(app).entrar('ninguem@aurora.com.br', 'errada123');
    expect([a.statusCode, b.statusCode]).toEqual([401, 401]);
    expect(a.json().error).toBe(b.json().error);
    const ok = await new Cliente(app).entrar('MARIA@aurora.com.br', 'Aurora2026!');
    expect(ok.statusCode).toBe(200);
    expect(ok.json().nome).toBe('Maria Souza');
  });
});

describe('o que cada cliente vê', () => {
  it('Geral e os produtos e módulos que ele tem; arquivo só de tutorial que ele vê', async () => {
    const maria = new Cliente(app);
    await maria.entrar('maria@aurora.com.br', 'Aurora2026!');
    const inicio = (await maria.get('/portal/inicio')).json();
    expect(inicio.produtos.map((p: any) => p.id)).toEqual([ids.linepbx]);
    const vistos = (await maria.get('/portal/tutoriais')).json().items.map((t: any) => t.numero).sort();
    expect(vistos).toEqual([numeros.geral, numeros.linepbx, numeros.fop2].sort());
    expect((await maria.get(`/portal/tutoriais/${numeros.linechat}`)).statusCode).toBe(404);
    expect((await maria.get(`/portal/tutoriais/${numeros.omniboard}`)).statusCode).toBe(404);
    expect((await maria.get(`/portal/tutoriais/${numeros.rascunho}`)).statusCode).toBe(404);
    const t = await maria.get(`/portal/tutoriais/${numeros.linepbx}-qualquer-coisa`);
    expect(t.statusCode).toBe(200);
    expect(t.json().arquivos).toHaveLength(3);
    expect((await maria.get(`/portal/tutoriais?q=transferir ligacao`)).json().items[0].numero).toBe(numeros.linepbx);
    // a visita conta para a equipe
    const lista = (await leitor.get('/portal-admin/tutoriais')).json().items;
    expect(lista.find((x: any) => x.numero === numeros.linepbx).visualizacoes).toBe(1);

    const video = await maria.get(`/portal/arquivos/${ids.video}`, { range: 'bytes=0-3' });
    expect(video.statusCode).toBe(206);
    expect((await maria.get(`/portal/arquivos/${ids.print}`)).headers['content-type']).toBe('image/png');
    // um arquivo que ainda não está em tutorial nenhum: o cliente não vê
    const solto = (await subir(operador, 'imagem', 'solto.png', 'image/png', PNG)).json().id;
    expect((await maria.get(`/portal/arquivos/${solto}`)).statusCode).toBe(404);
  });

  it('o cookie do portal não abre o Gestor, e o da equipe não abre o portal', async () => {
    const maria = new Cliente(app);
    await maria.entrar('maria@aurora.com.br', 'Aurora2026!');
    const noGestor = await app.inject({ method: 'GET', url: '/api/clients', headers: { cookie: maria.cookie } });
    expect(noGestor.statusCode).toBe(401);
    expect((await s.get('/portal/inicio')).statusCode).toBe(401);
  });
});

describe('quem sai da base perde o acesso na hora', () => {
  it('produto desativado ou cliente arquivado: a sessão aberta cai; voltou, volta', async () => {
    const maria = new Cliente(app);
    await maria.entrar('maria@aurora.com.br', 'Aurora2026!');
    expect((await maria.get('/portal/eu')).statusCode).toBe(200);
    await app.db.update(subscriptions).set({ deactivatedAt: new Date(Date.now() - 1000) }).where(eq(subscriptions.id, subAurora));
    const caiu = await maria.get('/portal/eu');
    expect(caiu.statusCode).toBe(401);
    expect(caiu.json().error).toMatch(/suspenso/);
    expect((await new Cliente(app).entrar('maria@aurora.com.br', 'Aurora2026!')).statusCode).toBe(403);
    expect((await leitor.get(`/portal-admin/clientes/${aurora}/acessos`)).json()).toMatchObject({ naBase: false, motivo: 'o cliente não tem nenhum produto ativo' });
    // desativação marcada para o futuro: ainda vale
    await app.db.update(subscriptions).set({ deactivatedAt: new Date(Date.now() + 86_400_000) }).where(eq(subscriptions.id, subAurora));
    expect((await maria.get('/portal/eu')).statusCode).toBe(200);
    await app.db.update(clients).set({ archived: true }).where(eq(clients.id, aurora));
    expect((await maria.get('/portal/inicio')).statusCode).toBe(401);
    await app.db.update(clients).set({ archived: false }).where(eq(clients.id, aurora));
    await app.db.update(subscriptions).set({ deactivatedAt: null }).where(eq(subscriptions.id, subAurora));
    expect((await maria.get('/portal/eu')).statusCode).toBe(200);
  });

  it('bloquear derruba a sessão; desbloquear volta com a mesma senha', async () => {
    const maria = new Cliente(app);
    await maria.entrar('maria@aurora.com.br', 'Aurora2026!');
    const id = (await leitor.get(`/portal-admin/clientes/${aurora}/acessos`)).json().acessos[0].id;
    expect((await leitor.post(`/portal-admin/acessos/${id}/bloqueio`, { bloquear: true })).statusCode).toBe(403);
    expect((await operador.post(`/portal-admin/acessos/${id}/bloqueio`, { bloquear: true })).statusCode).toBe(200);
    expect((await maria.get('/portal/eu')).statusCode).toBe(401);
    expect((await new Cliente(app).entrar('maria@aurora.com.br', 'Aurora2026!')).statusCode).toBe(403);
    expect((await operador.post(`/portal-admin/acessos/${id}/convite`)).statusCode).toBe(400);
    await operador.post(`/portal-admin/acessos/${id}/bloqueio`, { bloquear: false });
    expect((await new Cliente(app).entrar('maria@aurora.com.br', 'Aurora2026!')).statusCode).toBe(200);
  });

  it('esqueci a senha: o convite novo troca a senha; a antiga vale até a nova ser criada, e as sessões caem', async () => {
    const maria = new Cliente(app);
    await maria.entrar('maria@aurora.com.br', 'Aurora2026!');
    const id = (await leitor.get(`/portal-admin/clientes/${aurora}/acessos`)).json().acessos[0].id;
    const codigo = (await operador.post(`/portal-admin/acessos/${id}/convite`)).json().convite.split('/').pop();
    expect((await new Cliente(app).entrar('maria@aurora.com.br', 'Aurora2026!')).statusCode).toBe(200);
    expect((await new Cliente(app).get(`/portal/convite/${codigo}`)).json().trocando).toBe(true);
    const nova = new Cliente(app);
    expect((await nova.post(`/portal/convite/${codigo}`, { senha: 'NovaSenha2026' })).statusCode).toBe(200);
    expect((await maria.get('/portal/eu')).statusCode).toBe(401);
    expect((await nova.get('/portal/eu')).statusCode).toBe(200);
    expect((await new Cliente(app).entrar('maria@aurora.com.br', 'Aurora2026!')).statusCode).toBe(401);
    // trocar a senha logado: pede a atual; as outras sessões caem, esta fica
    const outra = new Cliente(app);
    await outra.entrar('maria@aurora.com.br', 'NovaSenha2026');
    expect((await nova.post('/portal/senha', { atual: 'errada', nova: 'Trocada2026' })).statusCode).toBe(400);
    expect((await nova.post('/portal/senha', { atual: 'NovaSenha2026', nova: 'Trocada2026' })).statusCode).toBe(200);
    expect((await nova.get('/portal/eu')).statusCode).toBe(200);
    expect((await outra.get('/portal/eu')).statusCode).toBe(401);
  });
});

describe('lixeira, ajustes e auditoria', () => {
  it('o tutorial na lixeira some do portal e volta pela Administração', async () => {
    const maria = new Cliente(app);
    await maria.entrar('maria@aurora.com.br', 'Trocada2026');
    expect((await operador.del(`/portal-admin/tutoriais/${numeros.geral}`)).statusCode).toBe(200);
    expect((await maria.get(`/portal/tutoriais/${numeros.geral}`)).statusCode).toBe(404);
    const lixo = (await s.get('/admin/trash')).json().find((x: any) => x.type === 'portalArticle');
    expect(lixo.label).toMatch(/^Tutorial \d+ · Como abrir/);
    expect((await s.post(`/admin/trash/portalArticle/${lixo.id}/restore`)).statusCode).toBe(200);
    expect((await maria.get(`/portal/tutoriais/${numeros.geral}`)).statusCode).toBe(200);
  });

  it('os ajustes são da administração; a tela de entrar mostra o contato do suporte', async () => {
    const ajustes = { titulo: 'Central de ajuda Ingline', boasVindas: 'Olá!', whatsapp: '(71) 99999-0000', email: 'suporte@inglinesystems.com.br', horario: 'Seg a sex, 8h às 18h' };
    expect((await operador.put('/portal-admin/ajustes', ajustes)).statusCode).toBe(403);
    expect((await s.put('/portal-admin/ajustes', { ...ajustes, whatsapp: '123' })).statusCode).toBe(400);
    expect((await s.put('/portal-admin/ajustes', ajustes)).statusCode).toBe(200);
    expect((await new Cliente(app).get('/portal/sobre')).json()).toMatchObject({ titulo: 'Central de ajuda Ingline', email: 'suporte@inglinesystems.com.br' });
  });

  it('a auditoria registra quem deu e tirou acesso — nunca o código do convite', async () => {
    const itens = (await s.get('/admin/audit?entityType=portal&pageSize=200')).json().items;
    const resumos: string[] = itens.map((x: any) => x.summary);
    expect(resumos).toContain('Deu acesso ao portal a Maria Souza (maria@aurora.com.br), de Clínica Aurora');
    expect(resumos.some((r) => r.startsWith('Bloqueou o acesso de Maria Souza'))).toBe(true);
    expect(resumos.some((r) => r.startsWith('Gerou um convite novo para Maria Souza'))).toBe(true);
    expect(resumos.some((r) => r.startsWith('Tentativa de entrar no portal falhou para ninguem@aurora.com.br'))).toBe(true);
    expect(JSON.stringify(itens)).not.toMatch(/convite\/[\w-]{40,}/);
  });
});
