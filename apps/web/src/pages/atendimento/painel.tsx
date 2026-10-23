/**
 * O alto da visualização de um painel (Patch 2.0): o caminho de volta para os painéis, o painel
 * aberto (a cor, o nome e a sigla), a escolha **Quadro | Lista** — a lista mora dentro do painel, como
 * pediu o Luan na prévia ("essa parte de lista não precisa aqui, apenas dentro da visualização do
 * painel") —, "Trocar" (os outros painéis, com quantos estão em aberto) e "Configurar" (quem cuida).
 *
 * O quadro e a lista usam os mesmos nomes de filtro: trocar de vista leva a busca e os filtros junto.
 * A terceira vista é a dos números: o **Relatório** de vendas, no painel de Vendas (2.0.1), e os
 * **Relatórios** dos chamados, nos painéis de Gestão (2.1, decisão 0055).
 */
import { Link } from 'react-router-dom';
import { ArrowLeft, ChartColumn, ChevronsUpDown, Kanban, List, Settings2 } from 'lucide-react';
import type { Painel } from '@gestor/shared';
import { Popover } from '../../components/ui/index.js';
import { usePode } from './comum.js';
import { PontoDoPainel, useFiltrosNoEndereco } from './quadro/filtros.js';

export type Vista = 'quadro' | 'lista' | 'relatorio';

/** Os filtros que valem no quadro e na lista, com os mesmos nomes: trocar de vista leva todos junto. */
export const FILTROS_DO_PAINEL = ['q', 'responsavel', 'prioridade', 'espera', 'cliente', 'assunto'] as const;
export type FiltrosDoPainel = Partial<Record<(typeof FILTROS_DO_PAINEL)[number], string>>;

/** A lista do painel com os filtros do quadro (todas as situações, como o quadro mostra; e a etapa, se vier). */
export function enderecoDaLista(painelId: string, filtros: FiltrosDoPainel, etapaId?: string) {
  const n = new URLSearchParams({ painel: painelId, situacao: 'todos' });
  if (etapaId) n.set('etapa', etapaId);
  for (const [k, v] of Object.entries(filtros)) if (v) n.set(k, v);
  return `/atendimento/lista?${n}`;
}
/** O relatório do painel (o de vendas ou os dos chamados), com o período, se vier. */
export function enderecoDoRelatorio(painelId: string, extra: Record<string, string | null | undefined> = {}) {
  const n = new URLSearchParams({ painel: painelId });
  for (const [k, v] of Object.entries(extra)) if (v) n.set(k, v);
  return `/atendimento/relatorio?${n}`;
}
/** O quadro do painel com os filtros da lista que o quadro também tem. */
export function enderecoDoQuadro(painelId: string, filtros: FiltrosDoPainel) {
  const n = new URLSearchParams({ painel: painelId });
  for (const [k, v] of Object.entries(filtros)) if (v) n.set(k, v);
  return `/atendimento/quadro?${n}`;
}

