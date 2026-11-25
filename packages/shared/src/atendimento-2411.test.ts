/**
 * Patch 2.4.11 (decisão 0066): o prazo escrito em cada chamado, a marca de atualizar, as imagens do relato e da descrição, a
 * etapa que abre o card de faturamento e o aviso da equipe que saiu do histórico.
 */
import { describe, expect, it } from 'vitest';
import { AJUSTES_PRAZOS_PADRAO, duracaoNaConta, estadoDosPrazos, instanteLocal, prazoEscritoLegivel, textoDoPrazo, TEXTO_SEM_PRAZO } from './atendimento-prazos.js';
import {
  AJUSTES_PAINEL_PADRAO, AjustesDoPainelSchema, CampoGravarSchema, ChamadoAlterarSchema, ChamadoCriarSchema, EtapaGravarSchema, ImagensDoTextoSchema, MAX_IMAGENS_DE_UMA_VEZ, MoverSchema,
  NOME_ORIGEM, NOME_TIPO_CAMPO, ORIGENS, TIPOS_CAMPO, ajustesDoPainelCompletos, ehCaixinhas, horasSemAtualizacao, larguraDoCampo, normalizarValorDoCampo, opcoesDaCaixinhaUnica,
  painelContaPrazo, prazoEscritoNoChamado, temOpcoesEscritas, textoDoEvento, textoDoValor, textoSemAtualizacao, tipoTroca,
} from './atendimento.js';
import { contaDoCampo } from './implantacao.js';

const em = (dia: string, hora: string) => instanteLocal(dia, hora);

