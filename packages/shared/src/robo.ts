/**
 * O ROBÔ DO LINECHAT ABRE O CHAMADO PELO MAPA (Patch 2.0.1, decisão 0047 revista).
 *
 * O bloco Webhook do robô do LineChat manda o JSON dele — o formato do Helena: `contact`, `session`,
 * `questions`, `menus`, `lastContactMessage`… —, e não o do Gestor. Em vez de o robô montar outro
 * JSON, o Gestor guarda um MAPA (Painéis › Ajustes › Integrações): cada campo do chamado é um texto
 * com as variáveis do pedido entre {{ }}, como "Atendimento de {{contact.name}}". O pedido do Luan:
 * "para que não tenha que ser algo bem fixo… até porque depois possa trocar". Trocar o robô (ou o
 * sistema que chama) é trocar o mapa, na tela.
 *
 *  - a variável é o caminho no JSON, com ponto: `contact.name`, `questions.<id>.answer`,
 *    `lastMessagesAggregated.files.0.url` (o número é a posição na lista, a partir do 0);
 *  - ou a pergunta pelo texto: `{{pergunta: o motivo do seu contato}}` (`{{menu: …}}` nos menus) — o
 *    código do bloco muda de uma cópia do robô para outra (a de teste e a de produção), o texto não;
 *  - ou um parâmetro do endereço do webhook: `{{endereço: setor}}` (de `…/entrada/robo?chave=…&setor=…`);
 *  - ou um PARÂMETRO do mapa, pelo nome: `{{empresa}}`. O pedido do Luan: "incluindo ou removendo
 *    parâmetros que vão chegar no webhook… na tela… e não a nível de código" — cada parâmetro tem um nome,
 *    a origem (qualquer uma das acima) e um exemplo; a tela mostra "como deve chegar o webhook" com eles;
 *  - `{{a || b || c}}` usa a primeira que vier com valor (quantas quiser); `{{a || "texto"}}` termina
 *    num texto fixo;
 *  - o campo cujas variáveis vieram todas vazias fica vazio: o título "Atendimento de " não nasce;
 *  - o pedido em lista (`[{…}]`, como o LineChat manda) vale pelo primeiro item.
 *
 * Daí, `resolverPedidoDoRobo` diz o chamado que nasce, com os dados do Gestor (os painéis, os assuntos,
 * os campos, os clientes): o servidor abre com ele, e a tela mostra "Como fica" com o mesmo resultado.
 * É leniente: o que não bate (o assunto que não existe, a opção que não é do campo, o telefone que não
 * é número) fica de fora e volta escrito em `ignorados` — o pedido do cliente não se perde por isso.
 *
 * A resposta ao robô (`respostaAoRobo`) é a que o bloco "Enviar webhook" do LineChat entende: sempre
 * 200 (o 201 ele conta como falha), com o "response" que escolhe a saída do bloco — CHAMADO_ABERTO,
 * com a mensagem ao cliente em "messages", ou CHAMADO_FALHOU.
 */
import { z } from 'zod';
import { numeroWhatsApp, paraBusca } from './formatos.js';
import { NOME_PRIORIDADE, PRIORIDADES, type Prioridade } from './atendimento-prazos.js';
import {
  caminhoDoAssunto, campoLigado, MAX_LETRAS_DO_CAMPO, normalizarValorDoCampo, procurarAssunto, textoDoValor,
  type Assunto, type CampoPersonalizado, type Painel, type ValorConferido, type ValorDoCampo,
} from './atendimento.js';

// =====================================================================
//  O MAPA
// =====================================================================

/** Uma variável no texto: {{caminho}}, {{ caminho }}, {{a || b}}. */
const VARIAVEL = /\{\{([^{}]*)\}\}/g;

/** Sem acento, maiúscula, pontuação nem emoji: "☎️ LinePBX: Plataforma" = "linepbx plataforma". */
const limpo = (s: string | null | undefined) => paraBusca(s).replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
/** A palavra (ou as palavras) inteira dentro do texto: "linepbx" está em "linepbx plataforma de voz", "line" não. */
const aparece = (nome: string, texto: string) => !!nome && ` ${texto} `.includes(` ${nome} `);

/** O que está errado num texto do mapa (a tela diz perto do campo); null = está bom. */
export function problemaDoModelo(texto: string): string | null {
  const variaveis = [...texto.matchAll(VARIAVEL)];
  const aberturas = texto.match(/\{\{/g)?.length ?? 0;
  const fechamentos = texto.match(/\}\}/g)?.length ?? 0;
  if (aberturas !== variaveis.length || fechamentos !== variaveis.length) return 'Feche cada variável: {{ e }} em volta do caminho, como {{contact.name}}.';
  if (variaveis.some((m) => m[1]!.split('||').some((p) => !p.trim()))) return 'Há uma variável vazia: escreva o caminho entre {{ e }}, como {{contact.name}}.';
  return null;
}

const Modelo = (max: number, padrao = '') => z.string().max(max, `Vai até ${max} letras.`)
  .superRefine((s, ctx) => { const p = problemaDoModelo(s); if (p) ctx.addIssue({ code: z.ZodIssueCode.custom, message: p }); })
  .default(padrao);

// =====================================================================
//  OS PARÂMETROS DO WEBHOOK (o que chega, com um nome)
// =====================================================================

/** Os nomes que já querem dizer outra coisa nos textos ({codigo}, {contato}) e nas origens (pergunta:, menu:, endereço:). */
const NOMES_RESERVADOS: ReadonlySet<string> = new Set(['codigo', 'contato', 'pergunta', 'menu', 'endereco']);
/** O nome de um parâmetro: letras, números, _ e - (vai entre {{ }} nos campos, como {{empresa}}). */
export const NOME_DE_PARAMETRO = /^[\p{L}\p{N}_-]{1,40}$/u;

/** O que está errado na origem de um parâmetro (a tela diz perto do campo); null = está boa. */
export function problemaDaOrigem(origem: string): string | null {
  const o = origem.trim();
  if (!o) return 'Diga de onde vem o parâmetro: o caminho (contact.name), a pergunta (pergunta: …) ou o endereço (endereço: setor).';
  if (/[{}]/.test(o)) return 'Escreva a origem sem {{ }}: só o que iria dentro, como contact.name ou pergunta: o motivo do seu contato.';
  if (o.split('||').some((x) => !x.trim())) return 'Há uma alternativa vazia: escreva a origem dos dois lados do ||.';
  // a chave do endereço nunca chega ao mapa (sai antes, para não ir parar no último pedido nem na auditoria)
  if (o.split('||').some((x) => { const e = POR_ENDERECO.exec(x.trim()); return !!e && paraBusca(e[1]!.trim()) === 'chave'; })) {
    return 'A chave do endereço não chega ao mapa (o Gestor nunca guarda a chave): use outro nome no endereço, como endereço: setor.';
  }
  return null;
}

/**
 * Um parâmetro do webhook: um nome curto para o que chega ("empresa"), a origem no pedido e um exemplo
 * (o "Como deve chegar o webhook" é montado com ele). A origem é o que iria entre {{ }}: o caminho no
 * JSON, a pergunta pelo texto, um parâmetro do endereço ou outro parâmetro, com alternativas (`a || b`)
 * e texto fixo no fim.
 */
export const ParametroDoRoboSchema = z.object({
  nome: z.string().trim()
    .regex(NOME_DE_PARAMETRO, 'O nome do parâmetro vai só com letras, números, _ e - (sem espaço nem ponto), como empresa ou motivo_do_contato.')
    .refine((n) => !NOMES_RESERVADOS.has(paraBusca(n)), 'Esse nome é reservado (codigo, contato, pergunta, menu, endereço): escolha outro.'),
  origem: z.string().max(1_000, 'A origem vai até 1000 letras.')
    .superRefine((o, ctx) => { const p = problemaDaOrigem(o); if (p) ctx.addIssue({ code: z.ZodIssueCode.custom, message: p }); })
    .transform((o) => o.trim()),
  exemplo: z.string().max(500, 'O exemplo vai até 500 letras.').default(''),
  descricao: z.string().trim().max(200, 'A descrição vai até 200 letras.').default(''),
});
export type ParametroDoRobo = z.infer<typeof ParametroDoRoboSchema>;
export type ParametroDoRoboEntrada = z.input<typeof ParametroDoRoboSchema>;

/** A mensagem de fábrica que volta ao cliente (o texto do Luan, 16/10/2026): {codigo} é o número do chamado. */
export const MENSAGEM_DO_ROBO_PADRAO = 'Seu chamado foi registrado com o número *{codigo}*. Guarde este número caso precise falar sobre ele depois.';

