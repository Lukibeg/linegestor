/**
 * As telas da equipe (o Gestor): o login da equipe e tudo o que fica atrás dele.
 * Carregadas à parte (lazy, em App.tsx): quem abre o portal do cliente não baixa estas telas.
 */
import { memo, useMemo, useRef } from 'react';
import { Navigate, Route, Routes, UNSAFE_LocationContext as LocationContext, useLocation, useNavigationType, type Location } from 'react-router-dom';
import { AuthProvider, useAuth } from './lib/auth.js';
import { Carregando } from './components/ui/index.js';
import { AppShell } from './components/layout/AppShell.js';
import { Entrar } from './pages/Entrar.js';
import { Painel } from './pages/Painel.js';
import { ClientesLista } from './pages/clientes/Lista.js';
import { ClienteFicha } from './pages/clientes/Ficha.js';
import { CircuitosLista } from './pages/circuitos/Lista.js';
import { CircuitoDetalhe } from './pages/circuitos/Detalhe.js';
import { DidsRedirect } from './pages/dids/Lista.js';
import { Inventario } from './pages/inventario/Index.js';
import { AparelhoDetalhe } from './pages/inventario/Aparelho.js';
import { NovidadesPagina } from './pages/novidades/Index.js';
import { ProjetosLista } from './pages/projetos/Lista.js';
import { ProjetoFicha } from './pages/projetos/Ficha.js';
import { Chamados } from './pages/chamados/Index.js';
import { RelatoriosChamados } from './pages/chamados/Relatorios.js';
import { EnvioDiario } from './pages/chamados/EnvioDiario.js';
import { BaseLista } from './pages/base/Lista.js';
import { ArtigoPagina } from './pages/base/Artigo.js';
import { ArtigoEditor } from './pages/base/Editar.js';
import { Conta } from './pages/Conta.js';
import { Admin } from './pages/admin/Index.js';
import { PortalDaEquipe } from './pages/portal/Index.js';
import { MeuDia } from './pages/atendimento/MeuDia.js';
import { PaineisDeChamados } from './pages/atendimento/Inicio.js';
import { Quadro } from './pages/atendimento/Quadro.js';
import { ListaDeChamados } from './pages/atendimento/Lista.js';
import { RelatorioDoPainel } from './pages/atendimento/Relatorio.js';
import { IrParaOComercial } from './pages/atendimento/Comercial.js';
import { SimuladorLista } from './pages/comercial/simulador/Lista.js';
import { SimulacaoDoComercial } from './pages/comercial/simulador/Simulacao.js';
import { AjustesDoSimuladorTela } from './pages/comercial/simulador/Ajustes.js';
import { IrParaAImplantacao, IrParaOSuporte } from './pages/atendimento/Suporte.js';
import { JanelaAbrirChamado, NovoChamado } from './pages/atendimento/Novo.js';
import { ChamadoEmJanela, FichaDoChamado } from './pages/atendimento/Ficha.js';
import { fundoDaJanela } from './pages/atendimento/comum.js';
import { AjustesAtendimento } from './pages/atendimento/Ajustes.js';
import { TutorialEditor } from './pages/portal/Editor.js';
import { Calendario } from './pages/calendario/Index.js';

