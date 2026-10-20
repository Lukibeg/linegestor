import { describe, expect, it } from 'vitest';
import {
  chaveDoLembrete, comecoDoEvento, diaPorExtenso, diasDaGradeDoMes, emUnidade, EventoGravarSchema, eventosDoDia, eventoVisivel, filtrarEventos,
  FILTRO_DO_CALENDARIO_VAZIO, LembretesSchema, lembretesAoGravar, lembretesDevidos, paineisDepoisDaEdicao, pessoasPossiveis, quemEstaFora,
  quemRecebeOLembrete, textoDoAntes, textoDoHorario, textoDoLembrete, textoDoMes, textoDoPeriodo, textoDosLembretes, TIPOS_DE_EVENTO_PADRAO,
  tipoDoEvento, tiposDoCalendario, TiposDoCalendarioSchema, tituloSugerido, EventosDoPeriodoSchema,
  type EventoDoCalendario,
} from './calendario.js';

const evento = (e: Partial<EventoDoCalendario>): EventoDoCalendario => ({
  id: 'e1', titulo: 'Visita — Clínica Aurora', tipoId: 'visita', paineis: ['p-sup'], pessoas: [], clienteId: null, clienteNome: null, chamadoId: null, chamadoCodigo: null,
  inicio: '2026-10-20', fim: '2026-10-20', diaInteiro: true, horaInicio: null, horaFim: null, local: '', observacao: '', situacao: 'agendado',
  lembretes: [], lembrarQuem: 'pessoas', criadoPor: null, criadoEm: '2026-10-16T12:00:00.000Z', alteradoPor: null, alteradoEm: '2026-10-16T12:00:00.000Z', ...e,
});

describe('o evento (a janela)', () => {
  const base = { titulo: 'Virada para nuvem — Clínica Aurora', tipoId: 'virada-nuvem', paineis: ['p-sup', 'p-sup', 'p-dev'], inicio: '2026-10-24', fim: '2026-10-25' };

  it('o válido sai arrumado: sem painel repetido, dia inteiro sem hora', () => {
    const r = EventoGravarSchema.parse({ ...base, horaInicio: '09:00' });
    expect(r).toMatchObject({ paineis: ['p-sup', 'p-dev'], pessoas: [], diaInteiro: true, horaInicio: null, horaFim: null, situacao: 'agendado', clienteId: null });
    expect(EventoGravarSchema.parse({ ...base, inicio: '2026-10-24', fim: '2026-10-24', diaInteiro: false, horaInicio: '22:00', horaFim: '23:30' }))
      .toMatchObject({ horaInicio: '22:00', horaFim: '23:30' });
  });

  it('o que não serve é recusado com a frase de cada caso', () => {
    const erro = (x: object) => EventoGravarSchema.safeParse({ ...base, ...x }).error?.issues.map((i) => i.message).join(' | ');
    expect(erro({ fim: '2026-10-23' })).toBe('O último dia vem depois do primeiro.');
    expect(erro({ fim: '2026-12-31' })).toContain('até 62 dias');
    expect(erro({ inicio: '2026-02-31', fim: '2026-03-01' })).toContain('o dia precisa existir');
    expect(erro({ diaInteiro: false })).toBe('Diga a hora de começar (ou marque o dia inteiro).');
    expect(erro({ fim: '2026-10-24', diaInteiro: false, horaInicio: '14:00', horaFim: '13:00' })).toBe('A hora de terminar vem depois da de começar.');
    expect(erro({ diaInteiro: false, horaInicio: '25:00' })).toContain('14:30');
    expect(erro({ paineis: [] })).toContain('pelo menos um painel');
    expect(erro({ titulo: '  ' })).toBe('Dê um título ao evento.');
    // a virada que vira a noite (de um dia para o outro) aceita a hora de terminar menor
    expect(erro({ diaInteiro: false, horaInicio: '22:00', horaFim: '02:00' })).toBeUndefined();
  });

  it('o período da tela: até 400 dias, o fim depois do começo', () => {
    expect(EventosDoPeriodoSchema.safeParse({ de: '2026-09-28', ate: '2026-11-08' }).success).toBe(true);
    expect(EventosDoPeriodoSchema.safeParse({ de: '2026-11-08', ate: '2026-09-28' }).success).toBe(false);
    expect(EventosDoPeriodoSchema.safeParse({ de: '2026-01-01', ate: '2027-12-31' }).success).toBe(false);
  });
});

