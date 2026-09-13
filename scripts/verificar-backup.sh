#!/usr/bin/env bash
# Prova que o backup presta: restaura o mais novo num banco descartável, conta as linhas
# e joga o banco fora. Rodar toda semana pelo cron:
#
#   30 3 * * 1 cd /opt/gestao && ./scripts/verificar-backup.sh >> /var/log/gestao-backup.log 2>&1
#
# Avisa em ALERTA_URL se o backup não existir, não abrir, ou vier vazio.
set -uo pipefail
cd "$(dirname "$0")/.."
[[ -f .env ]] && set -a && . ./.env && set +a

COMPOSE="docker compose -f docker-compose.prod.yml"
TESTE="gestao_teste_de_backup"
ULTIMO=$(ls -t "${BACKUP_DIR:-./backups}"/gestao-*.sql.gz 2>/dev/null | head -1)

avisar() {
  echo "[$(date '+%F %T')] $1"
  [[ -n "${ALERTA_URL:-}" ]] && curl -fsS -m 10 -H 'Content-Type: text/plain' -d "Ingline Gestão · backup: $1" "$ALERTA_URL" >/dev/null 2>&1
  return 0
}
limpar() { $COMPOSE exec -T db psql -U postgres -q -c "DROP DATABASE IF EXISTS $TESTE;" >/dev/null 2>&1; }
trap limpar EXIT

[[ -n "$ULTIMO" ]] || { avisar "FALHOU: não há nenhum arquivo de backup"; exit 1; }

idade=$(( ( $(date +%s) - $(date -r "$ULTIMO" +%s) ) / 3600 ))
[[ $idade -le 30 ]] || avisar "atenção: o backup mais novo tem $idade horas"

limpar
$COMPOSE exec -T db psql -U postgres -q -c "CREATE DATABASE $TESTE;" >/dev/null || { avisar "FALHOU: não deu para criar o banco de teste"; exit 1; }

if ! gunzip -c "$ULTIMO" | $COMPOSE exec -T db psql -U postgres -q -v ON_ERROR_STOP=1 "$TESTE" >/dev/null 2>&1; then
  avisar "FALHOU: o arquivo $(basename "$ULTIMO") não restaura"
  exit 1
fi

linhas=$($COMPOSE exec -T db psql -U postgres -tAq -d "$TESTE" -c \
  "select coalesce((select count(*) from clients),0) + coalesce((select count(*) from dids),0) + coalesce((select count(*) from devices),0);" 2>/dev/null | tr -d '[:space:]')

if [[ -z "$linhas" || "$linhas" -lt 1 ]]; then
  avisar "FALHOU: $(basename "$ULTIMO") restaurou, mas veio vazio"
  exit 1
fi

echo "[$(date '+%F %T')] ok: $(basename "$ULTIMO") restaurou com $linhas registros (clientes + DIDs + aparelhos)"
