/**
 * As janelas das ações da ficha: esperar (o cliente ou a operadora, com o motivo), avisar o cliente
 * pelo WhatsApp, ligar a outro chamado, escolher o pai, o problema ou um incidente, trocar de painel e
 * reabrir. (A resposta pronta saiu no 2.0.1: o LineChat já tem as respostas rápidas.)
 *
 * Cada janela só existe enquanto está aberta (o estado nasce no `useState`), e o erro aparece ali
 * dentro, perto do botão que confirma.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { MessageCircle, Search } from 'lucide-react';
import {
  etapaAoReabrir, etapaDeEntrada, lerCodigo, mensagemPreenchida, NOME_ESPERA, NOME_LIGACAO, NOME_SITUACAO_CHAMADO,
  type CartaoChamado, type FichaChamado, type TipoEspera, type TipoLigacaoChamado,
} from '@gestor/shared';
import { api } from '../../../api/index.js';
import { Campo, Confirmar, Modal, Spinner } from '../../../components/ui/index.js';
import { painelDe, telefoneLegivel, useAbrirChamado } from '../comum.js';
import { NovoChamadoNaJanela } from '../Novo.js';
import { BalaoDeMensagem } from '../ajustes/Avisos.js';
import { ErroPerto, nomeComNivel, useAberta, useAcao } from './base.js';

/** Os botões do rodapé: Cancelar e o que confirma (com a rodinha enquanto vai). */
function Rodape({ onFechar, ocupado, desativado, botao, onConfirmar, perigoso = false }: { onFechar: () => void; ocupado: boolean; desativado?: boolean; botao: ReactNode; onConfirmar: () => void; perigoso?: boolean }) {
  return (
    <>
      <button type="button" className="btn-secondary" onClick={onFechar}>Cancelar</button>
      <button type="button" className={perigoso ? 'btn-danger' : 'btn-primary'} disabled={ocupado || desativado} onClick={onConfirmar}>{ocupado ? <Spinner className="text-white" /> : botao}</button>
    </>
  );
}

// =====================================================================
//  ESPERAR
// =====================================================================

export function JanelaEsperar({ tipo, onFechar }: { tipo: TipoEspera; onFechar: () => void }) {
  const { f } = useAberta();
  const acao = useAcao();
  const [motivo, setMotivo] = useState('');
  const texto = useRef<HTMLTextAreaElement>(null);
  const confirmar = async () => {
    if (!motivo.trim()) { acao.setErro('Diga o motivo da espera.'); texto.current?.focus(); return; }
    const r = await acao.rodar(() => api.atendimento.esperar(f.id, { tipo, motivo: motivo.trim() }), `${f.codigo}: ${NOME_ESPERA[tipo].toLowerCase()}`);
    if (r.ok) onFechar();
  };
  return (
    <Modal open onClose={onFechar} titulo={`${NOME_ESPERA[tipo]} — ${f.codigo}`}
      rodape={<Rodape onFechar={onFechar} ocupado={acao.ocupado} botao="Marcar a espera" onConfirmar={confirmar} />}>
      <p className="text-sm text-ink-2 mb-3">
        {tipo === 'cliente'
          ? 'Enquanto o chamado espera o cliente, o prazo para de correr. A marca aparece no quadro e sai quando alguém clicar em Parar de esperar.'
          : 'Esperando a operadora, o prazo continua correndo: a espera só fica marcada no chamado e no quadro.'}
      </p>
      <Campo label="Por que está esperando?">
        <textarea ref={texto} className="input min-h-[84px]" autoFocus maxLength={300} value={motivo} onChange={(e) => setMotivo(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) void confirmar(); }}
          placeholder={tipo === 'cliente' ? 'Ex.: o cliente vai testar à tarde e responder' : 'Ex.: protocolo aberto na Algar, prometeram retorno até as 18h'} />
      </Campo>
      <ErroPerto erro={acao.erro} />
    </Modal>
  );
}

