/**
 * Ficha do cliente: uma página com endereço próprio e abas.
 * Visão geral · Produtos · DIDs · Equipamentos · Acessos · Histórico
 */
import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Archive, ExternalLink, Pencil, Terminal, Trash2 } from 'lucide-react';
import { api } from '../../api/index.js';
import type { ClientFull, Product, ProductModule, Subscription, SubscriptionModule } from '../../api/types.js';
import { Pagina } from '../../components/layout/AppShell.js';
import { Can, useAuth } from '../../lib/auth.js';
import { Abas, Campo, CampoSegredo, Carregando, Chip, Confirmar, mensagemErro, Modal, Spinner, Vazio, useToast } from '../../components/ui/index.js';
import { cnpjFormatado, condicaoCor, condicaoNome, data, MODALIDADES, relativo } from '../../lib/format.js';
import { ClienteForm } from './Form.js';

type Aba = 'geral' | 'produtos' | 'dids' | 'equipamentos' | 'acessos' | 'historico';

export function ClienteFicha() {
  const { id = '' } = useParams();
  const [sp, setSp] = useSearchParams();
  const aba = (sp.get('aba') ?? 'geral') as Aba;
  const nav = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const { can } = useAuth();
  const q = useQuery({ queryKey: ['client', id], queryFn: () => api.clients.get(id) });
  const [editar, setEditar] = useState(false);
  const [excluir, setExcluir] = useState(false);
  const [busy, setBusy] = useState(false);

  if (q.isLoading) return <Carregando />;
  if (q.isError || !q.data) return <Vazio titulo="Cliente não encontrado" acao={<Link className="btn-secondary" to="/clientes">Voltar</Link>} />;
  const c = q.data;
  const ativos = c.subscriptions.filter((s) => s.active);

  const doDelete = async () => { setBusy(true); try { await api.clients.remove(c.id); toast.push('ok', `${c.tradeName} foi para a lixeira`); await qc.invalidateQueries({ queryKey: ['clients'] }); nav('/clientes'); } catch (e) { toast.push('erro', mensagemErro(e)); } finally { setBusy(false); } };
  const toggleArchive = async () => { try { await api.clients.update(c.id, { archived: !c.archived }); await qc.invalidateQueries({ queryKey: ['client', id] }); toast.push('ok', c.archived ? 'Cliente desarquivado' : 'Cliente arquivado'); } catch (e) { toast.push('erro', mensagemErro(e)); } };

  return (
    <Pagina
      titulo={<span className="flex items-center gap-2">{c.tradeName}{c.archived && <Chip tone="muted">arquivado</Chip>}</span>}
      sub={<span>{c.legalName} · <span className="font-mono">{cnpjFormatado(c.cnpj)}</span></span>}
      acoes={<>
        {c.links.web && <a href={c.links.web} target="_blank" rel="noreferrer" className="btn-secondary"><ExternalLink size={15} /> Abrir</a>}
        {c.links.ssh && can('access.use') && <a href={c.links.ssh} className="btn-secondary"><Terminal size={15} /> SSH</a>}
        {c.links.fop2 && can('access.use') && <a href={c.links.fop2} target="_blank" rel="noreferrer" className="btn-secondary">FOP2</a>}
        <Can permission="records.write"><button className="btn-secondary" onClick={() => setEditar(true)}><Pencil size={15} /> Editar</button><button className="btn-ghost" onClick={toggleArchive}><Archive size={15} /> {c.archived ? 'Desarquivar' : 'Arquivar'}</button></Can>
        <Can permission="records.delete"><button className="btn-ghost text-bad" onClick={() => setExcluir(true)}><Trash2 size={15} /></button></Can>
      </>}
    >
      <Abas atual={aba} onChange={(a) => setSp({ aba: a }, { replace: true })} abas={[
        { id: 'geral', label: 'Visão geral' }, { id: 'produtos', label: <>Produtos <span className="text-muted">({ativos.length})</span></> },
        { id: 'dids', label: <>DIDs <span className="text-muted">({c.didCount})</span></> }, { id: 'equipamentos', label: <>Equipamentos <span className="text-muted">({c.deviceCount})</span></> },
        { id: 'acessos', label: 'Acessos' }, ...(can('audit.read') ? [{ id: 'historico' as Aba, label: 'Histórico' }] : []),
      ]} />
      {aba === 'geral' && <Geral c={c} />}
      {aba === 'produtos' && <Produtos c={c} />}
      {aba === 'dids' && <Dids c={c} />}
      {aba === 'equipamentos' && <Equipamentos c={c} />}
      {aba === 'acessos' && <Acessos c={c} />}
      {aba === 'historico' && <Historico c={c} />}
      <ClienteForm open={editar} onClose={() => setEditar(false)} cliente={c} onSaved={() => setEditar(false)} />
      <Confirmar open={excluir} onClose={() => setExcluir(false)} onConfirm={doDelete} loading={busy} perigoso digitar={c.tradeName} titulo="Mandar para a lixeira" botao="Mandar para a lixeira" texto={<>O cliente <b>{c.tradeName}</b> sai de todas as listas. Os {c.didCount} DIDs continuam alocados a ele e os {c.deviceCount} aparelhos continuam registrados — nada é apagado. Dá para restaurar em Administração → Lixeira.</>} />
    </Pagina>
  );
}