describe('o prazo escrito em cada chamado (o Luan: "a opção do painel dos prazos serem manuais e serem preenchidos em cada chamado")', () => {
  it('os ajustes: nasce desligado; com ele, o painel conta prazo mesmo sem o assunto', () => {
    expect(AJUSTES_PAINEL_PADRAO.prazoManual).toBe(false);
    expect(ajustesDoPainelCompletos({}).prazoManual).toBe(false);
    // o guardado antes do 2.4.11 (sem a chave) e o valor estranho não ligam
    expect(ajustesDoPainelCompletos({ prazoManual: 'sim' as unknown as boolean }).prazoManual).toBe(false);
    const semAssunto = ajustesDoPainelCompletos({ contaPrazo: true, camposDesligados: ['assunto'] });
    expect(painelContaPrazo(semAssunto)).toBe(false);
    expect(painelContaPrazo({ ...semAssunto, prazoManual: true })).toBe(true);
    expect(prazoEscritoNoChamado({ ...semAssunto, prazoManual: true })).toBe(true);
    // sem contar prazo, o escrito não vale
    expect(prazoEscritoNoChamado({ ...semAssunto, contaPrazo: false, prazoManual: true })).toBe(false);
    expect(painelContaPrazo({ ...semAssunto, contaPrazo: false, prazoManual: true })).toBe(false);
  });

  const base = { criadoEm: em('2026-11-23', '09:00').toISOString(), resolvidoEm: null, esperas: [], contaPrazo: true, assuntoId: 'a1', prazoSolucao: 60, prazoManual: true };
  const prazo = em('2026-11-25', '09:00').toISOString(); // 48 h corridas depois

  it('sem o dia escrito, o chamado fica sem prazo (e diz por quê); o prazo do assunto não vale', () => {
    const e = estadoDosPrazos({ ...base, prazoEscrito: null }, AJUSTES_PRAZOS_PADRAO, em('2026-11-23', '10:00')).solucao;
    expect(e).toMatchObject({ situacao: 'sem', motivo: 'sem_prazo_escrito' });
    expect(textoDoPrazo(e)).toBe(TEXTO_SEM_PRAZO.sem_prazo_escrito);
  });

  it('em horas corridas, do aberto até o dia escrito: no prazo, perto de vencer e vencido', () => {
    const c = { ...base, prazoEscrito: prazo };
    // sábado e domingo contam (são horas corridas): 24 de 48 h
    expect(estadoDosPrazos(c, AJUSTES_PRAZOS_PADRAO, em('2026-11-24', '09:00')).solucao)
      .toMatchObject({ situacao: 'no_prazo', limite: 48 * 60, usado: 24 * 60, percentual: 50, venceEm: prazo, conta: 'corridas' });
    expect(estadoDosPrazos(c, { ...AJUSTES_PRAZOS_PADRAO, alertaPercentual: 80 }, em('2026-11-25', '01:00')).solucao.situacao).toBe('perto');
    expect(estadoDosPrazos(c, AJUSTES_PRAZOS_PADRAO, em('2026-11-25', '09:30')).solucao).toMatchObject({ situacao: 'vencido', usado: 48 * 60 + 30, venceEm: null });
  });

  it('não para esperando o cliente; resolvido antes é cumprido, depois é fora do prazo', () => {
    const esperas = [{ tipo: 'cliente' as const, motivo: 'o cliente vai testar', inicio: em('2026-11-23', '10:00').toISOString(), fim: null, porId: null }];
    expect(estadoDosPrazos({ ...base, prazoEscrito: prazo, esperas }, AJUSTES_PRAZOS_PADRAO, em('2026-11-24', '09:00')).solucao).toMatchObject({ situacao: 'no_prazo', usado: 24 * 60 });
    expect(estadoDosPrazos({ ...base, prazoEscrito: prazo, resolvidoEm: em('2026-11-24', '15:00').toISOString() }, AJUSTES_PRAZOS_PADRAO).solucao.situacao).toBe('cumprido');
    expect(estadoDosPrazos({ ...base, prazoEscrito: prazo, resolvidoEm: em('2026-11-25', '11:00').toISOString() }, AJUSTES_PRAZOS_PADRAO).solucao)
      .toMatchObject({ situacao: 'estourou', usado: 50 * 60 });
    // o prazo escrito antes da abertura: vencido desde a abertura (sem dividir por zero)
    expect(estadoDosPrazos({ ...base, prazoEscrito: em('2026-11-22', '09:00').toISOString() }, AJUSTES_PRAZOS_PADRAO, em('2026-11-23', '09:10')).solucao.situacao).toBe('vencido');
  });

  it('o tempo que falta: em horas até dois dias; depois, os dias (o de horas úteis continua em horas)', () => {
    expect(duracaoNaConta(47 * 60, 'corridas')).toBe('47 h');
    expect(duracaoNaConta(414 * 60 + 55, 'corridas')).toBe('17 dias e 6 h');
    expect(duracaoNaConta(72 * 60, 'corridas')).toBe('3 dias');
    expect(duracaoNaConta(72 * 60, 'uteis')).toBe('72 h');
    const longe = { ...base, prazoEscrito: em('2026-12-12', '18:00').toISOString() };
    expect(textoDoPrazo(estadoDosPrazos(longe, AJUSTES_PRAZOS_PADRAO, em('2026-11-25', '11:05')).solucao, em('2026-11-25', '11:05'))).toBe('Faltam 17 dias e 6 h (vence em 12/12 às 18:00)');
    expect(textoDoPrazo(estadoDosPrazos({ ...base, prazoEscrito: prazo }, AJUSTES_PRAZOS_PADRAO, em('2026-11-28', '09:00')).solucao)).toBe('Vencido há 3 dias');
  });

  it('como se lê: o dia e a hora de Brasília', () => {
    expect(prazoEscritoLegivel(em('2026-11-27', '18:00'))).toBe('27/11/2026 às 18:00');
    expect(prazoEscritoLegivel('2026-11-27T21:00:00.000Z')).toBe('27/11/2026 às 18:00');
  });

  it('no abrir e na ficha: o dia com o fuso, entre 2020 e daqui a 5 anos; nulo tira', () => {
    expect(ChamadoCriarSchema.parse({ painelId: 'p', titulo: 'Teste' }).prazo).toBeNull();
    expect(ChamadoCriarSchema.parse({ painelId: 'p', titulo: 'Teste', prazo: '2026-11-27T18:00:00-03:00' }).prazo).toBe('2026-11-27T18:00:00-03:00');
    expect(ChamadoCriarSchema.safeParse({ painelId: 'p', titulo: 'Teste', prazo: '27/11/2026 18:00' }).success).toBe(false);
    expect(ChamadoCriarSchema.safeParse({ painelId: 'p', titulo: 'Teste', prazo: '2019-12-31T18:00:00-03:00' }).success).toBe(false);
    expect(ChamadoAlterarSchema.parse({ prazo: null }).prazo).toBeNull();
    expect(ChamadoAlterarSchema.parse({ prazo: '2026-11-27T21:00:00Z' }).prazo).toBe('2026-11-27T21:00:00Z');
    expect(ChamadoAlterarSchema.parse({ titulo: 'Outro' }).prazo).toBeUndefined();
  });
});

