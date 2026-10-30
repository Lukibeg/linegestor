/**
 * Patch 2.0 — os chamados do Gestor (decisão 0047): o núcleo do servidor.
 *
 * As contas (o que falta para cada etapa, os prazos, a busca, a ordem, o desenho das ligações) estão
 * testadas em `packages/shared/src/atendimento.test.ts`. Aqui fica o que é do servidor, com o banco
 * de verdade:
 *  - abrir: a numeração por painel, os obrigatórios ao abrir, a prioridade sugerida (e o motivo para
 *    trocá-la), o telefone que o Gestor já conhece
 *  - alterar: o histórico com os nomes legíveis, a prioridade que segue a sugestão, o checklist do assunto
 *  - mover: o que falta, escalonar e voltar de nível com motivo, a trajetória, fechar e reabrir
 *  - o pai e os filhos (em outro painel), o problema e os incidentes, as ligações, o círculo
 *  - esperar (o prazo para), assumir, as anotações com anexo, o checklist, o tempo, a operadora
 *  - avisar o cliente pelo WhatsApp, os avisos na tela, os webhooks com a assinatura
 *  - quem vê o quê (o Leitor só lê; o painel "escolhidos" não existe para quem não está nele)
 *  - o quadro, a lista (filtros, busca, ordem, CSV), o Meu dia, o cadastro do cliente e a lixeira
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import {
  circuits, clientContacts, clientUnits, clients, deviceModels, devices, dids, newId, subscriptions, ticketPanels, ticketSchedules, ticketStages,
  ticketSubjects, ticketWebhooks, tickets,
} from '@gestor/db';
import { AJUSTES_PAINEL_PADRAO, AVISOS_CHAMADOS_PADRAO, CARGOS_DE_FABRICA, ChamadoCriarSchema, diaLocal, mensagemPreenchida, paraBusca } from '@gestor/shared';
import { makeApp, Session, type App } from './helpers.js';
import * as integ from '../src/services/integracoes.js';
import { esperarSegundoPlano } from '../src/services/atendimento/avisos.js';
import { trocarFerramentasWhatsApp } from '../src/services/atendimento/whatsapp.js';
import { assinatura, trocarFerramentasWebhook } from '../src/services/atendimento/webhooks.js';
import { alterarChamado, criarChamado, fichaDoChamado, moverChamado } from '../src/services/atendimento/chamados.js';
import type { Ator } from '../src/services/atendimento/contexto.js';

let app: App;
let s: Session;         // administrador: trabalha e cuida dos chamados
let operador: Session;  // Marina: trabalha
let tecnico: Session;   // Bruno: trabalha (não cuida)
let leitor: Session;    // Rita: só lê
let adminId = '';
let marinaId = '';
let brunoId = '';
let aurora = '';
let hospital = '';
let linepbx = '';
let operadoraA = '';
let operadoraB = '';
let ramal = '';
let semAudio = '';
let assuntoDev = '';

const SUP = 'painel-suporte';
const DEV = 'painel-desenvolvimento';
const E = {
  novo: 'etapa-suporte-novo', n1: 'etapa-suporte-n1', n2: 'etapa-suporte-n2', n3: 'etapa-suporte-n3', dev: 'etapa-suporte-dev',
  resolvido: 'etapa-suporte-resolvido', fechado: 'etapa-suporte-fechado',
  devNovo: 'etapa-desenvolvimento-novo', devFechado: 'etapa-desenvolvimento-fechado',
};

// um PNG de 1×1, um PDF e um SVG (o SVG nunca abre na tela)
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const PDF = 'data:application/pdf;base64,JVBERi0xLjQK';
const SVG = 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=';

/** Abre um chamado e confere que deu certo. */
async function abrir(sess: Session, d: Record<string, unknown> = {}) {
  const r = await sess.post('/atendimento/chamados', { painelId: SUP, titulo: 'Ramal mudo', relato: 'O ramal 203 não toca', ...d });
  expect(r.statusCode, r.body).toBe(201);
  return r.json() as { id: string; codigo: string; aviso?: { ok: boolean; mensagem: string } };
}
async function ficha(sess: Session, ref: string) {
  const r = await sess.get(`/atendimento/chamados/${encodeURIComponent(ref)}`);
  expect(r.statusCode, r.body).toBe(200);
  return r.json();
}
const mover = (sess: Session, id: string, etapaId: string, extra: Record<string, unknown> = {}) => sess.post(`/atendimento/chamados/${id}/mover`, { etapaId, ...extra });
/** Preenche tudo o que o Resolvido e o Fechado do Suporte pedem. */
async function classificar(sess: Session, id: string, extra: Record<string, unknown> = {}) {
  const r = await sess.patch(`/atendimento/chamados/${id}`, {
    clienteId: aurora, relato: 'O ramal 203 não toca', assuntoId: ramal, tipo: 'Incidente', gravidade: 'inoperancia', alcance: 'pessoa',
    solucao: 'Trocamos o cabo de rede', causa: 'Cabo rompido', ...extra,
  });
  expect(r.statusCode, r.body).toBe(200);
  return r.json();
}
const eventos = (f: any, tipo: string) => (f.historico as any[]).filter((e) => e.tipo === tipo);
/**
 * Põe um responsável direto no banco (sem aviso nem histórico), para o teste que não é sobre o responsável poder tirar o
 * chamado do Novo (2.2: sair da entrada pede o responsável).
 */
const comResponsavel = (id: string, quem = adminId) => app.db.update(tickets).set({ assigneeId: quem }).where(eq(tickets.id, id));
async function lerPainel(id: string) {
  const [p] = await app.db.select().from(ticketPanels).where(eq(ticketPanels.id, id));
  return p!;
}
async function ajustarPainel(id: string, mudar: Record<string, unknown>) {
  const p = await lerPainel(id);
  await app.db.update(ticketPanels).set({ settings: { ...(p.settings as object), ...mudar } }).where(eq(ticketPanels.id, id));
}

beforeAll(async () => {
  app = await makeApp();
  s = new Session(app);
  adminId = (await s.login()).id;
  const papeis = (await s.get('/admin/roles')).json();
  const idDe = (key: string) => papeis.find((r: any) => r.key === key).id;
  marinaId = (await s.post('/admin/users', { name: 'Marina Costa', email: 'marina@gestor.local', password: 'SenhaDeTeste!123', roleId: idDe('operador') })).json().id;
  brunoId = (await s.post('/admin/users', { name: 'Bruno Técnico', email: 'bruno@gestor.local', password: 'SenhaDeTeste!123', roleId: idDe('tecnico') })).json().id;
  await s.post('/admin/users', { name: 'Rita Leitora', email: 'rita@gestor.local', password: 'SenhaDeTeste!123', roleId: idDe('leitor') });
  operador = new Session(app); await operador.login('marina@gestor.local', 'SenhaDeTeste!123');
  tecnico = new Session(app); await tecnico.login('bruno@gestor.local', 'SenhaDeTeste!123');
  leitor = new Session(app); await leitor.login('rita@gestor.local', 'SenhaDeTeste!123');

  aurora = (await s.post('/clients', { tradeName: 'Clínica Aurora', legalName: 'Clínica Aurora LTDA', cnpj: '11.222.333/0001-81' })).json().id;
  hospital = newId();
  await app.db.insert(clients).values({ id: hospital, tradeName: 'Hospital Soterô', legalName: 'Hospital Soterô S.A.', cnpj: '11444777000161' });
  linepbx = (await s.get('/admin/products')).json().find((p: any) => p.code === 'linepbx').id;
  const ops = (await s.get('/admin/catalogs/carriers')).json();
  operadoraA = ops[0].id;
  operadoraB = ops[1].id;

  // os assuntos (a árvore nasce em branco: a equipe monta)
  ramal = newId(); semAudio = newId(); assuntoDev = newId();
  await app.db.insert(ticketSubjects).values([
    { id: ramal, panelId: SUP, name: 'Ramal', checklist: ['Testar o ramal', 'Conferir o registro'] },
    { id: semAudio, panelId: SUP, parentId: ramal, name: 'Sem áudio', checklist: ['Pedir print do erro', 'Testar o ramal'] },
    { id: assuntoDev, panelId: DEV, name: 'Correção de tela' },
  ]);
  // o alcance nasce desligado ("por enquanto"); estes testes conferem a matriz gravidade × alcance, então o
  // Suporte o liga (o painel sem o alcance tem o teste dele, em "abrir")
  await ajustarPainel(SUP, { camposDesligados: [] });

  // nada sai do servidor nos testes: o WhatsApp e os webhooks só funcionam com o fetch falso de cada teste
  const recusar = (async () => { throw new Error('rede desligada nos testes'); }) as unknown as typeof fetch;
  trocarFerramentasWhatsApp({ fetchFn: recusar });
  trocarFerramentasWebhook({ fetchFn: recusar, resolver: async () => ['203.0.113.10'], esperar: async () => {} });
});
afterAll(async () => {
  await esperarSegundoPlano();
  await app.close();
});

// =====================================================================

describe('abrir', () => {
  it('numera por painel (SUP-1, SUP-2, DEV-1) e nunca repete', async () => {
    expect((await abrir(s)).codigo).toBe('SUP-1');
    expect((await abrir(operador, { titulo: 'Fila parada' })).codigo).toBe('SUP-2');
    expect((await abrir(s, { painelId: DEV, titulo: 'Erro na tela de ramais' })).codigo).toBe('DEV-1');
    const f = await ficha(s, 'sup-1');
    expect(f).toMatchObject({ codigo: 'SUP-1', numero: 1, painelId: SUP, etapaId: E.novo, situacao: 'aberto', origem: 'manual', relato: 'O ramal 203 não toca' });
    expect(f.criadoPor.id).toBe(adminId);
    expect(eventos(f, 'criado')[0].texto).toBe('abriu o chamado em Novo');
    expect((await lerPainel(SUP)).nextNumber).toBe(3);
  });

  it('quem abre na tela já está falando com o cliente: a abertura é a primeira resposta', async () => {
    const [t] = await app.db.select().from(tickets).where(eq(tickets.code, 'SUP-1'));
    expect(t!.firstResponseAt).not.toBeNull();
  });

  it('confere o que o painel pede para abrir', async () => {
    const antes = (await lerPainel(SUP)).settings;
    await ajustarPainel(SUP, { obrigatoriosAoAbrir: ['cliente', 'relato'] });
    const r = await s.post('/atendimento/chamados', { painelId: SUP, titulo: 'Sem nada' });
    expect(r.statusCode).toBe(400);
    expect(r.json()).toMatchObject({ error: 'Falta preencher: Cliente e Relato do cliente.', details: { faltam: ['cliente', 'relato'] } });
    expect((await abrir(s, { clienteId: aurora })).codigo).toMatch(/^SUP-/);
    await app.db.update(ticketPanels).set({ settings: antes }).where(eq(ticketPanels.id, SUP));
  });

  it('sem prioridade, vale a sugerida pela gravidade e pelo alcance', async () => {
    const { codigo } = await abrir(s, { gravidade: 'inoperancia', alcance: 'setor' });
    const f = await ficha(s, codigo);
    expect(f).toMatchObject({ prioridade: 'alta', prioridadeSugerida: 'alta', motivoPrioridade: null });
  });

  it('trocar a prioridade sugerida não pede mais o motivo (2.2); o que vier fica guardado', async () => {
    const r = await s.post('/atendimento/chamados', { painelId: SUP, titulo: 'Queda geral', gravidade: 'inoperancia', alcance: 'empresa', prioridade: 'alta' });
    expect(r.statusCode, r.body).toBe(201);
    expect(await ficha(s, r.json().codigo)).toMatchObject({ prioridade: 'alta', prioridadeSugerida: 'critica', motivoPrioridade: null });
    const { codigo } = await abrir(s, { titulo: 'Queda geral', gravidade: 'inoperancia', alcance: 'empresa', prioridade: 'alta', motivoPrioridade: 'só um ramal de teste caiu' });
    expect(await ficha(s, codigo)).toMatchObject({ prioridade: 'alta', prioridadeSugerida: 'critica', motivoPrioridade: 'só um ramal de teste caiu' });
    // sem gravidade e alcance não há sugestão: escolher não pede motivo
    expect((await ficha(s, (await abrir(s, { prioridade: 'baixa' })).codigo)).prioridade).toBe('baixa');
  });

  it('no painel sem o alcance (o padrão), a sugestão sai só da gravidade, e o alcance que vier fica de fora', async () => {
    expect(AJUSTES_PAINEL_PADRAO.camposDesligados).toEqual(['alcance']);
    await ajustarPainel(SUP, { camposDesligados: ['alcance'] });
    const { codigo } = await abrir(s, { gravidade: 'inoperancia', alcance: 'empresa' });
    expect(await ficha(s, codigo)).toMatchObject({ prioridade: 'alta', prioridadeSugerida: 'alta', alcance: null, motivoPrioridade: null });
    const [t] = await app.db.select().from(tickets).where(eq(tickets.code, codigo));
    expect(t!.reach).toBeNull();
    // trocar a sugerida (só pela gravidade) também não pede o motivo (2.2)
    const r = await s.post('/atendimento/chamados', { painelId: SUP, titulo: 'Queda geral', gravidade: 'inoperancia', prioridade: 'critica' });
    expect(r.statusCode, r.body).toBe(201);
    // a coluna "só a gravidade" é dos Ajustes › Prazos
    const prazos = (await s.get('/atendimento/ajustes/prazos')).json();
    expect(prazos.semAlcance.inoperancia).toBe('alta');
    expect((await s.put('/atendimento/ajustes/prazos', { ...prazos, semAlcance: { ...prazos.semAlcance, inoperancia: 'critica' } })).statusCode).toBe(200);
    expect((await ficha(s, (await abrir(s, { gravidade: 'inoperancia' })).codigo)).prioridade).toBe('critica');
    expect((await s.put('/atendimento/ajustes/prazos', prazos)).statusCode).toBe(200);
    await ajustarPainel(SUP, { camposDesligados: [] });
  });

  it('o telefone que o Gestor já conhece preenche o cliente e o nome do contato', async () => {
    await abrir(s, { clienteId: aurora, contatoNome: 'Maria', contatoTelefone: '(71) 99999-0000' });
    const { codigo } = await abrir(operador, { titulo: 'Ligou de novo', contatoTelefone: '71 99999-0000' });
    const f = await ficha(s, codigo);
    expect(f.cliente).toEqual({ id: aurora, nome: 'Clínica Aurora' });
    expect(f.contato).toEqual({ nome: 'Maria', telefone: '5571999990000', email: null });
  });

  it('recusa o que não existe: painel, assunto de outro painel, cliente, problema que não é problema', async () => {
    expect((await s.post('/atendimento/chamados', { painelId: 'nao-existe', titulo: 'X qualquer' })).statusCode).toBe(404);
    expect((await s.post('/atendimento/chamados', { painelId: SUP, titulo: 'X qualquer', assuntoId: assuntoDev })).statusCode).toBe(400);
    expect((await s.post('/atendimento/chamados', { painelId: SUP, titulo: 'X qualquer', clienteId: 'nao-existe' })).statusCode).toBe(400);
    const r = await s.post('/atendimento/chamados', { painelId: SUP, titulo: 'X qualquer', problemaId: 'SUP-1' });
    expect(r.statusCode).toBe(400);
    expect(r.json().error).toBe('SUP-1 não é um problema.');
    expect((await s.post('/atendimento/chamados', { painelId: SUP, titulo: 'X qualquer', incidentes: ['SUP-1'] })).json().error).toBe('Só um problema junta incidentes.');
    expect((await s.post('/atendimento/chamados', { painelId: SUP, titulo: 'X qualquer', tipo: 'Inexistente' })).statusCode).toBe(400);
  });

  it('o Leitor não abre nem mexe (403), mas vê', async () => {
    expect((await leitor.post('/atendimento/chamados', { painelId: SUP, titulo: 'Tentativa' })).statusCode).toBe(403);
    expect((await leitor.patch('/atendimento/chamados/SUP-1', { titulo: 'Outro título' })).statusCode).toBe(403);
    expect((await leitor.get('/atendimento/chamados/SUP-1')).statusCode).toBe(200);
    expect((await leitor.get('/atendimento/chamados?situacao=todos')).json().total).toBeGreaterThan(0);
    const op = (await leitor.get('/atendimento/opcoes')).json();
    expect(op.pode).toEqual({ trabalhar: false, cuidar: false, integrar: false });
    expect(op.paineis.map((p: any) => p.sigla)).toEqual(['SUP', 'DEV']);
  });

  it('a auditoria registra quem abriu', async () => {
    const a = (await s.get('/admin/audit?entityType=ticket&pageSize=500')).json();
    expect(a.items.map((i: any) => i.summary)).toContain('Abriu SUP-1 "Ramal mudo"');
  });

  it('a integração (chave de API) abre pelas mesmas regras, sem contar como primeira resposta', async () => {
    const n8n: Ator = { tipo: 'integracao', id: 'chave-de-teste', nome: 'n8n' };
    const r = await criarChamado(app, n8n, ChamadoCriarSchema.parse({ painelId: SUP, titulo: 'Aberto pelo n8n', relato: 'Cliente pediu pelo robô' }), { origem: 'api' });
    const f = await fichaDoChamado(app, n8n, r.id);
    expect(f).toMatchObject({ origem: 'api', criadoPor: null });
    expect(f.historico[0]).toMatchObject({ tipo: 'criado', por: null, porNome: 'n8n', texto: 'abriu o chamado (Integração (n8n)) em Novo' });
    const [t] = await app.db.select().from(tickets).where(eq(tickets.id, r.id));
    expect(t!.firstResponseAt).toBeNull();
    // e mexe pelas mesmas regras: sem o cliente, não entra no N1
    await expect(moverChamado(app, n8n, r.id, { etapaId: E.n1 })).rejects.toMatchObject({ status: 400, details: { faltam: ['cliente'] } });
    await alterarChamado(app, n8n, r.id, { clienteId: aurora });
    await moverChamado(app, n8n, r.codigo, { etapaId: E.n1 });
    const [depois] = await app.db.select().from(tickets).where(eq(tickets.id, r.id));
    expect(depois!.stageId).toBe(E.n1);
    expect(depois!.firstResponseAt).toBeNull();
  });
});

