import { describe, expect, it } from 'vitest';
import {
  agendadoDeHoje, AjustesEnvioSchema, envioDeHoje, enviosDoGuardado, horaDeEnviar, ID_DO_ENVIO_DE_ANTES, MarcadosDoPainelSchema, MarcadosEnvioSchema,
  marcadosDoLegadoNoPainel, marcadosDoPainelComTitulo, momentoEmBrasilia, nomeDoPdf, numeroLegivel, ORIGEM_LEGADO, pacoteDoPainel,
  proximoEnvio, RELATORIOS_DO_ENVIO, RELATORIOS_DO_ENVIO_DO_PAINEL, schemaDosMarcados, textoDoEnvio,
} from './envio.js';
import type { VisaoDoPainel } from './atendimento-visao.js';
import { numeroWhatsApp } from './formatos.js';

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
  const um = { id: 'e1', origem: 'painel-suporte', ativo: true, horario: '18:00', dias: [4, 0, 0], destinatarios: [{ id: 'a', nome: 'Luan', numero: '71 99999-0000', ativo: true }] };
  const base = { url: 'https://api.exemplo.com/chat/v1/message/send', remetente: '(71) 3512-0000', envios: [um] };
  const com = (e: Partial<typeof um>) => ({ ...base, envios: [{ ...um, ...e }] });
  it('normaliza números e dias', () => {
    const a = AjustesEnvioSchema.parse(base);
    expect(a.remetente).toBe('557135120000');
    expect(a.envios[0]!.destinatarios[0]!.numero).toBe('5571999990000');
    expect(a.envios[0]!.dias).toEqual([0, 4]);
    expect(a.concluirConversa).toBe(true);
  });
  it('recusa o que não fecha', () => {
    expect(AjustesEnvioSchema.safeParse(com({ horario: '25:00' })).success).toBe(false);
    expect(AjustesEnvioSchema.safeParse(com({ destinatarios: [...um.destinatarios, { id: 'b', nome: 'Outro', numero: '5571999990000', ativo: true }] })).success).toBe(false);
    expect(AjustesEnvioSchema.safeParse(com({ destinatarios: [{ id: 'a', nome: 'Luan', numero: '123', ativo: true }] })).success).toBe(false);
    // ligado sem ninguém ativo, ou sem o número que envia: não liga
    const semNinguem = AjustesEnvioSchema.safeParse(com({ destinatarios: [{ ...um.destinatarios[0]!, ativo: false }] }));
    expect(semNinguem.success).toBe(false);
    expect(semNinguem.error?.issues[0]?.path).toEqual(['envios', 0, 'destinatarios']);
    expect(AjustesEnvioSchema.safeParse({ ...base, remetente: '' }).success).toBe(false);
    // desligado, pode ficar pela metade (e a lista pode ficar vazia)
    expect(AjustesEnvioSchema.safeParse({ ...com({ ativo: false, destinatarios: [] }), remetente: '' }).success).toBe(true);
    expect(AjustesEnvioSchema.safeParse({ url: '', remetente: '', envios: [] }).success).toBe(true);
  });
  it('um envio por painel (2.4.5): o mesmo número pode estar em dois envios', () => {
    const dois = { ...base, envios: [um, { ...um, id: 'e2', origem: 'painel-desenvolvimento' }] };
    expect(AjustesEnvioSchema.safeParse(dois).success).toBe(true);
    expect(AjustesEnvioSchema.safeParse({ ...base, envios: [um, { ...um, id: 'e2' }] }).error?.issues[0]?.message).toContain('Cada painel tem um envio só');
    expect(AjustesEnvioSchema.safeParse({ ...base, envios: [um, { ...um, origem: ORIGEM_LEGADO }] }).success).toBe(false); // o mesmo id
  });
  it('o guardado até o 2.4.4 vira o primeiro envio, do painel que substituiu o Legado', () => {
    const antes = { ativo: true, url: 'x', remetente: '557135120000', horario: '18:40', dias: [0, 1, 2, 3, 4], destinatarios: um.destinatarios, ultimoAgendado: { dia: '2026-11-04', ok: true, tentativas: 1, em: '2026-11-04T21:40:00Z', horario: '18:40' }, historico: [] };
    expect(enviosDoGuardado(antes, 'painel-suporte')).toEqual([{
      id: ID_DO_ENVIO_DE_ANTES, origem: 'painel-suporte', ativo: true, horario: '18:40', dias: [0, 1, 2, 3, 4], destinatarios: um.destinatarios, ultimoAgendado: antes.ultimoAgendado,
    }]);
    // nunca configurado: a lista começa vazia; já na lista: fica como está
    expect(enviosDoGuardado({ ativo: false, destinatarios: [], horario: '18:00' }, 'painel-suporte')).toEqual([]);
    expect(enviosDoGuardado(null, 'painel-suporte')).toEqual([]);
    const lista = [{ ...um, ultimoAgendado: null }];
    expect(enviosDoGuardado({ envios: lista, ativo: true, destinatarios: um.destinatarios }, 'painel-suporte')).toBe(lista);
  });
  it('o que pode ser marcado: relatórios do catálogo (menos o Raio-X) e gráficos da tela', () => {
    expect(RELATORIOS_DO_ENVIO).toHaveLength(19);
    expect(RELATORIOS_DO_ENVIO).not.toContain('raiox');
    expect(MarcadosEnvioSchema.parse({ relatorios: ['relogio', 'relogio', 'mes'], graficos: ['serie', 'campo:assunto'] })).toEqual({ relatorios: ['relogio', 'mes'], graficos: ['serie', 'campo:assunto'] });
    expect(MarcadosEnvioSchema.safeParse({ relatorios: ['raiox'] }).success).toBe(false);
    expect(MarcadosEnvioSchema.safeParse({ graficos: ['pizza'] }).success).toBe(false);
  });
  it('num painel (2.4.5): os 25 relatórios (menos o Raio-X) e os gráficos da Visão geral', () => {
    expect(RELATORIOS_DO_ENVIO_DO_PAINEL).toHaveLength(24);
    expect(RELATORIOS_DO_ENVIO_DO_PAINEL).not.toContain('raiox');
    expect(MarcadosDoPainelSchema.parse({ relatorios: ['fechamento', 'relogio'], graficos: ['serie', 'assunto', 'campo:c1'] }).relatorios).toEqual(['fechamento', 'relogio']);
    expect(MarcadosDoPainelSchema.safeParse({ relatorios: ['mes'] }).success).toBe(false); // o id do Legado
    expect(MarcadosDoPainelSchema.safeParse({ graficos: ['pizza'] }).success).toBe(false);
    expect(schemaDosMarcados(ORIGEM_LEGADO)).toBe(MarcadosEnvioSchema);
    expect(schemaDosMarcados('painel-suporte')).toBe(MarcadosDoPainelSchema);
  });
  it('o que estava marcado no Legado vai para o painel, onde tem par', () => {
    expect(marcadosDoLegadoNoPainel({ relatorios: ['relogio', 'primeira', 'mes', 'reincidencia', 'gargalo'], graficos: ['serie', 'etapa', 'campo:Assunto', 'campo:cor_do_card'] }))
      .toEqual({ relatorios: ['relogio', 'resposta', 'fechamento', 'voltou', 'empaca'], graficos: ['serie', 'etapa', 'assunto'] });
    // todo relatório do Legado que podia ir no envio tem um par
    expect(marcadosDoLegadoNoPainel({ relatorios: RELATORIOS_DO_ENVIO, graficos: [] }).relatorios).toHaveLength(RELATORIOS_DO_ENVIO.length);
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

  // 1.7.1: o caso do Luan em 05/10 — 3 falhas no horário antigo (18:00), trocou para 18:40 às 18:35
  // e a tela disse "amanhã às 18:40": o dia tinha sido gasto no horário antigo.
  it('trocar o horário vale já para hoje (1.7.1)', () => {
    const gastou = { dia: '2026-10-05', horario: '18:00', ok: false, tentativas: 3, em: '2026-10-05T21:30:00Z' };
    const novo = { ...a, horario: '18:40' };
    expect(proximoEnvio(novo, em('2026-10-05T21:35:00Z'), gastou)).toBe('hoje às 18:40');
    expect(horaDeEnviar(novo, em('2026-10-05T21:40:00Z'), gastou)).toBe(true);
    // e se já tinha saído no horário antigo, sai de novo no novo (quem trocou quer ver no horário novo)
    expect(horaDeEnviar(novo, em('2026-10-05T21:40:00Z'), { ...gastou, ok: true, tentativas: 1 })).toBe(true);
    // no mesmo horário, continua uma vez por dia
    expect(horaDeEnviar(a, em('2026-10-05T21:40:00Z'), { ...gastou, ok: true, tentativas: 1 })).toBe(false);
    // guardado antes do 1.7.1 (sem o horário): vale o de agora, como antes
    const antigo = { dia: '2026-10-05', ok: true, tentativas: 1, em: '2026-10-05T21:00:00Z' };
    expect(agendadoDeHoje(novo, em('2026-10-05T21:40:00Z'), antigo)).toEqual(antigo);
    expect(agendadoDeHoje(novo, em('2026-10-06T21:40:00Z'), antigo)).toBeNull();
  });
  it('depois de uma falha, o próximo diz quando tenta de novo (1.7.1)', () => {
    const falhou = { dia: '2026-10-04', horario: '18:00', ok: false, tentativas: 1, em: '2026-10-04T21:00:00Z' };
    expect(proximoEnvio(a, em('2026-10-04T21:05:00Z'), falhou)).toBe('hoje às 18:15 (nova tentativa)');
    expect(proximoEnvio(a, em('2026-10-04T21:16:00Z'), falhou)).toBe('agora (nova tentativa, na próxima volta do relógio)');
    expect(proximoEnvio(a, em('2026-10-04T21:35:00Z'), { ...falhou, tentativas: 3, em: '2026-10-04T21:30:00Z' })).toBe('amanhã às 18:00');
    // a nova tentativa cairia depois das 3 horas: não tem mais hoje
    expect(proximoEnvio(a, em('2026-10-04T23:55:00Z'), { ...falhou, em: '2026-10-04T23:50:00Z' })).toBe('amanhã às 18:00');
  });
  it('como foi o de hoje, para a tela (1.7.1)', () => {
    const hist = [
      { gatilho: 'manual', dia: '2026-10-04', em: '2026-10-04T21:20:00Z', mensagem: 'Enviado para 2 números.' },
      { gatilho: 'agendado', dia: '2026-10-04', em: '2026-10-04T21:00:00Z', mensagem: 'Falta o token da API da FlwChat (Administração › Envio automático).' },
    ];
    const falhou = { dia: '2026-10-04', horario: '18:00', ok: false, tentativas: 1, em: '2026-10-04T21:00:00Z' };
    expect(envioDeHoje(a, em('2026-10-04T21:05:00Z'), falhou, hist)).toEqual({
      horario: '18:00', ok: false, tentativas: 1, em: '2026-10-04T21:00:00Z',
      mensagem: 'Falta o token da API da FlwChat (Administração › Envio automático).', novaTentativa: '18:15',
    });
    expect(envioDeHoje(a, em('2026-10-04T21:40:00Z'), { ...falhou, tentativas: 3 }, hist)?.novaTentativa).toBeNull();
    expect(envioDeHoje(a, em('2026-10-04T21:05:00Z'), null, hist)).toBeNull();
    // trocou o horário: o de hoje ainda não houve
    expect(envioDeHoje({ horario: '18:40' }, em('2026-10-04T21:05:00Z'), falhou, hist)).toBeNull();
  });
});

