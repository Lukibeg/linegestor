/**
 * As movimentações dos circuitos e dos DIDs (2.4.1, o Luan em 03/11: "eu quero q dentro de circuitos tenha uma aba,
 * movimentações onde qualquer alteração nos circuitos, dids novos, alterados, circuito novo, etc fique registrada").
 *
 * Cada mudança vira uma linha: o tipo, quem, quando, os circuitos e os números envolvidos, a frase do que aconteceu e os
 * fatos de antes e de depois (guardados crus: os nomes do cliente, do circuito e da operadora são escritos na hora de
 * mostrar). As contas daqui são as mesmas no servidor, na prévia e na tela.
 */
import { z } from 'zod';
import { didFormatado, didLimpo, paraBusca, reais } from './formatos.js';
import { Booleano, PaginacaoSchema } from './schemas.js';
import { diaComAno } from './atendimento.js';

export const TIPOS_DE_MOVIMENTACAO_DO_CIRCUITO = [
  'circuito_criado', 'circuito_editado', 'circuito_lixeira', 'circuito_restaurado', 'circuito_cancelado', 'circuito_reativado',
  'dids_criados', 'did_editado', 'dids_editados', 'dids_lixeira', 'did_restaurado',
  'importacao',
] as const;
export type TipoDeMovimentacaoDoCircuito = (typeof TIPOS_DE_MOVIMENTACAO_DO_CIRCUITO)[number];

export const NOME_DO_TIPO_DE_MOVIMENTACAO: Record<TipoDeMovimentacaoDoCircuito, string> = {
  circuito_criado: 'Circuito novo',
  circuito_editado: 'Circuito alterado',
  circuito_lixeira: 'Circuito para a lixeira',
  circuito_restaurado: 'Circuito restaurado',
  circuito_cancelado: 'Link cancelado',
  circuito_reativado: 'Link reativado',
  dids_criados: 'DIDs novos',
  did_editado: 'DID alterado',
  dids_editados: 'DIDs alterados',
  dids_lixeira: 'DIDs para a lixeira',
  did_restaurado: 'DID restaurado',
  importacao: 'Importação',
};

/** O que o filtro "Tipo" oferece: cada tipo, mais os dois grupos (tudo dos circuitos, tudo dos DIDs). */
export const FILTROS_DE_TIPO_DA_MOVIMENTACAO = ['circuitos', 'dids', ...TIPOS_DE_MOVIMENTACAO_DO_CIRCUITO] as const;
export type FiltroDeTipoDaMovimentacao = (typeof FILTROS_DE_TIPO_DA_MOVIMENTACAO)[number];
export const NOME_DO_FILTRO_DE_TIPO: Record<FiltroDeTipoDaMovimentacao, string> = {
  circuitos: 'Tudo dos circuitos', dids: 'Tudo dos DIDs', ...NOME_DO_TIPO_DE_MOVIMENTACAO,
};

/** Os tipos que um filtro pega. */
export function tiposDoFiltro(f: FiltroDeTipoDaMovimentacao | null | undefined): TipoDeMovimentacaoDoCircuito[] | null {
  if (!f) return null;
  if (f === 'circuitos') return TIPOS_DE_MOVIMENTACAO_DO_CIRCUITO.filter((t) => t.startsWith('circuito_'));
  if (f === 'dids') return TIPOS_DE_MOVIMENTACAO_DO_CIRCUITO.filter((t) => t.startsWith('did'));
  return [f];
}

const Dia = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a data como 2026-11-03');
export const MovimentacoesDosCircuitosSchema = PaginacaoSchema.extend({
  circuitId: z.string().trim().max(60).optional().transform((v) => v || undefined),
  tipo: z.enum(FILTROS_DE_TIPO_DA_MOVIMENTACAO).optional().or(z.literal('').transform(() => undefined)),
  userId: z.string().trim().max(60).optional().transform((v) => v || undefined),
  q: z.string().trim().max(60).optional().transform((v) => v || undefined),
  de: Dia.optional().or(z.literal('').transform(() => undefined)),
  ate: Dia.optional().or(z.literal('').transform(() => undefined)),
  /**
   * Os links de terceiros (decisão 0020) ficam fora até ligar o interruptor, como nas outras abas: sem ele, some a movimentação
   * em que todos os circuitos são de terceiros. Com o circuito escolhido, vale o que ele for.
   */
  incluirTerceiros: Booleano.default(false),
});
export type MovimentacoesDosCircuitosFiltro = z.infer<typeof MovimentacoesDosCircuitosSchema>;

