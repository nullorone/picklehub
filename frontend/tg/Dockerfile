FROM node:22.19.0-alpine AS build
ARG RELEASE_VERSION=0.0.0-local
ARG VCS_REF=0000000000000000000000000000000000000000
ARG SOURCE_DATE_EPOCH=0
ENV RELEASE_VERSION=${RELEASE_VERSION}
ENV VCS_REF=${VCS_REF}
ENV SOURCE_DATE_EPOCH=${SOURCE_DATE_EPOCH}
WORKDIR /workspace
COPY package.json package-lock.json turbo.json tsconfig.base.json ./
COPY backend/package.json ./backend/package.json
COPY contracts ./contracts
COPY scripts/release/build-client.mjs ./scripts/release/build-client.mjs
COPY frontend ./frontend
RUN npm ci --ignore-scripts
RUN npm run build:release --workspace @picklehub/tg

FROM nginx:1.29.1-alpine
ARG RELEASE_VERSION=0.0.0-local
ARG VCS_REF=0000000000000000000000000000000000000000
LABEL org.opencontainers.image.title="PickleHub Telegram Mini App" \
      org.opencontainers.image.version="${RELEASE_VERSION}" \
      org.opencontainers.image.revision="${VCS_REF}" \
      org.opencontainers.image.source="https://github.com/picklehub/picklehub"
COPY frontend/nginx.conf /etc/nginx/nginx.conf
COPY frontend/tg/nginx.conf /etc/nginx/conf.d/default.conf
COPY frontend/tg/security-headers.conf /etc/nginx/snippets/picklehub-security.conf
COPY --from=build /workspace/frontend/tg/dist /usr/share/nginx/html
EXPOSE 8080
USER nginx
RUN nginx -t
