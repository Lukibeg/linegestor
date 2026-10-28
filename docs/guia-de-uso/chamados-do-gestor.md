# Painéis: os chamados do Gestor

Desde o Patch 2.0 os chamados nascem e andam no **Gestor**, em **Painéis** (no menu lateral, logo abaixo
do Calendário desde o 2.0.2; antes ficava dentro do Suporte e, até o 2.0.1, se chamava Chamados — o
Comercial também mora ali). O atalho **Suporte › Painel do Suporte** abre direto o quadro do Suporte. Os
chamados antigos continuam no LineChat; para consultar, **Suporte › Legado do Helena** abre neles,
na aba **Hoje** (as abas levam ao Período e aos relatórios). Os relatórios dos chamados do Gestor ficam na
vista **Relatórios** de cada painel (**Suporte › Relatórios** abre a do Suporte, desde o 2.1): veja
[Os Relatórios dos painéis](relatorios-dos-paineis.md).
A decisão inteira está em `docs/decisoes/0047-chamados-do-gestor.md`.
O Comercial usa um painel de **Vendas** (as negociações, com o valor, o Ganho e o Perdido): veja
[Vendas: o painel do Comercial](vendas.md).

---

## 1. O dia a dia

- **Todos** (a primeira aba, como a tela dos painéis do Helena): um cartão por painel (Suporte, Desenvolvimento…), com
  os números de agora (em aberto, vencidos, sem dono, os seus) e quantos estão em cada etapa. Clique no
  painel para abrir o **quadro**; cada número abre a lista já filtrada; **Configurar** (quem cuida dos
  chamados) abre a janela daquele painel, com as etapas e as regras; **Novo painel** cria outro.
- **Quadro**: o de um painel, uma coluna por etapa, lado a lado (as que não cabem, rolando para o lado). **Arraste** o
  cartão para mover; no celular ou pelo teclado, use **Mover** no pé do cartão. **A ordem dentro da etapa**
  (2.1.3): nos painéis que não contam prazo, arraste o cartão para cima ou para baixo na mesma coluna (uma
  linha mostra onde ele cai; no Mover, **Subir** e **Descer**); o que chega na etapa aparece no alto. No
  painel que conta prazo (o Suporte), o mais urgente vem primeiro. Em cima, numa linha
  só: a seta (volta aos painéis), **Quadro | Lista** (as duas vistas do painel, com os mesmos filtros),
  **Trocar** (outro painel), **Configurar**, a busca e **Filtros** (as caixas dos filtros aparecem
  quando pedidas; o que está filtrado fica escrito, com o X). O fechado mostra os 30 mais recentes (o
  resto, na lista).
- **Clicar num chamado** (no quadro, na lista, no Meu dia ou num aviso do sininho) abre a ficha numa
  **janela grande por cima da tela**, que continua embaixo do jeito que estava: fechar (o X, o Esc ou o
  Voltar do navegador) volta para ela. **Página inteira** abre a ficha sozinha — o endereço dela
  (`/atendimento/SUP-12`) é o que dá para mandar para alguém.
- **Meu dia** (a aba ao lado): os seus em aberto, os que estão **vencendo**, os **sem dono** na fila
  (com o botão **Assumir**), os que esperam o cliente, os que você observa, o **Hoje na agenda** (o que
  o [calendário](calendario.md) tem para hoje e quem está fora do escritório — 2.0.1) e os agendados de
  hoje. Cada número leva para a lista já filtrada. Desde o 2.0.2, o Meu dia também está no menu, no
  grupo Suporte, logo abaixo do Painel do Suporte.
- **Lista** (dentro do painel, em **Quadro | Lista**): a busca (código, título, cliente, contato,
  telefone, o que o cliente disse — sem acento), os atalhos (Meus, Vencidos, Perto de vencer, Sem dono,
  Esperando o cliente), a situação, **Filtros** (etapa, responsável, prioridade, prazo, cliente,
  assunto, etiqueta e as datas), as colunas que ordenam e **Exportar (CSV)**. Os números do Meu dia
  abrem a lista de todos os painéis.