/** A movimentação some sem o interruptor dos terceiros quando todos os circuitos dela são links de terceiros. */
export function soDeTerceiros(circuitosDaMovimentacao: readonly string[], terceiros: ReadonlySet<string>): boolean {
  return circuitosDaMovimentacao.length > 0 && circuitosDaMovimentacao.every((c) => terceiros.has(c));
}

/** O começo do dia (de) e o começo do dia seguinte (até) no horário de Brasília. */
export function periodoDasMovimentacoes(de?: string, ate?: string): { desde: Date | null; antesDe: Date | null } {
  const desde = de ? new Date(`${de}T00:00:00-03:00`) : null;
  const antesDe = ate ? new Date(new Date(`${ate}T00:00:00-03:00`).getTime() + 24 * 3600 * 1000) : null;
  return { desde, antesDe };
}

// ---------------------------------------------------------------- o que se guarda

/** O circuito como a movimentação guarda (os campos que a tela mostra; a senha nunca: só se foi definida ou trocada). */
export type CircuitoNaMovimentacao = {
  name: string; code: string; carrierId: string | null; keyNumber: string | null; channels: number; monthlyValueCents: number | null;
  ownerClientId: string | null; thirdParty: boolean; authType: string; signalingIp: string | null; authIp: string | null;
  authUsername: string | null; notes: string | null;
  /** o link cancelado (2.4.6): desde quando e por quê (só nas movimentações do cancelamento e da reativação) */
  cancelledOn?: string | null; cancelReason?: string | null;
};
/** O DID como a movimentação guarda. */
export type DidNaMovimentacao = { circuitId: string | null; clientId: string | null; inUse: boolean; note: string | null };

/**
 * Os fatos de cada movimentação. Nos circuitos, `antes` e `depois` (o circuito novo só tem o depois) e a senha; nos DIDs
 * criados, o `depois` de todos; nos DIDs alterados, cada número com o antes e o depois; na importação, as contas. As linhas que
 * vieram da auditoria (antes do 2.4.1) trazem o antes e o depois que estavam lá.
 */
export type DetalhesDaMovimentacao = {
  antes?: Partial<CircuitoNaMovimentacao & DidNaMovimentacao> | null;
  depois?: Partial<CircuitoNaMovimentacao & DidNaMovimentacao> | null;
  senha?: 'definida' | 'trocada';
  dids?: Array<{ numero: string; antes: DidNaMovimentacao; depois: DidNaMovimentacao }>;
  importacao?: { entidade: 'circuitos' | 'dids'; criados: number; alterados: number };
};

export function circuitoNaMovimentacao(c: Partial<CircuitoNaMovimentacao> & Record<string, unknown>): CircuitoNaMovimentacao {
  return {
    name: String(c.name ?? ''), code: String(c.code ?? ''), carrierId: c.carrierId ?? null, keyNumber: c.keyNumber ?? null,
    channels: Number(c.channels ?? 0), monthlyValueCents: c.monthlyValueCents ?? null, ownerClientId: c.ownerClientId ?? null,
    thirdParty: !!c.thirdParty, authType: c.authType === 'login' ? 'login' : 'ip', signalingIp: c.signalingIp ?? null,
    authIp: c.authIp ?? null, authUsername: c.authUsername ?? null, notes: c.notes ?? null,
  };
}
export function didNaMovimentacao(d: Partial<DidNaMovimentacao> & Record<string, unknown>): DidNaMovimentacao {
  return { circuitId: d.circuitId ?? null, clientId: d.clientId ?? null, inUse: !!d.clientId && !!d.inUse, note: d.note ?? null };
}

