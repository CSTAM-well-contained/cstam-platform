# Orbit: a mock team app for the CSTAM showcase. A plain nginx site that shows which
# sandbox (hostname = team, IP) answered and which gateway (X-Served-By) routed the request.
#   docker build -t cstam/orbit-landing:1.0 demo/orbit-site
# Deploy it from the team portal: image cstam/orbit-landing:1.0, port 80.
FROM nginx:alpine
COPY default.conf /etc/nginx/conf.d/default.conf
COPY index.html Geist.woff2 GeistMono.woff2 /usr/share/nginx/html/
# nginx workers run as user nginx: the files must be world-readable, whatever mode the checkout has
RUN chmod 644 /etc/nginx/conf.d/default.conf /usr/share/nginx/html/* && chmod 755 /usr/share/nginx/html
EXPOSE 80