function Geral({ c }: { c: ClientFull }) {
  const ativos = c.subscriptions.filter((s) => s.active);
  const lp = ativos.find((s) => s.productCode === 'linepbx')?.settings;
  return (
    <div className="grid gap-4 md:grid-cols-3">
      <div className="card p-4 md:col-span-2">
        <div className="eyebrow mb-2">Produtos ativos e seus módulos</div>
        <div className="flex flex-wrap gap-1.5 mb-4">
          {ativos.map((s) => {
            const mods = s.modules.filter((m) => m.active);
            return <span key={s.id} className="inline-flex items-center gap-1"><Chip color={s.color}>{s.productName}</Chip>{mods.map((m) => <Chip key={m.id} color={s.color} className="opacity-80" title={`módulo do ${s.productName}`}>› {m.moduleName}</Chip>)}</span>;
          })}
          {!ativos.length && <span className="text-muted text-sm">Nenhum produto marcado ainda.</span>}
        </div>
        <div className="eyebrow mb-2">Servidor (LinePBX)</div>
        {lp ? (
          <dl className="grid grid-cols-[120px_1fr] gap-y-1.5 text-sm">
            <dt className="text-muted">Hospedagem</dt><dd>{lp.hostingName ?? '—'}</dd>
            <dt className="text-muted">Endereço</dt><dd className="font-mono">{lp.domain ?? '—'}</dd>
            <dt className="text-muted">IP</dt><dd className="font-mono">{lp.serverIp ?? '—'}</dd>
            <dt className="text-muted">SSH</dt><dd className="font-mono">{lp.sshUser ? `${lp.sshUser}@ porta ${lp.sshPort ?? 22}` : '—'}</dd>
          </dl>
        ) : <div className="text-muted text-sm">Este cliente não tem LinePBX.</div>}
        {c.notes && <><div className="eyebrow mt-4 mb-1">Anotações</div><p className="text-sm whitespace-pre-wrap">{c.notes}</p></>}
      </div>
      <div className="flex flex-col gap-3">
        <div className="card p-4"><div className="eyebrow">DIDs em uso</div><div className="font-display text-2xl font-semibold tnum">{c.didCount}</div></div>
        <div className="card p-4"><div className="eyebrow">Aparelhos com o cliente</div><div className="font-display text-2xl font-semibold tnum">{c.deviceCount}</div></div>
        <div className="card p-4"><div className="eyebrow">Módulos ligados</div><div className="font-display text-2xl font-semibold tnum">{ativos.reduce((a, s) => a + s.modules.filter((m) => m.active).length, 0)}</div><div className="text-muted text-[12px]">Omniboard, FOP2, NPS, dashboard de filas…</div></div>
        <div className="card p-4 text-[12.5px] text-muted">Cadastrado em {data(c.createdAt)} · atualizado {relativo(c.updatedAt)}</div>
      </div>
    </div>
  );
}

