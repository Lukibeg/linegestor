# 0061 — O envio automático de cada painel

**Data:** 04/11/2026 (publicada no 2.4.5, em 09/11/2026) · **Patch:** 2.4.5 · **Situação:** aceita · **Revê:** a 0038 (o envio automático do PDF)

## O pedido

O Luan, 04/11, à tarde: *"agora a gente já tá usando o novo portal, né? Que é o nosso aqui agora para abrir os chamados
no Ingline Gestor. Só que… o envio automático tá saindo do antigo. Então a gente vai precisar corrigir isso aí. E na
verdade ele tem que ficar modular, né? Tipo, não ficar fixo. Porque se eu quiser enviar de outro painel, né? A
notificação. Então ele tem que ficar mais modular. Para eu poder enviar de qualquer painel o envio automático."*

Do 1.7 ao 2.4.4, o PDF de todo dia (a 0038) lia os **tickets do LineChat** — hoje o Legado do Helena. Os chamados novos
nascem nos painéis do Gestor desde o 2.0 (a 0047), e os Relatórios de cada painel existem desde o 2.1 (a 0055) e a Visão
geral desde o 2.2, mas o envio tinha ficado de fora (estava anotado como pendência do 2.0, e a Visão geral tinha o
aviãozinho escondido de propósito: *"o envio ainda lê o Legado"*).

## O que foi decidido

1. **Cada envio é de um painel.** Administração › Envio automático vira uma **lista de envios**. Cada envio tem:
   - a **origem**: um painel de chamados do Gestor (o Suporte, o Desenvolvimento, o Administrativo, qualquer um criado
     depois) ou o **Legado do Helena** (os tickets do LineChat, como até o 2.4.4);
   - o **horário**, os **dias** e a **lista de números**, só dele;
   - o que vai no PDF, marcado no próprio painel.

   **Um envio por painel** (o mesmo painel duas vezes é recusado: junte os números no mesmo envio). O mesmo número pode
   estar em dois envios. Os **painéis de Vendas não entram**: eles têm o relatório deles (a 0050). O painel
   **desativado** fica na lista, mas não manda: a tela e o histórico dizem por quê.

2. **A ligação com a FlwChat continua uma só**, para todos os envios: o endereço, o número que envia, o token (no cofre)
   e o **Concluir a conversa depois de mandar** (a revisão do 2.0.1). Fica num cartão à parte, embaixo dos envios. Um
   **Salvar** só, para a tela inteira (a barra aparece quando algo mudou).

3. **O PDF de um painel** é a Visão geral de **hoje** daquele painel — os números de cima (Chegaram hoje, Resolvidos
   hoje, Em aberto agora e o Prazo vencido ou o Sem responsável) e o gráfico do tempo —, os gráficos marcados, **como a
   equipe arrumou** a Visão (a ordem, a largura, pizza ou barras), e os relatórios marcados dos 25, na ordem do
   Organizar, com o **período = hoje** (o Fechamento do mês, com o mês até hoje). Os relatórios que não valem para o
   painel (a escada, num painel sem níveis) ficam fora. A tabela de baixo da Visão não vai. A mensagem leva os números de
   cima e o nome do painel; o arquivo leva a sigla (`chamados-sup-04-11-2026.pdf`), para não confundir dois no mesmo dia.

4. **O aviãozinho marca para o painel.** Aparece (para quem administra) em cada gráfico da **Visão geral** (Hoje e
   Período) e em cada um dos **25 relatórios** de cada painel, e marca para o envio daquele painel. O do Legado continua
   lá, marcando para o Legado. O Raio-X do cliente continua sem poder ir (precisa de um cliente escolhido). Guardado em
   `settings.envio-automatico-marcados`: o do Legado em cima (como antes) e o de cada painel em `paineis.<id>`. Marcar
   antes de criar o envio do painel vale: o envio, quando nascer, já leva o que estiver marcado.