// =====================================================================

describe('alterar', () => {
  let id = '';
  beforeAll(async () => { id = (await abrir(operador, { titulo: 'Áudio picotando', gravidade: 'inoperancia', alcance: 'pessoa' })).id; });

  it('a gravidade e o alcance levam junto a prioridade que seguia a sugestão', async () => {
    expect((await ficha(s, id)).prioridade).toBe('media');
    const r = await operador.patch(`/atendimento/chamados/${id}`, { alcance: 'empresa' });
    expect(r.statusCode).toBe(200);
    const f = r.json();
    expect(f).toMatchObject({ prioridade: 'critica', prioridadeSugerida: 'critica', alcance: 'empresa' });
    expect(eventos(f, 'campo').at(-1).dados).toEqual({ campo: 'Alcance', de: 'Uma pessoa', para: 'A empresa toda' });
    expect(eventos(f, 'prioridade').at(-1).dados).toEqual({ de: 'media', para: 'critica', sugerida: 'critica', motivo: null });
  });

  it('trocar a prioridade sugerida não pede mais o motivo (2.2); a escolhida à mão não segue mais a sugestão', async () => {
    const sem = await operador.patch(`/atendimento/chamados/${id}`, { prioridade: 'baixa' });
    expect(sem.statusCode, sem.body).toBe(200);
    expect(sem.json()).toMatchObject({ prioridade: 'baixa', motivoPrioridade: null });
    expect(eventos(sem.json(), 'prioridade').at(-1).texto).toBe('mudou a prioridade de Crítica para Baixa (a sugerida era Crítica)');
    // o motivo, se vier, continua guardado
    const f = (await operador.patch(`/atendimento/chamados/${id}`, { prioridade: 'alta', motivoPrioridade: 'o cliente tem um ramal reserva' })).json();
    expect(f).toMatchObject({ prioridade: 'alta', motivoPrioridade: 'o cliente tem um ramal reserva' });
    expect(eventos(f, 'prioridade').at(-1).texto).toBe('mudou a prioridade de Baixa para Alta (a sugerida era Crítica): o cliente tem um ramal reserva');
    const g = (await operador.patch(`/atendimento/chamados/${id}`, { gravidade: 'performance' })).json();
    expect(g).toMatchObject({ prioridade: 'alta', prioridadeSugerida: 'alta', motivoPrioridade: null });
  });

  it('cada campo que mudou vira um evento com os nomes legíveis (o texto longo diz só que mudou)', async () => {
    const f = (await operador.patch(`/atendimento/chamados/${id}`, { clienteId: aurora, assuntoId: ramal, produtos: [linepbx], solucao: 'Reiniciamos o PABX' })).json();
    const textos = eventos(f, 'campo').map((e: any) => e.texto);
    expect(textos).toEqual(expect.arrayContaining(['mudou Cliente para "Clínica Aurora"', 'mudou Assunto para "Ramal"', 'mudou Produto para "LinePBX"', 'editou Solução']));
    expect(eventos(f, 'campo').find((e: any) => e.dados.campo === 'Solução').dados).toEqual({ campo: 'Solução', longo: true });
    const a = (await s.get(`/admin/audit?entityType=ticket&entityId=${id}`)).json();
    expect(a.items[0].summary).toMatch(/^Alterou SUP-\d+ "Áudio picotando": Cliente, Assunto/);
  });

  it('o assunto traz os itens do checklist dele que ainda não estão', async () => {
    const f1 = await ficha(s, id);
    expect(f1.checklist.map((i: any) => [i.texto, i.doAssunto, i.feito])).toEqual([['Testar o ramal', true, false], ['Conferir o registro', true, false]]);
    const f2 = (await operador.patch(`/atendimento/chamados/${id}`, { assuntoId: semAudio })).json();
    expect(f2.checklist.map((i: any) => i.texto)).toEqual(['Testar o ramal', 'Conferir o registro', 'Pedir print do erro']);
    expect(f2.assunto).toMatchObject({ id: semAudio, caminho: 'Ramal › Sem áudio' });
  });

  it('o assunto de outro painel é recusado; mandar o que já está não muda nada', async () => {
    expect((await operador.patch(`/atendimento/chamados/${id}`, { assuntoId: assuntoDev })).statusCode).toBe(400);
    const antes = (await ficha(s, id)).historico.length;
    const f = (await operador.patch(`/atendimento/chamados/${id}`, { assuntoId: semAudio, clienteId: aurora, titulo: 'Áudio picotando' })).json();
    expect(f.historico.length).toBe(antes);
  });

  it('os outros contatos (2.2): a lista inteira; o WhatsApp vira o do sistema; o vazio, o repetido e o principal ficam de fora; a busca acha', async () => {
    await operador.patch(`/atendimento/chamados/${id}`, { contatoNome: 'Sandra', contatoTelefone: '(75) 3604-9000' });
    const r = await operador.patch(`/atendimento/chamados/${id}`, { outrosContatos: [
      { nome: 'João do financeiro', telefone: '(71) 98888-7777' }, { nome: 'Sandra', telefone: '75 3604-9000' }, { nome: 'Outro João', telefone: '71988887777' }, { nome: 'Rita' },
    ] });
    expect(r.statusCode, r.body).toBe(200);
    const f = r.json();
    expect(f.outrosContatos).toEqual([{ nome: 'João do financeiro', telefone: '5571988887777' }, { nome: 'Rita', telefone: null }]);
    expect(eventos(f, 'campo').at(-1).texto).toBe('mudou Outros contatos para "João do financeiro (71) 98888-7777, Rita"');
    // o vazio é recusado; o telefone ruim também
    expect((await operador.patch(`/atendimento/chamados/${id}`, { outrosContatos: [{ nome: '' }] })).statusCode).toBe(400);
    expect((await operador.patch(`/atendimento/chamados/${id}`, { outrosContatos: [{ telefone: '123' }] })).statusCode).toBe(400);
    // a busca acha pelo outro contato
    const lista = (await s.get('/atendimento/chamados?situacao=todos&q=financeiro')).json();
    expect(lista.items.map((c: any) => c.id)).toContain(id);
    // mandar a mesma lista não vira histórico; a vazia tira todos
    const antes = f.historico.length;
    expect((await operador.patch(`/atendimento/chamados/${id}`, { outrosContatos: f.outrosContatos })).json().historico.length).toBe(antes);
    const sem = (await operador.patch(`/atendimento/chamados/${id}`, { outrosContatos: [] })).json();
    expect(sem.outrosContatos).toEqual([]);
    expect(eventos(sem, 'campo').at(-1).texto).toBe('mudou Outros contatos de "João do financeiro (71) 98888-7777, Rita" para (vazio)');
  });

  it('o e-mail do contato (2.3): opcional; minúsculo; vira histórico; o errado é recusado; nos outros contatos também; a busca acha', async () => {
    const r = await operador.patch(`/atendimento/chamados/${id}`, { contatoEmail: 'Sandra@Clinica.com.br' });
    expect(r.statusCode, r.body).toBe(200);
    const f = r.json();
    expect(f.contato).toMatchObject({ nome: 'Sandra', email: 'sandra@clinica.com.br' });
    expect(eventos(f, 'campo').at(-1).texto).toBe('mudou E-mail do contato para "sandra@clinica.com.br"');
    const errado = await operador.patch(`/atendimento/chamados/${id}`, { contatoEmail: 'sandra@clinica' });
    expect(errado.statusCode).toBe(400);
    expect(errado.json().details[0].message).toBe('E-mail inválido: use o jeito nome@empresa.com.br.');
    // os outros contatos: só o e-mail basta; o mesmo e-mail do principal fica de fora
    const o = (await operador.patch(`/atendimento/chamados/${id}`, { outrosContatos: [
      { nome: 'Contabilidade', email: 'Contas@Clinica.com.br' }, { nome: 'Sandra (e-mail)', email: 'sandra@clinica.com.br' },
    ] })).json();
    expect(o.outrosContatos).toEqual([{ nome: 'Contabilidade', telefone: null, email: 'contas@clinica.com.br' }]);
    expect(eventos(o, 'campo').at(-1).texto).toBe('mudou Outros contatos para "Contabilidade contas@clinica.com.br"');
    // a busca acha pelo e-mail do principal e pelo de um outro contato
    for (const q of ['sandra@clinica', 'contas@clinica']) {
      expect((await s.get(`/atendimento/chamados?situacao=todos&q=${encodeURIComponent(q)}`)).json().items.map((c: any) => c.id)).toContain(id);
    }
    // vazio tira
    const sem = (await operador.patch(`/atendimento/chamados/${id}`, { contatoEmail: null, outrosContatos: [] })).json();
    expect(sem.contato.email).toBeNull();
    expect(eventos(sem, 'campo').map((e: any) => e.texto)).toContain('mudou E-mail do contato de "sandra@clinica.com.br" para (vazio)');
  });

  it('passar para alguém registra o responsável e avisa quem recebeu', async () => {
    const f = (await operador.patch(`/atendimento/chamados/${id}`, { responsavelId: brunoId, etiquetas: ['audio', 'Áudio', 'vip'] })).json();
    expect(f.responsavel).toEqual({ id: brunoId, nome: 'Bruno Técnico' });
    expect(f.etiquetas).toEqual(['audio', 'vip']);
    expect(eventos(f, 'responsavel').at(-1).texto).toBe('ficou com Bruno Técnico');
    const avisos = (await tecnico.get('/atendimento/avisos')).json();
    expect(avisos.itens[0]).toMatchObject({ tipo: 'recebeu', texto: `Você recebeu o chamado ${f.codigo}`, lido: false, chamado: { id } });
  });
});

// =====================================================================

