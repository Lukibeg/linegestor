import { describe, expect, it } from 'vitest';
import {
  ArtigoGravarSchema, artigosDoChamado, blocosDoTexto, buscarArtigos, codigoDoArtigo, diferencaDasVersoes, diferencaDeLinhas,
  faltaParaPublicar, montarIndiceParaChamados, normalizar1a1, numeroDoCodigo, pedacosDaLinha, printsDoTexto, termosDaBusca,
  textoPuro, trocarMarcadores, type ArtigoParaBusca,
} from './base.js';

describe('O código do artigo', () => {
  it('escreve e lê o BC-12 de qualquer jeito', () => {
    expect(codigoDoArtigo(12)).toBe('BC-12');
    expect(numeroDoCodigo('BC-12')).toBe(12);
    expect(numeroDoCodigo('bc12')).toBe(12);
    expect(numeroDoCodigo(' Bc 7 ')).toBe(7);
    expect(numeroDoCodigo('IS-3607')).toBeNull();
    expect(numeroDoCodigo('12')).toBeNull();
  });
});

describe('O texto simples', () => {
  const texto = [
    'Antes de tudo, confira o cabo.',
    '',
    '1. Ligar para o ramal e cronometrar.',
    '2. No servidor do cliente, conferir o registro:',
    '`asterisk -rx "pjsip show contacts"`',
    '[print:abc123]',
    '3) Fazer uma ligação de teste.',
    'Se cair de novo, volte ao passo 1.',
    '',
    '- item solto',
    '```',
    'linha um',
    'linha dois',
    '```',
  ].join('\n');

  it('entende passos, comandos, prints, itens e parágrafos', () => {
    const b = blocosDoTexto(texto);
    expect(b.map((x) => x.tipo)).toEqual(['paragrafo', 'passo', 'passo', 'passo', 'item', 'comando']);
    const passo2 = b[2] as Extract<typeof b[number], { tipo: 'passo' }>;
    expect(passo2.numero).toBe(2);
    expect(passo2.dentro).toEqual([{ tipo: 'comando', texto: 'asterisk -rx "pjsip show contacts"' }, { tipo: 'imagem', anexoId: 'abc123' }]);
    const passo3 = b[3] as Extract<typeof b[number], { tipo: 'passo' }>;
    expect(passo3.numero).toBe(3);
    expect(passo3.dentro).toEqual([{ tipo: 'paragrafo', texto: 'Se cair de novo, volte ao passo 1.' }]);
    expect(b[5]).toEqual({ tipo: 'comando', texto: 'linha um\nlinha dois' });
  });

  it('acha os prints e troca o marcador provisório pelo id', () => {
    expect(printsDoTexto(texto)).toEqual(['abc123']);
    expect(trocarMarcadores('1. passo\n[print:novo-1]\n[print:outro]', { 'novo-1': 'id9' })).toBe('1. passo\n[print:id9]\n[print:outro]');
    expect(trocarMarcadores(null, {})).toBeNull();
  });

  it('o texto puro não tem prints nem crases', () => {
    expect(textoPuro('1. rodar `ls`\n[print:abc]\n```\nreboot\n```')).toBe('1. rodar ls\nreboot');
  });

  it('separa código, endereço e artigo dentro da linha', () => {
    expect(pedacosDaLinha('Veja BC-7 e rode `sip show peers` em https://exemplo.com/a.')).toEqual([
      { tipo: 'texto', texto: 'Veja ' },
      { tipo: 'artigo', texto: 'BC-7', numero: 7 },
      { tipo: 'texto', texto: ' e rode ' },
      { tipo: 'codigo', texto: 'sip show peers' },
      { tipo: 'texto', texto: ' em ' },
      { tipo: 'link', texto: 'https://exemplo.com/a', href: 'https://exemplo.com/a' },
      { tipo: 'texto', texto: '.' },
    ]);
    // sem ponto no nome é exemplo, não endereço; IP e porta viram link
    expect(pedacosDaLinha('Abra http://IP-DO-TELEFONE no navegador')).toEqual([{ tipo: 'texto', texto: 'Abra http://IP-DO-TELEFONE no navegador' }]);
    expect(pedacosDaLinha('Abra http://10.20.0.7:8080/admin')).toEqual([
      { tipo: 'texto', texto: 'Abra ' },
      { tipo: 'link', texto: 'http://10.20.0.7:8080/admin', href: 'http://10.20.0.7:8080/admin' },
    ]);
  });
});

