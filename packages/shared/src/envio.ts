/**
 * O envio automático (Patch 1.7): todo dia, no horário escolhido, um PDF com os gráficos e os
 * relatórios dos Chamados marcados pela administração vai pelo WhatsApp (API da FlwChat) para os
 * números da lista. Os números são **do dia atual** (pedido do Luan em 04/10: "só no dia atual").
 *
 * Aqui ficam as regras que o servidor e a prévia usam iguais: o que se guarda, como um número de
 * WhatsApp é escrito, o que pode ser marcado e **quando** o envio sai. O resto (gerar o PDF, chamar
 * a API) é do servidor.
 */
import { z } from 'zod';
import { CATALOGO_RELATORIOS } from './relatorios.js';

const FUSO = 'America/Sao_Paulo';

// ---------- números de WhatsApp ----------

/**
 * Um número de WhatsApp como a API quer: só dígitos, com o 55 do Brasil. Aceita como a pessoa
 * digitar — "(71) 3512-4840", "+55 71 3512-4840", "7135124840". Devolve null se não der um número.
 */
export function numeroWhatsApp(texto: string | null | undefined): string | null {
  let d = (texto ?? '').replace(/\D/g, '');
  if (d.startsWith('00')) d = d.slice(2);
  // DDD + número (fixo com 8 dígitos ou celular com 9): falta o país
  if (d.length === 10 || d.length === 11) d = `55${d}`;
  if (d.length < 12 || d.length > 13) return null;
  return d;
}

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

/** A tela de Administração › Envio automático (o token vai à parte, para o cofre). */
export const AjustesEnvioSchema = z.object({
  ativo: z.boolean(),
  /** o endereço de envio de mensagem da API da FlwChat */
  url: z.string().trim().max(300).refine((v) => v === '' || /^https?:\/\/[^\s]+$/i.test(v), 'Endereço inválido: comece com https://'),
  /** o número que manda (o canal conectado na FlwChat) */
  remetente: z.string().trim().max(30).refine((v) => v === '' || !!numeroWhatsApp(v), 'Número que envia inválido: use DDD + número.').transform((v) => (v ? numeroWhatsApp(v)! : '')),
  /** HH:MM, no horário de Brasília */
  horario: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Horário inválido (use HH:MM).'),
  dias: z.array(z.number().int().min(0).max(6)).min(1, 'Escolha ao menos um dia.').max(7).transform((xs) => [...new Set(xs)].sort()),
  destinatarios: z.array(DestinatarioSchema).max(30, 'No máximo 30 números.')
    .refine((xs) => new Set(xs.map((x) => x.numero)).size === xs.length, 'Um número apareceu duas vezes na lista.'),
  /** só quando a pessoa digita um token novo; em branco = manter o guardado */
  token: z.string().trim().max(500).optional(),
}).superRefine((a, ctx) => {
  if (!a.ativo) return;
  if (!a.url) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['url'], message: 'Para ligar o envio, informe o endereço da API.' });
  if (!a.remetente) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['remetente'], message: 'Para ligar o envio, informe o número que envia.' });
  if (!a.destinatarios.some((d) => d.ativo)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['destinatarios'], message: 'Para ligar o envio, deixe ao menos um número ativo na lista.' });
});
export type AjustesEnvio = z.infer<typeof AjustesEnvioSchema>;

/** Os relatórios que podem ir no envio: todos, menos o Raio-X (que precisa de um cliente escolhido). */
export const RELATORIOS_DO_ENVIO = CATALOGO_RELATORIOS.filter((r) => r.id !== 'raiox').map((r) => r.id);
const RELATORIOS_OK = new Set(RELATORIOS_DO_ENVIO);
/** Os gráficos da tela de Chamados (os ids da arrumação: serie, etapa, responsavel, etiqueta, campo:<chave>). */
const GRAFICO_OK = /^(serie|etapa|responsavel|etiqueta|campo:[^\s]{1,120})$/;

/** O que vai no PDF: marcado pela administração nos próprios gráficos e relatórios. */
export const MarcadosEnvioSchema = z.object({
  relatorios: z.array(z.string()).max(40).default([])
    .refine((xs) => xs.every((x) => RELATORIOS_OK.has(x)), 'Relatório que não pode ir no envio.')
    .transform((xs) => [...new Set(xs)]),
  graficos: z.array(z.string()).max(60).default([])
    .refine((xs) => xs.every((x) => GRAFICO_OK.test(x)), 'Gráfico desconhecido.')
    .transform((xs) => [...new Set(xs)]),
});
export type MarcadosEnvio = z.infer<typeof MarcadosEnvioSchema>;

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

/** Como foi o envio agendado do dia (para não mandar duas vezes nem insistir sem fim). */
export type UltimoEnvioAgendado = { dia: string; ok: boolean; tentativas: number; em: string } | null;

const emMinutos = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

/**
 * Está na hora do envio agendado? Sim quando: está ligado; hoje é um dos dias; já passou do
 * horário (até 3 horas depois); e hoje ainda não saiu — ou falhou, já esperou 15 minutos e não
 * gastou as 3 tentativas.
 */
export function horaDeEnviar(
  a: Pick<AjustesEnvio, 'ativo' | 'horario' | 'dias'>, agora: Date, ultimo: UltimoEnvioAgendado,
): boolean {
  if (!a.ativo) return false;
  const m = momentoEmBrasilia(agora);
  if (!a.dias.includes(m.dow)) return false;
  const passou = emMinutos(m.hhmm) - emMinutos(a.horario);
  if (passou < 0 || passou > JANELA_ENVIO_MIN) return false;
  if (!ultimo || ultimo.dia !== m.dia) return true;
  if (ultimo.ok || ultimo.tentativas >= TENTATIVAS_ENVIO) return false;
  return agora.getTime() - Date.parse(ultimo.em) >= ESPERA_NOVA_TENTATIVA_MIN * 60_000;
}

/** O próximo envio agendado, escrito ("hoje às 18:00", "seg, 06/10 às 18:00"), para a tela. */
export function proximoEnvio(a: Pick<AjustesEnvio, 'ativo' | 'horario' | 'dias'>, agora: Date, ultimo: UltimoEnvioAgendado): string | null {
  if (!a.ativo || !a.dias.length) return null;
  const m = momentoEmBrasilia(agora);
  for (let k = 0; k < 8; k++) {
    const dow = (m.dow + k) % 7;
    if (!a.dias.includes(dow)) continue;
    if (k === 0) {
      const jaSaiu = ultimo?.dia === m.dia && (ultimo.ok || ultimo.tentativas >= TENTATIVAS_ENVIO);
      if (jaSaiu || emMinutos(m.hhmm) - emMinutos(a.horario) > JANELA_ENVIO_MIN) continue;
      return emMinutos(m.hhmm) >= emMinutos(a.horario) ? 'agora (na próxima volta do relógio)' : `hoje às ${a.horario}`;
    }
    const d = new Date(`${m.dia}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + k);
    const dia = d.toISOString().slice(0, 10);
    return k === 1 ? `amanhã às ${a.horario}` : `${NOMES_DIAS_ENVIO[dow]}, ${dia.slice(8, 10)}/${dia.slice(5, 7)} às ${a.horario}`;
  }
  return null;
}

/** O nome do arquivo que chega no WhatsApp: "chamados-04-10-2026.pdf". */
export const nomeDoPdf = (dia: string) => `chamados-${dia.slice(8, 10)}-${dia.slice(5, 7)}-${dia.slice(0, 4)}.pdf`;

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
