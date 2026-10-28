/**
 * Painéis › Ajustes (Patch 2.0, decisão 0047) — OS PAINÉIS.
 *
 * Cada painel é uma fila de chamados (Suporte, Desenvolvimento, Interno…) com a sua sigla (SUP-12),
 * a sua cor, quem vê, as suas etapas e as suas regras: se conta prazo, se o Resolvido fecha sozinho, o
 * que é obrigatório para abrir, se o pai espera os filhos e quem supervisiona. Os campos do chamado
 * em cada painel (o Assunto, o Tipo e as opções dele, os campos que a equipe cria) ficam na aba Campos;
 * aqui eles aparecem no que pode ser obrigatório.
 *
 * Tudo de um painel fica numa janela só, ao criar e ao editar — o pedido do Luan na prévia: "essa
 * parte das etapas pode ficar dentro de editar e também quando vou criar o painel". Salvar grava o
 * painel e as etapas juntos: se uma etapa que sai tem chamados, o servidor diz quais e a janela
 * pergunta para onde eles vão; até a resposta, nada muda (nem o nome do painel).
 *
 * As etapas são da equipe (o Luan: "as etapas têm que ser editáveis"): criar, renomear, tirar e mudar
 * a ordem (arrastando ou pelas setas), e em cada uma o tipo, o nível (N1, N2, N3 e DEV são
 * colunas), o que precisa estar preenchido para entrar e quem recebe o aviso. O painel novo começa
 * com Novo, Em andamento, Resolvido e Fechado — ou com as etapas de um painel que já existe.
 *
 * O painel é de **Gestão** (os chamados) ou de **Vendas** (2.0.1, decisão 0050: as negociações do
 * Comercial), escolhido ao criar — depois não muda. O de Vendas nasce com o funil (Lead, Qualificação,
 * Proposta enviada, Negociação) e as duas finais, Ganho e Perdido, que não saem (mudam de nome); não tem
 * prazo nem nível, e tem os motivos de perda e a meta do mês.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, ChevronDown, ChevronUp, GripVertical, HandCoins, Pencil, Plus, Rocket, ThumbsDown, Ticket, Trash2, Trophy, Undo2, UserPlus, X } from 'lucide-react';
import {
  AJUSTES_DO_PAINEL_DE_VENDAS, AJUSTES_PAINEL_PADRAO, CORES_PAINEL, DICA_CAMPO_DO_SISTEMA, camposDoSistemaDoTipo, painelContaPrazo, DICA_TIPO_ETAPA, ETAPAS_DO_PAINEL_DE_VENDAS, ETAPAS_DO_PAINEL_NOVO, ListaDeEtapasSchema,
  MAX_ETAPAS_DO_PAINEL, MODELO_DA_IMPLANTACAO, MOTIVOS_DE_PERDA_PADRAO, NIVEIS, NOME_CAMPO_DO_SISTEMA, NOME_RESULTADO_DA_VENDA, NOME_TIPO_ETAPA, SiglaSchema, TIPOS_ETAPA, etiquetasUnicas, idDaChave,
  limparObrigatorios, nomeDoObrigatorio, obrigatoriosDoPainel, paraBusca, problemaNasEtapasDoTipo, reaisInteiros, rotuloDoNivel,
  type AjustesDoPainel, type CampoDoSistema, type CampoObrigatorio, type CampoPersonalizado, type CorPainel, type EtapaGravarEntrada, type EtapaPainel, type Nivel, type Obrigatorio,
  type Painel, type PainelGravarEntrada, type PessoaCurta, type ResultadoDaVenda, type TipoDePainel, type TipoEtapa,
} from '@gestor/shared';
import { api } from '../../../api/index.js';
import { ApiError } from '../../../api/types.js';
import { Carregando, Chip, Confirmar, EscolherComBusca, Modal, Spinner, Toggle, mensagemErro, type OpcaoBusca } from '../../../components/ui/index.js';
import { useArrastar } from '../../../lib/arrastar.js';
import { CodigoChamado, TOM_DO_PAINEL, useDepoisDeMudar, useOpcoes } from '../comum.js';
import { CampoValor } from '../venda.js';

/** A cor cheia de cada painel (a bolinha do cartão e a amostra da escolha). */
const COR_CHEIA: Record<CorPainel, string> = {
  accent: 'bg-accent', roxo: 'bg-roxo', turquesa: 'bg-turquesa', signal: 'bg-signal', ok: 'bg-ok', rosa: 'bg-rosa', amarelo: 'bg-amarelo', neutral: 'bg-muted',
};
const NOME_COR: Record<CorPainel, string> = {
  accent: 'Azul', roxo: 'Roxo', turquesa: 'Turquesa', signal: 'Laranja', ok: 'Verde', rosa: 'Rosa', amarelo: 'Amarelo', neutral: 'Cinza',
};
/** O tipo da etapa em uma palavra (o resumo da linha); o nome inteiro e a dica ficam na escolha. */
const TIPO_CURTO: Record<TipoEtapa, string> = { entrada: 'Entrada', andamento: 'Andamento', resolvido: 'Resolvido', fechado: 'Fechado' };
/**
 * O que dá para exigir ao abrir: o que o formulário de abrir tem. Solução, causa, checklist e tempo
 * só existem depois de aberto — exigi-los na abertura travaria o painel inteiro.
 */
const CAMPOS_PARA_ABRIR: CampoObrigatorio[] = [
  'cliente', 'contato', 'valor', 'relato', 'descricao', 'assunto', 'tipo', 'gravidade', 'alcance', 'prioridade', 'produto', 'operadora', 'responsavel',
];
/** O que pode ser obrigatório neste painel: para entrar nas etapas (tudo o que ele usa) e para abrir (o que o formulário de abrir tem). */
function obrigatoriosQueValem(ajustes: Pick<AjustesDoPainel, 'camposDesligados'>, campos: CampoPersonalizado[], tipo: TipoDePainel) {
  const etapas = obrigatoriosDoPainel(ajustes, campos, tipo);
  return { etapas, abrir: etapas.filter((k) => idDaChave(k) || CAMPOS_PARA_ABRIR.includes(k as CampoObrigatorio)) };
}