describe('Publicar e gravar', () => {
  it('rascunho grava com o título; publicar precisa do Como resolver', () => {
    expect(faltaParaPublicar({ titulo: 'Ligação cai', comoResolver: '' })).toMatch(/Como resolver/);
    expect(faltaParaPublicar({ titulo: 'Ligação cai', comoResolver: '[print:abc]' })).toMatch(/Como resolver/);
    expect(faltaParaPublicar({ titulo: 'Ligação cai', comoResolver: '1. desligar o SIP ALG' })).toBeNull();
  });
  it('o formulário recusa título curto e ligação de tipo desconhecido', () => {
    expect(ArtigoGravarSchema.safeParse({ titulo: 'ab' }).success).toBe(false);
    expect(ArtigoGravarSchema.safeParse({ titulo: 'Ligação cai', ligacoes: [{ tipo: 'pasta', alvo: 'x' }] }).success).toBe(false);
    const ok = ArtigoGravarSchema.parse({ titulo: '  Ligação cai  ', palavrasDoCliente: [' cai sozinha '] });
    expect(ok.titulo).toBe('Ligação cai');
    expect(ok.palavrasDoCliente).toEqual(['cai sozinha']);
    expect(ok.publicar).toBe(false);
  });
});

describe('A busca', () => {
  const artigo = (numero: number, titulo: string, resto: Partial<ArtigoParaBusca> = {}): ArtigoParaBusca & { id: string } => ({
    id: `a${numero}`, numero, titulo, oQueAcontece: null, comoResolver: null, porQueAcontece: null, palavrasDoCliente: [], ...resto,
  });
  const artigos = [
    artigo(12, 'Ligação cai sempre aos 32 segundos', {
      oQueAcontece: 'A ligação cai sozinha no meio da conversa, sempre perto dos 30 segundos.',
      comoResolver: '1. No roteador da unidade, desligar o SIP ALG.\n`asterisk -rx "pjsip show contacts"`',
      palavrasDoCliente: ['cai sozinha', 'derruba depois de meio minuto'],
      nomesLigados: ['Clínica Aurora', 'Ramal - Queda de ligação'],
    }),
    artigo(7, 'Áudio só de um lado depois de trocar a internet', { comoResolver: 'Liberar as portas de áudio (RTP) no roteador.', palavrasDoCliente: ['ninguém me ouve'] }),
    artigo(19, 'Ramal sem fio desconecta longe da base', { oQueAcontece: 'O telefone sem fio perde o sinal no corredor.', palavrasDoCliente: ['cai sozinha', 'fica mudo'] }),
  ];

  it('sem busca vêm todos', () => {
    expect(buscarArtigos(artigos, '').map((a) => a.artigo.numero)).toEqual([12, 7, 19]);
  });
  it('não liga para acento nem maiúscula, e acha pedaço de palavra', () => {
    expect(buscarArtigos(artigos, 'LIGACAO').map((a) => a.artigo.numero)).toEqual([12]);
    expect(buscarArtigos(artigos, 'audio').map((a) => a.artigo.numero)).toEqual([7]);
    expect(buscarArtigos(artigos, 'rotead').map((a) => a.artigo.numero).sort()).toEqual([12, 7].sort());
  });
  it('cada palavra precisa aparecer em algum lugar do artigo', () => {
    expect(buscarArtigos(artigos, 'roteador sip').map((a) => a.artigo.numero)).toEqual([12]);
    expect(buscarArtigos(artigos, 'roteador inexistente')).toEqual([]);
  });
  it('as palavras vazias ("o", "de") não contam', () => {
    expect(termosDaBusca('o ramal não toca de jeito nenhum')).toEqual(['ramal', 'nao', 'toca', 'jeito', 'nenhum']);
  });
  it('acha pelas palavras do cliente e pelo que está ligado', () => {
    expect(buscarArtigos(artigos, 'cai sozinha').map((a) => a.artigo.numero)).toEqual([12, 19]);
    expect(buscarArtigos(artigos, 'clinica aurora').map((a) => a.artigo.numero)).toEqual([12]);
  });
  it('o título vale mais que o texto', () => {
    const r = buscarArtigos([artigo(1, 'Senha do FOP2', { comoResolver: 'nada' }), artigo(2, 'Outro', { comoResolver: 'usar a senha do FOP2' })], 'fop2');
    expect(r.map((a) => a.artigo.numero)).toEqual([1, 2]);
  });
  it('o código BC acha só aquele artigo', () => {
    expect(buscarArtigos(artigos, 'BC-7').map((a) => a.artigo.numero)).toEqual([7]);
    expect(buscarArtigos(artigos, 'bc 99')).toEqual([]);
  });
  it('no modo "alguma" (a IA) basta uma palavra, e quem tem mais vem antes', () => {
    const r = buscarArtigos(artigos, 'roteador portas rtp desligar', 'alguma').map((a) => a.artigo.numero);
    expect(r[0]).toBe(7);
    expect(r).toContain(12);
    expect(r).not.toContain(19);
  });
  it('o trecho mostra onde achou, no lugar certo mesmo com acento', () => {
    const [r] = buscarArtigos(artigos, 'conversa');
    const achados = r!.trecho!.filter((p) => p.achado).map((p) => p.texto);
    expect(achados).toEqual(['conversa']);
    const [r2] = buscarArtigos([artigo(1, 'x', { oQueAcontece: 'Não há áudio na ligação de saída' })], 'audio ligacao');
    expect(r2!.trecho!.filter((p) => p.achado).map((p) => p.texto)).toEqual(['áudio', 'ligação']);
  });
  it('normaliza um para um (a posição não muda)', () => {
    const s = 'Ação ÚNICA ç';
    expect(normalizar1a1(s)).toBe('acao unica c');
    expect(normalizar1a1(s).length).toBe(s.length);
  });
});

