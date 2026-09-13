/**
 * Gera identificadores únicos para as linhas do banco.
 * Formato: 24 caracteres, prefixo de tempo (ordena por criação) + parte aleatória.
 * Não usamos números sequenciais para não expor "quantos clientes existem" nas URLs.
 */
import { randomBytes } from 'node:crypto';

const ALFABETO = '0123456789abcdefghijklmnopqrstuvwxyz';

export function newId(): string {
  const t = Date.now().toString(36).padStart(9, '0');
  const bytes = randomBytes(15);
  let r = '';
  for (const b of bytes) r += ALFABETO[b % ALFABETO.length];
  return (t + r).slice(0, 24);
}
