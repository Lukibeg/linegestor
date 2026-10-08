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
import { ALL_PERMISSIONS, DEFAULT_ROLES, FiltrosChamadosSchema, ListaChamadosSchema, MODULOS_INICIAIS, PainelChamadosSchema, type ItemPainel, PERMISSIONS, PRODUTOS_INICIAIS, VAZIO, VERSAO_PAINEL, camposDeLista, comFechamento, diaEmBrasilia, etapasDaEquipe, listarChamados, painelPadrao, primeiroDiaDe, resumirChamados, type Chamado, type ContextoChamados, cnpjLimpo, cnpjValido, diaAoMeioDia, paraBusca, temDataDeAtivacao, didFormatado, didLimpo, gerarFaixaDids, identificacaoAparelho, macFormatado, macLimpo, macValido, MODALIDADES, reais, serieLimpa } from '@gestor/shared';
import {
  AjustesEnvioSchema, MarcadosEnvioSchema, momentoEmBrasilia, numeroLegivel, proximoEnvio, montarPainel,
  agendadoDeHoje, envioDeHoje, horaDeEnviar, type UltimoEnvioAgendado,
  AjustesRelatoriosSchema, ArrumacaoRelatoriosSchema, CATALOGO_RELATORIOS, montarArrumacao, ajustesParaTela, camposDosRelatorios, chamadosDaPeca, ChamadosDaPecaSchema, conferirAjustes, FiltrosRelatoriosSchema, opcoesLigadasAo,
  raioXChamados, relatoriosChamados, type AjustesRelatorios, type ContextoRelatorios, type MovimentoChamado,
} from '@gestor/shared';
import {
  ArtigoGravarSchema, BaseListarSchema, ComentarioArtigoSchema, artigosDoChamado, buscarArtigos, codigoDoArtigo, faltaParaPublicar,
  ligarClientes, montarIndiceParaChamados, nomeComparavel, printsDoTexto, textoDoCard, textoPuro, trocarMarcadores,
  type ArtigoCurto, type ArtigoGravar, type LigacaoArtigo, type PedacoTrecho, type TipoLigacao,
} from '@gestor/shared';
import {
  AjustesIaSchema, custoEstimado, enderecoValido, hostDoEndereco, INFO_PROVEDORES, juntarAchados, ModelosIaSchema, normalizarEndereco, PerguntarSchema,
  RascunhoIaSchema, type ProvedorIa,
} from '@gestor/shared';
import {
  AcessoCriarSchema, AJUSTES_PORTAL_PADRAO, arquivosDoTexto, caminhoDoTutorial, clienteNaBase, DIAS_DO_CONVITE, faltaParaPublicarTutorial, motivoForaDaBase,
  numeroDoCaminho, PortalAjustesSchema, PortalCriarSenhaSchema, PortalEntrarSchema, PortalTrocarSenhaSchema, problemaDoArquivo, situacaoDoAcesso,
  TIPOS_IMAGEM_PORTAL, TutoriaisListarSchema, TutorialGravarSchema, tutorialValePara, type PortalAjustes, type TipoArquivoPortal, type TutorialGravar,
} from '@gestor/shared';
import type { Api } from './index.js';
import { NOTA_DEMO } from './novidades-demo.js';
import { PDF_MANUAL_RAMAL, VIDEO_TRANSFERIR } from './portal-demo-midia.js';
import { ApiError, type AjustesIa, type ModeloIa, type RespostaIa, type AcessoPortal, type ArquivoDoPortal, type CartaoTutorial, type EuPortal, type TutorialNaLista, type Artigo, type ArtigoNaLista, type LigacaoMostrada, type TextoVersao, type AjustesLineChat, type AuditItem, type LeiturasNovidade, type Novidade, type NovidadeItem, type NovidadePendente, type RegistroEnvio, type Projeto, type ProjetoResumo, type OpcaoEtapa, type EtapaProjeto, type ProjetoDoCliente, type SituacaoProjeto, type AnexoProjeto, type Circuit, type ClientDeviceLogin, type ClientFull, type ClientListItem, type ClientUnit, type Device, type Did, type DeviceModel, type InventorySummary, type Me, type Movement, type Product, type ProductModule, type Subscription, type SubscriptionModule } from './types.js';

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
type ModRow = ProductModule & { productId: string; deletedAt?: string | null };
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
/** Base de conhecimento (1.8): o artigo, as versões do texto, as ligações e os arquivos (o print fica embutido, como a logo). */
type ArtRow = {
  id: string; numero: number; titulo: string; oQueAcontece: string | null; comoResolver: string | null; porQueAcontece: string | null; palavras: string[];
  situacao: 'rascunho' | 'publicado'; obrigatoriaDesde: string | null; obrigatoriaPor: string | null; versao: number;
  autorId: string | null; atualizadoPorId: string | null; publicadoEm: string | null; criadoEm: string; atualizadoEm: string; deletedAt: string | null;
};
type ArtVersaoRow = { articleId: string; versao: number; titulo: string; oQueAcontece: string | null; comoResolver: string | null; porQueAcontece: string | null; palavras: string[]; nota: string | null; porId: string | null; em: string };
type ArtLigRow = { articleId: string; tipo: TipoLigacao; alvo: string };
type ArtAnexoRow = { id: string; articleId: string; fileName: string; mimeType: string; sizeBytes: number; conteudo: string; inline: boolean; porId: string | null; criadoEm: string; deletedAt: string | null };
type ArtComentarioRow = { id: string; articleId: string; userId: string | null; texto: string; em: string; deletedAt: string | null };
/** Portal do cliente (1.8): o tutorial, os arquivos (vídeo, print, arquivo para baixar) e quem tem acesso. */
type TutorialRow = {
  id: string; numero: number; titulo: string; resumo: string | null; texto: string | null; produtoId: string | null; moduloId: string | null;
  destaque: boolean; situacao: 'rascunho' | 'publicado'; versao: number; views: number; autorId: string | null; atualizadoPorId: string | null;
  publicadoEm: string | null; criadoEm: string; atualizadoEm: string; deletedAt: string | null;
};
type ArqPortalRow = { id: string; tutorialId: string | null; tipo: TipoArquivoPortal; nome: string; mimeType: string; tamanho: number; url: string; porId: string | null; criadoEm: string; deletedAt: string | null };
type AcessoRow = {
  id: string; clienteId: string; nome: string; email: string; senha: string | null; ativo: boolean;
  conviteCodigo: string | null; conviteVence: string | null; ultimoAcesso: string | null; acessos: number; criadoPorId: string | null; criadoEm: string;
};

type UserRow = { id: string; name: string; email: string; password: string; roleId: string; active: boolean; lastLoginAt: string | null; totpSecret?: string | null; totpOn?: boolean; recovery?: string[]; sshUser?: string | null };
type RoleRow = { id: string; key: string | null; name: string; description: string | null; permissions: string[]; isSystem: boolean };

const S = {
  clients: [] as Client[], subs: [] as Sub[], circuits: [] as CircuitRow[], dids: [] as DidRow[], models: [] as ModelRow[], devices: [] as DeviceRow[], movements: [] as MovRow[], units: [] as UnitRow[], deviceLogins: [] as LoginRow[], networks: [] as NetRow[],
  users: [] as UserRow[], roles: [] as RoleRow[], secrets: new Map<string, { label: string; value: string }>(),
  notas: [] as NotaRow[], leituras: [] as Array<{ noteId: string; userId: string; readAt: string }>,
  projetos: [] as ProjRow[], etapas: [] as StepRow[], projClientes: [] as PClientRow[], marcas: [] as CheckRow[],
  projComentarios: [] as PCommentRow[], projAnexos: [] as PFileRow[],
  // Base de conhecimento (1.8): os artigos entram na primeira vez que alguém abre a base (ligam chamados inventados)
  artigos: [] as ArtRow[], artVersoes: [] as ArtVersaoRow[], artLigacoes: [] as ArtLigRow[], artAnexos: [] as ArtAnexoRow[],
  artLeituras: [] as Array<{ articleId: string; userId: string; em: string }>, artComentarios: [] as ArtComentarioRow[], proximoArtigo: 1, baseSemeada: false,
  // Portal do cliente (1.8): os tutoriais e os acessos entram na primeira vez que alguém abre o portal.
  // `portalSessao` é o login do cliente (o id do acesso), separado do da equipe: dá para abrir os dois lados.
  tutoriais: [] as TutorialRow[], arqPortal: [] as ArqPortalRow[], acessosPortal: [] as AcessoRow[], proximoTutorial: 1, portalSemeado: false,
  portalSessao: null as string | null,
  ajustesPortal: { ...AJUSTES_PORTAL_PADRAO, whatsapp: '(71) 99999-0000', email: 'suporte@exemplo.com.br', horario: 'Segunda a sexta, das 8h às 18h' } as PortalAjustes,
  // a IA da base (1.8) já vem ligada na prévia — Anthropic, com um preço e um uso do mês de exemplo. A chave
  // não existe de verdade (só marcamos que existe) e a resposta é montada sem IA (ver `respostaDemo`)
  ajustesIa: {
    ativo: true, provedor: 'anthropic' as ProvedorIa, modelo: 'claude-sonnet-5-5', modeloNome: 'Claude Sonnet 5.5' as string | null, endereco: null as string | null,
    precoEntrada: 2 as number | null, precoSaida: 10 as number | null, temChave: true, chaveDe: 'anthropic' as ProvedorIa | null, chaveEndereco: null as string | null,
    ultimoTesteEm: daysAgo(1, 16) as string | null, ultimoTesteOk: true as boolean | null,
    ultimoTesteMsg: 'A IA respondeu (Claude Sonnet 5.5, Anthropic (Claude)): "funcionando". Pode usar.' as string | null,
    uso: { mes: diaEmBrasilia(new Date()).slice(0, 7), perguntas: 23, rascunhos: 4, entrada: 182_000, saida: 21_500 },
  },
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
  // a arrumação da tela de Chamados: no sistema fica no servidor, para todos; na prévia, na memória
  // como o resto — dá para arrumar, sair e entrar como leitor@ para ver a mesma arrumação
  painelChamados: {
    versao: VERSAO_PAINEL, itens: [] as ItemPainel[], etapasFechadas: null as string[] | null,
    atualizadoEm: null as string | null, atualizadoPor: null as string | null,
  },
  // Chamados › Relatórios (1.7): os campos usados e a ligação do Cliente do card com o cadastro
  ajustesRelatorios: {
    campos: {} as AjustesRelatorios['campos'], clientes: {} as AjustesRelatorios['clientes'], causas: {} as AjustesRelatorios['causas'],
    atualizadoEm: null as string | null, atualizadoPor: null as string | null,
  },
  // o envio automático (1.7): desligado e sem token, como no servidor; na prévia nada sai de verdade
  envio: {
    ativo: false, url: 'https://api.flw.chat/chat/v1/message/send', remetente: '', horario: '18:00', dias: [0, 1, 2, 3, 4, 5, 6],
    destinatarios: [] as Array<{ id: string; nome: string; numero: string; ativo: boolean }>,
    temToken: false, configuradoEm: null as string | null, configuradoPor: null as string | null,
    ultimoAgendado: null as UltimoEnvioAgendado,
    historico: [] as RegistroEnvio[],
  },
  // o que vai no PDF: na prévia já vem com alguns marcados, para o "Ver como fica" ter o que mostrar
  envioMarcados: {
    relatorios: ['relogio', 'primeira', 'pareto'], graficos: ['serie', 'etapa'],
    atualizadoEm: null as string | null, atualizadoPor: null as string | null,
  },
  // a arrumação da página de Relatórios (ordem, escondidos, favoritos) — igual para a equipe toda
  arrumacaoRelatorios: {
    ordem: [] as string[], ocultos: [] as string[], favoritos: [] as string[],
    atualizadoEm: null as string | null, atualizadoPor: null as string | null,
  },
  carriers: [] as { id: string; name: string; active: boolean }[], hostings: [] as { id: string; name: string; active: boolean }[], categories: [] as { id: string; name: string; active: boolean }[],
  products: PRODUTOS_INICIAIS.map((p, i) => ({ id: 'p' + p.code, code: p.code as string, name: p.name as string, color: p.color as string, hasSettings: p.hasSettings as boolean, description: p.description as string | null, sortOrder: i, active: true, deletedAt: null as string | null })),
  modules: MODULOS_INICIAIS.map((m, i) => ({ id: 'm' + m.product + '_' + m.code, productId: 'p' + m.product, code: m.code, name: m.name, description: m.description as string | null, hasSettings: m.hasSettings, sortOrder: i, active: true })) as ModRow[],
  subMods: [] as SubMod[],
  audit: [] as (AuditItem & { userId: string | null })[],
  me: null as UserRow | null,
};

function audit(action: string, entityType: string, summary: string, entityId: string | null = null, extra: { before?: unknown; after?: unknown } = {}) {
  S.audit.unshift({ id: id(), action, entityType, entityId, summary, before: extra.before ?? null, after: extra.after ?? null, userName: S.me?.name ?? null, userId: S.me?.id ?? null, createdAt: now() });
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
        if (mcode === 'fop2') { const f = id(), u = id(); S.secrets.set(f, { label: `Senha do ramal admin do FOP2 — ${t}`, value: 'fop2#2026' }); S.secrets.set(u, { label: `Senha do usuário padrão do FOP2 — ${t}`, value: 'Ramal@2026' }); Object.assign(ms, { adminExtension: '1000', adminPasswordSecretId: f, defaultUserPasswordSecretId: u }); }
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
/** Os assuntos, com o peso de cada um: parecidos com os do painel de verdade (o print do Luan, 24/09). */
const ASSUNTOS_DEMO: Array<[string, number]> = [
  ['Ramal - Configuração', 17], ['Ramal - Telefone Sem Serviço', 9], ['Ramal - Criação', 7], ['Tronco - Configuração Rota de Entrada/Saída', 6],
  ['Armazenamento Lotado Server', 4], ['LinePBX - Gravação', 3], ['LineChat - Ajuste', 3], ['Linechat - Alteração Chatbot', 3],
  ['Linechat - Criação Login', 3], ['LinePBX Web - Configuração', 3], ['Falha Infraestrutura Cliente', 2], ['LinePBX - Fila - Configuração', 2],
  ['Omniboard - configuração', 2], ['API e Integrações', 2], ['Internos', 2], ['LinePBX - Fila - Falha', 2], ['Usuário - Dúvida', 2],
  ['LineChat - Criação/Alteração de template', 2], ['LineChat - Disparos', 2], ['Acompanhamento', 1], ['LinePBX Web - Erro Pausa', 1],
  ['Tronco - Queda', 1], ['URA - Ajuste', 1], ['Relatórios - Ajuste', 1],
];

let chamadosGuardados: { cards: Chamado[]; ctx: Omit<ContextoChamados, 'agora'>; movimentos: number; historico: Map<string, MovimentoChamado[]> } | null = null;
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
    { key: 'assunto', name: 'Assunto', type: 'SINGLESELECT', position: 9, options: ASSUNTOS_DEMO.map(([a]) => a), archived: false },
  ];
  const pesoTipo = [5, 4, 5, 3, 2, 3, 1, 1];
  const pesoProduto = [9, 4, 2, 2, 1, 3, 2, 1];
  const pesado = <T,>(xs: T[], pesos: number[]) => { const t = pesos.reduce((a, b) => a + b, 0); let r = sorte() * t; for (let i = 0; i < xs.length; i++) { r -= pesos[i] ?? 1; if (r <= 0) return xs[i]!; } return xs[0]!; };
  const cards: Chamado[] = [];
  const agora = Date.now();
  let numero = 3000;
  const etapaDe = (titulo: string) => ETAPAS_DEMO.find((e) => e.title === titulo)!;

  /** Um chamado inventado: a abertura, onde ele está agora e (se fechou) quando fechou. */
  function criar(criado: Date, etapa: (typeof ETAPAS_DEMO)[number], alterado: Date, fechadoEm: Date | null, extra: { resp?: string | null; arquivado?: boolean; vence?: Date | null; estimado?: boolean } = {}) {
    const aberto = !etapa.isFinal;
    const resp = extra.resp !== undefined ? extra.resp : sorte() < 0.06 ? null : um(PESSOAS_DEMO);
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
      assunto: pesado(campos[6]!.options, ASSUNTOS_DEMO.map(([, peso]) => peso)),
      ...(sorte() < 0.3 ? { observador: [um(PESSOAS_DEMO), um(PESSOAS_DEMO)].filter((x, i, a) => a.indexOf(x) === i) } : {}),
    };
    numero++;
    const assunto = cf.assunto as string;
    const cliente = (cf['cliente-71'] as string | null) ?? 'Interno';
    cards.push({
      id: `card-${numero}`, key: `IS-${numero}`, number: numero,
      // a descrição vem do editor do LineChat, com marcas: a tabela mostra só o texto
      title: `${cf.plataforma} - ${cliente} - ${assunto}`, description: `<p>Cliente relata: ${assunto.toLowerCase()}.</p><p>Chamado de <b>demonstração</b>, aberto pelo canal ${cf['meio-solicita-o'] as string}.</p>`,
      stepId: etapa.id, stepTitle: etapa.title, stepPhase: etapa.isInitial ? 'INITIAL' : etapa.isFinal ? 'FINAL' : 'INTERMEDIATE',
      status: extra.arquivado ? 'ARCHIVED' : 'OPEN',
      responsavel: resp,
      createdAt: criado.toISOString(), updatedAt: alterado.toISOString(),
      closedAt: fechadoEm?.toISOString() ?? null, closedEstimated: !!fechadoEm && !!extra.estimado,
      dueDate: extra.vence?.toISOString() ?? null,
      isOverdue: false, tagIds: tags, campos: cf,
    });
  }

  // os dias que já passaram, do mais antigo para o mais novo (como a numeração do LineChat)
  for (let d = 120; d >= 1; d--) {
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
      criar(criado, etapa, alterado, fechadoEm, {
        arquivado: !aberto && idade > 45 && sorte() < 0.2,
        estimado: idade > 20,
        vence: aberto && sorte() < 0.35 ? new Date(criado.getTime() + (1 + sorte() * 10) * 86_400_000) : null,
      });
    }
  }

  // 1.7: um dia de incidente, 12 dias atrás (num dia útil): a operadora caiu e choveu chamado de
  // "Tronco - Queda" — é o que o relatório "Dias fora da curva" existe para achar
  const incidente = new Date(agora - 12 * 86_400_000);
  while (incidente.getDay() === 0 || incidente.getDay() === 6) incidente.setDate(incidente.getDate() - 1);
  for (let k = 0; k < 11; k++) {
    const criado = new Date(incidente); criado.setHours(9, 5 + k * 9, 0, 0);
    const fechadoEm = new Date(criado.getTime() + (2 + k * 0.4) * 3_600_000);
    criar(criado, etapaDe('Chamado Validado'), fechadoEm, fechadoEm, { estimado: false });
    const c = cards[cards.length - 1]!;
    c.campos.assunto = 'Tronco - Queda';
    c.campos['tipo-de-chamado-24'] = 'Dificuldade Infraestrutura Cliente';
    c.title = `${c.campos.plataforma as string} - ${(c.campos['cliente-71'] as string | null) ?? 'Interno'} - Tronco - Queda`;
    c.description = `<p>Cliente relata: ninguém consegue ligar para a empresa, dá "número não existe".</p><p>Chamado de <b>demonstração</b>, aberto pelo canal ${c.campos['meio-solicita-o'] as string}.</p>`;
  }

  // HOJE: uns 16 chamados espalhados pelo dia até agora, para a aba Hoje ter o que mostrar a qualquer
  // hora (antes das 7h30 a janela começa à meia-noite). Os mais antigos do dia já andaram no Kanban.
  const inicioDoDia = new Date(agora); inicioDoDia.setHours(0, 0, 0, 0);
  const comeco = new Date(agora); comeco.setHours(7, 30, 0, 0);
  const de = agora - comeco.getTime() > 60 * 60_000 ? comeco.getTime() : inicioDoDia.getTime();
  const janela = Math.max(10 * 60_000, agora - 3 * 60_000 - de);
  const HOJE = 16;
  for (let k = 0; k < HOJE; k++) {
    const criado = new Date(de + janela * ((k + 0.15 + sorte() * 0.7) / HOJE));
    const horas = (agora - criado.getTime()) / 3_600_000;
    const r = sorte();
    const titulo = horas > 3
      ? (r < 0.3 ? 'Chamado Tratado Suporte' : r < 0.6 ? 'Chamado Em Tratativa N1' : r < 0.75 ? 'Chamado Pendente Suporte' : r < 0.85 ? 'Chamado Em Tratativa N2' : 'Novos Suporte')
      : horas > 1
        ? (r < 0.15 ? 'Chamado Tratado Suporte' : r < 0.45 ? 'Chamado Em Tratativa N1' : r < 0.65 ? 'Chamado Pendente Suporte' : 'Novos Suporte')
        : (r < 0.7 ? 'Novos Suporte' : 'Chamado Pendente Suporte');
    const etapa = etapaDe(titulo);
    const fechadoEm = etapa.isFinal ? new Date(Math.min(agora - 2 * 60_000, criado.getTime() + (0.5 + sorte() * 2) * 3_600_000)) : null;
    const alterado = fechadoEm ?? new Date(Math.min(agora - 60_000, criado.getTime() + sorte() * Math.max(0.1, horas) * 3_600_000));
    // dois chamados da manhã, ainda abertos, com o vencimento já passado: aparecem como vencidos
    const vence = !etapa.isFinal && horas > 4 && k < 2 ? new Date(criado.getTime() + 2 * 3_600_000) : null;
    criar(criado, etapa, alterado, fechadoEm, { resp: etapa.isInitial && sorte() < 0.5 ? null : undefined, vence });
  }

  // e alguns chamados dos dias anteriores que foram fechados hoje (o "Fechados hoje" não fica zerado)
  const ontemEAntes = cards.filter((c) => c.closedAt && Date.parse(c.createdAt) > agora - 5 * 86_400_000 && Date.parse(c.createdAt) < inicioDoDia.getTime());
  for (const c of ontemEAntes.slice(0, 5)) {
    const quando = new Date(de + sorte() * (agora - 2 * 60_000 - de)).toISOString();
    c.closedAt = quando; c.updatedAt = quando; c.closedEstimated = false;
  }
  // 1.7: um terço dos fechados com hora exata tinha vencimento, para o "Prazo cumprido" ter o que
  // mostrar — sem mexer no sorteio, para os outros números da prévia não mudarem
  for (const c of cards) {
    if (!c.closedAt || c.closedEstimated || c.dueDate || (c.number ?? 0) % 3 !== 0) continue;
    const h = 6 + (((c.number ?? 0) * 37) % 90); // de 6h a 4 dias depois da abertura
    c.dueDate = new Date(Date.parse(c.createdAt) + h * 3_600_000).toISOString();
  }
  for (const c of cards) c.isOverdue = !!c.dueDate && Date.parse(c.dueDate) < agora && !ETAPAS_DEMO.find((e) => e.id === c.stepId)?.isFinal;
  // 1.7: metade dos cards sem cliente vira "Interno" — uma opção do LineChat que não é cliente do
  // cadastro, para a janela de ligar os clientes (Relatórios) ter o que mostrar
  for (const c of cards) if (c.campos['cliente-71'] == null && (c.number ?? 0) % 2 === 0) c.campos['cliente-71'] = 'Interno';
  campos[0]!.options = [...campos[0]!.options, 'Interno'];
  const inicioDoHistorico = agora - 20 * 86_400_000;
  const { historico, movimentos } = historicoDemo(cards, inicioDoHistorico);
  chamadosGuardados = { cards, ctx: { etapas: ETAPAS_DEMO, campos, etiquetas: ETIQUETAS_DEMO }, movimentos, historico };
  // a prévia já vem com dois grupos no Assunto, para o botão Agrupar ter o que mostrar
  if (!S.painelChamados.itens.length) {
    S.painelChamados = {
      ...S.painelChamados,
      itens: painelPadrao(camposDeLista(campos)).map((x) => (x.id === 'campo:assunto' ? {
        ...x,
        agrupar: false,
        grupos: [
          { id: 'grupo-ramal', nome: 'Ramal', valores: ['Ramal - Configuração', 'Ramal - Telefone Sem Serviço', 'Ramal - Criação'] },
          { id: 'grupo-linechat', nome: 'LineChat', valores: ['LineChat - Ajuste', 'Linechat - Alteração Chatbot', 'Linechat - Criação Login', 'LineChat - Criação/Alteração de template', 'LineChat - Disparos'] },
        ],
      } : x)),
      atualizadoEm: new Date(agora - 2 * 3_600_000).toISOString(), atualizadoPor: 'Luan França',
    };
  }
  const inicio = new Date(inicioDoHistorico).toISOString();
  // a completa roda à meia-noite de Brasília (0h = 3h UTC): a de hoje
  const meiaNoite = new Date(`${diaEmBrasilia(new Date(agora))}T03:01:00Z`).toISOString();
  S.ajustesLineChat = { ...S.ajustesLineChat, inicioEm: inicio, ultimaEm: new Date(agora - 40_000).toISOString(), ultimaCompletaEm: meiaNoite, ultimaMsg: 'Atualização: 2 cards lidos, 1 mudança de etapa.' };
  return chamadosGuardados;
}
/** Os chamados como o servidor os entrega: com as etapas que fecham escolhidas pela equipe. */
function chamadosDaEquipe() {
  const d = chamadosDemo();
  const etapas = etapasDaEquipe(d.ctx.etapas, S.painelChamados.etapasFechadas);
  // com o histórico, a hora do fechamento é refeita pelas etapas da equipe (como no servidor)
  return { ...d, cards: comFechamento(d.cards, etapas, d.historico), ctx: { ...d.ctx, etapas } };
}

