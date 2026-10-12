/**
 * PRIORIDADE E PRAZOS DOS CHAMADOS DO GESTOR (decisão 0047, Patch 1.10).
 *
 * O documento "Prioridade e prazos dos chamados" (o ICI-12) virou estas contas: a prioridade que o
 * Gestor sugere pela gravidade e pelo alcance, o horário de atendimento com os feriados, e os dois
 * prazos de cada chamado — a primeira resposta de uma pessoa e a solução —, contados em horas úteis
 * ou corridas, parando enquanto o chamado espera o cliente.
 *
 * As mesmas funções no servidor (a ficha, o quadro, o relógio dos alertas) e na prévia: o número que
 * a tela mostra é o que o relógio usa para avisar.
 *
 * O horário é sempre o de Brasília. O Brasil não tem horário de verão desde 2019, então a conta usa o
 * fuso fixo de -03:00 (somar e subtrair minutos, sem depender do fuso do navegador de quem olha).
 */
import { z } from 'zod';

// ---------- prioridade, gravidade e alcance ----------

export const PRIORIDADES = ['critica', 'alta', 'media', 'baixa'] as const;
export type Prioridade = (typeof PRIORIDADES)[number];
export const NOME_PRIORIDADE: Record<Prioridade, string> = { critica: 'Crítica', alta: 'Alta', media: 'Média', baixa: 'Baixa' };
/** "Quando usar", do documento: aparece ao lado da escolha. */
export const DICA_PRIORIDADE: Record<Prioridade, string> = {
  critica: 'Parou tudo, ou quase tudo, na empresa',
  alta: 'Parou um setor, ou piorou para todos',
  media: 'Afeta uma pessoa, ou incomoda sem parar o trabalho',
  baixa: 'Pedido ou ajuste sem urgência',
};
/** Para ordenar: a mais urgente primeiro. */
export const PESO_PRIORIDADE: Record<Prioridade, number> = { critica: 0, alta: 1, media: 2, baixa: 3 };

export const GRAVIDADES = ['inoperancia', 'intermitencia', 'performance', 'disfuncional', 'nao_se_aplica'] as const;
export type Gravidade = (typeof GRAVIDADES)[number];
export const NOME_GRAVIDADE: Record<Gravidade, string> = {
  inoperancia: 'Inoperância', intermitencia: 'Intermitência', performance: 'Performance', disfuncional: 'Disfuncional', nao_se_aplica: 'Não se aplica (pedido)',
};
export const DICA_GRAVIDADE: Record<Gravidade, string> = {
  inoperancia: 'Não funciona de jeito nenhum',
  intermitencia: 'Funciona e para, vai e volta',
  performance: 'Funciona, mas mal (lento, picotando, com eco)',
  disfuncional: 'Uma função não faz o que deveria',
  nao_se_aplica: 'Não é defeito: é um pedido ou uma dúvida',
};

export const ALCANCES = ['empresa', 'setor', 'pessoa'] as const;
export type Alcance = (typeof ALCANCES)[number];
export const NOME_ALCANCE: Record<Alcance, string> = { empresa: 'A empresa toda', setor: 'Um setor ou unidade', pessoa: 'Uma pessoa' };

export type Matriz = Record<Gravidade, Record<Alcance, Prioridade>>;

/** A sugestão do documento de prioridade (cada cruzamento é trocável nos Ajustes do módulo). */
export const MATRIZ_PADRAO: Matriz = {
  inoperancia: { empresa: 'critica', setor: 'alta', pessoa: 'media' },
  intermitencia: { empresa: 'alta', setor: 'media', pessoa: 'media' },
  performance: { empresa: 'alta', setor: 'media', pessoa: 'baixa' },
  disfuncional: { empresa: 'media', setor: 'media', pessoa: 'baixa' },
  nao_se_aplica: { empresa: 'baixa', setor: 'baixa', pessoa: 'baixa' },
};

