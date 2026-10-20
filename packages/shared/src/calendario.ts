/**
 * O CALENDÁRIO (Patch 2.0.1, decisão 0049; os lembretes no 2.0.2) — as visitas, as viradas de sistema e
 * para a nuvem, as folgas, os home offices e as ações no cliente de cada equipe. O pedido do Luan: "quero criar um módulo de
 * calendário, para eu poder controlar com minha equipe visitas, viradas de sistemas, virada para nuvem,
 * folgas, home offices, ações que temos que tomar durante o mês no cliente… tem que ser integrado com os
 * painéis… se eu só sou participante do painel do suporte eu só vou ver a do suporte, se eu sou do painel
 * do adm e do suporte e do dev eu vou ver atividades de datas de todos".
 *
 * Cada evento é de UM OU MAIS PAINÉIS (os dos chamados: as equipes), e quem vê o evento é quem vê um dos
 * painéis dele — a regra dos chamados (o "Quem vê" do painel, em Painéis › Ajustes › Painéis). O dia é
 * o do calendário (AAAA-MM-DD, sem fuso: o "hoje" é o de Brasília) e a hora, a de Brasília (HH:MM).
 * As regras moram aqui: o servidor e a prévia usam as mesmas.
 */
import { z } from 'zod';
import { CORES_ETIQUETA, type CorEtiqueta } from './atendimento.js';
import { diaEmBrasilia, diasEntre, somarDias } from './chamados.js';
import { paraBusca } from './formatos.js';
import { diaDaSemana, nomeDoMes, somarMeses } from './relatorios.js';

// =====================================================================
//  OS TIPOS (Visita, Folga…): nome e cor, a equipe edita
// =====================================================================

// =====================================================================
//  OS LEMBRETES (Patch 2.0.2): quanto tempo antes de o evento começar
// =====================================================================

/*
 * O pedido do Luan (20/10): "o nosso sistema de calendário tem que ter lembretes e avisos configuráveis,
 * para eu alertar quando for acontecer algo e em quanto tempo antes". Cada evento tem até 5 lembretes, cada
 * um "quanto tempo antes" de o evento começar (em minutos: 0 = na hora, 60 = 1 hora antes, 1440 = 1 dia
 * antes; até 4 semanas), e quem recebe: as pessoas do evento (sem pessoas, quem pôs o evento) ou todos que
 * veem o evento. Cada tipo traz os lembretes dele (a Visita, 1 dia antes e 1 hora antes), que o evento novo já
 * vem com. O evento de dia inteiro começa, para o lembrete, às 8h do primeiro dia.
 *
 * O lembrete sai uma vez para cada começo: a chave de "já saiu" é o lembrete e o começo (`chaveDoLembrete`),
 * e mudar o dia ou a hora muda o começo — o lembrete volta a valer para o dia novo. O que já tinha passado
 * quando o evento foi gravado não sai (quem gravou acabou de ver o evento); com o sistema fora do ar na hora,
 * sai quando ele voltar, até 3 horas depois, desde que o evento ainda não tenha começado.
 */

/** Até quantos lembretes um evento (ou um tipo) tem. */
export const MAX_LEMBRETES = 5;
/** O mais cedo que um lembrete sai: 4 semanas antes (em minutos). */
export const MAX_ANTES_DO_LEMBRETE = 4 * 7 * 24 * 60;
/** O evento de dia inteiro começa, para o lembrete, a esta hora do primeiro dia (a de Brasília). */
export const HORA_DO_DIA_INTEIRO = '08:00';
/** Com o sistema fora do ar na hora, o lembrete ainda sai até este tempo depois (em minutos). */
const ATRASO_DO_LEMBRETE = 3 * 60;
/** O lembrete "na hora" ainda sai até este tempo depois de o evento começar (o relógio passa de minuto em minuto). */
const FOLGA_DO_COMECO = 5;

export const UNIDADES_DO_LEMBRETE = ['minutos', 'horas', 'dias', 'semanas'] as const;
export type UnidadeDoLembrete = (typeof UNIDADES_DO_LEMBRETE)[number];
export const MINUTOS_DA_UNIDADE: Record<UnidadeDoLembrete, number> = { minutos: 1, horas: 60, dias: 24 * 60, semanas: 7 * 24 * 60 };
const NOME_DA_UNIDADE: Record<UnidadeDoLembrete, [string, string]> = {
  minutos: ['minuto', 'minutos'], horas: ['hora', 'horas'], dias: ['dia', 'dias'], semanas: ['semana', 'semanas'],
};

