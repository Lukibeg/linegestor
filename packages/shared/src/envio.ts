/**
 * O envio automático (Patch 1.7): todo dia, no horário escolhido, um PDF com os gráficos e os
 * relatórios dos Chamados marcados pela administração vai pelo WhatsApp (API da FlwChat) para os
 * números da lista. Os números são **do dia atual** (pedido do Luan em 04/10: "só no dia atual").
 *
 * **Desde o 2.4.5 (decisão 0061), cada envio é de um painel.** O Luan, em 04/11: *"o envio automático
 * tá saindo do antigo… ele tem que ficar modular… para eu poder enviar de qualquer painel"*. A tela vira
 * uma lista de envios: cada um tem a sua origem (um painel de chamados do Gestor, ou o Legado do Helena),
 * o seu horário, os seus dias, os seus números e o que vai no PDF. A ligação com a FlwChat (o endereço, o
 * número que envia, o token e o "concluir a conversa") continua uma só, para todos.
 *
 * Aqui ficam as regras que o servidor e a prévia usam iguais: o que se guarda, como um número de
 * WhatsApp é escrito, o que pode ser marcado, **quando** o envio sai, como o guardado de antes vira a
 * lista e o que o PDF de um painel leva. O resto (gerar o PDF, chamar a API) é do servidor.
 */
import { z } from 'zod';
import { numeroWhatsApp, paraBusca } from './formatos.js';
import { CATALOGO_RELATORIOS } from './relatorios.js';
import { CATALOGO_DOS_RELATORIOS, ITEM_DO_CATALOGO, arrumacaoCompleta, type ArrumacaoDosRelatorios, type ItemDaVisao, type RelatoriosDoPainel } from './atendimento-relatorios.js';
import { montarVisao, type GraficoDaVisao, type KpiDaVisao, type VisaoDoPainel } from './atendimento-visao.js';

const FUSO = 'America/Sao_Paulo';

// ---------- números de WhatsApp ----------

/** "5571999990000" → "+55 (71) 99999-0000" (só para mostrar). */
export function numeroLegivel(n: string | null | undefined): string {
  const d = (n ?? '').replace(/\D/g, '');
  if (!d.startsWith('55') || (d.length !== 12 && d.length !== 13)) return n ?? '';
  const ddd = d.slice(2, 4); const resto = d.slice(4);
  return `+55 (${ddd}) ${resto.slice(0, resto.length - 4)}-${resto.slice(-4)}`;
}

