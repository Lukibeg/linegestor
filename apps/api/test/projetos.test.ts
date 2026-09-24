/**
 * Projetos: a tarefa que percorre vários clientes.
 *
 * O que estes testes seguram:
 *  - a situação de cada cliente **anda sozinha** conforme as etapas são marcadas
 *  - **travado** exige motivo e não é desfeito pelo sistema; **não se aplica** fecha sem contar como feito
 *  - mexer nas etapas não estraga o que já foi marcado (renomear preserva, tirar apaga só a dela)
 *  - o painel conta certo, inclusive por responsável e o "atrasado"
 *  - anexo de qualquer formato, com limite de tamanho, e quem pode apagar o quê
 *  - quem só lê, enxerga; quem trabalha, marca; quem gerencia, cria
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { makeApp, Session, type App } from './helpers.js';

let app: App;
let s: Session;        // administrador
let operador: Session; // trabalha no projeto, não gerencia
let leitor: Session;   // só olha
let clientes: Array<{ id: string; name: string }> = [];
let projetoId: string;
let etapas: Array<{ id: string; title: string }> = [];
let linhas: Record<string, string> = {}; // nome do cliente → id da linha

/** Um arquivo qualquer (não é imagem: o módulo aceita qualquer formato). */
const XLSX = 'data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,UEsDBBQABgAIAAAAIQ==';

const proj = () => s.get(`/projects/${projetoId}`).then((r) => r.json());

beforeAll(async () => {
  app = await makeApp();
  s = new Session(app);
  await s.login();

  const papeis = (await s.get('/admin/roles')).json();
  const idDe = (key: string) => papeis.find((r: any) => r.key === key).id;
  await s.post('/admin/users', { name: 'Marina Costa', email: 'marina@gestor.local', password: 'SenhaDeTeste!123', roleId: idDe('operador') });
  await s.post('/admin/users', { name: 'Rita Leitora', email: 'rita@gestor.local', password: 'SenhaDeTeste!123', roleId: idDe('leitor') });
  operador = new Session(app); await operador.login('marina@gestor.local', 'SenhaDeTeste!123');
  leitor = new Session(app); await leitor.login('rita@gestor.local', 'SenhaDeTeste!123');

  const paraCriar: Array<[string, string]> = [
    ['Hospital Vale Verde', '11.222.333/0001-81'],
    ['Clínica Aurora', '22.333.444/0001-81'],
    ['Distribuidora Norte', '55.666.777/0001-81'],
  ];
  for (const [nome, cnpj] of paraCriar) {
    const r = await s.post('/clients', { tradeName: nome, legalName: `${nome} LTDA`, cnpj });
    if (r.statusCode !== 201) throw new Error(`não criou ${nome}: ${r.body}`);
    clientes.push({ id: r.json().id, name: nome });
  }
});
afterAll(async () => { await app.close(); });

describe('criar o projeto', () => {
  it('nasce aberto, com as etapas na ordem e todo mundo pendente', async () => {
    const r = await s.post('/projects', {
      name: 'Áudio novo das URAs',
      goal: 'Trocar o áudio da URA por uma gravação de estúdio.',
      dueDate: '2026-12-31',
      etapas: [{ title: 'Gravar o áudio' }, { title: 'Subir no PBX' }, { title: 'Testar com o cliente' }],
      clientIds: clientes.map((c) => c.id),
    });
    expect(r.statusCode).toBe(201);
    const p = r.json();
    projetoId = p.id;
    etapas = p.etapas;
    linhas = Object.fromEntries(p.clientes.map((c: any) => [c.clientName, c.id]));

    expect(p.status).toBe('aberto');
    expect(p.etapas.map((e: any) => e.title)).toEqual(['Gravar o áudio', 'Subir no PBX', 'Testar com o cliente']);
    expect(p.clientes).toHaveLength(3);
    expect(p.clientes.every((c: any) => c.status === 'pendente')).toBe(true);
    expect(p.resumo.andamento).toBe(0);
    expect(p.resumo.etapasTotais).toBe(9);
  });

  it('o mesmo cliente não entra duas vezes', async () => {
    const r = await s.post(`/projects/${projetoId}/clientes`, { clientIds: [clientes[0]!.id, clientes[1]!.id] });
    expect(r.statusCode).toBe(200);
    expect(r.json().clientes).toHaveLength(3);
  });
});

