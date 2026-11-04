/**
 * Patch 2.4.2 — O /NIA NO CARD (decisão 0060). A NIA (a IA do suporte, um serviço de fora) propõe; a pessoa aplica.
 *
 *  - os ajustes (Painéis › Ajustes › Integrações): o endereço e a chave de serviço (no cofre, nunca volta); a chave só
 *    vai para o servidor onde foi colada; o Testar diz quantos comandos vieram
 *  - o catálogo (o menu do /nia) vem da NIA, com a chave no cabeçalho, guardado 5 minutos; sem a NIA configurada,
 *    vem vazio (o /nia não aparece)
 *  - a proposta manda o card inteiro lido do banco, só com os campos que o painel usa; as opções (a entrega "campos")
 *    só com o que o painel usa e com as folhas do assunto; devolve a resposta como veio; não grava nada nem vai para o
 *    Histórico
 *  - as falhas: ok:false como veio, o prazo esgotado e a chave recusada (as frases da tela)
 *  - o Aplicar grava só os marcados, pelo caminho de sempre, com a linha `nia` no Histórico (a frase só dos gravados);
 *    recusa o que passa do tamanho e quem não pode editar; o nome → id das listas
 *  - a chave nunca aparece em resposta nenhuma para o navegador
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { clients, newId, products, ticketEvents, tickets, ticketSubjects } from '@gestor/db';
import type { FichaChamado, PedidoParaANia } from '@gestor/shared';
import { makeApp, Session, type App } from './helpers.js';
import { esperarSegundoPlano } from '../src/services/atendimento/avisos.js';
import { esquecerCatalogoDaNia, NIA_CHAVE_RECUSADA, NIA_NAO_RESPONDEU, trocarFerramentasNia } from '../src/services/atendimento/niaAcoes.js';

let app: App;
let s: Session;       // a administração
let marina: Session;  // operadora: trabalha nos chamados, não cuida das integrações
let lia: Session;     // só lê os chamados
const SUP = 'painel-suporte';
const ENDERECO = 'https://2.24.93.36:8443';
// a chave só existe aqui, gerada na hora (nada com cara de chave de verdade)
const CHAVE = `chave-falsa-${Math.random().toString(36).slice(2)}`;
let labchecap = '';
let sup = { id: '', codigo: '' };
let folhaMudo = '';

/** Tudo o que o Gestor devolveu ao navegador nos testes: a chave não pode aparecer em nada. */
const respostas: string[] = [];
const guardar = <T extends { body: string }>(r: T) => { respostas.push(r.body); return r; };

// ---------- a NIA de mentira ----------

const CATALOGO = {
  acoes: [
    { comando: 'corrigir', nome: 'Corrigir o português', descricao: 'Corrige ortografia, acentuação e pontuação sem mudar o que foi dito.', entrega: 'texto', camposOrigem: [], exigeTexto: true },
    { comando: 'formalizar', nome: 'Formalizar para o cliente', descricao: 'Reescreve num tom formal.', entrega: 'texto', camposOrigem: [], exigeTexto: true },
    { comando: 'resumir', nome: 'Resumir', descricao: 'Um resumo curto do card.', entrega: 'texto', camposOrigem: [], exigeTexto: true },
    { comando: 'criar-chamado', nome: 'Criar chamado', descricao: 'A ligação vira o card.', entrega: 'campos', camposOrigem: [], exigeTexto: true },
    { comando: 'preencher-card-vazio', nome: 'Preencher card vazio', descricao: 'Preenche os campos.', entrega: 'campos', camposOrigem: [], exigeTexto: false },
  ],
};
type Recebido = { url: string; metodo: string; chave: string | null; corpo: any; redirect?: string };
let recebidos: Recebido[] = [];
/** O que a NIA responde ao executar (cada teste escolhe). */
let responder: (p: PedidoParaANia) => { status?: number; corpo?: unknown; demora?: boolean } = () => ({ corpo: { ok: false, erro: 'sem resposta' } });

