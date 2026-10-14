/**
 * O WhatsApp dos chamados (Patch 2.0): a API de mensagens da plataforma do LineChat — a mesma do
 * envio automático do PDF (`{from, to, body: {text}}` com o Bearer), confirmada em produção em 05/10.
 * A referência é a da Helena (`POST /chat/v1/message/send`, conferida em 12/10): `body` leva `text`, ou
 * `templateId` + `parameters` (+ `fileUrl`, o arquivo do cabeçalho); `department` e `user` dizem quem
 * fica com a conversa que a mensagem abrir; `/send-sync` espera o WhatsApp responder (até 25 s).
 *
 * Dois números, os dois ligados no LineChat:
 *  - o do **cliente** é o oficial (3034-8350): só sai quando o atendente manda (a escolha do Luan:
 *    "só quando o atendente quiser"), e pelo **modelo aprovado** (o pedido dele na prévia: "vou usar
 *    no meu WhatsApp oficial, então temos que usar os templates pré-criados") — o WhatsApp oficial só
 *    começa conversa com modelo. No texto livre (a outra escolha), passou de 24 h, vai o modelo;
 *  - o da **equipe** é um número não oficial: os avisos de quem recebeu um chamado, do prazo vencendo,
 *    do Crítico que chegou. A sessão vai escondida, para não virar conversa no LineChat.
 *
 * A chave é a do LineChat (a mesma da leitura dos chamados), ou uma própria, no cofre.
 */
import type { Db } from '@gestor/db';
import {
  AVISOS_CHAMADOS_PADRAO, TIPOS_ARQUIVO_DO_MODELO, faltaNoModeloAprovado, conversaEmTexto, lerMensagemDoLineChat, numeroWhatsApp, parametrosDoModelo,
  mensagemAoCliente, preencherModelo, telefoneLegivel, type AvisosChamadosTela, type OpcoesAtendimento, type ModeloAprovado, type ModeloDoLineChat, type ModelosDoLineChat, type TipoArquivoDoModelo,
  type ValoresDaMensagem,
} from '@gestor/shared';
import { BadRequest } from '../../plugins/errors.js';
import * as integ from '../integracoes.js';
import { clienteDaApi } from '../linechat.js';
import type { SecretsVault } from '../secrets.js';

/** O que fica guardado em `settings.atendimento-avisos` (a chave própria fica no cofre). */
export type AvisosGuardados = Omit<AvisosChamadosTela, 'temChavePropria' | 'temChaveLineChat' | 'pessoas'> & {
  pessoas: Array<{ userId: string; numero: string; ativo: boolean }>;
};

type Ferramentas = { fetchFn: typeof fetch };
let ferramentas: Ferramentas = { fetchFn: (...a) => fetch(...a) };
/** Os testes trocam o fetch (nada sai do servidor de verdade). */
export function trocarFerramentasWhatsApp(f: Partial<Ferramentas>) { ferramentas = { ...ferramentas, ...f }; }
export const fetchDoWhatsApp = () => ferramentas.fetchFn;

export async function lerAvisos(db: Db): Promise<{ valor: AvisosGuardados; temChavePropria: boolean }> {
  const { valor, temSegredo } = await integ.ler<AvisosGuardados>(db, 'atendimento-avisos');
  return {
    valor: { ...AVISOS_CHAMADOS_PADRAO, ...valor, eventos: { ...AVISOS_CHAMADOS_PADRAO.eventos, ...(valor.eventos ?? {}) }, pessoas: valor.pessoas ?? [] },
    temChavePropria: temSegredo,
  };
}

/** Grava só o resultado do teste, sem mexer no que a administração configurou. */
export async function gravarTeste(db: Db, ok: boolean, mensagem: string) {
  const { valor } = await lerAvisos(db);
  // sem `secretId`, o `gravar` mantém a chave própria guardada
  await integ.gravar(db, 'atendimento-avisos', { ...valor, ultimoTesteEm: new Date().toISOString(), ultimoTesteOk: ok, ultimoTesteMsg: mensagem });
}

async function chaveDoEnvio(db: Db, vault: SecretsVault, v: AvisosGuardados): Promise<string | null> {
  return v.usarChaveDoLineChat ? integ.segredo(db, vault, 'linechat') : integ.segredo(db, vault, 'atendimento-avisos');
}

export type ResultadoWhatsApp = { ok: true; mensagem: string; modelo: boolean } | { ok: false; mensagem: string };

type Resposta = { ok: boolean; status: number; texto: string; corpo: string };