describe('marcar as etapas', () => {
  it('a primeira marca põe em andamento; a última conclui; desmarcar volta atrás', async () => {
    const linha = linhas['Hospital Vale Verde']!;
    const marcar = (stepId: string, feito: boolean) => operador.post(`/projects/${projetoId}/clientes/${linha}/etapas/${stepId}`, { feito });

    expect((await marcar(etapas[0]!.id, true)).json().status).toBe('andamento');
    expect((await marcar(etapas[1]!.id, true)).json().status).toBe('andamento');
    const fim = await marcar(etapas[2]!.id, true);
    expect(fim.json().status).toBe('concluido');
    expect(fim.json().doneAt).not.toBeNull();

    // desmarcou uma: deixa de estar concluído
    const volta = await marcar(etapas[2]!.id, false);
    expect(volta.json().status).toBe('andamento');
    expect(volta.json().doneAt).toBeNull();
    await marcar(etapas[2]!.id, true);

    // marcar de novo o que já está marcado não duplica nem quebra
    expect((await marcar(etapas[0]!.id, true)).json().status).toBe('concluido');
    const p = await proj();
    expect(p.clientes.find((c: any) => c.id === linha).feitas).toHaveLength(3);
    // fica registrado quem marcou
    expect(p.clientes.find((c: any) => c.id === linha).feitas[0].quem).toBe('Marina Costa');
  });

  it('a etapa tem de ser deste projeto', async () => {
    const outro = (await s.post('/projects', { name: 'Outro projeto', etapas: [{ title: 'Etapa de fora' }] })).json();
    const r = await operador.post(`/projects/${projetoId}/clientes/${linhas['Clínica Aurora']}/etapas/${outro.etapas[0].id}`, { feito: true });
    expect(r.statusCode).toBe(400);
    await s.del(`/projects/${outro.id}`);
  });
});

describe('travado e "não se aplica"', () => {
  it('travar exige o motivo e o sistema não desfaz sozinho', async () => {
    const linha = linhas['Clínica Aurora']!;
    const sem = await operador.patch(`/projects/${projetoId}/clientes/${linha}`, { status: 'travado' });
    expect(sem.statusCode).toBe(400);

    const com = await operador.patch(`/projects/${projetoId}/clientes/${linha}`, { status: 'travado', blockedReason: 'Cliente pediu para voltar depois do fechamento.' });
    expect(com.statusCode).toBe(200);
    expect(com.json().status).toBe('travado');

    // marcar etapa num cliente travado não tira o "travado" (o motivo continua valendo)
    const dep = await operador.post(`/projects/${projetoId}/clientes/${linha}/etapas/${etapas[0]!.id}`, { feito: true });
    expect(dep.json().status).toBe('travado');
    expect(dep.json().blockedReason).toMatch(/fechamento/);

    // destravar devolve a linha ao fluxo automático: ela já tem uma etapa marcada
    const solto = await operador.patch(`/projects/${projetoId}/clientes/${linha}`, { status: 'pendente' });
    expect(solto.json().status).toBe('andamento');
    expect(solto.json().blockedReason).toBeNull();
  });

  it('"não se aplica" fecha a linha, barra a marcação e não conta como trabalho feito', async () => {
    const linha = linhas['Distribuidora Norte']!;
    const fora = await operador.patch(`/projects/${projetoId}/clientes/${linha}`, { status: 'nao_se_aplica' });
    expect(fora.json().status).toBe('nao_se_aplica');
    expect(fora.json().doneAt).not.toBeNull();

    const tenta = await operador.post(`/projects/${projetoId}/clientes/${linha}/etapas/${etapas[0]!.id}`, { feito: true });
    expect(tenta.statusCode).toBe(400);
    expect(tenta.json().error).toMatch(/não se aplica/i);

    const p = await proj();
    // 3 clientes: 1 concluído + 1 não se aplica = 2 fechados; sobra 1
    expect(p.resumo.faltam).toBe(1);
    expect(p.resumo.contagem.nao_se_aplica).toBe(1);
    expect(p.resumo.contagem.concluido).toBe(1);
    expect(p.resumo.andamento).toBe(67);
  });
});

