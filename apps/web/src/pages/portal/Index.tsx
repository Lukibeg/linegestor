/**
 * Portal do cliente — o lado da equipe (Patch 1.8, decisão 0040).
 *
 *  - Tutoriais: o passo a passo que os clientes veem (texto, prints, vídeos e arquivos), cada um de
 *    um produto (ou módulo) ou "Geral". Copiar o link ou mandar pelo WhatsApp sai daqui.
 *  - Acessos: quem da empresa de cada cliente pode entrar (o convite, o bloqueio).
 *  - Ajustes: o nome do portal, as boas-vindas, o contato do suporte e quanto espaço o portal ocupa.
 */
import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Copy, Eye, ExternalLink, HardDrive, MessageCircle, Pencil, Plus, Search, Star, X } from 'lucide-react';
import { linkWhatsApp, mensagemDoTutorial, PortalAjustesSchema, type PortalAjustes } from '@gestor/shared';
import { api, IS_DEMO } from '../../api/index.js';
import type { TutorialNaLista } from '../../api/types.js';
import { Pagina } from '../../components/layout/AppShell.js';
import { Abas, Campo, Carregando, Chip, mensagemErro, Paginacao, Spinner, Vazio, useToast } from '../../components/ui/index.js';
import { useAuth } from '../../lib/auth.js';
import { relativo } from '../../lib/format.js';
import { linkDoPortal, tamanhoDoArquivo } from '../../portal/Corpo.js';
import { EtiquetaProduto } from '../../portal/comum.js';
import { Trecho } from '../base/partes.js';
import { AcessosDoPortal } from './Acessos.js';

type Aba = 'tutoriais' | 'acessos' | 'ajustes';
const POR_PAGINA = 30;

export function PortalDaEquipe() {
  const [sp, setSp] = useSearchParams();
  const navigate = useNavigate();
  const { can } = useAuth();
  const aba = (['tutoriais', 'acessos', 'ajustes'].includes(sp.get('aba') ?? '') ? sp.get('aba') : 'tutoriais') as Aba;
  return (
    <Pagina
      titulo="Portal do cliente"
      sub="O passo a passo que os clientes veem, com vídeo, print e arquivo — e quem da empresa deles pode entrar."
      acoes={<>
        {/* na prévia o portal abre aqui mesmo (outra aba começaria a demonstração do zero) */}
        <a className="btn-secondary" href={IS_DEMO ? '#/portal' : '/portal'} target={IS_DEMO ? undefined : '_blank'} rel="noreferrer"><ExternalLink size={15} /> Abrir o portal</a>
        {can('portal.write') && <button className="btn-primary" onClick={() => navigate('/portal-do-cliente/novo')}><Plus size={15} /> Novo tutorial</button>}
      </>}
    >
      <Abas atual={aba} onChange={(a) => setSp(a === 'tutoriais' ? {} : { aba: a }, { replace: true })} abas={[
        { id: 'tutoriais', label: 'Tutoriais' }, { id: 'acessos', label: 'Acessos' }, { id: 'ajustes', label: 'Ajustes' },
      ]} />
      {aba === 'tutoriais' && <Tutoriais />}
      {aba === 'acessos' && <AcessosDoPortal />}
      {aba === 'ajustes' && <Ajustes />}
    </Pagina>
  );
}

// ---------- os tutoriais ----------

/** Copiar o link e mandar pelo WhatsApp (a mensagem já vai pronta; o contato, você escolhe). */
export function MandarTutorial({ t, pequeno = false }: { t: { titulo: string; caminho: string }; pequeno?: boolean }) {
  const toast = useToast();
  const link = linkDoPortal(t.caminho);
  const copiar = async () => { try { await navigator.clipboard.writeText(link); toast.push('ok', 'Link do tutorial copiado'); } catch { toast.push('erro', 'Não deu para copiar.'); } };
  const classe = pequeno ? 'btn-ghost btn-sm' : 'btn-secondary';
  return (
    <>
      <button type="button" className={classe} onClick={copiar} title={link}><Copy size={14} /> Copiar link</button>
      <a className={classe} href={linkWhatsApp(mensagemDoTutorial(t.titulo, link))} target="_blank" rel="noreferrer" title="Abre o WhatsApp com a mensagem pronta"><MessageCircle size={14} /> WhatsApp</a>
    </>
  );
}

