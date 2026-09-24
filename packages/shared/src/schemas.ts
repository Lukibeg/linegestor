/**
 * Os "formatos" de cada dado que circula entre tela e servidor.
 *
 * Cada schema diz: quais campos existem, qual o tipo, o que é obrigatório e qual a regra.
 * O servidor recusa qualquer pedido que não bata com o schema; a tela usa o mesmo schema
 * para avisar a pessoa antes de enviar. Uma regra, escrita uma vez.
 */
import { z } from 'zod';
import { cnpjLimpo, cnpjValido, diaAoMeioDia, didLimpo, didValido, macLimpo, macValido, serieLimpa } from './formatos.js';

// ---------- Blocos reutilizáveis ----------

export const IdSchema = z.string().min(1);

/**
 * Sim/não vindo do endereço (?terceiros=false). `Booleano` NÃO serve: para ele o texto
 * "false" é verdadeiro (texto não vazio). Aqui só "true", "1" e o próprio `true` contam como sim.
 */
export const Booleano = z.preprocess((v) => v === true || v === 'true' || v === '1' || v === 1, z.boolean());

/**
 * "Ver tudo": a tela pede este tamanho de página para trazer a lista inteira de uma vez.
 * Nenhuma lista do sistema esconde linhas — a paginação é só para abrir rápido.
 */
export const SEM_LIMITE = 100_000;

export const PaginacaoSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(SEM_LIMITE).default(50),
});

/** Data vinda de um campo de calendário: guardada ao meio-dia UTC, para não "voltar um dia" no Brasil. */
const DiaSchema = z.coerce.date().transform((d) => diaAoMeioDia(d));

/**
 * Ordenação de tabela: `sort` é o nome da coluna (o mesmo id que a tela usa) e `dir` o sentido.
 * Aceita qualquer texto porque algumas colunas são criadas na hora (ex.: "modulo:linepbx:fop2");
 * o servidor ignora o que não conhece e volta para a ordem padrão daquela tela.
 */
export const OrdenacaoSchema = z.object({
  sort: z.string().trim().max(60).optional(),
  /** sem valor = cada tela usa o sentido natural dela (nomes crescendo, datas decrescendo) */
  dir: z.enum(['asc', 'desc']).optional(),
});

export const CnpjSchema = z
  .string()
  .transform(cnpjLimpo)
  .refine((v) => v.length === 14, 'CNPJ precisa ter 14 dígitos')
  .refine(cnpjValido, 'CNPJ inválido (dígito verificador não confere)');

export const DidNumeroSchema = z
  .string()
  .transform(didLimpo)
  .refine(didValido, 'Número precisa ter DDD + 8 ou 9 dígitos');

export const MacSchema = z
  .string()
  .transform(macLimpo)
  .refine(macValido, 'MAC precisa ter 12 caracteres hexadecimais (ex.: 00:0B:82:A1:B2:C3)');

export const CentavosSchema = z.number().int().min(0);

/** Campo de senha ao GRAVAR: texto puro que o servidor cifra antes de guardar. Nunca volta na leitura. */
export const SenhaEntradaSchema = z.string().min(1).max(500);

/** Como uma senha aparece ao LER: só se existe, nunca o valor. */
export const SenhaSaidaSchema = z.object({ hasSecret: z.boolean(), secretId: IdSchema.nullable() });

// ---------- Clientes ----------

export const ClienteCriarSchema = z.object({
  tradeName: z.string().trim().min(2, 'Nome fantasia muito curto').max(120),
  legalName: z.string().trim().min(2, 'Razão social muito curta').max(200),
  cnpj: CnpjSchema,
  archived: z.boolean().default(false),
  notes: z.string().max(5000).optional().nullable(),
});
export const ClienteAtualizarSchema = ClienteCriarSchema.partial();

