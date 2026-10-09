/**
 * Patch 1.8 — Base de conhecimento (decisão 0039).
 *
 * As contas (busca, texto simples, versões, livrinho) estão testadas em
 * `packages/shared/src/base.test.ts`. Aqui fica o que é do servidor:
 *  - quem escreve, quem lê, rascunho só para quem escreveu (e quem cuida da base)
 *  - publicar exige o "Como resolver"; qualquer um melhora o artigo de qualquer um, mas quem
 *    salvou no meio não é atropelado
 *  - versões (comparar e voltar), ligações conferidas, prints e anexos
 *  - leitura obrigatória (pelo botão do artigo e já no formulário), a base nas fichas e no chamado,
 *    a lixeira e os comentários
 *  - a IA, com o provedor escolhido (Anthropic, OpenAI, Google ou compatível): desligada sem chave;
 *    a chave no cofre; o que vai para cada API; a resposta só com os publicados, citando; os erros
 *    em português; a lista de modelos; o rascunho a partir do card; o limite de uso
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { linechatFields, linechatSteps, linechatCards, settings } from '@gestor/db';
import { INSTRUCOES_PERGUNTA, INSTRUCOES_RASCUNHO, INSTRUCOES_TERMOS } from '@gestor/shared';
import { makeApp, Session, type App } from './helpers.js';
import { esquecerLimitesIa, trocarFerramentasIa } from '../src/services/baseIa.js';

let app: App;
let s: Session;          // administrador: escreve e cuida da base
let operador: Session;   // escreve
let tecnico: Session;    // escreve
let leitor: Session;     // só lê
let aurora = '';
let carrierId = '';
let linepbxId = '';

// um PNG de 1×1 (o print colado, já reduzido pelo navegador)
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const SVG = 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=';
const PDF = 'data:application/pdf;base64,JVBERi0xLjQK';

const artigo = (o: Record<string, unknown> = {}) => ({
  titulo: 'Ligação cai sempre aos 32 segundos',
  oQueAcontece: 'A ligação cai sozinha no meio da conversa, sempre perto dos 30 segundos.',
  comoResolver: '1. No roteador da unidade, desligar o SIP ALG.\n`asterisk -rx "pjsip show contacts"`',
  porQueAcontece: 'O roteador mexe nos pacotes da ligação.',
  palavrasDoCliente: ['cai sozinha', 'derruba depois de meio minuto'],
  ...o,
});

beforeAll(async () => {
  app = await makeApp();
  s = new Session(app);
  await s.login();
  const papeis = (await s.get('/admin/roles')).json();
  const idDe = (key: string) => papeis.find((r: any) => r.key === key).id;
  await s.post('/admin/users', { name: 'Marina Costa', email: 'marina@gestor.local', password: 'SenhaDeTeste!123', roleId: idDe('operador') });
  await s.post('/admin/users', { name: 'Bruno Técnico', email: 'bruno@gestor.local', password: 'SenhaDeTeste!123', roleId: idDe('tecnico') });
  await s.post('/admin/users', { name: 'Rita Leitora', email: 'rita@gestor.local', password: 'SenhaDeTeste!123', roleId: idDe('leitor') });
  operador = new Session(app); await operador.login('marina@gestor.local', 'SenhaDeTeste!123');
  tecnico = new Session(app); await tecnico.login('bruno@gestor.local', 'SenhaDeTeste!123');
  leitor = new Session(app); await leitor.login('rita@gestor.local', 'SenhaDeTeste!123');

  aurora = (await s.post('/clients', { tradeName: 'Clínica Aurora', legalName: 'Clínica Aurora LTDA', cnpj: '11.222.333/0001-81' })).json().id;
  carrierId = (await s.get('/admin/catalogs/carriers')).json()[0].id;
  linepbxId = (await s.get('/admin/products')).json().find((p: any) => p.code === 'linepbx').id;

  // a cópia do LineChat: o campo Assunto, o Cliente e o Produto, e dois cards
  const db = app.db;
  await db.insert(settings).values({ id: 'linechat', value: JSON.stringify({ ativo: true, painelId: 'p1', painelNome: 'Ingline - Suporte', appUrl: 'https://inglinechat.com.br' }) });
  await db.insert(linechatSteps).values([{ id: 'n1', title: 'Chamado Em Tratativa N1', position: 1 }, { id: 'n3', title: 'Chamado Em Tratativa N3', position: 2 }]);
  await db.insert(linechatFields).values([
    { key: 'cliente-71', name: 'Cliente', type: 'SINGLESELECT', position: 1, options: ['Clinica Aurora', 'Outro'] },
    { key: 'assunto', name: 'Assunto', type: 'SINGLESELECT', position: 2, options: ['Ramal - Queda de ligação', 'URA - Ajuste'] },
    { key: 'plataforma', name: 'Produto', type: 'SINGLESELECT', position: 3, options: ['LinePBX', 'LineChat'] },
  ]);
  const agora = new Date();
  await db.insert(linechatCards).values([
    {
      id: 'card-1', panelId: 'p1', number: 3642, key: 'IS-3642', title: 'Ligação cai depois de meio minuto',
      description: '<p>Cliente diz que a ligação <b>cai</b> no meio.</p>', stepId: 'n3', stepTitle: 'Chamado Em Tratativa N3',
      customFields: { 'cliente-71': 'Clinica Aurora', assunto: 'Ramal - Queda de ligação', plataforma: 'LinePBX' }, createdAt: agora, updatedAt: agora,
    },
    {
      id: 'card-2', panelId: 'p1', number: 3650, key: 'IS-3650', title: 'URA não toca a mensagem', stepId: 'n1', stepTitle: 'Chamado Em Tratativa N1',
      customFields: { 'cliente-71': 'Outro', assunto: 'URA - Ajuste' }, createdAt: agora, updatedAt: agora,
    },
  ]);
});
afterAll(async () => { await app.close(); });

describe('escrever e ler', () => {
  it('o Leitor não escreve; o Operador escreve (e o rascunho grava só com o título)', async () => {
    expect((await leitor.post('/base', artigo())).statusCode).toBe(403);
    const r = await operador.post('/base', { titulo: 'Rascunho da Marina' });
    expect(r.statusCode).toBe(201);
    expect(r.json()).toMatchObject({ codigo: 'BC-1', situacao: 'rascunho', versao: 1 });
  });

  it('o rascunho só aparece para quem escreveu (e para quem cuida da base)', async () => {
    expect((await operador.get('/base/1')).statusCode).toBe(200);
    expect((await tecnico.get('/base/BC-1')).statusCode).toBe(404);
    expect((await leitor.get('/base/1')).statusCode).toBe(404);
    expect((await s.get('/base/1')).json().situacao).toBe('rascunho');
    const lista = (await tecnico.get('/base?situacao=todos')).json();
    expect(lista.items.map((a: any) => a.codigo)).not.toContain('BC-1');
  });

  it('publicar exige o Como resolver', async () => {
    const r = await tecnico.post('/base', artigo({ comoResolver: '', publicar: true }));
    expect(r.statusCode).toBe(400);
    expect(r.json().error).toMatch(/Como resolver/);
  });

  it('publica com as ligações conferidas: o chamado pode vir pelo código IS', async () => {
    const r = await tecnico.post('/base', artigo({
      publicar: true,
      ligacoes: [
        { tipo: 'cliente', alvo: aurora }, { tipo: 'produto', alvo: linepbxId }, { tipo: 'operadora', alvo: carrierId },
        { tipo: 'assunto', alvo: 'Ramal - Queda de ligação' }, { tipo: 'chamado', alvo: 'is-3642' },
      ],
    }));
    expect(r.statusCode).toBe(201);
    expect(r.json().codigo).toBe('BC-2');
    const a = (await leitor.get('/base/2')).json();
    expect(a.situacao).toBe('publicado');
    expect(a.ligacoes.map((l: any) => `${l.tipo}:${l.nome}`)).toEqual(expect.arrayContaining(['cliente:Clínica Aurora', 'produto:LinePBX', 'assunto:Ramal - Queda de ligação', 'chamado:IS-3642']));
    expect(a.ligacoes.find((l: any) => l.tipo === 'chamado')).toMatchObject({ alvo: 'card-1', extra: 'Ligação cai depois de meio minuto', href: 'https://inglinechat.com.br/panels/p1/card/IS-3642' });
    expect(a.autor.nome).toBe('Bruno Técnico');
  });

  it('recusa ligação com o que não existe', async () => {
    expect((await tecnico.post('/base', artigo({ ligacoes: [{ tipo: 'cliente', alvo: 'nao-existe' }] }))).statusCode).toBe(400);
    expect((await tecnico.post('/base', artigo({ ligacoes: [{ tipo: 'chamado', alvo: 'IS-1' }] }))).statusCode).toBe(400);
  });
});

describe('a busca', () => {
  beforeAll(async () => {
    await s.post('/base', artigo({ titulo: 'Áudio só de um lado depois de trocar a internet', oQueAcontece: 'Ninguém se ouve.', comoResolver: 'Liberar as portas de áudio (RTP) no roteador.', palavrasDoCliente: ['ninguém me ouve'], publicar: true }));
  });
  it('sem acento, por pedaço de palavra, todas as palavras precisam aparecer', async () => {
    const r = (await leitor.get('/base?q=AUDIO')).json();
    expect(r.items.map((a: any) => a.codigo)).toEqual(['BC-3']);
    expect((await leitor.get('/base?q=rotead')).json().total).toBe(2);
    expect((await leitor.get('/base?q=roteador%20sip')).json().items.map((a: any) => a.codigo)).toEqual(['BC-2']);
    expect((await leitor.get('/base?q=roteador%20inexistente')).json().total).toBe(0);
  });
  it('acha pelo nome do que está ligado, e mostra o trecho', async () => {
    const r = (await leitor.get('/base?q=clinica%20aurora')).json();
    expect(r.items.map((a: any) => a.codigo)).toEqual(['BC-2']);
    const c = (await leitor.get('/base?q=conversa')).json().items[0];
    expect(c.trecho.filter((p: any) => p.achado).map((p: any) => p.texto)).toEqual(['conversa']);
  });
  it('filtra pelo que está ligado e pelo código', async () => {
    expect((await leitor.get(`/base?cliente=${aurora}`)).json().items.map((a: any) => a.codigo)).toEqual(['BC-2']);
    expect((await leitor.get(`/base?assunto=${encodeURIComponent('RAMAL - QUEDA DE LIGACAO')}`)).json().total).toBe(1);
    expect((await leitor.get('/base?q=BC-3')).json().items.map((a: any) => a.codigo)).toEqual(['BC-3']);
  });
});

describe('melhorar e as versões', () => {
  it('qualquer um que escreve melhora o artigo de outra pessoa; cada mudança no texto vira versão', async () => {
    const atual = (await operador.get('/base/2')).json();
    const r = await operador.put('/base/2', { ...artigo({ comoResolver: `${atual.comoResolver}\n2. Fazer uma ligação de teste.` }), ligacoes: atual.ligacoes.map((l: any) => ({ tipo: l.tipo, alvo: l.alvo })), publicar: true, versao: atual.versao });
    expect(r.statusCode).toBe(200);
    expect(r.json().versao).toBe(2);
    const depois = (await s.get('/base/2')).json();
    expect(depois.atualizadoPor).toBe('Marina Costa');
    expect(depois.ligacoes).toHaveLength(5);
  });

  it('quem salvou no meio não é atropelado', async () => {
    const r = await tecnico.put('/base/2', { ...artigo({ titulo: 'Outro título' }), versao: 1 });
    expect(r.statusCode).toBe(409);
    expect(r.json().error).toMatch(/Marina Costa salvou este artigo/);
  });

  it('mudar só as ligações não cria versão', async () => {
    const atual = (await tecnico.get('/base/2')).json();
    const r = await tecnico.put('/base/2', { titulo: atual.titulo, oQueAcontece: atual.oQueAcontece, comoResolver: atual.comoResolver, porQueAcontece: atual.porQueAcontece, palavrasDoCliente: atual.palavrasDoCliente, ligacoes: [{ tipo: 'cliente', alvo: aurora }], publicar: true, versao: atual.versao });
    expect(r.json().versao).toBe(2);
    expect((await tecnico.get('/base/2')).json().ligacoes).toHaveLength(1);
  });

  it('lista, compara e volta a uma versão (que vira uma versão nova)', async () => {
    const v = (await leitor.get('/base/2/versoes')).json();
    expect(v.versoes.map((x: any) => x.versao)).toEqual([2, 1]);
    expect(v.versoes[0].por).toBe('Marina Costa');
    const c = (await leitor.get('/base/2/comparar?de=1&para=2')).json();
    expect(c.para.comoResolver).toMatch(/ligação de teste/);
    expect(c.de.comoResolver).not.toMatch(/ligação de teste/);
    expect((await leitor.post('/base/2/versoes/1/voltar')).statusCode).toBe(403);
    const r = await tecnico.post('/base/2/versoes/1/voltar');
    expect(r.json().versao).toBe(3);
    const a = (await leitor.get('/base/2')).json();
    expect(a.comoResolver).not.toMatch(/ligação de teste/);
    expect((await leitor.get('/base/2/versoes')).json().versoes[0]).toMatchObject({ versao: 3, nota: 'Voltou à versão 1' });
  });
});

describe('prints e anexos', () => {
  it('o print colado troca o marcador pelo id e abre como imagem; o anexo baixa como arquivo', async () => {
    const r = await tecnico.post('/base', {
      titulo: 'Reset de fábrica do GXP1610', comoResolver: '1. Segurar o botão OK.\n[print:novo-1]\n2. Escolher Factory Reset.', publicar: true,
      anexosNovos: [{ ref: 'novo-1', fileName: 'tela.png', conteudo: PNG, inline: true }, { ref: 'manual', fileName: 'manual.pdf', conteudo: PDF }],
    });
    expect(r.statusCode).toBe(201);
    const a = (await leitor.get(`/base/${r.json().numero}`)).json();
    const print = a.anexos.find((x: any) => x.inline);
    expect(a.comoResolver).toContain(`[print:${print.id}]`);
    const img = await leitor.get(`/base/anexos/${print.id}`);
    expect(img.headers['content-type']).toBe('image/png');
    expect(img.headers['content-disposition']).toMatch(/^inline/);
    const pdf = await leitor.get(`/base/anexos/${a.anexos.find((x: any) => !x.inline).id}`);
    expect(pdf.headers['content-type']).toBe('application/octet-stream');
    expect(pdf.headers['content-disposition']).toMatch(/^attachment/);
  });
  it('SVG não entra no meio do texto, e print citado que não chegou é recusado', async () => {
    expect((await tecnico.post('/base', { titulo: 'Com SVG', comoResolver: '[print:x]', anexosNovos: [{ ref: 'x', fileName: 'a.svg', conteudo: SVG, inline: true }] })).statusCode).toBe(400);
    const r = await tecnico.post('/base', { titulo: 'Print perdido', comoResolver: '1. ver\n[print:sumiu]' });
    expect(r.statusCode).toBe(400);
    expect(r.json().error).toMatch(/print/);
  });
});

describe('leitura obrigatória', () => {
  it('só quem cuida da base pede; vale a leitura feita depois do pedido', async () => {
    expect((await tecnico.post('/base/3/obrigatoria', { ligar: true })).statusCode).toBe(403);
    expect((await s.post('/base/1/obrigatoria', { ligar: true })).statusCode).toBe(400); // rascunho
    expect((await s.post('/base/3/obrigatoria', { ligar: true })).statusCode).toBe(200);
    expect((await operador.get('/base/obrigatorias')).json()).toMatchObject({ naoLidas: 1, artigos: [{ codigo: 'BC-3' }] });
    await operador.post('/base/3/lida');
    expect((await operador.get('/base/obrigatorias')).json().naoLidas).toBe(0);
    const l = (await s.get('/base/3/leituras')).json();
    expect(l.lidos.map((x: any) => x.nome)).toEqual(['Marina Costa']);
    expect(l.faltam.map((x: any) => x.nome)).toContain('Rita Leitora');
    // pedir de novo: todo mundo precisa ler outra vez
    await new Promise((ok) => setTimeout(ok, 5));
    await s.post('/base/3/obrigatoria', { ligar: true });
    expect((await operador.get('/base/obrigatorias')).json().naoLidas).toBe(1);
    expect((await leitor.get('/base/3')).json().obrigatoria).toMatchObject({ lidaPorMim: false, lidos: 0 });
  });
});

describe('a base nas outras telas', () => {
  it('a ficha mostra os artigos ligados (só os publicados)', async () => {
    await operador.post('/base', { titulo: 'Rascunho da Aurora', ligacoes: [{ tipo: 'cliente', alvo: aurora }] });
    const r = (await leitor.get(`/base/ligados?tipo=cliente&alvo=${aurora}`)).json();
    expect(r.total).toBe(1);
    expect(r.artigos[0].codigo).toBe('BC-2');
  });

  it('o livrinho: o chamado acha o artigo pelo próprio card, pelo assunto ou pelo cliente', async () => {
    // BC-3 ganha o assunto da URA; o BC-2 já está ligado à Clínica Aurora
    await s.post('/base/3/ligacoes', { tipo: 'assunto', alvo: 'URA - Ajuste' });
    const r = (await leitor.post('/base/para-chamados', { ids: ['card-1', 'card-2', 'card-x'] })).json();
    expect(r['card-1'].map((a: any) => a.numero)).toEqual([2]);
    expect(r['card-2'].map((a: any) => a.numero)).toEqual([3]);
    expect(r['card-x']).toBeUndefined();
  });

  it('registrar a partir do chamado já preenche título, descrição e ligações', async () => {
    expect((await leitor.get('/base/do-chamado/IS-3642')).statusCode).toBe(403);
    const r = (await operador.get('/base/do-chamado/IS-3642')).json();
    expect(r.titulo).toBe('Ligação cai depois de meio minuto');
    expect(r.oQueAcontece).toBe('Cliente diz que a ligação cai no meio.');
    expect(r.chamado.link).toBe('https://inglinechat.com.br/panels/p1/card/IS-3642');
    expect(r.ligacoes.map((l: any) => `${l.tipo}:${l.nome}`)).toEqual(['chamado:IS-3642', 'assunto:Ramal - Queda de ligação', 'cliente:Clínica Aurora', 'produto:LinePBX']);
  });

  it('o projeto aponta o "como fazer"', async () => {
    const p = (await s.post('/projects', { name: 'Feriado de 12 de outubro', etapas: [{ title: 'Programar', kind: 'check' }], clientIds: [aurora] })).json();
    expect((await tecnico.post('/base/3/ligacoes', { tipo: 'projeto', alvo: p.id })).statusCode).toBe(200);
    expect((await leitor.get(`/base/ligados?tipo=projeto&alvo=${p.id}`)).json().artigos.map((a: any) => a.codigo)).toEqual(['BC-3']);
    await tecnico.post('/base/3/ligacoes', { tipo: 'projeto', alvo: p.id, ligar: false });
    expect((await leitor.get(`/base/ligados?tipo=projeto&alvo=${p.id}`)).json().total).toBe(0);
  });
});

describe('a lixeira', () => {
  it('só quem escreveu (ou quem cuida da base) manda para a lixeira; dá para restaurar', async () => {
    expect((await operador.del('/base/3')).statusCode).toBe(403);
    expect((await tecnico.del('/base/2')).statusCode).toBe(200);
    expect((await leitor.get('/base/2')).statusCode).toBe(404);
    const lixo = (await s.get('/admin/trash')).json().find((x: any) => x.type === 'knowledgeArticle');
    expect(lixo.label).toMatch(/^BC-2 · /);
    expect((await s.post(`/admin/trash/knowledgeArticle/${lixo.id}/restore`)).statusCode).toBe(200);
    expect((await leitor.get('/base/2')).statusCode).toBe(200);
  });
});

describe('leitura obrigatória pedida no formulário (pedido do Luan na prévia)', () => {
  it('quem cuida da base pede junto com o publicar; pedir de novo ao salvar não cria versão', async () => {
    const novo = artigo({ titulo: 'Trocar o certificado do servidor antes de vencer', publicar: true, pedirLeitura: true });
    expect((await tecnico.post('/base', novo)).statusCode).toBe(403);
    expect((await s.post('/base', { ...novo, publicar: false })).statusCode).toBe(400); // rascunho só a pessoa vê
    const r = await s.post('/base', novo);
    expect(r.statusCode).toBe(201);
    const { numero, codigo } = r.json();
    const a = (await operador.get(`/base/${numero}`)).json();
    expect(a.obrigatoria).toMatchObject({ lidaPorMim: false, lidos: 0 });
    expect((await operador.get('/base/obrigatorias')).json().artigos.map((x: any) => x.codigo)).toContain(codigo);
    await operador.post(`/base/${numero}/lida`);
    expect((await operador.get('/base/obrigatorias')).json().artigos.map((x: any) => x.codigo)).not.toContain(codigo);

    // melhorar sem mudar o texto, pedindo a leitura de novo: todo mundo lê outra vez, a versão fica
    expect((await tecnico.put(`/base/${numero}`, { ...novo, versao: 1 })).statusCode).toBe(403);
    await new Promise((ok) => setTimeout(ok, 5));
    expect((await s.put(`/base/${numero}`, { ...novo, versao: 1 })).statusCode).toBe(200);
    expect((await operador.get('/base/obrigatorias')).json().artigos.map((x: any) => x.codigo)).toContain(codigo);
    expect((await operador.get(`/base/${numero}`)).json()).toMatchObject({ versao: 1, obrigatoria: { lidaPorMim: false } });

    // a auditoria: o pedido, duas vezes, e nenhum "Editou" (o texto não mudou)
    const resumos = (await s.get(`/admin/audit?entityId=${a.id}`)).json().items.map((x: any) => x.summary);
    expect(resumos.filter((t: string) => t.startsWith(`Pediu a leitura obrigatória de ${codigo}`))).toHaveLength(2);
    expect(resumos.some((t: string) => t.startsWith(`Editou ${codigo}`))).toBe(false);
  });
});

describe('comentários (pedido do Luan na prévia)', () => {
  it('quem escreve comenta, fica registrado quem e quando; quem só lê, lê', async () => {
    const r = (await s.post('/base', artigo({ titulo: 'Gravação de chamada sem áudio do atendente', publicar: true }))).json();
    expect((await leitor.post(`/base/${r.numero}/comentarios`, { texto: 'Também vi isso' })).statusCode).toBe(403);
    expect((await operador.post(`/base/${r.numero}/comentarios`, { texto: '   ' })).statusCode).toBe(400);
    expect((await operador.post(`/base/${r.numero}/comentarios`, { texto: 'Aconteceu de novo na Aurora em 02/10:\nera o mesmo roteador.' })).statusCode).toBe(201);
    await new Promise((ok) => setTimeout(ok, 5));
    expect((await tecnico.post(`/base/${r.numero}/comentarios`, { texto: 'No Mikrotik a opção fica em IP › Firewall › Service Ports.' })).statusCode).toBe(201);

    const visto = (await leitor.get(`/base/${r.numero}`)).json();
    expect(visto.podeComentar).toBe(false);
    // do mais novo para o mais antigo, com quem escreveu; o texto do artigo não mudou
    expect(visto.comentarios.map((c: any) => [c.autor, c.texto, c.podeApagar])).toEqual([
      ['Bruno Técnico', 'No Mikrotik a opção fica em IP › Firewall › Service Ports.', false],
      ['Marina Costa', 'Aconteceu de novo na Aurora em 02/10:\nera o mesmo roteador.', false],
    ]);
    expect(visto.versao).toBe(1);
    expect((await operador.get(`/base/${r.numero}`)).json().comentarios.map((c: any) => c.podeApagar)).toEqual([false, true]);
    expect((await leitor.get('/base?q=gravacao sem audio')).json().items[0]).toMatchObject({ numero: r.numero, comentarios: 2 });
  });

  it('apagar é só o seu (ou quem cuida da base), e a auditoria guarda o texto', async () => {
    const r = (await s.get('/base?q=gravacao sem audio')).json().items[0];
    const [doTecnico, daMarina] = (await s.get(`/base/${r.numero}`)).json().comentarios;
    expect((await tecnico.del(`/base/${r.numero}/comentarios/${daMarina.id}`)).statusCode).toBe(403);
    expect((await operador.del(`/base/${r.numero}/comentarios/${daMarina.id}`)).statusCode).toBe(200);
    expect((await s.del(`/base/${r.numero}/comentarios/${doTecnico.id}`)).statusCode).toBe(200);
    expect((await s.del(`/base/${r.numero}/comentarios/${doTecnico.id}`)).statusCode).toBe(404);
    expect((await leitor.get(`/base/${r.numero}`)).json().comentarios).toEqual([]);
    expect((await leitor.get('/base?q=gravacao sem audio')).json().items[0].comentarios).toBe(0);

    const itens = (await s.get(`/admin/audit?entityId=${r.id}`)).json().items;
    expect(itens.filter((x: any) => x.summary.startsWith(`Comentou em ${r.codigo}`))).toHaveLength(2);
    const apagou = itens.find((x: any) => x.summary === `Apagou um comentário de Bruno Técnico em ${r.codigo}`);
    expect(apagou.before).toMatchObject({ comentario: 'No Mikrotik a opção fica em IP › Firewall › Service Ports.', por: 'Bruno Técnico' });
    expect(itens.some((x: any) => x.summary === `Apagou um comentário em ${r.codigo}`)).toBe(true); // a Marina apagou o dela
  });
});

describe('a IA, com o provedor escolhido', () => {
  type Chamada = { url: string; metodo: string; corpo: any; cabecalhos: Headers; redirect?: string };
  type Falsa = { status?: number; corpo?: unknown; erro?: Error };
  let chamadas: Chamada[] = [];
  /** o que cada chamada devolve, na ordem (faltou: erro 500, para o teste perceber) */
  let respostas: Falsa[] = [];
  beforeAll(() => {
    trocarFerramentasIa({
      fetchFn: (async (url: string, init: RequestInit) => {
        chamadas.push({ url: String(url), metodo: init.method ?? 'GET', corpo: init.body ? JSON.parse(String(init.body)) : null, cabecalhos: new Headers(init.headers), redirect: init.redirect });
        const r = respostas.shift() ?? { status: 500, corpo: {} };
        if (r.erro) throw r.erro;
        return new Response(JSON.stringify(r.corpo ?? {}), { status: r.status ?? 200, headers: { 'content-type': 'application/json' } });
      }) as typeof fetch,
      // para onde o nome do serviço compatível aponta (o teste não sai para a internet)
      resolver: async (host: string) => { nomesResolvidos.push(host); return ipsDoServico; },
    });
  });
  let ipsDoServico: string[] = [];
  let nomesResolvidos: string[] = [];
  beforeEach(() => { chamadas = []; respostas = []; esquecerLimitesIa(); ipsDoServico = ['203.0.113.10']; nomesResolvidos = []; });

  // o formato de resposta de cada provedor
  const anthropic = (texto: string, entrada = 100, saida = 20): Falsa => ({ corpo: { content: [{ type: 'text', text: texto }], stop_reason: 'end_turn', usage: { input_tokens: entrada, output_tokens: saida } } });
  const openai = (texto: string, entrada = 100, saida = 20): Falsa => ({ corpo: { choices: [{ message: { role: 'assistant', content: texto }, finish_reason: 'stop' }], usage: { prompt_tokens: entrada, completion_tokens: saida } } });
  const google = (texto: string, entrada = 100, saida = 20): Falsa => ({
    corpo: { candidates: [{ content: { role: 'model', parts: [{ text: 'pensando no assunto…', thought: true }, { text: texto }] }, finishReason: 'STOP' }], usageMetadata: { promptTokenCount: entrada, candidatesTokenCount: saida, thoughtsTokenCount: 5 } },
  });
  const ajustes = (o: Record<string, unknown>) => s.put('/base/ia/ajustes', { ativo: true, modeloNome: null, precoEntrada: null, precoSaida: null, ...o });

  it('desligada sem chave: avisa em vez de tentar', async () => {
    expect((await leitor.get('/base/ia')).json()).toMatchObject({ ativa: false });
    const r = await leitor.post('/base/ia/perguntar', { pergunta: 'ligação cai?' });
    expect(r.statusCode).toBe(400);
    expect(r.json().error).toMatch(/chave/);
    expect((await ajustes({ provedor: 'anthropic', modelo: 'claude-sonnet-5-5' })).json().error).toMatch(/Cole a chave da API da Anthropic/);
    expect((await ajustes({ provedor: 'openai', modelo: '' })).statusCode).toBe(400); // ligar pede o modelo
    expect(chamadas).toHaveLength(0);
  });

  it('a chave vai para o cofre e nunca volta; só a administração mexe', async () => {
    expect((await tecnico.put('/base/ia/ajustes', { ativo: true, provedor: 'anthropic', modelo: 'claude-sonnet-5-5', chave: 'chave-falsa-anthropic' })).statusCode).toBe(403);
    const r = await ajustes({ provedor: 'anthropic', modelo: 'claude-sonnet-5-5', modeloNome: 'Claude Sonnet 5.5', chave: 'chave-falsa-anthropic' });
    expect(r.statusCode).toBe(200);
    expect(JSON.stringify(r.json())).not.toContain('chave-falsa-anthropic');
    expect(r.json()).toMatchObject({ ativo: true, provedor: 'anthropic', temChave: true, chaveDe: 'anthropic', uso: { perguntas: 0, custo: null } });
    expect(JSON.stringify(await app.db.select().from(settings))).not.toContain('chave-falsa-anthropic');
    expect((await leitor.get('/base/ia')).json()).toEqual({ ativa: true, modelo: 'Claude Sonnet 5.5', provedor: 'Anthropic (Claude)' });
    const auditoria = (await s.get('/admin/audit?entityId=base-ia')).json().items;
    expect(auditoria[0].summary).toMatch(/ligou a IA da base \(Anthropic \(Claude\) · Claude Sonnet 5\.5\) e trocou a chave/);
    expect(JSON.stringify(auditoria)).not.toContain('chave-falsa-anthropic');
  });

  it('Anthropic: a IA sugere as palavras, o Gestor procura e ela responde só com os publicados, citando', async () => {
    // um rascunho que a busca acharia: rascunho nunca vai para a IA
    await operador.post('/base', { titulo: 'Áudio mudo no ramal (rascunho)', comoResolver: 'Liberar as portas RTP no roteador.' });
    respostas = [
      anthropic('{"termos": ["portas rtp", "roteador", "áudio de um lado"]}', 300, 30),
      anthropic('1. Libere as portas de áudio (RTP) no roteador [BC-3].\n2. Depois teste uma ligação.', 2000, 100),
    ];
    const r = await leitor.post('/base/ia/perguntar', { pergunta: 'O ramal toca mas ninguém se ouve' });
    expect(r.statusCode).toBe(200);
    const b = r.json();
    expect(b.achou).toBe(true);
    expect(b.trechos).toEqual([
      { texto: '1. Libere as portas de áudio (RTP) no roteador.', fontes: [3] },
      { texto: '2. Depois teste uma ligação.', fontes: [] },
    ]);
    expect(b.artigos[0]).toMatchObject({ codigo: 'BC-3', titulo: 'Áudio só de um lado depois de trocar a internet', citado: true });
    expect(b).toMatchObject({ modelo: 'Claude Sonnet 5.5', provedor: 'Anthropic (Claude)', custo: null });

    // o que foi para a API da Anthropic: a chave no cabeçalho, as instruções, a pergunta e os artigos
    expect(chamadas.map((c) => [c.metodo, c.url])).toEqual([['POST', 'https://api.anthropic.com/v1/messages'], ['POST', 'https://api.anthropic.com/v1/messages']]);
    expect(chamadas[0]!.cabecalhos.get('x-api-key')).toBe('chave-falsa-anthropic');
    expect(chamadas[0]!.cabecalhos.get('anthropic-version')).toBe('2023-06-01');
    expect(chamadas[0]!.corpo).toMatchObject({ model: 'claude-sonnet-5-5', system: INSTRUCOES_TERMOS, messages: [{ role: 'user', content: 'O ramal toca mas ninguém se ouve' }] });
    expect(chamadas[1]!.corpo.system).toBe(INSTRUCOES_PERGUNTA);
    const mensagem: string = chamadas[1]!.corpo.messages[0].content;
    expect(mensagem).toContain('[BC-3] Áudio só de um lado depois de trocar a internet');
    expect(mensagem).toContain('Como resolver:\nLiberar as portas de áudio (RTP) no roteador.');
    expect(mensagem.endsWith('Pergunta da equipe: O ramal toca mas ninguém se ouve')).toBe(true);
    expect(mensagem).not.toContain('rascunho');

    // o mês soma os usos e os tokens; sem o preço do modelo, sem custo
    expect((await s.get('/base/ia/ajustes')).json().uso).toMatchObject({ perguntas: 1, rascunhos: 0, entrada: 2300, saida: 130, custo: null });
    const auditoria = (await s.get('/admin/audit?action=base_ia_pergunta')).json().items;
    expect(auditoria.some((x: any) => x.summary.includes('respondeu com BC-3'))).toBe(true);
  });

  it('OpenAI: trocar de provedor pede a chave dele; com o preço, sai o custo', async () => {
    expect((await ajustes({ provedor: 'openai', modelo: 'gpt-5.4-mini' })).json().error).toMatch(/A chave guardada é da Anthropic\. Cole a chave da OpenAI/);
    // desligada, dá para escolher o provedor antes de ter a chave
    expect((await s.put('/base/ia/ajustes', { ativo: false, provedor: 'openai', modelo: 'gpt-5.4-mini' })).json()).toMatchObject({ ativo: false, chaveDe: 'anthropic' });
    expect((await leitor.get('/base/ia')).json().ativa).toBe(false);
    const r = await ajustes({ provedor: 'openai', modelo: 'gpt-5.4-mini', chave: 'chave-falsa-openai', precoEntrada: 0.25, precoSaida: 2 });
    expect(r.json()).toMatchObject({ provedor: 'openai', modelo: 'gpt-5.4-mini', modeloNome: null, chaveDe: 'openai', precoEntrada: 0.25, precoSaida: 2 });

    respostas = [openai('{"termos": ["rtp", "roteador"]}', 400, 40), openai('Libere as portas RTP no roteador [BC-3, BC-99].', 1600, 60)];
    const b = (await tecnico.post('/base/ia/perguntar', { pergunta: 'ninguém se ouve na ligação' })).json();
    // o BC-99 não foi para a IA: some do texto
    expect(b.trechos).toEqual([{ texto: 'Libere as portas RTP no roteador.', fontes: [3] }]);
    expect(b.custo).toBeCloseTo((2000 * 0.25 + 100 * 2) / 1_000_000, 6);
    expect(chamadas[0]!.url).toBe('https://api.openai.com/v1/chat/completions');
    expect(chamadas[0]!.cabecalhos.get('authorization')).toBe('Bearer chave-falsa-openai');
    expect(chamadas[0]!.cabecalhos.get('x-api-key')).toBeNull();
    expect(chamadas[0]!.corpo).toMatchObject({ model: 'gpt-5.4-mini', response_format: { type: 'json_object' }, max_completion_tokens: 2048 });
    expect(chamadas[0]!.corpo.messages).toEqual([{ role: 'system', content: INSTRUCOES_TERMOS }, { role: 'user', content: 'ninguém se ouve na ligação' }]);
    expect(chamadas[1]!.corpo.response_format).toBeUndefined();
    expect((await s.get('/base/ia/ajustes')).json().uso).toMatchObject({ perguntas: 2, custo: expect.any(Number) });
  });

  it('Google (Gemini): o pensamento do modelo não entra na resposta, mas entra na conta', async () => {
    await ajustes({ provedor: 'google', modelo: 'gemini-3.5-flash', chave: 'chave-falsa-google' });
    respostas = [google('{"termos": ["rtp"]}'), google('Libere as portas RTP [BC-3].', 1000, 50)];
    const b = (await leitor.post('/base/ia/perguntar', { pergunta: 'ninguém se ouve' })).json();
    expect(b.trechos).toEqual([{ texto: 'Libere as portas RTP.', fontes: [3] }]);
    expect(chamadas[0]!.url).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent');
    expect(chamadas[0]!.cabecalhos.get('x-goog-api-key')).toBe('chave-falsa-google');
    expect(chamadas[0]!.url).not.toContain('chave-falsa-google');
    expect(chamadas[0]!.corpo).toMatchObject({
      systemInstruction: { parts: [{ text: INSTRUCOES_TERMOS }] },
      contents: [{ role: 'user', parts: [{ text: 'ninguém se ouve' }] }],
      generationConfig: { maxOutputTokens: 2048, responseMimeType: 'application/json' },
    });
    expect(chamadas[1]!.corpo.generationConfig.responseMimeType).toBeUndefined();
    // nesta pergunta, 100 + 1000 lidos e 20 + 5 + 50 + 5 escritos: o "pensamento" também se paga
    expect((await s.get('/base/ia/ajustes')).json().uso).toMatchObject({ perguntas: 3, entrada: 2300 + 2000 + 1100, saida: 130 + 100 + 80 });
  });

  it('compatível (OpenRouter, DeepSeek…): o endereço colado de qualquer jeito, e o limite menor', async () => {
    expect((await ajustes({ provedor: 'compativel', modelo: 'deepseek-chat', endereco: 'http://api.deepseek.com', chave: 'chave-falsa-deepseek' })).statusCode).toBe(400);
    expect((await ajustes({ provedor: 'compativel', modelo: 'deepseek-chat', endereco: 'https://localhost/v1', chave: 'chave-falsa-deepseek' })).statusCode).toBe(400);
    const r = await ajustes({ provedor: 'compativel', modelo: 'deepseek-chat', endereco: ' https://api.deepseek.com/chat/completions/ ', chave: 'chave-falsa-deepseek' });
    expect(r.json()).toMatchObject({ provedor: 'compativel', endereco: 'https://api.deepseek.com', chaveDe: 'compativel' });
    expect((await leitor.get('/base/ia')).json()).toMatchObject({ ativa: true, modelo: 'deepseek-chat' });

    respostas = [openai('<think>o cliente quer…</think>{"termos": ["rtp"]}'), openai('<think>vou citar o BC-3</think>Libere as portas RTP [BC-3].')];
    const b = (await leitor.post('/base/ia/perguntar', { pergunta: 'ninguém se ouve' })).json();
    expect(b.trechos).toEqual([{ texto: 'Libere as portas RTP.', fontes: [3] }]);
    expect(chamadas[0]!.url).toBe('https://api.deepseek.com/chat/completions');
    expect(chamadas[0]!.cabecalhos.get('authorization')).toBe('Bearer chave-falsa-deepseek');
    expect(chamadas.map((c) => c.redirect)).toEqual(['error', 'error']);
    expect(nomesResolvidos).toEqual(['api.deepseek.com', 'api.deepseek.com']);
    expect(chamadas[1]!.corpo).toMatchObject({ model: 'deepseek-chat', max_tokens: 4096 });
    expect(chamadas[1]!.corpo.max_completion_tokens).toBeUndefined();
    expect(chamadas[0]!.corpo.response_format).toBeUndefined();
  });

  it('não achou nada na base: diz isso sem a 2ª conversa (não gasta à toa)', async () => {
    respostas = [openai('{"termos": ["xyzzy"]}')];
    const b = (await leitor.post('/base/ia/perguntar', { pergunta: 'qwertyuiop asdfgh' })).json();
    expect(b).toMatchObject({ achou: false, artigos: [] });
    expect(b.trechos[0].texto).toMatch(/não achei nenhum artigo/);
    expect(chamadas).toHaveLength(1);
    // "???" não tem palavra que conte: nada de mandar artigo qualquer para a IA
    chamadas = [];
    respostas = [openai('{"termos": ["??", "--"]}')];
    expect((await leitor.post('/base/ia/perguntar', { pergunta: '???' })).json()).toMatchObject({ achou: false, artigos: [] });
    expect(chamadas).toHaveLength(1);
  });

  it('serviço que não diz os tokens: a pergunta conta do mesmo jeito', async () => {
    const antes = (await s.get('/base/ia/ajustes')).json().uso;
    respostas = [{ corpo: { choices: [{ message: { content: '{"termos": ["rtp"]}' } }] } }, { corpo: { choices: [{ message: { content: [{ type: 'thinking', thinking: 'hmm' }, { type: 'text', text: 'Libere as portas RTP [BC-3].' }] } }] } }];
    const b = (await leitor.post('/base/ia/perguntar', { pergunta: 'ninguém se ouve' })).json();
    // a resposta em partes (o "pensamento" numa, o texto noutra) também é lida
    expect(b.trechos).toEqual([{ texto: 'Libere as portas RTP.', fontes: [3] }]);
    const depois = (await s.get('/base/ia/ajustes')).json().uso;
    expect(depois.perguntas).toBe(antes.perguntas + 1);
    expect(depois.entrada).toBe(antes.entrada);
  });

  it('os erros do provedor viram mensagem em português, sem a chave', async () => {
    const casos: Array<[Falsa, RegExp]> = [
      [{ status: 401, corpo: { error: { message: 'Incorrect API key provided: chave-falsa-deepseek' } } }, /A chave da IA foi recusada/],
      [{ status: 402, corpo: { error: { message: 'Insufficient Balance' } } }, /sem crédito/],
      [{ status: 429, corpo: { error: { code: 'insufficient_quota', message: 'You exceeded your current quota' } } }, /sem crédito/],
      [{ status: 404, corpo: { error: { message: 'Model Not Exist' } } }, /não reconheceu o modelo "deepseek-chat" \(ou o endereço da API\)/],
      [{ status: 429, corpo: { error: { message: 'Rate limit reached' } } }, /limite de pedidos/],
      [{ status: 429, corpo: { error: { code: 429, message: 'You exceeded your current quota, please check your plan and billing details.', status: 'RESOURCE_EXHAUSTED' } } }, /limite de pedidos/],
      [{ erro: Object.assign(new TypeError('fetch failed'), { cause: new Error('unexpected redirect') }) }, /redirecionou/],
      [{ status: 503, corpo: {} }, /sobrecarregada/],
      [{ status: 400, corpo: { error: { message: 'max_tokens is too large for chave-falsa-deepseek' } } }, /recusou o pedido \(400\): max_tokens is too large/],
      [{ erro: Object.assign(new TypeError('fetch failed'), { cause: { code: 'ENOTFOUND' } }) }, /Não achei o endereço/],
      [{ erro: Object.assign(new Error('demorou'), { name: 'TimeoutError' }) }, /demorou demais/],
    ];
    for (const [falsa, espera] of casos) {
      respostas = [falsa];
      const r = (await s.post('/base/ia/testar')).json();
      expect(r.ok).toBe(false);
      expect(r.mensagem).toMatch(espera);
      expect(r.mensagem).not.toContain('chave-falsa-deepseek');
    }
    // na pergunta, o erro chega como erro da tela
    respostas = [{ status: 401, corpo: {} }];
    const r = await leitor.post('/base/ia/perguntar', { pergunta: 'qualquer coisa' });
    expect(r.statusCode).toBe(400);
    expect(r.json().error).toMatch(/A chave da IA foi recusada \(Outro compatível/);
  });

  it('testar: com o que está guardado; mudar o modelo apaga o último teste', async () => {
    respostas = [openai('')];
    expect((await s.post('/base/ia/testar')).json()).toMatchObject({ ok: false, mensagem: expect.stringMatching(/respondeu sem texto/) });
    respostas = [openai('funcionando')];
    expect((await s.post('/base/ia/testar')).json()).toMatchObject({ ok: true, mensagem: expect.stringMatching(/A IA respondeu \(deepseek-chat, .*\): "funcionando"/) });
    expect(chamadas.at(-1)!.corpo.max_tokens).toBe(4096);
    expect((await s.get('/base/ia/ajustes')).json()).toMatchObject({ ultimoTesteOk: true, ultimoTesteMsg: expect.stringContaining('funcionando') });
    expect((await leitor.post('/base/ia/testar')).statusCode).toBe(403);
    // o teste não conta no uso do mês (sete perguntas até aqui; a que deu erro antes de responder não conta)
    expect((await s.get('/base/ia/ajustes')).json().uso.perguntas).toBe(7);
    const r = await ajustes({ provedor: 'compativel', modelo: 'deepseek-reasoner', endereco: 'https://api.deepseek.com' });
    expect(r.json()).toMatchObject({ modelo: 'deepseek-reasoner', ultimoTesteEm: null, ultimoTesteOk: null, chaveDe: 'compativel' });
    await ajustes({ provedor: 'compativel', modelo: 'deepseek-chat', endereco: 'https://api.deepseek.com' });
  });

  it('a chave guardada do compatível só vai para o serviço dela', async () => {
    // outro endereço com a chave guardada: nem sai pedido
    const r1 = await s.post('/base/ia/modelos', { provedor: 'compativel', endereco: 'https://outro-servico.example.com/v1' });
    expect(r1.statusCode).toBe(400);
    expect(r1.json().error).toMatch(/Cole a chave da API de outro-servico\.example\.com/);
    expect(chamadas).toHaveLength(0);
    // ligar com outro endereço pede a chave dele
    expect((await ajustes({ provedor: 'compativel', modelo: 'deepseek-chat', endereco: 'https://openrouter.ai/api/v1' })).json().error)
      .toMatch(/A chave guardada é de api\.deepseek\.com\. Cole a chave de openrouter\.ai/);
    // desligada, dá para gravar o endereço novo; mas a chave de lá não serve aqui
    expect((await s.put('/base/ia/ajustes', { ativo: false, provedor: 'compativel', modelo: 'deepseek-chat', endereco: 'https://openrouter.ai/api/v1' })).json())
      .toMatchObject({ chaveDe: 'compativel', chaveEndereco: 'api.deepseek.com', endereco: 'https://openrouter.ai/api/v1' });
    const t = await s.post('/base/ia/testar');
    expect(t.statusCode).toBe(400);
    expect(t.json().error).toMatch(/A chave guardada é de api\.deepseek\.com, e o escolhido agora é openrouter\.ai/);
    expect(chamadas).toHaveLength(0);
    // de volta ao endereço dela, a chave volta a servir
    expect((await ajustes({ provedor: 'compativel', modelo: 'deepseek-chat', endereco: 'https://api.deepseek.com' })).statusCode).toBe(200);
    expect((await leitor.get('/base/ia')).json().ativa).toBe(true);
  });

  it('o compatível não vai para a rede de dentro', async () => {
    ipsDoServico = ['10.0.0.5'];
    const r = (await s.post('/base/ia/testar')).json();
    expect(r).toMatchObject({ ok: false, mensagem: expect.stringMatching(/aponta para a rede de dentro/) });
    ipsDoServico = ['::ffff:127.0.0.1'];
    expect((await s.post('/base/ia/testar')).json().mensagem).toMatch(/rede de dentro/);
    expect(chamadas).toHaveLength(0);
  });

  it('buscar modelos: com a chave digitada (ou a guardada, do mesmo provedor), só os de conversa', async () => {
    expect((await tecnico.post('/base/ia/modelos', { provedor: 'anthropic', chave: 'outra-chave-falsa-anthropic' })).statusCode).toBe(403);
    respostas = [{ corpo: { data: [{ id: 'claude-opus-5-5', display_name: 'Claude Opus 5.5' }, { id: 'claude-haiku-5-5', display_name: 'Claude Haiku 5.5' }] } }];
    expect((await s.post('/base/ia/modelos', { provedor: 'anthropic', chave: 'outra-chave-falsa-anthropic' })).json()).toEqual({
      modelos: [{ id: 'claude-opus-5-5', nome: 'Claude Opus 5.5' }, { id: 'claude-haiku-5-5', nome: 'Claude Haiku 5.5' }],
    });
    expect(chamadas[0]).toMatchObject({ metodo: 'GET', url: 'https://api.anthropic.com/v1/models?limit=1000' });
    expect(chamadas[0]!.cabecalhos.get('x-api-key')).toBe('outra-chave-falsa-anthropic');

    // a chave guardada agora é do compatível: para a OpenAI, precisa colar
    expect((await s.post('/base/ia/modelos', { provedor: 'openai' })).json().error).toMatch(/Cole a chave da API da OpenAI/);
    respostas = [{ corpo: { data: [
      { id: 'gpt-5.4-mini', created: 100 }, { id: 'text-embedding-3-small', created: 300 }, { id: 'whisper-1', created: 50 }, { id: 'gpt-5.6-sol', created: 200 },
    ] } }];
    expect((await s.post('/base/ia/modelos', { provedor: 'openai', chave: 'outra-chave-falsa-openai' })).json().modelos.map((m: any) => m.id)).toEqual(['gpt-5.6-sol', 'gpt-5.4-mini']);

    respostas = [{ corpo: { models: [
      { name: 'models/gemini-3.5-flash', displayName: 'Gemini 3.5 Flash', supportedGenerationMethods: ['generateContent', 'countTokens'] },
      { name: 'models/gemini-embedding-001', displayName: 'Gemini Embedding', supportedGenerationMethods: ['embedContent'] },
    ] } }];
    expect((await s.post('/base/ia/modelos', { provedor: 'google', chave: 'outra-chave-falsa-google' })).json().modelos).toEqual([{ id: 'gemini-3.5-flash', nome: 'Gemini 3.5 Flash' }]);

    // o compatível usa a chave guardada (é dele) e o endereço da tela
    respostas = [{ corpo: { data: [{ id: 'deepseek-chat' }, { id: 'deepseek-reasoner' }] } }];
    expect((await s.post('/base/ia/modelos', { provedor: 'compativel', endereco: 'https://api.deepseek.com/' })).json().modelos).toHaveLength(2);
    expect(chamadas.at(-1)!.url).toBe('https://api.deepseek.com/models');
    expect(chamadas.at(-1)!.cabecalhos.get('authorization')).toBe('Bearer chave-falsa-deepseek');
    // serviço que não lista (com a chave dele: a guardada é de outro serviço): dá para escrever o nome
    respostas = [{ status: 404, corpo: {} }];
    expect((await s.post('/base/ia/modelos', { provedor: 'compativel', endereco: 'https://chat.maritaca.ai/api', chave: 'chave-falsa-maritaca' })).json().error).toMatch(/não mostrou a lista de modelos/);
    expect(chamadas.at(-1)!.cabecalhos.get('authorization')).toBe('Bearer chave-falsa-maritaca');
    // a busca da lista vai para a auditoria (com qual chave), sem a chave
    const auditoria = (await s.get('/admin/audit?entityId=base-ia')).json().items.filter((x: any) => x.action === 'settings_base_ia_modelos');
    expect(auditoria.map((x: any) => x.summary)).toContain('Administrador buscou os modelos da IA (Outro compatível (OpenRouter, DeepSeek, Groq…) · api.deepseek.com) com a chave guardada: 2 modelos');
    expect(JSON.stringify(auditoria)).not.toContain('chave-falsa');
    // a chave errada do Google
    respostas = [{ status: 400, corpo: { error: { code: 400, message: 'API key not valid. Please pass a valid API key.', status: 'INVALID_ARGUMENT', details: [{ reason: 'API_KEY_INVALID' }] } } }];
    expect((await s.post('/base/ia/modelos', { provedor: 'google', chave: 'chave-errada-google' })).json().error).toMatch(/A chave da IA foi recusada \(Google/);
  });

  it('rascunho a partir do card: a IA devolve o JSON e o Gestor confere', async () => {
    respostas = [openai('```json\n{"titulo": "Ligação cai aos 32 s", "oQueAcontece": "Cai no meio.", "comoResolver": "1. Desligar o SIP ALG.", "porQueAcontece": "", "palavrasDoCliente": ["cai sozinha"]}\n```', 500, 80)];
    expect((await leitor.post('/base/ia/rascunho', { chamado: 'IS-3642' })).statusCode).toBe(403);
    const r = await operador.post('/base/ia/rascunho', { chamado: 'IS-3642' });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toMatchObject({ titulo: 'Ligação cai aos 32 s', comoResolver: '1. Desligar o SIP ALG.', palavrasDoCliente: ['cai sozinha'], modelo: 'deepseek-chat' });
    const corpo = chamadas[0]!.corpo;
    expect(corpo.messages[0]).toEqual({ role: 'system', content: INSTRUCOES_RASCUNHO });
    expect(corpo.messages[1].content).toContain('Ligação cai depois de meio minuto');
    expect(corpo.messages[1].content).toContain('Assunto: Ramal - Queda de ligação');
    expect((await s.get('/base/ia/ajustes')).json().uso).toMatchObject({ rascunhos: 1 });
    // resposta fora do combinado: avisa em vez de preencher com nada
    respostas = [openai('Desculpe, não consigo ajudar com isso.')];
    expect((await operador.post('/base/ia/rascunho', { chamado: 'IS-3642' })).json().error).toMatch(/formato combinado/);
    expect((await operador.post('/base/ia/rascunho', { chamado: 'IS-9999' })).json().error).toMatch(/não está na cópia do LineChat/);
  });

  it('não deixa disparar perguntas sem parar (custa dinheiro)', async () => {
    for (let i = 0; i < 30; i++) respostas.push(openai('{"termos": []}', 10, 5));
    // no máximo 10 por minuto (e 30 por hora por pessoa)
    const codigos: number[] = [];
    for (let i = 0; i < 11; i++) codigos.push((await tecnico.post('/base/ia/perguntar', { pergunta: 'qualquer coisa' })).statusCode);
    expect(codigos).toContain(429);
  });
});
