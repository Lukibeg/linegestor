/**
 * A empresa e o contato, em destaque no topo da coluna do lado (o pedido do Eider, com o nome do
 * contato que o Luan pediu): o nome grande com o link para a ficha do cliente, os produtos e as
 * operadoras do cadastro dele, quantos circuitos, DIDs e aparelhos; o contato com o WhatsApp legível
 * e o link "Conversa no LineChat". Dá para trocar o cliente, o nome do contato e o WhatsApp.
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Building2, ExternalLink, MessagesSquare, Pencil, Phone, UserRound } from 'lucide-react';
import { numeroWhatsApp } from '@gestor/shared';
import { api } from '../../../api/index.js';
import { Campo, Chip, Copiar, EscolherComBusca, Spinner } from '../../../components/ui/index.js';
import { telefoneLegivel } from '../comum.js';
import { ErroPerto, MarcaFalta, useAberta, useAcao } from './base.js';

export function Empresa() {
  const { f, cadastro, pode } = useAberta();
  const trocar = useAcao();
  const clientes = useQuery({ queryKey: ['client-options'], queryFn: () => api.clients.options(), enabled: pode, staleTime: 5 * 60_000 });
  const opcoesClientes = (clientes.data ?? []).map((c) => ({ id: c.id, nome: c.name }));
  const escolher = (id: string) => void trocar.rodar(() => api.atendimento.alterar(f.id, { clienteId: id || null }), id ? 'Empresa trocada' : 'O chamado ficou sem empresa');

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
                gatilho={(abrir) => <button type="button" className="btn-ghost btn-sm -my-1 text-[12.5px]" onClick={abrir}>{f.cliente ? 'Trocar' : 'Escolher'}</button>} />
            )}
          </span>
        </div>
        {f.cliente ? (
          <Link to={`/clientes/${f.cliente.id}`} className="font-display text-[19px] font-semibold leading-snug text-ink hover:text-accent break-words" title="Abrir a ficha do cliente">
            {f.cliente.nome}
          </Link>
        ) : (
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
  const { f, pode } = useAberta();
  const [editando, setEditando] = useState(false);
  const acao = useAcao();
  const [nome, setNome] = useState('');
  const [fone, setFone] = useState('');
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
          <Campo label="Nome do contato"><input className="input" autoFocus maxLength={120} value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Maria (recepção)" /></Campo>
          <Campo label="WhatsApp" dica="DDD + número, como (71) 99999-0000"><input className="input font-mono" inputMode="tel" maxLength={40} value={fone} onChange={(e) => setFone(e.target.value)} placeholder="(71) 99999-0000" /></Campo>
          <div className="flex gap-2">
            <button type="submit" className="btn-primary btn-sm" disabled={acao.ocupado}>{acao.ocupado ? <Spinner className="text-white" /> : 'Salvar'}</button>
            <button type="button" className="btn-secondary btn-sm" onClick={() => setEditando(false)}>Cancelar</button>
          </div>
          <ErroPerto erro={acao.erro} />
        </form>
      ) : temContato ? (
        <div className="min-w-0">
          {f.contato?.nome && <div className="text-[16px] font-semibold text-ink break-words">{f.contato.nome}</div>}
          {f.contato?.telefone && (
            <div className="flex items-center gap-1 text-[14px] text-ink-2">
              <Phone size={13} className="text-muted shrink-0" aria-hidden />
              <span className="font-mono tnum">{telefoneLegivel(f.contato.telefone)}</span>
              <Copiar texto={f.contato.telefone} titulo="Copiar o número" />
            </div>
          )}
        </div>
      ) : <p className="text-[13px] text-muted">Sem contato.</p>}
      {!editando && (f.conversaUrl || f.sessaoId) && (
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px]">
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
        </div>
      )}
    </div>
  );
}
