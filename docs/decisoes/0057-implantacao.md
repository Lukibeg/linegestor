# 0057 — A implantação: o card que a negociação abre, as partes da ficha e o Implantado que liga no cadastro

**Data:** 28/10/2026 · **Patch:** 2.3 · **Situação:** aceita

## O pedido

O Luan, 28/10, mostrando o painel Ingline - Ativações do Helena (o card IA-82): *"Para administrar as ativações, eu usava
um painel só para isso … eu criei dois grupos de campos personalizados … um é para o line chat e outro para o line PBX.
Nesses campos eu já tramitava toda a curadoria do cliente … lista de números, de usuários, estrutura chatbot, horário de
atendimento, acesso a BM … os passos de configuração de ambiente para a equipe técnica já colocar o que ela já fez … e
também um campo personalizado para … o teste, onde a equipe de suporte já fazia os testes"*.

E, sobre o Comercial: *"tem que ser quando mover para a parte de em processo de implantação, porque eu só marco como
ganho de fato quando eu começar a faturar para o relatório ficar certinho"*; *"já tenho que abrir o card no painel de
implantação e já tenho que também que criar o cliente … automaticamente com os produtos"*; e *"No Validado, os módulos
marcados viram os módulos ativos na ficha do cliente, com a data"*. Por fim: *"vamos fazer o caminho completo"* e *"n
precisa limitar nada disso"*. Depois, olhando a prévia: *"tem q ter uma parte de concluído depois de testes afirmando que
todos os testes foram concluídos e a ultima tem q ser 'implantado' indicando que o cliente já está ativo"* e *"o painel do
comercial tem q ter uma fase antes do ganho, implantado, que vai mover de em processo de implantação para implantado quando
a gente concluir a implantação no painel de implantação"*.

## O que foi decidido

1. **Um painel de Gestão para a implantação, com um card por cliente** — não um módulo à parte. O card é um chamado:
   tem quadro, ficha, responsável, observadores, anotações, histórico e relatórios, como os outros. O painel nasce do
   **modelo Implantação** (Painéis › Ajustes › Novo painel): as etapas Stand By, Curadoria (a entrada), Configuração,
   Testes, Concluído (os testes acabaram: o tipo Resolvido) e Implantado (o cliente ativo: o tipo Fechado, que liga no
   cadastro); sem prazo, sem prioridade, sem assunto, tipo, gravidade, alcance, operadora, relato, solução e tempo
   gasto (o Tempo gasto virou um campo do sistema que cada painel liga e desliga: "n precisa disso", no card); e os
   campos do Ingline - Ativações, arrumados em três partes, com o LineChat ganhando os testes que lá não tinha (19 campos:
   sem o CRM usado, 29/10: *"n precisa disso n"*; com a Ativação dos módulos, item 11).
2. **Os campos ganham a parte e o produto** (`ticket_fields.section`, `ticket_fields.product_id`, migração 0027):
   - com a **parte**, o campo sai da classificação e vai para o meio da ficha, num cartão por parte, com um bloco por
     produto do card e a conta "N de M" (o cartão do quadro mostra a conta da parte que tem o nome da etapa);
   - com o **produto**, o campo só aparece no card que tem o produto. O mesmo nome pode existir em produtos diferentes
     (o Horário de atendimento do LineChat e o do LinePBX); fora da ficha (o histórico, a auditoria) o nome vem com o
     produto entre parênteses.
3. **Dois tipos de campo novos:**
   - **Caixinhas**: a lista do que já foi feito; cada caixinha marcada guarda **quem marcou e quando**
     (`tickets.field_marks`). Desmarcar tira a marca; a que continua marcada fica com quem marcou primeiro.
   - **Módulos do produto**: as caixinhas são os módulos do catálogo (Administração › Produtos) do produto escolhido,
     que não muda depois de criado. O módulo que vai para a lixeira fica desativado (quem já o marcou continua com ele).
     Não entram na conta da parte (é a escolha do que o cliente vai usar, não uma tarefa).
4. **A etapa de Vendas que abre a implantação** (`ticket_stages.opens_panel_id`): escolhida em cada etapa do funil (não
   no Ganho nem no Perdido), apontando para um painel de Gestão. A negociação que chega nela:
   - vira cliente, se ainda não é: o cliente da negociação; senão, o do cadastro com o CNPJ (o da janela ou o campo
     CNPJ da negociação); senão, um **cliente novo**, com a unidade Matriz — e para criar é preciso o **CNPJ** (o
     cadastro exige). É a única coisa que trava: sem ele, a janela pede. O CNPJ de um cliente que está na lixeira não
     cria outro (o CNPJ não repete): a janela diz para restaurar;
   - passa a ser do cliente (o "Virou cliente?" de uma vez; o título que era o nome da empresa acompanha);
   - põe no cadastro do cliente os produtos que ele não tem, **sem a data de ativação** (estão em implantação);
   - abre o card na entrada do painel da implantação ("Implantação — Cliente", origem **Aberta pelo Comercial**), com o
     contato, os produtos e quem cuida da negociação (e quem a observa) como observadores, ligado à negociação
     (`tickets.source_ticket_id`, um card por negociação fora da lixeira: voltar e ir de novo não abre outro).
   O **Ganho continua à parte**, marcado quando começa a faturar — o Relatório de Vendas fica certo.
