/**
 * Mover um chamado de etapa — o mesmo jeito no quadro (arrastar), na ficha e no Meu dia:
 *  - subir de nível (N1 → N2) é **escalonar**: pede o motivo e para quem (ou ninguém: fica na fila
 *    do nível); descer é **voltar de nível**, também com o motivo (o pedido do Miguel);
 *  - faltou o que a etapa pede (a solução, a causa…) ou o pai tem filhos em aberto: a janela diz o
 *    quê, e leva à ficha para preencher; quando só falta o responsável (sair do Novo sem ninguém, 2.2), a própria
 *    janela pergunta quem fica com o chamado e já move;
 *  - fechou: a comemoração (confete), que some sozinha e respeita quem pede menos movimento;
 *  - no painel de Vendas (2.0.1), o Ganho e o Perdido abrem a janela do resultado: o valor e o dia em
 *    que fechou, ou o motivo da perda — e o confete é do Ganho;
 *  - a implantação (2.3): a etapa que abre a implantação (a negociação) mostra antes o cliente (o do cadastro, ou o
 *    novo, com o CNPJ), os produtos e o card; a que liga no cadastro (o Implantado) mostra o que fica ativo na ficha
 *    do cliente. Nada trava além do CNPJ do cliente novo.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Building2, CheckCircle2, CircleDashed, Handshake, KanbanSquare, Package } from 'lucide-react';
import {
  FRASE_DO_MODULO, FRASE_DO_PRODUTO, cadastroMuda, cnpjEnquantoDigita, cnpjLimpo, movimentoDeNivel, nomeDoObrigatorio,
  type EtapaPainel, type FichaChamado, type NegociacaoNoFim, type OQueAEtapaFaz, type Painel, type PedidoDoCliente, type PessoaCurta, type PlanoDaImplantacao, type PlanoDoCadastro, type ValoresDosProdutos,
} from '@gestor/shared';
import { api } from '../../api/index.js';
import { ApiError } from '../../api/types.js';
import { Campo, EscolherComBusca, Modal, Spinner, mensagemErro, useToast } from '../../components/ui/index.js';
import { LinkDoChamado, ehDeVendas, painelDe, useDepoisDeMudar, useOpcoes } from './comum.js';
import { JanelaResultado, linhasDoValor, type ResultadoEscolhido } from './venda.js';

/** O que o mover precisa saber do chamado (a mensalidade, a ativação e o valor por produto: a janela do Ganho já vem com eles). */
export type Movivel = {
  id: string; codigo: string; painelId: string; etapaId: string; responsavel: PessoaCurta | null; valor?: number | null;
  ativacao?: number | null; produtos?: Array<{ id: string; nome: string }>; valoresDosProdutos?: ValoresDosProdutos; ativacoesDosProdutos?: ValoresDosProdutos;
};

type Escalonando = { c: Movivel; para: EtapaPainel; de: EtapaPainel | undefined; sentido: 'sobe' | 'desce' };
type Marcando = { c: Movivel; para: EtapaPainel; painel: Painel | undefined };
type Travado = { c: Movivel; para: EtapaPainel; mensagem: string; faltam: string[]; filhos: string[] };
/** A etapa que faz alguma coisa ao chegar (2.3): o que ela vai fazer, e onde o quadro soltou o cartão. */
type Etapando = { c: Movivel; para: EtapaPainel; lugar: { depoisDe?: string | null }; plano: OQueAEtapaFaz };
type Extra = {
  motivo?: string | null; responsavelId?: string | null; motivoPerda?: string | null; concluidoEm?: string | null; depoisDe?: string | null;
  implantacao?: PedidoDoCliente;
};