/** Os lembretes: minutos antes do começo, sem repetir, do mais cedo para o mais tarde. */
export const LembretesSchema = z.array(
  z.number({ invalid_type_error: 'O lembrete vai em minutos.' }).int('O lembrete vai em minutos inteiros.')
    .min(0, 'O lembrete é antes do evento (ou na hora).').max(MAX_ANTES_DO_LEMBRETE, 'O lembrete vai até 4 semanas antes.'),
).max(MAX_LEMBRETES, `Até ${MAX_LEMBRETES} lembretes.`)
  .transform((xs) => [...new Set(xs)].sort((a, b) => b - a));

/** Quem recebe o lembrete do evento. */
export const QUEM_RECEBE_O_LEMBRETE = ['pessoas', 'paineis'] as const;
export type QuemRecebeOLembrete = (typeof QUEM_RECEBE_O_LEMBRETE)[number];
export const NOME_QUEM_RECEBE_O_LEMBRETE: Record<QuemRecebeOLembrete, string> = {
  pessoas: 'As pessoas do evento',
  paineis: 'Todos que veem o evento',
};

/** O lembrete na unidade maior que dá conta inteira: 1440 → 1 dia; 90 → 90 minutos; 0 → 0 minutos. */
export function emUnidade(minutos: number): { quanto: number; unidade: UnidadeDoLembrete } {
  for (const u of ['semanas', 'dias', 'horas'] as const) {
    if (minutos > 0 && minutos % MINUTOS_DA_UNIDADE[u] === 0) return { quanto: minutos / MINUTOS_DA_UNIDADE[u], unidade: u };
  }
  return { quanto: minutos, unidade: 'minutos' };
}
/** "15 minutos", "1 hora", "2 dias" (sem o "antes"). */
function quantoTempo(minutos: number): string {
  const { quanto, unidade } = emUnidade(minutos);
  return `${quanto} ${NOME_DA_UNIDADE[unidade][quanto === 1 ? 0 : 1]}`;
}
/** Um lembrete: "Na hora", "15 minutos antes", "1 dia antes". */
export const textoDoAntes = (minutos: number) => (minutos === 0 ? 'Na hora' : `${quantoTempo(minutos)} antes`);
/**
 * Os lembretes numa frase, cada um com o seu "antes" (o "1 dia e 1 hora antes" pareceria um lembrete só, de
 * 25 horas): "1 dia antes e 1 hora antes", "1 hora antes e na hora", "na hora"; nenhum, "sem lembrete".
 */
export function textoDosLembretes(lembretes: readonly number[]): string {
  const cada = [...new Set(lembretes)].sort((a, b) => b - a).map((m) => (m === 0 ? 'na hora' : `${quantoTempo(m)} antes`));
  if (!cada.length) return 'sem lembrete';
  return cada.length > 1 ? `${cada.slice(0, -1).join(', ')} e ${cada.at(-1)}` : cada[0]!;
}

/**
 * O começo do evento, para o lembrete: o primeiro dia, na hora de começar (Brasília, sem horário de verão:
 * -03:00 o ano inteiro); o de dia inteiro, às 8h.
 */
export function comecoDoEvento(e: { inicio: string; diaInteiro: boolean; horaInicio: string | null }): Date {
  const hora = !e.diaInteiro && e.horaInicio ? e.horaInicio : HORA_DO_DIA_INTEIRO;
  return new Date(`${e.inicio}T${hora}:00-03:00`);
}
/** A chave de "já saiu" de um lembrete: ele e o começo (mudou o dia ou a hora, é outro lembrete). */
export const chaveDoLembrete = (antes: number, comeco: Date) => `${antes}@${comeco.toISOString()}`;
/** Quando o lembrete sai. */
export const momentoDoLembrete = (comeco: Date, antes: number) => new Date(comeco.getTime() - antes * 60_000);

/** O que o evento precisa para os lembretes. */
export type EventoComLembretes = { inicio: string; diaInteiro: boolean; horaInicio: string | null; situacao: SituacaoDoEvento; lembretes: readonly number[] };