describe('os tipos', () => {
  it('os de fábrica são os do pedido do Luan (e a reunião); a folga e o home office são da equipe', () => {
    expect(TIPOS_DE_EVENTO_PADRAO.map((t) => t.nome)).toEqual(['Visita', 'Virada de sistema', 'Virada para nuvem', 'Ação no cliente', 'Reunião', 'Folga', 'Home office']);
    expect(TIPOS_DE_EVENTO_PADRAO.filter((t) => t.daEquipe).map((t) => t.id)).toEqual(['folga', 'home-office']);
    expect(tiposDoCalendario(null)).toEqual(TIPOS_DE_EVENTO_PADRAO);
    expect(tiposDoCalendario({ tipos: [{ id: 'x', nome: 'Treinamento', cor: 'roxo', daEquipe: false, ativo: true }] }).map((t) => t.nome)).toEqual(['Treinamento']);
    // a cópia não mexe na fábrica
    const copia = tiposDoCalendario(null);
    copia[0]!.lembretes.push(5);
    expect(TIPOS_DE_EVENTO_PADRAO[0]!.lembretes).toEqual([1440, 60]);
  });

  it('sem repetir o nome, e pelo menos um ativo; o tipo que sumiu vira "Outro"', () => {
    const t = (nome: string, ativo = true) => ({ id: nome, nome, cor: 'accent' as const, daEquipe: false, ativo });
    expect(TiposDoCalendarioSchema.safeParse({ tipos: [t('Visita'), { ...t('visita'), id: 'v2' }] }).error?.issues[0]?.message).toBe('Há dois tipos chamados visita: um nome para cada.');
    expect(TiposDoCalendarioSchema.safeParse({ tipos: [t('Visita', false)] }).error?.issues[0]?.message).toBe('Deixe pelo menos um tipo ativo.');
    expect(tipoDoEvento(TIPOS_DE_EVENTO_PADRAO, 'sumiu')).toMatchObject({ nome: 'Outro', cor: 'neutral', ativo: false });
  });
});

describe('quem vê (os painéis)', () => {
  it('vê quem vê um dos painéis do evento', () => {
    expect(eventoVisivel({ paineis: ['p-sup', 'p-dev'] }, new Set(['p-dev']))).toBe(true);
    expect(eventoVisivel({ paineis: ['p-com'] }, new Set(['p-sup', 'p-dev']))).toBe(false);
  });

  it('quem edita não tira o evento de um painel que não vê, nem põe num', () => {
    expect(paineisDepoisDaEdicao(['p-sup', 'p-adm'], ['p-dev', 'p-com'], new Set(['p-sup', 'p-dev']))).toEqual(['p-dev', 'p-adm']);
  });

  it('as pessoas do evento: quem vê um dos painéis escolhidos', () => {
    const ps = [{ id: 'p-sup', pessoas: ['ana', 'bia'] }, { id: 'p-dev', pessoas: ['bia', 'caio'] }, { id: 'p-adm', pessoas: ['dani'] }];
    expect([...pessoasPossiveis(ps, ['p-sup', 'p-dev'])].sort()).toEqual(['ana', 'bia', 'caio']);
  });
});

