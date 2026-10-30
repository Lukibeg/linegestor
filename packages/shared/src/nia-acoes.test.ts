import { describe, expect, it } from 'vitest';
import { AJUSTES_PAINEL_PADRAO, textoDoEvento, type Assunto } from './atendimento.js';
import {
  acoesDoCatalogo, camposDeTextoDoCard, comComandoEscolhido, diferencaPorPalavras, folhasDoAssunto, idsDasListasDaNia, lerComandoDaNia,
  NiaAplicarSchema, NiaProporSchema, problemaDoTamanho, RespostaDaNiaSchema, resumoDoQueAplicou, textoSemOComando, type AcaoDaNia,
} from './nia-acoes.js';

/** O catálogo de hoje da NIA (os 5 comandos), como ela manda. */
const CATALOGO = {
  acoes: [
    { comando: 'corrigir', nome: 'Corrigir o português', descricao: 'Corrige ortografia, acentuação e pontuação sem mudar o que foi dito.', entrega: 'texto', camposOrigem: [], exigeTexto: true },
    { comando: 'formalizar', nome: 'Formalizar para o cliente', descricao: 'Reescreve num tom formal.', entrega: 'texto', camposOrigem: [], exigeTexto: true },
    { comando: 'resumir', nome: 'Resumir', descricao: 'Um resumo curto do card.', entrega: 'texto', camposOrigem: [], exigeTexto: true },
    { comando: 'criar-chamado', nome: 'Criar chamado a partir de uma descrição', descricao: 'A ligação telefônica vira o card.', entrega: 'campos', camposOrigem: [], exigeTexto: true },
    { comando: 'preencher-card-vazio', nome: 'Preencher card vazio', descricao: 'Preenche os campos de um card vazio.', entrega: 'campos', camposOrigem: [], exigeTexto: false },
  ],
};
const ACOES = acoesDoCatalogo(CATALOGO)!;

describe('o catálogo da NIA', () => {
  it('lê os 5 comandos, com o nome e a descrição que o menu mostra', () => {
    expect(ACOES.map((a) => a.comando)).toEqual(['corrigir', 'formalizar', 'resumir', 'criar-chamado', 'preencher-card-vazio']);
    expect(ACOES[0]).toMatchObject({ nome: 'Corrigir o português', entrega: 'texto' });
    expect(ACOES[3]!.entrega).toBe('campos');
  });
  it('o comando novo entra sem mudar o Gestor; o quebrado sai sozinho, sem derrubar o catálogo', () => {
    const lido = acoesDoCatalogo({ acoes: [...CATALOGO.acoes, { comando: 'traduzir', nome: 'Traduzir para o inglês', entrega: 'texto' }, { nome: 'sem comando' }, 42] })!;
    expect(lido.map((a) => a.comando)).toEqual(['corrigir', 'formalizar', 'resumir', 'criar-chamado', 'preencher-card-vazio', 'traduzir']);
    expect(lido[5]).toMatchObject({ descricao: '', camposOrigem: [], exigeTexto: false });
  });
  it('o que não é um catálogo volta nulo', () => {
    expect(acoesDoCatalogo({ coisa: 1 })).toBeNull();
    expect(acoesDoCatalogo(null)).toBeNull();
  });
});

