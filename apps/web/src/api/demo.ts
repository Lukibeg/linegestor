/**
 * API DE DEMONSTRAÇÃO — tudo em memória, com dados fictícios.
 *
 * Serve para publicar uma prévia clicável da interface sem servidor nem banco.
 * Implementa as mesmas regras principais do servidor (contagem de afetados na edição em massa,
 * só movimenta aparelho para cliente com Equipamentos, senha só sai com confirmação e vai para a auditoria…),
 * mas de forma simplificada. Recarregar a página volta ao estado inicial.
 *
 * Entrar: qualquer um destes e-mails com a senha "demo":
 *   admin@gestor.local (Administrador) · tecnico@gestor.local (Técnico) · operador@gestor.local (Operador) · leitor@gestor.local (Leitor)
 */
import { ALL_PERMISSIONS, DEFAULT_ROLES, FiltrosChamadosSchema, ListaChamadosSchema, MODULOS_INICIAIS, PERMISSIONS, PRODUTOS_INICIAIS, VAZIO, camposDeLista, listarChamados, resumirChamados, type Chamado, type ContextoChamados, cnpjLimpo, cnpjValido, diaAoMeioDia, didFormatado, didLimpo, gerarFaixaDids, identificacaoAparelho, macFormatado, macLimpo, macValido, MODALIDADES, reais, serieLimpa } from '@gestor/shared';
import type { Api } from './index.js';
import { NOTA_DEMO } from './novidades-demo.js';
import { ApiError, type AjustesLineChat, type AuditItem, type LeiturasNovidade, type Novidade, type NovidadeItem, type NovidadePendente, type Projeto, type ProjetoResumo, type OpcaoEtapa, type EtapaProjeto, type ProjetoDoCliente, type SituacaoProjeto, type AnexoProjeto, type Circuit, type ClientDeviceLogin, type ClientFull, type ClientListItem, type ClientUnit, type Device, type Did, type DeviceModel, type InventorySummary, type Me, type Movement, type Product, type ProductModule, type Subscription, type SubscriptionModule } from './types.js';

const wait = (ms = 120) => new Promise((r) => setTimeout(r, ms));
let seq = 1000;
const id = () => 'demo' + (seq++).toString(36);
const now = () => new Date().toISOString();
const daysAgo = (d: number, h = 10) => { const x = new Date(); x.setDate(x.getDate() - d); x.setHours(h, 0, 0, 0); return x.toISOString(); };
/** Uma data de calendário daqui a N dias, no formato "AAAA-MM-DD" (o prazo do projeto). */
const emDias = (d: number) => { const x = new Date(); x.setDate(x.getDate() + d); return x.toISOString().slice(0, 10); };
/** Data de calendário: guardada ao meio-dia UTC, como no servidor (não "volta um dia" no Brasil). */
const dia = (v: unknown) => { if (v == null || v === '') return null; const d = new Date(String(v)); return Number.isNaN(d.getTime()) ? null : diaAoMeioDia(d).toISOString(); };

// ---------------- estado ----------------
type Client = { id: string; tradeName: string; legalName: string; cnpj: string; logoUrl: string | null; archived: boolean; isInternal: boolean; internalCode: string | null; notes: string | null; deletedAt: string | null; createdAt: string; updatedAt: string };
type Sub = { id: string; clientId: string; productCode: string; activatedAt: string | null; deactivatedAt: string | null; notes: string | null; settings: Record<string, any> };
/** Um módulo ligado numa assinatura (ex.: FOP2 dentro do LinePBX do cliente X). */
type SubMod = { id: string; subscriptionId: string; moduleId: string; activatedAt: string | null; deactivatedAt: string | null; notes: string | null; settings: Record<string, any> };
type ModRow = ProductModule & { productId: string };
type CircuitRow = { id: string; name: string; code: string; keyNumber: string | null; carrierId: string | null; channels: number; ownerClientId: string | null; monthlyValueCents: number | null; authType: 'ip' | 'login'; signalingIp: string | null; authIp: string | null; authUsername: string | null; authPasswordSecretId: string | null; notes: string | null; thirdParty: boolean; deletedAt: string | null };
type DidRow = { id: string; number: string; circuitId: string | null; clientId: string | null; ownerClientId: string | null; inUse: boolean; note: string | null; deletedAt: string | null };
/** `image` é a foto embutida ("data:…"), como a logo do cliente na demonstração */
type ModelRow = { id: string; code: string; name: string; categoryId: string | null; image: string | null; valueCents: number | null; deletedAt: string | null };
type DeviceRow = { id: string; modelId: string; mac: string | null; macSecondary: string | null; serialNumber: string | null; clientId: string | null; unit: string | null; currentModality: string | null; condition: string; valueCents: number | null; ip: string | null; location: string | null; note: string | null; deletedAt: string | null; createdAt: string };
type MovRow = { id: string; modality: string; fromClientId: string | null; toClientId: string | null; unit: string | null; newCondition: string | null; note: string | null; userId: string; createdAt: string; items: Array<{ modelId: string; deviceId: string }> };
type UnitRow = { id: string; clientId: string; name: string; isMain: boolean; address: string | null; egressIp: string | null; note: string | null; createdAt: string; deletedAt: string | null };
/** Login e senha padrão dos aparelhos de um modelo no cliente (a senha mora em `S.secrets`) */
type LoginRow = { id: string; clientId: string; modelId: string; username: string | null; passwordSecretId: string | null; note: string | null; updatedAt: string; deletedAt: string | null };
/** Rede padrão dos aparelhos do cliente */
type NetRow = { clientId: string; ipAddress: string | null; subnetMask: string | null; defaultRouter: string | null; dns1: string | null; dns2: string | null; wirelessPasswordSecretId: string | null; note: string | null; updatedAt: string };
/** Uma nota de novidades na demonstração (a imagem fica embutida, como a logo do cliente) */
type NotaRow = { id: string; version: string; title: string; summary: string | null; publishedAt: string | null; createdAt: string; updatedAt: string; deletedAt: string | null; items: Array<{ id: string; kind: NovidadeItem['kind']; title: string; text: string | null; imagem: string | null }> };
/** Projetos na demonstração: o projeto, as etapas, a lista de clientes e o que já foi marcado. */
type ProjRow = { id: string; name: string; goal: string | null; status: 'aberto' | 'concluido' | 'cancelado'; dueDate: string | null; ownerId: string | null; closedAt: string | null; createdAt: string; updatedAt: string; deletedAt: string | null };
type StepRow = { id: string; projectId: string; title: string; kind: 'check' | 'escolha'; options: OpcaoEtapa[]; sortOrder: number };
type PClientRow = { id: string; projectId: string; clientId: string; assigneeId: string | null; status: SituacaoProjeto; blockedReason: string | null; doneAt: string | null };
type CheckRow = { projectClientId: string; stepId: string; value: string | null; doneById: string | null; doneAt: string };
type PCommentRow = { id: string; projectId: string; projectClientId: string | null; userId: string | null; body: string; createdAt: string; deletedAt: string | null };
type PFileRow = { id: string; projectId: string; projectClientId: string | null; fileName: string; mimeType: string; sizeBytes: number; conteudo: string; uploadedById: string | null; createdAt: string; deletedAt: string | null };

type UserRow = { id: string; name: string; email: string; password: string; roleId: string; active: boolean; lastLoginAt: string | null; totpSecret?: string | null; totpOn?: boolean; recovery?: string[]; sshUser?: string | null };
type RoleRow = { id: string; key: string | null; name: string; description: string | null; permissions: string[]; isSystem: boolean };

const S = {
  clients: [] as Client[], subs: [] as Sub[], circuits: [] as CircuitRow[], dids: [] as DidRow[], models: [] as ModelRow[], devices: [] as DeviceRow[], movements: [] as MovRow[], units: [] as UnitRow[], deviceLogins: [] as LoginRow[], networks: [] as NetRow[],
  users: [] as UserRow[], roles: [] as RoleRow[], secrets: new Map<string, { label: string; value: string }>(),
  notas: [] as NotaRow[], leituras: [] as Array<{ noteId: string; userId: string; readAt: string }>,
  projetos: [] as ProjRow[], etapas: [] as StepRow[], projClientes: [] as PClientRow[], marcas: [] as CheckRow[],
  projComentarios: [] as PCommentRow[], projAnexos: [] as PFileRow[],
  ajustesBackup: {
    ativo: false, pasta: 'Backups › Ingline Gestão', pastaId: '', contaDeServico: '',
    ultimoEnvioEm: null as string | null, ultimoEnvioOk: null as boolean | null, ultimoEnvioMsg: null as string | null, temChave: false,
  },
  ajustesAvisos: {
    ativo: false,
    url: '',
    metodo: 'POST' as 'POST' | 'GET',
    cabecalhos: '{\n  "Content-Type": "application/json",\n  "Authorization": "Bearer {{token}}"\n}',
    corpo: '{\n  "numero": "5571999999999",\n  "mensagem": "{{mensagem}}"\n}',
    ultimoTesteEm: null as string | null, ultimoTesteOk: null as boolean | null, ultimoTesteMsg: null as string | null, temToken: false,
  },
  // a leitura do LineChat já vem ligada na demonstração, com chamados inventados
  ajustesLineChat: {
    ativo: true, url: 'https://api.inglinechat.com.br', appUrl: 'https://inglinechat.com.br',
    painelId: 'painel-demo', painelNome: 'Ingline - Suporte (demonstração)', temToken: true,
    inicioEm: null as string | null, ultimaEm: null as string | null, ultimaOk: true as boolean | null,
    ultimaMsg: 'Atualização: 0 cards lidos.' as string | null, ultimaCompletaEm: null as string | null,
  },
  carriers: [] as { id: string; name: string; active: boolean }[], hostings: [] as { id: string; name: string; active: boolean }[], categories: [] as { id: string; name: string; active: boolean }[],
  products: PRODUTOS_INICIAIS.map((p, i) => ({ id: 'p' + p.code, code: p.code as string, name: p.name as string, color: p.color as string, hasSettings: p.hasSettings as boolean, description: p.description as string | null, sortOrder: i, active: true, deletedAt: null as string | null })),
  modules: MODULOS_INICIAIS.map((m, i) => ({ id: 'm' + m.product + '_' + m.code, productId: 'p' + m.product, code: m.code, name: m.name, description: m.description as string | null, hasSettings: m.hasSettings, sortOrder: i, active: true })) as ModRow[],
  subMods: [] as SubMod[],
  audit: [] as (AuditItem & { userId: string | null })[],
  me: null as UserRow | null,
};

function audit(action: string, entityType: string, summary: string, entityId: string | null = null) {
  S.audit.unshift({ id: id(), action, entityType, entityId, summary, before: null, after: null, userName: S.me?.name ?? null, userId: S.me?.id ?? null, createdAt: now() });
}
const notFound = (w = 'Registro') => new ApiError(404, `${w} não encontrado`);
const bad = (m: string) => new ApiError(400, m);
function requirePerm(p: string) { if (!S.me) throw new ApiError(401, 'Faça login para continuar'); const r = S.roles.find((x) => x.id === S.me!.roleId)!; if (!r.permissions.includes(p)) throw new ApiError(403, `Esta ação exige a permissão "${p}"`); }

// ---------------- fotos dos modelos (desenhos simples, só para a prévia) ----------------
const svg = (conteudo: string) => 'data:image/svg+xml;base64,' + btoa(`<svg xmlns="http://www.w3.org/2000/svg" width="160" height="120" viewBox="0 0 160 120">${conteudo}</svg>`);
/** Um telefone de mesa genérico: base, fone e teclado. */
const FOTO_TELEFONE = (cor: string) => svg(`<rect x="34" y="40" width="96" height="62" rx="10" fill="${cor}"/><rect x="18" y="28" width="22" height="78" rx="11" fill="${cor}" stroke="#555" stroke-width="2"/><rect x="50" y="48" width="44" height="18" rx="3" fill="#9FC4E8"/>${Array.from({ length: 9 }, (_, i) => `<circle cx="${60 + (i % 3) * 12}" cy="${76 + Math.floor(i / 3) * 8}" r="3" fill="#D1D5DB"/>`).join('')}<rect x="102" y="50" width="20" height="4" rx="2" fill="#6B7280"/><rect x="102" y="58" width="20" height="4" rx="2" fill="#6B7280"/>`);
/** Um headset genérico: arco e duas conchas com microfone. */
const FOTO_HEADSET = svg(`<path d="M44 72 Q44 22 80 22 Q116 22 116 72" fill="none" stroke="#374151" stroke-width="8" stroke-linecap="round"/><rect x="34" y="62" width="20" height="32" rx="8" fill="#1F2937"/><rect x="106" y="62" width="20" height="32" rx="8" fill="#1F2937"/><path d="M44 94 Q52 108 76 106" fill="none" stroke="#374151" stroke-width="4" stroke-linecap="round"/><circle cx="78" cy="106" r="5" fill="#111827"/>`);

// ---------------- carga inicial ----------------
// ---------------- projetos ----------------
const temPerm = (perm: string) => !!S.me && (S.roles.find((r) => r.id === S.me!.roleId)?.permissions.includes(perm) ?? false);
const projetosVivos = () => S.projetos.filter((p) => !p.deletedAt);
const projetoOu404 = (idp: string) => { const p = projetosVivos().find((x) => x.id === idp); if (!p) throw notFound('Projeto'); return p; };
const linhaOu404 = (projectId: string, linhaId: string) => { const l = S.projClientes.find((x) => x.id === linhaId && x.projectId === projectId); if (!l) throw bad('Este cliente não está no projeto'); return l; };
const FECHADAS_DEMO: SituacaoProjeto[] = ['concluido', 'nao_se_aplica'];
/** Caixinha: basta a marca existir. Lista: a opção escolhida precisa ser uma que "resolve". */
const resolvida = (e: StepRow, m?: CheckRow) => !!m && (e.kind !== 'escolha' || (e.options ?? []).some((o) => o.id === m.value && o.conclui));
const MANUAIS_DEMO: SituacaoProjeto[] = ['travado', 'nao_se_aplica'];

/** A situação anda sozinha conforme as marcas — menos em "travado" e "não se aplica". */
function recalcular(l: PClientRow) {
  if (MANUAIS_DEMO.includes(l.status)) return l;
  const etapas = S.etapas.filter((e) => e.projectId === l.projectId);
  const feitas = etapas.filter((e) => resolvida(e, S.marcas.find((m) => m.projectClientId === l.id && m.stepId === e.id))).length;
  l.status = etapas.length > 0 && feitas >= etapas.length ? 'concluido' : feitas > 0 ? 'andamento' : 'pendente';
  l.doneAt = l.status === 'concluido' ? now() : null;
  return l;
}

function gravarEtapas(projectId: string, etapas: EtapaProjeto[]) {
  const mantidos = new Set(etapas.map((e) => e.id).filter(Boolean) as string[]);
  const sumiram = S.etapas.filter((e) => e.projectId === projectId && !mantidos.has(e.id)).map((e) => e.id);
  S.etapas = S.etapas.filter((e) => e.projectId !== projectId || mantidos.has(e.id));
  S.marcas = S.marcas.filter((m) => !sumiram.includes(m.stepId));
  etapas.forEach((e, i) => {
    const kind = e.kind ?? 'check';
    // opção sem id ganha um; a que já tinha mantém o dele (trocar o rótulo não perde a escolha)
    const options: OpcaoEtapa[] = kind === 'escolha' ? (e.options ?? []).map((o) => ({ id: o.id ?? id(), label: o.label, tone: o.tone, conclui: o.conclui })) : [];
    const atual = e.id ? S.etapas.find((x) => x.id === e.id) : null;
    if (atual) {
      const virou = atual.kind !== kind;
      atual.title = e.title; atual.kind = kind; atual.options = options; atual.sortOrder = i;
      const vivas = new Set(options.map((o) => o.id));
      // opção apagada (ou mudou de tipo): a escolha de quem estava nela some
      S.marcas = S.marcas.filter((m) => m.stepId !== atual.id || (!virou && (kind !== 'escolha' || (!!m.value && vivas.has(m.value)))));
    } else {
      S.etapas.push({ id: id(), projectId, title: e.title, kind, options, sortOrder: i });
    }
  });
}

/** Quem já está na lista é ignorado: não duplica nem zera o que já foi feito. */
function entrarNaLista(projectId: string, clientIds: string[], assigneeId: string | null = null) {
  let n = 0;
  for (const clientId of [...new Set(clientIds)]) {
    if (!S.clients.some((c) => c.id === clientId && !c.deletedAt)) continue;
    if (S.projClientes.some((x) => x.projectId === projectId && x.clientId === clientId)) continue;
    S.projClientes.push({ id: id(), projectId, clientId, assigneeId, status: 'pendente', blockedReason: null, doneAt: null });
    n++;
  }
  return n;
}

const zeradoDemo = (): Record<SituacaoProjeto, number> => ({ pendente: 0, andamento: 0, travado: 0, concluido: 0, nao_se_aplica: 0 });
function contarLinhas(projectId: string) {
  const linhas = S.projClientes.filter((x) => x.projectId === projectId);
  const contagem = zeradoDemo();
  for (const l of linhas) contagem[l.status] += 1;
  const total = linhas.length;
  const fechadas = contagem.concluido + contagem.nao_se_aplica;
  return { linhas, contagem, total, fechadas, faltam: total - fechadas, andamento: total ? Math.round((fechadas / total) * 100) : 0 };
}
const atrasadoDemo = (p: ProjRow, faltam: number) => p.status === 'aberto' && !!p.dueDate && faltam > 0 && p.dueDate < new Date().toISOString().slice(0, 10);

function resumoProjeto(p: ProjRow): ProjetoResumo {
  const c = contarLinhas(p.id);
  return {
    id: p.id, name: p.name, goal: p.goal, status: p.status, dueDate: p.dueDate,
    ownerId: p.ownerId, ownerName: S.users.find((u) => u.id === p.ownerId)?.name ?? null,
    closedAt: p.closedAt, createdAt: p.createdAt, updatedAt: p.updatedAt,
    etapas: S.etapas.filter((e) => e.projectId === p.id).length,
    total: c.total, faltam: c.faltam, contagem: c.contagem, andamento: c.andamento, atrasado: atrasadoDemo(p, c.faltam),
  };
}

function projetoCompleto(p: ProjRow): Projeto {
  const c = contarLinhas(p.id);
  const etapas = S.etapas.filter((e) => e.projectId === p.id).sort((a, b) => a.sortOrder - b.sortOrder);
  /**
   * Como está cada passo: quantos clientes em cada opção (ou feito/falta, na caixinha).
   * É o "quantas mensagens enviadas, quantos confirmaram" — a leitura por coluna, não por cliente.
   */
  const porEtapa = etapas.map((e) => {
    const marcas0 = c.linhas.map((l) => S.marcas.find((m) => m.projectClientId === l.id && m.stepId === e.id));
    const resolvidas = marcas0.filter((m) => resolvida(e, m)).length;
    return {
      stepId: e.id, title: e.title, kind: e.kind,
      total: c.total, resolvidas, faltam: c.total - resolvidas,
      faixas: e.kind === 'escolha'
        ? [
            ...(e.options ?? []).map((o) => ({ valor: o.id, label: o.label, tone: o.tone, conclui: o.conclui, n: marcas0.filter((m) => m?.value === o.id).length })),
            { valor: '', label: 'Em branco', tone: 'muted' as const, conclui: false, n: marcas0.filter((m) => !m).length },
          ]
        : [
            { valor: 'feito', label: 'Feito', tone: 'ok' as const, conclui: true, n: resolvidas },
            { valor: '', label: 'Falta', tone: 'muted' as const, conclui: false, n: c.total - resolvidas },
          ],
    };
  });
  const etapasFeitas = c.linhas.reduce((a, l) => a + etapas.filter((e) => resolvida(e, S.marcas.find((m) => m.projectClientId === l.id && m.stepId === e.id))).length, 0);
  return {
    id: p.id, name: p.name, goal: p.goal, status: p.status, dueDate: p.dueDate,
    ownerId: p.ownerId, ownerName: S.users.find((u) => u.id === p.ownerId)?.name ?? null,
    closedAt: p.closedAt, createdAt: p.createdAt, updatedAt: p.updatedAt,
    etapas: etapas.map((e) => ({ id: e.id, title: e.title, kind: e.kind, options: e.options ?? [], sortOrder: e.sortOrder })),
    clientes: c.linhas
      .map((l) => {
        const cli = S.clients.find((x) => x.id === l.clientId)!;
        return {
          id: l.id, clientId: l.clientId, clientName: cli?.tradeName ?? '?', arquivado: !!cli?.archived,
          assigneeId: l.assigneeId, assigneeName: S.users.find((u) => u.id === l.assigneeId)?.name ?? null,
          status: l.status, blockedReason: l.blockedReason, doneAt: l.doneAt,
          feitas: S.marcas.filter((m) => m.projectClientId === l.id).map((m) => ({ stepId: m.stepId, valor: m.value, doneAt: m.doneAt, quem: S.users.find((u) => u.id === m.doneById)?.name ?? null })),
        };
      })
      .sort((a, b) => a.clientName.localeCompare(b.clientName, 'pt-BR')),
    comentarios: S.projComentarios.filter((x) => x.projectId === p.id && !x.deletedAt)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((x) => ({ id: x.id, projectClientId: x.projectClientId, body: x.body, autor: S.users.find((u) => u.id === x.userId)?.name ?? 'sistema', userId: x.userId, createdAt: x.createdAt })),
    anexos: S.projAnexos.filter((x) => x.projectId === p.id && !x.deletedAt)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((x) => ({ id: x.id, projectClientId: x.projectClientId, fileName: x.fileName, mimeType: x.mimeType, sizeBytes: x.sizeBytes, createdAt: x.createdAt, quem: S.users.find((u) => u.id === x.uploadedById)?.name ?? 'sistema' })),
    resumo: {
      total: c.total, faltam: c.faltam, contagem: c.contagem, andamento: c.andamento,
      etapasFeitas, etapasTotais: c.total * etapas.length, atrasado: atrasadoDemo(p, c.faltam),
      porEtapa,
    },
    podeTrabalhar: temPerm('projects.work'), podeGerenciar: temPerm('projects.manage'),
  };
}

