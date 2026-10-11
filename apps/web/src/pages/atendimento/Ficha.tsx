/**
 * A ficha do chamado (Patch 1.10, decisão 0047) — /atendimento/SUP-12. É onde o chamado é trabalhado.
 *
 *  - em cima, o cabeçalho (o caminho de volta, o código na cor do painel, a etapa, a prioridade, o
 *    título que se edita ali mesmo, quem abriu e de onde) e a barra de ações;
 *  - na coluna larga, os textos (o relato do cliente, a descrição, a solução e a causa — no problema,
 *    a causa raiz, o contorno e a validação), os incidentes do problema, o checklist, os filhos e as
 *    ligações (com o desenho) e a linha do tempo (tudo, anotações, histórico, trajetória);
 *  - na coluna do lado, a empresa e o contato em destaque (o pedido do Eider e do Luan), a
 *    classificação, o responsável, os prazos, a operadora e o tempo gasto.
 *
 * No celular é uma coluna só, com a empresa e a barra de ações primeiro. Toda ação chama a API, que
 * devolve a ficha inteira: `useDepoisDeMudar` põe a ficha nova no lugar e relê o quadro, a lista e o
 * Meu dia. Quem só lê (o Leitor) vê tudo, sem os botões de mudar.
 */
import { useEffect, useMemo } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { RotateCcw } from 'lucide-react';
import { lerCodigo } from '@gestor/shared';
import { api } from '../../api/index.js';
import { ApiError } from '../../api/types.js';
import { Carregando, Vazio, mensagemErro } from '../../components/ui/index.js';
import { useAuth } from '../../lib/auth.js';
import { paraALista } from '../../lib/voltar.js';
import { chaveDaFicha, painelDe, useFicha, useOpcoes } from './comum.js';
import { useMover } from './mover.js';
import { FichaAberta, proximaEtapa, type Aberta } from './ficha/base.js';
import { Cabecalho } from './ficha/Cabecalho.js';
import { BarraDeAcoes } from './ficha/Acoes.js';
import { AvisoDoQueFalta, Textos } from './ficha/Textos.js';
import { Checklist, Incidentes } from './ficha/Partes.js';
import { Ligacoes } from './ficha/Ligacoes.js';
import { LinhaDoTempo } from './ficha/LinhaDoTempo.js';
import { Empresa } from './ficha/Empresa.js';
import { Classificacao, Responsavel } from './ficha/Classificacao.js';
import { Prazos } from './ficha/Prazos.js';
import { Operadora } from './ficha/Operadora.js';
import { Tempo } from './ficha/Tempo.js';

/**
 * A rota. O código escrito de qualquer jeito (sup-12, SUP 12) vira o do sistema; ir de um chamado
 * para outro (o link no texto, o nó do desenho) usa a mesma rota, e a chave faz a ficha começar do
 * zero (nenhuma caixa aberta, a aba Tudo).
 */
export function FichaDoChamado() {
  const { codigo = '' } = useParams();
  const lido = lerCodigo(codigo);
  const referencia = lido ? `${lido.sigla}-${lido.numero}` : codigo;
  return <Ficha key={referencia} referencia={referencia} />;
}

