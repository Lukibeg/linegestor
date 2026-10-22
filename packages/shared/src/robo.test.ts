import { describe, expect, it } from 'vitest';
import { AJUSTES_PAINEL_PADRAO, procurarAssunto, type Assunto, type CampoPersonalizado, type Painel } from './atendimento.js';
import {
  aplicarMapaDoRobo, apararPedido, corpoDoPedido, EXEMPLO_DO_LINECHAT, lerPrioridade, MAPA_DO_ROBO_PADRAO, mapaDeFabrica, MapaDoRoboSchema,
  ParametroDoRoboSchema, parametroNoPedido, parametrosDaUrl, parametrosDoEndereco, pedidoEsperado, renomearParametro, sugerirNomeDoParametro,
  usosDoParametro, linhasDoPedido,
  mensagemAoRobo, MENSAGEM_DO_ROBO_PADRAO, oQueNaoVeio, preencherDoPedido, problemaDoModelo, procurarCliente, resolverPedidoDoRobo, respostaAoRobo,
  respostaDoRoboQueFalhou, valorDaReferencia, valorNoCaminho, valorParaOCampo, variaveisDoPedido,
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
  id, nome, sigla, descricao: null, cor: 'accent', tipo: 'gestao', ordem: 0, acesso: 'todos', pessoas: [], ajustes: { ...AJUSTES_PAINEL_PADRAO }, etapas: [], ativo: true, abertos: 0, ...extra,
});
const assunto = (id: string, nome: string, extra: Partial<Assunto> = {}): Assunto => ({
  id, painelId: 'p-sup', paiId: null, nome, descricao: null, ativo: true, ordem: 0, checklist: [], dePara: [], ...extra,
});
const campo = (id: string, nome: string, extra: Partial<CampoPersonalizado> = {}): CampoPersonalizado => ({
  id, painelId: 'p-sup', nome, tipo: 'texto', dica: null, opcoes: [], ativo: true, ordem: 0, incluirNaHora: false, ...extra,
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
    expect(MAPA_DO_ROBO_PADRAO.titulo).toBe('Atendimento de {{nome}}');
    expect(MAPA_DO_ROBO_PADRAO.parametros.map((x) => [x.nome, x.origem])).toEqual([
      ['nome', 'contact.name'], ['whatsapp', 'contact.phonenumber'], ['conversa', 'sessionId'], ['mensagem', 'lastContactMessage'],
    ]);
    expect(Object.isFrozen(MAPA_DO_ROBO_PADRAO)).toBe(true);
    expect(Object.isFrozen(MAPA_DO_ROBO_PADRAO.parametros[0])).toBe(true);
    // a cópia de fábrica é de mexer
    const copia = mapaDeFabrica();
    copia.parametros[0]!.nome = 'outro';
    expect(MAPA_DO_ROBO_PADRAO.parametros[0]!.nome).toBe('nome');
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

  it('nas etiquetas, cada uma vale por si: a do parâmetro que não veio sai, a fixa fica (a vírgula da pergunta não separa)', () => {
    const m = mapa({
      parametros: [...mapaDeFabrica().parametros, { nome: 'setor', origem: 'endereço: setor', exemplo: '', descricao: '' }],
      etiquetas: 'robô, {{setor}}; Setor {{setor}}\n{{pergunta: Por favor, nos informe a empresa que você faz parte}}, {{pergunta: não existe || "sem cadastro"}}',
    });
    const sem = aplicarMapaDoRobo(m, DO_LINECHAT);
    expect(sem.etiquetas).toBe('robô, Empresa Teste Ingline, sem cadastro');
    // (o texto fixo no fim da alternativa segurou a última: ela não conta como falta)
    expect(sem.faltaram.etiquetas).toEqual(['setor']);
    expect(aplicarMapaDoRobo(m, DO_LINECHAT, { setor: 'suporte' }).etiquetas).toBe('robô, suporte, Setor suporte, Empresa Teste Ingline, sem cadastro');
    // e o chamado sai com as etiquetas separadas
    const r = resolverPedidoDoRobo(aplicarMapaDoRobo(m, DO_LINECHAT, { setor: 'suporte' }), DADOS);
    if (!r.ok) throw new Error(r.erro);
    expect(r.chamado.etiquetas).toEqual(['robô', 'suporte', 'Setor suporte', 'Empresa Teste Ingline', 'sem cadastro']);
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

describe('a pergunta pelo texto (a cópia do robô com outros códigos)', () => {
  /** a cópia de teste do robô: as mesmas perguntas, os blocos com outros códigos */
  const COPIA = [{
    ...DO_LINECHAT[0],
    questions: {
      'cb-0000aaaa-qst-11111111': { text: 'Por favor, nos informe a empresa que você faz parte, para que possamos salvar em seu cadastro:', answer: 'Clínica Aurora', answerFile: null },
      'cb-0000aaaa-qst-22222222': { text: 'Por favor nos informe brevemente o motivo do seu contato', answer: 'Sem áudio no 204', answerFile: null },
    },
    menus: {
      'cb-0000aaaa-mn-33333333': { text: 'Certo!\nPor favor, escolha para qual solução você deseja atendimento:', answer: '☎️ LinePBX: Plataforma de Voz', answerFile: null },
    },
  }];

  it('acha a resposta pelo texto inteiro (sem ligar para acento, maiúscula, pontuação e quebra de linha), nas duas cópias', () => {
    const ref = 'pergunta: Por favor nos informe brevemente o motivo do seu contato';
    expect(valorDaReferencia(corpoDoPedido(DO_LINECHAT), ref)).toBe('TESTE INTEGRAÇÃO - ignorar - ramal 999 sem áudio');
    expect(valorDaReferencia(corpoDoPedido(COPIA), ref)).toBe('Sem áudio no 204');
    expect(valorDaReferencia(corpoDoPedido(COPIA), 'PERGUNTA:   por favor NOS INFORME brevemente o motivo do seu contato!')).toBe('Sem áudio no 204');
    expect(valorDaReferencia(corpoDoPedido(COPIA), 'menu: Certo! Por favor, escolha para qual solução você deseja atendimento:')).toBe('☎️ LinePBX: Plataforma de Voz');
    // o código do bloco da outra cópia não existe aqui: é isso que o texto resolve
    expect(valorNoCaminho(corpoDoPedido(COPIA), 'questions.cb-8b2a1bcb-qst-81fe01bd.answer')).toBeUndefined();
  });

  it('um pedaço do texto vale quando só uma pergunta o tem; o pedaço de duas, e o texto que não existe, não vieram', () => {
    const c = corpoDoPedido(COPIA);
    expect(valorDaReferencia(c, 'pergunta: motivo do seu contato')).toBe('Sem áudio no 204');
    expect(valorDaReferencia(c, 'pergunta: por favor')).toBeUndefined();
    expect(valorDaReferencia(c, 'pergunta: qual o seu e-mail')).toBeUndefined();
    expect(valorDaReferencia(c, 'menu: motivo do seu contato')).toBeUndefined();
    expect(valorDaReferencia({ contact: {} }, 'pergunta: motivo')).toBeUndefined();
    // a pergunta que veio sem resposta existe (vazia): não é "não veio"
    expect(valorDaReferencia({ questions: { q: { text: 'Seu nome?', answer: null } } }, 'pergunta: Seu nome?')).toBeNull();
  });

  it('o mapa pelo texto vale para as duas cópias; a que não achou é contada no campo', () => {
    const mapa: MapaDoRobo = { ...mapaDeFabrica(), relato: '{{pergunta: o motivo do seu contato}}', cliente: '{{pergunta: a empresa que você faz parte}}', descricao: '{{pergunta: qual o seu e-mail}}' };
    const producao = aplicarMapaDoRobo(mapa, DO_LINECHAT);
    const teste = aplicarMapaDoRobo(mapa, COPIA);
    expect([producao.relato, producao.cliente]).toEqual(['TESTE INTEGRAÇÃO - ignorar - ramal 999 sem áudio', 'Empresa Teste Ingline']);
    expect([teste.relato, teste.cliente]).toEqual(['Sem áudio no 204', 'Clínica Aurora']);
    expect(teste.faltaram).toEqual({ descricao: ['pergunta: qual o seu e-mail'] });
    expect(oQueNaoVeio(teste.faltaram, [])).toEqual(['Descrição: {{pergunta: qual o seu e-mail}}']);
    expect(oQueNaoVeio({ 'campo:c-sistema': ['menus.x.answer'] }, DADOS.campos)).toEqual(['Sistema: {{menus.x.answer}}']);
  });

  it('a lista de variáveis traz a resposta pela pergunta, quando o texto é único no pedido', () => {
    const vs = variaveisDoPedido(DO_LINECHAT);
    expect(vs.find((v) => v.caminho === 'questions.cb-8b2a1bcb-qst-81fe01bd.answer')?.porTexto).toBe('pergunta: Por favor nos informe brevemente o motivo do seu contato');
    expect(vs.find((v) => v.caminho === 'menus.cb-a35e88f1-mn-8d2de45b.answer')?.porTexto).toBe('menu: Certo! Por favor, escolha para qual solução você deseja atendimento:');
    expect(vs.find((v) => v.caminho === 'contact.name')?.porTexto).toBeNull();
    // o mesmo texto em dois blocos (o robô pergunta de novo noutro caminho): pelo texto não daria para saber qual
    const repetido = variaveisDoPedido({ questions: { a: { text: 'Seu nome?', answer: 'Ana' }, b: { text: 'Seu nome?', answer: 'Bia' }, c: { text: 'A {chave} | barra', answer: 'x' } } });
    expect(repetido.map((v) => v.porTexto)).toEqual([null, null, 'pergunta: A chave barra']);
    // e o que a lista oferece acha a mesma resposta
    expect(valorDaReferencia({ questions: { c: { text: 'A {chave} | barra', answer: 'x' } } }, 'pergunta: A chave barra')).toBe('x');
  });
});

describe('as alternativas e a resposta ao robô', () => {
  it('{{a || b || c || d}}: quantas alternativas quiser, a primeira com valor; o texto fixo no fim', () => {
    const c = corpoDoPedido(DO_LINECHAT);
    expect(preencherDoPedido('{{contact.email || contact.instagram || contact.empresa || contact.name}}', c).texto).toBe('João Teste');
    expect(preencherDoPedido('{{contact.email || contact.nao-existe || pergunta: qual o seu e-mail || "sem contato"}}', c).texto).toBe('sem contato');
    expect(preencherDoPedido('{{contact.email || contact.instagram || contact.empresa || contact.tags}}', c)).toEqual({ texto: '', faltaram: [] });
    expect(preencherDoPedido('{{a || b || c || d}}', c)).toEqual({ texto: '', faltaram: ['a', 'b', 'c', 'd'] });
  });

  it('a resposta: exatamente a que o bloco "Enviar webhook" do LineChat espera', () => {
    expect(MAPA_DO_ROBO_PADRAO.mensagem).toBe(MENSAGEM_DO_ROBO_PADRAO);
    expect(MapaDoRoboSchema.parse({}).mensagem).toBe(MENSAGEM_DO_ROBO_PADRAO);
    expect(respostaAoRobo(mapaDeFabrica(), { codigo: 'SUP-1' }, DO_LINECHAT)).toEqual({
      response: 'CHAMADO_ABERTO',
      messages: [{ text: 'Seu chamado foi registrado com o número *SUP-1*. Guarde este número caso precise falar sobre ele depois.' }],
    });
    expect(respostaDoRoboQueFalhou()).toEqual({ response: 'CHAMADO_FALHOU' });
    // a mensagem vazia: o robô não manda mensagem (ele segue pela saída do CHAMADO_ABERTO do mesmo jeito)
    expect(respostaAoRobo({ mensagem: '' }, { codigo: 'SUP-1' }, DO_LINECHAT)).toEqual({ response: 'CHAMADO_ABERTO', messages: [] });
  });

  it('a mensagem: {codigo}, {contato} e as variáveis do pedido; a variável vazia não apaga a mensagem', () => {
    expect(mensagemAoRobo('Olá, {{contact.first-name}}! O seu chamado é o {codigo}.', { codigo: 'SUP-7' }, DO_LINECHAT)).toBe('Olá, João! O seu chamado é o SUP-7.');
    expect(mensagemAoRobo('Olá, {{contact.email}}! O seu chamado é o {{codigo}} ({contato}).', { codigo: 'SUP-7', contato: null }, DO_LINECHAT)).toBe('Olá! O seu chamado é o SUP-7.');
    expect(mensagemAoRobo('{contato}, anotamos: {codigo}', { codigo: 'DEV-2', contato: ' Maria ' }, {})).toBe('Maria, anotamos: DEV-2');
  });
});

describe('os parâmetros do webhook (incluir e tirar na tela)', () => {
  const comParametros = (m: Partial<MapaDoRobo>): MapaDoRobo => ({
    ...mapaDeFabrica(),
    parametros: [
      ...mapaDeFabrica().parametros,
      { nome: 'empresa', origem: 'pergunta: a empresa que você faz parte || contact.empresa', exemplo: 'Clínica Aurora', descricao: '' },
      { nome: 'motivo', origem: 'pergunta: o motivo do seu contato', exemplo: 'Sem áudio', descricao: '' },
      { nome: 'setor', origem: 'endereço: setor', exemplo: 'suporte', descricao: 'vai no endereço do webhook' },
      { nome: 'empresa_ou_nome', origem: 'empresa || nome', exemplo: '', descricao: '' },
    ],
    ...m,
  });

  it('o campo usa o parâmetro pelo nome (sem ligar para maiúscula e acento); o de fábrica já vem com os quatro do LineChat', () => {
    const p = aplicarMapaDoRobo(comParametros({ cliente: '{{Empresa}}', relato: '{{motivo}}', descricao: 'Setor: {{setor}}' }), DO_LINECHAT, { setor: 'suporte-n1' });
    expect([p.titulo, p.nome, p.telefone, p.sessaoId]).toEqual(['Atendimento de João Teste', 'João Teste', '+55|71999990123', '33adffe5-b5e0-4138-895c-64e940cd740c']);
    expect([p.cliente, p.relato, p.descricao]).toEqual(['Empresa Teste Ingline', 'TESTE INTEGRAÇÃO - ignorar - ramal 999 sem áudio', 'Setor: suporte-n1']);
    expect(p.faltaram).toEqual({});
  });

  it('a origem tem alternativas e pode apontar para outro parâmetro; o que não veio é contado pelo nome', () => {
    const semEmpresa = [{ ...DO_LINECHAT[0], questions: {}, contact: { ...DO_LINECHAT[0]!.contact, empresa: 'Da ficha do contato' } }];
    const m = comParametros({ cliente: '{{empresa}}', descricao: '{{empresa_ou_nome}}', assunto: '{{setor}}' });
    const p = aplicarMapaDoRobo(m, semEmpresa);
    expect([p.cliente, p.descricao]).toEqual(['Da ficha do contato', 'Da ficha do contato']);
    // sem o endereço: o setor não veio (o campo fica vazio e o aviso fala do parâmetro)
    expect(p.assunto).toBe('');
    expect(p.faltaram).toEqual({ assunto: ['setor'] });
    const nada = aplicarMapaDoRobo(m, [{ ...semEmpresa[0], contact: { name: '' } }]);
    expect(nada.descricao).toBe('');
  });

  it('o parâmetro com o mesmo nome do caminho (sessionId → sessionId) lê o caminho, e o círculo entre parâmetros para', () => {
    const m: MapaDoRobo = { ...mapaDeFabrica(), parametros: [{ nome: 'sessionId', origem: 'sessionId', exemplo: '', descricao: '' }, { nome: 'a', origem: 'b', exemplo: '', descricao: '' }, { nome: 'b', origem: 'a', exemplo: '', descricao: '' }], sessaoId: '{{sessionId}}', titulo: '{{a || "sem título"}}' };
    const p = aplicarMapaDoRobo(m, DO_LINECHAT);
    expect(p.sessaoId).toBe('33adffe5-b5e0-4138-895c-64e940cd740c');
    expect(p.titulo).toBe('sem título');
  });

  it('o parâmetro no pedido de conferência: veio (com o valor) ou não', () => {
    const m = comParametros({});
    const ctx = { parametros: m.parametros, endereco: { setor: 'suporte' } };
    expect(parametroNoPedido(m.parametros[4]!, DO_LINECHAT, ctx)).toEqual({ veio: true, valor: 'Empresa Teste Ingline' });
    expect(parametroNoPedido(m.parametros[6]!, DO_LINECHAT, ctx)).toEqual({ veio: true, valor: 'suporte' });
    expect(parametroNoPedido(m.parametros[6]!, DO_LINECHAT, { parametros: m.parametros })).toEqual({ veio: false, valor: '' });
    expect(parametroNoPedido({ nome: 'email', origem: 'contact.email', exemplo: '', descricao: '' }, DO_LINECHAT)).toEqual({ veio: true, valor: '' });
  });

  it('os parâmetros do endereço: a chave nunca entra; a lista vira "a, b"', () => {
    expect(parametrosDoEndereco({ chave: 'gst_x', CHAVE: 'y', setor: 'suporte', tags: ['a', 'b'], n: 3, 'a.b': 'x' })).toEqual({ setor: 'suporte', tags: 'a, b' });
    expect(parametrosDaUrl('https://gestao.exemplo.com.br/api/atendimento/entrada/robo?chave=gst_x&setor=suporte%20N1&tag=a&tag=b')).toEqual({ setor: 'suporte N1', tag: 'a, b' });
    expect(parametrosDaUrl('não é endereço')).toEqual({});
    const vs = variaveisDoPedido(DO_LINECHAT, 400, { setor: 'suporte' });
    expect(vs.find((v) => v.grupo === 'endereco')).toMatchObject({ caminho: 'endereço: setor', valor: 'suporte' });
  });

  it('o nome do parâmetro: só letras, números, _ e -; sem os reservados; sem repetir', () => {
    expect(ParametroDoRoboSchema.safeParse({ nome: 'motivo_do-contato', origem: 'contact.name' }).success).toBe(true);
    for (const nome of ['com espaço', 'com.ponto', '', 'codigo', 'Contato', 'endereço', 'x'.repeat(41)]) {
      expect(ParametroDoRoboSchema.safeParse({ nome, origem: 'contact.name' }).success, nome).toBe(false);
    }
    expect(ParametroDoRoboSchema.safeParse({ nome: 'a', origem: '{{contact.name}}' }).success).toBe(false);
    expect(ParametroDoRoboSchema.safeParse({ nome: 'a', origem: 'x || ' }).success).toBe(false);
    // a chave do endereço nunca chega ao mapa: a origem com ela é recusada (com qualquer maiúscula e nas alternativas)
    for (const origem of ['endereço: chave', 'contact.name || endereco: CHAVE']) {
      expect(ParametroDoRoboSchema.safeParse({ nome: 'a', origem }).success, origem).toBe(false);
    }
    expect(ParametroDoRoboSchema.safeParse({ nome: 'a', origem: 'endereço: chave_do_setor' }).success).toBe(true);
    expect(ParametroDoRoboSchema.parse({ nome: ' a ', origem: '  contact.name ' })).toEqual({ nome: 'a', origem: 'contact.name', exemplo: '', descricao: '' });
    const r = MapaDoRoboSchema.safeParse({ parametros: [{ nome: 'Empresa', origem: 'a' }, { nome: 'empresa', origem: 'b' }] });
    expect(r.success).toBe(false);
    expect(JSON.stringify(r.error?.issues)).toContain('Há dois parâmetros chamados empresa');
  });

  it('renomear muda os campos, a mensagem e a origem dos outros; usos diz quem usa', () => {
    const m = comParametros({ cliente: '{{empresa}}', descricao: 'Empresa: {{ empresa || "?" }}', mensagem: 'Olá, {{empresa}}! *{codigo}*', campos: { 'c-sistema': '{{empresa}}' } });
    expect(usosDoParametro(m, 'EMPRESA', DADOS.campos)).toEqual(['Descrição', 'Cliente', 'Sistema', 'Mensagem ao cliente', 'o parâmetro empresa_ou_nome']);
    expect(usosDoParametro(m, 'setor')).toEqual([]);
    const r = renomearParametro(m, 'empresa', 'cliente_empresa');
    expect([r.cliente, r.descricao, r.mensagem, r.campos['c-sistema']]).toEqual(['{{cliente_empresa}}', 'Empresa: {{ cliente_empresa || "?" }}', 'Olá, {{cliente_empresa}}! *{codigo}*', '{{cliente_empresa}}']);
    expect(r.parametros.find((x) => x.nome === 'cliente_empresa')?.origem).toBe('pergunta: a empresa que você faz parte || contact.empresa');
    expect(r.parametros.find((x) => x.nome === 'empresa_ou_nome')?.origem).toBe('cliente_empresa || nome');
    // o caminho com o mesmo nome, na origem dele, fica
    const s2 = renomearParametro({ ...mapaDeFabrica(), parametros: [{ nome: 'sessionId', origem: 'sessionId', exemplo: '', descricao: '' }], sessaoId: '{{sessionId}}' }, 'sessionId', 'conversa');
    expect([s2.parametros[0]!.nome, s2.parametros[0]!.origem, s2.sessaoId]).toEqual(['conversa', 'sessionId', '{{conversa}}']);
  });

  it('a sugestão de nome vem da pergunta ou do caminho, sem repetir', () => {
    const vs = variaveisDoPedido(DO_LINECHAT);
    const de = (caminho: string) => vs.find((v) => v.caminho === caminho)!;
    expect(sugerirNomeDoParametro(de('questions.cb-8b2a1bcb-qst-81fe01bd.answer'), [])).toBe('motivo_contato');
    expect(sugerirNomeDoParametro(de('questions.cb-a35e88f1-qst-b9e89e4b.answer'), [])).toBe('empresa');
    expect(sugerirNomeDoParametro(de('menus.cb-a35e88f1-mn-8d2de45b.answer'), [])).toBe('solucao');
    expect(sugerirNomeDoParametro(de('menus.cb-a35e88f1-mn-bfb06331.answer'), [])).toBe('resposta_do_menu');
    expect(sugerirNomeDoParametro(de('contact.empresa'), ['empresa'])).toBe('empresa_2');
    expect(sugerirNomeDoParametro(de('contact.first-name'), [])).toBe('first-name');
    expect(sugerirNomeDoParametro({ caminho: 'endereço: setor', dica: null }, ['setor', 'setor_2'])).toBe('setor_3');
    expect(sugerirNomeDoParametro({ caminho: 'codigo', dica: null }, [])).toBe('codigo_1');
  });

  it('"Como deve chegar o webhook": o pedido inteiro, no formato do LineChat, com o que o Gestor lê marcado (os blocos de verdade)', () => {
    const m = comParametros({ descricao: '{{menu: escolha para qual solução}} {{lastMessagesAggregated.files.0.url}}', titulo: '{{nome || "Sem nome"}}', etiquetas: 'robô, {{setor}}, {{setr}}' });
    const e = pedidoEsperado(m, DO_LINECHAT);
    // o pedido é o do LineChat, inteiro: nada some, e o que veio fica como veio
    expect(Object.keys(e.corpo)).toEqual(Object.keys(DO_LINECHAT[0]!));
    expect(e.corpo.contact).toEqual(DO_LINECHAT[0]!.contact);
    expect(e.marcas).toEqual([
      { caminho: ['contact', 'name'], quem: ['{{nome}}'], veio: true },
      { caminho: ['contact', 'phonenumber'], quem: ['{{whatsapp}}'], veio: true },
      { caminho: ['sessionId'], quem: ['{{conversa}}'], veio: true },
      { caminho: ['lastContactMessage'], quem: ['{{mensagem}}'], veio: true },
      // a pergunta pelo texto: o bloco de verdade, com o código dele
      { caminho: ['questions', 'cb-a35e88f1-qst-b9e89e4b', 'answer'], quem: ['{{empresa}}'], veio: true },
      // a alternativa (o "se não vier") é marcada quando veio
      { caminho: ['contact', 'empresa'], quem: ['{{empresa}}'], veio: true },
      { caminho: ['questions', 'cb-8b2a1bcb-qst-81fe01bd', 'answer'], quem: ['{{motivo}}'], veio: true },
      // o campo que lê direto do pedido (sem parâmetro)
      { caminho: ['menus', 'cb-a35e88f1-mn-8d2de45b', 'answer'], quem: ['Descrição'], veio: true },
    ]);
    // o parâmetro do endereço que não veio entra com o exemplo
    expect(e.endereco).toEqual([{ chave: 'setor', valor: 'suporte', quem: ['{{setor}}'], veio: false }]);
    // o que um campo lê e não existe não é inventado: o caminho que não veio e o parâmetro que saiu (setr)
    expect(e.fora).toEqual([{ referencia: 'setr', onde: ['Etiquetas'] }, { referencia: 'lastMessagesAggregated.files.0.url', onde: ['Descrição'] }]);
    expect(e.corpo).not.toHaveProperty('setr');
    // com o endereço do pedido, o setor veio
    expect(pedidoEsperado(m, DO_LINECHAT, { setor: 'financeiro', outro: 'x' }).endereco).toEqual([{ chave: 'setor', valor: 'financeiro', quem: ['{{setor}}'], veio: true }]);
    // o pedido de antes não muda
    expect(DO_LINECHAT[0]!.questions).not.toHaveProperty('cb-…-qst-…');
  });

  it('"Como deve chegar o webhook": o que não veio entra no lugar dele, com o exemplo (e o bloco com o código por preencher)', () => {
    const m: MapaDoRobo = {
      ...mapaDeFabrica(),
      parametros: [
        ...mapaDeFabrica().parametros,
        { nome: 'cnpj', origem: 'pergunta: Qual o CNPJ da empresa?', exemplo: '11.222.333/0001-81', descricao: '' },
        { nome: 'plano', origem: 'menu: Qual o seu plano?', exemplo: '', descricao: '' },
        { nome: 'cpf', origem: 'contact.cpf', exemplo: '', descricao: '' },
        { nome: 'sessionId', origem: 'sessionId', exemplo: '', descricao: '' },
        { nome: 'x', origem: '__proto__.y', exemplo: 'z', descricao: '' },
      ],
      cliente: '{{pergunta: Qual a razão social?}}',
    };
    const e = pedidoEsperado(m, EXEMPLO_DO_LINECHAT);
    const q = e.corpo.questions as Record<string, unknown>;
    // as perguntas do pedido continuam; a que não veio entra com o código por preencher (e a do campo também)
    expect(Object.keys(q)).toEqual(['cb-exemplo-qst-empresa', 'cb-exemplo-qst-motivo', 'cb-…-qst-…', 'cb-…-qst-… (2)']);
    expect(q['cb-…-qst-…']).toEqual({ text: 'Qual o CNPJ da empresa?', answer: '11.222.333/0001-81', answerFile: null });
    expect(q['cb-…-qst-… (2)']).toEqual({ text: 'Qual a razão social?', answer: '…', answerFile: null });
    expect((e.corpo.menus as Record<string, unknown>)['cb-…-mn-…']).toEqual({ text: 'Qual o seu plano?', answer: '…', answerFile: null });
    expect((e.corpo.contact as Record<string, unknown>).cpf).toBe('…');
    expect(e.marcas.filter((x) => !x.veio)).toEqual([
      { caminho: ['questions', 'cb-…-qst-…', 'answer'], quem: ['{{cnpj}}'], veio: false },
      { caminho: ['menus', 'cb-…-mn-…', 'answer'], quem: ['{{plano}}'], veio: false },
      { caminho: ['contact', 'cpf'], quem: ['{{cpf}}'], veio: false },
      { caminho: ['questions', 'cb-…-qst-… (2)', 'answer'], quem: ['Cliente'], veio: false },
    ]);
    // o parâmetro com o nome do caminho lê o caminho (e o conversa, que aponta para ele, passa por ele); o __proto__ não entra
    expect(e.marcas).toContainEqual({ caminho: ['sessionId'], quem: ['{{sessionId}}'], veio: true });
    expect(({} as Record<string, unknown>).y).toBeUndefined();
    // o pedido de conferência vazio vira o mínimo com o que o mapa lê
    expect(pedidoEsperado(mapaDeFabrica(), null).corpo).toEqual({ contact: { name: 'Maria Souza', phonenumber: '+55|71999992010' }, sessionId: '5f0c2a8e-1d2b-4c3a-9e10-000000000001', lastContactMessage: 'As ligações de saída não completam desde cedo' });
  });

  it('as linhas do JSON: o que tem marca fica aberto, o resto recolhido; o texto longo é cortado', () => {
    const e = pedidoEsperado(mapaDeFabrica(), DO_LINECHAT);
    const linhas = linhasDoPedido(e.corpo, e.marcas, 30);
    const texto = linhas.map((l) => `${'  '.repeat(l.recuo)}${l.texto}`);
    expect(texto.slice(0, 7)).toEqual([
      '[', '  {', '    "responseKeys": [],', '    "companyId": "c5824651-0000-4000-8000-00000…",', '    "sessionId": "33adffe5-b5e0-4138-895c-64e94…",',
      '    "callbackUrl": null,', '    "callbackId": null,',
    ]);
    expect(texto).toContain('    "session": { … },');
    expect(texto).toContain('    "questions": { … },');
    // o contato aberto (tem o nome e o WhatsApp), com os 11 dados seguidos que o Gestor não lê recolhidos
    expect(texto.slice(texto.indexOf('    "contact": {'), texto.indexOf('    "contact": {') + 7)).toEqual([
      '    "contact": {', '      "id": "ct-1",', '      "name": "João Teste",', '      "first-name": "João",', '      "phonenumber": "+55|71999990123",',
      '      … e mais 11', '    },',
    ]);
    expect(texto.slice(-3)).toEqual(['    "senderId": null', '  }', ']']);
    const nome = linhas.find((l) => l.texto.startsWith('"name"'));
    expect(nome).toMatchObject({ texto: '"name": "João Teste",', marca: { quem: ['{{nome}}'], veio: true } });
    expect(linhas.filter((l) => l.marca).map((l) => l.marca!.quem[0])).toEqual(['{{conversa}}', '{{nome}}', '{{whatsapp}}', '{{mensagem}}']);
    expect(linhas.find((l) => l.texto.startsWith('"session"'))!.recolhido).toBe(true);
  });

  it('a mensagem e a resposta ao robô também usam os parâmetros', () => {
    const m = comParametros({ mensagem: 'Olá, {{nome}}! Chamado *{codigo}* ({{setor}}).' });
    expect(respostaAoRobo(m, { codigo: 'SUP-3' }, DO_LINECHAT, { setor: 'suporte' })).toEqual({ response: 'CHAMADO_ABERTO', messages: [{ text: 'Olá, João Teste! Chamado *SUP-3* (suporte).' }] });
  });
});
