/**
 * TRAZER DO HELENA (Patch 2.0.3, decisão 0054): o painel de vendas do Helena (o "Ingline - Comercial") vem
 * para um painel de Vendas do Gestor, com o histórico de cada negociação — o pedido do Luan, em 21/10: "pegue
 * tudo que já ta no meu painel do helena e migre para o nosso, inclusive o histórico para que eu possa usar o
 * relatório" ("n precisa dos comentários": as anotações e os anexos ficam lá).
 *
 * O servidor lê o Helena pela chave do LineChat que já está no cofre (os cards pela API v2 e, card a card, o
 * histórico pela v1) e monta a LEITURA (os tipos abaixo); daqui saem a prévia e o plano do que gravar. As
 * mesmas contas valem no servidor e na prévia clicável.
 *
 * As escolhas (ditas ao Luan antes de fazer):
 *  - a MENSALIDADE é o "Valor atribuído" do card: é o número que o relatório do Helena soma, e o relatório do
 *    Gestor fica igual ao dele. O valor por produto entra só quando os "Valor Mensalidade <produto>" somam
 *    exatamente o Valor atribuído; senão, o valor é um só e os números de lá ficam escritos no histórico;
 *  - a ATIVAÇÃO é a soma dos "Valor Ativação <produto>" (por produto quando todos os produtos estão no cadastro);
 *  - o GANHO e a PERDA contam no dia da Conclusão do Helena (o dia que a pessoa escolheu ao marcar);
 *  - o HISTÓRICO do Helena vira o do Gestor: a criação, cada mudança de etapa, o ganho, a perda, a reabertura,
 *    o valor e o título; o resto (as etiquetas, as datas ajustadas) entra como está escrito lá. No Helena, o
 *    card ganho continua andando pelas etapas; no Gestor, a negociação ganha fica no Ganho — o que mudou de
 *    etapa depois do ganho fica no histórico, sem mexer na trajetória;
 *  - o NÚMERO do Helena fica (IC-34 vira <sigla>-34) quando está livre no painel;
 *  - o "(Cópia)" que o Helena põe no título do card duplicado sai do título;
 *  - a "Área de atuação" fica de fora (a escolha do Luan em 17/10, nos campos do painel de Vendas), e os
 *    cards ARQUIVADOS também (no Helena, não aparecem mais no quadro);
 *  - pode rodar de novo até a virada: o que já veio é atualizado (a negociação fica como está no Helena e o
 *    histórico que veio de lá é refeito), o que é novo entra.
 *
 * Revisto no 2.1.1 (24/10): no ar, a chave de API do LineChat não lê o histórico nem a Conclusão (a API pública
 * não tem essa data). A Conclusão vem da PLANILHA que o "Exportar" do Helena faz (a seção abaixo): o link do
 * Google Planilhas ou o .csv baixado dela. Sem a planilha, cada ganho cai no dia da última mudança do card.
 */
import { diaLocal } from './atendimento-prazos.js';
import {
  AJUSTES_DO_PAINEL_DE_VENDAS, AJUSTES_PAINEL_PADRAO, CAMPOS_DO_PAINEL_DE_VENDAS, MAX_CAMPOS_DO_PAINEL, MAX_ETAPAS_DO_PAINEL, MAX_LETRAS_DO_CAMPO, MAX_OPCOES_DO_CAMPO,
  chaveDaEtiqueta, ehLista, etiquetasUnicas, lerReais, nomeDoSistemaIgual, normalizarValorDoCampo,
  type AjustesDoPainel, type CampoDoSistema, type CampoPersonalizado, type CorEtiqueta, type Obrigatorio, type OpcaoDoCampo, type ResultadoDaVenda,
  type TipoCampo, type TipoDePainel, type TipoEtapa, type TipoEvento, type ValorDoCampo,
} from './atendimento.js';
import { paraBusca, reais } from './formatos.js';
import { ligarClientes, mesCurto, nomeDoMes, somarMeses } from './relatorios.js';

// =====================================================================
//  O QUE VEM DO HELENA (a leitura que o servidor monta)
// =====================================================================

/** Uma linha do histórico do card ("Item movido de Lead Novo para StandBy"), como o Helena escreve. */
export type LogDoHelena = { id: string; em: string; texto: string; usuarioId: string | null };

export type CardDoHelena = {
  id: string;
  /** o número do card (IC-34 → 34) */
  numero: number | null;
  /** o código no Helena ("IC-34") */
  codigo: string | null;
  titulo: string;
  descricao: string | null;
  /** o nome da etapa em que o card está */
  etapa: string | null;
  /** OPEN, WON, LOST ou ARCHIVED */
  situacao: string;
  criadoEm: string;
  alteradoEm: string;
  /** a "Conclusão": quando foi ganho ou perdido (o dia que a pessoa escolheu ao marcar) */
  concluidoEm: string | null;
  /** o motivo (o da perda) */
  motivo: string | null;
  /** o "Valor atribuído", em centavos (nulo = sem valor) */
  valor: number | null;
  responsavelId: string | null;
  criadoPorId: string | null;
  /** as etiquetas (os ids do Helena) */
  etiquetas: string[];
  /** os campos personalizados, pela chave do campo (como a API devolve: o texto das opções) */
  campos: Record<string, unknown>;
  /** o histórico; nulo quando o Helena não devolveu */
  logs: LogDoHelena[] | null;
};

/** `final`: o Helena marca a etapa como de fim (2.1.2: num painel que não é de vendas, ela fecha o chamado) */
export type EtapaDoHelena = { id: string; nome: string; posicao: number; inicial: boolean; arquivada: boolean; final?: boolean };
export type CampoDoHelena = { chave: string; nome: string; tipo: string; posicao: number; opcoes: string[] };
export type EtiquetaDoHelena = { id: string; nome: string; cor: string | null };
export type UsuarioDoHelena = { id: string; nome: string };
/**
 * `vendas`: o painel do Helena é de vendas (o tipo "sale" de lá). Desde o 2.1.2, o que não é de vendas (as atividades,
 * os chamados) vem para um painel de Gestão; sem a marca (as leituras de antes), é de vendas.
 */
export type PainelDoHelena = { id: string; nome: string; sigla: string | null; etapas: EtapaDoHelena[]; campos: CampoDoHelena[]; etiquetas: EtiquetaDoHelena[]; vendas?: boolean };

export type LeituraDoHelena = {
  painel: PainelDoHelena;
  cards: CardDoHelena[];
  /** quem é quem no Helena (o id → o nome): os responsáveis, quem criou cada card e o que mais a API disser */
  usuarios: UsuarioDoHelena[];
  lidaEm: string;
  /** o que a leitura tem a dizer (por que o histórico não veio, por exemplo): entra nos avisos da prévia */
  avisos?: string[];
  /** a planilha do Helena que completou a leitura (2.1.1): a Conclusão que a chave de API não lê */
  planilha?: ResumoDaPlanilhaDoHelena | null;
};

/**
 * A planilha do Helena usada na leitura (2.1.1): de onde veio, quantas linhas tinha, quantas são de um card lido
 * e quantas ganhas e perdidas ganharam a Conclusão por ela.
 */
export type ResumoDaPlanilhaDoHelena = {
  origem: 'link' | 'arquivo';
  /** o nome do arquivo (nulo: veio pelo link) */
  nome: string | null;
  linhas: number;
  /** as linhas de um card lido (pelo código, IC-34) */
  casadas: number;
  /** as ganhas e as perdidas que ficaram com a Conclusão da planilha */
  conclusoes: number;
  /** as ganhas e as perdidas que continuam sem a Conclusão (não estão na planilha, ou estão sem a data) */
  semConclusao: number;
  /** as linhas que não são de nenhum card lido (outro painel, ou o card arquivado) */
  foraDaLeitura: number;
};

/** Os painéis do Helena para escolher (só os de vendas trazem negociações). */
export type PainelDoHelenaNaLista = { id: string; nome: string; sigla: string | null; vendas: boolean };

/** O que a tela precisa para começar: os painéis do Helena e os painéis de Vendas do Gestor que podem receber. */
export type OpcoesDoTrazerDoHelena = {
  /** a chave do LineChat está no cofre e o Helena respondeu */
  conectado: boolean;
  /** por que não deu para falar com o Helena (a chave, o endereço) */
  erro: string | null;
  helena: PainelDoHelenaNaLista[];
  /**
   * os painéis do Gestor que podem receber (com quantos registros cada um tem): os de Vendas recebem um painel de
   * vendas do Helena; os de Gestão (2.1.2), um que não é de vendas
   */
  destinos: Array<{ id: string; nome: string; sigla: string; negociacoes: number; tipo: TipoDePainel }>;
};

/** A leitura do Helena na tela: ela demora (um pedido por card, para o histórico), e a tela acompanha. */
export type LeituraDoHelenaNaTela = {
  id: string;
  painelId: string;
  painelNome: string | null;
  estado: 'lendo' | 'pronta' | 'erro';
  /** quantos cards já vieram com o histórico, de quantos */
  lidos: number;
  total: number | null;
  erro: string | null;
  comecouEm: string;
  acabouEm: string | null;
  /** a planilha do Helena que completou a leitura (2.1.1) */
  planilha?: ResumoDaPlanilhaDoHelena | null;
};

/**
 * A planilha para completar a leitura (2.1.1): o link do Google Planilhas que o "Exportar" do Helena abre, ou o
 * arquivo .csv baixado dela (o texto, com o nome). Um dos dois.
 */
export type PlanilhaParaALeitura = { link?: string | null; csv?: string | null; nome?: string | null };

/** O que voltou do "Trazer": a frase, o painel que recebeu e a prévia do que foi feito. */
export type ResultadoDoTrazerDoHelena = { resumo: string; painelId: string; painelNome: string; sigla: string; previa: PreviaDoHelena };

// =====================================================================
//  O HISTÓRICO: uma linha do Helena de cada vez
// =====================================================================

export type LinhaDoHelena =
  | { tipo: 'criado'; por: string; etapa: string }
  | { tipo: 'movido'; de: string; para: string }
  | { tipo: 'marcado'; como: string; resultado: ResultadoDaVenda | null }
  | { tipo: 'reaberto'; estava: string; resultado: ResultadoDaVenda | null }
  | { tipo: 'valor'; de: number | null; para: number | null }
  | { tipo: 'titulo'; de: string; para: string }
  | { tipo: 'descricao' }
  | { tipo: 'outro' };

/** "Ganho" e "Perda" (os nomes do Helena) → o resultado do Gestor; outro nome = não sabemos. */
export function resultadoDoHelena(nome: string): ResultadoDaVenda | null {
  const n = paraBusca(nome);
  if (/^(ganho|ganha|venda|vendido|vendida|won)$/.test(n)) return 'ganho';
  if (/^(perda|perdido|perdida|lost)$/.test(n)) return 'perdido';
  return null;
}

/** "R$ 1.450,00" → 145000; "nenhum", vazio → nulo. */
const centavosDoTexto = (t: string | undefined): number | null => {
  if (!t) return null;
  const s = t.trim();
  if (!s || /^(nenhum|nenhuma|vazio|-)$/i.test(s)) return null;
  return lerReais(s);
};

/**
 * Divide "A <sep> B" em dois, quando o separador pode aparecer dentro dos nomes ("Item movido de X para Y",
 * e uma etapa chamada "Envio para o cliente"): fica a divisão em que os dois lados são etapas conhecidas;
 * sem as etapas (ou sem nenhuma que sirva), a primeira.
 */
function dividir(t: string, sep: string, conhecidas?: ReadonlySet<string>, ambos = true): [string, string] | null {
  const partes: Array<[string, string]> = [];
  let i = t.indexOf(sep);
  while (i > 0) {
    partes.push([t.slice(0, i).trim(), t.slice(i + sep.length).trim()]);
    i = t.indexOf(sep, i + 1);
  }
  if (!partes.length) return null;
  if (conhecidas?.size) {
    const k = (s: string) => conhecidas.has(chaveDoNome(s));
    const boa = partes.find(([a, b]) => (ambos ? k(a) && k(b) : k(b)));
    if (boa) return boa;
  }
  return partes[0]!;
}

/**
 * Lê uma linha do histórico do Helena. Os textos (conferidos no painel Ingline - Comercial, em 21/10):
 * "Item criado por Luan França em Lead Novo", "Item movido de A para B", 'Item marcado como "Ganho"',
 * 'Item estava marcado como "Ganho" e foi reaberto', "Valor atribuído alterado para R$ 400,00", "Valor
 * atribuído alterado de R$ 400,00 para R$ 990,00", "Título alterado de A para B", "Descrição alterada". O
 * resto ("A etiqueta X foi adicionada", "Data de criação ajustada de … para …") fica como está escrito.
 * `etapas`: as etapas do painel (pela `chaveDoNome`), para separar os nomes quando o "para" aparece dentro deles.
 */
export function lerLinhaDoHelena(texto: string, etapas?: ReadonlySet<string>): LinhaDoHelena {
  const t = texto.replace(/\s+/g, ' ').trim();
  let m = /^Item criado por (.+)$/i.exec(t);
  if (m) {
    const d = dividir(m[1]!, ' em ', etapas, false);
    if (d) return { tipo: 'criado', por: d[0], etapa: d[1] };
  }
  m = /^Item movido de (.+)$/i.exec(t);
  if (m) {
    const d = dividir(m[1]!, ' para ', etapas);
    if (d && d[0] && d[1]) return { tipo: 'movido', de: d[0], para: d[1] };
  }
  m = /^Item estava marcado como "(.*)" e foi reaberto\.?$/i.exec(t);
  if (m) return { tipo: 'reaberto', estava: m[1]!, resultado: resultadoDoHelena(m[1]!) };
  m = /^Item marcado como "(.*)"\.?$/i.exec(t);
  if (m) return { tipo: 'marcado', como: m[1]!, resultado: resultadoDoHelena(m[1]!) };
  m = /^Valor atribu[íi]do alterado (?:de (.+?) )?para (.+)$/i.exec(t);
  if (m) return { tipo: 'valor', de: centavosDoTexto(m[1]), para: centavosDoTexto(m[2]) };
  m = /^Valor atribu[íi]do (?:removido|apagado|limpo)/i.exec(t);
  if (m) return { tipo: 'valor', de: null, para: null };
  m = /^T[íi]tulo alterado de (.+)$/i.exec(t);
  if (m) {
    const d = dividir(m[1]!, ' para ');
    if (d) return { tipo: 'titulo', de: d[0], para: d[1] };
  }
  if (/^Descri[çc][ãa]o alterada\.?$/i.test(t)) return { tipo: 'descricao' };
  return { tipo: 'outro' };
}

/** O nome para comparar ("Visita/Apresentação Marcada" = "visita apresentacao marcada"). */
export const chaveDoNome = (s: string) => paraBusca(s).replace(/[^a-z0-9]+/g, ' ').trim();

/** O título sem o "(Cópia)" que o Helena põe no card duplicado. */
export function tituloDoHelena(titulo: string): string {
  return titulo.replace(/\s*\((?:c[óo]pia|copy)\)/gi, ' ').replace(/\s+/g, ' ').trim() || titulo.trim();
}

/** A empresa, pelo título: "APAE - Link SIP" → "APAE"; "Clínica BomVida" → ela mesma. */
export function empresaDoTitulo(titulo: string): string {
  return tituloDoHelena(titulo).split(/\s+[-–—|]\s+/)[0]!.trim();
}

// =====================================================================
//  O HISTÓRICO DE UM CARD: o Helena vira o Gestor
// =====================================================================

/** A etapa num evento (o id entra depois, quando as etapas já existem: `ligarEtapasDoEvento`). */
type EtapaNoEvento = { id?: string; nome: string; nivel: null };

/** Um evento do histórico do Gestor feito de uma linha do Helena (ou do próprio card, quando faltou a linha). */
export type EventoDoHelena = {
  /** a linha do Helena (o id dela) ou o card mais o que foi completado: fica nos dados como `helena` */
  chave: string;
  tipo: TipoEvento;
  em: string;
  /** quem fez, no Helena (o servidor liga à pessoa do Gestor) */
  usuarioId: string | null;
  dados: Record<string, any>;
};

