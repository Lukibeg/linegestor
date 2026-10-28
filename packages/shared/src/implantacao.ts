/**
 * A IMPLANTAÇÃO (Patch 2.3, decisão 0057) — o painel em que a equipe leva o cliente novo do contrato ao uso: a
 * **curadoria** (os dados que a curadoria colhe do cliente), a **configuração** (o que a equipe técnica já fez e o que
 * falta) e os **testes** (o que o suporte conferiu). O pedido do Luan, em 28/10, mostrando o painel Ingline - Ativações do
 * Helena: "eu criei dois grupos de campos personalizados… um é para o line chat e outro para o line PBX… e no final eu já
 * colocava também os passos de configuração… e um campo… para o teste".
 *
 * O que é novo, e mora aqui (o servidor e a prévia chamam as mesmas funções):
 *  - as **partes da ficha**: os campos com uma parte (Curadoria, Configuração, Testes) vão para o meio da ficha, em blocos
 *    por produto — o do LineChat só aparece no chamado que tem o LineChat;
 *  - as **caixinhas**, que guardam quem marcou cada uma e quando, e a conta de cada parte ("Configuração: 7 de 10");
 *  - o **modelo** do painel Implantação (as etapas e os campos do Helena, arrumados);
 *  - o que acontece quando a negociação chega na etapa que **abre a implantação** (o cliente, os produtos, o card) e
 *    quando o card chega na etapa que **liga no cadastro** (os produtos com a data e os módulos marcados).
 *
 * "n precisa limitar nada disso": nada trava. O card anda com coisa faltando; quem quiser travar usa o "obrigatório" da
 * etapa, como em qualquer campo.
 */
import { cnpjLimpo, cnpjValido, paraBusca } from './formatos.js';
import {
  valorPreenchido,
  type AjustesDoPainel, type CampoPersonalizado, type CorPainel, type EtapaPainel, type MarcaDaCaixinha, type MarcasDosCampos, type ProgressoDaParte,
  type TipoCampo, type ValorDoCampo, type ValoresDosCampos, AJUSTES_PAINEL_PADRAO,
} from './atendimento.js';

// =====================================================================
//  AS PARTES DA FICHA
// =====================================================================

/** Um bloco de uma parte: os campos de um produto (ou os de todo chamado, sem produto). */
export type BlocoDaParte = { produtoId: string | null; campos: CampoPersonalizado[] };
/** Uma parte da ficha, com os blocos e a conta do que já foi feito nela. */
export type ParteDoChamado = { nome: string; blocos: BlocoDaParte[]; feitos: number; total: number };

/** O nome da parte como se compara ("Configuração" e "configuracao" são a mesma). */
const chaveDaParte = (p: string) => paraBusca(p.trim());

/** O campo aparece neste chamado? Ativo e, se é de um produto, o chamado tem o produto. */
export function campoAparece(c: Pick<CampoPersonalizado, 'ativo' | 'produtoId'>, produtosDoChamado: readonly string[]): boolean {
  return c.ativo && (!c.produtoId || produtosDoChamado.includes(c.produtoId));
}

/**
 * Quanto um campo conta na parte: as caixinhas, cada opção (as marcadas e as que faltam, das ativas — a desativada que
 * ficou marcada conta como feita); os módulos do produto não contam (é a escolha do que o cliente vai usar, e não uma
 * tarefa); o resto, um item, feito quando preenchido.
 */
export function contaDoCampo(c: Pick<CampoPersonalizado, 'tipo' | 'opcoes'>, v: ValorDoCampo | null | undefined): { feitos: number; total: number } {
  if (c.tipo === 'modulos') return { feitos: 0, total: 0 };
  if (c.tipo === 'caixinhas') {
    const marcadas = new Set(Array.isArray(v) ? v : []);
    const opcoes = c.opcoes.filter((o) => o.ativa || marcadas.has(o.id));
    return { feitos: opcoes.filter((o) => marcadas.has(o.id)).length, total: opcoes.length };
  }
  return { feitos: valorPreenchido(v) ? 1 : 0, total: 1 };
}

