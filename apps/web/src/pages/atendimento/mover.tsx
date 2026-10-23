/**
 * Mover um chamado de etapa — o mesmo jeito no quadro (arrastar), na ficha e no Meu dia:
 *  - subir de nível (N1 → N2) é **escalonar**: pede o motivo e para quem (ou ninguém: fica na fila
 *    do nível); descer é **voltar de nível**, também com o motivo (o pedido do Miguel);
 *  - faltou o que a etapa pede (a solução, a causa…) ou o pai tem filhos em aberto: a janela diz o
 *    quê, e leva à ficha para preencher;
 *  - fechou: a comemoração (confete), que some sozinha e respeita quem pede menos movimento;
 *  - no painel de Vendas (2.0.1), o Ganho e o Perdido abrem a janela do resultado: o valor e o dia em
 *    que fechou, ou o motivo da perda — e o confete é do Ganho.
 */
import { useCallback, useRef, useState, type ReactNode } from 'react';
import { movimentoDeNivel, nomeDoObrigatorio, type EtapaPainel, type FichaChamado, type Painel, type PessoaCurta, type ValoresDosProdutos } from '@gestor/shared';
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
  const [ocupado, setOcupado] = useState<string | null>(null);

  const executar = useCallback(async (
    c: Movivel, para: EtapaPainel,
    extra: { motivo?: string | null; responsavelId?: string | null; motivoPerda?: string | null; concluidoEm?: string | null; depoisDe?: string | null } = {},
  ): Promise<FichaChamado | null> => {
    setOcupado(c.id);
    try {
      const f = await depois(api.atendimento.mover(c.id, { etapaId: para.id, ...extra }));
      // o confete: o chamado que fechou; na negociação, só a ganha
      if (para.resultado ? para.resultado === 'ganho' : para.tipo === 'fechado') comemorar();
      toast.push('ok', `${c.codigo} foi para ${para.nome}`);
      return f;
    } catch (e) {
      if (e instanceof ApiError && e.status === 400 && e.details && typeof e.details === 'object' && !Array.isArray(e.details)) {
        const d = e.details as { faltam?: string[]; filhos?: string[] };
        if (d.faltam?.length || d.filhos?.length) { setTravado({ c, para, mensagem: e.message, faltam: d.faltam ?? [], filhos: d.filhos ?? [] }); return null; }
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
    const sentido = movimentoDeNivel(de, para);
    if (sentido) { setEscalonando({ c, para, de, sentido }); return null; }
    return executar(c, para, lugar.depoisDe !== undefined ? { depoisDe: lugar.depoisDe } : {});
  }, [opcoes.data, executar]);

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
      {travado && <JanelaTravado t={travado} onFechar={() => setTravado(null)} />}
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

function JanelaTravado({ t, onFechar }: { t: Travado; onFechar: () => void }) {
  const opcoes = useOpcoes();
  const vendas = ehDeVendas(opcoes.data, t.c.painelId);
  return (
    <Modal open onClose={onFechar} titulo={`${t.c.codigo} ainda não pode ir para ${t.para.nome}`}
      rodape={<><button className="btn-secondary" onClick={onFechar}>Entendi</button><LinkDoChamado codigo={t.c.codigo} className="btn-primary" onClick={onFechar}>{vendas ? 'Abrir a negociação' : 'Abrir o chamado'}</LinkDoChamado></>}>
      {t.faltam.length > 0 && (
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