export type HistoricoDoCard = {
  eventos: EventoDoHelena[];
  /** a etapa do Gestor em que a negociação nasceu (o nome) */
  etapaInicial: string;
  /** a etapa do Gestor em que ela fica (o Ganho, o Perdido ou a etapa em andamento) */
  etapa: string;
  resultado: ResultadoDaVenda | null;
  /** quando acabou: a Conclusão do Helena (nulo: em andamento) */
  fechadoEm: string | null;
  reaberturas: number;
  /** quantas mudanças de etapa entraram na trajetória */
  movimentos: number;
  /** o Helena não devolveu o histórico: a negociação nasce na etapa de agora e acaba na Conclusão */
  semHistorico: boolean;
  /** o histórico não chegava aonde o card está (faltava uma linha): o fim foi completado pelo card */
  completado: boolean;
};

export type OpcoesDoHistorico = {
  /** o nome da etapa Ganho e da Perdido no painel do Gestor */
  ganho: string;
  perdido: string;
  /** a etapa do Gestor de uma etapa do Helena (pelo nome) */
  etapaDoGestor: (nomeNoHelena: string) => string;
  /** a primeira etapa do painel (para o card sem etapa nenhuma) */
  primeira: string;
  /** as etapas do Helena (pela `chaveDoNome`), para ler os nomes */
  conhecidas?: ReadonlySet<string>;
  /** o nome do painel do Gestor (vai no "criou a negociação") */
  painel: string;
};

const MAIS_UM_MS = (iso: string) => new Date(Date.parse(iso) + 1).toISOString();
const iso = (s: string) => { const d = new Date(s); return Number.isNaN(d.getTime()) ? s : d.toISOString(); };

/**
 * Refaz o histórico de um card do Helena no jeito do Gestor. A trajetória (a criação e as mudanças de etapa)
 * é a que o relatório usa; o ganho e a perda levam o valor e o dia da Conclusão; o que mudou de etapa com o
 * card já ganho (ou perdido) fica no histórico sem mexer na trajetória. No fim, o histórico tem de chegar
 * aonde o card está: o que faltar é completado pelo próprio card (e a prévia diz quantos).
 */
export function historicoDoCard(card: CardDoHelena, o: OpcoesDoHistorico): HistoricoDoCard {
  const linhas = [...(card.logs ?? [])]
    .map((l, i) => ({ l, i, linha: lerLinhaDoHelena(l.texto, o.conhecidas) }))
    .sort((a, b) => a.l.em.localeCompare(b.l.em) || a.i - b.i);
  const etapa = (nomeHelena: string): EtapaNoEvento => ({ nome: o.etapaDoGestor(nomeHelena), nivel: null });
  const final: EtapaNoEvento = { nome: o.ganho, nivel: null };
  const doResultado = (r: ResultadoDaVenda): EtapaNoEvento => (r === 'ganho' ? final : { nome: o.perdido, nivel: null });
  const eventos: EventoDoHelena[] = [];

  // onde nasceu: a linha da criação; sem ela (o card duplicado), de onde saiu na primeira mudança; sem
  // mudança nenhuma, a etapa em que está
  const criado = linhas.find((x) => x.linha.tipo === 'criado');
  const primeiroMovimento = linhas.find((x) => x.linha.tipo === 'movido');
  const nascimento = criado?.linha.tipo === 'criado' ? criado.linha.etapa
    : primeiroMovimento?.linha.tipo === 'movido' ? primeiroMovimento.linha.de
      : card.etapa ?? null;
  const inicial: EtapaNoEvento = nascimento ? etapa(nascimento) : { nome: o.primeira, nivel: null };
  eventos.push({
    chave: `${card.id}:criado`, tipo: 'criado', em: iso(card.criadoEm), usuarioId: criado?.l.usuarioId ?? card.criadoPorId,
    dados: { origem: 'helena', etapa: inicial.nome, painel: o.painel, venda: true, ...(card.codigo ? { noHelena: card.codigo } : {}) },
  });

  // o estado enquanto as linhas passam: a etapa do Helena (ela anda mesmo com o card ganho), o resultado e o valor
  let etapaHelena: string | null = nascimento;
  let resultado: ResultadoDaVenda | null = null;
  const temLinhaDeValor = linhas.some((x) => x.linha.tipo === 'valor');
  let valor: number | null = temLinhaDeValor ? null : card.valor;
  let reaberturas = 0;
  let movimentos = 0;
  let ultimoResultado = -1;
  const doGestor = (): EtapaNoEvento => (etapaHelena ? etapa(etapaHelena) : inicial);
  const texto = (x: { l: LogDoHelena }, extra = '') => ({ texto: `${x.l.texto.replace(/\s+/g, ' ').trim()}${extra}` });

  for (const x of linhas) {
    const base = { chave: x.l.id, em: iso(x.l.em), usuarioId: x.l.usuarioId };
    const l = x.linha;
    switch (l.tipo) {
      case 'criado':
        break;
      case 'movido': {
        if (resultado) {
          // o card ganho (ou perdido) andou no Helena: no Gestor ele continua no Ganho (ou no Perdido)
          eventos.push({ ...base, tipo: 'helena', dados: texto(x, resultado === 'ganho' ? ' (já estava ganha)' : ' (já estava perdida)') });
        } else {
          // a frase é a do Helena ("de A para B"); a trajetória do relatório usa só o "para"
          const de = etapa(l.de);
          const para = etapa(l.para);
          if (chaveDoNome(de.nome) !== chaveDoNome(para.nome)) {
            eventos.push({ ...base, tipo: 'etapa', dados: { de, para, motivo: null, sentido: null } });
            movimentos++;
          }
        }
        etapaHelena = l.para;
        break;
      }
      case 'marcado': {
        if (!l.resultado || l.resultado === resultado) {
          eventos.push({ ...base, tipo: 'helena', dados: texto(x) });
          break;
        }
        const de = resultado ? doResultado(resultado) : doGestor();
        resultado = l.resultado;
        eventos.push({
          ...base, tipo: 'etapa',
          dados: { de, para: doResultado(resultado), motivo: null, sentido: null, resultado, valor: valor ?? card.valor ?? null, ...(resultado === 'perdido' ? { motivoPerda: null } : {}) },
        });
        ultimoResultado = eventos.length - 1;
        break;
      }
      case 'reaberto': {
        if (!resultado) {
          eventos.push({ ...base, tipo: 'helena', dados: texto(x) });
          break;
        }
        eventos.push({ ...base, tipo: 'etapa', dados: { de: doResultado(resultado), para: doGestor(), motivo: 'reaberta no Helena', sentido: null } });
        eventos.push({ ...base, chave: `${x.l.id}:reaberto`, tipo: 'reaberto', dados: { motivo: null, venda: true } });
        resultado = null;
        reaberturas++;
        break;
      }
      case 'valor': {
        const antes = l.de ?? valor;
        if (antes !== l.para) {
          eventos.push({ ...base, tipo: 'campo', dados: { campo: 'Mensalidade', de: antes != null ? reais(antes) : null, para: l.para != null ? reais(l.para) : null } });
        }
        valor = l.para;
        break;
      }
      case 'titulo':
        if (l.de !== l.para) eventos.push({ ...base, tipo: 'campo', dados: { campo: 'Título', de: l.de, para: l.para } });
        break;
      case 'descricao':
        eventos.push({ ...base, tipo: 'campo', dados: { campo: 'Descrição', longo: true } });
        break;
      default:
        eventos.push({ ...base, tipo: 'helena', dados: texto(x) });
    }
  }

  // o fim tem de ser o do card: o que faltou (a linha que o Helena não devolveu) é completado por ele
  const noFim: ResultadoDaVenda | null = card.situacao === 'WON' ? 'ganho' : card.situacao === 'LOST' ? 'perdido' : null;
  const fim = iso(card.concluidoEm ?? card.alteradoEm);
  let completado = false;
  if (noFim !== resultado) {
    completado = true;
    if (!noFim) {
      const para = card.etapa ? etapa(card.etapa) : doGestor();
      eventos.push({ chave: `${card.id}:reaberto`, em: iso(card.alteradoEm), usuarioId: null, tipo: 'etapa', dados: { de: doResultado(resultado!), para, motivo: 'reaberta no Helena', sentido: null } });
      eventos.push({ chave: `${card.id}:reaberto:2`, em: iso(card.alteradoEm), usuarioId: null, tipo: 'reaberto', dados: { motivo: null, venda: true } });
      reaberturas++;
      if (card.etapa) etapaHelena = card.etapa;
    } else {
      const de = resultado ? doResultado(resultado) : doGestor();
      eventos.push({
        chave: `${card.id}:fim`, em: fim, usuarioId: null, tipo: 'etapa',
        dados: { de, para: doResultado(noFim), motivo: null, sentido: null, resultado: noFim, valor: card.valor ?? valor ?? null, ...(noFim === 'perdido' ? { motivoPerda: null } : {}) },
      });
      ultimoResultado = eventos.length - 1;
    }
    resultado = noFim;
  }
  if (!resultado && card.etapa && etapaHelena && chaveDoNome(o.etapaDoGestor(card.etapa)) !== chaveDoNome(o.etapaDoGestor(etapaHelena))) {
    completado = true;
    eventos.push({ chave: `${card.id}:etapa`, em: iso(card.alteradoEm), usuarioId: null, tipo: 'etapa', dados: { de: etapa(etapaHelena), para: etapa(card.etapa), motivo: null, sentido: null } });
    movimentos++;
    etapaHelena = card.etapa;
  }

  // o último ganho (ou perda) leva o que o card diz agora: a Conclusão (o dia escolhido ao marcar), o motivo da perda
  if (resultado && ultimoResultado >= 0) {
    const ev = eventos[ultimoResultado]!;
    const dia = card.concluidoEm ? diaLocal(card.concluidoEm) : null;
    ev.dados = {
      ...ev.dados,
      ...(resultado === 'ganho' && card.valor != null ? { valor: card.valor } : {}),
      ...(resultado === 'perdido' ? { motivoPerda: card.motivo?.trim() || null } : {}),
      ...(dia && dia !== diaLocal(ev.em) ? { concluidoEm: dia } : {}),
    };
  }

  // a ordem do Helena fica: duas linhas no mesmo milésimo de segundo ganham um milésimo de distância
  for (let i = 2; i < eventos.length; i++) {
    const antes = eventos[i - 1]!.em;
    if (eventos[i]!.em <= antes && eventos[i - 1]!.tipo !== 'criado') eventos[i]!.em = MAIS_UM_MS(antes);
  }
  for (const ev of eventos) ev.dados = { ...ev.dados, helena: ev.chave };

  const etapaFinal = resultado ? doResultado(resultado).nome : etapaHelena ? o.etapaDoGestor(etapaHelena) : inicial.nome;
  // quando acabou: a Conclusão; sem ela (o card não veio inteiro), o dia em que foi marcado no histórico, que a
  // última mudança do card (uma etiqueta, um título) não empurra para depois (2.1)
  const marcadoEm = !card.concluidoEm && ultimoResultado >= 0 ? eventos[ultimoResultado]!.em : null;
  return {
    eventos, etapaInicial: inicial.nome, etapa: etapaFinal, resultado,
    fechadoEm: resultado ? marcadoEm ?? fim : null,
    reaberturas, movimentos, semHistorico: card.logs === null, completado: completado && card.logs !== null,
  };
}

/** Põe o id das etapas nos dados de um evento (o "criado" e as mudanças de etapa), quando elas já existem. */
export function ligarEtapasDoEvento(tipo: TipoEvento, dados: Record<string, any>, idDaEtapa: (nome: string) => string | null): Record<string, any> {
  const com = (e: any) => (e && typeof e === 'object' && typeof e.nome === 'string' ? { ...e, id: idDaEtapa(e.nome) ?? e.id ?? null } : e);
  if (tipo === 'criado') return { ...dados, etapaId: idDaEtapa(dados.etapa) };
  if (tipo === 'etapa') return { ...dados, de: com(dados.de), para: com(dados.para) };
  return dados;
}

// =====================================================================
//  A PLANILHA DO HELENA: a Conclusão que a chave de API não lê (2.1.1)
// =====================================================================
//
// No ar (24/10), a chave de API do LineChat recusou o histórico e o motivo no pedido do card ("Logs" e
// "ResultDescription") e o card veio sem a Conclusão: a API pública não tem essa data (a documentação do Helena
// confirma), e cada ganho caía no dia da última mudança do card — quase tudo em setembro, quando as vendas
// antigas foram lançadas lá. A tela do Helena tem a Conclusão, e o "Exportar" da Lista do painel a põe numa
// planilha (o Google Planilhas): somando os ganhos por ela, dá o gráfico "Meta vs Ganho mensal" de lá, mês a mês.

/** Uma linha da planilha do Helena: o card (pelo código) e o que a chave não lê. */
export type LinhaDaPlanilhaDoHelena = {
  /** "IC-34" */
  codigo: string;
  /** "Ganho", "Perdido", "Em andamento" */
  situacao: string | null;
  /** o dia da Conclusão (AAAA-MM-DD) */
  conclusao: string | null;
  motivo: string | null;
};

/** Os limites da planilha: o arquivo (o texto) e as linhas. */
export const LIMITES_DA_PLANILHA_DO_HELENA = { letras: 5_000_000, linhas: 20_000 } as const;

/**
 * Lê um CSV (a vírgula do Google Planilhas, o ponto e vírgula do Excel ou a tabulação de quem copia e cola): o
 * separador é o que mais aparece na primeira linha, fora das aspas. As aspas seguem o jeito de sempre ("" é uma
 * aspa, e a quebra de linha entre aspas fica dentro da célula).
 */
export function lerCsvSimples(texto: string): string[][] {
  const t = texto.replace(/^﻿/, '');
  const fim = t.search(/\r?\n/);
  const primeira = fim > 0 ? t.slice(0, fim) : t;
  const contar = (s: string) => { let n = 0, aspas = false; for (const ch of primeira) { if (ch === '"') aspas = !aspas; else if (!aspas && ch === s) n++; } return n; };
  const [maisVisto] = ['\t', ';', ','].map((s) => [s, contar(s)] as const).sort((a, b) => b[1] - a[1]);
  const sep = maisVisto![1] > 0 ? maisVisto![0] : ',';
  const linhas: string[][] = [];
  let linha: string[] = [];
  let celula = '';
  let dentro = false;
  for (let i = 0; i < t.length; i++) {
    const ch = t[i]!;
    if (dentro) {
      if (ch === '"') {
        if (t[i + 1] === '"') { celula += '"'; i++; } else dentro = false;
      } else celula += ch;
      continue;
    }
    if (ch === '"' && celula === '') { dentro = true; continue; }
    if (ch === sep) { linha.push(celula); celula = ''; continue; }
    if (ch === '\r' && t[i + 1] === '\n') continue;
    if (ch === '\n' || ch === '\r') { linha.push(celula); linhas.push(linha); linha = []; celula = ''; continue; }
    celula += ch;
  }
  if (celula !== '' || linha.length) { linha.push(celula); linhas.push(linha); }
  return linhas.filter((l) => l.some((c) => c.trim() !== ''));
}

/** "05/05/2026", "05/05/2026 12:00" ou "2026-05-05" → "2026-05-05"; o que não for um dia de verdade, nulo. */
export function diaDaPlanilha(s: string | null | undefined): string | null {
  const t = (s ?? '').trim();
  let m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ T].*)?$/.exec(t);
  let a: number, mes: number, d: number;
  if (m) { d = Number(m[1]); mes = Number(m[2]); a = Number(m[3]); } else {
    m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T].*)?$/.exec(t);
    if (!m) return null;
    a = Number(m[1]); mes = Number(m[2]); d = Number(m[3]);
  }
  const data = new Date(Date.UTC(a, mes - 1, d));
  if (data.getUTCFullYear() !== a || data.getUTCMonth() !== mes - 1 || data.getUTCDate() !== d || a < 2000 || a > 2100) return null;
  return data.toISOString().slice(0, 10);
}