/** O confete do "fechou!" — sem biblioteca: uns papeizinhos que caem e somem. */
export function comemorar() {
  try {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    if (!document.getElementById('estilo-confete')) {
      const st = document.createElement('style');
      st.id = 'estilo-confete';
      st.textContent = '@keyframes cair-confete{0%{transform:translate3d(0,-10vh,0) rotate(0)}100%{transform:translate3d(var(--dx),105vh,0) rotate(var(--giro));opacity:.9}}';
      document.head.appendChild(st);
    }
    const caixa = document.createElement('div');
    caixa.setAttribute('aria-hidden', 'true');
    caixa.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:120;overflow:hidden';
    const cores = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#7c3aed'];
    for (let i = 0; i < 70; i++) {
      const p = document.createElement('span');
      const tam = 6 + Math.random() * 6;
      p.style.cssText = `position:absolute;top:0;left:${Math.random() * 100}vw;width:${tam}px;height:${tam * 0.45}px;background:${cores[i % cores.length]};border-radius:1px;`
        + `--dx:${(Math.random() - 0.5) * 30}vw;--giro:${(Math.random() - 0.5) * 1080}deg;animation:cair-confete ${1.4 + Math.random() * 1.2}s cubic-bezier(.2,.6,.4,1) ${Math.random() * 0.25}s forwards`;
      caixa.appendChild(p);
    }
    document.body.appendChild(caixa);
    window.setTimeout(() => caixa.remove(), 3200);
  } catch { /* enfeite: se não der, não faz falta */ }
}

/**
 * O hook do mover: `mover(chamado, etapaId)` faz tudo (pede o motivo quando é escalonar, mostra o que
 * falta, comemora o fechado); `janelas` vai uma vez na tela que usa. `depoisDe` (2.1): o quadro arrastou
 * para um lugar da coluna (onde vale a ordem à mão) — o cartão que fica logo acima; nulo, o alto.
 */
