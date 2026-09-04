FROM node:22.19.0-alpine AS build
WORKDIR /workspace
COPY package.json package-lock.json turbo.json tsconfig.base.json ./
COPY backend/package.json ./backend/package.json
COPY contracts ./contracts
COPY frontend ./frontend
RUN npm ci --ignore-scripts
RUN npm run build --workspace @picklehub/tg

FROM nginx:1.29.1-alpine
COPY frontend/tg/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /workspace/frontend/tg/dist /usr/share/nginx/html
EXPOSE 8080
USER nginx
