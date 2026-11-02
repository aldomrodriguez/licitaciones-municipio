# Licitaciones · Municipio de Lobos
# Imagen para Coolify. Datos persistentes (base SQLite + documentos + backups) en /data.

FROM node:24-bookworm-slim AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH
RUN corepack enable
WORKDIR /app

FROM base AS deps
# Herramientas por si better-sqlite3 o argon2 no tienen binario precompilado para la plataforma.
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

FROM deps AS build
# El dominio queda fijo en el build (canonical, sitemap y protección CSRF del login).
# En Coolify, SITE_URL tiene que estar marcada como variable de build.
ARG SITE_URL=https://licitaciones.municipiodelobos.gob.ar
ENV SITE_URL=$SITE_URL
COPY . .
RUN pnpm build && pnpm prune --prod

FROM node:24-bookworm-slim AS runtime
ENV NODE_ENV=production HOST=0.0.0.0 PORT=4321 DATA_DIR=/data MIGRATIONS_DIR=/app/drizzle
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/drizzle ./drizzle
COPY --from=build /app/package.json ./
COPY scripts/backup.mjs ./scripts/backup.mjs
RUN mkdir -p /data && chown -R node:node /data
USER node
VOLUME /data
EXPOSE 4321
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD node -e "fetch('http://127.0.0.1:4321/salud').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/server/entry.mjs"]
