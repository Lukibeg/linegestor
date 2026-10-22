import { describe, expect, it } from 'vitest';
import { AJUSTES_PRAZOS_PADRAO, instanteLocal } from './atendimento-prazos.js';
import {
  CATALOGO_DOS_RELATORIOS, FiltroDosRelatoriosSchema, arrumacaoCompleta, atalhosDosRelatorios, campoDaFalha, chamadoParaRelatorios, duracaoUtil,
  horasDoDiaUtil, periodoDosRelatorios, relatoriosAplicaveis, relatoriosDaAba, relatoriosDoPainel,
  type ChamadoParaRelatorios, type ContextoDosRelatorios, type FiltroDosRelatorios, type RelatoriosDoPainel,
} from './atendimento-relatorios.js';

const em = (dia: string, hora = '10:00') => instanteLocal(dia, hora).toISOString();
const AGORA = instanteLocal('2026-10-22', '15:00');

const ctx: ContextoDosRelatorios = {
  painel: { id: 'sup', nome: 'Suporte', sigla: 'SUP', contaPrazo: true, usa: { assunto: true, tipo: true, gravidade: true, produtos: true, operadoras: true } },
  etapas: [
    { id: 'novo', nome: 'Novos', tipo: 'entrada', nivel: null, ordem: 0, ativa: true },
    { id: 'n1', nome: 'N1', tipo: 'andamento', nivel: 1, ordem: 1, ativa: true },
    { id: 'n2', nome: 'N2', tipo: 'andamento', nivel: 2, ordem: 2, ativa: true },
    { id: 'n3', nome: 'N3', tipo: 'andamento', nivel: 3, ordem: 3, ativa: true },
    { id: 'dev', nome: 'DEV', tipo: 'andamento', nivel: 4, ordem: 4, ativa: true },
    { id: 'resolvido', nome: 'Resolvido', tipo: 'resolvido', nivel: null, ordem: 5, ativa: true },
    { id: 'fechado', nome: 'Fechado', tipo: 'fechado', nivel: null, ordem: 6, ativa: true },
  ],
  assuntos: [
    { id: 'ramal', paiId: null, nome: 'Ramal', ordem: 0, ativo: true },
    { id: 'ramal-conf', paiId: 'ramal', nome: 'Configuração', ordem: 0, ativo: true },
    { id: 'ramal-conf-cria', paiId: 'ramal-conf', nome: 'Criação', ordem: 0, ativo: true },
    { id: 'ramal-mudo', paiId: 'ramal', nome: 'Sem áudio', ordem: 1, ativo: true },
    { id: 'op', paiId: null, nome: 'Operadora', ordem: 1, ativo: true },
    { id: 'op-inc', paiId: 'op', nome: 'Incidente', ordem: 0, ativo: true },
  ],
  campos: [{ id: 'resp', nome: 'Responsabilidade', opcoes: [{ id: 'o-ing', nome: 'Ingline' }, { id: 'o-cli', nome: 'Cliente' }, { id: 'o-op', nome: 'Operadora' }, { id: 'o-for', nome: 'Fornecedor' }], ativo: true }],
  pessoas: new Map([['luan', 'Luan'], ['marina', 'Marina']]),
  clientes: new Map([
    ['aurora', { nome: 'Clínica Aurora', dids: 20, aparelhos: 10, produtos: ['PBX em nuvem'] }],
    ['norte', { nome: 'Distribuidora Norte', dids: 5, aparelhos: 4, produtos: [] }],
  ]),
  produtos: new Map([['pbx', 'PBX em nuvem']]),
  operadoras: new Map([['vivo', 'Vivo']]),
  prazos: AJUSTES_PRAZOS_PADRAO,
  campoDaFalha: null,
};

const passou = (etapas: Array<[string, string]>, fim: string | null) =>
  etapas.map(([etapaId, desde], i) => ({ etapaId, desde, ate: etapas[i + 1]?.[1] ?? fim }));

/**
 * Os chamados do exemplo (outubro de 2026, "agora" é quinta, 22/10, 15h). As contas esperadas estão
 * escritas ao lado de cada teste: o dia útil é das 8h às 18h (sábado até o meio-dia).
 */
