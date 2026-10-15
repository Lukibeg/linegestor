/**
 * Chamados › Ajustes (Patch 2.0) — Avisos e WhatsApp.
 *
 * Dois números, os dois ligados no LineChat: o oficial, pelo qual o cliente recebe o que o atendente
 * manda (e só quando ele manda — a escolha do Luan), e um não oficial, pelo qual a equipe recebe os
 * avisos (recebeu um chamado, o prazo vencendo, chegou um Crítico…). Aqui ficam o endereço da API de
 * mensagens, a chave (a do LineChat ou uma própria, que vai para o cofre e nunca volta para a tela),
 * os dois números e o teste; a mensagem ao cliente — pelo modelo aprovado do WhatsApp oficial (o
 * template: o pedido do Luan, "vou usar o meu WhatsApp oficial, então temos que usar os templates"),
 * com as variáveis ligadas ao chamado, ou em texto livre —; o WhatsApp de cada pessoa da equipe — o
 * pedido dele: "definir os números dos colaboradores que vão receber essas notificações" — e quais
 * avisos vão por onde (na tela, no WhatsApp).
 *
 * As peças dos cartões de ajustes (o cartão, a explicação, o resultado de um teste, a última vez, os
 * marcadores do texto e a prévia da mensagem) moram aqui e servem também às outras telas de ajustes
 * dos chamados (Respostas prontas, Agendados e Integrações), para as quatro falarem do mesmo jeito.
 */
import { useRef, useState, type ReactNode, type RefObject } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { BellRing, CheckCircle2, Download, FileImage, KeyRound, MessageCircle, MessageSquareText, Plus, Send, TriangleAlert, Users, X } from 'lucide-react';
import {
  EVENTOS_AVISO, NOME_EVENTO_AVISO, NOME_TIPO_ARQUIVO_DO_MODELO, TIPOS_ARQUIVO_DO_MODELO, mensagemPreenchida, numeroWhatsApp, preencherModelo,
  valorSugeridoDaVariavel,
  type AvisosChamadosEntrada, type AvisosChamadosTela, type CanaisDoAviso, type EnvioAoCliente, type EventoAviso, type ModeloDoLineChat,
  type ModelosDoLineChat, type TipoArquivoDoModelo,
} from '@gestor/shared';
import { api } from '../../../api/index.js';
import { ApiError } from '../../../api/types.js';
import { Campo, Carregando, Chip, Spinner, Toggle, mensagemErro, usePaginaLocal, useToast } from '../../../components/ui/index.js';
import { useAuth } from '../../../lib/auth.js';
import { TdN, ThN, contar } from '../../../lib/contagem.js';
import { data } from '../../../lib/format.js';
import { ordenarLista, Th, useOrdenacaoLocal } from '../../../lib/ordenacao.js';
import { telefoneLegivel, usePode } from '../comum.js';

// =====================================================================
//  AS PEÇAS DOS CARTÕES DE AJUSTES (as outras telas de ajustes dos chamados importam daqui)
// =====================================================================

/**
 * O cartão de um ajuste, no jeito de Administração › Ajustes: o ícone (verde quando ligado), o título,
 * a situação e o conteúdo. `ligado` indefinido = um cartão que não liga nem desliga (só explica).
 */
export function CartaoAjuste({ id, icone, titulo, ligado, situacao, acoes, children }: {
  id?: string; icone: ReactNode; titulo: ReactNode; ligado?: boolean; situacao?: ReactNode; acoes?: ReactNode; children: ReactNode;
}) {
  const tom = ligado === true ? 'bg-ok-soft text-ok' : ligado === false ? 'bg-surface-2 text-muted' : 'bg-accent-soft text-accent-ink';
  return (
    // o cabeçalho do sistema fica preso no alto: quem pula para o cartão não pode cair embaixo dele
    <section id={id} className="card p-4 sm:p-5 min-w-0 scroll-mt-20">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 mb-1">
        <span className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${tom}`}>{icone}</span>
        <h2 className="font-display font-semibold text-lg min-w-0">{titulo}</h2>
        {situacao}
        {acoes && <div className="ml-auto flex flex-wrap items-center gap-2">{acoes}</div>}
      </div>
      {children}
    </section>
  );
}

/** O "o que é isto" de cada cartão, com o fio do lado (o mesmo de Administração › Ajustes). */
export function Explicacao({ children }: { children: ReactNode }) {
  return <div className="text-[13.5px] text-ink-2 leading-relaxed border-l-2 border-line pl-3 my-3 flex flex-col gap-2">{children}</div>;
}

export type ResultadoTeste = { ok: boolean; mensagem: string };

/** Como foi (um teste, um salvar que falhou): logo abaixo do botão que a pessoa apertou. */
export function Resultado({ r, className = 'mt-3' }: { r: ResultadoTeste | null; className?: string }) {
  if (!r) return null;
  return (
    <div role={r.ok ? 'status' : 'alert'} className={`text-[13px] flex items-start gap-2 rounded-lg p-2.5 ${r.ok ? 'bg-ok-soft text-ok' : 'bg-bad-soft text-bad'} ${className}`}>
      {r.ok ? <CheckCircle2 size={15} className="mt-0.5 shrink-0" /> : <TriangleAlert size={15} className="mt-0.5 shrink-0" />}
      <span className="min-w-0 break-words">{r.mensagem}</span>
    </div>
  );
}

/** "Último teste: 10/10/2026 14:32 — deu certo. Aceito pelo LineChat (200)." */
export function UltimaVez({ rotulo, em, ok, msg, nunca = 'nenhum ainda' }: { rotulo: string; em: string | null; ok: boolean | null; msg: string | null; nunca?: string }) {
  if (!em) return <p className="text-[12.5px] text-muted mt-3">{rotulo}: {nunca}.</p>;
  return (
    <p className={`text-[12.5px] mt-3 break-words ${ok ? 'text-muted' : 'text-bad'}`}>
      {rotulo}: <span className="tnum">{data(em, true)}</span> — {ok ? 'deu certo' : 'falhou'}{msg ? `. ${msg}` : ''}
    </p>
  );
}

/**
 * O erro do servidor dito para quem preenche: a validação devolve "regra.dias — Escolha pelo menos um
 * dia"; o nome técnico do campo não ajuda ninguém, então fica só a frase.
 */
export function erroLegivel(e: unknown): string {
  // o limite de pedidos responde em inglês ("Rate limit exceeded…"): os testes (WhatsApp, webhook) esbarram nele
  if (e instanceof ApiError && e.status === 429) return 'Muitas tentativas seguidas: espere um minuto e tente de novo.';
  if (e instanceof ApiError && Array.isArray(e.details) && e.details.length) {
    const frases = [...new Set(e.details.map((d) => d?.message).filter((m): m is string => !!m))];
    if (frases.length) return frases.join(' · ');
  }
  return mensagemErro(e);
}

/**
 * O liga/desliga de uma linha de tabela: igual ao Toggle, mas sem o texto do lado (a coluna já diz o que
 * é) e com o nome no aria-label — numa tabela que rola de lado, cada coluna a menos conta.
 */
export function Interruptor({ ligado, onChange, rotulo, desativado = false }: { ligado: boolean; onChange: (v: boolean) => void; rotulo: string; desativado?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={ligado} aria-label={rotulo} title={rotulo} disabled={desativado} onClick={() => onChange(!ligado)}
      className={`w-10 h-6 rounded-full transition-colors relative shrink-0 align-middle disabled:opacity-50 ${ligado ? 'bg-accent' : 'bg-line-strong'}`}>
      <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all ${ligado ? 'left-[18px]' : 'left-0.5'}`} />
    </button>
  );
}