function niaDeMentira() {
  trocarFerramentasNia({
    prazoMs: 300,
    fetchFn: (async (url: string, init: RequestInit) => {
      const h = new Headers(init.headers);
      const corpo = init.body ? JSON.parse(String(init.body)) : null;
      recebidos.push({ url, metodo: init.method ?? 'GET', chave: h.get('x-nia-api-key'), corpo, redirect: init.redirect });
      if (h.get('x-nia-api-key') !== CHAVE) return new Response(JSON.stringify({ erro: 'chave' }), { status: 401 });
      if (url.endsWith('/api/nia/acoes')) return Response.json(CATALOGO);
      if (url.endsWith('/api/nia/executar')) {
        const r = responder(corpo);
        if (r.demora) {
          // a NIA que não responde: espera o prazo do Gestor acabar
          await new Promise((_, recusar) => init.signal!.addEventListener('abort', () => recusar(init.signal!.reason)));
        }
        return new Response(JSON.stringify(r.corpo), { status: r.status ?? 200, headers: { 'content-type': 'application/json' } });
      }
      return new Response('não', { status: 404 });
    }) as unknown as typeof fetch,
  });
}

async function ficha(ref: string, quem: Session = s): Promise<FichaChamado> {
  const r = guardar(await quem.get(`/atendimento/chamados/${encodeURIComponent(ref)}`));
  expect(r.statusCode, r.body).toBe(200);
  return r.json();
}
const eventosNia = async (id: string) => app.db.select().from(ticketEvents).where(eq(ticketEvents.ticketId, id)).then((xs) => xs.filter((e) => e.kind === 'nia'));
const propor = async (ref: string, corpo: unknown, quem: Session = marina) => guardar(await quem.post(`/atendimento/chamados/${ref}/nia/propor`, corpo));
const aplicar = async (ref: string, corpo: unknown, quem: Session = marina) => guardar(await quem.post(`/atendimento/chamados/${ref}/nia/aplicar`, corpo));
const auditoria = async () => ((await s.get('/admin/audit?pageSize=200')).json().items as Array<{ summary: string; before: unknown; after: unknown }>);

beforeAll(async () => {
  app = await makeApp();
  s = new Session(app);
  await s.login();
  const papeis = (await s.get('/admin/roles')).json();
  await s.post('/admin/users', { name: 'Marina Costa', email: 'marina@gestor.local', password: 'SenhaDeTeste!123', roleId: papeis.find((r: any) => r.key === 'operador').id });
  marina = new Session(app); await marina.login('marina@gestor.local', 'SenhaDeTeste!123');
  const leitura = await s.post('/admin/roles', { name: 'Só lê', description: 'só lê', permissions: ['records.read', 'support.read'] });
  await s.post('/admin/users', { name: 'Lia Rocha', email: 'lia@gestor.local', password: 'SenhaDeTeste!123', roleId: leitura.json().id });
  lia = new Session(app); await lia.login('lia@gestor.local', 'SenhaDeTeste!123');

  labchecap = newId();
  await app.db.insert(clients).values({ id: labchecap, tradeName: 'Labchecap', legalName: 'Labchecap Análises LTDA', cnpj: '11222333000181' });
  // a árvore do Suporte: "Ramal" e "Ramal › Incidentes" são pastas; só as folhas vão para a NIA
  const ramal = newId(); const inc = newId(); folhaMudo = newId(); const lc = newId(); const cfg = newId();
  await app.db.insert(ticketSubjects).values([
    { id: ramal, panelId: SUP, name: 'Ramal' }, { id: inc, panelId: SUP, parentId: ramal, name: 'Incidentes' }, { id: folhaMudo, panelId: SUP, parentId: inc, name: 'Mudo' },
    { id: lc, panelId: SUP, name: 'Linechat' }, { id: cfg, panelId: SUP, parentId: lc, name: 'Configuração' }, { id: newId(), panelId: SUP, parentId: cfg, name: 'Equipes' },
    { id: newId(), panelId: SUP, name: 'Antigo', active: false },
  ]);
  const r = await s.post('/atendimento/chamados', {
    painelId: SUP, titulo: 'Ramais mudos na Labchecap', relato: 'desde terca os ramais nao tem audio', descricao: 'testado o ramal 203',
  });
  expect(r.statusCode, r.body).toBe(201);
  sup = r.json();
  await s.patch(`/atendimento/chamados/${sup.id}`, { solucao: 'trocamos o codec', causa: 'o codec errado' });
  niaDeMentira();
});
beforeEach(() => { recebidos = []; esquecerCatalogoDaNia(); });
afterAll(async () => {
  await esperarSegundoPlano();
  await app.close();
});

