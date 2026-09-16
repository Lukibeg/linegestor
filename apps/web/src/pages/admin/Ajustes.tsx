/**
 * Administração › Ajustes: as duas integrações que o sistema usa para cuidar de si mesmo.
 *
 *  - **Backup no Google Drive**: para onde a cópia diária sobe.
 *  - **Avisos**: para onde o sistema grita quando cai ou quando o backup falha.
 *
 * Tudo se preenche aqui, não em arquivo no servidor. Cada cartão explica o que é, o que preencher
 * e tem um botão de testar que dá a resposta na hora — nada de salvar e torcer.
 */
import { useEffect, useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, CloudUpload, FileKey, MessageSquare, TriangleAlert, Upload } from 'lucide-react';
import { api } from '../../api/index.js';
import type { AjustesAvisos, AjustesBackup } from '../../api/types.js';
import { Campo, Carregando, Chip, Spinner, Toggle, mensagemErro, useToast } from '../../components/ui/index.js';
import { data } from '../../lib/format.js';

export function Ajustes() {
  const backup = useQuery({ queryKey: ['settings', 'backup'], queryFn: () => api.settings.backup() });
  const avisos = useQuery({ queryKey: ['settings', 'alerts'], queryFn: () => api.settings.alerts() });
  if (backup.isLoading || avisos.isLoading) return <Carregando />;
  return (
    <div className="flex flex-col gap-4 max-w-3xl">
      <CartaoBackup inicial={backup.data!} />
      <CartaoAvisos inicial={avisos.data!} />
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
