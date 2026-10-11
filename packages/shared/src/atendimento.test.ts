import { describe, expect, it } from 'vitest';
import {
  AJUSTES_PRAZOS_PADRAO, ajustesPrazosCompletos, alertasDevidos, estadoDosPrazos, instanteLocal, minutosUteisEntre, NOME_SITUACAO_PRAZO, prioridadeSugerida, proximaExecucao,
  somarDiasUteis, somarMinutosUteis, textoDaRegra, textoDoPrazo, type AjustesPrazos, type Calendario, type RegraAgendado,
} from './atendimento-prazos.js';
import {
  caminhoDoAssunto, csvDosChamados, emOrdemDeArvore, etapaAoAssumir, etapaDeEntrada, faltaParaEtapa, filhosQueTravam, filtrarCartoes, grafoDeLigacoes,
  lerCodigo, lerListaDeAssuntos, lerMensagemDoLineChat, lerSugestaoDaIa, mensagemDoQueFalta, movimentoDeNivel, ordenarCartoes, pareceAgradecimento,
  pedacosComReferencias, preencherModelo, referenciasNoTexto, textoDeBusca, textoDoEvento, trajetoria, linkDaConversa,
  type CartaoChamado, type CartaoParaLista, type DadosObrigatorios, type EtapaPainel, type NoParaGrafo,
} from './atendimento.js';

const em = (dia: string, hora: string) => instanteLocal(dia, hora);
const cal: Calendario = AJUSTES_PRAZOS_PADRAO.calendario;
const ajustes: AjustesPrazos = AJUSTES_PRAZOS_PADRAO;

describe('as horas úteis', () => {
  it('sexta no fim do dia até segunda: o fim de semana e o feriado de 12/10 não contam', () => {
    // 09/10/2026 é sexta; 12/10 é segunda e feriado (sem atendimento)
    expect(minutosUteisEntre(em('2026-10-09', '17:00'), em('2026-10-12', '09:00'), cal)).toBe(60);
    expect(minutosUteisEntre(em('2026-10-09', '17:00'), em('2026-10-13', '09:00'), cal)).toBe(120);
  });
  it('num feriado com atendimento, conta normal', () => {
    const comAtendimento: Calendario = { ...cal, feriados: cal.feriados.map((f) => (f.data === '2026-10-12' ? { ...f, atende: true } : f)) };
    expect(minutosUteisEntre(em('2026-10-09', '17:00'), em('2026-10-12', '09:00'), comAtendimento)).toBe(120);
  });
  it('somar pula a noite, o fim de semana e o feriado', () => {
    expect(somarMinutosUteis(em('2026-10-09', '17:30'), 60, cal).toISOString()).toBe(em('2026-10-13', '08:30').toISOString());
    expect(somarMinutosUteis(em('2026-10-13', '07:00'), 30, cal).toISOString()).toBe(em('2026-10-13', '08:30').toISOString());
  });
  it('três dias úteis depois de uma sexta: a quarta (a segunda é feriado)', () => {
    expect(somarDiasUteis(em('2026-10-09', '15:00'), 3, cal).toISOString()).toBe(em('2026-10-15', '15:00').toISOString());
  });
  it('calendário sem nenhum dia aberto conta corrido (nenhum prazo fica parado para sempre)', () => {
    const fechado: Calendario = { horario: cal.horario.map((h) => ({ ...h, abre: false })), feriados: [] };
    expect(minutosUteisEntre(em('2026-10-13', '09:00'), em('2026-10-13', '10:00'), fechado)).toBe(60);
  });
});