const listaDeNomes = (xs: string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} e ${xs[xs.length - 1]}`);
const nomeDaPessoa = (pessoas: PessoaCurta[], id: string) => pessoas.find((p) => p.id === id)?.nome ?? '(pessoa desativada)';

export function AjustesPaineis() {
  const opcoes = useOpcoes();
  const [sp, setSp] = useSearchParams();
  /** a janela do painel: um painel (editar), 'novo', ou fechada */
  const [janela, setJanela] = useState<Painel | 'novo' | null>(null);
  // os desativados (2.1.3) começam fechados; abertos quando se chega pelo "ver em Ajustes › Painéis" da tela dos painéis
  const [verDesativados, setVerDesativados] = useState(() => sp.get('desativados') === '1');
  const chegou = useRef(false);
  /** o painel em que se mexeu fica no endereço (?painel=): a aba Assuntos abre no mesmo */
  const lembrar = useCallback((id: string | null, tirar?: string) => setSp((s) => {
    const n = new URLSearchParams(s);
    if (id) n.set('painel', id);
    if (tirar) n.delete(tirar);
    return n;
  }, { replace: true }), [setSp]);

  // vindo da tela inicial dos chamados ou do quadro: "Configurar" (?editar=) abre a janela daquele
  // painel e "Novo painel" (?novo=1), a do painel novo. O pedido sai do endereço, para o Voltar não
  // abrir a janela de novo
  useEffect(() => {
    if (!opcoes.data || chegou.current) return;
    chegou.current = true;
    const editar = sp.get('editar');
    if (sp.get('novo') === '1') {
      setJanela('novo');
      lembrar(null, 'novo');
    } else if (editar) {
      const p = opcoes.data.paineis.find((x) => x.id === editar);
      if (p) setJanela(p);
      lembrar(p ? p.id : null, 'editar');
    }
  }, [opcoes.data, sp, lembrar]);

  if (opcoes.isLoading) return <Carregando />;
  if (opcoes.isError || !opcoes.data) return <p className="text-bad text-sm" role="alert">{mensagemErro(opcoes.error)}</p>;
  const { paineis } = opcoes.data;
  const pessoas = opcoes.data.pessoas.filter((p) => p.ativo);
  // o desativado não fica no meio dos que estão em uso (2.1.3, o Luan: "esse painel comercial foi desabilitado e mesmo
  // assim ta aparecendo aqui"): vai para o fim, fechado em "Desativados (N)" — é aqui que se reativa (Editar › Painel ativo)
  const emUso = paineis.filter((p) => p.ativo);
  const desativados = paineis.filter((p) => !p.ativo);
  const cartao = (p: Painel) => (
    <CartaoPainel key={p.id} p={p} pessoas={opcoes.data!.pessoas} campos={opcoes.data!.campos.filter((c) => c.painelId === p.id)} onEditar={() => { setJanela(p); lembrar(p.id); }} />
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="text-[13.5px] text-ink-2 max-w-3xl">
          Cada painel é uma fila de chamados, com a sua sigla (o começo do código, como <b>SUP</b>-12), as suas etapas e as suas regras.
          Tudo fica em <b>Editar</b>, numa janela só; as etapas são as colunas do quadro, da esquerda para a direita.
        </p>
        <button type="button" className="btn-primary" id="painel-novo" onClick={() => setJanela('novo')}><Plus size={16} /> Novo painel</button>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3" id="paineis-ajustes">
        {emUso.map(cartao)}
      </div>

      {desativados.length > 0 && (
        <section className="flex flex-col gap-3" id="paineis-desativados-ajustes" aria-label="Painéis desativados">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <button type="button" className="btn-ghost btn-sm -ml-2 text-ink-2" aria-expanded={verDesativados} aria-controls="paineis-desativados-lista"
              onClick={() => setVerDesativados((v) => !v)}>
              {verDesativados ? <ChevronUp size={15} aria-hidden /> : <ChevronDown size={15} aria-hidden />} Desativados ({desativados.length})
            </button>
            <span className="text-[12.5px] text-muted">Não aparecem na tela Painéis nem recebem chamado novo. Para reativar: Editar › Painel ativo.</span>
          </div>
          {verDesativados && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3" id="paineis-desativados-lista">
              {desativados.map(cartao)}
            </div>
          )}
        </section>
      )}

      {janela && (
        <JanelaPainel key={janela === 'novo' ? 'novo' : janela.id} painel={janela === 'novo' ? null : janela} paineis={paineis}
          pessoas={pessoas} todasAsPessoas={opcoes.data.pessoas} campos={janela === 'novo' ? [] : opcoes.data.campos.filter((c) => c.painelId === janela.id)}
          onFechar={() => setJanela(null)} onSalvo={(p) => { setJanela(null); lembrar(p.id); }} />
      )}
    </div>
  );
}

// =====================================================================
//  O PAINEL NUM CARTÃO
// =====================================================================

function CartaoPainel({ p, pessoas, campos, onEditar }: { p: Painel; pessoas: PessoaCurta[]; campos: CampoPersonalizado[]; onEditar: () => void }) {
  const a = p.ajustes;
  const vendas = p.tipo === 'vendas';
  const usados = [...camposDoSistemaDoTipo(p.tipo).filter((c) => !a.camposDesligados.includes(c)).map((c) => NOME_CAMPO_DO_SISTEMA[c]), ...campos.filter((c) => c.ativo).map((c) => c.nome)];
  const paraAbrir = limparObrigatorios(a.obrigatoriosAoAbrir, obrigatoriosDoPainel(a, campos, p.tipo)).map((k) => nomeDoObrigatorio(k, campos));
  const quemVe = p.acesso === 'todos'
    ? 'Todos que veem chamados'
    : p.pessoas.length ? `Só ${listaDeNomes(p.pessoas.map((id) => nomeDaPessoa(pessoas, id)))}` : 'Só quem cuida dos chamados (ninguém escolhido)';
  const regras = vendas ? [
    'Painel de Vendas: o funil, o Ganho e o Perdido (sem prazo)',
    usados.length ? `Campos: ${usados.join(', ')}` : 'Sem campos além dos da negociação',
    a.motivosDePerda.length ? `Motivos de perda: ${a.motivosDePerda.join(', ')}` : 'Sem motivos de perda',
    a.metaMensal ? `Meta do mês: ${reaisInteiros(a.metaMensal)}` : 'Sem meta do mês',
    paraAbrir.length ? `Para criar: ${paraAbrir.join(', ')}` : 'Cria sem exigir nenhum campo',
    a.supervisores.length ? `Supervisão: ${listaDeNomes(a.supervisores.map((id) => nomeDaPessoa(pessoas, id)))}` : 'Sem supervisores',
  ] : [
    usados.length ? `Campos: ${usados.join(', ')}` : 'Sem campos além dos do chamado',
    painelContaPrazo(a) ? 'Conta prazo' : a.contaPrazo ? 'Não conta prazo (sem a prioridade)' : 'Não conta prazo',
    a.fecharSozinhoDias ? `O Resolvido fecha sozinho em ${a.fecharSozinhoDias} ${a.fecharSozinhoDias === 1 ? 'dia útil' : 'dias úteis'}` : 'O Resolvido não fecha sozinho',
    paraAbrir.length ? `Para abrir: ${paraAbrir.join(', ')}` : 'Abre sem exigir nenhum campo',
    a.paiEsperaFilhos ? 'O pai espera os filhos fecharem' : 'O pai fecha sem esperar os filhos',
    a.supervisores.length ? `Supervisão: ${listaDeNomes(a.supervisores.map((id) => nomeDaPessoa(pessoas, id)))}` : 'Sem supervisores',
  ];
  return (
    <section className="card p-4 flex flex-col gap-2.5 min-w-0" aria-label={`Painel ${p.nome}`} data-painel={p.sigla}>
      <div className="flex items-start gap-2.5">
        <span className={`w-3 h-3 rounded-full mt-1.5 shrink-0 ${COR_CHEIA[p.cor]}`} aria-hidden />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <h3 className="font-display font-semibold text-[15px] break-words">{p.nome}</h3>
            <Chip tone={TOM_DO_PAINEL[p.cor]} className="font-mono">{p.sigla}</Chip>
            {vendas && <Chip tone="ok" title="Painel de Vendas: as negociações"><HandCoins size={11} aria-hidden /> Vendas</Chip>}
            {!p.ativo && <Chip tone="muted">desativado</Chip>}
          </div>
          {p.descricao && <p className="text-[12.5px] text-muted leading-snug mt-0.5">{p.descricao}</p>}
        </div>
      </div>
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-[12.5px]">
        <dt className="text-muted">Abertos</dt>
        <dd>
          <Link to={`/atendimento/lista?painel=${encodeURIComponent(p.id)}`} className="font-semibold tnum text-ink hover:text-accent" title={`Ver os chamados abertos do ${p.nome} na lista`}>
            {p.abertos} {vendas ? (p.abertos === 1 ? 'negociação' : 'negociações') : p.abertos === 1 ? 'chamado' : 'chamados'}
          </Link>
        </dd>
        <dt className="text-muted">Quem vê</dt><dd className="text-ink-2 break-words">{quemVe}</dd>
        <dt className="text-muted">Etapas</dt><dd className="text-ink-2 break-words">{p.etapas.map((e) => e.nome).join(' → ') || '—'}</dd>
      </dl>
      <ul className="text-[12px] text-muted leading-snug flex flex-col gap-0.5 border-t border-line pt-2">
        {regras.map((r) => <li key={r} className="break-words">{r}</li>)}
      </ul>
      <div className="flex flex-wrap gap-2 mt-auto pt-1">
        <button type="button" className="btn-secondary btn-sm" onClick={onEditar} aria-label={`Editar o painel ${p.nome}`} title="O nome, quem vê, as etapas e as regras">
          <Pencil size={14} /> Editar
        </button>
      </div>
    </section>
  );
}

// =====================================================================
//  A JANELA DO PAINEL (novo ou editar): o nome, a sigla, a cor, quem vê, as etapas e as regras
// =====================================================================

type FormPainel = {
  nome: string; sigla: string; descricao: string; cor: CorPainel; acesso: 'todos' | 'escolhidos'; pessoas: string[]; ativo: boolean;
  tipos: string[]; contaPrazo: boolean; fecharSozinho: boolean; fecharSozinhoDias: string; obrigatoriosAoAbrir: Obrigatorio[];
  paiEsperaFilhos: boolean; supervisores: string[];
  /** os campos do sistema que o painel não usa (2.1.2: escolhidos na própria janela, a aba Os campos) */
  desligados: CampoDoSistema[];
  /** Gestão ou Vendas (só ao criar); no de Vendas, os motivos de perda e a meta do mês (centavos) */
  tipo: TipoDePainel; motivosDePerda: string[]; meta: number | null; metaValida: boolean;
};

function formDoPainel(p: Painel | null, tipo: TipoDePainel = p?.tipo ?? 'gestao'): FormPainel {
  const a = p?.ajustes ?? (tipo === 'vendas' ? AJUSTES_DO_PAINEL_DE_VENDAS : AJUSTES_PAINEL_PADRAO);
  return {
    nome: p?.nome ?? '', sigla: p?.sigla ?? '', descricao: p?.descricao ?? '', cor: p?.cor ?? 'accent', acesso: p?.acesso ?? 'todos', pessoas: p?.pessoas ?? [],
    ativo: p?.ativo ?? true, tipos: [...a.tipos], contaPrazo: a.contaPrazo, fecharSozinho: a.fecharSozinhoDias !== null,
    fecharSozinhoDias: String(a.fecharSozinhoDias ?? AJUSTES_PAINEL_PADRAO.fecharSozinhoDias ?? 3), obrigatoriosAoAbrir: [...a.obrigatoriosAoAbrir],
    paiEsperaFilhos: a.paiEsperaFilhos, supervisores: [...a.supervisores], desligados: [...a.camposDesligados],
    tipo, motivosDePerda: [...(a.motivosDePerda.length || p ? a.motivosDePerda : tipo === 'vendas' ? MOTIVOS_DE_PERDA_PADRAO : [])], meta: a.metaMensal ?? null, metaValida: true,
  };
}

type EtapaRascunho = EtapaGravarEntrada & {
  chave: string; nome: string; tipo: TipoEtapa; nivel: Nivel | null; obrigatorios: Obrigatorio[]; avisar: string[];
  /** no painel de Vendas: o Ganho e o Perdido (as finais, que não saem) */
  resultado: ResultadoDaVenda | null;
  /** a implantação (2.3): a etapa de Vendas que abre o card no painel escolhido; a de Gestão que liga no cadastro */
  abreImplantacao: string | null;
  ligaNoCadastro: boolean;
  /** e a de Vendas que recebe a negociação quando a implantação termina (o Implantado do Comercial) */
  recebeImplantacao: boolean;
};
type Saindo = { etapa: EtapaRascunho; posicao: number };
type EtapaComChamados = { id: string; nome: string; chamados: number };

let sequencia = 0;
const daEtapa = (e: EtapaPainel): EtapaRascunho => ({
  chave: e.id, id: e.id, nome: e.nome, tipo: e.tipo, nivel: e.nivel, obrigatorios: [...e.obrigatorios], avisar: [...e.avisar], resultado: e.resultado ?? null,
  abreImplantacao: e.abreImplantacao ?? null, ligaNoCadastro: !!e.ligaNoCadastro, recebeImplantacao: !!e.recebeImplantacao,
});
/** Uma etapa que ainda não existe (sem id): a do painel novo, a copiada de outro painel ou a incluída agora. */
const etapaNova = (e: Pick<EtapaPainel, 'nome' | 'tipo' | 'nivel' | 'obrigatorios'> & { avisar?: string[]; resultado?: ResultadoDaVenda | null; abreImplantacao?: string | null; ligaNoCadastro?: boolean; recebeImplantacao?: boolean }): EtapaRascunho =>
  ({
    chave: `nova-${++sequencia}`, nome: e.nome, tipo: e.tipo, nivel: e.nivel, obrigatorios: [...e.obrigatorios], avisar: [...(e.avisar ?? [])], resultado: e.resultado ?? null,
    abreImplantacao: e.abreImplantacao ?? null, ligaNoCadastro: !!e.ligaNoCadastro, recebeImplantacao: !!e.recebeImplantacao,
  });
const paraGravar = ({ chave: _chave, ...e }: EtapaRascunho): EtapaGravarEntrada => ({ ...e, nome: e.nome.trim() });
const assinatura = (xs: EtapaRascunho[]) => JSON.stringify(xs.map(paraGravar));
/**
 * As etapas de um painel que já existe, copiadas para o novo (sem os ids: no painel novo, todas nascem),
 * ou as básicas. Os campos do painel de origem não vão junto nas regras: são daquele painel.
 */
function etapasDoModelo(modelo: Painel | undefined, tipo: TipoDePainel = 'gestao'): EtapaRascunho[] {
  const fonte: Array<Pick<EtapaPainel, 'nome' | 'tipo' | 'nivel' | 'obrigatorios'> & { avisar?: string[]; resultado?: ResultadoDaVenda | null; abreImplantacao?: string | null; ligaNoCadastro?: boolean; recebeImplantacao?: boolean }> = modelo
    ? modelo.etapas : tipo === 'vendas' ? ETAPAS_DO_PAINEL_DE_VENDAS : ETAPAS_DO_PAINEL_NOVO;
  return fonte.map((e) => etapaNova({ ...e, obrigatorios: e.obrigatorios.filter((k) => !idDaChave(k)) }));
}

/** "Andamento · N2 · pede: Cliente, Relato do cliente, Assunto · avisa: Pedro". */
function resumoDaEtapa(e: EtapaRascunho, pessoas: PessoaCurta[], campos: CampoPersonalizado[], paineis: Painel[] = []): string {
  const pede = [...e.obrigatorios.map((k) => nomeDoObrigatorio(k, campos)), ...(e.resultado === 'perdido' ? ['o motivo da perda (sempre)'] : [])];
  return [
    e.resultado ? `Final: ${NOME_RESULTADO_DA_VENDA[e.resultado]}` : TIPO_CURTO[e.tipo],
    rotuloDoNivel(e.nivel),
    pede.length ? `pede: ${pede.join(', ')}` : 'não pede nada',
    e.avisar.length ? `avisa: ${listaDeNomes(e.avisar.map((id) => nomeDaPessoa(pessoas, id)))}` : '',
    e.abreImplantacao ? `abre a implantação em ${paineis.find((p) => p.id === e.abreImplantacao)?.nome ?? 'um painel que saiu'}` : '',
    e.ligaNoCadastro ? 'liga no cadastro do cliente' : '',
    e.recebeImplantacao ? 'recebe a negociação quando a implantação termina' : '',
  ].filter(Boolean).join(' · ');
}

/** As partes da janela (a barra de cima leva a cada uma). */
const PARTES = [
  { id: 'painel-geral', nome: 'O painel' },
  { id: 'painel-etapas', nome: 'As etapas' },
  { id: 'painel-campos', nome: 'Os campos' },
  { id: 'painel-regras', nome: 'As regras' },
] as const;
const irPara = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

function JanelaPainel({ painel, paineis, pessoas, todasAsPessoas, campos, onFechar, onSalvo }: {
  painel: Painel | null; paineis: Painel[]; pessoas: PessoaCurta[]; todasAsPessoas: PessoaCurta[];
  /** os campos deste painel (o painel novo ainda não tem nenhum) */
  campos: CampoPersonalizado[];
  onFechar: () => void; onSalvo: (p: Painel) => void;
}) {
  const depois = useDepoisDeMudar();
  const [inicio] = useState(() => ({ form: formDoPainel(painel), etapas: painel ? painel.etapas.map(daEtapa) : etapasDoModelo(undefined) }));
  const [f, setF] = useState<FormPainel>(inicio.form);
  const vendas = f.tipo === 'vendas';
  /** o painel novo pelo modelo Implantação (2.3): as etapas, os campos (a curadoria, a configuração, os testes) e as regras */
  const [implantacao, setImplantacao] = useState(false);
  /** os painéis de Gestão (para onde a etapa de Vendas abre a implantação) */
  const paineisDeGestao = useMemo(() => paineis.filter((p) => p.tipo === 'gestao' && p.id !== painel?.id), [paineis, painel?.id]);
  // o que pode ser obrigatório neste painel (o painel novo usa os campos do sistema do tipo dele)
  // (2.1.2) os campos desligados na própria janela já saem do que pode ser pedido
  const validos = useMemo(() => obrigatoriosQueValem({ camposDesligados: f.desligados }, campos, f.tipo), [f.desligados, campos, f.tipo]);
  const semPrioridade = f.desligados.includes('prioridade');
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [fechar, setFechar] = useState(false);
  const mudar = (o: Partial<FormPainel>) => { setF((x) => ({ ...x, ...o })); setErro(''); };

  // ---- as etapas, na mesma janela ----
  const [rascunho, setRascunho] = useState<EtapaRascunho[]>(inicio.etapas);
  const [saindo, setSaindo] = useState<Saindo[]>([]);
  const [abertas, setAbertas] = useState<Set<string>>(new Set());
  /** o painel novo começa com as etapas básicas ou com as de um painel que já existe */
  const [modelo, setModelo] = useState('');
  /** o servidor disse que estas etapas saem com chamados: a janela pergunta para onde eles vão */
  const [semDestino, setSemDestino] = useState<{ mensagem: string; etapas: EtapaComChamados[] } | null>(null);
  /** o que vai para o servidor: no painel novo, sempre; ao editar, só se a lista mudou (editar só o nome não mexe nas etapas) */
  const etapasMudaram = !painel || assinatura(rascunho) !== assinatura(inicio.etapas) || saindo.length > 0;
  /** para o "Fechar sem salvar?": no painel novo, só escolher de onde vêm as etapas não conta como mexer */
  const mexeuNasEtapas = painel ? etapasMudaram : assinatura(rascunho) !== assinatura(etapasDoModeloAtual(modelo, paineis, inicio.etapas));
  const mudouAlgo = mexeuNasEtapas || JSON.stringify(f) !== JSON.stringify(inicio.form);

  // quantos chamados há em cada etapa (o quadro do painel conta), para tirar uma etapa sabendo o que ela tem
  const quadro = useQuery({
    queryKey: ['atendimento', 'quadro', 'ajustes', painel?.id], queryFn: () => api.atendimento.quadro({ painel: painel!.id }), enabled: !!painel, staleTime: 30_000,
  });
  const chamadosNa = (id: string | undefined) => (id ? quadro.data?.colunas.find((c) => c.etapa.id === id)?.total ?? null : null);

  const sigla = f.sigla.trim().toUpperCase();
  const siglaOk = SiglaSchema.safeParse(sigla);
  // a sugestão da sigla: as três primeiras letras do nome, sem acento (só no lugar vazio, a pessoa decide)
  const siglaSugerida = paraBusca(f.nome).replace(/[^a-z]/g, '').slice(0, 3).toUpperCase();
  const dias = Number(f.fecharSozinhoDias);
  const diasOk = Number.isInteger(dias) && dias >= 1 && dias <= 60;

  const mexer = (fn: (xs: EtapaRascunho[]) => EtapaRascunho[]) => { setRascunho(fn); setErro(''); };
  const usarModelo = (id: string) => {
    setModelo(id);
    setRascunho(etapasDoModelo(paineis.find((p) => p.id === id), f.tipo));
    setAbertas(new Set()); setErro('');
  };
  /** O painel novo: Gestão ou Vendas. Trocar recomeça as etapas e as regras do tipo (o nome, a sigla, a cor e quem vê ficam). */
  const trocarTipo = (tipo: TipoDePainel) => {
    if (tipo === f.tipo && !implantacao) return;
    const base = formDoPainel(null, tipo);
    const doModelo = implantacao ? MODELO_DA_IMPLANTACAO : null;
    // saindo do modelo Implantação, o nome, a sigla e a descrição dele não ficam
    setF((x) => ({
      ...base, nome: doModelo && x.nome === doModelo.nome ? '' : x.nome, sigla: doModelo && x.sigla === doModelo.sigla ? '' : x.sigla,
      descricao: doModelo && x.descricao === doModelo.descricao ? '' : x.descricao, cor: x.cor, acesso: x.acesso, pessoas: x.pessoas, ativo: x.ativo,
    }));
    setImplantacao(false);
    setModelo('');
    setRascunho(etapasDoModelo(undefined, tipo));
    setAbertas(new Set()); setErro('');
  };
  /** O modelo Implantação: um painel de Gestão com as etapas, as regras e (ao criar) os campos do modelo. */
  const usarImplantacao = () => {
    if (implantacao) return;
    const m = MODELO_DA_IMPLANTACAO;
    const base = formDoPainel(null, 'gestao');
    setF((x) => ({
      ...base, nome: x.nome || m.nome, sigla: x.sigla || m.sigla, descricao: x.descricao || m.descricao, cor: m.cor, acesso: x.acesso, pessoas: x.pessoas, ativo: x.ativo,
      tipos: [...m.ajustes.tipos], contaPrazo: false, fecharSozinho: false, desligados: [...m.ajustes.camposDesligados], paiEsperaFilhos: m.ajustes.paiEsperaFilhos,
    }));
    setImplantacao(true);
    setModelo('');
    setRascunho(m.etapas.map((e) => etapaNova(e)));
    setAbertas(new Set()); setErro('');
  };

  const salvar = async (destino: Record<string, string> = {}) => {
    if (!f.nome.trim()) { setErro('Dê um nome ao painel.'); irPara('painel-geral'); document.getElementById('painel-nome')?.focus(); return; }
    if (!siglaOk.success) { setErro('A sigla tem de 2 a 5 letras, sem acento (ex.: SUP).'); document.getElementById('painel-sigla')?.focus(); return; }
    // as mesmas conferências do servidor (o schema do @gestor/shared), ditas com o número da etapa
    const etapas = rascunho.map(paraGravar);
    const conferido = ListaDeEtapasSchema.safeParse(etapas);
    if (!conferido.success) {
      const i = conferido.error.issues[0]!;
      const n = typeof i.path[0] === 'number' ? i.path[0] : null;
      setErro(n !== null ? `Etapa ${n + 1}: ${i.message}.` : `${i.message}.`);
      const k = n !== null ? rascunho[n]?.chave : undefined;
      if (k) { setAbertas((s) => new Set(s).add(k)); window.setTimeout(() => document.getElementById(`etapa-nome-${k}`)?.focus(), 30); } else irPara('painel-etapas');
      return;
    }
    // o painel de Vendas acaba em Ganho e Perdido (as mesmas regras do servidor)
    const doTipo = problemaNasEtapasDoTipo(f.tipo, rascunho);
    if (doTipo) { setErro(doTipo); irPara('painel-etapas'); return; }
    if (!vendas && f.fecharSozinho && !diasOk) { setErro('O "fecha sozinho" vai de 1 a 60 dias úteis.'); document.getElementById('painel-dias')?.focus(); return; }
    const motivos = etiquetasUnicas(f.motivosDePerda);
    if (vendas && !motivos.length) { setErro('O painel de Vendas precisa de pelo menos um motivo de perda.'); irPara('painel-regras'); return; }
    if (vendas && !f.metaValida) { setErro('Escreva a meta do mês como 40.000,00 (ou deixe vazia).'); document.getElementById('painel-meta')?.focus(); return; }
    const d: PainelGravarEntrada = {
      nome: f.nome.trim(), sigla, descricao: f.descricao.trim() || null, cor: f.cor, acesso: f.acesso,
      // quem estava escolhido fica guardado mesmo com "todos": voltar para "escolhidos" não perde a lista
      pessoas: f.pessoas, ativo: f.ativo,
      // o tipo vale ao criar (depois, o servidor não muda)
      tipo: f.tipo,
      ajustes: {
        tipos: f.tipos, contaPrazo: vendas ? false : f.contaPrazo, fecharSozinhoDias: !vendas && f.fecharSozinho ? dias : null,
        camposDesligados: f.desligados.filter((c) => camposDoSistemaDoTipo(f.tipo).includes(c) || (vendas ? AJUSTES_DO_PAINEL_DE_VENDAS : AJUSTES_PAINEL_PADRAO).camposDesligados.includes(c)),
        obrigatoriosAoAbrir: validos.abrir.filter((c) => f.obrigatoriosAoAbrir.includes(c)), paiEsperaFilhos: vendas ? false : f.paiEsperaFilhos, supervisores: f.supervisores,
        ...(vendas ? { motivosDePerda: motivos, metaMensal: f.meta } : {}),
      },
      ...(etapasMudaram ? { etapas, destino } : {}),
      ...(!painel && implantacao ? { modelo: 'implantacao' as const } : {}),
    };
    setSalvando(true); setErro('');
    try {
      const p = await depois(api.atendimento.salvarPainel(painel?.id ?? null, d),
        painel ? `Painel ${d.nome} salvo` : `Painel ${d.nome} criado, com as etapas ${listaDeNomes(etapas.map((e) => e.nome))}`);
      setSemDestino(null);
      onSalvo(p);
    } catch (e) {
      const det = e instanceof ApiError && e.status === 400 && e.details && typeof e.details === 'object' && !Array.isArray(e.details)
        ? (e.details as { etapas?: EtapaComChamados[] }).etapas : undefined;
      if (det?.length) setSemDestino({ mensagem: e instanceof Error ? e.message : '', etapas: det });
      else { setSemDestino(null); setErro(mensagemErro(e)); }
    } finally {
      setSalvando(false);
    }
  };
  // fechar com mudanças pergunta antes (um clique fora da janela não perde o que foi feito)
  const pedirParaFechar = () => { if (mudouAlgo) setFechar(true); else onFechar(); };

  return (
    <Modal open onClose={pedirParaFechar} largura="max-w-3xl" titulo={painel ? `Editar o painel ${painel.nome}` : vendas ? 'Novo painel de Vendas' : implantacao ? 'Novo painel de Implantação' : 'Novo painel'}
      rodape={<>
        {erro && <p className="text-bad text-[13px] mr-auto basis-full sm:basis-auto sm:flex-1" role="alert" id="painel-erro">{erro}</p>}
        <button type="button" className="btn-secondary" onClick={pedirParaFechar}>Cancelar</button>
        <button type="button" className="btn-primary" id="painel-salvar" disabled={salvando} onClick={() => void salvar()}>
          {salvando ? <Spinner className="text-white" /> : painel ? 'Salvar' : 'Criar painel'}
        </button>
      </>}>
      <form autoComplete="off" onSubmit={(e) => { e.preventDefault(); void salvar(); }} className="flex flex-col gap-4">
        {/* a janela é comprida: a barra leva a cada parte. Ela gruda no alto da caixa que rola (o -top-4
            desconta o espaço de cima da caixa; sem ele, o texto passava por cima da barra) */}
        <nav className="sticky -top-4 z-10 -mx-5 -mt-4 px-4 py-1.5 bg-surface border-b border-line flex gap-1 overflow-x-auto" aria-label="Partes da janela" id="painel-partes">
          {PARTES.map((x) => (
            <button key={x.id} type="button" className="btn-ghost btn-sm whitespace-nowrap" onClick={() => irPara(x.id)}>
              {x.nome}{x.id === 'painel-etapas' ? ` (${rascunho.length})` : ''}
            </button>
          ))}
        </nav>

        <section id="painel-geral" className="scroll-mt-14 flex flex-col gap-4" aria-label="O painel">
          {/* Gestão ou Vendas: escolhido ao criar (o de Vendas é o funil do Comercial); depois não muda */}
          {!painel ? (
            <CampoRotulo rotulo="O painel é de" id="painel-tipo" grupo>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3" role="radiogroup" aria-label="O painel é de" id="painel-tipo">
                <OpcaoDoTipo ativo={!vendas && !implantacao} onClick={() => trocarTipo('gestao')} icone={<Ticket size={17} aria-hidden />} titulo="Chamados (Gestão)"
                  texto="As etapas, os níveis (N1, N2…), o prazo e o Resolvido. O Suporte, o Desenvolvimento, o Administrativo." />
                <OpcaoDoTipo ativo={vendas} onClick={() => trocarTipo('vendas')} icone={<HandCoins size={17} aria-hidden />} titulo="Negociações (Vendas)"
                  texto="O funil, o valor, o Ganho e o Perdido (com o motivo) e o relatório de vendas. O Comercial." />
                <OpcaoDoTipo ativo={implantacao} onClick={usarImplantacao} icone={<Rocket size={17} aria-hidden />} titulo="Implantação (Gestão)"
                  texto="Um card por cliente novo: a curadoria, a configuração e os testes de cada produto. O Implantado liga os produtos e os módulos no cadastro." />
              </div>
              {implantacao && (
                <p className="text-[12.5px] text-ink-2 rounded-lg bg-surface-2 px-3 py-2 mt-2" id="painel-modelo-implantacao">
                  Já vem com as etapas ({MODELO_DA_IMPLANTACAO.etapas.map((e) => e.nome).join(', ')}) e os {MODELO_DA_IMPLANTACAO.campos.length} campos da curadoria, da configuração e
                  dos testes do LineChat e do LinePBX (dá para mudar tudo depois, em Ajustes › Campos). Para a negociação abrir o card sozinha, escolha no painel do
                  Comercial a etapa que <b>abre a implantação</b> neste painel.
                </p>
              )}
            </CampoRotulo>
          ) : vendas && (
            <p className="text-[12.5px] text-ink-2 rounded-lg bg-surface-2 px-3 py-2 flex items-center gap-2" id="painel-tipo">
              <HandCoins size={15} className="text-ok shrink-0" aria-hidden /> Painel de <b>Vendas</b>: as negociações, com o funil, o Ganho e o Perdido. O tipo não muda depois de criado.
            </p>
          )}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_150px]">
            <CampoRotulo rotulo="Nome" id="painel-nome">
              <input className="input" id="painel-nome" value={f.nome} maxLength={40} placeholder={vendas ? 'Ex.: Comercial' : 'Ex.: Interno'} autoFocus={!painel} onChange={(e) => mudar({ nome: e.target.value })} />
            </CampoRotulo>
            <CampoRotulo rotulo="Sigla" id="painel-sigla" erro={f.sigla && !siglaOk.success ? 'De 2 a 5 letras, sem acento.' : undefined}>
              <input className="input font-mono uppercase" id="painel-sigla" value={f.sigla} maxLength={5} placeholder={siglaSugerida.length >= 2 ? siglaSugerida : 'SUP'}
                onChange={(e) => mudar({ sigla: e.target.value.toUpperCase().replace(/[^A-Za-z]/g, '') })} />
            </CampoRotulo>
          </div>
          <p className="text-[12.5px] text-muted -mt-2.5">
            A sigla é o começo do código dos chamados, como <CodigoChamado codigo={`${siglaOk.success ? sigla : siglaSugerida.length >= 2 ? siglaSugerida : 'SUP'}-12`} cor={f.cor} link={false} />.
            {' '}<b className="text-ink-2">Ela não muda depois do primeiro chamado</b> (os códigos já dados continuam valendo).
          </p>

          <CampoRotulo rotulo="Descrição" id="painel-descricao" dica="Para que serve o painel (aparece no formulário de abrir chamado).">
            <textarea className="input min-h-[60px]" id="painel-descricao" value={f.descricao} maxLength={300} onChange={(e) => mudar({ descricao: e.target.value })} />
          </CampoRotulo>

          <CampoRotulo rotulo="Cor" id="painel-cor" grupo>
            <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Cor do painel" id="painel-cor">
              {CORES_PAINEL.map((c) => (
                <button key={c} type="button" role="radio" aria-checked={f.cor === c} onClick={() => mudar({ cor: c })}
                  className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[13px] ${f.cor === c ? 'border-accent bg-accent-soft text-accent-ink font-semibold' : 'border-line text-ink-2 hover:bg-surface-2'}`}>
                  <span className={`w-3.5 h-3.5 rounded-full ${COR_CHEIA[c]}`} aria-hidden /> {NOME_COR[c]}
                </button>
              ))}
            </div>
          </CampoRotulo>

          <CampoRotulo rotulo="Quem vê" id="painel-acesso" grupo dica="Quem cuida dos chamados vê todos os painéis, mesmo os de pessoas escolhidas. Para os outros, o chamado de um painel que não veem não existe.">
            <div className="flex flex-col gap-2" role="radiogroup" aria-label="Quem vê" id="painel-acesso">
              <Opcao ativo={f.acesso === 'todos'} onClick={() => mudar({ acesso: 'todos' })} titulo="Todos que veem chamados" texto="O Suporte, por exemplo." />
              <Opcao ativo={f.acesso === 'escolhidos'} onClick={() => mudar({ acesso: 'escolhidos' })} titulo="Só as pessoas escolhidas" texto="Um painel Interno ou Administrativo." />
              {f.acesso === 'escolhidos' && (
                <div className="pl-3 border-l-2 border-line ml-1.5">
                  <EscolherPessoas id="painel-pessoas" rotulo="Quem vê o painel" valor={f.pessoas} pessoas={pessoas} todasAsPessoas={todasAsPessoas}
                    vazio="Ninguém escolhido: só quem cuida dos chamados vai ver." onChange={(v) => mudar({ pessoas: v })} />
                </div>
              )}
            </div>
          </CampoRotulo>

          <label className="flex items-start gap-2.5 text-sm cursor-pointer">
            <Toggle checked={f.ativo} onChange={(v) => mudar({ ativo: v })} />
            <span>Painel ativo <span className="block text-[12.5px] text-muted">Desativado, o painel não recebe chamado novo; os que já existem continuam lá.</span></span>
          </label>
        </section>

        <section id="painel-etapas" className="scroll-mt-14 border-t border-line pt-4 flex flex-col gap-2" aria-label="As etapas">
          <h4 className="font-display font-semibold text-[14px]">As etapas</h4>
          {vendas ? (
            <p className="text-[12.5px] text-muted -mt-1">
              As colunas do quadro, da esquerda para a direita: o funil e, no fim, o <b>Ganho</b> e o <b>Perdido</b> — as duas finais não saem (mudam de nome).
              A negociação nova cai na primeira etapa de <b>Entrada</b>. O Perdido sempre pede o motivo da perda.
            </p>
          ) : (
            <p className="text-[12.5px] text-muted -mt-1">
              As colunas do quadro, da esquerda para a direita. Arraste pela alça (ou use as setas) para mudar a ordem; o lápis abre a etapa. O
              chamado novo cai na primeira etapa de <b>Entrada</b>; mover para um nível acima (N1 → N2) é escalonar e pede o motivo.
            </p>
          )}
          {!painel && !implantacao && paineis.some((p) => p.tipo === f.tipo) && (
            <label className="flex flex-wrap items-center gap-2 text-[13px] text-ink-2" htmlFor="painel-modelo">
              Começar com as etapas
              <select className="input w-auto max-w-full py-1.5" id="painel-modelo" value={modelo} onChange={(e) => usarModelo(e.target.value)}>
                <option value="">{vendas ? 'do funil (Lead, Qualificação, Proposta enviada, Negociação, Ganho e Perdido)' : 'básicas (Novo, Em andamento, Resolvido e Fechado)'}</option>
                {paineis.filter((p) => p.tipo === f.tipo).map((p) => <option key={p.id} value={p.id}>do painel {p.nome} ({p.etapas.length})</option>)}
              </select>
            </label>
          )}
          <ListaDeEtapas paineisDeGestao={paineisDeGestao} rascunho={rascunho} mexer={mexer} saindo={saindo} setSaindo={setSaindo} abertas={abertas} setAbertas={setAbertas}
            pessoas={pessoas} todasAsPessoas={todasAsPessoas} existe={!!painel} chamadosNa={chamadosNa} obrigatorios={validos.etapas} campos={campos} vendas={vendas} />
        </section>

        {/* os campos do sistema que o painel usa (2.1.2, o Luan: "quero poder editar tbm os campos ... tem muitos que a depender do
            painel que eu cria, n vou usar"): desligado, some da ficha, do Abrir chamado e do quadro e deixa de ser pedido */}
        <section id="painel-campos" className="scroll-mt-14 border-t border-line pt-4 flex flex-col gap-2" aria-label="Os campos">
          <h4 className="font-display font-semibold text-[14px]">Os campos</h4>
          <p className="text-[12.5px] text-muted -mt-1">
            O que {vendas ? 'a negociação' : 'o chamado'} deste painel usa. Desligado, o campo some da ficha, do {vendas ? 'Nova negociação' : 'Abrir chamado'} e do quadro e deixa de ser pedido nas etapas;
            o que já estava preenchido fica guardado e volta se ligar de novo. {vendas ? '' : 'A descrição, o responsável e as etiquetas estão sempre.'}
          </p>
          <ul className="flex flex-col divide-y divide-line rounded-lg border border-line" id="painel-campos-lista">
            {camposDoSistemaDoTipo(f.tipo).map((c) => {
              const ligado = !f.desligados.includes(c);
              return (
                <li key={c} className="px-3 py-2">
                  <label className="flex items-start gap-2.5 text-sm cursor-pointer" data-campo-do-painel={c}>
                    <Toggle checked={ligado} onChange={(v) => mudar({ desligados: v ? f.desligados.filter((x) => x !== c) : [...f.desligados, c] })} />
                    <span className="min-w-0">
                      <span className={`font-medium ${ligado ? 'text-ink' : 'text-muted'}`}>{NOME_CAMPO_DO_SISTEMA[c]}</span>
                      {!ligado && <span className="text-[12px] text-muted"> · desligado</span>}
                      <span className="block text-[12.5px] text-muted leading-snug">{DICA_CAMPO_DO_SISTEMA[c]}</span>
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
          <p className="text-[12.5px] text-muted" id="painel-onde-campos">
            A árvore do Assunto, as opções do Tipo e os campos que a equipe cria ficam em Painéis › Ajustes › <b className="text-ink-2">Campos</b>{painel ? '' : ', depois de criar o painel'}.
          </p>
        </section>

        <section id="painel-regras" className="scroll-mt-14 border-t border-line pt-4 flex flex-col gap-4" aria-label="As regras">
          <h4 className="font-display font-semibold text-[14px]">As regras</h4>

          {vendas && (
            <>
              <CampoRotulo rotulo="Motivos de perda" id="painel-motivos" grupo
                dica="A lista que aparece ao marcar uma negociação como perdida. O que tem o nome Outro pede para escrever.">
                <MotivosDePerda valor={f.motivosDePerda} onChange={(v) => mudar({ motivosDePerda: v })} />
              </CampoRotulo>
              <CampoRotulo rotulo="Meta do mês" id="painel-meta" erro={!f.metaValida ? 'Escreva a meta como 40.000,00 (ou deixe vazia)' : undefined}
                dica="O ganho do mês aparece contra ela na tela dos painéis, numa barra. Vazia: sem meta.">
                <div className="max-w-[240px]"><CampoValor id="painel-meta" centavos={f.meta} onChange={(v, ok) => mudar({ meta: v, metaValida: ok })} /></div>
              </CampoRotulo>
            </>
          )}

          {!vendas && <label className={`flex items-start gap-2.5 text-sm ${semPrioridade ? 'opacity-60' : 'cursor-pointer'}`}>
            <Toggle checked={f.contaPrazo && !semPrioridade} disabled={semPrioridade} onChange={(v) => mudar({ contaPrazo: v })} />
            {/* 13/10, o Luan: "essa parte do conta prazo, não entendi para que serve" — a dica diz o que muda */}
            <span>Conta prazo <span className="block text-[12.5px] text-muted">Ligado, cada chamado deste painel tem um prazo para a primeira resposta e outro para a solução, conforme a prioridade (os tempos ficam em Ajustes › Prazos). O cartão mostra quanto falta, e o Gestor avisa quando o prazo está perto de vencer e quando vence. Desligado, o painel não tem prazo, como o Desenvolvimento.{semPrioridade && <b className="block text-ink-2 font-medium">Sem a prioridade (em Os campos), o painel não conta prazo.</b>}</span></span>
          </label>}

          {!vendas && <div className="flex flex-col gap-1.5">
            <label className="flex items-start gap-2.5 text-sm cursor-pointer">
              <Toggle checked={f.fecharSozinho} onChange={(v) => mudar({ fecharSozinho: v })} />
              <span>O Resolvido fecha sozinho <span className="block text-[12.5px] text-muted">Quando o cliente não responde depois da solução.</span></span>
            </label>
            {f.fecharSozinho ? (
              <div className="flex flex-wrap items-center gap-2 text-sm pl-12">
                depois de
                <input className="input w-20 tnum" id="painel-dias" type="number" min={1} max={60} value={f.fecharSozinhoDias} onChange={(e) => mudar({ fecharSozinhoDias: e.target.value })}
                  aria-label="Dias úteis até fechar sozinho" />
                {dias === 1 ? 'dia útil' : 'dias úteis'} sem resposta
                {!diasOk && <span className="text-bad text-[12.5px] basis-full">De 1 a 60 dias úteis.</span>}
              </div>
            ) : <p className="text-[12.5px] text-muted pl-12">Nunca: o Resolvido espera alguém fechar.</p>}
          </div>}

          <CampoRotulo rotulo={vendas ? 'O que é obrigatório para criar a negociação' : 'O que é obrigatório para abrir'} id="painel-obrigatorios" grupo
            dica={vendas ? 'O formulário da nova negociação mostra um * nestes campos e não cria sem eles. O resto fica nas regras de cada etapa (a Proposta enviada pede o valor, por exemplo).'
              : 'O formulário de abrir mostra um * nestes campos, e quem abre pela tela não abre sem eles (o robô e o agendado abrem mesmo assim: o que faltar é pedido para andar). O que só existe depois de aberto (solução, causa, checklist, tempo) fica nas regras de cada etapa.'}>
            <Caixinhas id="painel-obrigatorios" campos={validos.abrir} valor={f.obrigatoriosAoAbrir} nome={(k) => nomeDoObrigatorio(k, campos)} onChange={(v) => mudar({ obrigatoriosAoAbrir: v })} />
          </CampoRotulo>

          {!vendas && <label className="flex items-start gap-2.5 text-sm cursor-pointer">
            <Toggle checked={f.paiEsperaFilhos} onChange={(v) => mudar({ paiEsperaFilhos: v })} />
            <span>O pai só resolve e fecha com os filhos fechados <span className="block text-[12.5px] text-muted">E diz quais faltam, mesmo os filhos em outro painel.</span></span>
          </label>}

          <CampoRotulo rotulo="Supervisores" id="painel-supervisores" grupo dica={vendas ? 'Recebem o aviso do que fica sem dono.' : 'Recebem o aviso do que vence, do que fica sem dono e do que chega Crítico.'}>
            <EscolherPessoas id="painel-supervisores" rotulo="Supervisores" valor={f.supervisores} pessoas={pessoas} todasAsPessoas={todasAsPessoas}
              vazio="Ninguém." onChange={(v) => mudar({ supervisores: v })} />
          </CampoRotulo>
        </section>
        {/* o Enter num campo de texto salva (o botão de verdade fica no rodapé) */}
        <button type="submit" className="hidden" aria-hidden tabIndex={-1} />
      </form>

      {semDestino && (
        <JanelaDestino mensagem={semDestino.mensagem} saem={semDestino.etapas} ficam={rascunho.filter((e) => !!e.id)} saindo={saindo}
          salvando={salvando} onFechar={() => setSemDestino(null)} onConfirmar={(destino) => void salvar(destino)} />
      )}
      <Confirmar open={fechar} onClose={() => setFechar(false)} onConfirm={() => { setFechar(false); onFechar(); }} titulo="Fechar sem salvar?"
        texto={painel ? `O que você mudou no painel ${painel.nome} (inclusive nas etapas) não é gravado.` : 'O painel novo não é criado.'} botao="Fechar sem salvar" perigoso />
    </Modal>
  );
}

/** As etapas que o painel novo tem agora no modelo escolhido (para saber se a pessoa já mexeu nelas). */
function etapasDoModeloAtual(modelo: string, paineis: Painel[], inicio: EtapaRascunho[]): EtapaRascunho[] {
  const origem = paineis.find((p) => p.id === modelo);
  return origem ? origem.etapas.map((e) => ({ ...daEtapa(e), id: undefined })) : inicio;
}

// =====================================================================
//  AS ETAPAS (dentro da janela do painel)
// =====================================================================

function ListaDeEtapas({ rascunho, mexer, saindo, setSaindo, abertas, setAbertas, pessoas, todasAsPessoas, existe, chamadosNa, obrigatorios, campos, vendas = false, paineisDeGestao }: {
  /** os painéis de Gestão (a etapa de Vendas que abre a implantação escolhe um) */
  paineisDeGestao: Painel[];
  rascunho: EtapaRascunho[]; mexer: (fn: (xs: EtapaRascunho[]) => EtapaRascunho[]) => void;
  saindo: Saindo[]; setSaindo: (fn: (xs: Saindo[]) => Saindo[]) => void;
  abertas: Set<string>; setAbertas: (fn: (s: Set<string>) => Set<string>) => void;
  pessoas: PessoaCurta[]; todasAsPessoas: PessoaCurta[];
  /** o painel já existe (editar): mostra o que é novo e quantos chamados cada etapa tem */
  existe: boolean;
  chamadosNa: (id: string | undefined) => number | null;
  /** o que pode ser obrigatório para entrar (os campos do sistema que o painel usa e os campos dele) */
  obrigatorios: Obrigatorio[];
  campos: CampoPersonalizado[];
  /** o painel de Vendas: as finais (Ganho e Perdido) não saem e não mudam de tipo; não há nível */
  vendas?: boolean;
}) {
  const mudarEtapa = (chave: string, o: Partial<EtapaRascunho>) => mexer((xs) => xs.map((e) => (e.chave === chave ? { ...e, ...o } : e)));
  const moverPara = (chave: string, delta: number) => mexer((xs) => {
    const i = xs.findIndex((e) => e.chave === chave);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= xs.length) return xs;
    const n = [...xs];
    [n[i], n[j]] = [n[j]!, n[i]!];
    return n;
  });
  const alternar = (chave: string) => setAbertas((s) => { const n = new Set(s); if (n.has(chave)) n.delete(chave); else n.add(chave); return n; });

  const incluir = () => {
    const nova = etapaNova({ nome: '', tipo: 'andamento', nivel: null, obrigatorios: [] });
    // a etapa nova costuma ser de andamento: entra antes do Resolvido (dá para mudar de lugar depois)
    mexer((xs) => {
      const i = xs.findIndex((e) => e.tipo === 'resolvido' || e.tipo === 'fechado');
      return i < 0 ? [...xs, nova] : [...xs.slice(0, i), nova, ...xs.slice(i)];
    });
    setAbertas((s) => new Set(s).add(nova.chave));
    window.setTimeout(() => document.getElementById(`etapa-nome-${nova.chave}`)?.focus(), 30);
  };
  const tirar = (e: EtapaRascunho) => {
    const posicao = rascunho.findIndex((x) => x.chave === e.chave);
    mexer((xs) => xs.filter((x) => x.chave !== e.chave));
    // a que já existia fica na lista "saem ao salvar" (dá para trazer de volta); a nova só some
    if (e.id) setSaindo((s) => [...s, { etapa: e, posicao }]);
  };
  const trazerDeVolta = (s: Saindo) => {
    setSaindo((xs) => xs.filter((x) => x.etapa.chave !== s.etapa.chave));
    mexer((xs) => [...xs.slice(0, s.posicao), s.etapa, ...xs.slice(s.posicao)]);
  };

  const arrasto = useArrastar(rascunho.map((e) => e.chave), (nova) => mexer((xs) => nova.map((k) => xs.find((e) => e.chave === k)!).filter(Boolean)));
  const nomeDaChave = (k: string) => rascunho.find((e) => e.chave === k)?.nome || 'etapa nova';

  return (
    <div id="etapas" className="min-w-0">
      <ol className="flex flex-col gap-2" id="etapas-lista">
        {rascunho.map((e, i) => {
          const aberta = abertas.has(e.chave);
          const n = chamadosNa(e.id);
          return (
            <li key={e.chave} data-arrastavel={e.chave}
              className={`rounded-lg border bg-surface min-w-0 transition-opacity ${arrasto.arrastando === e.chave ? 'opacity-40 border-accent ring-2 ring-accent' : 'border-line'}`}>
              <div className="p-2 sm:p-2.5">
                <div className="flex items-start gap-1.5">
                  <button type="button" onPointerDown={(ev) => arrasto.iniciar(e.chave, ev)}
                    onKeyDown={(ev) => {
                      if (ev.key === 'ArrowUp') { ev.preventDefault(); moverPara(e.chave, -1); }
                      if (ev.key === 'ArrowDown') { ev.preventDefault(); moverPara(e.chave, 1); }
                    }}
                    className="touch-none cursor-grab active:cursor-grabbing rounded-md p-1 text-muted hover:bg-surface-2 hover:text-ink shrink-0"
                    aria-label={`Mudar ${e.nome || 'a etapa nova'} de lugar: arraste, ou use as setas do teclado`} title="Arraste para mudar de lugar (ou use as setas do teclado)">
                    <GripVertical size={16} />
                  </button>
                  <span className="tnum text-[12px] text-muted w-4 text-right mt-1 shrink-0 select-none">{i + 1}</span>
                  <button type="button" className="min-w-0 flex-1 text-left mt-0.5" onClick={() => alternar(e.chave)} aria-expanded={aberta}>
                    <span className="flex flex-wrap items-center gap-1.5">
                      <span className="font-semibold text-ink break-words">{e.nome.trim() || <span className="text-muted italic font-normal">sem nome</span>}</span>
                      {/* o nível em chip, menos quando o nome já é o nível (a etapa "N2", a "DEV") */}
                      {e.nivel && paraBusca(e.nome) !== paraBusca(rotuloDoNivel(e.nivel)) && <Chip tone="accent">{rotuloDoNivel(e.nivel)}</Chip>}
                      {/* a final da venda: o chip diz qual é (Ganho ou Perdido); quando o nome já diz, só "final" */}
                      {e.resultado && (
                        <Chip tone={e.resultado === 'ganho' ? 'ok' : 'bad'} title={`A etapa final do ${NOME_RESULTADO_DA_VENDA[e.resultado]}`}>
                          {e.resultado === 'ganho' ? <Trophy size={11} aria-hidden /> : <ThumbsDown size={11} aria-hidden />}
                          {' '}{paraBusca(e.nome) === paraBusca(NOME_RESULTADO_DA_VENDA[e.resultado]) ? 'final' : NOME_RESULTADO_DA_VENDA[e.resultado]}
                        </Chip>
                      )}
                      {e.abreImplantacao && <Chip tone="accent" title="A negociação que chega aqui abre o card da implantação"><Rocket size={11} aria-hidden /> abre a implantação</Chip>}
                      {e.ligaNoCadastro && <Chip tone="ok" title="O card que chega aqui liga os produtos e os módulos no cadastro do cliente">liga no cadastro</Chip>}
                      {e.recebeImplantacao && <Chip tone="ok" title="A negociação vem para cá sozinha quando o card da implantação chega no fim">fim da implantação</Chip>}
                      {existe && !e.id && <Chip tone="ok">nova</Chip>}
                    </span>
                  </button>
                  <span className="flex items-center shrink-0">
                    <BotaoIcone rotulo={`Subir ${e.nome || 'a etapa'}`} desativado={i === 0} onClick={() => moverPara(e.chave, -1)}><ArrowUp size={15} /></BotaoIcone>
                    <BotaoIcone rotulo={`Descer ${e.nome || 'a etapa'}`} desativado={i === rascunho.length - 1} onClick={() => moverPara(e.chave, 1)}><ArrowDown size={15} /></BotaoIcone>
                    <BotaoIcone rotulo={aberta ? `Fechar ${e.nome || 'a etapa'}` : `Editar ${e.nome || 'a etapa'}`} onClick={() => alternar(e.chave)}>{aberta ? <ChevronUp size={15} /> : <Pencil size={15} />}</BotaoIcone>
                    {/* as finais da venda (o Ganho e o Perdido) não saem: mudam de nome */}
                    {e.resultado ? <span className="w-[27px]" aria-hidden /> : <BotaoIcone rotulo={`Tirar ${e.nome || 'a etapa'}`} onClick={() => tirar(e)} perigo><Trash2 size={15} /></BotaoIcone>}
                  </span>
                </div>
                {/* o resumo na largura toda (no celular, ao lado dos botões, ficava espremido) */}
                <p className="text-[12.5px] text-muted leading-snug pl-[52px] pr-1 break-words cursor-pointer" onClick={() => alternar(e.chave)}>
                  {resumoDaEtapa(e, todasAsPessoas, campos, paineisDeGestao)}
                  {n !== null && n > 0 && e.id && <> · <span className="font-semibold text-ink-2 tnum">{n} {vendas ? (n === 1 ? 'negociação' : 'negociações') : n === 1 ? 'chamado' : 'chamados'}</span></>}
                </p>
              </div>
              {aberta && <EditarEtapa e={e} pessoas={pessoas} todasAsPessoas={todasAsPessoas} obrigatorios={obrigatorios} campos={campos} vendas={vendas} paineisDeGestao={paineisDeGestao}
                onMudar={(o) => mudarEtapa(e.chave, o)} />}
            </li>
          );
        })}
      </ol>

      {saindo.length > 0 && (
        <div className="mt-2 rounded-lg border border-dashed border-line-strong p-2.5 text-[13px] flex flex-wrap items-center gap-2" id="etapas-saindo">
          <span className="text-muted">Saem ao salvar:</span>
          {saindo.map((s) => {
            const n = chamadosNa(s.etapa.id);
            return (
              <span key={s.etapa.chave} className="chip bg-bad-soft text-bad">
                <span className="line-through">{s.etapa.nome}</span>{n ? <span className="font-normal no-underline">({n} {n === 1 ? 'chamado' : 'chamados'})</span> : null}
                <button type="button" className="hover:opacity-70 inline-flex items-center gap-0.5 font-semibold" onClick={() => trazerDeVolta(s)} aria-label={`Trazer ${s.etapa.nome} de volta`}>
                  <Undo2 size={12} /> trazer de volta
                </button>
              </span>
            );
          })}
        </div>
      )}

      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        <button type="button" className="btn-secondary btn-sm" id="etapas-incluir" onClick={incluir} disabled={rascunho.length >= MAX_ETAPAS_DO_PAINEL}><Plus size={14} /> Incluir etapa</button>
        {rascunho.length >= MAX_ETAPAS_DO_PAINEL && <span className="text-[12.5px] text-muted">Um painel vai até {MAX_ETAPAS_DO_PAINEL} etapas.</span>}
      </div>

      {/* o nome da etapa acompanha o ponteiro enquanto se arrasta */}
      {arrasto.arrastando && createPortal(
        <div ref={arrasto.fantasma} className="fixed left-0 top-0 z-[60] pointer-events-none card shadow-lg px-3 py-2 text-sm font-semibold flex items-center gap-2"
          style={{ transform: `translate(${arrasto.posicao.current.x + 14}px, ${arrasto.posicao.current.y + 10}px)` }}>
          <GripVertical size={15} className="text-muted" /> {nomeDaChave(arrasto.arrastando)}
        </div>,
        document.body,
      )}
    </div>
  );
}

function BotaoIcone({ rotulo, onClick, desativado, perigo, children }: { rotulo: string; onClick: () => void; desativado?: boolean; perigo?: boolean; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} disabled={desativado} aria-label={rotulo} title={rotulo}
      className={`p-1.5 rounded-md text-ink-2 hover:bg-surface-2 disabled:opacity-30 disabled:hover:bg-transparent ${perigo ? 'hover:text-bad' : 'hover:text-ink'}`}>
      {children}
    </button>
  );
}

