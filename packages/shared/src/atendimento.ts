/**
 * OS CHAMADOS DO GESTOR (decisão 0047, Patch 1.10) — as regras e os formatos.
 *
 * O módulo que substitui o painel de chamados do LineChat: painéis que a administração cria (Suporte,
 * Desenvolvimento, Interno…), etapas editáveis em cada um (N1, N2 e N3 continuam sendo colunas, a
 * pedido do Luan), o chamado com cada informação no seu lugar (relato do cliente, descrição, solução e
 * causa), o assunto em árvore, a prioridade sugerida pela gravidade e pelo alcance, os prazos, o pai e
 * os filhos (inclusive em outro painel), o problema que junta incidentes, as ligações feitas à mão e o
 * histórico de tudo.
 *
 * Aqui ficam as regras que o servidor e a prévia precisam aplicar igual: o que falta para entrar numa
 * etapa, quando o pai pode fechar, quando um movimento é escalonamento, o que conta como "obrigado" do
 * cliente, as ligações num desenho, a busca e a ordem da lista. Mudou a regra, muda aqui (e o teste).
 */
import { z } from 'zod';
import { paraBusca } from './formatos.js';
import { numeroWhatsApp } from './envio.js';
import {
  ALCANCES, ESPERA_PARA_O_PRAZO, GRAVIDADES, NOME_ALCANCE, NOME_ESPERA, NOME_GRAVIDADE, NOME_PRIORIDADE, NOME_SITUACAO_PRAZO, PESO_PRIORIDADE, PRIORIDADES, RegraAgendadoSchema,
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

export const NIVEIS = [1, 2, 3] as const;
export type Nivel = (typeof NIVEIS)[number];

/** O campo Tipo responde só "que tratativa foi essa?"; as opções são de cada painel. */
export const TIPOS_PADRAO = ['Incidente', 'Requisição', 'Dúvida', 'Mudança'];

export const TIPOS_CHAMADO = ['chamado', 'problema'] as const;
export type TipoChamado = (typeof TIPOS_CHAMADO)[number];
export const NOME_TIPO_CHAMADO: Record<TipoChamado, string> = { chamado: 'Chamado', problema: 'Problema' };

export const ORIGENS = ['manual', 'robo', 'botao', 'agendado', 'api'] as const;
export type Origem = (typeof ORIGENS)[number];
export const NOME_ORIGEM: Record<Origem, string> = { manual: 'Aberto no Gestor', robo: 'O robô do LineChat', botao: 'O botão na conversa', agendado: 'Chamado agendado', api: 'Integração (n8n)' };

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
  'cliente', 'contato', 'relato', 'descricao', 'assunto', 'tipo', 'gravidade', 'alcance', 'prioridade',
  'produto', 'operadora', 'afetados', 'responsavel', 'solucao', 'causa', 'checklist', 'tempo',
] as const;
export type CampoObrigatorio = (typeof CAMPOS_CHAMADO)[number];
export const NOME_CAMPO: Record<CampoObrigatorio | 'validacao' | 'filhos', string> = {
  cliente: 'Cliente', contato: 'Contato', relato: 'Relato do cliente', descricao: 'Descrição', assunto: 'Assunto', tipo: 'Tipo',
  gravidade: 'Gravidade', alcance: 'Alcance', prioridade: 'Prioridade', produto: 'Produto', operadora: 'Operadora', afetados: 'O que foi afetado',
  responsavel: 'Responsável', solucao: 'Solução', causa: 'Causa', checklist: 'O checklist inteiro marcado', tempo: 'O tempo gasto',
  validacao: 'A validação (problema)', filhos: 'Os filhos fechados',
};

/** O que foi afetado, escolhido do cadastro do cliente (é o que depois acha todos os afetados por uma queda). */
export const TIPOS_AFETADO = ['circuito', 'did', 'aparelho', 'unidade'] as const;
export type TipoAfetado = (typeof TIPOS_AFETADO)[number];
export const NOME_AFETADO: Record<TipoAfetado, string> = { circuito: 'Circuito', did: 'DID', aparelho: 'Aparelho', unidade: 'Unidade' };
export type Afetado = { tipo: TipoAfetado; id: string; nome: string };

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
  /** N1, N2, N3: mover para um nível acima é escalonar (pede o motivo); para um abaixo, voltar de nível */
  nivel: Nivel | null;
  /** o que precisa estar preenchido para o chamado entrar aqui */
  obrigatorios: CampoObrigatorio[];
  /** quem recebe o aviso quando um chamado chega nesta etapa (a fila do N2, o Desenvolvimento…) */
  avisar: string[];
};

