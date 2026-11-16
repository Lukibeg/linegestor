/**
 * O checklist do card (2.4.8): a lista de tarefas que cada card monta na ficha. O pedido do Luan, em 13/11: "uma implantação
 * varia muito o que tem que fazer no dia porque depende do cenário do cliente… uma lista de ramais que tenho que configurar no
 * telefone e outra no softphone… n pode ser um check list fixo".
 *
 * Diferente das caixinhas (as mesmas em todos os cards do painel, editadas no "Editar as caixinhas"), aqui quem trabalha no
 * card inclui os itens dele: um por vez, ou colando a lista (cada linha vira um item). Cada item marcado mostra quem marcou e
 * quando; o lápis corrige o texto e o × tira. Marcar muda na tela antes (e volta se o servidor recusar).
 *
 * Os itens que vêm de outros campos (2.4.8, o Luan: "os campos de outras etapas que eu selecionar … gere esse checklist na
 * implantação"): em cima, debaixo do nome do campo de onde vêm ("Vêm de Lista de ramais · Curadoria"); para corrigir o texto, é
 * lá. O × tira o item só deste card ("tem que ter um xzinho se eu quiser remover algum item"): ele fica em "Tirados deste card",
 * com o Voltar. Os incluídos à mão vêm depois ("Incluídos aqui").
 */
import { useState, type KeyboardEvent } from 'react';
import { Check, Pencil, Plus, Undo2, X } from 'lucide-react';
import { linhasDaLista, MAX_LETRAS_DO_ITEM, nomeCompletoDoCampo, type CampoPersonalizado, type ItemChecklist } from '@gestor/shared';
import { api } from '../../../api/index.js';
import { Spinner } from '../../../components/ui/index.js';
import { BolinhaDoQueFalta, ErroPerto, MarcaFalta, useAberta, useAcao } from './base.js';
import { dataCompleta, emQuando } from './Cabecalho.js';

