import { describe, expect, it } from 'vitest';
import { AJUSTES_PAINEL_PADRAO, procurarAssunto, type Assunto, type CampoPersonalizado, type Painel } from './atendimento.js';
import {
  aplicarMapaDoRobo, apararPedido, corpoDoPedido, EXEMPLO_DO_LINECHAT, lerPrioridade, MAPA_DO_ROBO_PADRAO, mapaDeFabrica, MapaDoRoboSchema,
  preencherDoPedido, problemaDoModelo, procurarCliente, resolverPedidoDoRobo, valorNoCaminho, valorParaOCampo, variaveisDoPedido,
  type DadosParaORobo, type MapaDoRobo,
} from './robo.js';

/** O pedido que o LineChat mandou no teste do Luan (16/10/2026), com o contato trocado por um de mentira. */
const DO_LINECHAT = [{
  responseKeys: [], companyId: 'c5824651-0000-4000-8000-000000000000', sessionId: '33adffe5-b5e0-4138-895c-64e940cd740c', callbackUrl: null, callbackId: null,
  session: { id: '33adffe5-b5e0-4138-895c-64e940cd740c', createdAt: '2026-10-16T14:21:18.901089Z', departmentId: 'd-1', userId: '00000000-0000-0000-0000-000000000000', number: '2026101600015', utm: null },
  channel: { id: 'ch-1', key: '557130348350', platform: 'WhatsApp', displayName: '(71) 3034-8350' },
  contact: {
    id: 'ct-1', name: 'João Teste', 'first-name': 'João', phonenumber: '+55|71999990123', 'display-phonenumber': '(71) 99999-0123', email: null, instagram: null,
    tags: null, annotation: null, metadata: {}, origin: 'CREATED_FROM_HUB', empresa: '', 'imported-at': null, 'name-whatsapp': 'João Teste',
    'motivo-de-contato': 'TESTE INTEGRAÇÃO - ignorar - ramal 999 sem áudio',
  },
  questions: {
    'cb-a35e88f1-qst-b9e89e4b': { text: 'Por favor, nos informe a empresa que você faz parte, para que possamos salvar em seu cadastro:', answer: 'Empresa Teste Ingline', answerFile: null },
    'cb-8b2a1bcb-qst-81fe01bd': { text: 'Por favor nos informe brevemente o motivo do seu contato', answer: 'TESTE INTEGRAÇÃO - ignorar - ramal 999 sem áudio', answerFile: null },
  },
  menus: {
    'cb-a35e88f1-mn-bfb06331': { text: 'Para facilitar seu atendimento, listei algumas opções...', answer: 'Suporte Técnico', answerFile: null },
    'cb-a35e88f1-mn-8d2de45b': { text: 'Certo!\nPor favor, escolha para qual solução você deseja atendimento:', answer: '☎️ LinePBX: Plataforma de Voz', answerFile: null },
  },
  templates: {}, metadata: {},
  lastContactMessage: 'TESTE INTEGRAÇÃO - ignorar - ramal 999 sem áudio',
  lastMessage: { type: 'TEXT', text: 'TESTE INTEGRAÇÃO - ignorar - ramal 999 sem áudio' },
  lastMessagesAggregated: { text: 'TESTE INTEGRAÇÃO - ignorar - ramal 999 sem áudio', files: [] },
  senderId: null,
}];

const painel = (id: string, sigla: string, nome: string, extra: Partial<Painel> = {}): Painel => ({
  id, nome, sigla, descricao: null, cor: 'accent', ordem: 0, acesso: 'todos', pessoas: [], ajustes: { ...AJUSTES_PAINEL_PADRAO }, etapas: [], ativo: true, abertos: 0, ...extra,
});
const assunto = (id: string, nome: string, extra: Partial<Assunto> = {}): Assunto => ({
  id, painelId: 'p-sup', paiId: null, nome, descricao: null, ativo: true, ordem: 0, checklist: [], dePara: [], ...extra,
});
const campo = (id: string, nome: string, extra: Partial<CampoPersonalizado> = {}): CampoPersonalizado => ({
  id, painelId: 'p-sup', nome, tipo: 'texto', dica: null, opcoes: [], ativo: true, ordem: 0, ...extra,
});

