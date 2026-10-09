/**
 * Inventário › Relatórios (Patch 1.9, decisão 0041) — AS CONTAS, as mesmas no servidor e na
 * prévia. O servidor lê o banco, monta a `BaseInventario` e chama `relatoriosInventario`; a prévia
 * monta a mesma base com os dados de exemplo. Mudou a conta, muda aqui (e no teste daqui), nunca
 * numa cópia — senão a prévia mente.
 *
 * O pedido (09/10): "gostaria de mais informações sobre os equipamentos, tá bem enxuto, gere alguns
 * relatórios". Cada relatório responde uma pergunta que a tela do Inventário não responde:
 *  - **Quem tem o quê**: quantos de cada modelo estão em cada cliente, e quanto isso vale?
 *    (O "Para recolher ou regularizar" saiu na prévia, 09/10: o Luan não quis.)
 *  - **Na prateleira**: o que temos para entregar, há quanto tempo está parado e para quantas
 *    semanas dá, pelo ritmo de saída?
 *  - **Quanto vale o parque**: quanto dinheiro temos em aparelho, e onde ele está?
 *  - **Vai e volta**: o que sai, o que volta, e quantos voltam inativos?
 *  - **Cadastro em dia**: o que falta preencher para o inventário ser confiável?
 *  - **Relação do cliente**: os aparelhos de um cliente, por unidade, para imprimir.
 *
 * Regras que valem para todos:
 *  - **vendido já não é nosso**: fica fora do patrimônio, do estoque e de "quem tem o quê" (aparece
 *    só como informação e, na relação do cliente, à parte);
 *  - o valor de um aparelho é o **próprio** ou, sem ele, o **do modelo** (como no resto do sistema);
 *    sem nenhum dos dois, o aparelho conta, mas não soma — e o Cadastro em dia avisa;
 *  - "dia" é sempre o de **Brasília**;
 *  - a **história de cada aparelho** é refeita pelas movimentações dele, em ordem: é ela que diz
 *    quando ele saiu do estoque, desde quando está onde está e quanto tempo ficou no cliente antes
 *    de voltar. O histórico só existe desde a primeira movimentação guardada no Gestor
 *    (`historicoDesde`), e as telas dizem isso.
 */
import { macFormatado, identificacaoAparelho, reais } from './formatos.js';
import { diaEmBrasilia, diasEntre, somarDias } from './chamados.js';
import { mediana } from './relatorios.js';

// ---------- a base: o que o servidor lê do banco (e a prévia inventa) ----------

/** Um aparelho como está agora (os da lixeira não entram). */
export type AparelhoDaBase = {
  id: string;
  modelId: string;
  mac: string | null;
  serialNumber: string | null;
  /** com quem está (vazio = no nosso estoque) */
  clientId: string | null;
  unit: string | null;
  /** locacao | comodato | venda (vazio no estoque) */
  currentModality: string | null;
  /** ativo | inativo */
  condition: string;
  /** o valor PRÓPRIO, em centavos (vazio = vale o do modelo) */
  valueCents: number | null;
  ip: string | null;
  note: string | null;
  /** quando foi cadastrado (ISO) */
  createdAt: string;
};

export type ModeloDaBase = { id: string; name: string; categoryName: string | null; valueCents: number | null; temFoto: boolean };

export type ClienteDaBase = {
  id: string;
  nome: string;
  razaoSocial: string;
  cnpj: string;
  interno: boolean;
  arquivado: boolean;
  /** quando foi para a lixeira (ISO), ou vazio */
  naLixeiraDesde: string | null;
  /** assina o Equipamentos hoje */
  temEquipamentos: boolean;
  /** quantos produtos ativos ele tem hoje (fora da lixeira), contando o Equipamentos */
  produtosAtivos: number;
  /** tem a rede padrão dos aparelhos cadastrada (Acessos) */
  temRedePadrao: boolean;
  /** os modelos que têm o login padrão cadastrado neste cliente */
  modelosComLogin: string[];
  /** as unidades (a Matriz é a `principal`), com o endereço, para a relação impressa */
  unidades: Array<{ nome: string; endereco: string | null; principal: boolean }>;
};

export type MovimentacaoDaBase = {
  id: string;
  /** locacao | comodato | venda | devolucao */
  modality: string;
  fromClientId: string | null;
  toClientId: string | null;
  unit: string | null;
  /** a condição aplicada aos aparelhos (vazio = manteve) */
  newCondition: string | null;
  /** quando (ISO) */
  createdAt: string;
  deviceIds: string[];
};

export type BaseInventario = {
  agora: Date;
  aparelhos: AparelhoDaBase[];
  modelos: ModeloDaBase[];
  clientes: ClienteDaBase[];
  movimentacoes: MovimentacaoDaBase[];
};

// ---------- o que sai: os relatórios ----------

/** Um aparelho do jeito que as janelas dos relatórios mostram. */
export type AparelhoDoRelatorio = {
  id: string;
  /** MAC formatado, N/S ou "não aplicável" */
  identificacao: string;
  tipoId: 'mac' | 'serie' | 'nenhum';
  modelId: string;
  modelo: string;
  clienteId: string | null;
  cliente: string | null;
  /** a unidade do cliente (vazio no estoque; vazio com cliente = Matriz) */
  unidade: string | null;
  modalidade: string | null;
  condicao: string;
  /** o valor que vale (próprio ou do modelo); vazio = sem valor */
  valorCents: number | null;
  ip: string | null;
  /** desde quando está onde está (AAAA-MM-DD): no cliente de agora, ou no estoque */
  desde: string;
  /** dias desde então */
  dias: number;
};

/** Os dados de um cliente que as telas precisam (só os que têm ou já tiveram aparelho). */
export type ClienteDoRelatorio = Pick<ClienteDaBase, 'id' | 'nome' | 'razaoSocial' | 'cnpj' | 'interno' | 'arquivado' | 'unidades'> & { naLixeira: boolean };

