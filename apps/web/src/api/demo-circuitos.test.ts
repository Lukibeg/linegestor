/**
 * A aba Movimentações dos circuitos na prévia (2.4.1) vale igual ao servidor: a história de exemplo e cada mudança feita
 * na prévia viram linhas, com os mesmos filtros e o mesmo detalhe.
 */
import { describe, expect, it } from 'vitest';
import { demoApi } from './demo.js';

const api = demoApi;
async function entrar(quem: 'admin' | 'leitor') {
  await demoApi.auth.logout();
  return (await demoApi.auth.login(`${quem}@gestor.local`, 'demo')).user!;
}
const movs = (q: Record<string, unknown> = {}) => api.circuits.movimentacoes({ pageSize: 500, ...q });

describe('as movimentações dos circuitos na prévia (2.4.1)', () => {
  it('nasce com a história de exemplo: cada circuito, a faixa, as atribuições e as mudanças recentes', async () => {
    await entrar('leitor');
    const m = await movs();
    // todos os circuitos: os de terceiro e o link cancelado (2.4.6) também têm a história deles
    const circuitos = (await api.circuits.list({ includeThirdParty: true, includeCancelled: true, pageSize: 100 })).items;
    // com os dois interruptores ligados, todos os circuitos (o link cancelado, 2.4.6, só com o "Mostrar cancelados")
    const comTerceiros = await movs({ incluirTerceiros: 'true', incluirCancelados: 'true' });
    expect(comTerceiros.items.filter((x) => x.tipo === 'circuito_criado')).toHaveLength(circuitos.length);
    expect(comTerceiros.items.filter((x) => x.tipo === 'dids_criados')).toHaveLength(circuitos.length);
    // sem o interruptor, o link de terceiro (o Vivo do Hospital Vale Verde) fica de fora, como nas outras abas
    expect(m.items.filter((x) => x.tipo === 'circuito_criado')).toHaveLength(circuitos.filter((c) => !c.thirdParty && !c.cancelamento).length);
    const vivo = circuitos.find((c) => c.thirdParty)!;
    expect((await movs({ circuitId: vivo.id })).items.map((x) => x.tipo)).toEqual(['dids_editados', 'dids_criados', 'circuito_criado']);
    // a mais recente primeiro: o uso do número da Aurora, há 3 dias
    expect(m.items[0]).toMatchObject({ tipo: 'did_editado', quem: { nome: 'Marina Costa' } });
    expect(m.items[0]!.resumo).toMatch(/^Marcou o DID \(71\) 3039-61\d\d como em uso$/);
    const senha = m.items.find((x) => x.resumo === 'Alterou o circuito 071 Principal: senha do tronco')!;
    expect(senha.campos).toEqual([{ campo: 'Senha do tronco', antes: null, depois: 'trocada' }]);
    expect(m.items.find((x) => x.resumo === 'Alterou o circuito 071 Principal: canais')!.campos).toEqual([{ campo: 'Canais', antes: '20', depois: '30' }]);
    expect(m.pessoas.map((p) => p.nome)).toEqual(['Luan França', 'Lúcio Andrade', 'Marina Costa']);
  });

  it('cada mudança feita na prévia entra, e os filtros valem como no servidor', async () => {
    await entrar('admin');
    const antes = (await movs()).total;
    const c = await api.circuits.create({ name: 'Teste da prévia', code: '99901', carrierId: null, channels: 4 });
    await api.circuits.createRange(c.id, { baseNumber: '7130990000', quantity: 3 });
    const ds = (await api.dids.list({ circuitId: c.id, pageSize: 10, includeThirdParty: true })).items;
    const aurora = (await api.clients.options()).find((x) => x.name === 'Clínica Aurora')!;
    await api.dids.update(ds[0]!.id, { clientId: aurora.id });
    await api.dids.bulk(ds.map((d) => d.id), { note: 'recepção' });
    await api.dids.bulkDelete([ds[2]!.id]);
    await api.circuits.update(c.id, { channels: 8 });
    const m = await movs({ circuitId: c.id });
    expect(m.items.map((x) => x.tipo)).toEqual(['circuito_editado', 'dids_lixeira', 'dids_editados', 'did_editado', 'dids_criados', 'circuito_criado']);
    expect(m.items[3]).toMatchObject({ resumo: 'Atribuiu o DID (71) 3099-0000 a Clínica Aurora', porDid: [{ numero: '(71) 3099-0000', campos: [{ campo: 'Cliente', antes: 'livre', depois: 'Clínica Aurora' }] }] });
    expect(m.items[2]!.porDid.map((d) => d.numero)).toEqual(['(71) 3099-0000', '(71) 3099-0001', '(71) 3099-0002']);
    expect((await movs()).total).toBe(antes + 6);
    expect((await movs({ q: '3099-0002' })).items.map((x) => x.tipo)).toEqual(['dids_lixeira', 'dids_editados', 'dids_criados']);
    expect((await movs({ tipo: 'circuitos', circuitId: c.id })).total).toBe(2);
    expect((await movs({ ate: '2020-01-01' })).total).toBe(0);
  });
});

