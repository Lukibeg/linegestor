# 0031 — Chamados: "só em aberto" no lugar da aba, pizza de padrão, grupos e etapas que fecham

**Contexto.** Com o Patch 1.3 no ar, o Luan usou a tela de Chamados com os dados de verdade e mandou,
em 24/09, um documento com pedidos (melhorias.docx). Cinco são dos Chamados:

1. a coluna **Descrição** não aparecia na tabela;
2. **"por padrão aparecer os gráficos em pizza, e se quiser aparecer em linhas"**;
3. **"quando expandir [o Outros], quero que saia Outros e fiquem os temas que estão dentro dele como
   se fossem temas normais, e não subtemas"**;
4. **"não precisa ter essa parte de Em aberto; apenas no Hoje ou Período ter uma flag de em aberto
   […] na verdade acho melhor termos como configurar as etapas que não vão contar como em aberto"**;
5. **"agrupar opções de um widget"**: "na aba por assunto eu tenho Ramal - Configuração, Ramal -
   Telefone sem serviço e Ramal - Criação. Eu apertaria um botão e ele unificaria os que foram
   previamente configurados por mim como unificados".

Os itens 2, 3 e 4 reveem decisões escritas (0028 e 0029). Ele foi avisado antes, na conversa, com a
decisão e o motivo de cada uma, e seguiu.

**Decisão.**

- **A aba "Em aberto" sai; entra o interruptor "só em aberto"**, ao lado de "incluir arquivados",
  que vale em **Hoje** e em **Período** (filtro `emAberto`). Para não perder o que a aba mostrava
  ("de qualquer data"), o Período ganha o atalho **Tudo** (desde o chamado mais antigo guardado —
  `primeiroDia`, que o resumo e as opções devolvem). **Período + Tudo + só em aberto = a antiga aba.**
  - Os números de cima seguem o interruptor. Hoje: abertos hoje · fechados hoje · em aberto agora ·
    vencidos; com o interruptor: abertos hoje e em aberto · sem responsável · vencidos · em aberto
    agora. Período: abertos · fechados · ainda em aberto · vencidos; com o interruptor: em aberto ·
    vencidos · parados há 7 dias ou mais · sem responsável.
  - "Em aberto agora" e "Vencidos" (de qualquer dia), na aba Hoje, levam ao Período inteiro com o
    interruptor ligado; "Ainda em aberto", no Período, liga o interruptor. A situação `abertos` e a
    faixa de idade (`quando` = "2-7", "8-15"…) saíram junto com a aba.
  - O gráfico "Há quanto tempo estão abertos" saiu com a aba: com o interruptor, o gráfico do tempo
    do Período conta os em aberto pelo dia (ou mês) em que foram abertos — o mais à esquerda é o
    mais antigo na mesa.
  - Endereço antigo (`aba=abertos`) vira `aba=periodo&emaberto=1`, sem erro; o servidor trata aba
    desconhecida como "hoje".
- **As etapas que fecham o chamado passam a ser da equipe.** Em Organizar, **Etapas que fecham**: a
  administração marca quais colunas do Kanban contam como fechadas; o padrão continua o do LineChat
  (Chamado Tratado Suporte e Chamado Validado). Fica em Ajustes (`chamados-painel.etapasFechadas`,
  `null` = o padrão do LineChat; marcar exatamente as finais de lá é guardado como `null`, para
  acompanhar se o LineChat mudar). Etapa que não existe mais é ignorada; nenhuma válida é recusado.
  - **A hora do fechamento é refeita pelo histórico**, a cada leitura (`comFechamento` em
    `packages/shared/src/chamados.ts`): o começo da última sequência do card em etapas que fecham
    (Observação → Tratado = fechado desde a Observação; voltar para o N2 recomeça). Por isso trocar
    as etapas não exige reler nada do LineChat. Card que nasceu e fechou entre duas leituras fica com
    a hora que a sincronização gravou; sem histórico, a última alteração do card, estimada.
  - A sincronização continua gravando `closed_at` pelas finais do LineChat: é o apoio da conta acima,
    não a resposta da tela.
- **Pizza é o padrão de todos os gráficos de lista** (revê a 0028, que tinha a pizza como opção, e a
  0029, que abria só Produto, Tipo e Canal em pizza). Barras continua a um clique, para cada pessoa
  (no navegador dela) e para a equipe (em Organizar). A arrumação guardada no 1.3 — sem `versao` —
  volta **convertida para pizza** (`atualizarPainelGuardado`): lá, "barras" era quase sempre só o
  padrão de então. A partir do 1.4 a arrumação é salva com `versao: 2` e vale como está.
- **"Outros" se desdobra em itens normais** (revê a regra "no máximo 6 fatias" da 0028). Clicar em
  Outros tira a linha "Outros" e põe cada valor como um item da legenda, com a sua fatia. **As cores
  continuam só nas 6 maiores**; o resto fica no cinza de "Outros", cada um na sua fatia, separados
  por um fio fino — uma 7ª, 8ª… cor gerada se confundiria com as seis sob daltonismo (regra do
  validador de paleta). "Juntar os menores em Outros" volta ao jeito curto.
- **Grupos por gráfico.** Em Organizar, cada gráfico de lista tem **Grupos**: um grupo tem nome e
  junta duas ou mais opções; uma opção fica num grupo só (senão o mesmo chamado contaria duas vezes).
  **Sugerir pelo começo do nome** monta os grupos do que vem antes do " - " (maiúscula e acento não
  separam; "Wi-Fi" não é começo de nada). No gráfico, o botão **Agrupar** junta e separa: a equipe
  escolhe como abre (em Organizar) e cada pessoa troca para si (no navegador). Clicar num grupo
  filtra por todas as opções dele (OU); o filtro escrito mostra o grupo como um item só, e o filtro
  em botão do campo separa as opções por grupo, com "marcar grupo".
  - A soma é feita na tela (`agruparItens`), sobre os números que o servidor já manda: em campo de
    múltipla escolha o gráfico conta **marcações**, e a soma das fatias continua batendo com o total.
- **A Descrição entra na tabela**, em texto puro (`textoDoCard`: o editor do LineChat pode mandar
  HTML; parágrafo vira linha, o resto das marcas some), cortada em 600 caracteres — o card inteiro
  abre no LineChat. Já vem marcada; quem tinha escolhido as colunas antes a vê uma vez
  (`useColunasEscolhidas(..., { novas })`) e tira se quiser. A busca passou a olhar o texto, não as
  marcas.

**Sem migração.** Tudo cabe na arrumação que já existia (`settings.chamados-painel`, JSON).

**Consequência.** A tela tem uma pergunta a menos para aprender (duas abas) e um interruptor que
vale em qualquer recorte. A contagem de "fechado" deixa de ser a do LineChat e passa a ser a da
equipe — por isso a escolha fica só com a administração e vai para a auditoria, com o antes e o
depois.