/**
 * As partes do chamado, na ordem dos campos (a primeira parte é a do primeiro campo com parte): em cada uma, primeiro o
 * bloco dos campos sem produto, depois um bloco por produto, na ordem dos produtos do chamado. Só os campos que aparecem
 * (ativos, e do produto que o chamado tem).
 */
export function partesDoChamado(
  campos: readonly CampoPersonalizado[], produtosDoChamado: readonly string[], valores: ValoresDosCampos | null | undefined,
): ParteDoChamado[] {
  const partes: ParteDoChamado[] = [];
  const porChave = new Map<string, ParteDoChamado>();
  for (const c of campos) {
    if (!c.parte?.trim() || !campoAparece(c, produtosDoChamado)) continue;
    const k = chaveDaParte(c.parte);
    let p = porChave.get(k);
    if (!p) { p = { nome: c.parte.trim(), blocos: [], feitos: 0, total: 0 }; porChave.set(k, p); partes.push(p); }
    let b = p.blocos.find((x) => x.produtoId === c.produtoId);
    if (!b) { b = { produtoId: c.produtoId, campos: [] }; p.blocos.push(b); }
    b.campos.push(c);
    const conta = contaDoCampo(c, valores?.[c.id]);
    p.feitos += conta.feitos;
    p.total += conta.total;
  }
  const ordemDoProduto = (id: string | null) => (id === null ? -1 : produtosDoChamado.indexOf(id));
  for (const p of partes) p.blocos.sort((a, b) => ordemDoProduto(a.produtoId) - ordemDoProduto(b.produtoId));
  return partes;
}

/** Só a conta de cada parte (o cartão do quadro e a lista). */
export function progressoDasPartes(campos: readonly CampoPersonalizado[], produtosDoChamado: readonly string[], valores: ValoresDosCampos | null | undefined): ProgressoDaParte[] {
  return partesDoChamado(campos, produtosDoChamado, valores).map((p) => ({ parte: p.nome, feitos: p.feitos, total: p.total }));
}

/**
 * A parte que o cartão mostra: a que tem o nome da etapa em que o chamado está (no Configuração, a conta da
 * Configuração). Sem uma com esse nome, nenhuma.
 */
export function parteDaEtapa(partes: readonly ProgressoDaParte[], etapa: string | null | undefined): ProgressoDaParte | null {
  if (!etapa) return null;
  const k = chaveDaParte(etapa);
  return partes.find((p) => chaveDaParte(p.parte) === k && p.total > 0) ?? null;
}

/** As partes que já existem no painel (para sugerir ao criar um campo), na ordem dos campos. */
export function partesDoPainel(campos: ReadonlyArray<Pick<CampoPersonalizado, 'parte'>>): string[] {
  const vistas = new Map<string, string>();
  for (const c of campos) if (c.parte?.trim() && !vistas.has(chaveDaParte(c.parte))) vistas.set(chaveDaParte(c.parte), c.parte.trim());
  return [...vistas.values()];
}

/**
 * O nome do campo fora da ficha (o histórico, a auditoria, o CSV, o filtro): com o produto entre parênteses, quando é de
 * um ("Horário de atendimento (LineChat)") — dois campos podem ter o mesmo nome em produtos diferentes.
 */
export function nomeCompletoDoCampo(c: Pick<CampoPersonalizado, 'nome' | 'produtoId'>, produtos: ReadonlyMap<string, { nome: string }> | ReadonlyArray<{ id: string; nome: string }>): string {
  if (!c.produtoId) return c.nome;
  const nome = 'get' in produtos ? (produtos as ReadonlyMap<string, { nome: string }>).get(c.produtoId)?.nome : (produtos as ReadonlyArray<{ id: string; nome: string }>).find((p) => p.id === c.produtoId)?.nome;
  return nome ? `${c.nome} (${nome})` : c.nome;
}

// =====================================================================
//  AS CAIXINHAS: QUEM MARCOU E QUANDO
// =====================================================================