describe('mover', () => {
  let id = '';
  let codigo = '';
  beforeAll(async () => { ({ id, codigo } = await abrir(operador, { titulo: 'Ramal sem registro' })); await comResponsavel(id, marinaId); });

  it('sair do Novo pede o responsável (2.2): a ficha diz, o mover recusa, e com o responsável no mover, vai', async () => {
    const { id: outro } = await abrir(operador, { titulo: 'Fila sem música', clienteId: aurora });
    const f = await ficha(s, outro);
    // todas as etapas fora da entrada pedem; a própria entrada, não
    expect(f.faltam[E.n1]).toEqual(['responsavel']);
    expect(f.faltam[E.fechado]).toContain('responsavel');
    expect(f.faltam[E.novo]).toEqual([]);
    const r = await mover(operador, outro, E.n1);
    expect(r.statusCode).toBe(400);
    expect(r.json()).toMatchObject({ error: 'Para ir para N1, falta preencher: Responsável.', details: { faltam: ['responsavel'] } });
    // o responsável no próprio mover (a janela do quadro): vai
    const ok = await mover(operador, outro, E.n1, { responsavelId: brunoId });
    expect(ok.statusCode, ok.body).toBe(200);
    expect(ok.json()).toMatchObject({ etapaId: E.n1, responsavel: { id: brunoId } });
    // fora da entrada, sem responsável anda como antes (voltar para a fila do N2 é normal)
    expect((await operador.patch(`/atendimento/chamados/${outro}`, { responsavelId: null, assuntoId: ramal })).statusCode).toBe(200);
    const n2 = await mover(operador, outro, E.n2, { motivo: 'acesso ao SBC' });
    expect(n2.statusCode, n2.body).toBe(200);
  });

  it('o que falta para a etapa: 400 com a lista', async () => {
    const r = await mover(operador, id, E.n1);
    expect(r.statusCode).toBe(400);
    expect(r.json()).toMatchObject({ error: 'Para ir para N1, falta preencher: Cliente.', details: { faltam: ['cliente'] } });
    expect((await ficha(s, id)).faltam[E.n1]).toEqual(['cliente']);
  });

  it('escalonar pede o motivo; com o motivo, fica no histórico e na trajetória', async () => {
    await operador.patch(`/atendimento/chamados/${id}`, { clienteId: aurora });
    expect((await mover(operador, id, E.n1)).statusCode).toBe(200);
    await operador.patch(`/atendimento/chamados/${id}`, { assuntoId: ramal });
    const sem = await mover(operador, id, E.n2);
    expect(sem.statusCode).toBe(400);
    expect(sem.json().error).toBe('Escalonar pede o motivo.');
    const r = await mover(operador, id, E.n2, { motivo: 'precisa de acesso ao SBC' });
    expect(r.statusCode).toBe(200);
    const f = r.json();
    expect(f).toMatchObject({ etapaId: E.n2, nivel: 2 });
    expect(eventos(f, 'etapa').at(-1)).toMatchObject({
      texto: 'escalonou de N1 (N1) para N2 (N2): precisa de acesso ao SBC',
      dados: { de: { id: E.n1, nome: 'N1', nivel: 1 }, para: { id: E.n2, nome: 'N2', nivel: 2 }, motivo: 'precisa de acesso ao SBC', sentido: 'sobe' },
    });
    expect(f.trajetoria.map((p: any) => [p.etapa, p.sentido, p.motivo, p.por])).toEqual([
      ['Novo', null, null, null], ['N1', null, null, 'Marina Costa'], ['N2', 'sobe', 'precisa de acesso ao SBC', 'Marina Costa'],
    ]);
    const a = (await s.get(`/admin/audit?entityType=ticket&entityId=${id}`)).json();
    expect(a.items[0].summary).toBe(`Escalonou ${codigo} de N1 para N2: precisa de acesso ao SBC`);
  });

  it('voltar de nível também pede o motivo; a mesma etapa não muda nada', async () => {
    const r = await mover(operador, id, E.n1);
    expect(r.statusCode).toBe(400);
    expect(r.json().error).toBe('Voltar de nível pede o motivo.');
    const antes = (await ficha(s, id)).historico.length;
    expect((await mover(operador, id, E.n2)).json().historico.length).toBe(antes);
    expect((await mover(operador, id, E.devNovo)).statusCode).toBe(400);
  });

  it('fechar marca as datas; voltar do fechado reabre e conta', async () => {
    await classificar(operador, id);
    const fechado = (await mover(operador, id, E.fechado)).json();
    expect(fechado).toMatchObject({ situacao: 'fechado', etapaId: E.fechado });
    expect(fechado.fechadoEm).not.toBeNull();
    expect(fechado.resolvidoEm).not.toBeNull();
    const r = await mover(operador, id, E.n1, { motivo: 'o cliente ligou de novo' });
    expect(r.statusCode, r.body).toBe(200);
    const f = r.json();
    expect(f).toMatchObject({ situacao: 'aberto', reaberto: 1, resolvidoEm: null, fechadoEm: null });
    expect(f.historico.slice(-2).map((e: any) => e.tipo)).toEqual(['etapa', 'reaberto']);
    expect(eventos(f, 'reaberto')[0].texto).toBe('reabriu o chamado: o cliente ligou de novo');
  });

  it('passar para a pessoa ao mover (ou tirar o responsável: volta para a fila da etapa)', async () => {
    const f = (await mover(operador, id, E.n2, { motivo: 'rota da operadora', responsavelId: brunoId })).json();
    expect(f.responsavel).toEqual({ id: brunoId, nome: 'Bruno Técnico' });
    const g = (await mover(operador, id, E.n3, { motivo: 'falar com o fabricante', responsavelId: null })).json();
    expect(g.responsavel).toBeNull();
    expect(eventos(g, 'responsavel').at(-1).texto).toBe('tirou o responsável (Bruno Técnico)');
  });

  it('reabrir: só o resolvido ou fechado; vai para a primeira etapa de andamento e avisa o responsável', async () => {
    const { id: outro, codigo: cod } = await abrir(s, { responsavelId: marinaId });
    await classificar(s, outro);
    expect((await mover(s, outro, E.resolvido)).statusCode).toBe(200);
    const aberto = await s.post(`/atendimento/chamados/${id}/reabrir`, { motivo: 'x' });
    expect(aberto.statusCode).toBe(400);
    expect(aberto.json().error).toBe('O chamado já está aberto.');
    const f = (await s.post(`/atendimento/chamados/${outro}/reabrir`, { motivo: 'voltou a falhar' })).json();
    expect(f).toMatchObject({ etapaId: E.n1, situacao: 'aberto', reaberto: 1, resolvidoEm: null });
    expect(eventos(f, 'reaberto').at(-1).texto).toBe('reabriu o chamado: voltou a falhar');
    const avisos = (await operador.get('/atendimento/avisos')).json();
    expect(avisos.itens.map((i: any) => i.texto)).toContain(`O ${cod} foi reaberto`);
  });

  it('o nível DEV, depois do N3 (13/10, o Luan): escalonar para ele pede o motivo, e voltar dele também', async () => {
    const { id: outro, codigo: cod } = await abrir(operador, { clienteId: aurora, assuntoId: ramal });
    await comResponsavel(outro, marinaId);
    expect((await mover(operador, outro, E.n3)).statusCode).toBe(200);
    const sem = await mover(operador, outro, E.dev);
    expect(sem.statusCode).toBe(400);
    expect(sem.json().error).toBe('Escalonar pede o motivo.');
    const f = (await mover(operador, outro, E.dev, { motivo: 'correção no plano de discagem' })).json();
    expect(f).toMatchObject({ etapaId: E.dev, nivel: 4 });
    expect(eventos(f, 'etapa').at(-1).texto).toBe('escalonou de N3 (N3) para DEV (DEV): correção no plano de discagem');
    expect(f.trajetoria.at(-1)).toMatchObject({ etapa: 'DEV', nivel: 4, sentido: 'sobe', motivo: 'correção no plano de discagem' });
    const a = (await s.get(`/admin/audit?entityType=ticket&entityId=${outro}`)).json();
    expect(a.items[0].summary).toBe(`Escalonou ${cod} de N3 para DEV: correção no plano de discagem`);
    const volta = await mover(operador, outro, E.n2);
    expect(volta.statusCode).toBe(400);
    expect(volta.json().error).toBe('Voltar de nível pede o motivo.');
  });
});

// =====================================================================

describe('pai e filhos (inclusive em outro painel)', () => {
  let pai = { id: '', codigo: '' };
  let filho = { id: '', codigo: '' };
  beforeAll(async () => {
    pai = await abrir(s, { titulo: 'Tela de ramais quebrada para o cliente', responsavelId: marinaId });
    await classificar(s, pai.id);
    filho = await abrir(s, { painelId: DEV, titulo: 'Corrigir a tela de ramais', paiId: pai.codigo });
  });

  it('o filho nasce ligado ao pai, e os dois registram', async () => {
    const fp = await ficha(s, pai.codigo);
    expect(fp.filhosLista.map((c: any) => c.codigo)).toEqual([filho.codigo]);
    expect(fp.filhos).toEqual({ total: 1, abertos: 1 });
    expect(eventos(fp, 'filho')[0].texto).toBe(`ganhou o filho ${filho.codigo} (Desenvolvimento)`);
    const ff = await ficha(s, filho.codigo);
    expect(ff.pai).toEqual({ id: pai.id, codigo: pai.codigo });
    expect(eventos(ff, 'pai')[0].texto).toBe(`virou filho de ${pai.codigo}`);
    expect(fp.filhosTravam[E.fechado]).toEqual([filho.codigo]);
    expect(fp.filhosTravam[E.n1]).toEqual([]);
  });

  it('o pai não fecha com filho aberto, e a mensagem diz quais', async () => {
    const r = await mover(s, pai.id, E.fechado);
    expect(r.statusCode).toBe(400);
    expect(r.json()).toMatchObject({ error: `O ${pai.codigo} tem filhos em aberto: ${filho.codigo}. Feche os filhos antes.`, details: { filhos: [filho.codigo] } });
  });

  it('recusa o círculo (o pai não pode estar abaixo do filho, nem ser ele mesmo)', async () => {
    const r = await s.post(`/atendimento/chamados/${pai.id}/pai`, { pai: filho.codigo });
    expect(r.statusCode).toBe(400);
    expect(r.json().error).toBe(`Isso faria um círculo: ${filho.codigo} já está abaixo de ${pai.codigo} (${pai.codigo} › ${filho.codigo}).`);
    const r2 = await s.post(`/atendimento/chamados/${filho.id}/pai`, { pai: filho.codigo });
    expect(r2.statusCode).toBe(400);
    expect(r2.json().error).toMatch(/^Isso faria um círculo/);
  });

  it('fechado o filho, o responsável do pai fica sabendo, e o pai fecha', async () => {
    await s.patch(`/atendimento/chamados/${filho.id}`, { solucao: 'Corrigido na versão 2.3' });
    await comResponsavel(filho.id);
    const r = await mover(s, filho.id, E.devFechado);
    expect(r.statusCode, r.body).toBe(200);
    const avisos = (await operador.get('/atendimento/avisos')).json();
    expect(avisos.itens[0]).toMatchObject({ tipo: 'pai', texto: `O filho ${filho.codigo} do ${pai.codigo} foi fechado`, chamado: { codigo: pai.codigo } });
    expect((await mover(s, pai.id, E.fechado)).statusCode).toBe(200);
  });

  it('tirar o pai registra nos dois', async () => {
    const outro = await abrir(s, { titulo: 'Filho que vai sair' });
    await s.post(`/atendimento/chamados/${outro.id}/pai`, { pai: pai.codigo });
    const f = (await s.post(`/atendimento/chamados/${outro.id}/pai`, { pai: null })).json();
    expect(f.pai).toBeNull();
    expect(eventos(f, 'pai').at(-1).texto).toBe(`deixou de ser filho de ${pai.codigo}`);
    expect(eventos(await ficha(s, pai.id), 'filho').at(-1).texto).toBe(`${outro.codigo} deixou de ser filho deste`);
  });
});

// =====================================================================

describe('o problema e os incidentes', () => {
  let i1 = { id: '', codigo: '' };
  let i2 = { id: '', codigo: '' };
  let p = { id: '', codigo: '' };
  beforeAll(async () => {
    i1 = await abrir(s, { titulo: 'Sem áudio na Aurora' });
    i2 = await abrir(s, { titulo: 'Sem áudio no Hospital' });
    p = await abrir(s, { tipoChamado: 'problema', titulo: 'Queda da operadora VC1', incidentes: [i1.codigo, i2.id] });
  });

  it('o problema junta os incidentes, e cada um sabe do problema', async () => {
    const fp = await ficha(s, p.codigo);
    expect(fp).toMatchObject({ tipoChamado: 'problema', incidentes: 2 });
    expect(fp.incidentesLista.map((c: any) => c.codigo).sort()).toEqual([i1.codigo, i2.codigo].sort());
    expect(eventos(fp, 'incidente').map((e: any) => e.texto)).toEqual([`juntou o incidente ${i1.codigo}`, `juntou o incidente ${i2.codigo}`]);
    const f1 = await ficha(s, i1.codigo);
    expect(f1.problema).toEqual({ id: p.id, codigo: p.codigo });
    expect(eventos(f1, 'problema')[0].texto).toBe(`virou incidente do problema ${p.codigo}`);
    expect(fp.grafo.nos.map((n: any) => n.codigo).sort()).toEqual([i1.codigo, i2.codigo, p.codigo].sort());
  });

  it('só um problema pode ser o problema de um chamado', async () => {
    const r = await s.post(`/atendimento/chamados/${i2.id}/problema`, { problema: i1.codigo });
    expect(r.statusCode).toBe(400);
    expect(r.json().error).toBe(`${i1.codigo} não é um problema.`);
    const outro = await abrir(s, { titulo: 'Mais um sem áudio' });
    const f = (await s.post(`/atendimento/chamados/${outro.id}/problema`, { problema: p.codigo })).json();
    expect(f.problema.codigo).toBe(p.codigo);
    expect((await ficha(s, p.codigo)).incidentes).toBe(3);
    const g = (await s.post(`/atendimento/chamados/${outro.id}/problema`, { problema: null })).json();
    expect(g.problema).toBeNull();
  });

  it('o problema só resolve com a causa, a solução e a validação', async () => {
    await classificar(s, p.id);
    await comResponsavel(p.id);
    const r = await mover(s, p.id, E.resolvido);
    expect(r.statusCode).toBe(400);
    expect(r.json()).toMatchObject({ error: 'Para ir para Resolvido, falta preencher: A validação (problema).', details: { faltam: ['validacao'] } });
    await s.patch(`/atendimento/chamados/${p.id}`, { validacao: 'Uma semana sem queda nos 3 clientes' });
    expect((await mover(s, p.id, E.resolvido)).json().situacao).toBe('resolvido');
  });
});

// =====================================================================

describe('esperar e assumir', () => {
  it('esperar pede o motivo; esperando o cliente, o prazo de solução para', async () => {
    const { id } = await abrir(operador, { gravidade: 'intermitencia', alcance: 'setor' });
    const sem = await operador.post(`/atendimento/chamados/${id}/esperar`, { tipo: 'cliente' });
    expect(sem.statusCode).toBe(400);
    expect(sem.json().error).toBe('Diga o motivo da espera.');
    const f = (await operador.post(`/atendimento/chamados/${id}/esperar`, { tipo: 'cliente', motivo: 'testar o ramal à tarde' })).json();
    expect(f.espera).toMatchObject({ tipo: 'cliente', motivo: 'testar o ramal à tarde' });
    expect(f.prazos.solucao.situacao).toBe('pausado');
    expect(eventos(f, 'espera').at(-1).texto).toBe('marcou: Esperando o cliente (testar o ramal à tarde)');
    const g = (await operador.post(`/atendimento/chamados/${id}/esperar`, { tipo: null })).json();
    expect(g.espera).toBeNull();
    expect(g.prazos.solucao.situacao).not.toBe('pausado');
    expect(g.esperas).toHaveLength(1);
    expect(g.esperas[0].fim).not.toBeNull();
    expect(eventos(g, 'espera').at(-1).texto).toMatch(/^tirou a marca de espera \(Esperando o cliente\)/);
  });

  it('assumir leva da entrada para o N1 quando não falta nada', async () => {
    const { id } = await abrir(s, { clienteId: aurora });
    const f = (await operador.post(`/atendimento/chamados/${id}/assumir`, {})).json();
    expect(f).toMatchObject({ etapaId: E.n1, responsavel: { id: marinaId, nome: 'Marina Costa' } });
    expect(f.historico.slice(-2).map((e: any) => e.texto)).toEqual(['moveu de Novo para N1 (N1)', 'ficou com Marina Costa']);
  });

  it('assumir sem o que o N1 pede: fica na entrada (a ficha mostra o que falta)', async () => {
    const { id } = await abrir(s);
    const f = (await operador.post(`/atendimento/chamados/${id}/assumir`, {})).json();
    expect(f).toMatchObject({ etapaId: E.novo, responsavel: { id: marinaId } });
    expect(f.faltam[E.n1]).toEqual(['cliente']);
  });
});

// =====================================================================

describe('anotações com anexo', () => {
  let id = '';
  beforeAll(async () => { id = (await abrir(s)).id; });

  it('a imagem abre na tela; o PDF e o SVG baixam como arquivo', async () => {
    const r = await operador.post(`/atendimento/chamados/${id}/anotacoes`, {
      texto: 'Print do erro e o relatório da operadora',
      anexos: [{ fileName: 'erro.png', conteudo: PNG }, { fileName: 'relatório VC1.pdf', conteudo: PDF }, { fileName: 'logo.svg', conteudo: SVG }],
    });
    expect(r.statusCode, r.body).toBe(200);
    const nota = r.json().anotacoesLista.at(-1);
    expect(nota).toMatchObject({ texto: 'Print do erro e o relatório da operadora', por: { id: marinaId }, podeApagar: true });
    const [png, pdf, svg] = nota.anexos;
    expect(png).toMatchObject({ nome: 'erro.png', tipo: 'image/png', imagem: true });
    expect(pdf).toMatchObject({ nome: 'relatório VC1.pdf', imagem: false });
    expect(svg.imagem).toBe(false);

    const img = await leitor.get(`/atendimento/anexos/${png.id}`);
    expect(img.statusCode).toBe(200);
    expect(img.headers['content-type']).toBe('image/png');
    expect(img.headers['content-disposition']).toMatch(/^inline/);
    expect(img.headers['x-content-type-options']).toBe('nosniff');
    const arq = await leitor.get(`/atendimento/anexos/${pdf.id}`);
    expect(arq.headers['content-type']).toBe('application/octet-stream');
    expect(arq.headers['content-disposition']).toContain(`attachment; filename="relat_rio VC1.pdf"; filename*=UTF-8''${encodeURIComponent('relatório VC1.pdf')}`);
    const vetor = await leitor.get(`/atendimento/anexos/${svg.id}`);
    expect(vetor.headers['content-disposition']).toMatch(/^attachment/);
    expect(r.json().anotacoes).toBe(1);
  });

  it('mais de 5 anexos, ou nada escrito nem anexado: 400', async () => {
    const seis = Array.from({ length: 6 }, (_, i) => ({ fileName: `${i}.png`, conteudo: PNG }));
    expect((await operador.post(`/atendimento/chamados/${id}/anotacoes`, { texto: 'muitos', anexos: seis })).statusCode).toBe(400);
    expect((await operador.post(`/atendimento/chamados/${id}/anotacoes`, { texto: '   ', anexos: [] })).statusCode).toBe(400);
  });

  it('apagar a anotação de outra pessoa sem cuidar dos chamados: 403; a sua, pode (e o anexo some)', async () => {
    const nota = (await ficha(s, id)).anotacoesLista.at(-1);
    const r = await tecnico.del(`/atendimento/chamados/${id}/anotacoes/${nota.id}`);
    expect(r.statusCode).toBe(403);
    expect(r.json().error).toBe('Só quem escreveu (ou quem cuida dos chamados) pode apagar esta anotação.');
    expect((await ficha(tecnico, id)).anotacoesLista.at(-1).podeApagar).toBe(false);
    const f = (await operador.del(`/atendimento/chamados/${id}/anotacoes/${nota.id}`)).json();
    expect(f.anotacoesLista).toHaveLength(0);
    expect((await leitor.get(`/atendimento/anexos/${nota.anexos[0].id}`)).statusCode).toBe(404);
    const a = (await s.get(`/admin/audit?entityType=ticket&entityId=${id}`)).json();
    expect(a.items[0]).toMatchObject({ action: 'delete', before: { texto: 'Print do erro e o relatório da operadora', por: 'Marina Costa' } });
  });

  it('quem cuida dos chamados apaga a anotação de qualquer um', async () => {
    const nota = (await operador.post(`/atendimento/chamados/${id}/anotacoes`, { texto: 'Liguei para o cliente' })).json().anotacoesLista.at(-1);
    expect((await s.del(`/atendimento/chamados/${id}/anotacoes/${nota.id}`)).statusCode).toBe(200);
  });
});

