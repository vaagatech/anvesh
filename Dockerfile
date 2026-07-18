# Engine API image (from monorepo root) — optional; local uses npm run dev:engine
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* ./
COPY apps/engine/package.json apps/engine/
RUN npm install -w @vaagatech/anvesh-engine
COPY apps/engine apps/engine
RUN npm run build -w @vaagatech/anvesh-engine && npm prune --omit=dev

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV ANVESH_STORAGE=filesystem
ENV ANVESH_DATA_DIR=/data
ENV ANVESH_PORT=3848
ENV ANVESH_HOST=0.0.0.0
ENV ANVESH_LOG_PRETTY=0
RUN addgroup -S anvesh && adduser -S anvesh -G anvesh
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/engine ./apps/engine
RUN mkdir -p /data /tmp && chown -R anvesh:anvesh /data /tmp /app
USER anvesh
WORKDIR /app/apps/engine
EXPOSE 3848
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3848/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/cli.js", "serve"]