export function useMover(): { mover: (c: Movivel, etapaId: string, opcoes?: { depoisDe?: string | null }) => Promise<FichaChamado | null>; janelas: ReactNode; ocupado: string | null } {
  const opcoes = useOpcoes();
  const depois = useDepoisDeMudar();
  const toast = useToast();
  const [escalonando, setEscalonando] = useState<Escalonando | null>(null);
  const [travado, setTravado] = useState<Travado | null>(null);
  const [marcando, setMarcando] = useState<Marcando | null>(null);
  const [etapando, setEtapando] = useState<Etapando | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);

  const executar = useCallback(async (
    c: Movivel, para: EtapaPainel, extra: Extra = {},
    /** o servidor disse o que falta para abrir a implantação (o CNPJ): a janela continua aberta, com o plano novo */
    naImplantacao?: (plano: PlanoDaImplantacao, mensagem: string) => void,
  ): Promise<FichaChamado | null> => {
    setOcupado(c.id);
    try {
      const f = await depois(api.atendimento.mover(c.id, { etapaId: para.id, ...extra }));
      // o confete: o chamado que fechou; na negociação, só a ganha
      if (para.resultado ? para.resultado === 'ganho' : para.tipo === 'fechado') comemorar();
      // a negociação que abriu a implantação diz qual card nasceu
      const aberta = extra.implantacao && f.implantacoes.length ? f.implantacoes[f.implantacoes.length - 1] : null;
      toast.push('ok', `${c.codigo} foi para ${para.nome}${aberta ? ` e abriu ${aberta.codigo} em ${aberta.painel}` : ''}`);
      return f;
    } catch (e) {
      if (e instanceof ApiError && e.status === 400 && e.details && typeof e.details === 'object' && !Array.isArray(e.details)) {
        const d = e.details as { faltam?: string[]; filhos?: string[]; implantacao?: PlanoDaImplantacao };
        if (d.faltam?.length || d.filhos?.length) { setTravado({ c, para, mensagem: e.message, faltam: d.faltam ?? [], filhos: d.filhos ?? [] }); return null; }
        if (d.implantacao && naImplantacao) { naImplantacao(d.implantacao, e.message); return null; }
      }
      toast.push('erro', mensagemErro(e));
      return null;
    } finally {
      setOcupado(null);
    }
  }, [depois, toast]);

  const mover = useCallback(async (c: Movivel, etapaId: string, lugar: { depoisDe?: string | null } = {}) => {
    if (etapaId === c.etapaId) return null;
    const painel = painelDe(opcoes.data, c.painelId);
    const para = painel?.etapas.find((e) => e.id === etapaId);
    if (!para) return null;
    const de = painel?.etapas.find((e) => e.id === c.etapaId);
    // o Ganho e o Perdido pedem o resultado (o valor e o dia, ou o motivo)
    if (para.resultado) { setMarcando({ c, para, painel }); return null; }
    const ondeSoltou = lugar.depoisDe !== undefined ? { depoisDe: lugar.depoisDe } : {};
    // a etapa que abre a implantação ou liga no cadastro (2.3): a janela mostra antes o que vai acontecer (a negociação que já
    // abriu o card, e o Implantado que não muda nada no cadastro, vão direto)
    if (painel && ((painel.tipo === 'vendas' && para.abreImplantacao) || (painel.tipo !== 'vendas' && para.ligaNoCadastro))) {
      setOcupado(c.id);
      let plano: OQueAEtapaFaz;
      try { plano = await api.atendimento.aoMover(c.id, { etapaId: para.id }); } catch (e) { toast.push('erro', mensagemErro(e)); setOcupado(null); return null; }
      setOcupado(null);
      const abre = !!plano.implantacao && !plano.implantacao.jaAberta;
      // o Implantado que leva a negociação para o Implantado do Comercial também mostra antes
      const liga = !!plano.cadastro && (!plano.cadastro.cliente || cadastroMuda(plano.cadastro) || !!plano.negociacao);
      if (abre || liga) { setEtapando({ c, para, lugar: ondeSoltou, plano }); return null; }
    }
    const sentido = movimentoDeNivel(de, para);
    if (sentido) { setEscalonando({ c, para, de, sentido }); return null; }
    return executar(c, para, ondeSoltou);
  }, [opcoes.data, executar, toast]);

  /** O resultado escolhido na janela: a mensalidade e a ativação que mudaram vão antes (ficam no histórico), depois o movimento. */
  const marcar = useCallback(async (m: Marcando, r: ResultadoEscolhido) => {
    if (r.valor !== undefined || r.ativacao !== undefined) {
      try {
        await depois(api.atendimento.alterar(m.c.id, { ...(r.valor !== undefined ? { valor: r.valor } : {}), ...(r.ativacao !== undefined ? { ativacao: r.ativacao } : {}) }));
      } catch (e) { toast.push('erro', mensagemErro(e)); return; }
    }
    setMarcando(null);
    await executar(m.c, m.para, { motivoPerda: r.motivoPerda, concluidoEm: r.concluidoEm });
  }, [depois, executar, toast]);

  const janelas = (
    <>
      {escalonando && <JanelaEscalonar e={escalonando} pessoas={opcoes.data?.pessoas.filter((p) => p.ativo) ?? []} onFechar={() => setEscalonando(null)}
        onConfirmar={async (motivo, responsavelId) => { const e = escalonando; setEscalonando(null); await executar(e.c, e.para, { motivo, responsavelId }); }} />}
      {travado && <JanelaTravado t={travado} onFechar={() => setTravado(null)} pessoas={opcoes.data?.pessoas.filter((p) => p.ativo) ?? []}
        onComResponsavel={async (responsavelId) => { const t = travado; setTravado(null); await executar(t.c, t.para, { responsavelId }); }} />}
      {etapando?.plano.implantacao && <JanelaDaImplantacao e={etapando} plano={etapando.plano.implantacao} onFechar={() => setEtapando(null)}
        onConfirmar={async (pedido, naoFoi) => {
          const e = etapando;
          const f = await executar(e.c, e.para, { ...e.lugar, implantacao: pedido }, naoFoi);
          if (f) setEtapando(null);
        }} />}
      {etapando?.plano.cadastro && !etapando.plano.implantacao && <JanelaDoCadastro e={etapando} plano={etapando.plano.cadastro} negociacao={etapando.plano.negociacao} onFechar={() => setEtapando(null)}
        onConfirmar={async () => { const e = etapando; setEtapando(null); await executar(e.c, e.para, e.lugar); }} />}
      {marcando && <JanelaResultado codigo={marcando.c.codigo} valor={marcando.c.valor} para={marcando.para} painel={marcando.painel}
        ativacao={marcando.c.ativacao ?? null} porProduto={linhasDoValor(marcando.c.produtos ?? [], marcando.c.valoresDosProdutos, marcando.c.ativacoesDosProdutos)}
        onFechar={() => setMarcando(null)} onConfirmar={(r) => marcar(marcando, r)} />}
    </>
  );
  return { mover, janelas, ocupado };
}