describe('a marca de atualizar (o Luan: "qualquer chamado com 24 sem atualização tem q ter um flag")', () => {
  const ultima = '2026-11-24T12:00:00.000Z';
  const c = { situacao: 'aberto' as const, ultimaAtividadeEm: ultima };
  it('os ajustes: nasce desligada; liga com as horas (de 1 a 720)', () => {
    expect(AJUSTES_PAINEL_PADRAO.horasSemAtualizacao).toBeNull();
    expect(ajustesDoPainelCompletos({ horasSemAtualizacao: 24 }).horasSemAtualizacao).toBe(24);
    expect(ajustesDoPainelCompletos({ horasSemAtualizacao: 0 }).horasSemAtualizacao).toBeNull();
    expect(ajustesDoPainelCompletos({ horasSemAtualizacao: 12.5 }).horasSemAtualizacao).toBeNull();
    expect(AjustesDoPainelSchema.safeParse({ horasSemAtualizacao: 24 }).success).toBe(true);
    expect(AjustesDoPainelSchema.safeParse({ horasSemAtualizacao: null }).success).toBe(true);
    expect(AjustesDoPainelSchema.safeParse({ horasSemAtualizacao: 0 }).success).toBe(false);
    expect(AjustesDoPainelSchema.safeParse({ horasSemAtualizacao: 721 }).success).toBe(false);
  });
  it('o chamado em aberto que ninguém mexe há as horas escolhidas; o resolvido, o fechado e o painel sem a marca, não', () => {
    const ajustes = { horasSemAtualizacao: 24 };
    expect(horasSemAtualizacao(c, ajustes, new Date('2026-11-25T11:59:00Z'))).toBeNull();
    expect(horasSemAtualizacao(c, ajustes, new Date('2026-11-25T12:00:00Z'))).toBe(24);
    expect(horasSemAtualizacao(c, ajustes, new Date('2026-11-25T14:30:00Z'))).toBe(26);
    expect(horasSemAtualizacao({ ...c, situacao: 'resolvido' }, ajustes, new Date('2026-11-27T12:00:00Z'))).toBeNull();
    expect(horasSemAtualizacao({ ...c, situacao: 'fechado' }, ajustes, new Date('2026-11-27T12:00:00Z'))).toBeNull();
    expect(horasSemAtualizacao(c, { horasSemAtualizacao: null }, new Date('2026-11-27T12:00:00Z'))).toBeNull();
    expect(horasSemAtualizacao(c, undefined, new Date('2026-11-27T12:00:00Z'))).toBeNull();
  });
  it('como se lê: as horas até dois dias; depois, os dias', () => {
    expect(textoSemAtualizacao(26)).toBe('Sem atualização há 26 h');
    expect(textoSemAtualizacao(47)).toBe('Sem atualização há 47 h');
    expect(textoSemAtualizacao(73)).toBe('Sem atualização há 3 dias');
  });
});

describe('as imagens do relato e da descrição', () => {
  const img = { fileName: 'print.png', conteudo: 'data:image/png;base64,iVBORw0KGgo=' };
  it('no abrir: as imagens de cada texto, até 10 de uma vez; na ficha, o texto vem no endereço', () => {
    expect(ChamadoCriarSchema.parse({ painelId: 'p', titulo: 'Teste' }).imagens).toEqual([]);
    expect(ChamadoCriarSchema.parse({ painelId: 'p', titulo: 'Teste', imagens: [{ campo: 'relato', ...img }, { campo: 'descricao', ...img }] }).imagens).toHaveLength(2);
    expect(ChamadoCriarSchema.safeParse({ painelId: 'p', titulo: 'Teste', imagens: [{ campo: 'solucao', ...img }] }).success).toBe(false);
    expect(ChamadoCriarSchema.safeParse({ painelId: 'p', titulo: 'Teste', imagens: Array.from({ length: MAX_IMAGENS_DE_UMA_VEZ + 1 }, () => ({ campo: 'relato', ...img })) }).success).toBe(false);
    expect(ImagensDoTextoSchema.safeParse({ imagens: [] }).success).toBe(false);
    expect(ImagensDoTextoSchema.parse({ imagens: [img] }).imagens).toEqual([img]);
  });
});

describe('a etapa que abre o card de faturamento e o mover com o que a janela mandou', () => {
  it('a etapa guarda o painel do faturamento (sem ele, nulo)', () => {
    expect(EtapaGravarSchema.parse({ nome: 'Implantado - Concluído', tipo: 'fechado' }).abreFaturamento).toBeNull();
    expect(EtapaGravarSchema.parse({ nome: 'Implantado - Concluído', tipo: 'fechado', abreFaturamento: 'adm' }).abreFaturamento).toBe('adm');
  });
  it('o mover leva o pedido do faturamento (conferido: o título com 3 letras)', () => {
    expect(MoverSchema.parse({ etapaId: 'e' }).faturamento).toBeUndefined();
    expect(MoverSchema.parse({ etapaId: 'e', faturamento: { titulo: 'EVAB - Faturamento', vencimento: '2026-12-10' } }).faturamento)
      .toEqual({ titulo: 'EVAB - Faturamento', email: null, vencimento: '2026-12-10', cnpj: null, informacoes: '' });
    expect(MoverSchema.safeParse({ etapaId: 'e', faturamento: { titulo: 'x' } }).success).toBe(false);
  });
  it('a origem do card de faturamento e as frases do histórico dos dois cards', () => {
    expect(ORIGENS).toContain('implantacao');
    expect(NOME_ORIGEM.implantacao).toBe('Aberto pela implantação');
    expect(textoDoEvento('criado', { origem: 'implantacao', etapa: 'A faturar' })).toBe('abriu o chamado (Aberto pela implantação) em A faturar');
    expect(textoDoEvento('faturamento', { acao: 'abriu', codigo: 'GLA-68', painel: 'Grupo Line - ADM' })).toBe('abriu o card de faturamento GLA-68 no painel Grupo Line - ADM');
    expect(textoDoEvento('faturamento', { acao: 'veio', codigo: 'IMP-7', titulo: 'Clínica EVAB' })).toBe('veio da implantação IMP-7 (Clínica EVAB)');
  });
});

