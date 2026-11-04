# 0058 — Os grupos de campos, o excluir de verdade, o tipo Documento e as condições da negociação

**Data:** 31/10/2026 · **Patch:** 2.4 · **Situação:** aceita

## O pedido

O documento do Luan de 31/10 ("melhorias 3110"), com doze prints:

- *"Eu quero poder excluir os campos e n só desativar"* (a lista dos campos do Ingline - Comercial).
- *"Esse painel CEM já foi excluído n era pra aparecer aqui"* (a escolha do painel em Ajustes › Campos).
- *"Vc ta misturando os campos principais que ficam na horizontal das abas laterais. Tem q ter um conjunto para eu alterar as
  abas laterais desativar ou ativar, incluir novos grupo de campos, ou excluir/desativar"*.
- *"Aqui eu quero excluir de fato e n desativar, os que eu já tiver desativado quero que sejam excluídos"* (o Editar as
  caixinhas da Configuração do ambiente).
- *"Esse ativação dos módulos vc pode tirar n precisa"*.
- *"Quero poder deixar todos os testes desativados"* (o Editar as caixinhas dos Testes realizados, que recusava: "As
  caixinhas precisam de pelo menos uma opção").
- *"Aqui na parte de curadoria eu quero que vc deixe todos os produtos mesmo que n tenham alguma curadoria configurada, no caso
  era pra ter um campo da voicenet mesmo que vazio"*.
- *"Faça de uma forma que os linepbx linechat e voicenet n fiquem misturados e tbm o que é curadoria, configuração, teste"*.
- *"Aqui tem q ter o tipo, documento"* (o campo Estrutura da URA, com o tipo travado em Texto longo).
- *"Preciso que haja uma área destinada a negociação, por exemplo esse cliente aqui eu concedi um desconto de 200 reais até
  março do ano que vem, além disso a ativação só vai ser paga a partir de março tbm e dividida em 6 vezes"*.

## O que foi decidido

1. **Os grupos de campos.** A "parte da ficha" do 2.3 virou um **grupo** que se administra em Ajustes › Campos, num cartão
   próprio: criar (vazio), renomear (os campos vão junto), mudar a ordem, escolher **onde fica** — **no meio da ficha** (um
   cartão largo com um bloco por produto, como a Curadoria e os Detalhes da proposta) ou **na lateral** (um cartão abaixo da
   Classificação) —, **ativar e desativar** (todos os campos do grupo de uma vez; desativados, deixam de ser pedidos) e
   **excluir** (com os campos dele). Os grupos ficam nos ajustes do painel (`settings.partes`, uma lista com o nome e o lugar,
   na ordem); o campo continua dizendo o grupo pelo nome (`ticket_fields.section`). O grupo que só existe nos campos (o de antes
   do 2.4) entra no fim, no meio. Salvar o painel (a janela do painel) não mexe nos grupos.
2. **A lista dos campos em seções**: primeiro os da Classificação (sem grupo); depois cada grupo, com um **bloco por produto**
   (Todos os produtos, LinePBX, LineChat, VoiceNet…). As setas trocam o campo com o vizinho do mesmo bloco. Cada grupo e cada
   bloco tem o seu "+ campo", que já nasce no grupo e no produto. Na janela do campo, o grupo é escolhido numa lista.
3. **Excluir o campo** (`ticket_fields.deleted_at`, a migração `0031`): sai dos Ajustes, da ficha, do Abrir chamado e das
   regras (para abrir e de cada etapa), e o nome fica livre. **O que os chamados preencheram fica guardado** e volta com o
   **Restaurar** (a parte **Excluídos (N)**, no fim da aba): nada se apaga de verdade, como sempre (a regra que não se negocia).
   O campo que outro segue (a escolha dos módulos de um checklist) só sai junto com quem o segue. Desativar continua existindo.
4. **A caixinha excluída é excluída de verdade** (revê a 0057, em que "a caixinha que o card já marcou continua marcada nele,
   desativada"): ao salvar o Editar as caixinhas (no card ou nos Ajustes), a que saiu some da lista e de todos os cards, mesmo
   dos que a marcaram, e sai da conta da parte. Não há mais caixinha desativada; as desativadas de antes foram excluídas na
   migração `0031`. A auditoria guarda a lista de antes (o "excluiu …" no resumo). **O campo de caixinhas pode ficar sem
   nenhuma** (não conta na parte).
5. **A Ativação dos módulos saiu** do modelo Implantação (revê a 0057): os módulos escolhidos na Curadoria (o Módulos a ativar)
   ligam no Implantado do mesmo jeito, sem o checklist da Configuração. Nos painéis que já existem, a migração `0031` exclui os
   checklists dos módulos (o que foi marcado fica guardado) e tira deles as regras. O jeito de fazer um checklist continua nos
   Ajustes (o "Os módulos que aparecem"), para quem quiser.
6. **Todos os produtos do card nas partes** (revê a 0057): a parte que tem campo de produto mostra um bloco para **cada produto
   do card**, mesmo o que não tem campo nela — "Nenhum campo de Curadoria para o VoiceNet ainda" —, para os produtos não se
   misturarem e ficar à vista o que falta configurar.
7. **O tipo Documento**: o campo cujo valor é o **arquivo anexado** (o Anexar do campo; PDF, imagem, Word e Excel de até 10 MB).
   Conta como feito na parte com o primeiro arquivo (o valor guardado é quantos arquivos há, recontado a cada anexar e tirar);
   não se escreve à mão (nem pela API). **O texto curto, o texto longo e o documento trocam entre si** depois de criados (o
   texto escrito fica guardado); os outros tipos continuam travados.
8. **As condições da negociação** (`tickets.negotiation_terms`, a `0031`): na ficha da negociação, o cartão **Condições
   combinadas**, abaixo de A negociação: os **descontos na mensalidade** (o valor por mês, de um mês — opcional — até o último
   mês), a **ativação combinada** (o mês da 1ª parcela e em quantas vezes, até 24) e a **observação**; e **Como fica a
   cobrança**, mês a mês, até a mensalidade voltar cheia. As condições **não mudam o valor** — a mensalidade e a ativação
   continuam as que contam no quadro, na meta, no Ganho e no relatório. Mudar vai para o histórico numa linha e para a
   auditoria. As contas (o texto e a cobrança mês a mês) moram em `@gestor/shared/negociacao.ts`, as mesmas no servidor, na
   prévia e na tela.
9. **O painel desativado fora da escolha** dos Ajustes (Campos e Etiquetas), como na tela Painéis desde o 2.1.2.
10. **Pequenos**: o Onde do Abrir chamado numa faixa fina (o painel e a descrição numa linha); o **detalhe azul** no alto de
    todos os cartões da ficha, como o da Empresa; e a simulação nova com **12 meses** de contrato (os Ajustes do Simulador que
    estavam com os 24 de fábrica passam a 12 na `0031`).

## Por quê

- O grupo explícito (e não só o nome escrito no campo) é o que deixa criar um grupo vazio, mudar a ordem dos cartões e
  escolher o lugar, sem renomear campo a campo.
- Excluir sem apagar segue a regra de sempre (lixeira e auditoria) e dá ao Luan o que ele pediu: some da tela e o nome fica livre.
- A caixinha não tem valor próprio (é uma marca), por isso a exclusão nela é de verdade, como ele pediu; a lista de antes fica
  na auditoria.

## Fica para depois

- As condições no relatório do Comercial (as ativações mês a mês pelas parcelas combinadas, e não pelo dia do Ganho).
- O lugar do grupo dentro da lateral (hoje, sempre abaixo da Classificação).

## Revisto no 2.4.1 (03/11/2026): a Ativação dos módulos volta

Com o 2.4 no ar, o Luan mandou o print da Configuração com a Ativação dos módulos: *"gostaria de retroceder uma questão"* e, à
pergunta (que ela suma ou que volte), *"Que ela volte"*. Desfaz o item 5:

- **O modelo Implantação** volta a criar a **Ativação dos módulos** na Configuração, de cada produto (o LinePBX e o LineChat),
  seguindo o Módulos a ativar da Curadoria: os 19 campos do 2.3.
- **Nos painéis que existem**, a migração `0032` traz de volta os checklists que a `0031` excluiu, com o que os cards já tinham
  marcado (nada tinha sido apagado). Só volta o que ainda faz sentido: a escolha que ele segue continua no painel, o grupo
  dele ainda tem campo, nenhum outro campo ativo do painel tem o mesmo nome no mesmo produto, e ninguém o excluiu pela tela (a
  auditoria diria).
- **As regras de etapa** que a `0031` tirou (o checklist pedido para entrar numa etapa ou para abrir) **não voltam sozinhas**:
  a `0031` não guardou quais eram, e o modelo não pedia nenhuma. Quem tinha ligado uma liga de novo em Painéis › Ajustes ›
  Campos (Editar o campo).
- **No Implantado**, a janela volta a avisar o módulo escolhido na Curadoria que o checklist ainda não marcou (sem travar),
  como no 2.3.

O resto do 2.4 continua: o Excluir o campo, a caixinha excluída de verdade, os grupos de campos, todos os produtos nas partes,
o tipo Documento e as condições da negociação.

## Revisto no 2.4.1 (03/11/2026): as Condições especiais

Antes de o 2.4.1 subir, o Luan mandou o print da janela das condições: *"essa parte aqui n ficou legal n, o formato n ta legal
e tem outras coisa, n precisa ter o de, pq subentendesse que vai ser a partir do primeiro mes de faturameno que é quando eu
marco cmo ganho, se eu quiser fornecer um desconto sem prazo, temq ter essa opção tbm, a ativação tbm n ficou legal o formato,
se dar um desconto na aticvação? e o nome tem q ser condições especiais"*. Muda o item 8:

- **O nome** passa a ser **Condições especiais** (o cartão, a janela e a linha do histórico).
- **O 1º mês de faturamento é o mês do Ganho** (o dia que ficou no Ganho, em Brasília). Antes do Ganho, as contas usam o mês
  de hoje, de exemplo, e a janela diz isso.
- **Sem o "De"**: os descontos na mensalidade vêm **em sequência** — o primeiro começa no 1º mês de faturamento e cada um
  seguinte começa quando o anterior acaba ("R$ 200 até março, depois R$ 100 sem prazo"). Cada um tem o valor por mês e **até
  que mês** vai, ou **Sem prazo** (só o último). Até 5.
- **A ativação**: o **desconto** nela (em reais, até o valor dela), o que **fica para pagar**, **em quantas vezes** (de 1 a 24,
  com o valor da parcela na escolha) e **quando começa a pagar** (no 1º mês ou num mês escolhido). Sem nada diferente disso
  (sem desconto, à vista, no 1º mês), não há ativação combinada.
- **Como fica a cobrança**: uma coluna para cada coisa (Mês, Mensalidade, Desconto, Ativação com a parcela, Total do mês), do
  1º mês até a mensalidade voltar cheia (com o sem prazo, o mês em que ele começa e mais dois). Sem a ativação combinada, a
  ativação vai inteira no 1º mês (antes, ela ficava fora da tabela).
- **O que foi guardado no 2.4 continua valendo**, sem migração: o "de" fica de fora (o desconto começa no 1º mês), os descontos
  vão na ordem do mês em que acabam e a ativação de antes é a mesma, sem desconto.

