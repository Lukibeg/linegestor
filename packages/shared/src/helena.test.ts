/**
 * Trazer do Helena (2.0.3, decisão 0054). Os textos do histórico são os do painel Ingline - Comercial
 * (conferidos em 21/10, nos 55 cards de lá); os nomes de empresa e de pessoa aqui são de exemplo.
 */
import { describe, expect, it } from 'vitest';
import { instanteLocal } from './atendimento-prazos.js';
import { AJUSTES_DO_PAINEL_DE_VENDAS, textoDoEvento, type CampoPersonalizado, type EtapaPainel } from './atendimento.js';
import {
  centavosDoHelena, chaveDoNome, corDaEtiquetaDoHelena, empresaDoCard, empresaDoTitulo, historicoDoCard, lerLinhaDoHelena, ligarEtapasDoEvento,
  ligarPessoas, numerarNegociacoes, papelDoCampo, planoDaImportacao, planoDasEtapas, planoDosCampos, resumoDaImportacao, siglaDoPainelNovo,
  tipoDoCampoDoHelena, tituloDoHelena, valorDoCampoNoGestor, valorDoHelena, valorDoHelenaParaOCampo, valoresDoCard,
  type CampoDoHelena, type CardDoHelena, type EstadoDoGestorParaHelena, type EtapaDoHelena, type LeituraDoHelena, type LogDoHelena, type OpcoesDoHistorico,
} from './helena.js';
import { passagensDosEventos, relatorioDeVendas, type NegociacaoParaRelatorio } from './vendas.js';

const ETAPAS_H = ['StandBy', 'Lead Novo', 'Visita/Apresentação Marcada', 'Aguardando Envio de Informações', 'Aguardando Envio Proposta', 'Aguardando Assinatura Proposta', 'Aguardando Implantação', 'Em processo de Implantação', 'Cliente na base'];
const etapasDoHelena: EtapaDoHelena[] = ETAPAS_H.map((nome, i) => ({ id: `h${i}`, nome, posicao: i + 1, inicial: nome === 'Lead Novo', arquivada: false }));
const conhecidas = new Set(ETAPAS_H.map(chaveDoNome));
const opcoes: OpcoesDoHistorico = { ganho: 'Ganho', perdido: 'Perdido', etapaDoGestor: (n) => n, primeira: 'Lead Novo', conhecidas, painel: 'Comercial' };

let seq = 0;
const log = (em: string, texto: string, usuarioId: string | null = 'u-luan'): LogDoHelena => ({ id: `l${++seq}`, em, texto, usuarioId });
function card(c: Partial<CardDoHelena> & Pick<CardDoHelena, 'id'>): CardDoHelena {
  return {
    numero: null, codigo: null, titulo: 'Empresa - Produto', descricao: null, etapa: 'Lead Novo', situacao: 'OPEN',
    criadoEm: '2026-05-13T11:27:37.297Z', alteradoEm: '2026-09-11T17:58:24.099Z', concluidoEm: null, motivo: null, valor: null,
    responsavelId: 'u-luan', criadoPorId: 'u-luan', etiquetas: [], campos: {}, logs: [], ...c,
  };
}
/** o R$ do Intl vem com o espaço que não quebra: aqui, o espaço de sempre */
const sp = (s: string) => s.replace(/\u00a0/g, ' ');
const passos = (h: ReturnType<typeof historicoDoCard>) => h.eventos.map((e) => sp(e.tipo === 'etapa' ? `${e.dados.de.nome} → ${e.dados.para.nome}` : e.tipo === 'criado' ? `criado em ${e.dados.etapa}` : e.tipo === 'campo' ? `${e.dados.campo}: ${e.dados.de ?? '(vazio)'} → ${e.dados.para ?? ''}` : `${e.tipo}${e.dados.texto ? `: ${e.dados.texto}` : ''}`));

describe('as linhas do histórico do Helena', () => {
  it('lê cada jeito que o Helena escreve', () => {
    expect(lerLinhaDoHelena('Item criado por Luan França em Aguardando Implantação')).toEqual({ tipo: 'criado', por: 'Luan França', etapa: 'Aguardando Implantação' });
    expect(lerLinhaDoHelena('Item movido de Aguardando Implantação para Em processo de Implantação')).toEqual({ tipo: 'movido', de: 'Aguardando Implantação', para: 'Em processo de Implantação' });
    expect(lerLinhaDoHelena('Item marcado como "Ganho"')).toEqual({ tipo: 'marcado', como: 'Ganho', resultado: 'ganho' });
    expect(lerLinhaDoHelena('Item marcado como "Perda"')).toEqual({ tipo: 'marcado', como: 'Perda', resultado: 'perdido' });
    expect(lerLinhaDoHelena('Item estava marcado como "Ganho" e foi reaberto ')).toEqual({ tipo: 'reaberto', estava: 'Ganho', resultado: 'ganho' });
    expect(lerLinhaDoHelena('Valor atribuído alterado para R$ 400,00')).toEqual({ tipo: 'valor', de: null, para: 40_000 });
    // o R$ com o espaço que não quebra (o jeito do navegador) também
    expect(lerLinhaDoHelena('Valor atribuído alterado de R$\u00a01.878,90 para R$\u00a01.949,90')).toEqual({ tipo: 'valor', de: 187_890, para: 194_990 });
    expect(lerLinhaDoHelena('Título alterado de ADS WhatsApp para ADS - WhatsApp')).toEqual({ tipo: 'titulo', de: 'ADS WhatsApp', para: 'ADS - WhatsApp' });
    expect(lerLinhaDoHelena('Descrição alterada')).toEqual({ tipo: 'descricao' });
    expect(lerLinhaDoHelena('A etiqueta P/R Cliente foi adicionada')).toEqual({ tipo: 'outro' });
    expect(lerLinhaDoHelena('Data de criação ajustada de 06/07/2026 14:51 para 05/05/2026 11:59')).toEqual({ tipo: 'outro' });
  });

  it('o "para" dentro do nome da etapa: fica a divisão em que as duas são etapas do painel', () => {
    const com = new Set([...conhecidas, chaveDoNome('Envio para o cliente')]);
    expect(lerLinhaDoHelena('Item movido de Envio para o cliente para Lead Novo', com)).toEqual({ tipo: 'movido', de: 'Envio para o cliente', para: 'Lead Novo' });
    expect(lerLinhaDoHelena('Item movido de Lead Novo para Envio para o cliente', com)).toEqual({ tipo: 'movido', de: 'Lead Novo', para: 'Envio para o cliente' });
    // a etapa que começa com "Em": o " em " do criado é minúsculo
    expect(lerLinhaDoHelena('Item criado por Luan em Em processo de Implantação', conhecidas)).toEqual({ tipo: 'criado', por: 'Luan', etapa: 'Em processo de Implantação' });
  });
});