/**
 * As marcas depois de uma mudança num campo de caixinhas: a que continua marcada fica como estava (quem marcou
 * primeiro); a que foi marcada agora ganha quem e quando; a desmarcada sai. Devolve as marcas novas do chamado (um objeto
 * novo) e o que foi marcado e desmarcado (os ids, na ordem das opções).
 */
export function marcasDepois(
  atuais: MarcasDosCampos | null | undefined, campo: Pick<CampoPersonalizado, 'id' | 'opcoes'>,
  antes: ValorDoCampo | null | undefined, depois: ValorDoCampo | null | undefined, quem: Omit<MarcaDaCaixinha, 'em'>, em: string,
): { marcas: MarcasDosCampos; marcou: string[]; desmarcou: string[] } {
  const a = new Set(Array.isArray(antes) ? antes : []);
  const d = new Set(Array.isArray(depois) ? depois : []);
  const ordem = (ids: string[]) => ids.sort((x, y) => campo.opcoes.findIndex((o) => o.id === x) - campo.opcoes.findIndex((o) => o.id === y));
  const marcou = ordem([...d].filter((x) => !a.has(x)));
  const desmarcou = ordem([...a].filter((x) => !d.has(x)));
  const doCampo: Record<string, MarcaDaCaixinha> = {};
  const velhas = atuais?.[campo.id] ?? {};
  for (const id of d) doCampo[id] = velhas[id] ?? { ...quem, em };
  const marcas: MarcasDosCampos = { ...(atuais ?? {}) };
  if (Object.keys(doCampo).length) marcas[campo.id] = doCampo; else delete marcas[campo.id];
  return { marcas, marcou, desmarcou };
}

// =====================================================================
//  O MODELO DO PAINEL IMPLANTAÇÃO
// =====================================================================

/** O produto de um campo do modelo, pelo código do catálogo (o id muda de uma instalação para outra). */
export type CampoDoModelo = { nome: string; tipo: TipoCampo; parte: string; produto: 'linechat' | 'linepbx' | null; dica: string; opcoes: string[] };
type EtapaDoModelo = Pick<EtapaPainel, 'nome' | 'tipo' | 'nivel' | 'obrigatorios'> & { ligaNoCadastro?: boolean };

const CURADORIA = 'Curadoria';
const CONFIGURACAO = 'Configuração';
const TESTES = 'Testes';

/**
 * O painel Implantação com que se começa (Painéis › Ajustes › Novo painel › o modelo Implantação). As etapas seguem as
 * partes; os campos são os do Ingline - Ativações do Helena (os dois grupos, o do LineChat e o do LinePBX), arrumados em
 * Curadoria, Configuração e Testes — e o LineChat ganhou os testes, que lá não tinha. Tudo se muda depois, em Ajustes ›
 * Campos (o nome, as opções, a parte, o produto, a ordem).
 */