// ---------------------------------------------------------------- o que mudou, em palavras

export type NomesDaMovimentacao = {
  clientes: Record<string, string>;
  circuitos: Record<string, string>;
  operadoras: Record<string, string>;
};
export type MudancaDeCampo = { campo: string; antes: string | null; depois: string | null };

type Valor = string | number | boolean | null | undefined;
type Campo = { chave: string; nome: string; escrever: (v: Valor, n: NomesDaMovimentacao) => string | null };

const texto = (v: Valor) => (v === null || v === undefined || String(v).trim() === '' ? null : String(v));
const CAMPOS_DO_CIRCUITO: Campo[] = [
  { chave: 'name', nome: 'Nome', escrever: texto },
  { chave: 'code', nome: 'N° do circuito', escrever: texto },
  { chave: 'carrierId', nome: 'Operadora', escrever: (v, n) => (v ? n.operadoras[String(v)] ?? 'operadora excluída' : null) },
  { chave: 'keyNumber', nome: 'Número chave', escrever: (v) => (texto(v) ? didFormatado(String(v)) : null) },
  { chave: 'channels', nome: 'Canais', escrever: (v) => (v === null || v === undefined ? null : String(v)) },
  { chave: 'monthlyValueCents', nome: 'Valor mensal', escrever: (v) => (v === null || v === undefined ? null : reais(Number(v)).replace(/ /g, ' ')) },
  { chave: 'ownerClientId', nome: 'Titular', escrever: (v, n) => (v ? n.clientes[String(v)] ?? 'cliente excluído' : null) },
  { chave: 'thirdParty', nome: 'Link de terceiro', escrever: (v) => (v ? 'sim' : 'não') },
  { chave: 'authType', nome: 'Autenticação', escrever: (v) => (v === 'login' ? 'por login e senha' : 'por IP') },
  { chave: 'signalingIp', nome: 'IP da operadora', escrever: texto },
  { chave: 'authIp', nome: 'IP do PBX', escrever: texto },
  { chave: 'authUsername', nome: 'Login do tronco', escrever: texto },
  { chave: 'notes', nome: 'Anotações', escrever: texto },
  { chave: 'cancelledOn', nome: 'Cancelado em', escrever: (v) => (texto(v) ? diaComAno(String(v)) : 'ativo') },
  { chave: 'cancelReason', nome: 'Motivo do cancelamento', escrever: texto },
];
const CAMPOS_DO_DID: Campo[] = [
  { chave: 'circuitId', nome: 'Circuito', escrever: (v, n) => (v ? n.circuitos[String(v)] ?? 'circuito excluído' : null) },
  { chave: 'clientId', nome: 'Cliente', escrever: (v, n) => (v ? n.clientes[String(v)] ?? 'cliente excluído' : 'livre') },
  { chave: 'inUse', nome: 'Uso', escrever: (v) => (v ? 'em uso' : 'não usado') },
  { chave: 'note', nome: 'Observação', escrever: texto },
];

/**
 * O que mudou de um para o outro, campo a campo, já escrito. Sem o `antes` (o que nasceu), só os campos preenchidos. O
 * campo que não está no `depois` não mudou (a auditoria antiga guardava a linha inteira; os campos que ela não tinha ficam
 * de fora).
 */
function mudancas(campos: Campo[], antes: Record<string, Valor> | null | undefined, depois: Record<string, Valor> | null | undefined, n: NomesDaMovimentacao): MudancaDeCampo[] {
  if (!depois) return [];
  const out: MudancaDeCampo[] = [];
  for (const c of campos) {
    if (!(c.chave in depois)) continue;
    const d = c.escrever(depois[c.chave], n);
    if (!antes) {
      // o que nasceu: só o que tem valor (e o "Uso" e o "Link de terceiro" só quando sim)
      if (d === null || (c.chave === 'clientId' && !depois[c.chave]) || ((c.chave === 'inUse' || c.chave === 'thirdParty') && !depois[c.chave])) continue;
      out.push({ campo: c.nome, antes: null, depois: d });
      continue;
    }
    if (!(c.chave in antes)) continue;
    const a = c.escrever(antes[c.chave], n);
    if (a === d) continue;
    out.push({ campo: c.nome, antes: a, depois: d });
  }
  return out;
}

