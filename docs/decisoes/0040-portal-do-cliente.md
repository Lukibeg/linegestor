# 0040 — Portal do cliente

**Contexto.** Na conversa da base de conhecimento (06/10) o Luan pediu, à parte, um portal para o
cliente. Em 07/10 ele detalhou: "a aba do auto atendimento que o cliente vai acessar", com **login e
senha** ("se ele sair da minha base, ele não vai ter mais acesso"), com **vídeos, prints e arquivos**,
"algo bem bacana", fácil de **mandar o link** para o cliente e fácil de o cliente usar. Nas
perguntas, escolheu: **uma senha por pessoa** (não uma por empresa), **o vídeo no próprio sistema**
(não um link do YouTube) e **o cliente vê só o conteúdo dos produtos que tem**. Pediu também para o
portal **subir junto com o 1.8**, que ainda não tinha ido para o servidor.

**Decisão.**

- **O portal mora no mesmo endereço**, em `/portal` (gestao.inglinesystems.com.br/portal). Um
  endereço só dele (como ajuda.inglinesystems.com.br) pode vir depois — é um ajuste no painel do
  domínio, que é do Luan.
- **Outro login, outro mundo.** As pessoas dos clientes ficam em `portal_users` (não em `users`),
  com sessão própria (`portal_sessions`) e cookie próprio (`gestor_portal`). A sessão da equipe não
  abre o portal e a do portal não abre nada do Gestor (as rotas da equipe respondem 401). O cookie do
  portal é `httpOnly`, assinado e **`SameSite=Lax`** — o da equipe é `Strict` —, porque o link do
  tutorial chega pelo WhatsApp e precisa abrir já logado; o que muda alguma coisa no portal é `POST`,
  que o `Lax` não manda de outro site. A sessão dura **30 dias e desliza** (cada uso renova; no máximo
  uma escrita por dia).
- **Uma pessoa, um acesso.** A equipe dá acesso pela ficha do cliente (aba **Portal**) ou em Portal do
  cliente › Acessos, com o nome e o e-mail (o e-mail é o login e é único). **Quem cria a senha é a
  própria pessoa**, pelo link do convite — ninguém da Ingline digita senha de cliente. O convite é um
  código aleatório de 32 bytes; no banco fica **só o hash** (SHA-256), então o link aparece uma vez
  só, na hora de gerar. Vale **7 dias e uma vez**. "Esqueci a senha" é um convite novo: a senha antiga
  continua valendo até a pessoa criar a nova, e criar a senha derruba as outras sessões. A senha
  precisa de 8 caracteres, com letra e número, e é guardada com argon2id (como a da equipe). Entrar e
  usar o convite têm limite de tentativas por minuto.
