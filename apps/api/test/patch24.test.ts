/**
 * Patch 2.4 — o documento do Luan de 31/10 ("melhorias 3110"):
 *  - excluir um campo, e não só desativar ("eu quero poder excluir os campos e n só desativar"): sai das regras e da ficha, o
 *    nome fica livre, o valor fica guardado e volta com o Restaurar;
 *  - os grupos de campos ("tem q ter um conjunto para eu alterar as abas laterais, desativar ou ativar, incluir novos grupo de
 *    campos, ou excluir/desativar"): criar, renomear, no meio ou na lateral, ativar e desativar todos, excluir com os campos;
 *  - o tipo Documento ("aqui tem q ter o tipo, documento"): o valor é quantos arquivos foram anexados; o texto vira documento;
 *  - as condições da negociação ("concedi um desconto de 200 reais até março do ano que vem, além disso a ativação só vai ser
 *    paga a partir de março tbm e dividida em 6 vezes").
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { ticketFields, tickets } from '@gestor/db';
import type { CampoPersonalizado, FichaChamado, OpcoesAtendimento, Painel } from '@gestor/shared';
import { makeApp, Session, type App } from './helpers.js';
import { esperarSegundoPlano } from '../src/services/atendimento/avisos.js';

let app: App;
let s: Session;
let painel: Painel;
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

const opcoes = async (): Promise<OpcoesAtendimento> => (await s.get('/atendimento/opcoes')).json();
const doPainel = async () => (await opcoes()).campos.filter((c) => c.painelId === painel.id);
const lerPainel = async () => (await opcoes()).paineis.find((p) => p.id === painel.id)!;
const ficha = async (ref: string): Promise<FichaChamado> => {
  const r = await s.get(`/atendimento/chamados/${ref}`);
  expect(r.statusCode, r.body).toBe(200);
  return r.json();
};
const criarCampo = async (d: Record<string, unknown>): Promise<CampoPersonalizado> => {
  const r = await s.post(`/atendimento/paineis/${painel.id}/campos`, d);
  expect(r.statusCode, r.body).toBe(201);
  return r.json();
};
const auditoria = async () => ((await s.get('/admin/audit?pageSize=100')).json().items as Array<{ summary: string; action: string }>);

beforeAll(async () => {
  app = await makeApp();
  s = new Session(app);
  await s.login();
  const r = await s.post('/atendimento/paineis', { nome: 'Projetos internos', sigla: 'pin', descricao: '', cor: 'roxo', tipo: 'gestao', ajustes: {} });
  expect(r.statusCode, r.body).toBe(201);
  painel = r.json();
});
afterAll(async () => { await esperarSegundoPlano(); await app.close(); });

describe('excluir um campo (2.4)', () => {
  it('sai da ficha e das regras, o nome fica livre; o valor fica guardado e volta com o Restaurar', async () => {
    const versao = await criarCampo({ nome: 'Versão', tipo: 'texto', etapas: [painel.etapas[1]!.id], obrigatorioAoAbrir: true });
    const t = (await s.post('/atendimento/chamados', { painelId: painel.id, titulo: 'Atualizar o servidor', campos: { [versao.id]: '2.4' } })).json();
    expect((await ficha(t.codigo)).campos[versao.id]).toBe('2.4');
    const r = await s.del(`/atendimento/campos/${versao.id}`);
    expect(r.statusCode, r.body).toBe(200);
    // fora dos campos, das regras e da ficha
    expect((await doPainel()).some((c) => c.id === versao.id)).toBe(false);
    const p = await lerPainel();
    expect(p.ajustes.obrigatoriosAoAbrir).not.toContain(`campo:${versao.id}`);
    expect(p.etapas[1]!.obrigatorios).not.toContain(`campo:${versao.id}`);
    expect((await ficha(t.codigo)).campos[versao.id]).toBeUndefined();
    // no banco, o valor ficou
    const [linha] = await app.db.select({ campos: tickets.customFields }).from(tickets).where(eq(tickets.id, t.id));
    expect((linha!.campos as Record<string, unknown>)[versao.id]).toBe('2.4');
    // na lista dos Excluídos
    const ex = (await s.get(`/atendimento/paineis/${painel.id}/campos/excluidos`)).json() as Array<CampoPersonalizado & { excluidoEm: string }>;
    expect(ex.map((c) => c.nome)).toEqual(['Versão']);
    // o nome ficou livre: outro campo Versão; aí o Restaurar recusa
    const outro = await criarCampo({ nome: 'Versão', tipo: 'numero' });
    const conflito = await s.post(`/atendimento/campos/${versao.id}/restaurar`);
    expect(conflito.statusCode).toBe(409);
    expect((await s.del(`/atendimento/campos/${outro.id}`)).statusCode).toBe(200);
    const volta = await s.post(`/atendimento/campos/${versao.id}/restaurar`);
    expect(volta.statusCode, volta.body).toBe(200);
    expect((await ficha(t.codigo)).campos[versao.id]).toBe('2.4');
    // volta sem ser pedido em lugar nenhum
    expect((await lerPainel()).ajustes.obrigatoriosAoAbrir).not.toContain(`campo:${versao.id}`);
    const auds = await auditoria();
    expect(auds.map((a) => a.summary)).toEqual(expect.arrayContaining([
      'Excluiu o campo Versão (Texto curto) do painel Projetos internos', 'Restaurou o campo Versão no painel Projetos internos',
    ]));
    // de novo excluído: 404 (já saiu)
    expect((await s.del(`/atendimento/campos/${versao.id}`)).statusCode).toBe(200);
    expect((await s.del(`/atendimento/campos/${versao.id}`)).statusCode).toBe(404);
  });
});

describe('os grupos de campos (2.4)', () => {
  it('criar, renomear, ir para a lateral, desativar e excluir com os campos; o painel salvo não mexe nos grupos', async () => {
    const a = await criarCampo({ nome: 'Escopo', tipo: 'texto_longo', parte: 'Planejamento', etapas: [painel.etapas[1]!.id] });
    const b = await criarCampo({ nome: 'Prazo combinado', tipo: 'data', parte: 'Planejamento' });
    const c = await criarCampo({ nome: 'Servidor', tipo: 'texto', parte: 'Entrega' });
    // um grupo novo (vazio), na lateral, no alto; o Planejamento vira Plano
    let r = await s.put(`/atendimento/paineis/${painel.id}/grupos`, {
      grupos: [{ nome: 'Contrato', lugar: 'lateral' }, { nome: 'Plano', antes: 'Planejamento' }, { nome: 'Entrega' }],
    });
    expect(r.statusCode, r.body).toBe(200);
    expect((await lerPainel()).ajustes.partes).toEqual([{ nome: 'Contrato', lugar: 'lateral' }, { nome: 'Plano', lugar: 'meio' }, { nome: 'Entrega', lugar: 'meio' }]);
    expect((await doPainel()).filter((x) => [a.id, b.id].includes(x.id)).map((x) => x.parte)).toEqual(['Plano', 'Plano']);
    // desativar o Plano: os dois campos ficam desativados e deixam de ser pedidos
    r = await s.put(`/atendimento/paineis/${painel.id}/grupos`, {
      grupos: [{ nome: 'Contrato', lugar: 'lateral' }, { nome: 'Plano', ativo: false }, { nome: 'Entrega' }],
    });
    expect(r.statusCode, r.body).toBe(200);
    expect((await doPainel()).filter((x) => x.parte === 'Plano').every((x) => !x.ativo)).toBe(true);
    expect((await lerPainel()).etapas[1]!.obrigatorios).not.toContain(`campo:${a.id}`);
    // salvar o painel (o nome) não mexe nos grupos
    const p = await lerPainel();
    const salvo = await s.put(`/atendimento/paineis/${painel.id}`, { nome: 'Projetos da equipe', sigla: p.sigla, descricao: '', cor: p.cor, tipo: 'gestao', ajustes: { ...p.ajustes } });
    expect(salvo.statusCode, salvo.body).toBe(200);
    expect((await lerPainel()).ajustes.partes.map((g) => g.nome)).toEqual(['Contrato', 'Plano', 'Entrega']);
    // excluir a Entrega: o campo vai junto (para os Excluídos)
    r = await s.put(`/atendimento/paineis/${painel.id}/grupos`, { grupos: [{ nome: 'Contrato', lugar: 'lateral' }, { nome: 'Plano', ativo: false }] });
    expect(r.statusCode, r.body).toBe(200);
    expect((await doPainel()).some((x) => x.id === c.id)).toBe(false);
    expect(((await s.get(`/atendimento/paineis/${painel.id}/campos/excluidos`)).json() as CampoPersonalizado[]).some((x) => x.id === c.id)).toBe(true);
    // dois grupos com o mesmo nome: não
    expect((await s.put(`/atendimento/paineis/${painel.id}/grupos`, { grupos: [{ nome: 'Plano' }, { nome: 'plano' }] })).statusCode).toBe(400);
    // reativar o Plano
    r = await s.put(`/atendimento/paineis/${painel.id}/grupos`, { grupos: [{ nome: 'Contrato', lugar: 'lateral' }, { nome: 'Plano', ativo: true }] });
    expect((await doPainel()).filter((x) => x.parte === 'Plano').every((x) => x.ativo)).toBe(true);
    const auds = (await auditoria()).map((x) => x.summary);
    expect(auds).toContain('Mudou os grupos de campos do painel Projetos internos: criou Contrato (na lateral); renomeou Planejamento para Plano');
    expect(auds.some((x) => x.includes('excluiu Entrega com o campo Servidor'))).toBe(true);
  });
});

describe('o tipo Documento (2.4)', () => {
  it('conta os arquivos anexados; não se escreve à mão; o texto vira documento (e a lista, não)', async () => {
    const doc = await criarCampo({ nome: 'Planilha dos ramais', tipo: 'documento', parte: 'Plano' });
    expect(doc).toMatchObject({ tipo: 'documento', anexos: true, opcoes: [] });
    const t = (await s.post('/atendimento/chamados', { painelId: painel.id, titulo: 'Implantar o cliente novo' })).json();
    const escrito = await s.patch(`/atendimento/chamados/${t.id}`, { campos: { [doc.id]: 'olá' } });
    expect(escrito.statusCode).toBe(400);
    const r = await s.post(`/atendimento/chamados/${t.id}/campos/${doc.id}/anexos`, { opcaoId: null, anexos: [{ fileName: 'ramais.png', conteudo: PNG }, { fileName: 'ura.png', conteudo: PNG }] });
    expect(r.statusCode, r.body).toBe(200);
    const f: FichaChamado = r.json();
    expect(f.campos[doc.id]).toBe(2);
    // a parte conta o documento como feito
    expect(f.partes.find((x) => x.parte === 'Plano')).toMatchObject({ feitos: 1 });
    for (const a of f.anexosDosCampos) await s.del(`/atendimento/chamados/${t.id}/anexos/${a.id}`);
    expect((await ficha(t.codigo)).campos[doc.id]).toBeUndefined();
    // o texto longo vira documento (o texto fica guardado); a lista não
    const longo = await criarCampo({ nome: 'Estrutura da URA', tipo: 'texto_longo' });
    const vira = await s.put(`/atendimento/campos/${longo.id}`, { nome: 'Estrutura da URA', tipo: 'documento' });
    expect(vira.statusCode, vira.body).toBe(200);
    expect(vira.json()).toMatchObject({ tipo: 'documento', anexos: true });
    const lista = await criarCampo({ nome: 'Sistema', tipo: 'lista', opcoes: [{ nome: 'LinePBX' }] });
    expect((await s.put(`/atendimento/campos/${lista.id}`, { nome: 'Sistema', tipo: 'documento' })).statusCode).toBe(400);
    const [linha] = await app.db.select({ kind: ticketFields.kind }).from(ticketFields).where(eq(ticketFields.id, longo.id));
    expect(linha!.kind).toBe('documento');
  });
});

describe('as condições da negociação (2.4)', () => {
  it('o desconto até março e a ativação a partir de março em 6 vezes: na ficha, no histórico e na auditoria', async () => {
    const v = await s.post('/atendimento/paineis', { nome: 'Vendas 2.4', sigla: 'vqt', descricao: '', cor: 'ok', tipo: 'vendas', ajustes: {} });
    expect(v.statusCode, v.body).toBe(201);
    const neg = (await s.post('/atendimento/chamados', { painelId: v.json().id, titulo: '', empresa: 'Clínica Sol', valor: 99_000, ativacao: 300_000 })).json();
    const condicoes = { descontos: [{ valor: 20_000, ate: '2027-03' }], ativacao: { aPartirDe: '2027-03', vezes: 6 } };
    const r = await s.patch(`/atendimento/chamados/${neg.id}`, { condicoes });
    expect(r.statusCode, r.body).toBe(200);
    const f: FichaChamado = r.json();
    // no formato do 2.4.1 (as Condições especiais): a ativação com o desconto (nenhum) e o mês da 1ª parcela
    expect(f.condicoes).toEqual({ descontos: [{ valor: 20_000, ate: '2027-03' }], ativacao: { desconto: null, vezes: 6, aPartirDe: '2027-03' }, observacao: null });
    expect(f.historico.at(-1)!.texto.replace(/ /g, ' ')).toContain('Desconto de R$ 200,00/mês até mar/2027 · Ativação em 6 vezes, a partir de mar/2027');
    // o valor não muda
    expect([f.valor, f.ativacao]).toEqual([99_000, 300_000]);
    // o mesmo de novo não vai para o histórico
    const n = (await ficha(neg.codigo)).historico.length;
    await s.patch(`/atendimento/chamados/${neg.id}`, { condicoes });
    expect((await ficha(neg.codigo)).historico).toHaveLength(n);
    // o desconto que termina antes do anterior: 400 (2.4.1: eles vêm em sequência)
    expect((await s.patch(`/atendimento/chamados/${neg.id}`, { condicoes: { descontos: [{ valor: 100, ate: '2027-04' }, { valor: 50, ate: '2027-03' }] } })).statusCode).toBe(400);
    // tirar
    const sem = await s.patch(`/atendimento/chamados/${neg.id}`, { condicoes: null });
    expect((sem.json() as FichaChamado).condicoes).toBeNull();
    // no chamado (o painel de Gestão), não há condições
    const t = (await s.post('/atendimento/chamados', { painelId: painel.id, titulo: 'Sem negociação' })).json();
    await s.patch(`/atendimento/chamados/${t.id}`, { condicoes });
    expect((await ficha(t.codigo)).condicoes).toBeNull();
  });
});
