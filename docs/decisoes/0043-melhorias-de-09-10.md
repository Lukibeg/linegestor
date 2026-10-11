# 0043 — O DID sem titular, a semana e o mês nos Chamados do cliente, ordenar o projeto

**Contexto.** Em 09/10, com o 1.9 na prévia, o Luan mandou um .docx com três prints e três pedidos:
"não precisa de titular no DID" (a tabela de DIDs da ficha do circuito, com a coluna Titular sempre
vazia, embaixo de um tronco que já diz o titular), "quero também a opção de ter aqui essa semana e
esse mês" (a aba Chamados da ficha do cliente, que só tinha 30 dias, 90 dias e 12 meses) e "quero
poder clicar nas colunas e assim ter o ordenamento por elas" (a lista de clientes de um projeto).
Como o 1.9 ainda não subiu, os três entraram nele.

**Decisão.**

- **O titular é do circuito.** O DID deixou de mostrar titular: saiu a coluna **Titular** da tabela
  de DIDs (na Numeração e na ficha do circuito, que usam a mesma tabela) e da aba **DIDs** do cliente,
  que perdeu também o filtro **Titular**. O CSV de DIDs não traz mais a coluna `titular` na exportação,
  e a importação ignora essa coluna num arquivo antigo (sem erro e sem gravar nada). O titular do
  **circuito** continua igual: na lista de Circuitos (coluna e filtro), no cadastro, no tronco da ficha
  e no CSV de circuitos. No banco, o campo do DID (`dids.owner_client_id`) fica onde está, sem uso na
  tela — nada se apaga, e se um dia o titular do número voltar a importar, é só mostrar de novo.
  Revê a parte da decisão 0010 em que o DID tinha titular ("Dono" virou Titular).
- **Chamados do cliente: Esta semana e Este mês.** Os botões ficam Esta semana · Este mês · 30 dias ·
  90 dias · 12 meses (90 dias continua o padrão). **Esta semana** vai da segunda-feira até hoje — a
  mesma semana dos Relatórios dos Chamados (`inicioDaSemana`, segunda a domingo); **Este mês**, do dia
  1 até hoje. A linha "de … a …" mostra o período, como antes.
- **A lista de clientes do projeto ordena pela coluna**, com o mesmo cabeçalho clicável das outras
  tabelas (a seta mostra a coluna e o sentido; clicar de novo inverte). Sem clicar, a ordem é a de
  sempre. **Cliente**: pelo nome. **Etapa de lista**: pela ordem das opções do projeto (a do
  formulário, que é a ordem do trabalho — "Pendente envio" antes de "Cliente confirmou"); em branco,
  sempre por último. **Etapa de caixinha**: as não feitas primeiro. **Situação**: pendente → em
  andamento → travado → concluído → não se aplica. A ordem vale junto com os filtros do painel e não
  fica guardada (volta à de sempre ao reabrir o projeto).

**Consequências.**

- Sem migração e sem permissão nova. No servidor, só o CSV de DIDs mudou (exportação sem `titular`;
  importação ignorando a coluna). As outras duas mudanças são da tela.
- Testes novos: `apps/api/test/patch19-melhorias.test.ts` (o CSV de DIDs com e sem a coluna).
- Na nota do 1.9, três cartões "melhorou", com prints.
