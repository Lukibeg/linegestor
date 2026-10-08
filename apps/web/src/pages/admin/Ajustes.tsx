/**
 * Administração › Ajustes: as integrações do sistema.
 *
 *  - **Backup no Google Drive**: para onde a cópia diária sobe.
 *  - **Avisos**: para onde o sistema grita quando cai ou quando o backup falha.
 *  - **Chamados do LineChat**: de onde vêm os chamados da tela de Chamados (o token e o painel).
 *  - **IA da base de conhecimento** (1.8): o "Perguntar à IA" e o rascunho a partir do chamado, com o
 *    provedor que a empresa escolher (Anthropic, OpenAI, Google ou outro compatível).
 *
 * Tudo se preenche aqui, não em arquivo no servidor. Cada cartão explica o que é, o que preencher
 * e tem um botão de testar que dá a resposta na hora — nada de salvar e torcer.
 */
import { useEffect, useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Bot, CheckCircle2, CloudUpload, FileKey, Headset, MessageSquare, TriangleAlert, Upload } from 'lucide-react';
import { ENDERECOS_COMPATIVEIS, enderecoValido, hostDoEndereco, INFO_PROVEDORES, PROVEDORES_IA } from '@gestor/shared';
import { api, IS_DEMO } from '../../api/index.js';
import type { AjustesAvisos, AjustesBackup, AjustesIa, AjustesLineChat, ModeloIa, PainelLineChat, ProvedorIa } from '../../api/types.js';
import { Campo, Carregando, Chip, Spinner, Toggle, mensagemErro, useToast } from '../../components/ui/index.js';
import { data } from '../../lib/format.js';

export function Ajustes() {
  const backup = useQuery({ queryKey: ['settings', 'backup'], queryFn: () => api.settings.backup() });
  const avisos = useQuery({ queryKey: ['settings', 'alerts'], queryFn: () => api.settings.alerts() });
  const linechat = useQuery({ queryKey: ['settings', 'linechat'], queryFn: () => api.settings.linechat() });
  const ia = useQuery({ queryKey: ['base', 'ia', 'ajustes'], queryFn: () => api.base.iaAjustes() });
  if (backup.isLoading || avisos.isLoading || linechat.isLoading || ia.isLoading) return <Carregando />;
  // sem a permissão (o endereço digitado direto), o servidor recusa: mostra o porquê em vez de quebrar a tela
  const falhou = [backup, avisos, linechat].find((q) => q.isError);
  if (falhou) return <p className="text-bad text-sm" role="alert">{mensagemErro(falhou.error)}</p>;
  return (
    <div className="flex flex-col gap-4 max-w-3xl">
      <CartaoBackup inicial={backup.data!} />
      <CartaoAvisos inicial={avisos.data!} />
      <CartaoLineChat inicial={linechat.data!} />
      {ia.data && <CartaoIa inicial={ia.data} />}
    </div>
  );
}

// ---------- peças comuns ----------

