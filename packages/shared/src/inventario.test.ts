import { describe, expect, it } from 'vitest';
import {
  clienteForaDaBase, idNaAnotacao, relatoriosInventario,
  type AparelhoDaBase, type BaseInventario, type ClienteDaBase, type MovimentacaoDaBase,
} from './inventario.js';

// sexta, 09/10/2026, meio-dia em Brasília
const agora = new Date('2026-10-09T15:00:00Z');
/** meio-dia em Brasília de um AAAA-MM-DD */
const dia = (d: string) => `${d}T15:00:00Z`;

const modelos = [
  { id: 'gx', name: 'Grandstream GXP1610', categoryName: 'Telefone IP', valueCents: 45000, temFoto: true },
  { id: 'hs', name: 'Headset Genérico', categoryName: 'Periférico', valueCents: 9000, temFoto: false },
  { id: 'tip', name: 'Intelbras TIP 125i', categoryName: 'Telefone IP', valueCents: 38000, temFoto: true },
  { id: 'dp', name: 'Grandstream DP722', categoryName: 'Telefone IP', valueCents: null, temFoto: false },
];

function cliente(p: Partial<ClienteDaBase> & { id: string; nome: string }): ClienteDaBase {
  return {
    interno: false, arquivado: false, naLixeiraDesde: null,
    temEquipamentos: true, produtosAtivos: 1,
    temRedePadrao: false, modelosComLogin: [], ...p,
  };
}
const clientes = [
  cliente({ id: 'hosp', nome: 'Hospital Vale Verde', produtosAtivos: 2, temRedePadrao: true, modelosComLogin: ['gx'] }),
  cliente({ id: 'clin', nome: 'Clínica Aurora' }),
  cliente({ id: 'antiga', nome: 'Antiga', arquivado: true }),
  cliente({ id: 'lixo', nome: 'Lixo SA', naLixeiraDesde: dia('2026-09-01') }),
  cliente({ id: 'semeq', nome: 'Sem Equip', temEquipamentos: false }),
  cliente({ id: 'ing', nome: 'Ingline Systems', interno: true }),
];

function ap(p: Partial<AparelhoDaBase> & { id: string; modelId: string }): AparelhoDaBase {
  return { mac: null, serialNumber: null, clientId: null, unit: null, currentModality: null, condition: 'ativo', valueCents: null, ip: null, note: null, createdAt: dia('2026-06-01'), ...p };
}
let nMac = 0;
const mac = () => `000B82${String(++nMac).padStart(6, '0')}`;
const aparelhos: AparelhoDaBase[] = [
  // Hospital: três GXP em locação (um inativo), um em comodato na Unidade Simões Filho, um headset
  ap({ id: 'g1', modelId: 'gx', mac: mac(), clientId: 'hosp', unit: 'Matriz', currentModality: 'locacao' }),
  ap({ id: 'g2', modelId: 'gx', mac: mac(), clientId: 'hosp', unit: 'Matriz', currentModality: 'locacao' }),
  ap({ id: 'g4', modelId: 'gx', mac: mac(), clientId: 'hosp', unit: 'Matriz', currentModality: 'locacao', condition: 'inativo' }),
  ap({ id: 'g3', modelId: 'gx', mac: mac(), clientId: 'hosp', unit: 'Unidade Simões Filho', currentModality: 'comodato' }),
  ap({ id: 'h1', modelId: 'hs', clientId: 'hosp', unit: 'Matriz', currentModality: 'comodato' }),
  // Clínica: um TIP em locação, um DP722 sem valor (N/S), e um TIP vendido
  ap({ id: 't1', modelId: 'tip', mac: mac(), clientId: 'clin', currentModality: 'locacao' }),
  ap({ id: 'd1', modelId: 'dp', serialNumber: 'DP001', clientId: 'clin', currentModality: 'comodato' }),
  ap({ id: 't3', modelId: 'tip', mac: mac(), clientId: 'clin', currentModality: 'venda' }),
  // clientes fora da base, e o interno
  ap({ id: 'g5', modelId: 'gx', mac: mac(), clientId: 'antiga', currentModality: 'comodato' }),
  ap({ id: 'g6', modelId: 'gx', mac: mac(), clientId: 'lixo', currentModality: 'comodato' }),
  ap({ id: 't2', modelId: 'tip', mac: mac(), clientId: 'semeq', currentModality: 'locacao' }),
  ap({ id: 'g7', modelId: 'gx', mac: mac(), clientId: 'ing', currentModality: 'comodato' }),
  // estoque
  ap({ id: 'g8', modelId: 'gx', mac: mac() }),
  ap({ id: 'g9', modelId: 'gx', mac: mac(), condition: 'inativo' }),
  ap({ id: 'g10', modelId: 'gx', note: 'veio do Nexus como N003' }),
  ap({ id: 'g11', modelId: 'gx', createdAt: dia('2026-09-30') }),
  ap({ id: 'h2', modelId: 'hs' }),
  ap({ id: 'h3', modelId: 'hs' }),
  ap({ id: 't4', modelId: 'tip', mac: mac(), valueCents: 35000, createdAt: dia('2026-09-25') }),
];

