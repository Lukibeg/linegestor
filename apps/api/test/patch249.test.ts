/**
 * O 2.4.9 (o Luan, 17/11, com o print do erro "Um painel vai até 30 campos (os desativados contam)" ao marcar o Checklist na
 * Implantação): o painel vai até 80 campos. A caixinha cria um campo, e o painel da implantação dele já tinha 30.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MAX_CAMPOS_DO_PAINEL, type CampoPersonalizado } from '@gestor/shared';
import { makeApp, Session, type App } from './helpers.js';

let app: App;
let s: Session;
let IMP = '';

beforeAll(async () => {
  app = await makeApp();
  s = new Session(app);
  await s.login();
  const p = await s.post('/atendimento/paineis', {
    nome: 'Implantação 249', sigla: 'IMZ', descricao: null, cor: 'roxo', acesso: 'todos', pessoas: [], ajustes: {},
    etapas: [
      { nome: 'Curadoria', tipo: 'entrada', nivel: null, obrigatorios: [], avisar: [] },
      { nome: 'Concluído', tipo: 'fechado', nivel: null, obrigatorios: [], avisar: [] },
    ],
  });
  expect(p.statusCode, p.body).toBe(201);
  IMP = p.json().id;
});
afterAll(async () => { await app.close(); });

describe('o painel vai até 80 campos (2.4.9)', () => {
  it('com 30 campos (um desativado), o Checklist na Implantação liga; o 81º campo é recusado', async () => {
    expect(MAX_CAMPOS_DO_PAINEL).toBe(80);
    let numeros: CampoPersonalizado | null = null;
    for (let i = 1; i <= 30; i++) {
      const nome = i === 1 ? 'Números' : `Campo ${i}`;
      const r = await s.post(`/atendimento/paineis/${IMP}/campos`, { nome, tipo: 'texto_longo', parte: 'Curadoria', ativo: i !== 2 });
      expect(r.statusCode, r.body).toBe(201);
      if (i === 1) numeros = r.json();
    }
    // o print do Luan: o 31º campo era o checklist
    const ligar = await s.post(`/atendimento/campos/${numeros!.id}/checklist-na-implantacao`, { ligar: true });
    expect(ligar.statusCode, ligar.body).toBe(200);
    expect(ligar.json().campo.nome).toBe('Números (implantação)');
    for (let i = 32; i <= MAX_CAMPOS_DO_PAINEL; i++) {
      const r = await s.post(`/atendimento/paineis/${IMP}/campos`, { nome: `Campo ${i}`, tipo: 'texto', parte: 'Curadoria' });
      expect(r.statusCode, r.body).toBe(201);
    }
    const demais = await s.post(`/atendimento/paineis/${IMP}/campos`, { nome: 'Campo 81', tipo: 'texto', parte: 'Curadoria' });
    expect(demais.statusCode).toBe(400);
    expect(demais.json().error).toBe('Um painel vai até 80 campos (os desativados contam).');
  });
});
