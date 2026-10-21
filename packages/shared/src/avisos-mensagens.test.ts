/**
 * Patch 2.0.2 — A MENSAGEM DE CADA AVISO NO WHATSAPP. O pedido do Luan (20/10): "a notificação dos
 * observadores tbm n ficou legal, veja como tínhamos antes, era bem melhor, faça algo que dê para nós
 * personalizarmos inclusive as variáveis".
 *
 *  - cada aviso tem a sua mensagem, com as variáveis entre chaves; a padrão segue a do fluxo antigo do n8n
 *  - a linha em que todas as variáveis vêm vazias não vai (sem cliente, nada de "Cliente:" em branco)
 *  - a variável que o aviso não tem é recusada ao salvar (o erro de digitação sairia no WhatsApp)
 */
import { describe, expect, it } from 'vitest';
import {
  AvisosChamadosSchema, EVENTOS_AVISO, EVENTOS_AVISO_PADRAO, EXEMPLOS_DOS_AVISOS, MODELOS_DOS_AVISOS_PADRAO, ModelosDosAvisosSchema, modeloDoAviso,
  modelosParaGuardar, preencherAviso, variaveisDesconhecidas, variaveisDoAviso,
} from './atendimento.js';
import { quandoDoLembrete, textoDoLembrete, valoresDoLembrete } from './calendario.js';