function mv(id: string, quando: string, modality: string, para: string | null, deviceIds: string[], p: Partial<MovimentacaoDaBase> = {}): MovimentacaoDaBase {
  return { id, modality, fromClientId: null, toClientId: para, unit: null, newCondition: null, createdAt: dia(quando), deviceIds, ...p };
}
const movimentacoes = [
  mv('mv1', '2026-06-10', 'locacao', 'hosp', ['g1', 'g2', 'g4'], { unit: 'Matriz' }),
  mv('mv1b', '2026-06-10', 'locacao', 'hosp', ['g3'], { unit: 'Unidade Simões Filho' }),
  // mesmo cliente, outra modalidade: não é chegada nova
  mv('mv2', '2026-07-01', 'comodato', 'hosp', ['g3'], { fromClientId: 'hosp', unit: 'Unidade Simões Filho' }),
  mv('mv3', '2026-06-12', 'locacao', 'clin', ['g9']),
  mv('mv4', '2026-06-15', 'comodato', 'antiga', ['g5']),
  mv('mv5', '2026-06-15', 'comodato', 'lixo', ['g6']),
  mv('mv6', '2026-06-20', 'locacao', 'semeq', ['t2']),
  mv('mv7', '2026-06-20', 'comodato', 'ing', ['g7']),
  mv('mv8', '2026-08-01', 'locacao', 'clin', ['t1']),
  mv('mv9', '2026-08-01', 'comodato', 'clin', ['d1']),
  mv('mv10', '2026-09-01', 'venda', 'clin', ['t3']),
  mv('mv11', '2026-09-12', 'devolucao', null, ['g9'], { fromClientId: 'clin', newCondition: 'inativo' }),
  mv('mv12', '2026-09-20', 'comodato', 'hosp', ['h1'], { unit: 'Matriz' }),
];

const base: BaseInventario = { agora, aparelhos, modelos, clientes, movimentacoes };
const r = relatoriosInventario(base);
const ap_ = (id: string) => r.aparelhos.find((x) => x.id === id)!;

describe('idNaAnotacao', () => {
  it('acha o MAC com ou sem separador, mas não confunde telefone com MAC', () => {
    expect(idNaAnotacao('MAC 00:0b:82:a1:b2:c3, sala 2')).toEqual({ tipo: 'mac', valor: '00:0B:82:A1:B2:C3' });
    expect(idNaAnotacao('etiqueta 000B82A1B2C3')).toEqual({ tipo: 'mac', valor: '00:0B:82:A1:B2:C3' });
    expect(idNaAnotacao('ligar para 557133334444')).toBeNull();
  });
  it('acha o N/S depois da marca e o código do Nexus', () => {
    expect(idNaAnotacao('N/S 36103G782A (base da recepção)')).toEqual({ tipo: 'serie', valor: '36103G782A' });
    expect(idNaAnotacao('sn: abc-123')).toEqual({ tipo: 'serie', valor: 'ABC-123' });
    expect(idNaAnotacao('veio do Nexus como N003')).toEqual({ tipo: 'serie', valor: 'N003' });
    // "série GXP" não tem número: não é código
    expect(idNaAnotacao('telefone da série GXP')).toBeNull();
    expect(idNaAnotacao(null)).toBeNull();
  });
});

describe('a vida de cada aparelho', () => {
  it('"desde" é a chegada ao cliente de agora; mudar a modalidade no mesmo cliente não reinicia', () => {
    expect(r.historicoDesde).toBe('2026-06-10');
    expect(ap_('g3').desde).toBe('2026-06-10');
    expect(ap_('h1').desde).toBe('2026-09-20');
    expect(ap_('h1').dias).toBe(19);
    // no estoque: desde a devolução, ou desde o cadastro
    expect(ap_('g9').desde).toBe('2026-09-12');
    expect(ap_('g8').desde).toBe('2026-06-01');
  });
  it('a história que não bate com o cadastro cai no dia do cadastro', () => {
    const torto = relatoriosInventario({ ...base, aparelhos: [ap({ id: 'x', modelId: 'gx', clientId: 'hosp', currentModality: 'locacao', createdAt: dia('2026-05-02') })], movimentacoes: [] });
    expect(torto.aparelhos[0]!.desde).toBe('2026-05-02');
  });
});

