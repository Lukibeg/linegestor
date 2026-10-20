/**
 * A PRÉVIA DO SIMULADOR DO COMERCIAL (Patch 2.0.2, decisão 0052): o Simulador sem servidor.
 *
 * Copia o servidor (`apps/api/src/services/simulador.ts` e a rota `routes/simulador.ts`): as mesmas
 * permissões, as mesmas mensagens de erro e as mesmas frases na auditoria. As contas e a validação vêm do
 * `@gestor/shared` (as mesmas do servidor). As negociações, os painéis e quem vê cada um vêm da prévia dos
 * chamados (demo-atendimento.ts): o painel Comercial (COM) é da Camila e do Diego.
 *
 * Os exemplos: a tabela de custos — a da Helena (o LineChat, por faixas: a de fábrica) e a do PABX (os
 * aparelhos sem valor: o Luan preenche em cada simulação, "pq pode alterar esses valores por data") —, os
 * modelos LinePBX em nuvem, LineChat (Helena) e LinePBX + LineChat, e quatro simulações: a Padaria Estrela com três cenários (comodato em 24 meses, os telefones vendidos em 12 meses e
 * 10% de desconto), o Hotel Beira Mar com a ativação em 3 vezes, a Clínica Vida no amarelo (sem negociação)
 * e a contraproposta da Escola Mundo Kids no vermelho (a negociação perdida).
 */
import {
  AJUSTES_DO_SIMULADOR_PADRAO, AjustesDoSimuladorSchema, CUSTOS_DA_HELENA, MODELO_DA_HELENA, SimulacaoGravarSchema, cenarioNovo, cenarioPrincipal, mudancasDaSimulacao, mudancasDosAjustes,
  resumoDoCenario,
  type AjustesDoSimulador, type CenarioDaSimulacao, type CustoDaTabela, type LinhaDoCenario, type ModeloDeSimulacao, type NegociacaoDaSimulacao,
  type Simulacao, type SimulacaoGravar,
} from '@gestor/shared';
import type { Api } from './index.js';
import { ApiError, type TrashItem } from './types.js';
import { acessoDoCalendarioDemo, type AtorDemo, type EstadoDaPrevia } from './demo-atendimento.js';
import { EMAIL_DA_PESSOA, type Pessoa } from './demo-atendimento-exemplos.js';

export type ContextoSimuladorDemo = {
  S: EstadoDaPrevia;
  id: () => string;
  wait: (ms?: number) => Promise<unknown>;
  audit: (action: string, entityType: string, summary: string, entityId?: string | null, extra?: { before?: unknown; after?: unknown }) => void;
  requirePerm: (perm: string) => void;
  /** a hora de agora (os testes podem adiantar o relógio) */
  agora?: () => Date;
};

/** A simulação como o servidor guarda (a tabela `sales_simulations`). */
type SimulacaoRow = {
  id: string; nome: string; negociacaoId: string | null; cenarios: CenarioDaSimulacao[]; principal: string;
  criadoPorId: string | null; alteradoPorId: string | null; criadoEm: string; alteradoEm: string; deletedAt: string | null;
};

type Esquema<T> = { safeParse(v: unknown): { success: true; data: T } | { success: false; error: { issues: Array<{ path: Array<string | number>; message: string }> } } };

const erro = (status: number, mensagem: string) => new ApiError(status, mensagem, null as never);
const bad = (mensagem: string) => erro(400, mensagem);
/** O pedido conferido como a rota confere (antes da permissão): "Dados inválidos" com a lista de campos. */
function ler<T>(esquema: Esquema<T>, v: unknown): T {
  const r = esquema.safeParse(v);
  if (!r.success) throw new ApiError(400, 'Dados inválidos', r.error.issues.map((i) => ({ field: i.path.join('.') || '(geral)', message: i.message })));
  return r.data;
}
const copia = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

// =====================================================================
//  OS EXEMPLOS: a tabela de custos e os modelos
// =====================================================================