export const MODELO_DA_IMPLANTACAO: {
  nome: string; sigla: string; descricao: string; cor: CorPainel; ajustes: AjustesDoPainel; etapas: EtapaDoModelo[]; campos: CampoDoModelo[];
} = {
  nome: 'Implantação', sigla: 'IMP', cor: 'turquesa',
  descricao: 'As implantações dos clientes novos: a curadoria, a configuração e os testes de cada produto.',
  // sem prazo nem prioridade (a implantação leva o tempo dela), sem assunto, tipo, gravidade, relato e solução: o card é o
  // cliente, os produtos e as partes
  ajustes: {
    ...AJUSTES_PAINEL_PADRAO, tipos: [], contaPrazo: false, fecharSozinhoDias: null, paiEsperaFilhos: true,
    camposDesligados: ['assunto', 'tipo', 'gravidade', 'alcance', 'operadoras', 'relato', 'solucao', 'prioridade'],
  },
  etapas: [
    { nome: 'Stand By', tipo: 'andamento', nivel: null, obrigatorios: [] },
    { nome: CURADORIA, tipo: 'entrada', nivel: null, obrigatorios: [] },
    { nome: CONFIGURACAO, tipo: 'andamento', nivel: null, obrigatorios: [] },
    { nome: TESTES, tipo: 'andamento', nivel: null, obrigatorios: [] },
    { nome: 'Validado', tipo: 'fechado', nivel: null, obrigatorios: [], ligaNoCadastro: true },
  ],
  campos: [
    // a curadoria do LineChat
    { nome: 'Lista de usuários', tipo: 'texto_longo', parte: CURADORIA, produto: 'linechat', dica: 'Quem vai usar: o nome, o e-mail e a equipe de cada um.', opcoes: [] },
    { nome: 'Números', tipo: 'texto_longo', parte: CURADORIA, produto: 'linechat', dica: 'Os números do WhatsApp que entram no LineChat.', opcoes: [] },
    { nome: 'Estrutura do chatbot', tipo: 'texto_longo', parte: CURADORIA, produto: 'linechat', dica: 'O menu, as perguntas e para onde vai cada resposta.', opcoes: [] },
    { nome: 'Horário de atendimento', tipo: 'texto_longo', parte: CURADORIA, produto: 'linechat', dica: 'Os dias e as horas, e o que responder fora do horário.', opcoes: [] },
    { nome: 'Acesso à BM', tipo: 'sim_nao', parte: CURADORIA, produto: 'linechat', dica: 'O cliente já deu o acesso ao Business Manager da Meta?', opcoes: [] },
    { nome: 'CRM usado', tipo: 'texto', parte: CURADORIA, produto: 'linechat', dica: 'O CRM que o cliente usa hoje (se usa).', opcoes: [] },
    // a curadoria do LinePBX
    { nome: 'IP do cliente', tipo: 'texto', parte: CURADORIA, produto: 'linepbx', dica: 'O IP fixo de saída da rede do cliente.', opcoes: [] },
    { nome: 'Lista de ramais', tipo: 'texto_longo', parte: CURADORIA, produto: 'linepbx', dica: 'O ramal, o nome e o setor de cada um.', opcoes: [] },
    { nome: 'Usuários do callcenter', tipo: 'texto_longo', parte: CURADORIA, produto: 'linepbx', dica: 'Quem atende nas filas: o nome e o ramal.', opcoes: [] },
    { nome: 'Horário de atendimento', tipo: 'texto_longo', parte: CURADORIA, produto: 'linepbx', dica: 'Os dias e as horas, e o que tocar fora do horário.', opcoes: [] },
    { nome: 'Números da rota de entrada', tipo: 'texto_longo', parte: CURADORIA, produto: 'linepbx', dica: 'Os números que entram e para onde vai cada um.', opcoes: [] },
    { nome: 'Estrutura da URA', tipo: 'texto_longo', parte: CURADORIA, produto: 'linepbx', dica: 'As mensagens e as opções de cada menu.', opcoes: [] },
    // a configuração (a equipe técnica marca o que já fez)
    {
      nome: 'Configuração do ambiente', tipo: 'caixinhas', parte: CONFIGURACAO, produto: 'linechat', dica: 'Marque o que já foi feito.',
      opcoes: ['Criação dos usuários', 'Criação das equipes', 'Configuração dos chatbots', 'Configuração do horário de atendimento', 'Ativação dos números'],
    },
    { nome: 'Módulos a ativar', tipo: 'modulos', parte: CONFIGURACAO, produto: 'linechat', dica: 'Os módulos que o cliente contratou. No Validado, ficam ligados na ficha dele.', opcoes: [] },
    {
      nome: 'Configuração do ambiente', tipo: 'caixinhas', parte: CONFIGURACAO, produto: 'linepbx', dica: 'Marque o que já foi feito.',
      opcoes: [
        'Criação do ambiente', 'Asterisk - Configuração dos ramais', 'Asterisk - Configuração da rota de entrada', 'Asterisk - Configuração das URAs e filas',
        'Asterisk - Configuração do FHA', 'Asterisk - Alinhamento do tronco', 'LinePBX Web - Configuração dos usuários', 'LinePBX Web - Configuração das equipes',
        'LineReports - Instalação', 'Configuração dos telefones',
      ],
    },
    { nome: 'Módulos a ativar', tipo: 'modulos', parte: CONFIGURACAO, produto: 'linepbx', dica: 'Os módulos que o cliente contratou. No Validado, ficam ligados na ficha dele.', opcoes: [] },
    // os testes (o suporte confere antes de validar)
    {
      nome: 'Testes realizados', tipo: 'caixinhas', parte: TESTES, produto: 'linechat', dica: 'Marque o que já foi testado com o cliente.',
      opcoes: ['Login dos usuários', 'Mensagens entrando e saindo nos números', 'Chatbot respondendo', 'Horário de atendimento funcionando'],
    },
    {
      nome: 'Testes realizados', tipo: 'caixinhas', parte: TESTES, produto: 'linepbx', dica: 'Marque o que já foi testado com o cliente.',
      opcoes: ['Registro do ramal no ambiente do cliente', 'Login nos acessos do LinePBX Web', 'Ligações ativas e receptivas', 'IP do ambiente estável'],
    },
  ],
};

