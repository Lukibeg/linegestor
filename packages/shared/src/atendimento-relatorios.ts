/**
 * OS RELATÓRIOS DOS PAINÉIS DE CHAMADOS (Patch 2.0.5, decisão 0055): o módulo novo de relatórios, sobre os
 * chamados do próprio Gestor. Os do Helena ficam no **Legado do Helena** (os 20 relatórios do 1.7, em
 * `relatorios.ts`, sobre a cópia do LineChat): os assuntos mudaram por completo, e quase tudo que os
 * relatórios medem mudou de régua (o tempo em horas úteis, o Resolvido antes do Fechado, o nível como
 * etapa com o motivo de cada subida). Juntar os dois daria números com cara de comparáveis que não são.
 *
 * Como os outros relatórios do sistema, a conta é escrita uma vez só e roda igual no servidor e na prévia:
 * os dois montam a base (`ChamadoParaRelatorios`, um por chamado do painel) e o contexto, e chamam
 * `relatoriosDoPainel`. Cada peça que dá para clicar leva os ids dos chamados por trás dela, e a resposta
 * leva a linha curta de cada chamado citado (`chamados`): a janela que abre mostra a mesma conta do número.
 *
 * Os cuidados que valem para todos:
 *  - **tempo é mediana, não média** (um chamado esquecido 40 dias esconderia o normal); "9 em 10" é o
 *    percentil 90;
 *  - **tempo é em horas úteis**, pelo horário de atendimento e os feriados de Painéis › Ajustes › Prazos
 *    (o mesmo relógio dos prazos). Um "dia útil" é um dia de atendimento (10 horas, no horário de fábrica);
 *  - **o problema (ITIL) não é chamado de cliente**: fica fora das contas de volume e tempo e tem o
 *    relatório dele (Os problemas);
 *  - **dia e hora são os de Brasília**, como em todo o sistema.
 */
import { z } from 'zod';
import { diasEntre, somarDias } from './chamados.js';
import { diaDaSemana, inicioDaSemana, mediana, mesCurto, nomeDoMes, percentil, somarMeses } from './relatorios.js';
import {
  GRAVIDADES, NOME_GRAVIDADE, NOME_PRIORIDADE, PRIORIDADES,
  dentroDoHorario, diaLocal, estadoDosPrazos, horaLocal, minutosUteisEntre,
  type AjustesPrazos, type Alcance, type Calendario, type Espera, type EstadoPrazo, type Gravidade, type Prioridade,
} from './atendimento-prazos.js';
import { NOME_DO_NIVEL, type Nivel, type Origem, type SituacaoDoChamado, type TipoChamado, type TipoEtapa, type ValoresDosCampos } from './atendimento.js';
import { periodoDeComparacao } from './vendas.js';
import { paraBusca } from './formatos.js';

// =====================================================================
//  O CATÁLOGO: os 25 relatórios, cada um numa aba
// =====================================================================

export const ABAS_DOS_RELATORIOS = ['tempo', 'volume', 'assuntos', 'clientes', 'equipe', 'mes'] as const;
export type AbaDosRelatorios = (typeof ABAS_DOS_RELATORIOS)[number];
export const NOME_DA_ABA: Record<AbaDosRelatorios, string> = { tempo: 'Tempo', volume: 'Volume', assuntos: 'Assuntos', clientes: 'Clientes', equipe: 'Equipe', mes: 'Mês' };

/** O que o relatório precisa que o painel use (sem isso, ele não aparece para aquele painel). */
export type PrecisaDoPainel = 'prazo' | 'assunto' | 'gravidade' | 'niveis' | 'operadoras';
/** Por que o relatório não vale para o painel (o Organizar mostra). */
export const NAO_VALE_PORQUE: Record<PrecisaDoPainel, string> = {
  prazo: 'Não vale para este painel: ele não conta prazo.',
  assunto: 'Não vale para este painel: ele não usa o assunto (Painéis › Ajustes › Campos).',
  gravidade: 'Não vale para este painel: ele não usa a gravidade e o assunto (Painéis › Ajustes › Campos).',
  niveis: 'Não vale para este painel: ele não tem etapa de nível (N1, N2, N3, DEV).',
  operadoras: 'Não vale para este painel: ele não usa a operadora (Painéis › Ajustes › Campos).',
};
export type ItemDoCatalogo = {
  id: string; aba: AbaDosRelatorios; titulo: string; pergunta: string;
  /** metade da largura ou a largura toda (na tela larga) */
  largura: 'metade' | 'inteira';
  /** o que o Helena não deixava fazer (a marca "novo" do Organizar) */
  novo?: boolean;
  precisa?: PrecisaDoPainel;
};

export const CATALOGO_DOS_RELATORIOS: readonly ItemDoCatalogo[] = [
  { id: 'prazo', aba: 'tempo', titulo: 'Prazo cumprido', pergunta: 'Os chamados são respondidos e resolvidos dentro do prazo?', largura: 'metade', precisa: 'prazo' },
  { id: 'relogio', aba: 'tempo', titulo: 'Relógio do chamado', pergunta: 'Quanto tempo um chamado leva, do aberto ao resolvido?', largura: 'metade' },
  { id: 'resposta', aba: 'tempo', titulo: 'Primeira resposta', pergunta: 'Quanto o cliente espera até alguém da equipe pegar o chamado?', largura: 'metade' },
  { id: 'escada', aba: 'tempo', titulo: 'A escada N1 → N2 → N3 → DEV', pergunta: 'Quanto o N1 resolve sozinho, e quanto sobe?', largura: 'metade', precisa: 'niveis' },
  { id: 'empaca', aba: 'tempo', titulo: 'Onde o chamado empaca', pergunta: 'Em que etapa o chamado fica mais tempo parado?', largura: 'metade' },
  { id: 'prioridade', aba: 'tempo', titulo: 'A prioridade faz diferença?', pergunta: 'Os mais urgentes andam mais rápido?', largura: 'metade' },
  { id: 'operadora', aba: 'tempo', titulo: 'Esperando a operadora', pergunta: 'Quanto do tempo dos chamados é espera pela operadora?', largura: 'metade', novo: true, precisa: 'operadoras' },
  { id: 'fila', aba: 'volume', titulo: 'Entrada × saída', pergunta: 'A fila está crescendo ou diminuindo?', largura: 'metade' },
  { id: 'idade', aba: 'volume', titulo: 'Idade da fila', pergunta: 'Há quanto tempo estão abertos os que ainda não foram resolvidos?', largura: 'metade' },
  { id: 'calor', aba: 'volume', titulo: 'Mapa de calor da semana', pergunta: 'Em que dia da semana e hora os chamados chegam?', largura: 'inteira' },
  { id: 'curva', aba: 'volume', titulo: 'Dias fora da curva', pergunta: 'Em que dias chegou muito mais chamado que o normal?', largura: 'metade' },
  { id: 'previsao', aba: 'volume', titulo: 'Previsão da semana', pergunta: 'Quantos chamados devem chegar na próxima semana?', largura: 'metade' },
  { id: 'arvore', aba: 'assuntos', titulo: 'Os assuntos', pergunta: 'De que são os chamados que chegaram?', largura: 'inteira', novo: true, precisa: 'assunto' },
  { id: 'sobe', aba: 'assuntos', titulo: 'Sobe e desce dos assuntos', pergunta: 'O que está aumentando, comparado com o período anterior?', largura: 'metade', precisa: 'assunto' },
  { id: 'pareto', aba: 'assuntos', titulo: 'Os poucos que pesam muito', pergunta: 'Poucos assuntos (ou clientes) fazem a maior parte dos chamados?', largura: 'metade' },
  { id: 'gravidade', aba: 'assuntos', titulo: 'Onde está a gravidade', pergunta: 'Em que assuntos o cliente fica parado, e quanto é só pedido?', largura: 'inteira', novo: true, precisa: 'gravidade' },
  { id: 'problemas', aba: 'assuntos', titulo: 'Os problemas', pergunta: 'Que problemas estão abertos, e quantos incidentes cada um junta?', largura: 'metade', novo: true },
  { id: 'raiox', aba: 'clientes', titulo: 'Raio-X do cliente', pergunta: 'Como está o suporte de um cliente, num lugar só?', largura: 'inteira' },
  { id: 'tamanho', aba: 'clientes', titulo: 'Chamados pelo tamanho do cliente', pergunta: 'Quem abre muito chamado para o tamanho que tem?', largura: 'inteira' },
  { id: 'voltou', aba: 'clientes', titulo: 'Voltou com o mesmo problema', pergunta: 'Que cliente abriu o mesmo assunto de novo em 30 dias?', largura: 'inteira' },
  { id: 'falha', aba: 'clientes', titulo: 'De quem é a falha?', pergunta: 'Quanto é falha nossa, do cliente, da operadora?', largura: 'metade' },
  { id: 'equipe', aba: 'equipe', titulo: 'Quadro da equipe', pergunta: 'Como está a carga de cada pessoa agora?', largura: 'inteira' },
  { id: 'tempogasto', aba: 'equipe', titulo: 'Tempo gasto', pergunta: 'Onde vai o tempo lançado nos chamados?', largura: 'inteira', novo: true },
  { id: 'preenchido', aba: 'equipe', titulo: 'Chamado bem preenchido', pergunta: 'Os chamados resolvidos ficam completos?', largura: 'inteira' },
  { id: 'fechamento', aba: 'mes', titulo: 'Fechamento do mês', pergunta: 'Como foi o mês, comparado com o anterior?', largura: 'inteira' },
];
export const ITEM_DO_CATALOGO: ReadonlyMap<string, ItemDoCatalogo> = new Map(CATALOGO_DOS_RELATORIOS.map((r) => [r.id, r]));

// =====================================================================
//  A ARRUMAÇÃO (o Organizar: a mesma para a equipe toda, por painel)
// =====================================================================

/** O que fica guardado de cada painel (Ajustes, `atendimento-relatorios`): a ordem, os escondidos, os favoritos e o campo da falha. */
export const ArrumacaoDosRelatoriosSchema = z.object({
  ordem: z.array(z.string().max(40)).max(80).default([]),
  ocultos: z.array(z.string().max(40)).max(80).default([]),
  favoritos: z.array(z.string().max(40)).max(80).default([]),
  /** o campo de lista do painel que diz de quem é a falha (nulo = o Gestor escolhe pelo nome) */
  campoDaFalha: z.string().max(100).nullable().default(null),
});
export type ArrumacaoDosRelatorios = z.infer<typeof ArrumacaoDosRelatoriosSchema>;

/** A arrumação como a tela lê: com quem mexeu por último e os campos de lista do painel (de onde sai a falha). */
export type ArrumacaoDosRelatoriosLida = ArrumacaoDosRelatorios & {
  atualizadoEm: string | null; atualizadoPor: string | null;
  campos: Array<{ id: string; nome: string; ativo: boolean }>;
};

/**
 * A arrumação guardada passada a limpo: só ids do catálogo, sem repetir, e o que veio depois (um relatório
 * novo) no fim da sua aba — quem já tinha arrumado não perde a arrumação quando um relatório entra.
 */
export function arrumacaoCompleta(guardada: Partial<ArrumacaoDosRelatorios> | null | undefined): ArrumacaoDosRelatorios {
  const validos = (xs: readonly string[] | undefined) => [...new Set((xs ?? []).filter((id) => ITEM_DO_CATALOGO.has(id)))];
  const ordem = validos(guardada?.ordem);
  for (const r of CATALOGO_DOS_RELATORIOS) if (!ordem.includes(r.id)) ordem.push(r.id);
  return { ordem, ocultos: validos(guardada?.ocultos), favoritos: validos(guardada?.favoritos), campoDaFalha: guardada?.campoDaFalha ?? null };
}

/** Os relatórios de uma aba, na ordem da equipe. */
export function relatoriosDaAba(aba: AbaDosRelatorios, arrumacao: ArrumacaoDosRelatorios): ItemDoCatalogo[] {
  return arrumacao.ordem.map((id) => ITEM_DO_CATALOGO.get(id)!).filter((r) => r && r.aba === aba);
}

// =====================================================================
//  O QUE ENTRA
// =====================================================================

/** Uma passagem do chamado por uma etapa (da trajetória). `ate` nulo = ainda está nela. */
export type PassagemParaRelatorio = { etapaId: string; desde: string; ate: string | null };
/** Uma mudança de nível: o escalonamento (sobe) ou a volta (desce), com o motivo. */
export type SubidaParaRelatorio = { em: string; de: Nivel | null; para: Nivel | null; sentido: 'sobe' | 'desce'; motivo: string | null; porId: string | null };
/** Um caso aberto na operadora (o protocolo da ficha). */
export type CasoParaRelatorio = { operadora: string; abertoEm: string; prometidoPara: string | null; fechadoEm: string | null };
/** Um lançamento de tempo gasto (o dia é o de Brasília). */
export type TempoParaRelatorio = { minutos: number; dia: string; pessoaId: string | null };

/** Um chamado do painel, como os relatórios precisam (o servidor e a prévia montam igual). */
export type ChamadoParaRelatorios = {
  id: string; codigo: string; titulo: string; tipoChamado: TipoChamado;
  etapaId: string; situacao: SituacaoDoChamado;
  criadoEm: string; respondidoEm: string | null; resolvidoEm: string | null; fechadoEm: string | null; ultimaAtividadeEm: string;
  responsavelId: string | null; clienteId: string | null; assuntoId: string | null;
  tipo: string | null; gravidade: Gravidade | null; alcance: Alcance | null; prioridade: Prioridade | null;
  /** a prioridade foi trocada da sugerida (com o motivo) */
  prioridadeTrocada: boolean;
  produtos: string[]; operadoras: string[]; etiquetas: string[]; campos: ValoresDosCampos;
  temSolucao: boolean; temCausa: boolean;
  esperas: Espera[];
  passagens: PassagemParaRelatorio[];
  subidas: SubidaParaRelatorio[];
  reaberto: number; origem: Origem;
  /** o problema de que é incidente */
  problemaId: string | null;
  /** os chamados que este "repete" (a ligação feita à mão) */
  repete: string[];
  casos: CasoParaRelatorio[];
  tempos: TempoParaRelatorio[];
};

