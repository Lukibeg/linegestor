/**
 * OS CHAMADOS DO GESTOR (decisão 0047, Patch 2.0) — as regras e os formatos.
 *
 * O módulo que substitui o painel de chamados do LineChat: painéis que a administração cria (Suporte,
 * Desenvolvimento, Interno…), etapas editáveis em cada um (N1, N2, N3 e DEV são colunas, a pedido do
 * Luan), o chamado com cada informação no seu lugar (relato do cliente, descrição, solução e
 * causa), o assunto em árvore, a prioridade sugerida pela gravidade e pelo alcance, os prazos, o pai e
 * os filhos (inclusive em outro painel), o problema que junta incidentes, as ligações feitas à mão e o
 * histórico de tudo.
 *
 * Aqui ficam as regras que o servidor e a prévia precisam aplicar igual: o que falta para entrar numa
 * etapa, quando o pai pode fechar, quando um movimento é escalonamento, o que conta como "obrigado" do
 * cliente, as ligações num desenho, a busca e a ordem da lista. Mudou a regra, muda aqui (e o teste).
 */
import { z } from 'zod';
import { numeroWhatsApp, paraBusca, reais } from './formatos.js';
import {
  ALCANCES, ESPERA_PARA_O_PRAZO, GRAVIDADES, NOME_ALCANCE, NOME_ESPERA, NOME_GRAVIDADE, NOME_PRIORIDADE, NOME_SITUACAO_PRAZO, PESO_PRIORIDADE, PRIORIDADES, RegraAgendadoSchema,
  diaLocal, sugestaoPelosCampos,
  type Alcance, type AjustesPrazos, type Espera, type EstadoPrazo, type Gravidade, type Prioridade, type RegraAgendado, type TipoEspera,
} from './atendimento-prazos.js';

// =====================================================================
//  OS CATÁLOGOS
// =====================================================================

/** O que a etapa significa para o chamado (a coluna do quadro). */
export const TIPOS_ETAPA = ['entrada', 'andamento', 'resolvido', 'fechado'] as const;
export type TipoEtapa = (typeof TIPOS_ETAPA)[number];
export const NOME_TIPO_ETAPA: Record<TipoEtapa, string> = {
  entrada: 'Entrada (onde o chamado chega)',
  andamento: 'Em andamento',
  resolvido: 'Resolvido (espera a confirmação)',
  fechado: 'Fechado',
};
export const DICA_TIPO_ETAPA: Record<TipoEtapa, string> = {
  entrada: 'O chamado novo cai aqui, sem dono, até alguém assumir.',
  andamento: 'Alguém está tratando. O prazo de solução continua correndo.',
  resolvido: 'A solução foi dada: o prazo de solução para aqui, e o chamado fecha sozinho se o cliente não responder.',
  fechado: 'Acabou. Pode ter mais de uma (Fechado, Cancelado…).',
};

/**
 * Os níveis do escalonamento: N1, N2, N3 e, depois deles, o DEV (o desenvolvimento: 13/10, o Luan na
 * prévia, "o correto aqui é ter o nível DEV também"). Guardados como número (4 = DEV), para a ordem.
 */
export const NIVEIS = [1, 2, 3, 4] as const;
export type Nivel = (typeof NIVEIS)[number];
export const NOME_DO_NIVEL: Record<Nivel, string> = { 1: 'N1', 2: 'N2', 3: 'N3', 4: 'DEV' };
/** "N2", "DEV"… (vazio sem nível). */
export function rotuloDoNivel(n: number | null | undefined): string {
  return n ? NOME_DO_NIVEL[n as Nivel] ?? `N${n}` : '';
}

/** O campo Tipo responde só "que tratativa foi essa?"; as opções são de cada painel. */
export const TIPOS_PADRAO = ['Incidente', 'Requisição', 'Dúvida', 'Mudança'];

export const TIPOS_CHAMADO = ['chamado', 'problema'] as const;
export type TipoChamado = (typeof TIPOS_CHAMADO)[number];
export const NOME_TIPO_CHAMADO: Record<TipoChamado, string> = { chamado: 'Chamado', problema: 'Problema' };

/** `helena`: a negociação trazida do painel de vendas do Helena (2.0.3, decisão 0054) */
export const ORIGENS = ['manual', 'robo', 'botao', 'agendado', 'api', 'helena'] as const;
export type Origem = (typeof ORIGENS)[number];
export const NOME_ORIGEM: Record<Origem, string> = { manual: 'Aberto no Gestor', robo: 'O robô do LineChat', botao: 'O botão na conversa', agendado: 'Chamado agendado', api: 'Integração (n8n)', helena: 'Trazida do Helena' };

/**
 * O tipo do painel (2.0.1, decisão 0050), como no Helena: **Gestão** (os chamados: prazos, níveis,
 * problema) ou **Vendas** (as negociações do comercial: o valor, o ganho e a perda). Escolhido ao
 * criar o painel; não muda depois.
 */
export const TIPOS_DE_PAINEL = ['gestao', 'vendas'] as const;
export type TipoDePainel = (typeof TIPOS_DE_PAINEL)[number];
export const NOME_TIPO_DE_PAINEL: Record<TipoDePainel, string> = { gestao: 'Gestão', vendas: 'Vendas' };
export const DICA_TIPO_DE_PAINEL: Record<TipoDePainel, string> = {
  gestao: 'Chamados: prazos, níveis (N1, N2, N3), problema, solução e causa.',
  vendas: 'Negociações do comercial: o valor, o ganho e a perda (com o motivo) e o Relatório de Vendas.',
};
/** O fim de uma negociação: as duas etapas finais do painel de Vendas (que fecham o cartão). */
export const RESULTADOS_DA_VENDA = ['ganho', 'perdido'] as const;
export type ResultadoDaVenda = (typeof RESULTADOS_DA_VENDA)[number];
export const NOME_RESULTADO_DA_VENDA: Record<ResultadoDaVenda, string> = { ganho: 'Ganho', perdido: 'Perdido' };

/** As ligações feitas à mão (o pai, o filho e o problema têm o seu próprio lugar). */
export const TIPOS_LIGACAO_CHAMADO = ['relacionado', 'duplicado', 'repete'] as const;
export type TipoLigacaoChamado = (typeof TIPOS_LIGACAO_CHAMADO)[number];
/** Como a ligação se lê de cada lado: "SUP-3 é duplicado de SUP-1" / "SUP-1 tem o duplicado SUP-3". */
export const NOME_LIGACAO: Record<TipoLigacaoChamado, { de: string; para: string }> = {
  relacionado: { de: 'Relacionado a', para: 'Relacionado a' },
  duplicado: { de: 'Duplicado de', para: 'Tem o duplicado' },
  repete: { de: 'Repete', para: 'Repetido em' },
};

/** O que pode ser obrigatório para entrar numa etapa (as regras de cada painel). */
export const CAMPOS_CHAMADO = [
  'cliente', 'contato', 'valor', 'relato', 'descricao', 'assunto', 'tipo', 'gravidade', 'alcance', 'prioridade',
  'produto', 'operadora', 'responsavel', 'solucao', 'causa', 'checklist', 'tempo',
] as const;
export type CampoObrigatorio = (typeof CAMPOS_CHAMADO)[number];
export const NOME_CAMPO: Record<CampoObrigatorio | 'validacao' | 'filhos' | 'motivoPerda', string> = {
  cliente: 'Cliente', contato: 'Contato', valor: 'Mensalidade', relato: 'Relato do cliente', descricao: 'Descrição',
  assunto: 'Assunto', tipo: 'Tipo', gravidade: 'Gravidade', alcance: 'Alcance', prioridade: 'Prioridade', produto: 'Produto', operadora: 'Operadora',
  responsavel: 'Responsável', solucao: 'Solução', causa: 'Causa', checklist: 'O checklist inteiro marcado', tempo: 'O tempo gasto',
  validacao: 'A validação (problema)', filhos: 'Os filhos fechados', motivoPerda: 'O motivo da perda',
};
/** O que só existe num tipo de painel: o valor é da negociação; o resto, do chamado. */
export const CAMPOS_SO_DE_VENDAS: readonly CampoObrigatorio[] = ['valor'];
export const CAMPOS_SO_DE_GESTAO: readonly CampoObrigatorio[] = ['relato', 'gravidade', 'alcance', 'prioridade', 'operadora', 'solucao', 'causa', 'tempo'];
/** O campo vale neste tipo de painel? */
export const campoDoTipo = (tipo: TipoDePainel, c: CampoObrigatorio) => !(tipo === 'vendas' ? CAMPOS_SO_DE_GESTAO : CAMPOS_SO_DE_VENDAS).includes(c);


/** As cores de um painel (as mesmas dos chips do sistema). */
export const CORES_PAINEL = ['accent', 'roxo', 'turquesa', 'signal', 'ok', 'rosa', 'amarelo', 'neutral'] as const;
export type CorPainel = (typeof CORES_PAINEL)[number];

export type ItemChecklist = { id: string; texto: string; feito: boolean; porId: string | null; em: string | null; doAssunto: boolean };

// =====================================================================
//  PAINÉIS E ETAPAS
// =====================================================================

export type EtapaPainel = {
  id: string;
  nome: string;
  tipo: TipoEtapa;
  /** N1, N2, N3, DEV: mover para um nível acima é escalonar (pede o motivo); para um abaixo, voltar de nível */
  nivel: Nivel | null;
  /** o que precisa estar preenchido para o chamado entrar aqui (os campos do sistema e os do painel) */
  obrigatorios: Obrigatorio[];
  /** quem recebe o aviso quando um chamado chega nesta etapa (a fila do N2, o Desenvolvimento…) */
  avisar: string[];
  /** no painel de Vendas: a etapa final que diz como a negociação acabou (Ganho ou Perdido); nas outras, nulo */
  resultado: ResultadoDaVenda | null;
};

export type AjustesDoPainel = {
  /** as opções do campo Tipo */
  tipos: string[];
  /** conta prazo (SLA)? */
  contaPrazo: boolean;
  /** o Resolvido vira Fechado sozinho depois de N dias úteis sem resposta (nulo = nunca) */
  fecharSozinhoDias: number | null;
  /** o que precisa para abrir */
  obrigatoriosAoAbrir: Obrigatorio[];
  /** o pai só resolve e fecha com os filhos fechados (e diz quais faltam) */
  paiEsperaFilhos: boolean;
  /** quem recebe o que vence, o que fica sem dono e o que chega Crítico */
  supervisores: string[];
  /** os campos do sistema que este painel não usa (um painel sem assuntos, por exemplo) */
  camposDesligados: CampoDoSistema[];
  /** no painel de Vendas: os motivos de perda que a equipe escolhe ao marcar Perdido */
  motivosDePerda: string[];
  /** no painel de Vendas: a meta de cada mês, em centavos (nulo = sem meta) */
  metaMensal: number | null;
};

export type Painel = {
  id: string;
  nome: string;
  /** a sigla do código (SUP-12): 2 a 5 letras, única */
  sigla: string;
  descricao: string | null;
  cor: CorPainel;
  /** Gestão (os chamados) ou Vendas (as negociações do comercial) */
  tipo: TipoDePainel;
  ordem: number;
  /** todos com acesso aos chamados veem; ou só as pessoas escolhidas (um painel Interno, Administrativo…) */
  acesso: 'todos' | 'escolhidos';
  pessoas: string[];
  ajustes: AjustesDoPainel;
  etapas: EtapaPainel[];
  ativo: boolean;
  /** quantos chamados abertos (o número da aba) */
  abertos: number;
};

/**
 * O painel novo (e o que foi gravado antes de existir a escolha) nasce sem o alcance: "não precisa
 * desse alcance por enquanto" (o Luan, na prévia). Liga em Painéis › Ajustes › Campos.
 */
export const AJUSTES_PAINEL_PADRAO: AjustesDoPainel = {
  tipos: TIPOS_PADRAO, contaPrazo: true, fecharSozinhoDias: 3, obrigatoriosAoAbrir: [], paiEsperaFilhos: true, supervisores: [], camposDesligados: ['alcance'],
  motivosDePerda: [], metaMensal: null,
};

/** Os motivos de perda com que o painel de Vendas nasce (a equipe muda nos Ajustes do painel). */
export const MOTIVOS_DE_PERDA_PADRAO = [
  'Preço', 'Fechou com a concorrência', 'Sem retorno do cliente', 'Adiou a decisão', 'Sem orçamento', 'Não atende o que precisa', 'Outro',
];
/**
 * O painel de Vendas nasce sem prazo (a negociação não tem SLA), sem fechar sozinho e só com os campos do
 * sistema que fazem sentido numa venda (os produtos; o assunto, o tipo, a gravidade, o alcance e a
 * operadora ficam desligados — dá para ligar em Ajustes › Campos).
 */
export const AJUSTES_DO_PAINEL_DE_VENDAS: AjustesDoPainel = {
  ...AJUSTES_PAINEL_PADRAO, tipos: ['Novo cliente', 'Mais produtos (cliente da base)', 'Renovação'], contaPrazo: false, fecharSozinhoDias: null,
  paiEsperaFilhos: false, camposDesligados: ['assunto', 'tipo', 'gravidade', 'alcance', 'operadoras'], motivosDePerda: MOTIVOS_DE_PERDA_PADRAO,
};
/**
 * As etapas com que o painel de Vendas nasce: o funil (o lead, a qualificação, a proposta, a negociação)
 * e as duas finais, Ganho e Perdido. A equipe renomeia, inclui e muda a ordem do funil; as finais não
 * saem (podem mudar de nome). O Ganho pede o valor; o Perdido, o motivo (sempre).
 */
export const ETAPAS_DO_PAINEL_DE_VENDAS: Array<Pick<EtapaPainel, 'nome' | 'tipo' | 'nivel' | 'obrigatorios' | 'resultado'>> = [
  { nome: 'Lead', tipo: 'entrada', nivel: null, obrigatorios: [], resultado: null },
  { nome: 'Qualificação', tipo: 'andamento', nivel: null, obrigatorios: [], resultado: null },
  { nome: 'Proposta enviada', tipo: 'andamento', nivel: null, obrigatorios: ['valor'], resultado: null },
  { nome: 'Negociação', tipo: 'andamento', nivel: null, obrigatorios: ['valor'], resultado: null },
  { nome: 'Ganho', tipo: 'fechado', nivel: null, obrigatorios: ['valor'], resultado: 'ganho' },
  { nome: 'Perdido', tipo: 'fechado', nivel: null, obrigatorios: [], resultado: 'perdido' },
];

/**
 * Os campos com que o painel de Vendas nasce: os do painel Ingline - Comercial do Helena (o print do Luan,
 * em 17/10: "vc n colocou esses campos personalizados aqui, só n precisa colocar o do área de atuação").
 * São campos do painel como os outros: a equipe muda o nome, as opções e a ordem, desativa e inclui em
 * Ajustes › Campos.
 */
export const CAMPOS_DO_PAINEL_DE_VENDAS: ReadonlyArray<{ nome: string; tipo: TipoCampo; dica: string; opcoes: string[]; incluirNaHora?: boolean }> = [
  { nome: 'CNPJ', tipo: 'texto', dica: 'O CNPJ da empresa (o de quem já é cliente também está no cadastro).', opcoes: [] },
  { nome: 'Contatos principais', tipo: 'texto_longo', dica: 'Quem decide e quem vai usar: o nome, o cargo e o telefone de cada um.', opcoes: [] },
  {
    nome: 'Origem de lead', tipo: 'lista', dica: 'Por onde a empresa chegou até a Ingline.',
    opcoes: ['Indicação', 'Site', 'Instagram', 'Google', 'WhatsApp', 'Evento', 'Prospecção ativa', 'Cliente da base'],
  },
  // a Indicação é uma lista que cresce no próprio formulário (2.0.3: "a indicação tem q ser predefinido e eu tenho que
  // conseguir criar por aqui mesmo se quiser"); até o 2.0.2 era texto (a migração 0023 passou a de cada painel para lista)
  { nome: 'Indicação', tipo: 'lista', dica: 'Quem indicou: a pessoa ou a empresa. Não está na lista? Escreva o nome e inclua.', opcoes: [], incluirNaHora: true },
];

/** Os ajustes guardados podem ser de antes de um campo novo: completa com o padrão. */
export function ajustesDoPainelCompletos(v: Partial<AjustesDoPainel> | null | undefined): AjustesDoPainel {
  return { ...AJUSTES_PAINEL_PADRAO, ...(v ?? {}) };
}

type EtapaInicial = Omit<EtapaPainel, 'id' | 'avisar' | 'resultado'> & { chave: string };
const CLASSIFICADO: CampoObrigatorio[] = ['cliente', 'relato', 'assunto', 'tipo', 'gravidade'];
/**
 * Os painéis com que o módulo nasce. O Suporte segue a escolha do Luan: N1, N2, N3 e DEV como colunas
 * (marcadas como nível, para o escalonamento e a trajetória), mais Novo, Em observação, Resolvido e
 * Fechado. O DEV é o chamado com o desenvolvimento (a correção em si pode andar num filho, no painel
 * Desenvolvimento). As etapas são da equipe: dá para criar, renomear, tirar e mudar a ordem.
 */
export const PAINEIS_INICIAIS: Array<{ chave: string; nome: string; sigla: string; descricao: string; cor: CorPainel; ajustes: AjustesDoPainel; etapas: EtapaInicial[] }> = [
  {
    chave: 'suporte', nome: 'Suporte', sigla: 'SUP', descricao: 'O suporte técnico aos clientes (o antigo Ingline - Suporte).', cor: 'accent',
    ajustes: { ...AJUSTES_PAINEL_PADRAO },
    etapas: [
      { chave: 'novo', nome: 'Novo', tipo: 'entrada', nivel: null, obrigatorios: [] },
      { chave: 'n1', nome: 'N1', tipo: 'andamento', nivel: 1, obrigatorios: ['cliente', 'relato'] },
      { chave: 'n2', nome: 'N2', tipo: 'andamento', nivel: 2, obrigatorios: ['cliente', 'relato', 'assunto'] },
      { chave: 'n3', nome: 'N3', tipo: 'andamento', nivel: 3, obrigatorios: ['cliente', 'relato', 'assunto'] },
      { chave: 'dev', nome: 'DEV', tipo: 'andamento', nivel: 4, obrigatorios: ['cliente', 'relato', 'assunto'] },
      { chave: 'observacao', nome: 'Em observação', tipo: 'andamento', nivel: null, obrigatorios: ['cliente', 'relato', 'assunto', 'solucao'] },
      { chave: 'resolvido', nome: 'Resolvido', tipo: 'resolvido', nivel: null, obrigatorios: [...CLASSIFICADO, 'solucao', 'causa'] },
      { chave: 'fechado', nome: 'Fechado', tipo: 'fechado', nivel: null, obrigatorios: [...CLASSIFICADO, 'solucao', 'causa'] },
    ],
  },
  {
    chave: 'desenvolvimento', nome: 'Desenvolvimento', sigla: 'DEV', descricao: 'O que precisa de programação: correções e melhorias pedidas pelo suporte.', cor: 'roxo',
    ajustes: { ...AJUSTES_PAINEL_PADRAO, contaPrazo: false, fecharSozinhoDias: null, tipos: ['Correção', 'Melhoria', 'Configuração', 'Análise'] },
    etapas: [
      { chave: 'novo', nome: 'Novo', tipo: 'entrada', nivel: null, obrigatorios: [] },
      { chave: 'analise', nome: 'Em análise', tipo: 'andamento', nivel: null, obrigatorios: ['relato'] },
      { chave: 'desenvolvimento', nome: 'Em desenvolvimento', tipo: 'andamento', nivel: null, obrigatorios: ['relato'] },
      { chave: 'teste', nome: 'Em teste', tipo: 'andamento', nivel: null, obrigatorios: ['relato'] },
      { chave: 'entregue', nome: 'Entregue', tipo: 'resolvido', nivel: null, obrigatorios: ['relato', 'solucao'] },
      { chave: 'fechado', nome: 'Fechado', tipo: 'fechado', nivel: null, obrigatorios: ['relato', 'solucao'] },
    ],
  },
];

/** A etapa em que o chamado novo cai: a primeira de entrada (ou a primeira de todas). */
export function etapaDeEntrada(etapas: EtapaPainel[]): EtapaPainel | null {
  return etapas.find((e) => e.tipo === 'entrada') ?? etapas[0] ?? null;
}
/** Para onde o "Assumir" leva o chamado que está na entrada: a primeira etapa de andamento depois dela. */
export function etapaAoAssumir(etapas: EtapaPainel[], atual: string): EtapaPainel | null {
  const i = etapas.findIndex((e) => e.id === atual);
  if (i < 0 || etapas[i]!.tipo !== 'entrada') return null;
  return etapas.slice(i + 1).find((e) => e.tipo === 'andamento') ?? null;
}
/** Para onde o "Reabrir" leva: a primeira etapa de andamento (o N1, no Suporte). */
export function etapaAoReabrir(etapas: EtapaPainel[]): EtapaPainel | null {
  return etapas.find((e) => e.tipo === 'andamento') ?? etapaDeEntrada(etapas);
}
export function situacaoDaEtapa(tipo: TipoEtapa): SituacaoDoChamado {
  return tipo === 'fechado' ? 'fechado' : tipo === 'resolvido' ? 'resolvido' : 'aberto';
}
export type SituacaoDoChamado = 'aberto' | 'resolvido' | 'fechado';
export const NOME_SITUACAO_CHAMADO: Record<SituacaoDoChamado, string> = { aberto: 'Em aberto', resolvido: 'Resolvido', fechado: 'Fechado' };

/** Mover para um nível acima é escalonar; para um abaixo, voltar de nível. Os dois pedem o motivo. */
export function movimentoDeNivel(de: Pick<EtapaPainel, 'nivel'> | null | undefined, para: Pick<EtapaPainel, 'nivel'> | null | undefined): 'sobe' | 'desce' | null {
  if (!de?.nivel || !para?.nivel || de.nivel === para.nivel) return null;
  return para.nivel > de.nivel ? 'sobe' : 'desce';
}

// =====================================================================
//  OS CAMPOS DE CADA PAINEL (o pedido do Luan na prévia: "vou ter outros painéis, então nem sempre
//  vai ser assuntos")
// =====================================================================

/**
 * Os campos que já vêm com o módulo e que cada painel liga ou desliga. Desligado, o campo some da
 * ficha, do Abrir chamado, do cartão e da lista daquele painel e deixa de ser pedido nas regras; o que
 * já estava preenchido fica guardado (volta se o campo for ligado de novo). O resto do chamado (cliente,
 * contato, relato, descrição, prioridade, responsável, solução, causa, etiquetas) está em todo painel:
 * é o próprio chamado.
 */
export const CAMPOS_DO_SISTEMA = ['assunto', 'tipo', 'gravidade', 'alcance', 'produtos', 'operadoras'] as const;
export type CampoDoSistema = (typeof CAMPOS_DO_SISTEMA)[number];
export const NOME_CAMPO_DO_SISTEMA: Record<CampoDoSistema, string> = {
  assunto: 'Assunto', tipo: 'Tipo', gravidade: 'Gravidade', alcance: 'Alcance', produtos: 'Produtos', operadoras: 'Operadoras',
};
export const DICA_CAMPO_DO_SISTEMA: Record<CampoDoSistema, string> = {
  assunto: 'A árvore de assuntos (até 3 níveis), com a descrição, o checklist e o de-para de cada um.',
  tipo: '"Que tratativa foi essa?": as opções são deste painel.',
  gravidade: 'Quanto o problema pesa (de Inoperância a Não se aplica). Sugere a prioridade (Ajustes › Prazos).',
  alcance: 'Quantos o problema atinge no cliente (a empresa toda, um setor, uma pessoa). Com a gravidade, sugere a prioridade.',
  produtos: 'Os do cliente aparecem primeiro; os outros vêm do catálogo.',
  operadoras: 'As dos circuitos do cliente aparecem primeiro.',
};
/** O que deixa de ser pedido quando o campo é desligado. */
export const OBRIGATORIOS_DO_CAMPO: Record<CampoDoSistema, CampoObrigatorio[]> = {
  assunto: ['assunto'], tipo: ['tipo'], gravidade: ['gravidade'], alcance: ['alcance'], produtos: ['produto'], operadoras: ['operadora'],
};
export const campoLigado = (ajustes: Pick<AjustesDoPainel, 'camposDesligados'>, c: CampoDoSistema) => !ajustes.camposDesligados.includes(c);
/**
 * A prioridade que o painel sugere, pelos campos que ele usa: com a gravidade e o alcance, a matriz;
 * só com a gravidade, a coluna "Só a gravidade" (Ajustes › Prazos); sem a gravidade, nenhuma.
 */
export function prioridadeSugeridaDoPainel(
  ajustes: Pick<AjustesDoPainel, 'camposDesligados'>, gravidade: Gravidade | null | undefined, alcance: Alcance | null | undefined,
  prazos: Pick<AjustesPrazos, 'matriz'> & Partial<Pick<AjustesPrazos, 'semAlcance'>>,
): Prioridade | null {
  return sugestaoPelosCampos({ gravidade: campoLigado(ajustes, 'gravidade'), alcance: campoLigado(ajustes, 'alcance') }, gravidade, alcance, prazos);
}