// =====================================================================

describe('ligações', () => {
  let a = { id: '', codigo: '' };
  let b = { id: '', codigo: '' };
  beforeAll(async () => { a = await abrir(s, { titulo: 'Repetido A' }); b = await abrir(s, { titulo: 'Repetido B' }); });

  it('liga os dois, cada um do seu lado', async () => {
    const fa = (await s.post(`/atendimento/chamados/${a.id}/ligacoes`, { para: b.codigo.toLowerCase(), tipo: 'duplicado' })).json();
    expect(fa.ligacoes).toMatchObject([{ tipo: 'duplicado', texto: 'Duplicado de', chamado: { codigo: b.codigo } }]);
    expect(eventos(fa, 'ligacao').at(-1).texto).toBe(`ligou Duplicado de ${b.codigo}`);
    const fb = await ficha(s, b.codigo);
    expect(fb.ligacoes).toMatchObject([{ tipo: 'duplicado', texto: 'Tem o duplicado', chamado: { codigo: a.codigo } }]);
    expect(eventos(fb, 'ligacao').at(-1).texto).toBe(`ligou Tem o duplicado ${a.codigo}`);
    expect(fa.grafo.arestas).toEqual(expect.arrayContaining([{ de: a.id, para: b.id, tipo: 'duplicado' }]));
  });

  it('a mesma ligação de novo (em qualquer sentido): 409; com ele mesmo: 400', async () => {
    const r = await s.post(`/atendimento/chamados/${b.id}/ligacoes`, { para: a.codigo, tipo: 'relacionado' });
    expect(r.statusCode).toBe(409);
    expect(r.json().error).toBe('Esses chamados já estão ligados.');
    expect((await s.post(`/atendimento/chamados/${a.id}/ligacoes`, { para: a.codigo, tipo: 'relacionado' })).statusCode).toBe(400);
    expect((await s.post(`/atendimento/chamados/${a.id}/ligacoes`, { para: 'SUP-99999', tipo: 'relacionado' })).statusCode).toBe(400);
  });

  it('desligar tira dos dois', async () => {
    const lig = (await ficha(s, a.id)).ligacoes[0];
    const f = (await s.del(`/atendimento/chamados/${b.id}/ligacoes/${lig.id}`)).json();
    expect(f.ligacoes).toEqual([]);
    expect((await ficha(s, a.id)).ligacoes).toEqual([]);
    expect(eventos(f, 'ligacao').at(-1).texto).toBe(`desligou Tem o duplicado ${a.codigo}`);
  });

  it('o código citado no texto vira referência (do Gestor ou do LineChat antigo)', async () => {
    const f = (await s.patch(`/atendimento/chamados/${a.id}`, { descricao: `Igual ao ${b.codigo}; no LineChat era o IS-4280.` })).json();
    expect(f.referencias).toEqual([
      { codigo: b.codigo, existe: true, titulo: 'Repetido B', situacao: 'aberto', id: b.id, url: null },
      { codigo: 'IS-4280', existe: false, titulo: null, situacao: null, id: null, url: null },
    ]);
    expect(f.grafo.arestas).toEqual(expect.arrayContaining([{ de: a.id, para: b.id, tipo: 'citado' }]));
    // e quem é citado vê de onde veio
    expect((await ficha(s, b.id)).grafo.arestas).toEqual(expect.arrayContaining([{ de: a.id, para: b.id, tipo: 'citado' }]));
  });
});

// =====================================================================

describe('checklist, tempo, operadora, acompanhar e trocar de painel', () => {
  let id = '';
  beforeAll(async () => { id = (await abrir(operador, { assuntoId: ramal, clienteId: aurora, tipo: 'Incidente' })).id; });

  it('o checklist: marcar, incluir e tirar', async () => {
    const item = (await ficha(s, id)).checklist[0];
    let f = (await operador.post(`/atendimento/chamados/${id}/checklist`, { acao: 'marcar', itemId: item.id, feito: true })).json();
    expect(f.checklist[0]).toMatchObject({ texto: 'Testar o ramal', feito: true, porId: marinaId });
    f = (await operador.post(`/atendimento/chamados/${id}/checklist`, { acao: 'incluir', texto: 'Ligar para o cliente' })).json();
    expect(f.checklist.map((i: any) => [i.texto, i.doAssunto])).toEqual([['Testar o ramal', true], ['Conferir o registro', true], ['Ligar para o cliente', false]]);
    f = (await operador.post(`/atendimento/chamados/${id}/checklist`, { acao: 'tirar', itemId: f.checklist[2].id })).json();
    expect(f.checklist).toHaveLength(2);
    expect(eventos(f, 'checklist').map((e: any) => e.texto)).toEqual(['marcou no checklist: Testar o ramal', 'incluiu no checklist: Ligar para o cliente', 'tirou do checklist: Ligar para o cliente']);
    expect((await operador.post(`/atendimento/chamados/${id}/checklist`, { acao: 'marcar', itemId: 'nao-existe', feito: true })).statusCode).toBe(400);
  });

  it('o tempo: hoje (Brasília), a soma; apagar é de quem registrou (ou de quem cuida)', async () => {
    const f = (await operador.post(`/atendimento/chamados/${id}/tempo`, { minutos: 90, nota: 'Visita técnica' })).json();
    expect(f.tempo.total).toBe(90);
    expect(f.tempo.itens[0]).toMatchObject({ minutos: 90, nota: 'Visita técnica', dia: diaLocal(new Date()), por: { id: marinaId }, podeApagar: true });
    expect(eventos(f, 'tempo').at(-1).texto).toBe('registrou 1 h 30 de trabalho: Visita técnica');
    const item = f.tempo.itens[0].id;
    expect((await tecnico.del(`/atendimento/chamados/${id}/tempo/${item}`)).statusCode).toBe(403);
    expect((await operador.del(`/atendimento/chamados/${id}/tempo/${item}`)).json().tempo).toEqual({ total: 0, itens: [] });
  });

  it('a operadora: abrir marca a espera; cobrar conta a próxima cobrança; fechar tira a espera', async () => {
    const sem = await operador.post(`/atendimento/chamados/${id}/operadora`, { protocolo: '123' });
    expect(sem.statusCode).toBe(400);
    let f = (await operador.post(`/atendimento/chamados/${id}/operadora`, { operadoraId: operadoraA, protocolo: '2026-555', cobrarACadaHoras: 4, nota: 'Prometeram para amanhã' })).json();
    const caso = f.operadora[0];
    expect(caso).toMatchObject({ protocolo: '2026-555', situacao: 'aberto', cobrarACadaHoras: 4, andamentos: [{ acao: 'abriu', texto: 'Prometeram para amanhã', por: 'Marina Costa' }] });
    expect(Date.parse(caso.proximaCobrancaEm) - Date.parse(caso.abertoEm)).toBe(4 * 3_600_000);
    expect(f.espera).toMatchObject({ tipo: 'operadora', motivo: 'Protocolo 2026-555' });
    f = (await operador.post(`/atendimento/chamados/${id}/operadora/${caso.id}`, { acao: 'cobrar', texto: 'Liguei e cobrei' })).json();
    expect(f.operadora[0].andamentos.map((x: any) => x.acao)).toEqual(['abriu', 'cobrou']);
    f = (await operador.post(`/atendimento/chamados/${id}/operadora/${caso.id}`, { acao: 'fechar', texto: 'Rota corrigida' })).json();
    expect(f.operadora[0]).toMatchObject({ situacao: 'fechado', proximaCobrancaEm: null });
    expect(f.espera).toBeNull();
    expect(eventos(f, 'operadora').map((e: any) => e.dados.acao)).toEqual(['abriu', 'cobrou', 'fechou']);
    expect((await operador.post(`/atendimento/chamados/${id}/operadora/${caso.id}`, { acao: 'cobrar' })).statusCode).toBe(400);
  });

  it('observar e deixar de observar', async () => {
    const f = (await tecnico.post(`/atendimento/chamados/${id}/observar`, { observar: true })).json();
    expect(f).toMatchObject({ observando: true, observadores: [{ id: brunoId, nome: 'Bruno Técnico' }] });
    const g = (await tecnico.post(`/atendimento/chamados/${id}/observar`, { observar: false })).json();
    expect(g).toMatchObject({ observando: false, observadores: [] });
    expect(eventos(g, 'observador').map((e: any) => e.texto)).toEqual(['passou a observar', 'deixou de observar']);
  });

  it('trocar de painel: o código fica; o assunto sai, e o tipo que o painel novo não tem também', async () => {
    const antes = await ficha(s, id);
    const f = (await operador.post(`/atendimento/chamados/${id}/painel`, { painelId: DEV })).json();
    expect(f).toMatchObject({ codigo: antes.codigo, painelId: DEV, etapaId: E.devNovo, assunto: null, tipo: null });
    expect(eventos(f, 'painel').at(-1).texto).toBe('passou do painel Suporte para Desenvolvimento');
    expect(f.faltam).toHaveProperty(E.devFechado);
  });
});

// =====================================================================

