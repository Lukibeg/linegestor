/** Liga o servidor na porta configurada. */
import { buildApp } from './app.js';
import { iniciarSincronizacaoAutomatica } from './services/linechat.js';
import { iniciarEnvioAutomatico } from './services/envio.js';
import { iniciarRelogioDosChamados } from './services/atendimento/relogio.js';

const app = await buildApp();
try {
  iniciarSincronizacaoAutomatica(app);
  // o envio automático do PDF pelo WhatsApp: confere o horário a cada minuto (1.7)
  iniciarEnvioAutomatico(app);
  // os chamados do Gestor (1.10): os agendados, os alertas de prazo, o sem responsável e o fechar sozinho, a cada minuto
  iniciarRelogioDosChamados(app);
  await app.listen({ port: app.config.PORT, host: '0.0.0.0' });
  app.log.info(`Documentação em http://localhost:${app.config.PORT}/api/docs`);
  // os chamados do LineChat: a cada minuto, se estiver ligado em Ajustes (os testes não passam por aqui)
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
