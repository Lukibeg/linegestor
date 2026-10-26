/**
 * A PRÉVIA DO TRAZER DO HELENA (Patch 2.0.3, decisão 0054): o Trazer sem servidor e sem Helena.
 *
 * Copia o servidor (`apps/api/src/services/helena.ts` e a rota `routes/helena.ts`): as mesmas permissões, as
 * mesmas mensagens e a mesma frase na auditoria. O plano (o histórico, os valores, as etapas, os campos, a
 * prévia) vem do `@gestor/shared` — as mesmas contas do servidor. O Helena aqui é de exemplo: um painel de
 * vendas com as etapas do Ingline - Comercial e dez cards com o histórico escrito como o Helena escreve
 * (conferido em 21/10): o card duplicado com a Conclusão de antes, o ganho reaberto, o perdido, o que andou
 * depois de ganho, o arquivado. As empresas são de exemplo.
 *
 * A leitura anda a cada pergunta da tela (como a de verdade, que lê card a card), para a barra de progresso.
 *
 * Desde o 2.1.1, a leitura é a que a chave de API do LineChat faz no ar: os cards vêm sem o histórico e sem a
 * Conclusão (o motivo da perda vem, pelo LostReason da lista). A Conclusão vem da planilha do Helena: na prévia,
 * qualquer link do Google Planilhas usa a planilha de exemplo (a deste Helena), e o .csv escolhido é lido de
 * verdade (as mesmas regras do servidor).
 *
 * Desde o 2.1.2, um painel de atividades de exemplo (o "Luan - Atividades", que não é de vendas): ele vem para um
 * painel de Gestão, e cada card vira um chamado.
 */
import {
  MENSAGENS_DA_PLANILHA_DO_HELENA, csvDaPlanilhaDoHelena, diaLocal, leituraComAPlanilha, linkDoCsvDaPlanilha, planoDaImportacao, resumoDaImportacao,
  type CampoDoHelena, type CardDoHelena, type LeituraDoHelena, type LeituraDoHelenaNaTela, type LinhaDaPlanilhaDoHelena, type LogDoHelena, type OpcoesDoTrazerDoHelena,
} from '@gestor/shared';
import type { Api } from './index.js';
import { ApiError } from './types.js';
import { acessoDoHelenaDemo } from './demo-atendimento.js';

export type ContextoHelenaDemo = {
  id: () => string;
  wait: (ms?: number) => Promise<unknown>;
  audit: (action: string, entityType: string, summary: string, entityId?: string | null, extra?: { before?: unknown; after?: unknown }) => void;
  requirePerm: (perm: string) => void;
  /** a hora de agora (os testes podem adiantar o relógio) */
  agora?: () => Date;
};

const PAINEL = 'helena-comercial';
const PAINEL_ATIVIDADES = 'helena-atividades';
/** Quantos cards a leitura da prévia "lê" a cada pergunta da tela. */
const POR_PERGUNTA = 3;

const erro = (status: number, mensagem: string) => new ApiError(status, mensagem, null as never);

// =====================================================================
//  O HELENA DE EXEMPLO
// =====================================================================