export const ClienteListarSchema = PaginacaoSchema.merge(OrdenacaoSchema).extend({
  q: z.string().trim().max(120).optional(),
  /** códigos de produto para filtrar */
  products: z.union([z.string(), z.array(z.string())]).optional().transform((v) => (v == null ? [] : Array.isArray(v) ? v : [v])),
  /** "or" = tem qualquer um dos produtos · "and" = tem todos */
  mode: z.enum(['or', 'and']).default('or'),
  /** módulos para filtrar, no formato "produto:modulo" (ex.: "linepbx:fop2"); segue o mesmo modo */
  modules: z.union([z.string(), z.array(z.string())]).optional().transform((v) => (v == null ? [] : Array.isArray(v) ? v : [v])),
  includeArchived: Booleano.default(false),
});

// ---------- Assinaturas (cliente × produto) ----------

export const LinePbxSettingsSchema = z.object({
  hostingId: IdSchema.nullable().optional(),
  serverIp: z.string().trim().max(64).nullable().optional(),
  domain: z.string().trim().max(200).nullable().optional(),
  /** Não aparece mais na tela (cada técnico usa o próprio usuário); aceito só por compatibilidade */
  sshUser: z.string().trim().max(64).nullable().optional(),
  sshPort: z.coerce.number().int().min(1).max(65535).nullable().optional(),
  /** só na gravação; "" ou ausente = mantém a senha atual */
  sshPassword: SenhaEntradaSchema.optional(),
});
export const Fop2SettingsSchema = z.object({
  adminExtension: z.string().trim().max(64).nullable().optional(),
  /** Senha do usuário padrão do FOP2 — só na gravação; ausente = mantém */
  defaultUserPassword: SenhaEntradaSchema.optional(),
});
export const OmniboardSettingsSchema = z.object({
  adminLogin: z.string().trim().max(200).nullable().optional(),
  adminPassword: SenhaEntradaSchema.optional(),
  userDefaultPassword: SenhaEntradaSchema.optional(),
});
export const SzchatSettingsSchema = z.object({
  adminLogin: z.string().trim().max(200).nullable().optional(),
  adminPassword: SenhaEntradaSchema.optional(),
});

/**
 * Marcar/ajustar um produto no cliente. Não existe valor mensal por produto:
 * por decisão do negócio, só aparelhos e circuitos têm custo registrado.
 */
export const AssinaturaGravarSchema = z.object({
  productCode: z.string().min(1),
  activatedAt: DiaSchema.nullable().optional(),
  deactivatedAt: DiaSchema.nullable().optional(),
  notes: z.string().max(5000).nullable().optional(),
  settings: z.union([LinePbxSettingsSchema, SzchatSettingsSchema, z.object({})]).optional(),
});

/** Ligar/ajustar um MÓDULO dentro de um produto que o cliente já assina (ex.: FOP2 dentro do LinePBX). */
export const ModuloGravarSchema = z.object({
  productCode: z.string().min(1),
  moduleCode: z.string().min(1),
  activatedAt: DiaSchema.nullable().optional(),
  deactivatedAt: DiaSchema.nullable().optional(),
  notes: z.string().max(5000).nullable().optional(),
  settings: z.union([Fop2SettingsSchema, OmniboardSettingsSchema, z.object({})]).optional(),
});

