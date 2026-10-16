/**
 * PORTAL DO CLIENTE (Patch 1.8, decisão 0040) — as regras que o servidor e a prévia usam iguais.
 *
 *  - quem entra: a pessoa ativa, com o login e a senha que o suporte criou (decisão 0045, Patch 1.9:
 *    o login não precisa ser e-mail; a senha fica no cofre, e a equipe vê e troca), de um cliente que
 *    está na base (com produto ativo, fora do arquivo e da lixeira). Saiu da base, perdeu o acesso na hora.
 *    E a equipe (decisão 0044, Patch 1.9): quem tem usuário ativo no Gestor entra com o mesmo
 *    e-mail e a mesma senha (e o código de 6 dígitos, se usa) e vê todos os tutoriais publicados.
 *  - o que cada cliente vê: os tutoriais publicados "Geral" e os dos produtos (e módulos) que ele
 *    tem ativos
 *  - o tutorial: título, resumo e o texto simples da base (passos, comandos, prints) com vídeo e
 *    arquivo para baixar
 *  - o link do tutorial (o número e o título sem acento) e as mensagens prontas para o WhatsApp
 */
import { z } from 'zod';
import { numeroWhatsApp, paraBusca } from './formatos.js';
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
  /** o vídeo principal (1.9): fica no topo do tutorial, antes do passo a passo; nulo = sem */
  videoPrincipalId: z.string().min(1).nullable().optional(),
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

