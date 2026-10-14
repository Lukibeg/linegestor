/**
 * OS DADOS DE EXEMPLO DOS CHAMADOS NA PRÉVIA (Patch 2.0, decisão 0047) — o que o Luan vê ao abrir o
 * módulo: a equipe, a árvore de assuntos da equipe (já arrumada em 3 níveis), as respostas prontas, os
 * agendados e uns 50 chamados com a vida inteira de cada um.
 *
 * Os chamados não estão escritos "prontos" (com etapa, datas e histórico à mão): cada um é uma história
 * — quem abriu, quando assumiu, para quem escalonou e por quê, o que anotou, quando resolveu — que o
 * `demo-atendimento.ts` vive de novo pelas mesmas funções da tela, com o relógio dos chamados rodando
 * entre os passos. O histórico, a trajetória, os prazos e os avisos saem das regras, e não da mão de
 * quem escreveu o exemplo: se uma história pedir algo que a regra não deixa (resolver sem a causa, por
 * exemplo), ela não passa — e o teste da prévia acusa.
 *
 * As horas são em MINUTOS DE ATENDIMENTO (o calendário dos Ajustes: segunda a sexta, das 8h às 18h,
 * sábado até o meio-dia): `idade` é há quanto tempo o chamado foi aberto, contando para trás a partir
 * de agora; `aos` é quando cada passo aconteceu, contando da abertura. Assim a prévia aberta num
 * sábado à noite ou numa terça de manhã mostra os mesmos chamados vencidos, perto de vencer e no prazo.
 *
 * Os telefones são fictícios ((71) 99999-…): na prévia nada é enviado, mas nenhum número de verdade fica
 * escrito aqui.
 */
import type { Alcance, CorEtiqueta, Gravidade, ModeloAprovado, ModeloDoLineChat, Prioridade, RegraAgendado, TipoChamado, TipoLigacaoChamado } from '@gestor/shared';

// =====================================================================
//  A EQUIPE
// =====================================================================

export type Pessoa = 'luan' | 'lucio' | 'marina' | 'bruno' | 'camila' | 'diego';

/** Quem é quem (pelo e-mail de entrada da prévia; o Luan, o Lúcio e a Marina já existem nela). */
export const EMAIL_DA_PESSOA: Record<Pessoa, string> = {
  luan: 'admin@gestor.local', lucio: 'tecnico@gestor.local', marina: 'operador@gestor.local',
  bruno: 'bruno@gestor.local', camila: 'camila@gestor.local', diego: 'diego@gestor.local',
};

/** As pessoas que entram na prévia com o módulo (os mesmos nomes dos chamados do LineChat da prévia). */
export const EQUIPE_NOVA: Array<{ nome: string; email: string; papel: 'tecnico' | 'operador' }> = [
  { nome: 'Bruno Teixeira', email: 'bruno@gestor.local', papel: 'tecnico' },
  { nome: 'Camila Duarte', email: 'camila@gestor.local', papel: 'operador' },
  { nome: 'Diego Farias', email: 'diego@gestor.local', papel: 'tecnico' },
];

/** O WhatsApp de cada pessoa nos avisos (fictício: na prévia nada sai). */
export const WHATSAPP_DA_EQUIPE: Record<Pessoa, string> = {
  luan: '5571999990101', lucio: '5571999990102', marina: '5571999990103', bruno: '5571999990104', camila: '5571999990105', diego: '5571999990106',
};
export const NUMERO_DA_EQUIPE = '5571999990100';

/**
 * Os modelos aprovados do número oficial, como o LineChat devolve (o "Buscar os modelos" dos Ajustes,
 * 2.0: o pedido do Luan — "vou usar o meu WhatsApp oficial, então temos que usar os templates"). Os
 * ids são de exemplo; os nomes e textos imitam os da Meta (o texto com as variáveis {{…}}).
 */
export const MODELOS_DO_LINECHAT: ModeloDoLineChat[] = [
  {
    id: '6b1f2c9e-3d4a-4b7e-9c10-2a8e5f7d1c01', nome: 'ticket_atualizacao', categoria: 'Utilidade', tipoArquivo: 'UNDEFINED', rodape: 'Ingline Systems',
    // o corpo do modelo pode ter quebra de linha (a variável é que não pode)
    texto: 'Olá, {{nome}}! Temos uma novidade sobre o seu chamado {{chamado}}:\n\n{{mensagem}}\n\nSe precisar, é só responder por aqui.',
    variaveis: ['nome', 'chamado', 'mensagem'],
  },
  {
    id: '6b1f2c9e-3d4a-4b7e-9c10-2a8e5f7d1c02', nome: 'ticket_aberto', categoria: 'Utilidade', tipoArquivo: 'UNDEFINED', rodape: null,
    texto: 'Olá, {{1}}! Abrimos o chamado {{2}} para o seu atendimento. Qualquer novidade, avisamos por aqui.',
    variaveis: ['1', '2'],
  },
  {
    id: '6b1f2c9e-3d4a-4b7e-9c10-2a8e5f7d1c03', nome: 'manutencao_programada', categoria: 'Utilidade', tipoArquivo: 'IMAGE', rodape: 'Ingline Systems',
    texto: 'Olá, {{1}}! Haverá uma manutenção programada em {{2}}. Durante a janela, as ligações podem cair por alguns minutos.',
    variaveis: ['1', '2'],
  },
];
/** O modelo que a prévia já traz escolhido (o de atualização do chamado, com as variáveis ligadas ao chamado). */
export const MODELO_ESCOLHIDO: ModeloAprovado = {
  id: MODELOS_DO_LINECHAT[0]!.id, nome: MODELOS_DO_LINECHAT[0]!.nome, texto: MODELOS_DO_LINECHAT[0]!.texto, tipoArquivo: 'UNDEFINED', arquivo: '',
  variaveis: [{ nome: 'nome', valor: '{contato}' }, { nome: 'chamado', valor: '{codigo}' }, { nome: 'mensagem', valor: '{texto}' }],
};

// =====================================================================
//  OS ASSUNTOS
// =====================================================================

/** A lista da equipe, do jeito que ela é escrita ("Ramal - Configuração - Criação"): vira a árvore pela `lerListaDeAssuntos`. */
export const LISTA_DE_ASSUNTOS_DO_SUPORTE = `Ramal - Configuração - Identidade
Ramal - Configuração - Criação
Ramal - Configuração - Exclusão
Ramal - Configuração - WebRTC
Ramal - Configuração - Outros
Ramal - Incidente - Sem serviço
Ramal - Incidente - WebRTC
Equipamentos - Solicitação - Headset
Equipamentos - Solicitação - Telefone
Equipamentos - Solicitação - Troca
Equipamentos - Ajustes e configurações
SBC e Tronco - Configuração - Ativação
SBC e Tronco - Configuração - Rota de entrada
SBC e Tronco - Configuração - Rota de saída
SBC e Tronco - Configuração - Apontamento de IP
Operadora - Incidente - DID de entrada
Operadora - Incidente - DID de saída
Operadora - Incidente - Canais
Infraestrutura do cliente - Rede - Energia
Infraestrutura do cliente - Rede - Interna
Infraestrutura do cliente - Rede - Externa
Infraestrutura do cliente - Periféricos
Infraestrutura do cliente - Recursos
Fortics - Incidente
Fortics - Solicitação
Centrais terceiras - Configuração
Centrais terceiras - Incidente
LinePBX - Configuração - URA
LinePBX - Configuração - Horários de funcionamento
LinePBX - Configuração - Dial plan
LinePBX - Configuração - Firewall
LinePBX - Incidente - Erro de firewall
LinePBX - Incidente - Processos travados
LinePBX - Incidente - Certificado
Filas - Configuração - Agentes
Filas - Configuração - Geral
Filas - Configuração - Anúncios
Filas - Incidente - Distribuição de atendimentos
Relatórios - LineReports - Ativação
Relatórios - LineReports - Criação de logins
Relatórios - LineReports - Erro de exportação
Relatórios - LineReports - Erro de visualização
Relatórios - LineChat - Solicitação
FOP2 - Configuração - Credenciais
FOP2 - Configuração - Logins
FOP2 - Configuração - Grupos e permissões
FOP2 - Incidente - Falha massiva
FOP2 - Incidente - Erro de pausa
FOP2 - Incidente - Callback
Omniboard - Configuração - Credenciais
Omniboard - Configuração - Logins
Omniboard - Configuração - Grupos e permissões
Omniboard - Incidente - Falha massiva
Omniboard - Incidente - Transferência
Omniboard - Incidente - Sincronismo de status
BM - Configuração - Conta do WhatsApp
BM - Incidente - Meio de pagamento`;

/** O que a equipe já preencheu em alguns assuntos: a descrição, o checklist e o de-para (os nomes antigos do LineChat). */
export const DETALHES_DOS_ASSUNTOS: Array<{ caminho: string; descricao?: string; checklist?: string[]; dePara?: string[]; ativo?: boolean }> = [
  { caminho: 'Ramal', descricao: 'Tudo do ramal: criar, configurar e quando ele para de funcionar.' },
  {
    caminho: 'Ramal › Configuração › Criação', descricao: 'Ramal novo (um ou vários) pedido pelo cliente.',
    checklist: ['Criar o ramal no LinePBX', 'Testar ligação interna', 'Mandar o login ao cliente'], dePara: ['Ramal - Criação'],
  },
  { caminho: 'Ramal › Configuração › Identidade', descricao: 'O nome e o número que aparecem nas ligações.' },
  { caminho: 'Ramal › Configuração › Outros', dePara: ['Ramal - Configuração'] },
  {
    caminho: 'Ramal › Incidente › Sem serviço', descricao: 'O ramal não toca, não liga ou está mudo.',
    checklist: ['Conferir o registro do ramal no LinePBX', 'Pedir ao cliente para reiniciar o aparelho', 'Fazer uma ligação de teste'],
    dePara: ['LinePBX - Ramal mudo', 'Ramal - Telefone Sem Serviço'],
  },
  {
    caminho: 'Operadora › Incidente › DID de entrada', descricao: 'As ligações para o número do cliente não chegam.',
    checklist: ['Ligar para o número do cliente', 'Conferir a rota de entrada no SBC', 'Abrir o protocolo na operadora'], dePara: ['Tronco - Queda'],
  },
  { caminho: 'SBC e Tronco › Configuração › Rota de entrada', dePara: ['Tronco - Configuração Rota de Entrada/Saída'] },
  {
    caminho: 'LinePBX › Configuração › URA', descricao: 'Os áudios e os menus da URA.',
    checklist: ['Receber o áudio do cliente', 'Subir o áudio no LinePBX', 'Ligar para a URA e ouvir'], dePara: ['URA - Ajuste'],
  },
  { caminho: 'Filas › Configuração › Geral', dePara: ['LinePBX - Fila - Configuração'] },
  { caminho: 'Filas › Incidente › Distribuição de atendimentos', dePara: ['LinePBX - Fila - Falha'] },
  { caminho: 'FOP2 › Incidente › Erro de pausa', dePara: ['LinePBX Web - Erro Pausa'] },
  { caminho: 'Omniboard › Configuração › Credenciais', dePara: ['Omniboard - configuração'] },
  { caminho: 'Relatórios › LineReports › Erro de visualização', dePara: ['Relatórios - Ajuste'] },
  { caminho: 'Infraestrutura do cliente', descricao: 'Rede, energia e aparelhos do próprio cliente (não é falha da Ingline).' },
  { caminho: 'Infraestrutura do cliente › Rede › Interna', dePara: ['Falha Infraestrutura Cliente'] },
  { caminho: 'Fortics › Solicitação', descricao: 'A Fortics é legado: só para os clientes antigos.', ativo: false },
];

// =====================================================================
//  OS CAMPOS DE CADA PAINEL (Ajustes › Campos)
// =====================================================================

/**
 * O Desenvolvimento não usa assunto nem operadora (o pedido do Luan na prévia: "pode ter algum painel
 * que não tenha assuntos e sim outro campo personalizado"): no lugar, o Sistema (obrigatório para abrir),
 * a Versão publicada (pedida para entrar em Entregue), a Previsão de entrega e o Como reproduzir. O
 * Suporte usa todos os do sistema e ganhou a Responsabilidade (de quem era a falha, para os relatórios).
 */
