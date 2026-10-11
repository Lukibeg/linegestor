# Chamados (o módulo do Gestor)

Desde o Patch 1.10 os chamados nascem e andam no **Gestor**, no menu **Chamados**. Os chamados
antigos continuam no LineChat, para consulta (menu **Chamados do LineChat**, com os relatórios).
A decisão inteira está em `docs/decisoes/0047-chamados-do-gestor.md`.

---

## 1. O dia a dia

- **Painéis** (a primeira tela, como no Helena): um cartão por painel (Suporte, Desenvolvimento…), com
  os números de agora (em aberto, vencidos, sem dono, os seus) e quantos estão em cada etapa. Clique no
  painel para abrir o **quadro**; cada número abre a lista já filtrada; **Configurar** (quem cuida dos
  chamados) abre a janela daquele painel, com as etapas e as regras; **Novo painel** cria outro.
- **Quadro**: o de um painel, uma coluna por etapa. **Arraste** o cartão para mover; no celular ou pelo
  teclado, use **Mover** no pé do cartão. Em cima, numa linha só: **Painéis** (volta à primeira tela),
  **Trocar** (o quadro de outro painel), a busca e **Filtros** (as caixas dos filtros aparecem quando
  pedidas; o que está filtrado fica escrito, com o X). O fechado mostra os 30 mais recentes (o resto,
  na lista).
- **Clicar num chamado** (no quadro, na lista, no Meu dia ou num aviso do sininho) abre a ficha numa
  **janela grande por cima da tela**, que continua embaixo do jeito que estava: fechar (o X, o Esc ou o
  Voltar do navegador) volta para ela. **Página inteira** abre a ficha sozinha — o endereço dela
  (`/atendimento/SUP-12`) é o que dá para mandar para alguém.
- **Meu dia** (a aba ao lado): os seus em aberto, os que estão **vencendo**, os **sem dono** na fila
  (com o botão **Assumir**), os que esperam o cliente, os que você acompanha e os agendados de hoje.
  Cada número leva para a lista já filtrada.
- **Lista**: a busca (código, título, cliente, contato, telefone, o que o cliente disse — sem acento),
  os atalhos (Meus, Vencidos, Perto de vencer, Sem dono, Esperando o cliente), **Filtros** (painel,
  etapa, responsável, prioridade, prazo, cliente, assunto, etiqueta e as datas), as colunas que ordenam
  e **Exportar (CSV)**.
- O **sininho**, no rodapé do menu lateral, ao lado do seu nome (no celular, no alto): os avisos
  (recebeu um chamado, chegou na sua etapa, o prazo está vencendo, o cliente respondeu…). O tema e o
  Sair também ficam ali — no computador, a barra de cima saiu, para sobrar espaço.

## 2. Abrir um chamado

**Abrir chamado** (no alto de qualquer tela do módulo). Escolha o painel, o cliente, o contato (nome
e WhatsApp), o título e o **relato do cliente** — o que ele disse, nas palavras dele.

- Ao escolher o cliente, aparecem os chamados recentes dele. **Se é o mesmo problema de antes, use
  "Reabrir este em vez de abrir outro"**: o cliente que volta à tarde com o mesmo ramal reabre o
  chamado da manhã.
- **Gravidade** e **alcance** sugerem a **prioridade** (pela matriz da tela de Prazos). Trocar a
  sugerida pede o motivo.
- **Avisar o cliente pelo WhatsApp** manda o número do chamado pelo número oficial. Vem desmarcado: o
  atendente decide.

O chamado também nasce **pelo botão "Abrir chamado" na conversa do LineChat** (já com o telefone e o
nome), **pelo robô** e **pelos agendados** (seção 5).

## 3. A ficha do chamado

- **Relato do cliente**, **Descrição** (o andamento e os dados técnicos), **Solução** e **Causa**. O
  que a próxima etapa pede e está vazio fica marcado ("falta para ir para Resolvido").
- Um código citado no texto (SUP-12, ou um card antigo do LineChat como IS-4280) vira link.
- Do lado: a **empresa** e o **contato**, a **classificação** (assunto, tipo, gravidade, alcance,
  prioridade, produtos, operadoras, etiquetas), o responsável e
  quem acompanha, os **prazos**, o caso **na operadora** e o **tempo gasto**.
- A barra de cima: **Assumir**, **Mover**, **Escalonar** (pede o motivo), **Esperar** o cliente ou a
  operadora (pede o motivo), **Avisar o cliente**, **Resposta pronta**, **Preencher com IA** e **Mais**
  (ligar a outro chamado, criar um filho, definir o pai, ligar a um problema, trocar de painel,
  reabrir, acompanhar, lixeira).
- A **linha do tempo**: as anotações (com anexos: até 5 arquivos de 10 MB; cole o print com Ctrl+V),
  o histórico de tudo e a **trajetória** (por onde o chamado passou, quanto tempo ficou em cada etapa e
  o motivo de cada escalonamento).

### As regras de andar