/** Os campos que quem cuida dos chamados cria em cada painel. O tipo não muda depois de criado. */
export const TIPOS_CAMPO = ['texto', 'texto_longo', 'numero', 'data', 'sim_nao', 'lista', 'lista_varios'] as const;
export type TipoCampo = (typeof TIPOS_CAMPO)[number];
export const NOME_TIPO_CAMPO: Record<TipoCampo, string> = {
  texto: 'Texto curto', texto_longo: 'Texto longo', numero: 'Número', data: 'Data', sim_nao: 'Sim ou não',
  lista: 'Lista (escolhe uma opção)', lista_varios: 'Lista (escolhe várias)',
};
export const DICA_TIPO_CAMPO: Record<TipoCampo, string> = {
  texto: 'Uma linha (até 300 letras): um protocolo, uma versão, um número de série.',
  texto_longo: 'Várias linhas; na ficha, fica junto do relato e da descrição.',
  numero: 'Só número (aceita vírgula).',
  data: 'Um dia, como a previsão de entrega.',
  sim_nao: 'Sim ou não (fica vazio até alguém responder).',
  lista: 'Uma das opções que você escrever.',
  lista_varios: 'Uma ou mais das opções que você escrever.',
};
export const ehLista = (t: TipoCampo) => t === 'lista' || t === 'lista_varios';
export const MAX_CAMPOS_DO_PAINEL = 30;
export const MAX_OPCOES_DO_CAMPO = 50;
/** Até quantas letras cabem no texto curto e no longo. */
export const MAX_LETRAS_DO_CAMPO = { texto: 300, texto_longo: 5000 } as const;

export type OpcaoDoCampo = { id: string; nome: string; ativa: boolean };
export type CampoPersonalizado = {
  id: string;
  painelId: string;
  nome: string;
  tipo: TipoCampo;
  /** a explicação que aparece embaixo do campo (na ficha e no Abrir chamado) */
  dica: string | null;
  /** as opções, só nas listas (a que sai fica desativada: o chamado que já a tem continua com ela) */
  opcoes: OpcaoDoCampo[];
  /** desativado, some da ficha e do Abrir chamado; o que já foi preenchido fica guardado */
  ativo: boolean;
  ordem: number;
  /**
   * Na lista de uma opção: quem trabalha no painel inclui uma opção nova ali mesmo, no Abrir chamado e na ficha
   * (2.0.3, a Indicação: "a indicação tem q ser predefinido e eu tenho que conseguir criar por aqui mesmo").
   */
  incluirNaHora: boolean;
};
/** O valor de um campo no chamado: texto, número, sim/não, a data (AAAA-MM-DD) ou o id das opções. */
export type ValorDoCampo = string | number | boolean | string[];
/** Os valores dos campos do painel num chamado, pelo id do campo. */
export type ValoresDosCampos = Record<string, ValorDoCampo>;

/** Nas regras (o que é obrigatório), o campo do painel aparece como "campo:<id>", ao lado dos do sistema. */
export type ChaveDeCampo = `campo:${string}`;
export type Obrigatorio = CampoObrigatorio | ChaveDeCampo;
export const chaveDoCampo = (id: string): ChaveDeCampo => `campo:${id}`;
export const idDaChave = (k: string): string | null => (k.startsWith('campo:') ? k.slice(6) : null);

/**
 * O que pode ser pedido num painel, na ordem da ficha: os campos do sistema que ele usa (sem o assunto,
 * se o assunto está desligado) e os campos dele que estão ativos.
 */
export function obrigatoriosDoPainel(ajustes: Pick<AjustesDoPainel, 'camposDesligados'>, campos: Array<Pick<CampoPersonalizado, 'id' | 'ativo'>>, tipo: TipoDePainel = 'gestao'): Obrigatorio[] {
  const fora = new Set<string>(ajustes.camposDesligados.flatMap((c) => OBRIGATORIOS_DO_CAMPO[c]));
  return [...CAMPOS_CHAMADO.filter((c) => !fora.has(c) && campoDoTipo(tipo, c)), ...campos.filter((c) => c.ativo).map((c) => chaveDoCampo(c.id))];
}
/** Só o que vale no painel, sem repetir e na ordem da ficha (o que não pode ser pedido lá sai). */
export function limparObrigatorios(xs: readonly string[], validos: readonly Obrigatorio[]): Obrigatorio[] {
  const pedidos = new Set(xs);
  return validos.filter((v) => pedidos.has(v));
}
/**
 * O nome que um campo do painel não pode ter: o de um campo que todo chamado já tem (Cliente, Solução…)
 * ou o de um campo do sistema que o painel usa (com o Assunto desligado, "Assunto" pode ser um campo do
 * painel). Devolve o nome do campo do sistema que bate, ou nulo.
 */
export function nomeDoSistemaIgual(nome: string, ajustes: Pick<AjustesDoPainel, 'camposDesligados'>, tipo: TipoDePainel = 'gestao'): string | null {
  const fora = new Set<string>(ajustes.camposDesligados.flatMap((c) => OBRIGATORIOS_DO_CAMPO[c]));
  const nomes = [
    'Título', 'Etiquetas', 'Checklist', 'Tempo gasto', 'Solução de contorno', 'Validação',
    ...(tipo === 'vendas' ? ['Empresa', 'Motivo da perda'] : []),
    ...CAMPOS_CHAMADO.filter((c) => !fora.has(c) && campoDoTipo(tipo, c)).map((c) => NOME_CAMPO[c]),
    ...CAMPOS_DO_SISTEMA.filter((c) => !ajustes.camposDesligados.includes(c)).map((c) => NOME_CAMPO_DO_SISTEMA[c]),
  ];
  return nomes.find((n) => paraBusca(n) === paraBusca(nome)) ?? null;
}

/** O nome de um obrigatório para a tela e as mensagens ("Assunto", "Versão publicada"). */
export function nomeDoObrigatorio(k: string, campos: ReadonlyArray<Pick<CampoPersonalizado, 'id' | 'nome'>> = []): string {
  const id = idDaChave(k);
  if (id) return campos.find((c) => c.id === id)?.nome ?? 'um campo do painel';
  return NOME_CAMPO[k as keyof typeof NOME_CAMPO] ?? k;
}

/** Tem valor? (o zero e o "não" contam como respondidos; o texto em branco e a lista vazia, não) */
export function valorPreenchido(v: unknown): boolean {
  if (v === null || v === undefined) return false;
  if (typeof v === 'string') return v.trim().length > 0;
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === 'number') return Number.isFinite(v);
  return typeof v === 'boolean';
}

const DATA_ISO = /^(\d{4})-(\d{2})-(\d{2})$/;
const DATA_BR = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;
const diaExiste = (a: number, m: number, d: number) => {
  const x = new Date(Date.UTC(a, m - 1, d));
  return a >= 1900 && a <= 2200 && x.getUTCFullYear() === a && x.getUTCMonth() === m - 1 && x.getUTCDate() === d;
};
const SIM = new Set(['sim', 's', 'true', '1', 'yes', 'y', 'verdadeiro']);
const NAO = new Set(['nao', 'n', 'false', '0', 'no', 'falso']);

export type ValorConferido = { ok: true; valor: ValorDoCampo | null } | { ok: false; erro: string };

/**
 * Confere e arruma o valor de um campo (o que vem da tela, do n8n ou do robô): o número com vírgula, a
 * data em dia/mês/ano, o "sim" escrito, a opção da lista pelo id ou pelo nome. Vazio vale como "tirar o
 * valor". A opção desativada só fica se o chamado já estava com ela (`atual`).
 */
export function normalizarValorDoCampo(campo: Pick<CampoPersonalizado, 'nome' | 'tipo' | 'opcoes'>, v: unknown, atual: ValorDoCampo | null = null): ValorConferido {
  const erro = (m: string): ValorConferido => ({ ok: false, erro: `${campo.nome}: ${m}` });
  if (v === null || v === undefined || (typeof v === 'string' && !v.trim()) || (Array.isArray(v) && !v.length)) return { ok: true, valor: null };
  switch (campo.tipo) {
    case 'texto':
    case 'texto_longo': {
      if (typeof v !== 'string' && typeof v !== 'number') return erro('escreva um texto');
      const s = String(v).replace(/\r\n?/g, '\n').trim();
      const max = MAX_LETRAS_DO_CAMPO[campo.tipo];
      if (s.length > max) return erro(`vai até ${max} letras`);
      return { ok: true, valor: campo.tipo === 'texto' ? s.replace(/\s*\n\s*/g, ' ') : s };
    }
    case 'numero': {
      let n = Number.NaN;
      if (typeof v === 'number') n = v;
      else if (typeof v === 'string') {
        const s = v.trim().replace(/\s/g, '');
        // "1.234,5" (do jeito brasileiro) e "1234.5"
        n = Number(s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s);
      }
      if (!Number.isFinite(n) || Math.abs(n) > 1e12) return erro('escreva um número');
      return { ok: true, valor: n };
    }
    case 'data': {
      if (typeof v !== 'string') return erro('escreva a data (dia/mês/ano)');
      const s = v.trim();
      const iso = DATA_ISO.exec(s.slice(0, 10));
      if (iso && diaExiste(Number(iso[1]), Number(iso[2]), Number(iso[3]))) return { ok: true, valor: `${iso[1]}-${iso[2]}-${iso[3]}` };
      const br = DATA_BR.exec(s);
      if (br && diaExiste(Number(br[3]), Number(br[2]), Number(br[1]))) return { ok: true, valor: `${br[3]}-${br[2]!.padStart(2, '0')}-${br[1]!.padStart(2, '0')}` };
      return erro('escreva a data (dia/mês/ano)');
    }
    case 'sim_nao': {
      if (typeof v === 'boolean') return { ok: true, valor: v };
      const s = paraBusca(String(v)).trim();
      if (SIM.has(s)) return { ok: true, valor: true };
      if (NAO.has(s)) return { ok: true, valor: false };
      return erro('responda sim ou não');
    }
    case 'lista':
    case 'lista_varios': {
      const pedidos: unknown[] | null = Array.isArray(v) ? v : typeof v === 'string' ? (campo.tipo === 'lista_varios' ? v.split(/[;\n]/) : [v]) : null;
      if (!pedidos || pedidos.some((x) => typeof x !== 'string')) return erro('escolha uma das opções');
      const ja = new Set(Array.isArray(atual) ? atual : typeof atual === 'string' ? [atual] : []);
      const ids: string[] = [];
      for (const bruto of pedidos as string[]) {
        const t = bruto.trim();
        if (!t) continue;
        const o = campo.opcoes.find((x) => x.id === t) ?? campo.opcoes.find((x) => paraBusca(x.nome) === paraBusca(t));
        if (!o || (!o.ativa && !ja.has(o.id))) {
          const ativas = campo.opcoes.filter((x) => x.ativa).map((x) => x.nome);
          return erro(`"${t}" não é uma das opções${ativas.length ? ` (${ativas.join(', ')})` : ''}`);
        }
        if (!ids.includes(o.id)) ids.push(o.id);
      }
      if (!ids.length) return { ok: true, valor: null };
      if (campo.tipo === 'lista' && ids.length > 1) return erro('escolha uma opção só');
      return { ok: true, valor: campo.tipo === 'lista' ? ids[0]! : ids };
    }
    default:
      return erro('tipo de campo desconhecido');
  }
}

/** O valor como se lê: "Sim", "12/10/2026", "1.234,5", os nomes das opções. Vazio = "". */
export function textoDoValor(campo: Pick<CampoPersonalizado, 'tipo' | 'opcoes'>, v: ValorDoCampo | null | undefined): string {
  if (!valorPreenchido(v)) return '';
  switch (campo.tipo) {
    case 'numero': return typeof v === 'number' ? v.toLocaleString('pt-BR', { maximumFractionDigits: 6 }) : String(v);
    case 'data': { const m = DATA_ISO.exec(String(v)); return m ? `${m[3]}/${m[2]}/${m[1]}` : String(v); }
    case 'sim_nao': return v === true ? 'Sim' : v === false ? 'Não' : String(v);
    case 'lista':
    case 'lista_varios': {
      const ids = Array.isArray(v) ? v : [String(v)];
      return ids.map((id) => campo.opcoes.find((o) => o.id === id)?.nome ?? '(opção que saiu)').join(', ');
    }
    default: return String(v);
  }
}

/** Os valores dos campos ativos, como se leem (para a busca da lista). */
export function textosDosCampos(campos: ReadonlyArray<Pick<CampoPersonalizado, 'id' | 'tipo' | 'opcoes' | 'ativo'>>, valores: ValoresDosCampos): string[] {
  return campos.filter((c) => c.ativo).map((c) => textoDoValor(c, valores[c.id])).filter(Boolean);
}

/** Os valores que o chamado mostra: só os dos campos ativos do painel dele (o resto fica guardado). */
export function valoresVisiveis(campos: ReadonlyArray<Pick<CampoPersonalizado, 'id' | 'painelId' | 'ativo'>>, painelId: string, valores: ValoresDosCampos | null | undefined): ValoresDosCampos {
  const out: ValoresDosCampos = {};
  for (const c of campos) if (c.painelId === painelId && c.ativo && valorPreenchido(valores?.[c.id])) out[c.id] = valores![c.id]!;
  return out;
}

/**
 * Acha o campo do painel pelo id ou pelo nome (o n8n e o robô podem mandar "Versão publicada" em vez do
 * id), sem ligar para maiúscula e acento.
 */
export function acharCampo<T extends Pick<CampoPersonalizado, 'id' | 'nome'>>(campos: readonly T[], chave: string): T | undefined {
  const k = chave.trim();
  return campos.find((c) => c.id === k) ?? campos.find((c) => paraBusca(c.nome) === paraBusca(k));
}

/** O mesmo valor? (a ordem das opções marcadas não conta) */
export function mesmoValorDoCampo(a: ValorDoCampo | null | undefined, b: ValorDoCampo | null | undefined): boolean {
  const norm = (v: ValorDoCampo | null | undefined) => (!valorPreenchido(v) ? null : Array.isArray(v) ? [...v].sort() : v);
  return JSON.stringify(norm(a)) === JSON.stringify(norm(b));
}

/**
 * Os campos que vieram num pedido (abrir ou mudar o chamado), conferidos contra os campos do painel: o
 * campo existe (pelo id ou pelo nome) e está ativo, e o valor serve (`normalizarValorDoCampo`). O
 * servidor e a prévia leem igual, com as mesmas mensagens.
 */
export function lerCamposDoPedido(
  doPainel: readonly CampoPersonalizado[], painelNome: string, pedidos: Record<string, unknown>, atuais: ValoresDosCampos = {},
): { ok: true; itens: Array<{ campo: CampoPersonalizado; valor: ValorDoCampo | null }> } | { ok: false; erro: string } {
  const itens: Array<{ campo: CampoPersonalizado; valor: ValorDoCampo | null }> = [];
  for (const [chave, v] of Object.entries(pedidos)) {
    const c = acharCampo(doPainel, chave);
    if (!c) return { ok: false, erro: `O painel ${painelNome} não tem o campo "${chave}".` };
    if (!c.ativo) return { ok: false, erro: `O campo ${c.nome} foi desativado no painel ${painelNome}.` };
    if (itens.some((i) => i.campo.id === c.id)) return { ok: false, erro: `O campo ${c.nome} veio duas vezes.` };
    const r = normalizarValorDoCampo(c, v, atuais[c.id] ?? null);
    if (!r.ok) return { ok: false, erro: r.erro };
    itens.push({ campo: c, valor: r.valor });
  }
  return { ok: true, itens };
}

// =====================================================================
//  O CÓDIGO DO CHAMADO E AS REFERÊNCIAS NO TEXTO
// =====================================================================

export const SiglaSchema = z.string().trim().toUpperCase().regex(/^[A-Z]{2,5}$/, 'A sigla tem de 2 a 5 letras, sem acento (ex.: SUP)');
export const codigoDoChamado = (sigla: string, numero: number) => `${sigla}-${numero}`;
/** "sup-12", "SUP 12", "SUP-12" → { sigla: 'SUP', numero: 12 }. */
export function lerCodigo(t: string | null | undefined): { sigla: string; numero: number } | null {
  const m = /^\s*([A-Za-z]{2,5})[\s-]*(\d{1,7})\s*$/.exec(t ?? '');
  return m ? { sigla: m[1]!.toUpperCase(), numero: Number(m[2]) } : null;
}

/** Códigos escritos no texto: os do Gestor (SUP-12) e os do LineChat antigo (IS-4280). */
const REFERENCIA = /\b([A-Z]{2,5})-(\d{1,7})\b/g;
export function referenciasNoTexto(...textos: Array<string | null | undefined>): string[] {
  const vistos = new Set<string>();
  for (const t of textos) for (const m of (t ?? '').matchAll(REFERENCIA)) vistos.add(`${m[1]}-${m[2]}`);
  return [...vistos];
}
/** O texto em pedaços, com as referências separadas (a tela as transforma em link). */
export function pedacosComReferencias(t: string): Array<{ texto: string } | { codigo: string }> {
  const out: Array<{ texto: string } | { codigo: string }> = [];
  let ultimo = 0;
  for (const m of t.matchAll(REFERENCIA)) {
    if (m.index! > ultimo) out.push({ texto: t.slice(ultimo, m.index) });
    out.push({ codigo: m[0] });
    ultimo = m.index! + m[0].length;
  }
  if (ultimo < t.length) out.push({ texto: t.slice(ultimo) });
  return out;
}

// =====================================================================
//  AS CITAÇÕES NAS ANOTAÇÕES (@)
// =====================================================================

/** Uma letra sem acento e minúscula: o nome citado não liga para acento nem maiúscula. */
const letraDeBusca = (c: string) => c.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const ehLetra = (c: string | undefined) => !!c && /[\p{L}\p{N}]/u.test(c);
const nomeLimpo = (n: string) => n.trim().replace(/\s+/g, ' ');

export type CitacaoNoTexto = { id: string; nome: string; inicio: number; fim: number };

/**
 * As citações de uma anotação (13/10, o pedido do Luan na prévia: "citar colegas nos comentários, e
 * nesse momento eles recebem notificação, sem necessariamente serem observadores"): o "@" seguido do
 * nome de alguém da lista — o nome inteiro ("@Bruno Teixeira") ou só o primeiro, quando só uma pessoa
 * da lista se chama assim ("@Bruno"). Maiúscula e acento não importam, e o nome mais comprido ganha.
 * O "@" grudado numa palavra (o e-mail fulano@empresa.com) não é citação.
 */
export function citacoesNoTexto(texto: string, pessoas: ReadonlyArray<{ id: string; nome: string }>): CitacaoNoTexto[] {
  if (!texto.includes('@') || !pessoas.length) return [];
  const comOPrimeiro = new Map<string, number>();
  for (const p of pessoas) {
    const k = paraBusca(nomeLimpo(p.nome).split(' ')[0]);
    comOPrimeiro.set(k, (comOPrimeiro.get(k) ?? 0) + 1);
  }
  const alvo = (n: string) => [...n].map(letraDeBusca).join('');
  const candidatos = pessoas.flatMap((p) => {
    const nome = nomeLimpo(p.nome);
    const primeiro = nome.split(' ')[0]!;
    const xs = [{ p, alvo: alvo(nome) }];
    if (primeiro !== nome && comOPrimeiro.get(paraBusca(primeiro)) === 1) xs.push({ p, alvo: alvo(primeiro) });
    return xs;
  }).filter((c) => c.alvo).sort((a, b) => b.alvo.length - a.alvo.length);
  const achadas: CitacaoNoTexto[] = [];
  for (let i = 0; i < texto.length; i++) {
    if (texto[i] !== '@' || ehLetra(texto[i - 1])) continue;
    for (const c of candidatos) {
      const fim = i + 1 + c.alvo.length;
      if (fim > texto.length || ehLetra(texto[fim])) continue;
      if (alvo(texto.slice(i + 1, fim)) !== c.alvo) continue;
      achadas.push({ id: c.p.id, nome: nomeLimpo(c.p.nome), inicio: i, fim });
      i = fim - 1;
      break;
    }
  }
  return achadas;
}