export type EtapaParaRelatorio = { id: string; nome: string; tipo: TipoEtapa; nivel: Nivel | null; ordem: number; ativa: boolean };
export type AssuntoParaRelatorio = { id: string; paiId: string | null; nome: string; ordem: number; ativo: boolean };
/** Um campo de lista do painel; o chamado guarda o id da opção (a que saiu continua no chamado que a tem). */
export type CampoParaRelatorio = { id: string; nome: string; opcoes: Array<{ id: string; nome: string }>; ativo: boolean };
export type ClienteParaRelatorio = { nome: string; dids: number; aparelhos: number; produtos: string[] };

export type ContextoDosRelatorios = {
  painel: { id: string; nome: string; sigla: string; contaPrazo: boolean; usa: { assunto: boolean; tipo: boolean; gravidade: boolean; produtos: boolean; operadoras: boolean } };
  /** todas as etapas do painel, inclusive as que saíram (o chamado que passou por uma delas continua aqui) */
  etapas: EtapaParaRelatorio[];
  assuntos: AssuntoParaRelatorio[];
  /** os campos de lista do painel (o "De quem é a falha?" usa um deles) */
  campos: CampoParaRelatorio[];
  pessoas: ReadonlyMap<string, string>;
  clientes: ReadonlyMap<string, ClienteParaRelatorio>;
  produtos: ReadonlyMap<string, string>;
  operadoras: ReadonlyMap<string, string>;
  prazos: AjustesPrazos;
  /** a arrumação guardada (só o campo da falha importa para a conta) */
  campoDaFalha: string | null;
};

// =====================================================================
//  OS FILTROS
// =====================================================================

const Dia = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use o dia no formato AAAA-MM-DD');
/** "Separar por" do Relógio. */
export const SEPARAR_O_RELOGIO = ['assunto1', 'assunto2', 'prioridade', 'tipo', 'gravidade', 'responsavel', 'cliente', 'produto', 'operadora'] as const;
export type SepararORelogio = (typeof SEPARAR_O_RELOGIO)[number];
export const NOME_DO_SEPARAR: Record<SepararORelogio, string> = {
  assunto1: 'Assunto (1º nível)', assunto2: 'Assunto (2º nível)', prioridade: 'Prioridade', tipo: 'Tipo', gravidade: 'Gravidade',
  responsavel: 'Responsável', cliente: 'Cliente', produto: 'Produto', operadora: 'Operadora',
};
/** Os poucos que pesam muito: por quê. */
export const PARETO_DO_PAINEL = ['assunto', 'assunto1', 'cliente', 'produto', 'operadora', 'tipo'] as const;
export type ParetoDoPainel = (typeof PARETO_DO_PAINEL)[number];
export const NOME_DO_PARETO: Record<ParetoDoPainel, string> = {
  assunto: 'Assunto (inteiro)', assunto1: 'Assunto (1º nível)', cliente: 'Cliente', produto: 'Produto', operadora: 'Operadora', tipo: 'Tipo',
};
export const RESPONSAVEL_NINGUEM = 'ninguem';

/** O período, os filtros de valor e as escolhas de cada relatório — tudo no endereço da tela. */
export const FiltroDosRelatoriosSchema = z.object({
  painel: z.string().trim().min(1, 'Escolha o painel').max(100),
  de: Dia.optional(),
  ate: Dia.optional(),
  assunto: z.string().trim().max(100).optional(),
  tipo: z.string().trim().max(200).optional(),
  gravidade: z.enum(GRAVIDADES).optional(),
  prioridade: z.enum([...PRIORIDADES, 'sem']).optional(),
  nivel: z.coerce.number().int().min(1).max(4).optional(),
  responsavel: z.string().trim().max(100).optional(),
  cliente: z.string().trim().max(100).optional(),
  produto: z.string().trim().max(100).optional(),
  operadora: z.string().trim().max(100).optional(),
  etiqueta: z.string().trim().max(100).optional(),
  /** um campo do painel: "<id do campo>:<opção>" */
  campo: z.string().trim().max(400).optional(),
  separar: z.enum(SEPARAR_O_RELOGIO).optional(),
  pareto: z.enum(PARETO_DO_PAINEL).optional(),
  nivelSobe: z.coerce.number().int().min(1).max(3).optional(),
  mes: z.string().regex(/^\d{4}-\d{2}$/, 'Use o mês no formato AAAA-MM').optional(),
  raiox: z.string().trim().max(100).optional(),
}).refine((f) => !f.de || !f.ate || f.ate >= f.de, 'O fim do período vem depois do começo.')
  .refine((f) => !f.de || !f.ate || diasEntre(f.de, f.ate) <= 1830, 'O período vai até 5 anos.');
export type FiltroDosRelatorios = z.infer<typeof FiltroDosRelatoriosSchema>;

/** Os filtros de valor (o que recorta os chamados; o período e as escolhas dos relatórios não). */
export const FILTROS_DE_VALOR = ['assunto', 'tipo', 'gravidade', 'prioridade', 'nivel', 'responsavel', 'cliente', 'produto', 'operadora', 'etiqueta', 'campo'] as const;

/** Os atalhos do período (o padrão é "30 dias", como nos relatórios do 1.7). */
export function atalhosDosRelatorios(agora: Date, primeiroDia: string | null): Array<{ id: string; nome: string; de: string; ate: string }> {
  const hoje = diaLocal(agora);
  const mes = hoje.slice(0, 7);
  return [
    { id: '7', nome: '7 dias', de: somarDias(hoje, -6), ate: hoje },
    { id: '30', nome: '30 dias', de: somarDias(hoje, -29), ate: hoje },
    { id: 'mes', nome: 'Este mês', de: `${mes}-01`, ate: hoje },
    { id: 'anterior', nome: 'Mês passado', de: `${somarMeses(mes, -1)}-01`, ate: fimDoMes(somarMeses(mes, -1)) },
    { id: '90', nome: '90 dias', de: somarDias(hoje, -89), ate: hoje },
    { id: '12m', nome: '12 meses', de: `${somarMeses(mes, -11)}-01`, ate: hoje },
    { id: 'tudo', nome: 'Tudo', de: primeiroDia && primeiroDia < hoje ? primeiroDia : hoje, ate: hoje },
  ];
}

/** O período pedido, ou os 30 dias até hoje; "de" depois de "até" vira um dia só. */
export function periodoDosRelatorios(f: Pick<FiltroDosRelatorios, 'de' | 'ate'>, agora: Date): { de: string; ate: string } {
  const hoje = diaLocal(agora);
  const ate = f.ate ?? hoje;
  const de = f.de ?? somarDias(ate, -29);
  return de <= ate ? { de, ate } : { de: ate, ate };
}

// =====================================================================
//  O QUE SAI
// =====================================================================

/** A linha curta de um chamado citado por alguma peça (a janela que abre ao clicar). */
export type ChamadoDoRelatorio = {
  id: string; codigo: string; titulo: string; situacao: SituacaoDoChamado; etapa: string; cliente: string | null; responsavel: string | null;
  prioridade: Prioridade | null; assunto: string | null; criadoEm: string; resolvidoEm: string | null;
};
/** Uma peça clicável: o número e os chamados por trás dele. */
export type Peca = { n: number; ids: string[] };

export type LinhaDoPrazo = { prioridade: Prioridade | null; nome: string; resolvidos: number; resposta: { comPrazo: number; noPrazo: number; ids: string[]; foraIds: string[] }; solucao: { comPrazo: number; noPrazo: number; ids: string[]; foraIds: string[] }; limites: { resposta: number; solucao: number; uteis: boolean } | null };
export type PrazoDoPainel = {
  contaPrazo: boolean;
  resolvidos: number;
  resposta: { comPrazo: number; noPrazo: number; pct: number | null; antes: number | null; foraIds: string[] };
  solucao: { comPrazo: number; noPrazo: number; pct: number | null; antes: number | null; foraIds: string[] };
  vencidosAgora: Peca; pertoAgora: Peca;
  semPrioridade: number;
  porPrioridade: LinhaDoPrazo[];
};

export type FaixaDeTempo = { id: string; rotulo: string; n: number; ids: string[] };
export type LinhaSeparadaDoRelogio = { valor: string; rotulo: string; n: number; mediana: number; p90: number; ids: string[] };
export type RelogioDoPainel = {
  resolvidos: number; mediana: number | null; p90: number | null;
  ate4h: number;
  antes: { resolvidos: number; mediana: number | null; p90: number | null };
  faixas: FaixaDeTempo[];
  separar: SepararORelogio; separado: LinhaSeparadaDoRelogio[];
};

export type RespostaDoPainel = {
  respondidos: number; mediana: number | null; ate1h: number;
  antes: { respondidos: number; mediana: number | null; ate1h: number };
  faixas: FaixaDeTempo[];
  esperando: Peca & { maisAntigo: { id: string; codigo: string; minutos: number } | null };
  foraDoHorario: number;
};

export type DegrauDaEscada = { nivel: Nivel; nome: string; entram: number; resolvem: number; sobem: number; pct: number; mediana: number | null; ids: string[]; idsSobem: string[] };
export type EscadaDoPainel = {
  resolvidos: number; degraus: DegrauDaEscada[];
  /** resolvidos sem passar por nenhuma etapa de nível (contam no N1) */
  semNivel: number;
  voltas: Peca;
  motivos: Array<{ id: string; codigo: string; de: string; para: string; motivo: string | null; em: string; quem: string | null }>;
  antesN1: number | null;
};

export type EtapaQueEmpaca = { id: string; nome: string; nivel: Nivel | null; passagens: number; mediana: number | null; p90: number | null; ids: string[]; paradosAgora: Peca };
export type EmpacaDoPainel = { etapas: EtapaQueEmpaca[]; maisLenta: string | null };

export type LinhaDaPrioridade = { prioridade: Prioridade | null; nome: string; resolvidos: number; mediana: number | null; abertos: Peca; ids: string[] };
export type PrioridadeDoPainel = { linhas: LinhaDaPrioridade[]; resposta: 'sim' | 'nem_sempre' | null; trocadas: Peca; semPrioridade: number; resolvidos: number };

export type LinhaDaOperadora = {
  nome: string; chamados: number; ids: string[]; esperaMediana: number | null;
  /** do tempo até resolver: a equipe trabalhando, esperando a operadora, esperando o cliente (somam 100) */
  partes: { trabalhando: number; operadora: number; cliente: number };
  /** os protocolos abertos na operadora no período; `abertos`: os chamados com protocolo aberto agora (de qualquer data); o prometido: os fechados no período */
  casos: number; abertos: Peca; prometido: { cumprido: number; total: number; foraIds: string[] };
};
export type OperadoraDoPainel = { chamados: number; pctEspera: number | null; abertosAgora: Peca; passouDoPrometido: Peca; linhas: LinhaDaOperadora[] };

export type PontoDaFila = { id: string; rotulo: string; de: string; ate: string; entrou: number; saiu: number; fila: number; parcial: boolean; idsEntrou: string[]; idsSaiu: string[] };
export type FilaDoPainel = { por: 'semana' | 'mes'; pontos: PontoDaFila[]; entrou: number; saiu: number; filaHoje: Peca; saldoRecente: { n: number; pontos: number } };

export type CalorDoPainel = {
  n: number;
  /** [dia da semana (0 = segunda)][hora] */
  celulas: number[][];
  ids: Record<string, string[]>;
  porDia: number[]; porHora: number[];
  /** quantas segundas, terças… o período tem (para a média por semana) */
  ocorrencias: number[];
  pico: { dia: number; hora: number; n: number } | null;
  foraDoHorario: number;
  /** o horário de atendimento de cada dia da semana (0 = segunda), para marcar o que fica fora */
  horario: Array<{ abre: boolean; de: number; ate: number }>;
};

export const FAIXAS_DA_IDADE = [
  { id: 'd1', rotulo: 'até 1 dia', ate: 1 }, { id: 'd3', rotulo: '1 a 3 dias', ate: 3 }, { id: 'd7', rotulo: '3 a 7 dias', ate: 7 },
  { id: 'd15', rotulo: '7 a 15 dias', ate: 15 }, { id: 'd30', rotulo: '15 a 30 dias', ate: 30 }, { id: 'mais', rotulo: 'mais de 30 dias', ate: Infinity },
] as const;
export type IdadeDoPainel = {
  abertos: number; medianaDias: number | null;
  faixas: FaixaDeTempo[];
  maisAntigo: { id: string; codigo: string; titulo: string; dias: number } | null;
  porEtapa: Array<{ id: string; nome: string; n: number; velhos: number; ids: string[] }>;
};

export type DiaDaCurva = { dia: string; n: number; normal: number; ids: string[]; assunto: { rotulo: string; n: number } | null; cliente: { rotulo: string; n: number } | null };
export type CurvaDoPainel = { pontos: Array<{ id: string; rotulo: string; n: number; normal: number; pico: boolean }>; picos: DiaDaCurva[] };

export type PrevisaoDoPainel = {
  semana: { de: string; ate: string }; semanas: number;
  dias: Array<{ dia: string; rotulo: string; media: number; min: number; max: number }>;
  total: number; faixa: { min: number; max: number };
  semanaAtual: { de: string; ateHoje: number; esperadoAteHoje: number };
};

export type NoDaArvore = {
  id: string; nome: string; nivel: number; ativo: boolean;
  n: number; ids: string[]; abertos: number; resolvidos: number; mediana: number | null; noPrazo: number; comPrazo: number;
  filhos: NoDaArvore[];
};
export type ArvoreDoPainel = { chegaram: number; comAssunto: number; semAssunto: Peca & { abertos: number }; raiz: NoDaArvore[] };

export type ItemQueSobe = { chave: string; rotulo: string; agora: number; antes: number; delta: number; ids: string[] };
export type SobeDoPainel = { nivel: number; agora: number; antes: number; anterior: { de: string; ate: string; nome: string }; subiram: ItemQueSobe[]; cairam: ItemQueSobe[]; iguais: number; novos: number; semComparacao: boolean };