describe('mexer nas etapas depois que o trabalho começou', () => {
  it('renomear preserva as marcas; tirar uma etapa apaga só as dela e reavalia quem já tinha fechado', async () => {
    const antes = await proj();
    const concluido = antes.clientes.find((c: any) => c.status === 'concluido');
    expect(concluido.feitas).toHaveLength(3);

    // renomear a primeira (mesmo id) e acrescentar uma quarta
    const r = await s.patch(`/projects/${projetoId}`, {
      etapas: [
        { id: etapas[0]!.id, title: 'Gravar o áudio (estúdio)' },
        { id: etapas[1]!.id, title: etapas[1]!.title },
        { id: etapas[2]!.id, title: etapas[2]!.title },
        { title: 'Avisar que está no ar' },
      ],
    });
    expect(r.statusCode).toBe(200);
    const comQuatro = r.json();
    expect(comQuatro.etapas).toHaveLength(4);
    // quem estava concluído volta a "andamento": apareceu etapa nova
    expect(comQuatro.clientes.find((c: any) => c.id === concluido.id).status).toBe('andamento');
    expect(comQuatro.clientes.find((c: any) => c.id === concluido.id).feitas).toHaveLength(3);

    // tirar a etapa nova devolve o concluído
    const semAQuarta = await s.patch(`/projects/${projetoId}`, { etapas: comQuatro.etapas.slice(0, 3).map((e: any) => ({ id: e.id, title: e.title })) });
    expect(semAQuarta.json().clientes.find((c: any) => c.id === concluido.id).status).toBe('concluido');
    etapas = semAQuarta.json().etapas;
  });
});

describe('o painel do projeto', () => {
  it('conta por situação, mostra como está cada passo, e marca o atraso só quando ainda falta gente', async () => {
    const p = await proj();

    // a leitura por coluna: quantos clientes em cada faixa de cada etapa
    expect(p.resumo.porEtapa).toHaveLength(p.etapas.length);
    const primeira = p.resumo.porEtapa[0];
    expect(primeira.title).toBe(p.etapas[0].title);
    expect(primeira.total).toBe(p.resumo.total);
    expect(primeira.faixas.map((f: any) => f.label)).toEqual(['Feito', 'Falta']);
    expect(primeira.faixas.reduce((a: number, f: any) => a + f.n, 0)).toBe(p.resumo.total);
    expect(primeira.resolvidas + primeira.faltam).toBe(p.resumo.total);

    // prazo no passado, com gente devendo → atrasado
    expect((await s.patch(`/projects/${projetoId}`, { dueDate: '2020-01-01' })).json().resumo.atrasado).toBe(true);
    // fechando o que falta, o atraso some — e marcar "concluído" à mão completa as etapas que faltavam
    const fechado = await s.patch(`/projects/${projetoId}/clientes/${linhas['Clínica Aurora']}`, { status: 'concluido' });
    expect(fechado.json().status).toBe('concluido');
    expect((await proj()).clientes.find((c: any) => c.id === linhas['Clínica Aurora']).feitas).toHaveLength(3);
    expect((await proj()).resumo.atrasado).toBe(false);
    await s.patch(`/projects/${projetoId}`, { dueDate: '2026-12-31' });
    await s.patch(`/projects/${projetoId}/clientes/${linhas['Clínica Aurora']}`, { status: 'pendente' });
  });

  it('a lista traz o andamento e o Painel inicial resume os abertos', async () => {
    const lista = (await operador.get('/projects')).json();
    const meu = lista.items.find((x: any) => x.id === projetoId);
    expect(meu.total).toBe(3);
    expect(meu.etapas).toBe(3);
    expect(lista.podeTrabalhar).toBe(true);
    expect(lista.podeGerenciar).toBe(false);

    const painel = (await s.get('/dashboard')).json();
    expect(painel.projetos.abertos).toBeGreaterThan(0);
    expect(painel.projetos.items[0].name).toBe('Áudio novo das URAs');
  });

  it('a ficha do cliente mostra os projetos dele', async () => {
    const r = await leitor.get(`/clients/${clientes[0]!.id}/projetos`);
    expect(r.statusCode).toBe(200);
    expect(r.json()[0]).toMatchObject({ name: 'Áudio novo das URAs', status: 'concluido', etapas: 3, feitas: 3 });
  });
});

