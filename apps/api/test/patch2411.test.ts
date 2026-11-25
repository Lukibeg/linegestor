/**
 * Patch 2.4.11 (decisão 0066), os pedidos do Luan de 25/11:
 *
 *  - o card de faturamento: "quero que quando eu arraste pra concluído seja gerado um card no administrativo de faturamento
 *    e tem que ter a opção de eu colocar a descrição lá do card o email do faturamento o vencimento da fatura e as
 *    informações" — a etapa que abre o faturamento, o plano (o que a janela mostra), o card e o aviso;
 *  - o lucro no quadro de Vendas: "não só o valor dos contratos mas tbm o valor do meu lucro";
 *  - as imagens do relato e da descrição;
 *  - o prazo escrito em cada chamado;
 *  - a marca de atualizar (os ajustes);
 *  - o aviso da equipe pelo WhatsApp não entra mais no histórico.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { newId, products, ticketEvents, tickets } from '@gestor/db';
import {
  AJUSTES_DO_SIMULADOR_PADRAO, MODELO_DA_HELENA, cenarioNovo, condicoesGuardadas, descricaoDoFaturamento, informacoesDoFaturamento, instanteLocal, produtosDoFaturamento,
  type EtapaPainel, type FichaChamado, type OQueAEtapaFaz, type Painel, type QuadroAtendimento, type Simulacao,
} from '@gestor/shared';
import { makeApp, Session, type App } from './helpers.js';
import { esperarSegundoPlano } from '../src/services/atendimento/avisos.js';
import { margensDasNegociacoes } from '../src/services/simulador.js';

let app: App;
let s: Session;
let marina: Session;
let adminId = '';
let marinaId = '';
let imp: Painel;
let com: Painel;
let adm: Painel;
const produto: Record<string, string> = {};
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const PDF = `data:application/pdf;base64,${Buffer.from('%PDF-1.4\n%%EOF\n').toString('base64')}`;

const etapaDe = (p: Painel, nome: string): EtapaPainel => {
  const e = p.etapas.find((x) => x.nome === nome);
  if (!e) throw new Error(`sem a etapa ${nome}`);
  return e;
};
const ficha = async (ref: string): Promise<FichaChamado> => {
  const r = await s.get(`/atendimento/chamados/${ref}`);
  expect(r.statusCode, r.body).toBe(200);
  return r.json();
};
const auditoria = async () => ((await s.get('/admin/audit?pageSize=200')).json().items as Array<{ summary: string }>).map((a) => a.summary);
const etapasPara = (p: Painel, mudar: (e: EtapaPainel) => Partial<EtapaPainel> = () => ({})) => p.etapas.map((e) => ({ ...e, ...mudar(e) }));

beforeAll(async () => {
  app = await makeApp();
  s = new Session(app);
  adminId = (await s.login()).id;
  for (const p of await app.db.select({ id: products.id, code: products.code }).from(products)) produto[p.code] = p.id;
  const papeis = (await s.get('/admin/roles')).json();
  const u = await s.post('/admin/users', { name: 'Marina Costa', email: 'marina@gestor.local', password: 'SenhaDeTeste!123', roleId: papeis.find((x: any) => x.key === 'operador').id });
  expect(u.statusCode, u.body).toBe(201);
  marinaId = u.json().id;
  marina = new Session(app);
  await marina.login('marina@gestor.local', 'SenhaDeTeste!123');
});
afterAll(async () => { await esperarSegundoPlano(); await app.close(); });

describe('a etapa que abre o card de faturamento', () => {
  it('o Implantado da implantação abre o faturamento no painel administrativo; o próprio painel e o de Vendas não servem', async () => {
    const a = await s.post('/atendimento/paineis', { nome: 'Grupo Line - ADM', sigla: 'gla', descricao: 'O financeiro', cor: 'turquesa', tipo: 'gestao', ajustes: {} });
    expect(a.statusCode, a.body).toBe(201);
    adm = a.json();
    // quem a entrada do administrativo avisa (a Marina) fica sabendo do card de faturamento
    const av = await s.put(`/atendimento/paineis/${adm.id}/etapas`, { etapas: etapasPara(adm, (e) => (e.tipo === 'entrada' ? { avisar: [marinaId] } : {})) });
    expect(av.statusCode, av.body).toBe(200);
    adm = av.json();
    const i = await s.post('/atendimento/paineis', { nome: 'Implantação', sigla: 'imp', descricao: '', cor: 'turquesa', tipo: 'gestao', ajustes: {}, modelo: 'implantacao' });
    expect(i.statusCode, i.body).toBe(201);
    imp = i.json();
    const c = await s.post('/atendimento/paineis', {
      nome: 'Comercial', sigla: 'cig', descricao: '', cor: 'signal', tipo: 'vendas', ajustes: {},
      etapas: [
        { nome: 'Lead', tipo: 'entrada' }, { nome: 'Em processo de Implantação', tipo: 'andamento', abreImplantacao: imp.id },
        { nome: 'Implantado', tipo: 'andamento', recebeImplantacao: true }, { nome: 'Ganho', tipo: 'fechado', resultado: 'ganho' }, { nome: 'Perdido', tipo: 'fechado', resultado: 'perdido' },
      ],
    });
    expect(c.statusCode, c.body).toBe(201);
    com = c.json();

    const comFaturamento = (alvo: string) => etapasPara(imp, (e) => (e.nome === 'Implantado' ? { abreFaturamento: alvo } : {}));
    const mesmo = await s.put(`/atendimento/paineis/${imp.id}/etapas`, { etapas: comFaturamento(imp.id) });
    expect(mesmo.statusCode).toBe(400);
    const deVendas = await s.put(`/atendimento/paineis/${imp.id}/etapas`, { etapas: comFaturamento(com.id) });
    expect(deVendas.statusCode).toBe(400);
    const sumiu = await s.put(`/atendimento/paineis/${imp.id}/etapas`, { etapas: comFaturamento('painel-que-nao-existe') });
    expect(sumiu.statusCode).toBe(400);
    const ok = await s.put(`/atendimento/paineis/${imp.id}/etapas`, { etapas: comFaturamento(adm.id) });
    expect(ok.statusCode, ok.body).toBe(200);
    imp = ok.json();
    expect(etapaDe(imp, 'Implantado')).toMatchObject({ abreFaturamento: adm.id, ligaNoCadastro: true });
    expect(etapaDe(imp, 'Concluído').abreFaturamento ?? null).toBeNull();
    expect((await auditoria()).some((x) => x.includes('ajustou Implantado'))).toBe(true);
  });
});

let neg = { id: '', codigo: '' };
let card = { id: '', codigo: '' };
let sim: Simulacao;

describe('o card de faturamento (o Luan: "quero que quando eu arraste pra concluído seja gerado um card no administrativo")', () => {
  it('a negociação com a simulação principal e as Condições especiais abre a implantação', async () => {
    const r = await s.post('/atendimento/chamados', {
      painelId: com.id, titulo: '', empresa: 'Clínica EVAB', produtos: [produto.linechat], responsavelId: adminId, ativacao: 300_000,
      contatoNome: 'Bárbara', contatoTelefone: '(71) 93333-2000', contatoEmail: 'barbara@evab.com.br',
    });
    expect(r.statusCode, r.body).toBe(201);
    neg = r.json();
    // a simulação principal: o LineChat da Helena, 12 usuários, R$ 736 por mês e R$ 3.000 de ativação
    const base = cenarioNovo(AJUSTES_DO_SIMULADOR_PADRAO, { id: 'a', nome: 'Cenário A', modelo: MODELO_DA_HELENA });
    const cenario = { ...base, mensalidade: 73_600, ativacao: 300_000, linhas: base.linhas.map((l) => (/^Usuários/.test(l.nome) ? { ...l, qtd: 12 } : l)) };
    const si = await s.post('/comercial/simulador/simulacoes', { nome: 'EVAB — LineChat', negociacaoId: neg.id, cenarios: [cenario], principal: 'a' });
    expect(si.statusCode, si.body).toBe(201);
    sim = si.json();
    const condicoes = { descontos: [], ativacao: { vezes: 5, aPartirDe: '2027-03' }, observacao: 'vai ser faturado a partir de março/27' };
    expect((await s.patch(`/atendimento/chamados/${neg.id}`, { condicoes })).statusCode).toBe(200);
    const m = await s.post(`/atendimento/chamados/${neg.id}/mover`, { etapaId: etapaDe(com, 'Em processo de Implantação').id, implantacao: { cnpj: '11.222.333/0001-81', razaoSocial: 'EVAB Clínica Ltda' } });
    expect(m.statusCode, m.body).toBe(200);
    const f: FichaChamado = m.json();
    card = { id: f.implantacoes[0]!.id, codigo: f.implantacoes[0]!.codigo };
    expect(card.codigo).toBe('IMP-1');
    // a Curadoria pede quem fica com o card para sair
    expect((await s.post(`/atendimento/chamados/${card.id}/mover`, { etapaId: etapaDe(imp, 'Configuração').id, responsavelId: adminId })).statusCode).toBe(200);
  });

  it('o plano: o painel, o título com o cliente, o e-mail do contato, o CNPJ do cadastro e as informações da negociação', async () => {
    const r = await s.get(`/atendimento/chamados/${card.id}/ao-mover?etapaId=${etapaDe(imp, 'Implantado').id}`);
    expect(r.statusCode, r.body).toBe(200);
    const plano: OQueAEtapaFaz = r.json();
    const n = await ficha(neg.id);
    const informacoes = informacoesDoFaturamento({
      mensalidade: n.valor, ativacao: n.ativacao, condicoes: condicoesGuardadas(n.condicoes),
      produtos: produtosDoFaturamento({ produtos: [{ id: produto.linechat!, codigo: 'linechat', nome: 'LineChat' }], valores: n.valoresDosProdutos, cenario: sim.cenarios[0]! }),
    });
    expect(informacoes).toContain('Ativação R$ 3.000,00 em 5 vezes, a partir de mar/2027');
    expect(informacoes).toContain('OBS: vai ser faturado a partir de março/27');
    expect(informacoes).toMatch(/\n12 Usuários do LineChat/);
    expect(plano.faturamento).toEqual({
      painel: { id: adm.id, nome: 'Grupo Line - ADM', sigla: 'GLA' }, etapa: etapaDe(adm, 'Novo').nome, jaAberto: null,
      cliente: 'Clínica EVAB', nome: 'Clínica EVAB', titulo: 'Clínica EVAB - Faturamento', email: 'barbara@evab.com.br', vencimento: null,
      cnpj: '11.222.333/0001-81', informacoes, origem: { negociacao: neg.codigo, simulacao: 'EVAB — LineChat' },
    });
    // a etapa também liga no cadastro: a janela mostra os dois
    expect(plano.cadastro?.cliente?.nome).toBe('Clínica EVAB');
    // a etapa que não abre o faturamento não traz o plano
    expect((await s.get(`/atendimento/chamados/${card.id}/ao-mover?etapaId=${etapaDe(imp, 'Concluído').id}`)).json().faturamento).toBeNull();
  });

  it('mover com o que a janela mandou: o card nasce no administrativo, ligado, com a descrição no formato do Luan; quem a etapa avisa fica sabendo', async () => {
    const pedido = {
      titulo: 'Clínica EVAB - Faturamento', email: 'financeiro@evab.com.br/barbara@evab.com.br', vencimento: '2026-12-10', cnpj: '11.222.333/0001-81',
      informacoes: 'Ativação R$ 3.000,00 em 5x\n\nLineChat: R$ 736,00\n12 Licenças usuários callcenter',
    };
    const r = await s.post(`/atendimento/chamados/${card.id}/mover`, { etapaId: etapaDe(imp, 'Implantado').id, faturamento: pedido });
    expect(r.statusCode, r.body).toBe(200);
    const f: FichaChamado = r.json();
    expect(f.implantacoes).toEqual([expect.objectContaining({ codigo: 'GLA-1', painelId: adm.id, painel: 'Grupo Line - ADM', etapa: 'Novo', situacao: 'aberto', podeAbrir: true })]);
    expect(f.historico.map((e) => e.texto)).toContain('abriu o card de faturamento GLA-1 no painel Grupo Line - ADM');

    const g = await ficha('GLA-1');
    expect(g).toMatchObject({ titulo: 'Clínica EVAB - Faturamento', origem: 'implantacao', painelId: adm.id, etapaId: etapaDe(adm, 'Novo').id, cliente: { nome: 'Clínica EVAB' } });
    expect(g.descricao).toBe(descricaoDoFaturamento({ cliente: 'Clínica EVAB', ...pedido }));
    expect(g.descricao!.split('\n').slice(0, 5)).toEqual([
      'Faturamento Clínica EVAB', 'E-mail para faturamento: financeiro@evab.com.br/barbara@evab.com.br', 'Data de vencimento: 10/12/2026', 'CNPJ do faturamento: 11.222.333/0001-81', '',
    ]);
    // o primeiro e-mail vira o do contato; quem moveu observa; o card de onde veio aparece (não é uma negociação)
    expect(g.contato?.email).toBe('financeiro@evab.com.br');
    expect(g.observadores.map((p) => p.id)).toEqual([adminId]);
    expect(g.produtos.map((p) => p.id)).toEqual([produto.linechat]);
    expect(g.daNegociacao).toMatchObject({ id: card.id, codigo: 'IMP-1', deVendas: false, painel: 'Implantação', podeAbrir: true });
    expect(g.historico.map((e) => e.texto)).toEqual(expect.arrayContaining(['abriu o chamado (Aberto pela implantação) em Novo', expect.stringMatching(/^veio da implantação IMP-1/)]));
    const [linha] = await app.db.select({ fonte: tickets.sourceTicketId }).from(tickets).where(eq(tickets.code, 'GLA-1'));
    expect(linha?.fonte).toBe(card.id);

    const auds = await auditoria();
    expect(auds).toContain('Abriu GLA-1 "Clínica EVAB - Faturamento" no painel Grupo Line - ADM, pelo IMP-1 (o faturamento)');
    expect(auds.find((x) => x.startsWith('Moveu IMP-1 de Configuração para Implantado'))).toMatch(/; abriu o card de faturamento GLA-1 em Grupo Line - ADM/);
    await esperarSegundoPlano();
    const avisos = (await marina.get('/atendimento/avisos')).json().itens.map((a: any) => a.texto);
    expect(avisos).toContain('Chegou o card de faturamento GLA-1 (do IMP-1) em Novo');
  });

  it('um card abre um só: de novo no Implantado, o plano diz qual já abriu e nada se repete', async () => {
    expect((await s.post(`/atendimento/chamados/${card.id}/mover`, { etapaId: etapaDe(imp, 'Testes').id })).statusCode).toBe(200);
    const plano: OQueAEtapaFaz = (await s.get(`/atendimento/chamados/${card.id}/ao-mover?etapaId=${etapaDe(imp, 'Implantado').id}`)).json();
    expect(plano.faturamento?.jaAberto).toEqual({ codigo: 'GLA-1' });
    expect((await s.post(`/atendimento/chamados/${card.id}/mover`, { etapaId: etapaDe(imp, 'Implantado').id })).statusCode).toBe(200);
    expect(await app.db.select().from(tickets).where(eq(tickets.sourceTicketId, card.id))).toHaveLength(1);
  });

  it('sem o pedido (a integração): vai o que o Gestor preencheu; o pedido errado não move', async () => {
    const r = await s.post('/atendimento/chamados', { painelId: imp.id, titulo: 'Implantação — Loja Azul', responsavelId: adminId });
    expect(r.statusCode, r.body).toBe(201);
    const outro = r.json();
    const ruim = await s.post(`/atendimento/chamados/${outro.id}/mover`, { etapaId: etapaDe(imp, 'Implantado').id, faturamento: { titulo: 'x' } });
    expect(ruim.statusCode).toBe(400);
    expect((await ficha(outro.id)).etapaId).not.toBe(etapaDe(imp, 'Implantado').id);
    const m = await s.post(`/atendimento/chamados/${outro.id}/mover`, { etapaId: etapaDe(imp, 'Implantado').id });
    expect(m.statusCode, m.body).toBe(200);
    const g = await ficha((m.json() as FichaChamado).implantacoes[0]!.id);
    // sem cliente e sem negociação: o título do card, e a descrição só com a primeira linha
    expect(g).toMatchObject({ codigo: 'GLA-2', titulo: 'Implantação — Loja Azul - Faturamento', descricao: 'Faturamento Implantação — Loja Azul', cliente: null });
  });
});

describe('o lucro no quadro de Vendas (o Luan: "não só o valor dos contratos mas tbm o valor do meu lucro")', () => {
  it('cada coluna soma a sobra por mês da simulação principal das negociações dela, e diz quantas têm simulação', async () => {
    // mais duas no Lead: uma com simulação, outra sem
    const n1 = (await s.post('/atendimento/chamados', { painelId: com.id, titulo: 'Rede Sol', empresa: 'Rede Sol', valor: 50_000 })).json();
    const n2 = (await s.post('/atendimento/chamados', { painelId: com.id, titulo: 'Padaria Lua', empresa: 'Padaria Lua', valor: 20_000 })).json();
    const base = cenarioNovo(AJUSTES_DO_SIMULADOR_PADRAO, { id: 'a', nome: 'Cenário A', modelo: MODELO_DA_HELENA });
    expect((await s.post('/comercial/simulador/simulacoes', { nome: 'Rede Sol', negociacaoId: n1.id, cenarios: [{ ...base, mensalidade: 50_000 }], principal: 'a' })).statusCode).toBe(201);
    const q: QuadroAtendimento = (await s.get(`/atendimento/quadro?painel=${com.id}`)).json();
    const { margens } = await margensDasNegociacoes(app.db, [neg.id, n1.id, n2.id]);
    const lead = q.colunas.find((c) => c.etapa.nome === 'Lead')!;
    expect(lead.total).toBe(2);
    expect(lead.lucro).toEqual({ valor: margens.get(n1.id)!.sobraMensal, comSimulacao: 1 });
    // a EVAB foi para o Implantado do Comercial quando o card chegou no Implantado da implantação
    const implantado = q.colunas.find((c) => c.etapa.nome === 'Implantado')!;
    expect(implantado.chamados.map((c) => c.id)).toEqual([neg.id]);
    expect(implantado.lucro).toEqual({ valor: margens.get(neg.id)!.sobraMensal, comSimulacao: 1 });
    expect(q.colunas.find((c) => c.etapa.nome === 'Ganho')!.lucro).toEqual({ valor: 0, comSimulacao: 0 });
    // o quadro de Gestão não tem lucro
    const g: QuadroAtendimento = (await s.get(`/atendimento/quadro?painel=${adm.id}`)).json();
    expect(g.colunas.every((c) => c.lucro === undefined)).toBe(true);
  });
});

describe('as imagens do relato e da descrição (o Luan: "quero poder colocar uma imagem aqui tbm nos relatos e descrição")', () => {
  let chamado = { id: '', codigo: '' };
  it('no abrir: as imagens de cada texto entram no chamado (e não nos campos), com o histórico', async () => {
    const r = await s.post('/atendimento/chamados', {
      painelId: 'painel-suporte', titulo: 'Ramal sem áudio', relato: 'Segue o print', descricao: 'O registro',
      imagens: [{ campo: 'relato', fileName: 'print.png', conteudo: PNG }, { campo: 'descricao', fileName: 'registro.png', conteudo: PNG }],
    });
    expect(r.statusCode, r.body).toBe(201);
    chamado = r.json();
    const f = await ficha(chamado.id);
    expect(f.imagensDosTextos.map((i) => [i.campo, i.nome, i.imagem, i.tipo])).toEqual([['relato', 'print.png', true, 'image/png'], ['descricao', 'registro.png', true, 'image/png']]);
    expect(f.imagensDosTextos.every((i) => i.podeTirar && i.por?.id === adminId)).toBe(true);
    expect(f.anexosDosCampos).toEqual([]);
    expect(f.historico.map((e) => e.texto)).toEqual(expect.arrayContaining(['anexou print.png em Relato do cliente', 'anexou registro.png em Descrição']));
    // abre na tela
    const img = await s.get(`/atendimento/anexos/${f.imagensDosTextos[0]!.id}`);
    expect(img.statusCode).toBe(200);
    expect(img.headers['content-type']).toMatch(/image\/png/);
  });

  it('na ficha: vai na hora; só imagem; até 20 em cada texto; sai quem pôs', async () => {
    const um = await s.post(`/atendimento/chamados/${chamado.id}/textos/descricao/imagens`, { imagens: [{ fileName: 'mais.png', conteudo: PNG }] });
    expect(um.statusCode, um.body).toBe(200);
    expect((um.json() as FichaChamado).imagensDosTextos.filter((i) => i.campo === 'descricao')).toHaveLength(2);
    const pdf = await s.post(`/atendimento/chamados/${chamado.id}/textos/descricao/imagens`, { imagens: [{ fileName: 'contrato.pdf', conteudo: PDF }] });
    expect(pdf.statusCode).toBe(400);
    expect(pdf.json().error).toMatch(/não é uma imagem/);
    expect((await s.post(`/atendimento/chamados/${chamado.id}/textos/solucao/imagens`, { imagens: [{ fileName: 'x.png', conteudo: PNG }] })).statusCode).toBe(400);
    const dez = Array.from({ length: 10 }, (_, i) => ({ fileName: `p${i}.png`, conteudo: PNG }));
    expect((await s.post(`/atendimento/chamados/${chamado.id}/textos/descricao/imagens`, { imagens: dez })).statusCode).toBe(200);
    const demais = await s.post(`/atendimento/chamados/${chamado.id}/textos/descricao/imagens`, { imagens: dez.slice(0, 9) });
    expect(demais.statusCode).toBe(400);
    expect(demais.json().error).toBe('A descrição já tem 12 imagens: cabem até 20. Tire uma antes de pôr outra.');
    const f = await ficha(chamado.id);
    const tirar = f.imagensDosTextos.find((i) => i.nome === 'mais.png')!;
    const t = await s.del(`/atendimento/chamados/${chamado.id}/anexos/${tirar.id}`);
    expect(t.statusCode, t.body).toBe(200);
    const depois = await ficha(chamado.id);
    expect(depois.imagensDosTextos.some((i) => i.id === tirar.id)).toBe(false);
    expect(depois.historico.map((e) => e.texto)).toContain('tirou mais.png de Descrição');
  });

  it('o painel que não usa o relato não recebe imagem nele', async () => {
    const r = await s.post(`/atendimento/chamados/${card.id}/textos/relato/imagens`, { imagens: [{ fileName: 'x.png', conteudo: PNG }] });
    expect(r.statusCode).toBe(400);
    expect(r.json().error).toMatch(/não usa o relato/);
    // no abrir, a do relato fica de fora (a da descrição entra)
    const c = await s.post('/atendimento/chamados', {
      painelId: imp.id, titulo: 'Implantação — Loja Verde', imagens: [{ campo: 'relato', fileName: 'r.png', conteudo: PNG }, { campo: 'descricao', fileName: 'd.png', conteudo: PNG }],
    });
    expect(c.statusCode, c.body).toBe(201);
    expect((await ficha(c.json().id)).imagensDosTextos.map((i) => i.nome)).toEqual(['d.png']);
  });
});

describe('o prazo escrito em cada chamado (o Luan: "a opção do painel dos prazos serem manuais e serem preenchidos em cada chamado")', () => {
  let proj: Painel;
  it('o painel escolhe o prazo escrito (mesmo sem o assunto); salvar sem dizer mantém; o de Vendas não tem', async () => {
    const r = await s.post('/atendimento/paineis', {
      nome: 'Projetos', sigla: 'prj', descricao: '', cor: 'roxo', tipo: 'gestao', ajustes: { contaPrazo: true, prazoManual: true, camposDesligados: ['assunto', 'alcance'] },
    });
    expect(r.statusCode, r.body).toBe(201);
    proj = r.json();
    expect(proj.ajustes).toMatchObject({ contaPrazo: true, prazoManual: true });
    const sem = await s.put(`/atendimento/paineis/${proj.id}`, { nome: 'Projetos', sigla: 'PRJ', descricao: 'Os projetos', cor: 'roxo', ajustes: { contaPrazo: true, camposDesligados: ['assunto', 'alcance'] } });
    expect(sem.statusCode, sem.body).toBe(200);
    expect((sem.json() as Painel).ajustes.prazoManual).toBe(true);
    const v = await s.put(`/atendimento/paineis/${com.id}`, { nome: com.nome, sigla: com.sigla, descricao: '', cor: com.cor, ajustes: { prazoManual: true } });
    expect(v.statusCode, v.body).toBe(200);
    expect((v.json() as Painel).ajustes.prazoManual).toBe(false);
  });

  it('o abrir escreve o prazo; o cartão conta em horas corridas; sem ele, fica sem prazo (e diz por quê)', async () => {
    const prazo = new Date(Date.now() + 48 * 3_600_000);
    prazo.setUTCSeconds(0, 0);
    const r = await s.post('/atendimento/chamados', { painelId: proj.id, titulo: 'Migração do PABX', prazo: prazo.toISOString() });
    expect(r.statusCode, r.body).toBe(201);
    const f = await ficha(r.json().id);
    expect(f.prazoEscrito).toBe(prazo.toISOString());
    expect(f.prazos.solucao).toMatchObject({ situacao: 'no_prazo', venceEm: prazo.toISOString(), conta: 'corridas' });
    const semPrazo = await s.post('/atendimento/chamados', { painelId: proj.id, titulo: 'Sem data ainda' });
    expect((await ficha(semPrazo.json().id)).prazos.solucao).toMatchObject({ situacao: 'sem', motivo: 'sem_prazo_escrito' });
    // no painel que conta o do assunto, o prazo escrito não entra
    const sup = await s.post('/atendimento/chamados', { painelId: 'painel-suporte', titulo: 'Ramal mudo', prazo: prazo.toISOString() });
    expect(sup.statusCode, sup.body).toBe(201);
    expect((await ficha(sup.json().id)).prazoEscrito).toBeNull();
  });

  it('a ficha muda e tira o prazo: o histórico guarda o de antes, e os alertas do prazo velho saem', async () => {
    const r = await s.post('/atendimento/chamados', { painelId: proj.id, titulo: 'Treinamento', prazo: instanteLocal('2026-12-01', '18:00').toISOString() });
    const id = r.json().id as string;
    await app.db.update(tickets).set({ alertsSent: { solucao_perto: new Date().toISOString(), resposta_perto: new Date().toISOString() } }).where(eq(tickets.id, id));
    const m = await s.patch(`/atendimento/chamados/${id}`, { prazo: instanteLocal('2026-12-03', '12:00').toISOString() });
    expect(m.statusCode, m.body).toBe(200);
    const [linha] = await app.db.select({ alertas: tickets.alertsSent, prazo: tickets.dueAt }).from(tickets).where(eq(tickets.id, id));
    expect(linha?.prazo?.toISOString()).toBe(instanteLocal('2026-12-03', '12:00').toISOString());
    expect(Object.keys((linha?.alertas as Record<string, string>) ?? {})).toEqual(['resposta_perto']);
    const t = await s.patch(`/atendimento/chamados/${id}`, { prazo: null });
    expect(t.statusCode, t.body).toBe(200);
    const f = await ficha(id);
    expect(f.prazoEscrito).toBeNull();
    expect(f.historico.map((e) => e.texto)).toEqual(expect.arrayContaining([
      'mudou Prazo de "01/12/2026 às 18:00" para "03/12/2026 às 12:00"', 'mudou Prazo de "03/12/2026 às 12:00" para (vazio)',
    ]));
    // no painel do prazo do assunto, mudar o prazo escrito é recusado
    const sup = (await s.post('/atendimento/chamados', { painelId: 'painel-suporte', titulo: 'Outro ramal' })).json();
    const recusado = await s.patch(`/atendimento/chamados/${sup.id}`, { prazo: instanteLocal('2026-12-03', '12:00').toISOString() });
    expect(recusado.statusCode).toBe(400);
    expect(recusado.json().error).toMatch(/vem do assunto/);
  });
});

describe('a marca de atualizar e o aviso da equipe', () => {
  it('o painel guarda as horas da marca (de 1 a 720); salvar sem dizer mantém', async () => {
    const r = await s.put('/atendimento/paineis/painel-suporte', { nome: 'Suporte', sigla: 'SUP', descricao: 'O suporte', cor: 'accent', ajustes: { horasSemAtualizacao: 24 } });
    expect(r.statusCode, r.body).toBe(200);
    expect((r.json() as Painel).ajustes.horasSemAtualizacao).toBe(24);
    const sem = await s.put('/atendimento/paineis/painel-suporte', { nome: 'Suporte', sigla: 'SUP', descricao: 'O suporte técnico', cor: 'accent', ajustes: {} });
    expect((sem.json() as Painel).ajustes.horasSemAtualizacao).toBe(24);
    const desliga = await s.put('/atendimento/paineis/painel-suporte', { nome: 'Suporte', sigla: 'SUP', descricao: 'O suporte técnico', cor: 'accent', ajustes: { horasSemAtualizacao: null } });
    expect((desliga.json() as Painel).ajustes.horasSemAtualizacao).toBeNull();
    expect((await s.put('/atendimento/paineis/painel-suporte', { nome: 'Suporte', sigla: 'SUP', descricao: '', cor: 'accent', ajustes: { horasSemAtualizacao: 0 } })).statusCode).toBe(400);
  });

  it('o "avisou pelo WhatsApp" de antes não aparece mais no histórico (o Luan: "não precisa desse registro de aviso")', async () => {
    const c = (await s.post('/atendimento/chamados', { painelId: 'painel-suporte', titulo: 'Fila parada' })).json();
    await app.db.insert(ticketEvents).values({ id: newId(), ticketId: c.id, kind: 'aviso_equipe', userId: null, actorName: null, data: { para: 'Eduardo', canal: 'whatsapp' }, createdAt: new Date() });
    const f = await ficha(c.id);
    expect(f.historico.some((e) => e.tipo === 'aviso_equipe')).toBe(false);
  });
});

describe('a caixinha única (o Luan: "checkbox único onde vai ser apenas um check unico identificando que a atividade já foi feita")', () => {
  it('o campo nasce com uma caixinha só, a "Feito" (o que veio escrito não conta); salvar de novo mantém a mesma', async () => {
    const r = await s.post('/atendimento/paineis/painel-suporte/campos', { nome: 'Backup conferido', tipo: 'feito', opcoes: [{ nome: 'A' }, { nome: 'B' }] });
    expect(r.statusCode, r.body).toBe(201);
    const c = r.json();
    expect(c.opcoes).toEqual([{ id: expect.any(String), nome: 'Feito', ativa: true }]);
    const de = await s.put(`/atendimento/campos/${c.id}`, { nome: 'Backup conferido com o cliente', tipo: 'feito', opcoes: [] });
    expect(de.statusCode, de.body).toBe(200);
    expect(de.json().opcoes).toEqual(c.opcoes);
    // não vira caixinhas
    expect((await s.put(`/atendimento/campos/${c.id}`, { nome: 'Backup conferido', tipo: 'caixinhas', opcoes: [{ nome: 'A' }] })).statusCode).toBe(400);
  });

  it('marcar guarda quem marcou e quando; o histórico diz "marcou … como feito"; o não desmarca', async () => {
    const campos = ((await s.get('/atendimento/opcoes')).json().campos as Array<{ id: string; nome: string; opcoes: Array<{ id: string }> }>);
    const c = campos.find((x) => x.nome === 'Backup conferido com o cliente')!;
    const opcao = c.opcoes[0]!.id;
    const t = (await s.post('/atendimento/chamados', { painelId: 'painel-suporte', titulo: 'Trocar o servidor' })).json();
    const m = await s.patch(`/atendimento/chamados/${t.id}`, { campos: { [c.id]: true } });
    expect(m.statusCode, m.body).toBe(200);
    let f = await ficha(t.id);
    expect(f.campos[c.id]).toEqual([opcao]);
    expect(f.marcas[c.id]?.[opcao]).toMatchObject({ porId: adminId });
    expect(f.historico.map((e) => e.texto)).toContain('marcou Backup conferido com o cliente como feito');
    expect((await s.patch(`/atendimento/chamados/${t.id}`, { campos: { [c.id]: 'não' } })).statusCode).toBe(200);
    f = await ficha(t.id);
    expect(f.campos[c.id]).toBeUndefined();
    expect(f.marcas[c.id]).toBeUndefined();
    expect(f.historico.map((e) => e.texto)).toContain('desmarcou Backup conferido com o cliente (não está mais feito)');
    const erro = await s.patch(`/atendimento/chamados/${t.id}`, { campos: { [c.id]: 'talvez' } });
    expect(erro.statusCode).toBe(400);
    expect(erro.json().error).toBe('Backup conferido com o cliente: marque como feito (sim) ou desmarque (não)');
  });
});
