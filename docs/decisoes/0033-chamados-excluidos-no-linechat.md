# 0033 — Chamados: o card excluído no LineChat sai no mesmo dia

**Contexto.** Em 26/09 o Luan contou que a equipe exclui cards no LineChat (aberto errado, sem
necessidade) e eles continuavam aparecendo no Gestor. O LineChat não avisa quando um card é
excluído: ele só some da API. Pediu uma leitura completa todo dia à meia-noite, que apagasse os
nossos registros ou os diferenciasse para sair do painel.

Olhando o sistema no ar (26/09, com o login dele): a completa das 4h **já fazia isso** — marcou 2
cards naquela manhã —, e um "Reler tudo" feito às 11h40 achou mais 3, excluídos depois das 4h. O
defeito não era de lógica, era de ritmo: o card excluído de dia ficava na tela (inclusive em
**Hoje**) até as 4h do dia seguinte, porque a leitura de minuto em minuto só pede ao LineChat o que
mudou (`UpdatedAt.After`), e excluir não muda nada que ela enxergue.

**Decisão.**

- **A completa passa das 4h para a meia-noite de Brasília**, como ele pediu (revê a 0029). O dia
  fecha limpo e o backup das 3h já leva a cópia conferida. Continua valendo: na primeira vez e depois
  de 26 horas sem ela (servidor fora do ar na virada).
- **Entra a conferência, a cada 10 minutos** (`conferirExcluidos` em `services/linechat.ts`):
  - relê tudo o que foi mexido nos **últimos 7 dias** — todo card aberto nesse período entra, porque
    abrir é mexer — e o que temos aqui, **aberto nesse período**, e não veio, foi excluído lá. É uma
    página ou duas (100 cards por página), só com os parâmetros que a leitura recente já usa;
  - o que faltou é conferido numa **segunda leitura** antes de marcar: a página pode "escorregar"
    (um card alterado no meio vai para o fim da fila e o vizinho pula de página). Faltar nas duas =
    excluído. Um card de verdade não pode sumir da tela;
  - o que estava marcado como excluído e veio de novo **volta** para a tela;
  - a mesma trava da completa: se faltar mais da metade do que foi aberto na semana (com mais de 10),
    nada é marcado e o registro avisa;
  - roda depois de uma leitura recente que deu certo, nunca junto de outra leitura (uma trava só
    para as três; o botão "Sincronizar agora" espera a conferência acabar em vez de devolver o
    resultado dela);
  - vira linha em "Últimas leituras registradas" só quando marcou, devolveu ou falhou.
  Card excluído com mais de 7 dias de aberto fica para a completa da meia-noite.
- **Não apagamos do banco.** O card fica em `linechat_cards` com `removed_at` preenchido: fora da
  tela e das contas, mas guardado (o histórico de etapas cita o card, e um engano se desfaz sozinho).
  Segue a regra "nada é apagado de verdade". Quem olhar o banco direto filtra `removed_at is null`.
- **A tela diz o que saiu.** Em Ajustes › Chamados do LineChat: "Fora das contas: N excluídos no
  LineChat" e a lista **Excluídos no LineChat** (todos, os mais recentes primeiro), com o código que
  abre o card lá — se abrir, não foi excluído, e o "Reler tudo" o traz de volta. O registro das
  leituras passa a dizer **quais** cards saíram (até 10 códigos), não só quantos.

**Sem migração.** `kind = 'conferencia'` cabe na coluna de texto que já existe.

**Consequências.**

- Custo: uma ou duas chamadas à API a cada 10 minutos (mais uma quando falta algum card), perto das
  1.440 da leitura recente por dia.
- Se um dia o LineChat passar a devolver o card excluído (lixeira com prazo, por exemplo), nem a
  completa nem a conferência o tiram: seria preciso ler a marca que ele usar. Hoje, conferido no
  sistema no ar, ele some da API.