function JanelaEscalonar({ e, pessoas, onFechar, onConfirmar }: { e: Escalonando; pessoas: PessoaCurta[]; onFechar: () => void; onConfirmar: (motivo: string, responsavelId: string | null) => Promise<void> }) {
  const [motivo, setMotivo] = useState('');
  // escalonar: por padrão, ninguém (o chamado fica na fila do nível); voltar: por padrão, quem estava com ele
  const [para, setPara] = useState<string>(e.sentido === 'desce' ? e.c.responsavel?.id ?? '' : '');
  const [indo, setIndo] = useState(false);
  const texto = useRef<HTMLTextAreaElement>(null);
  const sobe = e.sentido === 'sobe';
  const titulo = sobe ? `Escalonar ${e.c.codigo} para ${e.para.nome}` : `Voltar ${e.c.codigo} para ${e.para.nome}`;
  const confirmar = async () => { if (!motivo.trim()) { texto.current?.focus(); return; } setIndo(true); try { await onConfirmar(motivo.trim(), para || null); } finally { setIndo(false); } };
  return (
    <Modal open onClose={onFechar} titulo={titulo}
      rodape={<><button className="btn-secondary" onClick={onFechar}>Cancelar</button><button className="btn-primary" disabled={!motivo.trim() || indo} onClick={confirmar}>{indo ? <Spinner className="text-white" /> : sobe ? 'Escalonar' : 'Voltar de nível'}</button></>}>
      <p className="text-sm text-ink-2 mb-3">
        {e.de?.nome ?? '?'} → <b>{e.para.nome}</b>. {sobe ? 'O motivo fica na trajetória do chamado, para quem pegar no próximo nível.' : 'O motivo fica na trajetória do chamado.'}
      </p>
      <Campo label={sobe ? 'Por que precisa do próximo nível?' : 'Por que volta de nível?'}>
        <textarea ref={texto} className="input min-h-[84px]" autoFocus value={motivo} onChange={(ev) => setMotivo(ev.target.value)} placeholder={sobe ? 'Ex.: precisa de acesso ao SBC e contato com a operadora' : 'Ex.: o N2 já ajustou o SBC; falta testar com o cliente'} />
      </Campo>
      <Campo label="Para quem" className="mt-3" dica={sobe && !para ? `Sem ninguém, o chamado fica na fila do ${e.para.nome} e quem a etapa avisa recebe o aviso.` : undefined}>
        <EscolherComBusca valor={para} onChange={setPara} vazio={sobe ? `Ninguém por enquanto (fila do ${e.para.nome})` : 'Ninguém'} opcoes={pessoas.map((p) => ({ id: p.id, nome: p.nome }))} className="input w-full" rotulo="Para quem" procurar="Procurar pessoa…" />
      </Campo>
    </Modal>
  );
}

