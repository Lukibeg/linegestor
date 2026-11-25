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
import { cnpjLimpo, paraBusca } from './formatos.js';
import type { PlanoDoFaturamento } from './faturamento.js';
import {
  valorPreenchido, MAX_ITENS_DA_LISTA, MAX_LETRAS_DO_ITEM,
  type AjustesDoPainel, type ItemChecklist, type ListasDosCampos, TIPOS_QUE_GERAM_ITENS, type CampoPersonalizado, type CorPainel, type EtapaPainel, type GrupoDeCampos, type LugarDoGrupo, type MarcaDaCaixinha, type MarcasDosCampos, type ProgressoDaParte,
  type OpcaoDoCampo, type Painel, type TipoCampo, type ValorDoCampo, type ValoresDosCampos, AJUSTES_PAINEL_PADRAO,
} from './atendimento.js';

// =====================================================================
//  AS PARTES DA FICHA
// =====================================================================

/** Um bloco de uma parte: os campos de um produto (ou os de todo chamado, sem produto). */
export type BlocoDaParte = { produtoId: string | null; campos: CampoPersonalizado[] };
/**
 * Uma parte da ficha, com os blocos e a conta do que já foi feito nela. `faltam`: os campos que ainda têm o que fazer (o
 * vazio; as caixinhas com alguma por marcar), na ordem da parte — a bolinha vermelha da ficha (2.4.4).
 */
export type ParteDoChamado = { nome: string; blocos: BlocoDaParte[]; feitos: number; total: number; faltam: string[] };

/**
 * Os campos com anexo (2.4.4, o Luan: "um documento tem q contar como preenchido o campo"): o campo de texto com um arquivo
 * anexado e sem nada escrito conta como feito na parte e como preenchido no que a etapa pede. Os anexos das caixinhas não
 * entram (a caixinha conta pela marca).
 */
export type CamposComAnexo = ReadonlySet<string> | readonly string[];
const temAnexo = (anexos: CamposComAnexo | null | undefined, id: string | undefined) =>
  !!id && !!anexos && ('has' in anexos ? anexos.has(id) : anexos.includes(id));

/** O nome da parte como se compara ("Configuração" e "configuracao" são a mesma). */
const chaveDaParte = (p: string) => paraBusca(p.trim());

/**
 * A etapa é da parte? Com o mesmo nome (a Configuração da Configuração, como desde o 2.3) ou, desde o 2.4.8, com a primeira
 * palavra da mesma raiz: o "Implantado - Em acompanhamento" e o "Implantado - Concluído" do painel do Luan são da parte
 * Implantação (implanta-do, implanta-ção); a "Configuração dos ramais", da Configuração. A raiz tem de ter 5 letras ou mais
 * e quase toda a palavra mais curta, para "Novos" não casar com "Novidades".
 */
export function etapaEhDaParte(etapa: string, parte: string): boolean {
  const e = chaveDaParte(etapa);
  const p = chaveDaParte(parte);
  if (!e || !p) return false;
  if (e === p) return true;
  const pe = e.split(/[^a-z0-9]+/).find(Boolean) ?? '';
  const pp = p.split(/[^a-z0-9]+/).find(Boolean) ?? '';
  let n = 0;
  while (n < pe.length && n < pp.length && pe[n] === pp[n]) n++;
  return n >= 5 && n >= Math.min(pe.length, pp.length) * 0.7;
}

/** O campo aparece neste chamado? Ativo e, se é de um produto, o chamado tem o produto. */
export function campoAparece(c: Pick<CampoPersonalizado, 'ativo' | 'produtoId'>, produtosDoChamado: readonly string[]): boolean {
  return c.ativo && (!c.produtoId || produtosDoChamado.includes(c.produtoId));
}

/**
 * O checklist dos módulos (2.3): as opções que aparecem — os módulos escolhidos no campo de onde ele vem (a Curadoria),
 * na ordem do catálogo, e os que ficaram marcados aqui depois de saírem da escolha (`foraDaEscolha`).
 */
export function modulosDoChecklist(c: Pick<CampoPersonalizado, 'opcoes' | 'escolhidosEm' | 'id'>, valores: ValoresDosCampos | null | undefined): { opcoes: OpcaoDoCampo[]; foraDaEscolha: Set<string> } {
  const lista = (v: unknown) => new Set(Array.isArray(v) ? (v as unknown[]).filter((x): x is string => typeof x === 'string') : []);
  const escolhidos = lista(c.escolhidosEm ? valores?.[c.escolhidosEm] : null);
  const marcados = lista(valores?.[c.id]);
  const opcoes = c.opcoes.filter((o) => escolhidos.has(o.id) || marcados.has(o.id));
  return { opcoes, foraDaEscolha: new Set(opcoes.filter((o) => !escolhidos.has(o.id)).map((o) => o.id)) };
}

/**
 * Quanto um campo conta na parte: as caixinhas, cada opção (as marcadas e as que faltam, das ativas — a desativada que
 * ficou marcada conta como feita); os módulos do produto não contam (é a escolha do que o cliente vai usar, e não uma
 * tarefa), menos o checklist dos módulos (os escolhidos na Curadoria: cada um, feito quando marcado); o resto, um item,
 * feito quando preenchido — ou quando tem um arquivo anexado (2.4.4: `anexos`, os campos com anexo).
 *
 * O checklist do card (2.4.8): cada item conta, feito quando marcado; sem nenhum item, conta um, que falta (alguém ainda
 * precisa montar a lista — o campo pedido numa etapa também só fica feito com itens, todos marcados).
 */