/** O mapa: de onde vem cada campo do chamado. Vazio = o campo não vem do robô. */
export const MapaDoRoboSchema = z.object({
  /** o painel em que o chamado nasce (o id); vazio = o primeiro ativo (o Suporte) */
  painel: z.string().trim().max(60).default(''),
  /** os parâmetros do webhook, com nome: vão nos campos como {{nome}} */
  parametros: z.array(ParametroDoRoboSchema).max(60, 'Parâmetros demais (até 60).')
    .superRefine((ps, ctx) => {
      const vistos = new Set<string>();
      ps.forEach((x, i) => {
        if (vistos.has(paraBusca(x.nome))) ctx.addIssue({ code: z.ZodIssueCode.custom, path: [i, 'nome'], message: `Há dois parâmetros chamados ${x.nome}: um nome para cada.` });
        vistos.add(paraBusca(x.nome));
      });
    })
    .default([]),
  titulo: Modelo(1_000),
  relato: Modelo(4_000),
  telefone: Modelo(1_000),
  nome: Modelo(1_000),
  sessaoId: Modelo(1_000),
  etiquetas: Modelo(1_000),
  descricao: Modelo(4_000),
  cliente: Modelo(1_000),
  assunto: Modelo(1_000),
  prioridade: Modelo(1_000),
  /** os campos do painel: o texto de cada um, pelo id do campo */
  campos: z.record(z.string().trim().min(1).max(60), Modelo(2_000))
    .refine((r) => Object.keys(r).length <= 60, 'Campos demais no mapa.')
    .default({}),
  /** a mensagem que volta ao cliente na resposta ao robô ({codigo} e as variáveis do pedido); vazia, não vai mensagem */
  mensagem: Modelo(2_000, MENSAGEM_DO_ROBO_PADRAO),
});
export type MapaDoRobo = z.infer<typeof MapaDoRoboSchema>;
export type MapaDoRoboEntrada = z.input<typeof MapaDoRoboSchema>;

/** Os campos do chamado que o mapa preenche (fora o painel e os campos do painel), na ordem da tela. */
export const CAMPOS_DO_MAPA = ['titulo', 'relato', 'telefone', 'nome', 'sessaoId', 'etiquetas', 'descricao', 'cliente', 'assunto', 'prioridade'] as const;
export type CampoDoMapa = (typeof CAMPOS_DO_MAPA)[number];
export const NOME_CAMPO_DO_MAPA: Record<CampoDoMapa, string> = {
  titulo: 'Título', relato: 'Relato do cliente', telefone: 'WhatsApp do contato', nome: 'Nome do contato', sessaoId: 'Conversa no LineChat',
  etiquetas: 'Etiquetas', descricao: 'Descrição', cliente: 'Cliente', assunto: 'Assunto', prioridade: 'Prioridade',
};
/** Os de várias linhas guardam as quebras de linha; os outros viram uma linha só. */
const VARIAS_LINHAS: ReadonlySet<CampoDoMapa> = new Set<CampoDoMapa>(['relato', 'descricao', 'etiquetas']);
/** O tamanho do que sai de cada campo (o do chamado). */
const LIMITE: Record<CampoDoMapa, number> = {
  titulo: 200, relato: 20_000, telefone: 60, nome: 120, sessaoId: 120, etiquetas: 2_000, descricao: 20_000, cliente: 200, assunto: 200, prioridade: 60,
};

/** Os parâmetros de fábrica: o que o robô do LineChat manda em todo pedido. */
const PARAMETROS_PADRAO: readonly ParametroDoRobo[] = Object.freeze([
  Object.freeze({ nome: 'nome', origem: 'contact.name', exemplo: 'Maria Souza', descricao: 'O nome do contato.' }),
  Object.freeze({ nome: 'whatsapp', origem: 'contact.phonenumber', exemplo: '+55|71999992010', descricao: 'O WhatsApp do contato (o Gestor arruma o "+55|").' }),
  Object.freeze({ nome: 'conversa', origem: 'sessionId', exemplo: '5f0c2a8e-1d2b-4c3a-9e10-000000000001', descricao: 'O id da conversa no LineChat.' }),
  Object.freeze({ nome: 'mensagem', origem: 'lastContactMessage', exemplo: 'As ligações de saída não completam desde cedo', descricao: 'A última mensagem do cliente.' }),
]);

/**
 * O mapa de fábrica: os parâmetros que o robô do LineChat manda em todo pedido (o nome, o WhatsApp, a
 * conversa, a última mensagem do cliente) e os campos com eles. As perguntas e os menus são de cada robô:
 * entram pela tela, como parâmetros novos.
 */
export const MAPA_DO_ROBO_PADRAO: Readonly<MapaDoRobo> = Object.freeze({
  painel: '',
  parametros: PARAMETROS_PADRAO as ParametroDoRobo[],
  titulo: 'Atendimento de {{nome}}',
  relato: '{{mensagem}}',
  telefone: '{{whatsapp}}',
  nome: '{{nome}}',
  sessaoId: '{{conversa}}',
  etiquetas: 'robô',
  descricao: '',
  cliente: '',
  assunto: '',
  prioridade: '',
  campos: Object.freeze({}) as Record<string, string>,
  mensagem: MENSAGEM_DO_ROBO_PADRAO,
});
/** Uma cópia do de fábrica, para mexer. */
export const mapaDeFabrica = (): MapaDoRobo => ({ ...MAPA_DO_ROBO_PADRAO, parametros: PARAMETROS_PADRAO.map((x) => ({ ...x })), campos: {} });

// =====================================================================
//  AS VARIÁVEIS DO PEDIDO
// =====================================================================

/** O pedido como o mapa lê: a lista (`[{…}]`, como o LineChat manda) vale pelo primeiro item; o texto com JSON é lido. */
export function corpoDoPedido(corpo: unknown): Record<string, unknown> {
  let c = corpo;
  if (typeof c === 'string') {
    try { c = JSON.parse(c); } catch { return {}; }
  }
  if (Array.isArray(c)) c = c.find((x) => x !== null && typeof x === 'object' && !Array.isArray(x));
  return c !== null && typeof c === 'object' && !Array.isArray(c) ? (c as Record<string, unknown>) : {};
}

/** O valor no caminho ("contact.name", "files.0.url"); `undefined` = não existe no pedido. */
export function valorNoCaminho(corpo: unknown, caminho: string): unknown {
  const partes = caminho.split('.').map((p) => p.trim());
  if (partes.some((p) => !p)) return undefined;
  let atual: unknown = corpo;
  for (const p of partes) {
    if (Array.isArray(atual)) {
      if (!/^\d{1,4}$/.test(p)) return undefined;
      atual = atual[Number(p)];
    } else if (atual !== null && typeof atual === 'object') {
      // só o que é do pedido (nunca o __proto__ e companhia)
      if (!Object.prototype.hasOwnProperty.call(atual, p)) return undefined;
      atual = (atual as Record<string, unknown>)[p];
    } else return undefined;
    if (atual === undefined) return undefined;
  }
  return atual;
}