describe('o histórico de um card vira o da negociação', () => {
  it('a venda de ponta a ponta: nasceu, andou, ganhou o valor e foi ganha no dia da Conclusão', () => {
    const c = card({
      id: 'arena', codigo: 'IC-34', numero: 34, situacao: 'WON', etapa: 'Cliente na base', valor: 40_000, concluidoEm: '2026-09-11T17:58:24.099Z',
      logs: [
        log('2026-05-13T11:27:37.332Z', 'Item criado por Luan França em Aguardando Implantação'),
        log('2026-06-15T22:34:33.862Z', 'Valor atribuído alterado para R$ 400,00'),
        log('2026-09-01T14:23:32.544Z', 'Item movido de Aguardando Implantação para Em processo de Implantação'),
        log('2026-09-01T14:23:36.363Z', 'Item movido de Em processo de Implantação para Cliente na base'),
        log('2026-09-11T17:58:24.141Z', 'Valor atribuído alterado de R$ 400,00 para R$ 400,00'),
        log('2026-09-11T17:58:24.141Z', 'Item marcado como "Ganho"'),
      ],
    });
    const h = historicoDoCard(c, opcoes);
    expect(passos(h)).toEqual([
      'criado em Aguardando Implantação',
      'Mensalidade: (vazio) → R$ 400,00',
      'Aguardando Implantação → Em processo de Implantação',
      'Em processo de Implantação → Cliente na base',
      // o "de R$ 400,00 para R$ 400,00" não mudou nada: fica de fora
      'Cliente na base → Ganho',
    ]);
    expect(h).toMatchObject({ etapa: 'Ganho', resultado: 'ganho', fechadoEm: '2026-09-11T17:58:24.099Z', movimentos: 2, reaberturas: 0, completado: false, semHistorico: false });
    const ganho = h.eventos.find((e) => e.dados.resultado === 'ganho')!;
    expect(ganho.dados).toMatchObject({ resultado: 'ganho', valor: 40_000, de: { nome: 'Cliente na base' }, para: { nome: 'Ganho' } });
    expect(ganho.dados.concluidoEm).toBeUndefined();
    // cada evento leva a linha do Helena (para refazer o histórico na próxima vez)
    expect(h.eventos.every((e) => typeof e.dados.helena === 'string')).toBe(true);
    expect(h.eventos[0]!.dados).toMatchObject({ origem: 'helena', etapa: 'Aguardando Implantação', venda: true, noHelena: 'IC-34' });
    expect(textoDoEvento('criado', h.eventos[0]!.dados)).toBe('criou a negociação (Trazida do Helena, era IC-34) em Aguardando Implantação');
    // duas linhas no mesmo milésimo: a ordem do Helena fica
    const ems = h.eventos.slice(1).map((e) => e.em);
    expect([...ems].sort()).toEqual(ems);
    expect(new Set(ems).size).toBe(ems.length);
  });

  it('o card duplicado com a Conclusão de antes: nasce onde está, e o último ganho leva o dia escolhido', () => {
    const c = card({
      id: 'graca', situacao: 'WON', etapa: 'Cliente na base', valor: 187_890, criadoEm: '2026-05-05T14:59:00Z', concluidoEm: '2026-05-05T15:00:00Z', alteradoEm: '2026-09-14T17:56:10Z',
      logs: [
        log('2026-07-06T17:52:00Z', 'Valor atribuído alterado de R$ 1.878,90 para R$ 1.878,90'),
        log('2026-07-06T17:52:01Z', 'Item marcado como "Ganho"'),
        log('2026-07-06T17:53:00Z', 'Valor atribuído alterado de R$ 1.878,90 para R$ 1.949,90'),
        log('2026-07-11T13:13:00Z', 'Valor atribuído alterado de R$ 1.949,90 para R$ 1.878,90'),
        log('2026-09-14T17:56:00Z', 'Item estava marcado como "Ganho" e foi reaberto '),
        log('2026-09-14T17:56:01Z', 'Item marcado como "Ganho"'),
        log('2026-09-14T17:56:02Z', 'Data de criação ajustada de 06/07/2026 14:51 para 05/05/2026 11:59'),
      ],
    });
    const h = historicoDoCard(c, opcoes);
    expect(passos(h)).toEqual([
      'criado em Cliente na base',
      'Cliente na base → Ganho',
      'Mensalidade: R$ 1.878,90 → R$ 1.949,90',
      'Mensalidade: R$ 1.949,90 → R$ 1.878,90',
      'Ganho → Cliente na base',
      'reaberto',
      'Cliente na base → Ganho',
      'helena: Data de criação ajustada de 06/07/2026 14:51 para 05/05/2026 11:59',
    ]);
    expect(h).toMatchObject({ etapa: 'Ganho', resultado: 'ganho', fechadoEm: '2026-05-05T15:00:00.000Z', reaberturas: 1, movimentos: 0 });
    const ganhos = h.eventos.filter((e) => e.dados.resultado === 'ganho');
    // só o último ganho leva a Conclusão (o dia que a pessoa escolheu); o primeiro foi desfeito
    expect(ganhos[0]!.dados.concluidoEm).toBeUndefined();
    expect(ganhos[1]!.dados).toMatchObject({ concluidoEm: '2026-05-05', valor: 187_890 });
    expect(sp(textoDoEvento('etapa', ganhos[1]!.dados))).toBe('marcou como ganho (R$ 1.878,90/mês), estava em Cliente na base — fechou em 05/05/2026');
    expect(textoDoEvento('reaberto', h.eventos.find((e) => e.tipo === 'reaberto')!.dados)).toBe('reabriu a negociação');
    expect(textoDoEvento('helena', h.eventos[h.eventos.length - 1]!.dados)).toBe('no Helena: Data de criação ajustada de 06/07/2026 14:51 para 05/05/2026 11:59');
  });

  it('a perda leva o motivo do Helena; o card ganho que anda no Helena fica no Ganho, e reabre na etapa em que estava', () => {
    const perdida = historicoDoCard(card({
      id: 'p', situacao: 'LOST', etapa: 'StandBy', concluidoEm: '2026-06-18T21:12:07Z', motivo: 'Sem resposta do lead',
      logs: [
        log('2026-02-16T13:31:35Z', 'Item criado por Luan em Lead Novo'),
        log('2026-02-24T00:29:05Z', 'Item movido de Lead Novo para Aguardando Assinatura Proposta'),
        log('2026-03-23T22:09:58Z', 'Item movido de Aguardando Assinatura Proposta para StandBy'),
        log('2026-06-18T21:12:07Z', 'Item marcado como "Perda"'),
      ],
    }), opcoes);
    expect(perdida).toMatchObject({ etapa: 'Perdido', resultado: 'perdido', movimentos: 2 });
    expect(perdida.eventos[perdida.eventos.length - 1]!.dados).toMatchObject({ resultado: 'perdido', motivoPerda: 'Sem resposta do lead', de: { nome: 'StandBy' } });

    const andou = historicoDoCard(card({
      id: 'a', situacao: 'OPEN', etapa: 'Cliente na base', valor: 145_000,
      logs: [
        log('2026-07-06T17:51:00Z', 'Item marcado como "Ganho"'),
        log('2026-07-10T10:00:00Z', 'Item movido de Em processo de Implantação para Cliente na base'),
        log('2026-07-23T22:24:00Z', 'Item estava marcado como "Ganho" e foi reaberto '),
      ],
    }), opcoes);
    expect(passos(andou)).toEqual([
      'criado em Em processo de Implantação',
      'Em processo de Implantação → Ganho',
      'helena: Item movido de Em processo de Implantação para Cliente na base (já estava ganha)',
      'Ganho → Cliente na base',
      'reaberto',
    ]);
    expect(andou).toMatchObject({ etapa: 'Cliente na base', resultado: null, fechadoEm: null, reaberturas: 1, movimentos: 0 });
  });

  it('sem o histórico (o Helena não devolveu): nasce na etapa de agora e acaba na Conclusão', () => {
    const h = historicoDoCard(card({ id: 's', situacao: 'WON', etapa: 'Cliente na base', valor: 99_000, concluidoEm: '2026-10-02T13:00:00Z', logs: null }), opcoes);
    expect(passos(h)).toEqual(['criado em Cliente na base', 'Cliente na base → Ganho']);
    expect(h).toMatchObject({ semHistorico: true, completado: false, resultado: 'ganho', fechadoEm: '2026-10-02T13:00:00.000Z' });
    expect(h.eventos[1]!.dados.valor).toBe(99_000);
  });

  it('o histórico que não chega aonde o card está é completado pelo próprio card', () => {
    // ganho no Helena, sem a linha do ganho
    const a = historicoDoCard(card({ id: 'x', situacao: 'WON', etapa: 'Cliente na base', concluidoEm: '2026-08-01T15:00:00Z', logs: [log('2026-07-01T10:00:00Z', 'Item criado por Luan em Lead Novo')] }), opcoes);
    expect(passos(a)).toEqual(['criado em Lead Novo', 'Lead Novo → Ganho']);
    expect(a).toMatchObject({ completado: true, resultado: 'ganho' });
    // em andamento numa etapa a que nenhuma linha leva
    const b = historicoDoCard(card({ id: 'y', situacao: 'OPEN', etapa: 'StandBy', alteradoEm: '2026-08-02T10:00:00Z', logs: [log('2026-07-01T10:00:00Z', 'Item criado por Luan em Lead Novo')] }), opcoes);
    expect(passos(b)).toEqual(['criado em Lead Novo', 'Lead Novo → StandBy']);
    expect(b).toMatchObject({ completado: true, etapa: 'StandBy', movimentos: 1 });
    // a linha que o Helena escreve e o Gestor não reconhece fica escrita como está
    const c = historicoDoCard(card({ id: 'z', logs: [log('2026-07-01T10:00:00Z', 'Item criado por Luan em Lead Novo'), log('2026-07-02T10:00:00Z', 'Item marcado como "Em espera"')] }), opcoes);
    expect(passos(c)).toEqual(['criado em Lead Novo', 'helena: Item marcado como "Em espera"']);
  });

  it('as etapas ganham o id quando já existem', () => {
    const ids: Record<string, string> = { 'Lead Novo': 'e1', StandBy: 'e2' };
    const id = (n: string) => ids[n] ?? null;
    expect(ligarEtapasDoEvento('criado', { etapa: 'Lead Novo' }, id)).toEqual({ etapa: 'Lead Novo', etapaId: 'e1' });
    expect(ligarEtapasDoEvento('etapa', { de: { nome: 'Lead Novo', nivel: null }, para: { nome: 'StandBy', nivel: null } }, id))
      .toEqual({ de: { nome: 'Lead Novo', nivel: null, id: 'e1' }, para: { nome: 'StandBy', nivel: null, id: 'e2' } });
    expect(ligarEtapasDoEvento('campo', { campo: 'Título' }, id)).toEqual({ campo: 'Título' });
  });
});

