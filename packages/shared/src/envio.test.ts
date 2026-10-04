import { describe, expect, it } from 'vitest';
import {
  AjustesEnvioSchema, horaDeEnviar, MarcadosEnvioSchema, momentoEmBrasilia, nomeDoPdf, numeroLegivel, numeroWhatsApp, proximoEnvio,
  RELATORIOS_DO_ENVIO, textoDoEnvio,
} from './envio.js';

// 04/10/2026 é um domingo; 05/10, segunda. Brasília = UTC−3.
const em = (iso: string) => new Date(iso);

describe('Números de WhatsApp', () => {
  it('aceita como a pessoa digitar e põe o 55', () => {
    expect(numeroWhatsApp('(71) 3512-0000')).toBe('557135120000');
    expect(numeroWhatsApp('+55 71 99999-0000')).toBe('5571999990000');
    expect(numeroWhatsApp('71999990000')).toBe('5571999990000');
    expect(numeroWhatsApp('0055 71 99999 0000')).toBe('5571999990000');
    expect(numeroWhatsApp('9999-0000')).toBeNull();
    expect(numeroWhatsApp('')).toBeNull();
  });
  it('mostra legível', () => {
    expect(numeroLegivel('5571999990000')).toBe('+55 (71) 99999-0000');
    expect(numeroLegivel('557135120000')).toBe('+55 (71) 3512-0000');
  });
});

describe('Os ajustes do envio', () => {
  const base = { ativo: true, url: 'https://api.exemplo.com/chat/v1/message/send', remetente: '(71) 3512-0000', horario: '18:00', dias: [4, 0, 0], destinatarios: [{ id: 'a', nome: 'Luan', numero: '71 99999-0000', ativo: true }] };
  it('normaliza números e dias', () => {
    const a = AjustesEnvioSchema.parse(base);
    expect(a.remetente).toBe('557135120000');
    expect(a.destinatarios[0]!.numero).toBe('5571999990000');
    expect(a.dias).toEqual([0, 4]);
  });
  it('recusa o que não fecha', () => {
    expect(AjustesEnvioSchema.safeParse({ ...base, horario: '25:00' }).success).toBe(false);
    expect(AjustesEnvioSchema.safeParse({ ...base, destinatarios: [...base.destinatarios, { id: 'b', nome: 'Outro', numero: '5571999990000', ativo: true }] }).success).toBe(false);
    expect(AjustesEnvioSchema.safeParse({ ...base, destinatarios: [{ id: 'a', nome: 'Luan', numero: '123', ativo: true }] }).success).toBe(false);
    // ligado sem ninguém ativo, ou sem o número que envia: não liga
    expect(AjustesEnvioSchema.safeParse({ ...base, destinatarios: [{ ...base.destinatarios[0]!, ativo: false }] }).success).toBe(false);
    expect(AjustesEnvioSchema.safeParse({ ...base, remetente: '' }).success).toBe(false);
    // desligado, pode ficar pela metade
    expect(AjustesEnvioSchema.safeParse({ ...base, ativo: false, remetente: '', destinatarios: [] }).success).toBe(true);
  });
  it('o que pode ser marcado: relatórios do catálogo (menos o Raio-X) e gráficos da tela', () => {
    expect(RELATORIOS_DO_ENVIO).toHaveLength(19);
    expect(RELATORIOS_DO_ENVIO).not.toContain('raiox');
    expect(MarcadosEnvioSchema.parse({ relatorios: ['relogio', 'relogio', 'mes'], graficos: ['serie', 'campo:assunto'] })).toEqual({ relatorios: ['relogio', 'mes'], graficos: ['serie', 'campo:assunto'] });
    expect(MarcadosEnvioSchema.safeParse({ relatorios: ['raiox'] }).success).toBe(false);
    expect(MarcadosEnvioSchema.safeParse({ graficos: ['pizza'] }).success).toBe(false);
  });
});

