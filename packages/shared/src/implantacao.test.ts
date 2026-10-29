import { describe, expect, it } from 'vitest';
import { CaixinhasGravarSchema, CampoGravarSchema, EtapaGravarSchema, mudancasDasCaixinhas, normalizarValorDoCampo, pastasDasCaixinhas, textoDoEvento, textoDoValor, type CampoPersonalizado, type EtapaPainel } from './atendimento.js';
import {
  etapaDoFimDaImplantacao,
  MODELO_DA_IMPLANTACAO, opcaoDoModelo, modulosDoChecklist, modulosSemMarcar, cadastroMuda, contaDoCampo, marcasDepois, modulosMarcados, nomeCompletoDoCampo, parteDaEtapa, partesDoChamado, partesDoPainel,
  planoDaImplantacao, planoDoCadastro, progressoDasPartes, tituloDaImplantacao,
} from './implantacao.js';

const campo = (id: string, extra: Partial<CampoPersonalizado> = {}): CampoPersonalizado => ({
  id, painelId: 'imp', nome: id, tipo: 'texto', dica: null, opcoes: [], ativo: true, ordem: 0, incluirNaHora: false, parte: null, produtoId: null, ...extra,
});
const op = (id: string, ativa = true) => ({ id, nome: id.toUpperCase(), ativa });

const CAMPOS: CampoPersonalizado[] = [
  campo('geral', { parte: 'Curadoria' }),
  campo('usuarios', { parte: 'Curadoria', produtoId: 'chat', tipo: 'texto_longo' }),
  campo('ramais', { parte: 'Curadoria', produtoId: 'pbx', tipo: 'texto_longo' }),
  campo('conf-chat', { parte: 'Configuração', produtoId: 'chat', tipo: 'caixinhas', opcoes: [op('a'), op('b'), op('c', false)] }),
  campo('mod-chat', { parte: 'Configuração', produtoId: 'chat', tipo: 'modulos', opcoes: [op('nps'), op('dash')] }),
  campo('conf-pbx', { parte: 'Configuração', produtoId: 'pbx', tipo: 'caixinhas', opcoes: [op('x'), op('y')] }),
  campo('sem-parte'),
  campo('desligado', { parte: 'Curadoria', ativo: false }),
];

describe('as partes da ficha', () => {
  it('juntam os campos por parte e por produto, só os do produto que o chamado tem', () => {
    const partes = partesDoChamado(CAMPOS, ['chat'], { geral: 'ok', 'conf-chat': ['a'] });
    expect(partes.map((p) => p.nome)).toEqual(['Curadoria', 'Configuração']);
    expect(partes[0]!.blocos.map((b) => [b.produtoId, b.campos.map((c) => c.id)])).toEqual([[null, ['geral']], ['chat', ['usuarios']]]);
    // o do LinePBX, o desativado e o sem parte ficam de fora
    expect(partes.flatMap((p) => p.blocos.flatMap((b) => b.campos.map((c) => c.id)))).not.toContain('ramais');
    expect(partes[1]!.blocos.map((b) => b.campos.map((c) => c.id))).toEqual([['conf-chat', 'mod-chat']]);
  });

  it('contam o preenchido e as caixinhas marcadas; os módulos não contam', () => {
    const [cur, conf] = progressoDasPartes(CAMPOS, ['chat', 'pbx'], { geral: 'ok', ramais: 'R1', 'conf-chat': ['a', 'c'], 'mod-chat': ['nps'], 'conf-pbx': ['y'] });
    expect(cur).toEqual({ parte: 'Curadoria', feitos: 2, total: 3 });
    // a: marcada; b: falta; c: desativada mas marcada (conta como feita); x falta, y marcada
    expect(conf).toEqual({ parte: 'Configuração', feitos: 3, total: 5 });
    expect(contaDoCampo(CAMPOS[4]!, ['nps'])).toEqual({ feitos: 0, total: 0 });
    expect(contaDoCampo(CAMPOS[3]!, [])).toEqual({ feitos: 0, total: 2 });
  });

  it('os blocos dos produtos seguem a ordem dos produtos do chamado', () => {
    const p = partesDoChamado(CAMPOS, ['pbx', 'chat'], {});
    expect(p[0]!.blocos.map((b) => b.produtoId)).toEqual([null, 'pbx', 'chat']);
  });

  it('o cartão mostra a parte com o nome da etapa', () => {
    const partes = progressoDasPartes(CAMPOS, ['chat'], {});
    expect(parteDaEtapa(partes, 'configuracao')?.parte).toBe('Configuração');
    expect(parteDaEtapa(partes, 'Testes')).toBeNull();
    expect(parteDaEtapa(partes, null)).toBeNull();
  });

  it('as partes do painel, sem repetir, e o nome com o produto', () => {
    expect(partesDoPainel([{ parte: 'Curadoria' }, { parte: null }, { parte: 'curadoria' }, { parte: 'Testes' }])).toEqual(['Curadoria', 'Testes']);
    expect(nomeCompletoDoCampo({ nome: 'Horário', produtoId: 'chat' }, [{ id: 'chat', nome: 'LineChat' }])).toBe('Horário (LineChat)');
    expect(nomeCompletoDoCampo({ nome: 'Horário', produtoId: null }, new Map())).toBe('Horário');
  });
});

