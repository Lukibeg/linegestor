/**
 * Os outros contatos e as outras conversas do chamado (2.2, o documento do Luan de 27/10: "os cards permitem adicionar
 * apenas um contato" e "permitir colocar mais de uma sessão"). Ficam no cartão do contato, embaixo do principal: o
 * contato e a conversa de cima continuam os principais (o aviso ao cliente, o robô e a NIA usam eles).
 *
 *  - **Mais um contato**: o nome e o WhatsApp (ou um clique num contato do cliente); cada um com o X para tirar;
 *  - **Mais uma conversa**: o link da conversa no LineChat (ou o código da sessão), lido como o da principal
 *    (`sessaoDaConversa`); cada uma com o link e o X. O robô acha o chamado aberto por qualquer uma delas.
 *
 * Cada mudança manda a lista inteira (`outrosContatos`, `outrasConversas`): o servidor tira os vazios, os repetidos e o
 * principal, e o histórico diz a lista de antes e a de depois.
 */
import { useState } from 'react';
import { CheckCircle2, ExternalLink, MessagesSquare, Phone, Plus, UserRound, X } from 'lucide-react';
import { acharContato, linkDaConversa, MAX_A_MAIS_NO_CHAMADO, MAX_LETRAS_DO_LINK_DA_CONVERSA, numeroWhatsApp, sessaoDaConversa, type OutroContato } from '@gestor/shared';
import { api } from '../../../api/index.js';
import { Copiar, Spinner } from '../../../components/ui/index.js';
import { telefoneLegivel } from '../comum.js';
import { ErroPerto, useAberta, useAcao } from './base.js';

