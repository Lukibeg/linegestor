/**
 * O botão "Envio diário" (Patch 1.7): um ícone discreto (o aviãozinho; cheio e azul quando marcado,
 * pedido do Luan em 04/10: "mais singelo") que marca um gráfico dos Chamados ou um relatório para ir no PDF
 * que sai todo dia pelo WhatsApp. Só aparece para quem administra (a marcação vale para a equipe
 * toda e vai para a auditoria), e some na própria página do PDF e na impressão.
 */
import { createContext, useContext, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Send } from 'lucide-react';
import { RELATORIOS_DO_ENVIO } from '@gestor/shared';
import { api } from '../api/index.js';
import { mensagemErro, useToast } from '../components/ui/index.js';
import { useAuth } from './auth.js';

const Mostrar = createContext(true);
/** Dentro dela, o botão não aparece (a página do PDF). */
export function SemBotaoDeEnvio({ children }: { children: ReactNode }) {
  return <Mostrar.Provider value={false}>{children}</Mostrar.Provider>;
}

export function BotaoEnvio({ tipo, id, titulo }: { tipo: 'relatorio' | 'grafico'; id: string; titulo: string }) {
  const mostrar = useContext(Mostrar);
  const { can } = useAuth();
  const pode = mostrar && can('admin.manage') && (tipo === 'grafico' || RELATORIOS_DO_ENVIO.includes(id));
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({ queryKey: ['envio', 'marcados'], queryFn: () => api.envio.marcados(), enabled: pode, staleTime: 60_000 });
  const salvar = useMutation({
    mutationFn: (m: { relatorios: string[]; graficos: string[] }) => api.envio.salvarMarcados(m),
    onSuccess: (m) => {
      qc.setQueryData(['envio', 'marcados'], m);
      void qc.invalidateQueries({ queryKey: ['envio', 'ajustes'] });
      const agora = (tipo === 'relatorio' ? m.relatorios : m.graficos).includes(id);
      toast.push('ok', agora
        ? `"${titulo}" vai no PDF do envio diário. Os números e o horário ficam em Administração › Envio automático.`
        : `"${titulo}" saiu do envio diário.`);
    },
    onError: (e) => toast.push('erro', mensagemErro(e)),
  });
  if (!pode || !q.data) return null;
  const m = q.data;
  const lista = tipo === 'relatorio' ? m.relatorios : m.graficos;
  const marcado = lista.includes(id);
  const alternar = () => {
    const nova = marcado ? lista.filter((x) => x !== id) : [...lista, id];
    salvar.mutate(tipo === 'relatorio' ? { relatorios: nova, graficos: m.graficos } : { relatorios: m.relatorios, graficos: nova });
  };
  return (
    <button
      type="button" onClick={alternar} disabled={salvar.isPending} aria-pressed={marcado}
      title={marcado ? 'Envio diário: vai no PDF que sai todo dia pelo WhatsApp — clique para tirar' : 'Envio diário: clique para pôr no PDF que sai todo dia pelo WhatsApp'}
      aria-label={`${titulo}: ${marcado ? 'tirar do envio diário' : 'pôr no envio diário'}`}
      className={`so-tela shrink-0 p-1 rounded-md transition-colors disabled:opacity-50 ${marcado ? 'text-accent' : 'text-muted opacity-60 hover:opacity-100 hover:text-ink'}`}
    >
      <Send size={15} className={marcado ? 'fill-current' : ''} />
    </button>
  );
}
