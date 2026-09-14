/**
 * Ficha do cliente: uma página com endereço próprio e abas.
 * Visão geral · Acessos · DIDs · Equipamentos · Produtos · Histórico
 */
import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Archive, ExternalLink, Pencil, Terminal, Trash2 } from 'lucide-react';
import { api, logoSrc } from '../../api/index.js';
import type { ClientFull, Product, ProductModule, Subscription, SubscriptionModule } from '../../api/types.js';
import { Pagina } from '../../components/layout/AppShell.js';
import { Can, useAuth } from '../../lib/auth.js';
import { Abas, Campo, CampoSegredo, Carregando, Chip, Confirmar, LogoCliente, mensagemErro, Modal, Spinner, Vazio, useToast } from '../../components/ui/index.js';
import { cnpjFormatado, condicaoCor, condicaoNome, data, diaLocal, intervalo, MODALIDADES, reais } from '../../lib/format.js';
import { ordenarLista, Th, useOrdenacaoLocal } from '../../lib/ordenacao.js';
import { paraALista, Voltar } from '../../lib/voltar.js';
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
  if (q.isError || !q.data) return <Vazio titulo="Cliente não encontrado" acao={<Link className="btn-secondary" to={paraALista('/clientes')}>Voltar</Link>} />;
  const c = q.data;
  const ativos = c.subscriptions.filter((s) => s.active);

  const doDelete = async () => { setBusy(true); try { await api.clients.remove(c.id); toast.push('ok', `${c.tradeName} foi para a lixeira`); await qc.invalidateQueries({ queryKey: ['clients'] }); nav(paraALista('/clientes')); } catch (e) { toast.push('erro', mensagemErro(e)); } finally { setBusy(false); } };
  const toggleArchive = async () => { try { await api.clients.update(c.id, { archived: !c.archived }); await qc.invalidateQueries({ queryKey: ['client', id] }); toast.push('ok', c.archived ? 'Cliente desarquivado' : 'Cliente arquivado'); } catch (e) { toast.push('erro', mensagemErro(e)); } };

  return (
    <Pagina
      voltar={<Voltar rota="/clientes" texto="Todos os clientes" />}
      titulo={<span className="flex items-center gap-2"><LogoCliente src={logoSrc(c.logoUrl)} nome={c.tradeName} tamanho={30} />{c.tradeName}{c.archived && <Chip tone="muted">arquivado</Chip>}</span>}
      sub={<span>{c.legalName} · <span className="font-mono">{cnpjFormatado(c.cnpj)}</span></span>}
      acoes={<>
        {c.links.web && <a href={c.links.web} target="_blank" rel="noreferrer" className="btn-secondary"><ExternalLink size={15} /> Abrir</a>}
        {c.links.ssh && can('access.use') && <a href={c.links.ssh} className="btn-secondary"><Terminal size={15} /> SSH</a>}
        <Can permission="records.write"><button className="btn-secondary" onClick={() => setEditar(true)}><Pencil size={15} /> Editar</button><button className="btn-ghost" onClick={toggleArchive}><Archive size={15} /> {c.archived ? 'Desarquivar' : 'Arquivar'}</button></Can>
        <Can permission="records.delete"><button className="btn-ghost text-bad" onClick={() => setExcluir(true)}><Trash2 size={15} /></button></Can>
      </>}
    >
      <Abas atual={aba} onChange={(a) => setSp({ aba: a }, { replace: true })} abas={[
        { id: 'geral', label: 'Visão geral' }, { id: 'acessos', label: 'Acessos' },
        { id: 'dids', label: <>DIDs <span className="text-muted">({c.didCount})</span></> }, { id: 'equipamentos', label: <>Equipamentos <span className="text-muted">({c.deviceCount})</span></> },
        { id: 'produtos', label: <>Produtos <span className="text-muted">({ativos.length})</span></> }, ...(can('audit.read') ? [{ id: 'historico' as Aba, label: 'Histórico' }] : []),
      ]} />
      {aba === 'geral' && <Geral c={c} />}
      {aba === 'acessos' && <Acessos c={c} />}
      {aba === 'dids' && <Dids c={c} />}
      {aba === 'equipamentos' && <Equipamentos c={c} />}
      {aba === 'produtos' && <Produtos c={c} />}
      {aba === 'historico' && <Historico c={c} />}
      <ClienteForm open={editar} onClose={() => setEditar(false)} cliente={c} onSaved={() => setEditar(false)} />
      <Confirmar open={excluir} onClose={() => setExcluir(false)} onConfirm={doDelete} loading={busy} perigoso digitar={c.tradeName} titulo="Mandar para a lixeira" botao="Mandar para a lixeira" texto={<>O cliente <b>{c.tradeName}</b> sai de todas as listas. Os {c.didCount} DIDs continuam alocados a ele e os {c.deviceCount} aparelhos continuam registrados — nada é apagado. Dá para restaurar em Administração → Lixeira.</>} />
    </Pagina>
  );
}

