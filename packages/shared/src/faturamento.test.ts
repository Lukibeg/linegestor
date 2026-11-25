import { describe, expect, it } from 'vitest';
import {
  descricaoDoFaturamento, informacoesDoFaturamento, pedidoDoPlano, PedidoDoFaturamentoSchema, produtosDoFaturamento, tituloDoFaturamento, type PlanoDoFaturamento,
} from './faturamento.js';
import { condicoesGuardadas } from './negociacao.js';
import type { CenarioDaSimulacao, LinhaDoCenario } from './simulador.js';

/** Uma linha do cenário, só com o que o faturamento lê. */
const linha = (l: Partial<LinhaDoCenario> & Pick<LinhaDoCenario, 'nome' | 'tipo' | 'qtd'>): LinhaDoCenario => ({
  id: l.nome, custoId: null, valor: 1000, modalidade: null, preco: null, faixas: null, unidade: null, ...l,
});
/** O cenário do card GLA-67 do Luan: o LinePBX e o LineChat, com as licenças de cada um. */
const cenario: Pick<CenarioDaSimulacao, 'linhas' | 'produtos'> = {
  produtos: ['linepbx', 'linechat'],
  linhas: [
    linha({ nome: 'Licenças ramais coorporativos', tipo: 'mensal', qtd: 15, produto: 'linepbx' }),
    // sem produto: vai para o primeiro do cenário (como no Simulador)
    linha({ nome: 'Licenças usuários de callcenter', tipo: 'mensal', qtd: 6 }),
    linha({ nome: 'Telefone IP', tipo: 'aparelho', qtd: 4, modalidade: 'comodato', produto: 'linepbx' }),
    linha({ nome: 'Licenças usuários callcenter', tipo: 'mensal', qtd: 12, produto: 'linechat' }),
    linha({ nome: 'Licenças números Whatsapp', tipo: 'mensal', qtd: 2, produto: 'linechat' }),
    linha({ nome: 'Contatos ativos no mês', tipo: 'mensal', qtd: 12_000, produto: 'linechat' }),
    // o que não vai: o percentual, o de uma vez, a linha zerada e a de um produto que a negociação não tem
    linha({ nome: 'Impostos', tipo: 'pct_mensalidade', qtd: 0, produto: 'linechat' }),
    linha({ nome: 'Instalação', tipo: 'unica', qtd: 1, produto: 'linechat' }),
    linha({ nome: 'Licenças extras', tipo: 'mensal', qtd: 0, produto: 'linechat' }),
    linha({ nome: 'Tronco', tipo: 'mensal', qtd: 2, produto: 'voicenet' }),
  ],
};
const produtos = [{ id: 'p1', codigo: 'linepbx', nome: 'LinePBX' }, { id: 'p2', codigo: 'linechat', nome: 'Linechat' }];