/** Administração: criar ou editar um módulo do catálogo de um produto. */
export const ModuloCatalogoSchema = z.object({
  code: z.string().trim().min(1).max(40).regex(/^[a-z0-9_]+$/, 'Use só letras minúsculas, números e _'),
  name: z.string().trim().min(1).max(80),
  description: z.string().max(300).nullable().optional(),
  hasSettings: z.boolean().optional(),
  active: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

/** Administração: criar um produto novo no portfólio. */
export const ProdutoCriarSchema = z.object({
  code: z.string().trim().min(1).max(40).regex(/^[a-z0-9_]+$/, 'Use só letras minúsculas, números e _'),
  name: z.string().trim().min(1).max(80),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Cor no formato #RRGGBB').default('#2457D6'),
  description: z.string().trim().max(300).nullable().optional(),
});

/** Um endereço IP (v4) como a pessoa digita; vazio vira nulo. */
const IpSchema = z
  .string()
  .trim()
  .max(64)
  .refine((v) => !v || /^\d{1,3}(\.\d{1,3}){3}$/.test(v), 'IP inválido (ex.: 10.20.0.1)')
  .transform((v) => v || null);

/** Uma unidade do cliente (matriz, filial, loja): nome, endereço e o IP fixo de saída da rede dela. */
export const UnidadeGravarSchema = z.object({
  name: z.string().trim().min(1, 'Informe o nome da unidade').max(120),
  address: z.string().trim().max(300).nullable().optional(),
  /** o IP fixo de saída da internet desta unidade (o que a operadora e o servidor enxergam) */
  egressIp: IpSchema.nullable().optional(),
  note: z.string().trim().max(500).nullable().optional(),
});

/** Login e senha padrão dos aparelhos de um MODELO no cliente (todos os GXP1610 dele usam o mesmo). */
export const LoginModeloGravarSchema = z.object({
  modelId: IdSchema,
  username: z.string().trim().max(120).nullable().optional(),
  /** só na gravação; ausente = mantém a senha atual */
  password: SenhaEntradaSchema.optional(),
  note: z.string().trim().max(500).nullable().optional(),
});

/** Configuração de rede padrão dos aparelhos do cliente (o que se digita nos telefones). */
export const RedePadraoSchema = z.object({
  ipAddress: z.string().trim().max(64).nullable().optional(),
  subnetMask: IpSchema.nullable().optional(),
  defaultRouter: IpSchema.nullable().optional(),
  dns1: IpSchema.nullable().optional(),
  dns2: IpSchema.nullable().optional(),
  /** senha do ramal sem fio — só na gravação; ausente = mantém */
  wirelessPassword: SenhaEntradaSchema.optional(),
  note: z.string().trim().max(1000).nullable().optional(),
});

/**
 * Envio da logo do cliente: a imagem vem embutida no próprio pedido, como "data:image/png;base64,...".
 * A interface já reduz a imagem antes de enviar; aqui só conferimos tipo e tamanho.
 */
export const LogoGravarSchema = z.object({
  dataUrl: z
    .string()
    .max(700_000, 'Imagem muito grande (máximo 512 KB). Escolha uma imagem menor.')
    .regex(/^data:image\/(png|jpeg|webp|gif|svg\+xml);base64,[A-Za-z0-9+/=]+$/, 'Formato não suportado. Use PNG, JPG, WEBP ou SVG.'),
});

// ---------- Circuitos ----------

/**
 * Número chave (ou "número piloto"): o número principal do feixe junto à operadora.
 * Guardamos só os dígitos quando parece um telefone; qualquer outro formato fica como foi digitado.
 */
export const NumeroChaveSchema = z
  .string()
  .trim()
  .max(40)
  .transform((v) => (didValido(didLimpo(v)) ? didLimpo(v) : v));

export const CircuitoGravarSchema = z.object({
  name: z.string().trim().min(1).max(120),
  code: z.string().trim().min(1, 'O N° do circuito é obrigatório').max(40),
  keyNumber: NumeroChaveSchema.nullable().optional(),
  carrierId: IdSchema.nullable().optional(),
  channels: z.coerce.number().int().min(0).max(10000),
  ownerClientId: IdSchema.nullable().optional(),
  monthlyValueCents: CentavosSchema.nullable().optional(),
  /** por IP (IP da operadora + IP do PBX) ou por login e senha do tronco */
  authType: z.enum(['ip', 'login']).default('ip'),
  signalingIp: z.string().trim().max(64).nullable().optional(),
  authIp: z.string().trim().max(200).nullable().optional(),
  authUsername: z.string().trim().max(120).nullable().optional(),
  authPassword: SenhaEntradaSchema.optional(),
  notes: z.string().max(5000).nullable().optional(),
  /** true = tronco do próprio cliente, com outra operadora. Fica fora das listas até se pedir. */
  thirdParty: Booleano.optional(),
});
export const CircuitoAtualizarSchema = CircuitoGravarSchema.partial();

/** Filtros da tela de Circuitos. Os mesmos valem para os cartões de resumo no topo. */
export const CircuitoListarSchema = PaginacaoSchema.merge(OrdenacaoSchema).extend({
  q: z.string().trim().max(120).optional(),
  carrierId: IdSchema.optional(),
  /** titular (quem detém o contrato junto à operadora) */
  ownerClientId: IdSchema.optional(),
  /** ligar o interruptor "links de terceiros" traz também o que não é da VoiceNet */
  includeThirdParty: Booleano.default(false),
});

// ---------- DIDs ----------

export const DidListarSchema = PaginacaoSchema.extend({
  q: z.string().trim().max(40).optional(),
  circuitId: IdSchema.optional(),
  clientId: z.union([IdSchema, z.literal('free')]).optional(),
  ownerClientId: IdSchema.optional(),
  /** só os marcados como em uso (true) ou como não usados (false) */
  inUse: z.enum(['true', 'false']).optional(),
  /** o mesmo interruptor da lista de circuitos: sem ele, número de terceiro não aparece */
  includeThirdParty: Booleano.default(false),
  sort: z.string().trim().max(60).optional(),
  dir: z.enum(['asc', 'desc']).optional(),
});

/** Todo DID nasce dentro de um circuito: não existe "DID sem circuito". */
export const DidCriarFaixaSchema = z.object({
  baseNumber: DidNumeroSchema,
  quantity: z.coerce.number().int().min(1).max(1000, 'No máximo 1.000 números por vez'),
  circuitId: IdSchema.min(1, 'Escolha o circuito'),
  clientId: IdSchema.nullable().optional(),
  ownerClientId: IdSchema.nullable().optional(),
  note: z.string().max(500).nullable().optional(),
});

/** Edição em massa: SEMPRE por lista explícita de ids (decisão de arquitetura, seção DIDs). */
export const DidEditarEmMassaSchema = z.object({
  ids: z.array(IdSchema).min(1).max(5000),
  set: z
    .object({
      /** mudar de circuito — sempre para um circuito, nunca para "nenhum" */
      circuitId: IdSchema.optional(),
      clientId: IdSchema.nullable().optional(),
      /** marcar como em uso / não usado */
      inUse: z.boolean().optional(),
      note: z.string().max(500).nullable().optional(),
    })
    .refine((s) => Object.keys(s).length > 0, 'Escolha pelo menos um campo para alterar'),
});

export const DidAtualizarSchema = z.object({
  circuitId: IdSchema.optional(),
  clientId: IdSchema.nullable().optional(),
  ownerClientId: IdSchema.nullable().optional(),
  inUse: z.boolean().optional(),
  note: z.string().max(500).nullable().optional(),
});

// ---------- Inventário ----------

export const ModeloGravarSchema = z.object({
  code: z.string().trim().min(1).max(40),
  name: z.string().trim().min(1).max(120),
  categoryId: IdSchema.nullable().optional(),
  imageUrl: z.string().max(500).nullable().optional(),
  /** Valor de cada unidade deste modelo (centavos). É o que soma no cliente. */
  valueCents: CentavosSchema.nullable().optional(),
});
export const ModeloAtualizarSchema = ModeloGravarSchema.partial().extend({
  /** true = todos os aparelhos deste modelo passam a usar o valor do modelo (some o valor próprio) */
  aplicarValorATodos: z.boolean().optional(),
});

/** Número de série como está na etiqueta (sem espaços, maiúsculas). */
export const SerieSchema = z.string().transform(serieLimpa).refine((v) => v.length >= 2 && v.length <= 80, 'Número de série precisa ter de 2 a 80 caracteres');

export const AparelhoGravarSchema = z.object({
  modelId: IdSchema,
  /** Nulo em aparelho sem MAC (headset, cabo): a tela mostra o N/S, ou "não aplicável". */
  mac: MacSchema.nullable().optional(),
  macSecondary: MacSchema.nullable().optional(),
  /** Número de série, para quem não tem MAC mas tem etiqueta de série */
  serialNumber: SerieSchema.nullable().optional(),
  /** Unidade do cliente (filial, loja, andar) onde o aparelho está */
  unit: z.string().trim().max(120).nullable().optional(),
  condition: z.enum(['ativo', 'inativo']).default('ativo'),
  /** Valor próprio. Vazio = vale o valor do modelo (o normal). */
  valueCents: CentavosSchema.nullable().optional(),
  ip: z.string().trim().max(64).nullable().optional(),
  /** Saiu da tela; aceito só por compatibilidade */
  location: z.string().trim().max(120).nullable().optional(),
  note: z.string().max(2000).nullable().optional(),
});
export const AparelhoAtualizarSchema = AparelhoGravarSchema.partial().omit({ modelId: true });

/**
 * Cadastro em massa: uma lista colada de MACs ou de números de série (um aparelho por item),
 * ou uma quantidade de aparelhos sem identificação (headset, cabo). Grava tudo ou nada.
 */
export const AparelhosEmMassaSchema = z.object({
  modelId: IdSchema,
  tipo: z.enum(['mac', 'serie', 'nenhum']),
  /** MACs ou números de série, um por aparelho (quando tipo for mac ou serie) */
  valores: z.array(z.string().trim().min(1)).max(2000, 'No máximo 2.000 aparelhos por vez').default([]),
  /** quantos aparelhos sem identificação (quando tipo for nenhum) */
  quantidade: z.coerce.number().int().min(1).max(2000, 'No máximo 2.000 aparelhos por vez').optional(),
  condition: z.enum(['ativo', 'inativo']).default('ativo'),
  note: z.string().max(2000).nullable().optional(),
});

export const MovimentacaoCriarSchema = z.object({
  modality: z.enum(['locacao', 'venda', 'comodato', 'devolucao']),
  /** destino: estoque ou cliente */
  toClientId: IdSchema.nullable(),
  /** condição a aplicar nos aparelhos movidos; null = manter */
  newCondition: z.enum(['ativo', 'inativo']).nullable().optional(),
  items: z.array(z.object({ deviceId: IdSchema })).min(1, 'Adicione pelo menos um aparelho'),
  /** Unidade do cliente de destino (filial, loja): vale para todos os aparelhos desta movimentação */
  unit: z.string().trim().max(120).nullable().optional(),
  note: z.string().max(2000).nullable().optional(),
});

// ---------- Usuários e sessão ----------

export const LoginSchema = z.object({
  email: z.string().trim().toLowerCase().email('E-mail inválido'),
  password: z.string().min(1, 'Informe a senha'),
});

/** O código de 6 dígitos do aplicativo — ou um código de recuperação, no formato ABCDE-12345. */
export const CodigoSegundaEtapaSchema = z.object({
  code: z.string().trim().min(6, 'Informe o código').max(20),
});

/** Ajustes › Backup no Google Drive. A chave só vem quando a pessoa envia um arquivo novo. */
export const AjustesBackupSchema = z.object({
  ativo: z.boolean(),
  pasta: z.string().trim().max(200).default(''),
  pastaId: z.string().trim().max(200),
  /** Conteúdo do arquivo JSON da conta de serviço; vazio = manter a chave que já está guardada */
  chaveJson: z.string().max(20000).optional(),
});

/** Ajustes › Avisos. Qualquer API que aceite uma chamada HTTP serve — inclusive a do LineChat. */
export const AjustesAvisosSchema = z.object({
  ativo: z.boolean(),
  url: z.string().trim().max(500),
  metodo: z.enum(['POST', 'GET']).default('POST'),
  cabecalhos: z.string().max(4000).default('{}'),
  corpo: z.string().max(4000).default(''),
  /** Token da API; vazio = manter o que já está guardado */
  token: z.string().max(2000).optional(),
});

/**
 * Chamados do LineChat: de onde ler. O token vai para o cofre; vazio = manter o que já está lá.
 * O painel é escolhido numa lista que o próprio LineChat devolve (ver /settings/linechat/paineis).
 */
export const AjustesLineChatSchema = z.object({
  ativo: z.boolean(),
  /** Endereço da API (o do LineChat é https://api.inglinechat.com.br) */
  url: z.string().trim().url('Endereço inválido (ex.: https://api.inglinechat.com.br)').max(300),
  /** Endereço onde a equipe abre os cards, para o link da tabela (https://inglinechat.com.br) */
  appUrl: z.string().trim().url('Endereço inválido (ex.: https://inglinechat.com.br)').max(300),
  painelId: z.string().trim().max(80).default(''),
  painelNome: z.string().trim().max(200).default(''),
  token: z.string().trim().max(2000).optional(),
});

/** Desligar a verificação em duas etapas exige digitar a própria senha de novo. */
export const DesligarSegundaEtapaSchema = z.object({
  password: z.string().min(1, 'Informe a sua senha'),
});

/** Minha conta: o que cada pessoa ajusta em si mesma. */
export const MinhaContaSchema = z.object({
  /** O seu usuário SSH (o mesmo em todos os servidores). Vazio = sem usuário no atalho. */
  sshUser: z.string().trim().max(64).regex(/^[A-Za-z0-9._-]*$/, 'Use só letras, números, ponto, hífen e _').nullable(),
});

export const UsuarioCriarSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(10, 'Senha precisa ter pelo menos 10 caracteres'),
  roleId: IdSchema,
  active: z.boolean().default(true),
});
export const UsuarioAtualizarSchema = UsuarioCriarSchema.partial();

