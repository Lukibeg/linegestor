import { describe, expect, it } from 'vitest';
import {
  diaPorExtenso, diasDaGradeDoMes, EventoGravarSchema, eventosDoDia, eventoVisivel, filtrarEventos, FILTRO_DO_CALENDARIO_VAZIO, paineisDepoisDaEdicao,
  pessoasPossiveis, quemEstaFora, textoDoHorario, textoDoMes, textoDoPeriodo, TIPOS_DE_EVENTO_PADRAO, tipoDoEvento, tiposDoCalendario,
  TiposDoCalendarioSchema, tituloSugerido, EventosDoPeriodoSchema,
  type EventoDoCalendario,
} from './calendario.js';

const evento = (e: Partial<EventoDoCalendario>): EventoDoCalendario => ({
  id: 'e1', titulo: 'Visita — Clínica Aurora', tipoId: 'visita', paineis: ['p-sup'], pessoas: [], clienteId: null, clienteNome: null, chamadoId: null, chamadoCodigo: null,
  inicio: '2026-10-20', fim: '2026-10-20', diaInteiro: true, horaInicio: null, horaFim: null, local: '', observacao: '', situacao: 'agendado',
  criadoPor: null, criadoEm: '2026-10-16T12:00:00.000Z', alteradoPor: null, alteradoEm: '2026-10-16T12:00:00.000Z', ...e,
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

  it('por painel, tipo, pessoa, cliente, cancelados e a busca (que acha também a pessoa)', () => {
    expect(f({})).toEqual(['v', 'f', 'h', 'x']);
    expect(f({ paineis: ['p-dev'] })).toEqual(['f', 'h']);
    expect(f({ tipos: ['folga'] })).toEqual(['f', 'x']);
    expect(f({ pessoa: 'ana' })).toEqual(['v', 'h']);
    expect(f({ cliente: 'c1' })).toEqual(['v']);
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
