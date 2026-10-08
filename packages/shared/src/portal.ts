/**
 * PORTAL DO CLIENTE (Patch 1.8, decisão 0040) — as regras que o servidor e a prévia usam iguais.
 *
 *  - quem entra: a pessoa ativa, que já criou a senha pelo convite, de um cliente que está na
 *    base (com produto ativo, fora do arquivo e da lixeira). Saiu da base, perdeu o acesso na hora.
 *  - o que cada cliente vê: os tutoriais publicados "Geral" e os dos produtos (e módulos) que ele
 *    tem ativos
 *  - o tutorial: título, resumo e o texto simples da base (passos, comandos, prints) com vídeo e
 *    arquivo para baixar
 *  - o link do tutorial (o número e o título sem acento) e as mensagens prontas para o WhatsApp
 */
import { z } from 'zod';
import { numeroWhatsApp } from './envio.js';
import { paraBusca } from './formatos.js';
import { PaginacaoSchema } from './schemas.js';

// ---------- os arquivos ----------

const MB = 1024 * 1024;
/** Print no meio do texto (o navegador já reduz), arquivo para baixar e vídeo. */
export const LIMITES_PORTAL = { imagem: 5 * MB, arquivo: 20 * MB, video: 300 * MB } as const;
/** Só imagem que o navegador desenha sem rodar nada (nunca SVG). */
export const TIPOS_IMAGEM_PORTAL = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'] as const;
/** MP4 toca em todo lugar; WebM e o .mov do iPhone também são aceitos. */
export const TIPOS_VIDEO_PORTAL = ['video/mp4', 'video/webm', 'video/quicktime'] as const;
export const TIPOS_ARQUIVO_PORTAL = ['imagem', 'video', 'arquivo'] as const;
export type TipoArquivoPortal = (typeof TIPOS_ARQUIVO_PORTAL)[number];

/** O que está errado com o arquivo (null = pode subir). */
export function problemaDoArquivo(tipo: TipoArquivoPortal, mime: string, bytes: number): string | null {
  const limite = LIMITES_PORTAL[tipo];
  if (bytes <= 0) return 'O arquivo está vazio.';
  if (bytes > limite) return `Arquivo grande demais: o limite é ${Math.round(limite / MB)} MB.`;
  if (tipo === 'imagem' && !(TIPOS_IMAGEM_PORTAL as readonly string[]).includes(mime)) return 'No meio do texto só entra imagem PNG, JPG, WEBP ou GIF.';
  if (tipo === 'video' && !(TIPOS_VIDEO_PORTAL as readonly string[]).includes(mime)) return 'Vídeo em MP4 (o melhor), WebM ou MOV.';
  return null;
}

// ---------- o tutorial ----------

export const SITUACOES_TUTORIAL = ['rascunho', 'publicado'] as const;

export const TutorialGravarSchema = z.object({
  titulo: z.string().trim().min(3, 'Escreva o título do jeito que o cliente procuraria ("Como transferir uma ligação")').max(160),
  /** uma frase: aparece na lista e no começo do tutorial */
  resumo: z.string().trim().max(300).nullable().optional(),
  texto: z.string().max(50_000).nullable().optional(),
  /** nulo = Geral (todos os clientes veem) */
  produtoId: z.string().min(1).nullable().optional(),
  /** nulo = o produto inteiro */
  moduloId: z.string().min(1).nullable().optional(),
  /** aparece em destaque na página inicial do portal */
  destaque: z.boolean().default(false),
  /** true = publicar (o cliente passa a ver); false = rascunho, só a equipe vê */
  publicar: z.boolean().default(false),
  /** a versão que a pessoa abriu: se outra pessoa salvou no meio, o servidor avisa */
  versao: z.number().int().min(0).optional(),
});
export type TutorialGravar = z.infer<typeof TutorialGravarSchema>;

export const TutoriaisListarSchema = PaginacaoSchema.extend({
  q: z.string().trim().max(200).optional(),
  /** o id do produto, ou "geral" */
  produto: z.string().optional(),
  situacao: z.enum(['todos', 'publicados', 'rascunhos']).default('todos'),
});
export type TutoriaisListarQuery = z.infer<typeof TutoriaisListarSchema>;

/** O que falta para publicar (null = pode). */
export function faltaParaPublicarTutorial(t: { titulo: string; texto?: string | null; resumo?: string | null }): string | null {
  if (!t.titulo.trim()) return 'Escreva o título antes de publicar.';
  if (!(t.texto ?? '').trim() && !(t.resumo ?? '').trim()) return 'Para publicar, escreva o passo a passo (ou ponha um vídeo).';
  return null;
}

/** O tutorial vale para este cliente? Geral vale para todos; o de produto, para quem tem o produto ativo. */
export function tutorialValePara(t: { produtoId: string | null; moduloId: string | null }, ativos: { produtos: Iterable<string>; modulos: Iterable<string> }): boolean {
  if (!t.produtoId) return true;
  if (![...ativos.produtos].includes(t.produtoId)) return false;
  return !t.moduloId || [...ativos.modulos].includes(t.moduloId);
}

// ---------- o link ----------

/** "Como transferir uma ligação?" → "como-transferir-uma-ligacao" */
export function slugDoTitulo(titulo: string): string {
  return paraBusca(titulo).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 70).replace(/-+$/g, '') || 'tutorial';
}

/** O caminho do tutorial no portal: /portal/a/12-como-transferir-uma-ligacao */
export const caminhoDoTutorial = (numero: number, titulo: string) => `/portal/a/${numero}-${slugDoTitulo(titulo)}`;