export function contaDoCampo(
  c: Pick<CampoPersonalizado, 'tipo' | 'opcoes'> & Partial<Pick<CampoPersonalizado, 'id' | 'escolhidosEm'>>, v: ValorDoCampo | null | undefined,
  valores?: ValoresDosCampos | null, anexos?: CamposComAnexo | null, itens?: readonly ItemChecklist[] | null,
): { feitos: number; total: number } {
  if (c.tipo === 'checklist') {
    // os tirados pelo × (2.4.8) não contam
    const lista = (itens ?? []).filter((i) => !i.tirado);
    return lista.length ? { feitos: lista.filter((i) => i.feito).length, total: lista.length } : { feitos: 0, total: 1 };
  }
  if (c.tipo === 'modulos' && c.escolhidosEm && c.id) {
    const marcadas = new Set(Array.isArray(v) ? v : []);
    const { opcoes, foraDaEscolha } = modulosDoChecklist({ id: c.id, opcoes: c.opcoes, escolhidosEm: c.escolhidosEm }, valores);
    const conta = opcoes.filter((o) => !foraDaEscolha.has(o.id));
    return { feitos: conta.filter((o) => marcadas.has(o.id)).length, total: conta.length };
  }
  if (c.tipo === 'modulos') return { feitos: 0, total: 0 };
  if (c.tipo === 'caixinhas') {
    const marcadas = new Set(Array.isArray(v) ? v : []);
    const opcoes = c.opcoes.filter((o) => o.ativa || marcadas.has(o.id));
    return { feitos: opcoes.filter((o) => marcadas.has(o.id)).length, total: opcoes.length };
  }
  return { feitos: valorPreenchido(v) || temAnexo(anexos, c.id) ? 1 : 0, total: 1 };
}

/**
 * As partes do chamado: na ordem dos grupos do painel (Ajustes › Campos, 2.4) e, as que só existem nos campos, na ordem dos
 * campos. Em cada uma, primeiro o bloco dos campos sem produto, depois um bloco por produto, na ordem dos produtos do
 * chamado. Só os campos que aparecem (ativos, e do produto que o chamado tem); os grupos da lateral ficam de fora (vão
 * abaixo da Classificação: `gruposNaLateral`).
 *
 * A parte que tem campos de produto mostra **todos os produtos do chamado**, mesmo o que não tem campo nela (2.4, o Luan na
 * Curadoria: "deixe todos os produtos mesmo que n tenham alguma curadoria configurada, no caso era pra ter um campo da
 * voicenet mesmo que vazio"): o bloco vazio diz que ainda não há o que preencher, e os produtos não se misturam.
 */
export function partesDoChamado(
  campos: readonly CampoPersonalizado[], produtosDoChamado: readonly string[], valores: ValoresDosCampos | null | undefined,
  grupos: readonly GrupoDeCampos[] = [], anexos: CamposComAnexo = [], listas: ListasDosCampos | null = {},
): ParteDoChamado[] {
  const partes: ParteDoChamado[] = [];
  const porChave = new Map<string, ParteDoChamado>();
  const lateral = new Set(grupos.filter((g) => g.lugar === 'lateral').map((g) => chaveDaParte(g.nome)));
  // as partes com campo de produto (ativo): mostram um bloco por produto do chamado
  const porProduto = new Set(campos.filter((c) => c.ativo && c.parte?.trim() && c.produtoId).map((c) => chaveDaParte(c.parte!)));
  const parte = (nome: string) => {
    const k = chaveDaParte(nome);
    let p = porChave.get(k);
    if (!p) { p = { nome: nome.trim(), blocos: [], feitos: 0, total: 0, faltam: [] }; porChave.set(k, p); partes.push(p); }
    return p;
  };
  for (const c of campos) {
    if (!c.parte?.trim() || !c.ativo || lateral.has(chaveDaParte(c.parte))) continue;
    // a parte de produto nasce mesmo sem campo do produto deste chamado (os blocos vazios entram abaixo)
    if (!campoAparece(c, produtosDoChamado)) { if (porProduto.has(chaveDaParte(c.parte)) && produtosDoChamado.length) parte(c.parte); continue; }
    const p = parte(c.parte);
    let b = p.blocos.find((x) => x.produtoId === c.produtoId);
    if (!b) { b = { produtoId: c.produtoId, campos: [] }; p.blocos.push(b); }
    b.campos.push(c);
    const conta = contaDoCampo(c, valores?.[c.id], valores, anexos, c.tipo === 'checklist' ? itensDoChecklist(c, campos, valores, listas?.[c.id]) : null);
    p.feitos += conta.feitos;
    p.total += conta.total;
    if (conta.feitos < conta.total) p.faltam.push(c.id);
  }
  for (const p of partes) {
    if (!porProduto.has(chaveDaParte(p.nome))) continue;
    for (const id of produtosDoChamado) if (!p.blocos.some((b) => b.produtoId === id)) p.blocos.push({ produtoId: id, campos: [] });
  }
  const ordemDoProduto = (id: string | null) => (id === null ? -1 : produtosDoChamado.indexOf(id));
  for (const p of partes) p.blocos.sort((a, b) => ordemDoProduto(a.produtoId) - ordemDoProduto(b.produtoId));
  // a ordem dos grupos do painel; as que não estão nos grupos, depois, na ordem dos campos
  const ordem = (p: ParteDoChamado) => { const i = grupos.findIndex((g) => chaveDaParte(g.nome) === chaveDaParte(p.nome)); return i < 0 ? grupos.length : i; };
  const fora = partes.map((p, i) => ({ p, i })).sort((a, b) => ordem(a.p) - ordem(b.p) || a.i - b.i).map((x) => x.p);
  // o que falta, na ordem em que a parte mostra (os blocos já arrumados pelos produtos)
  for (const p of fora) { const ids = new Set(p.faltam); p.faltam = p.blocos.flatMap((b) => b.campos.filter((c) => ids.has(c.id)).map((c) => c.id)); }
  return fora;
}

/**
 * Os grupos da lateral que aparecem no chamado (2.4): cada um com os campos que aparecem (ativos, e do produto que o chamado
 * tem), na ordem dos grupos. O grupo sem campo nenhum neste chamado fica de fora.
 */
