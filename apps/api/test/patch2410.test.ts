/**
 * O 2.4.10 (o Luan, 17/11): "Adicionar o link direto para o email/sessão do linechat" — o endereço de uma conversa aberta no
 * LineChat, colado em Integrações, vira o modelo do link sozinho, e a ficha passa a ter o link. (O Agrupar por níveis é da
 * tela e das regras: os testes estão no @gestor/shared.)
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FichaChamado, OpcoesAtendimento } from '@gestor/shared';
import { makeApp, Session, type App } from './helpers.js';

let app: App;
let s: Session;
const U = '8385c1e2-7f4a-4b1c-9d2e-0a1b2c3d4e5f';

beforeAll(async () => {
  app = await makeApp();
  s = new Session(app);
  await s.login();
});
afterAll(async () => { await app.close(); });

describe('o link da conversa no LineChat (2.4.10)', () => {
  it('colar o endereço de uma conversa aberta salva o modelo, e a ficha mostra o link', async () => {
    const o: OpcoesAtendimento = (await s.get('/atendimento/opcoes')).json();
    const c = await s.post('/atendimento/chamados', { painelId: o.paineis[0]!.id, titulo: 'Exclusão de usuário', sessaoId: U });
    expect(c.statusCode, c.body).toBe(201);
    const id = c.json().id as string;
    const antes: FichaChamado = (await s.get(`/atendimento/chamados/${id}`)).json();
    expect(antes.sessaoId).toBe(U);
    expect(antes.conversaUrl).toBeNull();

    const r = await s.put('/atendimento/integracoes/link-conversa', { linkConversa: `https://app.inglinechat.com.br/chat2/sessions/${U.toUpperCase()}` });
    expect(r.statusCode, r.body).toBe(200);
    expect(r.json()).toEqual({ linkConversa: 'https://app.inglinechat.com.br/chat2/sessions/{sessao}' });
    const depois: FichaChamado = (await s.get(`/atendimento/chamados/${id}`)).json();
    expect(depois.conversaUrl).toBe(`https://app.inglinechat.com.br/chat2/sessions/${U}`);
    // o endereço sem o número da conversa continua recusado
    const ruim = await s.put('/atendimento/integracoes/link-conversa', { linkConversa: 'https://app.inglinechat.com.br/chat2/sessions/' });
    expect(ruim.statusCode).toBe(400);
  });
});