// =====================================================================
//  AVISAR O CLIENTE (WhatsApp)
// =====================================================================

export function JanelaAvisar({ onFechar }: { onFechar: () => void }) {
  const { f, recarregar } = useAberta();
  const acao = useAcao();
  const [texto, setTexto] = useState('');
  const mandar = async () => {
    if (!texto.trim()) { acao.setErro('Escreva a mensagem.'); return; }
    const r = await acao.rodar(() => api.atendimento.avisarCliente(f.id, texto.trim()), 'Mensagem enviada ao cliente');
    // a tentativa que falhou também fica no histórico: a ficha relê para mostrar
    if (r.ok) onFechar(); else recarregar();
  };
  return (
    <Modal open onClose={onFechar} titulo="Avisar o cliente pelo WhatsApp" largura="max-w-xl"
      rodape={<Rodape onFechar={onFechar} ocupado={acao.ocupado} botao={<><MessageCircle size={15} /> Mandar</>} onConfirmar={mandar} />}>
      <p className="text-sm text-ink-2 mb-3">
        Para <b>{f.contato?.nome ?? 'o contato'}</b> · <span className="font-mono tnum">{telefoneLegivel(f.contato?.telefone)}</span>
      </p>
      <Campo label="Mensagem" dica="Sai pelo número oficial do suporte e fica no histórico do chamado.">
        <textarea className="input min-h-[110px]" autoFocus maxLength={3000} value={texto} onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) void mandar(); }}
          placeholder="Ex.: Ajustamos a rota de saída. Pode testar uma ligação para celular e nos dizer se melhorou?" />
      </Campo>
      <div className="text-right text-[11.5px] text-muted tnum mt-0.5">{texto.length}/3000</div>
      <ComoChegaAoCliente texto={texto} />
      <ErroPerto erro={acao.erro} />
    </Modal>
  );
}

/**
 * A mensagem como chega ao cliente: o texto do atendente dentro do que os Ajustes mandam — o modelo
 * aprovado do WhatsApp oficial (cada variável como vai para a API: sem quebra de linha) ou o texto livre.
 */
function ComoChegaAoCliente({ texto }: { texto: string }) {
  const { f, opcoes, eu } = useAberta();
  const m = opcoes.whatsapp.mensagemCliente;
  if (!m) return null;
  const previa = mensagemPreenchida(m, {
    contato: f.contato?.nome ?? null, codigo: f.codigo, cliente: f.cliente?.nome ?? null, titulo: f.titulo,
    responsavel: f.responsavel?.nome ?? null, eu: eu?.nome ?? null, texto: texto.trim() || '(a sua mensagem)',
  });
  const levaOTexto = m.peloModelo ? m.variaveis.some((v) => v.valor.includes('{texto}')) : m.texto.includes('{texto}');
  return (
    <div className="mt-2" id="ficha-como-chega">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mb-1.5">
        <span className="eyebrow">Como chega ao cliente</span>
        {m.peloModelo && <span className="chip bg-ok-soft text-ok" title="O modelo aprovado do WhatsApp oficial (Chamados › Ajustes › Avisos e WhatsApp)">pelo modelo <span className="font-mono font-normal">{m.nomeDoModelo ?? 'aprovado'}</span></span>}
      </div>
      <BalaoDeMensagem texto={previa} />
      {m.peloModelo && /\n/.test(texto.trim()) && levaOTexto && <p className="text-[12px] text-muted mt-1.5">No modelo aprovado, a quebra de linha vira " · " (o WhatsApp não aceita quebra dentro da variável).</p>}
      {!levaOTexto && <p className="text-[12.5px] text-signal mt-1.5">O modelo não tem lugar para o seu texto: o cliente recebe só o que está acima, e o seu texto fica no histórico do chamado.</p>}
    </div>
  );
}

// =====================================================================
//  CRIAR UM FILHO (OU UM PROBLEMA A PARTIR DESTE), NUMA JANELA
// =====================================================================

