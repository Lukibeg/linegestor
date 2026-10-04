# 0037 — Chamados › Relatórios

**Contexto.** Em 30/09 o Luan pediu "uma nova página de relatório" para os Chamados, com opções
criativas para escolher. Foram doze ideias numa página de escolha; em 03/10 ele marcou nove:
Relógio do chamado, A escada N1 → N2 → N3, Mapa de calor da semana, Entrada × saída, Sobe e desce
dos assuntos (marcado uns minutos depois dos outros), Voltou com o mesmo problema, Raio-X do
cliente, Quadro da equipe e Fechamento do mês. Ficaram sem resposta (e fora): Onde o chamado empaca
e Prazo cumprido. O resumo da semana no
WhatsApp virou outro pedido: **um PDF diário** com os relatórios principais, a definir depois. Ele
pediu mais ideias: a segunda rodada (dez, da pesquisa) foi votada na mesma noite, e entraram quatro —
**Idade da fila, Dias fora da curva, Chamados pelo tamanho do cliente e De quem é a falha?**. Ficaram
fora: Primeira resposta, A prioridade faz diferença?, Os poucos que pesam muito (80/20), Previsão da
semana, Card bem preenchido e Nota do cliente (e, da primeira, Onde o chamado empaca e Prazo
cumprido, marcados "não"). Eram treze relatórios.

Em **04/10** o Luan mudou de ideia: "vc vai colocar todos aqueles que me deu a sugestão, mas eu vou
poder ocultar o que eu quiser, tbm vou poder mudar a ordenação", e uma **aba de favoritos**. Entraram
os sete que estavam fora — **Onde o chamado empaca, Primeira resposta, A prioridade faz diferença?,
Prazo cumprido, Os poucos que pesam muito, Previsão da semana e Card bem preenchido** — e são
**vinte**. Ficaram fora só a **Nota do cliente** (o Gestor não tem a nota) e o **Resumo no
WhatsApp** (é o PDF diário, a definir). Perguntado se a arrumação era de cada pessoa ou da equipe,
respondeu: **"Tudo igual para a equipe"**.

**Decisão.**

- **Uma página própria**, `/chamados/relatorios`, que aparece como a **terceira aba** dos Chamados
  (Hoje · Período · Relatórios). Cinco abas: **Tempo** (Relógio, Escada, Onde empaca, Primeira
  resposta, Prioridade, Prazo — os seis em meia largura, dois por linha), **Volume** (Mapa de calor,
  Entrada × saída, Idade da fila, Dias fora da curva, Sobe e desce, Os poucos que pesam muito,
  Previsão da semana), **Clientes** (Raio-X, Tamanho do cliente, Voltou com o mesmo problema, De
  quem é a falha?), **Equipe** (Quadro, Card bem preenchido) e **Mês** (Fechamento) — mais a aba
  **Favoritos**, a primeira. O período e os filtros de valor são os mesmos da tela de Chamados e
  viajam entre as duas abas; tudo fica no endereço.
- **A arrumação é da equipe** (como o Organizar da tela de Chamados): quem tem `admin.manage` clica
  em **Organizar** e, em cada aba, muda a ordem (setas), esconde/mostra e marca a **estrela**; na aba
  Favoritos, as setas mudam a ordem dos favoritos (que é só deles). A **aba de cada relatório é
  fixa** (o catálogo `CATALOGO_RELATORIOS`, com a largura de cada um). **Escondido não aparece em
  lugar nenhum**, nem nos Favoritos: esconder tira a estrela, e favoritar mostra de volta. Guardado
  em `settings.chamados-relatorios-arrumacao` (JSON `{ordem, ocultos, favoritos}`, **sem migração**);
  relatório novo que entrar no catálogo aparece sozinho no fim da sua aba. "Salvar para todos" vai
  para a auditoria (`chamados_relatorios_arrumacao`). A página abre nos **Favoritos** quando tem
  algum; senão, no Tempo. Um aviso no pé da aba diz o que está escondido ali.
- **As contas estão em `packages/shared/src/relatorios.ts`**, como as da tela de Chamados: o
  servidor e a prévia rodam a mesma função. O servidor passou a guardar na leitura dos chamados o
  **histórico de etapas** e os **grupos** de Organizar (a leitura continua guardada por até 1 minuto).
- **Tempo é mediana** (e o percentil 90 como "9 em cada 10 fecham em até…"), nunca média: um
  chamado esquecido não puxa a conta. Fechado com **hora estimada** (antes da primeira leitura,
  23/09) conta como fechado, mas **fica fora do relógio**.
- **A escada** procura as etapas com **N1, N2 e N3 no nome** e conta o nível mais alto por onde o
  chamado passou — só para os abertos **depois que o histórico começou** (antes disso não se sabe o
  caminho). **Reaberto** = saiu de uma etapa que fecha para uma que não fecha.
- **Reincidência** = mesmo Cliente + mesmo Assunto com dois chamados a **até 30 dias** um do outro.
  Pode juntar pelos grupos do Assunto.
- **Sobe e desce dos assuntos**: os abertos de cada assunto no período contra o período anterior
  do mesmo tamanho; os 8 que mais subiram e os 8 que mais caíram. **Junta pelos grupos do Assunto
  por padrão** (a ideia prometia "respeita os grupos"); dá para separar.
- **Idade da fila**: os em aberto agora (de qualquer data; o período não muda, os filtros sim), por
  idade desde a abertura, em seis faixas e por etapa; a partir de 7 dias em laranja.
