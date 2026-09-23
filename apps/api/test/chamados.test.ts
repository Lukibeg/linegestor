/**
 * Chamados do LineChat: a sincronização e a tela.
 *
 * O LineChat de verdade não é chamado nos testes: sobe aqui um servidor de mentira que responde
 * no mesmo formato da API (conferido contra a API real em 23/09/2026: páginas de 100, `hasMorePages`,
 * `customFields` com o nome da opção, `Statuses`, `UpdatedAt.After`).
 *
 * O que estes testes seguram:
 *  - o token vai para o cofre e nunca volta na resposta; testar e listar painéis funcionam
 *  - a leitura completa pagina até o fim e grava tudo; a recente pega só o que mudou
 *  - mudança de etapa vira movimento com a hora do LineChat; chegar numa etapa final = fechado
 *  - card que sumiu de lá fica marcado como excluído e sai das contas — mas se a resposta vier
 *    quase vazia (token ou painel errado), ninguém é marcado
 *  - token errado vira mensagem clara, sem derrubar nada
 *  - os números da tela batem com os filtros; quem não tem a permissão não vê
 *  - clicar filtra: o gráfico clicado continua inteiro, com o escolhido marcado; os números de cima
 *    e as colunas do tempo também filtram, e a tabela obedece
 *  - a arrumação da tela vale para todos: quem vê chamados lê, só a administração arruma
 */
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { linechatCardMoves, linechatCards } from '@gestor/db';
import { makeApp, Session, type App } from './helpers.js';

// ---------- o LineChat de mentira ----------

const PAINEL = 'painel-suporte';
const TOKEN = 'pn_token_de_teste';
const ETAPAS = [
  { id: 'e-novo', title: 'Novos Suporte', position: 4, isInitial: true, isFinal: false },
  { id: 'e-n1', title: 'Chamado Em Tratativa N1', position: 6, isInitial: false, isFinal: false },
  { id: 'e-tratado', title: 'Chamado Tratado Suporte', position: 10, isInitial: false, isFinal: true },
];
const CAMPOS = [
  { key: 'cliente-71', name: 'Cliente', type: 'SINGLESELECT', position: 2, options: [{ name: 'Labchecap' }, { name: 'Grado' }] },
  { key: 'observador', name: 'Observadores', type: 'MULTISELECT', position: 8, options: [{ name: 'Carlos' }, { name: 'Lucio' }] },
  { key: 'grupo', name: 'Grupo', type: 'GROUP', position: 1, options: [] },
];
const TAGS = [{ id: 't-alta', name: 'P/ Alta', bgColor: 'rgb(255, 0, 0)' }];

type CardFalso = Record<string, any>;
const agoraIso = () => new Date().toISOString();
const horasAtras = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();

let cards: CardFalso[] = [];
let tokenAceito = TOKEN;
function novoCard(n: number, p: Partial<CardFalso> = {}): CardFalso {
  const etapa = ETAPAS[n % 2]!;
  return {
    id: `card-${n}`, panelId: PAINEL, number: n, key: `IS-${n}`, title: `Chamado ${n}`, description: n === 7 ? 'Ramal 9871 sem áudio' : null,
    stepId: etapa.id, stepTitle: etapa.title, stepPhase: etapa.isInitial ? 'INITIAL' : 'INTERMEDIATE', status: 'OPEN',
    createdAt: horasAtras(48 + n), updatedAt: horasAtras(24), dueDate: null, isOverdue: n === 3, tagIds: n === 1 ? ['t-alta'] : [],
    responsibleUserId: n % 3 ? 'u-lucio' : null, responsibleUser: n % 3 ? { id: 'u-lucio', name: 'Lucio Almeida' } : null,
    customFields: { 'cliente-71': n % 2 ? 'Labchecap' : 'Grado', ...(n === 1 ? { observador: ['Carlos', 'Lucio'] } : {}) },
    ...p,
  };
}

