/**
 * As integrações que a pessoa liga pela tela, sem mexer em arquivo no servidor:
 *
 *  1. **Backup no Google Drive** — o backup diário sobe para uma pasta do Drive da empresa,
 *     usando uma "conta de serviço" do Google (uma conta de robô, que não expira e não
 *     depende de ninguém continuar na empresa).
 *  2. **Avisos** — quando o sistema cai ou o backup falha, manda uma mensagem para um endereço
 *     que você escolhe. No nosso caso, a API do LineChat, que entrega no WhatsApp.
 *  3. **Chamados do LineChat** — o token e o painel de onde a sincronização lê os chamados de
 *     suporte (o resto dessa integração mora em `linechat.ts`).
 *
 * A mesma tabela guarda a **arrumação da tela de Chamados** (`chamados-painel`): não é uma
 * integração, mas é um ajuste da tela que vale para a equipe toda, com quem mexeu e quando.
 *
 * O que é segredo (a chave da conta de serviço, o token da API) vai para o cofre cifrado.
 * O resto fica em `settings.value`, em JSON.
 *
 * Por que também escrevemos arquivos em disco: o vigia que checa se o sistema está de pé roda
 * FORA do sistema (senão não teria como avisar quando ele cai). Então, toda vez que os ajustes
 * são salvos, gravamos uma cópia pronta para uso em `CONFIG_DIR` — assim o script de fora não
 * precisa saber nada de banco nem de criptografia.
 */
import { createSign, randomUUID } from 'node:crypto';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import { secrets, settings, type Db } from '@gestor/db';
import type { ItemPainel } from '@gestor/shared';
import type { SecretsVault } from './secrets.js';

export const CONFIG_DIR = process.env.CONFIG_DIR ?? '/dados';

// ---------- o que fica guardado ----------

export type AjustesBackup = {
  ativo: boolean;
  /** Nome da pasta no Drive; usado só para mostrar na tela */
  pasta: string;
  /** Id da pasta no Drive (o pedaço final do endereço quando você abre a pasta no navegador) */
  pastaId: string;
  /** E-mail da conta de serviço — preenchido a partir da chave, para conferência na tela */
  contaDeServico: string;
  /** Resultado do último envio, para a tela mostrar sem ninguém precisar entrar no servidor */
  ultimoEnvioEm: string | null;
  ultimoEnvioOk: boolean | null;
  ultimoEnvioMsg: string | null;
};

export type AjustesAvisos = {
  ativo: boolean;
  url: string;
  metodo: 'POST' | 'GET';
  /** Cabeçalhos extras, em JSON. O token entra aqui como {{token}} */
  cabecalhos: string;
  /** Corpo da requisição. {{mensagem}} é trocado pelo texto do aviso */
  corpo: string;
  ultimoTesteEm: string | null;
  ultimoTesteOk: boolean | null;
  ultimoTesteMsg: string | null;
};

const BACKUP_PADRAO: AjustesBackup = {
  ativo: false, pasta: '', pastaId: '', contaDeServico: '',
  ultimoEnvioEm: null, ultimoEnvioOk: null, ultimoEnvioMsg: null,
};
const AVISOS_PADRAO: AjustesAvisos = {
  ativo: false,
  url: '',
  metodo: 'POST',
  cabecalhos: '{\n  "Content-Type": "application/json",\n  "Authorization": "Bearer {{token}}"\n}',
  corpo: '{\n  "numero": "5571999999999",\n  "mensagem": "{{mensagem}}"\n}',
  ultimoTesteEm: null, ultimoTesteOk: null, ultimoTesteMsg: null,
};

/**
 * Chamados do LineChat: de onde a sincronização lê, e como foi a última vez.
 * O token fica no cofre; aqui só o que pode aparecer na tela.
 */
export type AjustesLineChat = {
  ativo: boolean;
  /** A API (https://api.inglinechat.com.br) */
  url: string;
  /** Onde a equipe abre os cards (https://inglinechat.com.br) — para o link da tabela */
  appUrl: string;
  painelId: string;
  painelNome: string;
  /** A primeira sincronização completa: antes dela não há histórico de etapas, só estimativa */
  inicioEm: string | null;
  /** Início da última sincronização que deu certo — a próxima pede ao LineChat o que mudou desde então */
  marcoEm: string | null;
  ultimaEm: string | null;
  ultimaOk: boolean | null;
  ultimaMsg: string | null;
  ultimaCompletaEm: string | null;
  /** Quantas vezes seguidas falhou (para avisar uma vez, e não a cada minuto) */
  falhasSeguidas: number;
};

export const LINECHAT_PADRAO: AjustesLineChat = {
  ativo: false,
  url: 'https://api.inglinechat.com.br',
  appUrl: 'https://inglinechat.com.br',
  painelId: '', painelNome: '',
  inicioEm: null, marcoEm: null,
  ultimaEm: null, ultimaOk: null, ultimaMsg: null, ultimaCompletaEm: null,
  falhasSeguidas: 0,
};