const Numero = z.string().trim().max(30).transform((v, ctx) => {
  const n = numeroWhatsApp(v);
  if (!n) { ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Número de WhatsApp inválido: use DDD + número, como (71) 99999-0000.' }); return z.NEVER; }
  return n;
});

// ---------- o que se guarda ----------

/** Os dias da semana, de segunda (0) a domingo (6), como no resto dos Chamados. */
export const DIAS_ENVIO = [0, 1, 2, 3, 4, 5, 6] as const;
export const NOMES_DIAS_ENVIO = ['seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom'];

export const DestinatarioSchema = z.object({
  id: z.string().trim().min(1).max(40),
  nome: z.string().trim().min(1, 'Dê um nome ao destinatário.').max(80),
  numero: Numero,
  ativo: z.boolean().default(true),
});
export type Destinatario = z.infer<typeof DestinatarioSchema>;

// ---------- de onde sai (2.4.5) ----------

/**
 * A origem de um envio (2.4.5): o id de um painel de chamados do Gestor (o Suporte, o Desenvolvimento, o
 * Administrativo…) ou `legado`, os tickets do LineChat (o Legado do Helena, como do 1.7 ao 2.4.4). Os painéis
 * de Vendas não entram: eles têm o relatório deles.
 */
export const ORIGEM_LEGADO = 'legado';
export const NOME_DO_LEGADO = 'Legado do Helena';
/** O envio que existia até o 2.4.4 (um só) ganha este id ao virar a lista. */
export const ID_DO_ENVIO_DE_ANTES = 'principal';
/** Quantos envios a lista aceita (um por painel). */
export const ENVIOS_NO_MAXIMO = 20;

/** HH:MM, no horário de Brasília */
const Horario = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Horário inválido (use HH:MM).');
const Dias = z.array(z.number().int().min(0).max(6)).min(1, 'Escolha ao menos um dia.').max(7).transform((xs) => [...new Set(xs)].sort());
const Destinatarios = z.array(DestinatarioSchema).max(30, 'No máximo 30 números.')
  .refine((xs) => new Set(xs.map((x) => x.numero)).size === xs.length, 'Um número apareceu duas vezes na lista.');

/** Um envio da lista: de onde sai o PDF, quando e para quem. */
export const EnvioSchema = z.object({
  id: z.string().trim().min(1).max(40),
  origem: z.string().trim().min(1, 'Escolha o painel do envio.').max(100),
  ativo: z.boolean(),
  horario: Horario,
  dias: Dias,
  destinatarios: Destinatarios,
});
export type Envio = z.infer<typeof EnvioSchema>;
/** O que decide quando um envio sai. */
export type QuandoEnvia = Pick<Envio, 'ativo' | 'horario' | 'dias'>;

/**
 * A tela de Administração › Envio automático (o token vai à parte, para o cofre): a ligação com a FlwChat, a
 * mesma para todos, e a lista de envios (2.4.5).
 */
export const AjustesEnvioSchema = z.object({
  /** o endereço de envio de mensagem da API da FlwChat */
  url: z.string().trim().max(300).refine((v) => v === '' || /^https?:\/\/[^\s]+$/i.test(v), 'Endereço inválido: comece com https://'),
  /** o número que manda (o canal conectado na FlwChat) */
  remetente: z.string().trim().max(30).refine((v) => v === '' || !!numeroWhatsApp(v), 'Número que envia inválido: use DDD + número.').transform((v) => (v ? numeroWhatsApp(v)! : '')),
  /**
   * concluir a conversa logo depois de mandar (2.0.1, o pedido do Luan: "ele envia e conclui… ele é só um
   * aviso"): a mensagem não deixa a conversa pendente na FlwChat. Vem ligado; guardado antes, vale ligado.
   */
  concluirConversa: z.boolean().default(true),
  /** só quando a pessoa digita um token novo; em branco = manter o guardado */
  token: z.string().trim().max(500).optional(),
  envios: z.array(EnvioSchema).max(ENVIOS_NO_MAXIMO, `No máximo ${ENVIOS_NO_MAXIMO} envios.`)
    .refine((xs) => new Set(xs.map((x) => x.id)).size === xs.length, 'Um envio apareceu duas vezes na lista.')
    .refine((xs) => new Set(xs.map((x) => x.origem)).size === xs.length, 'Cada painel tem um envio só: junte os números no mesmo envio.'),
}).superRefine((a, ctx) => {
  a.envios.forEach((e, i) => {
    if (e.ativo && !e.destinatarios.some((d) => d.ativo)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['envios', i, 'destinatarios'], message: 'Para ligar um envio, deixe ao menos um número ativo na lista dele.' });
    }
  });
  if (!a.envios.some((e) => e.ativo)) return;
  if (!a.url) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['url'], message: 'Para ligar o envio, informe o endereço da API.' });
  if (!a.remetente) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['remetente'], message: 'Para ligar o envio, informe o número que envia.' });
});
export type AjustesEnvio = z.infer<typeof AjustesEnvioSchema>;

/**
 * Os envios guardados. Até o 2.4.2 havia um envio só, do Legado do Helena, com o horário, os dias e os números
 * no próprio guardado (sem a lista). Ele vira o primeiro envio da lista, **do painel que substituiu o Legado**
 * (`painelPadrao`, o Suporte) — o pedido do Luan: o envio saía do antigo —, com o mesmo horário, os mesmos dias,
 * os mesmos números e como foi o de hoje (para não sair duas vezes no dia da troca). Nada configurado: a lista
 * começa vazia.
 */
export function enviosDoGuardado(v: Record<string, unknown> | null | undefined, painelPadrao: string): Array<Envio & { ultimoAgendado: UltimoEnvioAgendado }> {
  if (!v) return [];
  if (Array.isArray(v.envios)) return v.envios as Array<Envio & { ultimoAgendado: UltimoEnvioAgendado }>;
  const destinatarios = Array.isArray(v.destinatarios) ? (v.destinatarios as Destinatario[]) : [];
  if (!v.ativo && !destinatarios.length) return [];
  return [{
    id: ID_DO_ENVIO_DE_ANTES, origem: painelPadrao, ativo: !!v.ativo,
    horario: typeof v.horario === 'string' ? v.horario : '18:00',
    dias: Array.isArray(v.dias) ? (v.dias as number[]) : [...DIAS_ENVIO],
    destinatarios, ultimoAgendado: (v.ultimoAgendado as UltimoEnvioAgendado | undefined) ?? null,
  }];
}