export function ChecklistDoCard({ c }: { c: CampoPersonalizado }) {
  const { f, pode, opcoes } = useAberta();
  const todos = f.listas?.[c.id] ?? [];
  // os tirados pelo × (os que vêm de outro campo) ficam fora da lista e da conta, com o Voltar
  const itens = todos.filter((i) => !i.tirado);
  const tirados = todos.filter((i) => i.tirado);
  // de onde vêm os itens (2.4.8): o nome do campo e a aba ("Lista de ramais · Curadoria")
  const nomeDaOrigem = (id: string) => {
    const o = opcoes.campos.find((x) => x.id === id);
    return o ? `${nomeCompletoDoCampo(o, opcoes.produtos)}${o.parte ? ` · ${o.parte}` : ''}` : 'outro campo';
  };
  const origens = (c.origens ?? []).filter((id) => opcoes.campos.some((x) => x.id === id && x.ativo));
  // os itens em grupos: os que vêm de cada campo, na ordem, e depois os incluídos à mão
  const grupos: Array<{ origem: string | null; itens: ItemChecklist[] }> = [];
  for (const i of itens) {
    const k = i.origem ?? null;
    const g = grupos[grupos.length - 1];
    if (g && g.origem === k) g.itens.push(i); else grupos.push({ origem: k, itens: [i] });
  }
  const comOrigem = grupos.some((g) => g.origem);
  const feitos = itens.filter((i) => i.feito).length;
  // também com o card fechado (o Implantado do modelo fecha o card, e a configuração pode ter ficado para trás)
  const aberto = pode;
  return (
    <div id={`campo-c-${c.id}`} className="min-w-0 scroll-mt-24" data-checklist-do-card>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mb-1.5">
        <BolinhaDoQueFalta campo={`campo:${c.id}`} />
        <h3 className="font-display font-semibold text-[14.5px]">{c.nome}</h3>
        {itens.length > 0 && <span className={`text-[12px] tnum ${feitos === itens.length ? 'text-ok font-medium' : 'text-muted'}`}>{feitos} de {itens.length}{feitos === itens.length ? ' · feito' : ''}</span>}
        <MarcaFalta campo={`campo:${c.id}`} />
      </div>
      {c.dica && <p className="text-[12px] text-muted -mt-0.5 mb-2">{c.dica}</p>}
      {itens.length > 0 ? (
        <div className="flex flex-col gap-2">
          {grupos.map((g, k) => (
            <div key={`${g.origem ?? 'mao'}:${k}`} className="min-w-0" data-origem={g.origem ? nomeDaOrigem(g.origem) : 'à mão'}>
              {comOrigem && (
                <p className="text-[11.5px] font-semibold uppercase tracking-wide text-muted mb-0.5">{g.origem ? `Vêm de ${nomeDaOrigem(g.origem)}` : 'Incluídos aqui'}</p>
              )}
              <ul className="flex flex-col gap-0.5">{g.itens.map((i) => <ItemDaLista key={i.id} c={c} i={i} />)}</ul>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-[13px] text-muted italic">
          {origens.length
            ? `Os itens vêm de ${origens.map(nomeDaOrigem).join(', ')}: preencha lá${aberto ? ', ou inclua aqui' : ''}.`
            : aberto ? 'Nenhum item ainda: inclua os deste card abaixo.' : 'Nenhum item.'}
        </p>
      )}
      {tirados.length > 0 && <TiradosDaLista c={c} itens={tirados} />}
      {aberto && <IncluirNaLista c={c} vazia={!itens.length} />}
    </div>
  );
}

function ItemDaLista({ c, i }: { c: CampoPersonalizado; i: ItemChecklist }) {
  const { f, pode, opcoes } = useAberta();
  const marcar = useAcao();
  const tirar = useAcao();
  const corrigir = useAcao();
  // a marca muda na hora; a resposta do servidor assume o lugar depois (ou desfaz, se deu erro)
  const [otimista, setOtimista] = useState<boolean | null>(null);
  const [editando, setEditando] = useState(false);
  const [texto, setTexto] = useState(i.texto);
  const feito = otimista ?? i.feito;
  const quem = i.porId ? opcoes.pessoas.find((p) => p.id === i.porId)?.nome ?? 'alguém que saiu' : null;
  const alternar = async () => {
    const v = !feito;
    setOtimista(v);
    await marcar.rodar(() => api.atendimento.listaDoCampo(f.id, c.id, { acao: 'marcar', itemId: i.id, feito: v }));
    setOtimista(null);
  };
  const salvar = async () => {
    const t = texto.trim();
    if (!t || t === i.texto) { setEditando(false); setTexto(i.texto); return; }
    const r = await corrigir.rodar(() => api.atendimento.listaDoCampo(f.id, c.id, { acao: 'editar', itemId: i.id, texto: t }));
    if (r.ok) setEditando(false);
  };
  const teclas = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') { e.preventDefault(); void salvar(); }
    // o Esc desfaz (e não fecha a janela do chamado)
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setEditando(false); setTexto(i.texto); corrigir.limpar(); }
  };
  return (
    <li className="group min-w-0" data-item={i.texto}>
      <div className="flex items-start gap-1">
        {editando ? (
          <div className="flex flex-1 min-w-0 items-center gap-1.5 py-0.5">
            <input className="input py-1 text-[13.5px] min-w-0 flex-1" value={texto} maxLength={MAX_LETRAS_DO_ITEM} autoFocus aria-label={`Corrigir ${i.texto}`}
              onChange={(e) => setTexto(e.target.value)} onKeyDown={teclas} onBlur={() => void salvar()} />
            {corrigir.ocupado && <Spinner />}
          </div>
        ) : (
          <label className={`flex flex-1 min-w-0 items-start gap-2.5 rounded-md px-1.5 py-1 -ml-1.5 ${pode ? 'cursor-pointer hover:bg-surface-2' : ''}`}>
            <input type="checkbox" className="sr-only peer" checked={feito} disabled={!pode} onChange={() => void alternar()} />
            <span aria-hidden className={`mt-[2px] grid place-items-center w-[17px] h-[17px] rounded-[5px] border shrink-0 peer-focus-visible:ring-2 peer-focus-visible:ring-accent transition-colors ${
              feito ? 'bg-ok border-ok text-white' : 'border-line-strong bg-surface'}`}>
              {feito && <Check size={12} strokeWidth={3} />}
            </span>
            <span className="min-w-0 flex-1">
              <span className={`text-[13.5px] leading-snug break-words ${feito ? 'text-ink-2' : 'text-ink'}`}>{i.texto}</span>
              {feito && i.feito && i.em && (
                <span className="block text-[11.5px] text-muted leading-tight mt-0.5" title={dataCompleta(i.em)}>{quem ?? 'uma integração'} · {emQuando(i.em)}</span>
              )}
            </span>
          </label>
        )}
        {/* o que veio de outro campo se corrige lá (2.4.8); o × tira só deste card. Sempre à vista (mais claro até passar o mouse) */}
        {pode && !editando && (
          <span className="flex items-center shrink-0 sm:opacity-50 sm:group-hover:opacity-100 focus-within:opacity-100">
            {!i.origem && (
              <button type="button" className="btn-ghost btn-sm text-muted -my-0.5 !px-1.5" title="Corrigir o texto" aria-label={`Corrigir ${i.texto}`}
                onClick={() => { setTexto(i.texto); setEditando(true); }}>
                <Pencil size={13} />
              </button>
            )}
            <button type="button" className="btn-ghost btn-sm text-muted -my-0.5 !px-1.5" title={i.origem ? 'Tirar deste card (a lista de origem não muda)' : 'Tirar da lista'}
              aria-label={`Tirar ${i.texto}`} disabled={tirar.ocupado}
              onClick={() => void tirar.rodar(() => api.atendimento.listaDoCampo(f.id, c.id, { acao: 'tirar', itemId: i.id }))}>
              {tirar.ocupado ? <Spinner /> : <X size={14} />}
            </button>
          </span>
        )}
      </div>
      <ErroPerto erro={marcar.erro ?? tirar.erro ?? corrigir.erro} className="ml-[26px] !mt-0 mb-1" />
    </li>
  );
}

/** Os tirados deste card pelo × (os que vêm de outro campo): cada um com o Voltar. */
function TiradosDaLista({ c, itens }: { c: CampoPersonalizado; itens: ItemChecklist[] }) {
  const { f, pode } = useAberta();
  const voltar = useAcao();
  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[12px] text-muted" data-tirados>
      <span>Tirados deste card:</span>
      {itens.map((i) => (
        pode ? (
          <button key={i.id} type="button" className="inline-flex items-center gap-1 rounded-md border border-line px-1.5 py-0.5 hover:bg-surface-2 hover:text-ink line-through"
            title="Trazer de volta para a lista" aria-label={`Trazer de volta ${i.texto}`} disabled={voltar.ocupado}
            onClick={() => void voltar.rodar(() => api.atendimento.listaDoCampo(f.id, c.id, { acao: 'voltar', itemId: i.id }))}>
            <Undo2 size={12} className="no-underline" /> {i.texto}
          </button>
        ) : <span key={i.id} className="line-through">{i.texto}</span>
      ))}
      <ErroPerto erro={voltar.erro} className="basis-full !mt-0" />
    </div>
  );
}

