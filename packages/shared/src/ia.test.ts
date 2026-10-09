import { describe, expect, it } from 'vitest';
import { buscarArtigos, type ArtigoParaBusca } from './base.js';
import {
  AjustesIaSchema, cortarTexto, custoEstimado, enderecoValido, hostDoEndereco, jsonDaResposta, juntarAchados, LIMITE_DO_ARTIGO_PARA_IA, lerRespostaComCitacoes,
  limparResposta, modeloDeConversa, montarPerguntaParaIa, normalizarEndereco, rascunhoDaIa, termosDaResposta,
} from './ia.js';

const artigo = (numero: number, titulo: string, resto: Partial<ArtigoParaBusca> = {}): ArtigoParaBusca => ({
  numero, titulo, oQueAcontece: null, comoResolver: null, porQueAcontece: null, palavrasDoCliente: [], ...resto,
});

describe('O provedor e o endereço', () => {
  it('o endereço colado de qualquer jeito vira o da API', () => {
    expect(normalizarEndereco(' https://openrouter.ai/api/v1/ ')).toBe('https://openrouter.ai/api/v1');
    expect(normalizarEndereco('https://api.deepseek.com/chat/completions')).toBe('https://api.deepseek.com');
    expect(normalizarEndereco('https://api.groq.com/openai/v1/models/')).toBe('https://api.groq.com/openai/v1');
    expect(normalizarEndereco(null)).toBe('');
  });
  it('só endereço https de um serviço da internet', () => {
    expect(enderecoValido('https://openrouter.ai/api/v1')).toBe(true);
    expect(enderecoValido('https://chat.maritaca.ai/api')).toBe(true);
    expect(enderecoValido('http://openrouter.ai/api/v1')).toBe(false);
    expect(enderecoValido('https://localhost:8080/v1')).toBe(false);
    expect(enderecoValido('https://192.168.0.10/v1')).toBe(false);
    expect(enderecoValido('https://servidor.local/v1')).toBe(false);
    expect(enderecoValido('https://usuario:senha@api.x.ai/v1')).toBe(false);
    expect(enderecoValido('openrouter.ai')).toBe(false);
    expect(enderecoValido('')).toBe(false);
  });
  it('nem com o ponto no fim passa endereço de dentro; o nome do serviço sai limpo (é a ele que a chave fica presa)', () => {
    expect(enderecoValido('https://localhost./v1')).toBe(false);
    expect(enderecoValido('https://metadata.google.internal./')).toBe(false);
    expect(enderecoValido('https://db./v1')).toBe(false);
    expect(hostDoEndereco('https://API.DeepSeek.com./chat/completions')).toBe('api.deepseek.com');
    expect(hostDoEndereco('https://openrouter.ai/api/v1')).toBe('openrouter.ai');
    expect(hostDoEndereco('lixo')).toBe('');
  });
  it('os ajustes: ligar pede o modelo; o compatível pede o endereço', () => {
    expect(AjustesIaSchema.safeParse({ ativo: true, provedor: 'openai', modelo: '' }).success).toBe(false);
    expect(AjustesIaSchema.safeParse({ ativo: false, provedor: 'openai', modelo: '' }).success).toBe(true);
    expect(AjustesIaSchema.safeParse({ ativo: true, provedor: 'compativel', modelo: 'deepseek-chat' }).success).toBe(false);
    expect(AjustesIaSchema.safeParse({ ativo: true, provedor: 'compativel', modelo: 'deepseek-chat', endereco: 'http://api.deepseek.com' }).success).toBe(false);
    expect(AjustesIaSchema.safeParse({ ativo: true, provedor: 'compativel', modelo: 'deepseek-chat', endereco: 'https://api.deepseek.com' }).success).toBe(true);
    expect(AjustesIaSchema.safeParse({ ativo: true, provedor: 'google', modelo: 'gemini 3' }).success).toBe(false);
    expect(AjustesIaSchema.safeParse({ ativo: true, provedor: 'compativel', modelo: 'meta-llama/llama-3.3-70b-instruct:free', endereco: 'https://openrouter.ai/api/v1' }).success).toBe(true);
    expect(AjustesIaSchema.safeParse({ ativo: true, provedor: 'mistério', modelo: 'x' }).success).toBe(false);
  });
  it('a lista de modelos fica só com os de conversa', () => {
    expect(['gpt-5.4-mini', 'text-embedding-3-small', 'whisper-1', 'gpt-4o-mini-tts', 'dall-e-3', 'gpt-image-1', 'gpt-realtime', 'omni-moderation-latest', 'o4-mini'].filter(modeloDeConversa))
      .toEqual(['gpt-5.4-mini', 'o4-mini']);
    expect(modeloDeConversa('gemini-3.5-flash')).toBe(true);
    expect(modeloDeConversa('gemini-embedding-001')).toBe(false);
  });
  it('o custo só sai com o preço informado (o Gestor não chuta preço)', () => {
    expect(custoEstimado({ entrada: 1_000_000, saida: 100_000 }, { precoEntrada: null, precoSaida: null })).toBeNull();
    expect(custoEstimado({ entrada: 1_000_000, saida: 100_000 }, { precoEntrada: 2, precoSaida: null })).toBeNull();
    expect(custoEstimado({ entrada: 1_000_000, saida: 100_000 }, { precoEntrada: 2, precoSaida: 10 })).toBe(3);
    expect(custoEstimado({ entrada: 0, saida: 0 }, { precoEntrada: 0, precoSaida: 0 })).toBe(0);
  });
});

