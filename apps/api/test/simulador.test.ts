/**
 * Patch 2.0.2 — o SIMULADOR DO COMERCIAL (decisão 0052): a conta de uma venda antes de fechar. As escolhas
 * do Luan na página de opções (20/10): o Simulador no grupo Comercial, cada simulação com nome e, se quiser,
 * ligada a uma negociação; o imposto num percentual só, dos Ajustes, que muda na simulação; a tabela de
 * custos e os modelos por produto nos Ajustes; o aparelho em comodato, venda ou locação; quem tem o
 * Comercial vê tudo.
 *
 *  - quem vê: o Comercial (`sales.read`); quem cria e muda: também trabalha nas negociações (`tickets.work`);
 *    os Ajustes: quem cuida dos painéis (`tickets.manage`)
 *  - os Ajustes: o padrão, a validação e a auditoria; as simulações feitas não mudam com a tabela
 *  - a simulação: criar, ler, a lista com o cenário principal resumido (a margem, o sinal), mudar (a
 *    auditoria diz o que mudou), duplicar, a lixeira e a volta dela
 *  - a negociação ligada: só de painel de Vendas que a pessoa vê; quem não vê o painel não vê a negociação
 *    (e a ligação fica como estava quando ela salva); a ficha da negociação lista as simulações
 *  - o Excel: quem vê exporta a planilha com as fórmulas (uma folha por cenário e a "Lado a lado"), na auditoria
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  AJUSTES_DO_SIMULADOR_PADRAO, CUSTOS_DA_HELENA, MODELO_DA_HELENA, TIPO_DO_XLSX, cenarioNovo, contasDoCenario, diaLocal, lerZipSemCompressao, resumoDoCenario,
  type AjustesDoSimulador, type CenarioDaSimulacao, type Painel, type Simulacao, type SimulacaoNaLista,
} from '@gestor/shared';
import { makeApp, Session, type App } from './helpers.js';
import { esperarSegundoPlano } from '../src/services/atendimento/avisos.js';

let app: App;
let s: Session;        // a administração (cuida dos painéis)
let camila: Session;   // Comercial: vê o painel COM
let diego: Session;    // Comercial: vê só o painel VIP (escolhidos)
let marina: Session;   // Operador: não vê o Comercial
let lia: Session;      // só lê o Comercial
const ids = { camila: '', diego: '', marina: '', lia: '' };
let com: Painel;
let vip: Painel;
let negociacao = { id: '', codigo: '' };
let daVip = { id: '', codigo: '' };
let suporte = { id: '', codigo: '' };

async function pessoa(nome: string, email: string, papel: string) {
  const papeis = (await s.get('/admin/roles')).json();
  const r = await s.post('/admin/users', { name: nome, email, password: 'SenhaDeTeste!123', roleId: papeis.find((x: any) => x.key === papel || x.name === papel).id });
  expect(r.statusCode, r.body).toBe(201);
  const sessao = new Session(app);
  await sessao.login(email, 'SenhaDeTeste!123');
  return { id: r.json().id as string, sessao };
}
const auditoriaDe = async (id: string) => ((await s.get(`/admin/audit?entityId=${id}&pageSize=50`)).json().items as Array<{ summary: string }>).map((a) => a.summary);
const semEspacoDuro = (t: string) => t.replace(/ /g, ' ');

/** Os de fábrica (a tabela da Helena e o modelo do LineChat) e o que a administração põe: os custos do PABX. */
const AJUSTES: AjustesDoSimulador = {
  ...AJUSTES_DO_SIMULADOR_PADRAO, imposto: 8,
  custos: [
    ...CUSTOS_DA_HELENA,
    { id: 'yealink', nome: 'Yealink T31P', tipo: 'aparelho', valor: null, porRamal: true, modalidade: 'comodato', faixas: null, unidade: null },
    { id: 'nuvem', nome: 'Nuvem do PABX', tipo: 'mensal', valor: 900, porRamal: true, modalidade: null, faixas: null, unidade: 'ramal' },
    { id: 'dids', nome: 'Números da operadora', tipo: 'mensal', valor: 1_500, porRamal: false, modalidade: null, faixas: null, unidade: 'número' },
    { id: 'comissao', nome: 'Comissão do vendedor', tipo: 'pct_ativacao', valor: 10, porRamal: false, modalidade: null, faixas: null, unidade: null },
  ],
  modelos: [
    MODELO_DA_HELENA,
    { id: 'pbx', nome: 'LinePBX em nuvem', produto: 'linepbx', linhas: [{ custoId: 'yealink', qtd: 1, porRamal: true }, { custoId: 'nuvem', qtd: 1, porRamal: true }, { custoId: 'dids', qtd: 3, porRamal: false }, { custoId: 'comissao', qtd: 1, porRamal: false }] },
  ],
};

