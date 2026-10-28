/**
 * A prévia dos chamados (demo-atendimento.ts) tem de valer igual ao servidor: estes testes passam pela
 * mesma `demoApi` que a página publicada usa, entrando como as pessoas da prévia.
 *
 * Os testes rodam em ordem e dividem o mesmo estado (a prévia é uma só na memória): primeiro os que só
 * leem os exemplos, depois os que abrem e mexem nos próprios chamados de teste.
 */
import { describe, expect, it } from 'vitest';
import {
  MENSAGEM_DO_TITULO, CARGOS_DE_FABRICA, caminhoDoAssunto, diaLocal, EXEMPLO_DO_LINECHAT, MAPA_DO_ROBO_PADRAO, mensagemDoQueFalta, mensagemPreenchida, prioridadeSugeridaDoPainel, reais, somarDias, TROCA_ENTRA_NO_FUNIL,
  NEGOCIACAO_SEM_PAI, NEGOCIACAO_SEM_PROBLEMA, negociacaoNaoEPai, VALOR_E_A_SOMA, ATIVACAO_E_A_SOMA, NEGOCIACAO_SEM_LIGACAO, negociacaoNaoSeLiga,
  NIA_PADRAO, resumoDaNia,
  type CartaoChamado,
} from '@gestor/shared';
import { demoApi } from './demo.js';
import { diagnosticoDosChamadosDemo, trocarEsperaDaNiaDemo } from './demo-atendimento.js';
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
/** Quem entrou (para pôr como responsável: sair do Novo pede um, 2.2). */
const eu = async () => (await demoApi.auth.me()).id;
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
    // os meses de antes do Suporte (2.1, para os Relatórios) moram à parte: aqui contam só os exemplos
    const doHistorico = new Set(diag!.historico);
    const supInteiro = todos.filter((c) => c.painelId === painel(op, 'SUP').id);
    const sup = supInteiro.filter((c) => !doHistorico.has(c.codigo));
    const dev = todos.filter((c) => c.painelId === painel(op, 'DEV').id);
    expect(sup).toHaveLength(45);
    expect(dev).toHaveLength(7);
    // os números de cada painel: 1, 2, 3… sem buraco (no Suporte, com o histórico misturado na ordem de chegada)
    expect(supInteiro.map((c) => c.numero).sort((a, b) => a - b)).toEqual(Array.from({ length: 45 + doHistorico.size }, (_, i) => i + 1));
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
  }, DEMORA);

  it('o quadro, a lista e o Meu dia contam os mesmos chamados', async () => {
    const eu = await entrar('admin');
    const op = await api.opcoes();
    const sup = painel(op, 'SUP');
    const q = await api.quadro({ painel: sup.id });
    expect(q.colunas.map((c) => c.etapa.nome)).toEqual(['Novo', 'N1', 'N2', 'N3', 'DEV', 'Em observação', 'Resolvido', 'Fechado']);
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

    // a tela inicial (os painéis): os números de cada painel batem com a lista filtrada
    const resumo = (await api.resumoDosPaineis()).find((r) => r.painelId === sup.id)!;
    expect(resumo.abertos).toBe((await api.lista({ painel: sup.id })).total);
    expect(resumo.semDono).toBe((await api.lista({ painel: sup.id, responsavel: 'ninguem' })).total);
    expect(resumo.meus).toBe((await api.lista({ painel: sup.id, responsavel: 'eu' })).total);
    expect(resumo.vencidos).toBe((await api.lista({ painel: sup.id, prazo: 'vencidos' })).total);
    expect(resumo.porEtapa.map((e) => e.etapaId)).toEqual(q.colunas.filter((c) => c.etapa.tipo !== 'fechado').map((c) => c.etapa.id));
    for (const e of resumo.porEtapa) expect(e.total).toBe(q.colunas.find((c) => c.etapa.id === e.etapaId)!.total);

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

    // o sininho do Luan: os cinco dos chamados que ele precisa ver (um é a novidade de um chamado que ele
    // observa) e, desde o 2.0.2, o lembrete do calendário (o retorno da Clínica Aurora, daqui a pouco). Os
    // lembretes dos outros exemplos dependem da hora em que o teste roda: contam à parte.
    const av = await api.avisos();
    const naoLidos = av.itens.filter((a) => !a.lido);
    expect(av.naoLidos).toBe(naoLidos.length);
    const dosChamados = naoLidos.filter((a) => !a.evento);
    expect(dosChamados).toHaveLength(5);
    expect(new Set(dosChamados.map((a) => a.tipo))).toEqual(new Set(['critico', 'prazo_perto', 'recebeu', 'sem_dono', 'observador']));
    expect(naoLidos.some((a) => a.tipo === 'lembrete' && !!a.evento && a.texto.includes('Retorno — Clínica Aurora'))).toBe(true);
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
    const formato = await erroDe(api.criar({ painelId: sup.id, titulo: 'Teste', prioridade: 'qualquer' as never }));
    expect(formato.status).toBe(400);
    expect(formato.message).toBe('Dados inválidos');
    expect(formato.details).toEqual([expect.objectContaining({ field: 'prioridade' })]);
    // o título curto: o chamado pede 3 letras (o tipo do painel decide; na negociação ele é opcional — 2.0.3)
    expect((await erroDe(api.criar({ painelId: sup.id, titulo: 'ab' }))).message).toBe(MENSAGEM_DO_TITULO.chamado);

    const maior = Math.max(...(await todosOsChamados()).filter((c) => c.painelId === sup.id).map((c) => c.numero));
    const base = await baseDoSuporte(op, 'Central sem receber ligações (teste)');
    // o Suporte não usa o alcance (por enquanto): a sugestão sai só da gravidade, e o alcance que vier fica de fora
    expect(sup.ajustes.camposDesligados).toEqual(['alcance']);
    const sugerida = prioridadeSugeridaDoPainel(sup.ajustes, 'inoperancia', 'empresa', op.prazos)!;
    expect(sugerida).toBe(op.prazos.semAlcance.inoperancia);
    const r = await api.criar({ ...base, gravidade: 'inoperancia', alcance: 'empresa' });
    expect(r.codigo).toBe(`SUP-${maior + 1}`);
    const f = await api.chamado(r.codigo);
    expect(f.etapaId).toBe(etapa(op, 'SUP', 'Novo').id);
    expect(f.prioridade).toBe(sugerida);
    expect(f.prioridadeSugerida).toBe(sugerida);
    expect(f.alcance).toBeNull();
    expect(f.motivoPrioridade).toBeNull();
    expect(f.criadoPor?.id).toBe(lucio.id);
    // quem abre na tela já está falando com o cliente: a abertura é a primeira resposta
    expect(f.prazos.resposta.situacao).toBe('cumprido');
    // (o aviso da etapa pelo WhatsApp da equipe também entra no histórico; aqui só interessa o resto)
    expect(f.historico.map((e) => e.tipo).filter((t) => t !== 'aviso_equipe')).toEqual(['criado']);

    // trocar a sugerida não pede mais o motivo (2.2); o que vier fica guardado
    const outra = sugerida === 'baixa' ? 'alta' : 'baixa';
    const semMotivo = await api.criar({ ...base, gravidade: 'inoperancia', alcance: 'empresa', prioridade: outra });
    expect(semMotivo.codigo).toBe(`SUP-${maior + 2}`);
    expect((await api.chamado(semMotivo.id)).prioridade).toBe(outra);
    const r2 = await api.criar({ ...base, gravidade: 'inoperancia', alcance: 'empresa', prioridade: outra, motivoPrioridade: 'O cliente tem o contorno pelo celular' });
    expect(r2.codigo).toBe(`SUP-${maior + 3}`);
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
    // sair do Novo pede o responsável (2.2, como o servidor); no próprio mover (a janela do quadro), vai
    const semDono = await erroDe(api.mover(r.id, { etapaId: n1.id }));
    expect(semDono.status).toBe(400);
    expect(semDono.details).toEqual({ faltam: ['responsavel'] });
    expect(semDono.message).toBe('Para ir para N1, falta preencher: Responsável.');
    expect((await api.chamado(r.id)).faltam[n1.id]).toEqual(['responsavel']);
    expect((await api.mover(r.id, { etapaId: n1.id, responsavelId: await eu() })).etapaId).toBe(n1.id);

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

  it('os outros contatos e as outras conversas (2.2, como o servidor): a lista inteira, sem o vazio, o repetido e o principal', async () => {
    await entrar('operador');
    const op = await api.opcoes();
    const r = await api.criar({ ...(await baseDoSuporte(op, 'Teste dos contatos a mais')), contatoNome: 'Sandra', contatoTelefone: '(75) 3604-9000', sessaoId: 'sessao-principal' });
    const f = await api.alterar(r.id, {
      outrosContatos: [{ nome: 'João do financeiro', telefone: '(71) 98888-7777' }, { nome: 'Sandra', telefone: '75 3604-9000' }, { nome: 'Rita' }],
      outrasConversas: ['sessao-extra', 'sessao-principal', 'sessao-extra'],
    });
    expect(f.outrosContatos).toEqual([{ nome: 'João do financeiro', telefone: '5571988887777' }, { nome: 'Rita', telefone: null }]);
    expect(f.outrasConversas.map((c) => c.sessaoId)).toEqual(['sessao-extra']);
    expect(f.historico.filter((e) => e.tipo === 'campo').map((e) => e.texto)).toEqual(expect.arrayContaining([
      'mudou Outros contatos para "João do financeiro (71) 98888-7777, Rita"', 'mudou Outras conversas no LineChat para "sessao-extra"',
    ]));
    // a busca acha pelo outro contato
    expect((await api.lista({ q: 'financeiro', situacao: 'todos' })).items.map((c) => c.id)).toContain(r.id);
    expect((await api.alterar(r.id, { outrosContatos: [], outrasConversas: [] })).outrosContatos).toEqual([]);
  }, DEMORA);

  it('o pai com filho aberto não resolve nem fecha', async () => {
    await entrar('tecnico');
    const op = await api.opcoes();
    const assunto = assuntoSimples(op);
    const pai = await api.criar({
      ...(await baseDoSuporte(op, 'Relatório errado em todas as filas (teste de pai)')), assuntoId: assunto.id, tipo: 'Incidente', gravidade: 'disfuncional', alcance: 'setor',
      responsavelId: await eu(),
    });
    await api.mover(pai.id, { etapaId: etapa(op, 'SUP', 'N1').id });
    await api.alterar(pai.id, { solucao: 'Corrigido no Desenvolvimento.', causa: 'Erro na conta do relatório.' });
    // o Desenvolvimento pede o Sistema para abrir (um campo do painel)
    const semSistema = await erroDe(api.criar({ painelId: painel(op, 'DEV').id, titulo: 'Corrigir a conta do relatório (teste de filho)', relato: 'Vem do suporte.', paiId: pai.codigo }));
    expect(semSistema.message).toBe('Falta preencher: Sistema.');
    const filho = await api.criar({ painelId: painel(op, 'DEV').id, titulo: 'Corrigir a conta do relatório (teste de filho)', relato: 'Vem do suporte.', paiId: pai.codigo, campos: { Sistema: 'LineReports' }, responsavelId: await eu() });
    expect(filho.codigo).toMatch(/^DEV-/);

    for (const nome of ['Resolvido', 'Fechado']) {
      const e = await erroDe(api.mover(pai.id, { etapaId: etapa(op, 'SUP', nome).id }));
      expect(e.status).toBe(400);
      expect(e.details).toEqual({ filhos: [filho.codigo] });
      expect(e.message).toBe(`O ${pai.codigo} tem filhos em aberto: ${filho.codigo}. Feche os filhos antes.`);
    }
    // o filho entregue (resolvido) já deixa o pai resolver; fechar, só com o filho fechado
    await api.alterar(filho.id, { solucao: 'Conta corrigida.' });
    // o Entregue pede a Versão publicada (outro campo do painel)
    expect((await erroDe(api.mover(filho.id, { etapaId: etapa(op, 'DEV', 'Entregue').id }))).message).toBe('Para ir para Entregue, falta preencher: Versão publicada.');
    await api.alterar(filho.id, { campos: { 'Versão publicada': 'LineReports 4.3' } });
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
      assuntoId: assuntoSimples(op).id, tipo: 'Incidente', gravidade: 'intermitencia', alcance: 'empresa', responsavelId: await eu(),
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
    const c = await api.criar({ ...(await baseDoSuporte(op, 'Queda isolada (teste de chamado comum)')), assuntoId: assuntoSimples(op).id, tipo: 'Incidente', gravidade: 'intermitencia', alcance: 'pessoa', responsavelId: await eu() });
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
    expect((await api.quadro({ painel: painel(op, 'SUP').id })).colunas).toHaveLength(8);
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

  it('a janela do painel: nasce com as etapas escolhidas; editar com as etapas grava tudo junto (e nada, sem o destino)', async () => {
    await entrar('admin');
    const op = await api.opcoes();
    const p = await api.salvarPainel(null, {
      nome: 'Ativações', sigla: 'ATVX', acesso: 'todos', pessoas: [], ajustes: {},
      etapas: [{ nome: 'Pedido', tipo: 'entrada' }, { nome: 'Instalação', tipo: 'andamento', nivel: 1 }, { nome: 'Encerrado', tipo: 'fechado' }],
    });
    expect(p.etapas.map((e) => [e.nome, e.tipo, e.nivel])).toEqual([['Pedido', 'entrada', null], ['Instalação', 'andamento', 1], ['Encerrado', 'fechado', null]]);
    const auditoria = async () => (await demoApi.admin.audit({ entityType: 'ticket_panel', pageSize: 1 } as never)).items[0]!.summary;
    expect(await auditoria()).toBe('Criou o painel Ativações (ATVX), com as etapas Pedido, Instalação e Encerrado');
    // a lista segue as regras de sempre (a mesma mensagem do servidor)
    const repetida = await erroDe(api.salvarPainel(null, { nome: 'Outro', sigla: 'OUTX', ajustes: {}, etapas: [{ nome: 'Novo', tipo: 'entrada' }, { nome: 'novo', tipo: 'fechado' }] }));
    expect(repetida.status).toBe(400);
    expect((await api.opcoes()).paineis.some((x) => x.sigla === 'OUTX')).toBe(false);

    const t = await api.criar({ ...(await baseDoSuporte(op, 'Ativar o ramal (teste da janela do painel)')), painelId: p.id });
    const [pedido, instalacao, encerrado] = p.etapas;
    const comId = (e: typeof pedido) => ({ id: e!.id, nome: e!.nome, tipo: e!.tipo, nivel: e!.nivel, obrigatorios: e!.obrigatorios, avisar: e!.avisar });
    const pedidoNovo = { nome: 'Ativações e visitas', sigla: 'ATVX', acesso: 'todos' as const, pessoas: [], ajustes: {}, etapas: [comId(instalacao), { nome: 'Visita', tipo: 'andamento' as const }, comId(encerrado)] };
    const semDestino = await erroDe(api.salvarPainel(p.id, pedidoNovo));
    expect([semDestino.status, semDestino.message]).toEqual([400, 'A etapa Pedido tem 1 chamado: escolha para onde ele vai.']);
    expect(semDestino.details).toEqual({ etapas: [{ id: pedido!.id, nome: 'Pedido', chamados: 1 }] });
    const igual = (await api.opcoes()).paineis.find((x) => x.id === p.id)!;
    expect([igual.nome, igual.etapas.map((e) => e.nome)]).toEqual(['Ativações', ['Pedido', 'Instalação', 'Encerrado']]);

    const ok = await api.salvarPainel(p.id, { ...pedidoNovo, destino: { [pedido!.id]: instalacao!.id } });
    expect([ok.nome, ok.etapas.map((e) => e.nome)]).toEqual(['Ativações e visitas', ['Instalação', 'Visita', 'Encerrado']]);
    expect((await api.chamado(t.codigo)).etapaId).toBe(instalacao!.id);
    expect(await auditoria()).toBe('Alterou o painel Ativações e visitas (ATVX): antes se chamava Ativações; nas etapas, entrou Visita; saiu Pedido; 1 chamado foi de Pedido para Instalação');
  }, DEMORA);

  it('os campos de cada painel: o Desenvolvimento sem assunto; criar, pedir, mudar e desativar um campo (as regras do servidor)', async () => {
    await entrar('admin');
    let op = await api.opcoes();
    const dev = painel(op, 'DEV');
    expect(dev.ajustes.camposDesligados).toEqual(['assunto', 'alcance', 'operadoras']);
    expect(op.campos.filter((c) => c.painelId === dev.id).map((c) => c.nome)).toEqual(['Sistema', 'Como reproduzir', 'Versão publicada', 'Previsão de entrega']);
    // os chamados do Desenvolvimento têm o Sistema; nenhum mostra assunto
    const doDev = (await todosOsChamados()).filter((c) => c.painelId === dev.id);
    const sistema = op.campos.find((c) => c.painelId === dev.id && c.nome === 'Sistema')!;
    expect(doDev.every((c) => !c.assunto && typeof c.campos[sistema.id] === 'string')).toBe(true);

    // criar um campo no Suporte, obrigatório para entrar no N2
    const sup = painel(op, 'SUP');
    const n2 = etapa(op, 'SUP', 'N2');
    const campo = await api.salvarCampo(sup.id, null, { nome: 'Ramal afetado', tipo: 'numero', dica: 'o número do ramal', etapas: [n2.id] });
    expect(campo).toMatchObject({ nome: 'Ramal afetado', tipo: 'numero', ativo: true });
    op = await api.opcoes();
    expect(etapa(op, 'SUP', 'N2').obrigatorios).toContain(`campo:${campo.id}`);
    expect((await erroDe(api.salvarCampo(sup.id, null, { nome: 'ramal AFETADO', tipo: 'texto' }))).message).toBe('O painel Suporte já tem o campo Ramal afetado.');
    expect((await erroDe(api.salvarCampo(sup.id, null, { nome: 'Assunto', tipo: 'texto' }))).message).toBe('Todo chamado do painel Suporte já tem o campo Assunto: escolha outro nome.');

    const t = await api.criar({ ...(await baseDoSuporte(op, 'Ramal sem áudio (teste dos campos)')), assuntoId: assuntoSimples(op).id, responsavelId: await eu() });
    await api.mover(t.id, { etapaId: etapa(op, 'SUP', 'N1').id });
    const falta = await erroDe(api.mover(t.id, { etapaId: n2.id, motivo: 'Precisa do N2' }));
    expect([falta.message, falta.details]).toEqual(['Para ir para N2, falta preencher: Ramal afetado.', { faltam: [`campo:${campo.id}`] }]);
    expect((await erroDe(api.alterar(t.id, { campos: { [campo.id]: 'duzentos' } }))).message).toBe('Ramal afetado: escreva um número');
    const f = await api.alterar(t.id, { campos: { 'Ramal afetado': '203' } });
    expect(f.campos[campo.id]).toBe(203);
    expect(f.historico.at(-1)!.texto).toBe('mudou Ramal afetado para "203"');
    expect((await api.mover(t.id, { etapaId: n2.id, motivo: 'Precisa do N2' })).etapaId).toBe(n2.id);

    // desligar o Tipo no Suporte: sai das regras e da ficha; ligar de novo, volta
    const comTipo = sup.ajustes.obrigatoriosAoAbrir.includes('tipo') || sup.etapas.some((e) => e.obrigatorios.includes('tipo'));
    expect(comTipo).toBe(true);
    const semTipo = await api.salvarCamposDoSistema(sup.id, { desligados: ['tipo'], tipos: sup.ajustes.tipos });
    expect(semTipo.etapas.some((e) => e.obrigatorios.includes('tipo'))).toBe(false);
    const tipoAntes = (await api.chamado('SUP-1')).tipo;
    expect((await api.chamado('SUP-1')).tipo).toBeNull();
    await api.salvarCamposDoSistema(sup.id, { desligados: [], tipos: sup.ajustes.tipos });
    expect(tipoAntes).toBeNull();
    expect((await api.chamado('SUP-1')).tipo).not.toBeNull();

    // desativar o campo: some da ficha e das regras; o valor fica guardado
    await api.salvarCampo(sup.id, campo.id, { nome: 'Ramal afetado', tipo: 'numero', ativo: false });
    expect((await api.chamado(t.codigo)).campos[campo.id]).toBeUndefined();
    expect(etapa(await api.opcoes(), 'SUP', 'N2').obrigatorios).not.toContain(`campo:${campo.id}`);
    await api.salvarCampo(sup.id, campo.id, { nome: 'Ramal afetado', tipo: 'numero', ativo: true });
    expect((await api.chamado(t.codigo)).campos[campo.id]).toBe(203);
    // o tipo não muda; o Operador não mexe
    expect((await erroDe(api.salvarCampo(sup.id, campo.id, { nome: 'Ramal afetado', tipo: 'texto' }))).message).toMatch(/^O tipo do campo não muda/);
    await entrar('operador');
    expect((await erroDe(api.salvarCampo(sup.id, null, { nome: 'Outro', tipo: 'texto' }))).status).toBe(403);
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

  it('a NIA na ficha (2.1, como o servidor): o botão põe a etiqueta, a NIA de exemplo responde, e o resumo diz quando e o que mudou', async () => {
    await entrar('operador');
    const op = await api.opcoes();
    expect(op.nia).toEqual({ pedir: NIA_PADRAO.pedir, pronto: NIA_PADRAO.pronto, erro: NIA_PADRAO.erro });
    // o exemplo: o robô abriu sem título e sem nome; a Marina pediu à NIA, e ela preencheu
    const exemplo = await chamadoPeloTitulo('Não consegue entrar no LineReports');
    expect(exemplo.etiquetas).toContain(NIA_PADRAO.pronto);
    const r0 = resumoDaNia(exemplo, NIA_PADRAO);
    expect(r0).toMatchObject({ situacao: 'pronta', pedidaPor: 'Marina Costa', respondidaPor: 'NIA no n8n', vezes: 1, anotacoes: 2 });
    expect(r0.mudou).toEqual(expect.arrayContaining(['Título', 'Descrição']));
    expect(exemplo.anotacoesLista.map((n) => n.texto.split(':')[0])).toEqual(expect.arrayContaining(['Situação', 'Diagnóstico']));

    // um chamado novo: pedir → a etiqueta entra e a NIA ainda não respondeu (pedir de novo, logo, não dá)
    trocarEsperaDaNiaDemo(60_000);
    const novo = await api.criar({ ...(await baseDoSuporte(op, 'Pedir à NIA (teste)')), relato: 'O ramal 2040 da recepção não toca desde ontem.' });
    const pedida = await api.pedirANia(novo.id);
    expect(pedida.etiquetas).toContain(NIA_PADRAO.pedir);
    expect(resumoDaNia(pedida, NIA_PADRAO)).toMatchObject({ situacao: 'pedida', pedidaPor: 'Marina Costa', podePedir: false });
    expect((await erroDe(api.pedirANia(novo.id))).message).toMatch(/^A NIA foi chamada às \d\d:\d\d e ainda está preenchendo/);
    // a NIA de exemplo responde (a ficha relida): a de pronto no lugar da de pedir, a Situação e o Diagnóstico
    trocarEsperaDaNiaDemo(0);
    const pronta = await api.chamado(novo.codigo);
    expect(pronta.etiquetas).toContain(NIA_PADRAO.pronto);
    expect(pronta.etiquetas).not.toContain(NIA_PADRAO.pedir);
    expect(resumoDaNia(pronta, NIA_PADRAO)).toMatchObject({ situacao: 'pronta', respondidaPor: 'NIA no n8n', vezes: 1, anotacoes: 2, podePedir: true });
    // de novo: a de pronto sai, a de pedir volta
    const deNovo = await api.pedirANia(novo.id);
    expect(deNovo.etiquetas).toContain(NIA_PADRAO.pedir);
    expect(deNovo.etiquetas).not.toContain(NIA_PADRAO.pronto);
    expect(resumoDaNia(deNovo, NIA_PADRAO)).toMatchObject({ situacao: 'pedida', vezes: 1 });
    expect(resumoDaNia(await api.chamado(novo.codigo), NIA_PADRAO)).toMatchObject({ situacao: 'pronta', vezes: 2 });
    trocarEsperaDaNiaDemo(4_000);

    // a negociação não tem a NIA; o Leitor não pede; desligada, a ficha não mostra o botão
    await entrar('camila');
    const neg = await chamadoPeloTitulo('PABX em nuvem — 40 ramais');
    expect((await erroDe(api.pedirANia(neg.id))).message).toBe('A NIA preenche os chamados: a negociação não tem a NIA.');
    await entrar('leitor');
    expect((await erroDe(api.pedirANia(novo.id))).status).toBe(403);
    await entrar('admin');
    expect((await erroDe(api.salvarNia({ ligada: true, pedir: 'IA', pronto: 'ia', erro: 'IA erro' }))).status).toBe(400);
    await api.salvarNia({ ...NIA_PADRAO, ligada: false });
    expect((await api.opcoes()).nia).toBeNull();
    expect((await erroDe(api.pedirANia(novo.id))).message).toMatch(/desligado/);
    expect(await api.salvarNia(NIA_PADRAO)).toEqual(NIA_PADRAO);
    expect(await api.niaAjustes()).toEqual(NIA_PADRAO);
  }, DEMORA);

  it('a conversa do LineChat ligada à mão (2.1, como o servidor): o link colado vira a sessão; trocar e tirar vão para o histórico', async () => {
    const U1 = '83858976-9930-4a4e-8f0e-1c2d3e4f5a6b';
    const U2 = '1a2b3c4d-5e6f-4a1b-9c2d-3e4f5a6b7c8d';
    await entrar('operador');
    const op = await api.opcoes();
    expect(op.linkConversa).toBe('https://inglinechat.com.br/chat/{sessao}');
    // abrir à mão (o chamado ativo) com o link da conversa
    expect((await erroDe(api.criar({ ...(await baseDoSuporte(op, 'Retorno ativo (teste)')), sessaoId: 'https://inglinechat.com.br/painel' }))).message).toMatch(/^Não achei a sessão nesse link/);
    const r = await api.criar({ ...(await baseDoSuporte(op, 'Retorno ativo (teste)')), sessaoId: `https://inglinechat.com.br/chat/${U1}` });
    let f = await api.chamado(r.codigo);
    expect(f.sessaoId).toBe(U1);
    expect(f.conversaUrl).toBe(`https://inglinechat.com.br/chat/${U1}`);
    // trocar pelo link de outra conversa (outro endereço: vale o uuid), e tirar
    f = await api.alterar(r.id, { sessaoId: `https://app.helena.app/chat2/sessions/${U2.toUpperCase()}` });
    expect(f.sessaoId).toBe(U2);
    expect(f.historico.at(-1)).toMatchObject({ tipo: 'campo', dados: { campo: 'Conversa no LineChat', de: U1, para: U2 } });
    expect((await erroDe(api.alterar(r.id, { sessaoId: 'conversa da Maria' }))).message).toMatch(/não tem espaço/);
    f = await api.alterar(r.id, { sessaoId: null });
    expect(f.sessaoId).toBeNull();
    expect(f.conversaUrl).toBeNull();
    expect(f.historico.at(-1)).toMatchObject({ dados: { campo: 'Conversa no LineChat', de: U2, para: null } });
    await entrar('leitor');
    expect((await erroDe(api.alterar(r.id, { sessaoId: U1 }))).status).toBe(403);
  }, DEMORA);

  it('avisar o cliente e testar o WhatsApp conferem como o servidor, sem mandar nada', async () => {
    await entrar('operador');
    const op = await api.opcoes();
    // a prévia já vem com o modelo aprovado escolhido (o WhatsApp oficial): a ficha mostra a mensagem antes
    expect(op.whatsapp).toMatchObject({ cliente: true, equipe: true, mensagemCliente: { peloModelo: true, nomeDoModelo: 'ticket_atualizacao' } });
    expect(mensagemPreenchida(op.whatsapp.mensagemCliente!, { contato: 'Maria', codigo: 'SUP-9', texto: 'Trocamos o cabo.\nPode testar?' }))
      .toBe('Olá, Maria! Temos uma novidade sobre o seu chamado SUP-9:\n\nTrocamos o cabo. · Pode testar?\n\nSe precisar, é só responder por aqui.');
    const r = await api.criar({ ...(await baseDoSuporte(op, 'Aviso ao cliente (teste)')), contatoNome: 'Maria', contatoTelefone: '(71) 99999-0042' });
    const f = await api.avisarCliente(r.id, 'Estamos verificando o seu ramal.');
    const ultimo = f.historico[f.historico.length - 1]!;
    expect(ultimo.tipo).toBe('aviso_cliente');
    expect(ultimo.dados).toEqual(expect.objectContaining({ ok: true, texto: 'Estamos verificando o seu ramal.', modelo: true }));
    const semFone = await api.criar(await baseDoSuporte(op, 'Sem telefone (teste)'));
    expect((await erroDe(api.avisarCliente(semFone.id, 'Oi'))).message).toBe('O chamado não tem o WhatsApp do contato.');
    await entrar('admin');
    expect(await api.testarAvisos({ de: 'equipe' })).toEqual({ ok: true, mensagem: 'Prévia: nada foi enviado de verdade' });

    // os modelos do número oficial (o Buscar dos Ajustes): os aprovados, com as variáveis e o arquivo do cabeçalho
    const { canal, modelos } = await api.modelosDoLineChat();
    expect(canal.oficial).toBe(true);
    expect(modelos.map((m) => [m.nome, m.variaveis, m.tipoArquivo])).toEqual([
      ['manutencao_programada', ['1', '2'], 'IMAGE'], ['ticket_aberto', ['1', '2'], 'UNDEFINED'], ['ticket_atualizacao', ['nome', 'chamado', 'mensagem'], 'UNDEFINED'],
    ]);
    // sem o modelo escolhido, o cliente não fica pronto (a ficha nem mostra o botão) e o aviso diz o que falta
    const antes = await api.ajustesAvisos();
    const gravar = (m: Partial<typeof antes>) => api.salvarAvisos({ ...antes, pessoas: antes.pessoas.map((p) => ({ userId: p.userId, numero: p.numero, ativo: p.ativo })), ...m });
    await gravar({ template: null });
    expect((await api.opcoes()).whatsapp).toMatchObject({ cliente: false, mensagemCliente: null });
    expect((await erroDe(api.avisarCliente(r.id, 'Oi'))).message).toMatch(/Falta escolher o modelo aprovado/);
    // o modelo com imagem no cabeçalho pede o endereço do arquivo
    const comImagem = modelos.find((m) => m.tipoArquivo === 'IMAGE')!;
    await gravar({ template: { id: comImagem.id, nome: comImagem.nome, texto: comImagem.texto, tipoArquivo: 'IMAGE', arquivo: '', variaveis: [{ nome: '1', valor: '{contato}' }, { nome: '2', valor: 'sábado, 22h' }] } });
    expect((await erroDe(api.avisarCliente(r.id, 'Oi'))).message).toMatch(/tem imagem no cabeçalho: falta o endereço do arquivo/);
    // no texto livre, o cliente fica pronto mesmo sem o modelo (ele vale depois das 24 horas)
    await gravar({ envioCliente: 'texto', template: null });
    expect((await api.opcoes()).whatsapp.mensagemCliente).toMatchObject({ peloModelo: false, nomeDoModelo: null, variaveis: [] });
    await gravar({});
    expect((await api.opcoes()).whatsapp.mensagemCliente).toMatchObject({ peloModelo: true, nomeDoModelo: 'ticket_atualizacao' });
  }, DEMORA);

  it('os observadores recebem toda atualização (como o servidor): abrir, anotar, mover e os campos juntos num aviso só', async () => {
    await entrar('admin');
    const op = await api.opcoes();
    const lucio = op.pessoas.find((p) => p.nome === 'Lúcio Andrade')!;
    const r = await api.criar({ ...(await baseDoSuporte(op, 'Teste dos observadores')), observadores: [lucio.id], responsavelId: await eu() });
    const f = await api.chamado(r.codigo);
    expect(f.observadores.map((o) => o.id)).toEqual([lucio.id]);
    await api.anotar(f.id, { texto: 'Conferi o cabo:\n está bom', anexos: [] });
    await api.alterar(f.id, { descricao: 'O ramal 203 está mudo' });
    await api.alterar(f.id, { solucao: 'Trocamos o cabo', etiquetas: ['cabo'] });
    await api.mover(f.id, { etapaId: etapa(op, 'SUP', 'N1').id });
    // um observador que não existe é recusado, como no servidor
    expect((await erroDe(api.criar({ ...(await baseDoSuporte(op, 'Teste dos observadores 2')), observadores: ['nao-existe'] }))).message).toMatch(/^Um dos observadores escolhidos/);
    await entrar('tecnico');
    const textos = (await api.avisos()).itens.filter((a) => a.tipo === 'observador' && a.chamado?.codigo === r.codigo).map((a) => a.texto);
    expect(textos).toHaveLength(4);
    expect(textos).toEqual(expect.arrayContaining([
      `Luan França pôs você como observador do ${r.codigo}`,
      `Luan França anotou no ${r.codigo}: "Conferi o cabo: está bom"`,
      `Luan França mudou no ${r.codigo}: Descrição · Solução · Etiquetas`,
      `Luan França moveu o ${r.codigo} para N1`,
    ]));
    // quem fez não é avisado do que fez
    await entrar('admin');
    expect((await api.avisos()).itens.some((a) => a.tipo === 'observador' && a.chamado?.codigo === r.codigo)).toBe(false);
  }, DEMORA);

  it('as citações nas anotações (como o servidor): quem é citado recebe o aviso, mesmo sem observar; o observador citado, um aviso só', async () => {
    await entrar('admin');
    const op = await api.opcoes();
    const lucio = op.pessoas.find((p) => p.nome === 'Lúcio Andrade')!;
    const r = await api.criar({ ...(await baseDoSuporte(op, 'Teste das citações')), observadores: [lucio.id] });
    const f0 = await api.chamado(r.codigo);
    expect(f0.citaveis.map((p) => p.nome)).toEqual(expect.arrayContaining(['Bruno Teixeira', 'Lúcio Andrade', 'Luan França']));
    const texto = '@Bruno Teixeira e @Lúcio, conseguem olhar? (eu, @Luan França, acompanho)';
    const f = await api.anotar(f0.id, { texto, anexos: [] });
    expect(f.anotacoesLista.at(-1)!.citados.map((p) => p.nome)).toEqual(['Bruno Teixeira', 'Lúcio Andrade']);
    await entrar('bruno');
    expect((await api.avisos()).itens.find((a) => a.chamado?.codigo === r.codigo)).toMatchObject({ tipo: 'citado', texto: `Luan França citou você no ${r.codigo}: "${texto}"` });
    // o Lúcio observa: recebeu o aviso de quando entrou como observador e o da citação (o da anotação, não)
    await entrar('tecnico');
    expect((await api.avisos()).itens.filter((a) => a.chamado?.codigo === r.codigo).map((a) => a.tipo).sort()).toEqual(['citado', 'observador']);
    // quem escreveu não recebe nada da própria citação
    await entrar('admin');
    expect((await api.avisos()).itens.some((a) => a.tipo === 'citado' && a.chamado?.codigo === r.codigo)).toBe(false);
  }, DEMORA);

  it('os contatos do cliente (como o servidor): incluir, o WhatsApp que não se repete, desativar e o chamado que acha o cliente pelo WhatsApp', async () => {
    await entrar('leitor');
    const clientes = await demoApi.clients.options();
    const aurora = clientes.find((c) => c.name === 'Clínica Aurora')!;
    const hospital = clientes.find((c) => c.name === 'Hospital Vale Verde')!;
    // os exemplos: a Maria e a Juliana ativas, a ex-recepcionista desativada (por último)
    expect((await demoApi.clients.contatos(aurora.id)).map((c) => [c.nome, c.ativo])).toEqual([['Juliana Prates', true], ['Maria Souza', true], ['Lúcia Ramos', false]]);
    // o Leitor vê, mas não inclui
    expect((await erroDe(demoApi.clients.salvarContato(aurora.id, null, { nome: 'Outra Pessoa' }))).status).toBe(403);

    await entrar('operador');
    const roberta = await demoApi.clients.salvarContato(aurora.id, null, { nome: 'Roberta Dias', whatsapp: '(71) 98123-4567', cargo: 'Financeiro', email: '' });
    expect(roberta).toMatchObject({ clienteId: aurora.id, nome: 'Roberta Dias', whatsapp: '5571981234567', cargo: 'Financeiro', email: null, ativo: true, chamados: 0 });
    const dup = await erroDe(demoApi.clients.salvarContato(aurora.id, null, { nome: 'Roberta (outra)', whatsapp: '71 98123-4567' }));
    expect(dup.status).toBe(409);
    expect(dup.message).toBe('O contato Roberta Dias já tem esse WhatsApp neste cliente.');
    expect((await erroDe(demoApi.clients.salvarContato(aurora.id, null, { nome: 'João Lima', email: 'joao@' }))).details).toEqual([{ field: 'email', message: 'E-mail inválido' }]);

    // o chamado que chega só com o WhatsApp de um contato já vem com o cliente e o nome
    const op = await api.opcoes();
    const sup = painel(op, 'SUP');
    const base = { painelId: sup.id, relato: 'O cliente ligou relatando o problema (chamado de teste).' };
    const f = await api.chamado((await api.criar({ ...base, titulo: 'Ligou do celular (teste)', contatoTelefone: '71 98123-4567' })).codigo);
    expect(f.cliente).toEqual({ id: aurora.id, nome: 'Clínica Aurora' });
    expect(f.contato).toEqual({ nome: 'Roberta Dias', telefone: '5571981234567' });
    expect((await demoApi.clients.contatos(aurora.id)).find((c) => c.nome === 'Roberta Dias')!.chamados).toBe(1);
    // o mesmo número em dois clientes: o cliente não é adivinhado; com o cliente escolhido, o nome vem do contato dele
    await demoApi.clients.salvarContato(hospital.id, null, { nome: 'Recepção do hospital', whatsapp: '(71) 96666-2222' });
    await demoApi.clients.salvarContato(aurora.id, null, { nome: 'Recepção da clínica', whatsapp: '(71) 96666-2222' });
    expect((await api.chamado((await api.criar({ ...base, titulo: 'Número dividido (teste)', contatoTelefone: '71 96666-2222' })).codigo)).cliente).toBeNull();
    const doHospital = await api.chamado((await api.criar({ ...base, titulo: 'Do hospital (teste)', clienteId: hospital.id, contatoTelefone: '71 96666-2222' })).codigo);
    expect(doHospital.contato).toEqual({ nome: 'Recepção do hospital', telefone: '5571966662222' });

    // desativar: some do Abrir chamado (o cadastro do cliente) e libera o WhatsApp
    await demoApi.clients.salvarContato(aurora.id, roberta.id, { ...roberta, ativo: false });
    expect((await api.cadastroDoCliente(aurora.id)).contatos.map((c) => c.nome)).not.toContain('Roberta Dias');
    expect((await demoApi.clients.salvarContato(aurora.id, null, { nome: 'Roberta (nova)', whatsapp: '71 98123-4567' })).ativo).toBe(true);
    await entrar('admin');
    const historico = (await demoApi.clients.history(aurora.id)).items.map((a) => a.summary);
    expect(historico).toContain('Incluiu o contato Roberta Dias (Financeiro) em Clínica Aurora');
    expect(historico).toContain('Desativou o contato Roberta Dias de Clínica Aurora');
  }, DEMORA);

  it('o cargo do contato vem da lista dos Catálogos (como o servidor): fora dela não entra, o de antes fica, renomear muda os contatos', async () => {
    await entrar('operador');
    const horizonte = (await demoApi.clients.options()).find((c) => c.name === 'Construtora Horizonte')!;
    expect(await demoApi.clients.cargos()).toEqual([...CARGOS_DE_FABRICA].sort((a, b) => a.localeCompare(b, 'pt-BR')));
    const fora = await erroDe(demoApi.clients.salvarContato(horizonte.id, null, { nome: 'Pedro Alves', cargo: 'Obras' }));
    expect([fora.status, fora.message]).toEqual([400, 'O cargo "Obras" não está na lista (Administração › Catálogos › Cargos dos contatos).']);
    expect((await demoApi.clients.salvarContato(horizonte.id, null, { nome: 'Pedro Alves', cargo: 'ti' })).cargo).toBe('TI');
    // o Paulo é o exemplo do cargo de antes, fora da lista: fica com ele ao mudar outra coisa
    const paulo = (await demoApi.clients.contatos(horizonte.id)).find((c) => c.cargo === 'Engenharia')!;
    expect((await demoApi.clients.salvarContato(horizonte.id, paulo.id, { ...paulo, email: 'paulo@horizonte.exemplo.com.br' })).cargo).toBe('Engenharia');
    // a administração inclui e renomeia: o nome novo vai para os contatos que têm o cargo
    await entrar('admin');
    const eng = await demoApi.admin.createCatalogItem('cargos', 'Engenharia');
    await demoApi.admin.updateCatalogItem('cargos', eng.id, { name: 'Engenharia e obras' });
    expect((await demoApi.clients.contatos(horizonte.id)).find((c) => c.id === paulo.id)!.cargo).toBe('Engenharia e obras');
    expect(await demoApi.clients.cargos()).toContain('Engenharia e obras');
    expect((await demoApi.admin.audit({ pageSize: 5 })).items.map((a) => a.summary)).toContain('Cargos dos contatos: renomeou "Engenharia" para "Engenharia e obras" (1 contato passou para o nome novo)');
  }, DEMORA);

  it('as etiquetas com cor (como o servidor): a nova nasce com a cor escolhida, a que existe fica com a dela, e Ajustes › Etiquetas', async () => {
    await entrar('operador');
    const op = await api.opcoes();
    // os exemplos: algumas pintadas pela equipe (o urgente, vermelho); as outras, cinza
    const SUP = 'painel-suporte';
    expect(op.etiquetas.find((e) => e.nome === 'urgente' && e.painelId === SUP)).toEqual({ painelId: SUP, nome: 'urgente', cor: 'bad' });
    expect(op.etiquetas.find((e) => e.nome === 'omniboard' && e.painelId === SUP)?.cor).toBe('neutral');
    const r = await api.criar({ ...(await baseDoSuporte(op, 'Etiquetas com cor (teste)')), etiquetas: ['Cliente VIP', 'URGENTE'], coresDasEtiquetas: { 'cliente vip': 'rosa', urgente: 'ok' } });
    // o chamado segue o nome do catálogo; a que já existia fica com a cor dela
    expect((await api.chamado(r.codigo)).etiquetas).toEqual(['Cliente VIP', 'urgente']);
    const cor = async (nome: string, painel = SUP) => (await api.opcoes()).etiquetas.find((e) => e.nome === nome && e.painelId === painel)?.cor;
    expect(await cor('Cliente VIP')).toBe('rosa');
    expect(await cor('urgente')).toBe('bad');
    // Ajustes › Etiquetas é de quem cuida dos chamados
    expect((await erroDe(api.etiquetas())).status).toBe(403);
    await entrar('admin');
    const vip = (await api.etiquetas()).find((e) => e.nome === 'Cliente VIP')!;
    expect(vip).toMatchObject({ cor: 'rosa', chamados: 1 });
    expect((await api.editarEtiqueta(vip.id, { cor: 'signal' })).cor).toBe('signal');
    expect(await cor('Cliente VIP')).toBe('signal');
    expect((await erroDe(api.criarEtiqueta({ painelId: SUP, nome: 'cliente  vip' }))).message).toBe('A etiqueta Cliente VIP já existe no Suporte.');
    const nova = await api.criarEtiqueta({ painelId: SUP, nome: 'Aguardando peça', cor: 'turquesa' });
    expect(nova).toMatchObject({ painelId: SUP, nome: 'Aguardando peça', cor: 'turquesa', chamados: 0 });
    // é só do Suporte (2.0.3: cada painel tem as suas)
    expect(await cor('Aguardando peça', 'painel-desenvolvimento')).toBeUndefined();
    expect((await erroDe(api.removerEtiqueta(vip.id))).message).toBe('A etiqueta Cliente VIP está em 1 chamado: tire dos chamados antes.');
    expect(await api.removerEtiqueta(nova.id)).toEqual({ ok: true });
    expect(await cor('Aguardando peça')).toBeUndefined();

    // editar (o pedido do Luan: o nome e a cor, como no Helena): pelo nome de agora, como o seletor faz; vale no chamado
    const editada = await api.editarEtiquetaPeloNome({ painelId: SUP, de: 'CLIENTE vip', nome: 'Cliente especial', cor: 'rosa' });
    expect(editada).toMatchObject({ nome: 'Cliente especial', cor: 'rosa', chamados: 1 });
    expect((await api.chamado(r.codigo)).etiquetas).toEqual(['Cliente especial', 'urgente']);
    expect(await cor('Cliente VIP')).toBeUndefined();
    expect((await erroDe(api.editarEtiqueta(editada.id, { nome: 'URGENTE', cor: 'ok' }))).message).toBe('A etiqueta urgente já existe neste painel: escolha outro nome.');
    // a mesma do Desenvolvimento não mudou
    expect(await cor('urgente', 'painel-desenvolvimento')).toBe('bad');
    // o operador não edita
    await entrar('operador');
    expect((await erroDe(api.editarEtiquetaPeloNome({ painelId: SUP, de: 'urgente', nome: 'Urgentíssimo', cor: 'bad' }))).status).toBe(403);
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

  it('o mapa do robô (como o servidor): "Como fica" com o pedido fictício, a variável aberta recusada, salvar com a auditoria', async () => {
    await entrar('admin');
    const tela = await api.robo();
    expect(tela).toEqual({ mapa: { ...MAPA_DO_ROBO_PADRAO }, ultimo: null });
    const mapa = { ...tela.mapa, cliente: '{{questions.cb-exemplo-qst-empresa.answer}}', assunto: '{{menus.cb-exemplo-mn-setor.answer}}', prioridade: 'Alta' };
    const p = await api.experimentarRobo(mapa, EXEMPLO_DO_LINECHAT);
    expect(p.aberto).toBeNull();
    if (!p.resolvido.ok) throw new Error(p.resolvido.erro);
    expect(p.resolvido.chamado).toMatchObject({
      painel: { sigla: 'SUP' }, titulo: 'Atendimento de Maria Souza', telefone: '5571999992010', cliente: { nome: 'Clínica Aurora' }, prioridade: 'alta', etiquetas: ['robô'],
    });
    expect(p.resolvido.chamado.ignorados).toEqual(['Não achei o assunto "Suporte Técnico" no painel Suporte: ficou de fora.']);
    expect((await erroDe(api.salvarMapaDoRobo({ ...mapa, titulo: '{{contact.name' }))).status).toBe(400);
    expect(await api.salvarMapaDoRobo({ ...mapa, campos: { 'campo-vazio': ' ' } })).toEqual({ ...mapa, campos: {} });
    expect((await api.robo()).mapa.cliente).toBe('{{questions.cb-exemplo-qst-empresa.answer}}');
    expect((await demoApi.admin.audit({ entityType: 'settings', pageSize: 1 } as never)).items[0]).toMatchObject({ action: 'settings_atendimento_robo', summary: 'Mudou o mapa do robô do LineChat: Cliente, Assunto, Prioridade' });
    await api.salvarMapaDoRobo(MAPA_DO_ROBO_PADRAO);
    await entrar('operador');
    expect((await erroDe(api.robo())).status).toBe(403);
    expect((await erroDe(api.experimentarRobo(mapa, EXEMPLO_DO_LINECHAT))).status).toBe(403);
  }, DEMORA);

  it('os parâmetros do mapa (como o servidor): pelo nome nos campos, os do endereço sem a chave, e a auditoria diz "Parâmetros"', async () => {
    await entrar('admin');
    const tela = await api.robo();
    const mapa = {
      ...tela.mapa,
      parametros: [...tela.mapa.parametros, { nome: 'empresa', origem: 'pergunta: a empresa que você faz parte', exemplo: 'Clínica Aurora', descricao: '' }, { nome: 'setor', origem: 'endereço: setor', exemplo: 'suporte', descricao: '' }],
      cliente: '{{empresa}}', etiquetas: 'robô, {{setor}}',
    };
    // a chave no endereço do exemplo não chega ao mapa (nem como parâmetro)
    const p = await api.experimentarRobo(mapa, EXEMPLO_DO_LINECHAT, { setor: 'suporte', chave: 'chave-falsa-do-teste' });
    if (!p.resolvido.ok) throw new Error(p.resolvido.erro);
    expect(p.resolvido.chamado).toMatchObject({ cliente: { nome: 'Clínica Aurora' }, etiquetas: ['robô', 'suporte'] });
    const semSetor = await api.experimentarRobo(mapa, EXEMPLO_DO_LINECHAT);
    if (!semSetor.resolvido.ok) throw new Error(semSetor.resolvido.erro);
    expect(semSetor.resolvido.chamado.etiquetas).toEqual(['robô']);
    // a origem "endereço: chave" nunca viria: é recusada
    expect((await erroDe(api.salvarMapaDoRobo({ ...mapa, parametros: [{ nome: 'k', origem: 'endereço: chave' }] }))).status).toBe(400);
    expect((await api.salvarMapaDoRobo(mapa)).parametros.map((x) => x.nome)).toEqual(['nome', 'whatsapp', 'conversa', 'mensagem', 'empresa', 'setor']);
    expect((await demoApi.admin.audit({ entityType: 'settings', pageSize: 1 } as never)).items[0]).toMatchObject({ summary: 'Mudou o mapa do robô do LineChat: Parâmetros, Etiquetas, Cliente' });
    await api.salvarMapaDoRobo(MAPA_DO_ROBO_PADRAO);
  }, DEMORA);
});

describe('o painel de Vendas na prévia (como o servidor)', () => {
  it('o Comercial: as negociações de exemplo, o quadro que soma e o relatório do período', async () => {
    await entrar('camila');
    const op = await api.opcoes();
    const com = painel(op, 'COM');
    expect(com.tipo).toBe('vendas');
    expect(com.etapas.filter((e) => e.resultado).map((e) => e.resultado)).toEqual(['ganho', 'perdido']);
    expect((await todosOsChamados()).filter((c) => c.painelId === com.id)).toHaveLength(32);
    // o histórico: a negociação é criada
    const estrela = await chamadoPeloTitulo('PABX em nuvem — 40 ramais');
    expect(estrela.historico.find((e) => e.tipo === 'criado')?.texto).toMatch(/^criou a negociação/);
    // o quadro soma o valor de cada coluna (o das abertas em cada etapa)
    const q = await api.quadro({ painel: com.id });
    for (const col of q.colunas.filter((c) => !c.etapa.resultado)) expect(col.valor).toBe(col.chamados.reduce((t, c) => t + (c.valor ?? 0), 0));
    // os últimos 28 dias: 12 entraram; 4 ganhas e 2 perdidas acabaram
    const hoje = diaLocal(new Date());
    const r = await api.relatorioDeVendas({ painel: 'COM', de: somarDias(hoje, -28), ate: hoje });
    expect(r.numeros).toMatchObject({
      novos: { qtd: 12, valor: 1_008_000 }, ganhos: { qtd: 4, valor: 298_000 }, perdidos: { qtd: 2, valor: 99_000 },
      conversao: 66.7, ticketMedio: 74_500,
    });
    expect(r.funil.map((f) => [f.nome, f.chegaram.length, f.perdidas.length])).toEqual([
      ['Lead', 12, 0], ['Qualificação', 10, 0], ['Proposta enviada', 8, 1], ['Negociação', 6, 1],
      // a etapa que abre a implantação (2.3): as que já estão sendo implantadas
      ['Em processo de Implantação', 4, 0],
    ]);
    expect(r.funilGanhas).toHaveLength(3);
    // a janela dos números: as negociações por trás, com a empresa e quem cuida
    const perdidas = r.numeros.perdidos.ids.map((id) => r.negociacoes.find((n) => n.id === id)!);
    expect(perdidas.map((n) => [n.titulo, n.empresa, n.motivoPerda]).sort()).toEqual([
      ['LineReports para a supervisão', 'Distribuidora Norte', 'Adiou a decisão'], ['URA para o SAC', 'Transportadora Rota Sul', 'Preço'],
    ]);
    // o mês: comparado com o mesmo pedaço do mês passado (que tem as três negociações do começo dele)
    const doMes = await api.relatorioDeVendas({ painel: 'COM', de: `${hoje.slice(0, 7)}-01`, ate: hoje });
    expect(doMes.anterior.nome).toMatch(/^o mesmo período de /);
    // os ganhos mês a mês: os 12 meses, o último é o de hoje; cada mês com as ganhas dele (a janela acha todas)
    expect(doMes.meses).toHaveLength(12);
    expect(doMes.meses.at(-1)).toMatchObject({ mes: hoje.slice(0, 7), ganho: doMes.numeros.ganhos.valor });
    expect(doMes.meses.filter((m) => m.ganho > 0).length).toBeGreaterThanOrEqual(9);
    const ids = new Set(doMes.negociacoes.map((n) => n.id));
    expect(doMes.meses.flatMap((m) => m.ids).every((id) => ids.has(id))).toBe(true);
    // a ativação, à parte (19/10): a das ganhas do mês, e o mês a mês dela com os mesmos meses
    const comAtivacao = doMes.numeros.ganhos.ids.map((id) => doMes.negociacoes.find((n) => n.id === id)!).filter((n) => (n.ativacao ?? 0) > 0);
    expect(doMes.numeros.ativacoes).toMatchObject({ qtd: comAtivacao.length, valor: comAtivacao.reduce((t, n) => t + n.ativacao!, 0) });
    expect(doMes.numeros.ativacoes.qtd).toBeGreaterThan(0);
    expect(doMes.mesesDaAtivacao.map((m) => m.mes)).toEqual(doMes.meses.map((m) => m.mes));
    expect(doMes.mesesDaAtivacao.at(-1)).toMatchObject({ ganho: doMes.numeros.ativacoes.valor, qtd: doMes.numeros.ativacoes.qtd });
    expect(doMes.mesesDaAtivacao.filter((m) => m.ganho > 0).length).toBeGreaterThanOrEqual(9);
  }, DEMORA);

  it('a negociação: nasce no Lead sem prioridade; o Perdido pede o motivo; o Ganho fecha', async () => {
    await entrar('camila');
    const op = await api.opcoes();
    const com = painel(op, 'COM');
    const nova = await api.criar({ painelId: com.id, titulo: 'Venda de teste', empresa: 'Empresa de Teste', valor: 100_000, prioridade: 'alta' });
    const f = await api.chamado(nova.codigo);
    expect(f).toMatchObject({ etapaId: etapa(op, 'COM', 'Lead').id, valor: 100_000, empresa: 'Empresa de Teste', prioridade: null, resultado: null });
    expect(f.historico.find((e) => e.tipo === 'criado')?.texto).toBe('criou a negociação em Lead');
    const semMotivo = await erroDe(api.mover(nova.id, { etapaId: etapa(op, 'COM', 'Perdido').id }));
    expect(semMotivo.status).toBe(400);
    expect(semMotivo.message).toBe(mensagemDoQueFalta(['motivoPerda'], 'Perdido'));
    const ganha = await api.mover(nova.id, { etapaId: etapa(op, 'COM', 'Ganho').id });
    expect(ganha).toMatchObject({ resultado: 'ganho', situacao: 'fechado' });
    expect(ganha.historico.map((e) => e.texto)).toContain(`marcou como ganho (${reais(100_000)}/mês), estava em Lead`);
  }, DEMORA);

  it('a mensalidade e a ativação por produto: os totais; o produto que sai leva os valores dele (como no servidor)', async () => {
    await entrar('camila');
    const estrela = await api.chamado((await chamadoPeloTitulo('PABX em nuvem — 40 ramais')).codigo);
    const pbx = estrela.produtos.find((p) => p.nome === 'LinePBX')!;
    const tronco = estrela.produtos.find((p) => p.nome === 'VoiceNet')!;
    expect(estrela).toMatchObject({
      valor: 125_000, valoresDosProdutos: { [pbx.id]: 98_000, [tronco.id]: 27_000 },
      ativacao: 190_000, ativacoesDosProdutos: { [pbx.id]: 150_000, [tronco.id]: 40_000 },
    });
    // os campos do Comercial do Helena (menos a Área de atuação), com a origem da Padaria Estrela
    const op = await api.opcoes();
    const campos = op.campos.filter((c) => c.painelId === painel(op, 'COM').id);
    expect(campos.map((c) => c.nome)).toEqual(['CNPJ', 'Contatos principais', 'Origem de lead', 'Indicação']);
    const origem = campos.find((c) => c.nome === 'Origem de lead')!;
    expect(estrela.campos[origem.id]).toBe(origem.opcoes.find((o) => o.nome === 'Instagram')!.id);
    const mudou = await api.alterar(estrela.id, { valoresDosProdutos: { [pbx.id]: 90_000, [tronco.id]: 27_000 }, ativacoesDosProdutos: { [pbx.id]: 120_000, [tronco.id]: 40_000 } });
    expect(mudou).toMatchObject({ valor: 117_000, ativacao: 160_000 });
    const historico = mudou.historico.map((e) => e.texto).join('\n');
    expect(historico).toContain(`LinePBX ${reais(90_000)} · VoiceNet ${reais(27_000)}`);
    expect(historico).toContain(`LinePBX ${reais(120_000)} · VoiceNet ${reais(40_000)}`);
    expect((await erroDe(api.alterar(estrela.id, { valor: 100_000 }))).message).toBe(VALOR_E_A_SOMA);
    expect((await erroDe(api.alterar(estrela.id, { ativacao: 100_000 }))).message).toBe(ATIVACAO_E_A_SOMA);
    const saiu = await api.alterar(estrela.id, { produtos: [pbx.id] });
    expect(saiu).toMatchObject({ valor: 90_000, valoresDosProdutos: { [pbx.id]: 90_000 }, ativacao: 120_000, ativacoesDosProdutos: { [pbx.id]: 120_000 } });
    const unico = await api.alterar(estrela.id, { valoresDosProdutos: {}, valor: 90_000, ativacoesDosProdutos: {}, ativacao: 120_000 });
    expect(unico).toMatchObject({ valor: 90_000, valoresDosProdutos: {}, ativacao: 120_000, ativacoesDosProdutos: {} });
    // a proposta anexada (o PDF que abre no leitor do Gestor): os bytes do arquivo, sem baixar
    const proposta = estrela.anotacoesLista.flatMap((n) => n.anexos).find((a) => a.nome.endsWith('.pdf'))!;
    expect(proposta).toMatchObject({ tipo: 'application/pdf', imagem: false });
    const bytes = new Uint8Array(await api.anexoBytes(proposta.id));
    expect(String.fromCharCode(...bytes.slice(0, 5))).toBe('%PDF-');
    expect(bytes.length).toBe(proposta.tamanho);
  }, DEMORA);

  it('a troca de painel fica entre os de Vendas; a negociação não tem pai, filhos nem ligações', async () => {
    await entrar('admin');
    const op = await api.opcoes();
    const estrela = await chamadoPeloTitulo('PABX em nuvem — 40 ramais');
    const paraOSuporte = await erroDe(api.trocarPainel(estrela.id, { painelId: painel(op, 'SUP').id }));
    expect(paraOSuporte.status).toBe(400);
    expect(paraOSuporte.message).toContain('é uma negociação: só passa para outro painel de Vendas');
    const chamado = await api.criar(await baseDoSuporte(op, 'Quer orçamento de mais ramais (teste)'));
    const paraOComercial = await erroDe(api.trocarPainel(chamado.id, { painelId: painel(op, 'COM').id }));
    expect(paraOComercial.status).toBe(400);
    expect(paraOComercial.message).toContain('um chamado não vira negociação trocando de painel');
    // a negociação não tem pai nem filhos, nem problema, e não se liga a nada (como no servidor)
    expect((await erroDe(api.criar({ painelId: painel(op, 'COM').id, titulo: 'Mais 10 ramais', paiId: chamado.codigo }))).message).toBe(NEGOCIACAO_SEM_PAI);
    expect((await erroDe(api.definirPai(estrela.id, chamado.codigo))).message).toBe(NEGOCIACAO_SEM_PAI);
    expect((await erroDe(api.definirPai(chamado.id, estrela.codigo))).message).toBe(negociacaoNaoEPai(estrela.codigo));
    expect((await erroDe(api.criar({ painelId: painel(op, 'COM').id, titulo: 'Queda geral', tipoChamado: 'problema' }))).message).toBe(NEGOCIACAO_SEM_PROBLEMA);
    expect((await erroDe(api.ligar(estrela.id, { para: chamado.codigo, tipo: 'relacionado' }))).message).toBe(NEGOCIACAO_SEM_LIGACAO);
    expect((await erroDe(api.ligar(chamado.id, { para: estrela.codigo, tipo: 'relacionado' }))).message).toBe(negociacaoNaoSeLiga(estrela.codigo));
    const semLigacoes = await api.chamado(estrela.codigo);
    expect(semLigacoes.ligacoes).toEqual([]);
    expect(semLigacoes.grafo.arestas).toEqual([]);
    // entre dois de Vendas: entra no funil, nunca direto no Ganho
    const rev = await api.salvarPainel(null, { nome: 'Revenda', sigla: 'REV', cor: 'roxo', tipo: 'vendas', acesso: 'todos', ajustes: {} });
    const ganhoRev = rev.etapas.find((e) => e.resultado === 'ganho')!;
    expect((await erroDe(api.trocarPainel(estrela.id, { painelId: rev.id, etapaId: ganhoRev.id }))).message).toBe(TROCA_ENTRA_NO_FUNIL);
    // o relatório de vendas é só dos painéis de Vendas
    const hoje = diaLocal(new Date());
    const doSuporte = await erroDe(api.relatorioDeVendas({ painel: 'SUP', de: hoje, ate: hoje }));
    expect(doSuporte.status).toBe(400);
    expect(doSuporte.message).toContain('não é de vendas');
  }, DEMORA);

  it('a ordem à mão no quadro (2.1, como o servidor): arrastar muda o lugar, a que chega fica no alto; no Suporte e no Ganho, não', async () => {
    await entrar('admin');
    const ord = await api.salvarPainel(null, { nome: 'Ordem', sigla: 'ORD', cor: 'ok', tipo: 'vendas', acesso: 'todos', ajustes: {} });
    const lead = ord.etapas.find((e) => e.nome === 'Lead')!;
    const qualificacao = ord.etapas.find((e) => e.nome === 'Qualificação')!;
    const ganho = ord.etapas.find((e) => e.resultado === 'ganho')!;
    const n: Record<string, { id: string; codigo: string }> = {};
    for (const [k, valor] of [['A', 100_000], ['B', 300_000], ['C', null], ['D', 200_000]] as const) {
      n[k] = await api.criar({ painelId: ord.id, titulo: `Negociação ${k}`, empresa: `Empresa ${k}`, ...(valor != null ? { valor } : {}) });
    }
    const coluna = async (etapaId: string) => (await api.quadro({ painel: ord.id })).colunas.find((c) => c.etapa.id === etapaId)!
      .chamados.map((c) => Object.keys(n).find((k) => n[k]!.id === c.id));
    // sem ninguém arrumar, a de maior valor primeiro; arrastar para o alto e para logo abaixo de outra
    expect(await coluna(lead.id)).toEqual(['B', 'D', 'A', 'C']);
    expect(await api.posicionar(n.A!.id, { depoisDe: null })).toEqual({ codigo: n.A!.codigo, posicao: 1 });
    expect(await coluna(lead.id)).toEqual(['A', 'B', 'D', 'C']);
    expect((await api.posicionar(n.C!.id, { depoisDe: n.B!.id })).posicao).toBe(3);
    expect(await coluna(lead.id)).toEqual(['A', 'B', 'C', 'D']);
    // a que chega fica no alto; mudar de etapa apaga o lugar; o arrasto para outra coluna cai no lugar
    n.E = await api.criar({ painelId: ord.id, titulo: 'Negociação E', empresa: 'Empresa E', valor: 500_000 });
    expect(await coluna(lead.id)).toEqual(['E', 'A', 'B', 'C', 'D']);
    expect((await api.mover(n.B!.id, { etapaId: qualificacao.id })).ordemNoQuadro).toBeNull();
    expect((await api.mover(n.D!.id, { etapaId: qualificacao.id, depoisDe: n.B!.id })).ordemNoQuadro).toBe(2);
    expect(await coluna(qualificacao.id)).toEqual(['B', 'D']);
    expect(await coluna(lead.id)).toEqual(['E', 'A', 'C']);
    // os erros, como no servidor
    expect((await erroDe(api.posicionar(n.A!.id, { depoisDe: n.B!.id }))).status).toBe(409);
    expect((await erroDe(api.posicionar(n.A!.id, { depoisDe: n.A!.id }))).status).toBe(400);
    await api.mover(n.E!.id, { etapaId: ganho.id });
    expect((await erroDe(api.posicionar(n.E!.id, { depoisDe: null }))).message).toMatch(/Em Ganho, a ordem é a do mais recente/);
    const op = await api.opcoes();
    const chamado = await api.criar(await baseDoSuporte(op, 'A ordem no Suporte (teste)'));
    expect((await erroDe(api.posicionar(chamado.id, { depoisDe: null }))).message).toMatch(/que conta prazo, o quadro põe o mais urgente primeiro/);
    // o Leitor não mexe
    await entrar('leitor');
    expect((await erroDe(api.posicionar(n.A!.id, { depoisDe: null }))).status).toBe(403);
  }, DEMORA);

  it('a ordem à mão no painel de Gestão que não conta prazo (2.1.3, como o servidor): a prioridade, o mais antigo, e a equipe arruma', async () => {
    await entrar('admin');
    const ges = await api.salvarPainel(null, { nome: 'Pessoal', sigla: 'PES', cor: 'turquesa', tipo: 'gestao', acesso: 'todos', ajustes: { contaPrazo: false } });
    const novo = ges.etapas.find((e) => e.tipo === 'entrada')!;
    const resolvido = ges.etapas.find((e) => e.tipo === 'resolvido')!;
    const n: Record<string, { id: string; codigo: string }> = {};
    for (const [k, prioridade] of [['P', null], ['Q', 'alta'], ['R', null], ['S', 'critica']] as const) {
      n[k] = await api.criar({ painelId: ges.id, titulo: `Atividade ${k}`, responsavelId: await eu(), ...(prioridade ? { prioridade } : {}) });
    }
    const coluna = async (etapaId: string) => (await api.quadro({ painel: ges.id })).colunas.find((c) => c.etapa.id === etapaId)!
      .chamados.map((c) => Object.keys(n).find((k) => n[k]!.id === c.id));
    expect(await coluna(novo.id)).toEqual(['S', 'Q', 'P', 'R']);
    expect((await api.posicionar(n.R!.id, { depoisDe: null })).posicao).toBe(1);
    expect((await api.posicionar(n.S!.id, { depoisDe: n.P!.id })).posicao).toBe(4);
    expect(await coluna(novo.id)).toEqual(['R', 'Q', 'P', 'S']);
    // o que chega fica no alto; no Resolvido, não arruma
    n.T = await api.criar({ painelId: ges.id, titulo: 'Atividade T', prioridade: 'baixa', responsavelId: await eu() });
    expect(await coluna(novo.id)).toEqual(['T', 'R', 'Q', 'P', 'S']);
    await api.mover(n.P!.id, { etapaId: resolvido.id });
    expect((await erroDe(api.posicionar(n.P!.id, { depoisDe: null }))).message).toMatch(/Em Resolvido, a ordem é a do mais recente/);
  }, DEMORA);
});

describe('o Comercial tem permissão própria na prévia (como no servidor)', () => {
  it('sem ela, o painel de Vendas não existe; com ela, sim; e só com ela, o Comercial funciona sem os chamados', async () => {
    // a Marina (Operador) não vê o Comercial: nem na lista de painéis, nem pelo endereço
    await entrar('operador');
    const daMarina = await api.opcoes();
    expect(daMarina.paineis.some((p) => p.tipo === 'vendas')).toBe(false);
    expect((await erroDe(api.quadro({ painel: 'painel-comercial' }))).status).toBe(404);
    // a Camila (papel Comercial) vê o Comercial e o Suporte
    await entrar('camila');
    const daCamila = await api.opcoes();
    expect(daCamila.paineis.map((p) => p.sigla)).toEqual(expect.arrayContaining(['COM', 'SUP']));
    // um papel só com o Comercial (sem ver os chamados): as portas do módulo abrem, e o Suporte some
    await entrar('admin');
    const papel = await demoApi.admin.createRole({ name: 'Só o Comercial', description: 'vendas, sem os chamados', permissions: ['records.read', 'sales.read', 'tickets.work'] });
    await demoApi.admin.createUser({ name: 'Vera Lima', email: 'vera@gestor.local', password: SENHA_DA_PREVIA, roleId: papel.id, active: true });
    await demoApi.auth.logout();
    await demoApi.auth.login('vera@gestor.local', SENHA_DA_PREVIA);
    const daVera = await api.opcoes();
    expect(daVera.paineis.some((p) => p.sigla === 'SUP')).toBe(false);
    expect((await erroDe(api.quadro({ painel: 'painel-suporte' }))).status).toBe(404);
    expect(Array.isArray((await api.meuDia()).meus)).toBe(true);
  }, DEMORA);
});

describe('a implantação na prévia (2.3, como o servidor)', () => {
  const ETAPA_DA_IMPLANTACAO = 'Em processo de Implantação';
  const produto = (op: OpcoesAtendimento, nome: string) => op.produtos.find((p) => p.nome === nome)!.id;
  const campoDe = (op: OpcoesAtendimento, painelId: string, nome: string, produtoId: string) => op.campos.find((c) => c.painelId === painelId && c.nome === nome && c.produtoId === produtoId)!;
  const opcao = (c: { opcoes: Array<{ id: string; nome: string }> }, nome: string) => c.opcoes.find((o) => o.nome === nome)!.id;

  it('os exemplos: o Comercial abriu os cards, o cliente novo entrou no cadastro e o Validado ligou os produtos e os módulos', async () => {
    await entrar('admin');
    const op = await api.opcoes();
    const imp = painel(op, 'IMP');
    expect(imp.etapas.map((e) => e.nome)).toEqual(['Stand By', 'Curadoria', 'Configuração', 'Testes', 'Validado']);
    expect(imp.etapas.filter((e) => e.ligaNoCadastro).map((e) => e.nome)).toEqual(['Validado']);
    expect(etapa(op, 'COM', ETAPA_DA_IMPLANTACAO).abreImplantacao).toBe(imp.id);
    // os 18 campos do modelo, em três partes, de dois produtos
    const campos = op.campos.filter((c) => c.painelId === imp.id);
    expect(campos).toHaveLength(18);
    expect([...new Set(campos.map((c) => c.parte))]).toEqual(['Curadoria', 'Configuração', 'Testes']);

    const q = await api.quadro({ painel: imp.id });
    const naEtapa = Object.fromEntries(q.colunas.map((c) => [c.etapa.nome, c.chamados.map((x) => x.cliente?.nome)]));
    expect(naEtapa).toMatchObject({ Curadoria: ['Hotel Beira Mar'], Configuração: ['Academia Movimento'], Testes: ['Construtora Horizonte'], Validado: ['Ótica Visão Clara'] });
    // o cartão mostra a conta da parte da etapa (a Configuração do LineChat: 3 de 5)
    const movimento = q.colunas.find((c) => c.etapa.nome === 'Configuração')!.chamados[0]!;
    expect(movimento.partes.find((p) => p.parte === 'Configuração')).toMatchObject({ feitos: 3, total: 5 });

    const vc = await api.chamado(q.colunas.find((c) => c.etapa.nome === 'Validado')!.chamados[0]!.codigo);
    expect(vc.origem).toBe('comercial');
    expect(vc.daNegociacao?.codigo).toMatch(/^COM-/);
    expect(vc.historico.some((ev) => ev.tipo === 'cadastro' && /Line Reports/.test(ev.texto))).toBe(true);
    const negociacao = await api.chamado(vc.daNegociacao!.codigo);
    expect(negociacao.implantacoes).toMatchObject([{ codigo: vc.codigo, etapa: 'Validado', situacao: 'fechado', podeAbrir: true }]);
    // o cliente novo (o CNPJ da negociação), com o LinePBX e o VoiceNet ativos desde o Validado, e os módulos marcados
    const cliente = await demoApi.clients.get(vc.cliente!.id);
    expect(cliente.cnpj).toBe('45812033000174');
    const pbx = cliente.subscriptions.find((s) => s.productCode === 'linepbx')!;
    expect(pbx.activatedAt).toBeTruthy();
    expect(pbx.modules.filter((m) => m.active).map((m) => m.moduleName).sort()).toEqual(['Line Reports', 'NPS']);
    expect(cliente.subscriptions.find((s) => s.productCode === 'voicenet')!.activatedAt).toBe(pbx.activatedAt);
    // o da curadoria: em implantação, sem a data
    const beira = q.colunas.find((c) => c.etapa.nome === 'Curadoria')!.chamados[0]!;
    const hotel = await demoApi.clients.get(beira.cliente!.id);
    expect(hotel.subscriptions.map((s) => [s.productCode, s.activatedAt]).sort()).toEqual([['linechat', null], ['linepbx', null]]);
  });

  it('mover a negociação: sem o CNPJ não vai (400 com o plano); com ele, cria o cliente e abre o card — uma vez só', async () => {
    const luan = await entrar('admin');
    const op = await api.opcoes();
    const com = painel(op, 'COM');
    const chat = produto(op, 'LineChat');
    const r = await api.criar({ painelId: com.id, titulo: 'LineChat — teste da implantação', empresa: 'Padaria Pão Quente', produtos: [chat], responsavelId: luan.id });
    const para = etapa(op, 'COM', ETAPA_DA_IMPLANTACAO);
    const e = await erroDe(api.mover(r.id, { etapaId: para.id }));
    expect(e.status).toBe(400);
    expect(e.message).toBe('Para criar o cliente, falta o CNPJ.');
    expect((e.details as unknown as { implantacao: { cliente: { tipo: string } } }).implantacao.cliente.tipo).toBe('novo');
    // a janela: o CNPJ com o dígito errado; e o de um cliente que já existe (o card abre para ele)
    expect((await api.aoMover(r.id, { etapaId: para.id, cnpj: '11.111.111/1111-11' })).implantacao!.falta).toMatch(/dígito/);
    const aurora = (await api.aoMover(r.id, { etapaId: para.id, cnpj: '11.222.333/0001-81' })).implantacao!;
    expect(aurora.cliente).toMatchObject({ tipo: 'cadastro', nome: 'Clínica Aurora', peloCnpj: true });
    expect(aurora.falta).toBeNull();

    const f = await api.mover(r.id, { etapaId: para.id, implantacao: { nomeFantasia: 'Padaria Pão Quente', razaoSocial: 'Pão Quente Panificadora LTDA', cnpj: '58.901.234/0001-90' } });
    expect(f.cliente?.nome).toBe('Padaria Pão Quente');
    expect(f.implantacoes).toHaveLength(1);
    const card = await api.chamado(f.implantacoes[0]!.codigo);
    expect(card).toMatchObject({ titulo: 'Implantação — Padaria Pão Quente', origem: 'comercial', etapaId: painel(op, 'IMP').etapas.find((x) => x.nome === 'Curadoria')!.id });
    expect(card.produtos.map((p) => p.id)).toEqual([chat]);
    expect(card.observadores.map((o) => o.id)).toContain(luan.id);
    const cliente = await demoApi.clients.get(card.cliente!.id);
    expect(cliente.legalName).toBe('Pão Quente Panificadora LTDA');
    expect(cliente.subscriptions.map((s) => [s.productCode, s.activatedAt])).toEqual([['linechat', null]]);
    // voltar e ir de novo não abre outro card
    await api.mover(r.id, { etapaId: etapa(op, 'COM', 'Lead').id });
    expect((await api.aoMover(r.id, { etapaId: para.id })).implantacao!.jaAberta).toEqual({ codigo: card.codigo });
    const deNovo = await api.mover(r.id, { etapaId: para.id });
    expect(deNovo.implantacoes).toHaveLength(1);
  });

  it('o card: as caixinhas guardam quem marcou e quando; o Validado liga os produtos e os módulos marcados', async () => {
    const luan = await entrar('admin');
    const op = await api.opcoes();
    const imp = painel(op, 'IMP');
    const chat = produto(op, 'LineChat');
    const lista = (await api.lista({ painel: imp.id, situacao: 'todos', pageSize: 100 })).items;
    const card = await api.chamado(lista.find((c) => c.cliente?.nome === 'Padaria Pão Quente')!.codigo);
    const config = campoDe(op, imp.id, 'Configuração do ambiente', chat);
    const modulos = campoDe(op, imp.id, 'Módulos a ativar', chat);
    expect(modulos.opcoes.map((o) => o.nome)).toEqual(expect.arrayContaining(['Dashboard de filas', 'NPS', 'WebChat']));
    const marcado = await api.alterar(card.id, { campos: { [config.id]: [opcao(config, 'Criação dos usuários'), opcao(config, 'Criação das equipes')], [modulos.id]: [opcao(modulos, 'WebChat')] } });
    expect(marcado.marcas[config.id]![opcao(config, 'Criação dos usuários')]).toMatchObject({ porId: luan.id, porNome: null });
    expect(marcado.historico.some((ev) => ev.tipo === 'campo' && /Configuração do ambiente \(LineChat\)/.test(ev.texto))).toBe(true);
    // desmarcar uma: a marca dela sai, a outra fica
    const menos = await api.alterar(card.id, { campos: { [config.id]: [opcao(config, 'Criação das equipes')] } });
    expect(Object.keys(menos.marcas[config.id]!)).toEqual([opcao(config, 'Criação das equipes')]);

    // a janela do Validado: o LineChat ganha a data, o WebChat liga
    const validado = imp.etapas.find((e) => e.nome === 'Validado')!;
    const plano = (await api.aoMover(card.id, { etapaId: validado.id })).cadastro!;
    expect(plano.produtos).toEqual([{ id: chat, nome: 'LineChat', acao: 'ativa' }]);
    expect(plano.modulos.map((m) => [m.nome, m.acao])).toEqual([['WebChat', 'liga']]);
    // sair da Curadoria pede quem fica com o card; nada mais trava
    const fim = await api.mover(card.id, { etapaId: validado.id, responsavelId: luan.id });
    expect(fim.situacao).toBe('fechado');
    expect(fim.historico.some((ev) => ev.tipo === 'cadastro' && /WebChat/.test(ev.texto))).toBe(true);
    const cliente = await demoApi.clients.get(card.cliente!.id);
    const sub = cliente.subscriptions.find((s) => s.productCode === 'linechat')!;
    expect(sub.activatedAt?.slice(0, 10)).toBe(diaLocal(new Date()));
    expect(sub.modules.filter((m) => m.active).map((m) => m.moduleName)).toEqual(['WebChat']);
  });

  it('o painel pelo modelo e as regras dos campos (o produto dos módulos, o mesmo nome em produtos diferentes)', async () => {
    await entrar('admin');
    const novo = await api.salvarPainel(null, { nome: 'Implantação Filiais', sigla: 'IMF', cor: 'roxo', acesso: 'todos', tipo: 'gestao', modelo: 'implantacao', ajustes: {} });
    expect(novo.etapas.map((e) => [e.nome, !!e.ligaNoCadastro])).toEqual([['Stand By', false], ['Curadoria', false], ['Configuração', false], ['Testes', false], ['Validado', true]]);
    expect(novo.ajustes.contaPrazo).toBe(false);
    const op = await api.opcoes();
    expect(op.campos.filter((c) => c.painelId === novo.id)).toHaveLength(18);
    const pbx = produto(op, 'LinePBX');
    const chat = produto(op, 'LineChat');
    // os módulos precisam do produto
    expect((await erroDe(api.salvarCampo(novo.id, null, { nome: 'Módulos extras', tipo: 'modulos' }))).status).toBe(400);
    // o mesmo nome, em outro produto, pode; no mesmo produto, não
    const outro = await api.salvarCampo(novo.id, null, { nome: 'Observações', tipo: 'texto', produtoId: chat, parte: 'Curadoria' });
    await api.salvarCampo(novo.id, null, { nome: 'Observações', tipo: 'texto', produtoId: pbx, parte: 'Curadoria' });
    expect((await erroDe(api.salvarCampo(novo.id, null, { nome: 'Observações', tipo: 'texto', produtoId: chat }))).status).toBe(409);
    expect(outro).toMatchObject({ parte: 'Curadoria', produtoId: chat });
    // o produto dos módulos não muda depois de criado
    const mods = (await api.opcoes()).campos.find((c) => c.painelId === novo.id && c.tipo === 'modulos' && c.produtoId === chat)!;
    expect((await erroDe(api.salvarCampo(novo.id, mods.id, { nome: mods.nome, tipo: 'modulos', produtoId: pbx }))).status).toBe(400);
    // a etapa de Vendas só abre a implantação num painel de Gestão
    const com = painel(op, 'COM');
    const etapas = com.etapas.map((e) => ({ id: e.id, nome: e.nome, tipo: e.tipo, nivel: e.nivel, obrigatorios: e.obrigatorios, avisar: e.avisar, resultado: e.resultado ?? null, abreImplantacao: e.abreImplantacao ?? null }));
    const errado = etapas.map((e) => (e.nome === 'Qualificação' ? { ...e, abreImplantacao: com.id } : e));
    expect((await erroDe(api.salvarEtapas(com.id, { etapas: errado, destino: {} }))).status).toBe(400);
  });

  it('o CNPJ de um cliente que está na lixeira: a negociação não cria outro (restaurar antes)', async () => {
    const luan = await entrar('admin');
    const op = await api.opcoes();
    const lixo = await demoApi.clients.create({ tradeName: 'Empresa da Lixeira', legalName: 'Lixeira LTDA', cnpj: '34.567.890/0001-30' });
    await demoApi.clients.remove(lixo.id);
    const r = await api.criar({ painelId: painel(op, 'COM').id, titulo: 'Volta da Lixeira', empresa: 'Empresa da Lixeira', produtos: [produto(op, 'LinePBX')], responsavelId: luan.id });
    const e = await erroDe(api.mover(r.id, { etapaId: etapa(op, 'COM', ETAPA_DA_IMPLANTACAO).id, implantacao: { nomeFantasia: 'Empresa da Lixeira', razaoSocial: 'Lixeira LTDA', cnpj: '34567890000130' } }));
    expect(e.message).toMatch(/está na lixeira/);
  });
});