export function gruposNaLateral(
  campos: readonly CampoPersonalizado[], produtosDoChamado: readonly string[], grupos: readonly GrupoDeCampos[],
): Array<{ nome: string; campos: CampoPersonalizado[] }> {
  return grupos.filter((g) => g.lugar === 'lateral')
    .map((g) => ({ nome: g.nome, campos: campos.filter((c) => c.parte && chaveDaParte(c.parte) === chaveDaParte(g.nome) && campoAparece(c, produtosDoChamado)) }))
    .filter((g) => g.campos.length > 0);
}

/** Um grupo de campos como os Ajustes mostram (2.4): o nome, onde fica, os campos (na ordem) e se está ativo. */
export type GrupoDoPainel = { nome: string; lugar: LugarDoGrupo; campos: CampoPersonalizado[]; ativo: boolean };

/**
 * Os grupos de campos do painel (2.4): os guardados nos ajustes, na ordem deles, e os que só existem nos campos (o nome da
 * parte escrito no campo), no fim, no meio da ficha. O grupo está ativo quando não tem campo, ou quando algum campo dele está
 * ativo (desativar o grupo desativa os campos dele).
 */
export function gruposDoPainel(grupos: readonly GrupoDeCampos[], campos: readonly CampoPersonalizado[]): GrupoDoPainel[] {
  const out: GrupoDoPainel[] = [];
  const porChave = new Map<string, GrupoDoPainel>();
  const incluir = (nome: string, lugar: LugarDoGrupo) => {
    const k = chaveDaParte(nome);
    if (porChave.has(k)) return;
    const g: GrupoDoPainel = { nome: nome.trim(), lugar, campos: [], ativo: true };
    porChave.set(k, g); out.push(g);
  };
  for (const g of grupos) incluir(g.nome, g.lugar);
  for (const c of campos) if (c.parte?.trim()) incluir(c.parte, 'meio');
  for (const c of campos) if (c.parte?.trim()) porChave.get(chaveDaParte(c.parte))!.campos.push(c);
  for (const g of out) g.ativo = !g.campos.length || g.campos.some((c) => c.ativo);
  return out;
}

/** O grupo de um nome (sem ligar para maiúscula e acento), entre os do painel. */
export const mesmoGrupo = (a: string | null | undefined, b: string | null | undefined) => !!a?.trim() && !!b?.trim() && chaveDaParte(a) === chaveDaParte(b);

/** Só a conta de cada parte (o cartão do quadro e a lista). */
export function progressoDasPartes(
  campos: readonly CampoPersonalizado[], produtosDoChamado: readonly string[], valores: ValoresDosCampos | null | undefined, grupos: readonly GrupoDeCampos[] = [],
  anexos: CamposComAnexo = [], listas: ListasDosCampos | null = {},
): ProgressoDaParte[] {
  return partesDoChamado(campos, produtosDoChamado, valores, grupos, anexos, listas).map((p) => ({ parte: p.nome, feitos: p.feitos, total: p.total }));
}

/**
 * A parte que o cartão mostra: a que tem o nome da etapa em que o chamado está (no Configuração, a conta da
 * Configuração). Sem uma com esse nome, nenhuma.
 */
export function parteDaEtapa(partes: readonly ProgressoDaParte[], etapa: string | null | undefined): ProgressoDaParte | null {
  if (!etapa) return null;
  return partes.find((p) => etapaEhDaParte(etapa, p.parte) && p.total > 0) ?? null;
}

/**
 * O painel da implantação (2.4.8): o de Gestão que a etapa de um painel de Vendas abre (Ao chegar aqui, abre a implantação),
 * ou o que tem a etapa que liga no cadastro (o Implantado). Nele, o cartão do quadro mostra o andamento de todas as partes,
 * e não só o da etapa (`partesNoCartao`). Os mesmos critérios do Suporte › Painel da Implantação, mas para qualquer um deles.
 */
export function ehPainelDaImplantacao(
  painel: Pick<Painel, 'id' | 'tipo' | 'etapas'>, paineis: ReadonlyArray<Pick<Painel, 'tipo' | 'etapas' | 'ativo'>>,
): boolean {
  if (painel.tipo !== 'gestao') return false;
  if (painel.etapas.some((e) => e.ligaNoCadastro)) return true;
  return paineis.some((p) => p.ativo && p.tipo === 'vendas' && p.etapas.some((e) => e.abreImplantacao === painel.id));
}

/**
 * Onde a parte está em relação à etapa do card (2.4.8): `feita` (tudo marcado — vira só o ✓), `da-etapa` (a parte da etapa
 * em que o card está), `ficou` (o card já passou da etapa desta parte e ainda falta coisa: a curadoria pela metade com o
 * card na Configuração, a configuração pela metade com o card no Implantado) e `adiante` (a etapa dela ainda vem).
 */
export type MomentoDaParte = 'feita' | 'da-etapa' | 'ficou' | 'adiante';
export type ParteNoCartao = ProgressoDaParte & { momento: MomentoDaParte };

/**
 * As partes que o cartão do quadro mostra. Fora da implantação (`todas` falso), só a da etapa, como desde o 2.3 ("Configuração
 * · 3 de 15" no card que está na Configuração; sem uma parte com o nome da etapa, nenhuma). No painel da implantação (o
 * pedido do Luan, 13/11: "o cliente já tem configuração e já está andando na configuração, porém já tem alguns processos de
 * curadoria que ainda está em andamento, ou já está implantado, porém tem alguns processos de configuração… não fica muito
 * fácil de acompanhar"), todas, em qualquer etapa — e a que acabou só com o ✓ ("se tiver ok, ele pode até reduzir… ficar só
 * com um Vzinho").
 *
 * As etapas de cada parte são as do mesmo nome ou da mesma raiz (`etapaEhDaParte`: os dois "Implantado - …" são da
 * Implantação). A parte sem etapa (os Testes num painel sem a etapa Testes) fica logo depois da etapa da parte de antes: com o
 * card no Implantado, os testes que faltam ficaram para trás; na Configuração, ainda vêm. As partes sem nada a fazer neste
 * card (total 0) não aparecem.
 */
