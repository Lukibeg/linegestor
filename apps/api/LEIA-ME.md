# apps/api — o servidor (as regras do sistema)

Tudo o que a tela pede passa por aqui. O servidor confere quem está pedindo, se pode, aplica a regra, grava no banco e registra na auditoria.

Como está organizado:

- `src/server.ts` — liga o servidor. `src/app.ts` — monta tudo (usado também pelos testes).
- `src/config.ts` — lê as variáveis de ambiente (`.env`) e reclama se faltar alguma.
- `src/plugins/` — peças que valem para todas as rotas:
  - `auth.ts` — sessão por cookie, quem é o usuário, e a verificação de permissão (`requirePermission('dids.assign')`).
  - `audit.ts` — o registrador da auditoria: `request.audit({...})`.
  - `errors.ts` — traduz qualquer erro para uma resposta em português com o código HTTP certo.
  - `openapi.ts` — gera a página `/docs` com todas as operações do servidor.
- `src/services/` — as regras de negócio, uma pasta de assunto por arquivo (clientes, DIDs, inventário…). **É aqui que mora o "como o sistema funciona".** Não sabem nada de HTTP: recebem dados, devolvem dados.
- `src/routes/` — as portas de entrada (URLs). Só validam o pedido, chamam o serviço e devolvem a resposta.
- `test/` — testes automáticos que rodam contra um banco PostgreSQL de teste de verdade.

Página de documentação viva: com o servidor rodando, abra `http://localhost:3333/docs`.