const DADOS: DadosParaORobo = {
  paineis: [painel('p-sup', 'SUP', 'Suporte'), painel('p-com', 'COM', 'Comercial', { ativo: false }), painel('p-imp', 'IMP', 'Implantação', { ajustes: { ...AJUSTES_PAINEL_PADRAO, camposDesligados: ['assunto'] } })],
  assuntos: [
    assunto('a-ramal', 'Ramal'),
    assunto('a-ramal-conf', 'Configuração', { paiId: 'a-ramal' }),
    assunto('a-geral', 'Atendimento geral', { dePara: ['Suporte Técnico', 'Suporte - Dúvidas'] }),
    assunto('a-velho', 'Fax', { ativo: false }),
  ],
  campos: [
    campo('c-sistema', 'Sistema', { tipo: 'lista', opcoes: [{ id: 'o-pbx', nome: 'LinePBX', ativa: true }, { id: 'o-chat', nome: 'LineChat', ativa: true }, { id: 'o-line', nome: 'Line', ativa: true }] }),
    campo('c-ramal', 'Ramal', { tipo: 'numero' }),
    campo('c-velho', 'Antigo', { ativo: false }),
    campo('c-imp', 'Etapa da implantação', { painelId: 'p-imp' }),
  ],
  clientes: [
    { id: 'cl-aurora', nome: 'Clínica Aurora', razao: 'Clínica Aurora Serviços Médicos Ltda', cnpj: '11222333000181' },
    { id: 'cl-teste', nome: 'Empresa Teste Ingline', razao: 'Empresa Teste Ltda', cnpj: '44555666000199' },
    { id: 'cl-gemeo-1', nome: 'Padaria Sol', razao: 'Padaria Sol do Norte', cnpj: '1' },
    { id: 'cl-gemeo-2', nome: 'Padaria Sol', razao: 'Padaria Sol do Sul', cnpj: '2' },
  ],
};

const mapa = (m: Partial<MapaDoRobo>): MapaDoRobo => ({ ...mapaDeFabrica(), ...m });

