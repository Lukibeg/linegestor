# 0023 — SSH por técnico, produto novo e excluído, datas ao meio-dia, "ver tudo" e acentos

## Usuário e senha do SSH saem do cliente

Cada técnico entra nos servidores com **o próprio usuário**, o mesmo em todos. Guardar usuário e
senha SSH por cliente não fazia sentido. Agora:

- O formulário do LinePBX e a aba Acessos não pedem nem mostram usuário/senha SSH. Fica a porta.
- Cada pessoa informa o **seu usuário SSH** em **Minha conta** (`users.ssh_user`, `PATCH /auth/me`).
- O servidor monta o atalho **sem usuário** (`ssh://servidor:22`); a tela encaixa o usuário de quem
  está usando (`ssh://lucas@servidor:22`).
- As colunas antigas (`linepbx_settings.ssh_user` e a senha no cofre) **continuam no banco**, sem uso
  na tela, para não perder o que veio do Nexus. A importação ainda aceita as colunas.
- A coluna "SSH (usuário e porta)" da lista de clientes virou **"Porta SSH"**.

## Campo de senha sem a caixa "sem senha guardada"

No formulário, quando ainda não há senha, aparece só o campo para digitar ("digite a senha"). A
caixa cinza "sem senha guardada" em cima confundia (parecia um campo). Com senha guardada, continua
a senha mascarada (revelar/copiar) e, embaixo, "nova senha (deixe vazio para manter)".

## Produto: criar, excluir e restaurar

- Administração › Produtos ganhou **Novo produto** (nome, código gerado do nome, cor, descrição).
- **Excluir** manda o produto para a **lixeira** (`products.deleted_at`): ele some das fichas, dos
  filtros, dos cartões e do Painel; as assinaturas ficam no banco e voltam ao restaurar. Com
  clientes assinando, a confirmação pede para digitar o nome.
- **LinePBX, VoiceNet e Equipamentos não podem ser excluídos**: o sistema depende deles (servidor e
  atalhos, alerta de DIDs, regra de movimentação). Para escondê-los, basta desligar o "ativo".

## Datas de ativação ao meio-dia UTC

A tela mandava "3 de novembro" como meia-noite em UTC, que no Brasil ainda é dia 2 — por isso a data
aparecia um dia antes. Agora toda data de calendário é gravada **ao meio-dia UTC**, que é o mesmo dia
em qualquer fuso do país (no servidor, no formulário, na importação e na demonstração). A migração
corrigiu as datas que já estavam exatamente à meia-noite UTC.

Também: todo módulo ativo tem **Ajustar** (antes só os com configuração própria), e **Ativar** sempre
abre o formulário, para escolher a data.

## Nenhuma lista esconde linhas

"Mostrando 200 de 304. Use a Numeração para ver todos" acabou. Toda lista com páginas mostra, no
rodapé, **Ver tudo (N)**, que traz a lista inteira; com tudo na tela, **Voltar a paginar**. Vale para
clientes, circuitos, numeração, DIDs do circuito e do cliente, aparelhos, modelos, movimentações e
auditoria. O servidor aceita até 100.000 por página (`SEM_LIMITE`). O painel Movimentar também
passou a listar todos os aparelhos disponíveis (antes, 60).

## Titular só com circuito

O filtro "Titular" da tela de Circuitos só lista quem é titular de **pelo menos um circuito** que
está na lista (`GET /circuits/owners`); com o interruptor de links de terceiros, entram os titulares
desses links. No cadastro do circuito, a lista continua com todos (é ali que alguém vira titular).

## Sim/não no endereço

`z.coerce.boolean()` trata o texto `"false"` como verdadeiro. Por isso `?includeThirdParty=false`
trazia os links de terceiros. Os parâmetros de sim/não agora usam `Booleano`, que só aceita `true`,
`"true"` e `"1"` como sim.

## Acentos embaralhados na importação

Nomes como "Gefpel-Auto PeÃ§as" vieram do Nexus com o texto em UTF-8 lido como Latin-1. A
importação passou a consertar isso em cada célula (`consertarAcentos`), e a migração consertou o que
já estava no banco (clientes, circuitos, DIDs, anotações, unidades, modelos). Só age no padrão típico
e só quando a conversão dá um texto válido — "SÃO PAULO" fica como está.