/** O que se diz da planilha (o servidor e a prévia dizem igual). */
export const MENSAGENS_DA_PLANILHA_DO_HELENA = {
  umDosDois: 'Mande o link da planilha do Helena ou o arquivo .csv dela (um dos dois).',
  naoEGoogle: 'Esse link não é de uma planilha do Google Planilhas. Use o link da planilha que o Exportar do Helena abre (docs.google.com/spreadsheets/…), ou baixe ela como .csv e escolha o arquivo.',
  fechada: 'O Google não deixou baixar a planilha: ela não está aberta para quem tem o link. Na planilha, baixe como .csv (Arquivo › Fazer download) e escolha o arquivo.',
  grande: 'A planilha é grande demais (mais de 5 MB): é a do painel de vendas do Helena?',
  nenhumaDoPainel: (painel: string, exemplo: string | null) => `Nenhuma linha da planilha é de um card do painel ${painel} (o código, como ${exemplo ?? 'IC-34'}). É a planilha desse painel?`,
} as const;

/** O código como o Helena escreve, para comparar ("ic-34 " = "IC-34"). */
const chaveDoCodigo = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, '').toUpperCase();

/**
 * Lê a planilha que o "Exportar" do Helena faz (as colunas Código, Situação, Conclusão e Motivo da perda; as
 * outras ficam). O cabeçalho é a primeira linha que tem o Código e a Conclusão. Sem eles, diz o que falta.
 */
export function lerPlanilhaDoHelena(texto: string): { linhas: LinhaDaPlanilhaDoHelena[]; erro: null } | { linhas: null; erro: string } {
  if (!texto.trim()) return { linhas: null, erro: 'A planilha veio vazia.' };
  if (texto.length > LIMITES_DA_PLANILHA_DO_HELENA.letras) return { linhas: null, erro: MENSAGENS_DA_PLANILHA_DO_HELENA.grande };
  if (/^\s*<(!doctype|html)/i.test(texto)) return { linhas: null, erro: 'Isto é uma página, não a planilha: use o link da planilha do Helena (o Google Planilhas) ou o arquivo .csv baixado dela.' };
  const tabela = lerCsvSimples(texto);
  const k = (s: string) => chaveDoNome(s);
  const iCab = tabela.findIndex((l) => l.some((c) => k(c) === 'codigo') && l.some((c) => k(c) === 'conclusao'));
  if (iCab < 0) {
    return { linhas: null, erro: 'A planilha não tem as colunas Código e Conclusão. Use a do Helena: no painel, em Lista, o botão Exportar.' };
  }
  const cab = tabela[iCab]!.map(k);
  const col = (nome: string) => cab.indexOf(nome);
  const [cCodigo, cConclusao, cSituacao, cMotivo] = [col('codigo'), col('conclusao'), col('situacao'), cab.findIndex((c) => c === 'motivo da perda' || c === 'motivo de perda' || c === 'motivo')];
  const linhas: LinhaDaPlanilhaDoHelena[] = [];
  for (const l of tabela.slice(iCab + 1, iCab + 1 + LIMITES_DA_PLANILHA_DO_HELENA.linhas)) {
    const codigo = (l[cCodigo] ?? '').trim();
    if (!codigo) continue;
    const valor = (i: number) => (i >= 0 ? (l[i] ?? '').trim() || null : null);
    linhas.push({ codigo, situacao: valor(cSituacao), conclusao: diaDaPlanilha(l[cConclusao]), motivo: valor(cMotivo) });
  }
  if (!linhas.length) return { linhas: null, erro: 'A planilha não tem nenhum card (nenhuma linha com o Código).' };
  return { linhas, erro: null };
}

/** O dia da Conclusão como hora: o meio-dia em Brasília (o dia fica o mesmo em qualquer conta de dia). */
const meioDiaDe = (dia: string) => `${dia}T15:00:00.000Z`;

/**
 * Completa a leitura com a planilha do Helena: a ganha ou a perdida sem a Conclusão fica com a da planilha (a
 * do card, quando a API manda, continua valendo); o motivo da perda que faltou, também. A situação é a do card
 * (a planilha pode ser de antes). Sempre a partir da leitura que veio da API: trocar a planilha refaz tudo.
 */
export function aplicarPlanilhaDoHelena(leitura: LeituraDoHelena, linhas: readonly LinhaDaPlanilhaDoHelena[], origem: { origem: 'link' | 'arquivo'; nome?: string | null }): LeituraDoHelena {
  const porCodigo = new Map<string, LinhaDaPlanilhaDoHelena>();
  for (const l of linhas) porCodigo.set(chaveDoCodigo(l.codigo), l);
  const codigosLidos = new Set(leitura.cards.map((c) => chaveDoCodigo(c.codigo)).filter(Boolean));
  let casadas = 0, conclusoes = 0, semConclusao = 0;
  const cards = leitura.cards.map((c) => {
    const l = c.codigo ? porCodigo.get(chaveDoCodigo(c.codigo)) : undefined;
    if (l) casadas++;
    const fechada = c.situacao === 'WON' || c.situacao === 'LOST';
    let concluidoEm = c.concluidoEm;
    if (fechada && !concluidoEm && l?.conclusao) { concluidoEm = meioDiaDe(l.conclusao); conclusoes++; }
    if (fechada && !concluidoEm) semConclusao++;
    const motivo = c.motivo?.trim() ? c.motivo : c.situacao === 'LOST' && l?.motivo ? l.motivo : c.motivo;
    return concluidoEm === c.concluidoEm && motivo === c.motivo ? c : { ...c, concluidoEm, motivo };
  });
  const foraDaLeitura = [...porCodigo.keys()].filter((k) => !codigosLidos.has(k)).length;
  return {
    ...leitura, cards,
    planilha: { origem: origem.origem, nome: origem.nome?.trim() || null, linhas: linhas.length, casadas, conclusoes, semConclusao, foraDaLeitura },
  };
}

/**
 * Lê o texto da planilha e completa a leitura da API (o servidor e a prévia): o erro de leitura, ou a planilha que
 * não tem nenhum card do painel, voltam como `erro`.
 */
export function leituraComAPlanilha(daApi: LeituraDoHelena, texto: string, origem: { origem: 'link' | 'arquivo'; nome?: string | null }): { leitura: LeituraDoHelena; erro: null } | { leitura: null; erro: string } {
  const lida = lerPlanilhaDoHelena(texto);
  if (lida.erro !== null) return { leitura: null, erro: lida.erro };
  const leitura = aplicarPlanilhaDoHelena(daApi, lida.linhas, origem);
  if (!leitura.planilha?.casadas) return { leitura: null, erro: MENSAGENS_DA_PLANILHA_DO_HELENA.nenhumaDoPainel(daApi.painel.nome, daApi.cards.find((c) => c.codigo)?.codigo ?? null) };
  return { leitura, erro: null };
}

/** A planilha em CSV (o jeito do Google Planilhas): a prévia faz a de exemplo assim. */
export function csvDaPlanilhaDoHelena(linhas: readonly LinhaDaPlanilhaDoHelena[]): string {
  const cel = (v: string | null) => (v && /[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v ?? '');
  const br = (dia: string | null) => (dia ? `${dia.slice(8, 10)}/${dia.slice(5, 7)}/${dia.slice(0, 4)}` : '');
  return ['Código,Situação,Conclusão,Motivo da perda', ...linhas.map((l) => [cel(l.codigo), cel(l.situacao), br(l.conclusao), cel(l.motivo)].join(','))].join('\r\n');
}

/**
 * O link da planilha do Helena (o Google Planilhas que o "Exportar" abre) → o endereço do CSV dela. Nulo: não é
 * um link do Google Planilhas. A planilha precisa estar aberta para quem tem o link (a do Helena está).
 */
export function linkDoCsvDaPlanilha(link: string): string | null {
  let u: URL;
  try { u = new URL(link.trim()); } catch { return null; }
  if (u.protocol !== 'https:' || u.hostname !== 'docs.google.com') return null;
  const m = /^\/spreadsheets\/(?:u\/\d+\/)?d\/([A-Za-z0-9_-]{20,})(?:\/|$)/.exec(u.pathname);
  if (!m) return null;
  const gid = /(?:^|[#&?])gid=(\d+)/.exec(`${u.search}${u.hash}`)?.[1];
  return `https://docs.google.com/spreadsheets/d/${m[1]}/export?format=csv${gid ? `&gid=${gid}` : ''}`;
}

// =====================================================================
//  OS VALORES: a mensalidade, a ativação e os produtos
// =====================================================================

/** O que cada campo do Helena é no Gestor. */
export type PapelDoCampo =
  | { papel: 'mensalidade'; produto: string }
  | { papel: 'ativacao'; produto: string }
  | { papel: 'produtos' }
  | { papel: 'observadores' }
  | { papel: 'fora'; motivo: string }
  | { papel: 'campo' };

export function papelDoCampo(c: Pick<CampoDoHelena, 'nome' | 'tipo'>): PapelDoCampo {
  const n = c.nome.replace(/\s+/g, ' ').trim();
  if (/group|grupo/i.test(c.tipo)) return { papel: 'fora', motivo: 'é um grupo (só junta os campos na tela do Helena)' };
  let m = /^valor\s+(?:d[ae]\s+)?mensalidade\s+(?:d[oae]\s+)?(.+)$/i.exec(n);
  if (m) return { papel: 'mensalidade', produto: m[1]!.trim() };
  m = /^valor\s+(?:d[ae]\s+)?ativa[çc][ãa]o\s+(?:d[oae]\s+)?(.+)$/i.exec(n);
  if (m) return { papel: 'ativacao', produto: m[1]!.trim() };
  if (/^(servi[çc]os?|produtos?)(\s+ofertados?)?$/i.test(n)) return { papel: 'produtos' };
  if (/^observador(es|\(es\))?$/i.test(n)) return { papel: 'observadores' };
  if (/[áa]rea\s+de\s+atua[çc][ãa]o/i.test(n)) return { papel: 'fora', motivo: 'a escolha de 17/10, nos campos do painel de Vendas' };
  return { papel: 'campo' };
}

/**
 * O valor de um campo como a API manda, sem o embrulho: a v2 devolve o texto (ou a lista de textos); a v1
 * devolve um objeto ({ valueString, valuesInteger, valuesId… }). Vazio = nulo.
 */
export function valorDoHelena(v: unknown): string | number | boolean | string[] | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'string') return v.trim() ? v.trim() : null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'boolean') return v;
  if (Array.isArray(v)) {
    const xs = v.map((x) => valorDoHelena(x)).filter((x): x is string | number | boolean => x !== null && !Array.isArray(x)).map(String);
    return xs.length ? xs : null;
  }
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>;
    for (const k of ['valueString', 'value', 'valueBoolean', 'valuesString', 'valuesInteger', 'valuesFloat', 'valuesDecimal', 'valuesDateTime', 'valuesName', 'name', 'text', 'valuesId']) {
      const bruto = o[k];
      // o número (e a data) que vem numa lista de um só: o valor dele
      if (Array.isArray(bruto) && bruto.length === 1 && /^values(Integer|Float|Decimal|DateTime)$/.test(k)) {
        const x = valorDoHelena(bruto[0]);
        if (x !== null) return x;
      }
      const x = valorDoHelena(bruto);
      if (x !== null) return x;
    }
  }
  return null;
}

/** Um valor em reais do Helena ("R$ 1.500,00", 1500, "1500.5") em centavos; nulo se não for valor. */
export function centavosDoHelena(v: unknown): number | null {
  const x = valorDoHelena(v);
  if (x === null || typeof x === 'boolean') return null;
  if (Array.isArray(x)) return x.length ? centavosDoHelena(x[0]) : null;
  if (typeof x === 'number') return Math.round(x * 100);
  const lido = lerReais(x);
  if (lido !== null) return lido;
  const n = Number(x.replace(/[^\d.-]/g, ''));
  return /^\s*-?\d+(\.\d+)?\s*$/.test(x) && Number.isFinite(n) ? Math.round(n * 100) : null;
}

/** Os nomes de uma lista do Helena (a lista, ou o texto com vírgulas). */
function nomesDoHelena(v: unknown): string[] {
  const x = valorDoHelena(v);
  if (x === null || typeof x === 'boolean' || typeof x === 'number') return x === null || typeof x === 'boolean' ? [] : [String(x)];
  const xs = Array.isArray(x) ? x : x.split(/\s*[,;]\s*/);
  return [...new Set(xs.map((s) => s.trim()).filter(Boolean))];
}

export type ProdutoParaHelena = { id: string; nome: string };

export type ValoresDoCard = {
  /** a mensalidade (o Valor atribuído) e, quando a soma bate, a de cada produto (pelo id do produto) */
  valor: number | null;
  valoresDosProdutos: Record<string, number>;
  ativacao: number | null;
  ativacoesDosProdutos: Record<string, number>;
  /** os produtos da negociação (os ids do Gestor) */
  produtos: string[];
  /** os nomes de produto do Helena que não estão no cadastro do Gestor */
  semCadastro: string[];
  /** o valor por produto ficou de fora (a soma não bate com o Valor atribuído): a frase para o histórico */
  nota: string | null;
};

/** O produto do Gestor de um nome do Helena ("LinePBX", "Linepbx", "Line PBX"). */
function produtoPeloNome(nome: string, produtos: readonly ProdutoParaHelena[]): ProdutoParaHelena | null {
  const k = chaveDoNome(nome).replace(/\s+/g, '');
  return produtos.find((p) => chaveDoNome(p.nome).replace(/\s+/g, '') === k) ?? null;
}

export function valoresDoCard(card: Pick<CardDoHelena, 'valor' | 'campos'>, campos: readonly CampoDoHelena[], produtos: readonly ProdutoParaHelena[]): ValoresDoCard {
  const mensal: Array<{ nome: string; valor: number }> = [];
  const ativ: Array<{ nome: string; valor: number }> = [];
  const ofertados: string[] = [];
  for (const c of campos) {
    const p = papelDoCampo(c);
    const bruto = card.campos[c.chave];
    if (p.papel === 'mensalidade') { const v = centavosDoHelena(bruto); if (v && v > 0) mensal.push({ nome: p.produto, valor: v }); }
    else if (p.papel === 'ativacao') { const v = centavosDoHelena(bruto); if (v && v > 0) ativ.push({ nome: p.produto, valor: v }); }
    else if (p.papel === 'produtos') ofertados.push(...nomesDoHelena(bruto));
  }
  const nomes = [...new Set([...ofertados, ...mensal.map((x) => x.nome), ...ativ.map((x) => x.nome)].map((n) => n.trim()).filter(Boolean))];
  const ids: string[] = [];
  const semCadastro: string[] = [];
  for (const n of nomes) {
    const p = produtoPeloNome(n, produtos);
    if (p) { if (!ids.includes(p.id)) ids.push(p.id); } else if (!semCadastro.some((s) => chaveDoNome(s) === chaveDoNome(n))) semCadastro.push(n);
  }
  const porProduto = (xs: Array<{ nome: string; valor: number }>): Record<string, number> | null => {
    const out: Record<string, number> = {};
    for (const x of xs) {
      const p = produtoPeloNome(x.nome, produtos);
      if (!p) return null;
      out[p.id] = (out[p.id] ?? 0) + x.valor;
    }
    return out;
  };
  const soma = mensal.reduce((t, x) => t + x.valor, 0);
  const valor = card.valor && card.valor > 0 ? card.valor : null;
  const mensalPorProduto = mensal.length && valor !== null && soma === valor ? porProduto(mensal) : null;
  const ativacao = ativ.length ? ativ.reduce((t, x) => t + x.valor, 0) : null;
  const nota = mensal.length && !mensalPorProduto
    ? `No Helena, a mensalidade por produto era ${mensal.map((x) => `${x.nome} ${reais(x.valor)}`).join(' · ')} (${soma === (valor ?? 0) ? 'um dos produtos não está no cadastro do Gestor' : `soma ${reais(soma)}, e o Valor atribuído é ${reais(valor ?? 0)}`}): a negociação ficou com o valor único.`
    : null;
  return {
    valor, valoresDosProdutos: mensalPorProduto ?? {},
    ativacao, ativacoesDosProdutos: (ativ.length ? porProduto(ativ) : null) ?? {},
    produtos: ids, semCadastro, nota,
  };
}

// =====================================================================
//  OS CAMPOS DO PAINEL
// =====================================================================