export const DESLIGADOS_NO_DESENVOLVIMENTO = ['assunto', 'alcance', 'operadoras'] as const;
/** O Suporte usa todos, menos o alcance ("não precisa desse alcance por enquanto", o Luan na prévia). */
export const DESLIGADOS_NO_SUPORTE = ['alcance'] as const;
export const CAMPOS_DE_EXEMPLO: Array<{
  painel: 'SUP' | 'DEV'; nome: string; tipo: 'texto' | 'texto_longo' | 'numero' | 'data' | 'sim_nao' | 'lista' | 'lista_varios';
  dica?: string; opcoes?: string[]; paraAbrir?: boolean; etapas?: ChaveEtapa[];
}> = [
  {
    painel: 'SUP', nome: 'Responsabilidade', tipo: 'lista', opcoes: ['Ingline', 'Cliente', 'Operadora', 'Fornecedor'],
    dica: 'De quem era a falha (para os relatórios).',
  },
  {
    painel: 'DEV', nome: 'Sistema', tipo: 'lista', paraAbrir: true, opcoes: ['LinePBX', 'LineChat', 'LineReports', 'Gestor', 'Integrações e n8n', 'Servidores'],
    dica: 'Onde está o que precisa de programação.',
  },
  { painel: 'DEV', nome: 'Como reproduzir', tipo: 'texto_longo', dica: 'os passos para ver o problema acontecer' },
  { painel: 'DEV', nome: 'Versão publicada', tipo: 'texto', etapas: ['entregue'], dica: 'A versão em que a correção ou a melhoria foi publicada.' },
  { painel: 'DEV', nome: 'Previsão de entrega', tipo: 'data' },
];

// =====================================================================
//  AS RESPOSTAS PRONTAS E OS AGENDADOS
// =====================================================================

export type ChaveEtapa = 'novo' | 'n1' | 'n2' | 'n3' | 'dev' | 'observacao' | 'resolvido' | 'fechado' | 'analise' | 'desenvolvimento' | 'teste' | 'entregue';

export const RESPOSTAS_PRONTAS: Array<{
  nome: string; texto: string; painel: 'SUP' | null;
  acao: { avisarCliente?: boolean; etapa?: ChaveEtapa; esperar?: 'cliente' | 'operadora' | 'nada'; etiqueta?: string; assumir?: boolean };
}> = [
  {
    nome: 'Pedir teste ao cliente', painel: null, acao: { avisarCliente: true, esperar: 'cliente' },
    texto: 'Olá, {contato}! Fizemos o ajuste no seu chamado {codigo}. Pode testar e nos contar se funcionou?',
  },
  {
    nome: 'Escalonar para o N2 (sem acesso)', painel: 'SUP', acao: { etapa: 'n2' },
    texto: 'Escalonado para o N2: o N1 não tem acesso ao servidor (ou ao SBC) do cliente para seguir.',
  },
  {
    nome: 'Aguardando a operadora', painel: null, acao: { esperar: 'operadora' },
    texto: 'Abrimos o chamado na operadora e estamos acompanhando. Avisamos o cliente assim que houver retorno.',
  },
  {
    nome: 'Resolvido: ramal reconfigurado', painel: 'SUP', acao: { etapa: 'resolvido' },
    texto: 'Reconfiguramos o ramal e fizemos uma ligação de teste com o cliente: está funcionando.',
  },
];

export type AgendadoDeExemplo = {
  chave: string; titulo: string; relato: string; cliente: string | null; responsavel: Pessoa | null; prioridade: Prioridade | null;
  checklist: string[]; regra: RegraAgendado;
  /** já rodou (na última vez que a regra mandava): o chamado dele está entre os exemplos */
  rodou: boolean;
};

export const AGENDADOS_DE_EXEMPLO: AgendadoDeExemplo[] = [
  {
    chave: 'dids', titulo: 'Verificar os DIDs em uso', cliente: 'VoiceNet', responsavel: 'lucio', prioridade: 'baixa',
    relato: 'Todo mês: conferir os DIDs alocados contra o uso de verdade e a fatura da Algar e da VC1.',
    checklist: ['Exportar a lista de DIDs em uso', 'Conferir com a fatura das operadoras', 'Liberar os DIDs sem uso'],
    regra: { frequencia: 'mensal', hora: '09:00', dias: [], diaDoMes: 15, data: null, soDiasDeAtendimento: false },
    rodou: false,
  },
  {
    chave: 'backups', titulo: 'Conferir os backups dos PABX', cliente: 'Ingline Systems', responsavel: 'lucio', prioridade: null,
    relato: 'Rotina de toda segunda: conferir se o backup de cada PABX rodou na última semana e testar a restauração de um deles.',
    checklist: ['Abrir o painel de backups', 'Conferir o backup de cada PABX', 'Testar a restauração de um backup', 'Anotar os que falharam'],
    regra: { frequencia: 'semanal', hora: '08:30', dias: [1], diaDoMes: null, data: null, soDiasDeAtendimento: false },
    rodou: true,
  },
];

// =====================================================================
//  OS CHAMADOS
// =====================================================================

export type Contato = [nome: string | null, telefone: string];

/** Os campos do chamado pelos nomes que a pessoa vê (o cliente, o caminho do assunto, o código do produto…). */
export type DadosDoExemplo = {
  titulo?: string; tipoChamado?: TipoChamado; relato?: string; descricao?: string; cliente?: string; contato?: Contato; sessao?: string;
  assunto?: string; tipo?: string; gravidade?: Gravidade; alcance?: Alcance; prioridade?: Prioridade; motivoPrioridade?: string;
  produtos?: string[]; operadoras?: string[]; etiquetas?: string[]; responsavel?: Pessoa;
  /** os campos do painel, pelo nome do campo e da opção ({ Sistema: 'LineReports' }) */
  campos?: Record<string, string | number | boolean | string[]>;
  /** a chave de outro exemplo */
  pai?: string; incidentes?: string[];
  /**
   * O que a IA "leu" na conversa do robô e sugeriu (só na prévia, que não tem IA de verdade): a
   * conversa inteira do WhatsApp não mora na prévia, então a sugestão vem escrita aqui, como uma IA
   * responderia. Os caminhos de assunto e os produtos precisam existir (o `lerSugestaoDaIa` confere).
   */
  ia?: IaDoExemplo;
};
export type IaDoExemplo = {
  titulo: string; relato: string; descricao: string; assunto: string; tipo: string; gravidade: Gravidade | ''; alcance: Alcance | '';
  produtos: string[]; etiquetas: string[]; resumo: string;
  /** quantas letras tinha a conversa (a conta do uso do mês) */
  letras: number;
};
export type DadosAlterarExemplo = Omit<DadosDoExemplo, 'tipoChamado' | 'sessao' | 'pai' | 'incidentes'> & {
  solucao?: string; causa?: string; contorno?: string; validacao?: string;
};

/**
 * Um passo da história. `aos`: minutos de atendimento depois da abertura. Nos textos, `{#chave}` vira o
 * código do chamado de exemplo com essa chave, e `{LC}` vira um card antigo da cópia do LineChat da prévia.
 */
export type Passo =
  | { aos: number; faz: 'assumir'; por: Pessoa }
  | { aos: number; faz: 'mover'; para: ChaveEtapa; por: Pessoa; motivo?: string; responsavel?: Pessoa | null }
  | { aos: number; faz: 'alterar'; por: Pessoa; dados: DadosAlterarExemplo }
  | { aos: number; faz: 'anotar'; por: Pessoa; texto: string; foto?: string }
  | { aos: number; faz: 'esperar'; por: Pessoa; tipo: 'cliente' | 'operadora' | null; motivo?: string }
  | { aos: number; faz: 'tempo'; por: Pessoa; minutos: number; nota?: string }
  | { aos: number; faz: 'marcar'; por: Pessoa; quantos: number }
  | { aos: number; faz: 'operadora'; por: Pessoa; operadora: string; protocolo: string; cobrarACadaHoras?: number; prometidoEmHoras?: number; nota?: string }
  | { aos: number; faz: 'cobrar' | 'fecharProtocolo'; por: Pessoa; texto: string }
  | { aos: number; faz: 'avisarCliente'; por: Pessoa; texto: string }
  | { aos: number; faz: 'resposta'; por: Pessoa; resposta: string }
  | { aos: number; faz: 'ligar'; por: Pessoa; com: string; tipo: TipoLigacaoChamado }
  | { aos: number; faz: 'observar'; por: Pessoa }
  | { aos: number; faz: 'clienteRespondeu'; texto: string };

export type Exemplo = {
  chave: string;
  painel: 'SUP' | 'DEV';
  /** há quantos minutos de atendimento foi aberto; `agendado` = na última vez em que o agendado rodou */
  idade: number | { agendado: string };
  /** quem abriu: uma pessoa, o robô do LineChat (com a chave de API) ou o agendado (o próprio Gestor) */
  abre: Pessoa | 'robo' | 'agendado';
  dados: DadosDoExemplo;
  passos?: Passo[];
};

// os contatos dos clientes (os telefones são fictícios); o cargo de cada um mora na aba Contatos do cliente
const MARIA: Contato = ['Maria Souza', '(71) 99999-2010'];
const JULIANA: Contato = ['Juliana Prates', '(71) 99999-2030'];
const CARLOS: Contato = ['Carlos Menezes', '(71) 99999-3321'];
const RENATA: Contato = ['Renata Lopes', '(71) 99999-4455'];
const FABIO: Contato = ['Dr. Fábio Nunes', '(71) 99999-4566'];
const RICARDO_ROBO: Contato = ['Ricardo Prado', '(71) 99999-5566'];
const FERNANDA: Contato = ['Fernanda Rocha', '(71) 99999-6677'];
const ANTONIO: Contato = ['Antônio Reis', '(71) 99999-7788'];
const SERGIO: Contato = ['Sérgio Almeida', '(71) 99999-8899'];
const PAULO: Contato = ['Eng. Paulo Matos', '(71) 99999-9900'];
const PATRICIA: Contato = ['Patrícia Gomes', '(71) 99999-0011'];
const JOANA_ROBO: Contato = ['Joana Silva', '(71) 99999-1122'];
const RAFAEL: Contato = ['Rafael (não disse a empresa)', '(71) 99999-2233'];

const AURORA = 'Clínica Aurora';
const NORTE = 'Distribuidora Norte';
const HOSPITAL = 'Hospital Vale Verde';
const BOMPRECO = 'Supermercado Bom Preço';
const EXAME = 'Laboratório Exame Certo';
const HORIZONTE = 'Construtora Horizonte';
const VIVERBEM = 'Home Care Viver Bem';

/**
 * Os contatos dos clientes (a aba Contatos, 2.0, o pedido do Luan na prévia): os mesmos dos chamados de
 * exemplo, com o cargo. Os do robô (Ricardo, Joana, Rafael) ficam de fora: o robô abre sem saber o
 * cliente. Uma ex-recepcionista desativada, para a tela ter o exemplo. Os e-mails são de exemplo.
 */
/**
 * As cores das etiquetas dos exemplos (2.0, o pedido do Luan na prévia: escolher a cor ao criar). As que
 * não estão aqui nasceram cinza nos chamados (como as do robô e das respostas prontas).
 */
export const CORES_DAS_ETIQUETAS: Array<[string, CorEtiqueta]> = [
  ['urgente', 'bad'], ['vip', 'amarelo'], ['algar', 'roxo'], ['reincidente', 'signal'], ['fop2', 'turquesa'], ['whatsapp', 'ok'], ['ramal', 'accent'],
  ['casa de apoio', 'rosa'],
];

