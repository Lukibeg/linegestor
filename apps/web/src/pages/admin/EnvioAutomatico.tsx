/**
 * Administração › Envio automático (Patch 1.7, decisão 0038): todo dia, no horário escolhido, o PDF com os
 * gráficos e relatórios marcados vai pelo WhatsApp (API da FlwChat) para os números da lista.
 *
 * **Desde o 2.4.5 (decisão 0061), cada envio é de um painel.** O Luan, em 04/11: *"o envio automático tá saindo do
 * antigo… ele tem que ficar modular… para eu poder enviar de qualquer painel"*. A tela é uma lista de envios: cada um
 * tem o painel de onde sai (um painel de chamados, ou o Legado do Helena), o horário, os dias, os números e o que vai
 * no PDF — marcado com o aviãozinho nos gráficos da Visão geral e nos relatórios daquele painel. A ligação com a
 * FlwChat (o número que envia, o endereço e o token, que vai para o cofre e nunca volta para a tela) é uma só, embaixo.
 * Depois de mandar, o Gestor conclui a conversa na FlwChat (2.0.1: "ele envia e conclui… ele é só um aviso").
 */
import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { CheckCircle2, Download, Eye, LayoutDashboard, Plus, Send, Trash2, TriangleAlert, X } from 'lucide-react';
import { NOMES_DIAS_ENVIO, ORIGEM_LEGADO, numeroLegivel, TENTATIVAS_ENVIO } from '@gestor/shared';
import { api, IS_DEMO } from '../../api/index.js';
import type { EnvioAjustesTela, EnvioTela, RegistroEnvio } from '../../api/types.js';
import { Campo, Carregando, Chip, Confirmar, Spinner, Toggle, mensagemErro, useToast } from '../../components/ui/index.js';
import { data } from '../../lib/format.js';

type Linha = { id: string; nome: string; numero: string; ativo: boolean };
type FormEnvio = { id: string; origem: string; ativo: boolean; horario: string; dias: number[]; destinatarios: Linha[] };
type Form = { url: string; remetente: string; concluirConversa: boolean; envios: FormEnvio[] };
type Resultado = { envioId: string; ok: boolean; mensagem: string };

const doServidor = (a: EnvioAjustesTela): Form => ({
  url: a.url, remetente: a.remetente ? numeroLegivel(a.remetente) : '', concluirConversa: a.concluirConversa,
  envios: a.envios.map((e) => ({
    id: e.id, origem: e.origem, ativo: e.ativo, horario: e.horario, dias: e.dias,
    destinatarios: e.destinatarios.map((d) => ({ id: d.id, nome: d.nome, numero: numeroLegivel(d.numero), ativo: d.ativo })),
  })),
});
const novoId = () => Math.random().toString(36).slice(2, 10);
/** Onde marcar o que vai no PDF de uma origem: os Relatórios do painel (a Visão geral), ou a tela do Legado. */
const ondeMarcar = (origem: string) => (origem === ORIGEM_LEGADO ? '/chamados' : `/atendimento/relatorio?painel=${encodeURIComponent(origem)}`);

export function EnvioAutomatico() {
  // a cada minuto, para o "hoje" e os últimos envios aparecerem sozinhos quando o relógio mandar (1.7.1)
  const q = useQuery({ queryKey: ['envio', 'ajustes'], queryFn: () => api.envio.ajustes(), refetchInterval: 60_000 });
  if (q.isLoading) return <Carregando />;
  if (q.isError) return <div className="text-bad text-sm">{mensagemErro(q.error)}</div>;
  return <Tela inicial={q.data!} />;
}

