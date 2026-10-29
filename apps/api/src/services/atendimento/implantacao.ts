/**
 * A IMPLANTAÇÃO (Patch 2.3, decisão 0057) — o que acontece quando um chamado chega numa etapa que faz alguma coisa:
 *
 *  - a negociação (o painel de Vendas) chega na etapa que **abre a implantação** ("Em processo de Implantação": o Luan só
 *    marca o Ganho quando começa a faturar, para o relatório ficar certo): a empresa vira cliente (se ainda não é), os
 *    produtos dela entram no cadastro (sem a data de ativação: estão em implantação) e o card nasce no painel da
 *    implantação, ligado à negociação;
 *  - o card (o painel de Gestão) chega na etapa que **liga no cadastro** (o Implantado): os produtos ganham a data de
 *    ativação e os módulos marcados nos campos "Módulos do produto" ficam ligados na ficha do cliente.
 *
 * As contas (o que vai acontecer) são as do `@gestor/shared/implantacao.ts`, as mesmas da prévia e da janela que a tela
 * mostra antes de mover (`aoMover`). Aqui fica o que é do servidor: ler o cadastro, gravar dentro da transação do mover e
 * devolver o que a auditoria precisa. Nada trava além do que o cadastro exige (o CNPJ do cliente novo).
 */
import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import {
  clientUnits, clients, newId, productModules, subscriptionModules, subscriptions, ticketPanels, tickets, type Db,
} from '@gestor/db';
import {
  cadastroMuda, codigoDoChamado, diaLocal, etapaDeEntrada, etapaDoFimDaImplantacao, modulosMarcados, modulosSemMarcar, paraBusca, planoDaImplantacao, planoDoCadastro, temDataDeAtivacao,
  type AssinaturaNoCadastro, type EtapaPainel, type NegociacaoNoFim, type OQueAEtapaFaz, type Painel, type PedidoDoCliente, type PlanoDaImplantacao, type PlanoDoCadastro, type ValoresDosCampos,
} from '@gestor/shared';
import { camposDoPainel, pessoaDoAtor, registrarEvento, type Ator, type Contexto, type LinhaChamado } from './contexto.js';

type Banco = Db;
/** A transação do mover (o tipo da transação do Drizzle). */
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

/** O que a tela mostra antes de mover (a janela): o que a etapa vai fazer. Os dois nulos: a etapa não faz nada. */
export type AoMover = OQueAEtapaFaz;

const MATRIZ = 'Matriz';
const unicos = (xs: Array<string | null | undefined>) => [...new Set(xs.filter((x): x is string => !!x))];

