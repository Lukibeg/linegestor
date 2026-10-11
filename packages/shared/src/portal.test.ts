import { describe, expect, it } from 'vitest';
import { arquivosDoTexto, blocosDoTexto, textoPuro } from './base.js';
import {
  AcessoCriarSchema, AJUSTES_PORTAL_PADRAO, caminhoDoTutorial, clienteNaBase, faltaParaPublicarTutorial, linkWhatsApp, LoginDoPortalSchema,
  loginSugerido, mensagemDoAcesso, motivoForaDaBase, numeroDoCaminho, PortalAjustesSchema, PortalEntrarSchema, problemaDoArquivo,
  SenhaDoPortalSchema, senhaSugerida, situacaoDoAcesso, slugDoTitulo, tutorialValePara,
} from './portal.js';

describe('o link do tutorial', () => {
  it('o título vira um pedaço de endereço sem acento', () => {
    expect(slugDoTitulo('Como transferir uma ligação?')).toBe('como-transferir-uma-ligacao');
    expect(slugDoTitulo('  FOP2: ver quem está em ligação!! ')).toBe('fop2-ver-quem-esta-em-ligacao');
    expect(slugDoTitulo('???')).toBe('tutorial');
    expect(slugDoTitulo('a'.repeat(200)).length).toBeLessThanOrEqual(70);
  });
  it('o número manda; o resto do endereço é enfeite', () => {
    expect(caminhoDoTutorial(12, 'Como transferir uma ligação')).toBe('/portal/a/12-como-transferir-uma-ligacao');
    expect(numeroDoCaminho('12-como-transferir-uma-ligacao')).toBe(12);
    expect(numeroDoCaminho('12')).toBe(12);
    expect(numeroDoCaminho('12-titulo-antigo')).toBe(12);
    expect(numeroDoCaminho('abc')).toBeNull();
    expect(numeroDoCaminho('')).toBeNull();
  });
  it('as mensagens prontas para o WhatsApp', () => {
    const d = { nome: 'Maria Souza', portal: 'Central de ajuda Ingline', link: 'https://x/portal', login: 'maria.souza', senha: 'mabeto38' };
    expect(mensagemDoAcesso(d)).toBe('Olá, Maria! Seu acesso à Central de ajuda Ingline está pronto.\nEntre em: https://x/portal\nLogin: maria.souza\nSenha: mabeto38');
    expect(mensagemDoAcesso({ ...d, nova: true })).toBe('Olá, Maria! Sua senha nova da Central de ajuda Ingline:\nEntre em: https://x/portal\nLogin: maria.souza\nSenha: mabeto38');
    expect(linkWhatsApp('Olá & tchau')).toBe('https://wa.me/?text=Ol%C3%A1%20%26%20tchau');
    expect(linkWhatsApp('oi', '(71) 99999-0000')).toBe('https://wa.me/5571999990000?text=oi');
  });
});

describe('quem entra e o que vê', () => {
  it('o cliente está na base: produto ativo, fora do arquivo e da lixeira', () => {
    expect(clienteNaBase({ arquivado: false, naLixeira: false, produtosAtivos: 1 })).toBe(true);
    expect(clienteNaBase({ arquivado: false, naLixeira: false, produtosAtivos: 0 })).toBe(false);
    expect(clienteNaBase({ arquivado: true, naLixeira: false, produtosAtivos: 3 })).toBe(false);
    expect(motivoForaDaBase({ arquivado: false, naLixeira: true, produtosAtivos: 3 })).toBe('o cliente está na lixeira');
    expect(motivoForaDaBase({ arquivado: false, naLixeira: false, produtosAtivos: 2 })).toBeNull();
  });
  it('a situação do acesso', () => {
    expect(situacaoDoAcesso({ ativo: true, temSenha: true }, true)).toBe('ativo');
    // o acesso do 1.8 cujo convite não foi usado: o suporte define a senha
    expect(situacaoDoAcesso({ ativo: true, temSenha: false }, true)).toBe('sem_senha');
    expect(situacaoDoAcesso({ ativo: false, temSenha: true }, true)).toBe('bloqueado');
    expect(situacaoDoAcesso({ ativo: true, temSenha: true }, false)).toBe('fora_da_base');
  });
  it('o login: o e-mail ou um nome, sem espaço e sem acento (1.9)', () => {
    expect(LoginDoPortalSchema.parse('  Maria.Souza ')).toBe('maria.souza');
    expect(LoginDoPortalSchema.parse('Maria@Aurora.com.br')).toBe('maria@aurora.com.br');
    expect(LoginDoPortalSchema.parse('recepcao_aurora-2')).toBe('recepcao_aurora-2');
    expect(LoginDoPortalSchema.safeParse('ma').success).toBe(false);
    expect(LoginDoPortalSchema.safeParse('maria souza').success).toBe(false);
    expect(LoginDoPortalSchema.safeParse('recepção').success).toBe(false);
    expect(LoginDoPortalSchema.safeParse('.maria').success).toBe(false);
    // dar acesso pede o nome, o login e uma senha que passe nas regras
    expect(AcessoCriarSchema.safeParse({ nome: 'Maria Souza', login: 'maria.souza', senha: 'mabeto38' }).success).toBe(true);
    expect(AcessoCriarSchema.safeParse({ nome: 'Maria Souza', login: 'maria.souza', senha: 'curta1' }).success).toBe(false);
    // na entrada, o login vem como a pessoa digitou (o servidor só põe em minúsculas)
    expect(PortalEntrarSchema.parse({ login: ' Maria.Souza ', senha: 'x' }).login).toBe('maria.souza');
  });
  it('as sugestões de login e de senha', () => {
    expect(loginSugerido('Maria Souza')).toBe('maria.souza');
    expect(loginSugerido('  João da Silva Gonçalves ')).toBe('joao.goncalves');
    expect(loginSugerido('Recepção')).toBe('recepcao');
    expect(loginSugerido('')).toBe('');
    let i = 0;
    const sempre = () => i++ % 2; // 0, 1, 0, 1… — o sorteio fixo dá sempre a mesma senha
    expect(senhaSugerida(sempre)).toBe('bebebe10');
    for (let n = 0; n < 50; n++) {
      const s = senhaSugerida();
      expect(s).toMatch(/^([bcdfgjklmnprstvz][aeiou]){3}\d{2}$/);
      expect(SenhaDoPortalSchema.safeParse(s).success).toBe(true);
    }
  });
  it('o tutorial vale para quem tem o produto (e o módulo); Geral vale para todos', () => {
    const ativos = { produtos: ['linepbx'], modulos: ['fop2'] };
    expect(tutorialValePara({ produtoId: null, moduloId: null }, ativos)).toBe(true);
    expect(tutorialValePara({ produtoId: 'linepbx', moduloId: null }, ativos)).toBe(true);
    expect(tutorialValePara({ produtoId: 'linepbx', moduloId: 'fop2' }, ativos)).toBe(true);
    expect(tutorialValePara({ produtoId: 'linepbx', moduloId: 'omniboard' }, ativos)).toBe(false);
    expect(tutorialValePara({ produtoId: 'linechat', moduloId: null }, ativos)).toBe(false);
  });
});