describe('o /nia sendo digitado', () => {
  it('"/nia" sozinho abre o menu com todos os comandos', () => {
    const t = 'O cliente ligou. /nia';
    const d = lerComandoDaNia(t, t.length, ACOES)!;
    expect(d.sugestoes).toHaveLength(5);
    expect(d.acao).toBeNull();
    expect(d.inicio).toBe(17);
  });
  it('continuar digitando filtra: "/nia cor" deixa só o Corrigir o português', () => {
    const t = '/nia cor';
    expect(lerComandoDaNia(t, t.length, ACOES)!.sugestoes.map((a) => a.nome)).toEqual(['Corrigir o português']);
    // pelo nome também, sem acento
    expect(lerComandoDaNia('/nia portugues', 14, ACOES)!.sugestoes.map((a) => a.comando)).toEqual(['corrigir']);
  });
  it('o comando escolhido e o pedido na mesma linha viram a instrução', () => {
    const t = 'texto de antes\n/nia corrigir o relato, a solução e a causa';
    const d = lerComandoDaNia(t, t.length, ACOES)!;
    expect(d.acao?.comando).toBe('corrigir');
    expect(d.passouDaPalavra).toBe(true);
    expect(d.instrucao).toBe('o relato, a solução e a causa');
    expect(textoSemOComando(t, d)).toBe('texto de antes');
  });
  it('sem citar campo, a instrução vai vazia (a NIA trabalha o card inteiro)', () => {
    const d = lerComandoDaNia('/nia corrigir', 13, ACOES)!;
    expect(d.acao?.comando).toBe('corrigir');
    expect(d.instrucao).toBe('');
  });
  it('fora de um /nia não há menu (nem no meio de um endereço)', () => {
    expect(lerComandoDaNia('nada aqui', 9, ACOES)).toBeNull();
    expect(lerComandoDaNia('https://x.com/nia', 17, ACOES)).toBeNull();
    // o /nia de outra linha não conta
    expect(lerComandoDaNia('/nia corrigir\noutra linha', 25, ACOES)).toBeNull();
  });
  it('escolher no menu troca a palavra pelo comando e põe o cursor depois do espaço', () => {
    const t = 'antes /nia cor';
    const d = lerComandoDaNia(t, t.length, ACOES)!;
    const r = comComandoEscolhido(t, d, ACOES[0]!);
    expect(r.texto).toBe('antes /nia corrigir ');
    expect(r.cursor).toBe(r.texto.length);
  });
  it('tirar o comando do campo leva a linha junto quando ele estava sozinho nela', () => {
    const t = 'linha 1\n/nia resumir\nlinha 3';
    const d = lerComandoDaNia(t, 20, ACOES)!;
    expect(textoSemOComando(t, d)).toBe('linha 1\nlinha 3');
    expect(textoSemOComando('/nia resumir', lerComandoDaNia('/nia resumir', 12, ACOES)!)).toBe('');
  });
});

describe('os campos do card', () => {
  const gestao = { tipo: 'gestao' as const, ajustes: AJUSTES_PAINEL_PADRAO };
  it('o chamado: título, relato, descrição, solução e causa', () => {
    expect(camposDeTextoDoCard(gestao, 'chamado', false)).toEqual(['titulo', 'relato', 'descricao', 'solucao', 'causa']);
  });
  it('o painel que desligou o relato e a solução não manda esses campos', () => {
    const p = { tipo: 'gestao' as const, ajustes: { ...AJUSTES_PAINEL_PADRAO, camposDesligados: ['relato', 'solucao'] as typeof AJUSTES_PAINEL_PADRAO.camposDesligados } };
    expect(camposDeTextoDoCard(p, 'chamado', true)).toEqual(['titulo', 'descricao']);
  });
  it('o problema tem os seis; a negociação, a descrição e o relato só quando chegou', () => {
    expect(camposDeTextoDoCard(gestao, 'problema', false)).toEqual(['titulo', 'relato', 'descricao', 'causa', 'contorno', 'solucao', 'validacao']);
    expect(camposDeTextoDoCard({ tipo: 'vendas', ajustes: AJUSTES_PAINEL_PADRAO }, 'chamado', false)).toEqual(['titulo', 'descricao']);
    expect(camposDeTextoDoCard({ tipo: 'vendas', ajustes: AJUSTES_PAINEL_PADRAO }, 'chamado', true)).toEqual(['titulo', 'relato', 'descricao']);
  });
});

