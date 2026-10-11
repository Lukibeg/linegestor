# 0047 — Os chamados passam a morar no Gestor (o módulo Chamados)

**Contexto.** A equipe usa o **LineChat** (a plataforma Helena com a marca Ingline) para vender e
também como a plataforma dos chamados internos e de suporte, e acumulou queixas: N1, N2 e N3 que se
perdem ao fechar, prioridade como etiqueta, pai e filho sem bloqueio, nada de prazo nem de pausa,
assuntos sem ordem e sem descrição, nenhum histórico do escalonamento, nenhuma ligação com o
cadastro. Em 10/10 o Luan mandou o pacote de melhorias da equipe (o .docx "Reforma painel de
chamados": Eider, Luciu, Miguel e Carlos) e pediu um módulo de chamados próprio no Gestor. O painel do
Helena foi mapeado só olhando (os painéis, as etapas, o card, a API, os webhooks, o robô, as ações
personalizadas, os fluxos do n8n), a pesquisa de outras plataformas trouxe as boas práticas (ITIL,
prioridade por impacto × urgência, prazo que só para esperando o cliente, Resolvido → Fechado), e a
página de escopo (8 decisões e 33 ideias) foi marcada por ele em 10/10. O documento "Prioridade e
prazos dos chamados" (o ICI-12) ficou com a equipe para preencher; o que está nele hoje são as
sugestões, e a tela de Prazos já nasce com elas.

Isto **revê a decisão 0029** ("o Kanban continua no LineChat; o Gestor só lê"): os chamados novos
nascem e andam no Gestor. A cópia de leitura do painel do LineChat continua, para consultar os
antigos (o menu passa a chamá-la **Chamados do LineChat**), com os 20 relatórios e o envio diário
como estão. E **revê a 0016** num ponto: os cabeçalhos que impediam o Gestor de abrir dentro de outro
sistema saíram do Caddy (abaixo). O Luan foi avisado das duas antes.

**Decisão.**

- **Um módulo novo, Chamados** (menu Chamados, endereço `/atendimento`). A primeira tela são os
  **Painéis**, como no Helena (o pedido dele na prévia: com muitos painéis, alternar por abas não fica
  bom): um cartão por painel com os números de agora e as etapas, que abre o **quadro** daquele painel
  (com **Trocar**, para ir a outro) e leva às configurações dele. Ao lado, o **Meu dia** e a **Lista**;
  e a **ficha do chamado**, **Abrir chamado** e os **Ajustes** do módulo. No módulo, a tela usa a
  largura toda. No computador, a barra de cima do sistema saiu: o sininho, o tema e o Sair ficam no
  rodapé do menu lateral (também pedido dele na prévia).
- **Os painéis são da equipe.** O módulo nasce com **Suporte** (sigla SUP) e **Desenvolvimento**
  (DEV); quem cuida dos chamados cria outros (Interno, Comercial, Administrativo…) quando quiser, cada
  um com: as **etapas** (criar, renomear, tirar, mudar a ordem; o tipo — entrada, andamento,
  resolvido, fechado —, o nível N1/N2/N3, o que é obrigatório para entrar nela e quem é avisado),
  as **regras** (as opções de Tipo, se conta prazo, se o Resolvido fecha sozinho em N dias úteis, o
  que é obrigatório para abrir, se o pai espera os filhos, os supervisores) e **quem vê** (todos ou
  só as pessoas escolhidas — para os outros, o chamado não existe).
- **N1, N2 e N3 são colunas** (a escolha dele: "prefiro por colunas mesmo"). O Suporte nasce com
  Novo · N1 · N2 · N3 · Em observação · Resolvido · Fechado.
- **Sem migração.** Os chamados do Helena ficam lá para consulta e a numeração começa do zero
  (SUP-1) — "começar 2027 usando tudo novo, já com os novos padrões". Um código antigo citado no texto
  (IS-4280) vira link para o card do LineChat.
- **O chamado** tem, cada coisa no seu lugar: o **relato do cliente**, a **descrição** do andamento,
  a **solução** e a **causa** (no problema, também o contorno e a validação); a **empresa** e o
  **contato** (nome e WhatsApp) em destaque; a **classificação** — o **assunto** (árvore de até 3
  níveis, com descrição, checklist e de-para; **nasce em branco** para a equipe montar), o tipo, a
  **gravidade** e o **alcance** → a **prioridade sugerida** pela matriz (trocar pede o motivo, que
  fica à vista) —; **produtos e operadoras** (vários, os do cliente primeiro: "tem cliente com duas
  operadoras e dois produtos"); **o que foi afetado** (circuitos, DIDs, aparelhos e unidades, do
  cadastro); **etiquetas inteiras**; o checklist; o responsável e quem acompanha; os **prazos**; o
  caso **na operadora** (protocolo, prometido para, cobrar a cada X horas); o **tempo gasto**; as
  **anotações com anexos** (até 5 de 10 MB, colar print); e a **linha do tempo** (tudo, anotações,
  histórico e a **trajetória** pelas etapas e níveis, com quanto tempo ficou em cada uma e o motivo
  de cada escalonamento).
- **Andar com regras.** Ir para uma etapa pede o que ela exige (a tela diz o que falta);
  **escalonar e voltar de nível pedem o motivo**; o **pai não fecha com filho aberto** (os filhos
  podem estar em outro painel, como o Desenvolvimento); o **problema** (ITIL) junta os incidentes de
  clientes diferentes e só resolve com a causa, a solução e a validação; as **ligações** (relacionado,
  duplicado de, repete) são **manuais** — nada automático, como ele pediu —, e o código citado no
  texto vira link. A ficha desenha as ligações (cada tipo com um traço e a legenda escrita).
- **O chamado nasce de três jeitos**: à mão no Gestor; pelo **botão Abrir chamado** na conversa do
  LineChat (uma ação personalizada que abre o formulário já com o telefone, o nome e a sessão); e
  pelo **robô** (o bloco de webhook manda para o Gestor, com uma chave de API, e recebe o código para
  mandar ao cliente). Ao escolher o cliente, o formulário mostra os chamados recentes dele com
  **"Reabrir este em vez de abrir outro"** (o exemplo dele: o mesmo ramal à tarde reabre o da manhã).
- **Os prazos** (o pedido do Carlos): resposta e solução por prioridade, em **horas úteis**, com o
  horário de atendimento e os **feriados** (os de Salvador e da Bahia já cadastrados); **esperando o
  cliente, o prazo para**; esperando a operadora, **continua correndo**. O relógio do Gestor avisa
  perto de vencer e quando vence (o responsável; vencido, também os supervisores), avisa o chamado
  **sem dono** e **fecha sozinho o Resolvido** depois de N dias úteis; a mensagem do cliente reabre o
  Resolvido, menos "obrigado".
- **Os avisos.** O **sininho** na tela; o **WhatsApp da equipe** por um número não oficial, com o
  número de cada pessoa nos Ajustes (o pedido dele) e a escolha de quais avisos vão por onde; o
  **cliente só recebe quando o atendente manda**, pelo número oficial **(71) 3034-8350** (com o modelo
  aprovado quando a conversa passou de 24 h). O aviso da equipe só sai com a chave guardada (sem ela,
  nem tenta). Na ficha e no histórico fica quem foi avisado.
- **A rotina.** As **respostas prontas** (o texto e o que ela faz: avisa o cliente, move, marca a
  espera, põe a etiqueta, assume) e os **agendados** (o chamado que nasce sozinho: todo dia, toda
  semana, todo mês ou uma vez).
- **A IA** (a NIA dentro do Gestor): o **Preencher com IA** na ficha lê a conversa do cliente no
  LineChat (ou o que está no chamado) e sugere os campos; a pessoa marca o que quer e aplica. É a
  **mesma IA da Base de conhecimento** — o provedor e a chave ficam em **Chamados › Ajustes › IA**, o
  mesmo cartão de Administração › Ajustes: uma chave, um uso do mês.
- **As integrações** (o cartão para o Luan e o dev ligarem o n8n): **chaves de API** (a chave
  aparece uma vez; o banco guarda só o resumo) para o robô e o n8n abrirem, lerem, alterarem, moverem
  e anotarem chamados; **webhooks de saída** (chamado criado, alterado, movido, anotação, resolvido,
  fechado), assinados com um segredo guardado no cofre. Os fluxos de hoje (IA Preenche Chamado e
  Atualização de Card) são desligados ou religados no Gestor na virada, para ninguém receber aviso
  em dobro.
- **O Gestor dentro do LineChat** ("tire esse bloqueio, quero que abra iframe em outros programas"):
  o `X-Frame-Options: DENY` e a política de conteúdo saíram do Caddy; **o próprio sistema** manda a
  política em toda resposta, com `frame-ancestors 'self'` mais os sites que a administração liberar
  (Chamados › Ajustes › Integrações). Dentro do outro site, o login usa um cookie próprio daquele site
  (`SameSite=None; Secure; Partitioned`); fora dele, nada muda (`Strict`). E todo pedido que muda
  algo confere de onde veio (`Origin`): de outro site, é recusado — menos a entrada das integrações,
  que não usa cookie.
- **Quem pode o quê.** Ver: `support.read` (todos, inclusive o Leitor). Trabalhar (`tickets.work`,
  nova): Operador, Técnico e Administrador. Cuidar — painéis, etapas, assuntos, prazos, avisos,
  respostas prontas, agendados e a lixeira dos chamados (`tickets.manage`, nova): Administrador.
  Integrações e IA: `admin.manage`. Tudo o que muda vai para a auditoria; nada se apaga de verdade.

**Ficou de fora, por decisão dele.** A pesquisa de satisfação (já existe em outro módulo); os
chamados no Portal do cliente; o "pedido interno que mexe no cadastro"; o aviso de senha no chamado
("não quero que proíba colocar senhas"); as ligações automáticas. **O incidente geral** (afetados
pelo cadastro, aviso em massa) fica anotado para amadurecer à parte ("não perca ela de vista").

**Consequências.**

- Migração `0015_chamados_do_gestor`: 16 tabelas novas (grupo 10: `ticket_panels`, `ticket_stages`,
  `ticket_subjects`, `tickets`, `ticket_events`, `ticket_notes`, `ticket_attachments`,
  `ticket_links`, `ticket_time_entries`, `ticket_carrier_cases`, `ticket_schedules`, `ticket_macros`,
  `ticket_contacts`, `ticket_notifications`, `ticket_webhooks`, `ticket_api_keys`), as duas
  permissões novas nos papéis e os dois painéis iniciais. Os ajustes ficam em `settings`
  (`atendimento-prazos`, `atendimento-avisos`, `atendimento-integracoes`); a chave própria do
  WhatsApp e os segredos dos webhooks, no cofre.
- As regras moram em `@gestor/shared` (`atendimento.ts` e `atendimento-prazos.ts`), as mesmas no
  servidor e na prévia. O servidor: `apps/api/src/services/atendimento/` e as rotas
  `/api/atendimento/*`; o relógio dos chamados liga em `server.ts`, como o do envio automático.
- Para ligar no LineChat: cadastrar o endereço do LineChat em Integrações › Sites (o menu
  personalizado com o Gestor dentro), criar a chave do robô, pôr o bloco de webhook no robô e a ação
  personalizada "Abrir chamado" — o passo a passo está em `docs/guia-de-uso/chamados-do-gestor.md`.
  O Safari e navegadores que bloqueiam cookie de terceiros podem pedir o login de novo dentro do
  LineChat.
- **Ainda não estão prontos** (entram antes de o 1.10 subir): os 20 relatórios e o envio diário lendo
  os chamados novos (hoje leem a cópia do LineChat) e a Base de conhecimento ligada aos chamados novos
  (o livrinho e o "Registrar na base").
