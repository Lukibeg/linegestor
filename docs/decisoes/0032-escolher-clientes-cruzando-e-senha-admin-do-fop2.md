# 0032 — Escolher clientes cruzando produtos e módulos; FOP2 com a senha do ramal admin

**Contexto.** Ainda com o Patch 1.4 na prévia, o Luan mandou em 24/09 mais um documento
("Ter a opção de cruzar dados.docx") com dois pedidos:

1. na janela **Escolher clientes** dos projetos, **"ter a opção de cruzar dados, por exemplo, todo
   mundo que tem VoiceNet e Equipamentos, e também a opção dos subprodutos"** (os módulos), e
   **"melhorar a amostragem das opções — tem lugares no nosso sistema que estão melhor"**;
2. no FOP2, **"tem que ter a senha do ramal de admin, mas não precisa ter a senha do usuário
   padrão"**.

O item 2 revê a decisão 0025 (rodada 23, 19/09), que tinha registrado, a pedido dele, que o FOP2
guarda a senha do usuário padrão. Ele foi avisado antes, na conversa, e escolheu trocar e guardar
as senhas antigas. Os dois entram no 1.4, que ainda não tinha subido.

**Decisão.**

- **Escolher clientes cruza produtos e módulos.** Sai a lista suspensa ("quem tem LinePBX", um
  produto por vez, e só os 6 produtos de fábrica: produto criado na Administração não aparecia).
  Entram os **produtos e os módulos à vista**, como botões que ligam e desligam, na cor de cada
  produto e com **quantos clientes têm**; os módulos ficam agrupados pelo produto
  ("LinePBX › FOP2"). Com dois ou mais escolhidos, **tem todos** (cruzar: VoiceNet **e**
  Equipamentos) ou **tem qualquer um**; o padrão é **tem todos**, porque cruzar é o pedido. O
  filtro aparece em palavras ("quem tem VoiceNet e Equipamentos: 4 clientes"), e cada cliente da
  lista mostra o que tem, só os nomes, na cor do produto (como nos cartões da lista de clientes).
  - O filtro é feito na tela: `/clients/options?withProducts=true` devolve, para cada cliente, os
    códigos dos produtos ligados e os módulos ("produto:módulo") ligados em assinatura ativa — a
    mesma regra do filtro da lista de clientes. Poucas dezenas de clientes: um pedido só, e cada
    clique responde na hora.
  - Na lista de clientes, o "tem qualquer um" continua o padrão (ali o uso comum é juntar, não
    cruzar), e produtos e módulos continuam nos dois botões de filtro.
- **FOP2 guarda a senha do ramal admin** (`fop2_settings.admin_password_secret_id`, no cofre, com
  o rótulo "Senha do ramal admin do FOP2"), no formulário do módulo e na aba Acessos, logo abaixo do
  ramal admin. **A senha do usuário padrão sai das telas e da API** (a API não aceita mais o campo
  e não o devolve). **As que já estavam guardadas ficam no cofre**, com a coluna
  `default_user_password_secret_id` intacta — nada é apagado; só não aparecem.
- **Configuração de produto e de módulo num objeto só** (correção achada no caminho). A validação
  de `settings` era uma união de formatos — LinePBX *ou* SZChat; FOP2 *ou* Omniboard — e a união
  fica com o primeiro formato que serve. Como todos os campos são opcionais, servia sempre o
  primeiro: **o login e a senha do SZChat e os do Omniboard eram descartados sem aviso**, e a tela
  dizia "salvo". Agora cada gravação aceita os campos de todos os formatos daquele tipo, e o
  servidor usa os do produto ou módulo gravado.

**Migração** `0007_fop2_senha_admin.sql`: uma coluna nova em `fop2_settings`, sem mexer em dado.

**Consequências.**

- Quem cadastrou login ou senha do **Omniboard** ou do **SZChat** pela tela até o 1.4 precisa
  cadastrar de novo: nada daquilo foi gravado (a nota do 1.4 avisa a equipe).
- Testes: `/clients/options` com os produtos e módulos; a senha do ramal admin no cofre; a senha
  antiga do usuário padrão intacta e sem aparecer; Omniboard e SZChat gravando login e senhas.