describe('o link cancelado na prévia (2.4.6), como o servidor', () => {
  it('o Link - Prado & Lima já vem cancelado: fora da lista, com a faixa e a movimentação; cancelar e reativar outro', async () => {
    await entrar('admin');
    const lista = (await api.circuits.list({ pageSize: 100 })).items;
    expect(lista.map((c) => c.name)).not.toContain('Link - Prado & Lima');
    const todos = (await api.circuits.list({ pageSize: 100, includeCancelled: true })).items;
    const prado = todos.find((c) => c.name === 'Link - Prado & Lima')!;
    expect(prado.cancelamento).toMatchObject({ por: 'Luan França' });
    expect((await movs({ circuitId: prado.id })).items[0]!.tipo).toBe('circuito_cancelado');
    const aurora = lista.find((c) => c.name === 'Link - Aurora')!;
    const c = await api.circuits.cancelar(aurora.id, { dia: '2026-11-10', motivo: 'Teste' });
    expect(c.cancelamento).toMatchObject({ dia: '2026-11-10', motivo: 'Teste' });
    expect((await api.circuits.list({ pageSize: 100 })).items.map((x) => x.id)).not.toContain(aurora.id);
    expect((await api.dids.list({ pageSize: 1000 })).items.some((d) => d.circuitId === aurora.id)).toBe(false);
    await api.circuits.reativar(aurora.id);
    expect((await api.circuits.list({ pageSize: 100 })).items.map((x) => x.id)).toContain(aurora.id);
    expect((await movs({ circuitId: aurora.id })).items.slice(0, 2).map((x) => x.tipo)).toEqual(['circuito_reativado', 'circuito_cancelado']);
  });
});

describe('o link cancelado some de todo lugar sem a flag, na prévia (2.4.6)', () => {
  it('as movimentações, o painel, o cliente e os seletores', async () => {
    await entrar('admin');
    const prado = (await api.circuits.list({ pageSize: 100, includeCancelled: true })).items.find((c) => c.name === 'Link - Prado & Lima')!;
    const sem = await movs();
    expect(sem.items.some((m) => m.circuitos.some((c) => c.id === prado.id))).toBe(false);
    const com = await movs({ incluirCancelados: 'true' });
    expect(com.items.some((m) => m.tipo === 'circuito_cancelado')).toBe(true);
    // o painel: os 4 números do link cancelado não contam
    const painel = await api.dashboard.summary();
    const todos = (await api.dids.list({ pageSize: 1000, includeThirdParty: false, includeCancelled: true })).items.length;
    expect(painel.dids.total).toBe(todos - 4);
    // o cliente: os números dele eram todos do link cancelado
    const cliente = (await api.clients.list({ pageSize: 200 })).items.find((c) => c.tradeName === 'Escritório Prado & Lima')!;
    expect(cliente.didCount).toBe(0);
    // os seletores
    expect((await api.circuits.options()).some((c) => c.id === prado.id)).toBe(false);
    expect((await api.circuits.options(true)).find((c) => c.id === prado.id)!.cancelled).toBe(true);
    // nenhum número entra nele
    const livre = (await api.dids.list({ pageSize: 1000 })).items.find((d) => d.free)!;
    await expect(api.dids.update(livre.id, { circuitId: prado.id })).rejects.toThrow('foi cancelado');
  });
});

