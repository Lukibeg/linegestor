# 0034 — DIDs editáveis em todo lugar, escolha com busca, ficha em janela e módulos na lixeira

**Contexto.** Ainda com o Patch 1.5 sem subir, o Luan mandou em 26/09 uma segunda versão do
"Ter a opção de cruzar dados.docx", com prints e o pedido de ver "antes de subirmos":

1. "ter a senha do usuário padrão" (o FOP2);
2. "não precisa ter a data de ativação dos equipamentos";
3. "ter a opção de busca aqui" — a lista de clientes da janela Atribuir a cliente;
4. "qualquer lugar que tenha DIDs (circuito, cliente, DIDs) tem que ser possível alterar o
   cliente, o uso, a observação";
5. "poder editar a data de desativação de algum módulo/produto";
6. "em um projeto, quando eu acesso um cliente, é mais interessante que abra a ficha como pop-up,
   porque senão sou direcionado e dificulta a volta para o projeto";
7. "essa página com rolagem desnecessária" — a barrinha na ponta das abas (Administração e
   Circuitos e DIDs);
8. "não consigo editar os módulos (nome e descrição), ou excluir";
9. "o que seria essa config própria?".

O item 1 revê a decisão 0032 (a senha do usuário padrão tinha saído, a pedido dele, em 24/09). Ele
foi avisado na conversa, com a interpretação escrita, e seguiu.

**Decisão.**

- **FOP2 com as duas senhas** (revê a 0032): a API volta a aceitar e devolver `defaultUserPassword`,
  no cofre com o rótulo "Senha do usuário padrão do FOP2"; formulário do módulo e aba Acessos
  mostram as duas. Como a 0032 **não apagou nada**, as senhas guardadas antes do 1.4 reaparecem.
- **Equipamentos sem "Ativado em"** (`PRODUTOS_SEM_DATA_DE_ATIVACAO` em `shared/catalogos.ts`): some
  do formulário, do cartão, da linha do tempo e da coluna de data da lista de clientes. A data que
  importa é a de cada aparelho, nas movimentações. O servidor não mudou: o campo ausente mantém o
  que houver.
- **Escolha com busca** (`EscolherComBusca`, no kit de `components/ui`): no lugar das listas
  suspensas de cliente — filtro e lápis da Numeração, Atribuir a cliente, faixa nova, titular do
  circuito, filtros do Inventário e das Movimentações, Movimentar. Busca sem acento e por pedaço do
  meio do nome; setas, Enter e Esc (o Esc fecha só o painel). Painel `fixed`, preso à tela, que
  nenhuma janela ou tabela corta. A lista curta de titulares do filtro de Circuitos ficou como está.
- **DID editável na própria linha, em todo lugar** (`pages/dids/partes.tsx`: `ClienteDoDid`,
  `UsoDid`, `ObservacaoDid`, `useEditarDid`): Numeração, ficha do circuito e ficha do cliente (ali,
  "trocar cliente", já que a coluna seria sempre o mesmo nome — **revisto pela 0035**, no 1.6: o
  "trocar cliente" saiu da ficha do cliente a pedido do Luan; lá ficam o uso e a observação). Usa o `PATCH /dids/:id` que já
  existia, com a regra de sempre: trocar o cliente derruba a marca de uso. Permissão `dids.assign`.
- **Data de desativação corrigível**: `deactivatedAt` no `PUT /clients/:id/subscriptions` (e
  `/modules`) grava o encerramento naquele dia sem reativar; não pode ser antes da ativação nem no
  futuro (12 h de folga). Na tela, o lápis ao lado de "encerrado em" / "desativado em".
- **Ficha do cliente em janela** (`FichaEmJanela`): a ficha inteira, com as abas, numa janela
  lateral larga por cima do projeto; a aba fica na memória da janela; "abrir a página" leva à ficha
  de verdade. Na janela ficam só as ações do dia a dia (Abrir e Editar). Junto veio a **pilha de
  janelas** no `Modal`: o Esc fecha só a de cima (antes fechava todas as abertas de uma vez).
- **Abas sem barra em navegador nenhum**: `sem-barra` (`scrollbar-width: none` e
  `::-webkit-scrollbar`) no `FAIXA_ABAS`. O 1.4 já tinha `overflow-y: hidden` — conferido no sistema
  no ar, a regra estava lá —, mas o Chrome do Windows (barras "Fluent", zoom de 110%) ainda
  desenhava a barrinha. A faixa continua rolando para o lado no celular.
- **Módulos editáveis e na lixeira**: o lápis edita nome e descrição (o código não muda — é por ele
  que o sistema e a importação acham o módulo); a lixeira usa `product_modules.deleted_at`
  (**migração 0008**). Módulo na lixeira some da Administração, da ficha, dos filtros e da
  importação; as ligações dos clientes ficam guardadas e voltam com ele (Lixeira › Restaurar).
  **FOP2 e Omniboard não vão** (`MODULOS_PROTEGIDOS`): o sistema guarda campos deles. Código de
  módulo na lixeira não se reaproveita sem querer (o servidor avisa). O produto ganhou o mesmo lápis
  (nome, descrição e cor), sem mudar o código.
- **"Config. própria" em palavras** (`CAMPOS_PROPRIOS`): a coluna virou "Campos na ficha do cliente"
  e diz quais (FOP2: ramal admin, senha do ramal admin e senha do usuário padrão; Omniboard: e-mail
  do administrador e as duas senhas; os outros, "só data e anotações"); no produto, "Na ficha do
  cliente: …". E a coluna **Clientes** diz quantos usam cada módulo.

**Consequências.**

- O 1.5 passa a ter uma migração (`0008`, uma coluna nova, sem mexer em dado).
- Testes novos em `apps/api/test/patch15.test.ts` (desativação, DID, módulos) e o do FOP2 em
  `rodada23.test.ts` virou "a senha do usuário padrão voltou".