/** Os detalhes de uma etapa: o nome, o tipo (com a dica), o nível, o que pede para entrar e quem avisa. */
function EditarEtapa({ e, pessoas, todasAsPessoas, obrigatorios, campos, onMudar, vendas = false, paineisDeGestao }: {
  e: EtapaRascunho; pessoas: PessoaCurta[]; todasAsPessoas: PessoaCurta[]; obrigatorios: Obrigatorio[]; campos: CampoPersonalizado[]; onMudar: (o: Partial<EtapaRascunho>) => void;
  vendas?: boolean; paineisDeGestao: Painel[];
}) {
  const base = `etapa-${e.chave}`;
  const fecha = e.tipo === 'resolvido' || e.tipo === 'fechado';
  // na venda: o funil é de entrada e de andamento; as finais (Ganho e Perdido) são do tipo Fechado e não mudam
  const tipos = vendas ? (e.resultado ? (['fechado'] as TipoEtapa[]) : (['entrada', 'andamento'] as TipoEtapa[])) : TIPOS_ETAPA;
  return (
    <div className="border-t border-line p-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
      <CampoRotulo rotulo="Nome" id={`etapa-nome-${e.chave}`}>
        <input className="input" id={`etapa-nome-${e.chave}`} value={e.nome} maxLength={40} placeholder={vendas ? 'Ex.: Demonstração' : 'Ex.: Aguardando peça'} autoComplete="off" onChange={(ev) => onMudar({ nome: ev.target.value })} />
      </CampoRotulo>
      <CampoRotulo rotulo="Tipo" id={`${base}-tipo`} dica={e.resultado ? `A etapa final do ${NOME_RESULTADO_DA_VENDA[e.resultado]}: fecha a negociação.` : vendas ? (e.tipo === 'entrada' ? 'Onde a negociação nova cai.' : 'Uma etapa do funil.') : DICA_TIPO_ETAPA[e.tipo]}>
        <select className="input" id={`${base}-tipo`} value={e.tipo} disabled={!!e.resultado} onChange={(ev) => onMudar({ tipo: ev.target.value as TipoEtapa })}>
          {tipos.map((t) => <option key={t} value={t}>{e.resultado ? `${NOME_TIPO_ETAPA[t]} (${NOME_RESULTADO_DA_VENDA[e.resultado]})` : NOME_TIPO_ETAPA[t]}</option>)}
        </select>
      </CampoRotulo>
      {!vendas && <CampoRotulo rotulo="Nível" id={`${base}-nivel`} grupo dica="Mover para um nível acima é escalonar; para um abaixo, voltar de nível (os dois pedem o motivo).">
        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Nível" id={`${base}-nivel`}>
          {([null, ...NIVEIS] as const).map((n) => (
            <button key={n ?? 0} type="button" role="radio" aria-checked={e.nivel === n} onClick={() => onMudar({ nivel: n })}
              className={`rounded-lg border px-3 py-1.5 text-[13px] min-w-[44px] ${e.nivel === n ? 'border-accent bg-accent-soft text-accent-ink font-semibold' : 'border-line text-ink-2 hover:bg-surface-2'}`}>
              {n ? rotuloDoNivel(n) : '—'}
            </button>
          ))}
        </div>
      </CampoRotulo>}
      <CampoRotulo rotulo={vendas ? 'Quem recebe o aviso quando uma negociação chega aqui' : 'Quem recebe o aviso quando um chamado chega aqui'} id={`${base}-avisar`} grupo dica="Na tela e no WhatsApp (se ligado em Avisos e WhatsApp). Quem moveu não é avisado.">
        <EscolherPessoas id={`${base}-avisar`} rotulo="Quem recebe o aviso" valor={e.avisar} pessoas={pessoas} todasAsPessoas={todasAsPessoas} vazio="Ninguém." onChange={(v) => onMudar({ avisar: v })} />
      </CampoRotulo>
      <CampoRotulo rotulo="O que precisa estar preenchido para entrar" id={`${base}-obrigatorios`} grupo className="sm:col-span-2"
        dica={e.resultado === 'perdido' ? 'O Perdido sempre pede o motivo da perda (na janela de marcar como perdido).' : vendas ? 'Sem o que está marcado, a negociação não entra: a tela diz o que falta.'
          : fecha ? 'O problema (ITIL) sempre pede a causa, a solução e a validação para resolver e fechar, em qualquer painel.' : 'Sem o que está marcado, o chamado não entra: a tela diz o que falta.'}>
        <Caixinhas id={`${base}-obrigatorios`} campos={obrigatorios} valor={e.obrigatorios} nome={(k) => nomeDoObrigatorio(k, campos)} onChange={(v) => onMudar({ obrigatorios: v })} />
      </CampoRotulo>
      {/* a implantação (2.3): o Luan só marca o Ganho quando começa a faturar — é a etapa de antes que abre o card */}
      {vendas && !e.resultado && (
        <CampoRotulo rotulo="Ao chegar aqui, abre a implantação" id={`${base}-implantacao`} className="sm:col-span-2"
          dica={e.abreImplantacao
            ? 'A empresa vira cliente (se ainda não é: a janela pede o CNPJ), os produtos entram no cadastro sem a data de ativação e o card nasce na entrada do painel escolhido. O Ganho continua à parte.'
            : 'Escolha o painel da implantação para a negociação que chega aqui abrir o card sozinha (com o cliente e os produtos).'}>
          <select className="input" id={`${base}-implantacao`} value={e.abreImplantacao ?? ''} onChange={(ev) => onMudar({ abreImplantacao: ev.target.value || null })}>
            <option value="">Não abre</option>
            {paineisDeGestao.map((p) => <option key={p.id} value={p.id}>No painel {p.nome} ({p.sigla})</option>)}
            {e.abreImplantacao && !paineisDeGestao.some((p) => p.id === e.abreImplantacao) && <option value={e.abreImplantacao}>(um painel que saiu)</option>}
          </select>
        </CampoRotulo>
      )}
      {/* o fim da implantação (2.3): o Luan, "uma fase antes do ganho, implantado, que vai mover de em processo de implantação" */}
      {vendas && !e.resultado && (
        <label className="flex items-start gap-2.5 text-sm cursor-pointer sm:col-span-2" id={`${base}-fim-implantacao`}>
          <Toggle checked={e.recebeImplantacao} onChange={(v) => onMudar({ recebeImplantacao: v })} />
          <span>A negociação vem para cá quando a implantação termina
            <span className="block text-[12.5px] text-muted">Quando o card da implantação chega no fim (a etapa que liga no cadastro, o Implantado), a negociação vem sozinha para esta etapa. A que já está no Ganho ou no Perdido fica onde está. Uma etapa por painel.</span>
          </span>
        </label>
      )}
      {!vendas && (
        <label className="flex items-start gap-2.5 text-sm cursor-pointer sm:col-span-2" id={`${base}-cadastro`}>
          <Toggle checked={e.ligaNoCadastro} onChange={(v) => onMudar({ ligaNoCadastro: v })} />
          <span>Ao chegar aqui, liga no cadastro do cliente
            <span className="block text-[12.5px] text-muted">Os produtos do chamado ganham a data de ativação (o dia) e os módulos marcados (o campo Módulos do produto) ficam ligados na ficha do cliente. A janela mostra antes o que muda. É o Implantado da implantação.</span>
          </span>
        </label>
      )}
    </div>
  );
}

