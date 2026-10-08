/**
 * Portal do cliente (Patch 1.8): entrar, e criar a senha pelo convite.
 *
 * Cada pessoa do cliente tem o próprio e-mail e a própria senha — quem cria a senha é ela, pelo link
 * do convite que a equipe manda no WhatsApp (ninguém da Ingline digita a senha de cliente). Esqueceu
 * a senha? O suporte manda um convite novo. Chegou por um link de tutorial sem estar logado? Depois
 * de entrar, cai direto no tutorial (`?volta=`).
 */
import { useState, type FormEvent, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { AlertTriangle, ArrowRight, KeyRound, LockKeyhole } from 'lucide-react';
import { api, IS_DEMO } from '../api/index.js';
import { ApiError } from '../api/types.js';
import { mensagemErro, Spinner } from '../components/ui/index.js';
import { Simbolo } from '../components/Marca.js';
import { BotaoSuporte, CampoSenha, ContatoDoSuporte, primeiroNome, RegrasDaSenha, regrasDaSenha, useEu, useSobre, useTituloDaAba } from './comum.js';

/** Para onde ir depois de entrar: só endereço do próprio portal (nunca um site de fora). */
export function destinoSeguro(volta: string | null): string {
  return volta && /^\/portal(\/|$|\?)/.test(volta) && !volta.startsWith('//') ? volta : '/portal';
}

/** A moldura das telas de fora (entrar, convite): o símbolo, o nome do portal e um cartão no meio. */
function TelaDeFora({ titulo, children, rodape }: { titulo: string; children: ReactNode; rodape?: ReactNode }) {
  return (
    <div className="min-h-full flex flex-col items-center justify-center px-4 py-8 bg-bg bg-[radial-gradient(ellipse_at_top,var(--accent-soft),transparent_60%)]">
      <div className="w-full max-w-[400px]">
        <div className="flex flex-col items-center text-center mb-6">
          <Simbolo tamanho={52} />
          <div className="font-display font-semibold text-[19px] mt-3">{titulo}</div>
        </div>
        {children}
        {rodape}
      </div>
    </div>
  );
}

export function Entrar() {
  const [sp] = useSearchParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const sobre = useSobre();
  const eu = useEu();
  const destino = destinoSeguro(sp.get('volta'));
  const suspenso = sp.get('suspenso') === '1';
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [esqueci, setEsqueci] = useState(false);
  const titulo = sobre.data?.titulo ?? 'Central de ajuda';
  useTituloDaAba('Entrar', titulo);

  const entrar = useMutation({
    mutationFn: () => api.portal.entrar(email.trim(), senha),
    onSuccess: (r) => {
      qc.removeQueries({ queryKey: ['portal'] });
      qc.setQueryData(['portal', 'eu'], r);
      navigate(destino, { replace: true });
    },
  });
  // a sessão que caiu continua com os dados antigos guardados: só volta se a conferência de agora passou
  if (eu.data && !eu.isError && !entrar.isPending) return <Navigate to={destino} replace />;

  const enviar = (e: FormEvent) => { e.preventDefault(); entrar.mutate(); };
  const erro = entrar.error;
  const mensagemEsqueci = `Olá! Esqueci a minha senha da ${titulo}.${email.trim() ? ` Meu e-mail é ${email.trim()}.` : ''}`;

  return (
    <TelaDeFora titulo={titulo} rodape={IS_DEMO && <DicaDaPrevia />}>
      {suspenso && !erro && (
        <div className="card border-bad bg-bad-soft p-3 mb-3 flex gap-2 text-[14px]" role="alert">
          <AlertTriangle size={17} className="text-bad shrink-0 mt-0.5" />
          <span>Seu acesso ao portal está suspenso. Fale com o suporte da Ingline.</span>
        </div>
      )}
      <form onSubmit={enviar} className="card p-5 sm:p-6 flex flex-col gap-4 shadow-sm">
        <div>
          <h1 className="font-display font-semibold text-[17px]">Entrar</h1>
          <p className="text-[13.5px] text-muted mt-0.5">Os passo a passo, vídeos e manuais dos produtos da sua empresa.</p>
        </div>
        <div>
          <label className="label" htmlFor="portal-email">E-mail</label>
          <input id="portal-email" className="input py-2.5 text-[15px]" type="email" inputMode="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
        </div>
        <CampoSenha id="portal-senha" rotulo="Senha" valor={senha} onChange={setSenha} autoComplete="current-password" />
        {erro && (
          <div className="text-bad text-[13.5px] flex gap-1.5" role="alert">
            <AlertTriangle size={15} className="shrink-0 mt-0.5" />
            <span>{erro instanceof ApiError && erro.status === 429 ? 'Muitas tentativas seguidas. Espere um minuto e tente de novo.' : mensagemErro(erro)}</span>
          </div>
        )}
        <button className="btn-primary w-full py-2.5 text-[15px]" disabled={entrar.isPending}>{entrar.isPending ? <Spinner className="text-white" /> : <>Entrar <ArrowRight size={16} /></>}</button>
        <button type="button" className="text-[13px] text-accent hover:underline self-center" onClick={() => setEsqueci((v) => !v)} aria-expanded={esqueci}>Esqueci a senha / não tenho acesso</button>
        {esqueci && (
          <div className="rounded-lg bg-surface-2 p-3 text-[13.5px] text-ink-2 flex flex-col gap-2">
            <p>O suporte manda um <b>link novo</b> para você criar a senha (a senha antiga continua valendo até você criar a nova). Para ganhar acesso, é o mesmo caminho.</p>
            <BotaoSuporte sobre={sobre.data} mensagem={mensagemEsqueci} className="btn-secondary btn-sm self-start">Pedir pelo WhatsApp</BotaoSuporte>
            <ContatoDoSuporte sobre={sobre.data} />
          </div>
        )}
      </form>
      {!esqueci && <ContatoDoSuporte sobre={sobre.data} className="text-center mt-4" />}
    </TelaDeFora>
  );
}

/** Na prévia: com quem entrar, e o que cada um mostra. */
function DicaDaPrevia() {
  const conta = (email: string, quem: string) => <li><span className="font-mono text-[12px] text-ink">{email}</span> — {quem}</li>;
  return (
    <div className="card mt-4 p-4 text-[12.5px] text-ink-2 border-signal">
      <div className="font-semibold text-signal mb-1">Prévia de demonstração</div>
      <p>Senha de todos: <span className="font-mono">demo</span>. Cada pessoa vê só os tutoriais dos produtos da empresa dela:</p>
      <ul className="mt-1.5 flex flex-col gap-1">
        {conta('maria@clinicaaurora.com.br', 'Clínica Aurora (LinePBX com FOP2)')}
        {conta('carlos@hvaleverde.org.br', 'Hospital Vale Verde (LinePBX, LineReports, FOP2 e Omniboard)')}
        {conta('pedro@centralfarma.com.br', 'cliente que saiu da base: o acesso cai sozinho')}
      </ul>
      <p className="mt-1.5">O convite (a pessoa cria a própria senha) sai da ficha do cliente, aba <b>Portal</b>, no <Link className="link" to="/clientes">Gestor</Link>.</p>
    </div>
  );
}

export function Convite() {
  const { codigo = '' } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const sobre = useSobre();
  const convite = useQuery({ queryKey: ['portal', 'convite', codigo], queryFn: () => api.portal.convite(codigo), retry: false, staleTime: Infinity });
  const [senha, setSenha] = useState('');
  const [confirmar, setConfirmar] = useState('');
  const titulo = sobre.data?.titulo ?? 'Central de ajuda';
  useTituloDaAba('Criar a senha', titulo);
  const criar = useMutation({
    mutationFn: () => api.portal.criarSenha(codigo, senha),
    onSuccess: () => { qc.removeQueries({ queryKey: ['portal'] }); navigate('/portal', { replace: true }); },
  });
  const regras = regrasDaSenha(senha, confirmar);
  const pronta = regras.every((r) => r.ok);

  if (convite.isLoading) return <TelaDeFora titulo={titulo}><div className="card p-6 flex justify-center"><Spinner /></div></TelaDeFora>;
  if (convite.isError || !convite.data) {
    const suspenso = convite.error instanceof ApiError && convite.error.status === 403;
    return (
      <TelaDeFora titulo={titulo}>
        <div className="card p-5 sm:p-6 flex flex-col gap-3 shadow-sm">
          <LockKeyhole size={26} className="text-muted" />
          <h1 className="font-display font-semibold text-[17px]">{suspenso ? 'Acesso suspenso' : 'Este link não vale mais'}</h1>
          <p className="text-[14px] text-ink-2">
            {suspenso
              ? 'Seu acesso ao portal está suspenso. Fale com o suporte da Ingline.'
              : 'O convite vale por 7 dias e só uma vez: ele venceu ou a senha já foi criada. Se já criou, é só entrar; se não, peça um link novo para o suporte.'}
          </p>
          <div className="flex flex-wrap gap-2 mt-1">
            {!suspenso && <Link to="/portal/entrar" className="btn-primary">Entrar</Link>}
            <BotaoSuporte sobre={sobre.data} mensagem={`Olá! O meu link da ${titulo} não está mais valendo. Pode mandar um novo?`} className="btn-secondary">Pedir um link novo</BotaoSuporte>
          </div>
        </div>
      </TelaDeFora>
    );
  }
  const c = convite.data;
  const enviar = (e: FormEvent) => { e.preventDefault(); if (pronta) criar.mutate(); };
  return (
    <TelaDeFora titulo={titulo}>
      <form onSubmit={enviar} className="card p-5 sm:p-6 flex flex-col gap-4 shadow-sm">
        <div>
          <h1 className="font-display font-semibold text-[18px]">Olá, {primeiroNome(c.nome)}!</h1>
          <p className="text-[14px] text-ink-2 mt-1">
            {c.trocando ? 'Crie a sua senha nova. A antiga deixa de valer assim que você salvar.' : <>Crie a sua senha para entrar na <b>{titulo}</b>. Depois é só entrar com o seu e-mail e esta senha.</>}
          </p>
        </div>
        <div className="rounded-lg bg-surface-2 px-3 py-2 text-[13.5px]">
          <div className="text-muted text-[12px]">Seu acesso</div>
          <div className="font-semibold break-all">{c.email}</div>
          <div className="text-ink-2">{c.cliente}</div>
        </div>
        {/* o e-mail escondido ajuda o gerenciador de senhas do celular a guardar a senha certa */}
        <input type="email" autoComplete="username" value={c.email} readOnly hidden />
        <CampoSenha id="portal-nova" rotulo={c.trocando ? 'Senha nova' : 'Crie a senha'} valor={senha} onChange={setSenha} autoComplete="new-password" autoFocus />
        <CampoSenha id="portal-confirmar" rotulo="Repita a senha" valor={confirmar} onChange={setConfirmar} autoComplete="new-password" />
        <RegrasDaSenha regras={regras} />
        {criar.error && <div className="text-bad text-[13.5px]" role="alert">{mensagemErro(criar.error)}</div>}
        <button className="btn-primary w-full py-2.5 text-[15px]" disabled={!pronta || criar.isPending}>{criar.isPending ? <Spinner className="text-white" /> : <><KeyRound size={16} /> {c.trocando ? 'Salvar a senha e entrar' : 'Criar a senha e entrar'}</>}</button>
      </form>
    </TelaDeFora>
  );
}
