/**
 * OS RELATÓRIOS DE UM PAINEL DE CHAMADOS (Patch 2.0.5, decisão 0055) — o módulo novo de relatórios, sobre os
 * chamados do Gestor. O pedido do Luan (22/10): sair do Helena como CRM e "fazer um novo módulo [de
 * relatórios], mesmo que seja parecido… por conta dos tipos de assuntos"; o antigo fica como **Legado do
 * Helena** (Suporte › Legado do Helena, a tela de `/chamados`), para consulta, com os assuntos de lá.
 *
 * É a vista **Relatórios** do painel (Quadro · Lista · Relatórios), de qualquer painel de Gestão: o Suporte, o
 * Desenvolvimento, o Administrativo. Os 25 relatórios em seis abas (Tempo, Volume, Assuntos, Clientes, Equipe
 * e Mês) e a aba **Favoritos**, na arrumação que quem cuida dos chamados escolhe em **Organizar** — por painel,
 * a mesma para a equipe toda. Os do Helena viraram estes, com o que muda: o tempo em horas úteis, o Resolvido
 * no lugar do Fechado, a escada até o DEV com o motivo de cada subida, a árvore de assuntos no lugar dos grupos
 * montados à mão; e cinco novos (Esperando a operadora, Os assuntos, Onde está a gravidade, Os problemas e o
 * Tempo gasto).
 *
 * O período e os filtros ficam no endereço (dá para mandar o link do jeito que está). Clicar num número mostra
 * os chamados por trás dele (a lista vem junto: é a mesma conta). As contas moram no `@gestor/shared`
 * (`atendimento-relatorios.ts`): o servidor e a prévia contam igual.
 */
import { Fragment, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowDown, ArrowDownUp, ArrowUp, Building2, CalendarCheck, CalendarRange, Eye, EyeOff, Filter, History, LayoutGrid, Star, Tags, Timer, Users,
} from 'lucide-react';
import {
  ABAS_DOS_RELATORIOS, CATALOGO_DOS_RELATORIOS, GRAVIDADES, ITEM_DO_CATALOGO, NAO_VALE_PORQUE, NOME_DA_ABA, NOME_DO_NIVEL, NOME_GRAVIDADE, NOME_PRIORIDADE, PRIORIDADES,
  arrumacaoCompleta, atalhosDosRelatorios, campoLigado, etiquetasDoPainel,
  type AbaDosRelatorios, type ArrumacaoDosRelatorios, type ArrumacaoDosRelatoriosLida, type Nivel, type OpcoesAtendimento, type Painel, type ParetoDoPainel,
  type RelatoriosDoPainel, type SepararORelogio,
} from '@gestor/shared';
import { api } from '../../../api/index.js';
import { Carregando, Chip, EscolherComBusca, mensagemErro, useToast, Vazio } from '../../../components/ui/index.js';
import { data } from '../../../lib/format.js';
import { usePode } from '../comum.js';
import { CabecalhoDoPainel } from '../painel.js';
import { PAINEL_DO_SUPORTE } from '../Suporte.js';
import {
  CAIXA_FILTRO, FiltrosEscritos, RESPONSAVEL_NINGUEM, SelectFiltro, nomeDoAssunto, opcoesDeAssunto, useClientesParaFiltro, useFiltrosNoEndereco, type FiltroEscrito,
} from '../quadro/filtros.js';
import { JanelaDosChamados, type Aberta } from './pecas.js';
import { Empaca, Escada, Operadora, Prazo, PrioridadeFaz, Relogio, Resposta } from './tempo.js';
import { Calor, Curva, Fila, Idade, Previsao } from './volume.js';
import { Arvore, Gravidade, Pareto, Problemas, Sobe } from './assuntos.js';
import { Falha, RaioX, Tamanho, Voltou } from './clientes.js';
import { Equipe, Preenchido, TempoGasto } from './equipe.js';
import { Fechamento } from './mes.js';

type Aba = 'favoritos' | AbaDosRelatorios;
type Arrumacao = ArrumacaoDosRelatorios;

const ICONE_DA_ABA: Record<Aba, typeof Timer> = { favoritos: Star, tempo: Timer, volume: ArrowDownUp, assuntos: Tags, clientes: Building2, equipe: Users, mes: CalendarCheck };
/** Os filtros de valor (recortam os chamados) — os mesmos nomes do endereço e do servidor. */
const FILTROS = ['assunto', 'tipo', 'gravidade', 'prioridade', 'nivel', 'responsavel', 'cliente', 'produto', 'operadora', 'etiqueta', 'campo'] as const;
/** Os que ficam no endereço e vão para o servidor (o período, os filtros e as escolhas dos relatórios). */
const NO_ENDERECO = ['de', 'ate', ...FILTROS, 'separar', 'pareto', 'nivelSobe', 'mes', 'raiox'] as const;

