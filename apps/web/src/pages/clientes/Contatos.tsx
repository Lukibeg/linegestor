/**
 * Os contatos do cliente (2.0, o pedido do Luan na prévia: "uma aba de contatos dos clientes, aí o
 * Abrir chamado já puxaria de lá; e criar um contato por ali"). As pessoas do cliente com quem a equipe
 * fala: o nome, o WhatsApp, o e-mail e o cargo (ou o setor). Quem mexe no cadastro e quem trabalha nos
 * chamados incluem e editam; nada se apaga — desativa (o desativado some do Abrir chamado).
 *
 * O cargo é escolhido numa lista (2.0.2, decisão 0053; o Luan: "eu quero que esses cargos sejam
 * pré-seleção"): os cargos ativos de Administração › Catálogos. O contato que já tinha um cargo fora da
 * lista fica com ele ("Engenharia (fora da lista)") até alguém trocar.
 *
 * A janela do contato (`JanelaContato`) é a mesma no Abrir chamado e na ficha do chamado.
 */
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Mail, MessageCircle, Pencil, Plus, UserRoundPlus } from 'lucide-react';
import { telefoneLegivel, type ContatoDoCliente, type ContatoGravarEntrada } from '@gestor/shared';
import { api } from '../../api/index.js';
import type { ClientFull } from '../../api/types.js';
import { Campo, Carregando, Chip, Modal, Spinner, Toggle, Vazio, mensagemErro, useToast } from '../../components/ui/index.js';
import { useAuth } from '../../lib/auth.js';

/** Quem inclui e edita contatos: o cadastro (records.write) e quem trabalha nos chamados (tickets.work). */
export function usePodeMexerNosContatos() {
  const { can } = useAuth();
  return can('records.write') || can('tickets.work');
}

/** O que precisa recarregar quando um contato muda (a aba, a ficha do cliente com o número, o Abrir chamado). */
export function useDepoisDoContato(clienteId: string) {
  const qc = useQueryClient();
  return () => Promise.all([
    qc.invalidateQueries({ queryKey: ['client-contatos', clienteId] }),
    qc.invalidateQueries({ queryKey: ['client', clienteId] }),
    qc.invalidateQueries({ queryKey: ['atendimento', 'cadastro', clienteId] }),
  ]);
}

