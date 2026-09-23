/** Liga o servidor na porta configurada. */
import { buildApp } from './app.js';
import { iniciarSincronizacaoAutomatica } from './services/linechat.js';

const app = await buildApp();
try {
  await app.listen({ port: app.config.PORT, host: '0.0.0.0' });
  app.log.info(`Documentação em http://localhost:${app.config.PORT}/api/docs`);
  // os chamados do LineChat: a cada minuto, se estiver ligado em Ajustes (os testes não passam por aqui)
  iniciarSincronizacaoAutomatica(app);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