describe('as caixinhas', () => {
  const c = CAMPOS[3]!;
  it('guardam quem marcou e quando; a que continua marcada fica com quem marcou primeiro', () => {
    const quem = { porId: 'u1', porNome: 'Luan' };
    const r1 = marcasDepois({}, c, null, ['b', 'a'], quem, '2026-10-28T10:00:00Z');
    expect(r1.marcou).toEqual(['a', 'b']);
    expect(r1.marcas[c.id]).toEqual({ a: { ...quem, em: '2026-10-28T10:00:00Z' }, b: { ...quem, em: '2026-10-28T10:00:00Z' } });
    const r2 = marcasDepois(r1.marcas, c, ['a', 'b'], ['a'], { porId: 'u2', porNome: 'Carlos' }, '2026-10-28T11:00:00Z');
    expect(r2.desmarcou).toEqual(['b']);
    expect(r2.marcas[c.id]).toEqual({ a: { ...quem, em: '2026-10-28T10:00:00Z' } });
    expect(marcasDepois(r2.marcas, c, ['a'], null, quem, 'x').marcas).toEqual({});
  });

  it('o valor é como o da lista de várias: pelo nome ou pelo id', () => {
    expect(normalizarValorDoCampo(c, 'A; b')).toEqual({ ok: true, valor: ['a', 'b'] });
    expect(normalizarValorDoCampo(c, ['zz']).ok).toBe(false);
    expect(textoDoValor(c, ['a', 'b'])).toBe('A, B');
  });

  it('o histórico diz o que foi marcado e desmarcado', () => {
    expect(textoDoEvento('campo', { campo: 'Testes (LinePBX)', marcou: ['Ligações'], desmarcou: [] })).toBe('marcou em Testes (LinePBX): Ligações');
    expect(textoDoEvento('campo', { campo: 'Testes', marcou: [], desmarcou: ['Login'] })).toBe('desmarcou em Testes: Login');
    expect(textoDoEvento('campo', { campo: 'Testes', marcou: ['A'], desmarcou: ['B'] })).toBe('marcou em Testes: A e desmarcou B');
  });
});

describe('o campo e a etapa nos Ajustes', () => {
  it('os módulos pedem o produto; as caixinhas, uma opção', () => {
    expect(CampoGravarSchema.safeParse({ nome: 'Módulos', tipo: 'modulos' }).success).toBe(false);
    expect(CampoGravarSchema.safeParse({ nome: 'Módulos', tipo: 'modulos', produtoId: 'p' }).success).toBe(true);
    expect(CampoGravarSchema.safeParse({ nome: 'Testes', tipo: 'caixinhas' }).success).toBe(false);
    const ok = CampoGravarSchema.parse({ nome: 'Testes', tipo: 'caixinhas', opcoes: [{ nome: 'Login' }], parte: ' ', produtoId: '' });
    expect(ok.parte).toBeNull();
    expect(ok.produtoId).toBeNull();
    expect(CampoGravarSchema.parse({ nome: 'X', tipo: 'texto', parte: 'Curadoria' }).parte).toBe('Curadoria');
  });
  it('a etapa guarda o painel da implantação e o ligar no cadastro', () => {
    const e = EtapaGravarSchema.parse({ nome: 'Em implantação', tipo: 'andamento', abreImplantacao: 'p-imp' });
    expect(e).toMatchObject({ abreImplantacao: 'p-imp', ligaNoCadastro: false });
    expect(EtapaGravarSchema.parse({ nome: 'Implantado', tipo: 'fechado', ligaNoCadastro: true, abreImplantacao: '' })).toMatchObject({ abreImplantacao: null, ligaNoCadastro: true });
  });
});