/**
 * A prioridade que o Gestor sugere: a gravidade cruzada com o alcance. Sem os dois, não há sugestão
 * (a pessoa escolhe, e escolher não pede motivo — só trocar a sugestão pede).
 */
export function prioridadeSugerida(gravidade: Gravidade | null | undefined, alcance: Alcance | null | undefined, matriz: Matriz = MATRIZ_PADRAO): Prioridade | null {
  if (!gravidade || !alcance) return null;
  return matriz[gravidade]?.[alcance] ?? MATRIZ_PADRAO[gravidade][alcance];
}

/** A prioridade de cada gravidade quando o painel não usa o alcance. */
export type PrioridadePorGravidade = Record<Gravidade, Prioridade>;
/**
 * No painel sem o alcance (o pedido do Luan na prévia: "não precisa desse alcance por enquanto"), a
 * sugestão sai só da gravidade. Começa como a coluna "Um setor ou unidade" da matriz (o meio-termo).
 */
export const SEM_ALCANCE_PADRAO: PrioridadePorGravidade = Object.fromEntries(GRAVIDADES.map((g) => [g, MATRIZ_PADRAO[g].setor])) as PrioridadePorGravidade;

/**
 * A sugestão conforme os campos que o painel usa: sem a gravidade, nenhuma; com o alcance, a matriz
 * (precisa dos dois); sem o alcance, só a gravidade (a coluna "Só a gravidade" de Ajustes › Prazos).
 */
export function sugestaoPelosCampos(
  usa: { gravidade: boolean; alcance: boolean },
  gravidade: Gravidade | null | undefined, alcance: Alcance | null | undefined,
  prazos: { matriz: Matriz; semAlcance?: PrioridadePorGravidade },
): Prioridade | null {
  if (!usa.gravidade || !gravidade) return null;
  if (usa.alcance) return prioridadeSugerida(gravidade, alcance, prazos.matriz);
  return prazos.semAlcance?.[gravidade] ?? SEM_ALCANCE_PADRAO[gravidade];
}

// ---------- o calendário ----------

export const NOMES_DOS_DIAS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'] as const;

/** Um dia da semana: se atende e de que hora a que hora (HH:MM, de Brasília). */
export type HorarioDoDia = { abre: boolean; inicio: string; fim: string };
/** Um feriado: no dia marcado com `atende: false`, o prazo para como num domingo. */
export type Feriado = { data: string; nome: string; atende: boolean };
/** `horario` tem os 7 dias, do domingo (0) ao sábado (6). */
export type Calendario = { horario: HorarioDoDia[]; feriados: Feriado[] };

export type ContaPrazo = 'uteis' | 'corridas';
export const NOME_CONTA: Record<ContaPrazo, string> = { uteis: 'horas úteis', corridas: 'horas corridas' };

/** Os dois prazos de uma prioridade, em minutos. */
export type PrazoDaPrioridade = { resposta: number; solucao: number; conta: ContaPrazo };

export type AjustesPrazos = {
  calendario: Calendario;
  prazos: Record<Prioridade, PrazoDaPrioridade>;
  matriz: Matriz;
  /** A sugestão só pela gravidade, nos painéis que não usam o alcance (Ajustes › Campos). */
  semAlcance: PrioridadePorGravidade;
  /** Avisa "o prazo chegou a X%" (o documento sugere 80). */
  alertaPercentual: number;
  /** Avisa o supervisor do chamado que ficou sem responsável por X minutos (o documento sugere 15). */
  semDonoMinutos: number;
};

const dia = (abre: boolean, inicio = '08:00', fim = '18:00'): HorarioDoDia => ({ abre, inicio, fim });

/**
 * Os feriados que o documento listou (Salvador e Bahia conferidos na Portaria SJBA 21/2024; as datas
 * móveis de 2027 saem da Páscoa, em 28/03). A equipe decide em quais atende.
 */
