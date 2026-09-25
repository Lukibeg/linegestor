/**
 * As duas janelas do Organizar dos Chamados (só a administração, vale para a equipe toda):
 *
 *  - **Grupos de um gráfico** — juntar várias opções num ponto só ("Ramal" = "Ramal - Configuração"
 *    + "Ramal - Criação" + "Ramal - Telefone Sem Serviço"). No gráfico, o botão **Agrupar** junta e
 *    separa; aqui se escolhe o que cada grupo junta e se o gráfico já abre agrupado para a equipe.
 *    O "Sugerir pelo começo do nome" monta os grupos óbvios de uma vez (o que vem antes do " - ").
 *  - **Etapas que fecham o chamado** — quais colunas do Kanban contam como fechadas. O padrão é o
 *    do LineChat (Tratado e Validado); o que for marcado aqui sai do "só em aberto" e passa a contar
 *    em "Fechados".
 *
 * Nada daqui vale antes do **Salvar para todos** do Organizar: as janelas só mexem no rascunho.
 * Quem usa monta a janela só quando ela abre (`{aberto && <… />}`): assim ela começa sempre do
 * rascunho de agora, e a releitura da tela a cada minuto não apaga o que se está escolhendo.
 */
import { useMemo, useState } from 'react';
import { CheckCircle2, Layers, Plus, Search, Trash2, WandSparkles } from 'lucide-react';
import { sugerirGrupos, type GrupoGrafico } from '@gestor/shared';
import { Chip, Modal, Toggle } from '../../components/ui/index.js';
import type { OpcoesChamados } from '../../api/types.js';

/** Uma opção que pode entrar num grupo: o valor que o gráfico usa, o nome e quanto contou agora. */
export type Candidato = { valor: string; rotulo: string; n: number };

const novoId = () => `g${Math.random().toString(36).slice(2, 9)}`;

