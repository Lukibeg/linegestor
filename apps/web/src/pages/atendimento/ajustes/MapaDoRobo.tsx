/**
 * Chamados › Ajustes › Integrações (Patch 2.0.1) — o MAPA DO ROBÔ: de onde vem cada campo do chamado no
 * JSON que o robô do LineChat manda. O pedido do Luan: "Eu quero que a gente possa alterar esse JSON…
 * para que não tenha que ser algo bem fixo… até porque depois possa trocar. Então, alguma parte onde eu
 * possa montar as referências com as variáveis."
 *
 *  - cada campo é um texto com as variáveis do pedido entre {{ }} ("Atendimento de {{contact.name}}");
 *    o botão "Variável" abre a lista das que o pedido tem — a resposta de cada pergunta e de cada menu do
 *    robô com a pergunta ao lado (o id do bloco, "cb-…-qst-…", não diz nada a ninguém) — e põe a
 *    escolhida onde está o cursor;
 *  - as variáveis vêm do último pedido do robô (o Gestor guarda), de um pedido colado ou do exemplo do
 *    LineChat; embaixo de cada campo, o texto que sai com aquele pedido;
 *  - "Como fica" pergunta ao servidor o chamado que nasceria, sem abrir nada: é o mesmo resolvedor que
 *    abre de verdade (o cliente, o assunto e as opções achados, e o que ficaria de fora);
 *  - a resposta da pergunta entra pelo texto dela ({{pergunta: …}}), que vale nas cópias do robô (a de
 *    teste e a de produção têm os blocos com outros códigos); pelo código do bloco também dá;
 *  - a mensagem ao cliente volta na resposta ao robô (o bloco "Enviar webhook" do LineChat), e o "Como
 *    fica" mostra a resposta inteira.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Braces, ChevronDown, ClipboardPaste, Eye, Info, RotateCcw, TriangleAlert, Undo2, Waypoints } from 'lucide-react';
import {
  aplicarMapaDoRobo, EXEMPLO_DO_LINECHAT, GRUPOS_DAS_VARIAVEIS, mapaDeFabrica, MENSAGEM_DO_ROBO_PADRAO, NOME_CAMPO_DO_MAPA, NOME_GRUPO_DA_VARIAVEL, paraBusca,
  preencherMensagem, problemaDoModelo, respostaAoRobo, respostaDoRoboQueFalhou, telefoneLegivel, variaveisDoPedido,
  type CampoDoMapa, type CampoPersonalizado, type MapaDoRobo, type PreviaDoRobo, type RespostaAoRobo, type RoboTela, type UltimoPedidoDoRobo, type VariavelDoPedido,
} from '@gestor/shared';
import { api } from '../../../api/index.js';
import { Carregando, Chip, Modal, Spinner, mensagemErro, useToast } from '../../../components/ui/index.js';
import { ChipPrioridade, dataHoraCurta, Etiquetas, LinkDoChamado, useOpcoes } from '../comum.js';
import { CartaoAjuste, Explicacao, Resultado, erroLegivel } from './Avisos.js';

export const CHAVE_ROBO = ['atendimento', 'integracoes', 'robo'];

type Fonte = 'ultimo' | 'exemplo' | 'colado';
type Linha = { chave: CampoDoMapa; dica: ReactNode; linhas?: number; exemplo: string };

/** Os campos que quase todo robô usa (o mapa de fábrica já preenche). */
const PRINCIPAIS: Linha[] = [
  { chave: 'titulo', exemplo: 'Atendimento de {{contact.name}}', dica: 'Vazio (ou com as variáveis vazias), o chamado fica "Atendimento de <nome do contato>".' },
  { chave: 'relato', linhas: 3, exemplo: '{{lastContactMessage}}', dica: 'O que o cliente disse. Na mesma conversa aberta, o relato novo vira anotação no chamado que já existe.' },
  { chave: 'telefone', exemplo: '{{contact.phonenumber}}', dica: 'Com ele o Gestor acha o cliente que já conhece. O "+55|71…" do LineChat é arrumado sozinho.' },
  { chave: 'nome', exemplo: '{{contact.name}}', dica: 'O nome do contato.' },
  { chave: 'sessaoId', exemplo: '{{sessionId}}', dica: 'O id da conversa: a mesma conversa aberta não vira dois chamados, e a ficha ganha o link "Conversa no LineChat".' },
  { chave: 'etiquetas', exemplo: 'robô, whatsapp', dica: 'Separadas por vírgula. Texto fixo também vale.' },
];
/** Os que dependem das perguntas e dos menus de cada robô. */
const MAIS: Linha[] = [
  { chave: 'descricao', linhas: 2, exemplo: 'Setor: {{menu: …}}', dica: 'O que a equipe lê. Dá para juntar várias respostas num texto só.' },
  { chave: 'cliente', exemplo: '{{pergunta: …}}', dica: 'O nome (fantasia ou razão social) ou o CNPJ. Sem achar, o Gestor procura o cliente pelo WhatsApp do contato.' },
  { chave: 'assunto', exemplo: '{{menu: …}}', dica: 'O caminho ("Ramal › Configuração"), o nome ou um nome do de-para do assunto (Ajustes › Campos › Assunto): é assim que a resposta do menu vira assunto.' },
  { chave: 'prioridade', exemplo: 'Alta', dica: 'Crítica, Alta, Média ou Baixa: escrita aqui ou numa variável.' },
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

// =====================================================================
//  O CARTÃO
// =====================================================================

export function CartaoMapaDoRobo() {
  const q = useQuery({ queryKey: CHAVE_ROBO, queryFn: () => api.atendimento.robo() });
  return (
    <CartaoAjuste id="integ-mapa" icone={<Waypoints size={18} />} titulo="O mapa do robô: de onde vem cada campo do chamado">
      {q.isLoading ? <Carregando /> : q.isError || !q.data ? <p className="text-bad text-sm" role="alert">{mensagemErro(q.error)}</p> : <EditorDoMapa tela={q.data} />}
    </CartaoAjuste>
  );
}

function EditorDoMapa({ tela }: { tela: RoboTela }) {
  const qc = useQueryClient(); const toast = useToast();
  const opcoes = useOpcoes();
  const [form, setForm] = useState<MapaDoRobo>(() => copia(tela.mapa));
  const [fonte, setFonte] = useState<Fonte>(tela.ultimo ? 'ultimo' : 'exemplo');
  const [colado, setColado] = useState<unknown>(null);
  const [colando, setColando] = useState(false);
  const [escolhendo, setEscolhendo] = useState<{ chave: string; rotulo: string } | null>(null);
  const [mais, setMais] = useState(() => MAIS.some((l) => tela.mapa[l.chave].trim()) || Object.values(tela.mapa.campos).some((t) => t.trim()));
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const elementos = useRef<Record<string, HTMLInputElement | HTMLTextAreaElement | null>>({});
  /** os campos em que a pessoa já pôs o cursor (sem cursor, a variável entra no fim) */
  const tocados = useRef(new Set<string>());

  // o último pedido que chegou depois de a tela abrir (o robô chamou agora): a lista acompanha
  useEffect(() => { if (tela.ultimo && fonte === 'exemplo' && colado === null) setFonte('ultimo'); }, [tela.ultimo]); // eslint-disable-line react-hooks/exhaustive-deps

  const corpo = fonte === 'ultimo' && tela.ultimo ? tela.ultimo.corpo : fonte === 'colado' && colado !== null ? colado : EXEMPLO_DO_LINECHAT;
  const variaveis = useMemo(() => variaveisDoPedido(corpo), [corpo]);
  const pedido = useMemo(() => aplicarMapaDoRobo(form, corpo), [form, corpo]);

  const ativos = (opcoes.data?.paineis ?? []).filter((p) => p.ativo);
  const painelId = form.painel || ativos[0]?.id || '';
  const escolhidoSaiu = !!form.painel && !!opcoes.data && !ativos.some((p) => p.id === form.painel);
  const doPainel = (opcoes.data?.campos ?? []).filter((c) => c.painelId === painelId && c.ativo).sort((a, b) => a.ordem - b.ordem);

  const valorDe = (chave: string) => (chave.startsWith('campo:') ? form.campos[chave.slice(6)] ?? '' : chave === 'mensagem' ? form.mensagem : form[chave as CampoDoMapa]);
  const mudar = (chave: string, v: string) => {
    setErro(null);
    setForm((f) => (chave.startsWith('campo:') ? { ...f, campos: { ...f.campos, [chave.slice(6)]: v } } : { ...f, [chave]: v }));
  };
  const inserir = (chave: string, caminho: string) => {
    const el = elementos.current[chave];
    const atual = valorDe(chave);
    const marca = `{{${caminho}}}`;
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

  // o texto com a variável aberta não salva (nem vai para o "Como fica": o servidor recusaria)
  const problemas: Array<[string, string]> = [];
  for (const l of [...PRINCIPAIS, ...MAIS]) { const p = problemaDoModelo(form[l.chave]); if (p) problemas.push([l.chave, p]); }
  for (const c of doPainel) { const p = problemaDoModelo(form.campos[c.id] ?? ''); if (p) problemas.push([`campo:${c.id}`, p]); }
  const problemaDaMensagem = problemaDoModelo(form.mensagem);
  if (problemaDaMensagem) problemas.push(['mensagem', problemaDaMensagem]);
  const problemaDe = (chave: string) => problemas.find(([k]) => k === chave)?.[1] ?? null;
  const nomeDe = (chave: string) => (chave.startsWith('campo:') ? doPainel.find((c) => c.id === chave.slice(6))?.nome ?? 'um campo'
    : chave === 'mensagem' ? 'a Mensagem ao cliente' : NOME_CAMPO_DO_MAPA[chave as CampoDoMapa]);
  const previa = usePreviaDoRobo(problemas.length ? null : form, corpo);

  // a mensagem e a resposta ao robô com este pedido: o número de um chamado novo ainda não existe (vai um de exemplo)
  const sigla = ativos.find((p) => p.id === painelId)?.sigla ?? 'SUP';
  const aberto = previa.previa?.aberto ?? null;
  const codigoDoExemplo = aberto?.codigo ?? `${sigla}-12`;
  const mensagem = preencherMensagem(form.mensagem, { codigo: codigoDoExemplo, contato: pedido.nome || null }, corpo);
  const resposta: RespostaAoRobo | null = !previa.previa ? null
    : aberto || previa.previa.resolvido.ok ? respostaAoRobo(form, { codigo: codigoDoExemplo, contato: pedido.nome || null }, corpo) : respostaDoRoboQueFalhou();

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

  return (
    <>
      <Explicacao>
        <p>
          O robô manda o JSON da conversa do jeito dele. Aqui você diz de onde sai cada campo do chamado: um texto com as <b>variáveis do
          pedido entre {'{{ }}'}</b>, que o Gestor troca pelo valor que veio. O botão <b>Variável</b> mostra as que o pedido tem — a resposta de
          cada pergunta do robô aparece com a pergunta ao lado. Se o robô mudar (ou for outro sistema), é só mudar o mapa.
        </p>
        <p className="text-[12.5px] text-muted">
          A resposta de uma pergunta entra pelo texto dela — {'{{pergunta: o motivo do seu contato}}'}, {'{{menu: …}}'} nos menus —, que vale
          também na cópia do robô (a de teste e a de produção têm os blocos com outros códigos). {'{{a || b || c}}'} usa a primeira que vier
          com valor; {'{{a || "texto"}}'} termina num texto fixo. O que vier e não bater (o assunto que não existe, a opção que não é do campo)
          fica de fora, e o chamado abre do mesmo jeito.
        </p>
      </Explicacao>

      <div className="rounded-xl border border-line p-3 flex flex-col gap-2 min-w-0" id="robo-pedido">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[12.5px] font-semibold text-ink-2">As variáveis vêm de</span>
          <div className="flex flex-wrap gap-1" role="group" aria-label="De onde vêm as variáveis">
            {([['ultimo', 'o último pedido do robô'], ['exemplo', 'o exemplo do LineChat'], ['colado', 'um pedido colado']] as const).map(([v, nome]) => {
              const desativado = (v === 'ultimo' && !tela.ultimo) || (v === 'colado' && colado === null);
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
        <SobreOUltimo ultimo={tela.ultimo} />
        {fonte === 'exemplo' && <p className="text-[12.5px] text-muted">O exemplo é um pedido de mentira no formato do LineChat: os ids das perguntas e dos menus do seu robô aparecem no último pedido (ou no que você colar).</p>}
      </div>

      <div className="mt-3 flex flex-col">
        <div className="grid gap-1 sm:grid-cols-[150px_minmax(0,1fr)] sm:gap-3 py-2.5">
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
                  exemplo={c.tipo === 'lista' || c.tipo === 'lista_varios' ? '{{menus…answer}}' : ''}
                  valor={form.campos[c.id] ?? ''} saida={pedido.campos[c.id] ?? ''} faltaram={pedido.faltaram[chave] ?? []} problema={problemaDe(chave)} doPainel
                  onChange={(v) => mudar(chave, v)} onVariavel={() => setEscolhendo({ chave, rotulo: c.nome })}
                  registrar={(el) => { elementos.current[chave] = el; }} onFoco={() => tocados.current.add(chave)} />
              );
            })}
          </div>
        )}
        <LinhaDoMapa chave="mensagem" rotulo="Mensagem ao cliente" linhas={2} exemplo={MENSAGEM_DO_ROBO_PADRAO}
          dica={<>Volta na resposta ao robô (em "messages"), e o LineChat manda ao cliente. <span className="font-mono">{'{codigo}'}</span> é o número do
            chamado; <span className="font-mono">{'{contato}'}</span>, o nome do contato; as variáveis do pedido também valem. Vazia, o robô segue sem mensagem.</>}
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
          <button type="button" className="btn-ghost" id="robo-de-fabrica" title="O mapa de fábrica: o nome, o WhatsApp, a conversa e a última mensagem (falta salvar)"
            onClick={() => { setForm(mapaDeFabrica()); setErro(null); }}><RotateCcw size={15} /> Voltar ao de fábrica</button>
        )}
        {mudou && <span className="text-[12.5px] text-signal">há mudanças sem salvar</span>}
      </div>
      <Resultado r={erro ? { ok: false, mensagem: erro } : null} className="mt-2" />

      {escolhendo && (
        <EscolherVariavel rotulo={escolhendo.rotulo} variaveis={variaveis} fonte={fonte}
          onEscolher={(caminho) => { inserir(escolhendo.chave, caminho); setEscolhendo(null); }} onFechar={() => setEscolhendo(null)} />
      )}
      {colando && <ColarPedido onFechar={() => setColando(false)} onUsar={(c) => { setColado(c); setFonte('colado'); setColando(false); }} />}
    </>
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
          <button type="button" className="btn-secondary btn-sm shrink-0 mt-[3px]" id={`${id}-variavel`} title={`Pôr uma variável do pedido em ${rotulo}`}
            aria-label={`Pôr uma variável em ${rotulo}`} onMouseDown={(e) => e.preventDefault()} onClick={onVariavel}>
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
        <span className="text-signal break-words">Não veio neste pedido: {faltaram.map((c) => `{{${c}}}`).join(', ')}. Confira o nome na lista de variáveis.</span>
      )}
    </div>
  );
}