const CHAMADOS: ChamadoParaRelatorios[] = [
  // segunda 05/10, 8h → resolvido às 10h (2 h úteis); só o N1; respondido em 10 min
  chamadoParaRelatorios({
    id: 'a1', codigo: 'SUP-1', etapaId: 'resolvido', situacao: 'resolvido', criadoEm: em('2026-10-05', '08:00'), respondidoEm: em('2026-10-05', '08:10'), resolvidoEm: em('2026-10-05', '10:00'),
    responsavelId: 'luan', clienteId: 'aurora', assuntoId: 'ramal-conf-cria', tipo: 'Configuração', gravidade: 'nao_se_aplica', prioridade: 'media',
    produtos: ['pbx'], campos: { resp: 'o-ing' }, temSolucao: true, temCausa: true,
    passagens: [...passou([['novo', em('2026-10-05', '08:00')], ['n1', em('2026-10-05', '08:10')], ['resolvido', em('2026-10-05', '10:00')]], null)],
    tempos: [{ minutos: 30, dia: '2026-10-05', pessoaId: 'luan' }],
  }),
  // segunda 05/10, 17h → terça, 9h (2 h úteis); subiu ao N2; esperou a operadora 1 h útil; protocolo cumprido depois do prometido
  chamadoParaRelatorios({
    id: 'a2', codigo: 'SUP-2', etapaId: 'resolvido', situacao: 'resolvido', criadoEm: em('2026-10-05', '17:00'), respondidoEm: em('2026-10-05', '17:20'), resolvidoEm: em('2026-10-06', '09:00'),
    responsavelId: 'marina', clienteId: 'aurora', assuntoId: 'ramal-mudo', tipo: 'Incidente', gravidade: 'inoperancia', prioridade: 'alta',
    operadoras: ['vivo'], campos: { resp: 'o-op' }, temSolucao: true, problemaId: 'p1',
    esperas: [{ tipo: 'operadora', motivo: null, inicio: em('2026-10-05', '17:30'), fim: em('2026-10-06', '08:30'), porId: 'luan' }],
    casos: [{ operadora: 'VIVO', abertoEm: em('2026-10-05', '17:30'), prometidoPara: em('2026-10-06', '08:00'), fechadoEm: em('2026-10-06', '08:30') }],
    passagens: passou([['novo', em('2026-10-05', '17:00')], ['n1', em('2026-10-05', '17:20')], ['n2', em('2026-10-05', '17:50')], ['resolvido', em('2026-10-06', '09:00')]], null),
    subidas: [{ em: em('2026-10-05', '17:50'), de: 1, para: 2, sentido: 'sobe', motivo: 'Precisa de acesso ao servidor', porId: 'luan' }],
    tempos: [{ minutos: 90, dia: '2026-10-06', pessoaId: 'marina' }],
  }),
  // quarta 07/10, 9h: aberto, ninguém pegou; crítica (resposta vencida); sem assunto
  chamadoParaRelatorios({ id: 'a3', codigo: 'SUP-3', etapaId: 'novo', criadoEm: em('2026-10-07', '09:00'), clienteId: 'norte', prioridade: 'critica', ultimaAtividadeEm: em('2026-10-07', '09:00') }),
  // terça 13/10, 10h: aberto no N2 (subiu às 11h), baixa (a solução venceu), parado desde o dia 13
  chamadoParaRelatorios({
    id: 'a4', codigo: 'SUP-4', etapaId: 'n2', criadoEm: em('2026-10-13', '10:00'), respondidoEm: em('2026-10-13', '10:05'), ultimaAtividadeEm: em('2026-10-13', '11:00'),
    responsavelId: 'luan', clienteId: 'aurora', assuntoId: 'ramal-conf', prioridade: 'baixa', problemaId: 'p1',
    passagens: passou([['novo', em('2026-10-13', '10:00')], ['n1', em('2026-10-13', '10:05')], ['n2', em('2026-10-13', '11:00')]], null),
    subidas: [{ em: em('2026-10-13', '11:00'), de: 1, para: 2, sentido: 'sobe', motivo: 'Defeito no aparelho', porId: 'luan' }],
    tempos: [{ minutos: 45, dia: '2026-10-13', pessoaId: 'luan' }],
  }),
  // terça 20/10, 10h → quarta, 10h (10 h úteis = 1 dia útil); o mesmo assunto do a1, 15 dias depois; reaberto; respondido em 3 h (fora do prazo)
  chamadoParaRelatorios({
    id: 'a5', codigo: 'SUP-5', etapaId: 'resolvido', situacao: 'resolvido', criadoEm: em('2026-10-20', '10:00'), respondidoEm: em('2026-10-20', '13:00'), resolvidoEm: em('2026-10-21', '10:00'),
    responsavelId: 'marina', clienteId: 'aurora', assuntoId: 'ramal-conf-cria', prioridade: 'media', temSolucao: true, temCausa: true, reaberto: 1, repete: ['a1'],
    passagens: passou([['novo', em('2026-10-20', '10:00')], ['n1', em('2026-10-20', '13:00')], ['resolvido', em('2026-10-21', '10:00')]], null),
  }),
  // o problema que junta o a2 e o a4 (fica fora das contas dos chamados)
  chamadoParaRelatorios({ id: 'p1', codigo: 'SUP-6', tipoChamado: 'problema', etapaId: 'n2', criadoEm: em('2026-10-06', '10:00'), prioridade: 'alta' }),
  // setembro (o período de comparação: 01 a 22/09)
  chamadoParaRelatorios({
    id: 'b1', codigo: 'SUP-7', etapaId: 'resolvido', situacao: 'resolvido', criadoEm: em('2026-09-08', '09:00'), respondidoEm: em('2026-09-08', '09:45'), resolvidoEm: em('2026-09-08', '11:00'),
    responsavelId: 'luan', clienteId: 'norte', assuntoId: 'op-inc', prioridade: 'alta',
    passagens: passou([['novo', em('2026-09-08', '09:00')], ['n1', em('2026-09-08', '09:45')], ['resolvido', em('2026-09-08', '11:00')]], null),
  }),
  chamadoParaRelatorios({
    id: 'b2', codigo: 'SUP-8', etapaId: 'resolvido', situacao: 'resolvido', criadoEm: em('2026-09-15', '09:00'), respondidoEm: em('2026-09-15', '09:30'), resolvidoEm: em('2026-09-17', '09:00'),
    responsavelId: 'luan', clienteId: 'aurora', assuntoId: 'ramal-mudo', prioridade: 'media',
    passagens: passou([['novo', em('2026-09-15', '09:00')], ['n1', em('2026-09-15', '09:30')], ['resolvido', em('2026-09-17', '09:00')]], null),
  }),
];