describe('quem tem o quê', () => {
  it('cliente × modelo, sem os vendidos, com o estoque à parte', () => {
    const q = r.quemTem;
    expect(q.modelos.map((m) => m.id)).toEqual(['gx', 'hs', 'tip', 'dp']);
    expect(q.linhas.map((l) => l.clienteId)).toEqual(['hosp', 'clin', 'antiga', 'ing', 'lixo', 'semeq']);
    const hosp = q.linhas[0]!;
    expect(hosp).toMatchObject({ total: 5, comodato: 2, locacao: 3, inativos: 1, valorCents: 189000, semValor: 0, unidades: 2, foraDaBase: null });
    expect(hosp.porModelo).toEqual({ gx: 4, hs: 1 });
    const clin = q.linhas[1]!;
    expect(clin).toMatchObject({ total: 2, valorCents: 38000, semValor: 1 }); // o vendido não entra; o DP722 não tem valor
    expect(q.linhas.find((l) => l.clienteId === 'antiga')!.foraDaBase).toBe('arquivado');
    expect(q.linhas.find((l) => l.clienteId === 'ing')!.interno).toBe(true);
    expect(q.totais).toMatchObject({ total: 11, comodato: 6, locacao: 5, valorCents: 400000 });
    expect(q.estoque.total).toBe(7);
    expect(q.estoque.porModelo).toEqual({ gx: 4, hs: 2, tip: 1 });
    expect(q.vendidos).toMatchObject({ aparelhos: 1, clientes: 1 });
  });
});

describe('cliente fora da base', () => {
  it('a marca no Quem tem o quê: lixeira, arquivado, sem produto, sem o Equipamentos; o interno nunca', () => {
    const marca = (id: string) => r.quemTem.linhas.find((l) => l.clienteId === id)!.foraDaBase;
    expect([marca('lixo'), marca('antiga'), marca('semeq'), marca('hosp'), marca('ing')]).toEqual(['lixeira', 'arquivado', 'sem_equipamentos', null, null]);
    // mais de um motivo: vale o mais grave
    expect(clienteForaDaBase({ interno: false, naLixeiraDesde: dia('2026-09-01'), arquivado: true, produtosAtivos: 0, temEquipamentos: false })).toBe('lixeira');
    expect(clienteForaDaBase({ interno: false, naLixeiraDesde: null, arquivado: false, produtosAtivos: 0, temEquipamentos: false })).toBe('sem_produto');
    expect(clienteForaDaBase({ interno: true, naLixeiraDesde: null, arquivado: true, produtosAtivos: 0, temEquipamentos: false })).toBeNull();
  });
});

describe('na prateleira', () => {
  it('o ritmo é o dos últimos 90 dias; parado, acabou e em dia', () => {
    const p = r.prateleira;
    expect(p).toMatchObject({ desde: '2026-07-12', janelaDias: 90, ritmoConfiavel: true });
    expect(p.modelos.map((m) => [m.id, m.situacao])).toEqual([['dp', 'acabou'], ['gx', 'parado'], ['hs', 'ok'], ['tip', 'ok']]);
    const gx = p.modelos.find((m) => m.id === 'gx')!;
    expect(gx).toMatchObject({ ativos: 3, inativos: 1, saidas: 0, idadeMediana: 130, maisAntigo: 130, valorCents: 180000 });
    const tip = p.modelos.find((m) => m.id === 'tip')!;
    // duas saídas em 90 dias (a venda conta: saiu do estoque) = 0,16 por semana; 1 ativo dá para ~6 semanas
    expect(tip.saidas).toBe(2);
    expect(tip.semanas!).toBeCloseTo(6.43, 1);
    expect(p.faixas.map((f) => f.n)).toEqual([2, 0, 4, 0]);
    expect(p.totais).toEqual({ ativos: 6, inativos: 1, valorCents: 188000, valorInativosCents: 45000, paradosHaMuito: 4 });
  });
  it('pouco estoque para o ritmo vira "pouco"; com menos de 4 semanas de histórico, sem conta', () => {
    const saidas = Array.from({ length: 6 }, (_, i) => ap({ id: `s${i}`, modelId: 'tip', mac: mac(), clientId: 'clin', currentModality: 'locacao' }));
    const movs = saidas.map((s, i) => mv(`m${i}`, `2026-09-${String(10 + i).padStart(2, '0')}`, 'locacao', 'clin', [s.id]));
    const antigo = mv('velho', '2026-05-01', 'locacao', 'hosp', ['g1']);
    const comPouco = relatoriosInventario({ agora, modelos, clientes, aparelhos: [...saidas, ap({ id: 'resta', modelId: 'tip', mac: mac() })], movimentacoes: [antigo, ...movs] });
    expect(comPouco.prateleira.modelos[0]).toMatchObject({ id: 'tip', ativos: 1, saidas: 6, situacao: 'pouco' });
    const novo = relatoriosInventario({ agora, modelos, clientes, aparelhos: [...saidas, ap({ id: 'resta', modelId: 'tip', mac: mac() })], movimentacoes: movs });
    expect(novo.prateleira).toMatchObject({ desde: '2026-09-10', janelaDias: 30, ritmoConfiavel: true });
    const curto = relatoriosInventario({ agora, modelos, clientes, aparelhos: [...saidas, ap({ id: 'resta', modelId: 'tip', mac: mac() })], movimentacoes: movs.slice(3) });
    expect(curto.prateleira).toMatchObject({ janelaDias: 27, ritmoConfiavel: false });
    expect(curto.prateleira.modelos[0]).toMatchObject({ situacao: 'sem_ritmo', porSemana: null, semanas: null });
  });
});