describe('as folhas do assunto', () => {
  const a = (id: string, nome: string, paiId: string | null, ativo = true, painelId = 'p1'): Assunto =>
    ({ id, painelId, paiId, nome, descricao: null, ativo, ordem: 0, checklist: [], dePara: [] });
  const assuntos = [
    a('lc', 'Linechat', null), a('cfg', 'Configuração', 'lc'), a('eq', 'Equipes', 'cfg'), a('fila', 'Filas', 'cfg'),
    a('ra', 'Ramal', null), a('inc', 'Incidentes', 'ra'), a('mudo', 'Mudo', 'inc'),
    a('velho', 'Velho', null, false), a('dentro', 'Dentro do velho', 'velho'),
    a('so', 'Sozinho', null),
    a('outro', 'Outro painel', null, true, 'p2'),
  ];
  it('só o caminho que nenhum outro continua (as pastas ficam de fora)', () => {
    expect(folhasDoAssunto(assuntos, 'p1')).toEqual(['Linechat › Configuração › Equipes', 'Linechat › Configuração › Filas', 'Ramal › Incidentes › Mudo', 'Sozinho']);
  });
  it('a pasta cujos filhos foram todos desativados vira folha', () => {
    const r = folhasDoAssunto([...assuntos.filter((x) => x.id !== 'mudo'), a('mudo', 'Mudo', 'inc', false)], 'p1');
    expect(r).toContain('Ramal › Incidentes');
  });
});

describe('o nome → id das listas (a entrega "campos")', () => {
  const o = {
    clientes: [{ id: 'c1', nome: 'Labchecap' }, { id: 'c2', nome: 'Clínica Aurora' }],
    produtos: [{ id: 'p1', nome: 'LinePBX' }, { id: 'p2', nome: 'LineChat' }],
    tipos: ['Incidente', 'Requisição'],
    assuntos: ['Ramal › Incidentes › Mudo', 'Linechat › Configuração › Equipes'],
  };
  it('cliente vira o id, produto vira o id, assunto vai pelo caminho, gravidade pela chave', () => {
    const r = idsDasListasDaNia({ cliente: 'Labchecap', produto: 'LinePBX', tipo: 'incidente', assunto: 'Ramal › Incidentes › Mudo', gravidade: 'Inoperância' }, o);
    expect(r).toEqual({ clienteId: 'c1', produtos: ['p1'], tipo: 'Incidente', assunto: 'Ramal › Incidentes › Mudo', gravidade: 'inoperancia' });
  });
  it('sem acento e com vários produtos', () => {
    expect(idsDasListasDaNia({ cliente: 'clinica aurora', produto: ['LinePBX', 'linechat'] }, o)).toEqual({ clienteId: 'c2', produtos: ['p1', 'p2'] });
  });
  it('em branco é decisão da NIA (fica nulo), e o que não existe também fica nulo', () => {
    expect(idsDasListasDaNia({ cliente: null, gravidade: null, assunto: 'Linechat', tipo: 'Coisa' }, o)).toEqual({ clienteId: null, gravidade: null, assunto: null, tipo: null });
  });
  it('o que não veio não aparece', () => {
    expect(idsDasListasDaNia({ titulo: 'x' }, o)).toEqual({});
  });
});

