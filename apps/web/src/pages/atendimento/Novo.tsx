/**
 * Chamados do Gestor (Patch 2.0, decisão 0047) — ABRIR CHAMADO.
 *
 * Abre-se à mão no Gestor ou pelo botão "Abrir chamado" da conversa do LineChat, que chega aqui com
 * `?telefone=…&nome=…&sessao=…` (o contato e o WhatsApp já vêm preenchidos, e o chamado guarda a
 * sessão para o link da conversa). Outros atalhos pelo endereço: `?painel=` (o painel), `?pai=SUP-3`
 * (o filho nasce ligado ao pai) e `?tipo=problema&incidente=SUP-5` (o problema nasce juntando o incidente).
 *
 * O que o Luan pediu e está aqui:
 *  - ao escolher o cliente, os chamados recentes dele aparecem com "Reabrir este em vez de abrir
 *    outro": o cliente que volta à tarde com o mesmo ramal reabre o chamado da manhã;
 *  - a prioridade vem sugerida pela gravidade e pelo alcance (a matriz dos Ajustes › Prazos); trocar a
 *    sugerida pede o motivo, que fica no histórico;
 *  - o cliente só recebe aviso quando o atendente marca (desmarcado por padrão).
 *
 * As regras (o que o painel pede para abrir, a prioridade sugerida, o caminho do assunto) vêm do
 * `@gestor/shared`; quem decide é o servidor, e o erro dele aparece perto do botão.
 *
 * O botão "Abrir chamado" do alto das telas abre o formulário numa janela por cima da tela
 * (`JanelaAbrirChamado`; o pedido do Luan na prévia, em 14/10: "o abrir chamado tem que ser como pop up e
 * não a tela toda"); o link direto (o botão da conversa do LineChat, numa aba nova) abre na página inteira.
 *
 * O mesmo formulário abre numa janela por cima da ficha (`NovoChamadoNaJanela`): o filho e o problema a
 * partir de um chamado (o pedido do Luan na prévia: "quando eu for abrir um filho, ele tem que abrir como
 * pop-up e não a tela inteira"). Aberto, a janela fecha e a ficha de baixo mostra o filho.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, GitBranch, Layers, MessageCircle, Plus, RotateCcw, Siren, UserRoundPlus, X } from 'lucide-react';
import {
  ALCANCES, DICA_GRAVIDADE, DICA_PRIORIDADE, GRAVIDADES, MAX_LETRAS_DO_CAMPO, NOME_ALCANCE, NOME_GRAVIDADE, NOME_PRIORIDADE, NOME_SITUACAO_CHAMADO, PRIORIDADES,
  acharContato, caminhoDoAssunto, campoLigado, chaveDaEtiqueta, chaveDoCampo, emOrdemDeArvore, etiquetasUnicas, idDaChave, nomeDoObrigatorio, numeroWhatsApp,
  paraBusca, prioridadeSugeridaDoPainel, valorPreenchido,
  type CorEtiqueta,
  type Alcance, type CadastroDoCliente, type ContatoDoCliente, type CampoDoSistema, type CampoObrigatorio, type CampoPersonalizado, type CartaoChamado, type ChamadoCriarEntrada,
  type FichaChamado, type Gravidade, type Obrigatorio, type OpcoesAtendimento, type Painel, type Prioridade, type TipoChamado, type ValorDoCampo,
} from '@gestor/shared';
import { api } from '../../api/index.js';
import { ApiError } from '../../api/types.js';
import { Carregando, Chip, Confirmar, EscolherComBusca, Modal, Spinner, Vazio, mensagemErro, useToast, type OpcaoBusca } from '../../components/ui/index.js';
import { useAuth } from '../../lib/auth.js';
import { JanelaContato, usePodeMexerNosContatos } from '../clientes/Contatos.js';
import { SeletorDeEtiquetas } from './SeletorDeEtiquetas.js';
import { PontoDoPainel } from './quadro/filtros.js';
import {
  CabecalhoAtendimento, ChipSituacao, CodigoChamado, LinkDoChamado, TOM_DO_PAINEL, dataHoraCurta, etapaDe, haQuanto,
  painelDe, telefoneLegivel, useAbrirChamado, useDepoisDeMudar, useFecharJanela, useFicha, useOpcoes, usePode,
} from './comum.js';

/** O motivo que o "Reabrir este" grava (o pedido do Luan: o cliente voltou com o mesmo problema). */
const MOTIVO_REABRIR = 'O cliente voltou com o mesmo problema';

/** Os campos que o formulário tem; o resto (solução, causa, checklist, tempo) só existe depois de aberto. */
const CAMPOS_DO_FORMULARIO: CampoObrigatorio[] = [
  'cliente', 'contato', 'relato', 'descricao', 'assunto', 'tipo', 'gravidade', 'alcance', 'prioridade', 'produto', 'operadora', 'responsavel',
];

/** A cor de cada prioridade no botão escolhido (as mesmas do chip da prioridade). */
const COR_PRIORIDADE: Record<Prioridade, string> = {
  critica: 'border-bad bg-bad-soft text-bad',
  alta: 'border-signal bg-signal-soft text-signal',
  media: 'border-amarelo bg-amarelo-soft text-amarelo-ink',
  baixa: 'border-line-strong bg-surface-2 text-ink-2',
};

type Form = {
  painelId: string;
  tipoChamado: TipoChamado;
  clienteId: string;
  contatoNome: string;
  contatoTelefone: string;
  titulo: string;
  relato: string;
  descricao: string;
  assuntoId: string;
  tipo: string;
  gravidade: Gravidade | null;
  alcance: Alcance | null;
  /** nula = segue a sugerida */
  prioridade: Prioridade | null;
  motivoPrioridade: string;
  produtos: string[];
  operadoras: string[];
  /** '' = ninguém (o chamado fica na fila da entrada) */
  responsavelId: string;
  /** quem observa: recebe os avisos de toda atualização (como no Helena) */
  observadores: string[];
  etiquetas: string[];
  /** a cor de cada etiqueta NOVA (pela chave do nome); a que já existe tem a dela */
  coresNovas: Record<string, CorEtiqueta>;
  avisarCliente: boolean;
  /** os campos do painel (pelo id do campo) */
  campos: Record<string, ValorDoCampo>;
};

/**
 * O endereço muda (o botão "Abrir chamado" do cabeçalho, outro filho, outra conversa): o formulário
 * começa do zero, sem levar o que estava escrito no anterior.
 */
export function NovoChamado() {
  const { search } = useLocation();
  return <Carregador key={search} />;
}

/**
 * Abrir numa janela: o "Abrir chamado" do alto das telas (`JanelaAbrirChamado`), o filho (`pai`) ou o
 * problema a partir de um chamado (`incidente`). `painelId` é o painel que já vem escolhido (o da tela
 * ou o do chamado de baixo); com `painelFixo`, ele é o painel do chamado, sem outra opção (o filho
 * pode ir para outro).
 */
export type AbrirNaJanela = {
  pai?: string; incidente?: string; painelId?: string; painelFixo?: boolean;
  /** aberto: o código do novo */
  onAberto: (codigo: string) => void;
  /** em vez de abrir, reabriu um recente do cliente: o código dele */
  onReaberto: (codigo: string) => void;
  onCancelar: () => void;
  /** a pessoa já escreveu alguma coisa (fechar a janela pergunta antes) */
  onEscreveu?: (sim: boolean) => void;
};
export function NovoChamadoNaJanela(p: AbrirNaJanela) {
  return <Carregador naJanela={p} />;
}

/**
 * O "Abrir chamado" do alto das telas do módulo, numa janela por cima da tela (o pedido do Luan na
 * prévia, em 14/10: "o abrir chamado tem que ser como pop up e não a tela toda"). A tela de baixo fica
 * como estava (o quadro com os filtros, a lista na mesma página); o endereço é o do Abrir chamado, e o
 * Voltar do navegador fecha a janela, como na ficha. Aberto (ou reaberto um recente), a janela vira a
 * ficha do chamado, por cima da mesma tela. Com algo escrito, fechar pergunta antes.
 */
