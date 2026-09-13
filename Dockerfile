# Imagem única: API + interface servida pela própria API (pasta apps/web/dist em /app).
# Usada em servidor próprio (docker compose) ou em plataformas que aceitam Dockerfile (Railway, Render, Fly).
FROM node:22-bookworm-slim AS build
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

FROM node:22-bookworm-slim
RUN corepack enable && corepack prepare pnpm@10.28.0 --activate
WORKDIR /src
ENV NODE_ENV=production
COPY --from=build /src ./
EXPOSE 3333
# aplica migrações e sobe a API (que também serve a interface em produção)
CMD ["sh", "-c", "pnpm --filter @gestor/db migrate && pnpm --filter @gestor/api start"]