const ETAPAS = [
  'StandBy', 'Lead Novo', 'Visita/Apresentação Marcada', 'Aguardando Envio de Informações', 'Aguardando Envio Proposta', 'Aguardando Assinatura Proposta',
  'Aguardando Envio Contrato', 'Aguardando Assinatura de Contrato', 'Aguardando Implantação', 'Em processo de Implantação', 'Cliente na base',
];
const CAMPOS: CampoDoHelena[] = [
  { chave: 'grupo-lead', nome: 'Informações Lead', tipo: 'GROUP', posicao: 1, opcoes: [] },
  { chave: 'cnpj-64', nome: 'CNPJ', tipo: 'TEXT', posicao: 2, opcoes: [] },
  { chave: 'contatos-principais-3', nome: 'Contatos principais', tipo: 'TEXT', posicao: 3, opcoes: [] },
  { chave: 'origem-de-lead-1', nome: 'Origem de lead', tipo: 'SINGLESELECT', posicao: 4, opcoes: ['Indicação', 'Instagram', 'Prospecção ativa', 'Cliente da base', 'Feira de negócios'] },
  { chave: 'indica-o-', nome: 'Indicação', tipo: 'SINGLESELECT', posicao: 5, opcoes: ['Parceiro Contábil', 'Cliente da base'] },
  { chave: '-rea-de-atua-o-lead', nome: 'Área de Atuação Lead', tipo: 'SINGLESELECT', posicao: 6, opcoes: ['Saúde', 'Varejo', 'Serviços'] },
  { chave: 'grupo-proposta', nome: 'Informações Proposta', tipo: 'GROUP', posicao: 7, opcoes: [] },
  { chave: 'servi-os-ofertados', nome: 'Serviços Ofertados', tipo: 'MULTISELECT', posicao: 8, opcoes: ['LinePBX', 'LineChat', 'VoiceNet'] },
  { chave: 'valor-mensalidade-li-38', nome: 'Valor Mensalidade LinePBX', tipo: 'CURRENCY', posicao: 9, opcoes: [] },
  { chave: 'valor-mensalidade-li-13', nome: 'Valor Mensalidade LineChat', tipo: 'CURRENCY', posicao: 10, opcoes: [] },
  { chave: 'valor-mensalidade-vo', nome: 'Valor Mensalidade VoiceNet', tipo: 'CURRENCY', posicao: 11, opcoes: [] },
  { chave: 'valor-ativa-o-linepb', nome: 'Valor Ativação LinePBX', tipo: 'CURRENCY', posicao: 12, opcoes: [] },
  { chave: 'valor-ativa-o-voicen', nome: 'Valor Ativação VoiceNet', tipo: 'CURRENCY', posicao: 13, opcoes: [] },
  { chave: 'licen-as-whatsapp-3', nome: 'Licenças WhatsApp', tipo: 'NUMBER', posicao: 14, opcoes: [] },
  { chave: 'canais-simult-neos', nome: 'Canais simultâneos', tipo: 'NUMBER', posicao: 15, opcoes: [] },
  { chave: 'grupo-cliente', nome: 'Informações Cliente', tipo: 'GROUP', posicao: 16, opcoes: [] },
  { chave: 'implantado-dia', nome: 'Implantado dia', tipo: 'DATE', posicao: 17, opcoes: [] },
  { chave: 'observador-89', nome: 'Observador', tipo: 'MULTISELECT', posicao: 18, opcoes: [] },
];
const USUARIOS = [{ id: 'hu-luan', nome: 'Luan França' }, { id: 'hu-camila', nome: 'Camila Duarte' }];

