# 0028 — Gráficos: três formas, uma cor, nenhuma biblioteca

**Contexto.** O Luan sentiu falta de gráfico no sistema. O risco de um pedido assim é encher a tela
de rosquinhas coloridas que ninguém lê — ou puxar uma biblioteca de 300 KB para desenhar quatro
barras.

**Decisão.** Um kit próprio, em `apps/web/src/components/graficos.tsx`, com **duas formas**, porque
são as perguntas que a operação faz:

- **`BarrasRanking`** — "quem são os maiores?". Barras deitadas, já ordenadas, nome à esquerda e
  número à direita. Clicável: leva para a lista já filtrada.
- **`Proporcao`** — "quanto de um, quanto do outro?". Uma barra dividida, com os rótulos e os
  números logo abaixo.

Uma terceira, `BarrasTempo` (uma barra por mês), foi feita e **descartada na primeira olhada**: o
Luan não gostou, e o número que ela mostrava — quantas movimentações no mês — não muda decisão
nenhuma no dia seguinte. Ficou a lição: gráfico que não responde pergunta de trabalho sai.

**Uma cor por gráfico.** A identidade vem do rótulo escrito ao lado, não da cor — assim ninguém
precisa distinguir verde de laranja para entender (e quem não distingue lê igual). Onde há duas ou
três partes (em uso × livre), cada parte tem nome e número escritos; a cor é só reforço. Nada de
eixo duplo, nada de fatia de pizza, nada de número em cima de todo ponto.

As cores saem das variáveis do tema (`--accent`, `--ok`, `--signal`), então o modo escuro acompanha
sozinho, e o SVG/HTML é feito à mão: **nenhuma dependência nova**, nada baixado de fora — o que
importa porque a prévia publicada não alcança CDN.

**Onde entraram.**

- **Painel**: "Valor nosso na mão do cliente" (quem está com mais aparelho nosso em locação e
  comodato — venda não conta, porque o aparelho vendido não é mais nosso) e "Clientes por produto".
- **Inventário**: "Parque por modelo" — os dez modelos com mais unidades; clicar filtra a lista.
- **Ficha do cliente**, aba Equipamentos: "Por modelo" e "Valor por modelo" viraram barras; clicar
  numa filtra a lista de aparelhos.
- Na ficha do **projeto**, "Como está cada passo" usa a mesma linguagem, com dois formatos à
  escolha (cartões ou barras) que ficam gravados no navegador.

**Consequências.**

- O `/dashboard` passou a devolver `valorPorCliente`: os oito clientes com mais valor nosso na mão.
  Os outros gráficos não pediram nada ao servidor — saem de dados que a tela já carregava.
- 1 teste novo cobre esse dado (soma certa, venda de fora).

**Dois gráficos nasceram e morreram no mesmo dia**: o de movimentações por mês e o "Quem está mais
cheio" dos circuitos. O segundo repetia a coluna Ocupação, que já vive na tabela com barrinha e %.
A regra que ficou: gráfico só entra se responder uma pergunta que a tela ainda não responde.
