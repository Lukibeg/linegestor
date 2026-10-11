/**
 * Portal do cliente (Patch 1.8): quem da empresa do cliente pode entrar.
 *
 * Desde o 1.9 (decisão 0045) **o suporte cria o login e a senha**: o login é o e-mail da pessoa ou um
 * nome (como "maria.souza"), a senha o suporte escolhe (o "Gerar" dá uma fácil de ditar) e passa
 * pelo WhatsApp, com a mensagem pronta. A senha fica guardada no cofre: o olho mostra de novo (fica
 * na auditoria) e "Trocar a senha" cria outra quando a pessoa esquecer. O convite do 1.8 (a pessoa
 * criava a senha pelo link) saiu.
 *
 * O acesso cai sozinho quando o cliente sai da base (arquivado, na lixeira ou sem produto ativo) e
 * volta sozinho se ele voltar. Bloquear é para uma pessoa só (saiu da empresa).
 *
 * A mesma lista aparece na ficha do cliente (aba Portal) e no Portal do cliente › Acessos (todos).
 */
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { AlertTriangle, Ban, Copy, Dices, Eye, EyeOff, KeyRound, MessageCircle, Pencil, Search, ShieldCheck, UserPlus } from 'lucide-react';
import {
  LoginDoPortalSchema, NOMES_SITUACAO_ACESSO, SenhaDoPortalSchema, linkWhatsApp, loginSugerido, mensagemDoAcesso, senhaSugerida, type SituacaoAcesso,
} from '@gestor/shared';
import { api } from '../../api/index.js';
import type { AcessoPortal } from '../../api/types.js';
import { Campo, Carregando, Chip, Confirmar, EscolherComBusca, mensagemErro, Modal, Spinner, Vazio, useToast, type TomChip } from '../../components/ui/index.js';
import { useAuth } from '../../lib/auth.js';
import { data, relativo } from '../../lib/format.js';
import { linkDoPortal } from '../../portal/Corpo.js';

const TOM: Record<SituacaoAcesso, TomChip> = { ativo: 'ok', sem_senha: 'signal', bloqueado: 'bad', fora_da_base: 'muted' };

export function ChipAcesso({ a }: { a: Pick<AcessoPortal, 'situacao' | 'motivo'> }) {
  const dica = a.situacao === 'fora_da_base' ? `Não entra: ${a.motivo ?? 'o cliente saiu da base'}`
    : a.situacao === 'sem_senha' ? 'Acesso do 1.8 cujo convite não foi usado: defina a senha' : undefined;
  return <Chip tone={TOM[a.situacao]} title={dica}>{NOMES_SITUACAO_ACESSO[a.situacao]}</Chip>;
}

/** O nome do portal (vai na mensagem). */
const useTituloDoPortal = () => useQuery({ queryKey: ['portal-admin', 'ajustes'], queryFn: () => api.portalAdmin.ajustes(), staleTime: 5 * 60_000 }).data?.titulo ?? 'Central de ajuda Ingline';

/** O que acabou de ser criado, para passar à pessoa. */
type Pronto = { nome: string; login: string; senha: string; nova: boolean };

/**
 * O acesso pronto (ou a senha nova): o endereço, o login e a senha, com a mensagem pronta para o
 * WhatsApp (quem escolhe o contato é você, lá no WhatsApp).
 */