export const CONTATOS_DOS_CLIENTES: Array<{ cliente: string; contato: Contato; cargo: string; email?: string; ativo?: boolean }> = [
  { cliente: AURORA, contato: MARIA, cargo: 'Recepção', email: 'recepcao@aurora.exemplo.com.br' },
  { cliente: AURORA, contato: JULIANA, cargo: 'Gerência' },
  { cliente: AURORA, contato: ['Lúcia Ramos', '(71) 99999-2099'], cargo: 'Recepção (saiu em agosto)', ativo: false },
  { cliente: NORTE, contato: CARLOS, cargo: 'TI', email: 'carlos@norte.exemplo.com.br' },
  { cliente: HOSPITAL, contato: RENATA, cargo: 'TI' },
  { cliente: HOSPITAL, contato: FABIO, cargo: 'Diretoria' },
  { cliente: BOMPRECO, contato: FERNANDA, cargo: 'Administrativo' },
  { cliente: BOMPRECO, contato: ANTONIO, cargo: 'Gerente da Loja Simões Filho' },
  { cliente: EXAME, contato: SERGIO, cargo: 'TI' },
  { cliente: HORIZONTE, contato: PAULO, cargo: 'Engenharia' },
  { cliente: VIVERBEM, contato: PATRICIA, cargo: 'Coordenação' },
];

/**
 * Os chamados, do mais antigo para o mais novo. O número de cada um sai da ordem em que foram abertos:
 * os 16 primeiros (fechados há duas a quatro semanas) são sempre SUP-1 a SUP-16 — o SUP-7 é o ramal da
 * recepção da Clínica Aurora que volta a falhar no fim da lista ("igual ao SUP-7"). Os mais novos podem
 * trocar de lugar com o chamado do agendado de segunda, conforme o dia em que a prévia é aberta.
 */
