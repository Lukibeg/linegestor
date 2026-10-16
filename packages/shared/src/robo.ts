/**
 * O ROBÔ DO LINECHAT ABRE O CHAMADO PELO MAPA (Patch 2.0.1, decisão 0047 revista).
 *
 * O bloco Webhook do robô do LineChat manda o JSON dele — o formato do Helena: `contact`, `session`,
 * `questions`, `menus`, `lastContactMessage`… —, e não o do Gestor. Em vez de o robô montar outro
 * JSON, o Gestor guarda um MAPA (Chamados › Ajustes › Integrações): cada campo do chamado é um texto
 * com as variáveis do pedido entre {{ }}, como "Atendimento de {{contact.name}}". O pedido do Luan:
 * "para que não tenha que ser algo bem fixo… até porque depois possa trocar". Trocar o robô (ou o
 * sistema que chama) é trocar o mapa, na tela.
 *
 *  - a variável é o caminho no JSON, com ponto: `contact.name`, `questions.<id>.answer`,
 *    `lastMessagesAggregated.files.0.url` (o número é a posição na lista, a partir do 0);
 *  - `{{a || b}}` usa a primeira que vier com valor; `{{a || "texto"}}` termina num texto fixo;
 *  - o campo cujas variáveis vieram todas vazias fica vazio: o título "Atendimento de " não nasce;
 *  - o pedido em lista (`[{…}]`, como o LineChat manda) vale pelo primeiro item.
 *
 * Daí, `resolverPedidoDoRobo` diz o chamado que nasce, com os dados do Gestor (os painéis, os assuntos,
 * os campos, os clientes): o servidor abre com ele, e a tela mostra "Como fica" com o mesmo resultado.
 * É leniente: o que não bate (o assunto que não existe, a opção que não é do campo, o telefone que não
 * é número) fica de fora e volta escrito em `ignorados` — o pedido do cliente não se perde por isso.
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

/** O que está errado num texto do mapa (a tela diz perto do campo); null = está bom. */
export function problemaDoModelo(texto: string): string | null {
  const variaveis = [...texto.matchAll(VARIAVEL)];
  const aberturas = texto.match(/\{\{/g)?.length ?? 0;
  const fechamentos = texto.match(/\}\}/g)?.length ?? 0;
  if (aberturas !== variaveis.length || fechamentos !== variaveis.length) return 'Feche cada variável: {{ e }} em volta do caminho, como {{contact.name}}.';
  if (variaveis.some((m) => m[1]!.split('||').some((p) => !p.trim()))) return 'Há uma variável vazia: escreva o caminho entre {{ e }}, como {{contact.name}}.';
  return null;
}

const Modelo = (max: number) => z.string().max(max, `Vai até ${max} letras.`)
  .superRefine((s, ctx) => { const p = problemaDoModelo(s); if (p) ctx.addIssue({ code: z.ZodIssueCode.custom, message: p }); })
  .default('');

