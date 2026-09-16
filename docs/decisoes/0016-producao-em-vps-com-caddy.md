# 0016 — Produção num VPS próprio, com Caddy na frente; testes na máquina local

**Contexto.** Chegou a hora de pôr o Ingline Gestão no ar. As opções eram plataforma gerenciada
(Railway, Render) ou servidor próprio. Você escolheu servidor próprio — a Ingline já opera VPS — e
escolheu **não manter uma instância de homologação na nuvem**: testar na máquina local e ter uma
única instância paga, a de produção.

**Decisão.**
- **Uma instância na nuvem**: VPS Ubuntu, `https://gestao.inglinesystems.com.br`.
- **Três contêineres** (`docker-compose.prod.yml`): PostgreSQL, o sistema, e o **Caddy** como porta
  de entrada. Só o Caddy publica porta; o banco e a API só existem dentro da rede interna do Docker.
- **Caddy** em vez de Nginx porque resolve o certificado HTTPS e a renovação sozinho, em três linhas,
  e é onde ficam os cabeçalhos de segurança (HSTS, `nosniff`, `X-Frame-Options`, `Referrer-Policy`).
- **Homologação é a máquina local**: `docker compose up -d` com dados fictícios (`db:seed:demo`), ou
  `pnpm dev` direto. Para ensaiar uma mudança grande, restaura-se um backup de produção num banco
  local — nunca o contrário.
- **Quatro scripts** cobrem a operação, para ninguém precisar lembrar de comando:
  `preparar-servidor.sh` (firewall, SSH só por chave, fail2ban, atualizações automáticas, Docker,
  swap, usuário sem root), `publicar.sh` (backup → código novo → build → migrações → confere se
  respondeu), `backup.sh` (diário, 14 diários + 8 semanais, cópia remota opcional) e
  `restaurar.sh` (com confirmação digitada).
- `railway.json` e `render.yaml` saíram do repositório: caminho não escolhido, e arquivo de
  configuração que ninguém usa vira armadilha. Continuam no histórico do git se um dia voltarem.

**Consequência.** O custo mensal é o do VPS (US$ 6–12) em vez de US$ 13 fixos de plataforma
gerenciada, e o banco fica em disco nosso. Em troca, a atualização do sistema operacional e o backup
são responsabilidade nossa — por isso o preparo do servidor liga atualizações automáticas e o backup
diário entra no `cron` no mesmo dia em que o sistema sobe. O que não dá para automatizar e fica com
você: guardar a `SECRETS_MASTER_KEY` fora do servidor e testar a restauração uma vez por trimestre.