/** Os outros contatos, embaixo do principal. */
export function OutrosContatos() {
  const { f, pode, cadastro } = useAberta();
  const acao = useAcao();
  const [incluindo, setIncluindo] = useState(false);
  const [nome, setNome] = useState('');
  const [fone, setFone] = useState('');
  const lista = f.outrosContatos;
  // os contatos do cliente que ainda não estão no chamado: um clique inclui
  const doCliente = (f.cliente ? cadastro?.contatos ?? [] : []).filter((c) =>
    !acharContato([{ ...c }], { nome: f.contato?.nome, telefone: f.contato?.telefone }) && !lista.some((o) => acharContato([{ ...c }], o)));

  const gravar = async (nova: OutroContato[], ok: string) => {
    const r = await acao.rodar(() => api.atendimento.alterar(f.id, { outrosContatos: nova }), ok);
    if (r.ok) { setIncluindo(false); setNome(''); setFone(''); }
  };
  const incluir = async () => {
    if (!nome.trim() && !fone.trim()) { acao.setErro('Escreva o nome ou o WhatsApp do contato.'); return; }
    if (fone.trim() && !numeroWhatsApp(fone)) { acao.setErro('Telefone inválido: use DDD + número, como (71) 99999-0000.'); return; }
    await gravar([...lista, { nome: nome.trim() || null, telefone: fone.trim() || null }], 'Contato incluído');
  };

  if (!lista.length && !pode) return null;
  return (
    <div className="mt-2.5" id="ficha-outros-contatos">
      {lista.length > 0 && (
        <ul className="flex flex-col gap-1.5 border-t border-line pt-2" aria-label="Outros contatos">
          {lista.map((c, i) => (
            <li key={`${c.telefone ?? ''}-${c.nome ?? ''}-${i}`} className="flex items-start gap-2 min-w-0 group">
              <UserRound size={13} className="text-muted shrink-0 mt-1" aria-hidden />
              <div className="min-w-0 flex-1">
                {c.nome && <div className="text-[14px] font-semibold text-ink break-words leading-tight">{c.nome}</div>}
                {c.telefone && (
                  <div className="flex items-center gap-1 text-[13px] text-ink-2">
                    <Phone size={12} className="text-muted shrink-0" aria-hidden />
                    <span className="font-mono tnum">{telefoneLegivel(c.telefone)}</span>
                    <Copiar texto={c.telefone} titulo="Copiar o número" />
                  </div>
                )}
              </div>
              {pode && (
                <button type="button" className="btn-ghost btn-sm text-muted -my-0.5 sm:opacity-0 sm:group-hover:opacity-100 focus:opacity-100" disabled={acao.ocupado}
                  aria-label={`Tirar o contato ${c.nome ?? telefoneLegivel(c.telefone)}`} title="Tirar este contato do chamado"
                  onClick={() => void gravar(lista.filter((_, k) => k !== i), 'O contato saiu do chamado')}><X size={13} /></button>
              )}
            </li>
          ))}
        </ul>
      )}
      {pode && !incluindo && lista.length < MAX_A_MAIS_NO_CHAMADO && (f.contato?.nome || f.contato?.telefone || lista.length > 0) && (
        <button type="button" className="link text-[12.5px] mt-1.5 inline-flex items-center gap-1" id="ficha-contato-mais" onClick={() => { acao.limpar(); setIncluindo(true); }}>
          <Plus size={13} /> Mais um contato
        </button>
      )}
      {pode && incluindo && (
        <form className="mt-2 rounded-lg border border-line bg-surface-2/50 p-2.5 flex flex-col gap-2" autoComplete="off" onSubmit={(e) => { e.preventDefault(); void incluir(); }}>
          {doCliente.length > 0 && (
            <div>
              <div className="label">Contatos de {f.cliente!.nome}</div>
              <div className="flex flex-wrap gap-1.5">
                {doCliente.map((c) => (
                  <button key={c.id} type="button" disabled={acao.ocupado} title={c.whatsapp ? telefoneLegivel(c.whatsapp) : 'sem WhatsApp'}
                    onClick={() => void gravar([...lista, { nome: c.nome, telefone: c.whatsapp ?? null }], `Contato incluído: ${c.nome}`)}
                    className="text-left rounded-lg border border-line px-2.5 py-1 text-[13px] text-ink-2 hover:bg-surface-2">
                    {c.nome}{c.cargo && <span className="text-[12px] text-muted"> · {c.cargo}</span>}
                  </button>
                ))}
              </div>
              <div className="text-[12px] text-muted mt-1">Um clique inclui. Ou escreva abaixo.</div>
            </div>
          )}
          <input className="input py-1.5 text-[13.5px]" autoFocus maxLength={120} value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome (ex.: João, do financeiro)" aria-label="Nome do contato" id="ficha-contato-mais-nome" />
          <input className="input py-1.5 text-[13.5px] font-mono" inputMode="tel" maxLength={40} value={fone} onChange={(e) => setFone(e.target.value)} placeholder="WhatsApp: (71) 99999-0000" aria-label="WhatsApp do contato" id="ficha-contato-mais-fone" />
          <div className="flex gap-2">
            <button type="submit" className="btn-primary btn-sm" disabled={acao.ocupado} id="ficha-contato-mais-salvar">{acao.ocupado ? <Spinner className="text-white" /> : 'Incluir'}</button>
            <button type="button" className="btn-secondary btn-sm" onClick={() => setIncluindo(false)}>Cancelar</button>
          </div>
        </form>
      )}
      <ErroPerto erro={acao.erro} />
    </div>
  );
}

