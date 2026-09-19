/**
 * Ficha do cliente: uma página com endereço próprio e abas.
 * Visão geral · Acessos · DIDs · Equipamentos · Produtos · Unidades · Histórico
 */
import { Fragment, useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Archive, ChevronDown, ChevronRight, ExternalLink, Network, Pencil, Plus, Star, Trash2 } from 'lucide-react';
import { api, logoSrc } from '../../api/index.js';
import type { ClientDeviceLogin, ClientFull, ClientUnit, Product, ProductModule, Subscription, SubscriptionModule } from '../../api/types.js';
import { Pagina } from '../../components/layout/AppShell.js';
import { Can, useAuth } from '../../lib/auth.js';
import { Abas, Campo, CampoSegredo, Carregando, Chip, Confirmar, Identificacao, InputIp, LogoCliente, mensagemErro, Modal, Spinner, usePaginaLocal, Vazio, useToast } from '../../components/ui/index.js';
import { cnpjFormatado, condicaoCor, condicaoNome, data, diaLocal, diaParaIso, hojeCampoData, intervalo, MODALIDADES, paraCampoData, reais } from '../../lib/format.js';
import { ordenarLista, Th, useOrdenacaoLocal } from '../../lib/ordenacao.js';
import { paraALista, Voltar } from '../../lib/voltar.js';
import { contar, TdN, ThN } from '../../lib/contagem.js';
import { ClienteForm } from './Form.js';
import { ChipSituacao } from '../projetos/partes.js';

