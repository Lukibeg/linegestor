/**
 * Chamados › Ajustes (Patch 1.10) — Etiquetas: as mesmas em todos os painéis, cada uma com a cor dela
 * (o pedido do Luan na prévia: "na hora de criar as etiquetas, seria legal poder escolher a cor também").
 *
 * A etiqueta nasce no chamado (no Abrir chamado e na ficha, com a cor escolhida ali; a do robô, da IA e
 * da resposta pronta nasce cinza) ou aqui. Aqui se edita — o nome e a cor (o pedido do Luan: "parecido com
 * o Helena"), que valem em todos os chamados que a têm — e se tira das sugestões a que nenhum chamado usa
 * (a escrita errada, a que caiu em desuso). O mesmo editar mora no seletor de etiquetas, no lápis.
 */
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, Search, Tags, Trash2 } from 'lucide-react';
import { chaveDaEtiqueta, paraBusca, type CorEtiqueta, type EtiquetaDoCatalogo } from '@gestor/shared';
import { api } from '../../../api/index.js';
import { Carregando, Confirmar, Modal, Spinner, mensagemErro } from '../../../components/ui/index.js';
import { ChipDaEtiqueta, CoresDaEtiqueta } from '../comum.js';
import { EditorDeEtiqueta } from '../SeletorDeEtiquetas.js';
import { CartaoAjuste, Explicacao, erroLegivel } from './Avisos.js';

const CHAVE = ['atendimento', 'ajustes', 'etiquetas'];

