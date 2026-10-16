# Chamados (o módulo do Gestor)

Desde o Patch 2.0 os chamados nascem e andam no **Gestor**, em **Suporte › Chamados** (no menu
lateral). Os chamados antigos continuam no LineChat; para consultar, **Suporte › Relatórios** abre neles,
na aba **Hoje** (as abas levam ao Período e aos relatórios).
A decisão inteira está em `docs/decisoes/0047-chamados-do-gestor.md`.

---

## 1. O dia a dia

- **Painéis** (a primeira tela, como no Helena): um cartão por painel (Suporte, Desenvolvimento…), com
  os números de agora (em aberto, vencidos, sem dono, os seus) e quantos estão em cada etapa. Clique no
  painel para abrir o **quadro**; cada número abre a lista já filtrada; **Configurar** (quem cuida dos
  chamados) abre a janela daquele painel, com as etapas e as regras; **Novo painel** cria outro.
- **Quadro**: o de um painel, uma coluna por etapa (colunas finas: cabem mais na tela). **Arraste** o
  cartão para mover; no celular ou pelo teclado, use **Mover** no pé do cartão. Em cima, numa linha
  só: a seta (volta aos painéis), **Quadro | Lista** (as duas vistas do painel, com os mesmos filtros),
  **Trocar** (outro painel), **Configurar**, a busca e **Filtros** (as caixas dos filtros aparecem
  quando pedidas; o que está filtrado fica escrito, com o X). O fechado mostra os 30 mais recentes (o
  resto, na lista).
- **Clicar num chamado** (no quadro, na lista, no Meu dia ou num aviso do sininho) abre a ficha numa
  **janela grande por cima da tela**, que continua embaixo do jeito que estava: fechar (o X, o Esc ou o
  Voltar do navegador) volta para ela. **Página inteira** abre a ficha sozinha — o endereço dela
  (`/atendimento/SUP-12`) é o que dá para mandar para alguém.
- **Meu dia** (a aba ao lado): os seus em aberto, os que estão **vencendo**, os **sem dono** na fila
  (com o botão **Assumir**), os que esperam o cliente, os que você observa e os agendados de hoje.
  Cada número leva para a lista já filtrada.
- **Lista** (dentro do painel, em **Quadro | Lista**): a busca (código, título, cliente, contato,
  telefone, o que o cliente disse — sem acento), os atalhos (Meus, Vencidos, Perto de vencer, Sem dono,
  Esperando o cliente), a situação, **Filtros** (etapa, responsável, prioridade, prazo, cliente,
  assunto, etiqueta e as datas), as colunas que ordenam e **Exportar (CSV)**. Os números do Meu dia
  abrem a lista de todos os painéis.
- O **sininho**, no rodapé do menu lateral, ao lado do seu nome (no celular, no alto): os avisos
  (recebeu um chamado, chegou na sua etapa, o prazo está vencendo, alguém citou você…). O tema e o
  Sair também ficam ali — no computador, a barra de cima saiu, para sobrar espaço.
- O aviso que chega com o Gestor aberto também aparece num **cartão** perto do sininho (no celular,
  embaixo da barra de cima), com **Abrir o chamado**. O cartão **fica até você abrir o chamado ou
  fechar no X** (fechar não marca como lido: continua no sininho). Aparecem os 3 mais novos; os outros
  esperam a vez, e **Fechar todos** limpa. Embaixo da lista do sininho, em **Além do sininho**: ligar e
  desligar o cartão e a **notificação do navegador** (a do Windows ou do Mac, que aparece mesmo com o
  Gestor em outra aba ou minimizado e também fica até você clicar ou fechar; o navegador pergunta se
  pode, e clicar nela abre o chamado). **Testar o aviso** mostra como chega. Vale para o navegador em
  que você ligou.

## 2. Abrir um chamado

**Abrir chamado** (no alto de qualquer tela do módulo) abre o formulário **numa janela por cima da
tela**, que fica como estava (o quadro com os filtros, a lista na mesma página). **Dentro de um
painel** (no quadro ou na lista), o chamado já nasce nele, sem escolher outro; fora (Painéis, Meu
dia), escolha o painel. Depois: o cliente, o contato (nome e WhatsApp), o título, o **relato do
cliente** — o que ele disse, nas palavras dele — e a **descrição** (o andamento e os dados técnicos).
Aberto, a janela vira a **ficha do chamado novo**; fechar volta para a tela. Com algo escrito, fechar
a janela (o X, o Esc, o clique fora ou **Cancelar**) pergunta antes de descartar. O Voltar do
navegador também fecha a janela.

