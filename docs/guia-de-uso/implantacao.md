# A implantação dos clientes (Patch 2.3)

Um card por cliente novo, com a curadoria, a configuração e os testes de cada produto. O card nasce sozinho quando a
negociação do Comercial entra na etapa que abre a implantação, já com o cliente e os produtos; e, no Implantado, os
produtos e os módulos ficam ativos na ficha do cliente, com a data.

## 1. Montar uma vez

1. **O painel.** Painéis › Ajustes › Painéis e etapas › **Novo painel** › **Implantação (Gestão)**. Ele já vem com:
   - as etapas **Stand By**, **Curadoria** (onde o card cai), **Configuração**, **Testes**, **Concluído** (todos os testes
     feitos) e **Implantado** (o cliente ativo; o Implantado
     liga no cadastro);
   - os **19 campos** do Ingline - Ativações, em três partes (Curadoria, Configuração, Testes), um bloco para o LineChat
     e outro para o LinePBX;
   - sem prazo, sem prioridade e sem o Tempo gasto (a implantação leva o tempo dela). O Tempo gasto liga e desliga em
     Painéis › Ajustes › Campos, em cada painel.
   Escolha quem vê (todos, ou só as pessoas da implantação) e **Criar painel**.
2. **O Comercial.** Painéis › Ajustes › Painéis e etapas › Comercial › Editar › abra a etapa que começa a implantação
   (a **Em processo de Implantação**; se ela não existe, **Incluir etapa**) › **Ao chegar aqui, abre a implantação** ›
   **No painel Implantação**. Depois, inclua a etapa **Implantado** antes do Ganho e ligue **A negociação vem para cá
   quando a implantação termina** › Salvar.
3. **Os módulos.** Os Módulos a ativar de cada produto são os do catálogo: Administração › Produtos. O que entrar ou sair
   ali aparece no card sozinho. (No catálogo de hoje, faltam para o LinePBX: Callback, WebRTC, NPS - WhatsApp e Filas -
   Dashboard.)

## 2. A negociação abre o card

No Comercial, mova a negociação para **Em processo de Implantação** (arrastando no quadro ou pelo Mover da ficha). A
janela mostra antes:

- **O cliente.** O da negociação; ou o do cadastro com o mesmo CNPJ; ou o novo — o nome fantasia, a razão social e o
  **CNPJ** (o cadastro exige: sem ele a negociação não vai). Basta digitar os 14 números: o formato entra sozinho, e a
  janela não confere o dígito verificador. Se a empresa já é cliente com outro nome, **Já está no cadastro** escolhe o
  cliente.
- **Os produtos.** Os que o cliente ainda não tem entram no cadastro **sem a data de ativação** (em implantação).
- **O card.** "Implantação — Cliente", na Curadoria, com o contato da negociação. Quem cuida da negociação acompanha o
  card como observador.

**Mover e abrir a implantação** faz tudo de uma vez. O **Ganho** continua à parte: marque quando começar a faturar.
Voltar a negociação e mover de novo não abre outro card.

## 3. O card no dia a dia

- **A Curadoria.** Quem cuida da curadoria preenche os dados do cliente (os usuários, os números, o chatbot, o horário, o
  acesso à BM, os ramais, a URA) e marca os **Módulos a ativar**: os que o cliente contratou. Para o card sair da
  Curadoria, alguém precisa ser o responsável (a janela pergunta).
- **A Configuração.** A equipe técnica marca as caixinhas do que já fez. A **Ativação dos módulos** é o checklist dos
  módulos marcados na Curadoria (só eles aparecem): marque cada um conforme ativar. Cada caixinha marcada mostra quem
  marcou e quando.
- **Os Testes.** O suporte marca o que já testou com o cliente.
- **As pastas.** A Configuração do LinePBX vem em pastas (Servidor, Asterisk, LinePBX Web, Módulos, Telefones), cada uma
  com a conta. Quem cuida dos chamados muda ali mesmo: **Editar as caixinhas** › Nova pasta, Incluir caixinha, as setas
  (levam a caixinha de uma pasta para a outra), o × (a caixinha que um card já marcou fica desativada, e ele continua
  com ela) › Salvar. Vale para todos os cards do painel.
- **Os anexos.** Cada campo da Curadoria tem o **Anexar**: imagens, PDF, Word, Excel, até 10 MB cada. A Configuração e os
  Testes ficam sem (o Recebe anexos, em Painéis › Ajustes › Campos, liga em qualquer campo; nas caixinhas, o anexo vai
  no clipe de cada uma). A imagem aparece em miniatura e abre grande; o PDF abre no leitor, sem baixar; o resto baixa com um clique.
  Sai do card quem anexou ou quem cuida dos chamados (o histórico guarda).
- Cada parte mostra a conta (**3 de 5**); a parte da etapa em que o card está fica aberta, e as outras abrem com um
  clique. O cartão do quadro mostra a barrinha da parte da etapa.
- Nada trava: dá para ir para a Configuração com a curadoria pela metade, e para o Implantado com teste faltando.

## 4. O Implantado liga no cadastro e leva a negociação

Quando os testes acabarem, mova o card para **Concluído**. Feita a implantação junto com o cliente, mova para
**Implantado**. A janela mostra como a ficha do cliente vai ficar, desde hoje:

- os produtos sem data ganham a data de hoje (o que o cliente não tinha entra ativo; o Equipamentos, que não tem data,
  entra sem ela; o que estava encerrado fica como está);
- os módulos marcados em Módulos a ativar (a Curadoria) ficam ligados. Se algum ainda não foi marcado na Ativação dos
  módulos (a Configuração), a janela avisa, mas não trava.

**Mover e ligar no cadastro.** Na ficha do cliente (Clientes › o cliente › Produtos), o produto que ainda está em
implantação aparece como **em implantação**; depois do Implantado, **ativo desde** o dia.

E a negociação vai sozinha, no Comercial, de **Em processo de Implantação** para **Implantado**. O Ganho você marca
quando começar a faturar.

## 5. Os campos (Painéis › Ajustes › Campos)

Todo campo de qualquer painel ganhou duas opções:

- **Parte da ficha**: com ela, o campo vai para o meio da ficha, num cartão com os da mesma parte.
- **Produto**: com ele, o campo só aparece no chamado que tem o produto. O mesmo nome pode existir em produtos
  diferentes.

E dois tipos novos: **Caixinhas** (o que já foi feito, com quem marcou e quando; em pastas, se quiser: **Nova pasta** na
janela do campo) e **Módulos do produto** (os módulos do catálogo; o produto não muda depois de criado). Num campo de
módulos, **Os módulos que aparecem** › **Só os marcados em …** faz dele o checklist de outro campo de módulos do mesmo
produto (como a Ativação dos módulos segue o Módulos a ativar).

E a opção **Recebe anexos**: com ela, o campo ganha o Anexar na ficha (nas caixinhas, o clipe de cada uma). No modelo
Implantação, vem ligada nos campos da Curadoria.