export type GravidadeDoPainel = {
  colunas: Array<{ gravidade: Gravidade; nome: string; n: number }>;
  linhas: Array<{ rotulo: string; total: number; celulas: Peca[] }>;
  total: number; semGravidade: Peca;
  inoperancias: { n: number; topo: { rotulo: string; n: number } | null };
  pedidos: number;
};

export type ParetoDoPainelSaida = { por: ParetoDoPainel; total: number; itens: Array<{ rotulo: string; n: number; somando: number; ids: string[] }>; k80: number; distintos: number; naoPreenchido: Peca };

export type ProblemaDoRelatorio = { id: string; codigo: string; titulo: string; abertoHaDias: number; incidentes: Peca; temCausa: boolean; resolvido: boolean };
export type ProblemasDoPainel = { abertos: ProblemaDoRelatorio[]; resolvidosNoPeriodo: Peca; incidentesNoPeriodo: Peca; semCausa: number };

export type RaioXDoCliente = {
  id: string; nome: string; produtos: string[]; dids: number; aparelhos: number;
  chamados: Peca; mediana: number | null; abertos: Peca; voltaram: number;
  meses: Array<{ mes: string; rotulo: string; n: number }>;
  assuntos: Array<{ rotulo: string; n: number; ids: string[] }>;
  tipos: Array<{ rotulo: string; n: number; ids: string[] }>;
  ultimos: string[];
};
export type ClientesDoPainel = { lista: Array<{ id: string; nome: string; n: number }>; raiox: RaioXDoCliente | null };

export type TamanhoDoPainel = { linhas: Array<{ id: string; nome: string; n: number; ids: string[]; dids: number; aparelhos: number; por10Dids: number | null; por10Aparelhos: number | null }> };

export type VoltouDoPainel = {
  /** cada sequência do mesmo cliente com o mesmo assunto, um até 30 dias depois do outro; `voltas` = as voltas no período */
  linhas: Array<{ cliente: string; assunto: string; n: number; voltas: number; menorIntervalo: number; ultimo: string; ids: string[] }>;
  repetem: Peca; reabertos: Peca;
};

export type FalhaDoPainel = {
  campo: { id: string; nome: string; automatico: boolean } | null;
  possiveis: Array<{ id: string; nome: string }>;
  total: number;
  porOpcao: Array<{ opcao: string; nome: string; n: number; pct: number; ids: string[] }>;
  semResposta: Peca;
  meses: Array<{ mes: string; rotulo: string; porOpcao: number[]; semResposta: number }>;
};

export type LinhaDaEquipe = {
  id: string | null; nome: string;
  emAberto: Peca; vencidos: Peca; parados: Peca; resolvidos: Peca; mediana: number | null; escalonou: number;
  semanas: number[];
};
export type EquipeDoPainel = { semanas: string[]; linhas: LinhaDaEquipe[] };

export type TempoGastoDoPainel = {
  minutos: number; lancamentos: number;
  porPessoa: Array<{ nome: string; minutos: number; ids: string[] }>;
  porAssunto: Array<{ rotulo: string; minutos: number; ids: string[] }>;
  porCliente: Array<{ rotulo: string; minutos: number; ids: string[] }>;
  maiores: Array<{ id: string; codigo: string; titulo: string; minutos: number }>;
};

export type CampoDoPreenchimento = 'assunto' | 'tipo' | 'gravidade' | 'produtos' | 'causa' | 'solucao';
export const NOME_DO_PREENCHIMENTO: Record<CampoDoPreenchimento, string> = { assunto: 'Assunto', tipo: 'Tipo', gravidade: 'Gravidade', produtos: 'Produtos', causa: 'Causa', solucao: 'Solução' };
export type PreenchidoDoPainel = {
  resolvidos: number; completos: Peca;
  campos: Array<{ campo: CampoDoPreenchimento; nome: string; preenchidos: number; pct: number; faltou: Peca }>;
  porPessoa: Array<{ nome: string; total: number; completos: number; pct: number }>;
};

export type NumeroDoMes = { agora: number | null; antes: number | null };
export type MesDoPainel = {
  mes: string; nome: string; anterior: string; meses: Array<{ mes: string; nome: string }>;
  chegaram: NumeroDoMes & { ids: string[] }; resolvidos: NumeroDoMes & { ids: string[] }; mediana: NumeroDoMes; filaNoFim: NumeroDoMes; prazo: NumeroDoMes;
  porDia: Array<{ dia: string; n: number; ids: string[] }>;
  assuntos: Array<{ rotulo: string; n: number; antes: number; ids: string[] }>;
  clientes: Array<{ rotulo: string; n: number; antes: number; ids: string[] }>;
  tipos: Array<{ rotulo: string; n: number; antes: number; ids: string[] }>;
  destaques: string[];
};

/** Os 25 relatórios de um painel, de uma vez (o que a página desenha). */
export type RelatoriosDoPainel = {
  painel: { id: string; nome: string; sigla: string };
  periodo: { de: string; ate: string; dias: number; anterior: { de: string; ate: string; nome: string } };
  agora: string;
  /** as horas de um dia de atendimento (para ler "1 d 2 h" em horas úteis) */
  horasDoDia: number;
  /** o primeiro dia com chamado no painel (o atalho "Tudo") */
  primeiroDia: string | null;
  /** os relatórios que fazem sentido para este painel (o que ele não usa não aparece) */
  aplicaveis: string[];
  /** quantos chamados (sem os problemas) o recorte tem, de qualquer data */
  noRecorte: number;
  chamados: ChamadoDoRelatorio[];
  prazo: PrazoDoPainel; relogio: RelogioDoPainel; resposta: RespostaDoPainel; escada: EscadaDoPainel; empaca: EmpacaDoPainel;
  prioridade: PrioridadeDoPainel; operadora: OperadoraDoPainel;
  fila: FilaDoPainel; idade: IdadeDoPainel; calor: CalorDoPainel; curva: CurvaDoPainel; previsao: PrevisaoDoPainel;
  arvore: ArvoreDoPainel; sobe: SobeDoPainel; gravidade: GravidadeDoPainel; pareto: ParetoDoPainelSaida; problemas: ProblemasDoPainel;
  clientes: ClientesDoPainel; tamanho: TamanhoDoPainel; voltou: VoltouDoPainel; falha: FalhaDoPainel;
  equipe: EquipeDoPainel; tempogasto: TempoGastoDoPainel; preenchido: PreenchidoDoPainel;
  fechamento: MesDoPainel;
};

// =====================================================================
//  PEQUENAS CONTAS
// =====================================================================

const DIA_MS = 86_400_000;
const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : 0);
const pctOuNada = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : null);
const fimDoMes = (mes: string) => somarDias(`${somarMeses(mes, 1)}-01`, -1);
const diaCurto = (dia: string) => `${dia.slice(8, 10)}/${dia.slice(5, 7)}`;
const DIAS_CURTOS = ['seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom'];
const DIAS_POR_EXTENSO = ['segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado', 'domingo'];
const comparar = (a: string, b: string) => a.localeCompare(b, 'pt-BR', { sensitivity: 'base' });
const SEM_VALOR = 'Não preenchido';

/** As horas de um dia de atendimento: a duração que mais se repete nos dias abertos (10 h no horário de fábrica). */
export function horasDoDiaUtil(cal: Calendario): number {
  const duracoes = cal.horario.filter((h) => h.abre).map((h) => {
    const [ih = 0, im = 0] = h.inicio.split(':').map(Number); const [fh = 0, fm = 0] = h.fim.split(':').map(Number);
    return Math.max(0, fh * 60 + fm - (ih * 60 + im)) / 60;
  }).filter((d) => d > 0);
  if (!duracoes.length) return 24;
  const conta = new Map<number, number>();
  for (const d of duracoes) conta.set(d, (conta.get(d) ?? 0) + 1);
  return [...conta].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0]![0];
}

/**
 * O tempo em horas úteis, do jeito que a equipe fala: "25 min", "3 h 40", "2 d 6 h" — onde o dia é um dia de
 * atendimento (`horasDoDia`), não 24 horas.
 */
export function duracaoUtil(minutos: number | null | undefined, horasDoDia = 10): string {
  if (minutos == null || !Number.isFinite(minutos)) return '—';
  const m = Math.max(0, Math.round(minutos));
  if (m < 60) return `${m} min`;
  const minutosDoDia = Math.round(horasDoDia * 60);
  if (m < minutosDoDia) {
    const h = Math.floor(m / 60); const r = m % 60;
    return r ? `${h} h ${String(r).padStart(2, '0')}` : `${h} h`;
  }
  const d = Math.floor(m / minutosDoDia); const h = Math.round((m - d * minutosDoDia) / 60);
  if (h >= horasDoDia) return `${d + 1} d`;
  return h ? `${d} d ${h} h` : `${d} d`;
}

/** As faixas do Relógio, em horas úteis (o "dia" é um dia de atendimento). */
function faixasDoRelogio(horasDoDia: number): Array<{ id: string; rotulo: string; ate: number }> {
  const dia = horasDoDia * 60;
  return [
    { id: 'h1', rotulo: 'até 1 h', ate: 60 }, { id: 'h4', rotulo: '1 h a 4 h', ate: 240 }, { id: 'd1', rotulo: '4 h a 1 dia', ate: Math.max(241, dia) },
    { id: 'd3', rotulo: '1 a 3 dias', ate: dia * 3 }, { id: 'd7', rotulo: '3 a 7 dias', ate: dia * 7 }, { id: 'mais', rotulo: 'mais de 7 dias', ate: Infinity },
  ];
}
const FAIXAS_DA_RESPOSTA = [
  { id: 'm15', rotulo: 'até 15 min', ate: 15 }, { id: 'm30', rotulo: '15 a 30 min', ate: 30 }, { id: 'h1', rotulo: '30 min a 1 h', ate: 60 },
  { id: 'h4', rotulo: '1 h a 4 h', ate: 240 }, { id: 'mais', rotulo: 'mais de 4 h', ate: Infinity },
] as const;

function contar<T>(xs: readonly T[], chave: (x: T) => string[]): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const x of xs) for (const k of new Set(chave(x))) m.set(k, [...(m.get(k) ?? []), x]);
  return m;
}

// =====================================================================
//  O PREPARO: cada chamado com as contas que vários relatórios usam
// =====================================================================

type Derivado = {
  c: ChamadoParaRelatorios;
  diaCriado: string;
  diaResolvido: string | null;
  /** minutos úteis do aberto ao resolvido */
  minResolver: number | null;
  /** minutos úteis do aberto à primeira resposta */
  minResposta: number | null;
  nivelMax: Nivel | null;
  prazos: { resposta: EstadoPrazo; solucao: EstadoPrazo };
  /** os ids do assunto, da raiz até ele */
  caminhoIds: string[];
  /** os nomes do assunto, da raiz até ele */
  caminho: string[];
};

type Preparo = {
  ctx: ContextoDosRelatorios; f: FiltroDosRelatorios; agora: Date; hoje: string;
  de: string; ate: string; anterior: { de: string; ate: string; nome: string };
  cal: Calendario; horasDoDia: number;
  /** os chamados do painel (sem os problemas) que passam nos filtros de valor */
  base: Derivado[];
  /** os problemas do painel (sem os filtros de valor: o problema junta clientes diferentes) */
  problemas: ChamadoParaRelatorios[];
  /** todos os chamados do painel, pelo id (para achar o problema de um incidente, o que este repete) */
  porId: Map<string, ChamadoParaRelatorios>;
  etapas: Map<string, EtapaParaRelatorio>;
  assuntos: Map<string, AssuntoParaRelatorio>;
  citados: Set<string>;
};

/** Os chamados que uma peça cita entram na lista curta da resposta. */
const citar = (p: Preparo, ids: Iterable<string>) => { for (const id of ids) p.citados.add(id); };
const peca = (p: Preparo, xs: readonly Derivado[]): Peca => { const ids = xs.map((d) => d.c.id); citar(p, ids); return { n: ids.length, ids }; };

function caminhoDoAssuntoIds(id: string | null, assuntos: Map<string, AssuntoParaRelatorio>): string[] {
  const out: string[] = [];
  const vistos = new Set<string>();
  for (let a = id ? assuntos.get(id) : undefined; a && !vistos.has(a.id); a = a.paiId ? assuntos.get(a.paiId) : undefined) {
    vistos.add(a.id);
    out.unshift(a.id);
  }
  return out;
}

function derivar(c: ChamadoParaRelatorios, ctx: ContextoDosRelatorios, etapas: Map<string, EtapaParaRelatorio>, assuntos: Map<string, AssuntoParaRelatorio>, agora: Date): Derivado {
  const cal = ctx.prazos.calendario;
  let nivelMax: Nivel | null = null;
  for (const ps of c.passagens) {
    const n = etapas.get(ps.etapaId)?.nivel ?? null;
    if (n && (!nivelMax || n > nivelMax)) nivelMax = n;
  }
  const caminhoIds = caminhoDoAssuntoIds(c.assuntoId, assuntos);
  return {
    c,
    diaCriado: diaLocal(c.criadoEm),
    diaResolvido: c.resolvidoEm ? diaLocal(c.resolvidoEm) : null,
    minResolver: c.resolvidoEm ? minutosUteisEntre(c.criadoEm, c.resolvidoEm, cal) : null,
    minResposta: c.respondidoEm ? minutosUteisEntre(c.criadoEm, c.respondidoEm, cal) : null,
    nivelMax,
    prazos: estadoDosPrazos({ criadoEm: c.criadoEm, prioridade: c.prioridade, respondidoEm: c.respondidoEm, resolvidoEm: c.resolvidoEm, esperas: c.esperas, contaPrazo: ctx.painel.contaPrazo }, ctx.prazos, agora),
    caminhoIds,
    caminho: caminhoIds.map((id) => assuntos.get(id)?.nome ?? '?'),
  };
}