export function partesNoCartao(
  partes: readonly ProgressoDaParte[], etapas: ReadonlyArray<Pick<EtapaPainel, 'id' | 'nome'>>, etapaId: string | null | undefined, todas: boolean,
): ParteNoCartao[] {
  const atual = etapas.findIndex((e) => e.id === etapaId);
  const lista: ParteNoCartao[] = [];
  // a última etapa da parte; a parte sem etapa fica meio passo depois da última etapa da parte anterior
  let anterior = -1;
  for (const p of partes) {
    const daParte = etapas.map((e, i) => (etapaEhDaParte(e.nome, p.parte) ? i : -1)).filter((i) => i >= 0);
    const ultima = daParte.length ? daParte[daParte.length - 1]! : anterior + 0.5;
    if (daParte.length) anterior = ultima;
    if (p.total <= 0) continue;
    const momento: MomentoDaParte = p.feitos >= p.total && todas ? 'feita'
      : daParte.includes(atual) ? 'da-etapa'
        : atual >= 0 && ultima < atual ? 'ficou' : 'adiante';
    lista.push({ ...p, momento });
  }
  return todas ? lista : lista.filter((p) => p.momento === 'da-etapa');
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
//  O CHECKLIST DO CARD (2.4.8)
// =====================================================================

/**
 * Os itens de um texto colado: cada linha vira um item (a lista de ramais colada da planilha), sem a marca de lista do começo
 * ("- ", "• ", "* ", "[ ] ", "1. ") e sem as linhas em branco. O que passa do tamanho do item é cortado.
 */
export function linhasDaLista(texto: string | readonly string[]): string[] {
  const linhas = (typeof texto === 'string' ? [texto] : texto).flatMap((t) => t.split(/\r?\n/));
  return linhas
    .map((l) => l.replace(/^\s*(?:[-•*·–]\s+|\[\s?[xX]?\s?\]\s*|\d{1,3}[.)]\s+)/, '').replace(/\s+/g, ' ').trim().slice(0, MAX_LETRAS_DO_ITEM).trim())
    .filter(Boolean);
}

/** Um número curto para o id do item que veio de outro campo (o mesmo texto, o mesmo id: a marca não se perde). */
function resumoDoTexto(k: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < k.length; i++) { h ^= k.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(36);
}

/**
 * O que um campo de origem dá ao checklist do card (2.4.8): o texto longo, uma linha por item (a Lista de ramais da Curadoria);
 * a lista de várias, uma opção escolhida por item; o texto curto e a lista de uma opção, um item com o nome do campo ("IP do
 * cliente: 189.45.12.90"). Os outros tipos não dão nada.
 */
export function textosDaOrigem(o: Pick<CampoPersonalizado, 'nome' | 'tipo' | 'opcoes'>, v: ValorDoCampo | null | undefined): string[] {
  if (v === null || v === undefined || v === '') return [];
  if (o.tipo === 'texto_longo') return typeof v === 'string' ? linhasDaLista(v) : [];
  if (o.tipo === 'lista_varios') {
    const ids = Array.isArray(v) ? v : [];
    return ids.map((id) => o.opcoes.find((x) => x.id === id)?.nome).filter((x): x is string => !!x).flatMap((x) => linhasDaLista(x));
  }
  if (o.tipo === 'texto' && typeof v === 'string') {
    const t = linhasDaLista(v).join(' ');
    return t ? [`${o.nome}: ${t}`.slice(0, MAX_LETRAS_DO_ITEM)] : [];
  }
  if (o.tipo === 'lista' && typeof v === 'string') {
    const nome = o.opcoes.find((x) => x.id === v)?.nome;
    return nome ? [`${o.nome}: ${nome}`.slice(0, MAX_LETRAS_DO_ITEM)] : [];
  }
  return [];
}

/**
 * Os itens do checklist do card como a ficha mostra (2.4.8): primeiro os que vêm dos campos de origem (na ordem das origens e
 * das linhas), com a marca que já tinham — o item se acha pelo texto, sem ligar para maiúscula e acento —; depois os incluídos
 * à mão. O item que veio de um campo e saiu de lá some (com a marca); o incluído à mão com o mesmo texto de um que veio passa a
 * ser dele. Sem origens, os guardados, como estão. O que veio e foi tirado pelo × continua na lista com `tirado` (fora da conta
 * e da ficha, com o Voltar), para não voltar sozinho na leitura seguinte; some quando sai da origem.
 */
export function itensDoChecklist(
  c: Pick<CampoPersonalizado, 'id' | 'origens'>, campos: readonly Pick<CampoPersonalizado, 'id' | 'nome' | 'tipo' | 'opcoes' | 'ativo'>[],
  valores: ValoresDosCampos | null | undefined, guardados: readonly ItemChecklist[] | null | undefined,
): ItemChecklist[] {
  const lista = guardados ?? [];
  if (!c.origens?.length) return lista.filter((i) => !i.origem);
  const gerados: ItemChecklist[] = [];
  const vistos = new Set<string>();
  const usados = new Set<string>();
  for (const oid of c.origens) {
    const o = campos.find((x) => x.id === oid && x.id !== c.id && x.ativo && TIPOS_QUE_GERAM_ITENS.includes(x.tipo));
    if (!o) continue;
    for (const texto of textosDaOrigem(o, valores?.[o.id])) {
      const k = paraBusca(texto);
      if (!k || vistos.has(k)) continue;
      vistos.add(k);
      const guardado = lista.find((i) => !usados.has(i.id) && i.origem && paraBusca(i.texto) === k)
        ?? lista.find((i) => !usados.has(i.id) && !i.origem && paraBusca(i.texto) === k);
      if (guardado) usados.add(guardado.id);
      gerados.push({
        id: guardado?.id ?? `g-${resumoDoTexto(k)}`, texto, feito: guardado?.feito ?? false, porId: guardado?.porId ?? null, em: guardado?.em ?? null,
        doAssunto: false, origem: o.id, ...(guardado?.origem && guardado.tirado ? { tirado: true } : {}),
      });
    }
  }
  return [...gerados, ...lista.filter((i) => !i.origem && !usados.has(i.id))];
}