// ---------- o que vai no PDF ----------

/** Os relatórios do Legado que podem ir no envio: todos, menos o Raio-X (que precisa de um cliente escolhido). */
export const RELATORIOS_DO_ENVIO = CATALOGO_RELATORIOS.filter((r) => r.id !== 'raiox').map((r) => r.id);
const RELATORIOS_OK = new Set(RELATORIOS_DO_ENVIO);
/** Os gráficos da tela do Legado (os ids da arrumação: serie, etapa, responsavel, etiqueta, campo:<chave>). */
const GRAFICO_OK = /^(serie|etapa|responsavel|etiqueta|campo:[^\s]{1,120})$/;

const lista = (max: number, ok: (x: string) => boolean, erro: string) => z.array(z.string()).max(max).default([])
  .refine((xs) => xs.every(ok), erro)
  .transform((xs) => [...new Set(xs)]);

/** O que vai no PDF do Legado: marcado pela administração nos próprios gráficos e relatórios. */
export const MarcadosEnvioSchema = z.object({
  relatorios: lista(40, (x) => RELATORIOS_OK.has(x), 'Relatório que não pode ir no envio.'),
  graficos: lista(60, (x) => GRAFICO_OK.test(x), 'Gráfico desconhecido.'),
});
export type MarcadosEnvio = z.infer<typeof MarcadosEnvioSchema>;

/** Os relatórios de um painel que podem ir no envio (2.4.5): os 25, menos o Raio-X (precisa de um cliente escolhido). */
export const RELATORIOS_DO_ENVIO_DO_PAINEL = CATALOGO_DOS_RELATORIOS.filter((r) => r.id !== 'raiox').map((r) => r.id);
const RELATORIOS_DO_PAINEL_OK = new Set(RELATORIOS_DO_ENVIO_DO_PAINEL);
/** Os gráficos da Visão geral de um painel (2.2): o do tempo e os de cada campo. */
const GRAFICO_DA_VISAO_OK = /^(serie|etapa|responsavel|assunto|cliente|tipo|gravidade|prioridade|produto|operadora|etiqueta|origem|campo:[^\s]{1,120})$/;

/** O que vai no PDF de um painel (2.4.5): marcado com o aviãozinho na Visão geral e nos 25 relatórios dele. */
export const MarcadosDoPainelSchema = z.object({
  relatorios: lista(40, (x) => RELATORIOS_DO_PAINEL_OK.has(x), 'Relatório que não pode ir no envio.'),
  graficos: lista(60, (x) => GRAFICO_DA_VISAO_OK.test(x), 'Gráfico desconhecido.'),
});

/** O schema do que vai no PDF, pela origem (o Legado tem os ids dele). */
export const schemaDosMarcados = (origem: string) => (origem === ORIGEM_LEGADO ? MarcadosEnvioSchema : MarcadosDoPainelSchema);

/** Os relatórios do Legado e o relatório novo que fez o papel dele (2.1: "os do Helena viraram estes"). */
const RELATORIO_DO_LEGADO_NO_PAINEL: Record<string, string> = {
  relogio: 'relogio', escada: 'escada', gargalo: 'empaca', primeira: 'resposta', prioridade: 'prioridade', prazo: 'prazo',
  calor: 'calor', fila: 'fila', idade: 'idade', picos: 'curva', sobe: 'sobe', pareto: 'pareto', previsao: 'previsao',
  tamanho: 'tamanho', reincidencia: 'voltou', falha: 'falha', equipe: 'equipe', preenchimento: 'preenchido', mes: 'fechamento',
};
/** Os gráficos da Visão geral que um campo do Legado (pelo nome) faz as vezes. */
const CAMPO_DO_LEGADO_NA_VISAO = new Set(['assunto', 'cliente', 'tipo', 'produto', 'prioridade', 'gravidade', 'operadora']);

/**
 * O que estava marcado no Legado, no painel que recebeu o envio (2.4.5): cada relatório vira o novo que faz o
 * papel dele; os gráficos do tempo, da etapa, do responsável e da etiqueta são os mesmos; o gráfico de um campo do
 * LineChat vira o da Visão com o mesmo nome (o Assunto, o Cliente…). O que não tem par fica de fora.
 */