/** O tipo do campo do Gestor para um tipo do Helena (SINGLESELECT, MULTISELECT, TEXT, NUMBER, DATE…). */
export function tipoDoCampoDoHelena(tipo: string, temOpcoes: boolean): TipoCampo {
  const t = tipo.toUpperCase();
  if (/MULTI/.test(t)) return temOpcoes ? 'lista_varios' : 'texto';
  if (/SELECT|LIST|OPTION|DROPDOWN|RADIO|COMBO/.test(t)) return temOpcoes ? 'lista' : 'texto';
  if (/TEXTAREA|LONG|PARAGRAPH|MULTILINE/.test(t)) return 'texto_longo';
  if (/DATE|TIME/.test(t)) return 'data';
  if (/BOOL|CHECK|SWITCH|YESNO/.test(t)) return 'sim_nao';
  if (/NUM|INT|DECIMAL|FLOAT|CURRENCY|MONEY|PERCENT/.test(t)) return 'numero';
  return 'texto';
}

/**
 * O valor do Helena já no jeito do campo do Gestor, antes de conferir: o dinheiro sem o "R$", a data sem a
 * hora, a lista como os nomes das opções (o Gestor troca pelos ids ao conferir), o texto da lista juntado.
 */
export function valorDoHelenaParaOCampo(tipo: TipoCampo, bruto: unknown): unknown {
  const x = valorDoHelena(bruto);
  if (x === null) return null;
  switch (tipo) {
    case 'texto':
    case 'texto_longo': {
      const s = Array.isArray(x) ? x.join(', ') : typeof x === 'boolean' ? (x ? 'Sim' : 'Não') : String(x);
      return s.slice(0, MAX_LETRAS_DO_CAMPO[tipo]);
    }
    case 'numero': {
      const v = Array.isArray(x) ? x[0] : x;
      if (typeof v === 'number') return v;
      if (typeof v !== 'string') return null;
      if (/r\$/i.test(v)) { const c = lerReais(v); return c === null ? null : c / 100; }
      return v;
    }
    case 'data': {
      const v = Array.isArray(x) ? x[0] : x;
      return typeof v === 'string' ? v : null;
    }
    case 'sim_nao':
      return Array.isArray(x) ? x[0] ?? null : x;
    case 'lista':
      return Array.isArray(x) ? x[0] ?? null : String(x);
    case 'lista_varios':
      return Array.isArray(x) ? x : nomesDoHelena(x);
    default:
      return x;
  }
}

/** O valor conferido pelas regras do campo do Gestor (as opções pelo nome viram os ids); nulo se não serve. */
export function valorDoCampoNoGestor(campo: Pick<CampoPersonalizado, 'nome' | 'tipo' | 'opcoes'>, pre: unknown): ValorDoCampo | null {
  const r = normalizarValorDoCampo(campo, pre);
  return r.ok ? r.valor : null;
}

export type CampoNoPlano = {
  /** a chave do campo no Helena */
  chave: string;
  nome: string;
  /** usa um campo que o painel já tem, cria um novo, ou fica de fora */
  acao: 'usa' | 'cria' | 'fora';
  /** o campo do Gestor (nulo quando é criado) */
  gestorId: string | null;
  nomeNoGestor: string;
  tipo: TipoCampo;
  /** as opções que a lista do Gestor ganha (as do Helena que ela não tem) */
  opcoesNovas: string[];
  motivo: string | null;
};

const MOTIVO_SEM_USO = 'nenhuma negociação usa';

/**
 * Os campos do Helena no painel do Gestor: o que tem o mesmo nome usa o campo que existe (a lista ganha as
 * opções que faltam); o resto é criado com o tipo de lá. Ficam de fora a mensalidade e a ativação de cada
 * produto (viram os valores), os produtos (viram os produtos da negociação), o observador (vira os
 * observadores), a área de atuação, o que nenhum card usa e o que não cabe mais (o painel vai até 30 campos).
 */
export function planoDosCampos(
  helena: readonly CampoDoHelena[], gestor: readonly CampoPersonalizado[], cards: readonly Pick<CardDoHelena, 'campos'>[],
  camposDesligados: readonly CampoDoSistema[] = AJUSTES_DO_PAINEL_DE_VENDAS.camposDesligados, tipo: TipoDePainel = 'vendas',
): CampoNoPlano[] {
  const porNome = new Map(gestor.map((c) => [chaveDoNome(c.nome), c]));
  // o campo com o nome de um do sistema (o "Título", a "Empresa", os "Produtos"): não vira campo do painel
  const doSistema = (nome: string) => nomeDoSistemaIgual(nome, { camposDesligados: [...camposDesligados] }, tipo) !== null;
  const gestao = tipo === 'gestao';
  let livres = MAX_CAMPOS_DO_PAINEL - gestor.length;
  const out: CampoNoPlano[] = [];
  for (const c of [...helena].sort((a, b) => a.posicao - b.posicao)) {
    const nome = c.nome.replace(/\s+/g, ' ').trim().slice(0, 40) || c.chave;
    const base = { chave: c.chave, nome, gestorId: null, nomeNoGestor: nome, opcoesNovas: [] as string[], motivo: null as string | null };
    const p = papelDoCampo(c);
    const grupo = p.papel === 'fora' && /group|grupo/i.test(c.tipo);
    // no painel de Gestão (2.1.2), a mensalidade, a ativação e a área de atuação são campos como os outros
    const virouCampo = gestao && !grupo && (p.papel === 'mensalidade' || p.papel === 'ativacao' || p.papel === 'fora');
    if (p.papel !== 'campo' && !virouCampo) {
      // o grupo só junta os campos na tela do Helena: não guarda valor, e a prévia nem cita
      const doQue = gestao ? 'do chamado' : 'da negociação';
      const motivo = grupo ? null : p.papel === 'fora' ? p.motivo : p.papel === 'mensalidade' ? 'vira a mensalidade de cada produto' : p.papel === 'ativacao' ? 'vira a ativação de cada produto' : p.papel === 'produtos' ? `vira os produtos ${doQue}` : `vira os observadores ${doQue}`;
      out.push({ ...base, acao: 'fora', tipo: 'texto', motivo });
      continue;
    }
    // as opções que os cards usam (a lista do Helena pode ter mudado depois)
    const usadas = new Set<string>();
    let usado = false;
    for (const card of cards) {
      const v = valorDoHelena(card.campos[c.chave]);
      if (v === null) continue;
      usado = true;
      for (const n of Array.isArray(v) ? v : typeof v === 'string' ? [v] : []) usadas.add(n);
    }
    const doHelena = [...new Set([...c.opcoes, ...usadas].map((s) => s.trim()).filter(Boolean))];
    const existe = porNome.get(chaveDoNome(nome));
    if (existe) {
      const tem = new Set(existe.opcoes.map((x) => paraBusca(x.nome)));
      const novas = ehLista(existe.tipo) ? doHelena.filter((n) => !tem.has(paraBusca(n))).map((n) => n.slice(0, 60)) : [];
      out.push({ ...base, acao: 'usa', gestorId: existe.id, nomeNoGestor: existe.nome, tipo: existe.tipo, opcoesNovas: novas.slice(0, Math.max(0, MAX_OPCOES_DO_CAMPO - existe.opcoes.length)) });
      continue;
    }
    if (doSistema(nome)) { out.push({ ...base, acao: 'fora', tipo: 'texto', motivo: 'tem o nome de um campo do sistema' }); continue; }
    if (!usado) { out.push({ ...base, acao: 'fora', tipo: 'texto', motivo: MOTIVO_SEM_USO }); continue; }
    if (livres <= 0) { out.push({ ...base, acao: 'fora', tipo: 'texto', motivo: `o painel chegou a ${MAX_CAMPOS_DO_PAINEL} campos` }); continue; }
    livres--;
    const tipo = tipoDoCampoDoHelena(c.tipo, doHelena.length > 0);
    out.push({ ...base, acao: 'cria', tipo, opcoesNovas: ehLista(tipo) ? doHelena.map((n) => n.slice(0, 60)).slice(0, MAX_OPCOES_DO_CAMPO) : [] });
  }
  return out;
}

/** O campo do Gestor como vai ficar (as opções novas com um id de mentira), para conferir os valores na prévia. */
export function campoDoPlano(c: CampoNoPlano, gestor: readonly CampoPersonalizado[]): Pick<CampoPersonalizado, 'nome' | 'tipo' | 'opcoes'> {
  const existe = c.gestorId ? gestor.find((g) => g.id === c.gestorId) : undefined;
  const opcoes: OpcaoDoCampo[] = [...(existe?.opcoes ?? []), ...c.opcoesNovas.map((nome) => ({ id: `nova:${nome}`, nome, ativa: true }))];
  return { nome: c.nomeNoGestor, tipo: c.tipo, opcoes };
}

// =====================================================================
//  AS PESSOAS, AS EMPRESAS E AS ETIQUETAS
// =====================================================================

export type LigacaoDePessoa = { pessoaId: string | null; como: 'nome' | 'primeiro_nome' | 'nenhum' };
export type PessoaParaHelena = { id: string; nome: string; ativo?: boolean };

/**
 * A pessoa do Gestor de cada nome do Helena: o nome igual (sem acento, sem maiúscula); senão, o primeiro nome
 * de uma pessoa só ("Luan" é o Luan França quando não há outro Luan). Dois candidatos = não liga.
 */
export function ligarPessoas(nomes: readonly string[], pessoas: readonly PessoaParaHelena[]): Record<string, LigacaoDePessoa> {
  const out: Record<string, LigacaoDePessoa> = {};
  const primeiro = (s: string) => chaveDoNome(s).split(' ')[0] ?? '';
  for (const nome of nomes) {
    const k = chaveDoNome(nome);
    if (!k) { out[nome] = { pessoaId: null, como: 'nenhum' }; continue; }
    const iguais = pessoas.filter((p) => chaveDoNome(p.nome) === k);
    const doNome = iguais.length > 1 ? iguais.filter((p) => p.ativo !== false) : iguais;
    if (doNome.length === 1) { out[nome] = { pessoaId: doNome[0]!.id, como: 'nome' }; continue; }
    const p1 = primeiro(nome);
    const mesmos = pessoas.filter((p) => primeiro(p.nome) === p1);
    const ativos = mesmos.length > 1 ? mesmos.filter((p) => p.ativo !== false) : mesmos;
    out[nome] = ativos.length === 1 ? { pessoaId: ativos[0]!.id, como: 'primeiro_nome' } : { pessoaId: null, como: 'nenhum' };
  }
  return out;
}

export type ClienteParaHelena = { id: string; nomes: string[]; cnpj: string | null };
export type EmpresaDoCard = { clienteId: string | null; empresa: string; como: 'cnpj' | 'nome' | 'nenhum' };

const soDigitos = (s: string | null | undefined) => (s ?? '').replace(/\D/g, '');

/** O cliente do cadastro da negociação: pelo CNPJ do card; senão, pelo nome da empresa no título (um cliente só). */
export function empresaDoCard(titulo: string, cnpj: string | null, clientes: readonly ClienteParaHelena[]): EmpresaDoCard {
  const empresa = empresaDoTitulo(titulo);
  const d = soDigitos(cnpj);
  if (d.length >= 11) {
    const achados = clientes.filter((c) => soDigitos(c.cnpj) === d);
    if (achados.length === 1) return { clienteId: achados[0]!.id, empresa, como: 'cnpj' };
  }
  const lig = ligarClientes([empresa], clientes.map((c) => ({ id: c.id, nomes: c.nomes })))[empresa];
  return lig?.clienteId ? { clienteId: lig.clienteId, empresa, como: 'nome' } : { clienteId: null, empresa, como: 'nenhum' };
}

/** A cor do catálogo de etiquetas mais perto da cor do Helena ("#RRGGBB" ou "rgb(r, g, b)"). */
export function corDaEtiquetaDoHelena(cor: string | null | undefined): CorEtiqueta {
  const s = (cor ?? '').trim();
  const hex = /^#?([0-9a-f]{6})$/i.exec(s);
  const rgb = /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})/i.exec(s);
  if (!hex && !rgb) return 'neutral';
  const n = hex ? parseInt(hex[1]!, 16) : (Number(rgb![1]) << 16) + (Number(rgb![2]) << 8) + Number(rgb![3]);
  const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min;
  if (d < 0.08 || l < 0.12 || l > 0.94) return 'neutral';
  let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h = (h * 60 + 360) % 360;
  if (h < 15 || h >= 345) return 'bad';
  if (h < 40) return 'signal';
  if (h < 66) return 'amarelo';
  if (h < 160) return 'ok';
  if (h < 200) return 'turquesa';
  if (h < 252) return 'accent';
  if (h < 290) return 'roxo';
  return 'rosa';
}

// =====================================================================
//  AS ETAPAS DO PAINEL
// =====================================================================

export type EtapaDoGestorParaHelena = {
  id: string; nome: string; tipo: TipoEtapa; resultado: ResultadoDaVenda | null;
  obrigatorios: Obrigatorio[]; avisar: string[];
  /** quantas negociações estão nela (as da lixeira não contam) */
  negociacoes: number;
};

export type EtapaNoPlano = {
  /** a etapa que o painel já tem (nulo = nova) */
  id: string | null;
  nome: string;
  tipo: TipoEtapa;
  resultado: ResultadoDaVenda | null;
  obrigatorios: Obrigatorio[];
  avisar: string[];
  /** o nome no Helena (nulo: é do Gestor) */
  helena: string | null;
};

export type PlanoDasEtapasDoHelena = {
  /** a lista do painel, na ordem: as do Helena, as do Gestor que ficam (têm negociações), o Ganho e o Perdido */
  etapas: EtapaNoPlano[];
  /** as do Gestor que saem (vazias e fora do Helena) */
  saem: Array<{ id: string; nome: string }>;
  /** os nomes que só aparecem no histórico (a etapa saiu do Helena): entram já fora do painel, para a trajetória */
  historicas: string[];
  /** o nome no Helena → o nome no Gestor */
  doHelena: Record<string, string>;
  ganho: string;
  perdido: string;
  erro: string | null;
};

const ETAPA_MAX = 40;
const nomeDeEtapa = (s: string) => s.replace(/\s+/g, ' ').trim().slice(0, ETAPA_MAX);

/**
 * As etapas do painel do Gestor depois de trazer o Helena: as do Helena na ordem de lá (a inicial é a
 * entrada, onde a negociação nova chega), as do Gestor que têm negociações e não estão no Helena, e o Ganho e
 * o Perdido no fim. A etapa do Gestor com o mesmo nome de uma do Helena é a mesma (fica com o id e as regras).
 * `usadas`: os nomes de etapa que os cards e o histórico citam (a que saiu do Helena entra já fora do painel).
 */
