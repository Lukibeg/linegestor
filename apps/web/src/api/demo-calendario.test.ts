/**
 * A prévia do calendário (demo-calendario.ts, 2.0.1) vale igual ao servidor: estes testes passam pela
 * mesma `demoApi` que a página publicada usa, entrando como as pessoas da prévia. O Suporte e o
 * Desenvolvimento são de todos; o Administrativo, da Marina e da Camila; o Comercial, da Camila e do Diego.
 */
import { describe, expect, it, vi } from 'vitest';
import { hojeNoCalendario, quemEstaFora, somarDias, TIPOS_DE_EVENTO_PADRAO, type EventoDoCalendario } from '@gestor/shared';
import { demoApi } from './demo.js';
import { ApiError } from './types.js';

const api = demoApi.calendario;
const SENHA_DA_PREVIA = 'demo';
type Quem = 'admin' | 'tecnico' | 'operador' | 'leitor' | 'bruno' | 'camila' | 'diego';
async function entrar(quem: Quem) {
  await demoApi.auth.logout();
  return (await demoApi.auth.login(`${quem}@gestor.local`, SENHA_DA_PREVIA)).user!;
}
async function erroDe(p: Promise<unknown>): Promise<ApiError> {
  try { await p; } catch (e) { if (e instanceof ApiError) return e; throw e; }
  throw new Error('Era para dar erro, e passou.');
}
const hoje = hojeNoCalendario();
const todos = () => api.eventos(somarDias(hoje, -40), somarDias(hoje, 40));
const titulos = async () => (await todos()).map((e) => e.titulo).sort();
const peloTitulo = async (t: string) => (await todos()).find((e) => e.titulo === t)!;
const gravavel = (e: EventoDoCalendario) => ({
  titulo: e.titulo, tipoId: e.tipoId, paineis: e.paineis, pessoas: e.pessoas, clienteId: e.clienteId, chamadoId: e.chamadoId, inicio: e.inicio, fim: e.fim,
  diaInteiro: e.diaInteiro, horaInicio: e.horaInicio, horaFim: e.horaFim, local: e.local, observacao: e.observacao, situacao: e.situacao,
  lembretes: e.lembretes, lembrarQuem: e.lembrarQuem,
});

describe('os exemplos e quem vê o quê', () => {
  it('os exemplos nascem pelas regras do servidor (nenhum recusado)', async () => {
    const aviso = vi.spyOn(console, 'warn');
    await entrar('admin');
    expect((await todos()).length).toBe(19);
    expect(aviso.mock.calls.filter((c) => String(c[0]).includes('calendário'))).toEqual([]);
    aviso.mockRestore();
  });

  it('cada um vê os painéis de que participa; o Luan (cuida dos chamados) vê todos', async () => {
    const nomes = async () => (await api.opcoes()).paineis.map((p) => p.sigla);
    await entrar('admin');
    expect(await nomes()).toEqual(['SUP', 'DEV', 'ADM', 'COM']);
    await entrar('tecnico');
    expect(await nomes()).toEqual(['SUP', 'DEV']);
    expect(await titulos()).not.toContain('Folga — Diego Farias');
    expect(await titulos()).not.toContain('Home office — Marina Costa');
    await entrar('operador');
    expect(await nomes()).toEqual(['SUP', 'DEV', 'ADM']);
    expect(await titulos()).toContain('Home office — Marina Costa');
    expect(await titulos()).not.toContain('Visita comercial — Construtora Horizonte');
    await entrar('diego');
    expect(await nomes()).toEqual(['SUP', 'DEV', 'COM']);
    expect(await titulos()).toContain('Visita comercial — Construtora Horizonte');
    expect(await titulos()).not.toContain('Fechamento do mês com o financeiro');
    await entrar('camila');
    expect((await todos()).length).toBe(19);
    // o Leitor vê, não mexe
    await entrar('leitor');
    const ol = await api.opcoes();
    expect([ol.paineis.map((p) => p.sigla), ol.podeEditar, ol.podeCuidar]).toEqual([['SUP', 'DEV'], false, false]);
  });

  it('hoje, fora do escritório: cada um vê quem está fora nas equipes que vê', async () => {
    const fora = async () => quemEstaFora(await api.eventos(hoje, hoje), (await api.opcoes()).tipos, hoje).map((f) => `${f.tipo.nome}: ${f.pessoas.length}`);
    await entrar('tecnico');
    expect(await fora()).toEqual(['Home office: 1']);
    await entrar('admin');
    expect(await fora()).toEqual(['Home office: 1', 'Folga: 1']);
  });
});