- O **sininho** (**Avisos**), no rodapé do menu lateral, ao lado do seu nome (no celular, no alto): os
  avisos (recebeu um chamado, chegou na sua etapa, o prazo está vencendo, alguém citou você…) e, desde o
  2.0.2, os **lembretes do calendário** (com o ícone do calendário: o clique abre o evento). O tema e o
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
  nasce desligado, "por enquanto"; liga em Ajustes › Campos —, os dois juntos, pela matriz. Dá para
  escolher outra que não a sugerida, sem precisar dizer o motivo (2.2).
- **Observadores** (como no Helena): as pessoas que recebem o aviso de tudo o que acontece no chamado —
  a anotação, a mudança de etapa e de responsável, a espera, os campos (estes,
  juntos num aviso só enquanto não for lido). Põe ao abrir ou na ficha.
- **Etiquetas** (desde o 2.0.3, **cada painel tem as suas**): clique na caixa e a lista abre, como as
  outras listas do Gestor: procure, e um clique põe ou tira (a lista fica aberta para marcar mais de uma).
  A lista mostra só as etiquetas do painel do chamado. O que você escreveu e não existe vira **Criar a
  etiqueta**: escolha a **cor** e crie — ela nasce no painel. O **lápis** de cada uma (de quem cuida dos
  chamados) edita **o nome e a cor**, que valem nos chamados do painel que têm a etiqueta. A que chega
  pelo robô ou pela IA nasce cinza. Escrita de outro jeito ("cliente VIP" e "Cliente vip"), é a mesma
  etiqueta. Na ficha, a caixa é a mesma, e o botão **Etiquetas**, ao lado do Mover, abre a mesma lista. O
  chamado que passa para outro painel leva as etiquetas (as que faltam lá entram com a mesma cor).
- O formulário mostra **só os campos que o painel usa**: os do sistema que estão ligados nele e, em
  **"Do painel …"**, os campos que a equipe criou para ele. O que é obrigatório para abrir vem com `*`;
  faltando, a tela diz o quê. (O robô, os agendados e as integrações abrem mesmo sem eles: quem
  completa é a equipe, na ficha.)
- O **Avisar o cliente pelo WhatsApp** saiu no 2.2 (a pedido do Luan), aqui e na ficha. O robô do LineChat continua
  mandando o número do chamado na conversa.
- **Conversa no LineChat** (2.1, opcional): no **chamado ativo** — a equipe chamou o cliente, e o
  chamado não veio do robô —, cole o **link da conversa** (abra a conversa no LineChat e copie o endereço
  da barra) ou só o **código da sessão**. A tela diz logo a sessão que achou (ou o que está errado). Com
  ela, a ficha mostra o link da conversa e a **NIA lê o que foi conversado**. Também se liga depois, na
  ficha.

O chamado também nasce **pelo botão "Abrir chamado" na conversa do LineChat** (já com o telefone, o
nome e a conversa), **pelo robô** e **pelos agendados** (seção 5).

### Os contatos do cliente (Clientes › ficha do cliente › Contatos)

As pessoas do cliente com quem a equipe fala: o **nome**, o **WhatsApp**, o **e-mail** e o **cargo ou
setor**. Quem cuida do cadastro e quem trabalha nos chamados inclui e edita; quem só lê, vê.

