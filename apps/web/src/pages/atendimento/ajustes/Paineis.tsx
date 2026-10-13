/**
 * Chamados › Ajustes (Patch 1.10, decisão 0047) — OS PAINÉIS.
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
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, ChevronDown, ChevronUp, GripVertical, Pencil, Plus, Trash2, Undo2, UserPlus, X } from 'lucide-react';
import {
  AJUSTES_PAINEL_PADRAO, CAMPOS_DO_SISTEMA, CORES_PAINEL, DICA_TIPO_ETAPA, ETAPAS_DO_PAINEL_NOVO, ListaDeEtapasSchema, MAX_ETAPAS_DO_PAINEL,
  NIVEIS, NOME_CAMPO_DO_SISTEMA, NOME_TIPO_ETAPA, SiglaSchema, TIPOS_ETAPA, idDaChave, limparObrigatorios, nomeDoObrigatorio, obrigatoriosDoPainel, paraBusca,
  rotuloDoNivel,
  type AjustesDoPainel, type CampoObrigatorio, type CampoPersonalizado, type CorPainel, type EtapaGravarEntrada, type EtapaPainel, type Nivel, type Obrigatorio,
  type Painel, type PainelGravarEntrada, type PessoaCurta, type TipoEtapa,
} from '@gestor/shared';
import { api } from '../../../api/index.js';
import { ApiError } from '../../../api/types.js';
import { Carregando, Chip, Confirmar, EscolherComBusca, Modal, Spinner, Toggle, mensagemErro, type OpcaoBusca } from '../../../components/ui/index.js';
import { useArrastar } from '../../../lib/arrastar.js';
import { CodigoChamado, TOM_DO_PAINEL, useDepoisDeMudar, useOpcoes } from '../comum.js';

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
  'cliente', 'contato', 'relato', 'descricao', 'assunto', 'tipo', 'gravidade', 'alcance', 'prioridade', 'produto', 'operadora', 'responsavel',
];
/** O que pode ser obrigatório neste painel: para entrar nas etapas (tudo o que ele usa) e para abrir (o que o formulário de abrir tem). */
function obrigatoriosQueValem(ajustes: Pick<AjustesDoPainel, 'camposDesligados'>, campos: CampoPersonalizado[]) {
  const etapas = obrigatoriosDoPainel(ajustes, campos);
  return { etapas, abrir: etapas.filter((k) => idDaChave(k) || CAMPOS_PARA_ABRIR.includes(k as CampoObrigatorio)) };
}

