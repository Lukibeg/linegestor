# 0039 — Base de conhecimento

**Contexto.** Em 06/10 o Luan pediu um módulo de base de conhecimento: "alguém faz alguma ação que
ninguém sabia", ou resolve "um chamado muito doido que ninguém nunca viu", e isso precisa ficar
registrado. Sem um norte, pediu sugestões de escopo. A proposta (`claude/base-conhecimento-proposta.md`
no projeto) virou uma página de escolhas, e ele marcou: **agora** — o artigo, a busca, as ligações, o
"registrar a partir do chamado", a base aparecendo onde a pessoa trabalha (fichas, modelo, circuito),
o livrinho na tabela de Chamados, a IA (perguntar à base e o rascunho a partir do card), a leitura
obrigatória, as versões e o "como fazer" do projeto; **depois** — o "conferido em" e as trilhas;
**não** — o aviso automático de senha no texto, os candidatos a artigo, o "citado em", o "falta
artigo", o "ajudou?", as buscas sem resultado e o "isso funcionou". Nas decisões, a opção "a" em
todas: **todo mundo menos o Leitor escreve**, **quem escreve publica direto**, **qualquer um que
escreve melhora o artigo de qualquer pessoa** e **texto simples** (passos, comandos e prints). Ele
também pediu, à parte, um **portal para o cliente** (tutoriais por produto, com link para mandar ao
cliente) — fica para um módulo separado, com proposta própria.

A IA (perguntar à base e o rascunho a partir do card) chegou a ser construída, mas em 07/10, vendo a
prévia, o Luan disse "não acho muito necessário a questão da IA" e ela saiu. No mesmo dia ele
comentou na prévia mais três coisas, que entraram no 1.8: **marcar a leitura obrigatória já no
formulário**, "na hora de realizar", **comentar nos artigos, ficando registrado**, e **um botão para
ver a base em lista (o padrão) ou em Kanban**. Em 08/10 ele pediu **a IA de volta** e perguntou se
daria para usar outros provedores: voltou no 1.8, com o provedor que a empresa escolher (ver o fim
desta decisão).

**Decisão.**

- **O artigo** segue o jeito KCS: **O que acontece** (como o cliente conta), **Como resolver** (os
  passos), **Por que acontece** e as **Palavras do cliente** (outros jeitos de dizer, para a busca
  achar). Cada artigo tem um código **BC-n** (número sequencial: uma criação que falha pode pular um
  número). "BC-12" escrito no texto vira link.
- **Quem faz o quê**: ler é `records.read` (todo mundo). Escrever é a permissão nova
  `knowledge.write` (Operador, Técnico e Administrador). Cuidar da base é `knowledge.manage`
  (Administrador): pedir a leitura obrigatória, ver o rascunho de todos e mandar para a lixeira o
  artigo de outra pessoa. A migração 0009 dá as duas permissões aos papéis que já existem.
- **Rascunho e publicado**: o rascunho só aparece para quem escreveu e para quem cuida da base; só
  o título é obrigatório. **Publicar exige o "Como resolver"**. Publicado continua publicado: corrige-se
  editando; para tirar da equipe, a lixeira.
- **Texto simples**, sem editor de formatação: linha com número vira passo; linha entre crases (ou
  entre ``` e ```) vira comando com botão **Copiar**; `[print:id]` numa linha sozinha vira a
  imagem; "-" vira item. O print entra **colando a imagem** (Ctrl+V) ou pelo botão: o navegador
  reduz (até 1280 px; JPEG quando o PNG fica pesado) e manda junto; o servidor grava e troca o
  marcador provisório pelo id. No meio do texto **só imagem PNG, JPG, WEBP ou GIF** (nunca SVG, que
  roda código); os outros arquivos vão em **Anexos** (até 10 MB) e **baixam sempre como arquivo**.
  Tudo isso mora em `@gestor/shared/base.ts`, usado pelo servidor, pela tela e pela prévia.
