/**
 * Carrega o arquivo `.env` da RAIZ do projeto, não importa de qual pasta o comando foi rodado.
 * Assim `pnpm db:migrate` funciona tanto na raiz quanto dentro de packages/db.
 */
import { config } from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(here, '../../../.env') });
config(); // também o .env da pasta atual, se houver (não sobrescreve o que já foi definido)
