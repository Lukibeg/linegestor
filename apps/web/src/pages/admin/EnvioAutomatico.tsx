/**
 * Administração › Envio automático (Patch 1.7, decisão 0038): todo dia, no horário escolhido, o PDF
 * com os gráficos e relatórios dos Chamados marcados vai pelo WhatsApp (API da FlwChat) para os
 * números da lista. Aqui ficam o horário, os dias, os números, o número que envia, o endereço da API
 * e o token (que vai para o cofre e nunca volta para a tela). O que vai no PDF é marcado nos
 * próprios gráficos e relatórios, no aviãozinho "Envio diário" do canto de cada um.
 */
import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { CheckCircle2, Download, Eye, Plus, Send, Trash2, TriangleAlert, X } from 'lucide-react';
import { NOMES_DIAS_ENVIO, numeroLegivel, TENTATIVAS_ENVIO } from '@gestor/shared';
import { api, IS_DEMO } from '../../api/index.js';
import type { EnvioAjustesTela, RegistroEnvio } from '../../api/types.js';
import { Campo, Carregando, Chip, Confirmar, Spinner, Toggle, mensagemErro, useToast } from '../../components/ui/index.js';
import { data } from '../../lib/format.js';

type Linha = { id: string; nome: string; numero: string; ativo: boolean };
type Form = { ativo: boolean; url: string; remetente: string; horario: string; dias: number[]; destinatarios: Linha[] };

const doServidor = (a: EnvioAjustesTela): Form => ({
  ativo: a.ativo, url: a.url, remetente: a.remetente ? numeroLegivel(a.remetente) : '', horario: a.horario, dias: a.dias,
  destinatarios: a.destinatarios.map((d) => ({ id: d.id, nome: d.nome, numero: numeroLegivel(d.numero), ativo: d.ativo })),
});
const novoId = () => Math.random().toString(36).slice(2, 10);

export function EnvioAutomatico() {
  // a cada minuto, para o "hoje" e os últimos envios aparecerem sozinhos quando o relógio mandar (1.7.1)
  const q = useQuery({ queryKey: ['envio', 'ajustes'], queryFn: () => api.envio.ajustes(), refetchInterval: 60_000 });
  if (q.isLoading) return <Carregando />;
  if (q.isError) return <div className="text-bad text-sm">{mensagemErro(q.error)}</div>;
  return <Tela inicial={q.data!} />;
}

