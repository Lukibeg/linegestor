/**
 * Patch 1.9 — as melhorias pedidas em 09/10 (o .docx "não precisa de titular no DID"). O que mexe no
 * servidor é só o CSV dos DIDs: sem a coluna Titular na exportação, e a de um arquivo antigo é
 * ignorada na importação (o titular é do circuito). As outras duas — "Esta semana"/"Este mês" nos
 * Chamados do cliente e ordenar a tabela do projeto — são da tela.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { makeApp, Session, type App } from './helpers.js';

let app: App;
let s: Session;
let voicenet = '';

beforeAll(async () => {
  app = await makeApp();
  s = new Session(app);
  await s.login();
  voicenet = (await s.get('/clients/options?includeInternal=true')).json().find((c: any) => c.internalCode === 'voicenet').id;
  expect((await s.post('/circuits', { name: 'Mais Saúde - Projeto', code: '95579', channels: 1, ownerClientId: voicenet })).statusCode).toBe(201);
});
afterAll(async () => { await app.close(); });

describe('o DID sem titular', () => {
  it('a coluna Titular de um CSV antigo é ignorada: nem erro, nem titular no número', async () => {
    const csv = ['numero;circuito;cliente;titular;observacao', '(74) 2018-0402;95579;livre;Uma Empresa Que Não Existe;recepção'].join('\n');
    const p = (await s.post('/data/import/preview', { entity: 'dids', csv, delimiter: ';' })).json();
    expect(p.summary).toMatchObject({ create: 1, error: 0 });
    expect((await s.post('/data/import/apply', { entity: 'dids', csv, delimiter: ';' })).statusCode).toBe(200);
    const did = (await s.get('/dids?q=7420180402')).json().items[0];
    expect(did).toMatchObject({ number: '7420180402', ownerClientId: null, note: 'recepção' });
  });

  it('a exportação dos DIDs não traz mais o titular; a dos circuitos continua trazendo', async () => {
    const dids = await s.get('/data/export/dids');
    expect(dids.statusCode).toBe(200);
    const cabecalho = dids.body.replace(/^﻿/, '').split(/\r?\n/)[0];
    expect(cabecalho).toBe('numero;circuito;circuito_nome;cliente;cliente_nome;observacao');
    const circuitos = await s.get('/data/export/circuits');
    expect(circuitos.body.split(/\r?\n/)[0]).toContain('titular');
    expect(circuitos.body).toContain('VoiceNet');
  });
});