export type LinhaQuemTem = {
  clienteId: string;
  nome: string;
  interno: boolean;
  /** o cliente saiu da base (na lixeira, arquivado, sem produto ativo ou sem o Equipamentos), ou vazio */
  foraDaBase: ForaDaBase | null;
  porModelo: Record<string, number>;
  total: number;
  comodato: number;
  locacao: number;
  inativos: number;
  /** comodato + locação (+ o que estiver sem modalidade) */
  valorCents: number;
  /** aparelhos sem valor nenhum (não somam) */
  semValor: number;
  /** em quantas unidades do cliente */
  unidades: number;
  ids: string[];
};
export type QuemTemOQue = {
  /** as colunas: os modelos com aparelho nosso (no estoque ou em cliente), os maiores primeiro */
  modelos: Array<{ id: string; nome: string; comClientes: number; noEstoque: number }>;
  linhas: LinhaQuemTem[];
  totais: { porModelo: Record<string, number>; total: number; comodato: number; locacao: number; valorCents: number };
  estoque: { porModelo: Record<string, number>; total: number; ids: string[] };
  vendidos: { aparelhos: number; clientes: number; ids: string[] };
};

/** Por que o cliente saiu da base — a marca ao lado do nome, no Quem tem o quê. */
export type ForaDaBase = 'lixeira' | 'arquivado' | 'sem_produto' | 'sem_equipamentos';
export const FORA_DA_BASE: Record<ForaDaBase, { rotulo: string; texto: string }> = {
  lixeira: { rotulo: 'cliente na lixeira', texto: 'O cliente foi para a lixeira, mas os aparelhos continuam atribuídos a ele.' },
  arquivado: { rotulo: 'cliente arquivado', texto: 'O cliente está arquivado e ainda tem aparelho nosso.' },
  sem_produto: { rotulo: 'sem produto ativo', texto: 'Todos os produtos do cliente foram encerrados.' },
  sem_equipamentos: { rotulo: 'sem o Equipamentos', texto: 'O cliente não assina mais o Equipamentos: recolha os aparelhos ou marque o produto de novo.' },
};

export type SituacaoEstoque = 'acabou' | 'pouco' | 'parado' | 'ok' | 'sem_ritmo';
export const SITUACOES_ESTOQUE: Record<SituacaoEstoque, string> = {
  acabou: 'sem estoque',
  pouco: 'pouco estoque',
  parado: 'sem saída',
  ok: 'em dia',
  sem_ritmo: 'pouco histórico',
};
/** As faixas de "parado há": quanto tempo o aparelho está no estoque desde que chegou (ou voltou). */
export const FAIXAS_ESTOQUE: Array<{ id: string; rotulo: string; ate: number }> = [
  { id: 'ate30', rotulo: 'até 30 dias', ate: 31 },
  { id: 'ate90', rotulo: '31 a 90 dias', ate: 91 },
  { id: 'ate180', rotulo: '91 a 180 dias', ate: 181 },
  { id: 'mais180', rotulo: 'mais de 180 dias', ate: Infinity },
];
/** A janela do ritmo de saída: os últimos 90 dias (ou desde o começo do histórico, se for menos). */
export const JANELA_RITMO_DIAS = 90;
/** Com menos de 4 semanas de histórico, o ritmo engana: a tela mostra as saídas, mas não a conta. */
export const MINIMO_RITMO_DIAS = 28;
/** Quanto estoque é "pouco": dá para menos que isto, em semanas, pelo ritmo de saída. */
export const SEMANAS_POUCO = 4;
/** Parado há mais que isto, em dias, é "parado há muito tempo". */
export const DIAS_PARADO = 90;

export type Prateleira = {
  /** o começo da janela do ritmo (AAAA-MM-DD) e quantos dias ela tem */
  desde: string | null;
  janelaDias: number;
  ritmoConfiavel: boolean;
  modelos: Array<{
    id: string;
    nome: string;
    /** ativos no estoque: o que dá para entregar */
    ativos: number;
    inativos: number;
    /** o valor do que está no estoque (ativos e inativos) */
    valorCents: number;
    /** saídas do estoque para cliente (locação, comodato ou venda) na janela */
    saidas: number;
    porSemana: number | null;
    /** para quantas semanas os ativos dão, no ritmo de saída */
    semanas: number | null;
    /** há quantos dias os ativos estão parados: o do meio e o mais antigo */
    idadeMediana: number | null;
    maisAntigo: number | null;
    situacao: SituacaoEstoque;
    idsAtivos: string[];
    idsInativos: string[];
  }>;
  /** os ativos do estoque por tempo parado */
  faixas: Array<{ id: string; rotulo: string; n: number; ids: string[] }>;
  totais: { ativos: number; inativos: number; valorCents: number; valorInativosCents: number; paradosHaMuito: number };
};

export type ParteDoParque = 'comodato' | 'locacao' | 'outros' | 'interno' | 'estoque' | 'estoque_inativo';
export const PARTES_DO_PARQUE: Record<ParteDoParque, string> = {
  comodato: 'em comodato',
  locacao: 'em locação',
  outros: 'com cliente, sem modalidade',
  interno: 'em uso interno',
  estoque: 'no estoque, ativos',
  estoque_inativo: 'no estoque, inativos',
};
export type ValorDoParque = {
  /** o patrimônio: tudo o que é nosso (sem os vendidos) */
  totalCents: number;
  aparelhos: number;
  partes: Array<{ id: ParteDoParque; rotulo: string; n: number; valorCents: number; ids: string[] }>;
  porModelo: Array<{ id: string; nome: string; valorDoModeloCents: number | null; n: number; valorCents: number; semValor: number; proprio: number }>;
  /** aparelhos que não somam porque nem eles nem o modelo têm valor */
  semValor: number;
  vendidos: { n: number; valorCents: number };
};