function Geral({ c }: { c: ClientFull }) {
  const ativos = c.subscriptions.filter((s) => s.active);
  return (
    <div className="grid gap-4 md:grid-cols-3 items-start">
      <div className="md:col-span-2 flex flex-col gap-4">
        <div className="card p-4">
          <div className="eyebrow mb-2">Produtos ativos e seus módulos</div>
          <div className="flex flex-wrap gap-1.5">
            {ativos.map((s) => {
              const mods = s.modules.filter((m) => m.active);
              return <span key={s.id} className="inline-flex items-center gap-1"><Chip color={s.color}>{s.productName}</Chip>{mods.map((m) => <Chip key={m.id} color={s.color} className="opacity-80" title={`módulo do ${s.productName}`}>› {m.moduleName}</Chip>)}</span>;
            })}
            {!ativos.length && <span className="text-muted text-sm">Nenhum produto marcado ainda.</span>}
          </div>
          {/* Servidor, endereço, IP e SSH ficam na aba Acessos; as datas de implantação,
              na linha do tempo logo abaixo. Aqui só os produtos e o que o cliente anotou. */}
          {c.notes && <><div className="eyebrow mt-4 mb-1">Anotações</div><p className="text-sm whitespace-pre-wrap">{c.notes}</p></>}
        </div>
        <div className="card p-4">
          <div className="eyebrow mb-3">Linha do tempo da implantação</div>
          <LinhaDoTempo c={c} />
        </div>
      </div>
      <div className="flex flex-col gap-3">
        <div className="card p-4"><div className="eyebrow">DIDs em uso</div><div className="font-display text-2xl font-semibold tnum">{c.didCount}</div></div>
        <div className="card p-4"><div className="eyebrow">Equipamentos locados</div><div className="font-display text-2xl font-semibold tnum">{c.deviceCount}</div>{c.deviceValueCents > 0 && <div className="text-muted text-[12.5px] tnum">{reais(c.deviceValueCents)} em equipamento</div>}</div>
      </div>
    </div>
  );
}

/**
 * A ordem em que o cliente foi ganhando as coisas: cada produto e cada módulo, do mais
 * antigo ao mais novo, com o intervalo entre uma etapa e a seguinte. É comum um cliente
 * entrar com um produto e só meses depois ligar um módulo — a linha do tempo mostra isso
 * de relance, o que nenhuma contagem mostra.
 *
 * As datas vêm do campo "Ativado em" de cada produto e módulo, em Produtos.
 */