describe('Quando o envio sai', () => {
  const a = { ativo: true, horario: '18:00', dias: [0, 1, 2, 3, 4, 5, 6] };
  it('o momento em Brasília', () => {
    expect(momentoEmBrasilia(em('2026-10-04T21:05:00Z'))).toEqual({ dia: '2026-10-04', hhmm: '18:05', dow: 6 });
    expect(momentoEmBrasilia(em('2026-10-05T02:30:00Z'))).toEqual({ dia: '2026-10-04', hhmm: '23:30', dow: 6 });
  });
  it('depois do horário, uma vez por dia', () => {
    expect(horaDeEnviar(a, em('2026-10-04T20:59:00Z'), null)).toBe(false); // 17:59
    expect(horaDeEnviar(a, em('2026-10-04T21:00:00Z'), null)).toBe(true); // 18:00
    expect(horaDeEnviar(a, em('2026-10-04T21:01:00Z'), { dia: '2026-10-04', ok: true, tentativas: 1, em: '2026-10-04T21:00:30Z' })).toBe(false);
    // o de ontem não conta
    expect(horaDeEnviar(a, em('2026-10-04T21:01:00Z'), { dia: '2026-10-03', ok: true, tentativas: 1, em: '2026-10-03T21:00:30Z' })).toBe(true);
    // mais de 3 horas depois: perdeu (o servidor estava fora do ar)
    expect(horaDeEnviar(a, em('2026-10-05T00:01:00Z'), null)).toBe(false); // 21:01
    expect(horaDeEnviar({ ...a, ativo: false }, em('2026-10-04T21:00:00Z'), null)).toBe(false);
  });
  it('só nos dias escolhidos', () => {
    expect(horaDeEnviar({ ...a, dias: [0, 1, 2, 3, 4] }, em('2026-10-04T21:00:00Z'), null)).toBe(false); // domingo
    expect(horaDeEnviar({ ...a, dias: [0, 1, 2, 3, 4] }, em('2026-10-05T21:00:00Z'), null)).toBe(true); // segunda
  });
  it('falhou: tenta de novo depois de 15 minutos, até 3 vezes', () => {
    const falhou = (tentativas: number, emIso: string) => ({ dia: '2026-10-04', ok: false, tentativas, em: emIso });
    expect(horaDeEnviar(a, em('2026-10-04T21:10:00Z'), falhou(1, '2026-10-04T21:00:00Z'))).toBe(false);
    expect(horaDeEnviar(a, em('2026-10-04T21:15:00Z'), falhou(1, '2026-10-04T21:00:00Z'))).toBe(true);
    expect(horaDeEnviar(a, em('2026-10-04T22:00:00Z'), falhou(3, '2026-10-04T21:30:00Z'))).toBe(false);
  });
  it('o próximo, escrito', () => {
    expect(proximoEnvio(a, em('2026-10-04T15:00:00Z'), null)).toBe('hoje às 18:00');
    expect(proximoEnvio(a, em('2026-10-04T21:30:00Z'), { dia: '2026-10-04', ok: true, tentativas: 1, em: '2026-10-04T21:00:00Z' })).toBe('amanhã às 18:00');
    expect(proximoEnvio({ ...a, dias: [2] }, em('2026-10-04T15:00:00Z'), null)).toBe('qua, 07/10 às 18:00');
    expect(proximoEnvio({ ...a, ativo: false }, em('2026-10-04T15:00:00Z'), null)).toBeNull();
  });
});

describe('O que chega no WhatsApp', () => {
  it('o nome do arquivo e o texto', () => {
    expect(nomeDoPdf('2026-10-04')).toBe('chamados-04-10-2026.pdf');
    const t = textoDoEnvio({ dia: '2026-10-04', hhmm: '18:00', painel: 'Suporte', numeros: [{ label: 'Abertos hoje', valor: '16' }, { label: 'Vencidos', valor: 2 }], titulos: ['Relógio do chamado'] });
    expect(t).toContain('*Chamados de hoje* — domingo, 04/10 (até 18:00)');
    expect(t).toContain('• Abertos hoje: 16');
    expect(t).toContain('• Vencidos: 2');
    expect(t).toContain('No PDF: Relógio do chamado.');
    expect(t).not.toMatch(/\n\n\n/);
  });
});