- O que se abre aqui é **chamado** (o pedido ou a falha de um cliente). O **problema** — a mesma falha
  atingindo vários clientes (a operadora caiu, um defeito no sistema) — nasce na ficha de um deles:
  **Mais › Abrir um problema a partir deste…**, e esse chamado vira o primeiro incidente. O problema
  junta os incidentes, que fecham sem esperar por ele, e só resolve com a causa, a solução e a
  validação. (O **Registro**, Chamado ou Problema, saiu do Abrir chamado no 2.0.1.)
- Ao escolher o cliente, aparecem **os contatos dele**: um clique preenche o nome e o WhatsApp. **Novo
  contato** inclui ali mesmo (e já escolhe); o nome escrito à mão que não está na lista mostra
  **Salvar nos contatos**.
- Aparecem também os chamados recentes dele. **Se é o mesmo problema de antes, use
  "Reabrir este em vez de abrir outro"**: o cliente que volta à tarde com o mesmo ramal reabre o
  chamado da manhã.
- A **gravidade** sugere a **prioridade** (pela tela de Prazos). No painel que usa o **alcance** — ele
  nasce desligado, "por enquanto"; liga em Ajustes › Campos —, os dois juntos, pela matriz. Trocar a
  sugerida pede o motivo.
- **Observadores** (como no Helena): as pessoas que recebem o aviso de tudo o que acontece no chamado —
  a anotação, a mudança de etapa e de responsável, a espera, os campos (estes,
  juntos num aviso só enquanto não for lido). Põe ao abrir ou na ficha.
