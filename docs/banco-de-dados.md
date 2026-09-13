# Banco de dados — o que o Gestor guarda

> Gerado automaticamente a partir de `packages/db/src/schema.ts` por `pnpm db:docs`. **Não edite à mão**: edite o comentário no schema e gere de novo.

Cada seção é uma tabela (pense numa planilha com colunas fixas). "Liga com" indica que a coluna guarda o identificador de uma linha de outra tabela — é assim que as tabelas se relacionam.

Convenções: dinheiro em centavos inteiros · CNPJ, DID e MAC guardados só com dígitos/hexadecimais · `deleted_at` preenchido = lixeira · senhas só na tabela **secrets**, cifradas.

## Índice

- [clients](#clients) — Uma linha por empresa.
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
- [devices](#devices) — Um aparelho serializado, identificado pelo MAC (decisão V7).
- [bulk_stock](#bulk_stock) — Saldo de itens a granel por lugar: "Headset Genérico · Estoque · 28", "Headset Genérico · Cliente A · 4".
- [device_movements](#device_movements) — Cabeçalho de uma movimentação: de onde, para onde, por quê, quem, quando.
- [device_movement_items](#device_movement_items) — Um item da movimentação: ou um aparelho serializado (deviceId) ou uma quantidade de um modelo a granel.
- [roles](#roles) — Um papel = um nome + uma lista de permissões (ver packages/shared/src/permissoes.ts).
- [users](#users) — Quem entra no sistema.
- [sessions](#sessions) — Sessão de login (cookie).
- [secrets](#secrets) — O COFRE.
- [audit_log](#audit_log) — Quem fez o quê, em qual registro, quando — com o antes e o depois.


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
| `logo_url` | texto | Caminho da imagem do logo (arquivo guardado fora do banco) | — |
| `archived` | sim/não | Arquivado = some da lista padrão, mas não é apagado (era "ocultar" no Nexus) | obrigatório · padrão: false |
| `is_internal` | sim/não | Organização do próprio grupo (Ingline, VoiceNet). Não conta como cliente nos indicadores. | obrigatório · padrão: false |
| `internal_code` | texto | Código curto para as internas ("ingline", "voicenet"); nulo para clientes | — |
| `notes` | texto | Anotações gerais sobre o cliente | — |
| `created_at` | data e hora | Quando a linha foi criada | — |
| `updated_at` | data e hora | Última alteração | — |
| `deleted_at` | data e hora | Preenchido quando foi mandado para a lixeira | — |

## products

Catálogo dos produtos vendidos (LinePBX, LineChat, LineReports, SZChat, VoiceNet, Equipamentos — gerenciável pela Administração).

| Coluna | Tipo | O que guarda | Regras |
|---|---|---|---|

## product_modules

Catálogo de MÓDULOS: partes opcionais dentro de um produto. LinePBX tem Omniboard, FOP2 e NPS; LineChat tem Dashboard de filas e NPS. Gerenciável pela Administração.

| Coluna | Tipo | O que guarda | Regras |
|---|---|---|---|
| `id` | texto | Identificador único da linha | chave primária |
| `code` | texto | Identificador estável dentro do produto ("fop2", "nps"…) | obrigatório |
| `name` | texto | Nome exibido | obrigatório |
| `description` | texto | Uma frase explicando o módulo | — |
| `has_settings` | sim/não | Tem configuração própria? (FOP2: ramal admin · Omniboard: login e senhas) | obrigatório · padrão: false |
| `sort_order` | número inteiro | — | obrigatório · padrão: 0 |
| `active` | sim/não | — | obrigatório · padrão: true |

## subscriptions

"O cliente X assina o produto Y." Uma linha por par cliente × produto. Guarda quando começou e — diferente do Nexus — quando terminou.

| Coluna | Tipo | O que guarda | Regras |
|---|---|---|---|
| `id` | texto | Identificador único da linha | chave primária |
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

## subscription_modules

"Na assinatura X, o módulo Y está ligado." Uma linha por par assinatura × módulo. Só faz sentido dentro de um produto que o cliente assina (o servidor confere).

| Coluna | Tipo | O que guarda | Regras |
|---|---|---|---|
| `id` | texto | Identificador único da linha | chave primária |
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

## omniboard_settings

Configuração própria do módulo Omniboard (call center, dentro do LinePBX).

| Coluna | Tipo | O que guarda | Regras |
|---|---|---|---|

## szchat_settings

Configuração própria do SZChat (legado Fortics).

| Coluna | Tipo | O que guarda | Regras |
|---|---|---|---|

## hosting_providers

Catálogo: onde um servidor pode estar hospedado (Local, Vultr, AWS, Contabo, Hetzner...).

| Coluna | Tipo | O que guarda | Regras |
|---|---|---|---|


---

# 2. NUMERAÇÃO (circuitos e DIDs)

## carriers

Catálogo: operadoras que fornecem circuitos (ALGAR, VC1...).

| Coluna | Tipo | O que guarda | Regras |
|---|---|---|---|

## circuits

Um circuito (feixe) contratado junto a uma operadora. Agrupa DIDs e tem um limite de canais.

| Coluna | Tipo | O que guarda | Regras |
|---|---|---|---|
| `id` | texto | Identificador único da linha | chave primária |
| `name` | texto | Nome interno ("071 Antigo", "Link - Cliente A") | obrigatório |
| `code` | texto | Código do circuito na operadora | obrigatório |
| `carrier_id` | texto | — | liga com **carriers** |
| `channels` | número inteiro | Canais = chamadas simultâneas que o feixe suporta | obrigatório · padrão: 0 |
| `owner_client_id` | texto | Titular do circuito: quem detém o contrato com a operadora (normalmente VoiceNet) | liga com **clients** |
| `monthly_value_cents` | número inteiro | Custo/valor mensal do feixe, em centavos | — |
| `signaling_ip` | texto | IP da operadora (sinalização) | — |
| `auth_ip` | texto | IP de autenticação ("IP PBX" no Nexus) | — |
| `auth_username` | texto | Usuário de autenticação do tronco | — |
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
| `circuit_id` | texto | Circuito ao qual pertence. Nulo = "sem circuito". | liga com **circuits** |
| `client_id` | texto | Cliente que USA o número. Nulo = livre. | liga com **clients** |
| `owner_client_id` | texto | Titular: quem DETÉM o número junto à operadora (normalmente VoiceNet) | liga com **clients** |
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

## device_models

Um modelo de aparelho (ex.: Grandstream GXP1610). Diz se é contado um a um ou por quantidade.

| Coluna | Tipo | O que guarda | Regras |
|---|---|---|---|

## devices

Um aparelho serializado, identificado pelo MAC (decisão V7).

| Coluna | Tipo | O que guarda | Regras |
|---|---|---|---|
| `id` | texto | Identificador único da linha | chave primária |
| `model_id` | texto | — | obrigatório · liga com **deviceModels** |
| `mac` | texto | MAC principal, 12 hexadecimais maiúsculos sem separador. Único. | obrigatório |
| `mac_secondary` | texto | Segundo MAC (Wi-Fi, por exemplo), se houver | — |
| `tag` | texto | Etiqueta/patrimônio interno opcional (o "N001" do Nexus) | — |
| `client_id` | texto | Onde está: nulo = no estoque; preenchido = com este cliente | liga com **clients** |
| `current_modality` | texto | Como chegou ao cliente atual: locacao | venda | comodato (nulo se em estoque) | — |
| `condition` | texto | ativo | manutencao | baixado | vendido (decisão V6: sem "indeterminado") | obrigatório · padrão: 'ativo' |
| `value_cents` | número inteiro | Valor do aparelho em centavos (alimenta "valor total locado") | — |
| `ip` | texto | IP configurado no aparelho, se houver | — |
| `location` | texto | Onde fisicamente está ("Rack 3 · Sala 2") | — |
| `note` | texto | — | — |
| `created_at` | data e hora | Quando a linha foi criada | — |
| `updated_at` | data e hora | Última alteração | — |
| `deleted_at` | data e hora | Preenchido quando está na lixeira | — |

## bulk_stock

Saldo de itens a granel por lugar: "Headset Genérico · Estoque · 28", "Headset Genérico · Cliente A · 4".

| Coluna | Tipo | O que guarda | Regras |
|---|---|---|---|
| `id` | texto | Identificador único da linha | chave primária |
| `model_id` | texto | — | obrigatório · liga com **deviceModels** |
| `client_id` | texto | Nulo = estoque; preenchido = com o cliente | liga com **clients** |
| `modality` | texto | Como chegou ao cliente (locacao | venda | comodato); "estoque" quando no estoque | obrigatório · padrão: 'estoque' |
| `quantity` | número inteiro | — | obrigatório · padrão: 0 |
| `updated_at` | data e hora | Última alteração | — |

## device_movements

Cabeçalho de uma movimentação: de onde, para onde, por quê, quem, quando. Nunca é editada.

| Coluna | Tipo | O que guarda | Regras |
|---|---|---|---|
| `id` | texto | Identificador único da linha | chave primária |
| `modality` | texto | locacao | venda | comodato | devolucao | obrigatório |
| `from_client_id` | texto | Origem: nulo = estoque | liga com **clients** |
| `to_client_id` | texto | Destino: nulo = estoque | liga com **clients** |
| `new_condition` | texto | Condição aplicada aos aparelhos nesta movimentação (nulo = manteve) | — |
| `value_cents` | número inteiro | Valor total da movimentação em centavos (venda, por exemplo) | — |
| `note` | texto | — | — |
| `user_id` | texto | Quem executou | obrigatório · liga com **users** |
| `created_at` | data e hora | Quando a linha foi criada | — |

## device_movement_items

Um item da movimentação: ou um aparelho serializado (deviceId) ou uma quantidade de um modelo a granel.

| Coluna | Tipo | O que guarda | Regras |
|---|---|---|---|


---

# 4. SEGURANÇA E HISTÓRICO

## roles

Um papel = um nome + uma lista de permissões (ver packages/shared/src/permissoes.ts).

| Coluna | Tipo | O que guarda | Regras |
|---|---|---|---|

## users

Quem entra no sistema.

| Coluna | Tipo | O que guarda | Regras |
|---|---|---|---|

## sessions

Sessão de login (cookie). Expira sozinha.

| Coluna | Tipo | O que guarda | Regras |
|---|---|---|---|
| `id` | texto | Identificador único da linha | chave primária |
| `expires_at` | data e hora | — | obrigatório |
| `created_at` | data e hora | Quando a linha foi criada | — |
| `ip` | texto | — | — |
| `user_agent` | texto | — | — |

## secrets

O COFRE. Toda senha do sistema mora aqui, cifrada (AES-256-GCM) com a chave-mestra que fica FORA do banco. Sem a chave, esta tabela é ruído.

| Coluna | Tipo | O que guarda | Regras |
|---|---|---|---|

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

