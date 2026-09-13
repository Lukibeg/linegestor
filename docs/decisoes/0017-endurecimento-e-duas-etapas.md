# 0017 — Bases atualizadas, contêiner sem root e verificação em duas etapas

**Contexto.** Antes de subir, você perguntou se o desenho era o mais seguro e moderno. A resposta
honesta era "sólido, mas com pontas soltas". Estas são as pontas que amarramos.

**Decisão.**

*Bases e contêiner*
- **Node 22 → 24.** O 22 entrou em manutenção em out/2025 (só correção de segurança até abr/2027);
  o 24 é o LTS ativo.
- **PostgreSQL 16 → 18.** Feito agora, com o banco vazio: depois de ter dados custa dump e restore.
  Atenção: a imagem do Postgres 18 mudou o lugar dos dados, então o volume passou a ser
  `/var/lib/postgresql` inteiro, não `/var/lib/postgresql/data` — montar no lugar antigo faz o banco
  reiniciar do zero a cada restart, **sem avisar**.
- **O contêiner roda como o usuário `node`**, não como root. Escapar do programa agora leva a um
  usuário sem poder nenhum.
- **CSP no Caddy** (de onde a página pode carregar script, estilo, fonte e imagem) e cookie de sessão
  em `SameSite=strict`, que trava CSRF na raiz. Efeito colateral aceito: clicar num link externo para
  o sistema abre deslogado na primeira vez.

*Verificação em duas etapas (TOTP)*
- **Opcional, por pessoa.** Cada um liga a sua em **Minha conta**; ninguém é obrigado. Hoje é para o
  gestor; se um dia virar obrigatória para um papel inteiro, o lugar de decidir isso já existe.
- **TOTP escrito à mão** (`services/totp.ts`, RFC 6238, HMAC-SHA1, 30 s, ±1 janela) em vez de uma
  biblioteca: são 30 linhas, conferidas contra os vetores de teste do próprio RFC, e é uma dependência
  a menos para acompanhar. O QR Code usa a biblioteca `qrcode`, que só desenha.
- **O segredo é cifrado** com a mesma chave-mestra do cofre de senhas. Quem abrir o banco não o vê.
- **A sessão nasce pendente.** Senha certa cria uma sessão marcada `pending_totp`, que vale 10 minutos
  e **não** conta como login: `/auth/me` e qualquer rota protegida recusam. Só o código de 6 dígitos a
  promove. Assim não existe "meio logado" que alguém consiga usar.
- **Dez códigos de recuperação**, mostrados uma única vez, guardados como hash Argon2, cada um gasto
  ao ser usado.
- **Saída de emergência:** `pnpm db:2fa-off <e-mail>` no servidor, para quem perdeu celular e códigos.
  Exige acesso SSH, que já é o nível mais alto de confiança que existe ali.

*Vigia*
- `scripts/monitorar.sh` (de 5 em 5 min) e `scripts/verificar-backup.sh` (toda segunda) avisam num
  endereço configurável — `ALERTA_URL` — que funciona com ntfy.sh, Slack, Discord ou healthchecks.io.
  A checagem de backup **restaura de verdade** num banco descartável e confere se veio conteúdo.

**Fora de escopo, por decisão sua.** Cloudflare na frente (mexeria no DNS da empresa inteira) e
Dependabot/`pnpm audit` automáticos. As bibliotecas do frontend (React 19, Vite 8, Tailwind 4,
TypeScript 7) ficam para depois que o sistema estiver no ar e estável — é modernidade, não segurança.

**Consequência.** O que sobrou de risco conhecido: um servidor só (uma pane de máquina derruba o
sistema até alguém restaurar noutro), e o backup remoto depende de você ligar o `rclone`. Nenhum dos
dois é resolvível com código — são decisões de custo e de rotina.

**Adendo (backup para fora do servidor).** O destino escolhido foi o **Google Drive da empresa**,
sem cifrar o arquivo antes de subir. O que isso significa, dito claramente: o arquivo
diário contém a base em texto (clientes, CNPJs, DIDs, IPs), então **a pasta do Drive não pode ser
compartilhada com ninguém** — ela é tão sensível quanto o próprio banco. As senhas guardadas no cofre
são a exceção: continuam cifradas dentro do arquivo, e a chave que as abre (`SECRETS_MASTER_KEY`)
mora no `.env`, que não entra no backup. Lá fora as cópias com mais de 60 dias são apagadas sozinhas;
no servidor a regra continua 14 diárias + 8 semanais. Se a cópia falhar, o backup local é feito do
mesmo jeito e sai um aviso no `ALERTA_URL`. Passo a passo em
`docs/guia-de-uso/backup-no-google-drive.md`.
