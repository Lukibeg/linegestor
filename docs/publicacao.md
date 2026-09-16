# Como o Ingline Gestão chega ao ar

Dois lugares, um sistema:

```
sua máquina (desenvolvimento)  →  GitHub (guarda o código e roda os testes)  →  VPS (produção)
```

**Desenvolvimento** é onde se mexe: banco de brincadeira, dados fictícios, pode quebrar à vontade.
**Produção** é o `https://gestao.inglinesystems.com.br`, com os dados de verdade — nada entra nele
sem ter passado pelos testes automáticos e por um teste seu na máquina local.

---

## 1. O que precisa existir antes

| O quê | Quem cria | Observação |
|---|---|---|
| Conta no **GitHub** e repositório privado `ingline-gestao` | Você | Guarda o código e roda os testes a cada mudança |
| **VPS** Ubuntu 24.04 — 2 vCPU, 4 GB RAM, 60 GB disco | Você | Vultr ou Hetzner. Com 2 GB também roda, mas a compilação fica apertada (o preparo do servidor já cria 2 GB de swap) |
| **Chave SSH** sua no servidor | Você, ao criar o VPS | Nunca senha: o preparo desliga o acesso por senha |
| Registro **DNS** `gestao.inglinesystems.com.br` → IP do VPS | Você, no painel do domínio | Um registro `A`. Só depois disso o HTTPS consegue ser emitido |
| **Gerenciador de senhas** da empresa | Você | Para guardar `SECRETS_MASTER_KEY`, `SESSION_SECRET` e `DB_PASSWORD` fora do servidor |

> Eu não crio contas nem digito senhas por você — essas etapas são suas. Todo o resto é comando pronto.

---

## 2. Preparar o servidor (uma vez)

Entre no VPS recém-criado como `root` e rode:

```bash
apt-get update && apt-get install -y git
git clone https://github.com/<sua-conta>/ingline-gestao.git /opt/gestao
bash /opt/gestao/scripts/preparar-servidor.sh
```

O que esse script deixa pronto:

- **atualizações de segurança automáticas** (`unattended-upgrades`)
- **firewall fechado**: só entram SSH (22), HTTP (80) e HTTPS (443)
- **SSH só por chave** — senha desligada, root sem senha
- **fail2ban**, que bloqueia quem fica tentando entrar
- **Docker** e 2 GB de memória de troca
- um usuário **`gestao`** sem poderes de root para o dia a dia

Depois disso, saia do root e entre como `gestao`.

---

## 3. Configurar e subir (uma vez)

```bash
sudo chown -R gestao:gestao /opt/gestao
cd /opt/gestao
cp .env.example .env && chmod 600 .env
nano .env      # descomente o bloco de produção e preencha
```

No `.env` de produção:

| Variável | O que pôr |
|---|---|
| `NODE_ENV` | `production` |
| `DOMINIO` | `gestao.inglinesystems.com.br` |
| `DB_PASSWORD` | senha longa e aleatória do PostgreSQL interno |
| `SECRETS_MASTER_KEY` | `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"` — **guarde cópia no gerenciador de senhas** |
| `SESSION_SECRET` | `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"` |
| `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` | **deixe de fora.** O `criar-admin.sh` pergunta na hora, sem a senha passar por arquivo |

Então:

```bash
mkdir -p backups config && chmod 700 backups config
docker compose -f docker-compose.prod.yml up -d      # banco + sistema + HTTPS
./scripts/criar-admin.sh                             # pergunta e-mail e senha na hora
```

O `criar-admin.sh` carrega os catálogos (produtos, módulos, operadoras, papéis) e cria o primeiro
administrador. Ele **pergunta a senha na hora**, escondida: ela não entra no `.env`, não fica no
histórico do terminal e não vai para o backup — só o hash Argon2 fica no banco. Por isso as linhas
`SEED_ADMIN_*` do `.env` podem continuar comentadas.

Entre em `https://gestao.inglinesystems.com.br` e **ligue a verificação em duas etapas** na sua conta.

O certificado HTTPS é emitido sozinho pelo Caddy no primeiro acesso e renovado sozinho — desde que
o DNS já esteja apontando para o servidor.

---

## 4. Backup e vigia (configure no mesmo dia)