- **Ligações**: produto, módulo, assunto (o **nome da opção** do campo Assunto do LineChat — o mesmo
  dos Relatórios), cliente, modelo, operadora, projeto e chamado (o id do card; aceita o código
  IS-3607 ao gravar). O servidor confere que cada uma existe. São elas que levam o artigo às outras
  telas: a **ficha do cliente**, o **pop-up do modelo**, a **ficha do circuito** (pela operadora) e o
  **"Como fazer" do projeto** (que também liga um artigo existente sem mexer no texto, e tem o
  "Registrar o que aprendemos", em destaque no projeto encerrado). Sem artigo, nada aparece.
- **O livrinho na tabela de Chamados** (e na janela dos Relatórios): os artigos publicados ligados ao
  próprio card, ao **assunto** dele e ao **cliente** dele (a opção Cliente do card ligada ao cadastro
  como nos Relatórios). O **produto fica de fora**: com quase todo chamado sendo de LinePBX, o livrinho
  acenderia em tudo e deixaria de dizer alguma coisa. Uma consulta só para a página inteira.
- **Registrar a partir do chamado**: "Veio de um chamado?" traz o título, a descrição e as ligações
  (chamado, assunto, cliente e o produto de mesmo nome). O Gestor **só lê** o card — nada é escrito no
  LineChat.
- **Lista ou Kanban** (pedido do Luan, 07/10): o mesmo resultado (busca, abas e filtros) em lista
  ou num quadro com uma coluna por produto (o módulo conta para o produto; a ordem é a do catálogo),
  assunto do LineChat, situação (rascunho · publicado · leitura obrigatória) ou autor. O artigo de
  dois produtos (ou dois assuntos) aparece nas duas colunas, e o quadro avisa. Só se vê: nada se
  arrasta (a situação muda pelo artigo, como antes). No Kanban vêm todos os artigos de uma vez; a
  escolha fica no endereço (o Voltar devolve) e no navegador de cada um.
- **A busca** não liga para acento nem maiúscula, acha pedaço de palavra e pesa onde achou (título 6,
  palavras do cliente 5, nomes ligados 3, o que acontece 3, como resolver 2, por que 2, e um bônus
  para a frase inteira); o código BC-12 acha só aquele artigo. **Todas as palavras** precisam
  aparecer. O trecho achado vem com as palavras em destaque. A busca é feita em memória, com as
  funções de `@gestor/shared/base.ts` (as mesmas da prévia): para uma base de centenas de artigos
  sobra; se passar de milhares, rever.
- **Versões**: toda mudança no texto grava uma versão (quem, quando); o Histórico mostra o que saiu e
  o que entrou, linha a linha; **voltar a uma versão grava uma versão nova** (nada se perde). Como
  qualquer um melhora o artigo de qualquer um, a tela manda a versão que abriu: **se outra pessoa
  salvou no meio, o servidor recusa** ("Fulano salvou este artigo enquanto você editava…") em vez de
  passar por cima.
- **Leitura obrigatória**: quem cuida da base pede; cada pessoa vê o artigo em destaque na base e
  um número no menu até marcar "Li e entendi". **Vale a leitura feita depois do pedido**: pedir de
  novo (o artigo mudou) pede a leitura de todos outra vez. Quem cuida vê quem leu e quem falta (só as
  pessoas ativas). Não abre sozinho no login, como a nota do patch. **Pede-se no próprio formulário**
  (pedido do Luan, 07/10): a caixa "Pedir a leitura da equipe" (só para quem cuida da base) vai junto
  com o publicar (`pedirLeitura`); no rascunho não vale; num artigo que já era obrigatório, é o
  "pedir de novo" ao salvar — sem criar versão, porque o texto não mudou. O botão do artigo continua.
- **Comentários** (pedido do Luan, 07/10: "fazer comentários nos artigos e ficar registrado"): quem
  escreve (`knowledge.write`) comenta embaixo do artigo; quem só lê vê os comentários. Fica quem e
  quando; o texto do artigo não muda (corrigir é o Editar, que vira versão). Apagar é o seu (ou
  qualquer um, para quem cuida da base): só marca `deleted_at`, e a auditoria guarda o texto apagado
  (`before`). Como os comentários dos projetos, não vão para a Lixeira. A lista mostra quantos há.
