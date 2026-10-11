# 0046 — O patch abre no login com o vídeo; os cartões ficam na página Novidades

**Contexto.** Em 10/10, com o 1.9 na prévia, o Luan pediu um vídeo simples mostrando as mudanças do
patch. Gostou e pediu: *"vamos usar isso ao invés dos textos quando o pessoal logar, porém os textos
vão estar disponíveis na aba de atualizações"*. Como o 1.9 ainda não subiu, entrou nele.

Isto **revê a decisão 0026** na parte "leitura obrigatória": lá, a janela do login só saía depois de
a pessoa passar por **todos os cartões** e marcar "Li e entendi", para ninguém pular uma mudança. O
Luan foi avisado antes, com o motivo; a obrigação continua, só que pelo vídeo.

**Decisão.**

- **A nota pode ter um vídeo.** Com vídeo, a janela do login mostra **o vídeo no lugar dos cartões**
  (o título do patch em cima; o resumo e os cartões, não). Sem vídeo, tudo como antes (0026).
- **Continua obrigatório.** Sem X, sem Esc, sem "ver depois". O **"Assisti e entendi"** só liga
  quando a pessoa **viu o vídeo até o fim**: os trechos que tocaram de verdade (o `played` do
  navegador) cobrem o vídeo inteiro, com 2 segundos de folga. **Arrastar a barra até o fim não
  vale** (o pedaço pulado não tocou); voltar, rever e acelerar podem. Embaixo do vídeo, o aviso diz
  quanto falta ("falta assistir 1:05 do vídeo"). As contas (`faltaAssistir`, `assistiuTudo`,
  `tempoDoVideo`) ficam em `@gestor/shared/novidades.ts`, as mesmas no sistema e na prévia.
- **Ninguém fica preso.** Se o vídeo não abrir no aparelho (formato que ele não toca, a internet
  caiu no meio), a janela passa sozinha para os cartões, com a leitura obrigatória de antes e o
  aviso "O vídeo do patch não abriu neste aparelho". E o link **"O vídeo não abre? Ler em texto"**
  faz o mesmo, com **"voltar ao vídeo"**. Quem já viu até o fim continua liberado se for ao texto e
  voltar.
- **Os textos ficam em Novidades.** Na página, a pasta do patch mostra o vídeo em cima e os cartões
  (o texto e o print de cada mudança) embaixo; o cabeçalho da pasta diz "com vídeo". Marcar como
  lida pela página continua valendo.
- **Fica registrado como foi.** Quem conclui pelo vídeo aparece na auditoria como "Fulano **assistiu
  ao vídeo** das novidades de 1.9" (pelos cartões, "leu as novidades", como antes). O "quem leu" da
  Administração conta os dois.
- **O Luan sobe e troca o vídeo sem depender de mim.** Em Administração › Novidades, o formulário do
  patch ganhou **Vídeo do patch (opcional)**: subir (MP4, o melhor; WebM ou MOV; até 300 MB, como os
  do portal), ver, **Trocar** e **Tirar**. O vídeo sobe na hora, com a barra, mas só vale ao
  **Salvar** (Cancelar não muda nada). A lista mostra a marca "vídeo" no patch que tem.
- **Onde o vídeo mora.** Em disco, como os vídeos do portal: `PORTAL_DIR/novidades` (no servidor,
  `/portal/novidades`, no volume `portal`), servido com Range (o Safari do iPhone só toca assim).
  **Fora do backup diário do banco** — o original do vídeo de cada patch fica em `docs/novidades/`;
  o que o Luan subir pela tela, guardar o original. Trocar ou tirar só tira da nota (`deleted_at`):
  o arquivo fica (nada se apaga de verdade). Quem vê: o da nota publicada, qualquer pessoa logada;
  o de rascunho e o que acabou de subir, só quem edita as novidades (`admin.manage`).
- **A nota de cada patch chega com o vídeo.** `docs/novidades/<v>.md` ganhou o campo **`video:`** no
  cabeçalho (`video: 1.9/o-que-mudou.mp4`), ao lado dos prints. A importação da partida copia o
  vídeo para o disco antes de criar a nota; se o arquivo não estiver lá, a nota não entra e o erro
  avisa (o sistema sobe assim mesmo, como na 0026). Na prévia, o vídeo vai como arquivo (o Vite
  copia para `assets/`), não embutido.
- **O vídeo do 1.9** é o que o Luan aprovou, com a capa e o fim falando com a equipe: "Patch 1.9 —
  o que mudou · as mudanças em 2 minutos, com dados de exemplo" e, no fim, "Os detalhes estão em
  Novidades". Gravado na prévia (dados de exemplo), 2:08, 4,1 MB, com
  `scripts/gravar-video-do-patch.py` — o roteiro do 1.9 fica lá como exemplo: **a cada patch, o
  vídeo novo sai do mesmo script, com o roteiro do patch** (uns 2 minutos, sem som, uma legenda
  numerada por mudança, a capa e o fim falando com a equipe).

**Consequências.**

- Migração `0014_novidades_video`: tabela nova `release_note_videos` (a nota, o nome, o tipo, o
  tamanho, o arquivo em disco, quem subiu, quando saiu; no máximo um vídeo valendo por nota). Roda
  sozinha no `publicar.sh`.
- Rotas: `POST /api/release-notes/videos` (subir; `admin.manage`) e `GET
  /api/release-notes/videos/:id` (com Range). Gravar a nota aceita `videoId` (ausente = mantém,
  `null` = tira, o id = o que acabou de subir). A nota da lista e a que abre no login trazem
  `video`. `POST /api/release-notes/:id/read` aceita `{ assistiu: true }` (vai para a auditoria).
- O envio do vídeo para o disco (escreve `.parte` e renomeia no fim) passou a ser um só para o
  portal e para as novidades (`services/videoEmDisco.ts`), e o "mandar com Range" também
  (`mandarVideo`).
- Testes: `apps/api/test/patch19-novidades-video.test.ts` (subir, pôr na nota, quem vê, Range,
  trocar e tirar sem apagar, vídeo de outra nota, a auditoria, a nota que vem pronta com o vídeo) e,
  no shared, `novidades.test.ts` (pular para o fim não vale, rever não conta duas vezes, a folga).
- **Ficou de fora, para quando ele pedir**: legenda em texto (o vídeo do 1.9 não tem som — as
  legendas estão na imagem), contar até onde cada pessoa assistiu (hoje fica só o "assistiu"), e o
  vídeo em mais de uma língua.