const CAMPOS_H: CampoDoHelena[] = [
  { chave: 'cnpj-64', nome: 'CNPJ', tipo: 'TEXT', posicao: 1, opcoes: [] },
  { chave: 'servi-os-ofertados', nome: 'Serviços Ofertados', tipo: 'MULTISELECT', posicao: 2, opcoes: ['LinePBX', 'LineChat', 'VoiceNet'] },
  { chave: 'valor-mensalidade-li-38', nome: 'Valor Mensalidade LinePBX', tipo: 'CURRENCY', posicao: 3, opcoes: [] },
  { chave: 'valor-mensalidade-li-13', nome: 'Valor Mensalidade LineChat', tipo: 'CURRENCY', posicao: 4, opcoes: [] },
  { chave: 'valor-mensalidade-vo', nome: 'Valor Mensalidade VoiceNet', tipo: 'CURRENCY', posicao: 5, opcoes: [] },
  { chave: 'valor-ativa-o-linepb', nome: 'Valor Ativação LinePBX', tipo: 'CURRENCY', posicao: 6, opcoes: [] },
  { chave: 'origem-de-lead-1', nome: 'Origem de lead', tipo: 'SINGLESELECT', posicao: 7, opcoes: ['Indicação', 'Prospecção ativa', 'Feira'] },
  { chave: 'indica-o-', nome: 'Indicação', tipo: 'SINGLESELECT', posicao: 8, opcoes: ['Parceiro A', 'Cliente B'] },
  { chave: 'licen-as-whatsapp-3', nome: 'Licenças WhatsApp', tipo: 'NUMBER', posicao: 9, opcoes: [] },
  { chave: 'data-de-abertuar', nome: 'Data de abertura', tipo: 'DATE', posicao: 10, opcoes: [] },
  { chave: 'observador-89', nome: 'Observador', tipo: 'MULTISELECT', posicao: 11, opcoes: [] },
  { chave: '-rea-de-atua-o-lead', nome: 'Área de Atuação Lead', tipo: 'SINGLESELECT', posicao: 12, opcoes: ['Saúde'] },
  { chave: 'tipo-servidor-54', nome: 'Tipo servidor', tipo: 'SINGLESELECT', posicao: 13, opcoes: ['Nuvem', 'Local'] },
  { chave: 'grupo-1', nome: 'Informações Lead', tipo: 'GROUP', posicao: 14, opcoes: [] },
];
const PRODUTOS = [{ id: 'p-pbx', nome: 'LinePBX' }, { id: 'p-chat', nome: 'LineChat' }, { id: 'p-voz', nome: 'VoiceNet' }];

