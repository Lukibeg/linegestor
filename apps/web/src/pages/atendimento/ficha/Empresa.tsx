/**
 * A empresa e o contato, em destaque no topo da coluna do lado (o pedido do Eider, com o nome do
 * contato que o Luan pediu): o nome grande com o link para a ficha do cliente, os produtos e as
 * operadoras do cadastro dele, quantos circuitos, DIDs e aparelhos; o contato com o WhatsApp legível
 * e o link "Conversa no LineChat" (que se liga, troca e tira à mão desde o 2.1: `Conversa.tsx`). Dá para
 * trocar o cliente, o nome do contato e o WhatsApp — e o
 * contato sai da lista do cliente (a aba Contatos, 2.0): um clique troca; o que não está na lista se
 * salva lá com um clique.
 *
 * Na negociação (o painel de Vendas, 2.0.1), a empresa pode ainda não ser cliente: o nome escrito à mão
 * aparece aqui (e se edita); quando ela virar cliente, "Escolher" liga a negociação ao cadastro.
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Building2, Pencil, Phone, UserRound, UserRoundPlus } from 'lucide-react';
import { acharContato, numeroWhatsApp, type ContatoDoCliente } from '@gestor/shared';
import { api } from '../../../api/index.js';
import { Campo, Chip, Copiar, EscolherComBusca, Spinner } from '../../../components/ui/index.js';
import { telefoneLegivel } from '../comum.js';
import { ErroPerto, MarcaFalta, useAberta, useAcao } from './base.js';
import { ConversaDoChamado } from './Conversa.js';
import { JanelaContato, usePodeMexerNosContatos } from '../../clientes/Contatos.js';

export function Empresa() {
  const { f, cadastro, pode, painel } = useAberta();
  const trocar = useAcao();
  const vendas = painel?.tipo === 'vendas';
  const clientes = useQuery({ queryKey: ['client-options'], queryFn: () => api.clients.options(), enabled: pode, staleTime: 5 * 60_000 });
  const opcoesClientes = (clientes.data ?? []).map((c) => ({ id: c.id, nome: c.name }));
  const escolher = (id: string) => void trocar.rodar(() => api.atendimento.alterar(f.id, { clienteId: id || null }), id ? 'Empresa trocada' : vendas ? 'A negociação ficou sem o cliente' : 'O chamado ficou sem empresa');

  const contagem = cadastro ? [
    cadastro.circuitos.length ? `${cadastro.circuitos.length} ${cadastro.circuitos.length === 1 ? 'circuito' : 'circuitos'}` : null,
    cadastro.dids.length ? `${cadastro.dids.length} ${cadastro.dids.length === 1 ? 'DID' : 'DIDs'}` : null,
    cadastro.aparelhos.length ? `${cadastro.aparelhos.length} ${cadastro.aparelhos.length === 1 ? 'aparelho' : 'aparelhos'}` : null,
    cadastro.unidades.length > 1 ? `${cadastro.unidades.length} unidades` : null,
  ].filter(Boolean) : [];

  return (
    <section className="card p-4 min-w-0 border-t-4 border-t-accent" aria-label="Empresa e contato">
      <div id="campo-cliente" className="rounded-sm scroll-mt-24 transition-shadow">
        <div className="flex items-center justify-between gap-2 mb-1">
          <span className="eyebrow inline-flex items-center gap-1.5"><Building2 size={12} /> Empresa</span>
          <span className="flex items-center gap-1.5">
            <MarcaFalta campo="cliente" />
            {trocar.ocupado && <Spinner />}
            {pode && (
              <EscolherComBusca valor={f.cliente?.id ?? ''} opcoes={opcoesClientes} onChange={escolher} vazio="Sem empresa" rotulo="Trocar a empresa" procurar="Procurar empresa…"
                gatilho={(abrir) => <button type="button" className="btn-ghost btn-sm -my-1 text-[12.5px]" onClick={abrir} title={vendas && !f.cliente ? 'A empresa já é (ou virou) cliente: ligar ao cadastro' : undefined}>{f.cliente ? 'Trocar' : vendas && f.empresa ? 'Virou cliente?' : 'Escolher'}</button>} />
            )}
          </span>
        </div>
        {f.cliente ? (
          <Link to={`/clientes/${f.cliente.id}`} className="font-display text-[19px] font-semibold leading-snug text-ink hover:text-accent break-words" title="Abrir a ficha do cliente">
            {f.cliente.nome}
          </Link>
        ) : vendas && (f.empresa || pode) ? <EmpresaQueNaoECliente /> : (
          <p className="font-display text-[17px] font-semibold text-signal">Sem empresa</p>
        )}
        {cadastro && (cadastro.produtos.length > 0 || cadastro.operadoras.length > 0) && (
          <div className="flex flex-wrap gap-1 mt-2" aria-label="Produtos e operadoras do cliente">
            {cadastro.produtos.map((p) => <Chip key={p.id} color={p.cor} title="Produto do cliente">{p.nome}</Chip>)}
            {cadastro.operadoras.map((o) => <Chip key={o.id} tone="neutral" title="Operadora dos circuitos do cliente">{o.nome}</Chip>)}
          </div>
        )}
        {contagem.length > 0 && <p className="text-[12px] text-muted mt-1.5">{contagem.join(' · ')}</p>}
        <ErroPerto erro={trocar.erro} />
      </div>

      <div className="border-t border-line mt-3 pt-3"><Contato /></div>
    </section>
  );
}

function Contato() {
  const { f, pode, cadastro } = useAberta();
  const [editando, setEditando] = useState(false);
  const acao = useAcao();
  const [nome, setNome] = useState('');
  const [fone, setFone] = useState('');
  // os contatos do cliente (a aba Contatos): o deste chamado, se estiver lá (pelo WhatsApp ou pelo nome)
  const contatos = f.cliente ? cadastro?.contatos ?? [] : [];
  const doCadastro = acharContato(contatos, { nome: f.contato?.nome, telefone: f.contato?.telefone });
  const podeContatos = usePodeMexerNosContatos();
  const [salvarNaLista, setSalvarNaLista] = useState(false);
  /** Trocar pelo contato da lista: um clique. */
  const usar = async (c: ContatoDoCliente) => {
    const r = await acao.rodar(() => api.atendimento.alterar(f.id, { contatoNome: c.nome, contatoTelefone: c.whatsapp }), `Contato: ${c.nome}`);
    if (r.ok) setEditando(false);
  };
  const abrir = () => { setNome(f.contato?.nome ?? ''); setFone(f.contato?.telefone ? telefoneLegivel(f.contato.telefone) : ''); acao.limpar(); setEditando(true); };
  const salvar = async () => {
    // a mesma conta do servidor: o número precisa virar um WhatsApp (DDD + número)
    if (fone.trim() && !numeroWhatsApp(fone)) { acao.setErro('Telefone inválido: use DDD + número, como (71) 99999-0000.'); return; }
    const r = await acao.rodar(() => api.atendimento.alterar(f.id, { contatoNome: nome.trim() || null, contatoTelefone: fone.trim() || null }), 'Contato salvo');
    if (r.ok) setEditando(false);
  };
  const temContato = !!(f.contato?.nome || f.contato?.telefone);

  return (
    <div id="campo-contato" className="rounded-sm scroll-mt-24 transition-shadow">
      <div className="flex items-center justify-between gap-2 mb-1">
        <span className="eyebrow inline-flex items-center gap-1.5"><UserRound size={12} /> Contato</span>
        <span className="flex items-center gap-1.5">
          <MarcaFalta campo="contato" />
          {pode && !editando && <button type="button" className="btn-ghost btn-sm -my-1 text-[12.5px]" onClick={abrir}><Pencil size={12} /> {temContato ? 'Editar' : 'Preencher'}</button>}
        </span>
      </div>
      {editando ? (
        <form className="flex flex-col gap-2" autoComplete="off" onSubmit={(e) => { e.preventDefault(); void salvar(); }}>
          {contatos.length > 0 && (
            <div id="ficha-contatos-do-cliente">
              <div className="label">Contatos de {f.cliente!.nome}</div>
              <div className="flex flex-wrap gap-1.5">
                {contatos.map((c) => (
                  <button key={c.id} type="button" disabled={acao.ocupado} onClick={() => void usar(c)} title={c.whatsapp ? telefoneLegivel(c.whatsapp) : 'sem WhatsApp'}
                    className={`text-left rounded-lg border px-2.5 py-1 text-[13px] ${c.id === doCadastro?.id ? 'border-accent bg-accent-soft text-accent-ink font-semibold' : 'border-line text-ink-2 hover:bg-surface-2'}`}>
                    {c.nome}{c.cargo && <span className="text-[12px] text-muted font-normal"> · {c.cargo}</span>}
                  </button>
                ))}
              </div>
              <div className="text-[12px] text-muted mt-1">Um clique troca o contato. Ou escreva abaixo.</div>
            </div>
          )}
          <Campo label="Nome do contato"><input className="input" autoFocus maxLength={120} value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Maria Souza" /></Campo>
          <Campo label="WhatsApp" dica="DDD + número, como (71) 99999-0000"><input className="input font-mono" inputMode="tel" maxLength={40} value={fone} onChange={(e) => setFone(e.target.value)} placeholder="(71) 99999-0000" /></Campo>
          <div className="flex gap-2">
            <button type="submit" className="btn-primary btn-sm" disabled={acao.ocupado}>{acao.ocupado ? <Spinner className="text-white" /> : 'Salvar'}</button>
            <button type="button" className="btn-secondary btn-sm" onClick={() => setEditando(false)}>Cancelar</button>
          </div>
          <ErroPerto erro={acao.erro} />
        </form>
      ) : temContato ? (
        <div className="min-w-0">
          {f.contato?.nome && (
            <div className="text-[16px] font-semibold text-ink break-words">
              {f.contato.nome}{doCadastro?.cargo && <span className="text-[13px] font-normal text-muted"> · {doCadastro.cargo}</span>}
            </div>
          )}
          {f.contato?.telefone && (
            <div className="flex items-center gap-1 text-[14px] text-ink-2">
              <Phone size={13} className="text-muted shrink-0" aria-hidden />
              <span className="font-mono tnum">{telefoneLegivel(f.contato.telefone)}</span>
              <Copiar texto={f.contato.telefone} titulo="Copiar o número" />
            </div>
          )}
        </div>
      ) : <p className="text-[13px] text-muted">Sem contato.</p>}
      {/* o contato escrito à mão (ou da conversa) que não está na lista do cliente: guardar lá com um clique */}
      {!editando && f.cliente && f.contato?.nome && !doCadastro && pode && podeContatos && (
        <button type="button" className="link text-[12.5px] mt-1 inline-flex items-center gap-1" id="ficha-contato-salvar" onClick={() => setSalvarNaLista(true)}>
          <UserRoundPlus size={13} /> Salvar nos contatos de {f.cliente.nome}
        </button>
      )}
      {salvarNaLista && f.cliente && (
        <JanelaContato clienteId={f.cliente.id} clienteNome={f.cliente.nome} contato={null}
          inicial={{ nome: f.contato?.nome ?? '', whatsapp: f.contato?.telefone ? telefoneLegivel(f.contato.telefone) : '' }}
          onFechar={() => setSalvarNaLista(false)}
          onSalvo={(c) => {
            setSalvarNaLista(false);
            // o nome (ou o WhatsApp) corrigido na janela vale também para o chamado
            if (c.nome !== f.contato?.nome || (c.whatsapp ?? null) !== (f.contato?.telefone ?? null)) void usar(c);
          }} />
      )}
      {/* a conversa do LineChat: o link e a sessão; ligar, trocar e tirar à mão (2.1, o chamado ativo) */}
      {!editando && <ConversaDoChamado />}
    </div>
  );
}