describe('o card de faturamento (2.4.11, decisão 0066): as informações no formato do Luan', () => {
  it('os produtos da negociação, com a mensalidade de cada um e os itens da simulação principal', () => {
    expect(produtosDoFaturamento({ produtos, valores: { p1: 95_400, p2: 73_600 }, cenario })).toEqual([
      {
        nome: 'LinePBX', mensalidade: 95_400,
        itens: [{ qtd: 15, nome: 'Licenças ramais coorporativos' }, { qtd: 6, nome: 'Licenças usuários de callcenter' }, { qtd: 4, nome: 'Telefone IP (comodato)' }],
      },
      {
        nome: 'Linechat', mensalidade: 73_600,
        itens: [{ qtd: 12, nome: 'Licenças usuários callcenter' }, { qtd: 2, nome: 'Licenças números Whatsapp' }, { qtd: 12_000, nome: 'Contatos ativos no mês' }],
      },
    ]);
    // sem simulação: os produtos, sem itens; sem o valor por produto, a mensalidade fica nula
    expect(produtosDoFaturamento({ produtos, valores: null, cenario: null })).toEqual([
      { nome: 'LinePBX', mensalidade: null, itens: [] }, { nome: 'Linechat', mensalidade: null, itens: [] },
    ]);
  });

  it('a ativação com o combinado, o desconto e a OBS; depois cada produto, com as quantidades de dois algarismos', () => {
    const condicoes = condicoesGuardadas({ descontos: [{ valor: 20_000, ate: '2027-03' }], ativacao: { aPartirDe: '2027-03', vezes: 5 }, observacao: ' vai ser faturado a partir de março/27 ' });
    const texto = informacoesDoFaturamento({ mensalidade: 169_000, ativacao: 300_000, condicoes, produtos: produtosDoFaturamento({ produtos, valores: { p1: 95_400, p2: 73_600 }, cenario }) });
    expect(texto).toBe([
      'Ativação R$ 3.000,00 em 5 vezes, a partir de mar/2027',
      'Desconto na mensalidade: R$ 200,00/mês até mar/2027',
      'OBS: vai ser faturado a partir de março/27',
      '',
      'LinePBX: R$ 954,00',
      '15 Licenças ramais coorporativos',
      '06 Licenças usuários de callcenter',
      '04 Telefone IP (comodato)',
      '',
      'Linechat: R$ 736,00',
      '12 Licenças usuários callcenter',
      '02 Licenças números Whatsapp',
      '12.000 Contatos ativos no mês',
    ].join('\n'));
  });

  it('sem o valor por produto, a mensalidade vai numa linha só, antes dos produtos (com um só, é a dele); sem nada, fica vazio', () => {
    expect(informacoesDoFaturamento({ mensalidade: 169_000, ativacao: null, condicoes: null, produtos: produtosDoFaturamento({ produtos, valores: null, cenario: null }) }))
      .toBe('Mensalidade: R$ 1.690,00\n\nLinePBX\n\nLinechat');
    expect(informacoesDoFaturamento({ mensalidade: 99_000, ativacao: null, condicoes: null, produtos: produtosDoFaturamento({ produtos: produtos.slice(1), valores: null, cenario }) }))
      .toBe('Linechat: R$ 990,00\n12 Licenças usuários callcenter\n02 Licenças números Whatsapp\n12.000 Contatos ativos no mês');
    expect(informacoesDoFaturamento({ mensalidade: null, ativacao: null, condicoes: null, produtos: [] })).toBe('');
  });

  it('a descrição: "Faturamento <cliente>", o e-mail, o vencimento, o CNPJ, uma linha em branco e as informações (o vazio não entra)', () => {
    expect(descricaoDoFaturamento({
      cliente: ' Clínica EVAB ', email: 'financeiro@evab.com.br/barbara@evab.com.br', vencimento: '2026-11-10', cnpj: '12.345.678/0001-90', informacoes: 'LinePBX: R$ 954,00\r\n15 Licenças',
    })).toBe([
      'Faturamento Clínica EVAB', 'E-mail para faturamento: financeiro@evab.com.br/barbara@evab.com.br', 'Data de vencimento: 10/11/2026', 'CNPJ do faturamento: 12.345.678/0001-90',
      '', 'LinePBX: R$ 954,00', '15 Licenças',
    ].join('\n'));
    expect(descricaoDoFaturamento({ cliente: 'Clínica EVAB', email: ' ', vencimento: null, cnpj: null, informacoes: '  ' })).toBe('Faturamento Clínica EVAB');
    expect(tituloDoFaturamento('  Clínica EVAB ')).toBe('Clínica EVAB - Faturamento');
    expect(tituloDoFaturamento('x'.repeat(250))).toHaveLength(200);
  });

  it('o que a janela manda: o título com 3 letras, o vencimento como dia, o vazio vira nulo', () => {
    expect(PedidoDoFaturamentoSchema.parse({ titulo: ' Clínica EVAB - Faturamento ', email: '', vencimento: '', cnpj: ' ' }))
      .toEqual({ titulo: 'Clínica EVAB - Faturamento', email: null, vencimento: null, cnpj: null, informacoes: '' });
    expect(PedidoDoFaturamentoSchema.safeParse({ titulo: 'ab' }).success).toBe(false);
    expect(PedidoDoFaturamentoSchema.safeParse({ titulo: 'Faturamento', vencimento: '10/11/2026' }).success).toBe(false);
    expect(PedidoDoFaturamentoSchema.safeParse({ titulo: 'Faturamento', informacoes: 'x'.repeat(20_001) }).success).toBe(false);
    const plano: PlanoDoFaturamento = {
      painel: { id: 'adm', nome: 'Grupo Line - ADM', sigla: 'GLA' }, etapa: 'A faturar', jaAberto: null, cliente: 'Clínica EVAB', nome: 'Clínica EVAB',
      titulo: 'Clínica EVAB - Faturamento', email: 'financeiro@evab.com.br', vencimento: null, cnpj: '12.345.678/0001-90', informacoes: 'LinePBX',
      origem: { negociacao: 'COM-12', simulacao: 'EVAB' },
    };
    expect(pedidoDoPlano(plano)).toEqual({ titulo: 'Clínica EVAB - Faturamento', email: 'financeiro@evab.com.br', vencimento: null, cnpj: '12.345.678/0001-90', informacoes: 'LinePBX' });
  });
});