describe('o checklist dos módulos (2.3: a Curadoria escolhe, a Configuração ativa)', () => {
  const mods = [op('fop'), op('nps'), op('cb'), op('velho', false)];
  const escolha = campo('escolha', { tipo: 'modulos', parte: 'Curadoria', produtoId: 'pbx', opcoes: mods, nome: 'Módulos a ativar' });
  const lista = campo('lista', { tipo: 'modulos', parte: 'Configuração', produtoId: 'pbx', opcoes: mods, nome: 'Ativação dos módulos', escolhidosEm: 'escolha' });
  const valores = { escolha: ['fop', 'cb'], lista: ['fop', 'nps'] };

  it('mostra só os escolhidos (e o marcado que saiu da escolha); a conta é dos escolhidos', () => {
    const r = modulosDoChecklist(lista, valores);
    expect(r.opcoes.map((o) => o.id)).toEqual(['fop', 'nps', 'cb']);
    expect([...r.foraDaEscolha]).toEqual(['nps']);
    expect(contaDoCampo(lista, valores.lista, valores)).toEqual({ feitos: 1, total: 2 });
    // a escolha não conta (é a escolha, não uma tarefa)
    expect(contaDoCampo(escolha, valores.escolha, valores)).toEqual({ feitos: 0, total: 0 });
    expect(modulosDoChecklist(lista, {}).opcoes).toEqual([]);
    const partes = progressoDasPartes([escolha, lista], ['pbx'], valores);
    expect(partes).toEqual([{ parte: 'Curadoria', feitos: 0, total: 0 }, { parte: 'Configuração', feitos: 1, total: 2 }]);
  });

  it('o Implantado liga o que a Curadoria escolheu; o checklist só avisa o que falta marcar', () => {
    const produtos = [{ id: 'pbx', nome: 'LinePBX' }];
    expect(modulosMarcados([escolha, lista], ['pbx'], valores, produtos).map((m) => m.id)).toEqual(['fop', 'cb']);
    expect(modulosSemMarcar([escolha, lista], ['pbx'], valores, produtos)).toEqual([{ id: 'cb', nome: 'CB', produto: 'LinePBX', campo: 'Ativação dos módulos' }]);
    // sem o produto no card, nada
    expect(modulosSemMarcar([escolha, lista], [], valores, produtos)).toEqual([]);
    const plano = planoDoCadastro({
      etapa: 'Implantado', dia: '2026-10-29', cliente: { id: 'c1', nome: 'Cliente' }, produtos: [{ id: 'pbx', nome: 'LinePBX' }],
      modulosMarcados: modulosMarcados([escolha, lista], ['pbx'], valores, produtos), semMarcar: modulosSemMarcar([escolha, lista], ['pbx'], valores, produtos), assinaturas: new Map(),
    });
    expect(plano.modulos.map((m) => [m.id, m.acao])).toEqual([['fop', 'liga'], ['cb', 'liga']]);
    expect(plano.semMarcar?.map((m) => m.nome)).toEqual(['CB']);
  });

  it('só os módulos seguem outro campo', () => {
    expect(CampoGravarSchema.safeParse({ nome: 'X', tipo: 'caixinhas', opcoes: [{ nome: 'a' }], escolhidosEm: 'escolha' }).success).toBe(false);
    expect(CampoGravarSchema.safeParse({ nome: 'X', tipo: 'modulos', produtoId: 'pbx', escolhidosEm: 'escolha' }).success).toBe(true);
  });
});

