# Glossário

| Termo | O que significa no Ingline Gestão |
|---|---|
| **Cliente** | Empresa atendida pela Ingline. Também as organizações internas (Ingline Systems, VoiceNet), marcadas como "internas", porque aparecem como donas de DIDs e aparelhos. |
| **Produto** | Um dos itens do portfólio que o cliente pode assinar: LinePBX, FOP2, Omniboard, LineReports, LineChat, SZChat, VoiceNet, Equipamentos. |
| **Assinatura** | "O cliente X assina o produto Y", com data de ativação e, se encerrada, data de encerramento. |
| **LinePBX** | Central telefônica IP do grupo. A assinatura guarda onde está o servidor e como acessá-lo. |
| **FOP2** | Painel de operador sobre o Asterisk (produto de terceiro). |
| **Omniboard** | Sistema de call center do grupo, onde os agentes fazem login. |
| **LineReports** | Relatórios de operação telefônica. |
| **LineChat** | Atendimento multicanal (WhatsApp, Instagram, Facebook). |
| **SZChat** | Atendimento da Fortics, revendido antes do LineChat (legado). |
| **VoiceNet** | A operadora do grupo: tronco SIP e dona da numeração. |
| **Equipamentos** | Marca que o cliente pode receber aparelhos. Sem esse produto, não se movimenta aparelho para ele. |
| **Circuito** | Feixe contratado junto a uma operadora (ALGAR, VC1…). Agrupa DIDs e tem um número de canais. |
| **Canal** | Uma chamada simultânea. Um circuito de 30 canais atende 30 ligações ao mesmo tempo. |
| **DID** | Um número telefônico ("linha" no Nexus). Pertence a um circuito, é usado por um cliente (ou está livre) e tem um titular (normalmente VoiceNet). |
| **Livre** | DID sem cliente. |
| **Titular** | Quem detém o DID ou circuito junto à operadora (normalmente VoiceNet). Era "dono" nas primeiras versões. |
| **Número chave** | O número piloto do feixe junto à operadora — o principal da faixa. Fica no cadastro do circuito. |
| **Módulo** | Parte opcional dentro de um produto: Omniboard, FOP2 e NPS dentro do LinePBX; Dashboard de filas e NPS dentro do LineChat. O cliente assina o produto e liga os módulos que usa. |
| **Modelo** | Um tipo de aparelho (Grandstream GXP1610, Headset Genérico…). |
| **Serializado** | Modelo contado um a um, cada unidade com MAC. |
| **Granel** | Modelo contado por quantidade (headsets, cabos), sem identidade por unidade. |
| **MAC** | Endereço físico único de fábrica de um aparelho de rede (ex.: 00:0B:82:A1:B2:C3). Identifica o aparelho no sistema. |
| **Condição** | Estado do aparelho: Ativo, Em manutenção, Baixado, Vendido. |
| **Unidade** | A filial, loja ou setor do cliente onde o aparelho está ("Loja Simões Filho"). Preenchida ao entregar; some quando o aparelho volta para o estoque. |
| **Atribuído a** | O cliente com quem o aparelho está. Vazio = estoque. Era "onde está" nas primeiras versões. |
| **Modalidade** | Como o aparelho está com o cliente: locação, comodato ou venda. Era "como" nas primeiras versões. |
| **Movimentação** | Locação, venda, comodato ou devolução de aparelhos. Registra de onde, para onde, quantos, quem e quando. |
| **Locação** | Aparelho emprestado mediante pagamento; continua da Ingline. |
| **Comodato** | Aparelho emprestado sem cobrança; continua da Ingline. |
| **Venda** | Aparelho passa a ser do cliente; fica com condição "Vendido" no histórico. |
| **Devolução** | Aparelho volta do cliente para o estoque. |
| **Arquivar** | Tirar um cliente da lista sem apagar ("ocultar" no Nexus). |
| **Lixeira** | Onde ficam os registros excluídos, prontos para restaurar. |
| **Cofre / Segredo** | A tabela cifrada onde ficam as senhas guardadas. |
| **Auditoria** | O registro de quem fez o quê, em qual registro, quando. |
| **Papel** | Conjunto de permissões de um usuário (Leitor, Operador, Técnico, Administrador). |
| **Homologação** | Ambiente de teste, idêntico ao de produção, para experimentar sem risco. |