export type VaiEVolta = {
  /** o começo do histórico (a primeira movimentação guardada) */
  desde: string | null;
  totais: { saidas: number; devolucoes: number; voltaramInativos: number; transferencias: number };
  porModelo: Array<{ id: string; nome: string; saidas: number; devolucoes: number; inativos: number; medianaDias: number | null; idsInativos: string[]; idsDevolvidos: string[] }>;
  porCliente: Array<{ clienteId: string; nome: string; recebeu: number; devolveu: number; inativos: number; ultimaDevolucao: string | null; idsDevolvidos: string[] }>;
  /** as últimas devoluções (uma por movimentação), da mais nova para a mais velha */
  ultimas: Array<{ id: string; dia: string; clienteId: string | null; cliente: string; n: number; inativos: number; modelos: string; ids: string[] }>;
};

export type IdItemCadastro = 'id_na_anotacao' | 'sem_identificacao' | 'modelo_sem_valor' | 'sem_login' | 'sem_rede' | 'valor_proprio' | 'modelo_sem_foto';
export type ItemCadastro = {
  id: IdItemCadastro;
  /** pendência = falta coisa; conferir = pode estar certo, vale olhar */
  tipo: 'pendencia' | 'conferir';
  titulo: string;
  texto: string;
  n: number;
  aparelhos?: Array<{ id: string; dica: string | null }>;
  modelos?: Array<{ id: string; nome: string; aparelhos: number }>;
  clientes?: Array<{ clienteId: string; nome: string; modelos: string[] }>;
};
export type CadastroEmDia = { itens: ItemCadastro[]; pendencias: number };

export type RelatoriosInventario = {
  /** hoje (AAAA-MM-DD, Brasília) */
  hoje: string;
  /** a primeira movimentação guardada (AAAA-MM-DD), ou vazio */
  historicoDesde: string | null;
  aparelhos: AparelhoDoRelatorio[];
  clientes: ClienteDoRelatorio[];
  quemTem: QuemTemOQue;
  prateleira: Prateleira;
  valor: ValorDoParque;
  vaiEVolta: VaiEVolta;
  cadastro: CadastroEmDia;
};

// ---------- peças ----------

const porNome = (a: { nome: string }, b: { nome: string }) => a.nome.localeCompare(b.nome, 'pt-BR');
const ordemData = (a: { createdAt: string }, b: { createdAt: string }) => Date.parse(a.createdAt) - Date.parse(b.createdAt);
const soma = (xs: Array<number | null | undefined>) => xs.reduce<number>((a, x) => a + (x ?? 0), 0);

/**
 * O MAC ou o N/S que alguém escreveu na anotação, quando o aparelho não tem nenhum dos dois no
 * campo próprio (o caso dos aparelhos que entraram antes de existir o campo N/S). Devolve a
 * sugestão já limpa, ou vazio.
 *  - MAC: 12 hexadecimais, com ou sem separador (sem separador, precisa ter uma letra — senão um
 *    telefone de 12 dígitos viraria MAC);
 *  - N/S: depois de "N/S", "S/N", "SN", "NS", "série" ou "serial", um código com algum número;
 *  - o código do Nexus para aparelho sem MAC ("N001").
 * Sem "olhar para trás" na expressão: o Safari dos iPhones antigos não entende (ver as armadilhas).
 */