export type AjustesDoPainel = {
  /** as opções do campo Tipo */
  tipos: string[];
  /** conta prazo (SLA)? */
  contaPrazo: boolean;
  /** o Resolvido vira Fechado sozinho depois de N dias úteis sem resposta (nulo = nunca) */
  fecharSozinhoDias: number | null;
  /** o que precisa para abrir */
  obrigatoriosAoAbrir: CampoObrigatorio[];
  /** o pai só resolve e fecha com os filhos fechados (e diz quais faltam) */
  paiEsperaFilhos: boolean;
  /** quem recebe o que vence, o que fica sem dono e o que chega Crítico */
  supervisores: string[];
};

export type Painel = {
  id: string;
  nome: string;
  /** a sigla do código (SUP-12): 2 a 5 letras, única */
  sigla: string;
  descricao: string | null;
  cor: CorPainel;
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

export const AJUSTES_PAINEL_PADRAO: AjustesDoPainel = {
  tipos: TIPOS_PADRAO, contaPrazo: true, fecharSozinhoDias: 3, obrigatoriosAoAbrir: [], paiEsperaFilhos: true, supervisores: [],
};

/** Os ajustes guardados podem ser de antes de um campo novo: completa com o padrão. */
export function ajustesDoPainelCompletos(v: Partial<AjustesDoPainel> | null | undefined): AjustesDoPainel {
  return { ...AJUSTES_PAINEL_PADRAO, ...(v ?? {}) };
}

type EtapaInicial = Omit<EtapaPainel, 'id' | 'avisar'> & { chave: string };
const CLASSIFICADO: CampoObrigatorio[] = ['cliente', 'relato', 'assunto', 'tipo', 'gravidade'];
/**
 * Os painéis com que o módulo nasce. O Suporte segue a escolha do Luan: N1, N2 e N3 como colunas
 * (marcadas como nível, para o escalonamento e a trajetória), mais Novo, Em observação, Resolvido e
 * Fechado. As etapas são da equipe: dá para criar, renomear, tirar e mudar a ordem.
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
//  O QUE FALTA PARA ENTRAR NUMA ETAPA
// =====================================================================

/** O que a regra dos obrigatórios precisa saber do chamado. */
export type DadosObrigatorios = {
  tipoChamado: TipoChamado;
  clienteId: string | null; contatoNome: string | null; contatoTelefone: string | null;
  relato: string | null; descricao: string | null;
  assuntoId: string | null; tipo: string | null; gravidade: Gravidade | null; alcance: Alcance | null; prioridade: Prioridade | null;
  produtos: string[]; operadoras: string[]; afetados: Afetado[];
  responsavelId: string | null;
  solucao: string | null; causa: string | null; validacao: string | null;
  checklist: ItemChecklist[];
  tempoMinutos: number;
};

const preenchido = (v: string | null | undefined) => !!v && v.trim().length > 0;

function falta(c: DadosObrigatorios, campo: CampoObrigatorio): boolean {
  switch (campo) {
    case 'cliente': return !c.clienteId;
    case 'contato': return !preenchido(c.contatoNome) && !preenchido(c.contatoTelefone);
    case 'relato': return !preenchido(c.relato);
    case 'descricao': return !preenchido(c.descricao);
    case 'assunto': return !c.assuntoId;
    case 'tipo': return !preenchido(c.tipo);
    case 'gravidade': return !c.gravidade;
    case 'alcance': return !c.alcance;
    case 'prioridade': return !c.prioridade;
    case 'produto': return !c.produtos.length;
    case 'operadora': return !c.operadoras.length;
    case 'afetados': return !c.afetados.length;
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
export function faltaParaEtapa(c: DadosObrigatorios, etapa: Pick<EtapaPainel, 'tipo' | 'obrigatorios'>): Array<CampoObrigatorio | 'validacao'> {
  const campos = new Set<CampoObrigatorio>(etapa.obrigatorios);
  const fechando = etapa.tipo === 'resolvido' || etapa.tipo === 'fechado';
  if (c.tipoChamado === 'problema' && fechando) { campos.add('causa'); campos.add('solucao'); }
  const faltam: Array<CampoObrigatorio | 'validacao'> = CAMPOS_CHAMADO.filter((k) => campos.has(k) && falta(c, k));
  if (c.tipoChamado === 'problema' && fechando && !preenchido(c.validacao)) faltam.push('validacao');
  return faltam;
}
export function faltaParaAbrir(c: DadosObrigatorios, ajustes: Pick<AjustesDoPainel, 'obrigatoriosAoAbrir'>): CampoObrigatorio[] {
  return ajustes.obrigatoriosAoAbrir.filter((k) => falta(c, k));
}
/** "Falta o Assunto e a Causa" — a mensagem que aparece ao lado do botão. */
export function mensagemDoQueFalta(faltam: Array<CampoObrigatorio | 'validacao' | 'filhos'>, etapa?: string): string {
  if (!faltam.length) return '';
  const nomes = faltam.map((f) => NOME_CAMPO[f]);
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

/** Palavras de quem só agradece ou confirma: com elas (e só elas), o Resolvido não reabre. */
const EDUCADAS = new Set([
  'obrigado', 'obrigada', 'obrigadao', 'obg', 'brigado', 'brigada', 'agradeco', 'agradecido', 'agradecida', 'grato', 'grata', 'valeu', 'vlw', 'tmj',
  'ok', 'okay', 'oki', 'blz', 'beleza', 'certo', 'certinho', 'show', 'perfeito', 'otimo', 'otima', 'top', 'joia', 'massa', 'combinado', 'entendi',
  'resolvido', 'resolveu', 'funcionou', 'funcionando', 'deu', 'tudo', 'certo', 'sim', 'pode', 'fechar', 'encerrar', 'finalizar',
  'muito', 'mt', 'mto', 'bom', 'boa', 'dia', 'tarde', 'noite', 'de', 'nada', 'ta', 'esta', 'agora', 'ja', 'e', 'o', 'a', 'pela', 'pelo', 'ajuda', 'atencao',
  'abraco', 'abracos', 'abs', 'att', 'atenciosamente', 'ate', 'mais', 'amem', 'kkk', 'kkkk', 'rs', 'haha',
]);

/**
 * O cliente respondeu ao chamado Resolvido. "Obrigado", "ok, funcionou", uma figurinha: não reabre.
 * Qualquer outra coisa — uma pergunta, "ainda está caindo" — reabre. Na dúvida, reabre (é melhor um
 * chamado aberto à toa do que um cliente sem resposta).
 */
export function pareceAgradecimento(texto: string | null | undefined): boolean {
  const bruto = texto ?? '';
  if (bruto.includes('?')) return false;
  const t = paraBusca(bruto).replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
  // só emoji ou figurinha
  if (!t) return true;
  if (t.length > 80) return false;
  return t.split(' ').every((p) => EDUCADAS.has(p) || /^(k+|ha(ha)+|rs+)$/.test(p));
}

// =====================================================================
//  OS FORMATOS DE ENTRADA (o que a tela e as integrações mandam)
// =====================================================================

const Texto = (max: number) => z.string().max(max).transform((s) => s.replace(/\r\n?/g, '\n'));
const TextoOpcional = (max: number) => Texto(max).nullish().transform((s) => (s && s.trim() ? s.trim() : null));
const Lista = (max = 50) => z.array(z.string().trim().min(1).max(120)).max(max);
const EtiquetaSchema = z.string().trim().min(1).max(40);
const TelefoneSchema = z.string().trim().max(40).nullish().transform((v, ctx) => {
  if (!v) return null;
  const n = numeroWhatsApp(v);
  if (!n) { ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Telefone inválido: use DDD + número, como (71) 99999-0000.' }); return z.NEVER; }
  return n;
});
const AfetadoSchema = z.object({ tipo: z.enum(TIPOS_AFETADO), id: z.string().min(1).max(60), nome: z.string().trim().min(1).max(160) });

export const EtapaGravarSchema = z.object({
  /** sem id = etapa nova */
  id: z.string().min(1).max(60).optional(),
  nome: z.string().trim().min(1, 'Dê um nome à etapa').max(40),
  tipo: z.enum(TIPOS_ETAPA),
  nivel: z.union([z.literal(1), z.literal(2), z.literal(3)]).nullable().default(null),
  obrigatorios: z.array(z.enum(CAMPOS_CHAMADO)).max(CAMPOS_CHAMADO.length).default([]),
  avisar: z.array(z.string()).max(50).default([]),
});
export const AjustesDoPainelSchema = z.object({
  tipos: z.array(z.string().trim().min(1).max(40)).max(30).default(TIPOS_PADRAO),
  contaPrazo: z.boolean().default(true),
  fecharSozinhoDias: z.number().int().min(1).max(60).nullable().default(3),
  obrigatoriosAoAbrir: z.array(z.enum(CAMPOS_CHAMADO)).default([]),
  paiEsperaFilhos: z.boolean().default(true),
  supervisores: z.array(z.string()).max(30).default([]),
});
export const PainelGravarSchema = z.object({
  nome: z.string().trim().min(1, 'Dê um nome ao painel').max(40),
  sigla: SiglaSchema,
  descricao: TextoOpcional(300),
  cor: z.enum(CORES_PAINEL).default('accent'),
  acesso: z.enum(['todos', 'escolhidos']).default('todos'),
  pessoas: z.array(z.string()).max(200).default([]),
  ajustes: AjustesDoPainelSchema,
  ativo: z.boolean().default(true),
});
export const EtapasGravarSchema = z.object({
  etapas: z.array(EtapaGravarSchema).min(2, 'O painel precisa de pelo menos duas etapas').max(20),
  /** as etapas que saíram e têm chamados: para onde eles vão (id da que saiu → id de uma que fica) */
  destino: z.record(z.string(), z.string()).default({}),
}).superRefine((d, ctx) => {
  if (!d.etapas.some((e) => e.tipo === 'fechado')) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['etapas'], message: 'Pelo menos uma etapa precisa fechar o chamado' });
  if (!d.etapas.some((e) => e.tipo === 'entrada' || e.tipo === 'andamento')) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['etapas'], message: 'Pelo menos uma etapa precisa ser de entrada ou de andamento' });
  const nomes = d.etapas.map((e) => paraBusca(e.nome));
  if (new Set(nomes).size !== nomes.length) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['etapas'], message: 'Duas etapas com o mesmo nome' });
});

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