describe('o modelo do painel Implantação', () => {
  it('tem as etapas das partes, o Implantado que liga no cadastro e os campos dos dois produtos', () => {
    expect(MODELO_DA_IMPLANTACAO.etapas.map((e) => e.nome)).toEqual(['Stand By', 'Curadoria', 'Configuração', 'Testes', 'Concluído', 'Implantado']);
    expect(MODELO_DA_IMPLANTACAO.etapas.map((e) => e.tipo)).toEqual(['andamento', 'entrada', 'andamento', 'andamento', 'resolvido', 'fechado']);
    expect(MODELO_DA_IMPLANTACAO.etapas.filter((e) => e.tipo === 'entrada').map((e) => e.nome)).toEqual(['Curadoria']);
    expect(MODELO_DA_IMPLANTACAO.etapas.find((e) => e.ligaNoCadastro)?.nome).toBe('Implantado');
    const partes = [...new Set(MODELO_DA_IMPLANTACAO.campos.map((c) => c.parte))];
    expect(partes).toEqual(['Curadoria', 'Configuração', 'Testes']);
    // cada campo passa no formulário dos Ajustes (com o produto escolhido), e nenhum nome se repete no mesmo produto
    for (const c of MODELO_DA_IMPLANTACAO.campos) {
      const r = CampoGravarSchema.safeParse({ nome: c.nome, tipo: c.tipo, dica: c.dica, parte: c.parte, produtoId: c.produto ?? null, opcoes: c.opcoes.map(opcaoDoModelo) });
      expect(r.success, c.nome).toBe(true);
    }
    const chaves = MODELO_DA_IMPLANTACAO.campos.map((c) => `${c.produto}:${c.nome}`);
    expect(new Set(chaves).size).toBe(chaves.length);
    expect(MODELO_DA_IMPLANTACAO.campos.length).toBeLessThanOrEqual(30);
    // os testes do LineChat (que o Helena não tinha)
    expect(MODELO_DA_IMPLANTACAO.campos.some((c) => c.produto === 'linechat' && c.parte === 'Testes')).toBe(true);
    // sem o CRM usado ("n precisa disso n")
    expect(MODELO_DA_IMPLANTACAO.campos.some((c) => c.nome === 'CRM usado')).toBe(false);
    // os módulos: escolhidos na Curadoria, o checklist na Configuração (de cada produto)
    for (const produto of ['linechat', 'linepbx'] as const) {
      const doProduto = MODELO_DA_IMPLANTACAO.campos.filter((c) => c.produto === produto && c.tipo === 'modulos');
      expect(doProduto.map((c) => [c.nome, c.parte, c.escolhidosEm ?? null])).toEqual([
        ['Módulos a ativar', 'Curadoria', null], ['Ativação dos módulos', 'Configuração', 'Módulos a ativar'],
      ]);
    }
  });

  it('a Configuração do ambiente do LinePBX vem em pastas: Servidor, Asterisk, LinePBX Web, Módulos e Telefones', () => {
    const c = MODELO_DA_IMPLANTACAO.campos.find((x) => x.produto === 'linepbx' && x.nome === 'Configuração do ambiente')!;
    const pastas = pastasDasCaixinhas(c.opcoes.map(opcaoDoModelo).map((o, i) => ({ id: `o${i}`, ativa: true, ...o })));
    expect(pastas.map((p) => [p.pasta, p.opcoes.length])).toEqual([['Servidor', 1], ['Asterisk', 5], ['LinePBX Web', 2], ['Módulos', 1], ['Telefones', 1]]);
    // o nome sem o prefixo de antes ("Asterisk - …"): a pasta já diz
    expect(pastas[1]!.opcoes.map((o) => o.nome)).toContain('Configuração dos ramais');
    expect(c.opcoes.map(opcaoDoModelo).every((o) => !o.nome.includes(' - '))).toBe(true);
  });
});