- **Etiquetas**: clique na caixa e a lista abre, como as outras listas do Gestor: procure, e um clique
  põe ou tira (a lista fica aberta para marcar mais de uma). O que você escreveu e não existe vira
  **Criar a etiqueta**: escolha a **cor** e crie. O **lápis** de cada uma (de quem cuida dos chamados)
  edita **o nome e a cor**, que valem em todos os chamados que têm a etiqueta. A que chega pelo robô,
  ou pela IA nasce cinza. Escrita de outro jeito ("cliente VIP" e "Cliente
  vip"), é a mesma etiqueta. Na ficha, a caixa é a mesma.
- O formulário mostra **só os campos que o painel usa**: os do sistema que estão ligados nele e, em
  **"Do painel …"**, os campos que a equipe criou para ele. O que é obrigatório para abrir vem com `*`;
  faltando, a tela diz o quê. (O robô, os agendados e as integrações abrem mesmo sem eles: quem
  completa é a equipe, na ficha.)
- **Avisar o cliente pelo WhatsApp** manda o número do chamado pelo número oficial. Vem desmarcado: o
  atendente decide.

O chamado também nasce **pelo botão "Abrir chamado" na conversa do LineChat** (já com o telefone e o
nome), **pelo robô** e **pelos agendados** (seção 5).

### Os contatos do cliente (Clientes › ficha do cliente › Contatos)

As pessoas do cliente com quem a equipe fala: o **nome**, o **WhatsApp**, o **e-mail** e o **cargo ou
setor**. Quem cuida do cadastro e quem trabalha nos chamados inclui e edita; quem só lê, vê.

- O mesmo WhatsApp não se repete entre os contatos ativos de um cliente.
- Nada se apaga: **desativar** tira o contato do Abrir chamado; os chamados que já têm o contato
  continuam com ele. **Ver os desativados** mostra os que saíram.
- Cada contato mostra quantos chamados o WhatsApp dele tem.
- O chamado que chega só com o WhatsApp (o robô, o botão na conversa) acha o cliente e o nome pelos
  contatos. Se o número está em dois clientes, o cliente não é adivinhado: a equipe escolhe.

## 3. A ficha do chamado

- **Relato do cliente**, **Descrição** (o andamento e os dados técnicos), **Solução** e **Causa**. O
  que a próxima etapa pede e está vazio fica marcado ("falta para ir para Resolvido").
- Um código citado no texto (SUP-12, ou um card antigo do LineChat como IS-4280) vira link.
- Do lado: a **empresa** e o **contato** (em **Editar**, os contatos do cliente: um clique troca; o
  contato escrito à mão ganha **Salvar nos contatos**), a **classificação** (os campos que o painel usa — assunto,
  tipo, gravidade, alcance, prioridade, produtos, operadoras —, os campos do próprio painel e as
  etiquetas), o responsável e os **observadores**, os **prazos**, o caso **na operadora** e o **tempo
  gasto**. O campo de texto longo do painel (ex.: "Como reproduzir") fica junto do relato.
- A barra de cima: **Assumir**, **Mover**, **Escalonar** (pede o motivo), **Esperar** o cliente ou a
  operadora (pede o motivo), **Avisar o cliente**, **Preencher com IA** e **Mais**
  (ligar a outro chamado, criar um filho, definir o pai, ligar a um problema, trocar de painel,
  reabrir, observar, lixeira). **Criar um filho** (e **Abrir um problema a partir deste**) abre o
  formulário do Abrir chamado numa janela por cima da ficha: aberto, a janela fecha e a ficha mostra o
  filho. **Avisar o cliente** mostra, antes de mandar, **como a mensagem chega**: dentro do modelo aprovado do WhatsApp oficial, com o
  nome do contato, o código e o seu texto (a quebra de linha vira " · ": o WhatsApp não aceita quebra
  dentro do modelo).
- **Citar um colega**: na anotação, escreva **@** e o começo do nome — a lista de quem vê o painel abre
  ali mesmo; as setas andam, **Enter** (ou o clique) escolhe e **Esc** fecha só a lista. O botão
  **Citar**, ao lado de Anexar, faz o mesmo. Embaixo da caixa aparece quem vai receber o aviso. Quem for
  citado recebe na hora, no sininho, no cartão na tela e no WhatsApp (se ligado em Avisos e WhatsApp),
  **mesmo sem ser observador**. Vale o nome inteiro ou só o primeiro, quando só uma pessoa se chama
  assim. Na anotação, a citação fica em destaque.
- A **linha do tempo**: as anotações (com anexos: até 5 arquivos de 10 MB; cole o print com Ctrl+V),
  o histórico de tudo e a **trajetória** (por onde o chamado passou, quanto tempo ficou em cada etapa e
  o motivo de cada escalonamento).

### As regras de andar

- Cada etapa pode exigir campos, os do sistema e os do painel (ex.: o Resolvido pede a solução e a
  causa; o Entregue do Desenvolvimento, a versão publicada). Faltando, a tela diz o quê.
- **Subir ou descer de nível (N1 → N2 → N3 → DEV) pede o motivo.** O DEV é o nível do
  desenvolvimento: o chamado fica com ele enquanto a correção anda (se quiser, num filho no painel
  Desenvolvimento).
- **O pai não fecha com filho aberto** — os filhos podem estar em outro painel (o Desenvolvimento).
- **O problema** junta os incidentes de clientes diferentes com a mesma causa e só resolve com a
  causa, a solução e a **validação**. O incidente fecha sem esperar o problema.
- **Esperando o cliente, o prazo para.** Esperando a operadora, o prazo **continua correndo**.
- O **Resolvido fecha sozinho** depois dos dias úteis do painel. Se o cliente escrever que não
  resolveu, quem atende reabre: o **Reabrir** da ficha, ou o **Reabrir este em vez de abrir outro** do
  Abrir chamado. (Desde o 2.0.1 a mensagem do cliente não reabre sozinha.)

## 4. Os Ajustes do módulo (Chamados › Ajustes)

| Aba | O que se arruma |
|---|---|
| **Painéis e etapas** | Criar e editar os painéis. Tudo de um painel fica numa janela só (**Novo painel** ou **Editar**): o nome, a sigla, a cor e quem vê; **as etapas** (nome, tipo, nível, o que é obrigatório, quem é avisado; arrastar ou as setas mudam a ordem); e as regras. O painel novo começa com Novo, Em andamento, Resolvido e Fechado, ou com as etapas de outro painel ("Começar com as etapas"). **Salvar** grava tudo junto: se uma etapa que sai tem chamados, a janela pergunta para onde eles vão, e até lá nada muda |
| **Campos** | Os campos **de cada painel** (escolha o painel em cima). **Os do sistema** — assunto, tipo, gravidade, alcance, produtos, operadoras — ligam e desligam em cada painel (o Desenvolvimento, por exemplo, não usa assunto; o **alcance** nasce desligado em todos, por enquanto); as opções do **Tipo** se editam aqui. **O Assunto** abre a árvore do painel (até 3 níveis, com descrição, checklist e de-para; **nasce em branco**: cole a lista da equipe, um por linha, no formato "Ramal - Configuração - Identidade"). **Novo campo** cria os do painel: texto curto, texto longo, número, data, sim/não ou lista (escolhe uma ou várias opções), com uma dica, e **obrigatório para abrir** ou **para entrar** nas etapas que você marcar. As setas mudam a ordem. Desligar ou desativar **não apaga**: some da tela e das regras, e o que os chamados já têm volta se o campo voltar. O tipo de um campo não muda depois de criado |
| **Etiquetas** | As etiquetas de todos os painéis, com a cor e em quantos chamados cada uma está: criar uma já com a cor, **Editar** o nome e a cor (valem em todos os chamados que a têm; o mesmo editar está no lápis da lista de etiquetas) e **tirar das sugestões** a que nenhum chamado usa |
| **Prazos** | O horário de atendimento, os feriados, os prazos por prioridade e a prioridade sugerida: a coluna **Só a gravidade** (o painel sem o alcance) e a matriz gravidade × alcance (o painel que usa o alcance) |
| **Avisos e WhatsApp** | No primeiro cartão, os dois números (o do cliente, oficial, e o da equipe), a chave e o **Testar**. **A mensagem ao cliente**: pelo **modelo aprovado** (o template do WhatsApp oficial — o único jeito de começar uma conversa) ou em texto livre (só até 24 horas da última mensagem do cliente; depois disso, vai o modelo). **Buscar os modelos no LineChat** traz os aprovados do número oficial; ao escolher um, o Gestor preenche o **id** (templateId) e as **variáveis**, e cada uma recebe um valor do chamado (o nome do contato, o código, o título, a empresa, o responsável, quem manda, **o que o atendente escreveu**) ou um texto fixo. O modelo com imagem, vídeo ou documento no cabeçalho pede o **endereço do arquivo** (https://). A prévia mostra a mensagem com um chamado de exemplo. **Quem fica com a conversa no LineChat**: a equipe (pelo nome) e, ligado, quem manda (pelo e-mail, o mesmo nos dois). Depois, quais avisos vão pela tela e pelo WhatsApp (inclusive o dos observadores: na tela, ligado; no WhatsApp, desligado de início). O **WhatsApp de cada pessoa** fica em **Administração › Usuários** (no Editar usuário; o "Receber os avisos dos chamados no WhatsApp" pausa sem apagar o número): aqui aparece quantos recebem |
| **Agendados** | O chamado que nasce sozinho (todo dia, toda semana, todo mês ou uma vez) |
| **Integrações** | As chaves de API, os webhooks, os sites que podem abrir o Gestor dentro deles e o link da conversa |
| **IA** | O provedor e a chave do **Preencher com IA** (é a mesma IA da Base de conhecimento) |

Painéis, campos, etiquetas, prazos, avisos e agendados: quem **cuida dos chamados**. Integrações e
IA: a **administração**.

## 5. Ligar com o LineChat e o n8n (Chamados › Ajustes › Integrações)

A tela já mostra cada endereço pronto para copiar, com o endereço deste Gestor.

1. **Crie uma chave de API** (ex.: "Robô do LineChat"). Ela aparece **uma vez só**: copie na hora. Se
   perder, revogue e crie outra. Uma chave para o robô e outra para o n8n deixa revogar uma sem parar
   a outra.
2. **O robô abre o chamado**: no robô do LineChat, um bloco de **webhook** que manda para
   `/api/atendimento/entrada/chamado`, com a chave no cabeçalho `Authorization: Bearer <chave>` (ou no
   fim do endereço, `?chave=<chave>`, se o bloco não aceitar cabeçalho). O corpo leva o título, o
   relato, o telefone, o nome e a sessão (as variáveis do LineChat) e, se quiser, os campos do painel
   pelo nome (`"campos": {"Sistema": "LinePBX"}`; numa lista, o nome da opção). A resposta traz o
   **código** do chamado, para o robô mandar ao cliente. A mesma conversa não abre dois chamados. O
   cliente vem pelo telefone: primeiro dos **contatos dos clientes**, depois do que o Gestor aprendeu
   dos chamados anteriores. O
   assunto (ou outro campo do sistema) que o painel não usa é ignorado; um campo que o painel não tem
   é recusado, e a resposta diz qual.
3. **O botão "Abrir chamado" na conversa**: nas **ações personalizadas** do LineChat, na conversa, o
   endereço `/atendimento/novo?telefone={{telefone_do_contato}}&nome=…&sessao=…` (a tela mostra
   inteiro). Confira o nome das variáveis no LineChat. Por esse endereço, numa aba nova, o Abrir
   chamado ocupa a aba inteira.
4. **Webhooks** (o Gestor avisa o n8n): o endereço `https://` do fluxo e os eventos (chamado criado,
   alterado, movido, anotação, resolvido, fechado). O **segredo** aparece uma vez: cada aviso vai
   assinado no cabeçalho `X-Gestor-Assinatura` (HMAC-SHA256 do corpo). **Testar** manda um aviso de
   teste.
5. **O Gestor dentro do LineChat**: inclua o endereço do LineChat em **Sites que podem abrir o Gestor**
   e crie, no LineChat, um **menu personalizado** (página interna) com o endereço `/atendimento`. Lá
   dentro, cada pessoa entra uma vez com o login do Gestor. O Safari (e navegador que bloqueia cookie de
   outro site) pode pedir o login de novo.
6. **O link da conversa**: o endereço da conversa no LineChat com `{sessao}` no lugar do número — é o
   que põe o link "Conversa no LineChat" na ficha.

**Na virada**, desligue (ou religue no Gestor) os dois fluxos do n8n que olham o Helena (IA Preenche
Chamado e Atualização de Card), para ninguém receber aviso em dobro.
