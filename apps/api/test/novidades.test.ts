/**
 * Novidades (notas de versão): rascunho x publicada, a nota que abre no login, "Li e entendi",
 * quem já leu, e a importação que o publicar.sh roda sem duplicar.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { makeApp, Session, type App } from './helpers.js';

let app: App;
let s: Session;
let operador: Session;
let noteId: string;

/** Um PNG de 1x1 pixel, só para exercitar o caminho da imagem. */
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

beforeAll(async () => {
  app = await makeApp();
  s = new Session(app);
  await s.login();
  // uma segunda pessoa, para "quem leu" ter mais de um nome
  const papeis = (await s.get('/admin/roles')).json();
  const operadorRole = papeis.find((r: any) => r.key === 'operador');
  await s.post('/admin/users', { name: 'Marina Costa', email: 'marina@gestor.local', password: 'SenhaDeTeste!123', roleId: operadorRole.id });
  operador = new Session(app);
  await operador.login('marina@gestor.local', 'SenhaDeTeste!123');
});
afterAll(async () => { await app.close(); });

describe('rascunho e publicação', () => {
  it('a nota nasce rascunho, não aparece para ninguém, e publicar exige ao menos um item', async () => {
    const r = await s.post('/release-notes', {
      version: 'rodada-23',
      title: 'Login padrão por modelo, DIDs com circuito e mais',
      summary: 'O que mudou nesta publicação.',
      items: [],
    });
    expect(r.statusCode).toBe(201);
    noteId = r.json().id;
    expect(r.json().publishedAt).toBeNull();

    // rascunho não abre no login nem entra no histórico de quem não edita
    expect((await s.get('/release-notes/pending')).json()).toBeNull();
    expect((await operador.get('/release-notes')).json().items).toHaveLength(0);
    // mas quem edita enxerga o rascunho
    expect((await s.get('/release-notes')).json().items).toHaveLength(1);

    const semItens = await s.post(`/release-notes/${noteId}/publish`, { publicar: true });
    expect(semItens.statusCode).toBe(400);
    expect(semItens.json().error).toMatch(/item/i);
  });

  it('com itens, publica e passa a abrir no login de todo mundo', async () => {
    const itens = await s.patch(`/release-notes/${noteId}`, {
      items: [
        { kind: 'atencao', title: 'Todo DID agora pertence a um circuito', text: 'Ao criar faixa, escolha o circuito.', imagem: PNG },
        { kind: 'novo', title: 'Login e senha padrão por modelo', text: 'Fica junto da rede padrão.' },
      ],
    });
    expect(itens.statusCode).toBe(200);

    const pub = await s.post(`/release-notes/${noteId}/publish`, { publicar: true });
    expect(pub.statusCode).toBe(200);
    expect(pub.json().publishedAt).not.toBeNull();

    const pend = (await operador.get('/release-notes/pending')).json();
    expect(pend.version).toBe('rodada-23');
    expect(pend.items).toHaveLength(2);
    expect(pend.items[0].kind).toBe('atencao');
    // o print vem como endereço, não como imagem embutida
    expect(pend.items[0].imageUrl).toMatch(/release-notes\/items\/.+\/image/);
    expect(pend.items[1].imageUrl).toBeNull();
    const img = await operador.get(`/${pend.items[0].imageUrl}`.replace('//', '/'));
    expect(img.statusCode).toBe(200);
    expect(img.headers['content-type']).toBe('image/png');
  });
});

describe('"Li e entendi"', () => {
  it('some para quem marcou, continua para quem não marcou, e marcar duas vezes não duplica', async () => {
    expect((await operador.get('/release-notes')).json().naoLidas).toBe(1);
    expect((await operador.post(`/release-notes/${noteId}/read`)).statusCode).toBe(200);
    expect((await operador.get('/release-notes/pending')).json()).toBeNull();
    expect((await operador.get('/release-notes')).json().naoLidas).toBe(0);
    // a nota continua no histórico, marcada como lida
    const hist = (await operador.get('/release-notes')).json().items;
    expect(hist).toHaveLength(1);
    expect(hist[0].lida).toBe(true);

    // quem ainda não marcou continua vendo
    expect((await s.get('/release-notes/pending')).json().version).toBe('rodada-23');

    await operador.post(`/release-notes/${noteId}/read`);
    const quem = (await s.get(`/release-notes/${noteId}/reads`)).json();
    expect(quem.pessoas).toHaveLength(2);
    expect(quem.pessoas.filter((p: any) => p.readAt).map((p: any) => p.name)).toEqual(['Marina Costa']);
  });

  it('rascunho não pode ser marcado como lido', async () => {
    const rascunho = (await s.post('/release-notes', { version: 'rodada-99', title: 'Ainda escrevendo', items: [{ kind: 'novo', title: 'Algo' }] })).json();
    expect((await s.post(`/release-notes/${rascunho.id}/read`)).statusCode).toBe(400);
    await s.del(`/release-notes/${rascunho.id}`);
  });
});

