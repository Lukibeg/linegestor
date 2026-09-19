/**
 * Circuitos e DIDs: um pequeno painel no topo (circuitos, canais, valor mensal, numeração)
 * e duas abas — a lista de circuitos e a Numeração (todos os DIDs de todos os circuitos).
 */
import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { api } from '../../api/index.js';
import type { Circuit } from '../../api/types.js';
import { Pagina } from '../../components/layout/AppShell.js';
import { Can, useAuth } from '../../lib/auth.js';
import { Abas, Campo, CampoSegredo, Carregando, Chip, InputIp, Kpi, Modal, Ocupacao, Paginacao, Spinner, TODOS, Toggle, Vazio, mensagemErro, useToast } from '../../components/ui/index.js';
import { didFormatado, paraCentavos, reais } from '../../lib/format.js';
import { Th, useOrdenacao } from '../../lib/ordenacao.js';
import { useLembrarFiltros } from '../../lib/voltar.js';
import { contarDe, TdN, ThN } from '../../lib/contagem.js';
import { Numeracao } from '../dids/Lista.js';
import { BarrasRanking } from '../../components/graficos.js';

type Aba = 'circuitos' | 'numeracao';

export function CircuitosLista() {
  const [sp, setSp] = useSearchParams();
  useLembrarFiltros('/circuitos'); // o botão Voltar do detalhe traz estes filtros de volta
  const nav = useNavigate();
  const aba = (sp.get('aba') === 'numeracao' ? 'numeracao' : 'circuitos') as Aba;
  const q = sp.get('q') ?? ''; const carrierId = sp.get('operadora') ?? ''; const ownerClientId = sp.get('titular') ?? ''; const page = Number(sp.get('p') ?? 1);
  // o interruptor dos links de terceiros vale para as DUAS abas e fica no endereço, como os filtros
  const terceiros = sp.get('terceiros') === '1';
  const tudo = sp.get('tudo') === '1';
  const tamanho = tudo ? TODOS : 50;
  const numero = contarDe(tudo ? 1 : page, tamanho); // a contagem segue pela lista toda, não recomeça a cada página
  const filtros = { q, carrierId, ownerClientId, includeThirdParty: terceiros };
  const temFiltro = !!(q || carrierId || ownerClientId);
  const [novo, setNovo] = useState(false);
  const o = useOrdenacao('name');
  const set = (k: string, v: string | null) => { const n = new URLSearchParams(sp); if (v) n.set(k, v); else n.delete(k); if (k !== 'p') n.delete('p'); setSp(n, { replace: true }); };
  // trocar de aba limpa os filtros (são outros em cada uma), mas o interruptor dos terceiros
  // é modo de exibição, não filtro: ele atravessa as duas abas
  const trocarAba = (a: Aba) => {
    const n = new URLSearchParams();
    if (a === 'numeracao') n.set('aba', 'numeracao');
    if (terceiros) n.set('terceiros', '1');
    setSp(n, { replace: true });
  };
  const carriers = useQuery({ queryKey: ['catalog', 'carriers'], queryFn: () => api.admin.catalog('carriers') });
  // só quem é titular de algum circuito da lista (com o interruptor, entram os de links de terceiros)
  const titulares = useQuery({ queryKey: ['circuit-owners', terceiros], queryFn: () => api.circuits.owners(terceiros) });
  // os cartões do topo usam os MESMOS filtros da lista
  const resumo = useQuery({ queryKey: ['circuits', 'summary', filtros], queryFn: () => api.circuits.summary(filtros) });
  const lista = useQuery({ queryKey: ['circuits', filtros, page, tudo, o.ord, o.dir], queryFn: () => api.circuits.list({ ...filtros, page: tudo ? 1 : page, pageSize: tamanho, sort: o.ord, dir: o.dir }), enabled: aba === 'circuitos' });
  const r = resumo.data;
  return (
    <Pagina titulo="Circuitos e DIDs" sub="Feixes contratados junto às operadoras e toda a numeração." acoes={aba === 'circuitos' ? <Can permission="records.write"><button className="btn-primary" onClick={() => setNovo(true)}><Plus size={16} /> Novo circuito</button></Can> : undefined}>
      {/* painel resumido — segue os filtros escolhidos abaixo */}
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4 mb-5">
        <Kpi label={temFiltro ? 'Circuitos (filtrados)' : 'Circuitos'} valor={r ? r.circuits : '…'} sub={r ? `${r.channels.toLocaleString('pt-BR')} canais no total` : undefined} tone="accent" />
        <Kpi label="Valor mensal (circuitos)" valor={r ? reais(r.monthlyValueCents) : '…'} sub="soma do que é pago às operadoras" />
        <Kpi label="DIDs" valor={r ? r.dids.total.toLocaleString('pt-BR') : '…'} sub={r ? `${r.dids.assigned.toLocaleString('pt-BR')} com cliente` : undefined} tone="ok" />
        {/* "DIDs sem circuito" saiu: todo DID nasce dentro de um circuito (rodada 23) */}
        <Kpi label="DIDs livres" valor={r ? r.dids.free.toLocaleString('pt-BR') : '…'} sub="sem cliente, prontos para alocar" tone={r && r.dids.free === 0 && r.dids.total > 0 ? 'signal' : 'neutral'} />
      </div>
      {temFiltro && <p className="text-[12.5px] text-muted -mt-3 mb-4">Os cartões acima estão somando apenas o que o filtro deixou passar. <button className="link" onClick={() => setSp(aba === 'numeracao' ? { aba: 'numeracao' } : {}, { replace: true })}>limpar filtros</button></p>}

      <Abas atual={aba} onChange={trocarAba} abas={[{ id: 'circuitos', label: 'Circuitos' }, { id: 'numeracao', label: <>Numeração <span className="text-muted">(todos os DIDs)</span></> }]} />

      {aba === 'numeracao' ? <Numeracao /> : (<>
        <div className="card p-3 mb-4 flex flex-wrap gap-2">
          <input className="input max-w-xs" placeholder="Buscar por nome, N° do circuito ou operadora" value={q} onChange={(e) => set('q', e.target.value)} />
          <select className="input w-auto" value={carrierId} onChange={(e) => set('operadora', e.target.value || null)}><option value="">Todas as operadoras</option>{carriers.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
          <select className="input w-auto" value={ownerClientId} onChange={(e) => set('titular', e.target.value || null)}><option value="">Todos os titulares</option>{titulares.data?.map((t) => <option key={t.id} value={t.id}>{t.name}{t.isInternal ? ' (interna)' : ''}</option>)}</select>
          <span className="flex-1" />
          <Toggle checked={terceiros} onChange={(v) => set('terceiros', v ? '1' : null)} label="Habilitar links de terceiros" />
        </div>
        {/* quem está mais cheio: a ocupação de numeração, do mais apertado para o mais folgado */}
        {(lista.data?.items.filter((c) => c.dids.total > 0).length ?? 0) > 1 && (
          <section className="card p-4 mb-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
              <h2 className="font-display font-semibold">Quem está mais cheio</h2>
              <span className="text-[12px] text-muted">% da numeração já com cliente. Clique para abrir o circuito.</span>
            </div>
            <BarrasRanking
              larguraRotulo="w-[190px]"
              maximo={100}
              formatar={(v) => `${v}%`}
              acao={(id) => nav(`/circuitos/${id}`)}
              dados={(lista.data?.items ?? [])
                .filter((c) => c.dids.total > 0)
                .map((c) => ({
                  id: c.id,
                  valor: Math.round((c.dids.assigned / c.dids.total) * 100),
                  // a mesma leitura da coluna "Ocupação" da tabela: perto do limite acende
                  tom: (c.dids.assigned / c.dids.total >= 0.9 ? 'signal' : 'ok') as 'signal' | 'ok',
                  rotulo: c.name,
                  titulo: `${c.dids.assigned} de ${c.dids.total} com cliente · ${c.dids.free} livre(s) · ${c.channels} canais`,
                }))
                .sort((a, b) => b.valor - a.valor)
                .slice(0, 10)}
            />
          </section>
        )}

        {lista.isLoading ? <Carregando /> : !lista.data?.items.length ? <Vazio titulo="Nenhum circuito" texto="Cadastre o feixe contratado junto à operadora." /> : (
          <div className="card overflow-x-auto"><table className="table">
            <thead><tr>
              <ThN /><Th o={o} col="name">Nome</Th><Th o={o} col="carrierName">Operadora</Th><Th o={o} col="code">N° do circuito</Th><Th o={o} col="keyNumber">Número chave</Th>
              <Th o={o} col="ownerName">Titular</Th><Th o={o} col="channels" align="right">Canais</Th><Th o={o} col="total" align="right">DIDs</Th>
              <Th o={o} col="free" align="right">Livres</Th><Th o={o} col="uso">Ocupação</Th><Th o={o} col="monthlyValueCents" align="right">Valor/mês</Th>
            </tr></thead>
            <tbody>{lista.data.items.map((c, i) => (
              <tr key={c.id} className="cursor-pointer" onClick={() => nav(`/circuitos/${c.id}`)}>
                <TdN n={numero(i)} /><td className="font-medium">{c.name} {c.thirdParty && <Chip tone="muted" title="Tronco do próprio cliente, com outra operadora">terceiro</Chip>}</td><td>{c.carrierName ?? '—'}</td><td className="font-mono tnum">{c.code}</td><td className="font-mono tnum whitespace-nowrap">{c.keyNumber ? didFormatado(c.keyNumber) : <span className="text-muted">—</span>}</td><td className="text-ink-2">{c.ownerName ?? '—'}</td><td className="text-right tnum">{c.channels}</td><td className="text-right tnum">{c.dids.total}</td><td className="text-right tnum">{c.dids.free}</td><td><Ocupacao total={c.dids.total} assigned={c.dids.assigned} /></td><td className="text-right tnum">{reais(c.monthlyValueCents)}</td>
              </tr>))}</tbody></table></div>
        )}
        {lista.data && <Paginacao page={page} pageSize={50} total={lista.data.total} onChange={(p) => set('p', String(p))} tudo={tudo} onTudo={(v) => set('tudo', v ? '1' : null)} />}
      </>)}
      <CircuitoForm open={novo} onClose={() => setNovo(false)} onSaved={(c) => { setNovo(false); nav(`/circuitos/${c.id}`); }} />
    </Pagina>
  );
}

export function CircuitoForm({ open, onClose, onSaved, circuito }: { open: boolean; onClose: () => void; onSaved: (c: Circuit) => void; circuito?: Circuit }) {
  const carriers = useQuery({ queryKey: ['catalog', 'carriers'], queryFn: () => api.admin.catalog('carriers'), enabled: open });
  // no cadastro, qualquer cliente pode virar titular (é aqui que ele passa a ter um circuito)
  const owners = useQuery({ queryKey: ['client-options', 'internal'], queryFn: () => api.clients.options({ includeInternal: true }), enabled: open });
  const { can } = useAuth();
  const qc = useQueryClient(); const toast = useToast();
  const [f, setF] = useState<Record<string, any>>({});
  const [senha, setSenha] = useState('');
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  useEffect(() => { if (open) { setErr(''); setSenha(''); setF(circuito ? { name: circuito.name, code: circuito.code, keyNumber: circuito.keyNumber ? didFormatado(circuito.keyNumber) : '', carrierId: circuito.carrierId ?? '', channels: circuito.channels, ownerClientId: circuito.ownerClientId ?? '', monthlyValue: circuito.monthlyValueCents != null ? (circuito.monthlyValueCents / 100).toFixed(2).replace('.', ',') : '', authType: circuito.authType ?? 'ip', signalingIp: circuito.signalingIp ?? '', authIp: circuito.authIp ?? '', authUsername: circuito.authUsername ?? '', notes: circuito.notes ?? '', thirdParty: circuito.thirdParty } : { name: '', code: '', keyNumber: '', carrierId: '', channels: 0, ownerClientId: owners.data?.find((o) => o.internalCode === 'voicenet')?.id ?? '', monthlyValue: '', authType: 'ip', signalingIp: '', authIp: '', authUsername: '', notes: '', thirdParty: false }); } }, [open, circuito, owners.data]);
  const save = async () => {
    setBusy(true); setErr('');
    try {
      const body = { name: f.name, code: f.code, keyNumber: f.keyNumber || null, carrierId: f.carrierId || null, channels: Number(f.channels) || 0, ownerClientId: f.ownerClientId || null, monthlyValueCents: f.monthlyValue ? paraCentavos(f.monthlyValue) : null, authType: f.authType === 'login' ? 'login' : 'ip', signalingIp: f.signalingIp || null, authIp: f.authType === 'login' ? null : f.authIp || null, authUsername: f.authType === 'login' ? f.authUsername || null : null, notes: f.notes || null, thirdParty: !!f.thirdParty, ...(senha ? { authPassword: senha } : {}) };
      const r = circuito ? await api.circuits.update(circuito.id, body) : await api.circuits.create(body);
      await qc.invalidateQueries({ queryKey: ['circuits'] }); await qc.invalidateQueries({ queryKey: ['circuit', r.id] }); await qc.invalidateQueries({ queryKey: ['circuit-owners'] });
      toast.push('ok', circuito ? 'Circuito atualizado' : 'Circuito criado'); onSaved(r);
    } catch (e) { setErr(mensagemErro(e)); } finally { setBusy(false); }
  };
  return (
    <Modal open={open} onClose={onClose} lateral largura="max-w-xl" titulo={circuito ? `Editar ${circuito.name}` : 'Novo circuito'} rodape={<><button className="btn-secondary" onClick={onClose}>Cancelar</button><button className="btn-primary" disabled={busy || !f.name || !f.code} onClick={save}>{busy ? <Spinner className="text-white" /> : 'Salvar'}</button></>}>
      <div className="flex flex-col gap-3">
        <Campo label="Nome"><input className="input" autoComplete="off" value={f.name ?? ''} onChange={(e) => setF({ ...f, name: e.target.value })} autoFocus /></Campo>
        <div className="grid grid-cols-2 gap-3">
          <Campo label="N° do circuito" dica="o número/código do feixe na operadora"><input className="input font-mono" autoComplete="off" value={f.code ?? ''} onChange={(e) => setF({ ...f, code: e.target.value })} /></Campo>
          <Campo label="Operadora"><select className="input" value={f.carrierId ?? ''} onChange={(e) => setF({ ...f, carrierId: e.target.value })}><option value="">— sem operadora —</option>{carriers.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Campo>
          <Campo label="Número chave" dica="o número piloto do feixe"><input className="input font-mono tnum" placeholder="(71) 3020-0000" value={f.keyNumber ?? ''} onChange={(e) => setF({ ...f, keyNumber: e.target.value })} onBlur={() => setF((x) => ({ ...x, keyNumber: x.keyNumber ? didFormatado(x.keyNumber) : '' }))} /></Campo>
          <Campo label="Canais (chamadas simultâneas)"><input type="number" min={0} className="input tnum" value={f.channels ?? 0} onChange={(e) => setF({ ...f, channels: e.target.value })} /></Campo>
          <Campo label="Valor mensal (R$)"><input className="input tnum" placeholder="0,00" value={f.monthlyValue ?? ''} onChange={(e) => setF({ ...f, monthlyValue: e.target.value })} /></Campo>
          <Campo label="Titular" dica="quem detém o contrato com a operadora (normalmente VoiceNet)" className="col-span-2"><select className="input" value={f.ownerClientId ?? ''} onChange={(e) => setF({ ...f, ownerClientId: e.target.value })}><option value="">—</option>{owners.data?.map((o) => <option key={o.id} value={o.id}>{o.name}{o.isInternal ? ' (interna)' : ''}</option>)}</select></Campo>
          {/* o tronco que o próprio cliente contratou: guardar é útil, mas não pode poluir o controle da VoiceNet */}
          <label className="col-span-2 flex items-start gap-2 text-sm cursor-pointer">
            <input type="checkbox" className="mt-0.5" checked={!!f.thirdParty} onChange={(e) => setF({ ...f, thirdParty: e.target.checked })} />
            <span>
              <span className="font-semibold">Link de terceiro (não é da VoiceNet)</span>
              <span className="block text-muted text-[12.5px]">Marque quando o tronco for do próprio cliente, com outra operadora. Ele e os números dele ficam fora das listas, dos cartões e do painel — só aparecem quando alguém liga "Habilitar links de terceiros".</span>
            </span>
          </label>
        </div>
        <fieldset className="card p-3 flex flex-col gap-3" disabled={!can('servers.write')}>
          <legend className="eyebrow px-1">Tronco (autenticação) {!can('servers.write') && '· somente leitura'}</legend>
          {/* dois jeitos de o tronco se autenticar na operadora: pelo IP do PBX, ou por login e senha */}
          <div className="grid grid-cols-2 gap-1 rounded-lg border border-line p-1" role="radiogroup" aria-label="Tipo de autenticação">
            {([['ip', 'Por IP'], ['login', 'Por login e senha']] as const).map(([t, rotulo]) => (
              <button key={t} type="button" role="radio" aria-checked={(f.authType ?? 'ip') === t} onClick={() => setF({ ...f, authType: t })} className={`rounded-md px-2 py-1.5 text-[13px] font-semibold ${(f.authType ?? 'ip') === t ? 'bg-accent text-white' : 'text-ink-2 hover:bg-surface-2'}`}>{rotulo}</button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Campo label="IP da operadora"><InputIp value={f.signalingIp ?? ''} onChange={(v) => setF({ ...f, signalingIp: v })} /></Campo>
            {(f.authType ?? 'ip') === 'ip'
              ? <Campo label="IP do PBX" dica="o IP que a operadora autoriza"><InputIp value={f.authIp ?? ''} onChange={(v) => setF({ ...f, authIp: v })} /></Campo>
              : <Campo label="Login do tronco"><input className="input font-mono" autoComplete="off" data-lpignore="true" data-1p-ignore value={f.authUsername ?? ''} onChange={(e) => setF({ ...f, authUsername: e.target.value })} /></Campo>}
          </div>
          {f.authType === 'login' && <Campo label="Senha do tronco"><CampoSegredo secretId={circuito?.authPassword.secretId ?? null} hasSecret={!!circuito?.authPassword.hasSecret} podeRevelar={can('secrets.reveal')} onReveal={api.secrets.reveal} onChangeNovo={setSenha} /></Campo>}
        </fieldset>
        {/* autoComplete desligado: o navegador "adivinhava" este campo como endereço e preenchia sozinho ("address") */}
        <Campo label="Anotações"><textarea className="input" rows={3} name="anotacoes-do-circuito" autoComplete="off" data-lpignore="true" data-1p-ignore data-bwignore value={f.notes ?? ''} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Campo>
        {err && <div className="text-bad text-sm">{err}</div>}
      </div>
    </Modal>
  );
}