const ehDoCircuito = (tipo: TipoDeMovimentacaoDoCircuito) => tipo.startsWith('circuito_');

/** O que a linha mostra quando abre: os campos que mudaram e, nos DIDs, cada número com o que mudou nele. */
export function detalheDaMovimentacao(
  tipo: TipoDeMovimentacaoDoCircuito, d: DetalhesDaMovimentacao | null | undefined, n: NomesDaMovimentacao,
): { campos: MudancaDeCampo[]; porDid: Array<{ numero: string; campos: MudancaDeCampo[] }> } {
  if (!d) return { campos: [], porDid: [] };
  const campos = mudancas(ehDoCircuito(tipo) ? CAMPOS_DO_CIRCUITO : CAMPOS_DO_DID, d.antes as Record<string, Valor>, d.depois as Record<string, Valor>, n);
  if (ehDoCircuito(tipo) && d.senha) campos.push({ campo: 'Senha do tronco', antes: null, depois: d.senha });
  const porDid = (d.dids ?? [])
    .map((x) => ({ numero: didFormatado(x.numero), campos: mudancas(CAMPOS_DO_DID, x.antes as Record<string, Valor>, x.depois as Record<string, Valor>, n) }))
    .filter((x) => x.campos.length > 0);
  return { campos, porDid };
}

/** Os ids que precisam de nome para escrever o detalhe (quem mostra busca os nomes antes). */
export function idsDosNomesDaMovimentacao(d: DetalhesDaMovimentacao | null | undefined): { clientes: string[]; circuitos: string[]; operadoras: string[] } {
  const clientes = new Set<string>(); const circuitos = new Set<string>(); const operadoras = new Set<string>();
  const ver = (x: Partial<CircuitoNaMovimentacao & DidNaMovimentacao> | null | undefined) => {
    if (!x) return;
    if (x.clientId) clientes.add(x.clientId);
    if (x.ownerClientId) clientes.add(x.ownerClientId);
    if (x.circuitId) circuitos.add(x.circuitId);
    if (x.carrierId) operadoras.add(x.carrierId);
  };
  if (d) { ver(d.antes); ver(d.depois); for (const x of d.dids ?? []) { ver(x.antes); ver(x.depois); } }
  return { clientes: [...clientes], circuitos: [...circuitos], operadoras: [...operadoras] };
}

/** A frase de um DID alterado: o que mais importa primeiro (o cliente, depois o circuito, o uso e a observação). */
export function resumoDoDidAlterado(numero: string, antes: DidNaMovimentacao, depois: DidNaMovimentacao, n: NomesDaMovimentacao): string | null {
  const num = didFormatado(numero);
  const partes: string[] = [];
  if (antes.clientId !== depois.clientId) {
    if (!depois.clientId) partes.push(`Liberou o DID ${num}${antes.clientId ? ` (era de ${n.clientes[antes.clientId] ?? 'um cliente excluído'})` : ''}`);
    else partes.push(`${antes.clientId ? 'Passou' : 'Atribuiu'} o DID ${num} ${antes.clientId ? `de ${n.clientes[antes.clientId] ?? 'um cliente excluído'} para` : 'a'} ${n.clientes[depois.clientId] ?? 'um cliente excluído'}`);
  }
  if (antes.circuitId !== depois.circuitId) {
    const para = depois.circuitId ? n.circuitos[depois.circuitId] ?? 'outro circuito' : 'nenhum circuito';
    partes.push(partes.length ? `levou para o circuito ${para}` : `Levou o DID ${num} para o circuito ${para}`);
  }
  if (antes.inUse !== depois.inUse && antes.clientId === depois.clientId) {
    partes.push(partes.length ? `marcou ${depois.inUse ? 'em uso' : 'não usado'}` : `Marcou o DID ${num} como ${depois.inUse ? 'em uso' : 'não usado'}`);
  }
  if ((antes.note ?? null) !== (depois.note ?? null)) {
    const o = depois.note ? `a observação "${depois.note}"` : 'a observação limpa';
    partes.push(partes.length ? `com ${o}` : `Mudou a observação do DID ${num}: ${depois.note ? `"${depois.note}"` : 'limpa'}`);
  }
  if (!partes.length) return null;
  return partes.length === 1 ? partes[0]! : `${partes.slice(0, -1).join(', ')} e ${partes.at(-1)}`;
}