/**
 * O servidor recusou: uma etapa que sai tem chamados. Para cada uma, para qual das etapas que ficam
 * os chamados vão (a sugestão é uma do mesmo tipo). Só as que já existem servem de destino: a etapa
 * nova ganha o seu lugar quando a lista é salva.
 */
function JanelaDestino({ mensagem, saem, ficam, saindo, salvando, onFechar, onConfirmar }: {
  mensagem: string; saem: EtapaComChamados[]; ficam: EtapaRascunho[]; saindo: Saindo[]; salvando: boolean;
  onFechar: () => void; onConfirmar: (destino: Record<string, string>) => void;
}) {
  const [destino, setDestino] = useState<Record<string, string>>(() => Object.fromEntries(saem.map((s) => {
    const tipo = saindo.find((x) => x.etapa.id === s.id)?.etapa.tipo;
    return [s.id, (ficam.find((e) => e.tipo === tipo) ?? ficam[0])?.id ?? ''];
  })));
  const completo = saem.every((s) => !!destino[s.id]);
  return (
    <Modal open onClose={onFechar} titulo="Para onde vão os chamados?" largura="max-w-lg"
      rodape={<>
        <button type="button" className="btn-secondary" onClick={onFechar}>Voltar</button>
        <button type="button" className="btn-primary" id="destino-confirmar" disabled={!completo || salvando} onClick={() => onConfirmar(destino)}>
          {salvando ? <Spinner className="text-white" /> : 'Mover e salvar o painel'}
        </button>
      </>}>
      <p className="text-sm text-ink-2">{mensagem}</p>
      {!ficam.length ? (
        <p className="text-sm text-bad mt-3">Nenhuma das etapas que já existiam fica no painel. Traga uma de volta (ou salve as novas primeiro) para receber os chamados.</p>
      ) : (
        <div className="mt-3 flex flex-col gap-3">
          {saem.map((s) => (
            <div key={s.id} className="rounded-lg border border-line p-3">
              <label className="label" htmlFor={`destino-${s.id}`}>
                {s.chamados === 1 ? 'O chamado' : `Os ${s.chamados} chamados`} de <span className="line-through">{s.nome}</span> {s.chamados === 1 ? 'vai' : 'vão'} para
              </label>
              <select className="input" id={`destino-${s.id}`} value={destino[s.id] ?? ''} onChange={(e) => setDestino((d) => ({ ...d, [s.id]: e.target.value }))}>
                <option value="">— escolha —</option>
                {ficam.map((e) => <option key={e.id} value={e.id}>{e.nome} ({TIPO_CURTO[e.tipo]}{e.nivel ? ` · ${rotuloDoNivel(e.nivel)}` : ''})</option>)}
              </select>
            </div>
          ))}
          <p className="text-[12.5px] text-muted">
            O histórico de cada chamado diz que ele mudou de etapa porque a etapa saiu do painel, e ninguém é avisado (é arrumação, não
            trabalho no chamado). Só as etapas que já existiam servem de destino: a nova ganha o seu lugar quando o painel é salvo.
          </p>
        </div>
      )}
    </Modal>
  );
}

