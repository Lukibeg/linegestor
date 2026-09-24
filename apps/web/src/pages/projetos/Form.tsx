/**
 * Criar ou editar um projeto: o cabeçalho, as etapas e (na criação) a lista de clientes.
 *
 * As etapas valem para todos os clientes. Renomear uma etapa preserva o que já foi marcado;
 * tirá-la da lista apaga as marcas dela — por isso o aviso na hora de tirar.
 */
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import { api } from '../../api/index.js';
import type { CorOpcao, Projeto } from '../../api/types.js';
import { Campo, Chip, Modal, Spinner } from '../../components/ui/index.js';
import { CORES } from './partes.js';
import { EscolherClientes } from './EscolherClientes.js';

type Opcao = { id?: string; label: string; tone: CorOpcao; conclui: boolean };
type Etapa = { id?: string; title: string; kind: 'check' | 'escolha'; options: Opcao[] };

/** O ponto de partida de uma etapa em lista: o que a equipe já usava na planilha. */
const OPCOES_PADRAO: Opcao[] = [
  { label: 'Sem necessidade', tone: 'muted', conclui: true },
  { label: 'Pendente', tone: 'bad', conclui: false },
  { label: 'Em andamento', tone: 'signal', conclui: false },
  { label: 'Resolvido', tone: 'ok', conclui: true },
];