describe('só a mais recente abre no login', () => {
  it('quem entra depois de várias versões vê só a última; as outras ficam no histórico', async () => {
    const nova = (await s.post('/release-notes', {
      version: 'rodada-24',
      title: 'Novidades ficam registradas no sistema',
      items: [{ kind: 'novo', title: 'Esta tela', text: 'É esta aqui.' }],
    })).json();
    await s.post(`/release-notes/${nova.id}/publish`, { publicar: true });

    // a Marina já tinha lido a 23; agora só a 24 abre
    const pend = (await operador.get('/release-notes/pending')).json();
    expect(pend.version).toBe('rodada-24');
    await operador.post(`/release-notes/${nova.id}/read`);
    expect((await operador.get('/release-notes/pending')).json()).toBeNull();

    // o administrador nunca leu a 23: mesmo assim, o que abre é a mais recente
    expect((await s.get('/release-notes/pending')).json().version).toBe('rodada-24');
    await s.post(`/release-notes/${nova.id}/read`);
    expect((await s.get('/release-notes/pending')).json()).toBeNull();

    const hist = (await s.get('/release-notes')).json().items;
    expect(hist.map((n: any) => n.version)).toEqual(['rodada-24', 'rodada-23']);
    expect(hist[0].leituras).toBe(2);
    expect(hist[0].pessoas).toBe(2);
  });
});

describe('edição', () => {
  it('troca, reordena e apaga itens; a versão não se repete', async () => {
    const antes = (await s.get('/release-notes')).json().items.find((n: any) => n.version === 'rodada-23');
    const [primeiro] = antes.items;
    const r = await s.patch(`/release-notes/${noteId}`, {
      title: 'Título novo',
      items: [
        { kind: 'novo', title: 'Item que entrou na frente' },
        { id: primeiro.id, kind: 'atencao', title: primeiro.title, text: 'Texto ajustado', imagem: null },
      ],
    });
    expect(r.statusCode).toBe(200);
    const depois = (await s.get('/release-notes')).json().items.find((n: any) => n.version === 'rodada-23');
    expect(depois.title).toBe('Título novo');
    expect(depois.items.map((i: any) => i.title)).toEqual(['Item que entrou na frente', primeiro.title]);
    expect(depois.items[1].text).toBe('Texto ajustado');
    expect(depois.items[1].imageUrl).toBeNull(); // o print foi tirado
    expect((await s.post('/release-notes', { version: 'rodada-24', title: 'Repetida' })).statusCode).toBe(400);
  });

  it('só quem administra edita; a equipe lê', async () => {
    expect((await operador.post('/release-notes', { version: 'x', title: 'y' })).statusCode).toBe(403);
    expect((await operador.get(`/release-notes/${noteId}/reads`)).statusCode).toBe(403);
    expect((await operador.get('/release-notes')).statusCode).toBe(200);
  });
});

describe('nota escrita em arquivo (a que vem pronta na publicação)', () => {
  it('lê o arquivo da rodada 23, importa uma vez só e já publica', async () => {
    const { lerNota } = await import('../src/tools/importar-novidades.js');
    const svc = await import('../src/services/releaseNotes.js');
    const nota = await lerNota(new URL('../../../docs/novidades/rodada-23.md', import.meta.url).pathname);

    expect(nota.version).toBe('rodada-23');
    expect(nota.items.length).toBeGreaterThan(5);
    // o primeiro item é uma mudança de regra, com print embutido
    expect(nota.items[0]!.kind).toBe('atencao');
    expect(nota.items[0]!.imagem).toMatch(/^data:image\/jpeg;base64,/);
    // as quebras de linha do arquivo viram um parágrafo só
    expect(nota.items[0]!.text).not.toContain('\n');
    // item sem print continua válido
    expect(nota.items.some((i) => !i.imagem)).toBe(true);

    // a versão "rodada-23" já existe neste teste: a importação não duplica nem estraga o que está lá
    const r = await svc.importar(app.db, nota);
    expect(r.criada).toBe(false);

    // uma versão que ainda não existe entra publicada, pronta para abrir no login
    const outra = await svc.importar(app.db, { ...nota, version: 'rodada-23-copia' });
    expect(outra.criada).toBe(true);
    const guardada = (await s.get('/release-notes')).json().items.find((n: any) => n.version === 'rodada-23-copia');
    expect(guardada.publishedAt).not.toBeNull();
    expect(guardada.items).toHaveLength(nota.items.length);
    expect(guardada.items[0].imageUrl).toMatch(/release-notes\/items\/.+\/image/);
    await s.del(`/release-notes/${guardada.id}`);
  });
});