/** O que falta para publicar (null = pode). Só o vídeo principal também basta. */
export function faltaParaPublicarTutorial(t: { titulo: string; texto?: string | null; resumo?: string | null; videoPrincipal?: string | null }): string | null {
  if (!t.titulo.trim()) return 'Escreva o título antes de publicar.';
  if (!(t.texto ?? '').trim() && !(t.resumo ?? '').trim() && !t.videoPrincipal) return 'Para publicar, escreva o passo a passo (ou ponha um vídeo).';
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

/**
 * A mensagem com o acesso (1.9, decisão 0045): o suporte criou o login e a senha e manda para a
 * pessoa — o acesso novo, ou a senha nova (`nova`).
 */
export function mensagemDoAcesso(d: { nome: string; portal: string; link: string; login: string; senha: string; nova?: boolean }): string {
  const primeiro = d.nome.trim().split(/\s+/)[0] ?? '';
  const abertura = d.nova ? `Sua senha nova da ${d.portal}:` : `Seu acesso à ${d.portal} está pronto.`;
  return `Olá${primeiro ? `, ${primeiro}` : ''}! ${abertura}\nEntre em: ${d.link}\nLogin: ${d.login}\nSenha: ${d.senha}`;
}

/** Link do WhatsApp com a mensagem pronta (a pessoa escolhe o contato). */
export const linkWhatsApp = (mensagem: string, numero?: string | null) => {
  const n = numero ? numeroWhatsApp(numero) : null;
  return `https://wa.me/${n ?? ''}?text=${encodeURIComponent(mensagem)}`;
};

// ---------- os acessos ----------

export const SenhaDoPortalSchema = z.string()
  .min(8, 'A senha precisa ter pelo menos 8 caracteres')
  .max(200, 'Senha comprida demais')
  .refine((s) => /\p{L}/u.test(s) && /\d/.test(s), 'Use letras e números na senha');

/**
 * O login do portal (1.9, decisão 0045): o que a pessoa digita para entrar — o e-mail dela ou um
 * nome, como "maria.souza". Em minúsculas, sem espaço e sem acento; único no portal inteiro.
 */
export const LoginDoPortalSchema = z.string().trim().toLowerCase()
  .min(3, 'O login precisa ter pelo menos 3 caracteres')
  .max(160, 'Login comprido demais')
  .regex(/^[a-z0-9][a-z0-9._@+-]*$/, 'No login vale letra sem acento, número, ponto, hífen, _ e @ — sem espaço');

const NomeDaPessoaSchema = z.string().trim().min(2, 'Escreva o nome da pessoa').max(120);
/** Dar acesso: o nome, o login e a senha — o suporte escolhe os dois e passa para a pessoa. */
export const AcessoCriarSchema = z.object({ nome: NomeDaPessoaSchema, login: LoginDoPortalSchema, senha: SenhaDoPortalSchema });
export type AcessoCriar = z.infer<typeof AcessoCriarSchema>;
/** Corrigir o nome ou o login (a senha fica a mesma). */
export const AcessoCorrigirSchema = z.object({ nome: NomeDaPessoaSchema, login: LoginDoPortalSchema });
export type AcessoCorrigir = z.infer<typeof AcessoCorrigirSchema>;
/** O suporte troca a senha (a pessoa esqueceu, ou ainda não tinha). */
export const AcessoSenhaSchema = z.object({ senha: SenhaDoPortalSchema });

/** "Maria Souza" → "maria.souza": a sugestão de login (o suporte pode trocar). */
export function loginSugerido(nome: string): string {
  const palavras = paraBusca(nome).split(/[^a-z0-9]+/).filter(Boolean);
  if (!palavras.length) return '';
  const login = palavras.length === 1 ? palavras[0]! : `${palavras[0]}.${palavras[palavras.length - 1]}`;
  return login.slice(0, 40);
}

const CONSOANTES = 'bcdfgjklmnprstvz';
const VOGAIS = 'aeiou';
function sortear(n: number): number {
  const a = new Uint32Array(1);
  globalThis.crypto.getRandomValues(a);
  return a[0]! % n;
}
/**
 * Uma senha fácil de ditar e de digitar no celular, como "mabeto38": três sílabas e dois números
 * (passa nas regras da senha). O sorteio é o do navegador (`crypto`), não o `Math.random`.
 */
export function senhaSugerida(sorteio: (n: number) => number = sortear): string {
  let s = '';
  for (let i = 0; i < 3; i++) s += CONSOANTES[sorteio(CONSOANTES.length)]! + VOGAIS[sorteio(VOGAIS.length)]!;
  return `${s}${10 + sorteio(90)}`;
}

/** Entrar: o login (o da pessoa do cliente, ou o e-mail de quem é da equipe) e a senha. */
export const PortalEntrarSchema = z.object({
  login: z.string().trim().toLowerCase().min(1, 'Informe o login').max(160, 'Login comprido demais'),
  senha: z.string().min(1, 'Informe a senha').max(200),
});
/**
 * A segunda etapa de quem é da equipe e usa o código de 6 dígitos no Gestor (decisão 0044): o
 * e-mail e a senha de novo, mais o código (ou um código de recuperação).
 */
export const PortalEntrarComCodigoSchema = PortalEntrarSchema.extend({ codigo: z.string().trim().min(6, 'Digite os 6 dígitos do aplicativo').max(20) });
/** O nome que aparece no lugar do cliente quando quem entrou no portal é da equipe. */
export const NOME_DA_EQUIPE_NO_PORTAL = 'Equipe Ingline';
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

export const SITUACOES_ACESSO = ['ativo', 'sem_senha', 'bloqueado', 'fora_da_base'] as const;
export type SituacaoAcesso = (typeof SITUACOES_ACESSO)[number];
export const NOMES_SITUACAO_ACESSO: Record<SituacaoAcesso, string> = {
  ativo: 'Ativo', sem_senha: 'Sem senha', bloqueado: 'Bloqueado', fora_da_base: 'Cliente fora da base',
};

/**
 * A situação de um acesso. "Sem senha" é o acesso do 1.8 cujo convite a pessoa não usou: o suporte
 * define a senha e ele vira "Ativo".
 */
export function situacaoDoAcesso(u: { ativo: boolean; temSenha: boolean }, naBase: boolean): SituacaoAcesso {
  if (!naBase) return 'fora_da_base';
  if (!u.ativo) return 'bloqueado';
  return u.temSenha ? 'ativo' : 'sem_senha';
}

// ---------- os ajustes do portal ----------

export const PortalAjustesSchema = z.object({
  /** o nome que aparece no topo do portal e na mensagem com o acesso */
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

/** Enquanto ninguém salvar os Ajustes do portal, vale isto — o WhatsApp do suporte já vem (pedido de 09/10). */
export const AJUSTES_PORTAL_PADRAO: PortalAjustes = {
  titulo: 'Central de ajuda Ingline',
  boasVindas: 'Passo a passo, vídeos e manuais dos seus produtos. Procure do seu jeito, ou fale com a gente.',
  whatsapp: '(71) 3034-8350', email: null, horario: null,
};