export function GruposDoGrafico({ open, onClose, titulo, grupos, agrupar, candidatos, onPronto }: {
  open: boolean; onClose: () => void; titulo: string;
  grupos: GrupoGrafico[]; agrupar: boolean; candidatos: Candidato[];
  onPronto: (grupos: GrupoGrafico[], agrupar: boolean) => void;
}) {
  const [lista, setLista] = useState<GrupoGrafico[]>(grupos);
  const [abre, setAbre] = useState(agrupar);
  const [sel, setSel] = useState<string | null>(grupos[0]?.id ?? null);
  const [busca, setBusca] = useState('');
  const [aviso, setAviso] = useState('');

  const rotuloDe = useMemo(() => new Map(candidatos.map((c) => [c.valor, c.rotulo])), [candidatos]);
  const donoDe = useMemo(() => { const m = new Map<string, GrupoGrafico>(); for (const g of lista) for (const v of g.valores) m.set(v, g); return m; }, [lista]);
  const atual = lista.find((g) => g.id === sel) ?? null;
  const mudar = (id: string, m: Partial<GrupoGrafico>) => setLista((l) => l.map((g) => (g.id === id ? { ...g, ...m } : g)));

  // o que o grupo junta mas não apareceu entre as opções de agora continua na lista (não some calado)
  const todos: Candidato[] = useMemo(() => {
    const vistos = new Set(candidatos.map((c) => c.valor));
    const extras = lista.flatMap((g) => g.valores).filter((v) => !vistos.has(v)).map((v) => ({ valor: v, rotulo: v, n: 0 }));
    return [...candidatos, ...extras];
  }, [candidatos, lista]);
  const semAcento = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const visiveis = busca ? todos.filter((c) => semAcento(c.rotulo).includes(semAcento(busca))) : todos;

  const novo = () => {
    const g: GrupoGrafico = { id: novoId(), nome: '', valores: [] };
    setLista((l) => [...l, g]); setSel(g.id); setAviso('');
  };
  const sugerir = () => {
    const ja = new Set(lista.flatMap((g) => g.valores));
    const nomes = new Set(lista.map((g) => g.nome.trim().toLowerCase()));
    const novos = sugerirGrupos(todos, ja).filter((g) => !nomes.has(g.nome.toLowerCase())).map((g) => ({ id: novoId(), ...g }));
    if (!novos.length) { setAviso('Nada a sugerir: não há opções soltas com o mesmo começo de nome (o que vem antes do " - ").'); return; }
    setLista((l) => [...l, ...novos]); setSel(novos[0]!.id);
    setAviso(`${novos.length} grupo${novos.length > 1 ? 's' : ''} sugerido${novos.length > 1 ? 's' : ''} pelo começo do nome: ${novos.map((g) => g.nome).join(', ')}. Confira e ajuste.`);
  };
  const alternar = (v: string) => {
    if (!atual) return;
    mudar(atual.id, { valores: atual.valores.includes(v) ? atual.valores.filter((x) => x !== v) : [...atual.valores, v] });
  };

  // o que impede de fechar: sem nome, nome repetido, grupo de uma opção só
  const problemas: string[] = [];
  const vistosNomes = new Set<string>();
  for (const g of lista) {
    const nome = g.nome.trim();
    if (!nome) problemas.push('Um grupo está sem nome.');
    else if (vistosNomes.has(nome.toLowerCase())) problemas.push(`Há dois grupos chamados "${nome}".`);
    vistosNomes.add(nome.toLowerCase());
    if (g.valores.length < 2) problemas.push(`O grupo "${nome || 'sem nome'}" precisa juntar pelo menos duas opções.`);
  }

  return (
    <Modal
      open={open} onClose={onClose} largura="max-w-4xl"
      titulo={<span className="flex items-center gap-2"><Layers size={16} className="text-accent" /> Grupos de "{titulo}"</span>}
      rodape={<>
        {problemas.length > 0 && <span className="text-[12.5px] text-bad mr-auto">{problemas[0]}</span>}
        <button type="button" className="btn-secondary btn-sm" onClick={onClose}>Cancelar</button>
        <button type="button" className="btn-primary btn-sm" disabled={problemas.length > 0}
          onClick={() => onPronto(lista.map((g) => ({ ...g, nome: g.nome.trim() })), abre && lista.length > 0)}>Pronto</button>
      </>}
    >
      <p className="text-[13px] text-ink-2 mb-3 leading-snug">
        Um grupo junta várias opções num ponto só do gráfico, somando os chamados delas. No gráfico, o botão
        <b> Agrupar</b> junta e separa; clicar num grupo filtra por todas as opções dele. Vale para a equipe toda
        depois de <b>Salvar para todos</b>.
      </p>
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <button type="button" className="btn-secondary btn-sm" onClick={novo}><Plus size={14} /> Novo grupo</button>
        <button type="button" className="btn-ghost btn-sm" onClick={sugerir} title='Junta as opções que começam igual, antes do " - " (ex.: "Ramal - Criação" e "Ramal - Configuração" viram "Ramal")'>
          <WandSparkles size={14} /> Sugerir pelo começo do nome
        </button>
        <span className="ml-auto"><Toggle checked={abre} onChange={setAbre} label="Abrir agrupado para a equipe" /></span>
      </div>
      {aviso && <div className="text-[12.5px] rounded-lg bg-accent-soft text-accent-ink px-3 py-2 mb-3">{aviso}</div>}

      <div className="grid gap-3 md:grid-cols-[230px_1fr] min-h-[320px]">
        {/* os grupos */}
        <div className="flex flex-col gap-1 md:border-r md:border-line md:pr-3">
          {!lista.length && <p className="text-[13px] text-muted">Nenhum grupo ainda. Crie um, ou peça a sugestão.</p>}
          {lista.map((g) => (
            <button
              key={g.id} type="button" onClick={() => setSel(g.id)} aria-pressed={sel === g.id}
              className={`text-left rounded-lg px-2.5 py-1.5 text-sm flex items-center gap-2 ${sel === g.id ? 'bg-accent-soft text-accent-ink font-semibold' : 'hover:bg-surface-2'}`}
            >
              <Layers size={13} className="shrink-0 opacity-70" />
              <span className="flex-1 min-w-0 truncate">{g.nome.trim() || <i className="text-muted font-normal">sem nome</i>}</span>
              <span className={`tnum text-[12px] ${g.valores.length < 2 ? 'text-bad' : 'text-muted'}`}>{g.valores.length}</span>
            </button>
          ))}
        </div>

        {/* o grupo escolhido */}
        {!atual ? <div className="text-[13px] text-muted self-center text-center">Escolha um grupo à esquerda para ver e mudar o que ele junta.</div> : (
          <div className="min-w-0 flex flex-col gap-2">
            <div className="flex flex-wrap items-end gap-2">
              <label className="flex-1 min-w-[200px]">
                <span className="label">Nome do grupo</span>
                <input className="input" autoComplete="off" value={atual.nome} maxLength={80} placeholder="ex.: Ramal" autoFocus={!atual.nome}
                  onChange={(e) => mudar(atual.id, { nome: e.target.value })} />
              </label>
              <button type="button" className="btn-ghost btn-sm text-bad" onClick={() => { setLista((l) => l.filter((g) => g.id !== atual.id)); setSel(null); }}>
                <Trash2 size={14} /> Excluir grupo
              </button>
            </div>
            <div className="flex flex-wrap gap-1 min-h-[26px]">
              {atual.valores.map((v) => (
                <span key={v} className="inline-flex items-center gap-1 rounded-full bg-accent-soft text-accent-ink text-[12px] pl-2.5 pr-1 py-0.5">
                  {rotuloDe.get(v) ?? v}
                  <button type="button" className="hover:bg-surface-2 rounded-full p-0.5" aria-label={`Tirar ${rotuloDe.get(v) ?? v} do grupo`} onClick={() => alternar(v)}>×</button>
                </span>
              ))}
              {!atual.valores.length && <span className="text-[12.5px] text-muted">Marque abaixo as opções que este grupo junta.</span>}
            </div>
            <label className="relative">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
              <input className="input pl-8" autoComplete="off" placeholder="Procurar opção…" value={busca} onChange={(e) => setBusca(e.target.value)} />
            </label>
            <div className="flex flex-col gap-0.5 max-h-[300px] overflow-y-auto pr-1">
              {visiveis.map((c) => {
                const dono = donoDe.get(c.valor);
                const deOutro = !!dono && dono.id !== atual.id;
                return (
                  <label key={c.valor} className={`flex items-center gap-2 text-sm px-1.5 py-1 rounded ${deOutro ? 'opacity-60' : 'hover:bg-surface-2 cursor-pointer'}`}
                    title={deOutro ? `Já está no grupo "${dono!.nome}". Tire de lá para pôr aqui.` : undefined}>
                    <input type="checkbox" checked={atual.valores.includes(c.valor)} disabled={deOutro} onChange={() => alternar(c.valor)} />
                    <span className="flex-1 min-w-0 truncate">{c.rotulo}</span>
                    {deOutro && <Chip tone="muted" className="shrink-0">em {dono!.nome || 'outro grupo'}</Chip>}
                    <span className="font-mono tnum text-[12px] text-muted shrink-0" title="chamados agora, com os filtros da tela">{c.n || ''}</span>
                  </label>
                );
              })}
              {!visiveis.length && <span className="text-[13px] text-muted px-1.5">Nenhuma opção com esse nome.</span>}
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

/** Quais etapas do Kanban contam como fechadas (null = as finais do LineChat). */
export function EtapasQueFecham({ open, onClose, etapas, valor, onPronto }: {
  open: boolean; onClose: () => void; etapas: OpcoesChamados['etapas']; valor: string[] | null;
  onPronto: (v: string[] | null) => void;
}) {
  const doLineChat = useMemo(() => etapas.filter((e) => e.finalNoLineChat).map((e) => e.id), [etapas]);
  const [marcadas, setMarcadas] = useState<string[]>(valor ?? doLineChat);
  const igualAoPadrao = marcadas.length === doLineChat.length && doLineChat.every((id) => marcadas.includes(id));
  const alternar = (id: string) => setMarcadas((m) => (m.includes(id) ? m.filter((x) => x !== id) : [...m, id]));

  return (
    <Modal
      open={open} onClose={onClose}
      titulo={<span className="flex items-center gap-2"><CheckCircle2 size={16} className="text-ok" /> Etapas que fecham o chamado</span>}
      rodape={<>
        {!marcadas.length && <span className="text-[12.5px] text-bad mr-auto">Marque ao menos uma etapa.</span>}
        <button type="button" className="btn-ghost btn-sm mr-auto" disabled={igualAoPadrao} onClick={() => setMarcadas(doLineChat)}>Voltar ao padrão do LineChat</button>
        <button type="button" className="btn-secondary btn-sm" onClick={onClose}>Cancelar</button>
        <button type="button" className="btn-primary btn-sm" disabled={!marcadas.length} onClick={() => onPronto(igualAoPadrao ? null : marcadas)}>Pronto</button>
      </>}
    >
      <p className="text-[13px] text-ink-2 mb-3 leading-snug">
        O chamado numa etapa marcada conta como <b>fechado</b>: sai do "só em aberto" e entra em "Fechados", na hora em que
        chegou nela. As outras contam como <b>em aberto</b>. O padrão é o do LineChat. Vale para a equipe toda depois de
        <b> Salvar para todos</b>.
      </p>
      <div className="flex flex-col gap-0.5">
        {etapas.map((e) => (
          <label key={e.id} className="flex items-center gap-2 text-sm px-2 py-1.5 rounded hover:bg-surface-2 cursor-pointer">
            <input type="checkbox" checked={marcadas.includes(e.id)} onChange={() => alternar(e.id)} />
            <span className="flex-1 min-w-0">{e.title}</span>
            {e.finalNoLineChat && <Chip tone="muted" title="O LineChat marca esta etapa como final">final no LineChat</Chip>}
            <span className={`text-[12px] w-[74px] text-right ${marcadas.includes(e.id) ? 'text-ok font-semibold' : 'text-muted'}`}>{marcadas.includes(e.id) ? 'fecha' : 'em aberto'}</span>
          </label>
        ))}
      </div>
      <p className="text-[12px] text-muted mt-3">
        A hora em que cada chamado fechou é refeita pelo histórico de etapas que o Gestor guarda desde a primeira leitura
        (antes disso, é estimada pela última alteração do card).
      </p>
    </Modal>
  );
}