/** O mapa: de onde vem cada campo do chamado. Vazio = o campo não vem do robô. */
export const MapaDoRoboSchema = z.object({
  /** o painel em que o chamado nasce (o id); vazio = o primeiro ativo (o Suporte) */
  painel: z.string().trim().max(60).default(''),
  titulo: Modelo(400),
  relato: Modelo(2_000),
  telefone: Modelo(300),
  nome: Modelo(300),
  sessaoId: Modelo(300),
  etiquetas: Modelo(600),
  descricao: Modelo(2_000),
  cliente: Modelo(300),
  assunto: Modelo(300),
  prioridade: Modelo(300),
  /** os campos do painel: o texto de cada um, pelo id do campo */
  campos: z.record(z.string().trim().min(1).max(60), Modelo(1_000))
    .refine((r) => Object.keys(r).length <= 60, 'Campos demais no mapa.')
    .default({}),
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

/**
 * O mapa de fábrica: o que o robô do LineChat manda em todo pedido (o nome, o WhatsApp, a conversa, a
 * última mensagem do cliente). As perguntas e os menus têm o id de cada robô: entram pela tela.
 */
export const MAPA_DO_ROBO_PADRAO: Readonly<MapaDoRobo> = Object.freeze({
  painel: '',
  titulo: 'Atendimento de {{contact.name}}',
  relato: '{{lastContactMessage}}',
  telefone: '{{contact.phonenumber}}',
  nome: '{{contact.name}}',
  sessaoId: '{{sessionId}}',
  etiquetas: 'robô',
  descricao: '',
  cliente: '',
  assunto: '',
  prioridade: '',
  campos: Object.freeze({}) as Record<string, string>,
});
/** Uma cópia do de fábrica, para mexer. */
export const mapaDeFabrica = (): MapaDoRobo => ({ ...MAPA_DO_ROBO_PADRAO, campos: {} });

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
 * Troca as variáveis pelo valor do pedido. `{{a || b}}`: a primeira com valor; `"texto"` (ou 'texto')
 * no lugar de um caminho é texto fixo. O texto cujas variáveis vieram todas vazias fica vazio.
 */
export function preencherDoPedido(modelo: string, corpo: unknown): Preenchido {
  const faltaram: string[] = [];
  let variaveis = 0;
  let comValor = 0;
  const texto = modelo.replace(VARIAVEL, (_todo, dentro: string) => {
    variaveis++;
    const ausentes: string[] = [];
    for (const bruto of dentro.split('||')) {
      const opcao = bruto.trim();
      const fixo = /^(["'])([\s\S]*)\1$/.exec(opcao);
      const valor = fixo ? fixo[2]!.trim() : (() => {
        const v = valorNoCaminho(corpo, opcao);
        if (v === undefined) ausentes.push(opcao);
        return textoDoPedido(v).trim();
      })();
      if (valor) { comValor++; return valor; }
    }
    for (const a of ausentes) if (a && !faltaram.includes(a)) faltaram.push(a);
    return '';
  });
  return { texto: variaveis > 0 && comValor === 0 ? '' : texto, faltaram };
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

/** Lê o pedido pelo mapa: o texto de cada campo, já no tamanho do chamado. */
export function aplicarMapaDoRobo(mapa: MapaDoRobo, corpoBruto: unknown): PedidoDoRobo {
  const corpo = corpoDoPedido(corpoBruto);
  const faltaram: Record<string, string[]> = {};
  const ler = (chave: string, modelo: string, variasLinhas: boolean) => {
    const r = preencherDoPedido(modelo, corpo);
    if (r.faltaram.length) faltaram[chave] = r.faltaram;
    const t = r.texto.replace(/\r\n?/g, '\n');
    return variasLinhas ? t.replace(/[ \t]+\n/g, '\n').trim() : t.replace(/\s+/g, ' ').trim();
  };
  const textos = {} as Record<CampoDoMapa, string>;
  for (const c of CAMPOS_DO_MAPA) {
    const t = ler(c, mapa[c] ?? '', VARIAS_LINHAS.has(c));
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
export const GRUPOS_DAS_VARIAVEIS = ['perguntas', 'menus', 'contato', 'conversa', 'mensagens', 'outras'] as const;
export type GrupoDaVariavel = (typeof GRUPOS_DAS_VARIAVEIS)[number];
export const NOME_GRUPO_DA_VARIAVEL: Record<GrupoDaVariavel, string> = {
  perguntas: 'As perguntas do robô', menus: 'Os menus do robô', contato: 'O contato', conversa: 'A conversa e o canal',
  mensagens: 'As mensagens', outras: 'O resto do pedido',
};
const GRUPO_DA_CHAVE: Record<string, GrupoDaVariavel> = {
  questions: 'perguntas', menus: 'menus', contact: 'contato', sessionId: 'conversa', session: 'conversa', channel: 'conversa',
  lastContactMessage: 'mensagens', lastMessage: 'mensagens', lastMessagesAggregated: 'mensagens',
};

export type VariavelDoPedido = {
  caminho: string;
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
export function variaveisDoPedido(corpoBruto: unknown, limite = 400): VariavelDoPedido[] {
  const lista: VariavelDoPedido[] = [];
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
      caminho: caminho.join('.'), valor: cortar(texto, 160), vazio: !texto,
      dica: dica ? cortar(dica.replace(/\s+/g, ' ').trim(), 160) : null, grupo: GRUPO_DA_CHAVE[caminho[0]!] ?? 'outras',
    });
  };
  visitar(corpoDoPedido(corpoBruto), [], null);
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

/** Sem acento, maiúscula, pontuação nem emoji: "☎️ LinePBX: Plataforma" = "linepbx plataforma". */
const limpo = (s: string | null | undefined) => paraBusca(s).replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
/** A palavra (ou as palavras) inteira dentro do texto: "linepbx" está em "linepbx plataforma de voz", "line" não. */
const aparece = (nome: string, texto: string) => !!nome && ` ${texto} `.includes(` ${nome} `);

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
    return { ok: false, erro: 'O mapa do robô não tirou nada deste pedido: o título, o relato, o WhatsApp e a conversa vieram vazios. Confira o mapa em Chamados › Ajustes › Integrações.' };
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
//  A TELA
// =====================================================================

/** O último pedido do robô: guardado para o mapa mostrar as variáveis de verdade (e o que aconteceu). */
export type UltimoPedidoDoRobo = {
  em: string;
  /** o nome da chave que chamou */
  chave: string;
  /** o pedido como chegou (os textos longos cortados) */
  corpo: unknown;
  resultado: { ok: true; criado: boolean; anotou: boolean; codigo: string; ignorados: string[] } | { ok: false; erro: string };
};
export type RoboTela = { mapa: MapaDoRobo; ultimo: UltimoPedidoDoRobo | null };

/** "Como fica": o chamado que o pedido abriria com o mapa (sem abrir nada). */
export type PreviaDoRobo = {
  resolvido: ResolvidoDoRobo;
  /** a conversa já tem um chamado aberto: um pedido dela agora viraria anotação nele */
  aberto: { codigo: string; titulo: string } | null;
};
export const ExperimentarRoboSchema = z.object({ mapa: MapaDoRoboSchema, corpo: z.unknown() });

/**
 * Um pedido de mentira no formato que o robô do LineChat manda (o do Helena), para montar o mapa antes
 * do primeiro pedido de verdade. Os ids das perguntas e dos menus são inventados: os do seu robô
 * aparecem no último pedido (ou no pedido que você colar).
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