/** O valor de um campo do painel no chamado, como lista (a lista de várias opções conta cada uma). */
function valoresDoCampo(c: ChamadoParaRelatorios, campoId: string): string[] {
  const v = c.campos[campoId];
  if (Array.isArray(v)) return v.map(String).filter(Boolean);
  if (v === null || v === undefined || v === '') return [];
  return [String(v)];
}

/** O chamado passa nos filtros de valor? */
function passa(d: Derivado, f: FiltroDosRelatorios, assuntoComFilhos: Set<string> | null): boolean {
  const c = d.c;
  if (assuntoComFilhos && !(c.assuntoId && assuntoComFilhos.has(c.assuntoId))) return false;
  if (f.tipo && c.tipo !== f.tipo) return false;
  if (f.gravidade && c.gravidade !== f.gravidade) return false;
  if (f.prioridade && (f.prioridade === 'sem' ? c.prioridade !== null : c.prioridade !== f.prioridade)) return false;
  if (f.nivel && d.nivelMax !== f.nivel) return false;
  if (f.responsavel && (f.responsavel === RESPONSAVEL_NINGUEM ? c.responsavelId !== null : c.responsavelId !== f.responsavel)) return false;
  if (f.cliente && c.clienteId !== f.cliente) return false;
  if (f.produto && !c.produtos.includes(f.produto)) return false;
  if (f.operadora && !c.operadoras.includes(f.operadora)) return false;
  if (f.etiqueta && !c.etiquetas.some((e) => paraBusca(e) === paraBusca(f.etiqueta!))) return false;
  if (f.campo) {
    const i = f.campo.indexOf(':');
    const campoId = i > 0 ? f.campo.slice(0, i) : f.campo;
    const opcao = i > 0 ? f.campo.slice(i + 1) : '';
    const vs = valoresDoCampo(c, campoId);
    if (opcao ? !vs.includes(opcao) : vs.length > 0) return false;
  }
  return true;
}

function descendentes(id: string, assuntos: readonly AssuntoParaRelatorio[]): Set<string> {
  const filhos = new Map<string, string[]>();
  for (const a of assuntos) if (a.paiId) filhos.set(a.paiId, [...(filhos.get(a.paiId) ?? []), a.id]);
  const out = new Set<string>([id]);
  const fila = [id];
  while (fila.length) for (const f of filhos.get(fila.shift()!) ?? []) if (!out.has(f)) { out.add(f); fila.push(f); }
  return out;
}

function preparar(chamados: readonly ChamadoParaRelatorios[], ctx: ContextoDosRelatorios, f: FiltroDosRelatorios, agora: Date): Preparo {
  const { de, ate } = periodoDosRelatorios(f, agora);
  const etapas = new Map(ctx.etapas.map((e) => [e.id, e]));
  const assuntos = new Map(ctx.assuntos.map((a) => [a.id, a]));
  const comFilhos = f.assunto ? descendentes(f.assunto, ctx.assuntos) : null;
  const base: Derivado[] = [];
  for (const c of chamados) {
    if (c.tipoChamado === 'problema') continue;
    const d = derivar(c, ctx, etapas, assuntos, agora);
    if (passa(d, f, comFilhos)) base.push(d);
  }
  return {
    ctx, f, agora, hoje: diaLocal(agora), de, ate, anterior: periodoDeComparacao(de, ate),
    cal: ctx.prazos.calendario, horasDoDia: horasDoDiaUtil(ctx.prazos.calendario),
    base, problemas: chamados.filter((c) => c.tipoChamado === 'problema'),
    porId: new Map(chamados.map((c) => [c.id, c])), etapas, assuntos, citados: new Set(),
  };
}

const dentro = (dia: string | null, de: string, ate: string) => !!dia && dia >= de && dia <= ate;
const chegaram = (p: Preparo, de = p.de, ate = p.ate) => p.base.filter((d) => dentro(d.diaCriado, de, ate));
const resolvidosEm = (p: Preparo, de = p.de, ate = p.ate) => p.base.filter((d) => dentro(d.diaResolvido, de, ate));
const abertosAgora = (p: Preparo) => p.base.filter((d) => d.c.situacao === 'aberto');
const prazoVencido = (d: Derivado) => d.prazos.resposta.situacao === 'vencido' || d.prazos.solucao.situacao === 'vencido';
const prazoPerto = (d: Derivado) => !prazoVencido(d) && (d.prazos.resposta.situacao === 'perto' || d.prazos.solucao.situacao === 'perto');
const nomePessoa = (p: Preparo, id: string | null) => (id ? p.ctx.pessoas.get(id) ?? 'Alguém que saiu' : 'Sem responsável');
const nomeCliente = (p: Preparo, id: string | null) => (id ? p.ctx.clientes.get(id)?.nome ?? 'Cliente fora da base' : 'Sem cliente');
const nivelUm = (d: Derivado) => d.caminho[0] ?? null;
const ateHoje = (p: Preparo, dia: string) => (dia > p.hoje ? p.hoje : dia);

// =====================================================================
//  TEMPO
// =====================================================================

function prazoDoPeriodo(xs: readonly Derivado[]): { resposta: { comPrazo: number; noPrazo: number }; solucao: { comPrazo: number; noPrazo: number } } {
  const r = { resposta: { comPrazo: 0, noPrazo: 0 }, solucao: { comPrazo: 0, noPrazo: 0 } };
  for (const d of xs) {
    const rs = d.prazos.resposta.situacao; const so = d.prazos.solucao.situacao;
    if (rs === 'cumprido' || rs === 'estourou') { r.resposta.comPrazo++; if (rs === 'cumprido') r.resposta.noPrazo++; }
    if (so === 'cumprido' || so === 'estourou') { r.solucao.comPrazo++; if (so === 'cumprido') r.solucao.noPrazo++; }
  }
  return r;
}

function prazo(p: Preparo): PrazoDoPainel {
  const resolvidos = resolvidosEm(p);
  const antes = prazoDoPeriodo(resolvidosEm(p, p.anterior.de, p.anterior.ate));
  const agora = prazoDoPeriodo(resolvidos);
  const fora = (qual: 'resposta' | 'solucao', xs: readonly Derivado[]) => {
    const ids = xs.filter((d) => d.prazos[qual].situacao === 'estourou').map((d) => d.c.id);
    citar(p, ids);
    return ids;
  };
  const abertos = abertosAgora(p);
  const porPrioridade: LinhaDoPrazo[] = [...PRIORIDADES, null].map((pr) => {
    const xs = resolvidos.filter((d) => d.c.prioridade === pr);
    const conta = prazoDoPeriodo(xs);
    const limite = pr ? p.ctx.prazos.prazos[pr] : null;
    const comPrazoIds = (qual: 'resposta' | 'solucao') => xs.filter((d) => ['cumprido', 'estourou'].includes(d.prazos[qual].situacao)).map((d) => d.c.id);
    const ids = { resposta: comPrazoIds('resposta'), solucao: comPrazoIds('solucao') };
    citar(p, [...ids.resposta, ...ids.solucao]);
    return {
      prioridade: pr, nome: pr ? NOME_PRIORIDADE[pr] : 'Sem prioridade', resolvidos: xs.length,
      resposta: { ...conta.resposta, ids: ids.resposta, foraIds: fora('resposta', xs) },
      solucao: { ...conta.solucao, ids: ids.solucao, foraIds: fora('solucao', xs) },
      limites: limite ? { resposta: limite.resposta, solucao: limite.solucao, uteis: limite.conta === 'uteis' } : null,
    };
  }).filter((l) => l.prioridade !== null || l.resolvidos > 0);
  return {
    contaPrazo: p.ctx.painel.contaPrazo,
    resolvidos: resolvidos.length,
    resposta: { ...agora.resposta, pct: pctOuNada(agora.resposta.noPrazo, agora.resposta.comPrazo), antes: pctOuNada(antes.resposta.noPrazo, antes.resposta.comPrazo), foraIds: fora('resposta', resolvidos) },
    solucao: { ...agora.solucao, pct: pctOuNada(agora.solucao.noPrazo, agora.solucao.comPrazo), antes: pctOuNada(antes.solucao.noPrazo, antes.solucao.comPrazo), foraIds: fora('solucao', resolvidos) },
    vencidosAgora: peca(p, abertos.filter(prazoVencido)),
    pertoAgora: peca(p, abertos.filter(prazoPerto)),
    semPrioridade: resolvidos.filter((d) => !d.c.prioridade).length,
    porPrioridade,
  };
}

function chavesDoSeparar(p: Preparo, d: Derivado, por: SepararORelogio): Array<[string, string]> {
  const c = d.c;
  switch (por) {
    case 'assunto1': return d.caminho[0] ? [[d.caminhoIds[0]!, d.caminho[0]]] : [['', 'Sem assunto']];
    case 'assunto2': return d.caminho.length ? [[d.caminhoIds.slice(0, 2).join('/'), d.caminho.slice(0, 2).join(' › ')]] : [['', 'Sem assunto']];
    case 'prioridade': return [[c.prioridade ?? '', c.prioridade ? NOME_PRIORIDADE[c.prioridade] : 'Sem prioridade']];
    case 'tipo': return [[c.tipo ?? '', c.tipo ?? 'Sem tipo']];
    case 'gravidade': return [[c.gravidade ?? '', c.gravidade ? NOME_GRAVIDADE[c.gravidade] : 'Sem gravidade']];
    case 'responsavel': return [[c.responsavelId ?? '', nomePessoa(p, c.responsavelId)]];
    case 'cliente': return [[c.clienteId ?? '', nomeCliente(p, c.clienteId)]];
    case 'produto': return c.produtos.length ? c.produtos.map((id) => [id, p.ctx.produtos.get(id) ?? '?'] as [string, string]) : [['', 'Sem produto']];
    case 'operadora': return c.operadoras.length ? c.operadoras.map((id) => [id, p.ctx.operadoras.get(id) ?? '?'] as [string, string]) : [['', 'Sem operadora']];
  }
}

function relogio(p: Preparo): RelogioDoPainel {
  const xs = resolvidosEm(p).filter((d) => d.minResolver !== null);
  const tempos = xs.map((d) => d.minResolver!);
  const antes = resolvidosEm(p, p.anterior.de, p.anterior.ate).map((d) => d.minResolver!).filter((m) => m !== null);
  const faixas = faixasDoRelogio(p.horasDoDia).map((fx, i, todas) => {
    const de = i ? todas[i - 1]!.ate : -1;
    const ids = xs.filter((d) => d.minResolver! > de && d.minResolver! <= fx.ate).map((d) => d.c.id);
    citar(p, ids);
    return { id: fx.id, rotulo: fx.rotulo, n: ids.length, ids };
  });
  const separar = p.f.separar ?? 'assunto1';
  const grupos = new Map<string, { rotulo: string; xs: Derivado[] }>();
  for (const d of xs) for (const [k, rotulo] of chavesDoSeparar(p, d, separar)) {
    const g = grupos.get(k) ?? { rotulo, xs: [] };
    g.xs.push(d); grupos.set(k, g);
  }
  const separado = [...grupos].map(([valor, g]) => {
    const ts = g.xs.map((d) => d.minResolver!);
    return { valor, rotulo: g.rotulo, n: g.xs.length, mediana: mediana(ts)!, p90: percentil(ts, 0.9)!, ids: g.xs.map((d) => d.c.id) };
  }).sort((a, b) => b.n - a.n || comparar(a.rotulo, b.rotulo));
  return {
    resolvidos: xs.length, mediana: mediana(tempos), p90: percentil(tempos, 0.9),
    ate4h: tempos.filter((t) => t <= 240).length,
    antes: { resolvidos: antes.length, mediana: mediana(antes), p90: percentil(antes, 0.9) },
    faixas, separar, separado,
  };
}

function resposta(p: Preparo): RespostaDoPainel {
  const conta = (xs: readonly Derivado[]) => {
    const r = xs.filter((d) => d.minResposta !== null);
    const ts = r.map((d) => d.minResposta!);
    return { r, ts, mediana: mediana(ts), ate1h: ts.filter((t) => t <= 60).length };
  };
  const agora = conta(chegaram(p));
  const antes = conta(chegaram(p, p.anterior.de, p.anterior.ate));
  const faixas = FAIXAS_DA_RESPOSTA.map((fx, i, todas) => {
    const de = i ? todas[i - 1]!.ate : -1;
    const ids = agora.r.filter((d) => d.minResposta! > de && d.minResposta! <= fx.ate).map((d) => d.c.id);
    citar(p, ids);
    return { id: fx.id, rotulo: fx.rotulo, n: ids.length, ids };
  });
  const esperando = abertosAgora(p).filter((d) => !d.c.respondidoEm).sort((a, b) => a.c.criadoEm.localeCompare(b.c.criadoEm));
  const velho = esperando[0];
  return {
    respondidos: agora.r.length, mediana: agora.mediana, ate1h: agora.ate1h,
    antes: { respondidos: antes.r.length, mediana: antes.mediana, ate1h: antes.ate1h },
    faixas,
    esperando: { ...peca(p, esperando), maisAntigo: velho ? { id: velho.c.id, codigo: velho.c.codigo, minutos: Math.round(minutosUteisEntre(velho.c.criadoEm, p.agora, p.cal)) } : null },
    foraDoHorario: agora.r.filter((d) => !dentroDoHorario(d.c.criadoEm, p.cal)).length,
  };
}