describe('comentários e anexos', () => {
  it('comentário do projeto e do cliente ficam separados; só o dono (ou quem gerencia) apaga', async () => {
    const doProjeto = await operador.post(`/projects/${projetoId}/comentarios`, { body: 'A locução final está anexada aqui.' });
    expect(doProjeto.statusCode).toBe(201);
    const doCliente = await operador.post(`/projects/${projetoId}/comentarios`, { body: 'Liguei duas vezes, ficaram de retornar.', projectClientId: linhas['Clínica Aurora'] });
    expect(doCliente.statusCode).toBe(201);

    const p = await proj();
    expect(p.comentarios).toHaveLength(2);
    expect(p.comentarios.filter((c: any) => !c.projectClientId)).toHaveLength(1);
    expect(p.comentarios[0].autor).toBe('Marina Costa');

    // o administrador (que gerencia) apaga o comentário de outra pessoa
    expect((await s.del(`/projects/${projetoId}/comentarios/${doCliente.json().id}`)).statusCode).toBe(200);
    expect((await proj()).comentarios).toHaveLength(1);
  });

  it('anexo aceita qualquer formato, respeita o limite e baixa com o nome original', async () => {
    const r = await operador.post(`/projects/${projetoId}/anexos`, { fileName: 'lista-de-ramais.xlsx', conteudo: XLSX });
    expect(r.statusCode).toBe(201);
    expect(r.json().fileName).toBe('lista-de-ramais.xlsx');

    const baixar = await leitor.get(`/projects/anexos/${r.json().id}`);
    expect(baixar.statusCode).toBe(200);
    // sempre como download, nunca aberto dentro do sistema
    expect(baixar.headers['content-type']).toBe('application/octet-stream');
    expect(String(baixar.headers['content-disposition'])).toContain('lista-de-ramais.xlsx');

    const gigante = await operador.post(`/projects/${projetoId}/anexos`, { fileName: 'enorme.bin', conteudo: `data:application/octet-stream;base64,${'A'.repeat(15_000_000)}` });
    expect(gigante.statusCode).toBe(400);

    expect((await operador.del(`/projects/${projetoId}/anexos/${r.json().id}`)).statusCode).toBe(200);
    expect((await proj()).anexos).toHaveLength(0);
  });
});

describe('quem pode o quê', () => {
  it('o leitor só lê; o operador trabalha mas não cria; o administrador faz tudo', async () => {
    expect((await leitor.get('/projects')).statusCode).toBe(200);
    expect((await leitor.post(`/projects/${projetoId}/clientes/${linhas['Clínica Aurora']}/etapas/${etapas[0]!.id}`, { feito: true })).statusCode).toBe(403);
    expect((await leitor.post(`/projects/${projetoId}/comentarios`, { body: 'oi' })).statusCode).toBe(403);

    expect((await operador.post('/projects', { name: 'Não deveria', etapas: [{ title: 'x' }] })).statusCode).toBe(403);
    expect((await operador.del(`/projects/${projetoId}/clientes/${linhas['Clínica Aurora']}`)).statusCode).toBe(403);
    expect((await operador.del(`/projects/${projetoId}`)).statusCode).toBe(403);
  });
});

describe('tirar da lista e encerrar', () => {
  it('tirar um cliente apaga as marcas dele; encerrar e reabrir o projeto funciona; a lixeira recebe e devolve', async () => {
    const linha = linhas['Distribuidora Norte']!;
    expect((await s.del(`/projects/${projetoId}/clientes/${linha}`)).statusCode).toBe(200);
    const p = await proj();
    expect(p.clientes).toHaveLength(2);
    expect(p.resumo.total).toBe(2);

    expect((await s.patch(`/projects/${projetoId}`, { status: 'concluido' })).json().closedAt).not.toBeNull();
    expect((await s.get('/projects?status=aberto')).json().items.some((x: any) => x.id === projetoId)).toBe(false);
    expect((await s.get('/projects?status=concluido')).json().items.some((x: any) => x.id === projetoId)).toBe(true);
    expect((await s.patch(`/projects/${projetoId}`, { status: 'aberto' })).json().closedAt).toBeNull();

    expect((await s.del(`/projects/${projetoId}`)).statusCode).toBe(200);
    const lixeira = (await s.get('/admin/trash')).json();
    expect(lixeira.some((x: any) => x.type === 'project' && x.id === projetoId)).toBe(true);
    expect((await s.post(`/admin/trash/project/${projetoId}/restore`)).statusCode).toBe(200);
    expect((await s.get(`/projects/${projetoId}`)).statusCode).toBe(200);
  });
});

