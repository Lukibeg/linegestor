/**
 * Patch 2.0.3 — TRAZER DO HELENA (decisão 0054): o painel de vendas do Helena vem para um painel de Vendas do
 * Gestor, com o histórico. O pedido do Luan (21/10): "pegue tudo que já ta no meu painel do helena e migre
 * para o nosso, inclusive o histórico para que eu possa usar o relatório" ("n precisa dos comentários").
 *
 * O Helena de verdade não é chamado: sobe aqui um de mentira, no formato da API (a lista v2 com os campos
 * pelo nome das opções; o card v1 com os Logs, os textos como o Helena escreve — conferidos no painel Ingline -
 * Comercial em 21/10). Os nomes de empresa e de pessoa são de exemplo.
 *
 *  - só quem importa e cuida dos painéis; a chave do LineChat é a do cofre
 *  - a leitura roda por fora e conta os cards; a prévia não grava nada
 *  - o Trazer cria o painel de Vendas (IC, com as etapas do Helena e os campos), cada negociação com o número de
 *    lá, o valor, a ativação, o cliente, o responsável, os observadores, as etiquetas e o histórico
 *  - o relatório do Gestor dá o mesmo que o do Helena (os ganhos pela Conclusão)
 *  - de novo: atualiza o que já veio (sem duplicar), refaz o histórico do Helena e guarda o que a equipe fez
 *  - vai para a auditoria
 *  - 2.1.1: como a chave de API do ar (24/10) — sem o histórico, sem a Conclusão —, a Conclusão vem da planilha
 *    do Helena (o link do Google Planilhas, que um Google de mentira serve, ou o .csv), e os meses ficam certos
 */
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq, like } from 'drizzle-orm';
import { clients, newId, ticketEvents, ticketPanels, tickets } from '@gestor/db';
import { textoDoEvento, type CampoPersonalizado, type Painel, type PreviaDoHelena, type RelatorioDeVendas } from '@gestor/shared';
import { makeApp, Session, type App } from './helpers.js';
import { esperarLeitura, trocarFerramentasHelena } from '../src/services/helena.js';

// ---------- o Helena de mentira ----------

const TOKEN = 'pn_token_do_helena';
const PAINEL = 'painel-com';
const ETAPAS = [
  { id: 'h-standby', title: 'StandBy', position: 1, isInitial: false, isFinal: false },
  { id: 'h-lead', title: 'Lead Novo', position: 2, isInitial: true, isFinal: false },
  { id: 'h-proposta', title: 'Aguardando Envio Proposta', position: 3, isInitial: false, isFinal: false },
  { id: 'h-base', title: 'Cliente na base', position: 4, isInitial: false, isFinal: false },
];
const CAMPOS = [
  { key: 'grupo', name: 'Informações Lead', type: 'GROUP', position: 1, options: [] },
  { key: 'cnpj-64', name: 'CNPJ', type: 'TEXT', position: 2, options: [] },
  { key: 'servicos', name: 'Serviços Ofertados', type: 'MULTISELECT', position: 3, options: [{ name: 'LinePBX' }, { name: 'LineChat' }] },
  { key: 'mens-pbx', name: 'Valor Mensalidade LinePBX', type: 'CURRENCY', position: 4, options: [] },
  { key: 'ativ-pbx', name: 'Valor Ativação LinePBX', type: 'CURRENCY', position: 5, options: [] },
  { key: 'origem', name: 'Origem de lead', type: 'SINGLESELECT', position: 6, options: [{ name: 'Indicação' }, { name: 'Feira' }] },
  { key: 'licencas', name: 'Licenças WhatsApp', type: 'NUMBER', position: 7, options: [] },
  { key: 'observador', name: 'Observador', type: 'MULTISELECT', position: 8, options: [] },
  { key: 'area', name: 'Área de Atuação Lead', type: 'SINGLESELECT', position: 9, options: [{ name: 'Saúde' }] },
  { key: 'indicacao', name: 'Indicação', type: 'SINGLESELECT', position: 10, options: [{ name: 'Parceiro Contábil' }] },
];
const TAGS = [{ id: 't-ingline', name: 'P/R Ingline', bgColor: 'rgb(0, 138, 0)' }];
const LUAN = { id: 'u-luan', name: 'Luan França' };

type CardFalso = Record<string, any>;
let cards: CardFalso[] = [];
/** os detalhes de cada pedido do card, na ordem (um parâmetro por detalhe) */
const pedidosDeHistorico: string[][] = [];
/** a chave que lê a lista mas não o card (o histórico) */
let historicoRecusado = false;
/**
 * Os detalhes que o card v1 conhece (os que a tela do Helena pede). Como o LineChat de verdade (ASP.NET), cada
 * valor de `IncludeDetails` é um detalhe: a lista numa linha só ("Logs,Key,…") é um valor que ele não conhece e
 * leva 500 FORM_ERROR — o que se viu no ar em 22/10, antes e depois do 2.0.4 (a vírgula escrita ou o %2C dá no
 * mesmo). `detalhesRecusados` faz de conta que este LineChat não conhece algum.
 */
const DETALHES_DO_CARD_NO_HELENA = new Set(['Logs', 'Notes', 'CustomFieldValues', 'Key', 'ResultDescription', 'PanelTitle', 'PanelType', 'Step']);
let detalhesRecusados = new Set<string>();
/**
 * Como a chave de API do ar (24/10, a prévia do Trazer no sistema): o card v1 só conhece os detalhes da API
 * pública (recusa o "Logs" e o "ResultDescription") e vem sem a Conclusão, sem o motivo e sem o histórico; a
 * lista traz o motivo da perda com o detalhe LostReason (o da API pública).
 */