/**
 * Incluir: um item, ou a lista colada (cada linha vira um item; o Enter inclui, o Shift+Enter pula a linha). Antes de incluir
 * vários, o botão diz quantos.
 */
function IncluirNaLista({ c, vazia }: { c: CampoPersonalizado; vazia: boolean }) {
  const { f } = useAberta();
  const acao = useAcao();
  const [texto, setTexto] = useState('');
  const linhas = linhasDaLista(texto);
  const incluir = async () => {
    if (!linhas.length) return;
    const r = await acao.rodar(() => api.atendimento.listaDoCampo(f.id, c.id, { acao: 'incluir', textos: [texto] }));
    if (r.ok) setTexto('');
  };
  return (
    <div className="mt-2">
      <form className="flex items-start gap-2" autoComplete="off" onSubmit={(e) => { e.preventDefault(); void incluir(); }}>
        <textarea className="input py-1.5 text-[13.5px] min-w-0 flex-1 resize-y" rows={Math.min(6, Math.max(1, texto.split('\n').length))} value={texto}
          onChange={(e) => { setTexto(e.target.value); acao.limpar(); }} aria-label={`Incluir em ${c.nome}`} id={`lista-${c.id}-incluir`}
          placeholder={vazia ? 'Inclua um item, ou cole a lista: cada linha vira um item' : 'Incluir outro item (ou colar vários)'}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void incluir(); } }} />
        <button type="submit" className="btn-secondary btn-sm shrink-0 mt-0.5" disabled={!linhas.length || acao.ocupado}>
          {acao.ocupado ? <Spinner /> : <Plus size={14} />} {linhas.length > 1 ? `Incluir ${linhas.length}` : 'Incluir'}
        </button>
      </form>
      <ErroPerto erro={acao.erro} />
    </div>
  );
}