/**
 * O caminho de cada chamado inventado pelas etapas, do jeito que a sincronização grava
 * (`linechat_card_moves`). Sorteio com semente própria, depois dos cards prontos, para não mudar
 * os números que a prévia já mostrava.
 *  - nível alcançado: ~7% fecham sem passar do N1, ~63% no N1, ~21% sobem ao N2, ~9% ao N3;
 *  - ~5% dos fechados foram reabertos uma vez (Tratado → N1/N2 → Tratado);
 *  - a chegada na etapa que fecha é a hora do fechamento do card (`comFechamento` refaz igual);
 *  - card aberto antes do histórico começar: como na sincronização, a primeira linha é estimada
 *    (de onde ele estava quando começamos a olhar), e só o que veio depois tem hora exata.
 */
function historicoDemo(cards: Chamado[], inicio: number): { historico: Map<string, MovimentoChamado[]>; movimentos: number } {
  let semente = 20261003;
  const sorte = () => { semente = (semente * 1103515245 + 12345) % 2147483648; return semente / 2147483648; };
  const idDe = (titulo: string) => ETAPAS_DEMO.find((e) => e.title === titulo)!.id;
  const N = ['Chamado Em Tratativa N1', 'Chamado Em Tratativa N2', 'Chamado Em Tratativa N3'];
  const historico = new Map<string, MovimentoChamado[]>();
  let movimentos = 0;
  const agora = Date.now();
  for (const c of cards) {
    const atual = ETAPAS_DEMO.find((e) => e.id === c.stepId)!;
    const r = sorte();
    const nivel = r < 0.07 ? 0 : r < 0.7 ? 1 : r < 0.91 ? 2 : 3;
    const passos = ['Novos Suporte'];
    const pendente = sorte() < 0.3;
    if (atual.isFinal) {
      if (pendente) passos.push('Chamado Pendente Suporte');
      for (let k = 0; k < nivel; k++) passos.push(N[k]!);
      if (sorte() < 0.15) passos.push('Chamado em Observação');
      passos.push('Chamado Tratado Suporte');
      if (sorte() < 0.05) passos.push(N[Math.min(Math.max(nivel, 1), 2) - 1]!, 'Chamado Tratado Suporte');
      if (atual.title === 'Chamado Validado') passos.push('Chamado Validado');
    } else if (atual.title === 'Chamado Pendente Suporte') {
      passos.push(atual.title);
    } else if (atual.title !== 'Novos Suporte') {
      if (pendente) passos.push('Chamado Pendente Suporte');
      const k = N.indexOf(atual.title);
      if (k >= 0) for (let i = 0; i <= k; i++) passos.push(N[i]!);
      else { for (let i = 0; i < Math.max(1, Math.min(nivel, 2)); i++) passos.push(N[i]!); passos.push(atual.title); }
    }
    // as horas: da abertura até o fechamento (ou a última alteração); o que vem depois do
    // fechamento (o Validado) entra logo em seguida
    const t0 = Date.parse(c.createdAt);
    const tFim = Math.max(t0, Date.parse(c.closedAt ?? c.updatedAt));
    const iFecha = atual.isFinal ? passos.lastIndexOf('Chamado Tratado Suporte') : passos.length - 1;
    const fracoes = Array.from({ length: Math.max(0, iFecha - 1) }, () => sorte()).sort((a, b) => a - b);
    const horas = passos.map((_, i) => {
      if (i === 0) return t0;
      if (i < iFecha) return t0 + (tFim - t0) * fracoes[i - 1]!;
      if (i === iFecha) return tFim;
      return Math.min(agora - 60_000, tFim + (i - iFecha) * 2 * 3_600_000);
    });
    let movs: MovimentoChamado[] = passos.map((p, i) => ({ fromStepId: i ? idDe(passos[i - 1]!) : null, toStepId: idDe(p), at: new Date(horas[i]!).toISOString(), estimated: false }));
    if (t0 < inicio) {
      const j = horas.reduce((acc, h, i) => (h <= inicio ? i : acc), 0);
      movs = j === passos.length - 1
        // já estava onde está hoje quando começamos a olhar: uma linha só, estimada
        ? [{ fromStepId: null, toStepId: c.stepId, at: c.updatedAt, estimated: true }]
        : [{ fromStepId: null, toStepId: idDe(passos[j]!), at: new Date(inicio).toISOString(), estimated: true }, ...movs.slice(j + 1)];
    }
    historico.set(c.id, movs);
    movimentos += movs.filter((m) => m.fromStepId).length;
  }
  return { historico, movimentos };
}

/** O contexto dos Relatórios na prévia (o mesmo que o servidor monta). */
function contextoRelatoriosDemo(): { cards: Chamado[]; ctx: ContextoRelatorios } {
  const { cards, ctx, historico } = chamadosDaEquipe();
  const ajustes = { campos: S.ajustesRelatorios.campos, clientes: S.ajustesRelatorios.clientes, causas: S.ajustesRelatorios.causas };
  const assunto = camposDosRelatorios(ctx.campos, ajustes.campos).assunto;
  const grupos = assunto ? S.painelChamados.itens.find((x) => x.id === `campo:${assunto.key}`)?.grupos : undefined;
  // o tamanho de cada cliente (DIDs e aparelhos, sem os vendidos), como o servidor lê do banco
  const tamanhos = new Map(S.clients.filter((c) => !c.deletedAt && !c.isInternal).map((c) => [c.id, {
    nome: c.tradeName,
    dids: S.dids.filter((d) => d.clientId === c.id && !d.deletedAt).length,
    aparelhos: S.devices.filter((d) => d.clientId === c.id && !d.deletedAt && d.currentModality !== 'venda').length,
  }]));
  return { cards, ctx: { ...ctx, agora: new Date(), historico, historicoDesde: S.ajustesLineChat.inicioEm, ajustes, gruposAssunto: grupos?.length ? grupos : undefined, cadastro: cadastroParaLigar(), tamanhos } };
}
/** Os clientes do cadastro que podem aparecer no LineChat: fora os internos e os da lixeira. */
const cadastroParaLigar = () => S.clients.filter((c) => !c.deletedAt && !c.isInternal).map((c) => ({ id: c.id, nomes: [c.tradeName, c.legalName].filter(Boolean) }));
const linkDemo = (c: Chamado) => (c.key ? `https://inglinechat.com.br/panels/painel-demo/card/${c.key}` : '');
/**
 * Dois cards abertos por engano hoje e excluídos no LineChat: a conferência de 10 em 10 minutos
 * os tirou das contas (não estão em `chamadosDemo`); aparecem só em Ajustes.
 */
function excluidosDemo(): AjustesLineChat['excluidos'] {
  const { cards } = chamadosDemo();
  const n = Math.max(...cards.map((c) => c.number ?? 0));
  const em = (min: number) => new Date(Date.now() - min * 60_000).toISOString();
  return [
    { id: 'demo-excluido-2', key: `IS-${n + 2}`, number: n + 2, title: 'Teste - pode excluir', createdAt: em(14), removedAt: em(8) },
    { id: 'demo-excluido-1', key: `IS-${n + 1}`, number: n + 1, title: 'Ramal sem áudio (aberto em duplicidade)', createdAt: em(27), removedAt: em(18) },
  ];
}
function statusLineChatDemo(): AjustesLineChat {
  const { cards, movimentos } = chamadosDemo();
  const a = S.ajustesLineChat;
  const excluidos = excluidosDemo();
  return {
    ...a,
    totais: { cards: cards.length, ativos: cards.filter((c) => c.status !== 'ARCHIVED').length, arquivados: cards.filter((c) => c.status === 'ARCHIVED').length, movimentos, excluidos: excluidos.length },
    excluidos,
    execucoes: [
      { id: 'run4', kind: 'recente', trigger: 'agendada', startedAt: a.ultimaEm ?? now(), finishedAt: a.ultimaEm, ok: true, message: a.ultimaMsg },
      ...excluidos.map((c, i) => ({
        id: `run-conf-${i}`, kind: 'conferencia', trigger: 'agendada', startedAt: c.removedAt!, finishedAt: c.removedAt, ok: true,
        message: `Conferência dos últimos 7 dias: 1 excluído no LineChat (${c.key}).`,
      })),
      { id: 'run1', kind: 'completa', trigger: 'agendada', startedAt: a.ultimaCompletaEm ?? now(), finishedAt: a.ultimaCompletaEm, ok: true, message: `Leitura completa: ${cards.length.toLocaleString('pt-BR')} cards lidos.` },
    ],
  };
}