export function marcadosDoLegadoNoPainel(m: MarcadosEnvio): MarcadosEnvio {
  const relatorios = m.relatorios.map((id) => RELATORIO_DO_LEGADO_NO_PAINEL[id]).filter((x): x is string => !!x);
  const graficos = m.graficos.map((id) => {
    if (!id.startsWith('campo:')) return id;
    const nome = paraBusca(id.slice('campo:'.length)).trim();
    return CAMPO_DO_LEGADO_NA_VISAO.has(nome) ? nome : null;
  }).filter((x): x is string => !!x);
  return { relatorios: [...new Set(relatorios)], graficos: [...new Set(graficos)] };
}

/**
 * O que está marcado num painel, com o nome de cada um e na ordem das telas: os gráficos na arrumação da Visão
 * geral (a que a equipe vê) e os relatórios na ordem do Organizar. `aplicaveis`: os relatórios que valem para o
 * painel (sem a lista, todos).
 */
export function marcadosDoPainelComTitulo(
  visao: Pick<VisaoDoPainel, 'serie' | 'graficos'>, arrumacao: Partial<ArrumacaoDosRelatorios> | null, m: MarcadosEnvio, aplicaveis?: readonly string[],
): { graficos: Array<{ id: string; titulo: string; item: ItemDaVisao; grafico: GraficoDaVisao | null }>; relatorios: Array<{ id: string; titulo: string }> } {
  const a = arrumacaoCompleta(arrumacao);
  const porId = new Map(visao.graficos.map((g) => [g.id, g]));
  const ids = ['serie', ...visao.graficos.map((g) => g.id)];
  const graficos = montarVisao(a.visao, ids).filter((x) => m.graficos.includes(x.id)).map((item) => ({
    id: item.id, item, grafico: porId.get(item.id) ?? null,
    titulo: item.id === 'serie' ? visao.serie.titulo : porId.get(item.id)?.titulo ?? item.id,
  }));
  const relatorios = a.ordem.filter((id) => m.relatorios.includes(id) && (!aplicaveis || aplicaveis.includes(id)))
    .map((id) => ({ id, titulo: ITEM_DO_CATALOGO.get(id)?.titulo ?? id }));
  return { graficos, relatorios };
}

/**
 * O que a página do PDF de um painel desenha (2.4.5): os números de cima e o gráfico do tempo da Visão geral de
 * **hoje**, os gráficos marcados (como a equipe arrumou: a largura, pizza ou barras) e os relatórios marcados, com o
 * período = hoje (o Fechamento do mês, com o mês até hoje).
 */
export type PacoteDoPainel = {
  tipo: 'painel';
  geradoEm: string; dia: string; hhmm: string;
  painel: { id: string; nome: string; sigla: string };
  kpis: KpiDaVisao[];
  serie: VisaoDoPainel['serie'];
  graficos: Array<{ id: string; titulo: string; item: ItemDaVisao; grafico: GraficoDaVisao | null }>;
  relatorioIds: string[];
  relatorios: RelatoriosDoPainel | null;
  titulos: string[];
};

export function pacoteDoPainel(o: {
  agora: Date; visao: VisaoDoPainel; relatorios: RelatoriosDoPainel | null; arrumacao: Partial<ArrumacaoDosRelatorios> | null; marcados: MarcadosEnvio;
}): PacoteDoPainel {
  const momento = momentoEmBrasilia(o.agora);
  const t = marcadosDoPainelComTitulo(o.visao, o.arrumacao, o.marcados, o.relatorios?.aplicaveis);
  return {
    tipo: 'painel', geradoEm: o.agora.toISOString(), dia: momento.dia, hhmm: momento.hhmm,
    painel: o.visao.painel, kpis: o.visao.kpis, serie: o.visao.serie,
    graficos: t.graficos,
    relatorioIds: o.relatorios ? t.relatorios.map((r) => r.id) : [],
    relatorios: o.relatorios,
    titulos: [...t.graficos.map((g) => g.titulo), ...(o.relatorios ? t.relatorios.map((r) => r.titulo) : [])],
  };
}

/** O filtro dos 25 relatórios no PDF: o dia de hoje (o Fechamento, com o mês até hoje). */
export const filtroDosRelatoriosDoEnvio = (painel: string, dia: string) => ({ painel, de: dia, ate: dia, mes: dia.slice(0, 7) });