const OUTUBRO: FiltroDosRelatorios = { painel: 'sup', de: '2026-10-01', ate: '2026-10-22' };
const rel = (f: Partial<FiltroDosRelatorios> = {}, c: Partial<ContextoDosRelatorios> = {}) => relatoriosDoPainel(CHAMADOS, { ...ctx, ...c }, { ...OUTUBRO, ...f }, AGORA);

/** Todos os ids citados pelas peças (para conferir que a lista curta tem cada um). */
function idsCitados(r: RelatoriosDoPainel): Set<string> {
  const out = new Set<string>();
  const andar = (v: unknown, chave: string) => {
    if (Array.isArray(v)) {
      if (['ids', 'idsEntrou', 'idsSaiu', 'foraIds', 'idsSobem', 'ultimos'].includes(chave)) for (const x of v) if (typeof x === 'string') out.add(x);
      for (const x of v) andar(x, '');
    } else if (v && typeof v === 'object') {
      for (const [k, x] of Object.entries(v)) andar(x, chave === 'ids' ? 'ids' : k);
    }
  };
  for (const [k, v] of Object.entries(r)) if (k !== 'chamados' && k !== 'aplicaveis') andar(v, k);
  return out;
}

describe('o catálogo e a arrumação', () => {
  it('25 relatórios, cada um numa das 6 abas, sem repetir o id', () => {
    expect(CATALOGO_DOS_RELATORIOS).toHaveLength(25);
    expect(new Set(CATALOGO_DOS_RELATORIOS.map((r) => r.id)).size).toBe(25);
    expect(CATALOGO_DOS_RELATORIOS.filter((r) => r.novo).map((r) => r.id)).toEqual(['operadora', 'arvore', 'gravidade', 'problemas', 'tempogasto']);
  });
  it('a arrumação guardada passa a limpo: o id que não existe sai, o relatório novo entra no fim', () => {
    const a = arrumacaoCompleta({ ordem: ['relogio', 'xyz', 'prazo', 'relogio'], ocultos: ['xyz', 'calor'], favoritos: ['prazo'] });
    expect(a.ordem.slice(0, 2)).toEqual(['relogio', 'prazo']);
    expect(a.ordem).toHaveLength(25);
    expect(a.ocultos).toEqual(['calor']);
    expect(relatoriosDaAba('tempo', a).map((r) => r.id).slice(0, 3)).toEqual(['relogio', 'prazo', 'resposta']);
    expect(arrumacaoCompleta(null).campoDaFalha).toBeNull();
  });
  it('o painel sem assunto não mostra a aba Assuntos vazia; sem prazo, não mostra o Prazo cumprido', () => {
    const sem = relatoriosAplicaveis({ painel: { ...ctx.painel, contaPrazo: false, usa: { ...ctx.painel.usa, assunto: false } }, etapas: ctx.etapas });
    expect(sem).not.toContain('prazo');
    expect(sem).not.toContain('arvore');
    expect(sem).not.toContain('gravidade');
    expect(sem).toContain('pareto');
    expect(sem).toContain('escada');
    expect(relatoriosAplicaveis(ctx)).toHaveLength(25);
  });
  it('sem etapa de nível, sem a escada (seria "100% no N1"); sem operadora, sem a espera pela operadora', () => {
    const semNivel = relatoriosAplicaveis({ painel: { ...ctx.painel, usa: { ...ctx.painel.usa, operadoras: false } }, etapas: ctx.etapas.map((e) => ({ ...e, nivel: null })) });
    expect(semNivel).not.toContain('escada');
    expect(semNivel).not.toContain('operadora');
    expect(semNivel).toHaveLength(23);
    // a etapa de nível que saiu do painel ainda vale (os chamados passaram por ela)
    expect(relatoriosAplicaveis({ painel: ctx.painel, etapas: ctx.etapas.map((e) => ({ ...e, ativa: e.nivel === null })) })).toContain('escada');
  });
});