describe('a caixinha única (o Luan: "checkbox único onde vai ser apenas um check unico identificando que a atividade já foi feita")', () => {
  const unica = { id: 'c1', nome: 'Lista de ramais', tipo: 'feito' as const, opcoes: [{ id: 'o1', nome: 'Feito', ativa: true }] };

  it('o tipo: "Caixinha única (feito)", com a marca de quem marcou (como as caixinhas), sem opções escritas e em meia linha', () => {
    expect(TIPOS_CAMPO).toContain('feito');
    expect(NOME_TIPO_CAMPO.feito).toBe('Caixinha única (feito)');
    expect(ehCaixinhas('feito')).toBe(true);
    expect(temOpcoesEscritas('feito')).toBe(false);
    expect(larguraDoCampo({ tipo: 'feito', largura: null })).toBe('metade');
    // não vira as caixinhas nem o sim ou não depois de criada (as marcas não teriam para onde ir)
    expect(tipoTroca('feito', 'caixinhas')).toBe(false);
    expect(tipoTroca('sim_nao', 'feito')).toBe(false);
  });

  it('a caixinha é uma só, a "Feito", criada pelo Gestor: o que vem escrito não conta, e o id fica o mesmo ao salvar de novo', () => {
    const gravado = CampoGravarSchema.parse({ nome: 'Lista de ramais', tipo: 'feito', opcoes: [{ nome: 'A' }, { nome: 'B' }] });
    expect(gravado.opcoes).toEqual([]);
    expect(opcoesDaCaixinhaUnica([], () => 'novo')).toEqual([{ id: 'novo', nome: 'Feito', ativa: true }]);
    expect(opcoesDaCaixinhaUnica([{ id: 'o1', nome: 'Outra', ativa: false }, { id: 'o2', nome: 'X', ativa: true }], () => 'novo')).toEqual([{ id: 'o1', nome: 'Feito', ativa: true }]);
  });

  it('o valor: marcada é a caixinha; o sim, o "feito" e o id marcam; o não desmarca', () => {
    for (const v of [true, 'sim', 'Feito', 'o1', ['o1'], 'X']) expect(normalizarValorDoCampo(unica, v), String(v)).toEqual({ ok: true, valor: ['o1'] });
    for (const v of [false, 'não', 'nao', null, '', []]) expect(normalizarValorDoCampo(unica, v), String(v)).toEqual({ ok: true, valor: null });
    expect(normalizarValorDoCampo(unica, 'talvez')).toEqual({ ok: false, erro: 'Lista de ramais: marque como feito (sim) ou desmarque (não)' });
    expect(normalizarValorDoCampo(unica, ['o1', 'o9'])).toEqual({ ok: false, erro: 'Lista de ramais: marque como feito (sim) ou desmarque (não)' });
    expect(textoDoValor(unica, ['o1'])).toBe('Feito');
    expect(textoDoValor(unica, null)).toBe('');
  });

  it('conta um na etapa e na aba: feito quando marcada', () => {
    expect(contaDoCampo(unica, ['o1'])).toEqual({ feitos: 1, total: 1 });
    expect(contaDoCampo(unica, null)).toEqual({ feitos: 0, total: 1 });
  });

  it('o histórico: "marcou Lista de ramais como feito" e "desmarcou Lista de ramais"', () => {
    expect(textoDoEvento('campo', { campo: 'Lista de ramais', unica: true, marcou: ['Feito'], desmarcou: [] })).toBe('marcou Lista de ramais como feito');
    expect(textoDoEvento('campo', { campo: 'Lista de ramais', unica: true, marcou: [], desmarcou: ['Feito'] })).toBe('desmarcou Lista de ramais (não está mais feito)');
  });
});
