/**
 * O menu (2.0.2): o Painel do Suporte fica marcado nas telas do painel Suporte — o quadro, a lista, o
 * relatório, o Abrir chamado e a ficha de um chamado SUP —, e Painéis nas outras.
 */
import { describe, expect, it } from 'vitest';
import type { EtapaPainel, Painel } from '@gestor/shared';
import { NAV, eDoSuporte, parteDoPainel, parteDoSuporte } from './AppShell.js';
import { painelDaImplantacao } from '../../pages/atendimento/Suporte.js';

describe('o grupo Técnico (2.0.2)', () => {
  it('os Circuitos e DIDs e o Inventário moram nele, logo acima do Suporte ("quero q o técnico fique acima de suporte"), e não mais no alto', () => {
    const nomes = NAV.map((x) => ('grupo' in x ? `[${x.label}]` : x.label));
    expect(nomes).toEqual(['Painel', 'Clientes', 'Calendário', 'Painéis', '[Técnico]', '[Suporte]', '[Comercial]', '[Base de conhecimento]', 'Novidades', 'Administração']);
    const tecnico = NAV.find((x) => 'grupo' in x && x.grupo === 'tecnico');
    expect(tecnico && 'itens' in tecnico ? tecnico.itens.map((i) => [i.label, i.to]) : null).toEqual([['Circuitos e DIDs', '/circuitos'], ['Inventário', '/inventario']]);
    // o Simulador (2.0.2) mora no Comercial
    const comercial = NAV.find((x) => 'grupo' in x && x.grupo === 'comercial');
    expect(comercial && 'itens' in comercial ? comercial.itens.map((i) => i.label) : null).toEqual(['Painel do Comercial', 'Relatórios', 'Simulador']);
  });
});

describe('os Relatórios e o Legado do Helena (2.1)', () => {
  it('o Suporte tem os Relatórios novos (os do painel) e, à parte, o Legado do Helena (os do LineChat)', () => {
    const suporte = NAV.find((x) => 'grupo' in x && x.grupo === 'suporte');
    expect(suporte && 'itens' in suporte ? suporte.itens.map((i) => [i.label, i.to]) : null).toEqual([
      ['Painel do Suporte', '/suporte'], ['Painel da Implantação', '/suporte/implantacao'], ['Meu dia', '/atendimento/meu-dia'], ['Projetos', '/projetos'], ['Relatórios', '/suporte/relatorios'], ['Legado do Helena', '/chamados'],
    ]);
  });
  it('a vista Relatórios do painel Suporte marca os Relatórios; o quadro, a lista e a ficha, o Painel do Suporte', () => {
    expect(parteDoSuporte('/atendimento/relatorio', '?painel=painel-suporte&aba=tempo', 'SUP')).toBe('relatorios');
    expect(parteDoSuporte('/atendimento/relatorio', '?painel=SUP', 'SUP')).toBe('relatorios');
    expect(parteDoSuporte('/atendimento/quadro', '?painel=painel-suporte', 'SUP')).toBe('painel');
    expect(parteDoSuporte('/atendimento/SUP-12', '', 'SUP')).toBe('painel');
    // os relatórios de outro painel não são do Suporte
    expect(parteDoSuporte('/atendimento/relatorio', '?painel=painel-desenvolvimento', 'SUP')).toBeNull();
  });
});

describe('o Painel do Suporte no menu', () => {
  it('as telas do painel Suporte, pelo endereço (?painel=) ou pela sigla do chamado', () => {
    for (const [caminho, busca] of [['/atendimento/quadro', '?painel=painel-suporte'], ['/atendimento/lista', '?painel=SUP'], ['/atendimento/relatorio', '?painel=painel-suporte&de=x'], ['/atendimento/novo', '?painel=painel-suporte']]) {
      expect(eDoSuporte(caminho!, busca!, 'SUP'), caminho).toBe(true);
    }
    expect(eDoSuporte('/atendimento/SUP-12', '', 'SUP')).toBe(true);
    expect(eDoSuporte('/atendimento/sup-12', '', 'SUP')).toBe(true);
  });

  it('as outras: os outros painéis, a tela de todos, os Ajustes, o Meu dia e fora dos painéis', () => {
    expect(eDoSuporte('/atendimento/quadro', '?painel=painel-desenvolvimento', 'SUP')).toBe(false);
    expect(eDoSuporte('/atendimento/DEV-3', '', 'SUP')).toBe(false);
    for (const caminho of ['/atendimento', '/atendimento/ajustes', '/atendimento/meu-dia', '/calendario']) expect(eDoSuporte(caminho, '', 'SUP'), caminho).toBe(false);
    // sem saber a sigla (as opções ainda não chegaram), só o endereço com o id
    expect(eDoSuporte('/atendimento/SUP-12', '', null)).toBe(false);
    expect(eDoSuporte('/atendimento/quadro', '?painel=painel-suporte', null)).toBe(true);
  });
});

describe('o Painel da Implantação no menu Suporte (2.3)', () => {
  const etapa = (extra: Partial<EtapaPainel>) => ({ id: 'e', nome: 'E', tipo: 'andamento', ...extra }) as EtapaPainel;
  const painel = (id: string, tipo: 'gestao' | 'vendas', etapas: EtapaPainel[], ativo = true) => ({ id, sigla: id.toUpperCase(), tipo, ativo, etapas }) as unknown as Painel;
  it('é o painel que a etapa do Comercial abre; sem ela, o que liga no cadastro; só os ativos', () => {
    const imp = painel('imp', 'gestao', [etapa({ ligaNoCadastro: true })]);
    const outro = painel('ati', 'gestao', [etapa({ ligaNoCadastro: true })]);
    const com = painel('com', 'vendas', [etapa({ abreImplantacao: 'ati' })]);
    expect(painelDaImplantacao([imp, outro, com])?.id).toBe('ati');
    expect(painelDaImplantacao([imp, outro])?.id).toBe('imp');
    expect(painelDaImplantacao([painel('sup', 'gestao', [etapa({})])])).toBeNull();
    expect(painelDaImplantacao([painel('imp', 'gestao', [etapa({ ligaNoCadastro: true })], false)])).toBeNull();
  });
  it('as telas dele marcam o item (o quadro, a lista e a ficha IMP-3); as dos outros, não', () => {
    const imp = { id: 'painel-implantacao', sigla: 'IMP' };
    expect(parteDoPainel('/atendimento/quadro', '?painel=painel-implantacao', imp)).toBe('painel');
    expect(parteDoPainel('/atendimento/lista', '?painel=IMP', imp)).toBe('painel');
    expect(parteDoPainel('/atendimento/IMP-3', '', imp)).toBe('painel');
    expect(parteDoPainel('/atendimento/SUP-3', '', imp)).toBeNull();
    expect(parteDoPainel('/atendimento/quadro', '?painel=painel-suporte', imp)).toBeNull();
    expect(parteDoPainel('/atendimento/quadro', '?painel=painel-implantacao', null)).toBeNull();
  });
});
