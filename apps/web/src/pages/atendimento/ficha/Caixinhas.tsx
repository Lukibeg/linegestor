/**
 * As caixinhas (2.3, a implantação): a lista do que já foi feito (a configuração, os testes) e os módulos do produto que
 * o cliente vai usar. Cada caixinha marcada mostra quem marcou e quando. Marcar grava na hora; os cliques seguidos vão um
 * depois do outro (a caixinha muda na tela antes, e volta se o servidor recusar).
 */
import { useMemo, useRef, useState } from 'react';
import { Check } from 'lucide-react';
import type { CampoPersonalizado } from '@gestor/shared';
import { api } from '../../../api/index.js';
import { Spinner } from '../../../components/ui/index.js';
import { ErroPerto, MarcaFalta, useAberta, useAcao } from './base.js';
import { dataCompleta, emQuando } from './Cabecalho.js';

const comoLista = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);

export function Caixinhas({ c, comTitulo = true }: { c: CampoPersonalizado; comTitulo?: boolean }) {
  const { f, pode, opcoes: doModulo } = useAberta();
  // quem marcou: a pessoa (pelo id) ou a integração (pelo nome guardado)
  const quem = (m: { porId: string | null; porNome: string | null }) => (m.porId ? doModulo.pessoas.find((p) => p.id === m.porId)?.nome ?? 'alguém que saiu' : m.porNome ?? 'uma integração');
  const acao = useAcao();
  const doServidor = useMemo(() => comoLista(f.campos[c.id]), [f.campos, c.id]);
  // o que está na tela enquanto os cliques vão para o servidor (nulo: o que o servidor tem)
  const [naTela, setNaTela] = useState<string[] | null>(null);
  const indo = useRef(false);
  const depois = useRef<string[] | null>(null);
  const marcados = naTela ?? doServidor;
  const marcas = f.marcas[c.id] ?? {};
  // as ativas e as desativadas que ficaram marcadas (o módulo que foi para a lixeira, por exemplo)
  const opcoes = c.opcoes.filter((o) => o.ativa || marcados.includes(o.id));

  const enviar = async (ids: string[]) => {
    if (indo.current) { depois.current = ids; return; }
    indo.current = true;
    let vez: string[] | null = ids;
    while (vez) {
      const agora: string[] = vez;
      const r = await acao.rodar(() => api.atendimento.alterar(f.id, { campos: { [c.id]: agora.length ? agora : null } }));
      vez = r.ok ? depois.current : null;
      depois.current = null;
    }
    indo.current = false;
    setNaTela(null);
  };
  const trocar = (id: string) => {
    const marcar = !marcados.includes(id);
    // na ordem das opções (o histórico e a conta leem assim)
    const ids = c.opcoes.map((o) => o.id).filter((x) => (x === id ? marcar : marcados.includes(x)));
    setNaTela(ids);
    void enviar(ids);
  };

  const feitos = opcoes.filter((o) => marcados.includes(o.id)).length;
  return (
    <div id={`campo-c-${c.id}`} className="min-w-0 scroll-mt-24">
      {comTitulo && (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mb-1.5">
          <h3 className="font-display font-semibold text-[14.5px]">{c.nome}</h3>
          {c.tipo === 'caixinhas' && opcoes.length > 0 && <span className="text-[12px] text-muted">{feitos} de {opcoes.length}</span>}
          <MarcaFalta campo={`campo:${c.id}`} />
          {acao.ocupado && <Spinner className="!w-3.5 !h-3.5" />}
        </div>
      )}
      {c.dica && <p className="text-[12px] text-muted -mt-0.5 mb-2">{c.dica}</p>}
      {!opcoes.length ? (
        <p className="text-[13px] text-muted italic">
          {c.tipo === 'modulos' ? 'O produto ainda não tem módulos no catálogo (Administração › Produtos).' : 'Nenhuma caixinha: as opções são criadas em Painéis › Ajustes › Campos.'}
        </p>
      ) : (
        <ul className={c.tipo === 'modulos' ? 'grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-0.5' : 'flex flex-col gap-0.5'}>
          {opcoes.map((o) => {
            const marcado = marcados.includes(o.id);
            const m = marcas[o.id];
            return (
              <li key={o.id}>
                <label className={`flex items-start gap-2.5 rounded-md px-1.5 py-1 -mx-1.5 ${pode ? 'cursor-pointer hover:bg-surface-2' : ''}`}>
                  <input type="checkbox" className="sr-only peer" checked={marcado} disabled={!pode} onChange={() => trocar(o.id)} />
                  <span aria-hidden className={`mt-[2px] grid place-items-center w-[17px] h-[17px] rounded-[5px] border shrink-0 peer-focus-visible:ring-2 peer-focus-visible:ring-accent transition-colors ${
                    marcado ? 'bg-ok border-ok text-white' : 'border-line-strong bg-surface'}`}>
                    {marcado && <Check size={12} strokeWidth={3} />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className={`text-[13.5px] leading-snug ${marcado && c.tipo === 'caixinhas' ? 'text-ink-2' : 'text-ink'}`}>
                      {o.nome}{!o.ativa && <span className="text-muted"> (desativada)</span>}
                    </span>
                    {marcado && m && (
                      <span className="block text-[11.5px] text-muted leading-tight mt-0.5" title={dataCompleta(m.em)}>
                        {quem(m)} · {emQuando(m.em)}
                      </span>
                    )}
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      )}
      <ErroPerto erro={acao.erro} />
    </div>
  );
}