describe('o tempo em horas úteis', () => {
  it('o dia útil é o dia de atendimento (10 h no horário de fábrica)', () => {
    expect(horasDoDiaUtil(AJUSTES_PRAZOS_PADRAO.calendario)).toBe(10);
    expect(duracaoUtil(25)).toBe('25 min');
    expect(duracaoUtil(220)).toBe('3 h 40');
    expect(duracaoUtil(600)).toBe('1 d');
    expect(duracaoUtil(1560)).toBe('2 d 6 h');
    expect(duracaoUtil(null)).toBe('—');
  });
  it('o período padrão é de 30 dias até hoje; "de" depois de "até" vira um dia só', () => {
    expect(periodoDosRelatorios({}, AGORA)).toEqual({ de: '2026-09-23', ate: '2026-10-22' });
    expect(periodoDosRelatorios({ de: '2026-10-10', ate: '2026-10-01' }, AGORA)).toEqual({ de: '2026-10-01', ate: '2026-10-01' });
    const atalhos = atalhosDosRelatorios(AGORA, '2026-09-08');
    expect(atalhos.find((a) => a.id === 'anterior')).toMatchObject({ de: '2026-09-01', ate: '2026-09-30' });
    expect(atalhos.find((a) => a.id === 'tudo')).toMatchObject({ de: '2026-09-08', ate: '2026-10-22' });
  });
  it('os filtros chegam do endereço como texto', () => {
    expect(FiltroDosRelatoriosSchema.parse({ painel: 'sup', nivel: '2', nivelSobe: '1' })).toMatchObject({ nivel: 2, nivelSobe: 1 });
    expect(() => FiltroDosRelatoriosSchema.parse({ painel: 'sup', de: '22/10/2026' })).toThrow();
    expect(() => FiltroDosRelatoriosSchema.parse({ painel: 'sup', de: '2026-10-22', ate: '2026-10-01' })).toThrow('O fim do período vem depois do começo.');
  });
});