function Tela({ inicial }: { inicial: EnvioAjustesTela }) {
  const qc = useQueryClient(); const toast = useToast();
  const [f, setF] = useState<Form>(() => doServidor(inicial));
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [res, setRes] = useState<Resultado | null>(null);
  const [mandando, setMandando] = useState<string | null>(null);
  const [confirmar, setConfirmar] = useState<string | null>(null);
  // volta ao que está salvo só quando o salvo muda (a atualização de cada minuto não apaga o que a pessoa está digitando)
  const salvoAgora = JSON.stringify(doServidor(inicial));
  useEffect(() => { setF(JSON.parse(salvoAgora) as Form); }, [salvoAgora]);
  const mudou = useMemo(() => JSON.stringify(f) !== salvoAgora || !!token, [f, salvoAgora, token]);
  const ligados = inicial.envios.filter((e) => e.ativo).length;
  const livres = inicial.origens.filter((o) => !f.envios.some((e) => e.origem === o.id));
  const [novaOrigem, setNovaOrigem] = useState('');
  const origemNova = livres.some((o) => o.id === novaOrigem) ? novaOrigem : livres.find((o) => o.id !== ORIGEM_LEGADO)?.id ?? livres[0]?.id ?? '';

  const salvar = async () => {
    setBusy(true); setErro(null);
    try {
      const a = await api.envio.salvarAjustes({ ...f, token: token || undefined });
      qc.setQueryData(['envio', 'ajustes'], a);
      setToken('');
      const n = a.envios.filter((e) => e.ativo).length;
      toast.push('ok', n ? `Envio automático salvo: ${n} ${n === 1 ? 'envio ligado' : 'envios ligados'}.` : 'Ajustes salvos (nenhum envio ligado).');
    } catch (e) { setErro(mensagemErro(e)); } finally { setBusy(false); }
  };
  const mandar = async (tipo: 'teste' | 'pdf', envioId: string, destinatarioId?: string) => {
    setMandando(`${tipo}:${envioId}:${destinatarioId ?? ''}`); setRes(null);
    try {
      const r = tipo === 'teste' ? await api.envio.testar(envioId, destinatarioId) : await api.envio.enviar(envioId, destinatarioId);
      setRes({ envioId, ok: r.ok, mensagem: r.mensagem });
      await qc.invalidateQueries({ queryKey: ['envio', 'ajustes'] });
    } catch (e) { setRes({ envioId, ok: false, mensagem: mensagemErro(e) }); } finally { setMandando(null); setConfirmar(null); }
  };
  const mudarEnvio = (id: string, m: Partial<FormEnvio>) => setF((x) => ({ ...x, envios: x.envios.map((e) => (e.id === id ? { ...e, ...m } : e)) }));
  const adicionar = () => {
    if (!origemNova) return;
    setF((x) => ({ ...x, envios: [...x.envios, { id: novoId(), origem: origemNova, ativo: false, horario: '18:00', dias: [0, 1, 2, 3, 4], destinatarios: [] }] }));
    setNovaOrigem('');
  };
  const paraConfirmar = inicial.envios.find((e) => e.id === confirmar);

  return (
    <div className="flex flex-col gap-4 max-w-4xl pb-16">
      <section className="card p-5">
        <div className="flex flex-wrap items-center gap-3 mb-1">
          <span className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${ligados ? 'bg-ok-soft text-ok' : 'bg-surface-2 text-muted'}`}><Send size={18} /></span>
          <h2 className="font-display font-semibold text-lg">Envio automático pelo WhatsApp</h2>
          {ligados ? <Chip tone="ok">{ligados} {ligados === 1 ? 'ligado' : 'ligados'}</Chip> : <Chip tone="muted">desligado</Chip>}
        </div>
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
        <div className="text-[13.5px] text-ink-2 leading-relaxed border-l-2 border-line pl-3 mt-3 flex flex-col gap-2">
          <p>
            <b>Cada envio sai de um painel.</b> Todo dia, no horário dele, o Gestor monta um PDF com os números de hoje do painel e o que estiver marcado com o aviãozinho
            <Send size={13} className="inline mx-1 -mt-0.5 text-accent fill-current" aria-label="Envio diário" />
            nos gráficos e relatórios dele (no canto de cada um; fica azul quando marcado), e manda pelo WhatsApp para os números do envio.
          </p>
          <p>
            Os números são <b>do dia de hoje</b>, até a hora do envio. Se o servidor estiver fora do ar na hora, o envio sai quando ele voltar (até 3 horas depois); se falhar, tenta de novo 2 vezes, a cada 15 minutos.
            Trocou o horário? Vale <b>já para hoje</b>. E salvar depois de uma falha libera 3 tentativas novas.
          </p>
        </div>
      </section>

      {/* ---------- os envios, um por painel ---------- */}
      {!f.envios.length && (
        <section className="card p-5 text-[13.5px] text-muted">Nenhum envio ainda. Escolha um painel embaixo e clique em Novo envio.</section>
      )}
      {f.envios.map((e) => (
        <CartaoDoEnvio
          key={e.id} e={e} salvo={inicial.envios.find((x) => x.id === e.id) ?? null} inicial={inicial} mudou={mudou} mandando={mandando}
          origensDaEscolha={inicial.origens.filter((o) => o.id === e.origem || !f.envios.some((x) => x.origem === o.id))}
          res={res?.envioId === e.id ? res : null}
          aoMudar={(m) => mudarEnvio(e.id, m)}
          aoTirar={() => setF((x) => ({ ...x, envios: x.envios.filter((y) => y.id !== e.id) }))}
          aoTestar={(d) => void mandar('teste', e.id, d)}
          aoMandar={() => setConfirmar(e.id)}
        />
      ))}
      {livres.length > 0 && (
        <div className="flex flex-wrap items-center gap-2" id="envio-novo">
          <label htmlFor="envio-nova-origem" className="text-[13.5px] text-ink-2">Novo envio do painel</label>
          <select id="envio-nova-origem" className="input w-auto py-1.5 text-[13.5px]" value={origemNova} onChange={(ev) => setNovaOrigem(ev.target.value)}>
            {livres.map((o) => <option key={o.id} value={o.id}>{o.nome}{o.sigla ? ` (${o.sigla})` : ''}{o.ativo ? '' : ' — desativado'}</option>)}
          </select>
          <button type="button" className="btn-secondary btn-sm" onClick={adicionar}><Plus size={14} /> Novo envio</button>
          <span className="text-[12px] text-muted">Cada painel tem um envio; os painéis de Vendas têm o relatório deles.</span>
        </div>
      )}

      {/* ---------- de onde sai (a mesma para todos) ---------- */}
      <section className="card p-5" id="envio-flwchat">
        <h2 className="font-display font-semibold text-lg mb-1">De onde sai (FlwChat)</h2>
        <p className="text-[13px] text-muted mb-3">A mesma para todos os envios.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo label="Número que envia" dica="o número conectado na FlwChat (DDD + número)">
            <input className="input font-mono text-[13px]" id="envio-remetente" placeholder="(71) 3512-0000" inputMode="tel" value={f.remetente} onChange={(ev) => setF({ ...f, remetente: ev.target.value })} />
          </Campo>
          <Campo label="Token da API da FlwChat" dica={inicial.temToken ? 'já existe um guardado; preencha só para trocar' : 'fica cifrado no cofre e nunca aparece de volta'}>
            <input className="input font-mono text-[13px]" id="envio-token" type="password" autoComplete="off" placeholder={inicial.temToken ? '••••••••  (guardado)' : ''} value={token} onChange={(ev) => setToken(ev.target.value)} />
          </Campo>
          <Campo label="Endereço de envio da API" dica="o endereço de enviar mensagem da documentação da FlwChat" className="sm:col-span-2">
            <input className="input font-mono text-[13px]" id="envio-url" value={f.url} onChange={(ev) => setF({ ...f, url: ev.target.value })} />
          </Campo>
        </div>
        <p className="text-[12px] text-muted mt-2">
          A FlwChat baixa o PDF de <span className="font-mono">{inicial.enderecoPublico}</span>, num link difícil de adivinhar que vence em {inicial.linkValeDias} dias.
          O arquivo continua guardado aqui no histórico.
        </p>
        <label className="flex items-start gap-2.5 text-sm cursor-pointer mt-3" id="envio-concluir">
          <Toggle checked={f.concluirConversa} onChange={(v) => setF({ ...f, concluirConversa: v })} />
          <span>
            Concluir a conversa depois de mandar
            <span className="block text-[12.5px] text-muted">O relatório é só um aviso: logo depois de mandar, o Gestor conclui a conversa na FlwChat, e ela não fica pendente esperando alguém. Vale também para o Testar.</span>
          </span>
        </label>
        {inicial.configuradoEm && <p className="text-[12px] text-muted mt-3">Último ajuste: {inicial.configuradoPor ?? 'alguém da administração'}, {data(inicial.configuradoEm, true)}.</p>}
      </section>

      {/* ---------- histórico ---------- */}
      <section className="card p-5">
        <h2 className="font-display font-semibold text-lg mb-2">Últimos envios</h2>
        {!inicial.historico.length ? <p className="text-[13px] text-muted">Nenhum envio ainda.</p> : (
          <div className="overflow-x-auto">
            <table className="table">
              <thead><tr><th>Quando</th><th>Painel</th><th>Como</th><th>Resultado</th><th>Para</th><th>PDF</th></tr></thead>
              <tbody>{inicial.historico.map((h) => <LinhaHistorico key={h.id} h={h} />)}</tbody>
            </table>
          </div>
        )}
      </section>

      {/* ---------- salvar (vale para a tela toda) ---------- */}
      {(mudou || erro) && (
        <div className="sticky bottom-3 z-10 rounded-xl border border-accent bg-surface shadow-lg px-3 py-2.5 flex flex-wrap items-center gap-x-3 gap-y-2" id="envio-salvar">
          <span className={`text-[13px] flex-1 min-w-[200px] ${erro ? 'text-bad' : 'text-ink-2'}`}>{erro ?? 'Há mudanças sem salvar nesta tela.'}</span>
          <button type="button" className="btn-ghost btn-sm" disabled={busy} onClick={() => { setF(doServidor(inicial)); setToken(''); setErro(null); }}>Desfazer</button>
          <button type="button" className="btn-primary btn-sm" disabled={busy || !mudou} onClick={salvar}>{busy ? <Spinner className="text-white" /> : 'Salvar'}</button>
        </div>
      )}

      <Confirmar
        open={!!paraConfirmar} onClose={() => setConfirmar(null)} onConfirm={() => paraConfirmar && void mandar('pdf', paraConfirmar.id)} loading={!!paraConfirmar && mandando === `pdf:${paraConfirmar.id}:`}
        titulo={`Mandar o PDF do ${paraConfirmar?.origem === ORIGEM_LEGADO ? 'Legado do Helena' : `painel ${paraConfirmar?.origemNome ?? ''}`} agora?`}
        botao={`Mandar para ${paraConfirmar?.destinatarios.filter((d) => d.ativo).length ?? 0} ${paraConfirmar?.destinatarios.filter((d) => d.ativo).length === 1 ? 'número' : 'números'}`}
        texto={paraConfirmar ? <>O Gestor monta o PDF com os números de agora ({nItens(paraConfirmar) ? `${nItens(paraConfirmar)} ${nItens(paraConfirmar) === 1 ? 'item marcado' : 'itens marcados'}` : 'só os números do dia'}) e manda pelo WhatsApp para {paraConfirmar.destinatarios.filter((d) => d.ativo).map((d) => d.nome).join(', ')}. O envio de todo dia continua no horário.</> : null}
      />
    </div>
  );
}

const nItens = (e: EnvioTela) => e.marcados.graficos.length + e.marcados.relatorios.length;

/** Um envio da lista: de onde sai, quando, para quem e o que vai no PDF. */
function CartaoDoEnvio({ e, salvo, inicial, origensDaEscolha, mudou, mandando, res, aoMudar, aoTirar, aoTestar, aoMandar }: {
  e: FormEnvio; salvo: EnvioTela | null; inicial: EnvioAjustesTela; origensDaEscolha: EnvioAjustesTela['origens'];
  mudou: boolean; mandando: string | null; res: Resultado | null;
  aoMudar: (m: Partial<FormEnvio>) => void; aoTirar: () => void; aoTestar: (destinatarioId: string) => void; aoMandar: () => void;
}) {
  const qc = useQueryClient(); const toast = useToast(); const nav = useNavigate();
  const origem = inicial.origens.find((o) => o.id === e.origem);
  const nome = origem?.nome ?? salvo?.origemNome ?? 'um painel que saiu';
  const legado = e.origem === ORIGEM_LEGADO;
  /** o que está salvo é deste painel (mudou o painel e não salvou: o que vai no PDF é o do painel novo, depois de salvar) */
  const doMesmoPainel = !!salvo && salvo.origem === e.origem;
  const pronto = !!salvo && !mudou;
  const ativosSalvos = salvo?.destinatarios.filter((d) => d.ativo).length ?? 0;
  const ligadoSemNinguem = e.ativo && !e.destinatarios.some((d) => d.ativo);
  const mudarLinha = (id: string, m: Partial<Linha>) => aoMudar({ destinatarios: e.destinatarios.map((d) => (d.id === id ? { ...d, ...m } : d)) });
  const alternarDia = (d: number) => aoMudar({ dias: e.dias.includes(d) ? e.dias.filter((y) => y !== d) : [...e.dias, d].sort() });
  const tirar = async (tipo: 'relatorio' | 'grafico', id: string) => {
    try {
      const m = await api.envio.marcados(e.origem);
      await api.envio.salvarMarcados(tipo === 'relatorio' ? { relatorios: m.relatorios.filter((x) => x !== id), graficos: m.graficos } : { relatorios: m.relatorios, graficos: m.graficos.filter((x) => x !== id) }, e.origem);
      await qc.invalidateQueries({ queryKey: ['envio'] });
    } catch (err) { toast.push('erro', mensagemErro(err)); }
  };
  const pdf = salvo ? api.envio.pdfUrl(salvo.id) : null;

  return (
    <section className="card p-5" data-envio={e.id} data-envio-origem={e.origem} aria-label={`Envio do ${legado ? 'Legado do Helena' : `painel ${nome}`}`}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${salvo?.ativo ? 'bg-ok-soft text-ok' : 'bg-surface-2 text-muted'}`}><LayoutDashboard size={18} /></span>
        <div className="min-w-[200px] flex-1">
          <select id={`envio-origem-${e.id}`} aria-label="Painel do envio" className="input w-full sm:w-auto max-w-full py-1 font-display font-semibold text-[16px]" value={e.origem} onChange={(ev) => aoMudar({ origem: ev.target.value })}
            title="De onde sai o PDF deste envio">
            {origensDaEscolha.map((o) => <option key={o.id} value={o.id}>{o.id === ORIGEM_LEGADO ? o.nome : `Painel ${o.nome}`}{o.ativo ? '' : ' (desativado)'}</option>)}
            {!origem && <option value={e.origem}>{nome}</option>}
          </select>
        </div>
        {salvo?.ativo ? <Chip tone="ok">ligado</Chip> : <Chip tone="muted">{salvo ? 'desligado' : 'novo'}</Chip>}
        {salvo?.ativo && salvo.proximo && <span className="text-[13px] text-ink-2">próximo: <b>{salvo.proximo}</b></span>}
        <button type="button" className="btn-ghost btn-sm" onClick={aoTirar} aria-label={`Tirar o envio do ${nome}`} title="Tirar este envio da lista (vale ao salvar; o que está marcado no painel continua lá)"><Trash2 size={15} /></button>
      </div>
      {salvo?.origemProblema && doMesmoPainel && (
        <p className="mt-2 rounded-lg bg-bad-soft p-2.5 text-[13px] text-ink flex items-start gap-2"><TriangleAlert size={15} className="mt-0.5 shrink-0 text-bad" />{salvo.origemProblema}</p>
      )}
      {legado && (
        <p className="mt-2 text-[12.5px] text-muted">Os tickets do LineChat (Suporte › Legado do Helena), como até o 2.4.4. Os chamados novos ficam nos painéis.</p>
      )}
      {salvo?.ativo && salvo.hoje && doMesmoPainel && <EnvioDeHoje h={salvo.hoje} />}

      {/* ---------- quando ---------- */}
      <div className="flex flex-col gap-3 mt-4">
        <label className="flex items-center gap-2.5 text-sm cursor-pointer">
          <Toggle checked={e.ativo} onChange={(v) => aoMudar({ ativo: v })} /> Mandar todo dia, sozinho
        </label>
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <span className="label">Horário (de Brasília)</span>
            <div className="flex items-center gap-1">
              <select className="input w-[76px]" id={`envio-hora-${e.id}`} aria-label="Hora" value={e.horario.slice(0, 2)} onChange={(ev) => aoMudar({ horario: `${ev.target.value}:${e.horario.slice(3, 5)}` })}>
                {Array.from({ length: 24 }, (_, h) => String(h).padStart(2, '0')).map((h) => <option key={h} value={h}>{h}</option>)}
              </select>
              <span className="font-semibold">:</span>
              <select className="input w-[76px]" id={`envio-minuto-${e.id}`} aria-label="Minuto" value={e.horario.slice(3, 5)} onChange={(ev) => aoMudar({ horario: `${e.horario.slice(0, 2)}:${ev.target.value}` })}>
                {[...new Set([...Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, '0')), e.horario.slice(3, 5)])].sort().map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
          </div>
          <div>
            <span className="label">Dias</span>
            <div className="flex flex-wrap gap-1" role="group" aria-label="Dias do envio">
              {NOMES_DIAS_ENVIO.map((n, d) => (
                <button key={n} type="button" aria-pressed={e.dias.includes(d)} onClick={() => alternarDia(d)}
                  className={`w-11 py-1.5 rounded-lg border text-[13px] font-semibold ${e.dias.includes(d) ? 'border-accent bg-accent-soft text-accent-ink' : 'border-line bg-surface text-muted hover:text-ink'}`}>{n}</button>
              ))}
              <button type="button" className="btn-ghost btn-sm" onClick={() => aoMudar({ dias: e.dias.length === 7 ? [0, 1, 2, 3, 4] : [0, 1, 2, 3, 4, 5, 6] })}>{e.dias.length === 7 ? 'só dias úteis' : 'todos os dias'}</button>
            </div>
          </div>
        </div>
      </div>

      {/* ---------- para quem ---------- */}
      <h3 className="font-display font-semibold mt-5 mb-2">Para quem</h3>
      {!e.destinatarios.length && <p className="text-[13px] text-muted mb-2">Nenhum número ainda. Adicione quem recebe o PDF deste painel todo dia.</p>}
      {ligadoSemNinguem && <p className="text-[13px] text-bad mb-2">Este envio está ligado e ninguém recebe: deixe ao menos um número que recebe.</p>}
      <div className="flex flex-col gap-2">
        {e.destinatarios.map((d) => {
          const salvoNaLista = salvo?.destinatarios.some((x) => x.id === d.id);
          return (
            <div key={d.id} className={`grid gap-2 grid-cols-1 sm:grid-cols-[minmax(0,1fr)_200px_auto] items-center rounded-lg border border-line p-2 ${d.ativo ? '' : 'bg-surface-2'}`}>
              <input className="input" aria-label="Nome" placeholder="Nome (ex.: Luan)" value={d.nome} onChange={(ev) => mudarLinha(d.id, { nome: ev.target.value })} />
              <input className="input font-mono text-[13px]" aria-label="Número de WhatsApp" placeholder="(71) 99999-0000" inputMode="tel" value={d.numero} onChange={(ev) => mudarLinha(d.id, { numero: ev.target.value })} />
              <div className="flex items-center gap-1.5 justify-end">
                <label className="flex items-center gap-1.5 text-[12.5px] text-ink-2 cursor-pointer" title="Pausado: fica na lista, mas não recebe">
                  <Toggle checked={d.ativo} onChange={(v) => mudarLinha(d.id, { ativo: v })} /> {d.ativo ? 'recebe' : 'pausado'}
                </label>
                <button type="button" className="btn-ghost btn-sm" disabled={!pronto || !salvoNaLista || !!mandando} onClick={() => aoTestar(d.id)}
                  title={!pronto || !salvoNaLista ? 'Salve antes de testar' : 'Manda uma mensagem de teste (só texto) para este número'}>
                  {mandando === `teste:${e.id}:${d.id}` ? <Spinner /> : 'Testar'}
                </button>
                <button type="button" className="btn-ghost btn-sm" aria-label={`Tirar ${d.nome || 'este número'} da lista`} title="Tirar da lista (vale ao salvar)"
                  onClick={() => aoMudar({ destinatarios: e.destinatarios.filter((x) => x.id !== d.id) })}><Trash2 size={15} /></button>
              </div>
            </div>
          );
        })}
      </div>
      <button type="button" className="btn-secondary btn-sm mt-2" onClick={() => aoMudar({ destinatarios: [...e.destinatarios, { id: novoId(), nome: '', numero: '', ativo: true }] })}>
        <Plus size={14} /> Adicionar número
      </button>

      {/* ---------- o que vai no PDF ---------- */}
      <h3 className="font-display font-semibold mt-5 mb-1">O que vai no PDF</h3>
      <p className="text-[13px] text-ink-2">
        Sempre: os números de cima {legado ? 'da aba Hoje dos tickets do LineChat' : 'da Visão geral de hoje do painel'}. E o que estiver marcado com o aviãozinho <Send size={12} className="inline -mt-0.5 text-accent fill-current" aria-hidden /> nos{' '}
        {legado
          ? <><Link className="link" to="/chamados">gráficos do Legado do Helena</Link> e nos <Link className="link" to="/chamados/relatorios">relatórios de lá</Link></>
          : <><Link className="link" to={ondeMarcar(e.origem)}>gráficos da Visão geral</Link> e nos <Link className="link" to={`${ondeMarcar(e.origem)}&parte=relatorios`}>relatórios do painel {nome}</Link></>}
        , na ordem das telas.
      </p>
      {!doMesmoPainel ? (
        <p className="text-[13px] text-muted mt-2">Salve para ver o que está marcado no {legado ? 'Legado do Helena' : `painel ${nome}`}.</p>
      ) : salvo!.marcados.problema ? (
        <p className="text-[13px] text-bad mt-2">{salvo!.marcados.problema}</p>
      ) : !nItens(salvo!) ? (
        <p className="text-[13px] text-muted mt-2">Nada marcado ainda: o PDF sai só com os números do dia.</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 mt-3">
          {([['Gráficos (hoje)', 'grafico', salvo!.marcados.graficos], ['Relatórios (período: hoje)', 'relatorio', salvo!.marcados.relatorios]] as const).map(([rotulo, tipo, lista]) => (
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
      {doMesmoPainel && salvo!.marcados.atualizadoEm && <p className="text-[12px] text-muted mt-3">Marcado por último por {salvo!.marcados.atualizadoPor ?? 'alguém da administração'}, {data(salvo!.marcados.atualizadoEm, true)}.</p>}

      {/* ---------- agora ---------- */}
      <div className="flex flex-wrap gap-2 mt-4 items-center border-t border-line pt-3">
        <button className="btn-secondary" disabled={!pronto || !!mandando || !ativosSalvos} onClick={aoMandar}
          title={!pronto ? 'Salve antes' : !ativosSalvos ? 'Nenhum número que recebe' : 'Monta o PDF de agora e manda para a lista deste envio'}>
          {mandando === `pdf:${e.id}:` ? <Spinner /> : <><Send size={14} /> Mandar agora</>}
        </button>
        <button className="btn-ghost" disabled={!pronto} onClick={() => nav(`/envio-diario?envio=${encodeURIComponent(e.id)}`)} title={pronto ? 'Abre o PDF de agora, do jeito que vai sair' : 'Salve antes'}><Eye size={15} /> Ver como fica</button>
        {pdf && pronto && <a className="btn-ghost" href={pdf}><Download size={15} /> Baixar o PDF de agora</a>}
      </div>
      {res && (
        <div className={`text-[13px] mt-3 flex items-start gap-2 rounded-lg p-2.5 ${res.ok ? 'bg-ok-soft text-ok' : 'bg-bad-soft text-bad'}`}>
          {res.ok ? <CheckCircle2 size={15} className="mt-0.5 shrink-0" /> : <TriangleAlert size={15} className="mt-0.5 shrink-0" />}
          <span>{res.mensagem}</span>
        </div>
      )}
    </section>
  );
}

const hora = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' });

/** Como foi o envio agendado de hoje (1.7.1): saiu, vai tentar de novo, ou desistiu e por quê. */
function EnvioDeHoje({ h }: { h: NonNullable<EnvioTela['hoje']> }) {
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
      <td className="text-[13px] whitespace-nowrap">{h.origemNome ?? '—'}</td>
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
