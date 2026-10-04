/**
 * Relatórios › Clientes: **Voltou com o mesmo problema** (cliente + assunto de novo em até 30
 * dias) e o **Raio-X do cliente** (os chamados de um cliente junto com o que ele tem no Gestor).
 *
 * O Raio-X depende de ligar o Cliente do card (um texto no LineChat) ao cadastro. A ligação é
 * automática quando o nome bate; a janela **Ligar clientes** mostra cada opção do LineChat e deixa
 * a administração corrigir — e escolher quais campos do card os relatórios usam.
 */
import { useEffect, useMemo, useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { ExternalLink, Link2, Repeat, Scale, ScanSearch, Search, Settings2, ShieldAlert } from 'lucide-react';
import { CAUSAS, NOMES_CAUSA, type Causa, type PapelCampo } from '@gestor/shared';
import { api } from '../../../api/index.js';
import type { AjustesRelatoriosTela, RelatoriosChamados } from '../../../api/types.js';
import { Colunas } from '../../../components/graficos.js';
import { Carregando, Chip, EscolherComBusca, mensagemErro, Modal, Toggle, useToast, Vazio } from '../../../components/ui/index.js';
import { useAuth } from '../../../lib/auth.js';
import { data, relativo } from '../../../lib/format.js';
import { BarrasComparadas, Bloco, CodigoDoCard, diaCurto, horas, ListaCurta, nf, Numero, Numeros, pct } from './pecas.js';

// ---------- Voltou com o mesmo problema ----------

export function Reincidencia({ r, juntar, aoJuntar }: { r: RelatoriosChamados; juntar: boolean; aoJuntar: (v: boolean) => void }) {
  const x = r.reincidencia;
  const [todas, setTodas] = useState(false);
  const linhas = todas ? x.linhas : x.linhas.slice(0, 15);
  const total = Math.max(1, (Date.parse(`${r.ate}T12:00:00Z`) - Date.parse(`${r.de}T12:00:00Z`)) / 86_400_000);
  const posicao = (iso: string) => Math.min(100, Math.max(0, ((Date.parse(iso) - Date.parse(`${r.de}T03:00:00Z`)) / 86_400_000 / (total + 1)) * 100));
  return (
    <Bloco
      id="reincidencia" titulo="Voltou com o mesmo problema" pergunta="Que cliente abriu o mesmo assunto de novo em até 30 dias?" icone={Repeat}
      acoes={x.podeJuntar && (
        <label className="flex items-center gap-2 text-[13px] text-ink-2 cursor-pointer" title="Junta os assuntos pelos grupos montados em Organizar (Ramal, LineChat…)">
          <Toggle checked={juntar} onChange={aoJuntar} /> juntar pelos grupos
        </label>
      )}
      rodape={x.cliente && x.assunto ? <>Mesmo {x.cliente.name.toLowerCase()} e mesmo {x.assunto.name.toLowerCase()}, com pelo menos dois chamados a até 30 dias um do outro, entre os abertos no período. {x.semCampo ? `${nf(x.semCampo)} chamados sem ${x.cliente.name} ou sem ${x.assunto.name} ficaram de fora.` : ''}</> : undefined}
    >
      {!x.cliente || !x.assunto ? (
        <Vazio titulo="Faltam os campos Cliente e Assunto" texto="O relatório cruza o Cliente e o Assunto do card. Escolha quais campos são esses em Ligar clientes › Campos." />
      ) : (
        <>
          <Numeros>
            <Numero valor={nf(x.pares)} rotulo={`${x.cliente.name.toLowerCase()} + ${x.assunto.name.toLowerCase()} se repetiram`} tom={x.pares ? 'signal' : undefined} />
            <Numero valor={nf(x.chamados)} rotulo={`chamados nessas repetições (${pct(x.chamados, x.total)}% dos com cliente e assunto)`} />
          </Numeros>
          {!x.linhas.length ? <div className="text-muted text-sm">Nenhuma repetição no período.</div> : (
            <div className="overflow-x-auto">
              <table className="table">
                <thead><tr><th>Cliente e assunto</th><th className="min-w-[180px]">Quando ({diaCurto(r.de)} a {diaCurto(r.ate)})</th><th className="!text-right">Vezes</th><th>Os chamados</th></tr></thead>
                <tbody>
                  {linhas.map((l) => (
                    <tr key={`${l.cliente}|${l.assunto}`}>
                      <td className="text-[13px] align-top"><div className="font-semibold">{l.cliente}</div><div className="text-muted">{l.assunto}</div></td>
                      <td className="align-middle">
                        <div className="relative h-4 min-w-[160px]" aria-label={`${l.n} chamados; o mais perto a ${l.menorIntervalo} dias do anterior`}>
                          <span className="absolute inset-x-0 top-1/2 h-px bg-line-strong" />
                          {l.chamados.map((c) => (
                            <span key={c.id} title={`${c.key ?? ''} · ${data(c.createdAt)}`} className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3 h-3 rounded-full bg-signal border-2 border-surface" style={{ left: `${posicao(c.createdAt)}%` }} />
                          ))}
                        </div>
                        <div className="text-[11.5px] text-muted mt-0.5">o mais perto: {l.menorIntervalo === 0 ? 'no mesmo dia' : `${l.menorIntervalo} ${l.menorIntervalo === 1 ? 'dia' : 'dias'} depois`}</div>
                      </td>
                      <td className="text-right tnum font-semibold align-top">{l.n}×</td>
                      <td className="align-top"><span className="flex flex-wrap gap-x-2 gap-y-0.5">{l.chamados.slice(-6).map((c) => <CodigoDoCard key={c.id} c={c} />)}{l.chamados.length > 6 && <span className="text-muted text-[12px]">+{l.chamados.length - 6}</span>}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {x.linhas.length > 15 && <button className="so-tela btn-ghost btn-sm mt-1" onClick={() => setTodas((v) => !v)}>{todas ? 'Mostrar só as 15 primeiras' : `Ver todas (${x.linhas.length})`}</button>}
            </div>
          )}
        </>
      )}
    </Bloco>
  );
}

// ---------- Raio-X do cliente ----------

/** O Raio-X na página de Relatórios: escolher o cliente (os que têm chamados) e ver. */
export function RaioXNaPagina({ clienteId, aoEscolher, filtros }: { clienteId: string; aoEscolher: (id: string) => void; filtros: Record<string, unknown> }) {
  const { can } = useAuth();
  const [ligar, setLigar] = useState(false);
  const ajustes = useQuery({ queryKey: ['chamados', 'relatorios-ajustes'], queryFn: () => api.chamados.ajustesRelatorios() });
  const a = ajustes.data;
  const semLigacao = a ? a.opcoes.filter((o) => !o.clienteId && o.como === 'nenhum' && !o.guardada && o.n > 0) : [];
  return (
    <Bloco
      id="raiox" titulo="Raio-X do cliente" pergunta="Como está o suporte de um cliente, num lugar só?" icone={ScanSearch}
      acoes={<>
        {a && (
          <EscolherComBusca
            id="raiox-cliente" rotulo="Escolher o cliente" placeholder="Escolha um cliente…" procurar="Procurar cliente…" className="input w-[280px] max-w-full"
            valor={clienteId} onChange={aoEscolher}
            opcoes={a.ligados.map((x) => ({ id: x.clienteId, nome: x.nome, dica: `${nf(x.n)} chamados` }))}
          />
        )}
        {can('admin.manage') && <button type="button" className="btn-secondary btn-sm" onClick={() => setLigar(true)}><Link2 size={14} /> Ligar clientes</button>}
      </>}
      rodape={a && semLigacao.length ? <>{nf(semLigacao.length)} {semLigacao.length === 1 ? 'opção' : 'opções'} do Cliente no LineChat ainda {semLigacao.length === 1 ? 'não está ligada' : 'não estão ligadas'} a ninguém do cadastro ({semLigacao.slice(0, 4).map((o) => o.opcao).join(', ')}{semLigacao.length > 4 ? '…' : ''}).{can('admin.manage') ? ' Ligue em "Ligar clientes".' : ' Quem administra liga em "Ligar clientes".'}</> : undefined}
    >
      {ajustes.isLoading ? <Carregando /> : !a ? null : !clienteId ? (
        a.ligados.length ? (
          <div>
            <div className="eyebrow mb-2">Os clientes com mais chamados · clique para ver o Raio-X</div>
            <div className="flex flex-wrap gap-1.5">
              {a.ligados.slice(0, 18).map((x) => (
                <button key={x.clienteId} type="button" onClick={() => aoEscolher(x.clienteId)} className="chip bg-surface-2 text-ink-2 hover:bg-accent-soft hover:text-accent-ink font-normal text-[13px] py-1">
                  {x.nome} <span className="tnum text-muted">{nf(x.n)}</span>
                </button>
              ))}
            </div>
          </div>
        ) : <Vazio titulo="Nenhum cliente ligado ainda" texto="O Cliente do card é ligado sozinho ao cadastro quando o nome bate. Nenhum bateu: ligue em Ligar clientes." />
      ) : <RaioX clienteId={clienteId} filtros={filtros} />}
      {ligar && a && <LigarClientes a={a} onClose={() => setLigar(false)} />}
    </Bloco>
  );
}

/**
 * O Raio-X de um cliente. Também é a aba **Chamados** da ficha do cliente (lá, sem o "o que ele
 * tem no Gestor", que a ficha já mostra).
 */
export function RaioX({ clienteId, filtros, naFicha = false }: { clienteId: string; filtros: Record<string, unknown>; naFicha?: boolean }) {
  const q = useQuery({
    queryKey: ['chamados', 'raiox', clienteId, JSON.stringify(filtros)],
    queryFn: () => api.chamados.raioX(clienteId, filtros),
    placeholderData: keepPreviousData,
  });
  if (q.isLoading) return <Carregando />;
  if (q.isError) return <div className="text-bad text-sm">{mensagemErro(q.error)}</div>;
  const r = q.data!;
  return (
    <div className={`flex flex-col gap-4 transition-opacity ${q.isFetching && q.isPlaceholderData ? 'opacity-60' : ''}`}>
      {!naFicha && (
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <Link to={`/clientes/${r.cliente.id}?aba=chamados`} className="font-display font-semibold text-[16px] link">{r.cliente.nome}</Link>
          <span className="text-[13px] text-ink-2">{[...r.gestor.produtos, `${nf(r.gestor.dids)} DIDs`, `${nf(r.gestor.aparelhos)} aparelhos`].join(' · ')}</span>
          <Link to={`/clientes/${r.cliente.id}`} className="text-[12.5px] link inline-flex items-center gap-1">abrir a ficha <ExternalLink size={11} /></Link>
        </div>
      )}
      <div className="text-[12.5px] text-muted">
        {r.opcoes.length
          ? <>No LineChat, {r.campoCliente ?? 'Cliente'}: {r.opcoes.map((o) => <Chip key={o} tone="muted" className="mr-1 font-normal">{o}</Chip>)} · de {diaCurto(r.de)} a {diaCurto(r.ate)}</>
          : <>Nenhuma opção do {r.campoCliente ?? 'Cliente'} no LineChat está ligada a este cliente. Quem administra liga em Chamados › Relatórios › Clientes › Ligar clientes.</>}
      </div>
      {!!r.opcoes.length && (
        <>
          <Numeros>
            <Numero valor={nf(r.abertos)} rotulo="chamados abertos no período" />
            <Numero valor={horas(r.mediana)} rotulo="mediana até fechar" />
            <Numero valor={nf(r.emAberto.length)} rotulo="em aberto agora" tom={r.emAberto.length ? 'signal' : undefined} />
            <Numero valor={nf(r.repetidos)} rotulo="voltaram com o mesmo assunto em até 30 dias" tom={r.repetidos ? 'signal' : undefined} />
            <Numero valor={r.ultimoEm ? relativo(r.ultimoEm) : '—'} rotulo={`o último chamado (${nf(r.total)} no total)`} />
          </Numeros>
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
            <div className="min-w-0">
              <div className="eyebrow mb-2">Chamados por mês (12 meses)</div>
              <Colunas pontos={r.porMes.map((p, i) => ({ ...p, destaque: i === r.porMes.length - 1 }))} altura={120} />
            </div>
            <div className="min-w-0">
              <div className="eyebrow mb-2">Os assuntos no período</div>
              <BarrasComparadas itens={r.assuntos} vazio="Nenhum chamado no período." />
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="min-w-0"><div className="eyebrow mb-2">Tipo de chamado</div><BarrasComparadas itens={r.tipos} vazio="—" /></div>
            <div className="min-w-0"><div className="eyebrow mb-2">Produto</div><BarrasComparadas itens={r.produtos} vazio="—" /></div>
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="min-w-0"><div className="eyebrow mb-1">Em aberto agora (o mais antigo primeiro)</div><ListaCurta itens={r.emAberto} vazio="Nada em aberto." /></div>
            <div className="min-w-0"><div className="eyebrow mb-1">Os últimos chamados</div><ListaCurta itens={r.recentes} /></div>
          </div>
        </>
      )}
    </div>
  );
}

// ---------- Ligar clientes (a janela) ----------

const PAPEIS: Array<{ id: PapelCampo; nome: string; dica: string }> = [
  { id: 'cliente', nome: 'Cliente', dica: 'quem abriu o chamado' },
  { id: 'assunto', nome: 'Assunto', dica: 'do que se trata' },
  { id: 'tipo', nome: 'Tipo de chamado', dica: 'configuração, correção, dúvida…' },
  { id: 'produto', nome: 'Produto', dica: 'LinePBX, LineChat…' },
];
/** A escolha de cada opção: automática (pelo nome), nenhum cliente, ou o id do cliente. */
type Escolha = 'auto' | 'nenhum' | string;

export function LigarClientes({ a, onClose, foco }: { a: AjustesRelatoriosTela; onClose: () => void; foco?: 'tipos' }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [campos, setCampos] = useState(() => ({ ...a.campos.escolhidos }));
  const [escolhas, setEscolhas] = useState<Record<string, Escolha>>(() => Object.fromEntries(a.opcoes.map((o) => [o.opcao, o.guardada ? (o.clienteId ?? 'nenhum') : 'auto'])));
  const [causas, setCausas] = useState<Record<string, Causa | 'auto'>>(() => Object.fromEntries(a.tipos.map((x) => [x.tipo, x.escolhida ? x.causa : 'auto'])));
  const [busca, setBusca] = useState('');
  const [soSem, setSoSem] = useState(false);
  // aberta pelo "De quem é a falha", a janela já mostra os tipos
  useEffect(() => { if (foco === 'tipos') setTimeout(() => document.getElementById('ajustes-tipos')?.scrollIntoView({ block: 'start' }), 60); }, [foco]);
  useEffect(() => { setEscolhas(Object.fromEntries(a.opcoes.map((o) => [o.opcao, o.guardada ? (o.clienteId ?? 'nenhum') : 'auto']))); }, [a]);
  const nomeDe = useMemo(() => new Map(a.clientes.map((c) => [c.id, c.nome])), [a.clientes]);
  const salvar = useMutation({
    mutationFn: () => api.chamados.salvarAjustesRelatorios({
      campos,
      clientes: Object.fromEntries(Object.entries(escolhas).filter(([, e]) => e !== 'auto').map(([op, e]) => [op, e === 'nenhum' ? null : e])),
      causas: Object.fromEntries(Object.entries(causas).filter((x): x is [string, Causa] => x[1] !== 'auto')),
    }),
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['chamados', 'relatorios'] }),
        qc.invalidateQueries({ queryKey: ['chamados', 'relatorios-ajustes'] }),
        qc.invalidateQueries({ queryKey: ['chamados', 'raiox'] }),
      ]);
      toast.push('ok', 'Ajustes salvos: valem para a equipe toda.');
      onClose();
    },
    onError: (e) => toast.push('erro', mensagemErro(e)),
  });
  const b = busca.trim().toLowerCase();
  const automatico = (o: (typeof a.opcoes)[number]) => (o.como === 'automatico' && !o.guardada ? o.clienteId : null);
  const visiveis = a.opcoes.filter((o) => (!b || o.opcao.toLowerCase().includes(b)) && (!soSem || (escolhas[o.opcao] === 'auto' && !automatico(o))));
  const semLigacao = a.opcoes.filter((o) => escolhas[o.opcao] === 'auto' && !automatico(o)).length;
  const opcoesCliente = [
    { id: 'nenhum', nome: '— não é cliente do cadastro' },
    ...a.clientes.map((c) => ({ id: c.id, nome: c.nome, dica: c.razao && c.razao !== c.nome ? c.razao : undefined })),
  ];
  return (
    <Modal
      open onClose={onClose} largura="max-w-4xl" titulo={<span className="flex items-center gap-2"><Settings2 size={17} /> Ajustes dos relatórios: clientes, campos e tipos</span>}
      rodape={<>
        <span className="text-[12px] text-muted mr-auto">{a.atualizadoEm ? `Última mudança: ${a.atualizadoPor ?? 'alguém da administração'}, ${data(a.atualizadoEm, true)}.` : 'Ainda do jeito de fábrica.'} Vale para a equipe toda e fica na auditoria.</span>
        <button className="btn-secondary" onClick={onClose}>Cancelar</button>
        <button className="btn-primary" disabled={salvar.isPending} onClick={() => salvar.mutate()}>{salvar.isPending ? 'Salvando…' : 'Salvar para todos'}</button>
      </>}
    >
      <div className="flex flex-col gap-5">
        <section>
          <h3 className="font-semibold text-[14px] mb-1">Campos do card</h3>
          <p className="text-[12.5px] text-muted mb-2">Quais campos do LineChat os relatórios usam. "Automático" acha pelo nome.</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {PAPEIS.map((p) => {
              const v = campos[p.id];
              const usado = a.campos.usados[p.id];
              return (
                <label key={p.id} className="flex flex-col gap-1 text-[13px]">
                  <span className="font-semibold text-ink-2">{p.nome} <span className="font-normal text-muted">· {p.dica}</span></span>
                  <select
                    className="input py-1.5" value={v === undefined ? '' : v === null ? '__nenhum__' : v}
                    onChange={(e) => setCampos((c) => ({ ...c, [p.id]: e.target.value === '' ? undefined : e.target.value === '__nenhum__' ? null : e.target.value }))}
                  >
                    <option value="">Automático{usado && v === undefined ? ` (${usado.name})` : ''}</option>
                    {a.camposDisponiveis.map((c) => <option key={c.key} value={c.key}>{c.name}{c.multiplo ? ' (múltipla escolha)' : ''}</option>)}
                    <option value="__nenhum__">Nenhum</option>
                  </select>
                </label>
              );
            })}
          </div>
        </section>
        <section id="ajustes-tipos">
          <h3 className="font-semibold text-[14px] mb-1">De quem é a falha: o grupo de cada tipo de chamado</h3>
          <p className="text-[12.5px] text-muted mb-2">"Auto" escolhe pelo nome do tipo (Ingline, sistêmica e correção = falha nossa; falha e dificuldade = do cliente; operadora = da operadora; o resto = pedido ou dúvida).</p>
          {!a.tipos.length ? <div className="text-muted text-sm">O painel não tem um campo de tipo de chamado (escolha em Campos do card).</div> : (
            <div className="grid gap-1.5 sm:grid-cols-2">
              {a.tipos.map((x) => (
                <label key={x.tipo} className="flex items-center gap-2 text-[13px] min-w-0">
                  <span className="flex-1 min-w-0 truncate" title={`${x.tipo}: ${x.n} chamados`}>{x.tipo} <span className="text-muted tnum">({nf(x.n)})</span></span>
                  <select
                    className="input py-1 w-[215px] shrink-0" value={causas[x.tipo] ?? 'auto'} aria-label={`Grupo de ${x.tipo}`}
                    onChange={(e) => setCausas((c) => ({ ...c, [x.tipo]: e.target.value as Causa | 'auto' }))}
                  >
                    <option value="auto">Auto · {NOMES_CAUSA[x.sugerida]}</option>
                    {CAUSAS.map((k) => <option key={k} value={k}>{NOMES_CAUSA[k][0]!.toUpperCase() + NOMES_CAUSA[k].slice(1)}</option>)}
                  </select>
                </label>
              ))}
            </div>
          )}
        </section>
        <section>
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <h3 className="font-semibold text-[14px] mr-auto">Cliente do card → cadastro do Gestor</h3>
            <label className="relative">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
              <input className="input py-1.5 pl-8 w-[200px]" placeholder="Procurar opção…" value={busca} onChange={(e) => setBusca(e.target.value)} aria-label="Procurar opção do LineChat" />
            </label>
            <label className="flex items-center gap-2 text-[13px] text-ink-2 cursor-pointer"><Toggle checked={soSem} onChange={setSoSem} /> só sem ligação ({nf(semLigacao)})</label>
          </div>
          <p className="text-[12.5px] text-muted mb-2">No LineChat o Cliente é um texto. Quando ele bate com o nome fantasia ou a razão social de um cliente (sem acento e sem "Ltda"), a ligação é automática. Aqui você corrige, completa ou marca o que não é cliente (como "Interno").</p>
          <div className="overflow-x-auto max-h-[46vh] overflow-y-auto border border-line rounded-lg">
            <table className="table">
              <thead className="sticky top-0 bg-surface z-[1]"><tr><th>No LineChat</th><th className="!text-right">Chamados</th><th>Cliente no Gestor</th></tr></thead>
              <tbody>
                {visiveis.map((o) => {
                  const e = escolhas[o.opcao] ?? 'auto';
                  const auto = automatico(o);
                  return (
                    <tr key={o.opcao}>
                      <td className="text-[13px]">{o.opcao}</td>
                      <td className="text-right tnum text-[13px]">{nf(o.n)}</td>
                      <td>
                        <span className="flex flex-wrap items-center gap-2">
                          <EscolherComBusca
                            rotulo={`Cliente do Gestor para ${o.opcao}`} className="input py-1 w-[300px] max-w-full" largura="w-[340px]" procurar="Procurar cliente…"
                            valor={e === 'auto' ? '' : e} vazio={auto ? `Automático: ${nomeDe.get(auto) ?? '?'}` : 'Automático (nenhum bateu)'}
                            opcoes={opcoesCliente} onChange={(id) => setEscolhas((x) => ({ ...x, [o.opcao]: id || 'auto' }))}
                          />
                          {e === 'auto' ? (auto ? <Chip tone="ok">automático</Chip> : <Chip tone="signal">sem ligação</Chip>) : e === 'nenhum' ? <Chip tone="muted">não é cliente</Chip> : <Chip tone="accent">escolhido</Chip>}
                        </span>
                      </td>
                    </tr>
                  );
                })}
                {!visiveis.length && <tr><td colSpan={3} className="text-muted text-sm">Nada aqui.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </Modal>
  );
}

