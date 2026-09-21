# Banco de dados — o que o Ingline Gestão guarda

> Gerado automaticamente a partir de `packages/db/src/schema.ts` por `pnpm db:docs`. **Não edite à mão**: edite o comentário no schema e gere de novo.

Cada seção é uma tabela (pense numa planilha com colunas fixas). "Liga com" indica que a coluna guarda o identificador de uma linha de outra tabela — é assim que as tabelas se relacionam.

Convenções: dinheiro em centavos inteiros · CNPJ, DID e MAC guardados só com dígitos/hexadecimais · `deleted_at` preenchido = lixeira · senhas só na tabela **secrets**, cifradas.

## Índice

- [clients](#clients) — Uma linha por empresa.
- [client_logos](#client_logos) — A logo do cliente, guardada no próprio banco (uma linha por cliente que tem logo).
- [client_units](#client_units) — As UNIDADES de um cliente: matriz, filiais, lojas, andares.
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

## client_units

As UNIDADES de um cliente: matriz, filiais, lojas, andares. Todo cliente tem a "Matriz", criada sozinha; as outras se cadastram na ficha do cliente. É daqui que sai a lista de unidades na hora de movimentar aparelhos. O aparelho guarda o NOME da unidade (`devices.unit`); renomear aqui renomeia nos aparelhos.

| Coluna | Tipo | O que guarda | Regras |
|---|---|---|---|
| `id` | texto | Identificador único da linha | chave primária |
| `name` | texto | Nome da unidade: "Matriz", "Loja Simões Filho" | obrigatório |
| `is_main` | sim/não | A matriz: existe em todo cliente, é a unidade padrão e não pode ser removida | obrigatório · padrão: false |
| `address` | texto | Endereço da unidade (rua, número, bairro, cidade) | — |
| `egress_ip` | texto | IP fixo de saída da rede desta unidade — o IP que chega ao servidor quando os ramais registram | — |
| `note` | texto | Observação ou referência, opcional | — |
| `created_at` | data e hora | Quando a linha foi criada | — |
| `updated_at` | data e hora | Última alteração | — |
| `deleted_at` | data e hora | Preenchido quando está na lixeira | — |

## client_device_logins

LOGIN E SENHA PADRÃO DOS APARELHOS do cliente, POR MODELO: todos os GXP1610 de um cliente entram com o mesmo login e senha; os DP722, com outro. Uma linha por cliente × modelo. A senha nunca fica aqui — vai para o cofre (`secrets`). Faz par com a rede padrão.

| Coluna | Tipo | O que guarda | Regras |
|---|---|---|---|
| `id` | texto | Identificador único da linha | chave primária |
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
| `key_number` | texto | Número chave (número piloto): o número principal do feixe junto à operadora | — |
| `owner_client_id` | texto | Titular do circuito: quem detém o contrato com a operadora (normalmente VoiceNet) | liga com **clients** |
| `third_party` | sim/não | Circuito que NÃO é da VoiceNet: o tronco que o próprio cliente contratou de outra operadora. Guardar é útil (dá para saber a numeração dele), mas polui o controle da VoiceNet — por isso fica fora das listas, dos cartões e do painel até alguém ligar "links de terceiros". | obrigatório · padrão: false |
| `monthly_value_cents` | número inteiro | Custo/valor mensal do feixe, em centavos | — |
| `auth_type` | texto | Como o tronco se autentica na operadora: - `ip`: pelo IP — basta o IP da operadora e o IP do PBX - `login`: por login e senha do tronco | obrigatório · padrão: 'ip' |
| `signaling_ip` | texto | IP da operadora (sinalização) | — |
| `auth_ip` | texto | IP do PBX que a operadora autoriza (só na autenticação por IP; "IP PBX" no Nexus) | — |
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

## device_models

Um modelo de aparelho (ex.: Grandstream GXP1610). Diz se é contado um a um ou por quantidade.

| Coluna | Tipo | O que guarda | Regras |
|---|---|---|---|

## device_model_images

A foto do modelo, no próprio banco (como a logo do cliente). Reduzida no navegador antes de subir.

| Coluna | Tipo | O que guarda | Regras |
|---|---|---|---|

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

## settings

AJUSTES DO SISTEMA que a pessoa preenche na tela (Administração › Ajustes), em vez de mexer em arquivo no servidor. Uma linha por assunto: 'backup' e 'avisos'. - `value` guarda o que NÃO é segredo (pasta do Drive, endereço do aviso, se está ligado, e o resultado do último envio), em JSON - `secretId` aponta para o cofre, onde mora o que é segredo: a chave da conta de serviço do Google e o token da API de avisos

| Coluna | Tipo | O que guarda | Regras |
|---|---|---|---|

## sessions

Sessão de login (cookie). Expira sozinha.

| Coluna | Tipo | O que guarda | Regras |
|---|---|---|---|
| `id` | texto | Identificador único da linha | chave primária |
| `expires_at` | data e hora | — | obrigatório |
| `pending_totp` | sim/não | true = entrou com a senha certa, mas ainda falta o código de 6 dígitos. Não vale como login. | obrigatório · padrão: false |
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


---

# 5. NOVIDADES (notas de versão)

## release_notes

Uma NOTA DE VERSÃO ("o que mudou na rodada 23"). Quando publicada, aparece uma vez para cada pessoa no login e só para de aparecer quando ela marca "Li e entendi". Rascunho = `publishedAt` nulo: ninguém vê até publicar.

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
| `kind` | texto | — | obrigatório · padrão: 'novo' |
| `title` | texto | — | obrigatório |
| `text` | texto | Duas ou três linhas explicando, em português de gente | — |
| `sort_order` | número inteiro | Ordem em que os cartões aparecem | obrigatório · padrão: 0 |

## release_note_images

O print de um item, no próprio banco (como a logo do cliente e a foto do modelo).

| Coluna | Tipo | O que guarda | Regras |
|---|---|---|---|

## release_note_reads

"Fulano leu a nota da rodada 23 em tal dia." Uma linha por pessoa × nota.

| Coluna | Tipo | O que guarda | Regras |
|---|---|---|---|
| `id` | texto | Identificador único da linha | chave primária |
| `read_at` | data e hora | — | obrigatório |

