# 0005 — Aparelho serializado identificado pelo MAC

**Contexto.** O Nexus usa um número sequencial (N001…) que o usuário confirmou ser provisório.

**Decisão.** O MAC principal é obrigatório e único em `devices`. Há campo para um segundo MAC (Wi-Fi) e uma etiqueta interna opcional. Modelos "a granel" (headsets, cabos) não têm MAC: são saldos por (modelo, lugar, modalidade) em `bulk_stock`.

**Consequência.** Cadastrar um aparelho exige ler a etiqueta do MAC. Em troca, o identificador é único de fábrica e não depende de ninguém inventar número.