/** "Bruno", "Bruno e Marina", "Bruno, Marina e Lúcio". */
export function emLista(xs: string[]): string {
  return xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} e ${xs[xs.length - 1]}`;
}

/** Quem a anotação cita: cada pessoa uma vez, na ordem em que aparece. */
export function citadosNoTexto(texto: string, pessoas: ReadonlyArray<{ id: string; nome: string }>): PessoaCurta[] {
  const vistos = new Set<string>();
  const out: PessoaCurta[] = [];
  for (const c of citacoesNoTexto(texto, pessoas)) if (!vistos.has(c.id)) { vistos.add(c.id); out.push({ id: c.id, nome: c.nome }); }
  return out;
}

/** O texto em pedaços: o que é citação (a tela destaca) e o que não é. */
export function pedacosComCitacoes(texto: string, pessoas: ReadonlyArray<{ id: string; nome: string }>): Array<{ texto: string; citado?: PessoaCurta }> {
  const out: Array<{ texto: string; citado?: PessoaCurta }> = [];
  let ultimo = 0;
  for (const c of citacoesNoTexto(texto, pessoas)) {
    if (c.inicio > ultimo) out.push({ texto: texto.slice(ultimo, c.inicio) });
    out.push({ texto: texto.slice(c.inicio, c.fim), citado: { id: c.id, nome: c.nome } });
    ultimo = c.fim;
  }
  if (ultimo < texto.length) out.push({ texto: texto.slice(ultimo) });
  return out;
}

/**
 * Enquanto a pessoa escreve: o "@" que ela está digitando antes do cursor ("…fala com @bru" → "bru"),
 * para abrir a lista dos colegas. Nulo quando o cursor não está numa citação.
 */
export function citacaoDigitando(texto: string, cursor: number): { inicio: number; busca: string } | null {
  const antes = texto.slice(0, cursor);
  const at = antes.lastIndexOf('@');
  if (at < 0 || ehLetra(antes[at - 1])) return null;
  const busca = antes.slice(at + 1);
  // nome não tem pontuação: "@Bruno Teixeira?" já é uma citação terminada, não uma busca
  if (busca.length > 40 || /^\s/.test(busca) || /[^\p{L}\p{N} '-]/u.test(busca) || (busca.match(/ /g) ?? []).length > 2) return null;
  return { inicio: at, busca };
}

// =====================================================================
//  O QUE FALTA PARA ENTRAR NUMA ETAPA
// =====================================================================

/** O que a regra dos obrigatórios precisa saber do chamado. */
export type DadosObrigatorios = {
  tipoChamado: TipoChamado;
  clienteId: string | null; contatoNome: string | null; contatoTelefone: string | null;
  relato: string | null; descricao: string | null;
  assuntoId: string | null; tipo: string | null; gravidade: Gravidade | null; alcance: Alcance | null; prioridade: Prioridade | null;
  produtos: string[]; operadoras: string[];
  responsavelId: string | null;
  solucao: string | null; causa: string | null; validacao: string | null;
  checklist: ItemChecklist[];
  tempoMinutos: number;
  /** os valores dos campos do painel (pelo id do campo) */
  campos: ValoresDosCampos;
  /** a negociação (painel de Vendas): o valor (a mensalidade) e a ativação em centavos, a empresa que ainda não é cliente e o motivo da perda */
  valor?: number | null;
  ativacao?: number | null;
  empresa?: string | null;
  motivoPerda?: string | null;
};

const preenchido = (v: string | null | undefined) => !!v && v.trim().length > 0;

function falta(c: DadosObrigatorios, campo: Obrigatorio): boolean {
  const id = idDaChave(campo);
  if (id) return !valorPreenchido(c.campos[id]);
  switch (campo as CampoObrigatorio) {
    // na negociação, a empresa que ainda não é cliente (escrita à mão) também conta como o cliente
    case 'cliente': return !c.clienteId && !preenchido(c.empresa);
    case 'contato': return !preenchido(c.contatoNome) && !preenchido(c.contatoTelefone);
    // o valor que a etapa pede é a mensalidade: não há venda só de ativação (o Luan, em 19/10: "n temos caso
    // de ter só venda, no caso ativação") — a ativação sozinha não basta
    case 'valor': return (c.valor ?? null) === null;
    case 'relato': return !preenchido(c.relato);
    case 'descricao': return !preenchido(c.descricao);
    case 'assunto': return !c.assuntoId;
    case 'tipo': return !preenchido(c.tipo);
    case 'gravidade': return !c.gravidade;
    case 'alcance': return !c.alcance;
    case 'prioridade': return !c.prioridade;
    case 'produto': return !c.produtos.length;
    case 'operadora': return !c.operadoras.length;
    case 'responsavel': return !c.responsavelId;
    case 'solucao': return !preenchido(c.solucao);
    case 'causa': return !preenchido(c.causa);
    // checklist vazio não trava: só o que existe precisa estar marcado
    case 'checklist': return c.checklist.some((i) => !i.feito);
    case 'tempo': return c.tempoMinutos <= 0;
    default: return false;
  }
}

/**
 * O que falta para o chamado entrar na etapa (na ordem da lista de campos). O problema (ITIL) só
 * resolve e fecha com a causa, a solução e a validação, em qualquer painel — o pedido do Eider.
 */
export function faltaParaEtapa(c: DadosObrigatorios, etapa: Pick<EtapaPainel, 'tipo' | 'obrigatorios'> & { resultado?: ResultadoDaVenda | null }): Array<Obrigatorio | 'validacao' | 'motivoPerda'> {
  const campos = new Set<Obrigatorio>(etapa.obrigatorios);
  const fechando = etapa.tipo === 'resolvido' || etapa.tipo === 'fechado';
  if (c.tipoChamado === 'problema' && fechando) { campos.add('causa'); campos.add('solucao'); }
  // os do sistema na ordem da lista de campos; os do painel na ordem em que a etapa os pede
  const faltam: Array<Obrigatorio | 'validacao' | 'motivoPerda'> = [
    ...CAMPOS_CHAMADO.filter((k) => campos.has(k) && falta(c, k)),
    ...[...new Set(etapa.obrigatorios)].filter((k) => idDaChave(k) && falta(c, k)),
  ];
  if (c.tipoChamado === 'problema' && fechando && !preenchido(c.validacao)) faltam.push('validacao');
  // a negociação perdida sempre diz por quê (o motivo vem na hora de marcar)
  if (etapa.resultado === 'perdido' && !preenchido(c.motivoPerda)) faltam.push('motivoPerda');
  return faltam;
}
export function faltaParaAbrir(c: DadosObrigatorios, ajustes: Pick<AjustesDoPainel, 'obrigatoriosAoAbrir'>): Obrigatorio[] {
  const pedidos = new Set<Obrigatorio>(ajustes.obrigatoriosAoAbrir);
  return [
    ...CAMPOS_CHAMADO.filter((k) => pedidos.has(k) && falta(c, k)),
    ...[...pedidos].filter((k) => idDaChave(k) && falta(c, k)),
  ];
}
/** "Falta o Assunto e a Causa" — a mensagem que aparece ao lado do botão (os campos do painel pelo nome). */
export function mensagemDoQueFalta(faltam: Array<Obrigatorio | 'validacao' | 'filhos' | 'motivoPerda'>, etapa?: string, campos: ReadonlyArray<Pick<CampoPersonalizado, 'id' | 'nome'>> = []): string {
  if (!faltam.length) return '';
  const nomes = faltam.map((f) => nomeDoObrigatorio(f, campos));
  const lista = nomes.length === 1 ? nomes[0]! : `${nomes.slice(0, -1).join(', ')} e ${nomes[nomes.length - 1]}`;
  return `${etapa ? `Para ir para ${etapa}, falta` : 'Falta'} preencher: ${lista}.`;
}

/**
 * O pai só resolve e fecha com os filhos fechados (quando o painel pede): devolve os códigos dos que
 * faltam, para a mensagem dizer quais — o pedido do Eider, inclusive com filhos em outro painel.
 */
export function filhosQueTravam(filhos: Array<{ codigo: string; situacao: SituacaoDoChamado }>, etapa: Pick<EtapaPainel, 'tipo'>, paiEsperaFilhos: boolean): string[] {
  if (!paiEsperaFilhos || (etapa.tipo !== 'resolvido' && etapa.tipo !== 'fechado')) return [];
  // para fechar, os filhos precisam estar fechados; para resolver, basta resolvidos
  const ok = (s: SituacaoDoChamado) => (etapa.tipo === 'fechado' ? s === 'fechado' : s !== 'aberto');
  return filhos.filter((f) => !ok(f.situacao)).map((f) => f.codigo);
}

// =====================================================================
//  O CLIENTE RESPONDEU: REABRE OU NÃO?
// =====================================================================

// =====================================================================
//  OS FORMATOS DE ENTRADA (o que a tela e as integrações mandam)
// =====================================================================

const Texto = (max: number) => z.string().max(max).transform((s) => s.replace(/\r\n?/g, '\n'));
const TextoOpcional = (max: number) => Texto(max).nullish().transform((s) => (s && s.trim() ? s.trim() : null));
const Lista = (max = 50) => z.array(z.string().trim().min(1).max(120)).max(max);
/** Um dia (AAAA-MM-DD) que existe: o dia em que a negociação acabou. */
const DiaSchema = z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, 'A data vai como dia/mês/ano')
  .refine((d) => { const t = new Date(`${d}T12:00:00Z`); return !Number.isNaN(t.getTime()) && t.toISOString().slice(0, 10) === d; }, 'Esse dia não existe');
/** O nome de uma etiqueta: até 40 letras, com um espaço só entre as palavras. */
const EtiquetaSchema = z.string().trim().min(1).max(40).transform((s) => s.replace(/\s+/g, ' '));
/**
 * As cores das etiquetas (o pedido do Luan na prévia: "na hora de criar as etiquetas, escolher a cor"),
 * na ordem da escolha. A que ninguém escolheu (o robô, a IA) nasce cinza; quem cuida
 * dos chamados troca a cor em Ajustes › Etiquetas.
 */
export const CORES_ETIQUETA = ['neutral', 'accent', 'roxo', 'turquesa', 'ok', 'amarelo', 'signal', 'bad', 'rosa'] as const;
export type CorEtiqueta = (typeof CORES_ETIQUETA)[number];
export const NOME_COR_ETIQUETA: Record<CorEtiqueta, string> = {
  neutral: 'Cinza', accent: 'Azul', roxo: 'Roxo', turquesa: 'Turquesa', ok: 'Verde', amarelo: 'Amarelo', signal: 'Laranja', bad: 'Vermelho', rosa: 'Rosa',
};
export const CorEtiquetaSchema = z.enum(CORES_ETIQUETA);
/** A cor de cada etiqueta NOVA, pelo nome (a que já existe fica com a cor dela). */
const CoresDasEtiquetasSchema = z.record(z.string().trim().min(1).max(40), CorEtiquetaSchema)
  .refine((r) => Object.keys(r).length <= 20, 'Etiquetas demais no pedido');
/** Criar uma etiqueta em Ajustes › Etiquetas: o painel (cada painel tem as suas, 2.0.3), o nome e a cor. */
export const EtiquetaGravarSchema = z.object({ painelId: z.string().trim().min(1, 'Escolha o painel da etiqueta').max(60), nome: EtiquetaSchema, cor: CorEtiquetaSchema.default('neutral') });
export type EtiquetaGravar = z.infer<typeof EtiquetaGravarSchema>;
export type EtiquetaGravarEntrada = z.input<typeof EtiquetaGravarSchema>;
/**
 * Editar uma etiqueta: o nome (sem ele, fica o de agora) e a cor — valem em todos os chamados que a têm
 * (o pedido do Luan na prévia: "uma opção de editar a etiqueta: a cor e também o nome, parecido com o
 * Helena"). Pelo id (Ajustes › Etiquetas) ou pelo nome de agora, `de` (o seletor de etiquetas).
 */
export const EtiquetaEditarSchema = z.object({ nome: EtiquetaSchema.optional(), cor: CorEtiquetaSchema });
export type EtiquetaEditar = z.infer<typeof EtiquetaEditarSchema>;
export type EtiquetaEditarEntrada = z.input<typeof EtiquetaEditarSchema>;
/** Pelo nome (o seletor de etiquetas): o nome de agora e o painel do chamado (o mesmo nome pode estar em dois painéis). */
export const EtiquetaEditarPeloNomeSchema = EtiquetaEditarSchema.extend({ painelId: z.string().trim().min(1).max(60), de: EtiquetaSchema });
export type EtiquetaEditarPeloNomeEntrada = z.input<typeof EtiquetaEditarPeloNomeSchema>;
const TelefoneSchema = z.string().trim().max(40).nullish().transform((v, ctx) => {
  if (!v) return null;
  const n = numeroWhatsApp(v);
  if (!n) { ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Telefone inválido: use DDD + número, como (71) 99999-0000.' }); return z.NEVER; }
  return n;
});

// ---------- os contatos do cliente (o pedido do Luan na prévia: "uma aba de contatos dos clientes, aí
// ele já puxaria de lá; e criar um contato por aqui") ----------

/** Uma pessoa do cliente com quem a equipe fala. O WhatsApp (só os dígitos, com o 55) acha o cliente quando o robô abre o chamado. */
export type ContatoDoCliente = {
  id: string;
  clienteId: string;
  nome: string;
  whatsapp: string | null;
  email: string | null;
  /** o cargo ou o setor (Recepção, TI, Financeiro…) */
  cargo: string | null;
  ativo: boolean;
  /** quantos chamados do Gestor deste cliente têm este WhatsApp */
  chamados: number;
  criadoEm: string;
  atualizadoEm: string;
};
export const MAX_CONTATOS_DO_CLIENTE = 300;
export const ContatoGravarSchema = z.object({
  nome: z.string().trim().min(2, 'Escreva o nome do contato (pelo menos 2 letras)').max(120),
  whatsapp: TelefoneSchema,
  email: z.preprocess((v) => (typeof v === 'string' && !v.trim() ? null : v), z.string().trim().max(200).email('E-mail inválido').nullish()).transform((v) => v ?? null),
  cargo: TextoOpcional(80),
  ativo: z.boolean().default(true),
});
export type ContatoGravar = z.infer<typeof ContatoGravarSchema>;
export type ContatoGravarEntrada = z.input<typeof ContatoGravarSchema>;

/**
 * O CARGO DO CONTATO VEM DE UMA LISTA (2.0.2, decisão 0053; o Luan, 21/10: "eu quero que esses cargos sejam
 * pré-seleção"). Os cargos ficam em Administração › Catálogos › Cargos dos contatos, e a janela do contato só
 * oferece os ativos. O contato que já tinha um cargo fora da lista (de antes, ou que saiu dela) fica com ele
 * até alguém trocar. Os de fábrica (a migração 0022 põe estes no banco):
 */
export const CARGOS_DE_FABRICA = [
  'Administrativo', 'Atendimento', 'Comercial', 'Compras', 'Diretoria', 'Financeiro', 'Gerência', 'Pós-vendas',
  'Proprietário ou sócio', 'Recepção', 'RH', 'TI',
] as const;

/**
 * O cargo que o contato pode ter: nenhum, um dos ativos da lista (escrito como na lista, mesmo que tenha vindo
 * em minúsculas) ou o que ele já tinha (`atual`). Fora disso, o erro.
 */
export function cargoDaLista(cargo: string | null, ativos: readonly string[], atual: string | null = null): { cargo: string | null } | { erro: string } {
  if (!cargo) return { cargo: null };
  if (cargo === atual) return { cargo };
  const igual = ativos.find((x) => x.toLocaleLowerCase('pt-BR') === cargo.toLocaleLowerCase('pt-BR'));
  return igual ? { cargo: igual } : { erro: `O cargo "${cargo}" não está na lista (Administração › Catálogos › Cargos dos contatos).` };
}
/** O contato pelo WhatsApp (os dígitos) ou, sem o WhatsApp, pelo nome (sem ligar para acento e maiúscula). */
export function acharContato<T extends Pick<ContatoDoCliente, 'nome' | 'whatsapp'>>(contatos: T[], c: { nome?: string | null; telefone?: string | null }): T | undefined {
  const fone = c.telefone ? numeroWhatsApp(c.telefone) : null;
  if (fone) return contatos.find((x) => x.whatsapp === fone);
  const nome = paraBusca(c.nome ?? '');
  return nome ? contatos.find((x) => paraBusca(x.nome) === nome) : undefined;
}

/** Um obrigatório: um campo do sistema ("assunto") ou um campo do painel ("campo:<id>"). */
const ChaveDeCampoSchema = z.custom<ChaveDeCampo>((v) => typeof v === 'string' && /^campo:[A-Za-z0-9_-]{1,60}$/.test(v), 'Campo inválido');
export const ObrigatorioSchema = z.union([z.enum(CAMPOS_CHAMADO), ChaveDeCampoSchema]);
const MAX_OBRIGATORIOS = CAMPOS_CHAMADO.length + MAX_CAMPOS_DO_PAINEL;

export const EtapaGravarSchema = z.object({
  /** sem id = etapa nova */
  id: z.string().min(1).max(60).optional(),
  nome: z.string().trim().min(1, 'Dê um nome à etapa').max(40),
  tipo: z.enum(TIPOS_ETAPA),
  nivel: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]).nullable().default(null),
  obrigatorios: z.array(ObrigatorioSchema).max(MAX_OBRIGATORIOS).default([]),
  avisar: z.array(z.string()).max(50).default([]),
  /** no painel de Vendas: Ganho ou Perdido (só numa etapa que fecha) */
  resultado: z.enum(RESULTADOS_DA_VENDA).nullable().default(null),
});
/** A meta e o valor: em centavos (R$ 1.234,56 = 123456), até R$ 100 milhões. */
export const MAX_VALOR_EM_CENTAVOS = 10_000_000_000;
export const ValorEmCentavosSchema = z.number().int('O valor vai em centavos').min(0, 'O valor não pode ser negativo').max(MAX_VALOR_EM_CENTAVOS, 'Valor alto demais');

/**
 * O VALOR DA NEGOCIAÇÃO: a **mensalidade** e a **ativação** (o pedido do Luan na prévia, em 17/10: "aqui
 * tem q ter mensalidade e ativação" — e "a ativação n muda nada nos relatórios, ela só vai ter registro").
 * O valor que conta (o quadro, o relatório, a meta) é a **mensalidade** (`valor`); a **ativação** (paga uma
 * vez) fica registrada na negociação, no Ganho e na planilha, e não soma em lugar nenhum.
 *
 * As duas podem ser **por produto** (o pedido do mesmo dia: "dividir o valor por produtos e no final tenha
 * o total"): a de cada produto da negociação, em centavos, pelo id do produto. Com pelo menos um produto
 * com valor, a da negociação é o **total** (a soma); sem nenhum, vale a única. O produto que sai da
 * negociação leva os valores dele junto. Sem quantidade.
 */
export type ValoresDosProdutos = Record<string, number>;
export const ValoresDosProdutosSchema = z.record(z.string().trim().min(1).max(60), ValorEmCentavosSchema)
  .refine((r) => Object.keys(r).length <= 50, 'Produtos demais no valor por produto');
export const NOME_MENSALIDADE = 'Mensalidade';
export const NOME_ATIVACAO = 'Ativação';
export const NOME_VALOR_POR_PRODUTO = 'Mensalidade por produto';
export const NOME_ATIVACAO_POR_PRODUTO = 'Ativação por produto';
export const VALOR_E_A_SOMA = 'A mensalidade desta negociação é o total dos produtos: mude a de cada produto (ou volte para Um valor só).';
export const ATIVACAO_E_A_SOMA = 'A ativação desta negociação é o total dos produtos: mude a de cada produto (ou volte para Um valor só).';
export const VALOR_SO_DOS_PRODUTOS = 'O valor por produto é só dos produtos da negociação.';

/** O total do valor por produto (nulo: a negociação não está dividida por produto). */
export function somaDosProdutos(v: ValoresDosProdutos | null | undefined): number | null {
  const valores = Object.values(v ?? {});
  return valores.length ? valores.reduce((s, x) => s + x, 0) : null;
}

/** Os produtos com valor, na ordem dos produtos da negociação (para mostrar e para o histórico). */
export function linhasDoValorPorProduto<P extends { id: string }>(produtos: P[], valores: ValoresDosProdutos | null | undefined): Array<P & { valor: number }> {
  return produtos.filter((p) => valores?.[p.id] !== undefined).map((p) => ({ ...p, valor: valores![p.id]! }));
}

export type ValorDaNegociacao = { produtos: string[]; valores: ValoresDosProdutos; valor: number | null };

/**
 * O que fica gravado depois de criar ou mudar a negociação: os produtos, o valor por produto e o valor.
 * `pedido.valores` troca o valor por produto inteiro (vazio ou nulo: volta para o valor único); sem ele,
 * o valor por produto fica como estava, menos o dos produtos que saíram. Com valor por produto, o valor
 * é a soma (um valor diferente no pedido é recusado); a divisão que acabou porque os produtos saíram leva
 * o valor junto. O servidor e a prévia usam esta mesma conta.
 */
export function valorPorProduto(
  atual: ValorDaNegociacao,
  pedido: { produtos?: string[]; valores?: ValoresDosProdutos | null; valor?: number | null },
  /** a mensagem quando o pedido traz um total diferente da soma (a mensalidade ou a ativação) */
  erroDaSoma: string = VALOR_E_A_SOMA,
): ({ ok: true } & ValorDaNegociacao) | { ok: false; erro: string } {
  const produtos = pedido.produtos ?? atual.produtos;
  if (pedido.valores && Object.keys(pedido.valores).some((id) => !produtos.includes(id))) return { ok: false, erro: VALOR_SO_DOS_PRODUTOS };
  const valores: ValoresDosProdutos = pedido.valores !== undefined
    ? { ...(pedido.valores ?? {}) }
    : Object.fromEntries(Object.entries(atual.valores).filter(([id]) => produtos.includes(id)));
  const soma = somaDosProdutos(valores);
  if (soma !== null) {
    if (soma > MAX_VALOR_EM_CENTAVOS) return { ok: false, erro: 'Valor alto demais' };
    if (pedido.valor !== undefined && pedido.valor !== soma) return { ok: false, erro: erroDaSoma };
    return { ok: true, produtos, valores, valor: soma };
  }
  const dividida = somaDosProdutos(atual.valores) !== null;
  const valor = pedido.valor !== undefined ? pedido.valor : dividida && pedido.valores === undefined ? null : atual.valor;
  return { ok: true, produtos, valores: {}, valor };
}

/** O mesmo valor por produto? (a ordem não conta) */
export function mesmoValorPorProduto(a: ValoresDosProdutos | null | undefined, b: ValoresDosProdutos | null | undefined): boolean {
  const ka = Object.keys(a ?? {});
  return ka.length === Object.keys(b ?? {}).length && ka.every((k) => (a ?? {})[k] === (b ?? {})[k]);
}

/** O valor por produto em texto, para o histórico: "PABX em nuvem R$ 8.000,00 · URA R$ 1.500,00" (vazio: nulo). */
export function textoDoValorPorProduto(produtos: Array<{ id: string; nome: string }>, valores: ValoresDosProdutos | null | undefined): string | null {
  const linhas = linhasDoValorPorProduto(produtos, valores);
  return linhas.length ? linhas.map((l) => `${l.nome} ${reais(l.valor)}`).join(' · ') : null;
}
export const AjustesDoPainelSchema = z.object({
  /** as opções do Tipo (sem a lista, ficam como estão; o painel novo nasce com as do tipo de painel) */
  tipos: z.array(z.string().trim().min(1).max(40)).max(30).optional(),
  contaPrazo: z.boolean().default(true),
  fecharSozinhoDias: z.number().int().min(1).max(60).nullable().default(3),
  obrigatoriosAoAbrir: z.array(ObrigatorioSchema).max(MAX_OBRIGATORIOS).default([]),
  /** sem o campo, fica como está (o painel novo de Gestão espera os filhos; o de Vendas, não) */
  paiEsperaFilhos: z.boolean().optional(),
  supervisores: z.array(z.string()).max(30).default([]),
  /** sem a lista, fica como está (quem liga e desliga é a aba Campos) */
  camposDesligados: z.array(z.enum(CAMPOS_DO_SISTEMA)).max(CAMPOS_DO_SISTEMA.length).optional(),
  /** no painel de Vendas: os motivos de perda (sem a lista, ficam como estão) */
  motivosDePerda: z.array(z.string().trim().min(1, 'Dê um nome ao motivo').max(60, 'O motivo vai até 60 letras')).max(30, 'Até 30 motivos').optional(),
  /** no painel de Vendas: a meta do mês, em centavos (nulo = sem meta; sem o campo, fica como está) */
  metaMensal: ValorEmCentavosSchema.nullable().optional(),
});
/** Um painel vai até 20 etapas (colunas do quadro). */
export const MAX_ETAPAS_DO_PAINEL = 20;
/**
 * As etapas de um painel, na ordem do quadro. As mesmas regras ao criar o painel (já com as etapas,
 * na mesma janela — o pedido do Luan na prévia) e ao mudar as etapas depois.
 */
export const ListaDeEtapasSchema = z.array(EtapaGravarSchema)
  .min(2, 'O painel precisa de pelo menos duas etapas')
  .max(MAX_ETAPAS_DO_PAINEL, `Um painel vai até ${MAX_ETAPAS_DO_PAINEL} etapas`)
  .superRefine((etapas, ctx) => {
    if (!etapas.some((e) => e.tipo === 'fechado')) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Pelo menos uma etapa precisa fechar o chamado' });
    if (!etapas.some((e) => e.tipo === 'entrada' || e.tipo === 'andamento')) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Pelo menos uma etapa precisa ser de entrada ou de andamento' });
    const vistos = new Set<string>();
    for (const e of etapas) {
      const k = paraBusca(e.nome);
      if (vistos.has(k)) { ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Duas etapas com o nome ${e.nome}` }); break; }
      vistos.add(k);
    }
  });
/** As etapas que saíram e têm chamados: para onde eles vão (id da que saiu → id de uma que fica). */
const DestinoDosChamadosSchema = z.record(z.string(), z.string()).default({});
export const PainelGravarSchema = z.object({
  nome: z.string().trim().min(1, 'Dê um nome ao painel').max(40),
  sigla: SiglaSchema,
  descricao: TextoOpcional(300),
  cor: z.enum(CORES_PAINEL).default('accent'),
  /** Gestão ou Vendas: vale ao criar (depois, o tipo não muda) */
  tipo: z.enum(TIPOS_DE_PAINEL).default('gestao'),
  acesso: z.enum(['todos', 'escolhidos']).default('todos'),
  pessoas: z.array(z.string()).max(200).default([]),
  ajustes: AjustesDoPainelSchema,
  ativo: z.boolean().default(true),
  /**
   * As etapas, na ordem (opcional). Ao criar, o painel nasce com elas (sem a lista, com Novo, Em
   * andamento, Resolvido e Fechado). Ao mudar, valem as regras de `EtapasGravarSchema`, gravadas junto
   * com o painel: ou vai tudo, ou nada.
   */
  etapas: ListaDeEtapasSchema.optional(),
  destino: DestinoDosChamadosSchema,
});
/**
 * As etapas de um painel de Vendas: uma etapa Ganho e uma Perdido, as duas finais (que fecham a
 * negociação); nenhuma de Resolvido nem de nível. Nas de Gestão, nenhuma etapa tem resultado. Devolve a
 * primeira frase do que não serve (ou nulo).
 */
export function problemaNasEtapasDoTipo(tipo: TipoDePainel, etapas: ReadonlyArray<Pick<EtapaPainel, 'nome' | 'tipo' | 'nivel'> & { resultado?: ResultadoDaVenda | null }>): string | null {
  if (tipo === 'gestao') {
    return etapas.some((e) => e.resultado) ? 'Ganho e Perdido são etapas do painel de Vendas.' : null;
  }
  for (const r of RESULTADOS_DA_VENDA) {
    const n = etapas.filter((e) => e.resultado === r).length;
    if (!n) return `O painel de Vendas precisa da etapa ${NOME_RESULTADO_DA_VENDA[r]}.`;
    if (n > 1) return `O painel de Vendas tem uma etapa ${NOME_RESULTADO_DA_VENDA[r]} só (a lista tem ${n}).`;
  }
  const errada = etapas.find((e) => e.resultado && e.tipo !== 'fechado');
  if (errada) return `A etapa ${errada.nome} fecha a negociação: o tipo dela é Fechado.`;
  const fechaSemResultado = etapas.find((e) => e.tipo === 'fechado' && !e.resultado);
  if (fechaSemResultado) return `No painel de Vendas, só o Ganho e o Perdido fecham a negociação (${fechaSemResultado.nome} não pode fechar).`;
  if (etapas.some((e) => e.tipo === 'resolvido')) return 'O painel de Vendas não tem a etapa Resolvido: a negociação acaba em Ganho ou Perdido.';
  if (etapas.some((e) => e.nivel)) return 'O painel de Vendas não tem níveis (N1, N2, N3).';
  return null;
}
/**
 * A troca de painel não muda o que o registro é: a negociação só passa para outro painel de Vendas, e o
 * chamado para outro de Gestão (entre os dois, abre-se o outro lá: a negociação não se liga a chamados).
 */
export const trocaEntreTiposDePainel = (codigo: string, de: { tipo: TipoDePainel }, para: { nome: string }) => (de.tipo === 'vendas'
  ? `${codigo} é uma negociação: só passa para outro painel de Vendas. Para levar o trabalho ao ${para.nome}, abra um chamado lá.`
  : `O ${para.nome} é um painel de Vendas: um chamado não vira negociação trocando de painel. Crie a negociação lá.`);
/**
 * A negociação fica sozinha no painel de Vendas (os pedidos do Luan na prévia, em 17/10): não tem pai nem
 * filhos ("n precisa de pais e filhas aqui"), não entra num problema e não se liga a chamados nem a outras
 * negociações ("n precisa ligações"). O código citado num texto continua virando link (não é ligação).
 */
