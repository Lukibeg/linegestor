/**
 * Os Relatórios dos painéis de chamados na prévia (2.1, decisão 0055): as mesmas contas do servidor (o
 * `relatoriosDoPainel` do shared) sobre a base montada como o servidor monta, os meses de antes do Suporte (o
 * histórico da prévia, para os relatórios terem o que mostrar) e a arrumação de cada painel.
 */
import { describe, expect, it } from 'vitest';
import { CATALOGO_DOS_RELATORIOS, diaLocal, somarDias, type RelatoriosDoPainel } from '@gestor/shared';
import { demoApi } from './demo.js';
import { diagnosticoDosChamadosDemo } from './demo-atendimento.js';
import { EXEMPLOS } from './demo-atendimento-exemplos.js';
import { ApiError } from './types.js';

const api = demoApi.atendimento;
// a senha pública da prévia (a tela de entrar da prévia mostra), não um segredo
const SENHA_DA_PREVIA = 'demo';
const DEMORA = 60_000;

async function entrar(quem: 'admin' | 'operador' | 'tecnico' | 'leitor' | 'camila') {
  await demoApi.auth.logout();
  return (await demoApi.auth.login(`${quem}@gestor.local`, SENHA_DA_PREVIA)).user!;
}
async function erroDe(p: Promise<unknown>): Promise<ApiError> {
  try { await p; } catch (e) { if (e instanceof ApiError) return e; throw e; }
  throw new Error('Era para dar erro, e passou.');
}
/** Todos os ids citados pelas peças (para conferir que a lista curta tem cada um). */
function idsCitados(r: RelatoriosDoPainel): Set<string> {
  const out = new Set<string>();
  const andar = (v: unknown, chave: string) => {
    if (Array.isArray(v)) {
      if (['ids', 'idsEntrou', 'idsSaiu', 'foraIds', 'idsSobem', 'ultimos'].includes(chave)) for (const x of v) if (typeof x === 'string') out.add(x);
      for (const x of v) andar(x, '');
    } else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) andar(x, chave === 'ids' ? 'ids' : k);
  };
  for (const [k, v] of Object.entries(r)) if (k !== 'chamados' && k !== 'aplicaveis') andar(v, k);
  return out;
}

describe('os meses de antes do Suporte (o histórico da prévia)', () => {
  it('nascem pelas regras de sempre, misturados com os exemplos na ordem de chegada, todos fechados e sem aviso no sininho', async () => {
    await entrar('admin');
    const diag = diagnosticoDosChamadosDemo()!;
    expect(diag.erros).toEqual([]);
    // uns cinco meses, perto de 4 por dia útil (com os exemplos)
    expect(diag.historico.length).toBeGreaterThan(300);
    expect(diag.historico.length).toBeLessThan(560);
    const todos = (await api.lista({ situacao: 'todos', pageSize: 1000 })).items.filter((c) => c.painelId === 'painel-suporte');
    const codigos = new Set(diag.historico);
    const doHistorico = todos.filter((c) => codigos.has(c.codigo));
    expect(doHistorico).toHaveLength(diag.historico.length);
    expect(doHistorico.every((c) => c.situacao === 'fechado')).toBe(true);
    // a numeração segue a ordem de chegada (o histórico e os exemplos misturados)
    const emOrdem = [...todos].sort((a, b) => a.numero - b.numero);
    for (let i = 1; i < emOrdem.length; i++) expect(Date.parse(emOrdem[i]!.criadoEm)).toBeGreaterThanOrEqual(Date.parse(emOrdem[i - 1]!.criadoEm));
    // nenhum título repete o de um exemplo (as telas e os testes acham os exemplos pelo título)
    const titulosDosExemplos = new Set(EXEMPLOS.map((e) => (e.abre === 'agendado' ? null : e.dados.titulo)).filter(Boolean));
    expect(doHistorico.filter((c) => titulosDosExemplos.has(c.titulo))).toEqual([]);
    // o sininho não tem aviso do histórico
    const av = await api.avisos();
    expect(av.itens.filter((a) => a.chamado && codigos.has(a.chamado.codigo))).toEqual([]);
    // a ficha de um deles conta a história: aberto, pego, resolvido e fechado sozinho
    const f = await api.chamado(diag.historico[0]!);
    expect(f.historico.map((e) => e.tipo)).toEqual(expect.arrayContaining(['criado', 'etapa', 'fechou_sozinho']));
  }, DEMORA);
});

