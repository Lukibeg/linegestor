# 0007 — Nada é apagado de verdade

**Contexto.** No Nexus, excluir é definitivo ("essa ação não pode ser desfeita").

**Decisão.** Clientes, circuitos, DIDs, modelos e aparelhos têm `deleted_at`. Excluir preenche a data; as listas ignoram esses registros; a Administração tem uma Lixeira com "Restaurar". Circuitos com DIDs e modelos com aparelhos recusam exclusão até serem esvaziados.

**Consequência.** Um clique errado é reversível. O banco cresce um pouco mais; vale a pena.
