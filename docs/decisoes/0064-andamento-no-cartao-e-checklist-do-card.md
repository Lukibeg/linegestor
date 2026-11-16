# 0064 — O andamento de todas as partes no cartão da implantação, as partes em abas e o checklist do card

**Data:** 13/11/2026 · **Patch:** 2.4.8 · **Situação:** aceita · **Revê:** a 0057 (a implantação: o cartão mostrava só a barrinha
da parte da etapa; as partes da ficha eram cartões que abriam e fechavam; as listas de tarefas eram só as caixinhas, as mesmas em
todos os cards do painel)

## Os pedidos

O Luan, 13/11, com o print do quadro do Ingline - Implantação:

- *"Eu quero que a barrinha de progresso fique em todas as fases… nesse painel específico de implantação, ele tenha a barrinha
  de acompanhamento das três fases do cliente… e se tiver ok, ele pode até reduzir ou algo do tipo, ficar só com um Vzinho.
  Porque acontece que às vezes o cliente já tem configuração e já está andando na configuração, porém já tem alguns processos de
  curadoria que ainda está em andamento, ou já está implantado, porém tem alguns processos de configuração que ainda está em
  andamento."*
- *"Quero um campo também de check list personalizado, por exemplo uma implantação varia muito o que tem que fazer no dia porque
  depende do cenário do cliente na hora, por exemplo uma lista de ramais que tenho que configurar no telefone e outra no soft
  phone, isso varia, então não pode ser um check list fixo."*
- Em 16/11: *"Para esse uso vai ser em uma aba, vai ficar curadoria, configuração, testes, implantação, e quero que os campos de
  outras etapas que eu selecionar em algum lugar gere esse checklist na implantação."* E, depois: *"Eu quero que crie sozinho,
  quero que tenha um checkbox ou algo do tipo ao lado de um campo de configuração que quando eu clicar automaticamente ele já
  abra um campo na parte de implantação."*

## 1. O andamento de todas as partes no cartão

- **No painel da implantação**, o cartão do quadro (e o do Meu dia) mostra uma barrinha por parte — a Curadoria, a
  Configuração, os Testes —, em qualquer etapa, na ordem da ficha:
  - **azul**, a parte da etapa em que o card está;
  - **laranja**, a que ficou para trás: a etapa dela vem antes da etapa do card e ainda falta coisa (a curadoria pela metade
    com o card na Configuração; a configuração faltando com o card no Implantado);
  - **cinza**, a que ainda vem;
  - a que acabou vira só o **✓ com o nome**, numa linha em cima.
- **O painel da implantação** é o de Gestão que a etapa de um painel de Vendas abre (Ao chegar aqui, abre a implantação) ou o
  que tem a etapa que liga no cadastro (`ehPainelDaImplantacao`) — os mesmos critérios do Suporte › Painel da Implantação.
  Sem ajuste novo: o Luan pediu para "esse painel específico", e os outros painéis com grupos de campos (os Detalhes da
  proposta, um grupo da lateral) não ganham barrinhas que ninguém pediu.
- A etapa de cada parte é a do mesmo nome (como desde o 2.3). A parte sem etapa com o nome dela (os Testes no painel do Luan,
  que não tem a etapa Testes) fica logo depois da etapa da parte de antes: com o card no Implantado, os testes que faltam
  ficaram para trás; na Configuração, ainda vêm (`partesNoCartao`).
- **Fora da implantação, nada muda**: a barrinha da parte da etapa, como desde o 2.3.
- O servidor não muda: o cartão já trazia a conta de todas as partes (`partes`); a escolha do que mostrar é da tela.
- **A etapa casa com a parte também pela raiz** (`etapaEhDaParte`, 16/11): o mesmo nome, como desde o 2.3, ou a primeira palavra
  com a mesma raiz de 5 letras ou mais (e quase toda a palavra mais curta). As duas etapas "Implantado - …" do painel do Luan
  são da parte **Implantação**; "Novos" não casa com "Novidades". Vale para o cartão (a barrinha azul) e para a aba que a ficha
  abre.

