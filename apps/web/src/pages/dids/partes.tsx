/**
 * As peças de um DID que se editam na própria linha, iguais em todo lugar que mostra números:
 * Circuitos › Numeração, a ficha do circuito e a ficha do cliente (pedido do Luan, 26/09:
 * "qualquer lugar que tenha DIDs tem que ser possível alterar o cliente, o uso, a observação").
 * Na ficha do cliente ficam só o uso e a observação: o "trocar cliente" de lá saiu no 1.6 (30/09).
 *
 *  - **Cliente**: o lápis ao lado abre a escolha com busca; "livre" libera o número.
 *  - **Uso**: clicar na marca alterna em uso / não usado (só com cliente).
 *  - **Observação**: clicar no texto abre o campo; Enter grava, Esc desiste, vazio limpa.
 *
 * Tudo com a permissão de alocar números (`dids.assign`) e a mesma regra do servidor: trocar o
 * cliente derruba a marca de uso (o número entra "não usado" no cliente novo).
 */
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Pencil } from 'lucide-react';
import { api } from '../../api/index.js';
import { Chip, EscolherComBusca, mensagemErro, Spinner, useToast, type OpcaoBusca } from '../../components/ui/index.js';

/** Os clientes para escolher, uma leitura só por tela (e a mesma chave das listas suspensas antigas). */
export function useOpcoesDeCliente(ligado = true): OpcaoBusca[] {
  const q = useQuery({ queryKey: ['client-options'], queryFn: () => api.clients.options(), enabled: ligado });
  return (q.data ?? []).map((c) => ({ id: c.id, nome: c.name }));
}

/** Gravar um DID e avisar todas as telas que mostram números (listas, fichas, contagens). */
export function useEditarDid() {
  const qc = useQueryClient();
  const toast = useToast();
  const [mudando, setMudando] = useState<string | null>(null);
  const atualizar = () => Promise.all(['dids', 'client-dids', 'circuit-dids', 'circuit', 'circuits', 'client', 'clients', 'dashboard'].map((k) => qc.invalidateQueries({ queryKey: [k] })));
  const alternarUso = async (id: string, inUse: boolean) => {
    setMudando(id);
    try { await api.dids.update(id, { inUse }); await atualizar(); }
    catch (e) { toast.push('erro', mensagemErro(e)); } finally { setMudando(null); }
  };
  /** Lança o erro para quem chamou: a observação mostra o erro na própria linha. */
  const gravarObservacao = async (id: string, note: string | null) => { await api.dids.update(id, { note }); await atualizar(); };
  const trocarCliente = async (id: string, numero: string, clientId: string | null, nome?: string) => {
    await api.dids.update(id, { clientId });
    await atualizar();
    toast.push('ok', clientId ? `${numero} agora está com ${nome ?? 'o cliente'} (não usado)` : `${numero} liberado (sem cliente)`);
  };
  return { mudando, alternarUso, gravarObservacao, trocarCliente };
}

/** A marca "em uso" / "não usado" de um número. Com permissão, vira um botão que alterna. */
export function UsoDid({ inUse, podeMudar, mudando, onChange }: { inUse: boolean; podeMudar: boolean; mudando?: boolean; onChange?: (v: boolean) => void }) {
  // whitespace-nowrap: em coluna apertada a marca quebrava em duas linhas ("em / uso")
  const chip = <Chip tone={inUse ? 'ok' : 'signal'} className="whitespace-nowrap" title={inUse ? 'O cliente usa este número' : 'Alocado ao cliente, mas ainda não está em uso'}>{inUse ? 'em uso' : 'não usado'}</Chip>;
  if (!podeMudar || !onChange) return chip;
  return <button type="button" className={`inline-flex ${mudando ? 'opacity-50' : ''}`} disabled={mudando} onClick={(e) => { e.stopPropagation(); onChange(!inUse); }} title={inUse ? 'Clique para marcar como não usado' : 'Clique para marcar como em uso'} aria-label={inUse ? 'Marcar como não usado' : 'Marcar como em uso'}>{chip}</button>;
}

