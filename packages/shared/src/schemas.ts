/**
 * Os "formatos" de cada dado que circula entre tela e servidor.
 *
 * Cada schema diz: quais campos existem, qual o tipo, o que é obrigatório e qual a regra.
 * O servidor recusa qualquer pedido que não bata com o schema; a tela usa o mesmo schema
 * para avisar a pessoa antes de enviar. Uma regra, escrita uma vez.
 */
import { z } from 'zod';
import { cnpjLimpo, cnpjValido, didLimpo, didValido, macLimpo, macValido } from './formatos.js';

// ---------- Blocos reutilizáveis ----------

export const IdSchema = z.string().min(1);

export const PaginacaoSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(500).default(50),
});

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
  includeArchived: z.coerce.boolean().default(false),
});

// ---------- Assinaturas (cliente × produto) ----------

export const LinePbxSettingsSchema = z.object({
  hostingId: IdSchema.nullable().optional(),
  serverIp: z.string().trim().max(64).nullable().optional(),
  domain: z.string().trim().max(200).nullable().optional(),
  sshUser: z.string().trim().max(64).nullable().optional(),
  sshPort: z.coerce.number().int().min(1).max(65535).nullable().optional(),
  /** só na gravação; "" ou ausente = mantém a senha atual */
  sshPassword: SenhaEntradaSchema.optional(),
});
export const Fop2SettingsSchema = z.object({
  adminExtension: z.string().trim().max(64).nullable().optional(),
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
  activatedAt: z.coerce.date().nullable().optional(),
  deactivatedAt: z.coerce.date().nullable().optional(),
  notes: z.string().max(5000).nullable().optional(),
  settings: z.union([LinePbxSettingsSchema, SzchatSettingsSchema, z.object({})]).optional(),
});

/** Ligar/ajustar um MÓDULO dentro de um produto que o cliente já assina (ex.: FOP2 dentro do LinePBX). */
export const ModuloGravarSchema = z.object({
  productCode: z.string().min(1),
  moduleCode: z.string().min(1),
  activatedAt: z.coerce.date().nullable().optional(),
  deactivatedAt: z.coerce.date().nullable().optional(),
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
  signalingIp: z.string().trim().max(64).nullable().optional(),
  authIp: z.string().trim().max(200).nullable().optional(),
  authUsername: z.string().trim().max(120).nullable().optional(),
  authPassword: SenhaEntradaSchema.optional(),
  notes: z.string().max(5000).nullable().optional(),
  /** true = tronco do próprio cliente, com outra operadora. Fica fora das listas até se pedir. */
  thirdParty: z.coerce.boolean().optional(),
});
export const CircuitoAtualizarSchema = CircuitoGravarSchema.partial();

/** Filtros da tela de Circuitos. Os mesmos valem para os cartões de resumo no topo. */
export const CircuitoListarSchema = PaginacaoSchema.merge(OrdenacaoSchema).extend({
  q: z.string().trim().max(120).optional(),
  carrierId: IdSchema.optional(),
  /** titular (quem detém o contrato junto à operadora) */
  ownerClientId: IdSchema.optional(),
  /** ligar o interruptor "links de terceiros" traz também o que não é da VoiceNet */
  includeThirdParty: z.coerce.boolean().default(false),
});

// ---------- DIDs ----------

export const DidListarSchema = PaginacaoSchema.extend({
  q: z.string().trim().max(40).optional(),
  circuitId: z.union([IdSchema, z.literal('none')]).optional(),
  clientId: z.union([IdSchema, z.literal('free')]).optional(),
  ownerClientId: IdSchema.optional(),
  /** o mesmo interruptor da lista de circuitos: sem ele, número de terceiro não aparece */
  includeThirdParty: z.coerce.boolean().default(false),
  sort: z.string().trim().max(60).optional(),
  dir: z.enum(['asc', 'desc']).optional(),
});

export const DidCriarFaixaSchema = z.object({
  baseNumber: DidNumeroSchema,
  quantity: z.coerce.number().int().min(1).max(1000, 'No máximo 1.000 números por vez'),
  circuitId: IdSchema.nullable().optional(),
  clientId: IdSchema.nullable().optional(),
  ownerClientId: IdSchema.nullable().optional(),
  note: z.string().max(500).nullable().optional(),
});

/** Edição em massa: SEMPRE por lista explícita de ids (decisão de arquitetura, seção DIDs). */
export const DidEditarEmMassaSchema = z.object({
  ids: z.array(IdSchema).min(1).max(5000),
  set: z
    .object({
      circuitId: IdSchema.nullable().optional(),
      clientId: IdSchema.nullable().optional(),
      note: z.string().max(500).nullable().optional(),
    })
    .refine((s) => Object.keys(s).length > 0, 'Escolha pelo menos um campo para alterar'),
});

export const DidAtualizarSchema = z.object({
  circuitId: IdSchema.nullable().optional(),
  clientId: IdSchema.nullable().optional(),
  ownerClientId: IdSchema.nullable().optional(),
  note: z.string().max(500).nullable().optional(),
});

// ---------- Inventário ----------

export const ModeloGravarSchema = z.object({
  code: z.string().trim().min(1).max(40),
  name: z.string().trim().min(1).max(120),
  categoryId: IdSchema.nullable().optional(),
  imageUrl: z.string().max(500).nullable().optional(),
});

export const AparelhoGravarSchema = z.object({
  modelId: IdSchema,
  /** Nulo em aparelho sem MAC (headset, cabo): a tela mostra "não aplicável". */
  mac: MacSchema.nullable().optional(),
  macSecondary: MacSchema.nullable().optional(),
  /** Unidade do cliente (filial, loja, andar) onde o aparelho está */
  unit: z.string().trim().max(120).nullable().optional(),
  condition: z.enum(['ativo', 'inativo']).default('ativo'),
  valueCents: CentavosSchema.nullable().optional(),
  ip: z.string().trim().max(64).nullable().optional(),
  location: z.string().trim().max(120).nullable().optional(),
  note: z.string().max(2000).nullable().optional(),
});
export const AparelhoAtualizarSchema = AparelhoGravarSchema.partial().omit({ modelId: true });

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

/** Desligar a verificação em duas etapas exige digitar a própria senha de novo. */
export const DesligarSegundaEtapaSchema = z.object({
  password: z.string().min(1, 'Informe a sua senha'),
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
export type AparelhoGravar = z.infer<typeof AparelhoGravarSchema>;
export type MovimentacaoCriar = z.infer<typeof MovimentacaoCriarSchema>;
export type Login = z.infer<typeof LoginSchema>;
export type CodigoSegundaEtapa = z.infer<typeof CodigoSegundaEtapaSchema>;
export type UsuarioCriar = z.infer<typeof UsuarioCriarSchema>;
export type Importacao = z.infer<typeof ImportacaoSchema>;