export function idNaAnotacao(nota: string | null | undefined): { tipo: 'mac' | 'serie'; valor: string } | null {
  if (!nota) return null;
  const comSeparador = /(?:^|[^0-9a-z])((?:[0-9a-f]{2}[:\-.]){5}[0-9a-f]{2})(?![0-9a-z])/i.exec(nota);
  if (comSeparador) return { tipo: 'mac', valor: macFormatado(comSeparador[1]!.replace(/[^0-9a-f]/gi, '').toUpperCase()) };
  const corrido = /(?:^|[^0-9a-z])([0-9a-f]{12})(?![0-9a-z])/i.exec(nota);
  if (corrido && /[a-f]/i.test(corrido[1]!)) return { tipo: 'mac', valor: macFormatado(corrido[1]!.toUpperCase()) };
  const serie = /(?:^|[^0-9a-z])(?:n\/s|s\/n|n\.s\.?|sn|ns|s[ée]rie|serial)\s*[:#º°.\-]?\s*([0-9a-z][0-9a-z\-\/]{2,39})/i.exec(nota);
  if (serie && /\d/.test(serie[1]!)) return { tipo: 'serie', valor: serie[1]!.toUpperCase() };
  const nexus = /(?:^|[^0-9a-z])(n\d{3,6})(?![0-9a-z])/i.exec(nota);
  if (nexus) return { tipo: 'serie', valor: nexus[1]!.toUpperCase() };
  return null;
}

/** Por que o cliente está fora da base (quando há mais de um motivo, o mais grave), ou vazio. Interno nunca está. */
export function clienteForaDaBase(c: Pick<ClienteDaBase, 'interno' | 'naLixeiraDesde' | 'arquivado' | 'produtosAtivos' | 'temEquipamentos'>): ForaDaBase | null {
  if (c.interno) return null;
  if (c.naLixeiraDesde) return 'lixeira';
  if (c.arquivado) return 'arquivado';
  if (c.produtosAtivos === 0) return 'sem_produto';
  if (!c.temEquipamentos) return 'sem_equipamentos';
  return null;
}

/** Um acontecimento na vida de um aparelho, tirado das movimentações dele. */
type Evento = {
  tipo: 'saida' | 'transferencia' | 'devolucao';
  movId: string;
  dia: string;
  /** de onde saiu (vazio = estoque) e para onde foi (vazio = estoque) */
  de: string | null;
  para: string | null;
  modalidade: string;
  /** na devolução: quantos dias ficou no cliente (quando se sabe quando chegou) */
  diasNoCliente: number | null;
  /** na devolução: voltou marcado como inativo */
  inativo: boolean;
};

/**
 * Refaz a vida do aparelho pelas movimentações dele, em ordem. Todo aparelho nasce no estoque.
 * Mover para o mesmo cliente (trocar a unidade ou a modalidade) não é chegada nova: o aparelho
 * está no cliente desde a primeira vez. Devolve os acontecimentos, onde ele terminou e desde quando.
 */
function vidaDoAparelho(a: AparelhoDaBase, movs: MovimentacaoDaBase[]) {
  const eventos: Evento[] = [];
  let onde: string | null = null;
  let chegou = diaEmBrasilia(a.createdAt);
  for (const mv of movs) {
    const dia = diaEmBrasilia(mv.createdAt);
    if (mv.modality === 'devolucao') {
      const de = onde ?? mv.fromClientId;
      eventos.push({ tipo: 'devolucao', movId: mv.id, dia, de, para: null, modalidade: mv.modality, diasNoCliente: onde ? Math.max(0, diasEntre(chegou, dia)) : null, inativo: mv.newCondition === 'inativo' });
      onde = null; chegou = dia;
      continue;
    }
    const para = mv.toClientId;
    if (!para || para === onde) continue;
    eventos.push({ tipo: onde ? 'transferencia' : 'saida', movId: mv.id, dia, de: onde, para, modalidade: mv.modality, diasNoCliente: null, inativo: false });
    onde = para; chegou = dia;
  }
  return { eventos, onde, chegou };
}

/** Desde quando o aparelho está onde está, mesmo se a história não bater com o cadastro. */
function desdeQuando(a: AparelhoDaBase, movs: MovimentacaoDaBase[], vida: ReturnType<typeof vidaDoAparelho>): string {
  if (vida.onde === a.clientId) return vida.chegou;
  // a história e o cadastro discordam (dado antigo, ou mexido fora das movimentações): vale a
  // última movimentação que trouxe o aparelho para onde ele está; sem ela, o dia do cadastro
  const ultima = [...movs].reverse().find((mv) => (a.clientId ? mv.toClientId === a.clientId : mv.modality === 'devolucao'));
  return ultima ? diaEmBrasilia(ultima.createdAt) : diaEmBrasilia(a.createdAt);
}

// ---------- a conta ----------

export function relatoriosInventario(base: BaseInventario): RelatoriosInventario {
  const hoje = diaEmBrasilia(base.agora);
  const modelos = new Map(base.modelos.map((m) => [m.id, m]));
  const clientes = new Map(base.clientes.map((c) => [c.id, c]));
  const nomeDoCliente = (id: string | null) => (id ? clientes.get(id)?.nome ?? 'cliente excluído' : 'Estoque');
  const nomeDoModelo = (id: string) => modelos.get(id)?.name ?? 'modelo excluído';

  // as movimentações de cada aparelho, em ordem
  const ordenadas = [...base.movimentacoes].sort(ordemData);
  const movsDe = new Map<string, MovimentacaoDaBase[]>();
  for (const mv of ordenadas) for (const id of mv.deviceIds) {
    const l = movsDe.get(id);
    if (l) l.push(mv); else movsDe.set(id, [mv]);
  }
  const historicoDesde = ordenadas.length ? diaEmBrasilia(ordenadas[0]!.createdAt) : null;

  const eventos: Array<Evento & { aparelhoId: string; modelId: string }> = [];
  const aparelhos: AparelhoDoRelatorio[] = base.aparelhos.map((a) => {
    const movs = movsDe.get(a.id) ?? [];
    const vida = vidaDoAparelho(a, movs);
    for (const e of vida.eventos) eventos.push({ ...e, aparelhoId: a.id, modelId: a.modelId });
    const desde = desdeQuando(a, movs, vida);
    const id = identificacaoAparelho(a);
    return {
      id: a.id, identificacao: id.texto, tipoId: id.tipo,
      modelId: a.modelId, modelo: nomeDoModelo(a.modelId),
      clienteId: a.clientId, cliente: a.clientId ? nomeDoCliente(a.clientId) : null, unidade: a.unit,
      modalidade: a.currentModality, condicao: a.condition,
      valorCents: a.valueCents ?? modelos.get(a.modelId)?.valueCents ?? null,
      ip: a.ip, desde, dias: Math.max(0, diasEntre(desde, hoje)),
    };
  });
  const daBase = new Map(base.aparelhos.map((a) => [a.id, a]));
  const vendido = (x: AparelhoDoRelatorio) => x.modalidade === 'venda';
  const nossos = aparelhos.filter((x) => !vendido(x));
  const foraDe = new Map<string, ForaDaBase | null>();
  for (const c of base.clientes) foraDe.set(c.id, clienteForaDaBase(c));

  // ---- Quem tem o quê
  const contaModelo = new Map<string, { comClientes: number; noEstoque: number }>();
  for (const x of nossos) {
    const c = contaModelo.get(x.modelId) ?? { comClientes: 0, noEstoque: 0 };
    if (x.clienteId) c.comClientes++; else c.noEstoque++;
    contaModelo.set(x.modelId, c);
  }
  const colunas = [...contaModelo.entries()]
    .map(([id, c]) => ({ id, nome: nomeDoModelo(id), ...c }))
    .sort((a, b) => b.comClientes + b.noEstoque - (a.comClientes + a.noEstoque) || porNome(a, b));
  const doCliente = new Map<string, AparelhoDoRelatorio[]>();
  for (const x of nossos) if (x.clienteId) {
    const l = doCliente.get(x.clienteId);
    if (l) l.push(x); else doCliente.set(x.clienteId, [x]);
  }
  const contarPorModelo = (xs: AparelhoDoRelatorio[]) => {
    const r: Record<string, number> = {};
    for (const x of xs) r[x.modelId] = (r[x.modelId] ?? 0) + 1;
    return r;
  };
  const linhasQuem: LinhaQuemTem[] = [...doCliente.entries()].map(([clienteId, xs]) => {
    const c = clientes.get(clienteId);
    return {
      clienteId, nome: nomeDoCliente(clienteId), interno: !!c?.interno,
      foraDaBase: foraDe.get(clienteId) ?? null,
      porModelo: contarPorModelo(xs), total: xs.length,
      comodato: xs.filter((x) => x.modalidade === 'comodato').length,
      locacao: xs.filter((x) => x.modalidade === 'locacao').length,
      inativos: xs.filter((x) => x.condicao === 'inativo').length,
      valorCents: soma(xs.map((x) => x.valorCents)),
      semValor: xs.filter((x) => x.valorCents == null).length,
      unidades: new Set(xs.map((x) => (x.unidade ?? 'Matriz').trim().toLowerCase())).size,
      ids: xs.map((x) => x.id),
    };
  }).sort((a, b) => b.total - a.total || porNome(a, b));
  const comClientes = nossos.filter((x) => x.clienteId);
  const noEstoque = nossos.filter((x) => !x.clienteId);
  const vendidos = aparelhos.filter(vendido);
  const quemTem: QuemTemOQue = {
    modelos: colunas,
    linhas: linhasQuem,
    totais: {
      porModelo: contarPorModelo(comClientes), total: comClientes.length,
      comodato: comClientes.filter((x) => x.modalidade === 'comodato').length,
      locacao: comClientes.filter((x) => x.modalidade === 'locacao').length,
      valorCents: soma(comClientes.map((x) => x.valorCents)),
    },
    estoque: { porModelo: contarPorModelo(noEstoque), total: noEstoque.length, ids: noEstoque.map((x) => x.id) },
    vendidos: { aparelhos: vendidos.length, clientes: new Set(vendidos.map((x) => x.clienteId)).size, ids: vendidos.map((x) => x.id) },
  };

  // ---- Na prateleira
  const inicioJanela = (() => {
    if (!historicoDesde) return null;
    const ultimos = somarDias(hoje, -(JANELA_RITMO_DIAS - 1));
    return historicoDesde > ultimos ? historicoDesde : ultimos;
  })();
  const janelaDias = inicioJanela ? diasEntre(inicioJanela, hoje) + 1 : 0;
  const ritmoConfiavel = janelaDias >= MINIMO_RITMO_DIAS;
  const saidasNaJanela = new Map<string, number>();
  for (const e of eventos) if (e.tipo === 'saida' && inicioJanela && e.dia >= inicioJanela && e.dia <= hoje) {
    saidasNaJanela.set(e.modelId, (saidasNaJanela.get(e.modelId) ?? 0) + 1);
  }
  const idsDoModelo = new Set([...noEstoque.map((x) => x.modelId), ...saidasNaJanela.keys()]);
  const ordemSituacao: SituacaoEstoque[] = ['acabou', 'pouco', 'parado', 'ok', 'sem_ritmo'];
  const modelosPrateleira: Prateleira['modelos'] = [...idsDoModelo].map((id) => {
    const xs = noEstoque.filter((x) => x.modelId === id);
    const ativos = xs.filter((x) => x.condicao !== 'inativo');
    const inativos = xs.filter((x) => x.condicao === 'inativo');
    const saidas = saidasNaJanela.get(id) ?? 0;
    const porSemana = ritmoConfiavel && saidas > 0 ? saidas / (janelaDias / 7) : null;
    const semanas = porSemana ? ativos.length / porSemana : null;
    // sem nenhum ativo: "acabou" se tem saída (mesmo com pouco histórico, é verdade); sem saída,
    // não há o que dizer — a coluna dos inativos fala por si
    const situacao: SituacaoEstoque = !ativos.length ? (saidas > 0 ? 'acabou' : 'ok')
      : !ritmoConfiavel ? 'sem_ritmo'
      : saidas === 0 ? 'parado'
      : semanas != null && semanas < SEMANAS_POUCO ? 'pouco'
      : 'ok';
    const idades = ativos.map((x) => x.dias);
    return {
      id, nome: nomeDoModelo(id), ativos: ativos.length, inativos: inativos.length,
      valorCents: soma(xs.map((x) => x.valorCents)), saidas, porSemana, semanas,
      idadeMediana: mediana(idades), maisAntigo: idades.length ? Math.max(...idades) : null,
      situacao, idsAtivos: ativos.map((x) => x.id), idsInativos: inativos.map((x) => x.id),
    };
  }).sort((a, b) => ordemSituacao.indexOf(a.situacao) - ordemSituacao.indexOf(b.situacao) || b.ativos + b.inativos - (a.ativos + a.inativos) || porNome(a, b));
  const ativosNoEstoque = noEstoque.filter((x) => x.condicao !== 'inativo');
  const inativosNoEstoque = noEstoque.filter((x) => x.condicao === 'inativo');
  const prateleira: Prateleira = {
    desde: inicioJanela, janelaDias, ritmoConfiavel,
    modelos: modelosPrateleira,
    faixas: FAIXAS_ESTOQUE.map((f, i) => {
      const de = i ? FAIXAS_ESTOQUE[i - 1]!.ate : 0;
      const ids = ativosNoEstoque.filter((x) => x.dias >= de && x.dias < f.ate).map((x) => x.id);
      return { id: f.id, rotulo: f.rotulo, n: ids.length, ids };
    }),
    totais: {
      ativos: ativosNoEstoque.length, inativos: inativosNoEstoque.length,
      valorCents: soma(ativosNoEstoque.map((x) => x.valorCents)), valorInativosCents: soma(inativosNoEstoque.map((x) => x.valorCents)),
      paradosHaMuito: ativosNoEstoque.filter((x) => x.dias > DIAS_PARADO).length,
    },
  };

  // ---- Quanto vale o parque
  const parteDe = (x: AparelhoDoRelatorio): ParteDoParque => {
    if (!x.clienteId) return x.condicao === 'inativo' ? 'estoque_inativo' : 'estoque';
    if (clientes.get(x.clienteId)?.interno) return 'interno';
    return x.modalidade === 'comodato' ? 'comodato' : x.modalidade === 'locacao' ? 'locacao' : 'outros';
  };
  const partes = (Object.keys(PARTES_DO_PARQUE) as ParteDoParque[]).map((id) => {
    const xs = nossos.filter((x) => parteDe(x) === id);
    return { id, rotulo: PARTES_DO_PARQUE[id], n: xs.length, valorCents: soma(xs.map((x) => x.valorCents)), ids: xs.map((x) => x.id) };
  });
  const totalParque = soma(partes.map((p) => p.valorCents));
  const valor: ValorDoParque = {
    totalCents: totalParque,
    aparelhos: nossos.length,
    partes,
    porModelo: colunas.map((m) => {
      const xs = nossos.filter((x) => x.modelId === m.id);
      return {
        id: m.id, nome: m.nome, valorDoModeloCents: modelos.get(m.id)?.valueCents ?? null, n: xs.length,
        valorCents: soma(xs.map((x) => x.valorCents)), semValor: xs.filter((x) => x.valorCents == null).length,
        proprio: xs.filter((x) => daBase.get(x.id)?.valueCents != null).length,
      };
    }).sort((a, b) => b.valorCents - a.valorCents || b.n - a.n || porNome(a, b)),
    semValor: nossos.filter((x) => x.valorCents == null).length,
    vendidos: { n: vendidos.length, valorCents: soma(vendidos.map((x) => x.valorCents)) },
  };

  // ---- Vai e volta
  const saidas = eventos.filter((e) => e.tipo === 'saida');
  const devolucoes = eventos.filter((e) => e.tipo === 'devolucao');
  const transferencias = eventos.filter((e) => e.tipo === 'transferencia');
  const modelosComVida = [...new Set(eventos.map((e) => e.modelId))];
  const unicos = (xs: string[]) => [...new Set(xs)];
  const porModeloVida: VaiEVolta['porModelo'] = modelosComVida.map((id) => {
    const dev = devolucoes.filter((e) => e.modelId === id);
    return {
      id, nome: nomeDoModelo(id),
      saidas: saidas.filter((e) => e.modelId === id).length,
      devolucoes: dev.length,
      inativos: dev.filter((e) => e.inativo).length,
      medianaDias: mediana(dev.map((e) => e.diasNoCliente).filter((d): d is number => d != null)),
      idsInativos: unicos(dev.filter((e) => e.inativo).map((e) => e.aparelhoId)),
      idsDevolvidos: unicos(dev.map((e) => e.aparelhoId)),
    };
  }).sort((a, b) => b.saidas + b.devolucoes - (a.saidas + a.devolucoes) || porNome(a, b));
  const clientesComVida = unicos(eventos.flatMap((e) => [e.de, e.para]).filter((x): x is string => !!x));
  const porClienteVida: VaiEVolta['porCliente'] = clientesComVida.map((clienteId) => {
    const dev = devolucoes.filter((e) => e.de === clienteId);
    return {
      clienteId, nome: nomeDoCliente(clienteId),
      recebeu: eventos.filter((e) => e.tipo !== 'devolucao' && e.para === clienteId).length,
      devolveu: dev.length,
      inativos: dev.filter((e) => e.inativo).length,
      ultimaDevolucao: dev.map((e) => e.dia).sort().pop() ?? null,
      idsDevolvidos: unicos(dev.map((e) => e.aparelhoId)),
    };
  }).filter((c) => c.recebeu || c.devolveu)
    .sort((a, b) => b.devolveu - a.devolveu || b.recebeu - a.recebeu || porNome(a, b));
  const porMovimentacao = new Map<string, typeof devolucoes>();
  for (const e of devolucoes) {
    const l = porMovimentacao.get(e.movId);
    if (l) l.push(e); else porMovimentacao.set(e.movId, [e]);
  }
  const ultimas: VaiEVolta['ultimas'] = [...porMovimentacao.entries()].map(([id, es]) => {
    const contagem = new Map<string, number>();
    for (const e of es) contagem.set(e.modelId, (contagem.get(e.modelId) ?? 0) + 1);
    const clienteId = es[0]!.de;
    return {
      id, dia: es[0]!.dia, clienteId, cliente: nomeDoCliente(clienteId), n: es.length,
      inativos: es.filter((e) => e.inativo).length,
      modelos: [...contagem.entries()].sort((a, b) => b[1] - a[1]).map(([m, n]) => `${n}× ${nomeDoModelo(m)}`).join(', '),
      ids: es.map((e) => e.aparelhoId),
    };
  }).sort((a, b) => b.dia.localeCompare(a.dia) || b.n - a.n).slice(0, 6);
  const vaiEVolta: VaiEVolta = {
    desde: historicoDesde,
    totais: { saidas: saidas.length, devolucoes: devolucoes.length, voltaramInativos: devolucoes.filter((e) => e.inativo).length, transferencias: transferencias.length },
    porModelo: porModeloVida, porCliente: porClienteVida, ultimas,
  };

  // ---- Cadastro em dia
  const cadastro = cadastroEmDia({ nossos, daBase, modelos, clientes, foraDe, nomeDoModelo });

  // ---- os clientes que as telas usam (quem tem ou já teve aparelho)
  const comAparelho = new Set(aparelhos.map((x) => x.clienteId).filter((x): x is string => !!x));
  const clientesDoRelatorio: ClienteDoRelatorio[] = base.clientes
    .filter((c) => comAparelho.has(c.id))
    .map((c) => ({ id: c.id, nome: c.nome, razaoSocial: c.razaoSocial, cnpj: c.cnpj, interno: c.interno, arquivado: c.arquivado, naLixeira: !!c.naLixeiraDesde, unidades: c.unidades }))
    .sort(porNome);

  return { hoje, historicoDesde, aparelhos, clientes: clientesDoRelatorio, quemTem, prateleira, valor, vaiEVolta, cadastro };
}

/** O que falta preencher. Só olha o que é nosso (os vendidos ficam de fora). */
function cadastroEmDia({ nossos, daBase, modelos, clientes, foraDe, nomeDoModelo }: {
  nossos: AparelhoDoRelatorio[];
  daBase: Map<string, AparelhoDaBase>;
  modelos: Map<string, ModeloDaBase>;
  clientes: Map<string, ClienteDaBase>;
  foraDe: Map<string, ForaDaBase | null>;
  nomeDoModelo: (id: string) => string;
}): CadastroEmDia {
  const itens: ItemCadastro[] = [];
  const semId = nossos.filter((x) => x.tipoId === 'nenhum');

  // 1. o MAC ou o N/S está escrito na anotação, e não no campo
  const naAnotacao = semId
    .map((x) => ({ x, achado: idNaAnotacao(daBase.get(x.id)?.note) }))
    .filter((r): r is { x: AparelhoDoRelatorio; achado: NonNullable<ReturnType<typeof idNaAnotacao>> } => !!r.achado);
  itens.push({
    id: 'id_na_anotacao', tipo: 'pendencia', titulo: 'MAC ou N/S escrito na anotação',
    texto: 'O código está na anotação, e não no campo próprio: a busca e a movimentação por lista colada não acham o aparelho por ele.',
    n: naAnotacao.length,
    aparelhos: naAnotacao.map(({ x, achado }) => ({ id: x.id, dica: `${achado.tipo === 'mac' ? 'MAC' : 'N/S'} na anotação: ${achado.valor}` })),
  });

  // 2. sem MAC e sem N/S, num modelo em que os outros têm (o headset, que nunca tem, não entra)
  const jaListados = new Set(naAnotacao.map((r) => r.x.id));
  const identificadosPorModelo = new Map<string, { com: number; total: number }>();
  for (const x of nossos) {
    const c = identificadosPorModelo.get(x.modelId) ?? { com: 0, total: 0 };
    c.total++; if (x.tipoId !== 'nenhum') c.com++;
    identificadosPorModelo.set(x.modelId, c);
  }
  const costumaTer = (modelId: string) => { const c = identificadosPorModelo.get(modelId); return !!c && c.com * 2 >= c.total; };
  const semIdentificacao = semId.filter((x) => !jaListados.has(x.id) && costumaTer(x.modelId));
  itens.push({
    id: 'sem_identificacao', tipo: 'pendencia', titulo: 'Sem MAC e sem N/S',
    texto: 'Os outros aparelhos destes modelos têm MAC ou N/S. Sem ele, o aparelho não se acha pela etiqueta.',
    n: semIdentificacao.length,
    aparelhos: semIdentificacao.map((x) => ({ id: x.id, dica: null })),
  });

  // 3. modelo sem valor: os aparelhos dele (sem valor próprio) não somam em lugar nenhum
  const semValor = new Map<string, number>();
  for (const x of nossos) if (x.valorCents == null) semValor.set(x.modelId, (semValor.get(x.modelId) ?? 0) + 1);
  itens.push({
    id: 'modelo_sem_valor', tipo: 'pendencia', titulo: 'Modelo sem valor',
    texto: 'Os aparelhos destes modelos não entram no valor locado, no valor do parque nem na ficha do cliente.',
    n: semValor.size,
    modelos: [...semValor.entries()].map(([id, n]) => ({ id, nome: nomeDoModelo(id), aparelhos: n })).sort((a, b) => b.aparelhos - a.aparelhos || porNome(a, b)),
  });

  // 4 e 5. o "como configurar" do cliente: login padrão de cada modelo com MAC, e a rede padrão.
  // Só os clientes na base (quem saiu não vai mais configurar aparelho) e fora os internos.
  const modelosDeRede = new Set(nossos.filter((x) => x.tipoId === 'mac').map((x) => x.modelId));
  const porCliente = new Map<string, AparelhoDoRelatorio[]>();
  for (const x of nossos) if (x.clienteId) {
    const l = porCliente.get(x.clienteId);
    if (l) l.push(x); else porCliente.set(x.clienteId, [x]);
  }
  const semLogin: NonNullable<ItemCadastro['clientes']> = [];
  const semRede: NonNullable<ItemCadastro['clientes']> = [];
  for (const [clienteId, xs] of porCliente) {
    const c = clientes.get(clienteId);
    if (!c || c.interno || foraDe.get(clienteId)) continue;
    const deRede = [...new Set(xs.filter((x) => modelosDeRede.has(x.modelId)).map((x) => x.modelId))];
    const faltam = deRede.filter((m) => !c.modelosComLogin.includes(m));
    if (faltam.length) semLogin.push({ clienteId, nome: c.nome, modelos: faltam.map(nomeDoModelo).sort((a, b) => a.localeCompare(b, 'pt-BR')) });
    if (deRede.length && !c.temRedePadrao) semRede.push({ clienteId, nome: c.nome, modelos: deRede.map(nomeDoModelo).sort((a, b) => a.localeCompare(b, 'pt-BR')) });
  }
  itens.push({
    id: 'sem_login', tipo: 'pendencia', titulo: 'Cliente sem o login padrão do modelo',
    texto: 'Na ficha do cliente, aba Acessos: o login e a senha com que os aparelhos daquele modelo entram.',
    n: semLogin.length, clientes: semLogin.sort(porNome),
  });
  itens.push({
    id: 'sem_rede', tipo: 'pendencia', titulo: 'Cliente sem a rede padrão',
    texto: 'Na ficha do cliente, aba Acessos: o IP, a máscara, o roteador e o DNS que se digitam nos telefones.',
    n: semRede.length, clientes: semRede.sort(porNome),
  });

  // 6. valor próprio diferente do modelo: pode ser de propósito, mas vale olhar
  const proprio = nossos.filter((x) => {
    const p = daBase.get(x.id)?.valueCents;
    const m = modelos.get(x.modelId)?.valueCents;
    return p != null && m != null && p !== m;
  });
  itens.push({
    id: 'valor_proprio', tipo: 'conferir', titulo: 'Valor diferente do modelo',
    texto: 'Estes aparelhos têm valor próprio. Se foi engano, "Usar este valor em todos" no modelo iguala.',
    n: proprio.length,
    aparelhos: proprio.map((x) => ({ id: x.id, dica: `vale ${reais(daBase.get(x.id)!.valueCents)}; o modelo, ${reais(modelos.get(x.modelId)!.valueCents)}` })),
  });

  // 7. modelo sem foto: ajuda a reconhecer o aparelho na prateleira
  const semFoto = [...new Set(nossos.map((x) => x.modelId))].filter((id) => !modelos.get(id)?.temFoto);
  itens.push({
    id: 'modelo_sem_foto', tipo: 'conferir', titulo: 'Modelo sem foto',
    texto: 'A foto ajuda a reconhecer o aparelho no estoque e na ficha.',
    n: semFoto.length,
    modelos: semFoto.map((id) => ({ id, nome: nomeDoModelo(id), aparelhos: nossos.filter((x) => x.modelId === id).length })).sort((a, b) => b.aparelhos - a.aparelhos || porNome(a, b)),
  });

  return { itens, pendencias: soma(itens.filter((i) => i.tipo === 'pendencia').map((i) => i.n)) };
}

// ---------- a relação de um cliente (para imprimir) ----------

export type RelacaoDoCliente = {
  cliente: ClienteDoRelatorio;
  /** as unidades com aparelho nosso, a Matriz primeiro; dentro, por modelo e identificação */
  unidades: Array<{ nome: string; endereco: string | null; aparelhos: AparelhoDoRelatorio[] }>;
  porModelo: Array<{ modelId: string; nome: string; n: number; valorDeCadaCents: number | null; valorCents: number; semValor: number }>;
  totais: { aparelhos: number; comodato: number; locacao: number; inativos: number; valorCents: number; semValor: number };
  /** os que o cliente comprou (venda): são dele, listados à parte */
  vendidos: AparelhoDoRelatorio[];
};

/** A relação de equipamentos de um cliente, montada do mesmo relatório (mesma conta da tela). */
export function relacaoDoCliente(rel: Pick<RelatoriosInventario, 'aparelhos' | 'clientes'>, clienteId: string): RelacaoDoCliente | null {
  const cliente = rel.clientes.find((c) => c.id === clienteId);
  if (!cliente) return null;
  const dele = rel.aparelhos.filter((x) => x.clienteId === clienteId);
  const nossos = dele.filter((x) => x.modalidade !== 'venda');
  const ordem = (a: AparelhoDoRelatorio, b: AparelhoDoRelatorio) => a.modelo.localeCompare(b.modelo, 'pt-BR') || a.identificacao.localeCompare(b.identificacao, 'pt-BR');
  const principal = cliente.unidades.find((u) => u.principal)?.nome ?? 'Matriz';
  const chave = (u: string | null) => (u ?? principal).trim().toLowerCase();
  const grupos = new Map<string, AparelhoDoRelatorio[]>();
  for (const x of nossos) {
    const l = grupos.get(chave(x.unidade));
    if (l) l.push(x); else grupos.set(chave(x.unidade), [x]);
  }
  const unidades = [...grupos.entries()].map(([k, xs]) => {
    const cadastrada = cliente.unidades.find((u) => u.nome.trim().toLowerCase() === k);
    return { nome: cadastrada?.nome ?? xs[0]!.unidade ?? principal, endereco: cadastrada?.endereco ?? null, principal: k === principal.trim().toLowerCase(), aparelhos: xs.sort(ordem) };
  }).sort((a, b) => Number(b.principal) - Number(a.principal) || a.nome.localeCompare(b.nome, 'pt-BR'))
    .map(({ principal: _p, ...u }) => u);
  const modelosDele = new Map<string, AparelhoDoRelatorio[]>();
  for (const x of nossos) {
    const l = modelosDele.get(x.modelId);
    if (l) l.push(x); else modelosDele.set(x.modelId, [x]);
  }
  const porModelo = [...modelosDele.entries()].map(([modelId, xs]) => {
    const valores = [...new Set(xs.map((x) => x.valorCents))];
    return {
      modelId, nome: xs[0]!.modelo, n: xs.length,
      // "valor de cada" só quando todos valem o mesmo; senão a tabela mostra o total
      valorDeCadaCents: valores.length === 1 ? valores[0]! : null,
      valorCents: soma(xs.map((x) => x.valorCents)), semValor: xs.filter((x) => x.valorCents == null).length,
    };
  }).sort((a, b) => b.n - a.n || a.nome.localeCompare(b.nome, 'pt-BR'));
  return {
    cliente, unidades, porModelo,
    totais: {
      aparelhos: nossos.length,
      comodato: nossos.filter((x) => x.modalidade === 'comodato').length,
      locacao: nossos.filter((x) => x.modalidade === 'locacao').length,
      inativos: nossos.filter((x) => x.condicao === 'inativo').length,
      valorCents: soma(nossos.map((x) => x.valorCents)),
      semValor: nossos.filter((x) => x.valorCents == null).length,
    },
    vendidos: dele.filter((x) => x.modalidade === 'venda').sort(ordem),
  };
}