/** Os itens de todos os checklists do card como a ficha mostra (os que vêm de outros campos já dentro). */
export function listasEfetivas(
  campos: readonly CampoPersonalizado[], valores: ValoresDosCampos | null | undefined, listas: ListasDosCampos | null | undefined,
): ListasDosCampos {
  const r: ListasDosCampos = {};
  for (const c of campos) {
    if (c.tipo !== 'checklist') continue;
    const itens = itensDoChecklist(c, campos, valores, listas?.[c.id]);
    if (itens.length) r[c.id] = itens;
  }
  return r;
}

/** O grupo onde nasce o checklist ligado pelo campo (2.4.8): a aba Implantação. */
export const GRUPO_DA_IMPLANTACAO = 'Implantação';

/**
 * O campo que pode ligar um checklist na Implantação (2.4.8, o Luan: "quero que tenha um checkbox … ao lado de um campo de
 * configuração que quando eu clicar automaticamente ele já abra um campo na parte de implantação"): um texto ou uma lista
 * (os que geram itens), fora da própria Implantação.
 */
export function podeLigarNaImplantacao(c: Pick<CampoPersonalizado, 'tipo' | 'parte'>): boolean {
  return TIPOS_QUE_GERAM_ITENS.includes(c.tipo) && !mesmoGrupo(c.parte, GRUPO_DA_IMPLANTACAO);
}

/** Onde a caixinha aparece (Configurar › Campos): no painel da implantação, ou no de Gestão que já tem o grupo Implantação. */
export function painelComImplantacao(
  painel: Pick<Painel, 'id' | 'tipo' | 'etapas' | 'ajustes'>, paineis: ReadonlyArray<Pick<Painel, 'tipo' | 'etapas' | 'ativo'>>,
): boolean {
  if (painel.tipo !== 'gestao') return false;
  return ehPainelDaImplantacao(painel, paineis) || (painel.ajustes.partes ?? []).some((g) => mesmoGrupo(g.nome, GRUPO_DA_IMPLANTACAO));
}

/** O checklist da Implantação que o campo ligou: o Checklist do card do grupo Implantação que tira os itens dele. */
export function checklistLigadoNaImplantacao<C extends Pick<CampoPersonalizado, 'id' | 'tipo' | 'parte' | 'origens'>>(c: Pick<CampoPersonalizado, 'id'>, campos: readonly C[]): C | null {
  return campos.find((x) => x.id !== c.id && x.tipo === 'checklist' && mesmoGrupo(x.parte, GRUPO_DA_IMPLANTACAO) && (x.origens ?? []).includes(c.id)) ?? null;
}

/**
 * O nome do checklist que nasce: o do campo com "(implantação)" ("Lista de ramais (implantação)"), dentro das 40 letras do
 * nome; se o painel já tiver um com esse nome no mesmo produto, com um número.
 */
export function nomeDoChecklistDaImplantacao(
  c: Pick<CampoPersonalizado, 'nome' | 'produtoId'>, campos: readonly Pick<CampoPersonalizado, 'nome' | 'produtoId'>[],
): string {
  const fim = ' (implantação)';
  const usado = (nome: string) => campos.some((x) => paraBusca(x.nome) === paraBusca(nome) && (x.produtoId ?? null) === (c.produtoId ?? null));
  for (let n = 1; n < 100; n++) {
    const numero = n > 1 ? ` ${n}` : '';
    const nome = `${c.nome.slice(0, 40 - fim.length - numero.length).trim()}${fim}${numero}`;
    if (!usado(nome)) return nome;
  }
  return `${c.nome.slice(0, 20).trim()}${fim}`;
}

/** O que mexer no checklist do card faz (o mesmo no servidor e na prévia). */
export type AcaoNaLista =
  | { acao: 'incluir'; textos: string[] } | { acao: 'marcar'; itemId: string; feito: boolean }
  | { acao: 'editar'; itemId: string; texto: string } | { acao: 'tirar'; itemId: string } | { acao: 'voltar'; itemId: string };
export type ListaDepois =
  | { ok: true; mudou: boolean; lista: ItemChecklist[]; evento: Record<string, unknown>; resumo: string }
  | { ok: false; erro: string };

/**
 * A lista do campo depois de uma ação: incluir (os que já estão na lista, sem ligar para maiúscula e acento, não entram de
 * novo; o que veio de outro campo e foi tirado volta), marcar (com quem e quando; desmarcar tira), corrigir o texto e tirar.
 * O que veio de outro campo (2.4.8) não se corrige aqui; tirar esconde só deste card (`tirado`), e o voltar traz de volta. `evento`: o que vai para o histórico ("incluiu
 * em Ramais no telefone: 201, 202"). Marcar o que já está marcado (o clique duplo) não muda nada.
 */
