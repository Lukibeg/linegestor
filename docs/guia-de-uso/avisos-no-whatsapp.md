# Receber os avisos do sistema no WhatsApp

Quando o sistema deixa de responder, ou quando o backup falha, alguém precisa ficar sabendo na
hora. O Ingline Gestão manda esse recado para **um endereço que você escolhe** — no caso da Ingline,
a API do LineChat, que entrega no WhatsApp.

Configura-se em `Administração › Ajustes › Avisos`. Nada disso fica em arquivo no servidor.

---

## O que preencher

| Campo | O que é |
|---|---|
| **Endereço (URL)** | O endereço da API que envia a mensagem. Está na documentação do LineChat |
| **Método** | `POST` quase sempre; `GET` só se a API pedir |
| **Token / chave da API** | O token do LineChat. Fica cifrado no cofre e **nunca** volta a aparecer na tela |
| **Cabeçalhos** | Em JSON, como a API pedir |
| **Corpo da mensagem** | Em JSON, como a API pedir |

Duas palavras-chave podem ser usadas em qualquer um desses campos:

- `{{mensagem}}` — vira o texto do aviso ("o sistema não respondeu duas vezes seguidas…")
- `{{token}}` — vira o token guardado no campo acima

## Exemplo

Supondo que o LineChat receba um `POST` com `numero` e `mensagem`, autenticado por um token:

**Cabeçalhos**

```json
{
  "Content-Type": "application/json",
  "Authorization": "Bearer {{token}}"
}
```

**Corpo**

```json
{
  "numero": "5571999999999",
  "mensagem": "{{mensagem}}"
}
```

Ajuste os nomes dos campos (`numero`, `mensagem`) para os que a documentação do LineChat usar —
o sistema só monta a chamada; quem define o formato é a API do outro lado.

## Testar

Salve e clique em **Mandar teste agora**. Ele envia uma mensagem de verdade, com um texto dizendo
que é teste. A resposta da API aparece na tela — inclusive o erro, quando houver, para você
consertar o campo sem adivinhar.

## Quando o sistema manda aviso

| Situação | Quando |
|---|---|
| O sistema não responde | Depois de duas verificações seguidas sem resposta (o vigia confere a cada 5 min) |
| O sistema voltou | Assim que responde de novo |
| Continua fora do ar | A cada 30 minutos, enquanto durar |
| O backup falhou | Na hora, no backup das 3h |
| O backup não presta | Na checagem de segunda, se não restaurar ou vier vazio |

## Um detalhe importante

O vigia que confere se o sistema está de pé roda **fora** do sistema — senão não teria como avisar
quando ele cai. Por isso, toda vez que você salva os ajustes de aviso, o sistema grava uma cópia
pronta em `config/avisos.json`, que o vigia lê. Você não precisa fazer nada com isso; só não apague
essa pasta.

Como esse vigia mora no mesmo servidor, ele também não avisa se o **servidor inteiro** cair. Para
isso, vale somar um monitor de fora — UptimeRobot ou Better Stack, ambos com plano grátis —
apontando para `https://gestao.inglinesystems.com.br/api/health`.