export const ChamadoCriarSchema = z.object({
  painelId: z.string().min(1),
  tipoChamado: z.enum(TIPOS_CHAMADO).default('chamado'),
  titulo: z.string().trim().min(3, 'Escreva um título (pelo menos 3 letras)').max(200),
  relato: TextoOpcional(20_000),
  descricao: TextoOpcional(20_000),
  clienteId: z.string().nullish().transform((v) => v || null),
  contatoNome: TextoOpcional(120),
  contatoTelefone: TelefoneSchema,
  sessaoId: TextoOpcional(120),
  assuntoId: z.string().nullish().transform((v) => v || null),
  tipo: TextoOpcional(40),
  gravidade: z.enum(GRAVIDADES).nullish().transform((v) => v ?? null),
  alcance: z.enum(ALCANCES).nullish().transform((v) => v ?? null),
  prioridade: z.enum(PRIORIDADES).nullish().transform((v) => v ?? null),
  motivoPrioridade: TextoOpcional(300),
  produtos: Lista().default([]),
  operadoras: Lista().default([]),
  afetados: z.array(AfetadoSchema).max(200).default([]),
  etiquetas: z.array(EtiquetaSchema).max(20).default([]),
  responsavelId: z.string().nullish().transform((v) => v || null),
  /** filho de quem (pode ser de outro painel) */
  paiId: z.string().nullish().transform((v) => v || null),
  /** incidente de qual problema */
  problemaId: z.string().nullish().transform((v) => v || null),
  /** para o problema novo: os incidentes que ele junta */
  incidentes: z.array(z.string()).max(200).default([]),
  /** manda ao cliente o número do chamado pelo WhatsApp (o atendente escolhe: decisão "cliente", opção b) */
  avisarCliente: z.boolean().default(false),
  origem: z.enum(['manual', 'botao']).default('manual'),
});
export type ChamadoCriar = z.infer<typeof ChamadoCriarSchema>;