const servidor = http.createServer((req, res) => {
  const url = new URL(req.url!, 'http://x');
  const json = (status: number, corpo: unknown) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(corpo)); };
  if (req.headers.authorization !== `Bearer ${tokenAceito}`) return json(401, { message: 'Unauthorized' });
  if (url.pathname === '/crm/v2/panel') return json(200, { items: [{ id: PAINEL, title: 'Ingline - Suporte', key: 'IS', type: 'MANAGEMENT' }, { id: 'outro', title: 'Comercial', key: 'IC', type: 'SALES' }], hasMorePages: false });
  if (url.pathname === `/crm/v1/panel/${PAINEL}`) {
    return json(200, { id: PAINEL, title: 'Ingline - Suporte', steps: ETAPAS.map((e) => ({ ...e, cardCount: cards.filter((c) => c.stepId === e.id && c.status === 'OPEN').length })), tags: TAGS });
  }
  if (url.pathname === `/crm/v1/panel/${PAINEL}/custom-fields`) return json(200, CAMPOS);
  if (url.pathname === '/crm/v2/panel/card') {
    const tamanho = Number(url.searchParams.get('PageSize'));
    if (tamanho > 100) return json(500, { message: 'PageSize máximo é 100' });
    const situacoes = url.searchParams.getAll('Statuses');
    const depois = url.searchParams.get('UpdatedAt.After');
    let lista = cards.filter((c) => c.panelId === url.searchParams.get('PanelId'))
      .filter((c) => !situacoes.length || situacoes.includes(c.status))
      .filter((c) => !depois || Date.parse(c.updatedAt) > Date.parse(depois));
    const campo = url.searchParams.get('OrderBy') === 'UpdatedAt' ? 'updatedAt' : 'createdAt';
    lista = lista.sort((a, b) => Date.parse(a[campo]) - Date.parse(b[campo]));
    const pagina = Number(url.searchParams.get('PageNumber'));
    const itens = lista.slice((pagina - 1) * tamanho, pagina * tamanho);
    return json(200, { pageNumber: pagina, pageSize: tamanho, items: itens, totalItems: lista.length, hasMorePages: pagina * tamanho < lista.length });
  }
  json(404, { message: 'não achei' });
});

// ---------- o Gestor ----------

let app: App;
let s: Session;
let base = '';

beforeAll(async () => {
  await new Promise<void>((ok) => servidor.listen(0, '127.0.0.1', ok));
  base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
  // 250 cards abertos + 2 arquivados: três páginas de 100
  cards = Array.from({ length: 250 }, (_, i) => novoCard(i + 1));
  cards.push(novoCard(251, { status: 'ARCHIVED' }), novoCard(252, { status: 'ARCHIVED' }));
  app = await makeApp();
  s = new Session(app);
  await s.login();
});
afterAll(async () => { await app?.close(); servidor.close(); });

const salvar = (extra: Record<string, unknown> = {}) =>
  s.put('/settings/linechat', { ativo: true, url: base, appUrl: 'https://inglinechat.com.br', painelId: PAINEL, painelNome: 'Ingline - Suporte', ...extra });

describe('ajustes do LineChat', () => {
  it('começa desligado, e o token vai para o cofre sem voltar na resposta', async () => {
    const r0 = (await s.get('/settings/linechat')).json();
    expect(r0.ativo).toBe(false);
    expect(r0.url).toBe('https://api.inglinechat.com.br');
    expect(r0.temToken).toBe(false);

    const r = await s.put('/settings/linechat', { ativo: true, url: base, appUrl: 'https://inglinechat.com.br', painelId: '', token: TOKEN });
    expect(r.statusCode).toBe(200);
    expect(r.body).not.toContain(TOKEN);
    expect(r.json().temToken).toBe(true);
    const auditoria = (await s.get('/admin/audit?action=settings_linechat')).json();
    expect(JSON.stringify(auditoria)).not.toContain(TOKEN);
  });

  it('sem painel, o teste confirma o token e a lista de painéis vem do LineChat', async () => {
    const t = (await s.post('/settings/linechat/test')).json();
    expect(t.ok).toBe(true);
    expect(t.mensagem).toContain('2 painéis');
    const paineis = (await s.get('/settings/linechat/paineis')).json();
    expect(paineis.map((p: any) => p.title)).toEqual(['Ingline - Suporte', 'Comercial']);
  });

  it('com o painel escolhido, o teste diz o que encontrou', async () => {
    await salvar();
    const t = (await s.post('/settings/linechat/test')).json();
    expect(t.ok).toBe(true);
    expect(t.mensagem).toContain('Painel "Ingline - Suporte": 3 etapas');
  });
});

