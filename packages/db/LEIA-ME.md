# packages/db — o banco de dados

- `src/schema.ts` — **a definição de todas as tabelas**, com um comentário em português em cada tabela e cada coluna.
  É o lugar para entender "o que o sistema guarda". Está agrupado em: Clientes e produtos → Numeração → Inventário → Segurança e histórico.
- `drizzle/` — cada mudança na estrutura do banco vira um arquivo SQL numerado. Nunca se edita um antigo; cria-se um novo com `pnpm generate`.
- `src/seed.ts` — a **carga inicial**: catálogos (produtos, operadoras, hospedagens, categorias), os 4 papéis, as organizações internas e o primeiro administrador. Com `--demo` carrega também dados fictícios para testar a interface.
- `scripts/gerar-docs-banco.ts` — lê os comentários do `schema.ts` e gera `docs/banco-de-dados.md`. Rode `pnpm db:docs` depois de qualquer mudança.

Ferramenta usada: **Drizzle ORM** (100% TypeScript, sem binários). Ver `docs/decisoes/0002-drizzle.md`.

Comandos (a partir da raiz do projeto):
```
pnpm db:migrate     # aplica as migrações no banco apontado por DATABASE_URL
pnpm db:seed        # carga inicial (idempotente: pode rodar de novo sem duplicar)
pnpm db:docs        # regenera a documentação do banco
```