/** O cenário da Clínica Aurora: LinePBX em nuvem, 10 ramais, R$ 990 por mês e R$ 1.500 de ativação; os telefones a R$ 390. */
function cenarioDaAurora(): CenarioDaSimulacao {
  const c = cenarioNovo(AJUSTES, { id: 'a', nome: 'Cenário A', modelo: AJUSTES.modelos.find((m) => m.id === 'pbx') });
  return {
    ...c, mensalidade: 99_000, ativacao: 150_000, ramais: 10,
    linhas: c.linhas.map((l) => (l.custoId === 'yealink' ? { ...l, valor: 39_000 } : l)),
  };
}

beforeAll(async () => {
  app = await makeApp();
  s = new Session(app);
  await s.login();
  const c = await pessoa('Camila Souza', 'camila@gestor.local', 'comercial');
  const d = await pessoa('Diego Farias', 'diego@gestor.local', 'comercial');
  const m = await pessoa('Marina Costa', 'marina@gestor.local', 'operador');
  const leitura = await s.post('/admin/roles', { name: 'Leitor do Comercial', description: 'só lê', permissions: ['records.read', 'support.read', 'sales.read'] });
  expect(leitura.statusCode, leitura.body).toBe(201);
  const l = await pessoa('Lia Rocha', 'lia@gestor.local', 'Leitor do Comercial');
  camila = c.sessao; diego = d.sessao; marina = m.sessao; lia = l.sessao;
  Object.assign(ids, { camila: c.id, diego: d.id, marina: m.id, lia: l.id });
  // o painel do Comercial (todos do Comercial veem) e um de escolhidos, só do Diego
  const r1 = await s.post('/atendimento/paineis', { nome: 'Comercial', sigla: 'com', descricao: 'As negociações', cor: 'ok', tipo: 'vendas', acesso: 'todos', pessoas: [], ajustes: {} });
  expect(r1.statusCode, r1.body).toBe(201);
  com = r1.json();
  const r2 = await s.post('/atendimento/paineis', { nome: 'Contas grandes', sigla: 'vip', descricao: 'As do Diego', cor: 'roxo', tipo: 'vendas', acesso: 'escolhidos', pessoas: [ids.diego], ajustes: {} });
  expect(r2.statusCode, r2.body).toBe(201);
  vip = r2.json();
  const n1 = await camila.post('/atendimento/chamados', { painelId: com.id, titulo: 'PABX em nuvem, 10 ramais', empresa: 'Clínica Aurora', valor: 99_000 });
  expect(n1.statusCode, n1.body).toBe(201);
  negociacao = n1.json();
  const n2 = await diego.post('/atendimento/chamados', { painelId: vip.id, titulo: 'Rede de farmácias', empresa: 'Rede Farma Mais' });
  expect(n2.statusCode, n2.body).toBe(201);
  daVip = n2.json();
  const sup = await s.post('/atendimento/chamados', { painelId: 'painel-suporte', titulo: 'Ramal mudo' });
  expect(sup.statusCode, sup.body).toBe(201);
  suporte = sup.json();
});
afterAll(async () => {
  await esperarSegundoPlano();
  await app.close();
});