describe('as variáveis do pedido do robô', () => {
  it('a lista do LineChat vale pelo primeiro item; o texto com JSON é lido', () => {
    expect(corpoDoPedido(DO_LINECHAT).sessionId).toBe('33adffe5-b5e0-4138-895c-64e940cd740c');
    expect(corpoDoPedido(JSON.stringify({ a: 1 }))).toEqual({ a: 1 });
    expect(corpoDoPedido('não é json')).toEqual({});
    expect(corpoDoPedido(null)).toEqual({});
    expect(corpoDoPedido([1, 2])).toEqual({});
  });

  it('o caminho com ponto acha o valor (os hífens e a posição na lista também)', () => {
    const c = corpoDoPedido(DO_LINECHAT);
    expect(valorNoCaminho(c, 'contact.name')).toBe('João Teste');
    expect(valorNoCaminho(c, 'contact.first-name')).toBe('João');
    expect(valorNoCaminho(c, 'questions.cb-8b2a1bcb-qst-81fe01bd.answer')).toBe('TESTE INTEGRAÇÃO - ignorar - ramal 999 sem áudio');
    expect(valorNoCaminho({ files: [{ url: 'x' }] }, 'files.0.url')).toBe('x');
    expect(valorNoCaminho(c, 'contact.email')).toBeNull();
    expect(valorNoCaminho(c, 'contact.nome')).toBeUndefined();
    expect(valorNoCaminho(c, 'contact..name')).toBeUndefined();
    // nada fora do pedido
    expect(valorNoCaminho(c, '__proto__')).toBeUndefined();
    expect(valorNoCaminho(c, 'contact.constructor')).toBeUndefined();
  });

  it('troca as variáveis; {{a || b}} usa a primeira com valor; o texto fixo entre aspas também vale', () => {
    const c = corpoDoPedido(DO_LINECHAT);
    expect(preencherDoPedido('Atendimento de {{contact.name}}', c)).toEqual({ texto: 'Atendimento de João Teste', faltaram: [] });
    expect(preencherDoPedido('{{ contact.name }}', c).texto).toBe('João Teste');
    expect(preencherDoPedido('{{contact.empresa || questions.cb-a35e88f1-qst-b9e89e4b.answer}}', c).texto).toBe('Empresa Teste Ingline');
    expect(preencherDoPedido('{{contact.email || "sem e-mail"}}', c).texto).toBe('sem e-mail');
    expect(preencherDoPedido('Fixo, sem variável', c).texto).toBe('Fixo, sem variável');
  });

  it('as variáveis todas vazias deixam o campo vazio, e a que não existe no pedido é avisada', () => {
    const c = corpoDoPedido(DO_LINECHAT);
    expect(preencherDoPedido('Atendimento de {{contact.email}}', c)).toEqual({ texto: '', faltaram: [] });
    expect(preencherDoPedido('Atendimento de {{contact.nome}}', c)).toEqual({ texto: '', faltaram: ['contact.nome'] });
    // com uma das duas preenchida, o texto fica (a que faltou não incomoda)
    expect(preencherDoPedido('{{contact.nome || contact.name}}', c)).toEqual({ texto: 'João Teste', faltaram: [] });
    expect(preencherDoPedido('{{contact.name}} {{contact.email}}', c).texto).toBe('João Teste ');
  });

  it('o texto do mapa precisa fechar cada variável', () => {
    expect(problemaDoModelo('Atendimento de {{contact.name}}')).toBeNull();
    expect(problemaDoModelo('Atendimento de {{contact.name')).toMatch(/Feche cada variável/);
    expect(problemaDoModelo('Atendimento de contact.name}}')).toMatch(/Feche cada variável/);
    expect(problemaDoModelo('{{ }}')).toMatch(/variável vazia/);
    expect(problemaDoModelo('{{a || }}')).toMatch(/variável vazia/);
    expect(MapaDoRoboSchema.safeParse({ titulo: '{{contact.name' }).success).toBe(false);
    const ok = MapaDoRoboSchema.parse({});
    expect(ok.titulo).toBe('');
    expect(ok.campos).toEqual({});
  });

  it('a lista de variáveis: as perguntas e os menus primeiro, com a pergunta como dica', () => {
    const vs = variaveisDoPedido(DO_LINECHAT);
    expect(vs[0]).toMatchObject({ caminho: 'questions.cb-a35e88f1-qst-b9e89e4b.answer', valor: 'Empresa Teste Ingline', grupo: 'perguntas' });
    expect(vs[0]!.dica).toMatch(/^Por favor, nos informe a empresa/);
    const motivo = vs.find((v) => v.caminho === 'questions.cb-8b2a1bcb-qst-81fe01bd.answer');
    expect(motivo?.dica).toBe('Por favor nos informe brevemente o motivo do seu contato');
    // o "text" da pergunta não aparece sozinho (é a dica), nem o arquivo da resposta que veio vazio
    expect(vs.some((v) => v.caminho.endsWith('.text') && v.caminho.startsWith('questions'))).toBe(false);
    expect(vs.some((v) => v.caminho.endsWith('.answerFile'))).toBe(false);
    const comArquivo = variaveisDoPedido({ questions: { q1: { text: 'Mande a foto', answer: '', answerFile: 'https://arquivos.exemplo/foto.jpg' } } });
    expect(comArquivo.map((v) => [v.caminho, v.dica, v.vazio])).toEqual([['questions.q1.answer', 'Mande a foto', true], ['questions.q1.answerFile', 'Mande a foto', false]]);
    expect(vs.find((v) => v.caminho === 'menus.cb-a35e88f1-mn-8d2de45b.answer')).toMatchObject({ grupo: 'menus', valor: '☎️ LinePBX: Plataforma de Voz' });
    expect(vs.find((v) => v.caminho === 'contact.name')).toMatchObject({ grupo: 'contato', vazio: false });
    expect(vs.find((v) => v.caminho === 'contact.email')).toMatchObject({ vazio: true });
    expect(vs.find((v) => v.caminho === 'sessionId')?.grupo).toBe('conversa');
    expect(vs.find((v) => v.caminho === 'lastContactMessage')?.grupo).toBe('mensagens');
    // a lista vazia e o objeto vazio não viram variável
    expect(vs.some((v) => v.caminho === 'responseKeys' || v.caminho === 'templates' || v.caminho === 'lastMessagesAggregated.files')).toBe(false);
  });

  it('a lista de textos vira "a, b"; a chave com ponto fica de fora', () => {
    const vs = variaveisDoPedido({ contact: { tags: ['vip', 'novo'], 'a.b': 'x' }, files: [{ url: 'u1' }, { url: 'u2' }] });
    expect(vs.find((v) => v.caminho === 'contact.tags')?.valor).toBe('vip, novo');
    expect(vs.some((v) => v.caminho.includes('a.b'))).toBe(false);
    expect(vs.map((v) => v.caminho)).toContain('files.1.url');
  });

  it('o pedido guardado corta o que é grande demais', () => {
    const grande = { texto: 'x'.repeat(5_000), lista: Array.from({ length: 80 }, (_, i) => i), fundo: { a: { b: { c: { d: { e: { f: { g: { h: { i: { j: { k: 1 } } } } } } } } } } } };
    const a = apararPedido(grande) as { texto: string; lista: number[] };
    expect(a.texto.length).toBe(2_001);
    expect(a.lista).toHaveLength(50);
    expect(JSON.stringify(a)).toContain('"…"');
  });
});