export const PapelGravarSchema = z.object({
  name: z.string().trim().min(2).max(60),
  description: z.string().max(300).optional().nullable(),
  permissions: z.array(z.string()),
});

export const CatalogoItemSchema = z.object({
  name: z.string().trim().min(1).max(120),
  active: z.boolean().default(true),
});

// ---------- Novidades (notas de versão) ----------

/** O tipo de um item da nota: a cor e o rótulo do cartão. */
export const TIPOS_NOVIDADE = {
  novo: 'Novo',
  melhorou: 'Melhorou',
  corrigido: 'Corrigido',
  /** mudança de regra: muda o jeito de trabalhar */
  atencao: 'Atenção',
} as const;
export type TipoNovidade = keyof typeof TIPOS_NOVIDADE;

/** Um item (cartão) da nota: rótulo, título, duas ou três linhas e, se houver, um print. */
export const NovidadeItemSchema = z.object({
  /** vazio = item novo; preenchido = o item que já existe */
  id: IdSchema.optional(),
  kind: z.enum(['novo', 'melhorou', 'corrigido', 'atencao']).default('novo'),
  title: z.string().trim().min(1, 'Dê um título ao item').max(160),
  text: z.string().trim().max(2000).nullable().optional(),
  /** imagem embutida ("data:image/png;base64,…") para trocar o print; ausente = mantém; null = tira */
  imagem: z
    .string()
    .max(2_800_000, 'Imagem muito grande (máximo 2 MB). Escolha uma imagem menor.')
    .regex(/^data:image\/(png|jpeg|webp|gif|svg\+xml);base64,[A-Za-z0-9+/=]+$/, 'Formato não suportado. Use PNG, JPG, WEBP ou SVG.')
    .nullable()
    .optional(),
});

