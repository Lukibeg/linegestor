/**
 * O mapa de rotas: qual endereço abre qual tela.
 * Na prévia publicada (demo) usamos endereços com "#" porque a página não tem servidor próprio.
 */
import { BrowserRouter, HashRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './lib/auth.js';
import { ToastProvider, Carregando } from './components/ui/index.js';
import { AppShell } from './components/layout/AppShell.js';
import { IS_DEMO } from './api/index.js';
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
import { Conta } from './pages/Conta.js';
import { Admin } from './pages/admin/Index.js';

function Protegido({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const loc = useLocation();
  if (loading) return <div className="h-screen flex items-center justify-center"><Carregando /></div>;
  if (!user) return <Navigate to="/entrar" state={{ from: loc.pathname }} replace />;
  return <AppShell>{children}</AppShell>;
}

export function App() {
  const Router = IS_DEMO ? HashRouter : BrowserRouter;
  return (
    <ToastProvider>
      <AuthProvider>
        <Router>
          <Routes>
            <Route path="/entrar" element={<Entrar />} />
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
            <Route path="/novidades" element={<Protegido><NovidadesPagina /></Protegido>} />
            <Route path="/conta" element={<Protegido><Conta /></Protegido>} />
            <Route path="/admin/*" element={<Protegido><Admin /></Protegido>} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Router>
      </AuthProvider>
    </ToastProvider>
  );
}