export const NEGOCIACAO_SEM_PAI = 'A negociação não tem pai nem filhos.';
export const negociacaoNaoEPai = (codigo: string) => `${codigo} é uma negociação, e a negociação não tem filhos.`;
export const NEGOCIACAO_SEM_PROBLEMA = 'A negociação não entra em problema: o problema junta os chamados dos painéis de Gestão.';
export const negociacaoNaoEIncidente = (codigo: string) => `${codigo} é uma negociação: o incidente de um problema é um chamado.`;
export const NEGOCIACAO_SEM_LIGACAO = 'A negociação não se liga a chamados nem a outras negociações.';
export const negociacaoNaoSeLiga = (codigo: string) => `${codigo} é uma negociação, e a negociação não se liga a chamados nem a outras negociações.`;
/** Na troca entre painéis de Vendas, a negociação entra no funil: o resultado se marca na janela dele. */
export const TROCA_ENTRA_NO_FUNIL = 'Na troca de painel, a negociação entra numa etapa do funil: o Ganho e o Perdido se marcam depois (com o valor ou o motivo).';

export const EtapasGravarSchema = z.object({
  etapas: ListaDeEtapasSchema,
  destino: DestinoDosChamadosSchema,
});

/** As etapas com que um painel novo nasce, se ninguém mudar a lista: o mínimo para funcionar. */
export const ETAPAS_DO_PAINEL_NOVO: Array<Pick<EtapaPainel, 'nome' | 'tipo' | 'nivel' | 'obrigatorios'>> = [
  { nome: 'Novo', tipo: 'entrada', nivel: null, obrigatorios: [] },
  { nome: 'Em andamento', tipo: 'andamento', nivel: null, obrigatorios: [] },
  { nome: 'Resolvido', tipo: 'resolvido', nivel: null, obrigatorios: [] },
  { nome: 'Fechado', tipo: 'fechado', nivel: null, obrigatorios: [] },
];

export const AssuntoGravarSchema = z.object({
  paiId: z.string().nullish().transform((v) => v || null),
  nome: z.string().trim().min(1, 'Dê um nome ao assunto').max(80),
  descricao: TextoOpcional(400),
  ativo: z.boolean().default(true),
  checklist: z.array(z.string().trim().min(1).max(160)).max(30).default([]),
  /** de-para: os nomes antigos (da lista atual do LineChat) que viram este assunto */
  dePara: z.array(z.string().trim().min(1).max(120)).max(50).default([]),
});
export const AssuntosColarSchema = z.object({ texto: Texto(50_000) });

/** Criar ou mudar um campo do painel. Sem `id` na opção = opção nova; a opção que não vier fica desativada. */
export const CampoGravarSchema = z.object({
  nome: z.string().trim().min(1, 'Dê um nome ao campo').max(40, 'O nome do campo vai até 40 letras'),
  tipo: z.enum(TIPOS_CAMPO),
  dica: TextoOpcional(200),
  opcoes: z.array(z.object({
    id: z.string().min(1).max(60).optional(),
    nome: z.string().trim().min(1, 'Dê um nome à opção').max(60, 'O nome da opção vai até 60 letras'),
    ativa: z.boolean().default(true),
  })).max(MAX_OPCOES_DO_CAMPO, `Uma lista vai até ${MAX_OPCOES_DO_CAMPO} opções`).default([]),
  ativo: z.boolean().default(true),
  /** o chamado só abre com ele preenchido */
  obrigatorioAoAbrir: z.boolean().default(false),
  /** as etapas (ids) em que ele é obrigatório para o chamado entrar */
  etapas: z.array(z.string().min(1).max(60)).max(MAX_ETAPAS_DO_PAINEL).default([]),
  /** a lista de uma opção em que quem trabalha inclui a opção nova ali mesmo (2.0.3) */
  incluirNaHora: z.boolean().default(false),
}).superRefine((c, ctx) => {
  if (!ehLista(c.tipo)) return;
  // a que se inclui na hora pode começar vazia: as opções nascem nos chamados
  if (!c.opcoes.some((o) => o.ativa) && !(c.tipo === 'lista' && c.incluirNaHora)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['opcoes'], message: 'A lista precisa de pelo menos uma opção' });
  const vistas = new Set<string>();
  for (const o of c.opcoes) {
    const k = paraBusca(o.nome);
    if (vistas.has(k)) { ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['opcoes'], message: `Duas opções com o nome ${o.nome}` }); break; }
    vistas.add(k);
  }
});
/** Os campos do sistema que o painel usa (desligados) e as opções do Tipo. */
export const CamposDoSistemaSchema = z.object({
  desligados: z.array(z.enum(CAMPOS_DO_SISTEMA)).max(CAMPOS_DO_SISTEMA.length).default([]),
  tipos: z.array(z.string().trim().min(1).max(40)).max(30),
});
/** A ordem dos campos do painel (todos os ids, na ordem nova). */
export const OrdemDosCamposSchema = z.object({ ids: z.array(z.string().min(1).max(60)).max(200) });

/**
 * Os valores dos campos do painel no pedido: pelo id do campo (ou pelo nome, para o n8n e o robô). Nulo
 * ou vazio tira o valor. Cada um é conferido contra o campo com `normalizarValorDoCampo`.
 */
const ValorEntradaSchema = z.union([z.string().max(MAX_LETRAS_DO_CAMPO.texto_longo + 100), z.number(), z.boolean(), z.array(z.string().max(120)).max(MAX_OPCOES_DO_CAMPO)]);
const ValoresEntradaSchema = z.record(z.string().trim().min(1).max(60), ValorEntradaSchema.nullable())
  .refine((r) => Object.keys(r).length <= 60, 'Campos demais no pedido');

export const ChamadoCriarSchema = z.object({
  painelId: z.string().min(1),
  tipoChamado: z.enum(TIPOS_CHAMADO).default('chamado'),
  /**
   * Pelo menos 3 letras; na negociação (o painel de Vendas) é opcional — vazio, ela fica com o nome da empresa
   * (2.0.3, o pedido do Luan: "se eu n colocar nada vai ser o nome do cliente"). Quem confere é o servidor, que
   * sabe o tipo do painel (`tituloQueFica`).
   */
  titulo: z.string().trim().max(200).default(''),
  relato: TextoOpcional(20_000),
  descricao: TextoOpcional(20_000),
  clienteId: z.string().nullish().transform((v) => v || null),
  contatoNome: TextoOpcional(120),
  contatoTelefone: TelefoneSchema,
  /**
   * a conversa do LineChat: o código da sessão (o robô, o botão da conversa) ou o link colado na tela (o
   * chamado ativo, 2.0.4.1); quem lê o link é o servidor (`sessaoDaConversa`)
   */
  sessaoId: TextoOpcional(500),
  assuntoId: z.string().nullish().transform((v) => v || null),
  tipo: TextoOpcional(40),
  gravidade: z.enum(GRAVIDADES).nullish().transform((v) => v ?? null),
  alcance: z.enum(ALCANCES).nullish().transform((v) => v ?? null),
  prioridade: z.enum(PRIORIDADES).nullish().transform((v) => v ?? null),
  motivoPrioridade: TextoOpcional(300),
  produtos: Lista().default([]),
  operadoras: Lista().default([]),
  etiquetas: z.array(EtiquetaSchema).max(20).default([]),
  /** a cor de cada etiqueta nova (pelo nome); a que já existe fica com a cor dela */
  coresDasEtiquetas: CoresDasEtiquetasSchema.default({}),
  responsavelId: z.string().nullish().transform((v) => v || null),
  /** quem observa: recebe os avisos de toda atualização do chamado (como no Helena) */
  observadores: z.array(z.string()).max(30).default([]),
  /** filho de quem (pode ser de outro painel) */
  paiId: z.string().nullish().transform((v) => v || null),
  /** incidente de qual problema */
  problemaId: z.string().nullish().transform((v) => v || null),
  /** para o problema novo: os incidentes que ele junta */
  incidentes: z.array(z.string()).max(200).default([]),
  /** manda ao cliente o número do chamado pelo WhatsApp (o atendente escolhe: decisão "cliente", opção b) */
  avisarCliente: z.boolean().default(false),
  origem: z.enum(['manual', 'botao']).default('manual'),
  /** os campos do painel (pelo id ou pelo nome) */
  campos: ValoresEntradaSchema.default({}),
  /** a negociação (painel de Vendas): o valor em centavos e a empresa que ainda não é cliente */
  valor: ValorEmCentavosSchema.nullish().transform((v) => v ?? null),
  /** a negociação: a mensalidade de cada produto (com ela, o valor é o total) */
  valoresDosProdutos: ValoresDosProdutosSchema.optional(),
  /** a negociação: a ativação (paga uma vez; à parte da mensalidade), única ou por produto */
  ativacao: ValorEmCentavosSchema.nullish().transform((v) => v ?? null),
  ativacoesDosProdutos: ValoresDosProdutosSchema.optional(),
  empresa: TextoOpcional(120),
});
export type ChamadoCriar = z.infer<typeof ChamadoCriarSchema>;

/** Mudar o chamado: só os campos que vierem. */
export const ChamadoAlterarSchema = z.object({
  /** pelo menos 3 letras; na negociação, vazio volta ao nome da empresa (o servidor confere: `tituloQueFica`) */
  titulo: z.string().trim().max(200).optional(),
  relato: TextoOpcional(20_000).optional(),
  descricao: TextoOpcional(20_000).optional(),
  clienteId: z.string().nullish().transform((v) => v || null).optional(),
  contatoNome: TextoOpcional(120).optional(),
  contatoTelefone: TelefoneSchema.optional(),
  /**
   * ligar (ou trocar) a conversa do LineChat (2.0.4.1): o link da conversa ou o código da sessão; nulo ou
   * vazio tira. O servidor acha a sessão no que veio (`sessaoDaConversa`)
   */
  sessaoId: TextoOpcional(500).optional(),
  assuntoId: z.string().nullish().transform((v) => v || null).optional(),
  tipo: TextoOpcional(40).optional(),
  gravidade: z.enum(GRAVIDADES).nullable().optional(),
  alcance: z.enum(ALCANCES).nullable().optional(),
  prioridade: z.enum(PRIORIDADES).nullable().optional(),
  /** trocar a prioridade sugerida pede o motivo */
  motivoPrioridade: TextoOpcional(300).optional(),
  produtos: Lista().optional(),
  operadoras: Lista().optional(),
  etiquetas: z.array(EtiquetaSchema).max(20).optional(),
  /** a cor de cada etiqueta nova (pelo nome); a que já existe fica com a cor dela */
  coresDasEtiquetas: CoresDasEtiquetasSchema.optional(),
  solucao: TextoOpcional(20_000).optional(),
  causa: TextoOpcional(5_000).optional(),
  contorno: TextoOpcional(10_000).optional(),
  validacao: TextoOpcional(5_000).optional(),
  observadores: z.array(z.string()).max(30).optional(),
  responsavelId: z.string().nullish().transform((v) => v || null).optional(),
  /** só os campos do painel que vierem (nulo ou vazio tira o valor) */
  campos: ValoresEntradaSchema.optional(),
  /** a negociação (painel de Vendas); o valor por produto vem inteiro (vazio ou nulo: volta para o valor único) */
  valor: ValorEmCentavosSchema.nullable().optional(),
  valoresDosProdutos: ValoresDosProdutosSchema.nullable().optional(),
  ativacao: ValorEmCentavosSchema.nullable().optional(),
  ativacoesDosProdutos: ValoresDosProdutosSchema.nullable().optional(),
  empresa: TextoOpcional(120).optional(),
  motivoPerda: TextoOpcional(200).optional(),
});
export type ChamadoAlterar = z.infer<typeof ChamadoAlterarSchema>;

export const MoverSchema = z.object({
  etapaId: z.string().min(1),
  /** escalonar (ou voltar de nível) pede o motivo */
  motivo: TextoOpcional(500),
  /** para quem, ao escalonar (sem ninguém = fica na fila do nível) */
  responsavelId: z.string().nullish(),
  /** marcar como Perdido pede o motivo (um dos motivos do painel, ou outro escrito) */
  motivoPerda: TextoOpcional(200),
  /** Ganho e Perdido: o dia em que a negociação acabou (hoje ou antes; sem ele, agora) */
  concluidoEm: DiaSchema.nullish().transform((v) => v || null),
  /**
   * Arrastada para um lugar da coluna (2.0.4.1, só onde vale a ordem à mão): o cartão que fica logo acima (nulo:
   * o alto). Sem ele, ela chega no alto da etapa, pela regra de sempre.
   */
  depoisDe: z.string().min(1).nullish(),
});
/** Mudar o lugar na coluna do quadro, arrastando (2.0.4.1): o cartão que fica logo acima; nulo, o alto. */
export const PosicaoNoQuadroSchema = z.object({ depoisDe: z.string().min(1).nullable() });
export const EsperarSchema = z.object({ tipo: z.enum(['cliente', 'operadora']).nullable(), motivo: TextoOpcional(300) });
export const ReabrirSchema = z.object({ motivo: TextoOpcional(500), etapaId: z.string().nullish() });
export const TrocarPainelSchema = z.object({ painelId: z.string().min(1), etapaId: z.string().nullish() });
export const AnotacaoSchema = z.object({
  texto: Texto(20_000).transform((s) => s.trim()),
  anexos: z.array(z.object({ fileName: z.string().trim().min(1).max(200), conteudo: z.string().min(1).max(15_000_000) })).max(5).default([]),
}).refine((a) => a.texto.length > 0 || a.anexos.length > 0, 'Escreva a anotação ou anexe um arquivo');
export const LigarChamadoSchema = z.object({ para: z.string().trim().min(1).max(40), tipo: z.enum(TIPOS_LIGACAO_CHAMADO) });
export const PaiSchema = z.object({ pai: z.string().trim().max(40).nullable() });
export const ProblemaSchema = z.object({ problema: z.string().trim().max(40).nullable() });
export const ChecklistSchema = z.discriminatedUnion('acao', [
  z.object({ acao: z.literal('marcar'), itemId: z.string(), feito: z.boolean() }),
  z.object({ acao: z.literal('incluir'), texto: z.string().trim().min(1).max(160) }),
  z.object({ acao: z.literal('tirar'), itemId: z.string() }),
]);
export const TempoSchema = z.object({
  minutos: z.number().int().min(1, 'Pelo menos 1 minuto').max(24 * 60, 'No máximo 24 horas por registro'),
  nota: TextoOpcional(300),
  /** o dia do trabalho (AAAA-MM-DD); sem dia = hoje */
  dia: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
});
export const OperadoraCasoSchema = z.object({
  operadoraId: z.string().nullish().transform((v) => v || null),
  operadoraNome: TextoOpcional(80),
  protocolo: z.string().trim().min(1, 'Escreva o protocolo').max(80),
  /** quando a operadora prometeu resolver */
  prometidoPara: z.string().datetime({ offset: true }).nullish(),
  /** cobrar a cada quantas horas */
  cobrarACadaHoras: z.number().int().min(1).max(240).nullish(),
  nota: TextoOpcional(500),
});
export const OperadoraAndamentoSchema = z.object({ acao: z.enum(['cobrar', 'fechar']), texto: TextoOpcional(500) });
export const AvisarClienteSchema = z.object({ texto: z.string().trim().min(1, 'Escreva a mensagem').max(3000) });
export const ObservarSchema = z.object({ observar: z.boolean() });

export const ListarChamadosSchema = z.object({
  painel: z.string().optional(),
  etapa: z.string().optional(),
  situacao: z.enum(['abertos', 'resolvidos', 'fechados', 'todos']).default('abertos'),
  prazo: z.enum(['vencidos', 'perto', 'parados']).optional(),
  responsavel: z.string().optional(),
  cliente: z.string().optional(),
  prioridade: z.enum(PRIORIDADES).optional(),
  assunto: z.string().optional(),
  etiqueta: z.string().optional(),
  tipoChamado: z.enum(TIPOS_CHAMADO).optional(),
  espera: z.enum(['cliente', 'operadora']).optional(),
  q: z.string().trim().max(200).optional(),
  de: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  ate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100_000).default(50),
  sort: z.string().trim().max(40).optional(),
  dir: z.enum(['asc', 'desc']).optional(),
});
export type FiltrosAtendimento = z.infer<typeof ListarChamadosSchema>;

export const AgendadoGravarSchema = z.object({
  painelId: z.string().min(1),
  titulo: z.string().trim().min(3).max(200),
  relato: TextoOpcional(5000),
  clienteId: z.string().nullish().transform((v) => v || null),
  responsavelId: z.string().nullish().transform((v) => v || null),
  assuntoId: z.string().nullish().transform((v) => v || null),
  prioridade: z.enum(PRIORIDADES).nullish().transform((v) => v ?? null),
  checklist: z.array(z.string().trim().min(1).max(160)).max(30).default([]),
  regra: RegraAgendadoSchema,
  ativo: z.boolean().default(true),
});

/** Os avisos: quem recebe o quê, na tela e no WhatsApp. */
/**
 * O "cliente respondeu" saiu da lista no 2.0.1 (o Gestor não ouve mais as mensagens do cliente pelo n8n); o
 * aviso antigo desse tipo continua aparecendo no sininho (`TIPOS_AVISO`).
 */
export const EVENTOS_AVISO = ['recebeu', 'citado', 'etapa', 'prazo_perto', 'prazo_vencido', 'sem_dono', 'critico', 'observador', 'lembrete', 'evento_novo'] as const;
export type EventoAviso = (typeof EVENTOS_AVISO)[number];
export const NOME_EVENTO_AVISO: Record<EventoAviso, { titulo: string; quem: string }> = {
  recebeu: { titulo: 'Recebeu um chamado (atribuído ou escalonado)', quem: 'quem recebeu' },
  // o pedido do Luan na prévia (13/10): citar o colega com @ avisa na hora, mesmo quem não observa o chamado
  citado: { titulo: 'Alguém citou a pessoa numa anotação (@)', quem: 'quem foi citado' },
  etapa: { titulo: 'Chegou um chamado na etapa', quem: 'quem a etapa avisa (Ajustes › Painéis)' },
  prazo_perto: { titulo: 'O prazo chegou ao percentual do aviso', quem: 'o responsável' },
  prazo_vencido: { titulo: 'O prazo venceu', quem: 'o responsável e os supervisores' },
  sem_dono: { titulo: 'Sem responsável depois do tempo combinado', quem: 'os supervisores' },
  critico: { titulo: 'Chegou um chamado Crítico', quem: 'os supervisores' },
  // como no Helena (o pedido do Luan na prévia): quem observa recebe toda atualização do chamado
  observador: { titulo: 'Novidade num chamado que a pessoa observa (anotação, etapa, responsável, espera, campos)', quem: 'os observadores' },
  // o lembrete do calendário (2.0.2): "quanto tempo antes", escolhido no evento
  lembrete: { titulo: 'Lembrete de um evento do calendário', quem: 'quem o evento lembra (as pessoas dele, ou todos que veem)' },
  // o aviso de que o evento entrou (2.0.2, o pedido do Luan: "uma notificação de inclusão opcional"): quem põe o evento escolhe
  evento_novo: { titulo: 'Um evento entrou no calendário (quando quem pôs pede o aviso)', quem: 'quem o evento avisa (as pessoas dele, ou todos que veem), menos quem pôs' },
};
export type CanaisDoAviso = { tela: boolean; whatsapp: boolean };
/** O que o documento de prioridade sugeriu (a tabela "Alertas e escalonamento"). */
export const EVENTOS_AVISO_PADRAO: Record<EventoAviso, CanaisDoAviso> = {
  recebeu: { tela: true, whatsapp: true }, citado: { tela: true, whatsapp: true }, etapa: { tela: true, whatsapp: true }, prazo_perto: { tela: true, whatsapp: true },
  prazo_vencido: { tela: true, whatsapp: true }, sem_dono: { tela: true, whatsapp: false }, critico: { tela: true, whatsapp: true },
  observador: { tela: true, whatsapp: false }, lembrete: { tela: true, whatsapp: true }, evento_novo: { tela: true, whatsapp: true },
};
const CanaisSchema = z.object({ tela: z.boolean(), whatsapp: z.boolean() });

// =====================================================================
//  A MENSAGEM DE CADA AVISO NO WHATSAPP (2.0.2)
// =====================================================================

/**
 * A mensagem de cada aviso no WhatsApp da equipe. O pedido do Luan, em 20/10: "a notificação dos
 * observadores tbm n ficou legal, veja como tínhamos antes, era bem melhor, faça algo que dê para nós
 * personalizarmos inclusive as variáveis". Cada aviso tem a sua mensagem, com as variáveis entre chaves
 * ({painel}, {nota}…). A padrão segue a do fluxo antigo do n8n, o "Atualização de Card" (Painel, Card,
 * Nota, Quem comentou, Cliente, Link), uma informação por linha. A linha em que todas as variáveis vêm
 * vazias não é enviada: sem cliente, não chega "Cliente:" em branco. O sininho continua com a frase curta.
 */
export type VariavelDoAviso = { chave: string; dica: string };
const variavel = (chave: string, dica: string): VariavelDoAviso => ({ chave, dica });

/** As do chamado: valem em todos os avisos de chamado. */
const VARIAVEIS_DO_CHAMADO: readonly VariavelDoAviso[] = [
  variavel('painel', 'o painel'), variavel('etapa', 'a etapa em que ele está'), variavel('codigo', 'o código (SUP-12)'),
  variavel('titulo', 'o título'), variavel('prioridade', 'a prioridade'), variavel('cliente', 'a empresa'),
  variavel('contato', 'o nome do contato'), variavel('responsavel', 'o responsável'), variavel('assunto', 'o assunto'),
  variavel('relato', 'o relato do cliente (o começo)'), variavel('link', 'o endereço do chamado no Gestor'),
];
const AVISO_NUMA_FRASE = variavel('aviso', 'o aviso numa frase, como no sininho');
const QUEM_FEZ = variavel('quem', 'quem fez');
const A_NOTA = variavel('nota', 'o texto da anotação');
/** Só no do observador: o que mudou, sem quem fez ("Moveu para N2"). Na anotação fica vazia: a {nota} já diz. */
const A_NOVIDADE = variavel('novidade', 'o que mudou ("Moveu para N2"; na anotação, vazio: vale a nota)');
/** As do evento do calendário: valem no lembrete e no aviso de que o evento entrou. */
const VARIAVEIS_DO_EVENTO: readonly VariavelDoAviso[] = [
  variavel('evento', 'o que é (o título do evento)'),
  variavel('tipo', 'o tipo (Visita, Reunião…)'), variavel('quando', 'o dia e a hora'), variavel('local', 'onde'),
  variavel('cliente', 'a empresa'), variavel('chamado', 'o chamado ligado (SUP-12)'), variavel('pessoas', 'as pessoas do evento'),
  variavel('paineis', 'os painéis do evento'), variavel('observacao', 'a observação'), variavel('link', 'o endereço do evento no Gestor'),
];

/** As variáveis de um aviso, na ordem dos botões: primeiro as do que aconteceu, depois as do chamado (ou do evento). */
export function variaveisDoAviso(e: EventoAviso): readonly VariavelDoAviso[] {
  if (e === 'lembrete') return [variavel('aviso', 'o lembrete numa frase, como no sininho'), ...VARIAVEIS_DO_EVENTO];
  if (e === 'evento_novo') return [variavel('aviso', 'o aviso numa frase, como no sininho'), variavel('quem', 'quem pôs o evento'), ...VARIAVEIS_DO_EVENTO];
  const doQueAconteceu = e === 'observador' ? [AVISO_NUMA_FRASE, A_NOVIDADE, QUEM_FEZ, A_NOTA]
    : e === 'citado' ? [AVISO_NUMA_FRASE, QUEM_FEZ, A_NOTA]
      // o relógio do Gestor avisa os prazos e o sem responsável: ninguém "fez"
      : e === 'prazo_perto' || e === 'prazo_vencido' || e === 'sem_dono' ? [AVISO_NUMA_FRASE]
        : [AVISO_NUMA_FRASE, QUEM_FEZ];
  return [...doQueAconteceu, ...VARIAVEIS_DO_CHAMADO];
}

