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
| **MAC** | Endereço físico único de fábrica de um aparelho de rede (ex.: 00:0B:82:A1:B2:C3). Identifica o aparelho no sistema. |
| **Não aplicável (MAC)** | Aparelho que não tem MAC — headset, cabo, fonte. Continua sendo uma linha por unidade; só o campo MAC fica vazio, e a tela mostra "não aplicável". |
| **Condição** | Estado do aparelho: Ativo ou Inativo. Inativo é o que não pode ser entregue (quebrado, em conserto, sucateado). |
| **Unidade** | A filial, loja ou setor do cliente onde o aparelho está ("Loja Simões Filho"). Preenchida ao entregar; some quando o aparelho volta para o estoque. |
| **Atribuído a** | O cliente com quem o aparelho está. Vazio = estoque. Era "onde está" nas primeiras versões. |
| **Modalidade** | Como o aparelho está com o cliente: locação, comodato ou venda. Era "como" nas primeiras versões. |
| **Movimentação** | Locação, venda, comodato ou devolução de aparelhos. Registra de onde, para onde, quantos, quem e quando. |
| **Locação** | Aparelho emprestado mediante pagamento; continua da Ingline. |
| **Comodato** | Aparelho emprestado sem cobrança; continua da Ingline. |
| **Venda** | Aparelho passa a ser do cliente. Fica com modalidade "Venda" e sai das contagens do estoque — já não é nosso. |
| **Devolução** | Aparelho volta do cliente para o estoque. |
| **Arquivar** | Tirar um cliente da lista sem apagar ("ocultar" no Nexus). |
| **Lixeira** | Onde ficam os registros excluídos, prontos para restaurar. |
| **Cofre / Segredo** | A tabela cifrada onde ficam as senhas guardadas. |
| **Auditoria** | O registro de quem fez o quê, em qual registro, quando. |
| **Papel** | Conjunto de permissões de um usuário (Leitor, Operador, Técnico, Administrador). |
| **Homologação** | Ambiente de teste, idêntico ao de produção, para experimentar sem risco. |

## Palavras da hospedagem

| Termo | O que significa |
|---|---|
| **VPS** | Um computador alugado num centro de dados, ligado 24 h. "Servidor virtual privado". |
| **Contêiner (Docker)** | Um programa empacotado com tudo de que precisa para rodar. Sobe igual em qualquer máquina. |
| **Porta** | O "número da sala" onde um programa atende. O site é a 443 (HTTPS); o banco, a 5432. Fechar uma porta é trancar aquela sala para quem vem de fora. |
| **Proxy reverso** | O porteiro do prédio: é o único endereço que aparece para a rua. Recebe a visita, confere, e leva até a sala certa lá dentro. Quem chega nunca fala direto com quem está dentro. |
| **Caddy** | O proxy reverso que escolhemos. Faz o papel de porteiro e ainda cuida sozinho do certificado do cadeado (HTTPS) — pede, instala e renova sem ninguém lembrar. |
| **Certificado / HTTPS** | O cadeado do navegador. Garante que ninguém no caminho lê ou troca o que passa entre o computador da pessoa e o servidor. |
| **Let's Encrypt** | Quem emite esses certificados de graça. O Caddy conversa com ele automaticamente. |
| **Firewall** | A porta da rua do servidor: decide quais portas aceitam visita. No nosso caso, só SSH, 80 e 443. |
| **SSH** | O jeito de entrar no servidor pelo terminal. No nosso caso, só com chave — senha não funciona. |