function Protegido({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const loc = useLocation();
  if (loading) return <div className="h-screen flex items-center justify-center"><Carregando /></div>;
  if (!user) return <Navigate to="/entrar" state={{ from: loc.pathname }} replace />;
  return <AppShell>{children}</AppShell>;
}

export function Equipe() {
  return (
    <AuthProvider>
      <Rotas />
    </AuthProvider>
  );
}

/**
 * As rotas. O chamado aberto de dentro do sistema (o cartão do quadro, a linha da lista, o aviso do
 * sininho) vem com a tela de baixo no estado da navegação: ela continua desenhada como estava e a
 * ficha abre numa janela grande por cima (o pedido do Luan na prévia). O link direto do chamado
 * (/atendimento/SUP-12, sem a tela de baixo) abre a ficha em página inteira. O "Abrir chamado" do
 * alto das telas faz o mesmo: janela por cima; pelo link direto (a conversa do LineChat), página.
 */
function Rotas() {
  const location = useLocation();
  const tipo = useNavigationType();
  const fundo = fundoDaJanela(location);
  // A tela de baixo fica parada enquanto a janela abre e fecha (2.1.2, "ta demorando muito pra abrir os cards e os
  // paineis"): ela continua no mesmo endereço, e redesenhá-la inteira (o quadro com todos os cartões, o menu) a cada
  // abrir e fechar era a maior parte da demora. O endereço dela vem por um contexto que só muda quando a tela muda;
  // o que muda dentro dela (o quadro relido, um filtro) continua se desenhando sozinho.
  const tela = useMesmaTela(fundo ?? location);
  const valor = useMemo(() => ({ location: tela, navigationType: tipo }), [tela]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <>
      <LocationContext.Provider value={valor}>
        <TelaDeBaixo />
      </LocationContext.Provider>
      {fundo && (
        <Routes>
          {/* o Abrir chamado do alto das telas, numa janela por cima da tela (o pedido do Luan na prévia, em 14/10) */}
          <Route path="/atendimento/novo" element={<JanelaAbrirChamado />} />
          <Route path="/atendimento/:codigo" element={<ChamadoEmJanela />} />
        </Routes>
      )}
    </>
  );
}

/** O mesmo endereço (o mesmo passo do histórico, no mesmo caminho) devolve o mesmo objeto: a tela não se redesenha. */
function useMesmaTela(l: Location): Location {
  const ref = useRef(l);
  const a = ref.current;
  if (a !== l && !(a.key === l.key && a.pathname === l.pathname && a.search === l.search && a.hash === l.hash)) ref.current = l;
  return ref.current;
}

/** As telas (a de baixo, quando há uma janela por cima). Só se redesenha quando o endereço dela muda. */
const TelaDeBaixo = memo(function TelaDeBaixo() {
  return (
      <Routes>
        <Route path="/entrar" element={<Entrar />} />
        {/* a página que vira o PDF do envio diário: o robô entra com uma chave de uso único (1.7) */}
        <Route path="/envio-diario" element={<EnvioDiario />} />
        <Route path="/" element={<Protegido><Painel /></Protegido>} />
        <Route path="/clientes" element={<Protegido><ClientesLista /></Protegido>} />
        <Route path="/clientes/:id" element={<Protegido><ClienteFicha /></Protegido>} />
        <Route path="/circuitos" element={<Protegido><CircuitosLista /></Protegido>} />
        <Route path="/circuitos/:id" element={<Protegido><CircuitoDetalhe /></Protegido>} />
        {/* endereço antigo: a Numeração agora é uma aba de Circuitos */}
        <Route path="/dids" element={<DidsRedirect />} />
        <Route path="/inventario" element={<Protegido><Inventario /></Protegido>} />
        <Route path="/inventario/aparelhos/:id" element={<Protegido><AparelhoDetalhe /></Protegido>} />
        {/* o Importar / Exportar mora na Administração desde o 2.0: o endereço antigo leva para lá */}
        <Route path="/dados" element={<Navigate to="/admin/dados" replace />} />
        <Route path="/projetos" element={<Protegido><ProjetosLista /></Protegido>} />
        <Route path="/projetos/:id" element={<Protegido><ProjetoFicha /></Protegido>} />
        {/* os chamados do Gestor (2.0, decisão 0047): o Meu dia, o quadro, a lista, abrir, a ficha e os ajustes */}
        <Route path="/atendimento" element={<Protegido><PaineisDeChamados /></Protegido>} />
        <Route path="/atendimento/meu-dia" element={<Protegido><MeuDia /></Protegido>} />
        <Route path="/atendimento/quadro" element={<Protegido><Quadro /></Protegido>} />
        <Route path="/atendimento/lista" element={<Protegido><ListaDeChamados /></Protegido>} />
        <Route path="/atendimento/relatorio" element={<Protegido><RelatorioDoPainel /></Protegido>} />
        <Route path="/atendimento/novo" element={<Protegido><NovoChamado /></Protegido>} />
        <Route path="/atendimento/ajustes" element={<Protegido><AjustesAtendimento /></Protegido>} />
        <Route path="/atendimento/:codigo" element={<Protegido><FichaDoChamado /></Protegido>} />
        {/* o Suporte no menu (2.0.2): o atalho para o quadro do painel Suporte */}
        <Route path="/suporte" element={<Protegido><IrParaOSuporte /></Protegido>} />
        <Route path="/suporte/relatorios" element={<Protegido><IrParaOSuporte parte="relatorios" /></Protegido>} />
        <Route path="/suporte/implantacao" element={<Protegido><IrParaAImplantacao /></Protegido>} />
        {/* o Comercial no menu (2.0.1): o atalho para o quadro e o relatório do painel de Vendas */}
        <Route path="/comercial" element={<Protegido><IrParaOComercial parte="quadro" /></Protegido>} />
        <Route path="/comercial/relatorio" element={<Protegido><IrParaOComercial parte="relatorio" /></Protegido>} />
        {/* o Simulador do Comercial (2.0.2, decisão 0052): a conta de uma venda antes de fechar */}
        <Route path="/comercial/simulador" element={<Protegido><SimuladorLista /></Protegido>} />
        <Route path="/comercial/simulador/ajustes" element={<Protegido><AjustesDoSimuladorTela /></Protegido>} />
        <Route path="/comercial/simulador/:id" element={<Protegido><SimulacaoDoComercial /></Protegido>} />
        {/* o calendário das equipes (2.0.1, decisão 0049): quem vê um evento é quem vê um dos painéis dele */}
        <Route path="/calendario" element={<Protegido><Calendario /></Protegido>} />
        {/* a cópia do painel do LineChat (1.3): os números e os relatórios dos chamados de lá */}
        <Route path="/chamados" element={<Protegido><Chamados /></Protegido>} />
        <Route path="/chamados/relatorios" element={<Protegido><RelatoriosChamados /></Protegido>} />
        {/* a base de conhecimento: o que a equipe aprendeu, com passo a passo (1.8) */}
        <Route path="/base" element={<Protegido><BaseLista /></Protegido>} />
        <Route path="/base/novo" element={<Protegido><ArtigoEditor /></Protegido>} />
        <Route path="/base/:numero" element={<Protegido><ArtigoPagina /></Protegido>} />
        <Route path="/base/:numero/editar" element={<Protegido><ArtigoEditor /></Protegido>} />
        {/* o portal do cliente, do lado da equipe: os tutoriais, os acessos e os ajustes (1.8) */}
        <Route path="/portal-do-cliente" element={<Protegido><PortalDaEquipe /></Protegido>} />
        <Route path="/portal-do-cliente/novo" element={<Protegido><TutorialEditor /></Protegido>} />
        <Route path="/portal-do-cliente/:numero" element={<Protegido><TutorialEditor /></Protegido>} />
        <Route path="/novidades" element={<Protegido><NovidadesPagina /></Protegido>} />
        <Route path="/conta" element={<Protegido><Conta /></Protegido>} />
        <Route path="/admin/*" element={<Protegido><Admin /></Protegido>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
  );
});
