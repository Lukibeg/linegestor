/**
 * A prévia dos chamados (demo-atendimento.ts) tem de valer igual ao servidor: estes testes passam pela
 * mesma `demoApi` que a página publicada usa, entrando como as pessoas da prévia.
 *
 * Os testes rodam em ordem e dividem o mesmo estado (a prévia é uma só na memória): primeiro os que só
 * leem os exemplos, depois os que abrem e mexem nos próprios chamados de teste.
 */
import { describe, expect, it } from 'vitest';
import { caminhoDoAssunto, mensagemDoQueFalta, prioridadeSugerida, type CartaoChamado } from '@gestor/shared';
import { demoApi } from './demo.js';
import { diagnosticoDosChamadosDemo } from './demo-atendimento.js';
import { ApiError, type ChamadoCriarEntrada, type OpcoesAtendimento } from './types.js';

const api = demoApi.atendimento;
// a senha pública da prévia (a tela de entrar da prévia mostra), não um segredo
const SENHA_DA_PREVIA = 'demo';
const DEMORA = 60_000;

type Quem = 'admin' | 'tecnico' | 'operador' | 'leitor' | 'bruno' | 'camila' | 'diego';
async function entrar(quem: Quem) {
  await demoApi.auth.logout();
  const r = await demoApi.auth.login(`${quem}@gestor.local`, SENHA_DA_PREVIA);
  return r.user!;
}
/** O erro da chamada (e falha o teste se ela passar). */
async function erroDe(p: Promise<unknown>): Promise<ApiError> {
  try {
    await p;
  } catch (e) {
    if (e instanceof ApiError) return e;
    throw e;
  }
  throw new Error('Era para dar erro, e passou.');
}

const painel = (op: OpcoesAtendimento, sigla: string) => op.paineis.find((p) => p.sigla === sigla)!;
const etapa = (op: OpcoesAtendimento, sigla: string, nome: string) => painel(op, sigla).etapas.find((e) => e.nome === nome)!;
const apertado = (c: CartaoChamado) => [c.prazos.resposta.situacao, c.prazos.solucao.situacao].some((s) => s === 'perto' || s === 'vencido');

async function todosOsChamados() {
  return (await api.lista({ situacao: 'todos', pageSize: 1000 })).items;
}
async function chamadoPeloTitulo(titulo: string) {
  const c = (await todosOsChamados()).find((x) => x.titulo === titulo);
  if (!c) throw new Error(`O exemplo "${titulo}" não está na prévia.`);
  return api.chamado(c.codigo);
}
/** O básico de um chamado de teste do Suporte, com um cliente de verdade da prévia. */
async function baseDoSuporte(op: OpcoesAtendimento, titulo: string): Promise<ChamadoCriarEntrada> {
  const cliente = (await todosOsChamados()).find((c) => c.cliente?.nome === 'Clínica Aurora')!.cliente!;
  return { painelId: painel(op, 'SUP').id, titulo, relato: 'O cliente ligou relatando o problema (chamado de teste).', clienteId: cliente.id };
}
/** Um assunto do Suporte sem checklist (para o teste não depender do checklist do assunto). */
const assuntoSimples = (op: OpcoesAtendimento) => op.assuntos.find((a) => a.painelId === painel(op, 'SUP').id && a.ativo && !a.checklist.length && a.paiId)!;

/** O painel da diretoria (só para os escolhidos, com o cliente e o relato obrigatórios ao abrir). */
let diretoria: { id: string } | null = null;
async function painelDaDiretoria(luanId: string) {
  if (diretoria) return diretoria;
  diretoria = await api.salvarPainel(null, {
    nome: 'Diretoria', sigla: 'DIR', descricao: 'Os pedidos da diretoria.', cor: 'roxo', acesso: 'escolhidos', pessoas: [luanId],
    ajustes: { obrigatoriosAoAbrir: ['cliente', 'relato'] },
  });
  return diretoria;
}

