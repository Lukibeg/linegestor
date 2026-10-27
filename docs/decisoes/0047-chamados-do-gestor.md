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
  **anotações com anexos** (até 5 de 10 MB, colar o print ou o arquivo; o PDF abre sem baixar, decisão
  0051); e a **linha do tempo** (tudo, anotações,
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
  clientes diferentes e só resolve com a causa, a solução e a validação — nasce na ficha de um
  chamado, que vira o primeiro incidente (o **Registro**, Chamado ou Problema, saiu do Abrir chamado no
  2.0.1: ver no fim); as **ligações** (relacionado,
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
  nasce com a cor escolhida no Abrir chamado ou na ficha; a do robô e da IA, cinza.
  O chamado guarda o nome como está no catálogo ("cliente VIP" escrito de novo vira a que existe). No
  quadro e na ficha a etiqueta é redonda, com a bolinha da cor, para não se confundir com a prioridade
  e o prazo. A escolha é uma lista como as outras do Gestor (a busca, a marca das que o chamado tem, o
  "Criar" com a cor) — o pedido dele: "deixe no padrão do restante do sistema" —, e o **lápis** de
  cada uma edita **o nome e a cor**, como no Helena: valem em todos os chamados que têm a etiqueta (os
  da lixeira também); o histórico fica como foi. Editar é de quem
  cuida dos chamados, ali e em Ajustes › Etiquetas (onde também se tira das sugestões a que nenhum
  chamado usa). Cada pessoa só vê sugerida a etiqueta dos painéis que vê (e as que nenhum chamado usa
  ainda).
- **Os observadores** (como no Helena, o pedido dele na prévia): quem é posto como observador — ao
  abrir ou na ficha — recebe o aviso de toda atualização do chamado: a anotação, a mudança de etapa e
  de responsável (e o reabrir, o painel novo), a espera, a mensagem ao cliente, o caso na operadora, o
  fechar sozinho e a lixeira. As mudanças de campo (o relato, a classificação,
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
  o WhatsApp, o e-mail e o cargo ou setor — desde o 2.0.2, escolhido numa lista: decisão 0053). O Abrir
  chamado mostra os contatos do cliente escolhido —
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
  **sem dono** e **fecha sozinho o Resolvido** depois de N dias úteis (a mensagem do cliente, que
  reabria o Resolvido, saiu no 2.0.1: ver no fim).
- **Os avisos.** O **sininho** na tela (inclusive o dos observadores) e, o que chega com o Gestor
  aberto, um **cartão** perto dele e, para quem ligar, a **notificação do navegador** (só com o Gestor
  fora da frente) — o pedido dele na prévia: "além do sininho, notificação no navegador, e uma menos
  sucinta". Os dois **ficam até a pessoa abrir o chamado ou fechar** (também pedido dele: "fixo até o
  usuário clicar para entrar ou no X"); na tela, os 3 mais novos, e os outros esperam a vez. Cada pessoa liga e desliga no
  próprio sininho (vale para aquele navegador); a tela relê os avisos a cada 30 s. O **WhatsApp da
  equipe** por um número não oficial, com o número de cada pessoa no usuário (Administração ›
  Usuários, desde o 2.0.1: ver no fim) e a escolha de quais avisos vão por onde; o **cliente só recebe quando o atendente manda**, pelo número
  oficial **(71) 3034-8350**. Esse número é o **WhatsApp oficial**, então a mensagem ao cliente sai
  **pelo modelo aprovado** (o template; o pedido dele na prévia): o id, as variáveis — cada uma com um
  valor do chamado ou um texto fixo, sem quebra de linha e nunca vazia, como a Meta exige — e o arquivo
  do cabeçalho, conferidos na API do LineChat (`POST /chat/v1/message/send-sync`, que espera o
  WhatsApp e diz se falhou; `GET /chat/v1/template`, que lista os aprovados do canal). O texto livre
  fica como opção (só até 24 h da última mensagem do cliente; recusado, vai o modelo). A conversa
  que a mensagem abrir vai para a equipe escolhida e, se ligado, para quem mandou (pelo e-mail). Sem
  o modelo escolhido, a ficha nem mostra o botão. O aviso da equipe só sai com a chave guardada (sem
  ela, nem tenta). Na ficha e no histórico fica quem foi avisado.
- **A rotina.** Os **agendados** (o chamado que nasce sozinho: todo dia, toda semana, todo mês ou uma
  vez). As respostas prontas saíram no 2.0.1 (ver no fim).
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
  prazos, avisos, agendados e a lixeira dos chamados (`tickets.manage`, nova):
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
  (`atendimento-prazos`, `atendimento-avisos`, `atendimento-integracoes`; no 2.0.1, `atendimento-robo` e
  `atendimento-robo-ultimo`); a chave própria do
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
  conhecimento ligada aos chamados novos (o livrinho e o "Registrar na base"). **Revisto no 2.1
  (decisão 0055):** os chamados novos ganharam um módulo de relatórios próprio (a vista Relatórios de cada
  painel, Suporte › Relatórios), e os 20 ficaram como **Suporte › Legado do Helena**, sobre a cópia do
  LineChat; o envio diário continua lendo a cópia até a virada.
- **O número do patch**: o trabalho foi feito e revisado na prévia como **1.10** (é o nome dos commits
  e da branch de trabalho) e subiu como **2.0** — o Luan, em 14/10: "pode subir tudo como versão 2.0".

## Revisto no 2.0.1 (16/10/2026)

Com o 2.0 no ar, o Luan passou pelas telas e pediu cinco mudanças:

- **Sem o Registro no Abrir chamado** ("n tem necessidade"). O que se abre ali é chamado; o problema
  nasce só a partir de um chamado — **Mais › Abrir um problema a partir deste…**, na ficha —, que vira o
  primeiro incidente. O filtro Registro da Lista fica (é como se acham os problemas).
- **Sem as respostas prontas** ("já tem no LineChat": as respostas rápidas de lá). Saíram a aba dos
  Ajustes, o menu da ficha, as rotas e o serviço. A tabela `ticket_macros` fica no banco, sem uso (nada
  se apaga), e o "usou a resposta pronta" antigo continua no histórico.
- **Sem o "cliente respondeu"** pelo n8n ("isso tbm n precisa"). Saíram o endereço
  `/api/atendimento/entrada/mensagem`, o cartão das Integrações e o aviso "O cliente respondeu" da lista
  de avisos (o aviso antigo desse tipo ainda aparece no sininho). **O Resolvido não reabre sozinho**:
  quem atende reabre pela ficha (Reabrir) ou pelo "Reabrir este em vez de abrir outro". O fechar
  sozinho continua.
- **O WhatsApp de cada pessoa em Administração › Usuários** ("pode ficar na parte de usuários que já
  existe, n precisa de uma parte só pra isso"). O número mora no usuário (`users.whatsapp`, só os
  dígitos com o 55) junto da pausa (`users.whatsapp_avisos`: desligada, o número fica e nada sai); os
  Ajustes dos chamados só contam quem recebe, com o link para Usuários. Migração
  `0016_whatsapp_dos_usuarios`: as duas colunas e a cópia dos números (e das pausas) que estavam em
  `settings.atendimento-avisos`, que saem de lá.
- **O robô do LineChat abre pelo mapa** ("Eu quero que a gente possa alterar esse JSON… para que não
  tenha que ser algo bem fixo… até porque depois possa trocar. Então, alguma parte onde eu possa montar
  as referências com as variáveis"). O bloco Webhook do robô manda o JSON dele (o formato do Helena:
  `contact`, `session`, `questions`, `menus`, `lastContactMessage`…, numa lista `[{…}]`), não o do
  Gestor. Agora ele chama `/api/atendimento/entrada/robo`, que aceita qualquer JSON, e o **mapa**
  (Chamados › Ajustes › Integrações, `settings.atendimento-robo`) diz de onde vem cada campo do
  chamado: um texto com as variáveis do pedido entre `{{ }}` (`contact.name`,
  `questions.<id>.answer`; `{{a || b}}` e `{{a || "texto"}}`). O de fábrica serve ao LineChat (o nome
  no título, a última mensagem no relato, o WhatsApp, a conversa, a etiqueta "robô"). O Gestor guarda
  **o último pedido** (`settings.atendimento-robo-ultimo`, os textos longos cortados) com o que
  aconteceu: a tela lista as variáveis dele (a resposta de cada pergunta e de cada menu com a pergunta
  ao lado), mostra o que sai em cada campo e o **Como fica** (`/integracoes/robo/experimentar`: o
  mesmo resolvedor que abre de verdade, sem abrir). **Leniente**, de propósito: o que não bate (o
  assunto que não existe, a opção que não é do campo, o telefone que não é número, o painel
  desativado — que dá lugar ao primeiro ativo) fica de fora e volta em `ignorados` (na resposta, na
  auditoria e no último pedido); só não abre quando o mapa não tira nada do pedido. O cliente sai pelo
  nome (fantasia ou razão social) ou pelo CNPJ, quando bate com um só; a opção da lista, pela resposta
  enfeitada do menu ("☎️ LinePBX: Plataforma de Voz" é a LinePBX), quando aparece uma só; o assunto,
  também pelo **de-para** (vale para o n8n também: a resposta do menu vira assunto pelo nome que a
  equipe põe no de-para). A entrada no formato do Gestor (`/entrada/chamado`) fica para o n8n e outros
  sistemas, rígida como era, e ganhou a descrição. As regras moram em `@gestor/shared` (`robo.ts`).

  **A NIA no Gestor** (21/10, no 2.0.2; o prompt do Luan para ligar a NIA, a IA do suporte, ao Gestor pelo
  n8n): a leitura do chamado pela chave (`GET /integracao/chamados/:ref`) passou a trazer a **sessão do
  LineChat** (`sessaoId`, a coluna `tickets.session_id`: sem ela, o n8n não acha a conversa), e entrou o
  **`GET /integracao/opcoes`**, com a mesma chave: só o que está ativo, no jeito que o `PATCH` aceita — os
  assuntos (`id`, `nome`, `caminho`, `painelSigla`), os produtos e os clientes (`id`, `nome`), as opções do
  Tipo de cada painel (`nome`, `painelSigla`), as gravidades e as prioridades (`id`, `nome`, `dica`). A NIA
  monta com elas o enum do que o modelo de IA responde: o que no Helena a instrução em texto não resolveu
  (a IA inventava assunto), o enum resolve. As listas são as mesmas da tela (`opcoes`, de `leitura.ts`, e os
  clientes do seletor); o painel que desligou o assunto ou o tipo não traz o que escolher nele. Ler não vai
  para a auditoria. O "tipos" são as opções do campo **Tipo** (Incidente, Requisição…), que é o que o
  `PATCH` grava — e não o `TipoChamado` (chamado ou problema), que a integração não muda.

  Ajustado no mesmo dia, pelo que o Luan viu no bloco "Enviar webhook" do LineChat:
  - **A resposta é a do bloco**: sempre HTTP 200 (ele conta o 201 como falha), com
    `{"response":"CHAMADO_ABERTO","messages":[{"text":"Seu chamado foi registrado com o número *SUP-1*. Guarde este número caso precise falar sobre ele depois."}]}`
    — também quando a conversa já tinha chamado aberto (vai o número dele) — ou
    `{"response":"CHAMADO_FALHOU"}`, quando não deu para abrir (o erro fica no último pedido e no
    registro do servidor). A mensagem é do mapa ("Mensagem ao cliente": `{codigo}`, `{contato}` e as
    variáveis do pedido); a de fábrica é o texto dele. A chave errada continua **401**: não é o robô
    falando, e o erro aparece logo no teste do bloco.
  - **A chave vai no endereço** (`?chave=`: o bloco não aceita cabeçalho). Ela já ficava fora do
    registro do sistema (o `req` do log troca a chave por "…"), da auditoria e do último pedido (só o
    nome da chave); faltava o **Caddy**, que escrevia o endereço inteiro no registro de acesso e no de
    erros. O `Caddyfile` ganhou o filtro (`request>uri query { replace chave REDACTED }`, no registro de
    acesso e no padrão) — por isso o 2.0.1 pede o Caddy recriado na subida, e a chave usada nos testes
    de antes deve ser trocada (revogar e criar outra).
  - **A pergunta pelo texto**: `{{pergunta: …}}` (e `{{menu: …}}`) acha a resposta pelo texto da
    pergunta — igual, sem ligar para acento, maiúscula e pontuação, ou o único texto que contém o pedaço.
    O código do bloco muda de uma cópia do robô para outra (a de teste e a de produção); o texto não. A
    lista de variáveis põe pelo texto quando ele é único no pedido (pelo código continua dando). E a
    variável que não veio (o código de outra cópia) é contada no último pedido e na auditoria
    ("faltaram"), não só na tela.
  - `{{a || b || c || d}}`: quantas alternativas quiser (já era assim; ficou no teste e na tela).

  Depois, **os parâmetros do webhook** ("eu quero que eu possa alterar incluindo ou removendo
  parametros que vao chegar no webhook e eu possa configurar isso na tela… e alem disso vc fazer um
  preview de como deve chegar o webhook"):
  - O mapa ganhou **a lista do que chega** (`parametros`, até 60): cada parâmetro tem um nome curto
    (letras, números, `_` e `-`; sem repetir, sem maiúscula contar; `codigo`, `contato`, `pergunta`,
    `menu` e `endereço` são reservados), a **origem** — o que iria entre `{{ }}`: o caminho no JSON, a
    pergunta pelo texto, `endereço: setor` ou outro parâmetro, com `||` e texto fixo — um exemplo e
    para que serve. Os campos usam o parâmetro pelo nome (`{{empresa}}`): o nome vale antes do caminho.
    O que não virou parâmetro continua valendo direto no campo (o mapa de antes funciona igual).
  - **O endereço também traz parâmetros**: o que vier depois da chave (`?chave=…&setor=suporte`) chega
    ao mapa como `endereço: setor`; a chave nunca (nem no último pedido, que agora guarda o endereço
    sem ela), e a origem `endereço: chave` é recusada.
  - O de fábrica vem com quatro (`nome`, `whatsapp`, `conversa`, `mensagem`) e os campos com eles. Na
    tela: incluir escolhendo no pedido (o nome e o exemplo saem sugeridos) ou escrevendo; ao lado de
    cada um, se veio no pedido de conferência e em que campos está; **renomear** muda os campos,
    a mensagem e as origens que o usam; **tirar** o que está em uso pergunta antes e diz onde (os
    campos ficam com o nome sem valor, e o aviso "não veio" aparece). Nada vai para o robô antes do
    "Salvar o mapa" (a auditoria diz "Parâmetros").
  - **Como deve chegar o webhook**: o endereço e o JSON, para conferir e copiar. O pedido colado
    também aceita o endereço.
  - **Nas etiquetas, cada uma vale por si**: `robô, {{setor}}` sem o setor fica com a etiqueta robô (a
    regra do "tudo vazio" ficou por etiqueta; nos outros campos continua pelo texto inteiro).

  E, revendo a tela ("como deve chegar no webhook, parece que está errado o exemplo… parece que deu uma
  embaralhada"), o **Como deve chegar o webhook foi refeito**: a primeira versão montava só os pedaços
  que o mapa lê (`contact.name`, `sessionId`… soltos), com códigos inventados para as perguntas
  (`<código do bloco 1>`, mesmo quando o pedido tinha o de verdade) e `"<…>"` no que um campo lia
  direto — um parâmetro que saiu virava até uma chave solta na raiz. E o "Experimentar o mapa com ele"
  trocava o pedido de conferência por esse pedido montado.
  - Agora é **o pedido inteiro, no formato do bloco Enviar webhook** (`pedidoEsperado(mapa, pedido,
    endereço)`): o pedido de conferência — o último do robô, um fictício ou um colado —, com cada lugar
    que o Gestor lê marcado ao lado (o parâmetro, ou o campo que lê direto). A pergunta pelo texto aponta
    o **bloco de verdade**, com o código dele. O que não veio entra no lugar onde deve chegar, com o
    exemplo do parâmetro, marcado em amarelo; a pergunta que o pedido não tem entra num bloco com o código
    por preencher (`cb-…-qst-…`). O que um campo lê e não existe no pedido nem é parâmetro não é
    inventado: vira um aviso embaixo ("confira o nome"). Na tela, o que o Gestor não lê fica recolhido
    (`{ … }`, "… e mais 11", em `linhasDoPedido`); o Copiar leva o JSON inteiro.
  - Saiu o **Experimentar o mapa com ele**, e o cartão ficou em **três partes numeradas** — 1 · O que
    chega no webhook (os parâmetros e o "Como deve chegar"), 2 · O que vira chamado (os campos), 3 · Como
    fica o chamado —, com o **Conferir com** em cima (o último pedido do robô, um pedido fictício, um
    pedido colado). O "exemplo do LineChat" virou o **pedido fictício**: "exemplo" ficou só para o exemplo
    de cada parâmetro.

## Revisto no 2.0.2 (20/10/2026): a mensagem de cada aviso no WhatsApp

O Luan mandou o print do aviso antigo do observador (o do fluxo **Atualização de Card** do n8n, que
ainda roda no Helena) e pediu: *"a notificação dos observadores tbm n ficou legal, veja como tínhamos
antes, era bem melhor, faça algo que dê para nós personalizarmos inclusive as variáveis"*. O WhatsApp da
equipe saía numa frase só, mais o código, o título e o link; o antigo trazia o Painel, o Card, a Nota,
quem comentou, o Cliente e o Link, cada um numa linha, com emoji e negrito. Como o 2.0.2 não subiu,
entrou nele.

- **Cada aviso tem a sua mensagem no WhatsApp**, em **Painéis › Ajustes › Avisos e WhatsApp**, no cartão
  novo **A mensagem de cada aviso no WhatsApp**: a lista dos dez avisos (no celular, uma caixa de
  escolha), o texto, os **botões das variáveis** (põem a variável onde está o cursor) e a **prévia no
  balão**, com um exemplo e o negrito (`*assim*`), o itálico (`_assim_`) e o riscado (`~assim~`) do
  WhatsApp. Na tabela "Quais avisos vão por onde", cada aviso ganhou o link **a mensagem** (ou "a
  mensagem (editada)"). **Voltar à padrão** desfaz; **Mandar o exemplo para mim** manda a mensagem da
  tela (salva ou não), com o exemplo, para o WhatsApp de quem está na tela, pelo número da equipe e com a
  primeira linha *"Teste do Ingline Gestão: um exemplo…"* (quem recebe não confunde com um chamado).
- **As variáveis**, entre chaves e sem distinguir maiúscula:
  - as do chamado, em todos os avisos de chamado: `{painel}`, `{etapa}`, `{codigo}`, `{titulo}`,
    `{prioridade}`, `{cliente}`, `{contato}`, `{responsavel}`, `{assunto}`, `{relato}` (o começo, até 300
    letras) e `{link}` — lidas na hora de mandar;
  - as do que aconteceu: `{aviso}` (a frase do sininho, sem o trecho da nota) em todos; `{quem}` (quem fez)
    em todos menos os do relógio (os prazos e o sem responsável); `{nota}` (a anotação inteira, até 1.500
    letras) na citação e no observador; `{novidade}` (o que mudou, sem quem fez: "Moveu para N2", "Passou
    para Bruno Técnico", "Marcou: esperando o cliente (…)", "Mandou para a lixeira"…) só no observador —
    na anotação ela fica vazia, porque a nota já é a novidade;
  - as do lembrete do calendário (decisão 0049): `{aviso}`, `{evento}`, `{tipo}`, `{quando}`, `{local}`,
    `{cliente}`, `{chamado}`, `{pessoas}`, `{paineis}`, `{observacao}` e `{link}`;
  - as do aviso **"Um evento entrou no calendário"** (o décimo aviso, também do 2.0.2: decisão 0049), as
    mesmas do lembrete e mais `{quem}` (quem pôs o evento). A mensagem padrão dele começa por
    `🗓️ *Novo no calendário:*` e termina com `👤 *Quem pôs:*` e o link.
- **A linha em que todas as variáveis vêm vazias não vai** (a escolha foi minha, avisada a ele: no print,
  o "Cliente:" chegava em branco). A linha só de texto vai sempre; linhas em branco seguidas viram uma.
  A mensagem vai até 4.000 letras.
- **As padrão** seguem o jeito antigo. A do observador é a do print, com o Card levando o código:
  `🔎 *Painel:*` · `📌 *Card:* {codigo} · {titulo}` · `🔔 *Novidade:*` · `📝 *Nota:*` · `👤 *Quem:*` ·
  `👨‍💼 *Cliente:*` · `🔗 *Link do Card/Painel:*`. As outras começam pela frase do aviso em negrito, com
  o emoji dele (📥 recebeu e etapa, 💬 citado, ⏰ prazo perto, 🚨 prazo vencido, 🙋 sem responsável, 🔴
  Crítico), e trazem o painel, o card, a prioridade, o responsável, o cliente e o link, conforme o aviso.
  A do lembrete: `⏰ *Lembrete:*`, `🗓️ *Quando:*`, `📍 *Local:*`, `👨‍💼 *Cliente:*`, `📌 *Chamado:*`,
  `📝 *Observação:*` e `🔗 *Link:*`.
- **Guardado** em `settings.atendimento-avisos` (`modelos`), só as que mudaram da padrão: a vazia e a
  igual à padrão voltam a seguir a padrão (que pode melhorar numa versão nova). Ao salvar, a variável que
  o aviso não tem é recusada, dizendo qual e em que aviso (*"{cotato} não é variável dele"*) — o erro de
  digitação sairia no WhatsApp entre chaves; a tela avisa enquanto se escreve. A auditoria diz *"mudou a
  mensagem do aviso: …"* (ou *"(voltou à padrão)"*), com o antes e o depois, e o exemplo mandado também
  entra nela.
- **O sininho não muda**: continua com a frase curta (é o mesmo texto de antes).
- **O que não mudou**: quem recebe, por onde (a tabela "Quais avisos vão por onde") e o observador no
  WhatsApp **desligado de início** — quem quiser liga na tabela. As mudanças de campo continuam só na
  tela.
- **No código**: as regras (`variaveisDoAviso`, `MODELOS_DOS_AVISOS_PADRAO`, `preencherAviso`,
  `variaveisDesconhecidas`, `modelosParaGuardar`, `EXEMPLOS_DOS_AVISOS`) em
  `packages/shared/src/atendimento.ts`; o servidor monta a mensagem em segundo plano
  (`mensagemDoAvisoDoChamado`, em `services/atendimento/avisos.ts`), com o que cada ação contou (`quem`,
  `nota`, `novidade`, `aviso`). A prévia confere e guarda do mesmo jeito (nada sai de verdade).

## Revisto no 2.0.3 (21/10/2026): as etiquetas de cada painel, a barra da ficha, o quadro até o pé da tela e a lista que inclui na hora

Num documento com prints (o "pacote de melhorias" de 21/10), com o 2.0.2 no ar. Avisado antes (as etiquetas
eram as mesmas em todos os painéis; o campo não mudava de tipo), e as palavras dele pediam a mudança.

- **Cada painel tem as suas etiquetas** (*"as etiquetas tem q ser por painel, cada painel vai ter suas
  etiquetas"*). `ticket_tags` ganhou `panel_id`, e o nome não se repete **dentro do painel** (o mesmo nome
  pode estar em dois, cada um com a sua cor). A migração `0023` pôs cada etiqueta nos painéis dos chamados
  que a têm (os da lixeira também), com o mesmo nome e a mesma cor; a que nenhum chamado usava foi para os
  painéis de chamados (Gestão), não para os de Vendas — as de antes nasceram no Suporte (o robô, a NIA). As
  opções da tela trazem o painel de cada etiqueta (`EtiquetaNoPainel`; `etiquetasDoPainel` filtra); o seletor,
  a cor dos cartões e o filtro da lista usam as do painel do chamado (na lista de Todos, os nomes de todos,
  sem repetir). **Ajustes › Etiquetas** escolhe o painel (a mesma escolha da aba Campos, `EscolhaDoPainel`), e
  criar pede o painel; editar renomeia só nos chamados do painel; tirar olha só os chamados do painel. O
  editar pelo nome (o seletor) leva o painel. **Trocar de painel leva as etiquetas**: as que faltam no painel
  novo entram nele com a cor que tinham no antigo (`levarEtiquetas`). A auditoria diz o painel.
- **As Etiquetas e o Agendar ao lado do Mover**, na barra de ações da ficha (*"etiquetas tem q ficar fácil
  ali do lado de mover e pra agendar tbm pode até manter o agendar abaixo que já existe"*): o botão
  Etiquetas abre o mesmo seletor (o `SeletorDeEtiquetas` ganhou o `gatilho`, um botão no lugar da caixa) e o
  Agendar abre a janela do evento (o `useAgendar`, o mesmo do Na agenda). A caixa das etiquetas e o Na agenda
  continuam embaixo. **Os botões da barra ficaram menores** (*"esses botões estão muito grandes, podem ser
  um pouco menor"*): a classe `btn-xs`.
- **O quadro vai até o pé da tela** (*"essa barra de rolagem tem q ficar bem abaixo"*): com poucos cartões,
  a barra de rolar para o lado ficava logo abaixo do cartão mais baixo, no meio da tela. No computador, o
  quadro tem a altura que sobra da janela (menos a folga do pé da página, para a página não rolar), as
  colunas esticam e cada uma rola por dentro.
- **A lista que inclui na hora** (a Indicação do Comercial: *"a indicação tem q ser predefinido e eu tenho
  que conseguir criar por aqui mesmo se quiser"*): a lista de uma opção ganhou a marca **"Quem trabalha
  inclui uma opção ali mesmo"** (`ticket_fields.inline_options`, `incluirNaHora`). No Abrir chamado e na
  ficha, a caixa de escolher mostra o **Incluir** quando o que foi escrito não é nenhuma opção
  (`EscolherComBusca` com `criar`); a opção entra na lista do campo pela rota nova `POST
  /api/atendimento/campos/:id/opcoes` (`tickets.work`, quem vê o painel; a mesma escrita de outro jeito volta,
  a desativada é reativada; até as 50 opções; na auditoria). O nome que chega pela API, pelo n8n ou pelo robô
  e não está na lista também entra nela (`incluirOpcoesEscritas`), para nada parar. A lista que inclui na
  hora pode nascer vazia. **Revê "o tipo não muda"** num ponto só: a migração `0023` passou o campo
  **Indicação** (texto) de cada painel de Vendas para essa lista — o que já tinha sido escrito virou opção
  (sem repetir, sem ligar para maiúscula) e cada negociação ficou com a sua; o id do campo não muda. Na tela,
  o tipo continua sem mudar.

## Revisto no 2.1 (23/10/2026): o botão da NIA na ficha e a conversa ligada à mão

Dois pedidos do Luan no mesmo dia, com o 2.0.4 no ar.

- **O botão da NIA** (*"para eu fazer a ia preencher o chamado hoje eu tenho que etiquetar, só que isso eu acho
  meio gambiarra, devíamos ter um botão aqui para mandar ela preencher e se já tiver sido feito ele fica com
  alguma marcação dizendo que já foi feito e se eu clicar ele me mostra algumas informações como data"*), na
  barra de ações da ficha, ao lado do Preencher com IA:
  - **Por baixo é a mesma etiqueta**: o botão põe a de pedir (NIA - PREENCHER) e tira a de pronto e a de erro
    (`etiquetasAoPedirANia`); o `chamado.alterado` vai ao n8n com ela, como quando a equipe etiquetava — **o
    fluxo da NIA não muda**. A rota é `POST /api/atendimento/chamados/:id/nia` (`tickets.work`): o histórico
    mostra a troca das etiquetas por quem pediu, e a auditoria diz *"Pediu à NIA para preencher SUP-12"* (ou
    *"… de novo"*). Escolhido assim para não tocar no fluxo do n8n, que roda em produção.
  - **O botão diz em que pé está** (`resumoDaNia`, em `packages/shared/src/nia.ts`), lido das etiquetas e do
    histórico — vale também para o chamado etiquetado à mão antes do botão: **Preencher com a NIA** (nunca
    pedida), **NIA preenchendo…** (a ficha se relê de 5 em 5 segundos, por até 15 minutos), **NIA preencheu**
    (verde) e **NIA não preencheu** (vermelho). O clique abre a janelinha: quando ela respondeu e por qual
    chave, quando foi pedida e por quem, os campos que ela mudou (os que a chave dela mexeu entre o pedido e 2
    minutos depois da resposta; as etiquetas só quando ela pôs outra além das do combinado), quantas
    anotações fez (a Situação e o Diagnóstico) e quantas vezes já preencheu; e **Preencher de novo** (ou
    **Tentar de novo**). Com a ficha aberta, a resposta chega com um aviso (*"A NIA preencheu o SUP-12: Título
    e Descrição"*). A etiqueta sem a data no histórico (de antes do Gestor) mostra a situação sem as datas.
  - **Pedir de novo, só depois de 10 minutos** sem resposta (`NIA_PEDIR_DE_NOVO_MINUTOS`): antes, o servidor
    recusa (*"A NIA foi chamada às 10:41 e ainda está preenchendo…"*). O pedido parado sai e volta — dois
    avisos ao n8n, e o fluxo age no segundo.
  - **Sem a conversa do LineChat**, o botão avisa antes de pedir (a NIA lê só o título, o relato e a
    descrição) e oferece **Ligar a conversa** (abaixo); com ela, o clique já pede.
  - **Painéis › Ajustes › IA** ganhou o cartão **A NIA na ficha**: liga e desliga o botão e diz as três
    etiquetas (pedir, pronto e erro; de fábrica, as do Helena; as três diferentes, sem contar maiúscula e
    acento). Guardado em `settings.atendimento-integracoes` (`nia`), junto dos sites e do link da conversa;
    só a administração (`admin.manage`) muda, e vai para a auditoria. As opções da tela trazem `nia` (nula
    com o botão desligado). A negociação (o painel de Vendas) não tem a NIA.
- **A conversa ligada à mão** (*"mais de 99% são receptivos, mas alguns são ativos ... a gente quer poder abrir
  chamado manualmente, como já faz. Só que também tem que ter a possibilidade de associar uma sessão ... para
  que a IA consiga ler ... Eu posso editar ou colocar o link de alguma outra conversa"*):
  - No **Abrir chamado**, o campo **Conversa no LineChat** (opcional, junto do contato); na **ficha**, no
    cartão do contato, **Ligar a conversa do LineChat** (o chamado sem conversa) e **Trocar** (com ela), com
    **Tirar a conversa**. Cola-se o link da conversa (o endereço da conversa aberta no LineChat) ou o código
    da sessão; a tela diz logo a sessão que achou ou o que está errado.
  - **Quem acha a sessão no link é o servidor** (`sessaoDaConversa`, em `@gestor/shared`; a tela usa a mesma):
    pelo modelo do link das Integrações ("https://…/{sessao}": o pedaço no lugar do {sessao}); sem modelo, ou
    com outro endereço, pelo código de sessão do LineChat (um uuid) que estiver no link; o código sozinho
    também vale (e o "sessão 8385…" copiado da ficha). O uuid fica em minúsculas, como o LineChat manda. O
    link sem a sessão, o com dois códigos, o texto com espaço e o código curto demais são recusados, dizendo
    o que colar. As opções da tela trazem o modelo (`linkConversa`).
  - **Grava na mesma `tickets.session_id` do robô**: a ficha mostra o link; a NIA (o `sessaoId` do `GET
    /integracao/chamados/:ref`) e o Preencher com IA leem a conversa; e **o robô acha o chamado ativo pela
    conversa** — a resposta do cliente na mesma conversa vira anotação nele, sem abrir outro. O histórico diz
    *"mudou Conversa no LineChat de … para …"*; a auditoria e o aviso ao n8n também (`mudancas:
    ['sessaoId']`); o n8n liga pela chave (`PATCH … { sessaoId }`).
  - **O robô, o n8n e o agendado, ao abrir, mandam o código como o LineChat deu**, e ele fica como veio: ler o
    link é só para quem abre na tela (o robô acha o chamado aberto da conversa pelo código exato).

## Revisto no 2.1.2 (26/10/2026): abrir a ficha e o quadro sem esperar

O Luan: *"ta demorando muito pra abrir os cards e os paineis, isso ta acontecendo constantemente"* (o print da
janela parada no "Abrindo…"). Medido no Chrome dele: o servidor responde a ficha em ~0,2 s e o quadro em ~0,25 s;
o resto era a tela. Abrir um cartão redesenhava o quadro inteiro três vezes, e cada cartão criava quatro
formatadores de data com fuso a cada desenho (50 a 80 ms por redesenho com uns 60 cartões; 4x isso num PC lento).

- **Os formatadores de data e de dinheiro são criados uma vez só** (`diaBrasil` do `dataHoraCurta`, o
  `dataCompleta` da ficha, o `data` das tabelas, o `reaisInteiros`, o `reais` e os do Simulador). Criar um
  `Intl.DateTimeFormat` com fuso custa ~0,3 ms; formatar com um pronto, microssegundos.
- **A tela de baixo fica parada enquanto a janela abre e fecha** (`Equipe.tsx`): as rotas da tela moram num
  componente memorizado (`TelaDeBaixo`), e o endereço dela vem por um `LocationContext` que só muda quando a tela
  muda (`useMesmaTela`: o mesmo passo do histórico, no mesmo caminho, é o mesmo objeto). O que muda dentro dela
  (o quadro relido, um filtro, um aviso) continua se desenhando sozinho, pelas consultas e pelos contextos.
- **Abrir a ficha não mexe mais no quadro** (`mesmoCartao`): a ficha lida que é o mesmo cartão do quadro (o
  mesmo `atualizadoEm`, a mesma última atividade, a mesma etapa e o mesmo painel) não troca o cartão — antes,
  trocava pelo igual e o quadro inteiro se redesenhava. O que escapar, a releitura do quadro depois de mudar
  (`useDepoisDeMudar`) acerta.
- **Ler antes do clique** (`useLerAFichaAntes`, `useLerOQuadroAntes`): o mouse parado 90 ms em cima do cartão do
  quadro, da linha da lista, do Abrir o quadro ou do Painel do Suporte / do Comercial do menu já busca (o dedo
  encostando e o Tab chegando, na hora). A busca é a mesma da tela (a mesma chave): no clique, a janela abre com
  ela. Passar o mouse varrendo a tela não busca nada.
- **O servidor diz quanto levou** (`Server-Timing: app;dur=…` em toda resposta) e o pedido de 1,5 s ou mais vai
  para o log como *pedido lento* (o método, a rota — o molde, sem o que vem depois do "?" —, o status e os ms).
  Da próxima vez, dá para separar a demora do servidor da demora da rede e da tela.
- Na prévia (CPU normal / 4x mais lenta): abrir a ficha 324 → 223 ms / 1.123 → 782 ms; fechar 118 → 42 ms /
  401 → 218 ms (a prévia espera 120 ms em cada leitura, de propósito). Com a leitura antes do clique, a ficha
  abre em ~0,1 s.

## Revisto no 2.1.2 (26/10/2026): o painel escolhe os campos que usa, na própria janela

O Luan, no editor do painel "Luan - Pessoal": *"quero poder editar tbm os campos personalizados do painel pq tem
muitos que a depender do painel que eu cria, n vou usar"*. Perguntado, escolheu poder desligar também o Cliente e
o Contato, o Relato do cliente, a Solução e a Causa e a Prioridade, numa aba da janela do painel.

- **Os campos do sistema** (`CAMPOS_DO_SISTEMA`) ganham `cliente` (o cliente e o contato), `relato`, `solucao` (a
  solução e a causa) e `prioridade`, só no painel de Gestão (`camposDoSistemaDoTipo`: o de Vendas continua com os
  seis de antes). Desligado, o que vale para os outros vale para eles: some da ficha, do Abrir chamado e do
  cartão, sai das regras (para abrir e das etapas, `OBRIGATORIOS_DO_CAMPO`), o que vier pela API, pelo robô ou pelo
  agendado fica de fora (`criar`, `alterar`) e o que já estava guardado volta ao ligar de novo.
- **Sem a prioridade, não há prazo** (`painelContaPrazo`: o "conta prazo" e a prioridade ligada; nenhuma
  prioridade sugerida). O "conta prazo" fica guardado e volta junto com a prioridade.
- **O problema (ITIL)** continua com a solução e a causa (e pedindo as duas para fechar), mesmo no painel que as
  desligou.
- **A aba "Os campos"** na janela do painel (novo ou editar), entre As etapas e As regras: um botão por campo, com
  a dica. As caixinhas do que cada etapa pede já seguem o que está ligado na janela, antes de salvar. A árvore do
  Assunto, as opções do Tipo e os campos que a equipe cria continuam em Painéis › Ajustes › Campos (que também
  liga e desliga os quatro novos).

## Revisto no 2.1.4 (27/10/2026): o painel desativado também sai do meio dos Ajustes

O 2.1.2 tirou o painel desativado da tela **Painéis** e deixou a linha "N painéis desativados não aparecem aqui", com o
caminho para reativar em **Painéis › Ajustes › Painéis**. Ali ele continuava na grade, ao lado dos que estão em uso, só
com o chip "desativado". O Luan, 27/10: *"esse painel comercial foi desabilitado e mesmo assim ta aparecendo aqui, n
tinhamos visto isso pra n aparecer mais?"*.

- **Nos Ajustes › Painéis, só os que estão em uso na grade.** Os desativados vão para o fim, numa parte fechada
  **Desativados (N)**, com a linha *"Não aparecem na tela Painéis nem recebem chamado novo. Para reativar: Editar › Painel
  ativo."* Clicar abre os cartões deles, com o Editar de sempre.
- **Vindo pelo "ver em Ajustes › Painéis"** da tela dos painéis (`?desativados=1`), a parte já abre aberta.
- Continua nos Ajustes (e não some de vez) porque é ali que se reativa, e porque os chamados do painel continuam lá.