/**
 * Os lembretes "já saíram" depois de gravar o evento: os que continuam valendo (o mesmo lembrete, o mesmo
 * começo) ficam; os que já passaram agora entram como pulados — quem gravou acabou de ver o evento, e o
 * lembrete de ontem não sai hoje. O que é de outro começo (o dia mudou) sai da conta.
 */
export function lembretesAoGravar(e: EventoComLembretes, antes: Readonly<Record<string, string>>, agora: Date): Record<string, string> {
  const comeco = comecoDoEvento(e);
  const out: Record<string, string> = {};
  for (const m of e.lembretes) {
    const chave = chaveDoLembrete(m, comeco);
    if (antes[chave]) out[chave] = antes[chave]!;
    else if (momentoDoLembrete(comeco, m).getTime() <= agora.getTime()) out[chave] = 'pulado';
  }
  return out;
}

/**
 * Os lembretes que saem agora (os minutos de cada um): o evento agendado, o momento chegou (até 3 horas de
 * atraso, com o sistema fora do ar), o evento ainda não começou (o "na hora" sai até 5 minutos depois) e
 * ainda não saiu para este começo.
 */
export function lembretesDevidos(e: EventoComLembretes, enviados: Readonly<Record<string, string>>, agora: Date): number[] {
  if (e.situacao !== 'agendado' || !e.lembretes.length) return [];
  const comeco = comecoDoEvento(e);
  const t = agora.getTime();
  return e.lembretes.filter((m) => {
    if (enviados[chaveDoLembrete(m, comeco)]) return false;
    const momento = momentoDoLembrete(comeco, m).getTime();
    // depois de o evento começar, só o "na hora" (por uns minutos: o relógio passa de minuto em minuto)
    const limite = comeco.getTime() + (m === 0 ? FOLGA_DO_COMECO * 60_000 : 0);
    return momento <= t && t <= Math.min(momento + ATRASO_DO_LEMBRETE * 60_000, limite);
  });
}

/**
 * Quem recebe o lembrete: as pessoas do evento (sem pessoas, quem pôs o evento) ou todos que veem o evento —
 * sempre entre quem vê um dos painéis dele (quem não vê nem saberia do evento). `quemVe`: de cada painel,
 * quem vê (as pessoas ativas).
 */
export function quemRecebeOLembrete(
  e: { paineis: readonly string[]; pessoas: readonly string[]; lembrarQuem: QuemRecebeOLembrete; criadoPorId: string | null },
  quemVe: ReadonlyMap<string, readonly string[]>,
): string[] {
  const veem = new Set(e.paineis.flatMap((p) => quemVe.get(p) ?? []));
  if (e.lembrarQuem === 'paineis') return [...veem];
  const pessoas = e.pessoas.length ? e.pessoas : e.criadoPorId ? [e.criadoPorId] : [];
  return [...new Set(pessoas)].filter((p) => veem.has(p));
}

/**
 * Quando é o evento do lembrete: "amanhã, 21/10, às 09:00", "hoje, 20/10 (dia inteiro)". O dia vai escrito
 * também, porque o aviso fica no sininho depois do "amanhã".
 */
export function quandoDoLembrete(e: { inicio: string; diaInteiro: boolean; horaInicio: string | null }, agora: Date): string {
  const hoje = diaEmBrasilia(agora);
  const dia = e.inicio === hoje ? 'hoje' : e.inicio === somarDias(hoje, 1) ? 'amanhã' : DIAS_POR_EXTENSO[diaDaSemana(e.inicio)];
  const hora = !e.diaInteiro && e.horaInicio ? `, às ${e.horaInicio}` : ' (dia inteiro)';
  return `${dia}, ${diaCurto(e.inicio)}${hora}`;
}

/** O texto do lembrete (o sininho, e o {aviso} do WhatsApp): "Lembrete: Visita — Clínica Aurora, amanhã, 21/10, às 09:00". */
export function textoDoLembrete(e: { titulo: string; inicio: string; diaInteiro: boolean; horaInicio: string | null }, agora: Date): string {
  return `Lembrete: ${e.titulo}, ${quandoDoLembrete(e, agora)}`;
}