async function chamar(url: string, token: string, metodo: 'GET' | 'POST', corpo?: unknown): Promise<Resposta> {
  const auth = /^bearer\s/i.test(token) ? token : `Bearer ${token}`;
  try {
    const r = await ferramentas.fetchFn(url, {
      method: metodo, headers: { ...(corpo !== undefined ? { 'Content-Type': 'application/json' } : {}), Accept: 'application/json', Authorization: auth },
      ...(corpo !== undefined ? { body: JSON.stringify(corpo) } : {}), signal: AbortSignal.timeout(30_000),
    });
    const todo = await r.text().catch(() => '');
    return { ok: r.ok, status: r.status, texto: todo.slice(0, 300), corpo: todo };
  } catch (e) {
    const motivo = e instanceof Error ? (e.name === 'TimeoutError' ? 'não respondeu em 30 segundos' : e.message) : String(e);
    return { ok: false, status: 0, texto: `não consegui falar com o LineChat (${motivo})`, corpo: '' };
  }
}
const postar = (url: string, token: string, corpo: unknown) => chamar(url, token, 'POST', corpo);

/** O endereço que espera o WhatsApp responder (até 25 s): ".../send" vira ".../send-sync". */
export const enderecoSincrono = (url: string) => url.replace(/\/send\/?$/i, '/send-sync');

/** O JSON da resposta (vazio quando não é JSON). */
function lerJson(r: Resposta): Record<string, unknown> {
  try { const j = JSON.parse(r.corpo) as unknown; return j && typeof j === 'object' && !Array.isArray(j) ? (j as Record<string, unknown>) : {}; } catch { return {}; }
}

const mensagemDoErro = (r: { status: number; texto: string }) =>
  r.status === 401 || r.status === 403 ? `O LineChat recusou a chave (${r.status}). Confira em Chamados › Ajustes › Avisos.`
    : r.status === 0 ? `${r.texto[0]!.toUpperCase()}${r.texto.slice(1)}. Confira o endereço da API.`
      : `O LineChat respondeu ${r.status}${r.texto ? `: ${r.texto}` : ''}`;

/** O que o envio respondeu, em português: o `send-sync` diz se o WhatsApp mandou ou recusou. */
function resultadoDoEnvio(r: Resposta, modelo: boolean): ResultadoWhatsApp {
  if (!r.ok) return { ok: false, mensagem: mensagemDoErro(r) };
  const j = lerJson(r);
  const situacao = typeof j.status === 'string' ? j.status.toUpperCase() : '';
  const motivo = [j.failedReason, j.failureReason].find((x): x is string => typeof x === 'string' && !!x.trim());
  if (situacao === 'FAILED') return { ok: false, mensagem: `O WhatsApp não mandou${motivo ? `: ${motivo}` : ''}.` };
  const com = modelo ? ' com o modelo aprovado' : '';
  return {
    ok: true, modelo,
    mensagem: ['SENT', 'DELIVERED', 'READ'].includes(situacao) ? `Mandado${com} (o WhatsApp confirmou: ${situacao}).`
      : situacao ? `Aceito pelo LineChat${com}; o WhatsApp ainda não confirmou (${situacao}).` : `Aceito pelo LineChat${com} (${r.status}).`,
  };
}

/** O `body` do modelo aprovado: o id, as variáveis preenchidas com o chamado e o arquivo do cabeçalho. */
function corpoDoModelo(m: ModeloAprovado, valores: ValoresDaMensagem) {
  return {
    templateId: m.id,
    ...(m.variaveis.length ? { parameters: parametrosDoModelo(m, valores) } : {}),
    ...(m.tipoArquivo !== 'UNDEFINED' && m.arquivo ? { fileUrl: m.arquivo } : {}),
  };
}

/** Por que o modelo aprovado ainda não serve (nulo = pronto). */
const faltaNoModelo = (v: Pick<AvisosGuardados, 'template'>) => faltaNoModeloAprovado(v.template);

/**
 * Manda uma mensagem. `de`: o número do cliente (o oficial) ou o da equipe. Para a equipe, o `texto` vai
 * como está, escondido. Para o cliente, saem os `valores` do chamado: pelo modelo aprovado (as variáveis
 * dele), ou no texto livre dos Ajustes — e, recusado o texto livre (passou de 24 h), pelo modelo. `quem`:
 * quem manda (com "quem manda fica com a conversa", o e-mail vai no `user.email`).
 */