/** O fim de cada mensagem de chamado: o cliente e o link (como no fluxo antigo). */
const FIM_DO_CHAMADO = '👨‍💼 *Cliente:* {cliente}\n🔗 *Link do Card:* {link}';
/** As mensagens padrão: a do observador é a do fluxo antigo; as outras seguem o mesmo jeito. */
export const MODELOS_DOS_AVISOS_PADRAO: Readonly<Record<EventoAviso, string>> = Object.freeze({
  recebeu: `📥 *{aviso}*\n🔎 *Painel:* {painel} · {etapa}\n📌 *Card:* {codigo} · {titulo}\n⚡ *Prioridade:* {prioridade}\n👤 *Quem passou:* {quem}\n${FIM_DO_CHAMADO}`,
  citado: `💬 *{quem} citou você*\n🔎 *Painel:* {painel}\n📌 *Card:* {codigo} · {titulo}\n📝 *Nota:* {nota}\n${FIM_DO_CHAMADO}`,
  etapa: `📥 *{aviso}*\n🔎 *Painel:* {painel} · {etapa}\n📌 *Card:* {codigo} · {titulo}\n⚡ *Prioridade:* {prioridade}\n👤 *Responsável:* {responsavel}\n${FIM_DO_CHAMADO}`,
  prazo_perto: `⏰ *{aviso}*\n🔎 *Painel:* {painel} · {etapa}\n📌 *Card:* {codigo} · {titulo}\n⚡ *Prioridade:* {prioridade}\n${FIM_DO_CHAMADO}`,
  prazo_vencido: `🚨 *{aviso}*\n🔎 *Painel:* {painel} · {etapa}\n📌 *Card:* {codigo} · {titulo}\n⚡ *Prioridade:* {prioridade}\n👤 *Responsável:* {responsavel}\n${FIM_DO_CHAMADO}`,
  sem_dono: `🙋 *{aviso}*\n🔎 *Painel:* {painel} · {etapa}\n📌 *Card:* {codigo} · {titulo}\n⚡ *Prioridade:* {prioridade}\n${FIM_DO_CHAMADO}`,
  critico: `🔴 *{aviso}*\n🔎 *Painel:* {painel}\n📌 *Card:* {codigo} · {titulo}\n📝 *Relato:* {relato}\n👤 *Quem abriu:* {quem}\n${FIM_DO_CHAMADO}`,
  observador: '🔎 *Painel:* {painel}\n📌 *Card:* {codigo} · {titulo}\n🔔 *Novidade:* {novidade}\n📝 *Nota:* {nota}\n👤 *Quem:* {quem}\n👨‍💼 *Cliente:* {cliente}\n🔗 *Link do Card/Painel:* {link}',
  lembrete: '⏰ *Lembrete:* {evento}\n🗓️ *Quando:* {quando}\n📍 *Local:* {local}\n👨‍💼 *Cliente:* {cliente}\n📌 *Chamado:* {chamado}\n📝 *Observação:* {observacao}\n🔗 *Link:* {link}',
  evento_novo: '🗓️ *Novo no calendário:* {evento}\n⏰ *Quando:* {quando}\n📍 *Local:* {local}\n👨‍💼 *Cliente:* {cliente}\n📌 *Chamado:* {chamado}\n👥 *Pessoas:* {pessoas}\n📝 *Observação:* {observacao}\n👤 *Quem pôs:* {quem}\n🔗 *Link:* {link}',
});

/** O tamanho de cada mensagem: até 2.000 letras escritas; a mensagem cheia vai até 4.000 (o WhatsApp aceita 4.096). */
export const MAX_MODELO_DO_AVISO = 2000;
const MAX_MENSAGEM_DO_AVISO = 4000;

/** A mensagem que vale para o aviso: a escrita nos Ajustes ou, sem ela, a padrão. */
export function modeloDoAviso(modelos: Partial<Record<EventoAviso, string>> | null | undefined, e: EventoAviso): string {
  const escrito = modelos?.[e];
  return escrito && escrito.trim() ? escrito : MODELOS_DOS_AVISOS_PADRAO[e];
}

/** As palavras entre chaves que parecem variável ({cotato}, {Cliente}…). */
const PALAVRA_ENTRE_CHAVES = /\{([A-Za-zÀ-ÿ_]+)\}/g;

/** As variáveis escritas que o aviso não conhece (o erro de digitação: "{cotato}" sairia assim no WhatsApp). */
export function variaveisDesconhecidas(e: EventoAviso, modelo: string): string[] {
  const conhecidas = new Set(variaveisDoAviso(e).map((v) => v.chave));
  const fora = [...modelo.matchAll(PALAVRA_ENTRE_CHAVES)].map((m) => m[1]!).filter((k) => !conhecidas.has(k.toLowerCase()));
  return [...new Set(fora)].map((k) => `{${k}}`);
}

export type ValoresDoAviso = Partial<Record<string, string | null>>;

/**
 * A mensagem pronta: cada variável troca pelo valor (sem distinguir maiúscula) e a linha em que todas as
 * variáveis vieram vazias não vai. O que não é variável do aviso fica como foi escrito. Linhas em branco
 * seguidas viram uma só.
 */
export function preencherAviso(e: EventoAviso, modelo: string, valores: ValoresDoAviso): string {
  const conhecidas = new Set(variaveisDoAviso(e).map((v) => v.chave));
  const linhas = modelo.replace(/\r\n?/g, '\n').split('\n').flatMap((linha) => {
    let usadas = 0;
    let cheias = 0;
    const nova = linha.replace(PALAVRA_ENTRE_CHAVES, (todo, k: string) => {
      const chave = k.toLowerCase();
      if (!conhecidas.has(chave)) return todo;
      usadas++;
      const v = (valores[chave] ?? '').trim();
      if (v) cheias++;
      return v;
    });
    return usadas > 0 && cheias === 0 ? [] : [nova.trimEnd()];
  });
  const texto = linhas.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  return texto.length > MAX_MENSAGEM_DO_AVISO ? `${texto.slice(0, MAX_MENSAGEM_DO_AVISO - 1).trimEnd()}…` : texto;
}

/** Os valores de exemplo de cada aviso: a prévia nos Ajustes e o "Mandar o exemplo". */
const EXEMPLO_DO_CHAMADO: ValoresDoAviso = {
  painel: 'Suporte', etapa: 'N1', codigo: 'SUP-12', titulo: 'LineChat - Labchecap - MarIA Espirometria', prioridade: 'Alta',
  cliente: 'Labchecap', contato: 'Maria', responsavel: 'Luan França', assunto: 'LineChat › Robô',
  relato: 'A MarIA parou de responder os pacientes desde ontem à noite.', link: 'https://gestao.inglinesystems.com.br/atendimento/SUP-12',
};
export const EXEMPLOS_DOS_AVISOS: Readonly<Record<EventoAviso, ValoresDoAviso>> = Object.freeze({
  recebeu: { ...EXEMPLO_DO_CHAMADO, aviso: 'Você recebeu o chamado SUP-12', quem: 'Lúcio Andrade' },
  citado: { ...EXEMPLO_DO_CHAMADO, aviso: 'Lúcio Andrade citou você no SUP-12', quem: 'Lúcio Andrade', nota: '@Luan França, consegue olhar o fluxo da MarIA hoje?' },
  etapa: { ...EXEMPLO_DO_CHAMADO, etapa: 'N2', aviso: 'SUP-12 chegou em N2', quem: 'Lúcio Andrade' },
  prazo_perto: { ...EXEMPLO_DO_CHAMADO, aviso: 'O prazo de solução do SUP-12 está perto de vencer: faltam 45 min úteis' },
  prazo_vencido: { ...EXEMPLO_DO_CHAMADO, aviso: 'O prazo de solução do SUP-12 venceu' },
  sem_dono: { ...EXEMPLO_DO_CHAMADO, etapa: 'Novo', responsavel: '', aviso: 'O SUP-12 está sem responsável há mais de 30 min' },
  critico: { ...EXEMPLO_DO_CHAMADO, etapa: 'Novo', prioridade: 'Crítica', aviso: 'Chegou um chamado Crítico: SUP-12', quem: 'Lúcio Andrade' },
  observador: { ...EXEMPLO_DO_CHAMADO, aviso: 'Lúcio Andrade anotou no SUP-12', novidade: '', quem: 'Lúcio Andrade', nota: 'Encaminhado para Luan' },
  lembrete: {
    aviso: 'Lembrete: Visita — Clínica Aurora, amanhã, 21/10, às 09:00', evento: 'Visita — Clínica Aurora', tipo: 'Visita',
    quando: 'amanhã, 21/10, às 09:00', local: 'Av. Tancredo Neves, 1632 — Salvador', cliente: 'Clínica Aurora', chamado: 'SUP-12',
    pessoas: 'Luan França, Lúcio Andrade', paineis: 'Suporte', observacao: 'Levar o aparelho reserva.',
    link: 'https://gestao.inglinesystems.com.br/calendario?mes=2026-10&dia=2026-10-21',
  },
  evento_novo: {
    aviso: 'Luan França pôs no calendário: Visita — Clínica Aurora, amanhã, 21/10, às 09:00', quem: 'Luan França', evento: 'Visita — Clínica Aurora',
    tipo: 'Visita', quando: 'amanhã, 21/10, às 09:00', local: 'Av. Tancredo Neves, 1632 — Salvador', cliente: 'Clínica Aurora', chamado: 'SUP-12',
    pessoas: 'Luan França, Lúcio Andrade', paineis: 'Suporte', observacao: 'Levar o aparelho reserva.',
    link: 'https://gestao.inglinesystems.com.br/calendario?mes=2026-10&dia=2026-10-21',
  },
});

/** As mensagens escritas nos Ajustes (sem a do aviso = a padrão). Cada uma até 2.000 letras e só com as variáveis do aviso. */
export const ModelosDosAvisosSchema = z.object(
  Object.fromEntries(EVENTOS_AVISO.map((e) => [e, z.string().max(MAX_MODELO_DO_AVISO, `A mensagem do aviso "${NOME_EVENTO_AVISO[e].titulo}" passou de 2.000 letras.`).optional()])) as
    Record<EventoAviso, z.ZodOptional<z.ZodString>>,
).superRefine((m, ctx) => {
  for (const e of EVENTOS_AVISO) {
    const fora = variaveisDesconhecidas(e, m[e] ?? '');
    if (fora.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom, path: [e],
        message: `Na mensagem do aviso "${NOME_EVENTO_AVISO[e].titulo}", ${fora.join(', ')} não ${fora.length === 1 ? 'é variável' : 'são variáveis'} dele: confira o nome (os botões põem certo).`,
      });
    }
  }
});
export type ModelosDosAvisos = Partial<Record<EventoAviso, string>>;

/** Para guardar: só as que mudaram da padrão (a vazia e a igual à padrão voltam a seguir a padrão). */
export function modelosParaGuardar(m: ModelosDosAvisos | null | undefined): ModelosDosAvisos {
  const fica = (e: EventoAviso) => {
    const t = m?.[e]?.replace(/\r\n?/g, '\n').trim();
    return t && t !== MODELOS_DOS_AVISOS_PADRAO[e] ? t : null;
  };
  return Object.fromEntries(EVENTOS_AVISO.flatMap((e) => { const t = fica(e); return t ? [[e, t]] : []; })) as ModelosDosAvisos;
}

/**
 * Como a mensagem ao cliente sai pelo número oficial (o pedido do Luan na prévia: "vou usar no meu
 * WhatsApp oficial, então temos que usar os templates pré-criados na plataforma"): pelo modelo aprovado
 * — o WhatsApp oficial só começa conversa com ele —, ou texto livre (só até 24 h depois da última
 * mensagem do cliente; passou disso, vai o modelo).
 */
export const ENVIOS_AO_CLIENTE = ['modelo', 'texto'] as const;
export type EnvioAoCliente = (typeof ENVIOS_AO_CLIENTE)[number];
/** O arquivo do cabeçalho do modelo, como o LineChat diz (UNDEFINED = sem arquivo). */
export const TIPOS_ARQUIVO_DO_MODELO = ['UNDEFINED', 'IMAGE', 'VIDEO', 'DOCUMENT'] as const;
export type TipoArquivoDoModelo = (typeof TIPOS_ARQUIVO_DO_MODELO)[number];
export const NOME_TIPO_ARQUIVO_DO_MODELO: Record<TipoArquivoDoModelo, string> = { UNDEFINED: 'sem arquivo', IMAGE: 'imagem', VIDEO: 'vídeo', DOCUMENT: 'documento' };
/**
 * O modelo aprovado (template) da API do LineChat (`POST /chat/v1/message/send`, `body.templateId`,
 * `body.parameters` e `body.fileUrl`): o id, as variáveis — cada uma com o que vai nela, um texto com os
 * marcadores do chamado — e o arquivo do cabeçalho, quando o modelo tem imagem, vídeo ou documento.
 */
export const ModeloAprovadoSchema = z.object({
  id: z.string().trim().min(1, 'Escolha o modelo aprovado (ou escreva o id dele)').max(120),
  /** o nome do modelo no LineChat (para mostrar) */
  nome: z.string().trim().max(200).default(''),
  /** o texto do modelo como foi aprovado (para a prévia), com as variáveis {{nome}} */
  texto: z.string().max(2000).default(''),
  variaveis: z.array(z.object({
    /** o nome da variável no modelo, como o LineChat mostra (ex.: 1, nome, chamado) */
    nome: z.string().trim().min(1, 'Escreva o nome da variável').max(60),
    /** o que vai nela: um texto com os marcadores {contato}, {codigo}, {titulo}, {cliente}, {texto}… */
    valor: z.string().trim().max(1000),
  })).max(20).default([])
    .refine((vs) => new Set(vs.map((v) => v.nome.toLowerCase())).size === vs.length, 'Uma variável repetida no modelo'),
  tipoArquivo: z.enum(TIPOS_ARQUIVO_DO_MODELO).default('UNDEFINED'),
  /** a URL pública do arquivo do cabeçalho (`fileUrl`) */
  arquivo: z.string().trim().max(500).default('')
    .refine((u) => !u || /^https:\/\/\S+$/i.test(u), 'O arquivo do cabeçalho precisa de um endereço com https://'),
});
export type ModeloAprovado = z.infer<typeof ModeloAprovadoSchema>;

/** O WhatsApp dos chamados: o número oficial para o cliente, um não oficial para a equipe. */
export const AvisosChamadosSchema = z.object({
  /** liga o envio pelo WhatsApp (os avisos na tela valem sempre) */
  ativo: z.boolean(),
  /** a API de mensagens (a mesma plataforma do LineChat): https://api…/chat/v1/message/send */
  url: z.string().trim().url('Endereço inválido').max(300),
  /** usar a chave do LineChat (a da leitura dos chamados), ou uma própria */
  usarChaveDoLineChat: z.boolean(),
  /** a chave própria (vai para o cofre; vazio = mantém a guardada) */
  chave: z.string().trim().max(500).optional(),
  numeroCliente: z.string().trim().max(30).transform((v) => numeroWhatsApp(v) ?? ''),
  numeroEquipe: z.string().trim().max(30).transform((v) => numeroWhatsApp(v) ?? ''),
  /** como a mensagem ao cliente sai: pelo modelo aprovado (o WhatsApp oficial exige) ou texto livre */
  envioCliente: z.enum(ENVIOS_AO_CLIENTE).default('modelo'),
  /** o texto livre ao cliente: {contato}, {codigo}, {titulo}, {cliente}, {texto} */
  modeloCliente: z.string().trim().max(2000),
  /** o modelo aprovado (template) do número oficial: sempre, ou só depois das 24 h no texto livre */
  template: ModeloAprovadoSchema.nullable().default(null),
  /** a equipe do LineChat que fica com a conversa que a mensagem abrir (`department.name`; vazio = o LineChat decide) */
  equipeLineChat: z.string().trim().max(120).default(''),
  /** quem manda a mensagem fica com a conversa que ela abrir, pelo e-mail (o mesmo do LineChat: `user.email`) */
  atribuirAQuemManda: z.boolean().default(false),
  // (o WhatsApp de cada pessoa saiu daqui no 2.0.1: mora no usuário, em Administração › Usuários)
  eventos: z.object(Object.fromEntries(EVENTOS_AVISO.map((e) => [e, CanaisSchema])) as Record<EventoAviso, typeof CanaisSchema>),
  /** a mensagem de cada aviso no WhatsApp da equipe (2.0.2); sem a do aviso, vale a padrão */
  modelos: ModelosDosAvisosSchema.default({}),
});
export type AvisosChamadosGravar = z.infer<typeof AvisosChamadosSchema>;

