# 0001 — Por que reconstruir em vez de consertar o Nexus

**Contexto.** O Nexus (Laravel + Livewire) atende a operação, mas ninguém da empresa tem acesso ao código nem ao banco. Tem problemas estruturais: senhas em texto na tela e na URL, edição em massa sem seleção, 1.570 linhas renderizadas de uma vez, nenhum controle de permissão, exclusão definitiva.

**Decisão.** Reconstruir do zero em React + Node/TypeScript + PostgreSQL, mantendo os **24 objetivos** e os **184 itens do checklist de paridade** do mapeamento (Fase 1), sem se prender às telas nem à estrutura interna do Nexus.

**Consequência.** A migração de dados depende exclusivamente dos CSVs que o Nexus exporta (clientes, circuitos, linhas). O inventário (76 aparelhos) precisa ser cadastrado com os MACs.