const sem = { faixas: null, unidade: null } as const;
/** Os custos do PABX e as comissões (a tabela da Helena, o LineChat, vem de fábrica). */
const CUSTOS_DO_PABX: CustoDaTabela[] = [
  { id: 't31p', nome: 'Telefone IP Yealink T31P', tipo: 'aparelho', valor: null, porRamal: true, modalidade: 'comodato', ...sem },
  { id: 't43u', nome: 'Telefone IP Yealink T43U', tipo: 'aparelho', valor: null, porRamal: false, modalidade: 'comodato', ...sem },
  { id: 'headset', nome: 'Headset USB', tipo: 'aparelho', valor: null, porRamal: false, modalidade: 'comodato', ...sem },
  { id: 'nuvem', nome: 'Nuvem do PABX', tipo: 'mensal', valor: 900, porRamal: true, modalidade: null, faixas: null, unidade: 'ramal' },
  { id: 'did', nome: 'Número (DID) da operadora', tipo: 'mensal', valor: 1_500, porRamal: false, modalidade: null, faixas: null, unidade: 'número' },
  { id: 'canal', nome: 'Canal de voz da operadora', tipo: 'mensal', valor: 2_500, porRamal: false, modalidade: null, faixas: null, unidade: 'canal' },
  { id: 'config', nome: 'Configuração e instalação', tipo: 'unica', valor: 36_000, porRamal: false, modalidade: null, ...sem },
  { id: 'comissao', nome: 'Comissão do vendedor', tipo: 'pct_ativacao', valor: 10, porRamal: false, modalidade: null, ...sem },
  { id: 'recorrente', nome: 'Comissão recorrente', tipo: 'pct_mensalidade', valor: 2, porRamal: false, modalidade: null, ...sem },
];
const l = (custoId: string, qtd = 1, porRamal = false) => ({ custoId, qtd, porRamal });
const COMISSOES = [l('comissao'), l('recorrente')];
const MODELOS_DE_EXEMPLO: ModeloDeSimulacao[] = [
  { id: 'linepbx', nome: 'LinePBX em nuvem', linhas: [l('t31p', 1, true), l('nuvem', 1, true), l('did', 2), l('canal', 2), l('config'), ...COMISSOES] },
  { ...MODELO_DA_HELENA, linhas: [...MODELO_DA_HELENA.linhas, l('config'), ...COMISSOES] },
  { id: 'pbx-chat', nome: 'LinePBX + LineChat', linhas: [l('t31p', 1, true), l('nuvem', 1, true), l('did', 2), l('canal', 2), ...MODELO_DA_HELENA.linhas, l('config'), ...COMISSOES] },
];
export const AJUSTES_DO_SIMULADOR_DEMO: AjustesDoSimulador = { ...AJUSTES_DO_SIMULADOR_PADRAO, custos: [...CUSTOS_DA_HELENA, ...CUSTOS_DO_PABX], modelos: MODELOS_DE_EXEMPLO };

/** O Simulador da prévia, mais a lixeira (a Administração › Lixeira do demo.ts chama estas duas). */
export type SimuladorDemo = Api['simulador'] & { lixeira: () => TrashItem[]; restaurarDaLixeira: (id: string) => { ok: boolean } };

