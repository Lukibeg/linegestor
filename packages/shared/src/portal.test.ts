import { describe, expect, it } from 'vitest';
import { arquivosDoTexto, blocosDoTexto, textoPuro } from './base.js';
import {
  caminhoDoTutorial, clienteNaBase, faltaParaPublicarTutorial, linkWhatsApp, mensagemDoConvite, motivoForaDaBase, numeroDoCaminho,
  PortalAjustesSchema, problemaDoArquivo, SenhaDoPortalSchema, situacaoDoAcesso, slugDoTitulo, tutorialValePara,
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
    expect(mensagemDoConvite('Maria Souza', 'https://x/portal/convite/abc', 'Central de ajuda Ingline')).toBe(
      'Olá, Maria! Seu acesso à Central de ajuda Ingline está pronto. Crie a sua senha por este link (vale por 7 dias):\nhttps://x/portal/convite/abc');
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
    const agora = new Date('2026-10-08T12:00:00Z');
    const amanha = '2026-10-09T12:00:00Z';
    expect(situacaoDoAcesso({ ativo: true, temSenha: true, conviteVenceEm: null }, true, agora)).toBe('ativo');
    expect(situacaoDoAcesso({ ativo: true, temSenha: false, conviteVenceEm: amanha }, true, agora)).toBe('convite');
    expect(situacaoDoAcesso({ ativo: true, temSenha: false, conviteVenceEm: '2026-10-01T00:00:00Z' }, true, agora)).toBe('convite_vencido');
    // esqueceu a senha: com convite novo no meio, continua ativo (a senha antiga vale até criar a nova)
    expect(situacaoDoAcesso({ ativo: true, temSenha: true, conviteVenceEm: amanha }, true, agora)).toBe('ativo');
    expect(situacaoDoAcesso({ ativo: false, temSenha: true, conviteVenceEm: null }, true, agora)).toBe('bloqueado');
    expect(situacaoDoAcesso({ ativo: true, temSenha: true, conviteVenceEm: null }, false, agora)).toBe('fora_da_base');
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
  it('publicar pede o passo a passo (ou o resumo)', () => {
    expect(faltaParaPublicarTutorial({ titulo: 'X', texto: null, resumo: null })).toMatch(/passo a passo/);
    expect(faltaParaPublicarTutorial({ titulo: 'X', texto: '[video:abc]' })).toBeNull();
  });
  it('os ajustes: o WhatsApp precisa ser um número de verdade', () => {
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
