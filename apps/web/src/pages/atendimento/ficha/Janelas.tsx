/**
 * As janelas das ações da ficha: esperar (o cliente ou a operadora, com o motivo), avisar o cliente
 * pelo WhatsApp, a resposta pronta (o texto já preenchido e o que ela vai fazer), ligar a outro
 * chamado, escolher o pai, o problema ou um incidente, trocar de painel e reabrir.
 *
 * Cada janela só existe enquanto está aberta (o estado nasce no `useState`), e o erro aparece ali
 * dentro, perto do botão que confirma.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, CircleAlert, Hourglass, MessageCircle, Search, StickyNote, Tag, UserCheck } from 'lucide-react';
import {
  etapaAoReabrir, etapaDeEntrada, lerCodigo, movimentoDeNivel, NOME_CAMPO, NOME_ESPERA, NOME_LIGACAO, NOME_SITUACAO_CHAMADO, preencherModelo,
  type CartaoChamado, type FichaChamado, type RespostaPronta, type TipoEspera, type TipoLigacaoChamado,
} from '@gestor/shared';
import { api } from '../../../api/index.js';
import { Campo, Modal, Spinner } from '../../../components/ui/index.js';
import { painelDe, telefoneLegivel } from '../comum.js';
import { ErroPerto, lista, nomeComNivel, useAberta, useAcao } from './base.js';

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
    <Modal open onClose={onFechar} titulo="Avisar o cliente pelo WhatsApp"
      rodape={<Rodape onFechar={onFechar} ocupado={acao.ocupado} botao={<><MessageCircle size={15} /> Mandar</>} onConfirmar={mandar} />}>
      <p className="text-sm text-ink-2 mb-3">
        Para <b>{f.contato?.nome ?? 'o contato'}</b> · <span className="font-mono tnum">{telefoneLegivel(f.contato?.telefone)}</span>
      </p>
      <Campo label="Mensagem" dica="O Gestor põe a sua mensagem dentro do modelo combinado (Olá, nome do contato! Sobre o seu chamado…) e manda pelo número oficial do suporte. Fica no histórico do chamado.">
        <textarea className="input min-h-[130px]" autoFocus maxLength={3000} value={texto} onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) void mandar(); }}
          placeholder="Ex.: Ajustamos a rota de saída. Pode testar uma ligação para celular e nos dizer se melhorou?" />
      </Campo>
      <div className="text-right text-[11.5px] text-muted tnum mt-0.5">{texto.length}/3000</div>
      <ErroPerto erro={acao.erro} />
    </Modal>
  );
}

// =====================================================================
//  RESPOSTA PRONTA
// =====================================================================

/** Para o menu: o que a resposta faz, em poucas palavras. */
export function resumoDaResposta(r: RespostaPronta, nomeEtapa: (id: string) => string): string {
  const a = r.acao;
  const partes = [
    a.avisarCliente ? 'manda ao cliente' : r.texto.trim() ? 'anota' : null,
    a.esperar === 'cliente' ? 'espera o cliente' : a.esperar === 'operadora' ? 'espera a operadora' : a.esperar === 'nada' ? 'tira a espera' : null,
    a.etiqueta ? `etiqueta ${a.etiqueta}` : null,
    a.assumir ? 'você assume' : null,
    a.etapaId ? `vai para ${nomeEtapa(a.etapaId)}` : null,
  ].filter(Boolean) as string[];
  return partes.length ? lista(partes) : 'só o texto';
}