function AcessoPronto({ pronto, onClose }: { pronto: Pronto | null; onClose: () => void }) {
  const toast = useToast();
  const titulo = useTituloDoPortal();
  if (!pronto) return null;
  const link = linkDoPortal('/portal');
  const mensagem = mensagemDoAcesso({ nome: pronto.nome, portal: titulo, link, login: pronto.login, senha: pronto.senha, nova: pronto.nova });
  const copiar = async () => { try { await navigator.clipboard.writeText(mensagem); toast.push('ok', 'Mensagem copiada'); } catch { toast.push('erro', 'Não deu para copiar: selecione o texto e copie.'); } };
  const linha = (rotulo: string, valor: string, id: string) => (
    <div className="grid grid-cols-[80px_minmax(0,1fr)] items-baseline gap-2">
      <span className="text-[12.5px] text-muted">{rotulo}</span>
      <span className="font-mono text-[13.5px] break-all select-all" id={id}>{valor}</span>
    </div>
  );
  return (
    <Modal open onClose={onClose} titulo={pronto.nova ? 'Senha nova pronta' : 'Acesso pronto'} largura="max-w-lg" rodape={<button className="btn-secondary" onClick={onClose}>Fechar</button>}>
      <div className="flex flex-col gap-3">
        <p className="text-[14px]">Passe para <b>{pronto.nome}</b>:</p>
        <div className="rounded-lg border border-line bg-surface-2 px-3 py-2.5 flex flex-col gap-1.5">
          {linha('Endereço', link, 'acesso-link')}
          {linha('Login', pronto.login, 'acesso-login')}
          {linha('Senha', pronto.senha, 'acesso-senha')}
        </div>
        <div className="flex flex-wrap gap-2">
          <a className="btn-primary" href={linkWhatsApp(mensagem)} target="_blank" rel="noreferrer"><MessageCircle size={15} /> Mandar pelo WhatsApp</a>
          <button type="button" className="btn-secondary" onClick={copiar}><Copy size={15} /> Copiar a mensagem</button>
        </div>
        <p className="text-[12.5px] text-muted">A senha fica guardada: se a pessoa esquecer, o olho na lista de acessos mostra de novo (e fica registrado na auditoria).</p>
      </div>
    </Modal>
  );
}

/** A senha que o suporte escolhe: à vista (vai ser passada à pessoa), com "Gerar" e as regras. */
function CampoSenhaDoSuporte({ id, valor, onChange }: { id: string; valor: string; onChange: (v: string) => void }) {
  const regras = [
    { ok: valor.length >= 8, texto: '8 caracteres ou mais' },
    { ok: /\p{L}/u.test(valor) && /\d/.test(valor), texto: 'letras e números' },
  ];
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex gap-2">
        <input className="input font-mono" id={id} autoComplete="off" spellCheck={false} value={valor} onChange={(e) => onChange(e.target.value)} />
        <button type="button" className="btn-secondary shrink-0" onClick={() => onChange(senhaSugerida())} title="Uma senha fácil de ditar e de digitar no celular"><Dices size={15} /> Gerar</button>
      </div>
      <ul className="flex flex-wrap gap-x-3 gap-y-1 text-[12px]" aria-label="O que a senha precisa ter">
        {regras.map((r) => <li key={r.texto} className={r.ok ? 'text-ok' : 'text-muted'}>{r.ok ? '✓' : '○'} {r.texto}</li>)}
      </ul>
    </div>
  );
}

/** Dar acesso: o cliente (na aba Acessos), o nome, o login e a senha. */
function DarAcesso({ clienteId, onClose, onPronto }: { clienteId?: string; onClose: () => void; onPronto: (p: Pronto) => void }) {
  const qc = useQueryClient();
  const [cliente, setCliente] = useState(clienteId ?? '');
  const [nome, setNome] = useState('');
  const [login, setLogin] = useState('');
  const [loginMexido, setLoginMexido] = useState(false);
  const [senha, setSenha] = useState(() => senhaSugerida());
  const clientes = useQuery({ queryKey: ['clients', 'options', 'com-produtos'], queryFn: () => api.clients.options({ withProducts: true }), enabled: !clienteId, staleTime: 60_000 });
  const opcoes = useMemo(() => (clientes.data ?? []).filter((c) => (c.products ?? []).length > 0).map((c) => ({ id: c.id, nome: c.name })), [clientes.data]);
  // o login acompanha o nome ("Maria Souza" → maria.souza) até a pessoa mexer nele
  const loginFinal = loginMexido ? login : loginSugerido(nome);
  const loginOk = LoginDoPortalSchema.safeParse(loginFinal);
  const senhaOk = SenhaDoPortalSchema.safeParse(senha).success;
  const dar = useMutation({
    mutationFn: () => api.portalAdmin.darAcesso(cliente, { nome: nome.trim(), login: loginFinal, senha }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['portal-admin', 'acessos'] }); onPronto({ nome: nome.trim(), login: loginOk.success ? loginOk.data : loginFinal, senha, nova: false }); },
  });
  const pronto = !!cliente && nome.trim().length >= 2 && loginOk.success && senhaOk;
  const enviar = (e: FormEvent) => { e.preventDefault(); if (pronto) dar.mutate(); };
  return (
    <Modal open onClose={onClose} titulo="Dar acesso ao portal" largura="max-w-md" rodape={<>
      <button className="btn-ghost" onClick={onClose}>Cancelar</button>
      <button className="btn-primary" form="form-dar-acesso" disabled={!pronto || dar.isPending}>{dar.isPending ? <Spinner className="text-white" /> : <><UserPlus size={15} /> Dar acesso</>}</button>
    </>}>
      <form id="form-dar-acesso" onSubmit={enviar} className="flex flex-col gap-3">
        {!clienteId && (
          <Campo label="Cliente" dica="Só aparecem os clientes da base (com produto ativo).">
            <EscolherComBusca valor={cliente} opcoes={opcoes} onChange={setCliente} placeholder="Escolha o cliente…" procurar="Procurar cliente…" largura="w-[360px]" id="acesso-cliente" />
          </Campo>
        )}
        <Campo label="Nome da pessoa"><input className="input" id="acesso-nome" autoComplete="off" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Maria Souza" autoFocus /></Campo>
        <Campo label="Login" dica="o que a pessoa digita para entrar: o e-mail dela ou um nome, sem espaço e sem acento">
          <input className="input font-mono" id="acesso-login" autoComplete="off" autoCapitalize="none" spellCheck={false} value={loginFinal}
            onChange={(e) => { setLoginMexido(true); setLogin(e.target.value); }} placeholder="maria.souza" />
        </Campo>
        {loginFinal && !loginOk.success && <p className="text-[12.5px] text-bad -mt-1.5">{loginOk.error.issues[0]?.message}</p>}
        <Campo label="Senha" dica="você escolhe e passa para a pessoa; fica guardada aqui">
          <CampoSenhaDoSuporte id="acesso-senha" valor={senha} onChange={setSenha} />
        </Campo>
        {dar.error && <p className="text-bad text-[13.5px]" role="alert">{mensagemErro(dar.error)}</p>}
      </form>
    </Modal>
  );
}