/** Para a busca: o texto bate na frase, no nome do circuito ou no número (só os dígitos, de qualquer pedaço). */
export function movimentacaoBate(q: string | null | undefined, m: { resumo: string; numeros: readonly string[]; circuitos: ReadonlyArray<{ nome: string }> }): boolean {
  const t = paraBusca(q);
  if (!t) return true;
  const digitos = didLimpo(t);
  if (digitos.length >= 3 && m.numeros.some((x) => x.includes(digitos))) return true;
  return paraBusca(m.resumo).includes(t) || m.circuitos.some((c) => paraBusca(c.nome).includes(t));
}

/** Uma linha da aba Movimentações, como a tela recebe. */
export type MovimentacaoDoCircuito = {
  id: string;
  quando: string;
  quem: { id: string; nome: string } | null;
  tipo: TipoDeMovimentacaoDoCircuito;
  tipoNome: string;
  resumo: string;
  circuitos: Array<{ id: string; nome: string; existe: boolean }>;
  /** Os números (escritos), no máximo os 300 primeiros; `totalDeNumeros` diz quantos são. */
  numeros: string[];
  totalDeNumeros: number;
  campos: MudancaDeCampo[];
  porDid: Array<{ numero: string; campos: MudancaDeCampo[] }>;
};
export const MAX_NUMEROS_NA_LINHA = 300;

export type PaginaDeMovimentacoes = {
  items: MovimentacaoDoCircuito[]; total: number; page: number; pageSize: number;
  /** Quem aparece no filtro "Quem fez": só quem tem movimentação. */
  pessoas: Array<{ id: string; nome: string }>;
};

// ---------------------------------------------------------------- as movimentações, montadas (as mesmas no servidor e na prévia)

/** Uma movimentação pronta para guardar: quem guarda põe o id, quem fez e a hora. */
export type NovaMovimentacao = {
  tipo: TipoDeMovimentacaoDoCircuito; circuitos: string[]; numeros: string[]; resumo: string; detalhes: DetalhesDaMovimentacao | null;
};
const semRepetir = (xs: ReadonlyArray<string | null | undefined>) => [...new Set(xs.filter((x): x is string => !!x))];
const emLista = (xs: string[]) => (xs.length === 1 ? xs[0]! : `${xs.slice(0, -1).join(', ')} e ${xs.at(-1)}`);

type LinhaDeCircuito = Partial<CircuitoNaMovimentacao> & { id: string; name: string; authPasswordSecretId?: string | null } & Record<string, unknown>;
type LinhaDeDid = { number: string; circuitId: string | null; clientId: string | null; inUse: boolean; note: string | null } & Record<string, unknown>;

export function movimentacaoDoCircuitoCriado(c: LinhaDeCircuito): NovaMovimentacao {
  return {
    tipo: 'circuito_criado', circuitos: [c.id], numeros: [], resumo: `Criou o circuito ${c.name}`,
    detalhes: { depois: circuitoNaMovimentacao(c), ...(c.authPasswordSecretId ? { senha: 'definida' as const } : {}) },
  };
}