export function criarSimuladorDemo(ctx: ContextoSimuladorDemo): SimuladorDemo {
  const { S } = ctx;
  const agora = ctx.agora ?? (() => new Date());
  const X = { semeado: false, ajustes: copia(AJUSTES_DO_SIMULADOR_DEMO), simulacoes: [] as SimulacaoRow[] };
  const x = () => acessoDoCalendarioDemo();

  function preparar() {
    x().preparar();
    if (X.semeado) return;
    X.semeado = true;
    semear();
  }

  const pessoa = (p: Pessoa) => S.users.find((u) => u.email === EMAIL_DA_PESSOA[p])?.id ?? null;
  const nomeDe = (id: string | null) => (id ? S.users.find((u) => u.id === id)?.name ?? null : null);
  const podeEditar = (a: AtorDemo) => a.tipo === 'pessoa' && a.permissoes.includes('sales.read') && a.permissoes.includes('tickets.work');
  const podeCuidar = (a: AtorDemo) => a.tipo === 'pessoa' && a.permissoes.includes('sales.read') && a.permissoes.includes('tickets.manage');

  /** A negociação, como a pessoa vê: só a de um painel de Vendas que ela vê (como `negociacoesVisiveis` do servidor). */
  function negociacaoVisivel(id: string, a: AtorDemo): NegociacaoDaSimulacao | null {
    const n = x().negociacao(id);
    if (!n || n.id !== id) return null;
    const p = x().paineis().find((pp) => pp.id === n.painelId);
    if (!p || p.tipo !== 'vendas' || !x().podeVerPainel(p, a)) return null;
    return { id: n.id, codigo: n.codigo, titulo: n.titulo, empresa: n.empresa, resultado: n.resultado };
  }
  function conferirNegociacao(id: string, a: AtorDemo): NegociacaoDaSimulacao {
    const n = negociacaoVisivel(id, a);
    if (!n) throw bad('Essa negociação não existe ou é de um painel que você não vê: confira o código (COM-12).');
    return n;
  }

  function paraTela(r: SimulacaoRow, a: AtorDemo): Simulacao {
    return {
      id: r.id, nome: r.nome, negociacaoId: r.negociacaoId, negociacao: r.negociacaoId ? negociacaoVisivel(r.negociacaoId, a) : null,
      cenarios: copia(r.cenarios), principal: r.principal,
      criadoPor: nomeDe(r.criadoPorId), criadoEm: r.criadoEm, alteradoPor: nomeDe(r.alteradoPorId), alteradoEm: r.alteradoEm,
    };
  }
  const gravarDaLinha = (r: SimulacaoRow): SimulacaoGravar => ({ nome: r.nome, negociacaoId: r.negociacaoId, cenarios: copia(r.cenarios), principal: r.principal });
  function linhaOu404(id: string): SimulacaoRow {
    const r = X.simulacoes.find((s) => s.id === id && !s.deletedAt);
    if (!r) throw erro(404, 'Simulação não encontrado');
    return r;
  }

  // =====================================================================
  //  OS EXEMPLOS: quatro simulações
  // =====================================================================

  function semear() {
    const a = X.ajustes;
    const modelo = (id: string) => a.modelos.find((m) => m.id === id)!;
    /** O cenário de um modelo, com os números e os valores dos aparelhos (o que o vendedor preencheu). */
    const cenario = (id: string, nome: string, modeloId: string, n: Partial<CenarioDaSimulacao>, mudar: (l: LinhaDoCenario) => LinhaDoCenario | null = (x2) => x2): CenarioDaSimulacao => {
      const c = cenarioNovo(a, { id, nome, modelo: modelo(modeloId) });
      return { ...c, ...n, linhas: c.linhas.map(mudar).filter((x2): x2 is LinhaDoCenario => !!x2) };
    };
    const telefone = (valor: number, extra: Partial<LinhaDoCenario> = {}) => (x2: LinhaDoCenario) => (x2.custoId === 't31p' ? { ...x2, valor, ...extra } : x2);
    /** A quantidade de cada linha (pelo custo da tabela de onde veio). */
    const quantidade = (x2: LinhaDoCenario, q: Record<string, number>) => (x2.custoId && q[x2.custoId] !== undefined ? { ...x2, qtd: q[x2.custoId]! } : x2);
    const negociacao = (titulo: string) => x().chamados().find((t) => t.titulo === titulo && x().paineis().find((p) => p.id === t.painelId)?.tipo === 'vendas')?.id ?? null;
    const dias = (n: number, hora = 10) => { const d = new Date(agora()); d.setDate(d.getDate() - n); d.setHours(hora, 15, 0, 0); return d.toISOString(); };
    const nova = (r: Omit<SimulacaoRow, 'id' | 'deletedAt' | 'alteradoPorId' | 'alteradoEm'> & { alteradoEm?: string }) => {
      X.simulacoes.push({ ...r, id: ctx.id(), alteradoPorId: r.criadoPorId, alteradoEm: r.alteradoEm ?? r.criadoEm, deletedAt: null });
    };

    // a Padaria Estrela: 40 ramais; a mesma venda em três versões
    nova({
      nome: 'Padaria Estrela — 40 ramais', negociacaoId: negociacao('PABX em nuvem — 40 ramais'), principal: 'a',
      criadoPorId: pessoa('camila'), criadoEm: dias(9), alteradoEm: dias(1, 16),
      cenarios: [
        cenario('a', 'Comodato, 24 meses', 'linepbx', { mensalidade: 125_000, ativacao: 190_000, ramais: 40 }, (x2) => (x2.custoId === 'did' || x2.custoId === 'canal' ? { ...x2, qtd: 4 } : telefone(39_000)(x2))),
        cenario('b', 'Telefones vendidos, 12 meses', 'linepbx', { mensalidade: 125_000, ativacao: 190_000, ramais: 40, prazo: 12, parcelas: 3 },
          (x2) => (x2.custoId === 'did' || x2.custoId === 'canal' ? { ...x2, qtd: 4 } : telefone(39_000, { modalidade: 'venda', preco: 45_000 })(x2))),
        cenario('c', '10% de desconto, 36 meses', 'linepbx', { mensalidade: 112_500, ativacao: 171_000, ramais: 40, prazo: 36 }, (x2) => (x2.custoId === 'did' || x2.custoId === 'canal' ? { ...x2, qtd: 4 } : telefone(39_000)(x2))),
      ],
    });
    // o Hotel Beira Mar: o PABX e o LineChat; 20 telefones para 30 ramais; a ativação em 3 vezes
    nova({
      nome: 'Hotel Beira Mar — URA, filas e LineChat', negociacaoId: negociacao('Atendimento com URA e filas'), principal: 'a',
      criadoPorId: pessoa('diego'), criadoEm: dias(12), alteradoEm: dias(4, 11),
      cenarios: [
        cenario('a', 'Cenário A', 'pbx-chat', { mensalidade: 158_000, ativacao: 250_000, ramais: 30, prazo: 36, parcelas: 3 },
          (x2) => (x2.custoId === 't31p' ? { ...x2, porRamal: false, qtd: 20, valor: 39_000 } : quantidade(x2, { 'helena-usuarios': 4, 'helena-canais': 2, 'helena-zapi': 1, 'helena-contatos': 8_000 }))),
      ],
    });
    // a Clínica Vida: o LineChat, sem negociação ligada (a conta de antes de abrir o lead); no amarelo
    nova({
      nome: 'Clínica Vida — LineChat, 5 atendentes', negociacaoId: null, principal: 'a',
      criadoPorId: pessoa('camila'), criadoEm: dias(6, 15),
      cenarios: [cenario('a', 'Cenário A', 'linechat-helena', { mensalidade: 49_000, ativacao: 0, prazo: 12 },
        (x2) => (x2.custoId === 'config' ? null : quantidade(x2, { 'helena-usuarios': 5, 'helena-canais': 2, 'helena-zapi': 1 })))],
    });
    // a Escola Mundo Kids: a contraproposta que ficou no vermelho (a negociação foi perdida)
    nova({
      nome: 'Escola Mundo Kids — contraproposta', negociacaoId: negociacao('PABX para a escola'), principal: 'a',
      criadoPorId: pessoa('diego'), criadoEm: dias(41, 9),
      cenarios: [cenario('a', 'Cenário A', 'linepbx', { mensalidade: 39_000, ativacao: 0, ramais: 25 }, telefone(39_000))],
    });
  }

  // =====================================================================
  //  A API
  // =====================================================================

  const api: SimuladorDemo = {
    async opcoes() {
      await ctx.wait(60);
      ctx.requirePerm('sales.read'); preparar();
      const a = x().eu();
      return { ajustes: copia(X.ajustes), podeEditar: podeEditar(a), podeCuidar: podeCuidar(a) };
    },
    async listar() {
      await ctx.wait(80);
      ctx.requirePerm('sales.read'); preparar();
      const a = x().eu();
      return X.simulacoes.filter((r) => !r.deletedAt).sort((p, q) => q.alteradoEm.localeCompare(p.alteradoEm)).map((r) => {
        const s = paraTela(r, a);
        return {
          id: s.id, nome: s.nome, negociacao: s.negociacao, negociacaoOculta: !!r.negociacaoId && !s.negociacao, cenarios: s.cenarios.length,
          principal: resumoDoCenario(cenarioPrincipal(s), X.ajustes), criadoPor: s.criadoPor, alteradoPor: s.alteradoPor, alteradoEm: s.alteradoEm,
        };
      });
    },
    async ler(id) {
      await ctx.wait(60);
      ctx.requirePerm('sales.read'); preparar();
      return paraTela(linhaOu404(id), x().eu());
    },
    async daNegociacao(negociacaoId) {
      await ctx.wait(60);
      ctx.requirePerm('sales.read'); preparar();
      if (!negociacaoVisivel(negociacaoId, x().eu())) return [];
      return X.simulacoes.filter((r) => r.negociacaoId === negociacaoId && !r.deletedAt).sort((p, q) => q.alteradoEm.localeCompare(p.alteradoEm))
        .map((r) => ({ id: r.id, nome: r.nome, cenarios: r.cenarios.length, principal: resumoDoCenario(cenarioPrincipal(r), X.ajustes) }));
    },
    async criar(d) {
      await ctx.wait(200);
      const s = ler(SimulacaoGravarSchema, d);
      ctx.requirePerm('sales.read'); ctx.requirePerm('tickets.work'); preparar();
      const a = x().eu();
      const n = s.negociacaoId ? conferirNegociacao(s.negociacaoId, a) : null;
      const quem = a.tipo === 'pessoa' ? a.id : null;
      const quando = agora().toISOString();
      const r: SimulacaoRow = { id: ctx.id(), nome: s.nome, negociacaoId: s.negociacaoId, cenarios: copia(s.cenarios), principal: s.principal, criadoPorId: quem, alteradoPorId: quem, criadoEm: quando, alteradoEm: quando, deletedAt: null };
      X.simulacoes.push(r);
      const k = s.cenarios.length;
      ctx.audit('create', 'sales_simulation', `Criou a simulação "${s.nome}"${k > 1 ? ` (${k} cenários)` : ''}${n ? ` (ligada à ${n.codigo})` : ''}`, r.id, { after: s });
      return paraTela(r, a);
    },
    async alterar(id, d) {
      await ctx.wait(200);
      const s = ler(SimulacaoGravarSchema, d);
      ctx.requirePerm('sales.read'); ctx.requirePerm('tickets.work'); preparar();
      const a = x().eu();
      const r = linhaOu404(id);
      // a negociação que a pessoa não vê fica como estava (ela manda o mesmo id que leu); a nova, ela tem de ver
      const n = s.negociacaoId && s.negociacaoId !== r.negociacaoId ? conferirNegociacao(s.negociacaoId, a) : null;
      const antes = gravarDaLinha(r);
      Object.assign(r, { nome: s.nome, negociacaoId: s.negociacaoId, cenarios: copia(s.cenarios), principal: s.principal, alteradoPorId: a.tipo === 'pessoa' ? a.id : null, alteradoEm: agora().toISOString() });
      const tela = paraTela(r, a);
      const mudou = mudancasDaSimulacao(antes, s);
      if (antes.negociacaoId !== s.negociacaoId) mudou.push(s.negociacaoId ? `ligou à ${n?.codigo ?? tela.negociacao?.codigo ?? 'negociação'}` : 'desligou da negociação');
      ctx.audit('update', 'sales_simulation', mudou.length ? `Mudou a simulação "${s.nome}": ${mudou.join('; ')}` : `Salvou a simulação "${s.nome}" (sem mudança)`, id, { before: antes, after: s });
      return tela;
    },
    async duplicar(id) {
      await ctx.wait(150);
      ctx.requirePerm('sales.read'); ctx.requirePerm('tickets.work'); preparar();
      const a = x().eu();
      const o = linhaOu404(id);
      const nome = `${o.nome} (cópia)`.slice(0, 120);
      const quem = a.tipo === 'pessoa' ? a.id : null;
      const quando = agora().toISOString();
      const r: SimulacaoRow = { ...copia(o), id: ctx.id(), nome, criadoPorId: quem, alteradoPorId: quem, criadoEm: quando, alteradoEm: quando, deletedAt: null };
      X.simulacoes.push(r);
      ctx.audit('create', 'sales_simulation', `Duplicou a simulação "${o.nome}" em "${nome}"`, r.id, { after: gravarDaLinha(r) });
      return paraTela(r, a);
    },
    async remover(id) {
      await ctx.wait(120);
      ctx.requirePerm('sales.read'); ctx.requirePerm('tickets.work'); preparar();
      const a = x().eu();
      const r = linhaOu404(id);
      r.deletedAt = agora().toISOString();
      r.alteradoPorId = a.tipo === 'pessoa' ? a.id : null;
      ctx.audit('delete', 'sales_simulation', `Mandou a simulação "${r.nome}" para a lixeira`, id);
      return { ok: true };
    },
    async salvarAjustes(entrada) {
      await ctx.wait(200);
      const ajustes = ler(AjustesDoSimuladorSchema, entrada);
      ctx.requirePerm('sales.read'); ctx.requirePerm('tickets.manage'); preparar();
      const antes = X.ajustes;
      X.ajustes = copia(ajustes);
      const mudou = mudancasDosAjustes(antes, ajustes);
      ctx.audit('settings_simulador', 'settings', mudou.length ? `Mudou nos Ajustes do Simulador: ${mudou.join('; ')}` : 'Salvou os Ajustes do Simulador (sem mudança)', 'comercial-simulador', { before: antes, after: ajustes });
      return copia(X.ajustes);
    },
    lixeira: () => X.simulacoes.filter((r) => r.deletedAt).map((r) => ({ type: 'salesSimulation', id: r.id, label: `Simulação · ${r.nome}`, deletedAt: r.deletedAt! })),
    restaurarDaLixeira: (id) => {
      const r = X.simulacoes.find((s) => s.id === id && s.deletedAt);
      if (!r) throw erro(404, 'Simulação não encontrado');
      r.deletedAt = null;
      ctx.audit('restore', 'sales_simulation', `Restaurou a simulação "${r.nome}" do Comercial da lixeira`, id);
      return { ok: true };
    },
  };
  return api;
}