describe('o mapa lê o pedido', () => {
  it('o de fábrica já funciona com o pedido do LineChat', () => {
    const p = aplicarMapaDoRobo(mapaDeFabrica(), DO_LINECHAT);
    expect(p).toMatchObject({
      painel: '', titulo: 'Atendimento de João Teste', relato: 'TESTE INTEGRAÇÃO - ignorar - ramal 999 sem áudio', telefone: '+55|71999990123',
      nome: 'João Teste', sessaoId: '33adffe5-b5e0-4138-895c-64e940cd740c', etiquetas: 'robô', descricao: '', cliente: '', campos: {}, faltaram: {},
    });
    expect(MAPA_DO_ROBO_PADRAO.titulo).toBe('Atendimento de {{contact.name}}');
    expect(Object.isFrozen(MAPA_DO_ROBO_PADRAO)).toBe(true);
  });

  it('os campos de uma linha perdem as quebras; o relato guarda', () => {
    const p = aplicarMapaDoRobo(mapa({ titulo: '{{menus.cb-a35e88f1-mn-8d2de45b.text}}', relato: 'Linha 1\n{{lastContactMessage}}' }), DO_LINECHAT);
    expect(p.titulo).toBe('Certo! Por favor, escolha para qual solução você deseja atendimento:');
    expect(p.relato).toBe('Linha 1\nTESTE INTEGRAÇÃO - ignorar - ramal 999 sem áudio');
  });

  it('o título longo é cortado no tamanho do chamado; o que faltou é contado por campo', () => {
    const p = aplicarMapaDoRobo(mapa({ titulo: `{{lastContactMessage}} ${'x'.repeat(300)}`, nome: '{{contact.nome}}', campos: { 'c-sistema': '{{menus.x.answer}}' } }), DO_LINECHAT);
    expect(p.titulo.length).toBe(200);
    expect(p.titulo.endsWith('…')).toBe(true);
    expect(p.faltaram).toEqual({ nome: ['contact.nome'], 'campo:c-sistema': ['menus.x.answer'] });
    expect(p.campos).toEqual({});
  });
});