export function listaDepois(
  atual: readonly ItemChecklist[] | null | undefined, campo: { nome: string }, d: AcaoNaLista, quem: string | null, em: string, novoId: () => string,
  nomeDaOrigem: (id: string) => string | undefined = () => undefined,
): ListaDepois {
  const lista = [...(atual ?? [])];
  const achar = (id: string) => lista.findIndex((i) => i.id === id);
  if (d.acao === 'incluir') {
    const ja = new Set(lista.filter((i) => !i.tirado).map((i) => paraBusca(i.texto)));
    const novos: string[] = [];
    const voltam: string[] = [];
    for (const t of linhasDaLista(d.textos)) {
      const k = paraBusca(t);
      if (ja.has(k)) continue;
      ja.add(k);
      // o que veio de outro campo e foi tirado: volta, em vez de entrar repetido
      const tirado = lista.findIndex((i) => i.tirado && paraBusca(i.texto) === k);
      if (tirado >= 0) { const { tirado: _, ...volta } = lista[tirado]!; lista[tirado] = volta; voltam.push(volta.texto); continue; }
      novos.push(t);
    }
    if (!novos.length && !voltam.length) return linhasDaLista(d.textos).length ? { ok: false, erro: 'Esses itens já estão na lista.' } : { ok: false, erro: 'Escreva o item.' };
    const visiveis = lista.filter((i) => !i.tirado).length;
    if (visiveis + novos.length > MAX_ITENS_DA_LISTA) return { ok: false, erro: `A lista vai até ${MAX_ITENS_DA_LISTA} itens (já tem ${visiveis}).` };
    for (const t of novos) lista.push({ id: novoId(), texto: t, feito: false, porId: null, em: null, doAssunto: false });
    const todos = [...voltam, ...novos];
    return {
      ok: true, mudou: true, lista, evento: { acao: 'incluiu', campo: campo.nome, itens: todos },
      resumo: todos.length === 1 ? `Incluiu "${todos[0]}" em ${campo.nome}` : `Incluiu ${todos.length} itens em ${campo.nome}`,
    };
  }
  const i = achar(d.itemId);
  if (i < 0) return { ok: false, erro: 'Esse item não está mais na lista (alguém tirou?). Atualize a ficha.' };
  const item = lista[i]!;
  // o item que veio de outro campo (2.4.8) se corrige lá
  if (item.origem && d.acao === 'editar') {
    const de = nomeDaOrigem(item.origem);
    return { ok: false, erro: `Esse item vem ${de ? `de ${de}` : 'de outro campo do card'}: para corrigir, mude lá.` };
  }
  if (d.acao === 'voltar') {
    if (!item.tirado) return { ok: true, mudou: false, lista, evento: {}, resumo: '' };
    const { tirado: _, ...volta } = item;
    lista[i] = volta;
    return { ok: true, mudou: true, lista, evento: { acao: 'voltou', campo: campo.nome, item: item.texto }, resumo: `Trouxe de volta "${item.texto}" em ${campo.nome}` };
  }
  if (item.tirado) return { ok: false, erro: 'Esse item foi tirado da lista: traga de volta antes.' };
  if (d.acao === 'tirar') {
    // o que veio de outro campo fica guardado como tirado, com a marca (senão voltaria, porque a linha continua lá; e o Voltar
    // traz como estava); o incluído à mão sai
    if (item.origem) lista[i] = { ...item, tirado: true };
    else lista.splice(i, 1);
    return { ok: true, mudou: true, lista, evento: { acao: 'tirou', campo: campo.nome, item: item.texto }, resumo: `Tirou "${item.texto}" de ${campo.nome}` };
  }
  if (d.acao === 'editar') {
    const texto = linhasDaLista(d.texto).join(' ').slice(0, MAX_LETRAS_DO_ITEM).trim();
    if (!texto) return { ok: false, erro: 'Escreva o item.' };
    if (texto === item.texto) return { ok: true, mudou: false, lista, evento: {}, resumo: '' };
    if (lista.some((x, k) => k !== i && !x.tirado && paraBusca(x.texto) === paraBusca(texto))) return { ok: false, erro: `"${texto}" já está na lista.` };
    lista[i] = { ...item, texto };
    return { ok: true, mudou: true, lista, evento: { acao: 'editou', campo: campo.nome, de: item.texto, item: texto }, resumo: `Corrigiu "${item.texto}" para "${texto}" em ${campo.nome}` };
  }
  if (item.feito === d.feito) return { ok: true, mudou: false, lista, evento: {}, resumo: '' };
  lista[i] = { ...item, feito: d.feito, porId: d.feito ? quem : null, em: d.feito ? em : null };
  return {
    ok: true, mudou: true, lista, evento: { acao: 'marcou', campo: campo.nome, item: item.texto, feito: d.feito },
    resumo: `${d.feito ? 'Marcou' : 'Desmarcou'} "${item.texto}" em ${campo.nome}`,
  };
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
/** Uma opção do modelo: o nome, ou o nome e a pasta (as caixinhas da Configuração do LinePBX, 2.3). */
export type OpcaoDoModelo = string | { nome: string; pasta: string };
/** `escolhidosEm`: no checklist dos módulos, o nome do campo de módulos do mesmo produto de onde vêm as opções. */
export type CampoDoModelo = { nome: string; tipo: TipoCampo; parte: string; produto: 'linechat' | 'linepbx' | null; dica: string; opcoes: OpcaoDoModelo[]; escolhidosEm?: string; anexos?: boolean };
/** A opção do modelo com a pasta (nula quando não tem). */
export const opcaoDoModelo = (o: OpcaoDoModelo): { nome: string; pasta: string | null } => (typeof o === 'string' ? { nome: o, pasta: null } : o);
const naPasta = (pasta: string, ...nomes: string[]) => nomes.map((nome) => ({ nome, pasta }));
type EtapaDoModelo = Pick<EtapaPainel, 'nome' | 'tipo' | 'nivel' | 'obrigatorios'> & { ligaNoCadastro?: boolean };

const CURADORIA = 'Curadoria';
const MODULOS_A_ATIVAR = 'Módulos a ativar';
const ATIVACAO_DOS_MODULOS = 'Ativação dos módulos';
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
    // nem o tempo gasto (2.3, o Luan: "n precisa disso")
    camposDesligados: ['assunto', 'tipo', 'gravidade', 'alcance', 'operadoras', 'relato', 'solucao', 'prioridade', 'tempo'],
    // os grupos de campos (2.4), no meio da ficha, na ordem das etapas
    partes: [{ nome: 'Curadoria', lugar: 'meio' }, { nome: 'Configuração', lugar: 'meio' }, { nome: 'Testes', lugar: 'meio' }],
  },
  etapas: [
    { nome: 'Stand By', tipo: 'andamento', nivel: null, obrigatorios: [] },
    { nome: CURADORIA, tipo: 'entrada', nivel: null, obrigatorios: [] },
    { nome: CONFIGURACAO, tipo: 'andamento', nivel: null, obrigatorios: [] },
    { nome: TESTES, tipo: 'andamento', nivel: null, obrigatorios: [] },
    // 2.3, o Luan: "uma parte de concluído depois de testes afirmando que todos os testes foram concluídos e a ultima tem q
    // ser 'implantado' indicando que o cliente já está ativo e já realizamos a implantação junto ao cliente"
    { nome: 'Concluído', tipo: 'resolvido', nivel: null, obrigatorios: [] },
    { nome: 'Implantado', tipo: 'fechado', nivel: null, obrigatorios: [], ligaNoCadastro: true },
  ],
  campos: ([
    // a curadoria do LineChat
    { nome: 'Lista de usuários', tipo: 'texto_longo', parte: CURADORIA, produto: 'linechat', dica: 'Quem vai usar: o nome, o e-mail e a equipe de cada um.', opcoes: [] },
    { nome: 'Números', tipo: 'texto_longo', parte: CURADORIA, produto: 'linechat', dica: 'Os números do WhatsApp que entram no LineChat.', opcoes: [] },
    { nome: 'Estrutura do chatbot', tipo: 'texto_longo', parte: CURADORIA, produto: 'linechat', dica: 'O menu, as perguntas e para onde vai cada resposta.', opcoes: [] },
    { nome: 'Horário de atendimento', tipo: 'texto_longo', parte: CURADORIA, produto: 'linechat', dica: 'Os dias e as horas, e o que responder fora do horário.', opcoes: [] },
    { nome: 'Acesso à BM', tipo: 'sim_nao', parte: CURADORIA, produto: 'linechat', dica: 'O cliente já deu o acesso ao Business Manager da Meta?', opcoes: [] },
    // sem o CRM usado (29/10, o Luan: "n precisa disso n")
    // os módulos: a curadoria escolhe, a configuração ativa (29/10, o Luan: "é a curadoria que define quais módulos devem
    // ser ativos, aqui é só um checklist do que foi solicitado na curadoria")
    { nome: MODULOS_A_ATIVAR, tipo: 'modulos', parte: CURADORIA, produto: 'linechat', dica: 'Os módulos que o cliente contratou. No Implantado, ficam ligados na ficha dele.', opcoes: [] },
    // a curadoria do LinePBX
    { nome: 'IP do cliente', tipo: 'texto', parte: CURADORIA, produto: 'linepbx', dica: 'O IP fixo de saída da rede do cliente.', opcoes: [] },
    { nome: 'Lista de ramais', tipo: 'texto_longo', parte: CURADORIA, produto: 'linepbx', dica: 'O ramal, o nome e o setor de cada um.', opcoes: [] },
    { nome: 'Usuários do callcenter', tipo: 'texto_longo', parte: CURADORIA, produto: 'linepbx', dica: 'Quem atende nas filas: o nome e o ramal.', opcoes: [] },
    { nome: 'Horário de atendimento', tipo: 'texto_longo', parte: CURADORIA, produto: 'linepbx', dica: 'Os dias e as horas, e o que tocar fora do horário.', opcoes: [] },
    { nome: 'Números da rota de entrada', tipo: 'texto_longo', parte: CURADORIA, produto: 'linepbx', dica: 'Os números que entram e para onde vai cada um.', opcoes: [] },
    { nome: 'Estrutura da URA', tipo: 'texto_longo', parte: CURADORIA, produto: 'linepbx', dica: 'As mensagens e as opções de cada menu.', opcoes: [] },
    { nome: MODULOS_A_ATIVAR, tipo: 'modulos', parte: CURADORIA, produto: 'linepbx', dica: 'Os módulos que o cliente contratou. No Implantado, ficam ligados na ficha dele.', opcoes: [] },
    // a configuração (a equipe técnica marca o que já fez). A Ativação dos módulos saiu no 2.4 e voltou no 2.4.1 (o Luan:
    // "gostaria de retroceder uma questão" — "Que ela volte"): o checklist dos módulos escolhidos na Curadoria
    {
      nome: 'Configuração do ambiente', tipo: 'caixinhas', parte: CONFIGURACAO, produto: 'linechat', dica: 'Marque o que já foi feito.',
      opcoes: ['Criação dos usuários', 'Criação das equipes', 'Configuração dos chatbots', 'Configuração do horário de atendimento', 'Ativação dos números'],
    },
    { nome: ATIVACAO_DOS_MODULOS, tipo: 'modulos', parte: CONFIGURACAO, produto: 'linechat', dica: 'Os módulos escolhidos na Curadoria: marque conforme ativar.', opcoes: [], escolhidosEm: MODULOS_A_ATIVAR },
    {
      nome: 'Configuração do ambiente', tipo: 'caixinhas', parte: CONFIGURACAO, produto: 'linepbx', dica: 'Marque o que já foi feito.',
      // em pastas (2.3, o Luan: "configurações do servidor, configuirações do asterisk, do linepbx web, dos módulos")
      opcoes: [
        ...naPasta('Servidor', 'Criação do ambiente'),
        ...naPasta('Asterisk', 'Configuração dos ramais', 'Configuração da rota de entrada', 'Configuração das URAs e filas', 'Configuração do FHA', 'Alinhamento do tronco'),
        ...naPasta('LinePBX Web', 'Configuração dos usuários', 'Configuração das equipes'),
        ...naPasta('Módulos', 'Instalação do LineReports'),
        ...naPasta('Telefones', 'Configuração dos telefones'),
      ],
    },
    { nome: ATIVACAO_DOS_MODULOS, tipo: 'modulos', parte: CONFIGURACAO, produto: 'linepbx', dica: 'Os módulos escolhidos na Curadoria: marque conforme ativar.', opcoes: [], escolhidosEm: MODULOS_A_ATIVAR },
    // os testes (o suporte confere antes de validar)
    {
      nome: 'Testes realizados', tipo: 'caixinhas', parte: TESTES, produto: 'linechat', dica: 'Marque o que já foi testado com o cliente.',
      opcoes: ['Login dos usuários', 'Mensagens entrando e saindo nos números', 'Chatbot respondendo', 'Horário de atendimento funcionando'],
    },
    {
      nome: 'Testes realizados', tipo: 'caixinhas', parte: TESTES, produto: 'linepbx', dica: 'Marque o que já foi testado com o cliente.',
      opcoes: ['Registro do ramal no ambiente do cliente', 'Login nos acessos do LinePBX Web', 'Ligações ativas e receptivas', 'IP do ambiente estável'],
    },
  // os anexos só na Curadoria (29/10, o Luan: "eu quis dizer todas as opções de curadoria, de configuração n precisa n"); a
  // escolha dos módulos fica sem
  ] satisfies CampoDoModelo[]).map((c): CampoDoModelo => (c.parte === CURADORIA && c.tipo !== 'modulos' ? { ...c, anexos: true } : c)),
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
        // sem conferir o dígito verificador ("n quero mais q verifique os números"): só os 14 números
        : cnpj.length < 14 ? `O CNPJ tem 14 números: ${14 - cnpj.length === 1 ? 'falta 1' : `faltam ${14 - cnpj.length}`}.`
          : cnpj.length > 14 ? 'O CNPJ tem 14 números: tem número a mais.'
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
//  O CARD QUE LIGA NO CADASTRO (o Implantado)
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
  /** os módulos escolhidos que o checklist (a Ativação dos módulos) ainda não marcou: a janela avisa, sem travar */
  semMarcar?: Array<{ id: string; nome: string; produto: string; campo: string }>;
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
  semMarcar?: Array<{ id: string; nome: string; produto: string; campo: string }>;
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
  return { etapa: e.etapa, dia: e.dia, cliente: e.cliente, produtos, modulos, ...(e.semMarcar?.length ? { semMarcar: e.semMarcar } : {}) };
}