// =====================================================================
//  AS PEÇAS DOS FORMULÁRIOS
// =====================================================================

function CampoRotulo({ rotulo, id, erro, dica, grupo = false, className = '', children }: {
  rotulo: string; id: string; erro?: string; dica?: string;
  /** um grupo de botões ou caixinhas: o título não é um <label> de campo */
  grupo?: boolean; className?: string; children: ReactNode;
}) {
  return (
    <div className={`min-w-0 ${className}`}>
      {grupo ? <div className="label" id={`${id}-rotulo`}>{rotulo}</div> : <label className="label" htmlFor={id}>{rotulo}</label>}
      {children}
      {erro ? <div className="text-bad text-[12.5px] mt-1">{erro}</div> : dica ? <div className="text-muted text-[12.5px] mt-1">{dica}</div> : null}
    </div>
  );
}

function Opcao({ ativo, onClick, titulo, texto }: { ativo: boolean; onClick: () => void; titulo: string; texto: string }) {
  return (
    <button type="button" role="radio" aria-checked={ativo} onClick={onClick}
      className={`text-left rounded-lg border px-3 py-2 flex items-start gap-2.5 ${ativo ? 'border-accent bg-accent-soft' : 'border-line hover:bg-surface-2'}`}>
      <span className={`mt-1 w-3.5 h-3.5 rounded-full border-2 shrink-0 ${ativo ? 'border-accent bg-accent' : 'border-line-strong'}`} aria-hidden />
      <span><span className={`block text-[13.5px] font-semibold ${ativo ? 'text-accent-ink' : 'text-ink'}`}>{titulo}</span><span className="block text-[12px] text-muted">{texto}</span></span>
    </button>
  );
}