// ---------- quando sai ----------

const fmtMomento = new Intl.DateTimeFormat('en-GB', {
  timeZone: FUSO, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'short', hourCycle: 'h23',
});
const DIAS_EN = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** O dia (AAAA-MM-DD), a hora (HH:MM) e o dia da semana (0 = segunda) em Brasília. */
export function momentoEmBrasilia(d: Date): { dia: string; hhmm: string; dow: number } {
  const p = Object.fromEntries(fmtMomento.formatToParts(d).map((x) => [x.type, x.value]));
  return { dia: `${p.year}-${p.month}-${p.day}`, hhmm: `${p.hour}:${p.minute}`, dow: DIAS_EN.indexOf(p.weekday!) };
}

/** Quanto tempo depois do horário ainda vale mandar (o servidor estava fora do ar na hora, por exemplo). */
export const JANELA_ENVIO_MIN = 180;
/** Falhou? Tenta de novo depois disso, até `TENTATIVAS_ENVIO` vezes no dia. */
export const ESPERA_NOVA_TENTATIVA_MIN = 15;
export const TENTATIVAS_ENVIO = 3;

/**
 * Como foi o envio agendado do dia (para não mandar duas vezes nem insistir sem fim).
 * `horario`: o horário para o qual ele foi (1.7.1). Guardado antes do 1.7.1, não tem: vale o de agora.
 */
export type UltimoEnvioAgendado = { dia: string; ok: boolean; tentativas: number; em: string; horario?: string } | null;

const emMinutos = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

/**
 * O envio agendado de hoje, se já houve um **para o horário de agora**. Trocou o horário? O dia
 * conta de novo: o envio sai no horário novo, mesmo que já tenha saído (ou falhado) no antigo
 * (1.7.1 — no 1.7, trocar o horário depois de 3 falhas deixava o dia sem envio).
 */
export function agendadoDeHoje(a: Pick<Envio, 'horario'>, agora: Date, ultimo: UltimoEnvioAgendado): Exclude<UltimoEnvioAgendado, null> | null {
  if (!ultimo || ultimo.dia !== momentoEmBrasilia(agora).dia) return null;
  if (ultimo.horario && ultimo.horario !== a.horario) return null;
  return ultimo;
}

/**
 * Está na hora do envio agendado? Sim quando: está ligado; hoje é um dos dias; já passou do
 * horário (até 3 horas depois); e hoje ainda não saiu nesse horário — ou falhou, já esperou 15
 * minutos e não gastou as 3 tentativas.
 */
export function horaDeEnviar(
  a: QuandoEnvia, agora: Date, ultimo: UltimoEnvioAgendado,
): boolean {
  if (!a.ativo) return false;
  const m = momentoEmBrasilia(agora);
  if (!a.dias.includes(m.dow)) return false;
  const passou = emMinutos(m.hhmm) - emMinutos(a.horario);
  if (passou < 0 || passou > JANELA_ENVIO_MIN) return false;
  const u = agendadoDeHoje(a, agora, ultimo);
  if (!u) return true;
  if (u.ok || u.tentativas >= TENTATIVAS_ENVIO) return false;
  return agora.getTime() - Date.parse(u.em) >= ESPERA_NOVA_TENTATIVA_MIN * 60_000;
}

/** Quando sai a próxima tentativa de hoje, depois de uma falha (null = não tem mais hoje). */
function novaTentativa(a: Pick<Envio, 'horario'>, agora: Date, u: Exclude<UltimoEnvioAgendado, null>): string | null {
  if (u.ok || u.tentativas >= TENTATIVAS_ENVIO) return null;
  const quando = new Date(Math.max(agora.getTime(), Date.parse(u.em) + ESPERA_NOVA_TENTATIVA_MIN * 60_000));
  const q = momentoEmBrasilia(quando);
  if (q.dia !== u.dia || emMinutos(q.hhmm) - emMinutos(a.horario) > JANELA_ENVIO_MIN) return null;
  return q.hhmm;
}