describe('O que chega no WhatsApp', () => {
  it('o nome do arquivo e o texto', () => {
    expect(nomeDoPdf('2026-10-04')).toBe('chamados-04-10-2026.pdf');
    expect(nomeDoPdf('2026-11-04', 'SUP')).toBe('chamados-sup-04-11-2026.pdf');
    expect(nomeDoPdf('2026-11-04', 'Adm/ç')).toBe('chamados-admc-04-11-2026.pdf');
    const t = textoDoEnvio({ dia: '2026-10-04', hhmm: '18:00', painel: 'Suporte', numeros: [{ label: 'Abertos hoje', valor: '16' }, { label: 'Vencidos', valor: 2 }], titulos: ['Relógio do chamado'] });
    expect(t).toContain('*Chamados de hoje* — domingo, 04/10 (até 18:00)');
    expect(t).toContain('• Abertos hoje: 16');
    expect(t).toContain('• Vencidos: 2');
    expect(t).toContain('No PDF: Relógio do chamado.');
    expect(t).not.toMatch(/\n\n\n/);
  });
});

describe('O PDF de um painel (2.4.5)', () => {
  const visao = {
    painel: { id: 'p', nome: 'Suporte', sigla: 'SUP' },
    kpis: [{ id: 'chegaram', label: 'Chegaram hoje', valor: '5', tom: 'neutral' }],
    serie: { titulo: 'Chamados que chegaram hoje, por hora', sub: '', pontos: [] },
    graficos: [
      { id: 'assunto', titulo: 'Por assunto', multiplo: false, filtro: 'assunto', itens: [] },
      { id: 'etapa', titulo: 'Por etapa', multiplo: false, filtro: 'etapa', itens: [] },
      { id: 'campo:c1', titulo: 'Por falha', multiplo: false, filtro: 'campo', itens: [] },
    ],
  } as unknown as VisaoDoPainel;
  it('os gráficos na arrumação da Visão; os relatórios na ordem do Organizar', () => {
    const m = { graficos: ['campo:c1', 'serie', 'etapa'], relatorios: ['fechamento', 'escada', 'relogio'] };
    const sem = marcadosDoPainelComTitulo(visao, null, m);
    // de fábrica: o do tempo, o assunto, depois a etapa; o campo no fim
    expect(sem.graficos.map((g) => [g.id, g.titulo])).toEqual([['serie', 'Chamados que chegaram hoje, por hora'], ['etapa', 'Por etapa'], ['campo:c1', 'Por falha']]);
    expect(sem.graficos[0]!.item).toMatchObject({ largura: 'inteira' });
    expect(sem.relatorios.map((r) => r.id)).toEqual(['relogio', 'escada', 'fechamento']);
    // a equipe arrumou: o campo primeiro, a etapa em barras; e a escada não vale para o painel
    const arrumada = { visao: [{ id: 'campo:c1', largura: 'inteira' as const, oculto: false }, { id: 'etapa', largura: 'metade' as const, oculto: false, forma: 'barras' as const }] };
    const t = marcadosDoPainelComTitulo(visao, arrumada, m, ['relogio', 'fechamento']);
    expect(t.graficos.map((g) => g.id)).toEqual(['campo:c1', 'etapa', 'serie']);
    expect(t.graficos[1]!.item.forma).toBe('barras');
    expect(t.relatorios.map((r) => r.titulo)).toEqual(['Relógio do chamado', 'Fechamento do mês']);
  });
  it('o pacote: os números de hoje e o que foi marcado, com os títulos para a mensagem', () => {
    const p = pacoteDoPainel({ agora: em('2026-11-04T21:00:00Z'), visao, relatorios: null, arrumacao: null, marcados: { graficos: ['serie'], relatorios: ['relogio'] } });
    expect(p).toMatchObject({ tipo: 'painel', dia: '2026-11-04', hhmm: '18:00', painel: { sigla: 'SUP' }, relatorioIds: [] });
    expect(p.kpis[0]!.label).toBe('Chegaram hoje');
    // sem os relatórios montados (nenhum marcado), só os gráficos entram nos títulos
    expect(p.titulos).toEqual(['Chamados que chegaram hoje, por hora']);
  });
});
