/**
 * Patch 2.4.4 — o documento do Luan de 09/11:
 *  - "Creio um documento tem q contar como preenchido o campo": o campo com um arquivo anexado (e nada escrito) conta como
 *    feito na parte (o "N de M" da ficha e do cartão do quadro) e como preenchido no que a etapa pede;
 *  - "esse cliente tinha uma condição especial ... um desconto para ele de 200 rais até março do ano que vem, isso ai vc já
 *    deveria contabilizar no simulador": a simulação ligada a uma negociação conta as Condições especiais dela (o editor, a
 *    lista, a ficha da negociação), e o card continua com o valor cheio.
 * (A bolinha vermelha no campo que falta é da tela: a lista `faltam` de cada parte, no `@gestor/shared`.)
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  AJUSTES_DO_SIMULADOR_PADRAO, contasDoCenario, mesDeHoje, mesMais,
  type CampoPersonalizado, type CenarioDaSimulacao, type FichaChamado, type Painel, type Simulacao, type SimulacaoDaNegociacao, type SimulacaoNaLista,
} from '@gestor/shared';
import { makeApp, Session, type App } from './helpers.js';
import { esperarSegundoPlano } from '../src/services/atendimento/avisos.js';

let app: App;
let s: Session;
let adminId = '';

const ficha = async (ref: string): Promise<FichaChamado> => {
  const r = await s.get(`/atendimento/chamados/${ref}`);
  expect(r.statusCode, r.body).toBe(200);
  return r.json();
};

beforeAll(async () => {
  app = await makeApp();
  s = new Session(app);
  adminId = (await s.login()).id;
});
afterAll(async () => { await esperarSegundoPlano(); await app.close(); });

describe('o campo com um documento anexado conta como preenchido (2.4.4)', () => {
  const PDF = `data:application/pdf;base64,${Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF').toString('base64')}`;

  it('na parte (a ficha e o quadro) e no que a etapa pede; tirar o anexo volta a faltar', async () => {
    const r = await s.post('/atendimento/paineis', {
      nome: 'Ativações', sigla: 'ATV', descricao: '', cor: 'turquesa', acesso: 'todos', pessoas: [], ajustes: {},
      etapas: [{ nome: 'Pedido', tipo: 'entrada' }, { nome: 'Configuração', tipo: 'andamento' }, { nome: 'Feito', tipo: 'resolvido' }, { nome: 'Encerrado', tipo: 'fechado' }],
    });
    expect(r.statusCode, r.body).toBe(201);
    const p: Painel = r.json();
    const configuracao = p.etapas.find((e) => e.nome === 'Configuração')!;
    // o "Estrutura do chatbot" do print: texto longo, recebe anexos e a Configuração pede
    const novo = await s.post(`/atendimento/paineis/${p.id}/campos`, { nome: 'Estrutura do chatbot', tipo: 'texto_longo', parte: 'Curadoria', anexos: true, etapas: [configuracao.id] });
    expect(novo.statusCode, novo.body).toBe(201);
    const chatbot: CampoPersonalizado = novo.json();
    expect((await s.post(`/atendimento/paineis/${p.id}/campos`, { nome: 'Horário de atendimento', tipo: 'texto', parte: 'Curadoria' })).statusCode).toBe(201);

    const t = (await s.post('/atendimento/chamados', { painelId: p.id, titulo: 'Clínica SOS', responsavelId: adminId })).json() as FichaChamado;
    let f = await ficha(t.codigo);
    expect(f.partes).toEqual([{ parte: 'Curadoria', feitos: 0, total: 2 }]);
    expect(f.faltam[configuracao.id]).toEqual([`campo:${chatbot.id}`]);
    const sem = await s.post(`/atendimento/chamados/${t.id}/mover`, { etapaId: configuracao.id });
    expect(sem.statusCode).toBe(400);
    expect(sem.json().error).toMatch(/Estrutura do chatbot/);

    // os dois PDFs, sem nada escrito
    const anexou = await s.post(`/atendimento/chamados/${t.id}/campos/${chatbot.id}/anexos`, { opcaoId: null, anexos: [{ fileName: 'fluxograma.pdf', conteudo: PDF }, { fileName: 'fluxo-whatsapp.pdf', conteudo: PDF }] });
    expect(anexou.statusCode, anexou.body).toBe(200);
    f = await ficha(t.codigo);
    expect(f.campos[chatbot.id]).toBeUndefined();
    expect(f.partes).toEqual([{ parte: 'Curadoria', feitos: 1, total: 2 }]);
    expect(f.faltam[configuracao.id]).toEqual([]);
    // o cartão do quadro conta igual
    const quadro = (await s.get(`/atendimento/quadro?painel=${p.id}`)).json();
    const cartao = JSON.stringify(quadro).includes(t.codigo) ? findCartao(quadro, t.codigo) : null;
    expect(cartao?.partes).toEqual([{ parte: 'Curadoria', feitos: 1, total: 2 }]);
    const moveu = await s.post(`/atendimento/chamados/${t.id}/mover`, { etapaId: configuracao.id });
    expect(moveu.statusCode, moveu.body).toBe(200);

    // tirando os dois, volta a faltar
    for (const a of f.anexosDosCampos) expect((await s.del(`/atendimento/chamados/${t.id}/anexos/${a.id}`)).statusCode).toBe(200);
    expect((await ficha(t.codigo)).partes).toEqual([{ parte: 'Curadoria', feitos: 0, total: 2 }]);
  });
});

/** O cartão de um código, onde quer que o quadro o ponha (as colunas, as etapas). */
function findCartao(x: unknown, codigo: string): { partes: unknown } | null {
  if (Array.isArray(x)) { for (const y of x) { const r = findCartao(y, codigo); if (r) return r; } return null; }
  if (x && typeof x === 'object') {
    if ((x as { codigo?: string }).codigo === codigo && 'partes' in (x as object)) return x as { partes: unknown };
    for (const y of Object.values(x)) { const r = findCartao(y, codigo); if (r) return r; }
  }
  return null;
}

