# Base de conhecimento

O lugar onde fica o que a equipe aprendeu: o chamado estranho que ninguém tinha visto, o passo a
passo de uma configuração, o cuidado que evita retrabalho. Cada artigo tem um código, como **BC-12**,
para colar no card do LineChat ou no WhatsApp.

Quem lê: todo mundo. Quem escreve e comenta: Operador, Técnico e Administrador. Quem cuida da base
(pede leitura obrigatória, vê os rascunhos de todos) e liga a IA: o Administrador.

---

## 1. Procurar

Em **Base de conhecimento**, escreva do jeito que o cliente falou: "telefone sem linha", "não me
escutam", "cai depois de 30 segundos". A busca não liga para acento e acha pedaço de palavra. As
palavras achadas aparecem em destaque. O código (BC-12) abre direto aquele artigo.

Os filtros separam por produto, módulo, assunto do LineChat, cliente, modelo, operadora e autor.

O botão **Lista | Kanban** mostra o mesmo resultado de dois jeitos: a lista (o padrão) ou um quadro
com uma coluna por **produto**, **assunto do LineChat**, **situação** (rascunho, publicado, leitura
obrigatória) ou **autor** — escolha em **Colunas**. A busca, as abas e os filtros valem no quadro
também; o artigo ligado a dois produtos aparece nas duas colunas (o módulo conta para o produto
dele). O sistema lembra a sua escolha. No celular, o quadro rola para o lado.

## 2. Escrever um artigo

**Novo artigo** (ou **Registrar na base**, no chamado). As partes:

| Parte | O que vai |
|---|---|
| **Título** | Do jeito que alguém procuraria: "Ligação cai sempre aos 32 segundos" |
| **O que acontece** | O sintoma, como o cliente conta |
| **Como resolver** | Os passos. **Obrigatório para publicar** |
| **Por que acontece** | Opcional — é o que ensina a reconhecer o problema da próxima vez |
| **Palavras do cliente** | Outros jeitos de dizer o mesmo problema. É o que faz a busca achar |
| **Onde acontece** | Produto, módulo, assunto, cliente, modelo, operadora, projeto, chamado |
| **Anexos** | Planilha, PDF, configuração exportada (até 10 MB cada) |

O texto é simples, sem botões de formatação:

- linha que começa com número (`1.`) vira **passo**;
- linha entre crases (`` `asterisk -rx "pjsip show contacts"` ``) vira **comando com botão Copiar**;
- o **print** entra colando a imagem no texto (**Ctrl+V**) ou pelo botão **Print**: o sistema reduz o
  tamanho sozinho e o print aparece no meio do passo;
- `BC-3` no texto vira link para o outro artigo.

**Ver como fica** mostra o artigo pronto. **Publicar** põe para a equipe; **Salvar rascunho** guarda
só para você (e para quem cuida da base).

> **Senha não vai na base.** Todo mundo lê, inclusive quem só consulta o sistema. Escreva onde a
> senha está ("fica na ficha do cliente, aba Acessos"), nunca a senha.

## 3. A partir do chamado

- Na tabela de **Chamados**, passe o mouse na linha: o botão de livro com "+" abre um artigo novo com
  o título, a descrição e as ligações (cliente, assunto, produto e o chamado) do card.
- Ou, no artigo novo, escreva o código do card em **Veio de um chamado?** e clique em **Trazer o que
  o card tem**.

O Gestor só lê o card: nada muda no LineChat. Com a IA ligada (item 9), o botão **Escrever o
rascunho com a IA** lê o card e preenche o artigo para você revisar.

O **livrinho** ao lado do código do card mostra quantos artigos valem para aquele chamado (os ligados
ao card, ao assunto e ao cliente dele). Clique para ver quais.

## 4. Onde a base aparece sozinha

- **Ficha do cliente**: "3 artigos sobre este cliente".
- **Pop-up do modelo** (Inventário › Modelos): os artigos sobre aquele aparelho.
- **Ficha do circuito**: os artigos sobre a operadora dele.
- **Ficha do projeto**: o **Como fazer**, com **Ligar um artigo** e **Registrar o que aprendemos**.

Sem artigo ligado, nada aparece.

## 5. Melhorar um artigo

Quem escreve pode melhorar o artigo de qualquer pessoa: **Editar**, mudar, **Salvar**. Cada mudança
no texto vira uma versão, e a aba **Histórico** mostra quem mudou, quando, o que saiu (riscado) e o
que entrou (em verde). **Voltar a esta versão** traz o texto antigo de volta como uma versão nova —
nada se perde.

Se duas pessoas editarem ao mesmo tempo, quem salvar por último recebe um aviso: copie o que você
escreveu, abra o artigo de novo e junte as duas mudanças.

## 6. Comentários

