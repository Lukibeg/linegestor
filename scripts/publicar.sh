#!/usr/bin/env bash
# Põe no ar a versão mais nova do Ingline Gestão. Rodar DENTRO da pasta do projeto, no servidor:
#
#   ./scripts/publicar.sh
#
# Faz backup antes de qualquer coisa, baixa o código novo, reconstrói, aplica as migrações
# do banco e só troca o sistema no ar quando ele responde. Se algo falhar, nada é trocado.
set -euo pipefail
cd "$(dirname "$0")/.."
COMPOSE="docker compose -f docker-compose.prod.yml"

echo "==> 1/5 Backup antes de mexer"
./scripts/backup.sh

echo "==> 2/5 Baixando o código novo"
git pull --ff-only

echo "==> 3/5 Reconstruindo a imagem"
$COMPOSE build app

echo "==> 4/5 Subindo (as migrações do banco rodam sozinhas na partida)"
$COMPOSE up -d

echo "==> 5/5 Conferindo se respondeu"
for i in $(seq 1 30); do
  if $COMPOSE exec -T app node -e "fetch('http://127.0.0.1:3333/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" 2>/dev/null; then
    echo "No ar: https://$(grep -E '^DOMINIO=' .env | cut -d= -f2)"
    exit 0
  fi
  sleep 2
done

echo "!! O sistema não respondeu em 60s. Últimas linhas do registro:" >&2
$COMPOSE logs --tail 40 app >&2
echo "Para voltar à versão anterior: git reset --hard HEAD~1 && ./scripts/publicar.sh" >&2
exit 1