/**
 * O formulário do Abrir chamado numa janela por cima da ficha (o pedido do Luan na prévia: "quando eu for
 * abrir um filho, ele tem que abrir como pop-up e não a tela inteira"): o filho nasce ligado a este
 * chamado (pode ir para outro painel); o problema nasce juntando este como incidente. Aberto, a janela
 * fecha e a ficha mostra a ligação nova. Com algo escrito, fechar pergunta antes de descartar.
 */
export function JanelaAbrirLigado({ tipo, onFechar }: { tipo: 'filho' | 'problema'; onFechar: () => void }) {
  const { f, recarregar } = useAberta();
  const abrirChamado = useAbrirChamado();
  const [escreveu, setEscreveu] = useState(false);
  const [descartar, setDescartar] = useState(false);
  const fechar = () => (escreveu ? setDescartar(true) : onFechar());
  return (
    <>
      <Modal open onClose={fechar} largura="max-w-4xl"
        titulo={tipo === 'filho' ? <>Criar um filho do <span className="font-mono">{f.codigo}</span></> : <>Abrir um problema a partir do <span className="font-mono">{f.codigo}</span></>}>
        <div id="janela-abrir-ligado" data-tipo={tipo}>
          <NovoChamadoNaJanela pai={tipo === 'filho' ? f.codigo : undefined} incidente={tipo === 'problema' ? f.codigo : undefined} painelId={f.painelId}
            onEscreveu={setEscreveu} onCancelar={fechar}
            onAberto={() => { onFechar(); recarregar(); }}
            onReaberto={(codigo) => { onFechar(); abrirChamado(codigo); }} />
        </div>
      </Modal>
      <Confirmar open={descartar} onClose={() => setDescartar(false)} onConfirm={() => { setDescartar(false); onFechar(); }} perigoso botao="Descartar"
        titulo="Descartar o que foi escrito?" texto={`O ${tipo === 'filho' ? 'filho' : 'problema'} ainda não foi aberto: o que foi escrito nesta janela se perde.`} />
    </>
  );
}

// =====================================================================
//  ESCOLHER OUTRO CHAMADO (ligar, pai, problema, incidente)
// =====================================================================

/**
 * Achar um chamado digitando: o código (SUP-12) ou um pedaço do título, do cliente, do contato. A
 * lista mostra os que a pessoa vê (de qualquer painel), os mais recentes primeiro.
 */