/** A nota inteira: cabeçalho + os itens, na ordem em que aparecem. */
export const NovidadeGravarSchema = z.object({
  version: z.string().trim().min(1, 'Informe o número do patch (ex.: 1.3)').max(60).regex(/^[a-z0-9._-]+$/, 'Use só letras minúsculas, números, ponto, hífen e _'),
  title: z.string().trim().min(1, 'Dê um título à nota').max(160),
  summary: z.string().trim().max(500).nullable().optional(),
  items: z.array(NovidadeItemSchema).max(60, 'No máximo 60 itens por nota').default([]),
});
export const NovidadeAtualizarSchema = NovidadeGravarSchema.partial();

// ---------- Projetos ----------

/** As situações de um cliente dentro do projeto, na ordem em que aparecem no painel. */
export const SITUACOES_PROJETO = ['pendente', 'andamento', 'travado', 'concluido', 'nao_se_aplica'] as const;
export const SituacaoProjetoSchema = z.enum(SITUACOES_PROJETO);

/** Data-alvo como o campo de calendário manda: "AAAA-MM-DD", guardada como texto (não tem hora). */
const DiaTextoSchema = z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida');

/**
 * As cores que uma opção pode ter. As seis primeiras são as do resto do sistema; roxo, rosa,
 * turquesa e amarelo chegaram no Patch 1.4 (pedido do Luan: mais cores para as opções).
 */
