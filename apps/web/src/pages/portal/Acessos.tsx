/**
 * Portal do cliente (Patch 1.8): quem da empresa do cliente pode entrar.
 *
 * Uma pessoa = um e-mail e uma senha. A equipe só gera o convite (nome e e-mail) e manda o link pelo
 * WhatsApp; quem cria a senha é a própria pessoa — ninguém da Ingline digita senha de cliente. O link
 * vale 7 dias e uma vez só, e não aparece de novo (no banco fica só uma "impressão digital" dele):
 * perdeu, gera outro. "Esqueci a senha" é o mesmo caminho: convite novo, e a senha antiga vale até
 * a pessoa criar a nova.
 *
 * O acesso cai sozinho quando o cliente sai da base (arquivado, na lixeira ou sem produto ativo) e
 * volta sozinho se ele voltar. Bloquear é para uma pessoa só (saiu da empresa).
 *
 * A mesma lista aparece na ficha do cliente (aba Portal) e no Portal do cliente › Acessos (todos).
 */
import { useMemo, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { AlertTriangle, Ban, Copy, KeyRound, MailPlus, MessageCircle, Pencil, Search, ShieldCheck, UserPlus } from 'lucide-react';
import { DIAS_DO_CONVITE, NOMES_SITUACAO_ACESSO, linkWhatsApp, mensagemDoConvite, type SituacaoAcesso } from '@gestor/shared';
import { api } from '../../api/index.js';
import type { AcessoPortal, ConviteGerado } from '../../api/types.js';
import { Campo, Carregando, Chip, Confirmar, EscolherComBusca, mensagemErro, Modal, Spinner, Vazio, useToast, type TomChip } from '../../components/ui/index.js';
import { useAuth } from '../../lib/auth.js';
import { data, relativo } from '../../lib/format.js';
import { linkDoPortal } from '../../portal/Corpo.js';

const TOM: Record<SituacaoAcesso, TomChip> = { ativo: 'ok', convite: 'accent', convite_vencido: 'signal', bloqueado: 'bad', fora_da_base: 'muted' };

export function ChipAcesso({ a }: { a: Pick<AcessoPortal, 'situacao' | 'conviteVenceEm' | 'motivo'> }) {
  const dias = a.conviteVenceEm ? Math.max(0, Math.ceil((new Date(a.conviteVenceEm).getTime() - Date.now()) / 86_400_000)) : null;
  const dica = a.situacao === 'convite' && dias != null ? `O link vence em ${dias} ${dias === 1 ? 'dia' : 'dias'}` : a.situacao === 'fora_da_base' ? `Não entra: ${a.motivo ?? 'o cliente saiu da base'}` : undefined;
  return <Chip tone={TOM[a.situacao]} title={dica}>{NOMES_SITUACAO_ACESSO[a.situacao]}{a.situacao === 'convite' && dias != null && <span className="font-normal">· {dias} d</span>}</Chip>;
}

/** O nome do portal (vai na mensagem do convite). */
const useTituloDoPortal = () => useQuery({ queryKey: ['portal-admin', 'ajustes'], queryFn: () => api.portalAdmin.ajustes(), staleTime: 5 * 60_000 }).data?.titulo ?? 'Central de ajuda Ingline';

/**
 * O convite que acabou de ser gerado: o link aparece uma vez só. Copiar, ou mandar pelo WhatsApp
 * com a mensagem pronta (quem escolhe o contato é você, no WhatsApp).
 */
function ConvitePronto({ convite, onClose }: { convite: { nome: string; email: string; r: ConviteGerado } | null; onClose: () => void }) {
  const toast = useToast();
  const titulo = useTituloDoPortal();
  if (!convite) return null;
  const link = linkDoPortal(convite.r.convite);
  const mensagem = mensagemDoConvite(convite.nome, link, titulo, DIAS_DO_CONVITE);
  const copiar = async (texto: string, ok: string) => { try { await navigator.clipboard.writeText(texto); toast.push('ok', ok); } catch { toast.push('erro', 'Não deu para copiar: selecione o link e copie.'); } };
  return (
    <Modal open onClose={onClose} titulo="Convite pronto" largura="max-w-lg" rodape={<button className="btn-secondary" onClick={onClose}>Fechar</button>}>
      <div className="flex flex-col gap-3">
        <p className="text-[14px]">Mande para <b>{convite.nome}</b> ({convite.email}). Pelo link, a pessoa cria a própria senha e já entra.</p>
        <div className="rounded-lg border border-line bg-surface-2 px-3 py-2 font-mono text-[12.5px] break-all select-all" id="convite-link">{link}</div>
        <div className="flex flex-wrap gap-2">
          <a className="btn-primary" href={linkWhatsApp(mensagem)} target="_blank" rel="noreferrer"><MessageCircle size={15} /> Mandar pelo WhatsApp</a>
          <button type="button" className="btn-secondary" onClick={() => copiar(link, 'Link copiado')}><Copy size={15} /> Copiar o link</button>
          <button type="button" className="btn-ghost" onClick={() => copiar(mensagem, 'Mensagem copiada')}><Copy size={15} /> Copiar a mensagem</button>
        </div>
        <p className="text-[12.5px] text-muted">
          Vale por {DIAS_DO_CONVITE} dias e uma vez só. Este link não aparece de novo (o sistema guarda só uma “impressão digital” dele): se perder, é só gerar um convite novo.
        </p>
      </div>
    </Modal>
  );
}

/** Dar acesso: nome e e-mail (na aba Acessos, também o cliente). */
function DarAcesso({ clienteId, onClose, onPronto }: { clienteId?: string; onClose: () => void; onPronto: (c: { nome: string; email: string; r: ConviteGerado }) => void }) {
  const qc = useQueryClient();
  const [cliente, setCliente] = useState(clienteId ?? '');
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const clientes = useQuery({ queryKey: ['clients', 'options', 'com-produtos'], queryFn: () => api.clients.options({ withProducts: true }), enabled: !clienteId, staleTime: 60_000 });
  const opcoes = useMemo(() => (clientes.data ?? []).filter((c) => (c.products ?? []).length > 0).map((c) => ({ id: c.id, nome: c.name })), [clientes.data]);
  const dar = useMutation({
    mutationFn: () => api.portalAdmin.darAcesso(cliente, { nome: nome.trim(), email: email.trim() }),
    onSuccess: (r) => { void qc.invalidateQueries({ queryKey: ['portal-admin', 'acessos'] }); onPronto({ nome: nome.trim(), email: email.trim().toLowerCase(), r }); },
  });
  const enviar = (e: FormEvent) => { e.preventDefault(); if (cliente) dar.mutate(); };
  return (
    <Modal open onClose={onClose} titulo="Dar acesso ao portal" largura="max-w-md" rodape={<>
      <button className="btn-ghost" onClick={onClose}>Cancelar</button>
      <button className="btn-primary" form="form-dar-acesso" disabled={!cliente || nome.trim().length < 2 || !email.includes('@') || dar.isPending}>{dar.isPending ? <Spinner className="text-white" /> : <><MailPlus size={15} /> Gerar o convite</>}</button>
    </>}>
      <form id="form-dar-acesso" onSubmit={enviar} className="flex flex-col gap-3">
        {!clienteId && (
          <Campo label="Cliente" dica="Só aparecem os clientes da base (com produto ativo).">
            <EscolherComBusca valor={cliente} opcoes={opcoes} onChange={setCliente} placeholder="Escolha o cliente…" procurar="Procurar cliente…" largura="w-[360px]" id="acesso-cliente" />
          </Campo>
        )}
        <Campo label="Nome da pessoa"><input className="input" id="acesso-nome" autoComplete="off" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Maria Souza" autoFocus /></Campo>
        <Campo label="E-mail" dica="É o login dela no portal (uma pessoa, um e-mail)."><input className="input" id="acesso-email" type="email" autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="maria@empresa.com.br" /></Campo>
        {dar.error && <p className="text-bad text-[13.5px]" role="alert">{mensagemErro(dar.error)}</p>}
      </form>
    </Modal>
  );
}

function CorrigirAcesso({ a, onClose }: { a: AcessoPortal; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [nome, setNome] = useState(a.nome);
  const [email, setEmail] = useState(a.email);
  const corrigir = useMutation({
    mutationFn: () => api.portalAdmin.corrigirAcesso(a.id, { nome: nome.trim(), email: email.trim() }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['portal-admin', 'acessos'] }); toast.push('ok', 'Acesso corrigido'); onClose(); },
  });
  return (
    <Modal open onClose={onClose} titulo="Corrigir o acesso" largura="max-w-md" rodape={<>
      <button className="btn-ghost" onClick={onClose}>Cancelar</button>
      <button className="btn-primary" form="form-corrigir-acesso" disabled={corrigir.isPending}>{corrigir.isPending ? <Spinner className="text-white" /> : 'Salvar'}</button>
    </>}>
      <form id="form-corrigir-acesso" onSubmit={(e) => { e.preventDefault(); corrigir.mutate(); }} className="flex flex-col gap-3">
        <Campo label="Nome da pessoa"><input className="input" value={nome} onChange={(e) => setNome(e.target.value)} autoFocus /></Campo>
        <Campo label="E-mail" dica="Trocar o e-mail troca o login (a senha continua a mesma)."><input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></Campo>
        {corrigir.error && <p className="text-bad text-[13.5px]" role="alert">{mensagemErro(corrigir.error)}</p>}
      </form>
    </Modal>
  );
}