function JanelaTravado({ t, onFechar, pessoas, onComResponsavel }: { t: Travado; onFechar: () => void; pessoas: PessoaCurta[]; onComResponsavel: (id: string) => void }) {
  const opcoes = useOpcoes();
  const vendas = ehDeVendas(opcoes.data, t.c.painelId);
  // só falta o responsável (sair do Novo sem ninguém, 2.2): escolher aqui mesmo e mover de uma vez
  const soOResponsavel = t.faltam.length === 1 && t.faltam[0] === 'responsavel' && !t.filhos.length;
  const [quem, setQuem] = useState('');
  return (
    <Modal open onClose={onFechar} titulo={`${t.c.codigo} ainda não pode ir para ${t.para.nome}`}
      rodape={soOResponsavel ? (
        <><button className="btn-secondary" onClick={onFechar}>Cancelar</button>
          <button className="btn-primary" id="travado-com-responsavel" disabled={!quem} onClick={() => onComResponsavel(quem)}>Mover para {t.para.nome}</button></>
      ) : <><button className="btn-secondary" onClick={onFechar}>Entendi</button><LinkDoChamado codigo={t.c.codigo} className="btn-primary" onClick={onFechar}>{vendas ? 'Abrir a negociação' : 'Abrir o chamado'}</LinkDoChamado></>}>
      {soOResponsavel && (
        <div className="mb-1">
          <p className="text-sm text-ink-2 mb-3">Para sair de <b>{opcoes.data && painelDe(opcoes.data, t.c.painelId)?.etapas.find((e) => e.id === t.c.etapaId)?.nome || 'Novo'}</b>, o chamado precisa de um responsável.</p>
          <Campo label="Quem fica com o chamado?">
            <EscolherComBusca valor={quem} onChange={setQuem} placeholder="Escolha a pessoa…" opcoes={pessoas.map((p) => ({ id: p.id, nome: p.nome }))} className="input w-full" rotulo="Quem fica com o chamado" procurar="Procurar pessoa…" autoFocus />
          </Campo>
        </div>
      )}
      {t.faltam.length > 0 && !soOResponsavel && (
        <div className="mb-3">
          <p className="text-sm text-ink-2 mb-2">Para ir para <b>{t.para.nome}</b>, falta preencher:</p>
          <ul className="flex flex-wrap gap-1.5">{t.faltam.map((f) => <li key={f} className="chip bg-signal-soft text-signal">{nomeDoObrigatorio(f, opcoes.data?.campos)}</li>)}</ul>
        </div>
      )}
      {t.filhos.length > 0 && (
        <div>
          <p className="text-sm text-ink-2 mb-2">Os filhos em aberto precisam fechar antes:</p>
          <ul className="flex flex-wrap gap-1.5">{t.filhos.map((f) => <li key={f}><LinkDoChamado className="chip bg-surface-2 text-ink-2 font-mono hover:text-accent" codigo={f} onClick={onFechar}>{f}</LinkDoChamado></li>)}</ul>
        </div>
      )}
      {!t.faltam.length && !t.filhos.length && <p className="text-sm text-ink-2">{t.mensagem}</p>}
    </Modal>
  );
}

// =====================================================================
//  A IMPLANTAÇÃO (2.3): o que a etapa vai fazer, antes de mover
// =====================================================================

/** Uma linha da janela: o ícone, o título e o que vai acontecer. */
function LinhaDoPlano({ icone, titulo, children }: { icone: ReactNode; titulo: ReactNode; children: ReactNode }) {
  return (
    <div className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
      <span className="text-muted mt-0.5 shrink-0" aria-hidden>{icone}</span>
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-semibold mb-1">{titulo}</p>
        {children}
      </div>
    </div>
  );
}

const diaComAno = (dia: string) => dia.split('-').reverse().join('/');

/**
 * A negociação que vai para a etapa que abre a implantação: o cliente (o que ela já tem; o do cadastro achado pelo CNPJ;
 * ou o novo, com o nome e o CNPJ — o que o cadastro exige), os produtos que entram no cadastro (sem a data: estão em
 * implantação) e o card que nasce. O plano é refeito no servidor a cada mudança (o CNPJ que já é de um cliente).
 */
