import { describe, expect, it } from 'vitest';
import type { AnotacaoChamado, EventoChamado } from './atendimento.js';
import {
  AjustesDaNiaSchema, ajustesDaNiaCompletos, CAMPO_DAS_ETIQUETAS, etiquetasAoPedirANia, NIA_PADRAO, NIA_PEDIR_DE_NOVO_MINUTOS, resumoDaNia, temAEtiqueta,
} from './nia.js';

const LUAN = { id: 'u1', nome: 'Luan França' };
const N8N = 'NIA no n8n';
let n = 0;
/** A troca de etiquetas como o histórico grava ("A, B" → "A, B, C"), por uma pessoa ou pela integração. */
const troca = (em: string, de: string[], para: string[], quem: 'luan' | 'n8n'): EventoChamado => ({
  id: `e${++n}`, tipo: 'campo', em, por: quem === 'luan' ? LUAN : null, porNome: quem === 'n8n' ? N8N : null,
  dados: { campo: CAMPO_DAS_ETIQUETAS, de: de.join(', ') || null, para: para.join(', ') || null }, texto: '',
});
const campo = (em: string, nome: string, quem: 'luan' | 'n8n' = 'n8n'): EventoChamado => ({
  id: `e${++n}`, tipo: 'campo', em, por: quem === 'luan' ? LUAN : null, porNome: quem === 'n8n' ? N8N : null, dados: { campo: nome, de: 'a', para: 'b' }, texto: '',
});
const nota = (em: string, quem: 'luan' | 'n8n' = 'n8n'): AnotacaoChamado => ({
  id: `n${++n}`, texto: 'Situação: …', por: quem === 'luan' ? LUAN : null, porNome: quem === 'n8n' ? N8N : null, em, anexos: [], podeApagar: false, citados: [],
});
const P = NIA_PADRAO.pedir; const C = NIA_PADRAO.pronto; const E = NIA_PADRAO.erro;
const AGORA = new Date('2026-10-23T13:30:00.000Z');