## 2. As partes em abas na ficha (16/11)

- As partes do meio da ficha (os grupos do meio) viram **abas num cartão só**: Curadoria · Configuração · Testes · Implantação.
  Cada aba mostra a conta (4/11) ou o ✓ quando acabou, a marca **etapa** na parte da etapa do card e a bolinha vermelha quando
  a próxima etapa pede algo dela. Dentro, a barrinha da parte e os blocos por produto, como antes.
- Abre na aba da etapa; sem uma, na primeira que a próxima etapa pede, ou na primeira que falta. Mover o card abre a aba da
  etapa nova. As setas do teclado andam entre as abas.
- O "falta: …" da ficha leva ao campo mesmo noutra aba: `irParaOCampo` pede a aba do campo (o evento `gestor:mostrar-campo`)
  e rola até ele.
- **Com uma parte só**, o cartão de antes (que abre e fecha). Vale para qualquer painel com dois grupos do meio ou mais, não
  só o da implantação: é o mesmo jeito de mostrar as partes.
- A aba **Implantação** é um grupo do meio como os outros: o modelo Implantação não o traz (vem com os três de sempre); cada
  equipe cria o grupo em Configurar › Campos › Novo grupo. A prévia tem.

## 3. O checklist do card

- **Um tipo de campo novo, o Checklist do card.** O campo é criado uma vez (Configurar › Campos), como qualquer outro — com o
  grupo (a parte) e o produto —, e **cada card monta a sua lista na ficha**. As caixinhas continuam sendo as mesmas em todos os
  cards do painel (o "Editar as caixinhas" vale para todos).
- **Na ficha:** incluir um item, ou colar a lista (cada linha vira um item, sem a marca de lista do começo — "- ", "• ",
  "[ ] ", "1. " — e sem as linhas em branco; o botão diz "Incluir 3"); marcar (com quem e quando); o lápis corrige o texto; o ×
  tira. O item que já está na lista (sem ligar para maiúscula e acento) não entra de novo. Até 200 itens por campo, 200 letras
  por item. Também com o card fechado (o Implantado do modelo fecha o card, e a configuração pode ter ficado para trás).
- **A conta:** cada item conta na parte (feito quando marcado); **sem nenhum item, conta um, que falta** — alguém ainda precisa
  montar a lista (é o mesmo que o texto vazio). A bolinha vermelha da ficha e a barrinha do cartão acompanham.
- **Pedido numa etapa**, só está feito com itens, todos marcados. **Não pode ser pedido na abertura**: a lista é montada depois
  de o card existir (o schema do campo recusa; a janela nem mostra a opção).
- **O histórico** diz o campo: "incluiu em Ramais no telefone (LinePBX): 201, 202", "marcou em …", "corrigiu em …: "202" para
  "202 Governança"", "tirou de …". A auditoria tem a linha de cada ação.
- **Onde mora:** a coluna nova `tickets.field_lists` (a migração **0036**, que só acrescenta): `{campo: [{id, texto, feito,
  porId, em, doAssunto, origem}]}`, no mesmo formato do checklist do chamado (a `origem`, o campo de onde o item veio). O valor do campo em `custom_fields` fica vazio — o
  "alterar" recusa ("inclua os itens pela ficha") —, e o robô, o n8n e o CSV não preenchem nem leem os itens.
- **Por que não o checklist do chamado** (a coluna `checklist`, que já existia): ele é um só por chamado, fica fora das partes,
  conta para o obrigatório "O checklist inteiro marcado" e recebe os passos do assunto. Misturar os itens dos campos nele
  faria cada uma dessas regras ter de separar o que é de quem.