describe('os ajustes da NIA (Painéis › Ajustes › Integrações)', () => {
  it('sem nada configurado: o /nia não aparece (o catálogo vem vazio) e a proposta avisa', async () => {
    const t = guardar(await s.get('/atendimento/integracoes/nia-acoes'));
    expect(t.json()).toEqual({ endereco: '', temChave: false, configuradoEm: null, configuradoPor: null, ultimoTeste: null });
    expect(guardar(await marina.get('/atendimento/nia/acoes')).json()).toEqual({ configurada: false, acoes: [], erro: null });
    const r = await propor(sup.codigo, { comando: 'corrigir', campo: 'solucao' });
    expect(r.json()).toMatchObject({ ok: false, erro: expect.stringMatching(/Painéis › Ajustes › Integrações/) });
    expect(recebidos).toHaveLength(0);
  });

  it('o endereço sem a chave é recusado; com a chave, ela vai para o cofre e nunca volta', async () => {
    expect((await s.put('/atendimento/integracoes/nia-acoes', { endereco: ENDERECO })).json().error).toMatch(/Cole a chave/);
    expect((await s.put('/atendimento/integracoes/nia-acoes', { endereco: 'http://2.24.93.36:8443', chave: CHAVE })).statusCode).toBe(400);
    const r = guardar(await s.put('/atendimento/integracoes/nia-acoes', { endereco: `${ENDERECO}/`, chave: CHAVE }));
    expect(r.statusCode, r.body).toBe(200);
    expect(r.json()).toMatchObject({ endereco: ENDERECO, temChave: true, configuradoPor: 'Administrador' });
    // a administração só: a operadora não mexe nos ajustes
    expect((await marina.get('/atendimento/integracoes/nia-acoes')).statusCode).toBe(403);
    // a auditoria diz o que mudou, sem a chave
    const a = await auditoria();
    expect(a[0]!.summary).toBe(`Mudou o endereço da NIA (/nia): ${ENDERECO}, com a chave nova`);
    expect(JSON.stringify(a)).not.toContain(CHAVE);
  });

  it('trocar o endereço para outro servidor pede a chave de novo (a guardada só vai para onde foi colada)', async () => {
    const r = await s.put('/atendimento/integracoes/nia-acoes', { endereco: 'https://nia.exemplo.com.br' });
    expect(r.statusCode).toBe(400);
    expect(r.json().error).toMatch(/cole a chave de novo/);
    // o mesmo servidor, com outro caminho, continua com a chave
    expect((await s.put('/atendimento/integracoes/nia-acoes', { endereco: ENDERECO })).statusCode).toBe(200);
  });

  it('o Testar lê o catálogo e diz quantos comandos vieram, com a chave no cabeçalho e sem seguir redirecionamento', async () => {
    const r = guardar(await s.post('/atendimento/integracoes/nia-acoes/testar'));
    expect(r.json()).toMatchObject({ ok: true, mensagem: 'A NIA respondeu: 5 comandos.', quantos: 5 });
    expect(recebidos[0]).toMatchObject({ url: `${ENDERECO}/api/nia/acoes`, metodo: 'GET', chave: CHAVE, redirect: 'error' });
    expect(guardar(await s.get('/atendimento/integracoes/nia-acoes')).json().ultimoTeste).toMatchObject({ ok: true, quantos: 5 });
  });
});

describe('o catálogo (o menu do /nia)', () => {
  it('vem da NIA, com o nome e a descrição de cada comando, e fica guardado 5 minutos', async () => {
    const r = guardar(await marina.get('/atendimento/nia/acoes'));
    expect(r.statusCode).toBe(200);
    expect(r.json().configurada).toBe(true);
    expect(r.json().acoes.map((a: any) => [a.comando, a.nome])).toEqual(CATALOGO.acoes.map((a) => [a.comando, a.nome]));
    expect(r.json().acoes[0].descricao).toMatch(/^Corrige ortografia/);
    await marina.get('/atendimento/nia/acoes');
    expect(recebidos.filter((x) => x.url.endsWith('/acoes'))).toHaveLength(1);
  });
  it('quem só lê os chamados não usa o /nia', async () => {
    expect((await lia.get('/atendimento/nia/acoes')).statusCode).toBe(403);
    expect((await lia.post(`/atendimento/chamados/${sup.codigo}/nia/propor`, { comando: 'corrigir' })).statusCode).toBe(403);
  });
});

