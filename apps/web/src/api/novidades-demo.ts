/**
 * O conteúdo da nota de novidades que a PRÉVIA mostra no login (a mesma de 2.0.4).
 * GERADO por `scripts/gerar-novidades-demo.mjs` a partir de `docs/novidades/` — não edite à mão.
 * No sistema de verdade a nota vem do banco, escrita na tela de Administração › Novidades.
 */
export type ItemDemo = { kind: 'novo' | 'melhorou' | 'corrigido' | 'atencao'; title: string; text: string; imagem?: string };
export type VideoDemo = { url: string; nome: string; tamanho: number; tipo: string };
export const NOTA_DEMO: { version: string; title: string; summary: string; items: ItemDemo[]; video?: VideoDemo } = {
  "version": "2.0.4",
  "title": "Trazer do Helena: o histórico de cada card volta a vir",
  "summary": "No ar, o Trazer do Helena não conseguia ler o histórico dos cards (o LineChat recusava o pedido), e as negociações vinham sem as etapas por onde passaram e com o ganho no mês errado. O 2.0.4 corrige o pedido: o histórico vem, e o ganho conta no dia da Conclusão do Helena.",
  "items": [
    {
      "kind": "corrigido",
      "title": "O histórico do Helena volta a vir",
      "text": "Em Administração › Importar / Exportar › Trazer do Helena, a leitura avisava *\"O Helena não devolveu o histórico de 57 cards\"*: o LineChat recusava o jeito como o Gestor pedia o card. Agora o pedido vai do jeito que o próprio Helena faz, e cada negociação vem com as etapas por onde passou, o ganho e a perda no dia da Conclusão de lá e quem fez cada coisa. Se você já trouxe sem o histórico, é só Ler de novo e Trazer: o que já veio é atualizado, sem duplicar."
    }
  ]
};