describe('quem vê e quem mexe', () => {
  it('sem o Comercial, nada; só com o Comercial, lê; com o Comercial e o trabalhar, cria; os Ajustes, quem cuida', async () => {
    expect((await marina.get('/comercial/simulador/opcoes')).statusCode).toBe(403);
    expect((await marina.get('/comercial/simulador/simulacoes')).statusCode).toBe(403);
    const op = await lia.get('/comercial/simulador/opcoes');
    expect(op.statusCode, op.body).toBe(200);
    expect(op.json()).toMatchObject({ ajustes: AJUSTES_DO_SIMULADOR_PADRAO, podeEditar: false, podeCuidar: false });
    // os produtos do catálogo, com o código (o modelo e o cenário usam o código)
    expect((op.json().produtos as Array<{ codigo: string; nome: string }>).map((x) => x.codigo)).toEqual(expect.arrayContaining(['linepbx', 'linechat']));
    expect((await camila.get('/comercial/simulador/opcoes')).json()).toMatchObject({ podeEditar: true, podeCuidar: false });
    expect((await s.get('/comercial/simulador/opcoes')).json()).toMatchObject({ podeEditar: true, podeCuidar: true });
    const corpo = { nome: 'Teste', negociacaoId: null, cenarios: [cenarioDaAurora()], principal: 'a' };
    expect((await lia.post('/comercial/simulador/simulacoes', corpo)).statusCode).toBe(403);
    expect((await marina.post('/comercial/simulador/simulacoes', corpo)).statusCode).toBe(403);
    expect((await camila.put('/comercial/simulador/ajustes', AJUSTES)).statusCode).toBe(403);
  });
});

describe('os Ajustes do Simulador', () => {
  it('quem cuida grava a tabela, os modelos, o imposto e o sinal; a auditoria diz o que mudou', async () => {
    const r = await s.put('/comercial/simulador/ajustes', AJUSTES);
    expect(r.statusCode, r.body).toBe(200);
    expect(r.json()).toEqual(AJUSTES);
    expect((await camila.get('/comercial/simulador/opcoes')).json().ajustes).toEqual(AJUSTES);
    expect(await auditoriaDe('comercial-simulador')).toEqual([
      'Mudou nos Ajustes do Simulador: o imposto de 6% para 8%; incluiu na tabela Yealink T31P, Nuvem do PABX, Números da operadora, Comissão do vendedor; incluiu o modelo LinePBX em nuvem',
    ]);
  });

  it('recusa o que não fecha', async () => {
    const r1 = await s.put('/comercial/simulador/ajustes', { ...AJUSTES, verde: 15, vermelho: 30 });
    expect(r1.statusCode).toBe(400);
    expect(r1.json().details[0].message).toContain('O vermelho começa abaixo do verde');
    const r2 = await s.put('/comercial/simulador/ajustes', { ...AJUSTES, modelos: [{ id: 'x', nome: 'LineChat novo', linhas: [{ custoId: 'sumiu', qtd: 1, porRamal: false }] }] });
    expect(r2.statusCode).toBe(400);
    expect(r2.json().details[0].message).toContain('O modelo "LineChat novo" usa um custo que não está na tabela.');
    // a faixa de preço que não fecha
    const usuarios = { ...CUSTOS_DA_HELENA[1]!, faixas: [{ ate: 3, valor: 0 }, { ate: 20, valor: 1_990 }] };
    const r3 = await s.put('/comercial/simulador/ajustes', { ...AJUSTES, custos: AJUSTES.custos.map((c) => (c.id === usuarios.id ? usuarios : c)) });
    expect(r3.statusCode).toBe(400);
    expect(r3.json().details[0].message).toBe('Usuários do LineChat (Helena): a última faixa vai "daí para cima" (sem fim).');
  });
});