/** "Ana, José e Carla". */
export const emLista = (xs: string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} e ${xs[xs.length - 1]}`);

export type Marcador = { chave: string; dica: string };

/**
 * Os botões que põem um marcador ({contato}, {codigo}…) onde está o cursor do texto — digitar a
 * chave certa à mão é o jeito mais fácil de errar ("{cotato}" sai no WhatsApp do cliente).
 */
export function Marcadores({ marcadores, campo, valor, onChange }: { marcadores: Marcador[]; campo: RefObject<HTMLTextAreaElement | HTMLInputElement | null>; valor: string; onChange: (v: string) => void }) {
  const inserir = (chave: string) => {
    const el = campo.current;
    const marca = `{${chave}}`;
    const ini = el?.selectionStart ?? valor.length;
    const fim = el?.selectionEnd ?? ini;
    onChange(valor.slice(0, ini) + marca + valor.slice(fim));
    // o cursor volta para depois do marcador, para continuar escrevendo dali
    requestAnimationFrame(() => { if (!el) return; el.focus(); el.setSelectionRange(ini + marca.length, ini + marca.length); });
  };
  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Pôr um marcador no texto">
        <span className="text-[12px] text-muted mr-0.5">Pôr no texto:</span>
        {marcadores.map((m) => (
          <button key={m.chave} type="button" title={m.dica} onMouseDown={(e) => e.preventDefault()} onClick={() => inserir(m.chave)}
            className="px-2 py-0.5 rounded-md border border-line bg-accent-soft text-accent-ink text-[12px] font-mono hover:border-accent">
            {`{${m.chave}}`}
          </button>
        ))}
      </div>
      <p className="text-[11.5px] text-muted">{marcadores.map((m) => `{${m.chave}} ${m.dica}`).join(' · ')}</p>
    </div>
  );
}

/** A mensagem como vai chegar no WhatsApp (a prévia, com valores de exemplo). */
export function BalaoDeMensagem({ texto, vazio = 'a mensagem fica vazia' }: { texto: string; vazio?: string }) {
  return (
    <div className="rounded-xl rounded-tl-sm border border-line bg-ok-soft text-ink px-3.5 py-2.5 text-[13.5px] leading-relaxed whitespace-pre-wrap break-words max-w-[560px]">
      {texto || <span className="text-muted italic">{vazio}</span>}
    </div>
  );
}

// =====================================================================
//  A TELA
// =====================================================================

const CHAVE = ['atendimento', 'ajustes', 'avisos'];

/** Os marcadores da mensagem ao cliente (os que o servidor preenche ao mandar). */
const MARCADORES_CLIENTE: Marcador[] = [
  { chave: 'contato', dica: 'o nome do contato' },
  { chave: 'codigo', dica: 'o código do chamado (SUP-12)' },
  { chave: 'titulo', dica: 'o título do chamado' },
  { chave: 'cliente', dica: 'a empresa' },
  { chave: 'texto', dica: 'o que o atendente escreveu' },
];
const EXEMPLO_CLIENTE = {
  contato: 'Maria', codigo: 'SUP-12', titulo: 'Ligações de saída não completam', cliente: 'Clínica Aurora', responsavel: 'Lúcio Andrade', eu: 'Luan França',
  texto: 'Ajustamos a rota de saída do seu PABX. Pode testar e nos dizer se voltou ao normal?',
};
/** O que pode ir numa variável do modelo: um valor do chamado, ou um texto fixo (que também aceita os marcadores). */
const VALORES_DA_VARIAVEL: Array<{ valor: string; nome: string }> = [
  { valor: '{contato}', nome: 'o nome do contato' },
  { valor: '{codigo}', nome: 'o código do chamado (SUP-12)' },
  { valor: '{titulo}', nome: 'o título do chamado' },
  { valor: '{cliente}', nome: 'a empresa' },
  { valor: '{texto}', nome: 'o que o atendente escreveu' },
  { valor: '{responsavel}', nome: 'o responsável pelo chamado' },
  { valor: '{eu}', nome: 'quem manda a mensagem' },
];
const TEXTO_FIXO = '__fixo';

type PessoaForm = { userId: string; nome: string; numero: string; ativo: boolean };
type VariavelForm = { nome: string; valor: string };
type ModeloForm = { id: string; nome: string; texto: string; variaveis: VariavelForm[]; tipoArquivo: TipoArquivoDoModelo; arquivo: string };
type Form = {
  ativo: boolean; url: string; usarChaveDoLineChat: boolean; numeroCliente: string; numeroEquipe: string;
  envioCliente: EnvioAoCliente; modeloCliente: string; template: ModeloForm; equipeLineChat: string; atribuirAQuemManda: boolean;
  pessoas: PessoaForm[]; eventos: Record<EventoAviso, CanaisDoAviso>;
};
const SEM_MODELO: ModeloForm = { id: '', nome: '', texto: '', variaveis: [], tipoArquivo: 'UNDEFINED', arquivo: '' };

/** O que veio do servidor, no jeito do formulário: os números legíveis, como a pessoa escreve. */
const doServidor = (a: AvisosChamadosTela): Form => ({
  ativo: a.ativo, url: a.url, usarChaveDoLineChat: a.usarChaveDoLineChat,
  numeroCliente: telefoneLegivel(a.numeroCliente), numeroEquipe: telefoneLegivel(a.numeroEquipe),
  envioCliente: a.envioCliente ?? 'modelo', modeloCliente: a.modeloCliente,
  template: a.template ? {
    id: a.template.id, nome: a.template.nome ?? '', texto: a.template.texto ?? '', tipoArquivo: a.template.tipoArquivo ?? 'UNDEFINED', arquivo: a.template.arquivo ?? '',
    variaveis: (a.template.variaveis ?? []).map((v) => ({ nome: v.nome, valor: v.valor })),
  } : SEM_MODELO,
  equipeLineChat: a.equipeLineChat ?? '', atribuirAQuemManda: !!a.atribuirAQuemManda,
  pessoas: a.pessoas.map((p) => ({ userId: p.userId, nome: p.nome, numero: telefoneLegivel(p.numero), ativo: p.ativo })),
  eventos: Object.fromEntries(EVENTOS_AVISO.map((e) => [e, { tela: a.eventos[e]?.tela ?? true, whatsapp: a.eventos[e]?.whatsapp ?? false }])) as Record<EventoAviso, CanaisDoAviso>,
});

/** Ao sair do campo, o número válido fica escrito do jeito de ler: "71999990000" vira "(71) 99999-0000". */
const arrumarNumero = (v: string) => { const n = numeroWhatsApp(v); return n ? telefoneLegivel(n) : v; };

/** Por que um número de quem envia ainda não serve (nulo = pronto). */
function oQueFalta(a: AvisosChamadosTela, numero: string, cliente = false): string | null {
  const temChave = a.usarChaveDoLineChat ? a.temChaveLineChat : a.temChavePropria;
  return !temChave ? 'falta a chave' : !numero ? 'falta o número'
    : cliente && a.envioCliente === 'modelo' && !a.template?.id ? 'falta o modelo'
      : cliente && a.envioCliente === 'modelo' && a.template && a.template.tipoArquivo !== 'UNDEFINED' && !a.template.arquivo ? 'falta o arquivo do modelo' : null;
}

/**
 * As conferências antes de mandar, ditas para quem preenche. O servidor confere de novo, mas há duas
 * que ele faz calado e que a tela precisa dizer: o número de quem envia que não é WhatsApp vira vazio
 * ao salvar, e a mensagem sem o {texto} mandaria ao cliente tudo, menos o que o atendente escreveu.
 */
function conferir(f: Form, chave: string, inicial: AvisosChamadosTela): { geral: string | null; pessoas: Record<string, string> } {
  const pessoas: Record<string, string> = {};
  for (const p of f.pessoas) if (p.numero.trim() && !numeroWhatsApp(p.numero)) pessoas[p.userId] = 'não é um WhatsApp: use DDD + número';
  const erradas = f.pessoas.filter((p) => pessoas[p.userId]).map((p) => p.nome);
  let urlOk = false;
  try { const u = new URL(f.url.trim()); urlOk = u.protocol === 'https:' || u.protocol === 'http:'; } catch { /* fica falso */ }
  const t = f.template;
  const nomes = t.variaveis.map((v) => v.nome.trim().toLowerCase());
  const geral = !urlOk ? 'O endereço da API de mensagens está inválido: comece com https:// (o do LineChat é https://api.inglinechat.com.br/chat/v1/message/send).'
    : f.numeroCliente.trim() && !numeroWhatsApp(f.numeroCliente) ? 'O número para o cliente não é um WhatsApp: use DDD + número, como (71) 3034-8350.'
      : f.numeroEquipe.trim() && !numeroWhatsApp(f.numeroEquipe) ? 'O número para a equipe não é um WhatsApp: use DDD + número, como (71) 99999-0000.'
        : f.envioCliente === 'texto' && !f.modeloCliente.includes('{texto}') ? 'A mensagem ao cliente precisa do {texto}: é onde entra o que o atendente escreveu.'
          : f.modeloCliente.trim().length > 2000 ? 'A mensagem ao cliente passou de 2.000 letras.'
            : !t.id.trim() && t.variaveis.length ? 'Escreva o id do modelo aprovado (ou tire as variáveis).'
              : nomes.some((n) => !n) ? 'Cada variável do modelo precisa do nome (como está no LineChat).'
                : new Set(nomes).size !== nomes.length ? 'Uma variável do modelo está repetida.'
                  : t.arquivo.trim() && !/^https:\/\/\S+$/i.test(t.arquivo.trim()) ? 'O arquivo do cabeçalho do modelo precisa de um endereço com https://.'
                    : erradas.length ? `Confira o WhatsApp de ${emLista(erradas)}: use DDD + número, como (71) 99999-0000.`
                      : f.ativo && !f.usarChaveDoLineChat && !inicial.temChavePropria && !chave.trim() ? 'Cole a chave própria da API (ou escolha usar a chave do LineChat).'
                        : null;
  return { geral, pessoas };
}

export function AjustesAvisos() {
  const q = useQuery({ queryKey: CHAVE, queryFn: () => api.atendimento.ajustesAvisos() });
  if (q.isLoading) return <Carregando />;
  if (q.isError || !q.data) return <p className="text-bad text-sm" role="alert">{mensagemErro(q.error)}</p>;
  return <TelaAvisos inicial={q.data} />;
}

function TelaAvisos({ inicial }: { inicial: AvisosChamadosTela }) {
  const qc = useQueryClient(); const toast = useToast(); const pode = usePode();
  const [f, setF] = useState<Form>(() => doServidor(inicial));
  const [chave, setChave] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [errosPessoas, setErrosPessoas] = useState<Record<string, string>>({});
  const chaveNova = !f.usarChaveDoLineChat && !!chave.trim();
  const mudou = JSON.stringify(f) !== JSON.stringify(doServidor(inicial)) || chaveNova;
  const mudar = (m: Partial<Form>) => { setF((x) => ({ ...x, ...m })); setErro(null); };
  const mudarPessoa = (userId: string, m: Partial<PessoaForm>) => {
    setF((x) => ({ ...x, pessoas: x.pessoas.map((p) => (p.userId === userId ? { ...p, ...m } : p)) }));
    setErrosPessoas(({ [userId]: _, ...resto }) => resto);
    setErro(null);
  };
  const recebem = f.pessoas.filter((p) => numeroWhatsApp(p.numero) && p.ativo).length;

  const salvar = async () => {
    const c = conferir(f, chave, inicial);
    setErrosPessoas(c.pessoas);
    if (c.geral) { setErro(c.geral); return; }
    setSalvando(true); setErro(null);
    try {
      const t = f.template;
      const entrada: AvisosChamadosEntrada = {
        ativo: f.ativo, url: f.url.trim(), usarChaveDoLineChat: f.usarChaveDoLineChat,
        // a chave só vai quando a pessoa escreveu uma (vazio = mantém a guardada)
        ...(chaveNova ? { chave: chave.trim() } : {}),
        numeroCliente: f.numeroCliente.trim(), numeroEquipe: f.numeroEquipe.trim(), envioCliente: f.envioCliente, modeloCliente: f.modeloCliente.trim(),
        template: t.id.trim() ? {
          id: t.id.trim(), nome: t.nome.trim(), texto: t.texto, tipoArquivo: t.tipoArquivo, arquivo: t.tipoArquivo === 'UNDEFINED' ? '' : t.arquivo.trim(),
          variaveis: t.variaveis.map((v) => ({ nome: v.nome.trim(), valor: v.valor.trim() })),
        } : null,
        equipeLineChat: f.equipeLineChat.trim(), atribuirAQuemManda: f.atribuirAQuemManda,
        pessoas: f.pessoas.map((p) => ({ userId: p.userId, numero: p.numero.trim(), ativo: p.ativo })),
        eventos: f.eventos,
      };
      const novo = await api.atendimento.salvarAvisos(entrada);
      qc.setQueryData(CHAVE, novo);
      setF(doServidor(novo)); setChave('');
      // a ficha mostra os botões de WhatsApp só quando dá para mandar (vem nas opções do módulo)
      void qc.invalidateQueries({ queryKey: ['atendimento', 'opcoes'] });
      toast.push('ok', novo.ativo ? 'Avisos salvos: o WhatsApp dos chamados está ligado.' : 'Avisos salvos. O WhatsApp está desligado (os avisos na tela valem sempre).');
    } catch (e) { setErro(erroLegivel(e)); } finally { setSalvando(false); }
  };

  const faltaCliente = oQueFalta(inicial, inicial.numeroCliente, true);
  const faltaEquipe = oQueFalta(inicial, inicial.numeroEquipe);

  return (
    <div className="flex flex-col gap-4 max-w-4xl">
      <form autoComplete="off" onSubmit={(e) => e.preventDefault()} className="flex flex-col gap-4">
        {/* ---------- o WhatsApp: liga, os números, a chave ---------- */}
        <CartaoAjuste
          icone={<MessageCircle size={18} />} titulo="WhatsApp dos chamados" ligado={inicial.ativo}
          situacao={inicial.ativo ? (
            <span className="flex flex-wrap gap-1.5">
              <Chip tone="ok">ligado</Chip>
              <Chip tone={faltaCliente ? 'signal' : 'ok'}>{faltaCliente ? `cliente: ${faltaCliente}` : 'cliente: pronto'}</Chip>
              <Chip tone={faltaEquipe ? 'signal' : 'ok'}>{faltaEquipe ? `equipe: ${faltaEquipe}` : 'equipe: pronto'}</Chip>
            </span>
          ) : <Chip tone="muted">desligado</Chip>}
        >
          <Explicacao>
            <p className="text-ink font-medium">
              O cliente só recebe mensagem quando o atendente manda, pelo número oficial; a equipe recebe os avisos por um número não
              oficial, os dois ligados no LineChat.
            </p>
            <p>
              Os avisos na tela (o sininho e o cartão no canto) valem sempre. Aqui se liga o WhatsApp: a mensagem sai pela API de mensagens do
              LineChat, a mesma do envio automático do PDF. O aviso da equipe vai escondido, sem virar conversa no LineChat.
            </p>
          </Explicacao>

          <div className="flex flex-col gap-3">
            <label className="flex items-center gap-2.5 text-sm cursor-pointer">
              <Toggle checked={f.ativo} onChange={(v) => mudar({ ativo: v })} /> Mandar pelo WhatsApp
            </label>

            <div className="grid gap-3 grid-cols-1 sm:grid-cols-2">
              <Campo label="Número para o cliente (o oficial)" dica="o número de onde sai o que o atendente manda ao cliente" className="min-w-0">
                <input className="input font-mono text-[13px]" id="avisos-numero-cliente" inputMode="tel" placeholder="(71) 3034-8350"
                  value={f.numeroCliente} onChange={(e) => mudar({ numeroCliente: e.target.value })} onBlur={(e) => mudar({ numeroCliente: arrumarNumero(e.target.value) })} />
              </Campo>
              <Campo label="Número para a equipe (o não oficial)" dica="o número de onde saem os avisos para as pessoas da equipe" className="min-w-0">
                <input className="input font-mono text-[13px]" id="avisos-numero-equipe" inputMode="tel" placeholder="(71) 99999-0000"
                  value={f.numeroEquipe} onChange={(e) => mudar({ numeroEquipe: e.target.value })} onBlur={(e) => mudar({ numeroEquipe: arrumarNumero(e.target.value) })} />
              </Campo>
            </div>

            <Campo label="Endereço da API de mensagens" dica="o de mandar mensagem da plataforma do LineChat; só mude se ela mudar de endereço">
              <input className="input font-mono text-[13px]" id="avisos-url" spellCheck={false} value={f.url} onChange={(e) => mudar({ url: e.target.value })} />
            </Campo>

            <fieldset className="min-w-0">
              <legend className="label">A chave da API</legend>
              <div className="flex flex-col gap-2">
                <label className="flex items-start gap-2 text-sm cursor-pointer">
                  <input type="radio" name="avisos-chave" id="avisos-chave-linechat" className="mt-1 shrink-0" checked={f.usarChaveDoLineChat} onChange={() => mudar({ usarChaveDoLineChat: true })} />
                  <span className="min-w-0">
                    Usar a chave do LineChat (a mesma da leitura dos chamados)
                    <span className="flex flex-wrap items-center gap-1.5 mt-0.5 text-[12.5px] text-muted">
                      {inicial.temChaveLineChat ? <Chip tone="ok">guardada</Chip> : <Chip tone="signal">não guardada</Chip>}
                      <span>
                        fica em{' '}
                        {pode.integrar ? <Link className="link" to="/admin/ajustes">Administração › Ajustes › Chamados do LineChat</Link> : 'Administração › Ajustes › Chamados do LineChat'}
                      </span>
                    </span>
                  </span>
                </label>
                <label className="flex items-start gap-2 text-sm cursor-pointer">
                  <input type="radio" name="avisos-chave" id="avisos-chave-propria" className="mt-1 shrink-0" checked={!f.usarChaveDoLineChat} onChange={() => mudar({ usarChaveDoLineChat: false })} />
                  <span className="min-w-0">
                    Usar uma chave própria
                    <span className="flex flex-wrap items-center gap-1.5 mt-0.5 text-[12.5px] text-muted">
                      {inicial.temChavePropria ? <Chip tone="ok">guardada</Chip> : <Chip tone="muted">não guardada</Chip>}
                      <span>fica cifrada no cofre e nunca aparece de volta na tela</span>
                    </span>
                  </span>
                </label>
                {!f.usarChaveDoLineChat && (
                  <div className="sm:pl-6 min-w-0">
                    <div className="relative">
                      <KeyRound size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden />
                      <input type="password" autoComplete="new-password" className="input font-mono text-[13px] pl-8" id="avisos-chave" aria-label="Chave própria da API"
                        placeholder={inicial.temChavePropria ? '••••••••  guardada (deixe vazio para manter)' : 'cole aqui a chave da API'}
                        value={chave} onChange={(e) => { setChave(e.target.value); setErro(null); }} />
                    </div>
                    <p className="text-[12px] text-muted mt-1">{inicial.temChavePropria ? 'Vazio mantém a chave guardada; escreva só para trocar.' : 'Vai para o cofre ao salvar.'}</p>
                  </div>
                )}
              </div>
            </fieldset>
          </div>
          {/* o teste fica aqui dentro, junto dos números e da chave (o pedido do Luan na prévia) */}
          <ParteDoTeste inicial={inicial} mudou={mudou} />
        </CartaoAjuste>

        {/* ---------- a mensagem ao cliente: o modelo aprovado (o template) ou o texto livre ---------- */}
        <CartaoMensagemAoCliente f={f} mudar={mudar} />

        {/* ---------- as pessoas ---------- */}
        <CartaoAjuste icone={<Users size={18} />} titulo="Quem da equipe recebe no WhatsApp"
          situacao={<span className="text-[12.5px] text-muted tnum" id="avisos-recebem">{recebem} de {f.pessoas.length} {f.pessoas.length === 1 ? 'pessoa recebe' : 'pessoas recebem'}</span>}>
          <Explicacao>
            <p>
              O WhatsApp de cada pessoa. Ela recebe os avisos dela (o chamado que recebeu, o prazo vencendo, o Crítico que chegou) pelo
              número da equipe. Sem número, a pessoa vê os avisos só na tela. Pausada, fica com o número guardado, mas não recebe.
            </p>
          </Explicacao>
          <TabelaPessoas pessoas={f.pessoas} salvas={inicial.pessoas} erros={errosPessoas} onMudar={mudarPessoa} />
        </CartaoAjuste>

        {/* ---------- quais avisos vão por onde ---------- */}
        <CartaoAjuste icone={<BellRing size={18} />} titulo="Quais avisos vão por onde">
          <Explicacao>
            <p>
              Cada aviso vai para quem está escrito embaixo dele. Na tela, ele chega no sininho e num cartão no canto da tela; quem quiser
              recebe também no navegador, mesmo com o Gestor em outra aba (cada pessoa liga no sininho, em cada computador). No WhatsApp,
              vai pelo número da equipe, para quem tem o número na lista de cima.
            </p>
          </Explicacao>
          {!f.ativo && <p className="text-[12.5px] text-signal mb-2">O WhatsApp está desligado: por enquanto vale só a tela.</p>}
          <TabelaEventos eventos={f.eventos} salvos={doServidor(inicial).eventos} onMudar={(e, c) => mudar({ eventos: { ...f.eventos, [e]: c } })} />
        </CartaoAjuste>

        {/* ---------- salvar: com mudança por salvar, fica preso embaixo (trocou um número lá em cima, não precisa rolar até o fim) ---------- */}
        <div className={mudou || erro ? 'sticky bottom-0 z-10 pb-2' : ''}>
          <div className="card p-3 flex flex-wrap items-center gap-x-3 gap-y-2 shadow-lg">
            <button type="button" className="btn-primary" id="avisos-salvar" disabled={salvando || !mudou} onClick={() => void salvar()}>
              {salvando ? <Spinner className="text-white" /> : 'Salvar'}
            </button>
            {mudou ? <span className="text-[12.5px] text-signal">há mudanças sem salvar</span> : <span className="text-[12.5px] text-muted">tudo salvo</span>}
            {erro && <Resultado r={{ ok: false, mensagem: erro }} className="basis-full" />}
          </div>
        </div>
      </form>
    </div>
  );
}

// ---------- as pessoas da equipe ----------

function TabelaPessoas({ pessoas, salvas, erros, onMudar }: { pessoas: PessoaForm[]; salvas: AvisosChamadosTela['pessoas']; erros: Record<string, string>; onMudar: (userId: string, m: Partial<PessoaForm>) => void }) {
  const o = useOrdenacaoLocal('nome');
  // a ordem segue o que está SALVO: a linha não pula de lugar enquanto a pessoa digita o número
  const salva = new Map(salvas.map((p) => [p.userId, p]));
  const ordenadas = ordenarLista(pessoas, o, {
    nome: (p) => p.nome,
    numero: (p) => salva.get(p.userId)?.numero || null,
    ativo: (p) => { const s = salva.get(p.userId); return s?.numero ? (s.ativo ? 0 : 1) : null; },
  });
  const pag = usePaginaLocal(ordenadas, 100);
  if (!pessoas.length) return <p className="text-[13px] text-muted">Nenhuma pessoa ativa no sistema.</p>;
  return (
    <>
      <div className="overflow-x-auto rounded-xl border border-line">
        {/* células mais justas: no celular, o número e o "recebe" cabem sem precisar rolar a tabela */}
        <table className="table [&_td]:px-2.5 [&_th]:px-2.5" id="avisos-pessoas">
          <thead><tr><ThN /><Th o={o} col="nome">Pessoa</Th><Th o={o} col="numero">WhatsApp</Th><Th o={o} col="ativo">Recebe</Th></tr></thead>
          <tbody>
            {pag.visiveis.map((p, i) => {
              const erro = erros[p.userId];
              return (
                <tr key={p.userId}>
                  <TdN n={pag.numero(i)} />
                  <td className="font-medium min-w-[90px]">{p.nome}</td>
                  <td className="min-w-[160px] w-[45%]">
                    <input className={`input font-mono text-[13px] py-1.5 ${erro ? 'border-bad' : ''}`} inputMode="tel" placeholder="(71) 99999-0000"
                      aria-label={`WhatsApp de ${p.nome}`} aria-invalid={!!erro} value={p.numero}
                      onChange={(e) => onMudar(p.userId, { numero: e.target.value })} onBlur={(e) => onMudar(p.userId, { numero: arrumarNumero(e.target.value) })} />
                    {erro && <div className="text-bad text-[12px] mt-0.5">{erro}</div>}
                  </td>
                  <td className="whitespace-nowrap">
                    {p.numero.trim()
                      ? <Toggle checked={p.ativo} onChange={(v) => onMudar(p.userId, { ativo: v })} label={p.ativo ? 'recebe' : 'pausada'} />
                      : <span className="text-[12.5px] text-muted">sem número</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {pag.rodape}
    </>
  );
}

// ---------- quais avisos vão por onde ----------

function TabelaEventos({ eventos, salvos, onMudar }: { eventos: Record<EventoAviso, CanaisDoAviso>; salvos: Record<EventoAviso, CanaisDoAviso>; onMudar: (e: EventoAviso, c: CanaisDoAviso) => void }) {
  // sem clicar em coluna nenhuma, a ordem é a do catálogo (do mais comum ao mais raro)
  const o = useOrdenacaoLocal('ordem');
  const linhas = EVENTOS_AVISO.map((e, i) => ({ e, i }));
  const ordenadas = ordenarLista(linhas, o, {
    ordem: (l) => l.i, titulo: (l) => NOME_EVENTO_AVISO[l.e].titulo,
    // pela marca salva, de novo para a linha não fugir do dedo
    tela: (l) => (salvos[l.e].tela ? 0 : 1), whatsapp: (l) => (salvos[l.e].whatsapp ? 0 : 1),
  });
  return (
    <div className="overflow-x-auto rounded-xl border border-line">
      {/* "quem recebe" vai embaixo do aviso: as caixinhas (o que se muda aqui) ficam à vista até no celular */}
      <table className="table [&_td]:px-2.5 [&_th]:px-2.5" id="avisos-eventos">
        <thead>
          <tr>
            <ThN /><Th o={o} col="titulo">Aviso e quem recebe</Th>
            <Th o={o} col="tela" align="center" titulo="Ordenar pelo que vai na tela">Tela</Th><Th o={o} col="whatsapp" align="center" titulo="Ordenar pelo que vai no WhatsApp">WhatsApp</Th>
          </tr>
        </thead>
        <tbody>
          {ordenadas.map(({ e }, i) => {
            const n = NOME_EVENTO_AVISO[e];
            return (
              <tr key={e}>
                <TdN n={contar(i)} />
                <td className="min-w-[170px]">
                  <div className="font-medium leading-snug">{n.titulo}</div>
                  <div className="text-[12.5px] text-muted leading-snug mt-0.5">para {n.quem}</div>
                </td>
                <td className="text-center w-[1%]"><input type="checkbox" className="w-4 h-4 cursor-pointer align-middle" aria-label={`${n.titulo}: na tela`} checked={eventos[e].tela} onChange={(x) => onMudar(e, { ...eventos[e], tela: x.target.checked })} /></td>
                <td className="text-center w-[1%]"><input type="checkbox" className="w-4 h-4 cursor-pointer align-middle" aria-label={`${n.titulo}: no WhatsApp`} checked={eventos[e].whatsapp} onChange={(x) => onMudar(e, { ...eventos[e], whatsapp: x.target.checked })} /></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ---------- o teste (dentro do cartão do WhatsApp) ----------

const OUTRO = '__outro';

function ParteDoTeste({ inicial, mudou }: { inicial: AvisosChamadosTela; mudou: boolean }) {
  const qc = useQueryClient(); const { user } = useAuth();
  const [de, setDe] = useState<'equipe' | 'cliente'>('equipe');
  // o teste lê o que está salvo: só quem já tem o número guardado pode ser escolhido
  const comNumero = inicial.pessoas.filter((p) => p.numero);
  // sem escolha da pessoa, vale quem testa (se tem número), senão o primeiro: acompanha os números que acabaram de ser salvos
  const [escolhido, setEscolhido] = useState<string | null>(null);
  const automatico = comNumero.find((p) => p.userId === user?.id)?.userId ?? comNumero[0]?.userId ?? OUTRO;
  const para = escolhido && (escolhido === OUTRO || comNumero.some((p) => p.userId === escolhido)) ? escolhido : automatico;
  const [numero, setNumero] = useState('');
  const [testando, setTestando] = useState(false);
  const [res, setRes] = useState<ResultadoTeste | null>(null);

  const testar = async () => {
    if (para === OUTRO && !numeroWhatsApp(numero)) { setRes({ ok: false, mensagem: 'Digite um WhatsApp válido: DDD + número, como (71) 99999-0000.' }); return; }
    setTestando(true); setRes(null);
    try {
      setRes(await api.atendimento.testarAvisos(para === OUTRO ? { de, numero: numero.trim() } : { de, userId: para }));
    } catch (e) { setRes({ ok: false, mensagem: erroLegivel(e) }); } finally {
      setTestando(false);
      void qc.invalidateQueries({ queryKey: CHAVE });
    }
  };

  const numeroDe = de === 'cliente' ? inicial.numeroCliente : inicial.numeroEquipe;
  return (
    <section className="border-t border-line mt-4 pt-4" id="avisos-teste" aria-labelledby="avisos-teste-titulo">
      <h3 className="font-semibold text-[14px] flex items-center gap-2" id="avisos-teste-titulo"><Send size={15} className="text-muted" aria-hidden /> Testar</h3>
      <p className="text-[12.5px] text-muted mt-0.5 mb-3">
        Manda <i>"Teste do Ingline Gestão: os avisos dos chamados vão chegar por aqui."</i> — uma mensagem de verdade, com o que está salvo
        (salve antes). Pelo número oficial, vai como a mensagem ao cliente: pelo modelo aprovado, com valores de exemplo.
      </p>
      <div className="flex flex-col gap-3">
        <div className="grid gap-2 grid-cols-1 sm:grid-cols-2" role="radiogroup" aria-label="Por qual número sai o teste">
          {([['equipe', 'Como aviso para a equipe', inicial.numeroEquipe, 'sai pelo número da equipe'], ['cliente', 'Como mensagem ao cliente', inicial.numeroCliente, 'sai pelo número oficial']] as const).map(([v, titulo, n, como]) => (
            <label key={v} className={`flex items-start gap-2 rounded-lg border p-2.5 cursor-pointer text-sm min-w-0 ${de === v ? 'border-accent bg-accent-soft' : 'border-line hover:bg-surface-2'}`}>
              <input type="radio" name="avisos-teste-de" id={`avisos-teste-${v}`} className="mt-1 shrink-0" checked={de === v} onChange={() => { setDe(v); setRes(null); }} />
              <span className="min-w-0">
                <span className="font-semibold">{titulo}</span>
                <span className="block text-[12.5px] text-muted">{como}{n ? <>: <span className="font-mono">{telefoneLegivel(n)}</span></> : ' (ainda sem número)'}</span>
              </span>
            </label>
          ))}
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <label className="min-w-0 flex-1 basis-[220px]">
            <span className="label">Para quem</span>
            <select className="input" id="avisos-teste-para" value={para} onChange={(e) => { setEscolhido(e.target.value); setRes(null); }}>
              {comNumero.map((p) => <option key={p.userId} value={p.userId}>{p.nome} · {telefoneLegivel(p.numero)}</option>)}
              <option value={OUTRO}>Outro número…</option>
            </select>
          </label>
          {para === OUTRO && (
            <label className="min-w-0 flex-1 basis-[180px]">
              <span className="label">Número</span>
              <input className="input font-mono text-[13px]" id="avisos-teste-numero" autoComplete="off" inputMode="tel" placeholder="(71) 99999-0000" value={numero}
                onChange={(e) => { setNumero(e.target.value); setRes(null); }} onBlur={(e) => setNumero(arrumarNumero(e.target.value))} />
            </label>
          )}
          <button type="button" className="btn-secondary" id="avisos-testar" disabled={testando || mudou} onClick={() => void testar()}
            title={mudou ? 'Salve antes de testar: o teste usa o que está salvo' : `Manda a mensagem de teste pelo número ${de === 'cliente' ? 'do cliente' : 'da equipe'}`}>
            {testando ? <><Spinner /> mandando…</> : <><Send size={14} /> Mandar o teste</>}
          </button>
        </div>
        {mudou && <p className="text-[12.5px] text-signal -mt-1">Salve antes de testar: o teste usa o que está salvo.</p>}
        {!comNumero.length && <p className="text-[12.5px] text-muted -mt-1">Ninguém da equipe tem o WhatsApp salvo ainda: escolha "Outro número…", ou ponha o número da pessoa na lista e salve.</p>}
        {!numeroDe && <p className="text-[12.5px] text-muted -mt-1">Falta o número {de === 'cliente' ? 'para o cliente' : 'para a equipe'}: o teste vai dizer isso.</p>}
      </div>
      <Resultado r={res} />
      <UltimaVez rotulo="Último teste" em={inicial.ultimoTesteEm} ok={inicial.ultimoTesteOk} msg={inicial.ultimoTesteMsg} />
    </section>
  );
}

// ---------- a mensagem ao cliente ----------

/**
 * A mensagem ao cliente: como ela sai (o modelo aprovado ou o texto livre), o modelo — escolhido entre
 * os aprovados do número oficial no LineChat, com o que vai em cada variável e o arquivo do cabeçalho —
 * e quem fica com a conversa que a mensagem abrir.
 */
function CartaoMensagemAoCliente({ f, mudar }: { f: Form; mudar: (m: Partial<Form>) => void }) {
  const campoTexto = useRef<HTMLTextAreaElement>(null);
  const [lista, setLista] = useState<ModelosDoLineChat | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [erroBusca, setErroBusca] = useState<string | null>(null);
  const t = f.template;
  const peloModelo = f.envioCliente === 'modelo';
  const mudarModelo = (m: Partial<ModeloForm>) => mudar({ template: { ...t, ...m } });
  const mudarVariavel = (i: number, m: Partial<VariavelForm>) => mudarModelo({ variaveis: t.variaveis.map((v, j) => (j === i ? { ...v, ...m } : v)) });

  const buscar = async () => {
    setBuscando(true); setErroBusca(null);
    try { setLista(await api.atendimento.modelosDoLineChat()); } catch (e) { setLista(null); setErroBusca(erroLegivel(e)); } finally { setBuscando(false); }
  };
  /** Usar um modelo da lista: o que já estava numa variável de mesmo nome continua; a nova vem com o valor que o nome sugere. */
  const usar = (m: ModeloDoLineChat) => {
    const antes = new Map(t.variaveis.map((v) => [v.nome.trim().toLowerCase(), v.valor]));
    mudarModelo({
      id: m.id, nome: m.nome, texto: m.texto, tipoArquivo: m.tipoArquivo, arquivo: m.tipoArquivo === t.tipoArquivo ? t.arquivo : '',
      variaveis: m.variaveis.map((nome, i) => ({ nome, valor: antes.get(nome.toLowerCase()) ?? valorSugeridoDaVariavel(nome, i) })),
    });
  };
  // a prévia com um chamado de exemplo: a mesma conta da ficha (cada variável como vai para a API)
  const previaDoModelo = mensagemPreenchida({ peloModelo: true, texto: t.texto, variaveis: t.variaveis }, EXEMPLO_CLIENTE);
  const faltaArquivo = t.id && t.tipoArquivo !== 'UNDEFINED' && !t.arquivo.trim();

  return (
    <CartaoAjuste icone={<MessageSquareText size={18} />} titulo="A mensagem ao cliente" id="avisos-mensagem-cliente"
      situacao={peloModelo ? (t.id ? <Chip tone="ok">pelo modelo {t.nome || 'aprovado'}</Chip> : <Chip tone="signal">falta escolher o modelo</Chip>) : <Chip tone="muted">texto livre</Chip>}>
      <Explicacao>
        <p>
          O que chega ao cliente quando o atendente manda: no "Avisar o cliente" da ficha, nas respostas prontas que mandam ao cliente e no
          número do chamado ao abrir. O WhatsApp oficial só começa uma conversa com um <b>modelo aprovado</b> pela Meta — o template, que fica no
          LineChat (Ajustes › Modelos de mensagem). Cada variável do modelo recebe um valor do chamado; a do <i>o que o atendente escreveu</i> leva a mensagem dele.
        </p>
      </Explicacao>

      <div className="grid gap-2 grid-cols-1 sm:grid-cols-2" role="radiogroup" aria-label="Como a mensagem sai" id="avisos-envio">
        {([['modelo', 'Pelo modelo aprovado', 'o template do número oficial: vale sempre, até para começar a conversa'], ['texto', 'Texto livre', 'só até 24 horas depois da última mensagem do cliente; passou disso, vai o modelo aprovado']] as const).map(([v, titulo, dica]) => (
          <label key={v} className={`flex items-start gap-2 rounded-lg border p-2.5 cursor-pointer text-sm min-w-0 ${f.envioCliente === v ? 'border-accent bg-accent-soft' : 'border-line hover:bg-surface-2'}`}>
            <input type="radio" name="avisos-envio" id={`avisos-envio-${v}`} className="mt-1 shrink-0" checked={f.envioCliente === v} onChange={() => mudar({ envioCliente: v })} />
            <span className="min-w-0"><span className="font-semibold">{titulo}</span><span className="block text-[12.5px] text-muted">{dica}</span></span>
          </label>
        ))}
      </div>

      {/* ---- o modelo aprovado (no texto livre, ele vale depois das 24 horas) ---- */}
      <section className="mt-4 rounded-xl border border-line p-3 sm:p-4 min-w-0" id="avisos-modelo" aria-labelledby="avisos-modelo-titulo">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-semibold text-[14px]" id="avisos-modelo-titulo">
            O modelo aprovado {!peloModelo && <span className="font-normal text-muted">(para depois das 24 horas)</span>}
          </h3>
          <button type="button" className="btn-secondary btn-sm sm:ml-auto" id="avisos-buscar-modelos" disabled={buscando} onClick={() => void buscar()}
            title="Lê os modelos aprovados do número para o cliente no LineChat, com o número e a chave que estão salvos">
            {buscando ? <Spinner /> : <Download size={14} />} Buscar os modelos no LineChat
          </button>
        </div>
        {erroBusca && <Resultado r={{ ok: false, mensagem: erroBusca }} className="mt-2" />}
        {lista && <ListaDeModelos lista={lista} escolhido={t.id} onUsar={usar} onFechar={() => setLista(null)} />}

        <Campo label="Id do modelo (templateId)" dica={t.nome ? `o modelo ${t.nome}, do LineChat` : 'o "Buscar os modelos" preenche; ou cole o id do modelo no LineChat'} className="mt-3 min-w-0">
          <input className="input font-mono text-[13px]" id="avisos-modelo-id" spellCheck={false} maxLength={120} placeholder="ex.: 6b1f2c9e-3d4a-4b7e-9c10-2a8e5f7d1c01" value={t.id}
            onChange={(e) => mudarModelo({ id: e.target.value, ...(e.target.value.trim() !== t.id.trim() ? { nome: '', texto: '' } : {}) })} />
        </Campo>

        <VariaveisDoModelo variaveis={t.variaveis} onMudar={mudarVariavel}
          onIncluir={() => mudarModelo({ variaveis: [...t.variaveis, { nome: String(t.variaveis.length + 1), valor: valorSugeridoDaVariavel(String(t.variaveis.length + 1), t.variaveis.length) }] })}
          onTirar={(i) => mudarModelo({ variaveis: t.variaveis.filter((_, j) => j !== i) })} />

        <div className="grid gap-3 grid-cols-1 sm:grid-cols-[200px_minmax(0,1fr)] mt-3" id="avisos-arquivo">
          <Campo label="Arquivo no cabeçalho" dica="o modelo com imagem, vídeo ou documento" className="min-w-0">
            <select className="input" id="avisos-modelo-tipo-arquivo" value={t.tipoArquivo} onChange={(e) => mudarModelo({ tipoArquivo: e.target.value as TipoArquivoDoModelo })}>
              {TIPOS_ARQUIVO_DO_MODELO.map((x) => <option key={x} value={x}>{x === 'UNDEFINED' ? 'Sem arquivo' : NOME_TIPO_ARQUIVO_DO_MODELO[x][0]!.toUpperCase() + NOME_TIPO_ARQUIVO_DO_MODELO[x].slice(1)}</option>)}
            </select>
          </Campo>
          {t.tipoArquivo !== 'UNDEFINED' && (
            <Campo label="Endereço do arquivo (https://)" dica="um link público: o WhatsApp baixa o arquivo dali a cada mensagem" className="min-w-0">
              <div className="relative">
                <FileImage size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden />
                <input className="input font-mono text-[13px] pl-8" id="avisos-modelo-arquivo" spellCheck={false} maxLength={500} placeholder="https://…/logo.png" value={t.arquivo}
                  onChange={(e) => mudarModelo({ arquivo: e.target.value })} />
              </div>
            </Campo>
          )}
        </div>
        {faltaArquivo && <p className="text-[12.5px] text-signal mt-1.5">O modelo tem {NOME_TIPO_ARQUIVO_DO_MODELO[t.tipoArquivo]} no cabeçalho: sem o endereço do arquivo, a mensagem não sai.</p>}
        {t.id.trim() && t.variaveis.length > 0 && !t.variaveis.some((v) => v.valor.includes('{texto}')) && (
          <p className="text-[12.5px] text-signal mt-1.5">Nenhuma variável leva <i>o que o atendente escreveu</i>: o cliente recebe só o texto do modelo.</p>
        )}

        {t.id.trim() && (
          <div className="mt-3">
            <div className="eyebrow mb-1.5">Prévia, com um exemplo</div>
            <BalaoDeMensagem texto={previaDoModelo} vazio="sem o texto do modelo: escolha pelo Buscar para ver a prévia" />
          </div>
        )}
        {peloModelo && !t.id.trim() && <p className="text-[12.5px] text-signal mt-2">Sem o modelo, a mensagem ao cliente não sai (a ficha nem mostra o botão).</p>}
      </section>

      {/* ---- o texto livre ---- */}
      {!peloModelo && (
        <section className="mt-4 rounded-xl border border-line p-3 sm:p-4 min-w-0" id="avisos-texto-livre" aria-labelledby="avisos-texto-livre-titulo">
          <h3 className="font-semibold text-[14px] mb-2" id="avisos-texto-livre-titulo">O texto livre</h3>
          <div className="flex flex-col gap-2">
            <Marcadores marcadores={MARCADORES_CLIENTE} campo={campoTexto} valor={f.modeloCliente} onChange={(v) => mudar({ modeloCliente: v })} />
            <textarea ref={campoTexto} className="input text-[13.5px]" id="avisos-modelo" rows={6} maxLength={2000} aria-label="O texto livre da mensagem ao cliente"
              value={f.modeloCliente} onChange={(e) => mudar({ modeloCliente: e.target.value })} />
            <div className="mt-1">
              <div className="eyebrow mb-1.5">Prévia, com um exemplo</div>
              <BalaoDeMensagem texto={preencherModelo(f.modeloCliente, EXEMPLO_CLIENTE)} />
              {!f.modeloCliente.includes('{texto}') && <p className="text-[12.5px] text-signal mt-1.5">Falta o {'{texto}'}: sem ele, o que o atendente escrever não vai.</p>}
            </div>
          </div>
        </section>
      )}

      {/* ---- quem fica com a conversa ---- */}
      <section className="mt-4 min-w-0" id="avisos-quem-fica" aria-labelledby="avisos-quem-fica-titulo">
        <h3 className="font-semibold text-[14px]" id="avisos-quem-fica-titulo">Quem fica com a conversa no LineChat</h3>
        <p className="text-[12.5px] text-muted">Vale quando a mensagem abre uma conversa nova. Vazio e desligado, o LineChat decide, como hoje.</p>
        <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 mt-2 items-start">
          <Campo label="Equipe" dica="o nome da equipe no LineChat (ex.: Suporte)" className="min-w-0">
            <input className="input" id="avisos-equipe-linechat" maxLength={120} placeholder="LineChat decide" value={f.equipeLineChat} onChange={(e) => mudar({ equipeLineChat: e.target.value })} />
          </Campo>
          <div className="flex items-start gap-2.5 text-sm sm:mt-6">
            <Interruptor ligado={f.atribuirAQuemManda} onChange={(v) => mudar({ atribuirAQuemManda: v })} rotulo="Quem manda fica com a conversa" />
            <span className="min-w-0">Quem manda fica com a conversa <span className="block text-[12.5px] text-muted">pelo e-mail: precisa ser o mesmo no Gestor e no LineChat</span></span>
          </div>
        </div>
      </section>
    </CartaoAjuste>
  );
}

/** As variáveis do modelo: o nome (como está no LineChat) e o que vai nela — um valor do chamado ou um texto fixo. */
function VariaveisDoModelo({ variaveis, onMudar, onIncluir, onTirar }: {
  variaveis: VariavelForm[]; onMudar: (i: number, m: Partial<VariavelForm>) => void; onIncluir: () => void; onTirar: (i: number) => void;
}) {
  return (
    <div className="mt-3 min-w-0" id="avisos-variaveis">
      <div className="label">As variáveis do modelo</div>
      {!variaveis.length ? (
        <p className="text-[12.5px] text-muted">Nenhuma: o modelo vai como foi aprovado. Se ele tiver variáveis ({'{{1}}'}, {'{{nome}}'}…), inclua uma para cada.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {variaveis.map((v, i) => {
            const opcao = VALORES_DA_VARIAVEL.find((o) => o.valor === v.valor.trim());
            return (
              <li key={i} data-variavel={v.nome} className="flex flex-wrap items-center gap-2 min-w-0">
                <input className="input font-mono text-[13px] w-24 shrink-0" aria-label={`Nome da variável ${i + 1}`} maxLength={60} value={v.nome} onChange={(e) => onMudar(i, { nome: e.target.value })} />
                <span className="text-muted text-[13px]" aria-hidden>recebe</span>
                <select className="input flex-1 basis-48 min-w-0" aria-label={`O que vai na variável ${v.nome || i + 1}`} value={opcao ? opcao.valor : TEXTO_FIXO}
                  onChange={(e) => onMudar(i, { valor: e.target.value === TEXTO_FIXO ? '' : e.target.value })}>
                  {VALORES_DA_VARIAVEL.map((o) => <option key={o.valor} value={o.valor}>{o.nome}</option>)}
                  <option value={TEXTO_FIXO}>um texto fixo…</option>
                </select>
                {!opcao && (
                  <input className="input flex-1 basis-48 min-w-0" aria-label={`O texto da variável ${v.nome || i + 1}`} maxLength={1000} placeholder="ex.: Equipe Ingline (aceita {contato}, {codigo}…)"
                    value={v.valor} onChange={(e) => onMudar(i, { valor: e.target.value })} />
                )}
                <button type="button" className="btn-ghost btn-sm px-1.5 text-muted hover:text-bad" onClick={() => onTirar(i)} aria-label={`Tirar a variável ${v.nome || i + 1}`}><X size={14} /></button>
              </li>
            );
          })}
        </ul>
      )}
      <button type="button" className="btn-ghost btn-sm mt-1.5" id="avisos-variavel-incluir" onClick={onIncluir}><Plus size={14} /> Incluir variável</button>
    </div>
  );
}

/** Os modelos aprovados do número oficial, como o LineChat devolveu: um clique escolhe. */
function ListaDeModelos({ lista, escolhido, onUsar, onFechar }: { lista: ModelosDoLineChat; escolhido: string; onUsar: (m: ModeloDoLineChat) => void; onFechar: () => void }) {
  return (
    <div className="mt-3 rounded-lg border border-line bg-surface-2 p-2 min-w-0" id="avisos-lista-modelos">
      <div className="flex items-center gap-2 px-1 pb-1.5">
        <span className="text-[12.5px] text-muted min-w-0">
          {lista.modelos.length} {lista.modelos.length === 1 ? 'modelo aprovado' : 'modelos aprovados'} do número <span className="font-mono">{telefoneLegivel(lista.canal.numero)}</span>
          {!lista.canal.oficial && ' (este canal não é da API oficial do WhatsApp)'}
        </span>
        <button type="button" className="btn-ghost btn-sm px-1.5 ml-auto shrink-0" onClick={onFechar} aria-label="Fechar a lista de modelos"><X size={14} /></button>
      </div>
      {!lista.modelos.length ? (
        <p className="text-[12.5px] text-muted px-1 pb-1">Nenhum modelo aprovado neste número. Crie no LineChat (Ajustes › Modelos de mensagem) e espere a aprovação da Meta.</p>
      ) : (
        <ul className="flex flex-col gap-1.5 max-h-[360px] overflow-y-auto">
          {lista.modelos.map((m) => {
            const emUso = m.id === escolhido;
            return (
              <li key={m.id} data-modelo={m.nome} className={`rounded-lg border bg-surface p-2.5 ${emUso ? 'border-accent' : 'border-line'}`}>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="font-mono text-[13px] font-semibold break-all">{m.nome}</span>
                  {m.categoria && <Chip tone="muted">{m.categoria}</Chip>}
                  {m.tipoArquivo !== 'UNDEFINED' && <Chip tone="accent"><FileImage size={12} aria-hidden /> {NOME_TIPO_ARQUIVO_DO_MODELO[m.tipoArquivo]}</Chip>}
                  <span className="text-[12px] text-muted">{m.variaveis.length ? `variáveis: ${m.variaveis.join(', ')}` : 'sem variáveis'}</span>
                  <button type="button" className={`${emUso ? 'btn-ghost' : 'btn-secondary'} btn-sm ml-auto`} disabled={emUso} onClick={() => onUsar(m)}>
                    {emUso ? <><CheckCircle2 size={14} /> Em uso</> : 'Usar este'}
                  </button>
                </div>
                {m.texto && <p className="text-[12.5px] text-ink-2 mt-1 whitespace-pre-wrap break-words line-clamp-3">{m.texto}</p>}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
