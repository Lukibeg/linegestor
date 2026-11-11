/**
 * Detalhe de um circuito: dados, ocupação, DIDs dele e criação de faixa.
 *
 * Patch 1.6 (30/09): os DIDs daqui são a própria tabela da Numeração com o circuito fixo — busca
 * (número ou observação), filtros, seleção e edição em massa, sem ir para a aba Numeração.
 *
 * Patch 2.4.6: CANCELAR O LINK (o Luan: "as vezes fazemos cancelamento de links quero que tenha uma opção de marcar como
 * cancelado, onde ele é meio que excluído porém fica um registro que ele foi na verdade cancelado"). O dia e o motivo; o link
 * sai das listas, dos cartões e do painel, mas a ficha continua, com a faixa do cancelamento, os números e as movimentações.
 * O Reativar traz de volta.
 */
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Ban, Pencil, Plus, Trash2, Undo2 } from 'lucide-react';
import { diaComAno, hojeNoCalendario, oLink } from '@gestor/shared';
import { api } from '../../api/index.js';
import { Pagina } from '../../components/layout/AppShell.js';
import { Can, useAuth } from '../../lib/auth.js';
import { Campo, CampoSegredo, Carregando, Chip, Confirmar, EscolherComBusca, Kpi, Modal, Spinner, Vazio, mensagemErro, useToast } from '../../components/ui/index.js';
import { didFormatado, reais } from '../../lib/format.js';
import { CircuitoForm } from './Lista.js';
import { Voltar } from '../../lib/voltar.js';
import { Numeracao } from '../dids/Lista.js';
import { MovimentacoesDosCircuitos } from './Movimentacoes.js';
import { ArtigosLigados } from '../base/partes.js';

/** "O " ou "O link " antes do nome em negrito (o nome que já começa com "Link" não repete a palavra). */
const prefixo = (nome: string) => oLink(nome, true).slice(0, -nome.length);

// criado uma vez só: um formatador com fuso custa caro para criar
const fmtQuando = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

/**
 * Cancelar o link (2.4.6): o dia em que vale (hoje, por padrão) e o motivo (opcional). O erro aparece ao lado do botão.
 */
function CancelarLink({ circuito: c, onClose, onFeito }: { circuito: { id: string; name: string; dids: { total: number; assigned: number } }; onClose: () => void; onFeito: () => void }) {
  const toast = useToast();
  const [dia, setDia] = useState(() => hojeNoCalendario());
  const [motivo, setMotivo] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState('');
  const confirmar = async () => {
    if (!dia) { setErro('Diga o dia do cancelamento.'); return; }
    setOcupado(true); setErro('');
    try {
      await api.circuits.cancelar(c.id, { dia, motivo });
      toast.push('ok', `${oLink(c.name, true)} foi cancelado: saiu das listas e ficou guardado.`);
      onFeito();
    } catch (e) {
      setErro(mensagemErro(e));
    } finally {
      setOcupado(false);
    }
  };
  return (
    <Modal open onClose={onClose} titulo="Cancelar o link" largura="max-w-lg" rodape={(
      <>
        {erro && <p className="text-bad text-[13px] mr-auto basis-full sm:basis-auto sm:flex-1 min-w-0" role="alert" id="cancelar-erro">{erro}</p>}
        <button type="button" className="btn-secondary" onClick={onClose} disabled={ocupado}>Voltar</button>
        <button type="button" className="btn-danger" onClick={() => void confirmar()} disabled={ocupado} id="cancelar-confirmar">{ocupado ? <Spinner className="text-white" /> : 'Cancelar o link'}</button>
      </>
    )}>
      <div className="flex flex-col gap-3 text-[14px]">
        <p>{prefixo(c.name)}<b>{c.name}</b> sai das listas, dos cartões e do painel{c.dids.total ? <>, com os <b>{c.dids.total} números</b> dele</> : null}. Ele não vai para a lixeira: fica guardado, com o dia e o motivo, e aparece ligando <b>Mostrar cancelados</b>. Dá para reativar depois.</p>
        <div className="grid grid-cols-1 sm:grid-cols-[170px_1fr] gap-3">
          <Campo label="Cancelado em"><input type="date" className="input" value={dia} onChange={(e) => { setDia(e.target.value); setErro(''); }} id="cancelar-dia" /></Campo>
          <Campo label="Motivo" dica="opcional"><input className="input" maxLength={500} value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="O cliente foi para a nuvem, portou os números…" id="cancelar-motivo" /></Campo>
        </div>
        {c.dids.assigned > 0 && <p className="text-[12.5px] text-muted">{c.dids.assigned === 1 ? '1 número ainda está com cliente' : `${c.dids.assigned} números ainda estão com cliente`}: eles saem da ficha do cliente e ficam aqui, na ficha do link, como estavam.</p>}
      </div>
    </Modal>
  );
}