function Tutoriais() {
  const [sp, setSp] = useSearchParams();
  const navigate = useNavigate();
  const { can } = useAuth();
  const q = sp.get('q') ?? '';
  const produto = sp.get('produto') ?? '';
  const situacao = sp.get('situacao') ?? 'todos';
  const page = Number(sp.get('p') ?? 1);
  const [texto, setTexto] = useState(q);
  const mudar = (o: Record<string, string | null>) => {
    const n = new URLSearchParams(sp);
    for (const [k, v] of Object.entries(o)) { if (!v) n.delete(k); else n.set(k, v); }
    if (!('p' in o)) n.delete('p');
    setSp(n, { replace: true });
  };
  useEffect(() => {
    if (texto === q) return;
    const t = setTimeout(() => mudar({ q: texto.trim() || null }), 250);
    return () => clearTimeout(t);
  }, [texto]); // eslint-disable-line react-hooks/exhaustive-deps

  const opcoes = useQuery({ queryKey: ['portal-admin', 'opcoes'], queryFn: () => api.portalAdmin.opcoes(), staleTime: 5 * 60_000 });
  const lista = useQuery({
    queryKey: ['portal-admin', 'tutoriais', q, produto, situacao, page],
    queryFn: () => api.portalAdmin.tutoriais({ q: q || undefined, produto: produto || undefined, situacao, page, pageSize: POR_PAGINA }),
    placeholderData: (a) => a,
  });
  const pode = can('portal.write');

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <label className="relative flex-1 min-w-[240px]">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input className="input pl-9" id="busca-portal" placeholder="Procurar tutorial (título, texto)" value={texto} onChange={(e) => setTexto(e.target.value)} autoComplete="off" />
          {texto && <button type="button" className="absolute right-2 top-1/2 -translate-y-1/2 btn-ghost btn-sm px-1.5 text-muted" onClick={() => setTexto('')} aria-label="Limpar a busca"><X size={14} /></button>}
        </label>
        <select className="input w-auto" aria-label="Produto" value={produto} onChange={(e) => mudar({ produto: e.target.value || null })}>
          <option value="">Todos os produtos</option>
          <option value="geral">Geral (todos os clientes)</option>
          {opcoes.data?.produtos.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
        </select>
        <div className="flex rounded-lg border border-line overflow-hidden" role="group" aria-label="Situação">
          {([['todos', 'Todos'], ['publicados', 'Publicados'], ['rascunhos', 'Rascunhos']] as const).map(([v, nome]) => (
            <button key={v} type="button" aria-pressed={situacao === v} onClick={() => mudar({ situacao: v === 'todos' ? null : v })}
              className={`px-3 py-1.5 text-[13px] ${situacao === v ? 'bg-accent-soft text-accent-ink font-semibold' : 'text-muted hover:bg-surface-2'}`}>{nome}</button>
          ))}
        </div>
      </div>

      {lista.isLoading ? <Carregando /> : lista.isError ? <p className="text-bad text-sm">{mensagemErro(lista.error)}</p> : !lista.data?.items.length ? (
        <Vazio
          titulo={q || produto || situacao !== 'todos' ? 'Nenhum tutorial com esse filtro' : 'Nenhum tutorial ainda'}
          texto={q || produto ? 'Tire o filtro ou procure com outras palavras.' : 'Comece pelas dúvidas que mais chegam no suporte: transferir ligação, usar o ramal no celular, ouvir a gravação.'}
          acao={pode ? <button className="btn-primary" onClick={() => navigate('/portal-do-cliente/novo')}><Plus size={15} /> Escrever um tutorial</button> : undefined}
        />
      ) : (
        <>
          <p className="text-[12.5px] text-muted tnum">{lista.data.total} {lista.data.total === 1 ? 'tutorial' : 'tutoriais'}</p>
          <ul className="flex flex-col gap-2.5">
            {lista.data.items.map((t) => <ItemTutorial key={t.id} t={t} pode={pode} />)}
          </ul>
          <Paginacao page={page} pageSize={POR_PAGINA} total={lista.data.total} onChange={(p) => mudar({ p: String(p) })} />
        </>
      )}
    </div>
  );
}

