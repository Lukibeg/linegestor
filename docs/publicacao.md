# Como o sistema chega ao ar

Dois ambientes, idênticos: **homologação** (para testar) e **produção** (para valer). O caminho é sempre o mesmo:

```
Claude escreve → GitHub → testes rodam → homologação → você testa e aprova → produção
```

## O que precisa existir antes

| O quê | Quem cria | Para quê |
|---|---|---|
| Conta no **GitHub** e um repositório `gestor` | Você | Guardar o código com histórico; rodar os testes automáticos |
| Hospedagem (Railway **ou** Render **ou** VPS) | Você | Onde o sistema roda |
| Banco PostgreSQL | Vem com a hospedagem | Os dados |
| Subdomínio `gestor.inglinesystems.com.br` (e `teste.gestor.…`) | Você, no DNS | Endereço |

## Variáveis de ambiente (as "chaves" do sistema)

Definidas no painel da hospedagem, nunca no código:

| Variável | O que é |
|---|---|
| `DATABASE_URL` | Endereço do banco (a hospedagem fornece) |
| `SECRETS_MASTER_KEY` | Chave que cifra as senhas guardadas. Gere uma vez: `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`. **Guarde cópia fora do servidor.** |
| `SESSION_SECRET` | Assina o cookie de login. Qualquer texto longo aleatório. |
| `WEB_ORIGIN` | Endereço do site (ex.: `https://gestor.inglinesystems.com.br`) |
| `NODE_ENV` | `production` |
| `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` | Só na primeira carga: o primeiro administrador |

## Opção A — Plataforma gerenciada (recomendada)

**Railway:** conectar o repositório → ele lê `railway.json` e o `Dockerfile` → adicionar um PostgreSQL no projeto → preencher as variáveis → deploy. Rodar uma vez `pnpm db:seed` no console do serviço para criar o administrador.

**Render:** "New → Blueprint" apontando para o repositório → ele lê `render.yaml` (cria o serviço e o banco) → preencher `SECRETS_MASTER_KEY` e `WEB_ORIGIN` → deploy → rodar `pnpm db:seed` uma vez no shell do serviço.

Homologação = um segundo serviço apontando para a mesma origem, com banco próprio e `WEB_ORIGIN` de teste.

## Opção B — Servidor próprio (VPS)

```bash
git clone <repositório> gestor && cd gestor
cp .env.example .env         # DB_PASSWORD, SECRETS_MASTER_KEY, SESSION_SECRET, WEB_ORIGIN
docker compose up -d         # sobe banco + sistema em :3333
docker compose exec app pnpm --filter @gestor/db seed
```

Coloque um proxy com HTTPS na frente (Caddy resolve com 3 linhas). Backup: `docker compose exec db pg_dump -U postgres gestor > backup.sql` num cron diário, copiado para fora do servidor.

## Backup

Plataforma gerenciada: ativar o backup diário do banco no painel. VPS: `pg_dump` diário + cópia para outro lugar (S3, outro servidor). **Teste a restauração** uma vez por trimestre — backup que nunca foi restaurado não é backup.