describe('o chamado que o pedido abre', () => {
  const resolver = (m: Partial<MapaDoRobo>, corpo: unknown = DO_LINECHAT) => resolverPedidoDoRobo(aplicarMapaDoRobo(mapa(m), corpo), DADOS);

  it('com o mapa de fábrica: o painel do Suporte, o WhatsApp com o 55, a etiqueta do robô', () => {
    const r = resolver({});
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.chamado).toMatchObject({
      painel: { id: 'p-sup', sigla: 'SUP', nome: 'Suporte' }, titulo: 'Atendimento de João Teste', telefone: '5571999990123', nome: 'João Teste',
      sessaoId: '33adffe5-b5e0-4138-895c-64e940cd740c', etiquetas: ['robô'], cliente: null, assunto: null, prioridade: null, campos: [], ignorados: [],
    });
  });

  it('o cliente pela resposta da pergunta, o assunto pelo de-para, a opção do campo pelo menu enfeitado', () => {
    const r = resolver({
      cliente: '{{questions.cb-a35e88f1-qst-b9e89e4b.answer}}',
      assunto: '{{menus.cb-a35e88f1-mn-bfb06331.answer}}',
      prioridade: 'Alta',
      campos: { 'c-sistema': '{{menus.cb-a35e88f1-mn-8d2de45b.answer}}' },
    });
    if (!r.ok) throw new Error(r.erro);
    expect(r.chamado.cliente).toEqual({ id: 'cl-teste', nome: 'Empresa Teste Ingline' });
    expect(r.chamado.assunto).toEqual({ id: 'a-geral', caminho: 'Atendimento geral' });
    expect(r.chamado.prioridade).toBe('alta');
    expect(r.chamado.campos).toEqual([{ id: 'c-sistema', nome: 'Sistema', valor: 'o-pbx', texto: 'LinePBX' }]);
    expect(r.chamado.ignorados).toEqual([]);
  });

  it('o que não bate fica de fora, escrito: o chamado abre do mesmo jeito', () => {
    const r = resolver({
      telefone: 'sem número', cliente: 'Padaria Sol', assunto: 'Financeiro', prioridade: 'urgentíssima', etiquetas: 'robô, whatsapp; robô\nnovo',
      campos: { 'c-sistema': 'Planilha', 'c-ramal': 'duzentos', 'c-velho': 'x', 'c-imp': 'y', 'c-sumiu': 'z' },
    });
    if (!r.ok) throw new Error(r.erro);
    expect(r.chamado.telefone).toBeNull();
    expect(r.chamado.cliente).toBeNull();
    expect(r.chamado.assunto).toBeNull();
    expect(r.chamado.prioridade).toBeNull();
    expect(r.chamado.etiquetas).toEqual(['robô', 'whatsapp', 'novo']);
    expect(r.chamado.campos).toEqual([]);
    expect(r.chamado.ignorados).toEqual([
      'O WhatsApp "sem número" não é um número de telefone (DDD + número): ficou de fora.',
      'Há 2 clientes chamados "Padaria Sol": o Gestor procura o cliente pelo WhatsApp do contato.',
      'Não achei o assunto "Financeiro" no painel Suporte: ficou de fora.',
      'A prioridade "urgentíssima" não é Crítica, Alta, Média nem Baixa: ficou de fora.',
      'Sistema: "Planilha" não é uma das opções (LinePBX, LineChat, Line) — ficou de fora.',
      'Ramal: escreva um número — ficou de fora.',
      'O campo Antigo foi desativado no painel Suporte: ficou de fora.',
      'O campo Etapa da implantação não é do painel Suporte: ficou de fora.',
      'Um campo do mapa não existe mais: ficou de fora.',
    ]);
  });

  it('o painel desativado (ou que saiu) dá lugar ao primeiro ativo; o painel sem assunto ignora o assunto', () => {
    const desativado = resolver({ painel: 'p-com' });
    if (!desativado.ok) throw new Error(desativado.erro);
    expect(desativado.chamado.painel.sigla).toBe('SUP');
    expect(desativado.chamado.ignorados).toEqual(['O painel Comercial está desativado: o chamado vai para o Suporte.']);
    const sumiu = resolver({ painel: 'p-x' });
    expect(sumiu.ok && sumiu.chamado.ignorados).toEqual(['O painel do mapa não existe mais: o chamado vai para o Suporte.']);
    const pelaSigla = resolver({ painel: 'imp', assunto: 'Ramal', campos: { 'c-imp': 'Treinamento' } });
    if (!pelaSigla.ok) throw new Error(pelaSigla.erro);
    expect(pelaSigla.chamado.painel.nome).toBe('Implantação');
    expect(pelaSigla.chamado.assunto).toBeNull();
    expect(pelaSigla.chamado.campos.map((c) => c.texto)).toEqual(['Treinamento']);
    expect(pelaSigla.chamado.ignorados).toEqual(['O painel Implantação não usa assunto: "Ramal" ficou de fora.']);
  });

  it('o título vazio vira "Atendimento de <nome>" (ou "Chamado pelo WhatsApp"); sem nada no pedido, não abre', () => {
    const semTitulo = resolver({ titulo: '{{contact.email}}' });
    expect(semTitulo.ok && semTitulo.chamado.titulo).toBe('Atendimento de João Teste');
    const semNome = resolver({ titulo: '', nome: '' });
    expect(semNome.ok && semNome.chamado.titulo).toBe('Chamado pelo WhatsApp');
    const nada = resolverPedidoDoRobo(aplicarMapaDoRobo(mapaDeFabrica(), { outro: 'formato' }), DADOS);
    expect(nada).toEqual({ ok: false, erro: expect.stringMatching(/não tirou nada deste pedido/) });
    const semPainel = resolverPedidoDoRobo(aplicarMapaDoRobo(mapaDeFabrica(), DO_LINECHAT), { ...DADOS, paineis: [] });
    expect(semPainel).toEqual({ ok: false, erro: 'Não há nenhum painel ativo para abrir o chamado.' });
  });

  it('o exemplo embutido abre com o mapa de fábrica', () => {
    const r = resolverPedidoDoRobo(aplicarMapaDoRobo(mapaDeFabrica(), EXEMPLO_DO_LINECHAT), DADOS);
    expect(r.ok && r.chamado.titulo).toBe('Atendimento de Maria Souza');
    expect(r.ok && r.chamado.telefone).toBe('5571999992010');
  });
});