describe('O que vai para a IA', () => {
  const artigos = [
    artigo(12, 'Ligação cai sempre aos 32 segundos', { comoResolver: '1. No roteador, desligar o SIP ALG.\n[print:abc]\n`asterisk -rx "pjsip show contacts"`', palavrasDoCliente: ['cai sozinha'] }),
    artigo(7, 'Áudio só de um lado depois de trocar a internet', { comoResolver: 'Liberar as portas de áudio (RTP) no roteador.', palavrasDoCliente: ['ninguém me ouve'] }),
    artigo(19, 'Ramal sem fio desconecta longe da base', { oQueAcontece: 'O telefone sem fio perde o sinal.', palavrasDoCliente: ['cai sozinha'] }),
  ];
  it('cada artigo vai com o código, em texto puro, e a pergunta no fim', () => {
    const m = montarPerguntaParaIa('a ligação cai sozinha', [artigos[0]!]);
    expect(m).toContain('[BC-12] Ligação cai sempre aos 32 segundos');
    expect(m).toContain('Como resolver:\n1. No roteador, desligar o SIP ALG.\nasterisk -rx "pjsip show contacts"');
    expect(m).not.toContain('[print:');
    expect(m.trim().endsWith('Pergunta da equipe: a ligação cai sozinha')).toBe(true);
  });
  it('artigo enorme vai cortado (a conta não dispara)', () => {
    const grande = artigo(5, 'Manual inteiro', { comoResolver: Array.from({ length: 2000 }, (_, i) => `${i + 1}. passo número ${i + 1}`).join('\n') });
    const m = montarPerguntaParaIa('pergunta', [grande]);
    expect(m.length).toBeLessThan(LIMITE_DO_ARTIGO_PARA_IA + 300);
    expect(m).toContain('(… o artigo continua)');
    expect(cortarTexto('curto', 10)).toBe('curto');
    expect(cortarTexto('uma linha\noutra linha que passa', 20, '…')).toBe('uma linha\noutra\n…');
  });
  it('busca sem palavra que conte ("???") não manda artigo nenhum', () => {
    expect(juntarAchados([buscarArtigos(artigos, '???', 'alguma'), buscarArtigos(artigos, '--', 'alguma')])).toEqual([]);
  });
  it('as buscas se juntam: os pontos se somam e vão no máximo seis', () => {
    const listas = ['cai sozinha', 'roteador', 'sip alg'].map((t) => buscarArtigos(artigos, t, 'alguma'));
    expect(juntarAchados(listas).map((a) => a.numero)).toEqual([12, 19, 7]);
    expect(juntarAchados(listas, 1).map((a) => a.numero)).toEqual([12]);
    expect(juntarAchados([[], []])).toEqual([]);
  });
});