describe('sincronização', () => {
  it('a primeira é completa: pagina até o fim e grava tudo, arquivados inclusive', async () => {
    const r = (await s.post('/settings/linechat/sync', {})).json();
    expect(r.ok).toBe(true);
    expect(r.tipo).toBe('completa');
    expect(r.lidos).toBe(252);
    expect(r.novos).toBe(252);
    expect(r.movimentos).toBe(0);

    const st = (await s.get('/settings/linechat')).json();
    expect(st.ultimaOk).toBe(true);
    expect(st.inicioEm).toBeTruthy();
    expect(st.totais).toMatchObject({ cards: 252, ativos: 250, arquivados: 2 });
    expect(st.execucoes[0].kind).toBe('completa');

    // o que já existia antes da primeira leitura tem a hora de entrada na etapa estimada
    const [m] = await app.db.select().from(linechatCardMoves).where(eq(linechatCardMoves.cardId, 'card-1'));
    expect(m!.estimated).toBe(true);
    expect(m!.fromStepId).toBeNull();
  });

  it('a recente pega só o que mudou: mudança de etapa vira movimento, com a hora do LineChat', async () => {
    const quando = agoraIso();
    const c2 = cards.find((c) => c.id === 'card-2')!; // estava em Novos Suporte
    Object.assign(c2, { stepId: 'e-tratado', stepTitle: 'Chamado Tratado Suporte', stepPhase: 'FINAL', updatedAt: quando });
    cards.push(novoCard(253, { createdAt: agoraIso(), updatedAt: agoraIso(), customFields: { 'cliente-71': 'Grado' } }));
    Object.assign(cards.find((c) => c.id === 'card-4')!, { status: 'ARCHIVED', updatedAt: agoraIso() });

    const r = (await s.post('/settings/linechat/sync', {})).json();
    expect(r.ok).toBe(true);
    expect(r.tipo).toBe('recente');
    expect(r.lidos).toBe(3);
    expect(r.novos).toBe(1);
    expect(r.movimentos).toBe(1);

    const movs = await app.db.select().from(linechatCardMoves).where(eq(linechatCardMoves.cardId, 'card-2'));
    const mudou = movs.find((m) => m.fromStepId)!;
    expect(mudou).toMatchObject({ fromStepId: 'e-novo', toStepId: 'e-tratado', estimated: false });
    expect(mudou.at.toISOString()).toBe(new Date(quando).toISOString());

    const [c] = await app.db.select().from(linechatCards).where(eq(linechatCards.id, 'card-2'));
    expect(c!.closedAt?.toISOString()).toBe(new Date(quando).toISOString());
    expect(c!.closedEstimated).toBe(false);

    // aberto depois da primeira leitura: a hora de entrada é exata
    const [novo] = await app.db.select().from(linechatCardMoves).where(eq(linechatCardMoves.cardId, 'card-253'));
    expect(novo!.estimated).toBe(false);

    const [arq] = await app.db.select().from(linechatCards).where(eq(linechatCards.id, 'card-4'));
    expect(arq!.status).toBe('ARCHIVED');
    expect(arq!.archivedAt).toBeTruthy();
  });

  it('voltar de uma etapa final reabre o chamado', async () => {
    Object.assign(cards.find((c) => c.id === 'card-2')!, { stepId: 'e-n1', stepTitle: 'Chamado Em Tratativa N1', stepPhase: 'INTERMEDIATE', updatedAt: agoraIso() });
    await s.post('/settings/linechat/sync', {});
    const [c] = await app.db.select().from(linechatCards).where(eq(linechatCards.id, 'card-2'));
    expect(c!.closedAt).toBeNull();
  });

  it('card excluído lá fica marcado na completa e sai das contas', async () => {
    cards = cards.filter((c) => c.id !== 'card-10');
    const r = (await s.post('/settings/linechat/sync', { completa: true })).json();
    expect(r.ok).toBe(true);
    expect(r.removidos).toBe(1);
    const [c] = await app.db.select().from(linechatCards).where(eq(linechatCards.id, 'card-10'));
    expect(c!.removedAt).toBeTruthy();
    const lista = (await s.get('/chamados/lista?aba=periodo&de=2020-01-01&ate=2030-12-31&arquivados=true&pageSize=100000')).json();
    expect(lista.items.some((x: any) => x.id === 'card-10')).toBe(false);
  });

  it('se o LineChat devolver quase nada, ninguém é marcado como excluído', async () => {
    const guardados = cards;
    cards = cards.slice(0, 5);
    const r = (await s.post('/settings/linechat/sync', { completa: true })).json();
    expect(r.ok).toBe(true);
    expect(r.removidos).toBe(0);
    expect(r.mensagem).toContain('Nada foi marcado como excluído');
    cards = guardados;
  });

  it('token recusado vira mensagem clara, e a situação fica registrada', async () => {
    tokenAceito = 'outro';
    const r = (await s.post('/settings/linechat/sync', {})).json();
    expect(r.ok).toBe(false);
    expect(r.mensagem).toContain('recusou o token (401)');
    const st = (await s.get('/settings/linechat')).json();
    expect(st.ultimaOk).toBe(false);
    expect(st.execucoes[0].ok).toBe(false);
    tokenAceito = TOKEN;
  });
});