describe('os prazos do chamado', () => {
  const base = { criadoEm: em('2026-10-13', '09:00').toISOString(), prioridade: 'alta' as const, respondidoEm: null, resolvidoEm: null, esperas: [], contaPrazo: true };
  it('no prazo, perto de vencer e vencido (a resposta da Alta é 30 min)', () => {
    expect(estadoDosPrazos(base, ajustes, em('2026-10-13', '09:20')).resposta).toMatchObject({ situacao: 'no_prazo', usado: 20, venceEm: em('2026-10-13', '09:30').toISOString() });
    expect(estadoDosPrazos(base, ajustes, em('2026-10-13', '09:25')).resposta.situacao).toBe('perto');
    expect(estadoDosPrazos(base, ajustes, em('2026-10-13', '09:40')).resposta.situacao).toBe('vencido');
  });
  it('esperando o cliente, o prazo de solução para; esperando a operadora, continua', () => {
    const esperas = [{ tipo: 'cliente' as const, motivo: 'testar', inicio: em('2026-10-13', '10:00').toISOString(), fim: em('2026-10-13', '12:00').toISOString(), porId: null }];
    expect(estadoDosPrazos({ ...base, esperas }, ajustes, em('2026-10-13', '14:00')).solucao.usado).toBe(180);
    const operadora = [{ ...esperas[0]!, tipo: 'operadora' as const }];
    expect(estadoDosPrazos({ ...base, esperas: operadora }, ajustes, em('2026-10-13', '14:00')).solucao.usado).toBe(300);
  });
  it('com a espera aberta, fica "parado" (sem hora para vencer)', () => {
    const esperas = [{ tipo: 'cliente' as const, motivo: null, inicio: em('2026-10-13', '10:00').toISOString(), fim: null, porId: null }];
    const s = estadoDosPrazos({ ...base, esperas }, ajustes, em('2026-10-13', '15:00')).solucao;
    expect(s).toMatchObject({ situacao: 'pausado', usado: 60, venceEm: null });
    expect(textoDoPrazo(s)).toBe('Parado: faltam 7 h úteis');
  });
  it('respondido a tempo é cumprido; depois, estourou', () => {
    expect(estadoDosPrazos({ ...base, respondidoEm: em('2026-10-13', '09:10').toISOString() }, ajustes, em('2026-10-13', '11:00')).resposta.situacao).toBe('cumprido');
    expect(estadoDosPrazos({ ...base, respondidoEm: em('2026-10-13', '09:45').toISOString() }, ajustes, em('2026-10-13', '11:00')).resposta.situacao).toBe('estourou');
  });
  it('sem prioridade, ou num painel que não conta prazo, não há prazo', () => {
    expect(estadoDosPrazos({ ...base, prioridade: null }, ajustes).solucao.situacao).toBe('sem');
    expect(estadoDosPrazos({ ...base, contaPrazo: false }, ajustes).resposta.situacao).toBe('sem');
  });
  it('os alertas saem uma vez: o perto, e depois o vencido', () => {
    const perto = estadoDosPrazos(base, ajustes, em('2026-10-13', '09:25'));
    expect(alertasDevidos(perto, {})).toEqual(['resposta_perto']);
    expect(alertasDevidos(perto, { resposta_perto: 'x' })).toEqual([]);
    const vencido = estadoDosPrazos(base, ajustes, em('2026-10-13', '09:40'));
    expect(alertasDevidos(vencido, { resposta_perto: 'x' })).toEqual(['resposta_vencida']);
  });
  it('os ajustes guardados antes de um campo novo ganham o padrão', () => {
    const v = ajustesPrazosCompletos({ alertaPercentual: 70 } as Partial<AjustesPrazos>);
    expect(v.alertaPercentual).toBe(70);
    expect(v.prazos.critica.resposta).toBe(15);
    expect(v.matriz.inoperancia.empresa).toBe('critica');
  });
});

describe('a prioridade sugerida', () => {
  it('a gravidade cruzada com o alcance', () => {
    expect(prioridadeSugerida('inoperancia', 'empresa')).toBe('critica');
    expect(prioridadeSugerida('intermitencia', 'pessoa')).toBe('media');
    expect(prioridadeSugerida('nao_se_aplica', 'empresa')).toBe('baixa');
    expect(prioridadeSugerida('inoperancia', null)).toBeNull();
  });
});