describe('os valores: a mensalidade é o Valor atribuído', () => {
  it('o papel de cada campo', () => {
    expect(papelDoCampo({ nome: 'Valor Mensalidade LinePBX', tipo: 'CURRENCY' })).toEqual({ papel: 'mensalidade', produto: 'LinePBX' });
    expect(papelDoCampo({ nome: 'Valor Ativação LineChat', tipo: 'TEXT' })).toEqual({ papel: 'ativacao', produto: 'LineChat' });
    expect(papelDoCampo({ nome: 'Serviços Ofertados', tipo: 'MULTISELECT' })).toEqual({ papel: 'produtos' });
    expect(papelDoCampo({ nome: 'Observador', tipo: 'MULTISELECT' })).toEqual({ papel: 'observadores' });
    expect(papelDoCampo({ nome: 'Área de Atuação Lead', tipo: 'SINGLESELECT' }).papel).toBe('fora');
    expect(papelDoCampo({ nome: 'Informações Lead', tipo: 'GROUP' }).papel).toBe('fora');
    expect(papelDoCampo({ nome: 'CNPJ', tipo: 'TEXT' })).toEqual({ papel: 'campo' });
  });

  it('o valor do Helena, com ou sem o embrulho da API, em centavos', () => {
    expect(centavosDoHelena('R$ 1.500,00')).toBe(150_000);
    expect(centavosDoHelena(1500)).toBe(150_000);
    expect(centavosDoHelena(639.9)).toBe(63_990);
    expect(centavosDoHelena({ valueString: 'R$ 956,00', valuesInteger: [] })).toBe(95_600);
    expect(centavosDoHelena('')).toBeNull();
    expect(centavosDoHelena(null)).toBeNull();
    expect(valorDoHelena({ valueString: null, valuesInteger: [3] })).toBe(3);
    expect(valorDoHelena({ valueString: null, valuesId: ['a', 'b'] })).toEqual(['a', 'b']);
    expect(valorDoHelena(['LinePBX', 'VoiceNet'])).toEqual(['LinePBX', 'VoiceNet']);
  });

  it('a soma bate: o valor fica dividido por produto; a ativação também', () => {
    const v = valoresDoCard({ valor: 187_890, campos: { 'servi-os-ofertados': ['LinePBX', 'VoiceNet', 'LineChat'], 'valor-mensalidade-li-38': 'R$ 790,00', 'valor-mensalidade-li-13': 'R$ 639,90', 'valor-mensalidade-vo': 'R$ 449,00', 'valor-ativa-o-linepb': 'R$ 1.000,00' } }, CAMPOS_H, PRODUTOS);
    expect(v).toEqual({
      valor: 187_890, valoresDosProdutos: { 'p-pbx': 79_000, 'p-chat': 63_990, 'p-voz': 44_900 },
      ativacao: 100_000, ativacoesDosProdutos: { 'p-pbx': 100_000 },
      produtos: ['p-pbx', 'p-voz', 'p-chat'], semCadastro: [], nota: null,
    });
  });

  it('a soma não bate: fica o Valor atribuído (o que o relatório do Helena soma), e o histórico guarda os de lá', () => {
    const v = valoresDoCard({ valor: 145_000, campos: { 'valor-mensalidade-vo': 'R$ 1.190,00' } }, CAMPOS_H, PRODUTOS);
    expect(v).toMatchObject({ valor: 145_000, valoresDosProdutos: {}, produtos: ['p-voz'] });
    expect(v.nota).toContain('VoiceNet R$');
    expect(v.nota).toContain('e o Valor atribuído é R$');
    // sem Valor atribuído: sem valor (o 0 do Helena é "sem valor")
    expect(valoresDoCard({ valor: null, campos: { 'valor-mensalidade-li-38': 'R$ 1.900,00' } }, CAMPOS_H, PRODUTOS)).toMatchObject({ valor: null, valoresDosProdutos: {} });
    // o produto que não está no cadastro fica de fora (e é dito)
    expect(valoresDoCard({ valor: 10_000, campos: { 'servi-os-ofertados': ['LinePBX', 'Link SIP'] } }, CAMPOS_H, PRODUTOS)).toMatchObject({ produtos: ['p-pbx'], semCadastro: ['Link SIP'] });
  });
});

const campoDoGestor = (c: Partial<CampoPersonalizado> & Pick<CampoPersonalizado, 'id' | 'nome' | 'tipo'>): CampoPersonalizado => ({ painelId: 'com', dica: null, opcoes: [], ativo: true, ordem: 0, incluirNaHora: false, ...c });
const GESTOR_CAMPOS: CampoPersonalizado[] = [
  campoDoGestor({ id: 'f-cnpj', nome: 'CNPJ', tipo: 'texto' }),
  campoDoGestor({ id: 'f-origem', nome: 'Origem de lead', tipo: 'lista', opcoes: [{ id: 'o1', nome: 'Indicação', ativa: true }, { id: 'o2', nome: 'Site', ativa: true }] }),
  // a Indicação do Comercial é uma lista em que se inclui na hora (2.0.3)
  campoDoGestor({ id: 'f-ind', nome: 'Indicação', tipo: 'lista', incluirNaHora: true, opcoes: [{ id: 'i1', nome: 'Cliente B', ativa: true }] }),
];