export function JanelaAbrirChamado() {
  const [sp] = useSearchParams();
  const opcoes = useOpcoes();
  const fecharJanela = useFecharJanela();
  const abrirChamado = useAbrirChamado();
  const [escreveu, setEscreveu] = useState(false);
  const [descartar, setDescartar] = useState(false);
  const fechar = () => (escreveu ? setDescartar(true) : fecharJanela());
  // o painel da tela de onde veio (o quadro, a lista): o chamado nasce nele
  const pedido = sp.get('painel')?.trim() || undefined;
  const painel = pedido ? opcoes.data?.paineis.find((p) => p.ativo && (p.id === pedido || p.sigla === pedido.toUpperCase())) : undefined;
  return (
    <>
      <Modal open onClose={fechar} largura="max-w-4xl" titulo={(
        <span className="flex items-center gap-2 min-w-0">
          {painel && <PontoDoPainel cor={painel.cor} />}
          <span className="truncate">{painel ? `Abrir chamado no painel ${painel.nome}` : 'Abrir chamado'}</span>
        </span>
      )}>
        <div id="janela-abrir-chamado">
          <NovoChamadoNaJanela painelId={pedido} painelFixo onEscreveu={setEscreveu} onCancelar={fechar}
            onAberto={abrirChamado} onReaberto={abrirChamado} />
        </div>
      </Modal>
      <Confirmar open={descartar} onClose={() => setDescartar(false)} onConfirm={() => { setDescartar(false); fecharJanela(); }} perigoso botao="Descartar"
        titulo="Descartar o que foi escrito?" texto="O chamado ainda não foi aberto: o que foi escrito nesta janela se perde." />
    </>
  );
}

function Carregador({ naJanela }: { naJanela?: AbrirNaJanela }) {
  const opcoes = useOpcoes();
  const pode = usePode();
  // na janela, o cabeçalho do módulo não aparece (a janela tem o título dela)
  const topo = naJanela ? null : <CabecalhoAtendimento sub="Abrir chamado" />;
  if (opcoes.isLoading) return <div>{topo}<Carregando /></div>;
  if (opcoes.isError || !opcoes.data) return <div>{topo}<p className="text-bad text-sm" role="alert">{mensagemErro(opcoes.error)}</p></div>;
  if (!pode.trabalhar) {
    return <div>{topo}<Vazio titulo="Abrir chamado é de quem trabalha nos chamados" texto="Você pode ver os chamados, mas abrir e mexer pede a permissão de trabalhar neles. Fale com a administração." /></div>;
  }
  const paineis = opcoes.data.paineis.filter((p) => p.ativo);
  if (!paineis.length) {
    return <div>{topo}<Vazio titulo="Nenhum painel aberto para você" texto="Para abrir um chamado é preciso um painel ativo que você veja. Quem cuida dos chamados cria e libera os painéis em Chamados › Ajustes." /></div>;
  }
  return <Formulario opcoes={opcoes.data} paineis={paineis} naJanela={naJanela} />;
}