- Cada etapa pode exigir campos (ex.: o Resolvido pede a solução e a causa). Faltando, a tela diz o quê.
- **Subir ou descer de nível (N1 → N2) pede o motivo.**
- **O pai não fecha com filho aberto** — os filhos podem estar em outro painel (o Desenvolvimento).
- **O problema** junta os incidentes de clientes diferentes com a mesma causa e só resolve com a
  causa, a solução e a **validação**. O incidente fecha sem esperar o problema.
- **Esperando o cliente, o prazo para.** Esperando a operadora, o prazo **continua correndo**.
- O **Resolvido fecha sozinho** depois dos dias úteis do painel. A mensagem do cliente reabre — menos
  "obrigado".

## 4. Os Ajustes do módulo (Chamados › Ajustes)

| Aba | O que se arruma |
|---|---|
| **Painéis e etapas** | Criar e editar os painéis. Tudo de um painel fica numa janela só (**Novo painel** ou **Editar**): o nome, a sigla, a cor e quem vê; **as etapas** (nome, tipo, nível, o que é obrigatório, quem é avisado; arrastar ou as setas mudam a ordem); e as regras. O painel novo começa com Novo, Em andamento, Resolvido e Fechado, ou com as etapas de outro painel ("Começar com as etapas"). **Salvar** grava tudo junto: se uma etapa que sai tem chamados, a janela pergunta para onde eles vão, e até lá nada muda |
| **Assuntos** | A árvore (até 3 níveis), com descrição ("quando usar"), checklist e de-para. **Nasce em branco**: cole a lista da equipe quando ela fechar (um por linha, no formato "Ramal - Configuração - Identidade") |
| **Prazos** | O horário de atendimento, os feriados, os prazos por prioridade e a matriz gravidade × alcance |
| **Avisos e WhatsApp** | Os dois números (o do cliente, oficial, e o da equipe), o número de cada pessoa, quais avisos vão pela tela e pelo WhatsApp, e o teste |
| **Respostas prontas** | O texto e o que ela faz no chamado (avisa o cliente, move, marca a espera, põe a etiqueta, assume) |
| **Agendados** | O chamado que nasce sozinho (todo dia, toda semana, todo mês ou uma vez) |
| **Integrações** | As chaves de API, os webhooks, os sites que podem abrir o Gestor dentro deles e o link da conversa |
| **IA** | O provedor e a chave do **Preencher com IA** (é a mesma IA da Base de conhecimento) |

Painéis, assuntos, prazos, avisos, respostas e agendados: quem **cuida dos chamados**. Integrações e
IA: a **administração**.

## 5. Ligar com o LineChat e o n8n (Chamados › Ajustes › Integrações)

A tela já mostra cada endereço pronto para copiar, com o endereço deste Gestor.

1. **Crie uma chave de API** (ex.: "Robô do LineChat"). Ela aparece **uma vez só**: copie na hora. Se
   perder, revogue e crie outra. Uma chave para o robô e outra para o n8n deixa revogar uma sem parar
   a outra.
2. **O robô abre o chamado**: no robô do LineChat, um bloco de **webhook** que manda para
   `/api/atendimento/entrada/chamado`, com a chave no cabeçalho `Authorization: Bearer <chave>` (ou no
   fim do endereço, `?chave=<chave>`, se o bloco não aceitar cabeçalho). O corpo leva o título, o
   relato, o telefone, o nome e a sessão (as variáveis do LineChat). A resposta traz o **código** do
   chamado, para o robô mandar ao cliente. A mesma conversa não abre dois chamados.
3. **O botão "Abrir chamado" na conversa**: nas **ações personalizadas** do LineChat, na conversa, o
   endereço `/atendimento/novo?telefone={{telefone_do_contato}}&nome=…&sessao=…` (a tela mostra
   inteiro). Confira o nome das variáveis no LineChat.
4. **O cliente respondeu** (pelo n8n): `/api/atendimento/entrada/mensagem` com o telefone, o texto e
   a sessão — reabre o Resolvido, menos agradecimento, e avisa o responsável.
5. **Webhooks** (o Gestor avisa o n8n): o endereço `https://` do fluxo e os eventos (chamado criado,
   alterado, movido, anotação, resolvido, fechado). O **segredo** aparece uma vez: cada aviso vai
   assinado no cabeçalho `X-Gestor-Assinatura` (HMAC-SHA256 do corpo). **Testar** manda um aviso de
   teste.
6. **O Gestor dentro do LineChat**: inclua o endereço do LineChat em **Sites que podem abrir o Gestor**
   e crie, no LineChat, um **menu personalizado** (página interna) com o endereço `/atendimento`. Lá
   dentro, cada pessoa entra uma vez com o login do Gestor. O Safari (e navegador que bloqueia cookie de
   outro site) pode pedir o login de novo.
7. **O link da conversa**: o endereço da conversa no LineChat com `{sessao}` no lugar do número — é o
   que põe o link "Conversa no LineChat" na ficha.

**Na virada**, desligue (ou religue no Gestor) os dois fluxos do n8n que olham o Helena (IA Preenche
Chamado e Atualização de Card), para ninguém receber aviso em dobro.
