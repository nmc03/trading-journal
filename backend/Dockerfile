FROM node:24-alpine

RUN apk add --no-cache su-exec \
    && apk add --no-cache --virtual .build-deps python3 make g++

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev \
    && apk del .build-deps \
    && npm cache clean --force

COPY server.js ./
RUN mkdir -p /app/data
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

EXPOSE 3001
ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "server.js"]
