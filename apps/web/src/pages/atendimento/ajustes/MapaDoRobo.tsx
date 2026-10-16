/**
 * Chamados › Ajustes › Integrações (Patch 2.0.1) — o MAPA DO ROBÔ: o que chega no webhook do robô do
 * LineChat e de onde vem cada campo do chamado. Os pedidos do Luan: "Eu quero que a gente possa alterar
 * esse JSON… para que não tenha que ser algo bem fixo… alguma parte onde eu possa montar as referências
 * com as variáveis" e, depois, "eu quero que eu possa alterar incluindo ou removendo parametros que vao
 * chegar no webhook e eu possa configurar isso na tela… e alem disso vc fazer um preview de como deve
 * chegar o webhook".
 *
 *  - OS PARÂMETROS: a lista do que chega, cada um com um nome curto (empresa), de onde vem no pedido (a
 *    pergunta pelo texto, o caminho no JSON, o endereço ?setor=…) e um exemplo. Inclui escolhendo no
 *    pedido (o nome e o exemplo saem sugeridos) ou escrevendo; ao lado de cada um, se veio no pedido de
 *    exemplo (o último do robô) e em que campos está. Renomear muda os campos junto; tirar avisa onde ele
 *    era usado.
 *  - "COMO DEVE CHEGAR O WEBHOOK": o endereço e o JSON que o mapa espera, montados com os parâmetros e
 *    os exemplos, para conferir e copiar (e experimentar o mapa com ele).
 *  - OS CAMPOS: cada um é um texto com os parâmetros (ou as variáveis do pedido) entre {{ }} ("Atendimento
 *    de {{nome}}"); o botão "Variável" abre a lista — os parâmetros primeiro, depois o resto do pedido,
 *    com a pergunta ao lado de cada resposta (o id do bloco, "cb-…-qst-…", não diz nada a ninguém) — e
 *    põe a escolhida onde está o cursor; embaixo de cada campo, o texto que sai com o pedido de exemplo.
 *  - O pedido de exemplo é o último do robô (o Gestor guarda), um colado (com o endereço, para os
 *    parâmetros dele) ou o exemplo do LineChat.
 *  - "Como fica" pergunta ao servidor o chamado que nasceria, sem abrir nada: é o mesmo resolvedor que
 *    abre de verdade (o cliente, o assunto e as opções achados, e o que ficaria de fora), e mostra a
 *    resposta ao robô (o bloco "Enviar webhook" do LineChat), com a mensagem ao cliente.
 *  - A resposta da pergunta entra pelo texto dela (pergunta: …), que vale nas cópias do robô (a de teste e
 *    a de produção têm os blocos com outros códigos); pelo código do bloco também dá.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Braces, ChevronDown, CircleCheck, CircleDashed, ClipboardPaste, Eye, FlaskConical, Info, ListPlus, Pencil, Plus, RotateCcw, Trash2, TriangleAlert, Undo2,
  Waypoints, Webhook,
} from 'lucide-react';
import {
  aplicarMapaDoRobo, EXEMPLO_DO_LINECHAT, GRUPOS_DAS_VARIAVEIS, mapaDeFabrica, MENSAGEM_DO_ROBO_PADRAO, NOME_CAMPO_DO_MAPA, NOME_GRUPO_DA_VARIAVEL, paraBusca,
  ParametroDoRoboSchema, parametroNoPedido, parametrosDaUrl, parametrosDoEndereco, pedidoEsperado, preencherMensagem, problemaDaOrigem, problemaDoModelo, renomearParametro,
  respostaAoRobo, respostaDoRoboQueFalhou, sugerirNomeDoParametro, telefoneLegivel, usosDoParametro, variaveisDoPedido,
  type CampoDoMapa, type CampoPersonalizado, type ContextoDoPedido, type MapaDoRobo, type ParametroDoRobo, type PreviaDoRobo, type RespostaAoRobo,
  type RoboTela, type UltimoPedidoDoRobo, type VariavelDoPedido,
} from '@gestor/shared';
import { api } from '../../../api/index.js';
import { Carregando, Chip, Confirmar, Modal, Spinner, mensagemErro, useToast } from '../../../components/ui/index.js';
import { ChipPrioridade, dataHoraCurta, Etiquetas, LinkDoChamado, useOpcoes } from '../comum.js';
import { BlocoDeCodigo, CartaoAjuste, Copiavel, Explicacao, Resultado, erroLegivel } from './Avisos.js';

export const CHAVE_ROBO = ['atendimento', 'integracoes', 'robo'];

type Fonte = 'ultimo' | 'exemplo' | 'colado';
/** O pedido colado, ou o "Como deve chegar" usado de exemplo: o JSON e os parâmetros do endereço (sem a chave). */
type Colado = { corpo: unknown; endereco: Record<string, string>; deOnde: 'colado' | 'esperado' };
type Linha = { chave: CampoDoMapa; dica: ReactNode; linhas?: number; exemplo: string };
/** Um parâmetro conferido com o pedido de exemplo: se veio (e com que valor) e onde está no mapa. */
type Conferido = { p: ParametroDoRobo; veio: boolean; valor: string; usos: string[] };
/** Como a tela fala do pedido de exemplo: "no último pedido", "do último pedido do robô". */
type FalaDaFonte = { no: string; do: string };

const SEM_ENDERECO: Readonly<Record<string, string>> = Object.freeze({});
const FALA: Record<Fonte | 'esperado', FalaDaFonte & { botao: string }> = {
  ultimo: { botao: 'o último pedido do robô', no: 'no último pedido', do: 'do último pedido do robô' },
  exemplo: { botao: 'o exemplo do LineChat', no: 'no exemplo do LineChat', do: 'do exemplo do LineChat' },
  colado: { botao: 'um pedido colado', no: 'no pedido colado', do: 'do pedido colado' },
  esperado: { botao: 'o pedido esperado', no: 'no pedido esperado', do: 'do pedido esperado' },
};

/** Os campos que quase todo robô usa (o mapa de fábrica já preenche, com os parâmetros de fábrica). */
const PRINCIPAIS: Linha[] = [
  { chave: 'titulo', exemplo: 'Atendimento de {{nome}}', dica: 'Vazio (ou com os parâmetros vazios), o chamado fica "Atendimento de <nome do contato>".' },
  { chave: 'relato', linhas: 3, exemplo: '{{mensagem}}', dica: 'O que o cliente disse. Na mesma conversa aberta, o relato novo vira anotação no chamado que já existe.' },
  { chave: 'telefone', exemplo: '{{whatsapp}}', dica: 'Com ele o Gestor acha o cliente que já conhece. O "+55|71…" do LineChat é arrumado sozinho.' },
  { chave: 'nome', exemplo: '{{nome}}', dica: 'O nome do contato.' },
  { chave: 'sessaoId', exemplo: '{{conversa}}', dica: 'O id da conversa: a mesma conversa aberta não vira dois chamados, e a ficha ganha o link "Conversa no LineChat".' },
  { chave: 'etiquetas', exemplo: 'robô, {{setor}}', dica: 'Separadas por vírgula; texto fixo também vale. Cada etiqueta vale por si: a do parâmetro que não veio sai, as outras ficam.' },
];
/** Os que dependem das perguntas e dos menus de cada robô. */
const MAIS: Linha[] = [
  { chave: 'descricao', linhas: 2, exemplo: 'Empresa: {{empresa}} · Setor: {{setor}}', dica: 'O que a equipe lê. Dá para juntar vários parâmetros num texto só.' },
  { chave: 'cliente', exemplo: '{{empresa}}', dica: 'O nome (fantasia ou razão social) ou o CNPJ. Sem achar, o Gestor procura o cliente pelo WhatsApp do contato.' },
  { chave: 'assunto', exemplo: '{{assunto}}', dica: 'O caminho ("Ramal › Configuração"), o nome ou um nome do de-para do assunto (Ajustes › Campos › Assunto): é assim que a resposta do menu vira assunto.' },
  { chave: 'prioridade', exemplo: 'Alta', dica: 'Crítica, Alta, Média ou Baixa: escrita aqui ou num parâmetro.' },
];

const DICA_DO_TIPO: Record<CampoPersonalizado['tipo'], (c: CampoPersonalizado) => string> = {
  texto: () => 'Texto curto (até 300 letras).',
  texto_longo: () => 'Texto longo.',
  numero: () => 'Um número.',
  data: () => 'Uma data (dia/mês/ano).',
  sim_nao: () => 'Sim ou não.',
  lista: (c) => `Uma das opções: ${opcoesAtivas(c)}. A resposta enfeitada do menu também serve, se uma opção aparecer nela.`,
  lista_varios: (c) => `As opções, separadas por vírgula: ${opcoesAtivas(c)}.`,
};
const opcoesAtivas = (c: CampoPersonalizado) => c.opcoes.filter((o) => o.ativa).map((o) => o.nome).join(', ') || '(nenhuma ativa)';