/** O painel de exemplo, com as datas contadas para trás a partir de hoje (os ganhos caem nos últimos meses). */
export function helenaDeExemplo(agora: Date): LeituraDoHelena {
  const dia = (d: number, h = 10, m = 0) => new Date(agora.getTime() - d * 86_400_000 + (h - 10) * 3_600_000 + m * 60_000).toISOString();
  const dataBr = (iso: string) => { const d = new Date(new Date(iso).getTime() - 3 * 3_600_000); return `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()} ${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`; };
  let n = 0;
  const log = (em: string, texto: string, usuarioId: string | null = 'hu-luan'): LogDoHelena => ({ id: `hl-${++n}`, em, texto, usuarioId });
  const base = { descricao: null, responsavelId: 'hu-luan', criadoPorId: 'hu-luan', etiquetas: [] as string[], campos: {} as Record<string, unknown>, concluidoEm: null, motivo: null, valor: null };
  const cards: CardDoHelena[] = [
    {
      ...base, id: 'hc-5', numero: 5, codigo: 'IC-5', titulo: 'Padaria Pão Quente - WhatsApp', etapa: 'StandBy', situacao: 'LOST',
      criadoEm: dia(240), alteradoEm: dia(125), concluidoEm: dia(125), motivo: 'Sem resposta do lead',
      campos: { 'origem-de-lead-1': 'Instagram', 'servi-os-ofertados': ['LineChat'], '-rea-de-atua-o-lead': 'Varejo' },
      logs: [
        log(dia(240), 'Item criado por Luan em Lead Novo'),
        log(dia(232), 'Item movido de Lead Novo para Aguardando Assinatura Proposta'),
        log(dia(200), 'Item movido de Aguardando Assinatura Proposta para StandBy'),
        log(dia(125), 'Item marcado como "Perda"'),
      ],
    },
    {
      // o card duplicado: a Conclusão de antes de existir no Helena, e a data de criação ajustada
      ...base, id: 'hc-12', numero: 12, codigo: 'IC-12', titulo: 'Clínica Bem-Estar (Cópia)', etapa: 'Cliente na base', situacao: 'WON',
      criadoEm: dia(262, 11, 59), alteradoEm: dia(30), concluidoEm: dia(262, 12), valor: 169_000,
      campos: { 'servi-os-ofertados': ['LinePBX', 'LineChat', 'VoiceNet'], 'valor-mensalidade-li-38': 'R$ 790,00', 'valor-mensalidade-li-13': 'R$ 639,90', 'valor-mensalidade-vo': 'R$ 260,10', 'valor-ativa-o-linepb': 'R$ 1.000,00', 'cnpj-64': '12.345.678/0001-90' },
      logs: [
        log(dia(107), 'Valor atribuído alterado de R$ 1.690,00 para R$ 1.690,00'),
        log(dia(107, 10, 1), 'Item marcado como "Ganho"'),
        log(dia(30), 'Item estava marcado como "Ganho" e foi reaberto '),
        log(dia(30, 10, 1), 'Item marcado como "Ganho"'),
        log(dia(30, 10, 2), `Data de criação ajustada de ${dataBr(dia(107))} para ${dataBr(dia(262, 11, 59))}`),
      ],
    },
    {
      ...base, id: 'hc-22', numero: 22, codigo: 'IC-22', titulo: 'Distribuidora Norte - VoiceNet', etapa: 'Aguardando Assinatura Proposta', situacao: 'WON',
      criadoEm: dia(70), alteradoEm: dia(40), concluidoEm: dia(40), valor: 119_000, etiquetas: ['ht-ingline'],
      campos: { 'origem-de-lead-1': 'Indicação', 'indica-o-': 'Parceiro Contábil', 'servi-os-ofertados': ['VoiceNet'], 'valor-mensalidade-vo': 'R$ 1.190,00', 'valor-ativa-o-voicen': 'R$ 500,00', 'canais-simult-neos': 10, 'contatos-principais-3': 'Paulo (compras) - 71 99999-0202' },
      logs: [
        log(dia(70), 'Item criado por Luan França em Lead Novo'),
        log(dia(66), 'Item movido de Lead Novo para Visita/Apresentação Marcada'),
        log(dia(60), 'Item movido de Visita/Apresentação Marcada para Aguardando Envio Proposta'),
        log(dia(55), 'Valor atribuído alterado para R$ 1.190,00'),
        log(dia(52), 'Item movido de Aguardando Envio Proposta para Aguardando Assinatura Proposta'),
        log(dia(40), 'Item marcado como "Ganho"'),
        log(dia(40, 10, 1), 'A etiqueta P/R Ingline foi adicionada'),
      ],
    },
    {
      ...base, id: 'hc-34', numero: 34, codigo: 'IC-34', titulo: 'Arena Esportes - LinePBX', etapa: 'Cliente na base', situacao: 'WON',
      criadoEm: dia(95), alteradoEm: dia(10), concluidoEm: dia(10), valor: 40_000,
      campos: { 'servi-os-ofertados': ['LinePBX'], 'valor-mensalidade-li-38': 'R$ 400,00', 'implantado-dia': dia(12).slice(0, 10), 'observador-89': ['Camila Duarte'] },
      logs: [
        log(dia(95), 'Item criado por Luan França em Aguardando Implantação'),
        log(dia(60), 'Valor atribuído alterado para R$ 400,00'),
        log(dia(20), 'Item movido de Aguardando Implantação para Em processo de Implantação'),
        log(dia(12), 'Item movido de Em processo de Implantação para Cliente na base'),
        log(dia(10), 'Valor atribuído alterado de R$ 400,00 para R$ 400,00'),
        log(dia(10, 10, 1), 'Item marcado como "Ganho"'),
      ],
    },
    {
      // ganho, reaberto e andando: no Helena, o "(Cópia)" do card duplicado; a mensalidade por produto não soma o Valor atribuído
      ...base, id: 'hc-42', numero: 42, codigo: 'IC-42', titulo: 'Cabral & Filhos - Link SIP (Cópia)', etapa: 'Cliente na base', situacao: 'OPEN',
      criadoEm: dia(108), alteradoEm: dia(43), valor: 145_000, responsavelId: 'hu-camila',
      campos: { 'servi-os-ofertados': ['VoiceNet'], 'valor-mensalidade-vo': 'R$ 1.190,00' },
      logs: [
        log(dia(108), 'Valor atribuído alterado de R$ 1.450,00 para R$ 1.450,00'),
        log(dia(108, 10, 1), 'Item marcado como "Ganho"'),
        log(dia(91), 'Item estava marcado como "Ganho" e foi reaberto ', 'hu-camila'),
        log(dia(43), 'Item movido de Cliente na base para Em processo de Implantação', 'hu-camila'),
        log(dia(43, 10, 1), 'Item movido de Em processo de Implantação para Cliente na base', 'hu-camila'),
      ],
    },
    {
      ...base, id: 'hc-60', numero: 60, codigo: 'IC-60', titulo: 'Hotel Maré Alta - LineChat', etapa: 'Aguardando Envio Proposta', situacao: 'OPEN',
      criadoEm: dia(12), alteradoEm: dia(4), valor: 145_000, etiquetas: ['ht-cliente'],
      campos: { 'origem-de-lead-1': 'Prospecção ativa', 'servi-os-ofertados': ['LineChat'], 'licen-as-whatsapp-3': 5 },
      logs: [
        log(dia(12), 'Item criado por Luan França em Lead Novo'),
        log(dia(9), 'Item movido de Lead Novo para Aguardando Envio de Informações'),
        log(dia(4), 'Item movido de Aguardando Envio de Informações para Aguardando Envio Proposta'),
        log(dia(4, 10, 1), 'Valor atribuído alterado para R$ 1.450,00'),
        log(dia(4, 10, 2), 'A etiqueta P/R Cliente foi adicionada'),
      ],
    },
    {
      ...base, id: 'hc-61', numero: 61, codigo: 'IC-61', titulo: 'Escritório Contábil Prisma - WhatsApp', etapa: 'Lead Novo', situacao: 'OPEN',
      criadoEm: dia(3), alteradoEm: dia(3), responsavelId: 'hu-camila', criadoPorId: 'hu-camila',
      campos: { 'origem-de-lead-1': 'Feira de negócios', 'servi-os-ofertados': ['LineChat'] },
      logs: [log(dia(3), 'Item criado por Camila Duarte em Lead Novo', 'hu-camila'), log(dia(3, 10, 5), 'Título alterado de Contábil Prisma para Escritório Contábil Prisma - WhatsApp', 'hu-camila')],
    },
    {
      // ganho, e no Helena ainda andou: no Gestor fica no Ganho (a mudança vai para o histórico)
      ...base, id: 'hc-63', numero: 63, codigo: 'IC-63', titulo: 'Mercado Bom Preço - LinePBX', etapa: 'Cliente na base', situacao: 'WON',
      criadoEm: dia(50), alteradoEm: dia(18), concluidoEm: dia(25), valor: 99_000,
      campos: { 'servi-os-ofertados': ['LinePBX'], 'valor-mensalidade-li-38': 'R$ 990,00', 'valor-ativa-o-linepb': 'R$ 600,00' },
      logs: [
        log(dia(50), 'Item criado por Luan França em Visita/Apresentação Marcada'),
        log(dia(45), 'Valor atribuído alterado para R$ 990,00'),
        log(dia(40), 'Item movido de Visita/Apresentação Marcada para Aguardando Assinatura de Contrato'),
        log(dia(25), 'Item marcado como "Ganho"'),
        log(dia(18), 'Item movido de Aguardando Assinatura de Contrato para Cliente na base'),
      ],
    },
    {
      ...base, id: 'hc-64', numero: 64, codigo: 'IC-64', titulo: 'Bandeira Seguros - LinePBX', etapa: 'Aguardando Envio Proposta', situacao: 'LOST',
      criadoEm: dia(80), alteradoEm: dia(57), concluidoEm: dia(57), motivo: 'Perfil fora do público-alvo', valor: 188_000,
      logs: [
        log(dia(80), 'Item criado por Luan França em Lead Novo'),
        log(dia(70), 'Item movido de Lead Novo para Aguardando Envio Proposta'),
        log(dia(69), 'Valor atribuído alterado para R$ 1.880,00'),
        log(dia(57), 'Item marcado como "Perda"'),
      ],
    },
    { ...base, id: 'hc-70', numero: 70, codigo: 'IC-70', titulo: 'Teste - não usar', etapa: 'StandBy', situacao: 'ARCHIVED', criadoEm: dia(150), alteradoEm: dia(149), logs: [] },
  ];
  return {
    lidaEm: agora.toISOString(),
    usuarios: USUARIOS,
    painel: {
      id: PAINEL, nome: 'Ingline - Comercial', sigla: 'IC',
      etapas: ETAPAS.map((nome, i) => ({ id: `he-${i}`, nome, posicao: i + 1, inicial: nome === 'Lead Novo', arquivada: false })),
      campos: CAMPOS,
      etiquetas: [{ id: 'ht-ingline', nome: 'P/R Ingline', cor: '#008A00' }, { id: 'ht-cliente', nome: 'P/R Cliente', cor: '#D32F2F' }],
    },
    cards,
  };
}