export function JanelaResposta({ resposta, onFechar }: { resposta: RespostaPronta; onFechar: () => void }) {
  const { f, opcoes, painel, eu } = useAberta();
  const acao = useAcao();
  const a = resposta.acao;
  const [texto, setTexto] = useState(() => preencherModelo(resposta.texto, {
    contato: f.contato?.nome ?? null, codigo: f.codigo, cliente: f.cliente?.nome ?? null, titulo: f.titulo,
    responsavel: f.responsavel?.nome ?? null, eu: eu?.nome ?? null,
  }));
  const etapaAtual = painel?.etapas.find((e) => e.id === f.etapaId);
  const para = a.etapaId && a.etapaId !== f.etapaId ? painel?.etapas.find((e) => e.id === a.etapaId) : undefined;
  const etapaFora = !!a.etapaId && !painel?.etapas.some((e) => e.id === a.etapaId);
  const faltam = para ? f.faltam[para.id] ?? [] : [];
  const filhos = para ? f.filhosTravam[para.id] ?? [] : [];
  const sentido = para ? movimentoDeNivel(etapaAtual, para) : null;
  const semTelefone = a.avisarCliente && !f.contato?.telefone;
  const semWhats = a.avisarCliente && !opcoes.whatsapp.cliente;
  const temEtiqueta = !!a.etiqueta && f.etiquetas.some((x) => x.toLocaleLowerCase('pt-BR') === a.etiqueta!.toLocaleLowerCase('pt-BR'));
  const jaEMeu = !!eu && f.responsavel?.id === eu.id;
  const travas: string[] = [
    ...(semTelefone ? ['O chamado não tem o WhatsApp do contato: preencha o contato para mandar a mensagem.'] : []),
    ...(!semTelefone && semWhats ? ['O WhatsApp do cliente não está ligado (Chamados › Ajustes › Avisos e WhatsApp): a mensagem não sairia.'] : []),
    ...(para && faltam.length ? [`Para ir para ${para.nome}, falta preencher: ${lista(faltam.map((x) => NOME_CAMPO[x]))}.`] : []),
    ...(para && filhos.length ? [`Os filhos em aberto precisam fechar antes de ir para ${para.nome}: ${filhos.join(', ')}.`] : []),
    ...(etapaFora ? ['A etapa desta resposta não é deste painel.'] : []),
  ];

  const aplicar = async () => {
    const r = await acao.rodar(() => api.atendimento.usarResposta(f.id, { respostaId: resposta.id, texto: texto.trim() }), `Resposta "${resposta.nome}" aplicada`);
    if (r.ok) onFechar();
  };

  const faz: Array<{ icone: ReactNode; texto: ReactNode; nota?: string }> = [
    a.avisarCliente
      ? { icone: <MessageCircle size={14} />, texto: <>Manda o texto ao cliente pelo WhatsApp{f.contato?.nome ? ` (${f.contato.nome})` : ''}</> }
      : texto.trim() ? { icone: <StickyNote size={14} />, texto: 'O texto vira uma anotação no chamado' } : null,
    a.esperar === 'cliente' || a.esperar === 'operadora' ? { icone: <Hourglass size={14} />, texto: `Marca: ${NOME_ESPERA[a.esperar]} (o motivo é o nome da resposta)` } : null,
    a.esperar === 'nada' ? { icone: <Hourglass size={14} />, texto: 'Tira a marca de espera', nota: f.espera ? undefined : 'não há espera marcada agora' } : null,
    a.etiqueta ? { icone: <Tag size={14} />, texto: <>Põe a etiqueta <b>{a.etiqueta}</b></>, nota: temEtiqueta ? 'o chamado já tem' : undefined } : null,
    a.assumir ? { icone: <UserCheck size={14} />, texto: 'Você assume o chamado', nota: jaEMeu ? 'já é seu' : undefined } : null,
    a.etapaId ? {
      icone: <ArrowRight size={14} />,
      texto: <>Move para <b>{para ? nomeComNivel(para) : nomeComNivel(etapaAtual)}</b>{sentido === 'sobe' ? ' (escalona)' : sentido === 'desce' ? ' (volta de nível)' : ''}</>,
      nota: !para && !etapaFora ? 'já está nela' : sentido ? 'o motivo é o nome da resposta' : undefined,
    } : null,
  ].filter(Boolean) as Array<{ icone: ReactNode; texto: ReactNode; nota?: string }>;

  return (
    <Modal open onClose={onFechar} titulo={`Resposta pronta: ${resposta.nome}`} largura="max-w-xl"
      rodape={<Rodape onFechar={onFechar} ocupado={acao.ocupado} desativado={travas.length > 0} botao="Aplicar" onConfirmar={aplicar} />}>
      <Campo label={a.avisarCliente ? 'Mensagem ao cliente (WhatsApp)' : 'Anotação'} dica="Já preenchido com os dados deste chamado. Dá para mudar antes de aplicar.">
        <textarea className="input min-h-[120px]" maxLength={3000} value={texto} onChange={(e) => setTexto(e.target.value)} autoFocus />
      </Campo>
      <div className="mt-4">
        <div className="eyebrow mb-1.5">O que ela vai fazer</div>
        {faz.length ? (
          <ul className="flex flex-col gap-1.5 text-[13.5px]">
            {faz.map((x, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="text-muted mt-0.5 shrink-0" aria-hidden>{x.icone}</span>
                <span>{x.texto}{x.nota && <span className="text-muted"> — {x.nota}</span>}</span>
              </li>
            ))}
          </ul>
        ) : <p className="text-[13.5px] text-muted">Nada além de registrar que a resposta foi usada.</p>}
      </div>
      {travas.length > 0 && (
        <ul className="mt-3 flex flex-col gap-1">
          {travas.map((t) => <li key={t} className="flex items-start gap-1.5 text-[12.5px] text-signal"><CircleAlert size={13} className="shrink-0 mt-0.5" /> {t}</li>)}
        </ul>
      )}
      <ErroPerto erro={acao.erro} />
    </Modal>
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
