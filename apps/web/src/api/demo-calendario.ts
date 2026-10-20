/**
 * A PRÉVIA DO CALENDÁRIO (Patch 2.0.1, decisão 0049; os lembretes no 2.0.2): o calendário sem servidor.
 *
 * Copia o servidor (`apps/api/src/services/calendario.ts` e a rota `routes/calendario.ts`): as mesmas
 * permissões, as mesmas mensagens de erro e as mesmas frases na auditoria. As regras (os tipos, a janela,
 * quem vê, os dias) vêm do `@gestor/shared`, as mesmas do servidor. Os painéis e quem vê cada um vêm da
 * prévia dos chamados (demo-atendimento.ts): o Suporte e o Desenvolvimento (todos veem), o Administrativo
 * (a Marina e a Camila) e o Comercial (a Camila e o Diego). Entrando na prévia como cada um, dá para ver a
 * regra do pedido do Luan: cada um vê os eventos das equipes de que participa; o Luan, que cuida dos
 * chamados, vê todos.
 *
 * Os eventos de exemplo nascem em volta de hoje: o mês aberto sempre tem o que mostrar. Os LEMBRETES
 * (2.0.2) andam com o relógio da prévia dos chamados (a cada leitura, como o relógio do servidor) e chegam
 * no sininho; os exemplos já trazem os lembretes que "saíram" antes de a prévia abrir, e um que chega logo.
 */
import {
  chaveDoLembrete, comecoDoEvento, EventoGravarSchema, EventosDoPeriodoSchema, lembretesAoGravar, lembretesDevidos, momentoDoLembrete,
  NOME_SITUACAO_DO_EVENTO, quemRecebeOLembrete, SituacaoDoEventoSchema, TiposDoCalendarioSchema, diaDaSemana, diaEmBrasilia, eventoVisivel,
  hojeNoCalendario, paineisDepoisDaEdicao, somarDias, textoDoLembrete, textoDoPeriodo, textoDosLembretes, tipoDoEvento, tiposDeFabrica,
  NOME_QUEM_RECEBE_O_LEMBRETE, quemRecebeAInclusao, textoDaInclusao,
  type CalendarioOpcoes, type EventoDoCalendario, type EventoGravar, type Painel, type QuemRecebeOLembrete, type SituacaoDoEvento, type TipoDeEvento,
} from '@gestor/shared';
import type { Api } from './index.js';
import { ApiError, type TrashItem } from './types.js';
import { acessoDoCalendarioDemo, aoVoltarORelogioDemo, type AtorDemo, type EstadoDaPrevia } from './demo-atendimento.js';
import { EMAIL_DA_PESSOA, type Pessoa } from './demo-atendimento-exemplos.js';

export type ContextoCalendarioDemo = {
  S: EstadoDaPrevia;
  id: () => string;
  wait: (ms?: number) => Promise<unknown>;
  audit: (action: string, entityType: string, summary: string, entityId?: string | null, extra?: { before?: unknown; after?: unknown }) => void;
  requirePerm: (perm: string) => void;
  /** a porta de quem tem pelo menos uma das permissões (o calendário: quem vê os chamados ou o Comercial) */
  requireAnyPerm: (...perms: string[]) => void;
  /** a hora de agora (os testes podem adiantar o relógio) */
  agora?: () => Date;
};

/** O evento como o servidor guarda (a tabela `calendar_events`). */
type EventoRow = {
  id: string; titulo: string; tipoId: string; paineis: string[]; pessoas: string[]; clienteId: string | null; chamadoId: string | null;
  inicio: string; fim: string; diaInteiro: boolean; horaInicio: string | null; horaFim: string | null; local: string | null; observacao: string | null;
  situacao: SituacaoDoEvento; criadoPorId: string | null; alteradoPorId: string | null; criadoEm: string; alteradoEm: string; deletedAt: string | null;
  /** os lembretes (2.0.2), quem recebe e os que já saíram (`reminders_sent`) */
  lembretes: number[]; lembrarQuem: QuemRecebeOLembrete; enviados: Record<string, string>;
};

type Esquema<T> = { safeParse(v: unknown): { success: true; data: T } | { success: false; error: { issues: Array<{ path: Array<string | number>; message: string }> } } };