describe('O que volta da IA', () => {
  it('cada linha vira um trecho com os artigos citados nela', () => {
    const r = lerRespostaComCitacoes('1. Desligue o SIP ALG no roteador [BC-12].\n2. Libere as portas RTP [BC-7] [BC-12].\n\nPor que acontece: o roteador mexe nos pacotes (BC-12).', [12, 7]);
    expect(r.trechos).toEqual([
      { texto: '1. Desligue o SIP ALG no roteador.', fontes: [12] },
      { texto: '2. Libere as portas RTP.', fontes: [7, 12] },
      { texto: '', fontes: [] },
      { texto: 'Por que acontece: o roteador mexe nos pacotes.', fontes: [12] },
    ]);
    expect(r.citados).toEqual([12, 7]);
  });
  it('aceita [BC-3, BC-7], [BC-3; BC-7] e [BC-3 e BC-7]', () => {
    for (const c of ['[BC-3, BC-7]', '[BC-3; BC-7]', '[BC-3 e BC-7]', '[bc 3, bc-7]', '【BC-3】【BC-7】']) {
      expect(lerRespostaComCitacoes(`Faça isso ${c}.`, [3, 7]).trechos[0]).toEqual({ texto: 'Faça isso.', fontes: [3, 7] });
    }
  });
  it('código que não foi para a IA não vale: some do texto', () => {
    const r = lerRespostaComCitacoes('Reinicie o aparelho [BC-99].', [12]);
    expect(r.trechos).toEqual([{ texto: 'Reinicie o aparelho.', fontes: [] }]);
    expect(r.citados).toEqual([]);
  });
  it('o código solto na frase fica no texto e conta', () => {
    const r = lerRespostaComCitacoes('Siga o BC-12 até o passo 3.', [12]);
    expect(r.trechos).toEqual([{ texto: 'Siga o BC-12 até o passo 3.', fontes: [12] }]);
  });
  it('sem markdown e sem o "pensamento" do modelo; linhas em branco viram uma', () => {
    expect(limparResposta('<think>vou pensar</think>\n## Passos\n**1.** Abra o painel\n- confira o ramal\n')).toBe('Passos\n1. Abra o painel\n• confira o ramal');
    const r = lerRespostaComCitacoes('\n\nUm.\n\n\n\nDois.\n\n', []);
    expect(r.trechos.map((t) => t.texto)).toEqual(['Um.', '', 'Dois.']);
  });
  it('o JSON vem com ou sem cerca, com texto em volta', () => {
    expect(jsonDaResposta('```json\n{"termos": ["a"]}\n```')).toEqual({ termos: ['a'] });
    expect(jsonDaResposta('Claro! Aqui está: {"titulo": "X"} Espero ter ajudado.')).toEqual({ titulo: 'X' });
    expect(jsonDaResposta('["a", "b"]')).toEqual(['a', 'b']);
    expect(jsonDaResposta('nada aqui')).toBeNull();
  });
  it('os termos da busca: do JSON, de uma lista, ou das linhas', () => {
    expect(termosDaResposta('{"termos": ["queda de ligação", "SIP ALG", "x", "Queda de ligação"]}')).toEqual(['queda de ligação', 'SIP ALG']);
    expect(termosDaResposta('{"terms": ["rtp", "nat"]}')).toEqual(['rtp', 'nat']);
    expect(termosDaResposta('1. "cai sozinha"\n2. queda de ligação\n3. SIP ALG')).toEqual(['cai sozinha', 'queda de ligação', 'SIP ALG']);
    expect(termosDaResposta('')).toEqual([]);
    expect(termosDaResposta(JSON.stringify({ termos: Array.from({ length: 12 }, (_, i) => `termo ${i}`) }))).toHaveLength(8);
  });
  it('comando e código de discagem não perdem os asteriscos; o negrito de verdade sai', () => {
    expect(limparResposta('Disque **201; para o 202, **202.')).toBe('Disque **201; para o 202, **202.');
    expect(limparResposta('Use `Set(__CALLERID=1)` e **reinicie** o ramal.')).toBe('Use `Set(__CALLERID=1)` e reinicie o ramal.');
    expect(limparResposta('Set(__FROM_DID=1) e Set(__CALLERID=1)')).toBe('Set(__FROM_DID=1) e Set(__CALLERID=1)');
    expect(limparResposta('Rode `asterisk -rx "**teste**"` agora')).toBe('Rode `asterisk -rx "**teste**"` agora');
  });
  it('citação com o traço que não é hífen, no começo da linha e no meio da frase', () => {
    expect(lerRespostaComCitacoes('Libere as portas [BC‑3].', [3]).trechos).toEqual([{ texto: 'Libere as portas.', fontes: [3] }]);
    expect(lerRespostaComCitacoes('[BC-3] Desligue o SIP ALG.', [3]).trechos).toEqual([{ texto: 'Desligue o SIP ALG.', fontes: [3] }]);
    expect(lerRespostaComCitacoes('Desligue [BC-3] e teste.', [3]).trechos).toEqual([{ texto: 'Desligue e teste.', fontes: [3] }]);
    expect(lerRespostaComCitacoes('Faça isso [BC-3] [BC-7].', [3, 7]).trechos).toEqual([{ texto: 'Faça isso.', fontes: [3, 7] }]);
  });
  it('JSON com chaves no texto depois, e a cerca de um comando dentro do texto fica', () => {
    expect(jsonDaResposta('Aqui: {"titulo": "X"} Obs: use {ramal}')).toEqual({ titulo: 'X' });
    expect(jsonDaResposta('```json\n{"comoResolver": "1. Rode:\\n```\\nasterisk -r\\n```"}\n```')).toEqual({ comoResolver: '1. Rode:\n```\nasterisk -r\n```' });
    expect(jsonDaResposta('{"a": "texto com } dentro", "b": [1, 2]}')).toEqual({ a: 'texto com } dentro', b: [1, 2] });
  });
  it('a sobra das linhas não come número do termo; termo sem letra nem número sai', () => {
    expect(termosDaResposta('1. 5060 porta SIP\n2. 3CX\n3. ??')).toEqual(['5060 porta SIP', '3CX']);
    expect(termosDaResposta('{"termos": ["??", "--", "rtp"]}')).toEqual(['rtp']);
  });
  it('o rascunho que volta é conferido', () => {
    expect(rascunhoDaIa({ titulo: ' T ', comoResolver: 3, palavrasDoCliente: ['a', '', 7, ' b '] })).toEqual({
      titulo: 'T', oQueAcontece: '', comoResolver: '', porQueAcontece: '', palavrasDoCliente: ['a', 'b'],
    });
    expect(rascunhoDaIa(null).titulo).toBe('');
    expect(rascunhoDaIa(['x']).titulo).toBe('');
  });
});
