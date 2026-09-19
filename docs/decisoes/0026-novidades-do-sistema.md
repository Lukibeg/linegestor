# 0026 — Novidades: a equipe fica sabendo o que mudou sem apresentação

**Contexto.** A cada publicação o Luan tinha de reunir a equipe (ou mandar mensagem) para contar o
que havia mudado. Ele pediu um "patch notes" dentro do próprio sistema: bonito, com imagens, que
apareça no primeiro login e pare de aparecer quando a pessoa marcar que leu.

**Decisão.** Uma seção **Novidades**, no menu logo abaixo de Inventário. Cada publicação é um
**patch**, numerado (1.2, 1.3, …) — o Luan escolheu a palavra e o número de partida.

- **Conteúdo no banco, escrito pela tela** (Administração › Novidades). Tabelas `release_notes`
  (versão, título, resumo, `published_at`), `release_note_items` (o cartão: tipo, título, texto,
  ordem), `release_note_images` (o print, como a logo do cliente) e `release_note_reads`
  (pessoa × nota). O Luan pode corrigir uma frase ou escrever um aviso dele sem depender de mim.
- **Rascunho x publicada.** A nota nasce rascunho e ninguém a vê. **Publicar** é um botão à parte
  (não um efeito de salvar), porque é ele que faz a nota abrir para todo mundo. Publicar exige ao
  menos um item.
- **Só o patch mais recente abre no login.** Quem entra pela primeira vez não leva os antigos na
  cara; os anteriores ficam na página.
- **Leitura obrigatória.** Não há "ver depois", X, Esc nem clicar fora: a janela fica trancada até a
  pessoa passar por **todos** os cartões e marcar **"Li e entendi"**. Enquanto falta cartão, a caixa
  fica desligada e o rodapé diz quantos faltam; as bolinhas dos não vistos ficam vazias. No
  "ver tudo de uma vez", chegar ao fim da lista vale por ter passado pelos cartões.
- **Uma pasta por patch na página.** O histórico não é uma parede de texto: cada patch é uma pasta
  fechada com o número, o título e quantas novidades traz; abrir mostra os itens. A mais recente já
  vem aberta.
- **Cartões, um por vez**, com rótulo **Novo · Melhorou · Corrigido · Atenção** ("Atenção" é
  mudança de regra: muda o jeito de trabalhar), título, duas ou três linhas e um print. Tem
  "ver tudo de uma vez" para quem prefere rolar, e bolinhas para pular direto a um item.
- **Quem leu fica registrado** e aparece como "4 de 6" na Administração, com a lista de quem falta
  — para saber quem avisar sem perguntar a ninguém. A leitura também vai para a auditoria.
- **A nota de cada patch chega pronta.** Eu escrevo em `docs/novidades/<numero>.md` (cabeçalho com
  versão/título/resumo e um `## tipo · título` por item, com `![](pasta/print.jpg)`), e o contêiner
  roda `pnpm novidades:importar` na partida, logo depois das migrações. Versão que já existe é
  ignorada, então publicar duas vezes não duplica nada; se a importação falhar, **o sistema sobe
  assim mesmo** (uma nota nunca pode derrubar o sistema).
- **A prévia publicada** mostra a mesma nota: `scripts/gerar-novidades-demo.mjs` gera
  `apps/web/src/api/novidades-demo.ts` a partir do mesmo arquivo, com os prints embutidos.
- **Permissões**: qualquer pessoa logada lê e marca como lida (inclusive o Leitor); escrever,
  publicar e ver quem leu exige `admin.manage`. Nenhuma permissão nova foi criada.

**Consequências.**

- Migração `0003_novidades.sql`: quatro tabelas novas, nenhuma coluna mexida.
- A lixeira passa a aceitar notas (`releaseNote`), como os outros registros.
- `Modal`: o rodapé agora quebra linha — com "Ver depois + Anterior + Próxima" não cabia no celular.
- `CampoLogo` ganhou `maxPx`: a logo do cliente continua em 512px, o print da novidade vai a 1280px.
- Ao entrar e ao sair, o cache da tela é limpo: sem isso, quem entrava depois herdava as respostas
  de quem saiu (e a nota "já lida" pelo outro não abria).
- Corrigido de quebra: no Painel, a tabela de ocupação dos circuitos empurrava a página para o lado
  no celular (faltava `grid-cols-1` + `overflow-x-auto`).
- 9 testes novos da API (67 no total) cobrem rascunho, publicação, "só a mais recente abre",
  "Li e entendi", quem leu, permissões e a leitura do arquivo da nota.

**Depois (mesma publicação).** O Luan pediu três ajustes antes de publicar: a palavra **patch** no
lugar de "rodada" (começando em **1.2**), uma **pasta por patch** no histórico e **leitura
obrigatória** — sem "Ver depois". Os três entraram acima. Como o número agora é "1.2", a ordem de
importação passou a comparar número a número (`compararVersoes`), senão "1.10" entraria antes de
"1.2" e o patch errado abriria no login.
