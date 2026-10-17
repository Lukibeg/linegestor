import { describe, expect, it } from 'vitest';
import {
  AJUSTES_PRAZOS_PADRAO, ajustesPrazosCompletos, alertasDevidos, estadoDosPrazos, instanteLocal, minutosUteisEntre, NOME_SITUACAO_PRAZO, prioridadeSugerida, proximaExecucao,
  somarDiasUteis, somarMinutosUteis, textoDaRegra, textoDoPrazo, type AjustesPrazos, type Calendario, type RegraAgendado,
} from './atendimento-prazos.js';
import {
  AJUSTES_PAINEL_PADRAO, CampoGravarSchema, ChamadoAlterarSchema, ChamadoCriarSchema, ETAPAS_DO_PAINEL_NOVO, EtapasGravarSchema, ListaDeEtapasSchema, MAX_ETAPAS_DO_PAINEL,
  PainelGravarSchema, acharCampo, ajustesDoPainelCompletos, chaveDoCampo, faltaParaAbrir, limparObrigatorios, normalizarValorDoCampo, obrigatoriosDoPainel,
  prioridadeSugeridaDoPainel, textoDoValor, textosDosCampos,
  valoresVisiveis, type CampoPersonalizado,
  caminhoDoAssunto, csvDosChamados, emOrdemDeArvore, etapaAoAssumir, etapaDeEntrada, faltaParaEtapa, filhosQueTravam, filtrarCartoes, grafoDeLigacoes,
  lerCodigo, lerListaDeAssuntos, lerMensagemDoLineChat, lerSugestaoDaIa, mensagemDoQueFalta, movimentoDeNivel, ordenarCartoes,
  pedacosComReferencias, preencherModelo, referenciasNoTexto, resumoDosPaineis, textoDeBusca, textoDoEvento, trajetoria, linkDaConversa,
  type CartaoChamado, type CartaoParaLista, type DadosObrigatorios, type EtapaPainel, type NoParaGrafo,
  chaveDaEtiqueta, corDaEtiqueta, etiquetasUnicas, renomearEtiqueta, EtiquetaEditarPeloNomeSchema,
  AvisosChamadosSchema, EVENTOS_AVISO, ModeloAprovadoSchema, faltaNoModeloAprovado, mensagemAoCliente, mensagemPreenchida, parametrosDoModelo, textoDoModelo,
  valorDaVariavel, valorSugeridoDaVariavel,
  EtapaGravarSchema, NIVEIS, PAINEIS_INICIAIS, rotuloDoNivel,
  citacaoDigitando, citadosNoTexto, emLista, pedacosComCitacoes,
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
  { id: 'novo', nome: 'Novo', tipo: 'entrada', nivel: null, obrigatorios: [], avisar: [], resultado: null },
  { id: 'n1', nome: 'N1', tipo: 'andamento', nivel: 1, obrigatorios: ['cliente', 'relato'], avisar: [], resultado: null },
  { id: 'n2', nome: 'N2', tipo: 'andamento', nivel: 2, obrigatorios: ['cliente', 'relato', 'assunto'], avisar: [], resultado: null },
  { id: 'res', nome: 'Resolvido', tipo: 'resolvido', nivel: null, obrigatorios: ['solucao', 'causa'], avisar: [], resultado: null },
  { id: 'fec', nome: 'Fechado', tipo: 'fechado', nivel: null, obrigatorios: ['solucao', 'causa', 'checklist'], avisar: [], resultado: null },
];
const dados = (d: Partial<DadosObrigatorios> = {}): DadosObrigatorios => ({
  tipoChamado: 'chamado', clienteId: 'c1', contatoNome: null, contatoTelefone: null, relato: 'Ramal mudo', descricao: null, assuntoId: null, tipo: null,
  gravidade: null, alcance: null, prioridade: null, produtos: [], operadoras: [], responsavelId: null, solucao: null, causa: null, validacao: null,
  checklist: [], tempoMinutos: 0, campos: {}, ...d,
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
  it('o nível DEV, depois do N3 (13/10, o Luan: "o correto aqui é ter o nível DEV também")', () => {
    expect(NIVEIS.map(rotuloDoNivel)).toEqual(['N1', 'N2', 'N3', 'DEV']);
    expect(rotuloDoNivel(null)).toBe('');
    // do N3 (ou de qualquer nível) para o DEV é escalonar; do DEV para o N2, voltar de nível
    expect(movimentoDeNivel({ nivel: 3 }, { nivel: 4 })).toBe('sobe');
    expect(movimentoDeNivel({ nivel: 4 }, { nivel: 2 })).toBe('desce');
    // o Suporte nasce com a coluna DEV, depois do N3
    const suporte = PAINEIS_INICIAIS.find((p) => p.chave === 'suporte')!;
    expect(suporte.etapas.map((e) => e.nome)).toEqual(['Novo', 'N1', 'N2', 'N3', 'DEV', 'Em observação', 'Resolvido', 'Fechado']);
    expect(suporte.etapas.find((e) => e.chave === 'dev')).toMatchObject({ tipo: 'andamento', nivel: 4 });
    // a etapa pode ser marcada como DEV nos Ajustes; um nível que não existe, não
    expect(EtapaGravarSchema.parse({ nome: 'Com o desenvolvimento', tipo: 'andamento', nivel: 4 }).nivel).toBe(4);
    expect(EtapaGravarSchema.safeParse({ nome: 'X', tipo: 'andamento', nivel: 5 }).success).toBe(false);
    expect(textoDoEvento('etapa', { de: { nome: 'N3', nivel: 3 }, para: { nome: 'DEV', nivel: 4 }, sentido: 'sobe', motivo: 'correção no plano de discagem' }))
      .toBe('escalonou de N3 (N3) para DEV (DEV): correção no plano de discagem');
  });
  it('a entrada e o "Assumir" (da entrada para a primeira etapa de andamento)', () => {
    expect(etapaDeEntrada(etapas)?.id).toBe('novo');
    expect(etapaAoAssumir(etapas, 'novo')?.id).toBe('n1');
    expect(etapaAoAssumir(etapas, 'n1')).toBeNull();
  });
  it('a lista de etapas: as mesmas regras ao criar o painel (na mesma janela) e ao mudar as etapas', () => {
    const painel = { nome: 'Ativações', sigla: 'atv', ajustes: {} };
    const mensagem = (r: { success: boolean; error?: { issues: Array<{ message: string }> } }) => (r.success ? '' : r.error!.issues[0]!.message);
    // sem a lista, o painel continua valendo (nasce com as etapas básicas)
    expect(PainelGravarSchema.parse(painel)).toMatchObject({ sigla: 'ATV', destino: {} });
    expect(PainelGravarSchema.parse(painel).etapas).toBeUndefined();
    expect(ETAPAS_DO_PAINEL_NOVO.map((e) => e.nome)).toEqual(['Novo', 'Em andamento', 'Resolvido', 'Fechado']);
    const ok = PainelGravarSchema.parse({ ...painel, etapas: [{ nome: ' Pedido ', tipo: 'entrada' }, { nome: 'Encerrado', tipo: 'fechado' }] });
    expect(ok.etapas).toEqual([
      { nome: 'Pedido', tipo: 'entrada', nivel: null, obrigatorios: [], resultado: null, avisar: [] },
      { nome: 'Encerrado', tipo: 'fechado', nivel: null, obrigatorios: [], resultado: null, avisar: [] },
    ]);
    expect(mensagem(PainelGravarSchema.safeParse({ ...painel, etapas: [{ nome: 'Pedido', tipo: 'entrada' }, { nome: 'Fazendo', tipo: 'andamento' }] })))
      .toBe('Pelo menos uma etapa precisa fechar o chamado');
    expect(mensagem(ListaDeEtapasSchema.safeParse([{ nome: 'Resolvido', tipo: 'resolvido' }, { nome: 'Fechado', tipo: 'fechado' }])))
      .toBe('Pelo menos uma etapa precisa ser de entrada ou de andamento');
    expect(mensagem(EtapasGravarSchema.safeParse({ etapas: [{ nome: 'Novo', tipo: 'entrada' }, { nome: 'NOVO', tipo: 'fechado' }] }))).toBe('Duas etapas com o nome NOVO');
    expect(mensagem(ListaDeEtapasSchema.safeParse([{ nome: 'Só uma', tipo: 'fechado' }]))).toBe('O painel precisa de pelo menos duas etapas');
    const muitas = Array.from({ length: MAX_ETAPAS_DO_PAINEL + 1 }, (_, i) => ({ nome: `Etapa ${i + 1}`, tipo: i === 0 ? 'entrada' : 'fechado' }));
    expect(mensagem(ListaDeEtapasSchema.safeParse(muitas))).toBe(`Um painel vai até ${MAX_ETAPAS_DO_PAINEL} etapas`);
    // o erro de uma etapa diz qual (a tela mostra "Etapa 2: …")
    const semNome = ListaDeEtapasSchema.safeParse([{ nome: 'Novo', tipo: 'entrada' }, { nome: '  ', tipo: 'fechado' }]);
    expect(semNome.success ? null : semNome.error.issues[0]!.path).toEqual([1, 'nome']);
  });
});