const erro = (status: number, mensagem: string) => new ApiError(status, mensagem, null as never);
const bad = (mensagem: string) => erro(400, mensagem);
/** O formato do pedido conferido como a rota confere (antes da permissão): "Dados inválidos" com a lista de campos. */
function ler<T>(esquema: Esquema<T>, v: unknown): T {
  const r = esquema.safeParse(v);
  if (!r.success) throw new ApiError(400, 'Dados inválidos', r.error.issues.map((i) => ({ field: i.path.join('.') || '(geral)', message: i.message })));
  return r.data;
}
const exigirTrabalhar = (a: AtorDemo) => {
  if (!(a.tipo === 'integracao' || a.permissoes.includes('tickets.work'))) throw erro(403, 'Esta ação exige a permissão "tickets.work"');
};
const podeTrabalhar = (a: AtorDemo) => a.tipo === 'integracao' || a.permissoes.includes('tickets.work');
const podeCuidar = (a: AtorDemo) => a.tipo === 'pessoa' && a.permissoes.includes('tickets.manage');

/** O calendário da prévia, mais a lixeira (a Administração › Lixeira do demo.ts chama estas duas). */
export type CalendarioDemo = Api['calendario'] & { lixeira: () => TrashItem[]; restaurarDaLixeira: (id: string) => { ok: boolean } };