describe('a simulação', () => {
  let aurora: Simulacao;

  it('nasce com o nome, o cenário e a negociação ligada; a auditoria conta', async () => {
    const r = await camila.post('/comercial/simulador/simulacoes', { nome: 'Clínica Aurora', negociacaoId: negociacao.id, cenarios: [cenarioDaAurora()], principal: 'a' });
    expect(r.statusCode, r.body).toBe(201);
    aurora = r.json();
    expect(aurora).toMatchObject({
      nome: 'Clínica Aurora', negociacaoId: negociacao.id, principal: 'a', criadoPor: 'Camila Souza', alteradoPor: 'Camila Souza',
      negociacao: { id: negociacao.id, codigo: negociacao.codigo, titulo: 'PABX em nuvem, 10 ramais', empresa: 'Clínica Aurora', resultado: null },
    });
    expect(aurora.cenarios[0]!.linhas.map((l) => [l.nome, l.valor, l.porRamal])).toEqual([
      ['Yealink T31P', 39_000, true], ['Nuvem do PABX', 900, true], ['Números da operadora', 1_500, false], ['Comissão do vendedor', 10, false],
    ]);
    expect(await auditoriaDe(aurora.id)).toEqual([`Criou a simulação "Clínica Aurora" (ligada à ${negociacao.codigo})`]);
  });

  it('a lista traz o cenário principal resumido: a margem, o sinal, quando se paga', async () => {
    const lista: SimulacaoNaLista[] = (await lia.get('/comercial/simulador/simulacoes')).json();
    expect(lista).toHaveLength(1);
    const k = contasDoCenario(aurora.cenarios[0]!, AJUSTES);
    expect(lista[0]).toMatchObject({
      id: aurora.id, nome: 'Clínica Aurora', cenarios: 1, negociacaoOculta: false, negociacao: { codigo: negociacao.codigo },
      principal: { nome: 'Cenário A', mensalTotal: 99_000, sobraMensal: k.sobraMensal, sinal: 'verde', sePagaEm: k.sePagaEm, faltam: 0 },
    });
    // R$ 990 − R$ 90 (nuvem) − R$ 45 (números) − 8% de imposto = R$ 775,80
    expect(k.sobraMensal).toBe(77_580);
  });

  it('a negociação ligada só de painel de Vendas que a pessoa vê', async () => {
    const corpo = (negociacaoId: string) => ({ nome: 'Outra', negociacaoId, cenarios: [cenarioDaAurora()], principal: 'a' });
    const r1 = await camila.post('/comercial/simulador/simulacoes', corpo(daVip.id));
    expect(r1.statusCode).toBe(400);
    expect(r1.json().error).toBe('Essa negociação não existe ou é de um painel que você não vê: confira o código (COM-12).');
    const r2 = await camila.post('/comercial/simulador/simulacoes', corpo(suporte.id));
    expect(r2.statusCode).toBe(400);
    const r3 = await camila.post('/comercial/simulador/simulacoes', corpo('nao-existe'));
    expect(r3.statusCode).toBe(400);
  });

  it('quem não vê o painel da negociação não vê a negociação, e a ligação fica quando ela salva', async () => {
    // o Diego (só o VIP) liga a dele; a Camila vê a simulação, sem a negociação
    const r = await diego.post('/comercial/simulador/simulacoes', { nome: 'Rede Farma Mais', negociacaoId: daVip.id, cenarios: [cenarioDaAurora()], principal: 'a' });
    expect(r.statusCode, r.body).toBe(201);
    const farma: Simulacao = r.json();
    const vista: Simulacao = (await camila.get(`/comercial/simulador/simulacoes/${farma.id}`)).json();
    expect(vista).toMatchObject({ negociacaoId: daVip.id, negociacao: null });
    const lista: SimulacaoNaLista[] = (await camila.get('/comercial/simulador/simulacoes')).json();
    expect(lista.find((x) => x.id === farma.id)).toMatchObject({ negociacao: null, negociacaoOculta: true });
    // ela muda o nome e manda a mesma ligação: fica
    const m = await camila.put(`/comercial/simulador/simulacoes/${farma.id}`, { nome: 'Rede Farma Mais — 3 lojas', negociacaoId: daVip.id, cenarios: vista.cenarios, principal: 'a' });
    expect(m.statusCode, m.body).toBe(200);
    expect((await diego.get(`/comercial/simulador/simulacoes/${farma.id}`)).json()).toMatchObject({ nome: 'Rede Farma Mais — 3 lojas', negociacao: { codigo: daVip.codigo } });
    // a ficha da negociação: a Camila não vê; o Diego vê a simulação
    expect((await camila.get(`/comercial/simulador/da-negociacao/${daVip.id}`)).json()).toEqual([]);
    expect((await diego.get(`/comercial/simulador/da-negociacao/${daVip.id}`)).json()).toMatchObject([{ id: farma.id, nome: 'Rede Farma Mais — 3 lojas', cenarios: 1, principal: { sinal: 'verde' } }]);
  });

  it('mudar: a auditoria diz o que mudou; um segundo cenário; o principal', async () => {
    const b = { ...cenarioDaAurora(), id: 'b', nome: 'Cenário B', mensalidade: 89_000, prazo: 36, parcelas: 3 };
    const a = { ...aurora.cenarios[0]!, mensalidade: 109_000 };
    const r = await camila.put(`/comercial/simulador/simulacoes/${aurora.id}`, { nome: 'Clínica Aurora', negociacaoId: negociacao.id, cenarios: [a, b], principal: 'b' });
    expect(r.statusCode, r.body).toBe(200);
    expect(r.json()).toMatchObject({ principal: 'b', cenarios: [{ mensalidade: 109_000 }, { nome: 'Cenário B', parcelas: 3 }] });
    expect(semEspacoDuro((await auditoriaDe(aurora.id))[0]!)).toBe(
      'Mudou a simulação "Clínica Aurora": no Cenário A, a mensalidade de R$ 990,00 para R$ 1.090,00; incluiu o Cenário B; o principal passou a ser o Cenário B',
    );
    // a lista mostra o principal (o B)
    const lista: SimulacaoNaLista[] = (await camila.get('/comercial/simulador/simulacoes')).json();
    expect(lista[0]).toMatchObject({ id: aurora.id, cenarios: 2, principal: { nome: 'Cenário B', mensalTotal: 89_000, prazo: 36 } });
    // desligar da negociação
    const d = await camila.put(`/comercial/simulador/simulacoes/${aurora.id}`, { nome: 'Clínica Aurora', negociacaoId: null, cenarios: [a, b], principal: 'b' });
    expect(d.json().negociacao).toBeNull();
    expect((await auditoriaDe(aurora.id))[0]).toBe('Mudou a simulação "Clínica Aurora": desligou da negociação');
    const l = await camila.put(`/comercial/simulador/simulacoes/${aurora.id}`, { nome: 'Clínica Aurora', negociacaoId: negociacao.id, cenarios: [a, b], principal: 'b' });
    expect(l.statusCode, l.body).toBe(200);
    expect((await auditoriaDe(aurora.id))[0]).toBe(`Mudou a simulação "Clínica Aurora": ligou à ${negociacao.codigo}`);
    aurora = l.json();
  });

  it('recusa o que não fecha', async () => {
    const r = await camila.put(`/comercial/simulador/simulacoes/${aurora.id}`, {
      nome: 'Clínica Aurora', negociacaoId: null, cenarios: [{ ...aurora.cenarios[0]!, prazo: 2, parcelas: 6 }], principal: aurora.cenarios[0]!.id,
    });
    expect(r.statusCode).toBe(400);
    expect(r.json().details[0].message).toContain('Cenário A: a ativação vai em até 2 vezes (o prazo do contrato).');
    expect((await camila.get('/comercial/simulador/simulacoes/nao-existe')).statusCode).toBe(404);
  });

  it('a tabela mudou: a simulação feita fica com o valor de quando a linha entrou', async () => {
    const r = await s.put('/comercial/simulador/ajustes', { ...AJUSTES, custos: AJUSTES.custos.map((c) => (c.id === 'nuvem' ? { ...c, valor: 1_200 } : c)) });
    expect(r.statusCode, r.body).toBe(200);
    const vista: Simulacao = (await camila.get(`/comercial/simulador/simulacoes/${aurora.id}`)).json();
    expect(vista.cenarios[0]!.linhas.find((l) => l.custoId === 'nuvem')!.valor).toBe(900);
    expect((await auditoriaDe('comercial-simulador'))[0]).toBe('Mudou nos Ajustes do Simulador: mudou na tabela Nuvem do PABX');
  });

  it('a ficha da negociação lista as simulações ligadas a ela', async () => {
    const r = await camila.get(`/comercial/simulador/da-negociacao/${negociacao.id}`);
    expect(r.statusCode, r.body).toBe(200);
    expect(r.json()).toMatchObject([{ id: aurora.id, nome: 'Clínica Aurora', cenarios: 2, principal: { nome: 'Cenário B' } }]);
    expect((await marina.get(`/comercial/simulador/da-negociacao/${negociacao.id}`)).statusCode).toBe(403);
  });

  it('duplicar: a cópia, com os mesmos cenários e a mesma negociação', async () => {
    const r = await camila.post(`/comercial/simulador/simulacoes/${aurora.id}/duplicar`);
    expect(r.statusCode, r.body).toBe(201);
    const copia: Simulacao = r.json();
    expect(copia).toMatchObject({ nome: 'Clínica Aurora (cópia)', negociacaoId: negociacao.id, principal: aurora.principal, cenarios: aurora.cenarios });
    expect(copia.id).not.toBe(aurora.id);
    expect(await auditoriaDe(copia.id)).toEqual(['Duplicou a simulação "Clínica Aurora" em "Clínica Aurora (cópia)"']);
    expect((await lia.post(`/comercial/simulador/simulacoes/${aurora.id}/duplicar`)).statusCode).toBe(403);
  });

  it('o Excel: quem vê exporta a planilha com as fórmulas, uma folha por cenário e a "Lado a lado"; a auditoria conta', async () => {
    const atual: Simulacao = (await lia.get(`/comercial/simulador/simulacoes/${aurora.id}`)).json();
    const r = await lia.get(`/comercial/simulador/simulacoes/${aurora.id}/planilha`);
    expect(r.statusCode, r.body).toBe(200);
    expect(r.headers['content-type']).toBe(TIPO_DO_XLSX);
    expect(r.headers['content-disposition']).toBe(`attachment; filename="simulacao-clinica-aurora-${diaLocal(new Date())}.xlsx"`);
    const arquivos = lerZipSemCompressao(new Uint8Array(r.rawPayload));
    const texto = (nome: string) => new TextDecoder().decode(arquivos.get(nome));
    const folhas = [...texto('xl/workbook.xml').matchAll(/<sheet name="([^"]+)"/g)].map((m) => m[1]);
    expect(folhas).toEqual(['Lado a lado', ...atual.cenarios.map((c) => c.nome)]);
    // a folha do cenário: a mensalidade (amarela), a conta em fórmula e quem exportou; a Lado a lado puxa de lá
    const b = texto('xl/worksheets/sheet3.xml');
    expect(b).toContain('<c r="B7" s="11"><v>890</v></c>');
    expect(b).toContain('<f>B7+K');
    expect(b).toContain('por Lia Rocha');
    expect(texto('xl/worksheets/sheet1.xml')).toContain(`'Cenário B'!$B$`);
    expect(await auditoriaDe(aurora.id)).toContain('Exportou a simulação "Clínica Aurora" para o Excel');
    // sem o Comercial, não; a que não existe, 404
    expect((await marina.get(`/comercial/simulador/simulacoes/${aurora.id}/planilha`)).statusCode).toBe(403);
    expect((await camila.get('/comercial/simulador/simulacoes/nao-existe/planilha')).statusCode).toBe(404);
  });

  it('a lixeira: some da lista e da negociação; volta pela Administração › Lixeira', async () => {
    expect((await lia.del(`/comercial/simulador/simulacoes/${aurora.id}`)).statusCode).toBe(403);
    const r = await camila.del(`/comercial/simulador/simulacoes/${aurora.id}`);
    expect(r.statusCode, r.body).toBe(200);
    expect((await camila.get(`/comercial/simulador/simulacoes/${aurora.id}`)).statusCode).toBe(404);
    expect(((await camila.get('/comercial/simulador/simulacoes')).json() as SimulacaoNaLista[]).some((x) => x.id === aurora.id)).toBe(false);
    expect(((await camila.get(`/comercial/simulador/da-negociacao/${negociacao.id}`)).json() as Array<{ id: string }>).some((x) => x.id === aurora.id)).toBe(false);
    expect((await auditoriaDe(aurora.id))[0]).toBe('Mandou a simulação "Clínica Aurora" para a lixeira');
    const lixo = ((await s.get('/admin/trash')).json() as Array<{ type: string; id: string; label: string }>).find((x) => x.id === aurora.id);
    expect(lixo).toMatchObject({ type: 'salesSimulation', label: 'Simulação · Clínica Aurora' });
    const volta = await s.post(`/admin/trash/salesSimulation/${aurora.id}/restore`);
    expect(volta.statusCode, volta.body).toBe(200);
    expect((await camila.get(`/comercial/simulador/simulacoes/${aurora.id}`)).statusCode).toBe(200);
    expect((await auditoriaDe(aurora.id))[0]).toBe('Restaurou a simulação "Clínica Aurora" do Comercial da lixeira');
  });
});