describe('as pastas das caixinhas (2.3)', () => {
  const o = (id: string, nome: string, pasta?: string | null, ativa = true) => ({ id, nome, ativa, pasta });
  it('junta pela pasta (sem ligar para maiúscula e acento), as sem pasta primeiro, as pastas na ordem em que aparecem', () => {
    const r = pastasDasCaixinhas([o('a', 'Ramais', 'Asterisk'), o('b', 'Sem pasta'), o('c', 'Usuários', 'LinePBX Web'), o('d', 'Tronco', 'asterisk'), o('e', 'Outra', '  ')]);
    expect(r.map((p) => [p.pasta, p.opcoes.map((x) => x.id)])).toEqual([[null, ['b', 'e']], ['Asterisk', ['a', 'd']], ['LinePBX Web', ['c']]]);
    expect(pastasDasCaixinhas([])).toEqual([]);
  });
  it('diz o que mudou: incluiu, renomeou, levou de pasta, desativou, reativou; ou só a ordem', () => {
    const antes = [o('a', 'Ramais', 'Asterisk'), o('b', 'Tronco', 'Asterisk'), o('c', 'Telefones'), o('d', 'Velha', null, false)];
    expect(mudancasDasCaixinhas(antes, [o('a', 'Configuração dos ramais', 'Asterisk'), o('b', 'Tronco', 'Servidor'), o('c', 'Telefones', null, false), o('d', 'Velha'), o('n', 'FHA', 'Asterisk')]))
      .toEqual(['incluiu FHA (Asterisk)', 'renomeou Ramais para Configuração dos ramais', 'levou Tronco para a pasta Servidor', 'desativou Telefones', 'reativou Velha']);
    expect(mudancasDasCaixinhas(antes, [antes[1]!, antes[0]!, antes[2]!, antes[3]!])).toEqual(['mudou a ordem']);
    expect(mudancasDasCaixinhas(antes, antes)).toEqual([]);
  });
  it('o Editar as caixinhas: pelo menos uma ativa, sem nome repetido, a pasta até 40 letras', () => {
    expect(CaixinhasGravarSchema.safeParse({ opcoes: [{ nome: 'Ramais', pasta: 'Asterisk' }] }).success).toBe(true);
    expect(CaixinhasGravarSchema.parse({ opcoes: [{ nome: 'Ramais', pasta: '' }] }).opcoes[0]!.pasta).toBeNull();
    expect(CaixinhasGravarSchema.safeParse({ opcoes: [{ nome: 'Ramais', ativa: false }] }).success).toBe(false);
    expect(CaixinhasGravarSchema.safeParse({ opcoes: [{ nome: 'Ramais' }, { nome: 'ramais' }] }).success).toBe(false);
    expect(CaixinhasGravarSchema.safeParse({ opcoes: [{ nome: 'Ramais', pasta: 'x'.repeat(41) }] }).success).toBe(false);
  });
});

describe('a negociação que abre a implantação', () => {
  const painel = { id: 'imp', nome: 'Implantação', sigla: 'IMP', etapaDeEntrada: 'Curadoria' };
  const produtos = [{ id: 'chat', nome: 'LineChat' }, { id: 'pbx', nome: 'LinePBX' }];
  const base = { painel, clientePeloCnpj: null, produtosDoCliente: new Set<string>(), jaAberta: null };

  it('o cliente que já é do cadastro: os produtos que ele não tem entram', () => {
    const p = planoDaImplantacao({ ...base, produtosDoCliente: new Set(['chat']), negociacao: { clienteId: 'c1', clienteNome: 'Clínica Aurora', empresa: null, cnpjDoCampo: null, produtos } });
    expect(p.cliente).toEqual({ tipo: 'cadastro', id: 'c1', nome: 'Clínica Aurora', peloCnpj: false });
    expect(p.produtos.map((x) => x.jaNoCadastro)).toEqual([true, false]);
    expect(p.falta).toBeNull();
    expect(p.titulo).toBe('Implantação — Clínica Aurora');
  });

  it('a empresa que ainda não é cliente: o CNPJ do campo cria o cliente; sem ele, falta', () => {
    const neg = { clienteId: null, clienteNome: null, empresa: 'Padaria Sol', cnpjDoCampo: '11.222.333/0001-81', produtos };
    const p = planoDaImplantacao({ ...base, negociacao: neg });
    expect(p.cliente).toEqual({ tipo: 'novo', nomeFantasia: 'Padaria Sol', razaoSocial: 'Padaria Sol', cnpj: '11222333000181', erro: null });
    expect(p.falta).toBeNull();
    expect(planoDaImplantacao({ ...base, negociacao: { ...neg, cnpjDoCampo: null } }).falta).toBe('Para criar o cliente, falta o CNPJ.');
    // só os 14 números: o dígito verificador não é conferido
    expect(planoDaImplantacao({ ...base, negociacao: { ...neg, cnpjDoCampo: '11.222.333/0001-80' } }).falta).toBeNull();
    expect(planoDaImplantacao({ ...base, negociacao: { ...neg, cnpjDoCampo: '11.222.333/0001-8' } }).falta).toBe('O CNPJ tem 14 números: falta 1.');
    expect(planoDaImplantacao({ ...base, negociacao: { ...neg, cnpjDoCampo: '11.222.333/0001' } }).falta).toBe('O CNPJ tem 14 números: faltam 2.');
    expect(planoDaImplantacao({ ...base, negociacao: { ...neg, cnpjDoCampo: '11.222.333/0001-801' } }).falta).toBe('O CNPJ tem 14 números: tem número a mais.');
    // o da janela vale mais que o da negociação
    const j = planoDaImplantacao({ ...base, negociacao: { ...neg, cnpjDoCampo: null }, pedido: { nomeFantasia: 'Sol', razaoSocial: 'Sol Pães Ltda', cnpj: '11222333000181' } });
    expect(j.cliente).toMatchObject({ tipo: 'novo', nomeFantasia: 'Sol', razaoSocial: 'Sol Pães Ltda' });
    expect(j.falta).toBeNull();
  });

  it('o CNPJ que já está no cadastro liga a negociação àquele cliente', () => {
    const p = planoDaImplantacao({ ...base, clientePeloCnpj: { id: 'c9', nome: 'Sol Pães' }, negociacao: { clienteId: null, clienteNome: null, empresa: 'Padaria Sol', cnpjDoCampo: '11222333000181', produtos } });
    expect(p.cliente).toEqual({ tipo: 'cadastro', id: 'c9', nome: 'Sol Pães', peloCnpj: true });
  });

  it('o CNPJ de um cliente na lixeira: não cria outro (restaurar antes)', () => {
    const p = planoDaImplantacao({ ...base, clienteNaLixeira: { nome: 'Sol Antiga' }, negociacao: { clienteId: null, clienteNome: null, empresa: 'Padaria Sol', cnpjDoCampo: '11222333000181', produtos } });
    expect(p.cliente).toMatchObject({ tipo: 'novo', erro: expect.stringMatching(/Sol Antiga, que está na lixeira/) });
    expect(p.falta).toMatch(/restaure o cliente/);
  });

  it('a que já abriu não abre de novo', () => {
    const p = planoDaImplantacao({ ...base, jaAberta: { codigo: 'IMP-3' }, negociacao: { clienteId: null, clienteNome: null, empresa: 'X', cnpjDoCampo: null, produtos: [] } });
    expect(p.jaAberta).toEqual({ codigo: 'IMP-3' });
    expect(p.falta).toBeNull();
  });

  it('o título vai até 200 letras', () => {
    expect(tituloDaImplantacao('a'.repeat(300))).toHaveLength(200);
  });
});

