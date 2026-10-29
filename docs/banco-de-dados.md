# Banco de dados — o que o Ingline Gestão guarda

> Gerado automaticamente a partir de `packages/db/src/schema.ts` por `pnpm db:docs`. **Não edite à mão**: edite o comentário no schema e gere de novo.

Cada seção é uma tabela (pense numa planilha com colunas fixas). "Liga com" indica que a coluna guarda o identificador de uma linha de outra tabela — é assim que as tabelas se relacionam.

Convenções: dinheiro em centavos inteiros · CNPJ, DID e MAC guardados só com dígitos/hexadecimais · `deleted_at` preenchido = lixeira · senhas só na tabela **secrets**, cifradas.

## Índice

- [clients](#clients) — Uma linha por empresa.
- [client_logos](#client_logos) — A logo do cliente, guardada no próprio banco (uma linha por cliente que tem logo).
- [client_units](#client_units) — As UNIDADES de um cliente: matriz, filiais, lojas, andares.
- [client_contacts](#client_contacts) — OS CONTATOS DO CLIENTE (2.0, o pedido do Luan na prévia): as pessoas do cliente com quem a equipe fala — o nome, o WhatsApp, o e-mail e o cargo (ou o setor).
- [contact_roles](#contact_roles) — Catálogo: OS CARGOS DOS CONTATOS (2.0.2, o pedido do Luan: "eu quero que esses cargos sejam pré-seleção").
- [client_device_logins](#client_device_logins) — LOGIN E SENHA PADRÃO DOS APARELHOS do cliente, POR MODELO: todos os GXP1610 de um cliente entram com o mesmo login e senha; os DP722, com outro.
- [client_network_settings](#client_network_settings) — CONFIGURAÇÃO DE REDE PADRÃO dos aparelhos do cliente: o que a equipe digita nos telefones na hora de configurar (IP, máscara, gateway, DNS) e a senha do ramal sem fio.
- [products](#products) — Catálogo dos produtos vendidos (LinePBX, LineChat, LineReports, SZChat, VoiceNet, Equipamentos — gerenciável pela Administração).
- [product_modules](#product_modules) — Catálogo de MÓDULOS: partes opcionais dentro de um produto.
- [subscriptions](#subscriptions) — "O cliente X assina o produto Y." Uma linha por par cliente × produto.
- [linepbx_settings](#linepbx_settings) — Configuração própria do LinePBX: onde está o servidor e como acessá-lo.
- [subscription_modules](#subscription_modules) — "Na assinatura X, o módulo Y está ligado." Uma linha por par assinatura × módulo.
- [fop2_settings](#fop2_settings) — Configuração própria do módulo FOP2 (dentro do LinePBX).
- [omniboard_settings](#omniboard_settings) — Configuração própria do módulo Omniboard (call center, dentro do LinePBX).
- [szchat_settings](#szchat_settings) — Configuração própria do SZChat (legado Fortics).
- [hosting_providers](#hosting_providers) — Catálogo: onde um servidor pode estar hospedado (Local, Vultr, AWS, Contabo, Hetzner...).
- [carriers](#carriers) — Catálogo: operadoras que fornecem circuitos (ALGAR, VC1...).
- [circuits](#circuits) — Um circuito (feixe) contratado junto a uma operadora.
- [dids](#dids) — Um número telefônico.
- [device_categories](#device_categories) — Catálogo: categoria de aparelho (Telefone IP, Periférico, ATA...).
- [device_models](#device_models) — Um modelo de aparelho (ex.: Grandstream GXP1610).
- [device_model_images](#device_model_images) — A foto do modelo, no próprio banco (como a logo do cliente).
- [devices](#devices) — Um aparelho.
- [device_movements](#device_movements) — Cabeçalho de uma movimentação: de onde, para onde, por quê, quem, quando.
- [device_movement_items](#device_movement_items) — Um aparelho dentro de uma movimentação.
- [device_movement_receipts](#device_movement_receipts) — O recibo de entrega de uma movimentação para cliente (Patch 1.9, decisão 0042): PDF ou foto, até 10 MB cada e até 5 por movimentação, anexado na hora de movimentar ou depois.
- [roles](#roles) — Um papel = um nome + uma lista de permissões (ver packages/shared/src/permissoes.ts).
- [users](#users) — Quem entra no sistema.
- [settings](#settings) — AJUSTES DO SISTEMA que a pessoa preenche na tela (Administração › Ajustes), em vez de mexer em arquivo no servidor.
- [sessions](#sessions) — Sessão de login (cookie).
- [secrets](#secrets) — O COFRE.
- [audit_log](#audit_log) — Quem fez o quê, em qual registro, quando — com o antes e o depois.
- [release_notes](#release_notes) — Uma NOTA DE VERSÃO ("o que mudou na rodada 23").
- [release_note_items](#release_note_items) — Um item da nota: o cartão que a pessoa vê, um por vez.
- [release_note_images](#release_note_images) — O print de um item, no próprio banco (como a logo do cliente e a foto do modelo).
- [release_note_reads](#release_note_reads) — "Fulano leu a nota da rodada 23 em tal dia." Uma linha por pessoa × nota.
- [release_note_videos](#release_note_videos) — O vídeo do patch (Patch 1.9, decisão 0046): quando a nota tem vídeo, é ele que abre no login, no lugar dos cartões (os cartões continuam na página Novidades).
- [projects](#projects) — Um projeto é uma tarefa que percorre VÁRIOS clientes até acabar ("trocar o áudio da URA de todos os clientes com PBX").
- [project_steps](#project_steps) — Uma etapa (coluna) do projeto.
- [project_clients](#project_clients) — Um cliente dentro do projeto: a linha que o técnico trabalha.
- [project_checks](#project_checks) — O que foi marcado numa etapa, para um cliente: "fulano marcou, em tal dia".
- [project_comments](#project_comments) — Um comentário.
- [project_attachments](#project_attachments) — Um anexo: planilha, documento, print, áudio da URA — qualquer formato, até o limite da tela.
- [linechat_steps](#linechat_steps) — As etapas (colunas) do painel, na ordem em que aparecem no Kanban.
- [linechat_fields](#linechat_fields) — Os campos personalizados do painel (Cliente, Produto, Assunto, Tipo de chamado…).
- [linechat_tags](#linechat_tags) — As etiquetas do painel (P/ Alta, NIA - ERRO, StandBy…), com a cor de lá.
- [linechat_cards](#linechat_cards) — Um chamado (card do LineChat), do jeito que ele estava na última sincronização.
- [linechat_card_moves](#linechat_card_moves) — Cada vez que um chamado mudou de etapa.
- [linechat_sync_runs](#linechat_sync_runs) — O registro das sincronizações: quando rodou, o que leu, o que mudou e se deu erro.
- [knowledge_articles](#knowledge_articles) — Um artigo.
- [knowledge_versions](#knowledge_versions) — Cada versão do texto de um artigo, inteira, para comparar e voltar atrás.
- [knowledge_links](#knowledge_links) — "Este artigo fala de…": a ligação com o que o Gestor já tem.
- [knowledge_attachments](#knowledge_attachments) — Um arquivo do artigo, no próprio banco (como os anexos dos projetos: entra no backup).
- [knowledge_reads](#knowledge_reads) — "Fulano leu o artigo (de leitura obrigatória) em tal dia." Uma linha por pessoa × artigo; ler de novo atualiza a data.
- [knowledge_comments](#knowledge_comments) — Um comentário no artigo: o que a equipe viu depois ("aconteceu de novo, era outra coisa"), sem mexer no texto.
- [portal_users](#portal_users) — Uma pessoa do cliente com acesso ao portal.
- [portal_sessions](#portal_sessions) — A sessão de quem entrou no portal (como `sessions`, mas do cliente).
- [portal_articles](#portal_articles) — Um tutorial do portal.
- [portal_files](#portal_files) — Um arquivo do portal: `imagem` (print no texto), `video` ou `arquivo` (para baixar).
- [ticket_panels](#ticket_panels) — Um PAINEL (o Kanban de uma equipe): Suporte, Desenvolvimento, e os que a administração criar (Interno, Administrativo, Comercial…).
- [ticket_stages](#ticket_stages) — Uma ETAPA (coluna) de um painel, na ordem do quadro.
- [ticket_subjects](#ticket_subjects) — Um ASSUNTO, em árvore (até 3 níveis), de um painel.
- [ticket_fields](#ticket_fields) — Um CAMPO de um painel (o pedido do Luan na prévia: "vou ter outros painéis, então nem sempre vai ser assuntos"): os que cada equipe cria além dos do sistema — o "Sistema" e a "Versão publicada" no Desenvolvimento, por exemplo.
- [tickets](#tickets) — Um CHAMADO.
- [ticket_events](#ticket_events) — O HISTÓRICO do chamado: cada mudança vira uma linha (etapa, responsável, campo, prioridade, espera, ligação, aviso…), com quem fez e quando.
- [ticket_notes](#ticket_notes) — Uma ANOTAÇÃO no chamado (o que a equipe registra no meio do caminho).
- [ticket_attachments](#ticket_attachments) — Um ANEXO de anotação (print, PDF, planilha, áudio), no próprio banco como os anexos dos projetos: entra no backup sem mudar nada.
- [ticket_links](#ticket_links) — Uma LIGAÇÃO feita à mão entre dois chamados: relacionado, duplicado de, repete.
- [ticket_time_entries](#ticket_time_entries) — O TEMPO GASTO: quem trabalhou no chamado, quanto e quando (o relatório da visita técnica).
- [ticket_carrier_cases](#ticket_carrier_cases) — O CHAMADO ABERTO NA OPERADORA: o protocolo, quando abriu, o prazo que a operadora prometeu e as cobranças — num lugar só, em vez de perdido nas anotações.
- [ticket_schedules](#ticket_schedules) — Um CHAMADO AGENDADO: nasce sozinho na hora marcada (a verificação dos DIDs todo dia 15).
- [ticket_macros](#ticket_macros) — Uma RESPOSTA PRONTA: um clique manda a mensagem e muda o chamado ("Pedir teste ao cliente" manda o texto e marca que o chamado espera o cliente).
- [ticket_tags](#ticket_tags) — Uma ETIQUETA e a COR dela (2.0, o pedido do Luan na prévia: "na hora de criar as etiquetas, escolher a cor").
- [ticket_contacts](#ticket_contacts) — O TELEFONE QUE O GESTOR JÁ CONHECE: o WhatsApp de um contato e o cliente dele, aprendido dos chamados.
- [ticket_notifications](#ticket_notifications) — Um AVISO NA TELA (o sininho): recebeu um chamado, o prazo está vencendo, o cliente respondeu…
- [ticket_webhooks](#ticket_webhooks) — Um AVISO PARA FORA (webhook): o Gestor manda o que aconteceu com os chamados para outro sistema (o n8n).
- [ticket_api_keys](#ticket_api_keys) — Uma CHAVE DE API para o robô do LineChat e o n8n abrirem e mexerem nos chamados.
- [calendar_events](#calendar_events) — Um EVENTO do calendário: o que acontece, de que equipe, com quem, em qual cliente e quando.
- [sales_simulations](#sales_simulations) — Uma SIMULAÇÃO do Comercial: o nome, os cenários e a negociação ligada.


---

# 1. CLIENTES E PRODUTOS

## clients

Uma linha por empresa. Inclui também as organizações internas do grupo (Ingline Systems, VoiceNet), marcadas com `isInternal`, porque elas aparecem como "titular" de DIDs, circuitos e aparelhos.

| Coluna | Tipo | O que guarda | Regras |
|---|---|---|---|
| `id` | texto | Identificador único da linha | chave primária |
| `trade_name` | texto | Nome fantasia — o nome pelo qual a equipe chama o cliente | obrigatório |
| `legal_name` | texto | Razão social — o nome jurídico | obrigatório |
| `cnpj` | texto | CNPJ com 14 dígitos, sem pontuação. Único no sistema. | obrigatório |
| `archived` | sim/não | Arquivado = some da lista padrão, mas não é apagado (era "ocultar" no Nexus) | obrigatório · padrão: false |
| `is_internal` | sim/não | Organização do próprio grupo (Ingline, VoiceNet). Não conta como cliente nos indicadores. | obrigatório · padrão: false |
| `internal_code` | texto | Código curto para as internas ("ingline", "voicenet"); nulo para clientes | — |
| `notes` | texto | Anotações gerais sobre o cliente | — |
| `created_at` | data e hora | Quando a linha foi criada | — |
| `updated_at` | data e hora | Última alteração | — |
| `deleted_at` | data e hora | Preenchido quando foi mandado para a lixeira | — |

## client_logos

A logo do cliente, guardada no próprio banco (uma linha por cliente que tem logo). Fica em tabela separada para não pesar as consultas de lista: a imagem só é lida quando alguém a exibe. A interface reduz a imagem antes de enviar; o servidor recusa acima de 512 KB.

| Coluna | Tipo | O que guarda | Regras |
|---|---|---|---|
| `client_id` | texto | — | chave primária · liga com **clients** |
| `mime_type` | texto | Tipo da imagem: image/png, image/jpeg, image/webp, image/svg+xml | obrigatório |
| `data_base64` | texto | A imagem em base64 (sem o prefixo "data:") | obrigatório |
| `size_bytes` | número inteiro | Tamanho aproximado em bytes, para exibir e limitar | obrigatório · padrão: 0 |
| `updated_at` | data e hora | Última alteração | — |

## client_units

As UNIDADES de um cliente: matriz, filiais, lojas, andares. Todo cliente tem a "Matriz", criada sozinha; as outras se cadastram na ficha do cliente. É daqui que sai a lista de unidades na hora de movimentar aparelhos. O aparelho guarda o NOME da unidade (`devices.unit`); renomear aqui renomeia nos aparelhos.

| Coluna | Tipo | O que guarda | Regras |
|---|---|---|---|
| `id` | texto | Identificador único da linha | chave primária |
| `client_id` | texto | — | obrigatório · liga com **clients** |
| `name` | texto | Nome da unidade: "Matriz", "Loja Simões Filho" | obrigatório |
| `is_main` | sim/não | A matriz: existe em todo cliente, é a unidade padrão e não pode ser removida | obrigatório · padrão: false |
| `address` | texto | Endereço da unidade (rua, número, bairro, cidade) | — |
| `egress_ip` | texto | IP fixo de saída da rede desta unidade — o IP que chega ao servidor quando os ramais registram | — |
| `note` | texto | Observação ou referência, opcional | — |
| `created_at` | data e hora | Quando a linha foi criada | — |
| `updated_at` | data e hora | Última alteração | — |
| `deleted_at` | data e hora | Preenchido quando está na lixeira | — |

## client_contacts

OS CONTATOS DO CLIENTE (2.0, o pedido do Luan na prévia): as pessoas do cliente com quem a equipe fala — o nome, o WhatsApp, o e-mail e o cargo (ou o setor). O Abrir chamado puxa daqui, e um contato novo nasce lá também. O WhatsApp acha o cliente quando o robô abre o chamado. Não se apaga: desativa.

| Coluna | Tipo | O que guarda | Regras |
|---|---|---|---|
| `id` | texto | Identificador único da linha | chave primária |
| `client_id` | texto | — | obrigatório · liga com **clients** |
| `name` | texto | — | obrigatório |
| `phone` | texto | Só os dígitos, com o 55 | — |
| `email` | texto | — | — |
| `role` | texto | O cargo ou o setor: "Recepção", "TI", "Financeiro". Desde o 2.0.2, um dos cargos da lista (`contact_roles`), guardado pelo nome; o de antes, fora da lista, fica até alguém trocar. | — |
| `active` | sim/não | — | obrigatório · padrão: true |
| `created_by_id` | texto | — | liga com **users** |
| `created_at` | data e hora | Quando a linha foi criada | — |
| `updated_at` | data e hora | Última alteração | — |

## contact_roles

Catálogo: OS CARGOS DOS CONTATOS (2.0.2, o pedido do Luan: "eu quero que esses cargos sejam pré-seleção"). A janela do contato oferece os ativos; fica em Administração › Catálogos, como as operadoras. O contato guarda o nome do cargo: renomear aqui muda o dos contatos que o têm.

| Coluna | Tipo | O que guarda | Regras |
|---|---|---|---|
| `id` | texto | Identificador único da linha | chave primária |
| `name` | texto | — | obrigatório · único |
| `active` | sim/não | — | obrigatório · padrão: true |

## client_device_logins

LOGIN E SENHA PADRÃO DOS APARELHOS do cliente, POR MODELO: todos os GXP1610 de um cliente entram com o mesmo login e senha; os DP722, com outro. Uma linha por cliente × modelo. A senha nunca fica aqui — vai para o cofre (`secrets`). Faz par com a rede padrão.

| Coluna | Tipo | O que guarda | Regras |
|---|---|---|---|
| `id` | texto | Identificador único da linha | chave primária |
| `client_id` | texto | — | obrigatório · liga com **clients** |
| `model_id` | texto | O modelo de aparelho a que este login se aplica | obrigatório · liga com **deviceModels** |
| `username` | texto | Usuário/login padrão (admin, user…) | — |
| `password_secret_id` | texto | Senha padrão — no cofre | liga com **secrets** |
| `note` | texto | — | — |
| `created_at` | data e hora | Quando a linha foi criada | — |
| `updated_at` | data e hora | Última alteração | — |
| `deleted_at` | data e hora | Preenchido quando está na lixeira | — |

## client_network_settings

CONFIGURAÇÃO DE REDE PADRÃO dos aparelhos do cliente: o que a equipe digita nos telefones na hora de configurar (IP, máscara, gateway, DNS) e a senha do ramal sem fio. Uma linha por cliente.

| Coluna | Tipo | O que guarda | Regras |
|---|---|---|---|
| `client_id` | texto | — | chave primária · liga com **clients** |
| `ip_address` | texto | IP padrão (ou o primeiro da faixa usada nos aparelhos) | — |
| `subnet_mask` | texto | Máscara de sub-rede (255.255.255.0) | — |
| `default_router` | texto | Roteador padrão (gateway) | — |
| `dns1` | texto | DNS primário | — |
| `dns2` | texto | DNS secundário | — |
| `wireless_password_secret_id` | texto | Senha do ramal sem fio (DECT/Wi-Fi) — no cofre | liga com **secrets** |
| `note` | texto | — | — |
| `updated_at` | data e hora | Última alteração | — |

## products

Catálogo dos produtos vendidos (LinePBX, LineChat, LineReports, SZChat, VoiceNet, Equipamentos — gerenciável pela Administração).

| Coluna | Tipo | O que guarda | Regras |
|---|---|---|---|
| `id` | texto | Identificador único da linha | chave primária |
| `code` | texto | Identificador estável usado no código ("linepbx", "fop2"...) | obrigatório · único |
| `name` | texto | Nome exibido | obrigatório |
| `color` | texto | Cor do chip na interface (hex) | obrigatório · padrão: '#2457D6' |
| `description` | texto | Uma frase explicando o produto | — |
| `has_settings` | sim/não | Tem uma tabela de configuração própria? (LinePBX, SZChat) | obrigatório · padrão: false |
| `sort_order` | número inteiro | Ordem nos chips e menus | obrigatório · padrão: 0 |
| `active` | sim/não | — | obrigatório · padrão: true |
| `deleted_at` | data e hora | Preenchido quando o produto foi para a lixeira. Some das fichas, dos filtros e dos cartões, mas as assinaturas ficam guardadas e voltam se o produto for restaurado. | — |

## product_modules

Catálogo de MÓDULOS: partes opcionais dentro de um produto. LinePBX tem Omniboard, FOP2 e NPS; LineChat tem Dashboard de filas e NPS. Gerenciável pela Administração.

| Coluna | Tipo | O que guarda | Regras |
|---|---|---|---|
| `id` | texto | Identificador único da linha | chave primária |
| `product_id` | texto | — | obrigatório · liga com **products** |
| `code` | texto | Identificador estável dentro do produto ("fop2", "nps"…) | obrigatório |
| `name` | texto | Nome exibido | obrigatório |
| `description` | texto | Uma frase explicando o módulo | — |
| `has_settings` | sim/não | Tem configuração própria? (FOP2: ramal admin · Omniboard: login e senhas) | obrigatório · padrão: false |
| `sort_order` | número inteiro | — | obrigatório · padrão: 0 |
| `active` | sim/não | — | obrigatório · padrão: true |
| `deleted_at` | data e hora | Na lixeira desde (1.5, decisão 0034). Some das telas, dos filtros e da ficha do cliente; as ligações dos clientes ficam guardadas e voltam se ele for restaurado. | — |

## subscriptions

"O cliente X assina o produto Y." Uma linha por par cliente × produto. Guarda quando começou e — diferente do Nexus — quando terminou.

| Coluna | Tipo | O que guarda | Regras |
|---|---|---|---|
| `id` | texto | Identificador único da linha | chave primária |
| `client_id` | texto | — | obrigatório · liga com **clients** |
| `product_id` | texto | — | obrigatório · liga com **products** |
| `activated_at` | data e hora | Data em que o produto foi ativado para o cliente | — |
| `deactivated_at` | data e hora | Preenchido quando o cliente deixou de assinar. Nulo = ativa. | — |
| `notes` | texto | Anotações do produto para este cliente (regras internas, contratos...) | — |
| `created_at` | data e hora | Quando a linha foi criada | — |
| `updated_at` | data e hora | Última alteração | — |

## linepbx_settings

Configuração própria do LinePBX: onde está o servidor e como acessá-lo.

| Coluna | Tipo | O que guarda | Regras |
|---|---|---|---|
| `subscription_id` | texto | — | chave primária · liga com **subscriptions** |
| `hosting_id` | texto | Onde o servidor roda (catálogo: Local, Vultr, AWS...) | liga com **hostingProviders** |
| `server_ip` | texto | IP do servidor | — |
| `domain` | texto | Endereço web (domínio) — alimenta o atalho "abrir" e o link do FOP2 | — |
| `ssh_user` | texto | Usuário do SSH — NÃO É MAIS USADO pela tela: cada técnico entra com o próprio usuário (ver `users.sshUser`). Fica guardado para não perder o que veio do Nexus. | — |
| `ssh_port` | número inteiro | Porta do SSH (22 por padrão) | padrão: 22 |
| `ssh_password_secret_id` | texto | Senha do SSH (no cofre) — também fora da tela, pelo mesmo motivo do usuário | liga com **secrets** |

## subscription_modules

"Na assinatura X, o módulo Y está ligado." Uma linha por par assinatura × módulo. Só faz sentido dentro de um produto que o cliente assina (o servidor confere).

| Coluna | Tipo | O que guarda | Regras |
|---|---|---|---|
| `id` | texto | Identificador único da linha | chave primária |
| `subscription_id` | texto | — | obrigatório · liga com **subscriptions** |
| `module_id` | texto | — | obrigatório · liga com **productModules** |
| `activated_at` | data e hora | Quando o módulo foi ligado para o cliente | — |
| `deactivated_at` | data e hora | Preenchido quando foi desligado. Nulo = ligado. | — |
| `notes` | texto | Anotações do módulo para este cliente | — |
| `created_at` | data e hora | Quando a linha foi criada | — |
| `updated_at` | data e hora | Última alteração | — |

## fop2_settings

Configuração própria do módulo FOP2 (dentro do LinePBX).

| Coluna | Tipo | O que guarda | Regras |
|---|---|---|---|
| `subscription_module_id` | texto | — | chave primária · liga com **subscriptionModules** |
| `admin_extension` | texto | Ramal/usuário do FOP2 usado para o acesso rápido | — |
| `admin_password_secret_id` | texto | Senha do ramal admin do FOP2 — no cofre (desde o 1.4, decisão 0032) | liga com **secrets** |
| `default_user_password_secret_id` | texto | Senha do usuário padrão do FOP2 — no cofre. Saiu das telas no 1.4 (decisão 0032) e voltou no 1.5 (decisão 0034): nesse meio-tempo nada foi apagado, então as guardadas antes reaparecem. | liga com **secrets** |

## omniboard_settings

Configuração própria do módulo Omniboard (call center, dentro do LinePBX).

| Coluna | Tipo | O que guarda | Regras |
|---|---|---|---|
| `subscription_module_id` | texto | — | chave primária · liga com **subscriptionModules** |
| `admin_login` | texto | E-mail do administrador | — |
| `admin_password_secret_id` | texto | Senha do administrador — no cofre | liga com **secrets** |
| `user_default_password_secret_id` | texto | Senha padrão dos usuários novos — no cofre | liga com **secrets** |

## szchat_settings

Configuração própria do SZChat (legado Fortics).

| Coluna | Tipo | O que guarda | Regras |
|---|---|---|---|
| `subscription_id` | texto | — | chave primária · liga com **subscriptions** |
| `admin_login` | texto | E-mail do administrador | — |
| `admin_password_secret_id` | texto | Senha do administrador — no cofre | liga com **secrets** |

## hosting_providers

Catálogo: onde um servidor pode estar hospedado (Local, Vultr, AWS, Contabo, Hetzner...).

| Coluna | Tipo | O que guarda | Regras |
|---|---|---|---|
| `id` | texto | Identificador único da linha | chave primária |
| `name` | texto | — | obrigatório · único |
| `active` | sim/não | — | obrigatório · padrão: true |


---

# 2. NUMERAÇÃO (circuitos e DIDs)

## carriers

Catálogo: operadoras que fornecem circuitos (ALGAR, VC1...).

| Coluna | Tipo | O que guarda | Regras |
|---|---|---|---|
| `id` | texto | Identificador único da linha | chave primária |
| `name` | texto | — | obrigatório · único |
| `active` | sim/não | — | obrigatório · padrão: true |

## circuits

Um circuito (feixe) contratado junto a uma operadora. Agrupa DIDs e tem um limite de canais.

| Coluna | Tipo | O que guarda | Regras |
|---|---|---|---|
| `id` | texto | Identificador único da linha | chave primária |
| `name` | texto | Nome interno ("071 Antigo", "Link - Cliente A") | obrigatório |
| `code` | texto | Código do circuito na operadora | obrigatório |
| `carrier_id` | texto | — | liga com **carriers** |
| `channels` | número inteiro | Canais = chamadas simultâneas que o feixe suporta | obrigatório · padrão: 0 |
| `key_number` | texto | Número chave (número piloto): o número principal do feixe junto à operadora | — |
| `owner_client_id` | texto | Titular do circuito: quem detém o contrato com a operadora (normalmente VoiceNet) | liga com **clients** |
| `third_party` | sim/não | Circuito que NÃO é da VoiceNet: o tronco que o próprio cliente contratou de outra operadora. Guardar é útil (dá para saber a numeração dele), mas polui o controle da VoiceNet — por isso fica fora das listas, dos cartões e do painel até alguém ligar "links de terceiros". | obrigatório · padrão: false |
| `monthly_value_cents` | número inteiro | Custo/valor mensal do feixe, em centavos | — |
| `auth_type` | texto | Como o tronco se autentica na operadora: - `ip`: pelo IP — basta o IP da operadora e o IP do PBX - `login`: por login e senha do tronco | obrigatório · padrão: 'ip' |
| `signaling_ip` | texto | IP ou URL da operadora (sinalização) — tem operadora que só libera o endereço (1.6) | — |
| `auth_ip` | texto | IP (ou endereço) do PBX que a operadora autoriza (só na autenticação por IP; "IP PBX" no Nexus) | — |
| `auth_username` | texto | Login do tronco (só na autenticação por login e senha) | — |
| `auth_password_secret_id` | texto | Senha de autenticação do tronco — no cofre | liga com **secrets** |
| `notes` | texto | — | — |
| `created_at` | data e hora | Quando a linha foi criada | — |
| `updated_at` | data e hora | Última alteração | — |
| `deleted_at` | data e hora | Preenchido quando está na lixeira | — |

## dids

Um número telefônico. "Linha" no Nexus; DID aqui (decisão V2).

| Coluna | Tipo | O que guarda | Regras |
|---|---|---|---|
| `id` | texto | Identificador único da linha | chave primária |
| `number` | texto | Número só com dígitos (DDD + 8 ou 9). Único. | obrigatório |
| `circuit_id` | texto | Circuito ao qual pertence. Todo DID nasce dentro de um circuito (o servidor exige); a coluna continua aceitando nulo só por causa de registros antigos. | liga com **circuits** |
| `client_id` | texto | Cliente que USA o número. Nulo = livre. | liga com **clients** |
| `owner_client_id` | texto | Titular: quem DETÉM o número junto à operadora (normalmente VoiceNet) | liga com **clients** |
| `in_use` | sim/não | O número está EM USO no cliente? Alocar não é usar: o DID entra no cliente como "não usado" e alguém marca "em uso" quando ele passa a atender. Só faz sentido com cliente (livre = false). | obrigatório · padrão: false |
| `note` | texto | Observação curta | — |
| `created_at` | data e hora | Quando a linha foi criada | — |
| `updated_at` | data e hora | Última alteração | — |
| `deleted_at` | data e hora | Preenchido quando está na lixeira | — |


---

# 3. INVENTÁRIO (modelos, aparelhos, movimentações)

## device_categories

Catálogo: categoria de aparelho (Telefone IP, Periférico, ATA...).

| Coluna | Tipo | O que guarda | Regras |
|---|---|---|---|
| `id` | texto | Identificador único da linha | chave primária |
| `name` | texto | — | obrigatório · único |
| `active` | sim/não | — | obrigatório · padrão: true |

## device_models

Um modelo de aparelho (ex.: Grandstream GXP1610). Diz se é contado um a um ou por quantidade.

| Coluna | Tipo | O que guarda | Regras |
|---|---|---|---|
| `id` | texto | Identificador único da linha | chave primária |
| `code` | texto | Código curto ("gxp1610") | obrigatório · único |
| `name` | texto | Nome exibido | obrigatório |
| `category_id` | texto | — | liga com **deviceCategories** |
| `image_url` | texto | Endereço de imagem externa (não usado: a foto fica em `device_model_images`) | — |
| `value_cents` | número inteiro | Valor de cada unidade deste modelo, em centavos. É o valor que soma no cliente — o aparelho só tem valor próprio quando foi cadastrado diferente do modelo. | — |
| `created_at` | data e hora | Quando a linha foi criada | — |
| `updated_at` | data e hora | Última alteração | — |
| `deleted_at` | data e hora | Preenchido quando está na lixeira | — |

## device_model_images

A foto do modelo, no próprio banco (como a logo do cliente). Reduzida no navegador antes de subir.

| Coluna | Tipo | O que guarda | Regras |
|---|---|---|---|
| `model_id` | texto | — | chave primária · liga com **deviceModels** |
| `mime_type` | texto | — | obrigatório |
| `data_base64` | texto | — | obrigatório |
| `size_bytes` | número inteiro | — | obrigatório · padrão: 0 |
| `updated_at` | data e hora | Última alteração | — |

## devices

Um aparelho. Cada unidade é uma linha, sempre — inclusive as que não têm MAC (headset, cabo). O MAC identifica quem tem; quem não tem fica nulo e a tela mostra "não aplicável". Não existe contagem por quantidade: é um por linha, sem exceção.

| Coluna | Tipo | O que guarda | Regras |
|---|---|---|---|
| `id` | texto | Identificador único da linha | chave primária |
| `model_id` | texto | — | obrigatório · liga com **deviceModels** |
| `mac` | texto | MAC principal, 12 hexadecimais maiúsculos sem separador. Único quando existe; nulo em quem não tem MAC. | — |
| `mac_secondary` | texto | Segundo MAC (Wi-Fi, por exemplo), se houver | — |
| `serial_number` | texto | Número de série (N/S), para o aparelho que não tem MAC mas tem etiqueta de série. Não se repete dentro do mesmo modelo. | — |
| `client_id` | texto | Atribuído a: nulo = no estoque; preenchido = com este cliente | liga com **clients** |
| `unit` | texto | Unidade do cliente onde o aparelho está (filial, loja, andar): "Loja Simões Filho" | — |
| `current_modality` | texto | Como chegou ao cliente atual: locacao | venda | comodato (nulo se em estoque) | — |
| `condition` | texto | ativo | inativo. Vendido não é condição: sai da modalidade da última movimentação. | obrigatório · padrão: 'ativo' |
| `value_cents` | número inteiro | Valor PRÓPRIO do aparelho em centavos. Vazio = vale o valor do modelo (o caso normal). | — |
| `ip` | texto | IP configurado no aparelho, se houver | — |
| `location` | texto | Onde fisicamente estava ("Prateleira B"). Saiu da tela; fica guardado para não perder o que já foi digitado. | — |
| `note` | texto | — | — |
| `created_at` | data e hora | Quando a linha foi criada | — |
| `updated_at` | data e hora | Última alteração | — |
| `deleted_at` | data e hora | Preenchido quando está na lixeira | — |

## device_movements

Cabeçalho de uma movimentação: de onde, para onde, por quê, quem, quando. Nunca é editada.

| Coluna | Tipo | O que guarda | Regras |
|---|---|---|---|
| `id` | texto | Identificador único da linha | chave primária |
| `modality` | texto | locacao | venda | comodato | devolucao | obrigatório |
| `from_client_id` | texto | Origem: nulo = estoque | liga com **clients** |
| `to_client_id` | texto | Destino: nulo = estoque | liga com **clients** |
| `new_condition` | texto | Condição aplicada aos aparelhos nesta movimentação (nulo = manteve) | — |
| `unit` | texto | Unidade do cliente de destino para onde os aparelhos foram (nulo na devolução) | — |
| `value_cents` | número inteiro | Valor total da movimentação em centavos (venda, por exemplo) | — |
| `note` | texto | — | — |
| `user_id` | texto | Quem executou | obrigatório · liga com **users** |
| `created_at` | data e hora | Quando a linha foi criada | — |

## device_movement_items

Um aparelho dentro de uma movimentação. Uma linha por aparelho — a quantidade é o número de linhas.

| Coluna | Tipo | O que guarda | Regras |
|---|---|---|---|
| `id` | texto | Identificador único da linha | chave primária |
| `movement_id` | texto | — | obrigatório · liga com **deviceMovements** |
| `model_id` | texto | — | obrigatório · liga com **deviceModels** |
| `device_id` | texto | — | obrigatório · liga com **devices** |

## device_movement_receipts

O recibo de entrega de uma movimentação para cliente (Patch 1.9, decisão 0042): PDF ou foto, até 10 MB cada e até 5 por movimentação, anexado na hora de movimentar ou depois. Fica no próprio banco (entra no backup), como os anexos dos projetos. Tirar um recibo só marca `deletedAt`.

| Coluna | Tipo | O que guarda | Regras |
|---|---|---|---|
| `id` | texto | Identificador único da linha | chave primária |
| `movement_id` | texto | — | obrigatório · liga com **deviceMovements** |
| `file_name` | texto | O nome com que a pessoa baixa o arquivo | obrigatório |
| `mime_type` | texto | O tipo de verdade, pelos primeiros bytes: application/pdf, image/jpeg, image/png ou image/webp | obrigatório |
| `size_bytes` | número inteiro | — | obrigatório · padrão: 0 |
| `data_base64` | texto | — | obrigatório |
| `uploaded_by_id` | texto | Quem anexou | liga com **users** |
| `created_at` | data e hora | Quando a linha foi criada | — |
| `deleted_at` | data e hora | Preenchido quando está na lixeira | — |


---

# 4. SEGURANÇA E HISTÓRICO

## roles

Um papel = um nome + uma lista de permissões (ver packages/shared/src/permissoes.ts).

| Coluna | Tipo | O que guarda | Regras |
|---|---|---|---|
| `id` | texto | Identificador único da linha | chave primária |
| `key` | texto | Chave estável ("administrador"); nula para papéis criados pela tela | único |
| `name` | texto | — | obrigatório · único |
| `description` | texto | — | — |
| `permissions` | texto | Lista de chaves de permissão, ex.: ["records.read","dids.assign"] | obrigatório · padrão: [] · lista |
| `is_system` | sim/não | Papéis do sistema não podem ser apagados | obrigatório · padrão: false |

## users

Quem entra no sistema.

| Coluna | Tipo | O que guarda | Regras |
|---|---|---|---|
| `id` | texto | Identificador único da linha | chave primária |
| `name` | texto | — | obrigatório |
| `email` | texto | — | obrigatório · único |
| `password_hash` | texto | Senha de entrada, com hash Argon2 (nunca a senha em si) | obrigatório |
| `role_id` | texto | — | obrigatório · liga com **roles** |
| `active` | sim/não | — | obrigatório · padrão: true |
| `ssh_user` | texto | O usuário SSH desta pessoa. Cada técnico tem o seu, e é o mesmo em todos os servidores — por isso mora aqui, e não no cliente. O atalho "SSH" da ficha usa este usuário. | — |
| `whatsapp` | texto | O WhatsApp desta pessoa, só os dígitos com o 55 (5571999990000). Por ele chegam os avisos dos chamados (o chamado que recebeu, o prazo vencendo, o Crítico), pelo número da equipe. Vazio = os avisos só na tela. Fica em Administração › Usuários desde o 2.0.1 (no 2.0 morava nos Ajustes dos chamados — o pedido do Luan: "pode ficar na parte de usuários que já existe"). | — |
| `whatsapp_avisos` | sim/não | Recebe os avisos dos chamados no WhatsApp. Desligado (pausado), o número fica guardado e nada sai. | obrigatório · padrão: true |
| `last_login_at` | data e hora | Última vez que entrou | — |
| `totp_secret` | texto | Verificação em duas etapas (o código de 6 dígitos do celular). `totpSecret` guarda o segredo CIFRADO com a chave-mestra, no formato "iv:tag:texto". Enquanto `totpEnabledAt` for nulo, o segredo é só um rascunho: foi gerado, mas a pessoa ainda não confirmou com um código, então o login continua só com senha. | — |
| `totp_enabled_at` | data e hora | — | — |
| `totp_recovery` | texto | Códigos de recuperação ainda não usados, guardados como hash (JSON de strings) | — |
| `created_at` | data e hora | Quando a linha foi criada | — |
| `updated_at` | data e hora | Última alteração | — |

## settings

AJUSTES DO SISTEMA que a pessoa preenche na tela (Administração › Ajustes), em vez de mexer em arquivo no servidor. Uma linha por assunto (o `id`): 'backup', 'avisos', 'linechat', os da tela de Chamados e do envio automático (1.7) e 'base-ia' (a IA da base, 1.8). - `value` guarda o que NÃO é segredo (pasta do Drive, endereço do aviso, se está ligado, o provedor e o modelo da IA, e o resultado do último envio ou teste), em JSON - `secretId` aponta para o cofre, onde mora o que é segredo: a chave da conta de serviço do Google, o token da API de avisos, a chave do LineChat, o token da FlwChat e a chave da IA

| Coluna | Tipo | O que guarda | Regras |
|---|---|---|---|
| `id` | texto | 'backup' | 'avisos' | 'linechat' | 'chamados-painel' (a arrumação da tela de Chamados) | 'chamados-relatorios' (os campos, a ligação dos clientes e o grupo de cada tipo dos Relatórios, 1.7) | 'chamados-relatorios-arrumacao' (a ordem, os escondidos e os favoritos da página de Relatórios, 1.7) | 'envio-automatico' (o envio diário do PDF pelo WhatsApp: horário, números e histórico; o token no cofre, 1.7) | 'envio-automatico-marcados' (os gráficos e relatórios que vão no PDF, 1.7) | 'base-ia' (a IA da Base de conhecimento: o provedor, o modelo, o endereço do compatível, o preço, o último teste e o uso do mês; a chave no cofre, 1.8) | 'atendimento-prazos' (o horário de atendimento, os feriados, os prazos por prioridade e a matriz gravidade × alcance, 2.0) | 'atendimento-avisos' (o WhatsApp dos chamados: o número do cliente e o da equipe e quais avisos vão por onde; a chave própria no cofre, 2.0 — o número de cada pessoa mora no usuário desde o 2.0.1) | 'atendimento-integracoes' (os sites que podem abrir o Gestor dentro deles e o link da conversa no LineChat, 2.0; e o botão da NIA na ficha: ligado e as três etiquetas, 2.1) | 'atendimento-robo' (o mapa do robô do LineChat: de onde vem cada campo do chamado no JSON que o robô manda, 2.0.1) | 'atendimento-robo-ultimo' (o último pedido do robô, com o que aconteceu: a tela do mapa mostra as variáveis dele, 2.0.1) | 'calendario' (os tipos de evento do calendário, 2.0.1) | 'comercial-simulador' (os Ajustes do Simulador do Comercial: o imposto, as faixas do sinal, o prazo, a tabela de custos e os modelos por produto, 2.0.2) | chave primária |
| `value` | texto | — | obrigatório · padrão: '{}' |
| `secret_id` | texto | — | liga com **secrets** |
| `updated_at` | data e hora | Última alteração | — |
| `updated_by` | texto | — | liga com **users** |

## sessions

Sessão de login (cookie). Expira sozinha.

| Coluna | Tipo | O que guarda | Regras |
|---|---|---|---|
| `id` | texto | Identificador único da linha | chave primária |
| `user_id` | texto | — | obrigatório · liga com **users** |
| `expires_at` | data e hora | — | obrigatório |
| `pending_totp` | sim/não | true = entrou com a senha certa, mas ainda falta o código de 6 dígitos. Não vale como login. | obrigatório · padrão: false |
| `created_at` | data e hora | Quando a linha foi criada | — |
| `ip` | texto | — | — |
| `user_agent` | texto | — | — |

## secrets

O COFRE. Toda senha do sistema mora aqui, cifrada (AES-256-GCM) com a chave-mestra que fica FORA do banco. Sem a chave, esta tabela é ruído.

| Coluna | Tipo | O que guarda | Regras |
|---|---|---|---|
| `id` | texto | Identificador único da linha | chave primária |
| `label` | texto | Rótulo legível: "Senha SSH do LinePBX", "Senha do tronco" | obrigatório |
| `ciphertext` | texto | Valor cifrado (base64) | obrigatório |
| `iv` | texto | Vetor de inicialização da cifra (base64) | obrigatório |
| `auth_tag` | texto | Etiqueta de autenticação da cifra (base64) | obrigatório |
| `key_version` | número inteiro | Versão da chave usada (permite rotação) | obrigatório · padrão: 1 |
| `updated_by` | texto | — | — |
| `updated_at` | data e hora | Última alteração | — |
| `created_at` | data e hora | Quando a linha foi criada | — |

## audit_log

Quem fez o quê, em qual registro, quando — com o antes e o depois. Inclui ações sensíveis: revelar senha, exportar com senhas, edição em massa, importação.

| Coluna | Tipo | O que guarda | Regras |
|---|---|---|---|
| `id` | texto | Identificador único da linha | chave primária |
| `user_id` | texto | — | liga com **users** |
| `action` | texto | create | update | delete | restore | reveal_secret | bulk_update | import | export | login | logout | obrigatório |
| `entity_type` | texto | Tipo do registro: client | did | circuit | device | secret | user... | obrigatório |
| `entity_id` | texto | — | — |
| `summary` | texto | Resumo legível: "Alterou circuito de 312 DIDs" | obrigatório |
| `before` | JSON | Estado anterior, quando faz sentido | — |
| `after` | JSON | Estado posterior | — |
| `ip` | texto | — | — |
| `created_at` | data e hora | Quando a linha foi criada | — |


---

# 5. NOVIDADES (notas de versão)

## release_notes

Uma NOTA DE VERSÃO ("o que mudou na rodada 23"). Quando publicada, aparece uma vez para cada pessoa no login e só para de aparecer quando ela marca "Li e entendi" — ou, na nota com vídeo (1.9, `release_note_videos`), "Assisti e entendi", depois de ver o vídeo até o fim. Rascunho = `publishedAt` nulo: ninguém vê até publicar.

| Coluna | Tipo | O que guarda | Regras |
|---|---|---|---|
| `id` | texto | Identificador único da linha | chave primária |
| `version` | texto | Identificador curto e estável da versão ("rodada-23"); é por ele que a importação evita repetir | obrigatório |
| `title` | texto | O que aparece no topo da nota | obrigatório |
| `summary` | texto | Uma frase resumindo a rodada | — |
| `published_at` | data e hora | Quando foi publicada. Nulo = rascunho (só quem edita enxerga). | — |
| `created_at` | data e hora | Quando a linha foi criada | — |
| `updated_at` | data e hora | Última alteração | — |
| `deleted_at` | data e hora | Preenchido quando está na lixeira | — |

## release_note_items

Um item da nota: o cartão que a pessoa vê, um por vez. `kind` diz a cor e o rótulo: novo | melhorou | corrigido | atencao ("atenção" é mudança de regra, o que muda o jeito de trabalhar).

| Coluna | Tipo | O que guarda | Regras |
|---|---|---|---|
| `id` | texto | Identificador único da linha | chave primária |
| `note_id` | texto | — | obrigatório · liga com **releaseNotes** |
| `kind` | texto | — | obrigatório · padrão: 'novo' |
| `title` | texto | — | obrigatório |
| `text` | texto | Duas ou três linhas explicando, em português de gente | — |
| `sort_order` | número inteiro | Ordem em que os cartões aparecem | obrigatório · padrão: 0 |

## release_note_images

O print de um item, no próprio banco (como a logo do cliente e a foto do modelo).

| Coluna | Tipo | O que guarda | Regras |
|---|---|---|---|
| `item_id` | texto | — | chave primária · liga com **releaseNoteItems** |
| `mime_type` | texto | — | obrigatório |
| `data_base64` | texto | — | obrigatório |
| `size_bytes` | número inteiro | — | obrigatório · padrão: 0 |
| `updated_at` | data e hora | Última alteração | — |

## release_note_reads

"Fulano leu a nota da rodada 23 em tal dia." Uma linha por pessoa × nota.

| Coluna | Tipo | O que guarda | Regras |
|---|---|---|---|
| `id` | texto | Identificador único da linha | chave primária |
| `note_id` | texto | — | obrigatório · liga com **releaseNotes** |
| `user_id` | texto | — | obrigatório · liga com **users** |
| `read_at` | data e hora | — | obrigatório |

## release_note_videos

O vídeo do patch (Patch 1.9, decisão 0046): quando a nota tem vídeo, é ele que abre no login, no lugar dos cartões (os cartões continuam na página Novidades). Fica em disco, como os vídeos do portal (`PORTAL_DIR/novidades/<disk_name>`), pelo tamanho — fora do backup diário do banco; o da nota que vem pronta tem o original em `docs/novidades/`. Nasce sem nota (subiu, e a nota ainda não foi salva) e passa a ser dela ao salvar. Trocar ou tirar não apaga: o anterior ganha `deleted_at` e o arquivo continua no disco. Cada nota tem no máximo um vídeo valendo.

| Coluna | Tipo | O que guarda | Regras |
|---|---|---|---|
| `id` | texto | Identificador único da linha | chave primária |
| `note_id` | texto | A nota do vídeo (vazio enquanto a nota em que ele subiu não foi salva) | liga com **releaseNotes** |
| `file_name` | texto | O nome do arquivo que subiu ("o-que-mudou.mp4") | obrigatório |
| `mime_type` | texto | video/mp4, video/webm ou video/quicktime | obrigatório |
| `size_bytes` | número inteiro | O tamanho, em bytes | obrigatório · padrão: 0 |
| `disk_name` | texto | O nome do arquivo no disco, na pasta `PORTAL_DIR/novidades` | obrigatório |
| `uploaded_by_id` | texto | Quem subiu (vazio = veio pronto com a nota, na publicação) | liga com **users** |
| `created_at` | data e hora | Quando a linha foi criada | — |
| `deleted_at` | data e hora | Trocado ou tirado da nota: sai das telas, o arquivo fica no disco | — |


---

# 6. PROJETOS

## projects

Um projeto é uma tarefa que percorre VÁRIOS clientes até acabar ("trocar o áudio da URA de todos os clientes com PBX"). O que define o projeto: o objetivo, o prazo e as ETAPAS — as mesmas para todo cliente da lista. Quem faz o trabalho vai marcando etapa por etapa; o andamento é contado a partir dessas marcas.

| Coluna | Tipo | O que guarda | Regras |
|---|---|---|---|
| `id` | texto | Identificador único da linha | chave primária |
| `name` | texto | Como a equipe chama o projeto ("Áudio novo das URAs") | obrigatório |
| `goal` | texto | O que se quer alcançar e por quê — o que a pessoa lê antes de começar | — |
| `status` | texto | aberto = em andamento · concluido = acabou · cancelado = não vai acontecer | obrigatório · padrão: 'aberto' |
| `due_date` | texto | Data-alvo do projeto inteiro (AAAA-MM-DD). Passou e ainda tem cliente aberto = atrasado. | — |
| `owner_id` | texto | Responsável pelo projeto como um todo (quem cobra) | liga com **users** |
| `closed_at` | data e hora | Quando foi dado por encerrado | — |
| `created_at` | data e hora | Quando a linha foi criada | — |
| `updated_at` | data e hora | Última alteração | — |
| `deleted_at` | data e hora | Preenchido quando está na lixeira | — |

## project_steps

Uma etapa (coluna) do projeto. Vale para todos os clientes da lista, na mesma ordem. São dois tipos: - **caixinha** (`check`): feito ou não feito, o caso mais comum; - **lista de opções** (`escolha`): a pessoa escolhe um rótulo colorido ("Sem necessidade · Pendente · Mensagem enviada · Configuração realizada"), como as colunas de situação que a equipe já usava na planilha. As opções ficam em `options`: `[{ id, label, tone, conclui }]`. `tone` é a cor (as mesmas do sistema) e `conclui` diz se aquela opção **fecha** a etapa — é o que faz "Sem necessidade" e "Configuração realizada" contarem como resolvido, e "Pendente" não. O `id` é estável: trocar o rótulo não perde o que já foi escolhido.

| Coluna | Tipo | O que guarda | Regras |
|---|---|---|---|
| `id` | texto | Identificador único da linha | chave primária |
| `project_id` | texto | — | obrigatório · liga com **projects** |
| `title` | texto | O que fazer ("Gravar o áudio") ou o nome da coluna ("Situação do contato") | obrigatório |
| `kind` | texto | check = caixinha · escolha = lista de opções | obrigatório · padrão: 'check' |
| `options` | JSON | As opções, quando `kind` é "escolha" | obrigatório · padrão: [] |
| `sort_order` | número inteiro | — | obrigatório · padrão: 0 |

## project_clients

Um cliente dentro do projeto: a linha que o técnico trabalha. `status` é a situação daquele cliente no projeto: pendente · andamento · travado · concluido · nao_se_aplica Ela anda sozinha conforme as etapas são marcadas (primeira marca → andamento, todas → concluído); "travado" e "não se aplica" são escolhas de gente, e "travado" exige dizer o motivo.

| Coluna | Tipo | O que guarda | Regras |
|---|---|---|---|
| `id` | texto | Identificador único da linha | chave primária |
| `project_id` | texto | — | obrigatório · liga com **projects** |
| `client_id` | texto | — | obrigatório · liga com **clients** |
| `assignee_id` | texto | Quem ficou de fazer este cliente | liga com **users** |
| `status` | texto | — | obrigatório · padrão: 'pendente' |
| `blocked_reason` | texto | Por que está parado — obrigatório quando o status é "travado" | — |
| `done_at` | data e hora | Quando fechou (concluído ou não se aplica) | — |
| `created_at` | data e hora | Quando a linha foi criada | — |
| `updated_at` | data e hora | Última alteração | — |

## project_checks

O que foi marcado numa etapa, para um cliente: "fulano marcou, em tal dia". Sem linha = ainda não mexeram naquela etapa. Em etapa de **caixinha**, a linha existir já quer dizer "feito" e `value` fica nulo. Em **lista de opções**, `value` guarda o id da opção escolhida.

| Coluna | Tipo | O que guarda | Regras |
|---|---|---|---|
| `id` | texto | Identificador único da linha | chave primária |
| `project_client_id` | texto | — | obrigatório · liga com **projectClients** |
| `step_id` | texto | — | obrigatório · liga com **projectSteps** |
| `value` | texto | O id da opção escolhida (só em etapa de lista); nulo na caixinha | — |
| `done_by_id` | texto | — | liga com **users** |
| `done_at` | data e hora | — | obrigatório |

## project_comments

Um comentário. Sem `projectClientId` é um recado do projeto inteiro; com ele, é conversa sobre aquele cliente ("liguei, pediram para voltar semana que vem").

| Coluna | Tipo | O que guarda | Regras |
|---|---|---|---|
| `id` | texto | Identificador único da linha | chave primária |
| `project_id` | texto | — | obrigatório · liga com **projects** |
| `project_client_id` | texto | — | liga com **projectClients** |
| `user_id` | texto | — | liga com **users** |
| `body` | texto | — | obrigatório |
| `created_at` | data e hora | Quando a linha foi criada | — |
| `deleted_at` | data e hora | Preenchido quando está na lixeira | — |

## project_attachments

Um anexo: planilha, documento, print, áudio da URA — qualquer formato, até o limite da tela. Fica no próprio banco (como a logo do cliente), então entra no backup junto com o resto; por isso o limite de tamanho é baixo de propósito. `fileName` é o nome com que a pessoa baixa.

| Coluna | Tipo | O que guarda | Regras |
|---|---|---|---|
| `id` | texto | Identificador único da linha | chave primária |
| `project_id` | texto | — | obrigatório · liga com **projects** |
| `project_client_id` | texto | — | liga com **projectClients** |
| `file_name` | texto | — | obrigatório |
| `mime_type` | texto | — | obrigatório |
| `size_bytes` | número inteiro | — | obrigatório · padrão: 0 |
| `data_base64` | texto | — | obrigatório |
| `uploaded_by_id` | texto | — | liga com **users** |
| `created_at` | data e hora | Quando a linha foi criada | — |
| `deleted_at` | data e hora | Preenchido quando está na lixeira | — |


---

# 7. CHAMADOS DO LINECHAT

## linechat_steps

As etapas (colunas) do painel, na ordem em que aparecem no Kanban.

| Coluna | Tipo | O que guarda | Regras |
|---|---|---|---|
| `id` | texto | O id da etapa no LineChat | chave primária |
| `title` | texto | O nome da coluna ("Chamado Em Tratativa N1") | obrigatório |
| `position` | número inteiro | A ordem da coluna no Kanban, da esquerda para a direita | obrigatório · padrão: 0 |
| `is_initial` | sim/não | Etapa onde o chamado nasce ("Novos Suporte") | obrigatório · padrão: false |
| `is_final` | sim/não | Etapa que encerra o chamado ("Chamado Tratado", "Chamado Validado"): chegar nela = fechado | obrigatório · padrão: false |
| `archived` | sim/não | A etapa foi arquivada ou apagada lá: continua aqui para os chamados antigos não perderem o nome | obrigatório · padrão: false |
| `synced_at` | data e hora | Última vez que a sincronização leu esta etapa | obrigatório |

## linechat_fields

Os campos personalizados do painel (Cliente, Produto, Assunto, Tipo de chamado…). A tela monta um filtro e um gráfico para cada campo de lista, lendo daqui — campo novo no LineChat aparece sozinho, sem mexer no código.

| Coluna | Tipo | O que guarda | Regras |
|---|---|---|---|
| `key` | texto | A chave do campo no LineChat ("cliente-71", "plataforma") — é o nome dele dentro de `customFields` | chave primária |
| `name` | texto | O nome que aparece na tela ("Cliente", "Produto") | obrigatório |
| `type` | texto | SINGLESELECT · MULTISELECT · TEXT · DATETIME… (o tipo que o LineChat informa) | obrigatório |
| `position` | número inteiro | A ordem do campo no formulário do card | obrigatório · padrão: 0 |
| `options` | JSON | As opções da lista, na ordem de lá (só nos campos de lista) | obrigatório · padrão: [] |
| `archived` | sim/não | O campo sumiu do painel: some dos filtros, mas o valor antigo continua nos cards | obrigatório · padrão: false |
| `synced_at` | data e hora | — | obrigatório |

## linechat_tags

As etiquetas do painel (P/ Alta, NIA - ERRO, StandBy…), com a cor de lá.

| Coluna | Tipo | O que guarda | Regras |
|---|---|---|---|
| `id` | texto | O id da etiqueta no LineChat | chave primária |
| `name` | texto | — | obrigatório |
| `color` | texto | A cor de fundo que o LineChat usa (ex.: "rgb(255, 153, 255)") | — |
| `archived` | sim/não | — | obrigatório · padrão: false |
| `synced_at` | data e hora | — | obrigatório |

## linechat_cards

Um chamado (card do LineChat), do jeito que ele estava na última sincronização. Três momentos que a tela usa: - `createdAt` — quando o chamado foi aberto (o que o Grafana contava); - `closedAt` — quando ele chegou numa etapa final. Nos chamados que já estavam fechados antes da primeira sincronização não dá para saber a hora exata (a API não entrega o histórico): usamos a última alteração do card e marcamos `closedEstimated`; - `removedAt` — o card sumiu do LineChat (excluído lá). Some das contas, mas não é apagado.

| Coluna | Tipo | O que guarda | Regras |
|---|---|---|---|
| `id` | texto | O id do card no LineChat | chave primária |
| `panel_id` | texto | O painel de onde o card veio | obrigatório |
| `number` | número inteiro | O número sequencial do card (3607) | — |
| `key` | texto | O código que a equipe fala ("IS-3607") | — |
| `title` | texto | — | obrigatório · padrão: '' |
| `description` | texto | — | — |
| `step_id` | texto | A etapa atual (nula quando o card está arquivado: o LineChat não informa) | — |
| `step_title` | texto | O nome da etapa atual, guardado junto para a etapa apagada não virar "?" | — |
| `step_phase` | texto | INITIAL · INTERMEDIATE · FINAL — em que ponto do fluxo a etapa está | — |
| `status` | texto | OPEN = ativo no Kanban · ARCHIVED = arquivado lá (WON/LOST só existem em painel de vendas) | obrigatório · padrão: 'OPEN' |
| `responsible_id` | texto | O responsável no LineChat (id e nome; nulo = sem responsável) | — |
| `responsible_name` | texto | — | — |
| `due_date` | data e hora | O vencimento que a equipe pôs no card | — |
| `is_overdue` | sim/não | O LineChat diz se o card está vencido | obrigatório · padrão: false |
| `tag_ids` | texto | As etiquetas do card (ids de `linechat_tags`) | obrigatório · padrão: [] · lista |
| `custom_fields` | JSON | Os campos personalizados, do jeito que o LineChat manda: a chave do campo → o valor (texto nos campos de escolha única, lista de textos nos de múltipla escolha). | obrigatório · padrão: {} |
| `created_at` | data e hora | Quando o chamado foi aberto no LineChat | obrigatório |
| `updated_at` | data e hora | A última alteração do card no LineChat | obrigatório |
| `closed_at` | data e hora | Quando chegou numa etapa final (nulo = ainda aberto, ou reaberto depois) | — |
| `closed_estimated` | sim/não | true = `closedAt` é a última alteração do card, não a hora exata (fechado antes de sincronizarmos) | obrigatório · padrão: false |
| `archived_at` | data e hora | Quando o card foi arquivado no LineChat (a hora em que percebemos) | — |
| `removed_at` | data e hora | Quando percebemos que o card foi excluído no LineChat (na conferência de 10 em 10 minutos ou na completa da meia-noite). Preenchido = fora da tela e das contas; volta a nulo se ele reaparecer | — |
| `first_seen_at` | data e hora | Quando a sincronização viu este card pela primeira vez | obrigatório |
| `last_seen_at` | data e hora | Última vez que uma conferência completa encontrou o card lá | obrigatório |

## linechat_card_moves

Cada vez que um chamado mudou de etapa. É o que a API do LineChat não entrega, então nós guardamos: a sincronização compara a etapa que o card tem agora com a que tinha antes. É daqui que sai o "quanto tempo ficou no N1". A primeira vez que um card aparece também vira uma linha (sem etapa de origem): - card aberto depois que a sincronização começou → a hora é a da abertura, exata; - card que já existia → não se sabe desde quando está naquela etapa: `estimated` = true.

| Coluna | Tipo | O que guarda | Regras |
|---|---|---|---|
| `id` | texto | Identificador único da linha | chave primária |
| `card_id` | texto | — | obrigatório · liga com **linechatCards** |
| `from_step_id` | texto | A etapa de onde saiu (nula na primeira vez que o card foi visto) | — |
| `from_step_title` | texto | — | — |
| `to_step_id` | texto | A etapa para onde foi | — |
| `to_step_title` | texto | — | — |
| `at` | data e hora | Quando a mudança aconteceu: a hora da alteração do card no LineChat | obrigatório |
| `estimated` | sim/não | true = não sabemos a hora exata (card que já existia antes da primeira sincronização) | obrigatório · padrão: false |
| `created_at` | data e hora | Quando a linha foi criada | — |

## linechat_sync_runs

O registro das sincronizações: quando rodou, o que leu, o que mudou e se deu erro. A de minuto em minuto só vira linha quando mudou alguma coisa ou deu erro — senão seriam 1.440 linhas por dia dizendo "nada novo". Linhas com mais de 90 dias são apagadas sozinhas.

| Coluna | Tipo | O que guarda | Regras |
|---|---|---|---|
| `id` | texto | Identificador único da linha | chave primária |
| `kind` | texto | completa = leu o painel inteiro · recente = só o que mudou desde a última · conferencia = releu os últimos 7 dias atrás de excluídos | obrigatório |
| `trigger` | texto | agendada (automática) · manual (botão "Sincronizar agora") | obrigatório · padrão: 'agendada' |
| `started_at` | data e hora | — | obrigatório |
| `finished_at` | data e hora | — | — |
| `ok` | sim/não | — | obrigatório · padrão: false |
| `message` | texto | O resultado em uma frase, ou o erro | — |
| `cards_read` | número inteiro | Quantos cards vieram do LineChat | obrigatório · padrão: 0 |
| `cards_new` | número inteiro | Quantos eram novos | obrigatório · padrão: 0 |
| `moves` | número inteiro | Quantos mudaram de etapa | obrigatório · padrão: 0 |
| `cards_removed` | número inteiro | Quantos sumiram do LineChat (na completa e na conferência) | obrigatório · padrão: 0 |
| `user_id` | texto | Quem apertou o botão (nulo na automática) | liga com **users** |


---

# 8. BASE DE CONHECIMENTO

## knowledge_articles

Um artigo. O texto é "simples": uma linha que começa com número vira passo, o que está entre crases vira comando com botão Copiar, e `[print:<id>]` numa linha sozinha é um print colado (o arquivo mora em `knowledge_attachments`). Quem lê é a equipe toda — senha não vai aqui, vai no cofre (combinado do Patch 1.8).

| Coluna | Tipo | O que guarda | Regras |
|---|---|---|---|
| `id` | texto | Identificador único da linha | chave primária |
| `number` | serial | O número do código BC-12: sequencial, nunca reaproveitado (nem depois da lixeira) | obrigatório |
| `title` | texto | O título, escrito como alguém procuraria ("Ligação cai sempre aos 32 segundos") | obrigatório |
| `symptom` | texto | O que acontece: o sintoma, nas palavras do cliente | — |
| `resolution` | texto | Como resolver: os passos (obrigatório para publicar) | — |
| `cause` | texto | Por que acontece: a causa (opcional, mas é o que ensina a reconhecer o problema) | — |
| `customer_terms` | texto | Palavras do cliente: outros jeitos de dizer o mesmo problema ("cai sozinha"), para a busca achar | obrigatório · padrão: [] · lista |
| `status` | texto | rascunho = só quem escreveu (e quem cuida da base) vê · publicado = a equipe toda vê | obrigatório · padrão: 'rascunho' |
| `mandatory_since` | data e hora | Leitura obrigatória desde quando (nulo = não é). Quem leu antes disso precisa ler de novo | — |
| `mandatory_by_id` | texto | Quem marcou a leitura obrigatória | liga com **users** |
| `version` | número inteiro | A versão atual do texto (sobe a cada mudança; cada uma fica guardada em `knowledge_versions`) | obrigatório · padrão: 1 |
| `author_id` | texto | Quem escreveu | liga com **users** |
| `updated_by_id` | texto | Quem mexeu por último | liga com **users** |
| `published_at` | data e hora | Quando foi publicado pela primeira vez | — |
| `created_at` | data e hora | Quando a linha foi criada | — |
| `updated_at` | data e hora | Última alteração | — |
| `deleted_at` | data e hora | Preenchido quando está na lixeira | — |

## knowledge_versions

Cada versão do texto de um artigo, inteira, para comparar e voltar atrás. A última é igual ao artigo; "voltar a esta versão" não apaga nada: grava uma versão nova com o texto antigo. As ligações não entram aqui (a auditoria guarda quem as mudou).

| Coluna | Tipo | O que guarda | Regras |
|---|---|---|---|
| `id` | texto | Identificador único da linha | chave primária |
| `article_id` | texto | — | obrigatório · liga com **knowledgeArticles** |
| `version` | número inteiro | 1, 2, 3… (a do artigo é a última) | obrigatório |
| `title` | texto | — | obrigatório |
| `symptom` | texto | — | — |
| `resolution` | texto | — | — |
| `cause` | texto | — | — |
| `customer_terms` | texto | — | obrigatório · padrão: [] · lista |
| `note` | texto | Um recado sobre a versão ("voltou à versão 2") | — |
| `edited_by_id` | texto | — | liga com **users** |
| `edited_at` | data e hora | — | obrigatório |

## knowledge_links

"Este artigo fala de…": a ligação com o que o Gestor já tem. `kind`: produto · modulo · assunto · cliente · modelo · operadora · chamado · projeto. `target` é o id do que está ligado — menos no assunto, que guarda o NOME da opção do campo Assunto do LineChat (é como o card guarda o valor; o campo é o escolhido nos Relatórios).

| Coluna | Tipo | O que guarda | Regras |
|---|---|---|---|
| `id` | texto | Identificador único da linha | chave primária |
| `article_id` | texto | — | obrigatório · liga com **knowledgeArticles** |
| `kind` | texto | — | obrigatório |
| `target` | texto | — | obrigatório |
| `created_at` | data e hora | Quando a linha foi criada | — |

## knowledge_attachments

Um arquivo do artigo, no próprio banco (como os anexos dos projetos: entra no backup). `inline` = print colado no meio do texto (só imagem PNG, JPG, WEBP ou GIF, que o navegador já reduziu); senão, um anexo da lista, de qualquer formato, que sempre baixa como arquivo.

| Coluna | Tipo | O que guarda | Regras |
|---|---|---|---|
| `id` | texto | Identificador único da linha | chave primária |
| `article_id` | texto | — | obrigatório · liga com **knowledgeArticles** |
| `file_name` | texto | — | obrigatório |
| `mime_type` | texto | — | obrigatório |
| `size_bytes` | número inteiro | — | obrigatório · padrão: 0 |
| `data_base64` | texto | — | obrigatório |
| `inline` | sim/não | — | obrigatório · padrão: false |
| `uploaded_by_id` | texto | — | liga com **users** |
| `created_at` | data e hora | Quando a linha foi criada | — |
| `deleted_at` | data e hora | Preenchido quando está na lixeira | — |

## knowledge_reads

"Fulano leu o artigo (de leitura obrigatória) em tal dia." Uma linha por pessoa × artigo; ler de novo atualiza a data. Vale a leitura feita depois de `mandatorySince` do artigo.

| Coluna | Tipo | O que guarda | Regras |
|---|---|---|---|
| `id` | texto | Identificador único da linha | chave primária |
| `article_id` | texto | — | obrigatório · liga com **knowledgeArticles** |
| `user_id` | texto | — | obrigatório · liga com **users** |
| `read_at` | data e hora | — | obrigatório |

## knowledge_comments

Um comentário no artigo: o que a equipe viu depois ("aconteceu de novo, era outra coisa"), sem mexer no texto. Fica registrado quem comentou e quando; apagar só marca `deletedAt`, e a auditoria guarda o texto apagado. Pedido do Luan na prévia do 1.8 (07/10).

| Coluna | Tipo | O que guarda | Regras |
|---|---|---|---|
| `id` | texto | Identificador único da linha | chave primária |
| `article_id` | texto | — | obrigatório · liga com **knowledgeArticles** |
| `user_id` | texto | Quem comentou | liga com **users** |
| `body` | texto | — | obrigatório |
| `created_at` | data e hora | Quando a linha foi criada | — |
| `deleted_at` | data e hora | Preenchido quando está na lixeira | — |


---

# 9. PORTAL DO CLIENTE (decisão 0040, Patch 1.8, migração 0010)

## portal_users

Uma pessoa do cliente com acesso ao portal. Desde o 1.9 (decisão 0045) o suporte cria o login (o e-mail ou um nome) e a senha, e a senha fica também no cofre (`secrets`), para a equipe ver e trocar quando a pessoa esquecer. Só entra enquanto o cliente está na base: com produto ativo, fora do arquivo e da lixeira — e a sessão aberta cai na hora em que ele sai.

| Coluna | Tipo | O que guarda | Regras |
|---|---|---|---|
| `id` | texto | Identificador único da linha | chave primária |
| `client_id` | texto | — | obrigatório · liga com **clients** |
| `name` | texto | — | obrigatório |
| `email` | texto | O login: o e-mail da pessoa ou um nome (como "maria.souza"), em minúsculas. Único no portal inteiro. A coluna se chama `email` porque no 1.8 o login era sempre o e-mail. | obrigatório |
| `password_hash` | texto | Hash Argon2 da senha (é com ele que o login confere); nulo = ainda sem senha | — |
| `password_secret_id` | texto | A mesma senha, cifrada no cofre, para a equipe ver (fica na auditoria); nulo = criada pela pessoa no 1.8, pelo convite | liga com **secrets** |
| `active` | sim/não | false = bloqueado pela equipe: não entra, e a sessão aberta cai | obrigatório · padrão: true |
| `invite_token_hash` | texto | O convite do 1.8 (a pessoa criava a senha pelo link): sem uso desde o 1.9, quando o suporte passou a criar a senha | — |
| `invite_expires_at` | data e hora | — | — |
| `last_login_at` | data e hora | Última vez que entrou, e quantas vezes entrou | — |
| `login_count` | número inteiro | — | obrigatório · padrão: 0 |
| `created_by_id` | texto | Quem da equipe deu o acesso | liga com **users** |
| `created_at` | data e hora | Quando a linha foi criada | — |
| `updated_at` | data e hora | Última alteração | — |

## portal_sessions

A sessão de quem entrou no portal (como `sessions`, mas do cliente). Dura 30 dias sem uso. É de uma pessoa do cliente (`portal_user_id`) **ou** de alguém da equipe (`staff_user_id`): a equipe entra no portal com o próprio login do Gestor e vê todos os tutoriais (decisão 0044, Patch 1.9, migração 0012). Nunca as duas coisas, nunca nenhuma.

| Coluna | Tipo | O que guarda | Regras |
|---|---|---|---|
| `id` | texto | Identificador único da linha | chave primária |
| `portal_user_id` | texto | A pessoa do cliente (nulo quando quem entrou é da equipe) | liga com **portalUsers** |
| `staff_user_id` | texto | Quem da equipe entrou com o login do Gestor (nulo quando é uma pessoa do cliente) | liga com **users** |
| `expires_at` | data e hora | — | obrigatório |
| `created_at` | data e hora | Quando a linha foi criada | — |
| `ip` | texto | — | — |
| `user_agent` | texto | — | — |

## portal_articles

Um tutorial do portal. O texto é o "texto simples" da base de conhecimento — linha com número vira passo, crases viram comando com Copiar, `[print:<id>]` é um print — e mais `[video:<id>]` (o player) e `[arquivo:<id>]` (o botão de baixar). Sem produto = Geral (todos os clientes veem).

| Coluna | Tipo | O que guarda | Regras |
|---|---|---|---|
| `id` | texto | Identificador único da linha | chave primária |
| `number` | serial | O número do link (/portal/a/12-como-transferir…): sequencial, nunca reaproveitado | obrigatório |
| `title` | texto | — | obrigatório |
| `summary` | texto | Uma frase: aparece na lista e no começo do tutorial | — |
| `body` | texto | — | — |
| `product_id` | texto | De qual produto (nulo = Geral) | liga com **products** |
| `module_id` | texto | De qual módulo do produto (nulo = o produto inteiro) | liga com **productModules** |
| `featured` | sim/não | Em destaque na página inicial do portal | obrigatório · padrão: false |
| `main_video_id` | texto | O vídeo principal (1.9): fica no topo do tutorial, logo acima do passo a passo | — |
| `status` | texto | rascunho = só a equipe vê · publicado = os clientes veem | obrigatório · padrão: 'rascunho' |
| `version` | número inteiro | Sobe a cada gravação: quem salvou no meio não é atropelado | obrigatório · padrão: 1 |
| `views` | número inteiro | Quantas vezes os clientes abriram o tutorial | obrigatório · padrão: 0 |
| `author_id` | texto | — | liga com **users** |
| `updated_by_id` | texto | — | liga com **users** |
| `published_at` | data e hora | — | — |
| `created_at` | data e hora | Quando a linha foi criada | — |
| `updated_at` | data e hora | Última alteração | — |
| `deleted_at` | data e hora | Preenchido quando está na lixeira | — |

## portal_files

Um arquivo do portal: `imagem` (print no texto), `video` ou `arquivo` (para baixar). Imagem e arquivo ficam no banco, em base64 (entram no backup diário); o vídeo fica em disco, em `PORTAL_DIR/videos/<disk_name>`, pelo tamanho (e tem backup próprio, semanal).

| Coluna | Tipo | O que guarda | Regras |
|---|---|---|---|
| `id` | texto | Identificador único da linha | chave primária |
| `article_id` | texto | O tutorial que usa o arquivo (nulo enquanto o tutorial novo não foi gravado) | liga com **portalArticles** |
| `kind` | texto | — | obrigatório |
| `file_name` | texto | — | obrigatório |
| `mime_type` | texto | — | obrigatório |
| `size_bytes` | número inteiro | — | obrigatório · padrão: 0 |
| `data_base64` | texto | Imagem e arquivo: o conteúdo em base64 | — |
| `disk_name` | texto | Vídeo: o nome do arquivo em disco | — |
| `uploaded_by_id` | texto | — | liga com **users** |
| `created_at` | data e hora | Quando a linha foi criada | — |
| `deleted_at` | data e hora | Preenchido quando está na lixeira | — |

## ticket_panels

Um PAINEL (o Kanban de uma equipe): Suporte, Desenvolvimento, e os que a administração criar (Interno, Administrativo, Comercial…). Cada um tem a sua sigla e a sua numeração (SUP-12, DEV-3), as suas etapas e as suas regras.

| Coluna | Tipo | O que guarda | Regras |
|---|---|---|---|
| `id` | texto | Identificador único da linha | chave primária |
| `name` | texto | O nome do painel ("Suporte") | obrigatório |
| `key` | texto | A sigla do código: 2 a 5 letras ("SUP" → SUP-12). Não muda depois do primeiro chamado. | obrigatório |
| `description` | texto | — | — |
| `color` | texto | A cor do painel na tela (um dos tons dos chips: accent, roxo, turquesa…) | obrigatório · padrão: 'accent' |
| `kind` | texto | gestao (os chamados) ou vendas (as negociações do comercial, 2.0.1, decisão 0050) — não muda depois de criado | obrigatório · padrão: 'gestao' |
| `sort_order` | número inteiro | — | obrigatório · padrão: 0 |
| `next_number` | número inteiro | O próximo número da sequência (SUP-1, SUP-2…): nunca volta, nem depois da lixeira | obrigatório · padrão: 1 |
| `access` | texto | todos = quem tem acesso aos chamados vê · escolhidos = só as pessoas de `member_ids` (e quem cuida dos chamados) | obrigatório · padrão: 'todos' |
| `member_ids` | texto | As pessoas que veem e trabalham neste painel, quando o acesso é "escolhidos" | obrigatório · padrão: [] · lista |
| `settings` | JSON | As regras do painel (as opções de Tipo, se conta prazo, em quantos dias o Resolvido fecha, o que é obrigatório ao abrir, se o pai espera os filhos, os supervisores), em JSON | obrigatório · padrão: {} |
| `active` | sim/não | — | obrigatório · padrão: true |
| `created_at` | data e hora | Quando a linha foi criada | — |
| `updated_at` | data e hora | Última alteração | — |
| `deleted_at` | data e hora | Preenchido quando está na lixeira | — |

## ticket_stages

Uma ETAPA (coluna) de um painel, na ordem do quadro. O tipo diz o que ela significa para o chamado (entrada, andamento, resolvido, fechado); o nível marca N1, N2, N3 e DEV (escalonar = subir de nível). Etapa que sai não é apagada: ganha `deleted_at`, e os chamados dela vão para outra antes.

| Coluna | Tipo | O que guarda | Regras |
|---|---|---|---|
| `id` | texto | Identificador único da linha | chave primária |
| `panel_id` | texto | — | obrigatório · liga com **ticketPanels** |
| `name` | texto | — | obrigatório |
| `kind` | texto | entrada | andamento | resolvido | fechado | obrigatório · padrão: 'andamento' |
| `level` | número inteiro | 1, 2, 3 ou 4 (N1, N2, N3, DEV); nulo nas etapas que não são nível | — |
| `sort_order` | número inteiro | — | obrigatório · padrão: 0 |
| `required_fields` | texto | O que precisa estar preenchido para o chamado entrar aqui (lista de campos) | obrigatório · padrão: [] · lista |
| `notify_user_ids` | texto | Quem recebe o aviso quando um chamado chega nesta etapa (ids de pessoas) | obrigatório · padrão: [] · lista |
| `outcome` | texto | No painel de Vendas: ganho ou perdido (a etapa final que diz como a negociação acabou); nas outras, nulo | — |
| `opens_panel_id` | texto | No painel de Vendas (2.3): a negociação que chega aqui abre a implantação no painel com este id — cria o cliente (se ainda não é), põe os produtos no cadastro e abre o card. Nulo: nada. | — |
| `activates_products` | sim/não | No painel de Gestão (2.3, o Implantado da implantação): o chamado que chega aqui liga no cadastro do cliente os produtos dele (com a data de ativação) e os módulos marcados nos campos "Módulos do produto". | obrigatório · padrão: false |
| `receives_implementation` | sim/não | No painel de Vendas (2.3): a negociação vem para esta etapa sozinha quando o card da implantação chega na etapa que liga no cadastro (o Implantado). Uma por painel. | obrigatório · padrão: false |
| `created_at` | data e hora | Quando a linha foi criada | — |
| `deleted_at` | data e hora | Preenchido quando está na lixeira | — |

## ticket_subjects

Um ASSUNTO, em árvore (até 3 níveis), de um painel. Só diz "o quê" (o tipo, a gravidade e a operadora têm o seu próprio campo). Desativar, nunca apagar; o de-para guarda os nomes da lista antiga que viram este assunto. A tela nasce em branco: a equipe monta quando a lista fechar.

| Coluna | Tipo | O que guarda | Regras |
|---|---|---|---|
| `id` | texto | Identificador único da linha | chave primária |
| `panel_id` | texto | — | obrigatório · liga com **ticketPanels** |
| `parent_id` | texto | — | — |
| `name` | texto | — | obrigatório |
| `description` | texto | Quando usar este assunto (aparece ao escolher) | — |
| `active` | sim/não | — | obrigatório · padrão: true |
| `sort_order` | número inteiro | — | obrigatório · padrão: 0 |
| `checklist` | texto | Os passos que entram no checklist do chamado quando ele ganha este assunto | obrigatório · padrão: [] · lista |
| `aliases` | texto | De-para: os nomes da lista antiga que viram este assunto | obrigatório · padrão: [] · lista |
| `created_at` | data e hora | Quando a linha foi criada | — |
| `updated_at` | data e hora | Última alteração | — |

## ticket_fields

Um CAMPO de um painel (o pedido do Luan na prévia: "vou ter outros painéis, então nem sempre vai ser assuntos"): os que cada equipe cria além dos do sistema — o "Sistema" e a "Versão publicada" no Desenvolvimento, por exemplo. O tipo (texto, texto longo, número, data, sim ou não, lista de uma ou de várias opções) não muda depois de criado. O campo que não serve mais é desativado, nunca apagado: o valor fica no chamado (`tickets.custom_fields`, pelo id do campo).

| Coluna | Tipo | O que guarda | Regras |
|---|---|---|---|
| `id` | texto | Identificador único da linha | chave primária |
| `panel_id` | texto | — | obrigatório · liga com **ticketPanels** |
| `name` | texto | — | obrigatório |
| `kind` | texto | texto | texto_longo | numero | data | sim_nao | lista | lista_varios | caixinhas | modulos (2.3) | obrigatório |
| `help` | texto | A explicação que aparece embaixo do campo (na ficha e no Abrir chamado) | — |
| `options` | JSON | As opções das listas: [{id, nome, ativa}] (a que sai fica desativada: o chamado que a tem continua com ela) | obrigatório · padrão: [] |
| `inline_options` | sim/não | Na lista de uma opção: quem trabalha no painel inclui a opção nova ali mesmo, no Abrir chamado e na ficha (2.0.3, a Indicação do Comercial: "eu tenho que conseguir criar por aqui mesmo se quiser") | obrigatório · padrão: false |
| `section` | texto | A parte da ficha (2.3, a implantação: "Curadoria", "Configuração", "Testes"): com ela, o campo vai para o meio da ficha, junto dos outros da mesma parte. Nulo: na classificação (ou junto do relato, o texto longo), como sempre. | — |
| `product_id` | texto | Só aparece quando o chamado tem este produto (2.3: o bloco do LineChat, o do LinePBX); os módulos são os dele | liga com **products** |
| `follows_field_id` | texto | O checklist dos módulos (2.3): o campo de módulos de onde vêm as opções — só os marcados lá (a Curadoria) aparecem aqui (a Configuração). Nulo: o campo é a escolha. | — |
| `accepts_attachments` | sim/não | Recebe anexos (2.3): o Anexar do campo e o clipe de cada caixinha (os do modelo Implantação: os da Curadoria) | obrigatório · padrão: false |
| `active` | sim/não | — | obrigatório · padrão: true |
| `sort_order` | número inteiro | — | obrigatório · padrão: 0 |
| `created_at` | data e hora | Quando a linha foi criada | — |
| `updated_at` | data e hora | Última alteração | — |

## tickets

Um CHAMADO. O código (SUP-12) é o do painel em que nasceu e não muda, nem se o chamado passar de painel. O relato é o que o cliente disse; a descrição, o andamento e os dados técnicos; as anotações ficam em `ticket_notes`, e o histórico de tudo em `ticket_events`.

| Coluna | Tipo | O que guarda | Regras |
|---|---|---|---|
| `id` | texto | Identificador único da linha | chave primária |
| `panel_id` | texto | — | obrigatório · liga com **ticketPanels** |
| `stage_id` | texto | — | obrigatório · liga com **ticketStages** |
| `number` | número inteiro | O número dentro do painel em que nasceu | obrigatório |
| `code` | texto | O código, como a equipe escreve ("SUP-12"). Único. | obrigatório |
| `kind` | texto | chamado | problema (o registro ITIL que junta incidentes de várias empresas) | obrigatório · padrão: 'chamado' |
| `title` | texto | — | obrigatório |
| `customer_report` | texto | O relato do cliente: o que ele disse (vem da conversa) | — |
| `description` | texto | A descrição: o andamento e os dados técnicos | — |
| `client_id` | texto | — | liga com **clients** |
| `contact_name` | texto | O nome de quem procurou o suporte (a pessoa do cliente) | — |
| `contact_phone` | texto | O WhatsApp do contato, só dígitos com o 55 (para avisar o cliente) | — |
| `session_id` | texto | A sessão (conversa) do LineChat de onde o chamado veio (o robô, o botão) ou ligada à mão — o chamado ativo, 2.1 | — |
| `other_contacts` | JSON | Os outros contatos do chamado (2.2, o Luan: "os cards permitem adicionar apenas um contato"): o nome e o WhatsApp de cada um, além do principal (contact_name e contact_phone, que o aviso ao cliente, o robô e a NIA usam) | obrigatório · padrão: [] |
| `other_sessions` | JSON | As outras conversas (sessões) do LineChat ligadas ao chamado (2.2: "permitir colocar mais de uma sessão"), além da principal (session_id) | obrigatório · padrão: [] |
| `origin` | texto | manual | robo | botao | agendado | api | obrigatório · padrão: 'manual' |
| `assignee_id` | texto | — | liga com **users** |
| `watcher_ids` | texto | Quem acompanha o chamado sem ser o responsável (recebe os avisos na tela) | obrigatório · padrão: [] · lista |
| `subject_id` | texto | — | liga com **ticketSubjects** |
| `type` | texto | O Tipo ("que tratativa foi essa?"): uma das opções do painel | — |
| `severity` | texto | inoperancia | intermitencia | performance | disfuncional | nao_se_aplica | — |
| `reach` | texto | empresa | setor | pessoa | — |
| `priority` | texto | critica | alta | media | baixa | — |
| `priority_reason` | texto | Por que a prioridade é diferente da sugerida (gravidade × alcance) | — |
| `product_ids` | texto | Os produtos envolvidos (ids de `products`) — o cliente pode ter mais de um | obrigatório · padrão: [] · lista |
| `carrier_ids` | texto | As operadoras envolvidas (ids de `carriers`) — o cliente pode ter mais de uma | obrigatório · padrão: [] · lista |
| `tags` | texto | — | obrigatório · padrão: [] · lista |
| `custom_fields` | JSON | Os valores dos campos do painel ({id do campo: valor}); o de um campo desativado fica guardado | obrigatório · padrão: {} |
| `solution` | texto | A solução dada | — |
| `cause` | texto | A causa (no problema: a causa raiz, ou a justificativa de não ter achado) | — |
| `workaround` | texto | No problema: a solução de contorno enquanto a causa não é resolvida | — |
| `validation` | texto | No problema: como foi validado que a causa foi resolvida | — |
| `parent_id` | texto | — | — |
| `problem_id` | texto | O problema de que este chamado é incidente | — |
| `checklist` | JSON | O checklist: [{id, texto, feito, porId, em, doAssunto}] | obrigatório · padrão: [] |
| `waits` | JSON | As marcas de espera (esperando o cliente / a operadora): [{tipo, motivo, inicio, fim, porId}] | obrigatório · padrão: [] |
| `alerts_sent` | JSON | Os alertas de prazo já mandados (para não avisar duas vezes): {resposta_perto: quando, …} | obrigatório · padrão: {} |
| `first_response_at` | data e hora | A primeira resposta de uma pessoa (assumir, anotar, avisar o cliente, sair da entrada) | — |
| `resolved_at` | data e hora | — | — |
| `closed_at` | data e hora | — | — |
| `reopen_count` | número inteiro | Quantas vezes foi reaberto | obrigatório · padrão: 0 |
| `last_activity_at` | data e hora | A última coisa que aconteceu (anotação, etapa, campo) — para achar o parado | obrigatório |
| `schedule_id` | texto | O agendado que criou este chamado | — |
| `value_cents` | bigint | A negociação (painel de Vendas, 2.0.1): o valor — a MENSALIDADE —, em centavos (até R$ 100 milhões: não cabe num integer). É o que conta no quadro, no relatório e na meta. | — |
| `product_values` | JSON | A negociação: a mensalidade de cada produto ({id do produto: centavos}); com ela, value_cents é a soma | obrigatório · padrão: {} |
| `setup_cents` | bigint | A negociação: a ATIVAÇÃO (paga uma vez), em centavos — à parte: não soma no quadro nem na meta; o relatório tem as contas dela | — |
| `product_setup` | JSON | A negociação: a ativação de cada produto ({id do produto: centavos}); com ela, setup_cents é a soma | obrigatório · padrão: {} |
| `prospect` | texto | A empresa da negociação que ainda não é cliente (o lead; o cliente do cadastro fica em client_id) | — |
| `lost_reason` | texto | Por que a negociação foi perdida (um dos motivos do painel, ou outro escrito) | — |
| `external_ref` | texto | De onde veio, quando veio de outro sistema (2.0.3, decisão 0054): "helena:<id do card>" — o Trazer do Helena acha por aqui a negociação que já trouxe (atualiza em vez de criar outra). Único. | — |
| `board_position` | número inteiro | O lugar na coluna do quadro que a equipe escolheu arrastando (2.1, nas etapas abertas do painel de Vendas): 1 é o primeiro. Nulo: ninguém arrumou depois que o chamado chegou na etapa (mudar de etapa apaga), e ele vai pela regra de sempre, antes dos arrumados. | — |
| `field_marks` | JSON | Quem marcou cada caixinha e quando (2.3), pelo id do campo e da opção: {campo: {opção: {porId, porNome, em}}}. O valor do campo (as marcadas) continua em `custom_fields`; desmarcar tira a marca. | obrigatório · padrão: {} |
| `source_ticket_id` | texto | A negociação que abriu este card na implantação (2.3, a etapa que abre a implantação no painel de Vendas). Uma negociação abre um card só (fora da lixeira). | — |
| `created_by_id` | texto | — | liga com **users** |
| `created_at` | data e hora | Quando a linha foi criada | — |
| `updated_at` | data e hora | Última alteração | — |
| `deleted_at` | data e hora | Preenchido quando está na lixeira | — |

## ticket_events

O HISTÓRICO do chamado: cada mudança vira uma linha (etapa, responsável, campo, prioridade, espera, ligação, aviso…), com quem fez e quando. `kind` e `data` seguem `textoDoEvento` do shared.

| Coluna | Tipo | O que guarda | Regras |
|---|---|---|---|
| `id` | texto | Identificador único da linha | chave primária |
| `ticket_id` | texto | — | obrigatório · liga com **tickets** |
| `kind` | texto | — | obrigatório |
| `user_id` | texto | Quem fez (nulo = o próprio Gestor, ou uma integração: `actor_name`) | liga com **users** |
| `actor_name` | texto | O nome da integração (a chave de API usada), quando não foi uma pessoa | — |
| `data` | JSON | — | obrigatório · padrão: {} |
| `created_at` | data e hora | Quando a linha foi criada | — |

## ticket_notes

Uma ANOTAÇÃO no chamado (o que a equipe registra no meio do caminho). Apagar só marca.

| Coluna | Tipo | O que guarda | Regras |
|---|---|---|---|
| `id` | texto | Identificador único da linha | chave primária |
| `ticket_id` | texto | — | obrigatório · liga com **tickets** |
| `user_id` | texto | — | liga com **users** |
| `actor_name` | texto | — | — |
| `body` | texto | — | obrigatório |
| `mentioned_user_ids` | texto | quem a anotação cita com @ (recebeu o aviso, mesmo sem observar o chamado) | obrigatório · padrão: [] · lista |
| `created_at` | data e hora | Quando a linha foi criada | — |
| `deleted_at` | data e hora | Preenchido quando está na lixeira | — |

## ticket_attachments

Um ANEXO de anotação (print, PDF, planilha, áudio), no próprio banco como os anexos dos projetos: entra no backup sem mudar nada. A imagem abre na tela; o resto sempre baixa como arquivo.

| Coluna | Tipo | O que guarda | Regras |
|---|---|---|---|
| `id` | texto | Identificador único da linha | chave primária |
| `ticket_id` | texto | — | obrigatório · liga com **tickets** |
| `note_id` | texto | — | liga com **ticketNotes** |
| `field_id` | texto | o campo do card a que o anexo pertence (2.3, o Luan: "em todas as opções eu quero poder anexar imagens ou docs"); nulo: o da anotação | liga com **ticketFields** |
| `option_id` | texto | a caixinha do campo (o id da opção, que vive no campo); nulo: o campo todo | — |
| `file_name` | texto | — | obrigatório |
| `mime_type` | texto | — | obrigatório |
| `size_bytes` | número inteiro | — | obrigatório · padrão: 0 |
| `data_base64` | texto | — | obrigatório |
| `uploaded_by_id` | texto | — | liga com **users** |
| `created_at` | data e hora | Quando a linha foi criada | — |
| `deleted_at` | data e hora | Preenchido quando está na lixeira | — |

## ticket_links

Uma LIGAÇÃO feita à mão entre dois chamados: relacionado, duplicado de, repete. (O pai e o problema têm coluna própria no chamado.) Tirar a ligação só marca `deleted_at`.

| Coluna | Tipo | O que guarda | Regras |
|---|---|---|---|
| `id` | texto | Identificador único da linha | chave primária |
| `from_id` | texto | — | obrigatório · liga com **tickets** |
| `to_id` | texto | — | obrigatório · liga com **tickets** |
| `kind` | texto | relacionado | duplicado | repete | obrigatório |
| `created_by_id` | texto | — | liga com **users** |
| `created_at` | data e hora | Quando a linha foi criada | — |
| `deleted_at` | data e hora | Preenchido quando está na lixeira | — |

## ticket_time_entries

O TEMPO GASTO: quem trabalhou no chamado, quanto e quando (o relatório da visita técnica).

| Coluna | Tipo | O que guarda | Regras |
|---|---|---|---|
| `id` | texto | Identificador único da linha | chave primária |
| `ticket_id` | texto | — | obrigatório · liga com **tickets** |
| `user_id` | texto | — | liga com **users** |
| `minutes` | número inteiro | — | obrigatório |
| `note` | texto | — | — |
| `worked_on` | texto | O dia do trabalho (AAAA-MM-DD, de Brasília) | obrigatório |
| `created_at` | data e hora | Quando a linha foi criada | — |
| `deleted_at` | data e hora | Preenchido quando está na lixeira | — |

## ticket_carrier_cases

O CHAMADO ABERTO NA OPERADORA: o protocolo, quando abriu, o prazo que a operadora prometeu e as cobranças — num lugar só, em vez de perdido nas anotações. Tem relógio próprio (a espera pela operadora não para o prazo do chamado).

| Coluna | Tipo | O que guarda | Regras |
|---|---|---|---|
| `id` | texto | Identificador único da linha | chave primária |
| `ticket_id` | texto | — | obrigatório · liga com **tickets** |
| `carrier_id` | texto | — | liga com **carriers** |
| `carrier_name` | texto | O nome da operadora (quando não é uma do cadastro) | obrigatório |
| `protocol` | texto | — | obrigatório |
| `opened_at` | data e hora | — | obrigatório |
| `promised_at` | data e hora | Quando a operadora prometeu resolver | — |
| `follow_up_hours` | número inteiro | Cobrar a operadora a cada quantas horas | — |
| `status` | texto | aberto | fechado | obrigatório · padrão: 'aberto' |
| `closed_at` | data e hora | — | — |
| `history` | JSON | O andamento: [{em, porId, acao: abriu|cobrou|fechou, texto}] | obrigatório · padrão: [] |
| `created_by_id` | texto | — | liga com **users** |
| `created_at` | data e hora | Quando a linha foi criada | — |

## ticket_schedules

Um CHAMADO AGENDADO: nasce sozinho na hora marcada (a verificação dos DIDs todo dia 15).

| Coluna | Tipo | O que guarda | Regras |
|---|---|---|---|
| `id` | texto | Identificador único da linha | chave primária |
| `panel_id` | texto | — | obrigatório · liga com **ticketPanels** |
| `title` | texto | — | obrigatório |
| `customer_report` | texto | — | — |
| `client_id` | texto | — | liga com **clients** |
| `assignee_id` | texto | — | liga com **users** |
| `subject_id` | texto | — | liga com **ticketSubjects** |
| `priority` | texto | — | — |
| `checklist` | texto | — | obrigatório · padrão: [] · lista |
| `rule` | JSON | A regra: {frequencia: diaria|semanal|mensal|uma_vez, hora, dias, diaDoMes, data, soDiasDeAtendimento} | obrigatório |
| `active` | sim/não | — | obrigatório · padrão: true |
| `next_run_at` | data e hora | A próxima vez em que nasce (o relógio olha esta coluna) | — |
| `last_run_at` | data e hora | — | — |
| `last_ticket_code` | texto | O código do último chamado que nasceu daqui | — |
| `created_by_id` | texto | — | liga com **users** |
| `created_at` | data e hora | Quando a linha foi criada | — |
| `updated_at` | data e hora | Última alteração | — |
| `deleted_at` | data e hora | Preenchido quando está na lixeira | — |

## ticket_macros

Uma RESPOSTA PRONTA: um clique manda a mensagem e muda o chamado ("Pedir teste ao cliente" manda o texto e marca que o chamado espera o cliente). Sem painel = vale em todos.

| Coluna | Tipo | O que guarda | Regras |
|---|---|---|---|
| `id` | texto | Identificador único da linha | chave primária |
| `panel_id` | texto | — | liga com **ticketPanels** |
| `name` | texto | — | obrigatório |
| `body` | texto | O texto, com {contato}, {codigo}, {cliente}, {titulo}, {responsavel} e {eu} | obrigatório · padrão: '' |
| `action` | JSON | O que muda no chamado: {avisarCliente, etapaId, esperar, etiqueta, assumir} | obrigatório · padrão: {} |
| `sort_order` | número inteiro | — | obrigatório · padrão: 0 |
| `active` | sim/não | — | obrigatório · padrão: true |
| `created_by_id` | texto | — | liga com **users** |
| `created_at` | data e hora | Quando a linha foi criada | — |
| `updated_at` | data e hora | Última alteração | — |
| `deleted_at` | data e hora | Preenchido quando está na lixeira | — |

## ticket_tags

Uma ETIQUETA e a COR dela (2.0, o pedido do Luan na prévia: "na hora de criar as etiquetas, escolher a cor"). O chamado guarda os nomes (`tickets.tags`), sempre escritos como aqui. A etiqueta nova nasce com a cor escolhida na tela, ou cinza (o robô, a IA, a resposta pronta); quem cuida dos chamados troca a cor em Ajustes › Etiquetas. Desde o 2.0.3 cada PAINEL tem as suas (o pedido do Luan: "as etiquetas tem q ser por painel, cada painel vai ter suas etiquetas"): o mesmo nome pode estar em dois painéis, cada um com a sua cor (a migração 0023 pôs cada etiqueta nos painéis em que estava em uso).

| Coluna | Tipo | O que guarda | Regras |
|---|---|---|---|
| `id` | texto | Identificador único da linha | chave primária |
| `panel_id` | texto | O painel da etiqueta: ela só é sugerida e só tem esta cor nos chamados dele | obrigatório · liga com **ticketPanels** |
| `name` | texto | O nome como a equipe escreveu ("Cliente VIP") | obrigatório |
| `name_key` | texto | O nome para comparar (minúsculo, sem acento, um espaço só): não se repete | obrigatório |
| `color` | texto | A cor: neutral (cinza), accent (azul), roxo, turquesa, ok (verde), amarelo, signal (laranja), bad (vermelho), rosa | obrigatório · padrão: 'neutral' |
| `created_by_id` | texto | — | liga com **users** |
| `created_at` | data e hora | Quando a linha foi criada | — |
| `updated_at` | data e hora | Última alteração | — |

## ticket_contacts

O TELEFONE QUE O GESTOR JÁ CONHECE: o WhatsApp de um contato e o cliente dele, aprendido dos chamados. É o que faz o chamado que chega pelo robô já vir com o cliente preenchido.

| Coluna | Tipo | O que guarda | Regras |
|---|---|---|---|
| `id` | texto | Identificador único da linha | chave primária |
| `phone` | texto | Só dígitos, com o 55 | obrigatório |
| `name` | texto | — | — |
| `client_id` | texto | — | liga com **clients** |
| `updated_at` | data e hora | Última alteração | — |

## ticket_notifications

Um AVISO NA TELA (o sininho): recebeu um chamado, o prazo está vencendo, o cliente respondeu…

| Coluna | Tipo | O que guarda | Regras |
|---|---|---|---|
| `id` | texto | Identificador único da linha | chave primária |
| `user_id` | texto | — | obrigatório · liga com **users** |
| `ticket_id` | texto | — | liga com **tickets** |
| `calendar_event_id` | texto | O evento do calendário do lembrete (2.0.2): o aviso é do calendário, e não de um chamado | liga com **calendarEvents** |
| `kind` | texto | recebeu | etapa | prazo_perto | prazo_vencido | sem_dono | critico | cliente_respondeu | pai | observador | lembrete (o do calendário, 2.0.2) | obrigatório |
| `body` | texto | — | obrigatório |
| `created_at` | data e hora | Quando a linha foi criada | — |
| `read_at` | data e hora | — | — |

## ticket_webhooks

Um AVISO PARA FORA (webhook): o Gestor manda o que aconteceu com os chamados para outro sistema (o n8n). A assinatura (o segredo) fica no cofre; o resultado do último envio fica aqui.

| Coluna | Tipo | O que guarda | Regras |
|---|---|---|---|
| `id` | texto | Identificador único da linha | chave primária |
| `name` | texto | — | obrigatório |
| `url` | texto | — | obrigatório |
| `events` | texto | Os eventos: chamado.criado, chamado.alterado, chamado.movido, chamado.anotacao, chamado.resolvido, chamado.fechado | obrigatório · padrão: [] · lista |
| `active` | sim/não | — | obrigatório · padrão: true |
| `secret_id` | texto | O segredo da assinatura (HMAC), no cofre | liga com **secrets** |
| `last_at` | data e hora | — | — |
| `last_ok` | sim/não | — | — |
| `last_message` | texto | — | — |
| `created_by_id` | texto | — | liga com **users** |
| `created_at` | data e hora | Quando a linha foi criada | — |
| `updated_at` | data e hora | Última alteração | — |
| `deleted_at` | data e hora | Preenchido quando está na lixeira | — |

## ticket_api_keys

Uma CHAVE DE API para o robô do LineChat e o n8n abrirem e mexerem nos chamados. A chave aparece uma vez, ao criar; no banco fica só o resumo (sha256) e o começo, para reconhecer na lista.

| Coluna | Tipo | O que guarda | Regras |
|---|---|---|---|
| `id` | texto | Identificador único da linha | chave primária |
| `name` | texto | — | obrigatório |
| `prefix` | texto | Os primeiros caracteres da chave (para a pessoa reconhecer qual é) | obrigatório |
| `hash` | texto | O sha256 da chave inteira | obrigatório |
| `last_used_at` | data e hora | — | — |
| `created_by_id` | texto | — | liga com **users** |
| `created_at` | data e hora | Quando a linha foi criada | — |
| `revoked_at` | data e hora | — | — |

## calendar_events

Um EVENTO do calendário: o que acontece, de que equipe, com quem, em qual cliente e quando.

| Coluna | Tipo | O que guarda | Regras |
|---|---|---|---|
| `id` | texto | Identificador único da linha | chave primária |
| `title` | texto | O que acontece ("Virada para nuvem — Clínica Aurora") | obrigatório |
| `type_id` | texto | O tipo (o id de um dos tipos de `settings.calendario`: visita, folga…) | obrigatório |
| `panel_ids` | texto | Os painéis (as equipes) do evento: quem vê um deles vê o evento | obrigatório · padrão: [] · lista |
| `participant_ids` | texto | As pessoas do evento (quem vai na visita, quem está de folga) | obrigatório · padrão: [] · lista |
| `client_id` | texto | — | liga com **clients** |
| `ticket_id` | texto | O chamado que pediu o evento (a visita do SUP-12) | liga com **tickets** |
| `starts_on` | texto | O primeiro dia (AAAA-MM-DD, o dia do calendário: não tem fuso) | obrigatório |
| `ends_on` | texto | O último dia (o mesmo do primeiro num evento de um dia só) | obrigatório |
| `all_day` | sim/não | Dia inteiro, sem hora (a folga, a virada que leva o dia) | obrigatório · padrão: true |
| `start_time` | texto | A hora de começar e de terminar (HH:MM, a de Brasília), quando não é o dia inteiro | — |
| `end_time` | texto | — | — |
| `location` | texto | Onde (o endereço da visita, "remoto") | — |
| `notes` | texto | — | — |
| `status` | texto | agendado | feito | cancelado (cancelar não apaga: fica riscado no calendário) | obrigatório · padrão: 'agendado' |
| `reminders` | número inteiro | Os lembretes (2.0.2): quantos minutos antes do começo cada um sai (0 = na hora; o dia inteiro começa às 8h) | obrigatório · padrão: [] · lista |
| `remind_who` | texto | Quem recebe o lembrete: pessoas (as do evento; sem pessoas, quem criou) | paineis (todos que veem o evento) | obrigatório · padrão: 'pessoas' |
| `reminders_sent` | JSON | Os lembretes que já saíram (ou foram pulados): {"<minutos>@<começo>": quando}; mudar o dia ou a hora muda o começo, e o lembrete volta a valer | obrigatório · padrão: {} |
| `created_by_id` | texto | — | liga com **users** |
| `updated_by_id` | texto | — | liga com **users** |
| `created_at` | data e hora | Quando a linha foi criada | — |
| `updated_at` | data e hora | Última alteração | — |
| `deleted_at` | data e hora | Preenchido quando está na lixeira | — |

## sales_simulations

Uma SIMULAÇÃO do Comercial: o nome, os cenários e a negociação ligada.

| Coluna | Tipo | O que guarda | Regras |
|---|---|---|---|
| `id` | texto | Identificador único da linha | chave primária |
| `name` | texto | O nome (o cliente, a proposta: "Clínica Aurora — 10 ramais") | obrigatório |
| `ticket_id` | texto | A negociação ligada (um chamado de um painel de Vendas), quando a pessoa liga | liga com **tickets** |
| `scenarios` | JSON | Os cenários (1 a 3), cada um com todos os números: a mensalidade e a ativação em centavos, as parcelas, o prazo, o imposto, os produtos (e o preço de cada um) e as linhas de custo — o formato de `CenarioDaSimulacao` (`@gestor/shared`; os guardados antes de 21/10, com os ramais e a margem que se queria, são lidos pelo `semOQueSaiu`). As linhas guardam o valor de quando entraram: mudar a tabela de custos não muda a simulação já feita. | obrigatório · padrão: [] |
| `principal` | texto | O id do cenário principal: o que a lista e a negociação mostram | obrigatório |
| `created_by_id` | texto | — | liga com **users** |
| `updated_by_id` | texto | — | liga com **users** |
| `created_at` | data e hora | Quando a linha foi criada | — |
| `updated_at` | data e hora | Última alteração | — |
| `deleted_at` | data e hora | Preenchido quando está na lixeira | — |

