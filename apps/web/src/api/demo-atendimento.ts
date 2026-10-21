/**
 * A PRÉVIA DOS CHAMADOS DO GESTOR (Patch 2.0, decisão 0047): o módulo de chamados sem servidor.
 *
 * A página publicada para o Luan aprovar não tem servidor nem banco: tudo mora na memória do navegador.
 * Para a prévia não mentir, este arquivo copia o servidor (`apps/api/src/services/atendimento/`: o
 * contexto, os chamados, a leitura, os ajustes, a rotina, as integrações e o relógio) — as mesmas
 * permissões, as mesmas mensagens de erro (com os `details` que a tela lê para abrir a janela do que
 * falta), os mesmos eventos no histórico e os mesmos avisos no sininho. As regras em si nem moram aqui:
 * vêm do `@gestor/shared`, as mesmas funções do servidor (o que falta para cada etapa, os prazos, a
 * prioridade sugerida, a busca, a ordem, o desenho das ligações, as frases do histórico).
 *
 * Os dados de exemplo (`demo-atendimento-exemplos.ts`) não são escritos prontos: na primeira chamada do
 * módulo, cada chamado de exemplo é vivido de novo, passo a passo, pelas mesmas funções que a tela usa,
 * com o relógio dos chamados rodando entre os passos (os alertas de prazo, o sem responsável, o Resolvido
 * que fecha sozinho). Assim o histórico, a trajetória, os prazos e o sininho batem entre si — e com o que
 * o servidor faria. Depois, o relógio continua rodando enquanto a prévia está aberta (a cada leitura,
 * no máximo uma vez a cada 30 segundos), como o do servidor roda a cada minuto.
 *
 * Nada sai de verdade: o WhatsApp responde "Prévia: nada foi enviado de verdade", o webhook só anota o
 * último evento e a IA monta a sugestão com as palavras do próprio chamado.
 */
import {
  AgendadoGravarSchema, AJUSTES_PAINEL_PADRAO, AJUSTES_PRAZOS_PADRAO, AjustesPrazosSchema, AnotacaoSchema, AssuntoGravarSchema,
  AssuntosColarSchema, AvisarClienteSchema, AVISOS_CHAMADOS_PADRAO, AvisosChamadosSchema, CampoGravarSchema, CamposDoSistemaSchema, CAMPOS_DO_SISTEMA,
  ChamadoAlterarSchema, ChamadoCriarSchema, ChaveCriarSchema, MAX_CAMPOS_DO_PAINEL, NOME_CAMPO_DO_SISTEMA, NOME_TIPO_CAMPO, OrdemDosCamposSchema,
  ChecklistSchema, ETAPAS_DO_PAINEL_NOVO, EsperarSchema, EtapasGravarSchema, INFO_PROVEDORES, LigarChamadoSchema, LinkConversaSchema, ListarChamadosSchema, MAX_NIVEL_ASSUNTO,
  MoverSchema, NOME_ALCANCE, NOME_CAMPO, NOME_ESPERA, NOME_GRAVIDADE, NOME_LIGACAO, ObservarSchema, OperadoraAndamentoSchema,
  OperadoraCasoSchema, PAINEIS_INICIAIS, PaiSchema, PainelGravarSchema, ProblemaSchema, ReabrirSchema, RegraAgendadoSchema,
  ExperimentarRoboSchema, MapaDoRoboSchema, aplicarMapaDoRobo, mapaDeFabrica, parametrosDoEndereco, resolverPedidoDoRobo, CAMPOS_DO_MAPA, NOME_CAMPO_DO_MAPA,
  type MapaDoRobo, type UltimoPedidoDoRobo, type PreviaDoRobo, type RoboTela,
  SitesIframeSchema, TempoSchema, TrocarPainelSchema, WebhookGravarSchema, EtiquetaEditarPeloNomeSchema, EtiquetaEditarSchema, EtiquetaGravarSchema, NOME_COR_ETIQUETA, chaveDaEtiqueta, renomearEtiqueta,
  faltaNoModeloAprovado, mensagemAoCliente, parametrosDoModelo, telefoneLegivel,
  EVENTOS_AVISO, MAX_MODELO_DO_AVISO, NOME_EVENTO_AVISO, modeloDoAviso, modelosParaGuardar, variaveisDesconhecidas,
  alertasDevidos, assuntoEDescendentes, caminhoDoAssunto, campoLigado, chaveDoCampo, citadosNoTexto, codigoDoChamado, emLista, compararUrgencia, custoEstimado, dentroDoHorario, diaLocal,
  didFormatado, ehLista, lerCamposDoPedido, limparObrigatorios, mesmoValorDoCampo, nomeDoSistemaIgual, obrigatoriosDoPainel, sugestaoDoQueOPainelUsa,
  textoDoValor, textosDosCampos, valoresVisiveis,
  duracaoDoPrazo, emOrdemDeArvore, estadoDosPrazos, etapaAoAssumir, etapaAoReabrir, etapaDeEntrada, etiquetasUnicas, faltaParaAbrir, faltaParaEtapa, trocaEntreTiposDePainel, TROCA_ENTRA_NO_FUNIL, NEGOCIACAO_SEM_PAI, NEGOCIACAO_SEM_PROBLEMA, negociacaoNaoEPai, negociacaoNaoEIncidente, NEGOCIACAO_SEM_LIGACAO, negociacaoNaoSeLiga,
  valorPorProduto, mesmoValorPorProduto, textoDoValorPorProduto, NOME_VALOR_POR_PRODUTO, NOME_ATIVACAO_POR_PRODUTO, NOME_MENSALIDADE, NOME_ATIVACAO,
  VALOR_E_A_SOMA, ATIVACAO_E_A_SOMA, type ValoresDosProdutos, tituloQueFica, mensagemDoTitulo, acharCampo, OpcaoIncluirSchema, MAX_OPCOES_DO_CAMPO,
  filhosQueTravam, filtrarCartoes, grafoDeLigacoes, horaLocal, hostDoEndereco, instanteLocal, lerListaDeAssuntos, lerSugestaoDaIa, linkDaConversa, macFormatado,
  mensagemDoQueFalta, minutosUteisEntre, movimentoDeNivel, nivelDoAssunto, numeroWhatsApp, ordenarCartoes, paraBusca,
  preencherModelo, prioridadeSugeridaDoPainel, proximaExecucao, referenciasNoTexto, resumoDosPaineis, situacaoDaEtapa, somarDiasUteis, somarMinutosUteis, textoDaRegra,
  textoDeBusca, textoDoEvento, textoDoPrazo, trajetoria,
  AJUSTES_DO_PAINEL_DE_VENDAS, CAMPOS_DO_PAINEL_DE_VENDAS, compararNegociacoes, diaComAno, ETAPAS_DO_PAINEL_DE_VENDAS, FiltroDoRelatorioDeVendasSchema, MOTIVOS_DE_PERDA_PADRAO, NOME_TIPO_DE_PAINEL,
  passagensDosEventos, passagensNoPainel, problemaNasEtapasDoTipo, reais, relatorioDeVendas, somarDias,
  type NegociacaoParaRelatorio, type RelatorioDeVendas, type ResultadoDaVenda, type TipoDePainel, type MargemDaNegociacao, type FaixasDoSinal,
  type Agendado, type AjustesDoPainel, type AjustesPrazos, type Alcance, type AlertaPrazo, type AnotacaoChamado,
  type Assunto, type AvisosChamadosTela, type AvisosNaTela, type CadastroDoCliente, type CampoDoSistema, type CampoPersonalizado, type CartaoChamado, type CartaoParaLista,
  type Obrigatorio, type OpcaoDoCampo, type ValoresDosCampos, type CorEtiqueta, type EtiquetaNoPainel, type EtiquetaDoCatalogo,
  type CasoOperadora, type ChamadoAlterar, type ChamadoCriar, type ChaveApiTela, type CorPainel, type DadosObrigatorios, type Espera, type EstadoPrazo,
  type EtapaPainel, type EventoAviso, type EventoChamado, type EventoWebhook, type FichaChamado, type FiltrosAtendimento, type Gravidade,
  type IntegracoesTela, type ItemChecklist, type MeuDia, type Nivel, type NoParaGrafo, type OpcoesAtendimento, type Origem, type Painel,
  type PessoaCurta, type Prioridade, type ProvedorIa, type QuadroAtendimento, type ReferenciaMostrada, type RegraAgendado, type ResumoDoPainel, type SituacaoDoChamado,
  type SugestaoIa, type TipoAviso, type TipoChamado, type TipoEspera, type TipoEtapa, type TipoEvento, type TipoLigacaoChamado, type WebhookTela,
} from '@gestor/shared';
import type { Api } from './index.js';
import { ApiError, type Page, type TrashItem } from './types.js';
import { RECIBO_FOTO_DEMO } from './recibo-demo-midia.js';
import { PROPOSTA_PDF_DEMO } from './proposta-demo-midia.js';
import {
  AGENDADOS_DE_EXEMPLO, CAMPOS_DE_EXEMPLO, META_DO_COMERCIAL, NEGOCIACOES_DE_EXEMPLO, CORES_DAS_ETIQUETAS, CORES_DAS_ETIQUETAS_DO_COMERCIAL, DESLIGADOS_NO_DESENVOLVIMENTO, MODELO_ESCOLHIDO, MODELOS_DO_LINECHAT, DESLIGADOS_NO_SUPORTE, DETALHES_DOS_ASSUNTOS, EMAIL_DA_PESSOA, EQUIPE_NOVA, EXEMPLOS, LISTA_DE_ASSUNTOS_DO_SUPORTE,
  NUMERO_DA_EQUIPE, WHATSAPP_DA_EQUIPE,
  type DadosAlterarExemplo, type Exemplo, type IaDoExemplo, type Passo, type Pessoa,
} from './demo-atendimento-exemplos.js';

// =====================================================================
//  O QUE A PRÉVIA (demo.ts) EMPRESTA AO MÓDULO
// =====================================================================

/** O pedaço do estado da prévia que os chamados leem (as pessoas, os clientes, o cadastro, a IA, o LineChat). */
export type EstadoDaPrevia = {
  me: { id: string; name: string; roleId: string } | null;
  /** `whatsapp`: o número dos avisos dos chamados (2.0.1, em Administração › Usuários); `whatsappAvisos` falso = pausado */
  users: Array<{ id: string; name: string; email: string; password: string; roleId: string; active: boolean; lastLoginAt: string | null; whatsapp?: string | null; whatsappAvisos?: boolean }>;
  roles: Array<{ id: string; key: string | null; permissions: string[] }>;
  clients: Array<{ id: string; tradeName: string; isInternal: boolean; deletedAt: string | null }>;
  products: Array<{ id: string; code: string; name: string; color: string; sortOrder: number; active: boolean; deletedAt: string | null }>;
  subs: Array<{ clientId: string; productCode: string; deactivatedAt: string | null }>;
  carriers: Array<{ id: string; name: string; active: boolean }>;
  circuits: Array<{ id: string; name: string; carrierId: string | null; ownerClientId: string | null; deletedAt: string | null }>;
  dids: Array<{ id: string; number: string; circuitId: string | null; clientId: string | null; deletedAt: string | null }>;
  models: Array<{ id: string; name: string }>;
  devices: Array<{ id: string; modelId: string; mac: string | null; serialNumber: string | null; clientId: string | null; deletedAt: string | null }>;
  units: Array<{ id: string; clientId: string; name: string; isMain: boolean; deletedAt: string | null }>;
  /** os contatos dos clientes (2.0, a aba Contatos): o Abrir chamado puxa daqui, e o robô acha o cliente pelo WhatsApp */
  contatos: Array<{ id: string; clientId: string; nome: string; whatsapp: string | null; email: string | null; cargo: string | null; ativo: boolean; criadoEm: string; atualizadoEm: string }>;
  ajustesIa: {
    ativo: boolean; provedor: ProvedorIa; modelo: string; modeloNome: string | null; precoEntrada: number | null; precoSaida: number | null;
    endereco: string | null; temChave: boolean; chaveDe: ProvedorIa | null; chaveEndereco: string | null;
  };
  ajustesLineChat: { ativo: boolean; appUrl: string; painelId: string; temToken: boolean };
  audit: Array<{ id: string; action: string; entityType: string; entityId: string | null; summary: string; before: unknown; after: unknown; userName: string | null; userId: string | null; createdAt: string }>;
};

export type ContextoAtendimentoDemo = {
  S: EstadoDaPrevia;
  id: () => string;
  wait: (ms?: number) => Promise<unknown>;
  audit: (action: string, entityType: string, summary: string, entityId?: string | null, extra?: { before?: unknown; after?: unknown }) => void;
  requirePerm: (perm: string) => void;
  /** a porta de quem tem pelo menos uma das permissões (como o `requireAnyPermission` do servidor) */
  requireAnyPerm: (...perms: string[]) => void;
  temPerm: (perm: string) => boolean;
  /** a IA da Base de conhecimento da prévia: as mesmas conferências (ligada, chave, limite de 30 por hora) e a conta do mês */
  ia: { pronta: () => void; limite: () => void; uso: () => { rascunhos: number; entrada: number; saida: number } };
  /** os cards da cópia do LineChat da prévia (o "card antigo" citado no texto de um chamado) */
  cardsDoLineChat: () => Array<{ key: string | null; title: string; stepTitle: string | null; campos?: Record<string, unknown> }>;
  /** a hora de agora (os testes podem adiantar o relógio) */
  agora?: () => Date;
};

// =====================================================================
//  O ESTADO EM MEMÓRIA (as mesmas tabelas do servidor, grupo 10)
// =====================================================================

type Ator = { tipo: 'pessoa'; id: string; nome: string; permissoes: string[] } | { tipo: 'integracao'; id: string; nome: string };
/** Quem está agindo (o calendário da prévia usa o mesmo). */
export type AtorDemo = Ator;

type PainelRow = {
  id: string; nome: string; sigla: string; descricao: string | null; cor: CorPainel; ordem: number; acesso: 'todos' | 'escolhidos'; pessoas: string[];
  ajustes: AjustesDoPainel; ativo: boolean; proximoNumero: number; deletedAt: string | null;
  /** Gestão ou Vendas (escolhido ao criar; não muda) */
  tipo: TipoDePainel;
};
type EtapaRow = {
  id: string; painelId: string; nome: string; tipo: TipoEtapa; nivel: Nivel | null; ordem: number; obrigatorios: Obrigatorio[]; avisar: string[]; deletedAt: string | null;
  /** no painel de Vendas: o Ganho e o Perdido */
  resultado: ResultadoDaVenda | null;
};
type ChamadoRow = {
  id: string; painelId: string; etapaId: string; numero: number; codigo: string; tipoChamado: TipoChamado; titulo: string;
  relato: string | null; descricao: string | null; clienteId: string | null; contatoNome: string | null; contatoTelefone: string | null; sessaoId: string | null;
  origem: Origem; responsavelId: string | null; assuntoId: string | null; tipo: string | null; gravidade: Gravidade | null; alcance: Alcance | null;
  prioridade: Prioridade | null; motivoPrioridade: string | null; produtos: string[]; operadoras: string[]; etiquetas: string[];
  paiId: string | null; problemaId: string | null; checklist: ItemChecklist[];
  /** os valores dos campos do painel (pelo id do campo; o de um campo desativado fica guardado) */
  campos: ValoresDosCampos;
  solucao: string | null; causa: string | null; contorno: string | null; validacao: string | null;
  esperas: Espera[]; observadores: string[];
  respondidoEm: string | null; resolvidoEm: string | null; fechadoEm: string | null; reaberto: number;
  alertas: Record<string, string>; agendadoId: string | null; criadoPorId: string | null;
  criadoEm: string; atualizadoEm: string; ultimaAtividadeEm: string; deletedAt: string | null;
  /** a negociação (painel de Vendas): o valor em centavos, a empresa que ainda não é cliente e o motivo da perda */
  valor: number | null; empresa: string | null; motivoPerda: string | null;
  /** a negociação: a mensalidade de cada produto ({id do produto: centavos}); com ela, o valor é a soma */
  valoresDosProdutos: ValoresDosProdutos;
  /** a negociação: a ativação (paga uma vez, à parte da mensalidade), única ou por produto */
  ativacao: number | null;
  ativacoesDosProdutos: ValoresDosProdutos;
};
type EventoRow = { id: string; chamadoId: string; tipo: TipoEvento; userId: string | null; actorName: string | null; dados: Record<string, any>; em: string };
type NotaRow = { id: string; chamadoId: string; userId: string | null; actorName: string | null; texto: string; em: string; deletedAt: string | null; citados: string[] };
type AnexoRow = { id: string; chamadoId: string; notaId: string; nome: string; tipo: string; tamanho: number; url: string; porId: string | null; em: string; deletedAt: string | null };
type LigacaoRow = { id: string; de: string; para: string; tipo: TipoLigacaoChamado; porId: string | null; em: string; deletedAt: string | null };
type TempoRow = { id: string; chamadoId: string; userId: string | null; minutos: number; nota: string | null; dia: string; em: string; deletedAt: string | null };
type Andamento = { em: string; porId: string | null; porNome: string | null; acao: 'abriu' | 'cobrou' | 'fechou'; texto: string | null };
type CasoRow = {
  id: string; chamadoId: string; operadoraId: string | null; operadoraNome: string; protocolo: string; abertoEm: string; prometidoPara: string | null;
  cobrarACadaHoras: number | null; situacao: 'aberto' | 'fechado'; fechadoEm: string | null; historico: Andamento[];
};
type AgendadoRow = {
  id: string; painelId: string; titulo: string; relato: string | null; clienteId: string | null; responsavelId: string | null; assuntoId: string | null;
  prioridade: Prioridade | null; checklist: string[]; regra: RegraAgendado; ativo: boolean; proximaEm: string | null; ultimaEm: string | null;
  ultimoCodigo: string | null; criadoEm: string; deletedAt: string | null;
};
/** Uma etiqueta e a cor dela (o catálogo, como o `ticket_tags` do servidor). */
/** Uma etiqueta do catálogo de um painel (desde o 2.0.3, cada painel tem as suas). */
type EtiquetaRow = { id: string; painelId: string; nome: string; chave: string; cor: CorEtiqueta; criadoPorId: string | null; criadoEm: string; atualizadoEm: string };
/** Um aviso do sininho: de um chamado ou (2.0.2) o lembrete de um evento do calendário (o evento vai junto: a prévia não tem a junção do banco). */
type AvisoRow = {
  id: string; userId: string; chamadoId: string | null; evento?: { id: string; titulo: string; inicio: string } | null;
  tipo: TipoAviso; texto: string; em: string; lidoEm: string | null;
};
type WebhookRow = {
  id: string; nome: string; url: string; eventos: EventoWebhook[]; ativo: boolean; temSegredo: boolean;
  ultimoEm: string | null; ultimoOk: boolean | null; ultimaMsg: string | null; criadoEm: string; deletedAt: string | null;
};
type ChaveRow = { id: string; nome: string; inicio: string; criadaEm: string; criadaPorId: string | null; usadaEm: string | null; revogadaEm: string | null };
/** O WhatsApp dos chamados como fica guardado (a chave própria ficaria no cofre: aqui só se sabe se existe). */
/** como o servidor: o WhatsApp de cada pessoa não fica nos ajustes desde o 2.0.1 (mora no usuário) */
type AvisosGuardados = Omit<AvisosChamadosTela, 'temChavePropria' | 'temChaveLineChat' | 'pessoas'>;

/** O que uma mudança devolve: o chamado e a frase da auditoria (nula quando nada mudou). */
type Feito = { id: string; codigo: string; titulo: string; resumo: string | null; antes?: unknown; depois?: unknown; erro?: string };

type Esquema<T> = { safeParse(v: unknown): { success: true; data: T } | { success: false; error: { issues: Array<{ path: Array<string | number>; message: string }> } } };

const PREVIA = 'Prévia: nada foi enviado de verdade';
/** O endereço do Gestor (para o link do aviso no WhatsApp e os exemplos das Integrações). */
const ENDERECO = 'https://gestao.inglinesystems.com.br';
const FECHADOS_NO_QUADRO = 30;
const IMAGENS_NA_TELA = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
const LIMITE_ANEXO_BYTES = 10 * 1024 * 1024;
/** Quem abre o chamado do agendado na hora marcada: o próprio Gestor (o histórico mostra "Gestor"). */
const GESTOR: Ator = { tipo: 'integracao', id: 'relogio-dos-chamados', nome: 'Gestor' };
const MINUTO = 60_000;
const DIA = 86_400_000;
const NOME_DO_PRAZO = { resposta: 'resposta', solucao: 'solução' } as const;