function escada(p: Preparo): EscadaDoPainel {
  const xs = resolvidosEm(p);
  const total = xs.length;
  // quem resolveu sem passar por etapa de nível (direto da entrada) conta como resolvido no N1
  const nivelDe = (d: Derivado): Nivel => d.nivelMax ?? 1;
  const niveis: Nivel[] = [1, 2, 3, 4];
  const degraus: DegrauDaEscada[] = niveis.map((n) => {
    const entram = xs.filter((d) => nivelDe(d) >= n);
    const resolvem = entram.filter((d) => nivelDe(d) === n);
    const sobem = entram.filter((d) => nivelDe(d) > n);
    const ids = resolvem.map((d) => d.c.id); const idsSobem = sobem.map((d) => d.c.id);
    citar(p, [...ids, ...idsSobem]);
    return {
      nivel: n, nome: NOME_DO_NIVEL[n], entram: entram.length, resolvem: resolvem.length, sobem: sobem.length, pct: pct(resolvem.length, total),
      mediana: mediana(resolvem.map((d) => d.minResolver ?? 0)), ids, idsSobem,
    };
  });
  // o DEV aparece só quando alguém chegou lá ou o painel tem a etapa (a escada do painel sem DEV para no N3)
  const temDev = degraus[3]!.entram > 0 || p.ctx.etapas.some((e) => e.ativa && e.nivel === 4);
  const doPeriodo = (s: SubidaParaRelatorio) => dentro(diaLocal(s.em), p.de, p.ate);
  const voltas = p.base.filter((d) => d.c.subidas.some((s) => s.sentido === 'desce' && doPeriodo(s)));
  const motivos = p.base.flatMap((d) => d.c.subidas.filter((s) => s.sentido === 'sobe' && doPeriodo(s)).map((s) => ({ d, s })))
    .sort((a, b) => b.s.em.localeCompare(a.s.em)).slice(0, 6)
    .map(({ d, s }) => ({
      id: d.c.id, codigo: d.c.codigo, de: s.de ? NOME_DO_NIVEL[s.de] : '—', para: s.para ? NOME_DO_NIVEL[s.para] : '—',
      motivo: s.motivo, em: s.em, quem: s.porId ? p.ctx.pessoas.get(s.porId) ?? null : null,
    }));
  citar(p, motivos.map((m) => m.id));
  const antes = resolvidosEm(p, p.anterior.de, p.anterior.ate);
  return {
    resolvidos: total, degraus: temDev ? degraus : degraus.slice(0, 3),
    semNivel: xs.filter((d) => !d.nivelMax).length,
    voltas: peca(p, voltas), motivos,
    antesN1: antes.length ? pct(antes.filter((d) => nivelDe(d) === 1).length, antes.length) : null,
  };
}

function empaca(p: Preparo): EmpacaDoPainel {
  const ordem = [...p.ctx.etapas].filter((e) => e.ativa && (e.tipo === 'entrada' || e.tipo === 'andamento')).sort((a, b) => a.ordem - b.ordem);
  const etapas: EtapaQueEmpaca[] = ordem.map((e) => {
    const passagens: Array<{ d: Derivado; min: number }> = [];
    for (const d of p.base) for (const ps of d.c.passagens) {
      if (ps.etapaId !== e.id || !ps.ate || !dentro(diaLocal(ps.ate), p.de, p.ate)) continue;
      passagens.push({ d, min: minutosUteisEntre(ps.desde, ps.ate, p.cal) });
    }
    const ts = passagens.map((x) => x.min);
    const ids = [...new Set(passagens.map((x) => x.d.c.id))];
    citar(p, ids);
    const parados = abertosAgora(p).filter((d) => d.c.etapaId === e.id);
    return { id: e.id, nome: e.nome, nivel: e.nivel, passagens: passagens.length, mediana: mediana(ts), p90: percentil(ts, 0.9), ids, paradosAgora: peca(p, parados) };
  });
  const comTempo = etapas.filter((e) => e.mediana !== null && e.passagens >= 3);
  const lenta = comTempo.sort((a, b) => b.mediana! - a.mediana!)[0];
  return { etapas, maisLenta: lenta?.id ?? null };
}

function prioridade(p: Preparo): PrioridadeDoPainel {
  const xs = resolvidosEm(p);
  const abertos = abertosAgora(p);
  const linhas: LinhaDaPrioridade[] = [...PRIORIDADES, null].map((pr) => {
    const r = xs.filter((d) => d.c.prioridade === pr);
    const ids = r.map((d) => d.c.id);
    citar(p, ids);
    return { prioridade: pr, nome: pr ? NOME_PRIORIDADE[pr] : 'Sem prioridade', resolvidos: r.length, mediana: mediana(r.map((d) => d.minResolver ?? 0)), abertos: peca(p, abertos.filter((d) => d.c.prioridade === pr)), ids };
  }).filter((l) => l.prioridade !== null || l.resolvidos > 0 || l.abertos.n > 0);
  // "Sim" quando, das que têm 3 resolvidos ou mais (como no 1.7), cada uma é mais rápida que a de baixo
  const medianas = linhas.filter((l) => l.prioridade && l.mediana !== null && l.resolvidos >= 3).map((l) => l.mediana!);
  const resposta = medianas.length < 2 ? null : medianas.every((m, i) => i === 0 || m >= medianas[i - 1]!) ? 'sim' : 'nem_sempre';
  return { linhas, resposta, trocadas: peca(p, xs.filter((d) => d.c.prioridadeTrocada)), semPrioridade: xs.filter((d) => !d.c.prioridade).length, resolvidos: xs.length };
}

/** Minutos úteis de um tipo de espera dentro de [a, b]. */
function minutosEsperando(c: ChamadoParaRelatorios, tipo: 'cliente' | 'operadora', a: string, b: string, cal: Calendario): number {
  let total = 0;
  const ini = Date.parse(a); const fim = Date.parse(b);
  for (const e of c.esperas) {
    if (e.tipo !== tipo) continue;
    const de = Math.max(ini, Date.parse(e.inicio));
    const ate = Math.min(fim, e.fim ? Date.parse(e.fim) : fim);
    if (ate > de) total += minutosUteisEntre(de, ate, cal);
  }
  return total;
}

/**
 * Esperando a operadora: dos resolvidos no período que tiveram a operadora no meio (um protocolo aberto
 * nela, ou o chamado parado em "Esperando a operadora"), quanto do tempo até resolver foi a espera por
 * ela — a parte que a equipe não controla, e que o prazo não desconta (só a espera pelo cliente para o
 * relógio). Por operadora: a espera mediana, a divisão do tempo e se ela cumpre o que promete.
 */
function operadora(p: Preparo): OperadoraDoPainel {
  const xs = resolvidosEm(p).filter((d) => d.c.casos.length || d.c.esperas.some((e) => e.tipo === 'operadora'));
  // a mesma operadora escrita de jeitos diferentes ("Vivo", "VIVO") é uma só: vale o primeiro nome visto
  const rotulos = new Map<string, string>();
  const chaveDe = (nome: string) => { const k = paraBusca(nome); if (!rotulos.has(k)) rotulos.set(k, nome.trim()); return k; };
  const nomesDe = (d: Derivado): string[] => {
    const doCaso = d.c.casos.map((c) => c.operadora.trim()).filter(Boolean);
    if (doCaso.length) return [...new Set(doCaso.map(chaveDe))];
    const doChamado = d.c.operadoras.map((id) => p.ctx.operadoras.get(id)).filter((n): n is string => !!n);
    return doChamado.length ? [...new Set(doChamado.map(chaveDe))] : [chaveDe('Operadora não informada')];
  };
  let somaTotal = 0; let somaOperadora = 0;
  const partes = new Map<string, { total: number; operadora: number; cliente: number; esperas: number[]; xs: Derivado[] }>();
  for (const d of xs) {
    const total = d.minResolver ?? 0;
    const op = Math.min(total, minutosEsperando(d.c, 'operadora', d.c.criadoEm, d.c.resolvidoEm!, p.cal));
    const cli = Math.min(total - op, minutosEsperando(d.c, 'cliente', d.c.criadoEm, d.c.resolvidoEm!, p.cal));
    somaTotal += total; somaOperadora += op;
    for (const k of nomesDe(d)) {
      const g = partes.get(k) ?? { total: 0, operadora: 0, cliente: 0, esperas: [], xs: [] };
      g.total += total; g.operadora += op; g.cliente += cli; g.esperas.push(op); g.xs.push(d);
      partes.set(k, g);
    }
  }
  // os casos (os protocolos) de todos os chamados do recorte: os abertos agora e o prometido cumprido
  const casos = p.base.flatMap((d) => d.c.casos.filter((caso) => caso.operadora.trim()).map((caso) => ({ d, caso, k: chaveDe(caso.operadora) })));
  const fechouNoPeriodo = (caso: CasoParaRelatorio) => !!caso.fechadoEm && dentro(diaLocal(caso.fechadoEm), p.de, p.ate);
  const depoisDoPrometido = (caso: CasoParaRelatorio, ate: number) => !!caso.prometidoPara && ate > Date.parse(caso.prometidoPara);
  const linhas: LinhaDaOperadora[] = [...new Set([...partes.keys(), ...casos.map((x) => x.k)])].map((k) => {
    const g = partes.get(k);
    const doNome = casos.filter((x) => x.k === k);
    const comPrometido = doNome.filter((x) => x.caso.prometidoPara && fechouNoPeriodo(x.caso));
    const fora = comPrometido.filter((x) => depoisDoPrometido(x.caso, Date.parse(x.caso.fechadoEm!)));
    const foraIds = [...new Set(fora.map((x) => x.d.c.id))];
    citar(p, foraIds);
    const t = g?.total ?? 0;
    const opPct = t ? Math.round((g!.operadora / t) * 100) : 0;
    const cliPct = t ? Math.round((g!.cliente / t) * 100) : 0;
    const ids = (g?.xs ?? []).map((d) => d.c.id);
    citar(p, ids);
    return {
      nome: rotulos.get(k) ?? k, chamados: g?.xs.length ?? 0, ids, esperaMediana: g ? mediana(g.esperas) : null,
      partes: { trabalhando: t ? Math.max(0, 100 - opPct - cliPct) : 0, operadora: opPct, cliente: cliPct },
      casos: doNome.filter((x) => dentro(diaLocal(x.caso.abertoEm), p.de, p.ate)).length,
      abertos: peca(p, [...new Set(doNome.filter((x) => !x.caso.fechadoEm).map((x) => x.d))]),
      prometido: { cumprido: comPrometido.length - fora.length, total: comPrometido.length, foraIds },
    };
  })
    // a operadora sem nada no período e sem protocolo aberto agora não entra (seria uma linha de zeros)
    .filter((l) => l.chamados || l.casos || l.abertos.n || l.prometido.total)
    .sort((a, b) => b.chamados - a.chamados || b.casos - a.casos || comparar(a.nome, b.nome));
  const agora = p.agora.getTime();
  // passou do prometido: fechou no período depois do prometido, ou está aberto e o prometido já passou
  const passou = casos.filter((x) => (fechouNoPeriodo(x.caso) && depoisDoPrometido(x.caso, Date.parse(x.caso.fechadoEm!))) || (!x.caso.fechadoEm && depoisDoPrometido(x.caso, agora)));
  return {
    chamados: xs.length, pctEspera: somaTotal ? Math.round((somaOperadora / somaTotal) * 100) : null,
    abertosAgora: peca(p, [...new Set(casos.filter((x) => !x.caso.fechadoEm).map((x) => x.d))]),
    passouDoPrometido: peca(p, [...new Set(passou.map((x) => x.d))]),
    linhas,
  };
}

// =====================================================================
//  VOLUME
// =====================================================================

/** Os baldes da Entrada × saída: por semana (segunda a domingo) até uns 4 meses; por mês, acima disso. */
function baldes(de: string, ate: string): Array<{ id: string; rotulo: string; de: string; ate: string; parcial: boolean }> {
  const out: Array<{ id: string; rotulo: string; de: string; ate: string; parcial: boolean }> = [];
  if (diasEntre(de, ate) + 1 > 120) {
    for (let m = de.slice(0, 7); m <= ate.slice(0, 7); m = somarMeses(m, 1)) {
      const ini = `${m}-01`; const fim = fimDoMes(m);
      out.push({ id: m, rotulo: mesCurto(m), de: ini, ate: fim, parcial: ini < de || fim > ate });
    }
    return out;
  }
  for (let s = inicioDaSemana(de); s <= ate; s = somarDias(s, 7)) {
    const fim = somarDias(s, 6);
    out.push({ id: s, rotulo: diaCurto(s), de: s, ate: fim, parcial: s < de || fim > ate });
  }
  return out;
}

function fila(p: Preparo): FilaDoPainel {
  const bs = baldes(p.de, p.ate);
  const por = bs[0] && bs[0].id.length === 7 ? 'mes' : 'semana';
  const pontos: PontoDaFila[] = bs.map((b) => {
    const de = b.de < p.de ? p.de : b.de; const ate = b.ate > p.ate ? p.ate : b.ate;
    const fimDaFila = ateHoje(p, ate);
    const entrou = p.base.filter((d) => dentro(d.diaCriado, de, ate));
    const saiu = p.base.filter((d) => dentro(d.diaResolvido, de, ate));
    // na fila no fim do balde: já tinha chegado e ainda não tinha sido resolvido (pelo que sabemos hoje)
    const naFila = p.base.filter((d) => d.diaCriado <= fimDaFila && !(d.diaResolvido && d.diaResolvido <= fimDaFila)).length;
    const idsEntrou = entrou.map((d) => d.c.id); const idsSaiu = saiu.map((d) => d.c.id);
    citar(p, [...idsEntrou, ...idsSaiu]);
    return { id: b.id, rotulo: b.rotulo, de: b.de, ate: b.ate, entrou: entrou.length, saiu: saiu.length, fila: naFila, parcial: b.parcial, idsEntrou, idsSaiu };
  });
  const recentes = pontos.slice(-(por === 'mes' ? 3 : 4));
  return {
    por, pontos,
    entrou: chegaram(p).length, saiu: resolvidosEm(p).length,
    filaHoje: peca(p, abertosAgora(p)),
    saldoRecente: { n: recentes.reduce((a, x) => a + x.entrou - x.saiu, 0), pontos: recentes.length },
  };
}