describe('avisar o cliente pelo WhatsApp', () => {
  const enviados: Array<{ url: string; corpo: any; auth: string }> = [];
  let falhar = false;
  /** o que o LineChat responde no envio que espera o WhatsApp (o send-sync) */
  let resposta: Record<string, unknown> = { status: 'SENT' };
  let chave = '';
  let secretId = '';
  const ajustar = (o: Record<string, unknown>) => integ.gravar(app.db, 'atendimento-avisos', {
    ...AVISOS_CHAMADOS_PADRAO, ativo: true, usarChaveDoLineChat: false, url: 'https://api.exemplo.com.br/chat/v1/message/send', numeroCliente: '557130348350', ...o,
  }, { secretId });
  beforeAll(async () => {
    chave = `chave-falsa-${Math.random()}`;
    secretId = await app.vault.save(app.db, { label: 'WhatsApp dos chamados', plain: chave });
    // o texto livre (os testes do modelo aprovado ficam no fim)
    await ajustar({ envioCliente: 'texto' });
    trocarFerramentasWhatsApp({
      fetchFn: (async (url: string, init: RequestInit) => {
        enviados.push({ url, corpo: JSON.parse(String(init.body)), auth: String((init.headers as Record<string, string>).Authorization) });
        return falhar ? new Response('erro interno', { status: 500 }) : new Response(JSON.stringify(resposta), { status: 200 });
      }) as unknown as typeof fetch,
    });
  });
  afterAll(async () => {
    const { valor } = await integ.ler<Record<string, unknown>>(app.db, 'atendimento-avisos');
    await integ.gravar(app.db, 'atendimento-avisos', { ...valor, ativo: false });
  });

  it('sem o WhatsApp do contato: 400', async () => {
    const { id } = await abrir(s);
    const r = await s.post(`/atendimento/chamados/${id}/avisar-cliente`, { texto: 'Oi' });
    expect(r.statusCode).toBe(400);
    expect(r.json().error).toBe('O chamado não tem o WhatsApp do contato.');
  });

  it('manda pelo número oficial, com o modelo dos Ajustes, e fica no histórico', async () => {
    const { id, codigo } = await abrir(s, { titulo: 'Ramal mudo', contatoNome: 'Joana', contatoTelefone: '(71) 98888-7777', clienteId: aurora });
    const r = await s.post(`/atendimento/chamados/${id}/avisar-cliente`, { texto: 'Pode testar agora?' });
    expect(r.statusCode, r.body).toBe(200);
    const ultimo = enviados.at(-1)!;
    // a mensagem ao cliente espera o WhatsApp responder (o send-sync)
    expect(ultimo.url).toBe('https://api.exemplo.com.br/chat/v1/message/send-sync');
    expect(ultimo.auth).toBe(`Bearer ${chave}`);
    expect(ultimo.corpo).toEqual({
      from: '557130348350', to: '5571988887777',
      body: { text: `Olá, Joana! Sobre o seu chamado ${codigo} (Ramal mudo):\n\nPode testar agora?\n\nEquipe de suporte Ingline` },
    });
    expect(eventos(r.json(), 'aviso_cliente').at(-1)).toMatchObject({ texto: 'avisou o cliente pelo WhatsApp', dados: { ok: true, texto: 'Pode testar agora?' } });
  });

  it('quando o WhatsApp recusa: 400 com o motivo, e o histórico guarda a tentativa', async () => {
    const { id } = await abrir(s, { contatoTelefone: '(71) 98888-7777' });
    falhar = true;
    const r = await s.post(`/atendimento/chamados/${id}/avisar-cliente`, { texto: 'Pode testar?' });
    falhar = false;
    expect(r.statusCode).toBe(400);
    expect(r.json().error).toBe('O LineChat respondeu 500: erro interno');
    const f = await ficha(s, id);
    expect(eventos(f, 'aviso_cliente').at(-1).dados).toMatchObject({ ok: false, erro: 'O LineChat respondeu 500: erro interno' });
  });

  it('ao abrir, pode mandar o número do chamado ao cliente', async () => {
    const r = await abrir(s, { contatoNome: 'Joana', contatoTelefone: '(71) 98888-7777', avisarCliente: true });
    expect(r.aviso).toEqual({ ok: true, mensagem: 'Mandado (o WhatsApp confirmou: SENT).' });
    expect(enviados.at(-1)!.corpo.body.text).toContain(`${r.codigo} (Ramal mudo):\n\nAbrimos este chamado para o seu atendimento.`);
  });

  // ---- o modelo aprovado (o pedido do Luan na prévia: o WhatsApp oficial só manda template) ----
  const MODELO = {
    id: '2f1e7a90-4d3b-4c8e-9a51-6b0d2c7e8f13', nome: 'ticket_atualizacao', texto: 'Olá, {{nome}}! Novidade no chamado {{chamado}}: {{mensagem}}',
    variaveis: [{ nome: 'nome', valor: '{contato}' }, { nome: 'chamado', valor: '{codigo}' }, { nome: 'mensagem', valor: '{texto}' }],
    tipoArquivo: 'UNDEFINED', arquivo: '',
  };

  it('pelo modelo aprovado: o id, as variáveis com o chamado (sem quebra de linha) e quem fica com a conversa', async () => {
    await ajustar({ envioCliente: 'modelo', template: MODELO, equipeLineChat: 'Suporte N1', atribuirAQuemManda: true });
    const { id, codigo } = await abrir(s, { titulo: 'Ramal mudo', contatoNome: 'Joana', contatoTelefone: '(71) 98888-7777' });
    const r = await s.post(`/atendimento/chamados/${id}/avisar-cliente`, { texto: 'Trocamos o cabo.\n\nPode testar?' });
    expect(r.statusCode, r.body).toBe(200);
    const ultimo = enviados.at(-1)!;
    expect(ultimo.url).toBe('https://api.exemplo.com.br/chat/v1/message/send-sync');
    expect(ultimo.corpo).toEqual({
      from: '557130348350', to: '5571988887777',
      body: { templateId: MODELO.id, parameters: { nome: 'Joana', chamado: codigo, mensagem: 'Trocamos o cabo. · Pode testar?' } },
      department: { name: 'Suporte N1' }, user: { email: 'admin@gestor.local' },
    });
    expect(eventos(r.json(), 'aviso_cliente').at(-1)).toMatchObject({ texto: 'avisou o cliente pelo WhatsApp (com o modelo aprovado)', dados: { ok: true, modelo: true } });
    // a ficha mostra antes de mandar: o texto do modelo e o que vai em cada variável (ela preenche com o chamado)
    const m = (await s.get('/atendimento/opcoes')).json().whatsapp.mensagemCliente;
    expect(m).toEqual({ peloModelo: true, nomeDoModelo: 'ticket_atualizacao', texto: MODELO.texto, variaveis: MODELO.variaveis });
    expect(mensagemPreenchida(m, { contato: 'Joana', codigo, texto: 'Trocamos o cabo.\nPode testar?' }))
      .toBe(`Olá, Joana! Novidade no chamado ${codigo}: Trocamos o cabo. · Pode testar?`);
    // o contato sem nome (um número que o Gestor não conhece): a variável não vai vazia (o WhatsApp recusaria o modelo)
    const semNome = await abrir(s, { contatoTelefone: '(71) 98111-2121' });
    await s.post(`/atendimento/chamados/${semNome.id}/avisar-cliente`, { texto: 'Oi' });
    expect(enviados.at(-1)!.corpo.body.parameters.nome).toBe('-');
  });

  it('o WhatsApp recusou o modelo (o send-sync diz FAILED): 400 com o motivo', async () => {
    const { id } = await abrir(s, { contatoNome: 'Joana', contatoTelefone: '(71) 98888-7777' });
    resposta = { status: 'FAILED', failedReason: 'Template parameters mismatch' };
    const r = await s.post(`/atendimento/chamados/${id}/avisar-cliente`, { texto: 'Pode testar?' });
    resposta = { status: 'SENT' };
    expect(r.statusCode).toBe(400);
    expect(r.json().error).toBe('O WhatsApp não mandou: Template parameters mismatch.');
  });

  it('sem o modelo escolhido (ou sem o arquivo que ele pede), nada sai e a ficha não oferece o botão', async () => {
    await ajustar({ envioCliente: 'modelo', template: null });
    const { id } = await abrir(s, { contatoNome: 'Joana', contatoTelefone: '(71) 98888-7777' });
    const antes = enviados.length;
    let r = await s.post(`/atendimento/chamados/${id}/avisar-cliente`, { texto: 'Pode testar?' });
    expect(r.json().error).toBe('Falta escolher o modelo aprovado da mensagem ao cliente (Painéis › Ajustes › Avisos e WhatsApp).');
    expect((await s.get('/atendimento/opcoes')).json().whatsapp.cliente).toBe(false);
    await ajustar({ envioCliente: 'modelo', template: { ...MODELO, nome: 'promocao', tipoArquivo: 'IMAGE', arquivo: '' } });
    r = await s.post(`/atendimento/chamados/${id}/avisar-cliente`, { texto: 'Pode testar?' });
    expect(r.json().error).toBe('O modelo promocao tem imagem no cabeçalho: falta o endereço do arquivo (Painéis › Ajustes › Avisos e WhatsApp).');
    expect(enviados.length).toBe(antes);
    await ajustar({ envioCliente: 'modelo', template: { ...MODELO, tipoArquivo: 'IMAGE', arquivo: 'https://exemplo.com.br/logo.png' } });
    expect((await s.post(`/atendimento/chamados/${id}/avisar-cliente`, { texto: 'Pode testar?' })).statusCode).toBe(200);
    expect(enviados.at(-1)!.corpo.body.fileUrl).toBe('https://exemplo.com.br/logo.png');
    expect((await s.get('/atendimento/opcoes')).json().whatsapp.cliente).toBe(true);
  });

  it('no texto livre, recusado (passou de 24 h), vai de novo pelo modelo aprovado', async () => {
    await ajustar({ envioCliente: 'texto', template: MODELO });
    const { id } = await abrir(s, { contatoNome: 'Joana', contatoTelefone: '(71) 98888-7777' });
    const antes = enviados.length;
    let tentativas = 0;
    trocarFerramentasWhatsApp({
      fetchFn: (async (url: string, init: RequestInit) => {
        enviados.push({ url, corpo: JSON.parse(String(init.body)), auth: '' });
        tentativas += 1;
        return tentativas === 1 ? new Response('{"text":"Fora da janela de 24 horas"}', { status: 400 }) : new Response('{"status":"QUEUED"}', { status: 200 });
      }) as unknown as typeof fetch,
    });
    const r = await s.post(`/atendimento/chamados/${id}/avisar-cliente`, { texto: 'Pode testar?' });
    expect(r.statusCode, r.body).toBe(200);
    expect(enviados.slice(antes).map((e) => Object.keys(e.corpo.body))).toEqual([['text'], ['templateId', 'parameters']]);
    expect(eventos(r.json(), 'aviso_cliente').at(-1).dados).toMatchObject({ ok: true, modelo: true });
  });
});

// =====================================================================

describe('os avisos na tela (o sininho)', () => {
  it('quem recebe ganha o aviso; quem fez, não', async () => {
    const antesMarina = (await operador.get('/atendimento/avisos')).json().naoLidos;
    const antesAdmin = (await s.get('/atendimento/avisos')).json().naoLidos;
    const { codigo } = await abrir(s, { responsavelId: marinaId });
    const marina = (await operador.get('/atendimento/avisos')).json();
    expect(marina.naoLidos).toBe(antesMarina + 1);
    expect(marina.itens[0]).toMatchObject({ tipo: 'recebeu', texto: `Você recebeu o chamado ${codigo}`, chamado: { codigo, titulo: 'Ramal mudo' }, lido: false });
    expect((await s.get('/atendimento/avisos')).json().naoLidos).toBe(antesAdmin);
    // a Marina abre um para ela mesma: nenhum aviso novo
    await abrir(operador, { responsavelId: marinaId });
    expect((await operador.get('/atendimento/avisos')).json().naoLidos).toBe(antesMarina + 1);
  });

  it('marcar como lidos (uns, ou todos)', async () => {
    const um = (await operador.get('/atendimento/avisos')).json().itens[0];
    await operador.post('/atendimento/avisos/lidos', { ids: [um.id] });
    const depois = (await operador.get('/atendimento/avisos')).json();
    expect(depois.itens.find((i: any) => i.id === um.id).lido).toBe(true);
    await operador.post('/atendimento/avisos/lidos', {});
    expect((await operador.get('/atendimento/avisos')).json().naoLidos).toBe(0);
  });

  it('o Crítico avisa os supervisores; a etapa avisa quem ela manda avisar', async () => {
    await ajustarPainel(SUP, { supervisores: [brunoId] });
    await app.db.update(ticketStages).set({ notifyUserIds: [brunoId] }).where(eq(ticketStages.id, E.n2));
    const { id, codigo } = await abrir(operador, { gravidade: 'inoperancia', alcance: 'empresa', clienteId: aurora, assuntoId: ramal });
    await comResponsavel(id, marinaId);
    let bruno = (await tecnico.get('/atendimento/avisos')).json();
    expect(bruno.itens[0]).toMatchObject({ tipo: 'critico', texto: `Chegou um chamado Crítico: ${codigo}` });
    await mover(operador, id, E.n1);
    await mover(operador, id, E.n2, { motivo: 'acesso ao SBC' });
    bruno = (await tecnico.get('/atendimento/avisos')).json();
    expect(bruno.itens[0]).toMatchObject({ tipo: 'etapa', texto: `${codigo} chegou em N2` });
    await ajustarPainel(SUP, { supervisores: [] });
    await app.db.update(ticketStages).set({ notifyUserIds: [] }).where(eq(ticketStages.id, E.n2));
  });
});

// =====================================================================

describe('os observadores (como no Helena: recebem toda atualização do chamado)', () => {
  const avisos = async (sess: Session) => (await sess.get('/atendimento/avisos')).json().itens.filter((i: any) => i.tipo === 'observador');
  // os chamados destes testes ficam sem observador, sem responsável e sem espera no fim (o Meu dia, mais
  // adiante, conta os que a Marina observa e os que ela espera do cliente)
  const criados: string[] = [];
  afterAll(async () => {
    for (const id of criados) {
      await s.patch(`/atendimento/chamados/${id}`, { observadores: [], responsavelId: null });
      await s.post(`/atendimento/chamados/${id}/esperar`, { tipo: null });
    }
  });
  it('abrir com observadores avisa cada um; quem não existe é recusado', async () => {
    const r = await s.post('/atendimento/chamados', { painelId: SUP, titulo: 'Fila sem tocar', observadores: ['nao-existe'] });
    expect(r.statusCode).toBe(400);
    expect(r.json().error).toMatch(/^Um dos observadores escolhidos/);
    const { id, codigo } = await abrir(s, { titulo: 'Fila sem tocar', observadores: [marinaId, brunoId] });
    criados.push(id);
    const f = await ficha(s, codigo);
    expect(f.observadores.map((o: any) => o.id).sort()).toEqual([marinaId, brunoId].sort());
    expect((await avisos(operador))[0]).toMatchObject({ texto: `Administrador pôs você como observador do ${codigo}`, chamado: { codigo }, lido: false });
    expect((await avisos(tecnico))[0].texto).toBe(`Administrador pôs você como observador do ${codigo}`);
  });

  it('a anotação, a etapa e o responsável chegam para quem observa (menos para quem fez)', async () => {
    const { id, codigo } = await abrir(s, { titulo: 'Ramal 210 mudo', clienteId: aurora, observadores: [marinaId, brunoId] });
    criados.push(id);
    await comResponsavel(id);
    await operador.post(`/atendimento/chamados/${id}/anotacoes`, { texto: 'Liguei para o cliente:\n o cabo estava solto' });
    expect((await avisos(tecnico))[0].texto).toBe(`Marina Costa anotou no ${codigo}: "Liguei para o cliente: o cabo estava solto"`);
    expect((await avisos(operador)).some((a: any) => a.texto.startsWith('Marina Costa anotou'))).toBe(false);
    await mover(s, id, E.n1);
    expect((await avisos(operador))[0].texto).toBe(`Administrador moveu o ${codigo} para N1`);
    expect((await avisos(tecnico))[0].texto).toBe(`Administrador moveu o ${codigo} para N1`);
    // passar para a Marina: ela recebe o "Você recebeu" (e não o do observador); o Bruno fica sabendo
    await s.patch(`/atendimento/chamados/${id}`, { responsavelId: marinaId });
    expect((await avisos(tecnico))[0].texto).toBe(`Administrador passou o ${codigo} para Marina Costa`);
    expect((await avisos(operador)).some((a: any) => a.texto.includes('passou o'))).toBe(false);
    const esperar = await operador.post(`/atendimento/chamados/${id}/esperar`, { tipo: 'cliente', motivo: 'vai testar à tarde' });
    expect(esperar.statusCode, esperar.body).toBe(200);
    expect((await avisos(tecnico))[0].texto).toBe(`Marina Costa marcou o ${codigo}: esperando o cliente (vai testar à tarde)`);
  });

  it('as mudanças de campo juntam num aviso só enquanto ele não foi lido (nem viram cinco avisos)', async () => {
    const { id, codigo } = await abrir(s, { titulo: 'URA muda', observadores: [brunoId] });
    criados.push(id);
    const antes = (await avisos(tecnico)).length;
    await s.patch(`/atendimento/chamados/${id}`, { descricao: 'A URA não fala o menu' });
    await s.patch(`/atendimento/chamados/${id}`, { solucao: 'Regravamos o áudio', etiquetas: ['ura'] });
    await s.patch(`/atendimento/chamados/${id}`, { descricao: 'A URA não fala o menu principal' });
    const depois = await avisos(tecnico);
    expect(depois.length).toBe(antes + 1);
    expect(depois[0].texto).toBe(`Administrador mudou no ${codigo}: Descrição · Solução · Etiquetas`);
    // lido, a próxima mudança vira um aviso novo
    await tecnico.post('/atendimento/avisos/lidos', { ids: [depois[0].id] });
    await s.patch(`/atendimento/chamados/${id}`, { causa: 'Áudio apagado na troca do servidor' });
    const novo = await avisos(tecnico);
    expect(novo.length).toBe(antes + 2);
    expect(novo[0]).toMatchObject({ texto: `Administrador mudou no ${codigo}: Causa`, lido: false });
  });

  it('pôr alguém como observador pela ficha avisa só quem entrou; o "observar" é o mesmo nome', async () => {
    const { id, codigo } = await abrir(s, { titulo: 'Gravação falhando' });
    criados.push(id);
    await s.patch(`/atendimento/chamados/${id}`, { observadores: [brunoId] });
    expect((await avisos(tecnico))[0].texto).toBe(`Administrador pôs você como observador do ${codigo}`);
    const f = (await operador.post(`/atendimento/chamados/${id}/observar`, { observar: true })).json();
    expect(f.observando).toBe(true);
    expect(eventos(f, 'observador').at(-1).texto).toBe('passou a observar');
    // a Marina anota: o Bruno recebe; o administrador (que não observa) não
    await operador.post(`/atendimento/chamados/${id}/anotacoes`, { texto: 'Conferi o disco do servidor' });
    expect((await avisos(tecnico))[0].texto).toBe(`Marina Costa anotou no ${codigo}: "Conferi o disco do servidor"`);
    expect((await avisos(s)).some((a: any) => a.chamado?.codigo === codigo)).toBe(false);
  });
});

// =====================================================================

