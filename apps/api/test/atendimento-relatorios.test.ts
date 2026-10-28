/**
 * Patch 2.1 — os RELATÓRIOS DOS PAINÉIS DE CHAMADOS (decisão 0055): o módulo novo de relatórios, sobre os
 * chamados do Gestor (os do Helena ficam no Legado). As contas estão testadas em
 * `packages/shared/src/atendimento-relatorios.test.ts`; aqui fica o que é do servidor, com o banco de verdade:
 *  - a base montada do banco: a trajetória pelas etapas e o motivo da subida (dos eventos), o protocolo na
 *    operadora, o tempo lançado, o "repete", o campo de lista e o tamanho do cliente no Gestor
 *  - quem vê: só quem vê o painel; o painel de Vendas tem o relatório dele
 *  - a arrumação de cada painel (a ordem, os escondidos, os favoritos e o campo da falha): quem cuida dos
 *    chamados arruma para a equipe toda, e vai para a auditoria
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { circuits, dids, newId, ticketFields, ticketPanels, ticketSubjects } from '@gestor/db';
import { CATALOGO_DOS_RELATORIOS, type RelatoriosDoPainel } from '@gestor/shared';
import { makeApp, Session, type App } from './helpers.js';
import { esperarSegundoPlano } from '../src/services/atendimento/avisos.js';
import { trocarFerramentasWhatsApp } from '../src/services/atendimento/whatsapp.js';
import { trocarFerramentasWebhook } from '../src/services/atendimento/webhooks.js';

let app: App;
let s: Session;         // a administração: trabalha e cuida dos chamados
let operador: Session;  // Marina: trabalha (não cuida)
let soVendas: Session;  // Camila: só as vendas (sem ver os chamados)
let aurora = '';
let ramal = '';
let configuracao = '';
let operadora = '';
const campo = { id: '', ingline: 'opc-ingline', cliente: 'opc-cliente' };
const SUP = 'painel-suporte';
let adminId = '';
const DEV = 'painel-desenvolvimento';
const E = { n1: 'etapa-suporte-n1', n2: 'etapa-suporte-n2', resolvido: 'etapa-suporte-resolvido' };
const t: Record<'um' | 'dois' | 'tres', { id: string; codigo: string }> = { um: { id: '', codigo: '' }, dois: { id: '', codigo: '' }, tres: { id: '', codigo: '' } };

async function abrir(d: Record<string, unknown>) {
  // com responsável: sair do Novo pede um (2.2)
  const r = await s.post('/atendimento/chamados', { painelId: SUP, titulo: 'Ramal sem configuração', relato: 'O ramal novo não registra', clienteId: aurora, assuntoId: configuracao, responsavelId: adminId, ...d });
  expect(r.statusCode, r.body).toBe(201);
  return r.json() as { id: string; codigo: string };
}
const ok = async <T extends { statusCode: number; body: string }>(r: Promise<T>) => { const x = await r; expect(x.statusCode, x.body).toBe(200); return x; };
const relatorios = async (qs = '', quem: Session = s) => {
  const r = await quem.get(`/atendimento/relatorios?painel=SUP${qs}`);
  expect(r.statusCode, r.body).toBe(200);
  return r.json() as RelatoriosDoPainel;
};

beforeAll(async () => {
  app = await makeApp();
  s = new Session(app);
  adminId = (await s.login()).id;
  const papeis = (await s.get('/admin/roles')).json();
  const idDe = (key: string) => papeis.find((r: any) => r.key === key).id;
  await s.post('/admin/users', { name: 'Marina Costa', email: 'marina@gestor.local', password: 'SenhaDeTeste!123', roleId: idDe('operador') });
  const papelDeVendas = await s.post('/admin/roles', { name: 'Só vendas', description: 'só o Comercial', permissions: ['records.read', 'sales.read'] });
  expect(papelDeVendas.statusCode, papelDeVendas.body).toBe(201);
  await s.post('/admin/users', { name: 'Camila Souza', email: 'camila@gestor.local', password: 'SenhaDeTeste!123', roleId: papelDeVendas.json().id });
  operador = new Session(app); await operador.login('marina@gestor.local', 'SenhaDeTeste!123');
  soVendas = new Session(app); await soVendas.login('camila@gestor.local', 'SenhaDeTeste!123');

  aurora = (await s.post('/clients', { tradeName: 'Clínica Aurora', legalName: 'Clínica Aurora LTDA', cnpj: '11.222.333/0001-81' })).json().id;
  const linepbx = (await s.get('/admin/products')).json().find((p: any) => p.code === 'linepbx').id as string;
  const ops = (await s.get('/admin/catalogs/carriers')).json();
  operadora = ops[0].id;
  // o tamanho da Aurora no Gestor: dois DIDs
  const circuito = newId();
  await app.db.insert(circuits).values({ id: circuito, name: 'Tronco Aurora', code: 'AUR-1', carrierId: operadora, clientId: aurora } as any);
  await app.db.insert(dids).values([{ id: newId(), number: '7130340000', circuitId: circuito, clientId: aurora }, { id: newId(), number: '7130340001', circuitId: circuito, clientId: aurora }]);

  ramal = newId(); configuracao = newId();
  await app.db.insert(ticketSubjects).values([
    { id: ramal, panelId: SUP, name: 'Ramal' },
    { id: configuracao, panelId: SUP, parentId: ramal, name: 'Configuração' },
  ]);
  campo.id = newId();
  await app.db.insert(ticketFields).values({
    id: campo.id, panelId: SUP, name: 'Responsabilidade', kind: 'lista',
    options: [{ id: campo.ingline, nome: 'Ingline', ativa: true }, { id: campo.cliente, nome: 'Cliente', ativa: true }],
  });
  // os campos do sistema todos ligados (o alcance nasce desligado)
  const [p] = await app.db.select().from(ticketPanels).where(eq(ticketPanels.id, SUP));
  await app.db.update(ticketPanels).set({ settings: { ...(p!.settings as object), camposDesligados: [] } }).where(eq(ticketPanels.id, SUP));

  const recusar = (async () => { throw new Error('rede desligada nos testes'); }) as unknown as typeof fetch;
  trocarFerramentasWhatsApp({ fetchFn: recusar });
  trocarFerramentasWebhook({ fetchFn: recusar, resolver: async () => ['203.0.113.10'], esperar: async () => {} });

  // 1: resolvido no N1, completo, falha da Ingline
  t.um = await abrir({ tipo: 'Requisição', gravidade: 'nao_se_aplica', alcance: 'pessoa', produtos: [linepbx], campos: { [campo.id]: campo.ingline } });
  await ok(s.post(`/atendimento/chamados/${t.um.id}/mover`, { etapaId: E.n1 }));
  await ok(s.patch(`/atendimento/chamados/${t.um.id}`, { solucao: 'Cadastramos o ramal no PBX', causa: 'O ramal não existia' }));
  await ok(s.post(`/atendimento/chamados/${t.um.id}/mover`, { etapaId: E.resolvido }));
  // 2: subiu ao N2 com o motivo; protocolo na operadora (o prometido já passou); 45 min lançados
  t.dois = await abrir({ titulo: 'Tronco sem sinal', tipo: 'Incidente', gravidade: 'inoperancia', alcance: 'empresa', operadoras: [operadora] });
  await ok(s.post(`/atendimento/chamados/${t.dois.id}/mover`, { etapaId: E.n1 }));
  await ok(s.post(`/atendimento/chamados/${t.dois.id}/mover`, { etapaId: E.n2, motivo: 'Precisa de acesso ao servidor' }));
  const caso = await s.post(`/atendimento/chamados/${t.dois.id}/operadora`, { operadoraId: operadora, protocolo: '2026-123', prometidoPara: new Date(Date.now() - 3_600_000).toISOString() });
  expect(caso.statusCode, caso.body).toBe(200);
  await ok(s.post(`/atendimento/chamados/${t.dois.id}/tempo`, { minutos: 45, nota: 'Testes com a operadora' }));
  // 3: o mesmo assunto do 1, ligado como "repete"
  t.tres = await abrir({ titulo: 'Ramal novo de novo' });
  await ok(s.post(`/atendimento/chamados/${t.tres.id}/ligacoes`, { para: t.um.codigo, tipo: 'repete' }));
});
afterAll(async () => {
  await esperarSegundoPlano();
  await app.close();
});

describe('os relatórios do painel Suporte', () => {
  it('a base vem do banco: as etapas, a subida com o motivo, a operadora, o tempo, o repete e o tamanho do cliente', async () => {
    const r = await relatorios();
    expect(r.painel).toMatchObject({ id: SUP, sigla: 'SUP' });
    expect(r.aplicaveis).toHaveLength(CATALOGO_DOS_RELATORIOS.length);
    expect(r.noRecorte).toBe(3);
    expect(r.fila).toMatchObject({ entrou: 3, saiu: 1, filaHoje: { n: 2 } });
    expect(r.escada.degraus.map((d) => [d.nome, d.resolvem])).toEqual([['N1', 1], ['N2', 0], ['N3', 0], ['DEV', 0]]);
    expect(r.escada.motivos).toMatchObject([{ codigo: t.dois.codigo, de: 'N1', para: 'N2', motivo: 'Precisa de acesso ao servidor', quem: 'Administrador' }]);
    expect(r.empaca.etapas.find((e) => e.nome === 'N2')!.paradosAgora.ids).toEqual([t.dois.id]);
    expect(r.arvore.raiz).toMatchObject([{ nome: 'Ramal', n: 3, abertos: 2, resolvidos: 1, filhos: [{ nome: 'Configuração', n: 3 }] }]);
    expect(r.operadora.abertosAgora.ids).toEqual([t.dois.id]);
    expect(r.operadora.passouDoPrometido.ids).toEqual([t.dois.id]);
    expect(r.tempogasto).toMatchObject({ minutos: 45, lancamentos: 1, porPessoa: [{ nome: 'Administrador', minutos: 45 }] });
    expect(r.voltou.repetem.ids).toEqual([t.tres.id]);
    expect(r.voltou.linhas).toMatchObject([{ cliente: 'Clínica Aurora', assunto: 'Ramal › Configuração', n: 3, voltas: 2 }]);
    expect(r.tamanho.linhas).toMatchObject([{ nome: 'Clínica Aurora', n: 3, dids: 2, por10Dids: 15 }]);
    expect(r.falha.campo).toEqual({ id: campo.id, nome: 'Responsabilidade', automatico: true });
    expect(r.falha.porOpcao).toMatchObject([{ nome: 'Ingline', n: 1 }]);
    expect(r.preenchido.completos.ids).toEqual([t.um.id]);
    // a janela de cada número: a lista curta tem os chamados citados
    const naLista = new Set(r.chamados.map((c) => c.id));
    expect([t.um.id, t.dois.id, t.tres.id].every((id) => naLista.has(id))).toBe(true);
    expect(r.chamados.find((c) => c.id === t.dois.id)).toMatchObject({ codigo: t.dois.codigo, etapa: 'N2', cliente: 'Clínica Aurora', assunto: 'Ramal › Configuração' });
  });

  it('os filtros: o assunto leva os de baixo; o nível é até onde o chamado subiu', async () => {
    expect((await relatorios(`&assunto=${ramal}`)).noRecorte).toBe(3);
    expect((await relatorios('&nivel=2')).noRecorte).toBe(1);
    expect((await relatorios(`&campo=${campo.id}:${campo.ingline}`)).noRecorte).toBe(1);
    expect((await relatorios(`&raiox=${aurora}`)).clientes.raiox).toMatchObject({ nome: 'Clínica Aurora', chamados: { n: 3 }, dids: 2 });
  });

  it('quem vê o painel vê os relatórios; quem só vê as vendas, não; o painel de Vendas tem o relatório dele', async () => {
    await relatorios('', operador);
    expect((await soVendas.get('/atendimento/relatorios?painel=SUP')).statusCode).toBe(404);
    const com = await s.post('/atendimento/paineis', { nome: 'Comercial', sigla: 'com', cor: 'ok', tipo: 'vendas', acesso: 'todos', pessoas: [], ajustes: {} });
    expect(com.statusCode, com.body).toBe(201);
    const v = await s.get('/atendimento/relatorios?painel=COM');
    expect(v.statusCode).toBe(400);
    expect(v.json().error).toContain('é de vendas');
    const datas = await s.get('/atendimento/relatorios?painel=SUP&de=2026-10-22&ate=2026-10-01');
    expect(datas.statusCode).toBe(400);
  });
});

describe('a arrumação de cada painel', () => {
  it('sem nada guardado, a ordem de fábrica; o campo da falha sai dos campos de lista do painel', async () => {
    const a = (await ok(s.get('/atendimento/relatorios/arrumacao?painel=SUP'))).json();
    expect(a.ordem).toEqual(CATALOGO_DOS_RELATORIOS.map((r) => r.id));
    expect(a).toMatchObject({ ocultos: [], favoritos: [], campoDaFalha: null, atualizadoEm: null });
    expect(a.campos).toEqual([{ id: campo.id, nome: 'Responsabilidade', ativo: true }]);
  });

  it('quem cuida dos chamados arruma para a equipe toda (e vai para a auditoria); quem só trabalha, não', async () => {
    const corpo = { ordem: ['relogio', 'prazo', 'xyz'], ocultos: ['calor'], favoritos: ['relogio', 'fila'], campoDaFalha: campo.id };
    expect((await operador.put('/atendimento/relatorios/arrumacao?painel=SUP', corpo)).statusCode).toBe(403);
    const a = (await ok(s.put('/atendimento/relatorios/arrumacao?painel=SUP', corpo))).json();
    expect(a.ordem.slice(0, 2)).toEqual(['relogio', 'prazo']);
    expect(a.ordem).toHaveLength(CATALOGO_DOS_RELATORIOS.length);
    expect(a).toMatchObject({ ocultos: ['calor'], favoritos: ['relogio', 'fila'], campoDaFalha: campo.id, atualizadoPor: 'Administrador' });
    // a equipe toda vê a mesma; o outro painel continua com a de fábrica
    expect((await ok(operador.get('/atendimento/relatorios/arrumacao?painel=SUP'))).json().favoritos).toEqual(['relogio', 'fila']);
    expect((await ok(s.get(`/atendimento/relatorios/arrumacao?painel=${DEV}`))).json().favoritos).toEqual([]);
    // o campo escolhido vale no "De quem é a falha?"
    expect((await relatorios()).falha.campo).toEqual({ id: campo.id, nome: 'Responsabilidade', automatico: false });
    const auditoria = (await s.get('/admin/audit?entityId=atendimento-relatorios&pageSize=10')).json().items as Array<{ summary: string }>;
    expect(auditoria[0]!.summary).toBe('Administrador arrumou os Relatórios do painel Suporte para a equipe (24 à vista, 1 escondido, 2 favoritos; a falha sai do campo Responsabilidade)');
  });

  it('o campo da falha precisa ser um campo de lista do painel', async () => {
    const r = await s.put('/atendimento/relatorios/arrumacao?painel=SUP', { ordem: [], ocultos: [], favoritos: [], campoDaFalha: 'campo-que-nao-existe' });
    expect(r.statusCode).toBe(400);
    expect(r.json().error).toContain('não é um campo de lista deste painel');
  });
});