export function AjustesEtiquetas() {
  const q = useQuery({ queryKey: CHAVE, queryFn: () => api.atendimento.etiquetas() });
  const qc = useQueryClient();
  // o nome e a cor novos aparecem nos cartões, nas fichas e no Abrir chamado (as opções e os chamados do módulo)
  const recarregar = () => qc.invalidateQueries({ queryKey: ['atendimento'] });

  const [nome, setNome] = useState('');
  const [cor, setCor] = useState<CorEtiqueta>('neutral');
  const [criando, setCriando] = useState(false);
  const [erro, setErro] = useState('');
  const [editando, setEditando] = useState<EtiquetaDoCatalogo | null>(null);
  const [erros, setErros] = useState<Record<string, string>>({});
  const [tirar, setTirar] = useState<EtiquetaDoCatalogo | null>(null);
  const [tirando, setTirando] = useState(false);
  const [busca, setBusca] = useState('');

  if (q.isLoading) return <Carregando />;
  if (q.isError) return <p className="text-bad text-sm" role="alert">{mensagemErro(q.error)}</p>;
  const lista = q.data ?? [];
  const b = paraBusca(busca);
  const visiveis = b ? lista.filter((e) => paraBusca(e.nome).includes(b)) : lista;
  const escrito = nome.trim();
  const igual = escrito ? lista.find((e) => chaveDaEtiqueta(e.nome) === chaveDaEtiqueta(escrito)) : undefined;

  const criar = async () => {
    if (!escrito || igual) return;
    setCriando(true); setErro('');
    try {
      await api.atendimento.criarEtiqueta({ nome: escrito, cor });
      await recarregar();
      setNome(''); setCor('neutral');
    } catch (e) { setErro(erroLegivel(e)); } finally { setCriando(false); }
  };
  const confirmarTirar = async () => {
    if (!tirar) return;
    setTirando(true);
    try {
      await api.atendimento.removerEtiqueta(tirar.id);
      await recarregar();
      setTirar(null);
    } catch (x) { setErros((y) => ({ ...y, [tirar.id]: erroLegivel(x) })); setTirar(null); } finally { setTirando(false); }
  };

  return (
    <div className="flex flex-col gap-4 max-w-4xl">
      <CartaoAjuste icone={<Tags size={18} />} titulo="Etiquetas" id="ajustes-etiquetas"
        situacao={lista.length > 0 && <span className="text-[12.5px] text-muted tnum">{lista.length} {lista.length === 1 ? 'etiqueta' : 'etiquetas'}</span>}>
        <Explicacao>
          <p>
            As etiquetas são as mesmas em todos os painéis, cada uma com a cor dela. Quem trabalha nos chamados cria uma nova no Abrir
            chamado ou na ficha, já escolhendo a cor (a que chega pelo robô, pela IA ou por uma resposta pronta nasce cinza). Aqui se edita o
            nome e a cor — valem em todos os chamados que a têm e nas respostas prontas que a põem — e se tira das sugestões a que nenhum
            chamado usa. O mesmo editar está no lápis da lista de etiquetas, no Abrir chamado e na ficha.
          </p>
        </Explicacao>

        <form className="flex flex-wrap items-end gap-x-3 gap-y-2" autoComplete="off" id="etiquetas-nova" onSubmit={(e) => { e.preventDefault(); void criar(); }}>
          <div className="min-w-0 flex-1 basis-56">
            <label className="label" htmlFor="etiqueta-nome">Nova etiqueta</label>
            <input className="input" id="etiqueta-nome" maxLength={40} value={nome} placeholder="Ex.: Cliente VIP" onChange={(e) => { setNome(e.target.value); setErro(''); }} />
          </div>
          <div>
            <div className="label" id="etiqueta-cor-rotulo">A cor</div>
            <CoresDaEtiqueta valor={cor} onChange={setCor} id="etiqueta-cor" rotulo="A cor da etiqueta nova" />
          </div>
          <button type="submit" className="btn-primary" id="etiqueta-criar" disabled={!escrito || !!igual || criando}>
            {criando ? <Spinner className="text-white" /> : <Plus size={15} />} Criar
          </button>
        </form>
        {igual && <p className="text-[12.5px] text-muted mt-1.5">A etiqueta <b className="text-ink-2">{igual.nome}</b> já existe: edite a cor dela na lista.</p>}
        {erro && <p className="text-bad text-[13px] mt-1.5" role="alert">{erro}</p>}

        {!lista.length ? (
          <div className="rounded-xl border border-dashed border-line-strong p-6 text-center mt-4" id="etiquetas-vazio">
            <div className="font-display font-semibold">Nenhuma etiqueta ainda</div>
            <p className="text-muted text-sm mt-1 max-w-md mx-auto">Elas nascem nos chamados, ou aqui em cima.</p>
          </div>
        ) : (
          <div className="mt-4 flex flex-col gap-2">
            {lista.length > 10 && (
              <label className="relative block max-w-xs">
                <Search size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" aria-hidden />
                <input className="input pl-8" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Procurar etiqueta…" aria-label="Procurar etiqueta" id="etiquetas-busca" />
              </label>
            )}
            {!visiveis.length ? <p className="text-[13px] text-muted">Nenhuma etiqueta com esse nome.</p> : (
              <ul className="rounded-xl border border-line divide-y divide-line" id="etiquetas-lista">
                {visiveis.map((e) => (
                  <li key={e.id} data-etiqueta={e.nome} className="px-3 py-2 flex flex-wrap items-center gap-x-4 gap-y-1.5">
                    <div className="min-w-0 flex-1 basis-48 flex flex-wrap items-center gap-x-2 gap-y-1">
                      <ChipDaEtiqueta nome={e.nome} cor={e.cor} />
                      <span className="text-[12.5px] text-muted tnum">{e.chamados ? `${e.chamados} ${e.chamados === 1 ? 'chamado' : 'chamados'}` : 'nenhum chamado'}</span>
                    </div>
                    <button type="button" className="btn-secondary btn-sm" onClick={() => { setErros(({ [e.id]: _, ...resto }) => resto); setEditando(e); }} aria-label={`Editar a etiqueta ${e.nome}`}>
                      <Pencil size={14} /> Editar
                    </button>
                    <div className="w-[76px] flex justify-end">
                      {!e.chamados && (
                        <button type="button" className="btn-ghost btn-sm text-bad" onClick={() => setTirar(e)} aria-label={`Tirar a etiqueta ${e.nome} das sugestões`}>
                          <Trash2 size={14} /> Tirar
                        </button>
                      )}
                    </div>
                    {erros[e.id] && <p className="w-full text-bad text-[12.5px]" role="alert">{erros[e.id]}</p>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </CartaoAjuste>
      {editando && (
        <Modal open onClose={() => setEditando(null)} titulo={`Editar a etiqueta ${editando.nome}`}>
          <EditorDeEtiqueta naJanela titulo="Editar a etiqueta" botao="Salvar" inicial={{ nome: editando.nome, cor: editando.cor }}
            nomesOcupados={lista.filter((x) => x.id !== editando.id).map((x) => x.nome)}
            dica={!editando.chamados ? 'Nenhum chamado tem a etiqueta ainda.'
              : editando.chamados === 1 ? 'O nome e a cor valem no chamado que tem a etiqueta.' : `O nome e a cor valem nos ${editando.chamados} chamados que têm a etiqueta.`}
            onVoltar={() => setEditando(null)}
            onSalvar={async (d) => { await api.atendimento.editarEtiqueta(editando.id, d); await recarregar(); setEditando(null); }} />
        </Modal>
      )}
      <Confirmar open={!!tirar} onClose={() => setTirar(null)} onConfirm={() => void confirmarTirar()} loading={tirando} perigoso botao="Tirar"
        titulo={`Tirar a etiqueta ${tirar?.nome ?? ''}?`}
        texto={<>Nenhum chamado usa esta etiqueta. Ela sai das sugestões; se alguém escrever o mesmo nome de novo, ela volta (cinza, ou com a cor escolhida).</>} />
    </div>
  );
}