function Tela({ inicial }: { inicial: EnvioAjustesTela }) {
  const qc = useQueryClient(); const toast = useToast(); const nav = useNavigate();
  const [f, setF] = useState<Form>(() => doServidor(inicial));
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<{ ok: boolean; mensagem: string } | null>(null);
  const [mandando, setMandando] = useState<string | null>(null);
  const [confirmar, setConfirmar] = useState(false);
  // volta ao que está salvo só quando o salvo muda (a atualização de cada minuto não apaga o que a pessoa está digitando)
  const salvoAgora = JSON.stringify(doServidor(inicial));
  useEffect(() => { setF(JSON.parse(salvoAgora) as Form); }, [salvoAgora]);
  const mudou = useMemo(() => JSON.stringify(f) !== JSON.stringify(doServidor(inicial)) || !!token, [f, inicial, token]);
  const ativos = inicial.destinatarios.filter((d) => d.ativo).length;
  const nMarcados = inicial.marcados.graficos.length + inicial.marcados.relatorios.length;

  const salvar = async () => {
    setBusy(true); setRes(null);
    try {
      const a = await api.envio.salvarAjustes({ ...f, token: token || undefined });
      qc.setQueryData(['envio', 'ajustes'], a);
      setToken('');
      toast.push('ok', a.ativo ? `Envio automático salvo: próximo ${a.proximo ?? '—'}.` : 'Ajustes salvos (o envio está desligado).');
    } catch (e) { setRes({ ok: false, mensagem: mensagemErro(e) }); } finally { setBusy(false); }
  };
  const mandar = async (tipo: 'teste' | 'pdf', destinatarioId?: string) => {
    setMandando(`${tipo}:${destinatarioId ?? ''}`); setRes(null);
    try {
      const r = tipo === 'teste' ? await api.envio.testar(destinatarioId) : await api.envio.enviar(destinatarioId);
      setRes({ ok: r.ok, mensagem: r.mensagem });
      await qc.invalidateQueries({ queryKey: ['envio', 'ajustes'] });
    } catch (e) { setRes({ ok: false, mensagem: mensagemErro(e) }); } finally { setMandando(null); setConfirmar(false); }
  };
  const tirar = async (tipo: 'relatorio' | 'grafico', id: string) => {
    try {
      const m = await api.envio.marcados();
      await api.envio.salvarMarcados(tipo === 'relatorio' ? { relatorios: m.relatorios.filter((x) => x !== id), graficos: m.graficos } : { relatorios: m.relatorios, graficos: m.graficos.filter((x) => x !== id) });
      await qc.invalidateQueries({ queryKey: ['envio'] });
    } catch (e) { toast.push('erro', mensagemErro(e)); }
  };
  const mudarLinha = (id: string, m: Partial<Linha>) => setF((x) => ({ ...x, destinatarios: x.destinatarios.map((d) => (d.id === id ? { ...d, ...m } : d)) }));
  const alternarDia = (d: number) => setF((x) => ({ ...x, dias: x.dias.includes(d) ? x.dias.filter((y) => y !== d) : [...x.dias, d].sort() }));

  return (
    <div className="flex flex-col gap-4 max-w-4xl">
      <section className="card p-5">
        <div className="flex flex-wrap items-center gap-3 mb-1">
          <span className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${inicial.ativo ? 'bg-ok-soft text-ok' : 'bg-surface-2 text-muted'}`}><Send size={18} /></span>
          <h2 className="font-display font-semibold text-lg">Envio automático pelo WhatsApp</h2>
          {inicial.ativo ? <Chip tone="ok">ligado</Chip> : <Chip tone="muted">desligado</Chip>}
          {inicial.ativo && inicial.proximo && <span className="text-[13px] text-ink-2">próximo: <b>{inicial.proximo}</b></span>}
        </div>
        {inicial.ativo && inicial.hoje && <EnvioDeHoje h={inicial.hoje} />}
        {IS_DEMO && (
          <div className="mt-3 rounded-lg border border-signal bg-signal-soft p-3 text-[13.5px] text-ink flex items-start gap-2">
            <TriangleAlert size={16} className="text-signal shrink-0 mt-0.5" />
            <span>
              <b>Esta é a prévia: nenhuma mensagem sai daqui.</b> Testar e Mandar agora só simulam (aparecem nos últimos envios, mas nada vai
              para o WhatsApp) e não há servidor para montar o PDF — use "Ver como fica". O relógio da prévia só confere o horário
              com esta tela aberta. O WhatsApp só recebe no sistema de verdade, com o token da FlwChat salvo nesta tela.
            </span>
          </div>
        )}
        <div className="text-[13.5px] text-ink-2 leading-relaxed border-l-2 border-line pl-3 my-3 flex flex-col gap-2">
          <p>
            Todo dia, no horário escolhido, o Gestor monta um <b>PDF com os gráficos e os relatórios dos Chamados</b> marcados com o aviãozinho
            <Send size={13} className="inline mx-1 -mt-0.5 text-accent fill-current" aria-label="Envio diário" />
            (no canto de cada um; fica azul quando marcado) e manda pelo WhatsApp, pela API da FlwChat, para os números da lista — com uma mensagem com os números do dia.
          </p>
          <p>
            Os números são <b>do dia de hoje</b>, até a hora do envio. Se o servidor estiver fora do ar na hora, o envio sai quando ele voltar (até 3 horas depois); se falhar, tenta de novo 2 vezes, a cada 15 minutos.
            Trocou o horário? Vale <b>já para hoje</b>. E salvar depois de uma falha libera 3 tentativas novas.
          </p>
        </div>

        {/* ---------- quando ---------- */}
        <div className="flex flex-col gap-3">
          <label className="flex items-center gap-2.5 text-sm cursor-pointer">
            <Toggle checked={f.ativo} onChange={(v) => setF({ ...f, ativo: v })} /> Mandar todo dia, sozinho
          </label>
          <div className="flex flex-wrap items-end gap-4">
            <div>
              <span className="label">Horário (de Brasília)</span>
              <div className="flex items-center gap-1">
                <select className="input w-[76px]" id="envio-hora" aria-label="Hora" value={f.horario.slice(0, 2)} onChange={(e) => setF({ ...f, horario: `${e.target.value}:${f.horario.slice(3, 5)}` })}>
                  {Array.from({ length: 24 }, (_, h) => String(h).padStart(2, '0')).map((h) => <option key={h} value={h}>{h}</option>)}
                </select>
                <span className="font-semibold">:</span>
                <select className="input w-[76px]" id="envio-minuto" aria-label="Minuto" value={f.horario.slice(3, 5)} onChange={(e) => setF({ ...f, horario: `${f.horario.slice(0, 2)}:${e.target.value}` })}>
                  {[...new Set([...Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, '0')), f.horario.slice(3, 5)])].sort().map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
            </div>
            <div>
              <span className="label">Dias</span>
              <div className="flex flex-wrap gap-1" role="group" aria-label="Dias do envio">
                {NOMES_DIAS_ENVIO.map((n, d) => (
                  <button key={n} type="button" aria-pressed={f.dias.includes(d)} onClick={() => alternarDia(d)}
                    className={`w-11 py-1.5 rounded-lg border text-[13px] font-semibold ${f.dias.includes(d) ? 'border-accent bg-accent-soft text-accent-ink' : 'border-line bg-surface text-muted hover:text-ink'}`}>{n}</button>
                ))}
                <button type="button" className="btn-ghost btn-sm" onClick={() => setF({ ...f, dias: f.dias.length === 7 ? [0, 1, 2, 3, 4] : [0, 1, 2, 3, 4, 5, 6] })}>{f.dias.length === 7 ? 'só dias úteis' : 'todos os dias'}</button>
              </div>
            </div>
          </div>
        </div>

        {/* ---------- para quem ---------- */}
        <h3 className="font-display font-semibold mt-5 mb-2">Para quem</h3>
        {!f.destinatarios.length && <p className="text-[13px] text-muted mb-2">Nenhum número ainda. Adicione quem recebe o PDF todo dia.</p>}
        <div className="flex flex-col gap-2">
          {f.destinatarios.map((d) => {
            const salvo = inicial.destinatarios.find((x) => x.id === d.id);
            return (
              <div key={d.id} className={`grid gap-2 grid-cols-1 sm:grid-cols-[minmax(0,1fr)_200px_auto] items-center rounded-lg border border-line p-2 ${d.ativo ? '' : 'bg-surface-2'}`}>
                <input className="input" aria-label="Nome" placeholder="Nome (ex.: Luan)" value={d.nome} onChange={(e) => mudarLinha(d.id, { nome: e.target.value })} />
                <input className="input font-mono text-[13px]" aria-label="Número de WhatsApp" placeholder="(71) 99999-0000" inputMode="tel" value={d.numero} onChange={(e) => mudarLinha(d.id, { numero: e.target.value })} />
                <div className="flex items-center gap-1.5 justify-end">
                  <label className="flex items-center gap-1.5 text-[12.5px] text-ink-2 cursor-pointer" title="Pausado: fica na lista, mas não recebe">
                    <Toggle checked={d.ativo} onChange={(v) => mudarLinha(d.id, { ativo: v })} /> {d.ativo ? 'recebe' : 'pausado'}
                  </label>
                  <button type="button" className="btn-ghost btn-sm" disabled={!salvo || mudou || !!mandando} onClick={() => void mandar('teste', d.id)}
                    title={!salvo || mudou ? 'Salve antes de testar' : 'Manda uma mensagem de teste (só texto) para este número'}>
                    {mandando === `teste:${d.id}` ? <Spinner /> : 'Testar'}
                  </button>
                  <button type="button" className="btn-ghost btn-sm" aria-label={`Tirar ${d.nome || 'este número'} da lista`} title="Tirar da lista (vale ao salvar)"
                    onClick={() => setF({ ...f, destinatarios: f.destinatarios.filter((x) => x.id !== d.id) })}><Trash2 size={15} /></button>
                </div>
              </div>
            );
          })}
        </div>
        <button type="button" className="btn-secondary btn-sm mt-2" onClick={() => setF({ ...f, destinatarios: [...f.destinatarios, { id: novoId(), nome: '', numero: '', ativo: true }] })}>
          <Plus size={14} /> Adicionar número
        </button>

        {/* ---------- de onde sai ---------- */}
        <h3 className="font-display font-semibold mt-5 mb-2">De onde sai (FlwChat)</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo label="Número que envia" dica="o número conectado na FlwChat (DDD + número)">
            <input className="input font-mono text-[13px]" id="envio-remetente" placeholder="(71) 3512-0000" inputMode="tel" value={f.remetente} onChange={(e) => setF({ ...f, remetente: e.target.value })} />
          </Campo>
          <Campo label="Token da API da FlwChat" dica={inicial.temToken ? 'já existe um guardado; preencha só para trocar' : 'fica cifrado no cofre e nunca aparece de volta'}>
            <input className="input font-mono text-[13px]" id="envio-token" type="password" autoComplete="off" placeholder={inicial.temToken ? '••••••••  (guardado)' : ''} value={token} onChange={(e) => setToken(e.target.value)} />
          </Campo>
          <Campo label="Endereço de envio da API" dica="o endereço de enviar mensagem da documentação da FlwChat" className="sm:col-span-2">
            <input className="input font-mono text-[13px]" id="envio-url" value={f.url} onChange={(e) => setF({ ...f, url: e.target.value })} />
          </Campo>
        </div>
        <p className="text-[12px] text-muted mt-2">
          A FlwChat baixa o PDF de <span className="font-mono">{inicial.enderecoPublico}</span>, num link difícil de adivinhar que vence em {inicial.linkValeDias} dias.
          O arquivo continua guardado aqui no histórico.
        </p>

        <div className="flex flex-wrap gap-2 mt-4 items-center">
          <button className="btn-primary" disabled={busy || !mudou} onClick={salvar}>{busy ? <Spinner className="text-white" /> : 'Salvar'}</button>
          <button className="btn-secondary" disabled={mudou || !!mandando || !ativos} onClick={() => setConfirmar(true)} title={mudou ? 'Salve antes' : !ativos ? 'Nenhum número ativo' : 'Monta o PDF de agora e manda para a lista'}>
            {mandando?.startsWith('pdf') ? <Spinner /> : <><Send size={14} /> Mandar agora</>}
          </button>
          <button className="btn-ghost" onClick={() => nav('/envio-diario')}><Eye size={15} /> Ver como fica</button>
          {api.envio.pdfUrl() && <a className="btn-ghost" href={api.envio.pdfUrl()!}><Download size={15} /> Baixar o PDF de agora</a>}
          {mudou && <span className="text-[12.5px] text-signal">há mudanças sem salvar</span>}
        </div>
        {res && (
          <div className={`text-[13px] mt-3 flex items-start gap-2 rounded-lg p-2.5 ${res.ok ? 'bg-ok-soft text-ok' : 'bg-bad-soft text-bad'}`}>
            {res.ok ? <CheckCircle2 size={15} className="mt-0.5 shrink-0" /> : <TriangleAlert size={15} className="mt-0.5 shrink-0" />}
            <span>{res.mensagem}</span>
          </div>
        )}
        {inicial.configuradoEm && <p className="text-[12px] text-muted mt-3">Último ajuste: {inicial.configuradoPor ?? 'alguém da administração'}, {data(inicial.configuradoEm, true)}.</p>}
      </section>

      {/* ---------- o que vai no PDF ---------- */}
      <section className="card p-5">
        <h2 className="font-display font-semibold text-lg">O que vai no PDF</h2>
        <p className="text-[13.5px] text-ink-2 mt-1">
          Sempre: os números de cima da aba Hoje. E o que estiver marcado com o aviãozinho <Send size={12} className="inline -mt-0.5 text-accent fill-current" aria-hidden /> nos gráficos de{' '}
          <Link className="link" to="/chamados">Chamados</Link> e nos relatórios de <Link className="link" to="/chamados/relatorios">Chamados › Relatórios</Link>, na ordem das telas.
        </p>
        {!nMarcados ? <p className="text-[13px] text-muted mt-3">Nada marcado ainda: o PDF sai só com os números do dia.</p> : (
          <div className="grid gap-4 sm:grid-cols-2 mt-3">
            {([['Gráficos (aba Hoje)', 'grafico', inicial.marcados.graficos], ['Relatórios (período: hoje)', 'relatorio', inicial.marcados.relatorios]] as const).map(([rotulo, tipo, lista]) => (
              <div key={tipo}>
                <div className="eyebrow mb-1.5">{rotulo}</div>
                {!lista.length ? <p className="text-[13px] text-muted">nenhum</p> : (
                  <ul className="flex flex-col gap-1">
                    {lista.map((x, i) => (
                      <li key={x.id} className="flex items-center gap-2 text-[13.5px]">
                        <span className="tnum text-muted text-[12px] w-4 text-right">{i + 1}</span>
                        <span className="flex-1">{x.titulo}</span>
                        <button type="button" className="btn-ghost btn-sm" onClick={() => void tirar(tipo, x.id)} aria-label={`Tirar ${x.titulo} do envio`} title="Tirar do envio"><X size={14} /></button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        )}
        {inicial.marcados.atualizadoEm && <p className="text-[12px] text-muted mt-3">Marcado por último por {inicial.marcados.atualizadoPor ?? 'alguém da administração'}, {data(inicial.marcados.atualizadoEm, true)}.</p>}
      </section>

      {/* ---------- histórico ---------- */}
      <section className="card p-5">
        <h2 className="font-display font-semibold text-lg mb-2">Últimos envios</h2>
        {!inicial.historico.length ? <p className="text-[13px] text-muted">Nenhum envio ainda.</p> : (
          <div className="overflow-x-auto">
            <table className="table">
              <thead><tr><th>Quando</th><th>Como</th><th>Resultado</th><th>Para</th><th>PDF</th></tr></thead>
              <tbody>{inicial.historico.map((h) => <LinhaHistorico key={h.id} h={h} />)}</tbody>
            </table>
          </div>
        )}
      </section>

      <Confirmar
        open={confirmar} onClose={() => setConfirmar(false)} onConfirm={() => void mandar('pdf')} loading={mandando === 'pdf:'}
        titulo="Mandar o PDF agora?" botao={`Mandar para ${ativos} ${ativos === 1 ? 'número' : 'números'}`}
        texto={<>O Gestor monta o PDF com os números de agora ({nMarcados ? `${nMarcados} ${nMarcados === 1 ? 'item marcado' : 'itens marcados'}` : 'só os números do dia'}) e manda pelo WhatsApp para {inicial.destinatarios.filter((d) => d.ativo).map((d) => d.nome).join(', ')}. O envio de todo dia continua no horário.</>}
      />
    </div>
  );
}

const hora = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' });

/** Como foi o envio agendado de hoje (1.7.1): saiu, vai tentar de novo, ou desistiu e por quê. */
function EnvioDeHoje({ h }: { h: NonNullable<EnvioAjustesTela['hoje']> }) {
  const motivo = h.mensagem ? <> Motivo: <span className="font-medium">{h.mensagem}</span></> : null;
  if (h.ok) {
    return (
      <p className="mt-2 text-[13px] text-ok flex items-start gap-1.5" data-envio-hoje="ok">
        <CheckCircle2 size={15} className="mt-0.5 shrink-0" />
        <span>Hoje: o envio das {h.horario} saiu às {hora(h.em)}.</span>
      </p>
    );
  }
  if (h.novaTentativa) {
    return (
      <div className="mt-3 rounded-lg bg-signal-soft p-2.5 text-[13px] text-ink flex items-start gap-2" data-envio-hoje="tentando">
        <TriangleAlert size={15} className="mt-0.5 shrink-0 text-signal" />
        <span>Hoje: a tentativa das {hora(h.em)} falhou ({h.tentativas} de {TENTATIVAS_ENVIO}).{motivo} Tenta de novo às <b>{h.novaTentativa}</b>.</span>
      </div>
    );
  }
  return (
    <div className="mt-3 rounded-lg bg-bad-soft p-2.5 text-[13px] text-ink flex items-start gap-2" data-envio-hoje="falhou">
      <TriangleAlert size={15} className="mt-0.5 shrink-0 text-bad" />
      <span>
        <b>Hoje o envio das {h.horario} não saiu</b> ({h.tentativas} {h.tentativas === 1 ? 'tentativa' : 'tentativas'}, a última às {hora(h.em)}).{motivo}{' '}
        Corrija o que faltou e salve: se ainda estiver dentro de 3 horas do horário, ele tenta de novo hoje. Ou use "Mandar agora".
      </span>
    </div>
  );
}

const GATILHOS: Record<RegistroEnvio['gatilho'], string> = { agendado: 'no horário', manual: 'mandado agora', teste: 'teste' };

function LinhaHistorico({ h }: { h: RegistroEnvio }) {
  const certos = h.destinatarios.filter((d) => d.ok).length;
  const url = h.pdf ? api.envio.historicoPdfUrl(h.id) : null;
  return (
    <tr>
      <td className="text-[13px] whitespace-nowrap tnum">{data(h.em, true)}</td>
      <td className="text-[13px] whitespace-nowrap">{GATILHOS[h.gatilho]}{h.quem ? <span className="text-muted"> · {h.quem}</span> : ''}</td>
      <td className="text-[13px] min-w-[220px]">
        <span className={`inline-flex items-start gap-1.5 ${h.ok ? 'text-ok' : 'text-bad'}`}>
          {h.ok ? <CheckCircle2 size={14} className="mt-0.5 shrink-0" /> : <TriangleAlert size={14} className="mt-0.5 shrink-0" />}
          <span>{h.mensagem}</span>
        </span>
        {h.itens.length > 0 && <span className="block text-[12px] text-muted mt-0.5">{h.itens.join(' · ')}</span>}
      </td>
      <td className="text-[13px] whitespace-nowrap" title={h.destinatarios.map((d) => `${d.nome} ${numeroLegivel(d.numero)}: ${d.ok ? 'ok' : d.mensagem}`).join('\n')}>
        {h.destinatarios.length ? `${certos} de ${h.destinatarios.length}` : '—'}
      </td>
      <td className="text-[13px] whitespace-nowrap">{url ? <a className="link" href={url}>baixar</a> : h.pdf ? <span className="text-muted">{h.pdf.nome}</span> : '—'}</td>
    </tr>
  );
}
