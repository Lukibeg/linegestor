/**
 * Chamados do Gestor (Patch 1.10): Abrir um chamado: à mão, ou pelo botão "Abrir chamado" da conversa do LineChat (que manda o telefone, o nome e a sessão no endereço).
 */
import { CabecalhoAtendimento } from './comum.js';

export function NovoChamado() {
  return <div><CabecalhoAtendimento /><div className="card p-6 text-muted">Em construção.</div></div>;
}