const iso = (d: Date) => d.toISOString();
const unicos = (xs: string[]) => [...new Set(xs.map((x) => x.trim()).filter(Boolean))];
const mesmoConjunto = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x));
const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;
const lista = (xs: string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} e ${xs[xs.length - 1]}`);
const juntar = (xs: Array<string | null | undefined>) => xs.filter(Boolean).join(', ') || null;
const minuscula = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
/** A ordem de quem foi gravado primeiro: a data e, empatando, a ordem em que entrou na lista (`sort` é estável). */
const porData = <T extends { em: string }>(xs: T[]) => [...xs].sort((a, b) => a.em.localeCompare(b.em));

/** Os erros com o mesmo código, a mesma mensagem e os mesmos `details` do servidor. */
const erro = (status: number, mensagem: string, details?: unknown) => new ApiError(status, mensagem, (details ?? null) as never);
const bad = (mensagem: string, details?: unknown) => erro(400, mensagem, details);
const naoAchado = (o = 'Registro') => erro(404, `${o} não encontrado`);
const proibido = (mensagem: string) => erro(403, mensagem);
const conflito = (mensagem: string) => erro(409, mensagem);

/** O formato do pedido conferido como a rota confere (antes da permissão): "Dados inválidos" com a lista de campos. */
function ler<T>(esquema: Esquema<T>, v: unknown): T {
  const r = esquema.safeParse(v);
  if (!r.success) throw new ApiError(400, 'Dados inválidos', r.error.issues.map((i) => ({ field: i.path.join('.') || '(geral)', message: i.message })));
  return r.data;
}
/** A querystring como o servidor recebe: o que é vazio não vai (o `qs` do client.ts faz igual). */
function limparQuery(q: Record<string, unknown> | null | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(q ?? {})) {
    if (v === undefined || v === null || v === '' || v === false) continue;
    out[k] = String(Array.isArray(v) ? v[v.length - 1] : v);
  }
  return out;
}
/** O tipo de verdade da imagem, pelos primeiros bytes (SVG nunca é imagem que abre na tela). */
function tipoDaImagem(b64: string): string | null {
  let b = '';
  try { b = atob(b64.slice(0, 24).replace(/[^A-Za-z0-9+/]/g, '')); } catch { return null; }
  const c = (i: number) => b.charCodeAt(i);
  if (b.length >= 8 && c(0) === 0x89 && b.slice(1, 4) === 'PNG' && c(4) === 0x0d && c(5) === 0x0a && c(6) === 0x1a && c(7) === 0x0a) return 'image/png';
  if (b.length >= 3 && c(0) === 0xff && c(1) === 0xd8 && c(2) === 0xff) return 'image/jpeg';
  if (b.length >= 6 && (b.slice(0, 6) === 'GIF87a' || b.slice(0, 6) === 'GIF89a')) return 'image/gif';
  if (b.length >= 12 && b.slice(0, 4) === 'RIFF' && b.slice(8, 12) === 'WEBP') return 'image/webp';
  return null;
}
const bytesDoBase64 = (b64: string) => Math.floor((b64.length * 3) / 4) - (b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0);
/** 32 bytes ao acaso em base64url: o segredo do webhook e a chave de API (como o servidor sorteia). */
function sortear(): string {
  const b = new Uint8Array(32);
  // (todo navegador de hoje tem o `crypto`; a página aberta como arquivo num navegador antigo cai no sorteio simples)
  if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(b);
  else for (let i = 0; i < b.length; i++) b[i] = Math.floor(Math.random() * 256);
  return btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
/** IP da rede de dentro (o mesmo critério do servidor; na prévia, sem resolver o nome: só o IP escrito no endereço). */
function ipInterno(ip: string): boolean {
  const m = /^(\d{1,3})\.(\d{1,3})\.\d{1,3}\.\d{1,3}$/.exec(ip);
  if (m) {
    const a = Number(m[1]); const b = Number(m[2]);
    return a === 0 || a === 10 || a === 127 || a >= 224 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254)
      || (a === 172 && b >= 16 && b <= 31) || (a === 192 && (b === 168 || b === 0)) || (a === 198 && (b === 18 || b === 19));
  }
  const s = ip.toLowerCase();
  return s === '::' || s === '::1' || /^f[cd]/.test(s) || /^fe[89ab]/.test(s);
}

// =====================================================================
//  A LIXEIRA DA ADMINISTRAÇÃO (o demo.ts chama estas duas)
// =====================================================================

type Instancia = {
  lixeira: () => TrashItem[]; restaurarDaLixeira: (id: string) => { ok: boolean }; diagnostico: () => { erros: string[]; chamados: number };
  chamadosDoContato: (clienteId: string, whatsapp: string) => number;
  calendario: AcessoDoCalendarioDemo;
};

/**
 * O que o calendário da prévia (demo-calendario.ts, 2.0.1) usa dos chamados: os painéis e quem vê cada
 * um (a mesma regra), quem está agindo e os chamados (o "ligado a um chamado" do evento).
 */
export type AcessoDoCalendarioDemo = {
  /** os exemplos dos chamados (na primeira chamada) */
  preparar: () => void;
  eu: () => Ator;
  atorDaPessoa: (userId: string) => Ator;
  /** os painéis fora da lixeira, em ordem */
  paineis: () => Painel[];
  podeVerPainel: (p: Pick<Painel, 'acesso' | 'pessoas' | 'tipo'>, a: Ator) => boolean;
  /** o chamado fora da lixeira (pelo id) */
  chamado: (id: string) => { id: string; codigo: string; titulo: string; painelId: string; clienteId: string | null } | null;
  /** os chamados de exemplo (para ligar os eventos de exemplo a eles) */
  chamados: () => Array<{ id: string; codigo: string; titulo: string; painelId: string; clienteId: string | null }>;
  /**
   * A negociação (o Simulador do Comercial, 2.0.2): o chamado fora da lixeira, pelo id ou pelo código, com a
   * empresa (o cliente ou a que ainda não é cliente) e o resultado da etapa (ganho, perdido).
   */
  negociacao: (ref: string) => { id: string; codigo: string; titulo: string; painelId: string; empresa: string | null; resultado: 'ganho' | 'perdido' | null } | null;
  /**
   * O lembrete de um evento (2.0.2): o sininho de cada pessoa ativa, conforme os Ajustes dos avisos (o WhatsApp,
   * na prévia, não aparece em lugar nenhum). `lido`: o lembrete antigo dos exemplos já foi visto. Devolve quantos receberam.
   */
  /** o lembrete (padrão) ou o aviso de que o evento entrou (`qual`, 2.0.2) */
  avisarDoCalendario: (a: { qual?: 'lembrete' | 'evento_novo'; para: string[]; evento: { id: string; titulo: string; inicio: string }; texto: string }, em: Date, lido?: boolean) => number;
};
/**
 * A margem das ganhas no relatório do Comercial (2.0.2): o Simulador da prévia (demo-simulador.ts) diz, de cada
 * negociação, a simulação mexida por último (o cenário principal) e as faixas do sinal.
 */
let fonteDasMargens: (() => { margens: ReadonlyMap<string, MargemDaNegociacao>; faixas: FaixasDoSinal }) | null = null;
export function fonteDasMargensDemo(f: typeof fonteDasMargens) { fonteDasMargens = f; }
/** Os relógios de fora (o do calendário, 2.0.2): andam junto com o dos chamados, a cada leitura da prévia. */
const relogiosDeFora: Array<(agora: Date) => void> = [];
export function aoVoltarORelogioDemo(f: (agora: Date) => void) { relogiosDeFora.push(f); }
let instancia: Instancia | null = null;

/** Os chamados na lixeira, para a Administração › Lixeira (como o `listTrash` do servidor). */
export function lixeiraDosChamadosDemo(): TrashItem[] {
  return instancia?.lixeira() ?? [];
}
/** "Restaurar" na Administração › Lixeira: precisa cuidar dos chamados, e o histórico do chamado registra. */
export function restaurarChamadoDaLixeiraDemo(id: string): { ok: boolean } {
  if (!instancia) throw naoAchado('Chamado');
  return instancia.restaurarDaLixeira(id);
}
/** Quantos chamados do cliente têm este WhatsApp (a coluna "Chamados" da aba Contatos do cliente). */
export function chamadosDoContatoDemo(clienteId: string, whatsapp: string): number {
  return instancia?.chamadosDoContato(clienteId, whatsapp) ?? 0;
}
/** O calendário da prévia lê os painéis, quem vê e os chamados daqui (os chamados nascem primeiro, no demo.ts). */
export function acessoDoCalendarioDemo(): AcessoDoCalendarioDemo {
  if (!instancia) throw naoAchado('Painel');
  return instancia.calendario;
}
/** Para o teste da prévia: o que deu errado ao montar os exemplos (deve ser nada) e quantos chamados há. */
export function diagnosticoDosChamadosDemo() {
  return instancia?.diagnostico() ?? null;
}

// =====================================================================
//  O MÓDULO
// =====================================================================

export function criarAtendimentoDemo(ctx: ContextoAtendimentoDemo): Api['atendimento'] {
  const { S } = ctx;
  const agoraReal = ctx.agora ?? (() => new Date());
  const novoId = () => ctx.id();

  // a equipe entra já (e não na primeira chamada): é com estes e-mails que se entra na prévia
  for (const p of EQUIPE_NOVA) {
    if (S.users.some((u) => u.email === p.email)) continue;
    const papel = S.roles.find((r) => r.key === p.papel);
    if (papel) S.users.push({ id: novoId(), name: p.nome, email: p.email, password: 'demo', roleId: papel.id, active: true, lastLoginAt: null });
  }

  const A = {
    semeado: false,
    /** durante a montagem dos exemplos: sem auditoria e sem webhook (é o passado) */
    semeando: false,
    paineis: [] as PainelRow[], etapas: [] as EtapaRow[], assuntos: [] as Assunto[], campos: [] as CampoPersonalizado[],
    chamados: [] as ChamadoRow[], eventos: [] as EventoRow[], notas: [] as NotaRow[], anexos: [] as AnexoRow[], ligacoes: [] as LigacaoRow[],
    tempos: [] as TempoRow[], casos: [] as CasoRow[], agendados: [] as AgendadoRow[],
    contatos: new Map<string, { clienteId: string; nome: string | null }>(),
    /** as etiquetas com a cor (o catálogo, como o `ticket_tags` do servidor) */
    etiquetas: [] as EtiquetaRow[],
    avisos: [] as AvisoRow[], webhooks: [] as WebhookRow[], chaves: [] as ChaveRow[],
    prazos: JSON.parse(JSON.stringify(AJUSTES_PRAZOS_PADRAO)) as AjustesPrazos,
    whats: { ...AVISOS_CHAMADOS_PADRAO, eventos: { ...AVISOS_CHAMADOS_PADRAO.eventos } } as AvisosGuardados,
    temChavePropria: false,
    integ: { sites: [] as string[], linkConversa: '' },
    /** o mapa do robô do LineChat (2.0.1); na prévia o robô não chama, então não há último pedido */
    mapaRobo: mapaDeFabrica() as MapaDoRobo,
    ultimoRobo: null as UltimoPedidoDoRobo | null,
    ultimaVolta: 0,
    erros: [] as string[],
    /** o robô do LineChat (a chave de API de exemplo) */
    robo: null as Ator | null,
    /** o que a IA "leu" na conversa dos chamados do robô (a prévia não tem a conversa nem IA de verdade) */
    iaExemplos: new Map<string, IaDoExemplo>(),
  };

  // ---------- quem está agindo ----------

  const permissoesDe = (roleId: string) => S.roles.find((r) => r.id === roleId)?.permissions ?? [];
  function atorDaPessoa(userId: string): Ator {
    const u = S.users.find((x) => x.id === userId);
    if (!u) throw naoAchado('Usuário');
    return { tipo: 'pessoa', id: u.id, nome: u.name, permissoes: permissoesDe(u.roleId) };
  }
  /** Quem está na prévia agora (a permissão já foi conferida pelo `requirePerm`). */
  function eu(): Ator {
    if (!S.me) throw erro(401, 'Faça login para continuar');
    return atorDaPessoa(S.me.id);
  }
  const podeVerChamados = (a: Ator) => a.tipo === 'integracao' || a.permissoes.includes('support.read');
  /** O Comercial (2.0.1): os painéis de Vendas são de quem tem a permissão dele (como no servidor). */
  const podeVerVendas = (a: Ator) => a.tipo === 'integracao' || a.permissoes.includes('sales.read');
  const podeTrabalhar = (a: Ator) => a.tipo === 'integracao' || a.permissoes.includes('tickets.work');
  const podeCuidar = (a: Ator) => a.tipo === 'pessoa' && a.permissoes.includes('tickets.manage');
  const pessoaDoAtor = (a: Ator | null) => (a?.tipo === 'pessoa' ? a.id : null);
  const integracaoDoAtor = (a: Ator | null) => (a?.tipo === 'integracao' ? a.nome : null);
  function exigirTrabalhar(a: Ator) {
    if (!podeTrabalhar(a)) throw proibido('Esta ação exige a permissão "tickets.work"');
  }
  const pessoaCurta = (id: string | null | undefined) => {
    if (!id) return null;
    return { id, nome: S.users.find((u) => u.id === id)?.name ?? '(pessoa removida)' };
  };
  const nomeCliente = (id: string | null) => (id ? S.clients.find((c) => c.id === id)?.tradeName ?? '(cliente removido)' : null);
  const clienteVivo = (id: string) => S.clients.some((c) => c.id === id && !c.deletedAt);

  // ---------- os painéis ----------

  const etapaParaTela = (e: EtapaRow): EtapaPainel => ({ id: e.id, nome: e.nome, tipo: e.tipo, nivel: e.nivel, obrigatorios: [...e.obrigatorios], avisar: [...e.avisar], resultado: e.resultado });
  /** A etapa pelo id, mesmo a que saiu do painel (um chamado antigo pode citá-la no histórico). */
  const etapaPorId = (id: string) => A.etapas.find((e) => e.id === id);
  const etapaDe = (id: string): EtapaPainel | null => { const e = etapaPorId(id); return e ? etapaParaTela(e) : null; };
  const situacaoDe = (t: ChamadoRow): SituacaoDoChamado => situacaoDaEtapa(etapaPorId(t.etapaId)?.tipo ?? 'andamento');

  function painelParaTela(p: PainelRow): Painel {
    const abertos = A.chamados.filter((t) => !t.deletedAt && t.painelId === p.id && ['entrada', 'andamento'].includes(etapaPorId(t.etapaId)?.tipo ?? '')).length;
    return {
      id: p.id, nome: p.nome, sigla: p.sigla, descricao: p.descricao, cor: p.cor, ordem: p.ordem, acesso: p.acesso, pessoas: [...p.pessoas],
      ajustes: {
        ...p.ajustes, tipos: [...p.ajustes.tipos], obrigatoriosAoAbrir: [...p.ajustes.obrigatoriosAoAbrir], supervisores: [...p.ajustes.supervisores],
        camposDesligados: [...(p.ajustes.camposDesligados ?? AJUSTES_PAINEL_PADRAO.camposDesligados)],
        motivosDePerda: [...(p.ajustes.motivosDePerda ?? [])], metaMensal: p.ajustes.metaMensal ?? null,
      },
      etapas: A.etapas.filter((e) => e.painelId === p.id && !e.deletedAt).sort((a, b) => a.ordem - b.ordem).map(etapaParaTela),
      ativo: p.ativo, abertos, tipo: p.tipo,
    };
  }
  /** Os painéis fora da lixeira, em ordem. */
  const paineis = (): Painel[] => A.paineis.filter((p) => !p.deletedAt).sort((a, b) => a.ordem - b.ordem || a.nome.localeCompare(b.nome, 'pt-BR')).map(painelParaTela);
  const painelPorId = (id: string) => paineis().find((p) => p.id === id);

  /** Quem cuida dos chamados vê todos; num painel "escolhidos", só as pessoas da lista; a integração vê todos. */
  function podeVerPainel(p: Pick<Painel, 'acesso' | 'pessoas' | 'tipo'>, a: Ator): boolean {
    if (a.tipo === 'integracao') return true;
    const vendas = p.tipo === 'vendas';
    if (vendas && !podeVerVendas(a)) return false;
    if (podeCuidar(a)) return true;
    if (!vendas && !podeVerChamados(a)) return false;
    return p.acesso === 'todos' || p.pessoas.includes(a.id);
  }
  const visiveis = (a: Ator) => new Set(paineis().filter((p) => podeVerPainel(p, a)).map((p) => p.id));
  /** Quem pode ser citado com @ numa anotação do painel: as pessoas ativas que veem o painel (como o servidor). */
  const quemVeOPainel = (p: Pick<Painel, 'acesso' | 'pessoas' | 'tipo'>): PessoaCurta[] => S.users
    .filter((u) => u.active && podeVerPainel(p, atorDaPessoa(u.id)))
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
    .map((u) => ({ id: u.id, nome: u.name }));

  // ---------- o chamado para a tela (o cartão) ----------

  const esperaAberta = (esperas: Espera[]) => [...esperas].reverse().find((w) => !w.fim) ?? null;

  function prazosDe(t: ChamadoRow, agora: Date) {
    const painel = A.paineis.find((p) => p.id === t.painelId);
    return estadoDosPrazos({
      criadoEm: t.criadoEm, prioridade: t.prioridade, respondidoEm: t.respondidoEm, resolvidoEm: t.resolvidoEm ?? t.fechadoEm, esperas: t.esperas,
      contaPrazo: painel?.ajustes.contaPrazo ?? true,
    }, A.prazos, agora);
  }

  type Parentes = { filhos: Map<string, SituacaoDoChamado[]>; incidentes: Map<string, number>; anotacoes: Map<string, number>; codigos: Map<string, string> };
  /** As contagens que dependem dos outros chamados (fora da lixeira), como o `parentesDe` do servidor. */
  function parentes(): Parentes {
    const filhos = new Map<string, SituacaoDoChamado[]>();
    const incidentes = new Map<string, number>();
    for (const t of A.chamados) {
      if (t.deletedAt) continue;
      if (t.paiId) filhos.set(t.paiId, [...(filhos.get(t.paiId) ?? []), situacaoDe(t)]);
      if (t.problemaId) incidentes.set(t.problemaId, (incidentes.get(t.problemaId) ?? 0) + 1);
    }
    const anotacoes = new Map<string, number>();
    for (const n of A.notas) if (!n.deletedAt) anotacoes.set(n.chamadoId, (anotacoes.get(n.chamadoId) ?? 0) + 1);
    return { filhos, incidentes, anotacoes, codigos: new Map(A.chamados.map((t) => [t.id, t.codigo])) };
  }

  /** Os campos do painel, na ordem dos Ajustes (todos, ou só os ativos). */
  const camposDoPainel = (painelId: string, soAtivos = false) =>
    A.campos.filter((c) => c.painelId === painelId && (!soAtivos || c.ativo)).sort((a, b) => a.ordem - b.ordem || a.nome.localeCompare(b.nome, 'pt-BR'));
  const campoParaTela = (c: CampoPersonalizado): CampoPersonalizado => ({ ...c, opcoes: c.opcoes.map((o) => ({ ...o })) });

  /** O chamado no quadro e na lista: sem o que o painel desligou (fica guardado) e com os campos ativos dele. */
  function cartao(t: ChamadoRow, par: Parentes, agora: Date): CartaoChamado {
    const e = etapaPorId(t.etapaId);
    const aberta = esperaAberta(t.esperas);
    const p = A.paineis.find((x) => x.id === t.painelId);
    const usa = (c: CampoDoSistema) => !p || campoLigado({ camposDesligados: p.ajustes.camposDesligados ?? AJUSTES_PAINEL_PADRAO.camposDesligados }, c);
    const assunto = t.assuntoId && usa('assunto') ? A.assuntos.find((a) => a.id === t.assuntoId) : undefined;
    const filhos = par.filhos.get(t.id) ?? [];
    return {
      id: t.id, codigo: t.codigo, numero: t.numero, tipoChamado: t.tipoChamado, titulo: t.titulo,
      painelId: t.painelId, etapaId: t.etapaId, situacao: situacaoDaEtapa(e?.tipo ?? 'andamento'), nivel: e?.nivel ?? null,
      cliente: t.clienteId ? { id: t.clienteId, nome: nomeCliente(t.clienteId)! } : null,
      contato: t.contatoNome || t.contatoTelefone ? { nome: t.contatoNome, telefone: t.contatoTelefone } : null,
      responsavel: pessoaCurta(t.responsavelId),
      prioridade: t.prioridade, gravidade: usa('gravidade') ? t.gravidade : null, alcance: usa('alcance') ? t.alcance : null, tipo: usa('tipo') ? t.tipo : null,
      assunto: assunto ? { id: assunto.id, nome: assunto.nome, caminho: caminhoDoAssunto(assunto.id, A.assuntos), ativo: assunto.ativo } : null,
      produtos: usa('produtos') ? t.produtos.map((id) => { const x = S.products.find((y) => y.id === id); return { id, nome: x?.name ?? '?', cor: x?.color ?? '#888888' }; }) : [],
      operadoras: usa('operadoras') ? t.operadoras.map((id) => ({ id, nome: S.carriers.find((x) => x.id === id)?.name ?? '?' })) : [],
      etiquetas: [...t.etiquetas],
      campos: valoresVisiveis(A.campos, t.painelId, t.campos),
      espera: aberta ? { tipo: aberta.tipo, motivo: aberta.motivo, desde: aberta.inicio } : null,
      prazos: prazosDe(t, agora),
      pai: t.paiId ? { id: t.paiId, codigo: par.codigos.get(t.paiId) ?? '?' } : null,
      problema: t.problemaId ? { id: t.problemaId, codigo: par.codigos.get(t.problemaId) ?? '?' } : null,
      filhos: { total: filhos.length, abertos: filhos.filter((s) => s === 'aberto').length },
      incidentes: par.incidentes.get(t.id) ?? 0,
      anotacoes: par.anotacoes.get(t.id) ?? 0,
      origem: t.origem, reaberto: t.reaberto,
      criadoEm: t.criadoEm, atualizadoEm: t.atualizadoEm, ultimaAtividadeEm: t.ultimaAtividadeEm,
      resolvidoEm: t.resolvidoEm, fechadoEm: t.fechadoEm,
      // a negociação (painel de Vendas): nos outros painéis, tudo vazio
      valor: t.valor, empresa: t.empresa,
      // o valor por produto: só dos produtos que o cartão mostra (como no servidor)
      valoresDosProdutos: usa('produtos') ? Object.fromEntries(Object.entries(t.valoresDosProdutos).filter(([id]) => t.produtos.includes(id))) : {},
      ativacao: t.ativacao,
      ativacoesDosProdutos: usa('produtos') ? Object.fromEntries(Object.entries(t.ativacoesDosProdutos).filter(([id]) => t.produtos.includes(id))) : {},
      resultado: e?.resultado ?? null, motivoPerda: e?.resultado === 'perdido' ? t.motivoPerda : null,
    };
  }

  /** Todos os chamados (fora da lixeira) dos painéis que a pessoa vê, com o texto de busca. */
  function cartoesVisiveis(a: Ator, agora: Date): CartaoParaLista[] {
    const vis = visiveis(a);
    const par = parentes();
    return A.chamados.filter((t) => !t.deletedAt && vis.has(t.painelId)).map((t) => {
      const c = cartao(t, par, agora);
      return { ...c, busca: textoDeBusca(c, [t.relato, t.descricao, t.solucao, t.causa, ...textosDosCampos(camposDoPainel(t.painelId, true), c.campos)]) };
    });
  }
  const semBusca = (c: CartaoParaLista): CartaoChamado => { const { busca: _b, ...resto } = c; return resto; };

  // ---------- achar o chamado ----------

  function chamadoOu404(ref: string, opts: { lixeira?: boolean } = {}): ChamadoRow {
    const m = /^\s*([A-Za-z]{2,5})[\s-]*(\d{1,7})\s*$/.exec(ref);
    // o id primeiro: o id da prévia ("demo" e um número) também tem cara de código ("DEMO-1234")
    const t = A.chamados.find((x) => x.id === ref) ?? (m ? A.chamados.find((x) => x.codigo === `${m[1]!.toUpperCase()}-${Number(m[2])}`) : undefined);
    if (!t || (t.deletedAt && !opts.lixeira)) throw naoAchado('Chamado');
    return t;
  }
  /** O chamado, conferindo se a pessoa vê o painel dele (o painel "escolhidos" não existe para quem não está nele: 404). */
  function chamadoVisivel(ref: string, a: Ator, opts: { lixeira?: boolean } = {}): ChamadoRow {
    const t = chamadoOu404(ref, opts);
    const p = painelPorId(t.painelId);
    if (!p || !podeVerPainel(p, a)) throw naoAchado('Chamado');
    return t;
  }
  /** Outro chamado citado no pedido (o pai, o problema, a ligação): se a pessoa não o vê, "não achei". */
  function outroChamado(ref: string, a: Ator): ChamadoRow {
    try {
      return chamadoVisivel(ref, a);
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) throw bad(`Não achei o chamado ${ref.trim()}.`);
      throw e;
    }
  }

  // ---------- o histórico, o sininho, o WhatsApp e os webhooks ----------

  function registrarEvento(chamadoId: string, tipo: TipoEvento, ator: Ator | null, dados: Record<string, unknown>, em: Date) {
    A.eventos.push({ id: novoId(), chamadoId, tipo, userId: pessoaDoAtor(ator), actorName: integracaoDoAtor(ator), dados: dados as Record<string, any>, em: iso(em) });
  }
  const tocar = (t: ChamadoRow, em: Date) => { t.ultimaAtividadeEm = iso(em); t.atualizadoEm = iso(em); };
  /** As horas dos eventos de uma ação: cada um um milésimo depois do outro (o histórico fica na ordem). */
  const relogio = (agora: Date) => { let n = 0; return () => new Date(agora.getTime() + n++); };

  const temChaveDoEnvio = () => (A.whats.usarChaveDoLineChat ? S.ajustesLineChat.temToken : A.temChavePropria);
  /** Manda pelo WhatsApp — na prévia, confere tudo como o servidor e para aí: nada sai. */
  function mandarWhatsApp(p: { de: 'cliente' | 'equipe'; para: string }): { ok: boolean; mensagem: string; modelo?: boolean } {
    const v = A.whats;
    if (!v.ativo) return { ok: false, mensagem: 'O WhatsApp dos chamados está desligado (Painéis › Ajustes › Avisos).' };
    const de = p.de === 'cliente' ? v.numeroCliente : v.numeroEquipe;
    if (!de) return { ok: false, mensagem: `Falta o número que envia para ${p.de === 'cliente' ? 'o cliente' : 'a equipe'} (Painéis › Ajustes › Avisos).` };
    if (!numeroWhatsApp(p.para)) return { ok: false, mensagem: `O número ${p.para} não é um WhatsApp válido.` };
    // ao cliente, pelo modelo aprovado (o WhatsApp oficial exige): sem o modelo (ou sem o arquivo dele), nada sai
    const peloModelo = p.de === 'cliente' && v.envioCliente === 'modelo';
    if (peloModelo) { const falta = faltaNoModeloAprovado(v.template); if (falta) return { ok: false, mensagem: falta }; }
    if (!temChaveDoEnvio()) return { ok: false, mensagem: v.usarChaveDoLineChat ? 'Falta a chave do LineChat (Administração › Ajustes › Chamados do LineChat).' : 'Falta a chave da API (Painéis › Ajustes › Avisos).' };
    return { ok: true, mensagem: PREVIA, modelo: peloModelo };
  }
  const whatsAppPronto = (): OpcoesAtendimento['whatsapp'] => {
    const v = A.whats; const chave = temChaveDoEnvio();
    const peloModelo = v.envioCliente === 'modelo';
    const cliente = v.ativo && chave && !!v.numeroCliente && (!peloModelo || !faltaNoModeloAprovado(v.template));
    return {
      cliente, equipe: v.ativo && chave && !!v.numeroEquipe,
      mensagemCliente: cliente ? mensagemAoCliente(v) : null,
    };
  };

  /** Avisa a equipe: o sininho e o WhatsApp, conforme os Ajustes. Quem fez a ação (`menos`) não recebe. */
  function avisarEquipe(
    a: { evento: EventoAviso; tipo?: TipoAviso; para: Array<string | null | undefined>; chamado: { id: string; codigo: string; titulo: string }; texto: string; menos?: string | null },
    em: Date,
  ) {
    const para = [...new Set(a.para.filter((x): x is string => !!x && x !== a.menos))];
    if (!para.length) return;
    const canais = A.whats.eventos[a.evento] ?? { tela: true, whatsapp: false };
    const quem = S.users.filter((u) => para.includes(u.id) && u.active);
    if (!quem.length) return;
    if (canais.tela) for (const u of quem) A.avisos.push({ id: novoId(), userId: u.id, chamadoId: a.chamado.id, tipo: a.tipo ?? a.evento, texto: a.texto, em: iso(em), lidoEm: null });
    if (!canais.whatsapp || !A.whats.ativo || !A.whats.numeroEquipe) return;
    // o WhatsApp de cada um mora no usuário (com o número e sem a pausa)
    const numeros = quem.filter((u) => u.whatsapp && u.whatsappAvisos !== false).map((u) => ({ u, numero: u.whatsapp! }));
    // sem a chave, nem tenta (como o servidor): o histórico não ganha um "não foi" a cada aviso
    if (!temChaveDoEnvio()) return;
    // o servidor manda em segundo plano: a linha do histórico entra logo depois dos eventos da ação
    numeros.forEach(({ u, numero }, i) => {
      const r = mandarWhatsApp({ de: 'equipe', para: numero });
      registrarEvento(a.chamado.id, 'aviso_equipe', null, { para: u.name, ok: r.ok, ...(r.ok ? {} : { erro: r.mensagem }) }, new Date(em.getTime() + 100 + i));
    });
  }

  /** O começo de um texto, para caber num aviso. */
  const trechoDoAviso = (t: string, max: number) => (t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t);
  const SEPARADOR_DE_CAMPOS = ' · ';
  /**
   * Os observadores recebem toda atualização (como o servidor): quem fez não recebe, nem quem já recebeu
   * outro aviso da mesma ação; as mudanças de campo de uma pessoa juntam num aviso só, na tela, enquanto
   * ele não foi lido (por 30 minutos).
   */
  function avisarObservadores(
    a: {
      chamado: { id: string; codigo: string; titulo: string }; observadores: string[]; texto?: string; menos?: string | null;
      jaAvisados?: Array<string | null | undefined>; campos?: { quem: string; nomes: string[] };
    },
    em: Date,
  ) {
    const fora = new Set([a.menos, ...(a.jaAvisados ?? [])].filter((x): x is string => !!x));
    const para = [...new Set(a.observadores)].filter((x) => !fora.has(x));
    if (!para.length) return;
    if (!a.campos) { if (a.texto) avisarEquipe({ evento: 'observador', para, chamado: a.chamado, texto: a.texto }, em); return; }
    const nomes = [...new Set(a.campos.nomes.filter(Boolean))];
    if (!nomes.length || !(A.whats.eventos.observador ?? { tela: true }).tela) return;
    const inicio = `${a.campos.quem} mudou no ${a.chamado.codigo}: `;
    const desde = em.getTime() - 30 * MINUTO;
    for (const u of S.users.filter((x) => para.includes(x.id) && x.active)) {
      const junta = [...A.avisos].reverse().find((n) => n.userId === u.id && n.chamadoId === a.chamado.id && n.tipo === 'observador' && !n.lidoEm && Date.parse(n.em) > desde && n.texto.startsWith(inicio));
      if (junta) {
        junta.texto = inicio + [...new Set([...junta.texto.slice(inicio.length).split(SEPARADOR_DE_CAMPOS), ...nomes])].join(SEPARADOR_DE_CAMPOS);
        junta.em = iso(em);
      } else {
        A.avisos.push({ id: novoId(), userId: u.id, chamadoId: a.chamado.id, tipo: 'observador', texto: inicio + nomes.join(SEPARADOR_DE_CAMPOS), em: iso(em), lidoEm: null });
      }
    }
  }
  const contarAosObservadores = (ator: Ator, t: ChamadoRow, texto: string, em: Date) =>
    avisarObservadores({ chamado: curto(t), observadores: t.observadores, texto, menos: pessoaDoAtor(ator) }, em);
  const camposAosObservadores = (ator: Ator, t: ChamadoRow, nomes: string[], em: Date) =>
    avisarObservadores({ chamado: curto(t), observadores: t.observadores, menos: pessoaDoAtor(ator), campos: { quem: ator.nome, nomes } }, em);

  /** O webhook "recebe" o evento: na prévia, só fica anotado como último envio (nada sai). */
  function emitir(evento: EventoWebhook, _ticketId: string, _extra: Record<string, unknown> = {}) {
    if (A.semeando) return;
    for (const w of A.webhooks) {
      if (w.deletedAt || !w.ativo || !w.eventos.includes(evento)) continue;
      w.ultimoEm = iso(agoraReal()); w.ultimoOk = true; w.ultimaMsg = `${evento} (${PREVIA})`;
    }
  }
  /** A auditoria da prévia (fora da montagem dos exemplos, que é o passado). */
  function auditar(action: string, entityType: string, summary: string, entityId: string | null = null, extra: { before?: unknown; after?: unknown } = {}) {
    if (A.semeando) return;
    ctx.audit(action, entityType, summary, entityId, extra);
  }
  /** O que o Gestor faz sozinho (o relógio) vai para a auditoria sem pessoa, como no servidor. */
  function auditarSistema(action: string, entityType: string, summary: string, entityId: string | null) {
    if (A.semeando) return;
    S.audit.unshift({ id: novoId(), action, entityType, entityId, summary, before: null, after: null, userName: null, userId: null, createdAt: iso(agoraReal()) });
  }

  // ---------- os pedaços que a regra dos obrigatórios usa ----------

  const minutosGastos = (id: string) => A.tempos.filter((x) => x.chamadoId === id && !x.deletedAt).reduce((s, x) => s + x.minutos, 0);
  function dadosDoChamado(t: ChamadoRow): DadosObrigatorios {
    return {
      tipoChamado: t.tipoChamado, clienteId: t.clienteId, contatoNome: t.contatoNome, contatoTelefone: t.contatoTelefone,
      relato: t.relato, descricao: t.descricao, assuntoId: t.assuntoId, tipo: t.tipo, gravidade: t.gravidade, alcance: t.alcance, prioridade: t.prioridade,
      produtos: t.produtos, operadoras: t.operadoras, responsavelId: t.responsavelId,
      solucao: t.solucao, causa: t.causa, validacao: t.validacao, checklist: t.checklist, tempoMinutos: minutosGastos(t.id), campos: t.campos,
      valor: t.valor, ativacao: t.ativacao, empresa: t.empresa, motivoPerda: t.motivoPerda,
    };
  }
  /** Os campos do painel que vieram no pedido, conferidos (as mesmas mensagens do servidor). */
  function lerCampos(painel: Painel, pedidos: Record<string, unknown>, atuais: ValoresDosCampos = {}) {
    const r = lerCamposDoPedido(camposDoPainel(painel.id), painel.nome, pedidos, atuais);
    if (!r.ok) throw bad(r.erro);
    return r.itens;
  }
  /** Os filhos do chamado (fora da lixeira, em qualquer painel: a regra do pai é do chamado). */
  const filhosDoChamado = (id: string) => [...A.chamados].filter((f) => f.paiId === id && !f.deletedAt)
    .sort((a, b) => a.criadoEm.localeCompare(b.criadoEm)).map((f) => ({ id: f.id, codigo: f.codigo, painelId: f.painelId, situacao: situacaoDe(f) }));
  /** A negociação (o registro de um painel de Vendas): não tem pai, filhos nem problema. */
  const ehNegociacao = (c: ChamadoRow) => A.paineis.find((p) => p.id === c.painelId)?.tipo === 'vendas';

  // ---------- conferir o que o pedido cita ----------

  function conferirCliente(id: string) { if (!clienteVivo(id)) throw bad('O cliente escolhido não existe (ou está na lixeira).'); }
  function conferirProdutos(ids: string[]) {
    if (ids.some((id) => !S.products.some((p) => p.id === id && !p.deletedAt))) throw bad('Um dos produtos escolhidos não existe (ou está na lixeira).');
  }
  function conferirOperadoras(ids: string[]) {
    if (ids.some((id) => !S.carriers.some((c) => c.id === id))) throw bad('Uma das operadoras escolhidas não está no cadastro.');
  }
  function conferirPessoa(id: string, quem = 'O responsável escolhido') {
    const u = S.users.find((x) => x.id === id);
    if (!u || !u.active) throw bad(`${quem} não existe ou está desativado.`);
  }
  function conferirAssunto(id: string, painel: Painel) {
    const a = A.assuntos.find((x) => x.id === id);
    if (!a || a.painelId !== painel.id || !a.ativo) throw bad(`Esse assunto não é do painel ${painel.nome} (ou foi desativado).`);
    return a;
  }
  function conferirTipo(tipo: string | null | undefined, painel: Painel): string | null {
    if (!tipo) return null;
    if (!painel.ajustes.tipos.length) return tipo;
    const achado = painel.ajustes.tipos.find((x) => paraBusca(x) === paraBusca(tipo));
    if (!achado) throw bad(`"${tipo}" não é um dos tipos do painel ${painel.nome} (${painel.ajustes.tipos.join(', ')}).`);
    return achado;
  }
  const itemNovo = (texto: string, doAssunto: boolean): ItemChecklist => ({ id: novoId(), texto, feito: false, porId: null, em: null, doAssunto });
  const caminho = (id: string | null) => (id ? caminhoDoAssunto(id, A.assuntos) || null : null);
  const nomesProdutos = (ids: string[]) => juntar(ids.map((id) => S.products.find((p) => p.id === id)?.name ?? '?'));
  const nomesOperadoras = (ids: string[]) => juntar(ids.map((id) => S.carriers.find((c) => c.id === id)?.name ?? '?'));
  const nomesPessoas = (ids: string[]) => juntar(ids.map((id) => pessoaCurta(id)!.nome));

  /** O Gestor aprende de quem é o telefone: o próximo chamado desse WhatsApp já vem com o cliente. */
  function aprenderTelefone(telefone: string | null, clienteId: string | null, nome: string | null) {
    const fone = numeroWhatsApp(telefone);
    if (!fone || !clienteId) return;
    const atual = A.contatos.get(fone);
    A.contatos.set(fone, { clienteId, nome: nome ?? atual?.nome ?? null });
  }

  /** Manda ao contato pelo WhatsApp oficial e registra no histórico — mesmo quando não vai, para ficar o porquê. */
  function mandarAoCliente(ator: Ator, t: ChamadoRow, texto: string, em: Date) {
    const r = t.contatoTelefone ? mandarWhatsApp({ de: 'cliente', para: t.contatoTelefone }) : { ok: false, mensagem: 'O chamado não tem o WhatsApp do contato.' };
    // (o que iria: as variáveis do modelo aprovado, ou o texto livre, preenchidos; na prévia, só servem para a conta)
    const valores = { contato: t.contatoNome, codigo: t.codigo, titulo: t.titulo, cliente: nomeCliente(t.clienteId), texto, responsavel: pessoaCurta(t.responsavelId)?.nome ?? null, eu: ator.nome };
    void (A.whats.envioCliente === 'modelo' && A.whats.template ? parametrosDoModelo(A.whats.template, valores) : preencherModelo(A.whats.modeloCliente, valores));
    registrarEvento(t.id, 'aviso_cliente', ator, { texto, ok: r.ok, ...(r.ok ? (r.modelo ? { modelo: true } : {}) : { erro: r.mensagem }) }, em);
    return { ok: r.ok, mensagem: r.mensagem };
  }

  const nada = (t: ChamadoRow): Feito => ({ id: t.id, codigo: t.codigo, titulo: t.titulo, resumo: null });
  const curto = (t: ChamadoRow) => ({ id: t.id, codigo: t.codigo, titulo: t.titulo });
  const etapaCurta = (e: EtapaPainel | null) => (e ? { id: e.id, nome: e.nome, nivel: e.nivel } : null);

  type Estado = { t: ChamadoRow; painel: Painel; etapa: EtapaPainel | null; agora: Date; quando: () => Date };
  function carregar(ator: Ator, ref: string, em: Date, opts: { lixeira?: boolean } = {}): Estado {
    const t = chamadoVisivel(ref, ator, opts);
    return { t, painel: painelPorId(t.painelId)!, etapa: etapaDe(t.etapaId), agora: em, quando: relogio(em) };
  }

  // =====================================================================
  //  ABRIR
  // =====================================================================

  function criarChamado(
    ator: Ator, d: ChamadoCriar, opts: { origem?: Origem; agendadoId?: string | null; checklistExtra?: string[] } = {}, agora: Date = agoraReal(),
  ): { id: string; codigo: string; aviso?: { ok: boolean; mensagem: string } } {
    exigirTrabalhar(ator);
    const quando = relogio(agora);
    const todos = paineis();
    const painel = todos.find((p) => p.id === d.painelId) ?? todos.find((p) => p.sigla === d.painelId.trim().toUpperCase());
    if (!painel || !podeVerPainel(painel, ator)) throw naoAchado('Painel');
    if (!painel.ativo) throw bad(`O painel ${painel.nome} está desativado: escolha outro.`);
    const etapa = etapaDeEntrada(painel.etapas);
    if (!etapa) throw bad(`O painel ${painel.nome} não tem etapas. Peça a quem cuida dos chamados para montar as etapas.`);
    const origem: Origem = opts.origem ?? d.origem ?? 'manual';
    const tipoChamado = d.tipoChamado ?? 'chamado';

    // o telefone que o Gestor já conhece preenche o cliente (e o nome do contato, se faltou)
    const telefone = d.contatoTelefone ? numeroWhatsApp(d.contatoTelefone) ?? d.contatoTelefone.trim() : null;
    let clienteId = d.clienteId ?? null;
    let contatoNome = d.contatoNome ?? null;
    if (telefone) {
      // primeiro os contatos cadastrados dos clientes (a aba Contatos); o mesmo número em dois clientes não adivinha o cliente
      const cadastrados = S.contatos.filter((c) => c.whatsapp === telefone && c.ativo && clienteVivo(c.clientId));
      const doCadastro = clienteId ? cadastrados.find((c) => c.clientId === clienteId) : cadastrados.length === 1 ? cadastrados[0] : undefined;
      if (doCadastro) {
        if (!clienteId) clienteId = doCadastro.clientId;
        if (!contatoNome) contatoNome = doCadastro.nome;
      }
      const conhecido = A.contatos.get(telefone);
      if (conhecido) {
        if (!clienteId && conhecido.clienteId && clienteVivo(conhecido.clienteId)) clienteId = conhecido.clienteId;
        if (!contatoNome && conhecido.nome) contatoNome = conhecido.nome;
      }
    }
    // os campos do sistema que o painel desligou: o que vier para eles fica de fora (como no servidor)
    const usa = (c: CampoDoSistema) => campoLigado(painel.ajustes, c);
    const assunto = d.assuntoId && usa('assunto') ? conferirAssunto(d.assuntoId, painel) : null;
    const tipo = usa('tipo') ? conferirTipo(d.tipo, painel) : null;
    const gravidade = usa('gravidade') ? d.gravidade ?? null : null;
    const alcance = usa('alcance') ? d.alcance ?? null : null;
    const checklist = [...(assunto?.checklist ?? []).map((x) => itemNovo(x, true)), ...(opts.checklistExtra ?? []).map((x) => itemNovo(x, false))];
    const campos: ValoresDosCampos = {};
    incluirOpcoesEscritas(painel, d.campos ?? {});
    for (const i of lerCampos(painel, d.campos ?? {})) if (i.valor !== null) campos[i.campo.id] = i.valor;
    // a negociação (só no painel de Vendas): o valor e a empresa que ainda não é cliente; sem prioridade
    const vendas = painel.tipo === 'vendas';
    // pelos campos do painel: sem o alcance, só a gravidade (como no servidor)
    const sugerida = vendas ? null : prioridadeSugeridaDoPainel(painel.ajustes, gravidade, alcance, A.prazos);
    const prioridade = vendas ? null : d.prioridade ?? sugerida;
    const produtos = usa('produtos') ? unicos(d.produtos ?? []) : [];
    const operadoras = usa('operadoras') ? unicos(d.operadoras ?? []) : [];
    // o valor: um só, ou o total do valor por produto (como no servidor)
    const conta = vendas
      ? valorPorProduto({ produtos, valores: {}, valor: null }, { valores: usa('produtos') ? d.valoresDosProdutos ?? {} : {}, ...(d.valor !== null ? { valor: d.valor } : {}) })
      : null;
    if (conta && !conta.ok) throw bad(conta.erro);
    const contaAtivacao = vendas
      ? valorPorProduto({ produtos, valores: {}, valor: null }, { valores: usa('produtos') ? d.ativacoesDosProdutos ?? {} : {}, ...(d.ativacao !== null ? { valor: d.ativacao } : {}) }, ATIVACAO_E_A_SOMA)
      : null;
    if (contaAtivacao && !contaAtivacao.ok) throw bad(contaAtivacao.erro);
    const valor = conta?.ok ? conta.valor : null;
    const valoresDosProdutos = conta?.ok ? conta.valores : {};
    const ativacao = contaAtivacao?.ok ? contaAtivacao.valor : null;
    const ativacoesDosProdutos = contaAtivacao?.ok ? contaAtivacao.valores : {};
    const empresa = vendas && !clienteId ? d.empresa ?? null : null;
    // o título: o chamado pede pelo menos 3 letras; a negociação sem título fica com o nome da empresa (2.0.3)
    const titulo = tituloQueFica(d.titulo ?? '', { vendas, empresa: vendas ? (clienteId ? nomeCliente(clienteId) : empresa) : null });
    if (!titulo) throw bad(mensagemDoTitulo(d.titulo ?? '', vendas));

    const dados: DadosObrigatorios = {
      tipoChamado, clienteId, contatoNome, contatoTelefone: telefone, relato: d.relato ?? null, descricao: d.descricao ?? null,
      assuntoId: assunto?.id ?? null, tipo, gravidade, alcance, prioridade,
      produtos, operadoras, responsavelId: d.responsavelId ?? null,
      solucao: null, causa: null, validacao: null, checklist, tempoMinutos: 0, campos, valor, ativacao, empresa,
    };
    // o que o painel pede para abrir vale para quem abre na tela; o robô e o agendado abrem sempre
    const faltam = origem === 'manual' || origem === 'botao' ? faltaParaAbrir(dados, painel.ajustes) : [];
    if (faltam.length) throw bad(mensagemDoQueFalta(faltam, undefined, A.campos), { faltam });
    if (prioridade && sugerida && prioridade !== sugerida && !d.motivoPrioridade) throw bad('Trocar a prioridade sugerida pede o motivo.');

    if (clienteId) conferirCliente(clienteId);
    conferirProdutos(produtos);
    conferirOperadoras(operadoras);
    if (d.responsavelId) conferirPessoa(d.responsavelId);
    const observadores = unicos(d.observadores ?? []);
    for (const x of observadores) conferirPessoa(x, 'Um dos observadores escolhidos');
    // a negociação não tem pai nem filhos, nem problema (2.0.1, decisão 0050): liga-se pelo Ligar
    if (vendas && d.paiId) throw bad(NEGOCIACAO_SEM_PAI);
    if (vendas && (tipoChamado === 'problema' || d.problemaId)) throw bad(NEGOCIACAO_SEM_PROBLEMA);
    const pai = d.paiId ? outroChamado(d.paiId, ator) : null;
    if (pai && ehNegociacao(pai)) throw bad(negociacaoNaoEPai(pai.codigo));
    const problema = d.problemaId ? outroChamado(d.problemaId, ator) : null;
    if (problema && problema.tipoChamado !== 'problema') throw bad(`${problema.codigo} não é um problema.`);
    if ((d.incidentes ?? []).length && tipoChamado !== 'problema') throw bad('Só um problema junta incidentes.');
    const incidentes: ChamadoRow[] = [];
    for (const ref of unicos(d.incidentes ?? [])) {
      const inc = outroChamado(ref, ator);
      if (inc.tipoChamado !== 'chamado') throw bad(`${inc.codigo} é um problema: o incidente precisa ser um chamado.`);
      if (ehNegociacao(inc)) throw bad(negociacaoNaoEIncidente(inc.codigo));
      if (!incidentes.some((i) => i.id === inc.id)) incidentes.push(inc);
    }
    const pessoa = pessoaDoAtor(ator);
    const motivoPrioridade = prioridade && sugerida && prioridade !== sugerida ? d.motivoPrioridade ?? null : null;

    // o número sai do painel: nunca repete, nem depois da lixeira
    const linha = A.paineis.find((p) => p.id === painel.id)!;
    const numero = linha.proximoNumero;
    linha.proximoNumero += 1;
    const codigo = codigoDoChamado(painel.sigla, numero);
    const id = novoId();
    const t: ChamadoRow = {
      id, painelId: painel.id, etapaId: etapa.id, numero, codigo, tipoChamado, titulo,
      relato: dados.relato, descricao: dados.descricao, clienteId, contatoNome, contatoTelefone: telefone, sessaoId: d.sessaoId ?? null, origem,
      responsavelId: d.responsavelId ?? null, assuntoId: assunto?.id ?? null, tipo, gravidade, alcance,
      prioridade, motivoPrioridade, produtos, operadoras, etiquetas: etiquetasDoCatalogo(painel.id, d.etiquetas ?? [], d.coresDasEtiquetas ?? {}, pessoa, agora),
      paiId: pai?.id ?? null, problemaId: problema?.id ?? null, checklist, campos,
      solucao: null, causa: null, contorno: null, validacao: null, esperas: [], observadores,
      // a pessoa que abre na tela já está falando com o cliente: a abertura é a primeira resposta
      respondidoEm: ator.tipo === 'pessoa' && (origem === 'manual' || origem === 'botao') ? iso(agora) : null,
      resolvidoEm: null, fechadoEm: null, reaberto: 0, alertas: {}, agendadoId: opts.agendadoId ?? null, criadoPorId: pessoa,
      criadoEm: iso(agora), atualizadoEm: iso(agora), ultimaAtividadeEm: iso(agora), deletedAt: null,
      valor, empresa, motivoPerda: null, valoresDosProdutos, ativacao, ativacoesDosProdutos,
    };
    A.chamados.push(t);
    registrarEvento(id, 'criado', ator, { origem, etapa: etapa.nome, etapaId: etapa.id, painel: painel.nome, ...(vendas ? { venda: true } : {}) }, quando());
    if (pai) {
      registrarEvento(id, 'pai', ator, { acao: 'ligou', pai: pai.codigo }, quando());
      registrarEvento(pai.id, 'filho', ator, { acao: 'ligou', filho: codigo, painel: painel.nome }, quando());
      tocar(pai, agora);
    }
    if (problema) {
      registrarEvento(id, 'problema', ator, { acao: 'ligou', problema: problema.codigo }, quando());
      registrarEvento(problema.id, 'incidente', ator, { acao: 'ligou', incidente: codigo }, quando());
      tocar(problema, agora);
    }
    for (const inc of incidentes) {
      const antigo = inc.problemaId;
      inc.problemaId = id; tocar(inc, agora);
      // o incidente que já era de outro problema muda de problema: o antigo fica sabendo
      if (antigo) registrarEvento(antigo, 'incidente', ator, { acao: 'tirou', incidente: inc.codigo }, quando());
      registrarEvento(id, 'incidente', ator, { acao: 'ligou', incidente: inc.codigo }, quando());
      registrarEvento(inc.id, 'problema', ator, { acao: 'ligou', problema: codigo }, quando());
    }
    aprenderTelefone(telefone, clienteId, contatoNome);

    const chamado = { id, codigo, titulo };
    if (d.responsavelId) avisarEquipe({ evento: 'recebeu', para: [d.responsavelId], chamado, texto: `Você recebeu o chamado ${codigo}`, menos: pessoa }, agora);
    if (prioridade === 'critica') avisarEquipe({ evento: 'critico', para: painel.ajustes.supervisores, chamado, texto: `Chegou um chamado Crítico: ${codigo}`, menos: pessoa }, agora);
    avisarObservadores({ chamado, observadores, texto: `${ator.nome} pôs você como observador do ${codigo}`, menos: pessoa, jaAvisados: [d.responsavelId] }, agora);
    let aviso: { ok: boolean; mensagem: string } | undefined;
    if (d.avisarCliente) aviso = mandarAoCliente(ator, t, 'Abrimos este chamado para o seu atendimento. Qualquer novidade, avisamos por aqui.', quando());
    emitir('chamado.criado', id);
    return { id, codigo, ...(aviso ? { aviso } : {}) };
  }

  // =====================================================================
  //  ALTERAR
  // =====================================================================

  function alterar(ator: Ator, ref: string, pedido: ChamadoAlterar, agora: Date = agoraReal()): Feito {
    exigirTrabalhar(ator);
    const e = carregar(ator, ref, agora);
    const { t, painel } = e;
    // o que vier para um campo que o painel desligou fica de fora (como no servidor)
    const usa = (c: CampoDoSistema) => campoLigado(painel.ajustes, c);
    const d: ChamadoAlterar = {
      ...pedido,
      ...(usa('assunto') ? {} : { assuntoId: undefined }), ...(usa('tipo') ? {} : { tipo: undefined }),
      ...(usa('gravidade') ? {} : { gravidade: undefined }), ...(usa('alcance') ? {} : { alcance: undefined }),
      ...(usa('produtos') ? {} : { produtos: undefined }), ...(usa('operadoras') ? {} : { operadoras: undefined }),
      // a negociação não tem prioridade
      ...(painel.tipo === 'vendas' ? { prioridade: undefined, motivoPrioridade: undefined } : {}),
    };
    const set: Partial<ChamadoRow> = {};
    const antes: Record<string, unknown> = {};
    const eventos: Array<[TipoEvento, Record<string, unknown>]> = [];
    const mudancas: string[] = [];
    const nomes: string[] = [];
    const mudou = (chave: string, nome: string, valorAntes: unknown) => { mudancas.push(chave); nomes.push(nome); antes[chave] = valorAntes; };
    const campo = (chave: string, nome: string, de: string | null, para: string | null, valorAntes: unknown) => { eventos.push(['campo', { campo: nome, de, para }]); mudou(chave, nome, valorAntes); };
    const longo = (chave: string, nome: string, valorAntes: unknown) => { eventos.push(['campo', { campo: nome, longo: true }]); mudou(chave, nome, valorAntes); };

    // (na ordem do formulário: o histórico e a auditoria leem como a ficha)
    // o título: como o servidor (2.0.3) — a negociação sem título fica com o nome da empresa, e o título que era o nome
    // da empresa acompanha a empresa quando ela muda (o nome de depois sai do cliente e da empresa, mais abaixo)
    const vendasAqui = painel.tipo === 'vendas';
    const empresaDe = (clienteId: string | null, empresa: string | null) => (clienteId ? nomeCliente(clienteId) : empresa);
    const empresaAntes = vendasAqui ? empresaDe(t.clienteId, t.empresa) : null;
    const posTitulo = eventos.length;
    if (d.clienteId !== undefined && d.clienteId !== t.clienteId) {
      if (d.clienteId) conferirCliente(d.clienteId);
      set.clienteId = d.clienteId;
      campo('clienteId', NOME_CAMPO.cliente, nomeCliente(t.clienteId), nomeCliente(d.clienteId), t.clienteId);
    }
    if (d.contatoNome !== undefined && d.contatoNome !== t.contatoNome) { set.contatoNome = d.contatoNome; campo('contatoNome', NOME_CAMPO.contato, t.contatoNome, d.contatoNome, t.contatoNome); }
    if (d.contatoTelefone !== undefined) {
      const fone = d.contatoTelefone ? numeroWhatsApp(d.contatoTelefone) ?? d.contatoTelefone : null;
      if (fone !== t.contatoTelefone) { set.contatoTelefone = fone; campo('contatoTelefone', 'WhatsApp do contato', t.contatoTelefone, fone, t.contatoTelefone); }
    }
    // a negociação (só no painel de Vendas): a empresa que ainda não é cliente, o valor e o motivo da perda
    // (que só a perdida tem)
    if (painel.tipo === 'vendas') {
      if (d.empresa !== undefined && d.empresa !== t.empresa) { set.empresa = d.empresa; campo('empresa', 'Empresa', t.empresa, d.empresa, t.empresa); }
    }
    {
      const empresaDepois = vendasAqui ? empresaDe(set.clienteId !== undefined ? set.clienteId : t.clienteId, set.empresa !== undefined ? set.empresa : t.empresa) : null;
      let novo: string | undefined;
      if (d.titulo !== undefined) {
        const tf = tituloQueFica(d.titulo, { vendas: vendasAqui, empresa: empresaDepois });
        if (!tf) throw bad(mensagemDoTitulo(d.titulo, vendasAqui));
        novo = tf;
      } else if (vendasAqui && empresaAntes && empresaDepois && empresaDepois !== empresaAntes && paraBusca(t.titulo) === paraBusca(empresaAntes)) {
        novo = empresaDepois.slice(0, 200);
      }
      if (novo !== undefined && novo !== t.titulo) {
        set.titulo = novo;
        eventos.splice(posTitulo, 0, ['campo', { campo: 'Título', de: t.titulo, para: novo }]);
        mudancas.unshift('titulo'); nomes.unshift('Título'); antes.titulo = t.titulo;
      }
    }
    if (painel.tipo === 'vendas') {
      if (d.motivoPerda !== undefined && d.motivoPerda !== t.motivoPerda) {
        if (e.etapa?.resultado !== 'perdido') throw bad('O motivo da perda é só da negociação perdida.');
        if (!d.motivoPerda) throw bad('A negociação perdida precisa do motivo.');
        set.motivoPerda = d.motivoPerda;
        campo('motivoPerda', 'Motivo da perda', t.motivoPerda, d.motivoPerda, t.motivoPerda);
      }
    }
    // o assunto novo traz os itens do checklist dele que ainda não estão
    if (d.assuntoId !== undefined && d.assuntoId !== t.assuntoId) {
      const a = d.assuntoId ? conferirAssunto(d.assuntoId, painel) : null;
      set.assuntoId = a?.id ?? null;
      campo('assuntoId', NOME_CAMPO.assunto, caminho(t.assuntoId), a ? caminho(a.id) : null, t.assuntoId);
      if (a) {
        const ja = new Set(t.checklist.map((i) => paraBusca(i.texto)));
        const novos = a.checklist.filter((x) => !ja.has(paraBusca(x))).map((x) => itemNovo(x, true));
        if (novos.length) set.checklist = [...t.checklist, ...novos];
      }
    }
    if (d.tipo !== undefined) {
      const novo = conferirTipo(d.tipo, painel);
      if (novo !== t.tipo) { set.tipo = novo; campo('tipo', NOME_CAMPO.tipo, t.tipo, novo, t.tipo); }
    }
    // a gravidade, o alcance e a prioridade (que pode seguir a sugestão)
    const g0 = usa('gravidade') ? t.gravidade : null; const a0 = usa('alcance') ? t.alcance : null; const p0 = t.prioridade;
    const g1 = d.gravidade !== undefined ? d.gravidade : g0;
    const a1 = d.alcance !== undefined ? d.alcance : a0;
    if (g1 !== g0) { set.gravidade = g1; campo('gravidade', NOME_CAMPO.gravidade, g0 ? NOME_GRAVIDADE[g0] : null, g1 ? NOME_GRAVIDADE[g1] : null, g0); }
    if (a1 !== a0) { set.alcance = a1; campo('alcance', NOME_CAMPO.alcance, a0 ? NOME_ALCANCE[a0] : null, a1 ? NOME_ALCANCE[a1] : null, a0); }
    const sug0 = prioridadeSugeridaDoPainel(painel.ajustes, g0, a0, A.prazos);
    const sug1 = prioridadeSugeridaDoPainel(painel.ajustes, g1, a1, A.prazos);
    let p1 = p0;
    let motivo: string | null = t.motivoPrioridade;
    if (d.prioridade !== undefined && d.prioridade !== p0) {
      p1 = d.prioridade;
      if (p1 && sug1 && p1 !== sug1 && !d.motivoPrioridade) throw bad('Trocar a prioridade sugerida pede o motivo.');
      motivo = p1 && sug1 && p1 !== sug1 ? d.motivoPrioridade ?? null : null;
    } else if ((g1 !== g0 || a1 !== a0) && (p0 === null || p0 === sug0) && sug1 && sug1 !== p0) {
      // a prioridade seguia a sugestão: vai junto para a nova (a escolhida à mão fica como está)
      p1 = sug1;
      motivo = null;
    } else if (p0 && sug1 === p0) {
      // a sugestão nova bateu com a prioridade escolhida: o motivo da troca já não vale
      motivo = null;
    }
    if (p1 !== p0) {
      set.prioridade = p1;
      eventos.push(['prioridade', { de: p0, para: p1, sugerida: sug1, motivo }]);
      mudou('prioridade', NOME_CAMPO.prioridade, p0);
    }
    if (motivo !== t.motivoPrioridade) set.motivoPrioridade = motivo;

    if (d.produtos !== undefined) {
      const novos = unicos(d.produtos);
      if (!mesmoConjunto(novos, t.produtos)) { conferirProdutos(novos); set.produtos = novos; campo('produtos', NOME_CAMPO.produto, nomesProdutos(t.produtos), nomesProdutos(novos), t.produtos); }
    }
    // o valor da negociação, depois dos produtos: um só, ou o total do valor por produto (o produto que saiu
    // leva o valor dele junto) — como no servidor
    if (painel.tipo === 'vendas') {
      const produtosAgora = set.produtos ?? t.produtos;
      const nomes = (ids: string[]) => ids.map((id) => ({ id, nome: S.products.find((x) => x.id === id)?.name ?? '?' }));
      const partes = [
        { valorAntes: t.valor, valoresAntes: t.valoresDosProdutos, pedidoValor: d.valor, pedidoValores: d.valoresDosProdutos, erro: VALOR_E_A_SOMA,
          nome: NOME_MENSALIDADE, nomePorProduto: NOME_VALOR_POR_PRODUTO, chave: 'valor', chavePorProduto: 'valoresDosProdutos' },
        { valorAntes: t.ativacao, valoresAntes: t.ativacoesDosProdutos, pedidoValor: d.ativacao, pedidoValores: d.ativacoesDosProdutos, erro: ATIVACAO_E_A_SOMA,
          nome: NOME_ATIVACAO, nomePorProduto: NOME_ATIVACAO_POR_PRODUTO, chave: 'ativacao', chavePorProduto: 'ativacoesDosProdutos' },
      ] as const;
      for (const x of partes) {
        const conta = valorPorProduto(
          { produtos: t.produtos, valores: x.valoresAntes, valor: x.valorAntes },
          { produtos: produtosAgora, ...(x.pedidoValores !== undefined && usa('produtos') ? { valores: x.pedidoValores } : {}), ...(x.pedidoValor !== undefined ? { valor: x.pedidoValor } : {}) },
          x.erro,
        );
        if (!conta.ok) throw bad(conta.erro);
        if (!mesmoValorPorProduto(conta.valores, x.valoresAntes)) {
          set[x.chavePorProduto] = conta.valores;
          campo(x.chavePorProduto, x.nomePorProduto, textoDoValorPorProduto(nomes(t.produtos), x.valoresAntes), textoDoValorPorProduto(nomes(produtosAgora), conta.valores), x.valoresAntes);
        }
        if (conta.valor !== x.valorAntes) {
          set[x.chave] = conta.valor;
          campo(x.chave, x.nome, x.valorAntes === null ? null : reais(x.valorAntes), conta.valor === null ? null : reais(conta.valor), x.valorAntes);
        }
      }
    }
    if (d.operadoras !== undefined) {
      const novas = unicos(d.operadoras);
      if (!mesmoConjunto(novas, t.operadoras)) { conferirOperadoras(novas); set.operadoras = novas; campo('operadoras', NOME_CAMPO.operadora, nomesOperadoras(t.operadoras), nomesOperadoras(novas), t.operadoras); }
    }
    // os campos do painel: cada um que mudou vira uma linha do histórico (o texto longo diz só que mudou)
    if (d.campos !== undefined) {
      const novos: ValoresDosCampos = { ...t.campos };
      let mexeu = false;
      incluirOpcoesEscritas(painel, d.campos);
      for (const { campo: c, valor } of lerCampos(painel, d.campos, t.campos)) {
        const antes = t.campos[c.id] ?? null;
        if (mesmoValorDoCampo(antes, valor)) continue;
        mexeu = true;
        if (valor === null) delete novos[c.id]; else novos[c.id] = valor;
        if (c.tipo === 'texto_longo') longo(chaveDoCampo(c.id), c.nome, antes);
        else campo(chaveDoCampo(c.id), c.nome, textoDoValor(c, antes) || null, textoDoValor(c, valor) || null, antes);
      }
      if (mexeu) set.campos = novos;
    }
    // os textos longos: o histórico diz só que mudou (o texto está no chamado; a auditoria guarda o de antes)
    const textos: Array<['relato' | 'descricao' | 'solucao' | 'causa' | 'contorno' | 'validacao', string]> = [
      ['relato', NOME_CAMPO.relato], ['descricao', NOME_CAMPO.descricao], ['solucao', NOME_CAMPO.solucao],
      ['causa', NOME_CAMPO.causa], ['contorno', 'Solução de contorno'], ['validacao', NOME_CAMPO.validacao],
    ];
    for (const [chave, nome] of textos) {
      const v = d[chave];
      if (v === undefined || (v ?? null) === (t[chave] ?? null)) continue;
      set[chave] = v ?? null;
      longo(chave, nome, t[chave]);
    }
    if (d.etiquetas !== undefined) {
      // como estão no catálogo; a nova entra nele com a cor escolhida na tela (ou cinza)
      const novas = etiquetasDoCatalogo(t.painelId, d.etiquetas, d.coresDasEtiquetas ?? {}, pessoaDoAtor(ator), agora);
      if (novas.join('\n') !== t.etiquetas.join('\n')) { set.etiquetas = novas; campo('etiquetas', 'Etiquetas', juntar(t.etiquetas), juntar(novas), t.etiquetas); }
    }
    let observadoresNovos: string[] = [];
    if (d.observadores !== undefined) {
      const novos = unicos(d.observadores);
      for (const id of novos.filter((x) => !t.observadores.includes(x))) conferirPessoa(id, 'Um dos observadores escolhidos');
      if (!mesmoConjunto(novos, t.observadores)) {
        set.observadores = novos;
        observadoresNovos = novos.filter((x) => !t.observadores.includes(x));
        campo('observadores', 'Observadores', nomesPessoas(t.observadores), nomesPessoas(novos), t.observadores);
      }
    }
    // o responsável: avisa quem recebeu; passar o chamado a alguém é a primeira resposta de uma pessoa
    let recebeu: string | null = null;
    if (d.responsavelId !== undefined && d.responsavelId !== t.responsavelId) {
      if (d.responsavelId) conferirPessoa(d.responsavelId);
      set.responsavelId = d.responsavelId;
      eventos.push(['responsavel', { de: pessoaCurta(t.responsavelId), para: pessoaCurta(d.responsavelId) }]);
      mudou('responsavelId', NOME_CAMPO.responsavel, t.responsavelId);
      if (ator.tipo === 'pessoa' && !t.respondidoEm) set.respondidoEm = iso(agora);
      recebeu = d.responsavelId;
    }

    if (!eventos.length) return nada(t);
    const depois = { ...set };
    Object.assign(t, set);
    tocar(t, agora);
    for (const [tipo, dados] of eventos) registrarEvento(t.id, tipo, ator, dados, e.quando());
    if (set.clienteId !== undefined || set.contatoTelefone !== undefined) aprenderTelefone(t.contatoTelefone, t.clienteId, t.contatoNome);
    const menos = pessoaDoAtor(ator);
    if (recebeu) avisarEquipe({ evento: 'recebeu', para: [recebeu], chamado: curto(t), texto: `Você recebeu o chamado ${t.codigo}`, menos }, agora);
    // os observadores (como o servidor): quem entrou fica sabendo; os outros recebem o que mudou
    if (observadoresNovos.length) avisarObservadores({ chamado: curto(t), observadores: observadoresNovos, texto: `${ator.nome} pôs você como observador do ${t.codigo}`, menos, jaAvisados: [recebeu] }, agora);
    const observadores = t.observadores.filter((x) => !observadoresNovos.includes(x));
    if (set.responsavelId !== undefined) {
      const texto = set.responsavelId ? `${ator.nome} passou o ${t.codigo} para ${pessoaCurta(set.responsavelId)?.nome ?? 'outra pessoa'}` : `${ator.nome} deixou o ${t.codigo} sem responsável`;
      avisarObservadores({ chamado: curto(t), observadores, texto, menos, jaAvisados: [recebeu] }, agora);
    }
    const camposMudados = nomes.filter((n) => n !== 'Observadores' && n !== NOME_CAMPO.responsavel);
    if (camposMudados.length) avisarObservadores({ chamado: curto(t), observadores, menos, campos: { quem: ator.nome, nomes: camposMudados } }, agora);
    emitir('chamado.alterado', t.id, { mudancas });
    return { id: t.id, codigo: t.codigo, titulo: t.titulo, resumo: `Alterou ${t.codigo} "${t.titulo}": ${nomes.join(', ')}`, antes, depois };
  }

  // =====================================================================
  //  MOVER (escalonar, resolver, fechar, reabrir)
  // =====================================================================

  type Movimento = { de: EtapaPainel | null; para: EtapaPainel; antes: SituacaoDoChamado; depois: SituacaoDoChamado; reabriu: boolean; novoResponsavel: string | null; nomeDoNovoResponsavel: string | null };

  /** Marcar a negociação como ganha ou perdida: o motivo da perda e o dia em que ela acabou (nulo = agora). */
  type Resultado = { motivoPerda: string | null; concluidoEm: string | null };
  /** O Ganho e o Perdido (o painel de Vendas): o dia é hoje ou antes; o Perdido pede o motivo (o `conferirMovimento` cobra). */
  function conferirResultado(e: Estado, para: EtapaPainel, d: { motivoPerda?: string | null; concluidoEm?: string | null }): Resultado | null {
    if (!para.resultado) return null;
    const concluidoEm = d.concluidoEm || null;
    if (concluidoEm && concluidoEm > diaLocal(e.agora)) throw bad('O dia em que a negociação acabou é hoje ou um dia que já passou.');
    return { motivoPerda: para.resultado === 'perdido' ? d.motivoPerda?.trim() || null : null, concluidoEm };
  }
  /** O instante do dia em que a negociação acabou: hoje é agora; um dia que passou, o meio-dia dele (Brasília). */
  const momentoDoDia = (dia: string, agora: Date) => (dia === diaLocal(agora) ? agora : instanteLocal(dia, '12:00'));

  /** O que falta preencher, os filhos que travam e, quando é escalonar ou voltar de nível, o motivo. */
  function conferirMovimento(e: Estado, para: EtapaPainel, o: { painel?: Painel; motivo: string | null; responsavelId?: string | null; nivel: boolean; venda?: Resultado | null }): 'sobe' | 'desce' | null {
    const painel = o.painel ?? e.painel;
    const dados = {
      ...dadosDoChamado(e.t), ...(o.responsavelId !== undefined ? { responsavelId: o.responsavelId } : {}),
      // o motivo da perda vem junto com o marcar como perdido (o de antes, de uma perda desfeita, não vale)
      ...(para.resultado === 'perdido' ? { motivoPerda: o.venda?.motivoPerda ?? null } : {}),
    };
    const faltam = faltaParaEtapa(dados, para);
    if (faltam.length) throw bad(mensagemDoQueFalta(faltam, para.nome, A.campos), { faltam });
    const travam = filhosQueTravam(filhosDoChamado(e.t.id), para, painel.ajustes.paiEsperaFilhos);
    if (travam.length) throw bad(`O ${e.t.codigo} tem filhos em aberto: ${travam.join(', ')}. Feche os filhos antes.`, { filhos: travam });
    if (!o.nivel) return null;
    const sentido = movimentoDeNivel(e.etapa, para);
    if (sentido && !o.motivo) throw bad(sentido === 'sobe' ? 'Escalonar pede o motivo.' : 'Voltar de nível pede o motivo.');
    return sentido;
  }

  /** Grava o movimento: as datas de resolvido e fechado, o reabrir, a primeira resposta e o responsável. */
  function gravarMovimento(
    e: Estado, ator: Ator, para: EtapaPainel,
    o: { motivo: string | null; sentido: 'sobe' | 'desce' | null; responsavelId?: string | null; motivoReabriu?: string | null; extra?: Partial<ChamadoRow>; venda?: Resultado | null },
  ): Movimento {
    const { t, agora } = e;
    const deTipo = e.etapa?.tipo ?? 'andamento';
    const antes = situacaoDaEtapa(deTipo);
    const depois = situacaoDaEtapa(para.tipo);
    const reabriu = antes !== 'aberto' && depois === 'aberto';
    const responsavelAntes = t.responsavelId;
    const set: Partial<ChamadoRow> = { ...(o.extra ?? {}), etapaId: para.id };
    if (para.tipo === 'resolvido') { set.resolvidoEm = t.resolvidoEm ?? iso(agora); set.fechadoEm = null; }
    if (para.tipo === 'fechado') { set.fechadoEm = antes === 'fechado' ? t.fechadoEm ?? iso(agora) : iso(agora); set.resolvidoEm = t.resolvidoEm ?? iso(agora); }
    if (reabriu) { set.resolvidoEm = null; set.fechadoEm = null; set.reaberto = t.reaberto + 1; }
    // a negociação: o Ganho e o Perdido acabam no dia dito (ou agora, quando o resultado muda); o motivo da
    // perda fica só enquanto ela está perdida (o histórico guarda o de antes)
    if (para.resultado) {
      const quando = o.venda?.concluidoEm ? momentoDoDia(o.venda.concluidoEm, agora) : para.resultado !== (e.etapa?.resultado ?? null) ? agora : null;
      if (quando) { set.fechadoEm = iso(quando); set.resolvidoEm = iso(quando); }
    }
    if (para.resultado === 'perdido') set.motivoPerda = o.venda?.motivoPerda ?? t.motivoPerda;
    else if (t.motivoPerda) set.motivoPerda = null;
    if (deTipo === 'entrada' && para.tipo !== 'entrada' && ator.tipo === 'pessoa' && !t.respondidoEm && set.respondidoEm === undefined) set.respondidoEm = iso(agora);
    const trocaResponsavel = o.responsavelId !== undefined && o.responsavelId !== t.responsavelId;
    if (trocaResponsavel) set.responsavelId = o.responsavelId ?? null;
    const valorAntes = t.valor;
    Object.assign(t, set);
    tocar(t, agora);
    const venda = para.resultado ? {
      resultado: para.resultado, valor: valorAntes ?? null,
      ...(para.resultado === 'perdido' ? { motivoPerda: set.motivoPerda ?? null } : {}),
      ...(o.venda?.concluidoEm && o.venda.concluidoEm !== diaLocal(agora) ? { concluidoEm: o.venda.concluidoEm } : {}),
    } : {};
    registrarEvento(t.id, 'etapa', ator, { de: etapaCurta(e.etapa), para: etapaCurta(para), motivo: o.motivo, sentido: o.sentido, ...venda }, e.quando());
    if (reabriu) registrarEvento(t.id, 'reaberto', ator, { motivo: o.motivoReabriu !== undefined ? o.motivoReabriu : o.motivo }, e.quando());
    if (trocaResponsavel) registrarEvento(t.id, 'responsavel', ator, { de: pessoaCurta(responsavelAntes), para: pessoaCurta(o.responsavelId) }, e.quando());
    return {
      de: e.etapa, para, antes, depois, reabriu, novoResponsavel: trocaResponsavel ? o.responsavelId ?? null : null,
      nomeDoNovoResponsavel: trocaResponsavel && o.responsavelId ? pessoaCurta(o.responsavelId)?.nome ?? null : null,
    };
  }

  /** Depois de gravado: quem a etapa avisa, quem recebeu, os observadores, o pai (quando um filho fecha) e os webhooks. */
  function depoisDoMovimento(ator: Ator, t: ChamadoRow, m: Movimento, agora: Date, opts: { painelNovo?: string; observadores?: boolean } = {}) {
    const menos = pessoaDoAtor(ator);
    if (m.para.avisar.length) avisarEquipe({ evento: 'etapa', para: m.para.avisar, chamado: curto(t), texto: `${t.codigo} chegou em ${m.para.nome}`, menos }, agora);
    if (m.novoResponsavel) avisarEquipe({ evento: 'recebeu', para: [m.novoResponsavel], chamado: curto(t), texto: `Você recebeu o chamado ${t.codigo}`, menos }, agora);
    if (opts.observadores !== false) {
      const onde = opts.painelNovo ? `para o painel ${opts.painelNovo} (${m.para.nome})` : `para ${m.para.nome}`;
      const texto = `${ator.nome} ${m.reabriu ? `reabriu o ${t.codigo} (${m.para.nome})` : `${opts.painelNovo ? 'passou' : 'moveu'} o ${t.codigo} ${onde}`}${m.nomeDoNovoResponsavel ? `, com ${m.nomeDoNovoResponsavel}` : ''}`;
      avisarObservadores({ chamado: curto(t), observadores: t.observadores, texto, menos, jaAvisados: [...m.para.avisar, m.novoResponsavel] }, agora);
    }
    if (m.depois === 'fechado' && m.antes !== 'fechado' && t.paiId) {
      const pai = A.chamados.find((x) => x.id === t.paiId && !x.deletedAt);
      if (pai?.responsavelId) avisarEquipe({ evento: 'etapa', tipo: 'pai', para: [pai.responsavelId], chamado: curto(pai), texto: `O filho ${t.codigo} do ${pai.codigo} foi fechado`, menos }, agora);
    }
    emitir('chamado.movido', t.id, { de: m.de ? { id: m.de.id, nome: m.de.nome } : null, para: { id: m.para.id, nome: m.para.nome } });
    if (m.depois === 'resolvido' && m.antes !== 'resolvido') emitir('chamado.resolvido', t.id);
    if (m.depois === 'fechado' && m.antes !== 'fechado') emitir('chamado.fechado', t.id);
  }

  function frasesDoMovimento(codigo: string, m: Movimento, sentido: 'sobe' | 'desce' | null, motivo: string | null, venda?: { valor: number | null; motivoPerda: string | null } | null) {
    if (m.para.resultado === 'ganho') return `Marcou ${codigo} como ganho${venda?.valor != null ? ` (${reais(venda.valor)}/mês)` : ''}, estava em ${m.de?.nome ?? '?'}`;
    if (m.para.resultado === 'perdido') return `Marcou ${codigo} como perdido${venda?.motivoPerda ? `: ${venda.motivoPerda}` : ''} (estava em ${m.de?.nome ?? '?'})`;
    const verbo = sentido === 'sobe' ? 'Escalonou' : sentido === 'desce' ? 'Voltou' : 'Moveu';
    return `${verbo} ${codigo} de ${m.de?.nome ?? '?'} para ${m.para.nome}${m.reabriu ? ' (reabriu)' : ''}${motivo ? `: ${motivo}` : ''}`;
  }

  function mover(
    ator: Ator, ref: string, d: { etapaId: string; motivo?: string | null; responsavelId?: string | null; motivoPerda?: string | null; concluidoEm?: string | null },
    agora: Date = agoraReal(),
  ): Feito {
    exigirTrabalhar(ator);
    const e = carregar(ator, ref, agora);
    const para = e.painel.etapas.find((x) => x.id === d.etapaId);
    if (!para) throw bad('Essa etapa não é do painel deste chamado.');
    if (para.id === e.t.etapaId) return nada(e.t);
    const motivo = d.motivo?.trim() || null;
    const responsavelId = d.responsavelId === undefined ? undefined : d.responsavelId || null;
    if (responsavelId) conferirPessoa(responsavelId);
    const venda = conferirResultado(e, para, d);
    const valor = e.t.valor;
    const sentido = conferirMovimento(e, para, { motivo, responsavelId, nivel: true, venda });
    const m = gravarMovimento(e, ator, para, { motivo, sentido, responsavelId, venda });
    depoisDoMovimento(ator, e.t, m, agora);
    return { ...nada(e.t), resumo: frasesDoMovimento(e.t.codigo, m, sentido, motivo, venda && { valor, motivoPerda: venda.motivoPerda }) };
  }

  // =====================================================================
  //  ASSUMIR, ESPERAR, REABRIR, TROCAR DE PAINEL
  // =====================================================================

  function assumir(ator: Ator, ref: string, opts: { mover?: boolean } = {}, agora: Date = agoraReal()): Feito {
    exigirTrabalhar(ator);
    if (ator.tipo !== 'pessoa') throw bad('Só uma pessoa assume um chamado.');
    const e = carregar(ator, ref, agora);
    const { t } = e;
    let para: EtapaPainel | null = null;
    // na negociação, assumir é só ficar com ela: o lead não passa sozinho para a etapa seguinte
    if (opts.mover !== false && e.painel.tipo !== 'vendas' && e.etapa?.tipo === 'entrada') {
      const alvo = etapaAoAssumir(e.painel.etapas, t.etapaId);
      if (alvo && !faltaParaEtapa({ ...dadosDoChamado(t), responsavelId: ator.id }, alvo).length) para = alvo;
    }
    const trocaResponsavel = t.responsavelId !== ator.id;
    if (!trocaResponsavel && !para) return nada(t);
    let m: Movimento | null = null;
    if (para) m = gravarMovimento(e, ator, para, { motivo: null, sentido: null, responsavelId: ator.id, extra: { respondidoEm: t.respondidoEm ?? iso(agora) } });
    else {
      const antes = t.responsavelId;
      t.responsavelId = ator.id; t.respondidoEm = t.respondidoEm ?? iso(agora); tocar(t, agora);
      registrarEvento(t.id, 'responsavel', ator, { de: pessoaCurta(antes), para: pessoaCurta(ator.id) }, e.quando());
    }
    if (m) depoisDoMovimento(ator, t, m, agora);
    else contarAosObservadores(ator, t, `${ator.nome} assumiu o ${t.codigo}`, agora);
    if (trocaResponsavel) emitir('chamado.alterado', t.id, { mudancas: ['responsavelId'] });
    return { ...nada(t), resumo: `Assumiu ${t.codigo}${para ? ` (foi para ${para.nome})` : ''}` };
  }

  function esperar(ator: Ator, ref: string, d: { tipo: TipoEspera | null; motivo?: string | null }, agora: Date = agoraReal()): Feito {
    exigirTrabalhar(ator);
    const e = carregar(ator, ref, agora);
    const { t } = e;
    const aberta = esperaAberta(t.esperas);
    const motivo = d.motivo?.trim() || null;
    const fechar = (w: Espera) => (w === aberta ? { ...w, fim: iso(agora) } : w);
    let dados: Record<string, unknown>;
    let resumo: string;
    if (d.tipo) {
      if (!motivo) throw bad('Diga o motivo da espera.');
      t.esperas = [...t.esperas.map(fechar), { tipo: d.tipo, motivo, inicio: iso(agora), fim: null, porId: pessoaDoAtor(ator) }];
      dados = { tipo: d.tipo, motivo };
      resumo = `Marcou ${t.codigo}: ${NOME_ESPERA[d.tipo]} (${motivo})`;
    } else {
      if (!aberta) return nada(t);
      const minutos = Math.max(0, Math.round((agora.getTime() - Date.parse(aberta.inicio)) / MINUTO));
      t.esperas = t.esperas.map(fechar);
      dados = { tipo: null, antes: aberta.tipo, minutos, duracao: duracaoDoPrazo(minutos) };
      resumo = `Tirou a marca de espera de ${t.codigo} (${NOME_ESPERA[aberta.tipo]}, ${duracaoDoPrazo(minutos)})`;
    }
    tocar(t, agora);
    registrarEvento(t.id, 'espera', ator, dados, e.quando());
    contarAosObservadores(ator, t, d.tipo ? `${ator.nome} marcou o ${t.codigo}: ${NOME_ESPERA[d.tipo].toLocaleLowerCase('pt-BR')} (${motivo})` : `${ator.nome} tirou a marca de espera do ${t.codigo}`, agora);
    return { ...nada(t), resumo };
  }

  /** A etapa aberta de onde a negociação saiu para o Ganho ou o Perdido (a última mudança de etapa). */
  function etapaAntesDoResultado(e: Estado): EtapaPainel | null {
    const ultima = porData(A.eventos.filter((x) => x.chamadoId === e.t.id && x.tipo === 'etapa')).at(-1);
    const de = ultima?.dados?.de?.id as string | undefined;
    const etapa = de ? e.painel.etapas.find((x) => x.id === de) : undefined;
    return etapa && (etapa.tipo === 'entrada' || etapa.tipo === 'andamento') ? etapa : null;
  }

  function reabrir(ator: Ator, ref: string, d: { motivo?: string | null; etapaId?: string | null }, agora: Date = agoraReal(), opts: { observadores?: boolean } = {}): Feito {
    exigirTrabalhar(ator);
    const e = carregar(ator, ref, agora);
    const { t, painel } = e;
    if (situacaoDaEtapa(e.etapa?.tipo ?? 'andamento') === 'aberto') throw bad('O chamado já está aberto.');
    let para: EtapaPainel | null;
    if (d.etapaId) {
      para = painel.etapas.find((x) => x.id === d.etapaId && (x.tipo === 'entrada' || x.tipo === 'andamento')) ?? null;
      if (!para) throw bad('Para reabrir, escolha uma etapa de entrada ou de andamento deste painel.');
    } else {
      // a negociação volta para a etapa em que estava antes do ganho ou da perda (se ela ainda existe)
      para = (painel.tipo === 'vendas' ? etapaAntesDoResultado(e) : null) ?? etapaAoReabrir(painel.etapas);
      if (!para || (para.tipo !== 'entrada' && para.tipo !== 'andamento')) throw bad(`O painel ${painel.nome} não tem etapa de entrada nem de andamento para reabrir.`);
    }
    const motivo = d.motivo?.trim() || null;
    const m = gravarMovimento(e, ator, para, { motivo: null, sentido: null, motivoReabriu: motivo });
    depoisDoMovimento(ator, t, m, agora, opts);
    if (t.responsavelId) avisarEquipe({ evento: 'recebeu', para: [t.responsavelId], chamado: curto(t), texto: `O ${t.codigo} foi reaberto`, menos: pessoaDoAtor(ator) }, agora);
    return { ...nada(t), resumo: `Reabriu ${t.codigo} (foi para ${para.nome})${motivo ? `: ${motivo}` : ''}` };
  }

  function trocarPainel(ator: Ator, ref: string, d: { painelId: string; etapaId?: string | null }, agora: Date = agoraReal()): Feito {
    exigirTrabalhar(ator);
    const e = carregar(ator, ref, agora);
    const { t, painel } = e;
    const todos = paineis();
    const novo = todos.find((p) => p.id === d.painelId) ?? todos.find((p) => p.sigla === d.painelId.trim().toUpperCase());
    if (!novo || !podeVerPainel(novo, ator)) throw naoAchado('Painel');
    if (novo.id === painel.id) return nada(t);
    if (!novo.ativo) throw bad(`O painel ${novo.nome} está desativado: escolha outro.`);
    // a negociação fica entre os painéis de Vendas, e o chamado entre os de Gestão (entre eles, o Ligar)
    if (novo.tipo !== painel.tipo) throw bad(trocaEntreTiposDePainel(t.codigo, painel, novo));
    const para = d.etapaId ? novo.etapas.find((x) => x.id === d.etapaId) : etapaDeEntrada(novo.etapas);
    if (!para) throw bad(d.etapaId ? `Essa etapa não é do painel ${novo.nome}.` : `O painel ${novo.nome} não tem etapas.`);
    if (para.resultado) throw bad(TROCA_ENTRA_NO_FUNIL);
    const tipoNovo = t.tipo ? novo.ajustes.tipos.find((x) => paraBusca(x) === paraBusca(t.tipo!)) ?? (novo.ajustes.tipos.length ? null : t.tipo) : null;
    // o destino é conferido com o chamado já sem o que sai (o assunto e o tipo do painel antigo)
    conferirMovimento({ ...e, t: { ...t, assuntoId: null, tipo: tipoNovo } }, para, { painel: novo, motivo: null, nivel: false });
    registrarEvento(t.id, 'painel', ator, { de: painel.nome, para: novo.nome }, e.quando());
    if (t.assuntoId) registrarEvento(t.id, 'campo', ator, { campo: NOME_CAMPO.assunto, de: caminho(t.assuntoId), para: null }, e.quando());
    if (t.tipo && tipoNovo !== t.tipo) registrarEvento(t.id, 'campo', ator, { campo: NOME_CAMPO.tipo, de: t.tipo, para: tipoNovo }, e.quando());
    // as etiquetas vão junto (2.0.3: cada painel tem as suas): as que faltam no painel novo entram lá com a mesma cor
    const etiquetas = levarEtiquetas(t.etiquetas, painel.id, novo.id, pessoaDoAtor(ator), agora);
    const m = gravarMovimento(e, ator, para, { motivo: null, sentido: null, extra: { painelId: novo.id, assuntoId: null, tipo: tipoNovo, ...(etiquetas.join('\n') !== t.etiquetas.join('\n') ? { etiquetas } : {}) } });
    depoisDoMovimento(ator, t, m, agora, { painelNovo: novo.nome });
    return { ...nada(t), resumo: `Passou ${t.codigo} do painel ${painel.nome} para ${novo.nome} (${para.nome})` };
  }

  // =====================================================================
  //  ANOTAÇÕES
  // =====================================================================

  /** O anexo como fica guardado: o tipo de verdade da imagem; a imagem que não é imagem baixa como arquivo. */
  function anexoParaGuardar(a: { fileName: string; conteudo: string }) {
    const m = /^data:([^;]+);base64,(.+)$/s.exec(a.conteudo);
    if (!m) throw bad('Não consegui ler esse arquivo');
    const b64 = m[2]!;
    if (Math.floor((b64.length * 3) / 4) > LIMITE_ANEXO_BYTES) throw bad('Arquivo muito grande (máximo 10 MB)');
    const mime = m[1]!.toLowerCase();
    const real = tipoDaImagem(b64);
    const tipo = real ?? (IMAGENS_NA_TELA.includes(mime) ? 'application/octet-stream' : mime);
    // só a imagem de verdade abre na tela; o resto (SVG inclusive) baixa como arquivo
    const url = real ? `data:${real};base64,${b64}` : `data:application/octet-stream;base64,${b64}`;
    return { nome: a.fileName.trim().slice(0, 200) || 'arquivo', tipo, tamanho: bytesDoBase64(b64), url };
  }

  function anotar(ator: Ator, ref: string, d: { texto: string; anexos: Array<{ fileName: string; conteudo: string }> }, agora: Date = agoraReal()): Feito {
    exigirTrabalhar(ator);
    const texto = (d.texto ?? '').replace(/\r\n?/g, '\n').trim();
    const anexos = d.anexos ?? [];
    if (!texto && !anexos.length) throw bad('Escreva a anotação ou anexe um arquivo.');
    if (anexos.length > 5) throw bad('No máximo 5 anexos por anotação.');
    const guardar = anexos.map(anexoParaGuardar);
    const e = carregar(ator, ref, agora);
    const { t } = e;
    const pessoa = pessoaDoAtor(ator);
    // quem a anotação cita com @ (e vê o painel) recebe o aviso na hora, mesmo sem observar (como o servidor)
    const citados = texto.includes('@') ? citadosNoTexto(texto, quemVeOPainel(e.painel)).filter((c) => c.id !== pessoa) : [];
    const notaId = novoId();
    A.notas.push({ id: notaId, chamadoId: t.id, userId: pessoa, actorName: integracaoDoAtor(ator), texto, em: iso(agora), deletedAt: null, citados: citados.map((c) => c.id) });
    guardar.forEach((a, i) => A.anexos.push({ id: novoId(), chamadoId: t.id, notaId, ...a, porId: pessoa, em: iso(new Date(agora.getTime() + i)), deletedAt: null }));
    tocar(t, agora);
    if (ator.tipo === 'pessoa' && !t.respondidoEm) t.respondidoEm = iso(agora);
    emitir('chamado.anotacao', t.id, { anotacao: { texto, por: ator.nome, citados: citados.map((c) => c.nome) } });
    const comAnexo = guardar.length ? ` (com ${plural(guardar.length, 'anexo', 'anexos')})` : '';
    const oQueDisse = trechoDoAviso(texto.replace(/\s+/g, ' '), 140);
    if (citados.length) avisarEquipe({ evento: 'citado', para: citados.map((c) => c.id), menos: pessoa, chamado: curto(t), texto: `${ator.nome} citou você no ${t.codigo}: "${oQueDisse}"` }, agora);
    avisarObservadores({
      chamado: curto(t), observadores: t.observadores, menos: pessoa, jaAvisados: citados.map((c) => c.id),
      texto: texto ? `${ator.nome} anotou no ${t.codigo}${comAnexo}: "${oQueDisse}"` : `${ator.nome} anexou ${plural(guardar.length, 'arquivo', 'arquivos')} no ${t.codigo}`,
    }, agora);
    return {
      ...nada(t),
      resumo: `Anotou em ${t.codigo}${guardar.length ? ` (com ${plural(guardar.length, 'anexo', 'anexos')})` : ''}${citados.length ? `, citando ${emLista(citados.map((c) => c.nome))}` : ''}`,
      depois: { texto, anexos: guardar.map((a) => a.nome), ...(citados.length ? { citados: citados.map((c) => c.nome) } : {}) },
    };
  }

  function apagarAnotacao(ator: Ator, ref: string, notaId: string, agora: Date = agoraReal()): Feito {
    exigirTrabalhar(ator);
    const e = carregar(ator, ref, agora);
    const { t } = e;
    const n = A.notas.find((x) => x.id === notaId && x.chamadoId === t.id && !x.deletedAt);
    if (!n) throw naoAchado('Anotação');
    const minha = ator.tipo === 'pessoa' && n.userId === ator.id;
    if (!minha && !podeCuidar(ator)) throw proibido('Só quem escreveu (ou quem cuida dos chamados) pode apagar esta anotação.');
    n.deletedAt = iso(agora);
    // os anexos vão junto: a anotação apagada não deixa arquivo aberto para quem tem o endereço
    for (const a of A.anexos) if (a.notaId === n.id && !a.deletedAt) a.deletedAt = iso(agora);
    const autor = n.userId ? pessoaCurta(n.userId)!.nome : n.actorName;
    return { ...nada(t), resumo: `Apagou uma anotação${autor && !minha ? ` de ${autor}` : ''} em ${t.codigo}`, antes: { texto: n.texto, escritaEm: n.em, por: autor } };
  }

  // =====================================================================
  //  LIGAÇÕES, PAI E PROBLEMA
  // =====================================================================

  function ligar(ator: Ator, ref: string, d: { para: string; tipo: TipoLigacaoChamado }, agora: Date = agoraReal()): Feito {
    exigirTrabalhar(ator);
    const e = carregar(ator, ref, agora);
    const { t } = e;
    // a negociação não se liga a nada (2.0.1, decisão 0050), como no servidor
    if (e.painel.tipo === 'vendas') throw bad(NEGOCIACAO_SEM_LIGACAO);
    const outro = outroChamado(d.para, ator);
    if (outro.id === t.id) throw bad('Um chamado não se liga a ele mesmo.');
    if (ehNegociacao(outro)) throw bad(negociacaoNaoSeLiga(outro.codigo));
    const ja = A.ligacoes.some((l) => !l.deletedAt && ((l.de === t.id && l.para === outro.id) || (l.de === outro.id && l.para === t.id)));
    if (ja) throw conflito('Esses chamados já estão ligados.');
    const nome = NOME_LIGACAO[d.tipo];
    A.ligacoes.push({ id: novoId(), de: t.id, para: outro.id, tipo: d.tipo, porId: pessoaDoAtor(ator), em: iso(agora), deletedAt: null });
    registrarEvento(t.id, 'ligacao', ator, { acao: 'ligou', tipo: d.tipo, com: outro.codigo, texto: nome.de }, e.quando());
    registrarEvento(outro.id, 'ligacao', ator, { acao: 'ligou', tipo: d.tipo, com: t.codigo, texto: nome.para }, e.quando());
    tocar(t, agora); tocar(outro, agora);
    camposAosObservadores(ator, t, ['Ligações'], agora); camposAosObservadores(ator, outro, ['Ligações'], agora);
    return { ...nada(t), resumo: `Ligou ${t.codigo} a ${outro.codigo} (${nome.de} ${outro.codigo})` };
  }

  function desligar(ator: Ator, ref: string, ligacaoId: string, agora: Date = agoraReal()): Feito {
    exigirTrabalhar(ator);
    const e = carregar(ator, ref, agora);
    const { t } = e;
    const l = A.ligacoes.find((x) => x.id === ligacaoId && !x.deletedAt && (x.de === t.id || x.para === t.id));
    if (!l) throw naoAchado('Ligação');
    const deste = l.de === t.id;
    const outro = A.chamados.find((x) => x.id === (deste ? l.para : l.de));
    const nome = NOME_LIGACAO[l.tipo] ?? { de: l.tipo, para: l.tipo };
    l.deletedAt = iso(agora);
    registrarEvento(t.id, 'ligacao', ator, { acao: 'desligou', tipo: l.tipo, com: outro?.codigo ?? '?', texto: deste ? nome.de : nome.para }, e.quando());
    if (outro) registrarEvento(outro.id, 'ligacao', ator, { acao: 'desligou', tipo: l.tipo, com: t.codigo, texto: deste ? nome.para : nome.de }, e.quando());
    tocar(t, agora); if (outro) tocar(outro, agora);
    camposAosObservadores(ator, t, ['Ligações'], agora);
    return { ...nada(t), resumo: `Desligou ${t.codigo} de ${outro?.codigo ?? '?'}` };
  }

  /** O caminho do chamado até um descendente dele (olha também a lixeira: um restaurado não pode fechar um círculo). */
  function caminhoAteDescendente(de: string, ate: string): string[] | null {
    const filhos = new Map<string, string[]>();
    for (const x of A.chamados) if (x.paiId) filhos.set(x.paiId, [...(filhos.get(x.paiId) ?? []), x.id]);
    const codigo = new Map(A.chamados.map((x) => [x.id, x.codigo]));
    const veioDe = new Map<string, string>();
    const fila = [de];
    const vistos = new Set([de]);
    while (fila.length) {
      const atual = fila.shift()!;
      if (atual === ate) {
        const ids = [atual];
        for (let p = veioDe.get(atual); p; p = veioDe.get(p)) ids.unshift(p);
        return ids.map((id) => codigo.get(id) ?? '?');
      }
      for (const f of filhos.get(atual) ?? []) if (!vistos.has(f)) { vistos.add(f); veioDe.set(f, atual); fila.push(f); }
    }
    return null;
  }

  /** A negociação não tem pai nem filhos (2.0.1): tirar o pai que ela já tinha, pode (como no servidor). */
  function definirPai(ator: Ator, ref: string, paiRef: string | null, agora: Date = agoraReal()): Feito {
    exigirTrabalhar(ator);
    const e = carregar(ator, ref, agora);
    const { t } = e;
    if (paiRef?.trim() && e.painel.tipo === 'vendas') throw bad(NEGOCIACAO_SEM_PAI);
    const antigo = t.paiId ? A.chamados.find((x) => x.id === t.paiId) ?? null : null;
    if (!paiRef?.trim()) {
      if (!t.paiId) return nada(t);
      t.paiId = null; tocar(t, agora);
      registrarEvento(t.id, 'pai', ator, { acao: 'tirou', pai: antigo?.codigo ?? '?' }, e.quando());
      if (antigo) registrarEvento(antigo.id, 'filho', ator, { acao: 'tirou', filho: t.codigo }, e.quando());
      camposAosObservadores(ator, t, ['Pai'], agora);
      return { ...nada(t), resumo: `Tirou ${t.codigo} de filho de ${antigo?.codigo ?? '?'}` };
    }
    const pai = outroChamado(paiRef, ator);
    if (pai.id === t.paiId) return nada(t);
    if (pai.id === t.id) throw bad(`Isso faria um círculo: ${t.codigo} não pode ser pai dele mesmo.`);
    if (ehNegociacao(pai)) throw bad(negociacaoNaoEPai(pai.codigo));
    const ciclo = caminhoAteDescendente(t.id, pai.id);
    if (ciclo) throw bad(`Isso faria um círculo: ${pai.codigo} já está abaixo de ${t.codigo} (${ciclo.join(' › ')}).`);
    t.paiId = pai.id; tocar(t, agora);
    if (antigo) registrarEvento(antigo.id, 'filho', ator, { acao: 'tirou', filho: t.codigo }, e.quando());
    registrarEvento(t.id, 'pai', ator, { acao: 'ligou', pai: pai.codigo }, e.quando());
    registrarEvento(pai.id, 'filho', ator, { acao: 'ligou', filho: t.codigo, painel: e.painel.nome }, e.quando());
    tocar(pai, agora);
    camposAosObservadores(ator, t, ['Pai'], agora); camposAosObservadores(ator, pai, ['Filhos'], agora);
    return { ...nada(t), resumo: `Pôs ${t.codigo} como filho de ${pai.codigo}` };
  }

  function definirProblema(ator: Ator, ref: string, problemaRef: string | null, agora: Date = agoraReal()): Feito {
    exigirTrabalhar(ator);
    const e = carregar(ator, ref, agora);
    const { t } = e;
    const antigo = t.problemaId ? A.chamados.find((x) => x.id === t.problemaId) ?? null : null;
    if (!problemaRef?.trim()) {
      if (!t.problemaId) return nada(t);
      t.problemaId = null; tocar(t, agora);
      registrarEvento(t.id, 'problema', ator, { acao: 'tirou', problema: antigo?.codigo ?? '?' }, e.quando());
      if (antigo) registrarEvento(antigo.id, 'incidente', ator, { acao: 'tirou', incidente: t.codigo }, e.quando());
      camposAosObservadores(ator, t, ['Problema'], agora);
      return { ...nada(t), resumo: `Tirou ${t.codigo} do problema ${antigo?.codigo ?? '?'}` };
    }
    if (e.painel.tipo === 'vendas') throw bad(NEGOCIACAO_SEM_PROBLEMA);
    const problema = outroChamado(problemaRef, ator);
    if (problema.id === t.id) throw bad('Um chamado não é incidente dele mesmo.');
    if (problema.tipoChamado !== 'problema') throw bad(`${problema.codigo} não é um problema.`);
    if (problema.id === t.problemaId) return nada(t);
    t.problemaId = problema.id; tocar(t, agora);
    if (antigo) registrarEvento(antigo.id, 'incidente', ator, { acao: 'tirou', incidente: t.codigo }, e.quando());
    registrarEvento(t.id, 'problema', ator, { acao: 'ligou', problema: problema.codigo }, e.quando());
    registrarEvento(problema.id, 'incidente', ator, { acao: 'ligou', incidente: t.codigo }, e.quando());
    tocar(problema, agora);
    camposAosObservadores(ator, t, ['Problema'], agora); camposAosObservadores(ator, problema, ['Incidentes'], agora);
    return { ...nada(t), resumo: `Ligou ${t.codigo} ao problema ${problema.codigo}` };
  }

  // =====================================================================
  //  CHECKLIST, TEMPO, OPERADORA, ACOMPANHAR
  // =====================================================================

  type AcaoChecklist = { acao: 'marcar'; itemId: string; feito: boolean } | { acao: 'incluir'; texto: string } | { acao: 'tirar'; itemId: string };
  function mexerNoChecklist(ator: Ator, ref: string, d: AcaoChecklist, agora: Date = agoraReal()): Feito {
    exigirTrabalhar(ator);
    const e = carregar(ator, ref, agora);
    const { t } = e;
    const lista = [...t.checklist];
    let dados: Record<string, unknown>;
    let resumo: string;
    if (d.acao === 'incluir') {
      const texto = d.texto.trim();
      lista.push(itemNovo(texto, false));
      dados = { acao: 'incluiu', item: texto };
      resumo = `Incluiu "${texto}" no checklist de ${t.codigo}`;
    } else {
      const i = lista.findIndex((x) => x.id === d.itemId);
      if (i < 0) throw bad('Esse item não está no checklist do chamado.');
      const item = lista[i]!;
      if (d.acao === 'tirar') {
        lista.splice(i, 1);
        dados = { acao: 'tirou', item: item.texto };
        resumo = `Tirou "${item.texto}" do checklist de ${t.codigo}`;
      } else {
        if (item.feito === d.feito) return nada(t);
        lista[i] = { ...item, feito: d.feito, porId: d.feito ? pessoaDoAtor(ator) : null, em: d.feito ? iso(agora) : null };
        dados = { acao: 'marcou', item: item.texto, feito: d.feito };
        resumo = `${d.feito ? 'Marcou' : 'Desmarcou'} "${item.texto}" no checklist de ${t.codigo}`;
      }
    }
    t.checklist = lista; tocar(t, agora);
    registrarEvento(t.id, 'checklist', ator, dados, e.quando());
    camposAosObservadores(ator, t, ['Checklist'], agora);
    return { ...nada(t), resumo };
  }

  function registrarTempo(ator: Ator, ref: string, d: { minutos: number; nota?: string | null; dia?: string | null }, agora: Date = agoraReal()): Feito {
    exigirTrabalhar(ator);
    const e = carregar(ator, ref, agora);
    const { t } = e;
    const nota = d.nota?.trim() || null;
    const dia = d.dia || diaLocal(agora);
    A.tempos.push({ id: novoId(), chamadoId: t.id, userId: pessoaDoAtor(ator), minutos: d.minutos, nota, dia, em: iso(agora), deletedAt: null });
    registrarEvento(t.id, 'tempo', ator, { minutos: d.minutos, duracao: duracaoDoPrazo(d.minutos), nota }, e.quando());
    tocar(t, agora);
    camposAosObservadores(ator, t, ['Tempo gasto'], agora);
    return { ...nada(t), resumo: `Registrou ${duracaoDoPrazo(d.minutos)} de trabalho em ${t.codigo}${dia !== diaLocal(agora) ? ` (no dia ${dia})` : ''}` };
  }

  function apagarTempo(ator: Ator, ref: string, itemId: string, agora: Date = agoraReal()): Feito {
    exigirTrabalhar(ator);
    const e = carregar(ator, ref, agora);
    const { t } = e;
    const i = A.tempos.find((x) => x.id === itemId && x.chamadoId === t.id && !x.deletedAt);
    if (!i) throw naoAchado('Registro de tempo');
    const meu = ator.tipo === 'pessoa' && i.userId === ator.id;
    if (!meu && !podeCuidar(ator)) throw proibido('Só quem registrou (ou quem cuida dos chamados) pode apagar este tempo.');
    i.deletedAt = iso(agora);
    const quem = i.userId ? pessoaCurta(i.userId)!.nome : null;
    return { ...nada(t), resumo: `Apagou ${duracaoDoPrazo(i.minutos)} de trabalho${quem && !meu ? ` de ${quem}` : ''} em ${t.codigo}`, antes: { minutos: i.minutos, nota: i.nota, dia: i.dia, por: quem } };
  }

  function abrirNaOperadora(
    ator: Ator, ref: string,
    d: { operadoraId?: string | null; operadoraNome?: string | null; protocolo: string; prometidoPara?: string | null; cobrarACadaHoras?: number | null; nota?: string | null },
    agora: Date = agoraReal(),
  ): Feito {
    exigirTrabalhar(ator);
    const e = carregar(ator, ref, agora);
    const { t } = e;
    let nome: string;
    if (d.operadoraId) {
      const achada = S.carriers.find((c) => c.id === d.operadoraId);
      if (!achada) throw bad('Essa operadora não está no cadastro.');
      nome = achada.name;
    } else {
      if (!d.operadoraNome?.trim()) throw bad('Escolha a operadora do cadastro ou escreva o nome dela.');
      nome = d.operadoraNome.trim();
    }
    const protocolo = d.protocolo.trim();
    const marcarEspera = !esperaAberta(t.esperas);
    const motivoEspera = `Protocolo ${protocolo}`;
    A.casos.push({
      id: novoId(), chamadoId: t.id, operadoraId: d.operadoraId || null, operadoraNome: nome, protocolo, abertoEm: iso(agora),
      prometidoPara: d.prometidoPara ? iso(new Date(d.prometidoPara)) : null, cobrarACadaHoras: d.cobrarACadaHoras ?? null, situacao: 'aberto', fechadoEm: null,
      historico: [{ em: iso(agora), porId: pessoaDoAtor(ator), porNome: integracaoDoAtor(ator), acao: 'abriu', texto: d.nota?.trim() || null }],
    });
    registrarEvento(t.id, 'operadora', ator, { acao: 'abriu', operadora: nome, protocolo }, e.quando());
    if (marcarEspera) {
      t.esperas = [...t.esperas, { tipo: 'operadora', motivo: motivoEspera, inicio: iso(agora), fim: null, porId: pessoaDoAtor(ator) }];
      registrarEvento(t.id, 'espera', ator, { tipo: 'operadora', motivo: motivoEspera }, e.quando());
    }
    tocar(t, agora);
    contarAosObservadores(ator, t, `${ator.nome} abriu o protocolo ${protocolo} na ${nome} para o ${t.codigo}`, agora);
    return { ...nada(t), resumo: `Abriu o protocolo ${protocolo} na ${nome} para ${t.codigo}` };
  }

  function andamentoNaOperadora(ator: Ator, ref: string, casoId: string, d: { acao: 'cobrar' | 'fechar'; texto?: string | null }, agora: Date = agoraReal()): Feito {
    exigirTrabalhar(ator);
    const e = carregar(ator, ref, agora);
    const { t } = e;
    const c = A.casos.find((x) => x.id === casoId && x.chamadoId === t.id);
    if (!c) throw naoAchado('Protocolo da operadora');
    if (c.situacao === 'fechado') throw bad(`O protocolo ${c.protocolo} já foi fechado.`);
    const acao = d.acao === 'fechar' ? 'fechou' : 'cobrou';
    const texto = d.texto?.trim() || null;
    c.historico = [...c.historico, { em: iso(agora), porId: pessoaDoAtor(ator), porNome: integracaoDoAtor(ator), acao, texto }];
    if (acao === 'fechou') { c.situacao = 'fechado'; c.fechadoEm = iso(agora); }
    registrarEvento(t.id, 'operadora', ator, { acao, operadora: c.operadoraNome, protocolo: c.protocolo, texto }, e.quando());
    const aberta = esperaAberta(t.esperas);
    if (acao === 'fechou' && aberta?.tipo === 'operadora') {
      const minutos = Math.max(0, Math.round((agora.getTime() - Date.parse(aberta.inicio)) / MINUTO));
      t.esperas = t.esperas.map((w) => (w === aberta ? { ...w, fim: iso(agora) } : w));
      registrarEvento(t.id, 'espera', ator, { tipo: null, antes: 'operadora', minutos, duracao: duracaoDoPrazo(minutos) }, e.quando());
    }
    tocar(t, agora);
    contarAosObservadores(ator, t, acao === 'fechou'
      ? `${ator.nome} fechou o protocolo ${c.protocolo} da ${c.operadoraNome} no ${t.codigo}`
      : `${ator.nome} cobrou a ${c.operadoraNome} (protocolo ${c.protocolo}) no ${t.codigo}`, agora);
    return {
      ...nada(t),
      resumo: acao === 'fechou' ? `Fechou o protocolo ${c.protocolo} da ${c.operadoraNome} em ${t.codigo}` : `Cobrou a ${c.operadoraNome} (protocolo ${c.protocolo}) em ${t.codigo}`,
    };
  }

  function observar(ator: Ator, ref: string, acompanhar: boolean, agora: Date = agoraReal()): Feito {
    exigirTrabalhar(ator);
    if (ator.tipo !== 'pessoa') throw bad('Só uma pessoa observa um chamado.');
    const e = carregar(ator, ref, agora);
    const { t } = e;
    if (t.observadores.includes(ator.id) === acompanhar) return nada(t);
    t.observadores = acompanhar ? [...t.observadores, ator.id] : t.observadores.filter((x) => x !== ator.id);
    t.atualizadoEm = iso(agora);
    registrarEvento(t.id, 'observador', ator, { acao: acompanhar ? 'entrou' : 'saiu' }, e.quando());
    return { ...nada(t), resumo: `${acompanhar ? 'Passou a observar' : 'Deixou de observar'} ${t.codigo}` };
  }

  // =====================================================================
  //  AVISAR O CLIENTE E A RESPOSTA PRONTA
  // =====================================================================

  function avisarCliente(ator: Ator, ref: string, texto: string, agora: Date = agoraReal()): Feito {
    exigirTrabalhar(ator);
    const e = carregar(ator, ref, agora);
    const { t } = e;
    if (!t.contatoTelefone) throw bad('O chamado não tem o WhatsApp do contato.');
    const r = mandarAoCliente(ator, t, texto.trim(), e.quando());
    if (!r.ok) return { ...nada(t), resumo: `Tentou avisar o cliente de ${t.codigo} pelo WhatsApp, mas não foi: ${r.mensagem}`, erro: r.mensagem };
    tocar(t, agora);
    if (ator.tipo === 'pessoa' && !t.respondidoEm) t.respondidoEm = iso(agora);
    contarAosObservadores(ator, t, `${ator.nome} mandou ao cliente, no ${t.codigo}: "${trechoDoAviso(texto.trim().replace(/\s+/g, ' '), 140)}"`, agora);
    return { ...nada(t), resumo: `Avisou o cliente de ${t.codigo} pelo WhatsApp`, depois: { texto } };
  }

  // =====================================================================
  //  A LIXEIRA
  // =====================================================================

  function mandarParaLixeira(ator: Ator, ref: string, agora: Date = agoraReal()): Feito {
    if (!podeCuidar(ator)) throw proibido('Esta ação exige a permissão "tickets.manage"');
    const e = carregar(ator, ref, agora);
    const { t } = e;
    t.deletedAt = iso(agora); t.atualizadoEm = iso(agora);
    registrarEvento(t.id, 'lixeira', ator, { acao: 'mandou' }, e.quando());
    contarAosObservadores(ator, t, `${ator.nome} mandou o ${t.codigo} para a lixeira`, agora);
    return { ...nada(t), resumo: `Mandou ${t.codigo} "${t.titulo}" para a lixeira` };
  }

  function restaurar(ator: Ator, ref: string, agora: Date = agoraReal()): Feito {
    if (!podeCuidar(ator)) throw proibido('Esta ação exige a permissão "tickets.manage"');
    const e = carregar(ator, ref, agora, { lixeira: true });
    const { t } = e;
    if (!t.deletedAt) throw bad(`O ${t.codigo} não está na lixeira.`);
    t.deletedAt = null; t.atualizadoEm = iso(agora);
    registrarEvento(t.id, 'lixeira', ator, { acao: 'restaurou' }, e.quando());
    contarAosObservadores(ator, t, `${ator.nome} tirou o ${t.codigo} da lixeira`, agora);
    return { ...nada(t), resumo: `Restaurou ${t.codigo} "${t.titulo}" da lixeira` };
  }

  // =====================================================================
  //  O RELÓGIO (os agendados, os alertas de prazo, o sem dono, o fechar sozinho)
  // =====================================================================

  function textoNoHistorico(a: AlertaPrazo, prazos: Record<'resposta' | 'solucao', EstadoPrazo>, agora: Date): string {
    const qual = a.startsWith('resposta') ? 'resposta' : 'solucao';
    const e = prazos[qual];
    return a.endsWith('_perto')
      ? `o prazo de ${NOME_DO_PRAZO[qual]} chegou a ${e.percentual}%: ${minuscula(textoDoPrazo(e, agora))}`
      : `o prazo de ${NOME_DO_PRAZO[qual]} venceu (era de ${duracaoDoPrazo(e.limite)}${e.conta === 'uteis' ? ' úteis' : ''})`;
  }
  function textoNoAviso(a: AlertaPrazo, codigo: string, prazos: Record<'resposta' | 'solucao', EstadoPrazo>, agora: Date): string {
    const qual = a.startsWith('resposta') ? 'resposta' : 'solucao';
    return a.endsWith('_perto')
      ? `O prazo de ${NOME_DO_PRAZO[qual]} do ${codigo} está perto de vencer: ${minuscula(textoDoPrazo(prazos[qual], agora))}`
      : `O prazo de ${NOME_DO_PRAZO[qual]} do ${codigo} venceu`;
  }

  function nascerAgendados(agora: Date) {
    const vencidos = A.agendados.filter((a) => !a.deletedAt && a.ativo && a.proximaEm && Date.parse(a.proximaEm) <= agora.getTime())
      .sort((a, b) => (a.proximaEm ?? '').localeCompare(b.proximaEm ?? ''));
    for (const a of vencidos) {
      // a próxima vez sai de agora (e não da vez que venceu): a vez é reservada antes de criar
      if (a.regra.frequencia === 'uma_vez') { a.proximaEm = null; a.ativo = false; } else a.proximaEm = proximaExecucao(a.regra, agora, A.prazos.calendario)?.toISOString() ?? null;
      try {
        const r = criarDoAgendado(a, GESTOR, agora);
        a.ultimaEm = iso(agora); a.ultimoCodigo = r.codigo;
        auditarSistema('create', 'ticket', `O agendado "${a.titulo}" abriu ${r.codigo}`, r.id);
      } catch (err) {
        auditarSistema('update', 'ticket_schedule', `O agendado "${a.titulo}" não abriu o chamado: ${err instanceof Error ? err.message : String(err)}`, a.id);
      }
    }
  }

  function vigiarAbertos(agora: Date) {
    const cal = A.prazos.calendario;
    for (const t of A.chamados) {
      if (t.deletedAt) continue;
      const etapa = etapaPorId(t.etapaId);
      if (!etapa || (etapa.tipo !== 'entrada' && etapa.tipo !== 'andamento')) continue;
      const painel = A.paineis.find((p) => p.id === t.painelId && !p.deletedAt);
      if (!painel) continue;
      const ja = { ...t.alertas };
      const prazos = prazosDe(t, agora);
      const devidos = alertasDevidos(prazos, ja);
      const semDono = etapa.tipo === 'entrada' && !t.responsavelId && !ja.sem_dono && minutosUteisEntre(t.criadoEm, agora, cal) > A.prazos.semDonoMinutos;
      if (!devidos.length && !semDono) continue;
      const marca = iso(agora);
      t.alertas = { ...ja, ...Object.fromEntries(devidos.map((a) => [a, marca])), ...(semDono ? { sem_dono: marca } : {}) };
      const quando = relogio(agora);
      for (const a of devidos) registrarEvento(t.id, 'prazo', null, { alerta: a, texto: textoNoHistorico(a, prazos, agora) }, quando());
      for (const a of devidos) {
        const vencido = a.endsWith('_vencida');
        avisarEquipe({
          evento: vencido ? 'prazo_vencido' : 'prazo_perto', para: vencido ? [t.responsavelId, ...painel.ajustes.supervisores] : [t.responsavelId],
          chamado: curto(t), texto: textoNoAviso(a, t.codigo, prazos, agora),
        }, agora);
      }
      if (semDono) avisarEquipe({ evento: 'sem_dono', para: painel.ajustes.supervisores, chamado: curto(t), texto: `O ${t.codigo} está sem responsável há mais de ${duracaoDoPrazo(A.prazos.semDonoMinutos)}` }, agora);
    }
  }

  /** O Resolvido sem resposta por N dias úteis vai para a primeira etapa "fechado" (sem conferir os obrigatórios; respeita o pai que espera os filhos). */
  function fecharResolvidos(agora: Date) {
    for (const t of A.chamados) {
      if (t.deletedAt || !t.resolvidoEm || etapaPorId(t.etapaId)?.tipo !== 'resolvido') continue;
      const painel = painelPorId(t.painelId);
      const dias = painel?.ajustes.fecharSozinhoDias;
      if (!painel || !dias) continue;
      if (somarDiasUteis(t.resolvidoEm, dias, A.prazos.calendario).getTime() > agora.getTime()) continue;
      const para = painel.etapas.find((e) => e.tipo === 'fechado');
      if (!para) continue;
      if (filhosQueTravam(filhosDoChamado(t.id), para, painel.ajustes.paiEsperaFilhos).length) continue;
      const de = etapaDe(t.etapaId);
      const quando = relogio(agora);
      t.etapaId = para.id; t.fechadoEm = iso(agora); tocar(t, agora);
      registrarEvento(t.id, 'etapa', null, { de: etapaCurta(de), para: etapaCurta(para), motivo: null, sentido: null }, quando());
      registrarEvento(t.id, 'fechou_sozinho', null, { dias, etapa: de?.nome ?? 'Resolvido' }, quando());
      if (para.avisar.length) avisarEquipe({ evento: 'etapa', para: para.avisar, chamado: curto(t), texto: `${t.codigo} chegou em ${para.nome}` }, agora);
      avisarObservadores({
        chamado: curto(t), observadores: t.observadores, jaAvisados: para.avisar,
        texto: `O ${t.codigo} fechou sozinho: ${dias} ${dias === 1 ? 'dia útil' : 'dias úteis'} no ${de?.nome ?? 'Resolvido'} sem resposta do cliente`,
      }, agora);
      if (t.paiId) {
        const pai = A.chamados.find((x) => x.id === t.paiId && !x.deletedAt);
        if (pai?.responsavelId) avisarEquipe({ evento: 'etapa', tipo: 'pai', para: [pai.responsavelId], chamado: curto(pai), texto: `O filho ${t.codigo} do ${pai.codigo} foi fechado` }, agora);
      }
      emitir('chamado.movido', t.id); emitir('chamado.fechado', t.id);
      auditarSistema('update', 'ticket', `${t.codigo} fechou sozinho: ${dias} ${dias === 1 ? 'dia útil' : 'dias úteis'} no ${de?.nome ?? 'Resolvido'} sem resposta do cliente`, t.id);
    }
  }

  /** Uma volta do relógio. Um erro numa parte não segura as outras (como no servidor). */
  function volta(agora: Date) {
    for (const tarefa of [nascerAgendados, vigiarAbertos, fecharResolvidos]) {
      try { tarefa(agora); } catch (err) { A.erros.push(`relógio: ${err instanceof Error ? err.message : String(err)}`); }
    }
  }
  /** Com a prévia aberta, o relógio anda a cada leitura (no máximo uma vez a cada 30 segundos). */
  function relogioAoVivo() {
    const agora = agoraReal();
    if (agora.getTime() - A.ultimaVolta < 30_000) return;
    A.ultimaVolta = agora.getTime();
    volta(agora);
    // os lembretes do calendário (2.0.2), como no servidor: na mesma volta
    for (const f of relogiosDeFora) {
      try { f(agora); } catch (err) { A.erros.push(`relógio do calendário: ${err instanceof Error ? err.message : String(err)}`); }
    }
  }

  // =====================================================================
  //  A ROTINA: AS RESPOSTAS PRONTAS E OS AGENDADOS
  // =====================================================================


  function agendadoParaTela(a: AgendadoRow): Agendado {
    return {
      id: a.id, painelId: a.painelId, titulo: a.titulo, relato: a.relato,
      clienteId: a.clienteId, clienteNome: a.clienteId ? nomeCliente(a.clienteId) : null,
      responsavelId: a.responsavelId, responsavelNome: a.responsavelId ? pessoaCurta(a.responsavelId)!.nome : null,
      assuntoId: a.assuntoId, prioridade: a.prioridade, checklist: [...a.checklist],
      regra: { ...a.regra, dias: [...a.regra.dias] }, textoRegra: textoDaRegra(a.regra), ativo: a.ativo,
      proximaEm: a.proximaEm, ultimaEm: a.ultimaEm, ultimoCodigo: a.ultimoCodigo,
    };
  }
  const agendadosVivos = () => A.agendados.filter((a) => !a.deletedAt)
    .sort((a, b) => (a.proximaEm === b.proximaEm ? 0 : a.proximaEm === null ? 1 : b.proximaEm === null ? -1 : a.proximaEm.localeCompare(b.proximaEm)) || a.titulo.localeCompare(b.titulo, 'pt-BR'));

  /** O chamado do agendado, pelas regras do "abrir": origem "agendado", com os itens do agendado no checklist. */
  function criarDoAgendado(a: AgendadoRow, ator: Ator, agora: Date) {
    const lido = ChamadoCriarSchema.safeParse({
      painelId: a.painelId, titulo: a.titulo, relato: a.relato, clienteId: a.clienteId, responsavelId: a.responsavelId, assuntoId: a.assuntoId, prioridade: a.prioridade,
    });
    if (!lido.success) throw bad(`O agendado "${a.titulo}" tem um dado inválido: ${lido.error.issues[0]?.message ?? 'confira o cadastro'}.`);
    return criarChamado(ator, lido.data, { origem: 'agendado', agendadoId: a.id, checklistExtra: a.checklist }, agora);
  }

  // =====================================================================
  //  AS ETIQUETAS COM COR (o catálogo de cada painel, desde o 2.0.3; as mesmas regras do servidor)
  // =====================================================================

  /** Os nomes como estão no catálogo do painel, sem repetir; a que falta entra nele com a cor escolhida na tela (ou cinza). */
  function etiquetasDoCatalogo(painelId: string, nomes: string[], cores: Record<string, CorEtiqueta>, pessoa: string | null, quando: Date): string[] {
    const corDa = new Map(Object.entries(cores).map(([n, c]) => [chaveDaEtiqueta(n), c]));
    return etiquetasUnicas(etiquetasUnicas(nomes).map((n) => {
      const k = chaveDaEtiqueta(n);
      const ja = A.etiquetas.find((e) => e.painelId === painelId && e.chave === k);
      if (ja) return ja.nome;
      A.etiquetas.push({ id: novoId(), painelId, nome: n, chave: k, cor: corDa.get(k) ?? 'neutral', criadoPorId: pessoa, criadoEm: iso(quando), atualizadoEm: iso(quando) });
      return n;
    }));
  }
  /** O chamado que troca de painel leva as etiquetas: as que faltam no painel novo entram lá com a cor do antigo. */
  function levarEtiquetas(nomes: string[], de: string, para: string, pessoa: string | null, quando: Date): string[] {
    const cores: Record<string, CorEtiqueta> = {};
    for (const n of nomes) {
      const e = A.etiquetas.find((x) => x.painelId === de && x.chave === chaveDaEtiqueta(n));
      if (e) cores[n] = e.cor;
    }
    return etiquetasDoCatalogo(para, nomes, cores, pessoa, quando);
  }
  /** As etiquetas usadas nos chamados de um painel (fora da lixeira), pela chave: o nome e em quantos chamados está. */
  function usosDasEtiquetas(painelId: string) {
    const n = new Map<string, { nome: string; chamados: number }>();
    for (const t of A.chamados) {
      if (t.deletedAt || t.painelId !== painelId) continue;
      for (const nome of etiquetasUnicas(t.etiquetas)) {
        const u = n.get(chaveDaEtiqueta(nome));
        if (u) u.chamados += 1; else n.set(chaveDaEtiqueta(nome), { nome, chamados: 1 });
      }
    }
    return n;
  }
  const ordemDoNome = (a: { nome: string }, b: { nome: string }) => a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' });
  const nomeDoPainel = (id: string) => A.paineis.find((p) => p.id === id)?.nome ?? 'que saiu';
  /** As que a pessoa vê, painel por painel: as do catálogo de cada painel dela e as usadas nos chamados dele (fora do catálogo, cinza). */
  function etiquetasParaAPessoa(paineis: string[]): EtiquetaNoPainel[] {
    return paineis.flatMap((painelId) => {
      const lista: EtiquetaNoPainel[] = A.etiquetas.filter((e) => e.painelId === painelId).map((e) => ({ painelId, nome: e.nome, cor: e.cor }));
      for (const [k, u] of usosDasEtiquetas(painelId)) if (!A.etiquetas.some((e) => e.painelId === painelId && e.chave === k)) lista.push({ painelId, nome: u.nome, cor: 'neutral' });
      return lista.sort(ordemDoNome);
    });
  }
  const etiquetaParaTela = (e: EtiquetaRow): EtiquetaDoCatalogo => ({ id: e.id, painelId: e.painelId, nome: e.nome, cor: e.cor, chamados: usosDasEtiquetas(e.painelId).get(e.chave)?.chamados ?? 0, criadaEm: e.criadoEm });
  const etiquetaPorId = (id: string) => {
    const e = A.etiquetas.find((x) => x.id === id);
    if (!e) throw erro(404, 'Etiqueta não encontrada');
    return e;
  };
  /**
   * Editar uma etiqueta — o nome e a cor —, como o servidor: a que só está nos chamados do painel entra no
   * catálogo dele; o nome de outra do painel não vale; o nome novo vale nos chamados do painel (os da lixeira também).
   */
  function editarEtiqueta(alvo: EtiquetaRow | { painelId: string; nome: string }, d: { nome?: string; cor: CorEtiqueta }) {
    let e = 'id' in alvo ? alvo : A.etiquetas.find((x) => x.painelId === alvo.painelId && x.chave === chaveDaEtiqueta(alvo.nome));
    if (!e && !('id' in alvo)) {
      const usada = usosDasEtiquetas(alvo.painelId).get(chaveDaEtiqueta(alvo.nome));
      if (usada) {
        const agora = iso(agoraReal());
        e = { id: novoId(), painelId: alvo.painelId, nome: usada.nome, chave: chaveDaEtiqueta(usada.nome), cor: 'neutral', criadoPorId: S.me?.id ?? null, criadoEm: agora, atualizadoEm: agora };
        A.etiquetas.push(e);
      }
    }
    if (!e) throw erro(404, 'Etiqueta não encontrada');
    const painelId = e.painelId;
    const antes = { nome: e.nome, chave: e.chave, cor: e.cor };
    const nome = d.nome ?? e.nome;
    const chave = chaveDaEtiqueta(nome);
    if (chave !== e.chave) {
      const outra = A.etiquetas.find((x) => x.painelId === painelId && x.chave === chave);
      if (outra) throw conflito(`A etiqueta ${outra.nome} já existe neste painel: escolha outro nome.`);
    }
    e.nome = nome; e.chave = chave; e.cor = d.cor; e.atualizadoEm = iso(agoraReal());
    let chamados = 0;
    if (nome !== antes.nome) {
      for (const t of A.chamados) {
        if (t.painelId !== painelId) continue;
        const nova = renomearEtiqueta(t.etiquetas, antes.chave, nome);
        if (nova) { t.etiquetas = nova; chamados += 1; }
      }
    }
    const painel = nomeDoPainel(painelId);
    const nos = chamados ? ` (em ${chamados} ${chamados === 1 ? 'chamado' : 'chamados'})` : '';
    const renomeou = nome !== antes.nome;
    const resumo = renomeou && antes.cor !== d.cor ? `Editou a etiqueta ${antes.nome} do painel ${painel}: agora ${nome}, ${NOME_COR_ETIQUETA[d.cor].toLowerCase()}${nos}`
      : renomeou ? `Renomeou a etiqueta ${antes.nome} do painel ${painel} para ${nome}${nos}`
        : antes.cor !== d.cor ? `Trocou a cor da etiqueta ${nome} do painel ${painel}: ${NOME_COR_ETIQUETA[antes.cor]} → ${NOME_COR_ETIQUETA[d.cor]}`
          : `Salvou a etiqueta ${nome} do painel ${painel} sem mudanças`;
    auditar('update', 'ticket_tag', resumo, e.id, { before: { painel, nome: antes.nome, cor: antes.cor }, after: { painel, nome, cor: d.cor } });
    return etiquetaParaTela(e);
  }

  // =====================================================================
  //  A LEITURA (as opções, o quadro, a lista, o Meu dia, o sininho, o cadastro, a ficha)
  // =====================================================================

  function opcoes(ator: Ator): OpcoesAtendimento {
    const vistos = paineis().filter((p) => podeVerPainel(p, ator));
    const ids = vistos.map((p) => p.id);
    const ia = S.ajustesIa;
    // "ligada" como o `situacaoIa` do servidor: ligada, com a chave que serve para o provedor escolhido e com o modelo
    const chaveServe = ia.temChave && ia.chaveDe === ia.provedor && (ia.provedor !== 'compativel' || (!!ia.chaveEndereco && ia.chaveEndereco === hostDoEndereco(ia.endereco)));
    return {
      paineis: vistos,
      pessoas: S.users.filter((u) => u.active).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')).map((u) => ({ id: u.id, nome: u.name, ativo: true })),
      assuntos: vistos.flatMap((p) => emOrdemDeArvore(A.assuntos.filter((a) => a.painelId === p.id)).map(({ profundidade: _p, ...a }) => ({ ...a, checklist: [...a.checklist], dePara: [...a.dePara] }))),
      campos: vistos.flatMap((p) => camposDoPainel(p.id).map(campoParaTela)),
      produtos: S.products.filter((p) => !p.deletedAt && p.active).sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)).map((p) => ({ id: p.id, nome: p.name, cor: p.color })),
      operadoras: S.carriers.filter((c) => c.active).sort((a, b) => a.name.localeCompare(b.name)).map((c) => ({ id: c.id, nome: c.name })),
      etiquetas: etiquetasParaAPessoa(ids),
      prazos: JSON.parse(JSON.stringify(A.prazos)) as AjustesPrazos,
      whatsapp: whatsAppPronto(),
      ia: { ativa: ia.ativo && chaveServe && !!ia.modelo, modelo: (ia.modeloNome || ia.modelo) || null },
      linechatUrl: S.ajustesLineChat.ativo && S.ajustesLineChat.appUrl ? S.ajustesLineChat.appUrl.replace(/\/+$/, '') : null,
      pode: { trabalhar: podeTrabalhar(ator), cuidar: podeCuidar(ator), integrar: ator.tipo === 'pessoa' && ator.permissoes.includes('admin.manage') },
    };
  }

  const maisRecente = (a: string | null, b: string | null) => (b ?? '').localeCompare(a ?? '');
  function quadro(ator: Ator, f: Partial<FiltrosAtendimento> & { painel: string }): QuadroAtendimento {
    const agora = agoraReal();
    const todos = paineis();
    const painel = todos.find((p) => p.id === f.painel) ?? todos.find((p) => p.sigla === f.painel.trim().toUpperCase());
    if (!painel || !podeVerPainel(painel, ator)) throw naoAchado('Painel');
    const doPainel = cartoesVisiveis(ator, agora).filter((c) => c.painelId === painel.id);
    const daLista = filtrarCartoes(doPainel, { ...f, painel: painel.id, situacao: 'todos' }, { euId: ator.id, assuntos: A.assuntos });
    const colunas = painel.etapas.map((etapa) => {
      const daqui = daLista.filter((c) => c.etapaId === etapa.id);
      const ordenados = etapa.tipo === 'resolvido'
        ? [...daqui].sort((a, b) => maisRecente(a.resolvidoEm ?? a.ultimaAtividadeEm, b.resolvidoEm ?? b.ultimaAtividadeEm))
        : etapa.tipo === 'fechado'
          ? [...daqui].sort((a, b) => maisRecente(a.fechadoEm ?? a.ultimaAtividadeEm, b.fechadoEm ?? b.ultimaAtividadeEm))
          // a negociação (painel de Vendas) não tem prazo: a de maior valor primeiro
          : [...daqui].sort(painel.tipo === 'vendas' ? compararNegociacoes : compararUrgencia);
      const mostrados = etapa.tipo === 'fechado' ? ordenados.slice(0, FECHADOS_NO_QUADRO) : ordenados;
      return { etapa, chamados: mostrados.map(semBusca), total: daqui.length, escondidos: daqui.length - mostrados.length, valor: daqui.reduce((t, c) => t + (c.valor ?? 0), 0) };
    });
    return { painelId: painel.id, colunas, foraDoHorario: !dentroDoHorario(agora, A.prazos.calendario), agora: iso(agora) };
  }

  /** O relatório de vendas de um painel de Vendas (as contas do shared, como no servidor). */
  function relatorioDoPainelDeVendas(ator: Ator, f: ReturnType<typeof FiltroDoRelatorioDeVendasSchema.parse>): RelatorioDeVendas {
    const todos = paineis();
    const painel = todos.find((p) => p.id === f.painel) ?? todos.find((p) => p.sigla === f.painel.trim().toUpperCase());
    if (!painel || !podeVerPainel(painel, ator)) throw naoAchado('Painel');
    if (painel.tipo !== 'vendas') throw bad(`O painel ${painel.nome} não é de vendas: o relatório de vendas é dos painéis de Vendas.`);
    const linhas = A.chamados.filter((t) => !t.deletedAt && t.painelId === painel.id);
    const ids = new Set(linhas.map((t) => t.id));
    const porChamado = new Map<string, Array<{ tipo: string; em: string; dados: Record<string, any> }>>();
    for (const ev of A.eventos) {
      if (!ids.has(ev.chamadoId) || (ev.tipo !== 'criado' && ev.tipo !== 'etapa')) continue;
      porChamado.set(ev.chamadoId, [...(porChamado.get(ev.chamadoId) ?? []), { tipo: ev.tipo, em: ev.em, dados: ev.dados }]);
    }
    // todas as etapas do painel, inclusive as que saíram
    const doPainel = new Set(A.etapas.filter((e) => e.painelId === painel.id).map((e) => e.id));
    const negociacoes: NegociacaoParaRelatorio[] = linhas.map((t) => {
      const passagens = passagensNoPainel(passagensDosEventos(t.criadoEm, t.etapaId, porChamado.get(t.id) ?? []), doPainel);
      return {
        id: t.id, codigo: t.codigo, titulo: t.titulo,
        empresa: t.clienteId ? nomeCliente(t.clienteId) : t.empresa,
        responsavel: t.responsavelId ? S.users.find((u) => u.id === t.responsavelId)?.name ?? null : null,
        valor: t.valor, ativacao: t.ativacao, etapaId: t.etapaId,
        // a que veio de outro painel conta de quando entrou neste
        criadoEm: passagens[0]?.desde ?? t.criadoEm, fechadoEm: t.fechadoEm,
        resultado: etapaPorId(t.etapaId)?.resultado ?? null, motivoPerda: t.motivoPerda, passagens,
        produtos: t.produtos.map((id) => S.products.find((x) => x.id === id)?.name ?? '?'),
      };
    });
    // a margem das ganhas (2.0.2): as simulações da prévia do Simulador
    return relatorioDeVendas(painel, negociacoes, f, fonteDasMargens?.() ?? undefined);
  }

  function ordemDasEtapas(): Map<string, number> {
    const m = new Map<string, number>();
    paineis().forEach((p, i) => p.etapas.forEach((e, j) => m.set(e.id, i * 100 + j)));
    return m;
  }
  function filtrados(ator: Ator, f: FiltrosAtendimento) {
    const todos = cartoesVisiveis(ator, agoraReal());
    return ordenarCartoes(filtrarCartoes(todos, f, { euId: ator.id, assuntos: A.assuntos }), f.sort, f.dir, ordemDasEtapas());
  }

  const apertado = (c: CartaoChamado) =>
    c.prazos.resposta.situacao === 'perto' || c.prazos.resposta.situacao === 'vencido' || c.prazos.solucao.situacao === 'perto' || c.prazos.solucao.situacao === 'vencido';
  function meuDia(ator: Ator): MeuDia {
    const agora = agoraReal();
    const todos = cartoesVisiveis(ator, agora);
    const vis = visiveis(ator);
    const observo = new Set(A.chamados.filter((t) => !t.deletedAt && t.observadores.includes(ator.id)).map((t) => t.id));
    const hoje = diaLocal(agora);
    const abertos = todos.filter((c) => c.situacao === 'aberto');
    const porUrgencia = (l: CartaoParaLista[]) => [...l].sort(compararUrgencia).map(semBusca);
    return {
      meus: porUrgencia(abertos.filter((c) => c.responsavel?.id === ator.id)),
      vencendo: porUrgencia(abertos.filter((c) => (!c.responsavel || c.responsavel.id === ator.id) && apertado(c))),
      semDono: porUrgencia(abertos.filter((c) => !c.responsavel)),
      esperandoCliente: porUrgencia(abertos.filter((c) => c.responsavel?.id === ator.id && c.espera?.tipo === 'cliente')),
      observando: porUrgencia(abertos.filter((c) => observo.has(c.id))),
      agendadosHoje: A.agendados.filter((a) => !a.deletedAt && a.ativo && vis.has(a.painelId) && a.proximaEm && diaLocal(a.proximaEm) === hoje)
        .sort((a, b) => a.proximaEm!.localeCompare(b.proximaEm!))
        .map((a) => ({ id: a.id, titulo: a.titulo, hora: horaLocal(a.proximaEm!), painelId: a.painelId })),
      abertosHoje: todos.filter((c) => diaLocal(c.criadoEm) === hoje).length,
      fechadosHoje: todos.filter((c) => !!c.fechadoEm && diaLocal(c.fechadoEm) === hoje).length,
    };
  }

  function avisosNaTela(userId: string): AvisosNaTela {
    const meus = A.avisos.filter((a) => a.userId === userId);
    const ordem = new Map(meus.map((a, i) => [a.id, i]));
    const itens = [...meus].sort((a, b) => b.em.localeCompare(a.em) || ordem.get(b.id)! - ordem.get(a.id)!).slice(0, 30);
    return {
      naoLidos: meus.filter((a) => !a.lidoEm).length,
      itens: itens.map((a) => {
        const t = a.chamadoId ? A.chamados.find((x) => x.id === a.chamadoId) : undefined;
        return { id: a.id, tipo: a.tipo, texto: a.texto, chamado: t ? { id: t.id, codigo: t.codigo, titulo: t.titulo } : null, evento: a.evento ?? null, em: a.em, lido: !!a.lidoEm };
      }),
    };
  }

  function cadastroDoCliente(ator: Ator, clienteId: string): CadastroDoCliente {
    if (!clienteVivo(clienteId)) throw naoAchado('Cliente');
    const prods = S.subs.filter((s) => s.clientId === clienteId && !s.deactivatedAt)
      .map((s) => S.products.find((p) => p.code === s.productCode))
      .filter((p): p is NonNullable<typeof p> => !!p && !p.deletedAt && p.active)
      .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
    const titular = S.circuits.filter((c) => c.ownerClientId === clienteId && !c.deletedAt);
    const numeros = S.dids.filter((d) => d.clientId === clienteId && !d.deletedAt).sort((a, b) => a.number.localeCompare(b.number));
    // os circuitos dos DIDs dele (o DID do cliente pode estar num feixe que é da VoiceNet)
    const dosDids = [...new Set(numeros.map((d) => d.circuitId).filter((x): x is string => !!x))].filter((id) => !titular.some((c) => c.id === id));
    const todosCircuitos = [...titular, ...S.circuits.filter((c) => dosDids.includes(c.id) && !c.deletedAt)].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
    const idsOperadoras = [...new Set(todosCircuitos.map((c) => c.carrierId).filter((x): x is string => !!x))];
    const ops = S.carriers.filter((c) => idsOperadoras.includes(c.id)).sort((a, b) => a.name.localeCompare(b.name));
    const aparelhos = S.devices.filter((d) => d.clientId === clienteId && !d.deletedAt)
      .map((d) => ({ d, modelo: S.models.find((m) => m.id === d.modelId)?.name ?? '?' }))
      .sort((a, b) => a.modelo.localeCompare(b.modelo) || (a.d.mac ?? '').localeCompare(b.d.mac ?? ''));
    const unidades = S.units.filter((u) => u.clientId === clienteId && !u.deletedAt).sort((a, b) => Number(b.isMain) - Number(a.isMain) || a.name.localeCompare(b.name));
    // "Reabrir este": os do cliente ainda abertos ou abertos nos últimos 7 dias
    const agora = agoraReal();
    const desde = agora.getTime() - 7 * DIA;
    const recentes = cartoesVisiveis(ator, agora)
      .filter((c) => c.cliente?.id === clienteId && (c.situacao === 'aberto' || Date.parse(c.criadoEm) >= desde))
      .sort((a, b) => b.criadoEm.localeCompare(a.criadoEm)).slice(0, 10).map(semBusca);
    return {
      produtos: prods.map((p) => ({ id: p.id, nome: p.name, cor: p.color })),
      operadoras: ops.map((o) => ({ id: o.id, nome: o.name })),
      circuitos: todosCircuitos.map((c) => ({ id: c.id, nome: c.name, operadora: c.carrierId ? S.carriers.find((o) => o.id === c.carrierId)?.name ?? null : null })),
      dids: numeros.map((d) => ({ id: d.id, numero: didFormatado(d.number), circuito: d.circuitId ? todosCircuitos.find((c) => c.id === d.circuitId)?.name ?? null : null })),
      aparelhos: aparelhos.map(({ d, modelo }) => ({ id: d.id, nome: `${modelo} · ${d.mac ? macFormatado(d.mac) : d.serialNumber ? `N/S ${d.serialNumber}` : 'sem identificação'}` })),
      unidades: unidades.map((u) => ({ id: u.id, nome: u.name })),
      recentes,
      // os contatos dele (a aba Contatos do cliente), os ativos, pelo nome
      contatos: S.contatos.filter((c) => c.clientId === clienteId && c.ativo)
        .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' }))
        .map((c) => ({ ...c, clienteId: c.clientId, chamados: c.whatsapp ? A.chamados.filter((t) => !t.deletedAt && t.clienteId === clienteId && t.contatoTelefone === c.whatsapp).length : 0 }))
        .map(({ clientId: _c, ...c }) => c),
    };
  }

  /** O anexo só abre para quem vê o chamado (e nunca o de anotação apagada). */
  function anexoVisivel(id: string, a: Ator): AnexoRow | null {
    const x = A.anexos.find((y) => y.id === id);
    if (!x || x.deletedAt) return null;
    const nota = A.notas.find((n) => n.id === x.notaId);
    const t = A.chamados.find((c) => c.id === x.chamadoId);
    if (!t || t.deletedAt || nota?.deletedAt) return null;
    const p = painelPorId(t.painelId);
    return p && podeVerPainel(p, a) ? x : null;
  }

  /** O card antigo do LineChat citado no texto (pela chave, como IS-3127). */
  function cardDoLineChat(codigo: string) {
    try {
      return ctx.cardsDoLineChat().find((c) => (c.key ?? '').toUpperCase() === codigo) ?? null;
    } catch { return null; }
  }

  function ficha(ator: Ator, ref: string): FichaChamado {
    const agora = agoraReal();
    const t = chamadoVisivel(ref, ator);
    const painel = painelPorId(t.painelId)!;
    const vis = visiveis(ator);
    const par = parentes();
    const eventos = porData(A.eventos.filter((e) => e.chamadoId === t.id));
    const notas = porData(A.notas.filter((n) => n.chamadoId === t.id && !n.deletedAt));
    const anexos = porData(A.anexos.filter((a) => a.chamadoId === t.id && !a.deletedAt));
    const tempo = A.tempos.filter((i) => i.chamadoId === t.id && !i.deletedAt).sort((a, b) => a.dia.localeCompare(b.dia) || a.em.localeCompare(b.em));
    const casos = A.casos.filter((c) => c.chamadoId === t.id).sort((a, b) => a.abertoEm.localeCompare(b.abertoEm));
    const filhos = filhosDoChamado(t.id);
    const todasLigacoes = porData(A.ligacoes.filter((l) => !l.deletedAt));

    // os chamados que a pessoa vê, em forma de nó (para o desenho e para saber quem pode aparecer)
    const mapa = new Map<string, NoParaGrafo>();
    for (const n of A.chamados) {
      if (n.deletedAt || !vis.has(n.painelId)) continue;
      mapa.set(n.id, { id: n.id, codigo: n.codigo, titulo: n.titulo, tipoChamado: n.tipoChamado, paiId: n.paiId, problemaId: n.problemaId, situacao: situacaoDe(n) });
    }
    // a negociação não se liga a nada (2.0.1, decisão 0050): fica fora das ligações e do desenho, como no
    // servidor — o código citado num texto continua virando link (é o `mapa`)
    const doDesenho = new Map<string, NoParaGrafo>();
    for (const n of A.chamados) {
      const no = mapa.get(n.id);
      if (no && (n.id === t.id || (!ehNegociacao(n) && !ehNegociacao(t)))) doDesenho.set(n.id, no);
    }
    const minhasLigacoes = todasLigacoes.filter((l) => (l.de === t.id || l.para === t.id) && doDesenho.has(l.de === t.id ? l.para : l.de));
    const idsFilhos = A.chamados.filter((n) => !n.deletedAt && n.paiId === t.id && mapa.has(n.id)).map((n) => n.id);
    const idsIncidentes = A.chamados.filter((n) => !n.deletedAt && n.problemaId === t.id && mapa.has(n.id)).map((n) => n.id);
    const cartaoDe = (id: string) => { const x = A.chamados.find((c) => c.id === id); return x ? cartao(x, par, agora) : null; };
    const esteCartao = cartao(t, par, agora);

    // as referências escritas no texto: do Gestor (se a pessoa vê), senão um card do LineChat antigo
    const codigos = referenciasNoTexto(t.relato, t.descricao, t.solucao, t.causa, ...notas.map((n) => n.texto)).filter((c) => c !== t.codigo);
    const appUrl = (S.ajustesLineChat.appUrl || 'https://inglinechat.com.br').replace(/\/+$/, '');
    const referencias: ReferenciaMostrada[] = codigos.map((codigo) => {
      const g = A.chamados.find((x) => x.codigo === codigo && !x.deletedAt);
      const no = g ? mapa.get(g.id) : undefined;
      if (no) return { codigo, existe: true, titulo: no.titulo, situacao: no.situacao, id: no.id, url: null };
      const card = cardDoLineChat(codigo);
      if (card?.key) return { codigo, existe: true, titulo: card.title || null, situacao: card.stepTitle, id: null, url: `${appUrl}/panels/${S.ajustesLineChat.painelId}/card/${encodeURIComponent(card.key)}` };
      return { codigo, existe: false, titulo: null, situacao: null, id: null, url: null };
    });
    // as citações para o desenho: o que este chamado cita, e quem cita este chamado (no texto ou numa anotação)
    const padrao = new RegExp(`\\b${t.codigo}\\b`);
    const citam = new Set<string>();
    for (const x of A.chamados) {
      if (x.deletedAt || x.id === t.id) continue;
      if (padrao.test([x.relato, x.descricao, x.solucao, x.causa].filter(Boolean).join(' '))) citam.add(x.id);
    }
    for (const n of A.notas) if (!n.deletedAt && n.chamadoId !== t.id && padrao.test(n.texto)) citam.add(n.chamadoId);
    const citacoes = [...referencias.filter((r) => r.id).map((r) => ({ de: t.id, para: r.id! })), ...[...citam].map((id) => ({ de: id, para: t.id }))];
    const grafo = grafoDeLigacoes(t.id, doDesenho, todasLigacoes.map((l) => ({ de: l.de, para: l.para, tipo: l.tipo })), citacoes);

    // a trajetória: a etapa em que nasceu (o evento "criado") e cada movimento depois
    const criado = eventos.find((e) => e.tipo === 'criado');
    const dc = criado?.dados ?? {};
    const movimentos = eventos.filter((e) => e.tipo === 'etapa');
    const primeiro = movimentos[0]?.dados ?? {};
    const etapaInicial = {
      nome: (dc.etapa as string | undefined) ?? (primeiro.de?.nome as string | undefined) ?? etapaPorId(t.etapaId)?.nome ?? '?',
      nivel: ((dc.etapaId ? etapaPorId(dc.etapaId as string)?.nivel : primeiro.de?.nivel) ?? null) as Nivel | null,
    };
    const nomeDeQuem = (userId: string | null, actorName: string | null) => (userId ? pessoaCurta(userId)!.nome : actorName);
    const passos = trajetoria(t.criadoEm, etapaInicial, movimentos.map((e) => ({
      em: e.em, para: { nome: e.dados.para?.nome ?? '?', nivel: (e.dados.para?.nivel ?? null) as Nivel | null }, motivo: e.dados.motivo ?? null,
      por: nomeDeQuem(e.userId, e.actorName), sentido: e.dados.sentido ?? null,
    })), agora);

    const dados = dadosDoChamado(t);
    const cuida = podeCuidar(ator);
    const meu = (userId: string | null) => ator.tipo === 'pessoa' && userId === ator.id;
    const anotacoesLista: AnotacaoChamado[] = notas.map((n) => ({
      id: n.id, texto: n.texto, por: pessoaCurta(n.userId), porNome: n.actorName, em: n.em,
      anexos: anexos.filter((a) => a.notaId === n.id).map((a) => ({ id: a.id, nome: a.nome, tipo: a.tipo, tamanho: a.tamanho, imagem: IMAGENS_NA_TELA.includes(a.tipo), url: a.url })),
      podeApagar: cuida || meu(n.userId),
      citados: n.citados.map((id) => pessoaCurta(id)).filter((x): x is NonNullable<typeof x> => !!x),
    }));
    const operadora: CasoOperadora[] = casos.map((c) => {
      const ultimaCobranca = [...c.historico].reverse().find((h) => h.acao === 'cobrou');
      const base = ultimaCobranca?.em ?? c.abertoEm;
      return {
        id: c.id, operadora: { id: c.operadoraId, nome: c.operadoraNome }, protocolo: c.protocolo, abertoEm: c.abertoEm,
        prometidoPara: c.prometidoPara, cobrarACadaHoras: c.cobrarACadaHoras,
        proximaCobrancaEm: c.situacao === 'aberto' && c.cobrarACadaHoras ? iso(new Date(Date.parse(base) + c.cobrarACadaHoras * 3_600_000)) : null,
        situacao: c.situacao, fechadoEm: c.fechadoEm,
        andamentos: c.historico.map((h) => ({ em: h.em, por: h.porId ? pessoaCurta(h.porId)!.nome : h.porNome ?? null, texto: h.texto ?? '', acao: h.acao })),
      };
    });
    const historico: EventoChamado[] = eventos.map((e) => ({
      id: e.id, tipo: e.tipo, em: e.em, por: pessoaCurta(e.userId), porNome: e.actorName, dados: e.dados, texto: textoDoEvento(e.tipo, e.dados),
    }));

    return {
      ...esteCartao,
      relato: t.relato, descricao: t.descricao, solucao: t.solucao, causa: t.causa, contorno: t.contorno, validacao: t.validacao,
      motivoPrioridade: t.motivoPrioridade,
      // pelos campos do painel: sem o alcance, só a gravidade; sem a gravidade, nenhuma (como no servidor)
      prioridadeSugerida: prioridadeSugeridaDoPainel(painel.ajustes, t.gravidade, t.alcance, A.prazos),
      sessaoId: t.sessaoId,
      conversaUrl: linkDaConversa(A.integ.linkConversa, t.sessaoId),
      checklist: t.checklist.map((i) => ({ ...i })),
      observadores: t.observadores.map((id) => pessoaCurta(id)!),
      citaveis: quemVeOPainel(painel),
      criadoPor: pessoaCurta(t.criadoPorId),
      esperas: t.esperas.map((w) => ({ ...w })),
      filhosLista: idsFilhos.map(cartaoDe).filter((c): c is CartaoChamado => !!c),
      incidentesLista: idsIncidentes.map(cartaoDe).filter((c): c is CartaoChamado => !!c),
      ligacoes: minhasLigacoes.flatMap((l) => {
        const deste = l.de === t.id;
        const outro = cartaoDe(deste ? l.para : l.de);
        return outro ? [{ id: l.id, tipo: l.tipo, texto: deste ? NOME_LIGACAO[l.tipo].de : NOME_LIGACAO[l.tipo].para, chamado: outro }] : [];
      }),
      referencias,
      anotacoesLista,
      historico,
      tempo: {
        total: tempo.reduce((s, i) => s + i.minutos, 0),
        itens: tempo.map((i) => ({ id: i.id, minutos: i.minutos, nota: i.nota, dia: i.dia, por: pessoaCurta(i.userId), em: i.em, podeApagar: cuida || meu(i.userId) })),
      },
      operadora,
      trajetoria: passos,
      faltam: Object.fromEntries(painel.etapas.map((e) => [e.id, faltaParaEtapa(dados, e)])),
      filhosTravam: Object.fromEntries(painel.etapas.map((e) => [e.id, filhosQueTravam(filhos, e, painel.ajustes.paiEsperaFilhos)])),
      grafo,
      observando: ator.tipo === 'pessoa' && t.observadores.includes(ator.id),
      pode: { trabalhar: podeTrabalhar(ator), cuidar: cuida },
    };
  }

  // =====================================================================
  //  A IA NO CHAMADO (sem IA de verdade: as palavras do próprio chamado)
  // =====================================================================

  const TEM = (re: RegExp, s: string) => re.test(s);
  /**
   * O que a IA devolveria, montado com as palavras do chamado: o assunto que mais combina (pelas palavras
   * do caminho), o tipo, a gravidade e o alcance pelas palavras do relato, os produtos citados. Passa pela
   * `lerSugestaoDaIa` como a resposta da IA de verdade: o que não existe nas opções fica de fora.
   */
  function sugestao(t: ChamadoRow, painel: Painel): { json: Record<string, unknown>; letras: number } {
    // o chamado do robô de exemplo: a IA leu a conversa (que a prévia não tem) — a sugestão vem escrita
    const lida = t.sessaoId && S.ajustesLineChat.ativo ? A.iaExemplos.get(t.id) : undefined;
    if (lida) { const { letras, ...json } = lida; return { json, letras }; }
    const notas = porData(A.notas.filter((n) => n.chamadoId === t.id && !n.deletedAt && n.texto.trim()));
    const fala = (t.relato ?? '').replace(/^Cliente pelo WhatsApp:\s*/i, '').replace(/^"|"$/g, '').trim();
    const tudo = [t.titulo, fala, t.descricao ?? '', ...notas.map((n) => n.texto)].join('\n');
    const b = paraBusca(tudo);
    const palavras = new Set(b.split(/[^a-z0-9]+/).filter((p) => p.length >= 3));
    // o assunto: o caminho com mais palavras em comum (o mais fundo desempata)
    const caminhos = A.assuntos.filter((a) => a.painelId === painel.id && a.ativo).map((a) => ({ a, c: caminhoDoAssunto(a.id, A.assuntos), n: nivelDoAssunto(a.id, A.assuntos) }));
    let melhor: { c: string; pontos: number } | null = null;
    for (const x of caminhos) {
      const termos = paraBusca(x.c).split(/[^a-z0-9]+/).filter((p) => p.length >= 3 && !['configuracao', 'incidente', 'solicitacao'].includes(p));
      // parecido conta a partir de 6 letras iguais: "relatorio" acha "relatorios", mas "entrar" não acha "entrada"
      const pontos = termos.filter((p) => palavras.has(p) || (p.length >= 6 && [...palavras].some((w) => w.startsWith(p.slice(0, 6))))).length * 10 + x.n;
      if (termos.length && pontos > 10 && (!melhor || pontos > melhor.pontos)) melhor = { c: x.c, pontos };
    }
    const pedido = TEM(/\b(criar|cria|novo|nova|novos|novas|trocar|instalar|pedi|pediu|pedido|quer|liberar|login|acesso|mandar|configurar)\b/, b);
    const duvida = TEM(/\b(duvida|como faco|como faz)\b/, b) || tudo.includes('?');
    const gravidade = TEM(/\b(nao (funciona|liga|toca|completa|registra|entra|da sinal|consigo)|parou|mudo|fora|nenhum[a]?|caiu|inexistente|sem (sinal|servico|registro))\b/, b) ? 'inoperancia'
      : TEM(/\b(cai|caem|caindo|as vezes|intermit|vai e volta|de novo)\b/, b) ? 'intermitencia'
        : TEM(/\b(lent|picot|eco|chiado|cortando|atras)/, b) ? 'performance'
          : TEM(/\b(erro|errad|nao (aparece|mostra|exporta|sincroniza)|zerad)/, b) ? 'disfuncional'
            : pedido ? 'nao_se_aplica' : '';
    const alcance = TEM(/\b(ninguem|todos|todas|toda a|empresa|geral|central|nenhuma ligacao)\b/, b) ? 'empresa'
      : TEM(/\b(setor|fila|recepcao|unidade|loja|filial|call center|equipe|sala|ambulatorio|casa de apoio)\b/, b) ? 'setor' : 'pessoa';
    const tipos = painel.ajustes.tipos;
    const tipo = painel.id === 'painel-desenvolvimento'
      ? (TEM(/\b(erro|corrig|falha|nao )/, b) ? 'Correção' : TEM(/\b(melhoria|novo|nova|ideia|pedem)\b/, b) ? 'Melhoria' : 'Análise')
      : duvida && !gravidade ? 'Dúvida' : gravidade === 'nao_se_aplica' || (!gravidade && pedido) ? 'Requisição' : 'Incidente';
    const produtos = [
      TEM(/\b(ramal|ramais|pabx|ura|fila|fop2|omniboard|linepbx|dial plan|firewall|central)\b/, b) ? 'LinePBX' : null,
      TEM(/\b(tronco|did|operadora|voicenet|algar|vc1|sbc|0300|0800)\b/, b) ? 'VoiceNet' : null,
      TEM(/\b(whatsapp|chatbot|linechat|template|conversa)\b/, b) ? 'LineChat' : null,
      TEM(/\b(relatorio|linereports|gravac)/, b) ? 'LineReports' : null,
      TEM(/\b(headset|aparelho|telefone novo|equipamento)\b/, b) ? 'Equipamentos' : null,
    ].filter((x): x is string => !!x);
    const etiquetas = [...new Set([
      ...(melhor ? [paraBusca(melhor.c.split(' › ')[0] ?? '')] : []),
      ...['ramal', 'fila', 'ura', 'fop2', 'tronco', 'whatsapp', 'relatorio', 'firewall'].filter((p) => palavras.has(p)),
    ].filter(Boolean))].slice(0, 3);
    const relato = fala ? fala.split(/[.!?]\s/)[0]!.replace(/[.!?"]+$/, '') : t.titulo;
    const titulo = (t.titulo && !/^(Atendimento de |Chamado pelo WhatsApp)/.test(t.titulo) ? t.titulo : relato)
      .replace(/^(oi|ola|bom dia|boa tarde|boa noite)[,!]?\s*/i, '').replace(/^\w/, (c) => c.toUpperCase()).slice(0, 90);
    const tecnicos = [
      ...[...tudo.matchAll(/\bramal(?:is)?\s+(\d{3,5})/gi)].map((m) => `ramal ${m[1]}`),
      ...[...tudo.matchAll(/\b\d{1,3}(?:\.\d{1,3}){3}\b/g)].map((m) => `IP ${m[0]}`),
      ...[...tudo.matchAll(/\bdesde (as \d{1,2}h|ontem|cedo|segunda|hoje cedo)/gi)].map((m) => `desde ${m[1]}`),
    ];
    const descricao = [...new Set(tecnicos)].map((x) => `- ${x}`).concat(notas.slice(-3).map((n) => `- ${n.texto.split('\n')[0]!.slice(0, 140)}`)).join('\n');
    const etapa = etapaDe(t.etapaId);
    const ultima = notas[notas.length - 1];
    const resumo = `O chamado está em ${etapa?.nome ?? '?'}${t.responsavelId ? `, com ${pessoaCurta(t.responsavelId)!.nome}` : ', ainda sem responsável'}.`
      + (ultima ? ` A última anotação: ${ultima.texto.split('\n')[0]!.slice(0, 160)}` : ' Ainda não há anotação da equipe.');
    return {
      json: {
        titulo, relato: fala ? `${relato}.` : '', descricao, assunto: melhor?.c ?? '', tipo: tipos.includes(tipo) ? tipo : '', gravidade, alcance, produtos, etiquetas, resumo,
      },
      letras: tudo.length + caminhos.reduce((s, x) => s + x.c.length + 3, 0) + 1800,
    };
  }

  // =====================================================================
  //  OS AJUSTES DO MÓDULO
  // =====================================================================

  function conferirPessoas(ids: string[]) {
    if (unicos(ids).some((id) => !S.users.some((u) => u.id === id))) throw bad('Uma das pessoas escolhidas não existe mais. Recarregue a tela e escolha de novo.');
  }
  const painelParaAuditoria = (p: Painel) => ({ nome: p.nome, sigla: p.sigla, descricao: p.descricao, cor: p.cor, tipo: p.tipo, acesso: p.acesso, pessoas: p.pessoas, ajustes: p.ajustes, ativo: p.ativo });
  const etapaParaAuditoria = (e: { nome: string; tipo: string; nivel: number | null; obrigatorios: string[]; avisar: string[]; resultado?: string | null }) =>
    ({ nome: e.nome, tipo: e.tipo, nivel: e.nivel, obrigatorios: [...e.obrigatorios], avisar: [...e.avisar], ...(e.resultado ? { resultado: e.resultado } : {}) });
  function linhaDoPainel(id: string) {
    const p = A.paineis.find((x) => x.id === id && !x.deletedAt);
    if (!p) throw naoAchado('Painel');
    return p;
  }
  /** O que pode ser pedido no painel agora: os campos do sistema que ele usa e os campos ativos dele. */
  const obrigatoriosValidos = (p: PainelRow) => obrigatoriosDoPainel({ camposDesligados: p.ajustes.camposDesligados ?? AJUSTES_PAINEL_PADRAO.camposDesligados }, camposDoPainel(p.id), p.tipo);
  /** As regras das etapas sem o que não vale mais no painel; devolve os nomes das etapas que mudaram. */
  function limparRegrasDasEtapas(painelId: string, validos: Obrigatorio[]): string[] {
    const mudaram: string[] = [];
    for (const e of A.etapas.filter((x) => x.painelId === painelId && !x.deletedAt).sort((a, b) => a.ordem - b.ordem)) {
      const limpos = limparObrigatorios(e.obrigatorios, validos);
      if (limpos.length === e.obrigatorios.length) continue;
      e.obrigatorios = limpos;
      mudaram.push(e.nome);
    }
    return mudaram;
  }

  /** Cria ou muda o painel; as etapas, quando vêm junto (a janela do painel), pelas regras de `salvarEtapas` e tudo de uma vez. */
  function gravarPainel(ator: Ator, id: string | null, d: ReturnType<typeof PainelGravarSchema.parse>, agora: Date): { valor: Painel; resumo: string; antes?: unknown; depois?: unknown } {
    const atual = id ? linhaDoPainel(id) : null;
    const sigla = d.sigla;
    if (atual && atual.sigla !== sigla && atual.proximoNumero > 1) throw bad(`A sigla ${atual.sigla} não muda mais: o painel já tem chamados (${atual.sigla}-1 em diante).`);
    const dono = A.paineis.find((p) => p.sigla === sigla);
    if (dono && dono.id !== atual?.id) {
      throw conflito(dono.deletedAt
        ? `A sigla ${sigla} foi do painel ${dono.nome}, que saiu: os chamados dele ainda usam esses códigos. Escolha outra.`
        : `A sigla ${sigla} já é de outro painel.`);
    }
    const pessoas = unicos(d.pessoas);
    // o tipo (Gestão ou Vendas) é escolhido ao criar e não muda depois (o pedido de mudar fica de fora)
    const tipo: TipoDePainel = atual ? atual.tipo : d.tipo;
    const deFabrica = tipo === 'vendas' ? AJUSTES_DO_PAINEL_DE_VENDAS : AJUSTES_PAINEL_PADRAO;
    // os campos do sistema que o painel usa: sem a lista no pedido, ficam como estão (quem muda é a aba
    // Campos); o painel novo nasce com o padrão (sem o alcance, por enquanto; o de Vendas, só com os produtos)
    const camposDesligados = d.ajustes.camposDesligados ?? atual?.ajustes.camposDesligados ?? deFabrica.camposDesligados;
    // o que pode ser pedido neste painel: o resto sai das regras
    const validos = obrigatoriosDoPainel({ camposDesligados }, atual ? camposDoPainel(atual.id) : [], tipo);
    const ajustes: AjustesDoPainel = {
      ...d.ajustes, tipos: etiquetasUnicas(d.ajustes.tipos ?? atual?.ajustes.tipos ?? deFabrica.tipos), supervisores: unicos(d.ajustes.supervisores),
      paiEsperaFilhos: d.ajustes.paiEsperaFilhos ?? atual?.ajustes.paiEsperaFilhos ?? deFabrica.paiEsperaFilhos,
      obrigatoriosAoAbrir: limparObrigatorios(d.ajustes.obrigatoriosAoAbrir, validos), camposDesligados: CAMPOS_DO_SISTEMA.filter((c) => camposDesligados.includes(c)),
      // os motivos de perda e a meta (do painel de Vendas): sem o campo no pedido, ficam como estão
      motivosDePerda: etiquetasUnicas(d.ajustes.motivosDePerda ?? atual?.ajustes.motivosDePerda ?? deFabrica.motivosDePerda),
      metaMensal: d.ajustes.metaMensal !== undefined ? d.ajustes.metaMensal : atual?.ajustes.metaMensal ?? null,
      // a negociação não tem prazo nem fecha sozinha
      ...(tipo === 'vendas' ? { contaPrazo: false, fecharSozinhoDias: null } : {}),
    };
    if (tipo === 'vendas' && !ajustes.motivosDePerda.length) throw bad('O painel de Vendas precisa de pelo menos um motivo de perda.');
    conferirPessoas([...pessoas, ...ajustes.supervisores]);
    if (!atual) {
      const novoPainel = novoId();
      // as etapas da janela (todas novas) ou as de fábrica do tipo; conferidas antes de criar qualquer coisa
      const etapas = d.etapas ?? (tipo === 'vendas' ? ETAPAS_DO_PAINEL_DE_VENDAS : ETAPAS_DO_PAINEL_NOVO.map((e) => ({ ...e, resultado: null }))).map((e) => ({ ...e, avisar: [] }));
      const plano = planejarEtapas(novoPainel, etapas, {}, validos, tipo);
      const novo: PainelRow = {
        id: novoPainel, nome: d.nome, sigla, descricao: d.descricao ?? null, cor: d.cor, ordem: Math.max(-1, ...A.paineis.map((p) => p.ordem)) + 1,
        acesso: d.acesso, pessoas, ajustes, ativo: d.ativo, proximoNumero: 1, deletedAt: null, tipo,
      };
      A.paineis.push(novo);
      aplicarEtapas(ator, plano, agora);
      // o painel de Vendas nasce com os campos do Comercial do Helena (como no servidor)
      const camposDeFabrica = camposDeFabricaDoPainel(novo.id, tipo);
      const painel = painelPorId(novo.id)!;
      return {
        valor: painel, resumo: `Criou o painel ${painel.nome} (${painel.sigla}${tipo === 'vendas' ? `, de ${NOME_TIPO_DE_PAINEL.vendas}` : ''}), com as etapas ${lista(painel.etapas.map((e) => e.nome))}`
          + (camposDeFabrica.length ? ` e os campos ${lista(camposDeFabrica)}` : ''),
        depois: { ...painelParaAuditoria(painel), etapas: painel.etapas.map(etapaParaAuditoria), ...(camposDeFabrica.length ? { campos: camposDeFabrica } : {}) },
      };
    }
    // as etapas que vieram junto são conferidas antes de mudar qualquer coisa (o destino dos chamados também)
    const plano = d.etapas ? planejarEtapas(atual.id, d.etapas, d.destino, validos, tipo) : null;
    const antes = painelParaAuditoria(painelPorId(atual.id)!);
    Object.assign(atual, { nome: d.nome, sigla, descricao: d.descricao ?? null, cor: d.cor, acesso: d.acesso, pessoas, ajustes, ativo: d.ativo });
    const etapas = plano ? resumoDasEtapas(plano, aplicarEtapas(ator, plano, agora)) : null;
    // sem as etapas no pedido, as regras delas também deixam de pedir o que o painel não usa mais
    if (!plano) limparRegrasDasEtapas(atual.id, validos);
    const painel = painelPorId(atual.id)!;
    const mudancas = [
      antes.nome !== painel.nome ? `antes se chamava ${antes.nome}` : '',
      antes.sigla !== painel.sigla ? `a sigla era ${antes.sigla}` : '',
      antes.ativo !== painel.ativo ? (painel.ativo ? 'reativou' : 'desativou') : '',
    ].filter(Boolean);
    const partes = [mudancas.join(', '), etapas?.partes.length ? `nas etapas, ${etapas.partes.join('; ')}` : ''].filter(Boolean);
    return {
      valor: painel, resumo: `Alterou o painel ${painel.nome} (${painel.sigla})${partes.length ? `: ${partes.join('; ')}` : ''}`,
      antes: etapas ? { ...antes, etapas: etapas.antes } : antes,
      depois: etapas ? { ...painelParaAuditoria(painel), etapas: etapas.depois } : painelParaAuditoria(painel),
    };
  }

  /** Só as etapas (a mesma conferência e a mesma gravação da janela do painel). */
  function salvarEtapasDoPainel(ator: Ator, painelId: string, d: ReturnType<typeof EtapasGravarSchema.parse>, agora: Date) {
    const p = linhaDoPainel(painelId);
    const plano = planejarEtapas(painelId, d.etapas, d.destino, obrigatoriosValidos(p), p.tipo);
    const r = resumoDasEtapas(plano, aplicarEtapas(ator, plano, agora));
    return { valor: painelPorId(painelId)!, resumo: `Mudou as etapas do painel ${p.nome}${r.partes.length ? `: ${r.partes.join('; ')}` : ''}`, antes: r.antes, depois: r.depois };
  }

  type PlanoDasEtapas = {
    painelId: string; atuais: EtapaRow[]; porId: Map<string, EtapaRow>; saem: EtapaRow[]; destino: Record<string, string>;
    novas: Array<{ id: string; nova: boolean; ordem: number; nome: string; tipo: TipoEtapa; nivel: Nivel | null; obrigatorios: Obrigatorio[]; avisar: string[]; resultado: ResultadoDaVenda | null }>;
    /** o retrato de antes (aplicar muda as mesmas linhas): o nome, o tipo e o que vai para a auditoria */
    fotoAntes: Array<ReturnType<typeof etapaParaAuditoria> & { id: string }>;
  };
  /** Confere a lista contra o que existe, sem mudar nada (as mesmas mensagens do servidor). */
  function planejarEtapas(painelId: string, etapas: ReturnType<typeof EtapasGravarSchema.parse>['etapas'], destino: Record<string, string>, validos: Obrigatorio[], tipo: TipoDePainel): PlanoDasEtapas {
    // o painel de Vendas acaba em Ganho e Perdido (uma de cada, as duas fechando); o de Gestão não tem resultado
    const problema = problemaNasEtapasDoTipo(tipo, etapas);
    if (problema) throw bad(problema);
    const atuais = A.etapas.filter((e) => e.painelId === painelId && !e.deletedAt).sort((a, b) => a.ordem - b.ordem);
    const porId = new Map(atuais.map((e) => [e.id, e]));
    const ficam = new Set<string>();
    for (const e of etapas) {
      if (!e.id) continue;
      if (!porId.has(e.id)) throw bad(`A etapa ${e.nome} não é deste painel (ou já saiu). Recarregue a tela e tente de novo.`);
      if (ficam.has(e.id)) throw bad(`A etapa ${e.nome} apareceu duas vezes na lista.`);
      ficam.add(e.id);
    }
    const novas = etapas.map((e, ordem) => ({
      id: e.id ?? novoId(), nova: !e.id, ordem, nome: e.nome, tipo: e.tipo, nivel: e.nivel, obrigatorios: limparObrigatorios(e.obrigatorios, validos), avisar: unicos(e.avisar),
      resultado: e.resultado ?? null,
    }));
    conferirPessoas(novas.flatMap((e) => e.avisar));
    const saem = atuais.filter((e) => !ficam.has(e.id));
    const semDestino = saem
      .map((e) => ({ id: e.id, nome: e.nome, chamados: A.chamados.filter((t) => t.etapaId === e.id && !t.deletedAt).length }))
      .filter((e) => e.chamados > 0 && !ficam.has(destino[e.id] ?? ''));
    if (semDestino.length) {
      throw bad(semDestino.map((e) => `A etapa ${e.nome} tem ${plural(e.chamados, 'chamado', 'chamados')}: escolha para onde ${e.chamados === 1 ? 'ele vai' : 'eles vão'}.`).join(' '), { etapas: semDestino });
    }
    return { painelId, atuais, porId, novas, saem, destino, fotoAntes: atuais.map((e) => ({ id: e.id, ...etapaParaAuditoria(e) })) };
  }
  /** Grava o plano e devolve os chamados que mudaram de etapa porque a etapa deles saiu. */
  function aplicarEtapas(ator: Ator, plano: PlanoDasEtapas, agora: Date): Array<{ de: string; para: string; n: number }> {
    const { painelId, porId, novas, saem, destino } = plano;
    const finais = new Map(novas.map((e) => [e.id, e]));
    const destinoDe = (e: EtapaRow) => finais.get(destino[e.id] ?? '') ?? novas.find((x) => x.tipo === e.tipo) ?? novas.find((x) => x.tipo === 'entrada') ?? novas[0]!;
    /** As datas que acompanham a situação nova (resolvido ganha a data de resolvido; aberto limpa as duas). */
    const datasDaSituacao = (t: ChamadoRow, tipo: TipoEtapa) => {
      const s = situacaoDaEtapa(tipo);
      if (s === 'resolvido') { t.resolvidoEm = t.resolvidoEm ?? iso(agora); t.fechadoEm = null; } else if (s === 'fechado') { t.fechadoEm = iso(agora); t.resolvidoEm = t.resolvidoEm ?? iso(agora); } else { t.resolvidoEm = null; t.fechadoEm = null; }
    };
    const movidos: Array<{ de: string; para: string; n: number }> = [];
    // o Object.assign abaixo muda as mesmas linhas: o tipo de antes vem do retrato do plano
    const antesDe = new Map(plano.fotoAntes.map((e) => [e.id, e]));
    for (const e of novas) {
      const campos = { nome: e.nome, tipo: e.tipo, nivel: e.nivel, ordem: e.ordem, obrigatorios: e.obrigatorios, avisar: e.avisar, resultado: e.resultado };
      if (e.nova) A.etapas.push({ id: e.id, painelId, ...campos, deletedAt: null });
      else Object.assign(porId.get(e.id)!, campos);
    }
    // a etapa que mudou de tipo muda o que os chamados dela são: as datas acompanham
    for (const e of novas) {
      const antes = antesDe.get(e.id);
      if (antes && situacaoDaEtapa(antes.tipo as TipoEtapa) !== situacaoDaEtapa(e.tipo)) for (const t of A.chamados) if (t.etapaId === e.id) { datasDaSituacao(t, e.tipo); t.atualizadoEm = iso(agora); }
    }
    for (const e of saem) {
      const para = destinoDe(e);
      const linhas = A.chamados.filter((t) => t.etapaId === e.id);
      if (linhas.length) {
        const mudaSituacao = situacaoDaEtapa(e.tipo) !== situacaoDaEtapa(para.tipo);
        for (const t of linhas) {
          t.etapaId = para.id; t.atualizadoEm = iso(agora);
          if (mudaSituacao) datasDaSituacao(t, para.tipo);
          registrarEvento(t.id, 'etapa', ator, { de: { id: e.id, nome: e.nome, nivel: e.nivel }, para: { id: para.id, nome: para.nome, nivel: para.nivel }, motivo: `a etapa ${e.nome} saiu do painel`, sentido: null }, agora);
        }
        const vivos = linhas.filter((t) => !t.deletedAt).length;
        if (vivos) movidos.push({ de: e.nome, para: para.nome, n: vivos });
      }
      e.deletedAt = iso(agora);
    }
    return movidos;
  }
  /** O que mudou nas etapas, em frase (as mesmas do servidor), e o antes/depois da auditoria. */
  function resumoDasEtapas(plano: PlanoDasEtapas, movidos: Array<{ de: string; para: string; n: number }>) {
    const { novas, saem, fotoAntes } = plano;
    const antesDe = new Map(fotoAntes.map((e) => [e.id, e]));
    const entraram = novas.filter((e) => e.nova).map((e) => e.nome);
    const ficaram = novas.filter((e) => !e.nova);
    const renomeadas = ficaram.filter((e) => antesDe.get(e.id)?.nome !== e.nome).map((e) => `${antesDe.get(e.id)?.nome} → ${e.nome}`);
    const mesmaLista = (a: string[], b: string[]) => a.length === b.length && [...a].sort().every((x, i) => x === [...b].sort()[i]);
    const ajustadas = ficaram.filter((e) => {
      const a = antesDe.get(e.id)!;
      return a.tipo !== e.tipo || (a.nivel ?? null) !== e.nivel || (a.resultado ?? null) !== e.resultado || !mesmaLista(a.obrigatorios, e.obrigatorios) || !mesmaLista(a.avisar, e.avisar);
    }).map((e) => e.nome);
    const ordemAntes = fotoAntes.filter((e) => ficaram.some((x) => x.id === e.id)).map((e) => e.id).join();
    const partes = [
      entraram.length ? `entrou ${lista(entraram)}` : '',
      saem.length ? `saiu ${lista(saem.map((e) => antesDe.get(e.id)?.nome ?? e.nome))}` : '',
      renomeadas.length ? `renomeou ${lista(renomeadas)}` : '',
      ...movidos.map((m) => `${plural(m.n, 'chamado foi', 'chamados foram')} de ${m.de} para ${m.para}`),
      ordemAntes !== ficaram.map((e) => e.id).join() ? 'mudou a ordem' : '',
      ajustadas.length ? `ajustou ${lista(ajustadas)}` : '',
    ].filter(Boolean);
    return { partes, antes: fotoAntes.map(({ id: _id, ...e }) => e), depois: novas.map(etapaParaAuditoria) };
  }

  // ---------- os assuntos ----------

  const assuntosDoPainel = (painelId: string) => A.assuntos.filter((a) => a.painelId === painelId);
  function alturaDoAssunto(id: string, todos: Assunto[], n = 0): number {
    if (n > 10) return 1;
    return 1 + Math.max(0, ...todos.filter((a) => a.paiId === id).map((f) => alturaDoAssunto(f.id, todos, n + 1)));
  }
  function partesDoCaminho(id: string, porId: Map<string, Assunto>): string[] {
    const partes: string[] = [];
    for (let a = porId.get(id), n = 0; a && n < 10; n++) { partes.unshift(a.nome); a = a.paiId ? porId.get(a.paiId) : undefined; }
    return partes;
  }
  function conferirLugar(todos: Assunto[], id: string | null, d: { paiId: string | null; nome: string }) {
    if (d.paiId) {
      if (d.paiId === id) throw bad('Um assunto não pode ficar dentro dele mesmo.');
      if (!todos.some((a) => a.id === d.paiId)) throw bad('O assunto de cima precisa ser deste mesmo painel.');
      if (id && assuntoEDescendentes(id, todos).has(d.paiId)) throw bad(`Isso faria um círculo: ${caminhoDoAssunto(d.paiId, todos)} está dentro deste assunto.`);
    }
    const altura = id ? alturaDoAssunto(id, todos) : 1;
    if (nivelDoAssunto(d.paiId, todos) + altura > MAX_NIVEL_ASSUNTO) {
      throw bad(`Os assuntos vão até ${MAX_NIVEL_ASSUNTO} níveis (como Ramal › Configuração › Identidade)${altura > 1 ? `, e ${d.nome} tem assuntos embaixo dele` : ''}.`);
    }
    const igual = todos.find((a) => a.id !== id && a.paiId === d.paiId && paraBusca(a.nome) === paraBusca(d.nome));
    if (igual) throw conflito(`Já existe o assunto ${caminhoDoAssunto(igual.id, todos)} neste painel.`);
  }
  const proximaOrdem = (irmaos: Assunto[]) => Math.max(-1, ...irmaos.map((a) => a.ordem)) + 1;
  const assuntoParaAuditoria = (a: Assunto) => ({ nome: a.nome, paiId: a.paiId, descricao: a.descricao, ativo: a.ativo, checklist: a.checklist, dePara: a.dePara });

  function criarAssunto(painelId: string, d: ReturnType<typeof AssuntoGravarSchema.parse>) {
    const p = linhaDoPainel(painelId);
    const todos = assuntosDoPainel(painelId);
    conferirLugar(todos, null, d);
    const a: Assunto = {
      id: novoId(), painelId, paiId: d.paiId, nome: d.nome, descricao: d.descricao ?? null, ativo: d.ativo,
      ordem: proximaOrdem(todos.filter((x) => x.paiId === d.paiId)), checklist: unicos(d.checklist), dePara: unicos(d.dePara),
    };
    A.assuntos.push(a);
    return { valor: { ...a }, resumo: `Criou o assunto ${caminhoDoAssunto(a.id, A.assuntos)} no painel ${p.nome}`, depois: assuntoParaAuditoria(a) };
  }
  function alterarAssunto(id: string, d: ReturnType<typeof AssuntoGravarSchema.parse>) {
    const linha = A.assuntos.find((a) => a.id === id);
    if (!linha) throw naoAchado('Assunto');
    const p = A.paineis.find((x) => x.id === linha.painelId && !x.deletedAt);
    if (!p) throw naoAchado('Assunto');
    const todos = assuntosDoPainel(linha.painelId);
    conferirLugar(todos, id, d);
    const antes = { ...linha, checklist: [...linha.checklist], dePara: [...linha.dePara] };
    const caminhoAntes = caminhoDoAssunto(id, todos);
    const mudouDeLugar = antes.paiId !== d.paiId;
    Object.assign(linha, {
      paiId: d.paiId, nome: d.nome, descricao: d.descricao ?? null, ativo: d.ativo, checklist: unicos(d.checklist), dePara: unicos(d.dePara),
      ...(mudouDeLugar ? { ordem: proximaOrdem(todos.filter((a) => a.paiId === d.paiId && a.id !== id)) } : {}),
    });
    const caminhoDepois = caminhoDoAssunto(id, A.assuntos);
    const como = antes.ativo !== linha.ativo ? (linha.ativo ? 'Reativou' : 'Desativou') : 'Alterou';
    return {
      valor: { ...linha, checklist: [...linha.checklist], dePara: [...linha.dePara] },
      resumo: `${como} o assunto ${caminhoDepois} no painel ${p.nome}${caminhoAntes !== caminhoDepois ? ` (antes: ${caminhoAntes})` : ''}`,
      antes: assuntoParaAuditoria(antes), depois: assuntoParaAuditoria(linha),
    };
  }
  function colarAssuntos(painelId: string, texto: string) {
    const p = linhaDoPainel(painelId);
    const itens = lerListaDeAssuntos(texto).filter((i) => i.caminho.every((x) => x.length <= 80));
    if (!itens.length) throw bad('Não achei nenhum assunto no texto. Cole um por linha, como "Ramal - Configuração - Identidade".');
    let criados = 0; let jaExistiam = 0;
    const novos: string[] = [];
    const todos = assuntosDoPainel(painelId);
    const porId = new Map(todos.map((a) => [a.id, a]));
    const chave = (partes: string[]) => partes.map((x) => paraBusca(x)).join('\n');
    const porCaminho = new Map<string, string>();
    for (const a of todos) { const c = chave(partesDoCaminho(a.id, porId)); if (!porCaminho.has(c)) porCaminho.set(c, a.id); }
    const ordens = new Map<string | null, number>();
    const proxima = (pai: string | null) => { const n = ordens.get(pai) ?? proximaOrdem(todos.filter((a) => a.paiId === pai)); ordens.set(pai, n + 1); return n; };
    const criar = (partes: string[], paiId: string | null, descricao: string | null) => {
      const a: Assunto = { id: novoId(), painelId, paiId, nome: partes[partes.length - 1]!, descricao, ativo: true, ordem: proxima(paiId), checklist: [], dePara: [] };
      A.assuntos.push(a); porCaminho.set(chave(partes), a.id); novos.push(partes.join(' › ')); criados++;
      return a.id;
    };
    for (const item of itens) {
      let paiId: string | null = null;
      for (let i = 1; i <= item.caminho.length; i++) {
        const partes = item.caminho.slice(0, i);
        paiId = porCaminho.get(chave(partes)) ?? criar(partes, paiId, null);
      }
      const partes = [...item.caminho, item.nome];
      if (porCaminho.has(chave(partes))) { jaExistiam++; continue; }
      criar(partes, paiId, item.descricao);
    }
    return { valor: { criados, jaExistiam }, resumo: `Colou a lista de assuntos no painel ${p.nome}: ${plural(criados, 'criado', 'criados')}, ${plural(jaExistiam, 'já existia', 'já existiam')}`, depois: { criados: novos } };
  }

  // ---------- os campos de cada painel ----------

  const campoParaAuditoria = (c: CampoPersonalizado) => ({ nome: c.nome, tipo: c.tipo, dica: c.dica, opcoes: c.opcoes.map((o) => ({ ...o })), ativo: c.ativo, incluirNaHora: c.incluirNaHora });
  /**
   * Incluir uma opção numa lista do painel ali mesmo (2.0.3, a Indicação), como o servidor: só nas listas marcadas;
   * a que já existe volta, a desativada é reativada. Sem `podeVer`, é o próprio Gestor (a API, o n8n, o robô).
   */
  function incluirOpcao(campoId: string, nome: string, podeVer: (painelId: string) => boolean = () => true): { valor: OpcaoDoCampo; resumo: string | null } {
    const c = A.campos.find((x) => x.id === campoId);
    if (!c || !podeVer(c.painelId)) throw naoAchado('Campo');
    if (!c.ativo) throw bad(`O campo ${c.nome} está desativado.`);
    if (!(c.tipo === 'lista' && c.incluirNaHora)) throw bad(`As opções de ${c.nome} se mudam em Painéis › Ajustes › Campos.`);
    const igual = c.opcoes.find((o) => paraBusca(o.nome) === paraBusca(nome));
    if (igual?.ativa) return { valor: { ...igual }, resumo: null };
    if (!igual && c.opcoes.length >= MAX_OPCOES_DO_CAMPO) throw bad(`${c.nome} já tem ${MAX_OPCOES_DO_CAMPO} opções: desative as que não servem em Painéis › Ajustes › Campos.`);
    const nova: OpcaoDoCampo = igual ? { ...igual, ativa: true } : { id: novoId(), nome, ativa: true };
    c.opcoes = igual ? c.opcoes.map((o) => (o.id === igual.id ? nova : o)) : [...c.opcoes, nova];
    return { valor: { ...nova }, resumo: `${igual ? 'Reativou' : 'Incluiu'} a opção ${nova.nome} em ${c.nome}` };
  }
  /** A opção escrita que ainda não existe numa lista que inclui na hora entra nela antes de os campos serem lidos (como o servidor). */
  function incluirOpcoesEscritas(painel: Painel, pedidos: Record<string, unknown>) {
    for (const [chave, v] of Object.entries(pedidos)) {
      if (typeof v !== 'string' || !v.trim()) continue;
      const campo = acharCampo(camposDoPainel(painel.id), chave);
      if (!campo?.ativo || !(campo.tipo === 'lista' && campo.incluirNaHora)) continue;
      const nome = v.trim().replace(/\s+/g, ' ');
      if (nome.length > 60 || campo.opcoes.some((o) => o.id === nome || (o.ativa && paraBusca(o.nome) === paraBusca(nome)))) continue;
      const r = incluirOpcao(campo.id, nome);
      if (r.resumo) auditar('update', 'ticket_field', r.resumo, campo.id);
    }
  }
  /** Liga e desliga os campos do sistema e grava as opções do Tipo (o que sai do painel sai das regras). */
  function salvarCamposDoSistema(painelId: string, d: ReturnType<typeof CamposDoSistemaSchema.parse>) {
    const p = linhaDoPainel(painelId);
    const antes = { ...p.ajustes, camposDesligados: p.ajustes.camposDesligados ?? AJUSTES_PAINEL_PADRAO.camposDesligados };
    const desligados = CAMPOS_DO_SISTEMA.filter((c) => d.desligados.includes(c));
    const campos = camposDoPainel(painelId);
    const igual = campos.find((x) => x.ativo && nomeDoSistemaIgual(x.nome, { camposDesligados: desligados }) && !nomeDoSistemaIgual(x.nome, antes));
    if (igual) throw conflito(`O painel ${p.nome} tem o campo ${igual.nome}: renomeie ou desative esse campo antes de ligar o ${nomeDoSistemaIgual(igual.nome, { camposDesligados: desligados })} do sistema.`);
    const validos = obrigatoriosDoPainel({ camposDesligados: desligados }, campos);
    const depois: AjustesDoPainel = { ...antes, camposDesligados: desligados, tipos: etiquetasUnicas(d.tipos), obrigatoriosAoAbrir: limparObrigatorios(antes.obrigatoriosAoAbrir, validos) };
    p.ajustes = depois;
    const etapasLimpas = limparRegrasDasEtapas(painelId, validos);
    const nomes = (xs: CampoDoSistema[]) => lista(xs.map((c) => NOME_CAMPO_DO_SISTEMA[c]));
    const desligou = desligados.filter((c) => !antes.camposDesligados.includes(c));
    const ligou = antes.camposDesligados.filter((c) => !desligados.includes(c));
    const saiuDe = [...(depois.obrigatoriosAoAbrir.length !== antes.obrigatoriosAoAbrir.length ? ['para abrir'] : []), ...etapasLimpas];
    const partes = [
      desligou.length ? `desligou ${nomes(desligou)}${saiuDe.length ? ` (deixou de ser pedido em: ${lista(saiuDe)})` : ''}` : '',
      ligou.length ? `ligou ${nomes(ligou)}` : '',
      antes.tipos.join('\n') !== depois.tipos.join('\n') ? `as opções do Tipo ficaram ${depois.tipos.join(', ') || '(nenhuma)'}` : '',
    ].filter(Boolean);
    return {
      valor: painelPorId(painelId)!,
      resumo: `Mudou os campos do painel ${p.nome}${partes.length ? `: ${partes.join('; ')}` : ' (nada mudou)'}`,
      antes: { camposDesligados: antes.camposDesligados, tipos: antes.tipos, obrigatoriosAoAbrir: antes.obrigatoriosAoAbrir },
      depois: { camposDesligados: depois.camposDesligados, tipos: depois.tipos, obrigatoriosAoAbrir: depois.obrigatoriosAoAbrir },
    };
  }
  /** O nome não repete (nem o de um campo que o chamado já tem); a opção que não veio fica desativada. */
  function conferirCampo(p: PainelRow, d: ReturnType<typeof CampoGravarSchema.parse>, atual: CampoPersonalizado | null): OpcaoDoCampo[] {
    const doSistema = nomeDoSistemaIgual(d.nome, { camposDesligados: p.ajustes.camposDesligados ?? AJUSTES_PAINEL_PADRAO.camposDesligados });
    if (doSistema) throw conflito(`Todo chamado do painel ${p.nome} já tem o campo ${doSistema}: escolha outro nome.`);
    const igual = camposDoPainel(p.id).find((c) => c.id !== atual?.id && paraBusca(c.nome) === paraBusca(d.nome));
    if (igual) throw conflito(`O painel ${p.nome} já tem o campo ${igual.nome}${igual.ativo ? '' : ' (desativado: reative em vez de criar outro)'}.`);
    if (atual && atual.tipo !== d.tipo) throw bad(`O tipo do campo não muda depois de criado (${atual.nome} é ${NOME_TIPO_CAMPO[atual.tipo]}). Crie outro campo e desative este.`);
    if (!ehLista(d.tipo)) return [];
    const existentes = atual?.opcoes ?? [];
    const opcoes: OpcaoDoCampo[] = d.opcoes.map((o) => {
      if (!o.id) return { id: novoId(), nome: o.nome, ativa: o.ativa };
      if (!existentes.some((x) => x.id === o.id)) throw bad(`A opção ${o.nome} não é deste campo. Recarregue a tela e tente de novo.`);
      return { id: o.id, nome: o.nome, ativa: o.ativa };
    });
    for (const x of existentes) if (!opcoes.some((o) => o.id === x.id)) opcoes.push({ ...x, ativa: false });
    const vistas = new Set<string>();
    for (const o of opcoes) {
      if (vistas.has(paraBusca(o.nome))) throw bad(`Duas opções com o nome ${o.nome} (uma delas pode estar desativada).`);
      vistas.add(paraBusca(o.nome));
    }
    return opcoes;
  }
  /** Onde o campo é obrigatório: para abrir e nas etapas escolhidas (o desativado, em lugar nenhum). */
  function gravarOndeEPedido(p: PainelRow, campoId: string, ativo: boolean, d: { obrigatorioAoAbrir: boolean; etapas: string[] }): string[] {
    const chave = chaveDoCampo(campoId);
    const etapas = A.etapas.filter((e) => e.painelId === p.id && !e.deletedAt).sort((a, b) => a.ordem - b.ordem);
    const pedidas = new Set(ativo ? d.etapas : []);
    for (const id of pedidas) if (!etapas.some((e) => e.id === id)) throw bad('Uma das etapas escolhidas não é deste painel. Recarregue a tela e tente de novo.');
    const abrir = ativo && d.obrigatorioAoAbrir;
    p.ajustes = { ...p.ajustes, obrigatoriosAoAbrir: [...p.ajustes.obrigatoriosAoAbrir.filter((k) => k !== chave), ...(abrir ? [chave] : [])] };
    for (const e of etapas) {
      const tem = e.obrigatorios.includes(chave);
      if (tem === pedidas.has(e.id)) continue;
      e.obrigatorios = tem ? e.obrigatorios.filter((k) => k !== chave) : [...e.obrigatorios, chave];
    }
    return [...(abrir ? ['para abrir'] : []), ...etapas.filter((e) => pedidas.has(e.id)).map((e) => e.nome)];
  }
  /** Os campos com que o painel nasce (só o de Vendas tem: os do Comercial do Helena); devolve os nomes. */
  function camposDeFabricaDoPainel(painelId: string, tipo: TipoDePainel): string[] {
    if (tipo !== 'vendas') return [];
    CAMPOS_DO_PAINEL_DE_VENDAS.forEach((c, ordem) => A.campos.push({
      id: novoId(), painelId, nome: c.nome, tipo: c.tipo, dica: c.dica, ativo: true, ordem,
      opcoes: c.opcoes.map((nome) => ({ id: novoId(), nome, ativa: true })), incluirNaHora: !!c.incluirNaHora,
    }));
    return CAMPOS_DO_PAINEL_DE_VENDAS.map((c) => c.nome);
  }
  function criarCampo(painelId: string, d: ReturnType<typeof CampoGravarSchema.parse>) {
    const p = linhaDoPainel(painelId);
    const outros = camposDoPainel(painelId);
    if (outros.length >= MAX_CAMPOS_DO_PAINEL) throw bad(`Um painel vai até ${MAX_CAMPOS_DO_PAINEL} campos (os desativados contam).`);
    const opcoes = conferirCampo(p, d, null);
    const c: CampoPersonalizado = { id: novoId(), painelId, nome: d.nome, tipo: d.tipo, dica: d.dica ?? null, opcoes, ativo: d.ativo, ordem: Math.max(-1, ...outros.map((x) => x.ordem)) + 1, incluirNaHora: d.tipo === 'lista' && d.incluirNaHora };
    A.campos.push(c);
    const pedido = gravarOndeEPedido(p, c.id, c.ativo, d);
    return {
      valor: campoParaTela(c),
      resumo: `Criou o campo ${c.nome} (${NOME_TIPO_CAMPO[c.tipo]}) no painel ${p.nome}${pedido.length ? `, obrigatório ${lista(pedido.map((x) => (x === 'para abrir' ? x : `em ${x}`)))}` : ''}`,
      depois: { ...campoParaAuditoria(c), obrigatorio: pedido },
    };
  }
  function alterarCampo(id: string, d: ReturnType<typeof CampoGravarSchema.parse>) {
    const c = A.campos.find((x) => x.id === id);
    if (!c) throw naoAchado('Campo');
    const p = A.paineis.find((x) => x.id === c.painelId && !x.deletedAt);
    if (!p) throw naoAchado('Campo');
    const antes = campoParaTela(c);
    const opcoes = conferirCampo(p, d, antes);
    Object.assign(c, { nome: d.nome, dica: d.dica ?? null, opcoes, ativo: d.ativo, incluirNaHora: c.tipo === 'lista' && d.incluirNaHora });
    const pedido = gravarOndeEPedido(p, c.id, c.ativo, d);
    const como = antes.ativo !== c.ativo ? (c.ativo ? 'Reativou' : 'Desativou') : 'Alterou';
    return {
      valor: campoParaTela(c),
      resumo: `${como} o campo ${c.nome} no painel ${p.nome}${antes.nome !== c.nome ? ` (antes: ${antes.nome})` : ''}`,
      antes: campoParaAuditoria(antes), depois: { ...campoParaAuditoria(c), obrigatorio: pedido },
    };
  }
  function ordenarCampos(painelId: string, ids: string[]) {
    const p = linhaDoPainel(painelId);
    const campos = camposDoPainel(painelId);
    if (ids.length !== campos.length || new Set(ids).size !== ids.length || ids.some((x) => !campos.some((c) => c.id === x))) {
      throw bad('A lista de campos mudou enquanto você mexia. Recarregue a tela e tente de novo.');
    }
    ids.forEach((id, ordem) => { A.campos.find((c) => c.id === id)!.ordem = ordem; });
    const depois = camposDoPainel(painelId);
    return { valor: depois.map(campoParaTela), resumo: `Mudou a ordem dos campos do painel ${p.nome}: ${depois.map((c) => c.nome).join(', ')}` };
  }

  // ---------- os avisos (o WhatsApp dos chamados) ----------

  function avisosParaTela(): AvisosChamadosTela {
    const v = A.whats;
    return {
      ativo: v.ativo, url: v.url, usarChaveDoLineChat: v.usarChaveDoLineChat, numeroCliente: v.numeroCliente, numeroEquipe: v.numeroEquipe,
      envioCliente: v.envioCliente, modeloCliente: v.modeloCliente, template: v.template ? { ...v.template, variaveis: v.template.variaveis.map((x) => ({ ...x })) } : null,
      equipeLineChat: v.equipeLineChat, atribuirAQuemManda: v.atribuirAQuemManda, eventos: JSON.parse(JSON.stringify(v.eventos)) as AvisosChamadosTela['eventos'],
      modelos: { ...(v.modelos ?? {}) },
      temChavePropria: A.temChavePropria, temChaveLineChat: S.ajustesLineChat.temToken,
      // só para ler: o número (e a pausa) de cada um muda em Administração › Usuários
      pessoas: S.users.filter((u) => u.active).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
        .map((u) => ({ userId: u.id, nome: u.name, numero: u.whatsapp ?? '', ativo: u.whatsappAvisos !== false })),
      ultimoTesteEm: v.ultimoTesteEm, ultimoTesteOk: v.ultimoTesteOk, ultimoTesteMsg: v.ultimoTesteMsg,
    };
  }
  const avisosParaAuditoria = (v: AvisosGuardados) => ({
    ativo: v.ativo, url: v.url, usarChaveDoLineChat: v.usarChaveDoLineChat, numeroCliente: v.numeroCliente, numeroEquipe: v.numeroEquipe,
    envioCliente: v.envioCliente, modeloCliente: v.modeloCliente, template: v.template, equipeLineChat: v.equipeLineChat, atribuirAQuemManda: v.atribuirAQuemManda,
    eventos: v.eventos, modelos: v.modelos,
  });

  // ---------- as integrações ----------

  const webhookParaTela = (w: WebhookRow): WebhookTela => ({
    id: w.id, nome: w.nome, url: w.url, eventos: [...w.eventos], ativo: w.ativo, ultimoEm: w.ultimoEm, ultimoOk: w.ultimoOk, ultimaMsg: w.ultimaMsg, temSegredo: w.temSegredo,
  });
  const chaveParaTela = (k: ChaveRow): ChaveApiTela => ({
    id: k.id, nome: k.nome, inicio: k.inicio, criadaEm: k.criadaEm, criadaPor: k.criadaPorId ? pessoaCurta(k.criadaPorId)!.nome : null, usadaEm: k.usadaEm, revogadaEm: k.revogadaEm,
  });
  function problemaDoEndereco(url: string): string | null {
    let u: URL;
    try { u = new URL(url); } catch { return 'Endereço inválido.'; }
    if (u.protocol !== 'https:') return 'O endereço precisa começar com https://.';
    const host = u.hostname.replace(/^\[|\]$/g, '').replace(/\.+$/, '');
    if (/^localhost$/i.test(host)) return 'O endereço aponta para o próprio servidor.';
    if (ipInterno(host)) return `O endereço ${host} aponta para a rede de dentro: o webhook precisa ser um serviço da internet.`;
    return null;
  }

  // =====================================================================
  //  OS EXEMPLOS (na primeira chamada)
  // =====================================================================

  /** Há quantos minutos de atendimento: o instante, contando para trás a partir de agora (a mesma conta dos prazos). */
  function voltarUteis(agora: Date, minutos: number): Date {
    if (minutos <= 0) return new Date(agora);
    const cal = A.prazos.calendario;
    let lo = agora.getTime() - 120 * DIA;
    let hi = agora.getTime();
    for (let i = 0; i < 48; i++) {
      const meio = Math.floor((lo + hi) / 2);
      if (minutosUteisEntre(meio, agora, cal) >= minutos) lo = meio; else hi = meio;
    }
    return new Date(Math.floor(lo / 1000) * 1000);
  }
  /** A última vez (até agora) em que a regra do agendado mandou nascer o chamado. */
  function ultimaVez(regra: RegraAgendado, agora: Date): Date | null {
    for (let k = 0; k <= 62; k++) {
      const quando = instanteLocal(diaLocal(agora.getTime() - k * DIA), regra.hora);
      if (quando.getTime() > agora.getTime()) continue;
      const prox = proximaExecucao(regra, new Date(quando.getTime() - MINUTO), A.prazos.calendario);
      if (prox && prox.getTime() === quando.getTime()) return quando;
    }
    return null;
  }

  function semear() {
    if (A.semeado) return;
    A.semeado = true;
    A.semeando = true;
    try {
      montarExemplos();
    } catch (err) {
      A.erros.push(`montagem: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      A.semeando = false;
      A.ultimaVolta = agoraReal().getTime();
    }
    if (A.erros.length) console.warn('[prévia dos chamados] exemplos que não passaram nas regras:', A.erros);
    // o calendário nasce junto (2.0.2): os lembretes dos exemplos já estão no sininho na primeira leitura
    const agora = agoraReal();
    for (const f of relogiosDeFora) {
      try { f(agora); } catch (err) { A.erros.push(`relógio do calendário: ${err instanceof Error ? err.message : String(err)}`); }
    }
  }

  function montarExemplos() {
    const agora = agoraReal();
    const idDa = (p: Pessoa) => {
      const u = S.users.find((x) => x.email === EMAIL_DA_PESSOA[p]);
      if (!u) throw new Error(`a pessoa ${p} não está na prévia`);
      return u.id;
    };
    const luan = idDa('luan');
    const bruno = idDa('bruno');

    // ---- os painéis de PAINEIS_INICIAIS, com os mesmos ids do servidor (a equipe já marcou supervisor e quem a etapa avisa) ----
    PAINEIS_INICIAIS.forEach((p, i) => {
      const id = `painel-${p.chave}`;
      A.paineis.push({
        id, nome: p.nome, sigla: p.sigla, descricao: p.descricao, cor: p.cor, ordem: i, acesso: 'todos', pessoas: [],
        ajustes: {
          ...p.ajustes, tipos: [...p.ajustes.tipos], obrigatoriosAoAbrir: [...p.ajustes.obrigatoriosAoAbrir], supervisores: p.chave === 'suporte' ? [luan] : [],
          // o Desenvolvimento não usa assunto nem operadora: no lugar, os campos dele (Ajustes › Campos);
          // nenhum dos dois usa o alcance, por enquanto
          camposDesligados: p.chave === 'desenvolvimento' ? [...DESLIGADOS_NO_DESENVOLVIMENTO] : [...DESLIGADOS_NO_SUPORTE],
        },
        ativo: true, proximoNumero: 1, deletedAt: null, tipo: 'gestao',
      });
      p.etapas.forEach((e, j) => A.etapas.push({
        id: `etapa-${p.chave}-${e.chave}`, painelId: id, nome: e.nome, tipo: e.tipo, nivel: e.nivel, ordem: j, obrigatorios: [...e.obrigatorios],
        avisar: p.chave === 'suporte' && e.chave === 'n2' ? [bruno] : [], deletedAt: null, resultado: null,
      }));
    });

    // ---- o Administrativo e o Comercial (2.0.1, o calendário): painéis só das pessoas escolhidas, para a
    //      prévia mostrar a regra do pedido do Luan ("se eu sou do comercial, vejo o do comercial"). O
    //      Comercial é um painel de Vendas (decisão 0050): o funil, o Ganho e o Perdido ----
    const equipes: Array<{ chave: string; nome: string; sigla: string; descricao: string; cor: CorPainel; pessoas: Pessoa[]; tipo: TipoDePainel }> = [
      { chave: 'administrativo', nome: 'Administrativo', sigla: 'ADM', descricao: 'O financeiro, as notas, os contratos e a agenda do escritório.', cor: 'turquesa', pessoas: ['marina', 'camila'], tipo: 'gestao' },
      { chave: 'comercial', nome: 'Comercial', sigla: 'COM', descricao: 'As negociações: do primeiro contato ao contrato assinado.', cor: 'signal', pessoas: ['camila', 'diego'], tipo: 'vendas' },
    ];
    equipes.forEach((p, i) => {
      const id = `painel-${p.chave}`;
      const deFabrica = p.tipo === 'vendas' ? AJUSTES_DO_PAINEL_DE_VENDAS : AJUSTES_PAINEL_PADRAO;
      A.paineis.push({
        id, nome: p.nome, sigla: p.sigla, descricao: p.descricao, cor: p.cor, ordem: PAINEIS_INICIAIS.length + i, acesso: 'escolhidos', pessoas: p.pessoas.map(idDa),
        ajustes: {
          ...deFabrica, tipos: [...deFabrica.tipos], obrigatoriosAoAbrir: [], supervisores: [], camposDesligados: [...deFabrica.camposDesligados],
          motivosDePerda: [...deFabrica.motivosDePerda],
        },
        ativo: true, proximoNumero: 1, deletedAt: null, tipo: p.tipo,
      });
      const etapas = p.tipo === 'vendas' ? ETAPAS_DO_PAINEL_DE_VENDAS : ETAPAS_DO_PAINEL_NOVO.map((e) => ({ ...e, resultado: null }));
      etapas.forEach((e, j) => A.etapas.push({
        id: `etapa-${p.chave}-${j + 1}`, painelId: id, nome: e.nome, tipo: e.tipo, nivel: e.nivel, ordem: j, obrigatorios: [...e.obrigatorios], avisar: [], deletedAt: null,
        resultado: e.resultado,
      }));
      // o Comercial nasce com os campos do Helena (CNPJ, contatos principais, origem de lead, indicação)
      camposDeFabricaDoPainel(id, p.tipo);
    });

    // ---- os assuntos: a lista da equipe (colada) e o que já foi preenchido em alguns ----
    colarAssuntos('painel-suporte', LISTA_DE_ASSUNTOS_DO_SUPORTE);
    for (const det of DETALHES_DOS_ASSUNTOS) {
      const a = A.assuntos.find((x) => x.painelId === 'painel-suporte' && caminhoDoAssunto(x.id, A.assuntos) === det.caminho);
      if (!a) { A.erros.push(`assunto que não existe: ${det.caminho}`); continue; }
      if (det.descricao !== undefined) a.descricao = det.descricao;
      if (det.checklist) a.checklist = [...det.checklist];
      if (det.dePara) a.dePara = [...det.dePara];
      if (det.ativo !== undefined) a.ativo = det.ativo;
    }

    // ---- o WhatsApp dos chamados ligado (pela chave do LineChat), com a equipe e o número dela ----
    A.whats = {
      ...A.whats, ativo: true, numeroEquipe: NUMERO_DA_EQUIPE,
      // a mensagem ao cliente pelo modelo aprovado do número oficial (o de atualização do chamado)
      envioCliente: 'modelo', template: { ...MODELO_ESCOLHIDO, variaveis: MODELO_ESCOLHIDO.variaveis.map((x) => ({ ...x })) },
      ultimoTesteEm: iso(voltarUteis(agora, 9 * 600)), ultimoTesteOk: true, ultimoTesteMsg: PREVIA,
    };
    // o WhatsApp de cada pessoa da equipe, no usuário (Administração › Usuários)
    for (const p of Object.keys(WHATSAPP_DA_EQUIPE) as Pessoa[]) {
      const u = S.users.find((x) => x.id === idDa(p));
      if (u && u.whatsapp === undefined) { u.whatsapp = WHATSAPP_DA_EQUIPE[p]; u.whatsappAvisos = true; }
    }

    // ---- as integrações: o robô do LineChat (a chave), o n8n (o webhook), o link da conversa ----
    const chaveRobo: ChaveRow = { id: novoId(), nome: 'Robô do LineChat', inicio: 'gst_R0b5', criadaEm: iso(voltarUteis(agora, 20 * 600)), criadaPorId: luan, usadaEm: null, revogadaEm: null };
    A.chaves.push(chaveRobo);
    A.robo = { tipo: 'integracao', id: chaveRobo.id, nome: chaveRobo.nome };
    const webhook: WebhookRow = {
      id: novoId(), nome: 'n8n — IA Preenche Chamado', url: 'https://n8n.inglinesystems.com.br/webhook/ia-preenche-chamado', eventos: ['chamado.criado', 'chamado.anotacao'],
      ativo: true, temSegredo: true, ultimoEm: null, ultimoOk: null, ultimaMsg: null, criadoEm: iso(voltarUteis(agora, 20 * 600)), deletedAt: null,
    };
    A.webhooks.push(webhook);
    A.integ = { sites: ['https://inglinechat.com.br'], linkConversa: 'https://inglinechat.com.br/chat/{sessao}' };

    // ---- as etiquetas com cor (a equipe já pintou algumas; as outras nascem cinza nos chamados) — nos dois painéis de
    // chamados, como a migração 0023 fez com as de antes (2.0.3: cada painel tem as suas) ----
    for (const painelId of ['painel-suporte', 'painel-desenvolvimento']) {
      for (const [nome, cor] of CORES_DAS_ETIQUETAS) {
        const quando = iso(voltarUteis(agora, 20 * 600));
        A.etiquetas.push({ id: novoId(), painelId, nome, chave: chaveDaEtiqueta(nome), cor, criadoPorId: luan, criadoEm: quando, atualizadoEm: quando });
      }
    }

    // ---- a etapa de exemplo pela chave (os campos, os agendados e as histórias) ----
    const etapaId = (painel: 'SUP' | 'DEV', chave: string) => `etapa-${painel === 'SUP' ? 'suporte' : 'desenvolvimento'}-${chave}`;

    // ---- os campos de cada painel (pelas mesmas regras da aba Campos: o que é obrigatório entra nas regras) ----
    for (const c of CAMPOS_DE_EXEMPLO) {
      criarCampo(c.painel === 'SUP' ? 'painel-suporte' : 'painel-desenvolvimento', CampoGravarSchema.parse({
        nome: c.nome, tipo: c.tipo, dica: c.dica ?? null, opcoes: (c.opcoes ?? []).map((nome) => ({ nome })),
        obrigatorioAoAbrir: !!c.paraAbrir, etapas: (c.etapas ?? []).map((k) => etapaId(c.painel, k)),
      }));
    }
    // ---- os agendados ----
    const idDoCliente = (nome: string) => {
      const c = S.clients.find((x) => x.tradeName === nome && !x.deletedAt);
      if (!c) throw new Error(`o cliente ${nome} não está na prévia`);
      return c.id;
    };
    const rodadas = new Map<string, Date>();
    for (const g of AGENDADOS_DE_EXEMPLO) {
      const regra = RegraAgendadoSchema.parse(g.regra) as RegraAgendado;
      const ultima = ultimaVez(regra, agora);
      // nasceu um pouco antes da última vez (se rodou) ou logo depois dela (se ainda não rodou)
      const criadoEm = ultima ? new Date(ultima.getTime() + (g.rodou ? -3 * DIA : 30 * MINUTO)) : new Date(agora.getTime() - 2 * DIA);
      A.agendados.push({
        id: `agendado-${g.chave}`, painelId: 'painel-suporte', titulo: g.titulo, relato: g.relato, clienteId: g.cliente ? idDoCliente(g.cliente) : null,
        responsavelId: g.responsavel ? idDa(g.responsavel) : null, assuntoId: null, prioridade: g.prioridade, checklist: [...g.checklist], regra, ativo: true,
        proximaEm: proximaExecucao(regra, agora, A.prazos.calendario)?.toISOString() ?? null, ultimaEm: null, ultimoCodigo: null, criadoEm: iso(criadoEm), deletedAt: null,
      });
      if (g.rodou && ultima) rodadas.set(g.chave, ultima);
    }

    // ---- o card antigo do LineChat que um chamado cita (um de verdade da cópia da prévia) ----
    let cardAntigo: string | null = null;
    try {
      const cards = ctx.cardsDoLineChat();
      const daAurora = cards.filter((c) => c.key && c.campos?.['cliente-71'] === 'Clínica Aurora');
      cardAntigo = (daAurora.find((c) => /Tronco|Ramal/.test(String(c.campos?.assunto ?? ''))) ?? daAurora[0] ?? cards.find((c) => c.key))?.key ?? null;
    } catch { cardAntigo = null; }

    // ---- os chamados: cada história vivida de novo, com o relógio entre os passos ----
    const codigoDa = new Map<string, string>();
    const idDoExemplo = new Map<string, string>();
    const textoCom = (s: string | undefined, chave: string): string | undefined => {
      if (s === undefined) return undefined;
      return s.replace(/\{#([a-z0-9-]+)\}/g, (_, k: string) => {
        const c = codigoDa.get(k);
        if (!c) A.erros.push(`${chave}: o texto cita {#${k}}, que ainda não existe`);
        return c ?? k;
      }).replace(/\s*No LineChat, [^\n]*\{LC\}[^\n]*/g, (frase) => (cardAntigo ? frase.replace('{LC}', cardAntigo) : '')).replace('{LC}', cardAntigo ?? '');
    };
    const atorDe = (quem: Pessoa | 'robo' | 'agendado'): Ator => (quem === 'robo' ? A.robo! : quem === 'agendado' ? GESTOR : atorDaPessoa(idDa(quem)));
    const assuntoDoCaminho = (painelId: string, c: string | undefined) => {
      if (!c) return undefined;
      const a = A.assuntos.find((x) => x.painelId === painelId && caminhoDoAssunto(x.id, A.assuntos) === c);
      if (!a) throw new Error(`o assunto ${c} não existe`);
      return a.id;
    };
    const produtoDo = (code: string) => { const p = S.products.find((x) => x.code === code); if (!p) throw new Error(`o produto ${code} não existe`); return p.id; };
    const operadoraDa = (nome: string) => { const o = S.carriers.find((x) => paraBusca(x.name) === paraBusca(nome)); if (!o) throw new Error(`a operadora ${nome} não existe`); return o.id; };
    /** Os campos do exemplo (pelos nomes) no formato da tela (pelos ids). */
    const camposDe = (painelId: string, chave: string, clienteAtual: string | null, d: DadosAlterarExemplo) => {
      const clienteId = d.cliente ? idDoCliente(d.cliente) : clienteAtual;
      return {
        ...(d.titulo !== undefined ? { titulo: d.titulo } : {}),
        ...(d.relato !== undefined ? { relato: textoCom(d.relato, chave) } : {}),
        ...(d.descricao !== undefined ? { descricao: textoCom(d.descricao, chave) } : {}),
        ...(d.cliente ? { clienteId } : {}),
        ...(d.contato ? { contatoNome: d.contato[0], contatoTelefone: d.contato[1] } : {}),
        ...(d.assunto ? { assuntoId: assuntoDoCaminho(painelId, d.assunto) } : {}),
        ...(d.tipo ? { tipo: d.tipo } : {}), ...(d.gravidade ? { gravidade: d.gravidade } : {}), ...(d.alcance ? { alcance: d.alcance } : {}),
        ...(d.prioridade ? { prioridade: d.prioridade } : {}), ...(d.motivoPrioridade ? { motivoPrioridade: d.motivoPrioridade } : {}),
        ...(d.produtos ? { produtos: d.produtos.map(produtoDo) } : {}), ...(d.operadoras ? { operadoras: d.operadoras.map(operadoraDa) } : {}),
        ...(d.etiquetas ? { etiquetas: d.etiquetas } : {}),
        ...(d.responsavel !== undefined ? { responsavelId: d.responsavel ? idDa(d.responsavel) : null } : {}),
        ...(d.campos ? { campos: d.campos } : {}),
        ...(d.solucao !== undefined ? { solucao: textoCom(d.solucao, chave) } : {}), ...(d.causa !== undefined ? { causa: textoCom(d.causa, chave) } : {}),
        ...(d.contorno !== undefined ? { contorno: textoCom(d.contorno, chave) } : {}), ...(d.validacao !== undefined ? { validacao: textoCom(d.validacao, chave) } : {}),
      };
    };

    const abrirExemplo = (ex: Exemplo, quando: Date) => {
      const painelId = ex.painel === 'SUP' ? 'painel-suporte' : 'painel-desenvolvimento';
      if (ex.abre === 'agendado') {
        const ag = A.agendados.find((a) => a.id === `agendado-${typeof ex.idade === 'object' ? ex.idade.agendado : ''}`)!;
        const r = criarDoAgendado(ag, GESTOR, quando);
        ag.ultimaEm = iso(quando); ag.ultimoCodigo = r.codigo;
        codigoDa.set(ex.chave, r.codigo); idDoExemplo.set(ex.chave, r.id);
        return;
      }
      const d = ex.dados;
      const robo = ex.abre === 'robo';
      // o título do robô: o enviado, ou "Atendimento de <nome>", ou "Chamado pelo WhatsApp"
      const titulo = d.titulo && d.titulo.trim().length >= 3 ? d.titulo : robo && d.contato?.[0] ? `Atendimento de ${d.contato[0]}` : 'Chamado pelo WhatsApp';
      const campos = camposDe(painelId, ex.chave, null, { ...d, titulo });
      const pedido = ChamadoCriarSchema.parse({
        painelId, tipoChamado: d.tipoChamado ?? 'chamado', sessaoId: d.sessao ?? null, ...campos,
        paiId: d.pai ? codigoDa.get(d.pai) ?? `faltou-${d.pai}` : null,
        incidentes: (d.incidentes ?? []).map((k) => codigoDa.get(k) ?? `faltou-${k}`),
      });
      const r = criarChamado(atorDe(ex.abre), pedido, { origem: robo ? 'robo' : 'manual' }, quando);
      if (d.ia) A.iaExemplos.set(r.id, d.ia);
      if (robo) { const k = A.chaves.find((x) => x.id === A.robo!.id)!; k.usadaEm = iso(quando); webhook.ultimoEm = iso(quando); webhook.ultimoOk = true; webhook.ultimaMsg = 'chamado.criado: recebido (200)'; }
      codigoDa.set(ex.chave, r.codigo); idDoExemplo.set(ex.chave, r.id);
    };

    const fazerPasso = (ex: Exemplo, p: Passo, quando: Date) => {
      const id = idDoExemplo.get(ex.chave);
      if (!id) throw new Error('o chamado não chegou a ser aberto');
      const t = A.chamados.find((x) => x.id === id)!;
      switch (p.faz) {
        case 'assumir': assumir(atorDe(p.por), id, {}, quando); break;
        case 'mover': {
          const painel = ex.painel === 'SUP' ? 'SUP' : 'DEV';
          mover(atorDe(p.por), id, { etapaId: etapaId(painel, p.para), motivo: textoCom(p.motivo, ex.chave) ?? null, ...(p.responsavel !== undefined ? { responsavelId: p.responsavel ? idDa(p.responsavel) : null } : {}) }, quando);
          break;
        }
        case 'alterar': alterar(atorDe(p.por), id, ChamadoAlterarSchema.parse(camposDe(t.painelId, ex.chave, t.clienteId, p.dados)), quando); break;
        case 'anotar': anotar(atorDe(p.por), id, { texto: textoCom(p.texto, ex.chave)!, anexos: p.foto ? [{ fileName: p.foto, conteudo: RECIBO_FOTO_DEMO }] : [] }, quando); break;
        case 'esperar': esperar(atorDe(p.por), id, { tipo: p.tipo, motivo: p.motivo ?? null }, quando); break;
        case 'tempo': registrarTempo(atorDe(p.por), id, { minutos: p.minutos, nota: p.nota ?? null }, quando); break;
        case 'marcar': {
          const ator = atorDe(p.por);
          t.checklist.filter((i) => !i.feito).slice(0, p.quantos).forEach((i, k) => mexerNoChecklist(ator, id, { acao: 'marcar', itemId: i.id, feito: true }, new Date(quando.getTime() + k * 1000)));
          break;
        }
        case 'operadora':
          abrirNaOperadora(atorDe(p.por), id, {
            operadoraId: operadoraDa(p.operadora), protocolo: p.protocolo, cobrarACadaHoras: p.cobrarACadaHoras ?? null, nota: p.nota ?? null,
            prometidoPara: p.prometidoEmHoras ? iso(new Date(quando.getTime() + p.prometidoEmHoras * 3_600_000)) : null,
          }, quando);
          break;
        case 'cobrar': case 'fecharProtocolo': {
          const caso = [...A.casos].reverse().find((c) => c.chamadoId === id && c.situacao === 'aberto');
          if (!caso) throw new Error('não há protocolo aberto para cobrar');
          andamentoNaOperadora(atorDe(p.por), id, caso.id, { acao: p.faz === 'cobrar' ? 'cobrar' : 'fechar', texto: p.texto }, quando);
          break;
        }
        case 'avisarCliente': { const r = avisarCliente(atorDe(p.por), id, p.texto, quando); if (r.erro) throw new Error(r.erro); break; }
        case 'ligar': ligar(atorDe(p.por), id, { para: codigoDa.get(p.com) ?? `faltou-${p.com}`, tipo: p.tipo }, quando); break;
        case 'observar': observar(atorDe(p.por), id, true, quando); break;
        // o cliente escreveu no WhatsApp e o atendente reabriu (desde o 2.0.1 o Gestor não ouve as mensagens do cliente)
        case 'reabrir': reabrir(atorDe(p.por), id, { motivo: textoCom(p.motivo, ex.chave) ?? null }, quando); break;
      }
    };

    // a hora de abertura de cada um e a hora de cada passo (em minutos de atendimento depois da abertura)
    const cal = A.prazos.calendario;
    const tarefas: Array<{ em: number; ordem: number; chave: string; fazer: () => void }> = [];
    EXEMPLOS.forEach((ex, i) => {
      const t0 = typeof ex.idade === 'number' ? voltarUteis(agora, ex.idade) : rodadas.get(ex.idade.agendado);
      if (!t0) return;
      tarefas.push({ em: t0.getTime(), ordem: i * 1000, chave: ex.chave, fazer: () => abrirExemplo(ex, t0) });
      (ex.passos ?? []).forEach((p, j) => {
        const quando = somarMinutosUteis(t0, Math.max(1, p.aos), cal);
        // o que ainda "não aconteceu" (a prévia aberta logo depois da abertura) fica de fora
        if (quando.getTime() >= agora.getTime()) return;
        tarefas.push({ em: quando.getTime(), ordem: i * 1000 + j + 1, chave: ex.chave, fazer: () => fazerPasso(ex, p, quando) });
      });
    });
    tarefas.sort((a, b) => a.em - b.em || a.ordem - b.ordem);

    // o relógio a cada 15 minutos entre os passos (fora do horário de atendimento nada muda nos prazos)
    const QUINZE = 15 * MINUTO;
    let tique = tarefas.length ? Math.ceil(tarefas[0]!.em / QUINZE) * QUINZE : agora.getTime();
    const andarRelogioAte = (ate: number) => {
      for (; tique <= ate; tique += QUINZE) if (dentroDoHorario(tique, cal)) volta(new Date(tique));
    };
    for (const tarefa of tarefas) {
      andarRelogioAte(tarefa.em);
      try { tarefa.fazer(); } catch (err) { A.erros.push(`${tarefa.chave}: ${err instanceof Error ? err.message : String(err)}`); }
    }
    andarRelogioAte(agora.getTime());
    volta(agora);

    // ---- o Comercial (2.0.1, o painel de Vendas): as negociações dos últimos meses, ganhas e perdidas,
    //      e o funil de agora — cada uma vivida pelas funções da tela (abrir, mover, marcar o resultado) ----
    const com = A.paineis.find((p) => p.id === 'painel-comercial')!;
    const etapaDoComercial = (nome: string) => {
      const e = A.etapas.find((x) => x.painelId === com.id && !x.deletedAt && x.nome === nome);
      if (!e) throw new Error(`a etapa ${nome} não é do Comercial`);
      return e.id;
    };
    const etapaDoResultado = (r: 'ganho' | 'perdido') => A.etapas.find((x) => x.painelId === com.id && !x.deletedAt && x.resultado === r)!.id;
    const hojeAqui = diaLocal(agora);
    // o dia (dias corridos antes de hoje) na hora dita, de Brasília — nunca depois de agora
    const noDia = (dias: number, hora: string) => new Date(Math.min(instanteLocal(somarDias(hojeAqui, -dias), hora).getTime(), agora.getTime() - (dias + 1) * MINUTO));
    // as etiquetas do Comercial, pintadas (2.0.3: cada painel tem as suas)
    for (const [nome, cor] of CORES_DAS_ETIQUETAS_DO_COMERCIAL) {
      const quando = iso(noDia(60, '09:00'));
      A.etiquetas.push({ id: novoId(), painelId: com.id, nome, chave: chaveDaEtiqueta(nome), cor, criadoPorId: idDa('camila'), criadoEm: quando, atualizadoEm: quando });
    }
    for (const n of [...NEGOCIACOES_DE_EXEMPLO].sort((a, b) => b.abriu - a.abriu)) {
      try {
        const dono = atorDaPessoa(idDa(n.responsavel ?? n.por));
        const r = criarChamado(atorDaPessoa(idDa(n.por)), ChamadoCriarSchema.parse({
          painelId: com.id, titulo: n.titulo, ...(n.cliente ? { clienteId: idDoCliente(n.cliente) } : { empresa: n.empresa }),
          ...(n.contato ? { contatoNome: n.contato[0], contatoTelefone: n.contato[1] } : {}),
          valor: n.valor !== undefined ? Math.round(n.valor * 100) : null,
          ...(n.porProduto ? { valoresDosProdutos: Object.fromEntries(Object.entries(n.porProduto).map(([codigo, v]) => [produtoDo(codigo), Math.round(v * 100)])) } : {}),
          ativacao: n.ativacao !== undefined ? Math.round(n.ativacao * 100) : null,
          ...(n.ativacaoPorProduto ? { ativacoesDosProdutos: Object.fromEntries(Object.entries(n.ativacaoPorProduto).map(([codigo, v]) => [produtoDo(codigo), Math.round(v * 100)])) } : {}),
          // os campos do painel, pelo nome (como o robô e o n8n mandam)
          ...(n.campos ? { campos: n.campos } : {}),
          ...(n.etiquetas ? { etiquetas: n.etiquetas } : {}),
          produtos: (n.produtos ?? []).map(produtoDo), responsavelId: n.responsavel ? idDa(n.responsavel) : null, descricao: n.descricao ?? null,
        }), { origem: 'manual' }, noDia(n.abriu, '09:30'));
        for (const p of n.passos ?? []) mover(dono, r.id, { etapaId: etapaDoComercial(p.para) }, noDia(p.dias, '11:00'));
        if (n.anotacao) {
          anotar(atorDaPessoa(idDa(n.anotacao.por)), r.id, {
            texto: n.anotacao.texto, anexos: n.anotacao.proposta ? [{ fileName: n.anotacao.proposta, conteudo: PROPOSTA_PDF_DEMO }] : [],
          }, noDia(n.anotacao.dias, '15:00'));
        }
        if (n.fim) {
          mover(dono, r.id, {
            etapaId: etapaDoResultado(n.fim.resultado), motivoPerda: n.fim.motivo ?? null,
            concluidoEm: n.fim.fechouHaDias !== undefined ? somarDias(hojeAqui, -n.fim.fechouHaDias) : null,
          }, noDia(n.fim.dias, '16:00'));
        }
      } catch (err) { A.erros.push(`comercial ${n.chave}: ${err instanceof Error ? err.message : String(err)}`); }
    }
    com.ajustes.metaMensal = META_DO_COMERCIAL * 100;

    // ---- o sininho: o que é antigo já foi lido ----
    // O Luan vê os 5 de que mais precisa (o Crítico que chegou, o prazo perto, o chamado que recebeu, o
    // que está sem dono e a novidade de um chamado que ele observa); os outros, os 3 mais recentes.
    const porPessoa = new Map<string, AvisoRow[]>();
    for (const a of A.avisos) porPessoa.set(a.userId, [...(porPessoa.get(a.userId) ?? []), a]);
    for (const [userId, avisos] of porPessoa) {
      const novos = [...avisos].sort((a, b) => b.em.localeCompare(a.em));
      const manter = new Set<string>();
      if (userId === luan) {
        for (const tipo of ['critico', 'prazo_perto', 'sem_dono', 'observador'] as TipoAviso[]) { const a = novos.find((x) => x.tipo === tipo); if (a) manter.add(a.id); }
        const recebeu = novos.find((x) => x.tipo === 'recebeu' && x.texto.startsWith('Você recebeu')) ?? novos.find((x) => x.tipo === 'recebeu');
        if (recebeu) manter.add(recebeu.id);
      } else novos.slice(0, 3).forEach((a) => manter.add(a.id));
      for (const a of avisos) if (!manter.has(a.id)) a.lidoEm = iso(new Date(Math.min(agora.getTime(), Date.parse(a.em) + 20 * MINUTO)));
    }
  }

  // =====================================================================
  //  A API (o que as telas chamam)
  // =====================================================================

  /** Registra na auditoria (quando algo mudou) e devolve a ficha atualizada — ou o erro (o WhatsApp recusou). */
  function fichaDepois(r: Feito, acao: 'update' | 'delete' | 'restore' = 'update'): FichaChamado {
    if (r.resumo) auditar(acao, 'ticket', r.resumo, r.id, { before: r.antes, after: r.depois });
    if (r.erro) throw bad(r.erro);
    return ficha(eu(), r.id);
  }
  /** O começo de toda chamada: os exemplos (na primeira) e o relógio. */
  function preparar() {
    semear();
    relogioAoVivo();
  }
  const lerQuadro = (q: Record<string, unknown>) => {
    const v = limparQuery(q);
    if (!v.painel) throw new ApiError(400, 'Dados inválidos', [{ field: 'painel', message: 'Escolha o painel' }]);
    const resto = ler(ListarChamadosSchema.pick({ responsavel: true, prioridade: true, q: true, cliente: true, assunto: true, etiqueta: true, espera: true }), v);
    return { ...resto, painel: v.painel };
  };

  const api: Api['atendimento'] = {
    async opcoes() { await ctx.wait(80); ctx.requireAnyPerm('support.read', 'sales.read'); preparar(); return opcoes(eu()); },
    async quadro(q) { await ctx.wait(); const f = lerQuadro(q); ctx.requireAnyPerm('support.read', 'sales.read'); preparar(); return quadro(eu(), f); },
    async lista(q) {
      await ctx.wait();
      const f = ler(ListarChamadosSchema, limparQuery(q));
      ctx.requireAnyPerm('support.read', 'sales.read'); preparar();
      const todos = filtrados(eu(), f);
      const inicio = (f.page - 1) * f.pageSize;
      return { items: todos.slice(inicio, inicio + f.pageSize).map(semBusca), total: todos.length, page: f.page, pageSize: f.pageSize } satisfies Page<CartaoChamado>;
    },
    // a prévia não tem servidor para montar o CSV: a tela monta com o `csvDosChamados` (e a auditoria fica com ela)
    exportarUrl() { return null; },
    async meuDia() { await ctx.wait(); ctx.requireAnyPerm('support.read', 'sales.read'); preparar(); return meuDia(eu()); },
    async resumoDosPaineis(): Promise<ResumoDoPainel[]> {
      await ctx.wait(); ctx.requireAnyPerm('support.read', 'sales.read'); preparar();
      const ator = eu();
      // as mesmas contas do servidor (resumoDosPaineis do shared), sobre os chamados que a pessoa vê
      const agora = agoraReal();
      return resumoDosPaineis(paineis().filter((p) => podeVerPainel(p, ator)), cartoesVisiveis(ator, agora), ator.tipo === 'pessoa' ? ator.id : null, agora);
    },
    async relatorioDeVendas(q) {
      await ctx.wait();
      const f = ler(FiltroDoRelatorioDeVendasSchema, limparQuery(q));
      ctx.requireAnyPerm('support.read', 'sales.read'); preparar();
      return relatorioDoPainelDeVendas(eu(), f);
    },
    async avisos() { await ctx.wait(60); ctx.requireAnyPerm('support.read', 'sales.read'); preparar(); return avisosNaTela(S.me!.id); },
    async marcarAvisosLidos(ids) {
      await ctx.wait(60); ctx.requireAnyPerm('support.read', 'sales.read'); semear();
      if (ids && !ids.length) return { ok: true };
      const agora = iso(agoraReal());
      for (const a of A.avisos) if (a.userId === S.me!.id && !a.lidoEm && (!ids || ids.includes(a.id))) a.lidoEm = agora;
      return { ok: true };
    },
    async cadastroDoCliente(clienteId) { await ctx.wait(); ctx.requireAnyPerm('support.read', 'sales.read'); preparar(); return cadastroDoCliente(eu(), clienteId); },
    async chamado(ref) { await ctx.wait(); ctx.requireAnyPerm('support.read', 'sales.read'); preparar(); return ficha(eu(), ref); },
    anexoUrl(id) {
      semear();
      if (!S.me) return '';
      const a = anexoVisivel(id, eu());
      return a ? a.url : '';
    },
    async anexoBytes(id) {
      await ctx.wait(120);
      ctx.requireAnyPerm('support.read', 'sales.read');
      preparar();
      const a = anexoVisivel(id, eu());
      if (!a) throw new ApiError(404, 'Anexo não encontrado');
      // o anexo da prévia fica guardado como data: URL (base64)
      const b64 = a.url.slice(a.url.indexOf(',') + 1);
      const bin = atob(b64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      return bytes.buffer;
    },
    async criar(d) {
      await ctx.wait(200);
      const dados = ler(ChamadoCriarSchema, d);
      ctx.requirePerm('tickets.work'); preparar();
      const r = criarChamado(eu(), dados);
      auditar('create', 'ticket', `Abriu ${r.codigo} "${dados.titulo}"${r.aviso ? (r.aviso.ok ? ' e avisou o cliente pelo WhatsApp' : ' (o aviso ao cliente não foi)') : ''}`, r.id);
      return r;
    },
    async alterar(id, d) { await ctx.wait(150); const dados = ler(ChamadoAlterarSchema, d); ctx.requirePerm('tickets.work'); preparar(); return fichaDepois(alterar(eu(), id, dados)); },
    async mover(id, d) { await ctx.wait(150); const dados = ler(MoverSchema, d); ctx.requirePerm('tickets.work'); preparar(); return fichaDepois(mover(eu(), id, dados)); },
    async assumir(id) { await ctx.wait(150); ctx.requirePerm('tickets.work'); preparar(); return fichaDepois(assumir(eu(), id)); },
    async esperar(id, d) { await ctx.wait(150); const dados = ler(EsperarSchema, d); ctx.requirePerm('tickets.work'); preparar(); return fichaDepois(esperar(eu(), id, dados)); },
    async reabrir(id, d) { await ctx.wait(150); const dados = ler(ReabrirSchema, d); ctx.requirePerm('tickets.work'); preparar(); return fichaDepois(reabrir(eu(), id, dados)); },
    async trocarPainel(id, d) { await ctx.wait(150); const dados = ler(TrocarPainelSchema, d); ctx.requirePerm('tickets.work'); preparar(); return fichaDepois(trocarPainel(eu(), id, dados)); },
    async anotar(id, d) { await ctx.wait(200); const dados = ler(AnotacaoSchema, d); ctx.requirePerm('tickets.work'); preparar(); return fichaDepois(anotar(eu(), id, dados)); },
    async apagarAnotacao(id, notaId) { await ctx.wait(150); ctx.requirePerm('tickets.work'); preparar(); return fichaDepois(apagarAnotacao(eu(), id, notaId), 'delete'); },
    async ligar(id, d) { await ctx.wait(150); const dados = ler(LigarChamadoSchema, d); ctx.requirePerm('tickets.work'); preparar(); return fichaDepois(ligar(eu(), id, dados)); },
    async desligar(id, ligacaoId) { await ctx.wait(150); ctx.requirePerm('tickets.work'); preparar(); return fichaDepois(desligar(eu(), id, ligacaoId)); },
    async definirPai(id, pai) { await ctx.wait(150); const dados = ler(PaiSchema, { pai }); ctx.requirePerm('tickets.work'); preparar(); return fichaDepois(definirPai(eu(), id, dados.pai)); },
    async definirProblema(id, problema) { await ctx.wait(150); const dados = ler(ProblemaSchema, { problema }); ctx.requirePerm('tickets.work'); preparar(); return fichaDepois(definirProblema(eu(), id, dados.problema)); },
    async checklist(id, d) { await ctx.wait(120); const dados = ler(ChecklistSchema, d); ctx.requirePerm('tickets.work'); preparar(); return fichaDepois(mexerNoChecklist(eu(), id, dados)); },
    async registrarTempo(id, d) { await ctx.wait(150); const dados = ler(TempoSchema, d); ctx.requirePerm('tickets.work'); preparar(); return fichaDepois(registrarTempo(eu(), id, dados)); },
    async apagarTempo(id, itemId) { await ctx.wait(150); ctx.requirePerm('tickets.work'); preparar(); return fichaDepois(apagarTempo(eu(), id, itemId), 'delete'); },
    async abrirNaOperadora(id, d) { await ctx.wait(150); const dados = ler(OperadoraCasoSchema, d); ctx.requirePerm('tickets.work'); preparar(); return fichaDepois(abrirNaOperadora(eu(), id, dados)); },
    async andamentoOperadora(id, casoId, d) { await ctx.wait(150); const dados = ler(OperadoraAndamentoSchema, d); ctx.requirePerm('tickets.work'); preparar(); return fichaDepois(andamentoNaOperadora(eu(), id, casoId, dados)); },
    async avisarCliente(id, texto) { await ctx.wait(250); const dados = ler(AvisarClienteSchema, { texto }); ctx.requirePerm('tickets.work'); preparar(); return fichaDepois(avisarCliente(eu(), id, dados.texto)); },
    async observar(id, acompanhar) { await ctx.wait(120); const dados = ler(ObservarSchema, { observar: acompanhar }); ctx.requirePerm('tickets.work'); preparar(); return fichaDepois(observar(eu(), id, dados.observar)); },
    async preencherComIa(id) {
      await ctx.wait(1200);
      ctx.requirePerm('tickets.work'); preparar();
      const ator = eu();
      exigirTrabalhar(ator);
      const t = chamadoVisivel(id, ator);
      const painel = painelPorId(t.painelId)!;
      ctx.ia.pronta();
      ctx.ia.limite();
      const fonte: SugestaoIa['fonte'] = t.sessaoId && S.ajustesLineChat.ativo ? 'conversa' : 'chamado';
      const { json, letras } = sugestao(t, painel);
      const lida = lerSugestaoDaIa(json, {
        assuntos: A.assuntos.filter((a) => a.painelId === painel.id).map((a) => ({ id: a.id, caminho: caminhoDoAssunto(a.id, A.assuntos), ativo: a.ativo })),
        tipos: painel.ajustes.tipos,
        produtos: S.products.filter((p) => !p.deletedAt && p.active).map((p) => ({ id: p.id, nome: p.name })),
      });
      // a conta do mês: o que uma IA de verdade gastaria para ler isso (uns 4 caracteres por token)
      const uso = { entrada: Math.round(letras / 4), saida: 220 };
      const conta = ctx.ia.uso();
      conta.rascunhos++; conta.entrada += uso.entrada; conta.saida += uso.saida;
      const ia = S.ajustesIa;
      const provedor = INFO_PROVEDORES[ia.provedor].nome;
      auditar('chamado_ia', 'ticket', `${ator.nome} pediu à IA (${provedor}) uma sugestão para ${t.codigo}, lendo ${fonte === 'conversa' ? 'a conversa do LineChat' : 'o próprio chamado'}`, t.id);
      return { ...sugestaoDoQueOPainelUsa(lida, painel.ajustes), fonte, modelo: ia.modeloNome || ia.modelo, provedor, custo: custoEstimado(uso, ia) };
    },
    async remover(id) {
      await ctx.wait(150); ctx.requirePerm('tickets.manage'); preparar();
      const r = mandarParaLixeira(eu(), id);
      auditar('delete', 'ticket', r.resumo!, r.id);
      return { ok: true };
    },
    async restaurar(id) { await ctx.wait(150); ctx.requirePerm('tickets.manage'); preparar(); return fichaDepois(restaurar(eu(), id), 'restore'); },

    // ---- os ajustes do módulo (quem cuida dos chamados) ----
    async salvarPainel(id, d) {
      await ctx.wait(200);
      const dados = ler(PainelGravarSchema, d);
      ctx.requirePerm('tickets.manage'); preparar();
      const r = gravarPainel(eu(), id, dados, agoraReal());
      auditar(id ? 'update' : 'create', 'ticket_panel', r.resumo, r.valor.id, { before: r.antes, after: r.depois });
      return r.valor;
    },
    async salvarEtapas(id, d) {
      await ctx.wait(200);
      const dados = ler(EtapasGravarSchema, d);
      ctx.requirePerm('tickets.manage'); preparar();
      const r = salvarEtapasDoPainel(eu(), id, dados, agoraReal());
      auditar('update', 'ticket_panel', r.resumo, id, { before: r.antes, after: r.depois });
      return r.valor;
    },
    async salvarAssunto(painelId, id, d) {
      await ctx.wait(150);
      const dados = ler(AssuntoGravarSchema, d);
      ctx.requirePerm('tickets.manage'); preparar();
      const r = id ? alterarAssunto(id, dados) : criarAssunto(painelId, dados);
      auditar(id ? 'update' : 'create', 'ticket_subject', r.resumo, r.valor.id, { before: 'antes' in r ? r.antes : undefined, after: r.depois });
      return r.valor;
    },
    async colarAssuntos(painelId, texto) {
      await ctx.wait(200);
      const dados = ler(AssuntosColarSchema, { texto });
      ctx.requirePerm('tickets.manage'); preparar();
      const r = colarAssuntos(painelId, dados.texto);
      auditar('create', 'ticket_subject', r.resumo, null, { after: r.depois });
      return r.valor;
    },
    async salvarCamposDoSistema(painelId, d) {
      await ctx.wait(150);
      const dados = ler(CamposDoSistemaSchema, d);
      ctx.requirePerm('tickets.manage'); preparar();
      const r = salvarCamposDoSistema(painelId, dados);
      auditar('update', 'ticket_panel', r.resumo, painelId, { before: r.antes, after: r.depois });
      return r.valor;
    },
    async salvarCampo(painelId, id, d) {
      await ctx.wait(150);
      const dados = ler(CampoGravarSchema, d);
      ctx.requirePerm('tickets.manage'); preparar();
      const r = id ? alterarCampo(id, dados) : criarCampo(painelId, dados);
      auditar(id ? 'update' : 'create', 'ticket_field', r.resumo, r.valor.id, { before: 'antes' in r ? r.antes : undefined, after: r.depois });
      return r.valor;
    },
    async incluirOpcaoDoCampo(campoId, d) {
      await ctx.wait(140);
      const dados = ler(OpcaoIncluirSchema, d);
      ctx.requirePerm('tickets.work'); preparar();
      const ator = eu();
      const r = incluirOpcao(campoId, dados.nome, (painelId) => { const p = paineis().find((x) => x.id === painelId); return !!p && podeVerPainel(p, ator); });
      if (r.resumo) auditar('update', 'ticket_field', r.resumo, campoId);
      return r.valor;
    },
    async ordenarCampos(painelId, ids) {
      await ctx.wait(120);
      const dados = ler(OrdemDosCamposSchema, { ids });
      ctx.requirePerm('tickets.manage'); preparar();
      const r = ordenarCampos(painelId, dados.ids);
      auditar('update', 'ticket_panel', r.resumo, painelId);
      return r.valor;
    },
    // as etiquetas de cada painel, com a cor (Ajustes › Etiquetas): as mesmas regras e frases do servidor
    async etiquetas() {
      await ctx.wait(80);
      ctx.requirePerm('tickets.manage'); preparar();
      return A.etiquetas.map(etiquetaParaTela).sort(ordemDoNome);
    },
    async criarEtiqueta(d) {
      await ctx.wait(150);
      const dados = ler(EtiquetaGravarSchema, d);
      ctx.requirePerm('tickets.manage'); preparar();
      const painel = A.paineis.find((p) => p.id === dados.painelId);
      if (!painel) throw bad('Esse painel não existe.');
      const chave = chaveDaEtiqueta(dados.nome);
      const igual = A.etiquetas.find((e) => e.painelId === painel.id && e.chave === chave);
      if (igual) throw conflito(`A etiqueta ${igual.nome} já existe no ${painel.nome}.`);
      const agora = iso(agoraReal());
      const e: EtiquetaRow = { id: novoId(), painelId: painel.id, nome: dados.nome, chave, cor: dados.cor, criadoPorId: S.me?.id ?? null, criadoEm: agora, atualizadoEm: agora };
      A.etiquetas.push(e);
      auditar('create', 'ticket_tag', `Criou a etiqueta ${e.nome} (${NOME_COR_ETIQUETA[e.cor]}) no painel ${painel.nome}`, e.id, { after: { painel: painel.nome, nome: e.nome, cor: e.cor } });
      return etiquetaParaTela(e);
    },
    async editarEtiqueta(id, d) {
      await ctx.wait(140);
      const dados = ler(EtiquetaEditarSchema, d);
      ctx.requirePerm('tickets.manage'); preparar();
      return editarEtiqueta(etiquetaPorId(id), dados);
    },
    async editarEtiquetaPeloNome(d) {
      await ctx.wait(140);
      const { de, painelId, ...dados } = ler(EtiquetaEditarPeloNomeSchema, d);
      ctx.requirePerm('tickets.manage'); preparar();
      return editarEtiqueta({ painelId, nome: de }, dados);
    },
    async removerEtiqueta(id) {
      await ctx.wait(120);
      ctx.requirePerm('tickets.manage'); preparar();
      const e = etiquetaPorId(id);
      const n = usosDasEtiquetas(e.painelId).get(e.chave)?.chamados ?? 0;
      if (n) throw conflito(`A etiqueta ${e.nome} está em ${n} ${n === 1 ? 'chamado' : 'chamados'}: tire dos chamados antes.`);
      A.etiquetas = A.etiquetas.filter((x) => x.id !== e.id);
      const painel = nomeDoPainel(e.painelId);
      auditar('delete', 'ticket_tag', `Tirou a etiqueta ${e.nome} das sugestões do painel ${painel}`, e.id, { before: { painel, nome: e.nome, cor: e.cor } });
      return { ok: true as const };
    },
    async ajustesPrazos() { await ctx.wait(80); ctx.requirePerm('tickets.manage'); preparar(); return JSON.parse(JSON.stringify(A.prazos)) as AjustesPrazos; },
    async salvarPrazos(a) {
      await ctx.wait(200);
      const d = ler(AjustesPrazosSchema, a) as AjustesPrazos;
      ctx.requirePerm('tickets.manage'); preparar();
      const antes = JSON.parse(JSON.stringify(A.prazos)) as AjustesPrazos;
      A.prazos = JSON.parse(JSON.stringify({ ...d, calendario: { ...d.calendario, feriados: [...d.calendario.feriados].sort((x, y) => x.data.localeCompare(y.data)) } })) as AjustesPrazos;
      const depois = A.prazos;
      const mudou = (x: unknown, y: unknown) => JSON.stringify(x) !== JSON.stringify(y);
      const partes = [
        mudou(antes.calendario.horario, depois.calendario.horario) ? 'o horário de atendimento' : '',
        mudou(antes.calendario.feriados, depois.calendario.feriados) ? 'os feriados' : '',
        mudou(antes.prazos, depois.prazos) ? 'os prazos por prioridade' : '',
        mudou(antes.matriz, depois.matriz) ? 'a prioridade sugerida' : '',
        antes.alertaPercentual !== depois.alertaPercentual ? `o aviso de prazo (${depois.alertaPercentual}%)` : '',
        antes.semDonoMinutos !== depois.semDonoMinutos ? `o aviso de sem responsável (${depois.semDonoMinutos} min)` : '',
      ].filter(Boolean);
      auditar('settings_atendimento_prazos', 'settings', partes.length ? `Mudou os prazos dos chamados: ${lista(partes)}` : 'Salvou os prazos dos chamados sem mudanças', 'atendimento-prazos', { before: antes, after: depois });
      return JSON.parse(JSON.stringify(A.prazos)) as AjustesPrazos;
    },
    async ajustesAvisos() { await ctx.wait(80); ctx.requirePerm('tickets.manage'); preparar(); return avisosParaTela(); },
    async salvarAvisos(a) {
      await ctx.wait(200);
      const d = ler(AvisosChamadosSchema, a);
      ctx.requirePerm('tickets.manage'); preparar();
      const antes = A.whats;
      // a chave própria iria para o cofre: na prévia, só fica marcado que existe (nunca a guardamos)
      if (d.chave) A.temChavePropria = true;
      A.whats = {
        ...antes, ativo: d.ativo, url: d.url, usarChaveDoLineChat: d.usarChaveDoLineChat, numeroCliente: d.numeroCliente, numeroEquipe: d.numeroEquipe,
        envioCliente: d.envioCliente, modeloCliente: d.modeloCliente, template: d.template?.id ? d.template : null,
        equipeLineChat: d.equipeLineChat, atribuirAQuemManda: d.atribuirAQuemManda, eventos: d.eventos,
        // a mensagem de cada aviso (2.0.2): só as que mudaram da padrão
        modelos: modelosParaGuardar(d.modelos),
      };
      const mensagens = EVENTOS_AVISO.filter((e) => modeloDoAviso(antes.modelos, e) !== modeloDoAviso(A.whats.modelos, e))
        .map((e) => (A.whats.modelos[e] ? NOME_EVENTO_AVISO[e].titulo : `${NOME_EVENTO_AVISO[e].titulo} (voltou à padrão)`));
      auditar('settings_atendimento_avisos', 'settings',
        `${d.ativo ? 'Ligou' : 'Desligou'} o WhatsApp dos chamados${d.chave ? ' e trocou a chave da API' : ''}`
          + (mensagens.length ? `; mudou a mensagem ${mensagens.length === 1 ? 'do aviso' : 'dos avisos'}: ${mensagens.join(' · ')}` : ''),
        'atendimento-avisos', { before: avisosParaAuditoria(antes), after: avisosParaAuditoria(A.whats) });
      return avisosParaTela();
    },
    async modelosDoLineChat() {
      await ctx.wait(500);
      ctx.requirePerm('tickets.manage'); preparar();
      const v = A.whats;
      if (!v.numeroCliente) throw bad('Falta o número para o cliente (o oficial): salve o número antes de buscar os modelos.');
      if (!temChaveDoEnvio()) throw bad(v.usarChaveDoLineChat ? 'Falta a chave do LineChat (Administração › Ajustes › Chamados do LineChat).' : 'Falta a chave da API: salve a chave antes de buscar os modelos.');
      // na prévia, o número oficial do exemplo é o canal do LineChat; outro número não está lá (como o servidor diria)
      if (v.numeroCliente !== AVISOS_CHAMADOS_PADRAO.numeroCliente) throw bad(`O número ${telefoneLegivel(v.numeroCliente)} não está entre os canais de WhatsApp do LineChat. Confira o número para o cliente.`);
      // pelo nome, como o servidor devolve
      const modelos = MODELOS_DO_LINECHAT.map((m) => ({ ...m, variaveis: [...m.variaveis] })).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
      return { canal: { id: 'canal-oficial-da-previa', numero: v.numeroCliente, oficial: true }, modelos };
    },
    async testarAvisos(d) {
      await ctx.wait(400);
      const de = d?.de; const userId = d?.userId; const numero = typeof d?.numero === 'string' ? d.numero.trim() : undefined;
      const evento = d?.evento; const modelo = d?.modelo;
      if (de !== undefined && de !== 'cliente' && de !== 'equipe') throw new ApiError(400, 'Dados inválidos', [{ field: 'de', message: 'Invalid enum value' }]);
      if (numero !== undefined && numero.length > 30) throw new ApiError(400, 'Dados inválidos', [{ field: 'numero', message: 'String must contain at most 30 character(s)' }]);
      if (evento !== undefined && !(EVENTOS_AVISO as readonly string[]).includes(evento)) throw new ApiError(400, 'Dados inválidos', [{ field: 'evento', message: 'Invalid enum value' }]);
      if (modelo !== undefined && modelo.length > MAX_MODELO_DO_AVISO) throw new ApiError(400, 'Dados inválidos', [{ field: 'modelo', message: `String must contain at most ${MAX_MODELO_DO_AVISO} character(s)` }]);
      ctx.requirePerm('tickets.manage'); preparar();
      // o exemplo de um aviso (2.0.2): a mensagem como está na tela, com os valores de exemplo (como o servidor confere)
      if (evento) {
        const fora = variaveisDesconhecidas(evento, modelo?.trim() ? modelo : modeloDoAviso(A.whats.modelos, evento));
        if (fora.length) throw bad(`${fora.join(', ')} não ${fora.length === 1 ? 'é variável' : 'são variáveis'} do aviso "${NOME_EVENTO_AVISO[evento].titulo}": confira o nome (os botões põem certo).`);
      }
      let para = numero ?? '';
      if (!para) {
        // pausada também testa: o teste é para conferir o número
        const u = S.users.find((x) => x.id === (userId || S.me!.id));
        if (!u?.whatsapp) {
          throw bad(userId
            ? 'Essa pessoa não tem WhatsApp. Ponha o número dela em Administração › Usuários antes de testar.'
            : 'Escolha uma pessoa com WhatsApp (em Administração › Usuários), ou digite um número, para o teste.');
        }
        para = u.whatsapp;
      }
      const r = mandarWhatsApp({ de: evento ? 'equipe' : de ?? 'equipe', para });
      A.whats = { ...A.whats, ultimoTesteEm: iso(agoraReal()), ultimoTesteOk: r.ok, ultimoTesteMsg: r.mensagem };
      const como = evento ? `o exemplo do aviso "${NOME_EVENTO_AVISO[evento].titulo}", pelo número da equipe` : de === 'cliente' ? 'número do cliente' : 'número da equipe';
      auditar('settings_atendimento_avisos_test', 'settings', `Testou o WhatsApp dos chamados (${como} para ${para}): ${r.ok ? 'funcionou' : `falhou — ${r.mensagem}`}`, 'atendimento-avisos');
      return { ok: r.ok, mensagem: r.mensagem };
    },
    async agendados() { await ctx.wait(80); ctx.requirePerm('tickets.manage'); preparar(); return agendadosVivos().map(agendadoParaTela); },
    async salvarAgendado(id, d) {
      await ctx.wait(150);
      const dados = ler(AgendadoGravarSchema, d);
      ctx.requirePerm('tickets.manage'); preparar();
      const agora = agoraReal();
      const atual = id ? A.agendados.find((a) => a.id === id && !a.deletedAt) : null;
      if (id && !atual) throw naoAchado('Agendado');
      // confere como o "abrir" confere: o que estiver errado aparece agora, e não na hora de nascer
      const todos = paineis();
      const painel = todos.find((p) => p.id === dados.painelId) ?? todos.find((p) => p.sigla === dados.painelId.trim().toUpperCase());
      if (!painel) throw bad('O painel escolhido não existe (ou foi removido).');
      if (dados.ativo && !painel.ativo) throw bad(`O painel ${painel.nome} está desativado: escolha outro.`);
      if (dados.clienteId && !clienteVivo(dados.clienteId)) throw bad('O cliente escolhido não existe (ou está na lixeira).');
      if (dados.responsavelId) { const u = S.users.find((x) => x.id === dados.responsavelId); if (!u || !u.active) throw bad('O responsável escolhido não existe ou está desativado.'); }
      if (dados.assuntoId) {
        const a = A.assuntos.find((x) => x.id === dados.assuntoId);
        if (!a || a.painelId !== painel.id || !a.ativo) throw bad(`Esse assunto não é do painel ${painel.nome} (ou foi desativado).`);
      }
      const regra = dados.regra as RegraAgendado;
      const proxima = proximaExecucao(regra, agora, A.prazos.calendario);
      if (dados.ativo && regra.frequencia === 'uma_vez' && !proxima) throw bad('Essa data e hora já passaram: escolha um momento que ainda vai chegar.');
      const colunas = {
        painelId: painel.id, titulo: dados.titulo, relato: dados.relato ?? null, clienteId: dados.clienteId, responsavelId: dados.responsavelId, assuntoId: dados.assuntoId,
        prioridade: dados.prioridade, checklist: [...dados.checklist], regra, ativo: dados.ativo, proximaEm: proxima ? iso(proxima) : null,
      };
      if (!atual) {
        const a: AgendadoRow = { id: novoId(), ...colunas, ultimaEm: null, ultimoCodigo: null, criadoEm: iso(agora), deletedAt: null };
        A.agendados.push(a);
        const ag = agendadoParaTela(a);
        auditar('create', 'ticket_schedule', `Agendou o chamado "${ag.titulo}" no painel ${painel.nome}: ${ag.textoRegra}${ag.ativo ? '' : ' (desligado)'}`, a.id, { after: ag });
        return ag;
      }
      const antes = agendadoParaTela(atual);
      Object.assign(atual, colunas);
      const depois = agendadoParaTela(atual);
      const ligou = antes.ativo !== depois.ativo ? (depois.ativo ? ' (ligou)' : ' (desligou)') : '';
      auditar('update', 'ticket_schedule', `Alterou o agendado "${depois.titulo}": ${depois.textoRegra}${ligou}`, atual.id, { before: antes, after: depois });
      return depois;
    },
    async removerAgendado(id) {
      await ctx.wait(120); ctx.requirePerm('tickets.manage'); preparar();
      const a = A.agendados.find((x) => x.id === id && !x.deletedAt);
      if (!a) throw naoAchado('Agendado');
      a.deletedAt = iso(agoraReal());
      auditar('delete', 'ticket_schedule', `Removeu o agendado "${a.titulo}"`, a.id, { before: agendadoParaTela(a) });
      return { ok: true };
    },
    async rodarAgendado(id) {
      await ctx.wait(250); ctx.requirePerm('tickets.manage'); preparar();
      const a = A.agendados.find((x) => x.id === id && !x.deletedAt);
      if (!a) throw naoAchado('Agendado');
      const agora = agoraReal();
      const r = criarDoAgendado(a, eu(), agora);
      a.ultimaEm = iso(agora); a.ultimoCodigo = r.codigo;
      auditar('create', 'ticket', `Abriu ${r.codigo} "${a.titulo}" pelo agendado (criar agora)`, r.id);
      return { codigo: r.codigo };
    },

    // ---- as integrações (a administração) ----
    async integracoes() {
      await ctx.wait(80); ctx.requirePerm('admin.manage'); preparar();
      return {
        webhooks: [...A.webhooks].filter((w) => !w.deletedAt).sort((a, b) => a.criadoEm.localeCompare(b.criadoEm)).map(webhookParaTela),
        chaves: [...A.chaves].sort((a, b) => b.criadaEm.localeCompare(a.criadaEm)).map(chaveParaTela),
        sites: [...A.integ.sites], linkConversa: A.integ.linkConversa, endereco: ENDERECO,
      } satisfies IntegracoesTela;
    },
    async salvarWebhook(id, d) {
      await ctx.wait(200);
      const dados = ler(WebhookGravarSchema, d);
      ctx.requirePerm('admin.manage'); preparar();
      const atual = id ? A.webhooks.find((w) => w.id === id && !w.deletedAt) : null;
      if (id && !atual) throw naoAchado('Webhook');
      const problema = problemaDoEndereco(dados.url);
      if (problema) throw bad(problema);
      if (!atual) {
        const w: WebhookRow = { id: novoId(), nome: dados.nome, url: dados.url, eventos: [...new Set(dados.eventos)], ativo: dados.ativo, temSegredo: true, ultimoEm: null, ultimoOk: null, ultimaMsg: null, criadoEm: iso(agoraReal()), deletedAt: null };
        A.webhooks.push(w);
        const webhook = webhookParaTela(w);
        auditar('create', 'ticket_webhook', `Criou o webhook ${webhook.nome} (${webhook.url}) para ${webhook.eventos.join(', ')}`, w.id, { after: webhook });
        // o segredo aparece só agora (e nunca fica guardado na prévia)
        return { webhook, segredo: sortear() };
      }
      const antes = webhookParaTela(atual);
      const segredo = dados.novoSegredo ? sortear() : null;
      Object.assign(atual, { nome: dados.nome, url: dados.url, eventos: [...new Set(dados.eventos)], ativo: dados.ativo, temSegredo: atual.temSegredo || !!segredo });
      const webhook = webhookParaTela(atual);
      auditar('update', 'ticket_webhook', `Alterou o webhook ${webhook.nome}${webhook.ativo !== antes.ativo ? (webhook.ativo ? ' e o ligou' : ' e o desligou') : ''}${segredo ? ' e gerou uma assinatura nova' : ''}`, atual.id, { before: antes, after: webhook });
      return { webhook, segredo };
    },
    async removerWebhook(id) {
      await ctx.wait(120); ctx.requirePerm('admin.manage'); preparar();
      const w = A.webhooks.find((x) => x.id === id && !x.deletedAt);
      if (!w) throw naoAchado('Webhook');
      w.deletedAt = iso(agoraReal());
      auditar('delete', 'ticket_webhook', `Tirou o webhook ${w.nome} (${w.url})`, w.id, { before: webhookParaTela(w) });
      return { ok: true };
    },
    async testarWebhook(id) {
      await ctx.wait(400); ctx.requirePerm('admin.manage'); preparar();
      const w = A.webhooks.find((x) => x.id === id && !x.deletedAt);
      if (!w) throw naoAchado('Webhook');
      const problema = problemaDoEndereco(w.url);
      const r = problema ? { ok: false, mensagem: problema } : { ok: true, mensagem: PREVIA };
      w.ultimoEm = iso(agoraReal()); w.ultimoOk = r.ok; w.ultimaMsg = problema ?? `teste (${PREVIA})`;
      auditar('ticket_webhook_test', 'ticket_webhook', `Testou o webhook ${w.nome}: ${r.ok ? 'funcionou' : `falhou — ${r.mensagem}`}`, w.id);
      return r;
    },
    async criarChave(nome) {
      await ctx.wait(200);
      const dados = ler(ChaveCriarSchema, { nome });
      ctx.requirePerm('admin.manage'); preparar();
      const valor = `gst_${sortear()}`;
      const k: ChaveRow = { id: novoId(), nome: dados.nome, inicio: valor.slice(0, 8), criadaEm: iso(agoraReal()), criadaPorId: S.me!.id, usadaEm: null, revogadaEm: null };
      A.chaves.push(k);
      auditar('create', 'ticket_api_key', `Criou a chave de API ${k.nome} (${k.inicio}…)`, k.id);
      // a chave aparece só agora: na prévia fica só o começo, como o servidor guarda
      return { chave: chaveParaTela(k), valor };
    },
    async revogarChave(id) {
      await ctx.wait(120); ctx.requirePerm('admin.manage'); preparar();
      const k = A.chaves.find((x) => x.id === id);
      if (!k) throw naoAchado('Chave');
      if (k.revogadaEm) return { ok: true };
      k.revogadaEm = iso(agoraReal());
      auditar('revoke', 'ticket_api_key', `Revogou a chave de API ${k.nome} (${k.inicio}…)`, k.id);
      return { ok: true };
    },
    async salvarSites(sites) {
      await ctx.wait(150);
      const dados = ler(SitesIframeSchema, { sites });
      ctx.requirePerm('admin.manage'); preparar();
      const antes = [...A.integ.sites];
      const limpos = [...new Set(dados.sites.map((s) => new URL(s).origin))];
      A.integ = { ...A.integ, sites: limpos };
      auditar('settings_atendimento_sites', 'settings', `Mudou os sites que podem abrir o Gestor dentro deles: ${limpos.join(', ') || 'nenhum (só o próprio Gestor)'}`, 'atendimento-integracoes', { before: { sites: antes }, after: { sites: limpos } });
      return { sites: limpos };
    },
    async salvarLinkConversa(linkConversa) {
      await ctx.wait(150);
      const dados = ler(LinkConversaSchema, { linkConversa });
      ctx.requirePerm('admin.manage'); preparar();
      const antes = A.integ.linkConversa;
      A.integ = { ...A.integ, linkConversa: dados.linkConversa };
      auditar('settings_atendimento_link', 'settings', dados.linkConversa ? `Mudou o link da conversa no LineChat: ${dados.linkConversa}` : 'Tirou o link da conversa no LineChat', 'atendimento-integracoes', { before: { linkConversa: antes }, after: { linkConversa: dados.linkConversa } });
      return { linkConversa: dados.linkConversa };
    },

    // ---- o mapa do robô do LineChat (2.0.1): as mesmas regras do servidor (o resolvedor é o do @gestor/shared) ----
    async robo() {
      await ctx.wait(80); ctx.requirePerm('admin.manage'); preparar();
      return JSON.parse(JSON.stringify({ mapa: A.mapaRobo, ultimo: A.ultimoRobo })) as RoboTela;
    },
    async salvarMapaDoRobo(mapa) {
      await ctx.wait(180);
      const dados = ler(MapaDoRoboSchema, mapa);
      ctx.requirePerm('admin.manage'); preparar();
      const antes = A.mapaRobo;
      const novo: MapaDoRobo = { ...dados, campos: Object.fromEntries(Object.entries(dados.campos).filter(([, t]) => t.trim())) };
      const mudou: string[] = [];
      if (antes.painel !== novo.painel) mudou.push('Painel');
      if (JSON.stringify(antes.parametros) !== JSON.stringify(novo.parametros)) mudou.push('Parâmetros');
      for (const c of CAMPOS_DO_MAPA) if (antes[c] !== novo[c]) mudou.push(NOME_CAMPO_DO_MAPA[c]);
      if (JSON.stringify(antes.campos) !== JSON.stringify(novo.campos)) mudou.push('Campos do painel');
      if (antes.mensagem !== novo.mensagem) mudou.push('Mensagem ao cliente');
      A.mapaRobo = novo;
      if (mudou.length) auditar('settings_atendimento_robo', 'settings', `Mudou o mapa do robô do LineChat: ${mudou.join(', ')}`, 'atendimento-robo', { before: antes, after: novo });
      return JSON.parse(JSON.stringify(novo)) as MapaDoRobo;
    },
    async experimentarRobo(mapa, corpo, endereco = {}) {
      await ctx.wait(120);
      const dados = ler(ExperimentarRoboSchema, { mapa, corpo, endereco });
      ctx.requirePerm('admin.manage'); preparar();
      // como no servidor: a chave (e o que não se escreve num caminho) não entra
      const p = aplicarMapaDoRobo(dados.mapa, dados.corpo, parametrosDoEndereco(dados.endereco));
      const resolvido = resolverPedidoDoRobo(p, {
        paineis: paineis(), assuntos: A.assuntos, campos: A.campos.map(campoParaTela),
        clientes: S.clients.filter((c) => !c.deletedAt).map((c) => ({ id: c.id, nome: c.tradeName })),
      });
      // a conversa já tem um chamado aberto (entrada ou andamento)? um pedido dela agora viraria anotação nele
      const aberto = p.sessaoId
        ? A.chamados.filter((t) => !t.deletedAt && t.sessaoId === p.sessaoId && ['entrada', 'andamento'].includes(etapaPorId(t.etapaId)?.tipo ?? ''))
          .sort((a, b) => b.criadoEm.localeCompare(a.criadoEm))[0]
        : undefined;
      return { resolvido, aberto: aberto ? { codigo: aberto.codigo, titulo: aberto.titulo } : null } satisfies PreviaDoRobo;
    },
  };

  // a lixeira da Administração (o demo.ts chama pelas funções exportadas lá em cima)
  instancia = {
    chamadosDoContato: (clienteId, whatsapp) => {
      semear();
      return A.chamados.filter((t) => !t.deletedAt && t.clienteId === clienteId && t.contatoTelefone === whatsapp).length;
    },
    lixeira: () => {
      semear();
      return A.chamados.filter((t) => t.deletedAt).map((t) => ({ type: 'ticket', id: t.id, label: `${t.codigo} · ${t.titulo}`, deletedAt: t.deletedAt! }));
    },
    restaurarDaLixeira: (id) => {
      semear();
      ctx.requirePerm('tickets.manage');
      const t = A.chamados.find((x) => x.id === id);
      if (!t) throw naoAchado('Chamado');
      if (t.deletedAt) {
        t.deletedAt = null; t.atualizadoEm = iso(agoraReal());
        registrarEvento(t.id, 'lixeira', eu(), { acao: 'restaurou' }, agoraReal());
      }
      auditar('restore', 'ticket', `Restaurou o chamado ${t.codigo} "${t.titulo}" da lixeira`, t.id);
      return { ok: true };
    },
    diagnostico: () => { semear(); return { erros: [...A.erros], chamados: A.chamados.length }; },
    calendario: {
      preparar, eu, atorDaPessoa, paineis, podeVerPainel,
      chamado: (id) => {
        semear();
        const t = A.chamados.find((x) => x.id === id && !x.deletedAt);
        return t ? { id: t.id, codigo: t.codigo, titulo: t.titulo, painelId: t.painelId, clienteId: t.clienteId } : null;
      },
      chamados: () => {
        semear();
        return A.chamados.filter((t) => !t.deletedAt).map((t) => ({ id: t.id, codigo: t.codigo, titulo: t.titulo, painelId: t.painelId, clienteId: t.clienteId }));
      },
      negociacao: (ref) => {
        semear();
        const codigo = ref.trim().toUpperCase();
        const t = A.chamados.find((x) => (x.id === ref || x.codigo === codigo) && !x.deletedAt);
        if (!t) return null;
        const r = etapaPorId(t.etapaId)?.resultado ?? null;
        return {
          id: t.id, codigo: t.codigo, titulo: t.titulo, painelId: t.painelId, empresa: nomeCliente(t.clienteId) ?? t.empresa,
          resultado: r === 'ganho' || r === 'perdido' ? r : null,
        };
      },
      avisarDoCalendario: (a, em, lido = false) => {
        const qual = a.qual ?? 'lembrete';
        const canais = A.whats.eventos[qual] ?? AVISOS_CHAMADOS_PADRAO.eventos[qual];
        const quem = S.users.filter((u) => a.para.includes(u.id) && u.active);
        if (canais.tela) {
          for (const u of quem) A.avisos.push({ id: novoId(), userId: u.id, chamadoId: null, evento: { ...a.evento }, tipo: qual, texto: a.texto, em: iso(em), lidoEm: lido ? iso(em) : null });
        }
        return quem.length;
      },
    },
  };

  return api;
}