describe('os dias', () => {
  it('a grade do mês: semanas inteiras, de segunda a domingo', () => {
    const outubro = diasDaGradeDoMes('2026-10');
    expect([outubro[0], outubro.at(-1), outubro.length]).toEqual(['2026-09-28', '2026-11-01', 35]);
    // fevereiro de 2027 começa numa segunda e acaba num domingo: 4 semanas certinhas
    expect(diasDaGradeDoMes('2027-02').length).toBe(28);
    expect(textoDoMes('2026-10')).toBe('outubro de 2026');
    expect(diaPorExtenso('2026-10-19')).toBe('segunda, 19 de outubro');
  });

  it('a ordem do dia, o horário e o período', () => {
    const lista = [
      evento({ id: 'tarde', diaInteiro: false, horaInicio: '14:00', horaFim: '16:00' }),
      evento({ id: 'cancelado', situacao: 'cancelado' }),
      evento({ id: 'cedo', diaInteiro: false, horaInicio: '08:30' }),
      evento({ id: 'inteiro' }),
      evento({ id: 'outro-dia', inicio: '2026-10-21', fim: '2026-10-21' }),
      evento({ id: 'tres-dias', inicio: '2026-10-19', fim: '2026-10-21' }),
    ];
    expect(eventosDoDia(lista, '2026-10-20').map((e) => e.id)).toEqual(['tres-dias', 'inteiro', 'cedo', 'tarde', 'cancelado']);
    expect(textoDoHorario(lista[0]!)).toBe('14:00–16:00');
    expect(textoDoHorario(lista[2]!)).toBe('às 08:30');
    expect(textoDoHorario(lista[3]!)).toBe('Dia inteiro');
    expect(textoDoPeriodo(lista[5]!)).toBe('19 a 21/10');
    expect(textoDoPeriodo(evento({ inicio: '2026-10-30', fim: '2026-11-02' }))).toBe('30/10 a 02/11');
    expect(textoDoPeriodo(lista[3]!)).toBe('20/10');
  });
});

describe('os filtros e quem está fora', () => {
  const lista = [
    evento({ id: 'v', tipoId: 'visita', paineis: ['p-sup'], pessoas: ['ana'], clienteId: 'c1', clienteNome: 'Clínica Aurora', local: 'Rua das Flores' }),
    evento({ id: 'f', tipoId: 'folga', titulo: 'Folga — Caio', paineis: ['p-dev'], pessoas: ['caio'] }),
    evento({ id: 'h', tipoId: 'home-office', titulo: 'Home office', paineis: ['p-sup', 'p-dev'], pessoas: ['ana', 'bia'] }),
    evento({ id: 'x', tipoId: 'folga', titulo: 'Folga — Dani', paineis: ['p-adm'], pessoas: ['dani'], situacao: 'cancelado' }),
  ];
  const f = (x: Partial<typeof FILTRO_DO_CALENDARIO_VAZIO>) => filtrarEventos(lista, { ...FILTRO_DO_CALENDARIO_VAZIO, ...x }, new Map([['ana', 'Ana Souza'], ['caio', 'Caio Lima']])).map((e) => e.id);

  it('por painel, tipo, pessoa, cancelados e a busca (que acha também o cliente e a pessoa)', () => {
    expect(f({})).toEqual(['v', 'f', 'h', 'x']);
    expect(f({ paineis: ['p-dev'] })).toEqual(['f', 'h']);
    expect(f({ tipos: ['folga'] })).toEqual(['f', 'x']);
    expect(f({ pessoa: 'ana' })).toEqual(['v', 'h']);
    expect(f({ cancelados: false })).toEqual(['v', 'f', 'h']);
    expect(f({ busca: 'aurora' })).toEqual(['v']);
    expect(f({ busca: 'flores' })).toEqual(['v']);
    expect(f({ busca: 'caio lima' })).toEqual(['f']);
  });

  it('hoje, fora do escritório: a folga e o home office, sem os cancelados', () => {
    expect(quemEstaFora(lista, TIPOS_DE_EVENTO_PADRAO, '2026-10-20')).toEqual([
      { tipo: expect.objectContaining({ id: 'folga' }), pessoas: ['caio'] },
      { tipo: expect.objectContaining({ id: 'home-office' }), pessoas: ['ana', 'bia'] },
    ]);
    expect(quemEstaFora(lista, TIPOS_DE_EVENTO_PADRAO, '2026-10-21')).toEqual([]);
  });

  it('o título sugerido: o cliente na visita, as pessoas na folga', () => {
    expect(tituloSugerido({ nome: 'Visita', daEquipe: false }, 'Clínica Aurora', ['Ana'])).toBe('Visita — Clínica Aurora');
    expect(tituloSugerido({ nome: 'Folga', daEquipe: true }, null, ['Caio Lima'])).toBe('Folga — Caio Lima');
    expect(tituloSugerido({ nome: 'Reunião', daEquipe: false }, null, [])).toBe('Reunião');
  });
});