export function CircuitoDetalhe() {
  const { id = '' } = useParams();
  const nav = useNavigate(); const qc = useQueryClient(); const toast = useToast(); const { can } = useAuth();
  const q = useQuery({ queryKey: ['circuit', id], queryFn: () => api.circuits.get(id) });
  const [editar, setEditar] = useState(false); const [faixa, setFaixa] = useState(false); const [excluir, setExcluir] = useState(false); const [busy, setBusy] = useState(false);
  const [cancelar, setCancelar] = useState(false); const [reativar, setReativar] = useState(false);
  if (q.isLoading) return <Carregando />;
  if (!q.data) return <Vazio titulo="Circuito não encontrado" acao={<Link className="btn-secondary" to="/circuitos">Voltar</Link>} />;
  const c = q.data;
  const doDelete = async () => { setBusy(true); try { await api.circuits.remove(c.id); toast.push('ok', 'Circuito foi para a lixeira'); await qc.invalidateQueries({ queryKey: ['circuits'] }); nav('/circuitos'); } catch (e) { toast.push('erro', mensagemErro(e)); } finally { setBusy(false); } };
  return (
    <Pagina voltar={<Voltar rota="/circuitos" texto="Todos os circuitos" />} titulo={<span className="flex items-center gap-2">{c.name}{c.thirdParty && <Chip tone="muted" title="Tronco do próprio cliente, com outra operadora">link de terceiro</Chip>}{c.cancelamento && <Chip tone="bad">cancelado</Chip>}</span>} sub={<span>{c.carrierName ?? 'sem operadora'} · N° <span className="font-mono">{c.code}</span>{c.keyNumber ? <> · número chave <span className="font-mono tnum">{didFormatado(c.keyNumber)}</span></> : null}{c.ownerName ? ` · titular: ${c.ownerName}` : ''}</span>} acoes={<>
      {/* 1.8: o que a base sabe sobre a operadora deste circuito (só aparece se houver) */}
      <ArtigosLigados tipo="operadora" alvo={c.carrierId} sobre={c.carrierName ? `sobre a ${c.carrierName}` : 'sobre a operadora'} />
      {/* o link cancelado não recebe números novos (2.4.6) */}
      {!c.cancelamento && <Can permission="dids.assign"><button className="btn-primary" onClick={() => setFaixa(true)}><Plus size={15} /> Criar faixa de DIDs</button></Can>}
      <Can permission="records.write"><button className="btn-secondary" onClick={() => setEditar(true)}><Pencil size={15} /> Editar</button></Can>
      <Can permission="records.write">
        {c.cancelamento
          ? <button className="btn-secondary" onClick={() => setReativar(true)} id="circuito-reativar"><Undo2 size={15} /> Reativar</button>
          : <button className="btn-secondary text-bad" onClick={() => setCancelar(true)} id="circuito-cancelar" title="O link foi cancelado: ele sai das listas, mas fica guardado"><Ban size={15} /> Cancelar o link</button>}
      </Can>
      <Can permission="records.delete"><button className="btn-ghost text-bad" onClick={() => setExcluir(true)} title="Mandar para a lixeira"><Trash2 size={15} /></button></Can>
    </>}>
      {c.cancelamento && (
        <div className="card border-bad/40 bg-bad-soft p-4 mb-5 flex gap-3" role="status" id="circuito-cancelamento">
          <Ban size={20} className="text-bad shrink-0 mt-0.5" aria-hidden />
          <div className="min-w-0 text-[14px]">
            <p className="font-semibold text-bad">Link cancelado desde {diaComAno(c.cancelamento.dia)}{c.cancelamento.motivo ? <span className="font-normal text-ink">: {c.cancelamento.motivo}</span> : null}</p>
            <p className="text-ink-2 text-[13px] mt-0.5">
              {c.cancelamento.por ? `Registrado por ${c.cancelamento.por}` : 'Registrado'}{c.cancelamento.em ? ` em ${fmtQuando.format(new Date(c.cancelamento.em))}` : ''}.
              {' '}Ele e os números dele ficam fora das listas, dos cartões e do painel — aparecem ligando <b>Mostrar cancelados</b>. Aqui fica a história: os números e as movimentações.
            </p>
          </div>
        </div>
      )}
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4 mb-5">
        <Kpi label="Canais" valor={c.channels} sub="chamadas simultâneas" tone={c.channels === 0 && c.dids.total > 0 ? 'bad' : 'neutral'} />
        <Kpi label="DIDs" valor={c.dids.total} tone="accent" />
        <Kpi label="Com cliente" valor={c.dids.assigned} />
        <Kpi label="Livres" valor={c.dids.free} tone={c.dids.free === 0 && c.dids.total > 0 ? 'signal' : 'ok'} />
      </div>
      {/* 1.6: o tronco virou uma faixa no alto e os DIDs ganharam a largura toda — a tabela da
          Numeração (seleção, cliente, uso, observação) não cabia em dois terços da tela */}
      <div className="flex flex-col gap-4">
        <div className="card p-4">
          <div className="eyebrow mb-2">Tronco</div>
          <dl className="grid gap-x-8 gap-y-1.5 text-sm sm:grid-cols-2 xl:grid-cols-3">
            <Dado rotulo="N° do circuito"><span className="font-mono tnum">{c.code}</span></Dado>
            <Dado rotulo="Número chave"><span className="font-mono tnum">{c.keyNumber ? didFormatado(c.keyNumber) : '—'}</span></Dado>
            <Dado rotulo="Titular">{c.ownerName ?? '—'}</Dado>
            <Dado rotulo="Autenticação">{c.authType === 'login' ? 'por login e senha' : 'por IP'}</Dado>
            {/* IP ou URL (1.6): endereço comprido quebra a linha em vez de empurrar o cartão */}
            <Dado rotulo="IP da operadora"><span className="font-mono break-all">{c.signalingIp ?? '—'}</span></Dado>
            {c.authType === 'login'
              ? <Dado rotulo="Login do tronco"><span className="font-mono">{c.authUsername ?? '—'}</span></Dado>
              : <Dado rotulo="IP do PBX"><span className="font-mono break-all">{c.authIp ?? '—'}</span></Dado>}
            <Dado rotulo="Valor mensal"><span className="tnum">{reais(c.monthlyValueCents)}</span></Dado>
          </dl>
          {c.authType === 'login' && <div className="mt-3 max-w-sm"><Campo label="Senha do tronco"><CampoSegredo secretId={c.authPassword.secretId} hasSecret={c.authPassword.hasSecret} podeRevelar={can('secrets.reveal')} onReveal={api.secrets.reveal} /></Campo></div>}
          {c.notes && <p className="text-sm mt-3 whitespace-pre-wrap text-ink-2">{c.notes}</p>}
        </div>
        {/* a tabela da Numeração, com este circuito fixo: tudo que se faz lá, se faz aqui */}
        <section className="min-w-0" aria-label="DIDs deste circuito">
          <h2 className="font-display font-semibold mb-2">DIDs deste circuito</h2>
          <Numeracao circuito={{ id: c.id, nome: c.name }} />
        </section>
        {/* as movimentações deste circuito (2.4.1): a mesma lista da aba Movimentações, com o circuito fixo */}
        <section className="min-w-0 mt-2" aria-label="Movimentações deste circuito">
          <h2 className="font-display font-semibold mb-2">Movimentações deste circuito</h2>
          <MovimentacoesDosCircuitos circuito={{ id: c.id, nome: c.name }} />
        </section>
      </div>
      <CircuitoForm open={editar} onClose={() => setEditar(false)} circuito={c} onSaved={() => setEditar(false)} />
      <FaixaForm open={faixa} onClose={() => setFaixa(false)} circuitId={c.id} onDone={() => { setFaixa(false); void qc.invalidateQueries({ queryKey: ['circuit', id] }); void qc.invalidateQueries({ queryKey: ['dids'] }); }} />
      {cancelar && <CancelarLink circuito={c} onClose={() => setCancelar(false)} onFeito={() => { setCancelar(false); void qc.invalidateQueries(); }} />}
      <Confirmar open={reativar} onClose={() => setReativar(false)} loading={busy} titulo="Reativar o link" botao="Reativar"
        onConfirm={async () => { setBusy(true); try { await api.circuits.reativar(c.id); toast.push('ok', `${oLink(c.name, true)} voltou às listas.`); setReativar(false); void qc.invalidateQueries(); } catch (e) { toast.push('erro', mensagemErro(e)); } finally { setBusy(false); } }}
        texto={<>{prefixo(c.name)}<b>{c.name}</b> volta às listas, aos cartões e ao painel, com os números dele. O cancelamento continua registrado nas movimentações.</>} />
      <Confirmar open={excluir} onClose={() => setExcluir(false)} onConfirm={doDelete} loading={busy} perigoso titulo="Mandar circuito para a lixeira" botao="Mandar para a lixeira" texto={c.dids.total > 0 ? <>Este circuito ainda tem <b>{c.dids.total} DIDs</b>. O sistema vai recusar: mova-os antes.</> : <>O circuito <b>{c.name}</b> sai das listas, sem apagar nada. Dá para restaurar na lixeira.</>} />
    </Pagina>
  );
}