/** Mudar o chamado: só os campos que vierem. */
export const ChamadoAlterarSchema = z.object({
  titulo: z.string().trim().min(3).max(200).optional(),
  relato: TextoOpcional(20_000).optional(),
  descricao: TextoOpcional(20_000).optional(),
  clienteId: z.string().nullish().transform((v) => v || null).optional(),
  contatoNome: TextoOpcional(120).optional(),
  contatoTelefone: TelefoneSchema.optional(),
  assuntoId: z.string().nullish().transform((v) => v || null).optional(),
  tipo: TextoOpcional(40).optional(),
  gravidade: z.enum(GRAVIDADES).nullable().optional(),
  alcance: z.enum(ALCANCES).nullable().optional(),
  prioridade: z.enum(PRIORIDADES).nullable().optional(),
  /** trocar a prioridade sugerida pede o motivo */
  motivoPrioridade: TextoOpcional(300).optional(),
  produtos: Lista().optional(),
  operadoras: Lista().optional(),
  afetados: z.array(AfetadoSchema).max(200).optional(),
  etiquetas: z.array(EtiquetaSchema).max(20).optional(),
  solucao: TextoOpcional(20_000).optional(),
  causa: TextoOpcional(5_000).optional(),
  contorno: TextoOpcional(10_000).optional(),
  validacao: TextoOpcional(5_000).optional(),
  observadores: z.array(z.string()).max(30).optional(),
  responsavelId: z.string().nullish().transform((v) => v || null).optional(),
});
export type ChamadoAlterar = z.infer<typeof ChamadoAlterarSchema>;

