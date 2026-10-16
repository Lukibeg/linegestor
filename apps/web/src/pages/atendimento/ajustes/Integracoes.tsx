/**
 * Chamados › Ajustes (Patch 2.0) — Integrações (a administração, `admin.manage`): o que liga o Gestor
 * aos outros sistemas.
 *
 *  - O LineChat falando com o Gestor: o robô abre o chamado (com uma chave de API) e o botão "Abrir
 *    chamado" na conversa (com o login da própria pessoa). O "cliente respondeu" (o n8n avisando a
 *    mensagem do cliente) saiu no 2.0.1: o pedido do Luan, "isso tbm n precisa".
 *  - O mapa do robô (2.0.1, em MapaDoRobo.tsx): o robô manda o JSON dele, e o mapa diz de onde vem cada
 *    campo do chamado. O formato do Gestor (/entrada/chamado) fica para o n8n e outros sistemas.
 *  - As chaves de API (a do robô, a do n8n): aparecem uma vez, ao criar; perdeu, revoga e cria outra.
 *  - Os webhooks: o Gestor avisa o n8n do que aconteceu com um chamado, com a assinatura no cabeçalho.
 *  - Os sites que podem abrir o Gestor dentro deles — o pedido do Luan: "tire esse bloqueio, quero que
 *    abra iframe em outros programas" — e o endereço para o menu do LineChat.
 *  - O modelo do link da conversa no LineChat (é o que dá à ficha o "Conversa no LineChat").
 *
 * Os exemplos já saem com o endereço deste Gestor, para copiar e colar. As variáveis do LineChat
 * ({{telefone_do_contato}}…) são exemplos: a documentação dele só garante a do telefone, e o nome das
 * outras se confere na própria tela do LineChat — a tela diz isso ao lado de cada uma.
 */
import { useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AppWindow, Bot, Check, Copy, KeyRound, Link2, MousePointerClick, Pencil, Plus, Send, Trash2, TriangleAlert, Webhook, X } from 'lucide-react';
import {
  EVENTOS_WEBHOOK, linkDaConversa, NOME_EVENTO_WEBHOOK,
  type ChaveApiTela, type EventoWebhook, type IntegracoesTela, type WebhookGravarEntrada, type WebhookTela,
} from '@gestor/shared';
import { api } from '../../../api/index.js';
import { Campo, Carregando, Chip, Confirmar, Modal, Spinner, Toggle, mensagemErro, usePaginaLocal, useToast } from '../../../components/ui/index.js';
import { TdN, ThN } from '../../../lib/contagem.js';
import { ordenarLista, Th, useOrdenacaoLocal } from '../../../lib/ordenacao.js';
import { dataHoraCurta, haQuanto, useOpcoes } from '../comum.js';
import { CartaoAjuste, Explicacao, Interruptor, Resultado, erroLegivel, type ResultadoTeste } from './Avisos.js';
import { CartaoMapaDoRobo } from './MapaDoRobo.js';

const CHAVE = ['atendimento', 'integracoes'];

// =====================================================================
//  AS PEÇAS
// =====================================================================

/** Copiar com o nome escrito no botão: quem vai colar no LineChat ou no n8n precisa achar o botão. */
function BotaoCopiar({ texto, rotulo = 'Copiar', id }: { texto: string; rotulo?: string; id?: string }) {
  const toast = useToast();
  const [copiou, setCopiou] = useState(false);
  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiou(true);
      window.setTimeout(() => setCopiou(false), 2000);
    } catch { toast.push('erro', 'O navegador não deixou copiar: selecione o texto e copie com Ctrl+C.'); }
  };
  return (
    <button type="button" id={id} className="btn-ghost btn-sm shrink-0" title={rotulo} aria-label={rotulo} onClick={() => void copiar()}>
      {copiou ? <><Check size={13} className="text-ok" /> Copiado</> : <><Copy size={13} /> Copiar</>}
    </button>
  );
}

/** Um endereço (ou um cabeçalho) inteiro, quebrando onde precisar, com o Copiar ao lado. */
function Copiavel({ texto, rotulo, id }: { texto: string; rotulo: string; id?: string }) {
  return (
    <div className="flex items-start gap-1 rounded-lg border border-line bg-surface-2 pl-3 pr-1 py-1 min-w-0">
      <code id={id} className="font-mono text-[12.5px] text-ink break-all flex-1 min-w-0 py-1">{texto}</code>
      <BotaoCopiar texto={texto} rotulo={`Copiar ${rotulo}`} />
    </div>
  );
}

/** Um JSON de exemplo, com o Copiar no canto. Rola para o lado dentro dele (a página não). */
function BlocoDeCodigo({ texto, rotulo, id }: { texto: string; rotulo: string; id?: string }) {
  return (
    <div className="relative rounded-lg border border-line bg-surface-2 min-w-0">
      <pre id={id} className="font-mono text-[12px] leading-relaxed text-ink p-3 pr-24 overflow-x-auto whitespace-pre">{texto}</pre>
      <span className="absolute top-1 right-1"><BotaoCopiar texto={texto} rotulo={`Copiar ${rotulo}`} /></span>
    </div>
  );
}

function Rotulo({ children }: { children: ReactNode }) {
  return <div className="text-[12.5px] font-semibold text-ink-2 mt-3 mb-1">{children}</div>;
}

function AvisoDasVariaveis() {
  return (
    <p className="text-[12.5px] text-signal flex items-start gap-1.5 mt-1.5">
      <TriangleAlert size={14} className="mt-0.5 shrink-0" />
      <span>As variáveis entre {'{{ }}'} são exemplos: confira o nome das variáveis no LineChat (a documentação dele só garante a {'{{telefone_do_contato}}'}).</span>
    </p>
  );
}

/** O segredo que aparece uma vez só (a chave de API, a assinatura do webhook): a janela só fecha no "Já guardei". */
function SegredoUmaVez({ titulo, explicacao, valor, aviso, onFechar }: { titulo: string; explicacao: ReactNode; valor: string; aviso: string; onFechar: () => void }) {
  return (
    <Modal open fechavel={false} onClose={onFechar} titulo={titulo}
      rodape={<button type="button" className="btn-primary" id="uma-vez-fechar" onClick={onFechar}>Já guardei</button>}>
      <div className="flex flex-col gap-3">
        <div className="text-sm text-ink-2">{explicacao}</div>
        <div className="flex items-start gap-1 rounded-lg border border-accent bg-accent-soft pl-3 pr-1 py-1.5 min-w-0">
          <code id="uma-vez-valor" className="font-mono text-[13px] text-ink break-all flex-1 min-w-0 py-1 select-all">{valor}</code>
          <BotaoCopiar texto={valor} rotulo="Copiar" id="uma-vez-copiar" />
        </div>
        <p className="text-[13.5px] text-signal font-semibold flex items-start gap-1.5"><TriangleAlert size={15} className="mt-0.5 shrink-0" /> {aviso}</p>
      </div>
    </Modal>
  );
}

