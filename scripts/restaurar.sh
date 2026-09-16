#!/usr/bin/env bash
# Volta o banco para um backup. APAGA os dados atuais e põe os do arquivo no lugar.
#
#   ./scripts/restaurar.sh backups/gestao-2026-09-13-0300.sql.gz
#
# Faça isso de olhos abertos: pare o sistema, restaure, suba de novo.
# Teste este caminho uma vez por trimestre — backup que nunca foi restaurado não é backup.
set -euo pipefail
cd "$(dirname "$0")/.."
ARQ="${1:?informe o arquivo de backup}"
[[ -f "$ARQ" ]] || { echo "Arquivo não encontrado: $ARQ"; exit 1; }
COMPOSE="docker compose -f docker-compose.prod.yml"

read -rp "Isto substitui TODOS os dados atuais por '$ARQ'. Digite RESTAURAR para seguir: " ok
[[ "$ok" == "RESTAURAR" ]] || { echo "Cancelado."; exit 1; }

echo "==> Guardando o estado atual antes (por segurança)"
./scripts/backup.sh || true

echo "==> Parando o sistema (o banco continua de pé)"
$COMPOSE stop app caddy

echo "==> Restaurando"
gunzip -c "$ARQ" | $COMPOSE exec -T db psql -U postgres -v ON_ERROR_STOP=1 gestao

echo "==> Subindo de volta"
$COMPOSE up -d
echo "Pronto."