describe('a NIA na ficha (2.0.4.1)', () => {
  it('os ajustes: o padrão são as etiquetas do Helena; as três precisam ser diferentes', () => {
    expect(NIA_PADRAO).toEqual({ ligada: true, pedir: 'NIA - PREENCHER', pronto: 'NIA - CONCLUIDO', erro: 'NIA - ERRO' });
    expect(ajustesDaNiaCompletos(undefined)).toEqual(NIA_PADRAO);
    expect(ajustesDaNiaCompletos({ ligada: false, pedir: '  IA   pedir ' })).toEqual({ ...NIA_PADRAO, ligada: false, pedir: 'IA pedir' });
    // três iguais não dá para entender: volta para as de fábrica (o ligado fica)
    expect(ajustesDaNiaCompletos({ ligada: false, pedir: 'X', pronto: 'x', erro: 'Y' })).toEqual({ ...NIA_PADRAO, ligada: false });
    expect(AjustesDaNiaSchema.safeParse({ ligada: true, pedir: 'A', pronto: 'á', erro: 'B' }).success).toBe(false);
    expect(AjustesDaNiaSchema.parse({ ligada: true, pedir: ' A ', pronto: 'B', erro: 'C' })).toEqual({ ligada: true, pedir: 'A', pronto: 'B', erro: 'C' });
  });

  it('pedir: a de pedir entra, a de pronto e a de erro saem, sem repetir (sem ligar para maiúscula)', () => {
    expect(etiquetasAoPedirANia(['Cliente VIP', 'nia - concluido'], NIA_PADRAO)).toEqual(['Cliente VIP', P]);
    expect(etiquetasAoPedirANia([E, P], NIA_PADRAO)).toEqual([P]);
    expect(temAEtiqueta(['nia  - preencher'], P)).toBe(true);
  });

  it('nunca pediram: nada a mostrar, e dá para pedir', () => {
    expect(resumoDaNia({ etiquetas: ['Cliente VIP'], historico: [] }, NIA_PADRAO, AGORA)).toEqual({
      situacao: 'nunca', pedidaEm: null, pedidaPor: null, respondidaEm: null, respondidaPor: null, vezes: 0, mudou: [], anotacoes: 0, podePedir: true,
    });
  });

  it('pedida: espera a resposta (e só deixa pedir de novo depois de uns minutos)', () => {
    const pedido = troca('2026-10-23T13:28:00.000Z', ['Cliente VIP'], ['Cliente VIP', P], 'luan');
    const r = resumoDaNia({ etiquetas: ['Cliente VIP', P], historico: [pedido] }, NIA_PADRAO, AGORA);
    expect(r).toMatchObject({ situacao: 'pedida', pedidaEm: pedido.em, pedidaPor: 'Luan França', respondidaEm: null, podePedir: false });
    const depois = new Date(Date.parse(pedido.em) + NIA_PEDIR_DE_NOVO_MINUTOS * 60_000);
    expect(resumoDaNia({ etiquetas: [P], historico: [pedido] }, NIA_PADRAO, depois).podePedir).toBe(true);
  });

  it('pronta: quando, quem pediu, o que ela mudou e as anotações dela (o que a pessoa fez não conta)', () => {
    const historico = [
      troca('2026-10-23T13:10:00.000Z', [], [P], 'luan'),
      campo('2026-10-23T13:10:30.000Z', 'Título'),
      campo('2026-10-23T13:10:30.001Z', 'Descrição'),
      campo('2026-10-23T13:10:31.000Z', 'Prioridade', 'luan'),
      // a NIA também pôs uma etiqueta dela (conta) e trocou a de pedir pela de pronto
      troca('2026-10-23T13:10:30.002Z', [P], ['Ramal', C], 'n8n'),
      campo('2026-10-23T13:40:00.000Z', 'Assunto'),
    ];
    const anotacoesLista = [nota('2026-10-23T13:10:40.000Z'), nota('2026-10-23T13:11:00.000Z'), nota('2026-10-23T13:10:50.000Z', 'luan')];
    expect(resumoDaNia({ etiquetas: ['Ramal', C], historico, anotacoesLista }, NIA_PADRAO, AGORA)).toEqual({
      situacao: 'pronta', pedidaEm: '2026-10-23T13:10:00.000Z', pedidaPor: 'Luan França', respondidaEm: '2026-10-23T13:10:30.002Z', respondidaPor: N8N,
      vezes: 1, mudou: ['Título', 'Descrição', CAMPO_DAS_ETIQUETAS], anotacoes: 2, podePedir: true,
    });
  });

  it('erro: a resposta de erro; e o pedido novo, depois de pronta, volta a esperar', () => {
    const p1 = troca('2026-10-23T12:00:00.000Z', [], [P], 'luan');
    const c1 = troca('2026-10-23T12:00:20.000Z', [P], [C], 'n8n');
    const p2 = troca('2026-10-23T13:00:00.000Z', [C], [P], 'luan');
    expect(resumoDaNia({ etiquetas: [P], historico: [p1, c1, p2] }, NIA_PADRAO, AGORA)).toMatchObject({ situacao: 'pedida', pedidaEm: p2.em, vezes: 1, podePedir: true });
    const e2 = troca('2026-10-23T13:00:15.000Z', [P], [E], 'n8n');
    expect(resumoDaNia({ etiquetas: [E], historico: [p1, c1, p2, e2] }, NIA_PADRAO, AGORA)).toMatchObject({
      situacao: 'erro', pedidaEm: p2.em, respondidaEm: e2.em, respondidaPor: N8N, vezes: 1, podePedir: true,
    });
  });

  it('a NIA que pôs a de pronto sem tirar a de pedir também conta como pronta', () => {
    const p1 = troca('2026-10-23T13:00:00.000Z', [], [P], 'luan');
    const c1 = troca('2026-10-23T13:00:20.000Z', [P], [P, C], 'n8n');
    expect(resumoDaNia({ etiquetas: [P, C], historico: [p1, c1] }, NIA_PADRAO, AGORA).situacao).toBe('pronta');
  });

  it('sem o histórico (a etiqueta veio de antes do Gestor): a situação pelas etiquetas, sem as datas', () => {
    expect(resumoDaNia({ etiquetas: [C], historico: [] }, NIA_PADRAO, AGORA)).toMatchObject({ situacao: 'pronta', pedidaEm: null, respondidaEm: null, vezes: 0 });
    expect(resumoDaNia({ etiquetas: [E], historico: [] }, NIA_PADRAO, AGORA).situacao).toBe('erro');
    // a de pedir sem a data do pedido: dá para pedir de novo (não há como saber há quanto tempo espera)
    expect(resumoDaNia({ etiquetas: [P], historico: [] }, NIA_PADRAO, AGORA)).toMatchObject({ situacao: 'pedida', podePedir: true });
    // tiraram a etiqueta de pronto depois: ela já preencheu, a ficha continua dizendo
    const c1 = troca('2026-10-23T12:00:20.000Z', [P], [C], 'n8n');
    const tirou = troca('2026-10-23T12:30:00.000Z', [C], [], 'luan');
    expect(resumoDaNia({ etiquetas: [], historico: [c1, tirou] }, NIA_PADRAO, AGORA)).toMatchObject({ situacao: 'pronta', respondidaEm: c1.em, vezes: 1 });
  });

  it('as etiquetas dos Ajustes (outros nomes) valem no lugar das de fábrica', () => {
    const nia = { ligada: true, pedir: 'IA pedir', pronto: 'IA pronto', erro: 'IA erro' };
    const p1 = troca('2026-10-23T13:00:00.000Z', [], ['IA pedir'], 'luan');
    const c1 = troca('2026-10-23T13:00:20.000Z', ['IA pedir'], ['IA pronto'], 'n8n');
    expect(resumoDaNia({ etiquetas: ['IA pronto'], historico: [p1, c1] }, nia, AGORA)).toMatchObject({ situacao: 'pronta', pedidaPor: 'Luan França', vezes: 1 });
    expect(resumoDaNia({ etiquetas: [C], historico: [] }, nia, AGORA).situacao).toBe('nunca');
  });
});