let comoAChaveDoAr = false;
const DETALHES_DA_API_PUBLICA = new Set(['PanelTitle', 'StepTitle', 'StepPhase', 'ResponsibleUser', 'Contacts', 'CustomFields', 'LostReason']);
/** a lista que não conhece o LostReason (o Trazer pede de novo sem ele) */
let listaRecusaOMotivo = false;
const log = (id: string, createdAt: string, text: string, userId = LUAN.id) => ({ id, createdAt, cardId: '', text, color: '#008A00', userId, isAPI: false, isMigration: false, details: null });

function novosCards(): CardFalso[] {
  const base = { panelId: PAINEL, responsibleUserId: LUAN.id, responsibleUser: LUAN, createdByUserId: LUAN.id, description: null, tagIds: [] as string[], customFields: {} as Record<string, unknown>, monetaryAmount: null, resultChangedAt: null, resultDescription: null };
  return [
    {
      ...base, id: 'card-34', number: 34, key: 'IC-34', title: 'Padaria Estrela - LinePBX', stepTitle: 'Cliente na base', status: 'WON',
      createdAt: '2026-09-01T12:00:00Z', updatedAt: '2026-10-02T13:00:00Z', monetaryAmount: 990, resultChangedAt: '2026-10-02T13:00:00Z', tagIds: ['t-ingline'],
      customFields: { 'cnpj-64': '11.222.333/0001-81', servicos: ['LinePBX'], 'mens-pbx': 'R$ 990,00', 'ativ-pbx': 'R$ 500,00', origem: 'Feira', licencas: 3, observador: ['Camila Souza'], area: 'Saúde', indicacao: 'Parceiro Contábil' },
      logs: [
        log('l1', '2026-09-01T12:00:00.100Z', 'Item criado por Luan França em Lead Novo'),
        log('l2', '2026-09-05T12:00:00Z', 'Valor atribuído alterado para R$ 990,00'),
        log('l3', '2026-09-10T12:00:00Z', 'Item movido de Lead Novo para Aguardando Envio Proposta'),
        log('l4', '2026-10-01T12:00:00Z', 'Item movido de Aguardando Envio Proposta para Cliente na base'),
        log('l5', '2026-10-02T13:00:00Z', 'Item marcado como "Ganho"'),
        log('l6', '2026-10-02T13:00:01Z', 'A etiqueta P/R Ingline foi adicionada'),
      ],
    },
    {
      // o card duplicado no Helena, com a Conclusão de antes
      ...base, id: 'card-12', number: 12, key: 'IC-12', title: 'Loja Nova (Cópia)', stepTitle: 'Cliente na base', status: 'WON',
      createdAt: '2026-02-10T12:00:00Z', updatedAt: '2026-07-06T17:52:00Z', monetaryAmount: 1900, resultChangedAt: '2026-02-15T15:00:00Z',
      logs: [log('l7', '2026-07-06T17:52:00Z', 'Item marcado como "Ganho"')],
    },
    {
      ...base, id: 'card-5', number: 5, key: 'IC-5', title: 'Hotel Mar - WhatsApp', stepTitle: 'StandBy', status: 'LOST',
      createdAt: '2026-02-16T13:31:35Z', updatedAt: '2026-06-18T21:12:07Z', resultChangedAt: '2026-06-18T21:12:07Z', resultDescription: 'Perfil fora do público-alvo',
      logs: [
        log('l8', '2026-02-16T13:31:35Z', 'Item criado por Luan em Lead Novo'),
        log('l9', '2026-03-23T22:09:58Z', 'Item movido de Lead Novo para StandBy'),
        log('l10', '2026-06-18T21:12:07Z', 'Item marcado como "Perda"'),
      ],
    },
    {
      ...base, id: 'card-60', number: 60, key: 'IC-60', title: 'Clínica Sol - LineChat', stepTitle: 'Aguardando Envio Proposta', status: 'OPEN',
      createdAt: '2026-10-01T12:00:00Z', updatedAt: '2026-10-01T12:00:00Z', monetaryAmount: 1450, customFields: { servicos: ['LineChat'] },
      logs: [log('l11', '2026-10-01T12:00:00.100Z', 'Item criado por Luan França em Aguardando Envio Proposta')],
    },
    { ...base, id: 'card-61', number: 61, key: 'IC-61', title: 'Arquivado - LinePBX', stepTitle: 'StandBy', status: 'ARCHIVED', createdAt: '2026-03-01T12:00:00Z', updatedAt: '2026-03-02T12:00:00Z', logs: [] },
  ];
}