/** Trocar a senha: a pessoa esqueceu (ou o acesso do 1.8 ainda não tinha senha). */
function TrocarSenha({ a, onClose, onPronto }: { a: AcessoPortal; onClose: () => void; onPronto: (p: Pronto) => void }) {
  const qc = useQueryClient();
  const [senha, setSenha] = useState(() => senhaSugerida());
  const trocar = useMutation({
    mutationFn: () => api.portalAdmin.trocarSenhaDoAcesso(a.id, senha),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['portal-admin', 'acessos'] }); onPronto({ nome: a.nome, login: a.login, senha, nova: true }); },
  });
  const ok = SenhaDoPortalSchema.safeParse(senha).success;
  return (
    <Modal open onClose={onClose} titulo={a.situacao === 'sem_senha' ? 'Definir a senha' : 'Trocar a senha'} largura="max-w-md" rodape={<>
      <button className="btn-ghost" onClick={onClose}>Cancelar</button>
      <button className="btn-primary" form="form-trocar-senha" disabled={!ok || trocar.isPending}>{trocar.isPending ? <Spinner className="text-white" /> : <><KeyRound size={15} /> Salvar a senha</>}</button>
    </>}>
      <form id="form-trocar-senha" onSubmit={(e) => { e.preventDefault(); if (ok) trocar.mutate(); }} className="flex flex-col gap-3">
        <p className="text-[14px]"><b>{a.nome}</b> <span className="text-muted">· login <span className="font-mono">{a.login}</span></span></p>
        <Campo label="Senha nova"><CampoSenhaDoSuporte id="acesso-senha-nova" valor={senha} onChange={setSenha} /></Campo>
        {a.situacao !== 'sem_senha' && <p className="text-[12.5px] text-muted">A senha atual deixa de valer na hora: se a pessoa estiver com o portal aberto, vai precisar entrar de novo.</p>}
        {trocar.error && <p className="text-bad text-[13.5px]" role="alert">{mensagemErro(trocar.error)}</p>}
      </form>
    </Modal>
  );
}

