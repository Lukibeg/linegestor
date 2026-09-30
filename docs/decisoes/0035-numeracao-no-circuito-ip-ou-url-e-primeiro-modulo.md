# 0035 — A Numeração dentro do circuito, IP ou URL da operadora, o 1º módulo e a ficha do cliente sem "trocar cliente"

**Contexto.** Com o Patch 1.5 no ar, o Luan mandou em 30/09 o "1009.docx", com quatro prints:

1. na ficha do circuito, "aqui na parte de DIDs nos links quero poder alterar também como faço na
   aba de DIDs, e fazer buscas/filtros";
2. no formulário do circuito, "nessa parte de IP da operadora tem que permitir eu colocar URL
   também, porque tem operadoras que só liberam a URL";
3. na lista de clientes (Colunas › Ativado em), "uma coluna ativação primeiro módulo, onde ele só
   vai considerar a ativação do primeiro módulo mesmo que o cliente tenha mais de 1";
4. na aba DIDs da ficha do cliente, "não precisa desse trocar cliente aqui".

O item 4 revê em parte a decisão 0034 (26/09: "em todo lugar que mostra DID dá para trocar o
cliente, o uso e a observação"). Ele foi avisado na conversa, com a decisão e o motivo, e seguiu.
Estes quatro itens são o **Patch 1.6** (aprovado por ele na prévia em 30/09). O trabalho de 28/09 da
marca "empresa do grupo", que também se chamava 1.6, nunca chegou ao GitHub (o bundle ficou só no
chat daquela conversa) e **não faz parte desta subida**: se for recuperado, entra como patch seguinte,
com a migração e a decisão renumeradas.

**Decisão.**

- **Os DIDs do circuito são a tabela da Numeração com o circuito fixo** (`Numeracao({ circuito })`
  em `pages/dids/Lista.tsx`): busca, filtros de cliente e de uso, caixas de seleção, "selecionar
  todos os filtrados" e a barra de edição em massa (atribuir a cliente, mudar circuito, em uso / não
  usado, observação, liberar, excluir) — com as mesmas confirmações e a mesma auditoria. Com o
  circuito fixo somem o que seria sempre igual: o filtro e as colunas de circuito e operadora, o
  interruptor dos links de terceiros (a ficha mostra todos os números do circuito) e o "Criar
  faixa" (já está no alto da ficha). Lista paginada no servidor, com "Ver tudo". Para caber, o
  cartão do **tronco virou uma faixa no alto** e os DIDs ganharam a largura toda. O link "abrir na
  Numeração para editar em massa" saiu: não é mais preciso.
- **A busca dos DIDs acha o número ou um pedaço da observação**, sem acento nem maiúscula — no
  servidor (`filtros()` em `services/dids.ts`, com `translate` para os acentos e `%`/`_` tratados
  como texto) e na prévia. Vale para a Numeração e para a ficha do circuito, e o "selecionar todos
  os filtrados" conta exatamente os mesmos. Antes a Numeração só procurava dígitos.
- **IP ou URL da operadora**: o campo aceita IP (com a máscara de sempre, enquanto só houver dígitos
  e pontos) ou endereço — com uma letra, dois-pontos ou barra fica como foi digitado, sem espaços
  (`formatarIpOuEndereco` em `shared/formatos.ts`, `InputIpOuEndereco` no kit). O limite passou de
  64 para 200 caracteres (a coluna já era `text`: **sem migração**). O **IP do PBX** ganhou o mesmo
  campo: já há circuito com endereço gravado ali (`sbc.…`, vindo do Nexus), e a máscara só de IP o
  apagava na primeira tecla ao editar.
- **Coluna "1º módulo — ativado em"** na lista de clientes (grupo "Ativado em", logo depois das
  datas dos produtos): a data de ativação do módulo **ativado primeiro**, de qualquer produto, com o
  nome dele embaixo, na cor do produto. Conta os módulos **ligados hoje** — os mesmos que a coluna
  "Módulos" mostra —; módulo desativado não entra. Sem módulo: "—"; com módulo mas sem data: "sem
  data". Ordena no servidor (`primeiroModulo`: o `min` das datas) e aparece uma vez para quem já
  tinha escolhido as suas colunas.
- **Ficha do cliente › DIDs sem "trocar cliente"** (revê a 0034 nesse ponto): ficam o uso e a
  observação na própria linha. Passar o número para outro cliente é na Numeração ou na ficha do
  circuito, onde existe a coluna Cliente com o lápis. O `ClienteDoDid` perdeu o modo `soBotao`.

**Consequências.**

- **Nenhuma migração**: o banco não muda.
- Testes novos em `apps/api/test/patch16.test.ts`: URL no IP da operadora e no IP do PBX,
  busca por observação sem acento (e com o circuito fixo), `%` como texto, "todos os filtrados", e
  a ordem pelo 1º módulo (desativado não conta; sem módulo no fim, nos dois sentidos). Mais dois
  blocos no teste dos formatos (`formatarIpOuEndereco`).
- Se um dia quiserem contar também os módulos já desligados no "1º módulo", é trocar o filtro
  `deactivatedAt is null` do `primeiroModulo` e a conta da tela — a data de cada ligação continua
  guardada.