describe('a proposta (nada é gravado)', () => {
  it('"/nia corrigir o relato e a causa" (na Solução): manda o card inteiro, lido do banco, e devolve as alterações como vieram', async () => {
    responder = () => ({
      corpo: {
        ok: true, comando: 'corrigir', entrega: 'texto', alcance: 'campos citados',
        alteracoes: [
          { campo: 'relato', nome: 'Relato do cliente', antes: 'desde terca os ramais nao tem audio', depois: 'Desde terça os ramais não têm áudio.', mudou: true },
          { campo: 'causa', nome: 'Causa', antes: 'o codec errado', depois: 'O codec errado.', mudou: true },
        ],
        resumo: 'NIA (Corrigir o português) em Relato do cliente e Causa: mudou Relato do cliente e Causa.', observacao: null, erro: null, custo: { usd: 0.002 }, duracaoMs: 5123,
      },
    });
    const antes = await ficha(sup.codigo);
    const r = await propor(sup.codigo, { comando: 'corrigir', instrucao: 'o relato e a causa', campo: 'solucao' });
    expect(r.statusCode, r.body).toBe(200);
    expect(r.json()).toMatchObject({ ok: true, alcance: 'campos citados', alteracoes: [{ campo: 'relato', depois: 'Desde terça os ramais não têm áudio.' }, { campo: 'causa' }], duracaoMs: 5123 });
    const pedido = recebidos.find((x) => x.url.endsWith('/executar'))!;
    expect(pedido).toMatchObject({ metodo: 'POST', chave: CHAVE, url: `${ENDERECO}/api/nia/executar` });
    // os campos de texto que o painel do chamado usa, como estão gravados (o contorno e a validação são do problema)
    expect(pedido.corpo).toEqual({
      comando: 'corrigir', instrucao: 'o relato e a causa', campo: 'solucao', referencia: sup.codigo,
      chamado: { titulo: 'Ramais mudos na Labchecap', relato: 'desde terca os ramais nao tem audio', descricao: 'testado o ramal 203', solucao: 'trocamos o codec', causa: 'o codec errado' },
    });
    // nada mudou no card e nada foi para o Histórico (a auditoria diz quem pediu)
    const depois = await ficha(sup.codigo);
    expect(depois.relato).toBe(antes.relato);
    expect(depois.historico).toHaveLength(antes.historico.length);
    expect((await auditoria())[0]!.summary).toBe(`Pediu à NIA (Corrigir o português) uma proposta para ${sup.codigo}, do campo solucao`);
  });

  it('o painel que desligou o relato e a solução não manda esses campos; a anotação vai só quando o /nia foi nela', async () => {
    const painel = (await s.get('/atendimento/opcoes')).json().paineis.find((p: any) => p.id === SUP);
    const desligar = await s.put(`/atendimento/paineis/${SUP}/campos-do-sistema`, { desligados: ['relato', 'solucao'], tipos: painel.ajustes.tipos });
    expect(desligar.statusCode, desligar.body).toBe(200);
    responder = () => ({ corpo: { ok: true, entrega: 'texto', alcance: 'card inteiro', alteracoes: [] } });
    await propor(sup.codigo, { comando: 'corrigir', campo: 'anotacao', anotacao: 'liguei pro cliente e ele confimou' });
    expect(recebidos.find((x) => x.url.endsWith('/executar'))!.corpo.chamado).toEqual({
      titulo: 'Ramais mudos na Labchecap', descricao: 'testado o ramal 203', anotacao: 'liguei pro cliente e ele confimou',
    });
    await s.put(`/atendimento/paineis/${SUP}/campos-do-sistema`, { desligados: [], tipos: painel.ajustes.tipos });
  });

  it('o resumir volta com um texto só', async () => {
    responder = () => ({ corpo: { ok: true, comando: 'resumir', entrega: 'texto', alcance: 'card inteiro', texto: 'Ramais sem áudio desde terça; codec trocado.', resumo: 'NIA (Resumir)' } });
    const r = await propor(sup.codigo, { comando: 'resumir', campo: 'descricao' });
    expect(r.json()).toMatchObject({ ok: true, texto: 'Ramais sem áudio desde terça; codec trocado.' });
    expect(recebidos.find((x) => x.url.endsWith('/executar'))!.corpo.opcoes).toBeUndefined();
  });

  it('a entrega "campos": as opções só do que o painel usa (o assunto, só as folhas) e, de volta, o id de cada nome', async () => {
    responder = () => ({
      corpo: {
        ok: true, comando: 'criar-chamado', entrega: 'campos',
        campos: { titulo: 'Ramais sem áudio', relato: 'Michele, da Labchecap: desde terça os ramais estão mudos.', descricao: null, cliente: 'Labchecap', produto: 'LinePBX', tipo: 'Incidente', assunto: 'Ramal › Incidentes › Mudo', gravidade: null },
        naoPropostos: [], observacao: null,
      },
    });
    const r = await propor(sup.codigo, { comando: 'criar-chamado', instrucao: 'foi a Michele do Labchecap, desde terça os ramais estão mudos', campo: 'relato' });
    expect(r.statusCode, r.body).toBe(200);
    const o = recebidos.find((x) => x.url.endsWith('/executar'))!.corpo.opcoes;
    expect(o.assunto).toEqual(['Linechat › Configuração › Equipes', 'Ramal › Incidentes › Mudo']);
    expect(o.cliente).toContain('Labchecap');
    expect(o.produto).toContain('LinePBX');
    expect(o.tipo).toEqual(['Incidente', 'Requisição', 'Dúvida', 'Mudança']);
    expect(o.gravidade).toContain('Inoperância');
    const [linepbx] = await app.db.select({ id: products.id }).from(products).where(eq(products.name, 'LinePBX'));
    // a gravidade em branco é decisão da NIA: fica nula
    expect(r.json().idsDasListas).toEqual({ clienteId: labchecap, produtos: [linepbx!.id], tipo: 'Incidente', assunto: 'Ramal › Incidentes › Mudo', gravidade: null });
  });

  it('as falhas: o ok:false como veio, a NIA que não responde e a chave recusada (a ficha nunca quebra)', async () => {
    responder = () => ({ corpo: { ok: false, erro: 'Descrição está vazio: não há o que trabalhar' } });
    expect((await propor(sup.codigo, { comando: 'corrigir' })).json()).toMatchObject({ ok: false, erro: 'Descrição está vazio: não há o que trabalhar' });

    responder = () => ({ demora: true, corpo: { ok: true } });
    const lenta = await propor(sup.codigo, { comando: 'corrigir' });
    expect(lenta.statusCode).toBe(200);
    expect(lenta.json()).toMatchObject({ ok: false, erro: NIA_NAO_RESPONDEU });
    expect(NIA_NAO_RESPONDEU).toBe('A NIA não respondeu agora. Tente de novo.');

    responder = () => ({ status: 401, corpo: { erro: 'chave' } });
    const recusada = await propor(sup.codigo, { comando: 'corrigir' });
    expect(recusada.json()).toMatchObject({ ok: false, erro: NIA_CHAVE_RECUSADA });
    expect(NIA_CHAVE_RECUSADA).toBe('A chave da NIA foi recusada; confira em Painéis › Ajustes › Integrações.');

    responder = () => ({ corpo: 'isso não é uma resposta' });
    expect((await propor(sup.codigo, { comando: 'corrigir' })).json().ok).toBe(false);
    // o comando que a NIA não tem
    expect((await propor(sup.codigo, { comando: 'traduzir' })).json()).toMatchObject({ ok: false, erro: expect.stringMatching(/não tem o comando "traduzir"/) });
  });
});