describe('as Condições especiais da negociação no Simulador (2.4.4)', () => {
  it('a simulação ligada conta o desconto: o editor, a lista e a ficha da negociação; o card continua com o valor cheio', async () => {
    const v = await s.post('/atendimento/paineis', { nome: 'Comercial 2.4.4', sigla: 'cig', descricao: '', cor: 'ok', tipo: 'vendas', ajustes: {} });
    expect(v.statusCode, v.body).toBe(201);
    const neg = (await s.post('/atendimento/chamados', { painelId: v.json().id, titulo: '', empresa: 'Clínica SOS', valor: 169_000, ativacao: 300_000 })).json() as FichaChamado;
    // "um desconto para ele de 200 rais até março do ano que vem"
    const hoje = mesDeHoje();
    const marco = `${Number(hoje.slice(0, 4)) + 1}-03`;
    const condicoes = { descontos: [{ valor: 20_000, ate: marco }], ativacao: null, observacao: null };
    expect((await s.patch(`/atendimento/chamados/${neg.id}`, { condicoes })).statusCode).toBe(200);

    const cenario: CenarioDaSimulacao = {
      id: 'a', nome: 'Cenário A', mensalidade: 169_000, ativacao: 300_000, parcelas: 3, prazo: 12, imposto: 8, produtos: [], porProduto: null,
      linhas: [
        { id: 'helena', nome: 'Helena', tipo: 'mensal', custoId: null, qtd: 1, valor: 35_890, modalidade: null, preco: null, faixas: null, unidade: null },
        { id: 'luki', nome: 'Comissão Luki', tipo: 'pct_mensalidade', custoId: null, qtd: 1, valor: 5, modalidade: null, preco: null, faixas: null, unidade: null },
      ],
    };
    const criada = await s.post('/comercial/simulador/simulacoes', { nome: 'Clínica SOS', negociacaoId: neg.id, cenarios: [cenario], principal: 'a' });
    expect(criada.statusCode, criada.body).toBe(201);
    const sim: Simulacao = criada.json();
    expect(sim.negociacao?.condicoes).toEqual({ condicoes, desde: hoje, doGanho: false });

    const faixas = (await s.get('/comercial/simulador/opcoes')).json().ajustes ?? AJUSTES_DO_SIMULADOR_PADRAO;
    const k = contasDoCenario(sim.cenarios[0]!, faixas, sim.negociacao!.condicoes);
    // os meses de hoje até março com R$ 200 a menos
    const comDesconto = Array.from({ length: 12 }, (_, i) => mesMais(hoje, i)).filter((m) => m <= marco).length;
    expect(k.condicoes!.descontoNoContrato).toBe(comDesconto * 20_000);
    expect(k.resultado).toBe(contasDoCenario(sim.cenarios[0]!, faixas).resultado - comDesconto * 17_400);

    const lista: SimulacaoNaLista[] = (await s.get('/comercial/simulador/simulacoes')).json();
    expect(lista.find((x) => x.id === sim.id)!.principal.resultado).toBe(k.resultado);
    const naFicha: SimulacaoDaNegociacao[] = (await s.get(`/comercial/simulador/da-negociacao/${neg.id}`)).json();
    expect(naFicha[0]!.principal.resultado).toBe(k.resultado);
    // a principal preenche o card com o valor cheio (o desconto fica nas condições)
    const f = await ficha(neg.codigo);
    expect([f.valor, f.ativacao]).toEqual([169_000, 300_000]);
  });
});
