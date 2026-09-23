# 0030 — Chamados: clicar filtra (e desfaz), e a administração arruma a tela para a equipe

**Contexto.** Com a tela de Chamados pronta (0029), o Luan pediu duas coisas (23/09):

- poder **trocar os gráficos de lugar**;
- que **clicar em qualquer parte** de um gráfico filtre a tela sozinho ("clicou num cliente, filtra
  o cliente; clicou num tipo, filtra o tipo").

Clicar numa barra ou fatia já filtrava, mas o gráfico clicado passava a mostrar só o escolhido (para
desfazer, só pelo X do filtro). As colunas do tempo — menos o dia no Período — e os números de cima
não respondiam ao clique.

Perguntado, ele escolheu:

- a arrumação é **igual para a equipe toda**, como era no Grafana, e não uma por pessoa;
- **tudo clicável, e clicar de novo desfaz**;
- além de trocar de lugar, **esconder** um gráfico e **mudar a largura**.

**Decisão.**

- **Clicar filtra a tela toda, e o gráfico clicado continua inteiro.**
  - Filtram: as barras e as fatias; as colunas do tempo (a hora no Hoje, a faixa de idade no Em
    aberto, o dia ou o mês no Período — filtro `quando`); os números de cima (filtro `situacao`:
    vencidos, parados, sem responsável, ainda em aberto, fechados).
  - O escolhido fica em destaque e o resto esmaece. Clicar de novo desfaz, clicar em outro troca e
    **Ctrl ou Shift + clique soma** mais um. Os filtros continuam escritos embaixo dos botões, cada
    um com o seu X.
  - Na conta, cada gráfico é contado com todos os filtros **menos o dele mesmo** (`recortar(..., sem)`
    em `packages/shared/src/chamados.ts`, usado pelo servidor e pela prévia). Os números de cima não
    obedecem à situação — é por eles que ela se escolhe. Um escolhido que zerou com os outros filtros
    aparece com 0, para dar para desfazer ali mesmo.
  - **"Fechados" troca a pergunta** nas abas Hoje e Período: a tela passa a olhar a data em que o
    chamado foi fechado (é o que "Fechados hoje" e "Fechados no período" contam, e clicar tem de
    mostrar os mesmos chamados). O gráfico do tempo vira "fechados por hora/dia/mês", e a coluna
    clicada passa a ser a do fechamento — por isso ligar ou desligar "fechados" limpa as colunas
    escolhidas.
  - Os números "de qualquer dia" da aba Hoje (Em aberto agora, Vencidos) levam para a aba Em aberto.
  - Revê a 0029 no dia clicado do Período: antes, o período inteiro virava aquele dia (de = até);
    agora o período fica, e o dia vira filtro.
- **A arrumação é da equipe, e só a administração arruma** (permissão `admin.manage`).
  - O botão **Organizar** abre o modo de arrumação:
    - arrastar pela alça, com mouse, caneta ou dedo; Esc desfaz o arrasto, e a página rola sozinha
      perto da borda;
    - setas, também pelo teclado;
    - **Metade | Inteira**, **Esconder | Mostrar**, e **barras | pizza** de cada gráfico;
    - **Voltar ao padrão**, **Cancelar** e **Salvar para todos**.
  - Enquanto organiza, clicar nos gráficos não filtra.
  - **Os números de cima e a tabela ficam fixos**: são o resumo e o detalhe. O que se arruma é o
    miolo.
  - Guardada no servidor, em Ajustes (`settings`, id `chamados-painel`), com quem mexeu e quando.
    `GET /chamados/painel` para quem vê chamados; `PUT` só para a administração, e **fica na
    auditoria com o antes e o depois**. Sem tabela nova e sem migração.
  - Cada gráfico tem um id estável (`serie`, `etapa`, `responsavel`, `etiqueta`, `campo:<chave>`):
    campo novo no LineChat entra sozinho no fim, e o que saiu de lá some da arrumação
    (`montarPainel`).
  - **Barras ou pizza**: o padrão de cada gráfico passa a ser o da equipe. Cada pessoa ainda pode
    trocar para si; fica no navegador dela e volta a seguir a equipe se escolher o mesmo. Quem salva
    a arrumação passa a ver exatamente o que a equipe vê.
  - O arrastar é código nosso (`apps/web/src/lib/arrastar.ts`), sem biblioteca — mesma linha da
    0028.
- **Na prévia**, a arrumação fica na memória da página, como o resto dos dados fictícios (recarregar
  volta ao início). Dá para arrumar, sair e entrar como `leitor@` para ver a mesma arrumação. No
  sistema, fica no servidor.

**Consequência.** A tela de Chamados funciona como o painel do Grafana, com duas diferenças: a
arrumação é salva por quem administra, e qualquer pedaço clicado vira filtro. Se um dia a equipe
quiser uma arrumação por pessoa, o caminho é guardar uma arrumação por usuário que, quando existir,
vale sobre a da equipe — o formato (`ItemPainel`) já serve para as duas.
