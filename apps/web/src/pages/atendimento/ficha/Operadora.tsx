/**
 * O chamado aberto na operadora (o protocolo da Algar, da VC1…): cada protocolo com quando foi aberto,
 * o que a operadora prometeu, quando cobrar de novo e o andamento; Cobrar e Fechar registram o que a
 * operadora disse. "Abrir na operadora" registra o protocolo novo e marca "esperando a operadora"
 * sozinho (se não houver outra espera). O painel que não usa operadora (Ajustes › Campos) não mostra a
 * parte — a não ser que o chamado já tenha um protocolo.
 */
import { useState } from 'react';
import { CalendarClock, Check, Megaphone, Plus, RadioTower } from 'lucide-react';
import { campoLigado, type CasoOperadora } from '@gestor/shared';
import { api } from '../../../api/index.js';
import { Campo, Copiar, Modal, Spinner } from '../../../components/ui/index.js';
import { ErroPerto, Secao, useAberta, useAcao } from './base.js';
import { dataCompleta, emQuando } from './Cabecalho.js';

export function Operadora() {
  const { f, pode, painel } = useAberta();
  const [abrindo, setAbrindo] = useState(false);
  const [verFechados, setVerFechados] = useState(false);
  if (!f.operadora.length && (!pode || (painel && !campoLigado(painel.ajustes, 'operadoras')))) return null;
  const abertos = f.operadora.filter((c) => c.situacao === 'aberto');
  const fechados = f.operadora.filter((c) => c.situacao === 'fechado');
  return (
    <Secao titulo="Na operadora" icone={<RadioTower size={16} />}
      acoes={pode && <button type="button" className="btn-secondary btn-sm" onClick={() => setAbrindo(true)}><Plus size={14} /> Abrir na operadora</button>}>
      {!f.operadora.length && <p className="text-[13px] text-muted">Nenhum protocolo aberto na operadora.</p>}
      {abertos.length > 0 && <ul className="flex flex-col gap-2.5">{abertos.map((c) => <Caso key={c.id} c={c} />)}</ul>}
      {fechados.length > 0 && (
        <div className={abertos.length ? 'mt-3' : ''}>
          <button type="button" className="btn-ghost btn-sm text-muted -mx-2" aria-expanded={verFechados} onClick={() => setVerFechados((v) => !v)}>
            {verFechados ? 'Esconder' : 'Ver'} {fechados.length === 1 ? 'o protocolo fechado' : `os ${fechados.length} protocolos fechados`}
          </button>
          {verFechados && <ul className="flex flex-col gap-2.5 mt-1.5">{fechados.map((c) => <Caso key={c.id} c={c} />)}</ul>}
        </div>
      )}
      {abrindo && <JanelaAbrirNaOperadora onFechar={() => setAbrindo(false)} />}
    </Secao>
  );
}