export function planoDasEtapas(helena: readonly EtapaDoHelena[], gestor: readonly EtapaDoGestorParaHelena[], usadas: Iterable<string>): PlanoDasEtapasDoHelena {
  const ganhoG = gestor.find((e) => e.resultado === 'ganho');
  const perdidoG = gestor.find((e) => e.resultado === 'perdido');
  const ganho = ganhoG?.nome ?? 'Ganho';
  const perdido = perdidoG?.nome ?? 'Perdido';
  // a etapa do Helena com o nome do Ganho ou do Perdido (no Helena, o ganho é uma marca, não uma etapa): ganha
  // um "(Helena)" no nome, para não confundir com a etapa final
  const finais = new Set([chaveDoNome(ganho), chaveDoNome(perdido)]);
  const semConfundir = (nome: string) => (finais.has(chaveDoNome(nome)) ? nomeDeEtapa(`${nome} (Helena)`) : nome);
  const abertas = gestor.filter((e) => !e.resultado);
  const porNome = new Map(abertas.map((e) => [chaveDoNome(e.nome), e]));
  const ativas = [...helena].filter((e) => !e.arquivada).sort((a, b) => a.posicao - b.posicao);
  const temInicial = ativas.some((e) => e.inicial);
  const doHelena: Record<string, string> = {};
  const etapas: EtapaNoPlano[] = [];
  const vistas = new Set<string>();
  ativas.forEach((e, i) => {
    const nome = semConfundir(nomeDeEtapa(e.nome));
    const k = chaveDoNome(nome);
    if (!k || vistas.has(k)) { doHelena[e.nome] = etapas.find((x) => chaveDoNome(x.nome) === k)?.nome ?? nome; return; }
    vistas.add(k);
    const existe = porNome.get(k);
    const tipo: TipoEtapa = (temInicial ? e.inicial : i === 0) ? 'entrada' : 'andamento';
    etapas.push({ id: existe?.id ?? null, nome, tipo, resultado: null, obrigatorios: existe?.obrigatorios ?? [], avisar: existe?.avisar ?? [], helena: e.nome });
    doHelena[e.nome] = nome;
  });
  // as do Gestor fora do Helena: a que tem negociação fica (antes do Ganho); a vazia sai
  const saem: Array<{ id: string; nome: string }> = [];
  for (const e of abertas) {
    if (vistas.has(chaveDoNome(e.nome))) continue;
    if (e.negociacoes > 0) {
      etapas.push({ id: e.id, nome: e.nome, tipo: ativas.length ? 'andamento' : e.tipo, resultado: null, obrigatorios: e.obrigatorios, avisar: e.avisar, helena: null });
      vistas.add(chaveDoNome(e.nome));
    } else saem.push({ id: e.id, nome: e.nome });
  }
  etapas.push({ id: ganhoG?.id ?? null, nome: ganho, tipo: 'fechado', resultado: 'ganho', obrigatorios: ganhoG?.obrigatorios ?? ['valor'], avisar: ganhoG?.avisar ?? [], helena: null });
  etapas.push({ id: perdidoG?.id ?? null, nome: perdido, tipo: 'fechado', resultado: 'perdido', obrigatorios: perdidoG?.obrigatorios ?? [], avisar: perdidoG?.avisar ?? [], helena: null });
  if (!etapas.some((e) => e.tipo === 'entrada') && etapas[0] && !etapas[0].resultado) etapas[0].tipo = 'entrada';

  // os nomes que só o histórico cita: a etapa que já saiu do Helena (ou foi arquivada lá)
  const historicas: string[] = [];
  for (const n of usadas) {
    if (!n?.trim() || doHelena[n] !== undefined) continue;
    const k = chaveDoNome(n);
    const mesma = finais.has(k) ? undefined : etapas.find((e) => chaveDoNome(e.nome) === k) ?? gestor.find((e) => chaveDoNome(e.nome) === k);
    if (mesma) { doHelena[n] = mesma.nome; continue; }
    const nome = semConfundir(nomeDeEtapa(n));
    if (!historicas.some((h) => chaveDoNome(h) === chaveDoNome(nome))) historicas.push(nome);
    doHelena[n] = nome;
  }
  const erro = etapas.length > MAX_ETAPAS_DO_PAINEL
    ? `O painel do Gestor vai até ${MAX_ETAPAS_DO_PAINEL} etapas, e com as do Helena ficariam ${etapas.length}. Tire etapas vazias do painel do Gestor (Ajustes › Painéis) e leia de novo.`
    : null;
  return { etapas, saem, historicas, doHelena, ganho, perdido, erro };
}

// =====================================================================
//  O PLANO INTEIRO E A PRÉVIA
// =====================================================================

/** O painel do Gestor que recebe (nulo = vai ser criado). `tipo`: Vendas (sem ele, também) ou Gestão (2.1.2). */
export type PainelDoGestorParaHelena = {
  id: string; nome: string; sigla: string; tipo?: TipoDePainel;
  etapas: EtapaDoGestorParaHelena[];
  campos: CampoPersonalizado[];
  motivosDePerda: string[];
  /** os campos do sistema que o painel não usa (o campo do Helena com o nome de um que ele usa não vira campo) */
  camposDesligados: CampoDoSistema[];
};

export type EstadoDoGestorParaHelena = {
  painel: PainelDoGestorParaHelena | null;
  /** o painel que a importação cria quando não há painel escolhido (`tipo`: o do painel do Helena; sem ele, Vendas) */
  painelNovo: { nome: string; sigla: string; tipo?: TipoDePainel };
  pessoas: PessoaParaHelena[];
  clientes: ClienteParaHelena[];
  produtos: ProdutoParaHelena[];
  /** as etiquetas que o catálogo já tem (os nomes) */
  etiquetas: string[];
  /**
   * o que já veio do Helena: o id do card → a negociação (o número, se a equipe mexeu nela no Gestor e se ela
   * está na lixeira — a que foi para a lixeira fica lá: não volta)
   */
  importadas: Record<string, { id: string; numero: number; mexidaNoGestor: boolean; naLixeira?: boolean }>;
  /** os números já usados no painel (os da lixeira também: o código não volta) */
  numerosOcupados: number[];
  /** o dia de hoje (AAAA-MM-DD, Brasília): o fim do mês a mês da prévia */
  hoje: string;
};

export type NegociacaoNoPlano = {
  helenaId: string;
  codigoNoHelena: string | null;
  /** a negociação que já veio numa leitura anterior (é atualizada); nulo = nova */
  chamadoId: string | null;
  numero: number;
  titulo: string;
  descricao: string | null;
  /** a etapa do Gestor (o nome) */
  etapa: string;
  resultado: ResultadoDaVenda | null;
  criadoEm: string;
  alteradoEm: string;
  fechadoEm: string | null;
  /** quando foi resolvido (o chamado no Resolvido ou no Fechado, 2.1.2; na negociação, o mesmo do fim) */
  resolvidoEm: string | null;
  responsavelId: string | null;
  criadoPorId: string | null;
  observadores: string[];
  clienteId: string | null;
  /** a empresa que ainda não é cliente (o nome no título) */
  empresa: string | null;
  produtos: string[];
  valor: number | null;
  valoresDosProdutos: Record<string, number>;
  ativacao: number | null;
  ativacoesDosProdutos: Record<string, number>;
  etiquetas: string[];
  /** os campos: a chave do campo no Helena → o valor já no jeito do campo do Gestor (a conferir com o campo de verdade) */
  campos: Record<string, unknown>;
  motivoPerda: string | null;
  reaberturas: number;
  eventos: EventoDoHelena[];
};

export type PreviaDoHelena = {
  /** o painel do Gestor que recebe é de Vendas (as negociações) ou de Gestão (os chamados, 2.1.2) */
  tipo: TipoDePainel;
  painelHelena: { id: string; nome: string; sigla: string | null };
  destino: { id: string | null; nome: string; sigla: string; novo: boolean };
  negociacoes: { total: number; novas: number; atualizadas: number; arquivadasFora: number; naLixeira: number };
  /** o que o relatório do Helena mostra hoje, para conferir: em andamento, ganhas e perdidas (todas) */
  numeros: { emAndamento: { qtd: number; valor: number }; ganhas: { qtd: number; valor: number }; perdidas: { qtd: number } };
  /** os ganhos mês a mês (pela Conclusão), dos 12 meses até hoje: o gráfico "Meta vs Ganho mensal" do Helena */
  ganhosPorMes: Array<{ mes: string; nome: string; curto: string; qtd: number; valor: number }>;
  etapas: {
    entram: string[]; jaExistem: string[]; ficam: string[]; saem: string[]; historicas: string[]; ganho: string; perdido: string; ordem: string[];
    /** o tipo de cada etapa (o nome → entrada, andamento, resolvido ou fechado) */
    tipos: Record<string, TipoEtapa>;
  };
  /** quantos registros vão para cada etapa, na ordem do painel */
  porEtapa: Array<{ nome: string; qtd: number }>;
  /** os chamados abertos, resolvidos e fechados (no painel de Gestão; no de Vendas, os fechados são as ganhas e as perdidas) */
  chamados: { abertos: number; resolvidos: number; fechados: number };
  /** quem vê o painel de Gestão novo (os nomes; quem traz também vê); nulo: o painel que existe, ou o de Vendas (todos veem) */
  quemVe: string[] | null;
  campos: { usa: string[]; cria: Array<{ nome: string; tipo: TipoCampo }>; fora: Array<{ nome: string; motivo: string }>; opcoesNovas: number; valoresRecusados: number };
  pessoas: Array<{ nome: string; pessoa: string | null; como: LigacaoDePessoa['como']; negociacoes: number }>;
  empresas: { clientes: number; leads: number; lista: Array<{ titulo: string; empresa: string; cliente: string | null; como: EmpresaDoCard['como'] }> };
  produtos: { ligados: Array<{ helena: string; gestor: string }>; semCadastro: string[]; comValorPorProduto: number; valorUnico: number };
  etiquetas: { total: number; novas: string[] };
  motivosNovos: string[];
  /** `semConclusao`: as ganhas e as perdidas sem a Conclusão do Helena (acabam no dia em que foram marcadas) */
  historico: { eventos: number; movimentos: number; semHistorico: number; semConclusao: number; completados: number; semCopia: number };
  /** a planilha do Helena que deu a Conclusão (2.1.1); nula: a leitura é só a da API */
  planilha: ResumoDaPlanilhaDoHelena | null;
  /** as que já vieram e a equipe mexeu no Gestor: voltam a ficar como no Helena */
  mexidasNoGestor: number;
  avisos: string[];
  /** o que impede trazer (a prévia mostra e o botão não aparece) */
  erro: string | null;
};

export type PlanoDaImportacao = {
  destino: PreviaDoHelena['destino'];
  etapas: PlanoDasEtapasDoHelena;
  campos: CampoNoPlano[];
  motivosDePerda: string[];
  /** as etiquetas novas no painel (cada painel tem as suas, 2.0.3), com a cor de lá */
  coresDasEtiquetas: Record<string, CorEtiqueta>;
  negociacoes: NegociacaoNoPlano[];
  /** o nome do Helena de cada id (para quem fez cada linha do histórico) e a pessoa do Gestor dele */
  autores: Record<string, { nome: string; pessoaId: string | null }>;
  /** quem vê o painel de Gestão novo (2.1.2): os responsáveis e os observadores dos cards (o servidor junta quem traz) */
  pessoasDoPainel: string[];
  previa: PreviaDoHelena;
};

/**
 * Os campos com que o painel de Vendas nasce (CAMPOS_DO_PAINEL_DE_VENDAS), com ids de mentira: a prévia do
 * painel novo conta com eles (o servidor cria o painel e refaz o plano com os de verdade).
 */
export function camposDeFabrica(): CampoPersonalizado[] {
  return CAMPOS_DO_PAINEL_DE_VENDAS.map((c, i) => ({
    id: `fabrica:${c.nome}`, painelId: '', nome: c.nome, tipo: c.tipo, dica: c.dica, ativo: true, ordem: i,
    opcoes: c.opcoes.map((nome) => ({ id: `fabrica:${c.nome}:${nome}`, nome, ativa: true })),
    incluirNaHora: c.tipo === 'lista' && !!c.incluirNaHora, parte: null, produtoId: null,
  }));
}

/**
 * O número de cada negociação: a que já veio fica com o dela; a nova fica com o número do Helena quando ele
 * está livre no painel; senão, o próximo livre depois do maior.
 */
export function numerarNegociacoes(cards: ReadonlyArray<{ id: string; numero: number | null; jaTem: number | null }>, ocupados: Iterable<number>): Map<string, number> {
  const usados = new Set(ocupados);
  const out = new Map<string, number>();
  for (const c of cards) if (c.jaTem !== null) { out.set(c.id, c.jaTem); usados.add(c.jaTem); }
  const querem = cards.filter((c) => c.jaTem === null);
  for (const c of querem) if (c.numero !== null && c.numero > 0 && !usados.has(c.numero)) { out.set(c.id, c.numero); usados.add(c.numero); }
  let proximo = Math.max(0, ...usados) + 1;
  for (const c of querem) if (!out.has(c.id)) { out.set(c.id, proximo); usados.add(proximo); proximo++; }
  return out;
}

const somaDe = (xs: ReadonlyArray<{ valor: number | null }>) => xs.reduce((t, x) => t + (x.valor ?? 0), 0);

/** As etapas que os cards e o histórico citam (os nomes como estão no Helena). */
function etapasCitadas(cards: readonly CardDoHelena[], conhecidas: ReadonlySet<string>): string[] {
  const nomes = new Set<string>();
  for (const c of cards) {
    if (c.etapa) nomes.add(c.etapa);
    for (const l of c.logs ?? []) {
      const x = lerLinhaDoHelena(l.texto, conhecidas);
      if (x.tipo === 'criado') nomes.add(x.etapa);
      if (x.tipo === 'movido') { nomes.add(x.de); nomes.add(x.para); }
    }
  }
  return [...nomes];
}

/**
 * O plano de trazer o Helena: as etapas, os campos, os motivos de perda, cada negociação com o histórico e a
 * prévia. O servidor grava o plano numa transação; a prévia clicável faz o mesmo na memória.
 */
