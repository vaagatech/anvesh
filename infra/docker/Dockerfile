FROM node:24-alpine AS build
WORKDIR /app
RUN apk add --no-cache python3 make g++
COPY package.json package-lock.json* turbo.json ./
COPY packages packages
COPY apps/engine apps/engine
COPY apps/spider apps/spider
COPY apps/indexer apps/indexer
COPY apps/hub-api apps/hub-api
RUN npm install
RUN npm run build -w @vaagatech/anvesh-shared -w @vaagatech/anvesh-plugins -w @vaagatech/vaakly -w @vaagatech/anvesh-search-adapters -w @vaagatech/anvesh-engine -w @vaagatech/anvesh-spider -w @vaagatech/anvesh-indexer -w @vaagatech/anvesh-hub-api

FROM node:24-alpine AS runtime
WORKDIR /app
RUN apk add --no-cache libstdc++
ENV NODE_ENV=production
ENV ANVESH_STORAGE=filesystem
ENV ANVESH_DATA_DIR=/data/engine
ENV ANVESH_SPIDER_DATA_DIR=/data/spider
ENV ANVESH_INDEXER_DATA_DIR=/data/indexer
ENV ANVESH_HUB_DATA=/data/hub
ENV ANVESH_PORT=3848
ENV ANVESH_HUB_PORT=3849
ENV ANVESH_SPIDER_PORT=3851
ENV ANVESH_INDEXER_PORT=3852
ENV ANVESH_HOST=0.0.0.0
ENV ANVESH_LOG_PRETTY=0
RUN addgroup -S anvesh && adduser -S anvesh -G anvesh
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages ./packages
COPY --from=build /app/apps/engine ./apps/engine
COPY --from=build /app/apps/spider ./apps/spider
COPY --from=build /app/apps/indexer ./apps/indexer
COPY --from=build /app/apps/hub-api ./apps/hub-api
RUN mkdir -p /data /data/engine /data/spider /data/indexer /data/hub /tmp && chown -R anvesh:anvesh /data /tmp /app
USER anvesh
WORKDIR /app
EXPOSE 3848 3849 3851 3852
CMD ["node", "apps/engine/dist/cli.js", "serve"]
