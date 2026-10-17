/**
 * Patch 2.0.1 — o PAINEL DE VENDAS (decisão 0050): o Comercial usa o quadro dos chamados como funil de
 * vendas, como o painel comercial do Helena. O pedido do Luan: "quero fazer um painel para o comercial tbm
 * usar, já temos um no helena… veja tbm a parte de relatório pq é importante termos algo parecido tbm para
 * o comercial".
 *
 *  - o painel nasce de Vendas (o tipo não muda depois): Lead, Qualificação, Proposta enviada, Negociação,
 *    Ganho e Perdido; sem prazo; os motivos de perda; a meta do mês. As finais são uma Ganho e uma Perdido
 *  - a negociação: o valor e a empresa que ainda não é cliente; sem prioridade
 *  - a Proposta pede o valor; o Perdido pede o motivo; o dia em que acabou é hoje ou antes
 *  - o histórico e a auditoria falam de venda ("marcou como perdido: Preço"); reabrir volta para a etapa
 *    de antes; assumir só fica com a negociação
 *  - o quadro soma o valor de cada coluna; o resumo do painel traz o ganho do mês e a meta
 *  - o relatório de vendas (o que o Luan escolheu, 17/10): os números do período e o funil; só dos
 *    painéis de Vendas e de quem vê o painel
 *  - o CSV só de negociações
 *  - o histórico diz "criou a negociação"; a troca de painel fica entre os painéis de Vendas (entrando no
 *    funil): a negociação não vira chamado nem o chamado vira negociação; o caminho entre eles é o filho
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { tickets } from '@gestor/db';
import {
  AJUSTES_DO_PAINEL_DE_VENDAS, diaLocal, instanteLocal, MOTIVOS_DE_PERDA_PADRAO, reais, somarDias, textoDoEvento, TROCA_ENTRA_NO_FUNIL,
  type EtapaPainel, type Painel, type RelatorioDeVendas,
} from '@gestor/shared';
import { makeApp, Session, type App } from './helpers.js';
import { esperarSegundoPlano } from '../src/services/atendimento/avisos.js';

let app: App;
let s: Session;        // a administração (cuida dos chamados)
let camila: Session;   // Comercial
let diego: Session;    // Comercial
let marina: Session;   // só o Suporte: não vê o Comercial
let lia: Session;      // Leitor, no Comercial
const ids = { admin: '', camila: '', diego: '', marina: '', lia: '' };
let com: Painel;
const SUP = 'painel-suporte';

const etapa = (nome: string): EtapaPainel => {
  const e = com.etapas.find((x) => x.nome === nome);
  if (!e) throw new Error(`sem a etapa ${nome}`);
  return e;
};
async function pessoa(nome: string, email: string, papel: string) {
  const papeis = (await s.get('/admin/roles')).json();
  const r = await s.post('/admin/users', { name: nome, email, password: 'SenhaDeTeste!123', roleId: papeis.find((x: any) => x.key === papel).id });
  expect(r.statusCode, r.body).toBe(201);
  const sessao = new Session(app);
  await sessao.login(email, 'SenhaDeTeste!123');
  return { id: r.json().id as string, sessao };
}
async function abrir(quem: Session, corpo: Record<string, unknown>) {
  const r = await quem.post('/atendimento/chamados', { painelId: com.id, ...corpo });
  expect(r.statusCode, r.body).toBe(201);
  return r.json() as { id: string; codigo: string };
}
async function ficha(ref: string, quem: Session = s) {
  const r = await quem.get(`/atendimento/chamados/${encodeURIComponent(ref)}`);
  expect(r.statusCode, r.body).toBe(200);
  return r.json();
}
async function mover(id: string, nome: string, extra: Record<string, unknown> = {}, quem: Session = camila) {
  return quem.post(`/atendimento/chamados/${id}/mover`, { etapaId: etapa(nome).id, ...extra });
}
const textos = (f: any) => (f.historico as any[]).map((e) => textoDoEvento(e.tipo, e.dados));
const auditoriaDe = async (id: string) => ((await s.get(`/admin/audit?entityId=${id}&pageSize=50`)).json().items as Array<{ summary: string }>).map((a) => a.summary);
const hoje = () => diaLocal(new Date());

beforeAll(async () => {
  app = await makeApp();
  s = new Session(app);
  ids.admin = (await s.login()).id;
  const c = await pessoa('Camila Souza', 'camila@gestor.local', 'operador');
  const d = await pessoa('Diego Farias', 'diego@gestor.local', 'operador');
  const m = await pessoa('Marina Costa', 'marina@gestor.local', 'operador');
  const l = await pessoa('Lia Rocha', 'lia@gestor.local', 'leitor');
  camila = c.sessao; diego = d.sessao; marina = m.sessao; lia = l.sessao;
  Object.assign(ids, { camila: c.id, diego: d.id, marina: m.id, lia: l.id });
});
afterAll(async () => {
  await esperarSegundoPlano();
  await app.close();
});

describe('o painel de Vendas', () => {
  it('nasce com o funil, o Ganho e o Perdido, sem prazo e com os motivos de perda', async () => {
    const r = await s.post('/atendimento/paineis', {
      nome: 'Comercial', sigla: 'com', descricao: 'As negociações', cor: 'ok', tipo: 'vendas', acesso: 'escolhidos',
      pessoas: [ids.camila, ids.diego, ids.lia], ajustes: { metaMensal: 5_000_000 },
    });
    expect(r.statusCode, r.body).toBe(201);
    com = r.json();
    expect(com.tipo).toBe('vendas');
    expect(com.etapas.map((e) => `${e.nome}:${e.tipo}:${e.resultado ?? '-'}`)).toEqual([
      'Lead:entrada:-', 'Qualificação:andamento:-', 'Proposta enviada:andamento:-', 'Negociação:andamento:-', 'Ganho:fechado:ganho', 'Perdido:fechado:perdido',
    ]);
    expect(etapa('Proposta enviada').obrigatorios).toEqual(['valor']);
    expect(com.ajustes).toMatchObject({
      contaPrazo: false, fecharSozinhoDias: null, paiEsperaFilhos: false, metaMensal: 5_000_000,
      motivosDePerda: MOTIVOS_DE_PERDA_PADRAO, tipos: AJUSTES_DO_PAINEL_DE_VENDAS.tipos,
      camposDesligados: expect.arrayContaining(['assunto', 'gravidade', 'operadoras']),
    });
    expect(await auditoriaDe(com.id)).toEqual([expect.stringContaining('Criou o painel Comercial (COM, de Vendas)')]);
  });

  it('o tipo não muda depois; os motivos e a meta ficam quando não vêm', async () => {
    const r = await s.put(`/atendimento/paineis/${com.id}`, {
      nome: 'Comercial', sigla: 'COM', descricao: 'As negociações', cor: 'ok', tipo: 'gestao', acesso: 'escolhidos',
      pessoas: [ids.camila, ids.diego, ids.lia], ajustes: { contaPrazo: true },
    });
    expect(r.statusCode, r.body).toBe(200);
    expect(r.json()).toMatchObject({ tipo: 'vendas', ajustes: { contaPrazo: false, metaMensal: 5_000_000, motivosDePerda: MOTIVOS_DE_PERDA_PADRAO, tipos: AJUSTES_DO_PAINEL_DE_VENDAS.tipos } });
    // sem motivo nenhum, não
    const sem = await s.put(`/atendimento/paineis/${com.id}`, { nome: 'Comercial', sigla: 'COM', acesso: 'escolhidos', pessoas: [ids.camila], ajustes: { motivosDePerda: [] } });
    expect(sem.statusCode).toBe(400);
    expect(sem.json().error).toContain('pelo menos um motivo de perda');
  });

  it('as etapas: uma Ganho e uma Perdido, finais; nada de Resolvido nem de nível', async () => {
    const etapas = com.etapas.map((e) => ({ id: e.id, nome: e.nome, tipo: e.tipo, nivel: e.nivel, obrigatorios: e.obrigatorios, resultado: e.resultado, avisar: [] }));
    const tentar = (lista: unknown[]) => s.put(`/atendimento/paineis/${com.id}/etapas`, { etapas: lista, destino: {} });
    const semPerdido = await tentar(etapas.filter((e) => e.nome !== 'Perdido'));
    expect(semPerdido.statusCode).toBe(400);
    expect(semPerdido.json().error).toContain('Perdido');
    const comResolvido = await tentar([...etapas.slice(0, 4), { nome: 'Assinado', tipo: 'resolvido', nivel: null, obrigatorios: [], resultado: null, avisar: [] }, ...etapas.slice(4)]);
    expect(comResolvido.statusCode).toBe(400);
    const comNivel = await tentar(etapas.map((e) => (e.nome === 'Qualificação' ? { ...e, nivel: 1 } : e)));
    expect(comNivel.statusCode).toBe(400);
    // incluir uma etapa no funil e renomear o Ganho pode
    const nova = await tentar([...etapas.slice(0, 3), { nome: 'Demonstração', tipo: 'andamento', nivel: null, obrigatorios: [], resultado: null, avisar: [] }, ...etapas.slice(3).map((e) => (e.nome === 'Ganho' ? { ...e, nome: 'Fechado — ganho' } : e))]);
    expect(nova.statusCode, nova.body).toBe(200);
    expect(nova.json().etapas.map((e: EtapaPainel) => e.nome)).toEqual(['Lead', 'Qualificação', 'Proposta enviada', 'Demonstração', 'Negociação', 'Fechado — ganho', 'Perdido']);
    // volta como era (os testes seguintes usam os nomes de fábrica)
    const volta = await tentar(etapas);
    expect(volta.statusCode, volta.body).toBe(200);
    com = volta.json();
    // no painel de Gestão, nenhuma etapa tem resultado
    const sup = (await s.get('/atendimento/opcoes')).json().paineis.find((p: Painel) => p.id === SUP) as Painel;
    const supEtapas = sup.etapas.map((e) => ({ id: e.id, nome: e.nome, tipo: e.tipo, nivel: e.nivel, obrigatorios: e.obrigatorios, resultado: e.nome === 'Fechado' ? 'ganho' : null, avisar: [] }));
    expect((await s.put(`/atendimento/paineis/${SUP}/etapas`, { etapas: supEtapas, destino: {} })).statusCode).toBe(400);
  });
});

describe('a negociação', () => {
  let estrela = { id: '', codigo: '' };

  it('nasce no Lead com o valor e a empresa; sem prioridade', async () => {
    estrela = await abrir(camila, {
      titulo: 'PABX em nuvem, 40 ramais', empresa: 'Padaria Estrela', contatoNome: 'Rosa', valor: 1_250_000,
      prioridade: 'alta', responsavelId: ids.camila,
    });
    expect(estrela.codigo).toBe('COM-1');
    const f = await ficha(estrela.codigo, camila);
    expect(f).toMatchObject({ etapaId: etapa('Lead').id, valor: 1_250_000, empresa: 'Padaria Estrela', prioridade: null, resultado: null, situacao: 'aberto' });
    // no painel de Gestão, o valor não entra
    const sup = await s.post('/atendimento/chamados', { painelId: SUP, titulo: 'Ramal mudo', valor: 5000, empresa: 'X' });
    expect(sup.statusCode, sup.body).toBe(201);
    expect(await ficha(sup.json().codigo)).toMatchObject({ valor: null, empresa: null });
  });

  it('assumir só fica com a negociação (o lead não passa sozinho para a Qualificação)', async () => {
    const outra = await abrir(camila, { titulo: 'Troca de operadora', empresa: 'Mercado Bom Preço' });
    const r = await diego.post(`/atendimento/chamados/${outra.id}/assumir`);
    expect(r.statusCode, r.body).toBe(200);
    expect(r.json()).toMatchObject({ etapaId: etapa('Lead').id, responsavel: { id: ids.diego } });
  });

  it('a Proposta pede o valor; o valor muda com o histórico em reais', async () => {
    const sem = await abrir(camila, { titulo: 'Central para a filial', empresa: 'Auto Peças Rocha' });
    const r = await mover(sem.id, 'Proposta enviada');
    expect(r.statusCode).toBe(400);
    expect(r.json().error).toBe('Para ir para Proposta enviada, falta preencher: Valor.');
    const valor = await camila.patch(`/atendimento/chamados/${sem.id}`, { valor: 480_000 });
    expect(valor.statusCode, valor.body).toBe(200);
    expect(textos(valor.json())).toContain(`mudou Valor para "${reais(480_000)}"`);
    expect((await mover(sem.id, 'Proposta enviada')).statusCode).toBe(200);
    // o motivo da perda é só da perdida
    const motivo = await camila.patch(`/atendimento/chamados/${sem.id}`, { motivoPerda: 'Preço' });
    expect(motivo.statusCode).toBe(400);
    expect(motivo.json().error).toContain('só da negociação perdida');
  });

  it('o Perdido pede o motivo; o histórico e a auditoria contam como venda', async () => {
    expect((await mover(estrela.id, 'Negociação')).statusCode).toBe(200);
    const semMotivo = await mover(estrela.id, 'Perdido');
    expect(semMotivo.statusCode).toBe(400);
    expect(semMotivo.json().error).toBe('Para ir para Perdido, falta preencher: O motivo da perda.');
    const r = await mover(estrela.id, 'Perdido', { motivoPerda: 'Preço' });
    expect(r.statusCode, r.body).toBe(200);
    const f = r.json();
    expect(f).toMatchObject({ situacao: 'fechado', resultado: 'perdido', motivoPerda: 'Preço' });
    expect(diaLocal(f.fechadoEm)).toBe(hoje());
    expect(textos(f)).toContain('marcou como perdido: Preço (estava em Negociação)');
    expect(await auditoriaDe(estrela.id)).toContain('Marcou COM-1 como perdido: Preço (estava em Negociação)');
    // o motivo muda depois (com o histórico); vazio, não
    const muda = await camila.patch(`/atendimento/chamados/${estrela.id}`, { motivoPerda: 'Fechou com a concorrência' });
    expect(muda.statusCode, muda.body).toBe(200);
    expect(textos(muda.json())).toContain('mudou Motivo da perda de "Preço" para "Fechou com a concorrência"');
    expect((await camila.patch(`/atendimento/chamados/${estrela.id}`, { motivoPerda: '' })).statusCode).toBe(400);
  });

  it('reabrir volta para a etapa em que estava, sem o motivo da perda', async () => {
    const r = await camila.post(`/atendimento/chamados/${estrela.id}/reabrir`, { motivo: 'O cliente voltou a negociar' });
    expect(r.statusCode, r.body).toBe(200);
    expect(r.json()).toMatchObject({ etapaId: etapa('Negociação').id, situacao: 'aberto', resultado: null, motivoPerda: null, fechadoEm: null });
  });

  it('o Ganho: o dia em que fechou é hoje ou antes', async () => {
    const amanha = somarDias(hoje(), 1);
    const futuro = await mover(estrela.id, 'Ganho', { concluidoEm: amanha });
    expect(futuro.statusCode).toBe(400);
    expect(futuro.json().error).toContain('hoje ou um dia que já passou');
    const ontem = somarDias(hoje(), -1);
    const r = await mover(estrela.id, 'Ganho', { concluidoEm: ontem });
    expect(r.statusCode, r.body).toBe(200);
    expect(r.json()).toMatchObject({ resultado: 'ganho', motivoPerda: null, fechadoEm: instanteLocal(ontem, '12:00').toISOString() });
    const [y, m, d] = ontem.split('-');
    expect(textos(r.json())).toContain(`marcou como ganho (${reais(1_250_000)}), estava em Negociação — fechou em ${d}/${m}/${y}`);
    expect(await auditoriaDe(estrela.id)).toContain(`Marcou COM-1 como ganho (${reais(1_250_000)}), estava em Negociação`);
  });

  it('quem não vê o painel não vê a negociação', async () => {
    expect((await marina.get(`/atendimento/chamados/${estrela.codigo}`)).statusCode).toBe(404);
    expect((await lia.get(`/atendimento/chamados/${estrela.codigo}`)).statusCode).toBe(200);
    expect((await lia.post(`/atendimento/chamados/${estrela.id}/mover`, { etapaId: etapa('Lead').id })).statusCode).toBe(403);
  });
});

describe('o quadro, o resumo, o relatório e o CSV', () => {
  let rel: RelatorioDeVendas;

  beforeAll(async () => {
    // mais negociações: duas do Diego (uma ganha no mês, uma perdida), uma aberta grande sem previsão
    const g = await abrir(diego, { titulo: 'Renovação do contrato', empresa: 'Clínica Sorriso', valor: 900_000, responsavelId: ids.diego });
    expect((await mover(g.id, 'Ganho', {}, diego)).statusCode).toBe(200);
    const p = await abrir(diego, { titulo: '10 ramais a mais', empresa: 'Escola Aprender', valor: 300_000, responsavelId: ids.diego });
    expect((await mover(p.id, 'Qualificação', {}, diego)).statusCode).toBe(200);
    expect((await mover(p.id, 'Perdido', { motivoPerda: 'Preço' }, diego)).statusCode).toBe(200);
    await abrir(camila, { titulo: 'Migração para nuvem — matriz e filiais', empresa: 'Rede Farma Mais', valor: 3_000_000, responsavelId: ids.camila });
    // uma negociação antiga: aberta há 20 dias (o ciclo do ganho conta da abertura)
    const antiga = await abrir(camila, { titulo: 'Atendimento com URA', empresa: 'Hotel Beira Mar', valor: 600_000, responsavelId: ids.camila });
    await app.db.update(tickets).set({ createdAt: new Date(Date.now() - 20 * 86_400_000) }).where(eq(tickets.id, antiga.id));
    expect((await mover(antiga.id, 'Ganho')).statusCode).toBe(200);
  });

  it('o quadro soma o valor de cada coluna; a maior vem primeiro', async () => {
    const r = await camila.get(`/atendimento/quadro?painel=${com.id}`);
    expect(r.statusCode, r.body).toBe(200);
    const col = (nome: string) => r.json().colunas.find((c: any) => c.etapa.nome === nome);
    expect(col('Lead')).toMatchObject({ total: 2, valor: 3_000_000 });
    // a de maior valor primeiro (a sem valor no fim)
    expect(col('Lead').chamados.map((c: any) => c.titulo)).toEqual(['Migração para nuvem — matriz e filiais', 'Troca de operadora']);
    expect(col('Proposta enviada')).toMatchObject({ total: 1, valor: 480_000 });
    expect(col('Ganho')).toMatchObject({ total: 3, valor: 1_250_000 + 900_000 + 600_000 });
  });

  it('o resumo do painel: o que está em negociação e o ganho do mês, com a meta', async () => {
    const r = await camila.get('/atendimento/paineis/resumo');
    expect(r.statusCode, r.body).toBe(200);
    const v = r.json().find((x: any) => x.painelId === com.id).vendas;
    const mes = hoje().slice(0, 7);
    const ontemNoMes = somarDias(hoje(), -1).startsWith(mes);
    expect(v).toMatchObject({
      emAndamento: 3_000_000 + 480_000, emAndamentoQtd: 3, metaMensal: 5_000_000, perdidosNoMes: 1,
      ganhosNoMes: ontemNoMes ? 3 : 2, ganhoNoMes: (ontemNoMes ? 1_250_000 : 0) + 900_000 + 600_000,
    });
    // o painel de Gestão não tem números de venda
    expect(r.json().find((x: any) => x.painelId === SUP).vendas).toBeNull();
  });

  it('o relatório: os números do período, o funil e as negociações por trás', async () => {
    const de = somarDias(hoje(), -30);
    const r = await camila.get(`/atendimento/vendas?painel=COM&de=${de}&ate=${hoje()}`);
    expect(r.statusCode, r.body).toBe(200);
    rel = r.json();
    expect(rel.numeros).toMatchObject({
      novos: { qtd: 7, valor: 1_250_000 + 480_000 + 900_000 + 300_000 + 3_000_000 + 600_000 },
      ganhos: { qtd: 3, valor: 2_750_000 }, perdidos: { qtd: 1, valor: 300_000 },
      conversao: 75, ticketMedio: Math.round(2_750_000 / 3),
    });
    expect(rel.numeros.novos.ids).toHaveLength(7);
    expect(rel.funil.map((f) => f.nome)).toEqual(['Lead', 'Qualificação', 'Proposta enviada', 'Negociação']);
    expect(rel.funil[0]!.chegaram).toHaveLength(7);
    // chegaram à Qualificação: a perdida (passou por ela), a da Proposta, a do Ganho de ontem (passou pela Negociação) e as duas ganhas direto do Lead
    // — e a perdida foi perdida lá
    expect(rel.funil[1]!.chegaram).toHaveLength(5);
    expect(rel.funil[1]!.perdidas).toEqual(rel.numeros.perdidos.ids);
    expect(rel.funilGanhas).toHaveLength(3);
    // a janela do número: a negociação com a empresa, quem cuida, o resultado e o motivo
    expect(rel.negociacoes.find((n) => n.id === rel.numeros.perdidos.ids[0])).toMatchObject({
      titulo: '10 ramais a mais', empresa: 'Escola Aprender', responsavel: 'Diego Farias', resultado: 'perdido', motivoPerda: 'Preço', valor: 300_000,
    });
    // trinta dias para trás não é um mês: comparado com os trinta dias de antes
    expect(rel.anterior).toMatchObject({ nome: 'o período anterior', ate: somarDias(de, -1) });
  });

  it('o relatório do mês: comparado com o mesmo pedaço do mês passado', async () => {
    const mes = hoje().slice(0, 7);
    const r = (await camila.get(`/atendimento/vendas?painel=COM&de=${mes}-01&ate=${hoje()}`)).json() as RelatorioDeVendas;
    const ontemNoMes = somarDias(hoje(), -1).startsWith(mes);
    expect(r.numeros.ganhos.valor).toBe((ontemNoMes ? 1_250_000 : 0) + 900_000 + 600_000);
    expect(r.anterior.nome).toMatch(/^o mesmo período de /);
    expect(r.anterior.numeros.ganhos.qtd).toBe(0);
  });

  it('o relatório só de painel de Vendas e de quem vê o painel', async () => {
    const de = somarDias(hoje(), -30);
    expect((await lia.get(`/atendimento/vendas?painel=${com.id}&de=${de}&ate=${hoje()}`)).statusCode).toBe(200);
    expect((await marina.get(`/atendimento/vendas?painel=${com.id}&de=${de}&ate=${hoje()}`)).statusCode).toBe(404);
    const sup = await s.get(`/atendimento/vendas?painel=${SUP}&de=${de}&ate=${hoje()}`);
    expect(sup.statusCode).toBe(400);
    expect(sup.json().error).toContain('não é de vendas');
    expect((await s.get(`/atendimento/vendas?painel=${com.id}&de=${hoje()}&ate=${de}`)).statusCode).toBe(400);
  });

  it('o CSV só de negociações leva o valor, o resultado e o motivo da perda', async () => {
    const r = await camila.get(`/atendimento/chamados/exportar?painel=${com.id}&situacao=todos`);
    expect(r.statusCode, r.body).toBe(200);
    const [cab, ...linhas] = r.body.replace(/^﻿/, '').split('\r\n');
    expect(cab).toContain('Valor (R$);Resultado;Motivo da perda;Produtos');
    expect(cab).not.toContain('Gravidade');
    expect(linhas.find((l) => l.startsWith('COM-6;'))).toContain(';30000,00;');
    expect(linhas.find((l) => l.includes('Escola Aprender'))).toContain(';Perdido;Preço;');
  });
});

describe('o histórico e a troca de painel', () => {
  it('a negociação é criada (o chamado é aberto)', async () => {
    const f = await ficha('COM-1', camila);
    expect((f.historico as any[]).find((e) => e.tipo === 'criado').texto).toBe('criou a negociação em Lead');
  });

  it('a negociação não passa para o Suporte, nem o chamado para o Comercial: o caminho é o filho', async () => {
    const paraOSuporte = await s.post(`/atendimento/chamados/COM-2/painel`, { painelId: SUP });
    expect(paraOSuporte.statusCode).toBe(400);
    expect(paraOSuporte.json().error).toContain('COM-2 é uma negociação: só passa para outro painel de Vendas');
    const chamado = (await s.post('/atendimento/chamados', { painelId: SUP, titulo: 'Quer o orçamento de mais ramais' })).json() as { id: string; codigo: string };
    const paraOComercial = await s.post(`/atendimento/chamados/${chamado.id}/painel`, { painelId: com.id });
    expect(paraOComercial.statusCode).toBe(400);
    expect(paraOComercial.json().error).toContain('um chamado não vira negociação trocando de painel');
    // o filho no Comercial: a negociação nasce ligada ao chamado do Suporte
    const filho = await abrir(s, { titulo: 'Mais 10 ramais', paiId: chamado.codigo, valor: 90_000 });
    expect(await ficha(filho.codigo)).toMatchObject({ painelId: com.id, pai: { codigo: chamado.codigo }, valor: 90_000 });
  });

  it('entre os painéis de Vendas, passa com o valor e entra no funil (o Ganho se marca na janela dele)', async () => {
    const r = await s.post('/atendimento/paineis', { nome: 'Revenda', sigla: 'rev', cor: 'roxo', tipo: 'vendas', acesso: 'todos', ajustes: {} });
    expect(r.statusCode, r.body).toBe(201);
    const rev = r.json() as Painel;
    const ganho = rev.etapas.find((e) => e.resultado === 'ganho')!;
    const direto = await s.post(`/atendimento/chamados/COM-2/painel`, { painelId: rev.id, etapaId: ganho.id });
    expect(direto.statusCode).toBe(400);
    expect(direto.json().error).toBe(TROCA_ENTRA_NO_FUNIL);
    const vai = await s.post(`/atendimento/chamados/COM-2/painel`, { painelId: rev.id });
    expect(vai.statusCode, vai.body).toBe(200);
    expect(vai.json()).toMatchObject({ codigo: 'COM-2', painelId: rev.id, etapaId: rev.etapas[0]!.id, empresa: 'Mercado Bom Preço', resultado: null });
  });
});
