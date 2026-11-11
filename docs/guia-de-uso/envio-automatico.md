# Envio automático do PDF dos Chamados pelo WhatsApp

Todo dia, no horário escolhido, o Ingline Gestão monta um **PDF** com os números do dia e os gráficos e relatórios que a
administração marcou, e manda pelo **WhatsApp** — pela API da FlwChat — para os números da lista. Junto vai uma mensagem
com os números de hoje.

**Desde o 2.4.5, cada envio é de um painel.** Dá para ter um envio do Suporte, outro do Desenvolvimento, outro do
Administrativo — cada um com o seu horário, os seus dias e os seus números. O **Legado do Helena** (os tickets do
LineChat) também pode ter o dele. Os painéis de Vendas não entram: eles têm o relatório do Comercial.

Os números são sempre **do dia atual**, até a hora do envio: os de cima e os gráficos como na **Visão geral** de hoje do
painel, e os relatórios com o período de hoje (o Fechamento do mês, com o mês até hoje).

---

## 1. Marcar o que vai no PDF

Nos **Relatórios** de cada painel (Painéis › o painel › Relatórios), quem administra vê um **aviãozinho** discreto no
canto de cada gráfico das partes Hoje e Período e de cada um dos 25 relatórios (passe o mouse: "Envio diário"):

- clicou, ele fica **azul e cheio**, e o item entra no PDF **daquele painel**;
- clicou de novo, sai.

Vale para a equipe toda e fica na auditoria. Os números de cima vão sempre. O Raio-X do cliente não pode ir (ele precisa
de um cliente escolhido). O PDF segue a ordem das telas: os gráficos na arrumação da Visão geral (com a largura e a pizza
ou as barras que a equipe escolheu) e os relatórios na ordem do Organizar.

No **Legado do Helena** (Suporte › Relatórios › Legado do Helena), o aviãozinho continua marcando para o envio do Legado.

## 2. Criar e ligar um envio

Em **Administração › Envio automático**, cada envio é um cartão. Para criar outro: embaixo dos cartões, em **Novo envio
do painel**, escolha o painel e clique em **Novo envio**.

| Em cada envio | O que é |
|---|---|
| **Painel** | De onde sai o PDF (o nome no alto do cartão; dá para trocar). Um envio por painel |
| **Mandar todo dia, sozinho** | Liga e desliga este envio |
| **Horário** | De Brasília. O envio sai nesse minuto (ou até 3 horas depois, se o servidor estava fora do ar). Trocou o horário? Vale já para hoje |
| **Dias** | "só dias úteis" deixa de segunda a sexta; "todos os dias", a semana inteira |
| **Para quem** | Nome e número (com DDD) de cada pessoa. "pausado" deixa na lista sem receber. O mesmo número pode estar em dois envios |
| **O que vai no PDF** | O que está marcado com o aviãozinho no painel, com o X para tirar. Os links levam aos gráficos e aos relatórios do painel |

| Em De onde sai (FlwChat), para todos | O que é |
|---|---|
| **Número que envia** | O número conectado na FlwChat |
| **Token da API da FlwChat** | Fica cifrado no cofre e **nunca** volta a aparecer na tela |
| **Endereço de envio da API** | O endereço de enviar mensagem, da documentação da FlwChat |
| **Concluir a conversa depois de mandar** | Vem ligada: o relatório é só um aviso, e a conversa que ele abre na FlwChat é concluída logo depois. Vale também para o Testar e o Mandar agora |

Quando algo muda, aparece embaixo a barra **Há mudanças sem salvar**: clique em **Salvar** (vale para a tela toda).
Depois, em cada envio:

1. **Testar**, ao lado de um número: manda só uma mensagem de texto, dizendo de qual painel é. Se chegar, o token, o
   número que envia e o destino estão certos.
2. **Ver como fica**: mostra o PDF deste envio na tela, com os números de agora.
3. **Mandar agora**: monta o PDF e manda para a lista deste envio (pede confirmação).
4. **Baixar o PDF de agora**: o arquivo, sem mandar.

Para tirar um envio, a lixeira no alto do cartão (vale ao salvar; o que está marcado no painel continua lá).

## 3. Acompanhar

Embaixo, **Últimos envios**, de todos: quando, **de qual painel**, se foi no horário ou mandado à mão, se deu certo, para
quantos números e o PDF de cada um para baixar. O arquivo leva a sigla do painel (`chamados-sup-04-11-2026.pdf`). Tudo
também fica na auditoria. Os envios de antes do 2.4.5 aparecem como do Legado do Helena.

Em cada cartão, ao lado de **próximo**, a tela diz **como foi o envio de hoje** daquele painel: se saiu (e a que horas),
se falhou e quando tenta de novo, ou se não saiu — sempre com o motivo. A tela se atualiza sozinha a cada minuto.

Se falhar (token errado, número desconectado, faltou algo), o envio do horário tenta de novo duas vezes, a cada 15
minutos. Corrigiu e **salvou**? Ele ganha 3 tentativas novas no mesmo dia (se ainda estiver dentro das 3 horas depois do
horário). Ou use **Mandar agora**. Se o painel foi **desativado**, o cartão avisa e o envio não sai até o painel voltar.

## Bom saber

- O envio que existia até o 2.4.4 (do Legado) passou sozinho para o **painel Suporte**, com o mesmo horário e os mesmos
  números, e com o que estava marcado no Legado, onde tem par (o Relógio do chamado, a Escada, a Primeira resposta, o
  Fechamento do mês, o Voltou com o mesmo problema; os gráficos do tempo, da etapa, do responsável, da etiqueta e do
  Assunto).
- A FlwChat **baixa o PDF de um link do Gestor**, difícil de adivinhar, que **vence em 7 dias**. O arquivo continua
  guardado e quem administra baixa pelo histórico.
- O PDF é montado pelo próprio servidor (um navegador sem janela abre a página e imprime). É a mesma tela que vocês
  veem: o que muda na tela, muda no PDF.
