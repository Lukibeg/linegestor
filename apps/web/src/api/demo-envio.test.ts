/**
 * O envio automático na prévia (2.4.5, decisão 0061) vale igual ao servidor: um envio por painel, o PDF do painel com a
 * Visão geral de hoje e os relatórios marcados, o aviãozinho marcando para o painel e o histórico dizendo de onde saiu.
 */
import { describe, expect, it } from 'vitest';
import { demoApi } from './demo.js';

const api = demoApi;
async function entrar() {
  await demoApi.auth.logout();
  return (await demoApi.auth.login('admin@gestor.local', 'demo')).user!;
}

describe('o envio automático na prévia (2.4.5)', () => {
  it('nasce com o envio do Suporte, e as origens são os painéis de chamados e o Legado', async () => {
    await entrar();
    const a = await api.envio.ajustes();
    expect(a.envios.map((e) => [e.origem, e.origemNome, e.ativo])).toEqual([['painel-suporte', 'Suporte', false]]);
    expect(a.origens.map((o) => o.id)).toContain('legado');
    expect(a.origens.map((o) => o.id)).not.toContain('painel-comercial');
    expect(a.envios[0]!.marcados.relatorios.map((r) => r.titulo)).toEqual(['Relógio do chamado', 'Primeira resposta', 'Fechamento do mês']);
  });

  it('o PDF do painel: a Visão geral de hoje, os gráficos na arrumação e os relatórios do dia', async () => {
    await entrar();
    const p = await api.envio.pacote({ envio: 'principal' });
    if (p.tipo !== 'painel') throw new Error('esperava o pacote de um painel');
    expect(p.painel.sigla).toBe('SUP');
    expect(p.kpis.map((k) => k.label)).toContain('Chegaram hoje');
    expect(p.graficos.map((g) => g.id)).toEqual(['serie', 'assunto', 'etapa']);
    expect(p.relatorioIds).toEqual(['relogio', 'resposta', 'fechamento']);
    expect([p.relatorios!.periodo.de, p.relatorios!.periodo.ate]).toEqual([p.dia, p.dia]);
    // o Legado continua abrindo pela origem
    expect((await api.envio.pacote({ origem: 'legado' })).tipo).toBe('legado');
  });

  it('dois envios, um por painel; o aviãozinho marca para o painel; o histórico diz de onde saiu', async () => {
    await entrar();
    const a = await api.envio.ajustes();
    const base = { url: a.url, remetente: a.remetente, concluirConversa: true };
    const sup = { ...a.envios[0]!, destinatarios: a.envios[0]!.destinatarios };
    const dev = { id: 'dev', origem: 'painel-desenvolvimento', ativo: false, horario: '18:30', dias: [0, 1, 2, 3, 4], destinatarios: [{ id: 'x', nome: 'Devs', numero: '(71) 99999-0002', ativo: true }] };
    await expect(api.envio.salvarAjustes({ ...base, envios: [sup, { ...dev, origem: 'painel-suporte' }] })).rejects.toThrow('Cada painel tem um envio só');
    const salvo = await api.envio.salvarAjustes({ ...base, envios: [sup, dev] });
    expect(salvo.envios.map((e) => e.origemNome)).toEqual(['Suporte', 'Desenvolvimento']);

    await api.envio.salvarMarcados({ graficos: ['serie'], relatorios: ['equipe'] }, 'painel-desenvolvimento');
    expect((await api.envio.marcados('painel-desenvolvimento')).relatorios).toEqual(['equipe']);
    expect((await api.envio.marcados('painel-suporte')).relatorios).toEqual(['relogio', 'resposta', 'fechamento']);
    await expect(api.envio.salvarMarcados({ graficos: [], relatorios: ['mes'] }, 'painel-desenvolvimento')).rejects.toThrow();

    const r = await api.envio.enviar('dev');
    expect(r).toMatchObject({ ok: true, envioId: 'dev', origemNome: 'Desenvolvimento' });
    expect(r.pdf?.nome).toMatch(/^chamados-dev-\d{2}-\d{2}-\d{4}\.pdf$/);
    expect(r.itens).toEqual(['Chamados que chegaram hoje, por hora', 'Quadro da equipe']);
    expect((await api.envio.ajustes()).historico[0]).toMatchObject({ envioId: 'dev', origemNome: 'Desenvolvimento' });
  });
});