/** A arrumação da tela de Chamados: vazia = a de fábrica (ver `montarPainel` em @gestor/shared). */
export type AjustesPainelChamados = { itens: ItemPainel[] };

type Assunto = 'backup' | 'avisos' | 'linechat' | 'chamados-painel';
const PADROES: Record<Assunto, unknown> = { backup: BACKUP_PADRAO, avisos: AVISOS_PADRAO, linechat: LINECHAT_PADRAO, 'chamados-painel': { itens: [] } };

export async function ler<T>(db: Db, assunto: Assunto): Promise<{ valor: T; secretId: string | null; temSegredo: boolean }> {
  const [row] = await db.select().from(settings).where(eq(settings.id, assunto)).limit(1);
  const padrao = PADROES[assunto] as T;
  if (!row) return { valor: padrao, secretId: null, temSegredo: false };
  let valor: T;
  try { valor = { ...padrao, ...(JSON.parse(row.value) as object) } as T; } catch { valor = padrao; }
  return { valor, secretId: row.secretId, temSegredo: !!row.secretId };
}

export async function gravar(db: Db, assunto: Assunto, valor: unknown, opts?: { secretId?: string | null; userId?: string | null }) {
  const existente = await db.select({ id: settings.id, secretId: settings.secretId }).from(settings).where(eq(settings.id, assunto)).limit(1);
  const secretId = opts?.secretId !== undefined ? opts.secretId : existente[0]?.secretId ?? null;
  const linha = { id: assunto, value: JSON.stringify(valor), secretId, updatedAt: new Date(), updatedBy: opts?.userId ?? null };
  if (existente.length) await db.update(settings).set(linha).where(eq(settings.id, assunto));
  else await db.insert(settings).values(linha);
}

/** O segredo guardado no cofre para um assunto (a chave do Google, o token da API). */
export async function segredo(db: Db, vault: SecretsVault, assunto: Assunto): Promise<string | null> {
  const [row] = await db.select({ secretId: settings.secretId }).from(settings).where(eq(settings.id, assunto)).limit(1);
  if (!row?.secretId) return null;
  const [s] = await db.select().from(secrets).where(eq(secrets.id, row.secretId)).limit(1);
  if (!s) return null;
  return vault.decrypt(s);
}

// ---------- Google Drive, direto na API ----------

type ChaveDeServico = { client_email: string; private_key: string; project_id?: string };

export function lerChaveDeServico(texto: string): ChaveDeServico {
  let j: any;
  try { j = JSON.parse(texto); } catch { throw new Error('Isso não parece um arquivo JSON. Envie o arquivo de chave que o Google baixou.'); }
  if (j.type !== 'service_account') throw new Error('Este JSON não é de uma conta de serviço (falta "type": "service_account").');
  if (!j.client_email || !j.private_key) throw new Error('Faltam "client_email" ou "private_key" no arquivo.');
  return j as ChaveDeServico;
}

/**
 * Troca a chave da conta de serviço por um passe de acesso de 1 hora.
 * É o fluxo JWT do próprio Google: a gente assina um bilhete com a chave privada e ele devolve
 * o passe. Sem biblioteca — são duas chamadas e uma assinatura RS256.
 */
async function passeDoGoogle(chave: ChaveDeServico): Promise<string> {
  const agora = Math.floor(Date.now() / 1000);
  const cabecalho = { alg: 'RS256', typ: 'JWT' };
  const corpo = {
    iss: chave.client_email,
    scope: 'https://www.googleapis.com/auth/drive.file',
    aud: 'https://oauth2.googleapis.com/token',
    iat: agora,
    exp: agora + 3600,
  };
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const semAssinatura = `${b64(cabecalho)}.${b64(corpo)}`;
  const assinatura = createSign('RSA-SHA256').update(semAssinatura).sign(chave.private_key.replace(/\\n/g, '\n')).toString('base64url');

  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${semAssinatura}.${assinatura}` }),
  });
  const j = (await r.json()) as { access_token?: string; error_description?: string; error?: string };
  if (!r.ok || !j.access_token) throw new Error(`O Google recusou a chave: ${j.error_description ?? j.error ?? r.status}`);
  return j.access_token;
}

/** Manda um arquivo para a pasta do Drive. Devolve o id do arquivo lá. */
export async function enviarParaDrive(chaveJson: string, pastaId: string, nome: string, conteudo: Buffer): Promise<string> {
  const passe = await passeDoGoogle(lerChaveDeServico(chaveJson));
  const limite = `----gestao${randomUUID()}`;
  const meta = JSON.stringify({ name: nome, parents: pastaId ? [pastaId] : undefined });
  const corpo = Buffer.concat([
    Buffer.from(`--${limite}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n`),
    Buffer.from(`--${limite}\r\nContent-Type: application/gzip\r\n\r\n`),
    conteudo,
    Buffer.from(`\r\n--${limite}--\r\n`),
  ]);
  const r = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true', {
    method: 'POST',
    headers: { Authorization: `Bearer ${passe}`, 'Content-Type': `multipart/related; boundary=${limite}` },
    body: corpo,
  });
  const j = (await r.json()) as { id?: string; error?: { message?: string } };
  if (!r.ok || !j.id) throw new Error(`O Drive recusou o envio: ${j.error?.message ?? r.status}`);
  return j.id;
}

/** Apaga da pasta do Drive o que passou de `dias`, para a pasta não crescer sem fim. */
export async function limparDrive(chaveJson: string, pastaId: string, dias = 60): Promise<number> {
  const passe = await passeDoGoogle(lerChaveDeServico(chaveJson));
  const limite = new Date(Date.now() - dias * 86400000).toISOString();
  const busca = new URLSearchParams({
    q: `'${pastaId}' in parents and trashed = false and createdTime < '${limite}'`,
    fields: 'files(id,name)', pageSize: '100', supportsAllDrives: 'true', includeItemsFromAllDrives: 'true',
  });
  const r = await fetch(`https://www.googleapis.com/drive/v3/files?${busca}`, { headers: { Authorization: `Bearer ${passe}` } });
  if (!r.ok) return 0;
  const { files = [] } = (await r.json()) as { files?: Array<{ id: string }> };
  let apagados = 0;
  for (const f of files) {
    const d = await fetch(`https://www.googleapis.com/drive/v3/files/${f.id}?supportsAllDrives=true`, { method: 'DELETE', headers: { Authorization: `Bearer ${passe}` } });
    if (d.ok) apagados++;
  }
  return apagados;
}

