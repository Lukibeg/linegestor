/**
 * Portal do cliente (Patch 1.8): entrar.
 *
 * Cada pessoa do cliente entra com o login e a senha que o suporte criou (1.9, decisão 0045: o
 * login é o e-mail dela ou um nome, como "maria.souza"). Esqueceu a senha? O suporte vê ou troca.
 * Chegou por um link de tutorial sem estar logado? Depois de entrar, cai direto no tutorial
 * (`?volta=`). O link de convite do 1.8 saiu: quem abrir um antigo é mandado falar com o suporte.
 *
 * A equipe entra aqui com o e-mail e a senha do Gestor (1.9, decisão 0044); quem usa o código de 6
 * dígitos lá digita o código aqui também (a segunda etapa, como no Gestor).
 */
import { useState, type FormEvent, type ReactNode } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { AlertTriangle, ArrowRight, LockKeyhole } from 'lucide-react';
import { api, IS_DEMO } from '../api/index.js';
import { ApiError, type EuPortal } from '../api/types.js';
import { mensagemErro, Spinner } from '../components/ui/index.js';
import { Simbolo } from '../components/Marca.js';
import { BotaoSuporte, CampoSenha, ContatoDoSuporte, useEu, useSobre, useTituloDaAba } from './comum.js';

/** Para onde ir depois de entrar: só endereço do próprio portal (nunca um site de fora). */
export function destinoSeguro(volta: string | null): string {
  return volta && /^\/portal(\/|$|\?)/.test(volta) && !volta.startsWith('//') ? volta : '/portal';
}