const servidor = http.createServer((req, res) => {
  const url = new URL(req.url!, 'http://x');
  const json = (status: number, corpo: unknown) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(corpo)); };
  if (req.headers.authorization !== `Bearer ${TOKEN}`) return json(401, { message: 'Unauthorized' });
  if (url.pathname === '/crm/v2/panel') {
    return json(200, { items: [{ id: 'painel-sup', title: 'Ingline - Suporte', key: 'IS', type: 'MANAGEMENT' }, { id: PAINEL, title: 'Ingline - Comercial', key: 'IC', type: 'SALE' }], hasMorePages: false });
  }
  if (url.pathname === `/crm/v1/panel/${PAINEL}`) return json(200, { id: PAINEL, title: 'Ingline - Comercial', key: 'IC', type: 'SALE', steps: ETAPAS, tags: TAGS });
  if (url.pathname === `/crm/v1/panel/${PAINEL}/custom-fields`) return json(200, CAMPOS);
  if (url.pathname === '/crm/v2/panel/card') {
    // a lista não traz o histórico (no Helena, os logs vêm só no card) nem a Conclusão: sem o card, os ganhos
    // caíram no dia da última mudança (o primeiro uso no ar, 22/10)
    const detalhes = url.searchParams.getAll('IncludeDetails');
    if (listaRecusaOMotivo && detalhes.includes('LostReason')) {
      return json(500, { customData: null, httpStatusCode: 'INTERNALSERVERERROR', error: true, key: 'FORM_ERROR', text: "The value 'LostReason' is not valid." });
    }
    const lista = cards.filter((c) => c.panelId === url.searchParams.get('PanelId'))
      .map(({ logs: _, resultChangedAt: __, resultDescription: motivo, ...c }) => ({ ...c, ...(detalhes.includes('LostReason') ? { lostReason: motivo ? { id: `m-${c.id}`, name: motivo } : null } : {}) }));
    return json(200, { pageNumber: 1, pageSize: 100, items: lista, totalItems: lista.length, hasMorePages: false });
  }
  const m = /^\/crm\/v1\/panel\/card\/([^/]+)$/.exec(url.pathname);
  if (m) {
    // os detalhes, um por parâmetro (o nome do parâmetro sem caixa, como no ASP.NET); o %2C chega como vírgula
    const detalhes = [...url.searchParams].filter(([k]) => k.toLowerCase() === 'includedetails').map(([, v]) => v);
    pedidosDeHistorico.push(detalhes);
    const conhecidos = comoAChaveDoAr ? DETALHES_DA_API_PUBLICA : DETALHES_DO_CARD_NO_HELENA;
    const recusado = detalhes.find((d) => !conhecidos.has(d) || detalhesRecusados.has(d));
    if (recusado !== undefined) {
      return json(500, { customData: null, httpStatusCode: 'INTERNALSERVERERROR', error: true, key: 'FORM_ERROR', text: `The value '${recusado}' is not valid.` });
    }
    if (historicoRecusado) return json(403, { message: 'Forbidden' });
    const c = cards.find((x) => x.id === m[1]);
    if (!c) return json(404, { message: 'card' });
    const { customFields: _, ...semCampos } = c;
    if (comoAChaveDoAr) {
      // a chave do ar: o card sem a Conclusão, sem o motivo e sem o histórico
      const { logs: __, resultChangedAt: ___, resultDescription: ____, ...publico } = semCampos;
      return json(200, publico);
    }
    // a Conclusão vem sempre no card; o motivo, com o detalhe ResultDescription; o histórico, com o Logs
    return json(200, {
      ...semCampos, resultDescription: detalhes.includes('ResultDescription') ? c.resultDescription : null, customFieldValues: {},
      notes: [{ id: 'n1', text: 'uma anotação (fica no Helena)' }], logs: detalhes.includes('Logs') ? c.logs.map((l: any) => ({ ...l, cardId: c.id })) : null,
    });
  }
  // a lista de usuários da conta: esta chave não pode ler (fica o que os cards dizem)
  if (url.pathname === '/core/v1/agent') return json(403, { message: 'Forbidden' });
  json(404, { message: 'não achei' });
});

// ---------- o Gestor ----------

let app: App;
let s: Session;
let camila: Session;
const ids = { luan: '', camila: '', hotel: '' };

async function pessoa(nome: string, email: string, papel: string) {
  const papeis = (await s.get('/admin/roles')).json();
  const r = await s.post('/admin/users', { name: nome, email, password: 'SenhaDeTeste!123', roleId: papeis.find((x: any) => x.key === papel).id });
  expect(r.statusCode, r.body).toBe(201);
  const sessao = new Session(app);
  await sessao.login(email, 'SenhaDeTeste!123');
  return { id: r.json().id as string, sessao };
}
async function ler(painelId = PAINEL) {
  const r = await s.post('/comercial/helena/leituras', { painelId });
  expect(r.statusCode, r.body).toBe(202);
  return esperarLeitura(r.json().id);
}
async function ficha(ref: string) {
  const r = await s.get(`/atendimento/chamados/${encodeURIComponent(ref)}`);
  expect(r.statusCode, r.body).toBe(200);
  return r.json();
}
const textos = (f: any) => (f.historico as any[]).map((e) => textoDoEvento(e.tipo, e.dados).replace(/\u00a0/g, ' '));
/** O nome da etapa em que a negociação está (o cartão traz o id). */
async function etapaDe(f: { painelId: string; etapaId: string }) {
  const painel: Painel = (await s.get('/atendimento/opcoes')).json().paineis.find((x: Painel) => x.id === f.painelId);
  return painel.etapas.find((e) => e.id === f.etapaId)?.nome;
}

beforeAll(async () => {
  await new Promise<void>((ok) => servidor.listen(0, '127.0.0.1', ok));
  const base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
  cards = novosCards();
  app = await makeApp();
  s = new Session(app);
  await s.login();
  ids.luan = (await pessoa('Luan França', 'luan@gestor.local', 'administrador')).id;
  const c = await pessoa('Camila Souza', 'camila@gestor.local', 'comercial');
  camila = c.sessao; ids.camila = c.id;
  ids.hotel = newId();
  await app.db.insert(clients).values({ id: ids.hotel, tradeName: 'Hotel Mar', legalName: 'Hotel Mar Hotelaria Ltda', cnpj: '99888777000166' });
  const r = await s.put('/settings/linechat', { ativo: false, url: base, appUrl: 'https://inglinechat.com.br', painelId: '', token: TOKEN });
  expect(r.statusCode, r.body).toBe(200);
});
afterAll(async () => { await app?.close(); servidor.close(); trocarFerramentasHelena({ fetchFn: (...a) => fetch(...a) }); });