/**
 * As variáveis da mensagem do lembrete no WhatsApp (2.0.2: a mensagem de cada aviso, em Avisos e WhatsApp).
 * Os nomes (o tipo, o cliente, o chamado, as pessoas e os painéis) vêm de quem chama: o servidor e a prévia.
 */
export function valoresDoLembrete(
  e: { titulo: string; inicio: string; diaInteiro: boolean; horaInicio: string | null; local: string | null; observacao: string | null },
  nomes: { tipo: string; cliente: string | null; chamado: string | null; pessoas: string[]; paineis: string[]; link: string },
  agora: Date,
): Record<string, string> {
  return {
    aviso: textoDoLembrete(e, agora), evento: e.titulo, tipo: nomes.tipo, quando: quandoDoLembrete(e, agora), local: e.local ?? '',
    cliente: nomes.cliente ?? '', chamado: nomes.chamado ?? '', pessoas: nomes.pessoas.join(', '), paineis: nomes.paineis.join(', '),
    observacao: e.observacao ?? '', link: nomes.link,
  };
}

/**
 * Um tipo de evento. `daEquipe`: é sobre a equipe, não sobre um cliente (a folga, o home office) — entra
 * no "Hoje, fora do escritório" e a janela pede primeiro as pessoas. O tipo que sai é desativado, não
 * apagado: os eventos dele continuam com o nome e a cor. `lembretes` (2.0.2): os que o evento novo do tipo
 * já traz (minutos antes; a pessoa muda no evento).
 */
export type TipoDeEvento = { id: string; nome: string; cor: CorEtiqueta; daEquipe: boolean; ativo: boolean; lembretes: number[] };

/** Os tipos que já vêm (os do pedido do Luan, e a reunião), com os lembretes de cada um. */
export const TIPOS_DE_EVENTO_PADRAO: readonly TipoDeEvento[] = Object.freeze([
  { id: 'visita', nome: 'Visita', cor: 'accent', daEquipe: false, ativo: true, lembretes: [1440, 60] },
  { id: 'virada-sistema', nome: 'Virada de sistema', cor: 'roxo', daEquipe: false, ativo: true, lembretes: [1440, 60] },
  { id: 'virada-nuvem', nome: 'Virada para nuvem', cor: 'turquesa', daEquipe: false, ativo: true, lembretes: [1440] },
  { id: 'acao-cliente', nome: 'Ação no cliente', cor: 'signal', daEquipe: false, ativo: true, lembretes: [60] },
  { id: 'reuniao', nome: 'Reunião', cor: 'amarelo', daEquipe: false, ativo: true, lembretes: [15] },
  { id: 'folga', nome: 'Folga', cor: 'ok', daEquipe: true, ativo: true, lembretes: [] },
  { id: 'home-office', nome: 'Home office', cor: 'rosa', daEquipe: true, ativo: true, lembretes: [] },
].map((t) => Object.freeze(t as TipoDeEvento)));

export const TipoDeEventoSchema = z.object({
  id: z.string().trim().min(1).max(60),
  nome: z.string().trim().min(1, 'Dê um nome ao tipo.').max(40, 'O nome do tipo vai até 40 letras.'),
  cor: z.enum(CORES_ETIQUETA),
  daEquipe: z.boolean().default(false),
  ativo: z.boolean().default(true),
  lembretes: LembretesSchema.default([]),
});

/** Os tipos do calendário (Calendário › o botão Tipos): pelo menos um ativo, sem repetir o nome. */
export const TiposDoCalendarioSchema = z.object({
  tipos: z.array(TipoDeEventoSchema).min(1).max(40, 'Tipos demais (até 40).')
    .superRefine((ts, ctx) => {
      const ids = new Set<string>();
      const nomes = new Set<string>();
      ts.forEach((t, i) => {
        if (ids.has(t.id)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: [i, 'id'], message: 'Há dois tipos com o mesmo código.' });
        if (nomes.has(paraBusca(t.nome))) ctx.addIssue({ code: z.ZodIssueCode.custom, path: [i, 'nome'], message: `Há dois tipos chamados ${t.nome}: um nome para cada.` });
        ids.add(t.id); nomes.add(paraBusca(t.nome));
      });
      if (!ts.some((t) => t.ativo)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Deixe pelo menos um tipo ativo.' });
    }),
});
export type TiposDoCalendario = z.infer<typeof TiposDoCalendarioSchema>;
export type TiposDoCalendarioEntrada = z.input<typeof TiposDoCalendarioSchema>;