/** "12-como-transferir…", "12" → 12; o resto do endereço é só enfeite (o título pode mudar). */
export function numeroDoCaminho(p: string | null | undefined): number | null {
  const m = /^(\d{1,7})(?:-.*)?$/.exec((p ?? '').trim());
  return m ? Number(m[1]) : null;
}

/** A mensagem pronta para mandar um tutorial pelo WhatsApp. */
export const mensagemDoTutorial = (titulo: string, link: string) => `Olá! Este passo a passo vai ajudar: *${titulo}*\n${link}`;

/** A mensagem do convite: a própria pessoa cria a senha pelo link. */
export function mensagemDoConvite(nome: string, link: string, portal: string, dias = DIAS_DO_CONVITE): string {
  const primeiro = nome.trim().split(/\s+/)[0] ?? '';
  return `Olá${primeiro ? `, ${primeiro}` : ''}! Seu acesso à ${portal} está pronto. Crie a sua senha por este link (vale por ${dias} dias):\n${link}`;
}

/** Link do WhatsApp com a mensagem pronta (a pessoa escolhe o contato). */
export const linkWhatsApp = (mensagem: string, numero?: string | null) => {
  const n = numero ? numeroWhatsApp(numero) : null;
  return `https://wa.me/${n ?? ''}?text=${encodeURIComponent(mensagem)}`;
};

// ---------- os acessos ----------

/** Quanto tempo o link de convite vale. */
export const DIAS_DO_CONVITE = 7;

export const SenhaDoPortalSchema = z.string()
  .min(8, 'A senha precisa ter pelo menos 8 caracteres')
  .max(200, 'Senha comprida demais')
  .refine((s) => /\p{L}/u.test(s) && /\d/.test(s), 'Use letras e números na senha');

const EmailSchema = z.string().trim().toLowerCase().email('E-mail inválido').max(160);
export const AcessoCriarSchema = z.object({
  nome: z.string().trim().min(2, 'Escreva o nome da pessoa').max(120),
  email: EmailSchema,
});
export type AcessoCriar = z.infer<typeof AcessoCriarSchema>;

export const PortalEntrarSchema = z.object({ email: EmailSchema, senha: z.string().min(1, 'Informe a senha').max(200) });
export const PortalCriarSenhaSchema = z.object({ senha: SenhaDoPortalSchema });
export const PortalTrocarSenhaSchema = z.object({ atual: z.string().min(1, 'Informe a senha atual').max(200), nova: SenhaDoPortalSchema });

/** O cliente está na base? O portal só abre para quem está. */
export const clienteNaBase = (c: { arquivado: boolean; naLixeira: boolean; produtosAtivos: number }) => !c.arquivado && !c.naLixeira && c.produtosAtivos > 0;

/** Por que o cliente está fora (a frase da tela). */
export function motivoForaDaBase(c: { arquivado: boolean; naLixeira: boolean; produtosAtivos: number }): string | null {
  if (c.naLixeira) return 'o cliente está na lixeira';
  if (c.arquivado) return 'o cliente está arquivado';
  if (c.produtosAtivos <= 0) return 'o cliente não tem nenhum produto ativo';
  return null;
}

export const SITUACOES_ACESSO = ['ativo', 'convite', 'convite_vencido', 'bloqueado', 'fora_da_base'] as const;
export type SituacaoAcesso = (typeof SITUACOES_ACESSO)[number];
export const NOMES_SITUACAO_ACESSO: Record<SituacaoAcesso, string> = {
  ativo: 'Ativo', convite: 'Convite enviado', convite_vencido: 'Convite vencido', bloqueado: 'Bloqueado', fora_da_base: 'Cliente fora da base',
};

/**
 * A situação de um acesso. Quem já criou a senha continua "Ativo" mesmo com um convite novo no
 * meio (o "esqueci a senha"): a senha antiga vale até a nova ser criada.
 */
export function situacaoDoAcesso(u: { ativo: boolean; temSenha: boolean; conviteVenceEm: Date | string | null }, naBase: boolean, agora: Date = new Date()): SituacaoAcesso {
  if (!naBase) return 'fora_da_base';
  if (!u.ativo) return 'bloqueado';
  if (u.temSenha) return 'ativo';
  const vence = u.conviteVenceEm ? new Date(u.conviteVenceEm).getTime() : 0;
  return vence > agora.getTime() ? 'convite' : 'convite_vencido';
}

// ---------- os ajustes do portal ----------

export const PortalAjustesSchema = z.object({
  /** o nome que aparece no topo do portal e no convite */
  titulo: z.string().trim().min(2, 'Dê um nome ao portal').max(80),
  /** a frase de boas-vindas da página inicial */
  boasVindas: z.string().trim().max(400).nullable().optional(),
  /** o WhatsApp do suporte (o botão "Falar com o suporte") */
  whatsapp: z.string().trim().max(30).nullable().optional()
    .refine((v) => !v || !!numeroWhatsApp(v), 'Número de WhatsApp inválido (DDD e número)'),
  email: z.union([z.literal(''), z.string().trim().email('E-mail inválido').max(160)]).nullable().optional(),
  /** "Segunda a sexta, das 8h às 18h" */
  horario: z.string().trim().max(120).nullable().optional(),
});
export type PortalAjustes = z.infer<typeof PortalAjustesSchema>;

export const AJUSTES_PORTAL_PADRAO: PortalAjustes = {
  titulo: 'Central de ajuda Ingline',
  boasVindas: 'Passo a passo, vídeos e manuais dos seus produtos. Procure do seu jeito, ou fale com a gente.',
  whatsapp: null, email: null, horario: null,
};