const copia = (m: MapaDoRobo): MapaDoRobo => JSON.parse(JSON.stringify(m)) as MapaDoRobo;
/** O mapa como se compara: sem os campos do painel em branco, em ordem. */
const comparavel = (m: MapaDoRobo) => JSON.stringify({
  ...m, painel: m.painel.trim(), campos: Object.fromEntries(Object.entries(m.campos).filter(([, t]) => t.trim()).sort(([a], [b]) => a.localeCompare(b))),
});
const encurtar = (s: string, max: number) => (s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s);
/** No endereço do exemplo, só o que quebraria a URL vai codificado (o "<setor>" e o acento ficam legíveis). */
const naUrl = (s: string) => s.replace(/[%&#?=+\s]/g, (c) => encodeURIComponent(c));

// =====================================================================
//  O CARTÃO
// =====================================================================

export function CartaoMapaDoRobo({ base }: { base: string }) {
  const q = useQuery({ queryKey: CHAVE_ROBO, queryFn: () => api.atendimento.robo() });
  return (
    <CartaoAjuste id="integ-mapa" icone={<Waypoints size={18} />} titulo="O mapa do robô: o que chega no webhook e vira chamado">
      {q.isLoading ? <Carregando /> : q.isError || !q.data ? <p className="text-bad text-sm" role="alert">{mensagemErro(q.error)}</p> : <EditorDoMapa tela={q.data} base={base} />}
    </CartaoAjuste>
  );
}

function EditorDoMapa({ tela, base }: { tela: RoboTela; base: string }) {
  const qc = useQueryClient(); const toast = useToast();
  const opcoes = useOpcoes();
  const [form, setForm] = useState<MapaDoRobo>(() => copia(tela.mapa));
  const [fonte, setFonte] = useState<Fonte>(tela.ultimo ? 'ultimo' : 'exemplo');
  const [colado, setColado] = useState<Colado | null>(null);
  const [colando, setColando] = useState(false);
  const [escolhendo, setEscolhendo] = useState<{ chave: string; rotulo: string } | null>(null);
  /** o parâmetro aberto: o lugar dele na lista, ou null para um novo */
  const [editando, setEditando] = useState<{ indice: number | null } | null>(null);
  const [tirando, setTirando] = useState<number | null>(null);
  const [mais, setMais] = useState(() => MAIS.some((l) => tela.mapa[l.chave].trim()) || Object.values(tela.mapa.campos).some((t) => t.trim()));
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const elementos = useRef<Record<string, HTMLInputElement | HTMLTextAreaElement | null>>({});
  /** os campos em que a pessoa já pôs o cursor (sem cursor, a variável entra no fim) */
  const tocados = useRef(new Set<string>());

  // o último pedido que chegou depois de a tela abrir (o robô chamou agora): a lista acompanha
  useEffect(() => { if (tela.ultimo && fonte === 'exemplo' && colado === null) setFonte('ultimo'); }, [tela.ultimo]); // eslint-disable-line react-hooks/exhaustive-deps

  // o pedido de exemplo: o JSON, os parâmetros do endereço (?setor=…) e como a tela fala dele
  const corpo = fonte === 'ultimo' && tela.ultimo ? tela.ultimo.corpo : fonte === 'colado' && colado ? colado.corpo : EXEMPLO_DO_LINECHAT;
  const endereco: Readonly<Record<string, string>> = fonte === 'ultimo' && tela.ultimo ? tela.ultimo.endereco ?? SEM_ENDERECO
    : fonte === 'colado' && colado ? colado.endereco : SEM_ENDERECO;
  const fala = FALA[fonte === 'colado' && colado?.deOnde === 'esperado' ? 'esperado' : fonte];
  const contexto = useMemo<ContextoDoPedido>(() => ({ parametros: form.parametros, endereco }), [form.parametros, endereco]);
  const variaveis = useMemo(() => variaveisDoPedido(corpo, 400, endereco), [corpo, endereco]);
  const pedido = useMemo(() => aplicarMapaDoRobo(form, corpo, endereco), [form, corpo, endereco]);

  const ativos = (opcoes.data?.paineis ?? []).filter((p) => p.ativo);
  const painelId = form.painel || ativos[0]?.id || '';
  const escolhidoSaiu = !!form.painel && !!opcoes.data && !ativos.some((p) => p.id === form.painel);
  const doPainel = (opcoes.data?.campos ?? []).filter((c) => c.painelId === painelId && c.ativo).sort((a, b) => a.ordem - b.ordem);
  const conferidos: Conferido[] = form.parametros.map((p) => ({ p, ...parametroNoPedido(p, corpo, contexto), usos: usosDoParametro(form, p.nome, doPainel) }));

  const valorDe = (chave: string) => (chave.startsWith('campo:') ? form.campos[chave.slice(6)] ?? '' : chave === 'mensagem' ? form.mensagem : form[chave as CampoDoMapa]);
  const mudar = (chave: string, v: string) => {
    setErro(null);
    setForm((f) => (chave.startsWith('campo:') ? { ...f, campos: { ...f.campos, [chave.slice(6)]: v } } : { ...f, [chave]: v }));
  };
  const inserir = (chave: string, referencia: string) => {
    const el = elementos.current[chave];
    const atual = valorDe(chave);
    const marca = `{{${referencia}}}`;
    const comCursor = !!el && tocados.current.has(chave);
    const ini = comCursor ? el!.selectionStart ?? atual.length : atual.length;
    const fim = comCursor ? el!.selectionEnd ?? ini : ini;
    const antes = atual.slice(0, ini);
    // sem o cursor no campo, entra no fim, com um espaço do que já estava
    const espaco = !comCursor && antes && !/\s$/.test(antes) ? ' ' : '';
    mudar(chave, `${antes}${espaco}${marca}${atual.slice(fim)}`);
    const pos = ini + espaco.length + marca.length;
    requestAnimationFrame(() => {
      const e = elementos.current[chave];
      if (!e) return;
      e.focus(); e.setSelectionRange(pos, pos); tocados.current.add(chave);
    });
  };

  // os parâmetros: incluir, editar (o nome novo vai junto para os campos que usam o antigo) e tirar
  const gravarParametro = (indice: number | null, p: ParametroDoRobo) => {
    setErro(null);
    setForm((f) => {
      if (indice === null) return { ...f, parametros: [...f.parametros, p] };
      const antigo = f.parametros[indice];
      if (!antigo) return f;
      const renomeado = antigo.nome !== p.nome ? renomearParametro(f, antigo.nome, p.nome) : f;
      return { ...renomeado, parametros: renomeado.parametros.map((x, i) => (i === indice ? p : x)) };
    });
  };
  const tirarParametro = (indice: number) => { setErro(null); setForm((f) => ({ ...f, parametros: f.parametros.filter((_, i) => i !== indice) })); };
  // o que não está em campo nenhum sai direto (nada é salvo antes do "Salvar o mapa"); o que está, pergunta antes
  const pedirParaTirar = (indice: number) => { if (conferidos[indice]?.usos.length) setTirando(indice); else tirarParametro(indice); };
  const experimentarOEsperado = () => {
    const e = pedidoEsperado(form);
    // o endereço passa pelo mesmo filtro do servidor (a chave e o que não se escreve num caminho ficam de fora)
    setColado({ corpo: [e.corpo], endereco: parametrosDoEndereco(e.endereco), deOnde: 'esperado' });
    setFonte('colado');
    toast.push('ok', 'O pedido esperado virou o pedido de exemplo: os parâmetros, os campos e o "Como fica" agora saem dele.');
  };

  // o texto com a variável aberta não salva (nem vai para o "Como fica": o servidor recusaria)
  const problemas: Array<[string, string]> = [];
  for (const l of [...PRINCIPAIS, ...MAIS]) { const p = problemaDoModelo(form[l.chave]); if (p) problemas.push([l.chave, p]); }
  for (const c of doPainel) { const p = problemaDoModelo(form.campos[c.id] ?? ''); if (p) problemas.push([`campo:${c.id}`, p]); }
  const problemaDaMensagem = problemaDoModelo(form.mensagem);
  if (problemaDaMensagem) problemas.push(['mensagem', problemaDaMensagem]);
  const problemaDe = (chave: string) => problemas.find(([k]) => k === chave)?.[1] ?? null;
  const nomeDe = (chave: string) => (chave.startsWith('campo:') ? doPainel.find((c) => c.id === chave.slice(6))?.nome ?? 'um campo'
    : chave === 'mensagem' ? 'a Mensagem ao cliente' : NOME_CAMPO_DO_MAPA[chave as CampoDoMapa]);
  const previa = usePreviaDoRobo(problemas.length ? null : form, corpo, endereco);

  // a mensagem e a resposta ao robô com este pedido: o número de um chamado novo ainda não existe (vai um de exemplo)
  const sigla = ativos.find((p) => p.id === painelId)?.sigla ?? 'SUP';
  const aberto = previa.previa?.aberto ?? null;
  const codigoDoExemplo = aberto?.codigo ?? `${sigla}-12`;
  const mensagem = preencherMensagem(form.mensagem, { codigo: codigoDoExemplo, contato: pedido.nome || null }, corpo, contexto);
  const resposta: RespostaAoRobo | null = !previa.previa ? null
    : aberto || previa.previa.resolvido.ok ? respostaAoRobo(form, { codigo: codigoDoExemplo, contato: pedido.nome || null }, corpo, endereco) : respostaDoRoboQueFalhou();

  const mudou = comparavel(form) !== comparavel(tela.mapa);
  const deFabrica = comparavel(form) === comparavel(mapaDeFabrica());
  const salvar = async () => {
    setSalvando(true); setErro(null);
    try {
      // os campos do painel que ficam: os do painel escolhido (os de outro painel saem junto com a troca)
      const campos = opcoes.data ? Object.fromEntries(Object.entries(form.campos).filter(([id, t]) => t.trim() && doPainel.some((c) => c.id === id))) : form.campos;
      const novo = await api.atendimento.salvarMapaDoRobo({ ...form, campos });
      setForm(copia(novo));
      qc.setQueryData<RoboTela>(CHAVE_ROBO, (x) => (x ? { ...x, mapa: novo } : x));
      toast.push('ok', 'Mapa salvo: o próximo pedido do robô já sai por ele.');
    } catch (e) { setErro(erroLegivel(e)); } finally { setSalvando(false); }
  };

  const linha = (l: Linha) => (
    <LinhaDoMapa key={l.chave} chave={l.chave} rotulo={NOME_CAMPO_DO_MAPA[l.chave]} dica={l.dica} linhas={l.linhas} exemplo={l.exemplo}
      valor={form[l.chave]} saida={pedido[l.chave]} faltaram={pedido.faltaram[l.chave] ?? []} problema={problemaDe(l.chave)}
      onChange={(v) => mudar(l.chave, v)} onVariavel={() => setEscolhendo({ chave: l.chave, rotulo: NOME_CAMPO_DO_MAPA[l.chave] })}
      registrar={(el) => { elementos.current[l.chave] = el; }} onFoco={() => tocados.current.add(l.chave)} />
  );
  const sendoTirado = tirando !== null ? conferidos[tirando] : undefined;
  const sendoEditado = editando?.indice != null ? conferidos[editando.indice] : undefined;

  return (
    <>
      <Explicacao>
        <p>
          O robô manda o JSON da conversa do jeito dele. Aqui você diz <b>o que chega</b> — os parâmetros do webhook, cada um com um nome
          curto — e <b>de onde sai cada campo do chamado</b>: um texto com os parâmetros entre {'{{ }}'} (<span className="font-mono">{'Atendimento de {{nome}}'}</span>),
          que o Gestor troca pelo valor que veio. Incluiu uma pergunta no robô? Inclua o parâmetro e ponha no campo: nada de código. Se o robô
          mudar (ou for outro sistema), é só mudar o mapa.
        </p>
        <p className="text-[12.5px] text-muted">
          A resposta de uma pergunta entra pelo texto dela — <span className="font-mono">pergunta: o motivo do seu contato</span>,{' '}
          <span className="font-mono">menu: …</span> nos menus —, que vale também na cópia do robô (a de teste e a de produção têm os blocos com
          outros códigos). Com <span className="font-mono">||</span> vale a primeira que vier com valor, e <span className="font-mono">"texto"</span> no
          fim é fixo. O que vier e não bater (o assunto que não existe, a opção que não é do campo) fica de fora, e o chamado abre do mesmo jeito.
        </p>
      </Explicacao>

      <div className="rounded-xl border border-line p-3 flex flex-col gap-2 min-w-0" id="robo-pedido">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[12.5px] font-semibold text-ink-2">O pedido de exemplo</span>
          <div className="flex flex-wrap gap-1" role="group" aria-label="O pedido de exemplo">
            {(['ultimo', 'exemplo', 'colado'] as const).map((v) => {
              const desativado = (v === 'ultimo' && !tela.ultimo) || (v === 'colado' && colado === null);
              const nome = v === 'colado' && colado?.deOnde === 'esperado' ? FALA.esperado.botao : FALA[v].botao;
              return (
                <button key={v} type="button" aria-pressed={fonte === v} disabled={desativado} id={`robo-fonte-${v}`} onClick={() => setFonte(v)}
                  className={`px-2 py-0.5 rounded-md border text-[12.5px] disabled:opacity-40 ${fonte === v ? 'border-accent bg-accent-soft text-accent-ink font-semibold' : 'border-line text-muted hover:bg-surface-2'}`}>
                  {nome}
                </button>
              );
            })}
          </div>
          <button type="button" className="btn-ghost btn-sm ml-auto" id="robo-colar" onClick={() => setColando(true)}><ClipboardPaste size={14} /> Colar um pedido</button>
        </div>
        <p className="text-[12px] text-muted">Os parâmetros, os campos e o "Como fica" mostram o que sai com ele: nada é aberto nem salvo.</p>
        <SobreOUltimo ultimo={tela.ultimo} />
        {fonte === 'exemplo' && <p className="text-[12.5px] text-muted">O exemplo é um pedido de mentira no formato do LineChat: as perguntas e os menus do seu robô aparecem no último pedido (ou no que você colar).</p>}
      </div>

      <ParametrosDoWebhook conferidos={conferidos} fala={fala} onIncluir={() => setEditando({ indice: null })}
        onEditar={(i) => setEditando({ indice: i })} onTirar={pedirParaTirar} />

      <ComoDeveChegar base={base} form={form} onExperimentar={experimentarOEsperado} />

      <div className="mt-4 flex flex-col">
        <h3 className="text-[13.5px] font-semibold text-ink">Os campos do chamado</h3>
        <p className="text-[12.5px] text-muted mt-0.5 mb-1">
          Cada campo é um texto com os parâmetros entre {'{{ }}'}: o botão <b>Variável</b> põe onde está o cursor. Embaixo, o que sai com o pedido de exemplo.
        </p>
        <div className="grid gap-1 sm:grid-cols-[150px_minmax(0,1fr)] sm:gap-3 py-2.5 border-t border-line">
          <label htmlFor="robo-painel" className="text-[13px] font-semibold text-ink sm:pt-2">Painel</label>
          <div className="min-w-0 flex flex-col gap-1">
            <select className="input max-w-[360px]" id="robo-painel" value={form.painel} onChange={(e) => mudar('painel', e.target.value)}>
              <option value="">O primeiro ativo{ativos[0] ? ` (hoje: ${ativos[0].nome})` : ''}</option>
              {ativos.map((p) => <option key={p.id} value={p.id}>{p.sigla} · {p.nome}</option>)}
              {escolhidoSaiu && <option value={form.painel}>(o painel escolhido foi desativado)</option>}
            </select>
            {escolhidoSaiu
              ? <p className="text-[12px] text-signal">O painel do mapa foi desativado: os chamados vão para o primeiro ativo até você escolher outro.</p>
              : <p className="text-[11.5px] text-muted">Onde o chamado nasce. Os campos do painel (em "Mais campos") mudam com ele.</p>}
          </div>
        </div>
        {PRINCIPAIS.map(linha)}
        <button type="button" className="flex items-center gap-1.5 text-[13px] font-semibold text-accent-ink py-2.5 border-t border-line text-left" id="robo-mais"
          aria-expanded={mais} onClick={() => setMais((m) => !m)}>
          <ChevronDown size={15} className={`transition-transform ${mais ? '' : '-rotate-90'}`} />
          Mais campos: descrição, cliente, assunto, prioridade{doPainel.length ? ` e ${doPainel.length === 1 ? 'o campo' : `os ${doPainel.length} campos`} do painel` : ''}
        </button>
        {mais && (
          <div className="flex flex-col" id="robo-mais-campos">
            {MAIS.map(linha)}
            {doPainel.map((c) => {
              const chave = `campo:${c.id}`;
              return (
                <LinhaDoMapa key={chave} chave={chave} rotulo={c.nome} dica={DICA_DO_TIPO[c.tipo](c)} linhas={c.tipo === 'texto_longo' ? 2 : undefined}
                  exemplo={c.tipo === 'lista' || c.tipo === 'lista_varios' ? '{{menu: …}}' : ''}
                  valor={form.campos[c.id] ?? ''} saida={pedido.campos[c.id] ?? ''} faltaram={pedido.faltaram[chave] ?? []} problema={problemaDe(chave)} doPainel
                  onChange={(v) => mudar(chave, v)} onVariavel={() => setEscolhendo({ chave, rotulo: c.nome })}
                  registrar={(el) => { elementos.current[chave] = el; }} onFoco={() => tocados.current.add(chave)} />
              );
            })}
          </div>
        )}
        <LinhaDoMapa chave="mensagem" rotulo="Mensagem ao cliente" linhas={2} exemplo={MENSAGEM_DO_ROBO_PADRAO}
          dica={<>Volta na resposta ao robô (em "messages"), e o LineChat manda ao cliente. <span className="font-mono">{'{codigo}'}</span> é o número do
            chamado; <span className="font-mono">{'{contato}'}</span>, o nome do contato; os parâmetros também valem. Vazia, o robô segue sem mensagem.</>}
          valor={form.mensagem} saida={mensagem.texto} faltaram={mensagem.faltaram} problema={problemaDe('mensagem')} sempreSaida
          onChange={(v) => mudar('mensagem', v)} onVariavel={() => setEscolhendo({ chave: 'mensagem', rotulo: 'Mensagem ao cliente' })}
          registrar={(el) => { elementos.current.mensagem = el; }} onFoco={() => tocados.current.add('mensagem')} />
      </div>

      <ComoFica estado={previa} resposta={resposta} exemplo={!aberto}
        problema={problemas.length ? `Conserte ${nomeDe(problemas[0]![0])} para ver como fica: ${problemas[0]![1]}` : null} />

      <div className="flex flex-wrap items-center gap-2 mt-3">
        <button type="button" className="btn-primary" id="robo-salvar" disabled={salvando || !mudou || problemas.length > 0} onClick={() => void salvar()}>
          {salvando ? <Spinner className="text-white" /> : 'Salvar o mapa'}
        </button>
        {mudou && <button type="button" className="btn-ghost" id="robo-desfazer" onClick={() => { setForm(copia(tela.mapa)); setErro(null); }}><Undo2 size={15} /> Desfazer</button>}
        {!deFabrica && (
          <button type="button" className="btn-ghost" id="robo-de-fabrica" title="O mapa de fábrica: os parâmetros nome, whatsapp, conversa e mensagem, e os campos com eles (falta salvar)"
            onClick={() => { setForm(mapaDeFabrica()); setErro(null); }}><RotateCcw size={15} /> Voltar ao de fábrica</button>
        )}
        {mudou && <span className="text-[12.5px] text-signal">há mudanças sem salvar</span>}
      </div>
      <Resultado r={erro ? { ok: false, mensagem: erro } : null} className="mt-2" />

      {escolhendo && (
        <EscolherVariavel modo="campo" titulo={`Pôr em ${escolhendo.rotulo}`} variaveis={variaveis} parametros={conferidos} fala={fala}
          onEscolher={(referencia) => { inserir(escolhendo.chave, referencia); setEscolhendo(null); }} onFechar={() => setEscolhendo(null)} />
      )}
      {editando && (editando.indice === null || sendoEditado) && (
        <EditarParametro inicial={sendoEditado?.p ?? null} usos={sendoEditado?.usos ?? []}
          outros={form.parametros.filter((_, i) => i !== editando.indice)} corpo={corpo} endereco={endereco} variaveis={variaveis} fala={fala}
          onSalvar={(p) => { gravarParametro(editando.indice, p); setEditando(null); }} onFechar={() => setEditando(null)} />
      )}
      {sendoTirado && (
        <Confirmar open onClose={() => setTirando(null)} titulo={`Tirar o parâmetro ${sendoTirado.p.nome}?`} botao="Tirar" perigoso
          onConfirm={() => { tirarParametro(tirando!); setTirando(null); }}
          texto={<div className="flex flex-col gap-2" id="robo-parametro-tirar">
            <p>O <span className="font-mono text-accent-ink">{`{{${sendoTirado.p.nome}}}`}</span> está em: <b>{sendoTirado.usos.join(', ')}</b>.</p>
            <p>
              Sem o parâmetro, esses campos ficam com o <span className="font-mono">{`{{${sendoTirado.p.nome}}}`}</span> sem valor (o aviso "não veio"
              aparece embaixo deles): troque lá por outro parâmetro, ou apague. Nada muda no robô até você salvar o mapa.
            </p>
          </div>} />
      )}
      {colando && <ColarPedido onFechar={() => setColando(false)} onUsar={(c) => { setColado(c); setFonte('colado'); setColando(false); }} />}
    </>
  );
}

// =====================================================================
//  OS PARÂMETROS E O "COMO DEVE CHEGAR O WEBHOOK"
// =====================================================================

function ParametrosDoWebhook({ conferidos, fala, onIncluir, onEditar, onTirar }: {
  conferidos: Conferido[]; fala: FalaDaFonte; onIncluir: () => void; onEditar: (i: number) => void; onTirar: (i: number) => void;
}) {
  const vieram = conferidos.filter((x) => x.veio).length;
  return (
    <section className="rounded-xl border border-line p-3 sm:p-4 mt-3 min-w-0" id="robo-parametros">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
        <ListPlus size={15} className="text-muted shrink-0" />
        <h3 className="text-[13.5px] font-semibold text-ink">Os parâmetros que chegam no webhook</h3>
        {conferidos.length > 0 && (
          <Chip tone={vieram === conferidos.length ? 'ok' : 'signal'} className="text-[11.5px]">vieram {vieram} de {conferidos.length} {fala.no}</Chip>
        )}
        <button type="button" className="btn-secondary btn-sm ml-auto" id="robo-parametro-incluir" onClick={onIncluir}><Plus size={14} /> Incluir parâmetro</button>
      </div>
      <p className="text-[12.5px] text-muted mt-1.5">
        Cada parâmetro dá um nome curto a uma coisa que chega — a resposta de uma pergunta do robô, um dado do contato, um parâmetro do
        endereço (<span className="font-mono">&amp;setor=…</span>) — e os campos do chamado usam o nome: <span className="font-mono">{'{{empresa}}'}</span>.
        Renomear muda os campos junto.
      </p>
      {!conferidos.length
        ? <p className="text-[13px] text-muted mt-2.5 border-t border-line pt-2.5">Nenhum parâmetro: os campos leem direto do pedido. Inclua um para dar nome ao que chega.</p>
        : (
          <ul className="mt-2 flex flex-col" id="robo-parametros-lista">
            {conferidos.map((x, i) => (
              <li key={`${x.p.nome}-${i}`} className="py-2.5 border-t border-line flex flex-col gap-1 min-w-0" id={`robo-parametro-${i}`}>
                <div className="flex items-start gap-2 min-w-0">
                  <div className="min-w-0 flex-1 flex flex-col gap-0.5">
                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 min-w-0">
                      <code className="font-mono text-[13px] font-semibold text-accent-ink break-all">{`{{${x.p.nome}}}`}</code>
                      {x.p.descricao && <span className="text-[12.5px] text-ink-2 min-w-0 break-words">{x.p.descricao}</span>}
                    </div>
                    <div className="text-[12px] text-muted min-w-0 break-words">
                      vem de <span className="font-mono text-ink-2 break-all">{x.p.origem}</span>
                      {x.p.exemplo && <> · exemplo: <span className="text-ink-2 break-words">{encurtar(x.p.exemplo, 80)}</span></>}
                    </div>
                  </div>
                  <div className="flex items-center shrink-0">
                    <button type="button" className="btn-ghost btn-sm" id={`robo-parametro-${i}-editar`} title={`Editar o parâmetro ${x.p.nome}`}
                      aria-label={`Editar o parâmetro ${x.p.nome}`} onClick={() => onEditar(i)}>
                      <Pencil size={14} /> <span className="hidden sm:inline">Editar</span>
                    </button>
                    <button type="button" className="btn-ghost btn-sm text-bad" id={`robo-parametro-${i}-tirar`} title={`Tirar o parâmetro ${x.p.nome}`}
                      aria-label={`Tirar o parâmetro ${x.p.nome}`} onClick={() => onTirar(i)}>
                      <Trash2 size={14} /> <span className="hidden sm:inline">Tirar</span>
                    </button>
                  </div>
                </div>
                <div className="flex flex-col gap-0.5 text-[12.5px] min-w-0">
                  <span className={`flex items-start gap-1.5 min-w-0 ${x.veio && x.valor ? 'text-ok' : 'text-signal'}`} id={`robo-parametro-${i}-veio`}>
                    {x.veio && x.valor ? <CircleCheck size={14} className="mt-0.5 shrink-0" /> : <CircleDashed size={14} className="mt-0.5 shrink-0" />}
                    <span className="min-w-0 break-words">
                      {!x.veio ? <>não veio {fala.no}</> : x.valor ? <>veio {fala.no}: <span className="text-ink-2">{encurtar(x.valor, 140)}</span></> : <>veio vazio {fala.no}</>}
                    </span>
                  </span>
                  <span className="text-[12px] text-muted min-w-0 break-words pl-5">
                    {x.usos.length ? <>usado em: {x.usos.join(', ')}</> : 'ainda não está em nenhum campo'}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
    </section>
  );
}

/** Por que a origem não achou nada neste pedido (o que conferir). */
function porQueNaoVeio(origem: string): string {
  const primeira = origem.split('||')[0]!.trim();
  if (/^(pergunta|menu)\s*:/i.test(primeira)) return 'Confira o texto: vale a pergunta inteira ou um pedaço que só ela tem.';
  if (/^endere[cç]o\s*:/i.test(primeira)) return 'Chega quando o endereço do webhook tiver esse parâmetro (&nome=…).';
  return 'Confira o caminho no botão "Escolher no pedido".';
}

/** Incluir (ou editar) um parâmetro: de onde vem — escolhido no pedido ou escrito —, o nome, o exemplo e para que serve. */
function EditarParametro({ inicial, usos, outros, corpo, endereco, variaveis, fala, onSalvar, onFechar }: {
  inicial: ParametroDoRobo | null;
  /** onde o parâmetro está (renomear muda junto) */
  usos: string[];
  /** os outros parâmetros do mapa: o nome não repete, e a origem pode apontar para um deles */
  outros: ParametroDoRobo[];
  corpo: unknown; endereco: Readonly<Record<string, string>>; variaveis: VariavelDoPedido[]; fala: FalaDaFonte;
  onSalvar: (p: ParametroDoRobo) => void; onFechar: () => void;
}) {
  const [nome, setNome] = useState(inicial?.nome ?? '');
  const [origem, setOrigem] = useState(inicial?.origem ?? '');
  const [exemplo, setExemplo] = useState(inicial?.exemplo ?? '');
  const [descricao, setDescricao] = useState(inicial?.descricao ?? '');
  const [escolhendo, setEscolhendo] = useState<'trocar' | 'somar' | null>(null);
  const [tentou, setTentou] = useState(false);
  /** o nome e o exemplo que a escolha no pedido sugeriu (a pessoa não mexeu): a próxima escolha troca */
  const sugeridos = useRef({ nome: false, exemplo: false });
  const campoOrigem = useRef<HTMLTextAreaElement | null>(null);

  const n = nome.trim();
  const peloSchema = ParametroDoRoboSchema.shape.nome.safeParse(nome);
  const erroNome = !n ? 'Dê um nome ao parâmetro: é como ele vai nos campos, entre {{ }}.'
    : !peloSchema.success ? peloSchema.error.issues[0]?.message ?? 'Esse nome não serve.'
      : outros.some((x) => paraBusca(x.nome) === paraBusca(n)) ? `Já há um parâmetro chamado ${n}: um nome para cada.` : null;
  const erroOrigem = problemaDaOrigem(origem) ?? (origem.length > 1_000 ? 'A origem vai até 1000 letras.' : null);
  const conferido = erroOrigem ? null : parametroNoPedido({ nome: n || '_', origem: origem.trim(), exemplo, descricao }, corpo, { parametros: outros, endereco });
  const renomeia = !!inicial && !!n && inicial.nome !== n;
  const pronto = !erroNome && !erroOrigem;

  const escolher = (referencia: string, v: VariavelDoPedido | null) => {
    if (escolhendo === 'somar' && origem.trim()) setOrigem(`${origem.trim()} || ${referencia}`);
    else {
      setOrigem(referencia);
      if (v && (!n || sugeridos.current.nome)) { setNome(sugerirNomeDoParametro(v, outros.map((x) => x.nome))); sugeridos.current.nome = true; }
      if (v && !v.vazio && (!exemplo.trim() || sugeridos.current.exemplo)) { setExemplo(v.valor.slice(0, 500)); sugeridos.current.exemplo = true; }
    }
    setEscolhendo(null);
  };
  /** "pergunta:", "menu:", "endereço:": o começo da origem, e o cursor no fim para escrever o resto */
  const comecar = (prefixo: string) => {
    const novo = `${prefixo} ${origem.trim().replace(/^(pergunta|menu|endere[cç]o)\s*:\s*/i, '')}`.trimEnd() + (origem.trim() ? '' : ' ');
    setOrigem(novo);
    // o foco já, no clique: o que a pessoa digitar em seguida cai na caixa (o texto novo leva o cursor para o fim)
    campoOrigem.current?.focus();
  };
  const salvar = () => {
    setTentou(true);
    if (!pronto) return;
    const r = ParametroDoRoboSchema.safeParse({ nome: n, origem, exemplo, descricao });
    if (r.success) onSalvar(r.data);
  };

  return (
    <>
      <Modal open onClose={onFechar} titulo={inicial ? `O parâmetro ${inicial.nome}` : 'Incluir um parâmetro'} largura="max-w-xl"
        rodape={<>
          <button type="button" className="btn-ghost" onClick={onFechar}>Cancelar</button>
          <button type="button" className="btn-primary" id="robo-parametro-salvar" disabled={tentou && !pronto} onClick={salvar}>
            {inicial ? 'Pronto' : 'Incluir'}
          </button>
        </>}>
        <div className="flex flex-col gap-4" id="robo-parametro">
          <div className="flex flex-col gap-1">
            <label htmlFor="robo-parametro-origem" className="text-[13px] font-semibold text-ink">De onde vem no pedido</label>
            <div className="flex items-start gap-1.5">
              {/* o texto da pergunta é longo: a caixa cresce para ele aparecer inteiro (o Enter não quebra a linha) */}
              <textarea id="robo-parametro-origem" ref={campoOrigem} spellCheck={false} value={origem} placeholder="pergunta: o nome da empresa"
                rows={origem.length > 50 ? 3 : 2} aria-invalid={(tentou || !!origem) && !!erroOrigem || undefined}
                className={`input font-mono text-[12.5px] flex-1 min-w-0 resize-y ${(tentou || origem) && erroOrigem ? 'border-bad' : ''}`}
                onKeyDown={(e) => { if (e.key === 'Enter') e.preventDefault(); }}
                onChange={(e) => setOrigem(e.target.value.replace(/\s*\n\s*/g, ' '))} />
              <button type="button" className="btn-secondary btn-sm shrink-0 mt-[3px]" id="robo-parametro-escolher" onClick={() => setEscolhendo('trocar')}>
                <Braces size={14} /> <span className="hidden sm:inline">Escolher no pedido</span><span className="sm:hidden">Escolher</span>
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-1 text-[12px]">
              <span className="text-muted">Escrever:</span>
              {([['pergunta:', 'a pergunta pelo texto'], ['menu:', 'o menu pelo texto'], ['endereço:', 'um parâmetro do endereço']] as const).map(([p, t]) => (
                <button key={p} type="button" className="px-1.5 py-0.5 rounded-md border border-line font-mono text-ink-2 hover:bg-surface-2" title={t} onClick={() => comecar(p)}>{p}</button>
              ))}
              {origem.trim() && !erroOrigem && (
                <button type="button" className="px-1.5 py-0.5 rounded-md border border-line text-ink-2 hover:bg-surface-2" id="robo-parametro-alternativa"
                  title="Se esta não vier, vale a próxima (||)" onClick={() => setEscolhendo('somar')}>+ uma alternativa</button>
              )}
            </div>
            {(tentou || origem) && erroOrigem
              ? <p className="text-[12px] text-bad" role="alert">{erroOrigem}</p>
              : conferido && (
                <p className={`text-[12.5px] flex items-start gap-1.5 min-w-0 ${conferido.veio && conferido.valor ? 'text-ok' : 'text-signal'}`} id="robo-parametro-previa">
                  {conferido.veio && conferido.valor ? <CircleCheck size={14} className="mt-0.5 shrink-0" /> : <CircleDashed size={14} className="mt-0.5 shrink-0" />}
                  <span className="min-w-0 break-words">
                    {!conferido.veio ? <>Não veio {fala.no}. {porQueNaoVeio(origem)}</>
                      : conferido.valor ? <>Veio {fala.no}: <span className="text-ink-2">{encurtar(conferido.valor, 200)}</span></> : <>Veio vazio {fala.no}.</>}
                  </span>
                </p>
              )}
            <p className="text-[11.5px] text-muted">
              O caminho no JSON (<span className="font-mono">contact.name</span>), a resposta de uma pergunta do robô pelo texto
              (<span className="font-mono">pergunta: o nome da empresa</span>; nos menus, <span className="font-mono">menu: …</span>) ou um parâmetro do
              endereço do webhook (<span className="font-mono">endereço: setor</span>, de <span className="font-mono">…/robo?chave=…&amp;setor=suporte</span>).
              Com <span className="font-mono">||</span> vale a primeira que vier; <span className="font-mono">"texto"</span> no fim é fixo.
            </p>
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="robo-parametro-nome" className="text-[13px] font-semibold text-ink">Nome</label>
            <input id="robo-parametro-nome" className={`input font-mono max-w-[320px] ${(tentou || n) && erroNome ? 'border-bad' : ''}`} maxLength={40} spellCheck={false}
              autoComplete="off" value={nome} placeholder="empresa" aria-invalid={(tentou || !!n) && !!erroNome || undefined}
              onChange={(e) => { setNome(e.target.value); sugeridos.current.nome = false; }} />
            {(tentou || n) && erroNome
              ? <p className="text-[12px] text-bad" role="alert">{erroNome}</p>
              : <p className="text-[11.5px] text-muted">Nos campos, vai assim: <span className="font-mono text-accent-ink">{`{{${n || 'nome'}}}`}</span>. Letras, números, _ e -.</p>}
            {renomeia && usos.length > 0 && !erroNome && (
              <p className="text-[12px] text-ink-2" id="robo-parametro-renomeia">
                Os campos que usam <span className="font-mono">{`{{${inicial!.nome}}}`}</span> passam a usar <span className="font-mono">{`{{${n}}}`}</span>: {usos.join(', ')}.
              </p>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1 min-w-0">
              <label htmlFor="robo-parametro-exemplo" className="text-[13px] font-semibold text-ink">Exemplo <span className="font-normal text-muted">(opcional)</span></label>
              <input id="robo-parametro-exemplo" className="input" maxLength={500} value={exemplo} placeholder="Line Telecom"
                onChange={(e) => { setExemplo(e.target.value); sugeridos.current.exemplo = false; }} />
              <p className="text-[11.5px] text-muted">Vai no "Como deve chegar o webhook".</p>
            </div>
            <div className="flex flex-col gap-1 min-w-0">
              <label htmlFor="robo-parametro-descricao" className="text-[13px] font-semibold text-ink">Para que serve <span className="font-normal text-muted">(opcional)</span></label>
              <input id="robo-parametro-descricao" className="input" maxLength={200} value={descricao} placeholder="A empresa do contato"
                onChange={(e) => setDescricao(e.target.value)} />
              <p className="text-[11.5px] text-muted">Para quem mexer depois.</p>
            </div>
          </div>
          <p className="text-[12px] text-muted">O parâmetro entra no mapa com o "Salvar o mapa".</p>
        </div>
      </Modal>
      {escolhendo && (
        <EscolherVariavel modo="origem" titulo={escolhendo === 'somar' ? 'Uma alternativa: se a primeira não vier' : 'De onde vem o parâmetro'}
          variaveis={variaveis} fala={fala} onEscolher={escolher} onFechar={() => setEscolhendo(null)} />
      )}
    </>
  );
}

/** "Como deve chegar o webhook": o endereço e o JSON que o mapa espera, montados com os parâmetros e os exemplos. */
function ComoDeveChegar({ base, form, onExperimentar }: { base: string; form: MapaDoRobo; onExperimentar: () => void }) {
  const esperado = useMemo(() => pedidoEsperado(form), [form]);
  const noEndereco = Object.entries(esperado.endereco).filter(([k]) => paraBusca(k) !== 'chave');
  const endereco = `${base}/api/atendimento/entrada/robo?chave=<chave>${noEndereco.map(([k, v]) => `&${naUrl(k)}=${naUrl(v)}`).join('')}`;
  const vazio = !Object.keys(esperado.corpo).length && !noEndereco.length;
  return (
    <section className="rounded-xl border border-line p-3 sm:p-4 mt-3 min-w-0" id="robo-como-chega">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
        <Webhook size={15} className="text-muted shrink-0" />
        <h3 className="text-[13.5px] font-semibold text-ink">Como deve chegar o webhook</h3>
        {!vazio && (
          <button type="button" className="btn-ghost btn-sm ml-auto" id="robo-como-chega-experimentar" onClick={onExperimentar}
            title="Usar este pedido como o pedido de exemplo: os parâmetros, os campos e o Como fica saem dele">
            <FlaskConical size={14} /> Experimentar o mapa com ele
          </button>
        )}
      </div>
      <p className="text-[12.5px] text-muted mt-1.5">
        O que este mapa lê, montado com os parâmetros e o exemplo de cada um (o que um campo lê direto do pedido vai com <span className="font-mono">"&lt;…&gt;"</span>).
        O LineChat manda isso dentro do JSON da conversa, que traz mais coisas: o resto fica de fora. Nas perguntas e nos menus, o código do bloco é
        o do seu robô — o Gestor acha a resposta pelo texto da pergunta.
      </p>
      <div className="text-[12.5px] font-semibold text-ink-2 mt-3 mb-1">O endereço (POST)</div>
      <Copiavel texto={endereco} rotulo="o endereço do webhook" id="robo-como-chega-endereco" />
      <div className="text-[12.5px] font-semibold text-ink-2 mt-3 mb-1">O JSON</div>
      {vazio
        ? <p className="text-[13px] text-muted" id="robo-como-chega-vazio">O mapa ainda não lê nada do pedido: inclua um parâmetro.</p>
        : <BlocoDeCodigo texto={JSON.stringify([esperado.corpo], null, 2)} rotulo="o JSON esperado" id="robo-como-chega-json" className="max-h-[340px] overflow-y-auto" />}
    </section>
  );
}

// =====================================================================
//  AS PEÇAS
// =====================================================================

function LinhaDoMapa({ chave, rotulo, dica, linhas, exemplo, valor, saida, faltaram, problema, doPainel = false, sempreSaida = false, onChange, onVariavel, registrar, onFoco }: {
  chave: string; rotulo: string; dica: ReactNode; linhas?: number; exemplo: string; valor: string; saida: string; faltaram: string[]; problema: string | null;
  doPainel?: boolean; sempreSaida?: boolean; onChange: (v: string) => void; onVariavel: () => void;
  registrar: (el: HTMLInputElement | HTMLTextAreaElement | null) => void; onFoco: () => void;
}) {
  const id = `robo-${chave.replace(':', '-')}`;
  const comum = {
    id, value: valor, spellCheck: false, placeholder: exemplo, 'aria-invalid': !!problema || undefined,
    className: `input font-mono text-[12.5px] flex-1 min-w-0 ${problema ? 'border-bad' : ''}`,
    onChange: (e: { target: { value: string } }) => onChange(e.target.value), onFocus: onFoco,
  };
  return (
    <div className="grid gap-1 sm:grid-cols-[150px_minmax(0,1fr)] sm:gap-3 py-2.5 border-t border-line">
      <label htmlFor={id} className="text-[13px] font-semibold text-ink sm:pt-2 break-words">
        {rotulo}{doPainel && <span className="block text-[11px] font-normal text-muted">campo do painel</span>}
      </label>
      <div className="min-w-0 flex flex-col gap-1">
        <div className="flex items-start gap-1.5">
          {linhas
            ? <textarea {...comum} ref={registrar} rows={linhas} className={`${comum.className} resize-y`} />
            : <input {...comum} ref={registrar} />}
          <button type="button" className="btn-secondary btn-sm shrink-0 mt-[3px]" id={`${id}-variavel`} title={`Pôr um parâmetro (ou uma variável do pedido) em ${rotulo}`}
            aria-label={`Pôr um parâmetro em ${rotulo}`} onMouseDown={(e) => e.preventDefault()} onClick={onVariavel}>
            <Braces size={14} /> <span className="hidden sm:inline">Variável</span>
          </button>
        </div>
        {problema
          ? <p className="text-[12px] text-bad" role="alert">{problema}</p>
          : (valor.trim() || sempreSaida) && <Saida texto={saida} varias={!!linhas} faltaram={faltaram} vazio={sempreSaida ? 'sem mensagem: o robô segue sem mandar nada' : undefined} />}
        <p className="text-[11.5px] text-muted">{dica}</p>
      </div>
    </div>
  );
}

/** O que sai deste campo com o pedido de exemplo. */
function Saida({ texto, varias, faltaram, vazio = 'fica vazio com este pedido' }: { texto: string; varias: boolean; faltaram: string[]; vazio?: string }) {
  return (
    <div className="text-[12.5px] flex flex-col gap-0.5 min-w-0">
      <div className="flex items-start gap-1.5 min-w-0">
        <span className="text-muted shrink-0" aria-hidden>→</span>
        {texto
          ? <span className={`text-ink-2 min-w-0 break-words ${varias ? 'whitespace-pre-wrap line-clamp-3' : ''}`}>{texto}</span>
          : <span className="text-muted italic">{vazio}</span>}
      </div>
      {faltaram.length > 0 && (
        <span className="text-signal break-words">Não veio neste pedido: {faltaram.map((c) => `{{${c}}}`).join(', ')}. Confira o nome nos parâmetros (ou na lista do botão Variável).</span>
      )}
    </div>
  );
}

function SobreOUltimo({ ultimo }: { ultimo: UltimoPedidoDoRobo | null }) {
  if (!ultimo) return <p className="text-[12.5px] text-muted" id="robo-ultimo">O robô ainda não chamou. Quando chamar, o pedido dele fica aqui, com as variáveis de verdade (as perguntas e os menus do seu robô).</p>;
  const r = ultimo.resultado;
  const doEndereco = Object.entries(ultimo.endereco ?? {});
  return (
    <div className="text-[12.5px] flex flex-col gap-1 min-w-0" id="robo-ultimo">
      <p className={`break-words ${r.ok ? 'text-ink-2' : 'text-bad'}`}>
        <b>Último pedido:</b> {dataHoraCurta(ultimo.em)}, pela chave {ultimo.chave} —{' '}
        {!r.ok ? <>não abriu: {r.erro}</>
          : r.criado ? <>abriu o <LinkDoChamado codigo={r.codigo} className="font-semibold text-accent-ink hover:underline">{r.codigo}</LinkDoChamado>.</>
            : r.anotou ? <>anotou no <LinkDoChamado codigo={r.codigo} className="font-semibold text-accent-ink hover:underline">{r.codigo}</LinkDoChamado> (a conversa já tinha chamado aberto).</>
              : <>a conversa já tinha o <LinkDoChamado codigo={r.codigo} className="font-semibold text-accent-ink hover:underline">{r.codigo}</LinkDoChamado> aberto.</>}
      </p>
      {doEndereco.length > 0 && (
        <p className="text-muted break-words" id="robo-ultimo-endereco">
          No endereço (sem a chave): <span className="font-mono text-[12px] text-ink-2 break-all">{doEndereco.map(([k, v]) => `${k}=${encurtar(v, 60)}`).join(' · ')}</span>
        </p>
      )}
      {r.ok && r.ignorados.length > 0 && (
        <div className="text-signal">
          Ficou de fora:
          <ul className="list-disc pl-5">{r.ignorados.map((x) => <li key={x} className="break-words">{x}</li>)}</ul>
        </div>
      )}
      {(r.faltaram ?? []).length > 0 && (
        <div className="text-signal" id="robo-ultimo-faltaram">
          Não vieram neste pedido (o campo ficou vazio):
          <ul className="list-disc pl-5">{(r.faltaram ?? []).map((x) => <li key={x} className="break-words font-mono text-[12px]">{x}</li>)}</ul>
          <span className="text-muted">É outra cópia do robô? A pergunta pelo texto (pergunta: …) vale nas duas.</span>
        </div>
      )}
    </div>
  );
}

type EstadoDaPrevia = { previa: PreviaDoRobo | null; carregando: boolean; erro: string | null };

/** O "Como fica", perguntado ao servidor a cada pausa na digitação (o mapa com problema não vai). */
function usePreviaDoRobo(mapa: MapaDoRobo | null, corpo: unknown, endereco: Readonly<Record<string, string>>): EstadoDaPrevia {
  const [estado, setEstado] = useState<EstadoDaPrevia>({ previa: null, carregando: true, erro: null });
  const vez = useRef(0);
  useEffect(() => {
    const minha = ++vez.current;
    if (!mapa) { setEstado((e) => ({ ...e, carregando: false })); return; }
    setEstado((e) => ({ ...e, carregando: true }));
    const t = window.setTimeout(() => {
      api.atendimento.experimentarRobo(mapa, corpo, { ...endereco })
        .then((previa) => { if (vez.current === minha) setEstado({ previa, carregando: false, erro: null }); })
        .catch((e: unknown) => { if (vez.current === minha) setEstado({ previa: null, carregando: false, erro: erroLegivel(e) }); });
    }, 400);
    return () => window.clearTimeout(t);
  }, [mapa, corpo, endereco]);
  return estado;
}

function ComoFica({ estado, problema, resposta, exemplo }: { estado: EstadoDaPrevia; problema: string | null; resposta: RespostaAoRobo | null; exemplo: boolean }) {
  return (
    <section className="rounded-xl border border-line bg-surface-2 p-3 sm:p-4 mt-3 min-w-0" id="robo-como-fica" aria-live="polite">
      <div className="flex items-center gap-2 mb-2">
        <Eye size={15} className="text-muted shrink-0" />
        <h3 className="text-[13px] font-semibold text-ink">Como fica o chamado, com este pedido</h3>
        {estado.carregando && !problema && <Spinner />}
      </div>
      {problema ? <p className="text-[13px] text-bad">{problema}</p>
        : estado.erro ? <p className="text-[13px] text-bad">{estado.erro}</p>
          : estado.previa ? <ChamadoDaPrevia previa={estado.previa} />
            : <p className="text-[13px] text-muted">Montando…</p>}
      {!problema && !estado.erro && resposta && (
        <div className="mt-3 flex flex-col gap-1 min-w-0" id="robo-resposta">
          <span className="text-[12.5px] font-semibold text-ink-2">
            A resposta ao robô (HTTP 200){resposta.response === 'CHAMADO_ABERTO' && exemplo ? ' — o número é um exemplo' : ''}
          </span>
          <pre className="font-mono text-[12px] leading-relaxed text-ink bg-surface border border-line rounded-lg p-2.5 overflow-x-auto whitespace-pre-wrap break-words">
            {JSON.stringify(resposta, null, 2)}
          </pre>
        </div>
      )}
    </section>
  );
}

function Item({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <>
      <dt className="text-muted text-[12.5px] pt-px">{rotulo}</dt>
      <dd className="min-w-0 break-words text-ink-2">{children}</dd>
    </>
  );
}

function ChamadoDaPrevia({ previa }: { previa: PreviaDoRobo }) {
  const r = previa.resolvido;
  if (!r.ok) return <p className="text-[13px] text-bad flex items-start gap-1.5" id="robo-como-fica-erro"><TriangleAlert size={15} className="mt-0.5 shrink-0" /> {r.erro}</p>;
  const c = r.chamado;
  const contato = [c.nome, c.telefone ? telefoneLegivel(c.telefone) : null].filter(Boolean).join(' · ');
  return (
    <div className="flex flex-col gap-2.5 text-[13px] min-w-0">
      <div className="flex flex-wrap items-center gap-2 min-w-0">
        <Chip tone="accent">{c.painel.sigla}</Chip>
        <span className="font-semibold text-ink min-w-0 break-words" id="robo-como-fica-titulo">{c.titulo}</span>
        <ChipPrioridade p={c.prioridade} curta />
      </div>
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1">
        <Item rotulo="Painel">{c.painel.nome}</Item>
        <Item rotulo="Contato">{contato || '—'}</Item>
        <Item rotulo="Cliente">{c.cliente ? c.cliente.nome : <span className="text-muted">{c.telefone ? 'pelo WhatsApp, se o Gestor já conhecer o número' : '—'}</span>}</Item>
        {c.assunto && <Item rotulo="Assunto">{c.assunto.caminho}</Item>}
        {c.etiquetas.length > 0 && <Item rotulo="Etiquetas"><Etiquetas lista={c.etiquetas} /></Item>}
        {c.campos.map((x) => <Item key={x.id} rotulo={x.nome}>{x.texto}</Item>)}
        <Item rotulo="Conversa">{c.sessaoId ? <span className="font-mono text-[12px] break-all">{c.sessaoId}</span> : '—'}</Item>
        {c.relato && <Item rotulo="Relato"><span className="whitespace-pre-wrap line-clamp-4">{c.relato}</span></Item>}
        {c.descricao && <Item rotulo="Descrição"><span className="whitespace-pre-wrap line-clamp-4">{c.descricao}</span></Item>}
      </dl>
      {c.ignorados.length > 0 && (
        <div className="rounded-lg bg-signal-soft text-signal p-2.5 text-[12.5px]" id="robo-como-fica-fora">
          <p className="font-semibold">Fica de fora (o chamado abre do mesmo jeito):</p>
          <ul className="list-disc pl-5">{c.ignorados.map((x) => <li key={x} className="break-words">{x}</li>)}</ul>
        </div>
      )}
      {previa.aberto && (
        <p className="text-[12.5px] text-muted flex items-start gap-1.5">
          <Info size={14} className="mt-0.5 shrink-0" />
          <span>Esta conversa já tem o <LinkDoChamado codigo={previa.aberto.codigo} className="font-semibold text-accent-ink hover:underline">{previa.aberto.codigo}</LinkDoChamado> aberto: um pedido dela agora viraria anotação nele, sem abrir outro.</span>
        </p>
      )}
    </div>
  );
}

/**
 * A lista para escolher. No campo (`modo: 'campo'`): os parâmetros primeiro, e embaixo o resto do pedido.
 * Na origem de um parâmetro (`modo: 'origem'`): as variáveis do pedido. A busca acha o nome, o caminho, o
 * valor ou a pergunta.
 */
function EscolherVariavel({ modo, titulo, variaveis, parametros = [], fala, onEscolher, onFechar }: {
  modo: 'campo' | 'origem'; titulo: string; variaveis: VariavelDoPedido[]; parametros?: Conferido[]; fala: FalaDaFonte;
  onEscolher: (referencia: string, v: VariavelDoPedido | null) => void; onFechar: () => void;
}) {
  const [busca, setBusca] = useState('');
  const termo = paraBusca(busca);
  const achadas = termo ? variaveis.filter((v) => paraBusca(`${v.caminho} ${v.valor} ${v.dica ?? ''}`).includes(termo)) : variaveis;
  const achados = modo !== 'campo' ? [] : termo
    ? parametros.filter((x) => paraBusca(`${x.p.nome} ${x.p.origem} ${x.p.descricao} ${x.valor}`).includes(termo)) : parametros;
  return (
    <Modal open onClose={onFechar} titulo={titulo} largura="max-w-2xl">
      <div className="flex flex-col gap-3" id="robo-variaveis">
        <div className="sticky -top-4 z-10 bg-surface pt-1 pb-2 -mt-1 flex flex-col gap-1">
          <input className="input" id="robo-variaveis-busca" autoFocus value={busca} onChange={(e) => setBusca(e.target.value)}
            placeholder={modo === 'campo' ? 'Procurar: o parâmetro, a pergunta, o valor ou o caminho' : 'Procurar: a pergunta, o valor ou o caminho'} />
          <p className="text-[12px] text-muted">
            {modo === 'campo'
              ? <>Os parâmetros do webhook primeiro; embaixo, o resto {fala.do}, com o valor que veio nele. O caminho que não está aqui também vale: escreva {'{{caminho}}'} no campo.</>
              : <>As variáveis {fala.do}, com o valor que veio nele. A resposta de pergunta e de menu entra pelo texto da pergunta (vale nas cópias do robô); o código do bloco fica embaixo. O que não está aqui também vale: escreva no campo.</>}
          </p>
        </div>
        {!achadas.length && !achados.length && (
          <p className="text-[13px] text-muted">{variaveis.length || parametros.length ? 'Nada com esse texto.' : 'Este pedido não tem nenhuma variável.'}</p>
        )}
        {achados.length > 0 && (
          <section className="flex flex-col gap-1" id="robo-variaveis-parametros">
            <h4 className="text-[11.5px] font-semibold uppercase tracking-wide text-muted">Os parâmetros do webhook</h4>
            <ul className="flex flex-col gap-1">
              {achados.map((x) => (
                <li key={x.p.nome} className="rounded-lg border border-line hover:border-accent min-w-0 overflow-hidden">
                  <button type="button" onClick={() => onEscolher(x.p.nome, null)} className="w-full text-left px-3 py-2 hover:bg-accent-soft min-w-0 flex flex-col gap-0.5">
                    <span className="flex flex-wrap items-baseline gap-x-2 min-w-0">
                      <span className="font-mono text-[12.5px] font-semibold text-accent-ink break-all">{`{{${x.p.nome}}}`}</span>
                      {x.p.descricao && <span className="text-[12.5px] text-ink-2 min-w-0 break-words">{x.p.descricao}</span>}
                    </span>
                    <span className="text-[12px] text-muted break-all">vem de <span className="font-mono">{x.p.origem}</span></span>
                    <span className="text-[12.5px] text-muted break-words line-clamp-2">
                      {!x.veio ? <i>não veio neste pedido</i> : x.valor ? <>→ {x.valor}</> : <i>vazio neste pedido</i>}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
        {achados.length > 0 && achadas.length > 0 && <p className="text-[12px] text-muted -mb-1 pt-1 border-t border-line">Ou direto do pedido, sem parâmetro:</p>}
        {GRUPOS_DAS_VARIAVEIS.map((g) => {
          const doGrupo = achadas.filter((v) => v.grupo === g);
          if (!doGrupo.length) return null;
          return (
            <section key={g} className="flex flex-col gap-1">
              <h4 className="text-[11.5px] font-semibold uppercase tracking-wide text-muted">{NOME_GRUPO_DA_VARIAVEL[g]}</h4>
              <ul className="flex flex-col gap-1">
                {doGrupo.map((v) => (
                  <li key={v.caminho} className="rounded-lg border border-line hover:border-accent min-w-0 overflow-hidden">
                    <button type="button" onClick={() => onEscolher(v.porTexto ?? v.caminho, v)} className="w-full text-left px-3 py-2 hover:bg-accent-soft min-w-0 flex flex-col gap-0.5"
                      title={v.porTexto ? 'Pela pergunta (vale nas cópias do robô)' : undefined}>
                      {v.dica && <span className="text-[13px] font-medium text-ink break-words">{v.dica}</span>}
                      <span className="font-mono text-[12px] text-accent-ink break-all">{v.porTexto ? `{{${v.porTexto.replace(/^(pergunta|menu): (.{60}).+$/s, '$1: $2…')}}}` : `{{${v.caminho}}}`}</span>
                      <span className="text-[12.5px] text-muted break-words">{v.vazio ? <i>vazio neste pedido</i> : <>→ {v.valor}</>}</span>
                    </button>
                    {v.porTexto && (
                      <button type="button" onClick={() => onEscolher(v.caminho, v)} className="w-full text-left px-3 py-1.5 border-t border-line text-[12px] text-muted hover:bg-surface-2 hover:text-ink min-w-0 break-all">
                        ou pelo código do bloco: <span className="font-mono">{`{{${v.caminho}}}`}</span>
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </Modal>
  );
}

/** Colar um pedido (o JSON que o LineChat mostra no histórico do bloco, ou o de outro sistema) e, se quiser, o endereço dele. */
function ColarPedido({ onFechar, onUsar }: { onFechar: () => void; onUsar: (c: Colado) => void }) {
  const [texto, setTexto] = useState('');
  const [url, setUrl] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const usar = () => {
    let corpo: unknown;
    try { corpo = JSON.parse(texto); } catch { setErro('Isso não é um JSON: copie o pedido inteiro, do { (ou do [) até o fim.'); return; }
    if (corpo === null || typeof corpo !== 'object') { setErro('O pedido precisa ser um objeto JSON (começa com { ou [).'); return; }
    // a chave, se vier no endereço colado, sai aqui mesmo (nem vai ao servidor)
    onUsar({ corpo, endereco: url.trim() ? parametrosDaUrl(url) : {}, deOnde: 'colado' });
  };
  return (
    <Modal open onClose={onFechar} titulo="Colar um pedido" largura="max-w-2xl"
      rodape={<>
        <button type="button" className="btn-ghost" onClick={onFechar}>Cancelar</button>
        <button type="button" className="btn-primary" id="robo-colar-usar" disabled={!texto.trim()} onClick={usar}>Usar este pedido</button>
      </>}>
      <div className="flex flex-col gap-2">
        <p className="text-[13px] text-ink-2">
          Cole o JSON que o robô mandou (o LineChat mostra no histórico do bloco Webhook) ou o de outro sistema. Ele serve só para montar o
          mapa: nada é salvo nem aberto.
        </p>
        <textarea className="input font-mono text-[12px] min-h-[220px]" id="robo-colar-texto" spellCheck={false} autoFocus value={texto}
          placeholder={'[{"sessionId": "…", "contact": {"name": "…"}, "questions": {…}}]'}
          onChange={(e) => { setTexto(e.target.value); setErro(null); }} />
        <label htmlFor="robo-colar-endereco" className="text-[13px] font-semibold text-ink mt-1">
          O endereço que o robô chamou <span className="font-normal text-muted">(opcional)</span>
        </label>
        <input id="robo-colar-endereco" className="input font-mono text-[12px]" spellCheck={false} autoComplete="off" value={url}
          placeholder="…/api/atendimento/entrada/robo?chave=…&setor=suporte" onChange={(e) => setUrl(e.target.value)} />
        <p className="text-[11.5px] text-muted">Para os parâmetros do endereço (&amp;setor=…). A chave, se vier junto, fica de fora.</p>
        <Resultado r={erro ? { ok: false, mensagem: erro } : null} className="mt-0" />
      </div>
    </Modal>
  );
}