describe('os campos do painel', () => {
  it('usa o que tem o mesmo nome, cria o resto com o tipo de lá e deixa de fora o que vira outra coisa', () => {
    const cards = [{ campos: { 'cnpj-64': '00.000.000/0001-00', 'origem-de-lead-1': 'Feira', 'indica-o-': 'Parceiro A', 'licen-as-whatsapp-3': 3, 'data-de-abertuar': '2026-01-30T00:00:00', '-rea-de-atua-o-lead': 'Saúde' } }];
    const p = planoDosCampos(CAMPOS_H, GESTOR_CAMPOS, cards);
    const por = (k: string) => p.find((c) => c.chave === k)!;
    expect(por('cnpj-64')).toMatchObject({ acao: 'usa', gestorId: 'f-cnpj', tipo: 'texto' });
    // a lista do Gestor ganha as opções do Helena que ela não tem
    expect(por('origem-de-lead-1')).toMatchObject({ acao: 'usa', gestorId: 'f-origem', opcoesNovas: ['Prospecção ativa', 'Feira'] });
    // a Indicação do Gestor é a lista em que se inclui na hora: ganha as opções do Helena que ela não tem
    expect(por('indica-o-')).toMatchObject({ acao: 'usa', gestorId: 'f-ind', tipo: 'lista', opcoesNovas: ['Parceiro A'] });
    expect(por('licen-as-whatsapp-3')).toMatchObject({ acao: 'cria', tipo: 'numero' });
    expect(por('data-de-abertuar')).toMatchObject({ acao: 'cria', tipo: 'data' });
    expect(por('valor-mensalidade-li-38')).toMatchObject({ acao: 'fora', motivo: 'vira a mensalidade de cada produto' });
    expect(por('servi-os-ofertados')).toMatchObject({ acao: 'fora', motivo: 'vira os produtos da negociação' });
    expect(por('observador-89')).toMatchObject({ acao: 'fora', motivo: 'vira os observadores da negociação' });
    expect(por('-rea-de-atua-o-lead').motivo).toBe('a escolha de 17/10, nos campos do painel de Vendas');
    expect(por('tipo-servidor-54')).toMatchObject({ acao: 'fora', motivo: 'nenhuma negociação usa' });
    // o grupo não guarda valor: fica de fora sem a prévia citar
    expect(por('grupo-1')).toMatchObject({ acao: 'fora', motivo: null });
  });

  it('o painel vai até 30 campos; o nome de um campo do sistema não vira campo', () => {
    const cheio = Array.from({ length: 29 }, (_, i) => campoDoGestor({ id: `f${i}`, nome: `Campo ${i}`, tipo: 'texto' }));
    const helena: CampoDoHelena[] = [
      { chave: 'a', nome: 'Primeiro', tipo: 'TEXT', posicao: 1, opcoes: [] },
      { chave: 'b', nome: 'Segundo', tipo: 'TEXT', posicao: 2, opcoes: [] },
      { chave: 'c', nome: 'Empresa', tipo: 'TEXT', posicao: 3, opcoes: [] },
    ];
    const p = planoDosCampos(helena, cheio, [{ campos: { a: 'x', b: 'y', c: 'z' } }]);
    expect(p.map((c) => [c.chave, c.acao])).toEqual([['a', 'cria'], ['b', 'fora'], ['c', 'fora']]);
    expect(p[1]!.motivo).toBe('o painel chegou a 30 campos');
    expect(p[2]!.motivo).toBe('tem o nome de um campo do sistema');
  });

  it('o valor no jeito do campo do Gestor', () => {
    expect(tipoDoCampoDoHelena('SINGLESELECT', true)).toBe('lista');
    expect(tipoDoCampoDoHelena('MULTISELECT', true)).toBe('lista_varios');
    expect(tipoDoCampoDoHelena('MULTISELECT', false)).toBe('texto');
    expect(tipoDoCampoDoHelena('TEXTAREA', false)).toBe('texto_longo');
    expect(tipoDoCampoDoHelena('DATETIME', false)).toBe('data');
    expect(tipoDoCampoDoHelena('INTEGER', false)).toBe('numero');
    expect(tipoDoCampoDoHelena('OUTRO', false)).toBe('texto');
    const origem = GESTOR_CAMPOS[1]!;
    expect(valorDoCampoNoGestor(origem, valorDoHelenaParaOCampo('lista', 'Site'))).toBe('o2');
    expect(valorDoCampoNoGestor(origem, valorDoHelenaParaOCampo('lista', 'Rádio'))).toBeNull();
    expect(valorDoCampoNoGestor({ nome: 'Data', tipo: 'data', opcoes: [] }, valorDoHelenaParaOCampo('data', '2026-01-30T00:00:00'))).toBe('2026-01-30');
    expect(valorDoCampoNoGestor({ nome: 'N', tipo: 'numero', opcoes: [] }, valorDoHelenaParaOCampo('numero', 'R$ 1.500,50'))).toBe(1500.5);
    expect(valorDoCampoNoGestor({ nome: 'T', tipo: 'texto', opcoes: [] }, valorDoHelenaParaOCampo('texto', ['A', 'B']))).toBe('A, B');
  });
});

describe('as pessoas, as empresas e as etiquetas', () => {
  it('a pessoa pelo nome; senão, pelo primeiro nome de uma pessoa só', () => {
    const pessoas = [{ id: 'luan', nome: 'Luan França' }, { id: 'ana', nome: 'Ana Souza' }, { id: 'ana2', nome: 'Ana Lima' }, { id: 'velho', nome: 'Bruno Dias', ativo: false }];
    expect(ligarPessoas(['Luan França', 'Luan', 'Ana', 'Bruno', 'Zé'], pessoas)).toEqual({
      'Luan França': { pessoaId: 'luan', como: 'nome' },
      Luan: { pessoaId: 'luan', como: 'primeiro_nome' },
      Ana: { pessoaId: null, como: 'nenhum' },
      Bruno: { pessoaId: 'velho', como: 'primeiro_nome' },
      Zé: { pessoaId: null, como: 'nenhum' },
    });
  });

  it('a empresa pelo título (sem o "(Cópia)"), o cliente pelo CNPJ ou pelo nome', () => {
    expect(tituloDoHelena('Clínica Exemplo (Cópia)')).toBe('Clínica Exemplo');
    expect(tituloDoHelena('Padaria - Link Sip (Cópia) (cópia)')).toBe('Padaria - Link Sip');
    expect(empresaDoTitulo('APAE Exemplo - Link SIP (Cópia)')).toBe('APAE Exemplo');
    expect(empresaDoTitulo('Mercado Bom - VoiceNet (Centro)')).toBe('Mercado Bom');
    const clientes = [{ id: 'c1', nomes: ['Padaria Estrela', 'Estrela Panificação Ltda'], cnpj: '11222333000181' }, { id: 'c2', nomes: ['Hotel Mar'], cnpj: '99888777000166' }];
    expect(empresaDoCard('Qualquer nome - LinePBX', '99.888.777/0001-66', clientes)).toEqual({ clienteId: 'c2', empresa: 'Qualquer nome', como: 'cnpj' });
    expect(empresaDoCard('Padaria Estrela - WhatsApp', null, clientes)).toEqual({ clienteId: 'c1', empresa: 'Padaria Estrela', como: 'nome' });
    expect(empresaDoCard('Loja Nova - WhatsApp', '', clientes)).toEqual({ clienteId: null, empresa: 'Loja Nova', como: 'nenhum' });
  });

  it('a cor da etiqueta mais perto da do Helena', () => {
    expect(corDaEtiquetaDoHelena('#008A00')).toBe('ok');
    expect(corDaEtiquetaDoHelena('#D32F2F')).toBe('bad');
    expect(corDaEtiquetaDoHelena('#CA024F')).toBe('rosa');
    expect(corDaEtiquetaDoHelena('#F57C00')).toBe('signal');
    expect(corDaEtiquetaDoHelena('#EAAC30')).toBe('amarelo');
    expect(corDaEtiquetaDoHelena('#2457D6')).toBe('accent');
    expect(corDaEtiquetaDoHelena('#7C3AED')).toBe('roxo');
    expect(corDaEtiquetaDoHelena('#888888')).toBe('neutral');
    // a API manda também "rgb(…)"
    expect(corDaEtiquetaDoHelena('rgb(255, 0, 0)')).toBe('bad');
    expect(corDaEtiquetaDoHelena('rgb(36, 87, 214)')).toBe('accent');
    expect(corDaEtiquetaDoHelena(null)).toBe('neutral');
  });
});