/** A negociação que vai sozinha para a etapa que recebe a implantação terminada (o Implantado do Comercial). */
export type NegociacaoNoFim = { id: string; codigo: string; titulo: string; de: string; para: string };

/**
 * O que a etapa faz ao chegar (a janela de antes de mover): abrir a implantação, ligar no cadastro e levar a negociação
 * para o Implantado do Comercial; ou nada (os três nulos).
 */
export type OQueAEtapaFaz = {
  implantacao: PlanoDaImplantacao | null; cadastro: PlanoDoCadastro | null; negociacao: NegociacaoNoFim | null;
  /** o card de faturamento que a etapa abre (2.4.11); nulo: a etapa não abre (ou o painel dele saiu) */
  faturamento?: PlanoDoFaturamento | null;
};

/**
 * Para onde a negociação vai quando o card da implantação dela chega no fim (a etapa que liga no cadastro): a etapa do
 * painel dela que recebe a implantação terminada. Nada quando o painel não tem essa etapa, quando a negociação já está
 * nela, ou quando ela já acabou (o Ganho ou o Perdido: o faturamento já começou, ou a venda caiu — nada volta).
 */
export function etapaDoFimDaImplantacao(etapas: readonly EtapaPainel[], atualId: string): EtapaPainel | null {
  const para = etapas.find((e) => e.recebeImplantacao && !e.resultado);
  const atual = etapas.find((e) => e.id === atualId);
  if (!para || !atual || atual.id === para.id || atual.resultado) return null;
  return para;
}

