# Mock control plane + the real React console, in one container (no Postgres, no gateways).
# Build context is the repo root:  docker build -f demo/mock/Dockerfile -t cstam/mock:local .
FROM node:22-alpine AS console
WORKDIR /app
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/ ./
RUN npm run build

FROM node:22-alpine
WORKDIR /srv
COPY demo/mock/server.mjs ./
COPY demo/mock/apps ./apps
COPY --from=console /app/dist ./dist
# runs as user node: make everything readable whatever mode the checkout has
RUN chmod -R a+rX /srv
ENV PORT=8090 PUBLIC_PORT=8090
EXPOSE 8090
USER node
CMD ["node", "server.mjs", "dist"]
