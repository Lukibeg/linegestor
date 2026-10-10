/**
 * O WhatsApp dos chamados (Patch 1.10): a API de mensagens da plataforma do LineChat — a mesma do
 * envio automático do PDF (`{from, to, body: {text}}` com o Bearer), confirmada em produção em 05/10.
 *
 * Dois números, os dois ligados no LineChat:
 *  - o do **cliente** é o oficial (3034-8350): só sai quando o atendente manda (a escolha do Luan:
 *    "só quando o atendente quiser"). Se a conversa com o cliente passou de 24 h, a mensagem solta é
 *    recusada pelo WhatsApp: com o modelo aprovado configurado, o Gestor tenta de novo com ele;
 *  - o da **equipe** é um número não oficial: os avisos de quem recebeu um chamado, do prazo vencendo,
 *    do Crítico que chegou. A sessão vai escondida, para não virar conversa no LineChat.
 *
 * A chave é a do LineChat (a mesma da leitura dos chamados), ou uma própria, no cofre.
 */
import type { Db } from '@gestor/db';
import { AVISOS_CHAMADOS_PADRAO, conversaEmTexto, lerMensagemDoLineChat, numeroWhatsApp, type AvisosChamadosTela } from '@gestor/shared';
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

async function postar(url: string, token: string, corpo: unknown): Promise<{ ok: boolean; status: number; texto: string }> {
  const auth = /^bearer\s/i.test(token) ? token : `Bearer ${token}`;
  try {
    const r = await ferramentas.fetchFn(url, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json', Authorization: auth },
      body: JSON.stringify(corpo), signal: AbortSignal.timeout(30_000),
    });
    return { ok: r.ok, status: r.status, texto: (await r.text().catch(() => '')).slice(0, 300) };
  } catch (e) {
    const motivo = e instanceof Error ? (e.name === 'TimeoutError' ? 'não respondeu em 30 segundos' : e.message) : String(e);
    return { ok: false, status: 0, texto: `não consegui falar com o LineChat (${motivo})` };
  }
}

const mensagemDoErro = (r: { status: number; texto: string }) =>
  r.status === 401 || r.status === 403 ? `O LineChat recusou a chave (${r.status}). Confira em Chamados › Ajustes › Avisos.`
    : r.status === 0 ? `${r.texto[0]!.toUpperCase()}${r.texto.slice(1)}. Confira o endereço da API.`
      : `O LineChat respondeu ${r.status}${r.texto ? `: ${r.texto}` : ''}`;

/**
 * Manda uma mensagem. `de`: o número do cliente (o oficial) ou o da equipe. `modelo`: os valores
 * para o modelo aprovado (só para o cliente), usado se a mensagem solta for recusada.
 */
export async function mandarWhatsApp(
  db: Db, vault: SecretsVault,
  p: { de: 'cliente' | 'equipe'; para: string; texto: string; modelo?: { codigo: string; contato: string | null; texto: string } },
): Promise<ResultadoWhatsApp> {
  const { valor: v } = await lerAvisos(db);
  if (!v.ativo) return { ok: false, mensagem: 'O WhatsApp dos chamados está desligado (Chamados › Ajustes › Avisos).' };
  const de = p.de === 'cliente' ? v.numeroCliente : v.numeroEquipe;
  if (!de) return { ok: false, mensagem: `Falta o número que envia para ${p.de === 'cliente' ? 'o cliente' : 'a equipe'} (Chamados › Ajustes › Avisos).` };
  const para = numeroWhatsApp(p.para);
  if (!para) return { ok: false, mensagem: `O número ${p.para} não é um WhatsApp válido.` };
  const token = await chaveDoEnvio(db, vault, v);
  if (!token) return { ok: false, mensagem: v.usarChaveDoLineChat ? 'Falta a chave do LineChat (Administração › Ajustes › Chamados do LineChat).' : 'Falta a chave da API (Chamados › Ajustes › Avisos).' };

  const texto = await postar(v.url, token, {
    from: de, to: para, body: { text: p.texto },
    // o aviso da equipe não vira conversa no LineChat
    ...(p.de === 'equipe' ? { options: { hiddenSession: true } } : {}),
  });
  if (texto.ok) return { ok: true, mensagem: `Aceito pelo LineChat (${texto.status}).`, modelo: false };
  // a mensagem solta foi recusada: a conversa com o cliente pode ter passado de 24 h — com o modelo aprovado, tenta de novo
  if (p.de === 'cliente' && p.modelo && v.template?.id && texto.status !== 401 && texto.status !== 403 && texto.status !== 0) {
    const parametros: Record<string, string> = {};
    if (v.template.parametroCodigo) parametros[v.template.parametroCodigo] = p.modelo.codigo;
    if (v.template.parametroTexto) parametros[v.template.parametroTexto] = p.modelo.texto;
    if (v.template.parametroContato) parametros[v.template.parametroContato] = p.modelo.contato || 'cliente';
    const modelo = await postar(v.url, token, { from: de, to: para, body: { templateId: v.template.id, ...(Object.keys(parametros).length ? { parameters: parametros } : {}) } });
    if (modelo.ok) return { ok: true, mensagem: `Aceito pelo LineChat com o modelo aprovado (${modelo.status}).`, modelo: true };
    return { ok: false, mensagem: `${mensagemDoErro(texto)} — e com o modelo aprovado: ${mensagemDoErro(modelo)}` };
  }
  return { ok: false, mensagem: mensagemDoErro(texto) };
}

/** Os números que estão prontos (a tela mostra os botões só quando dá para mandar). */
export async function whatsAppPronto(db: Db): Promise<{ cliente: boolean; equipe: boolean }> {
  const { valor: v, temChavePropria } = await lerAvisos(db);
  const temChave = v.usarChaveDoLineChat ? (await integ.ler(db, 'linechat')).temSegredo : temChavePropria;
  return { cliente: v.ativo && temChave && !!v.numeroCliente, equipe: v.ativo && temChave && !!v.numeroEquipe };
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