5. **A etapa de Gestão que liga no cadastro** (`ticket_stages.activates_products`, o Implantado): o card que chega nela
   dá a data de hoje aos produtos que estavam sem data, põe ativo o que o cliente não tinha (o Equipamentos, que não tem
   data de ativação, entra sem ela — decisão 0034) e liga, desde hoje, os módulos marcados nos campos Módulos do produto.
   O produto encerrado fica como está (reativar é na ficha do cliente). O que já estava em dia não muda nada.
6. **A negociação vai para o Implantado do Comercial** (`ticket_stages.receives_implementation`, uma etapa por painel de
   Vendas, fora do Ganho e do Perdido): quando o card chega no Implantado, a negociação de onde ele veio vai sozinha para a
   etapa do painel dela que recebe a implantação terminada ("Implantado", antes do Ganho), sem as regras de entrar na
   etapa — quem moveu foi o card. O histórico da negociação diz "a implantação IMP-3 terminou"; o do card, "a negociação
   COM-12 foi para Implantado". A negociação que já está no Ganho ou no Perdido fica onde está.
7. **A janela mostra antes o que vai acontecer** (`GET /atendimento/chamados/:id/ao-mover`): o cliente, os produtos e o
   card (na negociação), ou o que fica ativo no cadastro e a negociação que vai junto (no Implantado). A negociação que já abriu o card e o
   Implantado
   que não muda nada vão direto, sem janela. Fora isso, nada trava: a regra de sair da entrada com um responsável (2.2)
   continua valendo na Curadoria, e a própria janela pergunta quem fica com o card.
8. **O CNPJ da janela sem o dígito verificador** (29/10, no card: *"n quero mais q verifique os números, vc dizer que o
   cnpj n confere"*): para criar o cliente pela implantação, a janela pede só os 14 números (que entram no formato
   enquanto se digita) e que não sejam de um cliente da lixeira. Em Clientes › Novo cliente, a conferência continua; em
   Editar, o CNPJ é conferido só quando muda (o cliente criado pela implantação edita o resto sem travar).
