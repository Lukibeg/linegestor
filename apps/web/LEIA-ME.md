# apps/web — a interface (o que a equipe vê e usa)

Feita em React + TypeScript + Tailwind. Conversa com o servidor (`apps/api`) por HTTP; nunca acessa o banco direto.

Como está organizado:

- `src/main.tsx` — ponto de partida. `src/App.tsx` — o mapa de rotas (qual URL abre qual tela).
- `src/api/` — a "ponte" para o servidor:
  - `client.ts` — como falar com a API de verdade.
  - `demo.ts` — uma API **de mentira, em memória**, com dados fictícios. Usada para publicar uma prévia clicável sem servidor (`pnpm build:demo`).
  - `index.ts` — escolhe uma das duas. `hooks.ts` — os "ganchos" que as telas usam para carregar e gravar dados.
- `src/lib/auth.tsx` — quem está logado e o que pode (`<Can permission="...">` esconde o que a pessoa não pode fazer).
- `src/components/ui/` — peças reutilizáveis: botão, campo, tabela, modal, chip, aviso, campo de senha com "revelar"…
- `src/components/layout/` — a moldura: menu lateral (recolhível para só ícones), barra superior, busca global (Ctrl+K).
- `src/pages/` — uma pasta por área do menu: painel, clientes, circuitos (com a aba Numeração, que vem de `dids/`), inventario, dados, admin.
  - `clientes/Lista.tsx` — a lista tem um seletor de **colunas**: qualquer detalhe do cliente vira coluna, inclusive **cada módulo separadamente** ("LinePBX › FOP2"), e a escolha fica guardada no navegador.
  - `clientes/Ficha.tsx` — produtos e, dentro deles, os **módulos** (ligar, ajustar, desligar).
- `src/styles.css` — as cores e fontes (tema claro e escuro).

Comandos:
```
pnpm dev          # abre em http://localhost:5173 (precisa da API rodando em :3333)
pnpm build        # gera a versão de produção em dist/
pnpm build:demo   # gera a prévia sem servidor em dist-demo/
```

## Publicar a prévia (artefato)

`pnpm build:demo` gera `dist-demo/`, com nomes de arquivo que mudam a cada build
(`index-XXXX.js`, `index-XXXX.css`, `demo-XXXX.js`, `types-XXXX.js` e as imagens).

Ao publicar, **todos** os arquivos que o `index.html` e o bundle referenciam precisam ir
junto — inclusive os pedaços que só aparecem dentro do JS, como `demo-XXXX.js`. Publicar
só o `index-*.js` e esquecer o `demo-*.js` deixa a tela em branco, sem erro visível.

Confira antes de publicar:

```bash
ls dist-demo/assets
grep -o 'demo-[A-Za-z0-9_-]*\.js' dist-demo/assets/index-*.js | sort -u
```
