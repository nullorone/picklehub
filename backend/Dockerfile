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

FROM node:22.19.0-bookworm-slim AS production-dependencies
ENV PRISMA_SKIP_POSTINSTALL_GENERATE=true
WORKDIR /app
RUN apt-get update \
    && apt-get install --no-install-recommends --yes openssl \
    && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
COPY backend/package.json backend/package.json
# Resolve Prisma engines against the same OpenSSL version as the runtime image.
# The CLI fails the build if an engine cannot be downloaded (postinstall may silently skip it).
RUN npm ci --ignore-scripts --omit=dev --workspace @picklehub/backend --include-workspace-root \
    && node node_modules/prisma/build/index.js --version

FROM node:22.19.0-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
RUN apt-get update \
    && apt-get install --no-install-recommends --yes openssl tini \
    && rm -rf /var/lib/apt/lists/*
COPY --from=production-dependencies /app/node_modules ./node_modules
COPY --from=production-dependencies /app/backend/node_modules ./backend/node_modules
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY package.json ./package.json
COPY --from=build /app/backend/dist ./backend/dist
COPY --from=build /app/backend/prisma ./backend/prisma
COPY --from=build /app/backend/package.json ./backend/package.json
USER node
# Load both module graphs without starting Nest or connecting to external services.
RUN --network=none node -e "require('./backend/dist/app.module.js'); require('./backend/dist/worker.module.js');"
EXPOSE 3000
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "backend/dist/main.js"]

FROM runtime AS migration
# Verify the packaged engines work as the runtime user without downloading anything.
RUN --network=none node node_modules/prisma/build/index.js --version
CMD ["npm", "run", "prisma:migrate", "--workspace", "@picklehub/backend"]