function Ficha({ referencia }: { referencia: string }) {
  const opcoes = useOpcoes();
  const q = useFicha(referencia);
  const f = q.data;
  const { user } = useAuth();
  const mover = useMover();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const clienteId = f?.cliente?.id ?? null;
  const cadastro = useQuery({
    queryKey: ['atendimento', 'cadastro', clienteId],
    queryFn: () => api.atendimento.cadastroDoCliente(clienteId!),
    enabled: !!clienteId,
    staleTime: 60_000,
  });

  // a aba do navegador diz qual chamado é (várias fichas abertas ao mesmo tempo)
  useEffect(() => {
    if (!f) return;
    const antes = document.title;
    document.title = `${f.codigo} · ${f.titulo}`;
    return () => { document.title = antes; };
  }, [f?.codigo, f?.titulo]);

  // aberto pelo id (um link antigo, um aviso): o endereço passa a ser o do código
  useEffect(() => {
    if (f && referencia !== f.codigo && !lerCodigo(referencia)) {
      qc.setQueryData(chaveDaFicha(f.codigo), f);
      navigate(`/atendimento/${encodeURIComponent(f.codigo)}`, { replace: true });
    }
  }, [f, referencia, navigate, qc]);

  const aberta = useMemo<Aberta | null>(() => {
    if (!f || !opcoes.data) return null;
    const painel = painelDe(opcoes.data, f.painelId);
    const etapa = painel?.etapas.find((e) => e.id === f.etapaId);
    const proxima = painel ? proximaEtapa(painel.etapas, f.etapaId) : null;
    return {
      f, opcoes: opcoes.data, painel, etapa,
      pode: f.pode.trabalhar, cuida: f.pode.cuidar,
      eu: user ? { id: user.id, nome: user.name } : null,
      mover, cadastro: cadastro.data,
      // o que falta preencher só se destaca para quem pode preencher
      proxima, faltando: new Set<string>(proxima && f.pode.trabalhar ? f.faltam[proxima.id] ?? [] : []),
      recarregar: () => { void qc.invalidateQueries({ queryKey: chaveDaFicha(f.codigo) }); },
    };
  }, [f, opcoes.data, user, mover, cadastro.data, qc]);

  if (q.isLoading || opcoes.isLoading) return <Carregando texto="Abrindo o chamado…" />;
  if (q.isError || !f) return <NaoAbriu codigo={referencia} erro={q.error} tentar={() => void q.refetch()} />;
  if (opcoes.isError || !aberta) return <NaoAbriu codigo={referencia} erro={opcoes.error} tentar={() => void opcoes.refetch()} />;

  return (
    <FichaAberta value={aberta}>
      <div className="flex flex-col gap-4 min-w-0">
        <Cabecalho />
        {aberta.pode && <BarraDeAcoes />}
        <div className="grid grid-cols-1 gap-4 items-start lg:grid-cols-[minmax(0,1fr)_360px] lg:grid-rows-[auto_1fr]">
          {/* no celular a empresa vem antes de tudo; no computador, no alto da coluna do lado */}
          <div className="min-w-0 lg:col-start-2 lg:row-start-1">
            <Empresa />
          </div>
          <div className="min-w-0 flex flex-col gap-4 lg:col-start-1 lg:row-start-1 lg:row-span-2">
            <AvisoDoQueFalta />
            <Textos />
            <Incidentes />
            <Checklist />
            <Ligacoes />
            <LinhaDoTempo />
          </div>
          <div className="min-w-0 flex flex-col gap-4 lg:col-start-2 lg:row-start-2">
            <Classificacao />
            <Responsavel />
            <Prazos />
            <Operadora />
            <Tempo />
          </div>
        </div>
      </div>
      {mover.janelas}
    </FichaAberta>
  );
}

/** O chamado não abriu: não existe (ou é de um painel que a pessoa não vê, ou foi para a lixeira), ou deu erro. */
function NaoAbriu({ codigo, erro, tentar }: { codigo: string; erro: unknown; tentar: () => void }) {
  const naoExiste = erro instanceof ApiError && erro.status === 404;
  const voltar = <Link to={paraALista('/atendimento/lista')} className="btn-secondary">Voltar para a lista de chamados</Link>;
  if (naoExiste) {
    return (
      <div className="max-w-xl mx-auto mt-8">
        <Vazio titulo="Chamado não encontrado"
          texto={`Não achei o ${codigo}. O código pode estar errado, o chamado pode ter ido para a lixeira, ou ele é de um painel que você não vê.`}
          acao={<div className="flex flex-wrap justify-center gap-2">{voltar}<Link to="/atendimento" className="btn-ghost">Ver os painéis</Link></div>} />
      </div>
    );
  }
  return (
    <div className="max-w-xl mx-auto mt-8">
      <Vazio titulo={`Não deu para abrir o ${codigo}`} texto={mensagemErro(erro)}
        acao={<div className="flex flex-wrap justify-center gap-2"><button type="button" className="btn-primary" onClick={tentar}><RotateCcw size={15} /> Tentar de novo</button>{voltar}</div>} />
    </div>
  );
}