// =====================================================================
//  A NEGOCIAÇÃO QUE ABRE A IMPLANTAÇÃO
// =====================================================================

/** O cliente da implantação: um do cadastro (o da negociação, ou o achado pelo CNPJ) ou o que vai ser criado. */
export type ClienteDaImplantacao =
  | { tipo: 'cadastro'; id: string; nome: string; peloCnpj: boolean }
  | { tipo: 'novo'; nomeFantasia: string; razaoSocial: string; cnpj: string | null; erro: string | null };

/** O que acontece quando a negociação chega na etapa que abre a implantação — o que a janela mostra antes de mover. */
export type PlanoDaImplantacao = {
  painel: { id: string; nome: string; sigla: string };
  etapa: string;
  titulo: string;
  /** a negociação já abriu a implantação (e o card está fora da lixeira): nada acontece de novo */
  jaAberta: { codigo: string } | null;
  cliente: ClienteDaImplantacao;
  /** os produtos da negociação e se o cliente já os tem no cadastro (os que não tem entram, sem a data de ativação) */
  produtos: Array<{ id: string; nome: string; jaNoCadastro: boolean }>;
  /** o que falta para poder mover (o CNPJ do cliente que vai ser criado); nulo: pode */
  falta: string | null;
};

/** O cliente que a negociação pede (o da janela ou o que ela já tem): o nome fantasia, a razão social e o CNPJ escritos. */
export type PedidoDoCliente = { clienteId?: string | null; nomeFantasia?: string | null; razaoSocial?: string | null; cnpj?: string | null };

/** O título do card da implantação: "Implantação — Clínica Aurora". */
export const tituloDaImplantacao = (empresa: string) => `Implantação — ${empresa}`.slice(0, 200);

/**
 * O plano da implantação (o mesmo no servidor, na prévia e na janela): o cliente (o que a negociação já tem; senão, o do
 * CNPJ, se ele já está no cadastro; senão, o novo, com o que a pessoa escreveu ou o que a negociação tem), os produtos e o
 * card. O CNPJ é o que o cadastro exige: sem ele (ou com o dígito errado), a negociação não vai para a etapa.
 */
