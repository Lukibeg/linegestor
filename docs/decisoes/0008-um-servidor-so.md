# 0008 — Um servidor só: a API serve a interface e roda o TypeScript direto

**Contexto.** Tela (React) e servidor (Fastify) são pastas separadas. Se cada uma fosse publicada num endereço diferente, seriam dois serviços para pagar, configurar, proteger com HTTPS e manter alinhados (CORS, cookies).

**Decisão.**
- Toda operação do servidor vive sob `/api` (`/api/clients`, `/api/dids`, `/api/docs`…). Em produção, o mesmo servidor entrega a interface pronta (`apps/web/dist`) em qualquer outro endereço (`/`, `/clientes`, `/dids`). Um domínio, um serviço, um cookie.
- O servidor roda o código TypeScript diretamente com o `tsx` (o mesmo que aplica as migrações), em vez de gerar uma cópia compilada. Menos passos para dar errado; o custo de tradução acontece uma vez, ao subir.

**Consequência.** Publicar é um único contêiner (`Dockerfile`) ou um único serviço na plataforma. A verificação de tipos continua acontecendo no `pnpm typecheck` e na rotina do GitHub — só não gera arquivos.