function Cartao({ icone, titulo, ligado, children }: { icone: ReactNode; titulo: string; ligado: boolean; children: ReactNode }) {
  return (
    <section className="card p-5">
      <div className="flex items-center gap-3 mb-1">
        <span className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${ligado ? 'bg-ok-soft text-ok' : 'bg-surface-2 text-muted'}`}>{icone}</span>
        <h2 className="font-display font-semibold text-lg">{titulo}</h2>
        {ligado ? <Chip tone="ok">ligado</Chip> : <Chip tone="muted">desligado</Chip>}
      </div>
      {children}
    </section>
  );
}

function Explicacao({ children }: { children: ReactNode }) {
  return <div className="text-[13.5px] text-ink-2 leading-relaxed border-l-2 border-line pl-3 my-3 flex flex-col gap-2">{children}</div>;
}

function Resultado({ r }: { r: { ok: boolean; mensagem: string } | null }) {
  if (!r) return null;
  return (
    <div className={`text-[13px] mt-3 flex items-start gap-2 rounded-lg p-2.5 ${r.ok ? 'bg-ok-soft text-ok' : 'bg-bad-soft text-bad'}`}>
      {r.ok ? <CheckCircle2 size={15} className="mt-0.5 shrink-0" /> : <TriangleAlert size={15} className="mt-0.5 shrink-0" />}
      <span>{r.mensagem}</span>
    </div>
  );
}

function Ultimo({ em, ok, msg, rotulo }: { em: string | null; ok: boolean | null; msg: string | null; rotulo: string }) {
  if (!em) return <p className="text-[12.5px] text-muted mt-3">{rotulo}: ainda não aconteceu nenhuma vez.</p>;
  return (
    <p className={`text-[12.5px] mt-3 ${ok ? 'text-muted' : 'text-bad'}`}>
      {rotulo}: {data(em, true)} — {ok ? 'deu certo' : 'falhou'}{msg ? `. ${msg}` : ''}
    </p>
  );
}

// ---------- backup no Google Drive ----------

function CartaoBackup({ inicial }: { inicial: AjustesBackup }) {
  const qc = useQueryClient(); const toast = useToast();
  const [f, setF] = useState({ ativo: inicial.ativo, pasta: inicial.pasta, pastaId: inicial.pastaId });
  const [chave, setChave] = useState<{ nome: string; texto: string } | null>(null);
  const [busy, setBusy] = useState(false); const [testando, setTestando] = useState(false);
  const [res, setRes] = useState<{ ok: boolean; mensagem: string } | null>(null);
  useEffect(() => { setF({ ativo: inicial.ativo, pasta: inicial.pasta, pastaId: inicial.pastaId }); }, [inicial]);

  const escolherArquivo = async (arq: File | null) => {
    if (!arq) return;
    const texto = await arq.text();
    try { const j = JSON.parse(texto); if (j.type !== 'service_account') throw new Error(); setChave({ nome: arq.name, texto }); setRes(null); }
    catch { setRes({ ok: false, mensagem: 'Esse arquivo não é a chave de uma conta de serviço do Google. Deve ser um .json com "type": "service_account".' }); }
  };

  const salvar = async () => {
    setBusy(true); setRes(null);
    try {
      await api.settings.saveBackup({ ...f, chaveJson: chave?.texto });
      setChave(null);
      await qc.invalidateQueries({ queryKey: ['settings', 'backup'] });
      toast.push('ok', 'Ajustes do backup salvos');
    } catch (e) { setRes({ ok: false, mensagem: mensagemErro(e) }); } finally { setBusy(false); }
  };

  const testar = async () => {
    setTestando(true); setRes(null);
    try { setRes(await api.settings.testBackup()); await qc.invalidateQueries({ queryKey: ['settings', 'backup'] }); }
    catch (e) { setRes({ ok: false, mensagem: mensagemErro(e) }); } finally { setTestando(false); }
  };

  return (
    <Cartao icone={<CloudUpload size={18} />} titulo="Backup no Google Drive" ligado={inicial.ativo}>
      <Explicacao>
        <p>
          Todo dia às 3h o sistema faz uma cópia inteira do banco e guarda no servidor. Aqui você diz para
          onde <b>também</b> mandar essa cópia — uma pasta do Drive da empresa. É o que salva a empresa se o
          servidor morrer: backup que só existe no mesmo servidor não protege de nada.
        </p>
        <p>
          Quem envia é uma <b>conta de serviço</b>: uma conta de robô criada no Google Cloud, que não tem
          senha, não expira e não some quando alguém sai da empresa. Você baixa a chave dela (um arquivo
          <code className="mx-1">.json</code>), compartilha a pasta do Drive com o e-mail do robô e envia a chave aqui.
          O passo a passo está em <b>docs/guia-de-uso/backup-no-google-drive.md</b>.
        </p>
      </Explicacao>

      <div className="flex flex-col gap-3">
        <label className="flex items-center gap-2.5 text-sm cursor-pointer">
          <Toggle checked={f.ativo} onChange={(v) => setF({ ...f, ativo: v })} /> Mandar o backup diário para o Google Drive
        </label>

        <Campo label="Id da pasta no Drive" dica="abra a pasta no navegador e copie o pedaço final do endereço, depois de /folders/">
          <input className="input font-mono" id="drive-pasta-id" placeholder="1A2b3C4d5E6f7G8h9I0jKlMnOpQrStUv" value={f.pastaId} onChange={(e) => setF({ ...f, pastaId: e.target.value })} />
        </Campo>

        <Campo label="Nome da pasta" dica="só para você reconhecer aqui na tela">
          <input className="input" id="drive-pasta-nome" placeholder="Backups › Ingline Gestão" value={f.pasta} onChange={(e) => setF({ ...f, pasta: e.target.value })} />
        </Campo>

        <Campo label="Chave da conta de serviço" dica={inicial.temChave ? 'já existe uma guardada; só envie de novo se ela mudou' : 'o arquivo .json que o Google Cloud baixou'}>
          <div className="flex items-center gap-2 flex-wrap">
            <label className="btn-secondary btn-sm cursor-pointer">
              <Upload size={14} /> Escolher arquivo…
              <input type="file" accept="application/json,.json" className="hidden" onChange={(e) => void escolherArquivo(e.target.files?.[0] ?? null)} />
            </label>
            {chave
              ? <span className="text-[13px] flex items-center gap-1.5 text-ok"><FileKey size={14} /> {chave.nome} <span className="text-muted">(será salvo ao clicar em Salvar)</span></span>
              : inicial.temChave
                ? <span className="text-[13px] text-muted flex items-center gap-1.5"><FileKey size={14} /> chave guardada no cofre{inicial.contaDeServico ? ` · ${inicial.contaDeServico}` : ''}</span>
                : <span className="text-[13px] text-muted">nenhuma chave guardada ainda</span>}
          </div>
        </Campo>

        {inicial.contaDeServico && (
          <p className="text-[12.5px] text-muted -mt-1">
            Compartilhe a pasta do Drive com <b className="font-mono text-ink-2">{inicial.contaDeServico}</b>, como <b>Editor</b>, senão o robô não enxerga a pasta.
          </p>
        )}

        <div className="flex gap-2 flex-wrap">
          <button className="btn-primary" disabled={busy} onClick={salvar}>{busy ? <Spinner className="text-white" /> : 'Salvar'}</button>
          <button className="btn-secondary" disabled={testando || (!inicial.temChave && !chave)} onClick={testar}>{testando ? <Spinner /> : 'Testar agora'}</button>
        </div>
        <p className="text-[12px] text-muted -mt-1">O teste procura a pasta e manda um arquivinho de texto para lá. Pode apagar depois.</p>
      </div>

      <Resultado r={res} />
      <Ultimo rotulo="Último envio" em={inicial.ultimoEnvioEm} ok={inicial.ultimoEnvioOk} msg={inicial.ultimoEnvioMsg} />
    </Cartao>
  );
}

// ---------- avisos ----------

function CartaoAvisos({ inicial }: { inicial: AjustesAvisos }) {
  const qc = useQueryClient(); const toast = useToast();
  const [f, setF] = useState({ ativo: inicial.ativo, url: inicial.url, metodo: inicial.metodo, cabecalhos: inicial.cabecalhos, corpo: inicial.corpo });
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false); const [testando, setTestando] = useState(false);
  const [res, setRes] = useState<{ ok: boolean; mensagem: string } | null>(null);
  useEffect(() => { setF({ ativo: inicial.ativo, url: inicial.url, metodo: inicial.metodo, cabecalhos: inicial.cabecalhos, corpo: inicial.corpo }); }, [inicial]);

  const salvar = async () => {
    setBusy(true); setRes(null);
    try {
      await api.settings.saveAlerts({ ...f, token: token || undefined });
      setToken('');
      await qc.invalidateQueries({ queryKey: ['settings', 'alerts'] });
      toast.push('ok', 'Ajustes de aviso salvos');
    } catch (e) { setRes({ ok: false, mensagem: mensagemErro(e) }); } finally { setBusy(false); }
  };
  const testar = async () => {
    setTestando(true); setRes(null);
    try { setRes(await api.settings.testAlerts()); await qc.invalidateQueries({ queryKey: ['settings', 'alerts'] }); }
    catch (e) { setRes({ ok: false, mensagem: mensagemErro(e) }); } finally { setTestando(false); }
  };

  return (
    <Cartao icone={<MessageSquare size={18} />} titulo="Avisos (WhatsApp pelo LineChat)" ligado={inicial.ativo}>
      <Explicacao>
        <p>
          Quando o sistema deixa de responder, ou quando o backup falha, alguém precisa ficar sabendo na
          hora — não na semana seguinte. Aqui você diz <b>para qual endereço o sistema deve mandar o recado</b>.
        </p>
        <p>
          Serve qualquer API que aceite uma chamada HTTP. No caso de vocês, a do <b>LineChat</b>, que entrega
          no WhatsApp. Preencha o endereço, o que vai no cabeçalho e o que vai no corpo da mensagem, exatamente
          como a documentação do LineChat pedir. Onde você escrever <code className="mx-1">{'{{mensagem}}'}</code> entra
          o texto do aviso, e onde escrever <code className="mx-1">{'{{token}}'}</code> entra o token guardado abaixo
          (que fica cifrado no cofre, e nunca aparece de volta na tela).
        </p>
      </Explicacao>

      <div className="flex flex-col gap-3">
        <label className="flex items-center gap-2.5 text-sm cursor-pointer">
          <Toggle checked={f.ativo} onChange={(v) => setF({ ...f, ativo: v })} /> Mandar aviso quando o sistema cair ou o backup falhar
        </label>

        <div className="grid gap-3 sm:grid-cols-[1fr_120px]">
          <Campo label="Endereço da API (URL)">
            <input className="input font-mono text-[13px]" id="aviso-url" placeholder="https://linechat.inglinesystems.com.br/api/mensagens" value={f.url} onChange={(e) => setF({ ...f, url: e.target.value })} />
          </Campo>
          <Campo label="Método">
            <select className="input" id="aviso-metodo" value={f.metodo} onChange={(e) => setF({ ...f, metodo: e.target.value as 'POST' | 'GET' })}>
              <option value="POST">POST</option><option value="GET">GET</option>
            </select>
          </Campo>
        </div>

        <Campo label="Token / chave da API" dica={inicial.temToken ? 'já existe um guardado; preencha só para trocar' : 'fica cifrado no cofre; use {{token}} nos campos abaixo'}>
          <input className="input font-mono text-[13px]" id="aviso-token" type="password" placeholder={inicial.temToken ? '••••••••  (guardado)' : ''} value={token} onChange={(e) => setToken(e.target.value)} />
        </Campo>

        <Campo label="Cabeçalhos" dica="em JSON, como a API pedir">
          <textarea className="input font-mono text-[12.5px]" id="aviso-cabecalhos" rows={4} value={f.cabecalhos} onChange={(e) => setF({ ...f, cabecalhos: e.target.value })} spellCheck={false} />
        </Campo>

        {f.metodo === 'POST' && (
          <Campo label="Corpo da mensagem" dica="em JSON; {{mensagem}} vira o texto do aviso">
            <textarea className="input font-mono text-[12.5px]" id="aviso-corpo" rows={5} value={f.corpo} onChange={(e) => setF({ ...f, corpo: e.target.value })} spellCheck={false} />
          </Campo>
        )}

        <div className="flex gap-2 flex-wrap">
          <button className="btn-primary" disabled={busy} onClick={salvar}>{busy ? <Spinner className="text-white" /> : 'Salvar'}</button>
          <button className="btn-secondary" disabled={testando || !f.url} onClick={testar}>{testando ? <Spinner /> : 'Mandar teste agora'}</button>
        </div>
        <p className="text-[12px] text-muted -mt-1">O teste manda uma mensagem de verdade, com um texto dizendo que é teste. Salve antes.</p>
      </div>

      <Resultado r={res} />
      <Ultimo rotulo="Último teste" em={inicial.ultimoTesteEm} ok={inicial.ultimoTesteOk} msg={inicial.ultimoTesteMsg} />
    </Cartao>
  );
}

// ---------- chamados do LineChat ----------

function CartaoLineChat({ inicial }: { inicial: AjustesLineChat }) {
  const qc = useQueryClient(); const toast = useToast();
  const [f, setF] = useState({ ativo: inicial.ativo, url: inicial.url, appUrl: inicial.appUrl, painelId: inicial.painelId, painelNome: inicial.painelNome });
  const [token, setToken] = useState('');
  const [paineis, setPaineis] = useState<PainelLineChat[] | null>(null);
  const [busy, setBusy] = useState<'' | 'salvar' | 'testar' | 'paineis' | 'sync' | 'completa'>('');
  const [res, setRes] = useState<{ ok: boolean; mensagem: string } | null>(null);
  useEffect(() => { setF({ ativo: inicial.ativo, url: inicial.url, appUrl: inicial.appUrl, painelId: inicial.painelId, painelNome: inicial.painelNome }); }, [inicial]);

  const atualizar = () => Promise.all([qc.invalidateQueries({ queryKey: ['settings', 'linechat'] }), qc.invalidateQueries({ queryKey: ['chamados'] })]);
  const rodar = async (qual: typeof busy, fn: () => Promise<{ ok: boolean; mensagem: string } | void>) => {
    setBusy(qual); setRes(null);
    try { const r = await fn(); if (r) setRes(r); await atualizar(); }
    catch (e) { setRes({ ok: false, mensagem: mensagemErro(e) }); }
    finally { setBusy(''); }
  };

  const salvar = () => rodar('salvar', async () => {
    await api.settings.saveLinechat({ ...f, token: token || undefined });
    setToken('');
    toast.push('ok', 'Ajustes do LineChat salvos');
  });
  const carregarPaineis = () => rodar('paineis', async () => {
    const lista = await api.settings.paineisLinechat();
    setPaineis(lista);
    // o painel de suporte costuma ser o óbvio: já deixa escolhido se ainda não houver nenhum
    if (!f.painelId) { const p = lista.find((x) => /suporte/i.test(x.title)); if (p) setF((a) => ({ ...a, painelId: p.id, painelNome: p.title })); }
    return { ok: true, mensagem: `${lista.length} painéis encontrados. Escolha o de suporte e clique em Salvar.` };
  });
  const sincronizar = (completa: boolean) => rodar(completa ? 'completa' : 'sync', () => api.settings.syncLinechat(completa));

  const opcoes = paineis ?? (f.painelId ? [{ id: f.painelId, title: f.painelNome || f.painelId, key: null, type: null }] : []);
  const salvo = inicial.temToken && !!inicial.painelId;
  const nf = (n: number) => n.toLocaleString('pt-BR');

  return (
    <Cartao icone={<Headset size={18} />} titulo="Chamados do LineChat" ligado={inicial.ativo}>
      <Explicacao>
        <p>
          A tela de <b>Chamados</b> mostra os chamados de suporte que a equipe abre no LineChat — o que o Grafana
          mostrava. O Gestor guarda uma cópia do painel: na primeira vez lê tudo, e depois, <b>a cada minuto</b>, só o
          que mudou.
        </p>
        <p>
          Excluir um card no LineChat não conta como mudança, então o Gestor confere à parte: <b>a cada 10 minutos</b>{' '}
          relê os chamados da última semana e, <b>à meia-noite</b>, o painel inteiro. O card excluído lá sai da tela e
          das contas — fica guardado aqui, marcado como excluído, e volta sozinho se reaparecer no LineChat.
        </p>
        <p>
          Ao guardar a cópia, o Gestor também anota <b>cada vez que um chamado muda de etapa</b>, com a hora. O LineChat
          não entrega esse histórico pela API; é daqui que vai sair o tempo em cada nível (N1, N2, N3). Ele vale a partir
          da primeira leitura.
        </p>
        <p>
          A chave de API se gera no LineChat, em <b>Integrações › Token</b>. Ela fica cifrada no cofre e não aparece de
          volta na tela.
        </p>
      </Explicacao>

      <div className="flex flex-col gap-3">
        <label className="flex items-center gap-2.5 text-sm cursor-pointer">
          <Toggle checked={f.ativo} onChange={(v) => setF({ ...f, ativo: v })} /> Ler os chamados do LineChat a cada minuto
        </label>

        <Campo label="Chave de API do LineChat" dica={inicial.temToken ? 'já existe uma guardada; preencha só para trocar' : 'começa com pn_ — fica cifrada no cofre'}>
          <input className="input font-mono text-[13px]" id="linechat-token" type="password" autoComplete="off" placeholder={inicial.temToken ? '••••••••  (guardada)' : 'pn_…'} value={token} onChange={(e) => setToken(e.target.value)} />
        </Campo>

        <Campo label="Painel de onde ler" dica={inicial.temToken ? 'clique em "Buscar painéis" para ver a lista do LineChat' : 'salve a chave primeiro; depois a lista de painéis aparece aqui'}>
          <div className="flex gap-2 flex-wrap">
            <select className="input flex-1 min-w-[220px]" id="linechat-painel" value={f.painelId}
              onChange={(e) => { const p = opcoes.find((x) => x.id === e.target.value); setF({ ...f, painelId: e.target.value, painelNome: p?.title ?? '' }); }}>
              <option value="">— escolha —</option>
              {opcoes.map((p) => <option key={p.id} value={p.id}>{p.title}{p.key ? ` (${p.key})` : ''}</option>)}
            </select>
            <button className="btn-secondary" disabled={!inicial.temToken || !!busy} onClick={carregarPaineis}>{busy === 'paineis' ? <Spinner /> : 'Buscar painéis'}</button>
          </div>
        </Campo>

        <details className="text-sm">
          <summary className="cursor-pointer text-muted">Endereços (só mude se o LineChat mudar de endereço)</summary>
          <div className="grid gap-3 sm:grid-cols-2 mt-3">
            <Campo label="API do LineChat"><input className="input font-mono text-[13px]" id="linechat-url" value={f.url} onChange={(e) => setF({ ...f, url: e.target.value })} /></Campo>
            <Campo label="Onde a equipe abre os cards" dica="para o link de cada chamado"><input className="input font-mono text-[13px]" id="linechat-app" value={f.appUrl} onChange={(e) => setF({ ...f, appUrl: e.target.value })} /></Campo>
          </div>
        </details>

        <div className="flex gap-2 flex-wrap">
          <button className="btn-primary" disabled={!!busy} onClick={salvar}>{busy === 'salvar' ? <Spinner className="text-white" /> : 'Salvar'}</button>
          <button className="btn-secondary" disabled={!!busy || !inicial.temToken} onClick={() => rodar('testar', () => api.settings.testLinechat())}>{busy === 'testar' ? <Spinner /> : 'Testar agora'}</button>
          <button className="btn-secondary" disabled={!!busy || !salvo} onClick={() => sincronizar(false)} title="Busca agora o que mudou (a primeira vez lê tudo)">{busy === 'sync' ? <Spinner /> : 'Sincronizar agora'}</button>
          <button className="btn-ghost" disabled={!!busy || !salvo} onClick={() => sincronizar(true)} title="Relê o painel inteiro — leva cerca de um minuto">{busy === 'completa' ? <><Spinner /> lendo tudo…</> : 'Reler tudo'}</button>
        </div>
        <p className="text-[12px] text-muted -mt-1">O teste confere a chave e o painel sem gravar nada. "Reler tudo" leva cerca de um minuto (são 100 cards por vez).</p>
      </div>

      <Resultado r={res} />
      <Ultimo rotulo="Última leitura" em={inicial.ultimaEm} ok={inicial.ultimaOk} msg={inicial.ultimaMsg} />
      {inicial.totais.cards > 0 && (
        <p className="text-[12.5px] text-muted mt-1">
          Guardados: <b className="text-ink-2 tnum">{nf(inicial.totais.cards)}</b> chamados ({nf(inicial.totais.ativos)} no Kanban, {nf(inicial.totais.arquivados)} arquivados)
          {' '}e <b className="text-ink-2 tnum">{nf(inicial.totais.movimentos)}</b> mudanças de etapa registradas
          {inicial.inicioEm ? <> desde {data(inicial.inicioEm, true)}</> : null}.
          {inicial.totais.excluidos > 0 && <> Fora das contas: <b className="text-ink-2 tnum">{nf(inicial.totais.excluidos)}</b> {inicial.totais.excluidos === 1 ? 'excluído' : 'excluídos'} no LineChat.</>}
        </p>
      )}
      {inicial.excluidos.length > 0 && (
        <details className="mt-2 text-[12.5px]" id="linechat-excluidos">
          <summary className="cursor-pointer text-muted">Excluídos no LineChat ({nf(inicial.excluidos.length)})</summary>
          <p className="mt-2 text-muted">
            Não vieram mais do LineChat, então saíram da tela e das contas. O código abre o card lá: se ele abrir, não foi
            excluído — clique em "Reler tudo" e ele volta.
          </p>
          <ul className="mt-2 flex flex-col gap-1 max-h-64 overflow-y-auto">
            {inicial.excluidos.map((c) => (
              <li key={c.id} className="text-ink-2">
                {c.key && inicial.painelId
                  ? <a className="font-mono text-accent hover:underline" href={`${inicial.appUrl.replace(/\/+$/, '')}/panels/${inicial.painelId}/card/${encodeURIComponent(c.key)}`} target="_blank" rel="noreferrer">{c.key}</a>
                  : <span className="font-mono">{c.key ?? (c.number != null ? `#${c.number}` : '—')}</span>}
                {' '}· {c.title || 'sem título'} <span className="text-muted">· aberto em <span className="tnum">{data(c.createdAt, true)}</span>{c.removedAt ? <>, excluído em <span className="tnum">{data(c.removedAt, true)}</span></> : null}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
      {inicial.execucoes.length > 0 && (
        <details className="mt-2 text-[12.5px]">
          <summary className="cursor-pointer text-muted">Últimas leituras registradas</summary>
          <ul className="mt-2 flex flex-col gap-1">
            {inicial.execucoes.map((x) => (
              <li key={x.id} className={x.ok ? 'text-ink-2' : 'text-bad'}>
                <span className="tnum">{data(x.startedAt, true)}</span> · {x.kind === 'completa' ? 'completa' : x.kind === 'conferencia' ? 'conferência' : 'recente'}{x.trigger === 'manual' ? ' (botão)' : ''} — {x.message}
              </li>
            ))}
          </ul>
        </details>
      )}
    </Cartao>
  );
}

