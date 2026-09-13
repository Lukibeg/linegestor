/** Liga o servidor na porta configurada. */
import { buildApp } from './app.js';

const app = await buildApp();
try {
  await app.listen({ port: app.config.PORT, host: '0.0.0.0' });
  app.log.info(`Documentação em http://localhost:${app.config.PORT}/docs`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
