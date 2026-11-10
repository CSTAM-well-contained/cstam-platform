# Admin console: built with Vite, served by nginx, which also reverse-proxies /v1 and /healthz
# to cpd (same origin: cpd sends no CORS headers). CPD_UPSTREAM picks the cpd.
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

FROM nginx:1.27-alpine
# Only ${CPD_UPSTREAM} is substituted in the template, so nginx's own $variables stay.
ENV NGINX_ENVSUBST_FILTER=^CPD_UPSTREAM$ CPD_UPSTREAM=http://10.20.0.5:8443
RUN rm /etc/nginx/conf.d/default.conf
COPY nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 8080
HEALTHCHECK --interval=10s --timeout=2s --retries=3 CMD wget -qO- http://127.0.0.1:8080/ >/dev/null || exit 1
