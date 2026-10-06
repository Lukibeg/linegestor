# Envio automático do PDF dos Chamados pelo WhatsApp

Todo dia, no horário escolhido, o Ingline Gestão monta um **PDF** com os números do dia e os
gráficos e relatórios dos Chamados que a administração marcou, e manda pelo **WhatsApp** — pela API
da FlwChat — para os números da lista. Junto vai uma mensagem com os números de hoje.

Os números são sempre **do dia atual**, até a hora do envio: os gráficos como na aba **Hoje** dos
Chamados, e os relatórios com o período de hoje (o Fechamento do mês, com o mês até hoje).

---

## 1. Marcar o que vai no PDF

Em **Chamados** (cada gráfico) e em **Chamados › Relatórios** (cada relatório), quem administra vê um
**aviãozinho** discreto no canto do cartão (passe o mouse: "Envio diário"):

- clicou, ele fica **azul e cheio**, e o item entra no PDF;
- clicou de novo, sai.

Vale para a equipe toda e fica na auditoria. Os números de cima da aba Hoje vão sempre. O Raio-X do
cliente não pode ir (ele precisa de um cliente escolhido). O PDF segue a ordem das telas.

## 2. Ligar o envio

Em **Administração › Envio automático**:

| Campo | O que é |
|---|---|
| **Mandar todo dia, sozinho** | Liga e desliga o envio |
| **Horário** | De Brasília. O envio sai nesse minuto (ou até 3 horas depois, se o servidor estava fora do ar). Trocou o horário? Vale já para hoje |
| **Dias** | Todos, por padrão. "só dias úteis" deixa de segunda a sexta |
| **Para quem** | Nome e número (com DDD) de cada pessoa. "pausado" deixa na lista sem receber |
| **Número que envia** | O número conectado na FlwChat |
| **Token da API da FlwChat** | Fica cifrado no cofre e **nunca** volta a aparecer na tela |
| **Endereço de envio da API** | O endereço de enviar mensagem, da documentação da FlwChat |

Salve, depois:

1. **Testar**, ao lado de um número: manda só uma mensagem de texto. Se chegar, o token, o número que
   envia e o destino estão certos.
2. **Ver como fica**: mostra o PDF na tela, com os números de agora.
3. **Mandar agora**: monta o PDF e manda para a lista (pede confirmação).

## 3. Acompanhar

Embaixo, **Últimos envios**: quando, se foi no horário ou mandado à mão, se deu certo, para quantos
números e o PDF de cada um para baixar. Tudo também fica na auditoria.

Lá em cima, ao lado de **próximo**, a tela diz **como foi o envio de hoje**: se saiu (e a que horas),
se falhou e quando tenta de novo, ou se não saiu — sempre com o motivo. A tela se atualiza sozinha a
cada minuto.

Se falhar (token errado, número desconectado, faltou algo), o motivo aparece ali, e o envio do horário
tenta de novo duas vezes, a cada 15 minutos. Corrigiu e **salvou**? Ele ganha 3 tentativas novas no
mesmo dia (se ainda estiver dentro das 3 horas depois do horário). Ou use **Mandar agora**.

## Bom saber

- A FlwChat **baixa o PDF de um link do Gestor**, difícil de adivinhar, que **vence em 7 dias**. O
  arquivo continua guardado e quem administra baixa pelo histórico.
- O PDF é montado pelo próprio servidor (um navegador sem janela abre a página e imprime). É a mesma
  tela que vocês veem: o que muda na tela, muda no PDF.