describe('as etapas do painel', () => {
  it('o painel novo: as do Helena na ordem de lá (a inicial é a entrada), o Ganho e o Perdido no fim', () => {
    const p = planoDasEtapas(etapasDoHelena, [], ['Lead Novo', 'Etapa que saiu']);
    expect(p.etapas.map((e) => `${e.nome}:${e.tipo}${e.resultado ? `:${e.resultado}` : ''}`)).toEqual([
      'StandBy:andamento', 'Lead Novo:entrada', 'Visita/Apresentação Marcada:andamento', 'Aguardando Envio de Informações:andamento',
      'Aguardando Envio Proposta:andamento', 'Aguardando Assinatura Proposta:andamento', 'Aguardando Implantação:andamento',
      'Em processo de Implantação:andamento', 'Cliente na base:andamento', 'Ganho:fechado:ganho', 'Perdido:fechado:perdido',
    ]);
    expect(p.etapas.every((e) => e.id === null)).toBe(true);
    expect(p.historicas).toEqual(['Etapa que saiu']);
    expect(p.doHelena['Etapa que saiu']).toBe('Etapa que saiu');
    expect(p.erro).toBeNull();
  });

  it('o painel que já existe: a etapa com o mesmo nome fica (com o id e as regras), a vazia sai, a que tem negociação fica', () => {
    const gestor = [
      { id: 'g-lead', nome: 'Lead', tipo: 'entrada' as const, resultado: null, obrigatorios: [], avisar: [], negociacoes: 0 },
      { id: 'g-neg', nome: 'Negociação', tipo: 'andamento' as const, resultado: null, obrigatorios: ['valor' as const], avisar: ['u1'], negociacoes: 2 },
      { id: 'g-standby', nome: 'Standby', tipo: 'andamento' as const, resultado: null, obrigatorios: [], avisar: ['u2'], negociacoes: 1 },
      { id: 'g-ganho', nome: 'Ganhou', tipo: 'fechado' as const, resultado: 'ganho' as const, obrigatorios: ['valor' as const], avisar: [], negociacoes: 4 },
      { id: 'g-perdido', nome: 'Perdido', tipo: 'fechado' as const, resultado: 'perdido' as const, obrigatorios: [], avisar: [], negociacoes: 1 },
    ];
    const p = planoDasEtapas(etapasDoHelena, gestor, []);
    expect(p.etapas.find((e) => e.nome === 'StandBy')).toMatchObject({ id: 'g-standby', avisar: ['u2'], helena: 'StandBy' });
    expect(p.etapas.find((e) => e.nome === 'Negociação')).toMatchObject({ id: 'g-neg', tipo: 'andamento', obrigatorios: ['valor'], helena: null });
    expect(p.saem).toEqual([{ id: 'g-lead', nome: 'Lead' }]);
    expect(p.etapas.slice(-2).map((e) => [e.id, e.nome])).toEqual([['g-ganho', 'Ganhou'], ['g-perdido', 'Perdido']]);
    expect(p.ganho).toBe('Ganhou');
  });

  it('a etapa do Helena com o nome do Ganho não se confunde com a etapa final', () => {
    const helena = [{ id: 'a', nome: 'Lead', posicao: 1, inicial: true, arquivada: false }, { id: 'b', nome: 'Ganho', posicao: 2, inicial: false, arquivada: false }];
    const p = planoDasEtapas(helena, [], ['Perdido']);
    expect(p.etapas.map((e) => `${e.nome}:${e.resultado ?? '-'}`)).toEqual(['Lead:-', 'Ganho (Helena):-', 'Ganho:ganho', 'Perdido:perdido']);
    expect(p.doHelena.Ganho).toBe('Ganho (Helena)');
    expect(p.historicas).toEqual(['Perdido (Helena)']);
  });

  it('mais de 20 etapas não cabem', () => {
    const muitas = Array.from({ length: 19 }, (_, i) => ({ id: `x${i}`, nome: `Etapa ${i}`, posicao: i, inicial: i === 0, arquivada: false }));
    expect(planoDasEtapas(muitas, [], []).erro).toContain('vai até 20 etapas');
  });

  it('o número do Helena fica quando está livre; a sigla do painel novo também', () => {
    const n = numerarNegociacoes([{ id: 'a', numero: 34, jaTem: null }, { id: 'b', numero: 2, jaTem: null }, { id: 'c', numero: 7, jaTem: 40 }, { id: 'd', numero: null, jaTem: null }], [1, 2, 3]);
    expect([...n.entries()]).toEqual([['c', 40], ['a', 34], ['b', 41], ['d', 42]]);
    expect(siglaDoPainelNovo('IC', ['SUP', 'DEV'])).toBe('IC');
    expect(siglaDoPainelNovo('IC', ['IC', 'COM'])).toBe('VEN');
    expect(siglaDoPainelNovo(null, [])).toBe('IC');
  });
});