export const FERIADOS_PADRAO: Feriado[] = [
  ['2026-10-12', 'Nossa Senhora Aparecida'], ['2026-11-02', 'Finados'], ['2026-11-15', 'Proclamação da República'],
  ['2026-11-20', 'Consciência Negra'], ['2026-12-08', 'Nossa Senhora da Conceição da Praia (Salvador)'], ['2026-12-25', 'Natal'],
  ['2027-01-01', 'Confraternização Universal'], ['2027-02-08', 'Carnaval'], ['2027-02-09', 'Carnaval'],
  ['2027-02-10', 'Quarta-feira de Cinzas'], ['2027-03-26', 'Sexta-feira Santa'], ['2027-04-21', 'Tiradentes'],
  ['2027-05-01', 'Dia do Trabalho'], ['2027-05-27', 'Corpus Christi (Salvador)'], ['2027-06-24', 'São João (Salvador)'],
  ['2027-07-02', 'Independência da Bahia'], ['2027-09-07', 'Independência do Brasil'], ['2027-10-12', 'Nossa Senhora Aparecida'],
  ['2027-11-02', 'Finados'], ['2027-11-15', 'Proclamação da República'], ['2027-11-20', 'Consciência Negra'],
  ['2027-12-08', 'Nossa Senhora da Conceição da Praia (Salvador)'], ['2027-12-25', 'Natal'],
].map(([data, nome]) => ({ data: data!, nome: nome!, atende: false }));

/**
 * O ponto de partida dos Ajustes: segunda a sexta, das 8h às 18h; os prazos do documento (exemplos
 * de mercado, para a equipe trocar). "2 dias úteis" com dias de 10 horas = 20 horas úteis.
 */
export const AJUSTES_PRAZOS_PADRAO: AjustesPrazos = {
  calendario: { horario: [dia(false), dia(true), dia(true), dia(true), dia(true), dia(true), dia(false, '08:00', '12:00')], feriados: FERIADOS_PADRAO },
  prazos: {
    critica: { resposta: 15, solucao: 4 * 60, conta: 'uteis' },
    alta: { resposta: 30, solucao: 8 * 60, conta: 'uteis' },
    media: { resposta: 2 * 60, solucao: 20 * 60, conta: 'uteis' },
    baixa: { resposta: 4 * 60, solucao: 50 * 60, conta: 'uteis' },
  },
  matriz: MATRIZ_PADRAO,
  semAlcance: SEM_ALCANCE_PADRAO,
  alertaPercentual: 80,
  semDonoMinutos: 15,
};

const HoraSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:MM, como 08:00');
const PrazoSchema = z.object({
  resposta: z.number().int().min(1).max(60 * 24 * 60),
  solucao: z.number().int().min(1).max(60 * 24 * 365),
  conta: z.enum(['uteis', 'corridas']),
});
const PrioridadeSchema = z.enum(PRIORIDADES);
export const AjustesPrazosSchema = z.object({
  calendario: z.object({
    horario: z.array(z.object({ abre: z.boolean(), inicio: HoraSchema, fim: HoraSchema })).length(7)
      .superRefine((dias, ctx) => {
        dias.forEach((d, i) => { if (d.abre && hhmm(d.inicio) >= hhmm(d.fim)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: [i, 'fim'], message: `${NOMES_DOS_DIAS[i]}: o fim precisa ser depois do começo` }); });
      }),
    feriados: z.array(z.object({ data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), nome: z.string().trim().min(1).max(80), atende: z.boolean() })).max(400),
  }),
  prazos: z.object({ critica: PrazoSchema, alta: PrazoSchema, media: PrazoSchema, baixa: PrazoSchema }),
  matriz: z.object(Object.fromEntries(GRAVIDADES.map((g) => [g, z.object({ empresa: PrioridadeSchema, setor: PrioridadeSchema, pessoa: PrioridadeSchema })])) as Record<Gravidade, z.ZodObject<{ empresa: typeof PrioridadeSchema; setor: typeof PrioridadeSchema; pessoa: typeof PrioridadeSchema }>>),
  semAlcance: z.object(Object.fromEntries(GRAVIDADES.map((g) => [g, PrioridadeSchema])) as Record<Gravidade, typeof PrioridadeSchema>),
  alertaPercentual: z.number().int().min(10).max(99),
  semDonoMinutos: z.number().int().min(1).max(24 * 60),
});