function JanelaDaImplantacao({ e, plano: inicial, onFechar, onConfirmar }: {
  e: Etapando; plano: PlanoDaImplantacao; onFechar: () => void;
  onConfirmar: (pedido: PedidoDoCliente, naoFoi: (plano: PlanoDaImplantacao, mensagem: string) => void) => Promise<void>;
}) {
  const [plano, setPlano] = useState(inicial);
  const novo = inicial.cliente.tipo === 'novo' ? inicial.cliente : null;
  // a negociação sem cliente: o novo (escrito aqui) ou um do cadastro (escolhido aqui)
  const semCliente = inicial.cliente.tipo === 'novo' || inicial.cliente.peloCnpj;
  // achado: o cliente do cadastro com o CNPJ que a negociação já tem (o campo CNPJ)
  const [modo, setModo] = useState<'novo' | 'escolher' | 'achado'>(inicial.cliente.tipo === 'cadastro' ? 'achado' : 'novo');
  const [nomeFantasia, setNomeFantasia] = useState(novo?.nomeFantasia ?? '');
  const [razaoSocial, setRazaoSocial] = useState(novo?.razaoSocial ?? '');
  const [cnpj, setCnpj] = useState(novo?.cnpj ? cnpjEnquantoDigita(novo.cnpj) : '');
  const [clienteId, setClienteId] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [indo, setIndo] = useState(false);
  const clientes = useQuery({ queryKey: ['client-options'], queryFn: () => api.clients.options(), staleTime: 5 * 60_000, enabled: semCliente });
  const opcoesClientes = useMemo(() => (clientes.data ?? []).map((x) => ({ id: x.id, nome: x.name })), [clientes.data]);

  const pedido: PedidoDoCliente = !semCliente || modo === 'achado' ? {}
    : modo === 'escolher' ? (clienteId ? { clienteId } : {})
      : { nomeFantasia: nomeFantasia.trim(), razaoSocial: razaoSocial.trim(), cnpj: cnpjLimpo(cnpj) };
  const chave = JSON.stringify(pedido);
  // o plano de novo, um pouco depois de parar de escrever (o CNPJ que já é de um cliente, o que ainda falta)
  useEffect(() => {
    if (!semCliente) return;
    let vale = true;
    const t = window.setTimeout(() => {
      api.atendimento.aoMover(e.c.id, { etapaId: e.para.id, ...JSON.parse(chave) as PedidoDoCliente })
        .then((r) => { if (vale && r.implantacao) setPlano(r.implantacao); })
        .catch(() => { /* fica o plano de antes; o mover diz o que for */ });
    }, 350);
    return () => { vale = false; window.clearTimeout(t); };
  }, [chave, semCliente, e.c.id, e.para.id]);

  const escolhendo = semCliente && modo === 'escolher';
  // o CNPJ pela metade (ainda digitando): só diz quantos números faltam, sem o vermelho
  const digitos = cnpjLimpo(cnpj).length;
  const digitando = semCliente && modo === 'novo' && digitos > 0 && digitos < 14;
  const falta = escolhendo && !clienteId ? 'Escolha o cliente do cadastro.'
    : digitando ? `${14 - digitos === 1 ? 'Falta 1 número' : `Faltam ${14 - digitos} números`} no CNPJ.` : plano.falta;
  const confirmar = async () => {
    if (falta) return;
    setIndo(true); setErro(null);
    try { await onConfirmar(pedido, (p, mensagem) => { setPlano(p); setErro(mensagem); }); } finally { setIndo(false); }
  };
  const c = plano.cliente;
  return (
    <Modal open onClose={onFechar} largura="max-w-xl" titulo={`Abrir a implantação: ${e.c.codigo} vai para ${e.para.nome}`}
      rodape={<>
        <button className="btn-secondary" onClick={onFechar}>Cancelar</button>
        <button className="btn-primary" id="mover-abrir-implantacao" disabled={!!falta || indo} onClick={() => void confirmar()}>
          {indo ? <Spinner className="text-white" /> : 'Mover e abrir a implantação'}
        </button>
      </>}>
      <p className="text-sm text-ink-2 mb-3">
        Em <b>{e.para.nome}</b>, a negociação abre o card no painel <b>{plano.painel.nome}</b>, na etapa {plano.etapa}. O Ganho continua sendo marcado à parte, quando começar a faturar.
      </p>
      <div className="flex flex-col divide-y divide-line">
        <LinhaDoPlano icone={<Building2 size={16} />} titulo="O cliente">
          {!semCliente && c.tipo === 'cadastro' && <p className="text-[13.5px]"><b>{c.nome}</b> <span className="text-muted">— já está no cadastro de clientes.</span></p>}
          {semCliente && modo === 'achado' && c.tipo === 'cadastro' && (
            <p className="text-[13.5px]">
              <b>{c.nome}</b> <span className="text-muted">— achado no cadastro pelo CNPJ da negociação.</span>{' '}
              <button type="button" className="link text-[12.5px]" onClick={() => setModo('escolher')}>Escolher outro cliente</button>
            </p>
          )}
          {semCliente && modo !== 'achado' && (
            <>
              <div className="inline-flex rounded-md border border-line p-0.5 mb-2.5 text-[12.5px]" role="tablist" aria-label="De onde vem o cliente">
                <button type="button" role="tab" aria-selected={modo === 'novo'} className={`px-2.5 py-1 rounded ${modo === 'novo' ? 'bg-surface-2 font-semibold' : 'text-muted'}`} onClick={() => setModo('novo')}>Criar o cliente</button>
                <button type="button" role="tab" aria-selected={modo === 'escolher'} className={`px-2.5 py-1 rounded ${modo === 'escolher' ? 'bg-surface-2 font-semibold' : 'text-muted'}`} onClick={() => setModo('escolher')}>Já está no cadastro</button>
              </div>
              {modo === 'novo' ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <Campo label="Nome fantasia"><input className="input" id="implantacao-nome" value={nomeFantasia} maxLength={120} onChange={(ev) => setNomeFantasia(ev.target.value)} /></Campo>
                  <Campo label="CNPJ"><input className="input font-mono" id="implantacao-cnpj" value={cnpj} inputMode="numeric" maxLength={18} placeholder="00.000.000/0000-00"
                    onChange={(ev) => setCnpj(cnpjEnquantoDigita(ev.target.value))} /></Campo>
                  <Campo label="Razão social" className="sm:col-span-2"><input className="input" id="implantacao-razao" value={razaoSocial} maxLength={200} onChange={(ev) => setRazaoSocial(ev.target.value)} /></Campo>
                </div>
              ) : (
                <EscolherComBusca valor={clienteId} onChange={setClienteId} opcoes={opcoesClientes} placeholder={clientes.isLoading ? 'Carregando os clientes…' : 'Escolha o cliente…'}
                  procurar="Procurar cliente…" className="input w-full" rotulo="O cliente do cadastro" largura="w-[420px]" />
              )}
              {c.tipo === 'cadastro' && c.peloCnpj && modo === 'novo' && (
                <p className="text-[12.5px] mt-2 rounded-md bg-ok-soft text-ok px-2 py-1.5">Este CNPJ já é do cliente <b>{c.nome}</b>: o card abre para ele (nenhum cliente novo).</p>
              )}
              {c.tipo === 'novo' && modo === 'novo' && !c.erro && <p className="text-[12px] text-muted mt-1.5">Entra no cadastro de clientes com a unidade Matriz, e a negociação passa a ser dele.</p>}
            </>
          )}
        </LinhaDoPlano>
        <LinhaDoPlano icone={<Package size={16} />} titulo="Os produtos">
          {plano.produtos.length ? (
            <ul className="flex flex-col gap-1 text-[13.5px]">
              {plano.produtos.map((p) => (
                <li key={p.id}><b>{p.nome}</b> <span className="text-muted">— {p.jaNoCadastro ? 'já está no cadastro do cliente: fica como está' : 'entra no cadastro do cliente, em implantação (a data de ativação vem no Implantado)'}</span></li>
              ))}
            </ul>
          ) : <p className="text-[13px] text-muted">A negociação não tem produtos: o card abre sem as partes de cada produto (dá para pôr os produtos nele depois).</p>}
        </LinhaDoPlano>
        <LinhaDoPlano icone={<KanbanSquare size={16} />} titulo="O card">
          <p className="text-[13.5px]"><b>{plano.titulo}</b> <span className="text-muted">— em {plano.painel.nome} › {plano.etapa}, com o contato da negociação. Quem cuida da negociação acompanha o card como observador.</span></p>
        </LinhaDoPlano>
      </div>
      {(falta || erro) && <p role={digitando ? undefined : 'alert'} className={`${digitando ? 'text-muted' : 'text-bad'} text-[13px] mt-3`}>{falta ?? erro}</p>}
    </Modal>
  );
}