/** Os tipos de fábrica, numa cópia (os lembretes também: quem mexe na cópia não mexe na fábrica). */
export const tiposDeFabrica = (): TipoDeEvento[] => TIPOS_DE_EVENTO_PADRAO.map((t) => ({ ...t, lembretes: [...t.lembretes] }));

/**
 * Os tipos guardados (ou os de fábrica, enquanto ninguém mexeu). O tipo guardado antes do 2.0.2 não tem
 * os lembretes: o de fábrica (a Visita, a Reunião…) fica com os da fábrica; o que a equipe incluiu, sem.
 */
export function tiposDoCalendario(guardado: { tipos?: unknown } | null | undefined): TipoDeEvento[] {
  const tipos = (guardado as { tipos?: unknown } | null | undefined)?.tipos;
  const comLembretes = Array.isArray(tipos)
    ? tipos.map((t: unknown) => {
      if (!t || typeof t !== 'object' || 'lembretes' in t) return t;
      const fabrica = TIPOS_DE_EVENTO_PADRAO.find((f) => f.id === (t as { id?: unknown }).id);
      return { ...t, lembretes: fabrica ? [...fabrica.lembretes] : [] };
    })
    : tipos;
  const r = TiposDoCalendarioSchema.safeParse({ ...(guardado ?? {}), tipos: comLembretes });
  return r.success ? r.data.tipos : tiposDeFabrica();
}

/** O tipo pelo id; o que não existe mais vira um "Outro" cinza (o evento não some por isso). */
export function tipoDoEvento(tipos: readonly TipoDeEvento[], id: string): TipoDeEvento {
  return tipos.find((t) => t.id === id) ?? { id, nome: 'Outro', cor: 'neutral', daEquipe: false, ativo: false, lembretes: [] };
}

// =====================================================================
//  O EVENTO
// =====================================================================

export const SITUACOES_DO_EVENTO = ['agendado', 'feito', 'cancelado'] as const;
export type SituacaoDoEvento = (typeof SITUACOES_DO_EVENTO)[number];
export const NOME_SITUACAO_DO_EVENTO: Record<SituacaoDoEvento, string> = { agendado: 'Agendado', feito: 'Feito', cancelado: 'Cancelado' };

/** Um evento vai até 62 dias seguidos (a folga longa, as férias de um mês): mais que isso, em partes. */
export const MAX_DIAS_DO_EVENTO = 62;

