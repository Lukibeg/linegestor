# Fazer o botão "SSH" abrir o PuTTY

No cartão de cada cliente há dois botões: **Abrir** (leva ao endereço do servidor no navegador) e **SSH**.
O botão SSH manda o Windows abrir um endereço `ssh://root@200.200.200.200:22`. Para o Windows saber que
isso é "coisa do PuTTY", basta dizer isso uma vez em cada computador.

> Sem essa configuração, o Windows pergunta "como deseja abrir?" ou não faz nada. O sistema continua
> funcionando normalmente — só o atalho fica sem efeito.

## Jeito mais simples (uma vez por computador)

1. Instale o PuTTY (a versão 0.79 ou mais nova já traz o `putty.exe` em `C:\Program Files\PuTTY\`).
2. Abra o Bloco de Notas e cole o texto abaixo. Se o PuTTY estiver em outra pasta, corrija o caminho.

```reg
Windows Registry Editor Version 5.00

[HKEY_CLASSES_ROOT\ssh]
@="URL:ssh"
"URL Protocol"=""

[HKEY_CLASSES_ROOT\ssh\DefaultIcon]
@="C:\\Program Files\\PuTTY\\putty.exe,0"

[HKEY_CLASSES_ROOT\ssh\shell\open\command]
@="\"C:\\Program Files\\PuTTY\\putty.exe\" \"%1\""
```

3. Salve como **ssh-putty.reg** (em "Tipo", escolha "Todos os arquivos", para não virar .txt).
4. Dê dois cliques no arquivo e confirme. Pronto: o botão SSH passa a abrir o PuTTY.

## Perguntas comuns

**A senha vai junto?** Não. O atalho leva só usuário, endereço e porta. A senha fica no cofre do
sistema e só aparece para quem tem permissão, com registro na auditoria — nunca em endereço de
atalho, que ficaria gravado no histórico do navegador.

**Uso Mac ou Linux.** O `ssh://` já é entendido pelo sistema: ele abre o Terminal (ou o app de SSH
que estiver configurado). Nada a fazer.

**Prefiro o WinSCP / MobaXterm.** Troque o caminho do `putty.exe` pelo do programa que você usa.