export function ContatosDoCliente({ c }: { c: ClientFull }) {
  const q = useQuery({ queryKey: ['client-contatos', c.id], queryFn: () => api.clients.contatos(c.id) });
  const pode = usePodeMexerNosContatos();
  const [janela, setJanela] = useState<ContatoDoCliente | 'novo' | null>(null);
  const [verDesativados, setVerDesativados] = useState(false);

  if (q.isLoading) return <Carregando />;
  if (q.isError) return <p className="text-bad text-sm" role="alert">{mensagemErro(q.error)}</p>;
  const todos = q.data ?? [];
  const ativos = todos.filter((x) => x.ativo);
  const desativados = todos.filter((x) => !x.ativo);
  const lista = verDesativados ? todos : ativos;

  return (
    <div className="flex flex-col gap-3" id="cliente-contatos">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-[13px] text-muted max-w-2xl">
          As pessoas de {c.tradeName} com quem a equipe fala. O <b className="text-ink-2">Abrir chamado</b> puxa daqui, e o robô do LineChat acha o
          cliente pelo WhatsApp de um contato.
        </p>
        <div className="ml-auto flex items-center gap-3">
          {desativados.length > 0 && <Toggle checked={verDesativados} onChange={setVerDesativados} label={`Ver os desativados (${desativados.length})`} />}
          {pode && <button type="button" className="btn-primary" id="contatos-novo" onClick={() => setJanela('novo')}><Plus size={15} /> Novo contato</button>}
        </div>
      </div>

      {!lista.length ? (
        <Vazio titulo="Nenhum contato ainda" texto={pode ? 'Inclua as pessoas do cliente (o nome e o WhatsApp bastam). Um contato também nasce no Abrir chamado.' : 'Quem cuida do cadastro ou dos chamados inclui os contatos.'} />
      ) : (
        <ul className="card divide-y divide-line" id="contatos-lista">
          {lista.map((x) => (
            <li key={x.id} data-contato={x.nome} className={`px-3 py-2.5 sm:px-4 flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-4 ${x.ativo ? '' : 'opacity-60'}`}>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="font-semibold text-ink break-words">{x.nome}</span>
                  {x.cargo && <span className="text-[13px] text-ink-2">· {x.cargo}</span>}
                  {!x.ativo && <Chip tone="muted">desativado</Chip>}
                </div>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-0.5 text-[13px] text-muted mt-0.5">
                  {x.whatsapp ? <span className="inline-flex items-center gap-1 tnum text-ink-2"><MessageCircle size={13} className="text-ok" /> {telefoneLegivel(x.whatsapp)}</span> : <span>sem WhatsApp</span>}
                  {x.email && <a className="inline-flex items-center gap-1 link break-all" href={`mailto:${x.email}`}><Mail size={13} /> {x.email}</a>}
                  <span className="tnum">{x.chamados ? `${x.chamados} ${x.chamados === 1 ? 'chamado' : 'chamados'}` : 'nenhum chamado'}</span>
                </div>
              </div>
              {pode && (
                <button type="button" className="btn-ghost btn-sm self-start sm:self-center" onClick={() => setJanela(x)} aria-label={`Editar o contato ${x.nome}`}>
                  <Pencil size={14} /> Editar
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {janela && <JanelaContato clienteId={c.id} clienteNome={c.tradeName} contato={janela === 'novo' ? null : janela} onFechar={() => setJanela(null)} onSalvo={() => setJanela(null)} />}
    </div>
  );
}

/**
 * Incluir ou editar um contato do cliente. `inicial`: o que já veio escrito (o nome, o WhatsApp e o e-mail do
 * Abrir chamado e da ficha, da conversa do LineChat). Salvo, devolve o contato (o Abrir chamado já o escolhe).
 */
export function JanelaContato({ clienteId, clienteNome, contato, inicial, onFechar, onSalvo }: {
  clienteId: string; clienteNome: string; contato: ContatoDoCliente | null;
  inicial?: { nome?: string | null; whatsapp?: string | null; email?: string | null };
  onFechar: () => void; onSalvo: (c: ContatoDoCliente) => void;
}) {
  const toast = useToast();
  const { can } = useAuth();
  const cargos = useQuery({ queryKey: ['cargos-dos-contatos'], queryFn: () => api.clients.cargos(), staleTime: 60_000 });
  const lista = cargos.data ?? [];
  const depois = useDepoisDoContato(clienteId);
  const [f, setF] = useState({
    nome: contato?.nome ?? inicial?.nome ?? '',
    whatsapp: contato?.whatsapp ? telefoneLegivel(contato.whatsapp) : inicial?.whatsapp ?? '',
    email: contato?.email ?? inicial?.email ?? '',
    cargo: contato?.cargo ?? '',
    ativo: contato?.ativo ?? true,
  });
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState('');
  const mudar = (o: Partial<typeof f>) => { setF((x) => ({ ...x, ...o })); setErro(''); };

  const salvar = async () => {
    if (f.nome.trim().length < 2) { setErro('Escreva o nome do contato (pelo menos 2 letras).'); return; }
    setOcupado(true); setErro('');
    try {
      const d: ContatoGravarEntrada = { nome: f.nome.trim(), whatsapp: f.whatsapp.trim() || null, email: f.email.trim() || null, cargo: f.cargo.trim() || null, ativo: f.ativo };
      const salvo = await api.clients.salvarContato(clienteId, contato?.id ?? null, d);
      await depois();
      toast.push('ok', contato ? (contato.ativo !== salvo.ativo ? `${salvo.nome} ${salvo.ativo ? 'voltou para os' : 'saiu dos'} contatos de ${clienteNome}` : `Contato ${salvo.nome} salvo`) : `${salvo.nome} entrou nos contatos de ${clienteNome}`);
      onSalvo(salvo);
    } catch (e) {
      setErro(mensagemErro(e));
    } finally {
      setOcupado(false);
    }
  };

  return (
    <Modal open onClose={onFechar} titulo={contato ? `Editar o contato ${contato.nome}` : <span className="inline-flex items-center gap-2"><UserRoundPlus size={18} /> Novo contato de {clienteNome}</span>}
      rodape={<>
        <button type="button" className="btn-secondary" onClick={onFechar}>Cancelar</button>
        <button type="button" className="btn-primary" id="contato-salvar" disabled={ocupado} onClick={() => void salvar()}>{ocupado ? <Spinner className="text-white" /> : contato ? 'Salvar' : 'Incluir o contato'}</button>
      </>}>
      <form className="flex flex-col gap-3" autoComplete="off" onSubmit={(e) => { e.preventDefault(); void salvar(); }}>
        <Campo label="Nome *"><input className="input" id="contato-nome" autoFocus maxLength={120} value={f.nome} onChange={(e) => mudar({ nome: e.target.value })} placeholder="Ex.: Maria Souza" /></Campo>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Campo label="WhatsApp" dica="DDD + número"><input className="input tnum" id="contato-whatsapp" inputMode="tel" maxLength={40} value={f.whatsapp} onChange={(e) => mudar({ whatsapp: e.target.value })} placeholder="(71) 99999-0000" /></Campo>
          <Campo label="Cargo ou setor" dica={can('admin.manage') ? 'A lista fica em Administração › Catálogos.' : undefined}>
            <select className="input" id="contato-cargo" value={f.cargo} onChange={(e) => mudar({ cargo: e.target.value })}>
              <option value="">Sem cargo</option>
              {/* o cargo de antes, fora da lista, fica até alguém trocar */}
              {f.cargo && !lista.includes(f.cargo) && <option value={f.cargo}>{cargos.isSuccess ? `${f.cargo} (fora da lista)` : f.cargo}</option>}
              {lista.map((x) => <option key={x} value={x}>{x}</option>)}
            </select>
          </Campo>
        </div>
        <Campo label="E-mail"><input className="input" id="contato-email" type="email" maxLength={200} value={f.email} onChange={(e) => mudar({ email: e.target.value })} placeholder="nome@empresa.com.br" /></Campo>
        {contato && (
          <div className="flex items-start gap-2.5 text-sm" id="contato-ativo">
            <Toggle checked={f.ativo} onChange={(v) => mudar({ ativo: v })} />
            <span>{f.ativo ? 'Ativo' : 'Desativado'} <span className="block text-[12.5px] text-muted">Desativado, some do Abrir chamado; os chamados que já têm este contato continuam com ele.</span></span>
          </div>
        )}
        {/* o Enter num campo salva (o formulário tem um botão de verdade escondido para isso) */}
        <button type="submit" className="hidden" aria-hidden tabIndex={-1} />
        {erro && <p className="text-bad text-[13px]" role="alert" id="contato-erro">{erro}</p>}
      </form>
    </Modal>
  );
}
