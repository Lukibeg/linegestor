# 0003 — Senhas cifradas numa tabela própria, com chave fora do banco

**Contexto.** O Nexus guarda senhas de SSH, tronco e Omniboard em texto legível, num campo de texto normal, e cinco links do Dashboard carregam senha na URL.

**Decisão.** Toda senha vai para a tabela `secrets`, cifrada com AES-256-GCM. A chave-mestra (`SECRETS_MASTER_KEY`) fica em variável de ambiente, nunca no banco nem no código. As tabelas de negócio guardam só o id do segredo. Revelar exige a permissão `secrets.reveal`, confirmação da própria senha, e gera registro na auditoria. Links de acesso rápido nunca carregam senha.

**Consequência.** Vazar o banco não vaza as senhas. Perder a chave-mestra torna as senhas irrecuperáveis — ela precisa de backup separado. A exportação "com senhas" (decisão do usuário) sai só para administrador, com confirmação, auditoria e ZIP protegido.

**Revista no 2.2** (28/10, o documento de melhorias do Luan: tirar a barreira da senha para ver as senhas dos Acessos; à
pergunta *"Ver a senha dos acessos sem digitar a sua senha: posso tirar? (sim/não)"*, a resposta: *"pode fazer"*): revelar
**não pede mais a confirmação da própria senha**. O olho da senha guardada revela na hora, por 30 s, como já era no Ver a
senha do portal. Continua valendo o resto: a senha cifrada no cofre, a permissão `secrets.reveal` (quem não tem não vê o
olho, e o servidor recusa), o limite de 20 revelações por minuto e o registro de cada revelação na auditoria, com o nome,
a data e a hora. Vale para todas as senhas guardadas (os acessos, o tronco, os ramais), porque é a mesma porta. A
**exportação com senhas** continua pedindo a senha: é outra coisa (todas de uma vez, num ZIP).