/** O circuito alterado; null quando nada mudou (salvar sem mexer não vira movimentação). */
export function movimentacaoDoCircuitoEditado(antes: LinhaDeCircuito, depois: LinhaDeCircuito, senhaNova: boolean, n: NomesDaMovimentacao): NovaMovimentacao | null {
  const detalhes: DetalhesDaMovimentacao = {
    antes: circuitoNaMovimentacao(antes), depois: circuitoNaMovimentacao(depois),
    ...(senhaNova ? { senha: antes.authPasswordSecretId ? ('trocada' as const) : ('definida' as const) } : {}),
  };
  const campos = detalheDaMovimentacao('circuito_editado', detalhes, n).campos.map((c) => c.campo.toLowerCase());
  if (!campos.length) return null;
  return { tipo: 'circuito_editado', circuitos: [depois.id], numeros: [], resumo: `Alterou o circuito ${depois.name}: ${emLista(campos)}`, detalhes };
}

export function movimentacaoDaLixeiraDoCircuito(c: { id: string; name: string }, tipo: 'circuito_lixeira' | 'circuito_restaurado'): NovaMovimentacao {
  return {
    tipo, circuitos: [c.id], numeros: [], detalhes: null,
    resumo: tipo === 'circuito_lixeira' ? `Mandou o circuito ${c.name} para a lixeira` : `Restaurou o circuito ${c.name}`,
  };
}

// ---------------------------------------------------------------- o link cancelado (2.4.6)

/**
 * Cancelar um link (2.4.6, o Luan: "as vezes fazemos cancelamento de links, quero que tenha uma opção de marcar como cancelado,
 * onde ele é meio que excluído porém fica um registro que ele foi na verdade cancelado"): o dia em que vale e o motivo (opcional).
 */
export const CancelarCircuitoSchema = z.object({
  dia: Dia,
  motivo: z.string().trim().max(500, 'O motivo vai até 500 letras.').default(''),
});
export type CancelarCircuito = z.infer<typeof CancelarCircuitoSchema>;

/** A movimentação do cancelamento e da reativação (com o dia e o motivo, no antes e no depois). */
export function movimentacaoDoCancelamento(
  c: { id: string; name: string }, tipo: 'circuito_cancelado' | 'circuito_reativado', f: { dia: string; motivo: string | null },
): NovaMovimentacao {
  const cancelado = { cancelledOn: f.dia, cancelReason: f.motivo || null };
  const ativo = { cancelledOn: null, cancelReason: null };
  return tipo === 'circuito_cancelado'
    ? { tipo, circuitos: [c.id], numeros: [], detalhes: { antes: ativo, depois: cancelado }, resumo: `Cancelou o link ${c.name} (desde ${diaComAno(f.dia)}${f.motivo ? `: ${f.motivo}` : ''})` }
    : { tipo, circuitos: [c.id], numeros: [], detalhes: { antes: cancelado, depois: ativo }, resumo: `Reativou o link ${c.name} (estava cancelado desde ${diaComAno(f.dia)})` };
}

export function movimentacaoDosDidsCriados(f: { numeros: readonly string[]; circuitId: string; clientId?: string | null; note?: string | null }, n: NomesDaMovimentacao): NovaMovimentacao | null {
  if (!f.numeros.length) return null;
  const primeiro = didFormatado(f.numeros[0]!); const ultimo = didFormatado(f.numeros.at(-1)!);
  const resumo = (f.numeros.length === 1 ? `Criou o DID ${primeiro}` : `Criou ${f.numeros.length} DIDs (${primeiro} a ${ultimo})`)
    + ` no circuito ${n.circuitos[f.circuitId] ?? 'excluído'}` + (f.clientId ? `, para ${n.clientes[f.clientId] ?? 'um cliente excluído'}` : '');
  return {
    tipo: 'dids_criados', circuitos: [f.circuitId], numeros: [...f.numeros], resumo,
    detalhes: { depois: didNaMovimentacao({ circuitId: f.circuitId, clientId: f.clientId ?? null, inUse: false, note: f.note ?? null }) },
  };
}

/**
 * Os DIDs alterados (um, pela linha; vários, pela edição em massa): cada número com o antes e o depois, em ordem. O que não
 * mudou fica de fora; sem nenhum, null. A frase de um só diz o que aconteceu com ele; a de vários é a da edição em massa.
 */