export const CORES_OPCAO = ['neutral', 'accent', 'ok', 'signal', 'bad', 'muted', 'roxo', 'rosa', 'turquesa', 'amarelo'] as const;

/**
 * Uma opção de uma etapa do tipo lista ("Pendente", "Mensagem enviada", …).
 * `conclui` diz se escolher esta opção **fecha** a etapa — é o que faz "Sem necessidade" e
 * "Configuração realizada" contarem como resolvido, e "Pendente" não.
 * O `id` é estável: trocar o rótulo não perde o que já foi escolhido.
 */
export const OpcaoEtapaSchema = z.object({
  id: z.string().trim().min(1).max(40).optional(),
  label: z.string().trim().min(1, 'Dê um nome à opção').max(60),
  tone: z.enum(CORES_OPCAO).default('neutral'),
  conclui: z.boolean().default(false),
});

/**
 * Uma etapa (coluna) do projeto. Sem `id` é nova; com `id`, é a que já existe
 * (mantém o que já foi marcado). `kind` escolhe entre caixinha e lista de opções.
 */
export const EtapaProjetoSchema = z
  .object({
    id: IdSchema.optional(),
    title: z.string().trim().min(1, 'Dê um nome à etapa').max(160),
    kind: z.enum(['check', 'escolha']).default('check'),
    options: z.array(OpcaoEtapaSchema).max(12, 'No máximo 12 opções por etapa').default([]),
  })
  .refine((e) => e.kind !== 'escolha' || e.options.length >= 2, {
    message: 'Uma etapa de lista precisa de ao menos duas opções',
    path: ['options'],
  })
  .refine((e) => e.kind !== 'escolha' || e.options.some((o) => o.conclui), {
    message: 'Marque ao menos uma opção como "resolve a etapa" — senão ela nunca fecha',
    path: ['options'],
  });