/**
 * As caixinhas do que é obrigatório, na ordem da ficha: os campos do sistema que o painel usa e, depois,
 * os campos dele (com a marca "do painel").
 */
function Caixinhas({ id, campos, valor, nome, onChange }: { id: string; campos: Obrigatorio[]; valor: Obrigatorio[]; nome: (k: Obrigatorio) => string; onChange: (v: Obrigatorio[]) => void }) {
  return (
    <div className="grid grid-cols-1 gap-x-4 gap-y-1 min-[480px]:grid-cols-2 md:grid-cols-3" id={id}>
      {campos.map((c) => (
        <label key={c} className="flex items-center gap-2 text-[13px] cursor-pointer py-0.5 min-w-0">
          <input type="checkbox" className="accent-[var(--accent)]" checked={valor.includes(c)}
            onChange={(e) => onChange(e.target.checked ? campos.filter((x) => x === c || valor.includes(x)) : valor.filter((x) => x !== c))} />
          <span className="min-w-0 break-words">{nome(c)}{idDaChave(c) && <span className="text-[11.5px] text-muted"> · do painel</span>}</span>
        </label>
      ))}
    </div>
  );
}

/** Várias pessoas: as escolhidas em etiquetas (com o ×), e o "Incluir" procura entre as que faltam. */
function EscolherPessoas({ id, rotulo, valor, pessoas, todasAsPessoas, vazio, onChange }: {
  id: string; rotulo: string; valor: string[]; pessoas: PessoaCurta[]; todasAsPessoas: PessoaCurta[]; vazio: string; onChange: (v: string[]) => void;
}) {
  const resto: OpcaoBusca[] = pessoas.filter((p) => !valor.includes(p.id)).map((p) => ({ id: p.id, nome: p.nome }));
  return (
    <div className="flex flex-wrap items-center gap-1.5 min-h-[34px]" id={id}>
      {valor.map((v) => (
        <span key={v} className="chip bg-accent-soft text-accent-ink">
          {nomeDaPessoa(todasAsPessoas, v)}
          <button type="button" className="hover:opacity-70" onClick={() => onChange(valor.filter((x) => x !== v))} aria-label={`Tirar ${nomeDaPessoa(todasAsPessoas, v)}`}><X size={12} /></button>
        </span>
      ))}
      {!valor.length && <span className="text-[12.5px] text-muted">{vazio}</span>}
      {resto.length > 0 && (
        <EscolherComBusca valor="" opcoes={resto} onChange={(v) => v && onChange([...valor, v])} procurar="Procurar pessoa…" rotulo={`${rotulo}: incluir pessoa`}
          gatilho={(abrir) => <button type="button" className="btn-ghost btn-sm" onClick={abrir}><UserPlus size={14} /> Incluir <ChevronDown size={13} /></button>} />
      )}
    </div>
  );
}