/** O cliente do número: o nome (que abre a ficha) ou "livre", e — com permissão — o lápis que troca. */
export function ClienteDoDid({ d, clientes, podeEditar, trocar }: {
  d: { id: string; clientId: string | null; clientName: string | null; numberFormatted: string };
  clientes: OpcaoBusca[];
  podeEditar: boolean;
  trocar: (clientId: string | null, nome?: string) => Promise<void>;
}) {
  const toast = useToast();
  const [gravando, setGravando] = useState(false);
  const escolher = async (id: string) => {
    setGravando(true);
    try { await trocar(id || null, clientes.find((c) => c.id === id)?.nome); }
    catch (e) { toast.push('erro', mensagemErro(e)); } finally { setGravando(false); }
  };
  const nome = d.clientId ? <Link className="link" to={`/clientes/${d.clientId}`}>{d.clientName}</Link> : <Chip tone="ok">livre</Chip>;
  if (!podeEditar) return nome;
  const escolha = (
    <EscolherComBusca
      valor={d.clientId ?? ''} opcoes={clientes} vazio="livre (sem cliente)" onChange={(id) => void escolher(id)}
      rotulo={`Cliente do ${d.numberFormatted}`} procurar="Procurar cliente…"
      gatilho={(abrir) => (
        <button type="button" className="btn-ghost btn-sm px-1 text-muted opacity-60 hover:opacity-100 focus-visible:opacity-100" onClick={abrir} disabled={gravando} title="Trocar o cliente deste número (ou liberar)" aria-label={`Trocar o cliente do ${d.numberFormatted}`}>
          {gravando ? <Spinner className="!w-3.5 !h-3.5" /> : <Pencil size={12} />}
        </button>
      )}
    />
  );
  return <span className="inline-flex items-center gap-0.5 whitespace-nowrap">{nome}{escolha}</span>;
}

/**
 * A observação de um número, editável na própria linha: clicar abre o campo, **Enter** (ou sair
 * do campo) grava, **Esc** desiste. Vazio limpa a observação. O texto novo fica na tela enquanto
 * grava (o clique não "some"), e o erro aparece logo abaixo, na mesma linha.
 */
export function ObservacaoDid({ nota, podeEditar, numero, gravar }: { nota: string | null; podeEditar: boolean; numero: string; gravar: (v: string | null) => Promise<void> }) {
  const [editando, setEditando] = useState(false);
  const [valor, setValor] = useState(nota ?? '');
  const [gravando, setGravando] = useState<string | null>(null);
  const [erro, setErro] = useState('');
  const mostrada = gravando ?? nota;
  const concluir = async () => {
    const novo = valor.trim();
    setEditando(false);
    if (novo === (nota ?? '')) return;
    setGravando(novo); setErro('');
    try { await gravar(novo || null); } catch (e) { setErro(mensagemErro(e)); setValor(nota ?? ''); } finally { setGravando(null); }
  };
  if (!podeEditar) return <span className="text-muted">{nota}</span>;
  if (editando) {
    return (
      <input
        className="input py-1 text-[13px]" autoFocus autoComplete="off" maxLength={500} value={valor} aria-label={`Observação do ${numero}`}
        placeholder="Observação (vazio = sem observação)"
        onChange={(e) => setValor(e.target.value)} onBlur={() => void concluir()}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void concluir(); } if (e.key === 'Escape') { e.stopPropagation(); setValor(nota ?? ''); setEditando(false); } }}
      />
    );
  }
  return (
    <div>
      <button
        type="button" onClick={() => { setValor(nota ?? ''); setEditando(true); }}
        className={`group w-full text-left rounded px-1 -mx-1 py-0.5 hover:bg-surface-2 inline-flex items-center gap-1.5 ${gravando !== null ? 'opacity-60' : ''}`}
        title="Clique para editar a observação" aria-label={`Editar a observação do ${numero}`}
      >
        {/* vazia: um traço discreto; o convite a escrever só aparece sob o mouse (ou no foco do teclado) */}
        {mostrada ? <span className="text-ink-2 whitespace-pre-wrap break-words">{mostrada}</span> : <>
          <span className="text-muted group-hover:hidden group-focus-visible:hidden">—</span>
          <span className="text-muted italic hidden group-hover:inline group-focus-visible:inline">adicionar observação</span>
        </>}
        {gravando !== null ? <Spinner className="shrink-0 !w-3.5 !h-3.5" /> : <Pencil size={12} className="shrink-0 text-muted opacity-0 group-hover:opacity-100" />}
      </button>
      {erro && <div className="text-[12px] text-bad mt-0.5">{erro}</div>}
    </div>
  );
}
