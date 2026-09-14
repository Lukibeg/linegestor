# 0005 — Aparelho identificado pelo MAC, quando tem MAC

**Contexto.** O Nexus usa um número sequencial (N001…) que o usuário confirmou ser provisório.

**Decisão.** O MAC principal é único em `devices` e é o identificador de quem tem MAC. Há campo para um segundo MAC (Wi-Fi).

**Revisto na [0019](0019-uma-linha-por-aparelho.md)** (set/2026): o MAC deixou de ser obrigatório e o estoque a granel
(`bulk_stock`) saiu. Todo aparelho é uma linha; quem não tem MAC fica com o campo vazio e a tela mostra
"não aplicável". A unicidade continua valendo para os MACs que existem — dois aparelhos sem MAC convivem.

**Consequência.** Cadastrar um telefone continua exigindo ler a etiqueta do MAC. Em troca, o identificador é único de
fábrica e não depende de ninguém inventar número. Headset e cabo entram sem essa exigência.