describe('As versões', () => {
  it('diz o que saiu e o que entrou, linha a linha', () => {
    expect(diferencaDeLinhas('1. a\n2. b\n3. c', '1. a\n2. B\n3. c\n4. d')).toEqual([
      { tipo: 'igual', texto: '1. a' },
      { tipo: 'saiu', texto: '2. b' },
      { tipo: 'entrou', texto: '2. B' },
      { tipo: 'igual', texto: '3. c' },
      { tipo: 'entrou', texto: '4. d' },
    ]);
    expect(diferencaDeLinhas(null, 'novo')).toEqual([{ tipo: 'entrou', texto: 'novo' }]);
    expect(diferencaDeLinhas('velho', '')).toEqual([{ tipo: 'saiu', texto: 'velho' }]);
  });
  it('compara só as partes que mudaram', () => {
    const v1 = { titulo: 'A', oQueAcontece: 'x', comoResolver: '1. y', porQueAcontece: null, palavrasDoCliente: ['p'] };
    const v2 = { ...v1, comoResolver: '1. y\n2. z', palavrasDoCliente: ['p', 'q'] };
    expect(diferencaDasVersoes(v1, v2).map((d) => d.nome)).toEqual(['Como resolver', 'Palavras do cliente']);
  });
});

describe('O livrinho no chamado', () => {
  const indice = montarIndiceParaChamados([
    { id: 'a1', numero: 1, titulo: 'Queda aos 32 s', ligacoes: [{ tipo: 'assunto', alvo: 'Ramal - Queda de ligação' }] },
    { id: 'a2', numero: 2, titulo: 'Particularidade da Aurora', ligacoes: [{ tipo: 'cliente', alvo: 'cli-aurora' }, { tipo: 'assunto', alvo: 'Ramal - Queda de ligação' }] },
    { id: 'a3', numero: 3, titulo: 'O próprio chamado', ligacoes: [{ tipo: 'chamado', alvo: 'card-9' }] },
    { id: 'a4', numero: 4, titulo: 'Só produto', ligacoes: [{ tipo: 'produto', alvo: 'plinepbx' }] },
  ]);
  const chaves = { assunto: 'assunto', cliente: 'cliente-71' };
  const daOpcao = (o: string) => (o === 'Clínica Aurora' ? 'cli-aurora' : null);

  it('junta o card, o assunto (sem acento) e o cliente, sem repetir', () => {
    const r = artigosDoChamado({ id: 'card-9', campos: { assunto: 'RAMAL - QUEDA DE LIGACAO', 'cliente-71': 'Clínica Aurora' } }, indice, chaves, daOpcao);
    expect(r.map((a) => a.numero)).toEqual([3, 1, 2]);
  });
  it('produto sozinho não acende o livrinho', () => {
    expect(artigosDoChamado({ id: 'outro', campos: { plataforma: 'LinePBX' } }, indice, chaves, daOpcao)).toEqual([]);
  });
  it('campo de várias escolhas conta cada valor', () => {
    const r = artigosDoChamado({ id: 'x', campos: { assunto: ['Outro assunto', 'Ramal - Queda de ligação'] } }, indice, chaves, daOpcao);
    expect(r.map((a) => a.numero)).toEqual([1, 2]);
  });
});
