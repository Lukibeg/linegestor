# Mandar o backup para o Google Drive da empresa

Todo dia às 3h o sistema faz uma cópia inteira do banco e guarda no servidor. Este guia liga a
segunda metade: mandar essa cópia **também** para uma pasta do Google Drive da Ingline — que é o
que salva a empresa se o servidor morrer.

Tudo se preenche **na tela**, em `Administração › Ajustes`. No servidor não se mexe em nada.

O trabalho todo é criar, uma vez, uma **conta de serviço** no Google: uma conta de robô, sem senha,
que não expira e não some quando alguém sai da empresa. Leva uns 10 minutos.

---

## Parte 1 — no Google Cloud (uma vez)

Use uma conta do Workspace da Ingline com permissão para criar projetos.

### 1. Criar o projeto

1. Abra <https://console.cloud.google.com>.
2. No seletor de projeto, no alto, clique em **Novo projeto**.
3. Nome: `ingline-gestao`. Criar.

### 2. Ligar a API do Drive

1. Menu ☰ → **APIs e serviços** → **Biblioteca**.
2. Procure **Google Drive API** → **Ativar**.

### 3. Criar a conta de serviço

1. Menu ☰ → **IAM e administrador** → **Contas de serviço** → **Criar conta de serviço**.
2. Nome: `backup-gestao`. Criar e continuar.
3. Nas etapas de papel e de acesso, **pule** (clique em Continuar e depois em Concluído) — ela não
   precisa de papel nenhum no projeto; o acesso vem do compartilhamento da pasta, na parte 2.

### 4. Baixar a chave

1. Clique na conta de serviço recém-criada → aba **Chaves**.
2. **Adicionar chave** → **Criar nova chave** → tipo **JSON** → Criar.
3. O navegador baixa um arquivo `.json`. **Esse arquivo é a senha do robô**: guarde-o no
   gerenciador de senhas da empresa e apague da pasta de downloads depois de usar.
4. Anote o e-mail da conta de serviço — algo como
   `backup-gestao@ingline-gestao.iam.gserviceaccount.com`. Ele aparece na lista.

---

## Parte 2 — no Google Drive

1. Crie a pasta onde os backups vão morar. **Se a Ingline usa Drive compartilhado**, prefira criar
   lá: o espaço é da empresa e a pasta não depende da conta de ninguém.
2. Clique na pasta → **Compartilhar** → cole o e-mail da conta de serviço → permissão **Editor** →
   Enviar. (O Google avisa que a conta não vai receber e-mail. É isso mesmo: robô não lê e-mail.)
3. Abra a pasta e olhe o endereço no navegador:

   ```
   https://drive.google.com/drive/folders/1A2b3C4d5E6f7G8h9I0jKlMnOpQrStUv
                                          └──────── o id da pasta ────────┘
   ```

   Copie esse pedaço final. É o **id da pasta**.

---

## Parte 3 — na tela do sistema

Entre no Ingline Gestão como administrador e vá em **Administração › Ajustes › Backup no Google Drive**:

| Campo | O que pôr |
|---|---|
| Ligar o envio | ligado |
| Id da pasta no Drive | o pedaço que você copiou do endereço |
| Nome da pasta | o que você quiser, só para reconhecer na tela |
| Chave da conta de serviço | **Escolher arquivo…** e selecione o `.json` que o Google baixou |

Clique em **Salvar** e depois em **Testar agora**.

O teste procura a pasta e manda um arquivinho de texto para lá. Se der certo, você vê o nome da
pasta na resposta e o arquivo aparece no Drive — pode apagar. Se der errado, a mensagem diz o que
faltou, geralmente uma destas:

| Mensagem | O que fazer |
|---|---|
| "a conta de serviço não enxerga essa pasta" | Faltou compartilhar a pasta com o e-mail do robô, como Editor |
| "esse id não é de uma pasta" | Você copiou o id de um arquivo, não da pasta |
| "o Google recusou a chave" | O arquivo `.json` não é o certo, ou a chave foi apagada no Google Cloud |

Pronto. A partir daí, todo dia às 3h o backup sobe sozinho, e a própria tela mostra o resultado do
último envio — sem precisar entrar no servidor para saber se está funcionando.

---

## O que acontece depois, sozinho

- **Todo dia às 3h**: o backup é gerado, comprimido, guardado no servidor e enviado para a pasta.
- **Passados 60 dias**, as cópias antigas são apagadas da pasta do Drive. No servidor a regra é
  outra: 14 diárias e 8 semanais.
- **Se o envio falhar**, o backup local é feito do mesmo jeito, a tela de Ajustes mostra o erro e
  sai um aviso (se você tiver configurado os avisos — veja o outro cartão da mesma tela).
- **Toda segunda**, o sistema restaura o backup mais novo num banco descartável e confere se veio
  conteúdo de verdade. Backup que nunca foi restaurado não é backup.

## Cuidados

- **A pasta não pode ser compartilhada com mais ninguém.** O arquivo tem a base da empresa em texto:
  clientes, CNPJs, números, IPs. As senhas guardadas no cofre são a exceção — continuam cifradas
  dentro do arquivo.
- **A `SECRETS_MASTER_KEY` não está no backup.** Ela mora no `.env` do servidor. Sem ela, as senhas
  guardadas não voltam nem com o backup em mãos — por isso a cópia dela no gerenciador de senhas é
  tão importante quanto o backup.
- **Se alguém apagar a chave no Google Cloud**, o envio para de funcionar. É só criar outra chave e
  enviar de novo na tela.