/** O card que vai para a etapa que liga no cadastro (o Implantado): o que fica ativo na ficha do cliente, desde hoje. */
function JanelaDoCadastro({ e, plano, negociacao, onFechar, onConfirmar }: {
  e: Etapando; plano: PlanoDoCadastro; negociacao: NegociacaoNoFim | null; onFechar: () => void; onConfirmar: () => Promise<void>;
}) {
  const [indo, setIndo] = useState(false);
  const confirmar = async () => { setIndo(true); try { await onConfirmar(); } finally { setIndo(false); } };
  const icone = (muda: boolean) => (muda ? <CheckCircle2 size={14} className="text-ok shrink-0 mt-0.5" aria-hidden /> : <CircleDashed size={14} className="text-muted shrink-0 mt-0.5" aria-hidden />);
  return (
    <Modal open onClose={onFechar} largura="max-w-xl" titulo={`${e.c.codigo} vai para ${e.para.nome}`}
      rodape={<>
        <button className="btn-secondary" onClick={onFechar}>Cancelar</button>
        <button className="btn-primary" id="mover-ligar-cadastro" disabled={indo} onClick={() => void confirmar()}>
          {indo ? <Spinner className="text-white" /> : plano.cliente ? (cadastroMuda(plano) ? 'Mover e ligar no cadastro' : `Mover para ${e.para.nome}`) : 'Mover mesmo assim'}
        </button>
      </>}>
      {!plano.cliente ? (
        <p className="text-sm text-ink-2">O card não tem cliente: nada liga no cadastro. Ponha o cliente no card antes, para {e.para.nome} ligar os produtos e os módulos na ficha dele.</p>
      ) : (
        <>
          <p className="text-sm text-ink-2 mb-3">Em <b>{e.para.nome}</b>, a ficha de <b>{plano.cliente.nome}</b> fica assim, desde {diaComAno(plano.dia)}:</p>
          <div className="flex flex-col divide-y divide-line">
            <LinhaDoPlano icone={<Package size={16} />} titulo="Os produtos">
              {plano.produtos.length ? (
                <ul className="flex flex-col gap-1 text-[13.5px]">
                  {plano.produtos.map((p) => <li key={p.id} className="flex items-start gap-1.5">{icone(p.acao === 'novo' || p.acao === 'ativa')}<span><b>{p.nome}</b> <span className="text-muted">— {p.semData && p.acao === 'novo' ? 'entra no cadastro (sem a data de ativação: a data é a de cada aparelho)' : p.semData && p.acao === 'ja_ativo' ? 'já está no cadastro: fica como está' : FRASE_DO_PRODUTO[p.acao]}</span></span></li>)}
                </ul>
              ) : <p className="text-[13px] text-muted">O card não tem produtos.</p>}
            </LinhaDoPlano>
            <LinhaDoPlano icone={<CheckCircle2 size={16} />} titulo="Os módulos">
              {plano.modulos.length ? (
                <ul className="flex flex-col gap-1 text-[13.5px]">
                  {plano.modulos.map((m) => <li key={m.id} className="flex items-start gap-1.5">{icone(m.acao === 'liga')}<span><b>{m.nome}</b> <span className="text-muted">({m.produto}) — {FRASE_DO_MODULO[m.acao]}</span></span></li>)}
                </ul>
              ) : <p className="text-[13px] text-muted">Nenhum módulo marcado no card (o campo Módulos a ativar).</p>}
            </LinhaDoPlano>
          </div>
        </>
      )}
      {negociacao && (
        <div className="mt-3 pt-3 border-t border-line">
          <LinhaDoPlano icone={<Handshake size={16} />} titulo="A negociação">
            <p className="text-[13.5px] flex items-start gap-1.5">{icone(true)}<span><b className="font-mono">{negociacao.codigo}</b> <span className="text-muted">— vai de {negociacao.de} para <b className="text-ink-2">{negociacao.para}</b>, no Comercial. O Ganho continua à parte, quando começar a faturar.</span></span></p>
          </LinhaDoPlano>
        </div>
      )}
    </Modal>
  );
}