describe('o chamado agendado', () => {
  const regra = (r: Partial<RegraAgendado>): RegraAgendado => ({ frequencia: 'diaria', hora: '09:00', dias: [], diaDoMes: null, data: null, soDiasDeAtendimento: false, ...r });
  it('toda segunda e quinta', () => {
    expect(proximaExecucao(regra({ frequencia: 'semanal', dias: [1, 4] }), em('2026-10-13', '10:00'))?.toISOString()).toBe(em('2026-10-15', '09:00').toISOString());
    expect(textoDaRegra(regra({ frequencia: 'semanal', dias: [4, 1] }))).toBe('Toda segunda e quinta às 09:00');
  });
  it('todo dia 31 cai no último dia do mês curto', () => {
    expect(proximaExecucao(regra({ frequencia: 'mensal', diaDoMes: 31 }), em('2026-11-05', '10:00'))?.toISOString()).toBe(em('2026-11-30', '09:00').toISOString());
  });
  it('todo dia de atendimento pula o fim de semana e o feriado', () => {
    expect(proximaExecucao(regra({ soDiasDeAtendimento: true }), em('2026-10-09', '19:00'), cal)?.toISOString()).toBe(em('2026-10-13', '09:00').toISOString());
  });
  it('uma vez, depois que passou, não volta', () => {
    expect(proximaExecucao(regra({ frequencia: 'uma_vez', data: '2026-10-01' }), em('2026-10-13', '10:00'))).toBeNull();
  });
});

const etapas: EtapaPainel[] = [
  { id: 'novo', nome: 'Novo', tipo: 'entrada', nivel: null, obrigatorios: [], avisar: [] },
  { id: 'n1', nome: 'N1', tipo: 'andamento', nivel: 1, obrigatorios: ['cliente', 'relato'], avisar: [] },
  { id: 'n2', nome: 'N2', tipo: 'andamento', nivel: 2, obrigatorios: ['cliente', 'relato', 'assunto'], avisar: [] },
  { id: 'res', nome: 'Resolvido', tipo: 'resolvido', nivel: null, obrigatorios: ['solucao', 'causa'], avisar: [] },
  { id: 'fec', nome: 'Fechado', tipo: 'fechado', nivel: null, obrigatorios: ['solucao', 'causa', 'checklist'], avisar: [] },
];
const dados = (d: Partial<DadosObrigatorios> = {}): DadosObrigatorios => ({
  tipoChamado: 'chamado', clienteId: 'c1', contatoNome: null, contatoTelefone: null, relato: 'Ramal mudo', descricao: null, assuntoId: null, tipo: null,
  gravidade: null, alcance: null, prioridade: null, produtos: [], operadoras: [], afetados: [], responsavelId: null, solucao: null, causa: null, validacao: null,
  checklist: [], tempoMinutos: 0, ...d,
});

describe('as etapas', () => {
  it('o que falta para entrar em cada etapa', () => {
    expect(faltaParaEtapa(dados(), etapas[1]!)).toEqual([]);
    expect(faltaParaEtapa(dados(), etapas[2]!)).toEqual(['assunto']);
    expect(faltaParaEtapa(dados({ solucao: '  ' }), etapas[3]!)).toEqual(['solucao', 'causa']);
    expect(mensagemDoQueFalta(['solucao', 'causa'], 'Resolvido')).toBe('Para ir para Resolvido, falta preencher: Solução e Causa.');
  });
  it('o checklist só trava com item por marcar', () => {
    const item = { id: 'i', texto: 'Testar o ramal', feito: false, porId: null, em: null, doAssunto: true };
    expect(faltaParaEtapa(dados({ solucao: 'ok', causa: 'cabo', checklist: [item] }), etapas[4]!)).toEqual(['checklist']);
    expect(faltaParaEtapa(dados({ solucao: 'ok', causa: 'cabo', checklist: [{ ...item, feito: true }] }), etapas[4]!)).toEqual([]);
  });
  it('o problema só resolve com causa, solução e validação, em qualquer painel', () => {
    expect(faltaParaEtapa(dados({ tipoChamado: 'problema' }), { tipo: 'resolvido', obrigatorios: [] })).toEqual(['solucao', 'causa', 'validacao']);
  });
  it('o pai espera os filhos: para resolver, resolvidos; para fechar, fechados', () => {
    const filhos = [{ codigo: 'DEV-3', situacao: 'aberto' as const }, { codigo: 'SUP-9', situacao: 'resolvido' as const }];
    expect(filhosQueTravam(filhos, { tipo: 'resolvido' }, true)).toEqual(['DEV-3']);
    expect(filhosQueTravam(filhos, { tipo: 'fechado' }, true)).toEqual(['DEV-3', 'SUP-9']);
    expect(filhosQueTravam(filhos, { tipo: 'andamento' }, true)).toEqual([]);
    expect(filhosQueTravam(filhos, { tipo: 'fechado' }, false)).toEqual([]);
  });
  it('escalonar é subir de nível; voltar é descer', () => {
    expect(movimentoDeNivel(etapas[1], etapas[2])).toBe('sobe');
    expect(movimentoDeNivel(etapas[2], etapas[1])).toBe('desce');
    expect(movimentoDeNivel(etapas[2], etapas[3])).toBeNull();
  });
  it('a entrada e o "Assumir" (da entrada para a primeira etapa de andamento)', () => {
    expect(etapaDeEntrada(etapas)?.id).toBe('novo');
    expect(etapaAoAssumir(etapas, 'novo')?.id).toBe('n1');
    expect(etapaAoAssumir(etapas, 'n1')).toBeNull();
  });
});