function SobreOUltimo({ ultimo }: { ultimo: UltimoPedidoDoRobo | null }) {
  if (!ultimo) return <p className="text-[12.5px] text-muted" id="robo-ultimo">O robô ainda não chamou. Quando chamar, o pedido dele fica aqui, com as variáveis de verdade (as perguntas e os menus do seu robô).</p>;
  const r = ultimo.resultado;
  return (
    <div className="text-[12.5px] flex flex-col gap-1 min-w-0" id="robo-ultimo">
      <p className={`break-words ${r.ok ? 'text-ink-2' : 'text-bad'}`}>
        <b>Último pedido:</b> {dataHoraCurta(ultimo.em)}, pela chave {ultimo.chave} —{' '}
        {!r.ok ? <>não abriu: {r.erro}</>
          : r.criado ? <>abriu o <LinkDoChamado codigo={r.codigo} className="font-semibold text-accent-ink hover:underline">{r.codigo}</LinkDoChamado>.</>
            : r.anotou ? <>anotou no <LinkDoChamado codigo={r.codigo} className="font-semibold text-accent-ink hover:underline">{r.codigo}</LinkDoChamado> (a conversa já tinha chamado aberto).</>
              : <>a conversa já tinha o <LinkDoChamado codigo={r.codigo} className="font-semibold text-accent-ink hover:underline">{r.codigo}</LinkDoChamado> aberto.</>}
      </p>
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
          <span className="text-muted">É outra cópia do robô? A pergunta pelo texto ({'{{pergunta: …}}'}) vale nas duas.</span>
        </div>
      )}
    </div>
  );
}