describe('a senha e os arquivos', () => {
  it('a senha: 8 letras ou mais, com letra e número', () => {
    expect(SenhaDoPortalSchema.safeParse('Aurora2026').success).toBe(true);
    expect(SenhaDoPortalSchema.safeParse('Ação2026').success).toBe(true);
    expect(SenhaDoPortalSchema.safeParse('curta1').success).toBe(false);
    expect(SenhaDoPortalSchema.safeParse('somenteletras').success).toBe(false);
    expect(SenhaDoPortalSchema.safeParse('1234567890').success).toBe(false);
  });
  it('o que cada tipo de arquivo aceita', () => {
    expect(problemaDoArquivo('imagem', 'image/png', 1000)).toBeNull();
    expect(problemaDoArquivo('imagem', 'image/svg+xml', 1000)).toMatch(/PNG, JPG/);
    expect(problemaDoArquivo('video', 'video/mp4', 50 * 1024 * 1024)).toBeNull();
    expect(problemaDoArquivo('video', 'video/mp4', 301 * 1024 * 1024)).toMatch(/300 MB/);
    expect(problemaDoArquivo('video', 'video/x-msvideo', 1000)).toMatch(/MP4/);
    expect(problemaDoArquivo('arquivo', 'application/pdf', 21 * 1024 * 1024)).toMatch(/20 MB/);
    expect(problemaDoArquivo('arquivo', 'application/pdf', 0)).toMatch(/vazio/);
  });
  it('publicar pede o passo a passo (ou o resumo, ou o vídeo principal)', () => {
    expect(faltaParaPublicarTutorial({ titulo: 'X', texto: null, resumo: null })).toMatch(/passo a passo/);
    expect(faltaParaPublicarTutorial({ titulo: 'X', texto: '[video:abc]' })).toBeNull();
    expect(faltaParaPublicarTutorial({ titulo: 'X', texto: null, resumo: null, videoPrincipal: 'v1' })).toBeNull();
  });
  it('os ajustes: o WhatsApp precisa ser um número de verdade (e o do suporte já vem)', () => {
    expect(AJUSTES_PORTAL_PADRAO.whatsapp).toBe('(71) 3034-8350');
    expect(PortalAjustesSchema.safeParse(AJUSTES_PORTAL_PADRAO).success).toBe(true);
    expect(PortalAjustesSchema.safeParse({ titulo: 'Ajuda', whatsapp: '(71) 99999-0000' }).success).toBe(true);
    expect(PortalAjustesSchema.safeParse({ titulo: 'Ajuda', whatsapp: '123' }).success).toBe(false);
    expect(PortalAjustesSchema.safeParse({ titulo: 'Ajuda', email: '' }).success).toBe(true);
  });
});

describe('o texto do portal: vídeo e arquivo', () => {
  const texto = '1. Assista:\n[video:v1]\n2. Baixe o manual:\n[arquivo:a1]\n[print:p1]';
  it('só o portal entende vídeo e arquivo (a base continua igual)', () => {
    const portal = blocosDoTexto(texto, { midia: true });
    expect(portal[0]).toMatchObject({ tipo: 'passo', dentro: [{ tipo: 'video', arquivoId: 'v1' }] });
    expect(portal[1]).toMatchObject({ tipo: 'passo', dentro: [{ tipo: 'arquivo', arquivoId: 'a1' }, { tipo: 'imagem', anexoId: 'p1' }] });
    const base = blocosDoTexto(texto);
    expect(base[0]).toMatchObject({ tipo: 'passo', dentro: [{ tipo: 'paragrafo', texto: '[video:v1]' }] });
  });
  it('os arquivos citados, e o texto puro sem as marcas', () => {
    expect(arquivosDoTexto(`${texto}\n[video:v1]`)).toEqual(['v1', 'a1', 'p1']);
    expect(textoPuro(texto)).toBe('1. Assista:\n2. Baixe o manual:');
  });
});
