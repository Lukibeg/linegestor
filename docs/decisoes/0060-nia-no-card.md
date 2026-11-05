# 0060 — O /nia no card: a NIA propõe, a pessoa aplica

**Data:** 30/10/2026 · **Patch:** 2.4.2 · **Situação:** aceita

## O pedido

O Luan, 30/10 (o documento "Feature nova: o /nia dentro do card, em todos os painéis"): a NIA — a IA do suporte da
Ingline, um serviço de fora, já no ar — oferece "ações" sobre um chamado (corrigir o português, formalizar para o
cliente, resumir, criar um chamado a partir de uma descrição livre e preencher um card vazio), e ele quer isso dentro do
card, em todos os painéis, como um comando: *"ao digitar /nia em qualquer campo de texto (ou na anotação), abre um menu
que lista TODOS os comandos pré-escritos, cada um com o nome e uma breve descrição do objetivo dele, para quem nunca leu
documentação entender o que cada um faz"*. E a regra de ouro: *"a NIA PROPÕE, a pessoa aplica. A NIA nunca escreve no
chamado."*

## O que foi decidido

1. **O navegador fala só com o Gestor.** A chave de serviço da NIA é de servidor: fica no cofre cifrado (Painéis ›
   Ajustes › Integrações › NIA (/nia)), nunca volta para a tela nem vai para a auditoria. O Gestor é o intermediário:
   `GET /api/atendimento/nia/acoes` (o catálogo, guardado 5 minutos), `POST /api/atendimento/chamados/:id/nia/propor` e
   `POST /api/atendimento/chamados/:id/nia/aplicar`, todos com a sessão da pessoa. O `POST /chamados/:id/nia` (o botão
   NIA da ficha, que põe a etiqueta para o n8n, 2.1) e o Preencher com IA continuam exatamente como estavam: o /nia é
   uma terceira entrada, independente.

2. **A chave só vai para o servidor onde foi colada.** Guardamos junto o servidor (host:porta) da chave: trocar o
   endereço da NIA para outro servidor sem colar a chave de novo é recusado. Sem isso, bastaria mudar o endereço para a
   chave ir parar em outro lugar. Pelo mesmo motivo, o pedido à NIA não segue redirecionamento. Quando a NIA ganhar
   domínio, troca-se o endereço e cola-se a chave de novo.