/** Os ajustes guardados podem ser de antes de um campo novo: completa com o padrão. */
export function ajustesPrazosCompletos(v: Partial<AjustesPrazos> | null | undefined): AjustesPrazos {
  const p = AJUSTES_PRAZOS_PADRAO;
  if (!v) return p;
  return {
    calendario: { horario: v.calendario?.horario?.length === 7 ? v.calendario.horario : p.calendario.horario, feriados: v.calendario?.feriados ?? p.calendario.feriados },
    prazos: { ...p.prazos, ...(v.prazos ?? {}) },
    matriz: Object.fromEntries(GRAVIDADES.map((g) => [g, { ...p.matriz[g], ...(v.matriz?.[g] ?? {}) }])) as Matriz,
    semAlcance: { ...p.semAlcance, ...(v.semAlcance ?? {}) },
    alertaPercentual: v.alertaPercentual ?? p.alertaPercentual,
    semDonoMinutos: v.semDonoMinutos ?? p.semDonoMinutos,
  };
}

// ---------- a conta das horas úteis ----------

const MIN = 60_000;
const DIA = 86_400_000;
/** Brasília, sem horário de verão: -03:00 o ano inteiro. */
const FUSO_MIN = -180;
const paraLocal = (ms: number) => ms + FUSO_MIN * MIN;
const deLocal = (ms: number) => ms - FUSO_MIN * MIN;

export function hhmm(t: string): number {
  const [h = '0', m = '0'] = t.split(':');
  return Number(h) * 60 + Number(m);
}
const ms = (d: Date | string | number) => (typeof d === 'number' ? d : new Date(d).getTime());

/** A meia-noite (de Brasília) do dia de `t`, em milissegundos do relógio do mundo. */
function meiaNoite(t: number): number { return deLocal(Math.floor(paraLocal(t) / DIA) * DIA); }
/** AAAA-MM-DD de Brasília. */
export function diaLocal(t: Date | string | number): string { return new Date(Math.floor(paraLocal(ms(t)) / DIA) * DIA).toISOString().slice(0, 10); }
/** 0 = domingo … 6 = sábado, em Brasília. */
export function diaDaSemanaLocal(t: Date | string | number): number { return new Date(Math.floor(paraLocal(ms(t)) / DIA) * DIA).getUTCDay(); }
/** "HH:MM" de Brasília. */
export function horaLocal(t: Date | string | number): string { return new Date(paraLocal(ms(t))).toISOString().slice(11, 16); }
/** Monta o instante de um dia (AAAA-MM-DD) e hora (HH:MM) de Brasília. */
export function instanteLocal(diaIso: string, hora: string): Date { return new Date(deLocal(Date.parse(`${diaIso}T00:00:00Z`)) + hhmm(hora) * MIN); }

/** A janela de atendimento de um dia (começo e fim), ou nada (fechado, ou feriado sem atendimento). */
function janela(meia: number, cal: Calendario, feriados: Map<string, boolean>): [number, number] | null {
  const dIso = diaLocal(meia);
  if (feriados.get(dIso) === false) return null;
  const h = cal.horario[diaDaSemanaLocal(meia)];
  if (!h?.abre) return null;
  const a = meia + hhmm(h.inicio) * MIN;
  const b = meia + hhmm(h.fim) * MIN;
  return b > a ? [a, b] : null;
}

const temAlgumDiaAberto = (cal: Calendario) => cal.horario.some((h) => h.abre && hhmm(h.fim) > hhmm(h.inicio));
const mapaFeriados = (cal: Calendario) => new Map(cal.feriados.map((f) => [f.data, f.atende]));
/** Um limite de segurança: nenhuma conta anda mais do que isso em dias (10 anos). */
const MAX_DIAS = 3700;