describe('a mensagem de cada aviso no WhatsApp', () => {
  it('a do observador, com o exemplo do print: a do fluxo antigo, uma informação por linha', () => {
    expect(preencherAviso('observador', MODELOS_DOS_AVISOS_PADRAO.observador, EXEMPLOS_DOS_AVISOS.observador)).toBe([
      '🔎 *Painel:* Suporte',
      '📌 *Card:* SUP-12 · LineChat - Labchecap - MarIA Espirometria',
      '📝 *Nota:* Encaminhado para Luan',
      '👤 *Quem:* Lúcio Andrade',
      '👨‍💼 *Cliente:* Labchecap',
      '🔗 *Link do Card/Painel:* https://gestao.inglinesystems.com.br/atendimento/SUP-12',
    ].join('\n'));
  });

  it('a linha em que todas as variáveis vêm vazias não vai; a que tem alguma cheia, vai', () => {
    const m = 'Card: {codigo}\nCliente: {cliente}\n{cliente} / {contato}\nTexto fixo\n\n\n\nFim';
    expect(preencherAviso('etapa', m, { codigo: 'SUP-3', cliente: '', contato: null })).toBe('Card: SUP-3\nTexto fixo\n\nFim');
    expect(preencherAviso('etapa', m, { codigo: 'SUP-3', cliente: '', contato: 'Maria' })).toBe('Card: SUP-3\n / Maria\nTexto fixo\n\nFim');
    // o espaço sozinho conta como vazio
    expect(preencherAviso('etapa', 'Cliente: {cliente}', { cliente: '   ' })).toBe('');
  });

  it('a variável vale sem distinguir maiúscula; a que o aviso não tem fica como foi escrita', () => {
    expect(preencherAviso('recebeu', '{AVISO} ({Quem})', { aviso: 'Você recebeu o chamado SUP-1', quem: 'Marina' })).toBe('Você recebeu o chamado SUP-1 (Marina)');
    // {nota} não é do "recebeu": sai como está (e a tela não deixa salvar)
    expect(preencherAviso('recebeu', '{aviso} {nota}', { aviso: 'Oi', nota: 'x' })).toBe('Oi {nota}');
    // o valor não é lido de novo: "{codigo}" escrito numa nota não vira o código
    expect(preencherAviso('observador', '{nota}', { nota: 'veja o {codigo}', codigo: 'SUP-9' })).toBe('veja o {codigo}');
    // a nota com várias linhas vai inteira
    expect(preencherAviso('observador', '📝 {nota}', { nota: 'um\ndois' })).toBe('📝 um\ndois');
  });

  it('a mensagem passa de 4.000 letras: corta com reticências', () => {
    const r = preencherAviso('observador', '{nota}', { nota: 'a'.repeat(5000) });
    expect(r).toHaveLength(4000);
    expect(r.endsWith('…')).toBe(true);
  });

  it('as padrão só usam as variáveis de cada aviso, e os exemplos preenchem todas', () => {
    for (const e of EVENTOS_AVISO) {
      expect(variaveisDesconhecidas(e, MODELOS_DOS_AVISOS_PADRAO[e]), e).toEqual([]);
      for (const v of variaveisDoAviso(e)) expect(Object.keys(EXEMPLOS_DOS_AVISOS[e]), `${e}: ${v.chave}`).toContain(v.chave);
    }
    // o relógio não "faz": os avisos de prazo e de sem responsável não têm o {quem}
    expect(variaveisDoAviso('prazo_vencido').map((v) => v.chave)).not.toContain('quem');
    // a {nota} é só da anotação (o observador e a citação); a {novidade}, só do observador
    expect(EVENTOS_AVISO.filter((e) => variaveisDoAviso(e).some((v) => v.chave === 'nota'))).toEqual(['citado', 'observador']);
    expect(EVENTOS_AVISO.filter((e) => variaveisDoAviso(e).some((v) => v.chave === 'novidade'))).toEqual(['observador']);
  });

  it('as variáveis desconhecidas: o erro de digitação aparece, uma vez cada', () => {
    expect(variaveisDesconhecidas('observador', '{cotato} {cotato} {Cliente} {SUP-12} {}')).toEqual(['{cotato}']);
    expect(variaveisDesconhecidas('lembrete', '{evento} {nota}')).toEqual(['{nota}']);
  });

  it('salvar: a variável errada é recusada dizendo onde; vazia e igual à padrão não ficam guardadas', () => {
    const r = ModelosDosAvisosSchema.safeParse({ observador: '{nota}', critico: '{aviso} {quemm}' });
    expect(r.success).toBe(false);
    expect(r.error!.issues).toEqual([expect.objectContaining({
      path: ['critico'], message: 'Na mensagem do aviso "Chegou um chamado Crítico", {quemm} não é variável dele: confira o nome (os botões põem certo).',
    })]);
    expect(ModelosDosAvisosSchema.safeParse({ observador: 'x'.repeat(2001) }).success).toBe(false);
    expect(modelosParaGuardar({ observador: '  {nota}  ', recebeu: MODELOS_DOS_AVISOS_PADRAO.recebeu, etapa: '   ', citado: 'a\r\nb' }))
      .toEqual({ observador: '{nota}', citado: 'a\nb' });
    expect(modelosParaGuardar(null)).toEqual({});
    // sem a do aviso, vale a padrão
    expect(modeloDoAviso({ observador: '{nota}' }, 'observador')).toBe('{nota}');
    expect(modeloDoAviso({ observador: ' ' }, 'observador')).toBe(MODELOS_DOS_AVISOS_PADRAO.observador);
    expect(modeloDoAviso(undefined, 'lembrete')).toBe(MODELOS_DOS_AVISOS_PADRAO.lembrete);
    // os Ajustes antigos (sem as mensagens) continuam valendo
    const antigo = AvisosChamadosSchema.parse({
      ativo: false, url: 'https://api.exemplo.com.br/chat/v1/message/send', usarChaveDoLineChat: true, numeroCliente: '', numeroEquipe: '', modeloCliente: '{texto}', eventos: EVENTOS_AVISO_PADRAO,
    });
    expect(antigo.modelos).toEqual({});
  });

  it('o lembrete do calendário: quando, o texto do sininho e as variáveis do evento', () => {
    const agora = new Date('2026-10-20T12:00:00Z');
    const e = { titulo: 'Visita — Clínica Aurora', inicio: '2026-10-21', diaInteiro: false, horaInicio: '09:00', local: null, observacao: 'Levar o reserva.' };
    expect(quandoDoLembrete(e, agora)).toBe('amanhã, 21/10, às 09:00');
    expect(quandoDoLembrete({ ...e, inicio: '2026-10-20', diaInteiro: true, horaInicio: null }, agora)).toBe('hoje, 20/10 (dia inteiro)');
    expect(textoDoLembrete(e, agora)).toBe('Lembrete: Visita — Clínica Aurora, amanhã, 21/10, às 09:00');
    const v = valoresDoLembrete(e, { tipo: 'Visita', cliente: 'Clínica Aurora', chamado: null, pessoas: ['Luan França', 'Lúcio Andrade'], paineis: ['Suporte'], link: 'https://x/calendario' }, agora);
    expect(v).toEqual({
      aviso: 'Lembrete: Visita — Clínica Aurora, amanhã, 21/10, às 09:00', evento: 'Visita — Clínica Aurora', tipo: 'Visita', quando: 'amanhã, 21/10, às 09:00',
      local: '', cliente: 'Clínica Aurora', chamado: '', pessoas: 'Luan França, Lúcio Andrade', paineis: 'Suporte', observacao: 'Levar o reserva.', link: 'https://x/calendario',
    });
    // a padrão: sem local nem chamado, as linhas deles não vão
    const texto = preencherAviso('lembrete', MODELOS_DOS_AVISOS_PADRAO.lembrete, v);
    expect(texto).not.toContain('Local');
    expect(texto).not.toContain('Chamado');
    expect(texto.split('\n')).toHaveLength(5);
  });
});