function Formulario({ opcoes, paineis, naJanela }: { opcoes: OpcoesAtendimento; paineis: Painel[]; naJanela?: AbrirNaJanela }) {
  const [sp] = useSearchParams();
  const navigate = useNavigate();
  const toast = useToast();
  const depois = useDepoisDeMudar();
  const { user } = useAuth();
  const pode = usePode();
  const local = useLocation();
  // "Cancelar" volta para onde a pessoa estava (o quadro, a lista); aberto direto (o botão do LineChat), vai para o Meu dia; na janela, fecha
  const cancelar = () => (naJanela ? naJanela.onCancelar() : local.key !== 'default' ? navigate(-1) : navigate('/atendimento'));

  // o que veio no endereço (o botão da conversa do LineChat, o "Abrir filho", o "Abrir problema") — ou da janela
  const doEndereco = (k: string) => (naJanela ? null : sp.get(k)?.trim() || null);
  const sessao = doEndereco('sessao');
  const refPai = (naJanela ? naJanela.pai : doEndereco('pai')) || undefined;
  const refIncidente = (naJanela ? naJanela.incidente : doEndereco('incidente')) || undefined;
  const pedidoPainel = (naJanela ? naJanela.painelId : doEndereco('painel')) ?? '';
  /** o painel do endereço (pelo id ou pela sigla) */
  const painelDoEndereco = pedidoPainel ? paineis.find((p) => p.id === pedidoPainel || p.sigla === pedidoPainel.toUpperCase()) : undefined;
  /**
   * Aberto de dentro de um painel (o "Abrir chamado" do quadro e da lista), o chamado é dele: não há
   * painel para escolher (o pedido do Luan na prévia). O filho (?pai=) escolhe, porque pode nascer em
   * outro painel (o Desenvolvimento ajudando o Suporte).
   */
  const painelFixo = (naJanela ? !!naJanela.painelFixo : true) && !!painelDoEndereco && !refPai;

  const [f, setF] = useState<Form>(() => {
    const fone = doEndereco('telefone') ?? '';
    const painel = painelDoEndereco ?? paineis[0]!;
    const eu = user && opcoes.pessoas.some((p) => p.id === user.id && p.ativo) ? user.id : '';
    return {
      painelId: painel.id,
      tipoChamado: (naJanela ? naJanela.incidente : doEndereco('tipo') === 'problema') ? 'problema' : 'chamado',
      clienteId: '',
      contatoNome: doEndereco('nome') ?? '',
      // o LineChat manda só os dígitos (5571999990000): a caixa mostra do jeito que se lê
      contatoTelefone: fone ? telefoneLegivel(numeroWhatsApp(fone) ?? fone) : '',
      titulo: '', relato: '', descricao: '',
      assuntoId: '', tipo: '', gravidade: null, alcance: null, prioridade: null, motivoPrioridade: '',
      produtos: [], operadoras: [],
      responsavelId: eu,
      observadores: [],
      etiquetas: [],
      coresNovas: {},
      avisarCliente: false,
      campos: {},
    };
  });
  const mudar = (o: Partial<Form>) => { setF((x) => ({ ...x, ...o })); setMexeu(true); };
  const [mexeu, setMexeu] = useState(false);
  const [erro, setErro] = useState('');
  /** os campos que o servidor disse que faltam (ficam marcados até a pessoa mexer de novo) */
  const [faltando, setFaltando] = useState<Set<string>>(new Set());
  const [enviando, setEnviando] = useState(false);

  const painel = paineis.find((p) => p.id === f.painelId) ?? paineis[0]!;
  const pede = (c: Obrigatorio) => painel.ajustes.obrigatoriosAoAbrir.includes(c);
  const falta = (c: string) => faltando.has(c);
  /** o painel usa este campo do sistema? (desligado em Ajustes › Campos, ele não aparece aqui) */
  const usa = (c: CampoDoSistema) => campoLigado(painel.ajustes, c);
  /** os campos que o painel criou (os ativos), na ordem dos Ajustes */
  const camposDoPainel = useMemo(() => opcoes.campos.filter((c) => c.painelId === painel.id && c.ativo), [opcoes.campos, painel.id]);

  // ---------- o pai e o incidente (pelo código, do endereço) ----------
  const pai = useFicha(refPai);
  const incidente = useFicha(refIncidente);
  // o filho costuma ser do mesmo cliente do pai (o Desenvolvimento ajudando o Suporte): já vem escolhido
  const trouxeClienteDoPai = useRef(false);
  useEffect(() => {
    if (trouxeClienteDoPai.current || !pai.data?.cliente) return;
    trouxeClienteDoPai.current = true;
    setF((x) => (x.clienteId ? x : { ...x, clienteId: pai.data!.cliente!.id }));
  }, [pai.data]);

  // ---------- o cliente e o cadastro dele ----------
  const clientes = useQuery({ queryKey: ['client-options'], queryFn: () => api.clients.options(), staleTime: 5 * 60_000 });
  const opcoesClientes = useMemo<OpcaoBusca[]>(() => (clientes.data ?? []).map((c) => ({ id: c.id, nome: c.name })), [clientes.data]);
  const cadastro = useQuery({ queryKey: ['atendimento', 'cadastro', f.clienteId], queryFn: () => api.atendimento.cadastroDoCliente(f.clienteId), enabled: !!f.clienteId });

  // ---------- os assuntos do painel (o caminho inteiro; os ativos) ----------
  const assuntosDoPainel = useMemo(() => opcoes.assuntos.filter((a) => a.painelId === painel.id), [opcoes.assuntos, painel.id]);
  const opcoesAssunto = useMemo<OpcaoBusca[]>(() => emOrdemDeArvore(assuntosDoPainel)
    .filter((a) => a.ativo)
    .map((a) => ({ id: a.id, nome: caminhoDoAssunto(a.id, assuntosDoPainel), dica: a.descricao ?? undefined })), [assuntosDoPainel]);
  const assunto = assuntosDoPainel.find((a) => a.id === f.assuntoId);

  // ---------- a prioridade sugerida ----------
  // pelos campos que o painel usa: com o alcance, a matriz; sem ele, só a gravidade (Ajustes › Prazos)
  const sugerida = prioridadeSugeridaDoPainel(painel.ajustes, f.gravidade, f.alcance, opcoes.prazos);
  const prioridadeFinal = f.prioridade ?? sugerida;
  const precisaMotivo = !!f.prioridade && !!sugerida && f.prioridade !== sugerida;

  const foneValido = numeroWhatsApp(f.contatoTelefone);
  // ---------- os contatos do cliente (a aba Contatos): escolher um preenche o nome e o WhatsApp ----------
  const contatosDoCliente = cadastro.data?.contatos ?? [];
  const contatoEscolhido = f.clienteId ? acharContato(contatosDoCliente, { nome: f.contatoNome, telefone: f.contatoTelefone }) : undefined;
  const nomeDoCliente = opcoesClientes.find((o) => o.id === f.clienteId)?.nome ?? 'o cliente';
  const podeContatos = usePodeMexerNosContatos();
  const [janelaContato, setJanelaContato] = useState<{ inicial?: { nome?: string; whatsapp?: string } } | null>(null);
  const escolherContato = (c: ContatoDoCliente) => {
    mudar({ contatoNome: c.nome, contatoTelefone: c.whatsapp ? telefoneLegivel(c.whatsapp) : '' });
    tirarFalta('contato');
  };
  const foneInvalido = !!f.contatoTelefone.trim() && !foneValido;
  const podeAvisar = opcoes.whatsapp.cliente && !!foneValido;

  // o que o painel pede e o formulário não tem (uma regra mal escolhida nos Ajustes): diz logo, em vez de travar no fim
  const pedeForaDoFormulario = painel.ajustes.obrigatoriosAoAbrir.filter((c) => !idDaChave(c) && !CAMPOS_DO_FORMULARIO.includes(c as CampoObrigatorio));

  // não sair sem querer com o relato pela metade
  const escreveu = mexeu && !!(f.titulo.trim() || f.relato.trim() || f.descricao.trim());
  const avisarEscreveu = useRef(naJanela?.onEscreveu);
  avisarEscreveu.current = naJanela?.onEscreveu;
  useEffect(() => { avisarEscreveu.current?.(escreveu); }, [escreveu]);
  useEffect(() => {
    if (!escreveu) return;
    const aviso = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', aviso);
    return () => window.removeEventListener('beforeunload', aviso);
  }, [escreveu]);

  /** Outro painel: o assunto e o tipo que não existem lá saem. */
  const trocarPainel = (id: string) => {
    const novo = paineis.find((p) => p.id === id);
    if (!novo) return;
    const assuntoFica = opcoes.assuntos.some((a) => a.id === f.assuntoId && a.painelId === novo.id && a.ativo);
    const tipoFica = novo.ajustes.tipos.find((t) => paraBusca(t) === paraBusca(f.tipo));
    // os campos do painel são de cada painel: os do outro saem
    mudar({ painelId: novo.id, assuntoId: assuntoFica ? f.assuntoId : '', tipo: tipoFica ?? '', campos: {} });
    setFaltando(new Set());
  };
  const trocarCliente = (id: string) => { mudar({ clienteId: id }); tirarFalta('cliente'); };
  const tirarFalta = (c: string) => setFaltando((s) => { if (!s.has(c)) return s; const n = new Set(s); n.delete(c); return n; });

  /** Escolher a prioridade: a sugerida volta a "seguir a sugestão"; outra pede o motivo. */
  const escolherPrioridade = (p: Prioridade) => {
    if (sugerida) mudar({ prioridade: p === sugerida ? null : p });
    else mudar({ prioridade: f.prioridade === p ? null : p });
    tirarFalta('prioridade');
  };

  const abrir = async () => {
    setErro('');
    if (f.titulo.trim().length < 3) { setErro('Escreva um título (pelo menos 3 letras).'); document.getElementById('novo-titulo')?.focus(); return; }
    if (foneInvalido) { setErro('O WhatsApp do contato está incompleto: use DDD + número, como (71) 99999-0000.'); document.getElementById('novo-whatsapp')?.focus(); return; }
    if (precisaMotivo && !f.motivoPrioridade.trim()) { setErro('Trocar a prioridade sugerida pede o motivo.'); document.getElementById('novo-motivo-prioridade')?.focus(); return; }
    const d: ChamadoCriarEntrada = {
      painelId: painel.id,
      tipoChamado: f.tipoChamado,
      titulo: f.titulo.trim(),
      relato: f.relato.trim() || null,
      descricao: f.descricao.trim() || null,
      clienteId: f.clienteId || null,
      contatoNome: f.contatoNome.trim() || null,
      contatoTelefone: f.contatoTelefone.trim() || null,
      sessaoId: sessao,
      // o que o painel desligou não vai (o servidor também não guardaria)
      assuntoId: usa('assunto') ? f.assuntoId || null : null,
      tipo: usa('tipo') ? f.tipo || null : null,
      gravidade: usa('gravidade') ? f.gravidade : null,
      alcance: usa('alcance') ? f.alcance : null,
      prioridade: f.prioridade,
      motivoPrioridade: precisaMotivo ? f.motivoPrioridade.trim() : null,
      produtos: usa('produtos') ? f.produtos : [],
      operadoras: usa('operadoras') ? f.operadoras : [],
      campos: Object.fromEntries(camposDoPainel.filter((c) => valorPreenchido(f.campos[c.id])).map((c) => [c.id, f.campos[c.id]!])),
      etiquetas: f.etiquetas,
      // a cor das novas (a que já existe fica com a dela)
      coresDasEtiquetas: Object.fromEntries(f.etiquetas
        .filter((e) => !opcoes.etiquetas.some((x) => chaveDaEtiqueta(x.nome) === chaveDaEtiqueta(e)))
        .map((e) => [e, f.coresNovas[chaveDaEtiqueta(e)] ?? 'neutral'])),
      responsavelId: f.responsavelId || null,
      observadores: f.observadores,
      paiId: pai.data?.id ?? null,
      incidentes: f.tipoChamado === 'problema' && incidente.data ? [incidente.data.id] : [],
      avisarCliente: podeAvisar && f.avisarCliente,
      origem: sessao ? 'botao' : 'manual',
    };
    setEnviando(true);
    try {
      const r = await depois(api.atendimento.criar(d));
      setMexeu(false);
      const comoFilho = pai.data ? `, filho do ${pai.data.codigo}` : '';
      if (r.aviso && !r.aviso.ok) toast.push('erro', `${r.codigo} foi aberto${comoFilho}, mas o aviso ao cliente pelo WhatsApp não foi: ${r.aviso.mensagem}`);
      else toast.push('ok', r.aviso?.ok ? `${r.codigo} aberto${comoFilho}, e o cliente recebeu o número pelo WhatsApp` : `${r.codigo} aberto${comoFilho}`);
      if (naJanela) naJanela.onAberto(r.codigo);
      else navigate(`/atendimento/${encodeURIComponent(r.codigo)}`);
    } catch (e) {
      setErro(mensagemErro(e));
      if (e instanceof ApiError && e.details && typeof e.details === 'object' && !Array.isArray(e.details)) {
        const faltam = (e.details as { faltam?: string[] }).faltam;
        if (faltam?.length) setFaltando(new Set(faltam));
      }
    } finally {
      setEnviando(false);
    }
  };

  // ---------- reabrir um recente em vez de abrir outro ----------
  const [reabrindo, setReabrindo] = useState<string | null>(null);
  const [erroReabrir, setErroReabrir] = useState<{ id: string; msg: string } | null>(null);
  const reabrir = async (c: CartaoChamado) => {
    setReabrindo(c.id); setErroReabrir(null);
    try {
      let ficha: FichaChamado = await depois(api.atendimento.reabrir(c.id, { motivo: MOTIVO_REABRIR }));
      // o que já foi escrito aqui não se perde: o relato novo vai como anotação do chamado reaberto
      const relato = f.relato.trim();
      let anotou = false;
      if (relato) {
        try { ficha = await depois(api.atendimento.anotar(c.id, { texto: `Relato do cliente ao voltar: ${relato}`, anexos: [] })); anotou = true; }
        catch (e) { toast.push('erro', `${ficha.codigo} foi reaberto, mas o relato escrito aqui não entrou nas anotações: ${mensagemErro(e)}`); }
      }
      setMexeu(false);
      toast.push('ok', `${ficha.codigo} reaberto${anotou ? ', com o relato novo nas anotações' : ''}`);
      if (naJanela) naJanela.onReaberto(ficha.codigo);
      else navigate(`/atendimento/${encodeURIComponent(ficha.codigo)}`);
    } catch (e) {
      setErroReabrir({ id: c.id, msg: mensagemErro(e) });
    } finally {
      setReabrindo(null);
    }
  };

  const pessoas = opcoes.pessoas.filter((p) => p.ativo);
  const opcoesResponsavel: OpcaoBusca[] = pessoas.map((p) => ({ id: p.id, nome: p.nome, dica: p.id === user?.id ? 'você' : undefined }));

  return (
    <form autoComplete="off" onSubmit={(e) => { e.preventDefault(); void abrir(); }}
      onKeyDown={(e) => {
        // o formulário é comprido: o Enter num campo de uma linha não abre o chamado pela metade (Ctrl+Enter abre, de qualquer campo)
        if (e.key !== 'Enter') return;
        if (e.ctrlKey || e.metaKey) { e.preventDefault(); if (!enviando) void abrir(); return; }
        const alvo = e.target as HTMLElement;
        if (alvo.tagName === 'INPUT' && (alvo as HTMLInputElement).type !== 'checkbox') e.preventDefault();
      }}>
      {!naJanela && (
        <CabecalhoAtendimento painelId={painelFixo ? painel.id : undefined}
          sub={painelFixo ? `Abrir chamado no painel ${painel.nome}: o que o cliente contou, de quem é e quem cuida.` : 'Abrir chamado: o que o cliente contou, de quem é e quem cuida.'} />
      )}

      <div className="grid grid-cols-1 gap-4 max-w-4xl">
        {/* de onde veio: a conversa do LineChat, o pai, o incidente */}
        {(sessao || refPai || refIncidente) && (
          <div className="flex flex-col gap-2">
            {sessao && (
              <AvisoTopo icone={<MessageCircle size={15} />}>
                Veio da conversa do LineChat: o contato e o WhatsApp já estão preenchidos, e o chamado guarda o link da conversa.
              </AvisoTopo>
            )}
            {refPai && <ChamadoLigado rotulo="Filho de" icone={<GitBranch size={15} />} consulta={pai} referencia={refPai} opcoes={opcoes}
              dica="O filho nasce ligado a este chamado (pode ser de outro painel). O pai só fecha com os filhos fechados, se o painel dele pedir." />}
            {refIncidente && <ChamadoLigado rotulo={f.tipoChamado === 'problema' ? 'O problema junta o incidente' : 'Incidente (só um problema junta incidentes)'} icone={<Layers size={15} />}
              consulta={incidente} referencia={refIncidente} opcoes={opcoes} apagado={f.tipoChamado !== 'problema'}
              dica={f.tipoChamado === 'problema' ? 'O problema nasce juntando este chamado; outros incidentes se juntam pela ficha.' : 'Marque "Problema" em Registro para juntar este incidente.'} />}
          </div>
        )}

        {pedeForaDoFormulario.length > 0 && (
          <p className="text-[13px] rounded-lg bg-signal-soft text-signal p-2.5" role="alert">
            O painel {painel.nome} pede para abrir: {pedeForaDoFormulario.map((c) => nomeDoObrigatorio(c, opcoes.campos)).join(', ')} — e isso só se preenche depois de aberto.
            Peça a quem cuida dos chamados para rever as regras do painel (Chamados › Ajustes › Painéis).
          </p>
        )}

        {/* ---------- onde ---------- */}
        <Secao titulo="Onde">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-[minmax(0,1fr)_auto]">
            <Rotulado rotulo="Painel" id="novo-painel" grupo>
              {painelFixo ? (
                // aberto de dentro do painel: ele é o painel do chamado, sem outra opção
                <p className="flex items-center gap-2 py-1.5 text-[14px] font-semibold text-ink" id="novo-painel" data-fixo="">
                  <Chip tone={TOM_DO_PAINEL[painel.cor]} className="font-mono">{painel.sigla}</Chip> {painel.nome}
                </p>
              ) : (
                <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Painel" id="novo-painel">
                  {paineis.map((p) => {
                    const ativo = p.id === painel.id;
                    return (
                      <button key={p.id} type="button" role="radio" aria-checked={ativo} onClick={() => trocarPainel(p.id)}
                        className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-[13.5px] ${ativo ? 'border-accent bg-accent-soft text-accent-ink font-semibold' : 'border-line text-ink-2 hover:bg-surface-2'}`}>
                        <Chip tone={TOM_DO_PAINEL[p.cor]} className="font-mono">{p.sigla}</Chip> {p.nome}
                      </button>
                    );
                  })}
                </div>
              )}
            </Rotulado>
            <Rotulado rotulo="Registro" id="novo-registro" grupo>
              <Segmentos<TipoChamado> id="novo-registro" rotulo="Registro" valor={f.tipoChamado} onChange={(v) => mudar({ tipoChamado: v })}
                opcoes={[{ id: 'chamado', nome: 'Chamado', dica: 'O pedido ou a falha de um cliente' }, { id: 'problema', nome: 'Problema', dica: 'A mesma falha em vários clientes: junta os chamados deles' }]} />
            </Rotulado>
          </div>
          {painel.descricao && <p className="text-[12.5px] text-muted mt-2">{painel.descricao}</p>}
        </Secao>

        {/* ---------- quem ---------- */}
        <Secao titulo="Quem">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Rotulado rotulo="Cliente" id="novo-cliente" obrigatorio={pede('cliente')} falta={falta('cliente')} className="sm:col-span-2">
              <EscolherComBusca valor={f.clienteId} onChange={trocarCliente} opcoes={opcoesClientes} vazio="Sem cliente (ainda)" placeholder={clientes.isLoading ? 'Carregando os clientes…' : 'Escolha o cliente…'}
                procurar="Procurar cliente…" className="input w-full" id="novo-cliente" rotulo="Cliente" largura="w-[420px]" />
            </Rotulado>
            {/* os contatos do cliente (o pedido do Luan na prévia): um clique preenche o nome e o WhatsApp; um novo nasce aqui */}
            {f.clienteId && (
              <ContatosParaEscolher className="sm:col-span-2" cliente={nomeDoCliente} contatos={contatosDoCliente} carregando={cadastro.isLoading}
                escolhido={contatoEscolhido?.id ?? null} onEscolher={escolherContato} podeIncluir={podeContatos}
                onNovo={() => setJanelaContato({ inicial: contatoEscolhido ? {} : { nome: f.contatoNome.trim(), whatsapp: f.contatoTelefone.trim() } })} />
            )}
            <Rotulado rotulo="Contato (nome)" id="novo-contato" obrigatorio={pede('contato')} falta={falta('contato')} dica={pede('contato') ? 'o nome ou o WhatsApp' : undefined}>
              <input className="input" id="novo-contato" value={f.contatoNome} maxLength={120} placeholder="Quem pediu (ex.: Maria, da recepção)"
                onChange={(e) => { mudar({ contatoNome: e.target.value }); tirarFalta('contato'); }} />
            </Rotulado>
            <Rotulado rotulo="WhatsApp do contato" id="novo-whatsapp" erro={foneInvalido ? 'Use DDD + número, como (71) 99999-0000.' : undefined}>
              <input className="input tnum" id="novo-whatsapp" inputMode="tel" value={f.contatoTelefone} maxLength={40} placeholder="(71) 99999-0000"
                onChange={(e) => { mudar({ contatoTelefone: e.target.value }); tirarFalta('contato'); }} />
            </Rotulado>
            {/* escrito à mão (ou vindo da conversa do LineChat) e fora dos contatos do cliente: guardar com um clique */}
            {f.clienteId && !contatoEscolhido && !cadastro.isLoading && podeContatos && f.contatoNome.trim().length >= 2 && !foneInvalido && (
              <p className="sm:col-span-2 text-[12.5px] text-muted -mt-1" id="novo-contato-fora">
                {f.contatoNome.trim()} não está nos contatos de {nomeDoCliente}.{' '}
                <button type="button" className="link" onClick={() => setJanelaContato({ inicial: { nome: f.contatoNome.trim(), whatsapp: f.contatoTelefone.trim() } })}>Salvar nos contatos</button>
              </p>
            )}
          </div>
          {janelaContato && f.clienteId && (
            <JanelaContato clienteId={f.clienteId} clienteNome={nomeDoCliente} contato={null} inicial={janelaContato.inicial}
              onFechar={() => setJanelaContato(null)} onSalvo={(c) => { escolherContato(c); setJanelaContato(null); }} />
          )}
          {f.clienteId && <Recentes cadastro={cadastro.data} carregando={cadastro.isLoading} erroCarregar={cadastro.isError ? mensagemErro(cadastro.error) : ''}
            opcoes={opcoes} reabrindo={reabrindo} erro={erroReabrir} onReabrir={reabrir} levaRelato={!!f.relato.trim()}
            onAbrirOutro={naJanela ? (codigo) => naJanela.onReaberto(codigo) : undefined} />}
        </Secao>

        {/* ---------- o que aconteceu ---------- */}
        <Secao titulo="O que aconteceu">
          <div className="grid grid-cols-1 gap-3">
            <Rotulado rotulo="Título" id="novo-titulo" obrigatorio dica="Uma frase, como alguém procuraria depois (o cliente já aparece à parte).">
              <input className="input" id="novo-titulo" value={f.titulo} maxLength={200} placeholder="Ex.: Ramal 203 sem áudio desde a manhã"
                onChange={(e) => mudar({ titulo: e.target.value })} />
            </Rotulado>
            <Rotulado rotulo="Relato do cliente" id="novo-relato" obrigatorio={pede('relato')} falta={falta('relato')} dica="O que o cliente disse, nas palavras dele.">
              <textarea className="input min-h-[96px]" id="novo-relato" value={f.relato} maxLength={20_000}
                onChange={(e) => { mudar({ relato: e.target.value }); tirarFalta('relato'); }} />
            </Rotulado>
            {/* a descrição está sempre aqui (o pedido do Luan na prévia: "sempre vai ter a descrição") */}
            <Rotulado rotulo="Descrição" id="novo-descricao" obrigatorio={pede('descricao')} falta={falta('descricao')} dica="O que já foi feito e os dados técnicos (ramal, número, IP, horário).">
              <textarea className="input min-h-[84px]" id="novo-descricao" value={f.descricao} maxLength={20_000}
                onChange={(e) => { mudar({ descricao: e.target.value }); tirarFalta('descricao'); }} />
            </Rotulado>
          </div>
        </Secao>

        {/* ---------- a classificação e a prioridade ---------- */}
        <Secao titulo="Classificação">
          <div className="grid grid-cols-1 gap-4">
            {(usa('assunto') || (usa('tipo') && painel.ajustes.tipos.length > 0)) && <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {usa('assunto') && <Rotulado rotulo="Assunto" id="novo-assunto" obrigatorio={pede('assunto')} falta={falta('assunto')} className="sm:col-span-2"
                dica={!opcoesAssunto.length ? `O painel ${painel.nome} ainda não tem assuntos (Chamados › Ajustes › Campos).` : undefined}>
                <EscolherComBusca valor={f.assuntoId} onChange={(v) => { mudar({ assuntoId: v }); tirarFalta('assunto'); }} opcoes={opcoesAssunto} vazio="Sem assunto (ainda)"
                  placeholder="Escolha o assunto…" procurar="Procurar pelo caminho (ex.: ramal config)…" className="input w-full" id="novo-assunto" rotulo="Assunto" largura="w-[520px]"
                  desativado={!opcoesAssunto.length} />
                {assunto && (assunto.descricao || assunto.checklist.length > 0) && (
                  <p className="text-[12.5px] text-muted mt-1">
                    {assunto.descricao && <>Quando usar: {assunto.descricao}</>}
                    {assunto.descricao && assunto.checklist.length > 0 && ' · '}
                    {assunto.checklist.length > 0 && <>traz {assunto.checklist.length} {assunto.checklist.length === 1 ? 'passo' : 'passos'} para o checklist</>}
                  </p>
                )}
              </Rotulado>}
              {usa('tipo') && painel.ajustes.tipos.length > 0 && (
                <Rotulado rotulo="Tipo" id="novo-tipo" grupo obrigatorio={pede('tipo')} falta={falta('tipo')} className="sm:col-span-2">
                  <Segmentos id="novo-tipo" rotulo="Tipo" valor={f.tipo} desmarcavel onChange={(v) => { mudar({ tipo: v }); tirarFalta('tipo'); }}
                    opcoes={painel.ajustes.tipos.map((t) => ({ id: t, nome: t }))} />
                </Rotulado>
              )}
            </div>}

            {usa('gravidade') && <Rotulado rotulo="Gravidade" id="novo-gravidade" grupo obrigatorio={pede('gravidade')} falta={falta('gravidade')}>
              <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 lg:grid-cols-3" role="radiogroup" aria-label="Gravidade" id="novo-gravidade">
                {GRAVIDADES.map((g) => {
                  const ativa = f.gravidade === g;
                  return (
                    <button key={g} type="button" role="radio" aria-checked={ativa} onClick={() => { mudar({ gravidade: ativa ? null : g }); tirarFalta('gravidade'); }}
                      className={`text-left rounded-lg border px-3 py-2 min-w-0 ${ativa ? 'border-accent bg-accent-soft' : 'border-line hover:bg-surface-2'}`}>
                      <span className={`block text-[13.5px] font-semibold ${ativa ? 'text-accent-ink' : 'text-ink'}`}>{NOME_GRAVIDADE[g]}</span>
                      <span className="block text-[12px] text-muted leading-snug">{DICA_GRAVIDADE[g]}</span>
                    </button>
                  );
                })}
              </div>
            </Rotulado>}

            {usa('alcance') && <Rotulado rotulo="Alcance" id="novo-alcance" grupo obrigatorio={pede('alcance')} falta={falta('alcance')} dica="Quantos o problema atinge no cliente.">
              <Segmentos<Alcance | ''> id="novo-alcance" rotulo="Alcance" valor={f.alcance ?? ''} desmarcavel onChange={(v) => { mudar({ alcance: v || null }); tirarFalta('alcance'); }}
                opcoes={ALCANCES.map((a) => ({ id: a, nome: NOME_ALCANCE[a] }))} />
            </Rotulado>}

            <Rotulado rotulo="Prioridade" id="novo-prioridade" grupo obrigatorio={pede('prioridade')} falta={falta('prioridade')}>
              <div className="rounded-lg border border-line bg-surface-2 p-3 flex flex-col gap-2" id="novo-prioridade">
                <div className="text-[13px] text-ink-2" aria-live="polite">
                  {sugerida
                    ? <>Sugerida: <b className="text-ink">{NOME_PRIORIDADE[sugerida]}</b> <span className="text-muted">({usa('alcance') && f.alcance ? `${NOME_GRAVIDADE[f.gravidade!]} × ${NOME_ALCANCE[f.alcance].toLowerCase()}` : `pela gravidade: ${NOME_GRAVIDADE[f.gravidade!]}`})</span></>
                    : <span className="text-muted">{!usa('gravidade') ? 'Escolha a prioridade (ela define o prazo).'
                      : usa('alcance') ? 'Escolha a gravidade e o alcance: o Gestor sugere a prioridade. Ou escolha direto.' : 'Escolha a gravidade: o Gestor sugere a prioridade. Ou escolha direto.'}</span>}
                </div>
                <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Prioridade">
                  {PRIORIDADES.map((p) => {
                    const ativa = prioridadeFinal === p;
                    return (
                      <button key={p} type="button" role="radio" aria-checked={ativa} title={DICA_PRIORIDADE[p]} onClick={() => escolherPrioridade(p)}
                        className={`inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-[13px] font-semibold ${ativa ? COR_PRIORIDADE[p] : 'border-line text-ink-2 hover:bg-surface'}`}>
                        {p === 'critica' && <Siren size={13} />}{NOME_PRIORIDADE[p]}
                        {p === sugerida && <span className="font-normal text-[11.5px] opacity-80">· sugerida</span>}
                      </button>
                    );
                  })}
                </div>
                {prioridadeFinal && <p className="text-[12px] text-muted">{NOME_PRIORIDADE[prioridadeFinal]}: {DICA_PRIORIDADE[prioridadeFinal].toLowerCase()}.</p>}
                {precisaMotivo && (
                  <div>
                    <label className="label" htmlFor="novo-motivo-prioridade">Por que {NOME_PRIORIDADE[f.prioridade!]} e não {NOME_PRIORIDADE[sugerida!]}? <span className="text-bad">*</span></label>
                    <textarea className="input min-h-[60px]" id="novo-motivo-prioridade" value={f.motivoPrioridade} maxLength={300}
                      placeholder="Ex.: o cliente tem um evento hoje à tarde" onChange={(e) => mudar({ motivoPrioridade: e.target.value })} />
                    <button type="button" className="link text-[12.5px] mt-1" onClick={() => mudar({ prioridade: null, motivoPrioridade: '' })}>Usar a sugerida ({NOME_PRIORIDADE[sugerida!]})</button>
                  </div>
                )}
              </div>
            </Rotulado>
          </div>
        </Secao>

        {/* ---------- os campos do painel (Ajustes › Campos) ---------- */}
        {camposDoPainel.length > 0 && (
          <Secao titulo={`Do painel ${painel.nome}`} dica="Os campos que a equipe criou para este painel.">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2" id="novo-campos-do-painel">
              {camposDoPainel.map((c) => (
                <CampoDoPainel key={c.id} c={c} valor={f.campos[c.id] ?? null} obrigatorio={pede(chaveDoCampo(c.id))} falta={falta(chaveDoCampo(c.id))}
                  onChange={(v) => { const campos = { ...f.campos }; if (v === null) delete campos[c.id]; else campos[c.id] = v; mudar({ campos }); tirarFalta(chaveDoCampo(c.id)); }} />
              ))}
            </div>
          </Secao>
        )}

        {/* ---------- produtos e operadoras ---------- */}
        {(usa('produtos') || usa('operadoras')) && <Secao titulo={usa('produtos') && usa('operadoras') ? 'Produtos e operadoras' : usa('produtos') ? 'Produtos' : 'Operadoras'}
          dica={f.clienteId ? 'Os do cliente aparecem primeiro; os outros vêm do catálogo.' : 'Escolha o cliente para ver primeiro os do cadastro dele.'}>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {usa('produtos') && <Rotulado rotulo="Produtos" id="novo-produtos" grupo obrigatorio={pede('produto')} falta={falta('produto')}>
              <EscolherVarios id="novo-produtos" rotulo="produto" valor={f.produtos} onChange={(v) => { mudar({ produtos: v }); tirarFalta('produto'); }}
                doCliente={(cadastro.data?.produtos ?? []).map((p) => ({ id: p.id, nome: p.nome }))}
                catalogo={opcoes.produtos.map((p) => ({ id: p.id, nome: p.nome }))} />
            </Rotulado>}
            {usa('operadoras') && <Rotulado rotulo="Operadoras" id="novo-operadoras" grupo obrigatorio={pede('operadora')} falta={falta('operadora')}>
              <EscolherVarios id="novo-operadoras" rotulo="operadora" valor={f.operadoras} onChange={(v) => { mudar({ operadoras: v }); tirarFalta('operadora'); }}
                doCliente={(cadastro.data?.operadoras ?? []).map((o) => ({ id: o.id, nome: o.nome }))}
                catalogo={opcoes.operadoras.map((o) => ({ id: o.id, nome: o.nome }))} />
            </Rotulado>}
          </div>
        </Secao>}

        {/* ---------- quem cuida ---------- */}
        <Secao titulo="Quem cuida">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Rotulado rotulo="Responsável" id="novo-responsavel" obrigatorio={pede('responsavel')} falta={falta('responsavel')}
              dica={f.responsavelId ? (f.responsavelId === user?.id ? 'Você fica com o chamado.' : 'A pessoa recebe o aviso de que o chamado é dela.') : 'O chamado fica na fila da entrada, para alguém assumir.'}>
              <EscolherComBusca valor={f.responsavelId} onChange={(v) => { mudar({ responsavelId: v }); tirarFalta('responsavel'); }} opcoes={opcoesResponsavel}
                vazio="Ninguém (fica na fila)" procurar="Procurar pessoa…" className="input w-full" id="novo-responsavel" rotulo="Responsável" />
            </Rotulado>
            {/* os observadores (o pedido do Luan na prévia: como no Helena, recebem toda atualização do chamado) */}
            <Rotulado rotulo="Observadores" id="novo-observadores" grupo dica="Recebem os avisos de tudo o que acontece no chamado: anotação, etapa, responsável, espera.">
              <EscolherVarios id="novo-observadores" rotulo="observador" valor={f.observadores} onChange={(v) => mudar({ observadores: v })}
                doCliente={[]} catalogo={pessoas.map((p) => ({ id: p.id, nome: p.nome, dica: p.id === user?.id ? 'você' : undefined }))} />
            </Rotulado>
            {/* o seletor de etiquetas (o pedido do Luan: no padrão das outras listas, e com o editar: o nome e a cor) */}
            <Rotulado rotulo="Etiquetas" id="novo-etiquetas" className="sm:col-span-2">
              <SeletorDeEtiquetas id="novo-etiquetas" valor={f.etiquetas} catalogo={opcoes.etiquetas} coresNovas={f.coresNovas} podeMudar podeEditar={pode.cuidar}
                onMudar={(v) => mudar({ etiquetas: v })}
                onCriar={(nome, cor) => mudar({ etiquetas: etiquetasUnicas([...f.etiquetas, nome]).slice(0, 20), coresNovas: { ...f.coresNovas, [chaveDaEtiqueta(nome)]: cor } })}
                onEditarLocal={(de, nome, cor) => {
                  const coresNovas = Object.fromEntries(Object.entries(f.coresNovas).filter(([k]) => k !== chaveDaEtiqueta(de)));
                  mudar({ etiquetas: etiquetasUnicas(f.etiquetas.map((e) => (chaveDaEtiqueta(e) === chaveDaEtiqueta(de) ? nome : e))), coresNovas: { ...coresNovas, [chaveDaEtiqueta(nome)]: cor } });
                }}
                onEditada={(de, para) => mudar({ etiquetas: etiquetasUnicas(f.etiquetas.map((e) => (chaveDaEtiqueta(e) === chaveDaEtiqueta(de) ? para : e))) })} />
            </Rotulado>
          </div>
        </Secao>

        {/* ---------- abrir (na janela, o botão fica sempre à vista, embaixo) ---------- */}
        <div className={`card p-4 flex flex-col gap-3 ${naJanela ? 'sticky -bottom-4 z-10' : ''}`} style={naJanela ? { boxShadow: '0 -8px 20px rgba(0,0,0,.08)' } : undefined}>
          {podeAvisar && (
            <label className="flex items-start gap-2.5 text-sm cursor-pointer">
              <input type="checkbox" className="mt-1 accent-[var(--accent)]" id="novo-avisar" checked={f.avisarCliente} onChange={(e) => mudar({ avisarCliente: e.target.checked })} />
              <span>
                Avisar o cliente pelo WhatsApp com o número do chamado
                <span className="block text-[12.5px] text-muted">Vai para {telefoneLegivel(foneValido)}{f.contatoNome.trim() ? ` (${f.contatoNome.trim()})` : ''}, pelo número oficial, com o modelo de mensagem dos Ajustes.</span>
              </span>
            </label>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <button type="submit" className="btn-primary" id="novo-abrir" disabled={enviando}>{enviando ? <Spinner className="text-white" /> : <Plus size={16} />} Abrir chamado</button>
            <button type="button" className="btn-ghost" onClick={cancelar}>Cancelar</button>
            <span className="text-[12.5px] text-muted">
              Nasce em <b className="text-ink-2">{painel.etapas.find((e) => e.tipo === 'entrada')?.nome ?? painel.etapas[0]?.nome ?? '—'}</b>, no painel {painel.nome}
              {prioridadeFinal ? <>, com a prioridade <b className="text-ink-2">{NOME_PRIORIDADE[prioridadeFinal]}</b></> : ''}.
            </span>
          </div>
          {erro && <p className="text-bad text-[13px]" role="alert" id="novo-erro">{erro}</p>}
        </div>
      </div>
    </form>
  );
}

// =====================================================================
//  AS PEÇAS DO FORMULÁRIO
// =====================================================================

function Secao({ titulo, dica, children }: { titulo: string; dica?: string; children: ReactNode }) {
  return (
    <section className="card p-4 sm:p-5 min-w-0">
      <h2 className="font-display font-semibold text-[15px]">{titulo}</h2>
      {dica && <p className="text-[12.5px] text-muted -mt-0.5">{dica}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}

/**
 * Um campo com o rótulo: o asterisco quando o painel pede o campo para abrir, e a marca vermelha
 * quando o servidor disse que ele faltou.
 */
function Rotulado({ rotulo, id, obrigatorio, falta, erro, dica, grupo = false, className = '', children }: {
  rotulo: string; id: string; obrigatorio?: boolean; falta?: boolean; erro?: string; dica?: string;
  /** um grupo de botões (o painel, a gravidade, os produtos): o título não é um <label> de campo */
  grupo?: boolean; className?: string; children: ReactNode;
}) {
  const texto = <>{rotulo}{obrigatorio && <span className="text-bad" title="Obrigatório para abrir"> *</span>}</>;
  return (
    <div className={`min-w-0 ${className}`}>
      {grupo ? <div className="label" id={`${id}-rotulo`}>{texto}</div> : <label className="label" htmlFor={id}>{texto}</label>}
      <div className={falta ? 'rounded-lg ring-2 ring-bad ring-offset-2 ring-offset-surface' : ''}>{children}</div>
      {falta ? <div className="text-bad text-[12.5px] mt-1">O painel pede este campo para abrir.</div>
        : erro ? <div className="text-bad text-[12.5px] mt-1">{erro}</div>
          : dica ? <div className="text-muted text-[12.5px] mt-1">{dica}</div> : null}
    </div>
  );
}

/**
 * Um campo do painel no formulário de abrir: o texto, o texto longo (na largura toda), o número, a data,
 * o sim ou não e as listas (até 8 opções, em botões; mais que isso, na caixa de escolher).
 */
function CampoDoPainel({ c, valor, obrigatorio, falta, onChange }: {
  c: CampoPersonalizado; valor: ValorDoCampo | null; obrigatorio: boolean; falta: boolean; onChange: (v: ValorDoCampo | null) => void;
}) {
  const id = `novo-campo-${c.id}`;
  const ativas = c.opcoes.filter((o) => o.ativa);
  const texto = typeof valor === 'string' ? valor : typeof valor === 'number' ? String(valor) : '';
  const comum = { rotulo: c.nome, id, obrigatorio, falta, dica: c.dica ?? undefined };
  switch (c.tipo) {
    case 'texto_longo':
      return (
        <Rotulado {...comum} className="sm:col-span-2">
          <textarea className="input min-h-[72px]" id={id} value={texto} maxLength={MAX_LETRAS_DO_CAMPO.texto_longo} onChange={(e) => onChange(e.target.value || null)} />
        </Rotulado>
      );
    case 'numero':
      return <Rotulado {...comum}><input className="input tnum" id={id} inputMode="decimal" value={texto} maxLength={30} placeholder="Ex.: 12,5" onChange={(e) => onChange(e.target.value || null)} /></Rotulado>;
    case 'data':
      return <Rotulado {...comum}><input className="input" id={id} type="date" value={texto} onChange={(e) => onChange(e.target.value || null)} /></Rotulado>;
    case 'sim_nao':
      return (
        <Rotulado {...comum} grupo>
          <Segmentos id={id} rotulo={c.nome} valor={valor === true ? 'sim' : valor === false ? 'nao' : ''} desmarcavel
            opcoes={[{ id: 'sim', nome: 'Sim' }, { id: 'nao', nome: 'Não' }]} onChange={(v) => onChange(v === 'sim' ? true : v === 'nao' ? false : null)} />
        </Rotulado>
      );
    case 'lista':
      return ativas.length <= 8 ? (
        <Rotulado {...comum} grupo className={ativas.length > 3 ? 'sm:col-span-2' : ''}>
          <Segmentos id={id} rotulo={c.nome} valor={texto} desmarcavel opcoes={ativas.map((o) => ({ id: o.id, nome: o.nome }))} onChange={(v) => onChange(v || null)} />
        </Rotulado>
      ) : (
        <Rotulado {...comum}>
          <select className="input" id={id} value={texto} onChange={(e) => onChange(e.target.value || null)}>
            <option value="">—</option>
            {ativas.map((o) => <option key={o.id} value={o.id}>{o.nome}</option>)}
          </select>
        </Rotulado>
      );
    case 'lista_varios': {
      const marcados = Array.isArray(valor) ? valor : [];
      return (
        <Rotulado {...comum} grupo className="sm:col-span-2">
          <div className="flex flex-wrap gap-1.5" role="group" aria-label={c.nome} id={id}>
            {ativas.map((o) => {
              const ativo = marcados.includes(o.id);
              return (
                <button key={o.id} type="button" aria-pressed={ativo} onClick={() => onChange(ativo ? marcados.filter((x) => x !== o.id) : [...marcados, o.id])}
                  className={`rounded-lg border px-3 py-1.5 text-[13.5px] ${ativo ? 'border-accent bg-accent-soft text-accent-ink font-semibold' : 'border-line text-ink-2 hover:bg-surface-2'}`}>
                  {o.nome}
                </button>
              );
            })}
          </div>
        </Rotulado>
      );
    }
    default:
      return <Rotulado {...comum}><input className="input" id={id} value={texto} maxLength={MAX_LETRAS_DO_CAMPO.texto} onChange={(e) => onChange(e.target.value || null)} /></Rotulado>;
  }
}

/** Botões lado a lado para escolher uma opção (o tipo, o alcance, o registro). */
function Segmentos<T extends string>({ id, rotulo, valor, opcoes, onChange, desmarcavel = false }: {
  id: string; rotulo: string; valor: T; opcoes: Array<{ id: T; nome: string; dica?: string }>; onChange: (v: T) => void; desmarcavel?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={rotulo} id={id}>
      {opcoes.map((o) => {
        const ativo = o.id === valor;
        return (
          <button key={o.id} type="button" role="radio" aria-checked={ativo} title={o.dica}
            onClick={() => onChange(ativo && desmarcavel ? ('' as T) : o.id)}
            className={`rounded-lg border px-3 py-1.5 text-[13.5px] ${ativo ? 'border-accent bg-accent-soft text-accent-ink font-semibold' : 'border-line text-ink-2 hover:bg-surface-2'}`}>
            {o.nome}
          </button>
        );
      })}
    </div>
  );
}

function AvisoTopo({ icone, children }: { icone: ReactNode; children: ReactNode }) {
  return <p className="text-[13px] rounded-lg bg-accent-soft text-accent-ink p-2.5 flex items-start gap-2"><span className="mt-0.5 shrink-0">{icone}</span><span>{children}</span></p>;
}

/** O pai (ou o incidente) que veio no endereço: o código, o título e o cliente, para conferir. */
function ChamadoLigado({ rotulo, icone, consulta, referencia, opcoes, dica, apagado = false }: {
  rotulo: string; icone: ReactNode; consulta: { data?: FichaChamado; isLoading: boolean; isError: boolean; error: unknown }; referencia: string; opcoes: OpcoesAtendimento; dica: string; apagado?: boolean;
}) {
  if (consulta.isLoading) return <div className="card p-3 text-[13px] text-muted flex items-center gap-2"><Spinner /> Procurando o {referencia.toUpperCase()}…</div>;
  if (consulta.isError || !consulta.data) {
    return <p className="text-[13px] rounded-lg bg-bad-soft text-bad p-2.5" role="alert">{rotulo} {referencia.toUpperCase()}: {mensagemErro(consulta.error)}. O chamado abre sem essa ligação.</p>;
  }
  const c = consulta.data;
  return (
    <div className={`card p-3 flex flex-col gap-1 ${apagado ? 'opacity-60' : ''}`}>
      <div className="flex flex-wrap items-center gap-2 text-[13px]">
        <span className="text-muted inline-flex items-center gap-1.5">{icone} {rotulo}</span>
        <CodigoChamado codigo={c.codigo} cor={painelDe(opcoes, c.painelId)?.cor} />
        <ChipSituacao s={c.situacao} />
        <span className="font-semibold text-ink min-w-0 break-words">{c.titulo}</span>
        {c.cliente && <span className="text-muted">· {c.cliente.nome}</span>}
      </div>
      <p className="text-[12px] text-muted">{dica}</p>
    </div>
  );
}

/**
 * Os chamados recentes do cliente (abertos, ou criados nos últimos 7 dias): o pedido do Luan — o
 * cliente que volta à tarde com o mesmo ramal reabre o chamado da manhã, em vez de abrir outro.
 */
function Recentes({ cadastro, carregando, erroCarregar, opcoes, reabrindo, erro, onReabrir, levaRelato, onAbrirOutro }: {
  cadastro: CadastroDoCliente | undefined; carregando: boolean; erroCarregar: string; opcoes: OpcoesAtendimento;
  reabrindo: string | null; erro: { id: string; msg: string } | null; onReabrir: (c: CartaoChamado) => void; levaRelato: boolean;
  /** na janela (o filho): abrir um recente fecha a janela antes (a ficha de baixo troca para ele) */
  onAbrirOutro?: (codigo: string) => void;
}) {
  if (carregando) return <div className="mt-3 text-[13px] text-muted flex items-center gap-2"><Spinner /> Procurando os chamados recentes deste cliente…</div>;
  if (erroCarregar) return <p className="mt-3 text-[13px] text-bad">{erroCarregar}</p>;
  const lista = cadastro?.recentes ?? [];
  if (!lista.length) return <p className="mt-3 text-[12.5px] text-muted">Nenhum chamado deste cliente aberto ou dos últimos 7 dias.</p>;
  return (
    <div className="mt-3 rounded-lg border border-signal bg-signal-soft p-3" id="novo-recentes">
      <div className="text-[13px] font-semibold text-ink">Chamados recentes deste cliente <span className="text-muted font-normal">— é o mesmo problema? Reabra em vez de abrir outro.</span></div>
      <ul className="mt-2 flex flex-col divide-y divide-line">
        {lista.map((c) => {
          const cor = painelDe(opcoes, c.painelId)?.cor;
          const etapa = etapaDe(opcoes, c.painelId, c.etapaId)?.nome;
          const fechado = c.situacao !== 'aberto';
          return (
            <li key={c.id} className="py-2 first:pt-0 last:pb-0 flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-3 min-w-0">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <CodigoChamado codigo={c.codigo} cor={cor} />
                  <ChipSituacao s={c.situacao} />
                  {etapa && paraBusca(etapa) !== paraBusca(NOME_SITUACAO_CHAMADO[c.situacao]) && <span className="text-[12px] text-muted">{etapa}</span>}
                </div>
                <div className="text-[13.5px] font-semibold text-ink mt-0.5 break-words">{c.titulo}</div>
                <div className="text-[12px] text-muted">
                  aberto {dataHoraCurta(c.criadoEm)} ({haQuanto(c.criadoEm)})
                  {c.fechadoEm ? ` · fechado ${dataHoraCurta(c.fechadoEm)}` : c.resolvidoEm ? ` · resolvido ${dataHoraCurta(c.resolvidoEm)}` : ''}
                  {c.contato?.nome ? ` · ${c.contato.nome}` : ''}
                  {c.responsavel ? ` · com ${c.responsavel.nome}` : ''}
                </div>
                {erro?.id === c.id && <p className="text-bad text-[12.5px] mt-1" role="alert">{erro.msg}</p>}
              </div>
              {fechado ? (
                <button type="button" className="btn-secondary btn-sm shrink-0 self-start sm:self-center" disabled={!!reabrindo} onClick={() => onReabrir(c)}
                  title={`Volta o ${c.codigo} para o atendimento com o motivo "${MOTIVO_REABRIR}"${levaRelato ? ', e o relato escrito aqui vai junto, como anotação' : ''}`}>
                  {reabrindo === c.id ? <Spinner /> : <RotateCcw size={14} />} Reabrir este em vez de abrir outro
                </button>
              ) : onAbrirOutro ? (
                <button type="button" className="btn-secondary btn-sm shrink-0 self-start sm:self-center" onClick={() => onAbrirOutro(c.codigo)}>Abrir este</button>
              ) : (
                <LinkDoChamado codigo={c.codigo} className="btn-secondary btn-sm shrink-0 self-start sm:self-center">Abrir este</LinkDoChamado>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/**
 * Os contatos do cliente no Abrir chamado: um clique preenche o nome e o WhatsApp (até 8, em botões; mais
 * que isso, na caixa de procurar). "Novo contato" abre a janela do contato e já o escolhe.
 */
function ContatosParaEscolher({ cliente, contatos, carregando, escolhido, onEscolher, onNovo, podeIncluir, className = '' }: {
  cliente: string; contatos: ContatoDoCliente[]; carregando: boolean; escolhido: string | null;
  onEscolher: (c: ContatoDoCliente) => void; onNovo: () => void; podeIncluir: boolean; className?: string;
}) {
  const novo = podeIncluir && (
    <button type="button" className="btn-ghost btn-sm" id="novo-contato-novo" onClick={onNovo}><UserRoundPlus size={14} /> Novo contato</button>
  );
  return (
    <div className={`min-w-0 ${className}`} id="novo-contatos">
      <div className="label" id="novo-contatos-rotulo">Contatos de {cliente}</div>
      {carregando ? <p className="text-[13px] text-muted flex items-center gap-2"><Spinner /> Procurando os contatos…</p>
        : !contatos.length ? (
          <div className="flex flex-wrap items-center gap-2 text-[13px] text-muted">{cliente} ainda não tem contatos cadastrados.{novo}</div>
        ) : contatos.length <= 8 ? (
          <div className="flex flex-wrap items-center gap-1.5" role="radiogroup" aria-labelledby="novo-contatos-rotulo">
            {contatos.map((c) => {
              const ativo = c.id === escolhido;
              return (
                <button key={c.id} type="button" role="radio" aria-checked={ativo} onClick={() => onEscolher(c)} title={c.whatsapp ? telefoneLegivel(c.whatsapp) : 'sem WhatsApp'}
                  className={`text-left rounded-lg border px-3 py-1.5 text-[13.5px] min-w-0 ${ativo ? 'border-accent bg-accent-soft text-accent-ink' : 'border-line text-ink-2 hover:bg-surface-2'}`}>
                  <span className={ativo ? 'font-semibold' : 'font-medium text-ink'}>{c.nome}</span>
                  {c.cargo && <span className="text-[12px] text-muted"> · {c.cargo}</span>}
                </button>
              );
            })}
            {novo}
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-1.5">
            <EscolherComBusca valor={escolhido ?? ''} onChange={(id) => { const c = contatos.find((x) => x.id === id); if (c) onEscolher(c); }}
              opcoes={contatos.map((c) => ({ id: c.id, nome: c.nome, dica: [c.cargo, c.whatsapp ? telefoneLegivel(c.whatsapp) : null].filter(Boolean).join(' · ') || undefined }))}
              placeholder="Escolha um contato…" procurar="Procurar contato…" className="input w-full sm:w-[360px]" rotulo={`Contatos de ${cliente}`} />
            {novo}
          </div>
        )}
    </div>
  );
}

/**
 * Vários de uma lista (os produtos, as operadoras): os do cliente aparecem para marcar com um
 * clique; os outros do catálogo, pelo "Outro do catálogo".
 */
function EscolherVarios({ id, rotulo, valor, onChange, doCliente, catalogo }: {
  id: string; rotulo: string; valor: string[]; onChange: (v: string[]) => void; doCliente: OpcaoBusca[]; catalogo: OpcaoBusca[];
}) {
  const nomes = new Map([...catalogo, ...doCliente].map((o) => [o.id, o.nome]));
  const doClienteIds = new Set(doCliente.map((o) => o.id));
  const sugeridos = doCliente.filter((o) => !valor.includes(o.id));
  const resto: OpcaoBusca[] = catalogo.filter((o) => !valor.includes(o.id)).map((o) => ({ ...o, dica: doClienteIds.has(o.id) ? 'do cliente' : o.dica }));
  return (
    <div className="flex flex-wrap items-center gap-1.5 min-h-[38px]" id={id}>
      {valor.map((v) => (
        <span key={v} className="chip bg-accent-soft text-accent-ink">
          {nomes.get(v) ?? v}
          <button type="button" onClick={() => onChange(valor.filter((x) => x !== v))} aria-label={`Tirar ${nomes.get(v) ?? v}`} className="hover:opacity-70"><X size={12} /></button>
        </span>
      ))}
      {sugeridos.map((o) => (
        <button key={o.id} type="button" onClick={() => onChange([...valor, o.id])} title={`Marcar ${o.nome} (do cliente)`}
          className="chip border border-dashed border-line-strong text-ink-2 hover:bg-surface-2 font-medium">
          <Plus size={12} /> {o.nome}
        </button>
      ))}
      {resto.length > 0 && (
        <EscolherComBusca valor="" opcoes={resto} onChange={(v) => v && onChange([...valor, v])} procurar={`Procurar ${rotulo}…`} rotulo={`Incluir ${rotulo}`}
          gatilho={(abrir) => (
            <button type="button" className="btn-ghost btn-sm text-muted" onClick={abrir}>
              <Plus size={13} /> {doCliente.length ? 'Outro do catálogo' : `Incluir ${rotulo}`} <ChevronDown size={13} />
            </button>
          )} />
      )}
      {!valor.length && !sugeridos.length && !resto.length && <span className="text-[12.5px] text-muted">Nada no cadastro.</span>}
    </div>
  );
}
