# =========================================================================
# Anvesh Multi-Modal Vision Microservice Containerfile
# Standalone, secure, non-root microservice (~150MB RAM runtime)
# =========================================================================
FROM node:24-alpine AS build

WORKDIR /app
RUN apk add --no-cache python3 make g++

COPY package.json package-lock.json* turbo.json ./
COPY packages packages
COPY apps/vision apps/vision

RUN npm install
RUN npm run build -w @vaagatech/anvesh-shared -w @vaagatech/anvesh-vision

# Runtime Stage
FROM node:24-alpine AS runtime
WORKDIR /app
RUN apk add --no-cache libstdc++

ENV NODE_ENV=production
ENV ANVESH_VISION_HOST=0.0.0.0
ENV ANVESH_VISION_PORT=3853
ENV ANVESH_VISION_MODEL=mobileclip
ENV ANVESH_VISION_DEVICE=cpu

RUN addgroup -S anvesh && adduser -S anvesh -G anvesh

COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages ./packages
COPY --from=build /app/apps/vision ./apps/vision

RUN mkdir -p /tmp && chown -R anvesh:anvesh /tmp /app
USER anvesh

EXPOSE 3853

HEALTHCHECK --interval=20s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:3853/health || exit 1

CMD ["node", "apps/vision/dist/cli.js", "serve"]
