/**
 * Projetos: a lista.
 *
 * Um projeto é uma tarefa que percorre vários clientes ("trocar o áudio das URAs").
 * Aqui só o cabeçalho de cada um e o quanto já andou — o trabalho acontece na ficha.
 */
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { CalendarClock, Plus, Search } from 'lucide-react';
import { api } from '../../api/index.js';
import type { ProjetoResumo } from '../../api/types.js';
import { Pagina } from '../../components/layout/AppShell.js';
import { Abas, Carregando, Chip, Vazio, mensagemErro, useToast } from '../../components/ui/index.js';
import { data } from '../../lib/format.js';
import { ProjetoForm } from './Form.js';
import { Andamento } from './partes.js';

export function ProjetosLista() {
  const [aba, setAba] = useState<'aberto' | 'concluido' | 'todos'>('aberto');
  const [busca, setBusca] = useState('');
  const [novo, setNovo] = useState(false);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({ queryKey: ['projetos', aba, busca], queryFn: () => api.projetos.lista({ status: aba, q: busca || undefined }) });

  const criar = useMutation({
    mutationFn: (d: Record<string, unknown>) => api.projetos.criar(d),
    onSuccess: (p) => { qc.invalidateQueries({ queryKey: ['projetos'] }); setNovo(false); toast.push('ok', 'Projeto criado'); navigate(`/projetos/${p.id}`); },
    onError: (e) => toast.push('erro', mensagemErro(e)),
  });

  return (
    <Pagina
      titulo="Projetos"
      sub="Tarefas que percorrem vários clientes até acabar — cada um com suas etapas, seu responsável e seu prazo."
      acoes={q.data?.podeGerenciar ? <button className="btn-primary" onClick={() => setNovo(true)}><Plus size={15} /> Novo projeto</button> : undefined}
    >
      <div className="flex flex-wrap items-center gap-3 mb-1">
        <div className="flex-1 min-w-[220px]">
          <Abas
            atual={aba}
            onChange={setAba}
            abas={[{ id: 'aberto' as const, label: 'Em andamento' }, { id: 'concluido' as const, label: 'Concluídos' }, { id: 'todos' as const, label: 'Todos' }]}
          />
        </div>
        <label className="relative -mt-3">
          <Search size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
          <input className="input pl-8 w-[230px]" placeholder="Procurar projeto" value={busca} onChange={(e) => setBusca(e.target.value)} />
        </label>
      </div>

      {q.isLoading ? <Carregando /> : !q.data?.items.length ? (
        <Vazio
          titulo={busca ? 'Nenhum projeto com esse nome' : aba === 'aberto' ? 'Nenhum projeto em andamento' : 'Nada aqui'}
          texto="Um projeto junta os clientes que vão passar pela mesma tarefa e guarda o que já foi feito em cada um."
          acao={q.data?.podeGerenciar && !busca ? <button className="btn-primary" onClick={() => setNovo(true)}><Plus size={15} /> Novo projeto</button> : undefined}
        />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {q.data.items.map((p) => <Cartao key={p.id} p={p} />)}
        </div>
      )}

      {novo && <ProjetoForm onClose={() => setNovo(false)} onSalvar={(d) => criar.mutate(d)} salvando={criar.isPending} />}
    </Pagina>
  );
}

function Cartao({ p }: { p: ProjetoResumo }) {
  return (
    <Link to={`/projetos/${p.id}`} className="card p-4 flex flex-col gap-3 hover:border-accent transition-colors">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="font-display font-semibold text-[17px]">{p.name}</h2>
          {p.goal && <p className="text-sm text-muted line-clamp-2 mt-0.5">{p.goal}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-1.5 shrink-0">
          {p.status === 'concluido' && <Chip tone="ok">concluído</Chip>}
          {p.status === 'cancelado' && <Chip tone="muted">cancelado</Chip>}
          {p.atrasado && <Chip tone="bad">atrasado</Chip>}
          {p.contagem.travado > 0 && <Chip tone="signal">{p.contagem.travado} travado(s)</Chip>}
        </div>
      </div>

      <Andamento pct={p.andamento} total={p.total} faltam={p.faltam} />

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12.5px] text-muted">
        <span>{p.total} cliente(s) · {p.etapas} etapa(s)</span>
        {p.ownerName && <span>responsável: {p.ownerName}</span>}
        {p.dueDate && <span className={`flex items-center gap-1 ${p.atrasado ? 'text-bad' : ''}`}><CalendarClock size={13} /> {data(p.dueDate)}</span>}
      </div>
    </Link>
  );
}