// ---------- a IA da base de conhecimento (1.8), com o provedor que a empresa escolher ----------

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
/** "0,25" ou "0.25" → 0.25; em branco → null; o que não for número → NaN (a tela avisa) */
const lerPreco = (t: string) => { const v = t.trim().replace(',', '.'); return v ? Number(v) : null; };
const mostrarPreco = (v: number | null) => (v == null ? '' : String(v).replace('.', ','));
/** "começa com sk-ant-" → "sk-ant-…" (o exemplo do campo da chave) */
const exemploDaChave = (p: ProvedorIa) => { const m = /começa com (\S+)/.exec(INFO_PROVEDORES[p].chave); return m ? `${m[1]}…` : 'a chave do serviço'; };

type FormIa = { ativo: boolean; provedor: ProvedorIa; modelo: string; modeloNome: string | null; endereco: string; precoEntrada: string; precoSaida: string };
const formDe = (a: AjustesIa): FormIa => ({
  ativo: a.ativo, provedor: a.provedor, modelo: a.modelo, modeloNome: a.modeloNome, endereco: a.endereco ?? '',
  precoEntrada: mostrarPreco(a.precoEntrada), precoSaida: mostrarPreco(a.precoSaida),
});

function CartaoIa({ inicial }: { inicial: AjustesIa }) {
  const qc = useQueryClient(); const toast = useToast();
  const [f, setF] = useState<FormIa>(formDe(inicial));
  const [chave, setChave] = useState('');
  const [modelos, setModelos] = useState<ModeloIa[] | null>(null);
  const [busy, setBusy] = useState<'' | 'salvar' | 'testar' | 'modelos'>('');
  const [res, setRes] = useState<{ ok: boolean; mensagem: string } | null>(null);
  const [precoAberto, setPrecoAberto] = useState(inicial.precoEntrada != null || inicial.precoSaida != null);
  // o formulário volta ao guardado só quando o guardado muda (salvou), não quando o uso do mês muda
  const guardado = JSON.stringify([inicial.ativo, inicial.provedor, inicial.modelo, inicial.modeloNome, inicial.endereco, inicial.precoEntrada, inicial.precoSaida]);
  useEffect(() => { setF(formDe(inicial)); }, [guardado]); // eslint-disable-line react-hooks/exhaustive-deps

  const info = INFO_PROVEDORES[f.provedor];
  const host = f.provedor === 'compativel' ? hostDoEndereco(f.endereco) : '';
  // a chave guardada só serve para o provedor dela (e, no compatível, para o serviço dela)
  const chaveGuardadaServe = inicial.temChave && inicial.chaveDe === f.provedor && (f.provedor !== 'compativel' || (!!inicial.chaveEndereco && inicial.chaveEndereco === host));
  const deQuem = inicial.chaveDe === 'compativel' && inicial.chaveEndereco ? `de ${inicial.chaveEndereco}` : inicial.chaveDe ? INFO_PROVEDORES[inicial.chaveDe].de : '';
  const ligado = inicial.ativo && inicial.temChave && inicial.chaveDe === inicial.provedor
    && (inicial.provedor !== 'compativel' || inicial.chaveEndereco === hostDoEndereco(inicial.endereco));

  const rodar = async (qual: typeof busy, fn: () => Promise<{ ok: boolean; mensagem: string } | void>, recarregar = true) => {
    setBusy(qual); setRes(null);
    try { const r = await fn(); if (r) setRes(r); if (recarregar) await qc.invalidateQueries({ queryKey: ['base', 'ia'] }); }
    catch (e) { setRes({ ok: false, mensagem: mensagemErro(e) }); }
    finally { setBusy(''); }
  };

  /**
   * Trocar de provedor: o modelo (e o preço) do outro não serve, e a chave digitada era do outro
   * (some, para não ir para o provedor errado); voltar ao guardado traz o que estava.
   */
  const trocarProvedor = (p: ProvedorIa) => {
    const voltou = p === inicial.provedor;
    setF({
      ...f, provedor: p,
      modelo: voltou ? inicial.modelo : '', modeloNome: voltou ? inicial.modeloNome : null,
      precoEntrada: voltou ? mostrarPreco(inicial.precoEntrada) : '', precoSaida: voltou ? mostrarPreco(inicial.precoSaida) : '',
      endereco: p === 'compativel' ? f.endereco || inicial.endereco || '' : f.endereco,
    });
    setChave(''); setModelos(null); setRes(null);
  };
  /** Outro endereço no compatível: a lista era do outro serviço, e a chave digitada também (some). */
  const trocarEndereco = (e: string) => {
    if (hostDoEndereco(e) !== host) setChave('');
    setF({ ...f, endereco: e }); setModelos(null);
  };

  const salvar = () => rodar('salvar', async () => {
    const precoEntrada = lerPreco(f.precoEntrada); const precoSaida = lerPreco(f.precoSaida);
    // as mesmas conferências do servidor, ditas aqui sem o nome do campo
    if (f.ativo && !f.modelo.trim()) return { ok: false, mensagem: 'Para ligar a IA, escolha o modelo (ou escreva o nome dele).' };
    if (f.provedor === 'compativel' && (f.ativo || f.endereco.trim()) && !enderecoValido(f.endereco)) {
      return { ok: false, mensagem: 'O endereço da API começa com https:// e é de um serviço da internet — por exemplo, https://openrouter.ai/api/v1.' };
    }
    if (Number.isNaN(precoEntrada) || Number.isNaN(precoSaida)) return { ok: false, mensagem: 'O preço é um número (ex.: 0,25). Deixe em branco se não quiser ver o custo.' };
    await api.base.salvarIaAjustes({
      ativo: f.ativo, provedor: f.provedor, modelo: f.modelo.trim(), modeloNome: f.modeloNome, endereco: f.provedor === 'compativel' ? f.endereco.trim() || null : null,
      precoEntrada, precoSaida, chave: chave.trim() || undefined,
    });
    setChave('');
    toast.push('ok', 'Ajustes da IA salvos');
  });

  const buscarModelos = () => rodar('modelos', async () => {
    if (f.provedor === 'compativel' && !enderecoValido(f.endereco)) {
      return { ok: false, mensagem: 'O endereço da API começa com https:// e é de um serviço da internet — por exemplo, https://openrouter.ai/api/v1.' };
    }
    const r = await api.base.iaModelos({ provedor: f.provedor, endereco: f.provedor === 'compativel' ? f.endereco.trim() : null, chave: chave.trim() || undefined });
    setModelos(r.modelos);
    const exemplo = IS_DEMO ? ' (na prévia, a lista é de exemplo; no sistema, ela vem da API do provedor, com a sua chave)' : '';
    return r.modelos.length
      ? { ok: true, mensagem: `${r.modelos.length} ${r.modelos.length === 1 ? 'modelo encontrado' : 'modelos encontrados'}${exemplo}. Escolha na lista e clique em Salvar.` }
      : { ok: false, mensagem: 'A lista veio sem nenhum modelo de conversa. Escreva o nome do modelo (está na página do provedor).' };
  }, false);

  const u = inicial.uso;
  const mes = u.mes ? MESES[Number(u.mes.slice(5, 7)) - 1] ?? u.mes : 'este mês';
  const nf = (n: number) => n.toLocaleString('pt-BR');
  const dolar = (v: number) => `US$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const naLista = modelos?.some((m) => m.id === f.modelo);

  return (
    <Cartao icone={<Bot size={18} />} titulo="IA da base de conhecimento" ligado={ligado}>
      <Explicacao>
        <p>
          Liga dois botões na <b>Base de conhecimento</b>: o <b>Perguntar à IA</b> (a IA responde só com os artigos
          publicados e diz de qual artigo tirou cada parte) e o <b>Escrever o rascunho com a IA</b> (ela lê o card do
          chamado e escreve o rascunho do artigo; a pessoa revisa antes de publicar).
        </p>
        <p>
          Escolha o provedor: <b>Anthropic</b> (Claude), <b>OpenAI</b> (ChatGPT), <b>Google</b> (Gemini) ou outro
          serviço <b>compatível</b> com a OpenAI (OpenRouter, DeepSeek, Groq, Mistral, Maritaca…). Dá para trocar quando
          quiser — a busca nos artigos é sempre a do Gestor.
        </p>
        <p>
          Para responder, o texto dos artigos que a busca achar <b>sai do servidor e vai para o provedor escolhido</b>,
          com os nomes do que está ligado a eles (cliente, modelo, assunto…). No rascunho, vai também o texto do card.
          Rascunho de artigo nunca vai. Por isso senha nunca vai em artigo: a base não é cofre.
        </p>
        <p>
          A chave fica cifrada no cofre, não aparece de volta na tela e só vai para o provedor dela (no compatível, só para
          o serviço dela: mudou o endereço, cole a chave do novo). Quem paga é a conta da empresa no provedor; cada pessoa
          pode usar até 30 vezes por hora, e o uso do mês aparece aqui embaixo.
        </p>
      </Explicacao>

      <div className="flex flex-col gap-3">
        <label className="flex items-center gap-2.5 text-sm cursor-pointer">
          <Toggle checked={f.ativo} onChange={(v) => setF({ ...f, ativo: v })} /> Ligar a IA na base de conhecimento
        </label>

        <Campo label="Provedor" dica={f.provedor === 'compativel' ? 'qualquer serviço que aceite o formato da OpenAI: basta o endereço da API' : `a chave se cria em ${info.ondeCriar}`}>
          <select className="input" id="ia-provedor" value={f.provedor} onChange={(e) => trocarProvedor(e.target.value as ProvedorIa)}>
            {PROVEDORES_IA.map((p) => <option key={p} value={p}>{INFO_PROVEDORES[p].nome}</option>)}
          </select>
        </Campo>

        {f.provedor === 'compativel' && (
          <Campo label="Endereço da API" dica="o endereço que o serviço dá para usar no lugar da OpenAI (às vezes chamado de base URL); começa com https://">
            <input className="input font-mono text-[13px]" id="ia-endereco" placeholder="https://openrouter.ai/api/v1" value={f.endereco}
              onChange={(e) => trocarEndereco(e.target.value)} />
            <div className="flex flex-wrap gap-1.5 mt-2" aria-label="Endereços conhecidos">
              {ENDERECOS_COMPATIVEIS.map((x) => (
                <button key={x.endereco} type="button" title={`${x.endereco}${x.dica ? ` — ${x.dica}` : ''}`}
                  className={`px-2 py-0.5 rounded-md border text-[12px] ${f.endereco.replace(/\/+$/, '') === x.endereco ? 'border-accent bg-accent-soft text-accent-ink font-semibold' : 'border-line text-muted hover:bg-surface-2'}`}
                  onClick={() => trocarEndereco(x.endereco)}>
                  {x.nome}
                </button>
              ))}
            </div>
          </Campo>
        )}

        <Campo
          label={f.provedor === 'compativel' && host ? `Chave da API de ${host}` : `Chave da API ${info.de}`}
          dica={chaveGuardadaServe
            ? 'já existe uma guardada; preencha só para trocar'
            : inicial.temChave && deQuem
              ? `a chave guardada é ${deQuem}: cole aqui a ${f.provedor === 'compativel' ? `de ${host || 'este serviço'}` : info.de} para usar ${f.provedor === 'compativel' ? 'este endereço' : 'este provedor'}`
              : `${info.chave} — fica cifrada no cofre`}>
          <input className="input font-mono text-[13px]" id="ia-chave" type="password" autoComplete="off" placeholder={chaveGuardadaServe ? '••••••••  (guardada)' : exemploDaChave(f.provedor)} value={chave} onChange={(e) => setChave(e.target.value)} />
        </Campo>

        <Campo label="Modelo" dica={`"Buscar modelos" mostra os que a chave pode usar; ou escreva o nome, como ${info.exemploModelo}`}>
          <div className="flex gap-2 flex-wrap">
            <input className="input font-mono text-[13px] flex-1 min-w-[200px]" id="ia-modelo" autoComplete="off" placeholder={info.exemploModelo} value={f.modelo}
              onChange={(e) => setF({ ...f, modelo: e.target.value, modeloNome: null })} />
            <button className="btn-secondary" id="ia-buscar-modelos" disabled={!!busy || !(chave.trim() || chaveGuardadaServe) || (f.provedor === 'compativel' && !f.endereco.trim())} onClick={buscarModelos}
              title={chave.trim() || chaveGuardadaServe ? 'Pergunta ao provedor quais modelos a chave pode usar' : 'Cole a chave primeiro'}>
              {busy === 'modelos' ? <Spinner /> : 'Buscar modelos'}
            </button>
          </div>
          {modelos && modelos.length > 0 && (
            <select className="input mt-2" id="ia-modelos" value={naLista ? f.modelo : ''}
              onChange={(e) => { const m = modelos.find((x) => x.id === e.target.value); if (m) setF({ ...f, modelo: m.id, modeloNome: m.nome !== m.id ? m.nome : null }); }}>
              <option value="">— escolha da lista ({modelos.length}) —</option>
              {modelos.map((m) => <option key={m.id} value={m.id}>{m.nome !== m.id ? `${m.nome} (${m.id})` : m.id}</option>)}
            </select>
          )}
        </Campo>

        <details className="text-sm" open={precoAberto} onToggle={(e) => setPrecoAberto((e.target as HTMLDetailsElement).open)}>
          <summary className="cursor-pointer text-muted">Preço do modelo (opcional, para ver quanto custou)</summary>
          <div className="grid gap-3 sm:grid-cols-2 mt-3">
            <Campo label="US$ por milhão de tokens lidos"><input className="input tnum" id="ia-preco-entrada" inputMode="decimal" placeholder="ex.: 0,25" value={f.precoEntrada} onChange={(e) => setF({ ...f, precoEntrada: e.target.value })} /></Campo>
            <Campo label="US$ por milhão de tokens escritos"><input className="input tnum" id="ia-preco-saida" inputMode="decimal" placeholder="ex.: 2" value={f.precoSaida} onChange={(e) => setF({ ...f, precoSaida: e.target.value })} /></Campo>
          </div>
          <p className="text-[12px] text-muted mt-1.5">Está na página de preços do provedor. Um token é mais ou menos 3/4 de uma palavra. Sem o preço, a tela mostra só os tokens: o Gestor não chuta preço.</p>
        </details>

        <div className="flex gap-2 flex-wrap">
          <button className="btn-primary" disabled={!!busy} onClick={salvar}>{busy === 'salvar' ? <Spinner className="text-white" /> : 'Salvar'}</button>
          <button className="btn-secondary" disabled={!!busy || !inicial.temChave} onClick={() => rodar('testar', () => api.base.testarIa())}>{busy === 'testar' ? <Spinner /> : 'Testar agora'}</button>
        </div>
        <p className="text-[12px] text-muted -mt-1">O teste manda uma pergunta de uma palavra com o provedor, o modelo e a chave guardados (custa uma fração de centavo). Salve antes.</p>
      </div>

      <Resultado r={res} />
      <Ultimo rotulo="Último teste" em={inicial.ultimoTesteEm} ok={inicial.ultimoTesteOk} msg={inicial.ultimoTesteMsg} />
      <p className="text-[12.5px] text-muted mt-1" id="ia-uso">
        Em {mes}: <b className="text-ink-2 tnum">{nf(u.perguntas)}</b> {u.perguntas === 1 ? 'pergunta' : 'perguntas'} e{' '}
        <b className="text-ink-2 tnum">{nf(u.rascunhos)}</b> {u.rascunhos === 1 ? 'rascunho' : 'rascunhos'}
        {u.entrada + u.saida > 0 && <> — <span className="tnum">{nf(u.entrada)}</span> tokens lidos e <span className="tnum">{nf(u.saida)}</span> escritos</>}
        {u.custo != null
          ? <>; uns <b className="text-ink-2 tnum">{dolar(u.custo)}</b> pelo preço informado.</>
          : u.entrada + u.saida > 0 ? <>. Para ver quanto custou, informe o preço do modelo.</> : '.'}
      </p>
    </Cartao>
  );
}