describe('o cliente respondeu ao Resolvido', () => {
  it('agradecer ou confirmar não reabre', () => {
    for (const t of ['Obrigado!', 'ok, funcionou 👍', 'Valeu, deu certo', 'blz', '👍', 'boa tarde, obrigada pela ajuda', 'pode fechar']) expect(pareceAgradecimento(t), t).toBe(true);
  });
  it('qualquer outra coisa reabre (na dúvida, reabre)', () => {
    for (const t of ['ainda está caindo', 'obrigado, mas continua sem áudio', 'funcionou?', 'o ramal 203 voltou a ficar mudo']) expect(pareceAgradecimento(t), t).toBe(false);
  });
});

describe('o código e as referências no texto', () => {
  it('lê o código de vários jeitos', () => {
    expect(lerCodigo('sup-12')).toEqual({ sigla: 'SUP', numero: 12 });
    expect(lerCodigo('SUP 12')).toEqual({ sigla: 'SUP', numero: 12 });
    expect(lerCodigo('12')).toBeNull();
  });
  it('acha os códigos do Gestor e os do LineChat antigo', () => {
    expect(referenciasNoTexto('Ver SUP-12 e IS-4280; sup-3 não; SUP-12 de novo', 'DEV-4')).toEqual(['SUP-12', 'IS-4280', 'DEV-4']);
    expect(pedacosComReferencias('Igual ao SUP-12.')).toEqual([{ texto: 'Igual ao ' }, { codigo: 'SUP-12' }, { texto: '.' }]);
  });
});

describe('os assuntos', () => {
  it('a lista colada vira árvore (recuo, caminho e descrição)', () => {
    const lista = lerListaDeAssuntos('Ramal\n  Configuração — mudar nome, senha\n  Sem áudio\nOperadora > DID Entrada > Canais\n\n- Fortics');
    expect(lista).toEqual([
      { caminho: [], nome: 'Ramal', descricao: null },
      { caminho: ['Ramal'], nome: 'Configuração', descricao: 'mudar nome, senha' },
      { caminho: ['Ramal'], nome: 'Sem áudio', descricao: null },
      { caminho: [], nome: 'Operadora', descricao: null },
      { caminho: ['Operadora'], nome: 'DID Entrada', descricao: null },
      { caminho: ['Operadora', 'DID Entrada'], nome: 'Canais', descricao: null },
      { caminho: [], nome: 'Fortics', descricao: null },
    ]);
  });
  it('a lista da equipe, escrita com " - ", entra como está (e o 4º nível junta no 3º)', () => {
    const lista = lerListaDeAssuntos('Ramal - Configuração - Identidade\nRamal - Configuração - Criação\nRelatórios - LineReports - Configuração - Ativação\nZ-API - Instabilidade');
    expect(lista.map((x) => [...x.caminho, x.nome].join(' › '))).toEqual([
      'Ramal', 'Ramal › Configuração', 'Ramal › Configuração › Identidade', 'Ramal › Configuração › Criação',
      'Relatórios', 'Relatórios › LineReports', 'Relatórios › LineReports › Configuração - Ativação', 'Z-API', 'Z-API › Instabilidade',
    ]);
  });
  it('o caminho inteiro e a ordem de árvore', () => {
    const a = [
      { id: 'b', paiId: 'a', nome: 'Configuração', ordem: 2 }, { id: 'a', paiId: null, nome: 'Ramal', ordem: 1 },
      { id: 'c', paiId: 'b', nome: 'Senha', ordem: 1 }, { id: 'd', paiId: null, nome: 'Fortics', ordem: 0 },
    ];
    expect(caminhoDoAssunto('c', a)).toBe('Ramal › Configuração › Senha');
    expect(emOrdemDeArvore(a).map((x) => `${x.profundidade}:${x.nome}`)).toEqual(['1:Fortics', '1:Ramal', '2:Configuração', '3:Senha']);
  });
});