/** Os projetos de um cliente (a aba da ficha dele). */
function projetosDoCliente(clientId: string): ProjetoDoCliente[] {
  return S.projClientes
    .filter((l) => l.clientId === clientId)
    .flatMap<ProjetoDoCliente>((l) => {
      const p = projetosVivos().find((x) => x.id === l.projectId);
      if (!p) return [];
      return [{
        projectClientId: l.id, projectId: p.id, name: p.name, projectStatus: p.status, dueDate: p.dueDate,
        status: l.status, blockedReason: l.blockedReason, assigneeId: l.assigneeId,
        assigneeName: S.users.find((u) => u.id === l.assigneeId)?.name ?? null,
        feitas: S.etapas.filter((e) => e.projectId === p.id && resolvida(e, S.marcas.find((m) => m.projectClientId === l.id && m.stepId === e.id))).length,
        etapas: S.etapas.filter((e) => e.projectId === p.id).length,
      }];
    });
}


function seed() {
  S.roles = DEFAULT_ROLES.map((r) => ({ id: 'r' + r.key, key: r.key, name: r.name, description: r.description, permissions: [...r.permissions], isSystem: true }));
  S.users = [
    { id: 'u1', name: 'Luan França', email: 'admin@gestor.local', password: 'demo', roleId: 'radministrador', active: true, lastLoginAt: daysAgo(0, 8), sshUser: 'luan' },
    { id: 'u2', name: 'Lúcio Andrade', email: 'tecnico@gestor.local', password: 'demo', roleId: 'rtecnico', active: true, lastLoginAt: daysAgo(1), sshUser: 'lucio' },
    { id: 'u3', name: 'Marina Costa', email: 'operador@gestor.local', password: 'demo', roleId: 'roperador', active: true, lastLoginAt: daysAgo(2) },
    { id: 'u4', name: 'Paulo Reis', email: 'leitor@gestor.local', password: 'demo', roleId: 'rleitor', active: true, lastLoginAt: null },
  ];
  S.carriers = ['ALGAR', 'VC1', 'Vivo'].map((n) => ({ id: 'car' + n, name: n, active: true }));
  S.hostings = ['Local', 'Nuvem (Local)', 'Vultr', 'AWS', 'Contabo', 'Hetzner', 'Outro'].map((n) => ({ id: 'h' + n.replace(/\W/g, ''), name: n, active: true }));
  S.categories = ['Telefone IP', 'Periférico', 'ATA', 'Gateway', 'Switch', 'Outro'].map((n) => ({ id: 'cat' + n.replace(/\W/g, ''), name: n, active: true }));
  /** Logos fictícias da demonstração: um quadrado com as iniciais, desenhado em SVG. */
  const logoFake = (iniciais: string, cor: string) =>
    'data:image/svg+xml;base64,' + btoa(`<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96"><rect width="96" height="96" rx="18" fill="${cor}"/><text x="48" y="62" font-family="Verdana,sans-serif" font-size="38" font-weight="bold" fill="#fff" text-anchor="middle">${iniciais}</text></svg>`);
  const logos: Record<string, string> = {
    'Clínica Aurora': logoFake('CA', '#0E7490'),
    'Hospital Vale Verde': logoFake('VV', '#15803D'),
    'Supermercado Bom Preço': logoFake('BP', '#B91C1C'),
    'Distribuidora Norte': logoFake('DN', '#1D4ED8'),
  };
  const mk = (t: string, l: string, cnpj: string, extra: Partial<Client> = {}): Client => ({ id: id(), tradeName: t, legalName: l, cnpj, logoUrl: null, archived: false, isInternal: false, internalCode: null, notes: null, deletedAt: null, createdAt: daysAgo(400), updatedAt: daysAgo(10), ...extra });
  const ingline = mk('Ingline Systems', 'Ingline Systems', '00000000000191', { isInternal: true, internalCode: 'ingline' });
  const voicenet = mk('VoiceNet', 'VoiceNet Telecom', '00000000000272', { isInternal: true, internalCode: 'voicenet' });
  // [nome, razão social, cnpj, produtos, módulos (produto:modulo), hospedagem, domínio, ip]
  const defs: Array<[string, string, string, string[], string[], string | null, string | null, string | null]> = [
    ['Clínica Aurora', 'Clínica Aurora Serviços Médicos LTDA', '11222333000181', ['linepbx', 'voicenet'], ['linepbx:fop2'], 'Vultr', 'aurora.linepbx.com.br', '203.0.113.10'],
    ['Distribuidora Norte', 'Norte Comércio e Distribuição LTDA', '22333444000181', ['linepbx', 'voicenet', 'linechat', 'equipamentos'], ['linechat:dashboard_filas'], 'Local', null, '192.0.2.50'],
    ['Hospital Vale Verde', 'Associação Hospitalar Vale Verde', '33444555000181', ['linepbx', 'linereports', 'voicenet', 'equipamentos'], ['linepbx:fop2', 'linepbx:omniboard', 'linepbx:nps'], 'Hetzner', 'valeverde.linepbx.com.br', '198.51.100.7'],
    ['Escritório Prado & Lima', 'Prado e Lima Advogados Associados', '44555666000181', ['voicenet', 'linechat'], ['linechat:nps'], null, null, null],
    ['Supermercado Bom Preço', 'Bom Preço Supermercados LTDA', '55666777000181', ['linepbx', 'voicenet', 'equipamentos'], ['linepbx:fop2'], 'Nuvem (Local)', 'bompreco.linepbx.com.br', '203.0.113.88'],
    ['Laboratório Exame Certo', 'Exame Certo Análises Clínicas LTDA', '66777888000181', ['linepbx', 'voicenet'], [], 'AWS', 'exame.linepbx.com.br', '203.0.113.121'],
    ['Construtora Horizonte', 'Horizonte Engenharia e Construções S.A.', '77888999000181', ['voicenet'], [], null, null, null],
    ['Home Care Viver Bem', 'Viver Bem Atenção Domiciliar LTDA', '88999000000198', ['linepbx', 'voicenet', 'linechat', 'equipamentos'], ['linepbx:omniboard', 'linechat:dashboard_filas', 'linechat:nps'], 'Vultr', 'viverbem.linepbx.com.br', '203.0.113.200'],
    ['Farmácia Central (arquivada)', 'Central Farma LTDA', '99000111000105', ['voicenet'], [], null, null, null],
  ];
  S.clients = [ingline, voicenet];
  // todo cliente tem a Matriz
  const matriz = (c: Client) => S.units.push({ id: id(), clientId: c.id, name: 'Matriz', isMain: true, address: null, egressIp: null, note: null, createdAt: c.createdAt, deletedAt: null });
  matriz(ingline); matriz(voicenet);
  const byName: Record<string, string> = {};
  defs.forEach(([t, l, cnpj, prods, mods, host, dom, ip], i) => {
    const c = mk(t, l, cnpj, { archived: i === 8, logoUrl: logos[t] ?? null });
    S.clients.push(c); byName[t] = c.id; matriz(c);
    prods.forEach((code, j) => {
      const settings: Record<string, any> = {};
      if (code === 'linepbx') Object.assign(settings, { hostingId: host ? 'h' + host.replace(/\W/g, '') : null, hostingName: host, serverIp: ip, domain: dom, sshPort: 22 });
      // o produto entra primeiro; os módulos vêm depois, em intervalos diferentes — é assim
      // que acontece na vida real, e é o que a linha do tempo da ficha mostra.
      // O Hospital Vale Verde é o contra-exemplo de propósito: ligou o LinePBX e os três
      // módulos no mesmo dia, para a linha do tempo ter um caso de "tudo junto numa linha".
      const diasDoProduto = 500 - i * 30 - j * 45;
      const tudoJunto = i === 2 && code === 'linepbx';
      const sub: Sub = { id: id(), clientId: c.id, productCode: code, activatedAt: daysAgo(diasDoProduto), deactivatedAt: null, notes: code === 'linepbx' && i === 2 ? 'Gravação de chamadas contratada' : null, settings };
      S.subs.push(sub);
      mods.filter((m) => m.startsWith(code + ':')).forEach((pm, k) => {
        const mcode = pm.split(':')[1]!; const mod = S.modules.find((m) => m.productId === 'p' + code && m.code === mcode)!;
        const ms: Record<string, any> = {};
        if (mcode === 'fop2') { const f = id(); S.secrets.set(f, { label: `Senha do usuário padrão do FOP2 — ${t}`, value: 'fop2#2026' }); Object.assign(ms, { adminExtension: '1000', defaultUserPasswordSecretId: f }); }
        if (mcode === 'omniboard') { const a = id(), d = id(); S.secrets.set(a, { label: `Senha admin do Omniboard — ${t}`, value: 'Omni#2026' }); S.secrets.set(d, { label: `Senha padrão de usuário do Omniboard — ${t}`, value: 'Bemvindo1' }); Object.assign(ms, { adminLogin: `admin@${t.toLowerCase().replace(/\W+/g, '')}.com.br`, adminPasswordSecretId: a, userDefaultPasswordSecretId: d }); }
        S.subMods.push({ id: id(), subscriptionId: sub.id, moduleId: mod.id, activatedAt: daysAgo(tudoJunto ? diasDoProduto : Math.max(3, diasDoProduto - 40 - k * 75), tudoJunto ? 11 + k : 10), deactivatedAt: null, notes: null, settings: ms });
      });
    });
    // o cliente existe antes do primeiro produto: a ficha mostra "implantado em" e a linha do
    // tempo logo abaixo, e ficaria estranho o produto ser mais velho que o próprio cliente
    const primeira = S.subs.filter((x) => x.clientId === c.id).map((x) => x.activatedAt!).sort()[0];
    if (primeira) c.createdAt = daysAgo(Math.round((Date.now() - new Date(primeira).getTime()) / 86400000) + 12);
  });
  // O último é um LINK DE TERCEIRO: o tronco que o Hospital contratou direto da Vivo. Fica
  // registrado (é útil saber a numeração dele), mas só aparece com o interruptor ligado.
  const circ = [
    ['071 Principal', '09802603', 'ALGAR', 30, '7130200000', 120, 60338, [['Supermercado Bom Preço', 0, 40], ['Laboratório Exame Certo', 40, 70]], false, null],
    ['071 Hospitalar', '010241793', 'ALGAR', 60, '7132170000', 200, 120000, [['Hospital Vale Verde', 0, 150]], false, null],
    ['Link - Distribuidora Norte', '73169', 'VC1', 5, '7131720000', 12, 25000, [['Distribuidora Norte', 0, 12]], false, null],
    ['Link - Aurora', '94234', 'VC1', 2, '7130396100', 4, 9900, [['Clínica Aurora', 0, 4]], false, null],
    ['Feixe Reserva', '88001', 'VC1', 0, '7135550000', 10, 5000, [], false, null],
    ['Vivo - Hospital Vale Verde', '55210', 'Vivo', 10, '7134440000', 20, 0, [['Hospital Vale Verde', 0, 20]], true, 'Hospital Vale Verde'],
  ] as const;
  for (const [name, code, car, ch, base, qty, value, assign, terceiro, titular] of circ) {
    const sec = id(); S.secrets.set(sec, { label: `Senha do tronco — ${name}`, value: 'Trk#' + code });
    const cid = id();
    const dono = titular ? byName[titular]! : voicenet.id;
    // o primeiro feixe autentica por login e senha; os demais, por IP (o caso comum)
    const porLogin = name === '071 Principal';
    S.circuits.push({ id: cid, name, code, keyNumber: base, carrierId: 'car' + car, channels: ch, ownerClientId: dono, monthlyValueCents: value || null, authType: porLogin ? 'login' : 'ip', signalingIp: '203.0.113.1', authIp: porLogin ? null : '198.51.100.1', authUsername: porLogin ? 'tr' + code : null, authPasswordSecretId: sec, notes: terceiro ? 'Tronco contratado pelo próprio cliente; registrado aqui só para referência.' : null, thirdParty: terceiro, deletedAt: null });
    gerarFaixaDids(base, qty).forEach((n, i) => {
      const a = (assign as readonly (readonly [string, number, number])[]).find((x) => i >= x[1] && i < x[2]);
      // uns poucos números alocados ficam como "não usados" (reservados), para a marca aparecer nas telas
      S.dids.push({ id: id(), number: n, circuitId: cid, clientId: a ? byName[a[0]]! : null, ownerClientId: dono, inUse: !!a && i % 7 !== 3, note: a && i % 9 === 0 ? 'principal' : null, deletedAt: null });
    });
  }
  const UNIDADES_DEMO: Record<string, string[]> = {
    'Hospital Vale Verde': ['Matriz', 'Unidade Simões Filho', 'Ambulatório Centro'],
    'Distribuidora Norte': ['Matriz', 'CD Feira de Santana'],
    'Supermercado Bom Preço': ['Loja Centro', 'Loja Simões Filho'],
    'Home Care Viver Bem': ['Sede'],
  };
  // as unidades usadas nos aparelhos ficam cadastradas nos clientes (a Matriz já existe)
  for (const [cli, nomes] of Object.entries(UNIDADES_DEMO)) {
    for (const nome of nomes) if (nome !== 'Matriz') S.units.push({ id: id(), clientId: byName[cli]!, name: nome, isMain: false, address: nome === 'Unidade Simões Filho' ? 'Av. Eixo Urbano Central, 1200 — Simões Filho/BA' : null, egressIp: nome === 'Unidade Simões Filho' ? '200.180.10.5' : null, note: null, createdAt: daysAgo(90), deletedAt: null });
  }
  // a Matriz do Hospital tem endereço e IP fixo de saída, para a tela ter um exemplo preenchido
  const matrizHosp = S.units.find((u) => u.clientId === byName['Hospital Vale Verde'] && u.isMain)!;
  matrizHosp.address = 'Rua das Hortênsias, 45 — Salvador/BA'; matrizHosp.egressIp = '177.10.20.30';
  // rede padrão de um cliente, como exemplo (o login padrão por modelo entra depois dos modelos)
  const secWifi = id(); S.secrets.set(secWifi, { label: 'Senha do ramal sem fio — Hospital Vale Verde', value: 'linepbx_hvv@2026' });
  S.networks.push({ clientId: byName['Hospital Vale Verde']!, ipAddress: '10.20.0.77', subnetMask: '255.255.255.0', defaultRouter: '10.20.0.1', dns1: '8.8.8.8', dns2: '8.8.4.4', wirelessPasswordSecretId: secWifi, note: null, updatedAt: daysAgo(30) });
  const catPerif = S.categories.find((c) => c.name === 'Periférico')!.id;
  // o valor é do modelo; a foto é um desenho simples, só para a prévia
  const mGx: ModelRow = { id: id(), code: 'gxp1610', name: 'Grandstream GXP1610', categoryId: 'catTelefoneIP', image: FOTO_TELEFONE('#2B2F36'), valueCents: 45000, deletedAt: null };
  const mHs: ModelRow = { id: id(), code: 'headset', name: 'Headset Genérico', categoryId: catPerif, image: FOTO_HEADSET, valueCents: 9000, deletedAt: null };
  const mTip: ModelRow = { id: id(), code: 'tip125i', name: 'Intelbras TIP 125i', categoryId: 'catTelefoneIP', image: FOTO_TELEFONE('#1F2937'), valueCents: 38000, deletedAt: null };
  const mDect: ModelRow = { id: id(), code: 'dp722', name: 'Grandstream DP722', categoryId: 'catTelefoneIP', image: null, valueCents: 33900, deletedAt: null };
  S.models = [mGx, mHs, mTip, mDect];
  // login e senha padrão por modelo no Hospital: todos os GXP1610 entram com admin; os DP722 com outro
  const secGx = id(); S.secrets.set(secGx, { label: 'Senha padrão Grandstream GXP1610 — Hospital Vale Verde', value: 'gxp#hvv2026' });
  S.deviceLogins.push({ id: id(), clientId: byName['Hospital Vale Verde']!, modelId: mGx.id, username: 'admin', passwordSecretId: secGx, note: null, updatedAt: daysAgo(30), deletedAt: null });
  S.deviceLogins.push({ id: id(), clientId: byName['Hospital Vale Verde']!, modelId: mDect.id, username: 'user', passwordSecretId: null, note: 'sem senha ainda', updatedAt: daysAgo(30), deletedAt: null });
  const dev = (x: Partial<DeviceRow> & { modelId: string }): DeviceRow => ({ id: id(), mac: null, macSecondary: null, serialNumber: null, clientId: null, unit: null, currentModality: null, condition: 'ativo', valueCents: null, ip: null, location: null, note: null, deletedAt: null, createdAt: daysAgo(60), ...x });
  let n = 0;
  const locados: Array<[string, number, number]> = [['Hospital Vale Verde', 20, 30], ['Distribuidora Norte', 8, 20], ['Supermercado Bom Preço', 6, 12], ['Home Care Viver Bem', 4, 5]];
  for (const [cli, q, d] of locados) {
    const items: MovRow['items'] = [];
    const unidades = UNIDADES_DEMO[cli] ?? ['Matriz'];
    for (let i = 0; i < q; i++, n++) {
      const x = dev({ modelId: mGx.id, mac: '000B82' + (0x100000 + n).toString(16).toUpperCase().slice(-6), clientId: byName[cli]!, unit: unidades[i % unidades.length]!, currentModality: 'locacao', ip: `10.0.${n % 4}.${20 + n}`, createdAt: daysAgo(d + 3) });
      S.devices.push(x); items.push({ modelId: mGx.id, deviceId: x.id });
    }
    S.movements.push({ id: id(), modality: 'locacao', fromClientId: null, toClientId: byName[cli]!, unit: unidades[0]!, newCondition: 'ativo', note: null, userId: 'u2', createdAt: daysAgo(d), items });
  }
  for (let i = 0; i < 12; i++, n++) S.devices.push(dev({ modelId: mGx.id, mac: '000B82' + (0x100000 + n).toString(16).toUpperCase().slice(-6), condition: i === 11 ? 'inativo' : 'ativo', note: i === 11 ? 'Tela piscando; aguardando peça' : null }));
  // um TIP 125i com valor próprio, diferente do modelo, para mostrar a diferença
  for (let i = 0; i < 3; i++, n++) S.devices.push(dev({ modelId: mTip.id, mac: '1C61B4' + (0x200000 + n).toString(16).toUpperCase().slice(-6), valueCents: i === 0 ? 35000 : null, createdAt: daysAgo(20) }));
  // o DECT sem fio se identifica pelo número de série
  for (let i = 0; i < 2; i++) S.devices.push(dev({ modelId: mDect.id, serialNumber: `DP722SN00${i + 41}`, createdAt: daysAgo(15) }));
  // headset não tem MAC: cada unidade é uma linha; alguns têm número de série, outros nada
  for (let i = 0; i < 28; i++) S.devices.push(dev({ modelId: mHs.id, serialNumber: i < 6 ? `HS2026${String(i + 1).padStart(4, '0')}` : null, createdAt: daysAgo(70) }));
  const headsetsLocados = Array.from({ length: 4 }, () => {
    const x = dev({ modelId: mHs.id, clientId: byName['Hospital Vale Verde']!, unit: 'Matriz', currentModality: 'locacao', createdAt: daysAgo(5) });
    S.devices.push(x); return x;
  });
  S.movements.push({ id: id(), modality: 'locacao', fromClientId: null, toClientId: byName['Hospital Vale Verde']!, unit: 'Matriz', newCondition: null, note: 'Headsets para o call center', userId: 'u3', createdAt: daysAgo(2, 14), items: headsetsLocados.map((d) => ({ modelId: mHs.id, deviceId: d.id })) });
  // a nota de novidades da rodada, publicada: é ela que abre no login da prévia
  S.notas = [{
    id: id(), version: NOTA_DEMO.version, title: NOTA_DEMO.title, summary: NOTA_DEMO.summary,
    publishedAt: daysAgo(0, 9), createdAt: daysAgo(0, 8), updatedAt: daysAgo(0, 9), deletedAt: null,
    items: NOTA_DEMO.items.map((i) => ({ id: id(), kind: i.kind, title: i.title, text: i.text, imagem: i.imagem ?? null })),
  }];
  // meses anteriores com movimento, só para o gráfico do Painel ter o que mostrar
  const avulsos = S.devices.filter((d) => !d.clientId).slice(0, 9);
  const historico: Array<[MovRow['modality'], string, number, number]> = [
    ['locacao', 'Clínica Aurora', 3, 128],
    ['devolucao', 'Distribuidora Norte', 2, 96],
    ['venda', 'Supermercado Bom Preço', 2, 64],
    ['comodato', 'Apae', 2, 38],
  ];
  let corte = 0;
  for (const [modality, cliente, quantos, dias] of historico) {
    const itens = avulsos.slice(corte, corte + quantos); corte += quantos;
    if (!itens.length || !byName[cliente]) continue;
    S.movements.push({
      id: id(), modality,
      fromClientId: modality === 'devolucao' ? byName[cliente]! : null,
      toClientId: modality === 'devolucao' ? null : byName[cliente]!,
      unit: 'Matriz', newCondition: null, note: null, userId: 'u2', createdAt: daysAgo(dias),
      items: itens.map((d) => ({ modelId: d.modelId, deviceId: d.id })),
    });
  }

  // ---- um projeto de exemplo: a troca do áudio das URAs ----
  const proj: ProjRow = {
    id: 'proj1', name: 'Áudio novo das URAs',
    goal: 'Trocar o áudio da URA de todos os clientes com LinePBX por uma gravação de estúdio. A locução já está pronta; falta subir, testar com o cliente e avisar.',
    status: 'aberto', dueDate: emDias(21), ownerId: 'u1', closedAt: null,
    createdAt: daysAgo(12), updatedAt: daysAgo(0, 10), deletedAt: null,
  };
  S.projetos = [proj];
  S.etapas = ['Gravar o áudio', 'Subir no PBX', 'Testar com o cliente', 'Avisar que está no ar']
    .map((title, i) => ({ id: `st${i + 1}`, projectId: proj.id, title, kind: 'check' as const, options: [], sortOrder: i }));

  const naLista: Array<[string, string | null, SituacaoProjeto, number, string | null]> = [
    // cliente, responsável, situação, etapas já feitas, motivo do travamento
    ['Hospital Vale Verde', 'u2', 'concluido', 4, null],
    ['Clínica Aurora', 'u2', 'andamento', 2, null],
    ['Supermercado Bom Preço', 'u3', 'travado', 1, 'Cliente pediu para voltar depois do fechamento do mês.'],
    ['Distribuidora Norte', 'u3', 'pendente', 0, null],
    ['Home Care Viver Bem', null, 'pendente', 0, null],
    ['Transportes Litoral', 'u2', 'nao_se_aplica', 0, null],
  ];
  for (const [nome, assigneeId, status, feitas, motivo] of naLista) {
    const clientId = byName[nome];
    if (!clientId) continue;
    const linha: PClientRow = {
      id: 'pc' + S.projClientes.length, projectId: proj.id, clientId, assigneeId, status,
      blockedReason: motivo, doneAt: status === 'concluido' || status === 'nao_se_aplica' ? daysAgo(2) : null,
    };
    S.projClientes.push(linha);
    for (let i = 0; i < feitas; i++) S.marcas.push({ projectClientId: linha.id, stepId: `st${i + 1}`, value: null, doneById: assigneeId, doneAt: daysAgo(10 - i * 2) });
  }
  // ---- o segundo projeto: o feriado, com colunas de opções coloridas (como a planilha) ----
  const fer: ProjRow = {
    id: 'proj2', name: 'Feriado de 12 de outubro',
    goal: 'Avisar o cliente, subir o áudio de feriado na URA e travar o bot com a mensagem de que o atendimento volta no dia seguinte.',
    status: 'aberto', dueDate: emDias(9), ownerId: 'u1', closedAt: null,
    createdAt: daysAgo(4), updatedAt: daysAgo(0, 9), deletedAt: null,
  };
  S.projetos.push(fer);
  const opc = (label: string, tone: OpcaoEtapa['tone'], conclui = false): OpcaoEtapa => ({ id: id(), label, tone, conclui });
  const contato = [opc('Sem necessidade', 'muted', true), opc('Pendente envio', 'bad'), opc('Mensagem enviada', 'signal'), opc('Cliente confirmou', 'ok', true)];
  const audio = [opc('Sem necessidade', 'muted', true), opc('Aguardando áudio', 'bad'), opc('Áudio recebido', 'signal'), opc('Configurado na URA', 'ok', true)];
  const bot = [opc('Sem necessidade', 'muted', true), opc('Pendente', 'bad'), opc('Travado com aviso', 'ok', true)];
  S.etapas.push(
    { id: 'fe1', projectId: fer.id, title: 'Contato com o cliente', kind: 'escolha', options: contato, sortOrder: 0 },
    { id: 'fe2', projectId: fer.id, title: 'Áudio do feriado', kind: 'escolha', options: audio, sortOrder: 1 },
    { id: 'fe3', projectId: fer.id, title: 'Travamento do bot', kind: 'escolha', options: bot, sortOrder: 2 },
    { id: 'fe4', projectId: fer.id, title: 'Voltar ao normal no dia seguinte', kind: 'check', options: [], sortOrder: 3 },
  );
  const noFeriado: Array<[string, string | null, Array<number | null>]> = [
    // cliente, responsável, opção escolhida em cada coluna (índice na lista, ou null = em branco)
    ['Hospital Vale Verde', 'u2', [3, 3, 2, null]],
    ['Clínica Aurora', 'u2', [2, 1, 1, null]],
    ['Supermercado Bom Preço', 'u3', [1, 1, null, null]],
    ['Distribuidora Norte', 'u3', [0, 0, 0, null]],
    ['Home Care Viver Bem', null, [null, null, null, null]],
    ['Transportes Litoral', 'u2', [3, 3, 2, null]],
  ];
  for (const [nome, assigneeId, escolhas] of noFeriado) {
    const clientId = byName[nome];
    if (!clientId) continue;
    const linha: PClientRow = { id: 'fc' + S.projClientes.length, projectId: fer.id, clientId, assigneeId, status: 'pendente', blockedReason: null, doneAt: null };
    S.projClientes.push(linha);
    [contato, audio, bot].forEach((lista, k) => {
      const escolhido = escolhas[k];
      if (escolhido == null) return;
      S.marcas.push({ projectClientId: linha.id, stepId: `fe${k + 1}`, value: lista[escolhido]!.id, doneById: assigneeId, doneAt: daysAgo(3 - k) });
    });
    recalcular(linha);
  }

  S.projComentarios = [
    { id: id(), projectId: proj.id, projectClientId: null, userId: 'u1', body: 'A locução final está anexada aqui. Usem esse arquivo, não o da pasta antiga.', createdAt: daysAgo(11), deletedAt: null },
    { id: id(), projectId: proj.id, projectClientId: 'pc2', userId: 'u3', body: 'Liguei duas vezes, ficaram de retornar. Travei para não segurar a lista.', createdAt: daysAgo(3), deletedAt: null },
  ];
  S.projAnexos = [
    { id: 'anx1', projectId: proj.id, projectClientId: null, fileName: 'ura-institucional-v3.mp3', mimeType: 'audio/mpeg', sizeBytes: 1_842_000, conteudo: 'data:audio/mpeg;base64,', uploadedById: 'u1', createdAt: daysAgo(11), deletedAt: null },
    { id: 'anx2', projectId: proj.id, projectClientId: null, fileName: 'roteiro-da-locucao.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', sizeBytes: 24_500, conteudo: 'data:application/octet-stream;base64,', uploadedById: 'u1', createdAt: daysAgo(12), deletedAt: null },
  ];

  S.audit = [
    { id: id(), action: 'bulk_update', entityType: 'did', entityId: null, summary: 'Alterou 40 DID(s): cliente → Supermercado Bom Preço', before: null, after: null, userName: 'Lúcio Andrade', userId: 'u2', createdAt: daysAgo(1, 16) },
    { id: id(), action: 'reveal_secret', entityType: 'secret', entityId: null, summary: 'Lúcio Andrade revelou "Senha SSH do LinePBX — Clínica Aurora"', before: null, after: null, userName: 'Lúcio Andrade', userId: 'u2', createdAt: daysAgo(1, 11) },
    { id: id(), action: 'movement', entityType: 'deviceMovement', entityId: null, summary: 'Locação de 4 aparelho(s) para cliente', before: null, after: null, userName: 'Marina Costa', userId: 'u3', createdAt: daysAgo(2, 14) },
    { id: id(), action: 'update', entityType: 'client', entityId: null, summary: 'Luan França editou o cliente Clínica Aurora', before: null, after: null, userName: 'Luan França', userId: 'u1', createdAt: daysAgo(3) },
  ];
}
seed();

