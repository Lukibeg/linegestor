# 0056 — Sem o HTTP/3, e a leitura com prazo

**Data:** 27/10/2026 · **Patch:** 2.1.3 · **Situação:** aceita

## O problema

O Luan, 27/10: *"to enfrentando mt problema de lentidão, do nada o gestão fica lento mesmo com a internet boa, ele fica
carregando e n vai, n é sempre que acontece"*, e depois: *"acho q o problema é no meu edge, no chrome ta funcionando"*.

- O menu aparecia e o meio da tela ficava em "Carregando…" para sempre: o `/api/auth/me` tinha respondido, e o pedido
  seguinte (a ficha do circuito, o quadro) não voltava.
- O servidor estava saudável: medido do Chrome dele, no mesmo momento, o `/api/health` levava uns 110 ms na ida e volta
  e menos de 1 ms no servidor (o `Server-Timing` do 2.1.2), sem nenhum lento em 15 seguidos.
- Todas as abas do Gestor no Edge travavam juntas, e o Chrome, na mesma rede, funcionava: cada navegador tem a sua
  conexão com o servidor.
- **A prova:** no Edge travado, `edge://net-internals/#sockets` › **Flush socket pools** (fecha as conexões abertas) e
  F5 — destravou na hora. Era a conexão presa, e não o servidor nem a internet.
- A conexão era HTTP/3 (o QUIC, por UDP: o `nextHopProtocol` dos pedidos era `h3`), que o Caddy liga sozinho. O QUIC pode
  ficar preso sem erro quando o caminho perde o UDP no meio (o roteador que esquece a conexão), e o navegador só desiste
  depois de um bom tempo.
- E o Gestor esperava a resposta sem prazo nenhum (o `fetch` do `client.ts`): a leitura presa não virava erro.

## O que muda

- **O Caddy sem o HTTP/3** (`servers { protocols h1 h2 }`, no bloco global do `Caddyfile`): o Gestor vai só por HTTP/2
  (e HTTP/1.1), pelo TCP. Para um sistema como o Gestor (poucos pedidos pequenos), o HTTP/2 é tão rápido quanto, e o TCP
  não tem esse engasgo. O `443/udp` fica no `docker-compose.prod.yml`, sem nada ouvindo: o navegador que ainda lembra do
  HTTP/3 (o `Alt-Svc` guardado) recebe a recusa e vai pelo TCP.
- **A leitura com prazo** (`PRAZO_DA_LEITURA_MS`, 30 s, no `http()` de `apps/web/src/api/client.ts`): o GET que não chega
  inteiro (o cabeçalho e o corpo) em 30 s desiste, com o erro *"O servidor não respondeu em 30 segundos. Confira a
  internet e tente de novo (no navegador, F5)."* (status 0); o react-query tenta de novo uma vez. Gravar (POST, PUT,
  PATCH, DELETE) e baixar arquivo (`raw`) não têm prazo: o gravar que desiste no meio pode ter gravado do mesmo jeito. Com
  `AbortController` e `setTimeout` (o `AbortSignal.timeout` não existe no Safari dos iPhones antes do iOS 16).

## Para publicar

O Caddy não relê o `Caddyfile` sozinho (§8 do `gestor-como-continuar`): depois do `publicar.sh`,
`docker compose -f docker-compose.prod.yml up -d --force-recreate caddy`. Para conferir, no Chrome ou no Edge, os pedidos
do Gestor com `nextHopProtocol` `h2` (no console: `performance.getEntriesByType('resource').map((e) => e.nextHopProtocol)`).

## Enquanto o 2.1.3 não sobe

No navegador que travar: `edge://net-internals/#sockets` (no Chrome, `chrome://net-internals/#sockets`) › **Flush socket
pools** e F5. No Edge dele, dá para desligar o QUIC do lado do navegador em `edge://flags` › *Experimental QUIC protocol* ›
Disabled.