/**
 * O painel de atividades de exemplo (2.1.2): as etapas do Luan - Atividades do Helena (26/10) e sete cards, todos sem
 * o histórico (como a chave de API lê no ar). Um é de um cliente do cadastro de exemplo (Clínica Aurora).
 */
export function atividadesDeExemplo(agora: Date): LeituraDoHelena {
  const dia = (d: number) => new Date(agora.getTime() - d * 86_400_000).toISOString();
  const etapas = ['StandBy', 'Novos', 'Pendente Luan', 'Pendente Terceiros', 'Em andamento Luan', 'Em andamento longo Outros setores', 'Concluído', 'Validado'];
  const base = { descricao: null, responsavelId: 'hu-luan', criadoPorId: 'hu-luan', etiquetas: [] as string[], campos: {} as Record<string, unknown>, concluidoEm: null, motivo: null, valor: null, situacao: 'OPEN', logs: null };
  const cards: CardDoHelena[] = [
    { ...base, id: 'ha-3', numero: 3, codigo: 'LA-3', titulo: 'Interno - Portar DID Chapp', etapa: 'Pendente Terceiros', criadoEm: dia(40), alteradoEm: dia(6) },
    { ...base, id: 'ha-5', numero: 5, codigo: 'LA-5', titulo: 'Interno - Verificar chamadas WhatsApp Helena', etapa: 'Em andamento Luan', criadoEm: dia(20), alteradoEm: dia(2), descricao: 'Ver por que algumas chamadas não chegam no WhatsApp.' },
    { ...base, id: 'ha-8', numero: 8, codigo: 'LA-8', titulo: 'Clínica Aurora - Integração dos retornos', etapa: 'Pendente Luan', criadoEm: dia(15), alteradoEm: dia(3) },
    { ...base, id: 'ha-9', numero: 9, codigo: 'LA-9', titulo: 'Interno - Revisão sites e portfólio', etapa: 'StandBy', criadoEm: dia(60), alteradoEm: dia(30) },
    { ...base, id: 'ha-11', numero: 11, codigo: 'LA-11', titulo: 'Ingline Gestão - Controle de licenças', etapa: 'Novos', criadoEm: dia(4), alteradoEm: dia(4), responsavelId: 'hu-camila', criadoPorId: 'hu-camila' },
    { ...base, id: 'ha-12', numero: 12, codigo: 'LA-12', titulo: 'Interno - Verificações ambientes Dev', etapa: 'Concluído', criadoEm: dia(25), alteradoEm: dia(5) },
    { ...base, id: 'ha-14', numero: 14, codigo: 'LA-14', titulo: 'Interno - Definir divulgação do WebChat', etapa: 'Validado', criadoEm: dia(45), alteradoEm: dia(12) },
    { ...base, id: 'ha-15', numero: 15, codigo: 'LA-15', titulo: 'Teste - não usar', etapa: 'StandBy', situacao: 'ARCHIVED', criadoEm: dia(90), alteradoEm: dia(89) },
  ];
  return {
    lidaEm: agora.toISOString(),
    usuarios: USUARIOS,
    avisos: ['A chave de API do LineChat não lê o histórico dos cards (recusou "Logs", "ResultDescription"): os chamados nascem na etapa em que estão.'],
    painel: {
      id: PAINEL_ATIVIDADES, nome: 'Luan - Atividades', sigla: 'LA', vendas: false,
      etapas: etapas.map((nome, i) => ({ id: `ha-e${i}`, nome, posicao: i + 1, inicial: nome === 'Novos', arquivada: false, final: nome === 'Concluído' || nome === 'Validado' })),
      campos: [], etiquetas: [],
    },
    cards,
  };
}

