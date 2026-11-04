/**
 * A NIA DE EXEMPLO DA PRÉVIA (Patch 2.4.2, o /nia no card): a prévia não tem a NIA de verdade (nem a chave), então uma
 * NIA de mentira responde no mesmo contrato — o catálogo dos 5 comandos e o /api/nia/executar —, com regras simples
 * em vez de um modelo: corrige o português comum ("nao" → "não", a maiúscula, o ponto final), formaliza o "vc" e o
 * "pq", resume o card e acha o cliente, o produto, o assunto (só as folhas) e a gravidade no texto. Basta para a
 * pessoa ver o caminho inteiro: o menu, a janela com o antes e o depois, o Aplicar e a linha no Histórico.
 */
import {
  CAMPOS_DE_TEXTO_DA_NIA, NOME_DO_CAMPO_DA_NIA, paraBusca,
  type AcaoDaNia, type AlteracaoDaNia, type ListaDaNia, type PedidoParaANia, type RespostaDaNia,
} from '@gestor/shared';

export const CATALOGO_DA_NIA_DEMO: AcaoDaNia[] = [
  { comando: 'corrigir', nome: 'Corrigir o português', descricao: 'Corrige ortografia, acentuação e pontuação sem mudar o que foi dito. Cite os campos ("o relato e a causa") ou deixe sem citar para o card inteiro.', entrega: 'texto', camposOrigem: [], exigeTexto: true },
  { comando: 'formalizar', nome: 'Formalizar para o cliente', descricao: 'Reescreve num tom educado e profissional, pronto para o cliente ler, sem mudar o que foi dito.', entrega: 'texto', camposOrigem: [], exigeTexto: true },
  { comando: 'resumir', nome: 'Resumir', descricao: 'Um resumo curto do card (o que o cliente relatou, o andamento e a solução), para quem chega agora.', entrega: 'texto', camposOrigem: [], exigeTexto: true },
  { comando: 'criar-chamado', nome: 'Criar chamado a partir de uma descrição', descricao: 'Para a ligação telefônica: descreva o que aconteceu, com suas palavras, e a NIA propõe o título, o relato, o cliente, o produto e o assunto.', entrega: 'campos', camposOrigem: [], exigeTexto: true },
  { comando: 'preencher-card-vazio', nome: 'Preencher card vazio', descricao: 'Lê o que já está no card e propõe os campos que faltam: o cliente, o produto, o tipo, o assunto e a gravidade.', entrega: 'campos', camposOrigem: [], exigeTexto: false },
];

/** As palavras que a NIA de exemplo corrige (sem acento → com acento, as abreviações). */
const CORRECOES: Record<string, string> = {
  nao: 'não', voce: 'você', tambem: 'também', ja: 'já', entao: 'então', terca: 'terça', audio: 'áudio', numero: 'número', ligacao: 'ligação',
  ligacoes: 'ligações', solucao: 'solução', configuracao: 'configuração', codigo: 'código', ate: 'até', so: 'só', apos: 'após', sao: 'são', estao: 'estão',
  tecnico: 'técnico', servico: 'serviço', usuario: 'usuário', usuarios: 'usuários', ninguem: 'ninguém', alguem: 'alguém',
  horario: 'horário', inicio: 'início', unica: 'única', unico: 'único', ultima: 'última', ultimo: 'último', agua: 'água', manha: 'manhã', otimo: 'ótimo',
  confimou: 'confirmou', confimar: 'confirmar', derrepente: 'de repente', cliete: 'cliente',
};
const INFORMAIS: Record<string, string> = { vc: 'você', vcs: 'vocês', pq: 'porque', tbm: 'também', tb: 'também', q: 'que', pra: 'para', pro: 'para o', ta: 'está', tá: 'está', blz: 'tudo bem', obg: 'obrigado', msg: 'mensagem', n: 'não', ngm: 'ninguém' };

function trocarPalavras(texto: string, mapa: Record<string, string>): string {
  return texto.replace(/[\p{L}]+/gu, (p) => {
    const novo = mapa[p.toLowerCase()];
    if (!novo || novo === p.toLowerCase()) return p;
    return p[0] === p[0]!.toUpperCase() && p[0] !== p[0]!.toLowerCase() ? novo[0]!.toUpperCase() + novo.slice(1) : novo;
  });
}

