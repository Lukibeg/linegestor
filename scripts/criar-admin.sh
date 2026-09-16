#!/usr/bin/env bash
# Cria o PRIMEIRO administrador do Ingline Gestão, sem a senha passar por arquivo nenhum.
# Rodar no servidor, dentro da pasta do projeto, depois que os contêineres já subiram:
#
#   ./scripts/criar-admin.sh
#
# Ele pergunta o e-mail e a senha na hora. A senha não aparece na tela, não fica no
# histórico do terminal, não entra no .env e não vai para o backup — só o resultado
# cifrado (o hash Argon2) fica no banco, que é como toda senha do sistema é guardada.
#
# Serve também para carregar os catálogos (produtos, módulos, operadoras, papéis) na
# primeira vez: é o mesmo `db:seed`, que não repete o que já existe.
set -euo pipefail
cd "$(dirname "$0")/.."
COMPOSE="docker compose -f docker-compose.prod.yml"

if ! $COMPOSE ps --status running app >/dev/null 2>&1; then
  echo "O sistema não parece estar de pé. Suba com: $COMPOSE up -d" >&2
  exit 1
fi

read -rp "E-mail do administrador: " EMAIL
[ -n "$EMAIL" ] || { echo "E-mail é obrigatório." >&2; exit 1; }
read -rp "Nome que vai aparecer na tela [Administrador]: " NOME
NOME=${NOME:-Administrador}

# -s esconde o que está sendo digitado; a senha nunca vira texto de comando,
# então também não entra no histórico do bash
read -rsp "Senha (mínimo 10 caracteres): " SENHA; echo
read -rsp "Digite a senha de novo: " SENHA2; echo
[ "$SENHA" = "$SENHA2" ] || { echo "As senhas não conferem. Nada foi criado." >&2; exit 1; }
[ ${#SENHA} -ge 10 ] || { echo "Senha curta demais: mínimo 10 caracteres. Nada foi criado." >&2; exit 1; }

echo "==> Criando o administrador e carregando os catálogos"
$COMPOSE exec -T \
  -e SEED_ADMIN_EMAIL="$EMAIL" \
  -e SEED_ADMIN_PASSWORD="$SENHA" \
  -e SEED_ADMIN_NAME="$NOME" \
  app pnpm db:seed

unset SENHA SENHA2

cat <<FIM

Pronto. Entre em https://$(grep -E '^DOMINIO=' .env | cut -d= -f2 || echo 'seu-endereco') com "$EMAIL".

Faça agora, nesta ordem:
  1. Minha conta → ligar a verificação em duas etapas e guardar os 10 códigos de recuperação.
  2. Conferir que o .env NÃO tem linhas SEED_ADMIN_* (este script não precisa delas).

Se um dia precisar de outro administrador, crie pela tela, em Administração → Usuários.
FIM