type Aba = 'geral' | 'produtos' | 'dids' | 'equipamentos' | 'unidades' | 'acessos' | 'projetos' | 'historico';

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
        <Can permission="records.write"><button className="btn-secondary" onClick={() => setEditar(true)}><Pencil size={15} /> Editar</button><button className="btn-ghost" onClick={toggleArchive}><Archive size={15} /> {c.archived ? 'Desarquivar' : 'Arquivar'}</button></Can>
        <Can permission="records.delete"><button className="btn-ghost text-bad" onClick={() => setExcluir(true)}><Trash2 size={15} /></button></Can>
      </>}
    >
      <Abas atual={aba} onChange={(a) => setSp({ aba: a }, { replace: true })} abas={[
        { id: 'geral', label: 'Visão geral' }, { id: 'acessos', label: 'Acessos' },
        { id: 'dids', label: <>DIDs <span className="text-muted">({c.didCount})</span></> }, { id: 'equipamentos', label: <>Equipamentos <span className="text-muted">({c.deviceCount})</span></> },
        { id: 'produtos', label: <>Produtos <span className="text-muted">({ativos.length})</span></> },
        { id: 'unidades', label: <>Unidades <span className="text-muted">({c.unitCount})</span></> },
        { id: 'projetos', label: 'Projetos' }, ...(can('audit.read') ? [{ id: 'historico' as Aba, label: 'Histórico' }] : []),
      ]} />
      {aba === 'geral' && <Geral c={c} />}
      {aba === 'acessos' && <Acessos c={c} />}
      {aba === 'dids' && <Dids c={c} />}
      {aba === 'equipamentos' && <Equipamentos c={c} />}
      {aba === 'produtos' && <Produtos c={c} />}
      {aba === 'unidades' && <Unidades c={c} />}
      {aba === 'projetos' && <ProjetosDoCliente c={c} />}
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
  // ativar abre o formulário sempre: é ali que se escolhe a data em que o módulo entrou
  const ativarModulo = (p: Product, m: ProductModule) => setEditandoModulo({ product: p, module: m });
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
                                <button className="btn-ghost btn-sm" onClick={() => setEditandoModulo({ product: p, module: m })} title="data de ativação, anotações e configuração">Ajustar</button>
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
  // a data mostrada é a do fuso de quem olha (antes pegava o dia em UTC e "voltava um dia")
  const [f, setF] = useState<Record<string, any>>({ activatedAt: sub?.activatedAt ? paraCampoData(sub.activatedAt) : hojeCampoData(), notes: sub?.notes ?? '', hostingId: st.hostingId ?? '', serverIp: st.serverIp ?? '', domain: st.domain ?? '', sshPort: st.sshPort ?? 22, adminLogin: st.adminLogin ?? '' });
  const [senhas, setSenhas] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const prods = useQuery({ queryKey: ['products'], queryFn: api.admin.products });
  const nome = prods.data?.find((p) => p.code === code)?.name ?? code;
  const podeServidor = can('servers.write');
  const save = async () => {
    setBusy(true); setErr('');
    try {
      const settings: Record<string, unknown> = {};
      if (code === 'linepbx' && podeServidor) Object.assign(settings, { hostingId: f.hostingId || null, serverIp: f.serverIp || null, domain: f.domain || null, sshPort: Number(f.sshPort) || 22 });
      if (code === 'szchat') Object.assign(settings, { adminLogin: f.adminLogin || null, ...(senhas.adminPassword ? { adminPassword: senhas.adminPassword } : {}) });
      await api.clients.upsertSubscription(c.id, { productCode: code, activatedAt: f.activatedAt ? diaParaIso(f.activatedAt) : null, notes: f.notes || null, settings });
      await qc.invalidateQueries({ queryKey: ['client', c.id] }); await qc.invalidateQueries({ queryKey: ['clients'] });
      toast.push('ok', `${nome} salvo`); onClose();
    } catch (e) { setErr(mensagemErro(e)); } finally { setBusy(false); }
  };
  const seg = (key: 'adminPassword', label: string) => (
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
              <Campo label="Porta SSH"><input className="input font-mono tnum" value={f.sshPort} onChange={(e) => setF({ ...f, sshPort: e.target.value })} /></Campo>
            </div>
            {/* usuário e senha do SSH não ficam no cliente: cada técnico usa o seu, que é o mesmo em todos os servidores */}
            <p className="text-[12.5px] text-muted">Usuário e senha do SSH são de cada técnico, não do cliente.</p>
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
  const [f, setF] = useState<Record<string, any>>({ activatedAt: sm?.activatedAt ? paraCampoData(sm.activatedAt) : hojeCampoData(), notes: sm?.notes ?? '', adminExtension: st.adminExtension ?? '', adminLogin: st.adminLogin ?? '' });
  const [senhas, setSenhas] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const save = async () => {
    setBusy(true); setErr('');
    try {
      const settings: Record<string, unknown> = {};
      if (module.code === 'fop2') Object.assign(settings, { adminExtension: f.adminExtension || null, ...(senhas.defaultUserPassword ? { defaultUserPassword: senhas.defaultUserPassword } : {}) });
      if (module.code === 'omniboard') Object.assign(settings, { adminLogin: f.adminLogin || null, ...(senhas.adminPassword ? { adminPassword: senhas.adminPassword } : {}), ...(senhas.userDefaultPassword ? { userDefaultPassword: senhas.userDefaultPassword } : {}) });
      await api.clients.upsertModule(c.id, { productCode: product.code, moduleCode: module.code, activatedAt: f.activatedAt ? diaParaIso(f.activatedAt) : null, notes: f.notes || null, settings });
      await qc.invalidateQueries({ queryKey: ['client', c.id] }); await qc.invalidateQueries({ queryKey: ['clients'] });
      toast.push('ok', `${module.name} salvo`); onClose();
    } catch (e) { setErr(mensagemErro(e)); } finally { setBusy(false); }
  };
  const seg = (key: 'adminPassword' | 'userDefaultPassword' | 'defaultUserPassword', label: string) => (
    <Campo label={label}><CampoSegredo secretId={st[key]?.secretId ?? null} hasSecret={!!st[key]?.hasSecret} podeRevelar={can('secrets.reveal')} onReveal={api.secrets.reveal} onChangeNovo={(v) => setSenhas({ ...senhas, [key]: v })} /></Campo>
  );
  return (
    <Modal open onClose={onClose} lateral largura="max-w-lg" titulo={<span className="flex items-center gap-2">{sm?.active ? 'Ajustar' : 'Ativar'} <Chip color={product.color}>{product.name} › {module.name}</Chip></span>} rodape={<><button className="btn-secondary" onClick={onClose}>Cancelar</button><button className="btn-primary" disabled={busy} onClick={save}>{busy ? <Spinner className="text-white" /> : sm?.active ? 'Salvar' : 'Ativar'}</button></>}>
      <div className="flex flex-col gap-3">
        {module.description && <p className="text-sm text-muted">{module.description}</p>}
        <Campo label="Ativado em" className="max-w-[220px]"><input type="date" className="input" value={f.activatedAt} onChange={(e) => setF({ ...f, activatedAt: e.target.value })} /></Campo>
        {module.code === 'fop2' && (<>
          <Campo label="Ramal / usuário admin do FOP2" dica="usado para o acesso rápido"><input className="input font-mono" autoComplete="off" value={f.adminExtension} onChange={(e) => setF({ ...f, adminExtension: e.target.value })} /></Campo>
          {seg('defaultUserPassword', 'Senha do usuário padrão do FOP2')}
        </>)}
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
/**
 * Os números do cliente, com a marca **em uso / não usado**: o número pode estar alocado ao
 * cliente e ainda não estar em uso (reservado, aguardando configuração). Clicar na marca alterna.
 */
function Dids({ c }: { c: ClientFull }) {
  const q = useQuery({ queryKey: ['client-dids', c.id], queryFn: () => api.clients.dids(c.id) });
  const qc = useQueryClient(); const toast = useToast(); const { can } = useAuth();
  const o = useOrdenacaoLocal('numberFormatted');
  const items = q.data?.items ?? [];
  const ordenados = ordenarLista(items, o, { numberFormatted: (d) => d.number, carrierName: (d) => d.carrierName, circuitName: (d) => d.circuitName, ownerName: (d) => d.ownerName, inUse: (d) => (d.inUse ? 1 : 0), note: (d) => d.note });
  const pg = usePaginaLocal(ordenados, 100);
  const [mudando, setMudando] = useState<string | null>(null);
  const alternar = async (id: string, inUse: boolean) => {
    setMudando(id);
    try { await api.dids.update(id, { inUse }); await Promise.all([qc.invalidateQueries({ queryKey: ['client-dids', c.id] }), qc.invalidateQueries({ queryKey: ['dids'] })]); }
    catch (e) { toast.push('erro', mensagemErro(e)); } finally { setMudando(null); }
  };
  if (q.isLoading) return <Carregando />;
  if (!items.length) return <Vazio titulo="Nenhum DID com este cliente" texto="Aloque números em Circuitos › Numeração, selecionando os desejados e escolhendo este cliente." acao={<Link className="btn-secondary" to="/circuitos?aba=numeracao&cliente=free">Ver DIDs livres</Link>} />;
  const emUso = items.filter((d) => d.inUse).length;
  return (
    <div className="card overflow-x-auto">
      <table className="table"><thead><tr><ThN /><Th o={o} col="numberFormatted">Número</Th><Th o={o} col="inUse">Uso</Th><Th o={o} col="carrierName">Operadora</Th><Th o={o} col="circuitName">Circuito</Th><Th o={o} col="ownerName">Titular</Th><Th o={o} col="note">Observação</Th></tr></thead>
        <tbody>{pg.visiveis.map((d, i) => <tr key={d.id}><TdN n={pg.numero(i)} /><td className="font-mono tnum">{d.numberFormatted}</td>
          <td><UsoDid inUse={d.inUse} podeMudar={can('dids.assign')} mudando={mudando === d.id} onChange={(v) => alternar(d.id, v)} /></td>
          <td>{d.carrierName ?? '—'}</td><td>{d.circuitId ? <span className="inline-flex items-center gap-1.5"><Link className="link" to={`/circuitos/${d.circuitId}`}>{d.circuitName}</Link>{d.thirdParty && <Chip tone="muted" title="Tronco do próprio cliente, com outra operadora">terceiro</Chip>}</span> : <span className="text-muted">—</span>}</td><td>{d.ownerName ?? '—'}</td><td className="text-muted">{d.note}</td></tr>)}</tbody></table>
      <div className="px-3 pb-3 border-t border-line">{pg.rodape}<div className="pt-2 text-[12.5px] text-muted flex flex-wrap gap-x-3"><span className="tnum">{emUso} em uso · {items.length - emUso} não usado(s)</span><Link className="link" to={`/circuitos?aba=numeracao&cliente=${c.id}`}>Abrir em Circuitos › Numeração</Link> para editar em massa.</div></div>
    </div>
  );
}

/** A marca "em uso" / "não usado" de um número. Com permissão, vira um botão que alterna. */
export function UsoDid({ inUse, podeMudar, mudando, onChange }: { inUse: boolean; podeMudar: boolean; mudando?: boolean; onChange?: (v: boolean) => void }) {
  const chip = <Chip tone={inUse ? 'ok' : 'signal'} title={inUse ? 'O cliente usa este número' : 'Alocado ao cliente, mas ainda não está em uso'}>{inUse ? 'em uso' : 'não usado'}</Chip>;
  if (!podeMudar || !onChange) return chip;
  return <button type="button" className={`inline-flex ${mudando ? 'opacity-50' : ''}`} disabled={mudando} onClick={(e) => { e.stopPropagation(); onChange(!inUse); }} title={inUse ? 'Clique para marcar como não usado' : 'Clique para marcar como em uso'} aria-label={inUse ? 'Marcar como não usado' : 'Marcar como em uso'}>{chip}</button>;
}

// ---------- Equipamentos ----------

/**
 * O que este cliente tem de equipamento, em duas vistas:
 *  - **Aparelhos**: o resumo (quanto, de que modelos e quanto vale cada grupo) e a tabela
 *  - **Movimentações**: tudo o que entrou e saiu deste cliente, com os aparelhos de cada vez
 *
 * O valor de cada aparelho é o do modelo (ou o próprio, quando foi cadastrado diferente) —
 * por isso a soma daqui bate com a da Visão geral.
 */
function Equipamentos({ c }: { c: ClientFull }) {
  const [vista, setVista] = useState<'aparelhos' | 'movimentacoes'>('aparelhos');
  return (
    <div className="flex flex-col gap-3">
      <RedePadrao c={c} />
      <div className="inline-flex self-start rounded-lg border border-line p-0.5 bg-surface" role="tablist">
        {([['aparelhos', `Aparelhos (${c.deviceCount})`], ['movimentacoes', 'Movimentações']] as const).map(([id, rotulo]) => (
          <button key={id} role="tab" aria-selected={vista === id} onClick={() => setVista(id)} className={`px-3 py-1.5 text-sm font-semibold rounded-md ${vista === id ? 'bg-accent text-white' : 'text-ink-2 hover:text-ink'}`}>{rotulo}</button>
        ))}
      </div>
      {vista === 'aparelhos' ? <AparelhosDoCliente c={c} /> : <MovimentacoesDoCliente c={c} />}
    </div>
  );
}

function AparelhosDoCliente({ c }: { c: ClientFull }) {
  const q = useQuery({ queryKey: ['client-devices', c.id], queryFn: () => api.clients.devices(c.id) });
  const o = useOrdenacaoLocal('modelName');
  const temProduto = c.subscriptions.some((s) => s.productCode === 'equipamentos' && s.active);
  const todos = q.data?.devices.items ?? [];

  // Cliente grande chega a dezenas de aparelhos: sem filtro, achar "os da Loja Centro" vira rolagem.
  // A lista vem inteira do servidor, então o filtro acontece aqui mesmo, na hora.
  const [busca, setBusca] = useState('');
  const [fModelo, setFModelo] = useState('');
  const [fUnidade, setFUnidade] = useState('');
  const [fCondicao, setFCondicao] = useState('');

  const opcoes = useMemo(() => ({
    modelos: [...new Set(todos.map((d) => d.modelName))].sort((a, b) => a.localeCompare(b, 'pt-BR')),
    unidades: [...new Set(todos.map((d) => d.unit).filter(Boolean) as string[])].sort((a, b) => a.localeCompare(b, 'pt-BR')),
    condicoes: [...new Set(todos.map((d) => d.condition))],
  }), [todos]);

  const devs = useMemo(() => {
    const t = busca.trim().toLowerCase();
    const hex = t.replace(/[^0-9a-f]/g, '').toUpperCase();
    return todos.filter((d) => (!fModelo || d.modelName === fModelo)
      && (!fUnidade || d.unit === fUnidade)
      && (!fCondicao || d.condition === fCondicao)
      && (!t || (hex.length >= 2 && (d.mac ?? '').includes(hex)) || (d.serialNumber ?? '').toLowerCase().includes(t.replace(/\s/g, ''))
        || (d.unit ?? '').toLowerCase().includes(t) || d.modelName.toLowerCase().includes(t) || (d.ip ?? '').includes(t)
        || (d.note ?? '').toLowerCase().includes(t)));
  }, [todos, busca, fModelo, fUnidade, fCondicao]);

  const filtrado = devs.length !== todos.length;
  const limpar = () => { setBusca(''); setFModelo(''); setFUnidade(''); setFCondicao(''); };

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

  const ordenados = ordenarLista(devs, o, { modelName: (d) => d.modelName, mac: (d) => d.mac ?? d.serialNumber, unit: (d) => d.unit, currentModality: (d) => d.currentModality, condition: (d) => d.condition, valueCents: (d) => d.valueCents, ip: (d) => d.ip });
  const pg = usePaginaLocal(ordenados, 100);

  if (q.isLoading) return <Carregando />;
  if (!todos.length) return <Vazio titulo="Nenhum aparelho com este cliente" texto={temProduto ? 'Use "Movimentar aparelhos" no Inventário para locar, vender ou emprestar.' : 'Para movimentar aparelhos para este cliente, marque o produto Equipamentos na aba Produtos.'} acao={<Link className="btn-secondary" to="/inventario">Ir para o Inventário</Link>} />;

  return (
    <div className="flex flex-col gap-3">
      <div className="card p-3 flex flex-wrap gap-2 items-center">
        <input className="input max-w-[220px] font-mono" placeholder="MAC, N/S, unidade, modelo, IP…" value={busca} onChange={(e) => setBusca(e.target.value)} />
        <select className="input w-auto" value={fModelo} onChange={(e) => setFModelo(e.target.value)}><option value="">Todos os modelos</option>{opcoes.modelos.map((m) => <option key={m} value={m}>{m}</option>)}</select>
        {opcoes.unidades.length > 0 && <select className="input w-auto" value={fUnidade} onChange={(e) => setFUnidade(e.target.value)}><option value="">Todas as unidades</option>{opcoes.unidades.map((u) => <option key={u} value={u}>{u}</option>)}</select>}
        {/* o filtro de modalidade saiu a pedido do Luan (rodada 23); a coluna continua na tabela */}
        {opcoes.condicoes.length > 1 && <select className="input w-auto" value={fCondicao} onChange={(e) => setFCondicao(e.target.value)}><option value="">Ativos e inativos</option>{opcoes.condicoes.map((k) => <option key={k} value={k}>{condicaoNome[k] ?? k}</option>)}</select>}
        {filtrado && <button className="btn-ghost btn-sm text-muted" onClick={limpar}>limpar filtros</button>}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="card p-4">
          <div className="eyebrow mb-2">Por modelo{filtrado && <span className="text-muted"> · filtrado</span>}</div>
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
          <div className="eyebrow mb-2">Valor por modelo{filtrado && <span className="text-muted"> · filtrado</span>}</div>
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
          {filtrado && <div className="text-muted text-[12px] tnum">de {todos.length} com o cliente</div>}
        </div>
        <div className="card p-4">
          <div className="eyebrow">Valor dos equipamentos{filtrado && <span className="text-muted"> · filtrado</span>}</div>
          <div className="font-display text-2xl font-semibold tnum">{reais(resumo.valor)}</div>
          <div className="text-muted text-[12px]">
            {resumo.semValor > 0 ? <>{resumo.semValor} aparelho(s) sem valor — cadastre o valor no <Link className="link" to="/inventario?aba=modelos">modelo</Link></> : 'o valor de cada aparelho vem do modelo'}
          </div>
        </div>
      </div>

      <div className="card overflow-x-auto"><table className="table"><thead><tr><ThN /><Th o={o} col="modelName">Modelo</Th><Th o={o} col="mac">MAC / N/S</Th><Th o={o} col="unit">Unidade</Th><Th o={o} col="currentModality">Modalidade</Th><Th o={o} col="condition">Condição</Th><Th o={o} col="valueCents" align="right">Valor</Th><Th o={o} col="ip">IP</Th></tr></thead>
        <tbody>{pg.visiveis.map((d, i) => <tr key={d.id}><TdN n={pg.numero(i)} /><td>{d.modelName}</td><td><Link className="link" to={`/inventario/aparelhos/${d.id}`}><Identificacao d={d} /></Link></td><td>{d.unit ?? <span className="text-muted">Matriz</span>}</td><td>{d.currentModality ? (MODALIDADES as any)[d.currentModality] : '—'}</td><td><Chip tone={condicaoCor[d.condition] as any}>{condicaoNome[d.condition] ?? d.condition}</Chip></td><td className="text-right tnum">{d.valueCents != null ? reais(d.valueCents) : <span className="text-muted">—</span>}</td><td className="font-mono">{d.ip ?? '—'}</td></tr>)}</tbody></table>
        {!devs.length && <div className="p-4 text-sm text-muted">Nenhum aparelho com esses filtros. <button className="link" onClick={limpar}>limpar filtros</button></div>}
        <div className="px-3 pb-3">{pg.rodape}</div>
      </div>
    </div>
  );
}

/** Tudo o que entrou e saiu deste cliente. Clicar na linha mostra quais aparelhos foram. */
function MovimentacoesDoCliente({ c }: { c: ClientFull }) {
  const q = useQuery({ queryKey: ['movements', 'cliente', c.id], queryFn: () => api.inventory.movements({ clientId: c.id, page: 1, pageSize: 100000 }) });
  const [aberta, setAberta] = useState<string | null>(null);
  const itens = q.data?.items ?? [];
  const pg = usePaginaLocal(itens, 50);
  if (q.isLoading) return <Carregando />;
  if (!itens.length) return <Vazio titulo="Nenhuma movimentação com este cliente" texto="Locações, vendas, comodatos e devoluções aparecem aqui assim que acontecerem." />;
  return (
    <div className="card overflow-x-auto">
      <table className="table">
        <thead><tr><th className="w-6" /><ThN /><th>Quando</th><th>Modalidade</th><th>De</th><th>Para</th><th>Unidade</th><th>Itens</th><th>Por</th></tr></thead>
        <tbody>{pg.visiveis.map((m, i) => {
          const entrou = m.toClientId === c.id;
          const abrir = aberta === m.id;
          return (
            <Fragment key={m.id}>
              <tr className="cursor-pointer" onClick={() => setAberta(abrir ? null : m.id)} aria-expanded={abrir}>
                <td className="text-muted">{abrir ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</td>
                <TdN n={pg.numero(i)} />
                <td className="tnum whitespace-nowrap">{data(m.createdAt, true)}</td>
                <td><Chip tone={m.modality === 'devolucao' ? 'neutral' : m.modality === 'venda' ? 'accent' : m.modality === 'comodato' ? 'signal' : 'ok'}>{m.modalityName}</Chip></td>
                <td className={entrou ? 'text-muted' : ''}>{m.fromName ?? 'Estoque'}</td>
                <td className={entrou ? '' : 'text-muted'}>{m.toName ?? 'Estoque'}</td>
                <td>{m.unit ?? <span className="text-muted">—</span>}</td>
                <td>{m.items.map((x) => `${x.quantity}× ${x.modelName}`).join(', ')}</td>
                <td className="text-muted whitespace-nowrap">{m.userName}</td>
              </tr>
              {abrir && (
                <tr className="bg-surface-2">
                  <td />
                  <td colSpan={8} className="py-2">
                    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-[13px]">
                      {m.devices.map((d) => <li key={d.id}><Link className="link" to={`/inventario/aparelhos/${d.id}`}>{d.identificacao}</Link> <span className="text-muted">· {d.modelName}</span></li>)}
                    </ul>
                    {m.note && <p className="text-muted italic text-[12.5px] mt-1">{m.note}</p>}
                  </td>
                </tr>
              )}
            </Fragment>
          );
        })}</tbody>
      </table>
      <div className="px-3 pb-3">{pg.rodape}</div>
    </div>
  );
}

// ---------- Rede padrão dos aparelhos ----------

/**
 * O que a equipe digita nos telefones deste cliente na hora de configurar: IP, máscara,
 * roteador padrão, DNS e a senha do ramal sem fio (no cofre). Fica no topo de Equipamentos
 * porque é ali que quem vai instalar um aparelho procura.
 */
function RedePadrao({ c }: { c: ClientFull }) {
  const { can } = useAuth();
  const [editar, setEditar] = useState(false);
  const n = c.network;
  const linha = (rotulo: string, valor: string | null | undefined) => (<><dt className="text-muted">{rotulo}</dt><dd className="font-mono tnum">{valor || <span className="text-muted">—</span>}</dd></>);
  return (
    <div className="card p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <span className="eyebrow inline-flex items-center gap-1.5"><Network size={13} /> Rede padrão dos aparelhos</span>
        <Can permission="records.write"><button className="btn-secondary btn-sm" onClick={() => setEditar(true)}><Pencil size={13} /> {n ? 'Editar' : 'Preencher'}</button></Can>
      </div>
      <p className="text-[12.5px] text-muted -mt-1">Vale para <b>todos os aparelhos</b> deste cliente: é o que a equipe digita nos telefones na hora de configurar.</p>
      {!n ? <p className="text-sm text-muted">Nenhuma configuração padrão ainda. Preencha IP, máscara, roteador e DNS.</p> : (
        <div className="grid gap-x-6 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
          <dl className="grid grid-cols-[120px_1fr] gap-y-1 text-sm">{linha('IP Address', n.ipAddress)}{linha('Subnet Mask', n.subnetMask)}</dl>
          <dl className="grid grid-cols-[120px_1fr] gap-y-1 text-sm">{linha('Default Router', n.defaultRouter)}{linha('DNS 1', n.dns1)}{linha('DNS 2', n.dns2)}</dl>
          <div><Campo label="Senha do ramal sem fio"><CampoSegredo secretId={n.wirelessPassword.secretId} hasSecret={n.wirelessPassword.hasSecret} podeRevelar={can('secrets.reveal')} onReveal={api.secrets.reveal} /></Campo></div>
          {n.note && <p className="text-[12.5px] text-ink-2 whitespace-pre-wrap sm:col-span-2 lg:col-span-3">{n.note}</p>}
        </div>
      )}
      <LoginsPadrao c={c} />
      {editar && <RedePadraoForm c={c} onClose={() => setEditar(false)} />}
    </div>
  );
}

/**
 * Login e senha padrão dos aparelhos, POR MODELO: todos os GXP1610 do cliente entram com o
 * mesmo login e senha; os DP722, com outro. Fica junto da rede padrão porque é a mesma
 * informação de "como configurar um aparelho deste cliente".
 */
function LoginsPadrao({ c }: { c: ClientFull }) {
  const { can } = useAuth();
  const qc = useQueryClient(); const toast = useToast();
  const [form, setForm] = useState<ClientDeviceLogin | 'novo' | null>(null);
  const [remover, setRemover] = useState<ClientDeviceLogin | null>(null);
  const [busy, setBusy] = useState(false);
  const logins = c.deviceLogins ?? [];
  const tirar = async () => {
    if (!remover) return;
    setBusy(true);
    try { await api.clients.removeDeviceLogin(c.id, remover.id); setRemover(null); await qc.invalidateQueries({ queryKey: ['client', c.id] }); toast.push('ok', 'Login padrão removido'); }
    catch (e) { toast.push('erro', mensagemErro(e)); } finally { setBusy(false); }
  };
  return (
    <div className="border-t border-line pt-3 flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <span className="eyebrow">Login e senha padrão por modelo</span>
        <Can permission="records.write"><button className="btn-secondary btn-sm" onClick={() => setForm('novo')}><Plus size={13} /> Adicionar modelo</button></Can>
      </div>
      {!logins.length ? <p className="text-sm text-muted">Nenhum ainda. Cadastre o login e a senha com que os aparelhos de cada modelo entram (ex.: todos os GXP1610 deste cliente).</p> : (
        <div className="overflow-x-auto"><table className="table">
          <thead><tr><th>Modelo</th><th>Login</th><th>Senha</th><th>Anotação</th><th /></tr></thead>
          <tbody>{logins.map((l) => (
            <tr key={l.id}>
              <td className="font-medium whitespace-nowrap">{l.modelName}</td>
              <td className="font-mono">{l.username || <span className="text-muted">—</span>}</td>
              <td className="min-w-[220px]"><CampoSegredo secretId={l.password.secretId} hasSecret={l.password.hasSecret} podeRevelar={can('secrets.reveal')} onReveal={api.secrets.reveal} /></td>
              <td className="text-muted text-[12.5px]">{l.note ?? '—'}</td>
              <td className="text-right whitespace-nowrap"><Can permission="records.write"><button className="btn-ghost btn-sm" onClick={() => setForm(l)} title="Editar"><Pencil size={13} /></button><button className="btn-ghost btn-sm text-muted" onClick={() => setRemover(l)} title="Remover"><Trash2 size={13} /></button></Can></td>
            </tr>
          ))}</tbody>
        </table></div>
      )}
      {form && <LoginPadraoForm c={c} l={form === 'novo' ? undefined : form} onClose={() => setForm(null)} />}
      <Confirmar open={!!remover} onClose={() => setRemover(null)} onConfirm={tirar} loading={busy} titulo="Remover login padrão" botao="Remover" texto={<>O login padrão dos <b>{remover?.modelName}</b> sai da ficha de {c.tradeName}. Fica registrado no histórico.</>} />
    </div>
  );
}

function LoginPadraoForm({ c, l, onClose }: { c: ClientFull; l?: ClientDeviceLogin; onClose: () => void }) {
  const qc = useQueryClient(); const toast = useToast(); const { can } = useAuth();
  const models = useQuery({ queryKey: ['models'], queryFn: () => api.inventory.models() });
  const jaTem = new Set((c.deviceLogins ?? []).map((x) => x.modelId));
  const [f, setF] = useState({ modelId: l?.modelId ?? '', username: l?.username ?? '', note: l?.note ?? '' });
  const [senha, setSenha] = useState('');
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const save = async () => {
    setBusy(true); setErr('');
    try {
      await api.clients.saveDeviceLogin(c.id, { modelId: f.modelId, username: f.username.trim() || null, note: f.note.trim() || null, ...(senha ? { password: senha } : {}) });
      await qc.invalidateQueries({ queryKey: ['client', c.id] });
      toast.push('ok', 'Login padrão salvo'); onClose();
    } catch (e) { setErr(mensagemErro(e)); } finally { setBusy(false); }
  };
  return (
    <Modal open onClose={onClose} titulo={l ? `Login padrão · ${l.modelName}` : `Login padrão por modelo · ${c.tradeName}`} rodape={<><button className="btn-secondary" onClick={onClose}>Cancelar</button><button className="btn-primary" disabled={busy || !f.modelId} onClick={save}>{busy ? <Spinner className="text-white" /> : 'Salvar'}</button></>}>
      <div className="flex flex-col gap-3">
        <p className="text-sm text-muted">Vale para todos os aparelhos deste modelo neste cliente.</p>
        <Campo label="Modelo">
          {l ? <input className="input" value={l.modelName} disabled /> : (
            <select className="input" value={f.modelId} onChange={(e) => setF({ ...f, modelId: e.target.value })} autoFocus>
              <option value="">Escolha o modelo…</option>
              {models.data?.map((m) => <option key={m.id} value={m.id} disabled={jaTem.has(m.id)}>{m.name}{jaTem.has(m.id) ? ' (já cadastrado)' : ''}</option>)}
            </select>
          )}
        </Campo>
        <Campo label="Login"><input className="input font-mono" autoComplete="off" value={f.username} onChange={(e) => setF({ ...f, username: e.target.value })} /></Campo>
        <Campo label="Senha"><CampoSegredo secretId={l?.password.secretId ?? null} hasSecret={!!l?.password.hasSecret} podeRevelar={can('secrets.reveal')} onReveal={api.secrets.reveal} onChangeNovo={setSenha} /></Campo>
        <Campo label="Anotação"><input className="input" autoComplete="off" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></Campo>
        {err && <div className="text-bad text-sm">{err}</div>}
      </div>
    </Modal>
  );
}

function RedePadraoForm({ c, onClose }: { c: ClientFull; onClose: () => void }) {
  const qc = useQueryClient(); const toast = useToast(); const { can } = useAuth();
  const n = c.network;
  const [f, setF] = useState({ ipAddress: n?.ipAddress ?? '', subnetMask: n?.subnetMask ?? '255.255.255.0', defaultRouter: n?.defaultRouter ?? '', dns1: n?.dns1 ?? '8.8.8.8', dns2: n?.dns2 ?? '8.8.4.4', note: n?.note ?? '' });
  const [senha, setSenha] = useState('');
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const save = async () => {
    setBusy(true); setErr('');
    try {
      await api.clients.saveNetwork(c.id, { ipAddress: f.ipAddress.trim() || null, subnetMask: f.subnetMask.trim() || null, defaultRouter: f.defaultRouter.trim() || null, dns1: f.dns1.trim() || null, dns2: f.dns2.trim() || null, note: f.note.trim() || null, ...(senha ? { wirelessPassword: senha } : {}) });
      await qc.invalidateQueries({ queryKey: ['client', c.id] });
      toast.push('ok', 'Rede padrão salva'); onClose();
    } catch (e) { setErr(mensagemErro(e)); } finally { setBusy(false); }
  };
  // os pontos entram sozinhos: "19216801" vira "192.168.0.1"
  const campo = (k: keyof typeof f, label: string, placeholder: string) => <Campo label={label}><InputIp placeholder={placeholder} value={f[k]} onChange={(v) => setF({ ...f, [k]: v })} /></Campo>;
  return (
    <Modal open onClose={onClose} titulo={`Rede padrão dos aparelhos · ${c.tradeName}`} rodape={<><button className="btn-secondary" onClick={onClose}>Cancelar</button><button className="btn-primary" disabled={busy} onClick={save}>{busy ? <Spinner className="text-white" /> : 'Salvar'}</button></>}>
      <div className="flex flex-col gap-3">
        <p className="text-sm text-muted">Vale para todos os aparelhos deste cliente. Cada aparelho ainda pode ter o IP próprio na ficha dele.</p>
        <div className="grid grid-cols-2 gap-3">
          {campo('ipAddress', 'IP Address', '10.20.0.77')}
          {campo('subnetMask', 'Subnet Mask', '255.255.255.0')}
          {campo('defaultRouter', 'Default Router', '10.20.0.1')}
          <span />
          {campo('dns1', 'DNS 1', '8.8.8.8')}
          {campo('dns2', 'DNS 2', '8.8.4.4')}
        </div>
        <Campo label="Senha do ramal sem fio"><CampoSegredo secretId={n?.wirelessPassword.secretId ?? null} hasSecret={!!n?.wirelessPassword.hasSecret} podeRevelar={can('secrets.reveal')} onReveal={api.secrets.reveal} onChangeNovo={setSenha} /></Campo>
        <Campo label="Anotações" dica="VLAN, provisionamento, particularidades…"><textarea className="input" rows={2} autoComplete="off" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></Campo>
        {err && <div className="text-bad text-sm">{err}</div>}
      </div>
    </Modal>
  );
}

// ---------- Unidades ----------

/**
 * As unidades do cliente (Matriz, filiais, lojas). Todo cliente tem a Matriz, que é a padrão.
 * É desta lista que sai a escolha de unidade na hora de movimentar aparelhos.
 */
function Unidades({ c }: { c: ClientFull }) {
  const q = useQuery({ queryKey: ['client-units', c.id], queryFn: () => api.clients.units(c.id) });
  const qc = useQueryClient(); const toast = useToast();
  const [nova, setNova] = useState('');
  const [novoEndereco, setNovoEndereco] = useState('');
  const [novoIp, setNovoIp] = useState('');
  const [editando, setEditando] = useState<ClientUnit | null>(null);
  const [remover, setRemover] = useState<ClientUnit | null>(null);
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const atualizar = () => Promise.all(['client-units', 'client', 'client-devices', 'devices'].map((k) => qc.invalidateQueries({ queryKey: [k] })));
  const adicionar = async () => {
    setBusy(true); setErr('');
    try { await api.clients.createUnit(c.id, { name: nova.trim(), address: novoEndereco.trim() || null, egressIp: novoIp.trim() || null }); setNova(''); setNovoEndereco(''); setNovoIp(''); await atualizar(); toast.push('ok', 'Unidade cadastrada'); }
    catch (e) { setErr(mensagemErro(e)); } finally { setBusy(false); }
  };
  const tirar = async () => {
    if (!remover) return;
    setBusy(true);
    try { await api.clients.removeUnit(c.id, remover.id); setRemover(null); await atualizar(); toast.push('ok', 'Unidade removida'); }
    catch (e) { toast.push('erro', mensagemErro(e)); } finally { setBusy(false); }
  };
  if (q.isLoading) return <Carregando />;
  const unidades = q.data ?? [];
  return (
    <div className="grid gap-4 md:grid-cols-3 items-start">
      <div className="card overflow-x-auto md:col-span-2">
        <table className="table">
          <thead><tr><ThN /><th>Unidade</th><th>Endereço</th><th>IP fixo de saída</th><th>Observação</th><th className="text-right">Aparelhos</th><th /></tr></thead>
          <tbody>{unidades.map((u, i) => (
            <tr key={u.id}>
              <TdN n={contar(i)} />
              <td className="font-medium"><span className="inline-flex items-center gap-1.5">{u.name}{u.isMain && <Chip tone="accent" title="Unidade padrão: todo cliente tem"><Star size={11} /> padrão</Chip>}</span></td>
              <td className="text-ink-2 max-w-[280px]">{u.address ?? <span className="text-muted">—</span>}</td>
              <td className="font-mono tnum">{u.egressIp ?? <span className="text-muted">—</span>}</td>
              <td className="text-muted">{u.note ?? '—'}</td>
              <td className="text-right tnum">{u.deviceCount}</td>
              <td className="text-right whitespace-nowrap">
                <Can permission="records.write">
                  <button className="btn-ghost btn-sm" onClick={() => setEditando(u)}>Editar</button>
                  {!u.isMain && <button className="btn-ghost btn-sm text-muted" onClick={() => setRemover(u)} disabled={u.deviceCount > 0} title={u.deviceCount > 0 ? 'Tem aparelhos: mova-os antes de remover' : 'Remover'}><Trash2 size={14} /></button>}
                </Can>
              </td>
            </tr>
          ))}</tbody>
        </table>
      </div>
      <Can permission="records.write">
        <div className="card p-4 flex flex-col gap-3">
          <div className="eyebrow">Nova unidade</div>
          <Campo label="Nome" dica="filial, loja, andar, ambulatório…"><input className="input" placeholder="Loja Simões Filho" value={nova} onChange={(e) => setNova(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && nova.trim() && adicionar()} /></Campo>
          <Campo label="Endereço"><input className="input" autoComplete="off" placeholder="Rua, número, bairro, cidade" value={novoEndereco} onChange={(e) => setNovoEndereco(e.target.value)} /></Campo>
          <Campo label="IP fixo de saída" dica="o IP da internet desta unidade (o que chega ao servidor)"><InputIp placeholder="200.180.10.5" value={novoIp} onChange={setNovoIp} /></Campo>
          <button className="btn-primary self-start" disabled={busy || !nova.trim()} onClick={adicionar}>{busy ? <Spinner className="text-white" /> : <><Plus size={15} /> Cadastrar</>}</button>
          {err && <div className="text-bad text-sm">{err}</div>}
          <p className="text-[12.5px] text-muted">A <b>Matriz</b> existe em todo cliente e é a unidade padrão: aparelho movimentado sem unidade escolhida fica nela.</p>
        </div>
      </Can>
      {editando && <UnidadeForm c={c} u={editando} onClose={() => setEditando(null)} onSaved={async () => { setEditando(null); await atualizar(); }} />}
      <Confirmar open={!!remover} onClose={() => setRemover(null)} onConfirm={tirar} loading={busy} titulo="Remover unidade" botao="Remover" texto={<>A unidade <b>{remover?.name}</b> sai da lista de {c.tradeName}. O histórico das movimentações continua mostrando o nome dela.</>} />
    </div>
  );
}

function UnidadeForm({ c, u, onClose, onSaved }: { c: ClientFull; u: ClientUnit; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [f, setF] = useState({ name: u.name, address: u.address ?? '', egressIp: u.egressIp ?? '', note: u.note ?? '' });
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const save = async () => {
    setBusy(true); setErr('');
    try { await api.clients.updateUnit(c.id, u.id, { name: f.name.trim(), address: f.address.trim() || null, egressIp: f.egressIp.trim() || null, note: f.note.trim() || null }); toast.push('ok', 'Unidade salva'); onSaved(); }
    catch (e) { setErr(mensagemErro(e)); } finally { setBusy(false); }
  };
  return (
    <Modal open onClose={onClose} titulo={`Editar unidade ${u.name}`} rodape={<><button className="btn-secondary" onClick={onClose}>Cancelar</button><button className="btn-primary" disabled={busy || !f.name.trim()} onClick={save}>{busy ? <Spinner className="text-white" /> : 'Salvar'}</button></>}>
      <div className="flex flex-col gap-3">
        <Campo label="Nome" dica={u.deviceCount > 0 ? `os ${u.deviceCount} aparelho(s) desta unidade acompanham o nome novo` : undefined}><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} autoFocus /></Campo>
        <Campo label="Endereço"><input className="input" autoComplete="off" placeholder="Rua, número, bairro, cidade" value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} /></Campo>
        <Campo label="IP fixo de saída" dica="o IP da internet desta unidade (o que chega ao servidor)"><InputIp placeholder="200.180.10.5" value={f.egressIp} onChange={(v) => setF({ ...f, egressIp: v })} /></Campo>
        <Campo label="Observação" dica="referência, horário, contato…"><input className="input" autoComplete="off" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></Campo>
        {err && <div className="text-bad text-sm">{err}</div>}
      </div>
    </Modal>
  );
}

// ---------- Acessos ----------

/** A anotação daquele produto/módulo, se houver. Vem do campo "Anotações" da aba Produtos. */
function Anotacao({ texto }: { texto: string | null }) {
  if (!texto) return null;
  return (
    <div>
      <div className="eyebrow mb-1">Anotação</div>
      <p className="text-sm whitespace-pre-wrap text-ink-2">{texto}</p>
    </div>
  );
}

function Acessos({ c }: { c: ClientFull }) {
  const { can } = useAuth();
  const lp = c.subscriptions.find((s) => s.productCode === 'linepbx' && s.active);
  const sz = c.subscriptions.find((s) => s.productCode === 'szchat' && s.active);
  // FOP2 e Omniboard são módulos do LinePBX
  const f2 = lp ? lp.modules.find((m) => m.moduleCode === 'fop2' && m.active) : undefined;
  const om = lp ? lp.modules.find((m) => m.moduleCode === 'omniboard' && m.active) : undefined;
  if (!lp && !sz) return <Vazio titulo="Sem acessos cadastrados" texto="Os acessos aparecem quando o cliente tem LinePBX (e seus módulos FOP2 e Omniboard) ou SZChat. O login padrão dos aparelhos fica em Equipamentos." />;
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {lp && (
        <div className="card p-4 flex flex-col gap-3">
          <div className="flex items-center justify-between"><Chip color={lp.color}>LinePBX</Chip>{c.links.web && <a className="link text-sm" href={c.links.web} target="_blank" rel="noreferrer">abrir interface ↗</a>}</div>
          {/* usuário e senha do SSH são de cada técnico (o mesmo em todo servidor), não do cliente;
              fica só a porta, que é do servidor */}
          <dl className="grid grid-cols-[110px_1fr] gap-y-1 text-sm">
            <dt className="text-muted">Hospedagem</dt><dd>{lp.settings?.hostingName ?? '—'}</dd>
            <dt className="text-muted">Endereço</dt><dd className="font-mono break-all">{lp.settings?.domain ?? '—'}</dd>
            <dt className="text-muted">IP</dt><dd className="font-mono">{lp.settings?.serverIp ?? '—'}</dd>
            <dt className="text-muted">Porta SSH</dt><dd className="font-mono tnum">{lp.settings?.sshPort ?? '—'}</dd>
          </dl>
          <Anotacao texto={lp.notes} />
        </div>
      )}
      {f2 && lp && <div className="card p-4 flex flex-col gap-3"><div className="flex items-center justify-between"><Chip color={lp.color}>LinePBX › FOP2</Chip>{c.links.fop2 && <a className="link text-sm" href={c.links.fop2} target="_blank" rel="noreferrer">abrir painel ↗</a>}</div><dl className="grid grid-cols-[110px_1fr] gap-y-1 text-sm"><dt className="text-muted">Ramal admin</dt><dd className="font-mono">{f2.settings?.adminExtension ?? '—'}</dd></dl>
        <Campo label="Senha do usuário padrão"><CampoSegredo secretId={f2.settings?.defaultUserPassword?.secretId ?? null} hasSecret={!!f2.settings?.defaultUserPassword?.hasSecret} podeRevelar={can('secrets.reveal')} onReveal={api.secrets.reveal} /></Campo>
        <p className="text-[12px] text-muted">O link do FOP2 nunca carrega senha na URL.</p><Anotacao texto={f2.notes} /></div>}
      {om && lp && <div className="card p-4 flex flex-col gap-3"><Chip color={lp.color}>LinePBX › Omniboard</Chip><dl className="grid grid-cols-[110px_1fr] gap-y-1 text-sm"><dt className="text-muted">Admin</dt><dd className="font-mono">{om.settings?.adminLogin ?? '—'}</dd></dl>
        <Campo label="Senha admin"><CampoSegredo secretId={om.settings?.adminPassword?.secretId ?? null} hasSecret={!!om.settings?.adminPassword?.hasSecret} podeRevelar={can('secrets.reveal')} onReveal={api.secrets.reveal} /></Campo>
        <Campo label="Senha padrão de usuário"><CampoSegredo secretId={om.settings?.userDefaultPassword?.secretId ?? null} hasSecret={!!om.settings?.userDefaultPassword?.hasSecret} podeRevelar={can('secrets.reveal')} onReveal={api.secrets.reveal} /></Campo><Anotacao texto={om.notes} /></div>}
      {sz && <div className="card p-4 flex flex-col gap-3"><Chip color={sz.color}>SZChat</Chip><dl className="grid grid-cols-[110px_1fr] gap-y-1 text-sm"><dt className="text-muted">Admin</dt><dd className="font-mono">{sz.settings?.adminLogin ?? '—'}</dd></dl>
        <Campo label="Senha admin"><CampoSegredo secretId={sz.settings?.adminPassword?.secretId ?? null} hasSecret={!!sz.settings?.adminPassword?.hasSecret} podeRevelar={can('secrets.reveal')} onReveal={api.secrets.reveal} /></Campo><Anotacao texto={sz.notes} /></div>}
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

/**
 * Aba Projetos: de quais projetos este cliente participa e como ele está em cada um.
 * A marcação acontece na ficha do projeto — aqui é só a visão do cliente.
 */
function ProjetosDoCliente({ c }: { c: ClientFull }) {
  const q = useQuery({ queryKey: ['cliente-projetos', c.id], queryFn: () => api.clients.projetos(c.id) });
  if (q.isLoading) return <Carregando />;
  const items = q.data ?? [];
  if (!items.length) return <Vazio titulo="Fora de todos os projetos" texto="Quando este cliente entrar num projeto, ele aparece aqui com o que já foi feito." />;
  return (
    <div className="card overflow-x-auto">
      <table className="table">
        <thead><tr><th>Projeto</th><th>Situação</th><th>Etapas</th><th>Responsável</th><th>Prazo</th></tr></thead>
        <tbody>
          {items.map((p) => (
            <tr key={p.projectClientId}>
              <td>
                <Link className="link" to={`/projetos/${p.projectId}`}>{p.name}</Link>
                {p.projectStatus !== 'aberto' && <Chip tone="muted" className="ml-2">{p.projectStatus === 'concluido' ? 'encerrado' : 'cancelado'}</Chip>}
              </td>
              <td><ChipSituacao status={p.status} motivo={p.blockedReason} /></td>
              <td className="tnum">{p.feitas} de {p.etapas}</td>
              <td className={p.assigneeName ? '' : 'text-muted italic'}>{p.assigneeName ?? 'sem responsável'}</td>
              <td>{p.dueDate ? data(p.dueDate) : <span className="text-muted">—</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
