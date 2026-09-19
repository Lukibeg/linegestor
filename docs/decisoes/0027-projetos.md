# 0027 — Projetos: a mesma tarefa em vários clientes, com o que já foi feito registrado

**Contexto.** De vez em quando aparece uma tarefa que não é de um cliente, é de uma lista deles:
"trocar o áudio da URA de todo mundo que tem PBX". Hoje isso vira planilha e mensagem solta — ninguém
sabe quantos faltam, quem está com o quê, nem por que aquele cliente está parado há duas semanas.

**Decisão.** Um módulo **Projetos**, no menu logo acima de Novidades, e uma aba **Projetos** na ficha
de cada cliente. O nome foi escolha do Luan (a alternativa era "Campanhas").

- **O projeto** tem nome, objetivo, prazo, responsável geral e **etapas iguais para todos** os
  clientes da lista (ex.: gravar o áudio · subir no PBX · testar · avisar). O andamento é a conta
  dessas marcas — não é alguém digitando um "%".
- **A lista é de clientes**, não de unidades: uma linha por cliente, com responsável próprio.
  (Unidade por unidade foi descartado por ora: a lista de um cliente de 10 lojas ficaria ilegível.)
- **Situação de cada linha**: pendente · em andamento · travado · concluído · **não se aplica**.
  Ela anda sozinha com as marcas (primeira etapa → em andamento; todas → concluído). "Travado" e
  "não se aplica" são escolhas de gente e o sistema não as desfaz; **travado exige o motivo escrito**,
  que aparece na linha e no painel — é o que se cobra na reunião. "Não se aplica" fecha a linha sem
  contar como trabalho feito e bloqueia a marcação, para o cliente que entrou na lista mas não
  precisa não virar pendência eterna.
- **Marcar "concluído" à mão** completa as etapas que faltavam: dizer que acabou e a tabela mostrar
  caixinhas vazias seria mentira nos números.
- **Comentários e anexos em dois níveis**: no projeto (o briefing, o roteiro) e em cada cliente (a
  evidência do que foi feito, o "liguei e pediram para voltar"). O **anexo aceita qualquer formato**
  — xlsx, docx, print, o MP3 da URA — até **10 MB**, guardado no banco como a logo do cliente, então
  entra no backup junto com o resto. Baixa sempre como arquivo (`Content-Disposition: attachment`),
  nunca aberto dentro do sistema: um HTML ou SVG anexado não pode rodar na nossa página.
- **Escolher clientes por filtro** ("quem tem LinePBX") em vez de catar um a um; quem já está na
  lista aparece marcado e travado, e reincluir não zera o que já foi feito.
- **Painel do projeto**: quanto já foi, contagem por situação (clicável, vira filtro da tabela),
  quanto falta para cada responsável e o aviso de atraso — que só aparece se o prazo passou **e**
  ainda há gente devendo. O Painel inicial ganhou um cartão com os projetos abertos.
- **Duas permissões novas**, para o Luan remanejar na tela de Papéis sem me pedir:
  `projects.work` (marcar etapas, comentar, anexar) — vai para Operador, Técnico e Administrador — e
  `projects.manage` (criar, definir etapas e lista, encerrar) — só Administrador. **Leitor enxerga
  tudo e não mexe em nada**, como no resto do sistema.

**Consequências.**

- Migração `0004_projetos.sql`: seis tabelas novas (`projects`, `project_steps`, `project_clients`,
  `project_checks`, `project_comments`, `project_attachments`) e um `UPDATE` que dá as permissões
  novas aos papéis que já existem.
- Mexer nas etapas de um projeto em andamento **reavalia todas as linhas**: etapa nova faz quem
  estava concluído voltar a "em andamento"; tirar uma etapa apaga só as marcas dela. Renomear
  (mesmo `id`) não perde nada.
- O limite de corpo do Fastify subiu de 1 MB para 30 MB — o padrão não cabia nem o CSV de
  importação, quanto mais um anexo de 10 MB (que em base64 vira ~14 MB). Quem limita cada caso
  continua sendo o schema.
- Projeto entra na lixeira como os outros registros (`project`), e tudo o que se faz nele vai para a
  auditoria com o nome do cliente ("Marcou 'Subir no PBX' de Clínica Aurora").
- A caixinha da etapa muda na hora (marca otimista) e a resposta do servidor assume o lugar depois:
  sem isso, o clique parecia não pegar enquanto a chamada voltava.
- 14 testes novos da API (81 no total) cobrem o fluxo automático da situação, travado com motivo,
  "não se aplica", mexer nas etapas com trabalho em andamento, o painel, anexos com limite de
  tamanho e quem pode o quê.

**O que ficou de fora, de propósito.** Etapas diferentes por cliente (o painel deixaria de comparar),
lista por unidade, prazo por linha e notificação de cobrança. Se fizerem falta no uso, a gente põe.