describe('os relatórios do painel (outubro, até o dia 22)', () => {
  const r = rel();

  it('o problema fica fora das contas dos chamados; o período de comparação é o mesmo de setembro', () => {
    expect(r.noRecorte).toBe(7);
    expect(r.periodo).toMatchObject({ de: '2026-10-01', ate: '2026-10-22', dias: 22, anterior: { de: '2026-09-01', ate: '2026-09-22' } });
    expect(r.primeiroDia).toBe('2026-09-08');
    expect(r.horasDoDia).toBe(10);
  });

  it('cada número clicável tem os seus chamados na lista curta', () => {
    const citados = idsCitados(r);
    const naLista = new Set(r.chamados.map((c) => c.id));
    expect(citados.size).toBeGreaterThan(0);
    for (const id of citados) expect(naLista.has(id)).toBe(true);
    expect(r.chamados.find((c) => c.id === 'a1')).toMatchObject({ codigo: 'SUP-1', assunto: 'Ramal › Configuração › Criação', cliente: 'Clínica Aurora', etapa: 'Resolvido' });
  });

  it('Prazo cumprido: a resposta do a5 passou do prazo; os vencidos agora são o a3 e o a4', () => {
    expect(r.prazo.resolvidos).toBe(3);
    expect(r.prazo.resposta).toMatchObject({ comPrazo: 3, noPrazo: 2, pct: 67, antes: 50, foraIds: ['a5'] });
    expect(r.prazo.solucao).toMatchObject({ comPrazo: 3, noPrazo: 3, pct: 100, antes: 100 });
    expect(r.prazo.vencidosAgora.ids.sort()).toEqual(['a3', 'a4']);
    expect(r.prazo.porPrioridade.map((l) => [l.prioridade, l.resolvidos])).toEqual([['critica', 0], ['alta', 1], ['media', 2], ['baixa', 0]]);
  });

  it('Relógio: mediana de 2 h úteis, 9 em 10 em até 1 dia útil, contra 11 h em setembro', () => {
    expect(r.relogio).toMatchObject({ resolvidos: 3, mediana: 120, p90: 600, ate4h: 2, antes: { resolvidos: 2, mediana: 660 } });
    expect(r.relogio.faixas.map((f) => f.n)).toEqual([0, 2, 1, 0, 0, 0]);
    expect(r.relogio.separado).toMatchObject([{ rotulo: 'Ramal', n: 3, mediana: 120 }]);
    expect(rel({ separar: 'responsavel' }).relogio.separado.map((l) => [l.rotulo, l.n, l.mediana])).toEqual([['Marina', 2, 360], ['Luan', 1, 120]]);
  });

  it('Primeira resposta: mediana de 15 min; o a3 esperando desde o dia 7', () => {
    expect(r.resposta).toMatchObject({ respondidos: 4, mediana: 15, ate1h: 3, foraDoHorario: 0 });
    expect(r.resposta.esperando.ids).toEqual(['a3']);
    expect(r.resposta.esperando.maisAntigo?.codigo).toBe('SUP-3');
  });

  it('A escada: o N1 resolve 2 de 3; o a2 subiu ao N2 e foi resolvido lá', () => {
    expect(r.escada.resolvidos).toBe(3);
    expect(r.escada.degraus.map((d) => [d.nome, d.entram, d.resolvem, d.sobem, d.pct])).toEqual([['N1', 3, 2, 1, 67], ['N2', 1, 1, 0, 33], ['N3', 0, 0, 0, 0], ['DEV', 0, 0, 0, 0]]);
    expect(r.escada.motivos.map((m) => [m.codigo, m.de, m.para, m.motivo])).toEqual([['SUP-4', 'N1', 'N2', 'Defeito no aparelho'], ['SUP-2', 'N1', 'N2', 'Precisa de acesso ao servidor']]);
    expect(r.escada.antesN1).toBe(100);
  });

  it('Onde empaca: o N1 é a etapa mais lenta; o a4 está parado no N2', () => {
    const n1 = r.empaca.etapas.find((e) => e.id === 'n1')!;
    expect(n1).toMatchObject({ passagens: 4, mediana: 82.5 });
    expect(r.empaca.etapas.find((e) => e.id === 'novo')).toMatchObject({ passagens: 4, mediana: 15 });
    expect(r.empaca.etapas.find((e) => e.id === 'n2')!.paradosAgora.ids).toEqual(['a4']);
    expect(r.empaca.maisLenta).toBe('n1');
  });

  it('A prioridade: só uma prioridade com 2 resolvidos não dá para responder', () => {
    expect(r.prioridade.resposta).toBeNull();
    expect(r.prioridade.linhas.find((l) => l.prioridade === 'media')).toMatchObject({ resolvidos: 2, mediana: 360 });
    expect(r.prioridade.linhas.find((l) => l.prioridade === 'critica')!.abertos.ids).toEqual(['a3']);
  });

  it('Esperando a operadora: metade do tempo do a2 foi espera pela operadora, que fechou depois do prometido', () => {
    expect(r.operadora).toMatchObject({ chamados: 1, pctEspera: 50 });
    expect(r.operadora.linhas).toMatchObject([{ nome: 'VIVO', chamados: 1, esperaMediana: 60, partes: { trabalhando: 50, operadora: 50, cliente: 0 }, casos: 1, prometido: { cumprido: 0, total: 1, foraIds: ['a2'] } }]);
    expect(r.operadora.passouDoPrometido.ids).toEqual(['a2']);
    // em setembro a Vivo não tem nada (o protocolo é de outubro): sem linha de zeros
    expect(rel({ de: '2026-09-01', ate: '2026-09-30' }).operadora.linhas).toEqual([]);
  });

  it('Entrada × saída: por semana, com a fila no fim de cada uma', () => {
    expect(r.fila.por).toBe('semana');
    expect(r.fila.pontos.map((p) => [p.id, p.entrou, p.saiu, p.fila])).toEqual([['2026-09-28', 0, 0, 0], ['2026-10-05', 3, 2, 1], ['2026-10-12', 1, 0, 2], ['2026-10-19', 1, 1, 2]]);
    expect(r.fila).toMatchObject({ entrou: 5, saiu: 3, filaHoje: { n: 2 }, saldoRecente: { n: 2, pontos: 4 } });
  });

  it('Idade da fila: o a4 com 9 dias, o a3 com 15', () => {
    expect(r.idade.abertos).toBe(2);
    expect(r.idade.faixas.map((f) => f.n)).toEqual([0, 0, 0, 1, 1, 0]);
    expect(r.idade.medianaDias).toBe(12.2);
    expect(r.idade.maisAntigo).toMatchObject({ codigo: 'SUP-3', dias: 15 });
  });

  it('Mapa de calor: terça às 10h é o pico; nada fora do horário', () => {
    expect(r.calor.n).toBe(5);
    expect(r.calor.pico).toEqual({ dia: 1, hora: 10, n: 2 });
    expect(r.calor.ids['1-10']!.sort()).toEqual(['a4', 'a5']);
    expect(r.calor.ocorrencias).toEqual([3, 3, 3, 4, 3, 3, 3]);
    // o sábado de fábrica vem fechado (com o horário das 8h ao meio-dia pronto para ligar)
    expect(r.calor.horario[0]).toEqual({ abre: true, de: 8, ate: 18 });
    expect(r.calor.horario[5]).toEqual({ abre: false, de: 8, ate: 12 });
    expect(r.calor.horario[6]!.abre).toBe(false);
  });

  it('Previsão: as 5 semanas completas desde o primeiro chamado', () => {
    expect(r.previsao.semanas).toBe(5);
    expect(r.previsao.dias.map((d) => d.media).slice(0, 3)).toEqual([0.4, 0.4, 0.2]);
    expect(r.previsao.semanaAtual).toEqual({ de: '2026-10-19', ateHoje: 1, esperadoAteHoje: 1 });
    expect(r.curva.picos).toEqual([]);
  });

  it('Os assuntos: o pai soma os filhos; o sem assunto à parte', () => {
    expect(r.arvore.chegaram).toBe(5);
    expect(r.arvore.semAssunto).toMatchObject({ n: 1, ids: ['a3'], abertos: 1 });
    const ramal = r.arvore.raiz[0]!;
    expect(ramal).toMatchObject({ nome: 'Ramal', n: 4, abertos: 1, resolvidos: 3, mediana: 120, noPrazo: 3, comPrazo: 3 });
    expect(ramal.filhos.map((f) => [f.nome, f.n])).toEqual([['Configuração', 3], ['Sem áudio', 1]]);
    expect(ramal.filhos[0]!.filhos.map((f) => [f.nome, f.n])).toEqual([['Criação', 2]]);
    expect(r.arvore.raiz).toHaveLength(1);
  });

  it('Sobe e desce: Ramal subiu 3, Operadora caiu 1', () => {
    expect(r.sobe.subiram.map((x) => [x.rotulo, x.agora, x.antes])).toEqual([['Ramal', 4, 1]]);
    expect(r.sobe.cairam.map((x) => [x.rotulo, x.agora, x.antes])).toEqual([['Operadora', 0, 1]]);
    expect(r.sobe.semComparacao).toBe(false);
    expect(rel({ nivelSobe: 2 }).sobe.subiram.map((x) => x.rotulo)).toEqual(['Ramal › Configuração']);
  });

  it('A gravidade e os poucos que pesam muito', () => {
    expect(r.gravidade).toMatchObject({ total: 2, semGravidade: { n: 3 }, inoperancias: { n: 1, topo: { rotulo: 'Ramal', n: 1 } }, pedidos: 1 });
    expect(r.gravidade.linhas[0]!.celulas.map((c) => c.n)).toEqual([1, 0, 0, 0, 1]);
    expect(r.pareto).toMatchObject({ por: 'assunto1', total: 4, k80: 1, distintos: 1, naoPreenchido: { n: 1 } });
    expect(rel({ pareto: 'cliente' }).pareto.itens.map((x) => [x.rotulo, x.n, x.somando])).toEqual([['Clínica Aurora', 4, 80], ['Distribuidora Norte', 1, 100]]);
  });

  it('Os problemas: o p1 junta o a2 e o a4, e ainda não tem a causa', () => {
    expect(r.problemas.abertos).toMatchObject([{ codigo: 'SUP-6', incidentes: { n: 2 }, temCausa: false }]);
    expect(r.problemas.incidentesNoPeriodo.ids.sort()).toEqual(['a2', 'a4']);
    expect(r.problemas.semCausa).toBe(1);
  });

  it('Clientes: o raio-X, o tamanho e quem voltou com o mesmo assunto', () => {
    expect(r.clientes.lista).toEqual([{ id: 'aurora', nome: 'Clínica Aurora', n: 4 }, { id: 'norte', nome: 'Distribuidora Norte', n: 1 }]);
    expect(r.clientes.raiox).toBeNull();
    const rx = rel({ raiox: 'aurora' }).clientes.raiox!;
    // voltaram 2: a Criação (a1 e a5) e o Sem áudio (o b2 de setembro e o a2, 20 dias depois)
    expect(rx).toMatchObject({ nome: 'Clínica Aurora', chamados: { n: 4 }, mediana: 120, abertos: { ids: ['a4'] }, voltaram: 2, dids: 20 });
    expect(rx.meses.at(-1)).toMatchObject({ mes: '2026-10', n: 4 });
    expect(r.tamanho.linhas.map((l) => [l.nome, l.n, l.por10Dids, l.por10Aparelhos])).toEqual([['Clínica Aurora', 4, 2, 4], ['Distribuidora Norte', 1, 2, 2.5]]);
    expect(r.voltou.linhas).toMatchObject([
      { cliente: 'Clínica Aurora', assunto: 'Ramal › Configuração › Criação', n: 2, menorIntervalo: 15, ids: ['a1', 'a5'] },
      { cliente: 'Clínica Aurora', assunto: 'Ramal › Sem áudio', n: 2, menorIntervalo: 20, ids: ['b2', 'a2'] },
    ]);
    // a volta conta no período em que aconteceu (a de outubro não aparece em setembro)
    expect(rel({ de: '2026-10-21', ate: '2026-10-22' }).voltou.linhas).toHaveLength(0);
    expect(rel({ de: '2026-09-01', ate: '2026-09-30' }).voltou.linhas).toHaveLength(0);
    expect(r.voltou.linhas.map((l) => l.voltas)).toEqual([1, 1]);
    expect(r.voltou.repetem.ids).toEqual(['a5']);
    expect(r.voltou.reabertos.ids).toEqual(['a5']);
  });

  it('De quem é a falha: o campo "Responsabilidade" é achado pelo nome; conta os resolvidos no período', () => {
    expect(r.falha.campo).toEqual({ id: 'resp', nome: 'Responsabilidade', automatico: true });
    // resolvidos em outubro: a1 (Ingline), a2 (Operadora) e a5 (sem resposta); os abertos (a3, a4) ainda não responderam
    expect(r.falha.total).toBe(3);
    expect(r.falha.porOpcao.map((o) => [o.nome, o.n, o.pct])).toEqual([['Ingline', 1, 33], ['Operadora', 1, 33]]);
    expect(r.falha.semResposta.ids).toEqual(['a5']);
    // os meses, pelo mês da solução: setembro tem os dois de lá, sem resposta
    expect(r.falha.meses.slice(-2).map((m) => [m.mes, m.porOpcao, m.semResposta])).toEqual([['2026-09', [0, 0], 2], ['2026-10', [1, 1], 1]]);
    expect(campoDaFalha([...ctx.campos, { id: 'x', nome: 'Canal', opcoes: [], ativo: true }], 'x')).toEqual({ id: 'x', nome: 'Canal', automatico: false });
    expect(campoDaFalha([{ id: 'x', nome: 'Canal', opcoes: [], ativo: true }], null)).toBeNull();
  });

  it('A equipe, o tempo gasto e o chamado bem preenchido', () => {
    expect(r.equipe.linhas.map((l) => [l.nome, l.emAberto.n, l.vencidos.n, l.parados.n, l.resolvidos.n, l.mediana, l.escalonou])).toEqual([
      ['Luan', 1, 1, 1, 1, 120, 2], ['Marina', 0, 0, 0, 2, 360, 0], ['Sem responsável', 1, 1, 1, 0, null, 0],
    ]);
    expect(r.equipe.semanas).toHaveLength(8);
    expect(r.tempogasto).toMatchObject({ minutos: 165, lancamentos: 3 });
    expect(r.tempogasto.porPessoa.map((x) => [x.nome, x.minutos])).toEqual([['Marina', 90], ['Luan', 75]]);
    expect(r.tempogasto.maiores.map((x) => x.codigo)).toEqual(['SUP-2', 'SUP-4', 'SUP-1']);
    expect(r.preenchido.completos.ids).toEqual(['a1']);
    expect(r.preenchido.campos.map((c) => [c.campo, c.pct])).toEqual([['assunto', 100], ['tipo', 67], ['gravidade', 67], ['produtos', 33], ['causa', 67], ['solucao', 100]]);
  });

  it('Fechamento do mês: o padrão é o mês passado; outubro contra setembro', () => {
    expect(r.fechamento.mes).toBe('2026-09');
    expect(r.fechamento.meses.map((m) => m.mes)).toEqual(['2026-10', '2026-09']);
    expect(r.fechamento).toMatchObject({ chegaram: { agora: 2, antes: null }, resolvidos: { agora: 2 }, mediana: { agora: 660 }, prazo: { agora: 100 } });
    const out = rel({ mes: '2026-10' }).fechamento;
    expect(out).toMatchObject({ chegaram: { agora: 5, antes: 2 }, resolvidos: { agora: 3, antes: 2 }, mediana: { agora: 120, antes: 660 }, filaNoFim: { agora: 2, antes: 0 } });
    expect(out.destaques[0]).toBe('Chegaram 5 chamados, 3 a mais que em setembro (150%).');
    expect(out.destaques).toContain('A mediana até resolver caiu de 1 d 1 h para 2 h úteis.');
  });
});