- **Saiu da base, perdeu o acesso** — conferido **a cada pedido**, não só no login: a pessoa precisa
  estar ativa e o cliente precisa estar **fora do arquivo, fora da lixeira e com pelo menos um produto
  ativo**. Faltou uma dessas, a sessão aberta é recusada na hora ("Seu acesso ao portal está suspenso.
  Fale com o suporte da Ingline.") e a tela leva para Entrar. Se o cliente voltar, os acessos voltam
  com as mesmas senhas. **Bloquear** é para uma pessoa só (saiu da empresa) e derruba a sessão dela.
- **O que cada cliente vê**: os tutoriais **publicados** que são **Geral** ou de um **produto ativo**
  dele — e, quando o tutorial é de um módulo (FOP2, Omniboard…), só quem tem o módulo ligado. A regra
  é `tutorialValePara` em `@gestor/shared/portal.ts`, a mesma no servidor, nos arquivos e na prévia.
  Tutorial de outro produto responde "não está disponível", e o arquivo dele também não abre.
- **O tutorial** é o texto simples da base (passos, comandos com Copiar, `[print:id]`) e mais
  **`[video:id]`** (o vídeo toca ali mesmo) e **`[arquivo:id]`** (o botão de baixar) — só o portal
  entende essas duas marcas (`blocosDoTexto(texto, { midia: true })`). Tem título, resumo, produto (ou
  módulo, ou Geral) e "em destaque". Rascunho a equipe vê e o cliente não; publicar exige o passo a
  passo (ou o resumo). Como na base, se outra pessoa salvou no meio, o servidor recusa em vez de
  passar por cima.
- **Os arquivos sobem na hora**, um por vez, com a barra de progresso (o envio vai em partes, e não
  em JSON, por causa do tamanho): **print** até 5 MB (o navegador reduz antes, até 1600 px), **arquivo**
  até 20 MB e **vídeo** até 300 MB (MP4, WebM ou MOV). A marca provisória entra no texto onde estava o
  cursor e vira a de verdade quando o arquivo chega; com arquivo subindo, não dá para salvar.
- **Onde fica cada coisa**: print e arquivo **no banco** (base64, como os anexos da base) — entram no
  backup. **O vídeo fica em disco**, na pasta `PORTAL_DIR` (`/portal` no servidor, o volume `portal` do
  docker-compose), e é servido com **Range** (o celular pula para o meio sem baixar tudo). **O vídeo
  não entra no backup diário**: o envio ao Google Drive é de um arquivo só e o disco da VPS é
  limitado. A tela avisa para guardar o original, e Portal do cliente › Ajustes mostra quanto cada
  parte ocupa.
- **Segurança dos arquivos**: no meio do texto **só imagem que o navegador só desenha** (PNG, JPG,
  WEBP, GIF), conferida pelos primeiros bytes — nunca SVG, que pode rodar código. O arquivo para
  baixar vai **sempre como download** (`attachment`, tipo genérico), nunca abre no navegador. A logo do
  cliente no portal sai com uma política que não deixa nada rodar.
- **Mandar o link**: o endereço do tutorial é `/portal/a/12-como-transferir-uma-ligacao` — **o número
  manda**; o resto é só para a pessoa entender o link (se o título mudar, o link antigo continua
  abrindo e a tela ajeita o endereço). "Copiar link" e "WhatsApp" (o `wa.me` com a mensagem pronta;
  quem escolhe o contato é a equipe) ficam na lista, no tutorial e na janela de "publicado". O convite
  sai do mesmo jeito. Quem abre o link sem estar logado entra e **cai direto no tutorial** (o
  `?volta=` só aceita endereço do próprio portal).
- **O portal do cliente** (a tela): pensado para o celular — letra maior, passo com número grande,
  o print abre na tela inteira, busca no topo (sem acento, a mesma busca da base), os produtos dele, os
  destaques, os novos e o **"Falar com o suporte"** (o WhatsApp da Ingline, com o nome do tutorial na
  mensagem). O "Isso resolveu?" não guarda nada: o "não" leva para o suporte. Claro e escuro. O nome
  do portal, as boas-vindas e o contato do suporte ficam em Portal do cliente › Ajustes (mudar é de
  quem administra).
- **Quem faz o quê na equipe**: ver é `records.read` (todo mundo); escrever tutorial é a permissão
  nova **`portal.write`** e dar, bloquear e reenviar acesso é **`portal.access`** — as duas para
  Operador, Técnico e Administrador (a migração 0010 dá aos papéis que já existem). Os ajustes do
  portal são `admin.manage`.
- **Lixeira e auditoria**: o tutorial vai para a lixeira e volta por Administração › Lixeira (sai do
  portal na hora). Tudo vai para a auditoria (`entityType = portal`): tutorial, arquivo, acesso,
  convite, bloqueio, senha criada pelo convite, tentativa de entrar que falhou e ajustes — **nunca o
  código do convite**.

**Consequências.**

- Tabelas novas (`0010_portal_do_cliente.sql`): `portal_users`, `portal_sessions`, `portal_articles`
  e `portal_files` (55 tabelas no total). Os ajustes moram em `settings` (id `portal`).
- Rotas novas: `/api/portal-admin/*` (a equipe: tutoriais, arquivos com envio em partes, acessos,
  ajustes, espaço) e `/api/portal/*` (o cliente: entrar, sair, convite, início, tutoriais, arquivos com
  Range, logo). Testes: `packages/shared/src/portal.test.ts` e `apps/api/test/portal.test.ts`.
- Telas novas: `/portal-do-cliente` (Tutoriais · Acessos · Ajustes), `/portal-do-cliente/novo` e
  `/portal-do-cliente/:numero` (com "Ver como fica" no celular e no computador), a aba **Portal** da
  ficha do cliente e o portal em `/portal` (entrar, convite, início, produto, busca, tutorial, conta).
- **A interface carrega em partes**: o portal e as telas da equipe são baixados só quando abertos
  (`lazy`), e o celular do cliente baixa cerca de 125 KB (comprimidos) em vez do sistema inteiro.
- Servidor: o Dockerfile cria `/portal/videos`, e o `docker-compose.prod.yml` ganhou o volume
  `portal` e a variável `PORTAL_DIR`. O volume precisa existir antes de subir (o compose cria sozinho).
- A prévia tem nove tutoriais de exemplo (um com vídeo, prints desenhados, um manual em PDF e um
  rascunho) e cinco acessos (um ativo, um convite pendente, um bloqueado e um de cliente arquivado,
  para mostrar o acesso caindo). Nela, o portal abre na mesma página (o "Abrir o portal" não abre outra
  aba, que começaria a demonstração do zero) e as senhas são "demo".
- Arquivo que subiu e não entrou em tutorial nenhum fica guardado (aparece no espaço usado). Ficou
  para depois: o endereço só do portal, o "isso ajudou?" com contagem e os vídeos no backup (um envio
  separado, quando o volume justificar).