function Caso({ c }: { c: CasoOperadora }) {
  const { pode } = useAberta();
  const [andamento, setAndamento] = useState<'cobrar' | 'fechar' | null>(null);
  const [todos, setTodos] = useState(false);
  const aberto = c.situacao === 'aberto';
  const atrasada = aberto && !!c.proximaCobrancaEm && Date.parse(c.proximaCobrancaEm) < Date.now();
  const passou = aberto && !!c.prometidoPara && Date.parse(c.prometidoPara) < Date.now();
  const andamentos = [...c.andamentos].reverse();
  const mostrados = todos ? andamentos : andamentos.slice(0, 2);
  return (
    <li className={`rounded-lg border p-3 ${aberto ? 'border-line' : 'border-line bg-surface-2'}`}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <b className="text-[14px]">{c.operadora.nome}</b>
        <span className={`chip ${aberto ? 'bg-roxo-soft text-roxo-ink' : 'bg-surface text-muted'}`}>{aberto ? 'aberto' : 'fechado'}</span>
      </div>
      <div className="flex items-center gap-1 text-[13px] mt-0.5">
        <span className="text-muted">protocolo</span> <span className="font-mono tnum break-all">{c.protocolo}</span> <Copiar texto={c.protocolo} titulo="Copiar o protocolo" />
      </div>
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-2 gap-y-0.5 text-[12.5px] mt-1">
        <dt className="text-muted">Aberto</dt><dd title={dataCompleta(c.abertoEm)}>{emQuando(c.abertoEm)}</dd>
        {c.prometidoPara && <><dt className="text-muted">Prometido</dt><dd className={passou ? 'text-bad font-semibold' : ''} title={dataCompleta(c.prometidoPara)}>{emQuando(c.prometidoPara)}{passou && ' — passou'}</dd></>}
        {aberto && c.proximaCobrancaEm && (
          <><dt className="text-muted">Cobrar</dt><dd className={atrasada ? 'text-signal font-semibold' : ''} title={dataCompleta(c.proximaCobrancaEm)}>
            {atrasada ? 'já passou da hora' : emQuando(c.proximaCobrancaEm)}{c.cobrarACadaHoras ? ` (a cada ${c.cobrarACadaHoras} h)` : ''}
          </dd></>
        )}
        {!aberto && c.fechadoEm && <><dt className="text-muted">Fechado</dt><dd title={dataCompleta(c.fechadoEm)}>{emQuando(c.fechadoEm)}</dd></>}
      </dl>
      {andamentos.length > 0 && (
        <div className="mt-2 border-t border-line pt-1.5">
          <div className="eyebrow mb-0.5">Andamento</div>
          <ul className="flex flex-col gap-1">
            {mostrados.map((a, i) => (
              <li key={`${a.em}-${i}`} className="text-[12.5px] leading-snug">
                <span className="text-muted" title={dataCompleta(a.em)}>{emQuando(a.em)}</span>{' '}
                <b className="font-semibold">{a.por ?? 'O Gestor'}</b> {a.acao === 'abriu' ? 'abriu' : a.acao === 'cobrou' ? 'cobrou' : 'fechou'}
                {a.texto && <>: <span className="text-ink-2 break-words">{a.texto}</span></>}
              </li>
            ))}
          </ul>
          {andamentos.length > 2 && <button type="button" className="btn-ghost btn-sm text-muted text-[12px] -mx-2 mt-0.5" onClick={() => setTodos((t) => !t)}>{todos ? 'Ver menos' : `Ver os ${andamentos.length}`}</button>}
        </div>
      )}
      {pode && aberto && (
        <div className="flex flex-wrap gap-2 mt-2">
          <button type="button" className="btn-secondary btn-sm" onClick={() => setAndamento('cobrar')}><Megaphone size={14} /> Cobrar</button>
          <button type="button" className="btn-secondary btn-sm" onClick={() => setAndamento('fechar')}><Check size={14} /> Fechar</button>
        </div>
      )}
      {andamento && <JanelaAndamento c={c} acao={andamento} onFechar={() => setAndamento(null)} />}
    </li>
  );
}

function JanelaAndamento({ c, acao: qual, onFechar }: { c: CasoOperadora; acao: 'cobrar' | 'fechar'; onFechar: () => void }) {
  const { f } = useAberta();
  const acao = useAcao();
  const [texto, setTexto] = useState('');
  const confirmar = async () => {
    const r = await acao.rodar(() => api.atendimento.andamentoOperadora(f.id, c.id, { acao: qual, texto: texto.trim() || null }),
      qual === 'cobrar' ? `Cobrança registrada (${c.operadora.nome})` : `Protocolo ${c.protocolo} fechado`);
    if (r.ok) onFechar();
  };
  return (
    <Modal open onClose={onFechar} titulo={qual === 'cobrar' ? `Cobrar a ${c.operadora.nome}` : `Fechar o protocolo ${c.protocolo}`}
      rodape={<>
        <button type="button" className="btn-secondary" onClick={onFechar}>Cancelar</button>
        <button type="button" className="btn-primary" disabled={acao.ocupado} onClick={() => void confirmar()}>{acao.ocupado ? <Spinner className="text-white" /> : qual === 'cobrar' ? 'Registrar a cobrança' : 'Fechar o protocolo'}</button>
      </>}>
      <p className="text-sm text-ink-2 mb-3">
        {qual === 'cobrar'
          ? `A próxima cobrança passa a contar de agora${c.cobrarACadaHoras ? ` (daqui a ${c.cobrarACadaHoras} h)` : ''}.`
          : f.espera?.tipo === 'operadora' ? 'O protocolo fecha e a marca "esperando a operadora" sai do chamado.' : 'O protocolo fecha. O chamado continua aberto até alguém resolver.'}
      </p>
      <Campo label={qual === 'cobrar' ? 'O que a operadora disse? (opcional)' : 'Como a operadora fechou? (opcional)'}>
        <textarea className="input min-h-[80px]" autoFocus maxLength={500} value={texto} onChange={(e) => setTexto(e.target.value)}
          placeholder={qual === 'cobrar' ? 'Ex.: técnico em rota, prometeram até as 18h' : 'Ex.: equipamento trocado no POP, rotas normalizadas'} />
      </Campo>
      <ErroPerto erro={acao.erro} />
    </Modal>
  );
}