describe('os filtros', () => {
  it('o assunto leva os de baixo', () => {
    expect(rel({ assunto: 'ramal-conf' }).arvore.chegaram).toBe(3);
    expect(rel({ assunto: 'ramal' }).noRecorte).toBe(5);
  });
  it('o nível é até onde o chamado subiu', () => {
    expect(rel({ nivel: 2 }).fila.entrou).toBe(2);
    expect(rel({ nivel: 1 }).fila.entrou).toBe(2);
  });
  it('responsável, campo e prioridade (com "sem")', () => {
    expect(rel({ responsavel: 'ninguem' }).fila.entrou).toBe(1);
    expect(rel({ campo: 'resp:o-op' }).fila.entrou).toBe(1);
    expect(rel({ campo: 'resp:' }).fila.entrou).toBe(3);
    expect(rel({ prioridade: 'sem' }).noRecorte).toBe(0);
    expect(rel({ cliente: 'norte' }).noRecorte).toBe(2);
  });
  it('o painel que não conta prazo não tem prazo nenhum', () => {
    const r = rel({}, { painel: { ...ctx.painel, contaPrazo: false } });
    expect(r.prazo.resposta.comPrazo).toBe(0);
    expect(r.prazo.vencidosAgora.n).toBe(0);
    expect(r.aplicaveis).not.toContain('prazo');
  });
});
