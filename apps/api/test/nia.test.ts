/**
 * Patch 2.0.4.1 — A NIA NA FICHA. O pedido do Luan (23/10): "para eu fazer a ia preencher o chamado hoje eu tenho
 * que etiquetar, só que isso eu acho meio gambiarra, devíamos ter um botão aqui para mandar ela preencher e se já
 * tiver sido feito ele fica com alguma marcação dizendo que já foi feito e se eu clicar ele me mostra algumas
 * informações como data".
 *
 *  - os ajustes (Painéis › Ajustes › IA, de quem cuida das integrações): ligado, com as etiquetas do Helena; as
 *    três diferentes; desligado, a ficha não mostra o botão (opcoes.nia nula)
 *  - o botão põe a etiqueta de pedir (a de pronto e a de erro saem): o aviso do chamado alterado vai para o n8n com
 *    ela, como quando a equipe etiquetava — o fluxo da NIA não muda; o histórico e a auditoria dizem quem pediu
 *  - a NIA responde pela chave (troca a etiqueta, preenche, anota): o resumo diz quando, quem pediu, o que mudou
 *  - o pedido sem resposta só se repete depois de uns minutos; repetido, a etiqueta sai e volta (o n8n recebe de novo)
 *  - a negociação não tem a NIA; quem não trabalha nos chamados não pede (403)
 */
import { createHash } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { newId, ticketApiKeys, ticketEvents } from '@gestor/db';
import { NIA_PADRAO, resumoDaNia, type FichaChamado } from '@gestor/shared';
import { makeApp, Session, type App } from './helpers.js';
import { esperarSegundoPlano } from '../src/services/atendimento/avisos.js';
import { trocarFerramentasWebhook } from '../src/services/atendimento/webhooks.js';

let app: App;
let s: Session;       // a administração
let marina: Session;  // operadora: trabalha nos chamados, não cuida das integrações
let lia: Session;     // só lê os chamados
let n8n = '';         // a chave da NIA (o valor só existe aqui, gerado na hora)
let sup1 = { id: '', codigo: '' };
const SUP = 'painel-suporte';
const { pedir: P, pronto: C, erro: E } = NIA_PADRAO;
const recebidos: Array<{ evento: string; corpo: any }> = [];

const sha256 = (v: string) => createHash('sha256').update(v).digest('hex');
async function ficha(ref: string, quem: Session = s): Promise<FichaChamado> {
  const r = await quem.get(`/atendimento/chamados/${encodeURIComponent(ref)}`);
  expect(r.statusCode, r.body).toBe(200);
  return r.json();
}
const resumo = (f: FichaChamado, agora?: Date) => resumoDaNia(f, NIA_PADRAO, agora);
/** O n8n falando com o Gestor pela chave (a NIA preenchendo). */
const peloN8n = (method: 'PATCH' | 'POST', url: string, payload: unknown) =>
  app.inject({ method, url: `/api/atendimento${url}`, payload: payload as any, headers: { authorization: `Bearer ${n8n}` } });
const auditoria = async () => ((await s.get('/admin/audit?pageSize=100')).json().items as Array<{ summary: string }>).map((a) => a.summary);

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

  n8n = `chave-falsa-${Math.random()}`;
  await app.db.insert(ticketApiKeys).values({ id: newId(), name: 'NIA no n8n', prefix: n8n.slice(0, 8), hash: sha256(n8n) });
  // o webhook da NIA (o chamado alterado), recebido aqui
  trocarFerramentasWebhook({
    resolver: async () => ['203.0.113.10'], esperar: async () => {},
    fetchFn: (async (_url: string, init: RequestInit) => {
      const corpo = JSON.parse(String(init.body));
      recebidos.push({ evento: corpo.evento, corpo });
      return new Response('ok', { status: 200 });
    }) as unknown as typeof fetch,
  });
  const w = await s.post('/atendimento/integracoes/webhooks', { nome: 'NIA no n8n', url: 'https://n8n.exemplo.com.br/webhook/nia', eventos: ['chamado.alterado'], ativo: true });
  expect(w.statusCode, w.body).toBe(201);

  const r = await s.post('/atendimento/chamados', { painelId: SUP, titulo: 'Clínica de Brotas - Criação De Perfis', relato: 'Pediram perfis novos no LineChat', etiquetas: ['Cliente VIP'] });
  expect(r.statusCode, r.body).toBe(201);
  sup1 = r.json();
});
afterAll(async () => {
  await esperarSegundoPlano();
  await app.close();
});