function idade(p: Preparo): IdadeDoPainel {
  const abertos = abertosAgora(p);
  const dias = (d: Derivado) => (p.agora.getTime() - Date.parse(d.c.criadoEm)) / DIA_MS;
  const faixas = FAIXAS_DA_IDADE.map((fx, i, todas) => {
    const de = i ? todas[i - 1]!.ate : -Infinity;
    const xs = abertos.filter((d) => dias(d) > de && dias(d) <= fx.ate);
    return { id: fx.id, rotulo: fx.rotulo, ...peca(p, xs) };
  });
  const velho = [...abertos].sort((a, b) => a.c.criadoEm.localeCompare(b.c.criadoEm))[0];
  const ordem = [...p.ctx.etapas].filter((e) => e.tipo === 'entrada' || e.tipo === 'andamento').sort((a, b) => a.ordem - b.ordem);
  const porEtapa = ordem.map((e) => {
    const xs = abertos.filter((d) => d.c.etapaId === e.id);
    return { id: e.id, nome: e.nome, n: xs.length, velhos: xs.filter((d) => dias(d) > 7).length, ids: xs.map((d) => d.c.id) };
  }).filter((l) => l.n > 0 || p.ctx.etapas.find((e) => e.id === l.id)?.ativa);
  return {
    abertos: abertos.length,
    medianaDias: abertos.length ? Math.round((mediana(abertos.map(dias)) ?? 0) * 10) / 10 : null,
    faixas,
    maisAntigo: velho ? { id: velho.c.id, codigo: velho.c.codigo, titulo: velho.c.titulo, dias: Math.floor(dias(velho)) } : null,
    porEtapa,
  };
}

function calor(p: Preparo): CalorDoPainel {
  const xs = chegaram(p);
  const celulas = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => 0));
  const ids: Record<string, string[]> = {};
  const porDia = Array.from({ length: 7 }, () => 0);
  const porHora = Array.from({ length: 24 }, () => 0);
  let fora = 0;
  for (const d of xs) {
    const dow = diaDaSemana(d.diaCriado);
    const h = Number(horaLocal(d.c.criadoEm).slice(0, 2));
    celulas[dow]![h]!++; porDia[dow]!++; porHora[h]!++;
    (ids[`${dow}-${h}`] ??= []).push(d.c.id);
    if (!dentroDoHorario(d.c.criadoEm, p.cal)) fora++;
  }
  citar(p, xs.map((d) => d.c.id));
  const ocorrencias = Array.from({ length: 7 }, () => 0);
  for (let dia = p.de; dia <= ateHoje(p, p.ate); dia = somarDias(dia, 1)) ocorrencias[diaDaSemana(dia)]!++;
  let pico: CalorDoPainel['pico'] = null;
  celulas.forEach((linha, dia) => linha.forEach((n, hora) => { if (n > 0 && (!pico || n > pico.n)) pico = { dia, hora, n }; }));
  // o horário de atendimento, de segunda (0) a domingo (6) — o do calendário começa no domingo
  const horario = Array.from({ length: 7 }, (_, i) => {
    const h = p.cal.horario[(i + 1) % 7];
    const hora = (t: string | undefined) => Number((t ?? '00:00').slice(0, 2)) + Number((t ?? '00:00').slice(3, 5)) / 60;
    return { abre: !!h?.abre, de: hora(h?.inicio), ate: hora(h?.fim) };
  });
  return { n: xs.length, celulas, ids, porDia, porHora, ocorrencias, pico, foraDoHorario: fora, horario };
}

function curva(p: Preparo): CurvaDoPainel {
  const porDia = new Map<string, Derivado[]>();
  let primeiro: string | null = null;
  for (const d of p.base) {
    porDia.set(d.diaCriado, [...(porDia.get(d.diaCriado) ?? []), d]);
    if (!primeiro || d.diaCriado < primeiro) primeiro = d.diaCriado;
  }
  const n = (dia: string) => porDia.get(dia)?.length ?? 0;
  const pontos: CurvaDoPainel['pontos'] = [];
  const picos: DiaDaCurva[] = [];
  const ultimo = ateHoje(p, p.ate);
  for (let dia = p.de; dia <= ultimo; dia = somarDias(dia, 1)) {
    // o normal de uma segunda é a mediana das 8 segundas de antes (só as que já tinham chamado no painel).
    // Diferente do 1.7: só marca o pico com ao menos 2 semanas de história (no começo do painel, sem
    // história, todo dia com 5 chamados seria "fora da curva")
    const anteriores: number[] = [];
    for (let k = 1; k <= 8; k++) { const x = somarDias(dia, -7 * k); if (primeiro && x >= primeiro) anteriores.push(n(x)); }
    const normal = Math.round(mediana(anteriores) ?? 0);
    const v = n(dia);
    const ehPico = anteriores.length >= 2 && v >= Math.max(5, normal * 2, normal + 5);
    pontos.push({ id: dia, rotulo: diaCurto(dia), n: v, normal, pico: ehPico });
    if (ehPico) {
      const doDia = porDia.get(dia) ?? [];
      const topo = (chave: (d: Derivado) => string | null) => {
        const conta = new Map<string, number>();
        for (const d of doDia) { const k = chave(d); if (k) conta.set(k, (conta.get(k) ?? 0) + 1); }
        const [rotulo, k] = [...conta].sort((a, b) => b[1] - a[1])[0] ?? [];
        return rotulo ? { rotulo, n: k! } : null;
      };
      const ids = doDia.map((d) => d.c.id);
      citar(p, ids);
      picos.push({ dia, n: v, normal, ids, assunto: topo(nivelUm), cliente: topo((d) => (d.c.clienteId ? nomeCliente(p, d.c.clienteId) : null)) });
    }
  }
  return { pontos: diasEntre(p.de, p.ate) + 1 <= 92 ? pontos : [], picos: picos.reverse().slice(0, 30) };
}

function previsao(p: Preparo): PrevisaoDoPainel {
  const semanaAtual = inicioDaSemana(p.hoje);
  const proxima = somarDias(semanaAtual, 7);
  const porDia = new Map<string, number>();
  let primeiro: string | null = null;
  for (const d of p.base) { porDia.set(d.diaCriado, (porDia.get(d.diaCriado) ?? 0) + 1); if (!primeiro || d.diaCriado < primeiro) primeiro = d.diaCriado; }
  // as semanas completas de antes (até 8) que começaram depois do primeiro chamado do painel (como no 1.7:
  // a semana pela metade do começo puxaria a média para baixo)
  const semanas: string[] = [];
  for (let k = 1; k <= 8; k++) { const s = somarDias(semanaAtual, -7 * k); if (primeiro && s >= primeiro) semanas.push(s); }
  const n = (dia: string) => porDia.get(dia) ?? 0;
  const dias = Array.from({ length: 7 }, (_, dow) => {
    const vs = semanas.map((s) => n(somarDias(s, dow)));
    const dia = somarDias(proxima, dow);
    return { dia, rotulo: `${DIAS_CURTOS[dow]} ${diaCurto(dia)}`, media: vs.length ? Math.round((vs.reduce((a, b) => a + b, 0) / vs.length) * 10) / 10 : 0, min: vs.length ? Math.min(...vs) : 0, max: vs.length ? Math.max(...vs) : 0 };
  });
  const totais = semanas.map((s) => Array.from({ length: 7 }, (_, dow) => n(somarDias(s, dow))).reduce((a, b) => a + b, 0));
  const hojeDow = diaDaSemana(p.hoje);
  let feitos = 0; for (let dow = 0; dow <= hojeDow; dow++) feitos += n(somarDias(semanaAtual, dow));
  return {
    semana: { de: proxima, ate: somarDias(proxima, 6) }, semanas: semanas.length, dias,
    total: Math.round(dias.reduce((a, d) => a + d.media, 0)),
    faixa: { min: totais.length ? Math.min(...totais) : 0, max: totais.length ? Math.max(...totais) : 0 },
    semanaAtual: { de: semanaAtual, ateHoje: feitos, esperadoAteHoje: Math.round(dias.slice(0, hojeDow + 1).reduce((a, d) => a + d.media, 0)) },
  };
}

// =====================================================================
//  ASSUNTOS
// =====================================================================

function arvore(p: Preparo): ArvoreDoPainel {
  const xs = chegaram(p);
  const filhos = new Map<string | null, AssuntoParaRelatorio[]>();
  for (const a of p.ctx.assuntos) filhos.set(a.paiId, [...(filhos.get(a.paiId) ?? []), a]);
  // cada chamado entra no assunto dele e em todos os de cima (o "Ramal" soma o "Ramal › Configuração › Criação")
  const porAssunto = new Map<string, Derivado[]>();
  for (const d of xs) for (const id of d.caminhoIds) porAssunto.set(id, [...(porAssunto.get(id) ?? []), d]);
  const montar = (a: AssuntoParaRelatorio, nivel: number): NoDaArvore | null => {
    const doNo = porAssunto.get(a.id) ?? [];
    if (!doNo.length) return null;
    const resolvidos = doNo.filter((d) => d.minResolver !== null);
    const conta = prazoDoPeriodo(resolvidos);
    const ids = doNo.map((d) => d.c.id);
    citar(p, ids);
    const sub = (filhos.get(a.id) ?? []).map((f) => montar(f, nivel + 1)).filter((x): x is NoDaArvore => !!x).sort((x, y) => y.n - x.n || comparar(x.nome, y.nome));
    return {
      id: a.id, nome: a.nome, nivel, ativo: a.ativo, n: doNo.length, ids,
      abertos: doNo.filter((d) => d.c.situacao === 'aberto').length, resolvidos: resolvidos.length,
      mediana: mediana(resolvidos.map((d) => d.minResolver!)), noPrazo: conta.solucao.noPrazo, comPrazo: conta.solucao.comPrazo,
      filhos: sub,
    };
  };
  const raiz = (filhos.get(null) ?? []).map((a) => montar(a, 1)).filter((x): x is NoDaArvore => !!x).sort((x, y) => y.n - x.n || comparar(x.nome, y.nome));
  const sem = xs.filter((d) => !d.caminhoIds.length);
  return { chegaram: xs.length, comAssunto: xs.length - sem.length, semAssunto: { ...peca(p, sem), abertos: sem.filter((d) => d.c.situacao === 'aberto').length }, raiz };
}

function sobe(p: Preparo): SobeDoPainel {
  const nivel = p.f.nivelSobe ?? 1;
  const chave = (d: Derivado): [string, string] | null => (d.caminhoIds.length ? [d.caminhoIds.slice(0, nivel).join('/'), d.caminho.slice(0, nivel).join(' › ')] : null);
  const agora = chegaram(p); const antes = chegaram(p, p.anterior.de, p.anterior.ate);
  const conta = (xs: readonly Derivado[]) => {
    const m = new Map<string, { rotulo: string; xs: Derivado[] }>();
    for (const d of xs) { const k = chave(d); if (!k) continue; const g = m.get(k[0]) ?? { rotulo: k[1], xs: [] }; g.xs.push(d); m.set(k[0], g); }
    return m;
  };
  const a = conta(agora); const b = conta(antes);
  const itens: ItemQueSobe[] = [...new Set([...a.keys(), ...b.keys()])].map((k) => {
    const ga = a.get(k); const gb = b.get(k);
    const ids = (ga?.xs ?? []).map((d) => d.c.id);
    return { chave: k, rotulo: ga?.rotulo ?? gb!.rotulo, agora: ga?.xs.length ?? 0, antes: gb?.xs.length ?? 0, delta: (ga?.xs.length ?? 0) - (gb?.xs.length ?? 0), ids };
  });
  const subiram = itens.filter((x) => x.delta > 0).sort((x, y) => y.delta - x.delta || y.agora - x.agora).slice(0, 8);
  const cairam = itens.filter((x) => x.delta < 0).sort((x, y) => x.delta - y.delta || y.antes - x.antes).slice(0, 8);
  citar(p, [...subiram, ...cairam].flatMap((x) => x.ids));
  // sem nenhum chamado no período de antes (o primeiro mês do painel), não há com o que comparar
  const semComparacao = !p.base.some((d) => d.diaCriado <= p.anterior.ate);
  return {
    nivel, agora: agora.length, antes: antes.length, anterior: p.anterior, subiram, cairam,
    iguais: itens.filter((x) => x.delta === 0).length, novos: itens.filter((x) => x.antes === 0 && x.agora > 0).length, semComparacao,
  };
}

function gravidade(p: Preparo): GravidadeDoPainel {
  const xs = chegaram(p);
  const comGravidade = xs.filter((d) => d.c.gravidade);
  const grupos = new Map<string, Derivado[]>();
  for (const d of comGravidade) { const k = nivelUm(d) ?? 'Sem assunto'; grupos.set(k, [...(grupos.get(k) ?? []), d]); }
  // as 8 com mais chamados; o resto numa linha só
  const ordem = [...grupos].sort((a, b) => b[1].length - a[1].length || comparar(a[0], b[0]));
  const principais = ordem.slice(0, 8);
  const resto = ordem.slice(8);
  if (resto.length) principais.push([`Os outros ${resto.length}`, resto.flatMap(([, v]) => v)]);
  const linhas = principais.map(([rotulo, ds]) => ({
    rotulo, total: ds.length,
    celulas: GRAVIDADES.map((g) => peca(p, ds.filter((d) => d.c.gravidade === g))),
  }));
  const colunas = GRAVIDADES.map((g) => ({ gravidade: g, nome: NOME_GRAVIDADE[g], n: comGravidade.filter((d) => d.c.gravidade === g).length }));
  const inop = comGravidade.filter((d) => d.c.gravidade === 'inoperancia');
  const topoInop = linhas.filter((l) => !l.rotulo.startsWith('Os outros ')).map((l) => ({ rotulo: l.rotulo, n: l.celulas[0]!.n })).sort((a, b) => b.n - a.n)[0];
  return {
    colunas, linhas, total: comGravidade.length, semGravidade: peca(p, xs.filter((d) => !d.c.gravidade)),
    inoperancias: { n: inop.length, topo: topoInop && topoInop.n > 0 ? topoInop : null },
    pedidos: comGravidade.filter((d) => d.c.gravidade === 'nao_se_aplica').length,
  };
}

