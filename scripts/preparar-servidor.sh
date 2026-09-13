#!/usr/bin/env bash
# Prepara um VPS Ubuntu 24.04 recém-criado para rodar o Ingline Gestão.
# Roda UMA VEZ, como root, logo depois de criar o servidor:
#
#   bash scripts/preparar-servidor.sh
#
# O que faz: atualizações de segurança automáticas, firewall fechado, SSH só por chave,
# fail2ban, Docker, memória de troca (swap) e um usuário sem poderes de root para o dia a dia.
set -euo pipefail
USUARIO="${1:-gestao}"

[[ $EUID -eq 0 ]] || { echo "Rode como root: sudo bash $0"; exit 1; }

echo "==> Atualizando o sistema"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq && apt-get upgrade -y -qq

echo "==> Atualizações de segurança automáticas"
apt-get install -y -qq unattended-upgrades
dpkg-reconfigure -f noninteractive unattended-upgrades

echo "==> Firewall: só SSH, HTTP e HTTPS entram"
apt-get install -y -qq ufw
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 443/udp
ufw --force enable

echo "==> SSH somente por chave (senha desligada)"
install -d -m 700 /etc/ssh/sshd_config.d
cat > /etc/ssh/sshd_config.d/99-gestao.conf <<'CFG'
PasswordAuthentication no
PermitRootLogin prohibit-password
KbdInteractiveAuthentication no
CFG
systemctl reload ssh || systemctl reload sshd

echo "==> fail2ban (bloqueia quem insiste em tentar entrar)"
apt-get install -y -qq fail2ban
systemctl enable --now fail2ban

echo "==> Memória de troca (2 GB) — dá folga para compilar o sistema"
if [[ ! -f /swapfile ]]; then
  fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap -q /swapfile && swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

echo "==> Docker"
if ! command -v docker >/dev/null; then
  curl -fsSL https://get.docker.com | sh
fi
systemctl enable --now docker

echo "==> Usuário '$USUARIO' para o dia a dia"
if ! id "$USUARIO" >/dev/null 2>&1; then
  adduser --disabled-password --gecos '' "$USUARIO"
  usermod -aG docker,sudo "$USUARIO"
  install -d -m 700 -o "$USUARIO" -g "$USUARIO" "/home/$USUARIO/.ssh"
  [[ -f /root/.ssh/authorized_keys ]] && install -m 600 -o "$USUARIO" -g "$USUARIO" /root/.ssh/authorized_keys "/home/$USUARIO/.ssh/authorized_keys"
fi

echo
echo "Servidor pronto. Agora entre como $USUARIO e siga docs/publicacao.md:"
echo "  ssh $USUARIO@<ip-do-servidor>"