// ---------- Produtos e módulos ----------
function Produtos({ c }: { c: ClientFull }) {
  const prods = useQuery({ queryKey: ['products'], queryFn: api.admin.products });
  const [editando, setEditando] = useState<string | null>(null);
  const [editandoModulo, setEditandoModulo] = useState<{ product: Product; module: ProductModule } | null>(null);
  const qc = useQueryClient();
  const toast = useToast();
  const { can } = useAuth();
  const atualizar = () => Promise.all([qc.invalidateQueries({ queryKey: ['client', c.id] }), qc.invalidateQueries({ queryKey: ['clients'] })]);
  const encerrar = async (code: string) => { try { await api.clients.endSubscription(c.id, code); await atualizar(); toast.push('ok', 'Produto encerrado (histórico mantido)'); } catch (e) { toast.push('erro', mensagemErro(e)); } };
  const desligarModulo = async (p: Product, m: ProductModule) => { try { await api.clients.endModule(c.id, p.code, m.code); await atualizar(); toast.push('ok', `${m.name} desligado (histórico mantido)`); } catch (e) { toast.push('erro', mensagemErro(e)); } };
  const ligarModulo = async (p: Product, m: ProductModule) => {
    if (m.hasSettings) { setEditandoModulo({ product: p, module: m }); return; }
    try { await api.clients.upsertModule(c.id, { productCode: p.code, moduleCode: m.code }); await atualizar(); toast.push('ok', `${m.name} ligado em ${p.name}`); } catch (e) { toast.push('erro', mensagemErro(e)); }
  };
  return (
    <div>
      <p className="text-sm text-muted mb-3">Clique num produto para marcar ou ajustar. Dentro de cada produto ativo, ligue os <b>módulos</b> que o cliente usa. Desmarcar não apaga: fica registrado quando terminou.</p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {prods.data?.filter((p) => p.active).map((p) => {
          const s = c.subscriptions.find((x) => x.productCode === p.code);
          const on = !!s?.active;
          const modulos = p.modules.filter((m) => m.active);
          return (
            <div key={p.code} className={`card p-4 flex flex-col gap-2 ${on ? '' : 'opacity-70'}`} style={on ? { borderColor: p.color } : undefined}>
              <div className="flex items-center justify-between"><Chip color={p.color}>{p.name}</Chip>{on ? <span className="text-ok text-[12px] font-semibold">ativo</span> : s ? <span className="text-muted text-[12px]">encerrado em {data(s.deactivatedAt)}</span> : <span className="text-muted text-[12px]">não assina</span>}</div>
              <div className="text-[12.5px] text-muted">{p.description}</div>
              {on && s && <div className="text-[12.5px]">desde {data(s.activatedAt)}</div>}
              {on && s?.notes && <div className="text-[12.5px] text-ink-2 italic truncate" title={s.notes}>{s.notes}</div>}
              {modulos.length > 0 && (
                <div className="mt-1 border-t border-line pt-2">
                  <div className="eyebrow mb-1">Módulos</div>
                  <ul className="flex flex-col gap-1">
                    {modulos.map((m) => {
                      const sm = s?.modules.find((x) => x.moduleCode === m.code);
                      const ligado = on && !!sm?.active;
                      return (
                        <li key={m.code} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12.5px]">
                          <span className={`w-2 h-2 rounded-full shrink-0 ${ligado ? 'bg-ok' : 'bg-line-strong'}`} aria-hidden />
                          <span className={ligado ? 'font-medium' : 'text-muted'} title={m.description ?? undefined}>{m.name}</span>
                          {ligado && sm?.activatedAt && <span className="text-muted whitespace-nowrap">desde {data(sm.activatedAt)}</span>}
                          {!ligado && sm && sm.deactivatedAt && <span className="text-muted">desligado {data(sm.deactivatedAt)}</span>}
                          {on && can('records.write') && (
                            <span className="ml-auto flex gap-1">
                              {ligado ? (<>
                                {m.hasSettings && <button className="btn-ghost btn-sm" onClick={() => setEditandoModulo({ product: p, module: m })}>Ajustar</button>}
                                <button className="btn-ghost btn-sm text-muted" onClick={() => desligarModulo(p, m)}>Desligar</button>
                              </>) : <button className="btn-secondary btn-sm" onClick={() => ligarModulo(p, m)}>Ligar</button>}
                            </span>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
              {can('records.write') && (
                <div className="flex gap-2 mt-auto pt-1">
                  <button className="btn-secondary btn-sm" onClick={() => setEditando(p.code)}>{on ? 'Ajustar' : 'Marcar'}</button>
                  {on && <button className="btn-ghost btn-sm text-muted" onClick={() => encerrar(p.code)}>Encerrar</button>}
                </div>
              )}
            </div>
          );
        })}
      </div>
      {editando && <ProdutoForm c={c} code={editando} sub={c.subscriptions.find((x) => x.productCode === editando)} onClose={() => setEditando(null)} />}
      {editandoModulo && <ModuloForm c={c} product={editandoModulo.product} module={editandoModulo.module} sm={c.subscriptions.find((x) => x.productCode === editandoModulo.product.code)?.modules.find((x) => x.moduleCode === editandoModulo.module.code)} onClose={() => setEditandoModulo(null)} />}
    </div>
  );
}

function ProdutoForm({ c, code, sub, onClose }: { c: ClientFull; code: string; sub?: Subscription; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const { can } = useAuth();
  const hostings = useQuery({ queryKey: ['catalog', 'hostings'], queryFn: () => api.admin.catalog('hostings'), enabled: code === 'linepbx' });
  const st = sub?.settings ?? {};
  const [f, setF] = useState<Record<string, any>>({ activatedAt: sub?.activatedAt?.slice(0, 10) ?? new Date().toISOString().slice(0, 10), notes: sub?.notes ?? '', hostingId: st.hostingId ?? '', serverIp: st.serverIp ?? '', domain: st.domain ?? '', sshUser: st.sshUser ?? '', sshPort: st.sshPort ?? 22, adminLogin: st.adminLogin ?? '' });
  const [senhas, setSenhas] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const nome = { linepbx: 'LinePBX', szchat: 'SZChat', linereports: 'LineReports', linechat: 'LineChat', voicenet: 'VoiceNet', equipamentos: 'Equipamentos' }[code] ?? code;
  const podeServidor = can('servers.write');
  const save = async () => {
    setBusy(true); setErr('');
    try {
      const settings: Record<string, unknown> = {};
      if (code === 'linepbx' && podeServidor) Object.assign(settings, { hostingId: f.hostingId || null, serverIp: f.serverIp || null, domain: f.domain || null, sshUser: f.sshUser || null, sshPort: Number(f.sshPort) || 22, ...(senhas.sshPassword ? { sshPassword: senhas.sshPassword } : {}) });
      if (code === 'szchat') Object.assign(settings, { adminLogin: f.adminLogin || null, ...(senhas.adminPassword ? { adminPassword: senhas.adminPassword } : {}) });
      await api.clients.upsertSubscription(c.id, { productCode: code, activatedAt: f.activatedAt ? new Date(f.activatedAt).toISOString() : null, notes: f.notes || null, settings });
      await qc.invalidateQueries({ queryKey: ['client', c.id] }); await qc.invalidateQueries({ queryKey: ['clients'] });
      toast.push('ok', `${nome} salvo`); onClose();
    } catch (e) { setErr(mensagemErro(e)); } finally { setBusy(false); }
  };
  const seg = (key: 'sshPassword' | 'adminPassword', label: string) => (
    <Campo label={label}><CampoSegredo secretId={st[key]?.secretId ?? null} hasSecret={!!st[key]?.hasSecret} podeRevelar={can('secrets.reveal')} onReveal={api.secrets.reveal} onChangeNovo={(v) => setSenhas({ ...senhas, [key]: v })} /></Campo>
  );
  return (
    <Modal open onClose={onClose} lateral largura="max-w-xl" titulo={<span className="flex items-center gap-2">{sub?.active ? 'Ajustar' : 'Marcar'} <Chip color={sub?.color}>{nome}</Chip> em {c.tradeName}</span>} rodape={<><button className="btn-secondary" onClick={onClose}>Cancelar</button><button className="btn-primary" disabled={busy} onClick={save}>{busy ? <Spinner className="text-white" /> : 'Salvar'}</button></>}>
      <div className="flex flex-col gap-3">
        <Campo label="Ativado em" className="max-w-[220px]"><input type="date" className="input" value={f.activatedAt} onChange={(e) => setF({ ...f, activatedAt: e.target.value })} /></Campo>
        {code === 'linepbx' && (
          <fieldset className="card p-3 flex flex-col gap-3" disabled={!podeServidor}>
            <legend className="eyebrow px-1">Servidor {!podeServidor && '· somente leitura (sem permissão)'}</legend>
            <Campo label="Hospedagem"><select className="input" value={f.hostingId} onChange={(e) => setF({ ...f, hostingId: e.target.value })}><option value="">Selecionar…</option>{hostings.data?.filter((h) => h.active).map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}</select></Campo>
            <div className="grid grid-cols-2 gap-3">
              <Campo label="Endereço (domínio)"><input className="input font-mono" placeholder="cliente.linepbx.com.br" value={f.domain} onChange={(e) => setF({ ...f, domain: e.target.value })} /></Campo>
              <Campo label="IP do servidor"><input className="input font-mono" placeholder="0.0.0.0" value={f.serverIp} onChange={(e) => setF({ ...f, serverIp: e.target.value })} /></Campo>
              <Campo label="Usuário SSH"><input className="input font-mono" placeholder="root" value={f.sshUser} onChange={(e) => setF({ ...f, sshUser: e.target.value })} /></Campo>
              <Campo label="Porta SSH"><input className="input font-mono tnum" value={f.sshPort} onChange={(e) => setF({ ...f, sshPort: e.target.value })} /></Campo>
            </div>
            {seg('sshPassword', 'Senha SSH')}
          </fieldset>
        )}
        {code === 'szchat' && (<>
          <Campo label="E-mail do administrador"><input className="input" value={f.adminLogin} onChange={(e) => setF({ ...f, adminLogin: e.target.value })} /></Campo>
          {seg('adminPassword', 'Senha do administrador')}
        </>)}
        <Campo label="Anotações deste produto" dica={code === 'linepbx' ? 'configurações, acessos, VPN…' : code === 'equipamentos' ? 'contratos, termos…' : 'regras internas, informações…'}><textarea className="input" rows={4} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Campo>
        {err && <div className="text-bad text-sm">{err}</div>}
      </div>
    </Modal>
  );
}

/** Ligar/ajustar um módulo dentro de um produto. FOP2 e Omniboard têm campos próprios; os demais só data e anotações. */
function ModuloForm({ c, product, module, sm, onClose }: { c: ClientFull; product: Product; module: ProductModule; sm?: SubscriptionModule; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const { can } = useAuth();
  const st = sm?.settings ?? {};
  const [f, setF] = useState<Record<string, any>>({ activatedAt: sm?.activatedAt?.slice(0, 10) ?? new Date().toISOString().slice(0, 10), notes: sm?.notes ?? '', adminExtension: st.adminExtension ?? '', adminLogin: st.adminLogin ?? '' });
  const [senhas, setSenhas] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const save = async () => {
    setBusy(true); setErr('');
    try {
      const settings: Record<string, unknown> = {};
      if (module.code === 'fop2') settings.adminExtension = f.adminExtension || null;
      if (module.code === 'omniboard') Object.assign(settings, { adminLogin: f.adminLogin || null, ...(senhas.adminPassword ? { adminPassword: senhas.adminPassword } : {}), ...(senhas.userDefaultPassword ? { userDefaultPassword: senhas.userDefaultPassword } : {}) });
      await api.clients.upsertModule(c.id, { productCode: product.code, moduleCode: module.code, activatedAt: f.activatedAt ? new Date(f.activatedAt).toISOString() : null, notes: f.notes || null, settings });
      await qc.invalidateQueries({ queryKey: ['client', c.id] }); await qc.invalidateQueries({ queryKey: ['clients'] });
      toast.push('ok', `${module.name} salvo`); onClose();
    } catch (e) { setErr(mensagemErro(e)); } finally { setBusy(false); }
  };
  const seg = (key: 'adminPassword' | 'userDefaultPassword', label: string) => (
    <Campo label={label}><CampoSegredo secretId={st[key]?.secretId ?? null} hasSecret={!!st[key]?.hasSecret} podeRevelar={can('secrets.reveal')} onReveal={api.secrets.reveal} onChangeNovo={(v) => setSenhas({ ...senhas, [key]: v })} /></Campo>
  );
  return (
    <Modal open onClose={onClose} lateral largura="max-w-lg" titulo={<span className="flex items-center gap-2">{sm?.active ? 'Ajustar' : 'Ligar'} <Chip color={product.color}>{product.name} › {module.name}</Chip></span>} rodape={<><button className="btn-secondary" onClick={onClose}>Cancelar</button><button className="btn-primary" disabled={busy} onClick={save}>{busy ? <Spinner className="text-white" /> : 'Salvar'}</button></>}>
      <div className="flex flex-col gap-3">
        {module.description && <p className="text-sm text-muted">{module.description}</p>}
        <Campo label="Ligado em" className="max-w-[220px]"><input type="date" className="input" value={f.activatedAt} onChange={(e) => setF({ ...f, activatedAt: e.target.value })} /></Campo>
        {module.code === 'fop2' && <Campo label="Ramal / usuário admin do FOP2" dica="usado para o acesso rápido"><input className="input font-mono" value={f.adminExtension} onChange={(e) => setF({ ...f, adminExtension: e.target.value })} /></Campo>}
        {module.code === 'omniboard' && (<>
          <Campo label="E-mail do administrador"><input className="input" value={f.adminLogin} onChange={(e) => setF({ ...f, adminLogin: e.target.value })} /></Campo>
          {seg('adminPassword', 'Senha do administrador')}
          {seg('userDefaultPassword', 'Senha padrão de usuário novo')}
        </>)}
        <Campo label="Anotações deste módulo" dica="regras internas, personalizações…"><textarea className="input" rows={3} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Campo>
        {err && <div className="text-bad text-sm">{err}</div>}
      </div>
    </Modal>
  );
}

// ---------- DIDs ----------
function Dids({ c }: { c: ClientFull }) {
  const q = useQuery({ queryKey: ['client-dids', c.id], queryFn: () => api.clients.dids(c.id) });
  if (q.isLoading) return <Carregando />;
  const items = q.data?.items ?? [];
  if (!items.length) return <Vazio titulo="Nenhum DID com este cliente" texto="Aloque números em Circuitos › Numeração, selecionando os desejados e escolhendo este cliente." acao={<Link className="btn-secondary" to="/circuitos?aba=numeracao&cliente=free">Ver DIDs livres</Link>} />;
  return (
    <div className="card overflow-x-auto">
      <table className="table"><thead><tr><th>Número</th><th>Operadora</th><th>Circuito</th><th>Titular</th><th>Observação</th></tr></thead>
        <tbody>{items.map((d) => <tr key={d.id}><td className="font-mono tnum">{d.numberFormatted}</td><td>{d.carrierName ?? '—'}</td><td>{d.circuitId ? <Link className="link" to={`/circuitos/${d.circuitId}`}>{d.circuitName}</Link> : <span className="text-muted">sem circuito</span>}</td><td>{d.ownerName ?? '—'}</td><td className="text-muted">{d.note}</td></tr>)}</tbody></table>
      <div className="px-3 py-2 text-[12.5px] text-muted border-t border-line"><Link className="link" to={`/circuitos?aba=numeracao&cliente=${c.id}`}>Abrir em Circuitos › Numeração</Link> para editar em massa.</div>
    </div>
  );
}

// ---------- Equipamentos ----------
function Equipamentos({ c }: { c: ClientFull }) {
  const q = useQuery({ queryKey: ['client-devices', c.id], queryFn: () => api.clients.devices(c.id) });
  const temProduto = c.subscriptions.some((s) => s.productCode === 'equipamentos' && s.active);
  if (q.isLoading) return <Carregando />;
  const devs = q.data?.devices.items ?? []; const bulk = q.data?.bulk ?? [];
  if (!devs.length && !bulk.length) return <Vazio titulo="Nenhum aparelho com este cliente" texto={temProduto ? 'Use "Movimentar aparelhos" no Inventário para locar, vender ou emprestar.' : 'Para movimentar aparelhos para este cliente, marque o produto Equipamentos na aba Produtos.'} acao={<Link className="btn-secondary" to="/inventario">Ir para o Inventário</Link>} />;
  return (
    <div className="flex flex-col gap-3">
      {devs.length > 0 && (
        <div className="card overflow-x-auto"><table className="table"><thead><tr><th>Modelo</th><th>MAC</th><th>Etiqueta</th><th>Como</th><th>Condição</th><th>IP</th><th>Local</th></tr></thead>
          <tbody>{devs.map((d) => <tr key={d.id}><td>{d.modelName}</td><td className="font-mono"><Link className="link" to={`/inventario/aparelhos/${d.id}`}>{d.macFormatted}</Link></td><td className="font-mono">{d.tag ?? '—'}</td><td>{d.currentModality ? (MODALIDADES as any)[d.currentModality] : '—'}</td><td><Chip tone={condicaoCor[d.condition] as any}>{condicaoNome[d.condition] ?? d.condition}</Chip></td><td className="font-mono">{d.ip ?? '—'}</td><td className="text-muted">{d.location ?? '—'}</td></tr>)}</tbody></table></div>
      )}
      {bulk.length > 0 && (
        <div className="card p-4"><div className="eyebrow mb-2">Itens a granel</div><ul className="text-sm">{bulk.map((b) => <li key={b.id} className="flex justify-between py-1 border-b border-line last:border-0"><span>{b.modelName} <span className="text-muted">· {(MODALIDADES as any)[b.modality] ?? b.modality}</span></span><span className="font-mono tnum">{b.quantity}</span></li>)}</ul></div>
      )}
    </div>
  );
}

// ---------- Acessos ----------
function Acessos({ c }: { c: ClientFull }) {
  const { can } = useAuth();
  const lp = c.subscriptions.find((s) => s.productCode === 'linepbx' && s.active);
  const sz = c.subscriptions.find((s) => s.productCode === 'szchat' && s.active);
  // FOP2 e Omniboard são módulos do LinePBX
  const f2 = lp ? lp.modules.find((m) => m.moduleCode === 'fop2' && m.active) : undefined;
  const om = lp ? lp.modules.find((m) => m.moduleCode === 'omniboard' && m.active) : undefined;
  if (!lp && !sz) return <Vazio titulo="Sem acessos cadastrados" texto="Os acessos aparecem quando o cliente tem LinePBX (e seus módulos FOP2 e Omniboard) ou SZChat." />;
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {lp && <div className="card p-4 flex flex-col gap-3"><div className="flex items-center justify-between"><Chip color={lp.color}>LinePBX</Chip>{c.links.web && <a className="link text-sm" href={c.links.web} target="_blank" rel="noreferrer">abrir interface ↗</a>}</div>
        <dl className="grid grid-cols-[90px_1fr] gap-y-1 text-sm"><dt className="text-muted">Endereço</dt><dd className="font-mono">{lp.settings?.domain ?? '—'}</dd><dt className="text-muted">IP</dt><dd className="font-mono">{lp.settings?.serverIp ?? '—'}</dd><dt className="text-muted">SSH</dt><dd className="font-mono">{c.links.ssh ?? '—'}</dd></dl>
        <Campo label="Senha SSH"><CampoSegredo secretId={lp.settings?.sshPassword?.secretId ?? null} hasSecret={!!lp.settings?.sshPassword?.hasSecret} podeRevelar={can('secrets.reveal')} onReveal={api.secrets.reveal} /></Campo></div>}
      {f2 && lp && <div className="card p-4 flex flex-col gap-3"><div className="flex items-center justify-between"><Chip color={lp.color}>LinePBX › FOP2</Chip>{c.links.fop2 && <a className="link text-sm" href={c.links.fop2} target="_blank" rel="noreferrer">abrir painel ↗</a>}</div><dl className="grid grid-cols-[90px_1fr] gap-y-1 text-sm"><dt className="text-muted">Ramal admin</dt><dd className="font-mono">{f2.settings?.adminExtension ?? '—'}</dd></dl><p className="text-[12px] text-muted">O link do FOP2 nunca carrega senha na URL.</p></div>}
      {om && lp && <div className="card p-4 flex flex-col gap-3"><Chip color={lp.color}>LinePBX › Omniboard</Chip><dl className="grid grid-cols-[90px_1fr] gap-y-1 text-sm"><dt className="text-muted">Admin</dt><dd className="font-mono">{om.settings?.adminLogin ?? '—'}</dd></dl>
        <Campo label="Senha admin"><CampoSegredo secretId={om.settings?.adminPassword?.secretId ?? null} hasSecret={!!om.settings?.adminPassword?.hasSecret} podeRevelar={can('secrets.reveal')} onReveal={api.secrets.reveal} /></Campo>
        <Campo label="Senha padrão de usuário"><CampoSegredo secretId={om.settings?.userDefaultPassword?.secretId ?? null} hasSecret={!!om.settings?.userDefaultPassword?.hasSecret} podeRevelar={can('secrets.reveal')} onReveal={api.secrets.reveal} /></Campo></div>}
      {sz && <div className="card p-4 flex flex-col gap-3"><Chip color={sz.color}>SZChat</Chip><dl className="grid grid-cols-[90px_1fr] gap-y-1 text-sm"><dt className="text-muted">Admin</dt><dd className="font-mono">{sz.settings?.adminLogin ?? '—'}</dd></dl>
        <Campo label="Senha admin"><CampoSegredo secretId={sz.settings?.adminPassword?.secretId ?? null} hasSecret={!!sz.settings?.adminPassword?.hasSecret} podeRevelar={can('secrets.reveal')} onReveal={api.secrets.reveal} /></Campo></div>}
    </div>
  );
}

// ---------- Histórico ----------
function Historico({ c }: { c: ClientFull }) {
  const q = useQuery({ queryKey: ['client-history', c.id], queryFn: () => api.clients.history(c.id) });
  useEffect(() => { void q.refetch(); }, []); // eslint-disable-line
  if (q.isLoading) return <Carregando />;
  const items = q.data?.items ?? [];
  if (!items.length) return <Vazio titulo="Nada registrado ainda" />;
  return <div className="card"><ul>{items.map((a) => <li key={a.id} className="px-4 py-2.5 border-b border-line last:border-0 text-sm flex gap-3"><span className="text-muted tnum shrink-0 w-32">{data(a.createdAt, true)}</span><span className="flex-1">{a.summary}</span><span className="text-muted">{a.userName ?? 'sistema'}</span></li>)}</ul></div>;
}