9. **As caixinhas em pastas** (29/10: *"eu quero poder fazer como se fosse pastas das configurações, por exemplo
   configurações do servidor, configuirações do asterisk, do linepbx web, dos módulos, e eu tenho que poder criar e editar
   facilmente"*): cada caixinha pode ter a pasta (`pasta`, guardada nas opções do campo, `ticket_fields.options`); a
   ficha junta por pasta, com a conta de cada uma. O modelo traz a Configuração do LinePBX em Servidor, Asterisk,
   LinePBX Web, Módulos e Telefones (os nomes sem o "Asterisk - " na frente). Quem cuida dos chamados muda as caixinhas e
   as pastas no próprio card (**Editar as caixinhas**, `PUT /atendimento/campos/:id/caixinhas`, só as opções: o resto do
   campo não muda) ou em Painéis › Ajustes › Campos; vale para todos os cards do painel, e a caixinha que um card marcou
   fica desativada, com ele.
10. **Anexar nos campos** (29/10: *"em todas as opções eu quero poder anexar imagens ou docs que vão ter pré
   visualização"* e, depois, *"no caso eu quis dizer todas as opções de curadoria, de configuração n precisa n"*): o campo
   ganha o **Recebe anexos** (`ticket_fields.accepts_attachments`, na migração 0027), ligado no modelo Implantação nos
   campos da Curadoria (menos a escolha dos módulos) e desligado nos outros; o servidor recusa o anexo no campo que não
   recebe. O anexo ganha o campo e a caixinha (`ticket_attachments.field_id` e `option_id`, na migração
   0027); `POST /atendimento/chamados/:id/campos/:campoId/anexos` (até 5 arquivos de 10 MB por vez, até 20 em cada campo
   ou caixinha) e `DELETE /atendimento/chamados/:id/anexos/:anexoId` (quem anexou ou quem cuida). A imagem em miniatura,
   o PDF no leitor do Gestor, o Word e o Excel com o nome e o ícone (baixam). O histórico diz "anexou print.png em
   Lista de ramais (LinePBX)" e "tirou …". Qualquer campo de qualquer painel pode receber (não os do sistema, como o
   Assunto). Nos campos de caixinhas (e de módulos) que recebem, o anexo vai na caixinha: o campo todo não tem o Anexar
   (29/10, no card: *"nas configurações n precisa de ter anexar"*). O que já foi anexado num campo que deixou de receber
   continua aparecendo.
11. **Os módulos: a Curadoria escolhe, a Configuração ativa** (29/10, no card: *"esse módulos a ativar tem q ser na
   curadoria … é a curadoria que define quais módulos devem ser ativos, aqui é só um checklist do que foi solicitado na
   curadoria"*): o Módulos a ativar foi para a Curadoria (a escolha: não entra na conta da parte); na Configuração, a
   **Ativação dos módulos** é um campo de módulos que segue o da escolha (`escolhidosEm`, `ticket_fields.follows_field_id`,
   na migração 0027): só os módulos escolhidos aparecem nele, e eles entram na conta da Configuração. No Implantado, o
   que liga no cadastro é a escolha da Curadoria; o escolhido que o checklist ainda não marcou vira um aviso na janela
   (nada trava). O checklist segue um campo de módulos do mesmo painel e do mesmo produto que seja a escolha (não outro
   checklist); em Painéis › Ajustes › Campos, **Os módulos que aparecem** › **Só os marcados em …**.
12. **O Painel da Implantação no menu Suporte** (29/10: *"eu quero q o painel de implantação tenha um botão dentro do menu
   suporte como o painel do suporte"*): Suporte › Painel da Implantação (`/suporte/implantacao`), logo abaixo do Painel
   do Suporte, abre o quadro do painel da implantação — o de Gestão que a etapa do Comercial abre; sem ela, o de Gestão
   com a etapa que liga no cadastro. Na tela dele (o quadro, a lista, a ficha IMP-…), o item fica marcado. Sem um painel
   assim que a pessoa veja, a tela diz como criar.
13. **Os Detalhes da proposta** (29/10, mostrando os campos da negociação: *"tem esses pontos aqui que vieram do helena
   eles são importantes, quero que eles fiquem … só pra eles, chamado detalhes da proposta, e … no painel principal"*):
   o campo que o Trazer do Helena cria num painel de Vendas ganha a parte **Detalhes da proposta** (vai para o meio da
   ficha, num cartão); os que já vieram antes vão para lá na migração 0028 (os de explicação "Trazido do Helena.", em
   painel de Vendas, ainda sem parte). Num cartão de parte, os campos curtos seguidos (os números, os textos curtos, as
   datas) ficam lado a lado. Tirar ou pôr um campo no cartão: Painéis › Ajustes › Campos › Parte da ficha.
14. **Os Contatos principais saem do Comercial** (29/10, no card: *"já tem essa parte de contatos na lateral, ent n
   precisa dessa"*, e, depois do aviso de que desfazia a decisão 0050, *"pode fazer"*): o painel de Vendas novo nasce sem
   ele (`CAMPOS_DO_PAINEL_DE_VENDAS`); o que já existe fica desativado na migração 0028 (o que foi escrito continua
   guardado e volta se o campo for ligado de novo) e deixa de ser pedido para abrir e nas etapas. O Trazer do Helena não
   o cria mais num painel de Vendas (o contato é o da lateral); no painel que ainda o tem, desativado, continua levando o
   que vem de lá. O cargo de cada um, quando importa, vai no Sobre a negociação.
15. **O histórico e a auditoria contam tudo**: na negociação, "abriu a implantação IMP-3 … (criou o cliente X; LinePBX no
   cadastro)"; no card, "veio da negociação COM-12"; no Implantado, "ligou no cadastro de X o produto … e os módulos …,
   desde …"; a auditoria ganha as linhas do cliente criado, do card aberto e do que ligou no cadastro.

## Por que assim

- O card como chamado reaproveita tudo o que o 2.0 a 2.2 construíram (o quadro, a ficha, os avisos, os relatórios) e
  não cria uma segunda tela para aprender.
- A parte e o produto no campo resolvem os dois grupos do Helena sem um "grupo de campos" novo: o mesmo painel serve
  para o cliente que leva só o LineChat, só o LinePBX ou os dois.
- O cliente nasce na hora certa (quando a implantação começa), e não no Ganho, que o Luan marca quando fatura.
- A data de ativação vem do Implantado — o dia em que o cliente passou a usar —, e não do dia da venda.

## Fica para depois

- Os módulos que faltam no catálogo de verdade para o LinePBX (Callback, WebRTC, NPS - WhatsApp e Filas - Dashboard): o
  Luan inclui em Administração › Produtos, e o campo Módulos a ativar acompanha sozinho.
- Trazer os cards antigos do Ingline - Ativações pelo Trazer do Helena (os campos do Helena não têm a parte nem o produto).
