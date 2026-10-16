/**
 * O CALENDÁRIO (Patch 2.0.1, decisão 0049) — as visitas, as viradas de sistema e para a nuvem, as folgas,
 * os home offices e as ações no cliente de cada equipe. O pedido do Luan: "quero criar um módulo de
 * calendário, para eu poder controlar com minha equipe visitas, viradas de sistemas, virada para nuvem,
 * folgas, home offices, ações que temos que tomar durante o mês no cliente… tem que ser integrado com os
 * painéis… se eu só sou participante do painel do suporte eu só vou ver a do suporte, se eu sou do painel
 * do adm e do suporte e do dev eu vou ver atividades de datas de todos".
 *
 * Cada evento é de UM OU MAIS PAINÉIS (os dos chamados: as equipes), e quem vê o evento é quem vê um dos
 * painéis dele — a regra dos chamados (o "Quem vê" do painel, em Chamados › Ajustes › Painéis). O dia é
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

/**
 * Um tipo de evento. `daEquipe`: é sobre a equipe, não sobre um cliente (a folga, o home office) — entra
 * no "Hoje, fora do escritório" e a janela pede primeiro as pessoas. O tipo que sai é desativado, não
 * apagado: os eventos dele continuam com o nome e a cor.
 */
export type TipoDeEvento = { id: string; nome: string; cor: CorEtiqueta; daEquipe: boolean; ativo: boolean };

/** Os tipos que já vêm (os do pedido do Luan, e a reunião). */
export const TIPOS_DE_EVENTO_PADRAO: readonly TipoDeEvento[] = Object.freeze([
  { id: 'visita', nome: 'Visita', cor: 'accent', daEquipe: false, ativo: true },
  { id: 'virada-sistema', nome: 'Virada de sistema', cor: 'roxo', daEquipe: false, ativo: true },
  { id: 'virada-nuvem', nome: 'Virada para nuvem', cor: 'turquesa', daEquipe: false, ativo: true },
  { id: 'acao-cliente', nome: 'Ação no cliente', cor: 'signal', daEquipe: false, ativo: true },
  { id: 'reuniao', nome: 'Reunião', cor: 'amarelo', daEquipe: false, ativo: true },
  { id: 'folga', nome: 'Folga', cor: 'ok', daEquipe: true, ativo: true },
  { id: 'home-office', nome: 'Home office', cor: 'rosa', daEquipe: true, ativo: true },
].map((t) => Object.freeze(t as TipoDeEvento)));

export const TipoDeEventoSchema = z.object({
  id: z.string().trim().min(1).max(60),
  nome: z.string().trim().min(1, 'Dê um nome ao tipo.').max(40, 'O nome do tipo vai até 40 letras.'),
  cor: z.enum(CORES_ETIQUETA),
  daEquipe: z.boolean().default(false),
  ativo: z.boolean().default(true),
});

/** Os tipos do calendário (Chamados › … o botão Tipos do calendário): pelo menos um ativo, sem repetir o nome. */
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

/** Os tipos guardados (ou os de fábrica, enquanto ninguém mexeu). */
export function tiposDoCalendario(guardado: Partial<TiposDoCalendario> | null | undefined): TipoDeEvento[] {
  const r = TiposDoCalendarioSchema.safeParse(guardado ?? {});
  return r.success ? r.data.tipos : TIPOS_DE_EVENTO_PADRAO.map((t) => ({ ...t }));
}

/** O tipo pelo id; o que não existe mais vira um "Outro" cinza (o evento não some por isso). */
export function tipoDoEvento(tipos: readonly TipoDeEvento[], id: string): TipoDeEvento {
  return tipos.find((t) => t.id === id) ?? { id, nome: 'Outro', cor: 'neutral', daEquipe: false, ativo: false };
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

export type FiltroDoCalendario = {
  /** os painéis escolhidos (vazio = todos os que a pessoa vê) */
  paineis: string[];
  /** os tipos escolhidos (vazio = todos) */
  tipos: string[];
  /** só os eventos desta pessoa ("Só os meus") */
  pessoa: string | null;
  cliente: string | null;
  /** mostrar os cancelados (riscados) */
  cancelados: boolean;
  busca: string;
};
export const FILTRO_DO_CALENDARIO_VAZIO: FiltroDoCalendario = { paineis: [], tipos: [], pessoa: null, cliente: null, cancelados: true, busca: '' };

/** Os eventos que passam no filtro (a busca acha o título, o cliente, o local, a observação e o chamado). */
export function filtrarEventos(eventos: readonly EventoDoCalendario[], f: FiltroDoCalendario, nomesDasPessoas?: ReadonlyMap<string, string>): EventoDoCalendario[] {
  const termo = paraBusca(f.busca.trim());
  return eventos.filter((e) => {
    if (f.paineis.length && !e.paineis.some((p) => f.paineis.includes(p))) return false;
    if (f.tipos.length && !f.tipos.includes(e.tipoId)) return false;
    if (f.pessoa && !e.pessoas.includes(f.pessoa)) return false;
    if (f.cliente && e.clienteId !== f.cliente) return false;
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