type EstadoDaPrevia = { previa: PreviaDoRobo | null; carregando: boolean; erro: string | null };

/** O "Como fica", perguntado ao servidor a cada pausa na digitação (o mapa com problema não vai). */
function usePreviaDoRobo(mapa: MapaDoRobo | null, corpo: unknown): EstadoDaPrevia {
  const [estado, setEstado] = useState<EstadoDaPrevia>({ previa: null, carregando: true, erro: null });
  const vez = useRef(0);
  useEffect(() => {
    const minha = ++vez.current;
    if (!mapa) { setEstado((e) => ({ ...e, carregando: false })); return; }
    setEstado((e) => ({ ...e, carregando: true }));
    const t = window.setTimeout(() => {
      api.atendimento.experimentarRobo(mapa, corpo)
        .then((previa) => { if (vez.current === minha) setEstado({ previa, carregando: false, erro: null }); })
        .catch((e: unknown) => { if (vez.current === minha) setEstado({ previa: null, carregando: false, erro: erroLegivel(e) }); });
    }, 400);
    return () => window.clearTimeout(t);
  }, [mapa, corpo]);
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

/** A lista das variáveis do pedido, para pôr no campo: a busca acha o caminho, o valor ou a pergunta. */
function EscolherVariavel({ rotulo, variaveis, fonte, onEscolher, onFechar }: {
  rotulo: string; variaveis: VariavelDoPedido[]; fonte: Fonte; onEscolher: (caminho: string) => void; onFechar: () => void;
}) {
  const [busca, setBusca] = useState('');
  const termo = paraBusca(busca);
  const achadas = termo ? variaveis.filter((v) => paraBusca(`${v.caminho} ${v.valor} ${v.dica ?? ''}`).includes(termo)) : variaveis;
  const deOnde = fonte === 'ultimo' ? 'do último pedido do robô' : fonte === 'colado' ? 'do pedido colado' : 'do exemplo do LineChat';
  return (
    <Modal open onClose={onFechar} titulo={`Pôr uma variável em ${rotulo}`} largura="max-w-2xl">
      <div className="flex flex-col gap-3" id="robo-variaveis">
        <div className="sticky -top-4 z-10 bg-surface pt-1 pb-2 -mt-1 flex flex-col gap-1">
          <input className="input" id="robo-variaveis-busca" autoFocus placeholder="Procurar: a pergunta, o valor ou o caminho" value={busca} onChange={(e) => setBusca(e.target.value)} />
          <p className="text-[12px] text-muted">
            As variáveis {deOnde}, com o valor que veio nele. A resposta de pergunta e de menu entra pelo texto da pergunta (vale nas cópias do
            robô); o código do bloco fica embaixo. O caminho que não está aqui também vale: escreva {'{{caminho}}'} no campo.
          </p>
        </div>
        {!achadas.length && <p className="text-[13px] text-muted">{variaveis.length ? 'Nada com esse texto.' : 'Este pedido não tem nenhuma variável.'}</p>}
        {GRUPOS_DAS_VARIAVEIS.map((g) => {
          const doGrupo = achadas.filter((v) => v.grupo === g);
          if (!doGrupo.length) return null;
          return (
            <section key={g} className="flex flex-col gap-1">
              <h4 className="text-[11.5px] font-semibold uppercase tracking-wide text-muted">{NOME_GRUPO_DA_VARIAVEL[g]}</h4>
              <ul className="flex flex-col gap-1">
                {doGrupo.map((v) => (
                  <li key={v.caminho} className="rounded-lg border border-line hover:border-accent min-w-0 overflow-hidden">
                    <button type="button" onClick={() => onEscolher(v.porTexto ?? v.caminho)} className="w-full text-left px-3 py-2 hover:bg-accent-soft min-w-0 flex flex-col gap-0.5"
                      title={v.porTexto ? 'Põe a resposta pelo texto da pergunta (vale nas cópias do robô)' : undefined}>
                      {v.dica && <span className="text-[13px] font-medium text-ink break-words">{v.dica}</span>}
                      <span className="font-mono text-[12px] text-accent-ink break-all">{v.porTexto ? `{{${v.porTexto.replace(/^(pergunta|menu): (.{60}).+$/s, '$1: $2…')}}}` : `{{${v.caminho}}}`}</span>
                      <span className="text-[12.5px] text-muted break-words">{v.vazio ? <i>vazio neste pedido</i> : <>→ {v.valor}</>}</span>
                    </button>
                    {v.porTexto && (
                      <button type="button" onClick={() => onEscolher(v.caminho)} className="w-full text-left px-3 py-1.5 border-t border-line text-[12px] text-muted hover:bg-surface-2 hover:text-ink min-w-0 break-all">
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

/** Colar um pedido (o JSON que o LineChat mostra no histórico do bloco, ou o de outro sistema). */
function ColarPedido({ onFechar, onUsar }: { onFechar: () => void; onUsar: (corpo: unknown) => void }) {
  const [texto, setTexto] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const usar = () => {
    let corpo: unknown;
    try { corpo = JSON.parse(texto); } catch { setErro('Isso não é um JSON: copie o pedido inteiro, do { (ou do [) até o fim.'); return; }
    if (corpo === null || typeof corpo !== 'object') { setErro('O pedido precisa ser um objeto JSON (começa com { ou [).'); return; }
    onUsar(corpo);
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
        <Resultado r={erro ? { ok: false, mensagem: erro } : null} className="mt-0" />
      </div>
    </Modal>
  );
}