describe('as procuras do robô', () => {
  it('o cliente pelo id, pelo CNPJ, pelo nome fantasia ou pela razão social', () => {
    expect(procurarCliente(DADOS.clientes, 'cl-aurora')).toMatchObject({ ok: true, cliente: { id: 'cl-aurora' } });
    expect(procurarCliente(DADOS.clientes, '11.222.333/0001-81')).toMatchObject({ ok: true, cliente: { id: 'cl-aurora' } });
    expect(procurarCliente(DADOS.clientes, 'clinica aurora')).toMatchObject({ ok: true, cliente: { id: 'cl-aurora' } });
    expect(procurarCliente(DADOS.clientes, 'CLÍNICA AURORA SERVIÇOS MÉDICOS LTDA.')).toMatchObject({ ok: true, cliente: { id: 'cl-aurora' } });
    expect(procurarCliente(DADOS.clientes, 'Aurora')).toMatchObject({ ok: false });
    expect(procurarCliente(DADOS.clientes, '☎️')).toMatchObject({ ok: false });
  });

  it('a prioridade escrita de vários jeitos', () => {
    expect(lerPrioridade('Média')).toBe('media');
    expect(lerPrioridade('CRITICA')).toBe('critica');
    expect(lerPrioridade('🔴 Crítica (parou tudo)')).toBe('critica');
    expect(lerPrioridade('alta ou baixa')).toBeNull();
    expect(lerPrioridade('')).toBeNull();
  });

  it('a opção da lista: a exata, ou a única que aparece no texto (a palavra inteira)', () => {
    const sistema = DADOS.campos[0]!;
    expect(valorParaOCampo(sistema, 'linechat')).toEqual({ ok: true, valor: 'o-chat' });
    expect(valorParaOCampo(sistema, '☎️ LinePBX: Plataforma de Voz')).toEqual({ ok: true, valor: 'o-pbx' });
    // "Line" e "LinePBX" aparecem: na lista de uma opção, não adivinha
    expect(valorParaOCampo(sistema, 'Line e LinePBX').ok).toBe(false);
    const varios = { ...sistema, tipo: 'lista_varios' as const };
    expect(valorParaOCampo(varios, 'LinePBX, LineChat')).toEqual({ ok: true, valor: ['o-pbx', 'o-chat'] });
    const longo = campo('c-longo', 'Obs', { tipo: 'texto' });
    const r = valorParaOCampo(longo, 'y'.repeat(400));
    expect(r.ok && typeof r.valor === 'string' && r.valor.length).toBe(300);
  });

  it('o assunto: o caminho, o nome, o de-para; o repetido e o desativado são ditos', () => {
    const suporte = DADOS.paineis[0]!;
    const achar = (t: string) => procurarAssunto(DADOS.assuntos, suporte, t);
    expect(achar('Ramal > configuracao')).toMatchObject({ ok: true, assunto: { id: 'a-ramal-conf' } });
    expect(achar('Configuração')).toMatchObject({ ok: true, assunto: { id: 'a-ramal-conf' } });
    expect(achar('suporte tecnico')).toMatchObject({ ok: true, assunto: { id: 'a-geral' } });
    expect(achar('Suporte - Dúvidas')).toMatchObject({ ok: true, assunto: { id: 'a-geral' } });
    expect(achar('Fax')).toEqual({ ok: false, erro: 'O assunto "Fax" foi desativado no painel Suporte.' });
    expect(achar('Nada disso')).toEqual({ ok: false, erro: 'Não achei o assunto "Nada disso" no painel Suporte.' });
    const repetidos = [...DADOS.assuntos, assunto('a-x', 'Outro', { dePara: ['Suporte Técnico'] })];
    expect(procurarAssunto(repetidos, suporte, 'Suporte Técnico')).toEqual({ ok: false, erro: expect.stringMatching(/de-para de mais de um assunto/) });
  });
});
