FROM node:24-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json vite.config.js index.html ./
COPY src ./src
RUN npm ci && npm run build

FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
