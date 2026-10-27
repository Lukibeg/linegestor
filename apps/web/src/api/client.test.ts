/**
 * Patch 2.1.3 — A LEITURA COM PRAZO. No Edge do Luan, a conexão com o servidor ficava presa e a tela ficava em
 * "Carregando…" para sempre ("ele fica carregando e n vai"). Com o prazo, a leitura presa vira um erro na tela.
 *
 *  - a leitura (GET) que não responde em 30 s desiste, com a mensagem em português (status 0)
 *  - o prazo vale até o corpo chegar inteiro
 *  - gravar (POST) não tem prazo: o gravar que desiste no meio pode ter gravado do mesmo jeito
 *  - a leitura que responde a tempo volta como sempre, sem deixar o relógio ligado
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { realApi } from './client.js';
import { ApiError } from './types.js';

/** Um fetch que só responde quando o pedido é cancelado (a conexão presa). */
function fetchPreso() {
  return vi.fn((_url: string, init?: RequestInit) => new Promise<Response>((_ok, falhou) => {
    init?.signal?.addEventListener('abort', () => falhou(new DOMException('cancelado', 'AbortError')));
  }));
}

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('a leitura com prazo (2.1.3)', () => {
  it('a leitura que não responde em 30 s desiste, com a mensagem em português', async () => {
    const f = fetchPreso();
    vi.stubGlobal('fetch', f);
    const pedido = realApi.auth.me();
    const erro = pedido.catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(29_000);
    expect(f.mock.calls[0]![1]!.signal!.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1_000);
    const e = await erro;
    expect(e).toBeInstanceOf(ApiError);
    expect((e as ApiError).status).toBe(0);
    expect((e as ApiError).message).toMatch(/não respondeu em 30 segundos/);
  });

  it('o prazo vale até o corpo chegar inteiro', async () => {
    vi.stubGlobal('fetch', vi.fn((_url: string, init?: RequestInit) => Promise.resolve({
      ok: true, status: 200,
      // o cabeçalho chegou; o corpo, não
      json: () => new Promise((_ok, falhou) => init?.signal?.addEventListener('abort', () => falhou(new DOMException('cancelado', 'AbortError')))),
    } as unknown as Response)));
    const erro = realApi.auth.me().catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(((await erro) as ApiError).status).toBe(0);
  });

  it('gravar não tem prazo', async () => {
    const f = fetchPreso();
    vi.stubGlobal('fetch', f);
    void realApi.auth.logout().catch(() => undefined);
    await vi.advanceTimersByTimeAsync(120_000);
    expect(f.mock.calls[0]![1]!.signal).toBeUndefined();
  });

  it('a leitura que responde a tempo volta como sempre, sem deixar o relógio ligado', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response(JSON.stringify({ id: 'u1', nome: 'Luan' }), { status: 200 }))));
    await expect(realApi.auth.me()).resolves.toEqual({ id: 'u1', nome: 'Luan' });
    expect(vi.getTimerCount()).toBe(0);
  });
});
