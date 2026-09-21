# 0025 — Rodada 23: login padrão por modelo, tronco por IP ou login, DID sempre com circuito e "em uso"

**Contexto.** Depois de uma semana com os dados do Nexus em produção, o Luan mandou treze pedidos
num .docx com prints (19/09/2026). Nenhum contraria decisão anterior; dois mexem em regra de negócio
(o DID passa a exigir circuito, e ganha uma marca "em uso") e por isso ficam registrados aqui.

**Decisões.**

- **Login e senha padrão dos aparelhos, por modelo.** Não é por equipamento: todos os GXP1610 de
  um cliente entram com o mesmo login e senha; os DP722, com outro. Tabela `client_device_logins`
  (cliente × modelo, login, senha no cofre, anotação), um por modelo. Fica **dentro da seção Rede
  padrão dos aparelhos**, na aba Equipamentos — é a mesma informação de "como configurar um
  aparelho deste cliente". Remover marca `deleted_at`; a senha continua no cofre sem ninguém apontar.
- **Unidade tem endereço e IP fixo de saída** (`client_units.address`, `client_units.egress_ip`).
  O IP de saída é o que a operadora e o servidor enxergam quando os ramais daquela unidade registram.
- **Tronco autentica por IP ou por login e senha** (`circuits.auth_type`, padrão `ip`).
  Por IP: IP da operadora + IP do PBX. Por login: IP da operadora (opcional) + login + senha.
  O que não pertence ao tipo escolhido é limpo ao salvar; a senha do cofre não se apaga.
  Migração: quem já tinha login cadastrado ficou como `login`; os demais, `ip`.
- **Não existe "DID sem circuito".** Faixa nova, edição em massa e importação exigem circuito.
  Saem o cartão "DIDs sem circuito", o filtro "Sem circuito", a opção "sem circuito" ao mudar de
  circuito e o alerta do Painel. A coluna do banco continua aceitando nulo só por causa de registro
  antigo; o servidor não cria mais nenhum.
- **DID tem a marca "em uso" / "não usado"** (`dids.in_use`). **Alocar não é usar**: o número entra
  no cliente como "não usado" e alguém marca "em uso" quando ele passa a atender. Ao liberar ou trocar
  de cliente, a marca cai. Número livre nunca está em uso e não pode ser marcado. Aparece na aba DIDs
  da ficha, na ficha do circuito e na Numeração (coluna, filtro e ação em massa), sempre clicável.
  Na migração, os números que já estavam com cliente (vindos do Nexus) entraram como "em uso".
  Para não confundir com a marca, "Em uso" da tabela de circuitos virou **Ocupação** e o cartão
  "Em uso" da ficha do circuito virou **Com cliente**.
- **Rede padrão dos aparelhos** por cliente (`client_network_settings`: IP, máscara, roteador padrão,
  DNS 1 e 2, senha do ramal sem fio no cofre, anotação). Fica no topo da aba Equipamentos, com os
  logins por modelo logo abaixo.
- **Campo de IP com máscara** (`formatarIp`, em `packages/shared`): digitar `19216801` vira
  `192.168.0.1`. O octeto fecha quando não cabe mais dígito (três dígitos, "0" sozinho, ou dois
  dígitos que passariam de 255); um ponto digitado à mão também fecha. Vale em todo campo de IP:
  rede padrão, IP de saída da unidade, IPs do tronco e IP do aparelho.
- **FOP2 guarda a senha do usuário padrão** (`fop2_settings.default_user_password_secret_id`).
- **Movimentações** filtram por **modelo** e por **MAC ou N/S** (a vida de um aparelho, em ordem).
- **Movimentar aparelhos aceita uma lista colada** de MACs ou N/S: o que existe na origem entra na
  seleção; o que não existe é listado, sem barrar o resto.
- **Item de catálogo pode ser renomeado** (lápis ao lado do nome). Nome repetido é recusado.
- **A lista de clientes não tem páginas**: vem inteira, sempre. As outras listas continuam com
  páginas + "Ver tudo".
- **Filtro de modalidade saiu** da aba Equipamentos do cliente (a coluna fica).
- **"address" que aparecia sozinho nas anotações do tronco** era o preenchimento automático do
  navegador, não o sistema. Os campos do formulário de circuito (e os novos formulários) ganharam
  `autoComplete="off"` e as marcas que os gerenciadores de senha respeitam.

**Consequências.**

- Migração `0002_rodada23.sql`: duas tabelas novas, seis colunas, e dois acertos de dados (tipo de
  autenticação pelo login existente; número com cliente marcado como em uso, livre como não usado).
- Testes: `rodada23.test.ts` (11) e dois testes antigos de DIDs reescritos para a regra nova.
  58 testes da API + 10 dos formatos.
- Exportação/importação de circuitos: login no arquivo = autenticação por login; sem login = por IP.