export function ProjetoForm({ projeto, onClose, onSalvar, salvando }: {
  projeto?: Projeto; onClose: () => void; onSalvar: (d: Record<string, unknown>) => void; salvando: boolean;
}) {
  const editando = !!projeto;
  const pessoas = useQuery({ queryKey: ['projeto-pessoas'], queryFn: () => api.projetos.pessoas() });
  const [f, setF] = useState({
    name: projeto?.name ?? '',
    goal: projeto?.goal ?? '',
    dueDate: projeto?.dueDate ?? '',
    ownerId: projeto?.ownerId ?? '',
  });
  const [etapas, setEtapas] = useState<Etapa[]>(
    projeto?.etapas.map((e) => ({ id: e.id, title: e.title, kind: e.kind, options: e.options })) ?? [{ title: '', kind: 'check', options: [] }],
  );
  const [clientIds, setClientIds] = useState<string[]>([]);
  const [escolhendo, setEscolhendo] = useState(false);

  const mexer = (i: number, d: Partial<Etapa>) => setEtapas(etapas.map((e, k) => (k === i ? { ...e, ...d } : e)));
  const mover = (i: number, dir: -1 | 1) => {
    const alvo = i + dir;
    if (alvo < 0 || alvo >= etapas.length) return;
    const nova = [...etapas];
    [nova[i], nova[alvo]] = [nova[alvo]!, nova[i]!];
    setEtapas(nova);
  };

  const limpas = etapas
    .map((e) => ({ ...e, title: e.title.trim(), options: e.kind === 'escolha' ? e.options.map((o) => ({ ...o, label: o.label.trim() })).filter((o) => o.label) : [] }))
    .filter((e) => e.title);
  /** Uma etapa de lista sem duas opções, ou sem nenhuma que resolva, nunca fecharia. */
  const listaTorta = limpas.find((e) => e.kind === 'escolha' && (e.options.length < 2 || !e.options.some((o) => o.conclui)));
  const podeSalvar = !!f.name.trim() && limpas.length > 0 && !listaTorta;

  const salvar = () => onSalvar({
    name: f.name.trim(),
    goal: f.goal.trim() || null,
    dueDate: f.dueDate || null,
    ownerId: f.ownerId || null,
    etapas: limpas,
    ...(editando ? {} : { clientIds }),
  });

  return (
    <Modal
      open
      onClose={onClose}
      lateral
      largura="max-w-2xl"
      titulo={editando ? `Editar ${projeto!.name}` : 'Novo projeto'}
      rodape={<>
        <button className="btn-secondary" onClick={onClose}>Cancelar</button>
        <button className="btn-primary" disabled={!podeSalvar || salvando} onClick={salvar}>{salvando ? <Spinner className="text-white" /> : editando ? 'Salvar' : 'Criar projeto'}</button>
      </>}
    >
      <div className="flex flex-col gap-4">
        <Campo label="Nome do projeto" dica="como a equipe vai chamar isto no dia a dia">
          <input className="input" autoFocus value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Áudio novo das URAs" />
        </Campo>

        <Campo label="Objetivo" dica="o que se quer alcançar e por quê — é o que a pessoa lê antes de começar">
          <textarea className="input min-h-[90px]" value={f.goal} onChange={(e) => setF({ ...f, goal: e.target.value })}
            placeholder="Trocar o áudio da URA de todos os clientes com PBX por uma gravação em estúdio, com qualidade melhor." />
        </Campo>

        <div className="grid gap-3 sm:grid-cols-2">
          <Campo label="Prazo" dica="a data-alvo do projeto inteiro">
            <input type="date" className="input" value={f.dueDate} onChange={(e) => setF({ ...f, dueDate: e.target.value })} />
          </Campo>
          <Campo label="Responsável pelo projeto" dica="quem cobra o andamento">
            <select className="input" value={f.ownerId} onChange={(e) => setF({ ...f, ownerId: e.target.value })}>
              <option value="">ninguém por enquanto</option>
              {(pessoas.data ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </Campo>
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="eyebrow">Etapas</span>
            <button className="btn-ghost btn-sm" onClick={() => setEtapas([...etapas, { title: '', kind: 'check', options: [] }])}><Plus size={13} /> etapa</button>
          </div>
          <p className="text-[12px] text-muted mb-2">
            As mesmas para todos os clientes da lista, nesta ordem. <b>Caixinha</b> é feito ou não feito;
            <b> lista de opções</b> é aquele rótulo colorido da planilha (Pendente, Mensagem enviada, …).
            O andamento conta as etapas resolvidas.
          </p>
          <div className="flex flex-col gap-2">
            {etapas.map((e, i) => (
              <div key={i} className="rounded-lg border border-line p-2 flex flex-col gap-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="font-mono text-[12px] text-muted w-5 text-right tnum">{i + 1}</span>
                  <input className="input flex-1 min-w-[160px]" value={e.title} onChange={(ev) => mexer(i, { title: ev.target.value })}
                    placeholder={e.kind === 'escolha' ? 'Situação do áudio' : ['Gravar o áudio', 'Subir no PBX', 'Testar com o cliente', 'Avisar que está no ar'][i] ?? 'O que precisa ser feito'} />
                  <select className="input w-auto" value={e.kind}
                    onChange={(ev) => {
                      const kind = ev.target.value as Etapa['kind'];
                      mexer(i, { kind, options: kind === 'escolha' && !e.options.length ? OPCOES_PADRAO.map((o) => ({ ...o })) : e.options });
                    }}>
                    <option value="check">Caixinha</option>
                    <option value="escolha">Lista de opções</option>
                  </select>
                  <button className="btn-ghost btn-sm text-muted" disabled={i === 0} onClick={() => mover(i, -1)} aria-label="Subir"><ArrowUp size={14} /></button>
                  <button className="btn-ghost btn-sm text-muted" disabled={i === etapas.length - 1} onClick={() => mover(i, 1)} aria-label="Descer"><ArrowDown size={14} /></button>
                  <button className="btn-ghost btn-sm text-bad" onClick={() => setEtapas(etapas.filter((_, k) => k !== i))} aria-label="Tirar etapa"
                    title={e.id ? 'Tirar esta etapa apaga o que já foi marcado nela' : 'Tirar etapa'}><Trash2 size={14} /></button>
                </div>

                {e.kind === 'escolha' && (
                  <Opcoes
                    opcoes={e.options}
                    onMudar={(options) => mexer(i, { options })}
                  />
                )}
              </div>
            ))}
          </div>
          {listaTorta && (
            <p className="text-[12px] text-bad mt-2">
              "{listaTorta.title}" precisa de ao menos duas opções e de uma marcada como <b>resolve</b> — senão a etapa nunca fecha.
            </p>
          )}
          {editando && etapas.some((e) => !e.id) && <p className="text-[12px] text-signal mt-2">Etapa nova entra como não feita para todos os clientes que já estavam na lista.</p>}
        </div>

        {!editando && (
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="eyebrow">Clientes</span>
              <button className="btn-ghost btn-sm" onClick={() => setEscolhendo(true)}><Plus size={13} /> escolher</button>
            </div>
            <p className="text-[12px] text-muted">
              {clientIds.length ? `${clientIds.length} cliente(s) na lista.` : 'Nenhum ainda — dá para escolher agora ou depois, na ficha do projeto.'}
            </p>
          </div>
        )}
      </div>

      {escolhendo && (
        <EscolherClientes
          jaNaLista={[]}
          escolhidos={clientIds}
          onClose={() => setEscolhendo(false)}
          onConfirmar={(ids) => { setClientIds(ids); setEscolhendo(false); }}
        />
      )}
    </Modal>
  );
}

/** As opções de uma etapa em lista: rótulo, cor e se aquela escolha resolve a etapa. */
function Opcoes({ opcoes, onMudar }: { opcoes: Opcao[]; onMudar: (o: Opcao[]) => void }) {
  const mexer = (i: number, d: Partial<Opcao>) => onMudar(opcoes.map((o, k) => (k === i ? { ...o, ...d } : o)));
  const mover = (i: number, dir: -1 | 1) => {
    const alvo = i + dir;
    if (alvo < 0 || alvo >= opcoes.length) return;
    const nova = [...opcoes];
    [nova[i], nova[alvo]] = [nova[alvo]!, nova[i]!];
    onMudar(nova);
  };
  return (
    <div className="pl-6 flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <span className="text-[12px] text-muted">Opções — marque as que <b>resolvem</b> a etapa (a barra de andamento conta essas).</span>
        <button className="btn-ghost btn-sm" onClick={() => onMudar([...opcoes, { label: '', tone: 'neutral', conclui: false }])}><Plus size={12} /> opção</button>
      </div>
      {opcoes.map((o, i) => (
        <div key={o.id ?? i} className="flex flex-wrap items-center gap-1.5">
          <input className="input flex-1 min-w-[120px]" value={o.label} onChange={(e) => mexer(i, { label: e.target.value })} placeholder="Pendente envio de mensagem" />
          <select className="input w-[124px] shrink-0" value={o.tone} onChange={(e) => mexer(i, { tone: e.target.value as CorOpcao })} aria-label="Cor">
            {CORES.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </select>
          <Chip tone={o.tone} className="shrink-0 max-w-[140px] truncate">{o.label.trim() || 'assim'}</Chip>
          <label className="flex items-center gap-1.5 text-[12.5px] cursor-pointer shrink-0" title="Escolher esta opção fecha a etapa">
            <input type="checkbox" checked={o.conclui} onChange={(e) => mexer(i, { conclui: e.target.checked })} /> resolve
          </label>
          <button className="btn-ghost btn-sm text-muted" disabled={i === 0} onClick={() => mover(i, -1)} aria-label="Subir opção"><ArrowUp size={13} /></button>
          <button className="btn-ghost btn-sm text-muted" disabled={i === opcoes.length - 1} onClick={() => mover(i, 1)} aria-label="Descer opção"><ArrowDown size={13} /></button>
          <button className="btn-ghost btn-sm text-bad" onClick={() => onMudar(opcoes.filter((_, k) => k !== i))} aria-label="Tirar opção"
            title={o.id ? 'Tirar esta opção limpa a escolha de quem estava nela' : 'Tirar opção'}><Trash2 size={13} /></button>
        </div>
      ))}
    </div>
  );
}