const SECOES = [
  { id: 'integ-robo', nome: 'O robô abre o chamado' },
  { id: 'integ-mapa', nome: 'O mapa do robô' },
  { id: 'integ-botao', nome: 'O botão na conversa' },
  { id: 'integ-chaves', nome: 'Chaves de API' },
  { id: 'integ-webhooks', nome: 'Webhooks' },
  { id: 'integ-iframe', nome: 'Dentro de outros sistemas' },
  { id: 'integ-link', nome: 'Link da conversa' },
];

// =====================================================================
//  A TELA
// =====================================================================

export function AjustesIntegracoes() {
  const q = useQuery({ queryKey: CHAVE, queryFn: () => api.atendimento.integracoes() });
  const opcoes = useOpcoes();
  if (q.isLoading) return <Carregando />;
  if (q.isError || !q.data) return <p className="text-bad text-sm" role="alert">{mensagemErro(q.error)}</p>;
  const t = q.data;
  const base = t.endereco.replace(/\/+$/, '');
  const paineis = (opcoes.data?.paineis ?? []).filter((p) => p.ativo).map((p) => ({ sigla: p.sigla, nome: p.nome }));
  return (
    <div className="flex flex-col gap-4 max-w-4xl">
      <nav aria-label="Nesta aba" className="flex flex-wrap items-center gap-1.5 text-[12.5px]">
        <span className="text-muted">Nesta aba:</span>
        {SECOES.map((s) => (
          <button key={s.id} type="button" className="px-2 py-0.5 rounded-md border border-line text-ink-2 hover:bg-surface-2"
            onClick={() => document.getElementById(s.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>
            {s.nome}
          </button>
        ))}
      </nav>
      <CartaoRobo base={base} paineis={paineis} />
      <CartaoMapaDoRobo />
      <CartaoBotao base={base} />
      <CartaoChaves chaves={t.chaves} />
      <CartaoWebhooks webhooks={t.webhooks} />
      <CartaoSites inicial={t.sites} base={base} />
      <CartaoLinkConversa inicial={t.linkConversa} />
    </div>
  );
}

// ---------- o robô do LineChat abre o chamado ----------

/** Os campos do formato do Gestor (/entrada/chamado: o n8n, outros sistemas). */
const CAMPOS_GESTOR: Array<[string, ReactNode]> = [
  ['painel', <>a sigla do painel (ou o id); sem painel, o primeiro ativo (o Suporte)</>],
  ['titulo', <>o título; sem título, "Atendimento de &lt;nome&gt;" (ou "Chamado pelo WhatsApp")</>],
  ['relato', <>o que o cliente disse</>],
  ['descricao', <>o que a equipe lê</>],
  ['telefone', <>o WhatsApp do contato (DDD + número; o 55 é opcional). Com ele, o Gestor acha o cliente que já conhece</>],
  ['nome', <>o nome do contato</>],
  ['sessaoId', <>o id da conversa: a mesma conversa aberta não vira dois chamados, e a ficha ganha o link da conversa</>],
  ['clienteId', <>o id do cliente no Gestor (sem ele, o Gestor procura pelo telefone)</>],
  ['assunto', <>o caminho ("Ramal › Configuração"), o nome ou um nome do de-para do assunto, no painel do chamado</>],
  ['prioridade', <><code className="font-mono">critica</code>, <code className="font-mono">alta</code>, <code className="font-mono">media</code> ou <code className="font-mono">baixa</code></>],
  ['etiquetas', <>uma lista, como <code className="font-mono">["robô", "whatsapp"]</code></>],
  ['campos', <>os campos do painel, pelo nome: <code className="font-mono">{'{"Sistema": "LinePBX"}'}</code></>],
];

function CartaoRobo({ base, paineis }: { base: string; paineis: Array<{ sigla: string; nome: string }> }) {
  const endereco = `${base}/api/atendimento/entrada/robo`;
  const doGestor = `${base}/api/atendimento/entrada/chamado`;
  const sigla = paineis[0]?.sigla ?? 'SUP';
  const resposta = JSON.stringify({ criado: true, id: '…', codigo: `${sigla}-12`, numero: 12, link: `${base}/atendimento/${sigla}-12`, ignorados: [] }, null, 2);
  const exemplo = JSON.stringify({
    painel: sigla, titulo: 'Ramal 204 sem áudio', relato: 'O ramal 204 está sem áudio desde cedo', telefone: '(71) 99999-0000', nome: 'Maria Souza',
    sessaoId: '5f0c2a8e-…', etiquetas: ['n8n'],
  }, null, 2);
  return (
    <CartaoAjuste id="integ-robo" icone={<Bot size={18} />} titulo="O robô do LineChat abre o chamado">
      <Explicacao>
        <p>
          No robô do LineChat, um bloco <b>Webhook</b> manda o JSON da conversa para o endereço abaixo, do jeito que ele já manda: não precisa
          montar nada no robô. O <b>mapa do robô</b>, logo abaixo, diz de onde sai cada campo do chamado. A mesma conversa aberta não vira dois
          chamados: o relato novo entra como anotação no que já existe. A resposta traz o código (<span className="font-mono">{sigla}-12</span>),
          para o robô mandar ao cliente.
        </p>
      </Explicacao>

      <Rotulo>O endereço (POST)</Rotulo>
      <Copiavel texto={endereco} rotulo="o endereço do robô" id="integ-robo-endereco" />

      <Rotulo>A chave (crie uma em Chaves de API, mais abaixo), de um destes jeitos</Rotulo>
      <div className="flex flex-col gap-1.5">
        <div className="text-[12.5px] text-muted">no cabeçalho (o melhor):</div>
        <Copiavel texto="Authorization: Bearer <chave>" rotulo="o cabeçalho" />
        <div className="text-[12.5px] text-muted mt-1">ou no fim do endereço, quando o bloco do robô não aceitar cabeçalho (o endereço com a chave pode ficar guardado em registro: prefira o cabeçalho):</div>
        <Copiavel texto={`${endereco}?chave=<chave>`} rotulo="o endereço com a chave" />
      </div>

      <Rotulo>A resposta</Rotulo>
      <BlocoDeCodigo texto={resposta} rotulo="o exemplo da resposta" />
      <p className="text-[12.5px] text-muted mt-1.5">
        <span className="font-mono">"criado": false</span> quando a conversa já tinha um chamado aberto (o código é o dele).{' '}
        <span className="font-mono">"ignorados"</span>: o que veio no pedido e ficou de fora (o assunto que não existe, a opção que não é do campo) — o
        chamado abre do mesmo jeito. Para o cliente, o robô manda o <span className="font-mono">codigo</span>: "Seu chamado é o {sigla}-12".
      </p>

      <details className="text-sm mt-3" id="integ-robo-gestor">
        <summary className="cursor-pointer text-ink-2 font-medium">Outro sistema (o n8n, um script)? O formato do Gestor</summary>
        <div className="mt-2 flex flex-col gap-1.5">
          <p className="text-[12.5px] text-muted">
            Quem monta o próprio JSON pode mandar no formato do Gestor, sem mapa. Aqui é mais rígido: o painel, o assunto ou o campo que não
            existe recusa o pedido (400), com a mensagem. A chave vai do mesmo jeito.
          </p>
          <Copiavel texto={doGestor} rotulo="o endereço no formato do Gestor" id="integ-robo-gestor-endereco" />
          <BlocoDeCodigo texto={exemplo} rotulo="o exemplo no formato do Gestor" id="integ-robo-exemplo" />
          <p className="text-[12.5px] text-muted">Todos são opcionais, mas mande pelo menos o título, o relato, o telefone ou a sessão.{paineis.length > 0 && <> Os painéis: {paineis.map((p) => `${p.sigla} (${p.nome})`).join(', ')}.</>}</p>
          <ul className="flex flex-col gap-1 text-[13px]" id="integ-robo-campos">
            {CAMPOS_GESTOR.map(([campo, o]) => (
              <li key={campo} className="flex flex-col sm:flex-row sm:gap-2 min-w-0">
                <code className="font-mono text-[12.5px] text-accent-ink sm:w-[88px] shrink-0">{campo}</code>
                <span className="text-ink-2 min-w-0">{o}</span>
              </li>
            ))}
          </ul>
        </div>
      </details>
    </CartaoAjuste>
  );
}

// ---------- o botão na conversa ----------

function CartaoBotao({ base }: { base: string }) {
  const endereco = `${base}/atendimento/novo?telefone={{telefone_do_contato}}&nome={{nome_do_contato}}&sessao={{id_da_sessao}}`;
  return (
    <CartaoAjuste id="integ-botao" icone={<MousePointerClick size={18} />} titulo={'O botão "Abrir chamado" na conversa'}>
      <Explicacao>
        <p>
          No LineChat, em <b>Admin › Ações e menus personalizados</b>, crie uma ação "Abrir chamado" no cabeçalho do atendimento, abrindo em
          nova aba, com o endereço abaixo. Quem está atendendo clica, e o Gestor abre o "Abrir chamado" já com o telefone, o nome e a
          conversa (e com o cliente, se o Gestor já conhece o telefone). Não precisa de chave: a pessoa entra com o login dela.
        </p>
      </Explicacao>
      <Rotulo>O endereço da ação</Rotulo>
      <Copiavel texto={endereco} rotulo="o endereço do botão" id="integ-botao-endereco" />
      <AvisoDasVariaveis />
    </CartaoAjuste>
  );
}

// ---------- as chaves de API ----------

type FiltroChaves = 'todas' | 'ativas' | 'revogadas';

function CartaoChaves({ chaves }: { chaves: ChaveApiTela[] }) {
  const qc = useQueryClient(); const toast = useToast();
  const [nome, setNome] = useState('');
  const [criando, setCriando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [nova, setNova] = useState<{ nome: string; valor: string } | null>(null);
  const [revogar, setRevogar] = useState<ChaveApiTela | null>(null);
  const [revogando, setRevogando] = useState(false);
  const [erroRevogar, setErroRevogar] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<FiltroChaves>('todas');
  const ativas = chaves.filter((k) => !k.revogadaEm).length;
  const contagem: Record<FiltroChaves, number> = { todas: chaves.length, ativas, revogadas: chaves.length - ativas };
  const visiveis = chaves.filter((k) => filtro === 'todas' || (filtro === 'ativas') === !k.revogadaEm);

  const criar = async () => {
    if (!nome.trim()) { setErro('Dê um nome à chave: quem vai usar (ex.: Robô do LineChat, n8n).'); return; }
    setCriando(true); setErro(null);
    try {
      const r = await api.atendimento.criarChave(nome.trim());
      setNova({ nome: r.chave.nome, valor: r.valor });
      setNome('');
      await qc.invalidateQueries({ queryKey: CHAVE });
    } catch (e) { setErro(erroLegivel(e)); } finally { setCriando(false); }
  };
  const confirmarRevogar = async () => {
    if (!revogar) return;
    setRevogando(true); setErroRevogar(null);
    try {
      await api.atendimento.revogarChave(revogar.id);
      await qc.invalidateQueries({ queryKey: CHAVE });
      toast.push('ok', `Chave "${revogar.nome}" revogada`);
      setRevogar(null);
    } catch (e) { setErroRevogar(erroLegivel(e)); } finally { setRevogando(false); }
  };

  return (
    <CartaoAjuste id="integ-chaves" icone={<KeyRound size={18} />} titulo="Chaves de API"
      situacao={chaves.length > 0 && (
        <div className="flex flex-wrap gap-1" role="group" aria-label="Mostrar">
          {(['todas', 'ativas', 'revogadas'] as const).map((v) => (
            <button key={v} type="button" aria-pressed={filtro === v} disabled={!contagem[v] && v !== 'todas'} onClick={() => setFiltro(v)}
              className={`px-2 py-0.5 rounded-md border text-[12.5px] disabled:opacity-40 ${filtro === v ? 'border-accent bg-accent-soft text-accent-ink font-semibold' : 'border-line text-muted hover:bg-surface-2'}`}>
              {v} <span className="tnum">{contagem[v]}</span>
            </button>
          ))}
        </div>
      )}>
      <Explicacao>
        <p>
          A chave é a senha do robô e do n8n para falar com o Gestor. Crie uma para cada um: se uma vazar, revoga só ela. Ela aparece uma
          vez só, ao criar; no Gestor fica só o começo, para você reconhecer qual é.
        </p>
      </Explicacao>

      <form autoComplete="off" className="flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); void criar(); }}>
        <label className="min-w-0 flex-1 basis-[220px]">
          <span className="label">Nome da chave nova</span>
          <input className="input" id="integ-chave-nome" maxLength={60} placeholder='ex.: "Robô do LineChat", "n8n"' value={nome} onChange={(e) => { setNome(e.target.value); setErro(null); }} />
        </label>
        <button type="submit" className="btn-primary" id="integ-chave-criar" disabled={criando}>{criando ? <Spinner className="text-white" /> : <><Plus size={15} /> Criar chave</>}</button>
      </form>
      <Resultado r={erro ? { ok: false, mensagem: erro } : null} className="mt-2" />

      {chaves.length > 0 && <div className="mt-4"><TabelaChaves chaves={visiveis} onRevogar={(k) => { setErroRevogar(null); setRevogar(k); }} /></div>}

      {nova && (
        <SegredoUmaVez
          titulo={`Chave criada: ${nova.nome}`} valor={nova.valor} aviso="Guarde agora: ela não aparece de novo." onFechar={() => setNova(null)}
          explicacao={<>Copie e cole no robô do LineChat ou no n8n (no cabeçalho <span className="font-mono">Authorization: Bearer</span> e a chave). Se perder, revogue e crie outra.</>}
        />
      )}
      {revogar && (
        <Confirmar
          open onClose={() => setRevogar(null)} onConfirm={() => void confirmarRevogar()} loading={revogando} perigoso botao="Revogar"
          titulo={`Revogar a chave "${revogar.nome}"?`}
          texto={<>
            <p>Quem usa esta chave (<span className="font-mono">{revogar.inicio}…</span>) para de entrar na hora. Não dá para desfazer: para voltar, crie outra chave e troque no robô ou no n8n.</p>
            <Resultado r={erroRevogar ? { ok: false, mensagem: erroRevogar } : null} />
          </>}
        />
      )}
    </CartaoAjuste>
  );
}

function TabelaChaves({ chaves, onRevogar }: { chaves: ChaveApiTela[]; onRevogar: (k: ChaveApiTela) => void }) {
  const o = useOrdenacaoLocal('criada', 'desc');
  const ordenadas = ordenarLista(chaves, o, {
    nome: (k) => k.nome, inicio: (k) => k.inicio, criada: (k) => k.criadaEm, usada: (k) => k.usadaEm,
    situacao: (k) => (k.revogadaEm ? 1 : 0),
  });
  const pag = usePaginaLocal(ordenadas, 50);
  if (!chaves.length) return <p className="text-[13px] text-muted">Nenhuma chave com esse filtro.</p>;
  return (
    <>
      <div className="overflow-x-auto rounded-xl border border-line">
        <table className="table" id="integ-chaves-lista">
          <thead>
            <tr><ThN /><Th o={o} col="nome">Nome</Th><Th o={o} col="inicio">Começa com</Th><Th o={o} col="criada">Criada</Th><Th o={o} col="usada">Último uso</Th><Th o={o} col="situacao">Situação</Th><th aria-label="Ações" /></tr>
          </thead>
          <tbody>
            {pag.visiveis.map((k, i) => (
              <tr key={k.id}>
                <TdN n={pag.numero(i)} />
                <td className={`font-medium min-w-[140px] ${k.revogadaEm ? 'text-muted' : ''}`}>{k.nome}</td>
                <td className="font-mono text-[12.5px] whitespace-nowrap">{k.inicio}…</td>
                <td className="text-[13px] whitespace-nowrap"><span className="tnum">{dataHoraCurta(k.criadaEm)}</span>{k.criadaPor && <span className="text-muted"> · {k.criadaPor}</span>}</td>
                <td className="text-[13px] whitespace-nowrap" title={k.usadaEm ? dataHoraCurta(k.usadaEm) : undefined}>{k.usadaEm ? haQuanto(k.usadaEm) : <span className="text-muted">nunca</span>}</td>
                <td className="whitespace-nowrap">{k.revogadaEm ? <Chip tone="muted">revogada {dataHoraCurta(k.revogadaEm)}</Chip> : <Chip tone="ok">ativa</Chip>}</td>
                <td className="text-right whitespace-nowrap">
                  {!k.revogadaEm && <button type="button" className="btn-ghost btn-sm text-bad" onClick={() => onRevogar(k)} aria-label={`Revogar a chave ${k.nome}`}><X size={14} /> Revogar</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {pag.rodape}
    </>
  );
}

// ---------- os webhooks ----------

const EXEMPLO_CORPO_WEBHOOK = JSON.stringify({
  evento: 'chamado.movido',
  em: '2026-10-10T14:32:05.000Z',
  chamado: {
    id: '…', codigo: 'SUP-12', titulo: 'Ligações de saída não completam', tipoChamado: 'chamado',
    painel: { id: '…', nome: 'Suporte', sigla: 'SUP' },
    etapa: { id: '…', nome: 'N2', tipo: 'andamento', nivel: 2 },
    situacao: 'aberto',
    cliente: { id: '…', nome: 'Clínica Aurora' },
    contato: { nome: 'Maria', telefone: '5571999990000' },
    responsavel: { id: '…', nome: 'José Prado' },
    prioridade: 'alta', assunto: 'Operadora › DID de saída', etiquetas: [], espera: null,
    link: 'https://…/atendimento/SUP-12', criadoEm: '2026-10-10T12:05:00.000Z',
  },
  de: { id: '…', nome: 'N1' },
  para: { id: '…', nome: 'N2' },
}, null, 2);

function CartaoWebhooks({ webhooks }: { webhooks: WebhookTela[] }) {
  const qc = useQueryClient();
  const [editando, setEditando] = useState<WebhookTela | 'novo' | null>(null);
  const [segredo, setSegredo] = useState<{ nome: string; valor: string } | null>(null);
  const [testando, setTestando] = useState<Set<string>>(new Set());
  const [resultados, setResultados] = useState<Record<string, ResultadoTeste>>({});
  const [mudando, setMudando] = useState<string | null>(null);
  const [erros, setErros] = useState<Record<string, string>>({});
  const ligados = webhooks.filter((w) => w.ativo).length;

  const testar = async (w: WebhookTela) => {
    setTestando((s) => new Set(s).add(w.id));
    setResultados(({ [w.id]: _, ...resto }) => resto);
    try { const r = await api.atendimento.testarWebhook(w.id); setResultados((x) => ({ ...x, [w.id]: r })); }
    catch (e) { setResultados((x) => ({ ...x, [w.id]: { ok: false, mensagem: erroLegivel(e) } })); }
    finally {
      setTestando((s) => { const n = new Set(s); n.delete(w.id); return n; });
      // o último envio (quando, deu certo?) fica no cadastro do webhook
      void qc.invalidateQueries({ queryKey: CHAVE });
    }
  };
  /** Ligar ou desligar direto da lista (vai o resto como está; o segredo não muda). */
  const alternar = async (w: WebhookTela, ativo: boolean) => {
    setMudando(w.id); setErros(({ [w.id]: _, ...resto }) => resto);
    try {
      await api.atendimento.salvarWebhook(w.id, { nome: w.nome, url: w.url, eventos: w.eventos, ativo, novoSegredo: false });
      await qc.invalidateQueries({ queryKey: CHAVE });
    } catch (e) { setErros((x) => ({ ...x, [w.id]: erroLegivel(e) })); } finally { setMudando(null); }
  };

  return (
    <CartaoAjuste id="integ-webhooks" icone={<Webhook size={18} />} titulo="Webhooks: o Gestor avisa o n8n"
      situacao={webhooks.length > 0 && <span className="text-[12.5px] text-muted tnum">{ligados} de {webhooks.length} {webhooks.length === 1 ? 'ligado' : 'ligados'}</span>}
      acoes={<button type="button" className="btn-primary btn-sm" id="integ-webhook-novo" onClick={() => setEditando('novo')}><Plus size={15} /> Novo webhook</button>}>
      <Explicacao>
        <p>
          A cada evento marcado, o Gestor manda um <b>POST</b> com o JSON do chamado para o endereço (só <span className="font-mono">https://</span> da
          internet). Se o endereço falhar, tenta de novo 5 segundos e 30 segundos depois; o último envio aparece aqui.
        </p>
        <p>
          No cabeçalho vão o evento e a assinatura. No n8n, calcule o HMAC-SHA256 do corpo recebido com o segredo do webhook (em
          hexadecimal) e compare com o que vem depois de <span className="font-mono">sha256=</span>: se bater, veio mesmo do Gestor. O segredo
          aparece uma vez, ao criar (ou ao pedir um novo).
        </p>
      </Explicacao>
      <BlocoDeCodigo rotulo="os cabeçalhos" id="integ-webhook-cabecalhos"
        texto={'X-Gestor-Evento: chamado.movido\nX-Gestor-Assinatura: sha256=<HMAC-SHA256 do corpo com o segredo, em hexadecimal>'} />
      <div className="h-3" />
      <details className="text-sm mb-3">
        <summary className="cursor-pointer text-ink-2 font-medium">Como é o corpo do aviso</summary>
        <div className="mt-2 flex flex-col gap-1.5">
          <BlocoDeCodigo texto={EXEMPLO_CORPO_WEBHOOK} rotulo="o exemplo do corpo" />
          <p className="text-[12.5px] text-muted">
            O <span className="font-mono">chamado.movido</span> traz <span className="font-mono">de</span> e <span className="font-mono">para</span>; o{' '}
            <span className="font-mono">chamado.alterado</span>, <span className="font-mono">mudancas</span> (os campos); a{' '}
            <span className="font-mono">chamado.anotacao</span>, <span className="font-mono">anotacao</span> (o texto e quem escreveu). O teste manda o evento{' '}
            <span className="font-mono">teste</span>, sem chamado.
          </p>
        </div>
      </details>

      {!webhooks.length ? (
        <p className="text-[13px] text-muted rounded-xl border border-dashed border-line-strong p-4 text-center" id="integ-webhooks-vazio">
          Nenhum webhook ainda. Crie um para cada fluxo do n8n que precisa saber dos chamados (a NIA, a "Atualização de Card").
        </p>
      ) : (
        <TabelaWebhooks webhooks={webhooks} testando={testando} resultados={resultados} mudando={mudando} erros={erros}
          onTestar={(w) => void testar(w)} onEditar={setEditando} onAlternar={(w, v) => void alternar(w, v)} />
      )}

      {editando && (
        <EditorWebhook w={editando === 'novo' ? null : editando} onFechar={() => setEditando(null)}
          onSegredo={(nome, valor) => setSegredo({ nome, valor })} />
      )}
      {segredo && (
        <SegredoUmaVez
          titulo={`O segredo do webhook ${segredo.nome}`} valor={segredo.valor} aviso="Guarde agora: ele não aparece de novo." onFechar={() => setSegredo(null)}
          explicacao={<>Cole no n8n, para conferir a assinatura de cada aviso (o cabeçalho <span className="font-mono">X-Gestor-Assinatura</span>). Se perder, edite o webhook e peça um segredo novo.</>}
        />
      )}
    </CartaoAjuste>
  );
}

function TabelaWebhooks({ webhooks, testando, resultados, mudando, erros, onTestar, onEditar, onAlternar }: {
  webhooks: WebhookTela[]; testando: Set<string>; resultados: Record<string, ResultadoTeste>; mudando: string | null; erros: Record<string, string>;
  onTestar: (w: WebhookTela) => void; onEditar: (w: WebhookTela) => void; onAlternar: (w: WebhookTela, ativo: boolean) => void;
}) {
  const o = useOrdenacaoLocal('nome');
  const ordenados = ordenarLista(webhooks, o, {
    nome: (w) => w.nome, eventos: (w) => w.eventos.length, ativo: (w) => (w.ativo ? 0 : 1), ultimo: (w) => w.ultimoEm,
  });
  return (
    <div className="overflow-x-auto rounded-xl border border-line">
      <table className="table" id="integ-webhooks-lista">
        <thead>
          <tr><ThN /><Th o={o} col="nome">Webhook</Th><Th o={o} col="eventos">Eventos</Th><Th o={o} col="ativo">Ligado</Th><Th o={o} col="ultimo">Último envio</Th><th aria-label="Ações" /></tr>
        </thead>
        <tbody>
          {ordenados.map((w, i) => {
            const emTeste = testando.has(w.id);
            const r = resultados[w.id];
            return [
              <tr key={w.id}>
                <TdN n={i + 1} />
                {/* o endereço embaixo do nome: assim a linha inteira cabe no cartão, com o Testar à vista */}
                <td className="min-w-[200px] max-w-[280px]">
                  <button type="button" className={`font-semibold text-left hover:text-accent ${w.ativo ? '' : 'text-muted'}`} onClick={() => onEditar(w)}>{w.nome}</button>
                  <div className="font-mono text-[11.5px] text-muted break-all leading-snug mt-0.5">{w.url}</div>
                </td>
                <td className="min-w-[160px]">
                  <span className="flex flex-wrap gap-1">{w.eventos.map((e) => <Chip key={e} tone="neutral" title={e}>{NOME_EVENTO_WEBHOOK[e] ?? e}</Chip>)}</span>
                </td>
                <td className="whitespace-nowrap">
                  <span className="inline-flex items-center gap-1.5">
                    <Interruptor ligado={w.ativo} onChange={(v) => onAlternar(w, v)} rotulo={w.ativo ? `Desligar o webhook ${w.nome}` : `Ligar o webhook ${w.nome}`} desativado={mudando === w.id} />
                    {mudando === w.id && <Spinner />}
                  </span>
                  {erros[w.id] && <div className="text-bad text-[12px] mt-0.5 whitespace-normal max-w-[220px]" role="alert">{erros[w.id]}</div>}
                </td>
                <td className="text-[12.5px] min-w-[160px] max-w-[240px]">
                  {w.ultimoEm ? (
                    <>
                      <span className="tnum">{dataHoraCurta(w.ultimoEm)}</span>{' '}
                      {w.ultimoOk ? <Chip tone="ok">deu certo</Chip> : <Chip tone="bad">falhou</Chip>}
                      {w.ultimaMsg && <div className="text-muted break-words mt-0.5">{w.ultimaMsg}</div>}
                    </>
                  ) : <span className="text-muted">nenhum ainda</span>}
                </td>
                <td className="text-right whitespace-nowrap">
                  <span className="inline-flex items-center gap-1">
                    <button type="button" className="btn-secondary btn-sm" disabled={emTeste} onClick={() => onTestar(w)} title="Manda o evento teste agora, com a assinatura">
                      {emTeste ? <><Spinner /> testando…</> : <><Send size={13} /> Testar</>}
                    </button>
                    <button type="button" className="btn-ghost btn-sm" onClick={() => onEditar(w)} aria-label={`Editar o webhook ${w.nome}`} title="Editar"><Pencil size={14} /></button>
                  </span>
                </td>
              </tr>,
              (emTeste || r) && (
                <tr key={`${w.id}-teste`} className="hover:!bg-transparent">
                  <td />
                  <td colSpan={5} className="pt-0">
                    {emTeste
                      ? <p className="text-[12.5px] text-muted flex items-center gap-1.5" role="status"><Spinner /> Testando {w.nome}… pode levar até 1 minuto se o endereço não responder (são 3 tentativas).</p>
                      : <>
                        <Resultado r={r ?? null} className="mt-0" />
                        {r && !r.ok && <p className="text-[12px] text-muted mt-1">Não chegou: confira o endereço e se o fluxo do n8n está ativo (e escutando POST).</p>}
                      </>}
                  </td>
                </tr>
              ),
            ];
          })}
        </tbody>
      </table>
    </div>
  );
}

function EditorWebhook({ w, onFechar, onSegredo }: { w: WebhookTela | null; onFechar: () => void; onSegredo: (nome: string, valor: string) => void }) {
  const qc = useQueryClient(); const toast = useToast();
  const [nome, setNome] = useState(w?.nome ?? '');
  const [url, setUrl] = useState(w?.url ?? 'https://');
  const [eventos, setEventos] = useState<EventoWebhook[]>(w?.eventos ?? ['chamado.criado', 'chamado.movido']);
  const [ativo, setAtivo] = useState(w?.ativo ?? true);
  const [novoSegredo, setNovoSegredo] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [remover, setRemover] = useState(false);
  const [removendo, setRemovendo] = useState(false);
  const [erroRemover, setErroRemover] = useState<string | null>(null);
  const alternarEvento = (e: EventoWebhook) => { setEventos((xs) => (xs.includes(e) ? xs.filter((x) => x !== e) : [...xs, e])); setErro(null); };

  const salvar = async () => {
    const falta = !nome.trim() ? 'Dê um nome ao webhook (ex.: NIA no n8n).'
      : !/^https:\/\/[^\s/]+\.[^\s]+/i.test(url.trim()) ? 'O endereço precisa começar com https:// e ser de um serviço da internet (ex.: https://n8n.suaempresa.com.br/webhook/…).'
        : !eventos.length ? 'Escolha pelo menos um evento.'
          : null;
    if (falta) { setErro(falta); return; }
    setSalvando(true); setErro(null);
    try {
      // na ordem do catálogo, para a lista ler sempre igual
      const entrada: WebhookGravarEntrada = { nome: nome.trim(), url: url.trim(), eventos: EVENTOS_WEBHOOK.filter((e) => eventos.includes(e)), ativo, novoSegredo };
      const r = await api.atendimento.salvarWebhook(w?.id ?? null, entrada);
      await qc.invalidateQueries({ queryKey: CHAVE });
      toast.push('ok', w ? `Webhook "${r.webhook.nome}" salvo` : `Webhook "${r.webhook.nome}" criado`);
      if (r.segredo) onSegredo(r.webhook.nome, r.segredo);
      onFechar();
    } catch (e) { setErro(erroLegivel(e)); } finally { setSalvando(false); }
  };
  const confirmarRemover = async () => {
    if (!w) return;
    setRemovendo(true); setErroRemover(null);
    try {
      await api.atendimento.removerWebhook(w.id);
      await qc.invalidateQueries({ queryKey: CHAVE });
      toast.push('ok', `Webhook "${w.nome}" removido`);
      onFechar();
    } catch (e) { setErroRemover(erroLegivel(e)); } finally { setRemovendo(false); }
  };

  return (
    <Modal
      open onClose={onFechar} largura="max-w-xl" titulo={w ? `Webhook: ${w.nome}` : 'Novo webhook'}
      rodape={<>
        {erro && <Resultado r={{ ok: false, mensagem: erro }} className="w-full" />}
        {w && <button type="button" className="btn-ghost text-bad mr-auto" id="integ-webhook-remover" onClick={() => { setErroRemover(null); setRemover(true); }}><Trash2 size={15} /> Remover</button>}
        <button type="button" className="btn-secondary" onClick={onFechar}>Cancelar</button>
        <button type="submit" form="form-webhook" className="btn-primary" id="integ-webhook-salvar" disabled={salvando}>{salvando ? <Spinner className="text-white" /> : 'Salvar'}</button>
      </>}
    >
      <form id="form-webhook" autoComplete="off" className="flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); void salvar(); }}>
        <Campo label="Nome" dica="para reconhecer na lista (ex.: NIA no n8n)">
          <input className="input" id="integ-webhook-nome" maxLength={60} autoFocus value={nome} onChange={(e) => { setNome(e.target.value); setErro(null); }} />
        </Campo>
        <Campo label="Endereço" dica="o endereço do webhook no n8n; só https:// da internet">
          <input className="input font-mono text-[13px]" id="integ-webhook-url" spellCheck={false} inputMode="url" maxLength={500} value={url} onChange={(e) => { setUrl(e.target.value); setErro(null); }} />
        </Campo>
        <fieldset className="min-w-0">
          <legend className="label">Os eventos</legend>
          <div className="grid gap-1 grid-cols-1 sm:grid-cols-2">
            {EVENTOS_WEBHOOK.map((e) => (
              <label key={e} className="flex items-start gap-2 text-sm cursor-pointer rounded-md px-1.5 py-1 hover:bg-surface-2 min-w-0">
                <input type="checkbox" className="mt-1 w-4 h-4 shrink-0" checked={eventos.includes(e)} onChange={() => alternarEvento(e)} />
                <span className="min-w-0">{NOME_EVENTO_WEBHOOK[e]}<span className="block font-mono text-[11.5px] text-muted">{e}</span></span>
              </label>
            ))}
          </div>
        </fieldset>
        <label className="flex items-center gap-2.5 text-sm cursor-pointer">
          <Toggle checked={ativo} onChange={setAtivo} /> {ativo ? 'Ligado: recebe os eventos' : 'Desligado: não recebe nada'}
        </label>
        {w ? (
          <label className="flex items-start gap-2 text-sm cursor-pointer">
            <input type="checkbox" id="integ-webhook-novo-segredo" className="mt-1 w-4 h-4 shrink-0" checked={novoSegredo} onChange={(e) => setNovoSegredo(e.target.checked)} />
            <span>
              Gerar um segredo novo
              <span className="block text-[12.5px] text-muted">
                {w.temSegredo ? 'o atual para de valer na hora; o novo aparece uma vez, ao salvar (troque no n8n em seguida)' : 'este webhook está sem segredo: os avisos saem sem assinatura'}
              </span>
            </span>
          </label>
        ) : <p className="text-[12.5px] text-muted">Ao criar, o Gestor gera o segredo da assinatura e mostra uma vez só.</p>}
      </form>

      {remover && w && (
        <Confirmar
          open onClose={() => setRemover(false)} onConfirm={() => void confirmarRemover()} loading={removendo} perigoso botao="Remover"
          titulo={`Remover o webhook "${w.nome}"?`}
          texto={<>
            <p>O Gestor para de avisar <span className="font-mono break-all">{w.url}</span> na hora. Se é só por um tempo, desligue em vez de remover.</p>
            <Resultado r={erroRemover ? { ok: false, mensagem: erroRemover } : null} />
          </>}
        />
      )}
    </Modal>
  );
}

// ---------- abrir o Gestor dentro de outros sistemas ----------

/** "app.inglinechat.com.br/painel/x" → "https://app.inglinechat.com.br": só a origem vale (é o que o navegador confere). */
function origemDoSite(texto: string): { origem: string } | { erro: string } {
  const t = texto.trim();
  let u: URL;
  try { u = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(t) ? t : `https://${t}`); } catch { return { erro: 'Endereço inválido: use o endereço do site, como https://app.inglinechat.com.br.' }; }
  if (u.protocol !== 'https:') return { erro: 'Use um site com https:// (o Gestor só abre dentro de site seguro).' };
  if (!/^https:\/\/[a-z0-9.-]+(:\d+)?$/i.test(u.origin)) return { erro: 'Endereço inválido: use o endereço do site, como https://app.inglinechat.com.br.' };
  return { origem: u.origin };
}

function CartaoSites({ inicial, base }: { inicial: string[]; base: string }) {
  const qc = useQueryClient(); const toast = useToast();
  const [sites, setSites] = useState<string[]>(inicial);
  const [novo, setNovo] = useState('');
  const [aviso, setAviso] = useState<ResultadoTeste | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const mudou = JSON.stringify(sites) !== JSON.stringify(inicial);

  /** Põe o que está escrito na lista; devolve a lista nova (ou nulo, se o endereço não serve). */
  const incluir = (): string[] | null => {
    if (!novo.trim()) return sites;
    const r = origemDoSite(novo);
    if ('erro' in r) { setAviso({ ok: false, mensagem: r.erro }); return null; }
    if (sites.includes(r.origem)) { setAviso({ ok: false, mensagem: `${r.origem} já está na lista.` }); return null; }
    const lista = [...sites, r.origem];
    setSites(lista); setNovo(''); setErro(null);
    // o caminho não conta: o navegador confere só o site
    setAviso(r.origem !== novo.trim().replace(/\/+$/, '') ? { ok: true, mensagem: `Ficou só o endereço do site: ${r.origem}. Clique em Salvar para valer.` } : null);
    return lista;
  };
  const salvar = async () => {
    // o que ficou escrito na caixa entra junto (ninguém espera perder o que digitou por não ter clicado em Incluir)
    const lista = incluir();
    if (!lista) return;
    setSalvando(true); setErro(null);
    try {
      const r = await api.atendimento.salvarSites(lista);
      setSites(r.sites); setAviso(null);
      qc.setQueryData<IntegracoesTela>(CHAVE, (x) => (x ? { ...x, sites: r.sites } : x));
      toast.push('ok', r.sites.length ? 'Sites salvos: o Gestor já abre dentro deles.' : 'Salvo: o Gestor só abre nele mesmo.');
    } catch (e) { setErro(erroLegivel(e)); } finally { setSalvando(false); }
  };

  return (
    <CartaoAjuste id="integ-iframe" icone={<AppWindow size={18} />} titulo="Abrir o Gestor dentro de outros sistemas" ligado={inicial.length > 0}
      situacao={inicial.length ? <Chip tone="ok">{inicial.length} {inicial.length === 1 ? 'site liberado' : 'sites liberados'}</Chip> : <Chip tone="muted">só no próprio Gestor</Chip>}>
      <Explicacao>
        <p>
          Os sites que podem mostrar o Gestor dentro deles (o menu do LineChat em "página interna", outro programa). <b>Sem nenhum site na
          lista, o Gestor só abre nele mesmo</b> — a proteção contra quem tenta enganar a pessoa com o Gestor escondido dentro de outra página.
        </p>
        <p>
          O login dentro do outro site é separado: a pessoa entra uma vez lá dentro, e fica. Alguns navegadores (o Safari, principalmente)
          podem pedir o login de novo, porque guardam à parte o que é aberto dentro de outro site.
        </p>
      </Explicacao>

      <div className="flex flex-col gap-1.5" id="integ-sites">
        {sites.map((s) => (
          <div key={s} className="flex items-center gap-2 rounded-lg border border-line px-3 py-1.5 min-w-0">
            <span className="font-mono text-[13px] break-all flex-1 min-w-0">{s}</span>
            {!inicial.includes(s) && <Chip tone="signal">não salvo</Chip>}
            <button type="button" className="btn-ghost btn-sm shrink-0" aria-label={`Tirar ${s} da lista`} title="Tirar da lista (vale ao salvar)"
              onClick={() => { setSites(sites.filter((x) => x !== s)); setAviso(null); setErro(null); }}><X size={14} /></button>
          </div>
        ))}
        {!sites.length && <p className="text-[13px] text-muted">Nenhum site: o Gestor só abre nele mesmo.</p>}
      </div>
      <form autoComplete="off" className="flex flex-wrap items-end gap-2 mt-3" onSubmit={(e) => { e.preventDefault(); incluir(); }}>
        <label className="min-w-0 flex-1 basis-[240px]">
          <span className="label">Incluir um site</span>
          <input className="input font-mono text-[13px]" id="integ-site-novo" inputMode="url" spellCheck={false} placeholder="https://app.inglinechat.com.br"
            value={novo} onChange={(e) => { setNovo(e.target.value); setAviso(null); }} />
        </label>
        <button type="submit" className="btn-secondary" id="integ-site-incluir" disabled={!novo.trim()}><Plus size={15} /> Incluir</button>
      </form>
      <Resultado r={aviso} className="mt-2" />
      <div className="flex flex-wrap items-center gap-2 mt-3">
        <button type="button" className="btn-primary" id="integ-sites-salvar" disabled={salvando || (!mudou && !novo.trim())} onClick={() => void salvar()}>{salvando ? <Spinner className="text-white" /> : 'Salvar'}</button>
        {mudou && <span className="text-[12.5px] text-signal">há mudanças sem salvar</span>}
      </div>
      <Resultado r={erro ? { ok: false, mensagem: erro } : null} className="mt-2" />

      <Rotulo>O endereço para o menu personalizado do LineChat (página interna)</Rotulo>
      <Copiavel texto={`${base}/atendimento`} rotulo="o endereço do menu" id="integ-menu-endereco" />
      <p className="text-[12.5px] text-muted mt-1.5">No LineChat, em Admin › Ações e menus personalizados, crie um menu "Chamados" abrindo em "página interna" com este endereço — e inclua o site do LineChat na lista acima.</p>
    </CartaoAjuste>
  );
}

// ---------- o link da conversa ----------

function CartaoLinkConversa({ inicial }: { inicial: string }) {
  const qc = useQueryClient(); const toast = useToast();
  const [modelo, setModelo] = useState(inicial);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const t = modelo.trim();
  const mudou = t !== inicial;
  const exemplo = linkDaConversa(t, '8f3c2a10');

  const salvar = async () => {
    if (t && (!/^https:\/\//i.test(t) || !t.includes('{sessao}'))) { setErro('Use um endereço com https:// e o {sessao} no lugar do número da conversa.'); return; }
    setSalvando(true); setErro(null);
    try {
      const r = await api.atendimento.salvarLinkConversa(t);
      setModelo(r.linkConversa);
      qc.setQueryData<IntegracoesTela>(CHAVE, (x) => (x ? { ...x, linkConversa: r.linkConversa } : x));
      toast.push('ok', r.linkConversa ? 'Link salvo: a ficha do chamado já mostra a conversa no LineChat.' : 'Link tirado: a ficha não mostra mais a conversa.');
    } catch (e) { setErro(erroLegivel(e)); } finally { setSalvando(false); }
  };

  return (
    <CartaoAjuste id="integ-link" icone={<Link2 size={18} />} titulo="O link da conversa no LineChat" ligado={!!inicial}
      situacao={inicial ? <Chip tone="ok">a ficha mostra o link</Chip> : <Chip tone="muted">sem link</Chip>}>
      <Explicacao>
        <p>
          É o que faz a ficha do chamado ter o link <b>"Conversa no LineChat"</b> (quando o chamado sabe a conversa: o robô, o botão).
          Abra uma conversa no LineChat, copie o endereço da barra e troque o número da conversa por <span className="font-mono">{'{sessao}'}</span>.
          Vazio, a ficha não mostra o link.
        </p>
      </Explicacao>
      <form autoComplete="off" className="flex flex-col gap-2" onSubmit={(e) => { e.preventDefault(); void salvar(); }}>
        <Campo label="O modelo do endereço">
          <input className="input font-mono text-[13px]" id="integ-link-modelo" spellCheck={false} inputMode="url" maxLength={300}
            placeholder="https://…/{sessao}" value={modelo} onChange={(e) => { setModelo(e.target.value); setErro(null); }} />
        </Campo>
        {t && (
          <p className="text-[12.5px] text-muted break-all">
            {exemplo ? <>Com a conversa <span className="font-mono">8f3c2a10</span>, o link fica: <span className="font-mono text-ink-2">{exemplo}</span></> : <span className="text-signal">Falta o {'{sessao}'}: é onde entra o número da conversa.</span>}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <button type="submit" className="btn-primary" id="integ-link-salvar" disabled={salvando || !mudou}>{salvando ? <Spinner className="text-white" /> : 'Salvar'}</button>
          {mudou && <span className="text-[12.5px] text-signal">há mudanças sem salvar</span>}
        </div>
        <Resultado r={erro ? { ok: false, mensagem: erro } : null} className="mt-0" />
      </form>
    </CartaoAjuste>
  );
}
