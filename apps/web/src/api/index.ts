/**
 * A "ponte" entre as telas e os dados. As telas só conhecem esta interface `Api`.
 * Em produção ela aponta para o servidor (client.ts); na prévia publicada aponta para a versão de mentira (demo.ts).
 */
import type * as T from './types.js';
import type {
  AjustesDoSimulador, AjustesDoSimuladorEntrada, CalendarioOpcoes, ContatoDoCliente, ContatoGravarEntrada, EventoAviso, EventoDoCalendario, EventoGravarEntrada,
  AoMoverEntrada, LeituraDoHelenaNaTela, OQueAEtapaFaz, OpcoesDoTrazerDoHelena, PlanilhaParaALeitura, PreviaDoHelena, ResultadoDoTrazerDoHelena,
  Simulacao, SimulacaoDaNegociacao, SimulacaoGravarEntrada, SimulacaoNaLista, SimuladorOpcoes, SituacaoDoEvento, TipoDeEvento,
} from '@gestor/shared';
import { API_BASE } from './base.js';

export type Api = {
  auth: {
    me(): Promise<T.Me>;
    /** `embutido`: a tela está dentro de outro site (o menu do LineChat): o servidor manda o cookie que funciona num iframe */
    login(email: string, password: string, embutido?: boolean): Promise<T.Entrada>;
    /** Segunda etapa: o código do aplicativo, ou um código de recuperação. */
    loginCode(code: string): Promise<T.Me>;
    logout(): Promise<{ ok: boolean }>;
    changePassword(currentPassword: string, newPassword: string): Promise<{ ok: boolean }>;
    twoFactorSetup(): Promise<{ secret: string; uri: string; qrSvg: string }>;
    twoFactorEnable(code: string): Promise<{ recovery: string[] }>;
    twoFactorDisable(password: string): Promise<{ ok: boolean }>;
    /** Ajustar a própria conta (o usuário SSH) */
    updateMe(d: { sshUser: string | null }): Promise<T.Me>;
  };
  dashboard: { summary(): Promise<T.Dashboard>; search(q: string): Promise<T.SearchResult> };
  clients: {
    list(q: Record<string, unknown>): Promise<T.Page<T.ClientListItem>>;
    options(q?: { includeInternal?: boolean; productCode?: string; withDevices?: boolean; withProducts?: boolean }): Promise<T.Option[]>;
    get(id: string): Promise<T.ClientFull>;
    /** Projetos de que este cliente participa (a aba da ficha) */
    projetos(id: string): Promise<T.ProjetoDoCliente[]>;
    create(d: Record<string, unknown>): Promise<T.ClientFull>;
    update(id: string, d: Record<string, unknown>): Promise<T.ClientFull>;
    remove(id: string): Promise<{ ok: boolean }>;
    upsertSubscription(id: string, d: Record<string, unknown>): Promise<T.ClientFull>;
    endSubscription(id: string, code: string): Promise<T.ClientFull>;
    upsertModule(id: string, d: Record<string, unknown>): Promise<T.ClientFull>;
    saveLogo(id: string, dataUrl: string): Promise<T.ClientFull>;
    removeLogo(id: string): Promise<T.ClientFull>;
    endModule(id: string, productCode: string, moduleCode: string): Promise<T.ClientFull>;
    dids(id: string): Promise<T.Page<T.Did>>;
    devices(id: string): Promise<{ devices: T.Page<T.Device> }>;
    history(id: string): Promise<T.Page<T.AuditItem>>;
    units(id: string): Promise<T.ClientUnit[]>;
    createUnit(id: string, d: { name: string; address?: string | null; egressIp?: string | null; note?: string | null }): Promise<T.ClientUnit>;
    updateUnit(id: string, unitId: string, d: { name: string; address?: string | null; egressIp?: string | null; note?: string | null }): Promise<T.ClientUnit>;
    removeUnit(id: string, unitId: string): Promise<{ ok: boolean }>;
    /** Os contatos do cliente (2.0): os ativos primeiro, com quantos chamados cada WhatsApp tem */
    contatos(id: string): Promise<ContatoDoCliente[]>;
    /** Os cargos que o contato pode ter (2.0.2): os ativos do catálogo Cargos dos contatos, em ordem alfabética */
    cargos(): Promise<string[]>;
    /** Incluir (contatoId nulo) ou editar, desativar e reativar um contato */
    salvarContato(id: string, contatoId: string | null, d: ContatoGravarEntrada): Promise<ContatoDoCliente>;
    /** Login e senha padrão dos aparelhos, por modelo (um por modelo; gravar de novo atualiza) */
    saveDeviceLogin(id: string, d: Record<string, unknown>): Promise<T.ClientFull>;
    removeDeviceLogin(id: string, loginId: string): Promise<T.ClientFull>;
    /** Rede padrão dos aparelhos (IP, máscara, gateway, DNS, senha do ramal sem fio) */
    saveNetwork(id: string, d: Record<string, unknown>): Promise<T.ClientFull>;
  };
  secrets: { reveal(id: string): Promise<{ label: string; value: string; visibleForSeconds: number }> };
  circuits: {
    list(q: Record<string, unknown>): Promise<T.Page<T.Circuit>>;
    summary(q?: Record<string, unknown>): Promise<T.CircuitSummary>;
    options(): Promise<Array<{ id: string; name: string; code: string; carrierName: string | null }>>;
    /** Quem é titular de pelo menos um circuito (para o filtro "Titular") */
    owners(includeThirdParty: boolean): Promise<T.Option[]>;
    get(id: string): Promise<T.Circuit>;
    create(d: Record<string, unknown>): Promise<T.Circuit>;
    update(id: string, d: Record<string, unknown>): Promise<T.Circuit>;
    remove(id: string): Promise<{ ok: boolean }>;
    createRange(id: string, d: Record<string, unknown>): Promise<{ created: number; first: string; last: string }>;
  };
  dids: {
    list(q: Record<string, unknown>): Promise<T.Page<T.Did>>;
    ids(q: Record<string, unknown>): Promise<{ ids: string[] }>;
    createRange(d: Record<string, unknown>): Promise<{ created: number; first: string; last: string }>;
    update(id: string, d: Record<string, unknown>): Promise<T.Did>;
    bulk(ids: string[], set: Record<string, unknown>): Promise<{ affected: number }>;
    bulkDelete(ids: string[]): Promise<{ affected: number }>;
  };
  inventory: {
    summary(q?: Record<string, unknown>): Promise<T.InventorySummary>;
    models(q?: Record<string, unknown>): Promise<T.DeviceModel[]>;
    createModel(d: Record<string, unknown>): Promise<T.DeviceModel>;
    updateModel(id: string, d: Record<string, unknown>): Promise<T.DeviceModel>;
    removeModel(id: string): Promise<{ ok: boolean }>;
    saveModelImage(id: string, dataUrl: string): Promise<{ ok: boolean }>;
    removeModelImage(id: string): Promise<{ ok: boolean }>;
    devices(q: Record<string, unknown>): Promise<T.Page<T.Device>>;
    device(id: string): Promise<T.Device>;
    createDevice(d: Record<string, unknown>): Promise<T.Device>;
    /** Vários de uma vez: lista de MACs, de números de série, ou uma quantidade sem identificação */
    createDevices(d: { modelId: string; tipo: 'mac' | 'serie' | 'nenhum'; valores?: string[]; quantidade?: number; condition?: string; note?: string | null }): Promise<T.CadastroEmMassa>;
    updateDevice(id: string, d: Record<string, unknown>): Promise<T.Device>;
    removeDevice(id: string): Promise<{ ok: boolean }>;
    movements(q: Record<string, unknown>): Promise<T.Page<T.Movement>>;
    move(d: Record<string, unknown>): Promise<{ id: string; items: number; quantity: number }>;
    /** O recibo de entrega (1.9): um arquivo por vez — PDF ou foto, até 10 MB; até 5 por movimentação. */
    anexarRecibo(movementId: string, d: { fileName: string; conteudo: string }): Promise<T.ReciboDeEntrega>;
    tirarRecibo(id: string): Promise<{ ok: boolean }>;
    /** Unidades já usadas (para sugerir no formulário). */
    units(clientId?: string): Promise<string[]>;
    /** Os relatórios do Inventário (1.9): quem tem o quê, prateleira, valor, vai e volta, cadastro. */
    relatorios(): Promise<T.RelatoriosInventario>;
  };
  settings: {
    backup(): Promise<T.AjustesBackup>;
    saveBackup(d: { ativo: boolean; pasta: string; pastaId: string; chaveJson?: string }): Promise<T.AjustesBackup>;
    testBackup(): Promise<{ ok: boolean; mensagem: string }>;
    alerts(): Promise<T.AjustesAvisos>;
    saveAlerts(d: { ativo: boolean; url: string; metodo: 'POST' | 'GET'; cabecalhos: string; corpo: string; token?: string }): Promise<T.AjustesAvisos>;
    testAlerts(): Promise<{ ok: boolean; mensagem: string }>;
    linechat(): Promise<T.AjustesLineChat>;
    saveLinechat(d: { ativo: boolean; url: string; appUrl: string; painelId: string; painelNome: string; token?: string }): Promise<T.AjustesLineChat>;
    testLinechat(): Promise<{ ok: boolean; mensagem: string }>;
    paineisLinechat(): Promise<T.PainelLineChat[]>;
    /** `completa` relê o painel inteiro; senão, só o que mudou desde a última vez */
    syncLinechat(completa: boolean): Promise<T.ResultadoSincronizacao>;
  };
  /** Chamados de suporte: a cópia do painel do LineChat (só leitura) */
  chamados: {
    opcoes(): Promise<T.OpcoesChamados>;
    resumo(q: Record<string, unknown>): Promise<T.ResumoChamados>;
    lista(q: Record<string, unknown>): Promise<T.Page<T.LinhaChamado>>;
    /** A arrumação da tela (ordem, largura, escondidos, pizza ou barras, grupos, etapas que fecham), igual para a equipe toda */
    painel(): Promise<T.PainelChamados>;
    /** Só a administração: arruma a tela para todos */
    salvarPainel(p: { itens: T.ItemPainel[]; etapasFechadas: string[] | null }): Promise<T.PainelChamados>;
    /** Chamados › Relatórios (1.7): os oito relatórios no período e com os filtros */
    relatorios(q: Record<string, unknown>): Promise<T.RelatoriosChamados>;
    /** Os chamados de uma peça clicada num relatório */
    pecaRelatorio(q: Record<string, unknown>): Promise<T.PecaRelatorio>;
    ajustesRelatorios(): Promise<T.AjustesRelatoriosTela>;
    /** Só a administração: os campos usados e a ligação dos clientes, para a equipe toda */
    salvarAjustesRelatorios(a: T.AjustesRelatorios): Promise<unknown>;
    raioX(clienteId: string, q: Record<string, unknown>): Promise<T.RaioXCliente>;
    arrumacaoRelatorios(): Promise<T.ArrumacaoRelatoriosTela>;
    /** só quem tem admin.manage; vale para a equipe toda e vai para a auditoria */
    salvarArrumacaoRelatorios(a: { ordem: string[]; ocultos: string[]; favoritos: string[] }): Promise<T.ArrumacaoRelatoriosTela>;
  };
  /** O envio automático do PDF dos Chamados pelo WhatsApp (1.7) */
  envio: {
    ajustes(): Promise<T.EnvioAjustesTela>;
    /** só a administração; o token (quando vem) vai para o cofre */
    salvarAjustes(a: { ativo: boolean; url: string; remetente: string; horario: string; dias: number[]; destinatarios: Array<{ id: string; nome: string; numero: string; ativo: boolean }>; token?: string }): Promise<T.EnvioAjustesTela>;
    marcados(): Promise<T.MarcadosEnvioTela>;
    /** só a administração: o que vai no PDF, para a equipe toda */
    salvarMarcados(m: { relatorios: string[]; graficos: string[] }): Promise<T.MarcadosEnvioTela>;
    /** a página do PDF: com a chave do robô, ou com a sessão */
    pacote(chave?: string): Promise<T.PacoteEnvio>;
    enviar(destinatarioId?: string): Promise<T.RegistroEnvio>;
    testar(destinatarioId?: string): Promise<T.RegistroEnvio>;
    /** baixar o PDF de agora (null na prévia: não há servidor para montar) */
    pdfUrl(): string | null;
    historicoPdfUrl(id: string): string | null;
  };
  data: {
    preview(d: { entity: string; csv: string; delimiter: string }): Promise<T.ImportPlan>;
    apply(d: { entity: string; csv: string; delimiter: string }): Promise<{ created: number; updated: number }>;
    exportUrl(entity: string): string;
    exportWithSecrets(entity: string, password: string): Promise<{ blob: Blob; zipPassword: string; filename: string }>;
  };
  novidades: {
    /** A nota que deve abrir no login desta pessoa (ou nada) */
    pendente(): Promise<T.NovidadePendente | null>;
    /** Histórico + se esta pessoa pode editar + quantas ela ainda não leu */
    lista(): Promise<{ items: T.Novidade[]; podeEditar: boolean; naoLidas: number }>;
    /** `assistiu`: marcou pelo vídeo ("Assisti e entendi"), e não pelos cartões — vai para a auditoria */
    marcarLida(id: string, assistiu?: boolean): Promise<{ ok: boolean }>;
    leituras(id: string): Promise<T.LeiturasNovidade>;
    /** Sobe o vídeo do patch (com a barra de progresso); passa a ser da nota ao salvar, com `videoId` */
    subirVideo(arquivo: File, progresso?: (p: number) => void): Promise<T.VideoNovidade>;
    criar(d: Record<string, unknown>): Promise<{ id: string }>;
    atualizar(id: string, d: Record<string, unknown>): Promise<{ id: string }>;
    publicar(id: string, publicar: boolean): Promise<{ id: string; publishedAt: string | null }>;
    remover(id: string): Promise<{ ok: boolean }>;
  };
  projetos: {
    lista(q?: { status?: string; q?: string }): Promise<{ items: T.ProjetoResumo[]; podeTrabalhar: boolean; podeGerenciar: boolean }>;
    get(id: string): Promise<T.Projeto>;
    /** Quem pode ser responsável (as pessoas ativas) */
    pessoas(): Promise<Array<{ id: string; name: string }>>;
    criar(d: Record<string, unknown>): Promise<T.Projeto>;
    atualizar(id: string, d: Record<string, unknown>): Promise<T.Projeto>;
    remover(id: string): Promise<{ ok: boolean }>;
    addClientes(id: string, clientIds: string[], assigneeId?: string | null): Promise<T.Projeto>;
    removerCliente(id: string, linhaId: string): Promise<{ ok: boolean }>;
    /** Trocar responsável ou situação de um cliente no projeto */
    linha(id: string, linhaId: string, d: Record<string, unknown>): Promise<unknown>;
    /** caixinha: `{ feito }`; lista: `{ valor }` (o id da opção, ou null para limpar) */
    marcar(id: string, linhaId: string, stepId: string, d: { feito?: boolean; valor?: string | null }): Promise<unknown>;
    duplicar(id: string, name?: string): Promise<T.Projeto>;
    comentar(id: string, body: string, projectClientId?: string | null): Promise<unknown>;
    apagarComentario(id: string, commentId: string): Promise<{ ok: boolean }>;
    anexar(id: string, d: { fileName: string; conteudo: string; projectClientId?: string | null }): Promise<T.AnexoProjeto>;
    apagarAnexo(id: string, anexoId: string): Promise<{ ok: boolean }>;
    /** Endereço para baixar o anexo (abre direto no navegador) */
    anexoUrl(anexoId: string): string;
  };
  /** Base de conhecimento (Patch 1.8) */
  base: {
    lista(q: Record<string, unknown>): Promise<T.ListaBase>;
    opcoes(): Promise<T.OpcoesBase>;
    /** pelo número (12) ou pelo código (BC-12) */
    get(numero: number | string): Promise<T.Artigo>;
    criar(d: T.ArtigoGravar): Promise<T.GravadoArtigo>;
    /** `versao` é a que a pessoa abriu: se outra pessoa salvou no meio, vem erro 409 */
    atualizar(numero: number, d: T.ArtigoGravar): Promise<T.GravadoArtigo>;
    remover(numero: number): Promise<{ ok: boolean }>;
    /** ligar (ou tirar) uma coisa só, sem mexer no texto (o "Ligar um artigo" do projeto) */
    ligar(numero: number, l: { tipo: T.TipoLigacao; alvo: string; ligar: boolean }): Promise<{ ok: boolean }>;
    versoes(numero: number): Promise<T.VersoesArtigo>;
    comparar(numero: number, de: number, para: number): Promise<{ de: T.TextoVersao; para: T.TextoVersao }>;
    voltarVersao(numero: number, versao: number): Promise<{ numero: number; versao: number }>;
    /** só quem cuida da base: pedir (ou tirar) a leitura obrigatória */
    obrigatoria(numero: number, ligar: boolean): Promise<{ ok: boolean }>;
    marcarLida(numero: number): Promise<{ ok: boolean }>;
    leituras(numero: number): Promise<T.LeiturasArtigo>;
    /** quem escreve comenta (fica registrado quem e quando); apagar é o seu, ou qualquer um se você cuida da base */
    comentar(numero: number, texto: string): Promise<{ id: string }>;
    apagarComentario(numero: number, id: string): Promise<{ ok: boolean }>;
    /** os de leitura obrigatória que esta pessoa ainda não leu (o número do menu) */
    pendentes(): Promise<T.PendentesBase>;
    /** os publicados ligados a um cliente, modelo, operadora, projeto… (as fichas) */
    ligados(tipo: T.TipoLigacao, alvo: string): Promise<T.LigadosBase>;
    /** o livrinho da tabela de Chamados */
    paraChamados(ids: string[]): Promise<T.ArtigosDosChamados>;
    /** "Registrar na base" a partir de um chamado (pelo id do card ou IS-3607) */
    doChamado(ref: string): Promise<T.DoChamado>;
    /** a IA (1.8): pronta? perguntar à base, o rascunho a partir do card */
    ia(): Promise<T.SituacaoIa>;
    perguntar(pergunta: string): Promise<T.RespostaIa>;
    rascunhoIa(chamado: string): Promise<T.RascunhoIa>;
    /** os ajustes da IA (administração): o provedor, o modelo, a chave (que nunca volta) */
    iaAjustes(): Promise<T.AjustesIa>;
    salvarIaAjustes(a: T.SalvarAjustesIa): Promise<T.AjustesIa>;
    testarIa(): Promise<{ ok: boolean; mensagem: string }>;
    /** os modelos que a chave pode usar (a digitada, ou a guardada se for do mesmo provedor) */
    iaModelos(p: { provedor: T.ProvedorIa; endereco?: string | null; chave?: string }): Promise<{ modelos: T.ModeloIa[] }>;
  };
  /** Portal do cliente — o lado da equipe (Patch 1.8) */
  portalAdmin: {
    opcoes(): Promise<T.OpcoesPortal>;
    tutoriais(q: Record<string, unknown>): Promise<T.Page<T.TutorialNaLista>>;
    tutorial(numero: number): Promise<T.Tutorial>;
    criar(d: T.TutorialGravar): Promise<T.GravadoTutorial>;
    /** `versao` é a que a pessoa abriu: se outra pessoa salvou no meio, vem erro 409 */
    atualizar(numero: number, d: T.TutorialGravar): Promise<T.GravadoTutorial>;
    remover(numero: number): Promise<{ ok: boolean }>;
    /** sobe um arquivo (o vídeo até 300 MB); `progresso` recebe de 0 a 1 */
    subir(tipo: T.TipoArquivoPortal, arquivo: File, progresso?: (p: number) => void): Promise<T.ArquivoDoPortal>;
    espaco(): Promise<T.EspacoPortal>;
    acessos(q?: { q?: string; cliente?: string }): Promise<T.AcessoPortal[]>;
    acessosDoCliente(clienteId: string): Promise<T.AcessosDoCliente>;
    /** o suporte escolhe o login (o e-mail ou um nome) e a senha (1.9, decisão 0045) */
    darAcesso(clienteId: string, d: { nome: string; login: string; senha: string }): Promise<{ id: string }>;
    /** a pessoa esqueceu (ou o acesso do 1.8 ainda não tinha senha): as sessões abertas caem */
    trocarSenhaDoAcesso(id: string, senha: string): Promise<{ ok: boolean }>;
    /** a senha guardada no cofre (fica na auditoria) */
    verSenhaDoAcesso(id: string): Promise<{ senha: string; visivelPorSegundos: number }>;
    bloquear(id: string, bloquear: boolean): Promise<{ ok: boolean }>;
    corrigirAcesso(id: string, d: { nome: string; login: string }): Promise<{ ok: boolean }>;
    ajustes(): Promise<T.PortalAjustes>;
    salvarAjustes(d: T.PortalAjustes): Promise<T.PortalAjustes>;
  };
  /** Portal do cliente — o lado do cliente, com login próprio (Patch 1.8) */
  portal: {
    sobre(): Promise<T.SobrePortal>;
    eu(): Promise<T.EuPortal>;
    /** a pessoa do cliente (o login e a senha do suporte), ou a equipe com o e-mail e a senha do Gestor; quem usa o código de 6 dígitos recebe `{ precisaCodigo: true }` */
    entrar(login: string, senha: string): Promise<T.EntradaPortal>;
    /** a segunda etapa da equipe: o login e a senha de novo, mais o código (ou um de recuperação) */
    entrarComCodigo(login: string, senha: string, codigo: string): Promise<T.EuPortal>;
    sair(): Promise<{ ok: boolean }>;
    trocarSenha(atual: string, nova: string): Promise<{ ok: boolean }>;
    inicio(): Promise<T.InicioPortal>;
    tutoriais(q: { q?: string; produto?: string }): Promise<{ items: T.TutorialAchado[]; total: number }>;
    /** pelo número, ou pelo pedaço do endereço ("12-como-transferir…") */
    tutorial(numero: string): Promise<T.TutorialDoCliente>;
  };
  /**
   * Os chamados do Gestor (Patch 2.0, decisão 0047): os painéis, o quadro, a lista, o Meu dia, a
   * ficha e os ajustes do módulo. Toda mudança num chamado devolve a ficha inteira, já atualizada.
   */
  atendimento: {
    opcoes(): Promise<T.OpcoesAtendimento>;
    quadro(q: Record<string, unknown>): Promise<T.QuadroAtendimento>;
    lista(q: Record<string, unknown>): Promise<T.Page<T.CartaoChamado>>;
    /** o CSV da lista com os filtros (null na prévia: baixa montado na própria tela) */
    exportarUrl(q: Record<string, unknown>): string | null;
    meuDia(): Promise<T.MeuDia>;
    /** a tela inicial (os painéis): os números de cada painel que a pessoa vê */
    resumoDosPaineis(): Promise<T.ResumoDoPainel[]>;
    /** o relatório de um painel de Vendas no período (painel, de e ate) */
    relatorioDeVendas(q: T.FiltroDoRelatorioDeVendas): Promise<T.RelatorioDeVendas>;
    /** os Relatórios de um painel de chamados (2.1): os 25 de uma vez, com o período e os filtros */
    relatorios(q: T.FiltroDosRelatorios): Promise<T.RelatoriosDoPainel>;
    /** a arrumação dos Relatórios de um painel (a ordem, os escondidos, os favoritos, o campo da falha) */
    /** a Visão geral de um painel de chamados (2.2): Hoje ou o Período, os números, o tempo, os gráficos e a tabela */
    visao(q: Record<string, string>): Promise<import('@gestor/shared').VisaoDoPainel>;
    arrumacaoDosRelatorios(painel: string): Promise<T.ArrumacaoDosRelatoriosLida>;
    /** arrumar para a equipe toda (quem cuida dos chamados) */
    salvarArrumacaoDosRelatorios(painel: string, a: T.ArrumacaoDosRelatorios): Promise<T.ArrumacaoDosRelatoriosLida>;
    avisos(): Promise<T.AvisosNaTela>;
    /** sem ids = todos */
    marcarAvisosLidos(ids?: string[]): Promise<{ ok: boolean }>;
    /** os produtos, operadoras, circuitos, DIDs e aparelhos do cliente, e os chamados recentes dele */
    cadastroDoCliente(clienteId: string): Promise<T.CadastroDoCliente>;
    /** pelo código (SUP-12) ou pelo id */
    chamado(ref: string): Promise<T.FichaChamado>;
    anexoUrl(id: string): string;
    /** os bytes de um anexo (o leitor de PDF desenha sem baixar o arquivo) */
    anexoBytes(id: string): Promise<ArrayBuffer>;
    /** `aviso`: como foi o WhatsApp ao cliente, quando a pessoa pediu para avisar */
    criar(d: T.ChamadoCriarEntrada): Promise<{ id: string; codigo: string; aviso?: { ok: boolean; mensagem: string } }>;
    alterar(id: string, d: T.ChamadoAlterarEntrada): Promise<T.FichaChamado>;
    /** escalonar (subir de nível) e voltar de nível pedem o motivo */
    mover(id: string, d: T.MoverEntrada): Promise<T.FichaChamado>;
    /**
     * O que a etapa vai fazer ao chegar (2.3), para a janela de antes de mover: abrir a implantação (o cliente, os produtos e
     * o card) ou ligar no cadastro (os produtos com a data e os módulos). Não grava nada.
     */
    aoMover(id: string, d: AoMoverEntrada): Promise<OQueAEtapaFaz>;
    /**
     * O lugar na coluna do quadro (2.1, nas etapas abertas do painel de Vendas): logo abaixo de `depoisDe`
     * (nulo: no alto). 409 quando o `depoisDe` saiu da etapa.
     */
    posicionar(id: string, d: { depoisDe: string | null }): Promise<{ codigo: string; posicao: number }>;
    /**
     * Pede à NIA (2.1, a IA do suporte no n8n) para preencher: a etiqueta de pedir entra (a de pronto e a de erro
     * saem), e o aviso do chamado alterado vai para o n8n, como quando a equipe etiquetava.
     */
    pedirANia(id: string): Promise<T.FichaChamado>;
    /** fica com o chamado; na entrada, ele vai para a primeira etapa de andamento */
    assumir(id: string): Promise<T.FichaChamado>;
    esperar(id: string, d: { tipo: 'cliente' | 'operadora' | null; motivo?: string | null }): Promise<T.FichaChamado>;
    reabrir(id: string, d: { motivo?: string | null; etapaId?: string | null }): Promise<T.FichaChamado>;
    trocarPainel(id: string, d: { painelId: string; etapaId?: string | null }): Promise<T.FichaChamado>;
    anotar(id: string, d: { texto: string; anexos: Array<{ fileName: string; conteudo: string }> }): Promise<T.FichaChamado>;
    apagarAnotacao(id: string, notaId: string): Promise<T.FichaChamado>;
    ligar(id: string, d: { para: string; tipo: T.TipoLigacaoChamado }): Promise<T.FichaChamado>;
    desligar(id: string, ligacaoId: string): Promise<T.FichaChamado>;
    /** o pai pelo código (null tira) */
    definirPai(id: string, pai: string | null): Promise<T.FichaChamado>;
    /** o problema de que este chamado é incidente, pelo código (null tira) */
    definirProblema(id: string, problema: string | null): Promise<T.FichaChamado>;
    checklist(id: string, d: T.ChecklistEntrada): Promise<T.FichaChamado>;
    registrarTempo(id: string, d: T.TempoEntrada): Promise<T.FichaChamado>;
    apagarTempo(id: string, itemId: string): Promise<T.FichaChamado>;
    abrirNaOperadora(id: string, d: T.OperadoraCasoEntrada): Promise<T.FichaChamado>;
    andamentoOperadora(id: string, casoId: string, d: { acao: 'cobrar' | 'fechar'; texto?: string | null }): Promise<T.FichaChamado>;
    /** pelo WhatsApp oficial; o que foi mandado fica no histórico */
    avisarCliente(id: string, texto: string): Promise<T.FichaChamado>;
    observar(id: string, observar: boolean): Promise<T.FichaChamado>;
    /** a IA lê a conversa (ou o chamado) e sugere; nada é gravado até a pessoa aplicar */
    preencherComIa(id: string): Promise<T.SugestaoIa>;
    remover(id: string): Promise<{ ok: boolean }>;
    restaurar(id: string): Promise<T.FichaChamado>;
    // ---- os ajustes do módulo (quem cuida dos chamados) ----
    salvarPainel(id: string | null, d: T.PainelGravarEntrada): Promise<T.Painel>;
    salvarEtapas(id: string, d: { etapas: T.EtapaGravarEntrada[]; destino: Record<string, string> }): Promise<T.Painel>;
    salvarAssunto(painelId: string, id: string | null, d: T.AssuntoGravarEntrada): Promise<T.Assunto>;
    /** a lista colada vira a árvore de uma vez */
    colarAssuntos(painelId: string, texto: string): Promise<{ criados: number; jaExistiam: number }>;
    /** os campos do sistema que o painel usa (desligados) e as opções do Tipo */
    salvarCamposDoSistema(painelId: string, d: T.CamposDoSistemaEntrada): Promise<T.Painel>;
    /** criar (sem id) ou mudar um campo do painel; obrigatório para abrir e nas etapas escolhidas */
    salvarCampo(painelId: string, id: string | null, d: T.CampoGravarEntrada): Promise<T.CampoPersonalizado>;
    /** só as caixinhas de um campo de caixinhas (2.3, o "Editar as caixinhas" do card: os nomes, a ordem e as pastas) */
    salvarCaixinhas(campoId: string, d: T.CaixinhasGravarEntrada): Promise<T.CampoPersonalizado>;
    /** a ordem dos campos do painel (todos os ids) */
    ordenarCampos(painelId: string, ids: string[]): Promise<T.CampoPersonalizado[]>;
    /** incluir uma opção numa lista do painel ali mesmo (2.0.3, só nas listas que incluem na hora: a Indicação) */
    incluirOpcaoDoCampo(campoId: string, d: T.OpcaoIncluirEntrada): Promise<T.OpcaoDoCampo>;
    /** as etiquetas de cada painel, com a cor (Ajustes › Etiquetas): criar, editar (o nome e a cor) e tirar a que nenhum chamado do painel usa */
    etiquetas(): Promise<T.EtiquetaDoCatalogo[]>;
    criarEtiqueta(d: T.EtiquetaGravarEntrada): Promise<T.EtiquetaDoCatalogo>;
    editarEtiqueta(id: string, d: T.EtiquetaEditarEntrada): Promise<T.EtiquetaDoCatalogo>;
    /** o seletor de etiquetas edita pelo painel e o nome de agora (`de`): as opções da tela não levam o id */
    editarEtiquetaPeloNome(d: T.EtiquetaEditarPeloNomeEntrada): Promise<T.EtiquetaDoCatalogo>;
    removerEtiqueta(id: string): Promise<{ ok: true }>;
    ajustesPrazos(): Promise<T.AjustesPrazos>;
    salvarPrazos(a: T.AjustesPrazos): Promise<T.AjustesPrazos>;
    ajustesAvisos(): Promise<T.AvisosChamadosTela>;
    salvarAvisos(a: T.AvisosChamadosEntrada): Promise<T.AvisosChamadosTela>;
    /** os modelos aprovados (templates) do número oficial, lidos do LineChat com a chave guardada */
    modelosDoLineChat(): Promise<T.ModelosDoLineChat>;
    /** manda uma mensagem de teste para uma pessoa da equipe (ou um número) */
    /** o teste do WhatsApp; com `evento`, o exemplo da mensagem daquele aviso (a `modelo` como está na tela), pelo número da equipe */
    testarAvisos(d: { de?: 'cliente' | 'equipe'; userId?: string; numero?: string; evento?: EventoAviso; modelo?: string }): Promise<{ ok: boolean; mensagem: string }>;
    agendados(): Promise<T.Agendado[]>;
    salvarAgendado(id: string | null, d: T.AgendadoGravarEntrada): Promise<T.Agendado>;
    removerAgendado(id: string): Promise<{ ok: boolean }>;
    /** cria o chamado do agendado agora (sem mudar a próxima vez) */
    rodarAgendado(id: string): Promise<{ codigo: string }>;
    // ---- as integrações (a administração) ----
    integracoes(): Promise<T.IntegracoesTela>;
    /** o segredo da assinatura só volta ao criar (ou ao pedir um novo) */
    salvarWebhook(id: string | null, d: T.WebhookGravarEntrada): Promise<{ webhook: T.WebhookTela; segredo: string | null }>;
    removerWebhook(id: string): Promise<{ ok: boolean }>;
    testarWebhook(id: string): Promise<{ ok: boolean; mensagem: string }>;
    /** a chave aparece uma vez, aqui */
    criarChave(nome: string): Promise<{ chave: T.ChaveApiTela; valor: string }>;
    revogarChave(id: string): Promise<{ ok: boolean }>;
    salvarSites(sites: string[]): Promise<{ sites: string[] }>;
    salvarLinkConversa(linkConversa: string): Promise<{ linkConversa: string }>;
    /** os ajustes da NIA (2.1): o botão da ficha e as etiquetas de pedir, de pronto e de erro */
    niaAjustes(): Promise<T.AjustesDaNia>;
    salvarNia(d: T.AjustesDaNiaEntrada): Promise<T.AjustesDaNia>;
    /** o mapa do robô do LineChat (2.0.1) e o último pedido dele */
    robo(): Promise<T.RoboTela>;
    salvarMapaDoRobo(mapa: T.MapaDoRoboEntrada): Promise<T.MapaDoRobo>;
    /**
     * "Como fica": o chamado que o pedido abriria com este mapa (sem abrir nada e sem salvar); `endereco`
     * são os parâmetros do endereço do pedido (?setor=…), sem a chave
     */
    experimentarRobo(mapa: T.MapaDoRoboEntrada, corpo: unknown, endereco?: Record<string, string>): Promise<T.PreviaDoRobo>;
  };
  /**
   * O calendário (Patch 2.0.1, decisão 0049): as visitas, as viradas, as folgas e os home offices de cada
   * equipe. Quem vê um evento é quem vê um dos painéis dele (a regra dos chamados).
   */
  calendario: {
    /** os tipos, os painéis que a pessoa vê (com quem vê cada um), as pessoas e o que ela pode fazer */
    opcoes(): Promise<CalendarioOpcoes>;
    /** os eventos que a pessoa vê e que tocam o período (AAAA-MM-DD) */
    eventos(de: string, ate: string): Promise<EventoDoCalendario[]>;
    /** os eventos ligados a um chamado (a ficha do chamado) */
    doChamado(chamadoId: string): Promise<EventoDoCalendario[]>;
    criar(d: EventoGravarEntrada): Promise<EventoDoCalendario>;
    /** os painéis que a pessoa não vê ficam como estavam */
    alterar(id: string, d: EventoGravarEntrada): Promise<EventoDoCalendario>;
    /** o Feito, o Cancelar e o voltar a Agendado, sem abrir a janela */
    situacao(id: string, situacao: SituacaoDoEvento): Promise<EventoDoCalendario>;
    /** vai para a lixeira (volta pela Administração › Lixeira) */
    remover(id: string): Promise<{ ok: boolean }>;
    /** só quem cuida dos chamados; o tipo com evento não sai: desativa */
    salvarTipos(tipos: TipoDeEvento[]): Promise<{ tipos: TipoDeEvento[] }>;
  };
  /**
   * O Simulador do Comercial (Patch 2.0.2, decisão 0052): a conta de uma venda antes de fechar. Quem tem o
   * Comercial vê tudo; quem também trabalha nas negociações cria e muda; os Ajustes, quem cuida dos painéis.
   */
  simulador: {
    /** os Ajustes (a tabela de custos, os modelos, o imposto, o sinal, o prazo) e o que a pessoa pode fazer */
    opcoes(): Promise<SimuladorOpcoes>;
    /** as simulações, da mexida mais recente para a mais antiga, com o cenário principal resumido */
    listar(): Promise<SimulacaoNaLista[]>;
    ler(id: string): Promise<Simulacao>;
    /** as simulações ligadas a uma negociação (a ficha dela) */
    daNegociacao(negociacaoId: string): Promise<SimulacaoDaNegociacao[]>;
    criar(d: SimulacaoGravarEntrada): Promise<Simulacao>;
    /** a negociação que a pessoa não vê fica como estava (ela manda o mesmo id que leu) */
    alterar(id: string, d: SimulacaoGravarEntrada): Promise<Simulacao>;
    /** a cópia ("… (cópia)"), com os mesmos cenários */
    duplicar(id: string): Promise<Simulacao>;
    /** vai para a lixeira (volta pela Administração › Lixeira) */
    remover(id: string): Promise<{ ok: boolean }>;
    /** a planilha do Excel, com as fórmulas (o que está salvo); fica na auditoria */
    planilha(id: string): Promise<{ bytes: Uint8Array; nome: string }>;
    /** só quem cuida dos painéis; as simulações já feitas não mudam */
    salvarAjustes(a: AjustesDoSimuladorEntrada): Promise<AjustesDoSimulador>;
  };
  /**
   * Trazer do Helena (Patch 2.0.3, decisão 0054): o painel de vendas do Helena, com o histórico, num painel de
   * Vendas do Gestor. Só quem importa e cuida dos painéis.
   */
  helena: {
    /** os painéis do Helena (pela chave do LineChat) e os painéis de Vendas do Gestor que podem receber */
    opcoes(): Promise<OpcoesDoTrazerDoHelena>;
    /** começa a ler (os cards e o histórico de cada um): roda por fora, e a tela acompanha */
    ler(painelId: string): Promise<LeituraDoHelenaNaTela>;
    leitura(id: string): Promise<LeituraDoHelenaNaTela>;
    /**
     * completa a leitura com a planilha do Helena (2.1.1): a Conclusão que a chave de API não lê. O link do
     * Google Planilhas ou o texto do .csv; nada é gravado
     */
    planilha(id: string, entrada: PlanilhaParaALeitura): Promise<LeituraDoHelenaNaTela>;
    /** o que vai acontecer (`destino` nulo = um painel de Vendas novo): nada é gravado */
    previa(id: string, destino: string | null): Promise<PreviaDoHelena>;
    /** grava o que a prévia mostrou; de novo, atualiza o que já veio */
    trazer(id: string, destino: string | null): Promise<ResultadoDoTrazerDoHelena>;
  };
  admin: {
    users(): Promise<T.User[]>;
    createUser(d: Record<string, unknown>): Promise<T.User>;
    updateUser(id: string, d: Record<string, unknown>): Promise<T.User>;
    roles(): Promise<T.Role[]>;
    permissions(): Promise<Array<{ key: string; label: string }>>;
    createRole(d: Record<string, unknown>): Promise<T.Role>;
    updateRole(id: string, d: Record<string, unknown>): Promise<T.Role>;
    removeRole(id: string): Promise<{ ok: boolean }>;
    catalog(type: string): Promise<T.CatalogItem[]>;
    createCatalogItem(type: string, name: string): Promise<T.CatalogItem>;
    updateCatalogItem(type: string, id: string, d: Record<string, unknown>): Promise<T.CatalogItem>;
    products(): Promise<T.Product[]>;
    createProduct(d: { code: string; name: string; color: string; description?: string | null }): Promise<T.Product>;
    updateProduct(id: string, d: Record<string, unknown>): Promise<T.Product>;
    removeProduct(id: string): Promise<{ ok: boolean }>;
    upsertModule(productId: string, d: Record<string, unknown>): Promise<T.ProductModule>;
    removeModule(productId: string, moduleId: string): Promise<{ ok: boolean }>;
    audit(q: Record<string, unknown>): Promise<T.Page<T.AuditItem>>;
    trash(): Promise<T.TrashItem[]>;
    restore(type: string, id: string): Promise<{ ok: boolean }>;
  };
};

export const IS_DEMO = import.meta.env.VITE_DEMO === '1';

export { API_BASE };

/**
 * Monta o endereço de uma imagem (logo do cliente, foto do modelo): o servidor devolve um
 * caminho relativo à API ("clients/<id>/logo?v=…"); a demonstração devolve a imagem embutida ("data:…").
 */
export function logoSrc(logoUrl: string | null | undefined): string | null {
  if (!logoUrl) return null;
  if (/^(data:|blob:|https?:)/.test(logoUrl)) return logoUrl;
  return `${API_BASE}/${logoUrl.replace(/^\//, '')}`;
}

let apiImpl: Api;
if (IS_DEMO) {
  const { demoApi } = await import('./demo.js');
  apiImpl = demoApi;
} else {
  const { realApi } = await import('./client.js');
  apiImpl = realApi;
}
export const api: Api = apiImpl;