/** Quantos minutos de atendimento há entre `a` e `b` (0 se `b` vem antes). */
export function minutosUteisEntre(a: Date | string | number, b: Date | string | number, cal: Calendario): number {
  const ini = ms(a); const fim = ms(b);
  if (!(fim > ini)) return 0;
  // calendário sem nenhum dia aberto: conta corrido (senão nenhum prazo andaria)
  if (!temAlgumDiaAberto(cal)) return (fim - ini) / MIN;
  const feriados = mapaFeriados(cal);
  let total = 0;
  for (let meia = meiaNoite(ini), n = 0; meia < fim && n < MAX_DIAS; meia += DIA, n++) {
    const j = janela(meia, cal, feriados);
    if (!j) continue;
    const de = Math.max(j[0], ini); const ate = Math.min(j[1], fim);
    if (ate > de) total += (ate - de) / MIN;
  }
  return total;
}

/** O instante em que se completam `minutos` de atendimento a partir de `a`. */
export function somarMinutosUteis(a: Date | string | number, minutos: number, cal: Calendario): Date {
  const ini = ms(a);
  if (minutos <= 0) return new Date(ini);
  if (!temAlgumDiaAberto(cal)) return new Date(ini + minutos * MIN);
  const feriados = mapaFeriados(cal);
  let falta = minutos * MIN;
  for (let meia = meiaNoite(ini), n = 0; n < MAX_DIAS; meia += DIA, n++) {
    const j = janela(meia, cal, feriados);
    if (!j) continue;
    const de = Math.max(j[0], ini);
    if (de >= j[1]) continue;
    const cabe = j[1] - de;
    if (falta <= cabe) return new Date(de + falta);
    falta -= cabe;
  }
  return new Date(ini + minutos * MIN);
}

export function minutosEntre(a: Date | string | number, b: Date | string | number, conta: ContaPrazo, cal: Calendario): number {
  return conta === 'uteis' ? minutosUteisEntre(a, b, cal) : Math.max(0, (ms(b) - ms(a)) / MIN);
}
export function somarMinutos(a: Date | string | number, minutos: number, conta: ContaPrazo, cal: Calendario): Date {
  return conta === 'uteis' ? somarMinutosUteis(a, minutos, cal) : new Date(ms(a) + minutos * MIN);
}

/** Está dentro do horário de atendimento agora? (O quadro mostra "fora do horário: o prazo está parado".) */
export function dentroDoHorario(t: Date | string | number, cal: Calendario): boolean {
  const x = ms(t);
  const j = janela(meiaNoite(x), cal, mapaFeriados(cal));
  return !!j && x >= j[0] && x < j[1];
}

/** Soma dias úteis (para o "fecha sozinho em 3 dias úteis"): o mesmo horário, N dias de atendimento depois. */
export function somarDiasUteis(a: Date | string | number, dias: number, cal: Calendario): Date {
  const ini = ms(a);
  if (dias <= 0) return new Date(ini);
  if (!temAlgumDiaAberto(cal)) return new Date(ini + dias * DIA);
  const feriados = mapaFeriados(cal);
  let contados = 0;
  for (let meia = meiaNoite(ini) + DIA, n = 0; n < MAX_DIAS; meia += DIA, n++) {
    if (janela(meia, cal, feriados)) contados++;
    if (contados === dias) return new Date(meia + (ini - meiaNoite(ini)));
  }
  return new Date(ini + dias * DIA);
}

// ---------- os prazos de um chamado ----------

export const ESPERAS = ['cliente', 'operadora'] as const;
export type TipoEspera = (typeof ESPERAS)[number];
export const NOME_ESPERA: Record<TipoEspera, string> = { cliente: 'Esperando o cliente', operadora: 'Esperando a operadora' };
/**
 * Uma marca de espera, sem mudar de etapa. Esperando o cliente, o prazo para; esperando a operadora,
 * o prazo continua (a espera ganha relógio próprio) — a regra do documento de prioridade.
 */