```bash
crontab -e
# backup todo dia às 3h da manhã
0 3 * * * cd /opt/gestao && ./scripts/backup.sh >> /var/log/gestao-backup.log 2>&1
# toda segunda, às 3h30, prova que o backup presta: restaura num banco descartável e confere
30 3 * * 1 cd /opt/gestao && ./scripts/verificar-backup.sh >> /var/log/gestao-backup.log 2>&1
# de 5 em 5 minutos, confere se o sistema respondeu
*/5 * * * * cd /opt/gestao && ./scripts/monitorar.sh >> /var/log/gestao-monitor.log 2>&1
```

**Para onde o backup sobe e para onde vão os avisos se preenche na tela**, em
`Administração › Ajustes` — não aqui. Dois guias cobrem o passo a passo:
[backup no Google Drive](guia-de-uso/backup-no-google-drive.md) e
[avisos no WhatsApp](guia-de-uso/avisos-no-whatsapp.md). Como o vigia roda **dentro** do servidor,
ele não avisa se o servidor inteiro cair — para isso, ponha também um monitor de fora
(UptimeRobot ou Better Stack, ambos com plano grátis) apontando para
`https://gestao.inglinesystems.com.br/api/health`.

Guarda 14 diários e 8 semanais em `/opt/gestao/backups`, e manda cada um para a pasta do Google
Drive configurada na tela. Sem essa segunda parte, o backup só protege contra engano, não contra pane.

**Teste a restauração uma vez por trimestre:**

```bash
./scripts/restaurar.sh backups/gestao-<data>.sql.gz
```

Backup que nunca foi restaurado não é backup.

---

## 5. O dia a dia: publicar uma versão nova

Na sua máquina, com a mudança testada:

```bash
pnpm typecheck && pnpm test     # o GitHub roda isso de novo sozinho
git push
```

No servidor:

```bash
cd /opt/gestao && ./scripts/publicar.sh
```

O `publicar.sh` faz backup antes, baixa o código, reconstrói, aplica as migrações do banco e só
considera pronto quando o sistema responde. Se não responder, ele mostra o registro e diz como
voltar à versão anterior (`git reset --hard HEAD~1 && ./scripts/publicar.sh`).

---

## 6. Testar na sua máquina antes

Com Docker:

```bash
cp .env.example .env    # bloco de desenvolvimento; preencha as duas chaves
docker compose up -d                                # http://localhost:3333
docker compose exec app pnpm db:seed:demo           # catálogos + dados fictícios
```

Sem Docker (PostgreSQL instalado na máquina):

```bash
pnpm install
pnpm db:migrate && pnpm db:seed:demo
pnpm dev                # API em :3333, interface em :5173
```

Para ensaiar uma mudança grande com os dados de verdade: traga um backup de produção, restaure num
banco local e teste ali. Nunca o contrário.

---

## 7. Segurança — o que já está de pé

| Camada | Como está |
|---|---|
| Rede | Firewall fechado; nem o banco nem a API abrem porta para a internet — só o Caddy |
| Transporte | HTTPS obrigatório, certificado automático, HSTS de 1 ano |
| Cabeçalhos | `nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy` |
| Entrada | Acesso por sessão em cookie assinado e `httpOnly`; limite de tentativas de login |
| Senhas guardadas | Cifradas com AES-256-GCM; a chave fica no `.env`, nunca no banco |
| Quem pode o quê | 4 papéis e 14 permissões; toda ação sensível fica na auditoria |
| Dados | Nada é apagado de verdade (lixeira); exportação com senhas só em ZIP com senha e auditada |
| Entrada (2ª etapa) | Código de 6 dígitos do celular (TOTP), opcional por pessoa, com códigos de recuperação |
| Contêiner | Roda como usuário sem poderes, nunca como root |
| Servidor | Atualizações de segurança automáticas, SSH só por chave, fail2ban |

### Se alguém perder o celular com a verificação em duas etapas

Primeiro, um dos códigos de recuperação entra no lugar dos 6 dígitos. Se eles também tiverem sumido,
quem tem acesso ao servidor desliga a verificação daquela conta:

```bash
docker compose -f docker-compose.prod.yml exec app pnpm db:2fa-off fulano@ingline.com.br
```

O que **você** precisa manter: a `SECRETS_MASTER_KEY` guardada fora do servidor, o backup remoto
ligado, e a restauração testada de vez em quando.