3. **O certificado: somar a CA, nunca desligar a verificação.** Enquanto a NIA não tem domínio, o HTTPS dela é da CA
   interna do Caddy de lá. O `nia-ca.crt` fica em `/opt/gestao/certs/` no servidor, montado no container
   (`./certs:/certs:ro`, a pasta e não o arquivo: montar um arquivo que não existe faz o Docker criar uma pasta), com o
   `NODE_EXTRA_CA_CERTS` apontando para ele. Nada de `rejectUnauthorized: false`. Sem o arquivo, o sistema sobe e o /nia
   diz que não confiou no certificado.

   **Revisto no 2.4.3** (05/11, o Luan: *"quero que esse arquivo vá junto com o código, para entrar sozinho na próxima
   publicação normal, sem nenhum passo manual no servidor"*): o `nia-ca.crt` passa a morar no repositório, em
   `certs/nia-ca.crt` (o `.gitignore` ignora `certs/*`, menos ele). Pode, porque é o certificado **público** da CA (sem a
   chave privada: quem tem o arquivo só consegue conferir a NIA, não se passar por ela); e deve, porque o passo à mão
   dependia de alguém com acesso ao servidor, e sem ele o /nia ficava fora do ar depois de cada instalação nova. O
   `git pull` do `publicar.sh` traz o arquivo e o `up -d` recria o sistema, que o lê ao subir; o volume e o
   `NODE_EXTRA_CA_CERTS` não mudaram. Se a NIA trocar de CA, o arquivo novo entra num patch.

4. **O menu vem da NIA.** O nome e a descrição de cada comando são os do catálogo dela: comando novo é cadastro do lado
   da NIA, não um patch do Gestor. O comando que vier quebrado sai sozinho, sem derrubar o menu.

5. **Quem decide os campos é a NIA, pela frase da pessoa.** O Gestor manda o card inteiro, lido do banco: os campos de
   texto que o painel do card usa (o título sempre; o relato, a solução e a causa quando o painel não os desligou; os
   seis do problema; a "Sobre a negociação" no de Vendas), como estão gravados; e a anotação só quando o /nia foi
   digitado nela (o rascunho, que ainda não foi gravado). O texto que a pessoa escreveu num campo e ainda não salvou
   **não** vai: o /nia pede para salvar antes — a NIA lê o que está gravado, e trabalhar num texto que ela não vê seria
   pior.

6. **As opções de lista só do que o painel usa, e o assunto só pelas folhas.** Na entrega "campos" (criar-chamado,
   preencher-card-vazio), vão os nomes, como a pessoa lê: o cliente (os ativos), o produto (os ativos), o tipo do
   painel, a gravidade e o assunto — só as folhas da árvore (o caminho que nenhum outro continua). Com as pastas na
   lista, a IA escolhia a pasta na dúvida (o SUP-82 e o SUP-103 ficaram com "Linechat"). O que voltar com nome, o Gestor
   já devolve com o id (`idsDasListas`): o cliente vira o `clienteId`, o produto o id em `produtos`, o assunto vai pelo
   caminho (o valor canônico do PATCH) e a gravidade pela chave. Em branco é decisão da NIA (não achou evidência): fica
   em branco, nunca "o mais parecido".

7. **Proposta não é mudança.** A proposta não grava nada e não vai para o Histórico; vai para a auditoria (o texto do
   card saiu do servidor para a NIA, e fica dito quem pediu). O Aplicar grava só o que a pessoa marcou, pelo `alterar` de
   sempre (as mesmas regras e limites da ficha, com a sessão dela) e, na mesma transação, a linha `nia` do Histórico —
   *"aplicou a NIA (Corrigir o português): mudou Relato do cliente e Causa"* —, montada de novo só com o que foi
   gravado. A anotação não passa pelo Aplicar: volta ao rascunho, e a pessoa anota como sempre.

8. **O que passa do tamanho é recusado, não cortado.** Relato, descrição e solução até 20 mil letras; causa e
   validação até 5 mil; solução de contorno até 10 mil; o título até 200. A mensagem diz o campo, quanto tem e quanto
   cabe.

9. **A ficha nunca quebra por causa da NIA.** Toda falha vira `{ ok: false, erro }` com a frase pronta: a NIA que não
   responde em 120 s (o mesmo que a NIA espera o modelo; era 90 s, e um PDF grande fazia o Gestor desistir antes dela) (*"A NIA não respondeu agora. Tente de novo."*), a chave recusada (*"A chave da NIA foi recusada;
   confira em Painéis › Ajustes › Integrações."*), o certificado, a resposta que não se entende. O catálogo espera 15 s
   (a tela desiste de uma leitura em 30 s).

10. **O vocabulário dos assuntos para a NIA.** O `GET /integracao/opcoes` (o da chave de API) passou a levar, em cada
    assunto, a `descricao` e o `dePara` (os apelidos). O `caminho` continua o valor que o PATCH aceita.

11. **Os anexos vão junto, e quem lê é a NIA.** O /nia leva os arquivos do lugar onde foi digitado: na anotação, os do
    rascunho (até 5, ainda no navegador: vêm no pedido do `/nia/propor`, no mesmo `{ fileName, conteudo }` da
    anotação); num campo do painel com anexos (os do 2.3), os daquele campo, lidos do banco (`ticket_attachments` com o
    `field_id`, fora os apagados); nos outros campos, nada. O Gestor só junta e manda no formato da NIA
    (`anexos: [{ nome, base64 }]`, sem o prefixo `data:...;base64,`): não lê, não interpreta e não manda para IA
    nenhuma. Antes de chamar, confere com a frase clara e sem chamar a NIA: até 10 arquivos, 10 MB cada e 14 MB somando
    (a NIA confere de novo, inclusive o tipo pelo conteúdo). A rota do `/nia/propor` aceita até 75 MB no corpo, porque
    5 arquivos de 10 MB em base64 passam de 60 MB. O que a NIA leu (`anexosLidos`) aparece em cima da proposta; o
    evento `nia` do Histórico guarda os nomes (`anexos`), e a frase termina com *"(com base em: print.png,
    relato.docx)"*. O arquivo que a NIA recusa (tipo, corrompido, grande) vem como `ok:false` e a frase dela aparece
    como veio; o rascunho fica intacto (o texto e os anexos). Nada disso grava os arquivos: a anotação é salva como
    sempre, depois.

## Na tela

Em qualquer campo de texto do card (os de `Textos.tsx`, o título no `Cabecalho.tsx`) e na caixa da anotação, "/nia"
abre o menu flutuante ancorado no campo; continuar digitando filtra ("/nia cor"); setas e Enter escolhem, Esc fecha, o
clique também escolhe; o pedido vai na mesma linha e o Enter manda. Enquanto a NIA lê, o campo fica parado ("a NIA está
lendo…"); com erro, a frase como veio e o campo de volta como estava. A janela da proposta: o antes e o depois lado a
lado (no celular, um embaixo do outro), com o que mudou em destaque, e uma caixa por linha, marcada onde mudou ("já
estava certo" sem caixa); o resumo, com o Aplicar no campo onde o /nia foi digitado; e a tabela dos campos, marcada só
onde o card está vazio, com o "(não identificado)" sem caixa. O card sem relato mostra a dica *"Digite /nia
criar-chamado e descreva o que aconteceu"*. O /nia aparece para quem pode mexer no card (`tickets.work` e o painel que a
pessoa vê) e só com a NIA configurada.

## O que ficou de fora

- Nenhum limite de usos por hora (a IA da base tem 30): cada pedido pede um Enter da pessoa. Se a conta da NIA pedir, o
  limite entra no serviço do Gestor.
- A rota da anotação continua com o limite geral de 30 MB no corpo: 5 anexos de 10 MB (em base64) não cabem lá ao
  salvar a anotação, embora caibam no /nia. É de antes do /nia e não mudou aqui.
- O resumir num campo de texto longo do painel grava pelo Aplicar; os outros campos do painel (lista, número, data) não
  recebem o /nia.
