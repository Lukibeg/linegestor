/**
 * A conversa do LineChat na ficha (no cartão do contato): o link "Conversa no LineChat" e a sessão — e, desde o
 * 2.1, ligar, trocar e tirar a conversa à mão. O pedido do Luan (23/10): "mais de 99% são receptivos, mas
 * alguns são ativos ... tem que ter a possibilidade de associar uma sessão ... para que a IA consiga ler ... Eu
 * posso editar ou colocar o link de alguma outra conversa."
 *
 * Cola-se o link da conversa (o endereço da conversa aberta no LineChat) ou o código da sessão; a tela diz logo a
 * sessão que achou (ou o que está errado), com a mesma leitura do servidor (`sessaoDaConversa`, em @gestor/shared).
 * O botão da NIA, quando o chamado não tem conversa, pede para ligar uma aqui (`pedirParaLigarAConversa`).
 */
import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, ExternalLink, MessagesSquare, Pencil } from 'lucide-react';
import { linkDaConversa, MAX_LETRAS_DO_LINK_DA_CONVERSA, sessaoDaConversa } from '@gestor/shared';
import { api } from '../../../api/index.js';
import { Copiar, Spinner } from '../../../components/ui/index.js';
import { ErroPerto, useAberta, useAcao } from './base.js';

const LIGAR_A_CONVERSA = 'gestor:ficha-ligar-conversa';

/** Abre o campo da conversa na ficha (o botão da NIA, quando o chamado não tem conversa). */
export function pedirParaLigarAConversa() {
  window.dispatchEvent(new Event(LIGAR_A_CONVERSA));
}

