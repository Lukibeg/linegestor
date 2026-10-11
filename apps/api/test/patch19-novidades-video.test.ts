/**
 * Patch 1.9 — o vídeo do patch (decisão 0046): "vamos usar isso ao invés dos textos quando o
 * pessoal logar, porém os textos vão estar disponíveis na aba de atualizações".
 *  - o vídeo sobe para o disco, sem nota, e passa a ser da nota ao salvar
 *  - a nota que abre no login traz o vídeo (os cartões continuam na lista da página)
 *  - o vídeo é servido com Range; o de rascunho (e o que acabou de subir) só quem edita vê
 *  - trocar e tirar só tiram da nota: o arquivo fica no disco; vídeo de outra nota não entra
 *  - "Assisti e entendi" fica na auditoria como "assistiu ao vídeo"
 *  - a nota que vem pronta em docs/novidades traz o vídeo do lado (`video:` no cabeçalho)
 */
import { mkdtemp, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { releaseNoteVideos } from '@gestor/db';
import { eq } from 'drizzle-orm';
import { makeApp, Session, type App } from './helpers.js';

let app: App;
let s: Session;
let operador: Session;
let notaId = '';
let videoId = '';

/** Um "vídeo" de 100 bytes (0, 1, 2, …): dá para conferir o pedaço que o Range devolve. */
const VIDEO = Buffer.from(Array.from({ length: 100 }, (_, i) => i));

function multipart(nome: string, mime: string, conteudo: Buffer) {
  const limite = `----gestor${Math.random().toString(16).slice(2)}`;
  const corpo = Buffer.concat([
    Buffer.from(`--${limite}\r\nContent-Disposition: form-data; name="arquivo"; filename="${nome}"\r\nContent-Type: ${mime}\r\n\r\n`),
    conteudo, Buffer.from(`\r\n--${limite}--\r\n`),
  ]);
  return { corpo, tipo: `multipart/form-data; boundary=${limite}` };
}
const subir = (quem: Session, nome: string, mime: string, conteudo: Buffer) => {
  const m = multipart(nome, mime, conteudo);
  return app.inject({ method: 'POST', url: '/api/release-notes/videos', payload: m.corpo, headers: { cookie: quem.cookie, 'content-type': m.tipo } });
};
const pegar = (quem: Session, url: string, headers: Record<string, string> = {}) =>
  app.inject({ method: 'GET', url: `/api/${url}`, headers: { cookie: quem.cookie, ...headers } });

beforeAll(async () => {
  process.env.PORTAL_DIR = await mkdtemp(join(tmpdir(), 'novidades-teste-'));
  app = await makeApp();
  s = new Session(app);
  await s.login();
  const papeis = (await s.get('/admin/roles')).json();
  await s.post('/admin/users', { name: 'Marina Costa', email: 'marina@gestor.local', password: 'SenhaDeTeste!123', roleId: papeis.find((r: any) => r.key === 'operador').id });
  operador = new Session(app);
  await operador.login('marina@gestor.local', 'SenhaDeTeste!123');
});
afterAll(async () => { await app.close(); });

describe('subir o vídeo e pôr na nota', () => {
  it('só quem edita sobe; só vídeo (MP4, WebM, MOV); vai para o disco, sem nota', async () => {
    expect((await subir(operador, 'o-que-mudou.mp4', 'video/mp4', VIDEO)).statusCode).toBe(403);
    const pdf = await subir(s, 'manual.pdf', 'application/pdf', VIDEO);
    expect(pdf.statusCode).toBe(400);
    expect(pdf.json().error).toMatch(/MP4/);

    const r = await subir(s, 'o-que-mudou.mp4', 'video/mp4', VIDEO);
    expect(r.statusCode).toBe(201);
    videoId = r.json().id;
    expect(r.json()).toMatchObject({ nome: 'o-que-mudou.mp4', tamanho: 100, tipo: 'video/mp4', url: `release-notes/videos/${videoId}` });
    expect(await readdir(join(process.env.PORTAL_DIR!, 'novidades'))).toEqual([`${videoId}.mp4`]);
    const [linha] = await app.db.select().from(releaseNoteVideos).where(eq(releaseNoteVideos.id, videoId));
    expect(linha!.noteId).toBeNull();
  });

  it('o que acabou de subir (e o de rascunho) só quem edita vê', async () => {
    expect((await pegar(operador, `release-notes/videos/${videoId}`)).statusCode).toBe(404);
    expect((await pegar(s, `release-notes/videos/${videoId}`)).statusCode).toBe(200);

    const r = await s.post('/release-notes', { version: '1.9', title: 'O que mudou', items: [{ kind: 'novo', title: 'Relatórios' }], videoId });
    expect(r.statusCode).toBe(201);
    notaId = r.json().id;
    expect(r.json()).not.toHaveProperty('mudancaDoVideo');
    // rascunho: a equipe ainda não vê o vídeo
    expect((await pegar(operador, `release-notes/videos/${videoId}`)).statusCode).toBe(404);
    const daLista = (await s.get('/release-notes')).json().items.find((n: any) => n.id === notaId);
    expect(daLista.video).toMatchObject({ id: videoId, nome: 'o-que-mudou.mp4' });
  });

  it('publicada, abre no login com o vídeo; os cartões continuam na lista', async () => {
    await s.post(`/release-notes/${notaId}/publish`, { publicar: true });
    const pend = (await operador.get('/release-notes/pending')).json();
    expect(pend.video).toMatchObject({ id: videoId, url: `release-notes/videos/${videoId}`, tipo: 'video/mp4' });
    expect(pend.items).toHaveLength(1);

    const tudo = await pegar(operador, pend.video.url);
    expect(tudo.statusCode).toBe(200);
    expect(tudo.headers['content-type']).toBe('video/mp4');
    expect(tudo.headers['accept-ranges']).toBe('bytes');
    expect(tudo.rawPayload.length).toBe(100);

    // o player pede um pedaço: vem só ele (o Safari só toca assim)
    const pedaco = await pegar(operador, pend.video.url, { range: 'bytes=10-19' });
    expect(pedaco.statusCode).toBe(206);
    expect(pedaco.headers['content-range']).toBe('bytes 10-19/100');
    expect([...pedaco.rawPayload]).toEqual([10, 11, 12, 13, 14, 15, 16, 17, 18, 19]);
    expect((await pegar(operador, pend.video.url, { range: 'bytes=500-' })).statusCode).toBe(416);
  });

  it('"Assisti e entendi" marca como lida e fica na auditoria como "assistiu ao vídeo"', async () => {
    expect((await operador.post(`/release-notes/${notaId}/read`, { assistiu: true })).statusCode).toBe(200);
    expect((await operador.get('/release-notes/pending')).json()).toBeNull();
    // marcar pela página, sem o vídeo, continua valendo
    expect((await s.post(`/release-notes/${notaId}/read`)).statusCode).toBe(200);
    const audit = (await s.get('/admin/audit?entityType=releaseNote&pageSize=100')).json();
    const textos = (audit.items ?? audit).map((a: any) => a.summary);
    expect(textos).toContain('Marina Costa assistiu ao vídeo das novidades de 1.9');
    expect(textos.some((t: string) => /leu as novidades de 1\.9/.test(t))).toBe(true);
    expect(textos.some((t: string) => /Subiu o vídeo "o-que-mudou\.mp4"/.test(t))).toBe(true);
    expect(textos.some((t: string) => /Criou a nota de novidades 1\.9 — pôs o vídeo/.test(t))).toBe(true);
  });
});

describe('trocar e tirar o vídeo', () => {
  it('trocar põe o novo e tira o antigo da nota; o arquivo antigo fica no disco', async () => {
    const outro = (await subir(s, 'versao-2.webm', 'video/webm', VIDEO)).json().id as string;
    expect((await s.patch(`/release-notes/${notaId}`, { videoId: outro })).statusCode).toBe(200);
    const nota = (await s.get('/release-notes')).json().items.find((n: any) => n.id === notaId);
    expect(nota.video).toMatchObject({ id: outro, tipo: 'video/webm' });
    // o antigo saiu das telas da equipe, mas o arquivo continua lá (nada se apaga de verdade)
    expect((await pegar(operador, `release-notes/videos/${videoId}`)).statusCode).toBe(404);
    expect((await readdir(join(process.env.PORTAL_DIR!, 'novidades'))).sort()).toEqual([`${videoId}.mp4`, `${outro}.webm`].sort());
    // e não volta pela porta dos fundos: o que saiu não é mais "disponível"
    expect((await s.patch(`/release-notes/${notaId}`, { videoId })).statusCode).toBe(400);

    // editar sem falar do vídeo mantém o vídeo
    expect((await s.patch(`/release-notes/${notaId}`, { title: 'O que mudou no 1.9' })).statusCode).toBe(200);
    expect((await s.get('/release-notes')).json().items.find((n: any) => n.id === notaId).video.id).toBe(outro);
  });

  it('o vídeo de outra nota não entra; tirar deixa a nota com os cartões', async () => {
    const atual = (await s.get('/release-notes')).json().items.find((n: any) => n.id === notaId).video.id as string;
    const outra = (await s.post('/release-notes', { version: '1.9.1', title: 'Outra', items: [{ kind: 'novo', title: 'Algo' }] })).json();
    expect((await s.patch(`/release-notes/${outra.id}`, { videoId: atual })).statusCode).toBe(400);

    expect((await s.patch(`/release-notes/${notaId}`, { videoId: null })).statusCode).toBe(200);
    expect((await s.get('/release-notes')).json().items.find((n: any) => n.id === notaId).video).toBeNull();
    const audit = (await s.get('/admin/audit?entityType=releaseNote&pageSize=100')).json();
    const textos = (audit.items ?? audit).map((a: any) => a.summary);
    expect(textos.some((t: string) => /— trocou o vídeo/.test(t))).toBe(true);
    expect(textos.some((t: string) => /— tirou o vídeo/.test(t))).toBe(true);
    await s.del(`/release-notes/${outra.id}`);
  });
});

describe('a nota que vem pronta, com o vídeo do lado', () => {
  it('o cabeçalho "video:" traz o arquivo; a importação copia para o disco e a nota abre com ele', async () => {
    const { lerNota } = await import('../src/tools/importar-novidades.js');
    const svc = await import('../src/services/releaseNotes.js');
    const pasta = await mkdtemp(join(tmpdir(), 'nota-pronta-'));
    await writeFile(join(pasta, 'resumo.mp4'), VIDEO);
    await writeFile(join(pasta, '2.0.md'), '---\nversao: 2.0\ntitulo: Teste\nvideo: resumo.mp4\n---\n\n## novo · Um item\nTexto.\n');
    const nota = await lerNota(join(pasta, '2.0.md'));
    expect(nota.video).toMatchObject({ nome: 'resumo.mp4', mime: 'video/mp4' });

    const r = await svc.importar(app.db, nota);
    expect(r).toMatchObject({ criada: true, video: true });
    const pend = (await operador.get('/release-notes/pending')).json();
    expect(pend.version).toBe('2.0');
    expect(pend.video.nome).toBe('resumo.mp4');
    expect((await pegar(operador, pend.video.url)).rawPayload.length).toBe(100);
    // de novo: a versão já existe, nada se repete (nem o vídeo)
    const antes = (await readdir(join(process.env.PORTAL_DIR!, 'novidades'))).length;
    expect((await svc.importar(app.db, nota)).criada).toBe(false);
    expect((await readdir(join(process.env.PORTAL_DIR!, 'novidades'))).length).toBe(antes);

    // o vídeo que falta na pasta (ou num formato estranho) avisa já na leitura
    await writeFile(join(pasta, '2.1.md'), '---\nversao: 2.1\ntitulo: Teste\nvideo: nao-existe.mp4\n---\n\n## novo · Um item\n');
    await expect(lerNota(join(pasta, '2.1.md'))).rejects.toThrow(/não está na pasta/);
    await writeFile(join(pasta, '2.2.md'), '---\nversao: 2.2\ntitulo: Teste\nvideo: resumo.avi\n---\n\n## novo · Um item\n');
    await expect(lerNota(join(pasta, '2.2.md'))).rejects.toThrow(/formato não suportado/);
  });

  it('a nota do 1.9 em docs/novidades tem o vídeo do lado', async () => {
    const { lerNota } = await import('../src/tools/importar-novidades.js');
    const nota = await lerNota(new URL('../../../docs/novidades/1.9.md', import.meta.url).pathname);
    expect(nota.video).toMatchObject({ nome: 'o-que-mudou.mp4', mime: 'video/mp4' });
  });
});