function CorrigirAcesso({ a, onClose }: { a: AcessoPortal; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [nome, setNome] = useState(a.nome);
  const [login, setLogin] = useState(a.login);
  const corrigir = useMutation({
    mutationFn: () => api.portalAdmin.corrigirAcesso(a.id, { nome: nome.trim(), login: login.trim() }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['portal-admin', 'acessos'] }); toast.push('ok', 'Acesso corrigido'); onClose(); },
  });
  return (
    <Modal open onClose={onClose} titulo="Corrigir o acesso" largura="max-w-md" rodape={<>
      <button className="btn-ghost" onClick={onClose}>Cancelar</button>
      <button className="btn-primary" form="form-corrigir-acesso" disabled={corrigir.isPending}>{corrigir.isPending ? <Spinner className="text-white" /> : 'Salvar'}</button>
    </>}>
      <form id="form-corrigir-acesso" onSubmit={(e) => { e.preventDefault(); corrigir.mutate(); }} className="flex flex-col gap-3">
        <Campo label="Nome da pessoa"><input className="input" value={nome} onChange={(e) => setNome(e.target.value)} autoFocus /></Campo>
        <Campo label="Login" dica="Trocar o login muda o que a pessoa digita para entrar (a senha continua a mesma)."><input className="input font-mono" autoCapitalize="none" spellCheck={false} value={login} onChange={(e) => setLogin(e.target.value)} /></Campo>
        {corrigir.error && <p className="text-bad text-[13.5px]" role="alert">{mensagemErro(corrigir.error)}</p>}
      </form>
    </Modal>
  );
}