export function planoDaImplantacao(e: {
  painel: { id: string; nome: string; sigla: string; etapaDeEntrada: string | null };
  negociacao: { clienteId: string | null; clienteNome: string | null; empresa: string | null; cnpjDoCampo: string | null; produtos: Array<{ id: string; nome: string }> };
  /** o cliente do cadastro com o CNPJ pedido (nulo: nenhum) */
  clientePeloCnpj: { id: string; nome: string } | null;
  /** o cliente escolhido na janela (o "já está no cadastro") */
  clienteEscolhido?: { id: string; nome: string } | null;
  /** o cliente na lixeira com o CNPJ pedido (o CNPJ não repete no cadastro, nem com a lixeira) */
  clienteNaLixeira?: { nome: string } | null;
  /** os produtos que o cliente (o do cadastro) já tem, ativos ou não */
  produtosDoCliente: ReadonlySet<string>;
  jaAberta: { codigo: string } | null;
  pedido?: PedidoDoCliente;
}): PlanoDaImplantacao {
  const n = e.negociacao;
  let cliente: ClienteDaImplantacao;
  if (n.clienteId) cliente = { tipo: 'cadastro', id: n.clienteId, nome: n.clienteNome ?? '(cliente)', peloCnpj: false };
  else if (e.clienteEscolhido) cliente = { tipo: 'cadastro', id: e.clienteEscolhido.id, nome: e.clienteEscolhido.nome, peloCnpj: false };
  else if (e.clientePeloCnpj) cliente = { tipo: 'cadastro', id: e.clientePeloCnpj.id, nome: e.clientePeloCnpj.nome, peloCnpj: true };
  else {
    const nomeFantasia = (e.pedido?.nomeFantasia ?? '').trim() || (n.empresa ?? '').trim();
    const razaoSocial = (e.pedido?.razaoSocial ?? '').trim() || nomeFantasia;
    const bruto = (e.pedido?.cnpj ?? '').trim() || (n.cnpjDoCampo ?? '').trim();
    const cnpj = bruto ? cnpjLimpo(bruto) : null;
    const erro = nomeFantasia.length < 2 ? 'Escreva o nome do cliente.'
      : !cnpj ? 'Para criar o cliente, falta o CNPJ.'
        : !cnpjValido(cnpj) ? 'O CNPJ não confere (o dígito verificador): confira os números.'
          : e.clienteNaLixeira ? `Este CNPJ é do cliente ${e.clienteNaLixeira.nome}, que está na lixeira: restaure o cliente (Administração › Lixeira) e mova de novo.`
            : razaoSocial.length < 2 ? 'Escreva a razão social.'
              : null;
    cliente = { tipo: 'novo', nomeFantasia, razaoSocial, cnpj, erro };
  }
  const produtos = n.produtos.map((p) => ({ id: p.id, nome: p.nome, jaNoCadastro: cliente.tipo === 'cadastro' && e.produtosDoCliente.has(p.id) }));
  const empresa = cliente.tipo === 'cadastro' ? cliente.nome : cliente.nomeFantasia || 'o cliente novo';
  return {
    painel: { id: e.painel.id, nome: e.painel.nome, sigla: e.painel.sigla }, etapa: e.painel.etapaDeEntrada ?? '?',
    titulo: tituloDaImplantacao(empresa), jaAberta: e.jaAberta, cliente, produtos,
    falta: e.jaAberta ? null : cliente.tipo === 'novo' ? cliente.erro : null,
  };
}

// =====================================================================
//  O CARD QUE LIGA NO CADASTRO (o Validado)
// =====================================================================

/** O que o cliente já tem de um produto no cadastro: a data de ativação, se foi encerrado e os módulos ligados. */
export type AssinaturaNoCadastro = { ativadoEm: string | null; encerrado: boolean; modulosLigados: ReadonlySet<string> };

export type AcaoNoProduto = 'novo' | 'ativa' | 'ja_ativo' | 'encerrado';
export type AcaoNoModulo = 'liga' | 'ja_ligado' | 'sem_produto';
/** O que o card faz no cadastro ao chegar na etapa (o que a janela mostra antes de mover). */
export type PlanoDoCadastro = {
  etapa: string;
  /** o dia que vale como a ativação (AAAA-MM-DD, o de hoje) */
  dia: string;
  cliente: { id: string; nome: string } | null;
  /** `semData`: o produto não tem data de ativação (o Equipamentos: a data é a de cada aparelho) */
  produtos: Array<{ id: string; nome: string; acao: AcaoNoProduto; semData?: boolean }>;
  modulos: Array<{ id: string; nome: string; produtoId: string; produto: string; acao: AcaoNoModulo }>;
};