function JanelaAbrirNaOperadora({ onFechar }: { onFechar: () => void }) {
  const { f, opcoes, cadastro } = useAberta();
  const acao = useAcao();
  const doCliente = cadastro?.operadoras ?? [];
  const outras = opcoes.operadoras.filter((o) => !doCliente.some((d) => d.id === o.id));
  const inicial = f.operadoras[0]?.id ?? doCliente[0]?.id ?? opcoes.operadoras[0]?.id ?? 'outra';
  const [operadoraId, setOperadoraId] = useState(inicial);
  const [nome, setNome] = useState('');
  const [protocolo, setProtocolo] = useState('');
  const [prometido, setPrometido] = useState('');
  const [horas, setHoras] = useState('');
  const [nota, setNota] = useState('');
  const abrir = async () => {
    if (operadoraId === 'outra' && !nome.trim()) { acao.setErro('Escreva o nome da operadora.'); return; }
    if (!protocolo.trim()) { acao.setErro('Escreva o protocolo.'); return; }
    const h = horas.trim() ? Number(horas) : null;
    if (h !== null && (!Number.isInteger(h) || h < 1 || h > 240)) { acao.setErro('Cobrar a cada: de 1 a 240 horas.'); return; }
    const quando = prometido ? new Date(prometido) : null;
    if (quando && Number.isNaN(quando.getTime())) { acao.setErro('A data prometida não está certa.'); return; }
    const r = await acao.rodar(() => api.atendimento.abrirNaOperadora(f.id, {
      operadoraId: operadoraId === 'outra' ? null : operadoraId,
      operadoraNome: operadoraId === 'outra' ? nome.trim() : null,
      protocolo: protocolo.trim(),
      prometidoPara: quando ? quando.toISOString() : null,
      cobrarACadaHoras: h,
      nota: nota.trim() || null,
    }), `Protocolo ${protocolo.trim()} registrado`);
    if (r.ok) onFechar();
  };
  return (
    <Modal open onClose={onFechar} titulo="Abrir chamado na operadora"
      rodape={<>
        <button type="button" className="btn-secondary" onClick={onFechar}>Cancelar</button>
        <button type="button" className="btn-primary" disabled={acao.ocupado} onClick={() => void abrir()}>{acao.ocupado ? <Spinner className="text-white" /> : 'Registrar o protocolo'}</button>
      </>}>
      <form className="flex flex-col gap-3" autoComplete="off" onSubmit={(e) => { e.preventDefault(); void abrir(); }}>
        <p className="text-sm text-ink-2">Registre o protocolo que a operadora deu. {f.espera ? '' : 'O chamado fica marcado como esperando a operadora (o prazo continua correndo).'}</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Campo label="Operadora">
            <select className="input" value={operadoraId} onChange={(e) => setOperadoraId(e.target.value)}>
              {doCliente.length > 0 && <optgroup label="Dos circuitos do cliente">{doCliente.map((o) => <option key={o.id} value={o.id}>{o.nome}</option>)}</optgroup>}
              {outras.length > 0 && <optgroup label={doCliente.length ? 'Outras' : 'Do cadastro'}>{outras.map((o) => <option key={o.id} value={o.id}>{o.nome}</option>)}</optgroup>}
              <option value="outra">Outra (escrever o nome)</option>
            </select>
          </Campo>
          {operadoraId === 'outra' && (
            <Campo label="Nome da operadora"><input className="input" maxLength={80} value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Vivo" /></Campo>
          )}
          <Campo label="Protocolo"><input className="input font-mono" autoFocus maxLength={80} value={protocolo} onChange={(e) => setProtocolo(e.target.value)} placeholder="Ex.: 2026101099871" /></Campo>
          <Campo label="Prometido para (opcional)"><input className="input" type="datetime-local" value={prometido} onChange={(e) => setPrometido(e.target.value)} /></Campo>
          <Campo label="Cobrar a cada (horas, opcional)" dica="O Gestor mostra quando cobrar de novo.">
            <span className="flex items-center gap-2"><CalendarClock size={15} className="text-muted shrink-0" /><input className="input tnum" type="number" min={1} max={240} inputMode="numeric" value={horas} onChange={(e) => setHoras(e.target.value)} placeholder="Ex.: 4" /></span>
          </Campo>
        </div>
        <Campo label="Observação (opcional)">
          <textarea className="input min-h-[64px]" maxLength={500} value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Ex.: aberto pelo 0800; atendente Joana" />
        </Campo>
      </form>
      <ErroPerto erro={acao.erro} />
    </Modal>
  );
}