function pareto(p: Preparo): ParetoDoPainelSaida {
  const por = p.f.pareto ?? 'assunto1';
  const xs = chegaram(p);
  const chave = (d: Derivado): string[] => {
    const c = d.c;
    switch (por) {
      case 'assunto': return d.caminho.length ? [d.caminho.join(' › ')] : [];
      case 'assunto1': return d.caminho[0] ? [d.caminho[0]] : [];
      case 'cliente': return c.clienteId ? [nomeCliente(p, c.clienteId)] : [];
      case 'produto': return c.produtos.map((id) => p.ctx.produtos.get(id) ?? '?');
      case 'operadora': return c.operadoras.map((id) => p.ctx.operadoras.get(id) ?? '?');
      case 'tipo': return c.tipo ? [c.tipo] : [];
    }
  };
  const grupos = contar(xs, chave);
  // o total é a soma das partes (um chamado com dois produtos conta nos dois)
  const total = [...grupos.values()].reduce((a, g) => a + g.length, 0);
  let soma = 0; let k80 = 0;
  const itens = [...grupos].sort((a, b) => b[1].length - a[1].length || comparar(a[0], b[0])).map(([rotulo, ds], i) => {
    soma += ds.length;
    // quantos dos maiores fazem 80% (a conta exata, não a do número arredondado)
    if (!k80 && soma * 5 >= total * 4) k80 = i + 1;
    const ids = ds.map((d) => d.c.id);
    citar(p, ids);
    return { rotulo, n: ds.length, somando: pct(soma, total), ids };
  });
  return { por, total, itens, k80, distintos: itens.length, naoPreenchido: peca(p, xs.filter((d) => !chave(d).length)) };
}

function problemas(p: Preparo): ProblemasDoPainel {
  const incidentesDe = (id: string) => p.base.filter((d) => d.c.problemaId === id);
  const abertos = p.problemas.filter((x) => x.situacao === 'aberto').map((x): ProblemaDoRelatorio => {
    const inc = incidentesDe(x.id);
    citar(p, [x.id]);
    return {
      id: x.id, codigo: x.codigo, titulo: x.titulo, abertoHaDias: Math.floor((p.agora.getTime() - Date.parse(x.criadoEm)) / DIA_MS),
      incidentes: peca(p, inc), temCausa: x.temCausa, resolvido: false,
    };
  }).sort((a, b) => b.incidentes.n - a.incidentes.n || b.abertoHaDias - a.abertoHaDias);
  const resolvidos = p.problemas.filter((x) => x.resolvidoEm && dentro(diaLocal(x.resolvidoEm), p.de, p.ate)).map((x) => x.id);
  citar(p, resolvidos);
  return {
    abertos, resolvidosNoPeriodo: { n: resolvidos.length, ids: resolvidos },
    incidentesNoPeriodo: peca(p, chegaram(p).filter((d) => d.c.problemaId)),
    semCausa: abertos.filter((a) => !a.temCausa).length,
  };
}

// =====================================================================
//  CLIENTES
// =====================================================================

const MESMO_PROBLEMA_DIAS = 30;

function clientes(p: Preparo): ClientesDoPainel {
  const xs = chegaram(p);
  const porCliente = contar(xs.filter((d) => d.c.clienteId), (d) => [d.c.clienteId!]);
  const lista = [...porCliente].map(([id, ds]) => ({ id, nome: nomeCliente(p, id), n: ds.length })).sort((a, b) => b.n - a.n || comparar(a.nome, b.nome));
  const id = p.f.raiox && p.ctx.clientes.has(p.f.raiox) ? p.f.raiox : null;
  if (!id) return { lista, raiox: null };
  const cad = p.ctx.clientes.get(id)!;
  const doCliente = p.base.filter((d) => d.c.clienteId === id);
  const noPeriodo = doCliente.filter((d) => dentro(d.diaCriado, p.de, p.ate));
  const resolvidos = noPeriodo.filter((d) => d.minResolver !== null);
  const fimDosMeses = ateHoje(p, p.ate).slice(0, 7);
  const meses = Array.from({ length: 12 }, (_, i) => somarMeses(fimDosMeses, i - 11)).map((m) => ({ mes: m, rotulo: mesCurto(m), n: doCliente.filter((d) => d.diaCriado.startsWith(m)).length }));
  const ranking = (chave: (d: Derivado) => string | null) => [...contar(noPeriodo, (d) => { const k = chave(d); return k ? [k] : []; })]
    .map(([rotulo, ds]) => { const ids = ds.map((d) => d.c.id); citar(p, ids); return { rotulo, n: ds.length, ids }; })
    .sort((a, b) => b.n - a.n || comparar(a.rotulo, b.rotulo)).slice(0, 6);
  const ultimos = [...doCliente].sort((a, b) => b.c.criadoEm.localeCompare(a.c.criadoEm)).slice(0, 5).map((d) => d.c.id);
  citar(p, ultimos);
  return {
    lista,
    raiox: {
      id, nome: cad.nome, produtos: cad.produtos, dids: cad.dids, aparelhos: cad.aparelhos,
      chamados: peca(p, noPeriodo), mediana: mediana(resolvidos.map((d) => d.minResolver!)),
      abertos: peca(p, doCliente.filter((d) => d.c.situacao === 'aberto')),
      voltaram: voltasDoMesmoAssunto(p, doCliente).reduce((a, l) => a + l.voltas, 0),
      meses, assuntos: ranking(nivelUm), tipos: ranking((d) => d.c.tipo), ultimos,
    },
  };
}

function tamanho(p: Preparo): TamanhoDoPainel {
  const xs = chegaram(p).filter((d) => d.c.clienteId);
  const linhas = [...contar(xs, (d) => [d.c.clienteId!])].map(([id, ds]) => {
    const cad = p.ctx.clientes.get(id);
    const dids = cad?.dids ?? 0; const aparelhos = cad?.aparelhos ?? 0;
    const ids = ds.map((d) => d.c.id);
    citar(p, ids);
    return {
      id, nome: nomeCliente(p, id), n: ds.length, ids, dids, aparelhos,
      por10Dids: dids ? Math.round((ds.length / dids) * 100) / 10 : null,
      por10Aparelhos: aparelhos ? Math.round((ds.length / aparelhos) * 100) / 10 : null,
    };
  }).sort((a, b) => (b.por10Dids ?? -1) - (a.por10Dids ?? -1) || b.n - a.n || comparar(a.nome, b.nome));
  return { linhas };
}

/**
 * O mesmo cliente com o mesmo assunto (o de baixo, inteiro) de novo em até 30 dias. A volta conta no período
 * em que aconteceu: o chamado de 05/10 que repete o de 15/09 aparece em outubro (com o de setembro junto,
 * para a janela mostrar os dois), e não em setembro. Diferente do 1.7, que só via os pares dentro do período.
 */
function voltasDoMesmoAssunto(p: Preparo, ds: readonly Derivado[]): VoltouDoPainel['linhas'] {
  const grupos = contar(ds.filter((d) => d.c.clienteId && d.c.assuntoId), (d) => [`${d.c.clienteId}|${d.c.assuntoId}`]);
  const linhas: VoltouDoPainel['linhas'] = [];
  for (const [, g] of grupos) {
    const ordem = [...g].sort((a, b) => a.c.criadoEm.localeCompare(b.c.criadoEm));
    // as sequências em que cada um veio até 30 dias depois do anterior
    let atual: Derivado[] = [];
    const fechar = () => {
      const voltas = atual.slice(1).filter((d) => dentro(d.diaCriado, p.de, p.ate)).length;
      if (voltas > 0) {
        const intervalos = atual.slice(1).map((d, i) => diasEntre(atual[i]!.diaCriado, d.diaCriado));
        const ids = atual.map((d) => d.c.id);
        citar(p, ids);
        linhas.push({ cliente: nomeCliente(p, atual[0]!.c.clienteId), assunto: atual[0]!.caminho.join(' › '), n: atual.length, voltas, menorIntervalo: Math.min(...intervalos), ultimo: atual[atual.length - 1]!.c.criadoEm, ids });
      }
      atual = [];
    };
    for (const d of ordem) {
      const anterior = atual[atual.length - 1];
      if (anterior && diasEntre(anterior.diaCriado, d.diaCriado) > MESMO_PROBLEMA_DIAS) fechar();
      atual.push(d);
    }
    fechar();
  }
  return linhas.sort((a, b) => b.n - a.n || b.ultimo.localeCompare(a.ultimo));
}

function voltou(p: Preparo): VoltouDoPainel {
  const xs = chegaram(p);
  return {
    linhas: voltasDoMesmoAssunto(p, p.base),
    repetem: peca(p, xs.filter((d) => d.c.repete.length)),
    reabertos: peca(p, p.base.filter((d) => d.c.reaberto > 0 && (dentro(d.diaCriado, p.de, p.ate) || dentro(d.diaResolvido, p.de, p.ate)))),
  };
}

/** O campo da falha: o escolhido no Organizar ou, sem escolha, o primeiro campo de lista com "respons", "falha" ou "culpa" no nome. */
export function campoDaFalha(campos: readonly CampoParaRelatorio[], escolhido: string | null): { id: string; nome: string; automatico: boolean } | null {
  if (escolhido) {
    const c = campos.find((x) => x.id === escolhido);
    if (c) return { id: c.id, nome: c.nome, automatico: false };
  }
  const auto = campos.find((c) => c.ativo && /respons|falha|culpa/.test(paraBusca(c.nome)));
  return auto ? { id: auto.id, nome: auto.nome, automatico: true } : null;
}

/**
 * De quem é a falha: pelos **resolvidos** no período (o campo costuma ser pedido no Resolvido — contar os que
 * chegaram poria os ainda abertos como "sem resposta"); os 6 meses, pelo mês em que foram resolvidos.
 */
function falha(p: Preparo): FalhaDoPainel {
  const campo = campoDaFalha(p.ctx.campos, p.ctx.campoDaFalha);
  const possiveis = p.ctx.campos.filter((c) => c.ativo).map((c) => ({ id: c.id, nome: c.nome }));
  if (!campo) return { campo: null, possiveis, total: 0, porOpcao: [], semResposta: { n: 0, ids: [] }, meses: [] };
  const xs = resolvidosEm(p);
  const opcoesDoCampo = p.ctx.campos.find((c) => c.id === campo.id)?.opcoes ?? [];
  const nomeDaOpcao = (id: string) => opcoesDoCampo.find((o) => o.id === id)?.nome ?? '(opção que saiu)';
  const usadas = new Set(xs.flatMap((d) => valoresDoCampo(d.c, campo.id)));
  // na ordem das opções do campo; a que saiu do campo (e ficou no chamado) vem no fim
  const opcoes = [...opcoesDoCampo.map((o) => o.id).filter((id) => usadas.has(id)), ...[...usadas].filter((id) => !opcoesDoCampo.some((o) => o.id === id))];
  const porOpcao = opcoes.map((o) => {
    const ds = xs.filter((d) => valoresDoCampo(d.c, campo.id).includes(o));
    const ids = ds.map((d) => d.c.id);
    citar(p, ids);
    return { opcao: o, nome: nomeDaOpcao(o), n: ds.length, pct: pct(ds.length, xs.length), ids };
  }).sort((a, b) => b.n - a.n);
  const fimDosMeses = ateHoje(p, p.ate).slice(0, 7);
  const meses = Array.from({ length: 6 }, (_, i) => somarMeses(fimDosMeses, i - 5)).map((m) => {
    const doMes = p.base.filter((d) => !!d.diaResolvido && d.diaResolvido.startsWith(m));
    return { mes: m, rotulo: mesCurto(m), porOpcao: porOpcao.map((o) => doMes.filter((d) => valoresDoCampo(d.c, campo.id).includes(o.opcao)).length), semResposta: doMes.filter((d) => !valoresDoCampo(d.c, campo.id).length).length };
  });
  return { campo, possiveis, total: xs.length, porOpcao, semResposta: peca(p, xs.filter((d) => !valoresDoCampo(d.c, campo.id).length)), meses };
}

// =====================================================================
//  EQUIPE
// =====================================================================

function equipe(p: Preparo): EquipeDoPainel {
  const fim = inicioDaSemana(ateHoje(p, p.ate));
  const semanas = Array.from({ length: 8 }, (_, i) => somarDias(fim, (i - 7) * 7));
  const abertos = abertosAgora(p);
  const resolvidos = resolvidosEm(p);
  const seteDias = p.agora.getTime() - 7 * DIA_MS;
  const subidasDoPeriodo = p.base.flatMap((d) => d.c.subidas.filter((s) => s.sentido === 'sobe' && dentro(diaLocal(s.em), p.de, p.ate)));
  const pessoas = new Set<string | null>([...abertos.map((d) => d.c.responsavelId), ...resolvidos.map((d) => d.c.responsavelId), ...subidasDoPeriodo.map((s) => s.porId).filter((x): x is string => !!x)]);
  const linhas: LinhaDaEquipe[] = [...pessoas].map((id) => {
    const meus = abertos.filter((d) => d.c.responsavelId === id);
    const feitos = resolvidos.filter((d) => d.c.responsavelId === id);
    return {
      id, nome: nomePessoa(p, id),
      emAberto: peca(p, meus), vencidos: peca(p, meus.filter(prazoVencido)), parados: peca(p, meus.filter((d) => Date.parse(d.c.ultimaAtividadeEm) < seteDias)),
      resolvidos: peca(p, feitos), mediana: mediana(feitos.map((d) => d.minResolver ?? 0)),
      escalonou: id ? subidasDoPeriodo.filter((s) => s.porId === id).length : 0,
      semanas: semanas.map((s) => p.base.filter((d) => d.c.responsavelId === id && dentro(d.diaResolvido, s, somarDias(s, 6))).length),
    };
  }).sort((a, b) => (a.id === null ? 1 : b.id === null ? -1 : comparar(a.nome, b.nome)));
  return { semanas, linhas };
}

