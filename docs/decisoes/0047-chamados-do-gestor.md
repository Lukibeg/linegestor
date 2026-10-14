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
antigos (no menu, **Suporte › Relatórios**, que abre neles: decisão 0048), com os 20 relatórios e o envio diário
como estão. E **revê a 0016** num ponto: os cabeçalhos que impediam o Gestor de abrir dentro de outro
sistema saíram do Caddy (abaixo). O Luan foi avisado das duas antes.

**Decisão.**

- **Um módulo novo, Chamados** (menu Suporte › Chamados, endereço `/atendimento`). A primeira tela são os
  **Painéis**, como no Helena (o pedido dele na prévia: com muitos painéis, alternar por abas não fica
  bom): um cartão por painel com os números de agora e as etapas, que abre o **quadro** daquele painel
  (com **Trocar**, para ir a outro) e leva às configurações dele. Dentro do painel, **Quadro | Lista**
  (a lista não é aba: mora no painel, pedido dele na prévia). Ao lado dos Painéis, o **Meu dia**;
  e a **ficha do chamado**, **Abrir chamado** e os **Ajustes** do módulo. No módulo, a tela usa a
  largura toda e o alto é curto: o nome, as abas e as ações numa linha; no quadro e na lista, a busca e
  o botão **Filtros** (as caixas aparecem quando pedidas), para sobrar espaço para os cartões. No
  computador, a barra de cima do sistema saiu: o sininho, o tema e o Sair ficam no rodapé do menu
  lateral. **Clicar num chamado abre a ficha numa janela grande por cima da tela** (o quadro, a lista
  ou o Meu dia continuam embaixo, do jeito que estavam); o link direto (`/atendimento/SUP-12`) abre a
  ficha em página inteira. Tudo isso pedido dele na prévia.