export function criarCalendarioDemo(ctx: ContextoCalendarioDemo): CalendarioDemo {
  const { S } = ctx;
  const agora = ctx.agora ?? (() => new Date());
  const C = { semeado: false, tipos: tiposDeFabrica() as TipoDeEvento[], eventos: [] as EventoRow[] };
  const x = () => acessoDoCalendarioDemo();

  function preparar() {
    x().preparar();
    if (C.semeado) return;
    C.semeado = true;
    semear();
  }

  // ---------- quem vê o quê (a regra dos painéis) ----------

  const pessoasAtivas = () => S.users.filter((u) => u.active).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  const quemVe = (p: Painel) => pessoasAtivas().filter((u) => x().podeVerPainel(p, x().atorDaPessoa(u.id))).map((u) => u.id);
  function paineisDe(a: AtorDemo) {
    const todos = x().paineis();
    return { todos, visiveis: todos.filter((p) => x().podeVerPainel(p, a)) };
  }
  const nomeDaPessoa = (id: string | null) => (id ? S.users.find((u) => u.id === id)?.name ?? null : null);

  function paraTela(e: EventoRow): EventoDoCalendario {
    return {
      id: e.id, titulo: e.titulo, tipoId: e.tipoId, paineis: [...e.paineis], pessoas: [...e.pessoas],
      clienteId: e.clienteId, clienteNome: e.clienteId ? S.clients.find((c) => c.id === e.clienteId)?.tradeName ?? null : null,
      chamadoId: e.chamadoId, chamadoCodigo: e.chamadoId ? x().chamados().find((t) => t.id === e.chamadoId)?.codigo ?? null : null,
      inicio: e.inicio, fim: e.fim, diaInteiro: e.diaInteiro, horaInicio: e.horaInicio, horaFim: e.horaFim,
      local: e.local ?? '', observacao: e.observacao ?? '', situacao: e.situacao, lembretes: [...e.lembretes], lembrarQuem: e.lembrarQuem,
      criadoPor: nomeDaPessoa(e.criadoPorId), criadoEm: e.criadoEm, alteradoPor: nomeDaPessoa(e.alteradoPorId), alteradoEm: e.alteradoEm,
    };
  }

  /** O evento (que a pessoa vê); o que ela não vê dá 404. */
  function linhaVisivel(id: string, visiveis: Painel[]): EventoRow {
    const e = C.eventos.find((ev) => ev.id === id && !ev.deletedAt);
    if (!e || !eventoVisivel(e, new Set(visiveis.map((p) => p.id)))) throw erro(404, 'Evento não encontrado');
    return e;
  }

  // ---------- gravar (as mesmas conferências do servidor) ----------

  function conferir(a: AtorDemo, e: EventoGravar, antes: EventoRow | null, todos: Painel[], visiveis: Painel[]) {
    const tipo = C.tipos.find((t) => t.id === e.tipoId);
    if (!tipo) throw bad('Esse tipo não existe mais: escolha outro.');
    if (!tipo.ativo && antes?.tipoId !== tipo.id) throw bad(`O tipo ${tipo.nome} foi desativado: escolha outro.`);

    const idsVisiveis = new Set(visiveis.map((p) => p.id));
    const paineis = e.paineis.map((id) => todos.find((p) => p.id === id));
    if (paineis.some((p) => !p)) throw bad('Um dos painéis não existe mais: escolha outro.');
    for (const p of paineis as Painel[]) {
      const jaEstava = !!antes?.paineis.includes(p.id);
      if (!idsVisiveis.has(p.id) && !jaEstava) throw bad(`O painel ${p.nome} não é seu: escolha um dos painéis que você vê.`);
      if (!p.ativo && !jaEstava) throw bad(`O painel ${p.nome} foi desativado: escolha outro.`);
    }
    if (!paineis.some((p) => idsVisiveis.has(p!.id))) throw bad('Deixe pelo menos um painel que você vê.');

    const ativas = pessoasAtivas();
    const podem = new Set((paineis as Painel[]).flatMap(quemVe));
    for (const id of e.pessoas) {
      const ativa = ativas.find((u) => u.id === id);
      const jaEstava = !!antes?.pessoas.includes(id);
      if (!ativa) {
        if (jaEstava) continue;
        throw bad('Uma das pessoas não está mais ativa: tire-a do evento.');
      }
      if (!podem.has(id) && !jaEstava) throw bad(`${ativa.name} não vê nenhum dos painéis do evento: inclua o painel dela ou tire a pessoa.`);
    }

    let clienteNome: string | null = null;
    if (e.clienteId) {
      const c = S.clients.find((cl) => cl.id === e.clienteId && !cl.deletedAt);
      if (!c && antes?.clienteId !== e.clienteId) throw bad('Cliente não encontrado.');
      clienteNome = c?.tradeName ?? null;
    }
    if (e.chamadoId) {
      const t = x().chamado(e.chamadoId);
      const painel = t ? todos.find((p) => p.id === t.painelId) : undefined;
      if ((!t || !painel || !x().podeVerPainel(painel, a)) && antes?.chamadoId !== e.chamadoId) throw bad('Chamado não encontrado.');
    }
    return { tipo, paineis: paineis as Painel[], clienteNome };
  }

  const valores = (e: EventoGravar) => ({
    titulo: e.titulo, tipoId: e.tipoId, paineis: [...e.paineis], pessoas: [...e.pessoas], clienteId: e.clienteId, chamadoId: e.chamadoId,
    inicio: e.inicio, fim: e.fim, diaInteiro: e.diaInteiro, horaInicio: e.horaInicio, horaFim: e.horaFim,
    local: e.local || null, observacao: e.observacao || null, situacao: e.situacao, lembretes: [...e.lembretes], lembrarQuem: e.lembrarQuem,
  });
  /** O formato da auditoria do servidor (as colunas da tabela). */
  const paraAuditoria = (v: ReturnType<typeof valores>) => ({
    title: v.titulo, typeId: v.tipoId, panelIds: v.paineis, participantIds: v.pessoas, clientId: v.clienteId, ticketId: v.chamadoId,
    startsOn: v.inicio, endsOn: v.fim, allDay: v.diaInteiro, startTime: v.horaInicio, endTime: v.horaFim, location: v.local, notes: v.observacao, status: v.situacao,
    reminders: v.lembretes, remindWho: v.lembrarQuem,
  });

  /** O que mudou, nas palavras da tela (para a auditoria). */
  function oQueMudou(a: EventoRow, d: ReturnType<typeof valores>): string[] {
    const out: string[] = [];
    const igual = (p: string[], q: string[]) => [...p].sort().join() === [...q].sort().join();
    if (a.titulo !== d.titulo) out.push('Título');
    if (a.tipoId !== d.tipoId) out.push('Tipo');
    if (!igual(a.paineis, d.paineis)) out.push('Painéis');
    if (!igual(a.pessoas, d.pessoas)) out.push('Pessoas');
    if (a.clienteId !== d.clienteId) out.push('Cliente');
    if (a.chamadoId !== d.chamadoId) out.push('Chamado');
    if (a.inicio !== d.inicio || a.fim !== d.fim || a.diaInteiro !== d.diaInteiro || a.horaInicio !== d.horaInicio || a.horaFim !== d.horaFim) out.push('Quando');
    if ((a.local ?? null) !== d.local) out.push('Local');
    if ((a.observacao ?? null) !== d.observacao) out.push('Observação');
    if (a.situacao !== d.situacao) out.push(`Situação (${NOME_SITUACAO_DO_EVENTO[d.situacao]})`);
    if (!igual(a.lembretes.map(String), d.lembretes.map(String)) || a.lembrarQuem !== d.lembrarQuem) out.push('Lembretes');
    return out;
  }

  function criar(a: AtorDemo, e: EventoGravar, quando = agora()) {
    exigirTrabalhar(a);
    const { todos, visiveis } = paineisDe(a);
    const c = conferir(a, e, null, todos, visiveis);
    const quem = a.tipo === 'pessoa' ? a.id : null;
    const v = valores(e);
    const linha: EventoRow = {
      id: ctx.id(), ...v, enviados: lembretesAoGravar(v, {}, quando),
      criadoPorId: quem, alteradoPorId: quem, criadoEm: quando.toISOString(), alteradoEm: quando.toISOString(), deletedAt: null,
    };
    C.eventos.push(linha);
    const onde = [textoDoPeriodo(e), c.paineis.map((p) => p.nome).join(', '), c.clienteNome].filter(Boolean).join(', ');
    return { linha, depois: paraAuditoria(valores(e)), resumo: `Pôs no calendário: "${e.titulo}" (${c.tipo.nome}, ${onde})` };
  }

  /** O aviso de que o evento entrou (2.0.2): o sininho de quem o evento avisa, menos quem pôs. Devolve quantas pessoas. */
  function avisarDaInclusao(a: AtorDemo, e: EventoRow, quem: QuemRecebeOLembrete, quando = agora()): number {
    const para = quemRecebeAInclusao({ paineis: e.paineis, pessoas: e.pessoas, avisar: quem }, quemVePorPainel(), a.tipo === 'pessoa' ? a.id : null);
    if (!para.length) return 0;
    return x().avisarDoCalendario({ qual: 'evento_novo', para, evento: { id: e.id, titulo: e.titulo, inicio: e.inicio }, texto: textoDaInclusao(a.nome, e, quando) }, quando);
  }

  // ---------- os lembretes (2.0.2): as mesmas contas do servidor ----------

  /** Quem vê cada painel (as pessoas ativas). */
  const quemVePorPainel = () => new Map(x().paineis().map((p) => [p.id, quemVe(p)] as [string, string[]]));
  const textoDoEvento = (e: EventoRow, agora: Date) => textoDoLembrete(e, agora);

  /** Uma volta do relógio: os lembretes que chegaram na hora (o sininho de quem o evento lembra). */
  function mandarLembretes(agora: Date): number {
    let n = 0;
    let quemVeMapa: Map<string, string[]> | null = null;
    for (const e of C.eventos) {
      if (e.deletedAt || e.situacao !== 'agendado' || !e.lembretes.length) continue;
      const devidos = lembretesDevidos(e, e.enviados, agora);
      if (!devidos.length) continue;
      const comeco = comecoDoEvento(e);
      for (const m of devidos) e.enviados[chaveDoLembrete(m, comeco)] = agora.toISOString();
      quemVeMapa ??= quemVePorPainel();
      const para = quemRecebeOLembrete({ paineis: e.paineis, pessoas: e.pessoas, lembrarQuem: e.lembrarQuem, criadoPorId: e.criadoPorId }, quemVeMapa);
      x().avisarDoCalendario({ para, evento: { id: e.id, titulo: e.titulo, inicio: e.inicio }, texto: textoDoEvento(e, agora) }, agora);
      n += devidos.length;
    }
    return n;
  }
  // o relógio da prévia dos chamados chama a cada leitura (o sininho relê a cada 30 segundos)
  aoVoltarORelogioDemo((agora) => { preparar(); mandarLembretes(agora); });

  /**
   * Os exemplos já nascem com o passado: os lembretes que "saíram" entre o dia em que o evento foi posto e
   * agora chegam no sininho na hora deles (os de mais de 2 horas atrás, já lidos).
   */
  function lembretesDoPassado(agora: Date) {
    const quemVeMapa = quemVePorPainel();
    for (const e of C.eventos) {
      if (e.deletedAt || e.situacao === 'cancelado' || !e.lembretes.length) continue;
      const comeco = comecoDoEvento(e);
      for (const m of e.lembretes) {
        const chave = chaveDoLembrete(m, comeco);
        const momento = momentoDoLembrete(comeco, m);
        if (e.enviados[chave] || momento.getTime() > agora.getTime() || momento.getTime() >= comeco.getTime() + (m === 0 ? 5 * 60_000 : 0)) continue;
        if (momento.toISOString() < e.criadoEm) continue;
        e.enviados[chave] = momento.toISOString();
        const para = quemRecebeOLembrete({ paineis: e.paineis, pessoas: e.pessoas, lembrarQuem: e.lembrarQuem, criadoPorId: e.criadoPorId }, quemVeMapa);
        // o texto como saiu naquele dia ("amanhã", no dia anterior)
        x().avisarDoCalendario({ para, evento: { id: e.id, titulo: e.titulo, inicio: e.inicio }, texto: textoDoEvento(e, momento) }, momento, agora.getTime() - momento.getTime() > 2 * 3_600_000);
      }
    }
  }

  // ---------- os exemplos (em volta de hoje) ----------

  function semear() {
    const hoje = hojeNoCalendario(agora());
    const d = (n: number) => somarDias(hoje, n);
    /** o n-ésimo dia útil (segunda a sexta) depois de hoje (ou antes, com n negativo) */
    const util = (n: number) => {
      let dia = hoje;
      for (let falta = Math.abs(n); falta > 0;) { dia = somarDias(dia, Math.sign(n)); if (diaDaSemana(dia) <= 4) falta--; }
      return dia;
    };
    const pessoa = (p: Pessoa) => S.users.find((u) => u.email === EMAIL_DA_PESSOA[p])?.id ?? null;
    /** o evento que começa daqui a 1h30 a 2h (na meia hora cheia): o lembrete de 2 horas antes já saiu */
    const daquiAPouco = () => {
      const comeco = new Date(Math.ceil((agora().getTime() + 90 * 60_000) / (30 * 60_000)) * 30 * 60_000);
      const hora = new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(comeco);
      const fim = new Date(comeco.getTime() + 30 * 60_000);
      const horaFim = new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(fim);
      return { inicio: diaEmBrasilia(comeco), fim: diaEmBrasilia(fim), diaInteiro: false, horaInicio: hora, horaFim };
    };
    const cliente = (nome: string) => S.clients.find((c) => c.tradeName === nome && !c.deletedAt)?.id ?? null;
    const chamado = (titulo: string) => x().chamados().find((t) => t.titulo === titulo)?.id ?? null;
    const luan = pessoa('luan');
    if (!luan) return;
    const quem = x().atorDaPessoa(luan);
    /** `chamado`: o título do chamado de exemplo a que o evento fica ligado (a ficha mostra o evento) */
    type Exemplo = Partial<EventoGravar> & { titulo: string; tipoId: string; paineis: string[]; inicio: string; quem?: Pessoa[]; criadoHa?: number; chamado?: string };
    const exemplos: Exemplo[] = [
      // a semana que passou (feito)
      { titulo: 'Virada para nuvem — Escritório Prado & Lima', tipoId: 'virada-nuvem', paineis: ['painel-suporte'], quem: ['diego'], criadoHa: 15, inicio: util(-8), fim: somarDias(util(-8), 1), clienteId: cliente('Escritório Prado & Lima'), situacao: 'feito', local: 'Remoto', observacao: 'Migrado o PABX para a nuvem; os ramais voltaram todos no dia seguinte.' },
      { titulo: 'Visita — Home Care Viver Bem', tipoId: 'visita', paineis: ['painel-suporte'], quem: ['lucio'], criadoHa: 10, inicio: util(-3), diaInteiro: false, horaInicio: '09:00', horaFim: '11:00', clienteId: cliente('Home Care Viver Bem'), situacao: 'feito', local: 'Rua Chile, 22 — Comércio, Salvador' },
      // hoje: quem está fora
      { titulo: 'Home office — Bruno Teixeira', tipoId: 'home-office', paineis: ['painel-suporte'], quem: ['bruno'], inicio: d(0) },
      { titulo: 'Folga — Diego Farias', tipoId: 'folga', paineis: ['painel-comercial'], quem: ['diego'], inicio: d(0), observacao: 'Folga do banco de horas.' },
      { titulo: 'Retorno — Distribuidora Norte (ramais da recepção)', tipoId: 'acao-cliente', paineis: ['painel-suporte'], quem: ['marina'], inicio: d(0), diaInteiro: false, horaInicio: '15:00', horaFim: '15:30', clienteId: cliente('Distribuidora Norte'), local: 'Por telefone' },
      // os próximos dias
      { titulo: 'Virada de sistema — Clínica Aurora', tipoId: 'virada-sistema', paineis: ['painel-suporte'], quem: ['bruno'], chamado: 'Ramal 2010 da recepção mudo de novo', inicio: util(1), fim: somarDias(util(1), 1), diaInteiro: false, horaInicio: '22:00', horaFim: '02:00', clienteId: cliente('Clínica Aurora'), local: 'Remoto', observacao: 'Atualização do LinePBX fora do horário: avisar a recepção antes.' },
      { titulo: 'Visita — Laboratório Exame Certo', tipoId: 'visita', paineis: ['painel-suporte'], quem: ['bruno'], inicio: util(1), diaInteiro: false, horaInicio: '10:00', horaFim: '11:00', clienteId: cliente('Laboratório Exame Certo'), situacao: 'cancelado', observacao: 'O cliente pediu para remarcar.' },
      { titulo: 'Apresentação do LineChat — Laboratório Exame Certo', tipoId: 'reuniao', paineis: ['painel-comercial'], quem: ['camila'], inicio: util(2), diaInteiro: false, horaInicio: '15:00', horaFim: '16:00', clienteId: cliente('Laboratório Exame Certo'), local: 'Google Meet' },
      { titulo: 'Home office — Marina Costa', tipoId: 'home-office', paineis: ['painel-administrativo'], quem: ['marina'], inicio: util(2) },
      { titulo: 'Visita técnica — Hospital Vale Verde', tipoId: 'visita', paineis: ['painel-suporte'], quem: ['lucio', 'bruno'], inicio: util(3), diaInteiro: false, horaInicio: '09:00', horaFim: '12:00', clienteId: cliente('Hospital Vale Verde'), local: 'Av. Luís Viana Filho, 1500 — Salvador', observacao: 'Levar 4 aparelhos de reposição e conferir a central do 3º andar.' },
      { titulo: 'Alinhamento da semana do suporte', tipoId: 'reuniao', paineis: ['painel-suporte'], quem: ['luan', 'lucio', 'marina', 'bruno'], inicio: util(4), diaInteiro: false, horaInicio: '09:00', horaFim: '09:30', local: 'Sala de reuniões' },
      { titulo: 'Trocar os aparelhos da recepção — Distribuidora Norte', tipoId: 'acao-cliente', paineis: ['painel-suporte'], quem: ['lucio'], inicio: util(5), diaInteiro: false, horaInicio: '14:00', horaFim: '16:00', clienteId: cliente('Distribuidora Norte'), local: 'Av. Tancredo Neves, 620 — Salvador' },
      { titulo: 'Visita comercial — Construtora Horizonte', tipoId: 'visita', paineis: ['painel-comercial'], quem: ['diego', 'camila'], inicio: util(6), diaInteiro: false, horaInicio: '10:00', horaFim: '11:30', clienteId: cliente('Construtora Horizonte'), local: 'Rua Ewerton Visco, 290 — Salvador', observacao: 'Levar a proposta do LinePBX com 40 ramais.' },
      { titulo: 'Publicação do LineReports 3.4', tipoId: 'virada-sistema', paineis: ['painel-desenvolvimento'], quem: ['diego'], inicio: util(7), diaInteiro: false, horaInicio: '20:00', horaFim: '22:00', local: 'Remoto' },
      { titulo: 'Virada para nuvem — Supermercado Bom Preço', tipoId: 'virada-nuvem', paineis: ['painel-suporte', 'painel-desenvolvimento'], quem: ['lucio', 'diego'], inicio: util(8), fim: somarDias(util(8), 1), clienteId: cliente('Supermercado Bom Preço'), local: 'Loja da Pituba e remoto', observacao: 'Dia 1: subir o PABX novo e portar os ramais. Dia 2: acompanhar e desligar o servidor antigo.' },
      { titulo: 'Folga — Camila Duarte', tipoId: 'folga', paineis: ['painel-administrativo', 'painel-comercial'], quem: ['camila'], inicio: util(9), fim: util(10) },
      { titulo: 'Fechamento do mês com o financeiro', tipoId: 'reuniao', paineis: ['painel-administrativo'], quem: ['marina', 'camila'], inicio: util(11), diaInteiro: false, horaInicio: '10:00', horaFim: '11:00', local: 'Sala de reuniões' },
      { titulo: 'Treinamento da recepção — Clínica Aurora', tipoId: 'visita', paineis: ['painel-suporte'], quem: ['marina'], inicio: util(12), diaInteiro: false, horaInicio: '08:30', horaFim: '10:00', clienteId: cliente('Clínica Aurora'), local: 'Av. Tancredo Neves, 1632 — Salvador' },
      // o lembrete que chega com a prévia aberta (2.0.2): daqui a pouco, com o Luan; o de 2 horas antes já saiu
      { titulo: 'Retorno — Clínica Aurora (o ramal da recepção)', tipoId: 'acao-cliente', paineis: ['painel-suporte'], quem: ['luan'], criadoHa: 2, ...daquiAPouco(),
        clienteId: cliente('Clínica Aurora'), local: 'Por telefone', lembretes: [120, 15], observacao: 'Confirmar com a recepção se o ramal 2010 voltou a tocar.' },
    ];
    for (const ex of exemplos) {
      const { quem: pessoas = [], criadoHa = 6, chamado: doChamado, ...resto } = ex;
      const dados = EventoGravarSchema.safeParse({
        // os lembretes do tipo (a Visita, 1 dia antes e 1 hora antes), como a janela faz no evento novo
        fim: ex.inicio, lembretes: tipoDoEvento(C.tipos, ex.tipoId).lembretes, ...resto,
        pessoas: pessoas.map(pessoa).filter(Boolean), chamadoId: doChamado ? chamado(doChamado) : null,
      });
      if (!dados.success) { console.warn('[prévia do calendário] exemplo que não passou:', ex.titulo, dados.error.issues); continue; }
      try {
        const criado = criar(quem, dados.data, new Date(agora().getTime() - criadoHa * 86_400_000));
        // quem trabalhou no evento por último: a primeira pessoa dele
        if (pessoas[0]) criado.linha.alteradoPorId = pessoa(pessoas[0]);
      } catch (err) {
        console.warn('[prévia do calendário] exemplo que não passou nas regras:', ex.titulo, err instanceof Error ? err.message : err);
      }
    }
    lembretesDoPassado(agora());
  }

  // ---------- a API ----------

  const eu = () => x().eu();

  const api: CalendarioDemo = {
    async opcoes() {
      await ctx.wait(80); ctx.requireAnyPerm('support.read', 'sales.read'); preparar();
      const a = eu();
      const { visiveis } = paineisDe(a);
      return {
        tipos: C.tipos.map((t) => ({ ...t, lembretes: [...t.lembretes] })),
        paineis: visiveis.map((p) => ({ id: p.id, nome: p.nome, sigla: p.sigla, cor: p.cor, ativo: p.ativo, pessoas: quemVe(p) })),
        pessoas: pessoasAtivas().map((u) => ({ id: u.id, nome: u.name })),
        podeEditar: podeTrabalhar(a), podeCuidar: podeCuidar(a), hoje: hojeNoCalendario(agora()),
      } satisfies CalendarioOpcoes;
    },
    async eventos(de, ate) {
      await ctx.wait();
      const p = ler(EventosDoPeriodoSchema, { de, ate });
      ctx.requireAnyPerm('support.read', 'sales.read'); preparar();
      const ids = new Set(paineisDe(eu()).visiveis.map((v) => v.id));
      return C.eventos.filter((e) => !e.deletedAt && e.inicio <= p.ate && e.fim >= p.de && eventoVisivel(e, ids)).map(paraTela);
    },
    async doChamado(chamadoId) {
      await ctx.wait();
      ctx.requireAnyPerm('support.read', 'sales.read'); preparar();
      const a = eu();
      const { todos, visiveis } = paineisDe(a);
      const t = x().chamado(chamadoId);
      const painel = t ? todos.find((p) => p.id === t.painelId) : undefined;
      if (!t || !painel || !x().podeVerPainel(painel, a)) throw erro(404, 'Chamado não encontrado');
      const ids = new Set(visiveis.map((v) => v.id));
      return C.eventos.filter((e) => !e.deletedAt && e.chamadoId === chamadoId && eventoVisivel(e, ids)).sort((p, q) => p.inicio.localeCompare(q.inicio)).map(paraTela);
    },
    async criar(d) {
      await ctx.wait(200);
      const dados = ler(EventoGravarSchema, d);
      ctx.requirePerm('tickets.work'); preparar();
      const a = eu();
      const r = criar(a, dados);
      // o aviso de que o evento entrou (2.0.2, opcional), como o servidor: na hora, menos para quem pôs
      const avisados = dados.avisar ? avisarDaInclusao(a, r.linha, dados.avisar) : null;
      const resumo = dados.avisar
        ? `${r.resumo} e ${avisados ? `avisou ${avisados === 1 ? '1 pessoa' : `${avisados} pessoas`}` : 'pediu o aviso, mas não havia quem avisar'} (${NOME_QUEM_RECEBE_O_LEMBRETE[dados.avisar].toLocaleLowerCase('pt-BR')})`
        : r.resumo;
      ctx.audit('create', 'calendar_event', resumo, r.linha.id, { after: r.depois });
      return paraTela(r.linha);
    },
    async alterar(id, d) {
      await ctx.wait(200);
      const dados = ler(EventoGravarSchema, d);
      ctx.requirePerm('tickets.work'); preparar();
      const a = eu();
      exigirTrabalhar(a);
      const { todos, visiveis } = paineisDe(a);
      const antes = linhaVisivel(id, visiveis);
      const comPaineis = { ...dados, paineis: paineisDepoisDaEdicao(antes.paineis, dados.paineis, new Set(visiveis.map((p) => p.id))) };
      conferir(a, comPaineis, antes, todos, visiveis);
      const v = valores(comPaineis);
      const mudou = oQueMudou(antes, v);
      const antesAuditoria = paraAuditoria(antes);
      // os lembretes: o que já saiu para o mesmo começo continua; o que passou fica pulado; mudar o dia vale de novo
      const enviados = lembretesAoGravar(v, antes.enviados, agora());
      Object.assign(antes, v, { enviados, alteradoPorId: a.tipo === 'pessoa' ? a.id : null, alteradoEm: agora().toISOString() });
      ctx.audit('update', 'calendar_event', `Mudou no calendário "${v.titulo}": ${mudou.join(', ') || 'nada'}`, id, { before: antesAuditoria, after: paraAuditoria(v) });
      return paraTela(antes);
    },
    async situacao(id, situacao) {
      await ctx.wait(150);
      const { situacao: s } = ler(SituacaoDoEventoSchema, { situacao });
      ctx.requirePerm('tickets.work'); preparar();
      const a = eu();
      exigirTrabalhar(a);
      const e = linhaVisivel(id, paineisDe(a).visiveis);
      const antes = e.situacao;
      // o que voltou a agendado não lembra o que passou enquanto estava cancelado
      Object.assign(e, { situacao: s, enviados: lembretesAoGravar({ ...e, situacao: s }, e.enviados, agora()), alteradoPorId: a.tipo === 'pessoa' ? a.id : null, alteradoEm: agora().toISOString() });
      const verbo = s === 'feito' ? 'Marcou como feito' : s === 'cancelado' ? 'Cancelou' : 'Voltou a agendado';
      ctx.audit('update', 'calendar_event', `${verbo} no calendário: "${e.titulo}" (${textoDoPeriodo(e)})`, id, { before: { status: antes }, after: { status: s } });
      return paraTela(e);
    },
    async remover(id) {
      await ctx.wait(150);
      ctx.requirePerm('tickets.work'); preparar();
      const a = eu();
      exigirTrabalhar(a);
      const e = linhaVisivel(id, paineisDe(a).visiveis);
      e.deletedAt = agora().toISOString();
      e.alteradoPorId = a.tipo === 'pessoa' ? a.id : null;
      ctx.audit('delete', 'calendar_event', `Mandou para a lixeira do calendário: "${e.titulo}" (${tipoDoEvento(C.tipos, e.tipoId).nome}, ${textoDoPeriodo(e)})`, id);
      return { ok: true };
    },
    async salvarTipos(tipos) {
      await ctx.wait(200);
      const dados = ler(TiposDoCalendarioSchema, { tipos });
      ctx.requirePerm('tickets.manage'); preparar();
      const a = eu();
      if (!podeCuidar(a)) throw erro(403, 'Esta ação exige a permissão "tickets.manage"');
      const antes = C.tipos.map((t) => ({ ...t }));
      const sairam = antes.filter((t) => !dados.tipos.some((n) => n.id === t.id));
      const comEvento = sairam.filter((t) => C.eventos.some((e) => !e.deletedAt && e.tipoId === t.id));
      if (comEvento.length) throw bad(`${comEvento.map((t) => t.nome).join(', ')} já ${comEvento.length === 1 ? 'tem' : 'têm'} eventos: desative em vez de tirar.`);
      C.tipos = dados.tipos.map((t) => ({ ...t, lembretes: [...t.lembretes] }));
      const mudou: string[] = [];
      for (const t of C.tipos) {
        const v = antes.find((y) => y.id === t.id);
        if (!v) mudou.push(`incluiu ${t.nome}`);
        else if (v.nome !== t.nome || v.cor !== t.cor || v.daEquipe !== t.daEquipe || v.ativo !== t.ativo || v.lembretes.join() !== t.lembretes.join()) {
          mudou.push(v.ativo !== t.ativo ? `${t.ativo ? 'reativou' : 'desativou'} ${t.nome}`
            : v.nome === t.nome && v.cor === t.cor && v.daEquipe === t.daEquipe ? `mudou os lembretes de ${t.nome} (${textoDosLembretes(t.lembretes)})`
              : `mudou ${v.nome === t.nome ? t.nome : `${v.nome} (agora ${t.nome})`}`);
        }
      }
      for (const t of sairam) mudou.push(`tirou ${t.nome}`);
      ctx.audit('settings_calendario', 'settings', `Mudou os tipos do calendário: ${mudou.join(', ') || 'a ordem'}`, 'calendario', { before: { tipos: antes }, after: { tipos: C.tipos } });
      return { tipos: C.tipos.map((t) => ({ ...t, lembretes: [...t.lembretes] })) };
    },
    lixeira: () => {
      if (!C.semeado) return [];
      return C.eventos.filter((e) => e.deletedAt).map((e) => ({ type: 'calendarEvent', id: e.id, label: `${textoDoPeriodo(e)} · ${e.titulo}`, deletedAt: e.deletedAt! }));
    },
    restaurarDaLixeira: (id) => {
      const e = C.eventos.find((ev) => ev.id === id && ev.deletedAt);
      if (!e) throw erro(404, 'Evento não encontrado na lixeira');
      e.deletedAt = null;
      e.enviados = lembretesAoGravar(e, e.enviados, agora());
      e.alteradoEm = agora().toISOString();
      ctx.audit('restore', 'calendar_event', `Restaurou o evento do calendário "${e.titulo}" (${textoDoPeriodo(e)}) da lixeira`, id);
      return { ok: true };
    },
  };
  return api;
}