export function CabecalhoDoPainel({ paineis, atual, vista, outraVista, className = '' }: {
  paineis: Painel[]; atual: Painel; vista: Vista;
  /** o endereço da outra vista (o quadro ou a lista), com os filtros que valem nas duas (no relatório, não vale) */
  outraVista?: string;
  className?: string;
}) {
  const pode = usePode();
  const { sp } = useFiltrosNoEndereco();
  const vendas = atual.tipo === 'vendas';
  // o desativado só aparece se for o aberto (um link antigo)
  const outros = paineis.filter((p) => p.ativo || p.id === atual.id);
  const para = (p: Painel) => {
    // o relatório do outro painel, com o mesmo período (os filtros e as escolhas são de cada painel)
    if (vista === 'relatorio') return enderecoDoRelatorio(p.id, { de: sp.get('de'), ate: sp.get('ate'), aba: p.tipo === atual.tipo ? sp.get('aba') : null });
    const n = new URLSearchParams(sp);
    n.set('painel', p.id);
    // o assunto e a etapa são de um painel só (no outro, não existem); a página volta para a primeira
    n.delete('assunto'); n.delete('etapa'); n.delete('p');
    return `/atendimento/${vista}?${n}`;
  };
  /** Para onde vai cada vista: do quadro para a lista (e de volta) com os filtros; o relatório, com o painel. */
  const destino = (v: Vista) => (v === 'relatorio' ? enderecoDoRelatorio(atual.id)
    : vista === 'relatorio' || !outraVista ? (v === 'quadro' ? enderecoDoQuadro(atual.id, {}) : enderecoDaLista(atual.id, {})) : outraVista);
  const opcao = (v: Vista, Icone: typeof Kanban, nome: string) => (
    vista === v ? (
      <span aria-current="page" className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[13px] font-semibold bg-accent-soft text-accent-ink">
        <Icone size={14} aria-hidden /> {nome}
      </span>
    ) : (
      <Link to={destino(v)} className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[13px] font-semibold text-ink-2 hover:bg-surface-2" title={`Ver o ${atual.nome} em ${nome.toLocaleLowerCase('pt-BR')}`}
        data-vista={v}>
        <Icone size={14} aria-hidden /> {nome}
      </Link>
    )
  );
  return (
    <div className={`flex items-center gap-x-2 gap-y-1 flex-wrap min-w-0 ${className}`} id="quadro-painel">
      {/* no computador comum, só os ícones (o nome aparece ao passar o mouse): a linha toda cabe junto com a busca */}
      <Link to="/atendimento" className="btn-ghost btn-sm -ml-2 text-ink-2" title="Voltar à tela dos painéis" aria-label="Painéis">
        <ArrowLeft size={15} aria-hidden /> <span className="hidden 2xl:inline">Painéis</span>
      </Link>
      <span className="text-line-strong" aria-hidden>/</span>
      <h2 className="font-display font-semibold text-[17px] flex items-center gap-2 min-w-0">
        <PontoDoPainel cor={atual.cor} />
        <span className="truncate">{atual.nome}</span>
        <span className="chip bg-surface-2 text-muted font-mono">{atual.sigla}</span>
        {!atual.ativo && <span className="font-normal text-[12px] text-muted">(desativado)</span>}
      </h2>
      <nav className="inline-flex rounded-lg border border-line bg-surface p-0.5" aria-label="Ver o painel em" id="vista-do-painel">
        {opcao('quadro', Kanban, 'Quadro')}
        {opcao('lista', List, 'Lista')}
        {opcao('relatorio', ChartColumn, vendas ? 'Relatório' : 'Relatórios')}
      </nav>
      {outros.length > 1 && (
        <Popover classe="btn-ghost btn-sm text-ink-2" alinhar="esquerda" largura="w-[290px]" titulo="Trocar de painel"
          botao={() => <><ChevronsUpDown size={14} aria-hidden /> <span className="sr-only 2xl:not-sr-only">Trocar</span></>}>
          <p className="text-[12.5px] text-muted mb-1">Abrir {vista === 'quadro' ? 'o quadro' : vista === 'lista' ? 'a lista' : 'os relatórios'} de:</p>
          <ul className="flex flex-col" aria-label="Painéis">
            {outros.map((p) => {
              const aqui = p.id === atual.id;
              return (
                <li key={p.id}>
                  <Link to={para(p)} aria-current={aqui ? 'page' : undefined}
                    className={`rounded-md px-2 py-1.5 text-[13.5px] flex items-center gap-2 ${aqui ? 'bg-accent-soft text-accent-ink font-semibold' : 'text-ink hover:bg-surface-2'}`}>
                    <PontoDoPainel cor={p.cor} />
                    <span className="flex-1 min-w-0 truncate">{p.nome}</span>
                    <span className="tnum text-[12px] text-muted" title={`${p.abertos} ${p.abertos === 1 ? 'chamado em aberto' : 'chamados em aberto'}`}>{p.abertos}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </Popover>
      )}
      {pode.cuidar && (
        <Link to={`/atendimento/ajustes?aba=paineis&editar=${encodeURIComponent(atual.id)}`} className="btn-ghost btn-sm text-ink-2" title="As etapas, as regras e quem vê este painel" aria-label="Configurar">
          <Settings2 size={15} aria-hidden /> <span className="hidden 2xl:inline">Configurar</span>
        </Link>
      )}
    </div>
  );
}