export const EXEMPLOS: Exemplo[] = [
  // ------------------------------------------------------------------
  //  Fechados nas últimas semanas
  // ------------------------------------------------------------------
  {
    chave: 'gravacoes', painel: 'SUP', idade: 11400, abre: 'lucio',
    dados: {
      titulo: 'Gravações de ontem não aparecem no LineReports', cliente: HOSPITAL, contato: RENATA,
      relato: 'A Renata (TI) disse que as gravações das ligações de ontem à tarde não aparecem na busca do LineReports. As de hoje aparecem.',
      assunto: 'Relatórios › LineReports › Erro de visualização', tipo: 'Incidente', gravidade: 'disfuncional', alcance: 'setor',
      produtos: ['linereports', 'linepbx'], etiquetas: ['gravação'],
    },
    passos: [
      { aos: 3, faz: 'assumir', por: 'lucio' },
      { aos: 50, faz: 'anotar', por: 'lucio', texto: 'As gravações estão no servidor; a indexação do LineReports parou às 22h. Rodei a indexação de novo.' },
      { aos: 80, faz: 'tempo', por: 'lucio', minutos: 35, nota: 'Indexação das gravações' },
      {
        aos: 95, faz: 'alterar', por: 'lucio', dados: {
          solucao: 'Rodamos de novo a indexação das gravações do dia: as 214 gravações apareceram na busca.',
          causa: 'A tarefa noturna de indexação do LineReports travou por falta de espaço em disco.',
        },
      },
      // o cliente não respondeu: o relógio fecha sozinho depois de 3 dias úteis
      { aos: 100, faz: 'mover', para: 'resolvido', por: 'lucio' },
    ],
  },
  {
    chave: 'ramais-cd', painel: 'SUP', idade: 11100, abre: 'marina',
    dados: {
      titulo: 'Criar 4 ramais para o CD de Feira de Santana', cliente: NORTE, contato: CARLOS,
      relato: 'O Carlos pediu 4 ramais para a equipe nova do CD de Feira de Santana: Ana, Bruno, Caio e Débora.',
      assunto: 'Ramal › Configuração › Criação', tipo: 'Requisição', gravidade: 'nao_se_aplica', alcance: 'setor',
      produtos: ['linepbx'],
    },
    passos: [
      { aos: 4, faz: 'assumir', por: 'marina' },
      { aos: 60, faz: 'marcar', por: 'marina', quantos: 1 },
      { aos: 75, faz: 'marcar', por: 'marina', quantos: 1 },
      { aos: 90, faz: 'tempo', por: 'marina', minutos: 45, nota: 'Criação e teste dos 4 ramais' },
      { aos: 120, faz: 'marcar', por: 'marina', quantos: 1 },
      {
        aos: 125, faz: 'alterar', por: 'marina', dados: {
          solucao: 'Criamos os ramais 4101 a 4104 com os nomes da equipe do CD e mandamos os logins por e-mail ao Carlos.',
          causa: 'Pedido do cliente: equipe nova no CD de Feira de Santana.',
        },
      },
      { aos: 130, faz: 'mover', para: 'resolvido', por: 'marina' },
      { aos: 400, faz: 'mover', para: 'fechado', por: 'marina' },
    ],
  },
  {
    chave: 'ura-outubro', painel: 'SUP', idade: 10800, abre: 'camila',
    dados: {
      titulo: 'Trocar o áudio da URA (campanha do mês)', cliente: BOMPRECO, contato: FERNANDA,
      relato: 'A Fernanda mandou o áudio novo da URA com a campanha do mês. Quer no ar a partir de segunda.',
      assunto: 'LinePBX › Configuração › URA', tipo: 'Requisição', gravidade: 'nao_se_aplica', alcance: 'empresa', produtos: ['linepbx'],
    },
    passos: [
      { aos: 5, faz: 'assumir', por: 'camila' },
      { aos: 30, faz: 'anotar', por: 'camila', texto: 'Áudio recebido por e-mail (MP3, 42 s). Converti para o formato da URA.' },
      { aos: 40, faz: 'marcar', por: 'camila', quantos: 2 },
      { aos: 60, faz: 'marcar', por: 'camila', quantos: 1 },
      { aos: 62, faz: 'alterar', por: 'camila', dados: { solucao: 'Subimos o áudio novo na URA principal e ouvimos a ligação de teste.', causa: 'Pedido do cliente: campanha do mês.' } },
      { aos: 65, faz: 'mover', para: 'resolvido', por: 'camila' },
      { aos: 300, faz: 'mover', para: 'fechado', por: 'camila' },
    ],
  },
  {
    chave: 'fop2-desligados', painel: 'SUP', idade: 10200, abre: 'marina',
    dados: {
      titulo: 'FOP2 mostra todos os ramais como desligados', cliente: AURORA, contato: JULIANA,
      relato: 'Depois da atualização de ontem, o painel do FOP2 da recepção mostra todos os ramais como desligados, mas as ligações funcionam.',
      assunto: 'FOP2 › Incidente › Falha massiva', tipo: 'Incidente', gravidade: 'disfuncional', alcance: 'setor', produtos: ['linepbx'], etiquetas: ['fop2'],
    },
    passos: [
      { aos: 4, faz: 'assumir', por: 'marina' },
      { aos: 25, faz: 'anotar', por: 'marina', texto: 'Reiniciei o FOP2 pelo painel e não voltou.' },
      { aos: 40, faz: 'mover', para: 'n2', por: 'marina', motivo: 'Precisa olhar os logs do servidor do FOP2 (o N1 não tem acesso)' },
      { aos: 43, faz: 'assumir', por: 'bruno' },
      { aos: 120, faz: 'anotar', por: 'bruno', texto: 'O FOP2 perdeu a conexão com o Asterisk depois da atualização: a senha do usuário de controle mudou.' },
      { aos: 140, faz: 'tempo', por: 'bruno', minutos: 40, nota: 'Análise dos logs e ajuste da senha do AMI' },
      {
        aos: 150, faz: 'alterar', por: 'bruno', dados: {
          solucao: 'Atualizamos a senha do usuário de controle (AMI) no FOP2 e reiniciamos o serviço: os ramais voltaram a aparecer.',
          causa: 'A atualização do LinePBX trocou a senha do usuário de controle que o FOP2 usa.',
        },
      },
      // também fecha sozinho
      { aos: 155, faz: 'mover', para: 'resolvido', por: 'bruno' },
    ],
  },
  {
    chave: 'whatsapp-meta', painel: 'SUP', idade: 9900, abre: 'camila',
    dados: {
      titulo: 'WhatsApp oficial parou de enviar mensagens', cliente: VIVERBEM, contato: PATRICIA,
      relato: 'Desde as 10h nenhuma mensagem sai pelo WhatsApp oficial; o LineChat mostra erro de pagamento.',
      assunto: 'BM › Incidente › Meio de pagamento', tipo: 'Incidente', gravidade: 'inoperancia', alcance: 'empresa', produtos: ['linechat'], etiquetas: ['whatsapp', 'meta'],
    },
    passos: [
      { aos: 2, faz: 'assumir', por: 'camila' },
      { aos: 10, faz: 'anotar', por: 'camila', texto: 'O Business Manager mostra "pagamento recusado". Pedi à Patrícia para conferir o cartão cadastrado na Meta.' },
      { aos: 12, faz: 'esperar', por: 'camila', tipo: 'cliente', motivo: 'A Patrícia vai atualizar o cartão na Meta' },
      { aos: 90, faz: 'esperar', por: 'camila', tipo: null },
      { aos: 95, faz: 'anotar', por: 'camila', texto: 'Cartão atualizado; as mensagens voltaram a sair às 11h40.' },
      {
        aos: 100, faz: 'alterar', por: 'camila', dados: {
          solucao: 'O cliente atualizou o cartão de crédito no Business Manager da Meta; os envios voltaram.',
          causa: 'O cartão cadastrado na Meta venceu e a cobrança das conversas foi recusada.',
        },
      },
      { aos: 105, faz: 'mover', para: 'resolvido', por: 'camila' },
      { aos: 200, faz: 'mover', para: 'fechado', por: 'camila' },
    ],
  },
  {
    chave: 'fila-agente-nova', painel: 'SUP', idade: 9600, abre: 'lucio',
    dados: {
      titulo: 'Agente nova não recebe ligações da fila da recepção', cliente: EXAME, contato: SERGIO,
      relato: 'O Sérgio disse que a atendente nova (ramal 2045) entra na fila, mas não recebe nenhuma ligação.',
      assunto: 'Filas › Configuração › Agentes', tipo: 'Incidente', gravidade: 'disfuncional', alcance: 'pessoa', produtos: ['linepbx'],
    },
    passos: [
      { aos: 6, faz: 'assumir', por: 'lucio' },
      { aos: 20, faz: 'anotar', por: 'lucio', texto: 'O ramal 2045 estava na fila com penalidade 5: só recebia quando todos os outros estavam ocupados.' },
      { aos: 25, faz: 'tempo', por: 'lucio', minutos: 15 },
      { aos: 28, faz: 'alterar', por: 'lucio', dados: { solucao: 'Tiramos a penalidade do ramal 2045 na fila da recepção.', causa: 'O ramal novo foi copiado de um agente de reserva, com penalidade.' } },
      { aos: 30, faz: 'mover', para: 'resolvido', por: 'lucio' },
      { aos: 250, faz: 'mover', para: 'fechado', por: 'lucio' },
    ],
  },
  {
    // o SUP-7: volta a falhar no fim da lista ("igual ao SUP-7")
    chave: 'ramal-2010', painel: 'SUP', idade: 9300, abre: 'marina',
    dados: {
      titulo: 'Ramal 2010 da recepção sem áudio', cliente: AURORA, contato: MARIA,
      relato: 'A Maria (recepção) diz que o ramal 2010 não dá áudio: ela atende e ninguém escuta nada dos dois lados.',
      assunto: 'Ramal › Incidente › Sem serviço', tipo: 'Incidente', gravidade: 'inoperancia', alcance: 'pessoa', produtos: ['linepbx'], etiquetas: ['ramal'],
    },
    passos: [
      { aos: 3, faz: 'assumir', por: 'marina' },
      { aos: 15, faz: 'marcar', por: 'marina', quantos: 1 },
      { aos: 30, faz: 'marcar', por: 'marina', quantos: 1 },
      { aos: 40, faz: 'anotar', por: 'marina', texto: 'Foto do aparelho que a Maria mandou: o cabo de rede estava solto atrás do telefone.', foto: 'foto-do-aparelho-ramal-2010.jpg' },
      { aos: 55, faz: 'marcar', por: 'marina', quantos: 1 },
      { aos: 58, faz: 'tempo', por: 'marina', minutos: 30, nota: 'Acompanhamento com a recepção' },
      {
        aos: 60, faz: 'alterar', por: 'marina', dados: {
          solucao: 'Reconfiguramos o ramal 2010 e o cabo de rede do aparelho foi trocado; ligação de teste com áudio dos dois lados.',
          causa: 'Cabo de rede do aparelho com mau contato.',
        },
      },
      { aos: 62, faz: 'mover', para: 'resolvido', por: 'marina' },
      { aos: 180, faz: 'mover', para: 'fechado', por: 'marina' },
    ],
  },
  {
    // aberto pelo robô do LineChat: o telefone ainda não era conhecido, então o cliente veio em branco
    chave: 'relatorio-mes', painel: 'SUP', idade: 9000, abre: 'robo',
    dados: {
      titulo: 'Relatório de atendimentos do WhatsApp do mês passado', contato: RICARDO_ROBO, sessao: '4d1c8a20-7b3e-4f51-9a6c-2e8b5d07c311',
      relato: 'Cliente pelo WhatsApp: "Bom dia! Preciso do relatório dos atendimentos do WhatsApp do mês passado para a reunião de sócios."',
    },
    passos: [
      { aos: 9, faz: 'assumir', por: 'camila' },
      {
        aos: 10, faz: 'alterar', por: 'camila', dados: {
          cliente: 'Escritório Prado & Lima', contato: ['Dr. Ricardo Prado', '(71) 99999-5566'], assunto: 'Relatórios › LineChat › Solicitação',
          tipo: 'Requisição', gravidade: 'nao_se_aplica', alcance: 'pessoa', produtos: ['linechat'],
        },
      },
      { aos: 11, faz: 'mover', para: 'n1', por: 'camila' },
      { aos: 60, faz: 'anotar', por: 'camila', texto: 'Relatório exportado do LineChat (PDF) e enviado ao Dr. Ricardo por e-mail.' },
      { aos: 62, faz: 'avisarCliente', por: 'camila', texto: 'Mandamos o relatório para o seu e-mail. Qualquer dúvida, é só chamar por aqui.' },
      { aos: 65, faz: 'alterar', por: 'camila', dados: { solucao: 'Exportamos o relatório de atendimentos do mês e enviamos por e-mail.', causa: 'Pedido do cliente.' } },
      { aos: 66, faz: 'mover', para: 'resolvido', por: 'camila' },
      // o "obrigado" do cliente não reabre (e nem fica registrado). (Com "Recebi, obrigado!" reabriria:
      // "recebi" não está nas palavras de agradecimento do `pareceAgradecimento`.)
      { aos: 130, faz: 'clienteRespondeu', texto: 'Ok, muito obrigado!' },
      { aos: 300, faz: 'mover', para: 'fechado', por: 'camila' },
    ],
  },
  {
    chave: 'headset-chiado', painel: 'SUP', idade: 8700, abre: 'lucio',
    dados: {
      titulo: 'Headset do call center com chiado', cliente: HOSPITAL, contato: RENATA,
      relato: 'A Renata avisou que um headset do call center está com chiado alto; a atendente não consegue trabalhar com ele.',
      assunto: 'Equipamentos › Solicitação › Troca', tipo: 'Incidente', gravidade: 'performance', alcance: 'pessoa', produtos: ['equipamentos'],
    },
    passos: [
      { aos: 5, faz: 'assumir', por: 'lucio' },
      { aos: 45, faz: 'anotar', por: 'lucio', texto: 'Foto do aparelho: o fio do microfone está descascado perto do conector.', foto: 'foto-do-headset.jpg' },
      { aos: 120, faz: 'anotar', por: 'lucio', texto: 'Levei um headset novo do estoque e trouxe o com defeito (as movimentações estão no Inventário).' },
      { aos: 125, faz: 'tempo', por: 'lucio', minutos: 60, nota: 'Visita ao hospital para a troca' },
      { aos: 130, faz: 'alterar', por: 'lucio', dados: { solucao: 'Trocamos o headset por um novo do estoque; o com defeito voltou para avaliação.', causa: 'Fio do microfone danificado.' } },
      { aos: 135, faz: 'mover', para: 'resolvido', por: 'lucio' },
      { aos: 200, faz: 'mover', para: 'fechado', por: 'lucio' },
    ],
  },
  {
    chave: 'eco-celular', painel: 'SUP', idade: 8400, abre: 'lucio',
    dados: {
      titulo: 'Ligações para celular com eco', cliente: HORIZONTE, contato: PAULO,
      relato: 'O Eng. Paulo diz que todas as ligações da construtora para celular estão com eco desde ontem; para fixo está normal.',
      assunto: 'SBC e Tronco › Configuração › Rota de saída', tipo: 'Incidente', gravidade: 'performance', alcance: 'empresa', produtos: ['voicenet'],
    },
    passos: [
      { aos: 4, faz: 'assumir', por: 'lucio' },
      { aos: 25, faz: 'anotar', por: 'lucio', texto: 'Testei para dois celulares: eco forte do nosso lado. Para fixo, normal.' },
      { aos: 35, faz: 'mover', para: 'n2', por: 'lucio', motivo: 'Precisa ajustar o codec no SBC (o N1 não tem acesso)' },
      { aos: 38, faz: 'assumir', por: 'bruno' },
      { aos: 90, faz: 'anotar', por: 'bruno', texto: 'A rota de saída para celular estava com G.729 e transcodificação dupla no SBC.' },
      { aos: 110, faz: 'tempo', por: 'bruno', minutos: 50, nota: 'Ajuste da rota de saída no SBC' },
      {
        aos: 115, faz: 'alterar', por: 'bruno', dados: {
          solucao: 'Trocamos o codec da rota de saída para G.711 e tiramos a transcodificação dupla no SBC.',
          causa: 'Codec G.729 com transcodificação dupla na rota de saída para celular.',
        },
      },
      { aos: 120, faz: 'mover', para: 'resolvido', por: 'bruno' },
      { aos: 400, faz: 'mover', para: 'fechado', por: 'bruno' },
    ],
  },
  {
    chave: 'loja-sem-energia', painel: 'SUP', idade: 7800, abre: 'marina',
    dados: {
      titulo: 'Telefones da Loja Simões Filho sem sinal', cliente: BOMPRECO, contato: ANTONIO,
      relato: 'O Antônio (gerente da Loja Simões Filho) diz que nenhum telefone da loja funciona desde cedo.',
      assunto: 'Infraestrutura do cliente › Rede › Energia', tipo: 'Incidente', gravidade: 'inoperancia', alcance: 'setor', produtos: ['linepbx'],
    },
    passos: [
      { aos: 3, faz: 'assumir', por: 'marina' },
      { aos: 20, faz: 'anotar', por: 'marina', texto: 'Nenhum ramal da loja está registrado. O Antônio disse que houve queda de luz de madrugada.' },
      { aos: 22, faz: 'esperar', por: 'marina', tipo: 'cliente', motivo: 'O cliente vai chamar o eletricista para olhar o rack' },
      { aos: 200, faz: 'esperar', por: 'marina', tipo: null },
      { aos: 205, faz: 'anotar', por: 'marina', texto: 'A energia do rack voltou; os 6 ramais registraram sozinhos.' },
      {
        aos: 210, faz: 'alterar', por: 'marina', dados: {
          solucao: 'Depois que a energia do rack voltou, os telefones registraram sozinhos; ligações de teste ok.',
          causa: 'Queda de energia no rack da loja (disjuntor desarmado).',
        },
      },
      { aos: 212, faz: 'mover', para: 'resolvido', por: 'marina' },
      { aos: 500, faz: 'mover', para: 'fechado', por: 'marina' },
    ],
  },
  {
    // a trajetória inteira: N1 → N2 → N3
    chave: 'omniboard-status', painel: 'SUP', idade: 7200, abre: 'camila',
    dados: {
      titulo: 'Status das agentes não sincroniza no Omniboard', cliente: NORTE, contato: CARLOS,
      relato: 'O Carlos diz que no Omniboard as agentes aparecem como livres mesmo em ligação, e a distribuição está errada.',
      assunto: 'Omniboard › Incidente › Sincronismo de status', tipo: 'Incidente', gravidade: 'disfuncional', alcance: 'setor', produtos: ['linepbx', 'linechat'], etiquetas: ['omniboard'],
    },
    passos: [
      { aos: 4, faz: 'assumir', por: 'camila' },
      { aos: 30, faz: 'anotar', por: 'camila', texto: 'Reiniciei a sessão das agentes; o status volta a errar depois de alguns minutos.' },
      { aos: 40, faz: 'mover', para: 'n2', por: 'camila', motivo: 'Precisa de acesso ao servidor do Omniboard', responsavel: 'lucio' },
      { aos: 150, faz: 'anotar', por: 'lucio', texto: 'O serviço de eventos do Omniboard está atrasando 2 a 3 minutos: a fila de eventos no banco está enorme.' },
      { aos: 170, faz: 'mover', para: 'n3', por: 'lucio', motivo: 'Precisa limpar e ajustar o banco do Omniboard (só o N3 tem acesso)', responsavel: 'luan' },
      { aos: 330, faz: 'anotar', por: 'luan', texto: 'Limpei a fila de eventos antigos e criei o índice que faltava: o atraso caiu para menos de 1 segundo.' },
      { aos: 340, faz: 'tempo', por: 'luan', minutos: 90, nota: 'Ajuste no banco do Omniboard' },
      {
        aos: 345, faz: 'alterar', por: 'luan', dados: {
          solucao: 'Limpamos a fila de eventos antigos e criamos o índice que faltava no banco do Omniboard; o status voltou a sincronizar na hora.',
          causa: 'Fila de eventos sem limpeza e sem índice: o Omniboard atrasava a leitura do status.',
        },
      },
      { aos: 350, faz: 'mover', para: 'resolvido', por: 'luan' },
      { aos: 700, faz: 'mover', para: 'fechado', por: 'camila' },
    ],
  },
  {
    chave: 'horario-feriado', painel: 'SUP', idade: 6600, abre: 'lucio',
    dados: {
      titulo: 'Horário especial para o feriado', cliente: EXAME, contato: SERGIO,
      relato: 'O Sérgio pediu para o laboratório atender só meio período na véspera do feriado e ficar fechado no feriado, com a mensagem gravada.',
      assunto: 'LinePBX › Configuração › Horários de funcionamento', tipo: 'Requisição', gravidade: 'nao_se_aplica', alcance: 'empresa', produtos: ['linepbx'],
    },
    passos: [
      { aos: 8, faz: 'assumir', por: 'lucio' },
      { aos: 40, faz: 'tempo', por: 'lucio', minutos: 20 },
      { aos: 45, faz: 'alterar', por: 'lucio', dados: { solucao: 'Cadastramos o horário especial e a mensagem de feriado na URA; testamos com o relógio adiantado.', causa: 'Pedido do cliente para o feriado.' } },
      { aos: 50, faz: 'mover', para: 'resolvido', por: 'lucio' },
      { aos: 52, faz: 'avisarCliente', por: 'lucio', texto: 'O horário do feriado já está configurado: na véspera, o atendimento vai até as 12h; no feriado, toca a mensagem gravada.' },
      { aos: 300, faz: 'mover', para: 'fechado', por: 'lucio' },
    ],
  },
  {
    // o pai do Suporte com o filho no Desenvolvimento (os dois já fechados: o pai fechou depois do filho)
    chave: 'exportacao-lr', painel: 'SUP', idade: 6300, abre: 'lucio',
    dados: {
      titulo: 'Exportação do LineReports dá erro com mais de 10 mil ligações', cliente: HOSPITAL, contato: RENATA,
      relato: 'A Renata tenta exportar o relatório de ligações do mês e a tela fica carregando até dar erro. Com uma semana só, funciona.',
      assunto: 'Relatórios › LineReports › Erro de exportação', tipo: 'Incidente', gravidade: 'disfuncional', alcance: 'setor', produtos: ['linereports'],
    },
    passos: [
      { aos: 5, faz: 'assumir', por: 'lucio' },
      { aos: 160, faz: 'anotar', por: 'lucio', texto: 'Reproduzi: acima de 10 mil linhas a exportação estoura o tempo. Abri o {#dev-exportacao-lr} no Desenvolvimento; enquanto isso, a Renata exporta semana a semana.' },
      { aos: 165, faz: 'alterar', por: 'lucio', dados: { contorno: 'Exportar o relatório semana a semana até a correção.' } },
      {
        aos: 1250, faz: 'alterar', por: 'lucio', dados: {
          solucao: 'A correção da exportação (no {#dev-exportacao-lr}) foi publicada; exportamos o mês inteiro com a Renata.',
          causa: 'A exportação montava o arquivo inteiro na memória e estourava o tempo acima de 10 mil linhas.',
          campos: { Responsabilidade: 'Ingline' },
        },
      },
      { aos: 1260, faz: 'mover', para: 'resolvido', por: 'lucio' },
      { aos: 1500, faz: 'mover', para: 'fechado', por: 'lucio' },
    ],
  },
  {
    chave: 'dev-exportacao-lr', painel: 'DEV', idade: 6150, abre: 'lucio',
    dados: {
      titulo: 'Corrigir a exportação de relatórios grandes no LineReports', pai: 'exportacao-lr', responsavel: 'diego',
      relato: 'Vem do {#exportacao-lr}: acima de 10 mil ligações a exportação do LineReports estoura o tempo e não baixa nada.',
      tipo: 'Correção', gravidade: 'disfuncional', alcance: 'setor', produtos: ['linereports'],
      campos: {
        Sistema: 'LineReports',
        'Como reproduzir': '1. Abrir o relatório de ligações do Hospital\n2. Escolher o mês inteiro (85 mil ligações)\n3. Exportar: depois de uns 2 minutos, a tela mostra o erro',
      },
    },
    passos: [
      { aos: 20, faz: 'assumir', por: 'diego' },
      { aos: 120, faz: 'anotar', por: 'diego', texto: 'O relatório monta o arquivo inteiro na memória. Vou mudar para gerar em partes.' },
      { aos: 125, faz: 'mover', para: 'desenvolvimento', por: 'diego' },
      { aos: 600, faz: 'mover', para: 'teste', por: 'diego' },
      { aos: 700, faz: 'anotar', por: 'diego', texto: 'Testado com 85 mil ligações do Hospital: exportou em 40 segundos.' },
      { aos: 720, faz: 'alterar', por: 'diego', dados: { solucao: 'A exportação passou a gerar o arquivo em partes (streaming); testada com 85 mil linhas.', campos: { 'Versão publicada': 'LineReports 4.2.1' } } },
      { aos: 725, faz: 'mover', para: 'entregue', por: 'diego' },
      { aos: 1050, faz: 'mover', para: 'fechado', por: 'diego' },
    ],
  },
  {
    // pelo robô: o telefone da Patrícia já era conhecido, então o cliente veio preenchido sozinho
    chave: 'ramal-plantao', painel: 'SUP', idade: 6000, abre: 'robo',
    dados: {
      titulo: 'Ramal do plantão não funciona', contato: ['Patrícia Gomes', '(71) 99999-0011'], sessao: '9b27e5d4-1f6a-4c08-b3d2-7a5e91c04f86',
      relato: 'Cliente pelo WhatsApp: "O ramal da enfermeira de plantão (305) não está funcionando, não dá sinal."',
    },
    passos: [
      { aos: 7, faz: 'assumir', por: 'camila' },
      { aos: 9, faz: 'alterar', por: 'camila', dados: { assunto: 'Ramal › Incidente › Sem serviço', tipo: 'Incidente', gravidade: 'inoperancia', alcance: 'pessoa', produtos: ['linepbx'] } },
      { aos: 40, faz: 'anotar', por: 'camila', texto: 'O ramal 305 não registra desde a troca do roteador da casa de apoio.' },
      { aos: 41, faz: 'marcar', por: 'camila', quantos: 1 },
      { aos: 60, faz: 'marcar', por: 'camila', quantos: 1 },
      { aos: 70, faz: 'marcar', por: 'camila', quantos: 1 },
      { aos: 75, faz: 'alterar', por: 'camila', dados: { solucao: 'O aparelho estava com IP fixo da faixa antiga; voltamos para DHCP e o ramal registrou.', causa: 'A troca do roteador do cliente mudou a faixa de IP da rede.', campos: { Responsabilidade: 'Cliente' } } },
      { aos: 78, faz: 'mover', para: 'resolvido', por: 'camila' },
      { aos: 82, faz: 'avisarCliente', por: 'camila', texto: 'O ramal 305 voltou a funcionar. Pode testar e nos avisar?' },
      { aos: 260, faz: 'mover', para: 'fechado', por: 'camila' },
    ],
  },
  {
    // o mesmo pedido, por telefone: duplicado do anterior
    chave: 'ramal-plantao-dup', painel: 'SUP', idade: 5985, abre: 'lucio',
    dados: {
      titulo: 'Ramal 305 do plantão sem registro', cliente: VIVERBEM, contato: PATRICIA,
      relato: 'A Patrícia ligou: o ramal 305 (plantão) está sem registro.',
      assunto: 'Ramal › Incidente › Sem serviço', tipo: 'Incidente', gravidade: 'inoperancia', alcance: 'pessoa',
    },
    passos: [
      { aos: 3, faz: 'assumir', por: 'lucio' },
      { aos: 8, faz: 'ligar', por: 'lucio', com: 'ramal-plantao', tipo: 'duplicado' },
      { aos: 10, faz: 'alterar', por: 'lucio', dados: { solucao: 'Duplicado do {#ramal-plantao}: o atendimento seguiu lá.', causa: 'Chamado aberto duas vezes (pelo WhatsApp e por telefone).' } },
      { aos: 12, faz: 'mover', para: 'fechado', por: 'lucio' },
    ],
  },

  // ------------------------------------------------------------------
  //  O Desenvolvimento
  // ------------------------------------------------------------------
  {
    chave: 'dev-importar-assuntos', painel: 'DEV', idade: 4800, abre: 'luan',
    dados: {
      titulo: 'Importar os cards antigos com a lista nova de assuntos', responsavel: 'diego', tipo: 'Melhoria', prioridade: 'baixa', campos: { Sistema: 'Gestor' }, etiquetas: ['assuntos'],
      relato: 'Quando a equipe fechar a lista nova de assuntos, importar os cards antigos do LineChat usando o de-para de cada assunto.',
    },
    passos: [
      { aos: 30, faz: 'assumir', por: 'diego' },
      { aos: 200, faz: 'anotar', por: 'diego', texto: 'O de-para já está nos Ajustes de cada assunto. Falta a lista final da equipe.' },
    ],
  },
  {
    chave: 'dev-botao-linechat', painel: 'DEV', idade: 3600, abre: 'luan',
    dados: {
      titulo: 'Botão "Abrir chamado" dentro da conversa do LineChat', responsavel: 'diego', tipo: 'Melhoria', prioridade: 'media', campos: { Sistema: 'LineChat' },
      relato: 'Pedido da equipe: um botão no menu da conversa do LineChat que abre o chamado no Gestor já com o contato e a conversa.',
    },
    passos: [
      { aos: 40, faz: 'assumir', por: 'diego' },
      { aos: 45, faz: 'observar', por: 'luan' },
      { aos: 300, faz: 'anotar', por: 'diego', texto: 'O LineChat aceita um item de menu com link. A tela de abrir chamado já entende a origem "botão"; falta montar o endereço com a sessão.' },
      { aos: 310, faz: 'mover', para: 'desenvolvimento', por: 'diego' },
      { aos: 1500, faz: 'mover', para: 'teste', por: 'diego' },
      { aos: 1800, faz: 'tempo', por: 'diego', minutos: 240, nota: 'O item de menu e o endereço com a sessão' },
      {
        aos: 1810, faz: 'alterar', por: 'diego', dados: {
          solucao: 'O item "Abrir chamado no Gestor" entrou no menu da conversa: abre a tela de abrir chamado com o contato, o telefone e a conversa (origem "botão").',
          campos: { 'Versão publicada': 'Gestor 2.0' },
        },
      },
      { aos: 1815, faz: 'mover', para: 'entregue', por: 'diego' },
      { aos: 1820, faz: 'anotar', por: 'diego', texto: 'Entregue. Luan, pode conferir na conversa de teste antes de eu fechar?' },
    ],
  },

  // ------------------------------------------------------------------
  //  A semana: a queda da Algar (o problema que junta três incidentes)
  // ------------------------------------------------------------------
  {
    chave: 'algar-bompreco', painel: 'SUP', idade: 2400, abre: 'marina',
    dados: {
      titulo: 'Ligações caindo depois de 2 minutos', cliente: BOMPRECO, contato: FERNANDA,
      relato: 'A Fernanda diz que as ligações que entram no supermercado caem sozinhas depois de uns 2 minutos, desde segunda.',
      assunto: 'Operadora › Incidente › Canais', tipo: 'Incidente', gravidade: 'intermitencia', alcance: 'empresa',
      produtos: ['voicenet'], operadoras: ['ALGAR'], etiquetas: ['algar'],
    },
    passos: [
      { aos: 4, faz: 'assumir', por: 'marina' },
      { aos: 30, faz: 'anotar', por: 'marina', texto: 'Liguei três vezes para a loja: as três caíram com 2 min e 2 s.' },
      { aos: 40, faz: 'mover', para: 'n2', por: 'marina', motivo: 'Precisa olhar o tronco no SBC' },
      { aos: 43, faz: 'assumir', por: 'bruno' },
      { aos: 120, faz: 'anotar', por: 'bruno', texto: 'O SBC mostra a sessão caindo quando renova o session timer com a Algar.' },
      {
        aos: 1700, faz: 'alterar', por: 'bruno', dados: {
          solucao: 'Aplicamos o contorno do {#algar-problema}: desligamos o session timer na rota da Algar. Sem quedas desde então.',
          causa: 'Instabilidade no enlace da Algar (ver o problema {#algar-problema}).',
          campos: { Responsabilidade: 'Operadora' },
        },
      },
      { aos: 1710, faz: 'mover', para: 'resolvido', por: 'bruno' },
      { aos: 1712, faz: 'avisarCliente', por: 'bruno', texto: 'Aplicamos uma correção no tronco e as quedas pararam. Seguimos acompanhando com a operadora.' },
    ],
  },
  {
    chave: 'algar-exame', painel: 'SUP', idade: 2100, abre: 'lucio',
    dados: {
      titulo: 'Ligações recebidas caem no meio da conversa', cliente: EXAME, contato: SERGIO,
      relato: 'O Sérgio diz que as ligações recebidas no laboratório estão caindo no meio da conversa, várias vezes por dia.',
      assunto: 'Operadora › Incidente › Canais', tipo: 'Incidente', gravidade: 'intermitencia', alcance: 'empresa',
      produtos: ['voicenet'], operadoras: ['ALGAR'], etiquetas: ['algar'],
    },
    passos: [
      { aos: 5, faz: 'assumir', por: 'lucio' },
      { aos: 20, faz: 'ligar', por: 'lucio', com: 'algar-bompreco', tipo: 'relacionado' },
      { aos: 30, faz: 'mover', para: 'n2', por: 'lucio', motivo: 'Mesmo sintoma do {#algar-bompreco}: precisa olhar o tronco no SBC' },
      { aos: 33, faz: 'assumir', por: 'bruno' },
      { aos: 1410, faz: 'alterar', por: 'bruno', dados: { solucao: 'Aplicamos o contorno do {#algar-problema} (session timer desligado na rota da Algar); o cliente vai acompanhar por dois dias.' } },
      { aos: 1420, faz: 'mover', para: 'observacao', por: 'bruno' },
    ],
  },
  {
    // o pai que não pode fechar: o filho no Desenvolvimento ainda está em teste
    chave: 'filas-zerado', painel: 'SUP', idade: 2050, abre: 'camila',
    dados: {
      titulo: 'Relatório de filas mostra o tempo de espera zerado', cliente: HOSPITAL, contato: RENATA,
      relato: 'A Renata diz que o relatório de filas do LineReports mostra o tempo médio de espera zerado em todas as filas desde o começo do mês.',
      assunto: 'Relatórios › LineReports › Erro de visualização', tipo: 'Incidente', gravidade: 'disfuncional', alcance: 'setor', produtos: ['linereports'],
    },
    passos: [
      { aos: 6, faz: 'assumir', por: 'camila' },
      { aos: 30, faz: 'mover', para: 'n2', por: 'camila', motivo: 'Precisa olhar o banco do LineReports', responsavel: 'lucio' },
      { aos: 200, faz: 'anotar', por: 'lucio', texto: 'O cálculo do tempo de espera ignora as ligações transferidas entre filas. É correção no LineReports: vou abrir o filho no Desenvolvimento.' },
      {
        aos: 260, faz: 'alterar', por: 'lucio', dados: {
          solucao: 'A correção do cálculo está no {#dev-filas-zerado}; enquanto isso, mandamos o relatório de filas corrigido por e-mail toda manhã.',
          contorno: 'Relatório de filas corrigido enviado por e-mail toda manhã, até a correção.',
        },
      },
      { aos: 265, faz: 'alterar', por: 'lucio', dados: { prioridade: 'baixa', motivoPrioridade: 'O relatório corrigido vai por e-mail todo dia enquanto o Desenvolvimento corrige.' } },
      { aos: 270, faz: 'mover', para: 'observacao', por: 'lucio' },
    ],
  },
  {
    chave: 'dev-filas-zerado', painel: 'DEV', idade: 1800, abre: 'lucio',
    dados: {
      titulo: 'Corrigir o cálculo do tempo de espera no relatório de filas', pai: 'filas-zerado', responsavel: 'diego',
      relato: 'Vem do {#filas-zerado}: o tempo médio de espera fica zerado quando a ligação passa por mais de uma fila.',
      tipo: 'Correção', gravidade: 'disfuncional', alcance: 'setor', produtos: ['linereports'], campos: { Sistema: 'LineReports' },
    },
    passos: [
      { aos: 30, faz: 'assumir', por: 'diego' },
      { aos: 200, faz: 'mover', para: 'desenvolvimento', por: 'diego' },
      { aos: 900, faz: 'anotar', por: 'diego', texto: 'Corrigido: o cálculo agora soma a espera de todas as filas por onde a ligação passou.' },
      { aos: 920, faz: 'mover', para: 'teste', por: 'diego' },
      { aos: 1000, faz: 'anotar', por: 'lucio', texto: 'Conferi com os dados de ontem do Hospital: os tempos batem com o que a Renata mediu.' },
    ],
  },
  {
    chave: 'aparelho-recepcao', painel: 'SUP', idade: 2000, abre: 'lucio',
    dados: {
      titulo: 'Telefone novo para a recepção da Loja Centro', cliente: BOMPRECO, contato: FERNANDA,
      relato: 'A Fernanda pediu mais um telefone para a recepção da Loja Centro: a recepcionista nova começa na semana que vem.',
      assunto: 'Equipamentos › Solicitação › Telefone', tipo: 'Requisição', gravidade: 'nao_se_aplica', alcance: 'setor', produtos: ['equipamentos'],
    },
    passos: [
      { aos: 6, faz: 'assumir', por: 'lucio' },
      { aos: 40, faz: 'anotar', por: 'lucio', texto: 'Separei um Grandstream GXP1610 do estoque; falta configurar o ramal 1012.' },
      { aos: 45, faz: 'tempo', por: 'lucio', minutos: 25, nota: 'Separar e testar o aparelho' },
    ],
  },
  {
    // esperando a operadora: o protocolo da Algar aberto e cobrado
    chave: 'algar-hospital', painel: 'SUP', idade: 1700, abre: 'camila',
    dados: {
      titulo: 'Ligações para o hospital caindo e às vezes sem completar', cliente: HOSPITAL, contato: FABIO,
      relato: 'O Dr. Fábio (diretoria) reclamou que as ligações para o hospital caem depois de 1 ou 2 minutos e algumas nem completam.',
      assunto: 'Operadora › Incidente › Canais', tipo: 'Incidente', gravidade: 'intermitencia', alcance: 'empresa',
      produtos: ['voicenet'], operadoras: ['ALGAR'], etiquetas: ['algar', 'vip'],
    },
    passos: [
      { aos: 3, faz: 'assumir', por: 'camila' },
      { aos: 15, faz: 'mover', para: 'n2', por: 'camila', motivo: 'Mesmo sintoma dos outros clientes da Algar' },
      { aos: 18, faz: 'assumir', por: 'bruno' },
      { aos: 25, faz: 'observar', por: 'luan' },
      {
        aos: 60, faz: 'operadora', por: 'bruno', operadora: 'ALGAR', protocolo: '2026100845123', cobrarACadaHoras: 4, prometidoEmHoras: 24,
        nota: 'Aberto pelo 0800 empresarial da Algar; prometeram retorno em 24 h.',
      },
      { aos: 300, faz: 'cobrar', por: 'bruno', texto: 'Liguei e cobrei: a Algar confirmou instabilidade no POP de Salvador.' },
      { aos: 800, faz: 'cobrar', por: 'bruno', texto: 'Cobrei de novo: a correção definitiva ficou para a próxima janela de manutenção.' },
      { aos: 900, faz: 'tempo', por: 'bruno', minutos: 70, nota: 'Testes e contato com a Algar' },
    ],
  },
  {
    // o PROBLEMA: junta os três incidentes de clientes diferentes; a causa raiz e o contorno já estão escritos
    chave: 'algar-problema', painel: 'SUP', idade: 1650, abre: 'luan',
    dados: {
      tipoChamado: 'problema', titulo: 'Quedas no tronco da Algar em Salvador', cliente: 'VoiceNet', responsavel: 'luan',
      relato: 'Três clientes nos troncos da Algar (071 Principal e 071 Hospitalar) relatam ligações caindo depois de 1 a 3 minutos, desde segunda.',
      assunto: 'Operadora › Incidente › Canais', tipo: 'Incidente', gravidade: 'intermitencia', alcance: 'empresa',
      prioridade: 'baixa', motivoPrioridade: 'O problema não tem prazo de cliente: cada incidente segue o prazo dele.',
      produtos: ['voicenet'], operadoras: ['ALGAR'], etiquetas: ['algar'],
      incidentes: ['algar-bompreco', 'algar-exame', 'algar-hospital'],
    },
    passos: [
      { aos: 2, faz: 'assumir', por: 'luan' },
      { aos: 5, faz: 'mover', para: 'n3', por: 'luan', motivo: 'Problema de operadora com vários clientes: fica com o N3 até a Algar corrigir' },
      { aos: 8, faz: 'observar', por: 'marina' },
      {
        aos: 100, faz: 'alterar', por: 'luan', dados: {
          causa: 'Instabilidade no enlace da Algar entre o POP de Salvador e o nosso SBC: a sessão SIP cai quando o session timer renova (o re-INVITE fica sem resposta).',
          contorno: 'Desligar o session timer na rota da Algar e subir a expiração do registro para 3600 s. Aplicado nos três clientes: as quedas pararam enquanto a Algar corrige.',
        },
      },
      { aos: 120, faz: 'anotar', por: 'luan', texto: 'A Algar confirmou a instabilidade no POP de Salvador (protocolo no {#algar-hospital}). A correção definitiva fica para a janela de manutenção.' },
      { aos: 130, faz: 'tempo', por: 'luan', minutos: 120, nota: 'Análise das sessões SIP no SBC com o Bruno' },
    ],
  },
  {
    chave: 'dev-alerta-backup', painel: 'DEV', idade: 1500, abre: 'lucio',
    dados: {
      titulo: 'Avisar quando o backup de um PABX falhar', responsavel: 'diego', tipo: 'Melhoria', prioridade: 'media', campos: { Sistema: 'Servidores' },
      relato: 'Hoje a conferência dos backups é manual (o agendado de toda segunda). A ideia: o servidor avisar no WhatsApp da equipe quando um backup falhar.',
    },
    passos: [
      { aos: 60, faz: 'assumir', por: 'diego' },
      { aos: 200, faz: 'mover', para: 'desenvolvimento', por: 'diego' },
      { aos: 400, faz: 'anotar', por: 'diego', texto: 'O script de backup já grava o resultado; falta mandar para o webhook do n8n quando der erro.' },
    ],
  },

  // ------------------------------------------------------------------
  //  Os abertos de agora
  // ------------------------------------------------------------------
  {
    // esperando o cliente: o prazo para
    chave: 'agentes-caem', painel: 'SUP', idade: 1300, abre: 'marina',
    dados: {
      titulo: 'Agentes caem da fila depois do almoço', cliente: NORTE, contato: CARLOS,
      relato: 'O Carlos diz que, depois do almoço, as agentes precisam entrar de novo na fila: o sistema tira todas sozinho.',
      assunto: 'Filas › Incidente › Distribuição de atendimentos', tipo: 'Incidente', gravidade: 'disfuncional', alcance: 'setor', produtos: ['linepbx'],
    },
    passos: [
      { aos: 5, faz: 'assumir', por: 'marina' },
      { aos: 60, faz: 'anotar', por: 'marina', texto: 'A pausa de almoço tira a agente da fila depois de 60 min. Mudei para 90 min.' },
      { aos: 70, faz: 'tempo', por: 'marina', minutos: 20 },
      { aos: 600, faz: 'esperar', por: 'marina', tipo: 'cliente', motivo: 'O Carlos vai testar com as agentes depois do almoço' },
    ],
  },
  {
    // pelo robô, de um telefone novo: a Camila preencheu o cliente (e o Gestor aprendeu o telefone)
    chave: 'sala3', painel: 'SUP', idade: 1290, abre: 'robo',
    dados: {
      titulo: 'Telefone da sala 3 não liga', contato: JOANA_ROBO, sessao: '2f8a6c13-95e4-4b7d-8d21-c6a0e3b5f7d9',
      relato: 'Cliente pelo WhatsApp: "O telefone da sala 3 (fisioterapia) não liga nem recebe desde ontem."',
    },
    passos: [
      { aos: 20, faz: 'assumir', por: 'camila' },
      { aos: 22, faz: 'alterar', por: 'camila', dados: { cliente: VIVERBEM, assunto: 'Ramal › Incidente › Sem serviço', tipo: 'Incidente', gravidade: 'inoperancia', alcance: 'pessoa', produtos: ['linepbx'] } },
      { aos: 23, faz: 'mover', para: 'n1', por: 'camila' },
      { aos: 25, faz: 'marcar', por: 'camila', quantos: 1 },
      { aos: 90, faz: 'anotar', por: 'camila', texto: 'O aparelho da sala 3 não acende nem a tela. Pedi à Joana para trocar a tomada; continua apagado.' },
      { aos: 95, faz: 'marcar', por: 'camila', quantos: 1 },
      { aos: 100, faz: 'avisarCliente', por: 'camila', texto: 'Vamos mandar um técnico com um aparelho reserva. Confirmamos o horário por aqui.' },
      { aos: 400, faz: 'anotar', por: 'camila', texto: 'O técnico só consegue ir quando a sala estiver livre (sem paciente).' },
    ],
  },
  {
    chave: 'apontamento-ip', painel: 'SUP', idade: 1200, abre: 'lucio',
    dados: {
      titulo: 'Apontar o IP da central nova da construtora no SBC', cliente: HORIZONTE, contato: PAULO,
      relato: 'O Eng. Paulo avisou que a construtora trocou a central telefônica (de outro fornecedor) e o IP de saída mudou para 200.165.10.45.',
      assunto: 'SBC e Tronco › Configuração › Apontamento de IP', tipo: 'Requisição', gravidade: 'nao_se_aplica', alcance: 'empresa', produtos: ['voicenet'],
    },
    passos: [
      { aos: 6, faz: 'assumir', por: 'lucio' },
      { aos: 30, faz: 'resposta', por: 'lucio', resposta: 'Escalonar para o N2 (sem acesso)' },
      { aos: 35, faz: 'alterar', por: 'lucio', dados: { responsavel: 'bruno' } },
      { aos: 300, faz: 'anotar', por: 'bruno', texto: 'Liberado o IP novo no SBC; falta o cliente testar uma ligação de saída.' },
    ],
  },
  {
    // reaberto: o cliente respondeu no Resolvido ("ainda está…")
    chave: 'fila-sac', painel: 'SUP', idade: 1100, abre: 'marina',
    dados: {
      titulo: 'Fila do SAC sem música de espera', cliente: NORTE, contato: CARLOS, responsavel: 'luan',
      relato: 'O Carlos diz que quem liga para o SAC fica no silêncio enquanto espera; antes tocava música.',
      assunto: 'Filas › Configuração › Anúncios', tipo: 'Incidente', gravidade: 'disfuncional', alcance: 'setor', produtos: ['linepbx'],
    },
    passos: [
      { aos: 10, faz: 'assumir', por: 'luan' },
      { aos: 200, faz: 'anotar', por: 'luan', texto: 'A música de espera da fila do SAC apontava para um arquivo apagado na limpeza do servidor. Subi o arquivo de novo.' },
      { aos: 210, faz: 'alterar', por: 'luan', dados: { solucao: 'Subimos de novo o arquivo da música de espera e apontamos a fila do SAC para ele.', causa: 'O arquivo da música foi apagado na limpeza do servidor.' } },
      { aos: 700, faz: 'mover', para: 'resolvido', por: 'luan' },
      { aos: 1010, faz: 'clienteRespondeu', texto: 'Ainda está sem música para quem liga do celular.' },
    ],
  },
  {
    // perto de vencer
    chave: 'ura-feriado', painel: 'SUP', idade: 1000, abre: 'lucio',
    dados: {
      titulo: 'URA não toca a mensagem de feriado', cliente: EXAME, contato: SERGIO,
      relato: 'O Sérgio testou a URA do laboratório com o horário de feriado ligado e ela continua tocando o menu normal.',
      assunto: 'LinePBX › Configuração › URA', tipo: 'Incidente', gravidade: 'disfuncional', alcance: 'empresa', produtos: ['linepbx'],
    },
    passos: [
      { aos: 5, faz: 'assumir', por: 'lucio' },
      { aos: 30, faz: 'marcar', por: 'lucio', quantos: 1 },
      { aos: 120, faz: 'anotar', por: 'lucio', texto: 'A regra de feriado está cadastrada, mas a URA está ligada direto no menu, sem passar pela verificação de horário.' },
      { aos: 130, faz: 'tempo', por: 'lucio', minutos: 30 },
    ],
  },
  {
    chave: 'callback-fop2', painel: 'SUP', idade: 990, abre: 'camila',
    dados: {
      titulo: 'Callback do FOP2 não liga de volta', cliente: AURORA, contato: JULIANA,
      relato: 'A Juliana diz que, quando a recepção clica em "retornar ligação" no FOP2, nada acontece.',
      assunto: 'FOP2 › Incidente › Callback', tipo: 'Incidente', gravidade: 'disfuncional', alcance: 'setor', produtos: ['linepbx'], etiquetas: ['fop2'],
    },
    passos: [
      { aos: 5, faz: 'assumir', por: 'camila' },
      { aos: 15, faz: 'ligar', por: 'camila', com: 'fop2-desligados', tipo: 'relacionado' },
      { aos: 40, faz: 'mover', para: 'n2', por: 'camila', motivo: 'Precisa ver os logs do FOP2 no servidor', responsavel: 'lucio' },
      { aos: 200, faz: 'anotar', por: 'lucio', texto: 'O callback chama o contexto antigo da URA. Vou corrigir o contexto no FOP2.' },
    ],
  },
  {
    // o checklist pela metade
    chave: 'medicos', painel: 'SUP', idade: 900, abre: 'camila',
    dados: {
      titulo: 'Criar ramais para 3 médicos novos', cliente: HOSPITAL, contato: RENATA,
      relato: 'A Renata pediu ramais para os médicos novos do ambulatório: Dra. Lívia, Dr. Otávio e Dra. Sueli.',
      assunto: 'Ramal › Configuração › Criação', tipo: 'Requisição', gravidade: 'nao_se_aplica', alcance: 'setor', produtos: ['linepbx'],
    },
    passos: [
      { aos: 5, faz: 'assumir', por: 'camila' },
      { aos: 60, faz: 'marcar', por: 'camila', quantos: 1 },
      { aos: 65, faz: 'tempo', por: 'camila', minutos: 20, nota: 'Criação dos 3 ramais' },
      { aos: 70, faz: 'anotar', por: 'camila', texto: 'Ramais 3051, 3052 e 3053 criados. Falta testar a ligação interna com o ambulatório.' },
    ],
  },
  {
    chave: 'picotando', painel: 'SUP', idade: 880, abre: 'lucio',
    dados: {
      titulo: 'Áudio picotando nas ligações da Loja Centro', cliente: BOMPRECO, contato: FERNANDA,
      relato: 'A Fernanda diz que as ligações da Loja Centro estão picotando no fim da tarde, quando a loja enche.',
      assunto: 'Infraestrutura do cliente › Rede › Interna', tipo: 'Incidente', gravidade: 'performance', alcance: 'setor', produtos: ['linepbx'],
    },
    passos: [
      { aos: 4, faz: 'assumir', por: 'lucio' },
      { aos: 100, faz: 'anotar', por: 'lucio', texto: 'A rede da loja divide o link com as câmeras e o Wi-Fi dos clientes; no fim da tarde o link fica cheio.' },
      { aos: 400, faz: 'anotar', por: 'lucio', texto: 'O TI da loja ativou a prioridade para a voz (QoS) no roteador.' },
      { aos: 410, faz: 'alterar', por: 'lucio', dados: { solucao: 'O TI da loja ativou a prioridade para a voz (QoS) no roteador; vamos acompanhar no fim da tarde.' } },
      { aos: 420, faz: 'mover', para: 'observacao', por: 'lucio' },
    ],
  },
  {
    chave: 'nome-ramal', painel: 'SUP', idade: 800, abre: 'marina',
    dados: {
      titulo: 'Nome do ramal aparece errado nas ligações internas', cliente: EXAME, contato: SERGIO,
      relato: 'O Sérgio diz que o ramal 2031 aparece como "Recepção 2" nas ligações internas, mas agora é a sala da coleta.',
      assunto: 'Ramal › Configuração › Identidade', tipo: 'Requisição', gravidade: 'nao_se_aplica', alcance: 'pessoa', produtos: ['linepbx'],
    },
    passos: [
      { aos: 3, faz: 'assumir', por: 'marina' },
      { aos: 40, faz: 'alterar', por: 'marina', dados: { solucao: 'Trocamos o nome do ramal 2031 para "Coleta".', causa: 'Pedido do cliente: a sala mudou de uso.' } },
      { aos: 45, faz: 'mover', para: 'resolvido', por: 'marina' },
      { aos: 50, faz: 'avisarCliente', por: 'marina', texto: 'O ramal 2031 já aparece como "Coleta". Pode conferir?' },
    ],
  },
  {
    // o chamado do desenho aprovado: N2 com o Bruno, o filho no Desenvolvimento, a VC1 e o card antigo citado
    chave: 'saida-0300', painel: 'SUP', idade: 700, abre: 'lucio',
    dados: {
      titulo: 'Ligações de saída não completam', cliente: AURORA, contato: MARIA,
      relato: 'Desde as 9h nenhuma ligação para 0300 e 0800 completa: dá ocupado. Para celular e fixo está normal.',
      descricao: 'Só as ligações para 0300 e 0800 dão ocupado; para celular e fixo, normal.\nNo LineChat, o mesmo cliente teve o {LC} com um sintoma parecido.',
      assunto: 'Operadora › Incidente › DID de saída', tipo: 'Incidente', gravidade: 'inoperancia', alcance: 'setor',
      produtos: ['linepbx', 'voicenet'], operadoras: ['VC1'], etiquetas: ['saída'],
    },
    passos: [
      { aos: 5, faz: 'assumir', por: 'lucio' },
      { aos: 35, faz: 'mover', para: 'n2', por: 'lucio', motivo: 'Precisa de acesso ao SBC' },
      { aos: 38, faz: 'assumir', por: 'bruno' },
      { aos: 40, faz: 'observar', por: 'lucio' },
      { aos: 90, faz: 'operadora', por: 'bruno', operadora: 'VC1', protocolo: '88213381', cobrarACadaHoras: 24, nota: 'Pedimos para a VC1 conferir a rota de 0300 e 0800.' },
      { aos: 200, faz: 'fecharProtocolo', por: 'bruno', texto: 'A VC1 confirmou que a rota está normal: o problema é no nosso plano de discagem.' },
      { aos: 230, faz: 'anotar', por: 'bruno', texto: 'Abri o {#dev-plano-0300} no Desenvolvimento para corrigir o plano de discagem. Enquanto isso, a recepção liga para 0800 pelo celular.' },
      { aos: 235, faz: 'alterar', por: 'bruno', dados: { contorno: 'A recepção liga para 0300 e 0800 pelo celular até a correção do plano de discagem.' } },
      { aos: 240, faz: 'tempo', por: 'bruno', minutos: 45, nota: 'Testes de rota e contato com a VC1' },
      // o nível DEV: o chamado fica com o desenvolvimento enquanto o filho é corrigido
      { aos: 245, faz: 'mover', para: 'dev', por: 'bruno', motivo: 'A correção é no plano de discagem: fica com o Desenvolvimento ({#dev-plano-0300})' },
      // a citação (@): o Luan recebe o aviso sem observar o chamado
      { aos: 250, faz: 'anotar', por: 'bruno', texto: '@Luan França, a Maria pediu um retorno da diretoria sobre o prazo da correção. Consegue ligar para ela hoje?' },
    ],
  },
  {
    chave: 'login-lr', painel: 'SUP', idade: 690, abre: 'camila',
    dados: {
      titulo: 'Login do LineReports para a nova coordenadora', cliente: HOSPITAL, contato: RENATA,
      relato: 'A Renata pediu um login do LineReports para a coordenadora nova do call center, Bianca.',
      assunto: 'Relatórios › LineReports › Criação de logins', tipo: 'Requisição', gravidade: 'nao_se_aplica', alcance: 'pessoa', produtos: ['linereports'],
    },
    passos: [
      { aos: 4, faz: 'assumir', por: 'camila' },
      { aos: 30, faz: 'anotar', por: 'camila', texto: 'Login criado (bianca.lima). Mandei o acesso para o e-mail da Renata.' },
      // avisa o cliente pelo WhatsApp e marca "esperando o cliente"
      { aos: 32, faz: 'resposta', por: 'camila', resposta: 'Pedir teste ao cliente' },
    ],
  },
  {
    chave: 'logins-fop2', painel: 'SUP', idade: 650, abre: 'camila',
    dados: {
      titulo: 'Logins do FOP2 para a supervisão', cliente: HOSPITAL, contato: RENATA,
      relato: 'A Renata pediu logins do FOP2 para as 2 supervisoras do call center acompanharem as filas.',
      assunto: 'FOP2 › Configuração › Logins', tipo: 'Requisição', gravidade: 'nao_se_aplica', alcance: 'setor', produtos: ['linepbx'],
    },
    passos: [
      { aos: 4, faz: 'assumir', por: 'camila' },
      { aos: 50, faz: 'tempo', por: 'camila', minutos: 15 },
      { aos: 52, faz: 'alterar', por: 'camila', dados: { solucao: 'Criamos os 2 logins de supervisão no FOP2, com a visão das filas.', causa: 'Pedido do cliente.' } },
      { aos: 55, faz: 'mover', para: 'resolvido', por: 'camila' },
      { aos: 610, faz: 'mover', para: 'fechado', por: 'camila' },
    ],
  },
  {
    chave: 'certificado', painel: 'SUP', idade: 600, abre: 'luan',
    dados: {
      titulo: 'Navegador acusa certificado vencido no LinePBX Web', cliente: HOSPITAL, contato: RENATA,
      relato: 'A Renata diz que o navegador mostra "conexão não segura" ao abrir o LinePBX Web do hospital.',
      assunto: 'LinePBX › Incidente › Certificado', tipo: 'Incidente', gravidade: 'disfuncional', alcance: 'empresa', produtos: ['linepbx'],
    },
    passos: [
      { aos: 3, faz: 'assumir', por: 'luan' },
      { aos: 60, faz: 'anotar', por: 'luan', texto: 'O certificado venceu ontem: a renovação automática falhou porque a porta 80 está fechada no firewall do hospital.' },
      { aos: 65, faz: 'esperar', por: 'luan', tipo: 'cliente', motivo: 'A Renata vai pedir ao TI do hospital para liberar a porta 80' },
      { aos: 80, faz: 'tempo', por: 'luan', minutos: 20 },
    ],
  },
  {
    chave: 'dev-plano-0300', painel: 'DEV', idade: 480, abre: 'bruno',
    dados: {
      titulo: 'Ajuste no plano de discagem para números 0300 e 0800', pai: 'saida-0300', responsavel: 'diego',
      relato: 'Vem do {#saida-0300}: as ligações para 0300 e 0800 saem com o prefixo errado depois da mudança de rota da VC1.',
      tipo: 'Correção', gravidade: 'inoperancia', alcance: 'setor', produtos: ['linepbx'], campos: { Sistema: 'LinePBX' },
    },
    passos: [
      { aos: 20, faz: 'assumir', por: 'diego' },
      { aos: 60, faz: 'mover', para: 'desenvolvimento', por: 'diego' },
      { aos: 150, faz: 'anotar', por: 'diego', texto: 'Achei: a regra nova da rota da VC1 pega o 0300 antes da regra de números especiais. Corrigindo a ordem.' },
    ],
  },
  {
    // N1 → N2 → N3: chega para o Luan ("Você recebeu o chamado")
    chave: 'firewall', painel: 'SUP', idade: 430, abre: 'lucio',
    dados: {
      titulo: 'Firewall bloqueando o IP novo do CD de Feira de Santana', cliente: NORTE, contato: CARLOS,
      relato: 'O Carlos avisou que o CD de Feira de Santana trocou de provedor de internet e os ramais de lá não registram mais.',
      assunto: 'LinePBX › Configuração › Firewall', tipo: 'Incidente', gravidade: 'inoperancia', alcance: 'setor', produtos: ['linepbx'],
    },
    passos: [
      { aos: 4, faz: 'assumir', por: 'lucio' },
      { aos: 30, faz: 'mover', para: 'n2', por: 'lucio', motivo: 'Precisa de acesso ao firewall do servidor' },
      { aos: 33, faz: 'assumir', por: 'bruno' },
      { aos: 90, faz: 'anotar', por: 'bruno', texto: 'O IP novo do CD (177.38.20.14) não está na lista liberada do firewall. A lista do servidor de produção é só do N3.' },
      { aos: 100, faz: 'mover', para: 'n3', por: 'bruno', motivo: 'Só o N3 mexe no firewall do servidor de produção', responsavel: 'luan' },
    ],
  },
  {
    chave: 'omniboard-transfer', painel: 'SUP', idade: 495, abre: 'marina',
    dados: {
      titulo: 'Transferência do Omniboard cai na caixa postal', cliente: VIVERBEM, contato: PATRICIA,
      relato: 'A Patrícia diz que, quando transfere uma ligação pelo Omniboard, ela cai na caixa postal em vez de tocar no ramal.',
      assunto: 'Omniboard › Incidente › Transferência', tipo: 'Incidente', gravidade: 'disfuncional', alcance: 'setor', produtos: ['linepbx'],
    },
    passos: [
      { aos: 4, faz: 'assumir', por: 'marina' },
      { aos: 40, faz: 'mover', para: 'n2', por: 'marina', motivo: 'Precisa olhar o dial plan do LinePBX', responsavel: 'lucio' },
      { aos: 120, faz: 'anotar', por: 'lucio', texto: 'A transferência do Omniboard usa o contexto antigo, que manda para a caixa postal depois de 1 toque.' },
    ],
  },
  {
    // resolvido com a resposta pronta
    chave: 'caixa4', painel: 'SUP', idade: 450, abre: 'lucio',
    dados: {
      titulo: 'Ramal do caixa 4 sem registro depois da troca do switch', cliente: BOMPRECO, contato: ANTONIO,
      relato: 'O Antônio diz que, depois da troca do switch da Loja Simões Filho, o ramal do caixa 4 não liga.',
      assunto: 'Ramal › Incidente › Sem serviço', tipo: 'Incidente', gravidade: 'inoperancia', alcance: 'pessoa', produtos: ['linepbx'],
    },
    passos: [
      { aos: 3, faz: 'assumir', por: 'lucio' },
      { aos: 30, faz: 'marcar', por: 'lucio', quantos: 3 },
      {
        aos: 300, faz: 'alterar', por: 'lucio', dados: {
          solucao: 'Reconfiguramos o ramal do caixa 4 na VLAN de voz do switch novo.', causa: 'O switch novo veio sem a VLAN de voz configurada na porta do caixa 4.',
          campos: { Responsabilidade: 'Cliente' },
        },
      },
      { aos: 310, faz: 'resposta', por: 'lucio', resposta: 'Resolvido: ramal reconfigurado' },
    ],
  },
  {
    // a reincidência: cita o SUP-7 no relato e fica ligado a ele ("Repete")
    chave: 'ramal-2010-denovo', painel: 'SUP', idade: 410, abre: 'marina',
    dados: {
      titulo: 'Ramal 2010 da recepção mudo de novo', cliente: AURORA, contato: MARIA,
      relato: 'Igual ao {#ramal-2010}: a Maria diz que o ramal 2010 da recepção ficou mudo de novo hoje cedo.',
      assunto: 'Ramal › Incidente › Sem serviço', tipo: 'Incidente', gravidade: 'inoperancia', alcance: 'pessoa', produtos: ['linepbx'], etiquetas: ['ramal', 'reincidente'],
    },
    passos: [
      { aos: 3, faz: 'assumir', por: 'marina' },
      { aos: 8, faz: 'ligar', por: 'marina', com: 'ramal-2010', tipo: 'repete' },
      { aos: 20, faz: 'marcar', por: 'marina', quantos: 1 },
      { aos: 40, faz: 'anotar', por: 'marina', texto: 'Pedi para a recepção conferir o cabo de rede, como da outra vez. O cabo está bom; o ramal registra e cai.' },
    ],
  },
  {
    chave: 'dev-perdidas', painel: 'DEV', idade: 300, abre: 'camila',
    dados: {
      titulo: 'Relatório de ligações perdidas por ramal', tipo: 'Melhoria', prioridade: 'baixa', campos: { Sistema: 'LineReports' },
      relato: 'Os clientes pedem muito: um relatório com as ligações perdidas de cada ramal no dia, para mandar aos gestores.',
    },
  },
  {
    // na entrada, sem dono
    chave: 'ramal-celular', painel: 'SUP', idade: 140, abre: 'camila',
    dados: {
      titulo: 'Ramal no celular para o plantão do laboratório', cliente: EXAME, contato: SERGIO,
      relato: 'O Sérgio quer que o plantonista atenda o ramal 2000 pelo celular nos fins de semana.',
      assunto: 'Ramal › Configuração › WebRTC', tipo: 'Requisição', gravidade: 'nao_se_aplica', alcance: 'pessoa', produtos: ['linepbx'],
    },
  },
  {
    // assumido, mas fica na entrada: falta o cliente para ir ao N1
    chave: 'desconhecido', painel: 'SUP', idade: 90, abre: 'marina',
    dados: {
      titulo: 'Ligação de um número que não está no cadastro', contato: RAFAEL, gravidade: 'disfuncional', alcance: 'setor',
      relato: 'Uma pessoa ligou pedindo suporte para "a central que não toca", mas não soube dizer a empresa. Ficou de mandar o CNPJ pelo WhatsApp.',
    },
    passos: [
      { aos: 2, faz: 'assumir', por: 'marina' },
      { aos: 5, faz: 'esperar', por: 'marina', tipo: 'cliente', motivo: 'Aguardando o CNPJ da empresa pelo WhatsApp' },
    ],
  },
  {
    // pelo robô: o telefone da Joana já é conhecido (o Gestor aprendeu no chamado da sala 3)
    chave: 'robo-joana', painel: 'SUP', idade: 50, abre: 'robo',
    dados: {
      contato: JOANA_ROBO, sessao: '7c4e2a91-3d6b-4f80-a5c2-91e8d3b60a47',
      relato: 'Cliente pelo WhatsApp: "Boa tarde, o telefone da recepção da casa de apoio está mudo."',
      ia: {
        titulo: 'Telefone da recepção da casa de apoio mudo',
        relato: 'A Joana disse que o telefone da recepção da casa de apoio está mudo desde depois do almoço: não dá sinal para ligar e não toca quando ligam.',
        descricao: '- Ramal 305 (recepção da casa de apoio)\n- O aparelho está ligado na tomada e com a tela acesa\n- Os outros telefones da casa funcionam',
        assunto: 'Ramal › Incidente › Sem serviço', tipo: 'Incidente', gravidade: 'inoperancia', alcance: 'setor',
        produtos: ['LinePBX'], etiquetas: ['ramal', 'casa de apoio'],
        resumo: 'A recepção da casa de apoio está sem telefone desde depois do almoço. Conferir o registro do ramal 305 e pedir para a Joana reiniciar o aparelho.',
        letras: 1460,
      },
    },
  },
  {
    // pelo robô, Crítico: avisa os supervisores na hora; sem dono, a primeira resposta vence em 15 min
    chave: 'robo-critico', painel: 'SUP', idade: 35, abre: 'robo',
    dados: {
      titulo: 'Nenhuma ligação entra na central', contato: ['Carlos Menezes', '(71) 99999-3321'], sessao: 'e3b0c442-98fc-4c14-9afb-f4c8996fb924',
      relato: 'Cliente pelo WhatsApp: "URGENTE: ninguém consegue ligar para a distribuidora desde agora há pouco, dá número inexistente!"',
      prioridade: 'critica', etiquetas: ['urgente'],
      ia: {
        titulo: 'Ligações para a distribuidora dão número inexistente',
        relato: 'O Carlos (TI) disse que ninguém consegue ligar para a Distribuidora Norte: quem liga ouve "número inexistente". As ligações de saída funcionam.',
        descricao: '- Começou há uns 20 minutos\n- Todos os números da empresa (o principal e os da fila do SAC)\n- As ligações de saída continuam saindo',
        assunto: 'Operadora › Incidente › DID de entrada', tipo: 'Incidente', gravidade: 'inoperancia', alcance: 'empresa',
        produtos: ['VoiceNet', 'LinePBX'], etiquetas: ['urgente', 'did', 'entrada'],
        resumo: 'Nenhuma ligação entra na Distribuidora Norte; as de saída funcionam. Conferir o tronco na operadora e a rota de entrada no SBC.',
        letras: 2310,
      },
    },
  },
  {
    // pelo robô, de um telefone que o Gestor não conhece: sem título, sem nome, sem cliente
    chave: 'robo-whatsapp', painel: 'SUP', idade: 8, abre: 'robo',
    dados: {
      contato: [null, '(71) 99999-4321'], sessao: '5a9d3f7e-2c41-4b6e-8f05-d17c3e9a2b68',
      relato: 'Cliente pelo WhatsApp: "Oi, o sistema de vocês está fora? Não consigo entrar no painel de relatórios."',
      ia: {
        titulo: 'Não consegue entrar no LineReports',
        relato: 'O cliente perguntou se o sistema está fora: ele não consegue entrar no painel de relatórios. Disse que a senha é a mesma de sempre.',
        descricao: '- A tela de entrada do LineReports abre, mas a senha não é aceita\n- O cliente não disse o nome nem a empresa',
        assunto: 'Relatórios › LineReports › Criação de logins', tipo: 'Incidente', gravidade: 'disfuncional', alcance: 'pessoa',
        produtos: ['LineReports'], etiquetas: ['linereports', 'login'],
        resumo: 'Alguém de um número que o Gestor não conhece não consegue entrar no LineReports. Perguntar o nome e a empresa e conferir o login.',
        letras: 980,
      },
    },
  },
  {
    // o chamado que o agendado abriu na última segunda (o checklist dele está pela metade)
    chave: 'backups', painel: 'SUP', idade: { agendado: 'backups' }, abre: 'agendado', dados: {},
    passos: [
      { aos: 15, faz: 'assumir', por: 'lucio' },
      { aos: 40, faz: 'marcar', por: 'lucio', quantos: 1 },
      { aos: 90, faz: 'marcar', por: 'lucio', quantos: 1 },
      { aos: 100, faz: 'anotar', por: 'lucio', texto: 'Dois PABX com o backup falhando (Clínica Aurora e Laboratório Exame Certo): disco cheio no servidor de backup.' },
    ],
  },
];