export function movimentacaoDosDidsEditados(pares: ReadonlyArray<{ antes: LinhaDeDid; depois: LinhaDeDid }>, n: NomesDaMovimentacao, resumoDaMassa?: string): NovaMovimentacao | null {
  const mudaram = pares
    .map((p) => ({ numero: p.depois.number, antes: didNaMovimentacao(p.antes), depois: didNaMovimentacao(p.depois) }))
    .filter((p) => JSON.stringify(p.antes) !== JSON.stringify(p.depois))
    .sort((a, b) => a.numero.localeCompare(b.numero));
  if (!mudaram.length) return null;
  const um = mudaram[0]!;
  const resumo = mudaram.length === 1
    ? resumoDoDidAlterado(um.numero, um.antes, um.depois, n) ?? `Alterou o DID ${didFormatado(um.numero)}`
    : resumoDaMassa ?? `Alterou ${mudaram.length} DIDs`;
  return {
    tipo: mudaram.length === 1 ? 'did_editado' : 'dids_editados',
    circuitos: semRepetir(mudaram.flatMap((p) => [p.antes.circuitId, p.depois.circuitId])), numeros: mudaram.map((p) => p.numero),
    resumo, detalhes: { dids: mudaram },
  };
}

export function movimentacaoDaLixeiraDosDids(rows: ReadonlyArray<{ number: string; circuitId: string | null }>, tipo: 'dids_lixeira' | 'did_restaurado'): NovaMovimentacao | null {
  if (!rows.length) return null;
  const um = rows.length === 1 ? didFormatado(rows[0]!.number) : null;
  const resumo = tipo === 'did_restaurado'
    ? (um ? `Restaurou o DID ${um}` : `Restaurou ${rows.length} DIDs`)
    : (um ? `Mandou o DID ${um} para a lixeira` : `Mandou ${rows.length} DIDs para a lixeira`);
  return { tipo, circuitos: semRepetir(rows.map((r) => r.circuitId)), numeros: rows.map((r) => r.number).sort(), resumo, detalhes: null };
}

export function movimentacaoDaImportacao(f: { entidade: 'circuitos' | 'dids'; criados: number; alterados: number; circuitos: ReadonlyArray<string | null | undefined>; numeros: readonly string[] }): NovaMovimentacao | null {
  if (!f.criados && !f.alterados) return null;
  return {
    tipo: 'importacao', circuitos: semRepetir(f.circuitos), numeros: semRepetir(f.numeros),
    resumo: `Importou a planilha de ${f.entidade === 'dids' ? 'DIDs' : 'circuitos'}: ${f.criados} novo(s), ${f.alterados} alterado(s)`,
    detalhes: { importacao: { entidade: f.entidade, criados: f.criados, alterados: f.alterados } },
  };
}

/** A linha da aba, a partir da movimentação guardada e dos nomes de agora. */
export function linhaDaMovimentacao(
  m: { id: string; quando: string; userId: string | null; tipo: string; circuitos: readonly string[]; numeros: readonly string[]; resumo: string; detalhes: DetalhesDaMovimentacao | null },
  n: NomesDaMovimentacao, pessoas: Record<string, string>, circuitosVivos: ReadonlySet<string>,
): MovimentacaoDoCircuito {
  const tipo = m.tipo as TipoDeMovimentacaoDoCircuito;
  const det = detalheDaMovimentacao(tipo, m.detalhes, n);
  return {
    id: m.id, quando: m.quando,
    quem: m.userId ? { id: m.userId, nome: pessoas[m.userId] ?? 'pessoa excluída' } : null,
    tipo, tipoNome: NOME_DO_TIPO_DE_MOVIMENTACAO[tipo] ?? tipo, resumo: m.resumo,
    circuitos: m.circuitos.map((id) => ({ id, nome: n.circuitos[id] ?? 'circuito excluído', existe: circuitosVivos.has(id) })),
    numeros: m.numeros.slice(0, MAX_NUMEROS_NA_LINHA).map(didFormatado), totalDeNumeros: m.numeros.length,
    campos: det.campos, porDid: det.porDid.slice(0, MAX_NUMEROS_NA_LINHA),
  };
}
