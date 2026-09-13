/**
 * Manda um arquivo de backup para a pasta do Google Drive configurada em Ajustes.
 * Quem chama é o `scripts/backup.sh`, depois de gerar o arquivo:
 *
 *   docker compose -f docker-compose.prod.yml exec -T app pnpm enviar-backup /backups/gestao-....sql.gz
 *
 * Guarda o resultado no banco, para a tela de Ajustes mostrar o último envio sem ninguém
 * precisar entrar no servidor. Sai com código 0 mesmo quando o envio falha: o backup local
 * já está feito, e quem chama a atenção é o aviso configurado, não um erro no cron.
 */
import { loadConfig } from '../config.js';
import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { createDb } from '@gestor/db';
import { SecretsVault } from '../services/secrets.js';
import * as integ from '../services/integracoes.js';

const arquivo = process.argv[2];
if (!arquivo) { console.error('Uso: pnpm enviar-backup <arquivo>'); process.exit(1); }

const config = loadConfig();
const { db, pool } = createDb(config.DATABASE_URL);
const vault = new SecretsVault(config.SECRETS_MASTER_KEY);

const registrar = async (ok: boolean, msg: string) => {
  const { valor } = await integ.ler<integ.AjustesBackup>(db, 'backup');
  await integ.gravar(db, 'backup', { ...valor, ultimoEnvioEm: new Date().toISOString(), ultimoEnvioOk: ok, ultimoEnvioMsg: msg });
};

try {
  const { valor } = await integ.ler<integ.AjustesBackup>(db, 'backup');
  if (!valor.ativo) {
    console.log('O envio para o Drive está desligado em Ajustes; só o backup local foi feito.');
  } else {
    const chave = await integ.segredo(db, vault, 'backup');
    if (!chave) throw new Error('Falta a chave da conta de serviço (Administração › Ajustes)');
    if (!valor.pastaId) throw new Error('Falta o id da pasta do Drive (Administração › Ajustes)');
    const conteudo = await readFile(arquivo);
    const id = await integ.enviarParaDrive(chave, valor.pastaId, basename(arquivo), conteudo);
    const apagados = await integ.limparDrive(chave, valor.pastaId, 60).catch(() => 0);
    const msg = `Enviado (${(conteudo.length / 1024).toFixed(0)} KB)${apagados ? `; ${apagados} cópia(s) antiga(s) apagada(s)` : ''}`;
    await registrar(true, msg);
    console.log(`${msg} — id ${id}`);
  }
} catch (e) {
  const msg = e instanceof Error ? e.message : String(e);
  await registrar(false, msg).catch(() => {});
  console.error(`Falhou ao enviar para o Drive: ${msg}`);
  // sai 0 de propósito: o backup local está feito; quem chama a atenção é o aviso
} finally {
  await pool.end();
}