export type Espera = { tipo: TipoEspera; motivo: string | null; inicio: string; fim: string | null; porId: string | null };
export const ESPERA_PARA_O_PRAZO: Record<TipoEspera, boolean> = { cliente: true, operadora: false };

/** Quantos minutos (úteis ou corridos) o chamado passou esperando o cliente, até `ate`. */
export function minutosParados(esperas: Espera[], ate: Date | string | number, conta: ContaPrazo, cal: Calendario): number {
  const limite = ms(ate);
  let total = 0;
  for (const e of esperas) {
    if (!ESPERA_PARA_O_PRAZO[e.tipo]) continue;
    const de = ms(e.inicio);
    const fim = Math.min(e.fim ? ms(e.fim) : limite, limite);
    if (fim > de) total += minutosEntre(de, fim, conta, cal);
  }
  return total;
}

export type SituacaoPrazo = 'sem' | 'no_prazo' | 'perto' | 'vencido' | 'pausado' | 'cumprido' | 'estourou';
export const NOME_SITUACAO_PRAZO: Record<SituacaoPrazo, string> = {
  sem: 'Sem prazo', no_prazo: 'No prazo', perto: 'Perto de vencer', vencido: 'Vencido', pausado: 'Parado (esperando o cliente)', cumprido: 'Cumprido', estourou: 'Cumprido depois do prazo',
};

export type EstadoPrazo = {
  situacao: SituacaoPrazo;
  /** o prazo, em minutos (úteis ou corridos) */
  limite: number;
  /** quanto já correu (sem o tempo esperando o cliente) */
  usado: number;
  /** de 0 a 100 (passa de 100 quando vence) */
  percentual: number;
  /** quando vence, se continuar correndo (nulo se parado ou já cumprido) */
  venceEm: string | null;
  /** quando foi cumprido (a resposta, a solução) */
  cumpridoEm: string | null;
  conta: ContaPrazo;
};

/** O que a conta precisa saber do chamado. */
export type BaseDoPrazo = {
  criadoEm: string;
  prioridade: Prioridade | null;
  respondidoEm: string | null;
  resolvidoEm: string | null;
  esperas: Espera[];
  /** o painel conta prazo? (o Desenvolvimento, por exemplo, pode não contar) */
  contaPrazo: boolean;
};

const SEM: Omit<EstadoPrazo, 'conta'> = { situacao: 'sem', limite: 0, usado: 0, percentual: 0, venceEm: null, cumpridoEm: null };

function umPrazo(c: BaseDoPrazo, limite: number, conta: ContaPrazo, alvo: string | null, a: AjustesPrazos, agora: Date): EstadoPrazo {
  const cal = a.calendario;
  if (alvo) {
    const usado = Math.max(0, minutosEntre(c.criadoEm, alvo, conta, cal) - minutosParados(c.esperas, alvo, conta, cal));
    return { situacao: usado <= limite ? 'cumprido' : 'estourou', limite, usado: Math.round(usado), percentual: Math.round((usado / limite) * 100), venceEm: null, cumpridoEm: alvo, conta };
  }
  const usado = Math.max(0, minutosEntre(c.criadoEm, agora, conta, cal) - minutosParados(c.esperas, agora, conta, cal));
  const percentual = Math.round((usado / limite) * 100);
  const parado = c.esperas.some((e) => !e.fim && ESPERA_PARA_O_PRAZO[e.tipo]);
  if (usado >= limite) return { situacao: 'vencido', limite, usado: Math.round(usado), percentual, venceEm: null, cumpridoEm: null, conta };
  if (parado) return { situacao: 'pausado', limite, usado: Math.round(usado), percentual, venceEm: null, cumpridoEm: null, conta };
  return {
    situacao: percentual >= a.alertaPercentual ? 'perto' : 'no_prazo',
    limite, usado: Math.round(usado), percentual,
    venceEm: somarMinutos(agora, limite - usado, conta, cal).toISOString(), cumpridoEm: null, conta,
  };
}

/**
 * Os dois prazos do chamado, agora. A prioridade de agora vale desde a abertura: trocar a prioridade
 * refaz a conta (é o que o documento combinou: o prazo é o da prioridade).
 */
