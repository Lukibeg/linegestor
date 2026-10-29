/**
 * Patch 2.3 — A IMPLANTAÇÃO. O pedido do Luan (28/10), mostrando o painel Ingline - Ativações do Helena: os campos da
 * curadoria, a configuração que a equipe técnica marca e os testes do suporte, um grupo para o LineChat e outro para o
 * LinePBX; e, do Comercial, "quando mover para … em processo de implantação" abrir o card e "já criar o cliente…
 * automaticamente com os produtos"; no Implantado, os módulos marcados "viram os módulos ativos na ficha do cliente".
 *
 *  - o modelo Implantação: as etapas, os 19 campos (com a parte e o produto), os módulos vindos do catálogo (escolhidos na
 *    Curadoria, o checklist na Configuração)
 *  - os campos: os módulos pedem o produto (que não muda); o mesmo nome em produtos diferentes; as caixinhas guardam quem e quando
 *  - a negociação na etapa que abre a implantação: sem CNPJ, 400 (e a janela pede); com ele, o cliente (com a Matriz), os
 *    produtos sem a data, o card ligado, o histórico dos dois e a auditoria; de novo, nada se repete; o CNPJ que já existe liga
 *  - o card no Implantado: a data de ativação dos produtos, os módulos marcados ligados, o histórico e a auditoria
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { clientUnits, clients, productModules, products, subscriptionModules, subscriptions, tickets } from '@gestor/db';
import type { CampoPersonalizado, EtapaPainel, FichaChamado, OpcoesAtendimento, Painel, QuadroAtendimento } from '@gestor/shared';
import { diaLocal } from '@gestor/shared';
import { makeApp, Session, type App } from './helpers.js';
import { esperarSegundoPlano } from '../src/services/atendimento/avisos.js';

let app: App;
let s: Session;
let adminId = '';
let imp: Painel;
let com: Painel;
let campos: CampoPersonalizado[] = [];
const produto: Record<string, string> = {};
const etapaDe = (p: Painel, nome: string): EtapaPainel => {
  const e = p.etapas.find((x) => x.nome === nome);
  if (!e) throw new Error(`sem a etapa ${nome}`);
  return e;
};
const campo = (nome: string, codigo: 'linechat' | 'linepbx') => {
  const c = campos.find((x) => x.nome === nome && x.produtoId === produto[codigo]);
  if (!c) throw new Error(`sem o campo ${nome} (${codigo})`);
  return c;
};
const ficha = async (ref: string): Promise<FichaChamado> => {
  const r = await s.get(`/atendimento/chamados/${ref}`);
  expect(r.statusCode, r.body).toBe(200);
  return r.json();
};
const auditoria = async () => ((await s.get('/admin/audit?pageSize=200')).json().items as Array<{ summary: string; entityType: string }>);

beforeAll(async () => {
  app = await makeApp();
  s = new Session(app);
  adminId = (await s.login()).id;
  for (const p of await app.db.select({ id: products.id, code: products.code }).from(products)) produto[p.code] = p.id;
  // o catálogo de teste: um módulo de cada produto que o modelo usa
  const [chat] = await app.db.select({ n: productModules.id }).from(productModules).where(eq(productModules.productId, produto.linechat!));
  expect(chat, 'o catálogo de teste tem módulos do LineChat').toBeTruthy();
});
afterAll(async () => { await esperarSegundoPlano(); await app.close(); });

describe('o modelo Implantação', () => {
  it('cria o painel de Gestão com as etapas, os campos (com a parte e o produto) e sem prazo', async () => {
    const r = await s.post('/atendimento/paineis', { nome: 'Implantação', sigla: 'imp', descricao: '', cor: 'turquesa', tipo: 'gestao', ajustes: {}, modelo: 'implantacao' });
    expect(r.statusCode, r.body).toBe(201);
    imp = r.json();
    expect(imp.etapas.map((e) => e.nome)).toEqual(['Stand By', 'Curadoria', 'Configuração', 'Testes', 'Concluído', 'Implantado']);
    expect(imp.etapas.find((e) => e.ligaNoCadastro)?.nome).toBe('Implantado');
    expect(imp.ajustes.contaPrazo).toBe(false);
    expect(imp.ajustes.camposDesligados).toEqual(expect.arrayContaining(['assunto', 'prioridade', 'relato', 'solucao']));
    const o: OpcoesAtendimento = (await s.get('/atendimento/opcoes')).json();
    campos = o.campos.filter((c) => c.painelId === imp.id);
    expect(campos).toHaveLength(19);
    // os módulos: escolhidos na Curadoria; o checklist da Configuração segue a escolha do mesmo produto
    for (const codigo of ['linechat', 'linepbx'] as const) {
      const escolha = campo('Módulos a ativar', codigo);
      expect(escolha).toMatchObject({ parte: 'Curadoria', escolhidosEm: null });
      expect(campo('Ativação dos módulos', codigo)).toMatchObject({ parte: 'Configuração', escolhidosEm: escolha.id });
    }
    expect(campos.some((c) => c.nome === 'CRM usado')).toBe(false);
    expect([...new Set(campos.map((c) => c.parte))]).toEqual(['Curadoria', 'Configuração', 'Testes']);
    // o mesmo nome nos dois produtos
    expect(campos.filter((c) => c.nome === 'Horário de atendimento').map((c) => c.produtoId).sort()).toEqual([produto.linechat, produto.linepbx].sort());
    // os módulos vêm do catálogo do produto
    const mods = campo('Módulos a ativar', 'linechat');
    const doCatalogo = await app.db.select({ id: productModules.id }).from(productModules).where(eq(productModules.productId, produto.linechat!));
    expect(mods.opcoes.map((x) => x.id).sort()).toEqual(doCatalogo.map((x) => x.id).sort());
    const auds = await auditoria();
    expect(auds.some((a) => a.summary.startsWith('Criou o painel Implantação (IMP, pelo modelo Implantação)'))).toBe(true);
  });

  it('os campos: os módulos pedem o produto, que não muda; o nome repete só em outro produto', async () => {
    const semProduto = await s.post(`/atendimento/paineis/${imp.id}/campos`, { nome: 'Mais módulos', tipo: 'modulos' });
    expect(semProduto.statusCode).toBe(400);
    const igual = await s.post(`/atendimento/paineis/${imp.id}/campos`, { nome: 'Lista de usuários', tipo: 'texto', parte: 'Curadoria', produtoId: produto.linechat });
    expect(igual.statusCode).toBe(409);
    const noOutro = await s.post(`/atendimento/paineis/${imp.id}/campos`, { nome: 'Lista de usuários', tipo: 'texto', parte: 'Curadoria', produtoId: produto.voicenet });
    expect(noOutro.statusCode, noOutro.body).toBe(201);
    const m = campo('Módulos a ativar', 'linepbx');
    const troca = await s.put(`/atendimento/campos/${m.id}`, { nome: m.nome, tipo: 'modulos', parte: m.parte, produtoId: produto.linechat });
    expect(troca.statusCode).toBe(400);
    expect(troca.json().error).toMatch(/produto dos módulos não muda/);
    // o checklist dos módulos segue um campo de módulos do mesmo produto, que seja a escolha
    const base = { tipo: 'modulos', parte: 'Configuração', produtoId: produto.linepbx };
    expect((await s.post(`/atendimento/paineis/${imp.id}/campos`, { ...base, nome: 'Checklist X', escolhidosEm: campo('Módulos a ativar', 'linechat').id })).statusCode).toBe(400);
    expect((await s.post(`/atendimento/paineis/${imp.id}/campos`, { ...base, nome: 'Checklist X', escolhidosEm: campo('Configuração do ambiente', 'linepbx').id })).statusCode).toBe(400);
    expect((await s.post(`/atendimento/paineis/${imp.id}/campos`, { ...base, nome: 'Checklist X', escolhidosEm: campo('Ativação dos módulos', 'linepbx').id })).statusCode).toBe(400);
    const checklist = await s.post(`/atendimento/paineis/${imp.id}/campos`, { ...base, nome: 'Checklist X', escolhidosEm: campo('Módulos a ativar', 'linepbx').id });
    expect(checklist.statusCode, checklist.body).toBe(201);
    expect(checklist.json().escolhidosEm).toBe(campo('Módulos a ativar', 'linepbx').id);
    // a escolha que alguém segue não vira checklist
    const escolha = campo('Módulos a ativar', 'linepbx');
    const vira = await s.put(`/atendimento/campos/${escolha.id}`, { nome: escolha.nome, tipo: 'modulos', parte: escolha.parte, produtoId: produto.linepbx, escolhidosEm: checklist.json().id });
    expect(vira.statusCode).toBe(400);
    await s.put(`/atendimento/campos/${checklist.json().id}`, { ...base, nome: 'Checklist X', escolhidosEm: escolha.id, ativo: false });
    // desativa o de teste (o painel volta aos 19)
    await s.put(`/atendimento/campos/${noOutro.json().id}`, { nome: 'Lista de usuários', tipo: 'texto', parte: 'Curadoria', produtoId: produto.voicenet, ativo: false });
  });

  it('a etapa que abre a implantação aponta para um painel de Gestão', async () => {
    const etapas = (nomes: Array<[string, string, Record<string, unknown>?]>) => nomes.map(([nome, tipo, extra]) => ({ nome, tipo, ...(extra ?? {}) }));
    const errado = await s.post('/atendimento/paineis', {
      nome: 'Vendas X', sigla: 'vx', descricao: '', cor: 'ok', tipo: 'vendas', ajustes: {},
      etapas: etapas([['Lead', 'entrada'], ['Ganho', 'fechado', { resultado: 'ganho' }], ['Perdido', 'fechado', { resultado: 'perdido' }]]),
    });
    expect(errado.statusCode, errado.body).toBe(201);
    const vx: Painel = errado.json();
    const r = await s.put(`/atendimento/paineis/${vx.id}/etapas`, {
      etapas: [...vx.etapas.map((e) => ({ ...e })), { nome: 'Em implantação', tipo: 'andamento', abreImplantacao: vx.id }],
    });
    expect(r.statusCode).toBe(400);
    const c = await s.post('/atendimento/paineis', {
      nome: 'Comercial', sigla: 'cig', descricao: '', cor: 'signal', tipo: 'vendas', ajustes: {},
      etapas: etapas([
        ['Lead', 'entrada'], ['Proposta', 'andamento'], ['Em processo de Implantação', 'andamento', { abreImplantacao: imp.id }],
        // a que recebe a negociação quando a implantação termina (o card no Implantado)
        ['Implantado', 'andamento', { recebeImplantacao: true }],
        ['Ganho', 'fechado', { resultado: 'ganho' }], ['Perdido', 'fechado', { resultado: 'perdido' }],
      ]),
    });
    expect(c.statusCode, c.body).toBe(201);
    com = c.json();
    expect(etapaDe(com, 'Em processo de Implantação').abreImplantacao).toBe(imp.id);
    // o Ganho não abre (a etapa que fecha fica sem)
    expect(etapaDe(com, 'Ganho').abreImplantacao ?? null).toBeNull();
    expect(com.etapas.filter((e) => e.recebeImplantacao).map((e) => e.nome)).toEqual(['Implantado']);
    // uma etapa só recebe a negociação no fim da implantação
    const duas = await s.put(`/atendimento/paineis/${com.id}/etapas`, {
      etapas: com.etapas.map((e) => ({ ...e, recebeImplantacao: e.nome === 'Implantado' || e.nome === 'Proposta' })),
    });
    expect(duas.statusCode).toBe(400);
    expect(duas.json().error).toMatch(/Só uma etapa recebe a negociação/);
  });
});

let neg = { id: '', codigo: '' };
let card = { id: '', codigo: '' };
let clienteId = '';

describe('a negociação que abre a implantação', () => {
  it('sem o CNPJ, não vai (a janela pede); o plano diz o cliente, os produtos e o card', async () => {
    const r = await s.post('/atendimento/chamados', {
      painelId: com.id, titulo: '', empresa: 'Padaria Sol', produtos: [produto.linechat, produto.linepbx], responsavelId: adminId, descricao: 'Duas lojas e o delivery.',
    });
    expect(r.statusCode, r.body).toBe(201);
    neg = r.json();
    const para = etapaDe(com, 'Em processo de Implantação');
    const plano = await s.get(`/atendimento/chamados/${neg.id}/ao-mover?etapaId=${para.id}`);
    expect(plano.statusCode, plano.body).toBe(200);
    expect(plano.json().implantacao).toMatchObject({
      painel: { sigla: 'IMP' }, etapa: 'Curadoria', titulo: 'Implantação — Padaria Sol', jaAberta: null,
      cliente: { tipo: 'novo', nomeFantasia: 'Padaria Sol', cnpj: null }, falta: 'Para criar o cliente, falta o CNPJ.',
    });
    expect(plano.json().cadastro).toBeNull();
    const m = await s.post(`/atendimento/chamados/${neg.id}/mover`, { etapaId: para.id });
    expect(m.statusCode).toBe(400);
    expect(m.json().details.implantacao.falta).toMatch(/CNPJ/);
    // nada mudou: a negociação continua no Lead
    expect((await ficha(neg.id)).etapaId).toBe(etapaDe(com, 'Lead').id);
    const errado = await s.post(`/atendimento/chamados/${neg.id}/mover`, { etapaId: para.id, implantacao: { cnpj: '11.222.333/0001' } });
    expect(errado.statusCode).toBe(400);
    expect(errado.json().error).toBe('O CNPJ tem 14 números: faltam 2.');
    // o dígito verificador não é conferido na janela: os 14 números bastam
    const semConferir = await s.get(`/atendimento/chamados/${neg.id}/ao-mover?etapaId=${para.id}&cnpj=${encodeURIComponent('11.222.333/0001-80')}`);
    expect(semConferir.json().implantacao).toMatchObject({ cliente: { tipo: 'novo', cnpj: '11222333000180', erro: null }, falta: null });
  });

  it('com o CNPJ: o cliente (com a Matriz), os produtos sem a data, o card ligado e o histórico dos dois', async () => {
    const para = etapaDe(com, 'Em processo de Implantação');
    const r = await s.post(`/atendimento/chamados/${neg.id}/mover`, { etapaId: para.id, implantacao: { cnpj: '11.222.333/0001-81', razaoSocial: 'Sol Pães e Doces Ltda' } });
    expect(r.statusCode, r.body).toBe(200);
    const f: FichaChamado = r.json();
    expect(f.cliente?.nome).toBe('Padaria Sol');
    expect(f.empresa).toBeNull();
    // o título era o nome da empresa: acompanha
    expect(f.titulo).toBe('Padaria Sol');
    expect(f.implantacoes).toHaveLength(1);
    card = { id: f.implantacoes[0]!.id, codigo: f.implantacoes[0]!.codigo };
    expect(f.implantacoes[0]).toMatchObject({ codigo: 'IMP-1', etapa: 'Curadoria', painel: 'Implantação', situacao: 'aberto' });
    expect(f.historico.map((e) => e.texto)).toContain('abriu a implantação IMP-1 no painel Implantação (criou o cliente Padaria Sol; LineChat e LinePBX no cadastro)');
    clienteId = f.cliente!.id;

    const [cli] = await app.db.select().from(clients).where(eq(clients.id, clienteId));
    expect(cli).toMatchObject({ tradeName: 'Padaria Sol', legalName: 'Sol Pães e Doces Ltda', cnpj: '11222333000181' });
    expect(await app.db.select().from(clientUnits).where(and(eq(clientUnits.clientId, clienteId), eq(clientUnits.isMain, true)))).toHaveLength(1);
    const subs = await app.db.select().from(subscriptions).where(eq(subscriptions.clientId, clienteId));
    expect(subs.map((x) => x.productId).sort()).toEqual([produto.linechat, produto.linepbx].sort());
    expect(subs.every((x) => x.activatedAt === null && x.deactivatedAt === null)).toBe(true);

    const c = await ficha(card.id);
    expect(c).toMatchObject({ titulo: 'Implantação — Padaria Sol', origem: 'comercial', cliente: { id: clienteId } });
    expect(c.produtos.map((p) => p.id).sort()).toEqual([produto.linechat, produto.linepbx].sort());
    expect(c.descricao).toBe(`Da negociação ${neg.codigo}.\nDuas lojas e o delivery.`);
    expect(c.observadores.map((p) => p.id)).toEqual([adminId]);
    expect(c.daNegociacao).toMatchObject({ id: neg.id, codigo: neg.codigo, podeAbrir: true });
    expect(c.historico.map((e) => e.texto)).toEqual(expect.arrayContaining(['abriu o chamado (Aberta pelo Comercial) em Curadoria', `veio da negociação ${neg.codigo} (Padaria Sol)`]));
    const auds = await auditoria();
    expect(auds.map((a) => a.summary)).toEqual(expect.arrayContaining([
      `Criou o cliente Padaria Sol (CNPJ 11222333000181) pela negociação ${neg.codigo}, ao abrir a implantação`,
      `Abriu IMP-1 "Implantação — Padaria Sol" no painel Implantação, pela negociação ${neg.codigo}`,
      `Pôs LineChat, LinePBX no cadastro de Padaria Sol (em implantação, sem a data de ativação), pela negociação ${neg.codigo}`,
    ]));
    expect(auds.find((a) => a.summary.startsWith(`Moveu ${neg.codigo} de Lead para Em processo de Implantação`))?.summary).toMatch(/abriu a implantação IMP-1 e criou o cliente Padaria Sol/);
  });

  it('de novo, nada se repete: a negociação já abriu a implantação', async () => {
    await s.post(`/atendimento/chamados/${neg.id}/mover`, { etapaId: etapaDe(com, 'Proposta').id });
    const plano = (await s.get(`/atendimento/chamados/${neg.id}/ao-mover?etapaId=${etapaDe(com, 'Em processo de Implantação').id}`)).json();
    expect(plano.implantacao.jaAberta).toEqual({ codigo: 'IMP-1' });
    const r = await s.post(`/atendimento/chamados/${neg.id}/mover`, { etapaId: etapaDe(com, 'Em processo de Implantação').id });
    expect(r.statusCode, r.body).toBe(200);
    expect(await app.db.select().from(tickets).where(eq(tickets.sourceTicketId, neg.id))).toHaveLength(1);
    expect(await app.db.select().from(clients).where(eq(clients.cnpj, '11222333000181'))).toHaveLength(1);
  });

  it('o CNPJ que já é de um cliente liga a negociação a ele; o cliente da negociação também', async () => {
    const r = await s.post('/atendimento/chamados', { painelId: com.id, titulo: 'Mais lojas', empresa: 'Sol (filial)', produtos: [produto.linechat], campos: { CNPJ: '11222333000181' } });
    expect(r.statusCode, r.body).toBe(201);
    const outra = r.json();
    const para = etapaDe(com, 'Em processo de Implantação');
    const plano = (await s.get(`/atendimento/chamados/${outra.id}/ao-mover?etapaId=${para.id}`)).json();
    expect(plano.implantacao.cliente).toEqual({ tipo: 'cadastro', id: clienteId, nome: 'Padaria Sol', peloCnpj: true });
    expect(plano.implantacao.produtos).toEqual([{ id: produto.linechat, nome: 'LineChat', jaNoCadastro: true }]);
    const m = await s.post(`/atendimento/chamados/${outra.id}/mover`, { etapaId: para.id });
    expect(m.statusCode, m.body).toBe(200);
    expect((m.json() as FichaChamado).cliente?.id).toBe(clienteId);
    // o LineChat já estava no cadastro: não entra de novo
    expect(await app.db.select().from(subscriptions).where(eq(subscriptions.clientId, clienteId))).toHaveLength(2);
    expect((m.json() as FichaChamado).implantacoes[0]).toMatchObject({ codigo: 'IMP-2', painelId: imp.id, podeAbrir: true });
  });

  it('o CNPJ de um cliente na lixeira: não cria outro (o CNPJ não repete); a janela diz para restaurar', async () => {
    await app.db.insert(clients).values({ id: 'cli-lixeira', tradeName: 'Velha Cliente', legalName: 'Velha Cliente Ltda', cnpj: '34567890000130', archived: false, deletedAt: new Date() });
    const r = await s.post('/atendimento/chamados', { painelId: com.id, titulo: 'Voltou', empresa: 'Velha Cliente', produtos: [produto.linepbx] });
    expect(r.statusCode, r.body).toBe(201);
    const para = etapaDe(com, 'Em processo de Implantação');
    const m = await s.post(`/atendimento/chamados/${r.json().id}/mover`, { etapaId: para.id, implantacao: { cnpj: '34.567.890/0001-30' } });
    expect(m.statusCode, m.body).toBe(400);
    expect(m.json().error).toMatch(/Velha Cliente, que está na lixeira/);
    expect(await app.db.select().from(clients).where(eq(clients.cnpj, '34567890000130'))).toHaveLength(1);
  });
});

describe('o card da implantação', () => {
  it('as caixinhas guardam quem marcou e quando; o histórico diz o que foi marcado e desmarcado', async () => {
    const conf = campo('Configuração do ambiente', 'linechat');
    const [a, b] = conf.opcoes;
    const r = await s.patch(`/atendimento/chamados/${card.id}`, { campos: { [conf.id]: [a!.id, b!.id] } });
    expect(r.statusCode, r.body).toBe(200);
    const f: FichaChamado = r.json();
    expect(Object.keys(f.marcas[conf.id] ?? {}).sort()).toEqual([a!.id, b!.id].sort());
    expect(f.marcas[conf.id]![a!.id]).toMatchObject({ porId: adminId, porNome: null });
    expect(f.historico.map((e) => e.texto)).toContain(`marcou em Configuração do ambiente (LineChat): ${a!.nome}, ${b!.nome}`);
    const r2 = await s.patch(`/atendimento/chamados/${card.id}`, { campos: { [conf.id]: [a!.id] } });
    const f2: FichaChamado = r2.json();
    expect(Object.keys(f2.marcas[conf.id] ?? {})).toEqual([a!.id]);
    expect(f2.marcas[conf.id]![a!.id]!.em).toBe(f.marcas[conf.id]![a!.id]!.em);
    expect(f2.historico.map((e) => e.texto)).toContain(`desmarcou em Configuração do ambiente (LineChat): ${b!.nome}`);
    // o texto longo do produto também leva o nome dele
    const usuarios = campo('Lista de usuários', 'linechat');
    const r3 = await s.patch(`/atendimento/chamados/${card.id}`, { campos: { [usuarios.id]: 'Ana (vendas)\nBeto (suporte)' } });
    expect((r3.json() as FichaChamado).historico.map((e) => e.texto)).toContain('editou Lista de usuários (LineChat)');
  });

  it('o cartão conta cada parte (só a dos produtos do card)', async () => {
    const q: QuadroAtendimento = (await s.get(`/atendimento/quadro?painel=${imp.id}`)).json();
    const c = q.colunas.flatMap((x) => x.chamados).find((x) => x.id === card.id)!;
    expect(c.partes.map((p) => p.parte)).toEqual(['Curadoria', 'Configuração', 'Testes']);
    // a curadoria: 5 do LineChat + 6 do LinePBX (os módulos escolhidos não contam), com a lista de usuários escrita; a
    // configuração: 5 + 10 caixinhas, 1 marcada (o checklist dos módulos, sem módulo escolhido, não conta nada)
    expect(c.partes[0]).toEqual({ parte: 'Curadoria', feitos: 1, total: 11 });
    expect(c.partes[1]).toEqual({ parte: 'Configuração', feitos: 1, total: 15 });
    expect(c.partes[2]).toEqual({ parte: 'Testes', feitos: 0, total: 8 });
  });

  it('no Implantado: os produtos ganham a data e os módulos marcados ficam ligados', async () => {
    const mods = campo('Módulos a ativar', 'linechat');
    const modulo = mods.opcoes.find((o) => o.ativa)!;
    expect((await s.patch(`/atendimento/chamados/${card.id}`, { campos: { [mods.id]: [modulo.id] } })).statusCode).toBe(200);
    // sair da Curadoria (a entrada) pede o responsável
    expect((await s.post(`/atendimento/chamados/${card.id}/mover`, { etapaId: etapaDe(imp, 'Configuração').id, responsavelId: adminId })).statusCode).toBe(200);
    const validado = etapaDe(imp, 'Implantado');
    const plano = (await s.get(`/atendimento/chamados/${card.id}/ao-mover?etapaId=${validado.id}`)).json();
    expect(plano.implantacao).toBeNull();
    expect(plano.cadastro).toMatchObject({
      etapa: 'Implantado', dia: diaLocal(new Date()), cliente: { id: clienteId, nome: 'Padaria Sol' },
      modulos: [{ id: modulo.id, acao: 'liga', produto: 'LineChat' }],
    });
    expect(plano.cadastro.produtos.map((p: { acao: string }) => p.acao)).toEqual(['ativa', 'ativa']);
    // o escolhido na Curadoria que o checklist da Configuração ainda não marcou: a janela avisa (não trava)
    expect(plano.cadastro.semMarcar).toEqual([{ id: modulo.id, nome: modulo.nome, produto: 'LineChat', campo: 'Ativação dos módulos' }]);
    // a negociação vai junto para o Implantado do Comercial
    expect(plano.negociacao).toEqual({ id: neg.id, codigo: neg.codigo, titulo: 'Padaria Sol', de: 'Em processo de Implantação', para: 'Implantado' });
    const r = await s.post(`/atendimento/chamados/${card.id}/mover`, { etapaId: validado.id });
    expect(r.statusCode, r.body).toBe(200);
    const subs = await app.db.select().from(subscriptions).where(eq(subscriptions.clientId, clienteId));
    const dia = diaLocal(new Date());
    expect(subs.every((x) => x.activatedAt?.toISOString() === `${dia}T12:00:00.000Z`)).toBe(true);
    const chat = subs.find((x) => x.productId === produto.linechat)!;
    const ligados = await app.db.select().from(subscriptionModules).where(eq(subscriptionModules.subscriptionId, chat.id));
    expect(ligados.map((x) => [x.moduleId, x.deactivatedAt])).toEqual([[modulo.id, null]]);
    const f: FichaChamado = r.json();
    expect(f.historico.map((x) => x.texto)).toEqual(expect.arrayContaining([
      `ligou no cadastro de Padaria Sol os produtos LineChat e LinePBX e o módulo ${modulo.nome} (LineChat), desde ${dia.split('-').reverse().join('/')}`,
      `a negociação ${neg.codigo} foi para Implantado`,
    ]));
    const n = await ficha(neg.id);
    expect(n.etapaId).toBe(etapaDe(com, 'Implantado').id);
    expect(n.historico.at(-1)!.texto).toMatch(new RegExp(`Implantado: a implantação ${card.codigo} terminou`));
    const auds = await auditoria();
    expect(auds.some((a) => a.entityType === 'client' && a.summary.startsWith('Ligou no cadastro de Padaria Sol LineChat, LinePBX e os módulos'))).toBe(true);
    expect(auds.some((a) => a.summary === `Moveu ${neg.codigo} de Em processo de Implantação para Implantado: a implantação ${card.codigo} terminou`)).toBe(true);
    // a ficha do cliente mostra o produto ativo, com a data
    const cli = (await s.get(`/clients/${clienteId}`)).json();
    expect(JSON.stringify(cli)).toContain(modulo.nome);
  });

  it('de novo no Implantado (reaberto e implantado outra vez): o cadastro já estava em dia', async () => {
    expect((await s.post(`/atendimento/chamados/${card.id}/mover`, { etapaId: etapaDe(imp, 'Testes').id })).statusCode).toBe(200);
    // a negociação já está no Implantado: nada a levar
    expect((await s.get(`/atendimento/chamados/${card.id}/ao-mover?etapaId=${etapaDe(imp, 'Implantado').id}`)).json().negociacao).toBeNull();
    const r = await s.post(`/atendimento/chamados/${card.id}/mover`, { etapaId: etapaDe(imp, 'Implantado').id });
    expect(r.statusCode, r.body).toBe(200);
    expect((r.json() as FichaChamado).historico.at(-1)!.texto).toBe('chegou em Implantado: o cadastro de Padaria Sol já estava em dia');
  });
});

describe('as caixinhas em pastas (2.3)', () => {
  it('o modelo traz a Configuração do LinePBX em pastas; o Editar as caixinhas muda as caixinhas e as pastas, e só elas', async () => {
    const conf = campo('Configuração do ambiente', 'linepbx');
    const pasta = (nome: string) => conf.opcoes.filter((o) => o.pasta === nome).map((o) => o.nome);
    expect([...new Set(conf.opcoes.map((o) => o.pasta))]).toEqual(['Servidor', 'Asterisk', 'LinePBX Web', 'Módulos', 'Telefones']);
    expect(pasta('Asterisk')).toEqual(['Configuração dos ramais', 'Configuração da rota de entrada', 'Configuração das URAs e filas', 'Configuração do FHA', 'Alinhamento do tronco']);
    expect(pasta('Módulos')).toEqual(['Instalação do LineReports']);
    // renomeia uma, leva outra para uma pasta nova, inclui uma no Asterisk e tira a dos telefones
    const id = (nome: string) => conf.opcoes.find((o) => o.nome === nome)!.id;
    const opcoes = conf.opcoes.filter((o) => o.nome !== 'Configuração dos telefones').map((o) => ({
      id: o.id, nome: o.nome === 'Configuração dos ramais' ? 'Ramais' : o.nome, ativa: true, pasta: o.nome === 'Alinhamento do tronco' ? 'Operadora' : o.pasta,
    }));
    opcoes.splice(6, 0, { nome: 'Configuração do Callback', ativa: true, pasta: 'Asterisk' } as (typeof opcoes)[number]);
    const r = await s.put(`/atendimento/campos/${conf.id}/caixinhas`, { opcoes });
    expect(r.statusCode, r.body).toBe(200);
    const depois: CampoPersonalizado = r.json();
    expect(depois.opcoes.find((o) => o.id === id('Configuração dos ramais'))).toMatchObject({ nome: 'Ramais', pasta: 'Asterisk', ativa: true });
    expect(depois.opcoes.find((o) => o.id === id('Alinhamento do tronco'))!.pasta).toBe('Operadora');
    expect(depois.opcoes.find((o) => o.nome === 'Configuração do Callback')).toMatchObject({ pasta: 'Asterisk', ativa: true });
    expect(depois.opcoes.find((o) => o.id === id('Configuração dos telefones'))).toMatchObject({ ativa: false, pasta: 'Telefones' });
    // o resto do campo fica como estava
    expect(depois).toMatchObject({ nome: conf.nome, parte: conf.parte, produtoId: conf.produtoId, dica: conf.dica, ativo: true });
    const auds = await auditoria();
    expect(auds.map((a) => a.summary)).toContain(
      'Mudou as caixinhas de Configuração do ambiente (LinePBX) no painel Implantação: incluiu Configuração do Callback (Asterisk); renomeou Configuração dos ramais para Ramais; '
      + 'levou Alinhamento do tronco para a pasta Operadora; desativou Configuração dos telefones',
    );
  });

  it('a caixinha que o card já marcou continua marcada nele, desativada; os outros campos e quem não cuida, não', async () => {
    const conf = campo('Configuração do ambiente', 'linechat');
    const marcada = conf.opcoes[0]!;
    expect((await ficha(card.id)).campos[conf.id]).toContain(marcada.id);
    const r = await s.put(`/atendimento/campos/${conf.id}/caixinhas`, { opcoes: conf.opcoes.slice(1).map((o) => ({ id: o.id, nome: o.nome })) });
    expect(r.statusCode, r.body).toBe(200);
    expect((r.json() as CampoPersonalizado).opcoes.find((o) => o.id === marcada.id)!.ativa).toBe(false);
    expect((await ficha(card.id)).campos[conf.id]).toContain(marcada.id);
    // só as caixinhas
    const mods = campo('Módulos a ativar', 'linechat');
    expect((await s.put(`/atendimento/campos/${mods.id}/caixinhas`, { opcoes: [{ nome: 'X' }] })).statusCode).toBe(400);
    expect((await s.put(`/atendimento/campos/${conf.id}/caixinhas`, { opcoes: [{ id: marcada.id, nome: marcada.nome, ativa: false }] })).statusCode).toBe(400);
    expect((await s.put(`/atendimento/campos/${conf.id}/caixinhas`, { opcoes: [{ nome: 'A' }, { nome: 'a' }] })).statusCode).toBe(400);
    // quem só trabalha nos chamados não muda as caixinhas
    const papeis = (await s.get('/admin/roles')).json() as Array<{ id: string; key: string }>;
    await s.post('/admin/users', { name: 'Marina Costa', email: 'marina.imp@gestor.local', password: 'SenhaDeTeste!123', roleId: papeis.find((x) => x.key === 'operador')!.id });
    const operador = new Session(app);
    await operador.login('marina.imp@gestor.local', 'SenhaDeTeste!123');
    expect((await operador.put(`/atendimento/campos/${conf.id}/caixinhas`, { opcoes: [{ nome: 'X' }] })).statusCode).toBe(403);
  });
});

describe('os anexos dos campos e das caixinhas (2.3)', () => {
  // um PNG de 1 pixel e um PDF mínimo
  const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  const PDF = `data:application/pdf;base64,${Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF').toString('base64')}`;
  const anexar = (ss: Session, campoId: string, opcaoId: string | null, nome: string, conteudo = PNG) =>
    ss.post(`/atendimento/chamados/${card.id}/campos/${campoId}/anexos`, { opcaoId, anexos: [{ fileName: nome, conteudo }] });

  it('anexa no campo todo e numa caixinha; a ficha mostra, o histórico conta e o arquivo abre', async () => {
    const conf = (await s.get('/atendimento/opcoes')).json().campos.find((c: CampoPersonalizado) => c.id === campo('Configuração do ambiente', 'linepbx').id) as CampoPersonalizado;
    const ramais = conf.opcoes.find((o) => o.nome === 'Ramais')!;
    const r = await anexar(s, conf.id, ramais.id, 'print dos ramais.png');
    expect(r.statusCode, r.body).toBe(200);
    const f: FichaChamado = r.json();
    expect(f.anexosDosCampos).toHaveLength(1);
    expect(f.anexosDosCampos[0]).toMatchObject({ campoId: conf.id, opcaoId: ramais.id, nome: 'print dos ramais.png', imagem: true, podeTirar: true, por: { id: adminId } });
    expect(f.historico.at(-1)!.texto).toBe('anexou print dos ramais.png em Configuração do ambiente (LinePBX) › Ramais');
    const lista = campo('Lista de ramais', 'linepbx');
    const r2 = await anexar(s, lista.id, null, 'ramais.pdf', PDF);
    expect(r2.statusCode, r2.body).toBe(200);
    const pdf = (r2.json() as FichaChamado).anexosDosCampos.find((a) => a.nome === 'ramais.pdf')!;
    expect(pdf).toMatchObject({ campoId: lista.id, opcaoId: null, imagem: false, tipo: 'application/pdf' });
    // o anexo do campo não vira anotação
    expect((r2.json() as FichaChamado).anotacoesLista.flatMap((n) => n.anexos)).toHaveLength(0);
    const arquivo = await s.get(`/atendimento/anexos/${f.anexosDosCampos[0]!.id}`);
    expect(arquivo.statusCode).toBe(200);
    expect(arquivo.headers['content-type']).toMatch(/image\/png/);
    expect((await auditoria()).map((a) => a.summary)).toContain(`Anexou print dos ramais.png em Configuração do ambiente (LinePBX) › Ramais (${card.codigo})`);
  });

  it('a caixinha de outro campo, o campo desativado ou de outro painel não recebem; até 20 em cada', async () => {
    const conf = campo('Configuração do ambiente', 'linepbx');
    const outra = campo('Configuração do ambiente', 'linechat').opcoes[1]!;
    expect((await anexar(s, conf.id, outra.id, 'x.png')).statusCode).toBe(400);
    const desativado = (await s.get('/atendimento/opcoes')).json().campos.find((c: CampoPersonalizado) => c.painelId === imp.id && !c.ativo) as CampoPersonalizado;
    expect((await anexar(s, desativado.id, null, 'x.png')).statusCode).toBe(400);
    const doComercial = (await s.get('/atendimento/opcoes')).json().campos.find((c: CampoPersonalizado) => c.painelId === com.id);
    if (doComercial) expect((await anexar(s, doComercial.id, null, 'x.png')).statusCode).toBe(404);
    // o limite: a caixinha dos testes recebe 20, a 21ª não
    const testes = campo('Testes realizados', 'linechat');
    const op = testes.opcoes[0]!;
    for (let i = 0; i < 4; i++) {
      const lote = await s.post(`/atendimento/chamados/${card.id}/campos/${testes.id}/anexos`, { opcaoId: op.id, anexos: Array.from({ length: 5 }, (_, j) => ({ fileName: `t${i}-${j}.png`, conteudo: PNG })) });
      expect(lote.statusCode, lote.body).toBe(200);
    }
    const demais = await anexar(s, testes.id, op.id, 'a mais.png');
    expect(demais.statusCode).toBe(400);
    expect(demais.json().error).toMatch(/cabem até 20/);
    // nas caixinhas, o anexo vai na caixinha: o campo todo não recebe ("nas configurações n precisa de ter anexar")
    const noCampo = await anexar(s, testes.id, null, 'do campo.png');
    expect(noCampo.statusCode).toBe(400);
    expect(noCampo.json().error).toBe('Nas caixinhas, o anexo vai na caixinha: use o clipe ao lado dela.');
  });

  it('tirar: o seu, ou qualquer um se cuida dos chamados; o arquivo deixa de abrir', async () => {
    const papeis = (await s.get('/admin/roles')).json() as Array<{ id: string; key: string }>;
    await s.post('/admin/users', { name: 'Bruno Técnico', email: 'bruno.imp@gestor.local', password: 'SenhaDeTeste!123', roleId: papeis.find((x) => x.key === 'operador')!.id });
    const bruno = new Session(app);
    await bruno.login('bruno.imp@gestor.local', 'SenhaDeTeste!123');
    const lista = campo('Lista de ramais', 'linepbx');
    const dele = await anexar(bruno, lista.id, null, 'do bruno.png');
    expect(dele.statusCode, dele.body).toBe(200);
    const f: FichaChamado = dele.json();
    const doBruno = f.anexosDosCampos.find((a) => a.nome === 'do bruno.png')!;
    const doAdmin = f.anexosDosCampos.find((a) => a.nome === 'ramais.pdf')!;
    expect(doBruno.podeTirar).toBe(true);
    expect(doAdmin.podeTirar).toBe(false);
    expect((await bruno.del(`/atendimento/chamados/${card.id}/anexos/${doAdmin.id}`)).statusCode).toBe(403);
    // quem cuida tira o do Bruno
    const r = await s.del(`/atendimento/chamados/${card.id}/anexos/${doBruno.id}`);
    expect(r.statusCode, r.body).toBe(200);
    const depois: FichaChamado = r.json();
    expect(depois.anexosDosCampos.some((a) => a.id === doBruno.id)).toBe(false);
    expect(depois.historico.at(-1)!.texto).toBe('tirou do bruno.png de Lista de ramais (LinePBX)');
    expect((await s.get(`/atendimento/anexos/${doBruno.id}`)).statusCode).toBe(404);
    expect((await s.del(`/atendimento/chamados/${card.id}/anexos/${doBruno.id}`)).statusCode).toBe(404);
  });
});