/** O plano muda alguma coisa no cadastro? */
export const cadastroMuda = (p: PlanoDoCadastro) => p.produtos.some((x) => x.acao === 'novo' || x.acao === 'ativa') || p.modulos.some((m) => m.acao === 'liga');

/**
 * Os módulos escolhidos que o checklist ainda não marcou (2.3): em cada checklist dos módulos que aparece no chamado, os
 * escolhidos no campo de onde ele vem que não estão marcados nele. O nome do campo vai junto ("Ativação dos módulos").
 */
export function modulosSemMarcar(
  campos: readonly CampoPersonalizado[], produtosDoChamado: readonly string[], valores: ValoresDosCampos | null | undefined,
  produtos: ReadonlyArray<{ id: string; nome: string }>,
): Array<{ id: string; nome: string; produto: string; campo: string }> {
  const out: Array<{ id: string; nome: string; produto: string; campo: string }> = [];
  for (const c of campos) {
    if (c.tipo !== 'modulos' || !c.escolhidosEm || !c.produtoId || !campoAparece(c, produtosDoChamado)) continue;
    const marcados = new Set(Array.isArray(valores?.[c.id]) ? (valores![c.id] as string[]) : []);
    const { opcoes, foraDaEscolha } = modulosDoChecklist(c, valores);
    for (const o of opcoes) {
      if (!foraDaEscolha.has(o.id) && !marcados.has(o.id)) out.push({ id: o.id, nome: o.nome, produto: produtos.find((p) => p.id === c.produtoId)?.nome ?? '?', campo: c.nome });
    }
  }
  return out;
}

/**
 * Os módulos marcados no chamado: os campos "Módulos do produto" que aparecem nele, com as opções marcadas. O checklist
 * (2.3) não conta: o que liga no cadastro é a escolha (a Curadoria), "é a curadoria que define quais módulos devem ser ativos".
 */
export function modulosMarcados(
  campos: readonly CampoPersonalizado[], produtosDoChamado: readonly string[], valores: ValoresDosCampos | null | undefined,
  produtos: ReadonlyArray<{ id: string; nome: string }>,
): Array<{ id: string; nome: string; produtoId: string; produto: string }> {
  const out: Array<{ id: string; nome: string; produtoId: string; produto: string }> = [];
  for (const c of campos) {
    if (c.tipo !== 'modulos' || c.escolhidosEm || !c.produtoId || !campoAparece(c, produtosDoChamado)) continue;
    const v = valores?.[c.id];
    for (const id of Array.isArray(v) ? v : []) {
      const o = c.opcoes.find((x) => x.id === id);
      if (o) out.push({ id: o.id, nome: o.nome, produtoId: c.produtoId, produto: produtos.find((p) => p.id === c.produtoId)?.nome ?? '?' });
    }
  }
  return out;
}