export function estadoDosPrazos(c: BaseDoPrazo, a: AjustesPrazos, agora: Date = new Date()): { resposta: EstadoPrazo; solucao: EstadoPrazo } {
  if (!c.contaPrazo || !c.prioridade) return { resposta: { ...SEM, conta: 'uteis' }, solucao: { ...SEM, conta: 'uteis' } };
  const p = a.prazos[c.prioridade];
  return {
    resposta: umPrazo(c, p.resposta, p.conta, c.respondidoEm, a, agora),
    solucao: umPrazo(c, p.solucao, p.conta, c.resolvidoEm, a, agora),
  };
}

/** "15 min", "2 h", "3 h 20". */
export function duracaoDoPrazo(minutos: number): string {
  const m = Math.max(0, Math.round(minutos));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60); const r = m % 60;
  return r ? `${h} h ${String(r).padStart(2, '0')}` : `${h} h`;
}

/** O prazo em palavras, para o quadro e a ficha. */
export function textoDoPrazo(e: EstadoPrazo, agora: Date = new Date()): string {
  const falta = Math.max(0, e.limite - e.usado);
  const unidade = e.conta === 'uteis' ? ' úteis' : '';
  switch (e.situacao) {
    case 'sem': return 'Sem prazo';
    case 'cumprido': return 'Cumprido no prazo';
    case 'estourou': return `Cumprido ${duracaoDoPrazo(e.usado - e.limite)}${unidade} depois do prazo`;
    case 'pausado': return `Parado: faltam ${duracaoDoPrazo(falta)}${unidade}`;
    case 'vencido': return `Vencido há ${duracaoDoPrazo(e.usado - e.limite)}${unidade}`;
    default: {
      if (!e.venceEm) return `Faltam ${duracaoDoPrazo(falta)}${unidade}`;
      const quando = new Date(e.venceEm);
      const hoje = diaLocal(agora) === diaLocal(quando);
      const dataCurta = hoje ? `às ${horaLocal(quando)}` : `em ${diaLocal(quando).slice(8, 10)}/${diaLocal(quando).slice(5, 7)} às ${horaLocal(quando)}`;
      return `Faltam ${duracaoDoPrazo(falta)}${unidade} (vence ${dataCurta})`;
    }
  }
}

// ---------- os alertas de prazo ----------

export const ALERTAS_PRAZO = ['resposta_perto', 'resposta_vencida', 'solucao_perto', 'solucao_vencida'] as const;
export type AlertaPrazo = (typeof ALERTAS_PRAZO)[number];

/**
 * Os alertas que o relógio deve mandar agora (os que ainda não foram): o prazo chegou ao percentual
 * do aviso, ou venceu. `jaMandados` é o que o chamado guarda, para não avisar duas vezes.
 */
export function alertasDevidos(e: { resposta: EstadoPrazo; solucao: EstadoPrazo }, jaMandados: Partial<Record<string, string>>): AlertaPrazo[] {
  const devidos: AlertaPrazo[] = [];
  const ver = (qual: 'resposta' | 'solucao', s: EstadoPrazo) => {
    if (s.situacao === 'vencido' && !jaMandados[`${qual}_vencida`]) devidos.push(`${qual}_vencida`);
    // pulou direto para vencido: o "perto" já não ajuda ninguém
    else if (s.situacao === 'perto' && !jaMandados[`${qual}_perto`] && !jaMandados[`${qual}_vencida`]) devidos.push(`${qual}_perto`);
  };
  ver('resposta', e.resposta);
  ver('solucao', e.solucao);
  return devidos;
}

// ---------- o chamado agendado ----------

export const FREQUENCIAS = ['diaria', 'semanal', 'mensal', 'uma_vez'] as const;
export type Frequencia = (typeof FREQUENCIAS)[number];
export const NOME_FREQUENCIA: Record<Frequencia, string> = { diaria: 'Todo dia', semanal: 'Toda semana', mensal: 'Todo mês', uma_vez: 'Uma vez' };

