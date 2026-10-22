/**
 * O conteúdo da nota de novidades que a PRÉVIA mostra no login (a mesma de 2.0.4.1).
 * GERADO por `scripts/gerar-novidades-demo.mjs` a partir de `docs/novidades/` — não edite à mão.
 * No sistema de verdade a nota vem do banco, escrita na tela de Administração › Novidades.
 */
export type ItemDemo = { kind: 'novo' | 'melhorou' | 'corrigido' | 'atencao'; title: string; text: string; imagem?: string };
export type VideoDemo = { url: string; nome: string; tamanho: number; tipo: string };
export const NOTA_DEMO: { version: string; title: string; summary: string; items: ItemDemo[]; video?: VideoDemo } = {
  "version": "2.0.4.1",
  "title": "Trazer do Helena: os ganhos no mês da Conclusão",
  "summary": "Mesmo com o 2.0.4, o LineChat continuou recusando o pedido de cada card, e os ganhos do Comercial ficaram quase todos em setembro. O 2.0.4.1 pede o card do jeito que o LineChat aceita — um detalhe por vez —, e a prévia agora avisa quando uma negociação vem sem a Conclusão.",
  "items": [
    {
      "kind": "corrigido",
      "title": "Os ganhos mês a mês como no Helena",
      "text": "No Trazer do Helena, o LineChat recusava o pedido de cada card (*\"The value 'Logs,Key,…' is not valid\"*): sem o card inteiro, não vinham o histórico nem a Conclusão, e cada ganho caía no dia da última mudança do card (no Comercial, quase tudo em setembro). Agora o Gestor pede cada detalhe separado, como já pedia a lista dos cards. Depois de atualizar, em Administração › Importar / Exportar › Trazer do Helena, é só Ler o Helena de novo, conferir na prévia os ganhos mês a mês (fev R$ 3.190, abr R$ 2.739,80, mai R$ 3.578,80, jun R$ 2.990, jul R$ 3.440, ago R$ 4.640, set R$ 6.593,20 e out R$ 990, como no gráfico de lá) e Trazer para o mesmo painel: o que já veio é atualizado, sem duplicar."
    },
    {
      "kind": "melhorou",
      "title": "A prévia avisa quando falta a Conclusão",
      "text": "Se uma negociação ganha ou perdida vier sem a Conclusão do Helena, a prévia diz quantas, embaixo dos ganhos mês a mês e em Bom saber, antes de você trazer. E, se o LineChat recusar algum detalhe do card, a prévia diz qual e traz o resto."
    }
  ]
};