- **Lixeira e auditoria**: o artigo vai para a lixeira (quem escreveu, ou quem cuida da base) e volta
  por Administração › Lixeira. Toda escrita vai para a auditoria (`entityType = knowledge`).

**Consequências.**

- Tabelas novas (`0009_base_de_conhecimento.sql`): `knowledge_articles`, `knowledge_versions`,
  `knowledge_links`, `knowledge_attachments` (o arquivo fica no banco, em base64, como os anexos dos
  projetos), `knowledge_reads` e `knowledge_comments` (esta entrou em 07/10; a migração, ainda não
  publicada, foi refeita).
- Rotas novas em `/api/base` (lista, opções, artigo, gravar, ligar, versões, comparar, voltar,
  leitura obrigatória, lidos, pendentes, ligados, para-chamados, do-chamado, anexos, comentários e
  `/ia/*`). Testes: `packages/shared/src/base.test.ts`, `packages/shared/src/ia.test.ts` e
  `apps/api/test/base.test.ts`.
- Telas novas: `/base`, `/base/novo`, `/base/:numero` e `/base/:numero/editar`. O **menu lateral
  ficou 16 px mais largo** para "Base de conhecimento" e o número de leituras caberem numa linha. O
  `Popover` ganhou o jeito do botão e o lado de abrir (`classe`, `alinhar`), e o texto dele quebra
  linha mesmo dentro de uma célula "sem quebra".
- A prévia tem dez artigos de exemplo (com prints desenhados, versões, leitura obrigatória, dois
  rascunhos, um ligado ao projeto do feriado e três comentários).
- Ficou para depois: o "conferido em" (artigo velho pede revisão) e as trilhas de leitura. O portal
  do cliente é outro módulo.

**A IA: saiu em 07/10 e voltou em 08/10, com o provedor que a empresa escolher.** A primeira versão
(o commit `bc28a1c`, branch `base-com-ia-1.8`) falava só com a Anthropic e usava recursos que só ela
tem (a ferramenta de busca e as citações da própria API). Quando o Luan a pediu de volta, perguntou
"vou poder usar com outros provedores?" e escolheu **os quatro**: Anthropic (Claude), OpenAI
(ChatGPT), Google (Gemini) e **outro compatível** com a OpenAI (OpenRouter, DeepSeek, Groq, Mistral,
Maritaca, xAI…), e **na Base, como antes** (não no portal do cliente). Então a IA foi refeita para
valer com todos:

- **Onde**: o **Perguntar à IA** ao lado da busca (o mesmo texto; Ctrl+Enter) e o **Escrever o
  rascunho com a IA** em "Veio de um chamado?" (preenche o que vier, com **Desfazer**; onde faltou
  informação, ela escreve `[completar: …]`). Os dois só aparecem com a IA ligada; perguntar é de todo
  mundo (`records.read`), o rascunho é de quem escreve (`knowledge.write`).
- **A busca é a do Gestor**, não da IA: numa 1ª conversa a IA sugere de 3 a 8 palavras (o jeito do
  cliente e o nome técnico, em JSON); a busca da tela, no modo "alguma palavra" (`buscarArtigos(…,
  'alguma')`), procura a pergunta e cada palavra, os pontos se somam e **os 6 melhores** vão para a
  2ª conversa, cada um com o código (`[BC-12] Título` e as partes, em texto puro). Ela responde em
  texto simples, citando **`[BC-12]`** depois de cada frase ou passo. O Gestor lê linha a linha e
  **só aceita citação de artigo que foi para ela** (o resto some do texto); aceita `[BC-3, BC-7]`,
  `(BC-3)` e o código solto na frase, e limpa o markdown e o "pensamento" (`<think>`) que alguns
  modelos mandam. **Não achou artigo nenhum? Diz isso sem a 2ª conversa.** Vão só os **publicados**:
  rascunho e lixeira nunca saem do servidor. As regras ficam em `@gestor/shared/ia.ts` (as mesmas da
  prévia); a conversa com cada API, em `apps/api/src/services/baseIa.ts`, sem biblioteca — um POST
  com a chave no cabeçalho (Anthropic: `/v1/messages`; OpenAI e compatíveis: `/chat/completions`;
  Google: `:generateContent`).