/** Quando o chamado agendado nasce: a hora (de Brasília) e, conforme a frequência, os dias. */
export type RegraAgendado = {
  frequencia: Frequencia;
  hora: string;
  /** toda semana: os dias (0 = domingo) */
  dias: number[];
  /** todo mês: o dia (31 em mês de 30 dias = o último dia) */
  diaDoMes: number | null;
  /** uma vez: o dia (AAAA-MM-DD) */
  data: string | null;
  /** todo dia: só nos dias de atendimento (pula fim de semana e feriado sem atendimento) */
  soDiasDeAtendimento: boolean;
};

export const RegraAgendadoSchema = z.object({
  frequencia: z.enum(FREQUENCIAS),
  hora: HoraSchema,
  dias: z.array(z.number().int().min(0).max(6)).max(7).default([]),
  diaDoMes: z.number().int().min(1).max(31).nullable().default(null),
  data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().default(null),
  soDiasDeAtendimento: z.boolean().default(false),
}).superRefine((r, ctx) => {
  if (r.frequencia === 'semanal' && !r.dias.length) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['dias'], message: 'Escolha pelo menos um dia da semana' });
  if (r.frequencia === 'mensal' && !r.diaDoMes) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['diaDoMes'], message: 'Escolha o dia do mês' });
  if (r.frequencia === 'uma_vez' && !r.data) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['data'], message: 'Escolha a data' });
});

const ultimoDiaDoMes = (ano: number, mes0: number) => new Date(Date.UTC(ano, mes0 + 1, 0)).getUTCDate();

/** A próxima vez (depois de `depoisDe`) em que o agendado nasce, ou nulo (uma vez, que já passou). */
export function proximaExecucao(r: RegraAgendado, depoisDe: Date | string | number, cal?: Calendario): Date | null {
  const t = ms(depoisDe);
  if (r.frequencia === 'uma_vez') {
    if (!r.data) return null;
    const quando = instanteLocal(r.data, r.hora);
    return quando.getTime() > t ? quando : null;
  }
  const feriados = cal ? mapaFeriados(cal) : new Map<string, boolean>();
  for (let n = 0, meia = meiaNoite(t); n < 800; n++, meia += DIA) {
    const dIso = diaLocal(meia);
    const quando = instanteLocal(dIso, r.hora);
    if (quando.getTime() <= t) continue;
    const semana = diaDaSemanaLocal(meia);
    if (r.frequencia === 'diaria') {
      if (r.soDiasDeAtendimento && cal && !janela(meia, cal, feriados)) continue;
      return quando;
    }
    if (r.frequencia === 'semanal') { if (r.dias.includes(semana)) return quando; continue; }
    // mensal: o dia escolhido, ou o último dia do mês quando o mês é mais curto
    const [ano, mes] = dIso.split('-').map(Number) as [number, number];
    const alvo = Math.min(r.diaDoMes ?? 1, ultimoDiaDoMes(ano, mes - 1));
    if (Number(dIso.slice(8, 10)) === alvo) return quando;
  }
  return null;
}

/** A regra em palavras: "Toda segunda e quinta às 09:00", "Todo dia 15 às 08:00". */
export function textoDaRegra(r: RegraAgendado): string {
  const dias = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
  const lista = (xs: string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} e ${xs[xs.length - 1]}`);
  switch (r.frequencia) {
    case 'diaria': return `Todo dia${r.soDiasDeAtendimento ? ' de atendimento' : ''} às ${r.hora}`;
    case 'semanal': return `Toda ${lista([...r.dias].sort().map((d) => dias[d]!))} às ${r.hora}`;
    case 'mensal': return `Todo dia ${r.diaDoMes} às ${r.hora}`;
    default: return r.data ? `Em ${r.data.slice(8, 10)}/${r.data.slice(5, 7)}/${r.data.slice(0, 4)} às ${r.hora}` : 'Uma vez';
  }
}
