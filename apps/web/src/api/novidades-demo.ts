/**
 * O conteúdo da nota de novidades que a PRÉVIA mostra no login (a mesma de 2.4.3).
 * GERADO por `scripts/gerar-novidades-demo.mjs` a partir de `docs/novidades/` — não edite à mão.
 * No sistema de verdade a nota vem do banco, escrita na tela de Administração › Novidades.
 */
export type ItemDemo = { kind: 'novo' | 'melhorou' | 'corrigido' | 'atencao'; title: string; text: string; imagem?: string };
export type VideoDemo = { url: string; nome: string; tamanho: number; tipo: string };
export const NOTA_DEMO: { version: string; title: string; summary: string; items: ItemDemo[]; video?: VideoDemo } = {
  "version": "2.4.3",
  "title": "O /nia pronto logo depois de publicar",
  "summary": "O certificado da NIA passou a vir junto com o sistema. O /nia funciona logo depois de cada publicação, sem nenhum passo à mão no servidor.",
  "items": [
    {
      "kind": "melhorou",
      "title": "O /nia pronto logo depois de publicar",
      "text": "Para o Gestor conversar com a NIA com segurança, ele precisa do certificado dela. Antes, alguém tinha de copiar esse arquivo no servidor; agora ele vem junto com o sistema, e o /nia funciona logo depois de cada publicação. Nada muda no jeito de usar."
    }
  ]
};