export const EVENTOS_WEBHOOK = ['chamado.criado', 'chamado.alterado', 'chamado.movido', 'chamado.anotacao', 'chamado.resolvido', 'chamado.fechado'] as const;
export type EventoWebhook = (typeof EVENTOS_WEBHOOK)[number];
export const NOME_EVENTO_WEBHOOK: Record<EventoWebhook, string> = {
  'chamado.criado': 'Chamado criado', 'chamado.alterado': 'Chamado alterado (campos)', 'chamado.movido': 'Chamado movido de etapa',
  'chamado.anotacao': 'Anotação nova', 'chamado.resolvido': 'Chamado resolvido', 'chamado.fechado': 'Chamado fechado',
};
export const WebhookGravarSchema = z.object({
  nome: z.string().trim().min(1).max(60),
  url: z.string().trim().url('Endereço inválido').max(500).refine((u) => /^https:\/\//i.test(u), 'O endereço precisa começar com https://'),
  eventos: z.array(z.enum(EVENTOS_WEBHOOK)).min(1, 'Escolha pelo menos um evento'),
  ativo: z.boolean().default(true),
  /** gerar uma assinatura nova (o segredo aparece uma vez) */
  novoSegredo: z.boolean().default(false),
});
export const ChaveCriarSchema = z.object({ nome: z.string().trim().min(1, 'Dê um nome (ex.: n8n, robô do LineChat)').max(60) });
/** Os sites que podem abrir o Gestor dentro deles (o menu do LineChat, outros programas). */
export const LinkConversaSchema = z.object({
  linkConversa: z.string().trim().max(300).refine((s) => !s || (/^https:\/\//i.test(s) && s.includes('{sessao}')), 'Use um endereço com https:// e o {sessao} no lugar do número da conversa'),
});
export const SitesIframeSchema = z.object({
  sites: z.array(z.string().trim().max(200).transform((s) => s.replace(/\/+$/, '')).refine((s) => /^https:\/\/[a-z0-9.-]+(:\d+)?$/i.test(s), 'Use só o endereço do site, com https:// e sem caminho (ex.: https://app.inglinechat.com.br)')).max(20),
});

/** O que o robô do LineChat (ou o n8n) manda para abrir um chamado. Tudo é opcional, menos algo que diga do que se trata. */
export const EntradaChamadoSchema = z.object({
  /** a sigla ou o id do painel; sem painel = o primeiro (o Suporte) */
  painel: z.string().trim().max(60).optional(),
  titulo: z.string().trim().max(200).optional(),
  relato: z.string().max(20_000).optional(),
  /** o que a equipe lê (o relato é o que o cliente disse) */
  descricao: z.string().max(20_000).optional(),
  telefone: z.string().trim().max(40).optional(),
  nome: z.string().trim().max(120).optional(),
  sessaoId: z.string().trim().max(120).optional(),
  clienteId: z.string().trim().max(60).optional(),
  assunto: z.string().trim().max(200).optional(),
  prioridade: z.enum(PRIORIDADES).optional(),
  etiquetas: z.array(EtiquetaSchema).max(20).optional(),
  /** os campos do painel, pelo nome ou pelo id ({"Sistema": "LinePBX"}) */
  campos: ValoresEntradaSchema.optional(),
}).refine((e) => !!(e.titulo || e.relato || e.telefone || e.sessaoId), 'Mande pelo menos o título, o relato, o telefone ou a sessão');
/** O n8n mexendo num chamado (a NIA, as atualizações). */
export const IntegracaoAlterarSchema = ChamadoAlterarSchema.extend({
  /** o assunto pelo nome ou pelo caminho ("Ramal › Configuração") */
  assunto: z.string().trim().max(200).optional(),
});

// =====================================================================
//  OS FORMATOS DE SAÍDA (o que a tela recebe)
// =====================================================================

export type PessoaCurta = { id: string; nome: string };
export type AssuntoCurto = { id: string; nome: string; caminho: string; ativo: boolean };
export type Assunto = { id: string; painelId: string; paiId: string | null; nome: string; descricao: string | null; ativo: boolean; ordem: number; checklist: string[]; dePara: string[] };

/** O chamado no quadro e na lista. */
export type CartaoChamado = {
  id: string;
  codigo: string;
  numero: number;
  tipoChamado: TipoChamado;
  titulo: string;
  painelId: string;
  etapaId: string;
  situacao: SituacaoDoChamado;
  nivel: Nivel | null;
  cliente: { id: string; nome: string } | null;
  contato: { nome: string | null; telefone: string | null } | null;
  responsavel: PessoaCurta | null;
  prioridade: Prioridade | null;
  gravidade: Gravidade | null;
  alcance: Alcance | null;
  tipo: string | null;
  assunto: AssuntoCurto | null;
  produtos: Array<{ id: string; nome: string; cor: string }>;
  operadoras: Array<{ id: string; nome: string }>;
  etiquetas: string[];
  /** os campos do painel que têm valor (só os ativos do painel do chamado), pelo id do campo */
  campos: ValoresDosCampos;
  espera: { tipo: TipoEspera; motivo: string | null; desde: string } | null;
  prazos: { resposta: EstadoPrazo; solucao: EstadoPrazo };
  pai: { id: string; codigo: string } | null;
  problema: { id: string; codigo: string } | null;
  filhos: { total: number; abertos: number };
  /** no problema: quantos incidentes ele junta */
  incidentes: number;
  anotacoes: number;
  origem: Origem;
  reaberto: number;
  criadoEm: string;
  atualizadoEm: string;
  ultimaAtividadeEm: string;
  resolvidoEm: string | null;
  fechadoEm: string | null;
  /** a negociação (painel de Vendas): o valor em centavos e a empresa que ainda não é cliente */
  valor: number | null;
  /** a negociação: a mensalidade de cada produto, pelo id (vazio: o valor é um só; com ela, o valor é o total) */
  valoresDosProdutos: ValoresDosProdutos;
  /** a negociação: a ativação (paga uma vez: não soma no quadro nem na meta; o relatório tem as contas dela) */
  ativacao: number | null;
  /** a ativação de cada produto, pelo id */
  ativacoesDosProdutos: ValoresDosProdutos;
  empresa: string | null;
  /** como acabou (a etapa final do painel de Vendas: Ganho ou Perdido) e, no Perdido, o motivo */
  resultado: ResultadoDaVenda | null;
  motivoPerda: string | null;
  /**
   * O lugar na coluna do quadro que a equipe escolheu arrastando (2.0.4.1, só nas etapas abertas do painel de
   * Vendas: `ordemAMao`): 1 é o primeiro. Nulo: ninguém arrumou depois que ela chegou na etapa (mudar de etapa
   * apaga), e ela vai pela regra de sempre, antes das arrumadas.
   */
  ordemNoQuadro: number | null;
};

export const TIPOS_EVENTO = [
  'criado', 'etapa', 'responsavel', 'campo', 'prioridade', 'espera', 'ligacao', 'pai', 'filho', 'problema', 'incidente',
  'checklist', 'tempo', 'operadora', 'aviso_cliente', 'aviso_equipe', 'reaberto', 'painel', 'ia', 'resposta_pronta',
  'cliente_respondeu', 'prazo', 'fechou_sozinho', 'observador', 'lixeira',
  // uma linha do histórico do Helena que não tem um jeito do Gestor ("A etiqueta X foi adicionada"): 2.0.3
  'helena',
] as const;
export type TipoEvento = (typeof TIPOS_EVENTO)[number];
export type EventoChamado = {
  id: string;
  tipo: TipoEvento;
  em: string;
  /** quem fez (nulo = o próprio Gestor, ou uma integração: `porNome`) */
  por: PessoaCurta | null;
  porNome: string | null;
  dados: Record<string, any>;
  /** a frase pronta ("escalonou de N1 para N2: o cliente precisa de rota") */
  texto: string;
};

export type AnexoChamado = { id: string; nome: string; tipo: string; tamanho: number; imagem: boolean; url: string };
export type AnotacaoChamado = {
  id: string; texto: string; por: PessoaCurta | null; porNome: string | null; em: string; anexos: AnexoChamado[]; podeApagar: boolean;
  /** quem a anotação citou com @ (e recebeu o aviso) */
  citados: PessoaCurta[];
};
export type TempoGasto = { id: string; minutos: number; nota: string | null; dia: string; por: PessoaCurta | null; em: string; podeApagar: boolean };
export type CasoOperadora = {
  id: string; operadora: { id: string | null; nome: string }; protocolo: string; abertoEm: string; prometidoPara: string | null;
  cobrarACadaHoras: number | null; proximaCobrancaEm: string | null; situacao: 'aberto' | 'fechado'; fechadoEm: string | null;
  andamentos: Array<{ em: string; por: string | null; texto: string; acao: 'abriu' | 'cobrou' | 'fechou' }>;
};
export type PassoTrajetoria = { etapa: string; nivel: Nivel | null; desde: string; ate: string | null; minutos: number; motivo: string | null; por: string | null; sentido: 'sobe' | 'desce' | null };
export type LigacaoMostradaChamado = { id: string; tipo: TipoLigacaoChamado; texto: string; chamado: CartaoChamado };
export type ReferenciaMostrada = { codigo: string; existe: boolean; titulo: string | null; situacao: string | null; /** id do chamado do Gestor */ id: string | null; /** card antigo do LineChat */ url: string | null };

/** O chamado inteiro (a ficha). */
export type FichaChamado = CartaoChamado & {
  relato: string | null;
  descricao: string | null;
  solucao: string | null;
  causa: string | null;
  contorno: string | null;
  validacao: string | null;
  motivoPrioridade: string | null;
  prioridadeSugerida: Prioridade | null;
  sessaoId: string | null;
  /** o link da conversa no LineChat (com a sessão) */
  conversaUrl: string | null;
  checklist: ItemChecklist[];
  observadores: PessoaCurta[];
  /** quem pode ser citado com @ nas anotações: as pessoas ativas que veem o painel */
  citaveis: PessoaCurta[];
  criadoPor: PessoaCurta | null;
  esperas: Espera[];
  filhosLista: CartaoChamado[];
  incidentesLista: CartaoChamado[];
  ligacoes: LigacaoMostradaChamado[];
  referencias: ReferenciaMostrada[];
  anotacoesLista: AnotacaoChamado[];
  historico: EventoChamado[];
  tempo: { total: number; itens: TempoGasto[] };
  operadora: CasoOperadora[];
  trajetoria: PassoTrajetoria[];
  /** etapa (id) → o que falta para entrar nela */
  faltam: Record<string, Array<Obrigatorio | 'validacao' | 'motivoPerda'>>;
  /** etapa (id) → os filhos que travam (vazio = nada trava) */
  filhosTravam: Record<string, string[]>;
  grafo: GrafoChamado;
  observando: boolean;
  pode: { trabalhar: boolean; cuidar: boolean };
};

export type NoGrafo = { id: string; codigo: string; titulo: string; situacao: SituacaoDoChamado; tipoChamado: TipoChamado; centro: boolean; profundidade: number };
export type ArestaGrafo = { de: string; para: string; tipo: 'filho' | 'incidente' | 'citado' | TipoLigacaoChamado };
export type GrafoChamado = { nos: NoGrafo[]; arestas: ArestaGrafo[]; cortado: boolean };

export type Agendado = {
  id: string; painelId: string; titulo: string; relato: string | null; clienteId: string | null; clienteNome: string | null;
  responsavelId: string | null; responsavelNome: string | null; assuntoId: string | null; prioridade: Prioridade | null; checklist: string[];
  regra: RegraAgendado; textoRegra: string; ativo: boolean; proximaEm: string | null; ultimaEm: string | null; ultimoCodigo: string | null;
};

export type OpcoesAtendimento = {
  paineis: Painel[];
  pessoas: Array<PessoaCurta & { ativo: boolean }>;
  assuntos: Assunto[];
  /** os campos dos painéis (os desativados também: o chamado antigo pode ter valor neles), na ordem */
  campos: CampoPersonalizado[];
  produtos: Array<{ id: string; nome: string; cor: string }>;
  operadoras: Array<{ id: string; nome: string }>;
  /**
   * as etiquetas, com a cor, de cada painel que a pessoa vê (2.0.3: cada painel tem as suas) — as do catálogo
   * do painel e as usadas nos chamados dele (para sugerir e desenhar; a de um painel que ela não vê não aparece).
   * Para um painel, `etiquetasDoPainel`.
   */
  etiquetas: EtiquetaNoPainel[];
  prazos: AjustesPrazos;
  /** o WhatsApp está pronto para mandar ao cliente? e à equipe? */
  whatsapp: {
    cliente: boolean; equipe: boolean;
    /**
     * a mensagem ao cliente, para a ficha preencher com o chamado e mostrar antes de mandar (pelo modelo
     * aprovado ou no texto livre); nula quando o cliente não está pronto
     */
    mensagemCliente: MensagemAoCliente | null;
  };
  ia: { ativa: boolean; modelo: string | null };
  /**
   * A NIA (2.0.4.1, a IA do suporte no n8n): as etiquetas do combinado com o fluxo dela, para o botão da ficha
   * (`resumoDaNia`). Nula quando o botão está desligado nos Ajustes › IA.
   */
  nia: { pedir: string; pronto: string; erro: string } | null;
  /** o endereço do LineChat (para abrir a conversa e o card antigo) */
  linechatUrl: string | null;
  /**
   * o modelo do link da conversa (Painéis › Ajustes › Integrações, "https://…/{sessao}"), para a tela achar a
   * sessão no link colado e mostrar o link antes de salvar (2.0.4.1); nulo sem modelo
   */
  linkConversa: string | null;
  pode: { trabalhar: boolean; cuidar: boolean; integrar: boolean };
};

/** Uma coluna do quadro; no painel de Vendas, `valor` é a soma (em centavos) das negociações dela (as escondidas também). */
export type ColunaQuadro = { etapa: EtapaPainel; chamados: CartaoChamado[]; total: number; escondidos: number; valor: number };
export type QuadroAtendimento = { painelId: string; colunas: ColunaQuadro[]; foraDoHorario: boolean; agora: string };

export const TIPOS_AVISO = ['recebeu', 'citado', 'etapa', 'prazo_perto', 'prazo_vencido', 'sem_dono', 'critico', 'cliente_respondeu', 'pai', 'observador', 'lembrete', 'evento_novo'] as const;
export type TipoAviso = (typeof TIPOS_AVISO)[number];
/** Um aviso do sininho: de um chamado, ou (2.0.2) o lembrete de um evento do calendário. */
export type AvisoNaTela = {
  id: string; tipo: TipoAviso; texto: string;
  chamado: { id: string; codigo: string; titulo: string } | null;
  /** o evento do calendário do lembrete (o primeiro dia, para abrir o calendário nele) */
  evento: { id: string; titulo: string; inicio: string } | null;
  em: string; lido: boolean;
};
export type AvisosNaTela = { naoLidos: number; itens: AvisoNaTela[] };

/**
 * A tela inicial dos chamados (os painéis, como no Helena: o Luan escolhe o quadro ali, e não numa
 * faixa de abas que não cabe quando houver muitos painéis): os números de cada painel.
 */
export type ResumoDoPainel = {
  painelId: string;
  /** em aberto (fora do Resolvido e do Fechado) */
  abertos: number;
  /** abertos com quem está vendo */
  meus: number;
  /** abertos sem responsável */
  semDono: number;
  /** abertos com a resposta ou a solução vencida */
  vencidos: number;
  /** abertos perto de vencer (e ainda não vencidos) */
  perto: number;
  /** abertos esperando o cliente ou a operadora */
  esperando: number;
  /** no Resolvido: esperam o cliente confirmar (ou fecham sozinhos) */
  resolvidos: number;
  /** quantos em cada etapa que não fecha, na ordem do painel */
  porEtapa: Array<{ etapaId: string; total: number }>;
  /** o último movimento num chamado do painel */
  ultimaAtividadeEm: string | null;
  /** no painel de Vendas: o que está em negociação e o que foi ganho no mês (com a meta) */
  vendas: {
    emAndamento: number; emAndamentoQtd: number;
    ganhoNoMes: number; ganhosNoMes: number; perdidosNoMes: number;
    metaMensal: number | null;
  } | null;
};

export type MeuDia = {
  meus: CartaoChamado[];
  vencendo: CartaoChamado[];
  semDono: CartaoChamado[];
  esperandoCliente: CartaoChamado[];
  observando: CartaoChamado[];
  agendadosHoje: Array<{ id: string; titulo: string; hora: string; painelId: string }>;
  fechadosHoje: number;
  abertosHoje: number;
};

export type AvisosChamadosTela = Omit<AvisosChamadosGravar, 'chave'> & {
  temChavePropria: boolean;
  temChaveLineChat: boolean;
  /**
   * as pessoas ativas e o WhatsApp de cada uma (vazio = sem número), só para ler: o número se muda em
   * Administração › Usuários (2.0.1). `ativo` falso = pausada (tem o número, mas não recebe)
   */
  pessoas: Array<{ userId: string; nome: string; numero: string; ativo: boolean }>;
  ultimoTesteEm: string | null; ultimoTesteOk: boolean | null; ultimoTesteMsg: string | null;
};
export const AVISOS_CHAMADOS_PADRAO: Omit<AvisosChamadosTela, 'pessoas' | 'temChavePropria' | 'temChaveLineChat'> = {
  ativo: false, url: 'https://api.inglinechat.com.br/chat/v1/message/send', usarChaveDoLineChat: true,
  // o número oficial do suporte, o mesmo do "não ajudou" do portal
  numeroCliente: '557130348350', numeroEquipe: '',
  envioCliente: 'modelo',
  modeloCliente: 'Olá, {contato}! Sobre o seu chamado {codigo} ({titulo}):\n\n{texto}\n\nEquipe de suporte Ingline',
  template: null, equipeLineChat: '', atribuirAQuemManda: false, eventos: EVENTOS_AVISO_PADRAO, modelos: {},
  ultimoTesteEm: null, ultimoTesteOk: null, ultimoTesteMsg: null,
};

export type WebhookTela = { id: string; nome: string; url: string; eventos: EventoWebhook[]; ativo: boolean; ultimoEm: string | null; ultimoOk: boolean | null; ultimaMsg: string | null; temSegredo: boolean };
export type ChaveApiTela = { id: string; nome: string; inicio: string; criadaEm: string; criadaPor: string | null; usadaEm: string | null; revogadaEm: string | null };
export type IntegracoesTela = {
  webhooks: WebhookTela[]; chaves: ChaveApiTela[];
  /** os sites que podem abrir o Gestor dentro deles */
  sites: string[];
  /** o modelo do link da conversa no LineChat, com {sessao} */
  linkConversa: string;
  /** o endereço do Gestor (para montar os exemplos de como ligar o robô e o n8n) */
  endereco: string;
};

export type SugestaoIa = {
  titulo: string | null; relato: string | null; descricao: string | null;
  assuntoId: string | null; tipo: string | null; gravidade: Gravidade | null; alcance: Alcance | null;
  produtos: string[]; etiquetas: string[]; resumo: string | null;
  /** de onde a IA leu: a conversa do LineChat, ou só o que está no chamado */
  fonte: 'conversa' | 'chamado';
  modelo: string; provedor: string; custo: number | null;
};

/** O cadastro do cliente na ficha e no abrir: os produtos, as operadoras, o que ele tem (o resumo do cartão da empresa) e os chamados recentes. */
export type CadastroDoCliente = {
  produtos: Array<{ id: string; nome: string; cor: string }>;
  operadoras: Array<{ id: string; nome: string }>;
  circuitos: Array<{ id: string; nome: string; operadora: string | null }>;
  dids: Array<{ id: string; numero: string; circuito: string | null }>;
  aparelhos: Array<{ id: string; nome: string }>;
  unidades: Array<{ id: string; nome: string }>;
  /** os chamados dos últimos 7 dias deste cliente (para reabrir em vez de abrir outro) */
  recentes: CartaoChamado[];
  /** os contatos dele (os ativos, pelo nome): o Abrir chamado puxa daqui */
  contatos: ContatoDoCliente[];
};

// =====================================================================
//  AS FRASES DO HISTÓRICO
// =====================================================================

const nomeNivel = (n: unknown) => (n ? ` (${rotuloDoNivel(n as number)})` : '');
/** Uma frase por evento, a mesma no servidor e na prévia. */
export function textoDoEvento(tipo: TipoEvento, d: Record<string, any>): string {
  switch (tipo) {
    // a negociação (o painel de Vendas) é criada; o chamado é aberto
    case 'criado': return `${d.venda ? 'criou a negociação' : 'abriu o chamado'}${d.origem && d.origem !== 'manual' ? ` (${NOME_ORIGEM[d.origem as Origem] ?? d.origem}${d.noHelena ? `, era ${d.noHelena}` : ''})` : ''}${d.etapa ? ` em ${d.etapa}` : ''}`;
    case 'etapa': {
      // a negociação que acabou: "marcou como ganho (R$ 12.000,00/mês), estava em Negociação" (o valor é a mensalidade)
      if (d.resultado === 'ganho') return `marcou como ganho${typeof d.valor === 'number' ? ` (${reais(d.valor)}/mês)` : ''}, estava em ${d.de?.nome ?? '?'}${d.concluidoEm ? ` — fechou em ${diaComAno(d.concluidoEm)}` : ''}`;
      if (d.resultado === 'perdido') return `marcou como perdido${d.motivoPerda ? `: ${d.motivoPerda}` : ''} (estava em ${d.de?.nome ?? '?'})${d.concluidoEm ? ` — em ${diaComAno(d.concluidoEm)}` : ''}`;
      const verbo = d.sentido === 'sobe' ? 'escalonou' : d.sentido === 'desce' ? 'voltou de nível' : 'moveu';
      return `${verbo} de ${d.de?.nome ?? '?'}${nomeNivel(d.de?.nivel)} para ${d.para?.nome ?? '?'}${nomeNivel(d.para?.nivel)}${d.motivo ? `: ${d.motivo}` : ''}`;
    }
    case 'responsavel': return d.para ? (d.de ? `passou de ${d.de.nome} para ${d.para.nome}` : `ficou com ${d.para.nome}`) : `tirou o responsável${d.de ? ` (${d.de.nome})` : ''}`;
    // texto longo (relato, descrição, solução): o histórico diz só que mudou (o texto está no chamado)
    case 'campo': return d.longo ? `editou ${d.campo}` : `mudou ${d.campo}${d.de ? ` de "${d.de}"` : ''} para ${d.para ? `"${d.para}"` : '(vazio)'}`;
    case 'prioridade': return `mudou a prioridade${d.de ? ` de ${NOME_PRIORIDADE[d.de as Prioridade] ?? d.de}` : ''} para ${d.para ? NOME_PRIORIDADE[d.para as Prioridade] ?? d.para : '(vazio)'}${d.sugerida && d.para !== d.sugerida ? ` (a sugerida era ${NOME_PRIORIDADE[d.sugerida as Prioridade]})` : ''}${d.motivo ? `: ${d.motivo}` : ''}`;
    case 'espera': return d.tipo ? `marcou: ${NOME_ESPERA[d.tipo as TipoEspera]}${d.motivo ? ` (${d.motivo})` : ''}` : `tirou a marca de espera${d.antes ? ` (${NOME_ESPERA[d.antes as TipoEspera]})` : ''}${d.minutos ? `, depois de ${d.duracao ?? ''}` : ''}`;
    case 'ligacao': return `${d.acao === 'desligou' ? 'desligou' : 'ligou'} ${d.texto ?? NOME_LIGACAO[d.tipo as TipoLigacaoChamado]?.de ?? d.tipo} ${d.com}`;
    case 'pai': return d.acao === 'tirou' ? `deixou de ser filho de ${d.pai}` : `virou filho de ${d.pai}`;
    case 'filho': return d.acao === 'tirou' ? `${d.filho} deixou de ser filho deste` : `ganhou o filho ${d.filho}${d.painel ? ` (${d.painel})` : ''}`;
    case 'problema': return d.acao === 'tirou' ? `deixou de ser incidente do problema ${d.problema}` : `virou incidente do problema ${d.problema}`;
    case 'incidente': return d.acao === 'tirou' ? `${d.incidente} deixou de ser incidente deste problema` : `juntou o incidente ${d.incidente}`;
    case 'checklist': return d.acao === 'incluiu' ? `incluiu no checklist: ${d.item}` : d.acao === 'tirou' ? `tirou do checklist: ${d.item}` : `${d.feito ? 'marcou' : 'desmarcou'} no checklist: ${d.item}`;
    case 'tempo': return `registrou ${d.duracao ?? `${d.minutos} min`} de trabalho${d.nota ? `: ${d.nota}` : ''}`;
    case 'operadora': return d.acao === 'abriu' ? `abriu chamado na ${d.operadora} (protocolo ${d.protocolo})` : d.acao === 'fechou' ? `a ${d.operadora} fechou o protocolo ${d.protocolo}${d.texto ? `: ${d.texto}` : ''}` : `cobrou a ${d.operadora} (protocolo ${d.protocolo})${d.texto ? `: ${d.texto}` : ''}`;
    case 'aviso_cliente': return d.ok ? `avisou o cliente pelo WhatsApp${d.modelo ? ' (com o modelo aprovado)' : ''}` : `tentou avisar o cliente pelo WhatsApp, mas não foi: ${d.erro ?? 'erro'}`;
    case 'aviso_equipe': return d.ok ? `o Gestor avisou ${d.para} pelo WhatsApp` : `o aviso para ${d.para} pelo WhatsApp não foi: ${d.erro ?? 'erro'}`;
    case 'reaberto': return `reabriu ${d.venda ? 'a negociação' : 'o chamado'}${d.motivo ? `: ${d.motivo}` : ''}`;
    case 'painel': return `passou do painel ${d.de} para ${d.para}`;
    case 'ia': return `preencheu com a IA: ${(d.campos as string[] | undefined)?.join(', ') || 'nada mudou'}`;
    case 'resposta_pronta': return `usou a resposta pronta "${d.nome}"`;
    case 'cliente_respondeu': return d.reabriu ? `o cliente respondeu e o chamado reabriu: "${d.texto}"` : `o cliente respondeu: "${d.texto}"`;
    case 'prazo': return d.texto ?? 'alerta de prazo';
    case 'fechou_sozinho': return `fechou sozinho: ${d.dias} ${d.dias === 1 ? 'dia útil' : 'dias úteis'} no ${d.etapa ?? 'Resolvido'} sem resposta do cliente`;
    case 'observador': return d.acao === 'saiu' ? `deixou de observar` : `passou a observar`;
    case 'lixeira': return d.acao === 'restaurou' ? 'restaurou da lixeira' : 'mandou para a lixeira';
    // a linha do Helena como estava escrita lá ("A etiqueta P/R Ingline foi adicionada")
    case 'helena': return `no Helena: ${d.texto ?? ''}`;
    default: return String(tipo);
  }
}

/** "R$ 12 mil", "R$ 1,2 mi" — o valor curto, para o alto das colunas e os números grandes. */
export function reaisCurto(centavos: number): string {
  const r = centavos / 100;
  if (Math.abs(r) >= 1_000_000) return `R$ ${(r / 1_000_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mi`;
  if (Math.abs(r) >= 10_000) return `R$ ${Math.round(r / 1000).toLocaleString('pt-BR')} mil`;
  return r.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
}
/** "R$ 12.500" (os centavos só quando há: "R$ 12.500,50") — o valor no cartão, na coluna e nos números. */
export function reaisInteiros(centavos: number): string {
  return (centavos / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: centavos % 100 ? 2 : 0, maximumFractionDigits: 2 });
}
/**
 * O valor escrito pela pessoa ("12.000", "12000,50", "R$ 1.234,56", "1,5 mil") em centavos; nulo se não
 * for um valor. Ponto como milhar, vírgula como decimal (o jeito do Brasil).
 */
export function lerReais(texto: string): number | null {
  let t = texto.trim().toLowerCase().replace(/r\$\s*/g, '').replace(/\s+/g, '');
  if (!t) return null;
  let mult = 1;
  if (t.endsWith('mil')) { mult = 1000; t = t.slice(0, -3); } else if (/(mi|milhão|milhões|milhao|milhoes)$/.test(t)) { mult = 1_000_000; t = t.replace(/(mi|milhão|milhões|milhao|milhoes)$/, ''); }
  if (!/^\d{1,3}(\.\d{3})*(,\d{1,2})?$|^\d+(,\d{1,2})?$/.test(t)) return null;
  const n = Number(t.replace(/\./g, '').replace(',', '.')) * mult;
  return Number.isFinite(n) ? Math.round(n * 100) : null;
}
/** O dia (AAAA-MM-DD) como a pessoa lê: 31/10/2026. */
export const diaComAno = (dia: string) => `${dia.slice(8, 10)}/${dia.slice(5, 7)}/${dia.slice(0, 4)}`;

// =====================================================================
//  A TRAJETÓRIA (quem passou, quando, por quê, quanto tempo em cada nível)
// =====================================================================

/**
 * A trajetória do chamado pelas etapas, a partir dos eventos de mudança de etapa (o pedido do
 * Miguel: a trajetória inteira, e não só quem está com o chamado agora).
 */
export function trajetoria(
  criadoEm: string,
  etapaInicial: { nome: string; nivel: Nivel | null },
  movimentos: Array<{ em: string; para: { nome: string; nivel: Nivel | null }; motivo: string | null; por: string | null; sentido: 'sobe' | 'desce' | null }>,
  agora: Date = new Date(),
): PassoTrajetoria[] {
  const passos: PassoTrajetoria[] = [{ etapa: etapaInicial.nome, nivel: etapaInicial.nivel, desde: criadoEm, ate: null, minutos: 0, motivo: null, por: null, sentido: null }];
  for (const m of [...movimentos].sort((a, b) => a.em.localeCompare(b.em))) {
    passos[passos.length - 1]!.ate = m.em;
    passos.push({ etapa: m.para.nome, nivel: m.para.nivel, desde: m.em, ate: null, minutos: 0, motivo: m.motivo, por: m.por, sentido: m.sentido });
  }
  for (const p of passos) p.minutos = Math.max(0, Math.round(((p.ate ? Date.parse(p.ate) : agora.getTime()) - Date.parse(p.desde)) / 60_000));
  return passos;
}

// =====================================================================
//  AS LIGAÇÕES NUM DESENHO
// =====================================================================

export type NoParaGrafo = { id: string; codigo: string; titulo: string; situacao: SituacaoDoChamado; tipoChamado: TipoChamado; paiId: string | null; problemaId: string | null };

/**
 * As ligações do chamado num desenho (o pedido do Luciu e do Carlos): o pai e os filhos, o problema e
 * os incidentes, as ligações feitas à mão e as citações no texto — até 2 passos do chamado, no máximo
 * 40 chamados (o resto fica de fora, e o desenho diz que cortou).
 */
export function grafoDeLigacoes(
  centroId: string,
  chamados: Map<string, NoParaGrafo>,
  ligacoes: Array<{ de: string; para: string; tipo: TipoLigacaoChamado }>,
  citacoes: Array<{ de: string; para: string }>,
  profundidade = 2,
  maximo = 40,
): GrafoChamado {
  const arestas: ArestaGrafo[] = [];
  for (const c of chamados.values()) {
    if (c.paiId && chamados.has(c.paiId)) arestas.push({ de: c.paiId, para: c.id, tipo: 'filho' });
    if (c.problemaId && chamados.has(c.problemaId)) arestas.push({ de: c.problemaId, para: c.id, tipo: 'incidente' });
  }
  for (const l of ligacoes) if (chamados.has(l.de) && chamados.has(l.para)) arestas.push({ de: l.de, para: l.para, tipo: l.tipo });
  const ja = new Set(arestas.map((a) => `${a.de}|${a.para}`));
  for (const c of citacoes) {
    if (c.de === c.para || !chamados.has(c.de) || !chamados.has(c.para)) continue;
    if (ja.has(`${c.de}|${c.para}`) || ja.has(`${c.para}|${c.de}`)) continue;
    ja.add(`${c.de}|${c.para}`);
    arestas.push({ de: c.de, para: c.para, tipo: 'citado' });
  }
  const vizinhos = new Map<string, string[]>();
  for (const a of arestas) {
    vizinhos.set(a.de, [...(vizinhos.get(a.de) ?? []), a.para]);
    vizinhos.set(a.para, [...(vizinhos.get(a.para) ?? []), a.de]);
  }
  const dist = new Map<string, number>([[centroId, 0]]);
  const fila = [centroId];
  let cortado = false;
  while (fila.length) {
    const atual = fila.shift()!;
    const d = dist.get(atual)!;
    if (d >= profundidade) continue;
    for (const v of vizinhos.get(atual) ?? []) {
      if (dist.has(v)) continue;
      if (dist.size >= maximo) { cortado = true; continue; }
      dist.set(v, d + 1);
      fila.push(v);
    }
  }
  const nos: NoGrafo[] = [...dist.entries()].map(([id, p]) => {
    const c = chamados.get(id)!;
    return { id, codigo: c.codigo, titulo: c.titulo, situacao: c.situacao, tipoChamado: c.tipoChamado, centro: id === centroId, profundidade: p };
  }).filter((n) => !!n.codigo);
  return { nos, arestas: arestas.filter((a) => dist.has(a.de) && dist.has(a.para)), cortado };
}

/**
 * O desenho em círculos: o chamado no meio, os vizinhos em volta, os vizinhos dos vizinhos mais longe.
 * Devolve a posição de cada um (de 0 a 1), para a tela desenhar no tamanho que tiver.
 */
export function posicoesDoGrafo(g: GrafoChamado): Record<string, { x: number; y: number }> {
  const pos: Record<string, { x: number; y: number }> = {};
  const porNivel = new Map<number, NoGrafo[]>();
  for (const n of g.nos) porNivel.set(n.profundidade, [...(porNivel.get(n.profundidade) ?? []), n]);
  for (const [p, lista] of porNivel) {
    if (p === 0) { for (const n of lista) pos[n.id] = { x: 0.5, y: 0.5 }; continue; }
    const raio = p === 1 ? 0.3 : 0.45;
    // o segundo anel gira meio passo, para os nomes não ficarem em fila com os do primeiro
    const giro = p === 1 ? -Math.PI / 2 : -Math.PI / 2 + Math.PI / Math.max(lista.length, 1);
    lista.forEach((n, i) => {
      const ang = giro + (2 * Math.PI * i) / lista.length;
      pos[n.id] = { x: 0.5 + raio * Math.cos(ang), y: 0.5 + raio * 0.82 * Math.sin(ang) };
    });
  }
  return pos;
}

// =====================================================================
//  ASSUNTOS EM ÁRVORE
// =====================================================================

/** "Operadora VC1 › DID Entrada › Inoperância" — o caminho inteiro, para escolher sem errar. */
export function caminhoDoAssunto(id: string | null | undefined, assuntos: Pick<Assunto, 'id' | 'paiId' | 'nome'>[]): string {
  if (!id) return '';
  const porId = new Map(assuntos.map((a) => [a.id, a]));
  const partes: string[] = [];
  let atual = porId.get(id);
  for (let n = 0; atual && n < 5; n++) { partes.unshift(atual.nome); atual = atual.paiId ? porId.get(atual.paiId) : undefined; }
  return partes.join(' › ');
}

/** "Ramal › Configuração", "ramal > configuracao", "Ramal - Configuração": o mesmo caminho. */
const SEPARADOR_DO_CAMINHO = /\s*[>›»]\s*|\s+-\s+/;
/** Uma parte do caminho como se compara: sem acento, maiúscula, pontuação nem emoji ("☎️ LinePBX:" = "linepbx"). */
const parteComparavel = (s: string) => paraBusca(s).replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
export const caminhoComparavel = (s: string) => s.split(SEPARADOR_DO_CAMINHO).map(parteComparavel).filter(Boolean).join(' › ');

/**
 * O assunto do painel pelo caminho inteiro, só pelo nome ou por um nome do de-para (sem ligar para
 * acento, maiúscula e enfeite). O nome que aparece em dois lugares da árvore pede o caminho; o que não
 * existe (ou foi desativado) volta como erro — gravar outro assunto no lugar seria pior que avisar. O
 * n8n e o robô do LineChat procuram por aqui; o de-para entrou no 2.0.1, para a resposta do menu do
 * robô ("Suporte Técnico") virar o assunto pelo nome que a equipe põe no de-para.
 */
export function procurarAssunto(
  assuntos: Assunto[], painel: Pick<Painel, 'id' | 'nome'>, texto: string,
): { ok: true; assunto: Assunto } | { ok: false; erro: string } {
  const pedido = texto.trim();
  const alvo = caminhoComparavel(pedido);
  const doPainel = assuntos.filter((a) => a.painelId === painel.id);
  const porCaminho = (a: Assunto) => caminhoComparavel(caminhoDoAssunto(a.id, assuntos)) === alvo;
  const porNome = (a: Assunto) => caminhoComparavel(a.nome) === alvo;
  const peloDePara = (a: Assunto) => a.dePara.some((d) => caminhoComparavel(d) === alvo);
  const caminhos = (l: Assunto[]) => l.map((a) => caminhoDoAssunto(a.id, assuntos)).join(' ou ');
  if (alvo) {
    const ativos = doPainel.filter((a) => a.ativo);
    const peloCaminho = ativos.filter(porCaminho);
    if (peloCaminho.length === 1) return { ok: true, assunto: peloCaminho[0]! };
    const peloNome = ativos.filter(porNome);
    if (peloNome.length === 1) return { ok: true, assunto: peloNome[0]! };
    if (peloNome.length > 1) return { ok: false, erro: `Há mais de um assunto "${pedido}" no painel ${painel.nome}: mande o caminho inteiro (${caminhos(peloNome)}).` };
    const doDePara = ativos.filter(peloDePara);
    if (doDePara.length === 1) return { ok: true, assunto: doDePara[0]! };
    if (doDePara.length > 1) return { ok: false, erro: `"${pedido}" está no de-para de mais de um assunto do painel ${painel.nome} (${caminhos(doDePara)}): deixe em um só.` };
    if (doPainel.some((a) => !a.ativo && (porCaminho(a) || porNome(a) || peloDePara(a)))) return { ok: false, erro: `O assunto "${pedido}" foi desativado no painel ${painel.nome}.` };
  }
  return { ok: false, erro: `Não achei o assunto "${pedido}" no painel ${painel.nome}.` };
}
/** O assunto e todos os de baixo (filtrar por "Ramal" acha "Ramal › Configuração"). */
export function assuntoEDescendentes(id: string, assuntos: Pick<Assunto, 'id' | 'paiId'>[]): Set<string> {
  const ids = new Set([id]);
  let mudou = true;
  while (mudou) {
    mudou = false;
    for (const a of assuntos) if (a.paiId && ids.has(a.paiId) && !ids.has(a.id)) { ids.add(a.id); mudou = true; }
  }
  return ids;
}
/** A profundidade de um assunto (1 = raiz). A árvore vai até 3 níveis. */
export function nivelDoAssunto(id: string | null, assuntos: Pick<Assunto, 'id' | 'paiId'>[]): number {
  const porId = new Map(assuntos.map((a) => [a.id, a]));
  let n = 0;
  for (let atual = id ? porId.get(id) : undefined; atual && n < 10; n++) atual = atual.paiId ? porId.get(atual.paiId) : undefined;
  return n;
}
export const MAX_NIVEL_ASSUNTO = 3;

/** Os assuntos em ordem de árvore (pai, filhos, netos), para as listas e a tela de Ajustes. */
export function emOrdemDeArvore<T extends Pick<Assunto, 'id' | 'paiId' | 'ordem' | 'nome'>>(assuntos: T[]): Array<T & { profundidade: number }> {
  const filhos = new Map<string | null, T[]>();
  for (const a of assuntos) filhos.set(a.paiId, [...(filhos.get(a.paiId) ?? []), a]);
  for (const l of filhos.values()) l.sort((x, y) => x.ordem - y.ordem || x.nome.localeCompare(y.nome, 'pt-BR'));
  const out: Array<T & { profundidade: number }> = [];
  const visitar = (pai: string | null, p: number) => {
    for (const a of filhos.get(pai) ?? []) { out.push({ ...a, profundidade: p }); if (p < 6) visitar(a.id, p + 1); }
  };
  visitar(null, 1);
  // um pai que não existe mais (não deveria acontecer): os órfãos aparecem no fim, como raiz
  const vistos = new Set(out.map((a) => a.id));
  for (const a of assuntos) if (!vistos.has(a.id)) out.push({ ...a, profundidade: 1 });
  return out;
}

/**
 * A lista colada (para montar a árvore de uma vez, quando a lista nova fechar): uma linha por assunto,
 * com o nível pelo caminho — "Ramal - Configuração - Identidade", como a lista da equipe já é escrita,
 * ou "Ramal > Configuração" — ou pela indentação (2 espaços ou um tab). A descrição vai depois de
 * " — " ou " | ". Caminho com mais de 3 partes junta as últimas no 3º nível ("Configuração - Ativação"),
 * para nada se perder. Devolve os assuntos na ordem, cada um com o caminho do pai.
 */
export function lerListaDeAssuntos(texto: string): Array<{ caminho: string[]; nome: string; descricao: string | null }> {
  const out: Array<{ caminho: string[]; nome: string; descricao: string | null }> = [];
  const ja = (cam: string[], nome: string) => out.some((o) => paraBusca(o.nome) === paraBusca(nome) && paraBusca(o.caminho.join('›')) === paraBusca(cam.join('›')));
  const pilha: string[] = [];
  for (const bruta of texto.replace(/\r\n?/g, '\n').split('\n')) {
    if (!bruta.trim()) continue;
    const recuo = bruta.match(/^[\t ]*/)![0].replace(/\t/g, '  ').length;
    let linha = bruta.trim().replace(/^[*•]\s+/, '').replace(/^-\s+/, '');
    let descricao: string | null = null;
    const corte = linha.search(/\s[—–|]\s/);
    if (corte > 0) { descricao = linha.slice(corte + 3).trim() || null; linha = linha.slice(0, corte).trim(); }
    const partes = linha.split(/\s*[>›]\s*|\s+-\s+/).map((p) => p.replace(/\s+/g, ' ').trim()).filter(Boolean);
    if (!partes.length) continue;
    if (partes.length > 1) {
      const cam = partes.length > MAX_NIVEL_ASSUNTO ? [...partes.slice(0, MAX_NIVEL_ASSUNTO - 1), partes.slice(MAX_NIVEL_ASSUNTO - 1).join(' - ')] : partes;
      // garante os pais do caminho (sem repetir)
      for (let i = 0; i < cam.length - 1; i++) if (!ja(cam.slice(0, i), cam[i]!)) out.push({ caminho: cam.slice(0, i), nome: cam[i]!, descricao: null });
      if (!ja(cam.slice(0, -1), cam[cam.length - 1]!)) out.push({ caminho: cam.slice(0, -1), nome: cam[cam.length - 1]!, descricao });
      pilha.length = 0; pilha.push(...cam);
      continue;
    }
    const nivel = Math.min(MAX_NIVEL_ASSUNTO - 1, Math.floor(recuo / 2));
    pilha.length = Math.min(pilha.length, nivel);
    if (!ja([...pilha], partes[0]!)) out.push({ caminho: [...pilha], nome: partes[0]!, descricao });
    pilha.push(partes[0]!);
  }
  return out.filter((o) => o.nome.length <= 80);
}

// =====================================================================
//  RESPOSTAS PRONTAS
// =====================================================================

/** Troca {contato}, {codigo}, {cliente}, {titulo}, {responsavel} e {eu} pelo que vale neste chamado. */
export function preencherModelo(modelo: string, v: Partial<Record<'contato' | 'codigo' | 'cliente' | 'titulo' | 'responsavel' | 'eu' | 'texto', string | null>>): string {
  return modelo
    .replace(/\{(contato|codigo|cliente|titulo|responsavel|eu|texto)\}/g, (_, k: string) => v[k as keyof typeof v]?.trim() || '')
    // o que sobra quando falta um valor: "Olá, !" vira "Olá!", "()" some
    .replace(/,\s*!/g, '!').replace(/\(\s*\)/g, '').replace(/[ \t]{2,}/g, ' ').replace(/ +([,.!?:;])/g, '$1')
    .trim();
}

// =====================================================================
//  O MODELO APROVADO (template) DO WHATSAPP OFICIAL
// =====================================================================

/** Os valores que a mensagem ao cliente usa (os marcadores do chamado). */
export type ValoresDaMensagem = Partial<Record<'contato' | 'codigo' | 'cliente' | 'titulo' | 'responsavel' | 'eu' | 'texto', string | null>>;

/**
 * O valor de uma variável do modelo, do jeito que o WhatsApp aceita: sem quebra de linha nem tabulação,
 * sem mais de 3 espaços seguidos, até 1.000 letras e nunca vazio (vazio, ele recusa o modelo inteiro).
 */
export function valorDaVariavel(valor: string): string {
  const v = valor.replace(/\s*[\r\n]+\s*/g, ' · ').replace(/\t/g, ' ').replace(/ {4,}/g, '   ').trim();
  return (v.length > 1000 ? `${v.slice(0, 999)}…` : v) || '-';
}

/** As variáveis do modelo preenchidas com os valores deste chamado (o `parameters` da API). */
export function parametrosDoModelo(m: Pick<ModeloAprovado, 'variaveis'>, valores: ValoresDaMensagem): Record<string, string> {
  return Object.fromEntries(m.variaveis.map((v) => [v.nome, valorDaVariavel(preencherModelo(v.valor, valores))]));
}

/** Troca as variáveis {{nome}} do texto do modelo pelo que vai em cada uma (a prévia). */
export function textoDoModelo(texto: string, valores: Record<string, string>): string {
  return texto.replace(/\{\{\s*([^{}]+?)\s*\}\}/g, (todo, nome: string) => {
    const achado = Object.entries(valores).find(([k]) => k.toLowerCase() === nome.trim().toLowerCase());
    return achado ? achado[1] : todo;
  });
}

/**
 * A mensagem ao cliente do jeito que os Ajustes mandam: pelo modelo aprovado (o texto dele e o que vai
 * em cada variável) ou o texto livre (com os marcadores). A ficha preenche com o chamado e mostra antes.
 */
export type MensagemAoCliente = { peloModelo: boolean; nomeDoModelo: string | null; texto: string; variaveis: Array<{ nome: string; valor: string }> };

export function mensagemAoCliente(a: { envioCliente: EnvioAoCliente; modeloCliente: string; template: ModeloAprovado | null }): MensagemAoCliente {
  const m = a.envioCliente === 'modelo' ? a.template : null;
  return m
    ? { peloModelo: true, nomeDoModelo: m.nome || m.id || null, texto: m.texto, variaveis: m.variaveis.map((v) => ({ nome: v.nome, valor: v.valor })) }
    : { peloModelo: false, nomeDoModelo: null, texto: a.modeloCliente, variaveis: [] };
}

/**
 * A mensagem como o cliente vai receber, com os valores do chamado: pelo modelo, o texto dele com cada
 * variável como vai para a API (sem quebra de linha, nunca vazia) — sem o texto do modelo, as variáveis
 * uma por linha; no texto livre, o próprio texto com os marcadores trocados.
 */
export function mensagemPreenchida(m: Pick<MensagemAoCliente, 'peloModelo' | 'texto' | 'variaveis'>, valores: ValoresDaMensagem): string {
  if (!m.peloModelo) return preencherModelo(m.texto, valores);
  const p = parametrosDoModelo(m, valores);
  return m.texto.trim() ? textoDoModelo(m.texto, p) : m.variaveis.map((v) => `${v.nome}: ${p[v.nome] ?? ''}`).join('\n');
}

/**
 * O que vai em cada variável quando o modelo chega do LineChat: pelo nome dela (nome, cliente, chamado,
 * mensagem…); com número (1, 2, 3), na ordem de um aviso de chamado — o contato, o código e o texto.
 */
export function valorSugeridoDaVariavel(nome: string, posicao: number): string {
  const n = paraBusca(nome).replace(/[^a-z0-9]/g, '');
  if (/^(nome|contato|cliente_?nome)/.test(n) || n.includes('contato')) return '{contato}';
  if (/(codigo|chamado|ticket|protocolo|numero)/.test(n)) return '{codigo}';
  if (/(texto|mensagem|atualiza|descri|resposta|detalhe)/.test(n)) return '{texto}';
  if (/(titulo|assunto|problema)/.test(n)) return '{titulo}';
  if (/(empresa|cliente)/.test(n)) return '{cliente}';
  if (/(atendente|responsavel|tecnico)/.test(n)) return '{responsavel}';
  if (/^\d+$/.test(n)) return ['{contato}', '{codigo}', '{texto}', '{titulo}', '{cliente}'][Number(n) - 1] ?? '';
  return ['{contato}', '{codigo}', '{texto}'][posicao] ?? '';
}

/** Por que o modelo aprovado ainda não serve para mandar (nulo = pronto): sem modelo, ou sem o arquivo que ele pede. */
export function faltaNoModeloAprovado(m: ModeloAprovado | null | undefined): string | null {
  if (!m?.id) return 'Falta escolher o modelo aprovado da mensagem ao cliente (Painéis › Ajustes › Avisos e WhatsApp).';
  if (m.tipoArquivo !== 'UNDEFINED' && !m.arquivo) return `O modelo ${m.nome || m.id} tem ${NOME_TIPO_ARQUIVO_DO_MODELO[m.tipoArquivo]} no cabeçalho: falta o endereço do arquivo (Painéis › Ajustes › Avisos e WhatsApp).`;
  return null;
}

/** Um modelo aprovado no LineChat, para escolher em Ajustes › Avisos e WhatsApp. */
export type ModeloDoLineChat = {
  id: string; nome: string; texto: string; rodape: string | null; variaveis: string[];
  tipoArquivo: TipoArquivoDoModelo; categoria: string | null;
};
export type ModelosDoLineChat = {
  /** o canal do número oficial no LineChat (os modelos são dele) */
  canal: { id: string; numero: string; oficial: boolean };
  modelos: ModeloDoLineChat[];
};

// =====================================================================
//  A BUSCA E A ORDEM DA LISTA (as mesmas no servidor e na prévia)
// =====================================================================

/** O chamado com o texto que a busca procura (montado por quem carrega: servidor ou prévia). */
export type CartaoParaLista = CartaoChamado & { busca: string };

/** O texto de busca de um chamado: código, título, cliente, contato, telefone, assunto, etiquetas e os textos. */
export function textoDeBusca(c: CartaoChamado, textos: Array<string | null | undefined> = []): string {
  return paraBusca([
    c.codigo, c.titulo, c.cliente?.nome, c.empresa, c.contato?.nome, c.contato?.telefone, c.assunto?.caminho, c.tipo,
    ...c.etiquetas, ...c.produtos.map((p) => p.nome), ...c.operadoras.map((o) => o.nome), ...textos,
  ].filter(Boolean).join(' \n '));
}

export type ContextoLista = { euId: string; assuntos: Pick<Assunto, 'id' | 'paiId'>[] };

const noDia = (iso: string, de?: string, ate?: string) => {
  // o dia de criação em Brasília
  const d = new Date(Date.parse(iso) - 3 * 3_600_000).toISOString().slice(0, 10);
  return (!de || d >= de) && (!ate || d <= ate);
};

export function filtrarCartoes<T extends CartaoParaLista>(lista: T[], f: Partial<FiltrosAtendimento>, ctx: ContextoLista): T[] {
  const assuntos = f.assunto ? assuntoEDescendentes(f.assunto, ctx.assuntos) : null;
  const termos = paraBusca(f.q ?? '').split(/\s+/).filter(Boolean);
  const codigo = f.q ? lerCodigo(f.q) : null;
  return lista.filter((c) => {
    if (f.painel && c.painelId !== f.painel) return false;
    if (f.etapa && c.etapaId !== f.etapa) return false;
    const sit = f.situacao ?? 'abertos';
    if (sit === 'abertos' && c.situacao !== 'aberto') return false;
    if (sit === 'resolvidos' && c.situacao !== 'resolvido') return false;
    if (sit === 'fechados' && c.situacao !== 'fechado') return false;
    if (f.prazo === 'vencidos' && c.prazos.solucao.situacao !== 'vencido' && c.prazos.resposta.situacao !== 'vencido') return false;
    if (f.prazo === 'perto' && c.prazos.solucao.situacao !== 'perto' && c.prazos.resposta.situacao !== 'perto') return false;
    // "parados": só a espera que para o prazo (o cliente); esperando a operadora, o prazo continua correndo
    if (f.prazo === 'parados' && !(c.espera && ESPERA_PARA_O_PRAZO[c.espera.tipo])) return false;
    if (f.responsavel === 'eu' && c.responsavel?.id !== ctx.euId) return false;
    if (f.responsavel === 'ninguem' && c.responsavel) return false;
    if (f.responsavel && f.responsavel !== 'eu' && f.responsavel !== 'ninguem' && c.responsavel?.id !== f.responsavel) return false;
    if (f.cliente && c.cliente?.id !== f.cliente) return false;
    if (f.prioridade && c.prioridade !== f.prioridade) return false;
    if (assuntos && (!c.assunto || !assuntos.has(c.assunto.id))) return false;
    if (f.etiqueta && !c.etiquetas.some((e) => paraBusca(e) === paraBusca(f.etiqueta))) return false;
    if (f.tipoChamado && c.tipoChamado !== f.tipoChamado) return false;
    if (f.espera && c.espera?.tipo !== f.espera) return false;
    if ((f.de || f.ate) && !noDia(c.criadoEm, f.de, f.ate)) return false;
    // a busca pelo código exato acha o chamado, mesmo fechado de outro jeito na tela
    if (termos.length && !(codigo && c.codigo === `${codigo.sigla}-${codigo.numero}`) && !termos.every((t) => c.busca.includes(t))) return false;
    return true;
  });
}

const prazoVencido = (c: CartaoChamado) => c.prazos.resposta.situacao === 'vencido' || c.prazos.solucao.situacao === 'vencido';
const prazoPerto = (c: CartaoChamado) => !prazoVencido(c) && (c.prazos.resposta.situacao === 'perto' || c.prazos.solucao.situacao === 'perto');

/** Os números de cada painel para a tela inicial (o servidor e a prévia contam igual). */
export function resumoDosPaineis(paineis: Array<Pick<Painel, 'id' | 'etapas'> & Partial<Pick<Painel, 'tipo' | 'ajustes'>>>, cartoes: CartaoChamado[], euId: string | null, agora: Date = new Date()): ResumoDoPainel[] {
  const mes = diaLocal(agora).slice(0, 7);
  return paineis.map((p) => {
    const doPainel = cartoes.filter((c) => c.painelId === p.id);
    const abertos = doPainel.filter((c) => c.situacao === 'aberto');
    const porEtapa = new Map<string, number>();
    for (const c of doPainel) if (c.situacao !== 'fechado') porEtapa.set(c.etapaId, (porEtapa.get(c.etapaId) ?? 0) + 1);
    const ultima = doPainel.reduce<string | null>((m, c) => (!m || c.ultimaAtividadeEm > m ? c.ultimaAtividadeEm : m), null);
    return {
      painelId: p.id,
      abertos: abertos.length,
      meus: euId ? abertos.filter((c) => c.responsavel?.id === euId).length : 0,
      semDono: abertos.filter((c) => !c.responsavel).length,
      vencidos: abertos.filter(prazoVencido).length,
      perto: abertos.filter(prazoPerto).length,
      esperando: abertos.filter((c) => !!c.espera).length,
      resolvidos: doPainel.filter((c) => c.situacao === 'resolvido').length,
      porEtapa: p.etapas.filter((e) => e.tipo !== 'fechado').map((e) => ({ etapaId: e.id, total: porEtapa.get(e.id) ?? 0 })),
      ultimaAtividadeEm: ultima,
      vendas: p.tipo === 'vendas' ? resumoDeVendas(doPainel, mes, p.ajustes?.metaMensal ?? null) : null,
    };
  });
}

/** Os números do painel de Vendas no cartão da tela dos painéis (o mês é o de Brasília). */
function resumoDeVendas(cartoes: CartaoChamado[], mes: string, metaMensal: number | null): NonNullable<ResumoDoPainel['vendas']> {
  const abertas = cartoes.filter((c) => c.situacao === 'aberto');
  const doMes = (c: CartaoChamado) => !!c.fechadoEm && diaLocal(new Date(c.fechadoEm)).startsWith(mes);
  const ganhas = cartoes.filter((c) => c.resultado === 'ganho' && doMes(c));
  return {
    emAndamento: abertas.reduce((t, c) => t + (c.valor ?? 0), 0), emAndamentoQtd: abertas.length,
    ganhoNoMes: ganhas.reduce((t, c) => t + (c.valor ?? 0), 0), ganhosNoMes: ganhas.length,
    perdidosNoMes: cartoes.filter((c) => c.resultado === 'perdido' && doMes(c)).length,
    metaMensal,
  };
}

const URGENCIA: Record<EstadoPrazo['situacao'], number> = { vencido: 0, perto: 1, no_prazo: 2, pausado: 3, sem: 4, estourou: 5, cumprido: 6 };
/** O mais urgente primeiro: vencido, perto de vencer, a prioridade, o que vence antes, o mais antigo. */
export function compararUrgencia(a: CartaoChamado, b: CartaoChamado): number {
  const ua = Math.min(URGENCIA[a.prazos.solucao.situacao], URGENCIA[a.prazos.resposta.situacao]);
  const ub = Math.min(URGENCIA[b.prazos.solucao.situacao], URGENCIA[b.prazos.resposta.situacao]);
  if (ua !== ub) return ua - ub;
  const pa = a.prioridade ? PESO_PRIORIDADE[a.prioridade] : 9; const pb = b.prioridade ? PESO_PRIORIDADE[b.prioridade] : 9;
  if (pa !== pb) return pa - pb;
  const va = a.prazos.solucao.venceEm ?? '9'; const vb = b.prazos.solucao.venceEm ?? '9';
  if (va !== vb) return va.localeCompare(vb);
  return a.criadoEm.localeCompare(b.criadoEm);
}

/**
 * A ordem das negociações abertas (o painel de Vendas não tem prazo): a de maior valor primeiro (a sem
 * valor no fim), depois a mais antiga.
 */
export function compararNegociacoes(a: Pick<CartaoChamado, 'valor' | 'criadoEm'>, b: Pick<CartaoChamado, 'valor' | 'criadoEm'>): number {
  const va = a.valor ?? -1; const vb = b.valor ?? -1;
  if (va !== vb) return vb - va;
  return a.criadoEm.localeCompare(b.criadoEm);
}

// ---------------------------------------------------------------------
//  A ORDEM À MÃO NO QUADRO (2.0.4.1)
// ---------------------------------------------------------------------
//  O pedido do Luan (23/10), no quadro do Comercial: "quero poder trocar a ordem aqui, pra cima ou pra baixo da
//  mesma forma que mudo de fase arrastando". Só no painel de Vendas e nas etapas abertas: no Suporte, o quadro
//  põe o mais urgente primeiro (o prazo manda); no Ganho e no Perdido, o mais recente.

/** A coluna aceita a ordem à mão? (o painel de Vendas, nas etapas abertas: a entrada e o andamento) */
export function ordemAMao(painel: { tipo: TipoDePainel }, etapa: { tipo: TipoEtapa }): boolean {
  return painel.tipo === 'vendas' && (etapa.tipo === 'entrada' || etapa.tipo === 'andamento');
}

type NoQuadro = Pick<CartaoChamado, 'valor' | 'criadoEm' | 'ordemNoQuadro'>;
/**
 * A ordem de uma etapa aberta do painel de Vendas: primeiro as que ninguém arrumou depois que chegaram (a regra
 * de sempre: a de maior valor, depois a mais antiga) — a que acabou de chegar aparece no alto —, depois as
 * arrumadas, na ordem que a equipe deixou.
 */
export function compararNoQuadroDeVendas(a: NoQuadro, b: NoQuadro): number {
  const pa = a.ordemNoQuadro; const pb = b.ordemNoQuadro;
  if (pa == null && pb == null) return compararNegociacoes(a, b);
  if (pa == null) return -1;
  if (pb == null) return 1;
  return pa !== pb ? pa - pb : compararNegociacoes(a, b);
}

/**
 * A ordem nova da etapa depois de arrastar: `ordem` é a etapa como o quadro mostra (os ids), `id` o que foi
 * arrastado e `depoisDe` o cartão que fica logo acima dele (nulo: ele vai para o alto). Nula quando o
 * `depoisDe` não está mais na etapa (o quadro mudou enquanto a pessoa arrastava).
 */
export function ordemDepoisDeArrastar(ordem: readonly string[], id: string, depoisDe: string | null): string[] | null {
  const sem = ordem.filter((x) => x !== id);
  if (depoisDe === null) return [id, ...sem];
  const i = sem.indexOf(depoisDe);
  if (i < 0) return null;
  return [...sem.slice(0, i + 1), id, ...sem.slice(i + 1)];
}

export function ordenarCartoes<T extends CartaoChamado>(lista: T[], sort: string | undefined, dir: 'asc' | 'desc' | undefined, ordemDasEtapas: Map<string, number>): T[] {
  const col = sort || 'urgencia';
  const valores: Record<string, (c: T) => string | number | null> = {
    codigo: (c) => c.numero, titulo: (c) => c.titulo.toLocaleLowerCase('pt-BR'), cliente: (c) => c.cliente?.nome.toLocaleLowerCase('pt-BR') ?? null,
    etapa: (c) => ordemDasEtapas.get(c.etapaId) ?? 999, prioridade: (c) => (c.prioridade ? PESO_PRIORIDADE[c.prioridade] : null),
    responsavel: (c) => c.responsavel?.nome.toLocaleLowerCase('pt-BR') ?? null, assunto: (c) => c.assunto?.caminho.toLocaleLowerCase('pt-BR') ?? null,
    prazo: (c) => c.prazos.solucao.venceEm ?? (c.prazos.solucao.situacao === 'vencido' ? '0' : null), criado: (c) => c.criadoEm, atualizado: (c) => c.ultimaAtividadeEm,
    // a negociação: o valor (o maior primeiro) e a empresa (o cliente ou a que ainda não é)
    valor: (c) => c.valor, empresa: (c) => (c.cliente?.nome ?? c.empresa)?.toLocaleLowerCase('pt-BR') ?? null,
  };
  if (col === 'urgencia' || !valores[col]) return [...lista].sort((a, b) => (dir === 'desc' ? -1 : 1) * compararUrgencia(a, b));
  const pegar = valores[col]!;
  // datas, o "atualizado" e o valor nascem do maior; o resto, crescendo. O vazio fica sempre no fim.
  const sentido = dir ?? (col === 'criado' || col === 'atualizado' || col === 'valor' ? 'desc' : 'asc');
  return [...lista].sort((a, b) => {
    const x = pegar(a); const y = pegar(b);
    if (x === null && y === null) return 0;
    if (x === null) return 1;
    if (y === null) return -1;
    const r = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), 'pt-BR');
    return sentido === 'asc' ? r : -r;
  });
}

