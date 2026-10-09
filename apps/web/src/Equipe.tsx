/**
 * As telas da equipe (o Gestor): o login da equipe e tudo o que fica atrás dele.
 * Carregadas à parte (lazy, em App.tsx): quem abre o portal do cliente não baixa estas telas.
 */
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
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
import { Dados } from './pages/dados/Index.js';
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
import { TutorialEditor } from './pages/portal/Editor.js';

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
        <Route path="/dados" element={<Protegido><Dados /></Protegido>} />
        <Route path="/projetos" element={<Protegido><ProjetosLista /></Protegido>} />
        <Route path="/projetos/:id" element={<Protegido><ProjetoFicha /></Protegido>} />
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
    </AuthProvider>
  );
}
