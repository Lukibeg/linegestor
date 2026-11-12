# 0063 — A largura do campo, o painel pessoal de cada pessoa, o Configurar numa janela e os anexos de 30 MB

**Data:** 11/11/2026 · **Patch:** 2.4.7 · **Situação:** aceita · **Revê:** a 0047 (os chamados: quem configura um painel era só quem cuida dos chamados; quem cuida via todos os painéis) e a 0058 (os grupos de campos: a largura de cada campo era decidida pelo tipo)

## Os pedidos

O Luan, 11/11, com o print do contrato assinado de 15 MB nos Detalhes da proposta: *"Aumente esse limite n ta cabendo minhas
propostas"*. E, num documento com dois prints:

- *"Eu quero ter como escolher na hora de cadastrar um campo se ele vai ocupar metade do espaço como o de operadora doadora ou
  vai ser todo como esse da faixa numérica"*;
- *"Painel pessoal pra todos: quero que nativamente todos os usuários tenham um painel pessoal de atividades, ele vai vir seco e
  o usuário vai habilitando os campos que achar necessário, mais as etapas vão ser padrão: standby (parado), novos (início), em
  andamento, concluído, validado."* Perguntado sobre o painel que ele já usava: *"eu já tenho um pessoal e n quero que altere
  nada nele, ele só vai virar já meu pessoal ou seja vc n vai precisar implementar o meu, mas ele deve manter lá sem alteração
  nenhuma já uso ele, ent n posso perder nenhum dado"*;
- *"Quando eu clicar em configurar dentro de um painel, quero que eu possa alterar todas as configurações dele a partir desse
  popup inclusive a árvore de assuntos, etiquetas etc, sem precisar ir na parte de ajustes dos painéis, e tbm n quero que ele me
  redirecione para a aba de ajustes dos painéis"*.

## 1. Os anexos dos campos com até 30 MB

- O Anexar de cada campo do card (e de cada caixinha) aceita até **30 MB por arquivo** (eram 10 MB). A regra é uma só
  (`MAX_BYTES_ANEXO_DO_CAMPO`, no `@gestor/shared`): a tela, o schema (o base64 de 30 MB tem uns 42 milhões de letras), o
  servidor (`lerConteudo` com o limite por parâmetro) e a prévia.
- A tela manda um arquivo por pedido; a rota tem `bodyLimit` de 45 MB (o padrão do app é 30 MB).
- **A anotação continua com 5 arquivos de 10 MB**: ela manda todos num pedido só, e 5 × 30 MB passaria do que o servidor deve
  receber de uma vez. **A NIA continua lendo até 10 MB por arquivo** (o anexo maior ela recusa com a frase de sempre).

## 2. A largura do campo

- Cada campo ganha a **Largura na ficha**: **Metade** (divide a linha com o vizinho de metade) ou **Linha inteira**. Só aparece
  na janela do campo quando o grupo é **do meio da ficha** (na lateral, cada campo já ocupa a linha).
- Sem escolha (os campos de antes), vale a do tipo, como era: o texto longo, o documento e as caixinhas, a linha inteira; o
  resto, metade (`larguraDoCampo`). Nada muda na tela de ninguém até alguém escolher.
- A coluna `ticket_fields.width` (a migração 0035): `metade`, `inteiro` ou nula.

## 3. O painel pessoal

1. **Cada pessoa que trabalha nos chamados (`tickets.work`) tem um**, criado sozinho na primeira vez que ela entra nos Painéis
   (a leitura das opções e da tela dos Painéis: `garantirPainelPessoal`). Quem só lê (o Leitor) não ganha: não abre chamado.
   - Por que na hora de entrar, e não na migração: a migração não sabe quem é quem, e a pessoa criada amanhã também precisa do
     dela. Na segunda vez, é uma consulta só.
2. **Seco:** os campos do sistema desligados (até o Cliente e contato), sem prazo, sem fechar sozinho, o pai sem esperar os
   filhos. **As etapas: Stand By, Novos (a entrada), Em andamento, Concluído (o resolvido) e Validado (o fechado)**, na ordem
   dele. O nome é `<primeiro nome> - Pessoal`, como o dele; a sigla, as iniciais com P (`MCP`), ou outra livre.
3. **O painel que a pessoa já usava fica sendo o dela, sem mudar nada**: um painel ativo de Gestão, com "Pessoal" no nome, que
   só ela vê. Só ganha o dono (`ticket_panels.owner_id`); o nome, as etapas, os campos e os chamados ficam como estão. É o caso
   do *Luan - Pessoal*, com as 9 etapas.
4. **Veem o dono e quem tem o perfil de administrador** (`admin.manage`). Na primeira versão, só o dono (escolha minha, com a
   pergunta sem resposta); o Luan, 12/11: *"quem tem perfil de administrador tem q ver todos"*. Quem só cuida dos chamados
   (`tickets.manage` sem `admin.manage`) e os colegas não veem: o painel e os chamados dele dão 404. Antes, o "escolhidos"
   deixava quem cuida dos chamados ver todos.
   - Na tela Painéis, os pessoais dos outros ficam numa parte à parte, embaixo (**Os painéis pessoais da equipe**), que o
     administrador fecha e abre (fica lembrado no navegador): com uma equipe grande, eles não empurram os painéis de trabalho.
5. **O dono configura o dele**, mesmo sem cuidar dos chamados, e o administrador também: o painel, as etapas, os campos, os
   assuntos e as etiquetas (as rotas de Ajustes de um painel passam pela `exigirConfigurarPainel`: o da equipe pede
   `tickets.manage`; o pessoal, ser o dono ou administrador; senão, 404). **Quem vê não muda** pela janela (o servidor grava
   sempre só o dono nas pessoas), e o painel pessoal não sai para a lixeira (400; dá para desativar).
   - Escolha minha (a pergunta ficou sem resposta): as etapas nascem as cinco, e cada um muda as do seu — o dele já tinha 9.
6. Fica de fora: o envio automático (as origens), o Trazer do Helena (os destinos) e o painel em que o robô abre sem dizer qual.

## 4. O Configurar numa janela

- O **Configurar** do alto do painel (o quadro, a lista, os relatórios) e o dos cartões da tela Painéis abre **a janela por cima
  da tela em que se está**, sem ir para Painéis › Ajustes. No alto, as abas **Painel e etapas · Campos · Assuntos · Etiquetas**
  (os Assuntos só com o campo Assunto ligado no painel).
- **Painel e etapas** é a janela de antes (salva com o Salvar). Nas outras, cada mudança vale na hora, como em Ajustes; a aba
  Painel e etapas fica montada por baixo, e o que foi mexido nela não se perde ao trocar de aba (o rodapé avisa).
- As telas são as mesmas de Ajustes, presas ao painel (`painelFixo`): nada foi copiado.
- Painéis › Ajustes continua como era, para quem cuida dos chamados.