/** A maiúscula no começo de cada frase, o espaço certo, o ponto no fim. */
function pontuar(texto: string): string {
  let t = texto.replace(/[ \t]+/g, ' ').replace(/ +([,.;:!?])/g, '$1').replace(/([,;:])(?=\S)/g, '$1 ').trim();
  t = t.replace(/(^|[.!?]\s+|\n\s*)(\p{Ll})/gu, (_, a: string, b: string) => a + b.toUpperCase());
  return t.split('\n').map((l) => (l.trim() && !/[.!?:…)]$/.test(l.trim()) ? `${l.trimEnd()}.` : l)).join('\n');
}

export const corrigirDemo = (t: string) => pontuar(trocarPalavras(t, CORRECOES));
export const formalizarDemo = (t: string) => {
  const c = corrigirDemo(trocarPalavras(t, INFORMAIS)).replace(/\ba gente\b/gi, 'nossa equipe');
  return /^(prezad|olá|ola|bom dia|boa tarde)/i.test(c) ? c : `Prezado(a), ${c[0]!.toLowerCase()}${c.slice(1)}`;
};

/** Os campos citados no pedido ("o relato, a solução e a causa"); nenhum = o card inteiro. */
export function camposCitadosDemo(instrucao: string): string[] {
  const b = paraBusca(instrucao);
  const citados: string[] = [];
  if (/\btitulo\b/.test(b)) citados.push('titulo');
  if (/\brelato\b/.test(b)) citados.push('relato');
  if (/\bdescricao\b/.test(b)) citados.push('descricao');
  if (/\bsolucao\b(?! de contorno)/.test(b)) citados.push('solucao');
  if (/\bcausa\b/.test(b)) citados.push('causa');
  if (/\bcontorno\b/.test(b)) citados.push('contorno');
  if (/\bvalidacao\b/.test(b)) citados.push('validacao');
  if (/\banotacao\b/.test(b)) citados.push('anotacao');
  return citados;
}

/** A primeira frase (sem "olhar para trás" na expressão: o Safari antigo não entende). */
const primeiraFrase = (t: string | undefined) => {
  const linha = (t ?? '').trim().split('\n')[0] ?? '';
  return (linha.match(/^[^.!?]*[.!?]/)?.[0] ?? linha).trim();
};
const nomeDe = (c: string) => (NOME_DO_CAMPO_DA_NIA as Record<string, string>)[c] ?? c;

// ---------- os anexos (a NIA de verdade decide o tipo pelo CONTEÚDO; a de exemplo, pela extensão) ----------

const TIPOS_DOS_ANEXOS: Record<string, { tipo: string; como: string; texto?: boolean }> = {
  pdf: { tipo: 'PDF', como: 'lido inteiro' }, png: { tipo: 'imagem', como: 'lido inteiro' }, jpg: { tipo: 'imagem', como: 'lido inteiro' },
  jpeg: { tipo: 'imagem', como: 'lido inteiro' }, webp: { tipo: 'imagem', como: 'lido inteiro' }, heic: { tipo: 'imagem', como: 'lido inteiro' },
  docx: { tipo: 'Word', como: 'texto extraído' }, xlsx: { tipo: 'Excel', como: 'texto extraído' }, pptx: { tipo: 'PowerPoint', como: 'texto extraído' },
  txt: { tipo: 'texto', como: 'lido inteiro', texto: true }, csv: { tipo: 'texto', como: 'lido inteiro', texto: true },
  log: { tipo: 'texto', como: 'lido inteiro', texto: true }, eml: { tipo: 'e-mail', como: 'lido inteiro', texto: true },
};
const ACEITOS = 'PDF, imagens (PNG, JPG, WEBP, HEIC), Word (.docx), Excel (.xlsx), PowerPoint (.pptx) e texto (.txt, .csv, .log, .eml)';

function textoDoBase64(b64: string): string {
  try {
    const bin = atob(b64);
    return new TextDecoder('utf-8').decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
  } catch { return ''; }
}

/** O que a NIA de exemplo responderia ao /api/nia/executar: os anexos primeiro (o que não serve recusa o pedido inteiro). */
export function respostaDaNiaDemo(p: PedidoParaANia): RespostaDaNia {
  const anexos = p.anexos ?? [];
  const lidos: Array<{ nome: string; tipo: string; como: string }> = [];
  const textos: string[] = [];
  for (const a of anexos) {
    const t = TIPOS_DOS_ANEXOS[(a.nome.split('.').pop() ?? '').toLowerCase()];
    if (!t) return { ok: false, comando: p.comando, erro: `o anexo "${a.nome}" não foi aceito: tipo não aceito. Aceitos: ${ACEITOS}.` };
    lidos.push({ nome: a.nome, tipo: t.tipo, como: t.como });
    if (t.texto) textos.push(textoDoBase64(a.base64).trim());
  }
  const r = semOsAnexos(textos.length || anexos.length ? { ...p, anexosTexto: textos.filter(Boolean).join('\n'), nomesDosAnexos: anexos.map((a) => a.nome) } : p);
  return r.ok && lidos.length ? { ...r, anexosLidos: lidos } : r;
}

