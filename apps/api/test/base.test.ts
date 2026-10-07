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
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { linechatFields, linechatSteps, linechatCards, settings } from '@gestor/db';
import { makeApp, Session, type App } from './helpers.js';

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