describe('etapa em lista de opções (o rótulo colorido da planilha)', () => {
  it('só as opções que "resolvem" fecham a etapa; trocar o rótulo preserva a escolha; tirar a opção limpa', async () => {
    const r = await s.post('/projects', {
      name: 'Feriado de 12 de outubro',
      goal: 'Áudio de feriado e bot travado com aviso.',
      etapas: [
        {
          title: 'Áudio do feriado', kind: 'escolha',
          options: [
            { label: 'Sem necessidade', tone: 'muted', conclui: true },
            { label: 'Aguardando áudio', tone: 'bad', conclui: false },
            { label: 'Configurado na URA', tone: 'ok', conclui: true },
          ],
        },
        { title: 'Voltar ao normal', kind: 'check' },
      ],
      clientIds: [clientes[0]!.id],
    });
    expect(r.statusCode).toBe(201);
    const p1 = r.json();
    const [audio, voltar] = p1.etapas;
    const linha = p1.clientes[0].id;
    expect(audio.kind).toBe('escolha');
    expect(audio.options).toHaveLength(3);
    expect(audio.options[0].id).toBeTruthy();

    const marcar = (stepId: string, corpo: Record<string, unknown>) => operador.post(`/projects/${p1.id}/clientes/${linha}/etapas/${stepId}`, corpo);

    // a caixinha não aceita "valor", e a lista não aceita "feito"
    expect((await marcar(audio.id, { feito: true })).statusCode).toBe(400);
    expect((await marcar(voltar.id, { valor: audio.options[0].id })).statusCode).toBe(400);
    expect((await marcar(audio.id, { valor: 'nao-existe' })).statusCode).toBe(400);

    // "Aguardando áudio" não resolve: a linha só sai de pendente quando algo fecha
    expect((await marcar(audio.id, { valor: audio.options[1].id })).json().status).toBe('pendente');
    // "Configurado na URA" resolve
    expect((await marcar(audio.id, { valor: audio.options[2].id })).json().status).toBe('andamento');
    // com a caixinha marcada, fecha tudo
    expect((await marcar(voltar.id, { feito: true })).json().status).toBe('concluido');
    // limpar a escolha reabre
    expect((await marcar(audio.id, { valor: null })).json().status).toBe('andamento');
    await marcar(audio.id, { valor: audio.options[2].id });

    // a leitura por coluna conta quantos estão em cada opção
    const porEtapa = (await s.get(`/projects/${p1.id}`)).json().resumo.porEtapa;
    const coluna = porEtapa.find((x: any) => x.stepId === audio.id);
    expect(coluna.faixas.map((f: any) => f.label)).toEqual(['Sem necessidade', 'Aguardando áudio', 'Configurado na URA', 'Em branco']);
    expect(coluna.faixas.find((f: any) => f.label === 'Configurado na URA').n).toBe(1);
    expect(coluna.faixas.reduce((a: number, f: any) => a + f.n, 0)).toBe(1);

    // renomear o rótulo (mesmo id) preserva a escolha
    const renomeado = await s.patch(`/projects/${p1.id}`, {
      etapas: [
        { id: audio.id, title: 'Áudio do feriado', kind: 'escolha', options: [
          { ...audio.options[0] }, { ...audio.options[1] },
          { ...audio.options[2], label: 'Áudio já está no ar' },
        ] },
        { id: voltar.id, title: voltar.title, kind: 'check' },
      ],
    });
    const depois = renomeado.json();
    expect(depois.clientes[0].status).toBe('concluido');
    expect(depois.clientes[0].feitas.find((f: any) => f.stepId === audio.id).valor).toBe(audio.options[2].id);
    expect(depois.etapas[0].options[2].label).toBe('Áudio já está no ar');

    // tirar a opção escolhida limpa a marca daquele cliente
    const semAOpcao = await s.patch(`/projects/${p1.id}`, {
      etapas: [
        { id: audio.id, title: 'Áudio do feriado', kind: 'escolha', options: [{ ...audio.options[0] }, { ...audio.options[1] }] },
        { id: voltar.id, title: voltar.title, kind: 'check' },
      ],
    });
    expect(semAOpcao.json().clientes[0].feitas.some((f: any) => f.stepId === audio.id)).toBe(false);
    expect(semAOpcao.json().clientes[0].status).toBe('andamento');

    await s.del(`/projects/${p1.id}`);
  });

  it('lista sem duas opções, ou sem nenhuma que resolva, é recusada', async () => {
    const poucas = await s.post('/projects', { name: 'x', etapas: [{ title: 'Só uma', kind: 'escolha', options: [{ label: 'Única', tone: 'ok', conclui: true }] }] });
    expect(poucas.statusCode).toBe(400);
    const semFim = await s.post('/projects', { name: 'y', etapas: [{ title: 'Nunca fecha', kind: 'escolha', options: [{ label: 'A', tone: 'bad', conclui: false }, { label: 'B', tone: 'signal', conclui: false }] }] });
    expect(semFim.statusCode).toBe(400);
  });

  it('as cores novas do 1.4 (roxo, rosa, turquesa, amarelo) são aceitas; cor inventada, não', async () => {
    const cores = await s.post('/projects', {
      name: 'Cores novas',
      etapas: [{ title: 'Status', kind: 'escolha', options: ['roxo', 'rosa', 'turquesa', 'amarelo'].map((tone, i) => ({ label: `Opção ${i}`, tone, conclui: i === 0 })) }],
    });
    expect(cores.statusCode).toBe(201);
    expect(cores.json().etapas[0].options.map((o: any) => o.tone)).toEqual(['roxo', 'rosa', 'turquesa', 'amarelo']);
    await s.del(`/projects/${cores.json().id}`);
    const inventada = await s.post('/projects', { name: 'z', etapas: [{ title: 'S', kind: 'escolha', options: [{ label: 'A', tone: 'dourado', conclui: true }, { label: 'B', tone: 'ok', conclui: false }] }] });
    expect(inventada.statusCode).toBe(400);
  });

  it('marcar "concluído" à mão escolhe a opção que resolve', async () => {
    const p2 = (await s.post('/projects', {
      name: 'Feriado seguinte',
      etapas: [{ title: 'Bot', kind: 'escolha', options: [{ label: 'Pendente', tone: 'bad', conclui: false }, { label: 'Travado com aviso', tone: 'ok', conclui: true }] }],
      clientIds: [clientes[1]!.id],
    })).json();
    const linha = p2.clientes[0].id;
    const fechou = await s.patch(`/projects/${p2.id}/clientes/${linha}`, { status: 'concluido' });
    expect(fechou.json().status).toBe('concluido');
    const depois = (await s.get(`/projects/${p2.id}`)).json();
    expect(depois.clientes[0].feitas[0].valor).toBe(p2.etapas[0].options[1].id);
    await s.del(`/projects/${p2.id}`);
  });
});