// ---------- chamados do LineChat (inventados) ----------
//
// Uns 600 chamados dos últimos 4 meses, no formato que a sincronização grava. Sorteio com semente
// fixa: a prévia mostra sempre os mesmos números. As contas são as mesmas funções do servidor
// (`@gestor/shared/chamados.ts`), então o que a tela mostra aqui é o que ela mostraria de verdade.

const ETAPAS_DEMO = [
  ['Solicitação Equipamento', false, false], ['Visita Técnica', false, false], ['Stand By', false, false],
  ['Novos Suporte', true, false], ['Chamado Pendente Suporte', false, false], ['Chamado Em Tratativa N1', false, false],
  ['Chamado Em Tratativa N2', false, false], ['Chamado Em Tratativa N3', false, false], ['Chamado em Observação', false, false],
  ['Chamado Tratado Suporte', false, true], ['Chamado Validado', false, true],
].map(([title, isInitial, isFinal], i) => ({ id: `etapa-${i + 1}`, title: title as string, position: i + 1, isInitial: isInitial as boolean, isFinal: isFinal as boolean, archived: false }));
const ETIQUETAS_DEMO = [
  ['P/ Crítica', 'rgb(220, 38, 38)'], ['P/ Alta', 'rgb(234, 179, 8)'], ['P/ Média', 'rgb(250, 204, 21)'], ['P/ Baixa', 'rgb(14, 165, 233)'],
  ['NIA - CONCLUIDO', 'rgb(34, 197, 94)'], ['NIA - PREENCHER', 'rgb(88, 28, 135)'], ['NIA - ERRO', 'rgb(225, 29, 72)'],
  ['StandBy', 'rgb(17, 24, 39)'], ['Suporte ativo', 'rgb(22, 163, 74)'], ['Acompanhamento', 'rgb(255, 153, 255)'],
].map(([name, color], i) => ({ id: `tag-${i + 1}`, name: name!, color: color!, archived: false }));
const PESSOAS_DEMO = ['Lúcio Andrade', 'Marina Costa', 'Bruno Teixeira', 'Camila Duarte', 'Diego Farias'];

let chamadosGuardados: { cards: Chamado[]; ctx: Omit<ContextoChamados, 'agora'>; movimentos: number } | null = null;
function chamadosDemo() {
  if (chamadosGuardados) return chamadosGuardados;
  let semente = 20260923;
  const sorte = () => { semente = (semente * 1103515245 + 12345) % 2147483648; return semente / 2147483648; };
  const um = <T,>(xs: readonly T[]) => xs[Math.floor(sorte() * xs.length)]!;
  const clientes = S.clients.filter((c) => !c.isInternal).map((c) => c.tradeName);
  const campos = [
    { key: 'cliente-71', name: 'Cliente', type: 'SINGLESELECT', position: 2, options: clientes, archived: false },
    { key: 'tipo-de-chamado-24', name: 'Tipo de chamado', type: 'SINGLESELECT', position: 3, options: ['Configuração', 'Correção', 'Dúvida Usuário', 'Falha usuário', 'Falha Sistêmica Ingline', 'Requisição', 'Treinamento', 'Dificuldade Infraestrutura Cliente'], archived: false },
    { key: 'plataforma', name: 'Produto', type: 'SINGLESELECT', position: 5, options: ['LinePBX', 'LineChat', 'FOP2', 'Omniboard', 'LineReports', 'VoiceNet', 'Equipamento', 'Terceiros - Operadora'], archived: false },
    { key: 'meio-solicita-o', name: 'Canal da Solicitação', type: 'SINGLESELECT', position: 6, options: ['Whatsapp Oficial', 'Voz ofical', 'Grupo Whatsapp', 'E-mail', 'Reunião remota', 'Suporte Ativo'], archived: false },
    { key: 'resoluttor', name: 'Resolutor', type: 'SINGLESELECT', position: 7, options: PESSOAS_DEMO, archived: false },
    { key: 'observador', name: 'Observadores', type: 'MULTISELECT', position: 8, options: PESSOAS_DEMO, archived: false },
    { key: 'assunto', name: 'Assunto', type: 'SINGLESELECT', position: 9, options: ['Ramal sem áudio', 'Ramal não registra', 'Fila de atendimento', 'URA', 'Gravação de chamadas', 'Relatórios', 'Pausa de agente', 'Troca de aparelho', 'Chatbot', 'Criação de usuário', 'Queda de tronco', 'Portabilidade'], archived: false },
  ];
  const pesoTipo = [5, 4, 5, 3, 2, 3, 1, 1];
  const pesoProduto = [9, 4, 2, 2, 1, 3, 2, 1];
  const pesado = <T,>(xs: T[], pesos: number[]) => { const t = pesos.reduce((a, b) => a + b, 0); let r = sorte() * t; for (let i = 0; i < xs.length; i++) { r -= pesos[i] ?? 1; if (r <= 0) return xs[i]!; } return xs[0]!; };
  const cards: Chamado[] = [];
  const agora = Date.now();
  let numero = 3000;
  // do mais antigo para o mais novo, como a numeração do LineChat
  for (let d = 120; d >= 0; d--) {
    const dia = new Date(agora - d * 86_400_000);
    const semana = dia.getDay();
    const quantos = semana === 0 ? 0 : semana === 6 ? Math.floor(sorte() * 2) : 3 + Math.floor(sorte() * 5);
    for (let k = 0; k < quantos; k++) {
      const criado = new Date(dia); criado.setHours(8 + Math.floor(sorte() * 10), Math.floor(sorte() * 60), 0, 0);
      if (criado.getTime() > agora) continue;
      const idade = (agora - criado.getTime()) / 86_400_000;
      // quanto mais antigo, mais provável que já esteja validado
      const aberto = sorte() < (idade < 2 ? 0.8 : idade < 7 ? 0.35 : idade < 30 ? 0.08 : 0.015);
      const etapa = aberto ? um(ETAPAS_DEMO.filter((e) => !e.isFinal)) : ETAPAS_DEMO[sorte() < 0.1 ? 9 : 10]!;
      const fechadoEm = aberto ? null : new Date(Math.min(agora - 60_000, criado.getTime() + (0.1 + sorte() * 4) * 86_400_000));
      const alterado = fechadoEm ?? new Date(Math.min(agora - 60_000, criado.getTime() + sorte() * Math.min(idade, 6) * 86_400_000));
      const resp = sorte() < 0.06 ? null : um(PESSOAS_DEMO);
      const tags: string[] = [];
      if (sorte() < 0.5) tags.push(pesado(['tag-1', 'tag-2', 'tag-3', 'tag-4'], [1, 3, 5, 4]));
      if (sorte() < 0.25) tags.push(um(['tag-5', 'tag-6', 'tag-7']));
      if (aberto && etapa.title === 'Stand By') tags.push('tag-8');
      const cf: Record<string, unknown> = {
        'cliente-71': sorte() < 0.04 ? null : pesado(clientes, clientes.map((_, i) => (i < 3 ? 6 : 2))),
        'tipo-de-chamado-24': sorte() < 0.05 ? null : pesado(campos[1]!.options, pesoTipo),
        plataforma: pesado(campos[2]!.options, pesoProduto),
        'meio-solicita-o': pesado(campos[3]!.options, [8, 3, 3, 2, 1, 1]),
        resoluttor: aberto ? null : resp ?? um(PESSOAS_DEMO),
        assunto: um(campos[6]!.options),
        ...(sorte() < 0.3 ? { observador: [um(PESSOAS_DEMO), um(PESSOAS_DEMO)].filter((x, i, a) => a.indexOf(x) === i) } : {}),
      };
      numero++;
      const assunto = cf.assunto as string;
      const cliente = (cf['cliente-71'] as string | null) ?? 'Interno';
      cards.push({
        id: `card-${numero}`, key: `IS-${numero}`, number: numero,
        title: `${cf.plataforma} - ${cliente} - ${assunto}`, description: `Cliente relata: ${assunto.toLowerCase()}. (chamado de demonstração)`,
        stepId: etapa.id, stepTitle: etapa.title, stepPhase: etapa.isInitial ? 'INITIAL' : etapa.isFinal ? 'FINAL' : 'INTERMEDIATE',
        status: !aberto && idade > 45 && sorte() < 0.2 ? 'ARCHIVED' : 'OPEN',
        responsavel: resp,
        createdAt: criado.toISOString(), updatedAt: alterado.toISOString(),
        closedAt: fechadoEm?.toISOString() ?? null, closedEstimated: !!fechadoEm && idade > 20,
        dueDate: aberto && sorte() < 0.35 ? new Date(criado.getTime() + (1 + sorte() * 10) * 86_400_000).toISOString() : null,
        isOverdue: false, tagIds: tags, campos: cf,
      });
    }
  }
  for (const c of cards) c.isOverdue = !!c.dueDate && Date.parse(c.dueDate) < agora && !ETAPAS_DEMO.find((e) => e.id === c.stepId)?.isFinal;
  chamadosGuardados = { cards, ctx: { etapas: ETAPAS_DEMO, campos, etiquetas: ETIQUETAS_DEMO }, movimentos: Math.round(cards.length * 0.4) };
  const inicio = new Date(agora - 20 * 86_400_000).toISOString();
  S.ajustesLineChat = { ...S.ajustesLineChat, inicioEm: inicio, ultimaEm: new Date(agora - 40_000).toISOString(), ultimaCompletaEm: new Date(agora - 8 * 3_600_000).toISOString(), ultimaMsg: 'Atualização: 2 cards lidos, 1 mudança de etapa.' };
  return chamadosGuardados;
}
const linkDemo = (c: Chamado) => (c.key ? `https://inglinechat.com.br/panels/painel-demo/card/${c.key}` : '');
function statusLineChatDemo(): AjustesLineChat {
  const { cards, movimentos } = chamadosDemo();
  const a = S.ajustesLineChat;
  return {
    ...a,
    totais: { cards: cards.length, ativos: cards.filter((c) => c.status !== 'ARCHIVED').length, arquivados: cards.filter((c) => c.status === 'ARCHIVED').length, movimentos },
    execucoes: [
      { id: 'run2', kind: 'recente', trigger: 'agendada', startedAt: a.ultimaEm ?? now(), finishedAt: a.ultimaEm, ok: true, message: a.ultimaMsg },
      { id: 'run1', kind: 'completa', trigger: 'agendada', startedAt: a.ultimaCompletaEm ?? now(), finishedAt: a.ultimaCompletaEm, ok: true, message: `Leitura completa: ${cards.length.toLocaleString('pt-BR')} cards lidos.` },
    ],
  };
}