describe('a NIA na ficha', () => {
  it('os ajustes: ligada, com as etiquetas do Helena; as três diferentes; só quem cuida das integrações muda', async () => {
    expect((await s.get('/atendimento/integracoes/nia')).json()).toEqual(NIA_PADRAO);
    expect((await s.get('/atendimento/opcoes')).json().nia).toEqual({ pedir: P, pronto: C, erro: E });
    expect((await marina.get('/atendimento/integracoes/nia')).statusCode).toBe(403);
    expect((await marina.put('/atendimento/integracoes/nia', { ...NIA_PADRAO, ligada: false })).statusCode).toBe(403);
    const iguais = await s.put('/atendimento/integracoes/nia', { ligada: true, pedir: 'IA', pronto: 'ia', erro: 'IA erro' });
    expect(iguais.statusCode).toBe(400);
    // desligada: a ficha não mostra o botão, e o pedido é recusado
    const off = await s.put('/atendimento/integracoes/nia', { ...NIA_PADRAO, ligada: false });
    expect(off.statusCode, off.body).toBe(200);
    expect((await s.get('/atendimento/opcoes')).json().nia).toBeNull();
    const recusado = await s.post(`/atendimento/chamados/${sup1.id}/nia`, {});
    expect(recusado.statusCode).toBe(400);
    expect(recusado.json().error).toMatch(/desligado/);
    expect((await s.put('/atendimento/integracoes/nia', NIA_PADRAO)).statusCode).toBe(200);
    expect(await auditoria()).toEqual(expect.arrayContaining([
      'Desligou o botão da NIA na ficha',
      `Mudou o botão da NIA na ficha: ligado, com as etiquetas ${P} (pedir), ${C} (pronto) e ${E} (erro)`,
    ]));
    // mudar os sites do iframe não apaga a NIA (os ajustes moram juntos)
    expect((await s.put('/atendimento/integracoes/sites', { sites: ['https://app.inglinechat.com.br'] })).statusCode).toBe(200);
    expect((await s.get('/atendimento/integracoes/nia')).json()).toEqual(NIA_PADRAO);
  });

  it('pedir: a etiqueta de pedir entra, o n8n recebe o aviso com ela, e o histórico e a auditoria dizem quem pediu', async () => {
    expect(resumo(await ficha(sup1.codigo)).situacao).toBe('nunca');
    recebidos.length = 0;
    const r = await marina.post(`/atendimento/chamados/${sup1.id}/nia`, {});
    expect(r.statusCode, r.body).toBe(200);
    const f = r.json() as FichaChamado;
    expect(f.etiquetas).toEqual(['Cliente VIP', P]);
    expect(resumo(f)).toMatchObject({ situacao: 'pedida', pedidaPor: 'Marina Costa', podePedir: false });
    await esperarSegundoPlano();
    expect(recebidos.map((x) => x.evento)).toEqual(['chamado.alterado']);
    expect(recebidos[0]!.corpo.chamado).toMatchObject({ codigo: sup1.codigo, etiquetas: ['Cliente VIP', P] });
    expect(await auditoria()).toContain(`Pediu à NIA para preencher ${sup1.codigo}`);
    // de novo, logo em seguida: ela ainda está preenchendo
    const cedo = await s.post(`/atendimento/chamados/${sup1.id}/nia`, {});
    expect(cedo.statusCode).toBe(400);
    expect(cedo.json().error).toMatch(/^A NIA foi chamada às \d\d:\d\d e ainda está preenchendo/);
  });

  it('a NIA responde pela chave: troca a etiqueta, preenche e anota — o resumo diz quando, quem pediu e o que mudou', async () => {
    let r = await peloN8n('PATCH', `/integracao/chamados/${sup1.codigo}`, {
      titulo: 'Clínica de Brotas - Criação de perfis no LineChat', descricao: '"Preciso de 3 perfis novos" - A clínica pediu perfis para a recepção.',
      etiquetas: ['Cliente VIP', C],
    });
    expect(r.statusCode, r.body).toBe(200);
    r = await peloN8n('POST', `/integracao/chamados/${sup1.codigo}/anotacoes`, { texto: 'Situação: a clínica precisa de 3 perfis.' });
    expect(r.statusCode, r.body).toBe(200);
    await peloN8n('POST', `/integracao/chamados/${sup1.codigo}/anotacoes`, { texto: 'Diagnóstico: criar os perfis no LineChat.' });
    const f = await ficha(sup1.codigo);
    expect(resumo(f)).toMatchObject({
      situacao: 'pronta', pedidaPor: 'Marina Costa', respondidaPor: 'NIA no n8n', vezes: 1, mudou: ['Título', 'Descrição'], anotacoes: 2, podePedir: true,
    });
    expect(resumo(f).respondidaEm! >= resumo(f).pedidaEm!).toBe(true);
  });

  it('preencher de novo: a de pronto sai e a de pedir volta; parado há mais de 10 minutos, ela sai e volta (o n8n recebe de novo)', async () => {
    let r = await s.post(`/atendimento/chamados/${sup1.id}/nia`, {});
    expect(r.statusCode, r.body).toBe(200);
    expect(r.json().etiquetas).toEqual(['Cliente VIP', P]);
    expect(resumo(r.json())).toMatchObject({ situacao: 'pedida', pedidaPor: 'Administrador', vezes: 1 });
    expect(await auditoria()).toContain(`Pediu à NIA para preencher ${sup1.codigo} de novo`);
    // o pedido ficou parado: o histórico dele, 11 minutos atrás
    const pedidos = (await app.db.select().from(ticketEvents).where(eq(ticketEvents.ticketId, sup1.id))).filter((e) => e.kind === 'campo' && String((e.data as any).para ?? '').includes(P));
    const ultimo = pedidos.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0]!;
    await app.db.update(ticketEvents).set({ createdAt: new Date(Date.now() - 11 * 60_000) }).where(eq(ticketEvents.id, ultimo.id));
    expect(resumo(await ficha(sup1.codigo)).podePedir).toBe(true);
    recebidos.length = 0;
    r = await s.post(`/atendimento/chamados/${sup1.id}/nia`, {});
    expect(r.statusCode, r.body).toBe(200);
    expect(r.json().etiquetas).toEqual(['Cliente VIP', P]);
    await esperarSegundoPlano();
    // dois avisos: sem a etiqueta e com ela (o fluxo do n8n age no segundo)
    expect(recebidos.map((x) => x.corpo.chamado.etiquetas)).toEqual([['Cliente VIP'], ['Cliente VIP', P]]);
    expect(resumo(r.json())).toMatchObject({ situacao: 'pedida', podePedir: false });
  });

  it('a NIA que não conseguiu: a etiqueta de erro', async () => {
    expect((await peloN8n('PATCH', `/integracao/chamados/${sup1.codigo}`, { etiquetas: ['Cliente VIP', E] })).statusCode).toBe(200);
    expect(resumo(await ficha(sup1.codigo))).toMatchObject({ situacao: 'erro', respondidaPor: 'NIA no n8n', vezes: 1, podePedir: true });
  });

  it('a negociação não tem a NIA; quem só lê não pede', async () => {
    const painel = await s.post('/atendimento/paineis', { nome: 'Comercial', sigla: 'com', descricao: 'As negociações', cor: 'ok', tipo: 'vendas', acesso: 'todos', ajustes: {} });
    expect(painel.statusCode, painel.body).toBe(201);
    const neg = await s.post('/atendimento/chamados', { painelId: painel.json().id, titulo: 'PABX em nuvem', empresa: 'Padaria Estrela' });
    expect(neg.statusCode, neg.body).toBe(201);
    const r = await s.post(`/atendimento/chamados/${neg.json().id}/nia`, {});
    expect(r.statusCode).toBe(400);
    expect(r.json().error).toBe('A NIA preenche os chamados: a negociação não tem a NIA.');
    expect((await lia.post(`/atendimento/chamados/${sup1.id}/nia`, {})).statusCode).toBe(403);
  });
});

