# 0064 — O andamento de todas as partes no cartão da implantação e o checklist do card

**Data:** 13/11/2026 · **Patch:** 2.4.8 · **Situação:** aceita · **Revê:** a 0057 (a implantação: o cartão mostrava só a barrinha
da parte da etapa; as listas de tarefas eram só as caixinhas, as mesmas em todos os cards do painel)

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

## 2. O checklist do card

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
  porId, em, doAssunto}]}`, no mesmo formato do checklist do chamado. O valor do campo em `custom_fields` fica vazio — o
  "alterar" recusa ("inclua os itens pela ficha") —, e o robô, o n8n e o CSV não preenchem nem leem os itens.
- **Por que não o checklist do chamado** (a coluna `checklist`, que já existia): ele é um só por chamado, fica fora das partes,
  conta para o obrigatório "O checklist inteiro marcado" e recebe os passos do assunto. Misturar os itens dos campos nele
  faria cada uma dessas regras ter de separar o que é de quem.
- A rota: `POST /atendimento/chamados/:id/campos/:campoId/lista` (`incluir` com `textos`, `marcar`, `editar`, `tirar`), de quem
  trabalha nos chamados. As regras (`listaDepois`, `linhasDaLista`, `contaDoCampo`) moram no `@gestor/shared`: o servidor e a
  prévia chamam as mesmas.

## Ficou de fora

- Um ajuste para ligar o andamento de todas as partes em outros painéis (hoje, só o da implantação).
- O modelo Implantação não traz checklists do card: cada equipe cria os seus. A prévia tem dois (Ramais no telefone e Ramais
  no softphone, na Configuração do LinePBX), para mostrar.
- Puxar os itens de outro campo (a Lista de ramais da Curadoria) sozinho: hoje se cola.
- Mudar a ordem dos itens e "marcar todos".
