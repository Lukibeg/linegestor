# Ingline Gestão

Cadastro central da Ingline Systems: **clientes e produtos assinados**, **servidores e acessos**, **numeração (circuitos e DIDs)** e **equipamentos**. Substitui o Nexus.

> Este arquivo é a porta de entrada. Ele explica **o que é cada pasta** em português, para quem não programa.
> A explicação visual do sistema está em `docs/arquitetura.html` (abra no navegador).

## Como o projeto está organizado

```
gestor/
├── LEIA-ME.md               ← você está aqui
├── docs/                    ← documentação em português
│   ├── arquitetura.html     ← o desenho do sistema (telas, banco, papéis, senhas, tecnologias)
│   ├── banco-de-dados.md    ← cada tabela e cada coluna explicada (gerado do próprio banco)
│   ├── decisoes/            ← uma página por decisão importante e o porquê
│   ├── glossario.md         ← DID, circuito, canal, granel, comodato… o que cada termo significa aqui
│   └── guia-de-uso/         ← como fazer cada tarefa (para a equipe)
├── apps/
│   ├── web/                 ← a interface (o que a equipe vê)        → apps/web/LEIA-ME.md
│   └── api/                 ← o servidor (as regras e o acesso ao banco) → apps/api/LEIA-ME.md
└── packages/
    ├── shared/              ← o que tela e servidor compartilham (formatos, permissões) → packages/shared/LEIA-ME.md
    └── db/                  ← a definição do banco de dados e as migrações → packages/db/LEIA-ME.md
```

Cada pasta de código tem um `LEIA-ME.md` próprio dizendo o que há dentro.

## Tecnologias, em uma frase cada

| Peça | O que é |
|---|---|
| **TypeScript** | JavaScript com verificação de tipos: pega erro antes de rodar. Usado em tudo. |
| **React + Vite + Tailwind** | Monta as telas; Vite empacota; Tailwind dá o visual. |
| **Node.js + Fastify** | O servidor que recebe os pedidos das telas e aplica as regras. |
| **Zod** | Confere cada dado que entra (formato, obrigatoriedade). As mesmas regras valem na tela e no servidor. |
| **PostgreSQL + Drizzle** | O banco de dados relacional e a ferramenta que traduz tabelas em código e versiona cada mudança. |
| **Vitest** | Os testes automáticos: rodam contra um banco de verdade a cada mudança. |
| **OpenAPI (página /api/docs)** | A lista viva de toda operação do servidor, gerada a partir do código. |

## Como rodar no seu computador (para um desenvolvedor)

Pré-requisitos: Node 22+, pnpm 10+, PostgreSQL 16.

```bash
cp .env.example .env          # preencha DATABASE_URL, SECRETS_MASTER_KEY e SESSION_SECRET
pnpm install
pnpm db:migrate               # cria as tabelas
pnpm db:seed                  # catálogos, papéis, organizações internas e o primeiro administrador
pnpm dev                      # sobe a API em :3333 e a interface em :5173
```

Primeiro acesso: `admin@gestor.local` com a senha definida em `SEED_ADMIN_PASSWORD` (ou a padrão impressa pelo seed — troque no primeiro login).

Outros comandos:

```bash
pnpm test                     # todos os testes (precisa de um banco gestor_test)
pnpm typecheck                # verificação de tipos em tudo
pnpm db:docs                  # regenera docs/banco-de-dados.md
pnpm --filter @gestor/db seed:demo   # carrega dados fictícios para experimentar
pnpm --filter @gestor/web build:demo # gera a prévia sem servidor (apps/web/dist-demo)
```

## Como o sistema chega ao ar

Ver `docs/publicacao.md`: um arquivo de configuração para plataforma gerenciada (Railway/Render), `Dockerfile` e `docker-compose.yml` para servidor próprio, e a rotina automática do GitHub (`.github/workflows/ci.yml`) que roda os testes a cada mudança.

## Segurança — o essencial

- Senhas dos clientes (SSH, tronco, Omniboard…) ficam **cifradas** na tabela `secrets`, com a chave-mestra em `SECRETS_MASTER_KEY`, fora do banco. **Guarde essa chave em lugar seguro: sem ela, as senhas guardadas são irrecuperáveis.**
- Revelar uma senha exige permissão, confirmar a própria senha, e fica na auditoria.
- Nada é apagado de verdade: excluir manda para a lixeira; restaurar traz de volta.
- Toda alteração relevante fica em `audit_log` com quem, quando, antes e depois.

## Decisões registradas

`docs/decisoes/` — uma página curta por decisão. Comece por `0001-visao-geral.md`.
