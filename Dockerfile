# Single image: builds the React frontend and serves it from the Express API.
FROM node:24-alpine AS web
WORKDIR /web
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM node:24-alpine
RUN apk add --no-cache su-exec \
    && apk add --no-cache --virtual .build-deps python3 make g++
WORKDIR /app
COPY backend/package.json backend/package-lock.json ./
RUN npm ci --omit=dev \
    && apk del .build-deps \
    && npm cache clean --force
COPY backend/server.js backend/i18n.js ./
COPY --from=web /web/dist ./public
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh && mkdir -p /app/data

EXPOSE 3001
ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "server.js"]
