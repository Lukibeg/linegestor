# Vendas: o painel do Comercial (Patch 2.0.1)

O Comercial acompanha as negociações num painel igual ao dos chamados — o quadro, a lista, a ficha, as
anotações, os avisos —, com o que é de venda: o **valor** — a **mensalidade** e a **ativação**, cada uma
de um valor só ou por produto, com o total —, o **Ganho** e o **Perdido** (com o motivo), a **empresa que
ainda não é cliente** e a **meta do mês**. No menu, o grupo **Comercial** leva direto ao **Painel do
Comercial** (até o 2.0.1, Negociações), aos **Relatórios** e ao **Simulador** (2.0.2: a conta de uma venda
antes de fechar, no guia `simulador.md`); o painel também fica em **Painéis**, como
os outros (o Suporte, o Desenvolvimento). O Comercial tem permissão própria: **Ver o Comercial**. A decisão inteira está em
`docs/decisoes/0050-painel-de-vendas.md`.

---

## 1. Criar o painel do Comercial (uma vez, quem cuida dos chamados)

Antes, a permissão: em **Administração › Usuários**, dê o papel **Comercial** a quem é do Comercial (ele
vem com ver os clientes, ver os chamados, trabalhar e **Ver o Comercial**). Quem precisa de outro papel
ganha a permissão **Ver o Comercial** nele, em **Administração › Papéis**. **Sem ela, a pessoa não vê o
Comercial em lugar nenhum** — nem o grupo do menu, nem o painel, nem os relatórios —, mesmo que o painel
seja de todos. O Administrador já vem com ela. Quem deve ver só o Comercial (e não os chamados do
Suporte) fica com um papel sem o **Ver os chamados**.

1. **Painéis › Ajustes › Painéis › Novo painel** (ou o **Novo painel** da tela dos painéis).
2. Em **O painel é de**, escolha **Negociações (Vendas)**. Isso não muda depois.
3. Dê o nome (Comercial) e a sigla (COM): as negociações ficam COM-1, COM-2…
4. Em **Quem vê**, **Só as pessoas escolhidas**, e marque a equipe do Comercial.
5. Em **As etapas**, o painel vem com Lead, Qualificação, Proposta enviada, Negociação, Ganho e
   Perdido. Mude os nomes e inclua etapas como quiser; o Ganho e o Perdido mudam de nome, mas não saem.
6. Em **As regras**, confira os **motivos de perda** (a lista que aparece ao marcar como perdida) e
   ponha a **meta do mês**, em R$ de mensalidades (vazia: sem meta).
7. O painel já vem com os campos do Comercial: **CNPJ**, **Contatos principais**, **Origem de lead** e
   **Indicação** (uma lista que cresce na própria negociação: escreva quem indicou e clique em **Incluir**).
   Para mudar o nome, as opções das listas ou a ordem, ou para incluir outro campo: **Ajustes › Campos**, no
   painel do Comercial.

## 2. O dia a dia

- **No menu, o grupo Comercial**: **Painel do Comercial** abre direto o quadro do Comercial, **Relatórios**, o
  relatório, e **Simulador**, as simulações (a margem de cada venda; a negociação ligada a uma mostra o sinal). Com mais de um painel de Vendas, abre o último que você usou (o **Trocar**, no alto do
  quadro, leva aos outros).
- **A tela dos painéis** mostra o cartão do Comercial: quanto está **em negociação** (e quantas), o
  **ganho no mês** (e quantas ganhas e perdidas), **sem dono**, as **suas** e a **barra da meta**.
- **O quadro**: cada coluna soma as mensalidades das negociações dela. Arraste o cartão para mudar de etapa.
- **A ordem de cada coluna é sua (2.1)**: arraste a negociação para cima ou para baixo na coluna, como
  arrasta para outra etapa — uma linha azul mostra onde ela vai cair, e a ordem fica guardada para todo mundo.
  Arrastando para outra etapa, ela cai onde a linha mostra. No celular (que não arrasta), o **Mover** do cartão
  tem **Subir** e **Descer**. A negociação que chega numa etapa sem lugar escolhido (pelo Mover, pela ficha, pelo
  n8n) aparece no alto da coluna; sem ninguém arrumar, a de maior mensalidade vem primeiro. No Ganho e no
  Perdido, a mais recente vem primeiro (lá a ordem não muda). Mudar a ordem não conta como atividade na
  negociação nem entra no histórico dela; fica na auditoria.