/** Confere se a chave abre e se a pasta existe — é o botão "Testar" da tela. */
export async function testarDrive(chaveJson: string, pastaId: string): Promise<string> {
  const chave = lerChaveDeServico(chaveJson);
  const passe = await passeDoGoogle(chave);
  const r = await fetch(`https://www.googleapis.com/drive/v3/files/${pastaId}?fields=id,name,mimeType&supportsAllDrives=true`, { headers: { Authorization: `Bearer ${passe}` } });
  if (r.status === 404) throw new Error(`A conta de serviço (${chave.client_email}) não enxerga essa pasta. Compartilhe a pasta do Drive com esse e-mail, como Editor.`);
  const j = (await r.json()) as { name?: string; mimeType?: string; error?: { message?: string } };
  if (!r.ok) throw new Error(j.error?.message ?? `O Google respondeu ${r.status}`);
  if (j.mimeType !== 'application/vnd.google-apps.folder') throw new Error('Esse id não é de uma pasta.');
  const id = await enviarParaDrive(chaveJson, pastaId, `teste-do-gestao-${new Date().toISOString().slice(0, 19)}.txt`, Buffer.from('Teste do Ingline Gestão. Pode apagar.'));
  return `Pasta "${j.name}" encontrada e arquivo de teste enviado (${id}).`;
}

// ---------- avisos (WhatsApp pelo LineChat, ou qualquer outra API) ----------

export function montarAviso(a: AjustesAvisos, token: string | null, mensagem: string) {
  const trocar = (t: string) => t.replaceAll('{{mensagem}}', mensagem.replace(/["\\\n]/g, ' ')).replaceAll('{{token}}', token ?? '');
  let cabecalhos: Record<string, string> = {};
  try { cabecalhos = JSON.parse(trocar(a.cabecalhos || '{}')); } catch { throw new Error('Os cabeçalhos não são um JSON válido.'); }
  const corpo = a.metodo === 'GET' ? undefined : trocar(a.corpo || '');
  return { url: trocar(a.url), metodo: a.metodo, cabecalhos, corpo };
}

export async function enviarAviso(a: AjustesAvisos, token: string | null, mensagem: string): Promise<string> {
  if (!a.url) throw new Error('Informe o endereço (URL) da API de avisos.');
  const { url, metodo, cabecalhos, corpo } = montarAviso(a, token, mensagem);
  const r = await fetch(url, { method: metodo, headers: cabecalhos, body: corpo, signal: AbortSignal.timeout(15000) });
  const texto = (await r.text().catch(() => '')).slice(0, 300);
  if (!r.ok) throw new Error(`A API respondeu ${r.status}${texto ? `: ${texto}` : ''}`);
  return `Enviado. A API respondeu ${r.status}${texto ? `: ${texto}` : ''}`;
}

// ---------- cópia em disco, para o vigia que roda fora do sistema ----------

export async function escreverArquivosDeRuntime(db: Db, vault: SecretsVault) {
  await mkdir(CONFIG_DIR, { recursive: true, mode: 0o700 }).catch(() => {});
  const avisos = await ler<AjustesAvisos>(db, 'avisos');
  const token = await segredo(db, vault, 'avisos');
  const destino = join(CONFIG_DIR, 'avisos.json');
  if (avisos.valor.ativo && avisos.valor.url) {
    const { url, metodo, cabecalhos, corpo } = montarAviso(avisos.valor, token, '{{mensagem}}');
    await writeFile(destino, JSON.stringify({ url, metodo, cabecalhos, corpo }, null, 2), { mode: 0o600 });
  } else {
    await rm(destino, { force: true }).catch(() => {});
  }
}