describe('os webhooks', () => {
  it('o evento sai com a assinatura do segredo do webhook', async () => {
    const segredo = `chave-falsa-${Math.random()}`;
    const secretId = await app.vault.save(app.db, { label: 'Webhook n8n', plain: segredo });
    const webhookId = newId();
    await app.db.insert(ticketWebhooks).values({ id: webhookId, name: 'n8n', url: 'https://n8n.exemplo.com.br/webhook/chamados', events: ['chamado.criado', 'chamado.movido'], secretId });
    const recebidos: Array<{ url: string; headers: Record<string, string>; corpo: string }> = [];
    trocarFerramentasWebhook({
      fetchFn: (async (url: string, init: RequestInit) => {
        recebidos.push({ url, headers: init.headers as Record<string, string>, corpo: String(init.body) });
        return new Response('ok', { status: 200 });
      }) as unknown as typeof fetch,
    });
    // o corpo é montado em segundo plano, com o chamado como está na hora: espera cada evento sair antes do próximo
    const { id, codigo } = await abrir(s, { clienteId: aurora });
    await esperarSegundoPlano();
    await comResponsavel(id);
    await mover(s, id, E.n1);
    await esperarSegundoPlano();
    const criado = recebidos.find((r) => r.headers['X-Gestor-Evento'] === 'chamado.criado' && JSON.parse(r.corpo).chamado?.codigo === codigo)!;
    expect(criado.url).toBe('https://n8n.exemplo.com.br/webhook/chamados');
    expect(criado.headers['X-Gestor-Assinatura']).toBe(assinatura(segredo, criado.corpo));
    expect(JSON.parse(criado.corpo)).toMatchObject({ evento: 'chamado.criado', chamado: { codigo, painel: { sigla: 'SUP' }, etapa: { nome: 'Novo' }, cliente: { nome: 'Clínica Aurora' } } });
    const movido = recebidos.find((r) => r.headers['X-Gestor-Evento'] === 'chamado.movido' && JSON.parse(r.corpo).chamado?.codigo === codigo)!;
    expect(JSON.parse(movido.corpo)).toMatchObject({ evento: 'chamado.movido', de: { nome: 'Novo' }, para: { nome: 'N1' }, chamado: { etapa: { nome: 'N1' } } });
    const [w] = await app.db.select().from(ticketWebhooks).where(eq(ticketWebhooks.id, webhookId));
    expect(w).toMatchObject({ lastOk: true });
    await app.db.update(ticketWebhooks).set({ active: false }).where(eq(ticketWebhooks.id, webhookId));
  });
});

// =====================================================================

describe('quem vê o quê: o painel "escolhidos"', () => {
  afterAll(async () => { await app.db.update(ticketPanels).set({ access: 'todos', memberIds: [] }).where(eq(ticketPanels.id, DEV)); });

  it('para quem não está na lista, o painel e os chamados dele não existem (404)', async () => {
    await app.db.update(ticketPanels).set({ access: 'escolhidos', memberIds: [marinaId] }).where(eq(ticketPanels.id, DEV));
    expect((await tecnico.get('/atendimento/chamados/DEV-1')).statusCode).toBe(404);
    expect((await tecnico.post('/atendimento/chamados/DEV-1/anotacoes', { texto: 'oi' })).statusCode).toBe(404);
    expect((await tecnico.get(`/atendimento/quadro?painel=${DEV}`)).statusCode).toBe(404);
    expect((await tecnico.post('/atendimento/chamados', { painelId: DEV, titulo: 'Tentativa' })).statusCode).toBe(404);
    const lista = (await tecnico.get('/atendimento/chamados?situacao=todos&pageSize=1000')).json();
    expect(lista.items.some((c: any) => c.painelId === DEV)).toBe(false);
    expect((await tecnico.get('/atendimento/opcoes')).json().paineis.map((p: any) => p.sigla)).toEqual(['SUP']);
    // quem está na lista vê; quem cuida dos chamados vê todos
    expect((await operador.get('/atendimento/chamados/DEV-1')).statusCode).toBe(200);
    expect((await s.get('/atendimento/chamados/DEV-1')).statusCode).toBe(200);
  });
});

// =====================================================================

describe('a lista e o CSV', () => {
  let l1 = { id: '', codigo: '' };
  let l2 = { id: '', codigo: '' };
  let l3 = { id: '', codigo: '' };
  beforeAll(async () => {
    l1 = await abrir(s, { titulo: 'Áudio cortando na recepção', clienteId: hospital, gravidade: 'inoperancia', alcance: 'empresa' });
    l2 = await abrir(s, { titulo: 'Fila parada', clienteId: hospital, prioridade: 'baixa' });
    l3 = await abrir(s, { titulo: 'URA não toca', clienteId: hospital, responsavelId: marinaId });
  });

  it('os filtros, a busca sem acento e o código', async () => {
    const q = async (sess: Session, qs: string) => (await sess.get(`/atendimento/chamados?${qs}`)).json().items.map((c: any) => c.codigo);
    expect((await q(s, `cliente=${hospital}`)).sort()).toEqual([l1.codigo, l2.codigo, l3.codigo].sort());
    expect(await q(s, `cliente=${hospital}&prioridade=critica`)).toEqual([l1.codigo]);
    expect(await q(s, 'q=AUDIO%20recepcao')).toEqual([l1.codigo]);
    expect((await q(s, 'q=sotero')).sort()).toEqual([l1.codigo, l2.codigo, l3.codigo].sort());
    expect(await q(s, `q=${l2.codigo.toLowerCase()}`)).toEqual([l2.codigo]);
    expect(await q(operador, `cliente=${hospital}&responsavel=eu`)).toEqual([l3.codigo]);
    expect(await q(s, `cliente=${hospital}&responsavel=ninguem&prioridade=baixa`)).toEqual([l2.codigo]);
    // o item da lista não leva o texto de busca (é só para filtrar)
    expect((await s.get(`/atendimento/chamados?cliente=${hospital}`)).json().items[0]).not.toHaveProperty('busca');
  });

  it('a ordem e a página', async () => {
    const asc = (await s.get(`/atendimento/chamados?cliente=${hospital}&sort=codigo&dir=asc`)).json().items.map((c: any) => c.codigo);
    expect(asc).toEqual([l1.codigo, l2.codigo, l3.codigo]);
    const desc = (await s.get(`/atendimento/chamados?cliente=${hospital}&sort=codigo&dir=desc`)).json().items.map((c: any) => c.codigo);
    expect(desc).toEqual([l3.codigo, l2.codigo, l1.codigo]);
    // o mais urgente primeiro (o padrão): o Crítico antes da Baixa
    const urg = (await s.get(`/atendimento/chamados?cliente=${hospital}`)).json().items.map((c: any) => c.codigo);
    expect(urg.indexOf(l1.codigo)).toBeLessThan(urg.indexOf(l2.codigo));
    const p1 = (await s.get(`/atendimento/chamados?cliente=${hospital}&sort=codigo&dir=asc&pageSize=2`)).json();
    expect(p1).toMatchObject({ total: 3, page: 1, pageSize: 2 });
    expect(p1.items.map((c: any) => c.codigo)).toEqual([l1.codigo, l2.codigo]);
    const p2 = (await s.get(`/atendimento/chamados?cliente=${hospital}&sort=codigo&dir=asc&pageSize=2&page=2`)).json();
    expect(p2.items.map((c: any) => c.codigo)).toEqual([l3.codigo]);
  });

  it('o CSV abre no Excel (BOM e ponto e vírgula) e fica na auditoria', async () => {
    const r = await s.get(`/atendimento/chamados/exportar?cliente=${hospital}&sort=codigo&dir=asc`);
    expect(r.statusCode).toBe(200);
    expect(r.headers['content-type']).toBe('text/csv; charset=utf-8');
    expect(r.headers['content-disposition']).toBe(`attachment; filename="chamados-${diaLocal(new Date())}.csv"`);
    expect(r.body.charCodeAt(0)).toBe(0xfeff);
    const linhas = r.body.slice(1).split('\r\n');
    expect(linhas[0]!.startsWith('Código;Título;Painel;Etapa;Situação;Cliente')).toBe(true);
    expect(linhas).toHaveLength(4);
    expect(linhas[1]).toContain(`${l1.codigo};Áudio cortando na recepção;Suporte;Novo;Em aberto;Hospital Soterô`);
    const a = (await s.get('/admin/audit?entityType=ticket&action=export')).json();
    expect(a.items[0].summary).toBe('Exportou 3 chamados para CSV');
  });
});

// =====================================================================

describe('o quadro', () => {
  it('uma coluna por etapa, na ordem; o mais urgente primeiro', async () => {
    const baixa = await abrir(s, { titulo: 'Pedido sem pressa', prioridade: 'baixa' });
    const critica = await abrir(s, { titulo: 'Tudo parado', gravidade: 'inoperancia', alcance: 'empresa' });
    const q = (await s.get(`/atendimento/quadro?painel=${SUP}`)).json();
    expect(q.painelId).toBe(SUP);
    expect(q.colunas.map((c: any) => c.etapa.nome)).toEqual(['Novo', 'N1', 'N2', 'N3', 'DEV', 'Em observação', 'Resolvido', 'Fechado']);
    expect(typeof q.foraDoHorario).toBe('boolean');
    const novo = q.colunas[0].chamados.map((c: any) => c.codigo);
    expect(novo.indexOf(critica.codigo)).toBeLessThan(novo.indexOf(baixa.codigo));
    const filtrado = (await s.get(`/atendimento/quadro?painel=${SUP}&prioridade=critica`)).json();
    expect(filtrado.colunas.flatMap((c: any) => c.chamados).every((c: any) => c.prioridade === 'critica')).toBe(true);
  });

  it('o Fechado mostra só os 30 fechados mais recentes e conta os escondidos', async () => {
    const agora = Date.now();
    await app.db.insert(tickets).values(Array.from({ length: 32 }, (_, i) => ({
      id: newId(), panelId: SUP, stageId: E.fechado, number: 9001 + i, code: `SUP-${9001 + i}`, title: `Antigo fechado ${i}`,
      resolvedAt: new Date(agora - i * 60_000), closedAt: new Date(agora - i * 60_000), createdAt: new Date(agora - 86_400_000),
    })));
    const q = (await s.get(`/atendimento/quadro?painel=${SUP}`)).json();
    const fechado = q.colunas.find((c: any) => c.etapa.id === E.fechado);
    expect(fechado.chamados).toHaveLength(30);
    expect(fechado.escondidos).toBe(fechado.total - 30);
    expect(fechado.total).toBeGreaterThanOrEqual(32);
    const datas = fechado.chamados.map((c: any) => c.fechadoEm);
    expect([...datas].sort().reverse()).toEqual(datas);
    expect(fechado.chamados[0].codigo).toBe('SUP-9001');
    expect((await s.get('/atendimento/quadro?painel=nao-existe')).statusCode).toBe(404);
  });
});

// =====================================================================

describe('os contatos do cliente (a aba Contatos; o Abrir chamado puxa de lá e o robô acha o cliente pelo WhatsApp)', () => {
  let maria: any;
  it('quem trabalha nos chamados inclui e edita; o Leitor só vê; o WhatsApp não se repete entre os ativos', async () => {
    const r = await operador.post(`/clients/${aurora}/contatos`, { nome: 'Maria Souza', whatsapp: '(71) 98123-4567', cargo: 'Recepção', email: '' });
    expect(r.statusCode, r.body).toBe(201);
    maria = r.json();
    expect(maria).toMatchObject({ clienteId: aurora, nome: 'Maria Souza', whatsapp: '5571981234567', cargo: 'Recepção', email: null, ativo: true });
    expect((await leitor.post(`/clients/${aurora}/contatos`, { nome: 'Outra Pessoa' })).statusCode).toBe(403);
    expect((await leitor.get(`/clients/${aurora}/contatos`)).statusCode).toBe(200);
    const dup = await s.post(`/clients/${aurora}/contatos`, { nome: 'Maria (outra)', whatsapp: '71 98123-4567' });
    expect(dup.statusCode).toBe(409);
    expect(dup.json().error).toBe('O contato Maria Souza já tem esse WhatsApp neste cliente.');
    expect((await s.post(`/clients/${aurora}/contatos`, { nome: 'João Lima', email: 'joao@' })).json().details[0].message).toBe('E-mail inválido');
    const joao = (await s.post(`/clients/${aurora}/contatos`, { nome: 'João Lima', whatsapp: '(71) 97777-1111', cargo: 'TI', email: 'joao@aurora.com.br' })).json();
    const lista = (await s.get(`/clients/${aurora}/contatos`)).json();
    expect(lista.map((c: any) => c.nome)).toEqual(['João Lima', 'Maria Souza']);
    // desativar: some do Abrir chamado e libera o WhatsApp; a auditoria diz o quê
    const des = await s.put(`/clients/${aurora}/contatos/${joao.id}`, { ...joao, ativo: false });
    expect(des.statusCode, des.body).toBe(200);
    const a = (await s.get(`/admin/audit?entityType=client&pageSize=50`)).json().items.map((i: any) => i.summary);
    expect(a).toContain('Incluiu o contato Maria Souza (Recepção) em Clínica Aurora');
    expect(a).toContain('Desativou o contato João Lima de Clínica Aurora');
    expect((await s.get(`/clients/${aurora}/contatos`)).json().map((c: any) => [c.nome, c.ativo])).toEqual([['Maria Souza', true], ['João Lima', false]]);
    const cad = (await operador.get(`/atendimento/cadastro/${aurora}`)).json();
    expect(cad.contatos.map((c: any) => c.nome)).toEqual(['Maria Souza']);
    expect((await s.put(`/clients/${aurora}/contatos/${joao.id}`, { ...joao, nome: 'João Lima Jr.', ativo: false })).statusCode).toBe(200);
    expect((await s.get(`/admin/audit?entityType=client&pageSize=50`)).json().items[0].summary).toBe('Alterou o contato João Lima Jr. de Clínica Aurora: Nome');
  });

  it('o chamado que chega só com o WhatsApp de um contato cadastrado já vem com o cliente e o nome', async () => {
    const { codigo } = await abrir(operador, { titulo: 'Ligou do celular', contatoTelefone: '71 98123-4567' });
    const f = await ficha(s, codigo);
    expect(f.cliente).toEqual({ id: aurora, nome: 'Clínica Aurora' });
    expect(f.contato).toEqual({ nome: 'Maria Souza', telefone: '5571981234567', email: null });
    // o mesmo número em dois clientes: o cliente não é adivinhado
    await s.post(`/clients/${hospital}/contatos`, { nome: 'Recepção do hospital', whatsapp: '(71) 96666-2222' });
    await s.post(`/clients/${aurora}/contatos`, { nome: 'Recepção da clínica', whatsapp: '(71) 96666-2222' });
    const outro = await ficha(s, (await abrir(operador, { titulo: 'Número dividido', contatoTelefone: '71 96666-2222' })).codigo);
    expect(outro.cliente).toBeNull();
    // ...mas com o cliente escolhido, o nome vem do contato dele
    const doHospital = await ficha(s, (await abrir(operador, { titulo: 'Do hospital', clienteId: hospital, contatoTelefone: '71 96666-2222' })).codigo);
    expect(doHospital.contato).toEqual({ nome: 'Recepção do hospital', telefone: '5571966662222', email: null });
    // a lista conta os chamados de cada WhatsApp no cliente
    expect((await s.get(`/clients/${aurora}/contatos`)).json().find((c: any) => c.nome === 'Maria Souza').chamados).toBe(1);
  });

  it('o e-mail do contato cadastrado vem junto (2.3); o escrito ao abrir vale mais', async () => {
    const r = await s.post(`/clients/${aurora}/contatos`, { nome: 'Paula Reis', whatsapp: '(71) 94444-5555', cargo: 'Financeiro', email: 'Paula@Aurora.com.br' });
    expect(r.statusCode, r.body).toBe(201);
    const f = await ficha(s, (await abrir(operador, { titulo: 'Boleto do mês', contatoTelefone: '71 94444-5555' })).codigo);
    expect(f.contato).toEqual({ nome: 'Paula Reis', telefone: '5571944445555', email: 'paula@aurora.com.br' });
    const g = await ficha(s, (await abrir(operador, { titulo: 'Boleto de novo', contatoTelefone: '71 94444-5555', contatoEmail: 'financeiro@aurora.com.br' })).codigo);
    expect(g.contato.email).toBe('financeiro@aurora.com.br');
  });

  it('o cargo vem da lista (Administração › Catálogos): fora dela não entra; o de antes fica; renomear muda os contatos', async () => {
    // os de fábrica (a migração 0022), em ordem alfabética; quem trabalha nos chamados e o Leitor veem a lista
    expect((await operador.get('/clients/cargos')).json()).toEqual([...CARGOS_DE_FABRICA].sort((a, b) => a.localeCompare(b, 'pt-BR')));
    expect((await leitor.get('/clients/cargos')).statusCode).toBe(200);
    // fora da lista não entra; escrito de outro jeito, entra como está na lista
    const fora = await operador.post(`/clients/${aurora}/contatos`, { nome: 'Pedro Alves', whatsapp: '(71) 95555-3333', cargo: 'Engenharia' });
    expect(fora.statusCode).toBe(400);
    expect(fora.json().error).toBe('O cargo "Engenharia" não está na lista (Administração › Catálogos › Cargos dos contatos).');
    const pedro = (await operador.post(`/clients/${aurora}/contatos`, { nome: 'Pedro Alves', whatsapp: '(71) 95555-3333', cargo: 'pós-vendas' })).json();
    expect(pedro.cargo).toBe('Pós-vendas');
    // o cargo de antes (de quando era escrito à mão) fica ao mudar outra coisa; trocar por outro de fora, não
    const [rita] = await app.db.insert(clientContacts).values({ id: newId(), clientId: aurora, name: 'Rita Lopes', phone: '5571944443333', role: 'Engenharia' }).returning();
    const editada = await s.put(`/clients/${aurora}/contatos/${rita!.id}`, { nome: 'Rita Lopes Souza', whatsapp: '(71) 94444-3333', cargo: 'Engenharia' });
    expect(editada.statusCode, editada.body).toBe(200);
    expect(editada.json().cargo).toBe('Engenharia');
    expect((await s.put(`/clients/${aurora}/contatos/${rita!.id}`, { nome: 'Rita Lopes Souza', cargo: 'Obras' })).statusCode).toBe(400);
    // a administração inclui um cargo, e ele passa a valer; renomear muda o dos contatos que o têm
    expect((await operador.post('/admin/catalogs/cargos', { name: 'Engenharia' })).statusCode).toBe(403);
    const eng = (await s.post('/admin/catalogs/cargos', { name: 'Engenharia' })).json();
    expect((await operador.get('/clients/cargos')).json()).toContain('Engenharia');
    const ren = await s.patch(`/admin/catalogs/cargos/${eng.id}`, { name: 'Engenharia e obras' });
    expect(ren.statusCode, ren.body).toBe(200);
    expect((await s.get(`/clients/${aurora}/contatos`)).json().find((c: any) => c.id === rita!.id).cargo).toBe('Engenharia e obras');
    const resumos = (await s.get('/admin/audit?pageSize=20')).json().items.map((i: any) => i.summary);
    expect(resumos).toContain('Adicionou "Engenharia" ao catálogo Cargos dos contatos');
    expect(resumos).toContain('Cargos dos contatos: renomeou "Engenharia" para "Engenharia e obras" (1 contato passou para o nome novo)');
    // desativado, sai da lista; quem já tem fica com ele
    const pos = (await s.get('/admin/catalogs/cargos')).json().find((x: any) => x.name === 'Pós-vendas');
    expect((await s.patch(`/admin/catalogs/cargos/${pos.id}`, { active: false })).statusCode).toBe(200);
    expect((await operador.get('/clients/cargos')).json()).not.toContain('Pós-vendas');
    expect((await s.get(`/clients/${aurora}/contatos`)).json().find((c: any) => c.id === pedro.id).cargo).toBe('Pós-vendas');
    expect((await s.get('/admin/audit?pageSize=5')).json().items[0].summary).toBe('Cargos dos contatos: desativou "Pós-vendas"');
  });
});

