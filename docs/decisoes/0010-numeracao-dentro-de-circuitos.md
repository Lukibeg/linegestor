# 0010 — Numeração vive dentro de Circuitos

**Contexto.** DIDs tinham uma tela própria no menu. Mas todo DID pertence (ou deveria pertencer) a um circuito; olhar a numeração é olhar os circuitos por dentro. Havia também um indicador "DIDs por canal" que não ajudava ninguém a decidir nada.

**Decisão.**
- O menu tem **Circuitos e DIDs**: no topo, quatro cartões (circuitos e canais, valor mensal pago às operadoras, DIDs em uso/livres, DIDs sem circuito); abaixo, duas abas — **Circuitos** e **Numeração** (todos os DIDs de todos os circuitos, com seleção e edição em massa).
- O endereço antigo `/dids` continua funcionando: redireciona para a aba Numeração com os mesmos filtros.
- "Dono" virou **Titular** (quem detém o contrato/o número junto à operadora) em telas, CSV e documentação.
- A relação "DIDs por canal" saiu. A barra de cada circuito mostra **quantos DIDs estão em uso** do total.

**Consequência.** Uma tela a menos no menu, e a numeração sempre no contexto do feixe. O alerta "circuito com DIDs mas 0 canais" continua no Painel.