function LinhaDoTempo({ c }: { c: ClientFull }) {
  type Evento = { cor: string; titulo: string; fim: boolean };
  type Dia = { dia: string | null; quando: string | null; eventos: Evento[] };

  /** Tudo que aconteceu no mesmo dia vira uma linha só — ligar três coisas de uma vez
   *  é um marco, não três. Só dias diferentes ganham o "X depois". */
  const dias = useMemo(() => {
    const porDia = new Map<string, Dia>();
    const add = (quando: string | null, ev: Evento) => {
      const chave = quando ? diaLocal(quando) : 'sem-data';
      const atual = porDia.get(chave) ?? { dia: quando ? chave : null, quando, eventos: [] };
      atual.eventos.push(ev);
      porDia.set(chave, atual);
    };
    for (const s of c.subscriptions) {
      if (s.active) add(s.activatedAt, { cor: s.color, titulo: s.productName, fim: false });
      else if (s.deactivatedAt) add(s.deactivatedAt, { cor: s.color, titulo: `${s.productName} — encerrado`, fim: true });
      for (const m of s.modules) {
        if (m.active) add(m.activatedAt, { cor: s.color, titulo: `${s.productName} › ${m.moduleName}`, fim: false });
        else if (m.deactivatedAt) add(m.deactivatedAt, { cor: s.color, titulo: `${s.productName} › ${m.moduleName} — desativado`, fim: true });
      }
    }
    // sem data vai para o fim da lista, não para 1970
    return [...porDia.values()].sort((a, b) => (a.dia ?? '9999').localeCompare(b.dia ?? '9999'));
  }, [c.subscriptions]);

  if (!dias.length) return <p className="text-muted text-sm">Nenhum produto marcado ainda. Marque na aba Produtos e a linha do tempo se monta sozinha.</p>;

  let anterior: string | null = null;
  return (
    <ol className="ml-1">
      {dias.map((g, i) => {
        const desde = g.dia && anterior && anterior !== g.dia ? intervalo(anterior, g.dia) : null;
        if (g.dia) anterior = g.dia;
        const ultimo = i === dias.length - 1;
        const cor = g.eventos.find((e) => !e.fim)?.cor ?? g.eventos[0]!.cor;
        return (
          <li key={g.dia ?? 'sem-data'} className={`relative pl-5 ${ultimo ? '' : 'pb-3.5 border-l'} border-line`}>
            <span className="absolute -left-[4.5px] top-[5px] w-2.5 h-2.5 rounded-full ring-[3px] ring-surface" style={{ background: g.eventos.every((e) => e.fim) ? 'var(--line-strong)' : cor }} aria-hidden />
            <div className="flex flex-wrap items-baseline gap-x-2 -mt-[3px]">
              <span className="font-mono text-[12.5px] text-muted tnum w-[74px] shrink-0">{g.quando ? data(g.quando) : 'sem data'}</span>
              <span className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5 min-w-0">
                {g.eventos.map((ev, k) => (
                  <span key={`${ev.titulo}-${k}`} className={`text-sm ${ev.fim ? 'text-muted line-through decoration-1' : ''}`}>
                    {k > 0 && <span className="text-muted mr-1.5 no-underline">·</span>}{ev.titulo}
                  </span>
                ))}
              </span>
              {desde && <span className="text-[12px] text-muted">· {desde}</span>}
            </div>
          </li>
        );
      })}
    </ol>
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
  const desativarModulo = async (p: Product, m: ProductModule) => { try { await api.clients.endModule(c.id, p.code, m.code); await atualizar(); toast.push('ok', `${m.name} desativado (histórico mantido)`); } catch (e) { toast.push('erro', mensagemErro(e)); } };
  const ativarModulo = async (p: Product, m: ProductModule) => {
    if (m.hasSettings) { setEditandoModulo({ product: p, module: m }); return; }
    try { await api.clients.upsertModule(c.id, { productCode: p.code, moduleCode: m.code }); await atualizar(); toast.push('ok', `${m.name} ativado em ${p.name}`); } catch (e) { toast.push('erro', mensagemErro(e)); }
  };
  return (
    <div>
      <p className="text-sm text-muted mb-3">Clique num produto para marcar ou ajustar. Dentro de cada produto ativo, ative os <b>módulos</b> que o cliente usa. Desmarcar não apaga: fica registrado quando terminou.</p>
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
                      const ativo = on && !!sm?.active;
                      return (
                        <li key={m.code} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12.5px]">
                          <span className={`w-2 h-2 rounded-full shrink-0 ${ativo ? 'bg-ok' : 'bg-line-strong'}`} aria-hidden />
                          <span className={ativo ? 'font-medium' : 'text-muted'} title={m.description ?? undefined}>{m.name}</span>
                          {ativo && sm?.activatedAt && <span className="text-muted whitespace-nowrap">desde {data(sm.activatedAt)}</span>}
                          {!ativo && sm && sm.deactivatedAt && <span className="text-muted whitespace-nowrap">desativado em {data(sm.deactivatedAt)}</span>}
                          {on && can('records.write') && (
                            <span className="ml-auto flex gap-1">
                              {ativo ? (<>
                                {m.hasSettings && <button className="btn-ghost btn-sm" onClick={() => setEditandoModulo({ product: p, module: m })}>Ajustar</button>}
                                <button className="btn-ghost btn-sm text-muted" onClick={() => desativarModulo(p, m)}>Desativar</button>
                              </>) : <button className="btn-secondary btn-sm" onClick={() => ativarModulo(p, m)}>Ativar</button>}
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

/** Ativar/ajustar um módulo dentro de um produto. FOP2 e Omniboard têm campos próprios; os demais só data e anotações. */
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
    <Modal open onClose={onClose} lateral largura="max-w-lg" titulo={<span className="flex items-center gap-2">{sm?.active ? 'Ajustar' : 'Ativar'} <Chip color={product.color}>{product.name} › {module.name}</Chip></span>} rodape={<><button className="btn-secondary" onClick={onClose}>Cancelar</button><button className="btn-primary" disabled={busy} onClick={save}>{busy ? <Spinner className="text-white" /> : 'Salvar'}</button></>}>
      <div className="flex flex-col gap-3">
        {module.description && <p className="text-sm text-muted">{module.description}</p>}
        <Campo label="Ativado em" className="max-w-[220px]"><input type="date" className="input" value={f.activatedAt} onChange={(e) => setF({ ...f, activatedAt: e.target.value })} /></Campo>
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
  const o = useOrdenacaoLocal('numberFormatted');
  if (q.isLoading) return <Carregando />;
  const items = q.data?.items ?? [];
  if (!items.length) return <Vazio titulo="Nenhum DID com este cliente" texto="Aloque números em Circuitos › Numeração, selecionando os desejados e escolhendo este cliente." acao={<Link className="btn-secondary" to="/circuitos?aba=numeracao&cliente=free">Ver DIDs livres</Link>} />;
  return (
    <div className="card overflow-x-auto">
      <table className="table"><thead><tr><Th o={o} col="numberFormatted">Número</Th><Th o={o} col="carrierName">Operadora</Th><Th o={o} col="circuitName">Circuito</Th><Th o={o} col="ownerName">Titular</Th><Th o={o} col="note">Observação</Th></tr></thead>
        <tbody>{ordenarLista(items, o, { numberFormatted: (d) => d.number, carrierName: (d) => d.carrierName, circuitName: (d) => d.circuitName, ownerName: (d) => d.ownerName, note: (d) => d.note }).map((d) => <tr key={d.id}><td className="font-mono tnum">{d.numberFormatted}</td><td>{d.carrierName ?? '—'}</td><td>{d.circuitId ? <Link className="link" to={`/circuitos/${d.circuitId}`}>{d.circuitName}</Link> : <span className="text-muted">sem circuito</span>}</td><td>{d.ownerName ?? '—'}</td><td className="text-muted">{d.note}</td></tr>)}</tbody></table>
      <div className="px-3 py-2 text-[12.5px] text-muted border-t border-line"><Link className="link" to={`/circuitos?aba=numeracao&cliente=${c.id}`}>Abrir em Circuitos › Numeração</Link> para editar em massa.</div>
    </div>
  );
}

// ---------- Equipamentos ----------

/**
 * O que este cliente tem de equipamento: primeiro o resumo (quanto, de que modelos e quanto
 * vale cada grupo), depois a tabela com cada aparelho.
 *
 * O valor é o que está cadastrado em cada aparelho, no Inventário — por isso a soma daqui
 * bate com a da Visão geral.
 */
function Equipamentos({ c }: { c: ClientFull }) {
  const q = useQuery({ queryKey: ['client-devices', c.id], queryFn: () => api.clients.devices(c.id) });
  const o = useOrdenacaoLocal('modelName');
  const temProduto = c.subscriptions.some((s) => s.productCode === 'equipamentos' && s.active);
  const devs = q.data?.devices.items ?? [];

  const resumo = useMemo(() => {
    const porModelo = new Map<string, { qtd: number; valor: number }>();
    for (const d of devs) {
      const atual = porModelo.get(d.modelName) ?? { qtd: 0, valor: 0 };
      porModelo.set(d.modelName, { qtd: atual.qtd + 1, valor: atual.valor + (d.valueCents ?? 0) });
    }
    return {
      modelos: [...porModelo.entries()].sort((a, b) => b[1].qtd - a[1].qtd || a[0].localeCompare(b[0], 'pt-BR')),
      total: devs.length,
      valor: devs.reduce((a, d) => a + (d.valueCents ?? 0), 0),
      semValor: devs.filter((d) => d.valueCents == null).length,
    };
  }, [devs]);

  if (q.isLoading) return <Carregando />;
  if (!devs.length) return <Vazio titulo="Nenhum aparelho com este cliente" texto={temProduto ? 'Use "Movimentar aparelhos" no Inventário para locar, vender ou emprestar.' : 'Para movimentar aparelhos para este cliente, marque o produto Equipamentos na aba Produtos.'} acao={<Link className="btn-secondary" to="/inventario">Ir para o Inventário</Link>} />;

  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="card p-4">
          <div className="eyebrow mb-2">Por modelo</div>
          <ul className="text-sm flex flex-col gap-1">
            {resumo.modelos.map(([nome, x]) => (
              <li key={nome} className="flex justify-between gap-3 items-baseline">
                <span className="truncate">{nome}</span>
                <span className="font-mono tnum text-muted whitespace-nowrap">{x.qtd} und</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="card p-4">
          <div className="eyebrow mb-2">Valor por modelo</div>
          <ul className="text-sm flex flex-col gap-1">
            {resumo.modelos.map(([nome, x]) => (
              <li key={nome} className="flex justify-between gap-3 items-baseline">
                <span className="truncate">{nome}</span>
                <span className="tnum text-muted whitespace-nowrap">{reais(x.valor)}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="card p-4">
          <div className="eyebrow">Total de equipamentos</div>
          <div className="font-display text-2xl font-semibold tnum">{resumo.total}</div>
        </div>
        <div className="card p-4">
          <div className="eyebrow">Valor dos equipamentos</div>
          <div className="font-display text-2xl font-semibold tnum">{reais(resumo.valor)}</div>
          <div className="text-muted text-[12px]">
            {resumo.semValor > 0 ? `${resumo.semValor} aparelho(s) sem valor cadastrado` : 'soma do valor de cada aparelho'}
          </div>
        </div>
      </div>

      <div className="card overflow-x-auto"><table className="table"><thead><tr><Th o={o} col="modelName">Modelo</Th><Th o={o} col="mac">MAC</Th><Th o={o} col="unit">Unidade</Th><Th o={o} col="currentModality">Modalidade</Th><Th o={o} col="condition">Condição</Th><Th o={o} col="valueCents" align="right">Valor</Th><Th o={o} col="ip">IP</Th><Th o={o} col="location">Local</Th></tr></thead>
        <tbody>{ordenarLista(devs, o, { modelName: (d) => d.modelName, mac: (d) => d.mac, unit: (d) => d.unit, currentModality: (d) => d.currentModality, condition: (d) => d.condition, valueCents: (d) => d.valueCents, ip: (d) => d.ip, location: (d) => d.location }).map((d) => <tr key={d.id}><td>{d.modelName}</td><td className="font-mono"><Link className="link" to={`/inventario/aparelhos/${d.id}`}>{d.mac ? d.macFormatted : <span className="text-muted font-sans text-[13px]">não aplicável</span>}</Link></td><td>{d.unit ?? <span className="text-muted">—</span>}</td><td>{d.currentModality ? (MODALIDADES as any)[d.currentModality] : '—'}</td><td><Chip tone={condicaoCor[d.condition] as any}>{condicaoNome[d.condition] ?? d.condition}</Chip></td><td className="text-right tnum">{d.valueCents != null ? reais(d.valueCents) : <span className="text-muted">—</span>}</td><td className="font-mono">{d.ip ?? '—'}</td><td className="text-muted">{d.location ?? '—'}</td></tr>)}</tbody></table></div>
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