- O **cargo ou setor** se escolhe numa lista (2.0.2): Proprietário ou sócio, Diretoria, Gerência,
  Administrativo, Financeiro, Comercial, Compras, Atendimento, Pós-vendas, Recepção, RH e TI, ou **Sem
  cargo**. A lista fica em **Administração › Catálogos › Cargos dos contatos**: lá a administração inclui um
  cargo, renomeia (o nome novo vai para os contatos que o têm) e desativa (sai da lista; quem já tem fica
  com ele). O contato que já tinha um cargo escrito à mão, fora da lista, continua com ele ("Engenharia
  (fora da lista)") até alguém trocar.
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
  contato escrito à mão ganha **Salvar nos contatos**) com a **conversa no LineChat** — o link e a sessão;
  desde o 2.1, **Ligar a conversa do LineChat** (o chamado sem conversa, como o ativo) e **Trocar**
  (colar o link de outra conversa, ou **Tirar a conversa**); vai para o histórico —, a **classificação** (os campos que o painel usa — assunto,
  tipo, gravidade, alcance, prioridade, produtos, operadoras —, os campos do próprio painel e as
  etiquetas), os **prazos**, o **Na agenda** (a visita ou a virada
  ligada ao chamado, e o **Agendar**, que põe uma no [calendário](calendario.md) já com o chamado, o
  cliente e o painel — 2.0.1), o caso **na operadora** e o **tempo gasto**. O campo de texto longo do
  painel (ex.: "Como reproduzir") fica junto do relato.
- A barra de cima: **Assumir**, o **Responsável** (quem está com o chamado; troca ali mesmo) e, colado nele, os
  **Observadores** (quem recebe os avisos; incluir, tirar com o X e o **Eu observo também** — 2.2), **Mover**,
  **Etiquetas**, **Agendar**, **Checklist** (quando ainda não tem), **Ligações** (ligar a outro chamado, criar um
  filho, definir o pai), **Escalonar** (pede o motivo), **Esperar** o cliente ou a operadora (pede o motivo),
  a **NIA** (abaixo), **Preencher com IA** e **Mais** (ligar a um problema, trocar de painel,
  reabrir, lixeira). O **Copiar o link** fica ao lado do código, no alto (2.2). Quem só lê o chamado (sem a barra)
  vê o responsável e os observadores num cartão, ao lado.
- **Para sair do Novo, o chamado precisa de um responsável** (2.2): sem ninguém, o Mover diz "falta:
  Responsável", e a janela do quadro pergunta quem fica com ele. O Assumir faz tudo de uma vez.
- **A ficha mostra só o que tem** (2.2): o checklist, os filhos e ligações e a agenda vazios não aparecem; voltam
  com o primeiro item, ligação ou evento. A linha do tempo abre nas **Anotações** (depois Histórico, Trajetória
  e Tudo).
- **Mais de um contato e de uma conversa** (2.2): no cartão do contato, **Mais um contato** e **Mais uma
  conversa**. Os de cima continuam os principais (o aviso ao cliente e a NIA usam eles); o robô acha o chamado
  por qualquer conversa ligada a ele.
- **O assunto em pastas** (2.2): o assunto com outros dentro (Operadora, Operadora › VC1) é só o título do grupo;
  escolhe-se o de dentro. Nos filtros, a pasta filtra tudo o que está nela.
- Abrir um chamado de dentro de outro (o desenho, um código no texto) e fechar no **X** volta para o de antes. **Criar um filho** (e **Abrir um problema a partir deste**) abre o
  formulário do Abrir chamado numa janela por cima da ficha: aberto, a janela fecha e a ficha mostra o
  filho.
- **A NIA** (2.1, no lugar de etiquetar à mão): **Preencher com a NIA** pede à NIA (a IA do suporte,
  no n8n) para ler a conversa e preencher o chamado. Por baixo, o botão põe a etiqueta **NIA -
  PREENCHER**, como antes — o fluxo da NIA não muda. O botão diz em que pé está: **NIA preenchendo…** (a
  ficha se atualiza sozinha quando ela termina, com um aviso), **NIA preencheu** (verde) ou **NIA não
  preencheu** (vermelho). O clique mostra **quando ela preencheu, quando foi pedida e por quem, o que
  ela mudou e quantas anotações fez**, e o **Preencher de novo** (ou **Tentar de novo**). Vale também
  para o chamado que foi etiquetado à mão antes do botão. Pedido sem resposta, dá para pedir de novo
  depois de 10 minutos. **Sem a conversa do LineChat**, o botão avisa antes (a NIA lê só o que está
  escrito no chamado) e oferece **Ligar a conversa**. A negociação não tem a NIA.
