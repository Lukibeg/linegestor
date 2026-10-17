# Vendas: o painel do Comercial (Patch 2.0.1)

O Comercial acompanha as negociações num painel igual ao dos chamados — o quadro, a lista, a ficha, as
anotações, os avisos —, com o que é de venda: o **valor** (um só ou por produto, com o total), o
**Ganho** e o **Perdido** (com o motivo), a **empresa que ainda não é cliente** e a **meta do mês**. Fica em **Suporte › Chamados**, como os outros
painéis (o Suporte, o Desenvolvimento). A decisão inteira está em
`docs/decisoes/0050-painel-de-vendas.md`.

---

## 1. Criar o painel do Comercial (uma vez, quem cuida dos chamados)

1. **Suporte › Chamados › Ajustes › Painéis › Novo painel** (ou o **Novo painel** da tela dos painéis).
2. Em **O painel é de**, escolha **Negociações (Vendas)**. Isso não muda depois.
3. Dê o nome (Comercial) e a sigla (COM): as negociações ficam COM-1, COM-2…
4. Em **Quem vê**, **Só as pessoas escolhidas**, e marque a equipe do Comercial.
5. Em **As etapas**, o painel vem com Lead, Qualificação, Proposta enviada, Negociação, Ganho e
   Perdido. Mude os nomes e inclua etapas como quiser; o Ganho e o Perdido mudam de nome, mas não saem.
6. Em **As regras**, confira os **motivos de perda** (a lista que aparece ao marcar como perdida) e
   ponha a **meta do mês**, em R$ (vazia: sem meta).

## 2. O dia a dia

- **A tela dos painéis** mostra o cartão do Comercial: quanto está **em negociação** (e quantas), o
  **ganho no mês** (e quantas ganhas e perdidas), **sem dono**, as **suas** e a **barra da meta**.
- **O quadro**: cada coluna soma o valor das negociações dela, e a de maior valor vem primeiro. Arraste
  o cartão para mudar de etapa.
- **A lista**: o valor no lugar da prioridade e do prazo; **Em aberto**, **Ganhas e perdidas** ou
  **Todas**; **Exportar (CSV)** leva o valor, o resultado e o motivo da perda.
- **Meu dia**, **observar**, **citar** um colega (@) e os **avisos** funcionam como nos chamados.

## 3. Uma negociação nova

**Nova negociação** (no alto da tela do painel):

- **A empresa**: **Já é cliente** (escolha no cadastro) ou **Ainda não é cliente** (escreva o nome).
  Quando ela entrar no cadastro de clientes, o **Virou cliente?** da ficha liga a negociação a ela.
- O **contato** e o WhatsApp.
- **O que está sendo negociado** (uma frase: "PABX em nuvem com 40 ramais").
- O **valor** (pode vir depois: a **Proposta enviada** pede o valor) — **Um valor só** ou **Por
  produto** (veja abaixo).
- **Sobre a negociação**: o que o cliente precisa, quem decide, a concorrência.
- Os produtos e quem cuida.

A negociação nasce no **Lead**.

### O valor por produto

No **Valor** (na nova negociação e na ficha), escolha **Por produto**:

- cada produto da negociação aparece com o seu campo de valor; **Incluir produto** põe outro, e o **×**
  tira (o produto sai da negociação com o valor dele);
- embaixo fica o **Total**, que é o valor da negociação: o quadro, o relatório, a meta e o Ganho usam ele;
- o produto sem valor escrito fica de fora da soma;
- para voltar a um valor só, **Um valor só**: o total fica como o valor.

Com o valor por produto, o valor da negociação muda pelos produtos (não dá para escrever outro total).
No **Exportar**, a coluna Produtos leva o valor de cada um.

## 4. A proposta (o PDF)

Na ficha, na caixa de anotar: clique na caixa e **cole o arquivo com Ctrl+V** (copiado da pasta, no
Chrome e no Edge), ou arraste o arquivo, ou use o **Anexar**. Até 5 arquivos de 10 MB por anotação.
Depois, clique no PDF na anotação: **ele abre na tela, página por página, sem baixar** (o **Baixar** fica
embaixo). A imagem também abre grande; Word e Excel continuam baixando.

## 5. Ganhou ou perdeu

Na ficha, **Ganhou** ou **Perdeu** (ou arraste o cartão para a coluna Ganho ou Perdido):

- **Ganho**: confira o **valor fechado** (se mudou, o valor da negociação muda junto e fica no
  histórico) e o **dia em que fechou**. Com o valor por produto, a janela mostra cada produto e o total:
  se o valor fechado mudou, mude o valor de cada produto na ficha antes de marcar.
- **Perdido**: escolha **o motivo** (o **Outro** pede para escrever) e o dia.

O dia é hoje ou um que já passou: quem lança uma venda antiga marca o dia em que ela acabou de verdade.
O motivo muda depois, na ficha (fica no histórico). **Reabrir** volta a negociação para a etapa em que
ela estava.

## 6. O relatório

No painel, ao lado de **Quadro** e **Lista**: **Relatório** (ou o botão **Relatório** no cartão do
painel).

- **O período**: Este mês, Mês passado, Este trimestre, Últimos 90 dias, Este ano, ou dois dias. Fica
  no endereço da página: dá para mandar o link do jeito que está.
- **O período em números**:
  - o **ganho**, as **novas** (quantas entraram e quanto somam em propostas), o **perdido**, a
    **conversão** (das que acabaram, quantas foram ganhas) e o **ticket médio** (o valor médio do ganho);
  - embaixo de cada número, a **seta**: quanto mudou em relação ao período anterior (no Este mês, o
    mesmo pedaço do mês passado). Verde é melhor.
- **Os ganhos mês a mês**: o ganho de cada mês, nos 12 meses até o do fim do período, e quanto mudou
  em relação ao mês anterior (verde subiu, laranja caiu). O mês de hoje, ainda pela metade (com \*),
  é comparado com o mesmo pedaço do mês anterior. No celular, aparecem os 6 últimos.
- **O funil**: das que entraram no período, quantas chegaram a cada etapa (e a porcentagem das que
  entraram), quantas se perderam em cada uma e quantas foram ganhas.
- **Clique em qualquer número** (o ganho, as novas, o perdido, um mês, uma etapa do funil, as perdidas
  de uma etapa) para ver as negociações por trás dele; o código abre a negociação.

## 7. Do Comercial para o Suporte (e o contrário)

A negociação não vira chamado trocando de painel (nem o chamado vira negociação), e não tem pai nem
filhos. Os dois se **ligam**:

- Ganhou e precisa implantar? Abra o chamado no painel do Suporte e, na ficha da negociação, **Mais ›
  Ligar a outro chamado ou negociação** (digite o código do chamado).
- O cliente pediu um orçamento num chamado? Crie a negociação no Comercial e ligue os dois do mesmo
  jeito.

A ligação aparece na parte **Ligações** da ficha dos dois, com o desenho. **Trocar de painel** (em
Mais) só leva a negociação para outro painel de Vendas.
