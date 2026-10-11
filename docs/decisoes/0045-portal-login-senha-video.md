# 0045 — Portal do cliente: o suporte cria o login e a senha, o vídeo principal e o WhatsApp no "não ajudou"

**Contexto.** Em 09/10, com o 1.9 na prévia e o portal do cliente (1.8) já no ar, o Luan mandou um
.docx com três pedidos para o portal, com prints do sistema no ar:

1. sobre o "Convite pronto": *"para gerar um usuário eu quero algo mais simples: o próprio suporte
   colocar o login, que não precisa ser um e-mail, e o próprio suporte escolher uma senha e passar,
   algo bem simples mesmo, e o suporte ter acesso a essas senhas caso precise trocar ou o cliente
   esqueça"*;
2. sobre o "Isso resolveu? — Não": *"tem que já enviar o número de WhatsApp do suporte para ele
   entrar em contato: (71) 3034-8350"* (no ar, os Ajustes do portal estavam vazios, e o "não" só
   dizia "A gente ajuda");
3. *"a opção para eu colocar um vídeo; nesse caso ele vai ficar como ponto principal do tópico:
   quando tiver um vídeo, ele tem que ficar logo acima"*.

Como o 1.9 ainda não subiu, os três entraram nele.

O primeiro **revê a decisão 0040**, em que a própria pessoa criava a senha pelo link do convite,
para ninguém da Ingline saber a senha do cliente. O Luan foi avisado antes, com o motivo, e manteve
o pedido. Pesou a favor: o portal só mostra tutoriais (nada sensível do cliente), e o suporte já
guarda senhas de cliente no cofre do sistema.

**Decisão.**

- **O suporte cria o acesso**: o nome, o **login** e a **senha**. O login é o e-mail da pessoa ou um
  nome (como `maria.souza`) — letras sem acento, números, ponto, hífen, `_` e `@`, sem espaço, em
  minúsculas, único no portal inteiro; a tela sugere o login pelo nome (`loginSugerido`). A senha
  segue a regra de antes (8 ou mais, letras e números); a tela já sugere uma fácil de ditar e de
  digitar no celular, como `mabeto38` (`senhaSugerida`: três sílabas e dois números, sorteados com o
  `crypto` do navegador), e o **Gerar** dá outra.
- **"Acesso pronto"**: o endereço, o login e a senha, com **Mandar pelo WhatsApp** (a mensagem pronta,
  `mensagemDoAcesso`) e **Copiar a mensagem**. O mesmo para a senha nova.
- **A senha fica guardada nos dois lugares**: o hash Argon2 (é com ele que a entrada confere) e uma
  cópia **cifrada no cofre** (`secrets`, como as outras senhas do Gestor), ligada ao acesso
  (`portal_users.password_secret_id`, migração `0013`). Na lista de acessos, quem dá acesso
  (`portal.access`) **vê a senha pelo olho** — por 30 segundos, com Copiar — e **cada vez fica na
  auditoria** (`reveal_secret`, "Fulano viu a senha do portal de …"), nunca a senha em si. Não pede a
  senha de quem olha (diferente das senhas de servidor), porque o portal só abre tutoriais e o pedido
  foi "algo bem simples".
- **Trocar a senha** (o suporte): cria outra na hora, a atual deixa de valer e as sessões abertas da
  pessoa caem. **A pessoa também pode trocar a dela** no portal (Minha conta); aí a cópia do cofre
  acompanha — o suporte continua vendo a senha certa — e a tela avisa: "O suporte da Ingline também vê
  esta senha, para te ajudar se você esquecer. Não use a mesma senha de outros lugares."
- **O convite saiu**: as rotas do link (`/api/portal/convite/…`) e a tela de criar a senha. Quem abrir
  um link antigo vê "Este link não é mais usado" e o caminho para pedir o acesso ao suporte. As colunas
  do convite (`invite_token_hash`, `invite_expires_at`) ficam no banco, sem uso (nada se apaga).
- **Quem já tinha acesso (1.8) continua entrando** como antes: o e-mail virou o login. A senha que a
  pessoa criou pelo convite **não fica guardada** (só existia o hash): a lista mostra "criada pela
  pessoa", e se ela esquecer, o suporte troca. O acesso cujo convite não foi usado aparece como
  **Sem senha**, com **Definir a senha**. As situações passaram a ser Ativo, Sem senha, Bloqueado e
  Cliente fora da base.
- **A entrada no portal** pede **Login** (não mais "E-mail"); a equipe continua entrando com o e-mail
  e a senha do Gestor (decisão 0044). A mensagem de erro virou "Login ou senha incorretos".
- **O WhatsApp do suporte no "não ajudou"**: o **(71) 3034-8350** passou a ser o padrão dos Ajustes do
  portal (vale enquanto ninguém salvar os Ajustes; dá para trocar lá). O "Não" mostra "A gente ajuda!",
  o número escrito e o botão **Falar no WhatsApp**, que abre a conversa já com o nome do tutorial; o
  botão do celular e o rodapé passam a ter o número também.
- **O vídeo principal**: o tutorial ganhou o campo **Vídeo principal** (subir um vídeo, ou escolher um
  que já subiu no tutorial; trocar e tirar). No portal ele fica **no topo, logo acima do passo a
  passo**, na largura toda; se o mesmo vídeo também estiver no texto, não aparece duas vezes. Só com o
  vídeo principal já dá para publicar (`faltaParaPublicarTutorial`). Tem de ser um vídeo que subiu e
  não é de outro tutorial; passa a ser deste (como os arquivos do texto), e por isso o cliente abre.
  Nas listas do portal, o tutorial com vídeo principal ganha a marca **vídeo** (e o destaque diz "Ver
  o vídeo"). Coluna nova `portal_articles.main_video_id` (migração `0013`).

**Consequências.**

- Migração `0013_portal_senha_e_video`: `portal_users.password_secret_id` (liga com `secrets`) e
  `portal_articles.main_video_id` (liga com `portal_files`). Roda sozinha no `publicar.sh`.
- Rotas: `POST /api/portal-admin/clientes/:id/acessos` recebe `{ nome, login, senha }`; novas `POST
  /api/portal-admin/acessos/:id/senha` (trocar) e `POST /api/portal-admin/acessos/:id/ver-senha`;
  saíram `POST /api/portal-admin/acessos/:id/convite` e `GET`/`POST /api/portal/convite/:codigo`. O
  `POST /api/portal/entrar` recebe `{ login, senha }`. O tutorial manda `videoPrincipal` e o cartão,
  `temVideo`; gravar o tutorial aceita `videoPrincipalId` (sem o campo, mantém; nulo, tira).
- Revê a decisão 0040 na parte "a própria pessoa cria a senha / ninguém da Ingline sabe a senha do
  cliente" (e a regra correspondente nos documentos do projeto).
- Testes: `apps/api/test/portal.test.ts` (refeito para o login e a senha do suporte) e
  `apps/api/test/patch19-portal-pedidos.test.ts` (o WhatsApp padrão e o vídeo principal); no shared,
  `portal.test.ts` (o login, as sugestões, a mensagem, a situação, publicar só com o vídeo).
- **Ficou de fora, para quando ele pedir**: pedir a senha de quem olha a senha do portal (como nas
  senhas de servidor) e mandar a mensagem com o acesso direto pelo envio automático do WhatsApp.