Embaixo de cada artigo, quem escreve na base comenta o que viu depois: "aconteceu de novo no cliente
X, desta vez era o cabo", "no Mikrotik a opção fica em outro lugar". Fica registrado quem comentou e
quando; o texto do artigo não muda (para corrigir o passo a passo, **Editar**). **Ctrl+Enter** envia.
`BC-3` e links no comentário viram link. A lista da base mostra quantos comentários cada artigo tem.

Cada um apaga o próprio comentário (quem cuida da base apaga qualquer um); a auditoria guarda o texto
apagado.

## 7. Leitura obrigatória (quem administra)

Ao escrever (ou editar) um artigo, marque **Pedir a leitura da equipe**, no fim do formulário: o
botão vira **Publicar e pedir a leitura**. Ou, com o artigo já publicado, **Pedir leitura da equipe**
na página dele. Cada pessoa vê o artigo em destaque na base e um número no menu até marcar **Li e
entendi**. O botão "N de M leram" mostra quem leu e quem falta. Se o artigo mudar, **Pedir a leitura
de novo** (no formulário, ao salvar, ou no artigo) pede para todo mundo ler outra vez. No rascunho
não vale: só quem escreveu vê.

## 8. Apagar e recuperar

O artigo vai para a lixeira pelo botão vermelho (quem escreveu, ou quem cuida da base) e volta por
**Administração › Lixeira**.

## 9. A IA (opcional)

Desligada até quem administra ligar. Com ela ligada, aparecem dois botões:

- **Perguntar à IA**, ao lado da busca: escreva a pergunta do jeito que o cliente falou e clique
  (ou **Ctrl+Enter**). A IA responde **só com os artigos publicados** que a busca da base achar, e
  cada linha diz de qual artigo saiu (o **BC-1** pequeno abre o artigo). Embaixo vêm os artigos que
  ela leu. **Confira no artigo antes de mexer no cliente.** Se a base não tem a resposta, ela diz
  isso, e o link **escreva o artigo** já abre um artigo novo com a pergunta no título.
- **Escrever o rascunho com a IA**, em **Veio de um chamado?** (artigo novo): ela lê o card (título,
  descrição, campos e as etapas por onde passou) e preenche o artigo. Onde faltou informação, ela
  escreve **[completar: …]** — troque pelo que aconteceu de verdade. **Desfazer** volta ao que estava.
  Nada é publicado sozinho: você revisa e publica.

Cada pessoa usa até **30 vezes por hora**. Rascunho de artigo nunca vai para a IA; o texto dos
artigos publicados que a busca acha, sim — mais um motivo para senha nunca ir em artigo.

### Ligar e escolher o provedor (quem administra)

Em **Administração › Ajustes › IA da base**:

1. **Provedor**: Anthropic (Claude), OpenAI (ChatGPT), Google (Gemini) ou **outro compatível** com a
   OpenAI. No compatível, informe o **endereço da API** (começa com `https://`); os botões abaixo do
   campo preenchem os mais usados: OpenRouter (muitos modelos com uma chave só), DeepSeek, Groq,
   Mistral, Maritaca (brasileira) e xAI.
2. **Chave da API**, criada na conta da empresa no provedor (Anthropic: platform.claude.com › API
   Keys; OpenAI: platform.openai.com › API keys; Google: aistudio.google.com › Get API key). Ela fica
   cifrada no cofre, não aparece de volta e só vai para o provedor dela (no compatível, só para o
   serviço dela): para trocar de provedor, ou de serviço compatível, cole a chave do novo.
3. **Modelo**: **Buscar modelos** mostra os que a chave pode usar; ou escreva o nome (como
   `claude-sonnet-5-5`, `gpt-5.4-mini`, `gemini-3.5-flash`). Serviço que não mostra a lista (a
   Maritaca, por exemplo): escreva o nome que está na página dele, como `sabia-3`.
4. **Preço do modelo** (opcional): o valor em dólar por milhão de tokens lidos e escritos, da página
   de preços do provedor. Com ele, o cartão mostra quanto o mês custou e cada resposta mostra quanto
   custou. Sem ele, só os tokens.
5. Ligue a chave **Ligar a IA na base de conhecimento**, **Salvar** e **Testar agora** (uma pergunta
   de uma palavra, que custa uma fração de centavo).

Dá para trocar o provedor ou o modelo quando quiser. O cartão mostra o último teste e o uso do mês
(perguntas, rascunhos e tokens). Quem paga é a conta da empresa no provedor.

**Se der erro**: "A chave da IA foi recusada" — a chave está errada ou foi apagada no provedor;
"sem crédito ou passou da cota" — falta crédito na conta do provedor; "não reconheceu o modelo" —
escolha outro em **Buscar modelos**; "chegou ao limite de pedidos" — espere um minuto.