function ItemTutorial({ t, pode }: { t: TutorialNaLista; pode: boolean }) {
  return (
    <li className="card p-3.5 sm:p-4 flex flex-col gap-1.5 relative hover:border-accent transition-colors">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="font-mono text-[12px] text-muted">#{t.numero}</span>
        <EtiquetaProduto t={t} />
        {t.situacao === 'rascunho' ? <Chip tone="muted">rascunho · o cliente não vê</Chip> : <Chip tone="ok">publicado</Chip>}
        {t.destaque && <Chip tone="signal"><Star size={11} className="fill-current" /> destaque</Chip>}
      </div>
      <Link to={`/portal-do-cliente/${t.numero}`} className="font-display font-semibold text-[16px] hover:text-accent after:absolute after:inset-0">{t.titulo}</Link>
      {t.trecho?.length ? <Trecho pedacos={t.trecho} /> : t.resumo ? <p className="text-[13.5px] text-ink-2 line-clamp-2">{t.resumo}</p> : null}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <p className="text-[12px] text-muted mr-auto">
          <Eye size={12} className="inline -mt-0.5" aria-hidden /> {t.visualizacoes} {t.visualizacoes === 1 ? 'visualização' : 'visualizações'}
          {' · '}{t.atualizadoPor ?? t.autor ?? 'Alguém'} mexeu {relativo(t.atualizadoEm)}
        </p>
        {/* os botões ficam por cima do link do cartão */}
        <div className="relative z-10 flex flex-wrap gap-1">
          {t.situacao === 'publicado' && <MandarTutorial t={t} pequeno />}
          {pode && <Link className="btn-ghost btn-sm" to={`/portal-do-cliente/${t.numero}`}><Pencil size={14} /> Editar</Link>}
        </div>
      </div>
    </li>
  );
}

// ---------- os ajustes ----------