// =====================================================================
//  O CSV DA LISTA (Exportar)
// =====================================================================

const celula = (v: unknown) => {
  const s = v == null ? '' : String(v);
  return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const dataHora = (iso: string | null) => {
  if (!iso) return '';
  const d = new Date(Date.parse(iso) - 3 * 3_600_000).toISOString();
  return `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)} ${d.slice(11, 16)}`;
};
/** O valor (centavos) como o Excel do Brasil lê um número: 12345,67. */
const valorNaPlanilha = (centavos: number | null) => (centavos === null ? '' : (centavos / 100).toFixed(2).replace('.', ','));

/**
 * O CSV (separado por ponto e vírgula, como o Excel do Brasil abre) com as colunas da lista e, no fim,
 * uma coluna para cada campo ativo dos painéis que estão no arquivo (com o nome do painel, quando há mais
 * de um painel no arquivo). As negociações (os painéis de Vendas) levam o valor, o resultado e o motivo
 * da perda; o arquivo só de negociações deixa de fora o que é do chamado (o assunto, a gravidade,
 * os prazos…) e leva os produtos.
 */
export function csvDosChamados(
  lista: CartaoChamado[], nomes: { painel: (id: string) => string; etapa: (id: string) => string; vendas?: (painelId: string) => boolean },
  campos: readonly CampoPersonalizado[] = [],
): string {
  const noArquivo = new Set(lista.map((c) => c.painelId));
  const extras = campos.filter((c) => c.ativo && noArquivo.has(c.painelId));
  const deVendas = [...noArquivo].filter((id) => nomes.vendas?.(id));
  const soVendas = deVendas.length > 0 && deVendas.length === noArquivo.size;
  const venda = (c: CartaoChamado) => [
    valorNaPlanilha(c.valor), valorNaPlanilha(c.ativacao), c.resultado ? NOME_RESULTADO_DA_VENDA[c.resultado] : '', c.motivoPerda,
  ];
  const cabVenda = ['Mensalidade (R$)', 'Ativação (R$)', 'Resultado', 'Motivo da perda'];
  // na negociação por produto, a coluna dos produtos leva a mensalidade e a ativação de cada um
  const produtosDaVenda = (c: CartaoChamado) => c.produtos.map((p) => {
    const m = c.valoresDosProdutos?.[p.id];
    const a = c.ativacoesDosProdutos?.[p.id];
    const partes = [m !== undefined ? `${reais(m)}/mês` : '', a !== undefined ? `ativação ${reais(a)}` : ''].filter(Boolean);
    return partes.length ? `${p.nome} (${partes.join(', ')})` : p.nome;
  }).join(', ');
  const cabExtras = extras.map((c) => (noArquivo.size > 1 ? `${c.nome} (${nomes.painel(c.painelId)})` : c.nome));
  const valoresExtras = (c: CartaoChamado) => extras.map((x) => (x.painelId === c.painelId ? textoDoValor(x, c.campos?.[x.id]) : ''));
  const cab = soVendas ? [
    'Código', 'Título', 'Painel', 'Etapa', 'Situação', 'Cliente', 'Contato', 'Telefone', 'Responsável', ...cabVenda, 'Produtos', 'Tipo', 'Etiquetas',
    'Aberto em', 'Fechado em', 'Origem', ...cabExtras,
  ] : [
    'Código', 'Título', 'Painel', 'Etapa', 'Situação', 'Cliente', 'Contato', 'Telefone', 'Responsável', 'Assunto', 'Tipo', 'Gravidade', 'Alcance', 'Prioridade', 'Etiquetas', 'Esperando',
    'Prazo de resposta', 'Prazo de solução', 'Aberto em', 'Resolvido em', 'Fechado em', 'Origem', ...(deVendas.length ? cabVenda : []), ...cabExtras,
  ];
  const linhas = lista.map((c) => (soVendas ? [
    c.codigo, c.titulo, nomes.painel(c.painelId), nomes.etapa(c.etapaId), NOME_SITUACAO_CHAMADO[c.situacao], c.cliente?.nome ?? c.empresa, c.contato?.nome, c.contato?.telefone,
    c.responsavel?.nome, ...venda(c), produtosDaVenda(c), c.tipo, c.etiquetas.join(', '),
    dataHora(c.criadoEm), dataHora(c.fechadoEm), NOME_ORIGEM[c.origem], ...valoresExtras(c),
  ] : [
    c.codigo, c.titulo, nomes.painel(c.painelId), nomes.etapa(c.etapaId), NOME_SITUACAO_CHAMADO[c.situacao], c.cliente?.nome ?? c.empresa, c.contato?.nome, c.contato?.telefone,
    c.responsavel?.nome, c.assunto?.caminho, c.tipo, c.gravidade ? NOME_GRAVIDADE[c.gravidade] : '', c.alcance ? NOME_ALCANCE[c.alcance] : '',
    c.prioridade ? NOME_PRIORIDADE[c.prioridade] : '', c.etiquetas.join(', '), c.espera ? NOME_ESPERA[c.espera.tipo] : '',
    c.prazos.resposta.situacao === 'sem' ? '' : NOME_SITUACAO_PRAZO[c.prazos.resposta.situacao], c.prazos.solucao.situacao === 'sem' ? '' : NOME_SITUACAO_PRAZO[c.prazos.solucao.situacao],
    dataHora(c.criadoEm), dataHora(c.resolvidoEm), dataHora(c.fechadoEm), NOME_ORIGEM[c.origem],
    ...(deVendas.length ? (nomes.vendas?.(c.painelId) ? venda(c) : cabVenda.map(() => '')) : []), ...valoresExtras(c),
  ]).map(celula).join(';'));
  return '﻿' + [cab.join(';'), ...linhas].join('\r\n');
}

// =====================================================================
//  A IA NO CHAMADO
// =====================================================================

/** As instruções para a IA preencher o chamado (a NIA de hoje, no Gestor). */
export const INSTRUCOES_IA_CHAMADO = `Você ajuda a equipe de suporte técnico da Ingline (telefonia: PABX, ramais, troncos SIP, DIDs, operadoras) a preencher um chamado.
Leia a conversa (ou o que já está no chamado) e devolva SÓ um objeto JSON, sem texto antes ou depois, com estas chaves:
- "titulo": uma frase curta com o problema, como alguém procuraria depois (máx. 90 letras);
- "relato": o que o cliente disse, em 1 a 4 frases, nas palavras dele (sem inventar);
- "descricao": o que já foi feito e os dados técnicos citados (ramal, número, IP, horário), em tópicos curtos; "" se nada;
- "assunto": o caminho do assunto escolhido EXATAMENTE como aparece na lista de assuntos, ou "" se nenhum serve;
- "tipo": uma das opções de tipo da lista, ou "";
- "gravidade": uma de: inoperancia, intermitencia, performance, disfuncional, nao_se_aplica — ou "";
- "alcance": uma de: empresa, setor, pessoa — ou "";
- "produtos": os nomes dos produtos da lista que aparecem no problema (pode ser []);
- "etiquetas": até 3 palavras-chave curtas (pode ser []);
- "resumo": o andamento em 1 ou 2 frases, para quem pegar o chamado agora.
Nunca invente dado que não está no texto. Senhas e tokens que aparecerem não vão para o JSON.`;

/**
 * Confere o que a IA devolveu contra as opções de verdade (o assunto pelo caminho, o tipo e os produtos
 * pelos nomes): o que não bate fica de fora, nunca entra um valor inventado.
 */
export function lerSugestaoDaIa(
  j: Record<string, unknown> | null,
  opcoes: { assuntos: Array<{ id: string; caminho: string; ativo: boolean }>; tipos: string[]; produtos: Array<{ id: string; nome: string }> },
): Omit<SugestaoIa, 'fonte' | 'modelo' | 'provedor' | 'custo'> {
  const s = (v: unknown, max: number) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);
  const lista = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && !!x.trim()).map((x) => x.trim()) : []);
  const o = j ?? {};
  const caminho = paraBusca(s(o.assunto, 300) ?? '');
  const assunto = caminho ? opcoes.assuntos.find((a) => a.ativo && paraBusca(a.caminho) === caminho)
    ?? opcoes.assuntos.find((a) => a.ativo && paraBusca(a.caminho).endsWith(caminho)) : undefined;
  const tipo = s(o.tipo, 40);
  const g = s(o.gravidade, 30); const al = s(o.alcance, 30);
  return {
    titulo: s(o.titulo, 200), relato: s(o.relato, 5000), descricao: s(o.descricao, 8000),
    assuntoId: assunto?.id ?? null,
    tipo: tipo ? opcoes.tipos.find((t) => paraBusca(t) === paraBusca(tipo)) ?? null : null,
    gravidade: (GRAVIDADES as readonly string[]).includes(g ?? '') ? (g as Gravidade) : null,
    alcance: (ALCANCES as readonly string[]).includes(al ?? '') ? (al as Alcance) : null,
    produtos: [...new Set(lista(o.produtos).map((n) => opcoes.produtos.find((p) => paraBusca(p.nome) === paraBusca(n))?.id).filter((x): x is string => !!x))],
    etiquetas: lista(o.etiquetas).slice(0, 3).map((e) => e.slice(0, 40)),
    resumo: s(o.resumo, 1000),
  };
}

