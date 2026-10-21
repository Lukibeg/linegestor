# 0053 — O cargo do contato numa lista

**Contexto.** Em 21/10, com o 2.0.2 ainda na prévia, o Luan mandou o print da janela **Novo contato de
Gefpel - Auto Peças**, com o cargo escrito dentro do nome ("Aline - Analista de Pós-Vendas") e o campo
**Cargo ou setor** vazio, e pediu: *"eu quero que esses cargos sejam pré-seleção"*. Desde o 2.0 (decisão
0047), o cargo era um texto livre, e cada um escrevia de um jeito ("Recepção", "recepcao", "Gerente da
loja"). Como o 2.0.2 não subiu, a lista entrou nele.

**Decisão.**

- **O cargo se escolhe numa lista**, na janela do contato — a mesma no cliente (aba Contatos), no Abrir
  chamado e na ficha do chamado: **Sem cargo** e os cargos ativos, em ordem alfabética.
- **A lista é um catálogo**, em **Administração › Catálogos › Cargos dos contatos**, ao lado das
  operadoras, das hospedagens e das categorias de aparelho (o lugar das listas fixas do sistema; quem
  cuida é a administração, `admin.manage`). Lá se inclui um cargo, se renomeia e se desativa. A escolha
  foi minha (a regra dele: escolher e dizer por quê): com a lista no catálogo, ele inclui um cargo novo sem
  depender de um patch.
- **Os de fábrica** (a migração põe no banco): Administrativo, Atendimento, Comercial, Compras, Diretoria,
  Financeiro, Gerência, Pós-vendas, Proprietário ou sócio, Recepção, RH e TI (`CARGOS_DE_FABRICA`, no
  `@gestor/shared`).
- **O contato guarda o nome do cargo** (o `role` de `client_contacts`, como antes). Por isso:
  - **renomear** um cargo no catálogo muda o dos contatos que o têm (e a auditoria diz quantos: *"Cargos dos
    contatos: renomeou "Gerente" para "Gerência" (3 contatos passaram para o nome novo)"*);
  - **desativar** tira o cargo da lista; quem já tem fica com ele;
  - **o cargo de antes**, escrito à mão e fora da lista, continua no contato e aparece na janela como
    *"Engenharia (fora da lista)"*, até alguém trocar. A migração só acerta o que é um da lista escrito de
    outro jeito ("financeiro", "TI ", " gerência" viram "Financeiro", "TI", "Gerência").
- **O servidor só aceita cargo da lista** (`cargoDaLista`, no `@gestor/shared`, a mesma regra na prévia):
  fora dela, *"O cargo "Obras" não está na lista (Administração › Catálogos › Cargos dos contatos)."*;
  escrito de outro jeito ("pós-vendas"), entra como está na lista ("Pós-vendas"); o cargo que o contato já
  tinha pode ficar. A janela pega a lista em `GET /api/clients/cargos` (quem vê ou mexe nos contatos).
- **A auditoria dos catálogos** passou a dizer o nome do catálogo (*"Adicionou "Engenharia" ao catálogo
  Cargos dos contatos"*, no lugar de *"ao catálogo carriers"*), e o que mudou: renomeou, desativou ou
  reativou.
- **O banco.** A migração `0022_cargos_dos_contatos`: a tabela `contact_roles` (o nome, que não se repete,
  e o ativo), os 12 de fábrica e o acerto dos cargos escritos de outro jeito.
- **A prévia.** Os contatos de exemplo ganharam cargos da lista ("Gerente da Loja Simões Filho" virou
  Gerência); o **Paulo**, da Construtora Horizonte, ficou com **Engenharia**, fora da lista, para mostrar o
  cargo de antes.

**Alternativas consideradas.**

- **A lista fixa no código**, sem catálogo: mais simples, mas cada cargo novo esperaria um patch.
- **A lista com um "Outro" para escrever**: o texto livre voltaria pela porta do "Outro", e o pedido era
  justamente escolher. Faltando um cargo, a administração inclui no catálogo.
- **O contato ligado ao cargo pelo id** (como a operadora no circuito): pediria levar todos os cargos
  escritos à mão para o catálogo, com as grafias de cada um. Guardando o nome, o de antes fica como está, e
  o renomear do catálogo leva o nome novo para os contatos.