describe('os campos de cada painel', () => {
  const lista: CampoPersonalizado = {
    id: 'sis', painelId: 'dev', nome: 'Sistema', tipo: 'lista', dica: null, ativo: true, ordem: 0,
    opcoes: [{ id: 'o1', nome: 'LinePBX', ativa: true }, { id: 'o2', nome: 'LineChat', ativa: true }, { id: 'o3', nome: 'Fortics', ativa: false }],
  };
  const varios: CampoPersonalizado = { ...lista, id: 'mods', nome: 'Módulos', tipo: 'lista_varios' };
  const campo = (tipo: CampoPersonalizado['tipo'], d: Partial<CampoPersonalizado> = {}): CampoPersonalizado => ({ ...lista, id: tipo, nome: 'Campo', tipo, opcoes: [], ...d });

  it('cada tipo confere e arruma o valor (o número com vírgula, a data em dia/mês/ano, a opção pelo nome)', () => {
    expect(normalizarValorDoCampo(campo('texto'), '  versão 2.3 \n final ')).toEqual({ ok: true, valor: 'versão 2.3 final' });
    expect(normalizarValorDoCampo(campo('texto_longo'), 'linha 1\r\nlinha 2 ')).toEqual({ ok: true, valor: 'linha 1\nlinha 2' });
    expect(normalizarValorDoCampo(campo('texto'), 'x'.repeat(301))).toEqual({ ok: false, erro: 'Campo: vai até 300 letras' });
    expect(normalizarValorDoCampo(campo('numero'), '1.234,5')).toEqual({ ok: true, valor: 1234.5 });
    expect(normalizarValorDoCampo(campo('numero'), 0)).toEqual({ ok: true, valor: 0 });
    expect(normalizarValorDoCampo(campo('numero'), 'doze')).toEqual({ ok: false, erro: 'Campo: escreva um número' });
    expect(normalizarValorDoCampo(campo('data'), '5/3/2027')).toEqual({ ok: true, valor: '2027-03-05' });
    expect(normalizarValorDoCampo(campo('data'), '2027-02-30')).toEqual({ ok: false, erro: 'Campo: escreva a data (dia/mês/ano)' });
    expect(normalizarValorDoCampo(campo('sim_nao'), 'Não')).toEqual({ ok: true, valor: false });
    expect(normalizarValorDoCampo(campo('sim_nao'), true)).toEqual({ ok: true, valor: true });
    expect(normalizarValorDoCampo(lista, 'linechat')).toEqual({ ok: true, valor: 'o2' });
    expect(normalizarValorDoCampo(lista, 'o1')).toEqual({ ok: true, valor: 'o1' });
    expect(normalizarValorDoCampo(lista, 'Asterisk')).toEqual({ ok: false, erro: 'Sistema: "Asterisk" não é uma das opções (LinePBX, LineChat)' });
    expect(normalizarValorDoCampo(varios, ['LinePBX', 'o2', 'linepbx'])).toEqual({ ok: true, valor: ['o1', 'o2'] });
    expect(normalizarValorDoCampo(varios, 'LinePBX; LineChat')).toEqual({ ok: true, valor: ['o1', 'o2'] });
    // vazio tira o valor
    expect(normalizarValorDoCampo(lista, '')).toEqual({ ok: true, valor: null });
    expect(normalizarValorDoCampo(varios, [])).toEqual({ ok: true, valor: null });
  });
  it('a opção desativada não entra num chamado novo, mas o chamado que já tinha continua com ela', () => {
    expect(normalizarValorDoCampo(lista, 'Fortics').ok).toBe(false);
    expect(normalizarValorDoCampo(lista, 'Fortics', 'o3')).toEqual({ ok: true, valor: 'o3' });
    expect(normalizarValorDoCampo(varios, ['o3', 'o1'], ['o3'])).toEqual({ ok: true, valor: ['o3', 'o1'] });
  });
  it('o valor como se lê, e a busca acha o texto dos campos', () => {
    expect(textoDoValor(campo('numero'), 1234.5)).toBe('1.234,5');
    expect(textoDoValor(campo('data'), '2027-03-05')).toBe('05/03/2027');
    expect(textoDoValor(campo('sim_nao'), false)).toBe('Não');
    expect(textoDoValor(varios, ['o1', 'o3'])).toBe('LinePBX, Fortics');
    expect(textoDoValor(lista, null)).toBe('');
    expect(textosDosCampos([lista, campo('texto', { id: 't' })], { sis: 'o2', t: 'v2.3' })).toEqual(['LineChat', 'v2.3']);
    // o chamado mostra só os campos ativos do painel dele
    expect(valoresVisiveis([lista, { ...campo('texto', { id: 'off' }), ativo: false }, { ...lista, id: 'outro', painelId: 'sup' }], 'dev', { sis: 'o1', off: 'x', outro: 'o2' }))
      .toEqual({ sis: 'o1' });
    expect(acharCampo([lista, varios], 'MODULOS')?.id).toBe('mods');
  });
  it('obrigatório: o campo do painel ("campo:<id>") entra na mesma regra, com o nome na mensagem', () => {
    const versao = campo('texto', { id: 'ver', nome: 'Versão publicada' });
    const entregue: Pick<EtapaPainel, 'tipo' | 'obrigatorios'> = { tipo: 'resolvido', obrigatorios: [chaveDoCampo('ver'), 'solucao'] };
    expect(faltaParaEtapa(dados({ solucao: 'ok' }), entregue)).toEqual(['campo:ver']);
    expect(faltaParaEtapa(dados({ solucao: 'ok', campos: { ver: '2026.10' } }), entregue)).toEqual([]);
    // o "não" e o zero contam como respondidos
    expect(faltaParaEtapa(dados({ solucao: 'ok', campos: { ver: false } }), entregue)).toEqual([]);
    expect(mensagemDoQueFalta(['assunto', 'campo:ver'], 'Entregue', [versao])).toBe('Para ir para Entregue, falta preencher: Assunto e Versão publicada.');
    expect(faltaParaAbrir(dados(), { obrigatoriosAoAbrir: ['campo:sis', 'relato', 'assunto'] })).toEqual(['assunto', 'campo:sis']);
  });
  it('o que pode ser pedido num painel: sem os campos do sistema desligados, com os campos ativos dele', () => {
    const doPainel = obrigatoriosDoPainel({ camposDesligados: ['assunto', 'alcance'] }, [lista, { ...varios, ativo: false }]);
    expect(doPainel).not.toContain('assunto');
    expect(doPainel).not.toContain('alcance');
    // a gravidade e o alcance ligam e desligam separados
    expect(doPainel).toContain('gravidade');
    expect(doPainel).toContain('tipo');
    expect(doPainel.slice(-1)).toEqual(['campo:sis']);
    expect(limparObrigatorios(['campo:sis', 'assunto', 'campo:mods', 'relato', 'relato'], doPainel)).toEqual(['relato', 'campo:sis']);
    // "não precisa desse alcance por enquanto": o painel novo (e o gravado sem a escolha) nasce sem ele
    expect(AJUSTES_PAINEL_PADRAO.camposDesligados).toEqual(['alcance']);
    expect(ajustesDoPainelCompletos({ tipos: ['A'] }).camposDesligados).toEqual(['alcance']);
    expect(ajustesDoPainelCompletos({ camposDesligados: [] }).camposDesligados).toEqual([]);
  });
  it('a prioridade sugerida pelos campos do painel: com o alcance, a matriz; sem ele, só a gravidade; sem a gravidade, nenhuma', () => {
    const prazos = { matriz: AJUSTES_PRAZOS_PADRAO.matriz, semAlcance: { ...AJUSTES_PRAZOS_PADRAO.semAlcance, inoperancia: 'critica' as const } };
    expect(prioridadeSugeridaDoPainel({ camposDesligados: [] }, 'inoperancia', 'pessoa', prazos)).toBe('media');
    expect(prioridadeSugeridaDoPainel({ camposDesligados: [] }, 'inoperancia', null, prazos)).toBeNull();
    expect(prioridadeSugeridaDoPainel({ camposDesligados: ['alcance'] }, 'inoperancia', null, prazos)).toBe('critica');
    // o alcance guardado de antes não conta no painel sem o alcance
    expect(prioridadeSugeridaDoPainel({ camposDesligados: ['alcance'] }, 'inoperancia', 'pessoa', prazos)).toBe('critica');
    expect(prioridadeSugeridaDoPainel({ camposDesligados: ['alcance'] }, 'performance', null, prazos)).toBe(AJUSTES_PRAZOS_PADRAO.semAlcance.performance);
    expect(prioridadeSugeridaDoPainel({ camposDesligados: ['gravidade'] }, 'inoperancia', 'empresa', prazos)).toBeNull();
    // a coluna "só a gravidade" começa como "um setor ou unidade"
    expect(AJUSTES_PRAZOS_PADRAO.semAlcance).toEqual({ inoperancia: 'alta', intermitencia: 'media', performance: 'media', disfuncional: 'media', nao_se_aplica: 'baixa' });
    // os ajustes gravados antes da coluna existir ganham o padrão
    expect(ajustesPrazosCompletos({ alertaPercentual: 70 } as Partial<AjustesPrazos>).semAlcance).toEqual(AJUSTES_PRAZOS_PADRAO.semAlcance);
  });
  it('os formatos: o campo novo, a lista sem opção, o valor no pedido e a regra com o campo', () => {
    const msg = (r: { success: boolean; error?: { issues: Array<{ message: string }> } }) => (r.success ? '' : r.error!.issues[0]!.message);
    expect(CampoGravarSchema.parse({ nome: ' Versão ', tipo: 'texto' })).toMatchObject({ nome: 'Versão', opcoes: [], ativo: true, obrigatorioAoAbrir: false, etapas: [] });
    expect(msg(CampoGravarSchema.safeParse({ nome: 'Sistema', tipo: 'lista', opcoes: [] }))).toBe('A lista precisa de pelo menos uma opção');
    expect(msg(CampoGravarSchema.safeParse({ nome: 'Sistema', tipo: 'lista', opcoes: [{ nome: 'PBX' }, { nome: 'pbx' }] }))).toBe('Duas opções com o nome pbx');
    expect(ChamadoCriarSchema.parse({ painelId: 'p', titulo: 'Teste' }).campos).toEqual({});
    expect(ChamadoAlterarSchema.parse({ campos: { sis: 'o1', ver: null } }).campos).toEqual({ sis: 'o1', ver: null });
    expect(EtapasGravarSchema.parse({ etapas: [{ nome: 'Novo', tipo: 'entrada', obrigatorios: ['campo:sis'] }, { nome: 'Fim', tipo: 'fechado' }] }).etapas[0]!.obrigatorios).toEqual(['campo:sis']);
    expect(EtapasGravarSchema.safeParse({ etapas: [{ nome: 'Novo', tipo: 'entrada', obrigatorios: ['campo:'] }, { nome: 'Fim', tipo: 'fechado' }] }).success).toBe(false);
    // sem a lista dos desligados, o painel fica como está (quem liga e desliga é a aba Campos)
    expect(PainelGravarSchema.parse({ nome: 'X', sigla: 'xx', ajustes: {} }).ajustes.camposDesligados).toBeUndefined();
  });
  it('o CSV ganha uma coluna por campo do painel', () => {
    const c = cartao({ painelId: 'dev', campos: { sis: 'o2' } });
    const csv = csvDosChamados([c], { painel: () => 'Desenvolvimento', etapa: () => 'Novo' }, [lista]);
    const [cab, linha] = csv.slice(1).split('\r\n');
    expect(cab!.split(';').pop()).toBe('Sistema');
    expect(linha!.split(';').pop()).toBe('LineChat');
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
    gravidade: null, alcance: null, tipo: null, assunto: null, produtos: [], operadoras: [], etiquetas: [], campos: {}, espera: null,
    prazos: { resposta: { situacao: 'sem', limite: 0, usado: 0, percentual: 0, venceEm: null, cumpridoEm: null, conta: 'uteis' }, solucao: { situacao: 'sem', limite: 0, usado: 0, percentual: 0, venceEm: null, cumpridoEm: null, conta: 'uteis' } },
    pai: null, problema: null, filhos: { total: 0, abertos: 0 }, incidentes: 0, anotacoes: 0, origem: 'manual', reaberto: 0,
    criadoEm: '2026-10-13T12:00:00.000Z', atualizadoEm: '2026-10-13T12:00:00.000Z', ultimaAtividadeEm: '2026-10-13T12:00:00.000Z', resolvidoEm: null, fechadoEm: null,
    valor: null, empresa: null, resultado: null, motivoPerda: null, ...d,
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

describe('a tela inicial: os números de cada painel', () => {
  it('conta abertos, meus, sem dono, vencidos, perto, esperando e cada etapa que não fecha', () => {
    const prazo = (situacao: 'vencido' | 'perto' | 'no_prazo') => ({ situacao, limite: 60, usado: 30, percentual: 50, venceEm: null, cumpridoEm: null, conta: 'uteis' as const });
    const etapas = [{ id: 'novo', tipo: 'entrada' }, { id: 'n1', tipo: 'andamento' }, { id: 'res', tipo: 'resolvido' }, { id: 'fec', tipo: 'fechado' }] as EtapaPainel[];
    const l = [
      cartao({ id: 'a', etapaId: 'novo', responsavel: null, prazos: { resposta: prazo('vencido'), solucao: prazo('no_prazo') }, ultimaAtividadeEm: '2026-10-13T15:00:00.000Z' }),
      cartao({ id: 'b', etapaId: 'n1', responsavel: { id: 'eu', nome: 'Eu' }, prazos: { resposta: prazo('no_prazo'), solucao: prazo('perto') } }),
      cartao({ id: 'c', etapaId: 'n1', responsavel: { id: 'outro', nome: 'Outro' }, espera: { tipo: 'cliente', motivo: 'm', desde: '2026-10-13T12:00:00.000Z' } }),
      cartao({ id: 'd', etapaId: 'res', situacao: 'resolvido' }),
      cartao({ id: 'e', etapaId: 'fec', situacao: 'fechado' }),
      cartao({ id: 'f', painelId: 'outro-painel', etapaId: 'x' }),
    ];
    const [r] = resumoDosPaineis([{ id: 'p', etapas }], l, 'eu');
    expect(r).toEqual({
      painelId: 'p', abertos: 3, meus: 1, semDono: 1, vencidos: 1, perto: 1, esperando: 1, resolvidos: 1,
      porEtapa: [{ etapaId: 'novo', total: 1 }, { etapaId: 'n1', total: 2 }, { etapaId: 'res', total: 1 }],
      ultimaAtividadeEm: '2026-10-13T15:00:00.000Z', vendas: null,
    });
    // sem ninguém olhando (a integração), "meus" é zero
    expect(resumoDosPaineis([{ id: 'p', etapas }], l, null)[0]!.meus).toBe(0);
  });
});

describe('a IA e o histórico', () => {
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

describe('as etiquetas com cor (2.0, o pedido do Luan na prévia)', () => {
  it('a mesma etiqueta escrita de outro jeito: sem maiúscula, sem acento e com um espaço só', () => {
    expect(chaveDaEtiqueta('  Cliente   VIP ')).toBe('cliente vip');
    expect(chaveDaEtiqueta('Peça')).toBe(chaveDaEtiqueta('peca'));
    expect(etiquetasUnicas(['Cliente  VIP', 'cliente vip', ' áudio', 'Audio', ''])).toEqual(['Cliente VIP', 'áudio']);
  });

  it('a cor pelo nome: a da lista; a nova, a escolhida agora; a que não está em lugar nenhum, cinza', () => {
    const lista = [{ nome: 'Cliente VIP', cor: 'bad' as const }, { nome: 'algar', cor: 'roxo' as const }];
    expect(corDaEtiqueta(lista, 'cliente  vip')).toBe('bad');
    expect(corDaEtiqueta(lista, 'Retorno amanhã', { 'retorno amanha': 'ok' })).toBe('ok');
    // a que já existe fica com a cor dela, mesmo com outra escolhida
    expect(corDaEtiqueta(lista, 'ALGAR', { algar: 'ok' })).toBe('roxo');
    expect(corDaEtiqueta(lista, 'nova')).toBe('neutral');
  });

  it('renomear: acha a etiqueta escrita de qualquer jeito, não repete e diz quando não há nada a mudar', () => {
    expect(renomearEtiqueta(['Cliente VIP', 'retorno AMANHA', 'Peça'], 'retorno amanha', 'Ligar amanhã')).toEqual(['Cliente VIP', 'Ligar amanhã', 'Peça']);
    // o nome novo já estava no chamado: fica uma vez só
    expect(renomearEtiqueta(['vip', 'Cliente VIP'], 'vip', 'cliente vip')).toEqual(['cliente vip']);
    // só a maiúscula muda: também é mudança
    expect(renomearEtiqueta(['vip'], 'vip', 'VIP')).toEqual(['VIP']);
    expect(renomearEtiqueta(['VIP'], 'vip', 'VIP')).toBeNull();
    expect(renomearEtiqueta(['Peça'], 'vip', 'VIP')).toBeNull();
    // o pedido de editar pelo nome: o nome novo é opcional (sem ele, troca só a cor)
    expect(EtiquetaEditarPeloNomeSchema.parse({ de: ' Cliente   VIP ', cor: 'bad' })).toEqual({ de: 'Cliente VIP', cor: 'bad' });
  });

  it('o pedido leva a cor das novas (só as cores que existem); o nome fica com um espaço só', () => {
    const d = ChamadoCriarSchema.parse({ painelId: 'p', titulo: 'Teste', etiquetas: ['cliente   vip'], coresDasEtiquetas: { 'cliente vip': 'rosa' } });
    expect(d.etiquetas).toEqual(['cliente vip']);
    expect(d.coresDasEtiquetas).toEqual({ 'cliente vip': 'rosa' });
    expect(ChamadoCriarSchema.parse({ painelId: 'p', titulo: 'Teste' }).coresDasEtiquetas).toEqual({});
    expect(ChamadoAlterarSchema.safeParse({ coresDasEtiquetas: { x: 'dourado' } }).success).toBe(false);
  });
});

describe('a mensagem ao cliente pelo modelo aprovado (2.0, o WhatsApp oficial do Luan)', () => {
  const modelo = ModeloAprovadoSchema.parse({
    id: 'tpl-1', nome: 'ticket_atualizacao', texto: 'Olá, {{nome}}! Sobre o chamado {{ chamado }}: {{mensagem}}',
    variaveis: [{ nome: 'nome', valor: '{contato}' }, { nome: 'chamado', valor: '{codigo}' }, { nome: 'mensagem', valor: '{texto}' }],
  });

  it('a variável vai do jeito que o WhatsApp aceita: sem quebra de linha, sem 4 espaços, nunca vazia', () => {
    expect(valorDaVariavel('Trocamos o cabo.\n\nPode testar?')).toBe('Trocamos o cabo. · Pode testar?');
    expect(valorDaVariavel('a\tb     c')).toBe('a b   c');
    expect(valorDaVariavel('   ')).toBe('-');
    expect(valorDaVariavel('x'.repeat(1200))).toHaveLength(1000);
  });

  it('cada variável recebe o valor do chamado; a prévia troca as {{variáveis}} do texto do modelo', () => {
    const p = parametrosDoModelo(modelo, { contato: 'Joana', codigo: 'SUP-12', texto: 'Pode testar?' });
    expect(p).toEqual({ nome: 'Joana', chamado: 'SUP-12', mensagem: 'Pode testar?' });
    expect(textoDoModelo(modelo.texto, p)).toBe('Olá, Joana! Sobre o chamado SUP-12: Pode testar?');
    // sem o contato, a variável não vai vazia (o WhatsApp recusaria o modelo inteiro)
    expect(parametrosDoModelo(modelo, { codigo: 'SUP-12', texto: 'Oi' }).nome).toBe('-');
  });

  it('a ficha mostra a mensagem como vai sair: pelo modelo, ou o texto livre com os marcadores', () => {
    const valores = { contato: 'Joana', codigo: 'SUP-12', texto: 'Linha 1\nLinha 2' };
    const pelo = mensagemAoCliente({ envioCliente: 'modelo', modeloCliente: '{texto}', template: modelo });
    expect(pelo).toMatchObject({ peloModelo: true, nomeDoModelo: 'ticket_atualizacao' });
    expect(mensagemPreenchida(pelo, valores)).toBe('Olá, Joana! Sobre o chamado SUP-12: Linha 1 · Linha 2');
    const livre = mensagemAoCliente({ envioCliente: 'texto', modeloCliente: 'Olá, {contato}!\n{texto}', template: modelo });
    expect(livre).toEqual({ peloModelo: false, nomeDoModelo: null, texto: 'Olá, {contato}!\n{texto}', variaveis: [] });
    expect(mensagemPreenchida(livre, valores)).toBe('Olá, Joana!\nLinha 1\nLinha 2');
    // o modelo sem o texto guardado: as variáveis, uma por linha
    expect(mensagemPreenchida({ ...pelo, texto: '' }, valores)).toBe('nome: Joana\nchamado: SUP-12\nmensagem: Linha 1 · Linha 2');
  });

  it('o valor sugerido quando o modelo chega do LineChat: pelo nome, ou pela ordem de um aviso de chamado', () => {
    expect(valorSugeridoDaVariavel('Nome do cliente', 0)).toBe('{contato}');
    expect(valorSugeridoDaVariavel('protocolo', 0)).toBe('{codigo}');
    expect(valorSugeridoDaVariavel('mensagem', 0)).toBe('{texto}');
    expect(['1', '2', '3'].map((n, i) => valorSugeridoDaVariavel(n, i))).toEqual(['{contato}', '{codigo}', '{texto}']);
  });

  it('o que falta para mandar: o modelo, e o arquivo do cabeçalho quando ele tem imagem', () => {
    expect(faltaNoModeloAprovado(null)).toMatch(/Falta escolher o modelo aprovado/);
    expect(faltaNoModeloAprovado({ ...modelo, tipoArquivo: 'IMAGE', arquivo: '' })).toMatch(/tem imagem no cabeçalho/);
    expect(faltaNoModeloAprovado({ ...modelo, tipoArquivo: 'IMAGE', arquivo: 'https://exemplo.com/logo.png' })).toBeNull();
    expect(ModeloAprovadoSchema.safeParse({ ...modelo, arquivo: 'http://inseguro.com/a.png' }).success).toBe(false);
    expect(ModeloAprovadoSchema.safeParse({ ...modelo, variaveis: [{ nome: 'a', valor: '' }, { nome: 'a', valor: '' }] }).success).toBe(false);
    // o pedido sem nada do modelo (a tela de antes) continua valendo: pelo modelo, sem ele escolhido ainda
    const antes = AvisosChamadosSchema.parse({
      ativo: false, url: 'https://api.exemplo.com.br/chat/v1/message/send', usarChaveDoLineChat: true, numeroCliente: '', numeroEquipe: '',
      modeloCliente: '{texto}', pessoas: [], eventos: Object.fromEntries(EVENTOS_AVISO.map((e) => [e, { tela: true, whatsapp: false }])),
    });
    expect(antes).toMatchObject({ envioCliente: 'modelo', template: null, equipeLineChat: '', atribuirAQuemManda: false });
  });
});

describe('as citações nas anotações (@, o pedido do Luan na prévia)', () => {
  const equipe = [
    { id: 'b', nome: 'Bruno Teixeira' }, { id: 'm', nome: 'Marina Costa' }, { id: 'l', nome: 'Lúcio Andrade' },
    { id: 'a1', nome: 'Ana Paula' }, { id: 'a2', nome: 'Ana Souza' },
  ];
  it('o nome inteiro, ou só o primeiro quando só uma pessoa se chama assim', () => {
    expect(citadosNoTexto('@Bruno Teixeira, consegue olhar o SBC? @marina também', equipe)).toEqual([{ id: 'b', nome: 'Bruno Teixeira' }, { id: 'm', nome: 'Marina Costa' }]);
    // sem acento e em minúscula também; a mesma pessoa duas vezes conta uma
    expect(citadosNoTexto('@lucio andrade e de novo @Lúcio', equipe)).toEqual([{ id: 'l', nome: 'Lúcio Andrade' }]);
    // "Ana" é de duas pessoas: só vale o nome inteiro
    expect(citadosNoTexto('@Ana, e a @Ana Souza', equipe).map((p) => p.id)).toEqual(['a2']);
  });
  it('o e-mail e o nome pela metade não citam; a pontuação depois do nome, sim', () => {
    expect(citadosNoTexto('mande para bruno@empresa.com', equipe)).toEqual([]);
    expect(citadosNoTexto('@Brunoo', equipe)).toEqual([]);
    expect(citadosNoTexto('(@Marina Costa).', equipe).map((p) => p.id)).toEqual(['m']);
    expect(citadosNoTexto('sem arroba', equipe)).toEqual([]);
  });
  it('os pedaços para destacar e o @ que está sendo digitado', () => {
    expect(pedacosComCitacoes('Oi @Bruno, veja', equipe)).toEqual([{ texto: 'Oi ' }, { texto: '@Bruno', citado: { id: 'b', nome: 'Bruno Teixeira' } }, { texto: ', veja' }]);
    expect(citacaoDigitando('fala com @bru', 13)).toEqual({ inicio: 9, busca: 'bru' });
    expect(citacaoDigitando('fala com @Bruno Tei', 19)).toEqual({ inicio: 9, busca: 'Bruno Tei' });
    expect(citacaoDigitando('@', 1)).toEqual({ inicio: 0, busca: '' });
    expect(citacaoDigitando('e-mail bruno@emp', 16)).toBeNull();
    expect(citacaoDigitando('@bruno\nok', 9)).toBeNull();
    expect(citacaoDigitando('@Bruno Teixeira? Pode', 21)).toBeNull();
    expect(citacaoDigitando('oi @d\'avila', 11)).toEqual({ inicio: 3, busca: "d'avila" });
    expect(emLista(['Bruno', 'Marina', 'Lúcio'])).toBe('Bruno, Marina e Lúcio');
  });
});