describe('quanto vale o parque', () => {
  it('estoque, comodato, locação e uso interno; o vendido fica de fora', () => {
    const v = r.valor;
    const parte = (id: string) => v.partes.find((p) => p.id === id)!;
    expect(parte('comodato')).toMatchObject({ n: 5, valorCents: 144000 });
    expect(parte('locacao')).toMatchObject({ n: 5, valorCents: 211000 });
    expect(parte('interno')).toMatchObject({ n: 1, valorCents: 45000 });
    expect(parte('estoque')).toMatchObject({ n: 6, valorCents: 188000 });
    expect(parte('estoque_inativo')).toMatchObject({ n: 1, valorCents: 45000 });
    expect(v.totalCents).toBe(633000);
    expect(v.aparelhos).toBe(18);
    expect(v.semValor).toBe(1);
    expect(v.vendidos).toEqual({ n: 1, valorCents: 38000 });
    expect(v.porModelo.map((m) => [m.id, m.valorCents])).toEqual([['gx', 495000], ['tip', 111000], ['hs', 27000], ['dp', 0]]);
    expect(v.porModelo.find((m) => m.id === 'tip')!.proprio).toBe(1);
  });
});

describe('vai e volta', () => {
  it('saídas, devoluções, quem volta inativo e quanto tempo ficou no cliente', () => {
    const v = r.vaiEVolta;
    expect(v.totais).toEqual({ saidas: 13, devolucoes: 1, voltaramInativos: 1, transferencias: 0 });
    expect(v.porModelo[0]).toMatchObject({ id: 'gx', saidas: 8, devolucoes: 1, inativos: 1, medianaDias: 92, idsInativos: ['g9'] });
    expect(v.porCliente[0]).toMatchObject({ clienteId: 'clin', recebeu: 4, devolveu: 1, inativos: 1, ultimaDevolucao: '2026-09-12' });
    expect(v.porCliente[1]).toMatchObject({ clienteId: 'hosp', recebeu: 5, devolveu: 0 });
    expect(v.ultimas).toEqual([{ id: 'mv11', dia: '2026-09-12', clienteId: 'clin', cliente: 'Clínica Aurora', n: 1, inativos: 1, modelos: '1× Grandstream GXP1610', ids: ['g9'] }]);
  });
  it('passar de um cliente para outro é transferência, não saída do estoque', () => {
    const t = relatoriosInventario({ ...base, movimentacoes: [...movimentacoes, mv('mv13', '2026-10-01', 'comodato', 'hosp', ['t1'], { fromClientId: 'clin' })] });
    expect(t.vaiEVolta.totais).toMatchObject({ saidas: 13, transferencias: 1 });
    expect(t.vaiEVolta.porCliente.find((c) => c.clienteId === 'hosp')!.recebeu).toBe(6);
  });
});

describe('cadastro em dia', () => {
  it('as pendências e o que vale conferir', () => {
    const c = r.cadastro;
    const item = (id: string) => c.itens.find((i) => i.id === id)!;
    expect(item('id_na_anotacao').aparelhos).toEqual([{ id: 'g10', dica: 'N/S na anotação: N003' }]);
    // o g11 é um GXP sem nada; os headsets, que nunca têm, não entram
    expect(item('sem_identificacao').aparelhos).toEqual([{ id: 'g11', dica: null }]);
    expect(item('modelo_sem_valor').modelos).toEqual([{ id: 'dp', nome: 'Grandstream DP722', aparelhos: 1 }]);
    // só os clientes na base: o Hospital tem o login do GXP e a rede; a Clínica não tem o do TIP
    expect(item('sem_login').clientes).toEqual([{ clienteId: 'clin', nome: 'Clínica Aurora', modelos: ['Intelbras TIP 125i'] }]);
    expect(item('sem_rede').clientes!.map((x) => x.clienteId)).toEqual(['clin']);
    expect(item('valor_proprio').aparelhos!.map((x) => x.id)).toEqual(['t4']);
    expect(item('modelo_sem_foto').modelos!.map((x) => x.id)).toEqual(['hs', 'dp']);
    expect(c.pendencias).toBe(5);
  });
});
