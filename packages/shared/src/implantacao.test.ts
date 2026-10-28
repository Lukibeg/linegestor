import { describe, expect, it } from 'vitest';
import { CampoGravarSchema, EtapaGravarSchema, normalizarValorDoCampo, textoDoEvento, textoDoValor, type CampoPersonalizado } from './atendimento.js';
import {
  MODELO_DA_IMPLANTACAO, cadastroMuda, contaDoCampo, marcasDepois, modulosMarcados, nomeCompletoDoCampo, parteDaEtapa, partesDoChamado, partesDoPainel,
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
    expect(EtapaGravarSchema.parse({ nome: 'Validado', tipo: 'fechado', ligaNoCadastro: true, abreImplantacao: '' })).toMatchObject({ abreImplantacao: null, ligaNoCadastro: true });
  });
});

describe('o modelo do painel Implantação', () => {
  it('tem as etapas das partes, o Validado que liga no cadastro e os campos dos dois produtos', () => {
    expect(MODELO_DA_IMPLANTACAO.etapas.map((e) => e.nome)).toEqual(['Stand By', 'Curadoria', 'Configuração', 'Testes', 'Validado']);
    expect(MODELO_DA_IMPLANTACAO.etapas.filter((e) => e.tipo === 'entrada').map((e) => e.nome)).toEqual(['Curadoria']);
    expect(MODELO_DA_IMPLANTACAO.etapas.find((e) => e.ligaNoCadastro)?.nome).toBe('Validado');
    const partes = [...new Set(MODELO_DA_IMPLANTACAO.campos.map((c) => c.parte))];
    expect(partes).toEqual(['Curadoria', 'Configuração', 'Testes']);
    // cada campo passa no formulário dos Ajustes (com o produto escolhido), e nenhum nome se repete no mesmo produto
    for (const c of MODELO_DA_IMPLANTACAO.campos) {
      const r = CampoGravarSchema.safeParse({ nome: c.nome, tipo: c.tipo, dica: c.dica, parte: c.parte, produtoId: c.produto ?? null, opcoes: c.opcoes.map((nome) => ({ nome })) });
      expect(r.success, c.nome).toBe(true);
    }
    const chaves = MODELO_DA_IMPLANTACAO.campos.map((c) => `${c.produto}:${c.nome}`);
    expect(new Set(chaves).size).toBe(chaves.length);
    expect(MODELO_DA_IMPLANTACAO.campos.length).toBeLessThanOrEqual(30);
    // os testes do LineChat (que o Helena não tinha)
    expect(MODELO_DA_IMPLANTACAO.campos.some((c) => c.produto === 'linechat' && c.parte === 'Testes')).toBe(true);
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
    expect(planoDaImplantacao({ ...base, negociacao: { ...neg, cnpjDoCampo: '11.222.333/0001-80' } }).falta).toMatch(/dígito verificador/);
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
      etapa: 'Validado', dia: '2026-10-28', cliente: { id: 'c1', nome: 'Aurora' }, produtos,
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

  it('sem cliente, nada; com tudo em dia, nada muda', () => {
    expect(planoDoCadastro({ etapa: 'V', dia: 'd', cliente: null, produtos, modulosMarcados: [], assinaturas: new Map() }).produtos).toEqual([]);
    const emDia = planoDoCadastro({ etapa: 'V', dia: 'd', cliente: { id: 'c', nome: 'C' }, produtos: [produtos[0]!], modulosMarcados: [], assinaturas: new Map([['chat', { ativadoEm: 'x', encerrado: false, modulosLigados: new Set<string>() }]]) });
    expect(cadastroMuda(emDia)).toBe(false);
    expect(textoDoEvento('cadastro', { cliente: 'C', produtos: [], modulos: [], etapa: 'Validado' })).toMatch(/já estava em dia/);
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