/**
 * O pedido do Luan (23/10), junto com o da NIA: "mais de 99% são receptivos, mas alguns são ativos ... a gente quer
 * poder abrir chamado manualmente, como já faz. Só que também tem que ter a possibilidade de associar uma sessão ...
 * para que a IA consiga ler ... Eu posso editar ou colocar o link de alguma outra conversa."
 */
describe('a conversa do LineChat ligada à mão (o chamado ativo)', () => {
  const U1 = '83858976-9930-4a4e-8f0e-1c2d3e4f5a6b';
  const U2 = '1a2b3c4d-5e6f-4a1b-9c2d-3e4f5a6b7c8d';
  const MODELO = 'https://app.inglinechat.com.br/chat/{sessao}';
  let ativo = { id: '', codigo: '' };

  it('abrir à mão com o link da conversa: a sessão vem do link, e a ficha mostra o link; o link que não dá para ler é recusado', async () => {
    expect((await s.put('/atendimento/integracoes/link-conversa', { linkConversa: MODELO })).statusCode).toBe(200);
    expect((await marina.get('/atendimento/opcoes')).json().linkConversa).toBe(MODELO);
    const errado = await marina.post('/atendimento/chamados', { painelId: SUP, titulo: 'Retorno ativo ao cliente', sessaoId: 'https://app.inglinechat.com.br/painel/clientes' });
    expect(errado.statusCode).toBe(400);
    expect(errado.json().error).toMatch(/^Não achei a sessão nesse link/);
    const r = await marina.post('/atendimento/chamados', { painelId: SUP, titulo: 'Retorno ativo ao cliente', sessaoId: `https://app.inglinechat.com.br/chat/${U1.toUpperCase()}?aba=notas` });
    expect(r.statusCode, r.body).toBe(201);
    ativo = r.json();
    const f = await ficha(ativo.codigo, marina);
    expect(f.sessaoId).toBe(U1);
    expect(f.conversaUrl).toBe(`https://app.inglinechat.com.br/chat/${U1}`);
  });

  it('trocar e tirar a conversa na ficha: o histórico, a auditoria e o aviso ao n8n; a NIA lê a sessão nova', async () => {
    recebidos.length = 0;
    let r = await marina.patch(`/atendimento/chamados/${ativo.id}`, { sessaoId: `https://outro.helena.app/chat2/sessions/${U2}` });
    expect(r.statusCode, r.body).toBe(200);
    let f = r.json() as FichaChamado;
    expect(f.sessaoId).toBe(U2);
    expect(f.historico.at(-1)).toMatchObject({ tipo: 'campo', dados: { campo: 'Conversa no LineChat', de: U1, para: U2 }, por: { nome: 'Marina Costa' } });
    expect(await auditoria()).toContain(`Alterou ${ativo.codigo} "Retorno ativo ao cliente": Conversa no LineChat`);
    await esperarSegundoPlano();
    expect(recebidos.map((x) => [x.evento, x.corpo.mudancas])).toEqual([['chamado.alterado', ['sessaoId']]]);
    // o n8n (a NIA) lê o chamado com a sessão para achar a conversa
    const lido = await app.inject({ method: 'GET', url: `/api/atendimento/integracao/chamados/${ativo.codigo}`, headers: { authorization: `Bearer ${n8n}` } });
    expect(lido.json().sessaoId).toBe(U2);
    // o mesmo de novo não muda nada; o que não dá para ler é recusado
    r = await marina.patch(`/atendimento/chamados/${ativo.id}`, { sessaoId: U2 });
    expect((r.json() as FichaChamado).historico.filter((e) => e.tipo === 'campo' && e.dados.campo === 'Conversa no LineChat')).toHaveLength(1);
    r = await marina.patch(`/atendimento/chamados/${ativo.id}`, { sessaoId: 'conversa da Maria' });
    expect(r.statusCode).toBe(400);
    expect(r.json().error).toMatch(/não tem espaço/);
    // tirar: vazio
    r = await marina.patch(`/atendimento/chamados/${ativo.id}`, { sessaoId: '' });
    f = r.json() as FichaChamado;
    expect(f.sessaoId).toBeNull();
    expect(f.conversaUrl).toBeNull();
    expect(f.historico.at(-1)).toMatchObject({ dados: { campo: 'Conversa no LineChat', de: U2, para: null } });
    // quem só lê não liga conversa
    expect((await lia.patch(`/atendimento/chamados/${ativo.id}`, { sessaoId: U1 })).statusCode).toBe(403);
  });

  it('o n8n também liga pela chave (a auditoria diz o quê); o robô acha o chamado ativo pela conversa e não abre outro', async () => {
    const r = await peloN8n('PATCH', `/integracao/chamados/${ativo.codigo}`, { sessaoId: U1 });
    expect(r.statusCode, r.body).toBe(200);
    expect(r.json().sessaoId).toBe(U1);
    expect(await auditoria()).toContain(`NIA no n8n (chave de API) alterou ${ativo.codigo} "Retorno ativo ao cliente": Conversa no LineChat`);
    // o cliente respondeu na mesma conversa e o robô chamou: o relato vira anotação no chamado ativo
    const robo = await app.inject({ method: 'POST', url: '/api/atendimento/entrada/chamado', headers: { authorization: `Bearer ${n8n}` }, payload: { sessaoId: U1, relato: 'Oi, consegui testar: funcionou!' } });
    expect(robo.statusCode, robo.body).toBe(200);
    expect(robo.json()).toMatchObject({ criado: false, codigo: ativo.codigo });
    expect((await ficha(ativo.codigo)).anotacoesLista.map((n) => n.texto)).toContain('Oi, consegui testar: funcionou!');
    // o código que o robô manda fica como veio (sem a regra do link colado)
    const outro = await app.inject({ method: 'POST', url: '/api/atendimento/entrada/chamado', headers: { authorization: `Bearer ${n8n}` }, payload: { sessaoId: 'ABC', relato: 'Conversa nova' } });
    expect(outro.statusCode, outro.body).toBe(201);
    expect((await ficha(outro.json().codigo)).sessaoId).toBe('ABC');
  });
});