/** A empresa da negociação que ainda não é cliente: o nome escrito à mão, que se edita aqui. */
function EmpresaQueNaoECliente() {
  const { f, pode } = useAberta();
  const [editando, setEditando] = useState(false);
  const [nome, setNome] = useState('');
  const acao = useAcao();
  const gravar = async () => {
    const t = nome.trim();
    if (t === (f.empresa ?? '')) { setEditando(false); return; }
    const r = await acao.rodar(() => api.atendimento.alterar(f.id, { empresa: t || null }), t ? 'Empresa salva' : 'A empresa saiu');
    if (r.ok) setEditando(false);
  };
  if (editando) {
    return (
      <div>
        <div className="flex items-center gap-2">
          <input className="input" autoFocus maxLength={120} value={nome} placeholder="O nome da empresa" aria-label="O nome da empresa"
            onChange={(e) => setNome(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void gravar(); } else if (e.key === 'Escape') setEditando(false); }} />
          <button type="button" className="btn-primary btn-sm" disabled={acao.ocupado} onClick={() => void gravar()}>{acao.ocupado ? <Spinner className="text-white" /> : 'Salvar'}</button>
        </div>
        <ErroPerto erro={acao.erro} />
      </div>
    );
  }
  return (
    <div className="flex items-start gap-2 min-w-0" id="ficha-empresa">
      <div className="min-w-0">
        <p className={`font-display text-[19px] font-semibold leading-snug break-words ${f.empresa ? 'text-ink' : 'text-signal'}`}>{f.empresa ?? 'Sem empresa'}</p>
        {f.empresa && <p className="text-[12px] text-muted mt-0.5">ainda não é cliente</p>}
      </div>
      {pode && (
        <button type="button" className="btn-ghost btn-sm ml-auto -my-1 shrink-0" onClick={() => { setNome(f.empresa ?? ''); acao.limpar(); setEditando(true); }} aria-label="Editar o nome da empresa">
          <Pencil size={13} /> {f.empresa ? 'Editar' : 'Escrever'}
        </button>
      )}
    </div>
  );
}