export const ProjetoGravarSchema = z.object({
  name: z.string().trim().min(1, 'Dê um nome ao projeto').max(160),
  goal: z.string().trim().max(4000).nullable().optional(),
  dueDate: DiaTextoSchema.nullable().optional(),
  ownerId: IdSchema.nullable().optional(),
  etapas: z.array(EtapaProjetoSchema).max(30, 'No máximo 30 etapas por projeto').default([]),
  /** Os clientes que entram na lista ao criar */
  clientIds: z.array(IdSchema).max(500, 'No máximo 500 clientes por projeto').default([]),
});
export const ProjetoAtualizarSchema = ProjetoGravarSchema.partial().extend({
  status: z.enum(['aberto', 'concluido', 'cancelado']).optional(),
});

/** Acrescentar clientes à lista de um projeto que já existe. */
export const ProjetoClientesSchema = z.object({
  clientIds: z.array(IdSchema).min(1, 'Escolha ao menos um cliente').max(500),
  /** Responsável aplicado a todos os que entrarem agora */
  assigneeId: IdSchema.nullable().optional(),
});

/** Mexer numa linha: trocar o responsável ou a situação. "Travado" exige o motivo. */
export const ProjetoLinhaSchema = z
  .object({
    assigneeId: IdSchema.nullable().optional(),
    status: SituacaoProjetoSchema.optional(),
    blockedReason: z.string().trim().max(500).nullable().optional(),
  })
  .refine((v) => v.status !== 'travado' || !!v.blockedReason?.trim(), {
    message: 'Diga por que está travado',
    path: ['blockedReason'],
  });

/**
 * Mexer numa etapa de um cliente: `feito` na caixinha, `valor` (o id da opção) na lista.
 * `valor: null` limpa a escolha.
 */
export const ProjetoMarcarSchema = z
  .object({
    feito: z.boolean().optional(),
    valor: z.string().trim().max(40).nullable().optional(),
  })
  .refine((v) => v.feito !== undefined || v.valor !== undefined, { message: 'Diga o que marcar' });

export const ProjetoComentarioSchema = z.object({
  body: z.string().trim().min(1, 'Escreva o comentário').max(4000),
  /** Nulo = recado do projeto inteiro; preenchido = conversa sobre aquele cliente */
  projectClientId: IdSchema.nullable().optional(),
});