/** Um par rótulo/valor do cartão do tronco. */
function Dado({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return <div className="grid grid-cols-[130px_minmax(0,1fr)] gap-x-2"><dt className="text-muted">{rotulo}</dt><dd>{children}</dd></div>;
}

export function FaixaForm({ open, onClose, circuitId, onDone }: { open: boolean; onClose: () => void; circuitId?: string; onDone: () => void }) {
  const [f, setF] = useState({ baseNumber: '', quantity: 10, clientId: '', circuitId: circuitId ?? '' });
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const toast = useToast();
  const clients = useQuery({ queryKey: ['client-options'], queryFn: () => api.clients.options(), enabled: open });
  const circuits = useQuery({ queryKey: ['circuit-options', false], queryFn: () => api.circuits.options(), enabled: open && !circuitId });
  const digits = f.baseNumber.replace(/\D/g, '');
  const preview = digits.length >= 10 && f.quantity > 0 ? `${didFormatado(digits)} … ${didFormatado((BigInt(digits) + BigInt(f.quantity - 1)).toString().padStart(digits.length, '0'))}` : null;
  const save = async () => {
    setBusy(true); setErr('');
    try {
      const body = { baseNumber: f.baseNumber, quantity: Number(f.quantity), clientId: f.clientId || null };
      const r = circuitId ? await api.circuits.createRange(circuitId, body) : await api.dids.createRange({ ...body, circuitId: f.circuitId });
      toast.push('ok', `${r.created} DIDs criados (${didFormatado(r.first)} a ${didFormatado(r.last)})`); onDone();
    } catch (e) { setErr(mensagemErro(e)); } finally { setBusy(false); }
  };
  return (
    <Modal open={open} onClose={onClose} titulo="Criar faixa de DIDs" rodape={<><button className="btn-secondary" onClick={onClose}>Cancelar</button><button className="btn-primary" disabled={busy || digits.length < 10 || f.quantity < 1 || !(circuitId || f.circuitId)} onClick={save}>{busy ? <Spinner className="text-white" /> : `Criar ${f.quantity || 0} DIDs`}</button></>}>
      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-3">
          <Campo label="Número inicial" dica="DDD + número"><input className="input font-mono" placeholder="(71) 3020-1200" value={f.baseNumber} onChange={(e) => setF({ ...f, baseNumber: e.target.value })} autoFocus /></Campo>
          <Campo label="Quantidade" dica="até 1.000 por vez"><input type="number" min={1} max={1000} className="input tnum" value={f.quantity} onChange={(e) => setF({ ...f, quantity: Number(e.target.value) })} /></Campo>
        </div>
        {/* todo DID nasce dentro de um circuito: sem escolher, o botão fica desligado */}
        {!circuitId && <Campo label="Circuito" dica="obrigatório: todo DID pertence a um circuito"><select className="input" value={f.circuitId} onChange={(e) => setF({ ...f, circuitId: e.target.value })}><option value="">Escolha o circuito…</option>{circuits.data?.map((c) => <option key={c.id} value={c.id}>{c.name} · {c.code}</option>)}</select></Campo>}
        <Campo label="Cliente (uso)" dica="deixe vazio para criar livres"><EscolherComBusca className="input w-full" valor={f.clientId} onChange={(v) => setF({ ...f, clientId: v })} vazio="livre" opcoes={(clients.data ?? []).map((c) => ({ id: c.id, nome: c.name }))} procurar="Procurar cliente…" rotulo="Cliente dos números" /></Campo>
        {preview && <div className="card p-3 text-sm bg-accent-soft border-transparent text-accent-ink font-mono">{preview}</div>}
        {err && <div className="text-bad text-sm">{err}</div>}
      </div>
    </Modal>
  );
}