/** Os relatórios de uma aba, na ordem da arrumação, sem os escondidos e sem os que não valem para o painel. */
function daAba(aba: Aba, a: Arrumacao, aplicaveis: readonly string[]): string[] {
  const vale = (id: string) => !a.ocultos.includes(id) && aplicaveis.includes(id);
  if (aba === 'favoritos') return a.favoritos.filter(vale);
  return a.ordem.filter((id) => ITEM_DO_CATALOGO.get(id)?.aba === aba && vale(id));
}

export function RelatoriosDoPainelDeChamados({ painel, opcoes }: { painel: Painel; opcoes: OpcoesAtendimento }) {
  const { valor, mudar } = useFiltrosNoEndereco();
  const pode = usePode();
  const qc = useQueryClient();
  const toast = useToast();
  const clientes = useClientesParaFiltro();
  const usa = (c: Parameters<typeof campoLigado>[1]) => campoLigado(painel.ajustes, c);
  const [aberta, setAberta] = useState<Aberta | null>(null);
  const [filtrosAbertos, setFiltrosAbertos] = useState(() => FILTROS.some((k) => !!valor(k)));

  // o pedido: tudo o que está no endereço (o "por" do 80/20 e o "separar" do relógio caem num que o painel usa)
  const pedido = useMemo(() => {
    const q: Record<string, string> = { painel: painel.id };
    for (const k of NO_ENDERECO) if (valor(k)) q[k] = valor(k);
    if (!q.pareto && !usa('assunto')) q.pareto = 'tipo';
    if (!q.separar && !usa('assunto')) q.separar = 'prioridade';
    return q;
  }, [painel.id, painel.ajustes, valor]);
  const rel = useQuery({
    queryKey: ['atendimento', 'relatorios', JSON.stringify(pedido)],
    queryFn: () => api.atendimento.relatorios(pedido as never),
    placeholderData: keepPreviousData,
    refetchInterval: 5 * 60_000,
  });
  const arrumacao = useQuery({ queryKey: ['atendimento', 'relatorios-arrumacao', painel.id], queryFn: () => api.atendimento.arrumacaoDosRelatorios(painel.id), refetchInterval: 5 * 60_000 });
  const r = rel.data?.painel.id === painel.id ? rel.data : undefined;

  // ---- a arrumação (da equipe) e o rascunho do Organizar
  const salvo: Arrumacao = useMemo(() => {
    const a = arrumacao.data ?? arrumacaoCompleta(null);
    return { ordem: a.ordem, ocultos: a.ocultos, favoritos: a.favoritos, campoDaFalha: a.campoDaFalha };
  }, [arrumacao.data]);
  const [rascunho, setRascunho] = useState<Arrumacao | null>(null);
  const organizando = rascunho !== null;
  const atual = rascunho ?? salvo;
  const mudou = organizando && JSON.stringify(rascunho) !== JSON.stringify(salvo);
  const aplicaveis = r?.aplicaveis ?? CATALOGO_DOS_RELATORIOS.map((c) => c.id);
  const ultimaArrumacao = arrumacao.data?.atualizadoEm
    ? `Última arrumação: ${arrumacao.data.atualizadoPor ?? 'alguém da equipe'}, ${data(arrumacao.data.atualizadoEm, true)}.`
    : 'Os relatórios estão na arrumação de fábrica.';
  const salvar = useMutation({
    mutationFn: (a: Arrumacao) => api.atendimento.salvarArrumacaoDosRelatorios(painel.id, a),
    onSuccess: (a: ArrumacaoDosRelatoriosLida) => {
      qc.setQueryData(['atendimento', 'relatorios-arrumacao', painel.id], a);
      void qc.invalidateQueries({ queryKey: ['atendimento', 'relatorios'] });
      setRascunho(null);
      toast.push('ok', 'Arrumação salva: a equipe toda vê os Relatórios deste painel assim.');
    },
    onError: (e) => toast.push('erro', mensagemErro(e)),
  });

  // a aba: a do endereço; sem ela, os Favoritos (se tiver algum) ou o Tempo
  const pedida = valor('aba');
  const aba: Aba = pedida === 'favoritos' || (ABAS_DOS_RELATORIOS as readonly string[]).includes(pedida)
    ? (pedida as Aba)
    : daAba('favoritos', salvo, aplicaveis).length ? 'favoritos' : 'tempo';
  const irPara = (a: Aba) => mudar({ aba: a }, true);

  /** Sobe ou desce um relatório: dentro da aba dele, ou dentro dos Favoritos. */
  const mover = (id: string, passo: -1 | 1) => setRascunho((x) => {
    if (!x) return x;
    if (aba === 'favoritos') {
      const i = x.favoritos.indexOf(id); const j = i + passo;
      if (i < 0 || j < 0 || j >= x.favoritos.length) return x;
      const f = [...x.favoritos]; [f[i], f[j]] = [f[j]!, f[i]!];
      return { ...x, favoritos: f };
    }
    const daMesma = x.ordem.filter((y) => ITEM_DO_CATALOGO.get(y)?.aba === aba);
    const i = daMesma.indexOf(id); const j = i + passo;
    if (i < 0 || j < 0 || j >= daMesma.length) return x;
    const outro = daMesma[j]!;
    return { ...x, ordem: x.ordem.map((y) => (y === id ? outro : y === outro ? id : y)) };
  });
  const estrela = (id: string) => setRascunho((x) => (!x ? x : x.favoritos.includes(id)
    ? { ...x, favoritos: x.favoritos.filter((y) => y !== id) }
    : { ...x, favoritos: [...x.favoritos, id], ocultos: x.ocultos.filter((y) => y !== id) }));
  const esconder = (id: string) => setRascunho((x) => (!x ? x : x.ocultos.includes(id)
    ? { ...x, ocultos: x.ocultos.filter((y) => y !== id) }
    : { ...x, ocultos: [...x.ocultos, id], favoritos: x.favoritos.filter((y) => y !== id) }));

  // ---- o período
  const atalhos = useMemo(() => atalhosDosRelatorios(new Date(), r?.primeiroDia ?? null), [r?.primeiroDia]);
  const de = r?.periodo.de ?? valor('de');
  const ate = r?.periodo.ate ?? valor('ate');
  const atalho = atalhos.find((a) => a.de === de && a.ate === ate)?.id ?? null;
  const naAba = daAba(aba, salvo, aplicaveis);
  const comPeriodo = !naAba.length || naAba.some((id) => id !== 'fechamento');

  // ---- os filtros escritos
  const pessoas = opcoes.pessoas.filter((p) => p.ativo);
  const camposDeLista = opcoes.campos.filter((c) => c.painelId === painel.id && c.ativo && (c.tipo === 'lista' || c.tipo === 'lista_varios'));
  const niveis = [...new Set(painel.etapas.map((e) => e.nivel).filter((n): n is Nivel => n !== null))].sort();
  const etiquetas = etiquetasDoPainel(opcoes.etiquetas, painel.id);
  const assuntos = usa('assunto') ? opcoesDeAssunto(opcoes, painel.id) : [];
  const tirar = (k: string) => () => mudar({ [k]: null }, true);
  const escritos: FiltroEscrito[] = [];
  if (valor('assunto')) escritos.push({ chave: 'assunto', nome: 'Assunto', valor: nomeDoAssunto(valor('assunto'), opcoes), tirar: tirar('assunto') });
  if (valor('tipo')) escritos.push({ chave: 'tipo', nome: 'Tipo', valor: valor('tipo'), tirar: tirar('tipo') });
  if (valor('gravidade')) escritos.push({ chave: 'gravidade', nome: 'Gravidade', valor: NOME_GRAVIDADE[valor('gravidade') as keyof typeof NOME_GRAVIDADE] ?? valor('gravidade'), tirar: tirar('gravidade') });
  if (valor('prioridade')) escritos.push({ chave: 'prioridade', nome: 'Prioridade', valor: valor('prioridade') === 'sem' ? 'sem prioridade' : NOME_PRIORIDADE[valor('prioridade') as keyof typeof NOME_PRIORIDADE] ?? valor('prioridade'), tirar: tirar('prioridade') });
  if (valor('nivel')) escritos.push({ chave: 'nivel', nome: 'Subiu até', valor: NOME_DO_NIVEL[Number(valor('nivel')) as Nivel] ?? valor('nivel'), tirar: tirar('nivel') });
  if (valor('responsavel')) escritos.push({ chave: 'responsavel', nome: 'Responsável', valor: valor('responsavel') === RESPONSAVEL_NINGUEM ? 'sem dono' : opcoes.pessoas.find((p) => p.id === valor('responsavel'))?.nome ?? 'uma pessoa que saiu', tirar: tirar('responsavel') });
  if (valor('cliente')) escritos.push({ chave: 'cliente', nome: 'Cliente', valor: clientes.find((c) => c.id === valor('cliente'))?.nome ?? '…', tirar: tirar('cliente') });
  if (valor('produto')) escritos.push({ chave: 'produto', nome: 'Produto', valor: opcoes.produtos.find((p) => p.id === valor('produto'))?.nome ?? '?', tirar: tirar('produto') });
  if (valor('operadora')) escritos.push({ chave: 'operadora', nome: 'Operadora', valor: opcoes.operadoras.find((o) => o.id === valor('operadora'))?.nome ?? '?', tirar: tirar('operadora') });
  if (valor('etiqueta')) escritos.push({ chave: 'etiqueta', nome: 'Etiqueta', valor: valor('etiqueta'), tirar: tirar('etiqueta') });
  if (valor('campo')) {
    const [cid, oid] = valor('campo').split(':');
    const campo = opcoes.campos.find((c) => c.id === cid);
    escritos.push({ chave: 'campo', nome: campo?.nome ?? 'Campo', valor: oid ? campo?.opcoes.find((o) => o.id === oid)?.nome ?? '?' : 'não preenchido', tirar: tirar('campo') });
  }

  /** Um relatório pelo id do catálogo. */
  const relatorio = (id: string, rr: RelatoriosDoPainel): ReactNode => {
    const p = { r: rr, abrir: setAberta };
    switch (id) {
      case 'prazo': return <Prazo {...p} />;
      case 'relogio': return <Relogio {...p} separar={rr.relogio.separar} aoSeparar={(v: SepararORelogio) => mudar({ separar: v }, true)} />;
      case 'resposta': return <Resposta {...p} />;
      case 'escada': return <Escada {...p} />;
      case 'empaca': return <Empaca {...p} />;
      case 'prioridade': return <PrioridadeFaz {...p} />;
      case 'operadora': return <Operadora {...p} />;
      case 'fila': return <Fila {...p} />;
      case 'idade': return <Idade {...p} />;
      case 'calor': return <Calor {...p} />;
      case 'curva': return <Curva {...p} />;
      case 'previsao': return <Previsao {...p} />;
      case 'arvore': return <Arvore {...p} />;
      case 'sobe': return <Sobe {...p} aoNivel={(n) => mudar({ nivelSobe: n === 1 ? null : String(n) }, true)} />;
      case 'gravidade': return <Gravidade {...p} />;
      case 'pareto': return <Pareto {...p} aoPor={(v: ParetoDoPainel) => mudar({ pareto: v }, true)} />;
      case 'problemas': return <Problemas {...p} />;
      case 'raiox': return <RaioX {...p} aoEscolher={(c) => mudar({ raiox: c }, true)} />;
      case 'tamanho': return (
        <Tamanho {...p} aoRaioX={(c) => {
          // o Raio-X nesta aba: rola até ele; noutra (ou nos Favoritos sem ele): vai para a aba Clientes
          if (naAba.includes('raiox')) { mudar({ raiox: c }, true); document.getElementById('relatorio-raiox')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
          else { mudar({ raiox: c, aba: 'clientes' }, true); window.scrollTo({ top: 0 }); }
        }} />
      );
      case 'voltou': return <Voltou {...p} />;
      case 'falha': return <Falha {...p} podeEscolher={pode.cuidar} aoOrganizar={() => setRascunho(salvo)} />;
      case 'equipe': return <Equipe {...p} />;
      case 'tempogasto': return <TempoGasto {...p} />;
      case 'preenchido': return <Preenchido {...p} />;
      case 'fechamento': return <Fechamento {...p} aoMes={(m) => mudar({ mes: m }, true)} />;
      default: return null;
    }
  };

  const doSuporte = painel.id === PAINEL_DO_SUPORTE;
  const escondidosDaAba = aba === 'favoritos' ? [] : salvo.ordem.filter((id) => ITEM_DO_CATALOGO.get(id)?.aba === aba && salvo.ocultos.includes(id) && aplicaveis.includes(id));

  return (
    <div className="flex flex-col gap-3" id="relatorios-do-painel">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <CabecalhoDoPainel paineis={opcoes.paineis} atual={painel} vista="relatorio" className="min-w-0" />
        <div className="flex items-center gap-2 md:ml-auto">
          {doSuporte && (
            <Link to="/chamados" className="btn-ghost btn-sm text-ink-2" title="Os relatórios dos chamados do Helena (o LineChat), com os assuntos de lá">
              <History size={14} aria-hidden /> Legado do Helena
            </Link>
          )}
          {pode.cuidar && !organizando && (
            <button type="button" className="btn-secondary btn-sm" onClick={() => setRascunho(salvo)} title={`Mudar a ordem, esconder, escolher os favoritos e o campo da falha — para a equipe toda. ${ultimaArrumacao}`}>
              <LayoutGrid size={14} aria-hidden /> Organizar
            </button>
          )}
        </div>
      </div>
      <p className="text-[13px] text-ink-2 -mt-1">
        Os chamados do painel <b>{painel.nome}</b>{r?.primeiroDia ? <>, desde {data(r.primeiroDia)}</> : ''}. Clique num número, numa faixa ou num degrau para ver os chamados.
        {doSuporte && <> Os chamados do Helena continuam no <Link to="/chamados" className="link">Legado do Helena</Link>, com os assuntos de lá.</>}
      </p>

      {/* as abas: os Favoritos primeiro */}
      <nav aria-label="Abas dos relatórios" className="flex gap-1.5 overflow-x-auto sem-barra pb-1" id="relatorios-abas">
        {(['favoritos', ...ABAS_DOS_RELATORIOS] as Aba[]).map((id) => {
          const nomes = daAba(id, atual, aplicaveis).map((x) => ITEM_DO_CATALOGO.get(x)!.titulo);
          const Icone = ICONE_DA_ABA[id];
          return (
            <button key={id} type="button" aria-current={aba === id ? 'page' : undefined} onClick={() => irPara(id)}
              title={nomes.length ? nomes.join(' · ') : id === 'favoritos' ? 'Nenhum favorito ainda' : 'Nenhum relatório à vista nesta aba'}
              className={`shrink-0 inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-[13.5px] font-semibold transition-colors ${aba === id ? 'border-accent bg-accent-soft text-accent-ink' : 'border-line bg-surface text-ink-2 hover:border-line-strong hover:text-ink'}`}>
              <Icone size={15} className={id === 'favoritos' && nomes.length ? 'fill-current' : ''} aria-hidden /> {id === 'favoritos' ? 'Favoritos' : NOME_DA_ABA[id]}
              {id === 'favoritos' && nomes.length > 0 && <span className="tnum text-[12px] font-normal opacity-75">{nomes.length}</span>}
            </button>
          );
        })}
      </nav>

      {!organizando && (
        <>
          <div className="card p-3 flex flex-wrap items-center gap-x-4 gap-y-2" id="relatorios-periodo">
            {!comPeriodo && (
              <p className="flex items-center gap-2 text-[13px] text-ink-2">
                <CalendarCheck size={15} className="text-muted shrink-0" aria-hidden />
                O Fechamento usa o mês inteiro: escolha o mês no próprio relatório. Os filtros valem.
              </p>
            )}
            {comPeriodo && (
              <>
                <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Período">
                  <CalendarRange size={15} className="text-muted" aria-hidden />
                  {atalhos.map((a) => (
                    <button key={a.id} type="button" aria-pressed={atalho === a.id} onClick={() => mudar({ de: a.de, ate: a.ate }, true)}
                      className={`rounded-full border px-2.5 py-1 text-[12.5px] transition-colors ${atalho === a.id ? 'border-accent bg-accent-soft text-accent-ink font-semibold' : 'border-line-strong text-ink-2 hover:bg-surface-2'}`}>
                      {a.nome}
                    </button>
                  ))}
                </div>
                <div className="flex flex-wrap items-center gap-1.5 text-[12.5px]">
                  <label className="text-muted" htmlFor="relatorios-de">de</label>
                  <input id="relatorios-de" type="date" className="input py-1 w-[150px]" value={de} max={ate || undefined} onChange={(e) => e.target.value && mudar({ de: e.target.value, ate: ate || null }, true)} />
                  <label className="text-muted" htmlFor="relatorios-ate">até</label>
                  <input id="relatorios-ate" type="date" className="input py-1 w-[150px]" value={ate} min={de || undefined} onChange={(e) => e.target.value && mudar({ ate: e.target.value, de: de || null }, true)} />
                </div>
              </>
            )}
            <button type="button" className={`btn-secondary btn-sm md:ml-auto ${filtrosAbertos ? 'border-accent text-accent-ink bg-accent-soft' : ''}`} aria-expanded={filtrosAbertos} aria-controls="relatorios-filtros"
              onClick={() => setFiltrosAbertos((v) => !v)} title="Recortar os chamados: assunto, tipo, gravidade, prioridade, nível, responsável, cliente…">
              <Filter size={14} aria-hidden /> Filtros{escritos.length > 0 && <span className="text-accent tnum">({escritos.length})</span>}
            </button>
          </div>
          <div id="relatorios-filtros" className={`${filtrosAbertos ? 'flex' : 'hidden'} flex-wrap items-center gap-2`}>
            {(assuntos.length > 0 || valor('assunto')) && (
              <EscolherComBusca className={CAIXA_FILTRO} largura="w-[380px]" rotulo="Assunto (com os de baixo)" valor={valor('assunto')} vazio="Todos os assuntos" opcoes={assuntos} procurar="Procurar assunto…" onChange={(v) => mudar({ assunto: v }, true)} />
            )}
            {usa('tipo') && painel.ajustes.tipos.length > 0 && <SelectFiltro rotulo="Tipo" valor={valor('tipo')} vazio="Todos os tipos" opcoes={painel.ajustes.tipos.map((t) => ({ id: t, nome: t }))} onChange={(v) => mudar({ tipo: v }, true)} />}
            {usa('gravidade') && <SelectFiltro rotulo="Gravidade" valor={valor('gravidade')} vazio="Todas as gravidades" opcoes={GRAVIDADES.map((g) => ({ id: g, nome: NOME_GRAVIDADE[g] }))} onChange={(v) => mudar({ gravidade: v }, true)} />}
            <SelectFiltro rotulo="Prioridade" valor={valor('prioridade')} vazio="Todas as prioridades" opcoes={[...PRIORIDADES.map((p) => ({ id: p, nome: NOME_PRIORIDADE[p] })), { id: 'sem', nome: 'Sem prioridade' }]} onChange={(v) => mudar({ prioridade: v }, true)} />
            {niveis.length > 0 && <SelectFiltro rotulo="Subiu até o nível" valor={valor('nivel')} vazio="Todos os níveis" opcoes={niveis.map((n) => ({ id: String(n), nome: `Subiu até o ${NOME_DO_NIVEL[n]}` }))} onChange={(v) => mudar({ nivel: v }, true)} />}
            <EscolherComBusca className={CAIXA_FILTRO} rotulo="Responsável" valor={valor('responsavel')} vazio="Todos os responsáveis" procurar="Procurar pessoa…" onChange={(v) => mudar({ responsavel: v }, true)}
              opcoes={[{ id: RESPONSAVEL_NINGUEM, nome: 'Sem dono', dica: 'sem responsável' }, ...pessoas.map((p) => ({ id: p.id, nome: p.nome }))]} />
            <EscolherComBusca className={CAIXA_FILTRO} rotulo="Cliente" valor={valor('cliente')} vazio="Todos os clientes" opcoes={clientes} procurar="Procurar cliente…" onChange={(v) => mudar({ cliente: v }, true)} />
            {usa('produtos') && <SelectFiltro rotulo="Produto" valor={valor('produto')} vazio="Todos os produtos" opcoes={opcoes.produtos} onChange={(v) => mudar({ produto: v }, true)} />}
            {usa('operadoras') && <SelectFiltro rotulo="Operadora" valor={valor('operadora')} vazio="Todas as operadoras" opcoes={opcoes.operadoras} onChange={(v) => mudar({ operadora: v }, true)} />}
            {etiquetas.length > 0 && <SelectFiltro rotulo="Etiqueta" valor={valor('etiqueta')} vazio="Todas as etiquetas" opcoes={etiquetas.map((e) => ({ id: e.nome, nome: e.nome }))} onChange={(v) => mudar({ etiqueta: v }, true)} />}
            {camposDeLista.map((c) => (
              <SelectFiltro key={c.id} rotulo={c.nome} valor={valor('campo').startsWith(`${c.id}:`) ? valor('campo') : ''} vazio={`${c.nome}: todos`}
                opcoes={[...c.opcoes.filter((o) => o.ativa).map((o) => ({ id: `${c.id}:${o.id}`, nome: o.nome })), { id: `${c.id}:`, nome: 'Não preenchido' }]}
                onChange={(v) => mudar({ campo: v }, true)} />
            ))}
          </div>
          <FiltrosEscritos itens={escritos} onLimpar={() => mudar(Object.fromEntries(FILTROS.map((k) => [k, null])), true)} />
        </>
      )}

      {organizando && rascunho ? (
        <Organizar
          aba={aba} a={rascunho} campos={arrumacao.data?.campos ?? []} aplicaveis={aplicaveis} mudou={mudou} salvando={salvar.isPending} ultimaArrumacao={ultimaArrumacao}
          mover={mover} estrela={estrela} esconder={esconder} aoCampo={(c) => setRascunho((x) => (x ? { ...x, campoDaFalha: c } : x))}
          voltarAoPadrao={() => setRascunho((x) => (x ? { ...arrumacaoCompleta(null), favoritos: x.favoritos, campoDaFalha: x.campoDaFalha } : x))}
          cancelar={() => setRascunho(null)} salvar={() => salvar.mutate(rascunho)} irPara={irPara}
        />
      ) : rel.isError && !r ? <p className="text-bad text-sm" role="alert">{mensagemErro(rel.error)}</p> : !r || arrumacao.isLoading ? <Carregando /> : (
        <div className={`transition-opacity ${rel.isFetching && rel.isPlaceholderData ? 'opacity-60' : ''}`}>
          {rel.isError && <p className="text-bad text-sm mb-2" role="alert">{mensagemErro(rel.error)}</p>}
          {!r.noRecorte && escritos.length > 0 && <p className="text-[13px] text-muted mb-2">Nenhum chamado deste painel com esses filtros.</p>}
          {!naAba.length ? (
            aba === 'favoritos'
              ? <Vazio titulo="Nenhum favorito ainda" texto={pode.cuidar ? 'Clique em Organizar e marque a estrela nos relatórios que a equipe mais usa: eles aparecem aqui, na ordem que você escolher.' : 'Quem cuida dos chamados escolhe os favoritos em Organizar.'} />
              : <Vazio titulo="Nenhum relatório à vista nesta aba" texto={pode.cuidar ? 'Mostre de volta em Organizar.' : 'Quem cuida dos chamados mostra de volta em Organizar.'} />
          ) : <Grade ids={naAba} render={(id) => relatorio(id, r)} />}
          {escondidosDaAba.length > 0 && naAba.length > 0 && (
            <p className="text-[12.5px] text-muted mt-4 flex flex-wrap items-center gap-x-2 gap-y-1">
              <EyeOff size={13} className="shrink-0" aria-hidden />
              {escondidosDaAba.length === 1 ? 'Um relatório escondido' : `${escondidosDaAba.length} relatórios escondidos`} nesta aba: {escondidosDaAba.map((id) => ITEM_DO_CATALOGO.get(id)!.titulo).join(', ')}.
              {pode.cuidar ? <button type="button" className="link" onClick={() => setRascunho(salvo)}>Organizar</button> : ' Quem cuida dos chamados mostra de volta em Organizar.'}
            </p>
          )}
        </div>
      )}
      {aberta && r && <JanelaDosChamados aberta={aberta} r={r} onFechar={() => setAberta(null)} />}
    </div>
  );
}

/**
 * Os relatórios de uma aba, um embaixo do outro. Os de meia largura andam em dupla na tela larga; um de meia
 * largura que ficou sem par ocupa a linha toda.
 */
function Grade({ ids, render }: { ids: string[]; render: (id: string) => ReactNode }) {
  const metade = (id: string | undefined) => !!id && ITEM_DO_CATALOGO.get(id)?.largura === 'metade';
  const larga: Record<string, boolean> = {};
  let seguidos = 0;
  ids.forEach((id, i) => {
    if (!metade(id)) { larga[id] = true; seguidos = 0; return; }
    seguidos++;
    larga[id] = seguidos % 2 === 1 && !metade(ids[i + 1]);
  });
  return (
    <div className="grid gap-4 xl:grid-cols-2 items-start">
      {ids.map((id) => <div key={id} className={`min-w-0 flex flex-col ${larga[id] ? 'xl:col-span-2' : ''}`}>{render(id)}</div>)}
    </div>
  );
}

/**
 * O Organizar (quem cuida dos chamados; vale para a equipe toda, só neste painel): a lista da aba aberta, com
 * as setas para mudar a ordem, a estrela dos Favoritos e o esconder; e de qual campo sai o "De quem é a falha?".
 * As outras abas continuam clicáveis em cima; nada vale antes do "Salvar para todos".
 */
function Organizar({ aba, a, campos, aplicaveis, mudou, salvando, ultimaArrumacao, mover, estrela, esconder, aoCampo, voltarAoPadrao, cancelar, salvar, irPara }: {
  aba: Aba; a: Arrumacao; campos: ArrumacaoDosRelatoriosLida['campos']; aplicaveis: readonly string[]; mudou: boolean; salvando: boolean; ultimaArrumacao: string;
  mover: (id: string, passo: -1 | 1) => void; estrela: (id: string) => void; esconder: (id: string) => void; aoCampo: (c: string | null) => void;
  voltarAoPadrao: () => void; cancelar: () => void; salvar: () => void; irPara: (a: Aba) => void;
}) {
  const ids = aba === 'favoritos' ? a.favoritos : a.ordem.filter((id) => ITEM_DO_CATALOGO.get(id)?.aba === aba);
  const botao = 'p-1.5 rounded-md text-ink-2 hover:bg-surface-2 hover:text-ink disabled:opacity-30 disabled:hover:bg-transparent';
  const novos = CATALOGO_DOS_RELATORIOS.filter((c) => c.novo).length;
  return (
    <div className="flex flex-col gap-3" id="relatorios-organizar">
      <div className="sticky top-16 md:top-2 z-10 rounded-xl border border-accent bg-accent-soft px-3 py-2.5 flex flex-wrap items-center gap-x-3 gap-y-2 shadow-sm">
        <LayoutGrid size={17} className="text-accent shrink-0" aria-hidden />
        <div className="text-[13px] text-accent-ink flex-1 min-w-[240px] leading-snug">
          <b>Organizando os Relatórios deste painel para a equipe toda.</b> Em cada aba, mude a ordem com as setas, esconda o que não usa e marque a estrela <Star size={12} className="inline -mt-0.5" aria-hidden /> para pôr nos Favoritos.
          <span className="block text-[12px] opacity-80 mt-0.5">Na aba Favoritos, as setas mudam a ordem dos favoritos. Nada muda antes do Salvar para todos. {ultimaArrumacao}</span>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <button type="button" className="btn-ghost btn-sm" onClick={voltarAoPadrao} title="Volta a ordem de fábrica e mostra todos de novo. Os favoritos ficam.">Voltar ao padrão</button>
          <button type="button" className="btn-secondary btn-sm" onClick={cancelar}>Cancelar</button>
          <button type="button" className="btn-primary btn-sm" disabled={!mudou || salvando} onClick={salvar}>{salvando ? 'Salvando…' : 'Salvar para todos'}</button>
        </div>
      </div>

      <section className="card p-2 sm:p-3" aria-label={`Organizar: ${aba === 'favoritos' ? 'Favoritos' : NOME_DA_ABA[aba]}`}>
        {!ids.length ? (
          <div className="p-4 text-[13.5px] text-muted">
            Nenhum favorito ainda. Abra uma aba (
            {ABAS_DOS_RELATORIOS.map((s, i) => <Fragment key={s}>{i > 0 && ', '}<button type="button" className="link" onClick={() => irPara(s)}>{NOME_DA_ABA[s]}</button></Fragment>)}
            ) e marque a estrela <Star size={12} className="inline -mt-0.5" aria-hidden /> nos relatórios que a equipe mais usa.
          </div>
        ) : (
          <ol className="divide-y divide-line">
            {ids.map((id, i) => {
              const c = ITEM_DO_CATALOGO.get(id)!;
              const oculto = a.ocultos.includes(id);
              const fav = a.favoritos.includes(id);
              const naoVale = !aplicaveis.includes(id);
              return (
                <li key={id} className={`flex flex-wrap items-center gap-x-2 gap-y-1 px-1.5 py-2 ${oculto ? 'bg-surface-2 rounded-lg' : ''}`}>
                  <span className="flex items-center">
                    <button type="button" className={botao} disabled={i === 0} onClick={() => mover(id, -1)} aria-label={`${c.titulo}: subir`} title="Subir"><ArrowUp size={16} /></button>
                    <button type="button" className={botao} disabled={i === ids.length - 1} onClick={() => mover(id, 1)} aria-label={`${c.titulo}: descer`} title="Descer"><ArrowDown size={16} /></button>
                  </span>
                  <span className="tnum text-[12px] text-muted w-5 text-right">{i + 1}</span>
                  <span className="flex-1 min-w-[180px]">
                    <span className={`text-[14px] ${oculto || naoVale ? 'text-muted' : 'font-semibold'} ${oculto ? 'line-through decoration-1' : ''}`}>{c.titulo}</span>
                    {c.novo && <Chip tone="accent" className="ml-1.5">novo</Chip>}
                    <span className="block text-[12px] text-muted">{naoVale ? (c.precisa ? NAO_VALE_PORQUE[c.precisa] : 'Não vale para este painel.') : c.pergunta}</span>
                  </span>
                  {aba === 'favoritos' && <Chip tone="muted">{NOME_DA_ABA[c.aba]}</Chip>}
                  {oculto && <Chip tone="muted">escondido</Chip>}
                  <span className="flex items-center gap-1 ml-auto">
                    <button type="button" className={`btn-ghost btn-sm ${fav ? 'text-signal' : ''}`} aria-pressed={fav} onClick={() => estrela(id)} title={fav ? 'Tirar dos Favoritos' : 'Pôr nos Favoritos'}>
                      <Star size={15} className={fav ? 'fill-current' : ''} aria-hidden /> <span className="hidden sm:inline">{fav ? 'Favorito' : 'Favoritar'}</span>
                    </button>
                    {aba !== 'favoritos' && (
                      <button type="button" className="btn-ghost btn-sm" onClick={() => esconder(id)} aria-label={`${oculto ? 'Mostrar' : 'Esconder'} ${c.titulo}`}>
                        {oculto ? <><Eye size={14} aria-hidden /> Mostrar</> : <><EyeOff size={14} aria-hidden /> Esconder</>}
                      </button>
                    )}
                  </span>
                </li>
              );
            })}
          </ol>
        )}
      </section>

      <section className="card p-3 flex flex-wrap items-center gap-x-3 gap-y-2" aria-label="De quem é a falha?">
        <label htmlFor="organizar-campo-da-falha" className="text-[13.5px] font-semibold">"De quem é a falha?" sai do campo</label>
        <select id="organizar-campo-da-falha" className="input w-auto py-1.5 text-[13px]" value={a.campoDaFalha ?? ''} onChange={(e) => aoCampo(e.target.value || null)} disabled={!campos.length}>
          <option value="">{campos.length ? 'achar pelo nome (Responsabilidade, Falha…)' : 'o painel não tem campo de lista'}</option>
          {campos.map((c) => <option key={c.id} value={c.id}>{c.nome}{c.ativo ? '' : ' (desativado)'}</option>)}
        </select>
        <span className="text-[12px] text-muted">Os campos de lista do painel (Painéis › Ajustes › Campos).</span>
      </section>

      <p className="text-[12.5px] text-muted">
        {CATALOGO_DOS_RELATORIOS.length} relatórios em 6 abas · {a.favoritos.length ? `${a.favoritos.length} nos Favoritos` : 'nenhum favorito'} · {CATALOGO_DOS_RELATORIOS.length - a.ocultos.length} à vista ·
        {' '}{novos} novos, que o Helena não deixava fazer. A aba de cada relatório é fixa; escondido não aparece em lugar nenhum (nem nos Favoritos). Vale só para este painel.
      </p>
    </div>
  );
}