export function planoDaImportacao(leitura: LeituraDoHelena, estado: EstadoDoGestorParaHelena): PlanoDaImportacao {
  // o painel que não é de vendas vira um painel de Gestão (2.1.2): os cards viram chamados
  if (tipoDoDestino(estado) === 'gestao') return planoDeGestao(leitura, estado);
  const avisos: string[] = [...(leitura.avisos ?? [])];
  const painel = estado.painel;
  const destino = painel
    ? { id: painel.id, nome: painel.nome, sigla: painel.sigla, novo: false }
    : { id: null, nome: estado.painelNovo.nome, sigla: estado.painelNovo.sigla, novo: true };
  const arquivados = leitura.cards.filter((c) => c.situacao === 'ARCHIVED');
  const naLixeira = leitura.cards.filter((c) => c.situacao !== 'ARCHIVED' && estado.importadas[c.id]?.naLixeira);
  const cards = leitura.cards.filter((c) => c.situacao !== 'ARCHIVED' && !estado.importadas[c.id]?.naLixeira);

  // 1. as etapas
  const conhecidas = new Set(leitura.painel.etapas.map((e) => chaveDoNome(e.nome)));
  const etapas = planoDasEtapas(leitura.painel.etapas, painel?.etapas ?? [], etapasCitadas(cards, conhecidas));
  const etapaDoGestor = (n: string) => etapas.doHelena[n] ?? etapas.doHelena[Object.keys(etapas.doHelena).find((k) => chaveDoNome(k) === chaveDoNome(n)) ?? ''] ?? nomeDeEtapa(n);
  const primeira = etapas.etapas.find((e) => e.tipo === 'entrada')?.nome ?? etapas.etapas[0]?.nome ?? 'Lead';

  // 2. os campos e os valores de cada card (o painel novo nasce com os campos de fábrica do painel de Vendas)
  const camposDoGestor = painel?.campos ?? camposDeFabrica();
  const campos = planoDosCampos(leitura.painel.campos, camposDoGestor, cards, painel?.camposDesligados);
  const finais = new Map(campos.filter((c) => c.acao !== 'fora').map((c) => [c.chave, campoDoPlano(c, camposDoGestor)]));
  const campoObservador = leitura.painel.campos.find((c) => papelDoCampo(c).papel === 'observadores');
  const campoCnpj = leitura.painel.campos.find((c) => chaveDoNome(c.nome) === 'cnpj');

  // 3. as pessoas (o id do Helena → o nome → a pessoa do Gestor)
  const nomeDoUsuario = new Map(leitura.usuarios.map((u) => [u.id, u.nome]));
  for (const c of cards) for (const l of c.logs ?? []) {
    const x = lerLinhaDoHelena(l.texto, conhecidas);
    if (x.tipo === 'criado' && l.usuarioId && !nomeDoUsuario.has(l.usuarioId)) nomeDoUsuario.set(l.usuarioId, x.por);
  }
  const ligadas = ligarPessoas([...new Set(nomeDoUsuario.values())], estado.pessoas);
  const pessoaDoUsuario = (id: string | null) => (id ? ligadas[nomeDoUsuario.get(id) ?? '']?.pessoaId ?? null : null);
  const autores: PlanoDaImportacao['autores'] = {};
  for (const [id, nome] of nomeDoUsuario) autores[id] = { nome, pessoaId: ligadas[nome]?.pessoaId ?? null };

  // 4. as etiquetas
  const etiquetaDoId = new Map(leitura.painel.etiquetas.map((t) => [t.id, t]));
  const catalogo = new Set(estado.etiquetas.map(chaveDaEtiqueta));
  const coresDasEtiquetas: Record<string, CorEtiqueta> = {};

  // 5. os números
  const numeros = numerarNegociacoes(cards.map((c) => ({ id: c.id, numero: c.numero, jaTem: estado.importadas[c.id]?.numero ?? null })), estado.numerosOcupados);

  const negociacoes: NegociacaoNoPlano[] = [];
  let valoresRecusados = 0, completados = 0, semHistorico = 0, semConclusao = 0, movimentos = 0, totalEventos = 0, semCopia = 0;
  let comValorPorProduto = 0, valorUnico = 0;
  const empresas: PreviaDoHelena['empresas']['lista'] = [];
  const produtosLigados = new Map<string, string>();
  const semCadastro = new Set<string>();
  const responsaveis = new Map<string, number>();
  const nomeDoProduto = new Map(estado.produtos.map((p) => [p.id, p.nome]));
  const nomeDoCliente = new Map(estado.clientes.map((c) => [c.id, c.nomes[0] ?? '']));

  for (const card of cards) {
    const h = historicoDoCard(card, { ganho: etapas.ganho, perdido: etapas.perdido, etapaDoGestor, primeira, conhecidas, painel: destino.nome });
    const v = valoresDoCard(card, leitura.painel.campos, estado.produtos);
    if (v.nota) {
      const ultimo = h.eventos.reduce((m, e) => (e.em > m ? e.em : m), h.eventos[0]!.em);
      h.eventos.push({ chave: `${card.id}:valores`, tipo: 'helena', em: MAIS_UM_MS(ultimo), usuarioId: null, dados: { texto: v.nota, helena: `${card.id}:valores` } });
      valorUnico++;
    } else if (Object.keys(v.valoresDosProdutos).length) comValorPorProduto++;
    for (const n of v.semCadastro) semCadastro.add(n);
    for (const id of v.produtos) {
      const nome = nomeDoProduto.get(id);
      if (nome) for (const c of leitura.painel.campos) {
        const p = papelDoCampo(c);
        const nomes = p.papel === 'produtos' ? nomesDoHelena(card.campos[c.chave]) : p.papel === 'mensalidade' || p.papel === 'ativacao' ? [p.produto] : [];
        for (const n of nomes) if (produtoPeloNome(n, estado.produtos)?.id === id) produtosLigados.set(n, nome);
      }
    }

    const valores: Record<string, unknown> = {};
    for (const [chave, campo] of finais) {
      const bruto = card.campos[chave];
      if (valorDoHelena(bruto) === null) continue;
      const pre = valorDoHelenaParaOCampo(campo.tipo, bruto);
      if (valorDoCampoNoGestor(campo, pre) === null) { valoresRecusados++; continue; }
      valores[chave] = pre;
    }

    const observadores = campoObservador
      ? [...new Set(nomesDoHelena(card.campos[campoObservador.chave]).map((n) => {
        const nome = nomeDoUsuario.get(n) ?? n;
        return ligadas[nome]?.pessoaId ?? ligarPessoas([nome], estado.pessoas)[nome]?.pessoaId ?? null;
      }).filter((x): x is string => !!x))]
      : [];

    const titulo = tituloDoHelena(card.titulo);
    if (titulo !== card.titulo.trim()) semCopia++;
    const emp = empresaDoCard(card.titulo, campoCnpj ? String(valorDoHelena(card.campos[campoCnpj.chave]) ?? '') : null, estado.clientes);
    empresas.push({ titulo, empresa: emp.empresa, cliente: emp.clienteId ? nomeDoCliente.get(emp.clienteId) ?? null : null, como: emp.como });

    const etiquetas = etiquetasUnicas(card.etiquetas.map((id) => etiquetaDoId.get(id)?.nome ?? '').filter(Boolean));
    for (const t of etiquetas) {
      const tag = leitura.painel.etiquetas.find((x) => x.nome === t);
      if (!catalogo.has(chaveDaEtiqueta(t))) coresDasEtiquetas[t] = corDaEtiquetaDoHelena(tag?.cor);
    }

    if (card.logs === null) semHistorico++;
    // ganha ou perdida sem a Conclusão: acaba no dia em que foi marcada (ou no da última mudança do card), e o mês
    // pode não ser o do Helena
    if (h.resultado && !card.concluidoEm) semConclusao++;
    if (h.completado) completados++;
    movimentos += h.movimentos;
    totalEventos += h.eventos.length;
    const responsavelNome = card.responsavelId ? nomeDoUsuario.get(card.responsavelId) ?? null : null;
    if (responsavelNome) responsaveis.set(responsavelNome, (responsaveis.get(responsavelNome) ?? 0) + 1);

    negociacoes.push({
      helenaId: card.id, codigoNoHelena: card.codigo,
      chamadoId: estado.importadas[card.id]?.id ?? null,
      numero: numeros.get(card.id)!,
      titulo: titulo.slice(0, 200), descricao: card.descricao?.trim() || null,
      etapa: h.etapa, resultado: h.resultado,
      criadoEm: iso(card.criadoEm), alteradoEm: iso(card.alteradoEm), fechadoEm: h.fechadoEm, resolvidoEm: h.fechadoEm,
      responsavelId: pessoaDoUsuario(card.responsavelId), criadoPorId: pessoaDoUsuario(card.criadoPorId),
      observadores,
      clienteId: emp.clienteId, empresa: emp.clienteId ? null : emp.empresa || null,
      produtos: v.produtos, valor: v.valor, valoresDosProdutos: v.valoresDosProdutos, ativacao: v.ativacao, ativacoesDosProdutos: v.ativacoesDosProdutos,
      etiquetas, campos: valores,
      motivoPerda: h.resultado === 'perdido' ? card.motivo?.trim() || 'Sem motivo no Helena' : null,
      reaberturas: h.reaberturas,
      eventos: h.eventos,
    });
  }

  // 6. os motivos de perda: os do Helena entram na lista do painel
  const motivosAntes = painel?.motivosDePerda ?? AJUSTES_DO_PAINEL_DE_VENDAS.motivosDePerda;
  const motivosDosCards = negociacoes.filter((n) => n.resultado === 'perdido' && n.motivoPerda).map((n) => n.motivoPerda!.slice(0, 60));
  const motivosDePerda = etiquetasUnicas([...motivosAntes, ...motivosDosCards]).slice(0, 30);
  const tinha = new Set(motivosAntes.map(chaveDaEtiqueta));
  const motivosNovos = motivosDePerda.filter((m) => !tinha.has(chaveDaEtiqueta(m)));

  // 7. a prévia
  const ganhas = negociacoes.filter((n) => n.resultado === 'ganho');
  const perdidas = negociacoes.filter((n) => n.resultado === 'perdido');
  const andamento = negociacoes.filter((n) => !n.resultado);
  const mesFim = estado.hoje.slice(0, 7);
  const ganhosPorMes = Array.from({ length: 12 }, (_, i) => somarMeses(mesFim, i - 11)).map((mes) => {
    const doMes = ganhas.filter((n) => n.fechadoEm && diaLocal(n.fechadoEm).slice(0, 7) === mes);
    return { mes, nome: nomeDoMes(mes), curto: mesCurto(mes), qtd: doMes.length, valor: somaDe(doMes) };
  });
  const entram = etapas.etapas.filter((e) => !e.id).map((e) => e.nome);
  const jaExistem = etapas.etapas.filter((e) => e.id && e.helena).map((e) => e.nome);
  const ficam = etapas.etapas.filter((e) => e.id && !e.helena && !e.resultado).map((e) => e.nome);
  const pessoas = Object.entries(ligadas).map(([nome, l]) => ({
    nome, pessoa: l.pessoaId ? estado.pessoas.find((p) => p.id === l.pessoaId)?.nome ?? null : null, como: l.como, negociacoes: responsaveis.get(nome) ?? 0,
  })).sort((a, b) => b.negociacoes - a.negociacoes || a.nome.localeCompare(b.nome, 'pt-BR'));
  const etiquetasTodas = etiquetasUnicas(negociacoes.flatMap((n) => n.etiquetas));
  const mexidas = cards.filter((c) => estado.importadas[c.id]?.mexidaNoGestor).length;

  if (naLixeira.length) avisos.push(`${naLixeira.length === 1 ? '1 negociação que já veio está' : `${naLixeira.length} negociações que já vieram estão`} na lixeira do Gestor: ${naLixeira.length === 1 ? 'fica' : 'ficam'} lá (para trazer de novo, restaure em Administração › Lixeira).`);
  if (arquivados.length) avisos.push(`${arquivados.length === 1 ? '1 card arquivado' : `${arquivados.length} cards arquivados`} no Helena ${arquivados.length === 1 ? 'fica' : 'ficam'} de fora (lá, não ${arquivados.length === 1 ? 'aparece' : 'aparecem'} mais no quadro).`);
  if (semHistorico) avisos.push(`${semHistorico === 1 ? '1 negociação veio' : `${semHistorico} negociações vieram`} sem o histórico (o Helena não devolveu): ${semHistorico === 1 ? 'nasce' : 'nascem'} na etapa de agora e ${semHistorico === 1 ? 'acaba' : 'acabam'} na Conclusão.`);
  const pl = leitura.planilha ?? null;
  if (pl) {
    const daPlanilha = `da planilha do Helena${pl.nome ? ` (${pl.nome})` : ''}, com ${pl.linhas === 1 ? '1 linha' : `${pl.linhas} linhas`} (${pl.casadas === 1 ? '1 de um card lido' : `${pl.casadas} de cards lidos`})`;
    avisos.push(pl.conclusoes
      ? `A Conclusão de ${pl.conclusoes === 1 ? '1 negociação' : `${pl.conclusoes} negociações`} veio ${daPlanilha}.`
      : `Nenhuma Conclusão veio ${daPlanilha}: as ganhas e as perdidas já tinham a data, ou a planilha não tem nenhuma.`);
    if (pl.foraDaLeitura) avisos.push(`${pl.foraDaLeitura === 1 ? '1 linha da planilha não é' : `${pl.foraDaLeitura} linhas da planilha não são`} de nenhum card lido (o card arquivado, ou de outro painel): ${pl.foraDaLeitura === 1 ? 'fica' : 'ficam'} de fora.`);
  }
  const acaba = semConclusao === 1 ? 'acaba no dia em que foi marcada' : 'acabam no dia em que foram marcadas';
  if (semConclusao && pl) {
    avisos.push(`${semConclusao === 1 ? '1 negociação ganha ou perdida continua' : `${semConclusao} negociações ganhas ou perdidas continuam`} sem a Conclusão (não ${semConclusao === 1 ? 'está' : 'estão'} na planilha, ou ${semConclusao === 1 ? 'está' : 'estão'} sem a data): ${acaba} (ou no da última mudança do card).`);
  } else if (semConclusao) {
    avisos.push(`${semConclusao === 1 ? '1 negociação ganha ou perdida veio' : `${semConclusao} negociações ganhas ou perdidas vieram`} sem a Conclusão do Helena (a chave de API do LineChat não lê essa data): ${acaba} (ou no da última mudança do card), e os ganhos mês a mês não batem com o relatório de lá. Use a planilha do Helena: no painel, em Lista, o botão Exportar.`);
  }
  if (completados) avisos.push(`${completados === 1 ? '1 histórico não chegava' : `${completados} históricos não chegavam`} aonde o card está: o fim foi completado pelo próprio card.`);
  if (valorUnico) avisos.push(`${valorUnico === 1 ? '1 negociação tem' : `${valorUnico} negociações têm`} a mensalidade por produto que não soma o Valor atribuído: ${valorUnico === 1 ? 'fica' : 'ficam'} com o valor único (o Valor atribuído, como no relatório do Helena), e os números de lá vão para o histórico.`);
  if (semCadastro.size) avisos.push(`Os produtos ${[...semCadastro].join(', ')} não estão no cadastro do Gestor: ficam fora dos produtos da negociação.`);
  if (valoresRecusados) avisos.push(`${valoresRecusados === 1 ? '1 valor de campo não serviu' : `${valoresRecusados} valores de campo não serviram`} no campo do Gestor e ${valoresRecusados === 1 ? 'ficou' : 'ficaram'} de fora.`);
  if (mexidas) avisos.push(`${mexidas === 1 ? '1 negociação que já veio foi mexida' : `${mexidas} negociações que já vieram foram mexidas`} no Gestor: ${mexidas === 1 ? 'volta' : 'voltam'} a ficar como no Helena (o que a equipe fez no Gestor continua no histórico).`);
  if (semCopia) avisos.push(`O "(Cópia)" que o Helena põe no card duplicado sai do título (${semCopia === 1 ? '1 negociação' : `${semCopia} negociações`}).`);

  const erro = etapas.erro ?? (cards.length ? null : arquivados.length ? 'O painel do Helena só tem cards arquivados: não há o que trazer.' : 'O painel do Helena não tem nenhum card.');
  const previa: PreviaDoHelena = {
    tipo: 'vendas',
    painelHelena: { id: leitura.painel.id, nome: leitura.painel.nome, sigla: leitura.painel.sigla },
    destino,
    negociacoes: { total: negociacoes.length, novas: negociacoes.filter((n) => !n.chamadoId).length, atualizadas: negociacoes.filter((n) => n.chamadoId).length, arquivadasFora: arquivados.length, naLixeira: naLixeira.length },
    numeros: { emAndamento: { qtd: andamento.length, valor: somaDe(andamento) }, ganhas: { qtd: ganhas.length, valor: somaDe(ganhas) }, perdidas: { qtd: perdidas.length } },
    ganhosPorMes,
    etapas: {
      entram, jaExistem, ficam, saem: etapas.saem.map((e) => e.nome), historicas: etapas.historicas, ganho: etapas.ganho, perdido: etapas.perdido,
      ordem: etapas.etapas.map((e) => e.nome), tipos: Object.fromEntries(etapas.etapas.map((e) => [e.nome, e.tipo])),
    },
    porEtapa: contarPorEtapa(etapas.etapas, negociacoes),
    chamados: { abertos: andamento.length, resolvidos: 0, fechados: ganhas.length + perdidas.length },
    quemVe: null,
    campos: {
      usa: campos.filter((c) => c.acao === 'usa').map((c) => c.nomeNoGestor),
      cria: campos.filter((c) => c.acao === 'cria').map((c) => ({ nome: c.nome, tipo: c.tipo })),
      fora: campos.filter((c) => c.acao === 'fora' && c.motivo).map((c) => ({ nome: c.nome, motivo: c.motivo! })),
      opcoesNovas: campos.reduce((t, c) => t + (c.acao === 'usa' ? c.opcoesNovas.length : 0), 0),
      valoresRecusados,
    },
    pessoas,
    empresas: { clientes: empresas.filter((e) => e.cliente).length, leads: empresas.filter((e) => !e.cliente).length, lista: empresas },
    produtos: { ligados: [...produtosLigados].map(([helena, gestor]) => ({ helena, gestor })), semCadastro: [...semCadastro], comValorPorProduto, valorUnico },
    etiquetas: { total: etiquetasTodas.length, novas: etiquetasTodas.filter((t) => !catalogo.has(chaveDaEtiqueta(t))) },
    motivosNovos,
    historico: { eventos: totalEventos, movimentos, semHistorico, semConclusao, completados, semCopia },
    planilha: pl,
    mexidasNoGestor: mexidas,
    avisos,
    erro,
  };
  return { destino, etapas, campos, motivosDePerda, coresDasEtiquetas, negociacoes, autores, pessoasDoPainel: [], previa };
}

/** Quantos registros vão para cada etapa, na ordem do painel. */
function contarPorEtapa(etapas: ReadonlyArray<{ nome: string }>, registros: ReadonlyArray<{ etapa: string }>): PreviaDoHelena['porEtapa'] {
  return etapas.map((e) => ({ nome: e.nome, qtd: registros.filter((n) => n.etapa === e.nome).length }));
}

/**
 * A frase da auditoria e do aviso no fim: "Trouxe do Helena o painel X para Y: 55 negociações (55 novas)"; no painel
 * de Gestão (2.1.2), "21 chamados (21 novos)".
 */
export function resumoDaImportacao(p: Pick<PreviaDoHelena, 'painelHelena' | 'destino' | 'negociacoes'> & { tipo?: TipoDePainel }): string {
  const n = p.negociacoes;
  const gestao = p.tipo === 'gestao';
  const [um, varios, nova, novas, atualizada, atualizadas] = gestao
    ? ['chamado', 'chamados', 'novo', 'novos', 'atualizado', 'atualizados']
    : ['negociação', 'negociações', 'nova', 'novas', 'atualizada', 'atualizadas'];
  const partes = [n.novas ? `${n.novas} ${n.novas === 1 ? nova : novas}` : '', n.atualizadas ? `${n.atualizadas} ${n.atualizadas === 1 ? atualizada : atualizadas}` : ''].filter(Boolean);
  return `Trouxe do Helena o painel ${p.painelHelena.nome} para ${p.destino.novo ? 'o painel novo ' : 'o painel '}${p.destino.nome} (${p.destino.sigla}): ${n.total} ${n.total === 1 ? um : varios}${partes.length ? ` (${partes.join(', ')})` : ''}`;
}