const listaDeNomes = (xs: string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} e ${xs[xs.length - 1]}`);
const nomeDaPessoa = (pessoas: PessoaCurta[], id: string) => pessoas.find((p) => p.id === id)?.nome ?? '(pessoa desativada)';

export function AjustesPaineis() {
  const opcoes = useOpcoes();
  const [sp, setSp] = useSearchParams();
  /** a janela do painel: um painel (editar), 'novo', ou fechada */
  const [janela, setJanela] = useState<Painel | 'novo' | null>(null);
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
        {paineis.map((p) => (
          <CartaoPainel key={p.id} p={p} pessoas={opcoes.data.pessoas} campos={opcoes.data.campos.filter((c) => c.painelId === p.id)} onEditar={() => { setJanela(p); lembrar(p.id); }} />
        ))}
      </div>

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
  const usados = [...CAMPOS_DO_SISTEMA.filter((c) => !a.camposDesligados.includes(c)).map((c) => NOME_CAMPO_DO_SISTEMA[c]), ...campos.filter((c) => c.ativo).map((c) => c.nome)];
  const paraAbrir = limparObrigatorios(a.obrigatoriosAoAbrir, obrigatoriosDoPainel(a, campos)).map((k) => nomeDoObrigatorio(k, campos));
  const quemVe = p.acesso === 'todos'
    ? 'Todos que veem chamados'
    : p.pessoas.length ? `Só ${listaDeNomes(p.pessoas.map((id) => nomeDaPessoa(pessoas, id)))}` : 'Só quem cuida dos chamados (ninguém escolhido)';
  const regras = [
    usados.length ? `Campos: ${usados.join(', ')}` : 'Sem campos além dos do chamado',
    a.contaPrazo ? 'Conta prazo' : 'Não conta prazo',
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
            {!p.ativo && <Chip tone="muted">desativado</Chip>}
          </div>
          {p.descricao && <p className="text-[12.5px] text-muted leading-snug mt-0.5">{p.descricao}</p>}
        </div>
      </div>
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-[12.5px]">
        <dt className="text-muted">Abertos</dt>
        <dd>
          <Link to={`/atendimento/lista?painel=${encodeURIComponent(p.id)}`} className="font-semibold tnum text-ink hover:text-accent" title={`Ver os chamados abertos do ${p.nome} na lista`}>
            {p.abertos} {p.abertos === 1 ? 'chamado' : 'chamados'}
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
};

function formDoPainel(p: Painel | null): FormPainel {
  const a = p?.ajustes ?? AJUSTES_PAINEL_PADRAO;
  return {
    nome: p?.nome ?? '', sigla: p?.sigla ?? '', descricao: p?.descricao ?? '', cor: p?.cor ?? 'accent', acesso: p?.acesso ?? 'todos', pessoas: p?.pessoas ?? [],
    ativo: p?.ativo ?? true, tipos: [...a.tipos], contaPrazo: a.contaPrazo, fecharSozinho: a.fecharSozinhoDias !== null,
    fecharSozinhoDias: String(a.fecharSozinhoDias ?? AJUSTES_PAINEL_PADRAO.fecharSozinhoDias ?? 3), obrigatoriosAoAbrir: [...a.obrigatoriosAoAbrir],
    paiEsperaFilhos: a.paiEsperaFilhos, supervisores: [...a.supervisores],
  };
}

type EtapaRascunho = EtapaGravarEntrada & { chave: string; nome: string; tipo: TipoEtapa; nivel: Nivel | null; obrigatorios: Obrigatorio[]; avisar: string[] };
type Saindo = { etapa: EtapaRascunho; posicao: number };
type EtapaComChamados = { id: string; nome: string; chamados: number };

let sequencia = 0;
const daEtapa = (e: EtapaPainel): EtapaRascunho => ({ chave: e.id, id: e.id, nome: e.nome, tipo: e.tipo, nivel: e.nivel, obrigatorios: [...e.obrigatorios], avisar: [...e.avisar] });
/** Uma etapa que ainda não existe (sem id): a do painel novo, a copiada de outro painel ou a incluída agora. */
const etapaNova = (e: Pick<EtapaPainel, 'nome' | 'tipo' | 'nivel' | 'obrigatorios'> & { avisar?: string[] }): EtapaRascunho =>
  ({ chave: `nova-${++sequencia}`, nome: e.nome, tipo: e.tipo, nivel: e.nivel, obrigatorios: [...e.obrigatorios], avisar: [...(e.avisar ?? [])] });
const paraGravar = ({ chave: _chave, ...e }: EtapaRascunho): EtapaGravarEntrada => ({ ...e, nome: e.nome.trim() });
const assinatura = (xs: EtapaRascunho[]) => JSON.stringify(xs.map(paraGravar));
/**
 * As etapas de um painel que já existe, copiadas para o novo (sem os ids: no painel novo, todas nascem),
 * ou as básicas. Os campos do painel de origem não vão junto nas regras: são daquele painel.
 */
function etapasDoModelo(modelo: Painel | undefined): EtapaRascunho[] {
  const fonte: Array<Pick<EtapaPainel, 'nome' | 'tipo' | 'nivel' | 'obrigatorios'> & { avisar?: string[] }> = modelo ? modelo.etapas : ETAPAS_DO_PAINEL_NOVO;
  return fonte.map((e) => etapaNova({ ...e, obrigatorios: e.obrigatorios.filter((k) => !idDaChave(k)) }));
}

/** "Andamento · N2 · pede: Cliente, Relato do cliente, Assunto · avisa: Pedro". */
function resumoDaEtapa(e: EtapaRascunho, pessoas: PessoaCurta[], campos: CampoPersonalizado[]): string {
  const pede = e.obrigatorios.map((k) => nomeDoObrigatorio(k, campos));
  return [
    TIPO_CURTO[e.tipo],
    rotuloDoNivel(e.nivel),
    pede.length ? `pede: ${pede.join(', ')}` : 'não pede nada',
    e.avisar.length ? `avisa: ${listaDeNomes(e.avisar.map((id) => nomeDaPessoa(pessoas, id)))}` : '',
  ].filter(Boolean).join(' · ');
}

/** As partes da janela (a barra de cima leva a cada uma). */
const PARTES = [
  { id: 'painel-geral', nome: 'O painel' },
  { id: 'painel-etapas', nome: 'As etapas' },
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
  // o que pode ser obrigatório neste painel (o painel novo usa todos os campos do sistema)
  const validos = useMemo(() => obrigatoriosQueValem(painel?.ajustes ?? AJUSTES_PAINEL_PADRAO, campos), [painel, campos]);
  const [inicio] = useState(() => ({ form: formDoPainel(painel), etapas: painel ? painel.etapas.map(daEtapa) : etapasDoModelo(undefined) }));
  const [f, setF] = useState<FormPainel>(inicio.form);
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
    setRascunho(etapasDoModelo(paineis.find((p) => p.id === id)));
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
    if (f.fecharSozinho && !diasOk) { setErro('O "fecha sozinho" vai de 1 a 60 dias úteis.'); document.getElementById('painel-dias')?.focus(); return; }
    const d: PainelGravarEntrada = {
      nome: f.nome.trim(), sigla, descricao: f.descricao.trim() || null, cor: f.cor, acesso: f.acesso,
      // quem estava escolhido fica guardado mesmo com "todos": voltar para "escolhidos" não perde a lista
      pessoas: f.pessoas, ativo: f.ativo,
      ajustes: {
        tipos: f.tipos, contaPrazo: f.contaPrazo, fecharSozinhoDias: f.fecharSozinho ? dias : null,
        obrigatoriosAoAbrir: validos.abrir.filter((c) => f.obrigatoriosAoAbrir.includes(c)), paiEsperaFilhos: f.paiEsperaFilhos, supervisores: f.supervisores,
      },
      ...(etapasMudaram ? { etapas, destino } : {}),
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
    <Modal open onClose={pedirParaFechar} largura="max-w-3xl" titulo={painel ? `Editar o painel ${painel.nome}` : 'Novo painel'}
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
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_150px]">
            <CampoRotulo rotulo="Nome" id="painel-nome">
              <input className="input" id="painel-nome" value={f.nome} maxLength={40} placeholder="Ex.: Interno" autoFocus={!painel} onChange={(e) => mudar({ nome: e.target.value })} />
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
          <p className="text-[12.5px] text-muted -mt-1">
            As colunas do quadro, da esquerda para a direita. Arraste pela alça (ou use as setas) para mudar a ordem; o lápis abre a etapa. O
            chamado novo cai na primeira etapa de <b>Entrada</b>; mover para um nível acima (N1 → N2) é escalonar e pede o motivo.
          </p>
          {!painel && paineis.length > 0 && (
            <label className="flex flex-wrap items-center gap-2 text-[13px] text-ink-2" htmlFor="painel-modelo">
              Começar com as etapas
              <select className="input w-auto max-w-full py-1.5" id="painel-modelo" value={modelo} onChange={(e) => usarModelo(e.target.value)}>
                <option value="">básicas (Novo, Em andamento, Resolvido e Fechado)</option>
                {paineis.map((p) => <option key={p.id} value={p.id}>do painel {p.nome} ({p.etapas.length})</option>)}
              </select>
            </label>
          )}
          <ListaDeEtapas rascunho={rascunho} mexer={mexer} saindo={saindo} setSaindo={setSaindo} abertas={abertas} setAbertas={setAbertas}
            pessoas={pessoas} todasAsPessoas={todasAsPessoas} existe={!!painel} chamadosNa={chamadosNa} obrigatorios={validos.etapas} campos={campos} />
        </section>

        <section id="painel-regras" className="scroll-mt-14 border-t border-line pt-4 flex flex-col gap-4" aria-label="As regras">
          <h4 className="font-display font-semibold text-[14px]">As regras</h4>
          <p className="text-[12.5px] text-muted rounded-lg bg-surface-2 px-3 py-2 -mt-1.5" id="painel-onde-campos">
            Os campos do chamado neste painel — o Assunto e a árvore dele, o Tipo e as opções, os que a equipe cria — ficam na aba <b className="text-ink-2">Campos</b>
            {painel ? '' : ', depois de criar o painel'}. Aqui eles aparecem no que pode ser obrigatório.
          </p>

          <label className="flex items-start gap-2.5 text-sm cursor-pointer">
            <Toggle checked={f.contaPrazo} onChange={(v) => mudar({ contaPrazo: v })} />
            {/* 13/10, o Luan: "essa parte do conta prazo, não entendi para que serve" — a dica diz o que muda */}
            <span>Conta prazo <span className="block text-[12.5px] text-muted">Ligado, cada chamado deste painel tem um prazo para a primeira resposta e outro para a solução, conforme a prioridade (os tempos ficam em Ajustes › Prazos). O cartão mostra quanto falta, e o Gestor avisa quando o prazo está perto de vencer e quando vence. Desligado, o painel não tem prazo, como o Desenvolvimento.</span></span>
          </label>

          <div className="flex flex-col gap-1.5">
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
          </div>

          <CampoRotulo rotulo="O que é obrigatório para abrir" id="painel-obrigatorios" grupo
            dica="O formulário de abrir mostra um * nestes campos, e quem abre pela tela não abre sem eles (o robô e o agendado abrem mesmo assim: o que faltar é pedido para andar). O que só existe depois de aberto (solução, causa, checklist, tempo) fica nas regras de cada etapa.">
            <Caixinhas id="painel-obrigatorios" campos={validos.abrir} valor={f.obrigatoriosAoAbrir} nome={(k) => nomeDoObrigatorio(k, campos)} onChange={(v) => mudar({ obrigatoriosAoAbrir: v })} />
          </CampoRotulo>

          <label className="flex items-start gap-2.5 text-sm cursor-pointer">
            <Toggle checked={f.paiEsperaFilhos} onChange={(v) => mudar({ paiEsperaFilhos: v })} />
            <span>O pai só resolve e fecha com os filhos fechados <span className="block text-[12.5px] text-muted">E diz quais faltam, mesmo os filhos em outro painel.</span></span>
          </label>

          <CampoRotulo rotulo="Supervisores" id="painel-supervisores" grupo dica="Recebem o aviso do que vence, do que fica sem dono e do que chega Crítico.">
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

function ListaDeEtapas({ rascunho, mexer, saindo, setSaindo, abertas, setAbertas, pessoas, todasAsPessoas, existe, chamadosNa, obrigatorios, campos }: {
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
                      {existe && !e.id && <Chip tone="ok">nova</Chip>}
                    </span>
                  </button>
                  <span className="flex items-center shrink-0">
                    <BotaoIcone rotulo={`Subir ${e.nome || 'a etapa'}`} desativado={i === 0} onClick={() => moverPara(e.chave, -1)}><ArrowUp size={15} /></BotaoIcone>
                    <BotaoIcone rotulo={`Descer ${e.nome || 'a etapa'}`} desativado={i === rascunho.length - 1} onClick={() => moverPara(e.chave, 1)}><ArrowDown size={15} /></BotaoIcone>
                    <BotaoIcone rotulo={aberta ? `Fechar ${e.nome || 'a etapa'}` : `Editar ${e.nome || 'a etapa'}`} onClick={() => alternar(e.chave)}>{aberta ? <ChevronUp size={15} /> : <Pencil size={15} />}</BotaoIcone>
                    <BotaoIcone rotulo={`Tirar ${e.nome || 'a etapa'}`} onClick={() => tirar(e)} perigo><Trash2 size={15} /></BotaoIcone>
                  </span>
                </div>
                {/* o resumo na largura toda (no celular, ao lado dos botões, ficava espremido) */}
                <p className="text-[12.5px] text-muted leading-snug pl-[52px] pr-1 break-words cursor-pointer" onClick={() => alternar(e.chave)}>
                  {resumoDaEtapa(e, todasAsPessoas, campos)}
                  {n !== null && n > 0 && e.id && <> · <span className="font-semibold text-ink-2 tnum">{n} {n === 1 ? 'chamado' : 'chamados'}</span></>}
                </p>
              </div>
              {aberta && <EditarEtapa e={e} pessoas={pessoas} todasAsPessoas={todasAsPessoas} obrigatorios={obrigatorios} campos={campos} onMudar={(o) => mudarEtapa(e.chave, o)} />}
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
function EditarEtapa({ e, pessoas, todasAsPessoas, obrigatorios, campos, onMudar }: {
  e: EtapaRascunho; pessoas: PessoaCurta[]; todasAsPessoas: PessoaCurta[]; obrigatorios: Obrigatorio[]; campos: CampoPersonalizado[]; onMudar: (o: Partial<EtapaRascunho>) => void;
}) {
  const base = `etapa-${e.chave}`;
  const fecha = e.tipo === 'resolvido' || e.tipo === 'fechado';
  return (
    <div className="border-t border-line p-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
      <CampoRotulo rotulo="Nome" id={`etapa-nome-${e.chave}`}>
        <input className="input" id={`etapa-nome-${e.chave}`} value={e.nome} maxLength={40} placeholder="Ex.: Aguardando peça" autoComplete="off" onChange={(ev) => onMudar({ nome: ev.target.value })} />
      </CampoRotulo>
      <CampoRotulo rotulo="Tipo" id={`${base}-tipo`} dica={DICA_TIPO_ETAPA[e.tipo]}>
        <select className="input" id={`${base}-tipo`} value={e.tipo} onChange={(ev) => onMudar({ tipo: ev.target.value as TipoEtapa })}>
          {TIPOS_ETAPA.map((t) => <option key={t} value={t}>{NOME_TIPO_ETAPA[t]}</option>)}
        </select>
      </CampoRotulo>
      <CampoRotulo rotulo="Nível" id={`${base}-nivel`} grupo dica="Mover para um nível acima é escalonar; para um abaixo, voltar de nível (os dois pedem o motivo).">
        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Nível" id={`${base}-nivel`}>
          {([null, ...NIVEIS] as const).map((n) => (
            <button key={n ?? 0} type="button" role="radio" aria-checked={e.nivel === n} onClick={() => onMudar({ nivel: n })}
              className={`rounded-lg border px-3 py-1.5 text-[13px] min-w-[44px] ${e.nivel === n ? 'border-accent bg-accent-soft text-accent-ink font-semibold' : 'border-line text-ink-2 hover:bg-surface-2'}`}>
              {n ? rotuloDoNivel(n) : '—'}
            </button>
          ))}
        </div>
      </CampoRotulo>
      <CampoRotulo rotulo="Quem recebe o aviso quando um chamado chega aqui" id={`${base}-avisar`} grupo dica="Na tela e no WhatsApp (se ligado em Avisos e WhatsApp). Quem moveu não é avisado.">
        <EscolherPessoas id={`${base}-avisar`} rotulo="Quem recebe o aviso" valor={e.avisar} pessoas={pessoas} todasAsPessoas={todasAsPessoas} vazio="Ninguém." onChange={(v) => onMudar({ avisar: v })} />
      </CampoRotulo>
      <CampoRotulo rotulo="O que precisa estar preenchido para entrar" id={`${base}-obrigatorios`} grupo className="sm:col-span-2"
        dica={fecha ? 'O problema (ITIL) sempre pede a causa, a solução e a validação para resolver e fechar, em qualquer painel.' : 'Sem o que está marcado, o chamado não entra: a tela diz o que falta.'}>
        <Caixinhas id={`${base}-obrigatorios`} campos={obrigatorios} valor={e.obrigatorios} nome={(k) => nomeDoObrigatorio(k, campos)} onChange={(v) => onMudar({ obrigatorios: v })} />
      </CampoRotulo>
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
