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
 *  - o relatório de vendas (o que o Luan escolheu, 17/10): os números do período com a comparação, os
 *    ganhos mês a mês e o funil; só dos painéis de Vendas e de quem vê o painel
 *  - o CSV só de negociações
 *  - o histórico diz "criou a negociação"; a troca de painel fica entre os painéis de Vendas (entrando no
 *    funil): a negociação não vira chamado nem o chamado vira negociação; entre eles, o Ligar
 *  - a negociação não tem pai nem filhos, nem entra num problema (o pedido do Luan na prévia, 17/10: "n
 *    precisa de pais e filhas aqui")
 *  - o Comercial tem permissão própria (`sales.read`, 19/10: "isso tbm tem q ter um nível de permissão"):
 *    sem ela, os painéis de Vendas não aparecem; só com ela (sem ver os chamados), o Comercial funciona
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { tickets } from '@gestor/db';
import {
  AJUSTES_DO_PAINEL_DE_VENDAS, diaLocal, instanteLocal, MOTIVOS_DE_PERDA_PADRAO, reais, somarDias, textoDoEvento, TROCA_ENTRA_NO_FUNIL,
  NEGOCIACAO_SEM_PAI, NEGOCIACAO_SEM_PROBLEMA, negociacaoNaoEIncidente, negociacaoNaoEPai, VALOR_E_A_SOMA, VALOR_SO_DOS_PRODUTOS, CAMPOS_DO_PAINEL_DE_VENDAS,
  NEGOCIACAO_SEM_LIGACAO, negociacaoNaoSeLiga,
  ATIVACAO_E_A_SOMA, MENSAGEM_DO_TITULO,
  type CampoPersonalizado,
  type EtapaPainel, type Painel, type RelatorioDeVendas,
} from '@gestor/shared';
import { makeApp, Session, type App } from './helpers.js';
import { esperarSegundoPlano } from '../src/services/atendimento/avisos.js';

let app: App;
let s: Session;        // a administração (cuida dos chamados)
let camila: Session;   // Comercial (o papel Comercial)
let diego: Session;    // Comercial (o papel Comercial)
let marina: Session;   // só o Suporte (Operador): não vê o Comercial
let lia: Session;      // só lê o Comercial (um papel com ver os chamados e ver o Comercial, sem trabalhar)
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
  // o papel pela chave (os do sistema) ou pelo nome (os criados pela tela)
  const r = await s.post('/admin/users', { name: nome, email, password: 'SenhaDeTeste!123', roleId: papeis.find((x: any) => x.key === papel || x.name === papel).id });
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
  const c = await pessoa('Camila Souza', 'camila@gestor.local', 'comercial');
  const d = await pessoa('Diego Farias', 'diego@gestor.local', 'comercial');
  const m = await pessoa('Marina Costa', 'marina@gestor.local', 'operador');
  const leitura = await s.post('/admin/roles', { name: 'Leitor do Comercial', description: 'só lê', permissions: ['records.read', 'support.read', 'sales.read'] });
  expect(leitura.statusCode, leitura.body).toBe(201);
  const l = await pessoa('Lia Rocha', 'lia@gestor.local', 'Leitor do Comercial');
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
    // os campos do Comercial do Helena (o print do Luan, 17/10), menos a Área de atuação
    const campos = ((await s.get('/atendimento/opcoes')).json().campos as CampoPersonalizado[]).filter((c) => c.painelId === com.id);
    // sem os Contatos principais (2.3: "já tem essa parte de contatos na lateral")
    expect(campos.map((c) => `${c.nome}:${c.tipo}`)).toEqual(['CNPJ:texto', 'Origem de lead:lista', 'Indicação:lista']);
    // a Indicação é a lista que cresce no próprio formulário (2.0.3): nasce vazia, e se inclui na hora
    expect(campos.find((c) => c.nome === 'Indicação')).toMatchObject({ opcoes: [], incluirNaHora: true });
    expect(campos.find((c) => c.nome === 'Origem de lead')!.incluirNaHora).toBe(false);
    expect(campos.find((c) => c.nome === 'Origem de lead')!.opcoes.map((o) => o.nome)).toEqual(CAMPOS_DO_PAINEL_DE_VENDAS.find((c) => c.nome === 'Origem de lead')!.opcoes);
    expect(await auditoriaDe(com.id)).toEqual([expect.stringContaining('e os campos CNPJ, Origem de lead e Indicação')]);
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

  it('a Proposta pede o valor; a mensalidade muda com o histórico em reais', async () => {
    const sem = await abrir(camila, { titulo: 'Central para a filial', empresa: 'Auto Peças Rocha' });
    const r = await mover(sem.id, 'Proposta enviada');
    expect(r.statusCode).toBe(400);
    expect(r.json().error).toBe('Para ir para Proposta enviada, falta preencher: Mensalidade.');
    const valor = await camila.patch(`/atendimento/chamados/${sem.id}`, { valor: 480_000 });
    expect(valor.statusCode, valor.body).toBe(200);
    expect(textos(valor.json())).toContain(`mudou Mensalidade para "${reais(480_000)}"`);
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
    expect(textos(r.json())).toContain(`marcou como ganho (${reais(1_250_000)}/mês), estava em Negociação — fechou em ${d}/${m}/${y}`);
    expect(await auditoriaDe(estrela.id)).toContain(`Marcou COM-1 como ganho (${reais(1_250_000)}/mês), estava em Negociação`);
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
    // os ganhos mês a mês: os 12 meses até o de hoje; o de hoje com as ganhas do período, e a janela acha cada uma
    expect(r.meses).toHaveLength(12);
    expect(r.meses.at(-1)).toMatchObject({ mes, ganho: r.numeros.ganhos.valor, qtd: r.numeros.ganhos.qtd });
    // (a de ontem pode ser do mês passado, no dia 1º; antes dele, nada)
    expect(r.meses.slice(0, -2).every((m) => m.ganho === 0)).toBe(true);
    expect(r.meses.at(-1)!.ids.every((id) => r.negociacoes.some((n) => n.id === id))).toBe(true);
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
    expect(cab).toContain('Mensalidade (R$);Ativação (R$);Resultado;Motivo da perda;Produtos');
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

  it('a negociação não passa para o Suporte, nem o chamado para o Comercial: abre-se o outro lá', async () => {
    const paraOSuporte = await s.post(`/atendimento/chamados/COM-2/painel`, { painelId: SUP });
    expect(paraOSuporte.statusCode).toBe(400);
    expect(paraOSuporte.json().error).toBe('COM-2 é uma negociação: só passa para outro painel de Vendas. Para levar o trabalho ao Suporte, abra um chamado lá.');
    const chamado = (await s.post('/atendimento/chamados', { painelId: SUP, titulo: 'Quer o orçamento de mais ramais' })).json() as { id: string; codigo: string };
    const paraOComercial = await s.post(`/atendimento/chamados/${chamado.id}/painel`, { painelId: com.id });
    expect(paraOComercial.statusCode).toBe(400);
    expect(paraOComercial.json().error).toBe('O Comercial é um painel de Vendas: um chamado não vira negociação trocando de painel. Crie a negociação lá.');
  });

  it('a negociação não se liga a nada (o pedido do Luan: "n precisa ligações"); o código citado no texto continua virando link', async () => {
    const chamado = (await s.post('/atendimento/chamados', { painelId: SUP, titulo: 'Quer o orçamento de mais ramais', relato: 'O orçamento está na COM-2.' })).json() as { id: string; codigo: string };
    const negociacao = await abrir(s, { titulo: 'Mais 10 ramais', valor: 90_000, descricao: `Pedido no chamado ${chamado.codigo}.` });
    const dela = await s.post(`/atendimento/chamados/${negociacao.id}/ligacoes`, { para: chamado.codigo, tipo: 'relacionado' });
    expect(dela.statusCode).toBe(400);
    expect(dela.json().error).toBe(NEGOCIACAO_SEM_LIGACAO);
    const doChamado = await s.post(`/atendimento/chamados/${chamado.id}/ligacoes`, { para: negociacao.codigo, tipo: 'relacionado' });
    expect(doChamado.statusCode).toBe(400);
    expect(doChamado.json().error).toBe(negociacaoNaoSeLiga(negociacao.codigo));
    // a negociação: sem ligações e sem desenho; o código citado na descrição é um link
    const f = await ficha(negociacao.codigo);
    expect(f).toMatchObject({ ligacoes: [], filhosLista: [] });
    expect(f.grafo.arestas).toEqual([]);
    expect(f.referencias).toContainEqual(expect.objectContaining({ codigo: chamado.codigo, existe: true }));
    // o chamado do Suporte: a negociação citada no relato é um link, mas não entra no desenho
    const c = await ficha(chamado.codigo);
    expect(c.referencias).toContainEqual(expect.objectContaining({ codigo: 'COM-2', existe: true }));
    expect((c.grafo.nos as Array<{ codigo: string }>).map((n) => n.codigo)).not.toContain('COM-2');
    expect((c.grafo.nos as Array<{ codigo: string }>).map((n) => n.codigo)).not.toContain(negociacao.codigo);
  });

  it('os campos do Comercial: a negociação nasce com eles preenchidos (pelo nome, como o robô e o n8n mandam)', async () => {
    const n = await abrir(camila, {
      titulo: 'Central para a clínica nova', empresa: 'Clínica Sorriso', campos: { CNPJ: '11.444.777/0001-61', 'Origem de lead': 'indicação', 'Indicação': 'Dra. Lívia, do Prado & Lima' },
    });
    const f = await ficha(n.codigo);
    const campos = ((await s.get('/atendimento/opcoes')).json().campos as CampoPersonalizado[]).filter((c) => c.painelId === com.id);
    const id = (nome: string) => campos.find((c) => c.nome === nome)!.id;
    const origem = campos.find((c) => c.nome === 'Origem de lead')!.opcoes.find((o) => o.nome === 'Indicação')!.id;
    // a Indicação escrita (o robô e o n8n mandam o nome) entra na lista dela (2.0.3) e a negociação fica com a opção
    const indicacao = campos.find((c) => c.nome === 'Indicação')!.opcoes.find((o) => o.nome === 'Dra. Lívia, do Prado & Lima')!.id;
    expect(f.campos).toEqual({ [id('CNPJ')]: '11.444.777/0001-61', [id('Origem de lead')]: origem, [id('Indicação')]: indicacao });
    const errada = await camila.post('/atendimento/chamados', { painelId: com.id, titulo: 'Outra', empresa: 'X', campos: { 'Origem de lead': 'Rádio' } });
    expect(errada.statusCode).toBe(400);
    expect(errada.json().error).toContain('"Rádio" não é uma das opções');
  });

  it('a Indicação: a opção se inclui ali mesmo, por quem trabalha no painel; a mesma (escrita de outro jeito) não se repete', async () => {
    const campos = ((await s.get('/atendimento/opcoes')).json().campos as CampoPersonalizado[]).filter((c) => c.painelId === com.id);
    const indicacao = campos.find((c) => c.nome === 'Indicação')!;
    const origem = campos.find((c) => c.nome === 'Origem de lead')!;
    const g5 = await camila.post(`/atendimento/campos/${indicacao.id}/opcoes`, { nome: '  G5  Telecom ' });
    expect(g5.statusCode, g5.body).toBe(200);
    expect(g5.json()).toMatchObject({ nome: 'G5 Telecom', ativa: true });
    // escrita de outro jeito, é a mesma (e não vai de novo para a auditoria)
    expect((await camila.post(`/atendimento/campos/${indicacao.id}/opcoes`, { nome: 'g5 telecom' })).json().id).toBe(g5.json().id);
    expect(await auditoriaDe(indicacao.id)).toEqual(['Incluiu a opção G5 Telecom em Indicação']);
    // a lista que não inclui na hora muda só nos Ajustes
    const origemNova = await camila.post(`/atendimento/campos/${origem.id}/opcoes`, { nome: 'Rádio' });
    expect(origemNova.statusCode).toBe(400);
    expect(origemNova.json().error).toBe('As opções de Origem de lead se mudam em Painéis › Ajustes › Campos.');
    // quem não vê o painel não acha o campo; quem só lê não inclui
    expect((await marina.post(`/atendimento/campos/${indicacao.id}/opcoes`, { nome: 'Outro' })).statusCode).toBe(404);
    expect((await lia.post(`/atendimento/campos/${indicacao.id}/opcoes`, { nome: 'Outro' })).statusCode).toBe(403);
    // e a negociação escolhe a opção pelo id
    const n = await abrir(camila, { titulo: 'Indicada pela G5', empresa: 'Mercado Bom Preço', campos: { [indicacao.id]: g5.json().id } });
    expect((await ficha(n.codigo)).campos[indicacao.id]).toBe(g5.json().id);
  });

  it('o título é opcional (2.0.3): vazio, fica o nome da empresa — e acompanha a empresa quando ela muda', async () => {
    const n = await abrir(camila, { titulo: '', empresa: 'Hospital São Matheus' });
    expect((await ficha(n.codigo)).titulo).toBe('Hospital São Matheus');
    // a empresa mudou: o título que era o nome dela vai junto
    const r = await camila.patch(`/atendimento/chamados/${n.id}`, { empresa: 'Hospital São Mateus' });
    expect(r.statusCode, r.body).toBe(200);
    expect(r.json().titulo).toBe('Hospital São Mateus');
    // virou cliente: o título passa a ser o nome do cliente
    const cliente = await s.post('/clients', { tradeName: 'Hospital São Matheus', legalName: 'Hospital São Matheus LTDA', cnpj: '22.333.444/0001-81' });
    expect(cliente.statusCode, cliente.body).toBe(201);
    const v = await camila.patch(`/atendimento/chamados/${n.id}`, { clienteId: cliente.json().id, empresa: null });
    expect(v.statusCode, v.body).toBe(200);
    expect(v.json().titulo).toBe('Hospital São Matheus');
    // o título escrito não muda com a empresa
    const escrito = await abrir(camila, { titulo: 'PABX com 40 ramais', empresa: 'Padaria Estrela' });
    const e = await camila.patch(`/atendimento/chamados/${escrito.id}`, { empresa: 'Padaria Estrela Ltda' });
    expect(e.json().titulo).toBe('PABX com 40 ramais');
    // limpar o título na ficha volta ao nome da empresa; curto demais, não
    expect((await camila.patch(`/atendimento/chamados/${escrito.id}`, { titulo: '' })).json().titulo).toBe('Padaria Estrela Ltda');
    const curto = await camila.patch(`/atendimento/chamados/${escrito.id}`, { titulo: 'ab' });
    expect(curto.statusCode).toBe(400);
    expect(curto.json().error).toBe(MENSAGEM_DO_TITULO.negociacao);
    // sem título e sem empresa, não abre
    const sem = await camila.post('/atendimento/chamados', { painelId: com.id, titulo: '' });
    expect(sem.statusCode).toBe(400);
    expect(sem.json().error).toBe(MENSAGEM_DO_TITULO.semEmpresa);
    // o chamado continua pedindo o título
    const chamado = await s.post('/atendimento/chamados', { painelId: SUP, titulo: '' });
    expect(chamado.statusCode).toBe(400);
    expect(chamado.json().error).toBe(MENSAGEM_DO_TITULO.chamado);
  });

  it('a negociação não tem pai nem filhos, nem entra num problema', async () => {
    const chamado = (await s.post('/atendimento/chamados', { painelId: SUP, titulo: 'A implantação do PABX' })).json() as { id: string; codigo: string };
    const recusa = async (r: { statusCode: number; json: () => any }, erro: string) => {
      expect(r.statusCode).toBe(400);
      expect(r.json().error).toBe(erro);
    };
    // nascer como filha de um chamado, ou o chamado nascer como filho dela
    await recusa(await s.post('/atendimento/chamados', { painelId: com.id, titulo: 'Mais 10 ramais', paiId: chamado.codigo }), NEGOCIACAO_SEM_PAI);
    await recusa(await s.post('/atendimento/chamados', { painelId: SUP, titulo: 'Implantar', paiId: 'COM-2' }), negociacaoNaoEPai('COM-2'));
    // o pai depois: nem dela, nem ela de pai
    await recusa(await s.post('/atendimento/chamados/COM-2/pai', { pai: chamado.codigo }), NEGOCIACAO_SEM_PAI);
    await recusa(await s.post(`/atendimento/chamados/${chamado.id}/pai`, { pai: 'COM-2' }), negociacaoNaoEPai('COM-2'));
    // o problema: nem no painel de Vendas, nem com a negociação de incidente
    await recusa(await s.post('/atendimento/chamados', { painelId: com.id, titulo: 'Queda geral', tipoChamado: 'problema' }), NEGOCIACAO_SEM_PROBLEMA);
    await recusa(await s.post('/atendimento/chamados', { painelId: SUP, titulo: 'Queda geral', tipoChamado: 'problema', incidentes: ['COM-2'] }), negociacaoNaoEIncidente('COM-2'));
    const problema = await s.post('/atendimento/chamados', { painelId: SUP, titulo: 'Queda geral', tipoChamado: 'problema' });
    expect(problema.statusCode, problema.body).toBe(201);
    await recusa(await s.post('/atendimento/chamados/COM-2/problema', { problema: problema.json().codigo }), NEGOCIACAO_SEM_PROBLEMA);
    expect(await ficha('COM-2')).toMatchObject({ pai: null, problema: null, filhosLista: [] });
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

describe('o valor por produto (o pedido do Luan: "dividir o valor por produtos e no final tenha o total")', () => {
  it('cada produto com o seu valor: o total é o valor da negociação; o produto que sai leva o valor dele', async () => {
    const catalogo = (await s.get('/admin/products')).json() as Array<{ id: string; code: string; name: string }>;
    const produto = (codigo: string) => catalogo.find((p) => p.code === codigo)!;
    const pbx = produto('linepbx');
    const tronco = produto('voicenet');
    const chat = produto('linechat');
    const n = await abrir(camila, { titulo: 'Central e tronco para a matriz', empresa: 'Grupo Teste', produtos: [pbx.id, tronco.id], valoresDosProdutos: { [pbx.id]: 980_000, [tronco.id]: 270_000 } });
    expect(await ficha(n.codigo)).toMatchObject({ valor: 1_250_000, valoresDosProdutos: { [pbx.id]: 980_000, [tronco.id]: 270_000 } });
    // só os produtos da negociação têm valor
    const fora = await camila.post('/atendimento/chamados', { painelId: com.id, titulo: 'Outra', empresa: 'X', produtos: [pbx.id], valoresDosProdutos: { [chat.id]: 100 } });
    expect(fora.statusCode).toBe(400);
    expect(fora.json().error).toBe(VALOR_SO_DOS_PRODUTOS);

    // o valor de um produto muda: o total acompanha, e o histórico diz os dois
    const mudou = await camila.patch(`/atendimento/chamados/${n.id}`, { valoresDosProdutos: { [pbx.id]: 900_000, [tronco.id]: 270_000 } });
    expect(mudou.statusCode, mudou.body).toBe(200);
    expect(mudou.json()).toMatchObject({ valor: 1_170_000 });
    const historico = textos(mudou.json()).join('\n');
    expect(historico).toContain(`${pbx.name} ${reais(900_000)} · ${tronco.name} ${reais(270_000)}`);
    expect(historico).toContain(reais(1_170_000));
    // o valor direto, com a divisão: recusado
    const direto = await camila.patch(`/atendimento/chamados/${n.id}`, { valor: 1_000_000 });
    expect(direto.statusCode).toBe(400);
    expect(direto.json().error).toBe(VALOR_E_A_SOMA);

    // o produto que sai leva o valor dele; o que entra fica sem valor
    const saiu = (await camila.patch(`/atendimento/chamados/${n.id}`, { produtos: [pbx.id, chat.id] })).json();
    expect(saiu).toMatchObject({ valor: 900_000, valoresDosProdutos: { [pbx.id]: 900_000 } });
    expect(Object.keys(saiu.valoresDosProdutos)).toEqual([pbx.id]);
    // na planilha, a coluna dos produtos leva o valor de cada um
    const csv = (await camila.get(`/atendimento/chamados/exportar?painel=${com.id}&situacao=todos`)).body as string;
    expect(csv.split('\r\n').find((l) => l.includes('Central e tronco para a matriz'))).toContain(`;9000,00;;;;${pbx.name} (${reais(900_000)}/mês), ${chat.name};`);

    // de volta a um valor só: o total fica, e o valor volta a mudar direto
    expect((await camila.patch(`/atendimento/chamados/${n.id}`, { valoresDosProdutos: {}, valor: 900_000 })).json()).toMatchObject({ valor: 900_000, valoresDosProdutos: {} });
    expect((await camila.patch(`/atendimento/chamados/${n.id}`, { valor: 950_000 })).json()).toMatchObject({ valor: 950_000 });
  });

  it('a ativação: única ou por produto, à parte da mensalidade no relatório (o número e o mês a mês dela); a etapa que pede o valor pede a mensalidade', async () => {
    const catalogo = (await s.get('/admin/products')).json() as Array<{ id: string; code: string; name: string }>;
    const pbx = catalogo.find((p) => p.code === 'linepbx')!;
    const tronco = catalogo.find((p) => p.code === 'voicenet')!;
    // por produto: a mensalidade e a ativação de cada um, e os dois totais
    const n = await abrir(camila, {
      titulo: 'Central nova com tronco', empresa: 'Grupo Ativação', produtos: [pbx.id, tronco.id],
      valoresDosProdutos: { [pbx.id]: 98_000, [tronco.id]: 27_000 }, ativacoesDosProdutos: { [pbx.id]: 150_000, [tronco.id]: 40_000 },
    });
    expect(await ficha(n.codigo)).toMatchObject({ valor: 125_000, ativacao: 190_000, ativacoesDosProdutos: { [pbx.id]: 150_000, [tronco.id]: 40_000 } });
    const direto = await camila.patch(`/atendimento/chamados/${n.id}`, { ativacao: 100_000 });
    expect(direto.statusCode).toBe(400);
    expect(direto.json().error).toBe(ATIVACAO_E_A_SOMA);
    const mudou = (await camila.patch(`/atendimento/chamados/${n.id}`, { ativacoesDosProdutos: { [pbx.id]: 120_000 } })).json();
    expect(mudou).toMatchObject({ valor: 125_000, ativacao: 120_000 });
    expect(textos(mudou).join('\n')).toContain(`Ativação por produto`);
    // não há venda só de ativação (o Luan, em 19/10): a Proposta enviada, que pede o valor, pede a mensalidade
    const so = await abrir(camila, { titulo: 'Instalação dos aparelhos', empresa: 'Grupo Ativação', ativacao: 80_000 });
    const semMensalidade = await mover(so.id, 'Proposta enviada');
    expect(semMensalidade.statusCode).toBe(400);
    expect(semMensalidade.json().error).toBe('Para ir para Proposta enviada, falta preencher: Mensalidade.');
    expect((await camila.patch(`/atendimento/chamados/${so.id}`, { valor: 50_000 })).statusCode).toBe(200);
    expect((await mover(so.id, 'Proposta enviada')).statusCode).toBe(200);
    // ganha: a mensalidade entra no Ganho; a ativação, só no número e no mês a mês dela (19/10)
    const hojeAqui = hoje();
    const antes = (await camila.get(`/atendimento/vendas?painel=${com.id}&de=${hojeAqui}&ate=${hojeAqui}`)).json() as RelatorioDeVendas;
    expect((await mover(so.id, 'Ganho')).statusCode).toBe(200);
    const depois = (await camila.get(`/atendimento/vendas?painel=${com.id}&de=${hojeAqui}&ate=${hojeAqui}`)).json() as RelatorioDeVendas;
    expect(depois.numeros.ganhos.qtd).toBe(antes.numeros.ganhos.qtd + 1);
    expect(depois.numeros.ganhos.valor).toBe(antes.numeros.ganhos.valor + 50_000);
    expect(depois.numeros.ativacoes).toMatchObject({ qtd: antes.numeros.ativacoes.qtd + 1, valor: antes.numeros.ativacoes.valor + 80_000 });
    expect(depois.numeros.ativacoes.ids).toContain(so.id);
    expect(depois.mesesDaAtivacao).toHaveLength(12);
    expect(depois.mesesDaAtivacao.at(-1)).toMatchObject({ mes: hojeAqui.slice(0, 7), ganho: 80_000, qtd: 1, ids: [so.id] });
    expect(depois.negociacoes.find((x) => x.id === so.id)).toMatchObject({ valor: 50_000, ativacao: 80_000 });
    // na planilha, as duas colunas
    const csv = (await camila.get(`/atendimento/chamados/exportar?painel=${com.id}&situacao=todos`)).body as string;
    expect(csv.split('\r\n').find((l) => l.includes('Instalação dos aparelhos'))).toContain(';500,00;800,00;Ganho;');
  });

  it('o valor vai até R$ 100 milhões (mais do que cabe num integer)', async () => {
    const n = await abrir(camila, { titulo: 'Rede nacional', empresa: 'Grande Cliente', valor: 3_000_000_000 });
    expect(await ficha(n.codigo)).toMatchObject({ valor: 3_000_000_000 });
  });
});

describe('o Comercial tem permissão própria (19/10: "isso tbm tem q ter um nível de permissão")', () => {
  it('os papéis: o Administrador e o Comercial vêm com ela; o Operador, o Técnico e o Leitor, não', async () => {
    const papeis = (await s.get('/admin/roles')).json() as Array<{ key: string | null; permissions: string[] }>;
    const tem = (k: string) => papeis.find((p) => p.key === k)!.permissions.includes('sales.read');
    expect([tem('administrador'), tem('comercial'), tem('operador'), tem('tecnico'), tem('leitor')]).toEqual([true, true, false, false, false]);
    expect(((await s.get('/admin/permissions')).json() as Array<{ key: string }>).map((p) => p.key)).toContain('sales.read');
  });

  it('sem ela, o painel de Vendas não existe, nem o "Todos que veem" (como o painel de escolhidos: 404, nunca 403)', async () => {
    const rev = ((await s.get('/atendimento/opcoes')).json().paineis as Painel[]).find((p) => p.sigla === 'REV')!;
    expect(rev).toMatchObject({ tipo: 'vendas', acesso: 'todos' });
    const daMarina = (await marina.get('/atendimento/opcoes')).json().paineis as Painel[];
    expect(daMarina.some((p) => p.tipo === 'vendas')).toBe(false);
    expect(daMarina.map((p) => p.id)).toContain(SUP);
    expect((await marina.get(`/atendimento/quadro?painel=${rev.id}`)).statusCode).toBe(404);
    expect((await marina.get(`/atendimento/vendas?painel=${rev.id}&de=${hoje()}&ate=${hoje()}`)).statusCode).toBe(404);
    expect((await marina.post('/atendimento/chamados', { painelId: rev.id, titulo: 'Tentar vender', empresa: 'X' })).statusCode).toBe(404);
    expect(((await marina.get('/atendimento/paineis/resumo')).json() as Array<{ painelId: string }>).map((r) => r.painelId)).not.toContain(rev.id);
  });

  it('só com ela (sem ver os chamados): o Comercial funciona, e o Suporte não aparece', async () => {
    const r = await s.post('/admin/roles', { name: 'Só o Comercial', description: 'vendas, sem os chamados', permissions: ['records.read', 'sales.read', 'tickets.work'] });
    expect(r.statusCode, r.body).toBe(201);
    const v = await pessoa('Vera Lima', 'vera@gestor.local', 'Só o Comercial');
    const opcoes = await v.sessao.get('/atendimento/opcoes');
    expect(opcoes.statusCode, opcoes.body).toBe(200);
    const paineis = opcoes.json().paineis as Painel[];
    // a Revenda é de todos; o Comercial, só dos escolhidos (a Vera não está)
    expect(paineis.map((p) => p.sigla)).toEqual(['REV']);
    const rev = paineis[0]!;
    expect((await v.sessao.get(`/atendimento/quadro?painel=${rev.id}`)).statusCode).toBe(200);
    expect((await v.sessao.get(`/atendimento/quadro?painel=${SUP}`)).statusCode).toBe(404);
    expect((await v.sessao.get(`/atendimento/vendas?painel=${rev.id}&de=${hoje()}&ate=${hoje()}`)).statusCode).toBe(200);
    const nova = await v.sessao.post('/atendimento/chamados', { painelId: rev.id, titulo: 'Central para a loja nova', empresa: 'Loja Nova', valor: 45_000 });
    expect(nova.statusCode, nova.body).toBe(201);
    expect((await v.sessao.get('/atendimento/meu-dia')).statusCode).toBe(200);
    expect((await v.sessao.get('/calendario/eventos?de=2026-10-01&ate=2026-10-31')).statusCode).not.toBe(403);
    // a cópia dos tickets do LineChat (Suporte › Relatórios) continua de quem vê os chamados
    expect((await v.sessao.get('/chamados/resumo')).statusCode).toBe(403);
  });
});
