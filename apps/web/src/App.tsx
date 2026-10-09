/**
 * O mapa de rotas: qual endereço abre qual tela.
 * Na prévia publicada (demo) usamos endereços com "#" porque a página não tem servidor próprio.
 *
 * Dois mundos no mesmo endereço (1.8): /portal é o portal do cliente, com login próprio; o resto é
 * o Gestor da equipe. Cada um é carregado só quando é aberto — o celular do cliente baixa só o portal.
 */
import { lazy, Suspense } from 'react';
import { BrowserRouter, HashRouter, Route, Routes } from 'react-router-dom';
import { ToastProvider, Carregando } from './components/ui/index.js';
import { IS_DEMO } from './api/index.js';

const Equipe = lazy(() => import('./Equipe.js').then((m) => ({ default: m.Equipe })));
const PortalApp = lazy(() => import('./portal/App.js').then((m) => ({ default: m.PortalApp })));

export function App() {
  const Router = IS_DEMO ? HashRouter : BrowserRouter;
  return (
    <ToastProvider>
      <Router>
        <Suspense fallback={<div className="h-screen flex items-center justify-center"><Carregando /></div>}>
          <Routes>
            {/* o portal do cliente: login próprio, sem o menu da equipe (1.8) */}
            <Route path="/portal/*" element={<PortalApp />} />
            <Route path="*" element={<Equipe />} />
          </Routes>
        </Suspense>
      </Router>
    </ToastProvider>
  );
}
