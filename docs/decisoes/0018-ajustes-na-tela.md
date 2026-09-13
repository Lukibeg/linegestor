# 0018 — Backup e avisos se configuram na tela, não em arquivo no servidor

**Contexto.** A primeira versão punha o destino do backup e o endereço dos avisos no `.env` do
servidor, e usava o `rclone` para falar com o Google Drive. Funciona, mas amarra duas coisas que
mudam com alguma frequência — a pasta do Drive, o token da API de mensagem — a quem tem acesso SSH.
Você pediu que fossem **sem código, numa tela do sistema, com instruções ali mesmo**.

**Decisão.**

- Nova tela **Administração › Ajustes**, com dois cartões: *Backup no Google Drive* e
  *Avisos (WhatsApp pelo LineChat)*. Cada um explica o que é, o que preencher, e tem um botão de
  **testar** que dá a resposta na hora — nada de salvar e torcer.
- Nova tabela `settings` (uma linha por assunto). O que não é segredo fica em JSON; a **chave da
  conta de serviço do Google** e o **token da API de avisos** vão para o mesmo cofre cifrado das
  senhas de SSH, e nunca voltam para a tela.
- **O `rclone` saiu.** O próprio sistema fala com a API do Drive: assina um JWT com a chave da conta
  de serviço, troca por um passe de 1 hora e faz o upload. São ~60 linhas em `services/integracoes.ts`
  e nenhuma dependência nova — e, principalmente, dispensa instalar e configurar o rclone no servidor
  com aquele vai-e-volta de autorização pelo navegador.
- **Conta de serviço em vez de conta de pessoa.** Não expira, não depende de ninguém continuar na
  empresa, e não precisa de navegador no servidor. O acesso vem de compartilhar a pasta do Drive com
  o e-mail do robô — escopo `drive.file`, então ele só enxerga o que ele mesmo criou.
- **Avisos genéricos de propósito.** URL, método, cabeçalhos e corpo são campos livres, com
  `{{mensagem}}` e `{{token}}` como marcadores. Assim serve para o LineChat hoje e para qualquer
  outra API amanhã, sem mexer no código.
- **O vigia continua fora do sistema.** Quem avisa que o sistema caiu não pode ser o próprio sistema.
  Então, ao salvar os ajustes, a API grava uma cópia pronta em `config/avisos.json`, e o
  `scripts/avisar.sh` — que não sabe nada de banco nem de criptografia — lê esse arquivo. O
  `monitorar.sh` e o `verificar-backup.sh` passaram a chamar esse script.
- O `scripts/backup.sh` deixou de saber para onde o arquivo vai: ele gera, guarda, e pede ao sistema
  (`pnpm enviar-backup`) que envie. O resultado fica gravado no banco, e a tela mostra "último envio:
  hoje 03:00, deu certo" sem ninguém precisar entrar no servidor.

**Consequência.** O `.env` voltou a ter só o essencial que existe antes do sistema subir (banco,
chaves, domínio). Uma armadilha nova a conhecer: a pasta `config/` e a pasta `backups/` são montadas
dentro do contêiner do sistema (`/dados` e `/backups`); se alguém apagar essas pastas, o envio do
backup e os avisos param — sem quebrar o resto.
