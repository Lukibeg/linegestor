/**
 * Onde a API vive. Em produção é o mesmo endereço do site, sob /api.
 *
 * Fica num arquivo próprio de propósito: `index.ts` carrega `client.ts` com `await import()`, e se
 * `client.ts` importasse este valor de `index.ts` os dois ficariam esperando um pelo outro para
 * sempre — a página abre em branco, sem erro nenhum no console.
 */
export const API_BASE = import.meta.env.VITE_API_URL ?? '/api';