describe('trazer do Helena', () => {
  it('só quem importa e cuida dos painéis; os painéis do Helena vêm pela chave do LineChat', async () => {
    expect((await camila.get('/comercial/helena/opcoes')).statusCode).toBe(403);
    expect((await camila.post('/comercial/helena/leituras', { painelId: PAINEL })).statusCode).toBe(403);
    const o = (await s.get('/comercial/helena/opcoes')).json();
    expect(o.conectado).toBe(true);
    // os de vendas primeiro
    expect(o.helena).toEqual([
      { id: PAINEL, nome: 'Ingline - Comercial', sigla: 'IC', vendas: true },
      { id: 'painel-sup', nome: 'Ingline - Suporte', sigla: 'IS', vendas: false },
    ]);
    expect(o.destinos).toEqual([]);
  });

  it('a leitura conta os cards e traz o histórico; a prévia não grava nada', async () => {
    const l = await ler();
    expect(l).toMatchObject({ estado: 'pronta', lidos: 5, total: 5, painelNome: 'Ingline - Comercial', erro: null });
    // o card pedido com um detalhe por parâmetro (2.1): o histórico e o motivo, num pedido só por card
    expect(pedidosDeHistorico[0]).toEqual(['Logs', 'ResultDescription']);
    expect(pedidosDeHistorico).toHaveLength(5);
    const r = await s.get(`/comercial/helena/leituras/${l.id}/previa`);
    expect(r.statusCode, r.body).toBe(200);
    const p: PreviaDoHelena = r.json();
    expect(p.destino).toEqual({ id: null, nome: 'Comercial', sigla: 'IC', novo: true });
    expect(p.negociacoes).toEqual({ total: 4, novas: 4, atualizadas: 0, arquivadasFora: 1, naLixeira: 0 });
    expect(p.numeros).toEqual({ emAndamento: { qtd: 1, valor: 145_000 }, ganhas: { qtd: 2, valor: 289_000 }, perdidas: { qtd: 1 } });
    expect(p.etapas.ordem).toEqual(['StandBy', 'Lead Novo', 'Aguardando Envio Proposta', 'Cliente na base', 'Ganho', 'Perdido']);
    expect(p.campos.cria).toEqual([{ nome: 'Licenças WhatsApp', tipo: 'numero' }]);
    expect(p.pessoas.find((x) => x.nome === 'Luan França')).toMatchObject({ pessoa: 'Luan França', como: 'nome', negociacoes: 5 - 1 });
    expect(p.erro).toBeNull();
    // nada foi gravado
    expect(await app.db.select().from(ticketPanels).where(eq(ticketPanels.kind, 'vendas'))).toHaveLength(0);
  });

  it('o Trazer cria o painel de Vendas com as etapas do Helena e cada negociação com o histórico', async () => {
    const l = await ler();
    const r = await s.post(`/comercial/helena/leituras/${l.id}/trazer`, { destino: null });
    expect(r.statusCode, r.body).toBe(200);
    const feito = r.json();
    expect(feito.resumo).toBe('Trouxe do Helena o painel Ingline - Comercial para o painel novo Comercial (IC): 4 negociações (4 novas)');
    const com: Painel = (await s.get('/atendimento/opcoes')).json().paineis.find((x: Painel) => x.id === feito.painelId);
    expect(com).toMatchObject({ nome: 'Comercial', sigla: 'IC', tipo: 'vendas' });
    expect(com.etapas.map((e) => `${e.nome}:${e.tipo}${e.resultado ? `:${e.resultado}` : ''}`)).toEqual([
      'StandBy:andamento', 'Lead Novo:entrada', 'Aguardando Envio Proposta:andamento', 'Cliente na base:andamento', 'Ganho:fechado:ganho', 'Perdido:fechado:perdido',
    ]);
    expect(com.ajustes.motivosDePerda).toContain('Perfil fora do público-alvo');
    const campos = ((await s.get('/atendimento/opcoes')).json().campos as CampoPersonalizado[]).filter((c) => c.painelId === com.id);
    expect(campos.map((c) => c.nome)).toEqual(['CNPJ', 'Contatos principais', 'Origem de lead', 'Indicação', 'Licenças WhatsApp']);
    expect(campos.find((c) => c.nome === 'Origem de lead')!.opcoes.map((o) => o.nome)).toContain('Feira');

    // o número do Helena fica: IC-34 continua IC-34
    const f = await ficha('IC-34');
    expect(f).toMatchObject({
      codigo: 'IC-34', titulo: 'Padaria Estrela - LinePBX', resultado: 'ganho', valor: 99_000, ativacao: 50_000, origem: 'helena',
      empresa: 'Padaria Estrela', responsavel: { nome: 'Luan França' }, etiquetas: ['P/R Ingline'],
    });
    expect(await etapaDe(f)).toBe('Ganho');
    expect(f.produtos.map((x: any) => x.nome)).toEqual(['LinePBX']);
    expect(f.fechadoEm.slice(0, 10)).toBe('2026-10-02');
    expect(f.observadores.map((o: any) => o.nome)).toEqual(['Camila Souza']);
    expect(f.campos[campos.find((c) => c.nome === 'Licenças WhatsApp')!.id]).toBe(3);
    expect(f.campos[campos.find((c) => c.nome === 'CNPJ')!.id]).toBe('11.222.333/0001-81');
    // a Indicação do Helena cai na lista da Indicação (a que se inclui na hora, 2.0.3), que ganha a opção de lá
    const indicacao = campos.find((c) => c.nome === 'Indicação')!;
    expect(indicacao).toMatchObject({ tipo: 'lista', incluirNaHora: true });
    const parceiro = indicacao.opcoes.find((o) => o.nome === 'Parceiro Contábil');
    expect(parceiro).toBeTruthy();
    expect(f.campos[indicacao.id]).toBe(parceiro!.id);
    // a etiqueta entra nas do painel que recebe (cada painel tem as suas, 2.0.3), com a cor de lá
    const etiquetas = (await s.get('/atendimento/opcoes')).json().etiquetas as Array<{ nome: string; painelId: string; cor: string }>;
    expect(etiquetas.filter((e) => e.nome === 'P/R Ingline')).toEqual([expect.objectContaining({ painelId: com.id, cor: 'ok' })]);
    expect(textos(f)).toEqual([
      'criou a negociação (Trazida do Helena, era IC-34) em Lead Novo',
      'mudou Mensalidade para "R$ 990,00"',
      'moveu de Lead Novo para Aguardando Envio Proposta',
      'moveu de Aguardando Envio Proposta para Cliente na base',
      'marcou como ganho (R$ 990,00/mês), estava em Cliente na base',
      'no Helena: A etiqueta P/R Ingline foi adicionada',
    ]);
    // quem fez: a pessoa do Gestor com o mesmo nome
    expect(f.historico[1].por?.nome).toBe('Luan França');
    // as anotações do Helena ficam lá
    expect(f.anotacoesLista).toEqual([]);

    // o card duplicado: sem o "(Cópia)", ganho no dia da Conclusão
    const loja = await ficha('IC-12');
    expect(loja).toMatchObject({ titulo: 'Loja Nova', resultado: 'ganho', valor: 190_000 });
    expect(loja.fechadoEm.slice(0, 10)).toBe('2026-02-15');
    // o perdido, com o motivo do Helena e o cliente do cadastro pelo nome
    const hotel = await ficha('IC-5');
    expect(hotel).toMatchObject({ resultado: 'perdido', motivoPerda: 'Perfil fora do público-alvo', cliente: { id: ids.hotel } });
    const sol = await ficha('IC-60');
    expect(sol).toMatchObject({ resultado: null, valor: 145_000, fechadoEm: null });
    expect(await etapaDe(sol)).toBe('Aguardando Envio Proposta');
    // o arquivado fica de fora; a numeração continua depois do maior
    expect((await s.get('/atendimento/chamados/IC-61')).statusCode).toBe(404);
    const [p] = await app.db.select({ n: ticketPanels.nextNumber }).from(ticketPanels).where(eq(ticketPanels.id, com.id));
    expect(p!.n).toBe(61);

    // a auditoria
    const aud = (await s.get(`/admin/audit?entityId=${com.id}&pageSize=10`)).json().items as Array<{ action: string; summary: string }>;
    expect(aud).toEqual([expect.objectContaining({ action: 'import', summary: feito.resumo })]);
  });

  it('o relatório do Gestor dá o mesmo que o do Helena (os ganhos pela Conclusão)', async () => {
    const com = (await s.get('/comercial/helena/opcoes')).json().destinos[0];
    const r = await s.get(`/atendimento/vendas?painel=${com.id}&de=2026-09-21&ate=2026-10-21`);
    expect(r.statusCode, r.body).toBe(200);
    const rel: RelatorioDeVendas = r.json();
    expect(rel.numeros.ganhos).toMatchObject({ qtd: 1, valor: 99_000 });
    expect(rel.numeros.ativacoes).toMatchObject({ qtd: 1, valor: 50_000 });
    expect(rel.meses.find((m) => m.mes === '2026-02')).toMatchObject({ qtd: 1, ganho: 190_000 });
    // o funil das que entraram no período: a IC-34 passou pela Aguardando Envio Proposta
    const set = (await s.get(`/atendimento/vendas?painel=${com.id}&de=2026-09-01&ate=2026-10-21`)).json() as RelatorioDeVendas;
    expect(set.funil.find((x) => x.nome === 'Aguardando Envio Proposta')!.chegaram).toHaveLength(2);
  });

  it('de novo: atualiza o que já veio, sem duplicar, refaz o histórico do Helena e guarda o que a equipe fez', async () => {
    const com = (await s.get('/comercial/helena/opcoes')).json().destinos[0];
    const sol = await ficha('IC-60');
    // a equipe anda com a negociação no Gestor
    const etapas: Painel['etapas'] = (await s.get('/atendimento/opcoes')).json().paineis.find((x: Painel) => x.id === com.id).etapas;
    const mov = await s.post(`/atendimento/chamados/${sol.id}/mover`, { etapaId: etapas.find((e) => e.nome === 'Cliente na base')!.id });
    expect(mov.statusCode, mov.body).toBe(200);
    // e, no Helena, ela foi ganha; e entrou um card novo
    const c60 = cards.find((c) => c.id === 'card-60')!;
    Object.assign(c60, { status: 'WON', stepTitle: 'Cliente na base', monetaryAmount: 1500, resultChangedAt: '2026-10-20T15:00:00Z', updatedAt: '2026-10-20T15:00:00Z' });
    c60.logs.push(log('l12', '2026-10-15T12:00:00Z', 'Item movido de Aguardando Envio Proposta para Cliente na base'), log('l13', '2026-10-20T15:00:00Z', 'Valor atribuído alterado de R$ 1.450,00 para R$ 1.500,00'), log('l14', '2026-10-20T15:00:01Z', 'Item marcado como "Ganho"'));
    cards.push({ ...cards[3]!, id: 'card-70', number: 70, key: 'IC-70', title: 'Mercado Bom - LinePBX', status: 'OPEN', stepTitle: 'Lead Novo', monetaryAmount: null, customFields: {}, logs: [log('l15', '2026-10-21T12:00:00Z', 'Item criado por Luan França em Lead Novo')] });

    const l = await ler();
    const p: PreviaDoHelena = (await s.get(`/comercial/helena/leituras/${l.id}/previa?destino=${com.id}`)).json();
    expect(p.negociacoes).toMatchObject({ total: 5, novas: 1, atualizadas: 4 });
    expect(p.mexidasNoGestor).toBe(1);
    expect(p.etapas.entram).toEqual([]);
    const r = await s.post(`/comercial/helena/leituras/${l.id}/trazer`, { destino: com.id });
    expect(r.statusCode, r.body).toBe(200);
    expect(r.json().resumo).toBe('Trouxe do Helena o painel Ingline - Comercial para o painel Comercial (IC): 5 negociações (1 nova, 4 atualizadas)');

    // sem duplicar: uma negociação por card
    const todas = await app.db.select({ code: tickets.code, ref: tickets.externalRef }).from(tickets).where(like(tickets.externalRef, 'helena:%'));
    expect(todas.map((t) => t.code).sort()).toEqual(['IC-12', 'IC-34', 'IC-5', 'IC-60', 'IC-70']);
    const f = await ficha('IC-60');
    expect(f).toMatchObject({ id: sol.id, resultado: 'ganho', valor: 150_000 });
    expect(f.fechadoEm.slice(0, 10)).toBe('2026-10-20');
    const t = textos(f);
    // o histórico do Helena, refeito, e o movimento que a equipe fez no Gestor (uma vez só)
    expect(t.filter((x) => x.startsWith('criou a negociação'))).toHaveLength(1);
    expect(t).toContain('marcou como ganho (R$ 1.500,00/mês), estava em Cliente na base');
    expect(t.filter((x) => x === 'moveu de Aguardando Envio Proposta para Cliente na base')).toHaveLength(2);
    const doGestor = await app.db.select().from(ticketEvents).where(and(eq(ticketEvents.ticketId, sol.id), eq(ticketEvents.userId, (await s.get('/auth/me')).json().id)));
    expect(doGestor.length).toBeGreaterThan(0);
    // a nova entra com o número de lá
    const nova = await ficha('IC-70');
    expect(nova.resultado).toBeNull();
    expect(await etapaDe(nova)).toBe('Lead Novo');
  });

  it('sem o histórico (a chave não lê o card): a leitura acaba, a prévia diz por quê e a negociação nasce na etapa de agora', async () => {
    historicoRecusado = true;
    pedidosDeHistorico.length = 0;
    try {
      const l = await ler();
      expect(l).toMatchObject({ estado: 'pronta', lidos: 6, total: 6 });
      // os cinco primeiros não vieram: não adianta pedir o sexto
      expect(pedidosDeHistorico).toHaveLength(5);
      const com = (await s.get('/comercial/helena/opcoes')).json().destinos[0];
      const p: PreviaDoHelena = (await s.get(`/comercial/helena/leituras/${l.id}/previa?destino=${com.id}`)).json();
      expect(p.historico.semHistorico).toBe(5);
      expect(p.avisos[0]).toContain('O Helena não devolveu o histórico de 6 cards: O LineChat recusou o token (403)');
      // sem o card, sem a Conclusão: as ganhas e as perdidas acabam no dia da última mudança, e a prévia avisa
      expect(p.historico.semConclusao).toBe(4);
      expect(p.avisos).toContain('4 negociações ganhas ou perdidas vieram sem a Conclusão do Helena (a chave de API do LineChat não lê essa data): acabam no dia em que foram marcadas (ou no da última mudança do card), e os ganhos mês a mês não batem com o relatório de lá. Use a planilha do Helena: no painel, em Lista, o botão Exportar.');
    } finally { historicoRecusado = false; }
  });

  it('a lista dos detalhes numa linha só (o jeito do 2.0.4) leva o 500 que se viu no ar', async () => {
    // o pedido que o 2.0.4 fazia, direto no Helena de mentira
    const base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
    const r = await fetch(`${base}/crm/v1/panel/card/card-34?IncludeDetails=Logs,Key,ResultDescription,Step`, { headers: { Authorization: `Bearer ${TOKEN}` } });
    expect(r.status).toBe(500);
    expect((await r.json()).text).toBe("The value 'Logs,Key,ResultDescription,Step' is not valid.");
  });

  it('o detalhe que o LineChat não conhece sai do pedido, e o resto vem (o histórico e a Conclusão)', async () => {
    detalhesRecusados = new Set(['ResultDescription']);
    pedidosDeHistorico.length = 0;
    try {
      const l = await ler();
      expect(l).toMatchObject({ estado: 'pronta', lidos: 6, total: 6 });
      // o primeiro card acha os detalhes que servem; os outros já vão com eles
      expect(pedidosDeHistorico.slice(0, 3)).toEqual([['Logs', 'ResultDescription'], ['Logs'], ['Logs']]);
      expect(pedidosDeHistorico).toHaveLength(7);
      const com = (await s.get('/comercial/helena/opcoes')).json().destinos[0];
      const p: PreviaDoHelena = (await s.get(`/comercial/helena/leituras/${l.id}/previa?destino=${com.id}`)).json();
      expect(p.avisos[0]).toBe('O LineChat recusou "ResultDescription" no pedido do card; o resto veio.');
      expect(p.historico).toMatchObject({ semHistorico: 0, semConclusao: 0 });
      // a Conclusão do card duplicado: o ganho de fevereiro fica em fevereiro
      expect(p.ganhosPorMes.find((m) => m.mes === '2026-02')).toMatchObject({ qtd: 1, valor: 190_000 });
    } finally { detalhesRecusados = new Set(); }
  });

  it('sem o histórico, mas com a Conclusão: o card vai sem detalhe nenhum e os ganhos ficam no mês certo', async () => {
    detalhesRecusados = new Set(['Logs', 'ResultDescription']);
    pedidosDeHistorico.length = 0;
    try {
      const l = await ler();
      expect(l).toMatchObject({ estado: 'pronta', lidos: 6, total: 6 });
      expect(pedidosDeHistorico.slice(0, 4)).toEqual([['Logs', 'ResultDescription'], ['ResultDescription'], [], []]);
      const com = (await s.get('/comercial/helena/opcoes')).json().destinos[0];
      const p: PreviaDoHelena = (await s.get(`/comercial/helena/leituras/${l.id}/previa?destino=${com.id}`)).json();
      expect(p.avisos[0]).toBe('A chave de API do LineChat não lê o histórico dos cards (recusou "Logs", "ResultDescription"): as negociações nascem na etapa em que estão.');
      expect(p.historico).toMatchObject({ semHistorico: 5, semConclusao: 0 });
      expect(p.ganhosPorMes.find((m) => m.mes === '2026-02')).toMatchObject({ qtd: 1, valor: 190_000 });
    } finally { detalhesRecusados = new Set(); }
  });

  // ---------- 2.1.1: a chave do ar e a planilha do Helena ----------

  /** A planilha do "Exportar" do Helena, como o Google Planilhas baixa em CSV (as colunas de lá), feita dos cards de agora. */
  function planilhaDosCards(): string {
    const br = (iso: string | null) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '');
    const situacao: Record<string, string> = { WON: 'Ganho', LOST: 'Perdido', OPEN: 'Em andamento' };
    const linhas = cards.filter((c) => c.status !== 'ARCHIVED').map((c) => [
      c.key, br(c.createdAt), c.stepTitle, `"${String(c.title).replace(/"/g, '""')}"`, '', c.monetaryAmount ? `"R$ ${c.monetaryAmount},00"` : '',
      situacao[c.status] ?? '', c.status === 'WON' || c.status === 'LOST' ? br(c.resultChangedAt) : '', c.status === 'LOST' ? (c.resultDescription ?? '') : '',
    ].join(','));
    return ['Código,Data criação,Fase,Título,Descrição,Valor atribuído,Situação,Conclusão,Motivo da perda', ...linhas].join('\r\n');
  }
  const ABERTA = '1PlanilhaAbertaDoHelena_abcdefghijklmno';
  const FECHADA = '1PlanilhaFechadaDoHelena_abcdefghijklmn';
  const pedidosAoGoogle: string[] = [];
  /** O Google de mentira: o CSV da planilha aberta vem por um desvio para os arquivos do Google; a fechada manda entrar. */
  function usarGoogleDeMentira() {
    trocarFerramentasHelena({
      fetchFn: (async (entrada: any, init?: any) => {
        const url = String(entrada);
        if (!/^https:\/\/([a-z0-9-]+\.)*(google|googleusercontent)\.com\//.test(url)) return fetch(entrada, init);
        pedidosAoGoogle.push(url);
        if (url.startsWith(`https://docs.google.com/spreadsheets/d/${ABERTA}/export?format=csv`)) {
          return new Response(null, { status: 307, headers: { location: 'https://doc-0s-sheets.googleusercontent.com/export/abc?dat=1' } });
        }
        if (url.startsWith('https://doc-0s-sheets.googleusercontent.com/export/abc')) {
          return new Response(planilhaDosCards(), { status: 200, headers: { 'content-type': 'text/csv; charset=utf-8' } });
        }
        if (url.startsWith(`https://docs.google.com/spreadsheets/d/${FECHADA}/`)) {
          return new Response(null, { status: 302, headers: { location: 'https://accounts.google.com/ServiceLogin?continue=x' } });
        }
        return new Response('não achei', { status: 404 });
      }) as typeof fetch,
    });
  }

  it('2.1.1: como a chave do ar, o card vem sem o histórico e sem a Conclusão; a prévia diz para usar a planilha', async () => {
    comoAChaveDoAr = true;
    try {
      const l = await ler();
      expect(l).toMatchObject({ estado: 'pronta', planilha: null });
      const com = (await s.get('/comercial/helena/opcoes')).json().destinos[0];
      const p: PreviaDoHelena = (await s.get(`/comercial/helena/leituras/${l.id}/previa?destino=${com.id}`)).json();
      expect(p.avisos[0]).toBe('A chave de API do LineChat não lê o histórico dos cards (recusou "Logs", "ResultDescription"): as negociações nascem na etapa em que estão.');
      expect(p.historico).toMatchObject({ semHistorico: 5, semConclusao: 4 });
      expect(p.planilha).toBeNull();
      // o ganho de fevereiro caiu no mês da última mudança do card (julho): o que se viu no ar
      expect(p.ganhosPorMes.find((m) => m.mes === '2026-02')!.valor).toBe(0);
      expect(p.ganhosPorMes.find((m) => m.mes === '2026-07')).toMatchObject({ qtd: 1, valor: 190_000 });
      expect(p.avisos.some((a) => a.includes('Use a planilha do Helena'))).toBe(true);
    } finally { comoAChaveDoAr = false; }
  });

  it('2.1.1: o link da planilha do Helena completa a leitura, e os ganhos ficam no mês da Conclusão', async () => {
    comoAChaveDoAr = true;
    usarGoogleDeMentira();
    try {
      const l = await ler();
      const com = (await s.get('/comercial/helena/opcoes')).json().destinos[0];
      const r = await s.post(`/comercial/helena/leituras/${l.id}/planilha`, { link: `https://docs.google.com/spreadsheets/d/${ABERTA}/edit#gid=0` });
      expect(r.statusCode, r.body).toBe(200);
      expect(r.json().planilha).toEqual({ origem: 'link', nome: null, linhas: 5, casadas: 5, conclusoes: 4, semConclusao: 0, foraDaLeitura: 0 });
      // o servidor monta o endereço do CSV e segue o desvio só para o Google
      expect(pedidosAoGoogle.slice(-2)).toEqual([`https://docs.google.com/spreadsheets/d/${ABERTA}/export?format=csv&gid=0`, 'https://doc-0s-sheets.googleusercontent.com/export/abc?dat=1']);
      const p: PreviaDoHelena = (await s.get(`/comercial/helena/leituras/${l.id}/previa?destino=${com.id}`)).json();
      expect(p.historico.semConclusao).toBe(0);
      expect(p.planilha).toMatchObject({ origem: 'link', conclusoes: 4 });
      expect(p.ganhosPorMes.find((m) => m.mes === '2026-02')).toMatchObject({ qtd: 1, valor: 190_000 });
      expect(p.ganhosPorMes.find((m) => m.mes === '2026-07')!.valor).toBe(0);
      expect(p.avisos).toContain('A Conclusão de 4 negociações veio da planilha do Helena, com 5 linhas (5 de cards lidos).');
      // a leitura que a tela pergunta também diz qual planilha
      expect((await s.get(`/comercial/helena/leituras/${l.id}`)).json().planilha).toMatchObject({ origem: 'link', linhas: 5 });

      // o Trazer grava o dia da Conclusão e o motivo da perda (que veio na lista, pelo LostReason)
      const t = await s.post(`/comercial/helena/leituras/${l.id}/trazer`, { destino: com.id });
      expect(t.statusCode, t.body).toBe(200);
      expect((await ficha('IC-12')).fechadoEm.slice(0, 10)).toBe('2026-02-15');
      expect(await ficha('IC-5')).toMatchObject({ resultado: 'perdido', motivoPerda: 'Perfil fora do público-alvo' });
      expect((await ficha('IC-5')).fechadoEm.slice(0, 10)).toBe('2026-06-18');
      // o relatório do Comercial: o ganho de fevereiro em fevereiro, como no Helena
      const rel: RelatorioDeVendas = (await s.get(`/atendimento/vendas?painel=${com.id}&de=2026-09-21&ate=2026-10-21`)).json();
      expect(rel.meses.find((m) => m.mes === '2026-02')).toMatchObject({ qtd: 1, ganho: 190_000 });
      expect(rel.meses.find((m) => m.mes === '2026-07')).toMatchObject({ qtd: 0 });
    } finally { comoAChaveDoAr = false; }
  });

  it('2.1.1: o arquivo .csv também serve; o link que não é do Google, a planilha fechada e a de outro painel são recusados', async () => {
    comoAChaveDoAr = true;
    usarGoogleDeMentira();
    try {
      const l = await ler();
      const url = `/comercial/helena/leituras/${l.id}/planilha`;
      const r = await s.post(url, { csv: planilhaDosCards().replace(/,/g, ';'), nome: 'Exportação do Painel - Ingline - Comercial.csv' });
      expect(r.statusCode, r.body).toBe(200);
      expect(r.json().planilha).toMatchObject({ origem: 'arquivo', nome: 'Exportação do Painel - Ingline - Comercial.csv', conclusoes: 4 });
      const erro = async (corpo: object) => { const x = await s.post(url, corpo); expect(x.statusCode, x.body).toBe(400); return x.json().error as string; };
      expect(await erro({ link: 'https://exemplo.com/planilha.csv' })).toContain('não é de uma planilha do Google Planilhas');
      expect(await erro({ link: `https://docs.google.com/spreadsheets/d/${FECHADA}/edit` })).toContain('não está aberta para quem tem o link');
      expect(await erro({})).toBe('Mande o link da planilha do Helena ou o arquivo .csv dela (um dos dois).');
      expect(await erro({ link: `https://docs.google.com/spreadsheets/d/${ABERTA}/edit`, csv: 'Código,Conclusão' })).toBe('Mande o link da planilha do Helena ou o arquivo .csv dela (um dos dois).');
      expect(await erro({ csv: 'Código,Situação,Conclusão\nXX-1,Ganho,01/01/2026' })).toBe('Nenhuma linha da planilha é de um card do painel Ingline - Comercial (o código, como IC-34). É a planilha desse painel?');
      expect(await erro({ csv: 'Título,Valor\nA,1' })).toContain('não tem as colunas Código e Conclusão');
      // a planilha recusada não estraga a que valia
      expect((await s.get(`/comercial/helena/leituras/${l.id}`)).json().planilha).toMatchObject({ origem: 'arquivo', conclusoes: 4 });
      // só quem importa e cuida dos painéis
      expect((await camila.post(url, { csv: planilhaDosCards() })).statusCode).toBe(403);
    } finally { comoAChaveDoAr = false; }
  });

  it('2.1.1: a lista que não conhece o LostReason é lida de novo sem ele, e o motivo sai da planilha', async () => {
    comoAChaveDoAr = true;
    listaRecusaOMotivo = true;
    try {
      const l = await ler();
      expect(l.estado).toBe('pronta');
      const com = (await s.get('/comercial/helena/opcoes')).json().destinos[0];
      const sem: PreviaDoHelena = (await s.get(`/comercial/helena/leituras/${l.id}/previa?destino=${com.id}`)).json();
      expect(sem.erro).toBeNull();
      const r = await s.post(`/comercial/helena/leituras/${l.id}/planilha`, { csv: planilhaDosCards(), nome: 'helena.csv' });
      expect(r.statusCode, r.body).toBe(200);
      const t = await s.post(`/comercial/helena/leituras/${l.id}/trazer`, { destino: com.id });
      expect(t.statusCode, t.body).toBe(200);
      expect(await ficha('IC-5')).toMatchObject({ motivoPerda: 'Perfil fora do público-alvo' });
    } finally { comoAChaveDoAr = false; listaRecusaOMotivo = false; }
  });

  it('a leitura que não existe mais pede para ler de novo; sem a chave, a tela diz o porquê', async () => {
    expect((await s.get('/comercial/helena/leituras/nao-existe')).statusCode).toBe(410);
    const r = await s.put('/settings/linechat', { ativo: false, url: 'http://127.0.0.1:1', appUrl: 'https://inglinechat.com.br', painelId: '' });
    expect(r.statusCode, r.body).toBe(200);
    const o = (await s.get('/comercial/helena/opcoes')).json();
    expect(o).toMatchObject({ conectado: false, helena: [] });
    expect(o.erro).toContain('Não consegui falar com o LineChat');
    const l = await ler();
    expect(l.estado).toBe('erro');
    expect(l.erro).toContain('Não consegui falar com o LineChat');
  });
});