/**
 * O que a chave de API do LineChat lê do painel de exemplo (como no ar, 24/10): sem o histórico e sem a
 * Conclusão; o motivo da perda vem (o LostReason da lista).
 */
export function comoAChaveLe(helena: LeituraDoHelena): LeituraDoHelena {
  return {
    ...helena,
    avisos: ['A chave de API do LineChat não lê o histórico dos cards (recusou "Logs", "ResultDescription"): as negociações nascem na etapa em que estão.'],
    cards: helena.cards.map((c) => ({ ...c, logs: null, concluidoEm: null })),
  };
}

/** A planilha que o "Exportar" do Helena de exemplo faz: o código, a situação, a Conclusão e o motivo (sem os arquivados). */
export function planilhaDeExemplo(helena: LeituraDoHelena): LinhaDaPlanilhaDoHelena[] {
  const situacao: Record<string, string> = { WON: 'Ganho', LOST: 'Perdido', OPEN: 'Em andamento' };
  return helena.cards.filter((c) => c.situacao !== 'ARCHIVED' && c.codigo).map((c) => ({
    codigo: c.codigo!, situacao: situacao[c.situacao] ?? null,
    conclusao: (c.situacao === 'WON' || c.situacao === 'LOST') && c.concluidoEm ? diaLocal(c.concluidoEm) : null,
    motivo: c.situacao === 'LOST' ? c.motivo : null,
  }));
}

