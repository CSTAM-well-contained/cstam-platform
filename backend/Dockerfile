# Backend images, one Dockerfile, several targets (docker compose picks them with `target:`).
#   cpd      control plane (REST API, IPAM, lifecycle, built-in dashboard) + cstamctl
#   gateway  HAProxy 3.2 + keepalived + gwagent: one HA gateway, exactly like a FelCloud gateway VM

# ---- build every Go binary once -------------------------------------------------------------
FROM golang:1.25-bookworm AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN --mount=type=cache,target=/go/pkg/mod go mod download
COPY . .
ARG VERSION=dev
RUN --mount=type=cache,target=/go/pkg/mod --mount=type=cache,target=/root/.cache/go-build \
    mkdir -p /out && for b in cpd gwagent cstamctl; do \
      CGO_ENABLED=0 go build -trimpath -ldflags "-s -w -X main.version=${VERSION}" -o /out/$b ./cmd/$b || exit 1; \
    done

# ---- control plane ---------------------------------------------------------------------------
# The docker CLI is here because the local sandbox driver (CSTAM_DRIVER=docker) creates one
# container per team through the host's Docker socket. With CSTAM_DRIVER=openstack it is unused.
FROM docker:27-cli AS cpd
RUN apk add --no-cache ca-certificates curl tzdata
COPY --from=build /out/cpd /out/cstamctl /usr/local/bin/
EXPOSE 8443
HEALTHCHECK --interval=5s --timeout=2s --start-period=10s --retries=6 \
  CMD curl -fsS http://127.0.0.1:8443/healthz || exit 1
ENTRYPOINT ["/usr/local/bin/cpd"]

# ---- HA gateway ------------------------------------------------------------------------------
FROM haproxy:3.2 AS gateway
USER root
RUN apt-get update \
 && apt-get install -y --no-install-recommends keepalived curl iproute2 procps \
 && rm -rf /var/lib/apt/lists/* \
 && (id keepalived_script >/dev/null 2>&1 || useradd -r -s /usr/sbin/nologin keepalived_script)
COPY --from=build /out/gwagent /opt/cstam/bin/gwagent
COPY docker/gateway-entrypoint.sh /entrypoint.sh
RUN chmod 755 /entrypoint.sh
EXPOSE 80
ENTRYPOINT ["/bin/sh", "/entrypoint.sh"]