describe('mexer no calendário', () => {
  it('o painel que não é da pessoa é recusado; quem edita não tira o evento de um painel que não vê', async () => {
    const marina = await entrar('operador');
    const op = await api.opcoes();
    const com = 'painel-comercial';
    expect((await erroDe(api.criar({ titulo: 'Teste', tipoId: 'reuniao', paineis: [com], inicio: hoje, fim: hoje }))).message)
      .toBe('O painel Comercial não é seu: escolha um dos painéis que você vê.');
    // a folga da Camila é do Administrativo e do Comercial: a Marina troca o Administrativo pelo Suporte, e o Comercial fica
    const folga = await peloTitulo('Folga — Camila Duarte');
    const r = await api.alterar(folga.id, { ...gravavel(folga), paineis: ['painel-suporte'], observacao: 'Combinado com a Marina.' });
    expect(r.paineis).toEqual(['painel-suporte', com]);
    expect(r.alteradoPor).toBe(marina.name);
    // a pessoa do evento vê um dos painéis dele
    const diego = op.pessoas.find((p) => p.nome === 'Diego Farias')!.id;
    expect((await erroDe(api.criar({ titulo: 'Reunião do ADM', tipoId: 'reuniao', paineis: ['painel-administrativo'], pessoas: [diego], inicio: hoje, fim: hoje }))).message)
      .toBe('Diego Farias não vê nenhum dos painéis do evento: inclua o painel dela ou tire a pessoa.');
    expect((await api.criar({ titulo: 'Reunião do ADM', tipoId: 'reuniao', paineis: ['painel-administrativo', 'painel-suporte'], pessoas: [diego], inicio: hoje, fim: hoje })).pessoas).toEqual([diego]);
  });

  it('o evento que a pessoa não vê não existe para ela; o Leitor não muda nada', async () => {
    await entrar('admin');
    const fechamento = await peloTitulo('Fechamento do mês com o financeiro');
    await entrar('tecnico');
    expect((await erroDe(api.remover(fechamento.id))).status).toBe(404);
    expect((await erroDe(api.situacao(fechamento.id, 'feito'))).status).toBe(404);
    await entrar('leitor');
    expect((await erroDe(api.criar({ titulo: 'x', tipoId: 'visita', paineis: ['painel-suporte'], inicio: hoje, fim: hoje }))).status).toBe(403);
  });

  it('feito, cancelado, a lixeira e o restaurar da Administração (com a auditoria)', async () => {
    await entrar('operador');
    const reuniao = await peloTitulo('Reunião do ADM');
    expect((await api.situacao(reuniao.id, 'feito')).situacao).toBe('feito');
    await api.remover(reuniao.id);
    expect(await titulos()).not.toContain('Reunião do ADM');
    await entrar('admin');
    const lixo = (await demoApi.admin.trash()).find((x) => x.id === reuniao.id);
    expect(lixo).toMatchObject({ type: 'calendarEvent', label: expect.stringContaining('· Reunião do ADM') });
    await demoApi.admin.restore('calendarEvent', reuniao.id);
    expect(await titulos()).toContain('Reunião do ADM');
    const resumos = (await demoApi.admin.audit({ entityType: 'calendar_event', pageSize: 50 })).items.map((a) => a.summary);
    expect(resumos.slice(0, 3)).toEqual([
      expect.stringMatching(/^Restaurou o evento do calendário "Reunião do ADM" \(\d\d\/\d\d\) da lixeira$/),
      expect.stringMatching(/^Mandou para a lixeira do calendário: "Reunião do ADM" \(Reunião, \d\d\/\d\d\)$/),
      expect.stringMatching(/^Marcou como feito no calendário: "Reunião do ADM"/),
    ]);
  });

  it('os tipos: só quem cuida; o tipo com evento desativa (não sai)', async () => {
    const tipos = TIPOS_DE_EVENTO_PADRAO.map((t) => ({ ...t }));
    await entrar('operador');
    expect((await erroDe(api.salvarTipos(tipos))).status).toBe(403);
    await entrar('admin');
    expect((await erroDe(api.salvarTipos(tipos.filter((t) => t.id !== 'visita')))).message).toBe('Visita já tem eventos: desative em vez de tirar.');
    const r = await api.salvarTipos(tipos.map((t) => (t.id === 'visita' ? { ...t, ativo: false } : t)));
    expect(r.tipos.find((t) => t.id === 'visita')?.ativo).toBe(false);
    expect((await erroDe(api.criar({ titulo: 'Visita', tipoId: 'visita', paineis: ['painel-suporte'], inicio: hoje, fim: hoje }))).message).toBe('O tipo Visita foi desativado: escolha outro.');
    await api.salvarTipos(tipos);
  });
});

