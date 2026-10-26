/**
 * O conteúdo da nota de novidades que a PRÉVIA mostra no login (a mesma de 2.1.2).
 * GERADO por `scripts/gerar-novidades-demo.mjs` a partir de `docs/novidades/` — não edite à mão.
 * No sistema de verdade a nota vem do banco, escrita na tela de Administração › Novidades.
 */
export type ItemDemo = { kind: 'novo' | 'melhorou' | 'corrigido' | 'atencao'; title: string; text: string; imagem?: string };
export type VideoDemo = { url: string; nome: string; tamanho: number; tipo: string };
export const NOTA_DEMO: { version: string; title: string; summary: string; items: ItemDemo[]; video?: VideoDemo } = {
  "version": "2.1.2",
  "title": "Valores exatos, cartões mais rápidos, painéis de atividades e os campos de cada painel",
  "summary": "O Comercial não arredonda mais nenhum valor. A ficha e o quadro abrem mais rápido, e a ficha carrega quando o mouse para em cima do cartão. O Trazer do Helena traz também um painel que não é de vendas, como o de atividades, para um painel de Gestão. E cada painel escolhe os campos que usa, na própria janela: dá para desligar até o cliente, o relato, a solução e a prioridade.",
  "items": [
    {
      "kind": "corrigido",
      "title": "Os valores do Comercial, exatos",
      "text": "No número do alto da tela dos painéis, no relatório (o Ganho, a Ativação, o Perdido, o Ticket médio, as diferenças e o rótulo de cada mês do gráfico), na prévia do Trazer do Helena e nos rótulos do mês a mês do Simulador, o valor aparece inteiro, com os centavos quando há: R$ 2.739,80, e não R$ 2.740; R$ 12.480, e não R$ 12 mil. No celular, o rótulo do mês quebra em duas linhas para caber."
    },
    {
      "kind": "melhorou",
      "title": "A ficha e o quadro abrem mais rápido",
      "text": "Abrir um cartão redesenhava o quadro inteiro, com todos os cartões, até três vezes: quando a janela abria, quando a ficha chegava e quando a janela fechava. E cada cartão escrevia a data da última atividade do jeito mais caro. Agora o quadro de baixo fica parado enquanto a janela abre e fecha, e a data sai na hora. Em computador mais lento, a diferença é maior."
    },
    {
      "kind": "novo",
      "title": "A ficha carrega antes do clique",
      "text": "Com o mouse parado em cima de um cartão do quadro ou de uma linha da lista, a ficha já começa a carregar: no clique, ela abre pronta. O mesmo no Abrir o quadro da tela dos painéis e no Painel do Suporte e no Painel do Comercial do menu."
    },
    {
      "kind": "novo",
      "title": "Trazer do Helena: o painel de atividades vira um painel de Gestão",
      "text": "Em Administração › Importar / Exportar › Trazer do Helena, o painel do Helena que não é de vendas (as suas atividades, os chamados internos) vai para um painel de Gestão: um novo, com o nome e a sigla de lá, ou um que já existe. Cada card vira um chamado, nas etapas de lá: \"Concluído\" resolve e \"Validado\" fecha. O painel novo não conta prazo e só quem está nos cards e quem traz veem. A prévia mostra quantos ficam abertos, resolvidos e fechados antes de gravar."
    },
    {
      "kind": "novo",
      "title": "Cada painel escolhe os campos que usa",
      "text": "Na janela do painel (Painéis › Ajustes › Painéis, ao criar ou em Editar), a aba Os campos liga e desliga o que o chamado daquele painel usa. Além do Assunto, do Tipo, da Gravidade, do Alcance, dos Produtos e das Operadoras, agora também o Cliente e o contato, o Relato do cliente, a Solução e a causa e a Prioridade: num painel de atividades internas, eles só atrapalham. Desligado, o campo some da ficha, do Abrir chamado e do quadro e deixa de ser pedido nas etapas; o que já estava preenchido volta se ligar de novo. Sem a prioridade, o painel não conta prazo."
    },
    {
      "kind": "melhorou",
      "title": "O painel desativado sai da tela dos painéis",
      "text": "O painel desativado (arquivado) não aparece mais em Painéis, ao lado dos que estão em uso. Embaixo, uma linha diz quantos estão desativados, com o caminho para reativar: Painéis › Ajustes › Painéis, em Editar, Painel ativo."
    }
  ]
};
