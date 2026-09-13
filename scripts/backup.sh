#!/usr/bin/env bash
# Cópia de segurança do banco. Rodar no servidor, dentro da pasta do projeto:
#
#   ./scripts/backup.sh
#
# Guarda em backups/ um arquivo comprimido por dia. Mantém 14 diários e 8 semanais
# (os de domingo). Se BACKUP_REMOTO estiver no .env, manda uma cópia para fora do
# servidor com rclone — backup que só existe no mesmo servidor não protege de nada.
set -euo pipefail
cd "$(dirname "$0")/.."
[[ -f .env ]] && set -a && . ./.env && set +a

DESTINO="${BACKUP_DIR:-./backups}"
mkdir -p "$DESTINO"
ARQ="$DESTINO/gestao-$(date +%Y-%m-%d-%H%M).sql.gz"

docker compose -f docker-compose.prod.yml exec -T db pg_dump -U postgres --clean --if-exists gestao | gzip -9 > "$ARQ"
chmod 600 "$ARQ"
echo "Backup: $ARQ ($(du -h "$ARQ" | cut -f1))"

# guarda os de domingo como semanais, apaga o resto do que é antigo
[[ "$(date +%u)" == "7" ]] && cp "$ARQ" "${ARQ%.sql.gz}-semanal.sql.gz"
find "$DESTINO" -name 'gestao-*.sql.gz' ! -name '*-semanal.sql.gz' -mtime +14 -delete
find "$DESTINO" -name 'gestao-*-semanal.sql.gz' -mtime +56 -delete

if [[ -n "${BACKUP_REMOTO:-}" ]]; then
  echo "Copiando para $BACKUP_REMOTO"
  rclone copy "$ARQ" "$BACKUP_REMOTO" --quiet
fi