describe('os lembretes (2.0.2)', () => {
  it('o tempo antes, por extenso, na unidade que dá conta inteira', () => {
    expect([0, 15, 60, 90, 1440, 2880, 10080].map(textoDoAntes)).toEqual(['Na hora', '15 minutos antes', '1 hora antes', '90 minutos antes', '1 dia antes', '2 dias antes', '1 semana antes']);
    expect(emUnidade(2880)).toEqual({ quanto: 2, unidade: 'dias' });
    expect(emUnidade(0)).toEqual({ quanto: 0, unidade: 'minutos' });
    expect(textoDosLembretes([60, 1440])).toBe('1 dia antes e 1 hora antes');
    expect(textoDosLembretes([0, 60])).toBe('1 hora antes e na hora');
    expect(textoDosLembretes([10080, 1440, 15])).toBe('1 semana antes, 1 dia antes e 15 minutos antes');
    expect(textoDosLembretes([0])).toBe('na hora');
    expect(textoDosLembretes([])).toBe('sem lembrete');
  });

  it('a lista: sem repetir, do mais cedo para o mais tarde, até 5 e até 4 semanas antes', () => {
    expect(LembretesSchema.parse([60, 1440, 60, 0])).toEqual([1440, 60, 0]);
    expect(LembretesSchema.safeParse([1, 2, 3, 4, 5, 6]).error?.issues[0]?.message).toBe('Até 5 lembretes.');
    expect(LembretesSchema.safeParse([40321]).error?.issues[0]?.message).toBe('O lembrete vai até 4 semanas antes.');
    expect(LembretesSchema.safeParse([-5]).success).toBe(false);
    expect(EventoGravarSchema.parse({ titulo: 'Visita', tipoId: 'visita', paineis: ['p'], inicio: '2026-10-21', fim: '2026-10-21' }))
      .toMatchObject({ lembretes: [], lembrarQuem: 'pessoas' });
  });

  it('os tipos guardados antes do 2.0.2: o de fábrica fica com os lembretes da fábrica; o da equipe, sem', () => {
    const guardado = { tipos: [{ id: 'visita', nome: 'Visita técnica', cor: 'accent', daEquipe: false, ativo: true }, { id: 'treino', nome: 'Treinamento', cor: 'roxo', daEquipe: false, ativo: true }] };
    expect(tiposDoCalendario(guardado).map((t) => [t.nome, t.lembretes])).toEqual([['Visita técnica', [1440, 60]], ['Treinamento', []]]);
    // o que a equipe tirou continua tirado
    expect(tiposDoCalendario({ tipos: [{ id: 'visita', nome: 'Visita', cor: 'accent', daEquipe: false, ativo: true, lembretes: [] }] })[0]!.lembretes).toEqual([]);
  });

  const ev = (m: Partial<Parameters<typeof lembretesDevidos>[0]> = {}) => ({ inicio: '2026-10-21', diaInteiro: false, horaInicio: '09:00', situacao: 'agendado' as const, lembretes: [1440, 60], ...m });
  const em = (s: string) => new Date(s);

  it('o começo: a hora de Brasília; o dia inteiro, às 8h', () => {
    expect(comecoDoEvento(ev()).toISOString()).toBe('2026-10-21T12:00:00.000Z');
    expect(comecoDoEvento(ev({ diaInteiro: true, horaInicio: null })).toISOString()).toBe('2026-10-21T11:00:00.000Z');
  });

  it('sai na hora, uma vez, até 3 horas de atraso e nunca depois de o evento começar', () => {
    // 1 dia antes: 20/10 às 09:00 (12:00 em UTC)
    expect(lembretesDevidos(ev(), {}, em('2026-10-20T11:59:00Z'))).toEqual([]);
    expect(lembretesDevidos(ev(), {}, em('2026-10-20T12:00:00Z'))).toEqual([1440]);
    expect(lembretesDevidos(ev(), {}, em('2026-10-20T14:59:00Z'))).toEqual([1440]);
    expect(lembretesDevidos(ev(), {}, em('2026-10-20T15:01:00Z'))).toEqual([]);
    // já saiu para este começo
    const comeco = comecoDoEvento(ev());
    expect(lembretesDevidos(ev(), { [chaveDoLembrete(1440, comeco)]: '2026-10-20T12:00:00.000Z' }, em('2026-10-20T12:01:00Z'))).toEqual([]);
    // 1 hora antes: 08:00; às 09:00 o evento começou
    expect(lembretesDevidos(ev(), {}, em('2026-10-21T11:00:00Z'))).toEqual([60]);
    expect(lembretesDevidos(ev(), {}, em('2026-10-21T12:00:30Z'))).toEqual([]);
    // o "na hora" sai até 5 minutos depois do começo
    expect(lembretesDevidos(ev({ lembretes: [0] }), {}, em('2026-10-21T12:04:00Z'))).toEqual([0]);
    expect(lembretesDevidos(ev({ lembretes: [0] }), {}, em('2026-10-21T12:06:00Z'))).toEqual([]);
    // o feito e o cancelado não lembram
    expect(lembretesDevidos(ev({ situacao: 'cancelado' }), {}, em('2026-10-20T12:00:00Z'))).toEqual([]);
    expect(lembretesDevidos(ev({ situacao: 'feito' }), {}, em('2026-10-20T12:00:00Z'))).toEqual([]);
  });

  it('ao gravar: o que já passou fica pulado, o que já saiu continua, e mudar o dia vale de novo', () => {
    const comeco = comecoDoEvento(ev());
    // gravado no próprio 20/10 às 10:00: o "1 dia antes" (20/10 às 09:00) já passou
    const gravado = lembretesAoGravar(ev(), {}, em('2026-10-20T13:00:00Z'));
    expect(gravado).toEqual({ [chaveDoLembrete(1440, comeco)]: 'pulado' });
    expect(lembretesDevidos(ev(), gravado, em('2026-10-20T13:01:00Z'))).toEqual([]);
    // gravado de novo, sem mudar a hora: o que saiu continua saído
    const saiu = { [chaveDoLembrete(60, comeco)]: '2026-10-21T11:00:00.000Z' };
    expect(lembretesAoGravar(ev(), saiu, em('2026-10-21T11:30:00Z'))).toEqual({ ...saiu, [chaveDoLembrete(1440, comeco)]: 'pulado' });
    // o evento foi para o dia 23: os dois valem de novo
    const depois = ev({ inicio: '2026-10-23' });
    expect(lembretesAoGravar(depois, saiu, em('2026-10-21T11:30:00Z'))).toEqual({});
    expect(lembretesDevidos(depois, {}, em('2026-10-22T12:00:00Z'))).toEqual([1440]);
  });

  it('quem recebe: as pessoas do evento (sem pessoas, quem criou) ou todos que veem — sempre quem vê', () => {
    const quemVe = new Map([['p-sup', ['ana', 'bia', 'luan']], ['p-dev', ['caio', 'luan']]]);
    const e = { paineis: ['p-sup'], pessoas: ['ana', 'caio'], lembrarQuem: 'pessoas' as const, criadoPorId: 'luan' };
    // o Caio não vê o Suporte: não recebe
    expect(quemRecebeOLembrete(e, quemVe)).toEqual(['ana']);
    expect(quemRecebeOLembrete({ ...e, pessoas: [] }, quemVe)).toEqual(['luan']);
    expect(quemRecebeOLembrete({ ...e, lembrarQuem: 'paineis' }, quemVe).sort()).toEqual(['ana', 'bia', 'luan']);
    expect(quemRecebeOLembrete({ ...e, paineis: ['p-sup', 'p-dev'], lembrarQuem: 'paineis' }, quemVe).sort()).toEqual(['ana', 'bia', 'caio', 'luan']);
  });

  it('o texto: hoje, amanhã ou o dia da semana, com a data (o aviso fica no sininho depois)', () => {
    const agora = em('2026-10-20T13:00:00Z');
    expect(textoDoLembrete({ titulo: 'Visita — Clínica Aurora', inicio: '2026-10-21', diaInteiro: false, horaInicio: '09:00' }, agora)).toBe('Lembrete: Visita — Clínica Aurora, amanhã, 21/10, às 09:00');
    expect(textoDoLembrete({ titulo: 'Reunião', inicio: '2026-10-20', diaInteiro: false, horaInicio: '15:00' }, agora)).toBe('Lembrete: Reunião, hoje, 20/10, às 15:00');
    expect(textoDoLembrete({ titulo: 'Virada para nuvem', inicio: '2026-10-23', diaInteiro: true, horaInicio: null }, agora)).toBe('Lembrete: Virada para nuvem, sexta, 23/10 (dia inteiro)');
  });
});