// ---------------- ajudantes ----------------
/** Como o servidor (`conferirDesativacao`): a desativação não vem antes da ativação nem no futuro. */
function conferirDesativacaoDemo(fim: unknown, inicio: unknown) {
  if (!fim) return;
  const f = Date.parse(String(fim)), i = inicio ? Date.parse(String(inicio)) : NaN;
  if (!Number.isNaN(i) && f < i - 12 * 3_600_000) throw bad('A desativação não pode ser antes da ativação.');
  if (f > Date.now() + 12 * 3_600_000) throw bad('A data de desativação não pode ser no futuro.');
}
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
const activeMods = (subId: string) => S.subMods.filter((m) => m.subscriptionId === subId && !m.deactivatedAt && !modMeta(m.moduleId).deletedAt).sort((a, b) => modMeta(a.moduleId).sortOrder - modMeta(b.moduleId).sortOrder);
/** O que o cliente tem ligado: códigos dos produtos e "produto:módulo" (como o servidor, com withProducts). */
const produtosDoCliente = (cid: string) => {
  const subs = activeSubs(cid).slice().sort((a, b) => (S.products.find((p) => p.code === a.productCode)?.sortOrder ?? 0) - (S.products.find((p) => p.code === b.productCode)?.sortOrder ?? 0));
  return { products: subs.map((s) => s.productCode), modules: subs.flatMap((s) => activeMods(s.id).map((m) => `${s.productCode}:${modMeta(m.moduleId).code}`)) };
};
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
  if (meta.code === 'fop2') settings = { adminExtension: st.adminExtension ?? null, adminPassword: secretRef(st.adminPasswordSecretId), defaultUserPassword: secretRef(st.defaultUserPasswordSecretId) };
  else if (meta.code === 'omniboard') settings = { adminLogin: st.adminLogin ?? null, adminPassword: secretRef(st.adminPasswordSecretId), userDefaultPassword: secretRef(st.userDefaultPasswordSecretId) };
  return { id: m.id, moduleCode: meta.code, moduleName: meta.name, hasSettings: meta.hasSettings, active: !m.deactivatedAt, activatedAt: m.activatedAt, deactivatedAt: m.deactivatedAt, notes: m.notes, settings };
};
const fullClient = (idc: string): ClientFull => {
  const c = S.clients.find((x) => x.id === idc && !x.deletedAt); if (!c) throw notFound('Cliente');
  const subs: Subscription[] = S.subs.filter((s) => s.clientId === idc && produtoVivo(s.productCode)).map((s) => {
    const p = prodMeta(s.productCode); const st = s.settings; let settings: Record<string, any> | null = null;
    if (s.productCode === 'linepbx') settings = { hostingId: st.hostingId, hostingName: S.hostings.find((h) => h.id === st.hostingId)?.name ?? null, serverIp: st.serverIp, domain: st.domain, sshPort: st.sshPort };
    else if (s.productCode === 'szchat') settings = { adminLogin: st.adminLogin ?? null, adminPassword: secretRef(st.adminPasswordSecretId) };
    const modules = S.subMods.filter((m) => m.subscriptionId === s.id && !modMeta(m.moduleId).deletedAt).sort((a, b) => modMeta(a.moduleId).sortOrder - modMeta(b.moduleId).sortOrder).map(shapeSubMod);
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
const shapeProduct = (p: (typeof S.products)[number]): Product => ({ id: p.id, code: p.code, name: p.name, color: p.color, description: p.description, hasSettings: p.hasSettings, sortOrder: p.sortOrder, active: p.active, protegido: PROTEGIDOS.includes(p.code), activeClients: new Set(S.subs.filter((x) => x.productCode === p.code && !x.deactivatedAt && S.clients.some((c) => c.id === x.clientId && !c.deletedAt)).map((x) => x.clientId)).size, modules: S.modules.filter((m) => m.productId === p.id && !m.deletedAt).sort((a, b) => a.sortOrder - b.sortOrder).map(({ productId: _p, deletedAt: _d, ...m }) => ({ ...m, protegido: MODULOS_PROTEGIDOS.includes(`${p.code}:${m.code}`), activeClients: new Set(S.subMods.filter((x) => x.moduleId === m.id && !x.deactivatedAt).map((x) => S.subs.find((y) => y.id === x.subscriptionId)).filter((y) => y && !y.deactivatedAt && S.clients.some((c) => c.id === y.clientId && !c.deletedAt)).map((y) => y!.clientId)).size })) });
/** Como o servidor: FOP2 e Omniboard guardam campos na ficha do cliente e não vão para a lixeira. */
const MODULOS_PROTEGIDOS = ['linepbx:fop2', 'linepbx:omniboard'];
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
/** A busca da Numeração e da ficha do circuito (1.6): o número OU um pedaço da observação, sem acento — como o servidor. */
const buscaDoDid = (d: DidRow, q: unknown) => {
  if (!q) return true;
  const digitos = String(q).replace(/\D/g, '');
  return (!!digitos && d.number.includes(digitos)) || paraBusca(d.note).includes(paraBusca(String(q)));
};
const filterDids = (q: Record<string, unknown>) => S.dids.filter((d) => !d.deletedAt).filter((d) => (ligado(q.includeThirdParty) || !ehTerceiro(d.circuitId))).filter((d) => buscaDoDid(d, q.q) && (!q.circuitId || d.circuitId === q.circuitId) && (!q.clientId || (q.clientId === 'free' ? !d.clientId : d.clientId === q.clientId)) && (!q.ownerClientId || d.ownerClientId === q.ownerClientId)
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
/** Envio automático (1.7): o que está marcado, com o nome e na ordem das telas (como o servidor). */
async function marcadosComTituloDemo() {
  const op = await demoApi.chamados.opcoes();
  const resumo = await demoApi.chamados.resumo({ aba: 'hoje' });
  const itens = montarPainel(S.painelChamados.itens, op.campos);
  const titulo = (id: string) => {
    if (id === 'serie') return resumo.serie.titulo;
    if (id === 'etapa') return 'Por etapa';
    if (id === 'responsavel') return 'Por responsável';
    if (id === 'etiqueta') return 'Por etiqueta';
    const c = resumo.porCampo.find((x) => `campo:${x.key}` === id);
    return c ? `Por ${c.name.toLowerCase()}` : null;
  };
  const graficos = itens.filter((x) => S.envioMarcados.graficos.includes(x.id)).map((x) => ({ id: x.id, titulo: titulo(x.id) })).filter((x): x is { id: string; titulo: string } => !!x.titulo);
  const relatorios = montarArrumacao(S.arrumacaoRelatorios).ordem.filter((id) => S.envioMarcados.relatorios.includes(id)).map((id) => ({ id, titulo: CATALOGO_RELATORIOS.find((r) => r.id === id)!.titulo }));
  return { graficos, relatorios };
}

/** O envio na prévia: confere o que falta como o servidor, mas nada sai de verdade. */
async function envioDemo(gatilho: 'manual' | 'teste' | 'agendado', destinatarioId?: string): Promise<RegistroEnvio> {
  await wait(gatilho === 'agendado' ? 300 : 900); requirePerm('admin.manage');
  const e = S.envio;
  const agora = new Date();
  const momento = momentoEmBrasilia(agora);
  const lista = e.destinatarios.filter((d) => (destinatarioId ? d.id === destinatarioId : d.ativo));
  const falta = !e.url ? 'Falta o endereço da API da FlwChat (Administração › Envio automático).'
    : !e.temToken ? 'Falta o token da API da FlwChat (Administração › Envio automático).'
      : !e.remetente ? 'Falta o número que envia (Administração › Envio automático).'
        : !lista.length ? 'Nenhum número ativo na lista.' : null;
  const t = gatilho === 'teste' ? { graficos: [], relatorios: [] } : await marcadosComTituloDemo();
  // como no servidor: faltou algo, não chega a montar o PDF (nem lista o que iria nele)
  const itens = falta ? [] : [...t.graficos.map((g) => g.titulo), ...t.relatorios.map((r) => r.titulo)];
  const destinatarios = falta ? [] : lista.map((d) => ({ nome: d.nome, numero: d.numero, ok: true, mensagem: 'Simulação da prévia: nada foi enviado.' }));
  const r: RegistroEnvio = {
    id: id(), em: agora.toISOString(), dia: momento.dia, gatilho, quem: gatilho === 'agendado' ? null : S.me?.name ?? null, ok: !falta,
    mensagem: falta ?? `Simulação da prévia: nada foi para o WhatsApp. No sistema de verdade, ${gatilho === 'teste' ? 'a mensagem de teste' : 'o PDF'} iria para ${destinatarios.length} ${destinatarios.length === 1 ? 'número' : 'números'}.`,
    pdf: falta || gatilho === 'teste' ? null : { id: id(), nome: `chamados-${momento.dia.slice(8, 10)}-${momento.dia.slice(5, 7)}-${momento.dia.slice(0, 4)}.pdf`, bytes: 0 },
    itens, destinatarios,
  };
  S.envio.historico = [r, ...S.envio.historico].slice(0, 60);
  // como no servidor: o envio agendado anota o dia, o horário e quantas tentativas já foram
  if (gatilho === 'agendado') {
    S.envio.ultimoAgendado = { dia: momento.dia, horario: e.horario, ok: r.ok, em: r.em, tentativas: (agendadoDeHoje(e, agora, e.ultimoAgendado)?.tentativas ?? 0) + 1 };
  }
  const quem = gatilho === 'agendado' ? 'Envio automático:' : `${S.me?.name} mandou`;
  audit(gatilho === 'teste' ? 'envio_automatico_teste' : 'envio_automatico', 'settings', `${quem} ${gatilho === 'teste' ? 'mensagem de teste' : `PDF dos Chamados (${itens.length} itens)`} pelo WhatsApp — ${r.ok ? r.mensagem : `falhou: ${r.mensagem}`}${destinatarios.length ? ` (${destinatarios.map((d) => numeroLegivel(d.numero)).join(', ')})` : ''}`, 'envio-automatico');
  return r;
}

/** O relógio na prévia: não roda sozinho, então confere quando a tela do envio abre (e a cada minuto, com ela aberta). */
async function relogioDemo() {
  const e = S.envio;
  if (horaDeEnviar(e, new Date(), e.ultimoAgendado)) await envioDemo('agendado');
}

// ---------- Base de conhecimento (1.8) ----------
//
// As mesmas regras do servidor (`apps/api/src/services/base.ts`): rascunho só para quem escreveu e
// para quem cuida da base; publicar exige o "Como resolver"; toda mudança no texto vira versão;
// leitura obrigatória vale a leitura feita depois do pedido. A busca, o texto simples e o livrinho
// do chamado são as funções do `@gestor/shared`, as mesmas do servidor. Os artigos entram na
// primeira vez que alguém abre a base, porque alguns ligam chamados inventados.

const IMAGENS_DO_TEXTO_DEMO = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
const NAO_EXISTE = '(não existe mais)';
/** Texto com acento em "data:" (o btoa sozinho só aceita Latin-1). */
const base64Utf8 = (t: string) => btoa(unescape(encodeURIComponent(t)));
const svgDemo = (w: number, h: number, conteudo: string) => 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" font-family="Verdana,Arial,sans-serif">${conteudo}</svg>`);

/** O print de exemplo do BC-2: a tela de conta do telefone, desenhada (na prévia não há print de verdade). */
const PRINT_GRANDSTREAM = svgDemo(640, 300, [
  '<rect width="640" height="300" fill="#f4f6f8"/>',
  '<rect width="640" height="38" fill="#1f3a5f"/><text x="16" y="25" font-size="14" fill="#fff" font-weight="bold">GXP1610</text><text x="96" y="25" font-size="12" fill="#c9d6e6">Account › Account 1 › General Settings</text>',
  '<rect x="0" y="38" width="130" height="262" fill="#e3e8ee"/>',
  ...['Status', 'Account', 'Settings', 'Network', 'Maintenance'].map((t, i) => `<rect x="0" y="${50 + i * 30}" width="130" height="26" fill="${i === 1 ? '#c9d6e6' : 'none'}"/><text x="14" y="${68 + i * 30}" font-size="12" fill="#1f2937"${i === 1 ? ' font-weight="bold"' : ''}>${t}</text>`),
  ...[
    ['Account Active', 'Yes'], ['Account Name', 'Recepcao'], ['SIP Server', 'valeverde.linepbx.com.br'], ['SIP User ID', '2001'], ['Authenticate ID', '2001'], ['Name', 'Recepcao'],
  ].map(([k, v], i) => `<text x="150" y="${70 + i * 32}" font-size="12" fill="#4b5563">${k}</text><rect x="300" y="${54 + i * 32}" width="300" height="24" rx="3" fill="#fff" stroke="#cbd5e1"/><text x="308" y="${70 + i * 32}" font-size="12" fill="#111827">${v}</text>`),
  '<rect x="294" y="114" width="312" height="32" rx="5" fill="none" stroke="#dc2626" stroke-width="3"/>',
  '<rect x="300" y="256" width="120" height="28" rx="4" fill="#1f3a5f"/><text x="314" y="275" font-size="12" fill="#fff">Save and Apply</text>',
].join(''));

/** O print de exemplo do BC-3: o terminal com o disco cheio. */
const PRINT_DISCO = svgDemo(640, 190, [
  '<rect width="640" height="190" rx="6" fill="#111827"/>',
  '<circle cx="16" cy="14" r="5" fill="#ef4444"/><circle cx="32" cy="14" r="5" fill="#f59e0b"/><circle cx="48" cy="14" r="5" fill="#22c55e"/>',
  ...[
    ['root@valeverde:~# df -h', '#e5e7eb'],
    ['Filesystem      Size  Used Avail Use% Mounted on', '#9ca3af'],
    ['/dev/sda1        98G   98G     0 100% /', '#fca5a5'],
    ['tmpfs           3.9G     0  3.9G   0% /dev/shm', '#9ca3af'],
    ['root@valeverde:~# du -sh /var/spool/asterisk/monitor', '#e5e7eb'],
    ['71G     /var/spool/asterisk/monitor', '#fde68a'],
  ].map(([t, cor], i) => `<text x="16" y="${50 + i * 22}" font-size="13" font-family="Consolas,Menlo,monospace" fill="${cor}" xml:space="preserve">${t}</text>`),
].join(''));

const TEXTO_FERIADO = 'Texto padrão do aviso de feriado (para a locutora gravar)\n\nOlá! Hoje é feriado e o nosso atendimento está fechado.\nVoltamos amanhã, a partir das 8h.\nObrigado pela ligação!\n';

function semearBase() {
  if (S.baseSemeada) return;
  S.baseSemeada = true;
  const cli = (nome: string) => S.clients.find((c) => c.tradeName === nome)?.id ?? null;
  const modelo = (code: string) => S.models.find((m) => m.code === code)?.id ?? null;
  const { cards } = chamadosDemo();
  // o dia do incidente da operadora (o dia com mais "Tronco - Queda"): o BC-5 nasceu dele
  const porDia = new Map<string, Chamado[]>();
  for (const c of cards.filter((x) => x.campos.assunto === 'Tronco - Queda')) { const d = c.createdAt.slice(0, 10); porDia.set(d, [...(porDia.get(d) ?? []), c]); }
  const incidente = [...porDia.values()].sort((a, b) => b.length - a.length)[0]?.sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0] ?? null;
  const semServico = cards.find((c) => c.campos.assunto === 'Ramal - Telefone Sem Serviço' && c.campos['cliente-71'] === 'Supermercado Bom Preço' && c.closedAt) ?? null;

  type Texto = Pick<ArtRow, 'titulo' | 'oQueAcontece' | 'comoResolver' | 'porQueAcontece' | 'palavras'>;
  const artigo = (o: {
    autor: string; dias: number; publicado: boolean; texto: Texto; ligacoes: Array<[TipoLigacao, string | null]>;
    /** as versões anteriores (a mais antiga primeiro), com quem escreveu e quando */
    antes?: Array<{ por: string; dias: number; texto: Texto }>;
    editadoPor?: string; editadoDias?: number;
    obrigatoria?: { por: string; dias: number; leram: Array<[string, number]> };
    anexos?: Array<{ ref: string; fileName: string; mimeType: string; conteudo: string; inline: boolean; sizeBytes: number }>;
  }) => {
    const a: ArtRow = {
      id: id(), numero: S.proximoArtigo++, ...o.texto, situacao: o.publicado ? 'publicado' : 'rascunho',
      obrigatoriaDesde: o.obrigatoria ? daysAgo(o.obrigatoria.dias, 9) : null, obrigatoriaPor: o.obrigatoria?.por ?? null,
      versao: (o.antes?.length ?? 0) + 1, autorId: o.autor, atualizadoPorId: o.editadoPor ?? o.autor,
      publicadoEm: o.publicado ? daysAgo(o.dias, 10) : null, criadoEm: daysAgo(o.dias, 10), atualizadoEm: o.editadoDias != null ? daysAgo(o.editadoDias, 15) : daysAgo(o.dias, 10), deletedAt: null,
    };
    // os prints: o marcador do texto vira o id do anexo, como o servidor faz ao gravar
    const ids: Record<string, string> = {};
    for (const x of o.anexos ?? []) {
      const ax: ArtAnexoRow = { id: id(), articleId: a.id, fileName: x.fileName, mimeType: x.mimeType, sizeBytes: x.sizeBytes, conteudo: x.conteudo, inline: x.inline, porId: o.autor, criadoEm: a.criadoEm, deletedAt: null };
      S.artAnexos.push(ax); ids[x.ref] = ax.id;
    }
    const troca = (t: Texto): Texto => ({ ...t, oQueAcontece: trocarMarcadores(t.oQueAcontece, ids), comoResolver: trocarMarcadores(t.comoResolver, ids), porQueAcontece: trocarMarcadores(t.porQueAcontece, ids) });
    Object.assign(a, troca(o.texto));
    S.artigos.push(a);
    (o.antes ?? []).forEach((v, i) => S.artVersoes.push({ articleId: a.id, versao: i + 1, ...troca(v.texto), nota: null, porId: v.por, em: daysAgo(v.dias, 10) }));
    S.artVersoes.push({ articleId: a.id, versao: a.versao, ...troca(o.texto), nota: null, porId: o.editadoPor ?? o.autor, em: a.atualizadoEm });
    for (const [tipo, alvo] of o.ligacoes) if (alvo) S.artLigacoes.push({ articleId: a.id, tipo, alvo });
    for (const [userId, dias] of o.obrigatoria?.leram ?? []) S.artLeituras.push({ articleId: a.id, userId, em: daysAgo(dias, 15) });
    return a;
  };

  // BC-1 — escrito pelo Lúcio, melhorado pela Marina (o Histórico mostra o que ela pôs)
  const bc1v1: Texto = {
    titulo: 'Áudio de um lado só: o cliente fala e não é ouvido',
    oQueAcontece: 'A ligação completa, mas só um lado escuta. O mais comum: o ramal ouve quem ligou e quem ligou não ouve o ramal. Às vezes a ligação cai sozinha depois de uns 30 segundos.\nCostuma começar logo depois de o cliente trocar o roteador ou a internet.',
    comoResolver: '1. Entre no roteador do cliente e procure "SIP ALG" (às vezes aparece como "SIP Helper", "SIP Passthrough" ou dentro de "NAT").\n2. Desligue o SIP ALG e salve.\n3. Reinicie o telefone (tirar da tomada por 10 segundos) para ele registrar de novo.\n4. Confira se o ramal voltou a registrar.\n5. Faça uma ligação de teste de pelo menos 1 minuto, falando dos dois lados.',
    porQueAcontece: 'O SIP ALG é uma função do roteador que tenta "ajudar" o VoIP reescrevendo os endereços de dentro da ligação. Na prática ele troca para o endereço errado e o áudio de volta se perde. Roteador novo de operadora quase sempre vem com ele ligado.',
    palavras: ['ligação muda', 'não me escutam', 'cliente não ouve', 'cai depois de 30 segundos'],
  };
  artigo({
    autor: 'u2', dias: 40, publicado: true, editadoPor: 'u3', editadoDias: 6,
    antes: [{ por: 'u2', dias: 40, texto: bc1v1 }],
    texto: {
      ...bc1v1,
      comoResolver: '1. Entre no roteador do cliente e procure "SIP ALG" (às vezes aparece como "SIP Helper", "SIP Passthrough" ou dentro de "NAT").\n2. Desligue o SIP ALG e salve.\n3. Reinicie o telefone (tirar da tomada por 10 segundos) para ele registrar de novo.\n4. Confira no servidor se o ramal voltou:\n`asterisk -rx "pjsip show contacts"`\n5. Faça uma ligação de teste de pelo menos 1 minuto, falando dos dois lados.\n\nSe o roteador for da operadora e o cliente não tiver acesso, peça para a operadora desligar o SIP ALG — eles sabem o que é. Anote o protocolo no chamado.',
      palavras: [...bc1v1.palavras, 'voz some'],
    },
    ligacoes: [['produto', 'plinepbx'], ['assunto', 'Ramal - Telefone Sem Serviço'], ['cliente', cli('Supermercado Bom Preço')], ['modelo', modelo('gxp1610')], ['chamado', semServico?.id ?? null]],
    obrigatoria: { por: 'u1', dias: 3, leram: [['u1', 3], ['u2', 2]] },
  });

  // BC-2 — com um print no meio dos passos
  artigo({
    autor: 'u2', dias: 25, publicado: true,
    texto: {
      titulo: 'GXP1610 não registra depois de mudar de rede',
      oQueAcontece: 'O telefone liga e mostra a hora, mas aparece "Sem conta" ou o ícone do ramal fica piscando. Acontece quando o aparelho muda de unidade, de rede, ou quando o cliente troca a faixa de IP.',
      comoResolver: '1. No telefone, aperte a tecla do meio (OK) e veja o IP em "Status".\n2. Abra http://IP-DO-TELEFONE no navegador e entre com o login padrão do modelo — fica na ficha do cliente, aba Acessos.\n3. Vá em Account › Account 1 › General Settings e confira o SIP Server:\n[print:p1]\n4. Se estiver certo e mesmo assim não registrar, volte o telefone ao padrão de fábrica: Menu › System › Factory Reset.\n5. Configure de novo (servidor, ramal e a senha do ramal) e reinicie.\n\nSe registra mas a voz some, veja BC-1.',
      porQueAcontece: 'O GXP1610 guarda o servidor pelo endereço antigo. Na rede nova esse endereço não responde, e ele desiste de tentar até ser reiniciado com a configuração certa.',
      palavras: ['telefone sem linha', 'sem conta', 'ramal piscando', 'telefone mudo'],
    },
    ligacoes: [['modelo', modelo('gxp1610')], ['assunto', 'Ramal - Telefone Sem Serviço'], ['cliente', cli('Hospital Vale Verde')]],
    anexos: [{ ref: 'p1', fileName: 'grandstream-conta.png', mimeType: 'image/svg+xml', conteudo: PRINT_GRANDSTREAM, inline: true, sizeBytes: 48_200 }],
  });

  // BC-3 — três versões (o Histórico tem o que comparar)
  const bc3: Texto = {
    titulo: 'Gravações sumiram do LineReports: disco do servidor cheio',
    oQueAcontece: 'O LineReports mostra as ligações, mas a gravação não toca ("arquivo não encontrado"), ou as gravações de hoje simplesmente não aparecem. As de dias anteriores continuam lá.',
    comoResolver: '1. Entre por SSH no servidor do cliente (o endereço e a porta estão na ficha do cliente, aba Acessos).\n2. Veja quanto sobra de disco:\n`df -h`\n3. Se a linha do "/" estiver em 100%, veja o tamanho das gravações:\n`du -sh /var/spool/asterisk/monitor`\n[print:p1]\n4. Combine com o cliente quantos meses de gravação ficam no servidor. O resto vai para o backup antes de apagar — nunca apague sem o backup conferido.\n5. Depois de liberar espaço, faça uma ligação de teste e confira se a gravação aparece no LineReports.',
    porQueAcontece: 'Sem espaço, o servidor continua completando as ligações, mas não consegue gravar o arquivo. O LineReports registra a ligação e aponta para uma gravação que nunca foi criada.',
    palavras: ['gravação não toca', 'sumiu a gravação', 'arquivo não encontrado', 'não grava mais'],
  };
  artigo({
    autor: 'u1', dias: 60, publicado: true, editadoPor: 'u1', editadoDias: 20,
    antes: [
      { por: 'u1', dias: 60, texto: { ...bc3, comoResolver: '1. Entre por SSH no servidor do cliente.\n2. Veja quanto sobra de disco:\n`df -h`\n3. Libere espaço apagando as gravações mais antigas.', porQueAcontece: null, palavras: ['gravação não toca'] } },
      { por: 'u2', dias: 31, texto: { ...bc3, comoResolver: '1. Entre por SSH no servidor do cliente (o endereço e a porta estão na ficha do cliente, aba Acessos).\n2. Veja quanto sobra de disco:\n`df -h`\n3. Se a linha do "/" estiver em 100%, veja o tamanho das gravações:\n`du -sh /var/spool/asterisk/monitor`\n[print:p1]\n4. Combine com o cliente quantos meses de gravação ficam no servidor. O resto vai para o backup antes de apagar — nunca apague sem o backup conferido.', porQueAcontece: null, palavras: ['gravação não toca', 'sumiu a gravação'] } },
    ],
    texto: bc3,
    ligacoes: [['produto', 'plinereports'], ['assunto', 'Armazenamento Lotado Server'], ['assunto', 'LinePBX - Gravação'], ['cliente', cli('Hospital Vale Verde')]],
    anexos: [{ ref: 'p1', fileName: 'disco-cheio.png', mimeType: 'image/svg+xml', conteudo: PRINT_DISCO, inline: true, sizeBytes: 31_400 }],
  });

  // BC-4 — o "como fazer" do projeto do feriado, com um anexo para baixar
  artigo({
    autor: 'u1', dias: 14, publicado: true,
    texto: {
      titulo: 'URA de feriado: subir o áudio e voltar ao normal no dia seguinte',
      oQueAcontece: 'No feriado, o cliente quer que quem ligar ouça um aviso ("hoje não abrimos, voltamos amanhã") no lugar da URA de sempre — e que o bot do LineChat avise o mesmo.',
      comoResolver: '1. Peça o áudio ao cliente (ou use o texto padrão em anexo, gravado pela locutora).\n2. No LinePBX, em URA › Áudios, suba o arquivo com o nome feriado-AAAA-MM-DD.\n3. Em Horários, crie uma exceção para o dia do feriado apontando para a URA de feriado.\n4. Ligue para o número principal e confira se toca o aviso.\n5. No LineChat, trave o bot com a mensagem de feriado (Chatbot › Mensagem de ausência).\n6. No dia seguinte, confira se voltou ao normal: a exceção só vale para o dia, mas o bot precisa ser destravado à mão.\n\nMarque cliente por cliente no projeto do feriado.',
      porQueAcontece: null,
      palavras: ['aviso de feriado', 'mensagem de feriado', 'fechado hoje'],
    },
    ligacoes: [['projeto', 'proj2'], ['assunto', 'URA - Ajuste'], ['produto', 'plinepbx'], ['produto', 'plinechat']],
    anexos: [{ ref: 'a1', fileName: 'texto-padrao-feriado.txt', mimeType: 'text/plain', conteudo: `data:text/plain;base64,${base64Utf8(TEXTO_FERIADO)}`, inline: false, sizeBytes: TEXTO_FERIADO.length }],
  });

  // BC-5 — nasceu do incidente da operadora; leitura obrigatória pedida ontem
  artigo({
    autor: 'u2', dias: 11, publicado: true,
    texto: {
      titulo: 'Tronco caiu: as ligações de entrada não chegam',
      oQueAcontece: 'Vários clientes ao mesmo tempo dizem que ninguém consegue ligar para eles: dá "número não existe", fora de área, ou cai direto. As ligações de saída às vezes continuam funcionando.',
      comoResolver: '1. Veja se é um cliente só ou vários do mesmo tronco: abra Circuitos e DIDs e procure o circuito do número que não recebe.\n2. No servidor, confira se o tronco está registrado:\n`asterisk -rx "pjsip show registrations"`\n3. Teste o IP de sinalização da operadora (está na ficha do circuito):\n`ping -c 5 IP-DE-SINALIZACAO`\n4. Se não registra ou não responde, abra chamado na operadora pelo número-chave do circuito e anote o protocolo.\n5. Avise os clientes afetados: o problema é da operadora e já tem protocolo.\n6. Quando voltar, faça uma ligação de entrada de teste para cada cliente.',
      porQueAcontece: 'Quando a operadora tem problema na rede dela, o tronco para de receber as ligações. Do nosso lado não há o que consertar: o que dá para fazer é confirmar rápido, abrir o chamado com protocolo e avisar os clientes.',
      palavras: ['ninguém consegue ligar', 'número não existe', 'fora de área', 'só cai na caixa'],
    },
    ligacoes: [['operadora', 'carALGAR'], ['assunto', 'Tronco - Queda'], ['chamado', incidente?.id ?? null]],
    obrigatoria: { por: 'u1', dias: 1, leram: [['u2', 1]] },
  });

  // BC-6 a BC-8 — os de todo dia
  artigo({
    autor: 'u3', dias: 9, publicado: true,
    texto: {
      titulo: 'Omniboard: o agente não consegue pegar a chamada da fila',
      oQueAcontece: 'A chamada aparece na fila do Omniboard, o agente clica em "Pegar" e nada acontece — ou a chamada vai para outro agente.',
      comoResolver: '1. Confira se o agente está logado na fila: o nome dele precisa aparecer em "Agentes da fila".\n2. Veja se ele não está em pausa — pausa esquecida é o caso mais comum.\n3. Confira se o ramal do agente no Omniboard é o mesmo do telefone dele.\n4. Peça para o agente sair e entrar de novo no Omniboard.\n5. Se ainda não pegar, confira a fila no servidor:\n`asterisk -rx "queue show"`',
      porQueAcontece: 'O Omniboard só entrega a chamada para o ramal que está na fila e livre. Agente em pausa, ou com o ramal trocado, não recebe — mesmo vendo a chamada na tela.',
      palavras: ['não consigo pegar a ligação', 'botão pegar não funciona', 'chamada vai pra outro'],
    },
    ligacoes: [['modulo', 'mlinepbx_omniboard'], ['assunto', 'Omniboard - configuração'], ['cliente', cli('Home Care Viver Bem')]],
  });
  artigo({
    autor: 'u2', dias: 18, publicado: true,
    texto: {
      titulo: 'DP722 (sem fio) perde o registro longe da base',
      oQueAcontece: 'O ramal sem fio funciona perto da base, mas em algumas salas fica "Fora de alcance" ou derruba a ligação no meio.',
      comoResolver: '1. Veja onde está a base: ela precisa ficar no alto, longe de parede de concreto, micro-ondas e rack.\n2. Ande com o telefone pelo caminho que o cliente faz, olhando as barrinhas de sinal.\n3. Se o sinal cair abaixo de 2 barras num lugar que o cliente usa, a solução é um repetidor — passe o orçamento.\n4. Depois de mudar a base de lugar, registre o telefone de novo: Menu › Registro › Registrar na base.',
      porQueAcontece: 'O sem fio tem bom alcance em área aberta, mas parede grossa e metal derrubam o sinal. Não é defeito do aparelho.',
      palavras: ['fora de alcance', 'sem fio cai', 'telefone sem fio desliga'],
    },
    ligacoes: [['modelo', modelo('dp722')], ['cliente', cli('Hospital Vale Verde')]],
  });
  artigo({
    autor: 'u3', dias: 5, publicado: true,
    texto: {
      titulo: 'LineChat: o bot parou de responder depois de trocar o template',
      oQueAcontece: 'Depois de mexer no template de mensagem, o cliente manda mensagem e o bot não responde nada — nem a mensagem de boas-vindas.',
      comoResolver: '1. No LineChat, abra Chatbot e veja se o fluxo está "Ativo": salvar o template às vezes desativa o fluxo.\n2. Confira se o template novo foi aprovado pela Meta (aparece "Aprovado" em Templates). Template em análise não sai.\n3. Ative o fluxo de novo e mande uma mensagem de teste do seu celular.\n4. Se o cliente trocou o texto da primeira mensagem, ajuste o fluxo para usar o template novo.',
      porQueAcontece: 'O fluxo do bot aponta para o template pelo nome. Template trocado e ainda não aprovado faz o fluxo parar sem avisar.',
      palavras: ['bot não responde', 'robô parou', 'whatsapp não responde'],
    },
    ligacoes: [['produto', 'plinechat'], ['assunto', 'Linechat - Alteração Chatbot'], ['cliente', cli('Distribuidora Norte')]],
  });

  // dois rascunhos: o da Marina e o do Lúcio (só eles e quem cuida da base veem)
  artigo({
    autor: 'u3', dias: 2, publicado: false,
    texto: {
      titulo: 'FOP2 não mostra se o ramal está ocupado',
      oQueAcontece: 'No FOP2 da Clínica Aurora, todos os ramais aparecem livres, mesmo com gente falando.',
      comoResolver: '1. Reiniciar o FOP2 resolveu da primeira vez, mas voltou no dia seguinte.\n2. [completar: ver com o Lúcio o que ele mudou no servidor]',
      porQueAcontece: null, palavras: ['fop não atualiza'],
    },
    ligacoes: [['modulo', 'mlinepbx_fop2'], ['cliente', cli('Clínica Aurora')]],
  });
  artigo({
    autor: 'u2', dias: 1, publicado: false,
    texto: {
      titulo: 'Fila toca no ramal errado depois de mudar o horário de atendimento',
      oQueAcontece: 'Depois de mudar o horário da fila, as ligações começaram a tocar no ramal da recepção em vez de nos atendentes.',
      comoResolver: null, porQueAcontece: null, palavras: [],
    },
    ligacoes: [['assunto', 'LinePBX - Fila - Configuração'], ['cliente', cli('Distribuidora Norte')]],
  });

  // comentários (pedido do Luan na prévia): o que a equipe viu depois, sem mexer no texto
  const comentario = (numero: number, userId: string, dias: number, hora: number, texto: string) => {
    const a = S.artigos.find((x) => x.numero === numero);
    if (a) S.artComentarios.push({ id: id(), articleId: a.id, userId, texto, em: daysAgo(dias, hora), deletedAt: null });
  };
  comentario(1, 'u3', 4, 11, 'Aconteceu de novo no Supermercado Bom Preço depois da troca do roteador da operadora. Era o SIP ALG outra vez: no roteador novo a opção fica em Avançado › NAT.');
  comentario(1, 'u2', 2, 16, 'No Mikrotik não aparece "SIP ALG": é IP › Firewall › Service Ports › sip, desmarcar. Depois disso o áudio voltou dos dois lados.');
  comentario(5, 'u3', 11, 10, 'Na última queda a operadora levou duas horas para responder. Vale abrir o protocolo logo no primeiro chamado, antes de testar ramal por ramal.');
}

const artigosVivosDemo = () => { semearBase(); return S.artigos.filter((a) => !a.deletedAt); };
const podeCuidarDemo = () => temPerm('knowledge.manage');
const artigoVisivelDemo = (a: ArtRow) => a.situacao === 'publicado' || a.autorId === S.me?.id || podeCuidarDemo();
const nomeDaPessoaDemo = (uid: string | null) => (uid ? S.users.find((u) => u.id === uid)?.name ?? null : null);
const ligacoesDoArtigoDemo = (articleId: string): LigacaoArtigo[] => S.artLigacoes.filter((l) => l.articleId === articleId).map((l) => ({ tipo: l.tipo, alvo: l.alvo }));
const valoresDoCampo = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : v == null || v === '' ? [] : [String(v)]).filter(Boolean);

/** "12" ou "BC-12" → o artigo (rascunho de outra pessoa é como se não existisse). */
function artigoDemoOu404(p: number | string): ArtRow {
  const m = /^(?:bc-?)?(\d{1,7})$/i.exec(String(p).trim());
  const a = m ? artigosVivosDemo().find((x) => x.numero === Number(m[1])) : undefined;
  if (!a || !artigoVisivelDemo(a)) throw notFound('Artigo');
  return a;
}

/** Um card inventado, pelo id ou pelo código (IS-3607, sem ligar para maiúscula). */
function cardDemo(ref: string): Chamado | null {
  const r = ref.trim();
  const { cards } = chamadosDemo();
  return cards.find((c) => c.id === r) ?? cards.find((c) => (c.key ?? '').toUpperCase() === r.toUpperCase()) ?? null;
}

/** O nome de cada coisa ligada (e para onde a etiqueta leva), como o servidor monta. */
function mostrarLigacaoDemo(l: LigacaoArtigo): LigacaoMostrada {
  const b = { tipo: l.tipo, alvo: l.alvo };
  const falta = { ...b, nome: NAO_EXISTE, extra: null, href: null, existe: false };
  switch (l.tipo) {
    case 'produto': { const p = S.products.find((x) => x.id === l.alvo); return p ? { ...b, nome: p.name, extra: null, href: null, existe: !p.deletedAt } : falta; }
    case 'modulo': { const m = S.modules.find((x) => x.id === l.alvo); return m ? { ...b, nome: m.name, extra: S.products.find((p) => p.id === m.productId)?.name ?? null, href: null, existe: !m.deletedAt } : falta; }
    case 'cliente': { const c = S.clients.find((x) => x.id === l.alvo); return c ? { ...b, nome: c.tradeName, extra: null, href: `/clientes/${c.id}`, existe: !c.deletedAt } : falta; }
    case 'modelo': { const m = S.models.find((x) => x.id === l.alvo); return m ? { ...b, nome: m.name, extra: null, href: null, existe: !m.deletedAt } : falta; }
    case 'operadora': { const o = S.carriers.find((x) => x.id === l.alvo); return o ? { ...b, nome: o.name, extra: null, href: null, existe: true } : falta; }
    case 'projeto': { const p = S.projetos.find((x) => x.id === l.alvo); return p ? { ...b, nome: p.name, extra: null, href: `/projetos/${p.id}`, existe: !p.deletedAt } : falta; }
    case 'chamado': { const c = chamadosDemo().cards.find((x) => x.id === l.alvo); return c ? { ...b, nome: c.key ?? 'Chamado', extra: c.title || null, href: linkDemo(c) || null, existe: true } : falta; }
    case 'assunto': return { ...b, nome: l.alvo, extra: null, href: null, existe: true };
  }
}

/** Cada ligação precisa apontar para algo que existe; o chamado pode vir pelo código (IS-3607). */
function conferirLigacoesDemo(ligacoes: LigacaoArtigo[]): LigacaoArtigo[] {
  const out = new Map<string, LigacaoArtigo>();
  const vivo = (ok: boolean, nome: string) => { if (!ok) throw bad(`${nome} ligado ao artigo não existe (ou está na lixeira).`); };
  for (const l0 of ligacoes) {
    const l: LigacaoArtigo = { tipo: l0.tipo, alvo: l0.alvo.trim() };
    if (l.tipo === 'produto') vivo(S.products.some((x) => x.id === l.alvo && !x.deletedAt), 'Um produto');
    else if (l.tipo === 'modulo') vivo(S.modules.some((x) => x.id === l.alvo && !x.deletedAt), 'Um módulo');
    else if (l.tipo === 'cliente') vivo(S.clients.some((x) => x.id === l.alvo && !x.deletedAt), 'Um cliente');
    else if (l.tipo === 'modelo') vivo(S.models.some((x) => x.id === l.alvo && !x.deletedAt), 'Um modelo');
    else if (l.tipo === 'operadora') vivo(S.carriers.some((x) => x.id === l.alvo), 'Uma operadora');
    else if (l.tipo === 'projeto') vivo(projetosVivos().some((x) => x.id === l.alvo), 'Um projeto');
    else if (l.tipo === 'chamado') { const c = cardDemo(l.alvo); if (!c) throw bad(`O chamado ${l.alvo} não está na cópia do LineChat.`); l.alvo = c.id; }
    out.set(`${l.tipo}:${l.alvo}`, l);
  }
  return [...out.values()];
}

const paraBuscaDemo = (a: ArtRow) => ({
  a, numero: a.numero, titulo: a.titulo, oQueAcontece: a.oQueAcontece, comoResolver: a.comoResolver, porQueAcontece: a.porQueAcontece, palavrasDoCliente: a.palavras,
  nomesLigados: ligacoesDoArtigoDemo(a.id).map((l) => { const m = mostrarLigacaoDemo(l); return m.nome === NAO_EXISTE ? l.alvo : [m.nome, m.extra].filter(Boolean).join(' '); }),
});

/** Esta pessoa já leu (depois do pedido de leitura)? */
const lidaPorMimDemo = (a: ArtRow) => !!a.obrigatoriaDesde && S.artLeituras.some((r) => r.articleId === a.id && r.userId === S.me?.id && r.em >= a.obrigatoriaDesde!);

function resumoDemo(a: ArtRow): string | null {
  const t = textoPuro(a.oQueAcontece) || textoPuro(a.comoResolver);
  if (!t) return null;
  const linha = t.replace(/\s+/g, ' ').trim();
  return linha.length > 200 ? `${linha.slice(0, 200).replace(/\s+\S*$/, '')}…` : linha;
}

function itemDaBaseDemo(a: ArtRow, trecho: PedacoTrecho[] | null): ArtigoNaLista {
  return {
    id: a.id, numero: a.numero, codigo: codigoDoArtigo(a.numero), titulo: a.titulo, situacao: a.situacao,
    obrigatoria: !!a.obrigatoriaDesde, lidaPorMim: a.obrigatoriaDesde ? lidaPorMimDemo(a) : null,
    autor: nomeDaPessoaDemo(a.autorId), atualizadoPor: nomeDaPessoaDemo(a.atualizadoPorId),
    atualizadoEm: a.atualizadoEm, publicadoEm: a.publicadoEm,
    ligacoes: ligacoesDoArtigoDemo(a.id).map(mostrarLigacaoDemo), trecho, resumo: resumoDemo(a),
    comentarios: S.artComentarios.filter((c) => c.articleId === a.id && !c.deletedAt).length,
  };
}

function artigoInteiroDemo(a: ArtRow): Artigo {
  const ativos = S.users.filter((u) => u.active);
  return {
    id: a.id, numero: a.numero, codigo: codigoDoArtigo(a.numero), titulo: a.titulo,
    oQueAcontece: a.oQueAcontece, comoResolver: a.comoResolver, porQueAcontece: a.porQueAcontece, palavrasDoCliente: a.palavras,
    situacao: a.situacao, versao: a.versao,
    autor: a.autorId ? { id: a.autorId, nome: nomeDaPessoaDemo(a.autorId) ?? '—' } : null,
    atualizadoPor: nomeDaPessoaDemo(a.atualizadoPorId),
    criadoEm: a.criadoEm, atualizadoEm: a.atualizadoEm, publicadoEm: a.publicadoEm,
    ligacoes: ligacoesDoArtigoDemo(a.id).map(mostrarLigacaoDemo),
    // na prévia o arquivo fica embutido: a "url" já é a imagem (como a logo do cliente)
    anexos: S.artAnexos.filter((x) => x.articleId === a.id && !x.deletedAt).sort((x, y) => x.criadoEm.localeCompare(y.criadoEm))
      .map((x) => ({ id: x.id, fileName: x.fileName, mimeType: x.mimeType, sizeBytes: x.sizeBytes, inline: x.inline, createdAt: x.criadoEm, url: x.conteudo })),
    obrigatoria: a.obrigatoriaDesde ? {
      desde: a.obrigatoriaDesde, por: nomeDaPessoaDemo(a.obrigatoriaPor), lidaPorMim: lidaPorMimDemo(a),
      lidos: ativos.filter((u) => S.artLeituras.some((r) => r.articleId === a.id && r.userId === u.id && r.em >= a.obrigatoriaDesde!)).length,
      pessoas: ativos.length,
    } : null,
    // do mais novo para o mais antigo, como no servidor
    comentarios: S.artComentarios.filter((c) => c.articleId === a.id && !c.deletedAt).sort((x, y) => y.em.localeCompare(x.em))
      .map((c) => ({ id: c.id, texto: c.texto, autor: nomeDaPessoaDemo(c.userId) ?? '—', em: c.em, podeApagar: temPerm('knowledge.write') && (c.userId === S.me?.id || podeCuidarDemo()) })),
    podeEditar: temPerm('knowledge.write'),
    podeApagar: temPerm('knowledge.write') && (a.autorId === S.me?.id || podeCuidarDemo()),
    podeCuidar: podeCuidarDemo(),
    podeComentar: temPerm('knowledge.write'),
  };
}

/** O "pedir a leitura da equipe" do formulário: só quem cuida da base, e só junto com o publicar. */
function conferirPedidoDeLeituraDemo(d: ArtigoGravar, publicado: boolean) {
  if (!d.pedirLeitura) return;
  if (!podeCuidarDemo()) throw new ApiError(403, 'Só quem cuida da base pode pedir a leitura obrigatória da equipe.');
  if (!publicado) throw bad('A leitura da equipe é pedida ao publicar: o rascunho só você vê.');
}
const pediuLeituraDemo = (a: ArtRow) => `Pediu a leitura obrigatória de ${codigoDoArtigo(a.numero)} "${a.titulo}"`;

/** O texto como fica guardado: quebras de linha do jeito Unix, sem espaço sobrando no fim; vazio = nada. */
const limpoDemo = (t: string | null | undefined) => { const s = (t ?? '').replace(/\r\n?/g, '\n').replace(/[ \t]+$/gm, '').replace(/^\n+|\s+$/g, ''); return s || null; };
const unicosDemo = (xs: string[]) => [...new Map(xs.map((x) => x.trim()).filter(Boolean).map((x) => [x.toLowerCase(), x])).values()];
const textoDoFormularioDemo = (d: ArtigoGravar) => ({
  titulo: d.titulo.trim(), oQueAcontece: limpoDemo(d.oQueAcontece), comoResolver: limpoDemo(d.comoResolver), porQueAcontece: limpoDemo(d.porQueAcontece), palavras: unicosDemo(d.palavrasDoCliente),
});
const textoIgualDemo = (a: Pick<ArtRow, 'titulo' | 'oQueAcontece' | 'comoResolver' | 'porQueAcontece' | 'palavras'>, b: typeof a) =>
  a.titulo === b.titulo && a.oQueAcontece === b.oQueAcontece && a.comoResolver === b.comoResolver && a.porQueAcontece === b.porQueAcontece && JSON.stringify(a.palavras) === JSON.stringify(b.palavras);

/** Lê os arquivos novos (sem gravar ainda): o print só pode ser imagem que o navegador desenha sem rodar nada. */
function lerAnexosNovosDemo(novos: ArtigoGravar['anexosNovos']) {
  return novos.map((n) => {
    const m = /^data:([^;]+);base64,(.+)$/s.exec(n.conteudo);
    if (!m) throw bad('Não consegui ler esse arquivo');
    const sizeBytes = Math.floor((m[2]!.length * 3) / 4);
    if (sizeBytes > 10 * 1024 * 1024) throw bad('Arquivo muito grande (máximo 10 MB)');
    const mimeType = m[1]!.toLowerCase();
    if (n.inline && !IMAGENS_DO_TEXTO_DEMO.includes(mimeType)) throw bad('No meio do texto só entra imagem PNG, JPG, WEBP ou GIF. Mande outros arquivos como anexo.');
    return { ref: n.ref, id: id(), fileName: n.fileName, mimeType, sizeBytes, conteudo: n.conteudo, inline: n.inline };
  });
}
type TextoGuardado = Pick<ArtRow, 'titulo' | 'oQueAcontece' | 'comoResolver' | 'porQueAcontece' | 'palavras'>;
const comIdsDemo = <T extends TextoGuardado>(t: T, ids: Record<string, string>): T => ({
  ...t, oQueAcontece: trocarMarcadores(t.oQueAcontece, ids), comoResolver: trocarMarcadores(t.comoResolver, ids), porQueAcontece: trocarMarcadores(t.porQueAcontece, ids),
});
/** Print citado no texto precisa ser deste artigo (ou ter acabado de chegar junto). */
function conferirPrintsDemo(articleId: string, t: TextoGuardado, chegando: string[]) {
  const citados = [...new Set([t.oQueAcontece, t.comoResolver, t.porQueAcontece].flatMap((x) => printsDoTexto(x)))];
  const existem = new Set([...S.artAnexos.filter((x) => x.articleId === articleId).map((x) => x.id), ...chegando]);
  if (citados.some((c) => !existem.has(c))) throw bad('O texto cita um print que não chegou. Cole a imagem de novo.');
}
function gravarVersaoDemo(a: ArtRow, nota: string | null = null) {
  S.artVersoes.push({ articleId: a.id, versao: a.versao, titulo: a.titulo, oQueAcontece: a.oQueAcontece, comoResolver: a.comoResolver, porQueAcontece: a.porQueAcontece, palavras: [...a.palavras], nota, porId: S.me!.id, em: now() });
}
const textoDaVersaoDemo = (v: ArtVersaoRow): TextoVersao => ({ versao: v.versao, titulo: v.titulo, oQueAcontece: v.oQueAcontece, comoResolver: v.comoResolver, porQueAcontece: v.porQueAcontece, palavrasDoCliente: v.palavras });

// ---------- Portal do cliente (1.8) ----------
//
// As mesmas regras do servidor (`apps/api/src/services/portal.ts`), com as contas do
// `@gestor/shared/portal.ts`: entra quem está ativo, já criou a senha e é de um cliente na base;
// cada cliente vê os tutoriais "Geral" e os dos produtos (e módulos) que tem. Na prévia, a sessão
// do cliente é separada da da equipe (`S.portalSessao`) — dá para abrir os dois lados.

/** O print de exemplo: as teclas do telefone, com o TRANSF em destaque. */
const PRINT_TECLAS = svgDemo(560, 170, [
  '<rect width="560" height="170" rx="14" fill="#e2e8f0"/>',
  '<rect x="20" y="16" width="520" height="70" rx="8" fill="#1f2937"/><text x="280" y="46" font-size="16" fill="#fff" text-anchor="middle" font-weight="bold">Em ligação</text><text x="280" y="70" font-size="14" fill="#cbd5e1" text-anchor="middle">(71) 3020-0000 · 00:42</text>',
  ...['Espera', 'TRANSF', 'Conf', 'Encerrar'].map((k, i) => `<rect x="${20 + i * 132}" y="104" width="120" height="44" rx="8" fill="${k === 'TRANSF' ? '#fde68a' : '#f8fafc'}" stroke="${k === 'TRANSF' ? '#f59e0b' : '#cbd5e1'}" stroke-width="${k === 'TRANSF' ? 4 : 1}"/><text x="${80 + i * 132}" y="132" font-size="15" text-anchor="middle" fill="#111827"${k === 'TRANSF' ? ' font-weight="bold"' : ''}>${k}</text>`),
].join(''));

/** O print de exemplo: o aplicativo de ramal no celular, preenchido (sem a senha). */
const PRINT_APP = svgDemo(300, 420, [
  '<rect width="300" height="420" rx="26" fill="#0f172a"/><rect x="12" y="14" width="276" height="392" rx="18" fill="#f8fafc"/>',
  '<text x="150" y="52" font-size="16" text-anchor="middle" font-weight="bold" fill="#111827">Usar conta SIP</text>',
  ...[['Usuário', '2041'], ['Domínio', 'aurora.linepbx.com.br'], ['Senha', '••••••••'], ['Nome', 'Recepção'], ['Transporte', 'UDP']]
    .map(([k, v], i) => `<text x="30" y="${92 + i * 56}" font-size="11" fill="#64748b">${k}</text><rect x="30" y="${98 + i * 56}" width="240" height="30" rx="6" fill="#fff" stroke="#cbd5e1"/><text x="40" y="${118 + i * 56}" font-size="13" fill="#111827">${v}</text>`),
  '<rect x="30" y="374" width="240" height="22" rx="11" fill="#1d4ed8"/><text x="150" y="389" font-size="12" text-anchor="middle" fill="#fff" font-weight="bold">Entrar</text>',
].join(''));

/** O print de exemplo: o painel do FOP2 (verde livre, vermelho em ligação). */
const PRINT_FOP2 = svgDemo(560, 230, [
  '<rect width="560" height="230" fill="#f1f5f9"/><rect width="560" height="34" fill="#334155"/><text x="14" y="23" font-size="14" fill="#fff" font-weight="bold">FOP2 · Ramais</text>',
  ...[['201', 'Recepção', 1], ['202', 'Financeiro', 0], ['203', 'Dra. Ana', 0], ['204', 'Enfermagem', 1], ['205', 'Raio-X', 0], ['206', 'Laboratório', 0], ['207', 'Diretoria', 1], ['208', 'Compras', 0]]
    .map(([n, nome, ocupado], i) => {
      const x = 14 + (i % 4) * 136; const y = 50 + Math.floor(i / 4) * 88;
      return `<rect x="${x}" y="${y}" width="126" height="76" rx="8" fill="${ocupado ? '#fee2e2' : '#dcfce7'}" stroke="${ocupado ? '#ef4444' : '#22c55e'}" stroke-width="2"/><text x="${x + 10}" y="${y + 24}" font-size="15" font-weight="bold" fill="#111827">${n}</text><text x="${x + 10}" y="${y + 44}" font-size="12" fill="#334155">${nome}</text><text x="${x + 10}" y="${y + 64}" font-size="11" fill="${ocupado ? '#b91c1c' : '#15803d'}">${ocupado ? 'em ligação' : 'livre'}</text>`;
    }),
].join(''));

/** O print de exemplo: a caixa de conversas do LineChat. */
const PRINT_CHAT = svgDemo(560, 250, [
  '<rect width="560" height="250" fill="#ffffff"/><rect width="190" height="250" fill="#f1f5f9"/>',
  ...[['Fernanda', 'Bom dia! Vocês abrem sábado?', 1], ['Roberto', 'Obrigado, deu certo', 0], ['Lúcia', 'Preciso da segunda via', 0]]
    .map(([nome, msg, sel], i) => `<rect x="0" y="${i * 62}" width="190" height="62" fill="${sel ? '#dbeafe' : 'none'}"/><text x="14" y="${i * 62 + 26}" font-size="13" font-weight="bold" fill="#111827">${nome}</text><text x="14" y="${i * 62 + 46}" font-size="11" fill="#475569">${msg}</text>`),
  '<rect x="206" y="18" width="250" height="40" rx="12" fill="#f1f5f9"/><text x="218" y="43" font-size="12" fill="#111827">Bom dia! Vocês abrem sábado?</text>',
  '<rect x="300" y="74" width="244" height="40" rx="12" fill="#1d4ed8"/><text x="312" y="99" font-size="12" fill="#fff">Abrimos sim, das 8h às 12h 😊</text>',
  '<rect x="206" y="196" width="270" height="36" rx="10" fill="#fff" stroke="#cbd5e1"/><text x="218" y="219" font-size="12" fill="#94a3b8">Escreva a resposta…</text>',
  '<rect x="484" y="196" width="60" height="36" rx="10" fill="#f59e0b"/><text x="514" y="219" font-size="11" text-anchor="middle" fill="#111827" font-weight="bold">Transferir</text>',
].join(''));

function semearPortal() {
  if (S.portalSemeado) return;
  S.portalSemeado = true;
  const cli = (nome: string) => S.clients.find((c) => c.tradeName === nome)?.id ?? null;
  const arquivo = (tipo: TipoArquivoPortal, nome: string, mimeType: string, tamanho: number, url: string, dias: number): string => {
    const a: ArqPortalRow = { id: id(), tutorialId: null, tipo, nome, mimeType, tamanho, url, porId: 'u2', criadoEm: daysAgo(dias), deletedAt: null };
    S.arqPortal.push(a);
    return a.id;
  };
  const video = arquivo('video', 'transferir-uma-ligacao.mp4', 'video/mp4', Math.round(VIDEO_TRANSFERIR.length * 0.75), VIDEO_TRANSFERIR, 9);
  const teclas = arquivo('imagem', 'teclas-do-telefone.png', 'image/png', 24_000, PRINT_TECLAS, 9);
  const app = arquivo('imagem', 'linphone-conta-sip.png', 'image/png', 31_000, PRINT_APP, 20);
  const manual = arquivo('arquivo', 'Manual rápido do ramal.pdf', 'application/pdf', Math.round(PDF_MANUAL_RAMAL.length * 0.75), PDF_MANUAL_RAMAL, 20);
  const fop2 = arquivo('imagem', 'fop2-painel.png', 'image/png', 28_000, PRINT_FOP2, 15);
  const chat = arquivo('imagem', 'linechat-conversas.png', 'image/png', 26_000, PRINT_CHAT, 6);
  const tutorial = (o: Pick<TutorialRow, 'titulo' | 'resumo' | 'texto' | 'produtoId' | 'moduloId'> & { destaque?: boolean; publicado?: boolean; autor: string; dias: number; views: number; editado?: number }) => {
    const t: TutorialRow = {
      id: id(), numero: S.proximoTutorial++, titulo: o.titulo, resumo: o.resumo, texto: o.texto, produtoId: o.produtoId, moduloId: o.moduloId,
      destaque: !!o.destaque, situacao: o.publicado === false ? 'rascunho' : 'publicado', versao: o.editado != null ? 2 : 1, views: o.views,
      autorId: o.autor, atualizadoPorId: o.autor, publicadoEm: o.publicado === false ? null : daysAgo(o.dias, 10), criadoEm: daysAgo(o.dias, 9),
      atualizadoEm: o.editado != null ? daysAgo(o.editado, 16) : daysAgo(o.dias, 10), deletedAt: null,
    };
    S.tutoriais.push(t);
    for (const a of S.arqPortal) if (!a.tutorialId && arquivosDoTexto(t.texto).includes(a.id)) a.tutorialId = t.id;
  };
  tutorial({
    titulo: 'Como abrir um chamado com o suporte', resumo: 'O jeito mais rápido de a gente resolver: o que mandar e por onde.', produtoId: null, moduloId: null,
    texto: '1. Mande uma mensagem no WhatsApp do suporte (o botão "Falar com o suporte", aqui na página).\n2. Diga o nome da empresa, o ramal (ou o número) com problema e o que está acontecendo.\n3. Se puder, mande um print ou um vídeo curto da tela: ajuda muito.\n\n- Telefone sem linha? Diga se a luz do cabo de rede está acesa.\n- Ligação caindo? Diga o horário e o número de quem ligou.\n\nVocê recebe o número do chamado (IS-1234) para acompanhar.',
    destaque: true, autor: 'u1', dias: 30, views: 41,
  });
  tutorial({
    titulo: 'Como transferir uma ligação', resumo: 'Passe a ligação para outro ramal sem derrubar, em 3 toques.', produtoId: 'plinepbx', moduloId: null,
    texto: `Assista (10 segundos):\n[video:${video}]\n\n1. Com a ligação em andamento, aperte TRANSF.\n[print:${teclas}]\n2. Digite o número do ramal (por exemplo, 204).\n3. Aperte TRANSF de novo. Pronto: a ligação já está com o outro ramal.\n\nQuer falar antes com a pessoa do outro ramal? Aperte TRANSF, digite o ramal e espere ela atender; depois aperte TRANSF de novo.`,
    destaque: true, autor: 'u2', dias: 9, views: 58,
  });
  tutorial({
    titulo: 'Como puxar uma ligação que está tocando em outro ramal', resumo: 'Atenda do seu ramal a ligação que toca na mesa ao lado.', produtoId: 'plinepbx', moduloId: null,
    texto: '1. Tire o telefone do gancho (ou aperte o viva-voz).\n2. Digite *8 e o número do ramal que está tocando:\n`*8204`\n3. A ligação vem para você.\n\nPara puxar qualquer ligação do seu grupo, sem saber o ramal, digite só *8.',
    autor: 'u3', dias: 25, views: 23,
  });
  tutorial({
    titulo: 'Usar o seu ramal no celular', resumo: 'Atenda e faça ligações do ramal pelo celular, com o aplicativo Linphone.', produtoId: 'plinepbx', moduloId: null,
    texto: `1. Instale o aplicativo Linphone (Android ou iPhone).\n2. Abra e toque em "Usar conta SIP".\n3. Preencha com os dados do seu ramal (a Ingline manda para você):\n[print:${app}]\n4. Toque em Entrar. Quando aparecer "Conectado", é só ligar.\n\nOs atalhos do dia a dia estão no manual:\n[arquivo:${manual}]`,
    autor: 'u2', dias: 20, views: 17, editado: 4,
  });
  tutorial({
    titulo: 'FOP2: ver quem está em ligação e transferir arrastando', resumo: 'O painel mostra cada ramal: verde está livre, vermelho em ligação.', produtoId: 'plinepbx', moduloId: 'mlinepbx_fop2',
    texto: `1. Abra o FOP2 no navegador e entre com o seu ramal.\n2. Cada quadradinho é um ramal: verde está livre, vermelho está em ligação.\n[print:${fop2}]\n3. Para transferir, arraste a ligação até o ramal de destino.`,
    autor: 'u2', dias: 15, views: 12,
  });
  tutorial({
    titulo: 'Omniboard: entrar na fila e fazer uma pausa', resumo: 'Comece o turno na fila e pause sem perder ligação.', produtoId: 'plinepbx', moduloId: 'mlinepbx_omniboard',
    texto: '1. Entre no Omniboard com o seu usuário.\n2. Clique em "Entrar na fila": o seu nome aparece em "Agentes da fila".\n3. Para pausar (almoço, reunião), clique em "Pausa" e escolha o motivo.\n4. Na volta, clique em "Voltar da pausa". Pausa esquecida é o motivo nº 1 de "a ligação não chega para mim".',
    autor: 'u3', dias: 12, views: 9,
  });
  tutorial({
    titulo: 'LineChat: responder e transferir uma conversa', resumo: 'Responda pelo computador ou pelo celular e passe a conversa para outra pessoa.', produtoId: 'plinechat', moduloId: null,
    texto: `1. Abra o LineChat e escolha a conversa na coluna da esquerda.\n2. Escreva a resposta e aperte Enter.\n[print:${chat}]\n3. Para passar a conversa para outra pessoa, clique em "Transferir" e escolha o atendente ou o setor.`,
    destaque: true, autor: 'u3', dias: 6, views: 14,
  });
  tutorial({
    titulo: 'Ouvir e baixar a gravação de uma ligação', resumo: 'Ache a ligação pelo dia e pelo número, e baixe o áudio.', produtoId: 'plinereports', moduloId: null,
    texto: '1. Entre no LineReports e clique em "Gravações".\n2. Escolha o dia e, se quiser, escreva o número de quem ligou.\n3. Clique no ▶ para ouvir, ou no botão de baixar para guardar o áudio.\n\nA gravação fica guardada pelo tempo do seu contrato.',
    autor: 'u1', dias: 18, views: 7,
  });
  tutorial({
    titulo: 'URA de feriado: como pedir a mensagem', resumo: null, produtoId: 'plinepbx', moduloId: null,
    texto: '1. Mande o texto da mensagem com 5 dias de antecedência.\n2. [completar: o modelo de texto que a locutora usa]', publicado: false, autor: 'u3', dias: 2, views: 0,
  });

  // quem tem acesso (a senha das pessoas da prévia é "demo", como a da equipe)
  const acesso = (clienteNome: string, nome: string, email: string, o: Partial<AcessoRow>) => {
    const clienteId = cli(clienteNome);
    if (!clienteId) return;
    S.acessosPortal.push({ id: id(), clienteId, nome, email, senha: 'demo', ativo: true, conviteCodigo: null, conviteVence: null, ultimoAcesso: daysAgo(2, 15), acessos: 6, criadoPorId: 'u1', criadoEm: daysAgo(20), ...o });
  };
  acesso('Clínica Aurora', 'Maria Souza', 'maria@clinicaaurora.com.br', { acessos: 14 });
  acesso('Clínica Aurora', 'Recepção Aurora', 'recepcao@clinicaaurora.com.br', { senha: null, conviteCodigo: codigoDeConviteDemo(), conviteVence: daysAgo(-6, 12), ultimoAcesso: null, acessos: 0, criadoEm: daysAgo(1) });
  acesso('Hospital Vale Verde', 'Carlos Lima', 'carlos@hvaleverde.org.br', { acessos: 5, ultimoAcesso: daysAgo(6, 9) });
  acesso('Distribuidora Norte', 'Joana Prado', 'joana@distnorte.com.br', { ativo: false, acessos: 3, ultimoAcesso: daysAgo(40, 9) });
  acesso('Farmácia Central (arquivada)', 'Pedro Alves', 'pedro@centralfarma.com.br', { acessos: 21, ultimoAcesso: daysAgo(90, 9) });
}

const tutoriaisVivos = () => { semearPortal(); return S.tutoriais.filter((t) => !t.deletedAt); };
const acessosVivos = () => { semearPortal(); return S.acessosPortal; };
const ativosDoClienteDemo = (clienteId: string) => {
  const subs = activeSubs(clienteId);
  return { produtos: subs.map((s) => `p${s.productCode}`), modulos: subs.flatMap((s) => activeMods(s.id).map((m) => m.moduleId)) };
};
const situacaoClienteDemo = (clienteId: string) => {
  const c = S.clients.find((x) => x.id === clienteId);
  const dados = { arquivado: !!c?.archived, naLixeira: !!c?.deletedAt, produtosAtivos: activeSubs(clienteId).length };
  return { nome: c?.tradeName ?? '—', naBase: clienteNaBase(dados), motivo: motivoForaDaBase(dados) };
};
const produtoDemo = (pid: string | null) => { const p = pid ? S.products.find((x) => x.id === pid) : null; return p ? { id: p.id, nome: p.name, cor: p.color } : null; };
const cartaoDemo = (t: TutorialRow): CartaoTutorial => ({
  id: t.id, numero: t.numero, titulo: t.titulo, resumo: t.resumo, produto: produtoDemo(t.produtoId),
  modulo: t.moduloId ? { id: t.moduloId, nome: S.modules.find((m) => m.id === t.moduloId)?.name ?? '—' } : null,
  destaque: t.destaque, atualizadoEm: t.atualizadoEm, caminho: caminhoDoTutorial(t.numero, t.titulo),
});
const tutorialNaListaDemo = (t: TutorialRow): TutorialNaLista => ({
  ...cartaoDemo(t), situacao: t.situacao, visualizacoes: t.views, autor: nomeDaPessoaDemo(t.autorId), atualizadoPor: nomeDaPessoaDemo(t.atualizadoPorId),
});
const arquivoDemo = (a: ArqPortalRow): ArquivoDoPortal => ({ id: a.id, tipo: a.tipo, nome: a.nome, mimeType: a.mimeType, tamanho: a.tamanho, url: a.url });
const arquivosDoTutorialDemo = (t: TutorialRow) => S.arqPortal.filter((a) => a.tutorialId === t.id && !a.deletedAt).map(arquivoDemo);
const paraBuscaPortalDemo = (t: TutorialRow) => ({
  t, numero: t.numero, titulo: t.titulo, oQueAcontece: t.resumo, comoResolver: textoPuro(t.texto), porQueAcontece: null, palavrasDoCliente: [] as string[],
  nomesLigados: [produtoDemo(t.produtoId)?.nome ?? 'Geral', t.moduloId ? S.modules.find((m) => m.id === t.moduloId)?.name ?? '' : ''].filter(Boolean),
});
const acessoDemo = (a: AcessoRow): AcessoPortal => {
  const c = situacaoClienteDemo(a.clienteId);
  return {
    id: a.id, nome: a.nome, email: a.email, clienteId: a.clienteId, cliente: c.nome,
    situacao: situacaoDoAcesso({ ativo: a.ativo, temSenha: !!a.senha, conviteVenceEm: a.conviteVence }, c.naBase),
    motivo: c.naBase ? null : c.motivo, conviteVenceEm: a.conviteCodigo ? a.conviteVence : null,
    ultimoAcesso: a.ultimoAcesso, acessos: a.acessos, criadoPor: nomeDaPessoaDemo(a.criadoPorId), criadoEm: a.criadoEm,
  };
};
function tutorialDemoOu404(numero: number | string): TutorialRow {
  const n = typeof numero === 'number' ? numero : numeroDoCaminho(numero);
  const t = tutoriaisVivos().find((x) => x.numero === n);
  if (!t) throw notFound('Tutorial');
  return t;
}
/** Produto e módulo existem, e o módulo é do produto (como o servidor). */
function conferirProdutoDemo(d: TutorialGravar) {
  const produtoId = d.produtoId ?? null; const moduloId = d.moduloId ?? null;
  if (moduloId && !produtoId) throw bad('Escolha o produto do módulo.');
  if (produtoId && !S.products.some((p) => p.id === produtoId && !p.deletedAt)) throw bad('O produto escolhido não existe (ou está na lixeira).');
  if (moduloId && S.modules.find((m) => m.id === moduloId && !m.deletedAt)?.productId !== produtoId) throw bad('O módulo escolhido não é deste produto.');
  return { produtoId, moduloId };
}
function ligarArquivosDemo(t: TutorialRow) {
  const citados = arquivosDoTexto(t.texto);
  const existem = S.arqPortal.filter((a) => citados.includes(a.id) && !a.deletedAt);
  if (existem.length < citados.length) throw bad('O texto cita um arquivo que não chegou ao servidor. Suba o arquivo de novo.');
  for (const a of existem) if (!a.tutorialId) a.tutorialId = t.id;
}
const limpoPortalDemo = (t: string | null | undefined) => { const s = (t ?? '').replace(/\r\n?/g, '\n').replace(/[ \t]+$/gm, '').replace(/^\n+|\s+$/g, ''); return s || null; };
const codigoDeConviteDemo = () => `demo${id()}${id()}${id()}`.slice(0, 40);
/** A sessão do cliente na prévia: confere a cada pedido, como o servidor. */
function sessaoPortalDemo(): { a: AcessoRow; ativos: { produtos: string[]; modulos: string[] } } {
  const a = acessosVivos().find((x) => x.id === S.portalSessao);
  if (!a) throw new ApiError(401, 'Entre para ver');
  if (!a.ativo || !situacaoClienteDemo(a.clienteId).naBase) throw new ApiError(401, 'Seu acesso ao portal está suspenso. Fale com o suporte da Ingline.');
  return { a, ativos: ativosDoClienteDemo(a.clienteId) };
}
const euPortalDemo = (a: AcessoRow): EuPortal => {
  const c = S.clients.find((x) => x.id === a.clienteId);
  return { nome: a.nome, email: a.email, cliente: { nome: c?.tradeName ?? '—', logo: c?.logoUrl ?? null }, portal: S.ajustesPortal };
};
const visiveisDemo = (ativos: { produtos: string[]; modulos: string[] }) =>
  tutoriaisVivos().filter((t) => t.situacao === 'publicado' && tutorialValePara({ produtoId: t.produtoId, moduloId: t.moduloId }, ativos));
const lerArquivoDemo = (file: File) => new Promise<string>((ok, falhou) => { const r = new FileReader(); r.onload = () => ok(String(r.result)); r.onerror = () => falhou(bad('Não deu para ler o arquivo')); r.readAsDataURL(file); });

// ---------- a IA da base (1.8): as mesmas regras do servidor, sem IA de verdade ----------

const IA_DE_MENTIRA = 'Prévia: resposta montada sem IA de verdade';
const mesDemo = () => diaEmBrasilia(new Date()).slice(0, 7);
/** O que já se gastou com a IA no mês (zera quando o mês vira). */
function usoIaDemo() {
  if (S.ajustesIa.uso.mes !== mesDemo()) S.ajustesIa.uso = { mes: mesDemo(), perguntas: 0, rascunhos: 0, entrada: 0, saida: 0 };
  return S.ajustesIa.uso;
}
const ONDE_IA = 'Administração › Ajustes › IA da base';
/** A chave guardada serve para este provedor (e, no compatível, para este serviço)? Como no servidor. */
const chaveServeParaDemo = (provedor: ProvedorIa, endereco: string | null | undefined) => {
  const a = S.ajustesIa;
  return a.temChave && a.chaveDe === provedor && (provedor !== 'compativel' || (!!a.chaveEndereco && a.chaveEndereco === hostDoEndereco(endereco)));
};
const chaveServeDemo = () => chaveServeParaDemo(S.ajustesIa.provedor, S.ajustesIa.endereco);
const deQuemEaChaveDemo = () => (S.ajustesIa.chaveDe === 'compativel' && S.ajustesIa.chaveEndereco ? `de ${S.ajustesIa.chaveEndereco}` : INFO_PROVEDORES[S.ajustesIa.chaveDe ?? 'anthropic'].de);
/** A configuração guardada, conferida na mesma ordem do servidor (o teste usa mesmo desligada). */
function iaConfigDemo() {
  const a = S.ajustesIa;
  if (!a.temChave) throw bad(`A IA ainda não tem a chave. Quem administra escolhe o provedor e cola a chave em ${ONDE_IA}.`);
  if (a.provedor === 'compativel' && !enderecoValido(a.endereco)) throw bad(`Falta o endereço da API do serviço compatível em ${ONDE_IA}.`);
  if (!chaveServeDemo()) {
    const agora = a.provedor === 'compativel' ? hostDoEndereco(a.endereco) : INFO_PROVEDORES[a.provedor].nome;
    throw bad(`A chave guardada é ${deQuemEaChaveDemo()}, e o escolhido agora é ${agora}. Cole a chave dele em ${ONDE_IA}.`);
  }
  if (!a.modelo) throw bad(`Falta escolher o modelo da IA em ${ONDE_IA}.`);
}
function iaProntaDemo() {
  iaConfigDemo();
  if (!S.ajustesIa.ativo) throw bad(`A IA da base está desligada. Quem administra liga em ${ONDE_IA}.`);
}
/** 30 usos por pessoa por hora, como no servidor. */
const usosIaDemo = new Map<string, number[]>();
function limiteIaDemo() {
  const agora = Date.now();
  const recentes = (usosIaDemo.get(S.me!.id) ?? []).filter((t) => agora - t < 3_600_000);
  if (recentes.length >= 30) throw new ApiError(429, 'Você já usou a IA 30 vezes na última hora. Espere um pouco, ou procure na base.');
  recentes.push(agora); usosIaDemo.set(S.me!.id, recentes);
}
function statusIaDemo(): AjustesIa {
  const { temChave, uso: _uso, ...a } = S.ajustesIa;
  const uso = { ...usoIaDemo() };
  return { ...a, temChave, chaveDe: temChave ? a.chaveDe : null, chaveEndereco: temChave && a.chaveDe === 'compativel' ? a.chaveEndereco : null, uso: { ...uso, custo: custoEstimado(uso, a) } };
}

/**
 * Os modelos da "Buscar modelos" na prévia: listas de EXEMPLO (no sistema, a lista vem da API do
 * provedor, com a chave). A Maritaca não lista: é o caso de escrever o nome do modelo.
 */
function modelosDeExemplo(provedor: ProvedorIa, endereco: string | null | undefined): ModeloIa[] {
  const m = (id: string, nome = id) => ({ id, nome });
  if (provedor === 'anthropic') return [m('claude-fable-5-1', 'Claude Fable 5.1'), m('claude-opus-5-5', 'Claude Opus 5.5'), m('claude-sonnet-5-5', 'Claude Sonnet 5.5'), m('claude-haiku-5-5', 'Claude Haiku 5.5')];
  if (provedor === 'openai') return ['gpt-5.6-sol', 'gpt-5.6-terra', 'gpt-5.6-luna', 'gpt-5.4-mini', 'gpt-5.4-nano'].map((x) => m(x));
  if (provedor === 'google') return [m('gemini-3.6-flash', 'Gemini 3.6 Flash'), m('gemini-3.5-flash', 'Gemini 3.5 Flash'), m('gemini-3.5-flash-lite', 'Gemini 3.5 Flash-Lite'), m('gemini-3.1-pro-preview', 'Gemini 3.1 Pro Preview')];
  let host = '';
  try { host = new URL(normalizarEndereco(endereco)).hostname; } catch { /* o endereço já foi conferido */ }
  if (host.endsWith('openrouter.ai')) return [m('anthropic/claude-sonnet-5.5', 'Anthropic: Claude Sonnet 5.5'), m('openai/gpt-5.4-mini', 'OpenAI: GPT-5.4 Mini'), m('google/gemini-3.5-flash', 'Google: Gemini 3.5 Flash'), m('deepseek/deepseek-chat', 'DeepSeek: DeepSeek Chat')];
  if (host.endsWith('deepseek.com')) return [m('deepseek-chat'), m('deepseek-reasoner')];
  if (host.endsWith('groq.com')) return [m('llama-3.3-70b-versatile'), m('openai/gpt-oss-120b'), m('qwen/qwen3-32b')];
  if (host.endsWith('mistral.ai')) return [m('mistral-large-latest'), m('mistral-medium-latest'), m('mistral-small-latest')];
  if (host.endsWith('maritaca.ai')) throw bad('O serviço não mostrou a lista de modelos (ou o endereço está errado). Confira o endereço, ou escreva o nome do modelo.');
  if (host.endsWith('x.ai')) return [m('grok-4'), m('grok-3-mini')];
  return [m('modelo-de-exemplo', 'Modelo de exemplo')];
}

/**
 * "Perguntar à IA" na prévia: não há IA de verdade aqui. A resposta é montada com a mesma busca que
 * o servidor usa (o modo "alguma palavra") e os passos do artigo mais perto — para dar a ideia de como
 * fica, com as citações. No sistema, quem escreve a resposta é a IA escolhida em Ajustes.
 */
function respostaDemo(pergunta: string): RespostaIa {
  const quem = { modelo: IA_DE_MENTIRA, provedor: INFO_PROVEDORES[S.ajustesIa.provedor].nome, custo: null };
  const publicados = artigosVivosDemo().filter((a) => a.situacao === 'publicado').map(paraBuscaDemo);
  if (!publicados.length) {
    return { trechos: [{ texto: 'A base ainda não tem nenhum artigo publicado. Quando alguém resolver um chamado que deu trabalho, vale registrar: a próxima pergunta já acha.', fontes: [] }], artigos: [], achou: false, ...quem };
  }
  const achados = juntarAchados([buscarArtigos(publicados, pergunta, 'alguma')], 3);
  if (!achados.length) {
    return { trechos: [{ texto: 'Procurei na base e não achei nenhum artigo sobre isso. Quando alguém resolver, vale registrar: a próxima pergunta já acha.', fontes: [] }], artigos: [], achou: false, ...quem };
  }
  const [a, ...outros] = achados as [ReturnType<typeof paraBuscaDemo>, ...Array<ReturnType<typeof paraBuscaDemo>>];
  const trechos: RespostaIa['trechos'] = [{ texto: `O caminho, em resumo (do ${codigoDoArtigo(a.numero)}):`, fontes: [] }];
  // os primeiros passos do "Como resolver", com o comando que vem logo abaixo de cada um (com as crases:
  // a tela desenha o comando, como faria com a resposta da IA)
  const linhas = (a.comoResolver ?? '').replace(/\r\n?/g, '\n').split('\n').map((l) => l.trim())
    .filter((l) => l && !/^\[(print|video|arquivo):[^\]]+\]$/.test(l) && !l.startsWith('```'));
  let numerados = 0;
  for (const l of linhas) {
    const passo = /^\d{1,3}[.)]\s/.test(l);
    if ((passo && ++numerados > 4) || trechos.length > 8) break;
    trechos.push({ texto: passo || !numerados ? l : `   ${l}`, fontes: passo ? [a.numero] : [] });
  }
  const porQueTudo = textoPuro(a.porQueAcontece);
  const ponto = porQueTudo.indexOf('. ');
  const porQue = ponto > 0 ? porQueTudo.slice(0, ponto + 1) : porQueTudo;
  if (porQue) trechos.push({ texto: '', fontes: [] }, { texto: `Por que acontece: ${porQue}`, fontes: [a.numero] });
  return {
    trechos,
    artigos: [
      { numero: a.numero, codigo: codigoDoArtigo(a.numero), titulo: a.titulo, citado: true },
      ...outros.map((o) => ({ numero: o.numero, codigo: codigoDoArtigo(o.numero), titulo: o.titulo, citado: false })),
    ],
    achou: true, ...quem,
  };
}

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
        // 1.6.1: a ativação do produto mais antigo, fora os que não têm data (como o servidor)
        primeiroProduto: (c) => c.products.filter((p) => temDataDeAtivacao(p.code)).map((p) => p.activatedAt).filter(Boolean).sort()[0] ?? null,
      };
      const chave = String(q.sort ?? 'tradeName');
      if (chave.startsWith('ativacao:')) valores[chave] = (c) => doProduto(c, chave.slice(9))?.activatedAt;
      if (chave.startsWith('modulo:')) { const [, pc = '', mc = ''] = chave.split(':'); valores[chave] = (c) => doProduto(c, pc)?.modules.find((m) => m.code === mc)?.activatedAt; }
      return paginate(ordenar(items, q, 'tradeName', valores), q);
    },
    async options(q) { await wait(50); return S.clients.filter((c) => !c.deletedAt && !c.archived && (q?.includeInternal || !c.isInternal) && (!q?.productCode || activeSubs(c.id).some((s) => s.productCode === q.productCode)) && (!q?.withDevices || S.devices.some((d) => !d.deletedAt && d.clientId === c.id && d.currentModality !== 'venda'))).sort((a, b) => Number(b.isInternal) - Number(a.isInternal) || a.tradeName.localeCompare(b.tradeName)).map((c) => ({ id: c.id, name: c.tradeName, isInternal: c.isInternal, internalCode: c.internalCode, ...(q?.withProducts ? produtosDoCliente(c.id) : {}) })); },
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
      conferirDesativacaoDemo(d.deactivatedAt, d.activatedAt ?? s.activatedAt);
      s.deactivatedAt = d.deactivatedAt ? dia(d.deactivatedAt) : null; if (d.activatedAt !== undefined) s.activatedAt = dia(d.activatedAt); if (d.notes !== undefined) s.notes = d.notes as string;
      const saveSecret = (key: string, label: string) => { if (st[key]) { const sid = s!.settings[key + 'SecretId'] ?? id(); S.secrets.set(sid, { label: `${label} — ${c.tradeName}`, value: st[key] }); s!.settings[key + 'SecretId'] = sid; } };
      for (const [k, v] of Object.entries(st)) if (!/password/i.test(k)) s.settings[k] = v;
      saveSecret('adminPassword', 'Senha admin do SZChat');
      audit('update', 'subscription', `Atualizou o produto ${d.productCode} no cliente ${c.tradeName}`, s.id); return fullClient(idc);
    },
    async upsertModule(idc, d) {
      await wait(); requirePerm('records.write'); const c = S.clients.find((x) => x.id === idc); if (!c) throw notFound('Cliente');
      const p = S.products.find((x) => x.code === d.productCode); if (!p) throw notFound(`Produto "${d.productCode}"`);
      const mod = S.modules.find((m) => m.productId === p.id && m.code === d.moduleCode && !m.deletedAt); if (!mod) throw notFound(`Módulo "${d.moduleCode}" do produto ${p.name}`);
      const sub = activeSubs(idc).find((x) => x.productCode === p.code); if (!sub) throw bad(`Marque o produto ${p.name} no cliente antes de ligar o módulo ${mod.name}`);
      let m = S.subMods.find((x) => x.subscriptionId === sub.id && x.moduleId === mod.id);
      if (!m) { m = { id: id(), subscriptionId: sub.id, moduleId: mod.id, activatedAt: now(), deactivatedAt: null, notes: null, settings: {} }; S.subMods.push(m); }
      conferirDesativacaoDemo(d.deactivatedAt, d.activatedAt ?? m.activatedAt);
      m.deactivatedAt = d.deactivatedAt ? dia(d.deactivatedAt) : null; if (d.activatedAt !== undefined) m.activatedAt = dia(d.activatedAt); if (d.notes !== undefined) m.notes = d.notes as string;
      const st = (d.settings as Record<string, any>) ?? {};
      // como o servidor: só os campos do módulo (as senhas vão para o cofre logo abaixo)
      const CAMPOS: Record<string, string[]> = { fop2: ['adminExtension'], omniboard: ['adminLogin'] };
      for (const [k, v] of Object.entries(st)) if ((CAMPOS[mod.code] ?? []).includes(k)) m.settings[k] = v;
      const saveSecret = (key: string, label: string) => { if (st[key]) { const sid = m!.settings[key + 'SecretId'] ?? id(); S.secrets.set(sid, { label: `${label} — ${c.tradeName}`, value: st[key] }); m!.settings[key + 'SecretId'] = sid; } };
      if (mod.code === 'fop2') { saveSecret('adminPassword', 'Senha do ramal admin do FOP2'); saveSecret('defaultUserPassword', 'Senha do usuário padrão do FOP2'); }
      if (mod.code === 'omniboard') { saveSecret('adminPassword', 'Senha admin do Omniboard'); saveSecret('userDefaultPassword', 'Senha padrão de usuário do Omniboard'); }
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
      const { cards, ctx, movimentos } = chamadosDaEquipe();
      const a = S.ajustesLineChat;
      return {
        configurado: a.ativo && !!a.painelId, painelId: a.painelId, painelNome: a.painelNome, appUrl: a.appUrl,
        linkDoPainel: a.painelId ? `${a.appUrl}/panels/${a.painelId}` : null,
        sincronizadoEm: a.ultimaEm, ultimaOk: a.ultimaOk, ultimaMsg: a.ultimaMsg, historicoDesde: a.inicioEm,
        totalCards: cards.length, movimentosRegistrados: movimentos,
        etapas: ctx.etapas.map((e) => ({ ...e, finalNoLineChat: !!ETAPAS_DEMO.find((x) => x.id === e.id)?.isFinal })),
        primeiroDia: primeiroDiaDe(cards, new Date()),
        campos: camposDeLista(ctx.campos).map((c) => ({ key: c.key, name: c.name, multiplo: c.type === 'MULTISELECT', options: c.options })),
        etiquetas: [...ctx.etiquetas].sort((x, y) => x.name.localeCompare(y.name, 'pt-BR')),
        responsaveis: [...new Set(cards.map((c) => c.responsavel).filter((x): x is string => !!x))].sort((x, y) => x.localeCompare(y, 'pt-BR')),
        vazio: VAZIO,
      };
    },
    async resumo(q) {
      await wait(90); requirePerm('support.read');
      const { cards, ctx } = chamadosDaEquipe();
      return resumirChamados(cards, FiltrosChamadosSchema.parse(q), { ...ctx, agora: new Date() });
    },
    async lista(q) {
      await wait(90); requirePerm('support.read');
      const { cards, ctx } = chamadosDaEquipe();
      return listarChamados(cards, ListaChamadosSchema.parse(q), { ...ctx, agora: new Date() }, linkDemo);
    },
    async painel() {
      await wait(60); requirePerm('support.read');
      chamadosDemo(); // os grupos de exemplo nascem junto com os chamados
      return S.painelChamados;
    },
    // ---------- Relatórios (1.7): as mesmas contas do servidor ----------
    async relatorios(q) {
      await wait(140); requirePerm('support.read');
      const { cards, ctx } = contextoRelatoriosDemo();
      return relatoriosChamados(cards, FiltrosRelatoriosSchema.parse(q), ctx, linkDemo);
    },
    async pecaRelatorio(q) {
      await wait(90); requirePerm('support.read');
      const p = ChamadosDaPecaSchema.safeParse(q);
      if (!p.success) throw bad(p.error.issues[0]?.message ?? 'Peça desconhecida');
      const { cards, ctx } = contextoRelatoriosDemo();
      return chamadosDaPeca(cards, p.data, ctx, linkDemo);
    },
    async ajustesRelatorios() {
      await wait(90); requirePerm('support.read');
      const { cards, ctx } = contextoRelatoriosDemo();
      const a = S.ajustesRelatorios;
      return { ...ajustesParaTela(cards, ctx.campos, { campos: a.campos, clientes: a.clientes, causas: a.causas }, cadastroParaLigar()), atualizadoEm: a.atualizadoEm, atualizadoPor: a.atualizadoPor };
    },
    async salvarAjustesRelatorios(novo) {
      await wait(250); requirePerm('admin.manage');
      const p = AjustesRelatoriosSchema.safeParse(novo);
      if (!p.success) throw bad(p.error.issues[0]?.message ?? 'Ajustes inválidos');
      const { ctx } = contextoRelatoriosDemo();
      const erro = conferirAjustes(p.data, ctx.campos, new Set(cadastroParaLigar().map((c) => c.id)));
      if (erro) throw bad(erro);
      const antes = S.ajustesRelatorios.clientes;
      const ligou = new Set([...Object.keys(antes), ...Object.keys(p.data.clientes)]);
      const n = [...ligou].filter((k) => antes[k] !== p.data.clientes[k] && Object.prototype.hasOwnProperty.call(p.data.clientes, k)).length;
      const causasAntes = S.ajustesRelatorios.causas;
      const nc = [...new Set([...Object.keys(causasAntes), ...Object.keys(p.data.causas)])].filter((k) => causasAntes[k] !== p.data.causas[k]).length;
      S.ajustesRelatorios = { campos: p.data.campos, clientes: p.data.clientes, causas: p.data.causas, atualizadoEm: now(), atualizadoPor: S.me?.name ?? null };
      const partes = [n ? `ligou ${n} cliente${n > 1 ? 's' : ''} do LineChat ao cadastro` : '', nc ? `mudou o grupo de ${nc} tipo${nc > 1 ? 's' : ''} em "De quem é a falha"` : ''].filter(Boolean);
      audit('chamados_relatorios', 'settings', `${S.me?.name} ajustou os Relatórios dos Chamados (${partes.join('; ') || 'campos'})`, 'chamados-relatorios');
      return S.ajustesRelatorios;
    },
    async arrumacaoRelatorios() {
      await wait(60); requirePerm('support.read');
      const a = S.arrumacaoRelatorios;
      return { ...montarArrumacao(a), atualizadoEm: a.atualizadoEm, atualizadoPor: a.atualizadoPor };
    },
    async salvarArrumacaoRelatorios(novo) {
      await wait(200); requirePerm('admin.manage');
      const p = ArrumacaoRelatoriosSchema.safeParse(novo);
      if (!p.success) throw bad(p.error.issues[0]?.message ?? 'Arrumação inválida');
      S.arrumacaoRelatorios = { ...p.data, atualizadoEm: now(), atualizadoPor: S.me?.name ?? null };
      const m = montarArrumacao(p.data);
      const total = CATALOGO_RELATORIOS.length;
      audit('chamados_relatorios_arrumacao', 'settings', `${S.me?.name} arrumou os Relatórios dos Chamados para a equipe (${total - m.ocultos.length} à vista, ${m.ocultos.length} escondido${m.ocultos.length === 1 ? '' : 's'}, ${m.favoritos.length} favorito${m.favoritos.length === 1 ? '' : 's'})`, 'chamados-relatorios-arrumacao');
      return { ...m, atualizadoEm: S.arrumacaoRelatorios.atualizadoEm, atualizadoPor: S.arrumacaoRelatorios.atualizadoPor };
    },
    async raioX(clienteId, q) {
      await wait(120); requirePerm('support.read');
      const cli = S.clients.find((c) => c.id === clienteId && !c.deletedAt);
      if (!cli) throw notFound('Cliente');
      const { cards, ctx } = contextoRelatoriosDemo();
      const opcoes = opcoesLigadasAo(clienteId, cards, ctx.campos, ctx.ajustes, cadastroParaLigar());
      const campoCliente = camposDosRelatorios(ctx.campos, ctx.ajustes.campos).cliente;
      return {
        cliente: { id: cli.id, nome: cli.tradeName },
        campoCliente: campoCliente?.name ?? null,
        gestor: {
          produtos: activeSubs(cli.id).sort((a, b) => prodMeta(a.productCode).sortOrder - prodMeta(b.productCode).sortOrder).map((s) => prodMeta(s.productCode).name),
          dids: S.dids.filter((d) => d.clientId === cli.id && !d.deletedAt).length,
          aparelhos: S.devices.filter((d) => d.clientId === cli.id && !d.deletedAt && d.currentModality !== 'venda').length,
        },
        ...raioXChamados(cards, opcoes, FiltrosRelatoriosSchema.parse(q), ctx, linkDemo),
      };
    },
    async salvarPainel(novo) {
      await wait(250); requirePerm('admin.manage');
      const p = PainelChamadosSchema.safeParse({ versao: VERSAO_PAINEL, ...novo });
      if (!p.success) throw bad(p.error.issues[0]?.message ?? 'Arrumação inválida');
      // as mesmas regras do servidor: etapa que não existe não conta; a igual à do LineChat é o padrão
      let fechadas: string[] | null = null;
      if (p.data.etapasFechadas?.length) {
        const validas = [...new Set(p.data.etapasFechadas)].filter((id) => ETAPAS_DEMO.some((e) => e.id === id));
        if (!validas.length) throw bad('Marque ao menos uma etapa que fecha o chamado.');
        const finais = ETAPAS_DEMO.filter((e) => e.isFinal).map((e) => e.id);
        fechadas = finais.length === validas.length && finais.every((id) => validas.includes(id)) ? null : validas;
      }
      const antes = S.painelChamados.etapasFechadas;
      const escondidos = p.data.itens.filter((x) => x.oculto).length;
      const grupos = p.data.itens.reduce((a, x) => a + (x.grupos?.length ?? 0), 0);
      const partes = [`${p.data.itens.length - escondidos} gráficos à vista${escondidos ? `, ${escondidos} escondido${escondidos > 1 ? 's' : ''}` : ''}`];
      if (grupos) partes.push(`${grupos} grupo${grupos > 1 ? 's' : ''}`);
      if (JSON.stringify(antes) !== JSON.stringify(fechadas)) partes.push(fechadas ? 'mudou as etapas que fecham o chamado' : 'voltou às etapas finais do LineChat');
      S.painelChamados = { versao: VERSAO_PAINEL, itens: p.data.itens, etapasFechadas: fechadas, atualizadoEm: now(), atualizadoPor: S.me?.name ?? null };
      audit('chamados_painel', 'settings', `${S.me?.name} arrumou a tela de Chamados para a equipe (${partes.join('; ')})`, 'chamados-painel');
      return S.painelChamados;
    },
  },
  envio: {
    async ajustes() {
      await wait(80); requirePerm('admin.manage');
      await relogioDemo();
      const e = S.envio;
      return {
        ativo: e.ativo, url: e.url, remetente: e.remetente, horario: e.horario, dias: e.dias, destinatarios: e.destinatarios,
        temToken: e.temToken, configuradoEm: e.configuradoEm, configuradoPor: e.configuradoPor,
        proximo: proximoEnvio(e, new Date(), e.ultimoAgendado),
        hoje: envioDeHoje(e, new Date(), e.ultimoAgendado, e.historico),
        historico: e.historico.slice(0, 20),
        marcados: { ...(await marcadosComTituloDemo()), atualizadoEm: S.envioMarcados.atualizadoEm, atualizadoPor: S.envioMarcados.atualizadoPor },
        enderecoPublico: 'https://gestao.exemplo.com.br', linkValeDias: 7,
      };
    },
    async salvarAjustes(novo) {
      await wait(200); requirePerm('admin.manage');
      const p = AjustesEnvioSchema.safeParse(novo);
      if (!p.success) throw bad(p.error.issues[0]?.message ?? 'Ajustes inválidos');
      const { token, ...resto } = p.data;
      // o token não fica guardado nem na prévia: só a marca de que existe um
      // como no servidor (1.7.1): salvar depois de uma falha do envio agendado libera o dia de novo
      const ultimoAgendado = S.envio.ultimoAgendado && !S.envio.ultimoAgendado.ok ? null : S.envio.ultimoAgendado;
      S.envio = { ...S.envio, ...resto, ultimoAgendado, temToken: S.envio.temToken || !!token, configuradoEm: now(), configuradoPor: S.me?.name ?? null };
      const ativos = resto.destinatarios.filter((d) => d.ativo).length;
      audit('envio_automatico_ajustes', 'settings', `${S.me?.name} ${resto.ativo ? 'ligou' : 'desligou'} o envio automático (${resto.horario}, ${ativos} ${ativos === 1 ? 'número' : 'números'})${token ? ' e trocou o token' : ''}`, 'envio-automatico');
      return demoApi.envio.ajustes();
    },
    async marcados() {
      await wait(40); requirePerm('support.read');
      return { ...S.envioMarcados };
    },
    async salvarMarcados(m) {
      await wait(120); requirePerm('admin.manage');
      const p = MarcadosEnvioSchema.safeParse(m);
      if (!p.success) throw bad(p.error.issues[0]?.message ?? 'Marcação inválida');
      const antes = [...S.envioMarcados.relatorios, ...S.envioMarcados.graficos];
      const depois = [...p.data.relatorios, ...p.data.graficos];
      const entrou = depois.filter((x) => !antes.includes(x)); const saiu = antes.filter((x) => !depois.includes(x));
      S.envioMarcados = { ...p.data, atualizadoEm: now(), atualizadoPor: S.me?.name ?? null };
      audit('envio_automatico_marcados', 'settings', `${S.me?.name} mudou o que vai no envio automático (${[entrou.length ? `entrou ${entrou.join(', ')}` : '', saiu.length ? `saiu ${saiu.join(', ')}` : ''].filter(Boolean).join('; ') || 'sem mudança'}; agora ${depois.length} no PDF)`, 'envio-automatico-marcados');
      return { ...S.envioMarcados };
    },
    async pacote() {
      await wait(150); requirePerm('support.read');
      const momento = momentoEmBrasilia(new Date());
      const t = await marcadosComTituloDemo();
      const ids = t.relatorios.map((r) => r.id);
      const op = await demoApi.chamados.opcoes();
      const resumo = await demoApi.chamados.resumo({ aba: 'hoje' });
      const itens = montarPainel(S.painelChamados.itens, op.campos);
      return {
        geradoEm: now(), dia: momento.dia, hhmm: momento.hhmm, painelNome: op.painelNome, primeiroDia: op.primeiroDia,
        resumo, graficos: itens.filter((x) => t.graficos.some((g) => g.id === x.id)), relatorioIds: ids,
        relatorios: ids.length ? await demoApi.chamados.relatorios({ de: momento.dia, ate: momento.dia, mes: momento.dia.slice(0, 7) }) : null,
        titulos: [...t.graficos.map((g) => g.titulo), ...t.relatorios.map((r) => r.titulo)],
      };
    },
    async enviar(destinatarioId) { return envioDemo('manual', destinatarioId); },
    async testar(destinatarioId) { return envioDemo('teste', destinatarioId); },
    pdfUrl: () => null,
    historicoPdfUrl: () => null,
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
  base: {
    async lista(q) {
      await wait(90); requirePerm('records.read');
      const p = BaseListarSchema.safeParse(q ?? {});
      if (!p.success) throw bad(p.error.issues[0]?.message ?? 'Filtro inválido');
      const f = p.data;
      const filtro = (tipo: TipoLigacao, alvo?: string) => (a: ArtRow) => !alvo || ligacoesDoArtigoDemo(a.id).some((l) => l.tipo === tipo && (tipo === 'assunto' ? nomeComparavel(l.alvo) === nomeComparavel(alvo) : l.alvo === alvo));
      const lista = artigosVivosDemo().filter(artigoVisivelDemo)
        .filter((a) => f.situacao === 'publicados' ? a.situacao === 'publicado' : f.situacao === 'rascunhos' ? a.situacao === 'rascunho' : f.situacao === 'obrigatorios' ? a.situacao === 'publicado' && !!a.obrigatoriaDesde : true)
        .filter(filtro('produto', f.produto)).filter(filtro('modulo', f.modulo)).filter(filtro('assunto', f.assunto)).filter(filtro('cliente', f.cliente))
        .filter(filtro('modelo', f.modelo)).filter(filtro('operadora', f.operadora)).filter(filtro('projeto', f.projeto)).filter(filtro('chamado', f.chamado))
        .filter((a) => !f.autor || a.autorId === f.autor);
      const porData = (x: ArtRow, y: ArtRow) => y.atualizadoEm.localeCompare(x.atualizadoEm);
      const achados = buscarArtigos(lista.map(paraBuscaDemo), f.q).sort((x, y) => {
        if (f.ordem === 'titulo') return x.artigo.titulo.localeCompare(y.artigo.titulo, 'pt-BR');
        if (f.ordem === 'numero') return y.artigo.numero - x.artigo.numero;
        if (f.ordem === 'relevancia' && f.q?.trim()) return y.pontos - x.pontos || porData(x.artigo.a, y.artigo.a);
        return porData(x.artigo.a, y.artigo.a);
      });
      const inicio = (f.page - 1) * f.pageSize;
      return {
        items: achados.slice(inicio, inicio + f.pageSize).map((x) => itemDaBaseDemo(x.artigo.a, x.trecho)),
        total: achados.length, page: f.page, pageSize: f.pageSize,
        podeEscrever: temPerm('knowledge.write'), podeCuidar: podeCuidarDemo(),
      };
    },
    async opcoes() {
      await wait(60); requirePerm('records.read');
      const vivos = artigosVivosDemo();
      const { ctx } = chamadosDemo();
      const assunto = camposDosRelatorios(ctx.campos, S.ajustesRelatorios.campos).assunto;
      const porNome = <T extends { nome: string }>(xs: T[]) => xs.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
      return {
        produtos: S.products.filter((p) => !p.deletedAt).sort((a, b) => a.sortOrder - b.sortOrder).map((p) => ({
          id: p.id, nome: p.name, cor: p.color,
          modulos: S.modules.filter((m) => m.productId === p.id && !m.deletedAt).sort((a, b) => a.sortOrder - b.sortOrder).map((m) => ({ id: m.id, nome: m.name })),
        })),
        campoAssunto: assunto?.name ?? null,
        assuntos: [...(assunto?.options ?? [])].sort((a, b) => a.localeCompare(b, 'pt-BR')),
        clientes: porNome(S.clients.filter((c) => !c.deletedAt && !c.isInternal).map((c) => ({ id: c.id, nome: c.tradeName }))),
        modelos: porNome(S.models.filter((m) => !m.deletedAt).map((m) => ({ id: m.id, nome: m.name }))),
        operadoras: porNome(S.carriers.map((o) => ({ id: o.id, nome: o.name }))),
        projetos: projetosVivos().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).map((p) => ({ id: p.id, nome: p.name, situacao: p.status })),
        autores: porNome([...new Set(vivos.map((a) => a.autorId).filter((x): x is string => !!x))].map((u) => ({ id: u, nome: nomeDaPessoaDemo(u) ?? '—' }))),
      };
    },
    async get(numero) { await wait(80); requirePerm('records.read'); return artigoInteiroDemo(artigoDemoOu404(numero)); },
    async criar(d0) {
      await wait(250); requirePerm('knowledge.write');
      const p = ArtigoGravarSchema.safeParse(d0);
      if (!p.success) throw bad(p.error.issues[0]?.message ?? 'Dados inválidos');
      const d = p.data;
      const texto = textoDoFormularioDemo(d);
      if (d.publicar) { const falta = faltaParaPublicar({ titulo: texto.titulo, comoResolver: texto.comoResolver }); if (falta) throw bad(falta); }
      conferirPedidoDeLeituraDemo(d, d.publicar);
      const ligacoes = conferirLigacoesDemo(d.ligacoes);
      const novos = lerAnexosNovosDemo(d.anexosNovos);
      const articleId = id();
      const final = comIdsDemo(texto, Object.fromEntries(novos.map((n) => [n.ref, n.id])));
      conferirPrintsDemo(articleId, final, novos.map((n) => n.id));
      semearBase();
      const a: ArtRow = {
        id: articleId, numero: S.proximoArtigo++, ...final, situacao: d.publicar ? 'publicado' : 'rascunho',
        obrigatoriaDesde: d.pedirLeitura ? now() : null, obrigatoriaPor: d.pedirLeitura ? S.me!.id : null,
        versao: 1, autorId: S.me!.id, atualizadoPorId: S.me!.id, publicadoEm: d.publicar ? now() : null, criadoEm: now(), atualizadoEm: now(), deletedAt: null,
      };
      S.artigos.push(a);
      for (const n of novos) S.artAnexos.push({ id: n.id, articleId, fileName: n.fileName, mimeType: n.mimeType, sizeBytes: n.sizeBytes, conteudo: n.conteudo, inline: n.inline, porId: S.me!.id, criadoEm: now(), deletedAt: null });
      for (const l of ligacoes) S.artLigacoes.push({ articleId, tipo: l.tipo, alvo: l.alvo });
      gravarVersaoDemo(a);
      audit('create', 'knowledge', `${d.publicar ? 'Publicou' : 'Escreveu o rascunho de'} ${codigoDoArtigo(a.numero)} "${a.titulo}"`, a.id);
      if (d.pedirLeitura) audit('update', 'knowledge', pediuLeituraDemo(a), a.id);
      return { numero: a.numero, codigo: codigoDoArtigo(a.numero), situacao: a.situacao, versao: a.versao };
    },
    async atualizar(numero, d0) {
      await wait(250); requirePerm('knowledge.write');
      const a = artigoDemoOu404(numero);
      const p = ArtigoGravarSchema.safeParse(d0);
      if (!p.success) throw bad(p.error.issues[0]?.message ?? 'Dados inválidos');
      const d = p.data;
      if (d.versao != null && d.versao !== a.versao) {
        throw new ApiError(409, `${nomeDaPessoaDemo(a.atualizadoPorId) ?? 'Outra pessoa'} salvou este artigo enquanto você editava. Copie o que você escreveu, abra o artigo de novo e junte as duas mudanças.`);
      }
      // publicado continua publicado: corrige-se editando (para tirar da equipe, a lixeira)
      const publicar = d.publicar || a.situacao === 'publicado';
      const texto = textoDoFormularioDemo(d);
      if (publicar) { const falta = faltaParaPublicar({ titulo: texto.titulo, comoResolver: texto.comoResolver }); if (falta) throw bad(falta); }
      conferirPedidoDeLeituraDemo(d, publicar);
      const ligacoes = conferirLigacoesDemo(d.ligacoes);
      const novos = lerAnexosNovosDemo(d.anexosNovos);
      const final = comIdsDemo(texto, Object.fromEntries(novos.map((n) => [n.ref, n.id])));
      conferirPrintsDemo(a.id, final, novos.map((n) => n.id));
      for (const n of novos) S.artAnexos.push({ id: n.id, articleId: a.id, fileName: n.fileName, mimeType: n.mimeType, sizeBytes: n.sizeBytes, conteudo: n.conteudo, inline: n.inline, porId: S.me!.id, criadoEm: now(), deletedAt: null });
      for (const x of S.artAnexos) if (x.articleId === a.id && !x.deletedAt && d.anexosRemovidos.includes(x.id)) x.deletedAt = now();
      const chave = (l: LigacaoArtigo) => `${l.tipo}:${l.alvo}`;
      const mudouTexto = !textoIgualDemo(a, final);
      const mudouLigacoes = JSON.stringify(ligacoesDoArtigoDemo(a.id).map(chave).sort()) !== JSON.stringify(ligacoes.map(chave).sort());
      const publicouAgora = publicar && a.situacao !== 'publicado';
      if (mudouTexto || mudouLigacoes || publicouAgora || novos.length || d.anexosRemovidos.length) {
        Object.assign(a, final, {
          situacao: publicar ? 'publicado' : 'rascunho', publicadoEm: a.publicadoEm ?? (publicar ? now() : null),
          versao: mudouTexto ? a.versao + 1 : a.versao, atualizadoPorId: S.me!.id, atualizadoEm: now(),
        });
        if (mudouTexto) gravarVersaoDemo(a);
        if (mudouLigacoes) {
          S.artLigacoes = S.artLigacoes.filter((l) => l.articleId !== a.id);
          for (const l of ligacoes) S.artLigacoes.push({ articleId: a.id, tipo: l.tipo, alvo: l.alvo });
        }
        audit('update', 'knowledge', `${publicouAgora ? 'Publicou' : 'Editou'} ${codigoDoArtigo(a.numero)} "${a.titulo}"${mudouTexto ? ` (versão ${a.versao})` : ''}`, a.id);
      }
      // pedir (de novo) a leitura não é mudança no texto: não mexe na versão nem em "quem mexeu por último"
      if (d.pedirLeitura) { a.obrigatoriaDesde = now(); a.obrigatoriaPor = S.me!.id; audit('update', 'knowledge', pediuLeituraDemo(a), a.id); }
      return { numero: a.numero, codigo: codigoDoArtigo(a.numero), situacao: a.situacao, versao: a.versao };
    },
    async remover(numero) {
      await wait(); requirePerm('knowledge.write');
      const a = artigoDemoOu404(numero);
      if (a.autorId !== S.me!.id && !podeCuidarDemo()) throw new ApiError(403, 'Só quem escreveu o artigo (ou quem cuida da base) pode mandá-lo para a lixeira.');
      a.deletedAt = now();
      audit('delete', 'knowledge', `Mandou ${codigoDoArtigo(a.numero)} "${a.titulo}" para a lixeira`, a.id);
      return { ok: true };
    },
    async ligar(numero, l) {
      await wait(); requirePerm('knowledge.write');
      const a = artigoDemoOu404(numero);
      if (l.ligar) {
        const [ok] = conferirLigacoesDemo([{ tipo: l.tipo, alvo: l.alvo }]);
        if (!S.artLigacoes.some((x) => x.articleId === a.id && x.tipo === ok!.tipo && x.alvo === ok!.alvo)) S.artLigacoes.push({ articleId: a.id, tipo: ok!.tipo, alvo: ok!.alvo });
      } else {
        S.artLigacoes = S.artLigacoes.filter((x) => !(x.articleId === a.id && x.tipo === l.tipo && x.alvo === l.alvo));
      }
      a.atualizadoEm = now(); a.atualizadoPorId = S.me!.id;
      audit('update', 'knowledge', `${l.ligar ? 'Ligou' : 'Desligou'} ${codigoDoArtigo(a.numero)} ${l.ligar ? 'a' : 'de'} um ${l.tipo}`, a.id);
      return { ok: true };
    },
    async versoes(numero) {
      await wait(70); requirePerm('records.read');
      const a = artigoDemoOu404(numero);
      return {
        atual: a.versao,
        versoes: S.artVersoes.filter((v) => v.articleId === a.id).sort((x, y) => y.versao - x.versao).map((v) => ({ versao: v.versao, por: nomeDaPessoaDemo(v.porId), em: v.em, nota: v.nota })),
      };
    },
    async comparar(numero, de, para) {
      await wait(70); requirePerm('records.read');
      const a = artigoDemoOu404(numero);
      const vDe = S.artVersoes.find((v) => v.articleId === a.id && v.versao === Number(de));
      const vPara = S.artVersoes.find((v) => v.articleId === a.id && v.versao === Number(para));
      if (!vDe || !vPara) throw notFound('Versão');
      return { de: textoDaVersaoDemo(vDe), para: textoDaVersaoDemo(vPara) };
    },
    async voltarVersao(numero, versao) {
      await wait(); requirePerm('knowledge.write');
      const a = artigoDemoOu404(numero);
      const antiga = S.artVersoes.find((v) => v.articleId === a.id && v.versao === Number(versao));
      if (!antiga) throw notFound('Versão');
      if (antiga.versao === a.versao) throw bad('Esta já é a versão atual.');
      if (a.situacao === 'publicado') { const falta = faltaParaPublicar({ titulo: antiga.titulo, comoResolver: antiga.comoResolver }); if (falta) throw bad(`Não dá para voltar a essa versão com o artigo publicado: ${falta}`); }
      Object.assign(a, {
        titulo: antiga.titulo, oQueAcontece: antiga.oQueAcontece, comoResolver: antiga.comoResolver, porQueAcontece: antiga.porQueAcontece, palavras: [...antiga.palavras],
        versao: a.versao + 1, atualizadoPorId: S.me!.id, atualizadoEm: now(),
      });
      gravarVersaoDemo(a, `Voltou à versão ${antiga.versao}`);
      audit('update', 'knowledge', `Voltou ${codigoDoArtigo(a.numero)} à versão ${antiga.versao} (agora versão ${a.versao})`, a.id);
      return { numero: a.numero, versao: a.versao };
    },
    async obrigatoria(numero, ligar) {
      await wait(); requirePerm('knowledge.manage');
      const a = artigoDemoOu404(numero);
      if (ligar && a.situacao !== 'publicado') throw bad('Publique o artigo antes de pedir a leitura da equipe.');
      a.obrigatoriaDesde = ligar ? now() : null; a.obrigatoriaPor = ligar ? S.me!.id : null;
      audit('update', 'knowledge', ligar ? pediuLeituraDemo(a) : `Tirou a leitura obrigatória de ${codigoDoArtigo(a.numero)}`, a.id);
      return { ok: true };
    },
    async marcarLida(numero) {
      await wait(80); requirePerm('records.read');
      const a = artigoDemoOu404(numero);
      const r = S.artLeituras.find((x) => x.articleId === a.id && x.userId === S.me!.id);
      if (r) r.em = now(); else S.artLeituras.push({ articleId: a.id, userId: S.me!.id, em: now() });
      audit('update', 'knowledge', `${S.me!.name} leu ${codigoDoArtigo(a.numero)} "${a.titulo}"`, a.id);
      return { ok: true };
    },
    async leituras(numero) {
      await wait(70); requirePerm('knowledge.manage');
      const a = artigoDemoOu404(numero);
      if (!a.obrigatoriaDesde) return { desde: null, lidos: [], faltam: [] };
      const pessoas = S.users.filter((u) => u.active).sort((x, y) => x.name.localeCompare(y.name, 'pt-BR'));
      const quando = new Map(S.artLeituras.filter((r) => r.articleId === a.id && r.em >= a.obrigatoriaDesde!).map((r) => [r.userId, r.em]));
      return {
        desde: a.obrigatoriaDesde,
        lidos: pessoas.filter((u) => quando.has(u.id)).map((u) => ({ nome: u.name, em: quando.get(u.id)! })),
        faltam: pessoas.filter((u) => !quando.has(u.id)).map((u) => ({ nome: u.name })),
      };
    },
    async comentar(numero, texto0) {
      await wait(120); requirePerm('knowledge.write');
      const a = artigoDemoOu404(numero);
      const p = ComentarioArtigoSchema.safeParse({ texto: texto0 });
      if (!p.success) throw bad(p.error.issues[0]?.message ?? 'Escreva o comentário');
      const texto = limpoDemo(p.data.texto);
      if (!texto) throw bad('Escreva o comentário.');
      const c: ArtComentarioRow = { id: id(), articleId: a.id, userId: S.me!.id, texto, em: now(), deletedAt: null };
      S.artComentarios.push(c);
      audit('create', 'knowledge', `Comentou em ${codigoDoArtigo(a.numero)} "${a.titulo}"`, a.id, { after: { comentario: texto } });
      return { id: c.id };
    },
    async apagarComentario(numero, cid) {
      await wait(); requirePerm('knowledge.write');
      const a = artigoDemoOu404(numero);
      const c = S.artComentarios.find((x) => x.id === cid && x.articleId === a.id && !x.deletedAt);
      if (!c) throw notFound('Comentário');
      if (c.userId !== S.me!.id && !podeCuidarDemo()) throw new ApiError(403, 'Só quem escreveu o comentário (ou quem cuida da base) pode apagá-lo.');
      c.deletedAt = now();
      const autor = nomeDaPessoaDemo(c.userId);
      audit('delete', 'knowledge', `Apagou um comentário${autor && autor !== S.me!.name ? ` de ${autor}` : ''} em ${codigoDoArtigo(a.numero)}`, a.id, { before: { comentario: c.texto, escritoEm: c.em, por: autor } });
      return { ok: true };
    },
    async pendentes() {
      await wait(40); requirePerm('records.read');
      const faltam = artigosVivosDemo().filter((a) => a.situacao === 'publicado' && a.obrigatoriaDesde && !lidaPorMimDemo(a))
        .sort((x, y) => y.obrigatoriaDesde!.localeCompare(x.obrigatoriaDesde!));
      return { naoLidas: faltam.length, artigos: faltam.map((a) => ({ numero: a.numero, codigo: codigoDoArtigo(a.numero), titulo: a.titulo, desde: a.obrigatoriaDesde! })) };
    },
    async ligados(tipo, alvo) {
      await wait(50); requirePerm('records.read');
      const rows = artigosVivosDemo().filter((a) => a.situacao === 'publicado' && S.artLigacoes.some((l) => l.articleId === a.id && l.tipo === tipo && l.alvo === alvo))
        .sort((x, y) => y.atualizadoEm.localeCompare(x.atualizadoEm));
      return { total: rows.length, artigos: rows.slice(0, 30).map((a) => ({ id: a.id, numero: a.numero, codigo: codigoDoArtigo(a.numero), titulo: a.titulo })) };
    },
    async paraChamados(ids) {
      await wait(60); requirePerm('support.read');
      const publicados = artigosVivosDemo().filter((a) => a.situacao === 'publicado');
      if (!ids.length || !publicados.length) return {};
      const indice = montarIndiceParaChamados(publicados.map((a) => ({ id: a.id, numero: a.numero, titulo: a.titulo, ligacoes: ligacoesDoArtigoDemo(a.id) })));
      const { cards, ctx } = chamadosDemo();
      const pedidos = new Set(ids);
      const escolhidos = cards.filter((c) => pedidos.has(c.id));
      const papeis = camposDosRelatorios(ctx.campos, S.ajustesRelatorios.campos);
      const chaveCliente = papeis.cliente?.key ?? null;
      const opcoesCliente = chaveCliente ? [...new Set(escolhidos.flatMap((c) => valoresDoCampo(c.campos[chaveCliente])))] : [];
      const lig = ligarClientes(opcoesCliente, cadastroParaLigar(), S.ajustesRelatorios.clientes);
      const out: Record<string, ArtigoCurto[]> = {};
      for (const c of escolhidos) {
        const l = artigosDoChamado({ id: c.id, campos: c.campos }, indice, { assunto: papeis.assunto?.key ?? null, cliente: chaveCliente }, (op) => lig[op]?.clienteId ?? null);
        if (l.length) out[c.id] = l;
      }
      return out;
    },
    async doChamado(ref) {
      await wait(150); requirePerm('knowledge.write');
      const c = cardDemo(ref);
      if (!c) throw notFound('Chamado');
      const { ctx } = chamadosDemo();
      const papeis = camposDosRelatorios(ctx.campos, S.ajustesRelatorios.campos);
      const valores = (k: string | null | undefined) => (k ? valoresDoCampo(c.campos[k]) : []);
      const ligacoes: LigacaoArtigo[] = [{ tipo: 'chamado', alvo: c.id }];
      for (const a of valores(papeis.assunto?.key)) ligacoes.push({ tipo: 'assunto', alvo: a });
      const opcoesCliente = valores(papeis.cliente?.key);
      const lig = ligarClientes(opcoesCliente, cadastroParaLigar(), S.ajustesRelatorios.clientes);
      for (const op of opcoesCliente) { const idc = lig[op]?.clienteId; if (idc) ligacoes.push({ tipo: 'cliente', alvo: idc }); }
      // o Produto do card (LinePBX, LineChat…) liga ao produto do Gestor com o mesmo nome
      for (const pr of valores(papeis.produto?.key)) { const achado = S.products.find((x) => !x.deletedAt && nomeComparavel(x.name) === nomeComparavel(pr)); if (achado) ligacoes.push({ tipo: 'produto', alvo: achado.id }); }
      const unicas = [...new Map(ligacoes.map((l) => [`${l.tipo}:${l.alvo}`, l])).values()];
      return {
        chamado: { id: c.id, key: c.key, titulo: c.title, link: linkDemo(c) || null },
        titulo: c.title.trim(), oQueAcontece: textoDoCard(c.description) || null,
        ligacoes: unicas.map(mostrarLigacaoDemo),
      };
    },
    async ia() {
      await wait(30); requirePerm('records.read');
      const a = S.ajustesIa;
      return { ativa: a.ativo && chaveServeDemo() && !!a.modelo, modelo: a.modeloNome || a.modelo, provedor: INFO_PROVEDORES[a.provedor].nome };
    },
    async perguntar(pergunta) {
      await wait(1100); requirePerm('records.read');
      const p = PerguntarSchema.safeParse({ pergunta });
      if (!p.success) throw bad(p.error.issues[0]?.message ?? 'Escreva a pergunta');
      iaProntaDemo(); limiteIaDemo();
      const r = respostaDemo(p.data.pergunta);
      // como no servidor: sem artigo publicado nenhum, a IA nem é chamada (não conta)
      if (artigosVivosDemo().some((a) => a.situacao === 'publicado')) usoIaDemo().perguntas++;
      audit('base_ia_pergunta', 'knowledge', `${S.me!.name} perguntou à base (IA, ${r.provedor}): "${p.data.pergunta.slice(0, 120)}"${r.achou ? ` — respondeu com ${r.artigos.filter((a) => a.citado).map((a) => a.codigo).join(', ')}` : ' — a base não tinha a resposta'}`);
      return r;
    },
    async rascunhoIa(chamado) {
      await wait(1300); requirePerm('knowledge.write');
      const p = RascunhoIaSchema.safeParse({ chamado });
      if (!p.success) throw bad(p.error.issues[0]?.message ?? 'Informe o chamado');
      iaProntaDemo();
      const c = cardDemo(p.data.chamado);
      if (!c) throw bad(`O chamado ${p.data.chamado} não está na cópia do LineChat.`);
      limiteIaDemo();
      const { ctx } = chamadosDemo();
      const papeis = camposDosRelatorios(ctx.campos, S.ajustesRelatorios.campos);
      const primeiro = (k: string | null | undefined) => (k ? valoresDoCampo(c.campos[k])[0] : undefined);
      const assunto = primeiro(papeis.assunto?.key) ?? 'o problema';
      const cliente = primeiro(papeis.cliente?.key) ?? 'o cliente';
      usoIaDemo().rascunhos++;
      const provedor = INFO_PROVEDORES[S.ajustesIa.provedor].nome;
      audit('base_ia_rascunho', 'knowledge', `${S.me!.name} pediu à IA (${provedor}) o rascunho de um artigo a partir do chamado ${chamado}`);
      // na prévia não há IA: o rascunho mostra o formato que ela devolve, com os [completar: …]
      return {
        titulo: `${assunto}: [completar: o sintoma, do jeito que alguém procuraria]`,
        oQueAcontece: `${cliente} abriu o ${c.key ?? 'chamado'} contando: ${textoDoCard(c.description).split('\n')[0] || assunto}\n[completar: desde quando acontece e com quem]`,
        comoResolver: '1. [completar: o primeiro passo que resolveu]\n2. [completar: o que conferir depois]\n3. Fazer uma ligação de teste com o cliente antes de fechar o chamado.',
        porQueAcontece: '[completar: a causa, se ficou clara]',
        palavrasDoCliente: [assunto.toLowerCase()],
        custo: null, modelo: 'prévia, sem IA de verdade', provedor,
      };
    },
    async iaAjustes() { await wait(60); requirePerm('admin.manage'); return statusIaDemo(); },
    async salvarIaAjustes(dados) {
      await wait(200); requirePerm('admin.manage');
      const p = AjustesIaSchema.safeParse(dados);
      if (!p.success) throw bad(p.error.issues[0]?.message ?? 'Ajustes inválidos');
      const d = p.data; const a = S.ajustesIa;
      const info = INFO_PROVEDORES[d.provedor];
      const chave = d.chave?.trim() || null;
      const endereco = d.provedor === 'compativel' ? normalizarEndereco(d.endereco) || null : null;
      const host = d.provedor === 'compativel' ? hostDoEndereco(endereco) : '';
      if (d.ativo && !chave && !chaveServeParaDemo(d.provedor, endereco)) {
        if (a.temChave && a.chaveDe === 'compativel' && d.provedor === 'compativel') throw bad(`A chave guardada é ${deQuemEaChaveDemo()}. Cole a chave de ${host || 'o novo serviço'} para usar este endereço.`);
        if (a.temChave && a.chaveDe) throw bad(`A chave guardada é ${deQuemEaChaveDemo()}. Cole a chave ${d.provedor === 'compativel' && host ? `de ${host}` : info.de} para usar este provedor.`);
        throw bad(`Cole a chave da API ${info.de} para ligar a IA.`);
      }
      const modelo = d.modelo.trim();
      const mudouOTestado = !!chave || d.provedor !== a.provedor || modelo !== a.modelo || endereco !== a.endereco;
      // a chave iria para o cofre; na prévia ela nem é guardada (só marcamos que existe e de quem é)
      if (chave) { a.temChave = true; a.chaveDe = d.provedor; a.chaveEndereco = d.provedor === 'compativel' ? host : null; }
      Object.assign(a, {
        ativo: d.ativo, provedor: d.provedor, modelo, modeloNome: modelo && d.modeloNome?.trim() ? d.modeloNome.trim() : null, endereco,
        precoEntrada: d.precoEntrada ?? null, precoSaida: d.precoSaida ?? null,
        ...(mudouOTestado ? { ultimoTesteEm: null, ultimoTesteOk: null, ultimoTesteMsg: null } : {}),
      });
      audit('settings_base_ia', 'settings', `${S.me!.name} ${d.ativo ? 'ligou' : 'desligou'} a IA da base (${info.nome}${modelo ? ` · ${a.modeloNome || modelo}` : ''})${chave ? ' e trocou a chave' : ''}`, 'base-ia');
      return statusIaDemo();
    },
    async testarIa() {
      await wait(700); requirePerm('admin.manage');
      const a = S.ajustesIa;
      iaConfigDemo();
      const mensagem = `Na prévia não há IA de verdade. No sistema, o teste manda uma pergunta de uma palavra para o ${a.modeloNome || a.modelo} (${INFO_PROVEDORES[a.provedor].nome}) e mostra a resposta aqui.`;
      Object.assign(a, { ultimoTesteEm: now(), ultimoTesteOk: true, ultimoTesteMsg: mensagem });
      audit('settings_base_ia_test', 'settings', `${S.me!.name} testou a IA da base (funcionou)`, 'base-ia');
      return { ok: true, mensagem };
    },
    async iaModelos(dados) {
      await wait(500); requirePerm('admin.manage');
      const v = ModelosIaSchema.safeParse(dados);
      if (!v.success) throw bad(v.error.issues[0]?.message ?? 'Pedido inválido');
      const p = v.data;
      const info = INFO_PROVEDORES[p.provedor];
      const endereco = p.provedor === 'compativel' ? normalizarEndereco(p.endereco) : null;
      if (p.provedor === 'compativel' && !enderecoValido(endereco)) throw bad('Informe o endereço da API do serviço (começa com https://) para buscar os modelos.');
      const guardada = !p.chave?.trim() && chaveServeParaDemo(p.provedor, endereco);
      if (!p.chave?.trim() && !guardada) throw bad(`Cole a chave da API ${p.provedor === 'compativel' ? `de ${hostDoEndereco(endereco)}` : info.de} para buscar os modelos.`);
      const modelos = modelosDeExemplo(p.provedor, endereco);
      const onde = p.provedor === 'compativel' ? ` · ${hostDoEndereco(endereco)}` : '';
      audit('settings_base_ia_modelos', 'settings', `${S.me!.name} buscou os modelos da IA (${info.nome}${onde}) com a chave ${guardada ? 'guardada' : 'digitada'}: ${modelos.length} ${modelos.length === 1 ? 'modelo' : 'modelos'}`, 'base-ia');
      return { modelos };
    },
  },
  portalAdmin: {
    async opcoes() {
      await wait(50); requirePerm('records.read');
      return {
        produtos: S.products.filter((p) => !p.deletedAt).sort((a, b) => a.sortOrder - b.sortOrder).map((p) => ({
          id: p.id, nome: p.name, cor: p.color,
          modulos: S.modules.filter((m) => m.productId === p.id && !m.deletedAt).sort((a, b) => a.sortOrder - b.sortOrder).map((m) => ({ id: m.id, nome: m.name })),
        })),
      };
    },
    async tutoriais(q) {
      await wait(80); requirePerm('records.read');
      const p = TutoriaisListarSchema.safeParse(q ?? {});
      if (!p.success) throw bad(p.error.issues[0]?.message ?? 'Filtro inválido');
      const f = p.data;
      const rows = tutoriaisVivos().slice().sort((a, b) => b.atualizadoEm.localeCompare(a.atualizadoEm))
        .filter((t) => f.situacao === 'publicados' ? t.situacao === 'publicado' : f.situacao === 'rascunhos' ? t.situacao === 'rascunho' : true)
        .filter((t) => !f.produto || (f.produto === 'geral' ? !t.produtoId : t.produtoId === f.produto));
      const achados = buscarArtigos(rows.map(paraBuscaPortalDemo), f.q);
      if (f.q?.trim()) achados.sort((a, b) => b.pontos - a.pontos);
      const inicio = (f.page - 1) * f.pageSize;
      return { items: achados.slice(inicio, inicio + f.pageSize).map((x) => ({ ...tutorialNaListaDemo(x.artigo.t), trecho: x.trecho })), total: achados.length, page: f.page, pageSize: f.pageSize };
    },
    async tutorial(numero) {
      await wait(70); requirePerm('records.read');
      const t = tutorialDemoOu404(numero);
      return { ...tutorialNaListaDemo(t), texto: t.texto, versao: t.versao, criadoEm: t.criadoEm, publicadoEm: t.publicadoEm, arquivos: arquivosDoTutorialDemo(t) };
    },
    async criar(d0) {
      await wait(220); requirePerm('portal.write');
      const p = TutorialGravarSchema.safeParse(d0);
      if (!p.success) throw bad(p.error.issues[0]?.message ?? 'Dados inválidos');
      const d = p.data;
      const campos = { titulo: d.titulo.trim(), resumo: limpoPortalDemo(d.resumo), texto: limpoPortalDemo(d.texto), destaque: d.destaque };
      if (d.publicar) { const falta = faltaParaPublicarTutorial(campos); if (falta) throw bad(falta); }
      const { produtoId, moduloId } = conferirProdutoDemo(d);
      semearPortal();
      const t: TutorialRow = {
        id: id(), numero: S.proximoTutorial++, ...campos, produtoId, moduloId, situacao: d.publicar ? 'publicado' : 'rascunho', versao: 1, views: 0,
        autorId: S.me!.id, atualizadoPorId: S.me!.id, publicadoEm: d.publicar ? now() : null, criadoEm: now(), atualizadoEm: now(), deletedAt: null,
      };
      ligarArquivosDemo(t);
      S.tutoriais.push(t);
      audit('create', 'portal', `${d.publicar ? 'Publicou' : 'Escreveu o rascunho do'} tutorial ${t.numero} "${t.titulo}" no portal`, t.id);
      return { numero: t.numero, versao: t.versao, situacao: t.situacao, caminho: caminhoDoTutorial(t.numero, t.titulo) };
    },
    async atualizar(numero, d0) {
      await wait(220); requirePerm('portal.write');
      const t = tutorialDemoOu404(numero);
      const p = TutorialGravarSchema.safeParse(d0);
      if (!p.success) throw bad(p.error.issues[0]?.message ?? 'Dados inválidos');
      const d = p.data;
      if (d.versao != null && d.versao !== t.versao) throw new ApiError(409, `${nomeDaPessoaDemo(t.atualizadoPorId) ?? 'Outra pessoa'} salvou este tutorial enquanto você editava. Copie o que você escreveu, abra o tutorial de novo e junte as duas mudanças.`);
      const campos = { titulo: d.titulo.trim(), resumo: limpoPortalDemo(d.resumo), texto: limpoPortalDemo(d.texto), destaque: d.destaque };
      if (d.publicar) { const falta = faltaParaPublicarTutorial(campos); if (falta) throw bad(falta); }
      const { produtoId, moduloId } = conferirProdutoDemo(d);
      ligarArquivosDemo({ ...t, texto: campos.texto });
      const antes = t.situacao;
      Object.assign(t, campos, { produtoId, moduloId, situacao: d.publicar ? 'publicado' : 'rascunho', publicadoEm: t.publicadoEm ?? (d.publicar ? now() : null), versao: t.versao + 1, atualizadoPorId: S.me!.id, atualizadoEm: now() });
      const acao = antes !== t.situacao ? (t.situacao === 'publicado' ? 'Publicou' : 'Tirou do portal (voltou a rascunho)') : 'Editou';
      audit('update', 'portal', `${acao} o tutorial ${t.numero} "${t.titulo}"`, t.id);
      return { numero: t.numero, versao: t.versao, situacao: t.situacao, caminho: caminhoDoTutorial(t.numero, t.titulo) };
    },
    async remover(numero) {
      await wait(); requirePerm('portal.write');
      const t = tutorialDemoOu404(numero);
      t.deletedAt = now();
      audit('delete', 'portal', `Mandou o tutorial ${t.numero} "${t.titulo}" para a lixeira`, t.id);
      return { ok: true };
    },
    async subir(tipo, file, progresso) {
      requirePerm('portal.write');
      const mime = file.type || 'application/octet-stream';
      const problema = problemaDoArquivo(tipo, mime, file.size) ?? (tipo === 'imagem' && !(TIPOS_IMAGEM_PORTAL as readonly string[]).includes(mime) ? 'No meio do texto só entra imagem PNG, JPG, WEBP ou GIF.' : null);
      if (problema) throw bad(problema);
      // na prévia o arquivo não sai do navegador: a barra anda só para mostrar como fica
      for (const p of [0.25, 0.6, 0.9]) { progresso?.(p); await wait(tipo === 'video' ? 260 : 90); }
      const url = tipo === 'video' ? URL.createObjectURL(file) : await lerArquivoDemo(file);
      progresso?.(1);
      semearPortal();
      const a: ArqPortalRow = { id: id(), tutorialId: null, tipo, nome: file.name || tipo, mimeType: mime, tamanho: file.size, url, porId: S.me!.id, criadoEm: now(), deletedAt: null };
      S.arqPortal.push(a);
      audit('create', 'portal', `Subiu ${tipo === 'video' ? 'o vídeo' : tipo === 'imagem' ? 'a imagem' : 'o arquivo'} "${a.nome}" (${Math.max(1, Math.round(a.tamanho / 1024))} KB) para o portal`, a.id);
      return arquivoDemo(a);
    },
    async espaco() {
      await wait(40); requirePerm('records.read'); semearPortal();
      const vivos = S.arqPortal.filter((a) => !a.deletedAt);
      const de = (f: (a: ArqPortalRow) => boolean) => vivos.filter(f);
      return {
        videos: de((a) => a.tipo === 'video').length, bytesVideos: de((a) => a.tipo === 'video').reduce((s, a) => s + a.tamanho, 0),
        arquivos: de((a) => a.tipo !== 'video').length, bytesArquivos: de((a) => a.tipo !== 'video').reduce((s, a) => s + a.tamanho, 0),
      };
    },
    async acessos(q) {
      await wait(70); requirePerm('records.read');
      const termo = (q?.q ?? '').trim().toLowerCase();
      return acessosVivos().filter((a) => !q?.cliente || a.clienteId === q.cliente).map(acessoDemo)
        .filter((a) => !termo || `${a.nome} ${a.email} ${a.cliente}`.toLowerCase().includes(termo))
        .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
    },
    async acessosDoCliente(clienteId) {
      await wait(60); requirePerm('records.read');
      if (!S.clients.some((c) => c.id === clienteId)) throw notFound('Cliente');
      const c = situacaoClienteDemo(clienteId);
      return { naBase: c.naBase, motivo: c.naBase ? null : c.motivo, acessos: acessosVivos().filter((a) => a.clienteId === clienteId).map(acessoDemo).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')) };
    },
    async darAcesso(clienteId, d0) {
      await wait(160); requirePerm('portal.access');
      const p = AcessoCriarSchema.safeParse(d0);
      if (!p.success) throw bad(p.error.issues[0]?.message ?? 'Dados inválidos');
      const c = S.clients.find((x) => x.id === clienteId && !x.deletedAt);
      if (!c) throw notFound('Cliente');
      const outro = acessosVivos().find((a) => a.email === p.data.email);
      if (outro) throw new ApiError(409, `Este e-mail já tem acesso ao portal (${situacaoClienteDemo(outro.clienteId).nome}).`);
      const codigo = codigoDeConviteDemo();
      const a: AcessoRow = { id: id(), clienteId, nome: p.data.nome, email: p.data.email, senha: null, ativo: true, conviteCodigo: codigo, conviteVence: new Date(Date.now() + DIAS_DO_CONVITE * 86_400_000).toISOString(), ultimoAcesso: null, acessos: 0, criadoPorId: S.me!.id, criadoEm: now() };
      S.acessosPortal.push(a);
      audit('create', 'portal', `Deu acesso ao portal a ${a.nome} (${a.email}), de ${c.tradeName}`, a.id);
      return { id: a.id, convite: `/portal/convite/${codigo}` };
    },
    async novoConvite(idAcesso) {
      await wait(120); requirePerm('portal.access');
      const a = acessosVivos().find((x) => x.id === idAcesso);
      if (!a) throw notFound('Acesso');
      if (!a.ativo) throw bad('O acesso está bloqueado. Desbloqueie antes de mandar um convite.');
      a.conviteCodigo = codigoDeConviteDemo(); a.conviteVence = new Date(Date.now() + DIAS_DO_CONVITE * 86_400_000).toISOString();
      audit('update', 'portal', `Gerou um convite novo para ${a.nome} (${a.email}) entrar no portal`, a.id);
      return { id: a.id, convite: `/portal/convite/${a.conviteCodigo}` };
    },
    async bloquear(idAcesso, bloquear) {
      await wait(); requirePerm('portal.access');
      const a = acessosVivos().find((x) => x.id === idAcesso);
      if (!a) throw notFound('Acesso');
      a.ativo = !bloquear;
      if (bloquear && S.portalSessao === a.id) S.portalSessao = null;
      audit('update', 'portal', `${bloquear ? 'Bloqueou' : 'Desbloqueou'} o acesso de ${a.nome} (${a.email}) ao portal`, a.id);
      return { ok: true };
    },
    async corrigirAcesso(idAcesso, d0) {
      await wait(); requirePerm('portal.access');
      const p = AcessoCriarSchema.safeParse(d0);
      if (!p.success) throw bad(p.error.issues[0]?.message ?? 'Dados inválidos');
      const a = acessosVivos().find((x) => x.id === idAcesso);
      if (!a) throw notFound('Acesso');
      const outro = acessosVivos().find((x) => x.email === p.data.email && x.id !== a.id);
      if (outro) throw new ApiError(409, `Este e-mail já tem acesso ao portal (${situacaoClienteDemo(outro.clienteId).nome}).`);
      Object.assign(a, { nome: p.data.nome, email: p.data.email });
      audit('update', 'portal', `Corrigiu o acesso de ${a.nome} ao portal`, a.id);
      return { ok: true };
    },
    async ajustes() { await wait(40); requirePerm('records.read'); return S.ajustesPortal; },
    async salvarAjustes(d0) {
      await wait(); requirePerm('admin.manage');
      const p = PortalAjustesSchema.safeParse(d0);
      if (!p.success) throw bad(p.error.issues[0]?.message ?? 'Dados inválidos');
      S.ajustesPortal = { ...p.data, email: p.data.email || null };
      audit('update', 'portal', 'Mudou os ajustes do portal do cliente', null);
      return S.ajustesPortal;
    },
  },
  portal: {
    async sobre() {
      await wait(30);
      const a = S.ajustesPortal;
      return { titulo: a.titulo, whatsapp: a.whatsapp ?? null, email: a.email || null, horario: a.horario ?? null };
    },
    async eu() { await wait(50); return euPortalDemo(sessaoPortalDemo().a); },
    async entrar(email, senha) {
      await wait(180);
      const p = PortalEntrarSchema.safeParse({ email, senha });
      if (!p.success) throw bad(p.error.issues[0]?.message ?? 'Dados inválidos');
      const a = acessosVivos().find((x) => x.email === p.data.email);
      if (!a || !a.senha || a.senha !== p.data.senha) {
        audit('login_failed', 'portal', `Tentativa de entrar no portal falhou para ${p.data.email}`, null);
        throw new ApiError(401, 'E-mail ou senha incorretos');
      }
      if (!a.ativo || !situacaoClienteDemo(a.clienteId).naBase) throw new ApiError(403, 'Seu acesso ao portal está suspenso. Fale com o suporte da Ingline.');
      S.portalSessao = a.id; a.ultimoAcesso = now(); a.acessos += 1;
      return euPortalDemo(a);
    },
    async sair() { await wait(40); S.portalSessao = null; return { ok: true }; },
    async convite(codigo) {
      await wait(80);
      const a = acessosVivos().find((x) => x.conviteCodigo === codigo && x.conviteVence && x.conviteVence > now());
      if (!a) throw notFound('Convite');
      if (!a.ativo || !situacaoClienteDemo(a.clienteId).naBase) throw new ApiError(403, 'Seu acesso ao portal está suspenso. Fale com o suporte da Ingline.');
      return { nome: a.nome, email: a.email, cliente: situacaoClienteDemo(a.clienteId).nome, trocando: !!a.senha };
    },
    async criarSenha(codigo, senha) {
      await wait(180);
      const p = PortalCriarSenhaSchema.safeParse({ senha });
      if (!p.success) throw bad(p.error.issues[0]?.message ?? 'Senha inválida');
      const a = acessosVivos().find((x) => x.conviteCodigo === codigo && x.conviteVence && x.conviteVence > now());
      if (!a) throw notFound('Convite');
      const trocando = !!a.senha;
      a.senha = p.data.senha; a.conviteCodigo = null; a.conviteVence = null;
      audit('update', 'portal', `${a.nome} (${a.email}) ${trocando ? 'trocou a senha' : 'criou a senha'} do portal pelo convite`, a.id);
      S.portalSessao = a.id; a.ultimoAcesso = now(); a.acessos += 1;
      return { ok: true };
    },
    async trocarSenha(atual, nova) {
      await wait(150);
      const { a } = sessaoPortalDemo();
      const p = PortalTrocarSenhaSchema.safeParse({ atual, nova });
      if (!p.success) throw bad(p.error.issues[0]?.message ?? 'Senha inválida');
      if (a.senha !== p.data.atual) throw bad('A senha atual não confere.');
      a.senha = p.data.nova;
      return { ok: true };
    },
    async inicio() {
      await wait(90);
      const { ativos } = sessaoPortalDemo();
      const rows = visiveisDemo(ativos);
      const produtos = S.products.filter((p) => !p.deletedAt && ativos.produtos.includes(p.id)).sort((a, b) => a.sortOrder - b.sortOrder);
      return {
        portal: S.ajustesPortal,
        produtos: produtos.map((p) => ({ id: p.id, nome: p.name, cor: p.color, tutoriais: rows.filter((t) => t.produtoId === p.id).length })),
        geral: rows.filter((t) => !t.produtoId).length,
        destaques: rows.filter((t) => t.destaque).sort((a, b) => b.atualizadoEm.localeCompare(a.atualizadoEm)).slice(0, 6).map(cartaoDemo),
        recentes: [...rows].sort((a, b) => (b.publicadoEm ?? b.atualizadoEm).localeCompare(a.publicadoEm ?? a.atualizadoEm)).slice(0, 6).map(cartaoDemo),
        total: rows.length,
      };
    },
    async tutoriais(q) {
      await wait(80);
      const { ativos } = sessaoPortalDemo();
      const rows = visiveisDemo(ativos).filter((t) => !q.produto || (q.produto === 'geral' ? !t.produtoId : t.produtoId === q.produto));
      const achados = buscarArtigos(rows.map(paraBuscaPortalDemo), q.q);
      if (q.q?.trim()) achados.sort((a, b) => b.pontos - a.pontos);
      else achados.sort((a, b) => Number(b.artigo.t.destaque) - Number(a.artigo.t.destaque) || a.artigo.t.titulo.localeCompare(b.artigo.t.titulo, 'pt-BR'));
      return { items: achados.map((x) => ({ ...cartaoDemo(x.artigo.t), trecho: x.trecho })), total: achados.length };
    },
    async tutorial(numero) {
      await wait(80);
      const { ativos } = sessaoPortalDemo();
      const n = numeroDoCaminho(numero);
      const t = visiveisDemo(ativos).find((x) => x.numero === n);
      if (!t) throw notFound('Tutorial');
      t.views += 1;
      return { ...cartaoDemo(t), texto: t.texto, publicadoEm: t.publicadoEm, arquivos: arquivosDoTutorialDemo(t) };
    },
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
    async upsertModule(idp, d) { await wait(); requirePerm('admin.manage'); const p = S.products.find((x) => x.id === idp); if (!p) throw notFound('Produto'); const code = String(d.code); if (!/^[a-z0-9_]+$/.test(code)) throw new ApiError(400, 'Dados inválidos', [{ field: 'code', message: 'Use só letras minúsculas, números e _' }]); let m = S.modules.find((x) => x.productId === p.id && x.code === code); if (m?.deletedAt) throw bad(`O código "${code}" é do módulo ${m.name}, que está na lixeira. Restaure-o em Lixeira ou use outro código.`); if (!m) { m = { id: id(), productId: p.id, code, name: String(d.name), description: (d.description as string) ?? null, hasSettings: false, sortOrder: 99, active: true }; S.modules.push(m); audit('create', 'product_module', `Criou o módulo ${m.name} em ${p.name}`, m.id); } else { for (const k of ['name', 'description', 'active', 'sortOrder'] as const) if (d[k] !== undefined) (m as any)[k] = d[k]; audit('update', 'product_module', `Editou o módulo ${m.name} em ${p.name}`, m.id); } const { productId: _p, ...out } = m; return out; },
    async audit(q) {
      await wait(); requirePerm('audit.read');
      const items = S.audit.filter((a) => (!q.action || a.action === q.action) && (!q.entityType || a.entityType === q.entityType) && (!q.userId || a.userId === q.userId));
      return paginate(ordenar(items, q, 'createdAt', {
        createdAt: (a) => a.createdAt, action: (a) => a.action, entityType: (a) => a.entityType, summary: (a) => a.summary, userName: (a) => a.userName,
      }, 'desc'), q);
    },
    async removeModule(idp, idm) {
      await wait(); requirePerm('admin.manage');
      const p = S.products.find((x) => x.id === idp); const m = S.modules.find((x) => x.id === idm && x.productId === idp && !x.deletedAt);
      if (!p || !m) throw notFound('Módulo');
      if (MODULOS_PROTEGIDOS.includes(`${p.code}:${m.code}`)) throw bad(`O ${m.name} não pode ir para a lixeira: o sistema guarda campos dele na ficha do cliente. Se não quiser vê-lo, desligue o "ativo".`);
      m.deletedAt = now(); audit('delete', 'product_module', `Mandou o módulo ${m.name} (${p.name}) para a lixeira`, m.id); return { ok: true };
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
        ...S.modules.filter((c) => c.deletedAt).map((c) => ({ type: 'productModule', id: c.id, label: `${S.products.find((p) => p.id === c.productId)?.name} › ${c.name}`, deletedAt: c.deletedAt! })),
        ...S.artigos.filter((c) => c.deletedAt).map((c) => ({ type: 'knowledgeArticle', id: c.id, label: `${codigoDoArtigo(c.numero)} · ${c.titulo}`, deletedAt: c.deletedAt! })),
        ...S.tutoriais.filter((c) => c.deletedAt).map((c) => ({ type: 'portalArticle', id: c.id, label: `Tutorial ${c.numero} · ${c.titulo}`, deletedAt: c.deletedAt! })),
      ].sort((a, b) => b.deletedAt.localeCompare(a.deletedAt));
    },
    async restore(type, idr) {
      await wait(); requirePerm('records.delete');
      const list: any[] = type === 'client' ? S.clients : type === 'circuit' ? S.circuits : type === 'did' ? S.dids : type === 'deviceModel' ? S.models : type === 'product' ? S.products : type === 'productModule' ? S.modules : type === 'releaseNote' ? S.notas : type === 'knowledgeArticle' ? S.artigos : type === 'portalArticle' ? S.tutoriais : S.devices;
      const it = list.find((x) => x.id === idr); if (!it) throw notFound();
      it.deletedAt = null;
      if (type === 'knowledgeArticle' || type === 'portalArticle') it.atualizadoEm = now();
      const nome = type === 'knowledgeArticle' ? `${codigoDoArtigo(it.numero)} "${it.titulo}"` : type === 'portalArticle' ? `o tutorial ${it.numero} "${it.titulo}" do portal` : it.tradeName ?? it.name ?? it.number ?? (type === 'device' ? identificacaoAparelho(it).texto : idr);
      audit('restore', type, `Restaurou ${nome} da lixeira`, idr); return { ok: true };
    },
  },
};