5. **O que já estava configurado passou sozinho para o painel Suporte** (o que substituiu o Legado): o mesmo horário, os
   mesmos dias, os mesmos números e como foi o de hoje (para não sair duas vezes no dia da troca). O que estava marcado
   no Legado foi junto, onde tem par: cada relatório do Legado virou o novo que faz o papel dele (o Relógio, a Escada, a
   Primeira resposta, o Fechamento do mês, o Voltou com o mesmo problema…) e os gráficos do tempo, da etapa, do
   responsável, da etiqueta e o do Assunto. O que não tem par ficou de fora. O Legado continua com o que estava marcado
   lá. **Sem migração**: o guardado de antes é lido como a lista na hora e fica gravado assim na próxima gravação (a do
   relógio ou a da tela).

6. **O relógio confere cada envio**, no horário dele, um de cada vez (como antes: até 3 horas depois, 3 tentativas a cada
   15 minutos; trocar o horário vale já para hoje; salvar depois de uma falha libera 3 tentativas novas — agora de cada
   envio). O histórico (os últimos 60, de todos) e a auditoria dizem **de qual painel** saiu cada envio; os de antes do
   2.4.5 aparecem como do Legado do Helena.

7. **A página do PDF** (`/envio-diario`) abre **um envio**: a chave de uso único que o servidor gera vale só para o envio
   que está mandando; uma pessoa abre com `?envio=<id>` (o Ver como fica de cada envio). O PDF continua sendo a própria
   tela, impressa pelo Chromium do servidor.

## Por que assim

- **Uma lista, e não um seletor só.** Escolher o painel de um envio só resolveria o "está saindo do antigo", mas não o
  "se eu quiser enviar de outro painel": o Suporte e o Desenvolvimento têm leitores diferentes, em horários diferentes.
  A lista cobre os dois casos (um envio só é uma lista de um).
- **Um por painel**, porque o aviãozinho mora no painel: se o mesmo painel tivesse dois envios, a marcação teria de dizer
  de qual. Quem quer mandar o mesmo painel para mais gente põe os números no mesmo envio.
- **O Legado fica como opção**, e não some: o código existe, o envio de antes podia estar sendo usado para algo, e
  quem ainda olha os tickets do LineChat continua podendo receber.

## Onde está

- As regras, iguais no servidor e na prévia: `packages/shared/src/envio.ts` (`EnvioSchema`, `AjustesEnvioSchema` com a
  lista, `enviosDoGuardado`, `MarcadosDoPainelSchema`, `marcadosDoLegadoNoPainel`, `marcadosDoPainelComTitulo`,
  `pacoteDoPainel`, `nomeDoPdf` com a sigla).
- O servidor: `apps/api/src/services/envio.ts` (a lista, os marcados de cada origem, o pacote de cada envio, a chave
  presa ao envio, o relógio que passa por cada um) e `apps/api/src/services/atendimento/relatorios.ts` (`paraOEnvio`:
  a Visão de hoje e os 25 com o período de hoje, numa leitura só; `paineisDoEnvio`). As rotas em `routes/envio.ts`
  (`?origem=` nos marcados; `envio` no pacote, no PDF, no enviar e no testar).
- A tela: `apps/web/src/pages/admin/EnvioAutomatico.tsx` (os cartões dos envios, o Novo envio, a FlwChat, o histórico
  com o Painel), `pages/chamados/EnvioDiario.tsx` (o PDF de um painel e o do Legado), `lib/envio.tsx` (o `BotaoEnvio`
  com a origem e o `OrigemDoEnvio` dos Relatórios), a Visão geral (`pages/atendimento/relatorios/visao.tsx`, o `envio`
  da moldura) e o cartão dos 25 (`relatorios/pecas.tsx`).
- Os testes: `apps/api/test/patch245-envio-por-painel.test.ts`, o `patch17-envio.test.ts` (o Legado, na lista) e
  `apps/web/src/api/demo-envio.test.ts` (a prévia).