describe('duplicar', () => {
  it('leva etapas, opções e a lista de clientes, tudo zerado e sem prazo', async () => {
    const original = (await s.post('/projects', {
      name: 'Feriado de novembro',
      dueDate: '2026-11-15',
      etapas: [
        { title: 'Áudio', kind: 'escolha', options: [{ label: 'Pendente', tone: 'bad', conclui: false }, { label: 'No ar', tone: 'ok', conclui: true }] },
        { title: 'Avisar', kind: 'check' },
      ],
      clientIds: [clientes[0]!.id, clientes[1]!.id],
    })).json();
    const linha = original.clientes[0].id;
    await s.post(`/projects/${original.id}/clientes/${linha}/etapas/${original.etapas[1].id}`, { feito: true });

    const copia = await s.post(`/projects/${original.id}/duplicar`, { name: 'Feriado de dezembro' });
    expect(copia.statusCode).toBe(201);
    const c = copia.json();
    expect(c.name).toBe('Feriado de dezembro');
    expect(c.id).not.toBe(original.id);
    expect(c.dueDate).toBeNull();
    expect(c.etapas.map((e: any) => e.title)).toEqual(['Áudio', 'Avisar']);
    expect(c.etapas[0].options.map((o: any) => o.label)).toEqual(['Pendente', 'No ar']);
    expect(c.clientes).toHaveLength(2);
    expect(c.clientes.every((x: any) => x.status === 'pendente')).toBe(true);
    expect(c.resumo.etapasFeitas).toBe(0);
    // o original continua intacto
    expect((await s.get(`/projects/${original.id}`)).json().resumo.etapasFeitas).toBe(1);
    // quem não gerencia não duplica
    expect((await operador.post(`/projects/${original.id}/duplicar`, {})).statusCode).toBe(403);

    await s.del(`/projects/${c.id}`);
    await s.del(`/projects/${original.id}`);
  });
});
