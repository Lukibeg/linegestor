import { describe, expect, it } from 'vitest';
import {
  MovimentacoesDosCircuitosSchema, circuitoNaMovimentacao, detalheDaMovimentacao, didNaMovimentacao, idsDosNomesDaMovimentacao,
  movimentacaoBate, periodoDasMovimentacoes, resumoDoDidAlterado, tiposDoFiltro, type NomesDaMovimentacao,
} from './circuitos-movimentacoes.js';

const nomes: NomesDaMovimentacao = {
  clientes: { c1: 'Clínica Aurora', c2: 'Hospital Vale Verde', vn: 'VoiceNet' },
  circuitos: { k1: 'Algar SIP 01', k2: 'Vivo E1 02' },
  operadoras: { o1: 'Algar', o2: 'Vivo' },
};

describe('as movimentações dos circuitos (2.4.1)', () => {
  it('o circuito alterado: só o que mudou, com os nomes; a senha só como "trocada"', () => {
    const antes = circuitoNaMovimentacao({ name: 'Algar SIP 01', code: '123', carrierId: 'o1', channels: 10, monthlyValueCents: 50000, ownerClientId: 'vn', authType: 'ip', signalingIp: '200.1.1.1', authIp: '10.0.0.1' });
    const depois = { ...antes, channels: 30, carrierId: 'o2', monthlyValueCents: 90000 };
    const d = detalheDaMovimentacao('circuito_editado', { antes, depois, senha: 'trocada' }, nomes);
    expect(d.campos).toEqual([
      { campo: 'Operadora', antes: 'Algar', depois: 'Vivo' },
      { campo: 'Canais', antes: '10', depois: '30' },
      { campo: 'Valor mensal', antes: 'R$ 500,00', depois: 'R$ 900,00' },
      { campo: 'Senha do tronco', antes: null, depois: 'trocada' },
    ]);
    expect(d.porDid).toEqual([]);
  });

  it('o circuito novo: só os campos preenchidos', () => {
    const depois = circuitoNaMovimentacao({ name: 'Vivo E1 02', code: '9', carrierId: 'o2', channels: 30, ownerClientId: 'vn' });
    const d = detalheDaMovimentacao('circuito_criado', { depois, senha: 'definida' }, nomes);
    expect(d.campos.map((c) => `${c.campo}: ${c.depois}`)).toEqual([
      'Nome: Vivo E1 02', 'N° do circuito: 9', 'Operadora: Vivo', 'Canais: 30', 'Titular: VoiceNet', 'Autenticação: por IP', 'Senha do tronco: definida',
    ]);
  });

  it('os DIDs alterados: cada número com o que mudou; o que não mudou fica de fora', () => {
    const a = didNaMovimentacao({ circuitId: 'k1', clientId: 'c1', inUse: true, note: null });
    const b = didNaMovimentacao({ circuitId: 'k1', clientId: null, inUse: false, note: null });
    const d = detalheDaMovimentacao('dids_editados', { dids: [{ numero: '7130348350', antes: a, depois: b }, { numero: '7130348351', antes: b, depois: b }] }, nomes);
    expect(d.porDid).toEqual([{ numero: '(71) 3034-8350', campos: [{ campo: 'Cliente', antes: 'Clínica Aurora', depois: 'livre' }, { campo: 'Uso', antes: 'em uso', depois: 'não usado' }] }]);
  });

  it('a linha antiga da auditoria (a linha inteira do banco) mostra só os campos que mudaram', () => {
    const antes = { id: 'x', number: '7130348350', circuitId: 'k1', clientId: null, inUse: false, note: null, updatedAt: '2026-10-01' };
    const depois = { ...antes, clientId: 'c2', updatedAt: '2026-10-02' };
    expect(detalheDaMovimentacao('did_editado', { antes, depois } as never, nomes).campos).toEqual([{ campo: 'Cliente', antes: 'livre', depois: 'Hospital Vale Verde' }]);
  });

  it('a frase do DID alterado', () => {
    const livre = didNaMovimentacao({ circuitId: 'k1', clientId: null });
    const aurora = didNaMovimentacao({ circuitId: 'k1', clientId: 'c1' });
    expect(resumoDoDidAlterado('7130348350', livre, aurora, nomes)).toBe('Atribuiu o DID (71) 3034-8350 a Clínica Aurora');
    expect(resumoDoDidAlterado('7130348350', aurora, livre, nomes)).toBe('Liberou o DID (71) 3034-8350 (era de Clínica Aurora)');
    expect(resumoDoDidAlterado('7130348350', aurora, { ...aurora, clientId: 'c2' }, nomes)).toBe('Passou o DID (71) 3034-8350 de Clínica Aurora para Hospital Vale Verde');
    expect(resumoDoDidAlterado('7130348350', aurora, { ...aurora, inUse: true }, nomes)).toBe('Marcou o DID (71) 3034-8350 como em uso');
    expect(resumoDoDidAlterado('7130348350', aurora, { ...aurora, circuitId: 'k2', note: 'recepção' }, nomes)).toBe('Levou o DID (71) 3034-8350 para o circuito Vivo E1 02 e com a observação "recepção"');
    expect(resumoDoDidAlterado('7130348350', aurora, aurora, nomes)).toBeNull();
  });

  it('os nomes que faltam, o filtro, a busca e o período', () => {
    expect(idsDosNomesDaMovimentacao({ antes: { carrierId: 'o1', ownerClientId: 'vn' }, dids: [{ numero: '1', antes: didNaMovimentacao({ circuitId: 'k1', clientId: 'c1' }), depois: didNaMovimentacao({ circuitId: 'k2' }) }] }))
      .toEqual({ clientes: ['vn', 'c1'], circuitos: ['k1', 'k2'], operadoras: ['o1'] });
    expect(tiposDoFiltro('circuitos')).toEqual(['circuito_criado', 'circuito_editado', 'circuito_lixeira', 'circuito_restaurado', 'circuito_cancelado', 'circuito_reativado']);
    expect(tiposDoFiltro('dids')).toEqual(['dids_criados', 'did_editado', 'dids_editados', 'dids_lixeira', 'did_restaurado']);
    expect(tiposDoFiltro('importacao')).toEqual(['importacao']);
    const m = { resumo: 'Liberou o DID (71) 3034-8350 (era de Clínica Aurora)', numeros: ['7130348350'], circuitos: [{ nome: 'Algar SIP 01' }] };
    expect(movimentacaoBate('8350', m)).toBe(true);
    expect(movimentacaoBate('aurora', m)).toBe(true);
    expect(movimentacaoBate('algar', m)).toBe(true);
    expect(movimentacaoBate('vivo', m)).toBe(false);
    const p = periodoDasMovimentacoes('2026-11-03', '2026-11-03');
    expect(p.desde!.toISOString()).toBe('2026-11-03T03:00:00.000Z');
    expect(p.antesDe!.toISOString()).toBe('2026-11-04T03:00:00.000Z');
    expect(MovimentacoesDosCircuitosSchema.parse({ tipo: '', de: '', q: ' ' })).toMatchObject({ tipo: undefined, de: undefined, q: undefined, page: 1, pageSize: 50 });
    expect(MovimentacoesDosCircuitosSchema.safeParse({ tipo: 'outra' }).success).toBe(false);
  });
});