describe('as ligações num desenho', () => {
  const no = (id: string, d: Partial<NoParaGrafo> = {}): NoParaGrafo => ({ id, codigo: id.toUpperCase(), titulo: id, situacao: 'aberto', tipoChamado: 'chamado', paiId: null, problemaId: null, ...d });
  it('até dois passos do chamado, com o tipo de cada ligação', () => {
    const m = new Map([no('a'), no('b', { paiId: 'a' }), no('c'), no('d', { problemaId: 'c' }), no('e')].map((n) => [n.id, n]));
    const g = grafoDeLigacoes('a', m, [{ de: 'b', para: 'c', tipo: 'relacionado' }], [{ de: 'd', para: 'e' }]);
    expect(g.nos.map((n) => `${n.id}${n.profundidade}`).sort()).toEqual(['a0', 'b1', 'c2']);
    expect(g.arestas).toEqual([{ de: 'a', para: 'b', tipo: 'filho' }, { de: 'b', para: 'c', tipo: 'relacionado' }]);
    expect(g.cortado).toBe(false);
  });
  it('corta no máximo e avisa', () => {
    const m = new Map([no('a'), ...Array.from({ length: 10 }, (_, i) => no(`f${i}`, { paiId: 'a' }))].map((n) => [n.id, n]));
    const g = grafoDeLigacoes('a', m, [], [], 2, 5);
    expect(g.nos).toHaveLength(5);
    expect(g.cortado).toBe(true);
  });
});

const cartao = (d: Partial<CartaoChamado> = {}, relato = 'o cliente disse que o ramal 203 não toca'): CartaoParaLista => {
  const c: CartaoChamado = {
    id: 'x', codigo: 'SUP-1', numero: 1, tipoChamado: 'chamado', titulo: 'Ramal mudo', painelId: 'p', etapaId: 'n1', situacao: 'aberto', nivel: 1,
    cliente: { id: 'c1', nome: 'Clínica Aurora' }, contato: { nome: 'Maria', telefone: '5571999990000' }, responsavel: null, prioridade: 'media',
    gravidade: null, alcance: null, tipo: null, assunto: null, produtos: [], operadoras: [], etiquetas: [], espera: null,
    prazos: { resposta: { situacao: 'sem', limite: 0, usado: 0, percentual: 0, venceEm: null, cumpridoEm: null, conta: 'uteis' }, solucao: { situacao: 'sem', limite: 0, usado: 0, percentual: 0, venceEm: null, cumpridoEm: null, conta: 'uteis' } },
    pai: null, problema: null, filhos: { total: 0, abertos: 0 }, incidentes: 0, anotacoes: 0, origem: 'manual', reaberto: 0,
    criadoEm: '2026-10-13T12:00:00.000Z', atualizadoEm: '2026-10-13T12:00:00.000Z', ultimaAtividadeEm: '2026-10-13T12:00:00.000Z', resolvidoEm: null, fechadoEm: null, ...d,
  };
  return { ...c, busca: textoDeBusca(c, [relato]) };
};