// ---------------- ajudantes ----------------
const prodMeta = (code: string) => S.products.find((p) => p.code === code)!;
/** produto na lixeira some das telas (a assinatura fica guardada) */
const produtoVivo = (code: string) => !prodMeta(code)?.deletedAt;
const activeSubs = (cid: string) => S.subs.filter((s) => s.clientId === cid && !s.deactivatedAt && produtoVivo(s.productCode));
const modeloDe = (d: DeviceRow) => S.models.find((m) => m.id === d.modelId)!;
/** o valor que vale: o próprio do aparelho, ou o do modelo */
const valorDe = (d: DeviceRow) => d.valueCents ?? modeloDe(d).valueCents;
const PROTEGIDOS = ['linepbx', 'voicenet', 'equipamentos'];
/** Garante a Matriz do cliente e devolve as unidades dele (a Matriz primeiro). */
const unidadesDe = (cid: string) => {
  if (!S.units.some((u) => u.clientId === cid && u.isMain && !u.deletedAt)) S.units.push({ id: id(), clientId: cid, name: 'Matriz', isMain: true, address: null, egressIp: null, note: null, createdAt: now(), deletedAt: null });
  return S.units.filter((u) => u.clientId === cid && !u.deletedAt).sort((a, b) => Number(b.isMain) - Number(a.isMain) || a.name.localeCompare(b.name, 'pt-BR'));
};
const modMeta = (mid: string) => S.modules.find((m) => m.id === mid)!;
/** Módulos ligados numa assinatura (ordenados como no catálogo). */
const activeMods = (subId: string) => S.subMods.filter((m) => m.subscriptionId === subId && !m.deactivatedAt).sort((a, b) => modMeta(a.moduleId).sortOrder - modMeta(b.moduleId).sortOrder);
const hasMod = (cid: string, product: string, mod: string) => { const s = activeSubs(cid).find((x) => x.productCode === product); return !!s && activeMods(s.id).some((m) => modMeta(m.moduleId).code === mod); };
const links = (cid: string) => {
  const lp = activeSubs(cid).find((s) => s.productCode === 'linepbx')?.settings;
  const host = lp?.domain || lp?.serverIp;
  if (!lp || !host) return { web: null, ssh: null, fop2: null };
  // sem usuário: a tela encaixa o usuário SSH de quem está usando (Minha conta)
  return { web: `https://${host}`, ssh: `ssh://${lp.serverIp || lp.domain}:${lp.sshPort ?? 22}`, fop2: hasMod(cid, 'linepbx', 'fop2') ? `https://${host}/fop2/` : null };
};
const secretRef = (sid: string | null | undefined) => ({ hasSecret: !!sid, secretId: sid ?? null });
const listItem = (c: Client): ClientListItem => {
  const lp = activeSubs(c.id).find((s) => s.productCode === 'linepbx')?.settings;
  return {
    id: c.id, tradeName: c.tradeName, legalName: c.legalName, cnpj: c.cnpj, logoUrl: c.logoUrl, archived: c.archived, isInternal: c.isInternal,
    notes: c.notes, createdAt: c.createdAt, updatedAt: c.updatedAt,
    products: activeSubs(c.id).sort((a, b) => prodMeta(a.productCode).sortOrder - prodMeta(b.productCode).sortOrder).map((s) => { const p = prodMeta(s.productCode); return { code: p.code, name: p.name, color: p.color, activatedAt: s.activatedAt, modules: activeMods(s.id).map((m) => ({ code: modMeta(m.moduleId).code, name: modMeta(m.moduleId).name, activatedAt: m.activatedAt })) }; }),
    server: lp ? { hostingName: S.hostings.find((h) => h.id === lp.hostingId)?.name ?? null, serverIp: lp.serverIp ?? null, domain: lp.domain ?? null, sshPort: lp.sshPort ?? null } : null,
    links: links(c.id), didCount: S.dids.filter((d) => d.clientId === c.id && !d.deletedAt).length,
    deviceCount: S.devices.filter((d) => d.clientId === c.id && !d.deletedAt && d.currentModality !== 'venda').length,
    deviceValueCents: S.devices.filter((d) => d.clientId === c.id && !d.deletedAt && d.currentModality !== 'venda').reduce((a, d) => a + (valorDe(d) ?? 0), 0),
  };
};
const shapeSubMod = (m: SubMod): SubscriptionModule => {
  const meta = modMeta(m.moduleId); const st = m.settings; let settings: Record<string, any> | null = null;
  if (meta.code === 'fop2') settings = { adminExtension: st.adminExtension ?? null, defaultUserPassword: secretRef(st.defaultUserPasswordSecretId) };
  else if (meta.code === 'omniboard') settings = { adminLogin: st.adminLogin ?? null, adminPassword: secretRef(st.adminPasswordSecretId), userDefaultPassword: secretRef(st.userDefaultPasswordSecretId) };
  return { id: m.id, moduleCode: meta.code, moduleName: meta.name, hasSettings: meta.hasSettings, active: !m.deactivatedAt, activatedAt: m.activatedAt, deactivatedAt: m.deactivatedAt, notes: m.notes, settings };
};
const fullClient = (idc: string): ClientFull => {
  const c = S.clients.find((x) => x.id === idc && !x.deletedAt); if (!c) throw notFound('Cliente');
  const subs: Subscription[] = S.subs.filter((s) => s.clientId === idc && produtoVivo(s.productCode)).map((s) => {
    const p = prodMeta(s.productCode); const st = s.settings; let settings: Record<string, any> | null = null;
    if (s.productCode === 'linepbx') settings = { hostingId: st.hostingId, hostingName: S.hostings.find((h) => h.id === st.hostingId)?.name ?? null, serverIp: st.serverIp, domain: st.domain, sshPort: st.sshPort };
    else if (s.productCode === 'szchat') settings = { adminLogin: st.adminLogin ?? null, adminPassword: secretRef(st.adminPasswordSecretId) };
    const modules = S.subMods.filter((m) => m.subscriptionId === s.id).sort((a, b) => modMeta(a.moduleId).sortOrder - modMeta(b.moduleId).sortOrder).map(shapeSubMod);
    return { id: s.id, productCode: s.productCode, productName: p.name, color: p.color, hasSettings: p.hasSettings, active: !s.deactivatedAt, activatedAt: s.activatedAt, deactivatedAt: s.deactivatedAt, notes: s.notes, settings, modules, sortOrder: p.sortOrder };
  }).sort((a: any, b: any) => a.sortOrder - b.sortOrder);
  const net = S.networks.find((n) => n.clientId === idc);
  return {
    ...listItem(c), subscriptions: subs, unitCount: unidadesDe(idc).length,
    network: net ? { ipAddress: net.ipAddress, subnetMask: net.subnetMask, defaultRouter: net.defaultRouter, dns1: net.dns1, dns2: net.dns2, note: net.note, wirelessPassword: secretRef(net.wirelessPasswordSecretId), updatedAt: net.updatedAt } : null,
    deviceLogins: S.deviceLogins.filter((k) => k.clientId === idc && !k.deletedAt).map(shapeLogin).sort((a, b) => a.modelName.localeCompare(b.modelName, 'pt-BR')),
  };
};
const shapeCircuit = (c: CircuitRow): Circuit => {
  const ds = S.dids.filter((d) => d.circuitId === c.id && !d.deletedAt); const assigned = ds.filter((d) => d.clientId).length;
  return { id: c.id, name: c.name, code: c.code, keyNumber: c.keyNumber, thirdParty: c.thirdParty, carrierId: c.carrierId, carrierName: S.carriers.find((x) => x.id === c.carrierId)?.name ?? null, channels: c.channels, ownerClientId: c.ownerClientId, ownerName: S.clients.find((x) => x.id === c.ownerClientId)?.tradeName ?? null, monthlyValueCents: c.monthlyValueCents, authType: c.authType, signalingIp: c.signalingIp, authIp: c.authIp, authUsername: c.authUsername, authPassword: secretRef(c.authPasswordSecretId), notes: c.notes, dids: { total: ds.length, assigned, free: ds.length - assigned } };
};
const shapeDid = (d: DidRow): Did => { const c = S.circuits.find((x) => x.id === d.circuitId); return { id: d.id, number: d.number, numberFormatted: didFormatado(d.number), free: !d.clientId, circuitId: d.circuitId, circuitName: c?.name ?? null, circuitCode: c?.code ?? null, carrierName: S.carriers.find((x) => x.id === c?.carrierId)?.name ?? null, clientId: d.clientId, clientName: S.clients.find((x) => x.id === d.clientId)?.tradeName ?? null, ownerClientId: d.ownerClientId, ownerName: S.clients.find((x) => x.id === d.ownerClientId)?.tradeName ?? null, inUse: !!d.clientId && d.inUse, note: d.note, thirdParty: ehTerceiro(d.circuitId) }; };
const shapeModel = (m: ModelRow): DeviceModel => {
  const ds = S.devices.filter((d) => d.modelId === m.id && !d.deletedAt);
  const inStock = ds.filter((d) => !d.clientId).length;
  const withClients = ds.filter((d) => d.clientId && d.currentModality !== 'venda').length;
  return { id: m.id, code: m.code, name: m.name, categoryId: m.categoryId, imageUrl: m.image, valueCents: m.valueCents, categoryName: S.categories.find((c) => c.id === m.categoryId)?.name ?? null, counts: { total: inStock + withClients, inStock, withClients, sold: ds.filter((d) => d.currentModality === 'venda').length, inactive: ds.filter((d) => d.condition === 'inativo').length, ownValue: ds.filter((d) => d.valueCents != null).length } };
};
const shapeDevice = (d: DeviceRow, withHistory = false): Device => {
  const m = modeloDe(d);
  const ident = identificacaoAparelho(d);
  const base: Device = { ...d, macFormatted: macFormatado(d.mac), identificacao: ident.texto, identificacaoTipo: ident.tipo, valueCents: valorDe(d), ownValueCents: d.valueCents, modelValueCents: m.valueCents, modelImageUrl: m.image, modelName: m.name, modelCode: m.code, clientName: S.clients.find((x) => x.id === d.clientId)?.tradeName ?? null };
  if (withHistory) base.history = S.movements.filter((mv) => mv.items.some((i) => i.deviceId === d.id)).map((mv) => ({ id: mv.id, modality: mv.modality, modalityName: (MODALIDADES as any)[mv.modality], fromName: S.clients.find((x) => x.id === mv.fromClientId)?.tradeName ?? null, toName: S.clients.find((x) => x.id === mv.toClientId)?.tradeName ?? null, unit: mv.unit, newCondition: mv.newCondition, note: mv.note, userName: S.users.find((u) => u.id === mv.userId)?.name ?? '?', createdAt: mv.createdAt })).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return base;
};
const shapeMov = (mv: MovRow): Movement => ({
  id: mv.id, modality: mv.modality, modalityName: (MODALIDADES as any)[mv.modality], fromClientId: mv.fromClientId, fromName: S.clients.find((x) => x.id === mv.fromClientId)?.tradeName ?? null, toClientId: mv.toClientId, toName: S.clients.find((x) => x.id === mv.toClientId)?.tradeName ?? null, unit: mv.unit, newCondition: mv.newCondition, note: mv.note, userName: S.users.find((u) => u.id === mv.userId)?.name ?? '?', createdAt: mv.createdAt,
  items: Object.values(mv.items.reduce((acc, i) => { const k = i.modelId; acc[k] = acc[k] ?? { modelName: S.models.find((m) => m.id === k)?.name ?? '?', quantity: 0 }; acc[k]!.quantity += 1; return acc; }, {} as Record<string, { modelName: string; quantity: number }>)),
  devices: mv.items.map((i) => { const d = S.devices.find((x) => x.id === i.deviceId)!; return { id: d.id, modelName: modeloDe(d).name, identificacao: identificacaoAparelho(d).texto }; }),
});
const shapeProduct = (p: (typeof S.products)[number]): Product => ({ id: p.id, code: p.code, name: p.name, color: p.color, description: p.description, hasSettings: p.hasSettings, sortOrder: p.sortOrder, active: p.active, protegido: PROTEGIDOS.includes(p.code), activeClients: new Set(S.subs.filter((x) => x.productCode === p.code && !x.deactivatedAt && S.clients.some((c) => c.id === x.clientId && !c.deletedAt)).map((x) => x.clientId)).size, modules: S.modules.filter((m) => m.productId === p.id).sort((a, b) => a.sortOrder - b.sortOrder).map(({ productId: _p, ...m }) => m) });
const shapeUnit = (u: UnitRow): ClientUnit => {
  const ds = S.devices.filter((d) => d.clientId === u.clientId && !d.deletedAt);
  const n = ds.filter((d) => (d.unit ?? '').trim().toLowerCase() === u.name.toLowerCase()).length + (u.isMain ? ds.filter((d) => !(d.unit ?? '').trim()).length : 0);
  return { id: u.id, name: u.name, isMain: u.isMain, address: u.address, egressIp: u.egressIp, note: u.note, createdAt: u.createdAt, deviceCount: n };
};
const shapeLogin = (k: LoginRow): ClientDeviceLogin => ({ id: k.id, modelId: k.modelId, modelName: S.models.find((m) => m.id === k.modelId)?.name ?? '?', username: k.username, password: secretRef(k.passwordSecretId), note: k.note, updatedAt: k.updatedAt });
/** IP v4 como o servidor aceita; vazio vira nulo */
const ipOuErro = (v: unknown, campo: string) => { const t = String(v ?? '').trim(); if (!t) return null; if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(t)) throw new ApiError(400, 'Dados inválidos', [{ field: campo, message: 'IP inválido (ex.: 10.20.0.1)' }]); return t;
};
/**
 * Ordenação da demonstração: mesma ideia do servidor — vazio sempre no fim,
 * texto comparado em português e o que não for reconhecido cai na coluna padrão.
 */
function ordenar<T>(itens: T[], q: Record<string, unknown>, padrao: string, valores: Record<string, (x: T) => any>, dirPadrao: 'asc' | 'desc' = 'asc') {
  const chave = String(q.sort ?? padrao);
  const pegar = valores[chave] ?? valores[padrao]!;
  const sinal = (q.dir ?? dirPadrao) === 'desc' ? -1 : 1;
  return [...itens].sort((a, b) => {
    const va = pegar(a), vb = pegar(b);
    const vazioA = va === null || va === undefined || va === '';
    const vazioB = vb === null || vb === undefined || vb === '';
    if (vazioA && vazioB) return 0;
    if (vazioA) return 1;
    if (vazioB) return -1;
    if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * sinal;
    return String(va).localeCompare(String(vb), 'pt-BR', { numeric: true, sensitivity: 'base' }) * sinal;
  });
}

const paginate = <T,>(items: T[], q: Record<string, unknown>) => { const page = Number(q.page ?? 1), pageSize = Number(q.pageSize ?? 50); return { items: items.slice((page - 1) * pageSize, page * pageSize), total: items.length, page, pageSize }; };
const me = (u: UserRow): Me => { const r = S.roles.find((x) => x.id === u.roleId)!; return { id: u.id, name: u.name, email: u.email, roleId: u.roleId, roleName: r.name, roleKey: r.key, permissions: r.permissions, twoFactor: !!u.totpOn, recoveryLeft: u.recovery?.length ?? 0, sshUser: u.sshUser ?? null }; };

/**
 * Duas etapas na demonstração: o mesmo fluxo de telas, sem criptografia de verdade.
 * O "segredo" é fixo e qualquer código de 6 dígitos passa — é uma prévia, não o sistema.
 */
let esperandoCodigo: UserRow | null = null;
const QR_DEMO = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 29 29" shape-rendering="crispEdges"><rect width="29" height="29" fill="#fff"/><path fill="#000" d="M1 1h7v7h-7zM10 1h2v1h-2zM14 1h1v3h-1zM17 1h2v2h-2zM21 1h7v7h-7zM2 2h5v5h-5zM22 2h5v5h-5zM3 3h3v3h-3zM11 3h2v2h-2zM23 3h3v3h-3zM10 5h1v2h-1zM16 5h3v1h-3zM13 6h2v2h-2zM18 6h1v3h-1zM10 9h3v1h-3zM15 9h2v1h-2zM20 9h3v1h-3zM1 10h2v1h-2zM5 10h4v1h-4zM13 10h1v2h-1zM17 10h2v1h-2zM24 10h4v1h-4zM3 11h2v2h-2zM9 11h2v2h-2zM15 11h1v3h-1zM20 11h2v1h-2zM26 11h2v2h-2zM1 12h1v3h-1zM6 12h3v1h-3zM12 12h2v1h-2zM18 12h3v1h-3zM23 12h2v2h-2zM4 13h3v1h-3zM10 13h1v3h-1zM17 13h1v3h-1zM21 13h2v2h-2zM2 14h3v1h-3zM8 14h1v3h-1zM13 14h3v1h-3zM19 14h1v3h-1zM25 14h3v1h-3zM5 15h2v2h-2zM12 15h1v3h-1zM15 15h2v1h-2zM22 15h2v2h-2zM1 16h3v1h-3zM14 16h1v3h-1zM20 16h3v1h-3zM26 16h2v2h-2zM3 17h2v2h-2zM9 17h2v1h-2zM16 17h2v1h-2zM24 17h2v1h-2zM10 18h3v1h-3zM18 18h3v1h-3zM21 18h1v3h-1zM1 20h7v7h-7zM10 20h2v1h-2zM14 20h3v1h-3zM19 20h2v1h-2zM23 20h2v2h-2zM2 21h5v5h-5zM12 21h1v3h-1zM17 21h2v2h-2zM26 21h2v2h-2zM3 22h3v3h-3zM10 22h1v3h-1zM14 22h2v1h-2zM20 22h2v1h-2zM24 22h2v2h-2zM13 23h1v3h-1zM16 23h1v3h-1zM19 23h2v2h-2zM11 24h2v1h-2zM22 24h3v1h-3zM10 25h1v2h-1zM14 25h3v1h-3zM18 25h1v3h-1zM21 25h2v2h-2zM25 25h3v2h-3zM12 26h2v1h-2zM16 26h1v2h-1zM20 26h1v2h-1z"/></svg>';
const hasEquip = (cid: string) => activeSubs(cid).some((s) => s.productCode === 'equipamentos');
/** Os filtros da tela de Circuitos — os mesmos para a lista e para os cartões do topo. */
/** Link de terceiro (tronco do próprio cliente) só entra com o interruptor ligado. */
const ligado = (v: unknown) => v === true || v === 'true' || v === 1 || v === '1';
const filtrarCircuitos = (q: Record<string, unknown>) => {
  const t = String(q.q ?? '').toLowerCase();
  return S.circuits.filter((c) => !c.deletedAt
    && (ligado(q.includeThirdParty) || !c.thirdParty)
    && (!q.carrierId || c.carrierId === q.carrierId)
    && (!q.ownerClientId || c.ownerClientId === q.ownerClientId)
    && (!t || c.name.toLowerCase().includes(t) || c.code.includes(t) || (c.keyNumber ?? '').includes(t)));
};
const ehTerceiro = (circuitId: string | null) => !!S.circuits.find((c) => c.id === circuitId)?.thirdParty;
const filterDids = (q: Record<string, unknown>) => S.dids.filter((d) => !d.deletedAt).filter((d) => (ligado(q.includeThirdParty) || !ehTerceiro(d.circuitId))).filter((d) => (!q.q || d.number.includes(String(q.q).replace(/\D/g, ''))) && (!q.circuitId || d.circuitId === q.circuitId) && (!q.clientId || (q.clientId === 'free' ? !d.clientId : d.clientId === q.clientId)) && (!q.ownerClientId || d.ownerClientId === q.ownerClientId)
  // em uso / não usado só faz sentido com cliente: número livre não entra em nenhum dos dois
  && (q.inUse === undefined || q.inUse === '' || (!!d.clientId && d.inUse === (q.inUse === 'true' || q.inUse === true))));

/** Os filtros da aba Aparelhos (os mesmos da lista e dos cartões). clientId: stock | clients | um id. */
const filtrarAparelhos = (q: Record<string, unknown>) => {
  const t = String(q.q ?? '').toLowerCase(); const hex = t.replace(/[^0-9a-f]/g, '').toUpperCase(); const serie = serieLimpa(t);
  return S.devices.filter((d) => !d.deletedAt
    && (!q.modelId || d.modelId === q.modelId)
    && (!q.clientId || (q.clientId === 'stock' ? !d.clientId : q.clientId === 'clients' ? !!d.clientId : d.clientId === q.clientId))
    && (!q.condition || d.condition === q.condition)
    && (ligado(q.includeSold) || (d.currentModality ?? '') !== 'venda')
    && (!t || (hex.length >= 4 && (d.mac ?? '').includes(hex)) || (!!serie && (d.serialNumber ?? '').includes(serie)) || (d.unit ?? '').toLowerCase().includes(t) || (d.ip ?? '').includes(t) || (d.note ?? '').toLowerCase().includes(t)));
};

/** Grava os itens da nota: com id atualiza, sem id entra, o que não veio sai (como no servidor). */
function aplicarItens(n: NotaRow, itens?: Array<Record<string, any>>) {
  if (!itens) return;
  n.items = itens.map((it) => {
    const atual = n.items.find((x) => x.id === it.id);
    const imagem = it.imagem === null ? null : typeof it.imagem === 'string' ? it.imagem : atual?.imagem ?? null;
    return { id: atual?.id ?? id(), kind: (it.kind ?? 'novo') as NovidadeItem['kind'], title: String(it.title), text: (it.text as string) ?? null, imagem };
  });
}
const notasVivas = () => S.notas.filter((n) => !n.deletedAt);
const podeEditarNovidades = () => !!S.me && (S.roles.find((r) => r.id === S.me!.roleId)?.permissions.includes('admin.manage') ?? false);
const shapeNota = (n: NotaRow): Novidade => ({
  id: n.id, version: n.version, title: n.title, summary: n.summary, publishedAt: n.publishedAt, createdAt: n.createdAt, updatedAt: n.updatedAt,
  lida: S.leituras.some((l) => l.noteId === n.id && l.userId === S.me?.id),
  leituras: S.leituras.filter((l) => l.noteId === n.id).length,
  pessoas: S.users.filter((u) => u.active).length,
  items: n.items.map((i, ordem) => ({ id: i.id, kind: i.kind, title: i.title, text: i.text, sortOrder: ordem, imageUrl: i.imagem })),
});