- **A lista**: a mensalidade no lugar da prioridade e do prazo; **Em aberto**, **Ganhas e perdidas** ou
  **Todas**; **Exportar (CSV)** leva a mensalidade, a ativação, o resultado e o motivo da perda.
- **Meu dia**, **observar**, **citar** um colega (@) e os **avisos** funcionam como nos chamados.

## 3. Uma negociação nova

**Nova negociação** (no alto da tela do painel):

- **A empresa**: **Ainda não é cliente** (já vem marcado: escreva o nome) ou **Já é cliente** (escolha no
  cadastro). Quando ela entrar no cadastro de clientes, o **Virou cliente?** da ficha liga a negociação a ela.
- O **contato** e o WhatsApp.
- **O que está sendo negociado** (opcional: uma frase, como "PABX em nuvem com 40 ramais"). Em branco, a
  negociação fica com o nome da empresa — e acompanha a empresa se ela mudar. No quadro, o cartão mostra a
  empresa em destaque e, embaixo, esta frase.
- O **valor** (pode vir depois: a **Proposta enviada** pede a mensalidade) — **Um valor só** ou **Por
  produto** (veja abaixo), com a **mensalidade** e a **ativação**.
- **Sobre a negociação**: o que o cliente precisa, quem decide, a concorrência.
- **Do painel Comercial**: o CNPJ, os contatos principais, a origem de lead e quem indicou — a **Indicação**
  é uma lista: quem não está nela entra pelo **Incluir** (na ficha, ficam em Detalhes; os contatos, junto do
  Sobre a negociação).
- Os produtos e quem cuida.

A negociação nasce no **Lead**.

### A mensalidade e a ativação

- A **mensalidade** (o que o cliente paga por mês) é **a que conta**: o quadro, o cartão do painel (Em
  negociação, Ganho no mês e a meta), o relatório e o Ganho usam ela. Na tela, vem com o **/mês**.
- A **ativação** (paga uma vez, no começo) fica **à parte**: aparece na ficha, no Ganho, no histórico e no
  Exportar, e tem as contas dela no relatório (o número **Ativação** e **As ativações mês a mês**). Ela não
  entra no quadro, na meta, no Ganho nem no ticket médio.
- Não há venda só de ativação: a **Proposta enviada**, a **Negociação** e o **Ganho** pedem a
  **mensalidade** (a ativação sozinha não basta). No começo da negociação, as duas podem ficar em branco.

### O valor por produto

No **Valor** (na nova negociação e na ficha), escolha **Por produto**:

- cada produto da negociação aparece com a sua **mensalidade** e a sua **ativação**; **Incluir produto**
  põe outro, e o **×** tira (o produto sai da negociação com os valores dele);
- embaixo ficam os dois **Totais**, que são a mensalidade e a ativação da negociação (o quadro, o
  relatório, a meta e o Ganho usam o total das mensalidades);
- o produto sem valor escrito fica de fora da soma;
- para voltar a um valor só, **Um valor só**: os totais ficam como a mensalidade e a ativação.

Com o valor por produto, a mensalidade e a ativação da negociação mudam pelos produtos (não dá para
escrever outro total). No **Exportar**, a coluna Produtos leva os valores de cada um.

## 4. A proposta (o PDF)

Na ficha, na caixa de anotar: clique na caixa e **cole o arquivo com Ctrl+V** (copiado da pasta, no
Chrome e no Edge), ou arraste o arquivo, ou use o **Anexar**. Até 5 arquivos de 10 MB por anotação.
Depois, clique no PDF na anotação: **ele abre na tela, página por página, sem baixar** (o **Baixar** fica
embaixo). A imagem também abre grande; Word e Excel continuam baixando.

Para fazer a conta da venda antes de mandar a proposta (os custos, a margem, quando se paga), use o
**Simulador** (Comercial › Simulador): na ficha, a parte **Simulações** tem o **Simular**, que abre uma
simulação já ligada à negociação, e a simulação tem o **Levar para a COM-x**, que traz a mensalidade, a
ativação e os produtos para a negociação. Veja o guia do [Simulador](simulador.md).

## 5. Ganhou ou perdeu

Na ficha, **Ganhou** ou **Perdeu** (ou arraste o cartão para a coluna Ganho ou Perdido):

- **Ganho**: confira a **mensalidade fechada** e a **ativação** (se mudaram, as da negociação mudam
  junto e ficam no histórico) e o **dia em que fechou**. Com o valor por produto, a janela mostra cada
  produto e os totais: se o valor fechado mudou, mude os valores de cada produto na ficha antes de marcar.
