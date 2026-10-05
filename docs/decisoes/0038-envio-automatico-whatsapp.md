# 0038 — Envio automático do PDF dos Chamados pelo WhatsApp

**Contexto.** Em 03/10 o Luan pediu "um envio em PDF para meu WhatsApp com alguns relatórios
principais", todo dia. Em 04/10 detalhou: uma opção de **envio automático** nos relatórios e também
nos **gráficos comuns** dos Chamados, que ele marca; uma **página nas configurações** com os números
para quem mandar e o horário; e o envio sai de um número que ele configura, pela **API da FlwChat**
(a referência dela está em flwchat.readme.io, seção de disparos). Nas escolhas: **um PDF por dia**,
**só com os números do dia atual**, **um horário e a mesma lista para todos**, e o número que envia
está conectado na FlwChat **por QR code** (não é a API oficial da Meta: manda texto e arquivo sem
modelo aprovado). Foi feito como 1.8, mas em 04/10, ao aprovar a prévia, o Luan pediu para **subir
tudo junto como 1.7**: os Relatórios (0037) e o envio automático saem no mesmo patch.

**Decisão.**

- **Marcar o que vai no PDF nos próprios gráficos e relatórios**: o botão **Envio diário** — um
  **aviãozinho discreto** (pedido do Luan: "mais singelo"), cinza; marcado, azul e cheio —, no
  cabeçalho de cada gráfico da tela de Chamados e de cada relatório (no Fechamento do mês, ao lado do
  "Imprimir"). Só aparece para quem tem `admin.manage`; vale para a equipe toda; cada mudança vai
  para a auditoria (`envio_automatico_marcados`). O **Raio-X** não pode ir (precisa de um cliente
  escolhido). Guardado em `settings.envio-automatico-marcados` (`{relatorios, graficos}`, ids do
  catálogo e da arrumação da tela), **sem migração**. No PDF, a ordem é a das telas.
- **Administração › Envio automático** (aba nova): ligado/desligado, **horário** (de Brasília),
  **dias** (todos, por padrão), a **lista de números** (nome, número, recebe/pausado; até 30), o
  **número que envia**, o **endereço de envio** da API e o **token** (no cofre, nunca volta para a
  tela nem para a auditoria). Botões: **Salvar**, **Testar** (só texto, para um número), **Mandar
  agora** (o PDF, com confirmação), **Ver como fica** e **Baixar o PDF de agora**. Embaixo, o que está
  marcado (com "tirar") e os **últimos envios** (60 guardados; o PDF de cada um para baixar).
  Guardado em `settings.envio-automatico`, **sem migração**.
- **Sempre vão os números de cima da aba Hoje** (abertos hoje, fechados hoje, em aberto agora,
  vencidos), no PDF e na mensagem. Os gráficos marcados saem como na aba **Hoje**; os relatórios,
  com o **período = hoje**; o Fechamento do mês, com o **mês até hoje**.
- **O PDF é a própria tela**: o servidor abre a página `/envio-diario` num **Chromium sem janela**
  (o pacote `chromium` do Debian, na imagem do sistema) e imprime em A4. Nenhum segundo jeito de
  desenhar gráfico; o que muda na tela muda no PDF. A página entra com uma **chave de uso único**
  que vale 5 minutos (o robô não tem login); uma pessoa logada também abre ("Ver como fica").
- **Como chega**: a API recebe o **endereço do arquivo** e baixa de lá. O PDF fica guardado em
  `CONFIG_DIR/envios` e é servido em `/api/envio/arquivo/<id>/<nome>.pdf` — público (sem login),
  com um id de 36 letras impossível de adivinhar, e **vence em 7 dias**. O arquivo **não é apagado**:
  a administração baixa pelo histórico quando quiser.
- **A mensagem** vai com o PDF: "*Chamados de hoje* — domingo, 04/10 (até 18:00)", os números de cima
  e a lista do que está no PDF. A chamada à FlwChat é `POST <endereço>` com `Authorization: Bearer
  <token>` e `{ from, to, body: { text, fileUrl } }` — o formato da plataforma por trás dela (a mesma
  do LineChat). **A confirmar com as páginas de disparo da documentação** (o site não abre para
  leitura automática); se for diferente, muda só `mandarMensagem` em `services/envio.ts`.
- **O relógio**: a cada minuto o servidor confere `horaDeEnviar` (em `@gestor/shared/envio.ts`): está
  ligado, hoje é um dos dias, já passou do horário **até 3 horas depois** (o servidor pode ter caído
  na hora) e ainda não saiu hoje. Se a FlwChat recusar, tenta de novo **a cada 15 minutos, até 3
  vezes** no dia. Um envio de cada vez. Cada envio vai para a auditoria (`envio_automatico`), com
  quem recebeu e o que foi no PDF.
- Os números aceitam qualquer jeito de escrever ("(71) 99999-0000", "+55…") e são guardados só com
  dígitos, com o 55.

**Consequências.**

- Rotas novas em `/api/envio`: `GET|PUT /ajustes`, `GET|PUT /marcados`, `GET /pacote`, `GET /pdf`,
  `POST /enviar`, `POST /testar`, `GET /historico/:id/pdf` e o público `GET /arquivo/:id/:nome`.
  Testes em `packages/shared/src/envio.test.ts` e `apps/api/test/patch17-envio.test.ts` (sem Chromium e sem
  FlwChat de verdade: as duas ferramentas são trocadas por imitações; o PDF de verdade foi conferido
  à parte, com o servidor de produção e o Chromium).
- A **imagem do sistema cresce** (~300 MB) com o Chromium e duas fontes. Variáveis opcionais:
  `CHROMIUM_PATH`, `ENVIOS_DIR`, `ENVIO_PAGINA_URL` e `ENVIO_ENDERECO_PUBLICO` (o padrão é o
  `WEB_ORIGIN`, que em produção já é `https://DOMINIO`).
- A prévia imita tudo (marcar, ajustes, testar, mandar, histórico), mas **nada sai de verdade** e não
  há PDF para baixar; o "Ver como fica" mostra a página.