// ---------- Chamados pelo tamanho do cliente ----------

export function TamanhoDoCliente({ r, abrir, aoRaioX }: { r: RelatoriosChamados; abrir: (peca: string) => void; aoRaioX: (clienteId: string) => void }) {
  const x = r.tamanho;
  const [por, setPor] = useState<'dids' | 'aparelhos'>('dids');
  const [todos, setTodos] = useState(false);
  const chave = por === 'dids' ? 'porDids' : 'porAparelhos';
  const linhas = [...x.linhas].sort((a, b) => (b[chave] ?? -1) - (a[chave] ?? -1) || b.n - a.n || a.nome.localeCompare(b.nome, 'pt-BR'));
  const mostradas = todos ? linhas : linhas.slice(0, 15);
  const max = Math.max(0.1, ...linhas.map((l) => l[chave] ?? 0));
  const seg = (ativo: boolean) => `px-2.5 py-1 rounded-md text-[12.5px] font-semibold ${ativo ? 'bg-accent text-white' : 'text-ink-2 hover:text-ink'}`;
  const decimal = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 1 });
  return (
    <Bloco
      id="tamanho" titulo="Chamados pelo tamanho do cliente" pergunta="Quem abre muito chamado para o tamanho que tem?" icone={Scale}
      acoes={x.disponivel && (
        <div className="flex items-center gap-2 text-[13px] text-ink-2">
          medir por
          <div className="flex rounded-lg bg-surface-2 border border-line p-0.5" role="group" aria-label="Medir o tamanho por">
            <button type="button" className={seg(por === 'dids')} aria-pressed={por === 'dids'} onClick={() => setPor('dids')}>DIDs</button>
            <button type="button" className={seg(por === 'aparelhos')} aria-pressed={por === 'aparelhos'} onClick={() => setPor('aparelhos')}>aparelhos</button>
          </div>
        </div>
      )}
      rodape={<>Chamados abertos no período divididos pelo tamanho do cliente no Gestor: os DIDs e os aparelhos com ele (os vendidos não contam). Um cliente pequeno com muito chamado sobe para o topo; quem não tem nenhum DID (ou aparelho) vai para o fim.{x.semLigacao ? ` ${nf(x.semLigacao)} chamados com um Cliente que não está ligado ao cadastro ficaram de fora (veja em Ligar clientes).` : ''}</>}
    >
      {!x.disponivel ? <Vazio titulo="Sem o cadastro de clientes" texto="Este relatório cruza o Cliente do card com o cadastro do Gestor." /> : !linhas.length ? <div className="text-muted text-sm">Nenhum chamado de cliente ligado ao cadastro no período.</div> : (
        <div className="overflow-x-auto">
          <table className="table">
            <thead><tr><th>Cliente</th><th className="!text-right">Chamados</th><th className="!text-right">DIDs</th><th className="!text-right">Aparelhos</th><th className="min-w-[200px]">Chamados por 10 {por === 'dids' ? 'DIDs' : 'aparelhos'}</th></tr></thead>
            <tbody>
              {mostradas.map((l) => {
                const v = l[chave];
                return (
                  <tr key={l.clienteId}>
                    <td className="text-[13px]"><button type="button" className="link font-semibold text-left" onClick={() => aoRaioX(l.clienteId)} title="Ver o Raio-X deste cliente">{l.nome}</button></td>
                    <td className="text-right text-[13px] tnum"><button type="button" className="hover:underline" onClick={() => abrir(`tamanho:${l.clienteId}`)} title="Ver os chamados">{nf(l.n)}</button></td>
                    <td className="text-right text-[13px] tnum">{nf(l.dids)}</td>
                    <td className="text-right text-[13px] tnum">{nf(l.aparelhos)}</td>
                    <td className="text-[13px]">
                      {v == null ? <span className="text-muted">sem {por === 'dids' ? 'DIDs' : 'aparelhos'}</span> : (
                        <span className="flex items-center gap-2">
                          <span className="flex-1 h-2 rounded-full bg-surface-2 overflow-hidden min-w-[80px]"><span className="block h-full rounded-full bg-accent" style={{ width: `${Math.max(3, (v / max) * 100)}%` }} /></span>
                          <span className="tnum w-12 text-right">{decimal(v)}</span>
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {linhas.length > 15 && <button className="so-tela btn-ghost btn-sm mt-1" onClick={() => setTodos((v) => !v)}>{todos ? 'Mostrar só os 15 primeiros' : `Ver todos (${linhas.length})`}</button>}
        </div>
      )}
    </Bloco>
  );
}

// ---------- De quem é a falha? ----------

const COR_CAUSA: Record<Causa | 'semtipo', string> = { nossa: 'var(--pz-2)', cliente: 'var(--pz-4)', operadora: 'var(--pz-3)', pedido: 'var(--pz-1)', semtipo: 'var(--pz-vazio)' };

export function DeQuemEAFalha({ r, abrir }: { r: RelatoriosChamados; abrir: (peca: string) => void }) {
  const x = r.falha;
  const { can } = useAuth();
  const [ajustar, setAjustar] = useState(false);
  const ajustes = useQuery({ queryKey: ['chamados', 'relatorios-ajustes'], queryFn: () => api.chamados.ajustesRelatorios(), enabled: ajustar });
  const partes = (c: { porCausa: Record<Causa, number>; semTipo: number }) => [...CAUSAS.map((k) => ({ id: k as Causa | 'semtipo', n: c.porCausa[k] })), { id: 'semtipo' as const, n: c.semTipo }];
  const nome = (k: Causa | 'semtipo') => (k === 'semtipo' ? 'sem tipo' : NOMES_CAUSA[k]);
  const meses = x.meses.filter((m) => m.total > 0);
  const primeiro = meses[0]; const ultimo = meses[meses.length - 1];
  // % do total do mês (ou do período), contando os sem tipo: as partes somam 100, como na barra
  const fatia = (m: { porCausa: Record<Causa, number>; total: number }, k: Causa) => (m.total ? Math.round((m.porCausa[k] / m.total) * 100) : 0);
  return (
    <Bloco
      id="falha" titulo="De quem é a falha?" pergunta="Quanto do suporte é falha nossa, do cliente, da operadora ou pedido?" icone={ShieldAlert}
      acoes={can('admin.manage') && x.tipo && <button type="button" className="btn-secondary btn-sm" onClick={() => setAjustar(true)}><Settings2 size={14} /> Escolher os grupos</button>}
      rodape={x.tipo ? <>Pelo {x.tipo.name.toLowerCase()} de cada card, pelo mês em que foi aberto; os % são do total, contando os sem tipo. O grupo de cada tipo vem do nome dele — Ingline, sistêmica e correção são falha nossa; falha e dificuldade, do cliente; operadora, da operadora; o resto, pedido ou dúvida — e quem administra troca em "Escolher os grupos".</> : undefined}
    >
      {!x.tipo ? <Vazio titulo="Falta o campo Tipo de chamado" texto="Escolha qual campo do card é o Tipo em Clientes › Ligar clientes › Campos." /> : (
        <>
          <Numeros>
            {CAUSAS.map((k) => (
              <Numero key={k} valor={`${fatia(x.periodo, k)}%`} rotulo={`${nome(k)} no período (${nf(x.periodo.porCausa[k])})`} aoClicar={x.periodo.porCausa[k] ? () => abrir(`falha:periodo:${k}`) : undefined} />
            ))}
            {x.periodo.semTipo > 0 && <Numero valor={`${Math.round((x.periodo.semTipo / x.periodo.total) * 100)}%`} rotulo={`sem tipo preenchido (${nf(x.periodo.semTipo)})`} aoClicar={() => abrir('falha:periodo:semtipo')} />}
          </Numeros>
          <div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 mb-2 text-[12px] text-ink-2">
              {[...CAUSAS, 'semtipo' as const].map((k) => <span key={k} className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: COR_CAUSA[k] }} /> {nome(k)}</span>)}
              <span className="text-muted">mês a mês · clique numa parte para ver os chamados</span>
            </div>
            <div className="flex flex-col gap-2">
              {x.meses.map((m) => (
                <div key={m.id} className="grid grid-cols-[48px_minmax(0,1fr)_44px] items-center gap-2">
                  <span className="text-[12.5px] text-ink-2">{m.rotulo}</span>
                  <div className="flex h-6 rounded-md overflow-hidden bg-surface-2">
                    {partes(m).filter((p) => p.n > 0).map((p) => {
                      const w = (p.n / m.total) * 100;
                      return (
                        <button
                          key={p.id} type="button" onClick={() => abrir(`falha:${m.id}:${p.id}`)}
                          title={`${m.rotulo}: ${nome(p.id)} ${nf(p.n)} (${Math.round(w)}% do mês) — clique para ver`}
                          className="h-full text-[11px] font-semibold text-white overflow-hidden whitespace-nowrap hover:brightness-110 [&+&]:border-l-2 [&+&]:border-surface"
                          style={{ width: `${w}%`, background: COR_CAUSA[p.id], color: p.id === 'semtipo' ? 'var(--ink-2)' : undefined }}
                        >
                          {w >= 9 ? `${Math.round(w)}%` : ''}
                        </button>
                      );
                    })}
                  </div>
                  <span className="text-[12px] text-muted tnum text-right">{nf(m.total)}</span>
                </div>
              ))}
            </div>
            {primeiro && ultimo && primeiro.id !== ultimo.id && (
              <p className="text-[13px] text-ink-2 mt-2.5">
                Falha nossa foi de <b>{fatia(primeiro, 'nossa')}%</b> em {primeiro.rotulo} para <b>{fatia(ultimo, 'nossa')}%</b> em {ultimo.rotulo}{ultimo.id === r.hoje.slice(0, 7) ? ' (mês em andamento)' : ''}.
              </p>
            )}
          </div>
        </>
      )}
      {ajustar && ajustes.data && <LigarClientes a={ajustes.data} foco="tipos" onClose={() => setAjustar(false)} />}
    </Bloco>
  );
}