describe('o Meu dia', () => {
  it('os meus, os sem dono, os que espero do cliente, os que acompanho e os agendados de hoje', async () => {
    const meu = await abrir(operador, { titulo: 'Meu chamado', responsavelId: marinaId, gravidade: 'performance', alcance: 'pessoa' });
    const semDono = await abrir(s, { titulo: 'Ninguém pegou' });
    const deOutro = await abrir(s, { titulo: 'Do Bruno', responsavelId: brunoId });
    await operador.post(`/atendimento/chamados/${meu.id}/esperar`, { tipo: 'cliente', motivo: 'testar amanhã' });
    await operador.post(`/atendimento/chamados/${deOutro.id}/observar`, { observar: true });
    await app.db.insert(ticketSchedules).values({
      id: newId(), panelId: SUP, title: 'Verificar os DIDs', rule: { frequencia: 'diaria', hora: '09:00', dias: [], diaDoMes: null, data: null, soDiasDeAtendimento: false },
      nextRunAt: new Date(),
    });
    const d = (await operador.get('/atendimento/meu-dia')).json();
    const cods = (l: any[]) => l.map((c) => c.codigo);
    expect(cods(d.meus)).toContain(meu.codigo);
    expect(cods(d.meus)).not.toContain(deOutro.codigo);
    expect(cods(d.semDono)).toContain(semDono.codigo);
    expect(cods(d.esperandoCliente)).toEqual([meu.codigo]);
    expect(cods(d.observando)).toEqual([deOutro.codigo]);
    expect(d.agendadosHoje).toMatchObject([{ titulo: 'Verificar os DIDs', painelId: SUP }]);
    expect(d.abertosHoje).toBeGreaterThanOrEqual(3);
    expect(typeof d.fechadosHoje).toBe('number');
    expect(Array.isArray(d.vencendo)).toBe(true);
  });
});

describe('a tela inicial (os painéis)', () => {
  it('os números de cada painel que a pessoa vê, e o painel dos escolhidos fica de fora para os outros', async () => {
    // os testes de cima já abriram chamados no Suporte: aqui conta o que estes dois mudam
    const doSuporte = async () => ((await operador.get('/atendimento/paineis/resumo')).json() as any[]).find((x) => x.painelId === SUP);
    const antes = await doSuporte();
    const meu = await abrir(operador, { titulo: 'Meu chamado', responsavelId: marinaId });
    await abrir(s, { titulo: 'Ninguém pegou' });
    await operador.post(`/atendimento/chamados/${meu.id}/esperar`, { tipo: 'cliente', motivo: 'testar amanhã' });
    const sup = await doSuporte();
    const mais = (k: string) => sup[k] - antes[k];
    expect({ abertos: mais('abertos'), meus: mais('meus'), semDono: mais('semDono'), esperando: mais('esperando'), resolvidos: mais('resolvidos') })
      .toEqual({ abertos: 2, meus: 1, semDono: 1, esperando: 1, resolvidos: 0 });
    expect(sup.porEtapa.length).toBeGreaterThan(0);
    // as etapas contam os em aberto e os resolvidos (o Fechado não entra)
    expect(sup.porEtapa.reduce((t: number, e: any) => t + e.total, 0)).toBe(sup.abertos + sup.resolvidos);
    // um painel só dos escolhidos (sem a Marina): não aparece para ela
    const criado = await s.post('/atendimento/paineis', { nome: 'Diretoria', sigla: 'DIRX', acesso: 'escolhidos', pessoas: [], ajustes: {} });
    expect(criado.statusCode).toBe(201);
    const dir = criado.json();
    expect((await s.get('/atendimento/paineis/resumo')).json().some((x: any) => x.painelId === dir.id)).toBe(true);
    expect((await operador.get('/atendimento/paineis/resumo')).json().some((x: any) => x.painelId === dir.id)).toBe(false);
    // o painel de teste sai, para os testes de baixo verem só o Suporte e o Desenvolvimento
    await app.db.delete(ticketStages).where(eq(ticketStages.panelId, dir.id));
    await app.db.delete(ticketPanels).where(eq(ticketPanels.id, dir.id));
  });
});

// =====================================================================

describe('o cadastro do cliente (para o chamado)', () => {
  it('os produtos, as operadoras, os circuitos, os DIDs, os aparelhos, as unidades e os chamados recentes', async () => {
    const c1 = newId(); const c2 = newId(); const modelo = newId();
    await app.db.insert(subscriptions).values({ id: newId(), clientId: aurora, productId: linepbx });
    await app.db.insert(circuits).values([
      { id: c1, name: 'Link Aurora', code: 'C-1', carrierId: operadoraA, ownerClientId: aurora },
      { id: c2, name: 'Feixe 071', code: 'C-2', carrierId: operadoraB },
    ]);
    await app.db.insert(dids).values([
      { id: newId(), number: '7130340000', circuitId: c1, clientId: aurora },
      { id: newId(), number: '7130340001', circuitId: c2, clientId: aurora },
    ]);
    await app.db.insert(deviceModels).values({ id: modelo, code: 'gxp1610-teste', name: 'Grandstream GXP1610' });
    await app.db.insert(devices).values({ id: newId(), modelId: modelo, mac: '00AABBCCDDEE', clientId: aurora });
    await app.db.insert(clientUnits).values({ id: newId(), clientId: aurora, name: 'Loja Simões Filho' });
    const r = await leitor.get(`/atendimento/cadastro/${aurora}`);
    expect(r.statusCode, r.body).toBe(200);
    const c = r.json();
    expect(c.produtos.map((p: any) => p.nome)).toEqual(['LinePBX']);
    expect(c.circuitos.map((x: any) => x.nome)).toEqual(['Feixe 071', 'Link Aurora']);
    expect(c.operadoras.map((o: any) => o.id).sort()).toEqual([operadoraA, operadoraB].sort());
    expect(c.dids).toEqual([
      { id: expect.any(String), numero: '(71) 3034-0000', circuito: 'Link Aurora' },
      { id: expect.any(String), numero: '(71) 3034-0001', circuito: 'Feixe 071' },
    ]);
    expect(c.aparelhos.map((a: any) => a.nome)).toEqual(['Grandstream GXP1610 · 00:AA:BB:CC:DD:EE']);
    expect(c.unidades.map((u: any) => u.nome)).toContain('Loja Simões Filho');
    expect(c.recentes.length).toBeGreaterThan(0);
    expect(c.recentes.length).toBeLessThanOrEqual(10);
    expect(c.recentes.every((x: any) => x.cliente.id === aurora)).toBe(true);
    const criados = c.recentes.map((x: any) => x.criadoEm);
    expect([...criados].sort().reverse()).toEqual(criados);
    expect((await s.get('/atendimento/cadastro/nao-existe')).statusCode).toBe(404);
  });
});

// =====================================================================

describe('a lixeira', () => {
  let alvo = { id: '', codigo: '' };
  beforeAll(async () => { alvo = await abrir(s, { titulo: 'Aberto por engano' }); });

  it('só quem cuida dos chamados manda para a lixeira; some da lista e da ficha', async () => {
    expect((await operador.del(`/atendimento/chamados/${alvo.id}`)).statusCode).toBe(403);
    const r = await s.del(`/atendimento/chamados/${alvo.id}`);
    expect(r.statusCode).toBe(200);
    expect(r.json()).toEqual({ ok: true });
    expect((await s.get(`/atendimento/chamados/${alvo.codigo}`)).statusCode).toBe(404);
    const lista = (await s.get('/atendimento/chamados?situacao=todos&pageSize=1000')).json();
    expect(lista.items.some((c: any) => c.id === alvo.id)).toBe(false);
  });

  it('aparece na lixeira da Administração e volta de lá', async () => {
    const lixo = (await s.get('/admin/trash')).json();
    expect(lixo).toEqual(expect.arrayContaining([expect.objectContaining({ type: 'ticket', id: alvo.id, label: `${alvo.codigo} · Aberto por engano` })]));
    expect((await s.post(`/admin/trash/ticket/${alvo.id}/restore`)).statusCode).toBe(200);
    const f = await ficha(s, alvo.codigo);
    expect(eventos(f, 'lixeira').map((e: any) => e.texto)).toEqual(['mandou para a lixeira', 'restaurou da lixeira']);
  });

  it('quem não cuida dos chamados não restaura pela Administração', async () => {
    await s.del(`/atendimento/chamados/${alvo.id}`);
    // o Técnico não tem a lixeira da Administração (records.delete): 403 antes de tudo
    expect((await tecnico.post(`/admin/trash/ticket/${alvo.id}/restore`)).statusCode).toBe(403);
    expect((await s.post(`/atendimento/chamados/${alvo.id}/restaurar`, {})).statusCode).toBe(200);
  });

  it('e volta pela própria ficha; o número nunca é reaproveitado', async () => {
    await s.del(`/atendimento/chamados/${alvo.id}`);
    const r = await s.post(`/atendimento/chamados/${alvo.id}/restaurar`, {});
    expect(r.statusCode, r.body).toBe(200);
    expect(r.json().codigo).toBe(alvo.codigo);
    expect((await s.post(`/atendimento/chamados/${alvo.id}/restaurar`, {})).statusCode).toBe(400);
    const novo = await abrir(s, { titulo: 'Depois da lixeira' });
    expect(Number(novo.codigo.split('-')[1])).toBeGreaterThan(Number(alvo.codigo.split('-')[1]));
  });
});

// =====================================================================

describe('as opções da tela', () => {
  it('os painéis, as pessoas, os assuntos, as etiquetas usadas e o que a pessoa pode', async () => {
    const op = (await s.get('/atendimento/opcoes')).json();
    expect(op.paineis.map((p: any) => [p.sigla, p.etapas.length])).toEqual([['SUP', 8], ['DEV', 6]]);
    expect(op.paineis[0].abertos).toBeGreaterThan(0);
    expect(op.pessoas.map((p: any) => p.nome)).toEqual(expect.arrayContaining(['Marina Costa', 'Bruno Técnico', 'Rita Leitora']));
    expect(op.assuntos.filter((a: any) => a.painelId === SUP).map((a: any) => a.nome)).toEqual(['Ramal', 'Sem áudio']);
    expect(op.produtos.map((p: any) => p.id)).toContain(linepbx);
    expect(op.operadoras.map((o: any) => o.id)).toEqual(expect.arrayContaining([operadoraA, operadoraB]));
    // as etiquetas vêm com o painel e a cor (a que ninguém escolheu, cinza), painel por painel, em ordem de nome
    const nomes = op.etiquetas.filter((e: any) => e.painelId === SUP).map((e: any) => e.nome);
    expect(nomes).toEqual(expect.arrayContaining(['audio', 'vip']));
    expect([...nomes].sort((a: string, b: string) => a.localeCompare(b, 'pt-BR'))).toEqual(nomes);
    expect(op.etiquetas.find((e: any) => e.nome === 'vip')).toEqual({ painelId: SUP, nome: 'vip', cor: 'neutral' });
    expect(op.prazos.matriz.inoperancia.empresa).toBe('critica');
    expect(op.whatsapp).toEqual({ cliente: false, equipe: false, mensagemCliente: null });
    expect(op.ia).toEqual({ ativa: false, modelo: null });
    // as respostas prontas saíram no 2.0.1
    expect(op.respostas).toBeUndefined();
    expect(op.linechatUrl).toBeNull();
    expect(op.pode).toEqual({ trabalhar: true, cuidar: true, integrar: true });
    expect((await operador.get('/atendimento/opcoes')).json().pode).toEqual({ trabalhar: true, cuidar: false, integrar: false });
  });
});

// =====================================================================