describe('o card que liga no cadastro', () => {
  const produtos = [{ id: 'chat', nome: 'LineChat' }, { id: 'pbx', nome: 'LinePBX' }, { id: 'sz', nome: 'SZChat' }];
  it('o produto sem data ganha a de hoje, o novo entra, o ativo e o encerrado ficam; os módulos ligam com o produto ativo', () => {
    const p = planoDoCadastro({
      etapa: 'Implantado', dia: '2026-10-28', cliente: { id: 'c1', nome: 'Aurora' }, produtos,
      modulosMarcados: [
        { id: 'nps', nome: 'NPS', produtoId: 'chat', produto: 'LineChat' },
        { id: 'omni', nome: 'Omniboard', produtoId: 'pbx', produto: 'LinePBX' },
        { id: 'fop', nome: 'FOP2', produtoId: 'pbx', produto: 'LinePBX' },
        { id: 'x', nome: 'X', produtoId: 'sz', produto: 'SZChat' },
      ],
      assinaturas: new Map([
        ['chat', { ativadoEm: null, encerrado: false, modulosLigados: new Set<string>() }],
        ['pbx', { ativadoEm: '2026-01-10T12:00:00Z', encerrado: false, modulosLigados: new Set(['fop']) }],
        ['sz', { ativadoEm: '2025-01-10T12:00:00Z', encerrado: true, modulosLigados: new Set<string>() }],
      ]),
    });
    expect(p.produtos.map((x) => x.acao)).toEqual(['ativa', 'ja_ativo', 'encerrado']);
    expect(p.modulos.map((m) => [m.id, m.acao])).toEqual([['nps', 'liga'], ['omni', 'liga'], ['fop', 'ja_ligado'], ['x', 'sem_produto']]);
    expect(cadastroMuda(p)).toBe(true);
    expect(planoDoCadastro({ etapa: 'V', dia: 'd', cliente: { id: 'c', nome: 'C' }, produtos: [{ id: 'novo', nome: 'N' }], modulosMarcados: [], assinaturas: new Map() }).produtos[0]!.acao).toBe('novo');
  });

  it('o produto sem data de ativação (o Equipamentos): o que já está no cliente fica; o novo entra, sem a data', () => {
    const p = planoDoCadastro({
      etapa: 'V', dia: 'd', cliente: { id: 'c', nome: 'C' }, produtos: [{ id: 'eq', nome: 'Equipamentos', semData: true }, { id: 'eq2', nome: 'Outro', semData: true }], modulosMarcados: [],
      assinaturas: new Map([['eq', { ativadoEm: null, encerrado: false, modulosLigados: new Set<string>() }]]),
    });
    expect(p.produtos).toEqual([{ id: 'eq', nome: 'Equipamentos', acao: 'ja_ativo', semData: true }, { id: 'eq2', nome: 'Outro', acao: 'novo', semData: true }]);
  });

  it('o fim da implantação leva a negociação ao Implantado do Comercial (a que acabou fica)', () => {
    const e = (id: string, extra: Partial<EtapaPainel> = {}): EtapaPainel => ({ id, nome: id, tipo: 'andamento', nivel: null, obrigatorios: [], avisar: [], resultado: null, ...extra });
    const etapas = [e('lead', { tipo: 'entrada' }), e('processo', { abreImplantacao: 'imp' }), e('implantado', { recebeImplantacao: true }), e('ganho', { tipo: 'fechado', resultado: 'ganho' })];
    expect(etapaDoFimDaImplantacao(etapas, 'processo')?.id).toBe('implantado');
    expect(etapaDoFimDaImplantacao(etapas, 'lead')?.id).toBe('implantado');
    expect(etapaDoFimDaImplantacao(etapas, 'implantado')).toBeNull();
    expect(etapaDoFimDaImplantacao(etapas, 'ganho')).toBeNull();
    expect(etapaDoFimDaImplantacao(etapas.map((x) => ({ ...x, recebeImplantacao: false })), 'processo')).toBeNull();
    expect(textoDoEvento('implantacao', { acao: 'negociacao', codigo: 'COM-12', etapa: 'Implantado' })).toBe('a negociação COM-12 foi para Implantado');
  });

  it('sem cliente, nada; com tudo em dia, nada muda', () => {
    expect(planoDoCadastro({ etapa: 'V', dia: 'd', cliente: null, produtos, modulosMarcados: [], assinaturas: new Map() }).produtos).toEqual([]);
    const emDia = planoDoCadastro({ etapa: 'V', dia: 'd', cliente: { id: 'c', nome: 'C' }, produtos: [produtos[0]!], modulosMarcados: [], assinaturas: new Map([['chat', { ativadoEm: 'x', encerrado: false, modulosLigados: new Set<string>() }]]) });
    expect(cadastroMuda(emDia)).toBe(false);
    expect(textoDoEvento('cadastro', { cliente: 'C', produtos: [], modulos: [], etapa: 'Implantado' })).toMatch(/já estava em dia/);
    expect(textoDoEvento('cadastro', { cliente: 'Aurora', produtos: ['LineChat'], modulos: ['NPS', 'Omniboard'], dia: '2026-10-28' })).toBe('ligou no cadastro de Aurora o produto LineChat e os módulos NPS e Omniboard, desde 28/10/2026');
  });

  it('os módulos marcados: só dos campos do produto que o chamado tem', () => {
    const m = modulosMarcados(CAMPOS, ['chat'], { 'mod-chat': ['dash', 'sumiu'] }, [{ id: 'chat', nome: 'LineChat' }]);
    expect(m).toEqual([{ id: 'dash', nome: 'DASH', produtoId: 'chat', produto: 'LineChat' }]);
    expect(modulosMarcados(CAMPOS, ['pbx'], { 'mod-chat': ['dash'] }, [])).toEqual([]);
  });
});

describe('o histórico da implantação', () => {
  it('na negociação e no card', () => {
    expect(textoDoEvento('implantacao', { acao: 'abriu', codigo: 'IMP-3', painel: 'Implantação', clienteNovo: true, cliente: 'Padaria Sol', produtos: ['LineChat', 'LinePBX'] }))
      .toBe('abriu a implantação IMP-3 no painel Implantação (criou o cliente Padaria Sol; LineChat e LinePBX no cadastro)');
    expect(textoDoEvento('implantacao', { acao: 'veio', codigo: 'CIG-12', titulo: 'Padaria Sol' })).toBe('veio da negociação CIG-12 (Padaria Sol)');
  });
});