/** O próximo envio agendado, escrito ("hoje às 18:00", "seg, 06/10 às 18:00"), para a tela. */
export function proximoEnvio(a: QuandoEnvia, agora: Date, ultimo: UltimoEnvioAgendado): string | null {
  if (!a.ativo || !a.dias.length) return null;
  const m = momentoEmBrasilia(agora);
  for (let k = 0; k < 8; k++) {
    const dow = (m.dow + k) % 7;
    if (!a.dias.includes(dow)) continue;
    if (k === 0) {
      const passou = emMinutos(m.hhmm) - emMinutos(a.horario);
      if (passou > JANELA_ENVIO_MIN) continue;
      if (passou < 0) return `hoje às ${a.horario}`;
      const u = agendadoDeHoje(a, agora, ultimo);
      if (!u) return 'agora (na próxima volta do relógio)';
      const nova = novaTentativa(a, agora, u);
      if (!nova) continue; // já saiu hoje, ou gastou as tentativas
      return nova > m.hhmm ? `hoje às ${nova} (nova tentativa)` : 'agora (nova tentativa, na próxima volta do relógio)';
    }
    const d = new Date(`${m.dia}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + k);
    const dia = d.toISOString().slice(0, 10);
    return k === 1 ? `amanhã às ${a.horario}` : `${NOMES_DIAS_ENVIO[dow]}, ${dia.slice(8, 10)}/${dia.slice(5, 7)} às ${a.horario}`;
  }
  return null;
}

/** Como está o envio agendado de hoje, para a tela (1.7.1). */
export type EnvioDeHoje = {
  horario: string;
  /** saiu (todos os números receberam) */
  ok: boolean;
  tentativas: number;
  /** a última tentativa */
  em: string;
  /** o que aconteceu na última tentativa (o motivo, quando falhou) */
  mensagem: string | null;
  /** HH:MM da próxima tentativa de hoje; null = não tenta mais hoje */
  novaTentativa: string | null;
};

/** O envio agendado de hoje (no horário de agora), com o motivo da última tentativa; null = ainda não houve. */
export function envioDeHoje(
  a: Pick<Envio, 'horario'>, agora: Date, ultimo: UltimoEnvioAgendado,
  historico: ReadonlyArray<{ gatilho: string; dia: string; em: string; mensagem: string }>,
): EnvioDeHoje | null {
  const u = agendadoDeHoje(a, agora, ultimo);
  if (!u) return null;
  const r = historico.find((h) => h.gatilho === 'agendado' && h.dia === u.dia);
  return {
    horario: u.horario ?? a.horario, ok: u.ok, tentativas: u.tentativas, em: u.em,
    mensagem: r?.mensagem ?? null, novaTentativa: novaTentativa(a, agora, u),
  };
}

/**
 * O nome do arquivo que chega no WhatsApp: "chamados-04-10-2026.pdf" (o Legado) ou, de um painel (2.4.5), com a
 * sigla dele — "chamados-sup-04-11-2026.pdf" —, para não confundir quando chegam dois no mesmo dia.
 */
export const nomeDoPdf = (dia: string, sigla?: string | null) => {
  const s = paraBusca(sigla ?? '').replace(/[^a-z0-9]+/g, '');
  return `chamados-${s ? `${s}-` : ''}${dia.slice(8, 10)}-${dia.slice(5, 7)}-${dia.slice(0, 4)}.pdf`;
};

/** A mensagem que vai junto com o PDF: o dia e os números de cima da tela de Chamados. */
export function textoDoEnvio(o: {
  dia: string; hhmm: string; painel: string;
  numeros: Array<{ label: string; valor: string | number }>;
  titulos: string[];
}): string {
  const d = new Date(`${o.dia}T12:00:00Z`);
  const semana = d.toLocaleDateString('pt-BR', { weekday: 'long', timeZone: 'UTC' });
  const linhas = [
    `*Chamados de hoje* — ${semana}, ${o.dia.slice(8, 10)}/${o.dia.slice(5, 7)} (até ${o.hhmm})`,
    o.painel ? `Painel ${o.painel}` : '',
    '',
    ...o.numeros.map((n) => `• ${n.label}: ${typeof n.valor === 'number' ? n.valor.toLocaleString('pt-BR') : n.valor}`),
    '',
    o.titulos.length ? `No PDF: ${o.titulos.join(', ')}.` : 'No PDF: os números do dia.',
    '_Enviado pelo Ingline Gestão._',
  ];
  return linhas.filter((l, i) => l !== '' || (i > 0 && linhas[i - 1] !== '')).join('\n').trim();
}
