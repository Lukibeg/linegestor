# 0009 — Módulos dentro dos produtos (e sem faturamento por cliente)

**Contexto.** No Nexus, FOP2 e Omniboard apareciam como "produtos" soltos, no mesmo nível do LinePBX. Na prática são partes opcionais do LinePBX — assim como NPS e o Dashboard de filas são partes do LineChat. E o Nexus tinha um "valor" por produto que ninguém preenchia.

**Decisão.**
- **Produto** é o que o cliente assina (LinePBX, LineChat, LineReports, SZChat, VoiceNet, Equipamentos).
- **Módulo** é uma parte opcional dentro de um produto. Catálogo inicial: LinePBX → Omniboard, FOP2, NPS · LineChat → Dashboard de filas, NPS. A Administração pode criar outros.
- Um módulo só pode ser ligado dentro de um produto que o cliente já assina (o servidor recusa o contrário). Desligar mantém a data e a configuração (histórico), igual aos produtos.
- FOP2 e Omniboard continuam com configuração própria (ramal admin; login e senhas no cofre), agora presa ao módulo, não à assinatura.
- **Não existe valor mensal por produto.** Custo só em aparelhos e circuitos ("links"), que é o que a empresa acompanha hoje.
- Na importação de CSV, `fop2` e `omniboard` na coluna de produtos viram automaticamente módulos do LinePBX — assim o CSV do Nexus entra sem retrabalho.

**Consequência.** A lista de clientes pode filtrar e mostrar módulos ("quem tem NPS?"). Tabelas: `product_modules` (catálogo) e `subscription_modules` (o que cada cliente tem ligado); `fop2_settings` e `omniboard_settings` apontam para `subscription_modules`.