describe('a tela de Chamados', () => {
  it('opções: etapas na ordem, só campos de lista, etiquetas e responsáveis', async () => {
    const o = (await s.get('/chamados/opcoes')).json();
    expect(o.configurado).toBe(true);
    expect(o.etapas.map((e: any) => e.title)).toEqual(['Novos Suporte', 'Chamado Em Tratativa N1', 'Chamado Tratado Suporte']);
    expect(o.campos.map((c: any) => c.name)).toEqual(['Cliente', 'Observadores']);
    expect(o.etiquetas[0].name).toBe('P/ Alta');
    expect(o.responsaveis).toEqual(['Lucio Almeida']);
    expect(o.linkDoPainel).toBe(`https://inglinechat.com.br/panels/${PAINEL}`);
  });

  it('Em aberto conta fora das etapas finais; filtro por campo e busca na descrição', async () => {
    const r = (await s.get('/chamados/resumo?aba=abertos')).json();
    // 250 abertos - card-10 excluído - card-4 arquivado + card-253 novo
    expect(r.total).toBe(249);
    const cliente = r.porCampo.find((c: any) => c.key === 'cliente-71');
    expect(cliente.itens.reduce((a: number, x: any) => a + x.n, 0)).toBe(249);

    const labchecap = (await s.get('/chamados/resumo?aba=abertos&campo=cliente-71%3DLabchecap')).json();
    expect(labchecap.total).toBe(125);
    // o gráfico de cliente continua com todos (para desfazer ou escolher outro), a Labchecap marcada
    expect(labchecap.porCampo.find((c: any) => c.key === 'cliente-71').itens.map((x: any) => [x.valor, x.n, !!x.selecionado]))
      .toEqual([['Labchecap', 125, true], ['Grado', 124, false]]);
    // o resto da tela obedece
    expect(labchecap.porEtapa.reduce((a: number, x: any) => a + x.n, 0)).toBe(125);

    const busca = (await s.get('/chamados/lista?aba=abertos&busca=9871')).json();
    expect(busca.total).toBe(1);
    expect(busca.items[0].key).toBe('IS-7');
    expect(busca.items[0].link).toBe(`https://inglinechat.com.br/panels/${PAINEL}/card/IS-7`);
  });

  it('a tabela ordena e pagina no servidor', async () => {
    const p1 = (await s.get('/chamados/lista?aba=abertos&sort=numero&dir=asc&pageSize=100')).json();
    expect(p1.total).toBe(249);
    expect(p1.items).toHaveLength(100);
    expect(p1.items[0].key).toBe('IS-1');
    expect(p1.items[0].etiquetas[0].name).toBe('P/ Alta');
    expect(p1.items[0].campos.observador).toBe('Carlos, Lucio');
    const p3 = (await s.get('/chamados/lista?aba=abertos&sort=numero&dir=asc&pageSize=100&page=3')).json();
    expect(p3.items).toHaveLength(49);
  });

  it('quem não tem a permissão de ver chamados não vê', async () => {
    const papel = (await s.post('/admin/roles', { name: 'Só cadastro', description: 'sem chamados', permissions: ['records.read'] })).json();
    await s.post('/admin/users', { name: 'Sem Chamados', email: 'semchamados@gestor.local', password: 'SenhaDeTeste!123', roleId: papel.id });
    const outro = new Session(app);
    await outro.login('semchamados@gestor.local', 'SenhaDeTeste!123');
    expect((await outro.get('/chamados/resumo?aba=hoje')).statusCode).toBe(403);
    expect((await outro.get('/settings/linechat')).statusCode).toBe(403);
  });

  it('os papéis de fábrica já vêm com a permissão', async () => {
    const papeis = (await s.get('/admin/roles')).json();
    for (const k of ['leitor', 'operador', 'tecnico', 'administrador']) {
      expect(papeis.find((p: any) => p.key === k).permissions).toContain('support.read');
    }
  });
});