describe('os Relatórios do Suporte na prévia', () => {
  it('as mesmas contas do servidor: o período, os 25 relatórios e a lista curta de cada número', async () => {
    await entrar('admin');
    const hoje = diaLocal(new Date());
    const r = await api.relatorios({ painel: 'SUP' });
    expect(r.painel.sigla).toBe('SUP');
    expect(r.periodo).toMatchObject({ de: somarDias(hoje, -29), ate: hoje, dias: 30 });
    expect(r.aplicaveis).toHaveLength(CATALOGO_DOS_RELATORIOS.length);
    // o período tem chamados, resolvidos e fila
    expect(r.fila.entrou).toBeGreaterThan(20);
    expect(r.relogio.resolvidos).toBeGreaterThan(10);
    expect(r.relogio.mediana).toBeGreaterThan(0);
    expect(r.escada.degraus[0]!.resolvem).toBeGreaterThan(0);
    expect(r.arvore.raiz.length).toBeGreaterThan(3);
    expect(r.calor.n).toBe(r.fila.entrou);
    // cada número clicável tem os seus chamados na lista curta
    const naLista = new Set(r.chamados.map((c) => c.id));
    for (const id of idsCitados(r)) expect(naLista.has(id)).toBe(true);
  }, DEMORA);

  it('com o histórico, o que precisa de semanas e meses tem o que mostrar', async () => {
    await entrar('admin');
    const hoje = diaLocal(new Date());
    const r = await api.relatorios({ painel: 'SUP', de: somarDias(hoje, -89), ate: hoje });
    // a previsão usa as 8 semanas completas de antes
    expect(r.previsao.semanas).toBe(8);
    expect(r.previsao.total).toBeGreaterThan(5);
    // o sobe e desce compara com os 90 dias de antes
    expect(r.sobe.semComparacao).toBe(false);
    expect(r.sobe.antes).toBeGreaterThan(50);
    // o fechamento do mês: o mês passado contra o de antes
    expect(r.fechamento.chegaram.agora).toBeGreaterThan(30);
    expect(r.fechamento.chegaram.antes).toBeGreaterThan(30);
    expect(r.fechamento.destaques.length).toBeGreaterThanOrEqual(3);
    // a escada sobe até o N3 (e às vezes o DEV), com os motivos
    expect(r.escada.degraus[1]!.entram).toBeGreaterThan(5);
    expect(r.escada.motivos.length).toBeGreaterThan(0);
    // a operadora, o tempo gasto, a falha e o que voltou
    expect(r.operadora.chamados).toBeGreaterThan(3);
    expect(r.tempogasto.minutos).toBeGreaterThan(0);
    expect(r.falha.campo?.nome).toBe('Responsabilidade');
    expect(r.falha.porOpcao.length).toBeGreaterThanOrEqual(3);
    expect(r.voltou.linhas.length).toBeGreaterThan(0);
    // 12 meses no raio-X de um cliente
    const rx = await api.relatorios({ painel: 'SUP', de: somarDias(hoje, -89), ate: hoje, raiox: r.clientes.lista[0]!.id });
    expect(rx.clientes.raiox?.meses).toHaveLength(12);
    expect(rx.clientes.raiox?.meses.filter((m) => m.n > 0).length).toBeGreaterThanOrEqual(4);
  }, DEMORA);

  it('os filtros, o painel de Vendas e quem vê', async () => {
    await entrar('admin');
    const r = await api.relatorios({ painel: 'SUP', nivel: 2 });
    expect(r.escada.degraus[0]!.resolvem).toBe(0);
    expect((await erroDe(api.relatorios({ painel: 'COM' }))).message).toContain('é de vendas');
    expect((await erroDe(api.relatorios({ painel: 'SUP', de: '2026-10-22', ate: '2026-10-01' }))).status).toBe(400);
    // o Desenvolvimento também tem os relatórios (sem prazo: o Prazo cumprido não aparece; sem etapa de nível: nem a escada)
    const dev = await api.relatorios({ painel: 'DEV' });
    expect(dev.aplicaveis).not.toContain('prazo');
    expect(dev.aplicaveis).not.toContain('arvore');
    expect(dev.aplicaveis).not.toContain('escada');
    expect(dev.aplicaveis).toContain('empaca');
    // a Camila (o Comercial) vê os chamados, mas não o painel de quem só os escolhidos veem
    await entrar('camila');
    expect((await api.relatorios({ painel: 'SUP' })).painel.sigla).toBe('SUP');
  }, DEMORA);

  it('a arrumação de cada painel: quem cuida arruma para todos; vai para a auditoria', async () => {
    await entrar('operador');
    const a = await api.arrumacaoDosRelatorios('SUP');
    expect(a.ordem).toEqual(CATALOGO_DOS_RELATORIOS.map((x) => x.id));
    expect(a.campos.map((c) => c.nome)).toEqual(['Responsabilidade']);
    expect((await erroDe(api.salvarArrumacaoDosRelatorios('SUP', { ...a, favoritos: ['relogio'] }))).status).toBe(403);
    await entrar('admin');
    const campo = a.campos[0]!.id;
    const salva = await api.salvarArrumacaoDosRelatorios('SUP', { ordem: ['escada', 'prazo'], ocultos: ['calor'], favoritos: ['prazo', 'fila'], campoDaFalha: campo });
    expect(salva.ordem.slice(0, 2)).toEqual(['escada', 'prazo']);
    expect(salva).toMatchObject({ ocultos: ['calor'], favoritos: ['prazo', 'fila'], campoDaFalha: campo, atualizadoPor: 'Luan França' });
    expect((await api.arrumacaoDosRelatorios('DEV')).favoritos).toEqual([]);
    expect((await erroDe(api.salvarArrumacaoDosRelatorios('SUP', { ...salva, campoDaFalha: 'nao-existe' }))).message).toContain('não é um campo de lista deste painel');
    const r = await api.relatorios({ painel: 'SUP' });
    expect(r.falha.campo).toMatchObject({ id: campo, automatico: false });
    const auditoria = await demoApi.admin.audit({ entityId: 'atendimento-relatorios', pageSize: 5 });
    expect(auditoria.items[0]!.summary).toBe('Luan França arrumou os Relatórios do painel Suporte para a equipe (24 à vista, 1 escondido, 2 favoritos; a falha sai do campo Responsabilidade)');
  }, DEMORA);
});