- **Administração › Ajustes › IA da base** (`admin.manage`): o **provedor**; o **endereço da API**
  no compatível (só `https://` e nome da internet — nada de localhost, IP solto ou `.local` —, com
  atalhos para os conhecidos; quem cola o `…/chat/completions` inteiro tem o endereço arrumado); a
  **chave**, que vai para o **cofre** e nunca volta, **presa ao provedor e, no compatível, ao nome do
  serviço** (`chaveDe` e `chaveEndereco`): trocar de provedor, ou o endereço para outro serviço, pede a
  chave do novo — "A chave guardada é da Anthropic. Cole a chave da OpenAI…" —, e a chave de um nunca
  vai para outro, nem na busca de modelos; o
  **modelo**, escrito ou escolhido em **Buscar modelos** (a lista vem da API do provedor, com a chave
  digitada ou a guardada, só com os modelos de conversa; serviço que não lista, como a Maritaca, é
  escrever o nome); o **preço** (opcional, dólar por milhão de tokens); **Testar agora** (uma
  pergunta de uma palavra com o que está guardado). Trocar o provedor, o modelo ou o endereço apaga o
  último teste. A IA começa **desligada**.
- **Custo**: o Gestor **não guarda tabela de preços** (são muitos provedores e os preços mudam). O
  mês soma os usos e os tokens (lidos e escritos, contando o "pensamento" dos modelos que pensam), e
  o custo em dólar só aparece com o preço informado — no cartão de Ajustes e embaixo de cada
  resposta. O uso do mês é gravado com a linha travada (dois usos ao mesmo tempo somam os dois, e o
  que a administração salvou no meio não é atropelado).
- **O compatível só fala com a internet**: além do `https://` e do nome (nada de localhost, IP solto,
  `.local`, nem com o ponto no fim), o servidor confere **para onde o nome aponta** antes de cada
  pedido (nome que aponta para a rede de dentro é recusado) e **não segue redirecionamento** (que
  levaria a chave e os artigos para outro lugar). Isso foi apontado por uma revisão independente do
  código antes de subir, junto com: a pergunta sem palavra que conte ("???") não manda artigo
  nenhum; a limpeza da resposta não mexe em `**201` nem em nada entre crases; o "passou da cota" por
  minuto do Google é limite, não falta de crédito; a pergunta conta no mês mesmo quando o serviço não
  diz os tokens; o teste usa o mesmo limite de tokens das respostas.
- **Limites**: **30 usos por pessoa por hora** e 10 pedidos por minuto em cada rota. O limite de
  tokens de cada conversa é folgado (os modelos que pensam gastam parte dele pensando; só se paga o
  que se usa); nos compatíveis, 4.096, porque há serviço que recusa mais.
- **Erros em português**, sem jargão e **sem a chave** (alguns provedores repetem um pedaço dela):
  chave recusada, sem crédito ou cota, modelo (ou endereço) não reconhecido, limite de pedidos,
  provedor fora do ar, demorou demais, endereço que não existe.
- **Auditoria**: `base_ia_pergunta` (a pergunta e os artigos citados), `base_ia_rascunho`,
  `settings_base_ia` (ligou/desligou, provedor e modelo, "trocou a chave"), `settings_base_ia_test` e
  `settings_base_ia_modelos` (a busca da lista, dizendo se foi com a chave guardada). A chave nunca
  aparece.
- **O que sai do servidor**: o texto dos artigos que a busca achou, com os nomes do que está ligado a
  eles (cliente, modelo, assunto…), e, no rascunho, o do card vão para o provedor escolhido — a tela
  de Ajustes diz isso. Por isso senha nunca vai em artigo.
- Sem migração: os ajustes moram em `settings` (id `base-ia`) e a chave em `secrets`. Na prévia, a
  IA vem ligada com um uso de exemplo, a resposta é montada sem IA de verdade (com a mesma busca) e
  a lista de modelos é de exemplo. Conferido contra a API de verdade da Anthropic com uma chave falsa
  (volta "A chave da IA foi recusada"); os outros provedores, pela documentação deles e pelos testes.