/**
 * A sigla do painel novo: a do Helena (IC) quando está livre — o IC-34 continua IC-34 —; senão, COM, VEN…
 * (a sigla é de 2 a 5 letras e não se repete, nem a de um painel que saiu).
 */
export function siglaDoPainelNovo(doHelena: string | null, ocupadas: Iterable<string>, tipo: TipoDePainel = 'vendas'): string {
  const usadas = new Set([...ocupadas].map((s) => s.toUpperCase()));
  const da = (doHelena ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z]/g, '');
  // o painel de Gestão (2.1.2): a sigla de lá (LA) e, ocupada, uma das atividades
  const outras = tipo === 'gestao' ? ['ATV', 'ATIV', 'INT', 'TAR', 'HEL'] : ['IC', 'COM', 'VEN', 'VND', 'CML', 'HEL'];
  for (const x of [da, ...outras]) {
    if (x.length >= 2 && x.length <= 5 && !usadas.has(x)) return x;
  }
  const letras = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const l = tipo === 'gestao' ? 'A' : 'V';
  for (const a of letras) for (const b of letras) if (!usadas.has(`${l}${a}${b}`)) return `${l}${a}${b}`;
  return `${l}ZZZZ`;
}

// =====================================================================
//  O PAINEL QUE NÃO É DE VENDAS (2.1.2): os cards viram chamados num painel de Gestão
// =====================================================================
//
// O pedido do Luan, em 26/10: "N necessariamente aqui eu vou trazer um painel do comercial, eu mesmo quero trazer
// um meu de atividades internas" (o Luan - Atividades, LA). O painel do Helena que não é de vendas vem para um
// painel de Gestão (o de chamados): o novo, com o nome e a sigla de lá, ou um que já existe. Cada card vira um
// chamado — o título, a descrição, o responsável, os observadores, o cliente (pelo título ou pelo CNPJ), as
// etiquetas, os campos e o histórico, quando o Helena devolve. Não há valor, Ganho nem Perdido: as etapas de fim
// do Helena ("Concluído", "Validado") resolvem e fecham o chamado.

/** O tipo do painel que recebe: o escolhido; sem painel escolhido, o do painel novo (sem a marca, Vendas). */
export function tipoDoDestino(estado: Pick<EstadoDoGestorParaHelena, 'painel' | 'painelNovo'>): TipoDePainel {
  return estado.painel ? estado.painel.tipo ?? 'vendas' : estado.painelNovo.tipo ?? 'vendas';
}

/** O tipo do painel do Gestor que recebe um painel do Helena: o de vendas vai para Vendas; o resto, para Gestão. */
export const tipoParaOPainelDoHelena = (p: Pick<PainelDoHelena, 'vendas'>): TipoDePainel => (p.vendas === false ? 'gestao' : 'vendas');

/**
 * Os ajustes do painel de Gestão novo: sem prazo (o SLA é do suporte aos clientes) e sem fechar sozinho, como o
 * Desenvolvimento. Dá para mudar em Painéis › Ajustes.
 */
export const AJUSTES_DO_PAINEL_DE_GESTAO_DO_HELENA: AjustesDoPainel = { ...AJUSTES_PAINEL_PADRAO, contaPrazo: false, fecharSozinhoDias: null };

/** O nome do painel de Gestão novo: o do Helena (o painel vai até 40 letras). */
export const nomeDoPainelDeGestaoNovo = (doHelena: string) => doHelena.replace(/\s+/g, ' ').trim().slice(0, 40) || 'Atividades';

const FECHA_O_CHAMADO = /\b(validad[oa]s?|fechad[oa]s?|encerrad[oa]s?|cancelad[oa]s?|arquivad[oa]s?|aprovad[oa]s?)\b/;
const RESOLVE_O_CHAMADO = /\b(conclu\w*|finaliz\w*|resolvid[oa]s?|feit[oa]s?|entregu\w*|done)\b/;

/**
 * Onde a etapa do Helena acaba o chamado: "Validado", "Fechado", "Encerrado", "Cancelado" e "Aprovado" fecham;
 * "Concluído", "Finalizado", "Resolvido", "Feito" e "Entregue" resolvem; a marca de fim do Helena, sem um desses
 * nomes, resolve. As outras são do andamento.
 */
export function fimDaEtapaDoHelena(e: Pick<EtapaDoHelena, 'nome' | 'final'>): 'resolvido' | 'fechado' | null {
  const n = paraBusca(e.nome);
  if (FECHA_O_CHAMADO.test(n)) return 'fechado';
  if (RESOLVE_O_CHAMADO.test(n)) return 'resolvido';
  return e.final ? 'resolvido' : null;
}

/** As etapas do painel de Gestão; `fechadoAMais`: o Helena não tinha etapa de fim, e entra o "Fechado". */
export type PlanoDasEtapasDeGestao = PlanoDasEtapasDoHelena & { fechadoAMais: string | null };

/**
 * As etapas do painel de Gestão depois de trazer o Helena.
 *  - No painel novo: as do Helena, na ordem de lá — a inicial é a entrada; as de fim resolvem ou fecham
 *    (`fimDaEtapaDoHelena`); sem nenhuma que feche, a última que resolve fecha; sem nenhuma de fim, entra o
 *    "Fechado" no fim (o painel de Gestão precisa de uma etapa que fecha).
 *  - No painel que existe: as dele ficam todas, como estão (nenhuma sai); a do Helena com o mesmo nome é a mesma; a
 *    que falta entra antes das de fim (as de andamento) ou no fim (as de fim).
 */
export function planoDasEtapasDeGestao(helena: readonly EtapaDoHelena[], gestor: readonly EtapaDoGestorParaHelena[], usadas: Iterable<string>): PlanoDasEtapasDeGestao {
  const ativas = [...helena].filter((e) => !e.arquivada).sort((a, b) => a.posicao - b.posicao);
  const temInicial = ativas.some((e) => e.inicial);
  const fins = ativas.map(fimDaEtapaDoHelena);
  if (!fins.includes('fechado')) { const i = fins.lastIndexOf('resolvido'); if (i >= 0) fins[i] = 'fechado'; }
  const porNome = new Map(gestor.map((e) => [chaveDoNome(e.nome), e]));
  const doHelena: Record<string, string> = {};
  const daHelena: EtapaNoPlano[] = [];
  ativas.forEach((e, i) => {
    const nome = nomeDeEtapa(e.nome);
    const k = chaveDoNome(nome);
    if (!k || daHelena.some((x) => chaveDoNome(x.nome) === k)) { doHelena[e.nome] = daHelena.find((x) => chaveDoNome(x.nome) === k)?.nome ?? nome; return; }
    const existe = porNome.get(k);
    const tipo: TipoEtapa = existe?.tipo ?? fins[i] ?? ((temInicial ? e.inicial : i === 0) ? 'entrada' : 'andamento');
    daHelena.push({ id: existe?.id ?? null, nome: existe?.nome ?? nome, tipo, resultado: null, obrigatorios: existe?.obrigatorios ?? [], avisar: existe?.avisar ?? [], helena: e.nome });
    doHelena[e.nome] = existe?.nome ?? nome;
  });

  let etapas: EtapaNoPlano[];
  if (!gestor.length) etapas = daHelena;
  else {
    const doHelenaPorId = new Map(daHelena.filter((x) => x.id).map((x) => [x.id!, x.helena]));
    const existentes: EtapaNoPlano[] = gestor.map((e) => ({ id: e.id, nome: e.nome, tipo: e.tipo, resultado: null, obrigatorios: e.obrigatorios, avisar: e.avisar, helena: doHelenaPorId.get(e.id) ?? null }));
    const ehFim = (t: TipoEtapa) => t === 'resolvido' || t === 'fechado';
    // a de entrada do Helena entra como andamento: o painel já tem a dele
    const novasAbertas = daHelena.filter((x) => !x.id && !ehFim(x.tipo)).map((x) => ({ ...x, tipo: 'andamento' as TipoEtapa }));
    const novasDeFim = daHelena.filter((x) => !x.id && ehFim(x.tipo));
    const i = existentes.findIndex((e) => ehFim(e.tipo));
    etapas = i < 0 ? [...existentes, ...novasAbertas, ...novasDeFim] : [...existentes.slice(0, i), ...novasAbertas, ...existentes.slice(i), ...novasDeFim];
  }
  let fechadoAMais: string | null = null;
  if (!etapas.some((e) => e.tipo === 'fechado')) {
    fechadoAMais = etapas.some((e) => chaveDoNome(e.nome) === chaveDoNome('Fechado')) ? 'Fechado (Gestor)' : 'Fechado';
    etapas.push({ id: null, nome: fechadoAMais, tipo: 'fechado', resultado: null, obrigatorios: [], avisar: [], helena: null });
  }
  if (!etapas.some((e) => e.tipo === 'entrada') && etapas[0]?.tipo === 'andamento') etapas[0] = { ...etapas[0], tipo: 'entrada' };

  // os nomes que só o histórico cita: a etapa que já saiu do Helena (ou foi arquivada lá)
  const historicas: string[] = [];
  for (const n of usadas) {
    if (!n?.trim() || doHelena[n] !== undefined) continue;
    const k = chaveDoNome(n);
    const mesma = etapas.find((e) => chaveDoNome(e.nome) === k) ?? gestor.find((e) => chaveDoNome(e.nome) === k);
    if (mesma) { doHelena[n] = mesma.nome; continue; }
    const nome = nomeDeEtapa(n);
    if (!historicas.some((h) => chaveDoNome(h) === chaveDoNome(nome))) historicas.push(nome);
    doHelena[n] = nome;
  }
  const erro = etapas.length > MAX_ETAPAS_DO_PAINEL
    ? `O painel do Gestor vai até ${MAX_ETAPAS_DO_PAINEL} etapas, e com as do Helena ficariam ${etapas.length}. Tire etapas vazias do painel do Gestor (Ajustes › Painéis) e leia de novo.`
    : null;
  return { etapas, saem: [], historicas, doHelena, ganho: '', perdido: '', erro, fechadoAMais };
}

export type OpcoesDoHistoricoDeGestao = Omit<OpcoesDoHistorico, 'ganho' | 'perdido'> & {
  /** o tipo de uma etapa do Gestor (pelo nome); a que só o histórico cita é do andamento */
  tipoDe: (nomeNoGestor: string) => TipoEtapa;
};

export type HistoricoDoChamado = Omit<HistoricoDoCard, 'resultado'> & {
  /** quando foi resolvido (está no Resolvido ou no Fechado) e quando foi fechado (nulo: não está) */
  resolvidoEm: string | null;
};

/**
 * O histórico de um card do Helena num painel de Gestão: a criação, cada mudança de etapa (entrar numa etapa de fim
 * resolve ou fecha; sair dela reabre), o título e a descrição; o resto como está escrito lá (o "marcado como Ganho"
 * também: num painel de Gestão não há Ganho). No fim, o histórico tem de chegar aonde o card está. Sem o histórico,
 * o chamado nasce na etapa de agora e, numa etapa de fim, acaba na última mudança do card.
 */
export function historicoDoCardDeGestao(card: CardDoHelena, o: OpcoesDoHistoricoDeGestao): HistoricoDoChamado {
  const linhas = [...(card.logs ?? [])]
    .map((l, i) => ({ l, i, linha: lerLinhaDoHelena(l.texto, o.conhecidas) }))
    .sort((a, b) => a.l.em.localeCompare(b.l.em) || a.i - b.i);
  const etapa = (nomeHelena: string): EtapaNoEvento => ({ nome: o.etapaDoGestor(nomeHelena), nivel: null });
  const eventos: EventoDoHelena[] = [];
  const criado = linhas.find((x) => x.linha.tipo === 'criado');
  const primeiroMovimento = linhas.find((x) => x.linha.tipo === 'movido');
  const nascimento = criado?.linha.tipo === 'criado' ? criado.linha.etapa
    : primeiroMovimento?.linha.tipo === 'movido' ? primeiroMovimento.linha.de
      : card.etapa ?? null;
  const inicial: EtapaNoEvento = nascimento ? etapa(nascimento) : { nome: o.primeira, nivel: null };
  eventos.push({
    chave: `${card.id}:criado`, tipo: 'criado', em: iso(card.criadoEm), usuarioId: criado?.l.usuarioId ?? card.criadoPorId,
    dados: { origem: 'helena', etapa: inicial.nome, painel: o.painel, ...(card.codigo ? { noHelena: card.codigo } : {}) },
  });

  const ehFim = (nome: string) => { const t = o.tipoDe(nome); return t === 'resolvido' || t === 'fechado'; };
  // sem o histórico, o que acabou acabou na última mudança do card (a Conclusão, quando houver); com ele, quando entrou
  const fimSemHistorico = iso(card.concluidoEm ?? card.alteradoEm);
  let atual = inicial.nome;
  let resolvidoEm: string | null = ehFim(atual) ? (card.logs ? iso(card.criadoEm) : fimSemHistorico) : null;
  let fechadoEm: string | null = o.tipoDe(atual) === 'fechado' ? resolvidoEm : null;
  let reaberturas = 0;
  let movimentos = 0;
  const texto = (x: { l: LogDoHelena }) => ({ texto: x.l.texto.replace(/\s+/g, ' ').trim() });
  const andar = (base: { chave: string; em: string; usuarioId: string | null }, para: EtapaNoEvento) => {
    const de: EtapaNoEvento = { nome: atual, nivel: null };
    const antes = o.tipoDe(atual);
    const depois = o.tipoDe(para.nome);
    eventos.push({ ...base, tipo: 'etapa', dados: { de, para, motivo: null, sentido: null } });
    movimentos++;
    if (depois === 'resolvido' || depois === 'fechado') {
      if (!ehFim(atual) || !resolvidoEm) resolvidoEm = base.em;
      fechadoEm = depois === 'fechado' ? (antes === 'fechado' && fechadoEm ? fechadoEm : base.em) : null;
    } else if (ehFim(atual)) {
      // saiu do fim: o chamado foi reaberto
      eventos.push({ ...base, chave: `${base.chave}:reaberto`, tipo: 'reaberto', dados: { motivo: null } });
      reaberturas++;
      resolvidoEm = null;
      fechadoEm = null;
    }
    atual = para.nome;
  };

  for (const x of linhas) {
    const base = { chave: x.l.id, em: iso(x.l.em), usuarioId: x.l.usuarioId };
    const l = x.linha;
    switch (l.tipo) {
      case 'criado':
        break;
      case 'movido': {
        const para = etapa(l.para);
        if (chaveDoNome(para.nome) !== chaveDoNome(atual)) andar(base, para);
        break;
      }
      case 'titulo':
        if (l.de !== l.para) eventos.push({ ...base, tipo: 'campo', dados: { campo: 'Título', de: l.de, para: l.para } });
        break;
      case 'descricao':
        eventos.push({ ...base, tipo: 'campo', dados: { campo: 'Descrição', longo: true } });
        break;
      default:
        eventos.push({ ...base, tipo: 'helena', dados: texto(x) });
    }
  }

  // o fim tem de ser o do card: a etapa que faltou (a linha que o Helena não devolveu) é completada por ele
  let completado = false;
  if (card.etapa && chaveDoNome(o.etapaDoGestor(card.etapa)) !== chaveDoNome(atual)) {
    completado = true;
    andar({ chave: `${card.id}:etapa`, em: iso(card.alteradoEm), usuarioId: null }, etapa(card.etapa));
  }

  for (let i = 2; i < eventos.length; i++) {
    const antes = eventos[i - 1]!.em;
    if (eventos[i]!.em <= antes && eventos[i - 1]!.tipo !== 'criado') eventos[i]!.em = MAIS_UM_MS(antes);
  }
  for (const ev of eventos) ev.dados = { ...ev.dados, helena: ev.chave };
  return {
    eventos, etapaInicial: inicial.nome, etapa: atual, resolvidoEm, fechadoEm,
    reaberturas, movimentos, semHistorico: card.logs === null, completado: completado && card.logs !== null,
  };
}