describe('a lista: busca, filtros e ordem', () => {
  const ctx = { euId: 'eu', assuntos: [{ id: 'r', paiId: null }, { id: 'r1', paiId: 'r' }] };
  it('a busca sem acento acha pelo relato, e o código exato acha o chamado', () => {
    const l = [cartao(), cartao({ id: 'y', codigo: 'SUP-2', numero: 2, titulo: 'Fila parada', cliente: { id: 'c2', nome: 'Hospital Soterô' } }, 'a fila de atendimento parou')];
    expect(filtrarCartoes(l, { q: 'sotero' }, ctx).map((c) => c.codigo)).toEqual(['SUP-2']);
    expect(filtrarCartoes(l, { q: '203 toca' }, ctx).map((c) => c.codigo)).toEqual(['SUP-1']);
    expect(filtrarCartoes(l, { q: 'sup-2' }, ctx).map((c) => c.codigo)).toEqual(['SUP-2']);
  });
  it('responsável, situação e o assunto com os de baixo', () => {
    const l = [
      cartao({ responsavel: { id: 'eu', nome: 'Eu' }, assunto: { id: 'r1', nome: 'Config', caminho: 'Ramal › Config', ativo: true } }),
      cartao({ id: 'y', codigo: 'SUP-2', numero: 2, situacao: 'fechado' }),
    ];
    expect(filtrarCartoes(l, { responsavel: 'eu' }, ctx)).toHaveLength(1);
    expect(filtrarCartoes(l, { responsavel: 'ninguem', situacao: 'todos' }, ctx).map((c) => c.codigo)).toEqual(['SUP-2']);
    expect(filtrarCartoes(l, { assunto: 'r' }, ctx)).toHaveLength(1);
  });
  it('o mais urgente primeiro; e qualquer coluna ordena, com o vazio no fim', () => {
    const vencido = { situacao: 'vencido' as const, limite: 30, usado: 40, percentual: 133, venceEm: null, cumpridoEm: null, conta: 'uteis' as const };
    const l = [cartao({ id: 'a', codigo: 'SUP-1', prioridade: 'baixa' }), cartao({ id: 'b', codigo: 'SUP-2', numero: 2, prioridade: 'alta', prazos: { resposta: vencido, solucao: vencido } }), cartao({ id: 'c', codigo: 'SUP-3', numero: 3, prioridade: 'critica' })];
    expect(ordenarCartoes(l, undefined, undefined, new Map()).map((c) => c.codigo)).toEqual(['SUP-2', 'SUP-3', 'SUP-1']);
    expect(ordenarCartoes([cartao({ cliente: null }), cartao({ id: 'b', codigo: 'SUP-2' })], 'cliente', 'desc', new Map()).map((c) => c.codigo)).toEqual(['SUP-2', 'SUP-1']);
  });
  it('o CSV abre no Excel (BOM e ponto e vírgula)', () => {
    const csv = csvDosChamados([cartao({ titulo: 'Ramal; mudo' })], { painel: () => 'Suporte', etapa: () => 'N1' });
    expect(csv.startsWith('﻿Código;Título;Painel')).toBe(true);
    expect(csv).toContain('SUP-1;"Ramal; mudo";Suporte;N1;Em aberto;Clínica Aurora');
  });
  it('o CSV escreve a situação do prazo por extenso', () => {
    const vencido = { situacao: 'vencido' as const, limite: 60, usado: 90, percentual: 150, venceEm: null, cumpridoEm: null, conta: 'uteis' as const };
    const csv = csvDosChamados([cartao({ prazos: { resposta: { ...vencido, situacao: 'cumprido' }, solucao: vencido } })], { painel: () => 'Suporte', etapa: () => 'N1' });
    expect(csv).not.toMatch(/;cumprido;|;vencido;/);
    expect(csv).toContain(`;${NOME_SITUACAO_PRAZO.cumprido};${NOME_SITUACAO_PRAZO.vencido};`);
  });
  it('"prazo parado" é só quem espera o cliente: esperando a operadora, o prazo corre', () => {
    const espera = (tipo: 'cliente' | 'operadora') => ({ tipo, motivo: 'm', desde: '2026-10-13T12:00:00.000Z' });
    const l = [cartao({ espera: espera('cliente') }), cartao({ id: 'y', codigo: 'SUP-2', espera: espera('operadora') }), cartao({ id: 'z', codigo: 'SUP-3' })];
    expect(filtrarCartoes(l, { prazo: 'parados' }, ctx).map((c) => c.codigo)).toEqual(['SUP-1']);
  });
});

