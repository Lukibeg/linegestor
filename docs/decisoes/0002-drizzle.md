# 0002 — Drizzle em vez de Prisma para falar com o banco

**Contexto.** O plano inicial era Prisma (schema legível, migrações). Na construção, o Prisma precisava baixar um binário de `binaries.prisma.sh`, bloqueado no ambiente. Drizzle faz o mesmo trabalho em TypeScript puro, sem binários, e é igualmente popular.

**Decisão.** Drizzle ORM + drizzle-kit. O schema fica em `packages/db/src/schema.ts` com um comentário em português por tabela e por coluna; um script gera `docs/banco-de-dados.md` a partir desses comentários.

**Consequência.** Migrações são arquivos SQL numerados em `packages/db/drizzle/`. Qualquer desenvolvedor lê o SQL diretamente.