type PedidoComAnexos = PedidoParaANia & { anexosTexto?: string; nomesDosAnexos?: string[] };

function semOsAnexos(p: PedidoComAnexos): RespostaDaNia {
  const acao = CATALOGO_DA_NIA_DEMO.find((a) => a.comando === p.comando);
  if (!acao) return { ok: false, erro: `Não conheço o comando "${p.comando}".` };
  const ch = p.chamado as Record<string, string | undefined>;
  if (acao.entrega === 'texto' && acao.comando !== 'resumir') {
    const citados = camposCitadosDemo(p.instrucao);
    const todos = [...CAMPOS_DE_TEXTO_DA_NIA, 'anotacao'].filter((c) => c in ch);
    const alvo = citados.length ? citados.filter((c) => c in ch) : todos.filter((c) => (ch[c] ?? '').trim());
    const vazios = alvo.filter((c) => !(ch[c] ?? '').trim());
    const trabalhados = alvo.filter((c) => (ch[c] ?? '').trim());
    const mudar = acao.comando === 'corrigir' ? corrigirDemo : formalizarDemo;
    const alteracoes: AlteracaoDaNia[] = trabalhados.map((c) => {
      const antes = ch[c]!;
      const depois = c === 'titulo' ? corrigirDemo(antes).replace(/\.$/, '') : mudar(antes);
      return { campo: c, nome: nomeDe(c), antes, depois, mudou: depois !== antes };
    });
    const mudaram = alteracoes.filter((x) => x.mudou).map((x) => x.nome);
    const certos = alteracoes.filter((x) => !x.mudou).map((x) => x.nome);
    const lista = (xs: string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} e ${xs.at(-1)}`);
    return {
      ok: true, comando: acao.comando, entrega: 'texto', alcance: citados.length ? 'campos citados' : 'card inteiro', alteracoes,
      resumo: `NIA (${acao.nome}) em ${lista(alteracoes.map((x) => x.nome)) || 'nenhum campo'}: ${mudaram.length ? `mudou ${lista(mudaram)}` : 'nada mudou'}${certos.length ? `; ${lista(certos)} já ${certos.length === 1 ? 'estava certo' : 'estavam certos'}` : ''}.`,
      observacao: vazios.length ? `${lista(vazios.map(nomeDe))} ${vazios.length === 1 ? 'está vazio' : 'estão vazios'}: não há o que trabalhar.` : null,
      erro: null, duracaoMs: 1800,
    };
  }
  if (acao.comando === 'resumir') {
    const partes = [
      `${p.referencia}: ${ch.titulo ?? ''}`.trim(),
      primeiraFrase(ch.relato) && `O cliente relatou: ${primeiraFrase(ch.relato)}`,
      primeiraFrase(ch.descricao) && `Andamento: ${primeiraFrase(ch.descricao)}`,
      primeiraFrase(ch.causa) && `Causa: ${primeiraFrase(ch.causa)}`,
      primeiraFrase(ch.solucao) && `Solução: ${primeiraFrase(ch.solucao)}`,
      primeiraFrase(ch.anotacao) && `Na anotação: ${primeiraFrase(ch.anotacao)}`,
      primeiraFrase(p.anexosTexto) && `Nos anexos: ${primeiraFrase(p.anexosTexto)}`,
    ].filter(Boolean).map((x) => pontuar(String(x)));
    return { ok: true, comando: 'resumir', entrega: 'texto', alcance: 'card inteiro', texto: partes.join(' '), resumo: 'NIA (Resumir): o resumo do card.', observacao: null, erro: null, duracaoMs: 1500 };
  }

  // a entrega "campos": o que dá para achar no texto (a ligação, ou o que já está no card)
  // os anexos são contexto: o texto deles entra na leitura (a NIA de exemplo só lê os de texto; a de verdade lê todos)
  const fonte = [acao.comando === 'criar-chamado' ? p.instrucao : [ch.titulo, ch.relato, ch.descricao, ch.anotacao].filter(Boolean).join('\n'), p.anexosTexto ?? ''].filter((x) => x.trim()).join('\n');
  if (!fonte.trim()) return { ok: false, comando: acao.comando, erro: acao.comando === 'criar-chamado' ? 'Descreva o que aconteceu depois do comando: "/nia criar-chamado foi a Michele do Labchecap…".' : 'O card está vazio: não há o que ler.' };
  const b = ` ${paraBusca(fonte)} `;
  const o = p.opcoes ?? {};
  const naoPropostos = (['cliente', 'produto', 'tipo', 'assunto', 'gravidade'] as ListaDaNia[]).filter((x) => !o[x]?.length);
  const achar = (nomes: string[] | undefined) => nomes?.find((n) => b.includes(` ${paraBusca(n)} `) || b.includes(paraBusca(n))) ?? null;
  const cliente = achar(o.cliente);
  const produtos = (o.produto ?? []).filter((n) => b.includes(paraBusca(n)) || (paraBusca(n) === 'linepbx' && /\b(ramal|ramais|pabx|ura|fila)\b/.test(b)) || (paraBusca(n) === 'linechat' && /\b(whatsapp|chat|atendente)\b/.test(b)));
  // o assunto: a folha cujo último nome aparece no texto (ou os nomes do caminho, quanto mais melhor)
  let assunto: string | null = null;
  let melhor = 0;
  for (const caminho of o.assunto ?? []) {
    const partes = caminho.split('›').map((x) => paraBusca(x.trim()));
    const pontos = partes.reduce((s, x, i) => s + (x && b.includes(x.replace(/s$/, '')) ? (i === partes.length - 1 ? 3 : 1) : 0), 0);
    if (pontos >= 3 && pontos > melhor) { melhor = pontos; assunto = caminho; }
  }
  const gravidade = !o.gravidade?.length ? null
    : /\b(parou|parado|nenhum|nenhuma|nao funciona|fora do ar|mudo|mudos|sem audio|sem servico)\b/.test(b) ? o.gravidade.find((g) => paraBusca(g).startsWith('inoperan')) ?? null
      : /\b(as vezes|intermit|cai|caindo|oscila)\b/.test(b) ? o.gravidade.find((g) => paraBusca(g).startsWith('intermit')) ?? null : null;
  const tipo = !o.tipo?.length ? null
    : /\b(quero|gostaria|pedido|pediu|solicit|criar|incluir|novo|nova)\b/.test(b) ? o.tipo.find((t) => paraBusca(t).startsWith('requisi')) ?? null
      : gravidade || /\b(problema|erro|parou|sem|nao)\b/.test(b) ? o.tipo.find((t) => paraBusca(t) === 'incidente') ?? null : null;
  const folha = assunto?.split('›').at(-1)?.trim();
  const titulo = folha ? `${folha}${cliente ? ` — ${cliente}` : ''}` : pontuar(fonte.split(/\s+/).slice(0, 8).join(' ')).replace(/\.$/, '');
  const campos: RespostaDaNia['campos'] = acao.comando === 'criar-chamado'
    ? { titulo, relato: corrigirDemo(fonte), descricao: null }
    : {
      titulo: ch.titulo?.trim() ? null : titulo,
      // o card vazio com anexos: o relato sai do texto dos anexos, e a descrição diz de onde
      ...(p.anexosTexto?.trim() && !ch.relato?.trim() ? { relato: corrigirDemo(p.anexosTexto.trim().slice(0, 600)) } : {}),
      ...(p.nomesDosAnexos?.length && !ch.descricao?.trim() ? { descricao: `Conferido nos anexos: ${p.nomesDosAnexos.join(', ')}.` } : {}),
    };
  if (o.cliente?.length) campos.cliente = cliente;
  if (o.produto?.length) campos.produto = produtos.length ? produtos : null;
  if (o.tipo?.length) campos.tipo = tipo;
  if (o.assunto?.length) campos.assunto = assunto;
  if (o.gravidade?.length) campos.gravidade = gravidade;
  const semNada = [cliente, assunto].filter(Boolean).length === 0;
  return {
    ok: true, comando: acao.comando, entrega: 'campos', campos, naoPropostos,
    resumo: `NIA (${acao.nome}): a proposta dos campos.`,
    observacao: semNada ? 'Não achei o cliente nem o assunto no texto: o que ficou em branco é porque não houve evidência.' : null,
    erro: null, duracaoMs: 2400,
  };
}