/** A pergunta (ou o menu) pelo texto: "pergunta: o motivo do seu contato", "menu: …". */
const POR_TEXTO = /^(pergunta|menu)\s*:\s*([\s\S]*)$/i;
/** Um parâmetro do endereço do webhook: "endereço: setor" (de …/entrada/robo?setor=…). */
const POR_ENDERECO = /^endere[cç]o\s*:\s*([\s\S]*)$/i;
/** O texto fixo no lugar de uma referência: "sem empresa" (ou 'sem empresa'). */
const FIXO = /^(["'])([\s\S]*)\1$/;

/** O que mais vale na leitura do pedido: os parâmetros do mapa (pelo nome) e os do endereço do webhook. */
export type ContextoDoPedido = {
  parametros?: readonly ParametroDoRobo[];
  /** os parâmetros do endereço (?setor=…), sem a chave */
  endereco?: Readonly<Record<string, string>>;
};

/** Tem valor? (o vazio, o nulo e o que não veio, não) */
const comValor = (v: unknown) => textoDoPedido(v).trim() !== '';

/**
 * O valor de um parâmetro: a primeira alternativa da origem que vier com valor (o texto fixo no fim
 * vale). `null` = veio, mas vazio; `undefined` = nenhuma alternativa veio. Na origem dele, o próprio nome
 * é o caminho no JSON (o parâmetro "sessionId" com a origem "sessionId"), e não ele de novo.
 */
export function valorDoParametro(corpo: unknown, parametro: ParametroDoRobo, ctx: ContextoDoPedido = {}, nivel = 0): unknown {
  const semEle: ContextoDoPedido = { ...ctx, parametros: (ctx.parametros ?? []).filter((x) => paraBusca(x.nome) !== paraBusca(parametro.nome)) };
  let veio = false;
  for (const bruto of parametro.origem.split('||')) {
    const alternativa = bruto.trim();
    const fixo = FIXO.exec(alternativa);
    if (fixo) { if (fixo[2]!.trim()) return fixo[2]!.trim(); continue; }
    const v = valorDaReferencia(corpo, alternativa, semEle, nivel + 1);
    if (v !== undefined) veio = true;
    if (comValor(v)) return v;
  }
  return veio ? null : undefined;
}

/**
 * O valor de uma referência do mapa: um parâmetro do mapa pelo nome ("empresa"), um parâmetro do
 * endereço ("endereço: setor"), o caminho no JSON ("contact.name") ou a pergunta pelo texto ("pergunta:
 * Por favor nos informe brevemente o motivo do seu contato"; "menu: …" para os menus). Pelo texto, o mapa
 * vale para outra cópia do robô — a de teste e a de produção têm os blocos com outros códigos e as mesmas
 * perguntas: acha a pergunta de texto igual (sem ligar para acento, maiúscula e pontuação) ou, sem ela, a
 * única que contém o texto. `undefined` = não veio no pedido.
 */
export function valorDaReferencia(corpo: unknown, referencia: string, ctx: ContextoDoPedido = {}, nivel = 0): unknown {
  const ref = referencia.trim();
  // o parâmetro com esse nome (um parâmetro que aponta para outro vai até 4 voltas: o círculo para ali)
  const parametro = nivel < 4 ? ctx.parametros?.find((x) => paraBusca(x.nome) === paraBusca(ref)) : undefined;
  if (parametro) return valorDoParametro(corpo, parametro, ctx, nivel);
  const e = POR_ENDERECO.exec(ref);
  if (e) {
    const k = e[1]!.trim();
    const endereco = ctx.endereco ?? {};
    return k && Object.prototype.hasOwnProperty.call(endereco, k) ? endereco[k] : undefined;
  }
  const m = POR_TEXTO.exec(ref);
  if (!m) return valorNoCaminho(corpo, ref);
  const blocos = valorNoCaminho(corpo, paraBusca(m[1]) === 'menu' ? 'menus' : 'questions');
  const codigo = acharBloco(blocos, m[2]!);
  return codigo === null ? undefined : ((blocos as Record<string, Record<string, unknown>>)[codigo]!.answer ?? null);
}

/**
 * O bloco (a pergunta ou o menu) pelo texto, dentro de `questions` (ou `menus`): o de texto igual (sem
 * ligar para acento, maiúscula e pontuação) ou, sem ele, o único que contém o pedaço. O código do bloco
 * ("cb-…-qst-…"), ou null quando não acha um só.
 */
function acharBloco(blocos: unknown, texto: string): string | null {
  const alvo = limpo(texto);
  if (!alvo || blocos === null || typeof blocos !== 'object' || Array.isArray(blocos)) return null;
  const lista = Object.entries(blocos as Record<string, unknown>)
    .filter((e): e is [string, Record<string, unknown>] => e[1] !== null && typeof e[1] === 'object' && !Array.isArray(e[1]) && typeof (e[1] as Record<string, unknown>).text === 'string');
  const iguais = lista.filter(([, b]) => limpo(b.text as string) === alvo);
  const achados = iguais.length ? iguais : lista.filter(([, b]) => aparece(alvo, limpo(b.text as string)));
  return achados.length === 1 ? achados[0]![0] : null;
}

/** O valor como texto: a lista de textos vira "a, b"; o objeto, JSON; o nulo, vazio. */
export function textoDoPedido(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (Array.isArray(v) && v.every((x) => x === null || ['string', 'number', 'boolean'].includes(typeof x))) {
    return v.filter((x) => x !== null && String(x).trim()).map((x) => String(x).trim()).join(', ');
  }
  return JSON.stringify(v);
}

export type Preenchido = {
  texto: string;
  /** os caminhos que não existem no pedido (só os das variáveis que ficaram vazias: a tela avisa) */
  faltaram: string[];
};

/**
 * Troca as variáveis pelo valor do pedido. `{{a || b || c}}`: a primeira com valor; `"texto"` (ou
 * 'texto') no lugar de um caminho é texto fixo. O texto cujas variáveis vieram todas vazias fica vazio
 * (menos com `vazioSeTudoVazio: false`: a mensagem ao cliente não some por faltar o primeiro nome).
 */
export function preencherDoPedido(modelo: string, corpo: unknown, opcoes: { vazioSeTudoVazio?: boolean; contexto?: ContextoDoPedido } = {}): Preenchido {
  const faltaram: string[] = [];
  let variaveis = 0;
  let comValor = 0;
  const texto = modelo.replace(VARIAVEL, (_todo, dentro: string) => {
    variaveis++;
    const ausentes: string[] = [];
    for (const bruto of dentro.split('||')) {
      const opcao = bruto.trim();
      const fixo = FIXO.exec(opcao);
      const valor = fixo ? fixo[2]!.trim() : (() => {
        const v = valorDaReferencia(corpo, opcao, opcoes.contexto);
        if (v === undefined) ausentes.push(opcao.replace(/\s+/g, ' '));
        return textoDoPedido(v).trim();
      })();
      if (valor) { comValor++; return valor; }
    }
    for (const a of ausentes) if (a && !faltaram.includes(a)) faltaram.push(a);
    return '';
  });
  return { texto: (opcoes.vazioSeTudoVazio ?? true) && variaveis > 0 && comValor === 0 ? '' : texto, faltaram };
}

const cortar = (s: string, max: number) => (s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s);

/** O que o mapa tirou do pedido: o texto de cada campo (vazio = nada). */
export type PedidoDoRobo = Record<CampoDoMapa, string> & {
  painel: string;
  /** os campos do painel com texto, pelo id */
  campos: Record<string, string>;
  /** as variáveis que não vieram no pedido, por campo do mapa (o do painel: `campo:<id>`) */
  faltaram: Record<string, string[]>;
};

/**
 * Os itens de uma lista no texto do mapa (as etiquetas): separados por vírgula, ponto e vírgula ou linha
 * fora das {{ }} — a vírgula do texto de uma pergunta ({{pergunta: Por favor, nos informe…}}) não separa.
 */
function itensDaLista(modelo: string): string[] {
  const itens: string[] = [];
  let atual = '';
  let dentro = false;
  for (let i = 0; i < modelo.length; i++) {
    const c = modelo[i]!;
    if (c === '{' && modelo[i + 1] === '{' && !dentro) { dentro = true; atual += '{{'; i++; continue; }
    if (c === '}' && modelo[i + 1] === '}' && dentro) { dentro = false; atual += '}}'; i++; continue; }
    if (!dentro && (c === ',' || c === ';' || c === '\n')) { itens.push(atual); atual = ''; continue; }
    atual += c;
  }
  itens.push(atual);
  return itens;
}

/** Lê o pedido pelo mapa (com os parâmetros dele e os do endereço): o texto de cada campo, já no tamanho do chamado. */
export function aplicarMapaDoRobo(mapa: MapaDoRobo, corpoBruto: unknown, endereco: Readonly<Record<string, string>> = {}): PedidoDoRobo {
  const corpo = corpoDoPedido(corpoBruto);
  const contexto: ContextoDoPedido = { parametros: mapa.parametros ?? [], endereco };
  const faltaram: Record<string, string[]> = {};
  const anotar = (chave: string, refs: string[]) => {
    for (const r of refs) if (!(faltaram[chave] ??= []).includes(r)) faltaram[chave]!.push(r);
  };
  const ler = (chave: string, modelo: string, variasLinhas: boolean) => {
    const r = preencherDoPedido(modelo, corpo, { contexto });
    if (r.faltaram.length) anotar(chave, r.faltaram);
    const t = r.texto.replace(/\r\n?/g, '\n');
    return variasLinhas ? t.replace(/[ \t]+\n/g, '\n').trim() : t.replace(/\s+/g, ' ').trim();
  };
  // nas etiquetas, cada uma vale por si: "robô, {{setor}}" sem o setor fica "robô" (o "tudo vazio" é de cada etiqueta)
  const lerLista = (chave: string, modelo: string) => {
    const itens = itensDaLista(modelo).map((item) => preencherDoPedido(item, corpo, { contexto }));
    for (const r of itens) if (r.faltaram.length) anotar(chave, r.faltaram);
    return itens.map((r) => r.texto.replace(/\r\n?/g, '\n').replace(/[ \t]+/g, ' ').trim()).filter(Boolean).join(', ');
  };
  const textos = {} as Record<CampoDoMapa, string>;
  for (const c of CAMPOS_DO_MAPA) {
    const t = c === 'etiquetas' ? lerLista(c, mapa[c] ?? '') : ler(c, mapa[c] ?? '', VARIAS_LINHAS.has(c));
    // o id da conversa e o telefone não ganham reticências: cortados, continuam sendo o que são
    textos[c] = c === 'sessaoId' || c === 'telefone' ? t.slice(0, LIMITE[c]) : cortar(t, LIMITE[c]);
  }
  const campos: Record<string, string> = {};
  for (const [id, modelo] of Object.entries(mapa.campos ?? {})) {
    const t = ler(`campo:${id}`, modelo, true);
    if (t) campos[id] = cortar(t, MAX_LETRAS_DO_CAMPO.texto_longo + 100);
  }
  return { ...textos, painel: (mapa.painel ?? '').trim(), campos, faltaram };
}

/** Os grupos da lista de variáveis (o formato do LineChat; o que for de outro sistema cai em "o resto"). */
export const GRUPOS_DAS_VARIAVEIS = ['perguntas', 'menus', 'endereco', 'contato', 'conversa', 'mensagens', 'outras'] as const;
export type GrupoDaVariavel = (typeof GRUPOS_DAS_VARIAVEIS)[number];
export const NOME_GRUPO_DA_VARIAVEL: Record<GrupoDaVariavel, string> = {
  perguntas: 'As perguntas do robô', menus: 'Os menus do robô', endereco: 'O endereço do webhook (?…)', contato: 'O contato',
  conversa: 'A conversa e o canal', mensagens: 'As mensagens', outras: 'O resto do pedido',
};
const GRUPO_DA_CHAVE: Record<string, GrupoDaVariavel> = {
  questions: 'perguntas', menus: 'menus', contact: 'contato', sessionId: 'conversa', session: 'conversa', channel: 'conversa',
  lastContactMessage: 'mensagens', lastMessage: 'mensagens', lastMessagesAggregated: 'mensagens',
};

export type VariavelDoPedido = {
  caminho: string;
  /**
   * a mesma resposta pela pergunta ("pergunta: o motivo do seu contato"): só na resposta de pergunta ou
   * de menu cujo texto aparece uma vez só no pedido (o texto repetido não diria qual)
   */
  porTexto: string | null;
  /** o valor neste pedido, como texto (cortado, para mostrar) */
  valor: string;
  vazio: boolean;
  /** a pergunta (ou o menu) do robô: é como se reconhece a resposta ("o motivo do seu contato") */
  dica: string | null;
  grupo: GrupoDaVariavel;
};

/** Uma chave que dá para escrever no caminho (sem ponto, chave nem barra, e sem espaço nas pontas). */
const chaveEscrevivel = (k: string) => !!k && k === k.trim() && !/[.{}|]/.test(k);

/**
 * As variáveis que o pedido tem, para escolher na tela: cada valor com o caminho dele. A resposta de
 * uma pergunta (ou de um menu) do robô leva a pergunta como dica — o id do bloco ("cb-…-qst-…") não diz
 * nada a ninguém. As perguntas e os menus vêm primeiro.
 */
export function variaveisDoPedido(corpoBruto: unknown, limite = 400, endereco: Readonly<Record<string, string>> = {}): VariavelDoPedido[] {
  const corpo = corpoDoPedido(corpoBruto);
  const lista: VariavelDoPedido[] = [];
  // os parâmetros do endereço (?setor=…; a chave nunca chega até aqui)
  for (const [k, v] of Object.entries(endereco)) {
    const texto = String(v).replace(/\s+/g, ' ').trim();
    lista.push({ caminho: `endereço: ${k}`, porTexto: null, valor: cortar(texto, 160), vazio: !texto, dica: null, grupo: 'endereco' });
  }
  // os textos de pergunta (e de menu) que aparecem uma vez só: só eles acham a resposta pelo texto
  const unicos = new Map<string, Set<string>>();
  for (const grupo of ['questions', 'menus']) {
    const contagem = new Map<string, number>();
    const blocos = corpo[grupo];
    if (blocos !== null && typeof blocos === 'object' && !Array.isArray(blocos)) {
      for (const b of Object.values(blocos as Record<string, unknown>)) {
        const t = b !== null && typeof b === 'object' ? (b as Record<string, unknown>).text : null;
        if (typeof t === 'string' && limpo(t)) contagem.set(limpo(t), (contagem.get(limpo(t)) ?? 0) + 1);
      }
    }
    unicos.set(grupo, new Set([...contagem].filter(([, n]) => n === 1).map(([t]) => t)));
  }
  const pelaPergunta = (caminho: string[], pergunta: string | null): string | null => {
    const [grupo, , chave] = caminho;
    if (caminho.length !== 3 || chave !== 'answer' || pergunta === null || (grupo !== 'questions' && grupo !== 'menus')) return null;
    if (!unicos.get(grupo)!.has(limpo(pergunta))) return null;
    // as chaves e a barra não entram (são do jeito de escrever as variáveis); para achar, não fazem falta
    const texto = pergunta.replace(/[{}|]/g, ' ').replace(/\s+/g, ' ').trim();
    return texto ? `${grupo === 'menus' ? 'menu' : 'pergunta'}: ${texto}` : null;
  };
  const visitar = (v: unknown, caminho: string[], dica: string | null) => {
    if (lista.length >= limite || caminho.length > 8) return;
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
      const o = v as Record<string, unknown>;
      const pergunta = 'answer' in o && typeof o.text === 'string' ? o.text : null;
      for (const [k, filho] of Object.entries(o)) {
        if (!chaveEscrevivel(k) || (pergunta !== null && k === 'text')) continue;
        // na pergunta, fora a resposta, só o que veio preenchido (o "answerFile" vazio de toda pergunta é ruído)
        if (pergunta !== null && k !== 'answer' && (filho === null || filho === '')) continue;
        visitar(filho, [...caminho, k], pergunta ?? dica);
      }
      return;
    }
    if (Array.isArray(v) && v.some((x) => x !== null && typeof x === 'object')) {
      v.slice(0, 20).forEach((x, i) => visitar(x, [...caminho, String(i)], dica));
      return;
    }
    if (!caminho.length || (Array.isArray(v) && !v.length)) return;
    const texto = textoDoPedido(v).replace(/\s+/g, ' ').trim();
    lista.push({
      caminho: caminho.join('.'), porTexto: pelaPergunta(caminho, dica), valor: cortar(texto, 160), vazio: !texto,
      dica: dica ? cortar(dica.replace(/\s+/g, ' ').trim(), 160) : null, grupo: GRUPO_DA_CHAVE[caminho[0]!] ?? 'outras',
    });
  };
  visitar(corpo, [], null);
  const ordem = (g: GrupoDaVariavel) => GRUPOS_DAS_VARIAVEIS.indexOf(g);
  return lista.map((x, i) => ({ x, i })).sort((a, b) => ordem(a.x.grupo) - ordem(b.x.grupo) || a.i - b.i).map(({ x }) => x);
}

/** O pedido para guardar (o último do robô): os textos longos cortados, as listas e os objetos grandes encurtados. */
export function apararPedido(v: unknown, nivel = 0): unknown {
  if (typeof v === 'string') return v.length > 2_000 ? `${v.slice(0, 2_000)}…` : v;
  if (typeof v === 'number' || typeof v === 'boolean' || v === null) return v;
  if (typeof v !== 'object') return null;
  if (nivel >= 10) return '…';
  if (Array.isArray(v)) return v.slice(0, 50).map((x) => apararPedido(x, nivel + 1));
  const out: Record<string, unknown> = {};
  for (const [k, x] of Object.entries(v).slice(0, 200)) out[k] = apararPedido(x, nivel + 1);
  return out;
}

// =====================================================================
//  O CHAMADO QUE NASCE (o servidor abre com ele; a tela mostra "Como fica")
// =====================================================================

export type ClienteParaAchar = { id: string; nome: string; razao?: string | null; cnpj?: string | null };

/**
 * O cliente pelo que o robô mandou: o id, o CNPJ ou o nome (o fantasia ou a razão social, sem ligar
 * para acento, maiúscula e pontuação). Só quando bate com um cliente só: o nome que dois clientes têm
 * não é adivinhado.
 */
export function procurarCliente(clientes: readonly ClienteParaAchar[], texto: string): { ok: true; cliente: ClienteParaAchar } | { ok: false; erro: string } {
  const t = texto.trim();
  const porId = clientes.find((c) => c.id === t);
  if (porId) return { ok: true, cliente: porId };
  const digitos = t.replace(/\D/g, '');
  if (digitos.length === 14 && /^[\d.\-/\s]+$/.test(t)) {
    const c = clientes.find((x) => x.cnpj === digitos);
    if (c) return { ok: true, cliente: c };
  }
  const alvo = limpo(t);
  const achados = alvo ? clientes.filter((c) => limpo(c.nome) === alvo || (!!c.razao && limpo(c.razao) === alvo)) : [];
  if (achados.length === 1) return { ok: true, cliente: achados[0]! };
  return {
    ok: false,
    erro: achados.length > 1
      ? `Há ${achados.length} clientes chamados "${t}": o Gestor procura o cliente pelo WhatsApp do contato.`
      : `Não achei o cliente "${t}": o Gestor procura o cliente pelo WhatsApp do contato.`,
  };
}

/** "Alta", "média", "CRITICA", "🔴 Crítica (parou tudo)": a prioridade, ou null. */
export function lerPrioridade(texto: string): Prioridade | null {
  const alvo = limpo(texto);
  if (!alvo) return null;
  const exata = PRIORIDADES.find((p) => p === alvo || limpo(NOME_PRIORIDADE[p]) === alvo);
  if (exata) return exata;
  const noTexto = PRIORIDADES.filter((p) => aparece(p, alvo));
  return noTexto.length === 1 ? noTexto[0]! : null;
}

/**
 * O valor de um campo do painel pelo texto do robô: as regras de sempre (`normalizarValorDoCampo`) e,
 * na lista, a opção que aparece no texto — a resposta do menu vem enfeitada ("☎️ LinePBX: Plataforma
 * de Voz" é a opção LinePBX). Na lista de uma opção, só quando aparece uma só. O texto comprido demais
 * é cortado no tamanho do campo.
 */
export function valorParaOCampo(campo: CampoPersonalizado, texto: string): ValorConferido {
  const max = campo.tipo === 'texto' || campo.tipo === 'texto_longo' ? MAX_LETRAS_DO_CAMPO[campo.tipo] : 0;
  const t = max && texto.length > max ? cortar(texto, max) : texto;
  const direto = normalizarValorDoCampo(campo, t);
  if (direto.ok || (campo.tipo !== 'lista' && campo.tipo !== 'lista_varios')) return direto;
  const alvo = limpo(t);
  const achadas = campo.opcoes.filter((o) => o.ativa && aparece(limpo(o.nome), alvo));
  if (campo.tipo === 'lista' && achadas.length === 1) return { ok: true, valor: achadas[0]!.id };
  if (campo.tipo === 'lista_varios' && achadas.length) return { ok: true, valor: achadas.map((o) => o.id) };
  return direto;
}

/** O que o resolvedor precisa do Gestor: o servidor lê do banco; a prévia, da memória. */
export type DadosParaORobo = {
  paineis: readonly Painel[];
  assuntos: Assunto[];
  /** os campos de todos os painéis (os desativados também) */
  campos: readonly CampoPersonalizado[];
  /** os clientes fora da lixeira */
  clientes: readonly ClienteParaAchar[];
};

/** O chamado que o pedido abre. */
export type ChamadoDoRobo = {
  painel: { id: string; sigla: string; nome: string };
  titulo: string;
  relato: string | null;
  descricao: string | null;
  /** o WhatsApp, só os dígitos com o 55 */
  telefone: string | null;
  nome: string | null;
  sessaoId: string | null;
  /** o cliente pelo que o robô mandou (sem ele, o Gestor procura pelo WhatsApp, ao abrir) */
  cliente: { id: string; nome: string } | null;
  assunto: { id: string; caminho: string } | null;
  prioridade: Prioridade | null;
  etiquetas: string[];
  campos: Array<{ id: string; nome: string; valor: ValorDoCampo; texto: string }>;
  /** o que veio no pedido e ficou de fora, com o porquê */
  ignorados: string[];
};
export type ResolvidoDoRobo = { ok: true; chamado: ChamadoDoRobo } | { ok: false; erro: string };

/**
 * O chamado que o pedido (já lido pelo mapa) abre. Só não abre quando não há painel ativo ou quando o
 * mapa não tirou nada do pedido (nem título, nem relato, nem WhatsApp, nem conversa); o resto que não
 * bate fica de fora, escrito em `ignorados`.
 */
export function resolverPedidoDoRobo(p: PedidoDoRobo, g: DadosParaORobo): ResolvidoDoRobo {
  const ignorados: string[] = [];

  // o painel do mapa; o que saiu (ou foi desativado) dá lugar ao primeiro ativo: o pedido não se perde
  const primeiro = g.paineis.find((x) => x.ativo);
  if (!primeiro) return { ok: false, erro: 'Não há nenhum painel ativo para abrir o chamado.' };
  let painel = primeiro;
  if (p.painel) {
    const escolhido = g.paineis.find((x) => x.id === p.painel) ?? g.paineis.find((x) => x.sigla === p.painel.toUpperCase());
    if (escolhido?.ativo) painel = escolhido;
    else ignorados.push(escolhido ? `O painel ${escolhido.nome} está desativado: o chamado vai para o ${primeiro.nome}.` : `O painel do mapa não existe mais: o chamado vai para o ${primeiro.nome}.`);
  }

  if (!p.titulo && !p.relato && !p.telefone && !p.sessaoId) {
    return { ok: false, erro: 'O mapa do robô não tirou nada deste pedido: o título, o relato, o WhatsApp e a conversa vieram vazios. Confira o mapa em Painéis › Ajustes › Integrações.' };
  }

  let telefone: string | null = null;
  if (p.telefone) {
    telefone = numeroWhatsApp(p.telefone);
    if (!telefone) ignorados.push(`O WhatsApp "${p.telefone}" não é um número de telefone (DDD + número): ficou de fora.`);
  }

  let cliente: ChamadoDoRobo['cliente'] = null;
  if (p.cliente) {
    const r = procurarCliente(g.clientes, p.cliente);
    if (r.ok) cliente = { id: r.cliente.id, nome: r.cliente.nome };
    else ignorados.push(r.erro);
  }

  let assunto: ChamadoDoRobo['assunto'] = null;
  if (p.assunto) {
    if (!campoLigado(painel.ajustes, 'assunto')) ignorados.push(`O painel ${painel.nome} não usa assunto: "${p.assunto}" ficou de fora.`);
    else {
      const r = procurarAssunto(g.assuntos, painel, p.assunto);
      if (r.ok) assunto = { id: r.assunto.id, caminho: caminhoDoAssunto(r.assunto.id, g.assuntos) };
      else ignorados.push(r.erro.replace(/\.$/, ': ficou de fora.'));
    }
  }

  let prioridade: Prioridade | null = null;
  if (p.prioridade) {
    prioridade = lerPrioridade(p.prioridade);
    if (!prioridade) ignorados.push(`A prioridade "${p.prioridade}" não é Crítica, Alta, Média nem Baixa: ficou de fora.`);
  }

  // as etiquetas: separadas por vírgula, ponto e vírgula ou linha; sem repetir; até 40 letras cada, 20 no máximo
  const etiquetas: string[] = [];
  const vistas = new Set<string>();
  for (const bruta of p.etiquetas.split(/[,;\n]/)) {
    const e = bruta.replace(/\s+/g, ' ').trim().slice(0, 40).trim();
    if (!e || vistas.has(paraBusca(e))) continue;
    vistas.add(paraBusca(e));
    etiquetas.push(e);
  }
  if (etiquetas.length > 20) {
    ignorados.push(`Vieram ${etiquetas.length} etiquetas: ficaram as 20 primeiras.`);
    etiquetas.length = 20;
  }

  const campos: ChamadoDoRobo['campos'] = [];
  for (const [id, texto] of Object.entries(p.campos)) {
    const campo = g.campos.find((c) => c.id === id);
    if (!campo) { ignorados.push('Um campo do mapa não existe mais: ficou de fora.'); continue; }
    if (campo.painelId !== painel.id) { ignorados.push(`O campo ${campo.nome} não é do painel ${painel.nome}: ficou de fora.`); continue; }
    if (!campo.ativo) { ignorados.push(`O campo ${campo.nome} foi desativado no painel ${painel.nome}: ficou de fora.`); continue; }
    const r = valorParaOCampo(campo, texto);
    if (!r.ok) { ignorados.push(`${r.erro.replace(/[.\s]+$/, '')} — ficou de fora.`); continue; }
    if (r.valor === null) continue;
    campos.push({ id: campo.id, nome: campo.nome, valor: r.valor, texto: textoDoValor(campo, r.valor) });
  }

  const nome = p.nome || null;
  return {
    ok: true,
    chamado: {
      painel: { id: painel.id, sigla: painel.sigla, nome: painel.nome },
      titulo: p.titulo.length >= 3 ? p.titulo : nome ? `Atendimento de ${nome}` : 'Chamado pelo WhatsApp',
      relato: p.relato || null,
      descricao: p.descricao || null,
      telefone, nome, sessaoId: p.sessaoId || null,
      cliente, assunto, prioridade, etiquetas, campos, ignorados,
    },
  };
}

// =====================================================================
//  A RESPOSTA AO ROBÔ
// =====================================================================

/**
 * A mensagem que volta ao cliente: {codigo} (o número do chamado), {contato} (o nome do contato) e as
 * variáveis do pedido entre {{ }} — aqui sem a regra do "tudo vazio": a mensagem não some por faltar o
 * primeiro nome. O que sobra de uma variável vazia ("Olá, !") é arrumado.
 */
export function preencherMensagem(modelo: string, valores: { codigo: string; contato?: string | null }, corpo: unknown, contexto: ContextoDoPedido = {}): Preenchido {
  // {{codigo}} e {{contato}} (com as duas chaves, como as variáveis do pedido) também valem
  const marcadores = modelo.replace(/\{\{\s*(codigo|contato)\s*\}\}/gi, (_t, k: string) => `{${k.toLowerCase()}}`);
  const r = preencherDoPedido(marcadores, corpoDoPedido(corpo), { vazioSeTudoVazio: false, contexto });
  const texto = r.texto
    .replace(/\{codigo\}/g, valores.codigo)
    .replace(/\{contato\}/g, valores.contato?.trim() ?? '')
    .replace(/,\s*!/g, '!').replace(/\(\s*\)/g, '').replace(/[ \t]{2,}/g, ' ').replace(/ +([,.!?:;])/g, '$1')
    .trim();
  return { texto, faltaram: r.faltaram };
}
export const mensagemAoRobo = (modelo: string, valores: { codigo: string; contato?: string | null }, corpo: unknown, contexto: ContextoDoPedido = {}): string =>
  preencherMensagem(modelo, valores, corpo, contexto).texto;

/**
 * O que volta ao bloco "Enviar webhook" do LineChat — sempre com HTTP 200 (ele conta o 201 como falha).
 * O "response" escolhe a saída do bloco: CHAMADO_ABERTO (também quando a conversa já tinha chamado
 * aberto), com a mensagem ao cliente em "messages"; ou CHAMADO_FALHOU, quando não deu para abrir.
 */
export type RespostaAoRobo = { response: 'CHAMADO_ABERTO'; messages: Array<{ text: string }> } | { response: 'CHAMADO_FALHOU' };
export const respostaDoRoboQueFalhou = (): RespostaAoRobo => ({ response: 'CHAMADO_FALHOU' });
export function respostaAoRobo(
  mapa: Pick<MapaDoRobo, 'mensagem'> & Partial<Pick<MapaDoRobo, 'parametros'>>, chamado: { codigo: string; contato?: string | null }, corpo: unknown,
  endereco: Readonly<Record<string, string>> = {},
): RespostaAoRobo {
  const texto = mensagemAoRobo(mapa.mensagem ?? '', chamado, corpo, { parametros: mapa.parametros ?? [], endereco });
  return { response: 'CHAMADO_ABERTO', messages: texto ? [{ text: texto }] : [] };
}

/** O que não veio no pedido, para o último pedido e a auditoria: "Cliente: {{pergunta: …}}". */
export function oQueNaoVeio(faltaram: Record<string, string[]>, campos: ReadonlyArray<Pick<CampoPersonalizado, 'id' | 'nome'>>): string[] {
  return Object.entries(faltaram).map(([chave, refs]) => {
    const nome = chave.startsWith('campo:') ? campos.find((c) => c.id === chave.slice(6))?.nome ?? 'Um campo do painel'
      : NOME_CAMPO_DO_MAPA[chave as CampoDoMapa] ?? chave;
    return `${nome}: ${refs.map((r) => `{{${r}}}`).join(', ')}`;
  });
}

// =====================================================================
//  OS PARÂMETROS NA TELA (o que chega, o "Como deve chegar o webhook")
// =====================================================================

/**
 * Os parâmetros do endereço do webhook (?setor=…), do jeito que o mapa lê ({{endereço: setor}}): a
 * chave NUNCA entra (nem no último pedido); a lista vira "a, b"; até 50 parâmetros de 2000 letras.
 */
export function parametrosDoEndereco(query: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (query === null || typeof query !== 'object') return out;
  for (const [k, v] of Object.entries(query as Record<string, unknown>)) {
    if (Object.keys(out).length >= 50) break;
    if (!chaveEscrevivel(k) || paraBusca(k) === 'chave' || ['__proto__', 'constructor', 'prototype'].includes(k)) continue;
    const t = Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').join(', ') : typeof v === 'string' ? v : null;
    if (t !== null) out[k] = t.slice(0, 2_000);
  }
  return out;
}

/** Os parâmetros de um endereço colado (o que o LineChat chamou), sem a chave. */
export function parametrosDaUrl(url: string): Record<string, string> {
  try {
    const u = new URL(url.trim(), 'https://gestor.invalid');
    const q: Record<string, string[]> = {};
    for (const [k, v] of u.searchParams) (q[k] ??= []).push(v);
    return parametrosDoEndereco(Object.fromEntries(Object.entries(q).map(([k, v]) => [k, v.length === 1 ? v[0]! : v])));
  } catch { return {}; }
}

/** O parâmetro neste pedido: se veio e com que valor (a lista de parâmetros confere com o pedido de conferência). */
export function parametroNoPedido(parametro: ParametroDoRobo, corpoBruto: unknown, ctx: ContextoDoPedido = {}): { veio: boolean; valor: string } {
  const v = valorDoParametro(corpoDoPedido(corpoBruto), parametro, ctx);
  return { veio: v !== undefined, valor: textoDoPedido(v).replace(/\s+/g, ' ').trim() };
}

/** As referências de um texto do mapa (o que vai entre {{ }}, cada alternativa), sem os textos fixos. */
const referenciasDoTexto = (texto: string) =>
  [...texto.matchAll(VARIAVEL)].flatMap((m) => m[1]!.split('||').map((x) => x.trim())).filter((x) => x && !FIXO.test(x));

/** Quem usa o parâmetro: os campos do chamado (pelo nome que a tela mostra), a mensagem e os outros parâmetros. */
export function usosDoParametro(mapa: MapaDoRobo, nome: string, camposDoPainel: ReadonlyArray<Pick<CampoPersonalizado, 'id' | 'nome'>> = []): string[] {
  const alvo = paraBusca(nome);
  const usa = (t: string) => referenciasDoTexto(t).some((r) => paraBusca(r) === alvo);
  const out: string[] = [];
  for (const c of CAMPOS_DO_MAPA) if (usa(mapa[c] ?? '')) out.push(NOME_CAMPO_DO_MAPA[c]);
  for (const [id, t] of Object.entries(mapa.campos ?? {})) if (usa(t)) out.push(camposDoPainel.find((x) => x.id === id)?.nome ?? 'um campo do painel');
  if (usa(mapa.mensagem ?? '')) out.push('Mensagem ao cliente');
  for (const x of mapa.parametros ?? []) {
    if (paraBusca(x.nome) !== alvo && x.origem.split('||').some((a) => paraBusca(a.trim()) === alvo)) out.push(`o parâmetro ${x.nome}`);
  }
  return out;
}

/**
 * Renomeia o parâmetro e tudo o que o usa: os campos, a mensagem e a origem dos outros parâmetros (na
 * origem dele mesmo, o nome antigo é o caminho no JSON, e fica).
 */
export function renomearParametro(mapa: MapaDoRobo, de: string, para: string): MapaDoRobo {
  const alvo = paraBusca(de);
  const nasAlternativas = (dentro: string) => dentro.split('||').map((a) => (paraBusca(a.trim()) === alvo ? a.replace(a.trim(), para) : a)).join('||');
  const noTexto = (t: string) => t.replace(VARIAVEL, (_todo, dentro: string) => `{{${nasAlternativas(dentro)}}}`);
  const novo: MapaDoRobo = {
    ...mapa,
    campos: Object.fromEntries(Object.entries(mapa.campos ?? {}).map(([k, t]) => [k, noTexto(t)])),
    mensagem: noTexto(mapa.mensagem ?? ''),
    parametros: (mapa.parametros ?? []).map((x) => (paraBusca(x.nome) === alvo ? { ...x, nome: para } : { ...x, origem: nasAlternativas(x.origem) })),
  };
  for (const c of CAMPOS_DO_MAPA) novo[c] = noTexto(mapa[c] ?? '');
  return novo;
}

const PALAVRAS_VAZIAS: ReadonlySet<string> = new Set([
  'por', 'favor', 'nos', 'informe', 'informar', 'brevemente', 'qual', 'quais', 'dos', 'das', 'seu', 'sua', 'seus', 'suas', 'voce', 'que', 'para',
  'com', 'faz', 'parte', 'possamos', 'salvar', 'cadastro', 'escolha', 'escolher', 'certo', 'deseja', 'listei', 'algumas', 'opcoes', 'facilitar',
  'atendimento', 'digite', 'diga', 'sobre', 'mais', 'esta', 'este', 'isso', 'aqui', 'uma', 'pelo', 'pela', 'nas', 'aos', 'ola', 'obrigado',
]);

/**
 * Um nome para o parâmetro novo, tirado da pergunta ("…o motivo do seu contato" → motivo_contato) ou do
 * caminho (contact.empresa → empresa), sem repetir os que já existem. É só a sugestão: a pessoa troca.
 */
export function sugerirNomeDoParametro(v: Pick<VariavelDoPedido, 'caminho' | 'dica'>, existentes: readonly string[]): string {
  let base = v.dica ? limpo(v.dica).split(' ').filter((w) => w.length > 2 && !PALAVRAS_VAZIAS.has(w)).slice(0, 3).join('_') : '';
  if (!base) {
    const e = POR_ENDERECO.exec(v.caminho);
    const partes = v.caminho.split('.').filter((x) => !/^\d+$/.test(x));
    const ultimo = e ? e[1]!.trim() : partes.at(-1) === 'answer' ? (partes[0] === 'menus' ? 'resposta_do_menu' : 'resposta') : partes.at(-1) ?? '';
    base = paraBusca(ultimo).replace(/[^\p{L}\p{N}_-]+/gu, '_').replace(/^_+|_+$/g, '');
  }
  base = (base || 'parametro').slice(0, 34);
  if (NOMES_RESERVADOS.has(base)) base = `${base}_1`;
  const usados = new Set(existentes.map((x) => paraBusca(x)));
  let nome = base;
  for (let n = 2; usados.has(paraBusca(nome)); n++) nome = `${base}_${n}`;
  return nome;
}

/** Põe o valor no caminho ("contact.name", "files.0.url"), criando o que falta (o número é posição de lista). */
function porNoCaminho(alvo: Record<string, unknown>, caminho: string, valor: unknown) {
  const partes = caminho.split('.').map((x) => x.trim()).filter(Boolean);
  if (!partes.length || partes.some((x) => ['__proto__', 'constructor', 'prototype'].includes(x))) return;
  let atual: Record<string, unknown> | unknown[] = alvo;
  partes.forEach((parte, i) => {
    const chave: string | number = Array.isArray(atual) ? Number(parte) : parte;
    const lugar = atual as Record<string | number, unknown>;
    if (i === partes.length - 1) { if (lugar[chave] === undefined) lugar[chave] = valor; return; }
    if (lugar[chave] === null || typeof lugar[chave] !== 'object') lugar[chave] = /^\d+$/.test(partes[i + 1]!) ? [] : {};
    atual = lugar[chave] as Record<string, unknown> | unknown[];
  });
}

/** Onde o Gestor lê no pedido: o caminho (as chaves, de fora para dentro), quem lê e se veio neste pedido. */
export type MarcaDoPedido = {
  caminho: string[];
  /** quem lê: o parâmetro ("{{nome}}") ou o campo que lê direto do pedido ("Título") */
  quem: string[];
  /** `false` = não veio neste pedido: o valor é o exemplo do parâmetro, no lugar onde ele deve chegar */
  veio: boolean;
};
/** Um parâmetro do endereço do webhook (?setor=…): o valor deste pedido (ou o exemplo, se não veio) e quem lê. */
export type ParametroNoEndereco = { chave: string; valor: string; quem: string[]; veio: boolean };
export type PedidoEsperado = {
  /** o pedido no formato do LineChat (o objeto que vai dentro da lista `[…]`) */
  corpo: Record<string, unknown>;
  endereco: ParametroNoEndereco[];
  marcas: MarcaDoPedido[];
  /** o que os campos leem e não existe no pedido nem é parâmetro (um caminho escrito errado, um parâmetro que saiu) */
  fora: Array<{ referencia: string; onde: string[] }>;
};

/** O código de um bloco que não veio no pedido: no robô, cada bloco tem o seu ("cb-…-qst-…"). */
const codigoQueFalta = (grupo: 'questions' | 'menus', existentes: Record<string, unknown>) => {
  const base = grupo === 'menus' ? 'cb-…-mn-…' : 'cb-…-qst-…';
  let codigo = base;
  for (let n = 2; codigo in existentes; n++) codigo = `${base} (${n})`;
  return codigo;
};

/**
 * "Como deve chegar o webhook": o pedido de conferência (o último do robô, o fictício ou o colado), no
 * formato em que o LineChat manda, com cada lugar que o Gestor lê marcado — por um parâmetro ou por um
 * campo que lê direto. O parâmetro que não veio entra no lugar dele, com o exemplo, e a marca diz que não
 * veio: é ali que ele deve chegar. A pergunta (e o menu) pelo texto vai no bloco de verdade, quando o
 * pedido tem; sem ele, num bloco com o código por preencher ("cb-…-qst-…"). O que um campo lê e não
 * existe no pedido — um caminho escrito errado, um parâmetro que saiu — não é inventado: vai em `fora`.
 */
export function pedidoEsperado(
  mapa: MapaDoRobo, amostra: unknown, enderecoDaAmostra: Readonly<Record<string, string>> = {},
  camposDoPainel: ReadonlyArray<Pick<CampoPersonalizado, 'id' | 'nome'>> = [],
): PedidoEsperado {
  const corpo = JSON.parse(JSON.stringify(corpoDoPedido(amostra))) as Record<string, unknown>;
  const nomes = new Set((mapa.parametros ?? []).map((x) => paraBusca(x.nome)));
  const marcas: MarcaDoPedido[] = [];
  const endereco: ParametroNoEndereco[] = [];
  const fora: Array<{ referencia: string; onde: string[] }> = [];
  /** os lugares que não vieram e foram postos aqui (com o exemplo) */
  const postos = new Set<string>();
  const junto = (caminho: readonly string[]) => caminho.join('\u001f');

  const marcar = (caminho: string[], quem: string) => {
    const k = junto(caminho);
    const ja = marcas.find((x) => junto(x.caminho) === k);
    if (ja) { if (!ja.quem.includes(quem)) ja.quem.push(quem); return; }
    marcas.push({ caminho, quem: [quem], veio: !postos.has(k) });
  };
  /**
   * Uma referência de um parâmetro (ou de um campo): marca onde ela lê. `exemplo` diz o que fazer se não
   * vier — `string`: pôr no lugar, com ele (a primeira origem de um parâmetro); `null`: só a pergunta, o
   * menu e o endereço entram (o campo que lê direto); `undefined`: nada (uma alternativa).
   */
  const ler = (referencia: string, quem: string, exemplo: string | null | undefined, proprio = '') => {
    const ref = referencia.trim();
    // o outro parâmetro é marcado por ele mesmo; o próprio nome, na origem dele, é o caminho no JSON (sessionId → sessionId)
    if (!ref || FIXO.test(ref) || (nomes.has(paraBusca(ref)) && paraBusca(ref) !== paraBusca(proprio))) return;
    const e = POR_ENDERECO.exec(ref);
    if (e) {
      const k = e[1]!.trim();
      if (!k || paraBusca(k) === 'chave') return;
      const ja = endereco.find((x) => x.chave === k);
      if (ja) { if (!ja.quem.includes(quem)) ja.quem.push(quem); return; }
      if (Object.prototype.hasOwnProperty.call(enderecoDaAmostra, k)) endereco.push({ chave: k, valor: enderecoDaAmostra[k]!, quem: [quem], veio: true });
      else if (exemplo !== undefined) endereco.push({ chave: k, valor: exemplo || `<${k}>`, quem: [quem], veio: false });
      return;
    }
    const m = POR_TEXTO.exec(ref);
    if (m) {
      const grupo = paraBusca(m[1]) === 'menu' ? 'menus' : 'questions';
      const texto = m[2]!.replace(/\s+/g, ' ').trim();
      let codigo = acharBloco(corpo[grupo], texto);
      if (codigo === null) {
        if (exemplo === undefined || !limpo(texto)) return;
        if (corpo[grupo] === null || typeof corpo[grupo] !== 'object' || Array.isArray(corpo[grupo])) corpo[grupo] = {};
        const blocos = corpo[grupo] as Record<string, unknown>;
        codigo = codigoQueFalta(grupo, blocos);
        blocos[codigo] = { text: texto, answer: exemplo || '…', answerFile: null };
        postos.add(junto([grupo, codigo, 'answer']));
      }
      marcar([grupo, codigo, 'answer'], quem);
      return;
    }
    const partes = ref.split('.').map((x) => x.trim());
    if (partes.some((x) => !x)) return;
    if (valorNoCaminho(corpo, ref) === undefined) {
      if (typeof exemplo !== 'string') {
        if (exemplo === null) {
          const ja = fora.find((x) => x.referencia === ref);
          if (ja) { if (!ja.onde.includes(quem)) ja.onde.push(quem); } else fora.push({ referencia: ref, onde: [quem] });
        }
        return;
      }
      porNoCaminho(corpo, ref, exemplo || '…');
      if (valorNoCaminho(corpo, ref) === undefined) return;
      postos.add(junto(partes));
    }
    marcar(partes, quem);
  };

  // os parâmetros: a primeira origem é onde ele deve chegar; as outras (o "se não vier") só se vieram
  for (const p of mapa.parametros ?? []) {
    p.origem.split('||').forEach((alternativa, i) => ler(alternativa, `{{${p.nome}}}`, i === 0 ? p.exemplo : undefined, p.nome));
  }
  // o que os campos (e a mensagem) leem direto do pedido, sem parâmetro
  const textos: Array<[string, string]> = [
    ...CAMPOS_DO_MAPA.map((c): [string, string] => [NOME_CAMPO_DO_MAPA[c], mapa[c] ?? '']),
    ...Object.entries(mapa.campos ?? {}).map(([id, t]): [string, string] => [camposDoPainel.find((x) => x.id === id)?.nome ?? 'Um campo do painel', t]),
    ['Mensagem ao cliente', mapa.mensagem ?? ''],
  ];
  for (const [onde, texto] of textos) {
    for (const v of texto.matchAll(VARIAVEL)) v[1]!.split('||').forEach((alternativa, i) => ler(alternativa, onde, i === 0 ? null : undefined));
  }
  return { corpo, endereco, marcas, fora };
}

/** Uma linha do JSON do "Como deve chegar o webhook": o texto (já com o recuo), a marca e se é um pedaço recolhido. */
export type LinhaDoPedido = { recuo: number; texto: string; marca: MarcaDoPedido | null; recolhido: boolean };

/**
 * O pedido em linhas, como o LineChat manda (dentro de `[…]`), para a tela marcar o que o Gestor lê: o
 * que tem uma marca dentro aparece aberto; o resto que é objeto ou lista fica recolhido ({ … }); dentro de
 * um objeto grande (o contato tem uns 15 dados), 3 ou mais seguidos sem marca viram "… e mais N" — as
 * chaves de fora (o formato do pedido) aparecem todas. O texto longo é cortado na tela (o Copiar leva o
 * JSON inteiro).
 */
export function linhasDoPedido(corpo: Record<string, unknown>, marcas: readonly MarcaDoPedido[], maxTexto = 80): LinhaDoPedido[] {
  const junto = (caminho: readonly string[]) => caminho.join('\u001f');
  const porCaminho = new Map(marcas.map((x) => [junto(x.caminho), x]));
  const temDentro = (caminho: readonly string[]) => {
    const k = `${junto(caminho)}\u001f`;
    return marcas.some((x) => junto(x.caminho).startsWith(k));
  };
  const valor = (v: unknown) => JSON.stringify(typeof v === 'string' && v.length > maxTexto ? `${v.slice(0, maxTexto - 1).trimEnd()}…` : v);
  const linhas: LinhaDoPedido[] = [];
  const visitar = (v: unknown, caminho: string[], recuo: number, rotulo: string, virgula: string) => {
    const marca = caminho.length ? porCaminho.get(junto(caminho)) ?? null : null;
    if (v !== null && typeof v === 'object') {
      const lista = Array.isArray(v);
      const filhos: Array<[string, unknown]> = lista ? (v as unknown[]).map((x, i) => [String(i), x]) : Object.entries(v as Record<string, unknown>);
      const [abre, fecha] = lista ? ['[', ']'] : ['{', '}'];
      if (!filhos.length) { linhas.push({ recuo, texto: `${rotulo}${abre}${fecha}${virgula}`, marca, recolhido: false }); return; }
      if (caminho.length && !marca && !temDentro(caminho)) { linhas.push({ recuo, texto: `${rotulo}${abre} … ${fecha}${virgula}`, marca: null, recolhido: true }); return; }
      linhas.push({ recuo, texto: `${rotulo}${abre}`, marca, recolhido: false });
      const filho = (i: number) => {
        const [k, x] = filhos[i]!;
        visitar(x, [...caminho, k], recuo + 1, lista ? '' : `${JSON.stringify(k)}: `, i < filhos.length - 1 ? ',' : '');
      };
      if (caminho.length && filhos.length > 6) {
        let seguidos: number[] = [];
        const soltar = () => {
          if (seguidos.length >= 3) linhas.push({ recuo: recuo + 1, texto: `… e mais ${seguidos.length}`, marca: null, recolhido: true });
          else seguidos.forEach(filho);
          seguidos = [];
        };
        filhos.forEach(([k], i) => {
          const c = [...caminho, k];
          if (porCaminho.has(junto(c)) || temDentro(c)) { soltar(); filho(i); } else seguidos.push(i);
        });
        soltar();
      } else filhos.forEach((_, i) => filho(i));
      linhas.push({ recuo, texto: `${fecha}${virgula}`, marca: null, recolhido: false });
      return;
    }
    linhas.push({ recuo, texto: `${rotulo}${valor(v)}${virgula}`, marca, recolhido: false });
  };
  linhas.push({ recuo: 0, texto: '[', marca: null, recolhido: false });
  visitar(corpo, [], 1, '', '');
  linhas.push({ recuo: 0, texto: ']', marca: null, recolhido: false });
  return linhas;
}

// =====================================================================
//  A TELA
// =====================================================================

/** O último pedido do robô: guardado para o mapa mostrar as variáveis de verdade (e o que aconteceu). */
export type UltimoPedidoDoRobo = {
  em: string;
  /** o nome da chave que chamou (o nome, nunca a chave) */
  chave: string;
  /** o pedido como chegou (os textos longos cortados) */
  corpo: unknown;
  /** os parâmetros do endereço (?setor=…), sem a chave */
  endereco?: Record<string, string>;
  /** `faltaram`: as variáveis do mapa que não vieram neste pedido ("Cliente: {{pergunta: …}}") */
  resultado:
    | { ok: true; criado: boolean; anotou: boolean; codigo: string; ignorados: string[]; faltaram?: string[] }
    | { ok: false; erro: string; faltaram?: string[] };
};
export type RoboTela = { mapa: MapaDoRobo; ultimo: UltimoPedidoDoRobo | null };

/** "Como fica": o chamado que o pedido abriria com o mapa (sem abrir nada). */
export type PreviaDoRobo = {
  resolvido: ResolvidoDoRobo;
  /** a conversa já tem um chamado aberto: um pedido dela agora viraria anotação nele */
  aberto: { codigo: string; titulo: string } | null;
};
export const ExperimentarRoboSchema = z.object({
  mapa: MapaDoRoboSchema,
  corpo: z.unknown(),
  /** os parâmetros do endereço do pedido de conferência (?setor=…) */
  endereco: z.record(z.string().max(100), z.string().max(2_000)).refine((r) => Object.keys(r).length <= 50, 'Parâmetros demais no endereço.').default({}),
});

/**
 * O pedido fictício (a tela chama assim): no formato que o robô do LineChat manda (o do Helena), para
 * conferir o mapa antes do primeiro pedido de verdade. Os ids das perguntas e dos menus são inventados:
 * os do seu robô aparecem no último pedido (ou no pedido que você colar).
 */
export const EXEMPLO_DO_LINECHAT: unknown = [{
  responseKeys: [],
  companyId: '00000000-0000-4000-8000-0000000000c0',
  sessionId: '5f0c2a8e-1d2b-4c3a-9e10-000000000001',
  callbackUrl: null,
  callbackId: null,
  session: {
    id: '5f0c2a8e-1d2b-4c3a-9e10-000000000001', createdAt: '2026-10-16T13:05:12.000Z', departmentId: '00000000-0000-4000-8000-0000000000d1',
    userId: '00000000-0000-0000-0000-000000000000', number: '2026101600012', utm: null,
  },
  channel: { id: '00000000-0000-4000-8000-0000000000a1', key: '557130348350', platform: 'WhatsApp', displayName: '(71) 3034-8350' },
  contact: {
    id: '00000000-0000-4000-8000-0000000000b7', name: 'Maria Souza', 'first-name': 'Maria', phonenumber: '+55|71999992010',
    'display-phonenumber': '(71) 99999-2010', email: null, instagram: null, tags: null, annotation: null, metadata: {},
    origin: 'CREATED_FROM_HUB', empresa: 'Clínica Aurora', 'imported-at': null, 'name-whatsapp': 'Maria Souza',
    'name-instagram': null, 'name-messenger': null, 'motivo-de-contato': 'As ligações de saída não completam desde cedo',
  },
  questions: {
    'cb-exemplo-qst-empresa': { text: 'Por favor, nos informe a empresa que você faz parte, para que possamos salvar em seu cadastro:', answer: 'Clínica Aurora', answerFile: null },
    'cb-exemplo-qst-motivo': { text: 'Por favor nos informe brevemente o motivo do seu contato', answer: 'As ligações de saída não completam desde cedo', answerFile: null },
  },
  menus: {
    'cb-exemplo-mn-setor': { text: 'Para facilitar seu atendimento, listei algumas opções. Escolha uma:', answer: 'Suporte Técnico', answerFile: null },
    'cb-exemplo-mn-solucao': { text: 'Certo! Por favor, escolha para qual solução você deseja atendimento:', answer: '☎️ LinePBX: Plataforma de Voz', answerFile: null },
  },
  templates: {},
  metadata: {},
  lastContactMessage: 'As ligações de saída não completam desde cedo',
  lastMessage: { type: 'TEXT', text: 'As ligações de saída não completam desde cedo', origin: 'CONTACT', createdAt: '2026-10-16T13:06:40.000Z' },
  lastMessagesAggregated: { text: 'As ligações de saída não completam desde cedo', files: [] },
  senderId: null,
}];
