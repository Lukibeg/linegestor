# 0051 — O PDF anexado abre sem baixar

**Contexto.** Na prévia do 2.0.1, em 17/10, olhando a ficha de uma negociação do Comercial, o Luan
perguntou nos comentários: *"aqui eu consigo copiar e colar pdf? que no caso são as propostas e quero
tbm que eu possa previsualizar os documentos e imagens aqui sem ter que baixar"*. Colar já funcionava (a
caixa de anotar pega o arquivo que vem no Ctrl+V); a imagem já abria grande na tela; **o PDF baixava** —
a política de segurança do site (`object-src 'none'`, no `seguranca.ts`) não deixa o leitor de PDF do
navegador abrir dentro do Gestor (a mesma razão por que o PDF do recibo de entrega baixa, decisão 0042).
Como o 2.0.1 não subiu, o leitor entrou nele.

**Decisão.**

- **O PDF anexado numa anotação** (de um chamado ou de uma negociação) aparece com o ícone de documento e,
  clicado, **abre numa janela dentro do Gestor**, página por página, na largura da janela, com o
  **Baixar** embaixo. A imagem continua como estava (a miniatura que abre grande). Word, Excel e o resto
  continuam baixando.
- **Quem desenha é o PDF.js** (`pdfjs-dist`, a biblioteca da Mozilla, a mesma do leitor do Firefox), e
  não o leitor do navegador: **a política de segurança fica igual** (nada de `object-src`, `frame-src` ou
  `wasm-unsafe-eval` novo). O PDF.js:
  - só carrega quando um PDF abre (`LeitorDePdf`, carregado sob demanda): o resto do sistema não fica
    mais pesado;
  - faz o trabalho pesado num **worker do próprio Gestor** (o `script-src 'self'` já deixa);
  - recebe os bytes do arquivo pela mesma rota do anexo (`GET /api/atendimento/anexos/:id`, com a regra de
    quem vê o painel) e **nunca executa o JavaScript que venha dentro do PDF** (a versão 5 não usa `eval`,
    e a política do site também não deixaria);
  - roda sem WebAssembly (`useWasm: false`): as imagens raras que pedem wasm (JPEG 2000) ficam de fora da
    página; o texto e as imagens comuns aparecem.
- **Até 60 páginas** na janela (uma proposta tem poucas; um manual de 300 travaria a tela): passou disso,
  a janela avisa e o resto se vê baixando. O PDF com senha ou com defeito diz isso e oferece o Baixar.
- **Colar o PDF.** A caixa de anotar já aceitava o arquivo no **Ctrl+V** (o print e o arquivo copiado da
  pasta, no Chrome e no Edge); a dica da caixa passou a dizer isso: *"cole um print ou um arquivo com
  Ctrl+V, ou arraste o arquivo até aqui"*. Continua até 5 arquivos de 10 MB por anotação.
- **O pacote.** `pdfjs-dist` 5.7.284 no `apps/web` (o build `legacy`, que funciona também nos navegadores
  um pouco mais antigos). A dependência opcional `@napi-rs/canvas` (só para usar o PDF.js no Node) fica
  de fora (`pnpm.ignoredOptionalDependencies`, no `package.json` da raiz): a imagem do Docker não leva o
  binário. No build, o PDF.js vira dois arquivos à parte (`pdf-*.js` e `pdf.worker.min-*.mjs`, ~1,8 MB),
  baixados só na primeira vez que alguém abre um PDF.
- **A prévia.** A negociação **PABX em nuvem — 40 ramais** (Padaria Estrela) tem a proposta revisada
  anexada na anotação da Camila — o PDF de duas páginas sai de `scripts/gerar-proposta-demo.py`
  (`apps/web/src/api/proposta-demo-midia.ts`), com os valores por produto da negociação. Na prévia, o
  leitor lê o anexo guardado na memória (`anexoBytes`), sem servidor.

**Alternativas consideradas.**

- **Abrir com o leitor do navegador** (um `<iframe>` ou `<embed>` com o PDF, mandado como `inline`): era
  o mais simples, mas pede afrouxar a política de segurança do site (`object-src`) para todo o sistema, e
  dentro da prévia (o claude.ai) o leitor do navegador também não abre. O PDF.js funciona nos dois.
- **Ver Word e Excel também** (com outras bibliotecas, como o mammoth e o SheetJS): mais peso para um caso
  raro — as propostas vão em PDF. Fica para um patch, se a equipe pedir.
- **Colar em qualquer lugar da ficha** (sem clicar na caixa de anotar): o colar teria de adivinhar o que
  a pessoa quer quando há uma janela aberta por cima; ficou na caixa, como no WhatsApp Web e no e-mail.