export const FRASE_DO_PRODUTO: Record<AcaoNoProduto, string> = {
  novo: 'entra no cadastro, ativo desde hoje',
  ativa: 'ganha a data de ativação (hoje)',
  ja_ativo: 'já está ativo: fica como está',
  encerrado: 'está encerrado no cadastro: fica como está (reative na ficha do cliente, se for o caso)',
};
export const FRASE_DO_MODULO: Record<AcaoNoModulo, string> = {
  liga: 'fica ligado, desde hoje',
  ja_ligado: 'já está ligado',
  sem_produto: 'fica de fora: o produto dele está encerrado no cadastro',
};

/**
 * O plano do cadastro: cada produto do card (o que o cliente não tem entra ativo desde hoje; o que entrou na implantação,
 * sem data, ganha a de hoje; o ativo fica; o encerrado fica — reativar é na ficha do cliente) e cada módulo marcado nos
 * campos "Módulos do produto" (liga desde hoje, se o produto dele está ativo depois disto).
 */
export function planoDoCadastro(e: {
  etapa: string; dia: string;
  cliente: { id: string; nome: string } | null;
  produtos: Array<{ id: string; nome: string; semData?: boolean }>;
  modulosMarcados: Array<{ id: string; nome: string; produtoId: string; produto: string }>;
  assinaturas: ReadonlyMap<string, AssinaturaNoCadastro>;
}): PlanoDoCadastro {
  if (!e.cliente) return { etapa: e.etapa, dia: e.dia, cliente: null, produtos: [], modulos: [] };
  const produtos = e.produtos.map((p) => {
    const a = e.assinaturas.get(p.id);
    // o produto sem data de ativação (o Equipamentos) que já está no cliente não tem o que ganhar
    const acao: AcaoNoProduto = !a ? 'novo' : a.encerrado ? 'encerrado' : a.ativadoEm || p.semData ? 'ja_ativo' : 'ativa';
    return { id: p.id, nome: p.nome, acao, ...(p.semData ? { semData: true } : {}) };
  });
  const ativosDepois = new Set([...produtos.filter((p) => p.acao !== 'encerrado').map((p) => p.id),
    ...[...e.assinaturas].filter(([, a]) => !a.encerrado).map(([id]) => id)]);
  const vistos = new Set<string>();
  const modulos = e.modulosMarcados.filter((m) => !vistos.has(m.id) && vistos.add(m.id)).map((m) => {
    const acao: AcaoNoModulo = !ativosDepois.has(m.produtoId) ? 'sem_produto' : e.assinaturas.get(m.produtoId)?.modulosLigados.has(m.id) ? 'ja_ligado' : 'liga';
    return { ...m, acao };
  });
  return { etapa: e.etapa, dia: e.dia, cliente: e.cliente, produtos, modulos };
}

/** O que a etapa faz ao chegar (a janela de antes de mover): abrir a implantação, ligar no cadastro, ou nada (os dois nulos). */
export type OQueAEtapaFaz = { implantacao: PlanoDaImplantacao | null; cadastro: PlanoDoCadastro | null };

/** O plano muda alguma coisa no cadastro? */
export const cadastroMuda = (p: PlanoDoCadastro) => p.produtos.some((x) => x.acao === 'novo' || x.acao === 'ativa') || p.modulos.some((m) => m.acao === 'liga');

/** Os módulos marcados no chamado: os campos "Módulos do produto" que aparecem nele, com as opções marcadas. */
export function modulosMarcados(
  campos: readonly CampoPersonalizado[], produtosDoChamado: readonly string[], valores: ValoresDosCampos | null | undefined,
  produtos: ReadonlyArray<{ id: string; nome: string }>,
): Array<{ id: string; nome: string; produtoId: string; produto: string }> {
  const out: Array<{ id: string; nome: string; produtoId: string; produto: string }> = [];
  for (const c of campos) {
    if (c.tipo !== 'modulos' || !c.produtoId || !campoAparece(c, produtosDoChamado)) continue;
    const v = valores?.[c.id];
    for (const id of Array.isArray(v) ? v : []) {
      const o = c.opcoes.find((x) => x.id === id);
      if (o) out.push({ id: o.id, nome: o.nome, produtoId: c.produtoId, produto: produtos.find((p) => p.id === c.produtoId)?.nome ?? '?' });
    }
  }
  return out;
}