export const MoverSchema = z.object({
  etapaId: z.string().min(1),
  /** escalonar (ou voltar de nível) pede o motivo */
  motivo: TextoOpcional(500),
  /** para quem, ao escalonar (sem ninguém = fica na fila do nível) */
  responsavelId: z.string().nullish(),
});
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
export const AplicarRespostaSchema = z.object({ respostaId: z.string().min(1), texto: z.string().trim().max(3000).default('') });
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

/** As mensagens prontas: um clique manda o texto e muda o chamado. */
export const AcaoRespostaSchema = z.object({
  /** manda o texto ao cliente pelo WhatsApp (senão, vira anotação) */
  avisarCliente: z.boolean().default(false),
  /** move para esta etapa (do mesmo painel) */
  etapaId: z.string().nullish().transform((v) => v || null),
  /** marca a espera (null = não mexe; 'nada' = tira a marca) */
  esperar: z.enum(['cliente', 'operadora', 'nada']).nullish().transform((v) => v ?? null),
  /** põe esta etiqueta */
  etiqueta: z.string().trim().max(40).nullish().transform((v) => v || null),
  /** quem usa assume o chamado */
  assumir: z.boolean().default(false),
});
export type AcaoResposta = z.infer<typeof AcaoRespostaSchema>;
export const RespostaProntaGravarSchema = z.object({
  nome: z.string().trim().min(1, 'Dê um nome').max(60),
  texto: z.string().trim().max(3000).default(''),
  painelId: z.string().nullish().transform((v) => v || null),
  acao: AcaoRespostaSchema,
  ativa: z.boolean().default(true),
});

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
export const EVENTOS_AVISO = ['recebeu', 'etapa', 'prazo_perto', 'prazo_vencido', 'sem_dono', 'critico', 'cliente_respondeu'] as const;
export type EventoAviso = (typeof EVENTOS_AVISO)[number];
export const NOME_EVENTO_AVISO: Record<EventoAviso, { titulo: string; quem: string }> = {
  recebeu: { titulo: 'Recebeu um chamado (atribuído ou escalonado)', quem: 'quem recebeu' },
  etapa: { titulo: 'Chegou um chamado na etapa', quem: 'quem a etapa avisa (Ajustes › Painéis)' },
  prazo_perto: { titulo: 'O prazo chegou ao percentual do aviso', quem: 'o responsável' },
  prazo_vencido: { titulo: 'O prazo venceu', quem: 'o responsável e os supervisores' },
  sem_dono: { titulo: 'Sem responsável depois do tempo combinado', quem: 'os supervisores' },
  critico: { titulo: 'Chegou um chamado Crítico', quem: 'os supervisores' },
  cliente_respondeu: { titulo: 'O cliente respondeu', quem: 'o responsável' },
};
export type CanaisDoAviso = { tela: boolean; whatsapp: boolean };
/** O que o documento de prioridade sugeriu (a tabela "Alertas e escalonamento"). */
export const EVENTOS_AVISO_PADRAO: Record<EventoAviso, CanaisDoAviso> = {
  recebeu: { tela: true, whatsapp: true }, etapa: { tela: true, whatsapp: true }, prazo_perto: { tela: true, whatsapp: true },
  prazo_vencido: { tela: true, whatsapp: true }, sem_dono: { tela: true, whatsapp: false }, critico: { tela: true, whatsapp: true },
  cliente_respondeu: { tela: true, whatsapp: false },
};
const CanaisSchema = z.object({ tela: z.boolean(), whatsapp: z.boolean() });

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
  /** o texto que abre a mensagem ao cliente: {contato}, {codigo}, {titulo}, {texto} */
  modeloCliente: z.string().trim().max(2000),
  /** o modelo aprovado (template) para quando a conversa com o cliente passou de 24 h (opcional) */
  template: z.object({
    id: z.string().trim().max(120),
    parametroCodigo: z.string().trim().max(60).default(''),
    parametroTexto: z.string().trim().max(60).default(''),
    parametroContato: z.string().trim().max(60).default(''),
  }).nullable().default(null),
  pessoas: z.array(z.object({ userId: z.string(), numero: z.string().trim().max(30), ativo: z.boolean() })).max(300)
    .transform((xs, ctx) => xs.filter((p) => p.numero).map((p) => {
      const n = numeroWhatsApp(p.numero);
      if (!n) ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Número inválido: ${p.numero}` });
      return { ...p, numero: n ?? '' };
    })),
  eventos: z.object(Object.fromEntries(EVENTOS_AVISO.map((e) => [e, CanaisSchema])) as Record<EventoAviso, typeof CanaisSchema>),
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
  telefone: z.string().trim().max(40).optional(),
  nome: z.string().trim().max(120).optional(),
  sessaoId: z.string().trim().max(120).optional(),
  clienteId: z.string().trim().max(60).optional(),
  assunto: z.string().trim().max(200).optional(),
  prioridade: z.enum(PRIORIDADES).optional(),
  etiquetas: z.array(EtiquetaSchema).max(20).optional(),
}).refine((e) => !!(e.titulo || e.relato || e.telefone || e.sessaoId), 'Mande pelo menos o título, o relato, o telefone ou a sessão');
/** O cliente escreveu (o webhook de mensagem recebida, pelo n8n): pode reabrir o Resolvido. */
export const EntradaMensagemSchema = z.object({
  telefone: z.string().trim().min(8).max(40),
  texto: z.string().max(5000).default(''),
  sessaoId: z.string().trim().max(120).optional(),
});
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
};

export const TIPOS_EVENTO = [
  'criado', 'etapa', 'responsavel', 'campo', 'prioridade', 'espera', 'ligacao', 'pai', 'filho', 'problema', 'incidente',
  'checklist', 'tempo', 'operadora', 'aviso_cliente', 'aviso_equipe', 'reaberto', 'painel', 'ia', 'resposta_pronta',
  'cliente_respondeu', 'prazo', 'fechou_sozinho', 'observador', 'lixeira',
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
export type AnotacaoChamado = { id: string; texto: string; por: PessoaCurta | null; porNome: string | null; em: string; anexos: AnexoChamado[]; podeApagar: boolean };
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
  afetados: Afetado[];
  checklist: ItemChecklist[];
  observadores: PessoaCurta[];
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
  faltam: Record<string, Array<CampoObrigatorio | 'validacao'>>;
  /** etapa (id) → os filhos que travam (vazio = nada trava) */
  filhosTravam: Record<string, string[]>;
  grafo: GrafoChamado;
  observando: boolean;
  pode: { trabalhar: boolean; cuidar: boolean };
};

export type NoGrafo = { id: string; codigo: string; titulo: string; situacao: SituacaoDoChamado; tipoChamado: TipoChamado; centro: boolean; profundidade: number };
export type ArestaGrafo = { de: string; para: string; tipo: 'filho' | 'incidente' | 'citado' | TipoLigacaoChamado };
export type GrafoChamado = { nos: NoGrafo[]; arestas: ArestaGrafo[]; cortado: boolean };

export type RespostaPronta = { id: string; nome: string; texto: string; painelId: string | null; acao: AcaoResposta; ordem: number; ativa: boolean };
export type Agendado = {
  id: string; painelId: string; titulo: string; relato: string | null; clienteId: string | null; clienteNome: string | null;
  responsavelId: string | null; responsavelNome: string | null; assuntoId: string | null; prioridade: Prioridade | null; checklist: string[];
  regra: RegraAgendado; textoRegra: string; ativo: boolean; proximaEm: string | null; ultimaEm: string | null; ultimoCodigo: string | null;
};

export type OpcoesAtendimento = {
  paineis: Painel[];
  pessoas: Array<PessoaCurta & { ativo: boolean }>;
  assuntos: Assunto[];
  produtos: Array<{ id: string; nome: string; cor: string }>;
  operadoras: Array<{ id: string; nome: string }>;
  /** as etiquetas já usadas (para sugerir) */
  etiquetas: string[];
  prazos: AjustesPrazos;
  respostas: RespostaPronta[];
  /** o WhatsApp está pronto para mandar ao cliente? e à equipe? */
  whatsapp: { cliente: boolean; equipe: boolean };
  ia: { ativa: boolean; modelo: string | null };
  /** o endereço do LineChat (para abrir a conversa e o card antigo) */
  linechatUrl: string | null;
  pode: { trabalhar: boolean; cuidar: boolean; integrar: boolean };
};

export type ColunaQuadro = { etapa: EtapaPainel; chamados: CartaoChamado[]; total: number; escondidos: number };
export type QuadroAtendimento = { painelId: string; colunas: ColunaQuadro[]; foraDoHorario: boolean; agora: string };

export const TIPOS_AVISO = ['recebeu', 'etapa', 'prazo_perto', 'prazo_vencido', 'sem_dono', 'critico', 'cliente_respondeu', 'pai'] as const;
export type TipoAviso = (typeof TIPOS_AVISO)[number];
export type AvisoNaTela = { id: string; tipo: TipoAviso; texto: string; chamado: { id: string; codigo: string; titulo: string } | null; em: string; lido: boolean };
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

export type AvisosChamadosTela = Omit<AvisosChamadosGravar, 'chave' | 'pessoas'> & {
  temChavePropria: boolean;
  temChaveLineChat: boolean;
  pessoas: Array<{ userId: string; nome: string; numero: string; ativo: boolean }>;
  ultimoTesteEm: string | null; ultimoTesteOk: boolean | null; ultimoTesteMsg: string | null;
};
export const AVISOS_CHAMADOS_PADRAO: Omit<AvisosChamadosTela, 'pessoas' | 'temChavePropria' | 'temChaveLineChat'> = {
  ativo: false, url: 'https://api.inglinechat.com.br/chat/v1/message/send', usarChaveDoLineChat: true,
  // o número oficial do suporte, o mesmo do "não ajudou" do portal
  numeroCliente: '557130348350', numeroEquipe: '',
  modeloCliente: 'Olá, {contato}! Sobre o seu chamado {codigo} ({titulo}):\n\n{texto}\n\nEquipe de suporte Ingline',
  template: null, eventos: EVENTOS_AVISO_PADRAO,
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

/** O cadastro do cliente para escolher o que foi afetado, os produtos e as operadoras. */
export type CadastroDoCliente = {
  produtos: Array<{ id: string; nome: string; cor: string }>;
  operadoras: Array<{ id: string; nome: string }>;
  circuitos: Array<{ id: string; nome: string; operadora: string | null }>;
  dids: Array<{ id: string; numero: string; circuito: string | null }>;
  aparelhos: Array<{ id: string; nome: string }>;
  unidades: Array<{ id: string; nome: string }>;
  /** os chamados dos últimos 7 dias deste cliente (para reabrir em vez de abrir outro) */
  recentes: CartaoChamado[];
};

// =====================================================================
//  AS FRASES DO HISTÓRICO
// =====================================================================

const nomeNivel = (n: unknown) => (n ? ` (N${n})` : '');
/** Uma frase por evento, a mesma no servidor e na prévia. */
export function textoDoEvento(tipo: TipoEvento, d: Record<string, any>): string {
  switch (tipo) {
    case 'criado': return `abriu o chamado${d.origem && d.origem !== 'manual' ? ` (${NOME_ORIGEM[d.origem as Origem] ?? d.origem})` : ''}${d.etapa ? ` em ${d.etapa}` : ''}`;
    case 'etapa': {
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
    case 'reaberto': return `reabriu o chamado${d.motivo ? `: ${d.motivo}` : ''}`;
    case 'painel': return `passou do painel ${d.de} para ${d.para}`;
    case 'ia': return `preencheu com a IA: ${(d.campos as string[] | undefined)?.join(', ') || 'nada mudou'}`;
    case 'resposta_pronta': return `usou a resposta pronta "${d.nome}"`;
    case 'cliente_respondeu': return d.reabriu ? `o cliente respondeu e o chamado reabriu: "${d.texto}"` : `o cliente respondeu: "${d.texto}"`;
    case 'prazo': return d.texto ?? 'alerta de prazo';
    case 'fechou_sozinho': return `fechou sozinho: ${d.dias} ${d.dias === 1 ? 'dia útil' : 'dias úteis'} no ${d.etapa ?? 'Resolvido'} sem resposta do cliente`;
    case 'observador': return d.acao === 'saiu' ? `deixou de acompanhar` : `passou a acompanhar`;
    case 'lixeira': return d.acao === 'restaurou' ? 'restaurou da lixeira' : 'mandou para a lixeira';
    default: return String(tipo);
  }
}

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
//  A BUSCA E A ORDEM DA LISTA (as mesmas no servidor e na prévia)
// =====================================================================

/** O chamado com o texto que a busca procura (montado por quem carrega: servidor ou prévia). */
export type CartaoParaLista = CartaoChamado & { busca: string };

/** O texto de busca de um chamado: código, título, cliente, contato, telefone, assunto, etiquetas e os textos. */
export function textoDeBusca(c: CartaoChamado, textos: Array<string | null | undefined> = []): string {
  return paraBusca([
    c.codigo, c.titulo, c.cliente?.nome, c.contato?.nome, c.contato?.telefone, c.assunto?.caminho, c.tipo,
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
export function resumoDosPaineis(paineis: Array<Pick<Painel, 'id' | 'etapas'>>, cartoes: CartaoChamado[], euId: string | null): ResumoDoPainel[] {
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
    };
  });
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

export function ordenarCartoes<T extends CartaoChamado>(lista: T[], sort: string | undefined, dir: 'asc' | 'desc' | undefined, ordemDasEtapas: Map<string, number>): T[] {
  const col = sort || 'urgencia';
  const valores: Record<string, (c: T) => string | number | null> = {
    codigo: (c) => c.numero, titulo: (c) => c.titulo.toLocaleLowerCase('pt-BR'), cliente: (c) => c.cliente?.nome.toLocaleLowerCase('pt-BR') ?? null,
    etapa: (c) => ordemDasEtapas.get(c.etapaId) ?? 999, prioridade: (c) => (c.prioridade ? PESO_PRIORIDADE[c.prioridade] : null),
    responsavel: (c) => c.responsavel?.nome.toLocaleLowerCase('pt-BR') ?? null, assunto: (c) => c.assunto?.caminho.toLocaleLowerCase('pt-BR') ?? null,
    prazo: (c) => c.prazos.solucao.venceEm ?? (c.prazos.solucao.situacao === 'vencido' ? '0' : null), criado: (c) => c.criadoEm, atualizado: (c) => c.ultimaAtividadeEm,
  };
  if (col === 'urgencia' || !valores[col]) return [...lista].sort((a, b) => (dir === 'desc' ? -1 : 1) * compararUrgencia(a, b));
  const pegar = valores[col]!;
  // datas e o "atualizado" nascem do mais novo; o resto, crescendo. O vazio fica sempre no fim.
  const sentido = dir ?? (col === 'criado' || col === 'atualizado' ? 'desc' : 'asc');
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
/** O CSV (separado por ponto e vírgula, como o Excel do Brasil abre) com as colunas da lista. */
export function csvDosChamados(lista: CartaoChamado[], nomes: { painel: (id: string) => string; etapa: (id: string) => string }): string {
  const cab = ['Código', 'Título', 'Painel', 'Etapa', 'Situação', 'Cliente', 'Contato', 'Telefone', 'Responsável', 'Assunto', 'Tipo', 'Gravidade', 'Alcance', 'Prioridade', 'Etiquetas', 'Esperando', 'Prazo de resposta', 'Prazo de solução', 'Aberto em', 'Resolvido em', 'Fechado em', 'Origem'];
  const linhas = lista.map((c) => [
    c.codigo, c.titulo, nomes.painel(c.painelId), nomes.etapa(c.etapaId), NOME_SITUACAO_CHAMADO[c.situacao], c.cliente?.nome, c.contato?.nome, c.contato?.telefone,
    c.responsavel?.nome, c.assunto?.caminho, c.tipo, c.gravidade ? NOME_GRAVIDADE[c.gravidade] : '', c.alcance ? NOME_ALCANCE[c.alcance] : '',
    c.prioridade ? NOME_PRIORIDADE[c.prioridade] : '', c.etiquetas.join(', '), c.espera ? NOME_ESPERA[c.espera.tipo] : '',
    c.prazos.resposta.situacao === 'sem' ? '' : NOME_SITUACAO_PRAZO[c.prazos.resposta.situacao], c.prazos.solucao.situacao === 'sem' ? '' : NOME_SITUACAO_PRAZO[c.prazos.solucao.situacao],
    dataHora(c.criadoEm), dataHora(c.resolvidoEm), dataHora(c.fechadoEm), NOME_ORIGEM[c.origem],
  ].map(celula).join(';'));
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

/** Etiquetas sem repetir (sem ligar para maiúscula e acento), na ordem em que vieram. */
export function etiquetasUnicas(xs: string[]): string[] {
  const vistas = new Map<string, string>();
  for (const x of xs) { const t = x.trim(); if (t && !vistas.has(paraBusca(t))) vistas.set(paraBusca(t), t); }
  return [...vistas.values()];
}

/**
 * O link da conversa no LineChat, pelo modelo que a administração escreveu nas Integrações
 * ("https://…/{sessao}"). Sem modelo, não há link: o endereço da conversa é do LineChat e muda com ele.
 */
export function linkDaConversa(modelo: string | null | undefined, sessaoId: string | null | undefined): string | null {
  if (!modelo || !sessaoId || !modelo.includes('{sessao}')) return null;
  return modelo.replace('{sessao}', encodeURIComponent(sessaoId));
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
export type RespostaProntaGravarEntrada = z.input<typeof RespostaProntaGravarSchema>;
export type AgendadoGravarEntrada = z.input<typeof AgendadoGravarSchema>;
export type AvisosChamadosEntrada = z.input<typeof AvisosChamadosSchema>;
export type WebhookGravarEntrada = z.input<typeof WebhookGravarSchema>;