/** A moldura das telas de fora (entrar, o convite antigo): o símbolo, o nome do portal e um cartão no meio. */
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
  const [login, setLogin] = useState('');
  const [senha, setSenha] = useState('');
  const [esqueci, setEsqueci] = useState(false);
  // a equipe que usa o código de 6 dígitos no Gestor: depois da senha, o código
  const [etapa, setEtapa] = useState<'senha' | 'codigo'>('senha');
  const [codigo, setCodigo] = useState('');
  const titulo = sobre.data?.titulo ?? 'Central de ajuda';
  useTituloDaAba('Entrar', titulo);

  const entrou = (r: EuPortal) => {
    qc.removeQueries({ queryKey: ['portal'] });
    qc.setQueryData(['portal', 'eu'], r);
    navigate(destino, { replace: true });
  };
  const entrar = useMutation({
    mutationFn: () => api.portal.entrar(login.trim(), senha),
    onSuccess: (r) => { if ('precisaCodigo' in r) { setCodigo(''); setEtapa('codigo'); } else entrou(r); },
  });
  const confirmar = useMutation({
    mutationFn: () => api.portal.entrarComCodigo(login.trim(), senha, codigo.trim()),
    onSuccess: entrou,
    onError: () => setCodigo(''),
  });
  // a sessão que caiu continua com os dados antigos guardados: só volta se a conferência de agora passou
  if (eu.data && !eu.isError && !entrar.isPending && !confirmar.isPending) return <Navigate to={destino} replace />;

  const enviar = (e: FormEvent) => { e.preventDefault(); entrar.mutate(); };
  const erro = entrar.error;
  const mensagemEsqueci = `Olá! Esqueci a minha senha da ${titulo}.${login.trim() ? ` Meu login é ${login.trim()}.` : ''}`;

  if (etapa === 'codigo') {
    const voltar = () => { setEtapa('senha'); setSenha(''); setCodigo(''); entrar.reset(); confirmar.reset(); };
    const erroDoCodigo = confirmar.error;
    return (
      <TelaDeFora titulo={titulo}>
        <form onSubmit={(e) => { e.preventDefault(); confirmar.mutate(); }} className="card p-5 sm:p-6 flex flex-col gap-4 shadow-sm">
          <div>
            <h1 className="font-display font-semibold text-[17px]">Código de verificação</h1>
            <p className="text-[13.5px] text-muted mt-0.5">Abra o aplicativo de autenticação no celular e digite os 6 dígitos da conta <b className="text-ink-2">Ingline Gestão</b> — o mesmo código de entrar no Gestor.</p>
          </div>
          <div>
            <label className="label" htmlFor="portal-codigo">Código</label>
            <input id="portal-codigo" className="input py-2.5 font-mono text-center text-lg tracking-[0.35em]" inputMode="numeric" autoComplete="one-time-code" placeholder="000000" maxLength={11}
              value={codigo} onChange={(e) => setCodigo(e.target.value)} required autoFocus />
            <p className="text-muted text-[12px] mt-1.5">Sem o celular à mão? Use um dos códigos de recuperação que você guardou.</p>
          </div>
          {erroDoCodigo && (
            <div className="text-bad text-[13.5px] flex gap-1.5" role="alert">
              <AlertTriangle size={15} className="shrink-0 mt-0.5" />
              <span>{erroDoCodigo instanceof ApiError && erroDoCodigo.status === 429 ? 'Muitas tentativas seguidas. Espere alguns minutos e tente de novo.' : mensagemErro(erroDoCodigo)}</span>
            </div>
          )}
          <button className="btn-primary w-full py-2.5 text-[15px]" disabled={confirmar.isPending || codigo.trim().length < 6}>{confirmar.isPending ? <Spinner className="text-white" /> : <>Confirmar <ArrowRight size={16} /></>}</button>
          <button type="button" className="btn-ghost btn-sm self-center" onClick={voltar}>Voltar</button>
        </form>
      </TelaDeFora>
    );
  }

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
          <label className="label" htmlFor="portal-login">Login</label>
          {/* o login pode ser o e-mail ou um nome ("maria.souza"): texto livre, sem a primeira letra maiúscula do celular */}
          <input id="portal-login" className="input py-2.5 text-[15px]" type="text" autoComplete="username" autoCapitalize="none" autoCorrect="off" spellCheck={false}
            value={login} onChange={(e) => setLogin(e.target.value)} required autoFocus />
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
            <p>Fale com o suporte: ele vê a sua senha ou cria uma nova para você. Para ganhar acesso, é o mesmo caminho — o suporte cria o seu login e a sua senha.</p>
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
      <p>Senha de todos: <span className="font-mono">demo</span>. Cada pessoa vê só os tutoriais dos produtos da empresa dela (o login pode ser o e-mail ou um nome):</p>
      <ul className="mt-1.5 flex flex-col gap-1">
        {conta('maria@clinicaaurora.com.br', 'Clínica Aurora (LinePBX com FOP2)')}
        {conta('recepcao.aurora', 'a recepção da Clínica Aurora — login sem e-mail')}
        {conta('carlos@hvaleverde.org.br', 'Hospital Vale Verde (LinePBX, LineReports, FOP2 e Omniboard)')}
        {conta('pedro@centralfarma.com.br', 'cliente que saiu da base: o acesso cai sozinho')}
      </ul>
      <p className="mt-1.5">A equipe entra com o <b>mesmo login do Gestor</b> (<span className="font-mono text-[12px] text-ink">admin@gestor.local</span>, <span className="font-mono text-[12px] text-ink">tecnico@gestor.local</span>…) e vê todos os tutoriais.</p>
      <p className="mt-1.5">O acesso (o login e a senha que o suporte cria) sai da ficha do cliente, aba <b>Portal</b>, no <Link className="link" to="/clientes">Gestor</Link>.</p>
    </div>
  );
}

/**
 * O link de convite do 1.8 (`/portal/convite/…`): saiu no 1.9, quando o suporte passou a criar o
 * login e a senha. Quem abrir um link antigo vê o caminho novo.
 */
export function ConviteAntigo() {
  const sobre = useSobre();
  const titulo = sobre.data?.titulo ?? 'Central de ajuda';
  useTituloDaAba('Acesso', titulo);
  return (
    <TelaDeFora titulo={titulo}>
      <div className="card p-5 sm:p-6 flex flex-col gap-3 shadow-sm">
        <LockKeyhole size={26} className="text-muted" />
        <h1 className="font-display font-semibold text-[17px]">Este link não é mais usado</h1>
        <p className="text-[14px] text-ink-2">Agora o suporte cria o seu login e a sua senha e manda para você. Se já recebeu, é só entrar; se não, peça ao suporte.</p>
        <div className="flex flex-wrap gap-2 mt-1">
          <Link to="/portal/entrar" className="btn-primary">Entrar</Link>
          <BotaoSuporte sobre={sobre.data} mensagem={`Olá! Preciso do meu login e da minha senha da ${titulo}.`} className="btn-secondary">Pedir ao suporte</BotaoSuporte>
        </div>
        <ContatoDoSuporte sobre={sobre.data} />
      </div>
    </TelaDeFora>
  );
}
