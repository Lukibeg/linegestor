# Imagem única: API + interface servida pela própria API (pasta apps/web/dist em /app).
# Node 24 = LTS ativo. O contêiner roda como o usuário "node", nunca como root:
# se um dia alguém escapar do programa, cai num usuário sem poder nenhum.
FROM node:24-bookworm-slim AS build
RUN corepack enable && corepack prepare pnpm@10.28.0 --activate
WORKDIR /src
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
COPY packages/db/package.json packages/db/
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm --filter @gestor/web build && pnpm --filter @gestor/api build

FROM node:24-bookworm-slim
RUN corepack enable && corepack prepare pnpm@10.28.0 --activate
# o Chromium monta o PDF do envio automático (1.7): é o mesmo navegador, sem janela, abrindo a
# própria página do sistema e mandando imprimir. As fontes cobrem o caso de o Google Fonts não abrir.
RUN apt-get update \
 && apt-get install -y --no-install-recommends chromium fonts-dejavu-core fonts-liberation \
 && rm -rf /var/lib/apt/lists/*
ENV CHROMIUM_PATH=/usr/bin/chromium \
    NODE_ENV=production \
    HOME=/home/node \
    PNPM_HOME=/home/node/.pnpm \
    npm_config_update_notifier=false
WORKDIR /src
COPY --from=build --chown=node:node /src ./
# /portal: os vídeos do portal do cliente (1.8). A pasta nasce do usuário "node", e o volume
# "portal" do docker-compose.prod.yml herda o dono na primeira vez que é montado.
RUN mkdir -p /home/node/.pnpm /home/node/.cache /portal/videos && chown -R node:node /home/node /portal
USER node
EXPOSE 3333
# aplica migrações e sobe a API (que também serve a interface em produção)
# as migrações e as notas de novidades entram sozinhas na partida; nota já existente é ignorada
CMD ["sh", "-c", "pnpm --filter @gestor/db migrate && (pnpm --filter @gestor/api novidades:importar || echo 'Novidades: importacao falhou; o sistema sobe assim mesmo') && pnpm --filter @gestor/api start"]