/** O tipo do painel novo: um cartão com o ícone, o nome e o que ele tem. */
function OpcaoDoTipo({ ativo, onClick, icone, titulo, texto }: { ativo: boolean; onClick: () => void; icone: ReactNode; titulo: string; texto: string }) {
  return (
    <button type="button" role="radio" aria-checked={ativo} onClick={onClick}
      className={`text-left rounded-lg border px-3 py-2.5 flex items-start gap-2.5 ${ativo ? 'border-accent bg-accent-soft' : 'border-line hover:bg-surface-2'}`}>
      <span className={`mt-0.5 shrink-0 ${ativo ? 'text-accent-ink' : 'text-muted'}`}>{icone}</span>
      <span><span className={`block text-[13.5px] font-semibold ${ativo ? 'text-accent-ink' : 'text-ink'}`}>{titulo}</span><span className="block text-[12px] text-muted leading-snug">{texto}</span></span>
    </button>
  );
}

/** Os motivos de perda do painel de Vendas: as etiquetas (com o ×) e o campo para incluir outro. */
function MotivosDePerda({ valor, onChange }: { valor: string[]; onChange: (v: string[]) => void }) {
  const [novo, setNovo] = useState('');
  const incluir = () => {
    const t = novo.trim().replace(/\s+/g, ' ').slice(0, 60);
    if (!t) return;
    onChange(etiquetasUnicas([...valor, t]).slice(0, 30));
    setNovo('');
  };
  return (
    <div className="flex flex-col gap-2" id="painel-motivos">
      <div className="flex flex-wrap gap-1.5">
        {valor.map((m) => (
          <span key={m} className="chip bg-surface-2 text-ink-2">
            {m}
            <button type="button" className="hover:opacity-70" onClick={() => onChange(valor.filter((x) => x !== m))} aria-label={`Tirar o motivo ${m}`}><X size={12} /></button>
          </span>
        ))}
        {!valor.length && <span className="text-[12.5px] text-bad">Nenhum motivo: inclua pelo menos um.</span>}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <input className="input max-w-[260px] py-1.5" value={novo} maxLength={60} placeholder="Ex.: Prazo de implantação" aria-label="Um motivo de perda novo"
          onChange={(e) => setNovo(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); incluir(); } }} />
        <button type="button" className="btn-secondary btn-sm" onClick={incluir} disabled={!novo.trim() || valor.length >= 30}><Plus size={14} /> Incluir motivo</button>
      </div>
    </div>
  );
}