/** O CNPJ que a negociação tem: o campo do painel chamado "CNPJ" (o do Comercial do Helena). */
function cnpjDoCampo(ctx: Contexto, t: LinhaChamado): string | null {
  const campo = camposDoPainel(ctx, t.panelId).find((c) => paraBusca(c.nome) === 'cnpj' && (c.tipo === 'texto' || c.tipo === 'texto_longo'));
  const v = campo ? (t.customFields as ValoresDosCampos | null)?.[campo.id] : null;
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

/** Os produtos que o cliente já tem no cadastro, com a data, se foi encerrado e os módulos ligados. */
async function assinaturasDoCliente(db: Banco | Tx, clienteId: string): Promise<Map<string, AssinaturaNoCadastro & { id: string }>> {
  const subs = await db.select({ id: subscriptions.id, productId: subscriptions.productId, ativadoEm: subscriptions.activatedAt, encerradoEm: subscriptions.deactivatedAt })
    .from(subscriptions).where(eq(subscriptions.clientId, clienteId));
  const mods = subs.length
    ? await db.select({ subscriptionId: subscriptionModules.subscriptionId, moduleId: subscriptionModules.moduleId }).from(subscriptionModules)
      .where(and(inArray(subscriptionModules.subscriptionId, subs.map((s) => s.id)), isNull(subscriptionModules.deactivatedAt)))
    : [];
  return new Map(subs.map((s) => [s.productId, {
    id: s.id, ativadoEm: s.ativadoEm ? s.ativadoEm.toISOString() : null, encerrado: !!s.encerradoEm,
    modulosLigados: new Set(mods.filter((m) => m.subscriptionId === s.id).map((m) => m.moduleId)),
  }]));
}

/**
 * O plano da implantação da negociação que vai para `para` (nulo: a etapa não abre a implantação, ou o painel dela saiu):
 * o cliente, os produtos e o card. `pedido`: o que a janela mandou (o cliente escolhido, ou o nome e o CNPJ do novo).
 */
export async function planoDaImplantacaoDaNegociacao(db: Banco, ctx: Contexto, t: LinhaChamado, painel: Painel, para: EtapaPainel, pedido?: PedidoDoCliente): Promise<PlanoDaImplantacao | null> {
  if (painel.tipo !== 'vendas' || !para.abreImplantacao) return null;
  const destino = ctx.paineis.find((p) => p.id === para.abreImplantacao && p.tipo === 'gestao');
  if (!destino) return null;
  const [ja] = await db.select({ code: tickets.code }).from(tickets).where(and(eq(tickets.sourceTicketId, t.id), isNull(tickets.deletedAt))).limit(1);
  const escolhido = !t.clientId && pedido?.clienteId
    ? (await db.select({ id: clients.id, nome: clients.tradeName }).from(clients).where(and(eq(clients.id, pedido.clienteId), isNull(clients.deletedAt))).limit(1))[0] ?? null
    : null;
  const cnpj = (pedido?.cnpj ?? '').replace(/\D/g, '') || (cnpjDoCampo(ctx, t) ?? '').replace(/\D/g, '');
  const peloCnpj = !t.clientId && !escolhido && cnpj.length === 14
    ? (await db.select({ id: clients.id, nome: clients.tradeName }).from(clients).where(and(eq(clients.cnpj, cnpj), isNull(clients.deletedAt))).limit(1))[0] ?? null
    : null;
  // o CNPJ não repete no cadastro, nem com a lixeira: o cliente que está lá precisa voltar antes
  const naLixeira = !t.clientId && !escolhido && !peloCnpj && cnpj.length === 14
    ? (await db.select({ nome: clients.tradeName }).from(clients).where(eq(clients.cnpj, cnpj)).limit(1))[0] ?? null
    : null;
  const clienteId = t.clientId ?? escolhido?.id ?? peloCnpj?.id ?? null;
  const doCliente = clienteId ? await assinaturasDoCliente(db, clienteId) : new Map();
  return planoDaImplantacao({
    painel: { id: destino.id, nome: destino.nome, sigla: destino.sigla, etapaDeEntrada: etapaDeEntrada(destino.etapas)?.nome ?? null },
    negociacao: {
      clienteId: t.clientId, clienteNome: t.clientId ? ctx.clientes.get(t.clientId) ?? null : null, empresa: t.prospect, cnpjDoCampo: cnpjDoCampo(ctx, t),
      produtos: t.productIds.map((id) => ({ id, nome: ctx.produtos.get(id)?.nome ?? '?' })),
    },
    clientePeloCnpj: peloCnpj, clienteEscolhido: escolhido, clienteNaLixeira: naLixeira, produtosDoCliente: new Set(doCliente.keys()), jaAberta: ja ? { codigo: ja.code } : null, pedido,
  });
}

/** O plano do cadastro do chamado que vai para `para` (nulo: a etapa não liga no cadastro). */
export async function planoDoCadastroDoChamado(db: Banco, ctx: Contexto, t: LinhaChamado, painel: Painel, para: EtapaPainel): Promise<PlanoDoCadastro | null> {
  if (painel.tipo !== 'gestao' || !para.ligaNoCadastro) return null;
  const dia = diaLocal(ctx.agora);
  const cliente = t.clientId ? { id: t.clientId, nome: ctx.clientes.get(t.clientId) ?? '(cliente)' } : null;
  const produtos = t.productIds.map((id) => ({ id, nome: ctx.produtos.get(id)?.nome ?? '?', semData: !temDataDeAtivacao(ctx.produtos.get(id)?.codigo ?? '') }));
  const campos = camposDoPainel(ctx, painel.id);
  const valores = t.customFields as ValoresDosCampos | null;
  const mods = modulosMarcados(campos, t.productIds, valores, produtos);
  // os escolhidos na Curadoria que o checklist da Configuração ainda não marcou: a janela avisa (nada trava)
  const semMarcar = modulosSemMarcar(campos, t.productIds, valores, produtos);
  return planoDoCadastro({ etapa: para.nome, dia, cliente, produtos, modulosMarcados: mods, semMarcar, assinaturas: cliente ? await assinaturasDoCliente(db, cliente.id) : new Map() });
}

/** A negociação do card que chega no fim da implantação, de onde ela sai e para onde vai (o Implantado do Comercial). */
export type FimNaNegociacao = { linha: LinhaChamado; painel: Painel; de: EtapaPainel; para: EtapaPainel; mostra: NegociacaoNoFim };

/**
 * O card que chega na etapa que liga no cadastro (o Implantado) leva a negociação de onde veio para a etapa do painel dela
 * que recebe a implantação terminada (o pedido do Luan: "vai mover de em processo de implantação para implantado quando a
 * gente concluir a implantação"). Nulo: o card não veio de uma negociação, ela saiu, o painel dela não tem essa etapa, ela
 * já está lá ou já acabou (o Ganho ou o Perdido).
 */
export async function negociacaoNoFim(db: Banco, ctx: Contexto, t: LinhaChamado, painel: Painel, para: EtapaPainel): Promise<FimNaNegociacao | null> {
  if (painel.tipo !== 'gestao' || !para.ligaNoCadastro || !t.sourceTicketId) return null;
  const [linha] = await db.select().from(tickets).where(and(eq(tickets.id, t.sourceTicketId), isNull(tickets.deletedAt))).limit(1);
  const dela = linha ? ctx.paineis.find((p) => p.id === linha.panelId && p.tipo === 'vendas') : undefined;
  if (!linha || !dela) return null;
  const alvo = etapaDoFimDaImplantacao(dela.etapas, linha.stageId);
  const de = dela.etapas.find((x) => x.id === linha.stageId);
  if (!alvo || !de) return null;
  return { linha, painel: dela, de, para: alvo, mostra: { id: linha.id, codigo: linha.code, titulo: linha.title, de: de.nome, para: alvo.nome } };
}

/** O que a janela mostra antes de mover para a etapa (as três coisas que uma etapa pode fazer). */
export async function aoMover(db: Banco, ctx: Contexto, t: LinhaChamado, painel: Painel, para: EtapaPainel, pedido?: PedidoDoCliente): Promise<AoMover> {
  return {
    implantacao: await planoDaImplantacaoDaNegociacao(db, ctx, t, painel, para, pedido),
    cadastro: await planoDoCadastroDoChamado(db, ctx, t, painel, para),
    negociacao: (await negociacaoNoFim(db, ctx, t, painel, para))?.mostra ?? null,
  };
}

/** A linha da auditoria que a implantação acrescenta (a rota grava junto com a do mover). */
export type AuditoriaExtra = { action: 'create' | 'update'; entityType: string; entityId: string; summary: string; after?: unknown };

/** O que a implantação abriu (para a frase do mover e a auditoria). */
export type ImplantacaoAberta = { id: string; codigo: string; titulo: string; clienteNovo: { id: string; nome: string } | null; cliente: { id: string; nome: string }; produtosNovos: string[]; auditoria: AuditoriaExtra[] };

/**
 * Abre a implantação, dentro da transação do mover: o cliente (o que vai ser criado entra no cadastro, com a Matriz; a
 * negociação passa a ser dele, e o título que era o nome da empresa acompanha), os produtos que ele não tem (sem a data
 * de ativação: a data vem no Implantado) e o card, na entrada do painel da implantação, com o cliente, o contato, os
 * produtos e quem cuidava da negociação como observador. O histórico dos dois diz de onde veio e para onde foi.
 */
export async function abrirAImplantacao(
  tx: Tx, e: { ctx: Contexto; t: LinhaChamado; agora: Date; quando: () => Date }, ator: Ator, plano: PlanoDaImplantacao,
): Promise<ImplantacaoAberta | null> {
  if (plano.jaAberta) return null;
  const { ctx, t, agora } = e;
  const destino = ctx.paineis.find((p) => p.id === plano.painel.id)!;
  const entrada = etapaDeEntrada(destino.etapas);
  if (!entrada) return null;
  const pessoa = pessoaDoAtor(ator);
  const auditoria: AuditoriaExtra[] = [];

  // 1. o cliente
  let cliente: { id: string; nome: string };
  let clienteNovo: { id: string; nome: string } | null = null;
  if (plano.cliente.tipo === 'cadastro') {
    cliente = { id: plano.cliente.id, nome: plano.cliente.nome };
  } else {
    const c = plano.cliente;
    const id = newId();
    await tx.insert(clients).values({ id, tradeName: c.nomeFantasia, legalName: c.razaoSocial, cnpj: c.cnpj!, archived: false, notes: `Criado pela negociação ${t.code}, ao abrir a implantação.` });
    await tx.insert(clientUnits).values({ id: newId(), clientId: id, name: MATRIZ, isMain: true });
    cliente = { id, nome: c.nomeFantasia };
    clienteNovo = cliente;
    auditoria.push({
      action: 'create', entityType: 'client', entityId: id,
      summary: `Criou o cliente ${c.nomeFantasia} (CNPJ ${c.cnpj}) pela negociação ${t.code}, ao abrir a implantação`,
      after: { tradeName: c.nomeFantasia, legalName: c.razaoSocial, cnpj: c.cnpj },
    });
  }
  // a negociação passa a ser do cliente (o "Virou cliente?" de uma vez): o título que era o nome da empresa acompanha
  if (t.clientId !== cliente.id) {
    const titulo = t.prospect && paraBusca(t.title) === paraBusca(t.prospect) ? cliente.nome.slice(0, 200) : t.title;
    await tx.update(tickets).set({ clientId: cliente.id, prospect: null, title: titulo, updatedAt: agora, lastActivityAt: agora }).where(eq(tickets.id, t.id));
    if (titulo !== t.title) await registrarEvento(tx, t.id, 'campo', ator, { campo: 'Título', de: t.title, para: titulo }, e.quando());
    // o cliente de antes (a empresa que ainda não era cliente não conta: o histórico diria "de X para X")
    await registrarEvento(tx, t.id, 'campo', ator, { campo: 'Cliente', de: t.clientId ? ctx.clientes.get(t.clientId) ?? null : null, para: cliente.nome }, e.quando());
  }

  // 2. os produtos que o cliente não tem: entram sem a data de ativação (estão em implantação)
  const ja = await assinaturasDoCliente(tx, cliente.id);
  const novos = t.productIds.filter((id) => !ja.has(id));
  if (novos.length) {
    await tx.insert(subscriptions).values(novos.map((productId) => ({ id: newId(), clientId: cliente.id, productId, activatedAt: null, notes: null })));
    const nomes = novos.map((id) => ctx.produtos.get(id)?.nome ?? '?');
    auditoria.push({
      action: 'update', entityType: 'client', entityId: cliente.id,
      summary: `Pôs ${nomes.join(', ')} no cadastro de ${cliente.nome} (em implantação, sem a data de ativação), pela negociação ${t.code}`,
      after: { produtos: nomes },
    });
  }

  // 3. o card, na entrada do painel da implantação (o número seguinte da sigla, com a linha do painel travada)
  const [n] = await tx.update(ticketPanels).set({ nextNumber: sql`${ticketPanels.nextNumber} + 1` })
    .where(eq(ticketPanels.id, destino.id)).returning({ numero: sql<number>`${ticketPanels.nextNumber} - 1` });
  const numero = Number(n!.numero);
  const codigo = codigoDoChamado(destino.sigla, numero);
  const id = newId();
  const titulo = plano.titulo;
  const observadores = unicos([t.assigneeId, ...t.watcherIds]);
  const descricao = [`Da negociação ${t.code}.`, t.description?.trim() ? `\n${t.description.trim()}` : ''].join('');
  await tx.insert(tickets).values({
    id, panelId: destino.id, stageId: entrada.id, number: numero, code: codigo, kind: 'chamado', title: titulo,
    description: descricao, clientId: cliente.id, contactName: t.contactName, contactPhone: t.contactPhone, contactEmail: t.contactEmail, otherContacts: t.otherContacts ?? [],
    origin: 'comercial', productIds: [...t.productIds], watcherIds: observadores, sourceTicketId: t.id,
    lastActivityAt: agora, createdById: pessoa, createdAt: agora, updatedAt: agora,
  });
  await registrarEvento(tx, id, 'criado', ator, { origem: 'comercial', etapa: entrada.nome, etapaId: entrada.id, painel: destino.nome }, e.quando());
  await registrarEvento(tx, id, 'implantacao', ator, { acao: 'veio', codigo: t.code, titulo: t.title }, e.quando());
  const produtosNovos = novos.map((x) => ctx.produtos.get(x)?.nome ?? '?');
  await registrarEvento(tx, t.id, 'implantacao', ator, {
    acao: 'abriu', codigo, painel: destino.nome, clienteNovo: !!clienteNovo, cliente: cliente.nome, produtos: produtosNovos,
  }, e.quando());
  auditoria.push({
    action: 'create', entityType: 'ticket', entityId: id,
    summary: `Abriu ${codigo} "${titulo}" no painel ${destino.nome}, pela negociação ${t.code}`,
  });
  return { id, codigo, titulo, clienteNovo, cliente, produtosNovos, auditoria };
}

/** O que o Implantado ligou no cadastro (para a frase do mover e a auditoria). */
export type CadastroLigado = { produtos: string[]; modulos: string[]; auditoria: AuditoriaExtra[] };

/**
 * Liga no cadastro, dentro da transação do mover, o que o plano diz: o produto que o cliente não tinha entra ativo desde
 * hoje (ao meio-dia UTC, como toda data de calendário); o que estava em implantação (sem data) ganha a de hoje; o ativo e
 * o encerrado ficam como estão. Os módulos marcados ligam desde hoje (o desligado antes volta a ser ligado). O histórico do
 * card diz o que mudou — ou que já estava em dia.
 */
export async function ligarNoCadastro(tx: Tx, e: { t: LinhaChamado; quando: () => Date }, ator: Ator, plano: PlanoDoCadastro): Promise<CadastroLigado | null> {
  if (!plano.cliente) return null;
  const cliente = plano.cliente;
  const quando = new Date(`${plano.dia}T12:00:00Z`);
  const ja = await assinaturasDoCliente(tx, cliente.id);
  const produtos: string[] = [];
  const modulos: string[] = [];
  for (const p of plano.produtos) {
    if (p.acao === 'novo' && !ja.has(p.id)) {
      const id = newId();
      // o Equipamentos não tem data de ativação (decisão 0034): entra sem ela
      await tx.insert(subscriptions).values({ id, clientId: cliente.id, productId: p.id, activatedAt: p.semData ? null : quando });
      ja.set(p.id, { id, ativadoEm: p.semData ? null : quando.toISOString(), encerrado: false, modulosLigados: new Set() });
      produtos.push(p.nome);
    } else if (p.acao === 'ativa') {
      const a = ja.get(p.id);
      if (a && !a.ativadoEm && !a.encerrado) {
        await tx.update(subscriptions).set({ activatedAt: quando, updatedAt: new Date() }).where(eq(subscriptions.id, a.id));
        produtos.push(p.nome);
      }
    }
  }
  for (const m of plano.modulos) {
    if (m.acao !== 'liga') continue;
    const a = ja.get(m.produtoId);
    if (!a || a.encerrado || a.modulosLigados.has(m.id)) continue;
    const [mod] = await tx.select({ id: productModules.id }).from(productModules).where(and(eq(productModules.id, m.id), isNull(productModules.deletedAt))).limit(1);
    if (!mod) continue;
    const [linha] = await tx.select({ id: subscriptionModules.id }).from(subscriptionModules)
      .where(and(eq(subscriptionModules.subscriptionId, a.id), eq(subscriptionModules.moduleId, m.id))).limit(1);
    if (linha) await tx.update(subscriptionModules).set({ activatedAt: quando, deactivatedAt: null, updatedAt: new Date() }).where(eq(subscriptionModules.id, linha.id));
    else await tx.insert(subscriptionModules).values({ id: newId(), subscriptionId: a.id, moduleId: m.id, activatedAt: quando });
    a.modulosLigados = new Set([...a.modulosLigados, m.id]);
    modulos.push(`${m.nome} (${m.produto})`);
  }
  await registrarEvento(tx, e.t.id, 'cadastro', ator, { cliente: cliente.nome, produtos, modulos, dia: plano.dia, etapa: plano.etapa }, e.quando());
  if (!produtos.length && !modulos.length) return { produtos, modulos, auditoria: [] };
  return {
    produtos, modulos,
    auditoria: [{
      action: 'update', entityType: 'client', entityId: cliente.id,
      summary: `Ligou no cadastro de ${cliente.nome}${produtos.length ? ` ${produtos.join(', ')}` : ''}${modulos.length ? `${produtos.length ? ' e' : ''} os módulos ${modulos.join(', ')}` : ''}, desde ${plano.dia.split('-').reverse().join('/')} (o ${e.t.code} chegou em ${plano.etapa})`,
      after: { produtos, modulos, dia: plano.dia },
    }],
  };
}

export { cadastroMuda };