// ---------------- a API ----------------
export const demoApi: Api = {
  auth: {
    async me() { await wait(50); if (!S.me) throw new ApiError(401, 'Faça login para continuar'); return me(S.me); },
    async login(email, password) {
      await wait(300);
      const u = S.users.find((x) => x.email === email.toLowerCase() && x.active);
      if (!u || password !== u.password) throw new ApiError(401, 'E-mail ou senha incorretos (na demonstração, a senha é "demo")');
      if (u.totpOn) { esperandoCodigo = u; return { needsCode: true, user: null }; }
      S.me = u; u.lastLoginAt = now(); audit('login', 'user', `${u.name} entrou`, u.id);
      return { needsCode: false, user: me(u) };
    },
    async loginCode(code) {
      await wait(250);
      const u = esperandoCodigo;
      if (!u) throw new ApiError(401, 'Entre com e-mail e senha primeiro');
      const limpo = (code ?? '').trim().toUpperCase();
      const recuperacao = u.recovery?.includes(limpo);
      if (!/^\d{6}$/.test(limpo) && !recuperacao) throw new ApiError(401, 'Código incorreto. Confira o aplicativo e tente de novo.');
      if (recuperacao) u.recovery = (u.recovery ?? []).filter((c) => c !== limpo);
      esperandoCodigo = null; S.me = u; u.lastLoginAt = now();
      audit('login', 'user', `${u.name} entrou (com verificação em duas etapas)`, u.id);
      return me(u);
    },
    async twoFactorSetup() { await wait(200); if (!S.me) throw new ApiError(401, 'Faça login'); S.me.totpSecret = 'DEMODEMODEMODEMODEMODEMODEMODEMO'; return { secret: S.me.totpSecret, uri: 'otpauth://totp/Ingline%20Gest%C3%A3o', qrSvg: QR_DEMO }; },
    async twoFactorEnable(code) {
      await wait(250);
      if (!S.me) throw new ApiError(401, 'Faça login');
      if (!/^\d{6}$/.test((code ?? '').trim())) throw new ApiError(400, 'Código incorreto. O relógio do celular está certo?');
      S.me.totpOn = true;
      S.me.recovery = Array.from({ length: 10 }, () => `${Math.random().toString(36).slice(2, 7).toUpperCase()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`);
      audit('two_factor_on', 'user', `${S.me.name} ligou a verificação em duas etapas`, S.me.id);
      return { recovery: S.me.recovery };
    },
    async twoFactorDisable(password) {
      await wait(250);
      if (!S.me) throw new ApiError(401, 'Faça login');
      if (password !== S.me.password) throw new ApiError(401, 'Senha incorreta');
      S.me.totpOn = false; S.me.totpSecret = null; S.me.recovery = [];
      audit('two_factor_off', 'user', `${S.me.name} desligou a verificação em duas etapas`, S.me.id);
      return { ok: true };
    },
    async logout() { if (S.me) audit('logout', 'user', `${S.me.name} saiu`, S.me.id); S.me = null; esperandoCodigo = null; return { ok: true }; },
    async changePassword(cur, nw) { if (!S.me) throw new ApiError(401, 'Faça login'); if (cur !== S.me.password) throw new ApiError(401, 'Senha atual incorreta'); S.me.password = nw; return { ok: true }; },
    async updateMe(d) {
      await wait(); if (!S.me) throw new ApiError(401, 'Faça login');
      const v = (d.sshUser ?? '').trim();
      if (v && !/^[A-Za-z0-9._-]+$/.test(v)) throw new ApiError(400, 'Dados inválidos', [{ field: 'sshUser', message: 'Use só letras, números, ponto, hífen e _' }]);
      S.me.sshUser = v || null;
      audit('update', 'user', `${S.me.name} ${v ? `definiu o próprio usuário SSH (${v})` : 'tirou o próprio usuário SSH'}`, S.me.id);
      return me(S.me);
    },
  },
  dashboard: {
    async summary() {
      await wait(); requirePerm('records.read');
      const active = S.clients.filter((c) => !c.deletedAt && !c.archived && !c.isInternal);
      const ds = S.dids.filter((d) => !d.deletedAt && !ehTerceiro(d.circuitId)); // o painel é o controle da VoiceNet
      const circuits = S.circuits.filter((c) => !c.deletedAt && !c.thirdParty).map(shapeCircuit).map((c) => ({ id: c.id, name: c.name, carrierName: c.carrierName, channels: c.channels, total: c.dids.total, assigned: c.dids.assigned, free: c.dids.free })).sort((a, b) => b.total - a.total);
      const dev = S.devices.filter((d) => !d.deletedAt);
      const alerts: any[] = [];
      const lpNo = active.filter((c) => activeSubs(c.id).some((s) => s.productCode === 'linepbx' && !(s.settings.domain || s.settings.serverIp))).length; if (lpNo) alerts.push({ kind: 'linepbx_sem_endereco', severity: 'warning', message: 'Clientes com LinePBX sem endereço do servidor', count: lpNo, link: '/clientes?produtos=linepbx' });
      const didNo = new Set(ds.filter((d) => d.clientId && !activeSubs(d.clientId).some((s) => s.productCode === 'voicenet')).map((d) => d.clientId)).size; if (didNo) alerts.push({ kind: 'did_sem_voicenet', severity: 'warning', message: 'Clientes com DIDs alocados mas sem o produto VoiceNet', count: didNo, link: '/circuitos?aba=numeracao' });
      const zero = circuits.filter((c) => c.channels === 0 && c.total > 0).length; if (zero) alerts.push({ kind: 'circuito_sem_canais', severity: 'critical', message: 'Circuitos com DIDs mas 0 canais cadastrados', count: zero, link: '/circuitos' });
      const inativos = dev.filter((d) => d.condition === 'inativo').length; if (inativos) alerts.push({ kind: 'aparelho_inativo', severity: 'warning', message: 'Aparelhos inativos', count: inativos, link: '/inventario?condicao=inativo' });
      // quem está com mais valor nosso na mão (locação + comodato), para o gráfico do Painel
      const porCliente = new Map<string, { clientId: string; nome: string; n: number; valorCents: number }>();
      for (const d0 of dev.filter((x) => x.clientId && ['locacao', 'comodato'].includes(x.currentModality ?? ''))) {
        const atual = porCliente.get(d0.clientId!) ?? { clientId: d0.clientId!, nome: S.clients.find((c) => c.id === d0.clientId)?.tradeName ?? '?', n: 0, valorCents: 0 };
        atual.n += 1; atual.valorCents += valorDe(d0) ?? 0;
        porCliente.set(d0.clientId!, atual);
      }
      const valorPorCliente = [...porCliente.values()].sort((a, b) => b.valorCents - a.valorCents).slice(0, 8);

      return {
        valorPorCliente,
        clients: { active: active.length, byProduct: S.products.filter((p) => !p.deletedAt).map((p) => ({ code: p.code, name: p.name, color: p.color, n: active.filter((c) => activeSubs(c.id).some((s) => s.productCode === p.code)).length })) },
        dids: { total: ds.length, assigned: ds.filter((d) => d.clientId).length, free: ds.filter((d) => !d.clientId).length },
        circuits,
        devices: {
          inStock: dev.filter((d) => !d.clientId).length,
          withClients: dev.filter((d) => d.clientId && d.currentModality !== 'venda').length,
          inactive: inativos,
          valueWithClientsCents: dev.filter((d) => d.clientId && ['locacao', 'comodato'].includes(d.currentModality ?? '')).reduce((a, d) => a + (valorDe(d) ?? 0), 0),
        },
        alerts,
        recentMovements: [...S.movements].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 6).map((m) => ({ id: m.id, modality: m.modality, modalityName: (MODALIDADES as any)[m.modality], fromName: S.clients.find((x) => x.id === m.fromClientId)?.tradeName ?? null, toName: S.clients.find((x) => x.id === m.toClientId)?.tradeName ?? null, userName: S.users.find((u) => u.id === m.userId)?.name ?? '?', createdAt: m.createdAt })),
        recentAudit: S.audit.filter((a) => !['login', 'logout'].includes(a.action)).slice(0, 8),
        projetos: (() => {
          const abertos = projetosVivos().filter((x) => x.status === 'aberto').map(resumoProjeto).filter((x) => x.total > 0);
          return {
            abertos: abertos.length,
            atrasados: abertos.filter((x) => x.atrasado).length,
            travados: abertos.reduce((a, x) => a + x.contagem.travado, 0),
            items: abertos.slice(0, 4).map((x) => ({ id: x.id, name: x.name, andamento: x.andamento, faltam: x.faltam, total: x.total, atrasado: x.atrasado })),
          };
        })(),
      };
    },
    async search(q) {
      await wait(80); requirePerm('records.read'); const t = q.trim().toLowerCase(); const digits = t.replace(/\D/g, ''); const hex = t.replace(/[^0-9a-f]/g, '').toUpperCase();
      if (!t) return { clients: [], dids: [], circuits: [], devices: [] };
      return {
        clients: S.clients.filter((c) => !c.deletedAt && !c.isInternal && (c.tradeName.toLowerCase().includes(t) || c.legalName.toLowerCase().includes(t) || (digits && c.cnpj.includes(digits)))).slice(0, 8).map((c) => ({ id: c.id, name: c.tradeName, legalName: c.legalName, cnpj: c.cnpj })),
        dids: digits.length >= 3 ? S.dids.filter((d) => !d.deletedAt && d.number.includes(digits)).slice(0, 8).map((d) => { const s = shapeDid(d); return { id: d.id, number: d.number, numberFormatted: s.numberFormatted, clientName: s.clientName, circuitName: s.circuitName }; }) : [],
        circuits: S.circuits.filter((c) => !c.deletedAt && (c.name.toLowerCase().includes(t) || c.code.includes(t))).slice(0, 8).map((c) => ({ id: c.id, name: c.name, code: c.code, carrierName: S.carriers.find((x) => x.id === c.carrierId)?.name ?? null })),
        devices: S.devices.filter((d) => !d.deletedAt && ((hex.length >= 4 && (d.mac ?? '').includes(hex)) || (d.serialNumber ?? '').toLowerCase().includes(t.replace(/\s/g, '')) || (d.unit ?? '').toLowerCase().includes(t))).slice(0, 8).map((d) => ({ id: d.id, mac: d.mac, serialNumber: d.serialNumber, macFormatted: d.mac ? macFormatado(d.mac) : d.serialNumber ? `N/S ${d.serialNumber}` : 'sem identificação', unit: d.unit, modelName: S.models.find((m) => m.id === d.modelId)?.name ?? '?', clientName: S.clients.find((x) => x.id === d.clientId)?.tradeName ?? null })),
      };
    },
  },
  clients: {
    async list(q) {
      await wait(); requirePerm('records.read');
      const term = String(q.q ?? '').toLowerCase(); const digits = term.replace(/\D/g, '');
      const prods = ([] as string[]).concat((q.products as any) ?? []); const mods = ([] as string[]).concat((q.modules as any) ?? []); const mode = q.mode ?? 'or';
      const items = S.clients.filter((c) => !c.deletedAt && !c.isInternal && (q.includeArchived === true || q.includeArchived === 'true' || !c.archived))
        .filter((c) => !term || c.tradeName.toLowerCase().includes(term) || c.legalName.toLowerCase().includes(term) || (digits && c.cnpj.includes(digits)))
        .filter((c) => { if (!prods.length) return true; const have = activeSubs(c.id).map((s) => s.productCode); return mode === 'and' ? prods.every((p) => have.includes(p)) : prods.some((p) => have.includes(p)); })
        .filter((c) => { if (!mods.length) return true; const test = (pm: string) => { const [p, m] = pm.split(':'); return hasMod(c.id, p!, m!); }; return mode === 'and' ? mods.every(test) : mods.some(test); })
        .map(listItem);
      const doProduto = (c: ClientListItem, code: string) => c.products.find((p) => p.code === code);
      const valores: Record<string, (c: ClientListItem) => any> = {
        tradeName: (c) => c.tradeName, legalName: (c) => c.legalName, cnpj: (c) => c.cnpj, notes: (c) => c.notes,
        createdAt: (c) => c.createdAt, updatedAt: (c) => c.updatedAt,
        didCount: (c) => c.didCount, deviceCount: (c) => c.deviceCount,
        products: (c) => c.products.length, modules: (c) => c.products.reduce((a, p) => a + p.modules.length, 0),
        hosting: (c) => c.server?.hostingName, domain: (c) => c.server?.domain, serverIp: (c) => c.server?.serverIp, ssh: (c) => c.server?.sshPort,
      };
      const chave = String(q.sort ?? 'tradeName');
      if (chave.startsWith('ativacao:')) valores[chave] = (c) => doProduto(c, chave.slice(9))?.activatedAt;
      if (chave.startsWith('modulo:')) { const [, pc = '', mc = ''] = chave.split(':'); valores[chave] = (c) => doProduto(c, pc)?.modules.find((m) => m.code === mc)?.activatedAt; }
      return paginate(ordenar(items, q, 'tradeName', valores), q);
    },
    async options(q) { await wait(50); return S.clients.filter((c) => !c.deletedAt && !c.archived && (q?.includeInternal || !c.isInternal) && (!q?.productCode || activeSubs(c.id).some((s) => s.productCode === q.productCode)) && (!q?.withDevices || S.devices.some((d) => !d.deletedAt && d.clientId === c.id && d.currentModality !== 'venda'))).sort((a, b) => Number(b.isInternal) - Number(a.isInternal) || a.tradeName.localeCompare(b.tradeName)).map((c) => ({ id: c.id, name: c.tradeName, isInternal: c.isInternal, internalCode: c.internalCode })); },
    async get(idc) { await wait(); requirePerm('records.read'); return fullClient(idc); },
    async projetos(idc) { await wait(60); requirePerm('records.read'); return projetosDoCliente(idc); },
    async create(d) { await wait(); requirePerm('records.write'); const cnpj = cnpjLimpo(String(d.cnpj ?? '')); if (!cnpjValido(cnpj)) throw new ApiError(400, 'Dados inválidos', [{ field: 'cnpj', message: 'CNPJ inválido (dígito verificador não confere)' }]); if (S.clients.some((c) => c.cnpj === cnpj)) throw bad('Já existe um cliente com este CNPJ'); const c: Client = { id: id(), tradeName: String(d.tradeName), legalName: String(d.legalName), cnpj, logoUrl: null, archived: false, isInternal: false, internalCode: null, notes: (d.notes as string) ?? null, deletedAt: null, createdAt: now(), updatedAt: now() }; S.clients.push(c); unidadesDe(c.id); audit('create', 'client', `Criou o cliente ${c.tradeName}`, c.id); return fullClient(c.id); },
    async update(idc, d) { await wait(); requirePerm('records.write'); const c = S.clients.find((x) => x.id === idc); if (!c) throw notFound('Cliente'); if (d.cnpj) { const cn = cnpjLimpo(String(d.cnpj)); if (!cnpjValido(cn)) throw new ApiError(400, 'Dados inválidos', [{ field: 'cnpj', message: 'CNPJ inválido' }]); c.cnpj = cn; } for (const k of ['tradeName', 'legalName', 'notes', 'archived'] as const) if (d[k] !== undefined) (c as any)[k] = d[k]; c.updatedAt = now(); audit('update', 'client', `${S.me!.name} ${d.archived === true ? 'arquivou' : d.archived === false ? 'desarquivou' : 'editou'} o cliente ${c.tradeName}`, c.id); return fullClient(c.id); },
    async remove(idc) { await wait(); requirePerm('records.delete'); const c = S.clients.find((x) => x.id === idc); if (!c) throw notFound('Cliente'); c.deletedAt = now(); audit('delete', 'client', `Mandou o cliente ${c.tradeName} para a lixeira`, c.id); return { ok: true }; },
    async upsertSubscription(idc, d) {
      await wait(); requirePerm('records.write'); const c = S.clients.find((x) => x.id === idc); if (!c) throw notFound('Cliente');
      const st = (d.settings as Record<string, any>) ?? {};
      if (['serverIp', 'domain', 'sshPort', 'hostingId'].some((k) => k in st)) requirePerm('servers.write');
      let s = S.subs.find((x) => x.clientId === idc && x.productCode === d.productCode);
      if (!S.products.some((p) => p.code === d.productCode && !p.deletedAt)) throw notFound(`Produto "${d.productCode}"`);
      if (!s) { s = { id: id(), clientId: idc, productCode: String(d.productCode), activatedAt: now(), deactivatedAt: null, notes: null, settings: {} }; S.subs.push(s); }
      s.deactivatedAt = null; if (d.activatedAt !== undefined) s.activatedAt = dia(d.activatedAt); if (d.notes !== undefined) s.notes = d.notes as string;
      const saveSecret = (key: string, label: string) => { if (st[key]) { const sid = s!.settings[key + 'SecretId'] ?? id(); S.secrets.set(sid, { label: `${label} — ${c.tradeName}`, value: st[key] }); s!.settings[key + 'SecretId'] = sid; } };
      for (const [k, v] of Object.entries(st)) if (!/password/i.test(k)) s.settings[k] = v;
      saveSecret('adminPassword', 'Senha admin do SZChat');
      audit('update', 'subscription', `Atualizou o produto ${d.productCode} no cliente ${c.tradeName}`, s.id); return fullClient(idc);
    },
    async upsertModule(idc, d) {
      await wait(); requirePerm('records.write'); const c = S.clients.find((x) => x.id === idc); if (!c) throw notFound('Cliente');
      const p = S.products.find((x) => x.code === d.productCode); if (!p) throw notFound(`Produto "${d.productCode}"`);
      const mod = S.modules.find((m) => m.productId === p.id && m.code === d.moduleCode); if (!mod) throw notFound(`Módulo "${d.moduleCode}" do produto ${p.name}`);
      const sub = activeSubs(idc).find((x) => x.productCode === p.code); if (!sub) throw bad(`Marque o produto ${p.name} no cliente antes de ligar o módulo ${mod.name}`);
      let m = S.subMods.find((x) => x.subscriptionId === sub.id && x.moduleId === mod.id);
      if (!m) { m = { id: id(), subscriptionId: sub.id, moduleId: mod.id, activatedAt: now(), deactivatedAt: null, notes: null, settings: {} }; S.subMods.push(m); }
      m.deactivatedAt = null; if (d.activatedAt !== undefined) m.activatedAt = dia(d.activatedAt); if (d.notes !== undefined) m.notes = d.notes as string;
      const st = (d.settings as Record<string, any>) ?? {};
      for (const [k, v] of Object.entries(st)) if (!/password/i.test(k)) m.settings[k] = v;
      const saveSecret = (key: string, label: string) => { if (st[key]) { const sid = m!.settings[key + 'SecretId'] ?? id(); S.secrets.set(sid, { label: `${label} — ${c.tradeName}`, value: st[key] }); m!.settings[key + 'SecretId'] = sid; } };
      saveSecret('adminPassword', 'Senha admin do Omniboard'); saveSecret('userDefaultPassword', 'Senha padrão de usuário do Omniboard'); saveSecret('defaultUserPassword', 'Senha do usuário padrão do FOP2');
      audit('update', 'subscription_module', `Ligou/ajustou o módulo ${mod.name} (${p.name}) no cliente ${c.tradeName}`, m.id); return fullClient(idc);
    },
    async endModule(idc, productCode, moduleCode) {
      await wait(); requirePerm('records.write'); const sub = S.subs.find((x) => x.clientId === idc && x.productCode === productCode); if (!sub) throw notFound('Assinatura');
      const mod = S.modules.find((x) => x.productId === 'p' + productCode && x.code === moduleCode); if (!mod) throw notFound('Módulo');
      const m = S.subMods.find((x) => x.subscriptionId === sub.id && x.moduleId === mod.id && !x.deactivatedAt); if (!m) throw notFound('Módulo ligado');
      m.deactivatedAt = now(); audit('unsubscribe', 'subscription_module', `Desligou o módulo ${mod.name} (${prodMeta(productCode).name}) no cliente ${idc}`, m.id); return fullClient(idc);
    },
    async endSubscription(idc, code) { await wait(); requirePerm('records.write'); const s = S.subs.find((x) => x.clientId === idc && x.productCode === code && !x.deactivatedAt); if (!s) throw notFound('Assinatura ativa'); s.deactivatedAt = now(); audit('unsubscribe', 'subscription', `Encerrou o produto ${code} no cliente ${idc}`, s.id); return fullClient(idc); },
    async dids(idc) { await wait(); return paginate(S.dids.filter((d) => d.clientId === idc && !d.deletedAt).map(shapeDid), { pageSize: 100000 }); },
    async devices(idc) { await wait(); return { devices: paginate(S.devices.filter((d) => d.clientId === idc && !d.deletedAt && d.currentModality !== 'venda').map((d) => shapeDevice(d)), { pageSize: 100000 }) }; },
    async units(idc) { await wait(60); requirePerm('records.read'); return unidadesDe(idc).map(shapeUnit); },
    async createUnit(idc, d) {
      await wait(); requirePerm('records.write');
      const c = S.clients.find((x) => x.id === idc); if (!c) throw notFound('Cliente');
      const nome = String(d.name ?? '').trim(); if (!nome) throw new ApiError(400, 'Dados inválidos', [{ field: 'name', message: 'Informe o nome da unidade' }]);
      if (unidadesDe(idc).some((u) => u.name.toLowerCase() === nome.toLowerCase())) throw bad(`Já existe a unidade "${nome}" neste cliente`);
      const u: UnitRow = { id: id(), clientId: idc, name: nome, isMain: false, address: (d.address as string) ?? null, egressIp: ipOuErro(d.egressIp, 'egressIp'), note: d.note ?? null, createdAt: now(), deletedAt: null };
      S.units.push(u); audit('create', 'client', `Cadastrou a unidade "${nome}" em ${c.tradeName}`, idc);
      return shapeUnit(u);
    },
    async updateUnit(idc, unitId, d) {
      await wait(); requirePerm('records.write');
      const u = S.units.find((x) => x.id === unitId && x.clientId === idc && !x.deletedAt); if (!u) throw notFound('Unidade');
      const nome = String(d.name ?? '').trim(); if (!nome) throw new ApiError(400, 'Dados inválidos', [{ field: 'name', message: 'Informe o nome da unidade' }]);
      if (unidadesDe(idc).some((x) => x.id !== unitId && x.name.toLowerCase() === nome.toLowerCase())) throw bad(`Já existe a unidade "${nome}" neste cliente`);
      const antigo = u.name;
      // os aparelhos da unidade acompanham o nome novo
      if (antigo !== nome) for (const dv of S.devices) if (dv.clientId === idc && (dv.unit ?? '').trim().toLowerCase() === antigo.toLowerCase()) dv.unit = nome;
      u.name = nome; if (d.note !== undefined) u.note = d.note ?? null; if (d.address !== undefined) u.address = (d.address as string) ?? null; if (d.egressIp !== undefined) u.egressIp = ipOuErro(d.egressIp, 'egressIp');
      audit('update', 'client', antigo === nome ? `Editou a unidade "${nome}"` : `Renomeou a unidade "${antigo}" para "${nome}"`, idc);
      return shapeUnit(u);
    },
    async removeUnit(idc, unitId) {
      await wait(); requirePerm('records.write');
      const u = S.units.find((x) => x.id === unitId && x.clientId === idc && !x.deletedAt); if (!u) throw notFound('Unidade');
      if (u.isMain) throw bad('A Matriz é a unidade padrão do cliente e não pode ser removida. Se quiser, renomeie.');
      const n = shapeUnit(u).deviceCount; if (n) throw bad(`A unidade "${u.name}" ainda tem ${n} aparelho(s). Mova-os para outra unidade antes de remover.`);
      u.deletedAt = now(); audit('delete', 'client', `Removeu a unidade "${u.name}"`, idc);
      return { ok: true };
    },
    async saveDeviceLogin(idc, d) {
      await wait(); requirePerm('records.write');
      const c = S.clients.find((x) => x.id === idc); if (!c) throw notFound('Cliente');
      const m = S.models.find((x) => x.id === d.modelId && !x.deletedAt); if (!m) throw notFound('Modelo');
      // um login por modelo: gravar de novo atualiza a linha que já existe
      let k = S.deviceLogins.find((x) => x.clientId === idc && x.modelId === m.id && !x.deletedAt);
      if (!k) { k = { id: id(), clientId: idc, modelId: m.id, username: null, passwordSecretId: null, note: null, updatedAt: now(), deletedAt: null }; S.deviceLogins.push(k); }
      if (d.username !== undefined) k.username = (d.username as string) ?? null;
      if (d.note !== undefined) k.note = (d.note as string) ?? null;
      if (d.password) { const sid = k.passwordSecretId ?? id(); S.secrets.set(sid, { label: `Senha padrão ${m.name} — ${c.tradeName}`, value: String(d.password) }); k.passwordSecretId = sid; }
      k.updatedAt = now(); audit('update', 'client', `Alterou o login padrão dos ${m.name} de ${c.tradeName}${d.password ? ' (senha trocada)' : ''}`, idc);
      return fullClient(idc);
    },
    async removeDeviceLogin(idc, loginId) {
      await wait(); requirePerm('records.write');
      const k = S.deviceLogins.find((x) => x.id === loginId && x.clientId === idc && !x.deletedAt); if (!k) throw notFound('Login padrão');
      k.deletedAt = now(); audit('delete', 'client', `Removeu o login padrão dos ${S.models.find((m) => m.id === k.modelId)?.name ?? '?'}`, idc);
      return fullClient(idc);
    },
    async saveNetwork(idc, d) {
      await wait(); requirePerm('records.write');
      const c = S.clients.find((x) => x.id === idc); if (!c) throw notFound('Cliente');
      let n = S.networks.find((x) => x.clientId === idc);
      if (!n) { n = { clientId: idc, ipAddress: null, subnetMask: null, defaultRouter: null, dns1: null, dns2: null, wirelessPasswordSecretId: null, note: null, updatedAt: now() }; S.networks.push(n); }
      if (d.ipAddress !== undefined) n.ipAddress = (d.ipAddress as string) ?? null;
      for (const f of ['subnetMask', 'defaultRouter', 'dns1', 'dns2'] as const) if (d[f] !== undefined) n[f] = ipOuErro(d[f], f);
      if (d.note !== undefined) n.note = (d.note as string) ?? null;
      if (d.wirelessPassword) { const sid = n.wirelessPasswordSecretId ?? id(); S.secrets.set(sid, { label: `Senha do ramal sem fio — ${c.tradeName}`, value: String(d.wirelessPassword) }); n.wirelessPasswordSecretId = sid; }
      n.updatedAt = now(); audit('update', 'client', `Alterou a rede padrão dos aparelhos de ${c.tradeName}${d.wirelessPassword ? ' (senha do ramal sem fio trocada)' : ''}`, idc);
      return fullClient(idc);
    },
    async history(idc) { await wait(); requirePerm('audit.read'); return paginate(S.audit.filter((a) => a.entityId === idc), { pageSize: 100 }); },
    async saveLogo(idc, dataUrl) {
      await wait(200); requirePerm('records.write');
      const c = S.clients.find((x) => x.id === idc); if (!c) throw notFound('Cliente');
      if (!/^data:image\//.test(dataUrl)) throw bad('Formato não suportado. Use PNG, JPG, WEBP ou SVG.');
      if (dataUrl.length > 700_000) throw bad('Imagem muito grande (máximo 512 KB).');
      c.logoUrl = dataUrl; c.updatedAt = now();
      audit('update', 'client', `Trocou a logo de ${c.tradeName}`, c.id);
      return fullClient(idc);
    },
    async removeLogo(idc) {
      await wait(); requirePerm('records.write');
      const c = S.clients.find((x) => x.id === idc); if (!c) throw notFound('Cliente');
      if (!c.logoUrl) throw notFound('Logo');
      c.logoUrl = null; c.updatedAt = now();
      audit('update', 'client', `Removeu a logo de ${c.tradeName}`, c.id);
      return fullClient(idc);
    },
  },
  secrets: {
    async reveal(sid, password) { await wait(250); requirePerm('secrets.reveal'); if (password !== S.me!.password) throw new ApiError(401, 'Senha incorreta'); const s = S.secrets.get(sid); if (!s) throw notFound('Segredo'); audit('reveal_secret', 'secret', `${S.me!.name} revelou "${s.label}"`, sid); return { label: s.label, value: s.value, visibleForSeconds: 30 }; },
  },
  circuits: {
    async list(q) {
      await wait(); requirePerm('records.read');
      const items = filtrarCircuitos(q).map(shapeCircuit);
      return paginate(ordenar(items, q, 'name', {
        name: (c) => c.name, code: (c) => c.code, keyNumber: (c) => c.keyNumber, carrierName: (c) => c.carrierName, ownerName: (c) => c.ownerName,
        channels: (c) => c.channels, total: (c) => c.dids.total, free: (c) => c.dids.free,
        uso: (c) => (c.dids.total ? c.dids.assigned / c.dids.total : -1), monthlyValueCents: (c) => c.monthlyValueCents,
      }), q);
    },
    async summary(q = {}) {
      await wait(60); requirePerm('records.read');
      const cs = filtrarCircuitos(q);
      const ids = new Set(cs.map((c) => c.id));
      // só os DIDs dos circuitos que sobraram (os de terceiro já saíram de `cs`)
      const ds = S.dids.filter((d) => !d.deletedAt && !!d.circuitId && ids.has(d.circuitId));
      const assigned = ds.filter((d) => d.clientId).length;
      return { circuits: cs.length, channels: cs.reduce((a, c) => a + c.channels, 0), monthlyValueCents: cs.reduce((a, c) => a + (c.monthlyValueCents ?? 0), 0), dids: { total: ds.length, assigned, free: ds.length - assigned } };
    },
    async options() { await wait(50); return S.circuits.filter((c) => !c.deletedAt).map((c) => ({ id: c.id, name: c.name, code: c.code, carrierName: S.carriers.find((x) => x.id === c.carrierId)?.name ?? null })); },
    async owners(includeThirdParty) {
      await wait(50);
      // só quem é titular de algum circuito da lista
      const ids = new Set(S.circuits.filter((c) => !c.deletedAt && c.ownerClientId && (includeThirdParty || !c.thirdParty)).map((c) => c.ownerClientId!));
      return S.clients.filter((c) => ids.has(c.id)).sort((a, b) => Number(b.isInternal) - Number(a.isInternal) || a.tradeName.localeCompare(b.tradeName)).map((c) => ({ id: c.id, name: c.tradeName, isInternal: c.isInternal, internalCode: c.internalCode }));
    },
    async get(idc) { await wait(); requirePerm('records.read'); const c = S.circuits.find((x) => x.id === idc && !x.deletedAt); if (!c) throw notFound('Circuito'); return shapeCircuit(c); },
    async create(d) { await wait(); requirePerm('records.write'); if (S.circuits.some((c) => !c.deletedAt && c.code === d.code && (c.carrierId ?? null) === ((d.carrierId as string) ?? null))) throw bad('Já existe um circuito com este código nesta operadora'); const tipo = d.authType === 'login' ? 'login' : 'ip'; const c: CircuitRow = { id: id(), name: String(d.name), code: String(d.code), keyNumber: (d.keyNumber as string) ?? null, carrierId: (d.carrierId as string) ?? null, channels: Number(d.channels ?? 0), ownerClientId: (d.ownerClientId as string) ?? null, monthlyValueCents: (d.monthlyValueCents as number) ?? null, authType: tipo, signalingIp: (d.signalingIp as string) ?? null, authIp: tipo === 'login' ? null : (d.authIp as string) ?? null, authUsername: tipo === 'ip' ? null : (d.authUsername as string) ?? null, authPasswordSecretId: null, notes: (d.notes as string) ?? null, thirdParty: !!d.thirdParty, deletedAt: null }; if (d.authPassword) { const sid = id(); S.secrets.set(sid, { label: `Senha do tronco — ${c.name}`, value: String(d.authPassword) }); c.authPasswordSecretId = sid; } S.circuits.push(c); audit('create', 'circuit', `Criou o circuito ${c.name}`, c.id); return shapeCircuit(c); },
    async update(idc, d) { await wait(); requirePerm('records.write'); const c = S.circuits.find((x) => x.id === idc); if (!c) throw notFound('Circuito'); for (const k of ['name', 'code', 'keyNumber', 'carrierId', 'channels', 'ownerClientId', 'monthlyValueCents', 'authType', 'signalingIp', 'authIp', 'authUsername', 'notes', 'thirdParty'] as const) if (d[k] !== undefined) (c as any)[k] = d[k]; /* o que não é do tipo escolhido é limpo, como no servidor */ if (c.authType === 'ip') c.authUsername = null; else c.authIp = null; if (d.authPassword) { const sid = c.authPasswordSecretId ?? id(); S.secrets.set(sid, { label: `Senha do tronco — ${c.name}`, value: String(d.authPassword) }); c.authPasswordSecretId = sid; } audit('update', 'circuit', `Editou o circuito ${c.name}`, c.id); return shapeCircuit(c); },
    async remove(idc) { await wait(); requirePerm('records.delete'); const c = S.circuits.find((x) => x.id === idc); if (!c) throw notFound('Circuito'); const n = S.dids.filter((d) => d.circuitId === idc && !d.deletedAt).length; if (n) throw bad(`Este circuito ainda tem ${n} DIDs. Mova-os para outro circuito antes de excluir.`); c.deletedAt = now(); audit('delete', 'circuit', `Mandou o circuito ${c.name} para a lixeira`, c.id); return { ok: true }; },
    async createRange(idc, d) { return demoApi.dids.createRange({ ...d, circuitId: idc }); },
  },
  dids: {
    async list(q) {
      await wait(); requirePerm('records.read');
      const items = ordenar(filterDids(q).map(shapeDid), q, 'number', {
        number: (d) => d.number, carrier: (d) => d.carrierName, circuit: (d) => d.circuitName, client: (d) => d.clientName, owner: (d) => d.ownerName, note: (d) => d.note,
        inUse: (d) => (d.clientId ? (d.inUse ? 1 : 0) : null),
      });
      const p = paginate(items, q);
      return { ...p, free: items.filter((d) => d.free).length };
    },
    async ids(q) { await wait(50); return { ids: filterDids(q).slice(0, 5000).map((d) => d.id) }; },
    async createRange(d) { await wait(); requirePerm('dids.assign'); if (!d.circuitId) throw new ApiError(400, 'Dados inválidos', [{ field: 'circuitId', message: 'Escolha o circuito' }]); const nums = gerarFaixaDids(didLimpo(String(d.baseNumber)), Number(d.quantity)); const ex = nums.filter((n) => S.dids.some((x) => x.number === n)); if (ex.length) throw bad(`${ex.length} número(s) já existem: ${ex.slice(0, 5).map(didFormatado).join(', ')}`); nums.forEach((n) => S.dids.push({ id: id(), number: n, circuitId: d.circuitId as string, clientId: (d.clientId as string) ?? null, inUse: false, ownerClientId: (d.ownerClientId as string) ?? S.clients.find((c) => c.internalCode === 'voicenet')!.id, note: (d.note as string) ?? null, deletedAt: null })); audit('bulk_create', 'did', `Criou ${nums.length} DIDs (${nums[0]}–${nums[nums.length - 1]})`); return { created: nums.length, first: nums[0]!, last: nums[nums.length - 1]! }; },
    async update(idd, d) { await wait(); requirePerm('dids.assign'); const x = S.dids.find((r) => r.id === idd); if (!x) throw notFound('DID'); if (d.circuitId === null) throw bad('Todo DID pertence a um circuito'); if (d.inUse !== undefined && (d.clientId === null || (d.clientId === undefined && !x.clientId))) throw bad('Só um número com cliente pode ser marcado como em uso'); for (const k of ['circuitId', 'clientId', 'ownerClientId', 'inUse', 'note'] as const) if (d[k] !== undefined) (x as any)[k] = d[k]; /* a marca acompanha o cliente: liberou, cai; atribuiu, entra em uso */ /* alocar não é usar: trocou de cliente (ou liberou) sem dizer a marca, ela cai */ if (d.clientId !== undefined && d.inUse === undefined) x.inUse = false; if (d.clientId === null) x.inUse = false; audit('update', 'did', `Editou o DID ${x.number}`, x.id); return shapeDid(x); },
    async bulk(ids, set) { await wait(200); requirePerm('dids.assign'); if (!Object.keys(set).length) throw bad('Escolha pelo menos um campo para alterar'); if ('circuitId' in set && !set.circuitId) throw new ApiError(400, 'Dados inválidos', [{ field: 'circuitId', message: 'Escolha o circuito' }]); let n = 0; for (const x of S.dids) if (ids.includes(x.id) && !x.deletedAt) { /* marcar uso sem mexer no cliente só vale para quem tem cliente */ if ('inUse' in set && !('clientId' in set) && !x.clientId) continue; n++; for (const k of ['circuitId', 'clientId', 'inUse', 'note'] as const) if (k in set) (x as any)[k] = set[k]; if ('clientId' in set && !('inUse' in set)) x.inUse = false; if (set.clientId === null) x.inUse = false; } const parts: string[] = []; if (set.circuitId) parts.push(`circuito → ${S.circuits.find((c) => c.id === set.circuitId)?.name}`); if ('clientId' in set) parts.push(set.clientId ? `cliente → ${S.clients.find((c) => c.id === set.clientId)?.tradeName}` : 'liberados (sem cliente)'); if ('inUse' in set) parts.push(set.inUse ? 'marcados como em uso' : 'marcados como não usados'); if ('note' in set) parts.push(set.note ? `observação → "${set.note}"` : 'observação limpa'); audit('bulk_update', 'did', `Alterou ${n} DID(s): ${parts.join(', ')}`); return { affected: n }; },
    async bulkDelete(ids) { await wait(); requirePerm('records.delete'); let n = 0; for (const x of S.dids) if (ids.includes(x.id) && !x.deletedAt) { x.deletedAt = now(); n++; } audit('bulk_delete', 'did', `Mandou ${n} DID(s) para a lixeira`); return { affected: n }; },
  },
  inventory: {
    async summary(q = {}): Promise<InventorySummary> {
      await wait(60); requirePerm('records.read');
      const filtrado = !!(q.q || q.modelId || q.clientId || q.condition);
      // vendido não entra na conta: já não é nosso (mesma regra do servidor)
      const devs = filtrarAparelhos({ ...q, condition: undefined });
      return {
        inStock: devs.filter((d) => !d.clientId).length,
        withClients: devs.filter((d) => d.clientId).length,
        inactive: devs.filter((d) => d.condition === 'inativo').length,
        valueWithClientsCents: devs.filter((d) => d.clientId && ['locacao', 'comodato'].includes(d.currentModality ?? '')).reduce((a, d) => a + (valorDe(d) ?? 0), 0),
        filtrado,
      };
    },
    async models(q) { await wait(); requirePerm('records.read'); const t = String(q?.q ?? '').toLowerCase(); return S.models.filter((m) => !m.deletedAt && (!t || m.name.toLowerCase().includes(t) || m.code.includes(t)) && (!q?.categoryId || m.categoryId === q.categoryId)).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')).map(shapeModel); },
    async createModel(d) { await wait(); requirePerm('records.write'); if (S.models.some((m) => m.code === d.code)) throw bad('Já existe um modelo com este código'); const m: ModelRow = { id: id(), code: String(d.code), name: String(d.name), categoryId: (d.categoryId as string) ?? null, image: null, valueCents: (d.valueCents as number) ?? null, deletedAt: null }; S.models.push(m); audit('create', 'deviceModel', `Cadastrou o modelo ${m.name}${m.valueCents != null ? ` (${reais(m.valueCents)})` : ''}`, m.id); return shapeModel(m); },
    async updateModel(idm, d) {
      await wait(); requirePerm('records.write');
      const m = S.models.find((x) => x.id === idm); if (!m) throw notFound('Modelo');
      const antes = m.valueCents;
      for (const k of ['code', 'name', 'categoryId', 'valueCents'] as const) if (d[k] !== undefined) (m as any)[k] = d[k];
      let igualados = 0;
      if (d.aplicarValorATodos) for (const x of S.devices) if (x.modelId === idm && x.valueCents != null) { x.valueCents = null; igualados++; }
      audit('update', 'deviceModel', `Editou o modelo ${m.name}${antes !== m.valueCents ? `: valor ${reais(antes)} → ${reais(m.valueCents)}` : ''}${igualados ? ` (${igualados} aparelho(s) passaram a usar o valor do modelo)` : ''}`, m.id);
      return shapeModel(m);
    },
    async removeModel(idm) { await wait(); requirePerm('records.delete'); const m = S.models.find((x) => x.id === idm); if (!m) throw notFound('Modelo'); if (S.devices.some((d) => d.modelId === idm && !d.deletedAt)) throw bad('Este modelo ainda tem aparelhos cadastrados'); m.deletedAt = now(); audit('delete', 'deviceModel', `Mandou o modelo ${m.name} para a lixeira`, m.id); return { ok: true }; },
    async saveModelImage(idm, dataUrl) {
      await wait(200); requirePerm('records.write');
      const m = S.models.find((x) => x.id === idm); if (!m) throw notFound('Modelo');
      if (!/^data:image\//.test(dataUrl)) throw bad('Formato não suportado. Use PNG, JPG, WEBP ou SVG.');
      if (dataUrl.length > 700_000) throw bad('Imagem muito grande (máximo 512 KB).');
      m.image = dataUrl; audit('update', 'deviceModel', `Trocou a foto do modelo ${m.name}`, m.id);
      return { ok: true };
    },
    async removeModelImage(idm) { await wait(); requirePerm('records.write'); const m = S.models.find((x) => x.id === idm); if (!m?.image) throw notFound('Foto'); m.image = null; audit('update', 'deviceModel', `Removeu a foto do modelo ${m.name}`, m.id); return { ok: true }; },
    async devices(q) {
      await wait(); requirePerm('records.read');
      const items = filtrarAparelhos(q).map((d) => shapeDevice(d));
      return paginate(ordenar(items, q, 'modelName', {
        mac: (d) => d.mac ?? d.serialNumber, unit: (d) => d.unit, modelName: (d) => d.modelName, clientName: (d) => d.clientName, note: (d) => d.note,
        currentModality: (d) => d.currentModality, condition: (d) => d.condition, ip: (d) => d.ip, valueCents: (d) => d.valueCents,
      }), q);
    },
    async device(idd) { await wait(); requirePerm('records.read'); const d = S.devices.find((x) => x.id === idd); if (!d) throw notFound('Aparelho'); return shapeDevice(d, true); },
    async createDevice(d) {
      await wait(); requirePerm('records.write');
      const m = S.models.find((x) => x.id === d.modelId); if (!m) throw notFound('Modelo');
      const mac = d.mac ? macLimpo(String(d.mac)) : null;
      if (mac !== null && mac.length !== 12) throw new ApiError(400, 'Dados inválidos', [{ field: 'mac', message: 'MAC precisa ter 12 caracteres hexadecimais' }]);
      if (mac && S.devices.some((x) => x.mac === mac)) throw bad(`Já existe um aparelho com o MAC ${macFormatado(mac)}`);
      const serie = d.serialNumber ? serieLimpa(String(d.serialNumber)) : null;
      if (serie && S.devices.some((x) => x.modelId === m.id && !x.deletedAt && x.serialNumber === serie)) throw bad(`Já existe um aparelho deste modelo com o N/S ${serie}`);
      const row: DeviceRow = { id: id(), modelId: m.id, mac, macSecondary: null, serialNumber: serie, clientId: null, unit: null, currentModality: null, condition: String(d.condition ?? 'ativo'), valueCents: (d.valueCents as number) ?? null, ip: (d.ip as string) ?? null, location: null, note: (d.note as string) ?? null, deletedAt: null, createdAt: now() };
      S.devices.push(row); audit('create', 'device', `Cadastrou o aparelho ${identificacaoAparelho(row).texto} (${m.name})`, row.id); return shapeDevice(row, true);
    },
    async createDevices(d) {
      await wait(300); requirePerm('records.write');
      const m = S.models.find((x) => x.id === d.modelId && !x.deletedAt); if (!m) throw notFound('Modelo');
      const base = { modelId: m.id, condition: d.condition ?? 'ativo', note: d.note ?? null };
      const novo = (x: Partial<DeviceRow>): DeviceRow => ({ id: id(), mac: null, macSecondary: null, serialNumber: null, clientId: null, unit: null, currentModality: null, valueCents: null, ip: null, location: null, deletedAt: null, createdAt: now(), ...base, ...x });
      if (d.tipo === 'nenhum') {
        const n = Number(d.quantidade ?? 0); if (n < 1) throw bad('Informe quantos aparelhos cadastrar');
        for (let i = 0; i < n; i++) S.devices.push(novo({}));
        audit('bulk_create', 'device', `Cadastrou ${n} aparelho(s) ${m.name} sem identificação`, m.id);
        return { created: n, modelName: m.name, tipo: d.tipo };
      }
      const valores = d.valores ?? [];
      const problemas: string[] = []; const vistos = new Set<string>();
      for (const v of valores) {
        const limpo = d.tipo === 'mac' ? macLimpo(v) : serieLimpa(v);
        if (d.tipo === 'mac' && !macValido(limpo)) problemas.push(`${v}: MAC inválido (precisa ter 12 caracteres hexadecimais)`);
        else if (d.tipo === 'serie' && limpo.length < 2) problemas.push(`${v}: número de série inválido`);
        else if (vistos.has(limpo)) problemas.push(`${v}: repetido na lista`);
        else if (d.tipo === 'mac' ? S.devices.some((x) => x.mac === limpo) : S.devices.some((x) => x.modelId === m.id && !x.deletedAt && x.serialNumber === limpo)) problemas.push(`${d.tipo === 'mac' ? macFormatado(limpo) : limpo}: já está cadastrado`);
        vistos.add(limpo);
      }
      if (!vistos.size) throw bad(d.tipo === 'mac' ? 'Cole pelo menos um MAC' : 'Cole pelo menos um número de série');
      if (problemas.length) throw new ApiError(400, `Nada foi cadastrado: ${problemas.length} item(ns) com problema. Corrija e envie de novo.`, problemas.join('\n'));
      for (const v of vistos) S.devices.push(novo(d.tipo === 'mac' ? { mac: v } : { serialNumber: v }));
      audit('bulk_create', 'device', `Cadastrou ${vistos.size} aparelho(s) ${m.name} ${d.tipo === 'mac' ? 'por MAC' : 'por número de série'}`, m.id);
      return { created: vistos.size, modelName: m.name, tipo: d.tipo };
    },
    async updateDevice(idd, d) {
      await wait(); requirePerm('records.write');
      const x = S.devices.find((r) => r.id === idd); if (!x) throw notFound('Aparelho');
      if (d.mac !== undefined) {
        const mac = d.mac ? macLimpo(String(d.mac)) : null;
        if (mac && mac.length !== 12) throw new ApiError(400, 'Dados inválidos', [{ field: 'mac', message: 'MAC precisa ter 12 caracteres hexadecimais' }]);
        if (mac && S.devices.some((o) => o.id !== idd && o.mac === mac)) throw bad('Já existe um aparelho com este MAC');
        x.mac = mac;
      }
      if (d.serialNumber !== undefined) {
        const serie = d.serialNumber ? serieLimpa(String(d.serialNumber)) : null;
        if (serie && S.devices.some((o) => o.id !== idd && o.modelId === x.modelId && !o.deletedAt && o.serialNumber === serie)) throw bad(`Já existe um aparelho deste modelo com o N/S ${serie}`);
        x.serialNumber = serie;
      }
      for (const k of ['unit', 'condition', 'valueCents', 'ip', 'note'] as const) if (d[k] !== undefined) (x as any)[k] = d[k];
      audit('update', 'device', `Editou o aparelho ${identificacaoAparelho(x).texto}`, x.id); return shapeDevice(x, true);
    },
    async removeDevice(idd) { await wait(); requirePerm('records.delete'); const x = S.devices.find((r) => r.id === idd); if (!x) throw notFound('Aparelho'); x.deletedAt = now(); audit('delete', 'device', `Mandou o aparelho ${identificacaoAparelho(x).texto} para a lixeira`, x.id); return { ok: true }; },
    async units(clientId) { await wait(); const us = S.devices.filter((d) => !d.deletedAt && d.unit && (!clientId || d.clientId === clientId)).map((d) => d.unit!); return [...new Set(us)].sort((a, b) => a.localeCompare(b, 'pt-BR')); },
    async movements(q) {
      await wait(); requirePerm('records.read');
      // MAC ou N/S de um aparelho: as movimentações por onde ele passou (pedaço de MAC só a partir de 4 caracteres, como na busca de aparelhos)
      const t = String(q.q ?? '').trim(); const hex = t.replace(/[^0-9a-fA-F]/g, '').toUpperCase(); const serie = serieLimpa(t);
      const bate = (dv: DeviceRow) => (hex.length >= 4 && (dv.mac ?? '').includes(hex)) || (!!serie && (dv.serialNumber ?? '').includes(serie));
      const items = [...S.movements].filter((m) => (!q.modality || m.modality === q.modality) && (!q.clientId || m.fromClientId === q.clientId || m.toClientId === q.clientId)
        && (!q.modelId || m.items.some((i) => i.modelId === q.modelId))
        && (!t || m.items.some((i) => { const dv = S.devices.find((x) => x.id === i.deviceId); return !!dv && bate(dv); }))
        && (!q.from || m.createdAt >= String(q.from)) && (!q.to || m.createdAt <= String(q.to) + 'T23:59:59')).map(shapeMov);
      return paginate(ordenar(items, q, 'createdAt', {
        createdAt: (m) => m.createdAt, modality: (m) => m.modalityName, fromName: (m) => m.fromName, toName: (m) => m.toName, unit: (m) => m.unit, userName: (m) => m.userName,
      }, 'desc'), q);
    },
    async move(d) {
      await wait(250); requirePerm('devices.move');
      const modality = String(d.modality); const to = (d.toClientId as string | null) ?? null;
      if (modality === 'devolucao' && to) throw bad('Devolução vai sempre para o estoque (destino vazio)');
      if (modality !== 'devolucao' && !to) throw bad('Informe o cliente de destino');
      if (to && !hasEquip(to)) throw bad(`"${S.clients.find((c) => c.id === to)?.tradeName}" não assina o produto Equipamentos. Marque o produto na ficha do cliente antes de movimentar aparelhos.`);
      const items = d.items as Array<{ deviceId: string }>; if (!items?.length) throw bad('Adicione pelo menos um aparelho');
      let from: string | null | undefined; const out: MovRow['items'] = []; let qty = 0;
      // primeiro valida tudo, depois aplica (imita a transação do servidor)
      for (const it of items) {
        const dev = S.devices.find((x) => x.id === it.deviceId && !x.deletedAt); if (!dev) throw notFound('Aparelho');
        const nome = identificacaoAparelho(dev).texto;
        if (dev.currentModality === 'venda') throw bad(`O aparelho ${nome} já foi vendido`);
        if (modality === 'devolucao' && !dev.clientId) throw bad(`O aparelho ${nome} já está no estoque`);
      }
      // a unidade escolhida entra na lista do cliente; sem escolha, vai para a Matriz
      let unidade: string | null = null;
      if (to) {
        const lista = unidadesDe(to);
        const pedida = String(d.unit ?? '').trim();
        const achou = pedida ? lista.find((u) => u.name.toLowerCase() === pedida.toLowerCase()) : lista.find((u) => u.isMain);
        if (achou) unidade = achou.name;
        else { S.units.push({ id: id(), clientId: to, name: pedida, isMain: false, address: null, egressIp: null, note: null, createdAt: now(), deletedAt: null }); unidade = pedida; }
      }
      for (const it of items) {
        const dev = S.devices.find((x) => x.id === it.deviceId)!;
        if (from === undefined) from = dev.clientId;
        dev.clientId = to;
        dev.unit = unidade;
        dev.currentModality = to ? modality : null;
        dev.condition = (d.newCondition as string) ?? dev.condition;
        out.push({ modelId: dev.modelId, deviceId: dev.id }); qty++;
      }
      const mv: MovRow = { id: id(), modality, fromClientId: from ?? null, toClientId: to, unit: unidade, newCondition: (d.newCondition as string) ?? null, note: (d.note as string) ?? null, userId: S.me!.id, createdAt: now(), items: out };
      S.movements.push(mv); audit('movement', 'deviceMovement', `${(MODALIDADES as any)[modality]} de ${qty} aparelho(s)${to ? ` para ${S.clients.find((c) => c.id === to)?.tradeName}${unidade ? ` (unidade ${unidade})` : ''}` : ' para o estoque'}`, mv.id);
      return { id: mv.id, items: out.length, quantity: qty };
    },
  },
  /**
   * Ajustes na demonstração: as telas funcionam e guardam o que você digitar, mas nada é
   * enviado para lugar nenhum — o "testar" finge que deu certo. É prévia, não o sistema.
   */
  settings: {
    async backup() { await wait(); requirePerm('admin.manage'); return S.ajustesBackup; },
    async saveBackup(d) {
      await wait(200); requirePerm('admin.manage');
      S.ajustesBackup = { ...S.ajustesBackup, ativo: d.ativo, pasta: d.pasta, pastaId: d.pastaId, temChave: S.ajustesBackup.temChave || !!d.chaveJson };
      if (d.chaveJson) { try { S.ajustesBackup.contaDeServico = String(JSON.parse(d.chaveJson).client_email ?? ''); } catch { /* ignora */ } }
      audit('settings_backup', 'settings', `${S.me?.name} mexeu nos ajustes do backup`, 'backup');
      return S.ajustesBackup;
    },
    async testBackup() {
      await wait(700); requirePerm('admin.manage');
      const ok = S.ajustesBackup.temChave && !!S.ajustesBackup.pastaId;
      const mensagem = ok ? 'Na demonstração nada é enviado de verdade — no sistema instalado, aqui apareceria a pasta encontrada e o arquivo de teste.' : 'Falta a chave da conta de serviço ou o id da pasta.';
      S.ajustesBackup = { ...S.ajustesBackup, ultimoEnvioEm: now(), ultimoEnvioOk: ok, ultimoEnvioMsg: mensagem };
      return { ok, mensagem };
    },
    async alerts() { await wait(); requirePerm('admin.manage'); return S.ajustesAvisos; },
    async saveAlerts(d) {
      await wait(200); requirePerm('admin.manage');
      S.ajustesAvisos = { ...S.ajustesAvisos, ativo: d.ativo, url: d.url, metodo: d.metodo, cabecalhos: d.cabecalhos, corpo: d.corpo, temToken: S.ajustesAvisos.temToken || !!d.token };
      audit('settings_alerts', 'settings', `${S.me?.name} mexeu nos ajustes de aviso`, 'avisos');
      return S.ajustesAvisos;
    },
    async testAlerts() {
      await wait(700); requirePerm('admin.manage');
      const ok = !!S.ajustesAvisos.url;
      const mensagem = ok ? 'Na demonstração nada sai daqui — no sistema instalado, a mensagem chegaria no WhatsApp pelo LineChat.' : 'Informe o endereço (URL) da API de avisos.';
      S.ajustesAvisos = { ...S.ajustesAvisos, ultimoTesteEm: now(), ultimoTesteOk: ok, ultimoTesteMsg: mensagem };
      return { ok, mensagem };
    },
    async linechat() { await wait(); requirePerm('admin.manage'); return statusLineChatDemo(); },
    async saveLinechat(d) {
      await wait(200); requirePerm('admin.manage');
      S.ajustesLineChat = { ...S.ajustesLineChat, ativo: d.ativo, url: d.url, appUrl: d.appUrl, painelId: d.painelId, painelNome: d.painelNome, temToken: S.ajustesLineChat.temToken || !!d.token };
      audit('settings_linechat', 'settings', `${S.me?.name} ${d.ativo ? 'ligou' : 'desligou'} a leitura dos chamados do LineChat`, 'linechat');
      return statusLineChatDemo();
    },
    async testLinechat() {
      await wait(600); requirePerm('admin.manage');
      return { ok: true, mensagem: `Na demonstração nada sai daqui — no sistema instalado, o teste diria: Token aceito. Painel "Ingline - Suporte": 11 etapas, 10 etiquetas.` };
    },
    async paineisLinechat() {
      await wait(400); requirePerm('admin.manage');
      return [
        { id: 'painel-demo', title: 'Ingline - Suporte (demonstração)', key: 'IS', type: 'MANAGEMENT' },
        { id: 'painel-demo-2', title: 'Ingline - Ativações (demonstração)', key: 'IA', type: 'MANAGEMENT' },
      ];
    },
    async syncLinechat(completa) {
      await wait(completa ? 1500 : 500); requirePerm('admin.manage');
      const n = chamadosDemo().cards.length;
      const mensagem = completa ? `Leitura completa: ${n.toLocaleString('pt-BR')} cards lidos.` : 'Atualização: nada mudou desde a última leitura.';
      S.ajustesLineChat = { ...S.ajustesLineChat, ultimaEm: now(), ultimaOk: true, ultimaMsg: mensagem, ...(completa ? { ultimaCompletaEm: now() } : {}) };
      audit('settings_linechat_sync', 'settings', `${S.me?.name} sincronizou os chamados do LineChat agora`, 'linechat');
      return { ok: true, mensagem, tipo: completa ? 'completa' : 'recente', lidos: completa ? n : 0, novos: 0, movimentos: 0, removidos: 0 };
    },
  },
  chamados: {
    async opcoes() {
      await wait(80); requirePerm('support.read');
      const { cards, ctx, movimentos } = chamadosDemo();
      const a = S.ajustesLineChat;
      return {
        configurado: a.ativo && !!a.painelId, painelId: a.painelId, painelNome: a.painelNome, appUrl: a.appUrl,
        linkDoPainel: a.painelId ? `${a.appUrl}/panels/${a.painelId}` : null,
        sincronizadoEm: a.ultimaEm, ultimaOk: a.ultimaOk, ultimaMsg: a.ultimaMsg, historicoDesde: a.inicioEm,
        totalCards: cards.length, movimentosRegistrados: movimentos,
        etapas: ctx.etapas, campos: camposDeLista(ctx.campos).map((c) => ({ key: c.key, name: c.name, multiplo: c.type === 'MULTISELECT', options: c.options })),
        etiquetas: [...ctx.etiquetas].sort((x, y) => x.name.localeCompare(y.name, 'pt-BR')),
        responsaveis: [...new Set(cards.map((c) => c.responsavel).filter((x): x is string => !!x))].sort((x, y) => x.localeCompare(y, 'pt-BR')),
        vazio: VAZIO,
      };
    },
    async resumo(q) {
      await wait(90); requirePerm('support.read');
      const { cards, ctx } = chamadosDemo();
      return resumirChamados(cards, FiltrosChamadosSchema.parse(q), { ...ctx, agora: new Date() });
    },
    async lista(q) {
      await wait(90); requirePerm('support.read');
      const { cards, ctx } = chamadosDemo();
      return listarChamados(cards, ListaChamadosSchema.parse(q), { ...ctx, agora: new Date() }, linkDemo);
    },
  },
  data: {
    async preview(d) { await wait(300); requirePerm('data.import'); const lines = d.csv.split(/\r?\n/).filter((l) => l.trim()); if (lines.length < 2) throw bad('O arquivo não tem linhas de dados'); const header = lines[0]!.split(d.delimiter === '\t' ? '\t' : d.delimiter).map((h) => h.trim().toLowerCase()); const rows = lines.slice(1).map((l, i) => { const cells = l.split(d.delimiter === '\t' ? '\t' : d.delimiter); const row: Record<string, string> = {}; header.forEach((h, j) => (row[h] = (cells[j] ?? '').trim())); const errors: string[] = []; let key = ''; let action: 'create' | 'update' | 'error' = 'create'; if (d.entity === 'clients') { const cnpj = cnpjLimpo(row.cnpj ?? ''); key = row.nome_fantasia || row.trade_name || cnpj; if (!cnpjValido(cnpj)) errors.push(`CNPJ inválido: ${row.cnpj || '(vazio)'}`); const hosp = (row.hospedagem ?? row.hosting ?? '').trim(); if (hosp && !S.hostings.some((h) => h.name.toLowerCase().replace(/[\s-]+/g, '') === hosp.toLowerCase().replace(/[\s-]+/g, ''))) errors.push(`Hospedagem desconhecida: ${hosp} (cadastre em Administração → Catálogos)`); for (const [k, v] of Object.entries(row)) { if (!/^(ativacao|ativado_em|activation)_/.test(k) || !v) continue; if (!/^(\d{2}\/\d{2}\/\d{4}|\d{4}-\d{2}-\d{2})$/.test(v)) errors.push(`Data de ativação inválida em ${k} ("${v}") — use 31/12/2025 ou 2025-12-31`); } const existente = S.clients.find((c) => c.cnpj === cnpj); if (existente && existente.deletedAt) errors.push(`Este CNPJ já existe na lixeira ("${existente.tradeName}"). Restaure o cliente em Administração → Lixeira e importe de novo`); else if (existente) action = 'update'; else if (!key) errors.push('Nome fantasia vazio'); } else if (d.entity === 'dids') { const n = didLimpo(row.numero || row.number || ''); key = n; if (n.length < 10) errors.push(`Número inválido: ${row.numero || row.number || '(vazio)'}`); if (row.circuito && !S.circuits.some((c) => c.code === row.circuito || c.name.toLowerCase() === row.circuito!.toLowerCase())) errors.push(`Circuito desconhecido: ${row.circuito}`); if (S.dids.some((x) => x.number === n)) action = 'update'; } else { key = row.nome || row.name || row.codigo || ''; if (!(row.codigo || row.code)) errors.push('Código do circuito vazio'); if (S.circuits.some((c) => c.code === (row.codigo || row.code))) action = 'update'; } return { line: i + 2, action: errors.length ? 'error' as const : action, key, errors }; }); const summary = { create: rows.filter((r) => r.action === 'create').length, update: rows.filter((r) => r.action === 'update').length, error: rows.filter((r) => r.action === 'error').length, skip: 0, total: rows.length }; return { entity: d.entity, rows, summary }; },
    async apply(d) { await wait(500); requirePerm('data.import'); const p = await demoApi.data.preview(d); if (p.summary.error) throw bad(`Há ${p.summary.error} linha(s) com erro. Corrija o arquivo e envie de novo — nada foi gravado.`); audit('import', d.entity, `Importou ${d.entity}: ${p.summary.create} criado(s), ${p.summary.update} atualizado(s) (demonstração: não aplicado)`); return { created: p.summary.create, updated: p.summary.update }; },
    exportUrl: (entity) => `data:text/csv;charset=utf-8,` + encodeURIComponent(entity === 'dids' ? 'numero;circuito;cliente\n' + S.dids.filter((x) => !x.deletedAt).slice(0, 50).map((x) => `${x.number};${S.circuits.find((c) => c.id === x.circuitId)?.code ?? ''};${S.clients.find((c) => c.id === x.clientId)?.cnpj ?? 'livre'}`).join('\n') : entity === 'circuits' ? 'nome;codigo;operadora;canais\n' + S.circuits.map((c) => `${c.name};${c.code};${S.carriers.find((x) => x.id === c.carrierId)?.name ?? ''};${c.channels}`).join('\n') : 'cnpj;nome_fantasia;razao_social;produtos\n' + S.clients.filter((c) => !c.isInternal && !c.deletedAt).map((c) => `${c.cnpj};${c.tradeName};${c.legalName};${activeSubs(c.id).map((s) => s.productCode).join('|')}`).join('\n')),
    async exportWithSecrets(entity, password) { await wait(400); requirePerm('data.export_secrets'); if (password !== S.me!.password) throw new ApiError(403, 'Senha incorreta'); audit('export_secrets', entity, `${S.me!.name} exportou ${entity} COM SENHAS (ZIP protegido)`); return { blob: new Blob(['(demonstração: aqui viria o ZIP protegido)'], { type: 'text/plain' }), zipPassword: 'demo-' + Math.random().toString(36).slice(2, 10), filename: `${entity}-com-senhas.zip` }; },
  },
  novidades: {
    async pendente(): Promise<NovidadePendente | null> {
      await wait(60);
      if (!S.me) return null;
      // só a MAIS RECENTE publicada abre no login, e só enquanto não for marcada como lida
      const nota = notasVivas().filter((n) => n.publishedAt).sort((a, b) => b.publishedAt!.localeCompare(a.publishedAt!))[0];
      if (!nota || S.leituras.some((l) => l.noteId === nota.id && l.userId === S.me!.id)) return null;
      const { items, ...resto } = shapeNota(nota);
      return { id: resto.id, version: resto.version, title: resto.title, summary: resto.summary, publishedAt: resto.publishedAt, items };
    },
    async lista() {
      await wait(80); requirePerm('records.read');
      const podeEditar = podeEditarNovidades();
      const items = notasVivas().filter((n) => podeEditar || n.publishedAt)
        .sort((a, b) => (b.publishedAt ?? b.createdAt).localeCompare(a.publishedAt ?? a.createdAt)).map(shapeNota);
      return { items, podeEditar, naoLidas: items.filter((n) => n.publishedAt && !n.lida).length };
    },
    async marcarLida(idn) {
      await wait(120);
      const n = notasVivas().find((x) => x.id === idn); if (!n) throw notFound('Nota');
      if (!n.publishedAt) throw bad('Esta nota ainda é um rascunho');
      if (!S.leituras.some((l) => l.noteId === idn && l.userId === S.me!.id)) S.leituras.push({ noteId: idn, userId: S.me!.id, readAt: now() });
      audit('update', 'releaseNote', `${S.me!.name} leu as novidades de ${n.version}`, n.id);
      return { ok: true };
    },
    async leituras(idn): Promise<LeiturasNovidade> {
      await wait(60); requirePerm('admin.manage');
      const n = notasVivas().find((x) => x.id === idn); if (!n) throw notFound('Nota');
      return {
        version: n.version, title: n.title, publishedAt: n.publishedAt,
        pessoas: S.users.filter((u) => u.active).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
          .map((u) => ({ id: u.id, name: u.name, email: u.email, readAt: S.leituras.find((l) => l.noteId === idn && l.userId === u.id)?.readAt ?? null })),
      };
    },
    async criar(d) {
      await wait(); requirePerm('admin.manage');
      const version = String(d.version ?? '').trim();
      if (!/^[a-z0-9._-]+$/.test(version)) throw new ApiError(400, 'Dados inválidos', [{ field: 'version', message: 'Use só letras minúsculas, números, ponto, hífen e _' }]);
      if (S.notas.some((n) => n.version === version)) throw bad(`Já existe uma nota com a versão "${version}"`);
      const n: NotaRow = { id: id(), version, title: String(d.title), summary: (d.summary as string) ?? null, publishedAt: null, createdAt: now(), updatedAt: now(), deletedAt: null, items: [] };
      aplicarItens(n, d.items as any[]);
      S.notas.push(n); audit('create', 'releaseNote', `Criou a nota de novidades ${version}`, n.id);
      return { id: n.id };
    },
    async atualizar(idn, d) {
      await wait(); requirePerm('admin.manage');
      const n = notasVivas().find((x) => x.id === idn); if (!n) throw notFound('Nota');
      if (d.version !== undefined) {
        const version = String(d.version).trim();
        if (S.notas.some((x) => x.id !== idn && x.version === version)) throw bad(`Já existe uma nota com a versão "${version}"`);
        n.version = version;
      }
      if (d.title !== undefined) n.title = String(d.title);
      if (d.summary !== undefined) n.summary = (d.summary as string) ?? null;
      if (d.items !== undefined) aplicarItens(n, d.items as any[]);
      n.updatedAt = now(); audit('update', 'releaseNote', `Editou a nota de novidades ${n.version}`, n.id);
      return { id: n.id };
    },
    async publicar(idn, publicar) {
      await wait(); requirePerm('admin.manage');
      const n = notasVivas().find((x) => x.id === idn); if (!n) throw notFound('Nota');
      if (publicar && !n.items.length) throw bad('A nota não tem nenhum item para mostrar. Acrescente ao menos um antes de publicar.');
      n.publishedAt = publicar ? n.publishedAt ?? now() : null;
      audit('update', 'releaseNote', publicar ? `Publicou as novidades de ${n.version} para toda a equipe` : `Voltou as novidades de ${n.version} para rascunho`, n.id);
      return { id: n.id, publishedAt: n.publishedAt };
    },
    async remover(idn) {
      await wait(); requirePerm('admin.manage');
      const n = notasVivas().find((x) => x.id === idn); if (!n) throw notFound('Nota');
      n.deletedAt = now(); audit('delete', 'releaseNote', `Mandou a nota de novidades ${n.version} para a lixeira`, n.id);
      return { ok: true };
    },
  },
  projetos: {
    async lista(q) {
      await wait(80); requirePerm('records.read');
      const status = (q?.status as string) ?? 'aberto';
      const termo = (q?.q as string)?.trim().toLowerCase() ?? '';
      const items = projetosVivos()
        .filter((p) => status === 'todos' || p.status === status)
        .filter((p) => !termo || p.name.toLowerCase().includes(termo) || (p.goal ?? '').toLowerCase().includes(termo))
        .sort((a, b) => (b.closedAt ?? b.updatedAt).localeCompare(a.closedAt ?? a.updatedAt))
        .map(resumoProjeto);
      return { items, podeTrabalhar: temPerm('projects.work'), podeGerenciar: temPerm('projects.manage') };
    },
    async pessoas() { await wait(40); requirePerm('records.read'); return S.users.filter((u) => u.active).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')).map((u) => ({ id: u.id, name: u.name })); },
    async get(idp) { await wait(90); requirePerm('records.read'); return projetoCompleto(projetoOu404(idp)); },
    async criar(d) {
      await wait(); requirePerm('projects.manage');
      const p: ProjRow = {
        id: id(), name: String(d.name).trim(), goal: (d.goal as string) ?? null, status: 'aberto',
        dueDate: (d.dueDate as string) || null, ownerId: (d.ownerId as string) || null, closedAt: null,
        createdAt: now(), updatedAt: now(), deletedAt: null,
      };
      S.projetos.push(p);
      gravarEtapas(p.id, (d.etapas as EtapaProjeto[]) ?? []);
      entrarNaLista(p.id, (d.clientIds as string[]) ?? []);
      audit('create', 'project', `Criou o projeto "${p.name}" com ${S.projClientes.filter((x) => x.projectId === p.id).length} cliente(s)`, p.id);
      return projetoCompleto(p);
    },
    async atualizar(idp, d) {
      await wait(); requirePerm('projects.manage');
      const p = projetoOu404(idp);
      if (d.name !== undefined) p.name = String(d.name).trim();
      if (d.goal !== undefined) p.goal = (d.goal as string) ?? null;
      if (d.dueDate !== undefined) p.dueDate = (d.dueDate as string) || null;
      if (d.ownerId !== undefined) p.ownerId = (d.ownerId as string) || null;
      if (d.status !== undefined) { p.status = d.status as ProjRow['status']; p.closedAt = p.status === 'aberto' ? null : now(); }
      if (d.etapas !== undefined) {
        gravarEtapas(p.id, d.etapas as EtapaProjeto[]);
        for (const l of S.projClientes.filter((x) => x.projectId === p.id)) recalcular(l);
      }
      if (d.clientIds !== undefined) entrarNaLista(p.id, d.clientIds as string[]);
      p.updatedAt = now();
      audit('update', 'project', `Editou o projeto "${p.name}"`, p.id);
      return projetoCompleto(p);
    },
    async duplicar(idp, name) {
      await wait(); requirePerm('projects.manage');
      const antigo = projetoOu404(idp);
      const novo: ProjRow = { ...antigo, id: id(), name: name?.trim() || `${antigo.name} (cópia)`, dueDate: null, status: 'aberto', closedAt: null, createdAt: now(), updatedAt: now(), deletedAt: null };
      S.projetos.push(novo);
      for (const e of S.etapas.filter((x) => x.projectId === antigo.id)) S.etapas.push({ ...e, id: id(), projectId: novo.id, options: (e.options ?? []).map((o) => ({ ...o })) });
      // os clientes voltam pendentes, com o mesmo responsável — o trabalho é que recomeça
      for (const l of S.projClientes.filter((x) => x.projectId === antigo.id)) S.projClientes.push({ id: id(), projectId: novo.id, clientId: l.clientId, assigneeId: l.assigneeId, status: 'pendente', blockedReason: null, doneAt: null });
      audit('create', 'project', `Duplicou um projeto em "${novo.name}"`, novo.id);
      return projetoCompleto(novo);
    },
    async remover(idp) { await wait(); requirePerm('projects.manage'); const p = projetoOu404(idp); p.deletedAt = now(); audit('delete', 'project', `Mandou o projeto "${p.name}" para a lixeira`, p.id); return { ok: true }; },
    async addClientes(idp, clientIds, assigneeId) {
      await wait(); requirePerm('projects.manage');
      const p = projetoOu404(idp);
      const n = entrarNaLista(p.id, clientIds, assigneeId ?? null);
      audit('update', 'project', `Acrescentou ${n} cliente(s) ao projeto "${p.name}"`, p.id);
      return projetoCompleto(p);
    },
    async removerCliente(idp, linhaId) {
      await wait(); requirePerm('projects.manage');
      const p = projetoOu404(idp);
      const l = linhaOu404(p.id, linhaId);
      const nome = S.clients.find((c) => c.id === l.clientId)?.tradeName ?? 'cliente';
      S.projClientes = S.projClientes.filter((x) => x.id !== linhaId);
      S.marcas = S.marcas.filter((m) => m.projectClientId !== linhaId);
      S.projComentarios = S.projComentarios.filter((c) => c.projectClientId !== linhaId);
      S.projAnexos = S.projAnexos.filter((a) => a.projectClientId !== linhaId);
      audit('delete', 'project', `Tirou ${nome} do projeto`, p.id);
      return { ok: true };
    },
    async linha(idp, linhaId, d) {
      await wait(70); requirePerm('projects.work');
      const p = projetoOu404(idp);
      const l = linhaOu404(p.id, linhaId);
      const nome = S.clients.find((c) => c.id === l.clientId)?.tradeName ?? 'cliente';
      if (d.assigneeId !== undefined) l.assigneeId = (d.assigneeId as string) || null;
      if (d.status !== undefined) {
        const status = d.status as SituacaoProjeto;
        if (status === 'travado' && !String(d.blockedReason ?? '').trim()) throw bad('Diga por que está travado');
        l.status = status;
        l.blockedReason = status === 'travado' ? String(d.blockedReason).trim() : null;
        l.doneAt = status === 'concluido' || status === 'nao_se_aplica' ? now() : null;
        if (status === 'concluido') {
          // "concluído" à mão = tudo feito: completa as etapas que faltavam
          // (na lista, escolhendo a primeira opção que resolve a etapa)
          for (const e of S.etapas.filter((x) => x.projectId === p.id)) {
            const marca = S.marcas.find((m) => m.projectClientId === l.id && m.stepId === e.id);
            if (resolvida(e, marca)) continue;
            const value = e.kind === 'escolha' ? ((e.options ?? []).find((o) => o.conclui)?.id ?? null) : null;
            if (e.kind === 'escolha' && !value) continue;
            if (marca) { marca.value = value; marca.doneById = S.me!.id; marca.doneAt = now(); }
            else S.marcas.push({ projectClientId: l.id, stepId: e.id, value, doneById: S.me!.id, doneAt: now() });
          }
        }
        if (status !== 'travado' && status !== 'nao_se_aplica') recalcular(l);
      }
      p.updatedAt = now();
      audit('update', 'project', `${nome}: ${d.status ? `situação → ${l.status}` : 'trocou o responsável'}`, p.id);
      return l;
    },
    async marcar(idp, linhaId, stepId, d) {
      await wait(60); requirePerm('projects.work');
      const p = projetoOu404(idp);
      const l = linhaOu404(p.id, linhaId);
      const etapa = S.etapas.find((e) => e.id === stepId && e.projectId === p.id);
      if (!etapa) throw bad('Etapa não encontrada neste projeto');
      if (l.status === 'nao_se_aplica') throw bad('Este cliente está marcado como "não se aplica". Tire essa marca para trabalhar nele.');

      const escolha = etapa.kind === 'escolha';
      if (escolha && d.valor === undefined) throw bad(`"${etapa.title}" é uma lista de opções: escolha uma.`);
      if (!escolha && d.feito === undefined) throw bad(`"${etapa.title}" é uma caixinha: diga se está feito.`);
      const limpar = escolha ? d.valor === null : d.feito === false;

      if (limpar) {
        S.marcas = S.marcas.filter((m) => !(m.projectClientId === linhaId && m.stepId === stepId));
      } else {
        let value: string | null = null;
        if (escolha) {
          const opcao = (etapa.options ?? []).find((o) => o.id === d.valor);
          if (!opcao) throw bad('Essa opção não existe nesta etapa');
          value = opcao.id;
        }
        const atual = S.marcas.find((m) => m.projectClientId === linhaId && m.stepId === stepId);
        if (atual) { atual.value = value; atual.doneById = S.me!.id; atual.doneAt = now(); }
        else S.marcas.push({ projectClientId: linhaId, stepId, value, doneById: S.me!.id, doneAt: now() });
      }
      recalcular(l);
      p.updatedAt = now();
      const nome = S.clients.find((c) => c.id === l.clientId)?.tradeName ?? 'cliente';
      const rotulo = escolha ? (etapa.options ?? []).find((o) => o.id === d.valor)?.label ?? 'nada' : null;
      audit('update', 'project', rotulo !== null ? `${nome}: "${etapa.title}" → ${rotulo}` : `${d.feito ? 'Marcou' : 'Desmarcou'} "${etapa.title}" de ${nome}`, p.id);
      return l;
    },
    async comentar(idp, body, projectClientId) {
      await wait(90); requirePerm('projects.work');
      const p = projetoOu404(idp);
      if (projectClientId) linhaOu404(p.id, projectClientId);
      const c: PCommentRow = { id: id(), projectId: p.id, projectClientId: projectClientId ?? null, userId: S.me!.id, body: body.trim(), createdAt: now(), deletedAt: null };
      S.projComentarios.push(c);
      audit('create', 'project', 'Comentou no projeto', p.id);
      return c;
    },
    async apagarComentario(idp, commentId) {
      await wait(60); requirePerm('projects.work');
      const p = projetoOu404(idp);
      const c = S.projComentarios.find((x) => x.id === commentId && x.projectId === p.id && !x.deletedAt);
      if (!c) throw notFound('Comentário');
      if (c.userId !== S.me!.id && !temPerm('projects.manage')) throw bad('Só quem escreveu (ou quem gerencia o projeto) pode apagar este comentário');
      c.deletedAt = now();
      audit('delete', 'project', 'Apagou um comentário do projeto', p.id);
      return { ok: true };
    },
    async anexar(idp, d): Promise<AnexoProjeto> {
      await wait(250); requirePerm('projects.work');
      const p = projetoOu404(idp);
      if (d.projectClientId) linhaOu404(p.id, d.projectClientId);
      const m = /^data:([^;]+);base64,(.*)$/s.exec(d.conteudo);
      if (!m) throw bad('Não consegui ler esse arquivo');
      const sizeBytes = Math.floor((m[2]!.length * 3) / 4);
      if (sizeBytes > 10 * 1024 * 1024) throw bad('Arquivo muito grande (máximo 10 MB)');
      const a: PFileRow = {
        id: id(), projectId: p.id, projectClientId: d.projectClientId ?? null, fileName: d.fileName,
        mimeType: m[1]!.toLowerCase(), sizeBytes, conteudo: d.conteudo, uploadedById: S.me!.id, createdAt: now(), deletedAt: null,
      };
      S.projAnexos.push(a);
      audit('create', 'project', `Anexou "${a.fileName}" ao projeto`, p.id);
      return { id: a.id, projectClientId: a.projectClientId, fileName: a.fileName, mimeType: a.mimeType, sizeBytes: a.sizeBytes, createdAt: a.createdAt, quem: S.me!.name };
    },
    async apagarAnexo(idp, anexoId) {
      await wait(60); requirePerm('projects.work');
      const p = projetoOu404(idp);
      const a = S.projAnexos.find((x) => x.id === anexoId && x.projectId === p.id && !x.deletedAt);
      if (!a) throw notFound('Anexo');
      if (a.uploadedById !== S.me!.id && !temPerm('projects.manage')) throw bad('Só quem anexou (ou quem gerencia o projeto) pode tirar este anexo');
      a.deletedAt = now();
      audit('delete', 'project', `Tirou o anexo "${a.fileName}"`, p.id);
      return { ok: true };
    },
    anexoUrl: (anexoId) => S.projAnexos.find((a) => a.id === anexoId)?.conteudo || 'data:text/plain;base64,',
  },
  admin: {
    async users() { await wait(); requirePerm('admin.manage'); return S.users.map((u) => ({ id: u.id, name: u.name, email: u.email, active: u.active, roleId: u.roleId, roleName: S.roles.find((r) => r.id === u.roleId)?.name ?? '?', lastLoginAt: u.lastLoginAt })); },
    async createUser(d) { await wait(); requirePerm('admin.manage'); if (S.users.some((u) => u.email === String(d.email).toLowerCase())) throw bad('Já existe um usuário com este e-mail'); const u: UserRow = { id: id(), name: String(d.name), email: String(d.email).toLowerCase(), password: String(d.password), roleId: String(d.roleId), active: d.active !== false, lastLoginAt: null }; S.users.push(u); audit('create', 'user', `Criou o usuário ${u.name} (${u.email})`, u.id); return (await demoApi.admin.users()).find((x) => x.id === u.id)!; },
    async updateUser(idu, d) { await wait(); requirePerm('admin.manage'); const u = S.users.find((x) => x.id === idu); if (!u) throw notFound('Usuário'); if ((d.active === false || (d.roleId && d.roleId !== u.roleId)) && u.roleId === 'radministrador' && !S.users.some((o) => o.id !== idu && o.roleId === 'radministrador' && o.active)) throw bad('Este é o único administrador ativo. Crie outro antes de rebaixar ou desativar.'); for (const k of ['name', 'email', 'roleId', 'active'] as const) if (d[k] !== undefined) (u as any)[k] = d[k]; if (d.password) u.password = String(d.password); audit('update', 'user', `Editou o usuário ${u.name}`, u.id); return (await demoApi.admin.users()).find((x) => x.id === u.id)!; },
    async roles() { await wait(); requirePerm('admin.manage'); return S.roles.map((r) => ({ ...r, userCount: S.users.filter((u) => u.roleId === r.id).length })); },
    async permissions() { await wait(30); return ALL_PERMISSIONS.map((key) => ({ key, label: PERMISSIONS[key] })); },
    async createRole(d) { await wait(); requirePerm('admin.manage'); const r: RoleRow = { id: id(), key: null, name: String(d.name), description: (d.description as string) ?? null, permissions: (d.permissions as string[]) ?? [], isSystem: false }; S.roles.push(r); audit('create', 'role', `Criou o papel ${r.name}`, r.id); return { ...r, userCount: 0 }; },
    async updateRole(idr, d) { await wait(); requirePerm('admin.manage'); const r = S.roles.find((x) => x.id === idr); if (!r) throw notFound('Papel'); if (r.key === 'administrador' && d.permissions && (d.permissions as string[]).length !== ALL_PERMISSIONS.length) throw bad('O papel Administrador sempre tem todas as permissões'); if (d.name && !r.isSystem) r.name = String(d.name); if (d.description !== undefined) r.description = d.description as string; if (d.permissions) r.permissions = d.permissions as string[]; audit('update', 'role', `Editou o papel ${r.name}`, r.id); return { ...r, userCount: S.users.filter((u) => u.roleId === r.id).length }; },
    async removeRole(idr) { await wait(); requirePerm('admin.manage'); const r = S.roles.find((x) => x.id === idr); if (!r) throw notFound('Papel'); if (r.isSystem) throw bad('Papéis do sistema não podem ser apagados'); if (S.users.some((u) => u.roleId === idr)) throw bad('Há usuários com este papel. Mude o papel deles antes.'); S.roles = S.roles.filter((x) => x.id !== idr); return { ok: true }; },
    async catalog(type) { await wait(40); return (type === 'carriers' ? S.carriers : type === 'hostings' ? S.hostings : S.categories).slice().sort((a, b) => a.name.localeCompare(b.name)); },
    async createCatalogItem(type, name) { await wait(); requirePerm('admin.manage'); const list = type === 'carriers' ? S.carriers : type === 'hostings' ? S.hostings : S.categories; if (list.some((x) => x.name.toLowerCase() === name.toLowerCase())) throw bad('Já existe um item com esse nome'); const it = { id: id(), name, active: true }; list.push(it); audit('create', `catalog:${type}`, `Adicionou "${name}" ao catálogo ${type}`, it.id); return it; },
    async updateCatalogItem(type, idi, d) { await wait(); requirePerm('admin.manage'); const list = type === 'carriers' ? S.carriers : type === 'hostings' ? S.hostings : S.categories; const it = list.find((x) => x.id === idi); if (!it) throw notFound('Item'); if (d.name !== undefined) { const nome = String(d.name).trim(); if (list.some((x) => x.id !== idi && x.name.toLowerCase() === nome.toLowerCase())) throw bad(`Já existe "${nome}" neste catálogo`); it.name = nome; } if (d.active !== undefined) it.active = Boolean(d.active); audit('update', `catalog:${type}`, `Alterou "${it.name}" no catálogo ${type}`, it.id); return it; },
    async products() { await wait(40); return S.products.filter((p) => !p.deletedAt).sort((a, b) => a.sortOrder - b.sortOrder).map(shapeProduct); },
    async createProduct(d) {
      await wait(); requirePerm('admin.manage');
      const code = String(d.code ?? '').trim();
      if (!/^[a-z0-9_]+$/.test(code)) throw new ApiError(400, 'Dados inválidos', [{ field: 'code', message: 'Use só letras minúsculas, números e _' }]);
      const dup = S.products.find((p) => p.code === code);
      if (dup) throw bad(dup.deletedAt ? `O código "${code}" é do produto ${dup.name}, que está na lixeira. Restaure-o em Lixeira ou use outro código.` : `Já existe um produto com o código "${code}"`);
      const p = { id: 'p' + code, code, name: String(d.name), color: d.color || '#2457D6', description: d.description ?? null, hasSettings: false, sortOrder: Math.max(0, ...S.products.map((x) => x.sortOrder)) + 1, active: true, deletedAt: null as string | null };
      S.products.push(p); audit('create', 'product', `Criou o produto ${p.name}`, p.id);
      return shapeProduct(p);
    },
    async removeProduct(idp) {
      await wait(); requirePerm('admin.manage');
      const p = S.products.find((x) => x.id === idp && !x.deletedAt); if (!p) throw notFound('Produto');
      if (PROTEGIDOS.includes(p.code)) throw bad(`O ${p.name} não pode ser excluído: o sistema depende dele. Se não quiser vê-lo, desligue o "ativo".`);
      const n = shapeProduct(p).activeClients;
      p.deletedAt = now(); audit('delete', 'product', `Mandou o produto ${p.name} para a lixeira (${n} cliente(s) assinavam)`, p.id);
      return { ok: true };
    },
    async updateProduct(idp, d) { await wait(); requirePerm('admin.manage'); const p = S.products.find((x) => x.id === idp); if (!p) throw notFound('Produto'); for (const k of ['name', 'color', 'description', 'active', 'sortOrder'] as const) if (d[k] !== undefined) (p as any)[k] = d[k]; return shapeProduct(p); },
    async upsertModule(idp, d) { await wait(); requirePerm('admin.manage'); const p = S.products.find((x) => x.id === idp); if (!p) throw notFound('Produto'); const code = String(d.code); if (!/^[a-z0-9_]+$/.test(code)) throw new ApiError(400, 'Dados inválidos', [{ field: 'code', message: 'Use só letras minúsculas, números e _' }]); let m = S.modules.find((x) => x.productId === p.id && x.code === code); if (!m) { m = { id: id(), productId: p.id, code, name: String(d.name), description: (d.description as string) ?? null, hasSettings: false, sortOrder: 99, active: true }; S.modules.push(m); audit('create', 'product_module', `Criou o módulo ${m.name} em ${p.name}`, m.id); } else { for (const k of ['name', 'description', 'active', 'sortOrder'] as const) if (d[k] !== undefined) (m as any)[k] = d[k]; audit('update', 'product_module', `Editou o módulo ${m.name} em ${p.name}`, m.id); } const { productId: _p, ...out } = m; return out; },
    async audit(q) {
      await wait(); requirePerm('audit.read');
      const items = S.audit.filter((a) => (!q.action || a.action === q.action) && (!q.entityType || a.entityType === q.entityType) && (!q.userId || a.userId === q.userId));
      return paginate(ordenar(items, q, 'createdAt', {
        createdAt: (a) => a.createdAt, action: (a) => a.action, entityType: (a) => a.entityType, summary: (a) => a.summary, userName: (a) => a.userName,
      }, 'desc'), q);
    },
    async trash() {
      await wait(); requirePerm('records.delete');
      return [
        ...S.clients.filter((c) => c.deletedAt).map((c) => ({ type: 'client', id: c.id, label: c.tradeName, deletedAt: c.deletedAt! })),
        ...S.circuits.filter((c) => c.deletedAt).map((c) => ({ type: 'circuit', id: c.id, label: c.name, deletedAt: c.deletedAt! })),
        ...S.dids.filter((c) => c.deletedAt).map((c) => ({ type: 'did', id: c.id, label: didFormatado(c.number), deletedAt: c.deletedAt! })),
        ...S.devices.filter((c) => c.deletedAt).map((c) => ({ type: 'device', id: c.id, label: `${modeloDe(c).name} · ${identificacaoAparelho(c).texto}`, deletedAt: c.deletedAt! })),
        ...S.models.filter((c) => c.deletedAt).map((c) => ({ type: 'deviceModel', id: c.id, label: c.name, deletedAt: c.deletedAt! })),
        ...S.products.filter((c) => c.deletedAt).map((c) => ({ type: 'product', id: c.id, label: c.name, deletedAt: c.deletedAt! })),
        ...S.notas.filter((c) => c.deletedAt).map((c) => ({ type: 'releaseNote', id: c.id, label: c.title, deletedAt: c.deletedAt! })),
      ].sort((a, b) => b.deletedAt.localeCompare(a.deletedAt));
    },
    async restore(type, idr) {
      await wait(); requirePerm('records.delete');
      const list: any[] = type === 'client' ? S.clients : type === 'circuit' ? S.circuits : type === 'did' ? S.dids : type === 'deviceModel' ? S.models : type === 'product' ? S.products : type === 'releaseNote' ? S.notas : S.devices;
      const it = list.find((x) => x.id === idr); if (!it) throw notFound();
      it.deletedAt = null;
      const nome = it.tradeName ?? it.name ?? it.number ?? (type === 'device' ? identificacaoAparelho(it).texto : idr);
      audit('restore', type, `Restaurou ${nome} da lixeira`, idr); return { ok: true };
    },
  },
};