/** A sugestão da IA sem o que o painel não usa (o assunto de um painel sem assuntos, por exemplo). */
export function sugestaoDoQueOPainelUsa<T extends Pick<SugestaoIa, 'assuntoId' | 'tipo' | 'gravidade' | 'alcance' | 'produtos'>>(s: T, ajustes: Pick<AjustesDoPainel, 'camposDesligados'>): T {
  const usa = (c: CampoDoSistema) => campoLigado(ajustes, c);
  return {
    ...s, assuntoId: usa('assunto') ? s.assuntoId : null, tipo: usa('tipo') ? s.tipo : null,
    gravidade: usa('gravidade') ? s.gravidade : null, alcance: usa('alcance') ? s.alcance : null, produtos: usa('produtos') ? s.produtos : [],
  };
}

/** A conversa do LineChat em texto para a IA (cada mensagem numa linha, "Cliente:" ou "Equipe:"). */
export function conversaEmTexto(mensagens: Array<{ deCliente: boolean; texto: string; em?: string | null }>, maxLetras = 24_000): string {
  const linhas = mensagens.filter((m) => m.texto.trim()).map((m) => `${m.deCliente ? 'Cliente' : 'Equipe'}: ${m.texto.trim().replace(/\s+/g, ' ')}`);
  let total = 0; const out: string[] = [];
  // o fim da conversa pesa mais: se não couber tudo, vão as últimas mensagens
  for (let i = linhas.length - 1; i >= 0; i--) { total += linhas[i]!.length + 1; if (total > maxLetras) break; out.unshift(linhas[i]!); }
  return out.join('\n');
}

/**
 * Uma mensagem da API do LineChat, em qualquer um dos formatos que ela já devolveu: o texto e se veio
 * do cliente. Leitura tolerante de propósito — a API não documenta o formato da mensagem.
 */
export function lerMensagemDoLineChat(m: unknown): { deCliente: boolean; texto: string; em: string | null } | null {
  if (!m || typeof m !== 'object') return null;
  const o = m as Record<string, any>;
  const texto = [o.text, o.body?.text, o.content?.text, o.message, o.caption, o.body?.caption].find((x) => typeof x === 'string' && x.trim()) as string | undefined;
  if (!texto) return null;
  const dir = String(o.direction ?? o.origin ?? '').toUpperCase();
  // a API da plataforma marca a mensagem que chega como TO_HUB e a que a empresa manda como FROM_HUB
  const marca = [o.isFromMe, o.fromMe, o.isOutgoing].find((x) => typeof x === 'boolean') as boolean | undefined;
  const deCliente = marca !== undefined ? !marca
    : /TO_HUB|INBOUND|RECEIVED|FROM_CONTACT/.test(dir) ? true
      : /FROM_HUB|OUTBOUND|SENT|FROM_USER|AGENT|BOT|SYSTEM/.test(dir) ? false : true;
  return { deCliente, texto, em: typeof o.createdAt === 'string' ? o.createdAt : null };
}

// =====================================================================
//  ETIQUETAS E CONTATOS
// =====================================================================

/** A chave de uma etiqueta para comparar: minúscula, sem acento, com um espaço só ("Cliente  VIP" = "cliente vip"). */
export function chaveDaEtiqueta(nome: string): string {
  return paraBusca(nome).replace(/\s+/g, ' ');
}

/** Etiquetas sem repetir (sem ligar para maiúscula, acento e espaço a mais), na ordem em que vieram. */
export function etiquetasUnicas(xs: string[]): string[] {
  const vistas = new Map<string, string>();
  for (const x of xs) {
    const t = x.trim().replace(/\s+/g, ' ');
    if (t && !vistas.has(chaveDaEtiqueta(t))) vistas.set(chaveDaEtiqueta(t), t);
  }
  return [...vistas.values()];
}

/**
 * As etiquetas de um chamado com uma etiqueta renomeada — achada pela chave
 * do nome antigo, escrita de qualquer jeito. Nula quando ela não está na lista (nada a mudar).
 */
export function renomearEtiqueta(lista: string[], deChave: string, para: string): string[] | null {
  if (!lista.some((e) => chaveDaEtiqueta(e) === deChave)) return null;
  const nova = etiquetasUnicas(lista.map((e) => (chaveDaEtiqueta(e) === deChave ? para : e)));
  return nova.length === lista.length && nova.every((e, i) => e === lista[i]) ? null : nova;
}

/**
 * O título que fica (2.0.3): o chamado precisa de pelo menos 3 letras; a negociação, sem título, fica com o nome
 * da empresa (o cliente ou a empresa que ainda não é cliente). Nulo = recusar, com `MENSAGEM_DO_TITULO`.
 */
export function tituloQueFica(titulo: string, o: { vendas: boolean; empresa: string | null }): string | null {
  const t = titulo.trim().replace(/\s+/g, ' ');
  if (t.length >= 3) return t;
  if (!o.vendas || t.length) return null;
  const empresa = (o.empresa ?? '').trim();
  return empresa ? empresa.slice(0, 200) : null;
}
export const MENSAGEM_DO_TITULO = {
  chamado: 'Escreva um título (pelo menos 3 letras)',
  negociacao: 'Escreva o que está sendo negociado com pelo menos 3 letras, ou deixe vazio: fica o nome da empresa',
  semEmpresa: 'Escreva o que está sendo negociado ou escolha a empresa: sem título, a negociação fica com o nome da empresa',
} as const;
/** A mensagem de quando o `tituloQueFica` recusa. */
export function mensagemDoTitulo(titulo: string, vendas: boolean): string {
  if (!vendas) return MENSAGEM_DO_TITULO.chamado;
  return titulo.trim() ? MENSAGEM_DO_TITULO.negociacao : MENSAGEM_DO_TITULO.semEmpresa;
}

/** Uma etiqueta e a cor dela (o que a tela precisa para desenhar). */
export type EtiquetaComCor = { nome: string; cor: CorEtiqueta };
/**
 * Uma etiqueta de um painel (2.0.3, o pedido do Luan: "as etiquetas tem q ser por painel, cada painel vai ter suas
 * etiquetas"): o mesmo nome pode estar em dois painéis, cada um com a sua cor.
 */
export type EtiquetaNoPainel = EtiquetaComCor & { painelId: string };
/** Uma etiqueta em Ajustes › Etiquetas: o painel e em quantos chamados dele ela está (fora da lixeira). */
export type EtiquetaDoCatalogo = EtiquetaNoPainel & { id: string; chamados: number; criadaEm: string };

/** As etiquetas de um painel (o seletor, a cor dos cartões, o filtro da lista). */
export function etiquetasDoPainel<E extends { painelId: string }>(lista: readonly E[], painelId: string): E[] {
  return lista.filter((e) => e.painelId === painelId);
}

/**
 * A cor de uma etiqueta pelo nome (sem ligar para maiúscula e acento). A que não está na lista: a cor
 * escolhida para ela agora (`novas`, no Abrir chamado), ou cinza.
 */
export function corDaEtiqueta(lista: readonly EtiquetaComCor[], nome: string, novas?: Record<string, CorEtiqueta>): CorEtiqueta {
  const k = chaveDaEtiqueta(nome);
  const achada = lista.find((e) => chaveDaEtiqueta(e.nome) === k);
  if (achada) return achada.cor;
  const nova = novas ? Object.entries(novas).find(([n]) => chaveDaEtiqueta(n) === k) : undefined;
  return nova ? nova[1] : 'neutral';
}

/**
 * O link da conversa no LineChat, pelo modelo que a administração escreveu nas Integrações
 * ("https://…/{sessao}"). Sem modelo, não há link: o endereço da conversa é do LineChat e muda com ele.
 */
export function linkDaConversa(modelo: string | null | undefined, sessaoId: string | null | undefined): string | null {
  if (!modelo || !sessaoId || !modelo.includes('{sessao}')) return null;
  return modelo.replace('{sessao}', encodeURIComponent(sessaoId));
}

/** O nome que o histórico e a auditoria dão à conversa do LineChat ligada ao chamado. */
export const NOME_CONVERSA = 'Conversa no LineChat';
/** O código da sessão guardado no chamado: o do LineChat é um uuid (36 letras). */
export const MAX_LETRAS_DA_SESSAO = 120;
/** O que a pessoa cola (o link inteiro, com o que vier depois dele). */
export const MAX_LETRAS_DO_LINK_DA_CONVERSA = 500;
const UUID_NO_TEXTO = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const SO_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PARECE_LINK = /^([a-z][a-z0-9+.-]*:\/\/|www\.)/i;
const CODIGO_DA_SESSAO = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;
const escaparRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export type ConversaLida = { ok: true; sessaoId: string | null } | { ok: false; erro: string };

/**
 * A sessão (a conversa do LineChat) do que a pessoa colou (2.0.4.1, o pedido do Luan: o chamado ativo —
 * a equipe chamou o cliente — não vem do robô, e a conversa entra à mão, para a ficha ter o link e a NIA
 * ler o que foi dito). Vale:
 *  - o link da conversa: pelo modelo das Integrações ("https://…/{sessao}": o que está no lugar do
 *    {sessao}) ou, sem ele ou com outro endereço, pelo código de sessão do LineChat (um uuid) que estiver nele;
 *  - o código da sessão sozinho (o "sessão 8385…" copiado da ficha também serve);
 *  - vazio: o chamado fica sem conversa.
 * O uuid volta em minúsculas, como o LineChat manda (o robô acha o chamado aberto da conversa por ele).
 */
export function sessaoDaConversa(texto: string | null | undefined, modelo?: string | null): ConversaLida {
  const t = (texto ?? '').trim();
  if (!t) return { ok: true, sessaoId: null };
  if (t.length > MAX_LETRAS_DO_LINK_DA_CONVERSA) return { ok: false, erro: 'Esse texto é comprido demais para ser o link de uma conversa: cole só o link (ou o código da sessão).' };
  const pronto = (s: string): ConversaLida => {
    const v = SO_UUID.test(s) ? s.toLowerCase() : s;
    if (v.length > MAX_LETRAS_DA_SESSAO) return { ok: false, erro: 'O código da sessão nesse link é comprido demais. Confira o link da conversa.' };
    return { ok: true, sessaoId: v };
  };
  // 1. pelo modelo do link: o pedaço no lugar do {sessao}
  if (modelo && modelo.includes('{sessao}')) {
    const [antes] = modelo.split('{sessao}');
    const m = new RegExp(`${escaparRegex(antes!).replace(/^https?:/i, 'https?:')}([^/?#&\\s]+)`, 'i').exec(t);
    if (m) {
      let s = m[1]!;
      try { s = decodeURIComponent(s); } catch { /* fica como veio */ }
      if (CODIGO_DA_SESSAO.test(s)) return pronto(s);
    }
  }
  // 2. o código de sessão do LineChat (um uuid) no meio do link ou do texto
  const uuids = [...new Set((t.match(UUID_NO_TEXTO) ?? []).map((u) => u.toLowerCase()))];
  if (uuids.length === 1) return pronto(uuids[0]!);
  if (uuids.length > 1) return { ok: false, erro: 'Esse link tem mais de um código: cole só o código da sessão (o que vem depois do último "/" do link da conversa).' };
  // 3. outro link: não dá para saber onde está a sessão
  if (PARECE_LINK.test(t)) return { ok: false, erro: 'Não achei a sessão nesse link. Cole o link da conversa no LineChat (o endereço da conversa aberta) ou só o código da sessão.' };
  // 4. o código sozinho
  if (/\s/.test(t)) return { ok: false, erro: 'O código da sessão não tem espaço: cole o link da conversa no LineChat ou só o código da sessão.' };
  if (t.length < 6) return { ok: false, erro: 'Esse código é curto demais para ser uma sessão: cole o link da conversa no LineChat.' };
  if (!CODIGO_DA_SESSAO.test(t)) return { ok: false, erro: 'Isso não parece o código de uma sessão: cole o link da conversa no LineChat.' };
  return pronto(t);
}


// =====================================================================
//  O QUE A TELA MANDA (antes das transformações do servidor)
// =====================================================================

export type ChamadoCriarEntrada = z.input<typeof ChamadoCriarSchema>;
export type ChamadoAlterarEntrada = z.input<typeof ChamadoAlterarSchema>;
export type MoverEntrada = z.input<typeof MoverSchema>;
export type ChecklistEntrada = z.input<typeof ChecklistSchema>;
export type TempoEntrada = z.input<typeof TempoSchema>;
export type OperadoraCasoEntrada = z.input<typeof OperadoraCasoSchema>;
export type PainelGravarEntrada = z.input<typeof PainelGravarSchema>;
export type EtapaGravarEntrada = z.input<typeof EtapaGravarSchema>;
export type AssuntoGravarEntrada = z.input<typeof AssuntoGravarSchema>;
export type AgendadoGravarEntrada = z.input<typeof AgendadoGravarSchema>;
export type AvisosChamadosEntrada = z.input<typeof AvisosChamadosSchema>;
export type WebhookGravarEntrada = z.input<typeof WebhookGravarSchema>;
export type CampoGravarEntrada = z.input<typeof CampoGravarSchema>;
/** Incluir uma opção numa lista do painel ali mesmo (só nas que permitem: `incluirNaHora`). */
export const OpcaoIncluirSchema = z.object({ nome: z.string().trim().min(1, 'Escreva o nome da opção').max(60, 'O nome da opção vai até 60 letras').transform((s) => s.replace(/\s+/g, ' ')) });
export type OpcaoIncluirEntrada = z.input<typeof OpcaoIncluirSchema>;
export type CamposDoSistemaEntrada = z.input<typeof CamposDoSistemaSchema>;
