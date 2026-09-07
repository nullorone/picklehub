FROM node:22.19.0-bookworm-slim AS dependencies
ENV PRISMA_SKIP_POSTINSTALL_GENERATE=true
WORKDIR /app
COPY package.json package-lock.json ./
COPY backend/package.json backend/package.json
RUN npm ci --workspace @picklehub/backend --include-workspace-root

FROM dependencies AS build
COPY tsconfig.base.json ./
COPY backend backend
RUN PRISMA_SCHEMA_ENGINE_BINARY=/usr/bin/true \
    PRISMA_QUERY_ENGINE_LIBRARY=/usr/bin/true \
    npm run prisma:generate --workspace @picklehub/backend \
    && npm run build --workspace @picklehub/backend

FROM build AS migration
ENV NODE_ENV=production
CMD ["npm", "run", "prisma:migrate", "--workspace", "@picklehub/backend"]

FROM node:22.19.0-bookworm-slim AS production-dependencies
ENV PRISMA_SKIP_POSTINSTALL_GENERATE=true
WORKDIR /app
COPY package.json package-lock.json ./
COPY backend/package.json backend/package.json
RUN npm ci --ignore-scripts --omit=dev --workspace @picklehub/backend --include-workspace-root

FROM node:22.19.0-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
RUN apt-get update \
    && apt-get install --no-install-recommends --yes openssl tini \
    && rm -rf /var/lib/apt/lists/*
COPY --from=production-dependencies /app/node_modules ./node_modules
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /app/backend/dist ./backend/dist
COPY --from=build /app/backend/prisma ./backend/prisma
COPY --from=build /app/backend/package.json ./backend/package.json
USER node
EXPOSE 3000
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "backend/dist/main.js"]