- **Citar um colega**: na anotação, escreva **@** e o começo do nome — a lista de quem vê o painel abre
  ali mesmo; as setas andam, **Enter** (ou o clique) escolhe e **Esc** fecha só a lista. O botão
  **Citar**, ao lado de Anexar, faz o mesmo. Embaixo da caixa aparece quem vai receber o aviso. Quem for
  citado recebe na hora, no sininho, no cartão na tela e no WhatsApp (se ligado em Avisos e WhatsApp),
  **mesmo sem ser observador**. Vale o nome inteiro ou só o primeiro, quando só uma pessoa se chama
  assim. Na anotação, a citação fica em destaque.
- A **linha do tempo**: as anotações (com anexos: até 5 arquivos de 10 MB; cole o print ou o arquivo
  copiado da pasta com Ctrl+V, ou arraste; a imagem abre grande e o **PDF abre na tela, sem baixar**),
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

## 4. Os Ajustes do módulo (Painéis › Ajustes)

| Aba | O que se arruma |
|---|---|
| **Painéis e etapas** | Criar e editar os painéis. Tudo de um painel fica numa janela só (**Novo painel** ou **Editar**): o nome, a sigla, a cor e quem vê; **as etapas** (nome, tipo, nível, o que é obrigatório, quem é avisado; arrastar ou as setas mudam a ordem); **os campos** que o chamado do painel usa (2.1.2, a aba **Os campos**: desligue o que não serve, até o cliente e o contato, o relato, a solução e a causa e a prioridade — sem a prioridade, o painel não conta prazo); e as regras. O painel novo começa com Novo, Em andamento, Resolvido e Fechado, ou com as etapas de outro painel ("Começar com as etapas"). **Salvar** grava tudo junto: se uma etapa que sai tem chamados, a janela pergunta para onde eles vão, e até lá nada muda |
| **Campos** | Os campos **de cada painel** (escolha o painel em cima). **Os do sistema** — assunto, tipo, gravidade, alcance, produtos, operadoras e, no painel de Gestão (2.1.2), cliente e contato, relato, solução e causa e prioridade — ligam e desligam em cada painel (também na aba Os campos da janela do painel) (o Desenvolvimento, por exemplo, não usa assunto; o **alcance** nasce desligado em todos, por enquanto); as opções do **Tipo** se editam aqui. **O Assunto** abre a árvore do painel (até 3 níveis, com descrição, checklist e de-para; **nasce em branco**: cole a lista da equipe, um por linha, no formato "Ramal - Configuração - Identidade"). **Novo campo** cria os do painel: texto curto, texto longo, número, data, sim/não ou lista (escolhe uma ou várias opções), com uma dica, e **obrigatório para abrir** ou **para entrar** nas etapas que você marcar. As setas mudam a ordem. Desligar ou desativar **não apaga**: some da tela e das regras, e o que os chamados já têm volta se o campo voltar. O tipo de um campo não muda depois de criado |
| **Etiquetas** | As etiquetas **de cada painel** (escolha o painel em cima, desde o 2.0.3), com a cor e em quantos chamados dele cada uma está: criar uma já com a cor, **Editar** o nome e a cor (valem nos chamados do painel que a têm; o mesmo editar está no lápis da lista de etiquetas) e **tirar das sugestões** a que nenhum chamado do painel usa |
| **Prazos** | O horário de atendimento, os feriados, os prazos por prioridade e a prioridade sugerida: a coluna **Só a gravidade** (o painel sem o alcance) e a matriz gravidade × alcance (o painel que usa o alcance) |
| **Avisos e WhatsApp** | No primeiro cartão, os dois números (o do cliente, oficial, e o da equipe), a chave e o **Testar**. **A mensagem ao cliente**: pelo **modelo aprovado** (o template do WhatsApp oficial — o único jeito de começar uma conversa) ou em texto livre (só até 24 horas da última mensagem do cliente; depois disso, vai o modelo). **Buscar os modelos no LineChat** traz os aprovados do número oficial; ao escolher um, o Gestor preenche o **id** (templateId) e as **variáveis**, e cada uma recebe um valor do chamado (o nome do contato, o código, o título, a empresa, o responsável, quem manda, **o que o atendente escreveu**) ou um texto fixo. O modelo com imagem, vídeo ou documento no cabeçalho pede o **endereço do arquivo** (https://). A prévia mostra a mensagem com um chamado de exemplo. **Quem fica com a conversa no LineChat**: a equipe (pelo nome) e, ligado, quem manda (pelo e-mail, o mesmo nos dois). Depois, quais avisos vão pela tela e pelo WhatsApp (inclusive o dos observadores: na tela, ligado; no WhatsApp, desligado de início), e **a mensagem de cada aviso no WhatsApp** (2.0.2; abaixo). O **WhatsApp de cada pessoa** fica em **Administração › Usuários** (no Editar usuário; o "Receber os avisos dos chamados no WhatsApp" pausa sem apagar o número): aqui aparece quantos recebem |
| **Agendados** | O chamado que nasce sozinho (todo dia, toda semana, todo mês ou uma vez) |
| **Integrações** | O robô do LineChat e o **mapa do robô** (os parâmetros que chegam no webhook, de onde vem cada campo do chamado e como deve chegar o webhook), as chaves de API, os webhooks, os sites que podem abrir o Gestor dentro deles e o link da conversa |
| **IA** | O provedor e a chave do **Preencher com IA** (é a mesma IA da Base de conhecimento) e, desde o 2.1, **A NIA na ficha**: liga e desliga o botão da NIA e diz as três etiquetas do combinado com o fluxo do n8n — a de pedir (que o botão põe), a de pronto e a de erro (que a NIA põe); de fábrica, as do Helena |

Painéis, campos, etiquetas, prazos, avisos e agendados: quem **cuida dos chamados**. Integrações e
IA: a **administração**.

### A mensagem de cada aviso no WhatsApp (2.0.2)

Em **Avisos e WhatsApp**, o cartão **A mensagem de cada aviso no WhatsApp** diz como cada aviso chega no
WhatsApp da equipe. O link **a mensagem**, ao lado de cada aviso na tabela "Quais avisos vão por onde",
leva direto a ele.

1. Escolha o aviso na lista (no celular, na caixa **Aviso**). Ele abre no dos **Observadores**.
2. Escreva o texto. Os botões **Pôr no texto** põem a variável onde está o cursor:
   - do chamado: `{painel}`, `{etapa}`, `{codigo}`, `{titulo}`, `{prioridade}`, `{cliente}`,
     `{contato}`, `{responsavel}`, `{assunto}`, `{relato}` e `{link}`;
   - do que aconteceu: `{aviso}` (a frase do sininho), `{quem}` (quem fez), `{nota}` (a anotação inteira,
     na citação e no observador) e `{novidade}` (só no observador: o que mudou, como "Moveu para N2"; na
     anotação fica vazia, porque a nota já diz);
   - no lembrete do calendário: as do evento (`{evento}`, `{quando}`, `{local}`…).
3. `*assim*` sai em **negrito** e `_assim_`, em *itálico*, como no WhatsApp. A **prévia** embaixo mostra
   como chega, com um exemplo.
4. **A linha em que as variáveis vierem vazias não vai**: num chamado sem cliente, a linha do Cliente
   some. A linha só de texto vai sempre.
5. **Salvar**, no pé da tela. A variável escrita errada (`{cotato}`) aparece em vermelho e não deixa
   salvar.

**Mandar o exemplo para mim** manda a mensagem da tela (mesmo antes de salvar), com o exemplo, para o
seu WhatsApp (o de Administração › Usuários), com uma primeira linha dizendo que é um teste. **Voltar à
padrão** desfaz o que foi escrito. A padrão segue a do fluxo antigo do n8n:

```
🔎 *Painel:* Suporte
📌 *Card:* SUP-12 · LineChat - Labchecap - MarIA Espirometria
📝 *Nota:* Encaminhado para Luan
👤 *Quem:* Lúcio Andrade
👨‍💼 *Cliente:* Labchecap
🔗 *Link do Card/Painel:* https://gestao.inglinesystems.com.br/atendimento/SUP-12
```

O sininho continua com a frase curta. Para os observadores receberem pelo WhatsApp, marque o WhatsApp do
aviso deles em "Quais avisos vão por onde" (vem desmarcado).

## 5. Ligar com o LineChat e o n8n (Painéis › Ajustes › Integrações)

A tela já mostra cada endereço pronto para copiar, com o endereço deste Gestor.

1. **Crie uma chave de API** (ex.: "Robô do LineChat"). Ela aparece **uma vez só**: copie na hora. Se
   perder, revogue e crie outra. Uma chave para o robô e outra para o n8n deixa revogar uma sem parar
   a outra.
2. **O robô abre o chamado**: no robô do LineChat, um bloco **Enviar webhook** que manda para
   `/api/atendimento/entrada/robo?chave=<chave>` — a chave vai no fim do endereço, porque o bloco não
   aceita cabeçalho (outro sistema pode mandar no cabeçalho `Authorization: Bearer <chave>`). O Gestor
   guarda só o **nome** da chave: ela não vai para o último pedido, nem para a auditoria, nem para os
   registros do servidor e do Caddy (lá ela aparece como `REDACTED`). Não precisa montar o corpo: o
   bloco manda o JSON da conversa do jeito dele (o contato, a conversa, as perguntas e os menus do
   robô, a última mensagem), e o **mapa do robô**, logo abaixo na tela, diz quais parâmetros chegam e de
   onde sai cada campo do chamado. Dá para mandar mais coisas no endereço, depois da chave
   (`&setor=suporte`): cada uma vira um parâmetro do mapa (`endereço: setor`). A mesma conversa não abre
   dois chamados: o relato novo vira anotação no que já está aberto.
   O cliente vem pelo que o mapa mandar (o nome ou o CNPJ) ou, sem achar, pelo telefone: primeiro dos
   **contatos dos clientes**, depois do que o Gestor aprendeu dos chamados anteriores.

   **A resposta** é sempre **HTTP 200** (o bloco conta o 201 como falha), no formato dele:
   `{"response":"CHAMADO_ABERTO","messages":[{"text":"Seu chamado foi registrado com o número *SUP-1*. Guarde este número caso precise falar sobre ele depois."}]}`
   — também quando a conversa já tinha chamado aberto (vai o número dele) — ou
   `{"response":"CHAMADO_FALHOU"}`, quando não deu para abrir (o porquê fica no último pedido, no mapa).
   No bloco, crie as duas respostas, `CHAMADO_ABERTO` e `CHAMADO_FALHOU`, cada uma com a sua saída. A
   chave errada (ou revogada) responde 401, e o bloco segue pela saída de falha dele.
3. **O mapa do robô** diz o que chega no webhook e o que vira chamado — tudo na tela, sem mexer em
   código —, em três partes numeradas. Em cima, **Conferir com** escolhe o pedido com que tudo é
   conferido: o **último pedido do robô** (o Gestor guarda o último, com o que aconteceu), **um pedido
   fictício** (no formato do LineChat, com perguntas inventadas) ou **um pedido colado** (o JSON que o
   LineChat mostra no histórico do bloco e, se quiser, o endereço que ele chamou, para os parâmetros do
   endereço; a chave, se vier junto, fica de fora). Nada é aberto nem salvo até o **Salvar o mapa**.
   - **1 · O que chega no webhook** — os **parâmetros**: o que o Gestor lê do pedido, cada um com um
     **nome** curto (`empresa`), **de onde vem** no pedido e um **exemplo**. **Incluir parâmetro** ›
     **Escolher no pedido** lista o que o pedido tem (as perguntas e os menus do robô com a pergunta ao
     lado, o contato, a conversa, o endereço) e já sugere o nome e o exemplo; ou escreva a origem:
     `pergunta: <o texto da pergunta>`, `menu: <o texto do menu>`, `endereço: setor` (de
     `…/robo?chave=…&setor=suporte`) ou o caminho no JSON (`contact.email`). **+ uma alternativa**
     junta outra com `||`: vale a primeira que vier, e `"texto"` no fim é fixo. Ao lado de cada
     parâmetro, se ele **veio no pedido** (e com que valor) e **em que campos** está. **Editar** com
     outro nome muda os campos junto; **Tirar** um parâmetro que está em algum campo pergunta antes e
     diz onde: o campo fica com o `{{nome}}` sem valor (o aviso "não veio" aparece embaixo dele) até
     você trocar. O mapa de fábrica já vem com quatro: `nome`, `whatsapp`, `conversa` e `mensagem` (a
     última mensagem do cliente).

     Embaixo, **Como deve chegar o webhook**: o endereço e o JSON **inteiro**, do jeito que o bloco
     Enviar webhook manda (`[{ "sessionId", "session", "contact", "questions", "menus", … }]`), com
     cada lugar que o Gestor lê marcado ao lado (`← {{nome}}`, ou o campo que lê direto). As perguntas
     aparecem com o código de verdade do bloco (`cb-a35e88f1-qst-…`). O que não veio no pedido entra no
     lugar onde deve chegar, com o exemplo do parâmetro, **em amarelo** — a pergunta que o robô ainda
     não faz entra num bloco com o código por preencher (`cb-…-qst-…`). O que o Gestor não lê fica
     recolhido na tela (`{ … }`, "… e mais 11"); o **Copiar** leva o JSON inteiro. E se um campo lê o
     que não está no pedido nem é parâmetro (um nome escrito errado, um parâmetro que saiu), o aviso
     embaixo diz qual.
   - **2 · O que vira chamado** — os campos (painel, título, relato, WhatsApp, nome, conversa,
     etiquetas e, em **Mais campos**, descrição, cliente, assunto, prioridade e os campos do painel):
     cada um é um texto com os parâmetros entre `{{ }}` — `Atendimento de {{nome}}`,
     `Empresa: {{empresa}}`. O botão **Variável** mostra os parâmetros primeiro e, embaixo, o resto do
     pedido (o que não virou parâmetro também vale direto: `{{contact.email}}`, `{{pergunta: …}}`); a
     escolhida entra onde está o cursor. Embaixo de cada campo, o que sai com o pedido.
   - **3 · Como fica o chamado** — o chamado que o pedido abriria (com o cliente, o assunto e as opções
     achados), o que ficaria de fora e a resposta inteira ao robô.

   Dicas:
   - **A pergunta pelo texto**: a resposta de uma pergunta entra pela origem
     `pergunta: Por favor nos informe brevemente o motivo do seu contato` (`menu: …` nos menus) — é o
     que o **Escolher no pedido** põe. O código do bloco (`questions.cb-…-qst-….answer`) muda de uma
     cópia do robô para outra (a de teste e a de produção); o texto da pergunta, não. Um pedaço do
     texto também vale, se só uma pergunta o tiver. Pelo código do bloco ainda dá (a lista oferece
     embaixo).
   - `a || b || c` usa a primeira que vier com valor (quantas alternativas quiser, na origem do
     parâmetro ou no campo: `{{empresa || "sem empresa"}}`). O campo cujos parâmetros vieram todos vazios
     fica vazio (o "Setor: " sozinho não aparece). **Nas etiquetas, cada uma vale por si**:
     `robô, {{setor}}` sem o setor fica com a etiqueta robô.
   - **O parâmetro que não vier** (o código de outra cópia do robô, a pergunta que mudou de texto)
     deixa o campo vazio, e o chamado abre do mesmo jeito: o último pedido e a auditoria dizem quais não
     vieram, e na tela o aviso aparece ao lado do parâmetro e embaixo do campo.
   - **A mensagem ao cliente** (no fim dos campos) é a que volta na resposta: `{codigo}` é o número do
     chamado, `{contato}` o nome do contato, e os parâmetros também valem (`Olá, {{nome}}!`). Vazia, o
     robô segue sem mensagem.
   - O **assunto** acha pelo caminho, pelo nome ou pelo **de-para** do assunto: ponha a resposta do
     menu ("Suporte Técnico") no de-para (Ajustes › Campos › Assunto) e ela vira o assunto.
   - Nos **campos de lista**, a resposta enfeitada do menu ("☎️ LinePBX: Plataforma de Voz") vale pela
     opção que aparece nela (LinePBX), se for uma só.
   - O que não bate (o assunto que não existe, a opção que não é do campo, o telefone que não é número)
     **fica de fora, e o chamado abre do mesmo jeito**: a auditoria e o último pedido dizem o quê. Se o
     robô mudar (ou for outro sistema), é só mudar o mapa.
   - Outro sistema que monta o próprio JSON (o n8n, um script) pode mandar no **formato do Gestor**, em
     `/api/atendimento/entrada/chamado` (o título, o relato, a descrição, o telefone, o nome, a sessão, o
     assunto, a prioridade, as etiquetas e os campos do painel pelo nome: `"campos": {"Sistema":
     "LinePBX"}`). Ali é mais rígido: o painel, o assunto ou o campo que não existe recusa o pedido, e a
     resposta (400) diz qual.
4. **O botão "Abrir chamado" na conversa**: nas **ações personalizadas** do LineChat, na conversa, o
   endereço `/atendimento/novo?telefone={{telefone_do_contato}}&nome=…&sessao=…` (a tela mostra
   inteiro). Confira o nome das variáveis no LineChat. Por esse endereço, numa aba nova, o Abrir
   chamado ocupa a aba inteira.
5. **Webhooks** (o Gestor avisa o n8n): o endereço `https://` do fluxo e os eventos (chamado criado,
   alterado, movido, anotação, resolvido, fechado). O **segredo** aparece uma vez: cada aviso vai
   assinado no cabeçalho `X-Gestor-Assinatura` (HMAC-SHA256 do corpo). **Testar** manda um aviso de
   teste.
   - Avisado, o n8n (a **NIA**, a IA do suporte) usa a chave de API para ler o chamado em
     `/api/atendimento/integracao/chamados/SUP-12` — com a **sessão do LineChat** (`sessaoId`), que leva
     à conversa — e as **opções de verdade** em `/api/atendimento/integracao/opcoes`: os assuntos ativos
     (com o caminho, como "Ramal › Configuração", e a sigla do painel), os produtos, os clientes, as opções
     do Tipo de cada painel, as gravidades e as prioridades. É com elas que a NIA monta o que a IA pode
     escolher (e a IA não inventa um assunto que não existe); depois grava de volta pelo `PATCH` do chamado
     e pelas anotações. Ler não vai para a auditoria.
   - O botão **Preencher com a NIA** da ficha (2.1) só põe a etiqueta de pedir: o aviso "chamado
     alterado" chega ao n8n com ela, como quando a equipe etiquetava. A NIA responde trocando pela etiqueta
     de pronto (ou de erro) — é por elas que o botão sabe que ela terminou. As etiquetas ficam em
     **Painéis › Ajustes › IA**. A conversa ligada à mão na ficha também chega pelo `sessaoId` (e o
     `PATCH` aceita `sessaoId`: o link da conversa ou o código da sessão).
6. **O Gestor dentro do LineChat**: inclua o endereço do LineChat em **Sites que podem abrir o Gestor**
   e crie, no LineChat, um **menu personalizado** (página interna) com o endereço `/atendimento`. Lá
   dentro, cada pessoa entra uma vez com o login do Gestor. O Safari (e navegador que bloqueia cookie de
   outro site) pode pedir o login de novo.
7. **O link da conversa**: o endereço da conversa no LineChat com `{sessao}` no lugar do número — é o
   que põe o link "Conversa no LineChat" na ficha, e o que acha a sessão no link colado à mão (o
   chamado ativo, 2.1). Sem ele, o link colado vale pelo código da sessão que estiver nele.

**Na virada**, desligue (ou religue no Gestor) os dois fluxos do n8n que olham o Helena (IA Preenche
Chamado e Atualização de Card), para ninguém receber aviso em dobro.