export function ConversaDoChamado() {
  const { f, opcoes, pode } = useAberta();
  const [editando, setEditando] = useState(false);
  const [texto, setTexto] = useState('');
  const acao = useAcao();
  const caixa = useRef<HTMLDivElement>(null);
  const campo = useRef<HTMLInputElement>(null);

  const abrir = () => {
    setTexto(f.conversaUrl ?? f.sessaoId ?? '');
    acao.limpar();
    setEditando(true);
  };
  // outro chamado na mesma ficha: o campo fecha
  useEffect(() => { setEditando(false); }, [f.id]);
  // o pedido de fora (o botão da NIA): abre o campo, rola até ele e põe o cursor lá
  const abrirRef = useRef(abrir);
  abrirRef.current = abrir;
  useEffect(() => {
    if (!pode) return;
    const ligar = () => {
      abrirRef.current();
      window.setTimeout(() => { caixa.current?.scrollIntoView({ block: 'center', behavior: 'smooth' }); campo.current?.focus(); campo.current?.select(); }, 30);
    };
    window.addEventListener(LIGAR_A_CONVERSA, ligar);
    return () => window.removeEventListener(LIGAR_A_CONVERSA, ligar);
  }, [pode]);

  const t = texto.trim();
  const lida = t ? sessaoDaConversa(t, opcoes.linkConversa) : null;
  const mesma = lida?.ok && lida.sessaoId === f.sessaoId;
  const linkNovo = lida?.ok && lida.sessaoId ? linkDaConversa(opcoes.linkConversa, lida.sessaoId) : null;

  const gravar = async (valor: string | null) => {
    if (valor && lida && !lida.ok) { acao.setErro(lida.erro); return; }
    if (valor && mesma) { setEditando(false); return; }
    const r = await acao.rodar(() => api.atendimento.alterar(f.id, { sessaoId: valor }),
      valor ? (f.sessaoId ? 'Conversa trocada' : 'Conversa ligada ao chamado') : 'A conversa saiu do chamado');
    if (r.ok) setEditando(false);
  };

  if (editando) {
    return (
      <div ref={caixa} id="ficha-conversa" className="mt-3 rounded-lg border border-line bg-surface-2/50 p-2.5 scroll-mt-24">
        <form autoComplete="off" onSubmit={(e) => { e.preventDefault(); void gravar(t || null); }}>
          <label className="label inline-flex items-center gap-1.5" htmlFor="ficha-conversa-link"><MessagesSquare size={13} /> Conversa no LineChat</label>
          <input ref={campo} id="ficha-conversa-link" className="input font-mono text-[12.5px]" autoFocus value={texto} maxLength={MAX_LETRAS_DO_LINK_DA_CONVERSA}
            inputMode="url" spellCheck={false} onChange={(e) => { setTexto(e.target.value); acao.limpar(); }}
            onKeyDown={(e) => { if (e.key === 'Escape') { e.preventDefault(); setEditando(false); } }}
            placeholder={opcoes.linkConversa ? opcoes.linkConversa.replace('{sessao}', '…') : 'Cole o link da conversa (ou o código da sessão)'} />
          {lida && !lida.ok ? (
            <p className="text-[12px] text-bad mt-1 leading-snug" role="alert">{lida.erro}</p>
          ) : lida?.ok && lida.sessaoId ? (
            <p className="text-[12px] text-ok mt-1 leading-snug flex items-start gap-1 min-w-0" id="ficha-conversa-achou">
              <CheckCircle2 size={13} className="shrink-0 mt-px" />
              {mesma ? (
                <span className="min-w-0 break-all">Esta conversa já está ligada (sessão <span className="font-mono">{lida.sessaoId}</span>).</span>
              ) : (
                <span className="min-w-0 break-all">
                  Sessão <span className="font-mono">{lida.sessaoId}</span>
                  {linkNovo && <> · <a href={linkNovo} target="_blank" rel="noreferrer noopener" className="link">conferir no LineChat</a></>}
                </span>
              )}
            </p>
          ) : (
            <p className="text-[12px] text-muted mt-1 leading-snug">
              {f.sessaoId ? 'Vazio, o chamado fica sem a conversa.' : 'Abra a conversa no LineChat e copie o endereço da barra (ou só o código da sessão). Com ela, a ficha mostra o link, e a NIA lê o que foi conversado.'}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2 mt-2">
            <button type="submit" className="btn-primary btn-sm" id="ficha-conversa-salvar" disabled={acao.ocupado || (!!lida && !lida.ok) || (!t && !f.sessaoId)}>
              {acao.ocupado ? <Spinner className="text-white" /> : 'Salvar'}
            </button>
            <button type="button" className="btn-secondary btn-sm" onClick={() => setEditando(false)}>Cancelar</button>
            {f.sessaoId && (
              <button type="button" className="btn-ghost btn-sm text-bad ml-auto" disabled={acao.ocupado} onClick={() => void gravar(null)} title="O chamado fica sem a conversa do LineChat">
                Tirar a conversa
              </button>
            )}
          </div>
          <ErroPerto erro={acao.erro} />
        </form>
      </div>
    );
  }

  if (!f.conversaUrl && !f.sessaoId) {
    if (!pode) return null;
    return (
      <div className="mt-2 text-[12.5px]" id="ficha-conversa">
        <button type="button" className="link inline-flex items-center gap-1.5" id="ficha-conversa-ligar" onClick={abrir}
          title="O chamado ativo (a equipe chamou o cliente) não vem do robô: cole o link da conversa">
          <MessagesSquare size={14} /> Ligar a conversa do LineChat
        </button>
      </div>
    );
  }

  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px]" id="ficha-conversa">
      {f.conversaUrl && (
        <a href={f.conversaUrl} target="_blank" rel="noreferrer noopener" className="link inline-flex items-center gap-1.5 font-semibold">
          <MessagesSquare size={14} /> Conversa no LineChat <ExternalLink size={12} />
        </a>
      )}
      {f.sessaoId && (
        <span className="inline-flex items-center gap-1 text-muted min-w-0" title="A sessão da conversa no LineChat">
          sessão <span className="font-mono text-ink-2 truncate max-w-[150px]">{f.sessaoId}</span><Copiar texto={f.sessaoId} titulo="Copiar a sessão" />
        </span>
      )}
      {pode && (
        <button type="button" className="btn-ghost btn-sm -my-1 text-[12px] text-muted" id="ficha-conversa-trocar" onClick={abrir} title="Ligar outra conversa (ou tirar)">
          <Pencil size={12} /> Trocar
        </button>
      )}
    </div>
  );
}
