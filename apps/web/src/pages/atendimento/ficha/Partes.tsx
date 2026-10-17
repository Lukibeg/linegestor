/**
 * Partes da coluna principal: o checklist (marcar, incluir, tirar — os itens do assunto entram
 * sozinhos) e, no problema, os incidentes que ele junta (com "Ligar um incidente").
 */
import { useState, type ReactNode } from 'react';
import { Layers, ListChecks, Plus, Unlink, X } from 'lucide-react';
import type { CartaoChamado, ItemChecklist } from '@gestor/shared';
import { api } from '../../../api/index.js';
import { Spinner } from '../../../components/ui/index.js';
import { Avatar, ChipSituacao, CodigoChamado, LinkDoChamado, painelDe } from '../comum.js';
import { ErroPerto, MarcaFalta, Secao, nomeComNivel, useAberta, useAcao } from './base.js';
import { emQuando } from './Cabecalho.js';
import { JanelaEscolherChamado } from './Janelas.js';

// =====================================================================
//  O CHECKLIST
// =====================================================================

export function Checklist() {
  const { f, pode, painel } = useAberta();
  // sem itens, o checklist só aparece para quem pode incluir — e no chamado ainda aberto
  if (!f.checklist.length && (!pode || f.situacao !== 'aberto')) return null;
  const feitos = f.checklist.filter((i) => i.feito).length;
  return (
    <Secao id="campo-checklist" titulo="Checklist" icone={<ListChecks size={16} />}
      dica={f.checklist.length ? `${feitos} de ${f.checklist.length} ${f.checklist.length === 1 ? 'feito' : 'feitos'}` : undefined}
      acoes={<MarcaFalta campo="checklist" />}>
      {f.checklist.length > 0 && (
        <>
          <div className="h-1.5 rounded-full bg-surface-2 overflow-hidden mb-2" aria-hidden>
            <div className="h-full bg-ok" style={{ width: `${Math.round((feitos / f.checklist.length) * 100)}%` }} />
          </div>
          <ul className="flex flex-col">{f.checklist.map((i) => <ItemDoChecklist key={i.id} i={i} />)}</ul>
        </>
      )}
      {!f.checklist.length && (
        <p className="text-[13px] text-muted mb-2">
          {painel?.tipo === 'vendas'
            ? 'Nenhum item. Inclua o que falta para fechar (ex.: mandar a proposta, apresentar ao sócio).'
            : 'Nenhum item. Os itens do assunto entram sozinhos quando o assunto é escolhido.'}
        </p>
      )}
      {pode && <IncluirNoChecklist />}
    </Secao>
  );
}

function ItemDoChecklist({ i }: { i: ItemChecklist }) {
  const { f, pode, opcoes } = useAberta();
  const marcar = useAcao();
  const tirar = useAcao();
  // a marca muda na hora; a resposta do servidor assume o lugar depois (ou desfaz, se deu erro)
  const [otimista, setOtimista] = useState<boolean | null>(null);
  const feito = otimista ?? i.feito;
  const quem = i.porId ? opcoes.pessoas.find((p) => p.id === i.porId)?.nome : null;
  const alternar = async (v: boolean) => {
    setOtimista(v);
    await marcar.rodar(() => api.atendimento.checklist(f.id, { acao: 'marcar', itemId: i.id, feito: v }));
    setOtimista(null);
  };
  return (
    <li className="py-1.5 border-b border-line last:border-b-0">
      <div className="flex items-start gap-2.5 group">
        <input type="checkbox" className="mt-1 shrink-0" checked={feito} disabled={!pode || marcar.ocupado} aria-label={i.texto}
          onChange={(e) => void alternar(e.target.checked)} />
        <span className="min-w-0 flex-1 text-[14px]">
          <span className={feito ? 'text-muted' : 'text-ink'}>{i.texto}</span>
          {i.doAssunto && <span className="chip bg-surface-2 text-muted font-medium ml-1.5 align-middle" title="Veio do assunto do chamado">do assunto</span>}
          {i.feito && (quem || i.em) && <span className="block text-[11.5px] text-muted">marcado{quem ? ` por ${quem}` : ''}{i.em ? ` ${emQuando(i.em)}` : ''}</span>}
        </span>
        {marcar.ocupado && <Spinner />}
        {pode && (
          <button type="button" className="btn-ghost btn-sm text-muted sm:opacity-0 sm:group-hover:opacity-100 focus:opacity-100 -my-1" aria-label={`Tirar do checklist: ${i.texto}`} title="Tirar do checklist"
            disabled={tirar.ocupado} onClick={() => void tirar.rodar(() => api.atendimento.checklist(f.id, { acao: 'tirar', itemId: i.id }))}>
            {tirar.ocupado ? <Spinner /> : <X size={14} />}
          </button>
        )}
      </div>
      <ErroPerto erro={marcar.erro ?? tirar.erro} />
    </li>
  );
}