export async function mandarWhatsApp(
  db: Db, vault: SecretsVault,
  p: { de: 'cliente' | 'equipe'; para: string; texto: string; valores?: ValoresDaMensagem; quem?: { email: string | null } | null },
): Promise<ResultadoWhatsApp> {
  const { valor: v } = await lerAvisos(db);
  if (!v.ativo) return { ok: false, mensagem: 'O WhatsApp dos chamados está desligado (Chamados › Ajustes › Avisos).' };
  const de = p.de === 'cliente' ? v.numeroCliente : v.numeroEquipe;
  if (!de) return { ok: false, mensagem: `Falta o número que envia para ${p.de === 'cliente' ? 'o cliente' : 'a equipe'} (Chamados › Ajustes › Avisos).` };
  const para = numeroWhatsApp(p.para);
  if (!para) return { ok: false, mensagem: `O número ${p.para} não é um WhatsApp válido.` };
  if (p.de === 'cliente' && v.envioCliente === 'modelo') {
    const falta = faltaNoModelo(v);
    if (falta) return { ok: false, mensagem: falta };
  }
  const token = await chaveDoEnvio(db, vault, v);
  if (!token) return { ok: false, mensagem: v.usarChaveDoLineChat ? 'Falta a chave do LineChat (Administração › Ajustes › Chamados do LineChat).' : 'Falta a chave da API (Chamados › Ajustes › Avisos).' };

  // a equipe: o texto, escondido (não vira conversa no LineChat)
  if (p.de === 'equipe') return resultadoDoEnvio(await postar(v.url, token, { from: de, to: para, body: { text: p.texto }, options: { hiddenSession: true } }), false);

  // o cliente: espera o WhatsApp responder, e a conversa que a mensagem abrir vai para quem os Ajustes dizem
  const valores: ValoresDaMensagem = p.valores ?? { texto: p.texto };
  const url = enderecoSincrono(v.url);
  const quemFica = {
    ...(v.equipeLineChat ? { department: { name: v.equipeLineChat } } : {}),
    ...(v.atribuirAQuemManda && p.quem?.email ? { user: { email: p.quem.email } } : {}),
  };
  if (v.envioCliente === 'modelo') return resultadoDoEnvio(await postar(url, token, { from: de, to: para, body: corpoDoModelo(v.template!, valores), ...quemFica }), true);
  const texto = await postar(url, token, { from: de, to: para, body: { text: preencherModelo(v.modeloCliente, valores) }, ...quemFica });
  const livre = resultadoDoEnvio(texto, false);
  if (livre.ok) return livre;
  // o texto livre foi recusado: a conversa com o cliente pode ter passado de 24 h — com o modelo aprovado, tenta de novo
  if (!faltaNoModelo(v) && texto.status !== 401 && texto.status !== 403 && texto.status !== 0) {
    const comModelo = resultadoDoEnvio(await postar(url, token, { from: de, to: para, body: corpoDoModelo(v.template!, valores), ...quemFica }), true);
    return comModelo.ok ? comModelo : { ok: false, mensagem: `${livre.mensagem} — e com o modelo aprovado: ${comModelo.mensagem}` };
  }
  return livre;
}

/** Os números que estão prontos (a tela mostra os botões só quando dá para mandar). */
export async function whatsAppPronto(db: Db): Promise<OpcoesAtendimento['whatsapp']> {
  const { valor: v, temChavePropria } = await lerAvisos(db);
  const temChave = v.usarChaveDoLineChat ? (await integ.ler(db, 'linechat')).temSegredo : temChavePropria;
  // pelo modelo aprovado, o cliente só fica pronto com o modelo escolhido (e o arquivo, se ele tiver)
  const modeloOk = v.envioCliente === 'texto' || !faltaNoModelo(v);
  const cliente = v.ativo && temChave && !!v.numeroCliente && modeloOk;
  return { cliente, equipe: v.ativo && temChave && !!v.numeroEquipe, mensagemCliente: cliente ? mensagemAoCliente(v) : null };
}

// =====================================================================
//  OS MODELOS APROVADOS DO LINECHAT (para escolher nos Ajustes)
// =====================================================================

type CanalDaApi = { id?: string; active?: boolean; type?: string; number?: string | null };
type ModeloDaApi = {
  id?: string; name?: string | null; text?: string | null; footerText?: string | null; status?: string; active?: boolean; archived?: boolean;
  params?: Array<{ name?: string | null }> | null; fileType?: string | null; categoryName?: string | null;
};