- **Os itens que vêm de outros campos** (16/11). Na janela do campo, **Os itens vêm de**: os campos deste painel que geram
  itens (`TIPOS_QUE_GERAM_ITENS`) — cada linha de um **texto longo** (a Lista de ramais da Curadoria), cada opção escolhida
  numa **lista de várias**; o **texto curto** e a **lista de uma opção** viram um item com o nome do campo ("IP do cliente:
  189.45.12.90"). Os módulos, a data, o número e as caixinhas não geram (os módulos já têm a Ativação dos módulos).
  - **A lista é calculada a cada leitura** (`itensDoChecklist`, `listasEfetivas`), e não copiada quando o campo muda: assim a
    Curadoria, o robô, o n8n, a importação e a troca das origens na janela valem na hora, sem um "sincronizar" em cada
    caminho que grava um campo. Em cima, os que vêm (na ordem das origens e das linhas, sem repetir), debaixo do nome do campo
    de onde vêm; depois, os incluídos à mão ("Incluídos aqui").
  - **A marca fica com o texto**: o item que veio se acha pelo texto (sem ligar para maiúscula e acento), com um id que é o
    resumo do texto (`g-…`). O que sai da origem some, com a marca; o incluído à mão com o mesmo texto de um que veio passa a
    ser dele. Sem origens, os que tinham vindo saem e ficam os incluídos à mão.
  - **Só se marcam aqui**: o lápis e o × não aparecem, e o servidor recusa ("Esse item vem de Lista de ramais (LinePBX)
    (Curadoria): para tirar, mude lá.").
  - Coluna `ticket_fields.source_field_ids` (jsonb), na mesma migração **0036**; a origem que é excluída deixa de contar, e o
    Restaurar tira as que já não existem. A auditoria do campo registra as `origens`.
- **A caixinha "Checklist na Implantação" ao lado do campo** (16/11, à tarde). Em Configurar › Campos, ao lado de cada texto ou
  lista fora da Implantação (`podeLigarNaImplantacao`), no painel da implantação ou no de Gestão que já tem o grupo
  Implantação (`painelComImplantacao`); e a mesma caixinha na janela do campo (o campo novo já nasce ligado):
  - **marcar** cria, no grupo **Implantação** (que entra nos grupos do painel, no meio da ficha, se ainda não está), o
    Checklist do card **"<campo> (implantação)"** (com um número se o nome está em uso; até 40 letras), do mesmo produto, com
    as origens só nele e a explicação "Os itens vêm de …". O que já tinha sido ligado e foi para os Excluídos **volta pelo
    Restaurar**, com as marcas dos cards. Ligado de novo, nada muda;
  - **desmarcar** manda esse checklist para os Excluídos; se ele também tira de outros campos, só deixa de tirar deste;
  - a caixinha aparece marcada quando o grupo Implantação tem um checklist que tira deste campo
    (`checklistLigadoNaImplantacao`) — também o montado à mão pelo "Os itens vêm de" (na prévia, a Lista de ramais aparece
    ligada aos Ramais no telefone). Não há coluna nova: o estado sai das origens.
  - A rota: `POST /atendimento/campos/:id/checklist-na-implantacao` (`{ ligar }`), de quem configura o painel; a auditoria
    diz "Ligou o checklist na Implantação de Lista de ramais (LinePBX): criou o campo …".
- A rota: `POST /atendimento/chamados/:id/campos/:campoId/lista` (`incluir` com `textos`, `marcar`, `editar`, `tirar`), de quem
  trabalha nos chamados. As regras (`listaDepois`, `linhasDaLista`, `contaDoCampo`) moram no `@gestor/shared`: o servidor e a
  prévia chamam as mesmas.

## Ficou de fora

- Um ajuste para ligar o andamento de todas as partes em outros painéis (hoje, só o da implantação).
- O modelo Implantação não traz a aba Implantação nem checklists do card: cada equipe cria os seus. A prévia tem a aba, com dois
  (Ramais no telefone, que vem da Lista de ramais da Curadoria, e Ramais no softphone, do LinePBX).
- Gerar itens dos módulos, das caixinhas, das datas e dos números.
- Mudar a ordem dos itens e "marcar todos".
