# Admin console: built with Vite, served by nginx, which also reverse-proxies /v1 and /healthz
# to cpd (same origin: cpd sends no CORS headers). CPD_UPSTREAM picks the cpd.
#
# Targets (docker compose picks one with FRONTEND_TARGET in .env):
#   app       (default) npm ci + vite build inside Docker
#   prebuilt  copies frontend/dist built on your machine (npm ci && npm run build): no npm
#             download inside Docker, for slow or flaky networks

FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
# a cache across builds and patient retries: one stalled tarball must not fail the build
RUN --mount=type=cache,target=/root/.npm \
    npm ci --no-audit --no-fund --prefer-offline \
      --fetch-retries=6 --fetch-retry-mintimeout=10000 --fetch-retry-maxtimeout=120000 --fetch-timeout=300000
COPY . .
RUN npm run build

FROM nginx:1.27-alpine AS runtime
# Only these variables are substituted in the template, so nginx's own $variables stay.
ENV NGINX_ENVSUBST_FILTER=^(CPD_UPSTREAM|PUBLIC_PORT|STACK_MODE)$ CPD_UPSTREAM=http://10.20.0.5:8443 PUBLIC_PORT=80 STACK_MODE=
RUN rm -f /etc/nginx/conf.d/default.conf
COPY nginx.conf.template /etc/nginx/templates/default.conf.template
EXPOSE 8080
HEALTHCHECK --interval=10s --timeout=2s --retries=3 CMD wget -qO- http://127.0.0.1:8080/ >/dev/null || exit 1

FROM runtime AS prebuilt
COPY dist /usr/share/nginx/html

FROM runtime AS app
COPY --from=build /app/dist /usr/share/nginx/html