/** A senha guardada: o olho mostra por alguns segundos (e fica registrado na auditoria). */
function SenhaDoAcesso({ a }: { a: AcessoPortal }) {
  const toast = useToast();
  const [senha, setSenha] = useState<string | null>(null);
  const timer = useRef<number | null>(null);
  useEffect(() => () => { if (timer.current) window.clearTimeout(timer.current); }, []);
  const ver = useMutation({
    mutationFn: () => api.portalAdmin.verSenhaDoAcesso(a.id),
    onSuccess: (r) => {
      setSenha(r.senha);
      if (timer.current) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setSenha(null), r.visivelPorSegundos * 1000);
    },
    onError: (e) => toast.push('erro', mensagemErro(e)),
  });
  if (a.situacao === 'sem_senha') return <span className="text-muted">—</span>;
  if (!a.senhaGuardada) return <span className="text-[12.5px] text-muted" title="Criada pela própria pessoa, pelo convite do 1.8: não fica guardada. Para passar uma senha, troque.">criada pela pessoa</span>;
  if (senha) {
    return (
      <span className="inline-flex items-center gap-1">
        <code className="font-mono text-[13px] bg-surface-2 border border-line rounded px-1.5 py-0.5 select-all">{senha}</code>
        <button type="button" className="btn-ghost btn-sm px-1.5" title="Copiar" aria-label="Copiar a senha" onClick={() => { void navigator.clipboard?.writeText(senha).then(() => toast.push('ok', 'Senha copiada')).catch(() => {}); }}><Copy size={13} /></button>
        <button type="button" className="btn-ghost btn-sm px-1.5" title="Esconder" aria-label="Esconder a senha" onClick={() => setSenha(null)}><EyeOff size={13} /></button>
      </span>
    );
  }
  return (
    <button type="button" className="btn-ghost btn-sm" onClick={() => ver.mutate()} disabled={ver.isPending} title="Ver a senha (fica registrado na auditoria)">
      <span className="font-mono tracking-widest text-muted">••••••</span> {ver.isPending ? <Spinner /> : <Eye size={14} />}
    </button>
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
  const [pronto, setPronto] = useState<Pronto | null>(null);
  const [trocando, setTrocando] = useState<AcessoPortal | null>(null);
  const [corrigindo, setCorrigindo] = useState<AcessoPortal | null>(null);
  const [bloqueando, setBloqueando] = useState<AcessoPortal | null>(null);

  const doCliente = useQuery({ queryKey: ['portal-admin', 'acessos', 'cliente', clienteId], queryFn: () => api.portalAdmin.acessosDoCliente(clienteId!), enabled: !!clienteId });
  const todos = useQuery({ queryKey: ['portal-admin', 'acessos', 'todos'], queryFn: () => api.portalAdmin.acessos(), enabled: !clienteId });
  const q = clienteId ? doCliente : todos;
  const lista = (clienteId ? doCliente.data?.acessos : todos.data) ?? [];
  const termo = busca.trim().toLowerCase();
  const visiveis = termo ? lista.filter((a) => `${a.nome} ${a.login} ${a.cliente}`.toLowerCase().includes(termo)) : lista;

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
            Cada pessoa entra com o <b>login e a senha que você cria aqui</b> (o login pode ser o e-mail dela ou um nome, como maria.souza) e vê os
            tutoriais dos produtos que este cliente tem. A senha fica guardada: dá para ver e trocar quando a pessoa esquecer. Se o cliente sair da base, o acesso cai sozinho.
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
            <input className="input pl-9" placeholder="Procurar por nome, login ou cliente" value={busca} onChange={(e) => setBusca(e.target.value)} />
          </label>
          {pode && <button className="btn-primary ml-auto" onClick={() => setDando(true)}><UserPlus size={15} /> Dar acesso</button>}
        </div>
      )}
      {!clienteId && (
        // decisão 0044: a equipe usa o próprio login do Gestor no portal
        <p className="text-[12.5px] text-muted -mt-1">Os acessos são das pessoas dos clientes. A equipe não precisa de acesso aqui: entra no portal com o e-mail e a senha do Gestor.</p>
      )}

      {q.isLoading ? <Carregando /> : q.isError ? <p className="text-bad text-sm">{mensagemErro(q.error)}</p> : !visiveis.length ? (
        <Vazio titulo={termo ? `Ninguém com “${busca}”` : 'Ninguém tem acesso ainda'}
          texto={clienteId ? 'Dê acesso às pessoas do cliente que vão usar o portal (a recepção, o gestor, o TI).' : 'O acesso sai da ficha do cliente (aba Portal) ou do botão “Dar acesso”.'} />
      ) : (
        <div className="card overflow-x-auto">
          <table className="table">
            <thead><tr>
              <th>Pessoa</th>{!clienteId && <th>Cliente</th>}<th>Situação</th>{pode && <th>Senha</th>}<th>Último acesso</th>{pode && <th className="!text-right">Ações</th>}
            </tr></thead>
            <tbody>
              {visiveis.map((a) => (
                <tr key={a.id}>
                  <td className="min-w-[180px]"><div className="font-semibold">{a.nome}</div><div className="text-[12.5px] text-muted font-mono break-all">{a.login}</div></td>
                  {!clienteId && <td className="min-w-[160px]"><Link className="link" to={`/clientes/${a.clienteId}?aba=portal`}>{a.cliente}</Link></td>}
                  <td><ChipAcesso a={a} /></td>
                  {pode && <td className="whitespace-nowrap"><SenhaDoAcesso a={a} /></td>}
                  <td className="text-[13px] whitespace-nowrap" title={a.ultimoAcesso ? data(a.ultimoAcesso, true) : undefined}>
                    {a.ultimoAcesso ? <>{relativo(a.ultimoAcesso)} <span className="text-muted">· {a.acessos} {a.acessos === 1 ? 'vez' : 'vezes'}</span></> : <span className="text-muted">nunca entrou</span>}
                  </td>
                  {pode && (
                    <td className="text-right whitespace-nowrap">
                      {a.situacao !== 'bloqueado' && a.situacao !== 'fora_da_base' && (
                        <button className="btn-ghost btn-sm" onClick={() => setTrocando(a)} title={a.situacao === 'sem_senha' ? 'Criar a senha e passar para a pessoa' : 'Esqueceu a senha? Crie outra (a atual deixa de valer)'}>
                          <KeyRound size={14} /> {a.situacao === 'sem_senha' ? 'Definir a senha' : 'Trocar a senha'}
                        </button>
                      )}
                      <button className="btn-ghost btn-sm" onClick={() => setCorrigindo(a)} title="Corrigir o nome ou o login" aria-label="Corrigir o nome ou o login"><Pencil size={14} /></button>
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

      {dando && <DarAcesso clienteId={clienteId} onClose={() => setDando(false)} onPronto={(p) => { setDando(false); setPronto(p); }} />}
      {trocando && <TrocarSenha a={trocando} onClose={() => setTrocando(null)} onPronto={(p) => { setTrocando(null); setPronto(p); }} />}
      <AcessoPronto pronto={pronto} onClose={() => setPronto(null)} />
      {corrigindo && <CorrigirAcesso a={corrigindo} onClose={() => setCorrigindo(null)} />}
      <Confirmar open={!!bloqueando} onClose={() => setBloqueando(null)} onConfirm={() => bloqueando && bloquear.mutate({ a: bloqueando, bloquear: true })} loading={bloquear.isPending}
        perigoso titulo="Bloquear o acesso" botao="Bloquear"
        texto={<>{bloqueando?.nome} sai do portal na hora (se estiver com ele aberto, cai) e não entra mais. Os outros acessos de {bloqueando?.cliente} continuam. Dá para desbloquear depois.</>} />
    </div>
  );
}