describe('o Aplicar (só o marcado, pelo caminho de sempre)', () => {
  it('grava só os marcados e registra no Histórico a frase dos gravados', async () => {
    const r = await aplicar(sup.codigo, {
      comando: 'corrigir', resumo: 'NIA (Corrigir o português) em Relato do cliente e Causa: mudou Relato do cliente e Causa.',
      campos: { relato: 'Desde terça os ramais não têm áudio.' },
    });
    expect(r.statusCode, r.body).toBe(200);
    const f: FichaChamado = r.json();
    expect(f.relato).toBe('Desde terça os ramais não têm áudio.');
    expect(f.causa).toBe('o codec errado');
    const linha = f.historico.find((e) => e.tipo === 'nia')!;
    expect(linha.texto).toBe('aplicou a NIA (Corrigir o português): mudou Relato do cliente');
    expect(linha.por?.nome).toBe('Marina Costa');
    expect((await eventosNia(sup.id)).at(-1)!.data).toEqual({ comando: 'corrigir', resumo: 'NIA (Corrigir o português): mudou Relato do cliente', campos: ['Relato do cliente'] });
    // o campo também tem a linha de sempre ("editou Relato do cliente"), e a auditoria guarda o de antes
    expect(f.historico.some((e) => e.tipo === 'campo' && e.texto === 'editou Relato do cliente')).toBe(true);
    const a = (await auditoria())[0]!;
    expect(a.summary).toBe(`Aplicou a proposta da NIA em ${sup.codigo} "Ramais mudos na Labchecap": NIA (Corrigir o português): mudou Relato do cliente`);
    expect(a.before).toEqual({ relato: 'desde terca os ramais nao tem audio' });
  });

  it('o que passa do tamanho do campo é recusado, com a mensagem clara (nada é cortado nem gravado)', async () => {
    const r = await aplicar(sup.codigo, { comando: 'formalizar', campos: { relato: 'ok', causa: 'x'.repeat(5_001) } });
    expect(r.statusCode).toBe(400);
    expect(r.json().error).toBe('Causa ficaria com 5.001 letras, e o máximo é 5.000. Nada foi gravado: encurte antes de aplicar.');
    expect((await ficha(sup.codigo)).relato).toBe('Desde terça os ramais não têm áudio.');
  });

  it('o campo que o card não usa e o "nada mudou" são recusados; quem só lê também', async () => {
    expect((await aplicar(sup.codigo, { comando: 'corrigir', campos: { contorno: 'algo' } })).json().error).toBe('Solução de contorno não é um campo deste card.');
    expect((await aplicar(sup.codigo, { comando: 'corrigir', campos: { relato: 'Desde terça os ramais não têm áudio.' } })).json().error).toMatch(/^Nada mudou/);
    expect((await aplicar(sup.codigo, { comando: 'corrigir', campos: { relato: 'x' } }, lia)).statusCode).toBe(403);
    // a anotação não passa por aqui (volta ao rascunho, na tela)
    expect((await aplicar(sup.codigo, { comando: 'corrigir', campos: { anotacao: 'x' } })).statusCode).toBe(400);
  });

  it('a entrega "campos": cliente, produto, assunto (pelo caminho) e gravidade (pela chave), com a frase do que foi preenchido', async () => {
    const [linepbx] = await app.db.select({ id: products.id }).from(products).where(eq(products.name, 'LinePBX'));
    const r = await aplicar(sup.codigo, {
      comando: 'criar-chamado',
      campos: { titulo: 'Ramais sem áudio' },
      listas: { clienteId: labchecap, produtos: [linepbx!.id], assunto: 'Ramal › Incidentes › Mudo', gravidade: 'inoperancia' },
    });
    expect(r.statusCode, r.body).toBe(200);
    const f: FichaChamado = r.json();
    expect(f).toMatchObject({ titulo: 'Ramais sem áudio', cliente: { id: labchecap }, assunto: { id: folhaMudo }, gravidade: 'inoperancia' });
    expect(f.produtos.map((p) => p.nome)).toEqual(['LinePBX']);
    expect(f.historico.filter((e) => e.tipo === 'nia').at(-1)!.texto).toMatch(/^aplicou a NIA \(Criar chamado\): preencheu Título, Cliente, Assunto, Gravidade/);
    // o assunto que não existe é recusado (nada é gravado no lugar)
    expect((await aplicar(sup.codigo, { comando: 'criar-chamado', campos: {}, listas: { assunto: 'Ramal › Não existe' } })).statusCode).toBe(400);
  });
});

describe('a chave nunca vai para o navegador', () => {
  it('em nenhuma resposta dos testes', async () => {
    expect(respostas.length).toBeGreaterThan(10);
    for (const corpo of respostas) expect(corpo).not.toContain(CHAVE);
    const [linha] = await app.db.select({ id: tickets.id }).from(tickets).where(eq(tickets.id, sup.id));
    expect(linha).toBeTruthy();
  });
});