// =====================================================================
//  O MÓDULO
// =====================================================================

export function criarHelenaDemo(ctx: ContextoHelenaDemo): Api['helena'] {
  const agora = () => ctx.agora?.() ?? new Date();
  /** `daApi`: o que a chave leu (sem a planilha); `exemplo`: o Helena inteiro (a planilha de exemplo sai dele); `leitura`: a que vale */
  type Leitura = LeituraDoHelenaNaTela & { leitura: LeituraDoHelena; daApi: LeituraDoHelena; exemplo: LeituraDoHelena };
  const leituras = new Map<string, Leitura>();
  const naTela = (l: Leitura): LeituraDoHelenaNaTela => ({
    id: l.id, painelId: l.painelId, painelNome: l.painelNome, estado: l.estado, lidos: l.lidos, total: l.total, erro: l.erro, comecouEm: l.comecouEm, acabouEm: l.acabouEm,
    planilha: l.leitura.planilha ?? null,
  });
  const exigir = () => { ctx.requirePerm('data.import'); ctx.requirePerm('tickets.manage'); };
  const pegar = (id: string) => {
    const l = leituras.get(id);
    if (!l) throw erro(410, 'Essa leitura do Helena não está mais guardada (ela fica duas horas). Leia o Helena de novo.');
    return l;
  };
  const pronta = (id: string) => {
    const l = pegar(id);
    if (l.estado === 'lendo') throw erro(409, `Ainda lendo o Helena (${l.lidos} de ${l.total ?? '…'}). Espere acabar.`);
    return l.leitura;
  };
  const hoje = () => new Date(agora().getTime() - 3 * 3_600_000).toISOString().slice(0, 10);

  return {
    async opcoes(): Promise<OpcoesDoTrazerDoHelena> {
      await ctx.wait(150);
      exigir();
      return {
        conectado: true, erro: null,
        helena: [
          { id: PAINEL, nome: 'Ingline - Comercial', sigla: 'IC', vendas: true },
          { id: 'helena-suporte', nome: 'Ingline - Suporte', sigla: 'IS', vendas: false },
          { id: PAINEL_ATIVIDADES, nome: 'Luan - Atividades', sigla: 'LA', vendas: false },
        ],
        destinos: acessoDoHelenaDemo().destinos(),
      };
    },
    async ler(painelId) {
      await ctx.wait(200);
      exigir();
      if (painelId !== PAINEL && painelId !== PAINEL_ATIVIDADES) throw erro(400, 'Na prévia, só os painéis Ingline - Comercial e Luan - Atividades têm cards de exemplo.');
      const exemplo = painelId === PAINEL ? helenaDeExemplo(agora()) : atividadesDeExemplo(agora());
      const leitura = painelId === PAINEL ? comoAChaveLe(exemplo) : exemplo;
      const l: Leitura = {
        id: ctx.id(), painelId, painelNome: leitura.painel.nome, estado: 'lendo', lidos: 0, total: leitura.cards.length, erro: null,
        comecouEm: agora().toISOString(), acabouEm: null, leitura, daApi: leitura, exemplo,
      };
      leituras.set(l.id, l);
      return naTela(l);
    },
    async leitura(id) {
      await ctx.wait(250);
      exigir();
      const l = pegar(id);
      // a leitura anda card a card (a de verdade pede o histórico de cada um)
      if (l.estado === 'lendo') {
        l.lidos = Math.min(l.total ?? 0, l.lidos + POR_PERGUNTA);
        if (l.lidos >= (l.total ?? 0)) { l.estado = 'pronta'; l.acabouEm = agora().toISOString(); }
      }
      return naTela(l);
    },
    async planilha(id, entrada) {
      await ctx.wait(400);
      exigir();
      pronta(id);
      const l = pegar(id);
      const link = entrada.link?.trim() || null;
      const csv = entrada.csv ?? null;
      if (!!link === (csv !== null && csv.trim() !== '')) throw erro(400, MENSAGENS_DA_PLANILHA_DO_HELENA.umDosDois);
      if (link && !linkDoCsvDaPlanilha(link)) throw erro(400, MENSAGENS_DA_PLANILHA_DO_HELENA.naoEGoogle);
      // na prévia não se baixa nada do Google: o link usa a planilha do Helena de exemplo
      const texto = link ? csvDaPlanilhaDoHelena(planilhaDeExemplo(l.exemplo)) : csv!;
      const r = leituraComAPlanilha(l.daApi, texto, { origem: link ? 'link' : 'arquivo', nome: link ? null : entrada.nome ?? null });
      if (r.erro !== null) throw erro(400, r.erro);
      l.leitura = r.leitura;
      return naTela(l);
    },
    async previa(id, destino) {
      await ctx.wait(250);
      exigir();
      const leitura = pronta(id);
      return planoDaImportacao(leitura, acessoDoHelenaDemo().estado(destino, leitura.painel, hoje())).previa;
    },
    async trazer(id, destino) {
      await ctx.wait(500);
      exigir();
      const leitura = pronta(id);
      const g = acessoDoHelenaDemo();
      const ator = g.eu();
      // a conferência antes de gravar qualquer coisa (o servidor faz numa transação: tudo ou nada)
      const antes = planoDaImportacao(leitura, g.estado(destino, leitura.painel, hoje()));
      if (antes.previa.erro) throw erro(400, antes.previa.erro);
      const painelId = destino ?? g.criarPainel(leitura.painel);
      const plano = planoDaImportacao(leitura, g.estado(painelId, leitura.painel, hoje()));
      const { nome, sigla } = g.gravar(ator, painelId, plano, agora(), !destino);
      const previa = destino ? plano.previa : { ...plano.previa, destino: { ...plano.previa.destino, novo: true } };
      const resumo = resumoDaImportacao(previa);
      ctx.audit('import', 'ticket_panel', resumo, painelId, {
        after: {
          painel: `${nome} (${sigla})`, doHelena: previa.painelHelena.nome, negociacoes: previa.negociacoes,
          etapas: previa.etapas.ordem, camposCriados: previa.campos.cria.map((c) => c.nome), motivosNovos: previa.motivosNovos, avisos: previa.avisos,
        },
      });
      return { resumo, painelId, painelNome: nome, sigla, previa };
    },
  };
}
