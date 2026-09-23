# Chamados do LineChat — como ligar e conferir

A tela **Chamados** mostra os chamados de suporte que a equipe abre no LineChat. O Gestor guarda
uma cópia do painel e a atualiza sozinho. Ligar é coisa de uma vez, feita por quem administra.

## Ligar (uma vez)

1. No **LineChat**, gere uma chave de API: **Integrações › Token**. Ela começa com `pn_`.
   Gere uma **só para o Gestor**: assim, se um dia precisar trocar, o resto não para.
2. No **Gestor**, abra **Administração › Ajustes › Chamados do LineChat**.
3. Cole a chave no campo **Chave de API do LineChat** e clique em **Salvar**.
4. Clique em **Buscar painéis**, escolha **Ingline - Suporte** e clique em **Salvar** de novo.
5. Ligue **Ler os chamados do LineChat a cada minuto** e salve.
6. Clique em **Sincronizar agora**. A primeira vez lê o painel inteiro: cerca de um minuto.
   No fim aparece algo como *"Leitura completa: 3.194 cards lidos, 3.194 novos."*

Pronto: o menu **Chamados** já mostra os números, e o Gestor passa a buscar sozinho, a cada minuto,
o que mudou. De madrugada (às 4h) ele relê o painel inteiro para conferir.

## Conferir que está funcionando

- No topo da tela **Chamados** aparece **atualizado há X min**. Se aparecer **a leitura falhou**,
  passe o mouse em cima para ver o motivo.
- Em **Ajustes › Chamados do LineChat**: **Última leitura**, quantos chamados estão guardados e
  **Últimas leituras registradas**.
- **Testar agora** confere a chave e o painel sem gravar nada.

## Quando algo dá errado

| O que aparece | O que fazer |
|---|---|
| *O LineChat recusou o token (401)* | A chave foi apagada ou trocada no LineChat. Gere outra e salve. |
| *O LineChat não encontrou esse painel (404)* | O painel foi apagado ou trocado. **Buscar painéis** e escolha de novo. |
| *Não consegui falar com o LineChat* | O LineChat ou a internet do servidor estão fora. A leitura tenta de novo sozinha a cada minuto. |
| *Atenção: o LineChat devolveu N cards, e aqui há M* | Veio muito menos do que o esperado. Nada foi marcado como excluído. Confira o painel e a chave. |

Se a leitura ficar 15 minutos seguidos falhando, o Gestor manda **um** aviso pelo mesmo caminho dos
avisos do sistema (o WhatsApp, se estiver configurado em Ajustes › Avisos).

## O que a cópia guarda

- **Os chamados**, com etapa, responsável, vencimento, etiquetas e os campos do card.
- **Cada mudança de etapa**, com a hora. O LineChat não entrega esse histórico pela API: quem anota
  é o Gestor, a partir da primeira leitura. É daí que vai sair o tempo em cada nível.
- **O que foi excluído no LineChat** fica marcado e sai das contas, mas não é apagado.

Os chamados continuam sendo abertos e trabalhados **no LineChat**. O Gestor só lê.