describe('o plano inteiro: a prévia e o relatório do Gestor igual ao do Helena', () => {
  const leitura: LeituraDoHelena = {
    lidaEm: '2026-10-21T19:00:00Z',
    usuarios: [{ id: 'u-luan', nome: 'Luan França' }, { id: 'u-carla', nome: 'Carla Exemplo' }],
    painel: {
      id: 'painel-h', nome: 'Ingline - Comercial', sigla: 'IC', etapas: etapasDoHelena, campos: CAMPOS_H,
      etiquetas: [{ id: 't1', nome: 'P/R Ingline', cor: '#008A00' }, { id: 't2', nome: 'P/R Cliente', cor: '#CA024F' }],
    },
    cards: [
      card({
        id: 'c1', numero: 34, codigo: 'IC-34', titulo: 'Padaria Estrela - LinePBX', situacao: 'WON', etapa: 'Cliente na base', valor: 99_000,
        criadoEm: '2026-09-01T12:00:00Z', concluidoEm: '2026-10-02T13:00:00Z', etiquetas: ['t1'],
        campos: { 'servi-os-ofertados': ['LinePBX'], 'valor-mensalidade-li-38': 'R$ 990,00', 'origem-de-lead-1': 'Feira', 'licen-as-whatsapp-3': 3, 'observador-89': ['Carla Exemplo'] },
        logs: [log('2026-09-01T12:00:01Z', 'Item criado por Luan França em Lead Novo'), log('2026-09-10T12:00:00Z', 'Item movido de Lead Novo para Aguardando Envio Proposta'), log('2026-10-02T13:00:00Z', 'Item marcado como "Ganho"')],
      }),
      card({
        id: 'c2', numero: 12, codigo: 'IC-12', titulo: 'Loja Nova (Cópia)', situacao: 'WON', etapa: 'Cliente na base', valor: 319_000,
        criadoEm: '2026-02-10T12:00:00Z', concluidoEm: '2026-02-15T15:00:00Z', responsavelId: 'u-carla',
        campos: { 'valor-mensalidade-li-38': 'R$ 1.900,00' },
        logs: [log('2026-07-06T17:52:00Z', 'Item marcado como "Ganho"')],
      }),
      card({
        id: 'c3', numero: 5, codigo: 'IC-5', titulo: 'Hotel Mar - WhatsApp', situacao: 'LOST', etapa: 'StandBy', criadoEm: '2026-02-16T13:31:35Z', concluidoEm: '2026-06-18T21:12:07Z', motivo: 'Perfil fora do público-alvo',
        logs: [log('2026-02-16T13:31:35Z', 'Item criado por Luan em Lead Novo'), log('2026-03-23T22:09:58Z', 'Item movido de Lead Novo para StandBy'), log('2026-06-18T21:12:07Z', 'Item marcado como "Perda"')],
      }),
      card({ id: 'c4', numero: 60, codigo: 'IC-60', titulo: 'Clínica Sol - LineChat', situacao: 'OPEN', etapa: 'Aguardando Envio Proposta', valor: 145_000, etiquetas: ['t2'], logs: [log('2026-10-01T12:00:00Z', 'Item criado por Luan França em Aguardando Envio Proposta')] }),
      card({ id: 'c5', numero: 61, titulo: 'Arquivado', situacao: 'ARCHIVED' }),
    ],
  };
  const estado: EstadoDoGestorParaHelena = {
    painel: null, painelNovo: { nome: 'Comercial', sigla: 'IC' },
    pessoas: [{ id: 'p-luan', nome: 'Luan França' }, { id: 'p-carla', nome: 'Carla Exemplo' }],
    clientes: [{ id: 'cli-hotel', nomes: ['Hotel Mar'], cnpj: null }],
    produtos: PRODUTOS, etiquetas: ['P/R Cliente'], importadas: {}, numerosOcupados: [], hoje: '2026-10-21',
  };

  it('a prévia diz o que vai acontecer', () => {
    const p = planoDaImportacao(leitura, estado);
    expect(p.previa.erro).toBeNull();
    expect(p.previa.destino).toEqual({ id: null, nome: 'Comercial', sigla: 'IC', novo: true });
    expect(p.previa.negociacoes).toEqual({ total: 4, novas: 4, atualizadas: 0, arquivadasFora: 1, naLixeira: 0 });
    expect(p.previa.numeros).toEqual({ emAndamento: { qtd: 1, valor: 145_000 }, ganhas: { qtd: 2, valor: 418_000 }, perdidas: { qtd: 1 } });
    expect(p.previa.ganhosPorMes.filter((m) => m.qtd).map((m) => [m.mes, m.qtd, m.valor])).toEqual([['2026-02', 1, 319_000], ['2026-10', 1, 99_000]]);
    expect(p.previa.ganhosPorMes).toHaveLength(12);
    expect(p.previa.etapas.entram).toHaveLength(11);
    // o painel novo nasce com os campos de fábrica (CNPJ, Contatos principais, Origem de lead, Indicação)
    expect(p.previa.campos.usa).toEqual(['CNPJ', 'Origem de lead', 'Indicação']);
    expect(p.previa.campos.cria.map((c) => c.nome)).toEqual(['Licenças WhatsApp']);
    expect(p.campos.find((c) => c.chave === 'origem-de-lead-1')!.opcoesNovas).toEqual(['Feira']);
    expect(p.previa.pessoas).toEqual([
      { nome: 'Luan França', pessoa: 'Luan França', como: 'nome', negociacoes: 3 },
      { nome: 'Carla Exemplo', pessoa: 'Carla Exemplo', como: 'nome', negociacoes: 1 },
    ]);
    expect(p.previa.empresas).toMatchObject({ clientes: 1, leads: 3 });
    expect(p.previa.etiquetas).toEqual({ total: 2, novas: ['P/R Ingline'] });
    expect(p.coresDasEtiquetas).toEqual({ 'P/R Ingline': 'ok' });
    expect(p.motivosDePerda).toEqual(['Preço', 'Fechou com a concorrência', 'Sem retorno do cliente', 'Adiou a decisão', 'Sem orçamento', 'Não atende o que precisa', 'Outro', 'Perfil fora do público-alvo']);
    expect(p.previa.motivosNovos).toEqual(['Perfil fora do público-alvo']);
    expect(p.previa.historico).toMatchObject({ semHistorico: 0, completados: 0, semCopia: 1 });
    expect(p.previa.produtos).toMatchObject({ comValorPorProduto: 1, valorUnico: 1 });
    expect(p.previa.avisos.some((a) => a.includes('arquivado'))).toBe(true);
    expect(resumoDaImportacao(p.previa)).toBe('Trouxe do Helena o painel Ingline - Comercial para o painel novo Comercial (IC): 4 negociações (4 novas)');
  });

  it('cada negociação sai pronta: o número, a etapa, o valor, o cliente, os observadores e os campos', () => {
    const p = planoDaImportacao(leitura, estado);
    const n = (id: string) => p.negociacoes.find((x) => x.helenaId === id)!;
    expect(n('c1')).toMatchObject({
      numero: 34, etapa: 'Ganho', resultado: 'ganho', fechadoEm: '2026-10-02T13:00:00.000Z', responsavelId: 'p-luan', criadoPorId: 'p-luan',
      valor: 99_000, valoresDosProdutos: { 'p-pbx': 99_000 }, produtos: ['p-pbx'], observadores: ['p-carla'], etiquetas: ['P/R Ingline'],
      empresa: 'Padaria Estrela', clienteId: null, campos: { 'origem-de-lead-1': 'Feira', 'licen-as-whatsapp-3': 3 },
    });
    expect(n('c2')).toMatchObject({ titulo: 'Loja Nova', numero: 12, responsavelId: 'p-carla', valor: 319_000, valoresDosProdutos: {} });
    expect(n('c2').eventos.some((e) => e.tipo === 'helena' && String(e.dados.texto).includes('a mensalidade por produto era LinePBX R$'))).toBe(true);
    expect(n('c3')).toMatchObject({ etapa: 'Perdido', motivoPerda: 'Perfil fora do público-alvo', clienteId: 'cli-hotel', empresa: null });
    expect(n('c4')).toMatchObject({ etapa: 'Aguardando Envio Proposta', resultado: null, fechadoEm: null, numero: 60 });
  });

  it('o relatório do Gestor com as negociações trazidas dá o mesmo que o do Helena', () => {
    const p = planoDaImportacao(leitura, estado);
    const etapas: EtapaPainel[] = p.etapas.etapas.map((e) => ({ id: e.nome, nome: e.nome, tipo: e.tipo, nivel: null, obrigatorios: [], avisar: [], resultado: e.resultado }));
    const negociacoes: NegociacaoParaRelatorio[] = p.negociacoes.map((n) => {
      const eventos = n.eventos.map((e) => ({ tipo: e.tipo, em: e.em, dados: ligarEtapasDoEvento(e.tipo, e.dados, (nome) => nome) }));
      return {
        id: n.helenaId, codigo: `IC-${n.numero}`, titulo: n.titulo, empresa: n.empresa, responsavel: null, valor: n.valor, ativacao: n.ativacao,
        etapaId: n.etapa, criadoEm: n.criadoEm, fechadoEm: n.fechadoEm, resultado: n.resultado, motivoPerda: n.motivoPerda,
        passagens: passagensDosEventos(n.criadoEm, n.etapa, eventos),
      };
    });
    // o período do relatório do Helena (21/09 a 21/10): 1 ganha, R$ 990
    const r = relatorioDeVendas({ id: 'com', etapas }, negociacoes, { de: '2026-09-21', ate: '2026-10-21' });
    expect(r.numeros.ganhos).toMatchObject({ qtd: 1, valor: 99_000 });
    expect(r.meses.find((m) => m.mes === '2026-02')).toMatchObject({ qtd: 1, ganho: 319_000 });
    // a trajetória: a que nasceu no Lead Novo passou pela Aguardando Envio Proposta
    expect(negociacoes.find((x) => x.id === 'c1')!.passagens.map((x) => x.etapaId)).toEqual(['Lead Novo', 'Aguardando Envio Proposta', 'Ganho']);
    const fevereiro = relatorioDeVendas({ id: 'com', etapas }, negociacoes, { de: '2026-02-01', ate: '2026-02-28' });
    expect(fevereiro.numeros.novos.qtd).toBe(2);
    expect(instanteLocal('2026-02-15', '12:00').toISOString().slice(0, 10)).toBe('2026-02-15');
  });

  it('de novo: o que já veio é atualizado (com o mesmo número), e o painel que existe recebe', () => {
    const estado2: EstadoDoGestorParaHelena = {
      ...estado,
      painel: {
        id: 'com', nome: 'Comercial', sigla: 'COM', motivosDePerda: ['Preço'], camposDesligados: AJUSTES_DO_PAINEL_DE_VENDAS.camposDesligados,
        campos: GESTOR_CAMPOS,
        etapas: [
          { id: 'g-lead', nome: 'Lead', tipo: 'entrada', resultado: null, obrigatorios: [], avisar: [], negociacoes: 3 },
          { id: 'g-ganho', nome: 'Ganho', tipo: 'fechado', resultado: 'ganho', obrigatorios: ['valor'], avisar: [], negociacoes: 0 },
          { id: 'g-perdido', nome: 'Perdido', tipo: 'fechado', resultado: 'perdido', obrigatorios: [], avisar: [], negociacoes: 0 },
        ],
      },
      importadas: { c1: { id: 't-1', numero: 34, mexidaNoGestor: true }, c4: { id: 't-4', numero: 60, mexidaNoGestor: false, naLixeira: true } },
      numerosOcupados: [1, 2, 3, 12, 34],
    };
    const p = planoDaImportacao(leitura, estado2);
    expect(p.previa.destino).toEqual({ id: 'com', nome: 'Comercial', sigla: 'COM', novo: false });
    // a que foi para a lixeira do Gestor fica lá
    expect(p.previa.negociacoes).toMatchObject({ total: 3, novas: 2, atualizadas: 1, naLixeira: 1 });
    expect(p.negociacoes.some((n) => n.helenaId === 'c4')).toBe(false);
    expect(p.previa.avisos.some((a) => a.includes('na lixeira do Gestor'))).toBe(true);
    expect(p.previa.mexidasNoGestor).toBe(1);
    expect(p.previa.etapas.ficam).toEqual(['Lead']);
    expect(p.negociacoes.find((n) => n.helenaId === 'c1')).toMatchObject({ chamadoId: 't-1', numero: 34 });
    // o 12 já é de outra negociação do painel: a do Helena fica com o próximo livre (depois do 34)
    expect(p.negociacoes.find((n) => n.helenaId === 'c2')!.numero).toBe(35);
    expect(p.previa.campos.usa).toEqual(['CNPJ', 'Origem de lead', 'Indicação']);
    expect(p.campos.find((c) => c.chave === 'origem-de-lead-1')!.opcoesNovas).toEqual(['Prospecção ativa', 'Feira']);
    expect(p.motivosDePerda).toEqual(['Preço', 'Perfil fora do público-alvo']);
  });
});