/** As outras conversas do LineChat, embaixo da principal. */
export function OutrasConversas() {
  const { f, opcoes, pode } = useAberta();
  const acao = useAcao();
  const [incluindo, setIncluindo] = useState(false);
  const [texto, setTexto] = useState('');
  const lista = f.outrasConversas;
  const t = texto.trim();
  const lida = t ? sessaoDaConversa(t, opcoes.linkConversa) : null;
  const repetida = lida?.ok && !!lida.sessaoId && (lida.sessaoId === f.sessaoId || lista.some((c) => c.sessaoId === lida.sessaoId));

  const gravar = async (sessoes: string[], ok: string) => {
    const r = await acao.rodar(() => api.atendimento.alterar(f.id, { outrasConversas: sessoes }), ok);
    if (r.ok) { setIncluindo(false); setTexto(''); }
  };
  const incluir = async () => {
    if (!lida) return;
    if (!lida.ok) { acao.setErro(lida.erro); return; }
    if (repetida) { acao.setErro('Esta conversa já está ligada ao chamado.'); return; }
    await gravar([...lista.map((c) => c.sessaoId), lida.sessaoId!], 'Mais uma conversa ligada ao chamado');
  };

  // a primeira conversa entra pelo "Ligar a conversa" de sempre; daqui em diante, as outras
  if (!f.sessaoId && !lista.length) return null;
  if (!lista.length && !pode) return null;
  return (
    <div className="mt-1.5" id="ficha-outras-conversas">
      {lista.length > 0 && (
        <ul className="flex flex-col gap-1" aria-label="Outras conversas no LineChat">
          {lista.map((c, i) => (
            <li key={c.sessaoId} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[12.5px] group">
              {c.url ? (
                <a href={c.url} target="_blank" rel="noreferrer noopener" className="link inline-flex items-center gap-1.5 font-semibold">
                  <MessagesSquare size={14} /> Conversa {i + 2} no LineChat <ExternalLink size={12} />
                </a>
              ) : <span className="inline-flex items-center gap-1.5 font-semibold text-ink-2"><MessagesSquare size={14} /> Conversa {i + 2}</span>}
              <span className="inline-flex items-center gap-1 text-muted min-w-0">
                sessão <span className="font-mono text-ink-2 truncate max-w-[150px]">{c.sessaoId}</span><Copiar texto={c.sessaoId} titulo="Copiar a sessão" />
              </span>
              {pode && (
                <button type="button" className="btn-ghost btn-sm -my-1 text-muted sm:opacity-0 sm:group-hover:opacity-100 focus:opacity-100" disabled={acao.ocupado}
                  aria-label={`Tirar a conversa ${i + 2}`} title="Tirar esta conversa do chamado"
                  onClick={() => void gravar(lista.filter((x) => x.sessaoId !== c.sessaoId).map((x) => x.sessaoId), 'A conversa saiu do chamado')}><X size={13} /></button>
              )}
            </li>
          ))}
        </ul>
      )}
      {pode && !incluindo && lista.length < MAX_A_MAIS_NO_CHAMADO && (
        <button type="button" className="link text-[12.5px] mt-1 inline-flex items-center gap-1" id="ficha-conversa-mais" onClick={() => { acao.limpar(); setIncluindo(true); }}>
          <Plus size={13} /> Mais uma conversa
        </button>
      )}
      {pode && incluindo && (
        <form className="mt-2 rounded-lg border border-line bg-surface-2/50 p-2.5" autoComplete="off" onSubmit={(e) => { e.preventDefault(); void incluir(); }}>
          <label className="label inline-flex items-center gap-1.5" htmlFor="ficha-conversa-mais-link"><MessagesSquare size={13} /> Mais uma conversa no LineChat</label>
          <input id="ficha-conversa-mais-link" className="input font-mono text-[12.5px]" autoFocus value={texto} maxLength={MAX_LETRAS_DO_LINK_DA_CONVERSA}
            inputMode="url" spellCheck={false} onChange={(e) => { setTexto(e.target.value); acao.limpar(); }}
            onKeyDown={(e) => { if (e.key === 'Escape') { e.preventDefault(); setIncluindo(false); } }}
            placeholder={opcoes.linkConversa ? opcoes.linkConversa.replace('{sessao}', '…') : 'Cole o link da conversa (ou o código da sessão)'} />
          {lida && !lida.ok ? (
            <p className="text-[12px] text-bad mt-1 leading-snug" role="alert">{lida.erro}</p>
          ) : lida?.ok && lida.sessaoId ? (
            <p className={`text-[12px] mt-1 leading-snug flex items-start gap-1 min-w-0 ${repetida ? 'text-signal' : 'text-ok'}`}>
              <CheckCircle2 size={13} className="shrink-0 mt-px" />
              <span className="min-w-0 break-all">
                {repetida ? 'Esta conversa já está ligada ao chamado.' : <>Sessão <span className="font-mono">{lida.sessaoId}</span>{linkDaConversa(opcoes.linkConversa, lida.sessaoId) && <> · <a href={linkDaConversa(opcoes.linkConversa, lida.sessaoId)!} target="_blank" rel="noreferrer noopener" className="link">conferir no LineChat</a></>}</>}
              </span>
            </p>
          ) : <p className="text-[12px] text-muted mt-1 leading-snug">Outra conversa com o mesmo cliente sobre este chamado: a ficha mostra o link, e o robô acha o chamado por ela também.</p>}
          <div className="flex gap-2 mt-2">
            <button type="submit" className="btn-primary btn-sm" id="ficha-conversa-mais-salvar" disabled={acao.ocupado || !lida || !lida.ok || !!repetida}>
              {acao.ocupado ? <Spinner className="text-white" /> : 'Ligar'}
            </button>
            <button type="button" className="btn-secondary btn-sm" onClick={() => setIncluindo(false)}>Cancelar</button>
          </div>
        </form>
      )}
      <ErroPerto erro={acao.erro} />
    </div>
  );
}