- **Dia fora da curva**: normal = a mediana do mesmo dia da semana nas 8 semanas anteriores; fora da
  curva = pelo menos 5 chamados, o dobro do normal **e** 5 a mais (num dia normal de 9, só a partir
  de 18). Mostra o assunto que dominou e o cliente que mais abriu.
- **Tamanho do cliente**: chamados abertos no período por 10 DIDs ou por 10 aparelhos do cliente no
  Gestor (os vendidos não contam, como na ficha), pela ligação do Cliente do card ao cadastro. O
  servidor manda o cadastro e as contagens no contexto da conta; sem eles o relatório diz que não
  está disponível.
- **De quem é a falha?**: o **Tipo de chamado** de cada card vai para um de quatro grupos — falha
  nossa, do cliente, da operadora, pedido ou dúvida —, **pelo nome do tipo** (operadora/terceiros →
  operadora; Ingline, sistêmica, correção → nossa; falha, dificuldade, infraestrutura → do cliente;
  o resto → pedido) ou pela **escolha da equipe** (`causas` nos ajustes, só `admin.manage`). Mês a mês
  (6 meses) e no período, em % do total, com os sem tipo à parte; um card com mais de um tipo conta
  pelo primeiro.
- **Mapa de calor**: dia da semana × hora em Brasília, somando o período; horário comercial fixo
  em **seg–sex, 8h–18h** (só para a contagem "fora do horário").
- **Quadro da equipe em ordem de nome**, não de quem fechou mais: é para equilibrar a carga.
- **Onde o chamado empaca**: cada passagem por uma etapa (entrou e saiu, pelo histórico, com hora
  exata) que terminou no período; mediana e "9 em 10"; as etapas que fecham não entram; a mais lenta
  precisa de 3 passagens ou mais. "Parados agora" é de agora.
- **Primeira resposta**: da abertura até sair da **etapa inicial** (Novos Suporte); card que nasce
  em outra etapa conta como pego na hora. Só os abertos no período, com o caminho conhecido; os que
  chegam **fora do horário comercial** ficam à parte (senão a noite puxa a conta).
- **A prioridade faz diferença?**: pelas etiquetas que começam com **"P/"** (Crítica, Alta, Média,
  Baixa; vale a mais alta do card). Compara a mediana até fechar entre prioridades vizinhas com 3
  fechados ou mais; se a mais alta demorou mais, diz "Nem sempre".
- **Prazo cumprido**: os fechados no período (hora exata) **com vencimento** no LineChat; no prazo =
  fechou até o **dia** do vencimento (Brasília). Os sem vencimento ficam fora da porcentagem.
- **Os poucos que pesam muito (80/20)**: os abertos no período por Assunto (com os grupos), Cliente,
  Produto ou Tipo, do maior para o menor, com o acumulado e onde chega a 80%.
- **Previsão da semana**: cada dia da próxima semana = a **média** do mesmo dia da semana nas 8
  semanas completas antes da atual (o menor e o maior como faixa); não depende do período escolhido.
  Aqui é média, não mediana: é para somar a semana.
- **Card bem preenchido**: nos fechados no período, Cliente, Assunto, Tipo, Produto (os campos dos
  relatórios) e o **Resolutor** (achado pelo nome); por campo e por responsável, em ordem de nome.
- **Ligar o Cliente do card ao cadastro**: automático quando o nome bate (sem acento, sem
  Ltda/ME/S.A.) com o nome fantasia ou a razão social de **um** cliente só; a administração corrige
  ou marca "não é cliente do cadastro". Guardado em Ajustes (`settings.chamados-relatorios`, JSON),
  **sem migração**, junto com o grupo de cada tipo (`causas`) e a escolha dos **campos** usados (Cliente, Assunto, Tipo, Produto;
  sem escolha, achados pelo nome — o "Assunto" de escolha única vem antes do "Assunto - novo").
  Só `admin.manage` grava, e fica na auditoria (`chamados_relatorios`). Quem tem `support.read` vê
  tudo.
- **A ficha do cliente ganhou a aba Chamados** (para quem tem `support.read`), com o Raio-X.
- **PDF pela impressão do navegador**: o Fechamento do mês imprime sozinho, no tema claro, em A4
  (`@media print` em `styles.css`). Nenhuma biblioteca nova. O PDF diário pelo WhatsApp entrou no mesmo
  1.7 (decisão 0038): esse, o servidor monta, com um Chromium sem janela.

**Consequências.**

- Rotas novas: `GET /chamados/relatorios`, `GET /chamados/relatorios/chamados` (a peça clicada),
  `GET|PUT /chamados/relatorios/ajustes`, `GET|PUT /chamados/relatorios/arrumacao` (a arrumação; o
  PUT só com `admin.manage`) e `GET /chamados/relatorios/cliente/:id` (Raio-X). Testes em
  `packages/shared/src/relatorios.test.ts` e `apps/api/test/patch17.test.ts`.
- A prévia ganhou um histórico de etapas inventado (com semente própria, para não mudar os números
  que já mostrava) e passou a refazer a hora do fechamento por ele, como o servidor. Também ganhou
  vencimento em um terço dos fechados recentes (sem mexer no sorteio), para o Prazo cumprido ter o
  que mostrar.
- Se as etapas N mudarem de nome no LineChat, a escada avisa que não achou os níveis; aí é ajustar
  `nivelDaEtapa` (ou dar à equipe uma escolha em Organizar).