describe('a IA, as respostas prontas e o histórico', () => {
  it('a sugestão da IA só aceita o que existe nas opções', () => {
    const s = lerSugestaoDaIa(
      { titulo: 'Ramal 203 mudo', assunto: 'ramal › configuracao', gravidade: 'inoperancia', alcance: 'galáxia', tipo: 'incidente', produtos: ['LinePBX', 'Netflix'], etiquetas: ['ramal', 'audio', 'x', 'y'] },
      { assuntos: [{ id: 'a1', caminho: 'Ramal › Configuração', ativo: true }], tipos: ['Incidente', 'Dúvida'], produtos: [{ id: 'p1', nome: 'LinePBX' }] },
    );
    expect(s).toMatchObject({ titulo: 'Ramal 203 mudo', assuntoId: 'a1', gravidade: 'inoperancia', alcance: null, tipo: 'Incidente', produtos: ['p1'], etiquetas: ['ramal', 'audio', 'x'] });
  });
  it('a mensagem do LineChat: quem mandou e o texto', () => {
    expect(lerMensagemDoLineChat({ direction: 'TO_HUB', text: 'meu ramal não toca' })).toMatchObject({ deCliente: true, texto: 'meu ramal não toca' });
    expect(lerMensagemDoLineChat({ direction: 'FROM_HUB', text: 'vou verificar' })).toMatchObject({ deCliente: false });
    expect(lerMensagemDoLineChat({ direction: 'TO_HUB' })).toBeNull();
  });
  it('o modelo da mensagem se preenche, sem deixar buraco', () => {
    expect(preencherModelo('Olá, {contato}! Sobre o {codigo} ({titulo}):', { codigo: 'SUP-1' })).toBe('Olá! Sobre o SUP-1:');
    expect(preencherModelo('Olá, {contato}!', { contato: 'Maria' })).toBe('Olá, Maria!');
  });
  it('as frases do histórico', () => {
    expect(textoDoEvento('etapa', { de: { nome: 'N1', nivel: 1 }, para: { nome: 'N2', nivel: 2 }, sentido: 'sobe', motivo: 'precisa de acesso ao SBC' }))
      .toBe('escalonou de N1 (N1) para N2 (N2): precisa de acesso ao SBC');
    expect(textoDoEvento('prioridade', { de: 'media', para: 'alta', sugerida: 'media', motivo: 'cliente VIP' })).toBe('mudou a prioridade de Média para Alta (a sugerida era Média): cliente VIP');
  });
  it('a trajetória com o tempo em cada etapa', () => {
    const t = trajetoria('2026-10-13T12:00:00.000Z', { nome: 'Novo', nivel: null }, [
      { em: '2026-10-13T12:10:00.000Z', para: { nome: 'N1', nivel: 1 }, motivo: null, por: 'Ana', sentido: null },
      { em: '2026-10-13T13:10:00.000Z', para: { nome: 'N2', nivel: 2 }, motivo: 'rota', por: 'Ana', sentido: 'sobe' },
    ], new Date('2026-10-13T14:00:00.000Z'));
    expect(t.map((p) => `${p.etapa}:${p.minutos}`)).toEqual(['Novo:10', 'N1:60', 'N2:50']);
  });
  it('o link da conversa só existe com o modelo das Integrações', () => {
    expect(linkDaConversa('https://app.exemplo.com.br/chat/{sessao}', 'abc 1')).toBe('https://app.exemplo.com.br/chat/abc%201');
    expect(linkDaConversa('', 'abc')).toBeNull();
  });
});
