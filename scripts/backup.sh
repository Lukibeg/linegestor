#!/usr/bin/env bash
# Cópia de segurança do banco. Rodar no servidor, dentro da pasta do projeto:
#
#   ./scripts/backup.sh
#
# Guarda em backups/ um arquivo comprimido por dia. Mantém 14 diários e 8 semanais
# (os de domingo). Em seguida pede ao próprio sistema que mande uma cópia para o Google
# Drive — backup que só existe no mesmo servidor não protege de nada.
#
# Para onde vai, com qual conta e em qual pasta é coisa que se preenche na TELA
# (Administração › Ajustes), não aqui. Este script não sabe de senha nenhuma.
set -euo pipefail
cd "$(dirname "$0")/.."
[[ -f .env ]] && set -a && . ./.env && set +a

DESTINO="${BACKUP_DIR:-./backups}"
mkdir -p "$DESTINO"
ARQ="$DESTINO/gestao-$(date +%Y-%m-%d-%H%M).sql.gz"

docker compose -f docker-compose.prod.yml exec -T db pg_dump -U postgres --clean --if-exists gestao | gzip -9 > "$ARQ"
chmod 600 "$ARQ"
# 1000 = usuário "node" dentro do contêiner, que precisa ler o arquivo para mandá-lo ao Drive
chown 1000:1000 "$ARQ" 2>/dev/null || true
echo "Backup: $ARQ ($(du -h "$ARQ" | cut -f1))"

# guarda os de domingo como semanais, apaga o resto do que é antigo
[[ "$(date +%u)" == "7" ]] && cp "$ARQ" "${ARQ%.sql.gz}-semanal.sql.gz"
find "$DESTINO" -name 'gestao-*.sql.gz' ! -name '*-semanal.sql.gz' -mtime +14 -delete
find "$DESTINO" -name 'gestao-*-semanal.sql.gz' -mtime +56 -delete

# manda para o Google Drive (o sistema lê os ajustes da tela e guarda o resultado lá também)
docker compose -f docker-compose.prod.yml exec -T app pnpm enviar-backup "/backups/$(basename "$ARQ")" || \
  ./scripts/avisar.sh "o backup local foi feito, mas o envio para o Google Drive não rodou" || true