/**
 * Os modelos aprovados do número oficial, lidos do LineChat com a chave guardada: o canal do número
 * (`GET /chat/v1/channel`) e os modelos dele (`GET /chat/v1/template?ChannelId=…&ApprovedOnly=true`).
 */
export async function modelosDoLineChat(db: Db, vault: SecretsVault): Promise<ModelosDoLineChat> {
  const { valor: v } = await lerAvisos(db);
  if (!v.numeroCliente) throw new BadRequest('Falta o número para o cliente (o oficial): salve o número antes de buscar os modelos.');
  const token = await chaveDoEnvio(db, vault, v);
  if (!token) throw new BadRequest(v.usarChaveDoLineChat ? 'Falta a chave do LineChat (Administração › Ajustes › Chamados do LineChat).' : 'Falta a chave da API: salve a chave antes de buscar os modelos.');
  let base: string;
  try { base = new URL(v.url).origin; } catch { throw new BadRequest('O endereço da API de mensagens está inválido.'); }

  const canais = await chamar(`${base}/chat/v1/channel?ChannelType=Whatsapp`, token, 'GET');
  if (!canais.ok) throw new BadRequest(`Não consegui ler os canais do LineChat: ${mensagemDoErro(canais)}`);
  let lista: CanalDaApi[] = [];
  try { const j = JSON.parse(canais.corpo) as unknown; lista = Array.isArray(j) ? (j as CanalDaApi[]) : []; } catch { /* fica vazia */ }
  const canal = lista.find((c) => c.id && numeroWhatsApp(c.number ?? '') === v.numeroCliente);
  if (!canal?.id) throw new BadRequest(`O número ${telefoneLegivel(v.numeroCliente)} não está entre os canais de WhatsApp do LineChat. Confira o número para o cliente.`);

  const modelos: ModeloDoLineChat[] = [];
  for (let pagina = 1; pagina <= 5; pagina++) {
    const q = new URLSearchParams({ ChannelId: canal.id, ApprovedOnly: 'true', PageSize: '100', PageNumber: String(pagina) });
    q.append('IncludeDetails', 'Params');
    const r = await chamar(`${base}/chat/v1/template?${q.toString()}`, token, 'GET');
    if (!r.ok) throw new BadRequest(`Não consegui ler os modelos do LineChat: ${mensagemDoErro(r)}`);
    const j = lerJson(r) as { items?: ModeloDaApi[]; hasMorePages?: boolean };
    for (const m of j.items ?? []) {
      if (!m.id || m.archived || m.active === false || (m.status && m.status !== 'Approved')) continue;
      const tipo = (TIPOS_ARQUIVO_DO_MODELO as readonly string[]).includes(String(m.fileType ?? '').toUpperCase()) ? (String(m.fileType).toUpperCase() as TipoArquivoDoModelo) : 'UNDEFINED';
      modelos.push({
        id: m.id, nome: m.name?.trim() || m.id, texto: m.text ?? '', rodape: m.footerText?.trim() || null,
        variaveis: [...new Set((m.params ?? []).map((x) => x.name?.trim()).filter((x): x is string => !!x))],
        tipoArquivo: tipo, categoria: m.categoryName?.trim() || null,
      });
    }
    if (!j.hasMorePages) break;
  }
  modelos.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  return { canal: { id: canal.id, numero: v.numeroCliente, oficial: /cloudapi|dialog360|gupshup/i.test(canal.type ?? '') }, modelos };
}

/**
 * A conversa de uma sessão do LineChat, em texto, para a IA (as últimas mensagens primeiro, se não
 * couber tudo). Lê a API do LineChat com a chave da leitura dos chamados.
 */
export async function conversaDaSessao(db: Db, vault: SecretsVault, sessaoId: string): Promise<string> {
  const { api } = await clienteDaApi(db, vault, ferramentas.fetchFn);
  const mensagens: Array<{ deCliente: boolean; texto: string; em: string | null }> = [];
  for (let pagina = 1; pagina <= 5; pagina++) {
    const r = await api.get<{ items?: unknown[]; hasMorePages?: boolean }>('chat/v1/message', {
      SessionId: sessaoId, PageNumber: pagina, PageSize: 100, OrderBy: 'CreatedAt', OrderDirection: 'ASCENDING',
    });
    for (const m of r.items ?? []) { const lida = lerMensagemDoLineChat(m); if (lida) mensagens.push(lida); }
    if (!r.hasMorePages) break;
  }
  return conversaEmTexto(mensagens);
}