/** Os produtos do card (os campos "Produtos" e "Serviços ofertados" do Helena), pelos nomes do cadastro do Gestor. */
function produtosDoCard(card: Pick<CardDoHelena, 'campos'>, campos: readonly CampoDoHelena[], produtos: readonly ProdutoParaHelena[]): { ids: string[]; semCadastro: string[]; ligados: Array<[string, string]> } {
  const ids: string[] = [];
  const semCadastro: string[] = [];
  const ligados: Array<[string, string]> = [];
  for (const c of campos) {
    if (papelDoCampo(c).papel !== 'produtos') continue;
    for (const n of nomesDoHelena(card.campos[c.chave])) {
      const p = produtoPeloNome(n, produtos);
      if (p) { if (!ids.includes(p.id)) ids.push(p.id); ligados.push([n, p.nome]); } else if (!semCadastro.some((s) => chaveDoNome(s) === chaveDoNome(n))) semCadastro.push(n);
    }
  }
  return { ids, semCadastro, ligados };
}

/** O plano de trazer um painel do Helena que não é de vendas para um painel de Gestão (2.1.2). */
function planoDeGestao(leitura: LeituraDoHelena, estado: EstadoDoGestorParaHelena): PlanoDaImportacao {
  const avisos: string[] = [...(leitura.avisos ?? [])];
  const painel = estado.painel;
  const destino = painel
    ? { id: painel.id, nome: painel.nome, sigla: painel.sigla, novo: false }
    : { id: null, nome: estado.painelNovo.nome, sigla: estado.painelNovo.sigla, novo: true };
  const arquivados = leitura.cards.filter((c) => c.situacao === 'ARCHIVED');
  const naLixeira = leitura.cards.filter((c) => c.situacao !== 'ARCHIVED' && estado.importadas[c.id]?.naLixeira);
  const cards = leitura.cards.filter((c) => c.situacao !== 'ARCHIVED' && !estado.importadas[c.id]?.naLixeira);

  // 1. as etapas (com o tipo de cada uma)
  const conhecidas = new Set(leitura.painel.etapas.map((e) => chaveDoNome(e.nome)));
  const etapas = planoDasEtapasDeGestao(leitura.painel.etapas, painel?.etapas ?? [], etapasCitadas(cards, conhecidas));
  const etapaDoGestor = (n: string) => etapas.doHelena[n] ?? etapas.doHelena[Object.keys(etapas.doHelena).find((k) => chaveDoNome(k) === chaveDoNome(n)) ?? ''] ?? nomeDeEtapa(n);
  const primeira = etapas.etapas.find((e) => e.tipo === 'entrada')?.nome ?? etapas.etapas[0]?.nome ?? 'Novo';
  const tipoPorNome = new Map(etapas.etapas.map((e) => [chaveDoNome(e.nome), e.tipo]));
  const tipoDe = (nome: string): TipoEtapa => tipoPorNome.get(chaveDoNome(nome)) ?? 'andamento';

  // 2. os campos (o painel novo nasce sem campos) e os valores de cada card
  const camposDoGestor = painel?.campos ?? [];
  const campos = planoDosCampos(leitura.painel.campos, camposDoGestor, cards, painel?.camposDesligados ?? AJUSTES_DO_PAINEL_DE_GESTAO_DO_HELENA.camposDesligados, 'gestao');
  const finais = new Map(campos.filter((c) => c.acao !== 'fora').map((c) => [c.chave, campoDoPlano(c, camposDoGestor)]));
  const campoObservador = leitura.painel.campos.find((c) => papelDoCampo(c).papel === 'observadores');
  const campoCnpj = leitura.painel.campos.find((c) => chaveDoNome(c.nome) === 'cnpj');

  // 3. as pessoas
  const nomeDoUsuario = new Map(leitura.usuarios.map((u) => [u.id, u.nome]));
  for (const c of cards) for (const l of c.logs ?? []) {
    const x = lerLinhaDoHelena(l.texto, conhecidas);
    if (x.tipo === 'criado' && l.usuarioId && !nomeDoUsuario.has(l.usuarioId)) nomeDoUsuario.set(l.usuarioId, x.por);
  }
  const ligadas = ligarPessoas([...new Set(nomeDoUsuario.values())], estado.pessoas);
  const pessoaDoUsuario = (id: string | null) => (id ? ligadas[nomeDoUsuario.get(id) ?? '']?.pessoaId ?? null : null);
  const autores: PlanoDaImportacao['autores'] = {};
  for (const [id, nome] of nomeDoUsuario) autores[id] = { nome, pessoaId: ligadas[nome]?.pessoaId ?? null };

  // 4. as etiquetas e os números
  const etiquetaDoId = new Map(leitura.painel.etiquetas.map((t) => [t.id, t]));
  const catalogo = new Set(estado.etiquetas.map(chaveDaEtiqueta));
  const coresDasEtiquetas: Record<string, CorEtiqueta> = {};
  const numeros = numerarNegociacoes(cards.map((c) => ({ id: c.id, numero: c.numero, jaTem: estado.importadas[c.id]?.numero ?? null })), estado.numerosOcupados);

  const chamados: NegociacaoNoPlano[] = [];
  let valoresRecusados = 0, completados = 0, semHistorico = 0, movimentos = 0, totalEventos = 0, semCopia = 0, marcados = 0;
  const empresas: PreviaDoHelena['empresas']['lista'] = [];
  const produtosLigados = new Map<string, string>();
  const semCadastro = new Set<string>();
  const responsaveis = new Map<string, number>();
  const nomeDoCliente = new Map(estado.clientes.map((c) => [c.id, c.nomes[0] ?? '']));

  for (const card of cards) {
    const h = historicoDoCardDeGestao(card, { etapaDoGestor, primeira, conhecidas, painel: destino.nome, tipoDe });
    const pr = produtosDoCard(card, leitura.painel.campos, estado.produtos);
    for (const n of pr.semCadastro) semCadastro.add(n);
    for (const [helena, gestor] of pr.ligados) produtosLigados.set(helena, gestor);

    const valores: Record<string, unknown> = {};
    for (const [chave, campo] of finais) {
      const bruto = card.campos[chave];
      if (valorDoHelena(bruto) === null) continue;
      const pre = valorDoHelenaParaOCampo(campo.tipo, bruto);
      if (valorDoCampoNoGestor(campo, pre) === null) { valoresRecusados++; continue; }
      valores[chave] = pre;
    }
    const observadores = campoObservador
      ? [...new Set(nomesDoHelena(card.campos[campoObservador.chave]).map((n) => {
        const nome = nomeDoUsuario.get(n) ?? n;
        return ligadas[nome]?.pessoaId ?? ligarPessoas([nome], estado.pessoas)[nome]?.pessoaId ?? null;
      }).filter((x): x is string => !!x))]
      : [];

    const titulo = tituloDoHelena(card.titulo);
    if (titulo !== card.titulo.trim()) semCopia++;
    const emp = empresaDoCard(card.titulo, campoCnpj ? String(valorDoHelena(card.campos[campoCnpj.chave]) ?? '') : null, estado.clientes);
    empresas.push({ titulo, empresa: emp.empresa, cliente: emp.clienteId ? nomeDoCliente.get(emp.clienteId) ?? null : null, como: emp.como });

    const etiquetas = etiquetasUnicas(card.etiquetas.map((id) => etiquetaDoId.get(id)?.nome ?? '').filter(Boolean));
    for (const t of etiquetas) {
      const tag = leitura.painel.etiquetas.find((x) => x.nome === t);
      if (!catalogo.has(chaveDaEtiqueta(t))) coresDasEtiquetas[t] = corDaEtiquetaDoHelena(tag?.cor);
    }

    if (card.logs === null) semHistorico++;
    if (h.completado) completados++;
    if (card.situacao === 'WON' || card.situacao === 'LOST') marcados++;
    movimentos += h.movimentos;
    totalEventos += h.eventos.length;
    const responsavelNome = card.responsavelId ? nomeDoUsuario.get(card.responsavelId) ?? null : null;
    if (responsavelNome) responsaveis.set(responsavelNome, (responsaveis.get(responsavelNome) ?? 0) + 1);

    chamados.push({
      helenaId: card.id, codigoNoHelena: card.codigo,
      chamadoId: estado.importadas[card.id]?.id ?? null,
      numero: numeros.get(card.id)!,
      titulo: titulo.slice(0, 200), descricao: card.descricao?.trim() || null,
      etapa: h.etapa, resultado: null,
      criadoEm: iso(card.criadoEm), alteradoEm: iso(card.alteradoEm), fechadoEm: h.fechadoEm, resolvidoEm: h.resolvidoEm,
      responsavelId: pessoaDoUsuario(card.responsavelId), criadoPorId: pessoaDoUsuario(card.criadoPorId),
      observadores,
      clienteId: emp.clienteId, empresa: null,
      produtos: pr.ids, valor: null, valoresDosProdutos: {}, ativacao: null, ativacoesDosProdutos: {},
      etiquetas, campos: valores, motivoPerda: null,
      reaberturas: h.reaberturas,
      eventos: h.eventos,
    });
  }

  // quem vê o painel novo: os responsáveis e os observadores dos cards (o servidor junta quem traz)
  const pessoasDoPainel = [...new Set(chamados.flatMap((n) => [n.responsavelId, ...n.observadores]).filter((x): x is string => !!x))];
  const situacao = (n: NegociacaoNoPlano) => tipoDe(n.etapa);
  const abertos = chamados.filter((n) => situacao(n) !== 'resolvido' && situacao(n) !== 'fechado').length;
  const resolvidos = chamados.filter((n) => situacao(n) === 'resolvido').length;
  const fechados = chamados.filter((n) => situacao(n) === 'fechado').length;
  const entram = etapas.etapas.filter((e) => !e.id).map((e) => e.nome);
  const jaExistem = etapas.etapas.filter((e) => e.id && e.helena).map((e) => e.nome);
  const ficam = etapas.etapas.filter((e) => e.id && !e.helena).map((e) => e.nome);
  const pessoas = Object.entries(ligadas).map(([nome, l]) => ({
    nome, pessoa: l.pessoaId ? estado.pessoas.find((p) => p.id === l.pessoaId)?.nome ?? null : null, como: l.como, negociacoes: responsaveis.get(nome) ?? 0,
  })).sort((a, b) => b.negociacoes - a.negociacoes || a.nome.localeCompare(b.nome, 'pt-BR'));
  const etiquetasTodas = etiquetasUnicas(chamados.flatMap((n) => n.etiquetas));
  const mexidas = cards.filter((c) => estado.importadas[c.id]?.mexidaNoGestor).length;
  const um = (n: number, s: string, p: string) => (n === 1 ? s : p);

  if (naLixeira.length) avisos.push(`${um(naLixeira.length, '1 chamado que já veio está', `${naLixeira.length} chamados que já vieram estão`)} na lixeira do Gestor: ${um(naLixeira.length, 'fica', 'ficam')} lá (para trazer de novo, restaure em Administração › Lixeira).`);
  if (arquivados.length) avisos.push(`${um(arquivados.length, '1 card arquivado', `${arquivados.length} cards arquivados`)} no Helena ${um(arquivados.length, 'fica', 'ficam')} de fora (lá, não ${um(arquivados.length, 'aparece', 'aparecem')} mais no quadro).`);
  if (semHistorico) avisos.push(`${um(semHistorico, '1 chamado veio', `${semHistorico} chamados vieram`)} sem o histórico (o Helena não devolveu): ${um(semHistorico, 'nasce', 'nascem')} na etapa de agora; ${um(semHistorico, 'o que está', 'os que estão')} numa etapa de fim ${um(semHistorico, 'acaba', 'acabam')} na última mudança do card.`);
  if (etapas.fechadoAMais) avisos.push(`O painel ${leitura.painel.nome} não tem etapa de fim (Concluído, Validado…): entra a etapa ${etapas.fechadoAMais} no fim, para fechar o chamado.`);
  if (destino.novo) avisos.push('O painel novo não conta prazo (SLA) nem fecha o resolvido sozinho, como o Desenvolvimento: dá para mudar em Painéis › Ajustes.');
  if (marcados) avisos.push(`${um(marcados, '1 card está marcado', `${marcados} cards estão marcados`)} como ganho ou perdido no Helena: num painel de Gestão não há Ganho nem Perdido, e ${um(marcados, 'ele fica', 'eles ficam')} na etapa em que ${um(marcados, 'está', 'estão')}.`);
  if (completados) avisos.push(`${um(completados, '1 histórico não chegava', `${completados} históricos não chegavam`)} aonde o card está: o fim foi completado pelo próprio card.`);
  if (semCadastro.size) avisos.push(`Os produtos ${[...semCadastro].join(', ')} não estão no cadastro do Gestor: ficam fora dos produtos do chamado.`);
  if (valoresRecusados) avisos.push(`${um(valoresRecusados, '1 valor de campo não serviu', `${valoresRecusados} valores de campo não serviram`)} no campo do Gestor e ${um(valoresRecusados, 'ficou', 'ficaram')} de fora.`);
  if (mexidas) avisos.push(`${um(mexidas, '1 chamado que já veio foi mexido', `${mexidas} chamados que já vieram foram mexidos`)} no Gestor: ${um(mexidas, 'volta', 'voltam')} a ficar como no Helena (o que a equipe fez no Gestor continua no histórico).`);
  if (semCopia) avisos.push(`O "(Cópia)" que o Helena põe no card duplicado sai do título (${um(semCopia, '1 chamado', `${semCopia} chamados`)}).`);

  const erro = etapas.erro ?? (cards.length ? null : arquivados.length ? 'O painel do Helena só tem cards arquivados: não há o que trazer.' : 'O painel do Helena não tem nenhum card.');
  const nomeDaPessoa = new Map(estado.pessoas.map((p) => [p.id, p.nome]));
  const previa: PreviaDoHelena = {
    tipo: 'gestao',
    painelHelena: { id: leitura.painel.id, nome: leitura.painel.nome, sigla: leitura.painel.sigla },
    destino,
    negociacoes: { total: chamados.length, novas: chamados.filter((n) => !n.chamadoId).length, atualizadas: chamados.filter((n) => n.chamadoId).length, arquivadasFora: arquivados.length, naLixeira: naLixeira.length },
    numeros: { emAndamento: { qtd: abertos, valor: 0 }, ganhas: { qtd: 0, valor: 0 }, perdidas: { qtd: 0 } },
    ganhosPorMes: [],
    etapas: {
      entram, jaExistem, ficam, saem: [], historicas: etapas.historicas, ganho: '', perdido: '',
      ordem: etapas.etapas.map((e) => e.nome), tipos: Object.fromEntries(etapas.etapas.map((e) => [e.nome, e.tipo])),
    },
    porEtapa: contarPorEtapa(etapas.etapas, chamados),
    chamados: { abertos, resolvidos, fechados },
    quemVe: destino.novo ? pessoasDoPainel.map((id) => nomeDaPessoa.get(id) ?? '').filter(Boolean) : null,
    campos: {
      usa: campos.filter((c) => c.acao === 'usa').map((c) => c.nomeNoGestor),
      cria: campos.filter((c) => c.acao === 'cria').map((c) => ({ nome: c.nome, tipo: c.tipo })),
      fora: campos.filter((c) => c.acao === 'fora' && c.motivo).map((c) => ({ nome: c.nome, motivo: c.motivo! })),
      opcoesNovas: campos.reduce((t, c) => t + (c.acao === 'usa' ? c.opcoesNovas.length : 0), 0),
      valoresRecusados,
    },
    pessoas,
    empresas: { clientes: empresas.filter((e) => e.cliente).length, leads: empresas.filter((e) => !e.cliente).length, lista: empresas },
    produtos: { ligados: [...produtosLigados].map(([helena, gestor]) => ({ helena, gestor })), semCadastro: [...semCadastro], comValorPorProduto: 0, valorUnico: 0 },
    etiquetas: { total: etiquetasTodas.length, novas: etiquetasTodas.filter((t) => !catalogo.has(chaveDaEtiqueta(t))) },
    motivosNovos: [],
    historico: { eventos: totalEventos, movimentos, semHistorico, semConclusao: 0, completados, semCopia },
    planilha: null,
    mexidasNoGestor: mexidas,
    avisos,
    erro,
  };
  return {
    destino, etapas, campos, motivosDePerda: painel?.motivosDePerda ?? [], coresDasEtiquetas, negociacoes: chamados, autores, pessoasDoPainel, previa,
  };
}
