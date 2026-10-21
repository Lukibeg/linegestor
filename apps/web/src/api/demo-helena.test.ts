/**
 * A prévia do Trazer do Helena (demo-helena.ts, 2.0.3) vale igual ao servidor: estes testes passam pela mesma
 * `demoApi` que a página publicada usa. O Luan (a administração) importa e cuida dos painéis; a Camila
 * (Comercial) não pode trazer.
 */
import { describe, expect, it } from 'vitest';
import { textoDoEvento, type LeituraDoHelenaNaTela } from '@gestor/shared';
import { demoApi } from './demo.js';
import { ApiError } from './types.js';

const api = demoApi.helena;
async function entrar(quem: 'admin' | 'camila') {
  await demoApi.auth.logout();
  return (await demoApi.auth.login(`${quem}@gestor.local`, 'demo')).user!;
}
async function erroDe(p: Promise<unknown>): Promise<ApiError> {
  try { await p; } catch (e) { if (e instanceof ApiError) return e; throw e; }
  throw new Error('Era para dar erro, e passou.');
}
/** Lê o Helena de exemplo até o fim (a leitura anda a cada pergunta, como a barra da tela). */
async function lerTudo(): Promise<LeituraDoHelenaNaTela> {
  let l = await api.ler('helena-comercial');
  for (let i = 0; i < 20 && l.estado === 'lendo'; i++) l = await api.leitura(l.id);
  return l;
}
const textos = (f: { historico: Array<{ tipo: any; dados: any }> }) => f.historico.map((e) => textoDoEvento(e.tipo, e.dados).replace(/ /g, ' '));

describe('trazer do Helena (a prévia)', () => {
  it('só quem importa e cuida dos painéis', async () => {
    await entrar('camila');
    expect((await erroDe(api.opcoes())).status).toBe(403);
    await entrar('admin');
    const o = await api.opcoes();
    expect(o.conectado).toBe(true);
    expect(o.helena[0]).toMatchObject({ nome: 'Ingline - Comercial', vendas: true });
    expect(o.destinos.map((d) => d.sigla)).toContain('COM');
  });

  it('a leitura anda card a card; a prévia diz o que vai acontecer, nos dois destinos', async () => {
    await entrar('admin');
    const l = await lerTudo();
    expect(l).toMatchObject({ estado: 'pronta', lidos: 10, total: 10 });
    const nova = await api.previa(l.id, null);
    expect(nova.destino).toMatchObject({ novo: true, nome: 'Comercial', sigla: 'IC' });
    expect(nova.negociacoes).toMatchObject({ total: 9, novas: 9, atualizadas: 0, arquivadasFora: 1 });
    expect(nova.numeros.ganhas.qtd).toBe(4);
    expect(nova.numeros.emAndamento).toEqual({ qtd: 3, valor: 290_000 });
    expect(nova.etapas.ordem).toHaveLength(13);
    expect(nova.pessoas.find((x) => x.nome === 'Luan França')).toMatchObject({ pessoa: 'Luan França', como: 'nome' });
    expect(nova.empresas.lista.find((e) => e.titulo === 'Distribuidora Norte - VoiceNet')).toMatchObject({ cliente: 'Distribuidora Norte', como: 'nome' });
    expect(nova.avisos.some((a) => a.includes('(Cópia)'))).toBe(true);
    expect(nova.erro).toBeNull();
    // no painel Comercial (COM) que já existe: as etapas dele com negociações ficam, e os números livres de lá
    const com = (await api.opcoes()).destinos.find((d) => d.sigla === 'COM')!;
    const noCom = await api.previa(l.id, com.id);
    expect(noCom.destino).toMatchObject({ novo: false, sigla: 'COM' });
    expect(noCom.etapas.ficam.length).toBeGreaterThan(0);
    expect(noCom.etapas.ordem.slice(-2)).toEqual(['Ganho', 'Perdido']);
  });

  it('o Trazer cria o painel IC com as negociações e o histórico; de novo, atualiza sem duplicar', async () => {
    await entrar('admin');
    const l = await lerTudo();
    const r = await api.trazer(l.id, null);
    expect(r.resumo).toBe('Trouxe do Helena o painel Ingline - Comercial para o painel novo Comercial (IC): 9 negociações (9 novas)');
    const f = await demoApi.atendimento.chamado('IC-34');
    expect(f).toMatchObject({ titulo: 'Arena Esportes - LinePBX', resultado: 'ganho', valor: 40_000, origem: 'helena' });
    expect(textos(f)[0]).toBe('criou a negociação (Trazida do Helena, era IC-34) em Aguardando Implantação');
    expect(textos(f)).toContain('moveu de Em processo de Implantação para Cliente na base');
    // o card duplicado: sem o "(Cópia)", com a mensalidade por produto (a soma bate)
    const bem = await demoApi.atendimento.chamado('IC-12');
    expect(bem).toMatchObject({ titulo: 'Clínica Bem-Estar', resultado: 'ganho', valor: 169_000 });
    expect(Object.values(bem.valoresDosProdutos).reduce((t, v) => t + v, 0)).toBe(169_000);
    // o relatório do painel novo: as ganhas pela Conclusão
    const dia = (atras: number) => new Date(Date.now() - 3 * 3_600_000 - atras * 86_400_000).toISOString().slice(0, 10);
    const rel = await demoApi.atendimento.relatorioDeVendas({ painel: r.painelId, de: dia(360), ate: dia(0) });
    expect(rel.numeros.ganhos.qtd).toBe(4);
    expect(rel.numeros.perdidos.qtd).toBe(2);
    // de novo: atualiza
    const l2 = await lerTudo();
    const p2 = await api.previa(l2.id, r.painelId);
    expect(p2.negociacoes).toMatchObject({ total: 9, novas: 0, atualizadas: 9 });
    const r2 = await api.trazer(l2.id, r.painelId);
    expect(r2.resumo).toBe('Trouxe do Helena o painel Ingline - Comercial para o painel Comercial (IC): 9 negociações (9 atualizadas)');
    const f2 = await demoApi.atendimento.chamado('IC-34');
    expect(textos(f2).filter((t) => t.startsWith('criou a negociação'))).toHaveLength(1);
    // a auditoria
    const aud = (await demoApi.admin.audit({ pageSize: 20 })).items as Array<{ action: string; summary: string }>;
    expect(aud.filter((a) => a.action === 'import' && a.summary.startsWith('Trouxe do Helena'))).toHaveLength(2);
  });
});
