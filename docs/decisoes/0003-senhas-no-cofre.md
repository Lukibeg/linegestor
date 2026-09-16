# 0003 — Senhas cifradas numa tabela própria, com chave fora do banco

**Contexto.** O Nexus guarda senhas de SSH, tronco e Omniboard em texto legível, num campo de texto normal, e cinco links do Dashboard carregam senha na URL.

**Decisão.** Toda senha vai para a tabela `secrets`, cifrada com AES-256-GCM. A chave-mestra (`SECRETS_MASTER_KEY`) fica em variável de ambiente, nunca no banco nem no código. As tabelas de negócio guardam só o id do segredo. Revelar exige a permissão `secrets.reveal`, confirmação da própria senha, e gera registro na auditoria. Links de acesso rápido nunca carregam senha.

**Consequência.** Vazar o banco não vaza as senhas. Perder a chave-mestra torna as senhas irrecuperáveis — ela precisa de backup separado. A exportação "com senhas" (decisão do usuário) sai só para administrador, com confirmação, auditoria e ZIP protegido.
