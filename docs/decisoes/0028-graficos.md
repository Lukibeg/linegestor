# 0028 — Gráficos: três formas, uma cor, nenhuma biblioteca

**Contexto.** O Luan sentiu falta de gráfico no sistema. O risco de um pedido assim é encher a tela
de rosquinhas coloridas que ninguém lê — ou puxar uma biblioteca de 300 KB para desenhar quatro
barras.

**Decisão.** Um kit próprio, em `apps/web/src/components/graficos.tsx`, com **três formas e só três**,
porque são as três perguntas que a operação faz:

- **`BarrasTempo`** — "como foi cada mês?". Uma barra por mês; passar o mouse mostra a divisão
  (Locação 3 · Devolução 1) embaixo, sem poluir o desenho.
- **`BarrasRanking`** — "quem são os maiores?". Barras deitadas, já ordenadas, nome à esquerda e
  número à direita.
- **`Proporcao`** — "quanto de um, quanto do outro?". Uma barra dividida, com os rótulos e os
  números logo abaixo.

**Uma cor por gráfico.** A identidade vem do rótulo escrito ao lado, não da cor — assim ninguém
precisa distinguir verde de laranja para entender (e quem não distingue lê igual). Onde há duas ou
três partes (em uso × livre), cada parte tem nome e número escritos; a cor é só reforço. Nada de
eixo duplo, nada de fatia de pizza, nada de número em cima de todo ponto.

As cores saem das variáveis do tema (`--accent`, `--ok`, `--signal`), então o modo escuro acompanha
sozinho, e o SVG/HTML é feito à mão: **nenhuma dependência nova**, nada baixado de fora — o que
importa porque a prévia publicada não alcança CDN.

**Onde entraram.** No **Painel**: "Movimentação dos últimos 6 meses" (barras), "Numeração" e
"Aparelhos" (proporção) e "Clientes por produto" (ranking, clicável — leva para a lista já filtrada).
Na ficha do **projeto**, "Como está cada passo" usa a mesma linguagem.

**Consequências.**

- O `/dashboard` passou a devolver `movimentacoesPorMes`: sempre 6 meses, o mais recente por último,
  cada um com o total e a divisão por modalidade (mês sem movimento vem zerado, para o gráfico não
  "pular" meses).
- A prévia ganhou movimentações em meses anteriores — sem isso o gráfico aparecia quase vazio e
  parecia defeito.
- 1 teste novo cobre a forma do dado do gráfico (6 meses, soma bate com a divisão).