function IncluirNoChecklist() {
  const { f } = useAberta();
  const acao = useAcao();
  const [texto, setTexto] = useState('');
  const incluir = async () => {
    if (!texto.trim()) return;
    const r = await acao.rodar(() => api.atendimento.checklist(f.id, { acao: 'incluir', texto: texto.trim() }));
    if (r.ok) setTexto('');
  };
  return (
    <div className="mt-2">
      <form className="flex gap-2" autoComplete="off" onSubmit={(e) => { e.preventDefault(); void incluir(); }}>
        <input className="input py-1.5 text-[13.5px] min-w-0" maxLength={160} value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Incluir um item (ex.: testar com o cliente)" aria-label="Novo item do checklist" />
        <button type="submit" className="btn-secondary btn-sm shrink-0" disabled={!texto.trim() || acao.ocupado}>{acao.ocupado ? <Spinner /> : <Plus size={14} />} Incluir</button>
      </form>
      <ErroPerto erro={acao.erro} />
    </div>
  );
}

// =====================================================================
//  UM CHAMADO NUMA LINHA (filhos, incidentes, ligações)
// =====================================================================

/** O outro chamado numa linha: o código (na cor do painel), o título, a etapa, a situação e quem está com ele. */
export function LinhaDeChamado({ c, antes, depois }: { c: CartaoChamado; antes?: ReactNode; depois?: ReactNode }) {
  const { opcoes } = useAberta();
  const painel = painelDe(opcoes, c.painelId);
  const etapa = painel?.etapas.find((e) => e.id === c.etapaId);
  return (
    <div className="flex items-start gap-2 py-2 min-w-0">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          {antes}
          <CodigoChamado codigo={c.codigo} cor={painel?.cor} />
          <ChipSituacao s={c.situacao} />
          <span className="text-[12px] text-muted">{[painel?.nome, etapa ? nomeComNivel(etapa) : null].filter(Boolean).join(' · ')}</span>
        </div>
        <LinkDoChamado codigo={c.codigo} className="block text-[13.5px] text-ink hover:text-accent mt-0.5 break-words">{c.titulo}</LinkDoChamado>
        {(c.cliente || c.responsavel) && (
          <div className="text-[12px] text-muted mt-0.5 flex flex-wrap items-center gap-x-2">
            {c.cliente && <span className="font-medium text-ink-2">{c.cliente.nome}</span>}
            {c.responsavel ? <span className="inline-flex items-center gap-1"><Avatar nome={c.responsavel.nome} tamanho={16} /> {c.responsavel.nome}</span> : <span className="italic">sem dono</span>}
          </div>
        )}
      </div>
      {depois && <div className="shrink-0">{depois}</div>}
    </div>
  );
}

// =====================================================================
//  OS INCIDENTES DO PROBLEMA
// =====================================================================

export function Incidentes() {
  const { f, pode, recarregar } = useAberta();
  const [ligando, setLigando] = useState(false);
  const tirar = useAcao();
  const [tirando, setTirando] = useState<string | null>(null);
  if (f.tipoChamado !== 'problema') return null;
  const abertos = f.incidentesLista.filter((c) => c.situacao === 'aberto').length;
  return (
    <Secao titulo="Incidentes que este problema junta" icone={<Layers size={16} />}
      dica={f.incidentesLista.length ? `${f.incidentesLista.length} (${abertos} em aberto)` : undefined}
      acoes={pode && <button type="button" className="btn-secondary btn-sm" onClick={() => setLigando(true)}><Plus size={14} /> Ligar um incidente</button>}>
      {!f.incidentesLista.length ? (
        <p className="text-[13px] text-muted">Nenhum incidente ainda. Ligue os chamados das empresas afetadas: quando o problema resolver, todos ficam à vista aqui.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-line -my-2">
          {f.incidentesLista.map((c) => (
            <li key={c.id}>
              <LinhaDeChamado c={c} depois={pode && (
                <button type="button" className="btn-ghost btn-sm text-muted" title={`Tirar ${c.codigo} deste problema`} aria-label={`Tirar ${c.codigo} deste problema`} disabled={tirar.ocupado}
                  onClick={async () => { setTirando(c.id); const r = await tirar.rodar(() => api.atendimento.definirProblema(c.id, null), `${c.codigo} saiu do problema`); setTirando(null); if (r.ok) recarregar(); }}>
                  {tirar.ocupado && tirando === c.id ? <Spinner /> : <Unlink size={14} />}
                </button>
              )} />
            </li>
          ))}
        </ul>
      )}
      <ErroPerto erro={tirar.erro} />
      {ligando && (
        <JanelaEscolherChamado titulo={`Ligar um incidente ao problema ${f.codigo}`} botao="Ligar o incidente" tipoChamado="chamado" excluir={f.incidentesLista.map((c) => c.codigo)}
          texto="Escolha o chamado (o incidente) que este problema explica. Se ele já for incidente de outro problema, passa a ser deste."
          fazer={(c) => api.atendimento.definirProblema(c, f.codigo)} ok={(c) => `${c} agora é incidente de ${f.codigo}`}
          depois={recarregar} onFechar={() => setLigando(false)} />
      )}
    </Secao>
  );
}