describe('clicar filtra, e a arrumação da tela', () => {
  it('número de cima e coluna do tempo clicados filtram a tela e a tabela', async () => {
    const r = (await s.get('/chamados/resumo?aba=abertos&situacao=sem-responsavel')).json();
    const semResp = r.kpis.find((k: any) => k.id === 'sem-responsavel');
    expect(semResp.ativo).toBe(true);
    expect(r.total).toBe(Number(semResp.valor));
    // o número "de tudo" não muda com a escolha: é nele que se clica para voltar
    expect(r.kpis.find((k: any) => k.id === 'em-aberto')).toMatchObject({ valor: '249', total: true });
    const l = (await s.get('/chamados/lista?aba=abertos&situacao=sem-responsavel&pageSize=1000')).json();
    expect(l.total).toBe(r.total);
    expect(l.items.every((x: any) => !x.responsavel)).toBe(true);

    const idade = (await s.get('/chamados/resumo?aba=abertos&quando=2-7')).json();
    const faixa = idade.serie.pontos.find((p: any) => p.id === '2-7');
    expect(faixa.selecionado).toBe(true);
    expect(idade.total).toBe(faixa.n);
    // as outras faixas continuam no gráfico
    expect(idade.serie.pontos.reduce((a: number, p: any) => a + p.n, 0)).toBe(249);
  });

  it('a arrumação começa de fábrica; a administração salva, e fica na auditoria', async () => {
    expect((await s.get('/chamados/painel')).json()).toEqual({ itens: [], atualizadoEm: null, atualizadoPor: null });
    const itens = [
      { id: 'campo:cliente-71', largura: 'inteira', oculto: false, forma: 'pizza' },
      { id: 'serie', largura: 'metade', oculto: false },
      { id: 'etiqueta', largura: 'metade', oculto: true, forma: 'barras' },
    ];
    const r = await s.put('/chamados/painel', { itens });
    expect(r.statusCode).toBe(200);
    expect(r.json().itens).toEqual(itens);
    expect(r.json().atualizadoEm).toBeTruthy();
    expect(r.json().atualizadoPor).toBeTruthy();
    const a = (await s.get('/admin/audit?action=chamados_painel')).json();
    expect(JSON.stringify(a)).toContain('arrumou a tela de Chamados para a equipe (2 gráficos à vista, 1 escondido)');
  });

  it('gráfico repetido ou desconhecido é recusado; quem não administra lê, mas não arruma', async () => {
    expect((await s.put('/chamados/painel', { itens: [{ id: 'etapa', largura: 'metade' }, { id: 'etapa', largura: 'inteira' }] })).statusCode).toBe(400);
    expect((await s.put('/chamados/painel', { itens: [{ id: 'grafico-x', largura: 'metade' }] })).statusCode).toBe(400);

    const leitor = (await s.get('/admin/roles')).json().find((p: any) => p.key === 'leitor');
    await s.post('/admin/users', { name: 'Leitor dos Chamados', email: 'leitorchamados@gestor.local', password: 'SenhaDeTeste!123', roleId: leitor.id });
    const outro = new Session(app);
    await outro.login('leitorchamados@gestor.local', 'SenhaDeTeste!123');
    const lido = await outro.get('/chamados/painel');
    expect(lido.statusCode).toBe(200);
    expect(lido.json().itens).toHaveLength(3);
    expect((await outro.put('/chamados/painel', { itens: [] })).statusCode).toBe(403);
  });
});