describe('a margem no relatório do Comercial', () => {
  it('a ganha com simulação entra na margem das ganhas: no total, por vendedor e por produto', async () => {
    const linepbx = ((await camila.get('/comercial/simulador/opcoes')).json().produtos as Array<{ id: string; codigo: string; nome: string }>).find((x) => x.codigo === 'linepbx')!;
    // quem cuida e o produto da negociação; depois, o Ganho
    const p = await camila.patch(`/atendimento/chamados/${negociacao.id}`, { responsavelId: ids.camila, produtos: [linepbx.id] });
    expect(p.statusCode, p.body).toBe(200);
    const ganho = com.etapas.find((e) => e.nome === 'Ganho')!;
    const m = await camila.post(`/atendimento/chamados/${negociacao.id}/mover`, { etapaId: ganho.id });
    expect(m.statusCode, m.body).toBe(200);
    const hoje = diaLocal(new Date());
    const r = await camila.get(`/atendimento/vendas?painel=${com.id}&de=${hoje}&ate=${hoje}`);
    expect(r.statusCode, r.body).toBe(200);
    const sim: Simulacao = (await camila.get(`/comercial/simulador/simulacoes/${(await camila.get(`/comercial/simulador/da-negociacao/${negociacao.id}`)).json()[0].id}`)).json();
    const principal = resumoDoCenario(sim.cenarios.find((c) => c.id === sim.principal)!, AJUSTES);
    expect(r.json().margem).toMatchObject({
      ganhas: 1, comSimulacao: 1,
      geral: { qtd: 1, mensalidade: principal.mensalTotal, sobra: principal.sobraMensal, sinal: principal.sinal },
      porVendedor: [{ nome: 'Camila Souza', qtd: 1 }],
      porProduto: [{ nome: linepbx.nome, qtd: 1 }],
    });
  });
});