function EscolherChamado({ valor, onChange, tipoChamado, excluir, onEnter }: {
  valor: string; onChange: (v: string) => void; tipoChamado?: 'chamado' | 'problema'; excluir: string[]; onEnter: () => void;
}) {
  const { opcoes } = useAberta();
  const [q, setQ] = useState(valor.trim());
  const [marcado, setMarcado] = useState(-1);
  useEffect(() => { const t = window.setTimeout(() => setQ(valor.trim()), 250); return () => window.clearTimeout(t); }, [valor]);
  const achados = useQuery({
    queryKey: ['atendimento', 'lista', 'escolher', q, tipoChamado ?? ''],
    queryFn: () => api.atendimento.lista({ q, situacao: 'todos', pageSize: 8, sort: 'atualizado', tipoChamado }),
    enabled: q.length >= 2,
    staleTime: 30_000,
  });
  const itens = (achados.data?.items ?? []).filter((c) => !excluir.includes(c.codigo));
  const escolhido = lerCodigo(valor);
  const escolher = (c: CartaoChamado) => { onChange(c.codigo); setMarcado(-1); };
  return (
    <div>
      <label className="relative block">
        <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" aria-hidden />
        <input className="input pl-8" autoFocus autoComplete="off" value={valor} aria-label="Código ou busca"
          placeholder="Código (SUP-12) ou um pedaço do título, do cliente…"
          onChange={(e) => { onChange(e.target.value); setMarcado(-1); }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') { e.preventDefault(); setMarcado((m) => Math.min(itens.length - 1, m + 1)); }
            else if (e.key === 'ArrowUp') { e.preventDefault(); setMarcado((m) => Math.max(-1, m - 1)); }
            else if (e.key === 'Enter') { e.preventDefault(); const c = itens[marcado]; if (c) escolher(c); else onEnter(); }
          }} />
      </label>
      {q.length >= 2 && (
        <ul className="mt-1.5 flex flex-col max-h-[260px] overflow-y-auto rounded-lg border border-line" aria-label="Chamados achados">
          {achados.isLoading && <li className="px-3 py-2 text-[13px] text-muted flex items-center gap-2"><Spinner /> Procurando…</li>}
          {!achados.isLoading && !itens.length && <li className="px-3 py-2 text-[13px] text-muted">Nada com "{q}".</li>}
          {itens.map((c, i) => {
            const cor = painelDe(opcoes, c.painelId)?.cor ?? 'accent';
            const atual = escolhido && c.codigo === `${escolhido.sigla}-${escolhido.numero}`;
            return (
              <li key={c.id}>
                <button type="button" onClick={() => escolher(c)} onMouseEnter={() => setMarcado(i)}
                  className={`w-full text-left px-3 py-1.5 text-[13px] flex items-start gap-2 border-b border-line last:border-b-0 ${i === marcado ? 'bg-surface-2' : ''} ${atual ? 'bg-accent-soft' : ''}`}>
                  <span className={`chip font-mono shrink-0 ${TOM_CODIGO[cor] ?? TOM_CODIGO.accent}`}>{c.codigo}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{c.titulo}</span>
                    <span className="block truncate text-[12px] text-muted">{[c.cliente?.nome, NOME_SITUACAO_CHAMADO[c.situacao], c.tipoChamado === 'problema' ? 'problema' : null].filter(Boolean).join(' · ')}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/** As cores do chip do código (as mesmas do CodigoChamado), sem o link. */
const TOM_CODIGO: Record<string, string> = {
  accent: 'bg-accent-soft text-accent-ink', roxo: 'bg-roxo-soft text-roxo-ink', turquesa: 'bg-turquesa-soft text-turquesa-ink', signal: 'bg-signal-soft text-signal',
  ok: 'bg-ok-soft text-ok', rosa: 'bg-rosa-soft text-rosa-ink', amarelo: 'bg-amarelo-soft text-amarelo-ink', neutral: 'bg-surface-2 text-ink-2',
};

/** O código escrito, no formato do sistema (sup 12 → SUP-12), ou nada. */
function codigoLido(t: string): string | null {
  const c = lerCodigo(t);
  return c ? `${c.sigla}-${c.numero}` : null;
}

const TIPOS_LIGAR: Array<{ id: TipoLigacaoChamado; nome: string; dica: string }> = [
  { id: 'relacionado', nome: 'Relacionado', dica: 'tratam de coisas parecidas, e um ajuda a entender o outro' },
  { id: 'duplicado', nome: 'Duplicado de', dica: 'é o mesmo caso que o outro (o outro é o que segue)' },
  { id: 'repete', nome: 'Repete', dica: 'o mesmo problema voltou depois de resolvido (reincidência)' },
];

export function JanelaLigar({ onFechar }: { onFechar: () => void }) {
  const { f } = useAberta();
  const acao = useAcao();
  const [codigo, setCodigo] = useState('');
  const [tipo, setTipo] = useState<TipoLigacaoChamado>('relacionado');
  const alvo = codigoLido(codigo);
  const ligar = async () => {
    if (!alvo) { acao.setErro('Escolha o chamado na lista ou escreva o código, como SUP-12.'); return; }
    if (alvo === f.codigo) { acao.setErro('Um chamado não se liga a ele mesmo.'); return; }
    const r = await acao.rodar(() => api.atendimento.ligar(f.id, { para: alvo, tipo }), `${f.codigo} ligado a ${alvo}`);
    if (r.ok) onFechar();
  };
  return (
    <Modal open onClose={onFechar} titulo={`Ligar ${f.codigo} a outro chamado`} largura="max-w-xl"
      rodape={<Rodape onFechar={onFechar} ocupado={acao.ocupado} botao="Ligar" onConfirmar={ligar} />}>
      <Campo label="Qual chamado">
        <EscolherChamado valor={codigo} onChange={(v) => { setCodigo(v); acao.limpar(); }} excluir={[f.codigo]} onEnter={() => void ligar()} />
      </Campo>
      <fieldset className="mt-4">
        <legend className="label">Como eles se ligam</legend>
        <div className="flex flex-col gap-1.5">
          {TIPOS_LIGAR.map((t) => (
            <label key={t.id} className={`flex items-start gap-2.5 rounded-lg border px-3 py-2 cursor-pointer text-[13.5px] ${tipo === t.id ? 'border-accent bg-accent-soft' : 'border-line hover:bg-surface-2'}`}>
              <input type="radio" name="tipo-ligacao" className="mt-1" checked={tipo === t.id} onChange={() => setTipo(t.id)} />
              <span><b>{t.nome}</b> <span className="text-muted">— {t.dica}</span></span>
            </label>
          ))}
        </div>
      </fieldset>
      {alvo && alvo !== f.codigo && (
        <p className="mt-3 text-[13.5px] text-ink-2">
          Vai ficar: <b className="font-mono">{f.codigo}</b> {NOME_LIGACAO[tipo].de.toLocaleLowerCase('pt-BR')} <b className="font-mono">{alvo}</b>
          {' '}<span className="text-muted">(e, no outro: {NOME_LIGACAO[tipo].para.toLocaleLowerCase('pt-BR')} {f.codigo})</span>
        </p>
      )}
      <ErroPerto erro={acao.erro} />
    </Modal>
  );
}

/**
 * Escolher um chamado e fazer uma coisa com ele: o pai deste, o problema deste, ou (no problema) um
 * incidente novo. `fazer` recebe o código já no formato do sistema.
 */
export function JanelaEscolherChamado({ titulo, texto, botao, tipoChamado, excluir, fazer, ok, onFechar, depois }: {
  titulo: string; texto: ReactNode; botao: string; tipoChamado?: 'chamado' | 'problema'; excluir: string[];
  fazer: (codigo: string) => Promise<FichaChamado>; ok: (codigo: string) => string; onFechar: () => void; depois?: () => void;
}) {
  const { f } = useAberta();
  const acao = useAcao();
  const [codigo, setCodigo] = useState('');
  const alvo = codigoLido(codigo);
  const confirmar = async () => {
    if (!alvo) { acao.setErro('Escolha o chamado na lista ou escreva o código, como SUP-12.'); return; }
    if (alvo === f.codigo) { acao.setErro('Escolha outro chamado: não pode ser ele mesmo.'); return; }
    const r = await acao.rodar(() => fazer(alvo), ok(alvo));
    if (r.ok) { depois?.(); onFechar(); }
  };
  return (
    <Modal open onClose={onFechar} titulo={titulo} largura="max-w-xl" rodape={<Rodape onFechar={onFechar} ocupado={acao.ocupado} botao={botao} onConfirmar={confirmar} />}>
      <div className="text-sm text-ink-2 mb-3">{texto}</div>
      <EscolherChamado valor={codigo} onChange={(v) => { setCodigo(v); acao.limpar(); }} tipoChamado={tipoChamado} excluir={[f.codigo, ...excluir]} onEnter={() => void confirmar()} />
      <ErroPerto erro={acao.erro} />
    </Modal>
  );
}

// =====================================================================
//  TROCAR DE PAINEL
// =====================================================================

export function JanelaTrocarPainel({ onFechar }: { onFechar: () => void }) {
  const { f, opcoes, painel } = useAberta();
  const acao = useAcao();
  const outros = useMemo(() => opcoes.paineis.filter((p) => p.ativo && p.id !== f.painelId), [opcoes.paineis, f.painelId]);
  const [painelId, setPainelId] = useState(outros[0]?.id ?? '');
  const novo = outros.find((p) => p.id === painelId);
  const [etapaId, setEtapaId] = useState(() => (outros[0] ? etapaDeEntrada(outros[0].etapas)?.id ?? '' : ''));
  const trocar = async () => {
    if (!novo) return;
    const r = await acao.rodar(() => api.atendimento.trocarPainel(f.id, { painelId: novo.id, etapaId: etapaId || null }), `${f.codigo} passou para o painel ${novo.nome}`);
    if (r.ok) onFechar();
  };
  return (
    <Modal open onClose={onFechar} titulo={`Passar ${f.codigo} para outro painel`}
      rodape={<Rodape onFechar={onFechar} ocupado={acao.ocupado} desativado={!novo} botao="Trocar de painel" onConfirmar={trocar} />}>
      {!outros.length ? <p className="text-sm text-muted">Não há outro painel ativo para onde passar o chamado.</p> : (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-ink-2">
            O código continua <b className="font-mono">{f.codigo}</b>. O assunto é de cada painel, então sai; o tipo sai se o painel novo não tiver o mesmo.
            Hoje ele está no painel <b>{painel?.nome}</b>.
          </p>
          <Campo label="Para qual painel">
            <select className="input" value={painelId} onChange={(e) => { const p = outros.find((x) => x.id === e.target.value); setPainelId(e.target.value); setEtapaId(p ? etapaDeEntrada(p.etapas)?.id ?? '' : ''); }}>
              {outros.map((p) => <option key={p.id} value={p.id}>{p.nome} ({p.sigla})</option>)}
            </select>
          </Campo>
          {novo && (
            <Campo label="Em qual etapa" dica="Sem escolher, vai para a entrada do painel.">
              <select className="input" value={etapaId} onChange={(e) => setEtapaId(e.target.value)}>
                {novo.etapas.map((e) => <option key={e.id} value={e.id}>{nomeComNivel(e)}</option>)}
              </select>
            </Campo>
          )}
        </div>
      )}
      <ErroPerto erro={acao.erro} />
    </Modal>
  );
}

// =====================================================================
//  REABRIR
// =====================================================================

export function JanelaReabrir({ onFechar }: { onFechar: () => void }) {
  const { f, painel } = useAberta();
  const acao = useAcao();
  const etapas = (painel?.etapas ?? []).filter((e) => e.tipo === 'entrada' || e.tipo === 'andamento');
  const [etapaId, setEtapaId] = useState(() => (painel ? etapaAoReabrir(painel.etapas)?.id ?? '' : ''));
  const [motivo, setMotivo] = useState('');
  const reabrir = async () => {
    const r = await acao.rodar(() => api.atendimento.reabrir(f.id, { motivo: motivo.trim() || null, etapaId: etapaId || null }), `${f.codigo} reaberto`);
    if (r.ok) onFechar();
  };
  return (
    <Modal open onClose={onFechar} titulo={`Reabrir ${f.codigo}`}
      rodape={<Rodape onFechar={onFechar} ocupado={acao.ocupado} botao="Reabrir" onConfirmar={reabrir} />}>
      <div className="flex flex-col gap-3">
        <p className="text-sm text-ink-2">O chamado volta a ficar aberto e conta mais uma reabertura. {f.responsavel ? `${f.responsavel.nome} recebe o aviso.` : ''}</p>
        <Campo label="Volta para">
          <select className="input" value={etapaId} onChange={(e) => setEtapaId(e.target.value)}>
            {etapas.map((e) => <option key={e.id} value={e.id}>{nomeComNivel(e)}</option>)}
          </select>
        </Campo>
        <Campo label="Por que reabrir? (opcional)">
          <textarea className="input min-h-[72px]" autoFocus maxLength={500} value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ex.: o cliente disse que voltou a cair à tarde" />
        </Campo>
      </div>
      <ErroPerto erro={acao.erro} />
    </Modal>
  );
}