- **Perdido**: escolha **o motivo** (o **Outro** pede para escrever) e o dia.

O dia é hoje ou um que já passou: quem lança uma venda antiga marca o dia em que ela acabou de verdade.
O motivo muda depois, na ficha (fica no histórico). **Reabrir** volta a negociação para a etapa em que
ela estava.

## 6. O relatório

No menu, **Comercial › Relatórios** (ou, no painel, ao lado de **Quadro** e **Lista**: **Relatório**, ou o
botão **Relatório** no cartão do painel).

- **O período**: Este mês, Mês passado, Este trimestre, Últimos 90 dias, Este ano, ou dois dias. Fica
  no endereço da página: dá para mandar o link do jeito que está.
- **O período em números** (em mensalidades; a ativação tem o número dela):
  - o **ganho**, a **ativação** (a soma das ativações das negociações ganhas no período, e quantas tinham
    ativação), as **novas** (quantas entraram e quanto somam em propostas), o **perdido**, a
    **conversão** (das que acabaram, quantas foram ganhas) e o **ticket médio** (a mensalidade média do
    ganho);
  - embaixo de cada número, a **seta**: quanto mudou em relação ao período anterior (no Este mês, o
    mesmo pedaço do mês passado). Verde é melhor.
- **Os ganhos mês a mês**: o ganho de cada mês, nos 12 meses até o do fim do período, e quanto mudou
  em relação ao mês anterior (verde subiu, laranja caiu). O mês de hoje, ainda pela metade (com \*),
  é comparado com o mesmo pedaço do mês anterior. No celular, aparecem os 6 últimos.
- **As ativações mês a mês**: o mesmo gráfico, só com a ativação das negociações ganhas em cada mês (as
  sem ativação não entram). Clicar num mês mostra as negociações com a ativação de cada uma.
- **A margem das ganhas** (2.0.2): das negociações ganhas no período, as que têm uma simulação ligada (o
  Simulador do Comercial): quanto sobra por mês e a **margem**, com o sinal (verde, amarelo, vermelho), no
  total e **por produto** (a que tem dois produtos conta nos dois). Cada negociação entra
  com o cenário principal da simulação dela; a margem do grupo é a sobra de todas sobre a mensalidade de
  todas. "2 de 3 com simulação" diz quantas das ganhas entraram. Veja o guia do
  [Simulador](simulador.md).
- **O funil**: das que entraram no período, quantas chegaram a cada etapa (e a porcentagem das que
  entraram), quantas se perderam em cada uma e quantas foram ganhas.
- **Clique em qualquer número** (o ganho, a ativação, as novas, o perdido, um mês, uma etapa do funil, as
  perdidas de uma etapa) para ver as negociações por trás dele; o código abre a negociação. Na janela da
  ativação, cada negociação aparece com a ativação dela; nas outras, com a mensalidade.

## 7. Do Comercial para o Suporte (e o contrário)

A negociação não vira chamado trocando de painel (nem o chamado vira negociação), não tem pai nem
filhos e não se liga a chamados. Cada um fica no seu painel:

- Ganhou e precisa implantar? Abra o chamado no painel do Suporte. Se quiser, escreva o código da
  negociação no chamado (*"venda da COM-24"*): ele vira um link.
- O cliente pediu um orçamento num chamado? Crie a negociação no Comercial e, se quiser, escreva o
  código do chamado no **Sobre a negociação**.

**Trocar de painel** (em Mais) só leva a negociação para outro painel de Vendas.

## 8. Trazer do Helena (2.0.3; a planilha, 2.1.1; o painel que não é de vendas, 2.1.2)

O painel de vendas do Helena (o **Ingline - Comercial**) vem para um painel de Vendas do Gestor: cada
negociação com o valor, a empresa, os campos e o ganho e a perda no dia da **Conclusão** de lá. Assim o
relatório do Comercial já mostra os meses de antes da virada. A chave de API do LineChat não lê a Conclusão
(nem o histórico das etapas): a Conclusão vem da **planilha que o Helena exporta** (o passo 4). É de quem importa e cuida dos painéis
(o Administrador). A decisão inteira está em `docs/decisoes/0054-trazer-do-helena.md`.

1. **Administração › Importar / Exportar**, no cartão **Trazer do Helena**. A leitura usa a chave de API do
   LineChat que já está em **Administração › Ajustes** (a mesma dos chamados): sem ela, o cartão diz o porquê.
