/**
 * Patch 1.6.1 — a coluna "1º produto — ativado em" (decisão 0036), no lugar da "1º módulo" do 1.6.
 *
 * O que este teste segura: a lista de clientes ordena pela ativação do PRIMEIRO PRODUTO — a mais
 * antiga entre os produtos ativos hoje —; produto encerrado não conta, o Equipamentos (que não tem
 * data de ativação na tela) também não, e quem fica sem data vai para o fim nos dois sentidos.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { makeApp, Session, type App } from './helpers.js';

let app: App;
let s: Session;
beforeAll(async () => {
  app = await makeApp();
  s = new Session(app);
  await s.login();
});
afterAll(async () => { await app.close(); });

describe('coluna "1º produto — ativado em"', () => {
  it('ordena pela ativação do produto mais antigo', async () => {
    const novo = async (nome: string, cnpj: string) => (await s.post('/clients', { tradeName: nome, legalName: `${nome} LTDA`, cnpj })).json().id as string;
    const a = await novo('Alfa Primeiro', '11.222.333/0001-81');
    const b = await novo('Beta Primeiro', '22.333.444/0001-81');
    const c = await novo('Gama Só Equipamentos', '55.666.777/0001-81');
    // Alfa: LinePBX em 2024-01 e VoiceNet em 2023-05 → o 1º é a VoiceNet
    await s.put(`/clients/${a}/subscriptions`, { productCode: 'linepbx', activatedAt: '2024-01-10' });
    await s.put(`/clients/${a}/subscriptions`, { productCode: 'voicenet', activatedAt: '2023-05-01' });
    // Beta: um LinePBX de 2022 que foi encerrado (não conta) e o LineChat de 2024-06, ativo
    await s.put(`/clients/${b}/subscriptions`, { productCode: 'linepbx', activatedAt: '2022-03-01' });
    await s.del(`/clients/${b}/subscriptions/linepbx`);
    await s.put(`/clients/${b}/subscriptions`, { productCode: 'linechat', activatedAt: '2024-06-01' });
    // Gama: só o Equipamentos, que não tem data de ativação na tela — fica sem data
    await s.put(`/clients/${c}/subscriptions`, { productCode: 'equipamentos', activatedAt: '2020-01-01' });

    const nomes = async (dir: string) => (await s.get(`/clients?pageSize=100&sort=primeiroProduto&dir=${dir}`)).json().items
      .map((x: any) => x.tradeName).filter((n: string) => /Primeiro|Equipamentos/.test(n));
    expect(await nomes('asc')).toEqual(['Alfa Primeiro', 'Beta Primeiro', 'Gama Só Equipamentos']);
    expect(await nomes('desc')).toEqual(['Beta Primeiro', 'Alfa Primeiro', 'Gama Só Equipamentos']);
  });
});
