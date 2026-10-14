# API + worker comparten imagen; el comando decide el rol.
FROM node:22-bookworm-slim AS base
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg fonts-dejavu-core openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app

FROM base AS build
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
RUN npm ci -w @fruti/api -w @fruti/shared --include-workspace-root --ignore-scripts
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN npm run db:generate -w @fruti/api && npm run build -w @fruti/api

FROM base AS runtime
ENV NODE_ENV=production
COPY --from=build /app/node_modules node_modules
COPY --from=build /app/apps/api/dist apps/api/dist
COPY --from=build /app/apps/api/prisma apps/api/prisma
COPY --from=build /app/apps/api/package.json apps/api/
COPY --from=build /app/packages/shared packages/shared
WORKDIR /app/apps/api
EXPOSE 4000
# Rol API (por defecto). Para el worker: CMD ["node", "dist/worker.js"]
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/server.js"]