describe('as etiquetas com cor (o pedido do Luan na prévia: escolher a cor ao criar), cada painel com as suas (2.0.3)', () => {
  const cor = async (sess: Session, nome: string, painel = SUP) =>
    (await sess.get('/atendimento/opcoes')).json().etiquetas.find((e: any) => e.nome === nome && e.painelId === painel)?.cor;
  let ficha = { id: '', codigo: '' };

  it('a nova nasce com a cor escolhida; a que já existe fica com a dela; o chamado segue o nome do catálogo', async () => {
    ficha = await abrir(operador, { titulo: 'Etiquetas com cor', etiquetas: ['Cliente VIP', 'audio'], coresDasEtiquetas: { 'cliente vip': 'bad', audio: 'roxo' } });
    expect(await cor(operador, 'Cliente VIP')).toBe('bad');
    // o "audio" já existia (cinza): a cor pedida não vale para ela
    expect(await cor(operador, 'audio')).toBe('neutral');
    // escrita de outro jeito, é a mesma; a nova sem cor escolhida nasce cinza
    const f = (await operador.patch(`/atendimento/chamados/${ficha.id}`, { etiquetas: ['cliente  vip', 'Retorno amanhã', 'Peça'], coresDasEtiquetas: { 'retorno amanha': 'ok' } })).json();
    expect(f.etiquetas).toEqual(['Cliente VIP', 'Retorno amanhã', 'Peça']);
    expect(await cor(operador, 'Retorno amanhã')).toBe('ok');
    expect(await cor(operador, 'Peça')).toBe('neutral');
    // a cor que não existe é recusada
    expect((await operador.patch(`/atendimento/chamados/${ficha.id}`, { etiquetas: ['x'], coresDasEtiquetas: { x: 'dourado' } })).statusCode).toBe(400);
  });

  it('Ajustes › Etiquetas: quem cuida cria (num painel), troca a cor (vale nos chamados do painel) e tira a que nenhum chamado usa', async () => {
    expect((await operador.get('/atendimento/etiquetas')).statusCode).toBe(403);
    expect((await operador.post('/atendimento/etiquetas', { painelId: SUP, nome: 'Teste', cor: 'ok' })).statusCode).toBe(403);
    const lista = (await s.get('/atendimento/etiquetas')).json();
    const vip = lista.find((e: any) => e.nome === 'Cliente VIP');
    expect(vip).toMatchObject({ painelId: SUP, cor: 'bad', chamados: 1 });
    // sem o painel, não cria
    expect((await s.post('/atendimento/etiquetas', { nome: 'Sem painel', cor: 'ok' })).statusCode).toBe(400);
    expect((await s.post('/atendimento/etiquetas', { painelId: 'nao-existe', nome: 'Sem painel', cor: 'ok' })).json().error).toBe('Esse painel não existe.');
    const nova = await s.post('/atendimento/etiquetas', { painelId: SUP, nome: 'Aguardando peça', cor: 'signal' });
    expect(nova.statusCode, nova.body).toBe(201);
    expect(nova.json()).toMatchObject({ painelId: SUP, nome: 'Aguardando peça', cor: 'signal', chamados: 0 });
    const dup = await s.post('/atendimento/etiquetas', { painelId: SUP, nome: 'aguardando  PECA' });
    expect(dup.statusCode).toBe(409);
    expect(dup.json().error).toBe('A etiqueta Aguardando peça já existe no Suporte.');
    // a que ninguém usa já aparece para quem vê o painel (para sugerir) — e só nele
    expect(await cor(tecnico, 'Aguardando peça')).toBe('signal');
    expect(await cor(tecnico, 'Aguardando peça', DEV)).toBeUndefined();

    const r = await s.put(`/atendimento/etiquetas/${vip.id}`, { cor: 'rosa' });
    expect(r.statusCode, r.body).toBe(200);
    expect(r.json()).toMatchObject({ nome: 'Cliente VIP', cor: 'rosa', chamados: 1 });
    expect(await cor(operador, 'Cliente VIP')).toBe('rosa');
    const resumos = (await s.get('/admin/audit?entityType=ticket_tag&pageSize=50')).json().items.map((i: any) => i.summary);
    expect(resumos).toEqual(expect.arrayContaining(['Criou a etiqueta Aguardando peça (Laranja) no painel Suporte', 'Trocou a cor da etiqueta Cliente VIP do painel Suporte: Vermelho → Rosa']));

    // a que está num chamado não sai das sugestões; a que ninguém usa sai
    const usada = await s.del(`/atendimento/etiquetas/${vip.id}`);
    expect(usada.statusCode).toBe(409);
    expect(usada.json().error).toBe('A etiqueta Cliente VIP está em 1 chamado: tire dos chamados antes.');
    expect((await s.del(`/atendimento/etiquetas/${nova.json().id}`)).statusCode).toBe(200);
    expect(await cor(tecnico, 'Aguardando peça')).toBeUndefined();
    expect((await s.put('/atendimento/etiquetas/nao-existe', { cor: 'ok' })).json().error).toBe('Etiqueta não encontrada');
  });

  it('editar a etiqueta (o pedido do Luan: o nome e a cor, como no Helena): vale nos chamados', async () => {
    const outro = await abrir(operador, { titulo: 'Outro com a etiqueta', etiquetas: ['retorno amanhã'] });
    const lista = (await s.get('/atendimento/etiquetas')).json();
    const retorno = lista.find((e: any) => e.nome === 'Retorno amanhã');
    // o operador não edita (é de quem cuida dos chamados)
    expect((await operador.put(`/atendimento/etiquetas/${retorno.id}`, { nome: 'Ligar amanhã', cor: 'ok' })).statusCode).toBe(403);
    // pelo id (Ajustes › Etiquetas): o nome e a cor juntos
    const r = await s.put(`/atendimento/etiquetas/${retorno.id}`, { nome: 'Ligar  amanhã', cor: 'turquesa' });
    expect(r.statusCode, r.body).toBe(200);
    expect(r.json()).toMatchObject({ nome: 'Ligar amanhã', cor: 'turquesa', chamados: 2 });
    expect((await s.get(`/atendimento/chamados/${ficha.id}`)).json().etiquetas).toEqual(['Cliente VIP', 'Ligar amanhã', 'Peça']);
    expect((await s.get(`/atendimento/chamados/${outro.id}`)).json().etiquetas).toEqual(['Ligar amanhã']);
    expect(await cor(operador, 'Ligar amanhã')).toBe('turquesa');
    expect(await cor(operador, 'Retorno amanhã')).toBeUndefined();
    // o nome de outra etiqueta (sem ligar para maiúscula e acento) não vale
    const dup = await s.put(`/atendimento/etiquetas/${retorno.id}`, { nome: 'peca', cor: 'ok' });
    expect(dup.statusCode).toBe(409);
    expect(dup.json().error).toBe('A etiqueta Peça já existe neste painel: escolha outro nome.');
    // pelo nome de agora (o seletor da ficha e do Abrir chamado), escrito de qualquer jeito; só a maiúscula também conta
    const p = await s.put('/atendimento/etiquetas', { painelId: SUP, de: 'LIGAR amanha', nome: 'Ligar Amanhã', cor: 'turquesa' });
    expect(p.statusCode, p.body).toBe(200);
    expect((await s.get(`/atendimento/chamados/${outro.id}`)).json().etiquetas).toEqual(['Ligar Amanhã']);
    expect((await s.put('/atendimento/etiquetas', { painelId: SUP, de: 'não existe', cor: 'ok' })).json().error).toBe('Etiqueta não encontrada');
    // no painel errado, também não acha
    expect((await s.put('/atendimento/etiquetas', { painelId: DEV, de: 'Ligar Amanhã', cor: 'ok' })).json().error).toBe('Etiqueta não encontrada');
    // a etiqueta que só está nos chamados (escrita antes do catálogo) entra nele ao editar
    await app.db.update(tickets).set({ tags: ['Antiga do Helena'] }).where(eq(tickets.id, outro.id));
    const antiga = await s.put('/atendimento/etiquetas', { painelId: SUP, de: 'antiga do helena', nome: 'Do Helena', cor: 'amarelo' });
    expect(antiga.statusCode, antiga.body).toBe(200);
    expect(antiga.json()).toMatchObject({ nome: 'Do Helena', cor: 'amarelo', chamados: 1 });
    expect((await s.get(`/atendimento/chamados/${outro.id}`)).json().etiquetas).toEqual(['Do Helena']);
    const resumos = (await s.get('/admin/audit?entityType=ticket_tag&pageSize=50')).json().items.map((i: any) => i.summary);
    expect(resumos).toEqual(expect.arrayContaining([
      'Editou a etiqueta Retorno amanhã do painel Suporte: agora Ligar amanhã, turquesa (em 2 chamados)', 'Renomeou a etiqueta Ligar amanhã do painel Suporte para Ligar Amanhã (em 2 chamados)',
      'Editou a etiqueta Antiga do Helena do painel Suporte: agora Do Helena, amarelo (em 1 chamado)',
    ]));
  });

  it('a etiqueta usada só num painel que a pessoa não vê não aparece para ela', async () => {
    await app.db.update(ticketPanels).set({ access: 'escolhidos', memberIds: [marinaId] }).where(eq(ticketPanels.id, DEV));
    try {
      await abrir(s, { painelId: DEV, titulo: 'Pedido reservado', etiquetas: ['Só da diretoria'], coresDasEtiquetas: { 'Só da diretoria': 'roxo' } });
      expect(await cor(operador, 'Só da diretoria', DEV)).toBe('roxo');
      expect(await cor(tecnico, 'Só da diretoria', DEV)).toBeUndefined();
    } finally {
      await app.db.update(ticketPanels).set({ access: 'todos', memberIds: [] }).where(eq(ticketPanels.id, DEV));
    }
  });

  it('cada painel tem as suas (2.0.3): o mesmo nome em dois painéis, cada um com a cor dele; editar num não mexe no outro', async () => {
    const sup = await abrir(operador, { titulo: 'Urgente no suporte', etiquetas: ['Urgente agora'], coresDasEtiquetas: { 'Urgente agora': 'bad' } });
    const dev = await abrir(operador, { painelId: DEV, titulo: 'Urgente no desenvolvimento', etiquetas: ['urgente  AGORA'], coresDasEtiquetas: { 'urgente  AGORA': 'roxo' } });
    // no Desenvolvimento ela nasce como foi escrita lá, com a cor de lá
    expect((await s.get(`/atendimento/chamados/${dev.id}`)).json().etiquetas).toEqual(['urgente AGORA']);
    expect(await cor(operador, 'Urgente agora')).toBe('bad');
    expect(await cor(operador, 'urgente AGORA', DEV)).toBe('roxo');
    const lista = (await s.get('/atendimento/etiquetas')).json().filter((e: any) => paraBusca(e.nome) === 'urgente agora');
    expect(lista.map((e: any) => [e.painelId, e.cor, e.chamados]).sort()).toEqual([[DEV, 'roxo', 1], [SUP, 'bad', 1]]);
    // renomear a do Suporte muda os chamados do Suporte, e só eles
    const doSup = lista.find((e: any) => e.painelId === SUP);
    expect((await s.put(`/atendimento/etiquetas/${doSup.id}`, { nome: 'Prioridade máxima', cor: 'bad' })).statusCode).toBe(200);
    expect((await s.get(`/atendimento/chamados/${sup.id}`)).json().etiquetas).toEqual(['Prioridade máxima']);
    expect((await s.get(`/atendimento/chamados/${dev.id}`)).json().etiquetas).toEqual(['urgente AGORA']);
  });

  it('o chamado que troca de painel leva as etiquetas: as que faltam lá entram com a mesma cor', async () => {
    const c = await abrir(operador, { titulo: 'Vai para o desenvolvimento', etiquetas: ['Integração ERP'], coresDasEtiquetas: { 'Integração ERP': 'turquesa' } });
    expect(await cor(operador, 'Integração ERP', DEV)).toBeUndefined();
    const r = await operador.post(`/atendimento/chamados/${c.id}/painel`, { painelId: DEV });
    expect(r.statusCode, r.body).toBe(200);
    expect((await s.get(`/atendimento/chamados/${c.id}`)).json().etiquetas).toEqual(['Integração ERP']);
    expect(await cor(operador, 'Integração ERP', DEV)).toBe('turquesa');
    // a do Suporte continua lá (outro chamado pode usar)
    expect(await cor(operador, 'Integração ERP')).toBe('turquesa');
  });
});

// =====================================================================

describe('as citações nas anotações (@: o pedido do Luan na prévia, avisa na hora quem não observa)', () => {
  const avisos = async (sess: Session) => (await sess.get('/atendimento/avisos')).json().itens as any[];

  it('quem é citado recebe o aviso, mesmo sem observar; quem escreveu, não', async () => {
    const { id, codigo } = await abrir(operador, { titulo: 'Ramal 305 sem áudio' });
    const r = await operador.post(`/atendimento/chamados/${id}/anotacoes`, {
      texto: '@Bruno Técnico, consegue olhar o SBC hoje?\nCopio a @rita leitora (e eu mesma, @Marina Costa).',
    });
    expect(r.statusCode, r.body).toBe(200);
    const f = r.json();
    expect(f.observadores).toEqual([]);
    expect(f.anotacoesLista.at(-1).citados).toEqual([{ id: brunoId, nome: 'Bruno Técnico' }, expect.objectContaining({ nome: 'Rita Leitora' })]);
    // quem pode ser citado: quem vê o painel (aqui, todos)
    expect(f.citaveis.map((p: any) => p.nome)).toEqual(expect.arrayContaining(['Administrador', 'Bruno Técnico', 'Marina Costa', 'Rita Leitora']));
    expect((await avisos(tecnico))[0]).toMatchObject({
      tipo: 'citado', texto: `Marina Costa citou você no ${codigo}: "@Bruno Técnico, consegue olhar o SBC hoje? Copio a @rita leitora (e eu mesma, @Marina Costa)."`,
      chamado: { codigo }, lido: false,
    });
    expect((await avisos(leitor))[0]).toMatchObject({ tipo: 'citado', chamado: { codigo } });
    expect((await avisos(operador)).some((a) => a.tipo === 'citado' && a.chamado?.codigo === codigo)).toBe(false);
    const a = (await s.get(`/admin/audit?entityType=ticket&entityId=${id}`)).json();
    expect(a.items[0].summary).toBe(`Anotou em ${codigo}, citando Bruno Técnico e Rita Leitora`);
  });

  it('o observador citado recebe um aviso só (o da citação); o e-mail não é citação', async () => {
    const { id, codigo } = await abrir(s, { titulo: 'Fila 2 sem música', observadores: [brunoId] });
    const antes = (await avisos(tecnico)).length;
    await operador.post(`/atendimento/chamados/${id}/anotacoes`, { texto: 'Pode ver isso, @Bruno?' });
    const depois = await avisos(tecnico);
    expect(depois.length).toBe(antes + 1);
    expect(depois[0]).toMatchObject({ tipo: 'citado', texto: `Marina Costa citou você no ${codigo}: "Pode ver isso, @Bruno?"` });
    // o e-mail (bruno@…) não cita ninguém: o observador recebe o aviso de sempre
    const f = (await operador.post(`/atendimento/chamados/${id}/anotacoes`, { texto: 'Mandei para bruno@gestor.local' })).json();
    expect(f.anotacoesLista.at(-1).citados).toEqual([]);
    expect((await avisos(tecnico))[0]).toMatchObject({ tipo: 'observador', texto: `Marina Costa anotou no ${codigo}: "Mandei para bruno@gestor.local"` });
    await s.patch(`/atendimento/chamados/${id}`, { observadores: [] });
  });

  it('quem não vê o painel não é citado (não receberia um aviso que não abre)', async () => {
    await app.db.update(ticketPanels).set({ access: 'escolhidos', memberIds: [marinaId] }).where(eq(ticketPanels.id, DEV));
    try {
      const { id } = await abrir(operador, { painelId: DEV, titulo: 'Correção reservada' });
      const antes = (await avisos(tecnico)).length;
      const f = (await operador.post(`/atendimento/chamados/${id}/anotacoes`, { texto: '@Bruno Técnico, olha isso' })).json();
      expect(f.anotacoesLista.at(-1).citados).toEqual([]);
      expect(f.citaveis.map((p: any) => p.nome)).not.toContain('Bruno Técnico');
      expect((await avisos(tecnico)).length).toBe(antes);
    } finally {
      await app.db.update(ticketPanels).set({ access: 'todos', memberIds: [] }).where(eq(ticketPanels.id, DEV));
    }
  });
});