describe('os exemplos da prévia', () => {
  it('nascem pelas mesmas regras do servidor, sem nenhum passo recusado', async () => {
    await entrar('admin');
    const op = await api.opcoes();
    const diag = diagnosticoDosChamadosDemo();
    expect(diag?.erros).toEqual([]);
    const todos = await todosOsChamados();
    const sup = todos.filter((c) => c.painelId === painel(op, 'SUP').id);
    const dev = todos.filter((c) => c.painelId === painel(op, 'DEV').id);
    expect(sup).toHaveLength(45);
    expect(dev).toHaveLength(7);
    // os números de cada painel: 1, 2, 3… sem buraco
    expect(sup.map((c) => c.numero).sort((a, b) => a - b)).toEqual(Array.from({ length: 45 }, (_, i) => i + 1));
    expect(dev.map((c) => c.codigo).sort()).toEqual(Array.from({ length: 7 }, (_, i) => `DEV-${i + 1}`));

    // todas as etapas dos dois painéis têm chamado
    for (const sigla of ['SUP', 'DEV']) {
      const q = await api.quadro({ painel: painel(op, sigla).id });
      for (const col of q.colunas) expect(col.total, `${sigla} › ${col.etapa.nome}`).toBeGreaterThan(0);
    }
    // uns 15 fechados nas últimas semanas
    const fechados = sup.filter((c) => c.situacao === 'fechado');
    expect(fechados.length).toBeGreaterThanOrEqual(15);
    const seisSemanas = Date.now() - 42 * 86_400_000;
    for (const c of fechados) expect(Date.parse(c.fechadoEm!)).toBeGreaterThan(seisSemanas);
    // vencido, perto de vencer e parado esperando
    const abertos = sup.filter((c) => c.situacao === 'aberto');
    expect(abertos.some((c) => c.prazos.solucao.situacao === 'vencido')).toBe(true);
    expect(abertos.some((c) => c.prazos.resposta.situacao === 'vencido')).toBe(true);
    expect(abertos.some((c) => c.prazos.solucao.situacao === 'perto')).toBe(true);
    expect(abertos.some((c) => c.prazos.solucao.situacao === 'pausado' && c.espera?.tipo === 'cliente')).toBe(true);
    // o robô do LineChat, o agendado, o reaberto
    expect(sup.filter((c) => c.origem === 'robo').length).toBeGreaterThanOrEqual(3);
    expect(sup.some((c) => c.origem === 'agendado')).toBe(true);
    expect(sup.some((c) => c.reaberto > 0 && c.situacao === 'aberto')).toBe(true);
  }, DEMORA);

  it('contam as histórias pedidas: operadora, problema, pai e filho, ligações, referências, anexos', async () => {
    await entrar('admin');
    const op = await api.opcoes();
    const todos = await todosOsChamados();

    // esperando a operadora: o protocolo da Algar aberto e cobrado
    const naOperadora = todos.find((c) => c.espera?.tipo === 'operadora')!;
    const fa = await api.chamado(naOperadora.codigo);
    expect(fa.prazos.solucao.situacao === 'pausado' || fa.prazos.solucao.situacao === 'vencido').toBe(true);
    expect(fa.operadora[0]!.operadora.nome).toBe('ALGAR');
    expect(fa.operadora[0]!.situacao).toBe('aberto');
    expect(fa.operadora[0]!.andamentos.filter((a) => a.acao === 'cobrou').length).toBeGreaterThanOrEqual(2);

    // o problema que junta três incidentes de clientes diferentes, com a causa e o contorno
    const problema = await chamadoPeloTitulo('Quedas no tronco da Algar em Salvador');
    expect(problema.tipoChamado).toBe('problema');
    expect(problema.incidentesLista).toHaveLength(3);
    expect(new Set(problema.incidentesLista.map((c) => c.cliente?.id)).size).toBe(3);
    expect(problema.causa).toBeTruthy();
    expect(problema.contorno).toBeTruthy();
    // a prioridade trocada da sugerida guarda o motivo
    expect(problema.prioridade).not.toBe(problema.prioridadeSugerida);
    expect(problema.motivoPrioridade).toBeTruthy();

    // o pai do Suporte que não fecha porque o filho do Desenvolvimento está aberto
    const pai = await chamadoPeloTitulo('Relatório de filas mostra o tempo de espera zerado');
    const filho = pai.filhosLista[0]!;
    expect(filho.codigo).toMatch(/^DEV-\d+$/);
    expect(filho.situacao).toBe('aberto');
    expect(pai.filhosTravam[etapa(op, 'SUP', 'Resolvido').id]).toEqual([filho.codigo]);
    expect(pai.filhosTravam[etapa(op, 'SUP', 'Fechado').id]).toEqual([filho.codigo]);

    // as ligações: relacionado, duplicado de, repete
    const repete = await chamadoPeloTitulo('Ramal 2010 da recepção mudo de novo');
    const original = await chamadoPeloTitulo('Ramal 2010 da recepção sem áudio');
    expect(repete.ligacoes.map((l) => [l.tipo, l.chamado.codigo])).toContainEqual(['repete', original.codigo]);
    // a ligação aparece dos dois lados
    expect(original.ligacoes.map((l) => l.chamado.codigo)).toContain(repete.codigo);
    const duplicado = await chamadoPeloTitulo('Ramal 305 do plantão sem registro');
    expect(duplicado.ligacoes.map((l) => l.tipo)).toContain('duplicado');
    const relacionado = await chamadoPeloTitulo('Ligações recebidas caem no meio da conversa');
    expect(relacionado.ligacoes.map((l) => l.tipo)).toContain('relacionado');

    // "igual ao SUP-7" no texto vira referência; o card antigo do LineChat também
    expect(repete.relato).toContain(original.codigo);
    expect(repete.referencias).toContainEqual(expect.objectContaining({ codigo: original.codigo, existe: true, titulo: original.titulo, id: original.id }));
    const saida = await chamadoPeloTitulo('Ligações de saída não completam');
    const card = saida.referencias.find((r) => r.codigo.startsWith('IS-'))!;
    expect(card.existe).toBe(true);
    expect(card.url).toContain(`/card/${card.codigo}`);

    // a foto do aparelho numa anotação (abre pelo endereço do anexo)
    const foto = original.anotacoesLista.flatMap((n) => n.anexos).find((a) => a.imagem)!;
    expect(foto.nome).toMatch(/\.jpg$/);
    expect(api.anexoUrl(foto.id)).toMatch(/^data:image\/jpeg;base64,/);

    // o checklist pela metade, o tempo gasto, a conversa do robô
    const medicos = await chamadoPeloTitulo('Criar ramais para 3 médicos novos');
    expect(medicos.checklist.some((i) => i.feito)).toBe(true);
    expect(medicos.checklist.some((i) => !i.feito)).toBe(true);
    expect(medicos.tempo.total).toBeGreaterThan(0);
    const critico = await chamadoPeloTitulo('Nenhuma ligação entra na central');
    expect(critico.origem).toBe('robo');
    expect(critico.prioridade).toBe('critica');
    expect(critico.conversaUrl).toMatch(/^https:\/\/inglinechat\.com\.br\/chat\//);

    // o histórico em ordem, cada linha com a frase do servidor
    for (const f of [fa, problema, repete]) {
      expect(f.historico[0]!.tipo).toBe('criado');
      expect(f.historico.every((e) => e.texto.length > 0)).toBe(true);
      expect(f.historico.map((e) => e.em)).toEqual([...f.historico.map((e) => e.em)].sort());
    }

    // os agendados: um que já rodou (e abriu o chamado) e um que ainda vai rodar
    const ag = await api.agendados();
    expect(ag.map((a) => a.titulo).sort()).toEqual(['Conferir os backups dos PABX', 'Verificar os DIDs em uso']);
    const rodou = ag.find((a) => a.ultimoCodigo)!;
    expect(todos.find((c) => c.codigo === rodou.ultimoCodigo)?.origem).toBe('agendado');
    expect(await api.respostas()).toHaveLength(4);
  }, DEMORA);

  it('o quadro, a lista e o Meu dia contam os mesmos chamados', async () => {
    const eu = await entrar('admin');
    const op = await api.opcoes();
    const sup = painel(op, 'SUP');
    const q = await api.quadro({ painel: sup.id });
    expect(q.colunas.map((c) => c.etapa.nome)).toEqual(['Novo', 'N1', 'N2', 'N3', 'Em observação', 'Resolvido', 'Fechado']);
    for (const col of q.colunas) {
      for (const c of col.chamados) expect(c.etapaId).toBe(col.etapa.id);
      expect(col.total).toBe(col.chamados.length + col.escondidos);
    }
    const doPainel = await api.lista({ painel: sup.id, situacao: 'todos', pageSize: 1000 });
    expect(q.colunas.reduce((s, c) => s + c.total, 0)).toBe(doPainel.total);
    const total = (tipos: string[]) => q.colunas.filter((c) => tipos.includes(c.etapa.tipo)).reduce((s, c) => s + c.total, 0);
    expect((await api.lista({ painel: sup.id })).total).toBe(total(['entrada', 'andamento']));
    expect((await api.lista({ painel: sup.id, situacao: 'resolvidos' })).total).toBe(total(['resolvido']));
    expect((await api.lista({ painel: sup.id, situacao: 'fechados' })).total).toBe(total(['fechado']));

    // o filtro de prazo da lista
    const vencidos = await api.lista({ prazo: 'vencidos', pageSize: 1000 });
    expect(vencidos.total).toBeGreaterThan(0);
    for (const c of vencidos.items) expect([c.prazos.resposta.situacao, c.prazos.solucao.situacao]).toContain('vencido');

    // o Meu dia do Luan
    const md = await api.meuDia();
    const meus = await api.lista({ responsavel: 'eu', pageSize: 1000 });
    expect(md.meus.length).toBeGreaterThan(0);
    expect(md.meus.map((c) => c.codigo).sort()).toEqual(meus.items.map((c) => c.codigo).sort());
    for (const c of md.meus) expect(c.responsavel?.id).toBe(eu.id);
    const semDono = await api.lista({ responsavel: 'ninguem', pageSize: 1000 });
    expect(md.semDono.map((c) => c.codigo).sort()).toEqual(semDono.items.map((c) => c.codigo).sort());
    for (const c of md.vencendo) {
      expect(apertado(c)).toBe(true);
      expect(!c.responsavel || c.responsavel.id === eu.id).toBe(true);
    }
    expect(md.vencendo.length).toBeGreaterThan(0);

    // o sininho do Luan: os cinco que ele precisa ver
    const av = await api.avisos();
    expect(av.naoLidos).toBe(5);
    expect(new Set(av.itens.filter((a) => !a.lido).map((a) => a.tipo))).toEqual(new Set(['critico', 'cliente_respondeu', 'prazo_perto', 'recebeu', 'sem_dono']));
    // quem fez a ação não é avisado: nenhum aviso do Luan sobre o que ele mesmo fez
    for (const a of av.itens.filter((x) => x.tipo === 'recebeu' && x.texto.startsWith('Você recebeu'))) {
      const f = await api.chamado(a.chamado!.codigo);
      const passou = f.historico.find((e) => (e.tipo === 'responsavel' && (e.dados as { para?: { id: string } }).para?.id === eu.id) || e.tipo === 'criado');
      expect(passou?.por?.id).not.toBe(eu.id);
    }
  }, DEMORA);
});

describe('as regras do servidor valem na prévia', () => {
  it('abrir: o número do painel, os obrigatórios, a prioridade sugerida e o motivo da troca', async () => {
    const lucio = await entrar('tecnico');
    const op = await api.opcoes();
    const sup = painel(op, 'SUP');
    // o formato é conferido antes de tudo, como na rota do servidor
    const formato = await erroDe(api.criar({ painelId: sup.id, titulo: 'ab' }));
    expect(formato.status).toBe(400);
    expect(formato.message).toBe('Dados inválidos');
    expect(formato.details).toEqual([expect.objectContaining({ field: 'titulo' })]);

    const maior = Math.max(...(await todosOsChamados()).filter((c) => c.painelId === sup.id).map((c) => c.numero));
    const base = await baseDoSuporte(op, 'Central sem receber ligações (teste)');
    const sugerida = prioridadeSugerida('inoperancia', 'empresa', op.prazos.matriz)!;
    const r = await api.criar({ ...base, gravidade: 'inoperancia', alcance: 'empresa' });
    expect(r.codigo).toBe(`SUP-${maior + 1}`);
    const f = await api.chamado(r.codigo);
    expect(f.etapaId).toBe(etapa(op, 'SUP', 'Novo').id);
    expect(f.prioridade).toBe(sugerida);
    expect(f.prioridadeSugerida).toBe(sugerida);
    expect(f.motivoPrioridade).toBeNull();
    expect(f.criadoPor?.id).toBe(lucio.id);
    // quem abre na tela já está falando com o cliente: a abertura é a primeira resposta
    expect(f.prazos.resposta.situacao).toBe('cumprido');
    // (o aviso da etapa pelo WhatsApp da equipe também entra no histórico; aqui só interessa o resto)
    expect(f.historico.map((e) => e.tipo).filter((t) => t !== 'aviso_equipe')).toEqual(['criado']);

    // trocar a sugerida pede o motivo (e o pedido recusado não gasta número)
    const outra = sugerida === 'baixa' ? 'alta' : 'baixa';
    const semMotivo = await erroDe(api.criar({ ...base, gravidade: 'inoperancia', alcance: 'empresa', prioridade: outra }));
    expect(semMotivo.status).toBe(400);
    expect(semMotivo.message).toBe('Trocar a prioridade sugerida pede o motivo.');
    const r2 = await api.criar({ ...base, gravidade: 'inoperancia', alcance: 'empresa', prioridade: outra, motivoPrioridade: 'O cliente tem o contorno pelo celular' });
    expect(r2.codigo).toBe(`SUP-${maior + 2}`);
    const f2 = await api.chamado(r2.id);
    expect(f2.prioridade).toBe(outra);
    expect(f2.motivoPrioridade).toBe('O cliente tem o contorno pelo celular');

    // os obrigatórios ao abrir do painel: 400 com a lista do que falta
    const luan = await entrar('admin');
    const dir = await painelDaDiretoria(luan.id);
    const falta = await erroDe(api.criar({ painelId: dir.id, titulo: 'Pedido da diretoria' }));
    expect(falta.status).toBe(400);
    expect(falta.details).toEqual({ faltam: ['cliente', 'relato'] });
    expect(falta.message).toBe(mensagemDoQueFalta(['cliente', 'relato']));
    const ok = await api.criar({ ...(await baseDoSuporte(op, 'Pedido da diretoria')), painelId: dir.id });
    expect(ok.codigo).toBe('DIR-1');
  }, DEMORA);

  it('mover: o que falta volta 400 com a lista; escalonar e voltar de nível pedem o motivo', async () => {
    await entrar('operador');
    const op = await api.opcoes();
    const n1 = etapa(op, 'SUP', 'N1'); const n2 = etapa(op, 'SUP', 'N2');
    const r = await api.criar(await baseDoSuporte(op, 'Ramal sem registro (teste de mover)'));
    expect((await api.mover(r.id, { etapaId: n1.id })).etapaId).toBe(n1.id);

    const falta = await erroDe(api.mover(r.id, { etapaId: n2.id, motivo: 'Precisa de acesso ao SBC' }));
    expect(falta.status).toBe(400);
    expect(falta.details).toEqual({ faltam: ['assunto'] });
    expect(falta.message).toBe(mensagemDoQueFalta(['assunto'], 'N2'));

    await api.alterar(r.id, { assuntoId: assuntoSimples(op).id });
    const semMotivo = await erroDe(api.mover(r.id, { etapaId: n2.id }));
    expect(semMotivo.status).toBe(400);
    expect(semMotivo.message).toBe('Escalonar pede o motivo.');

    const f = await api.mover(r.id, { etapaId: n2.id, motivo: 'Precisa de acesso ao SBC' });
    expect(f.etapaId).toBe(n2.id);
    expect(f.trajetoria[f.trajetoria.length - 1]).toEqual(expect.objectContaining({ etapa: 'N2', sentido: 'sobe', motivo: 'Precisa de acesso ao SBC', por: 'Marina Costa' }));
    expect(f.historico.filter((e) => e.tipo === 'etapa').at(-1)!.texto).toContain('Precisa de acesso ao SBC');

    const voltar = await erroDe(api.mover(r.id, { etapaId: n1.id }));
    expect(voltar.message).toBe('Voltar de nível pede o motivo.');
    const fechar = await erroDe(api.mover(r.id, { etapaId: etapa(op, 'SUP', 'Fechado').id }));
    expect(fechar.status).toBe(400);
    expect((fechar.details as unknown as { faltam: string[] }).faltam).toEqual(['tipo', 'gravidade', 'solucao', 'causa']);

    // o N2 avisa o Bruno no sininho (quem escalonou não é avisado)
    await entrar('bruno');
    const av = await api.avisos();
    expect(av.itens[0]).toEqual(expect.objectContaining({ tipo: 'etapa', texto: `${r.codigo} chegou em N2`, lido: false }));
  }, DEMORA);

  it('o pai com filho aberto não resolve nem fecha', async () => {
    await entrar('tecnico');
    const op = await api.opcoes();
    const assunto = assuntoSimples(op);
    const pai = await api.criar({
      ...(await baseDoSuporte(op, 'Relatório errado em todas as filas (teste de pai)')), assuntoId: assunto.id, tipo: 'Incidente', gravidade: 'disfuncional', alcance: 'setor',
    });
    await api.mover(pai.id, { etapaId: etapa(op, 'SUP', 'N1').id });
    await api.alterar(pai.id, { solucao: 'Corrigido no Desenvolvimento.', causa: 'Erro na conta do relatório.' });
    const filho = await api.criar({ painelId: painel(op, 'DEV').id, titulo: 'Corrigir a conta do relatório (teste de filho)', relato: 'Vem do suporte.', paiId: pai.codigo });
    expect(filho.codigo).toMatch(/^DEV-/);

    for (const nome of ['Resolvido', 'Fechado']) {
      const e = await erroDe(api.mover(pai.id, { etapaId: etapa(op, 'SUP', nome).id }));
      expect(e.status).toBe(400);
      expect(e.details).toEqual({ filhos: [filho.codigo] });
      expect(e.message).toBe(`O ${pai.codigo} tem filhos em aberto: ${filho.codigo}. Feche os filhos antes.`);
    }
    // o filho entregue (resolvido) já deixa o pai resolver; fechar, só com o filho fechado
    await api.alterar(filho.id, { solucao: 'Conta corrigida.' });
    await api.mover(filho.id, { etapaId: etapa(op, 'DEV', 'Entregue').id });
    expect((await api.mover(pai.id, { etapaId: etapa(op, 'SUP', 'Resolvido').id })).situacao).toBe('resolvido');
    expect((await erroDe(api.mover(pai.id, { etapaId: etapa(op, 'SUP', 'Fechado').id }))).details).toEqual({ filhos: [filho.codigo] });
    await api.mover(filho.id, { etapaId: etapa(op, 'DEV', 'Fechado').id });
    const f = await api.mover(pai.id, { etapaId: etapa(op, 'SUP', 'Fechado').id });
    expect(f.situacao).toBe('fechado');
    expect(f.historico.some((e) => e.tipo === 'filho')).toBe(true);
  }, DEMORA);

  it('o problema só resolve com a causa, a solução e a validação', async () => {
    await entrar('tecnico');
    const op = await api.opcoes();
    const resolvido = etapa(op, 'SUP', 'Resolvido');
    const p = await api.criar({
      ...(await baseDoSuporte(op, 'Quedas no tronco (teste de problema)')), tipoChamado: 'problema',
      assuntoId: assuntoSimples(op).id, tipo: 'Incidente', gravidade: 'intermitencia', alcance: 'empresa',
    });
    await api.mover(p.id, { etapaId: etapa(op, 'SUP', 'N1').id });
    const e1 = await erroDe(api.mover(p.id, { etapaId: resolvido.id }));
    expect(e1.status).toBe(400);
    expect(e1.details).toEqual({ faltam: ['solucao', 'causa', 'validacao'] });

    await api.alterar(p.id, { causa: 'O session timer da operadora derruba a sessão.', solucao: 'Desligamos o session timer na rota.' });
    const e2 = await erroDe(api.mover(p.id, { etapaId: resolvido.id }));
    expect(e2.details).toEqual({ faltam: ['validacao'] });
    expect(e2.message).toBe(mensagemDoQueFalta(['validacao'], 'Resolvido'));

    await api.alterar(p.id, { validacao: 'Dois dias sem queda nos três clientes.' });
    expect((await api.mover(p.id, { etapaId: resolvido.id })).situacao).toBe('resolvido');
    // um chamado comum com o mesmo preenchimento não precisa da validação
    const c = await api.criar({ ...(await baseDoSuporte(op, 'Queda isolada (teste de chamado comum)')), assuntoId: assuntoSimples(op).id, tipo: 'Incidente', gravidade: 'intermitencia', alcance: 'pessoa' });
    await api.alterar(c.id, { causa: 'Cabo solto.', solucao: 'Cabo trocado.' });
    expect((await api.mover(c.id, { etapaId: resolvido.id })).situacao).toBe('resolvido');
  }, DEMORA);

  it('esperar o cliente pausa o prazo de solução (e tirar a marca volta a contar)', async () => {
    const marina = await entrar('operador');
    const op = await api.opcoes();
    // nos exemplos: o chamado esperando o cliente está com o prazo parado
    const exemplo = await chamadoPeloTitulo('Agentes caem da fila depois do almoço');
    expect(exemplo.espera?.tipo).toBe('cliente');
    expect(exemplo.prazos.solucao.situacao).toBe('pausado');
    expect(exemplo.prazos.solucao.venceEm).toBeNull();

    // com dona: o Meu dia mostra, em "Esperando o cliente", só os meus
    const r = await api.criar({ ...(await baseDoSuporte(op, 'Ramal mudo (teste de espera)')), gravidade: 'inoperancia', alcance: 'pessoa', responsavelId: marina.id });
    const antes = await api.chamado(r.id);
    expect(antes.prazos.solucao.situacao).toBe('no_prazo');
    expect(antes.prazos.solucao.venceEm).not.toBeNull();

    expect((await erroDe(api.esperar(r.id, { tipo: 'cliente' }))).message).toBe('Diga o motivo da espera.');
    const parado = await api.esperar(r.id, { tipo: 'cliente', motivo: 'Pedimos para reiniciar o aparelho' });
    expect(parado.espera).toEqual(expect.objectContaining({ tipo: 'cliente', motivo: 'Pedimos para reiniciar o aparelho' }));
    expect(parado.prazos.solucao.situacao).toBe('pausado');
    expect(parado.prazos.solucao.venceEm).toBeNull();
    expect((await api.meuDia()).esperandoCliente.map((c) => c.id)).toContain(r.id);

    const voltou = await api.esperar(r.id, { tipo: null });
    expect(voltou.espera).toBeNull();
    expect(voltou.prazos.solucao.situacao).toBe('no_prazo');
    expect(voltou.historico.filter((e) => e.tipo === 'espera')).toHaveLength(2);
  }, DEMORA);

  it('assumir leva o chamado do Novo para o N1 (e fica no Novo se falta o que o N1 pede)', async () => {
    await entrar('admin');
    const op = await api.opcoes();
    const r = await api.criar(await baseDoSuporte(op, 'Telefone novo (teste de assumir)'));
    const semCliente = await api.criar({ painelId: painel(op, 'SUP').id, titulo: 'Ligação de número desconhecido (teste de assumir)' });
    const camila = await entrar('camila');
    const f = await api.assumir(r.id);
    expect(f.etapaId).toBe(etapa(op, 'SUP', 'N1').id);
    expect(f.responsavel?.id).toBe(camila.id);
    expect(f.historico.slice(-2).map((e) => e.tipo)).toEqual(['etapa', 'responsavel']);
    const g = await api.assumir(semCliente.id);
    expect(g.etapaId).toBe(etapa(op, 'SUP', 'Novo').id);
    expect(g.responsavel?.id).toBe(camila.id);
  }, DEMORA);

  it('o Leitor vê os chamados, mas não abre nem mexe', async () => {
    await entrar('leitor');
    const op = await api.opcoes();
    expect(op.pode).toEqual({ trabalhar: false, cuidar: false, integrar: false });
    const e = await erroDe(api.criar({ painelId: painel(op, 'SUP').id, titulo: 'Chamado do leitor' }));
    expect(e.status).toBe(403);
    expect(e.message).toBe('Esta ação exige a permissão "tickets.work"');
    expect((await api.quadro({ painel: painel(op, 'SUP').id })).colunas).toHaveLength(7);
    const algum = (await todosOsChamados())[0]!;
    expect((await erroDe(api.anotar(algum.id, { texto: 'oi', anexos: [] }))).status).toBe(403);
    expect((await erroDe(api.ajustesPrazos())).status).toBe(403);
    expect((await erroDe(api.integracoes())).status).toBe(403);
  }, DEMORA);

  it('o painel de escolhidos não existe para quem não está nele (404, nunca 403)', async () => {
    const luan = await entrar('admin');
    const op = await api.opcoes();
    const dir = await painelDaDiretoria(luan.id);
    const r = await api.criar({ ...(await baseDoSuporte(op, 'Contrato novo da diretoria')), painelId: dir.id });

    await entrar('tecnico');
    const visto = await api.opcoes();
    expect(visto.paineis.some((p) => p.id === dir.id)).toBe(false);
    const quadro = await erroDe(api.quadro({ painel: dir.id }));
    expect([quadro.status, quadro.message]).toEqual([404, 'Painel não encontrado']);
    const ficha = await erroDe(api.chamado(r.codigo));
    expect([ficha.status, ficha.message]).toEqual([404, 'Chamado não encontrado']);
    expect((await todosOsChamados()).some((c) => c.id === r.id)).toBe(false);
    // citado em outro chamado, é "não achei" (o técnico nem sabe que ele existe)
    const meu = await api.criar(await baseDoSuporte(visto, 'Chamado do técnico (teste de escolhidos)'));
    const ligar = await erroDe(api.ligar(meu.id, { para: r.codigo, tipo: 'relacionado' }));
    expect([ligar.status, ligar.message]).toEqual([400, `Não achei o chamado ${r.codigo}.`]);

    // entrando na lista do painel, aparece
    const lucio = (await demoApi.auth.me()).id;
    await entrar('admin');
    const atual = (await api.opcoes()).paineis.find((p) => p.id === dir.id)!;
    await api.salvarPainel(dir.id, { nome: atual.nome, sigla: atual.sigla, descricao: atual.descricao, cor: atual.cor, acesso: 'escolhidos', pessoas: [luan.id, lucio], ajustes: atual.ajustes, ativo: true });
    await entrar('tecnico');
    expect((await api.opcoes()).paineis.some((p) => p.id === dir.id)).toBe(true);
    expect((await api.chamado(r.codigo)).id).toBe(r.id);
  }, DEMORA);

  it('a lixeira: o chamado sai e volta pela Administração, com o histórico', async () => {
    await entrar('tecnico');
    const op = await api.opcoes();
    const r = await api.criar(await baseDoSuporte(op, 'Chamado aberto por engano (teste da lixeira)'));
    expect((await erroDe(api.remover(r.id))).status).toBe(403);
    await entrar('admin');
    expect(await api.remover(r.id)).toEqual({ ok: true });
    expect((await erroDe(api.chamado(r.codigo))).status).toBe(404);
    const item = (await demoApi.admin.trash()).find((i) => i.type === 'ticket' && i.id === r.id);
    expect(item?.label).toBe(`${r.codigo} · Chamado aberto por engano (teste da lixeira)`);
    await demoApi.admin.restore('ticket', r.id);
    const f = await api.chamado(r.codigo);
    expect(f.historico.slice(-2).map((e) => [e.tipo, (e.dados as { acao: string }).acao])).toEqual([['lixeira', 'mandou'], ['lixeira', 'restaurou']]);
    expect((await demoApi.admin.audit({ entityType: 'ticket', pageSize: 5 } as never)).items[0]!.summary).toContain('Restaurou o chamado');
  }, DEMORA);

  it('Preencher com IA lê a conversa do robô ou o próprio chamado, e só sugere o que existe', async () => {
    await entrar('operador');
    const op = await api.opcoes();
    expect(op.ia.ativa).toBe(true);
    const robo = await chamadoPeloTitulo('Atendimento de Joana Silva');
    const s = await api.preencherComIa(robo.id);
    expect(s.fonte).toBe('conversa');
    expect(s.modelo).toBe('Claude Sonnet 5.5');
    expect(typeof s.custo).toBe('number');
    if (s.assuntoId) expect(op.assuntos.some((a) => a.id === s.assuntoId && a.painelId === robo.painelId)).toBe(true);
    if (s.tipo) expect(painel(op, 'SUP').ajustes.tipos).toContain(s.tipo);
    for (const p of s.produtos) expect(op.produtos.some((x) => x.id === p)).toBe(true);
    const manual = await api.criar({ ...(await baseDoSuporte(op, 'Ramal 2040 não toca')), relato: 'O ramal 2040 da recepção não toca desde ontem.' });
    const s2 = await api.preencherComIa(manual.id);
    expect(s2.fonte).toBe('chamado');
    if (s2.assuntoId) expect(caminhoDoAssunto(s2.assuntoId, op.assuntos)).toMatch(/^Ramal/);
  }, DEMORA);

  it('avisar o cliente e testar o WhatsApp conferem como o servidor, sem mandar nada', async () => {
    await entrar('operador');
    const op = await api.opcoes();
    expect(op.whatsapp).toEqual({ cliente: true, equipe: true });
    const r = await api.criar({ ...(await baseDoSuporte(op, 'Aviso ao cliente (teste)')), contatoNome: 'Maria', contatoTelefone: '(71) 99999-0042' });
    const f = await api.avisarCliente(r.id, 'Estamos verificando o seu ramal.');
    const ultimo = f.historico[f.historico.length - 1]!;
    expect(ultimo.tipo).toBe('aviso_cliente');
    expect(ultimo.dados).toEqual(expect.objectContaining({ ok: true, texto: 'Estamos verificando o seu ramal.' }));
    const semFone = await api.criar(await baseDoSuporte(op, 'Sem telefone (teste)'));
    expect((await erroDe(api.avisarCliente(semFone.id, 'Oi'))).message).toBe('O chamado não tem o WhatsApp do contato.');
    await entrar('admin');
    expect(await api.testarAvisos({ de: 'equipe' })).toEqual({ ok: true, mensagem: 'Prévia: nada foi enviado de verdade' });
  }, DEMORA);

  it('as integrações: a chave nova aparece uma vez e não fica guardada', async () => {
    await entrar('admin');
    const antes = await api.integracoes();
    expect(antes.endereco).toBe('https://gestao.inglinesystems.com.br');
    expect(antes.chaves.map((k) => k.nome)).toContain('Robô do LineChat');
    expect(antes.webhooks.map((w) => [w.nome, w.ultimoOk])).toContainEqual(['n8n — IA Preenche Chamado', true]);
    const { chave, valor } = await api.criarChave('Teste da prévia');
    expect(valor.startsWith(chave.inicio)).toBe(true);
    expect(JSON.stringify(await api.integracoes())).not.toContain(valor);
    const interno = await erroDe(api.salvarWebhook(null, { nome: 'Interno', url: 'https://192.168.0.10/gancho', eventos: ['chamado.criado'], ativo: true }));
    expect(interno.status).toBe(400);
  }, DEMORA);
});
