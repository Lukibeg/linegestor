#!/usr/bin/env bash
# Olha se o sistema está de pé. Rodar de 5 em 5 minutos pelo cron:
#
#   */5 * * * * cd /opt/gestao && ./scripts/monitorar.sh >> /var/log/gestao-monitor.log 2>&1
#
# Se não responder duas vezes seguidas, tenta levantar de novo e avisa em ALERTA_URL
# (ntfy.sh, webhook do Slack/Discord, healthchecks.io — qualquer endereço que aceite POST).
#
# Importante: isto roda DENTRO do servidor, então não avisa se o servidor inteiro cair.
# Para isso, use também um monitor de fora (UptimeRobot, Better Stack — ambos têm plano grátis)
# apontando para https://SEU-DOMINIO/api/health.
set -uo pipefail
cd "$(dirname "$0")/.."
[[ -f .env ]] && set -a && . ./.env && set +a

COMPOSE="docker compose -f docker-compose.prod.yml"
MARCA=/tmp/gestao-monitor-falhas
ENDERECO="https://${DOMINIO:-localhost}/api/health"

avisar() {
  echo "[$(date '+%F %T')] $1"
  [[ -n "${ALERTA_URL:-}" ]] && curl -fsS -m 10 -H 'Content-Type: text/plain' -d "Ingline Gestão: $1" "$ALERTA_URL" >/dev/null 2>&1
  return 0
}

if curl -fsS -m 15 "$ENDERECO" | grep -q '"ok":true'; then
  if [[ -f $MARCA ]]; then rm -f $MARCA; avisar "voltou ao ar ($ENDERECO)"; fi
  exit 0
fi

falhas=$(( $(cat $MARCA 2>/dev/null || echo 0) + 1 ))
echo "$falhas" > $MARCA
echo "[$(date '+%F %T')] sem resposta ($falhas)"

if [[ $falhas -eq 2 ]]; then
  avisar "não respondeu duas vezes seguidas; tentando levantar de novo"
  $COMPOSE up -d >/dev/null 2>&1
elif [[ $falhas -ge 6 ]] && (( falhas % 6 == 0 )); then
  avisar "continua fora do ar há $(( falhas * 5 )) minutos — precisa de olho humano"
fi