function tempogasto(p: Preparo): TempoGastoDoPainel {
  const lancamentos = p.base.flatMap((d) => d.c.tempos.filter((t) => dentro(t.dia, p.de, p.ate)).map((t) => ({ d, t })));
  const somar = (chave: (x: { d: Derivado; t: TempoParaRelatorio }) => string) => {
    const m = new Map<string, { minutos: number; ids: Set<string> }>();
    for (const x of lancamentos) { const k = chave(x); const g = m.get(k) ?? { minutos: 0, ids: new Set<string>() }; g.minutos += x.t.minutos; g.ids.add(x.d.c.id); m.set(k, g); }
    return [...m].map(([rotulo, g]) => { const ids = [...g.ids]; citar(p, ids); return { rotulo, minutos: g.minutos, ids }; }).sort((a, b) => b.minutos - a.minutos || comparar(a.rotulo, b.rotulo));
  };
  const porChamado = new Map<string, { d: Derivado; minutos: number }>();
  for (const x of lancamentos) { const g = porChamado.get(x.d.c.id) ?? { d: x.d, minutos: 0 }; g.minutos += x.t.minutos; porChamado.set(x.d.c.id, g); }
  const maiores = [...porChamado.values()].sort((a, b) => b.minutos - a.minutos).slice(0, 5).map((g) => ({ id: g.d.c.id, codigo: g.d.c.codigo, titulo: g.d.c.titulo, minutos: g.minutos }));
  citar(p, maiores.map((m) => m.id));
  return {
    minutos: lancamentos.reduce((a, x) => a + x.t.minutos, 0), lancamentos: lancamentos.length,
    porPessoa: somar((x) => nomePessoa(p, x.t.pessoaId)).map((x) => ({ nome: x.rotulo, minutos: x.minutos, ids: x.ids })),
    porAssunto: somar((x) => nivelUm(x.d) ?? 'Sem assunto'),
    porCliente: somar((x) => nomeCliente(p, x.d.c.clienteId)),
    maiores,
  };
}

function preenchido(p: Preparo): PreenchidoDoPainel {
  const xs = resolvidosEm(p);
  const usa = p.ctx.painel.usa;
  const campos: CampoDoPreenchimento[] = [
    ...(usa.assunto ? ['assunto' as const] : []), ...(usa.tipo ? ['tipo' as const] : []), ...(usa.gravidade ? ['gravidade' as const] : []),
    ...(usa.produtos ? ['produtos' as const] : []), 'causa', 'solucao',
  ];
  const tem = (d: Derivado, campo: CampoDoPreenchimento) => {
    const c = d.c;
    switch (campo) {
      case 'assunto': return !!c.assuntoId;
      case 'tipo': return !!c.tipo;
      case 'gravidade': return !!c.gravidade;
      case 'produtos': return c.produtos.length > 0;
      case 'causa': return c.temCausa;
      case 'solucao': return c.temSolucao;
    }
  };
  const completo = (d: Derivado) => campos.every((k) => tem(d, k));
  const porPessoa = [...contar(xs, (d) => [d.c.responsavelId ?? ''])].map(([id, ds]) => {
    const completos = ds.filter(completo).length;
    return { nome: nomePessoa(p, id || null), total: ds.length, completos, pct: pct(completos, ds.length) };
  }).sort((a, b) => comparar(a.nome, b.nome));
  return {
    resolvidos: xs.length, completos: peca(p, xs.filter(completo)),
    campos: campos.map((k) => {
      const preenchidos = xs.filter((d) => tem(d, k)).length;
      return { campo: k, nome: NOME_DO_PREENCHIMENTO[k], preenchidos, pct: pct(preenchidos, xs.length), faltou: peca(p, xs.filter((d) => !tem(d, k))) };
    }),
    porPessoa,
  };
}

// =====================================================================
//  O MÊS
// =====================================================================

function fechamento(p: Preparo): MesDoPainel {
  const mesDeHoje = p.hoje.slice(0, 7);
  const primeiro = p.base.reduce<string | null>((m, d) => (!m || d.diaCriado < m ? d.diaCriado : m), null);
  const meses: MesDoPainel['meses'] = [];
  for (let m = mesDeHoje; primeiro && m >= primeiro.slice(0, 7); m = somarMeses(m, -1)) meses.push({ mes: m, nome: nomeDoMes(m) });
  if (!meses.length) meses.push({ mes: mesDeHoje, nome: nomeDoMes(mesDeHoje) });
  // o padrão é o mês passado (o deste mês ainda está pela metade); sem chamado nele, o mais recente
  const pedido = p.f.mes && meses.some((x) => x.mes === p.f.mes) ? p.f.mes : (meses.find((x) => x.mes === somarMeses(mesDeHoje, -1))?.mes ?? meses[0]!.mes);
  const anterior = somarMeses(pedido, -1);
  const doMes = (m: string) => {
    const de = `${m}-01`; const ate = fimDoMes(m);
    const ch = p.base.filter((d) => dentro(d.diaCriado, de, ate));
    const rs = p.base.filter((d) => dentro(d.diaResolvido, de, ate));
    const corte = ateHoje(p, ate);
    const naFila = p.base.filter((d) => d.diaCriado <= corte && !(d.diaResolvido && d.diaResolvido <= corte)).length;
    const conta = prazoDoPeriodo(rs);
    const temDado = !!primeiro && primeiro <= ate;
    return { ch, rs, mediana: mediana(rs.map((d) => d.minResolver ?? 0)), naFila: temDado ? naFila : null, prazo: pctOuNada(conta.solucao.noPrazo, conta.solucao.comPrazo), temDado };
  };
  const a = doMes(pedido); const b = doMes(anterior);
  const ranking = (chave: (d: Derivado) => string | null, n: number) => {
    const ga = contar(a.ch, (d) => { const k = chave(d); return k ? [k] : []; });
    const gb = contar(b.ch, (d) => { const k = chave(d); return k ? [k] : []; });
    return [...ga].map(([rotulo, ds]) => { const ids = ds.map((d) => d.c.id); citar(p, ids); return { rotulo, n: ds.length, antes: gb.get(rotulo)?.length ?? 0, ids }; })
      .sort((x, y) => y.n - x.n || comparar(x.rotulo, y.rotulo)).slice(0, n);
  };
  const porDia: MesDoPainel['porDia'] = [];
  for (let dia = `${pedido}-01`; dia <= fimDoMes(pedido); dia = somarDias(dia, 1)) {
    const ids = a.ch.filter((d) => d.diaCriado === dia).map((d) => d.c.id);
    porDia.push({ dia, n: ids.length, ids });
  }
  const chegaramIds = a.ch.map((d) => d.c.id); const resolvidosIds = a.rs.map((d) => d.c.id);
  citar(p, [...chegaramIds, ...resolvidosIds]);
  const assuntos = ranking(nivelUm, 5);
  const clientesDoMes = ranking((d) => (d.c.clienteId ? nomeCliente(p, d.c.clienteId) : null), 5);
  const tipos = ranking((d) => d.c.tipo, 8);
  // os destaques escritos: o que mais mudou, em frases curtas
  const destaques: string[] = [];
  const nomeAntes = nomeDoMes(anterior).split(' de ')[0];
  if (b.temDado && b.ch.length) {
    const dif = a.ch.length - b.ch.length;
    destaques.push(dif === 0 ? `Chegou o mesmo número de chamados que em ${nomeAntes} (${a.ch.length}).` : `Chegaram ${a.ch.length} chamados, ${Math.abs(dif)} a ${dif > 0 ? 'mais' : 'menos'} que em ${nomeAntes} (${pct(Math.abs(dif), b.ch.length)}%).`);
  } else destaques.push(`Chegaram ${a.ch.length} chamados.`);
  if (a.mediana !== null && b.mediana !== null && b.temDado) {
    destaques.push(a.mediana <= b.mediana
      ? `A mediana até resolver caiu de ${duracaoUtil(b.mediana, p.horasDoDia)} para ${duracaoUtil(a.mediana, p.horasDoDia)} úteis.`
      : `A mediana até resolver subiu de ${duracaoUtil(b.mediana, p.horasDoDia)} para ${duracaoUtil(a.mediana, p.horasDoDia)} úteis.`);
  }
  const subiu = assuntos.filter((x) => x.n > x.antes).sort((x, y) => (y.n - y.antes) - (x.n - x.antes))[0];
  if (subiu && b.temDado && b.ch.length) destaques.push(`O assunto que mais cresceu foi ${subiu.rotulo} (de ${subiu.antes} para ${subiu.n}).`);
  const cheio = [...porDia].sort((x, y) => y.n - x.n)[0];
  if (cheio && cheio.n) destaques.push(`O dia mais cheio foi ${diaCurto(cheio.dia)} (${DIAS_POR_EXTENSO[diaDaSemana(cheio.dia)]}), com ${cheio.n} chamados.`);
  if (a.prazo !== null) destaques.push(`${a.prazo}% foram resolvidos dentro do prazo.`);
  return {
    mes: pedido, nome: nomeDoMes(pedido), anterior, meses,
    chegaram: { agora: a.ch.length, antes: b.temDado ? b.ch.length : null, ids: chegaramIds },
    resolvidos: { agora: a.rs.length, antes: b.temDado ? b.rs.length : null, ids: resolvidosIds },
    mediana: { agora: a.mediana, antes: b.temDado ? b.mediana : null },
    filaNoFim: { agora: a.naFila, antes: b.naFila },
    prazo: { agora: a.prazo, antes: b.temDado ? b.prazo : null },
    porDia, assuntos, clientes: clientesDoMes, tipos, destaques,
  };
}

// =====================================================================
//  TUDO DE UMA VEZ
// =====================================================================

/**
 * Os relatórios que fazem sentido para o painel (o painel sem assunto não tem a aba Assuntos cheia de vazio;
 * o sem etapa de nível não tem a escada "100% no N1"). A etapa de nível que saiu do painel ainda conta: os
 * chamados que passaram por ela continuam nos relatórios.
 */
export function relatoriosAplicaveis(ctx: Pick<ContextoDosRelatorios, 'painel' | 'etapas'>): string[] {
  return CATALOGO_DOS_RELATORIOS.filter((r) => {
    switch (r.precisa) {
      case 'prazo': return ctx.painel.contaPrazo;
      case 'assunto': return ctx.painel.usa.assunto;
      case 'gravidade': return ctx.painel.usa.gravidade && ctx.painel.usa.assunto;
      case 'niveis': return ctx.etapas.some((e) => e.nivel !== null);
      case 'operadoras': return ctx.painel.usa.operadoras;
      default: return true;
    }
  }).map((r) => r.id);
}

/**
 * Os 25 relatórios de um painel de chamados. `chamados`: os do painel, fora da lixeira (os problemas também:
 * o relatório deles os usa, os outros não). O servidor e a prévia chamam esta função com a mesma base.
 */
export function relatoriosDoPainel(chamados: readonly ChamadoParaRelatorios[], ctx: ContextoDosRelatorios, f: FiltroDosRelatorios, agora: Date = new Date()): RelatoriosDoPainel {
  const p = preparar(chamados, ctx, f, agora);
  const primeiroDia = chamados.reduce<string | null>((m, c) => { const d = diaLocal(c.criadoEm); return !m || d < m ? d : m; }, null);
  const r = {
    prazo: prazo(p), relogio: relogio(p), resposta: resposta(p), escada: escada(p), empaca: empaca(p), prioridade: prioridade(p), operadora: operadora(p),
    fila: fila(p), idade: idade(p), calor: calor(p), curva: curva(p), previsao: previsao(p),
    arvore: arvore(p), sobe: sobe(p), gravidade: gravidade(p), pareto: pareto(p), problemas: problemas(p),
    clientes: clientes(p), tamanho: tamanho(p), voltou: voltou(p), falha: falha(p),
    equipe: equipe(p), tempogasto: tempogasto(p), preenchido: preenchido(p),
    fechamento: fechamento(p),
  };
  const linhas: ChamadoDoRelatorio[] = [...p.citados].map((id) => p.porId.get(id)).filter((c): c is ChamadoParaRelatorios => !!c).map((c) => {
    const caminho = caminhoDoAssuntoIds(c.assuntoId, p.assuntos).map((id) => p.assuntos.get(id)?.nome ?? '?');
    return {
      id: c.id, codigo: c.codigo, titulo: c.titulo, situacao: c.situacao, etapa: p.etapas.get(c.etapaId)?.nome ?? '—',
      cliente: c.clienteId ? nomeCliente(p, c.clienteId) : null, responsavel: c.responsavelId ? nomePessoa(p, c.responsavelId) : null,
      prioridade: c.prioridade, assunto: caminho.length ? caminho.join(' › ') : null, criadoEm: c.criadoEm, resolvidoEm: c.resolvidoEm,
    };
  }).sort((a, b) => b.criadoEm.localeCompare(a.criadoEm));
  return {
    painel: { id: ctx.painel.id, nome: ctx.painel.nome, sigla: ctx.painel.sigla },
    periodo: { de: p.de, ate: p.ate, dias: diasEntre(p.de, p.ate) + 1, anterior: p.anterior },
    agora: agora.toISOString(), horasDoDia: p.horasDoDia, primeiroDia,
    aplicaveis: relatoriosAplicaveis(ctx),
    noRecorte: p.base.length,
    chamados: linhas,
    ...r,
  };
}

/** Ajuda dos testes e da prévia: um chamado só com o que importa (o resto vazio). */
export function chamadoParaRelatorios(c: Partial<ChamadoParaRelatorios> & Pick<ChamadoParaRelatorios, 'id' | 'etapaId' | 'criadoEm'>): ChamadoParaRelatorios {
  return {
    codigo: c.id, titulo: c.id, tipoChamado: 'chamado', situacao: 'aberto', respondidoEm: null, resolvidoEm: null, fechadoEm: null, ultimaAtividadeEm: c.criadoEm,
    responsavelId: null, clienteId: null, assuntoId: null, tipo: null, gravidade: null, alcance: null, prioridade: null, prioridadeTrocada: false,
    produtos: [], operadoras: [], etiquetas: [], campos: {}, temSolucao: false, temCausa: false, esperas: [],
    passagens: [{ etapaId: c.etapaId, desde: c.criadoEm, ate: null }], subidas: [], reaberto: 0, origem: 'manual', problemaId: null, repete: [], casos: [], tempos: [],
    ...c,
  };
}