/** Um anexo: qualquer formato. O conteúdo vem embutido ("data:<tipo>;base64,…"). */
export const ProjetoAnexoSchema = z.object({
  fileName: z.string().trim().min(1, 'O arquivo precisa de um nome').max(200),
  projectClientId: IdSchema.nullable().optional(),
  conteudo: z
    .string()
    .min(1)
    .max(14_000_000, 'Arquivo muito grande (máximo 10 MB)')
    .regex(/^data:[-\w.+]+\/[-\w.+]+(;[-\w.=]+)*;base64,[A-Za-z0-9+/=]+$/, 'Não consegui ler esse arquivo'),
});

export const ProjetoListarSchema = z.object({
  status: z.enum(['aberto', 'concluido', 'cancelado', 'todos']).default('aberto'),
  q: z.string().trim().max(120).optional(),
});

// ---------- Importação ----------

export const ImportacaoSchema = z.object({
  entity: z.enum(['clients', 'circuits', 'dids']),
  csv: z.string().min(1).max(20_000_000),
  delimiter: z.enum([';', ',', '\t']).default(';'),
});

export const AuditoriaListarSchema = PaginacaoSchema.merge(OrdenacaoSchema).extend({
  entityType: z.string().optional(),
  entityId: z.string().optional(),
  userId: z.string().optional(),
  action: z.string().optional(),
});

// ---------- Tipos derivados ----------

export type ClienteCriar = z.infer<typeof ClienteCriarSchema>;
export type ClienteAtualizar = z.infer<typeof ClienteAtualizarSchema>;
export type ClienteListar = z.infer<typeof ClienteListarSchema>;
export type AssinaturaGravar = z.infer<typeof AssinaturaGravarSchema>;
export type ModuloGravar = z.infer<typeof ModuloGravarSchema>;
export type ModuloCatalogo = z.infer<typeof ModuloCatalogoSchema>;
export type CircuitoGravar = z.infer<typeof CircuitoGravarSchema>;
export type CircuitoListar = z.infer<typeof CircuitoListarSchema>;
export type Ordenacao = z.infer<typeof OrdenacaoSchema>;
export type LogoGravar = z.infer<typeof LogoGravarSchema>;
export type DidListar = z.infer<typeof DidListarSchema>;
export type DidCriarFaixa = z.infer<typeof DidCriarFaixaSchema>;
export type DidEditarEmMassa = z.infer<typeof DidEditarEmMassaSchema>;
export type ModeloGravar = z.infer<typeof ModeloGravarSchema>;
export type ModeloAtualizar = z.infer<typeof ModeloAtualizarSchema>;
export type AparelhosEmMassa = z.infer<typeof AparelhosEmMassaSchema>;
export type ProdutoCriar = z.infer<typeof ProdutoCriarSchema>;
export type UnidadeGravar = z.infer<typeof UnidadeGravarSchema>;
export type LoginModeloGravar = z.infer<typeof LoginModeloGravarSchema>;
export type RedePadrao = z.infer<typeof RedePadraoSchema>;
export type AparelhoGravar = z.infer<typeof AparelhoGravarSchema>;
export type MovimentacaoCriar = z.infer<typeof MovimentacaoCriarSchema>;
export type Login = z.infer<typeof LoginSchema>;
export type CodigoSegundaEtapa = z.infer<typeof CodigoSegundaEtapaSchema>;
export type UsuarioCriar = z.infer<typeof UsuarioCriarSchema>;
export type Importacao = z.infer<typeof ImportacaoSchema>;
export type NovidadeGravar = z.infer<typeof NovidadeGravarSchema>;
export type NovidadeItem = z.infer<typeof NovidadeItemSchema>;
export type SituacaoProjeto = z.infer<typeof SituacaoProjetoSchema>;
export type ProjetoGravar = z.infer<typeof ProjetoGravarSchema>;
export type ProjetoAtualizar = z.infer<typeof ProjetoAtualizarSchema>;
export type ProjetoLinha = z.infer<typeof ProjetoLinhaSchema>;
export type ProjetoAnexo = z.infer<typeof ProjetoAnexoSchema>;
export type EtapaProjeto = z.infer<typeof EtapaProjetoSchema>;
export type OpcaoEtapa = z.infer<typeof OpcaoEtapaSchema>;