/**
 * A lista de acessos. Com `clienteId`: os de um cliente (a aba Portal da ficha), com o aviso de
 * quando ele está fora da base. Sem: os de todos, com a coluna do cliente e a busca.
 */
export function AcessosDoPortal({ clienteId }: { clienteId?: string }) {
  const { can } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const pode = can('portal.access');
  const [busca, setBusca] = useState('');
  const [dando, setDando] = useState(false);
  const [convite, setConvite] = useState<{ nome: string; email: string; r: ConviteGerado } | null>(null);
  const [corrigindo, setCorrigindo] = useState<AcessoPortal | null>(null);
  const [bloqueando, setBloqueando] = useState<AcessoPortal | null>(null);

  const doCliente = useQuery({ queryKey: ['portal-admin', 'acessos', 'cliente', clienteId], queryFn: () => api.portalAdmin.acessosDoCliente(clienteId!), enabled: !!clienteId });
  const todos = useQuery({ queryKey: ['portal-admin', 'acessos', 'todos'], queryFn: () => api.portalAdmin.acessos(), enabled: !clienteId });
  const q = clienteId ? doCliente : todos;
  const lista = (clienteId ? doCliente.data?.acessos : todos.data) ?? [];
  const termo = busca.trim().toLowerCase();
  const visiveis = termo ? lista.filter((a) => `${a.nome} ${a.email} ${a.cliente}`.toLowerCase().includes(termo)) : lista;

  const novoConvite = useMutation({
    mutationFn: (a: AcessoPortal) => api.portalAdmin.novoConvite(a.id),
    onSuccess: (r, a) => { void qc.invalidateQueries({ queryKey: ['portal-admin', 'acessos'] }); setConvite({ nome: a.nome, email: a.email, r }); },
    onError: (e) => toast.push('erro', mensagemErro(e)),
  });
  const bloquear = useMutation({
    mutationFn: (v: { a: AcessoPortal; bloquear: boolean }) => api.portalAdmin.bloquear(v.a.id, v.bloquear),
    onSuccess: (_r, v) => { void qc.invalidateQueries({ queryKey: ['portal-admin', 'acessos'] }); setBloqueando(null); toast.push('ok', v.bloquear ? `${v.a.nome} não entra mais no portal` : `${v.a.nome} pode entrar de novo`); },
    onError: (e) => toast.push('erro', mensagemErro(e)),
  });

  const fora = clienteId && doCliente.data && !doCliente.data.naBase;
  return (
    <div className="flex flex-col gap-3">
      {clienteId && (
        <div className="card p-4 flex flex-col sm:flex-row sm:items-center gap-3">
          <ShieldCheck size={22} className="text-accent shrink-0" />
          <p className="text-[13.5px] text-ink-2 flex-1">
            Cada pessoa entra com o próprio e-mail e a própria senha, e vê os tutoriais dos produtos que este cliente tem.
            Você gera o convite e manda pelo WhatsApp; <b>a pessoa cria a senha</b>. Se o cliente sair da base, o acesso cai sozinho.
          </p>
          {pode && <button className="btn-primary shrink-0" onClick={() => setDando(true)} disabled={!!fora}><UserPlus size={15} /> Dar acesso</button>}
        </div>
      )}
      {fora && (
        <div className="card border-signal bg-signal-soft p-3 flex gap-2 text-[13.5px]" role="status">
          <AlertTriangle size={16} className="text-signal shrink-0 mt-0.5" />
          <span>Ninguém deste cliente entra no portal agora: {doCliente.data!.motivo ?? 'ele está fora da base'}. Os acessos ficam guardados e voltam a valer sozinhos se ele voltar.</span>
        </div>
      )}
      {!clienteId && (
        <div className="flex flex-wrap items-center gap-2">
          <label className="relative flex-1 min-w-[220px] max-w-md">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input className="input pl-9" placeholder="Procurar por nome, e-mail ou cliente" value={busca} onChange={(e) => setBusca(e.target.value)} />
          </label>
          {pode && <button className="btn-primary ml-auto" onClick={() => setDando(true)}><UserPlus size={15} /> Dar acesso</button>}
        </div>
      )}

      {q.isLoading ? <Carregando /> : q.isError ? <p className="text-bad text-sm">{mensagemErro(q.error)}</p> : !visiveis.length ? (
        <Vazio titulo={termo ? `Ninguém com “${busca}”` : 'Ninguém tem acesso ainda'}
          texto={clienteId ? 'Dê acesso às pessoas do cliente que vão usar o portal (a recepção, o gestor, o TI).' : 'O acesso sai da ficha do cliente (aba Portal) ou do botão “Dar acesso”.'} />
      ) : (
        <div className="card overflow-x-auto">
          <table className="table">
            <thead><tr>
              <th>Pessoa</th>{!clienteId && <th>Cliente</th>}<th>Situação</th><th>Último acesso</th>{pode && <th className="text-right">Ações</th>}
            </tr></thead>
            <tbody>
              {visiveis.map((a) => (
                <tr key={a.id}>
                  <td className="min-w-[200px]"><div className="font-semibold">{a.nome}</div><div className="text-[12.5px] text-muted break-all">{a.email}</div></td>
                  {!clienteId && <td className="min-w-[160px]"><Link className="link" to={`/clientes/${a.clienteId}?aba=portal`}>{a.cliente}</Link></td>}
                  <td><ChipAcesso a={a} /></td>
                  <td className="text-[13px] whitespace-nowrap" title={a.ultimoAcesso ? data(a.ultimoAcesso, true) : undefined}>
                    {a.ultimoAcesso ? <>{relativo(a.ultimoAcesso)} <span className="text-muted">· {a.acessos} {a.acessos === 1 ? 'vez' : 'vezes'}</span></> : <span className="text-muted">nunca entrou</span>}
                  </td>
                  {pode && (
                    <td className="text-right whitespace-nowrap">
                      {a.situacao !== 'bloqueado' && a.situacao !== 'fora_da_base' && (
                        <button className="btn-ghost btn-sm" onClick={() => novoConvite.mutate(a)} disabled={novoConvite.isPending}
                          title={a.situacao === 'ativo' ? 'Esqueceu a senha? Um link novo para criar outra (a antiga vale até lá)' : 'Um link novo (o anterior deixa de valer)'}>
                          <KeyRound size={14} /> {a.situacao === 'ativo' ? 'Nova senha' : 'Novo convite'}
                        </button>
                      )}
                      <button className="btn-ghost btn-sm" onClick={() => setCorrigindo(a)} title="Corrigir o nome ou o e-mail"><Pencil size={14} /></button>
                      {a.situacao === 'bloqueado'
                        ? <button className="btn-ghost btn-sm text-ok" onClick={() => bloquear.mutate({ a, bloquear: false })}>Desbloquear</button>
                        : <button className="btn-ghost btn-sm text-bad" onClick={() => setBloqueando(a)} title="A pessoa saiu da empresa: não entra mais"><Ban size={14} /> Bloquear</button>}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {dando && <DarAcesso clienteId={clienteId} onClose={() => setDando(false)} onPronto={(c) => { setDando(false); setConvite(c); }} />}
      <ConvitePronto convite={convite} onClose={() => setConvite(null)} />
      {corrigindo && <CorrigirAcesso a={corrigindo} onClose={() => setCorrigindo(null)} />}
      <Confirmar open={!!bloqueando} onClose={() => setBloqueando(null)} onConfirm={() => bloqueando && bloquear.mutate({ a: bloqueando, bloquear: true })} loading={bloquear.isPending}
        perigoso titulo="Bloquear o acesso" botao="Bloquear"
        texto={<>{bloqueando?.nome} sai do portal na hora (se estiver com ele aberto, cai) e não entra mais. Os outros acessos de {bloqueando?.cliente} continuam. Dá para desbloquear depois.</>} />
    </div>
  );
}