const DIA = /^(\d{4})-(\d{2})-(\d{2})$/;
/** O dia existe (o 31/02 não). */
export function diaValido(dia: string): boolean {
  const m = DIA.exec(dia);
  if (!m) return false;
  const d = new Date(`${dia}T12:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === dia;
}
export const DiaDoCalendarioSchema = z.string().trim().refine(diaValido, 'A data vai como dia/mês/ano, e o dia precisa existir.');
export const HoraDoEventoSchema = z.string().trim().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'A hora vai como 14:30.');

/** Criar e editar um evento (a janela do evento). Dia inteiro tira as horas. */
export const EventoGravarSchema = z.object({
  titulo: z.string().trim().min(1, 'Dê um título ao evento.').max(160, 'O título vai até 160 letras.'),
  tipoId: z.string().trim().min(1, 'Escolha o tipo.').max(60),
  paineis: z.array(z.string().trim().min(1).max(60)).min(1, 'Escolha pelo menos um painel: é ele que diz quem vê o evento.').max(20),
  pessoas: z.array(z.string().trim().min(1).max(60)).max(50, 'Pessoas demais (até 50).').default([]),
  clienteId: z.string().trim().max(60).nullable().default(null),
  chamadoId: z.string().trim().max(60).nullable().default(null),
  inicio: DiaDoCalendarioSchema,
  fim: DiaDoCalendarioSchema,
  diaInteiro: z.boolean().default(true),
  horaInicio: HoraDoEventoSchema.nullable().default(null),
  horaFim: HoraDoEventoSchema.nullable().default(null),
  local: z.string().trim().max(300, 'O local vai até 300 letras.').default(''),
  observacao: z.string().trim().max(4_000, 'A observação vai até 4000 letras.').default(''),
  situacao: z.enum(SITUACOES_DO_EVENTO).default('agendado'),
  /** os lembretes (2.0.2): minutos antes do começo; quem recebe */
  lembretes: LembretesSchema.default([]),
  lembrarQuem: z.enum(QUEM_RECEBE_O_LEMBRETE).default('pessoas'),
}).superRefine((e, ctx) => {
  if (diaValido(e.inicio) && diaValido(e.fim)) {
    if (e.fim < e.inicio) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['fim'], message: 'O último dia vem depois do primeiro.' });
    else if (diasEntre(e.inicio, e.fim) + 1 > MAX_DIAS_DO_EVENTO) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['fim'], message: `Um evento vai até ${MAX_DIAS_DO_EVENTO} dias seguidos: para mais, divida em partes.` });
  }
  if (!e.diaInteiro) {
    if (!e.horaInicio) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['horaInicio'], message: 'Diga a hora de começar (ou marque o dia inteiro).' });
    else if (e.horaFim && e.inicio === e.fim && e.horaFim <= e.horaInicio) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['horaFim'], message: 'A hora de terminar vem depois da de começar.' });
  }
}).transform((e) => ({
  ...e,
  paineis: [...new Set(e.paineis)],
  pessoas: [...new Set(e.pessoas)],
  clienteId: e.clienteId || null,
  chamadoId: e.chamadoId || null,
  horaInicio: e.diaInteiro ? null : e.horaInicio,
  horaFim: e.diaInteiro ? null : e.horaFim,
}));
export type EventoGravar = z.infer<typeof EventoGravarSchema>;
export type EventoGravarEntrada = z.input<typeof EventoGravarSchema>;

/** O evento como a tela recebe. */
export type EventoDoCalendario = {
  id: string;
  titulo: string;
  tipoId: string;
  paineis: string[];
  pessoas: string[];
  clienteId: string | null;
  clienteNome: string | null;
  chamadoId: string | null;
  /** o código do chamado ligado (SUP-12), para o link */
  chamadoCodigo: string | null;
  inicio: string;
  fim: string;
  diaInteiro: boolean;
  horaInicio: string | null;
  horaFim: string | null;
  local: string;
  observacao: string;
  situacao: SituacaoDoEvento;
  /** os lembretes (2.0.2): minutos antes do começo, do mais cedo para o mais tarde */
  lembretes: number[];
  lembrarQuem: QuemRecebeOLembrete;
  criadoPor: string | null;
  criadoEm: string;
  alteradoPor: string | null;
  alteradoEm: string;
};

/** Os eventos de um período (a tela pede o mês que mostra, com as pontas da grade). */
export const EventosDoPeriodoSchema = z.object({ de: DiaDoCalendarioSchema, ate: DiaDoCalendarioSchema })
  .refine((p) => !diaValido(p.de) || !diaValido(p.ate) || (p.ate >= p.de && diasEntre(p.de, p.ate) <= 400), 'O período vai até 400 dias, e o fim vem depois do começo.');

/** A situação de um evento (o Feito e o Cancelado, sem abrir a janela). */
export const SituacaoDoEventoSchema = z.object({ situacao: z.enum(SITUACOES_DO_EVENTO) });

/** O que a tela do calendário precisa para montar a janela e os filtros. */
export type CalendarioOpcoes = {
  tipos: TipoDeEvento[];
  /** os painéis que a pessoa vê, com quem vê cada um (as pessoas do evento saem daí) */
  paineis: Array<{ id: string; nome: string; sigla: string; cor: string; ativo: boolean; pessoas: string[] }>;
  /** as pessoas ativas (os nomes), em ordem */
  pessoas: Array<{ id: string; nome: string }>;
  /** cria e edita eventos (trabalha nos chamados) */
  podeEditar: boolean;
  /** edita os tipos (cuida dos chamados) */
  podeCuidar: boolean;
  /** o dia de hoje em Brasília */
  hoje: string;
};

// =====================================================================
//  QUEM VÊ (a regra dos painéis)
// =====================================================================

/** O evento aparece para quem vê pelo menos um dos painéis dele. */
export const eventoVisivel = (e: Pick<EventoDoCalendario, 'paineis'>, paineisVisiveis: ReadonlySet<string>) =>
  e.paineis.some((p) => paineisVisiveis.has(p));

/**
 * Os painéis do evento depois de uma edição: os que a pessoa vê vêm do formulário; os que ela não vê
 * ficam como estavam (ela não tira o evento de uma equipe que não enxerga, nem põe numa).
 */
export function paineisDepoisDaEdicao(antes: readonly string[], pedidos: readonly string[], visiveis: ReadonlySet<string>): string[] {
  const escondidos = antes.filter((p) => !visiveis.has(p));
  return [...new Set([...pedidos.filter((p) => visiveis.has(p)), ...escondidos])];
}

/** Quem pode estar no evento: quem vê pelo menos um dos painéis (quem não vê nem saberia do evento). */
export function pessoasPossiveis(paineis: ReadonlyArray<{ id: string; pessoas: readonly string[] }>, escolhidos: readonly string[]): Set<string> {
  const ids = new Set<string>();
  for (const p of paineis) if (escolhidos.includes(p.id)) for (const x of p.pessoas) ids.add(x);
  return ids;
}

// =====================================================================
//  OS DIAS (a grade do mês, a semana que começa na segunda)
// =====================================================================

// a semana começa na segunda, como nos relatórios (diaDaSemana: 0 = segunda … 6 = domingo; os nomes
// curtos são o DIAS_DA_SEMANA de lá, e o "outubro de 2026" é o nomeDoMes)
const NOMES_DOS_MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'] as const;
const DIAS_POR_EXTENSO = ['segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado', 'domingo'] as const;

/** O dia de hoje em Brasília. */
export const hojeNoCalendario = (agora: Date = new Date()) => diaEmBrasilia(agora);
/** O mês (AAAA-MM) do dia. */
export const mesDoDia = (dia: string) => dia.slice(0, 7);
/** "outubro de 2026" (o mesmo dos relatórios). */
export const textoDoMes = (mes: string) => nomeDoMes(mes);
/** Os dias da grade do mês: semanas inteiras, de segunda a domingo, com as pontas dos meses vizinhos. */
export function diasDaGradeDoMes(mes: string): string[] {
  const primeiro = `${mes}-01`;
  const ultimo = somarDias(`${somarMeses(mes, 1)}-01`, -1);
  const de = somarDias(primeiro, -diaDaSemana(primeiro));
  const ate = somarDias(ultimo, 6 - diaDaSemana(ultimo));
  const out: string[] = [];
  for (let d = de; d <= ate; d = somarDias(d, 1)) out.push(d);
  return out;
}
/** "20/10". */
export const diaCurto = (dia: string) => `${dia.slice(8, 10)}/${dia.slice(5, 7)}`;
/** "segunda, 20 de outubro". */
export function diaPorExtenso(dia: string): string {
  return `${DIAS_POR_EXTENSO[diaDaSemana(dia)]}, ${Number(dia.slice(8, 10))} de ${NOMES_DOS_MESES[Number(dia.slice(5, 7)) - 1]}`;
}

/** O evento acontece no dia? */
export const cobreODia = (e: Pick<EventoDoCalendario, 'inicio' | 'fim'>, dia: string) => e.inicio <= dia && dia <= e.fim;

/** A ordem do dia: o dia inteiro primeiro, depois pela hora; o cancelado no fim. */
export function ordemDoDia(a: EventoDoCalendario, b: EventoDoCalendario): number {
  const ca = a.situacao === 'cancelado' ? 1 : 0;
  const cb = b.situacao === 'cancelado' ? 1 : 0;
  if (ca !== cb) return ca - cb;
  if (a.diaInteiro !== b.diaInteiro) return a.diaInteiro ? -1 : 1;
  return (a.horaInicio ?? '').localeCompare(b.horaInicio ?? '') || a.inicio.localeCompare(b.inicio) || a.titulo.localeCompare(b.titulo, 'pt-BR');
}
/** Os eventos de um dia, em ordem. */
export const eventosDoDia = (eventos: readonly EventoDoCalendario[], dia: string) => eventos.filter((e) => cobreODia(e, dia)).sort(ordemDoDia);

/** "Dia inteiro", "14:00–16:00" ou "às 14:00". */
export function textoDoHorario(e: Pick<EventoDoCalendario, 'diaInteiro' | 'horaInicio' | 'horaFim'>): string {
  if (e.diaInteiro || !e.horaInicio) return 'Dia inteiro';
  return e.horaFim ? `${e.horaInicio}–${e.horaFim}` : `às ${e.horaInicio}`;
}
/** "20/10", "20 a 22/10" ou "30/10 a 02/11". */
export function textoDoPeriodo(e: Pick<EventoDoCalendario, 'inicio' | 'fim'>): string {
  if (e.inicio === e.fim) return diaCurto(e.inicio);
  if (mesDoDia(e.inicio) === mesDoDia(e.fim)) return `${e.inicio.slice(8, 10)} a ${diaCurto(e.fim)}`;
  return `${diaCurto(e.inicio)} a ${diaCurto(e.fim)}`;
}

// =====================================================================
//  OS FILTROS E O "HOJE, FORA DO ESCRITÓRIO"
// =====================================================================

/**
 * Os filtros do calendário. O filtro de cliente saiu no 2.0.2 (o Luan, 20/10: "n precisa de filtro por
 * cliente"): a busca acha o evento pelo nome do cliente.
 */
export type FiltroDoCalendario = {
  /** os painéis escolhidos (vazio = todos os que a pessoa vê) */
  paineis: string[];
  /** os tipos escolhidos (vazio = todos) */
  tipos: string[];
  /** só os eventos desta pessoa ("Só os meus") */
  pessoa: string | null;
  /** mostrar os cancelados (riscados) */
  cancelados: boolean;
  busca: string;
};
export const FILTRO_DO_CALENDARIO_VAZIO: FiltroDoCalendario = { paineis: [], tipos: [], pessoa: null, cancelados: true, busca: '' };

/** Os eventos que passam no filtro (a busca acha o título, o cliente, o local, a observação e o chamado). */
export function filtrarEventos(eventos: readonly EventoDoCalendario[], f: FiltroDoCalendario, nomesDasPessoas?: ReadonlyMap<string, string>): EventoDoCalendario[] {
  const termo = paraBusca(f.busca.trim());
  return eventos.filter((e) => {
    if (f.paineis.length && !e.paineis.some((p) => f.paineis.includes(p))) return false;
    if (f.tipos.length && !f.tipos.includes(e.tipoId)) return false;
    if (f.pessoa && !e.pessoas.includes(f.pessoa)) return false;
    if (!f.cancelados && e.situacao === 'cancelado') return false;
    if (termo) {
      const pessoas = nomesDasPessoas ? e.pessoas.map((p) => nomesDasPessoas.get(p) ?? '').join(' ') : '';
      if (!paraBusca(`${e.titulo} ${e.clienteNome ?? ''} ${e.local} ${e.observacao} ${e.chamadoCodigo ?? ''} ${pessoas}`).includes(termo)) return false;
    }
    return true;
  });
}

/** Quem está fora no dia (folga, home office: os tipos da equipe), sem os cancelados. */
export function quemEstaFora(eventos: readonly EventoDoCalendario[], tipos: readonly TipoDeEvento[], dia: string): Array<{ tipo: TipoDeEvento; pessoas: string[] }> {
  const porTipo = new Map<string, Set<string>>();
  for (const e of eventos) {
    if (e.situacao === 'cancelado' || !cobreODia(e, dia)) continue;
    const tipo = tipoDoEvento(tipos, e.tipoId);
    if (!tipo.daEquipe) continue;
    const s = porTipo.get(tipo.id) ?? new Set<string>();
    for (const p of e.pessoas) s.add(p);
    porTipo.set(tipo.id, s);
  }
  return [...porTipo].filter(([, ps]) => ps.size).map(([id, ps]) => ({ tipo: tipoDoEvento(tipos, id), pessoas: [...ps] }));
}

/** O título que a janela sugere: "Visita — Clínica Aurora", "Folga — Carlos Lima". */
export function tituloSugerido(tipo: Pick<TipoDeEvento, 'nome' | 'daEquipe'>, cliente: string | null, pessoas: readonly string[]): string {
  const quem = tipo.daEquipe ? pessoas.join(', ') : cliente ?? '';
  return quem ? `${tipo.nome} — ${quem}` : tipo.nome;
}