describe('o Aplicar', () => {
  it('a frase do Histórico diz só o que foi gravado', () => {
    expect(resumoDoQueAplicou('Corrigir o português', ['Relato do cliente', 'Causa'], 'texto')).toBe('NIA (Corrigir o português): mudou Relato do cliente e Causa');
    expect(resumoDoQueAplicou('Criar chamado', ['Relato do cliente', 'Cliente', 'Assunto'], 'campos')).toBe('NIA (Criar chamado): preencheu Relato do cliente, Cliente e Assunto');
    expect(textoDoEvento('nia', { resumo: 'NIA (Corrigir o português): mudou Causa', campos: ['Causa'] })).toBe('aplicou a NIA (Corrigir o português): mudou Causa');
  });
  it('o texto que passa do tamanho do campo é recusado com a mensagem clara (nunca cortado)', () => {
    expect(problemaDoTamanho('causa', 'x'.repeat(5_000))).toBeNull();
    expect(problemaDoTamanho('causa', 'x'.repeat(5_001))).toBe('Causa ficaria com 5.001 letras, e o máximo é 5.000. Nada foi gravado: encurte antes de aplicar.');
    expect(problemaDoTamanho('contorno', 'x'.repeat(10_001))).toMatch(/Solução de contorno.*10\.000/);
    expect(problemaDoTamanho('validacao', 'y'.repeat(5_001))).toMatch(/^Validação ficaria com 5\.001 letras/);
    expect(problemaDoTamanho('campo:abc', 'y'.repeat(20_001), 'Passos para reproduzir')).toMatch(/^Passos para reproduzir ficaria com 20\.001 letras, e o máximo é 20\.000/);
    // o schema deixa o servidor dar a mensagem com o nome do campo (só o absurdo para antes)
    expect(NiaAplicarSchema.safeParse({ comando: 'corrigir', campos: { relato: 'ok', validacao: 'y'.repeat(5_001) } }).success).toBe(true);
    expect(NiaAplicarSchema.safeParse({ comando: 'corrigir', campos: { relato: 'y'.repeat(100_001) } }).success).toBe(false);
  });
  it('aplicar sem nada marcado é recusado; campo que não existe também', () => {
    expect(NiaAplicarSchema.safeParse({ comando: 'corrigir', campos: {} }).success).toBe(false);
    expect(NiaAplicarSchema.safeParse({ comando: 'corrigir', campos: { senha: 'x' } }).success).toBe(false);
    expect(NiaAplicarSchema.safeParse({ comando: 'criar-chamado', campos: {}, listas: { gravidade: 'inoperancia' } }).success).toBe(true);
  });
  it('o pedido de proposta confere o comando e o campo', () => {
    expect(NiaProporSchema.parse({ comando: 'corrigir', instrucao: '  o relato  ', campo: 'solucao' })).toEqual({ comando: 'corrigir', instrucao: 'o relato', campo: 'solucao' });
    expect(NiaProporSchema.safeParse({ comando: 'corrigir; rm -rf', campo: 'solucao' }).success).toBe(false);
    expect(NiaProporSchema.safeParse({ comando: 'corrigir', campo: 'senha' }).success).toBe(false);
  });
});

describe('a resposta da NIA', () => {
  it('a do corrigir é lida como veio', () => {
    const r = RespostaDaNiaSchema.parse({
      ok: true, comando: 'corrigir', entrega: 'texto', alcance: 'campos citados',
      alteracoes: [{ campo: 'relato', nome: 'Relato do cliente', antes: 'nao funciona', depois: 'Não funciona.', mudou: true }],
      resumo: 'NIA (Corrigir o português) em Relato do cliente: mudou Relato do cliente.', observacao: null, erro: null, custo: { usd: 0.01 }, duracaoMs: 5123,
    });
    expect(r.alteracoes![0]!.depois).toBe('Não funciona.');
    expect(r.duracaoMs).toBe(5123);
  });
  it('o que não é uma resposta é recusado (a tela mostra o erro, não quebra)', () => {
    expect(RespostaDaNiaSchema.safeParse({ alteracoes: 'x' }).success).toBe(false);
  });
});

describe('o destaque do que mudou', () => {
  it('palavra por palavra', () => {
    const d = diferencaPorPalavras('o cliente nao consegue ligar', 'O cliente não consegue ligar.')!;
    expect(d.antes.filter((p) => p.tipo === 'saiu').map((p) => p.texto.trim())).toEqual(['o', 'nao', 'ligar']);
    expect(d.depois.filter((p) => p.tipo === 'entrou').map((p) => p.texto.trim())).toEqual(['O', 'não', 'ligar.']);
    expect(d.antes.map((p) => p.texto).join('')).toBe('o cliente nao consegue ligar');
  });
  it('texto grande demais volta sem destaque', () => {
    expect(diferencaPorPalavras('a '.repeat(2000), 'b '.repeat(2000))).toBeNull();
  });
});

// o tipo do catálogo de hoje, para não sair do contrato
const _tipo: AcaoDaNia = ACOES[0]!;
void _tipo;