- **Os painéis são da equipe.** O módulo nasce com **Suporte** (sigla SUP) e **Desenvolvimento**
  (DEV); quem cuida dos chamados cria outros (Interno, Comercial, Administrativo…) quando quiser, cada
  um com: as **etapas** (criar, renomear, tirar, mudar a ordem; o tipo — entrada, andamento,
  resolvido, fechado —, o nível N1/N2/N3/DEV, o que é obrigatório para entrar nela e quem é avisado),
  as **regras** (se conta prazo, se o Resolvido fecha sozinho em N dias úteis, o que é obrigatório
  para abrir, se o pai espera os filhos, os supervisores), **os campos** (abaixo) e **quem vê** (todos ou
  só as pessoas escolhidas — para os outros, o chamado não existe). Tudo isso fica **numa janela só**,
  ao criar e ao editar (o pedido dele na prévia: "essa parte das etapas pode ficar dentro de editar e
  também quando vou criar o painel"); o painel novo começa com Novo, Em andamento, Resolvido e
  Fechado ou com as etapas de outro painel. Salvar grava o painel e as etapas juntos, numa transação:
  se uma etapa que sai tem chamados, a janela pergunta para onde eles vão e, até lá, nada muda.
- **N1, N2, N3 e DEV são colunas** (a escolha dele: "prefiro por colunas mesmo"). O Suporte nasce com
  Novo · N1 · N2 · N3 · DEV · Em observação · Resolvido · Fechado. O **DEV** é o nível depois do N3 (o
  pedido dele na prévia, em 13/10: "o correto aqui é ter o nível DEV também"): o chamado fica com o
  desenvolvimento, e escalonar para ele (ou voltar dele) pede o motivo, como nos outros. A correção em
  si pode andar num filho, no painel Desenvolvimento.
- **Sem migração.** Os chamados do Helena ficam lá para consulta e a numeração começa do zero
  (SUP-1) — "começar 2027 usando tudo novo, já com os novos padrões". Um código antigo citado no texto
  (IS-4280) vira link para o card do LineChat.
- **O chamado** tem, cada coisa no seu lugar: o **relato do cliente**, a **descrição** do andamento,
  a **solução** e a **causa** (no problema, também o contorno e a validação); a **empresa** e o
  **contato** (nome e WhatsApp) em destaque; a **classificação** (o que o painel usa: abaixo) — o **assunto** (árvore de até 3
  níveis, com descrição, checklist e de-para; **nasce em branco** para a equipe montar), o tipo, a
  **gravidade** (e o **alcance**, no painel que o usa) → a **prioridade sugerida** (trocar pede o
  motivo, que fica à vista) —; **produtos e operadoras** (vários, os do cliente primeiro: "tem cliente com duas
  operadoras e dois produtos"); **etiquetas inteiras**; o checklist; o responsável e quem acompanha; os **prazos**; o
  caso **na operadora** (protocolo, prometido para, cobrar a cada X horas); o **tempo gasto**; as
  **anotações com anexos** (até 5 de 10 MB, colar print); e a **linha do tempo** (tudo, anotações,
  histórico e a **trajetória** pelas etapas e níveis, com quanto tempo ficou em cada uma e o motivo
  de cada escalonamento).
- **Os campos de cada painel** (o pedido dele na prévia, 11/10: "vou ter outros painéis, então nem
  sempre vai ser assuntos… o correto é você fazer ajustes e campos personalizados"). A aba que era
  Assuntos virou **Chamados › Ajustes › Campos**, painel por painel:
  - **Os do sistema que cada painel usa ou não**: assunto, tipo, gravidade, alcance, produtos e
    operadoras. **O alcance nasce desligado** em todo painel ("não precisa desse alcance por
    enquanto", o Luan na prévia): sem ele, a prioridade sugerida sai só da gravidade, pela coluna
    **Só a gravidade** de Ajustes › Prazos (começa como a coluna "Um setor ou unidade" da matriz);
    ligado, vale a matriz gravidade × alcance, como antes. Sem a gravidade, não há sugestão. O resto (cliente, contato, título, relato,
    descrição, prioridade, responsável, solução, causa, etiquetas) é de todo chamado. Desligar some da
    ficha, do Abrir chamado, dos cartões, da busca e do CSV daquele painel e sai do que é pedido para
    abrir e nas etapas (a confirmação diz de onde); **o valor fica guardado** e volta se ligar de novo.
    A árvore de assuntos abre dali (é a configuração do campo Assunto do painel), e as opções do Tipo
    também se editam ali.
  - **Os do painel**, que a equipe cria: texto curto, texto longo, número, data, sim/não e lista
    (escolhe uma ou várias opções), com uma dica; até 30 por painel e 50 opções por lista. Cada um pode
    ser **obrigatório para abrir** e **para entrar** nas etapas marcadas — as mesmas regras dos campos
    do sistema, também na janela do painel. O texto longo fica junto do relato; os outros, na
    classificação. Entram na busca, no CSV (uma coluna por campo), no histórico e nas integrações.
  - **Nada se apaga**: desativar esconde e guarda o valor; a opção tirada de uma lista fica inativa (o
    que já foi escolhido continua). **O tipo não muda** depois de criado (cria-se outro e desativa
    este), para nenhum valor guardado virar outra coisa. O nome não repete o de outro campo do painel
    nem o de um campo de todo chamado.
  - O que é **obrigatório para abrir** vale para quem abre na tela (à mão e pelo botão da conversa); o
    **robô, os agendados e a API abrem mesmo sem**, e a equipe completa na ficha — o chamado do cliente
    não se perde por um campo. Pela integração, o campo do sistema que o painel não usa é ignorado (o
    robô não falha por isso); o campo do painel vai pelo nome (ou pelo id), e o que o painel não tem é
    recusado com a mensagem dizendo qual.
  - No servidor, os dois painéis nascem com os campos do sistema ligados e sem campos próprios (a
    equipe monta, como a árvore de assuntos). Na prévia, o Desenvolvimento é o exemplo: sem assunto e
    sem operadoras, com Sistema (lista, obrigatório para abrir), Como reproduzir, Versão publicada
    (obrigatória no Entregue) e Previsão de entrega.
- **Andar com regras.** Ir para uma etapa pede o que ela exige (a tela diz o que falta);
  **escalonar e voltar de nível pedem o motivo**; o **pai não fecha com filho aberto** (os filhos
  podem estar em outro painel, como o Desenvolvimento); o **problema** (ITIL) junta os incidentes de
  clientes diferentes e só resolve com a causa, a solução e a validação — no Abrir chamado, o
  **Registro** (Chamado ou Problema) diz o que é cada um só na dica do mouse (o texto embaixo da
  escolha saiu, a pedido do Luan na prévia, em 14/10: "não precisa disso"); as **ligações** (relacionado,
  duplicado de, repete) são **manuais** — nada automático, como ele pediu —, e o código citado no
  texto vira link. A ficha desenha as ligações (cada tipo com um traço e a legenda escrita).
- **Abrir chamado**: dentro de um painel (o quadro, a lista), o chamado já nasce nele — "se eu estou
  dentro do painel de suporte, quero abrir no painel de suporte" —; fora dele (Painéis, Meu dia, o
  botão da conversa), a pessoa escolhe o painel, e o filho também (pode ser de outro painel). A
  descrição já vem aberta, e uma etiqueta nova se cria ali mesmo (pedidos dele na prévia). O botão
  **Abrir chamado** do alto das telas abre o formulário numa **janela por cima da tela**, que fica
  como estava (pedido dele na prévia, em 14/10: "o abrir chamado tem que ser como pop up e não a tela
  toda"), como a ficha: o endereço é o do Abrir chamado (o Voltar do navegador fecha), e o chamado
  aberto — ou o recente reaberto — vira a ficha na mesma janela. Pelo link direto (o botão da conversa
  do LineChat, numa aba nova), ocupa a página inteira. O **filho** e o **problema a partir de um
  chamado** abrem o mesmo formulário numa **janela por cima da ficha**, e não na tela inteira (pedido
  dele na prévia). Em todas, com algo escrito, fechar pergunta antes.
- **As etiquetas com cor** (o pedido dele na prévia: "na hora de criar as etiquetas, escolher a cor"):
  um catálogo, o mesmo em todos os painéis, guarda o nome e a cor de cada etiqueta (nove cores). A nova
  nasce com a cor escolhida no Abrir chamado ou na ficha; a do robô, da IA e da resposta pronta, cinza.
  O chamado guarda o nome como está no catálogo ("cliente VIP" escrito de novo vira a que existe). No
  quadro e na ficha a etiqueta é redonda, com a bolinha da cor, para não se confundir com a prioridade
  e o prazo. A escolha é uma lista como as outras do Gestor (a busca, a marca das que o chamado tem, o
  "Criar" com a cor) — o pedido dele: "deixe no padrão do restante do sistema" —, e o **lápis** de
  cada uma edita **o nome e a cor**, como no Helena: valem em todos os chamados que têm a etiqueta (os
  da lixeira também) e nas respostas prontas que a põem; o histórico fica como foi. Editar é de quem
  cuida dos chamados, ali e em Ajustes › Etiquetas (onde também se tira das sugestões a que nenhum
  chamado usa). Cada pessoa só vê sugerida a etiqueta dos painéis que vê (e as que nenhum chamado usa
  ainda).
- **Os observadores** (como no Helena, o pedido dele na prévia): quem é posto como observador — ao
  abrir ou na ficha — recebe o aviso de toda atualização do chamado: a anotação, a mudança de etapa e
  de responsável (e o reabrir, o painel novo), a espera, a mensagem ao cliente, o caso na operadora, o
  cliente que respondeu, o fechar sozinho e a lixeira. As mudanças de campo (o relato, a classificação,
  o checklist, as ligações…) de uma pessoa juntam num aviso só enquanto ele não foi lido (30 minutos),
  e só na tela. Quem fez não recebe, nem quem já recebeu outro aviso da mesma ação. O aviso é um evento
  próprio em Avisos e WhatsApp (na tela, ligado; no WhatsApp, desligado de início). O "Acompanhar" da
  ficha virou **Observar**, e o Meu dia mostra os que a pessoa observa.
- **Citar um colega com @ na anotação** (o pedido dele na prévia, em 13/10: "citar colegas nos
  comentários, e nesse momento eles recebem notificação, sem necessariamente serem observadores"):
  escrever @ abre, no cursor, a lista de quem vê o painel (procura pelo nome; as setas andam, Enter ou
  o clique escolhe; Esc fecha só a lista); o botão **Citar**, ao lado de Anexar, faz o mesmo. Embaixo
  da caixa aparece quem vai receber o aviso. Quem for citado recebe na hora — no sininho, no cartão na
  tela e, se ligado, no WhatsApp: é um evento próprio em Avisos e WhatsApp (ligado nos dois, como o
  "recebeu um chamado") —, mesmo sem observar o chamado. O observador citado recebe só o aviso da
  citação, e quem escreveu não recebe nada. Vale o nome inteiro ("@Bruno Teixeira") ou só o primeiro,
  quando só uma pessoa se chama assim; o "@" de um e-mail não cita ninguém. Quem não vê o painel não
  entra na lista nem recebe (o aviso não abriria). A anotação guarda quem citou (`mentioned_user_ids`)
  e mostra a citação em destaque; a auditoria diz "citando Fulano".
- **O chamado nasce de três jeitos**: à mão no Gestor; pelo **botão Abrir chamado** na conversa do
  LineChat (uma ação personalizada que abre o formulário já com o telefone, o nome e a sessão); e
  pelo **robô** (o bloco de webhook manda para o Gestor, com uma chave de API, e recebe o código para
  mandar ao cliente). Ao escolher o cliente, o formulário mostra os chamados recentes dele com
  **"Reabrir este em vez de abrir outro"** (o exemplo dele: o mesmo ramal à tarde reabre o da manhã).
- **Os contatos do cliente** (o pedido dele na prévia: "uma aba de contatos dos clientes, aí ele já
  puxaria de lá; e criar um contato por aqui"): a ficha do cliente ganhou a aba **Contatos** (o nome,
  o WhatsApp, o e-mail e o cargo ou setor). O Abrir chamado mostra os contatos do cliente escolhido —
  um clique preenche o nome e o WhatsApp — e inclui um novo ali mesmo; a ficha do chamado troca o
  contato pela lista e guarda nela o que foi escrito à mão. O WhatsApp não se repete entre os
  contatos ativos de um cliente; nada se apaga (desativa, e some do Abrir chamado). O chamado que
  chega só com o telefone (o robô, o botão da conversa) acha o cliente e o nome pelos contatos — o
  mesmo número em dois clientes não é adivinhado — e, depois, pelo que o Gestor aprendeu dos chamados.
  Incluem e editam quem cuida do cadastro e quem trabalha nos chamados.
- **Os prazos** (o pedido do Carlos): resposta e solução por prioridade, em **horas úteis**, com o
  horário de atendimento e os **feriados** (os de Salvador e da Bahia já cadastrados); **esperando o
  cliente, o prazo para**; esperando a operadora, **continua correndo**. O relógio do Gestor avisa
  perto de vencer e quando vence (o responsável; vencido, também os supervisores), avisa o chamado
  **sem dono** e **fecha sozinho o Resolvido** depois de N dias úteis; a mensagem do cliente reabre o
  Resolvido, menos "obrigado".
- **Os avisos.** O **sininho** na tela (inclusive o dos observadores) e, o que chega com o Gestor
  aberto, um **cartão** perto dele e, para quem ligar, a **notificação do navegador** (só com o Gestor
  fora da frente) — o pedido dele na prévia: "além do sininho, notificação no navegador, e uma menos
  sucinta". Os dois **ficam até a pessoa abrir o chamado ou fechar** (também pedido dele: "fixo até o
  usuário clicar para entrar ou no X"); na tela, os 3 mais novos, e os outros esperam a vez. Cada pessoa liga e desliga no
  próprio sininho (vale para aquele navegador); a tela relê os avisos a cada 30 s. O **WhatsApp da
  equipe** por um número não oficial, com o número de cada pessoa nos Ajustes (o pedido dele) e a
  escolha de quais avisos vão por onde; o **cliente só recebe quando o atendente manda**, pelo número
  oficial **(71) 3034-8350**. Esse número é o **WhatsApp oficial**, então a mensagem ao cliente sai
  **pelo modelo aprovado** (o template; o pedido dele na prévia): o id, as variáveis — cada uma com um
  valor do chamado ou um texto fixo, sem quebra de linha e nunca vazia, como a Meta exige — e o arquivo
  do cabeçalho, conferidos na API do LineChat (`POST /chat/v1/message/send-sync`, que espera o
  WhatsApp e diz se falhou; `GET /chat/v1/template`, que lista os aprovados do canal). O texto livre
  fica como opção (só até 24 h da última mensagem do cliente; recusado, vai o modelo). A conversa
  que a mensagem abrir vai para a equipe escolhida e, se ligado, para quem mandou (pelo e-mail). Sem
  o modelo escolhido, a ficha nem mostra o botão. O aviso da equipe só sai com a chave guardada (sem
  ela, nem tenta). Na ficha e no histórico fica quem foi avisado.
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
  nova): Operador, Técnico e Administrador. Cuidar — painéis, etapas, campos e assuntos, etiquetas,
  prazos, avisos, respostas prontas, agendados e a lixeira dos chamados (`tickets.manage`, nova):
  Administrador. Integrações e IA: `admin.manage`. Tudo o que muda vai para a auditoria; nada se apaga de verdade.

**Ficou de fora, por decisão dele.** A pesquisa de satisfação (já existe em outro módulo); os
chamados no Portal do cliente; o "pedido interno que mexe no cadastro"; o aviso de senha no chamado
("não quero que proíba colocar senhas"); as ligações automáticas; e **o que foi afetado** no chamado
(circuitos, DIDs, aparelhos e unidades do cadastro), que saiu na prévia ("não precisa desse campo") —
da tela, da API e da migração. **O incidente geral** (afetados pelo cadastro, aviso em massa) fica
anotado para amadurecer à parte ("não perca ela de vista"); quando vier, decide como marcar os
afetados.

**Consequências.**

- Migração `0015_chamados_do_gestor`: 19 tabelas novas — `client_contacts` (os contatos do cliente,
  junto do cadastro; rotas `/api/clients/:id/contatos`: ver com `records.read` ou `support.read`,
  mexer com `records.write` ou `tickets.work`, auditoria no cliente) e as 18 do grupo 10
  (`ticket_panels`, `ticket_stages`, `ticket_subjects`, `ticket_fields` — os campos de cada painel; o
  valor fica em `tickets.custom_fields`, pelo id do campo —, `tickets`, `ticket_events`, `ticket_notes`,
  `ticket_attachments`, `ticket_links`, `ticket_time_entries`, `ticket_carrier_cases`,
  `ticket_schedules`, `ticket_macros`, `ticket_tags` — as etiquetas e a cor, pelo nome sem maiúscula
  e sem acento —, `ticket_contacts`, `ticket_notifications`, `ticket_webhooks`, `ticket_api_keys`); e mais as duas permissões novas nos papéis e os dois painéis iniciais. Os ajustes ficam em `settings`
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
- **Ficaram para depois do 2.0** (o Luan mandou subir em 14/10): os 20 relatórios e o envio diário
  lendo os chamados novos (por ora leem a cópia do LineChat, em Suporte › Relatórios) e a Base de
  conhecimento ligada aos chamados novos (o livrinho e o "Registrar na base").
- **O número do patch**: o trabalho foi feito e revisado na prévia como **1.10** (é o nome dos commits
  e da branch de trabalho) e subiu como **2.0** — o Luan, em 14/10: "pode subir tudo como versão 2.0".