2. Em **O painel no Helena**, o **Ingline - Comercial**. Em **Vai para o painel de Vendas**, o painel do
   Comercial que já existe ou **Um painel de Vendas novo** (ele se chama Comercial e fica com a sigla IC: o
   IC-34 do Helena continua IC-34).
3. **Ler o Helena**: a barra mostra quantos cards já vieram (um pedido por card).
4. **A planilha do Helena** (o quadro amarelo da prévia): no Helena, abra o painel em **Lista** e clique em
   **Exportar**; quando o aviso disser que a exportação terminou, abra a planilha (o Google Planilhas), copie o
   endereço dela, cole no quadro e clique em **Usar a planilha**. Se o Google não deixar baixar, na planilha,
   **Arquivo › Fazer download › .csv**, e **escolha o arquivo**. O quadro fica verde e diz de quantas
   negociações veio a Conclusão. Sem a planilha, cada ganho cai no mês da última mudança do card.
5. Confira a **prévia** — nada foi gravado ainda:
   - os números de agora (em andamento, ganhas, perdidas) e **os ganhos mês a mês**: compare com o gráfico
     *Meta vs Ganho mensal* do relatório do Helena;
   - as **etapas** (as do Helena, na ordem de lá, com o Ganho e o Perdido no fim; no painel que já existe, a
     etapa vazia que não está no Helena sai, e a que tem negociações fica);
   - os **campos** que o painel usa, os que serão criados e os que ficam de fora (e por quê);
   - as **pessoas** (quem do Gestor fica com cada nome do Helena), as **empresas** (o cliente do cadastro, ou
     a empresa que ainda não é cliente), os produtos, as etiquetas e os motivos de perda;
   - os avisos (o "(Cópia)" que sai do título, a mensalidade por produto que não soma o Valor atribuído…).
6. **Trazer N negociações** e confirme. No fim, **Abrir o painel** e **Ver o relatório**.

**Os campos que vêm do Helena (2.3)** — as licenças, os canais simultâneos, a faixa numérica… — ficam no cartão
**Detalhes da proposta**, no meio da ficha da negociação, com os números lado a lado. Os que já tinham vindo antes
da 2.3 vão para lá na atualização. Para tirar um campo do cartão, ou levar outro para ele: Painéis › Ajustes › Campos ›
o campo › **Parte da ficha** (vazia: volta para o Detalhes do lado).

**O que fica igual ao Helena:** a mensalidade é o **Valor atribuído** do card (o número que o relatório de lá
soma); o valor por produto entra quando os "Valor Mensalidade" de cada produto somam o Valor atribuído. A
ativação é a soma dos "Valor Ativação". O ganho e a perda contam no dia da Conclusão (da planilha), e a perda
leva o motivo de lá.

**O que fica no Helena:** as anotações e os anexos, a Área de atuação e os cards arquivados. E o **histórico
das etapas**: a chave de API não lê, e a negociação nasce na etapa em que o card está (o funil das vendas de
antes da virada mostra só onde cada uma estava).

**Dá para trazer de novo até a virada:** o que já veio é atualizado (fica como está no Helena, e o histórico
que veio de lá é refeito) e o que é novo entra. A cada vez, exporte a planilha de novo (a Conclusão das que
foram ganhas depois). O que a equipe fez no Gestor fica no histórico; a prévia avisa
quantas negociações foram mexidas aqui (elas voltam a ficar como no Helena). A negociação que foi para a
lixeira do Gestor fica lá.

**Um painel que não é de vendas (2.1.2)** — as suas atividades, os chamados internos: em **O painel no Helena**,
escolha o painel (ele aparece com "vira painel de Gestão"). Ele vai para um **painel de Gestão** (o de
chamados): **Um painel de Gestão novo**, com o nome e a sigla de lá (o LA-3 do Helena vira LA-3), ou um painel
de Gestão que já existe. Cada card vira um chamado, com o título, a descrição, o responsável e o cliente (quando o
título começa com o nome de um). As etapas são as de lá, na mesma ordem: a de entrada do Helena é a entrada, as
de fim resolvem ou fecham o chamado ("Concluído" resolve, "Validado" fecha; sem nenhuma de fim, entra a
"Fechado"). O painel novo não conta prazo nem fecha sozinho, e quem vê são só as pessoas dos cards e quem
traz; dá para mudar em **Painéis › Ajustes**. Não tem valor, ganhos nem a planilha: a prévia mostra quantos
chamados ficam abertos, resolvidos e fechados e o que cada etapa vira. No painel de Gestão que já existe,
nenhuma etapa dele sai: as do Helena que faltam entram antes das de fim.