describe('os lembretes na prévia (2.0.2), como no servidor', () => {
  const lembretesNoSininho = async () => (await demoApi.atendimento.avisos()).itens.filter((a) => a.tipo === 'lembrete');

  it('os exemplos já trazem o lembrete que saiu (o Luan, do retorno da Clínica Aurora); os tipos, os lembretes deles', async () => {
    await entrar('admin');
    const ev = await peloTitulo('Retorno — Clínica Aurora (o ramal da recepção)');
    expect([ev.lembretes, ev.lembrarQuem]).toEqual([[120, 15], 'pessoas']);
    const [l] = (await lembretesNoSininho()).filter((a) => a.evento?.id === ev.id);
    expect(l).toMatchObject({ lido: false, chamado: null, evento: { id: ev.id, inicio: ev.inicio }, texto: expect.stringMatching(/^Lembrete: Retorno — Clínica Aurora \(o ramal da recepção\), (hoje|amanhã), /) });
    expect((await api.opcoes()).tipos.find((t) => t.id === 'visita')!.lembretes).toEqual(TIPOS_DE_EVENTO_PADRAO.find((t) => t.id === 'visita')!.lembretes);
    // a visita dos exemplos veio com os lembretes do tipo
    expect((await peloTitulo('Visita técnica — Hospital Vale Verde')).lembretes).toEqual([1440, 60]);
  });

  it('o relógio da prévia manda na hora, uma vez, para as pessoas do evento', async () => {
    const luan = await entrar('admin');
    const dia = somarDias(hoje, 10);
    const e = await api.criar({ titulo: 'Reunião de teste dos lembretes', tipoId: 'reuniao', paineis: ['painel-suporte'], pessoas: [luan.id], inicio: dia, fim: dia, diaInteiro: false, horaInicio: '09:00', horaFim: '10:00', lembretes: [1440] });
    expect(e.lembretes).toEqual([1440]);
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      // um dia antes, às 09:01 (12:01 em UTC)
      vi.setSystemTime(new Date(`${somarDias(dia, -1)}T12:01:00Z`));
      const doEvento = async () => (await lembretesNoSininho()).filter((a) => a.evento?.id === e.id);
      expect((await doEvento()).map((a) => a.texto)).toEqual([`Lembrete: Reunião de teste dos lembretes, amanhã, ${dia.slice(8, 10)}/${dia.slice(5, 7)}, às 09:00`]);
      vi.setSystemTime(new Date(`${somarDias(dia, -1)}T12:05:00Z`));
      expect(await doEvento()).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });
});


describe('o aviso de que o evento entrou na prévia (2.0.2), como no servidor', () => {
  const doAviso = async (id: string) => (await demoApi.atendimento.avisos()).itens.filter((a) => a.tipo === 'evento_novo' && a.evento?.id === id);

  it('as pessoas do evento recebem na hora; quem pôs, não; sem pedir, ninguém', async () => {
    const luan = await entrar('admin');
    const marina = (await api.opcoes()).pessoas.find((p) => p.nome.startsWith('Marina'))!;
    const dia = somarDias(hoje, 12);
    const com = await api.criar({ titulo: 'Visita com aviso', tipoId: 'visita', paineis: ['painel-suporte'], pessoas: [luan.id, marina.id], inicio: dia, fim: dia, lembretes: [], avisar: 'pessoas' });
    const sem = await api.criar({ titulo: 'Visita sem aviso', tipoId: 'visita', paineis: ['painel-suporte'], pessoas: [luan.id, marina.id], inicio: dia, fim: dia, lembretes: [] });
    expect(await doAviso(com.id)).toEqual([]);
    await entrar('operador');
    const [a] = await doAviso(com.id);
    expect(a).toMatchObject({ lido: false, chamado: null, texto: expect.stringMatching(/^Luan França pôs no calendário: Visita com aviso, /), evento: { id: com.id, inicio: dia } });
    expect(await doAviso(sem.id)).toEqual([]);
    // todos que veem: o Desenvolvimento é de todos (o Lúcio recebe, o Luan não)
    await entrar('admin');
    const todos = await api.criar({ titulo: 'Reunião do Desenvolvimento', tipoId: 'reuniao', paineis: ['painel-desenvolvimento'], inicio: dia, fim: dia, lembretes: [], avisar: 'paineis' });
    expect(await doAviso(todos.id)).toEqual([]);
    await entrar('tecnico');
    expect(await doAviso(todos.id)).toHaveLength(1);
  });
});