function Ajustes() {
  const { can } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const pode = can('admin.manage');
  const ajustes = useQuery({ queryKey: ['portal-admin', 'ajustes'], queryFn: () => api.portalAdmin.ajustes() });
  const espaco = useQuery({ queryKey: ['portal-admin', 'espaco'], queryFn: () => api.portalAdmin.espaco() });
  const [f, setF] = useState<PortalAjustes | null>(null);
  useEffect(() => { if (ajustes.data && !f) setF({ ...ajustes.data }); }, [ajustes.data, f]);
  const [erro, setErro] = useState('');
  const salvar = useMutation({
    mutationFn: (d: PortalAjustes) => api.portalAdmin.salvarAjustes(d),
    onSuccess: (r) => { qc.setQueryData(['portal-admin', 'ajustes'], r); void qc.invalidateQueries({ queryKey: ['portal'] }); setF({ ...r }); toast.push('ok', 'Ajustes do portal salvos'); },
    onError: (e) => setErro(mensagemErro(e)),
  });
  if (ajustes.isLoading || !f) return <Carregando />;
  const mudar = (o: Partial<PortalAjustes>) => setF((x) => ({ ...x!, ...o }));
  const enviar = () => {
    setErro('');
    const p = PortalAjustesSchema.safeParse({ ...f, boasVindas: f.boasVindas || null, whatsapp: f.whatsapp || null, email: f.email || null, horario: f.horario || null });
    if (!p.success) { setErro(p.error.issues[0]?.message ?? 'Confira os campos'); return; }
    salvar.mutate(p.data);
  };
  const enderecoDoPortal = linkDoPortal('/portal');
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px] items-start">
      <section className="card p-4 flex flex-col gap-3">
        <div>
          <h2 className="font-display font-semibold">O que o cliente vê</h2>
          <p className="text-[13px] text-muted">O nome aparece no topo do portal e na mensagem do convite; o contato vira o botão “Falar com o suporte”.</p>
        </div>
        <fieldset disabled={!pode} className="flex flex-col gap-3">
          <Campo label="Nome do portal"><input className="input" value={f.titulo} onChange={(e) => mudar({ titulo: e.target.value })} maxLength={80} /></Campo>
          <Campo label="Boas-vindas" dica="A frase da página inicial, embaixo do “Olá, Maria!”."><textarea className="input" rows={2} value={f.boasVindas ?? ''} onChange={(e) => mudar({ boasVindas: e.target.value })} maxLength={400} /></Campo>
          <div className="grid sm:grid-cols-2 gap-3">
            <Campo label="WhatsApp do suporte" dica="Com DDD. Vira o botão “Falar com o suporte” do portal."><input className="input" inputMode="tel" placeholder="(71) 99999-0000" value={f.whatsapp ?? ''} onChange={(e) => mudar({ whatsapp: e.target.value })} /></Campo>
            <Campo label="E-mail do suporte"><input className="input" type="email" value={f.email ?? ''} onChange={(e) => mudar({ email: e.target.value })} /></Campo>
          </div>
          <Campo label="Horário do suporte"><input className="input" placeholder="Segunda a sexta, das 8h às 18h" value={f.horario ?? ''} onChange={(e) => mudar({ horario: e.target.value })} maxLength={120} /></Campo>
        </fieldset>
        {erro && <p className="text-bad text-[13.5px]" role="alert">{erro}</p>}
        {pode
          ? <div><button className="btn-primary" onClick={enviar} disabled={salvar.isPending}>{salvar.isPending ? <Spinner className="text-white" /> : 'Salvar os ajustes'}</button></div>
          : <p className="text-[12.5px] text-muted">Só quem administra o sistema muda estes ajustes.</p>}
      </section>
      <div className="flex flex-col gap-4">
        <section className="card p-4 flex flex-col gap-2">
          <h2 className="font-display font-semibold">O endereço do portal</h2>
          <div className="rounded-lg border border-line bg-surface-2 px-3 py-2 font-mono text-[12.5px] break-all">{enderecoDoPortal}</div>
          <p className="text-[12.5px] text-muted">É o mesmo endereço do sistema, com <span className="font-mono">/portal</span>. Um endereço só do portal (como <span className="font-mono">ajuda.inglinesystems.com.br</span>) pode vir depois: é um ajuste no painel do domínio.</p>
        </section>
        <section className="card p-4 flex flex-col gap-2">
          <h2 className="font-display font-semibold flex items-center gap-2"><HardDrive size={16} className="text-muted" /> Espaço usado</h2>
          {espaco.data ? (
            <ul className="text-[13.5px] flex flex-col gap-1.5">
              <li><b>{espaco.data.videos}</b> {espaco.data.videos === 1 ? 'vídeo' : 'vídeos'} · {tamanhoDoArquivo(espaco.data.bytesVideos)} <span className="text-muted">no disco do servidor</span></li>
              <li><b>{espaco.data.arquivos}</b> {espaco.data.arquivos === 1 ? 'print ou arquivo' : 'prints e arquivos'} · {tamanhoDoArquivo(espaco.data.bytesArquivos)} <span className="text-muted">no banco</span></li>
            </ul>
          ) : <Carregando />}
          <p className="text-[12.5px] text-muted">Os prints e arquivos entram no backup diário. <b className="text-ink-2">Os vídeos não</b> (são grandes demais para o envio ao Drive): guarde o arquivo original de cada vídeo.</p>
        </section>
      </div>
    </div>
  );
}
