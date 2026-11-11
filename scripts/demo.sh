#!/usr/bin/env bash
# scripts/demo.sh: run and drive the CSTAM platform for a jury. Needs Docker (with compose),
# curl, jq and openssl. Everything talks to the stack the way a user would: the REST API on
# localhost:8080/v1 (through the console) and the "floating IP" edge on localhost:8000.
#
#   up [felcloud]       build and start the stack (felcloud: team sandboxes = real FelCloud VMs)
#   urls                console, API, tokens and team URLs
#   seed [N]            hackathon $HACK with N teams (default 4), each checked through the VIP
#   spinup NAME         one team, timed from the API call to its own page answering via the VIP
#   portal [NAME]       a team's portal token (creates the team if needed): sign in with it to
#                       deploy an image and make the app public or private
#   stress [N]          N registrations at the same time (default 20): p50/p95, distinct IPs
#   traffic [SECONDS]   steady HTTP load on every ready team (fills the console's Traffic page)
#   failover [planned|crash]
#                       planned: API failover of the MASTER, then failback (~0.3 s)
#                       crash:   freeze the MASTER container (~1.5 s), then unfreeze it
#                       both probe a team through the VIP every 20 ms and report the outage
#   config              good config, broken config (auto rollback), syntax error (rejected),
#                       then manual rollback, while a team is probed through the VIP
#   teardown            end hackathon $HACK: sandboxes and routes removed, IPs quarantined, freed
#   status              gateways, teams, IP pool, containers
#   logs [service]      follow logs (cpd, gw1, gw2, frontend, edge, postgres)
#   down                stop everything, keep data and teams (up resumes)
#   reset               remove everything, database included (up starts fresh)
#   fresh               reset + up + pre-pull the demo images (nginx:alpine, traefik/whoami)
#   jury                the guided demo: one step per Enter, with a caption for each
#   felcloud-check      read-only: your FelCloud VMs, floating IPs, quota (openstack CLI)
#   felcloud-ids        read-only: write the network/subnet/security group IDs into .env
set -euo pipefail
cd "$(dirname "$0")/.."

# ---------------------------------------------------------------------------------- setup ----
die() { echo "demo: $*" >&2; exit 1; }
say() { printf '\033[1;32m== %s\033[0m\n' "$*"; }
note() { printf '\033[2m   %s\033[0m\n' "$*"; }

need() { for c in "$@"; do command -v "$c" >/dev/null || die "missing '$c' (install it first)"; done; }

ensure_env() {
  if [ ! -s .env ]; then
    need openssl
    cp .env.example .env
    sed -i.bak \
      -e "s/^CSTAM_ADMIN_TOKEN=.*/CSTAM_ADMIN_TOKEN=$(openssl rand -hex 16)/" \
      -e "s/^CSTAM_VIEWER_TOKEN=.*/CSTAM_VIEWER_TOKEN=$(openssl rand -hex 16)/" \
      -e "s/^CSTAM_GATEWAY_TOKEN=.*/CSTAM_GATEWAY_TOKEN=$(openssl rand -hex 16)/" .env
    rm -f .env.bak
    chmod 600 .env
    note "created .env with fresh tokens"
  fi
}
load_env() {
  [ -s .env ] || return 0
  set -a
  # shellcheck disable=SC1091
  . ./.env
  set +a
}
ensure_env_quiet() { [ -s .env ] || ensure_env; load_env; }

ensure_env_quiet
HACK=${HACK:-demo}
DOMAIN=$HACK.localhost
API="http://127.0.0.1:${FRONTEND_PORT:-8080}"   # the console proxies /v1 and /healthz to cpd
EDGE="http://127.0.0.1:${EDGE_PORT:-8000}"
CONSOLE="http://localhost:${FRONTEND_PORT:-8080}"

compose() {
  local files=(-f docker-compose.yml)
  [ "$(cat .mode 2>/dev/null)" = felcloud ] && files+=(-f docker-compose.felcloud.yml)
  docker compose "${files[@]}" "$@"
}
api() { # api METHOD PATH [JSON]
  curl -sS -m 30 -X "$1" -H "Authorization: Bearer $CSTAM_ADMIN_TOKEN" \
    -H "Content-Type: application/json" ${3:+-d "$3"} "$API$2"
}
now() { date +%s.%N; }
ms() { awk -v a="$1" -v b="$2" 'BEGIN { printf "%.0f", (b - a) * 1000 }'; }
# via HOST: GET / through the edge (the floating IP) with that Host; prints "<code> <gateway> <body>"
via() {
  local tmp; tmp=$(mktemp -d); : >"$tmp/hdr"; : >"$tmp/body"
  local code; code=$(curl -s -m "${TMO:-1}" -o "$tmp/body" -D "$tmp/hdr" -w '%{http_code}' -H "Host: $1" "$EDGE/" || true)
  local by; by=$(tr -d '\r' <"$tmp/hdr" 2>/dev/null | awk -F': ' 'tolower($1)=="x-served-by" {print $2}')
  echo "${code:-000} ${by:--} $(tr -d '\n' <"$tmp/body" 2>/dev/null)"
  rm -rf "$tmp"
}
# master: the gateway whose keepalived says MASTER
master() {
  for gw in gw1 gw2; do
    docker exec "cstam-$gw" cat /run/cstam/vrrp.state 2>/dev/null | grep -q '^MASTER' && echo "$gw"
  done | head -1 || true
}
state_of() { docker exec "cstam-$1" cat /run/cstam/vrrp.state 2>/dev/null | awk '{print $1}' || true; }
hackathon() { # create $HACK if missing; an ended hackathon keeps its name, so move on to demo2, demo3...
  local st base=${HACK%%[0-9]*} n=1
  st=$(api GET "/v1/hackathons/$HACK" | jq -r '.state // empty')
  if [ "$st" = ended ] || [ "$st" = ending ]; then
    while :; do
      n=$((n + 1))
      st=$(api GET "/v1/hackathons/$base$n" | jq -r '.state // empty')
      [ "$st" = ended ] || [ "$st" = ending ] || break
    done
    note "hackathon $HACK is ended (its name stays taken): using $base$n, saved in .env"
    HACK=$base$n DOMAIN=$base$n.localhost
    sed -i.bak "s/^HACK=.*/HACK=$HACK/" .env && rm -f .env.bak
    grep -q '^HACK=' .env || echo "HACK=$HACK" >>.env
  fi
  local r; r=$(api POST /v1/hackathons "{\"name\":\"$HACK\",\"domain\":\"$DOMAIN\",\"lease_ttl_seconds\":7200}")
  if jq -e .error <<<"$r" >/dev/null 2>&1 && ! jq -r .error <<<"$r" | grep -qi exist; then
    die "hackathon $HACK: $(jq -r .error <<<"$r")"
  fi
}
# ready, public teams of every hackathon (the ones created in the console included)
ready_hosts() { api GET /v1/teams | jq -r '[.[] | select(.state=="ready" and .exposed != false) | .fqdn] | join(",")'; }
first_ready() { api GET /v1/teams | jq -r '[.[] | select(.state=="ready" and .exposed != false)][0].fqdn // empty'; }
wait_team() { # wait_team FQDN T0: wait until the team's own page answers through the VIP
  local host=$1 t0=$2 out="" team=${1%%.*}
  for _ in $(seq "${3:-300}"); do
    out=$(via "$host")
    [[ $out == "200 "*"team $team of "* ]] && break
    sleep 0.1
  done
  printf '   %-28s %6s ms   %s\n' "$host" "$(ms "$t0" "$(now)")" "$out"
}

# --------------------------------------------------------------------------------- commands --
up() {
  need docker curl jq
  docker compose version >/dev/null 2>&1 || die "docker compose plugin missing"
  local mode=${1:-local}
  [ "$mode" = local ] || [ "$mode" = felcloud ] || die "up [felcloud]"
  echo "$mode" >.mode
  if [ "$mode" = felcloud ]; then
    [ -n "${CSTAM_NETWORK_ID:-}" ] || die "FelCloud IDs missing in .env: run '$0 felcloud-ids' first"
    [ -s "${OS_CLOUDS_YAML:-$HOME/.config/openstack/clouds.yaml}" ] || die "no clouds.yaml (set OS_CLOUDS_YAML in .env)"
  fi
  check_subnet
  check_prebuilt
  mkdir -p /tmp/cstam-docker-sandbox 2>/dev/null || true
  say "building and starting the stack ($mode mode). First time: a few minutes."
  compose up -d --build
  check_nnp
  local ids; ids=$(docker ps -aq --filter label=cstam.sandbox --filter status=exited)
  [ -z "$ids" ] || { note "restarting $(wc -w <<<"$ids") team sandboxes"; docker start $ids >/dev/null; }
  say "waiting for cpd"
  for _ in $(seq 60); do curl -sf "$API/healthz" >/dev/null && break; sleep 1; done
  curl -sf "$API/healthz" >/dev/null || { compose logs --tail 20 cpd; die "cpd did not start"; }
  say "waiting for a gateway to hold the VIP 10.20.0.10"
  for _ in $(seq 60); do [ -n "$(master)" ] && break; sleep 1; done
  [ -n "$(master)" ] || { compose logs --tail 20 gw1; die "no gateway became MASTER"; }
  note "VIP held by $(master)"
  urls
}

# check_nnp: team containers run with --security-opt no-new-privileges. Docker installed from
# snap (AppArmor) refuses to exec any entrypoint with it ("exec /docker-entrypoint.sh: operation
# not permitted"): every team container then restarts forever and every team page is a 503.
# Probe once with the edge's image; if it fails that way, run team containers without the flag.
check_nnp() {
  [ "${DOCKER_NO_NEW_PRIVS:-true}" = false ] && { note "team containers run without no-new-privileges (DOCKER_NO_NEW_PRIVS=false in .env)"; return; }
  local out; out=$(docker run --rm --security-opt no-new-privileges haproxy:3.2 haproxy -v 2>&1 || true)
  if grep -qi "operation not permitted" <<<"$out"; then
    note "this Docker can't exec containers with no-new-privileges (Docker from snap?): turning it off for team containers"
    note "  ($out)"
    sed -i.bak '/^DOCKER_NO_NEW_PRIVS=/d' .env && rm -f .env.bak
    echo "DOCKER_NO_NEW_PRIVS=false" >>.env
    export DOCKER_NO_NEW_PRIVS=false
    compose up -d cpd >/dev/null
  fi
}

# check_subnet: 10.20.0.0/24 must be free. The old demo (cstam-demo), integration tests or another
# project may hold it in a Docker network; a VPN or host interface may hold it too.
check_subnet() {
  local busy="" n
  for n in $(docker network ls -q); do
    docker network inspect -f '{{.Name}} {{range .IPAM.Config}}{{.Subnet}} {{end}}' "$n" 2>/dev/null
  done | awk '$1 != "cstam-net" && / 10\.20\./ {print $1}' >"${TMPDIR:-/tmp}/cstam-nets" || true
  busy=$(cat "${TMPDIR:-/tmp}/cstam-nets"); rm -f "${TMPDIR:-/tmp}/cstam-nets"
  if [ -n "$busy" ]; then
    echo "demo: these Docker networks already use 10.20.0.x (FelCloud's IP plan, needed by this stack):" >&2
    for n in $busy; do
      echo "   network '$n', containers: $(docker network inspect -f '{{range .Containers}}{{.Name}} {{end}}' "$n" 2>/dev/null)" >&2
    done
    echo "   free it: stop the old demo ('cd ../monorepo && deploy/dev/demo.sh down'), or remove them:" >&2
    for n in $busy; do
      echo "     docker rm -f \$(docker network inspect -f '{{range .Containers}}{{.Name}} {{end}}' $n) 2>/dev/null; docker network rm $n" >&2
    done
    exit 1
  fi
  if command -v ip >/dev/null && ip -4 -o addr 2>/dev/null | grep -v ' br-' | grep -q ' 10\.20\.0\.'; then
    die "a network interface on this machine already has a 10.20.0.x address (VPN?): $(ip -4 -o addr | grep ' 10\.20\.0\.' | awk '{print $2, $4}' | head -1)"
  fi
  true
}

# check_prebuilt: FRONTEND_TARGET=prebuilt ships frontend/dist as it is, so a dist built from
# older source silently serves an old console (missing pages and buttons).
check_prebuilt() {
  [ "${FRONTEND_TARGET:-app}" = prebuilt ] || return 0
  [ -s frontend/dist/index.html ] ||
    die "FRONTEND_TARGET=prebuilt but frontend/dist is missing: cd frontend && npm ci && npm run build"
  if [ -n "$(find frontend/src frontend/index.html frontend/package.json -newer frontend/dist/index.html -print -quit 2>/dev/null)" ]; then
    printf '\033[1;33m!! frontend/dist is older than the console source (FRONTEND_TARGET=prebuilt): the console may miss\n' >&2
    printf '!! recent features. Rebuild it: cd frontend && npm ci && npm run build   (or set FRONTEND_TARGET=app)\033[0m\n' >&2
  fi
}

urls() {
  cat <<EOF

  Admin console           $CONSOLE
  REST API                $CONSOLE/v1/...   (Authorization: Bearer <token>)
  Admin token             $CSTAM_ADMIN_TOKEN
  Viewer token (jury)     ${CSTAM_VIEWER_TOKEN:-none}
  Team pages              http://<team>.$DOMAIN:${EDGE_PORT:-8000}/   (through the edge = floating IP -> VIP)
  Mode                    $(cat .mode 2>/dev/null || echo local)

EOF
}

seed() {
  local n=${1:-4} t0
  hackathon
  say "hackathon $HACK: $n teams"
  declare -A start
  for i in $(seq -f %02g "$n"); do
    start[team$i]=$(now)
    local r; r=$(api POST "/v1/hackathons/$HACK/teams" "{\"name\":\"team$i\",\"app_port\":8080}")
    if jq -e .error <<<"$r" >/dev/null; then note "team$i: $(jq -r .error <<<"$r") (skipped)"; unset "start[team$i]"; fi
  done
  felcloud_mode && { note "FelCloud mode: VMs take ~25 s each; watch Horizon > Instances"; return; }
  say "time from the API call to the team's own page through the VIP"
  for t in $(printf '%s\n' "${!start[@]}" | sort); do wait_team "$t.$DOMAIN" "${start[$t]}"; done
}

portal() {
  local name=${1:-alpha} id tok r
  hackathon
  id=$(api GET "/v1/hackathons/$HACK/teams" | jq -r --arg n "$name" '[.[] | select(.name == $n)][0].id // empty')
  if [ -z "$id" ]; then
    r=$(api POST "/v1/hackathons/$HACK/teams" "{\"name\":\"$name\",\"app_port\":8080}")
    jq -e .error <<<"$r" >/dev/null && die "team $name: $(jq -r .error <<<"$r")"
    tok=$(jq -r .token <<<"$r")
    felcloud_mode || wait_team "$name.$DOMAIN" "$(now)" >/dev/null
  else
    tok=$(api POST "/v1/teams/$id/token" | jq -r '.token // empty')
    [ -n "$tok" ] || die "could not issue a token for $name"
  fi
  say "team portal for $name"
  cat <<EOF2

  Sign in at     $CONSOLE   (in a new tab: each tab keeps its own sign-in)
  Team token     $tok
  App address    http://$name.$DOMAIN:${EDGE_PORT:-8000}/
  Try deploying  nginx:alpine on port 80, then Make private / Make public

EOF2
}

spinup() {
  local name=${1:?spinup NAME} t0
  hackathon
  say "spin up $name"
  t0=$(now)
  api POST "/v1/hackathons/$HACK/teams" "{\"name\":\"$name\",\"app_port\":8080}" | jq -c '{name, state, ip, slot, fqdn, error}'
  felcloud_mode && { note "FelCloud mode: watch the VM cstam-$HACK-$name appear in Horizon"; return; }
  wait_team "$name.$DOMAIN" "$t0"
  note "open http://$name.$DOMAIN:${EDGE_PORT:-8000}/ in the browser"
}

stress() {
  local n=${1:-20} dir; dir=$(mktemp -d)
  hackathon
  local t0; t0=$(now)
  for i in $(seq -f %03g "$n"); do
    api POST "/v1/hackathons/$HACK/teams" "{\"name\":\"s$i\",\"app_port\":8080}" >"$dir/post-$i" &
  done
  wait
  say "$n registrations sent at once; all API answers in $(ms "$t0" "$(now)") ms"
  felcloud_mode && { note "FelCloud mode: quota is ~6 VMs, extra teams fail with a quota error"; rm -rf "$dir"; return; }
  local pending=() i
  for i in $(seq -f %03g "$n"); do jq -e .error "$dir/post-$i" >/dev/null || pending+=("$i"); done
  : >"$dir/routed"
  while [ ${#pending[@]} -gt 0 ] && [ "$(ms "$t0" "$(now)")" -lt 180000 ]; do
    local left=()
    for i in "${pending[@]}"; do
      local body; body=$(curl -s -m 0.5 -H "Host: s$i.$DOMAIN" "$EDGE/" || true)
      if [[ $body == "team s$i of $HACK at "* ]]; then echo "$(ms "$t0" "$(now)") s$i" >>"$dir/routed"; else left+=("$i"); fi
    done
    pending=("${left[@]+"${left[@]}"}")
    sleep 0.1
  done
  sort -n "$dir/routed" -o "$dir/routed"
  local teams; teams=$(api GET "/v1/hackathons/$HACK/teams")
  awk -v n="$n" -v never="${#pending[@]}" '
    { t[NR] = $1 }
    END {
      if (NR == 0) { print "   no team routed"; exit 1 }
      printf "   routed %d/%d through the VIP (never routed: %d)\n", NR, n, never
      printf "   API call -> own page: p50 %d ms, p95 %d ms, max %d ms\n", t[int((NR-1)*0.5)+1], t[int((NR-1)*0.95)+1], t[NR]
    }' "$dir/routed"
  echo "   distinct IPs $(jq '[.[].ip] | unique | length' <<<"$teams"), distinct slots $(jq '[.[].slot] | unique | length' <<<"$teams")"
  rm -rf "$dir"
}

traffic() {
  local secs=${1:-30} hosts; hosts=$(ready_hosts)
  [ -n "$hosts" ] || die "no ready team (run: $0 seed)"
  local n; n=$(tr , '\n' <<<"$hosts" | wc -l)
  say "load: $n teams, ${secs}s, $((50 * n)) req/s through the VIP (open the console's Traffic page)"
  # -check-body=false: teams may run their own image (nginx...), not the default "team X" page
  docker exec cstam-cpd cstamctl load -url http://10.20.0.10/ -hosts "$hosts" -c 16 -d "${secs}s" -rate "$((50 * n))" \
    -check-body=false || true
}

failover() {
  local how=${1:-planned} m other host
  m=$(master); [ -n "$m" ] || die "no gateway holds the VIP"
  other=gw1; [ "$m" = gw1 ] && other=gw2
  [ "$(state_of "$other")" = BACKUP ] || die "$other is not BACKUP yet ($(state_of "$other")); wait a few seconds"
  host=$(first_ready); host=${host:-unknown.$DOMAIN}
  local probe; probe=$(mktemp)
  say "$m is MASTER. Probing $host through the VIP every 20 ms, then: $how failover of $m"
  ( end=$(( $(date +%s) + 10 ))
    while [ "$(date +%s)" -lt "$end" ]; do echo "$(now) $(TMO=0.2 via "$host" | cut -d' ' -f1,2)" >>"$probe"; sleep 0.02; done ) &
  local pid=$!
  sleep 2
  local t; t=$(now)
  case $how in
    planned) api POST "/v1/gateways/$m/failover" >/dev/null || true ;;
    crash)   docker pause "cstam-$m" >/dev/null ;;
    *) kill "$pid"; die "failover planned|crash" ;;
  esac
  wait "$pid"
  awk -v t="$t" -v old="$m" '
    $1 >= t && $2 == 200 && $3 != old && !back { back = $1; by = $3 }
    $1 >= t && $2 != 200 { lost++ }
    $1 >= t { total++ }
    END {
      if (back) printf "   %s took the VIP %.0f ms after the event; %d of %d probes failed\n", by, (back - t) * 1000, lost, total
      else if (!lost) print "   no outage seen"
      else print "   the VIP did not move during the probe"
    }' "$probe"
  rm -f "$probe"
  if [ "$how" = planned ]; then
    say "failback: $m returns as BACKUP (nopreempt, no second switch)"
    api POST "/v1/gateways/$m/failback" >/dev/null || true
  else
    say "unfreezing $m"
    docker unpause "cstam-$m" >/dev/null
  fi
  sleep 3
  note "VIP now held by $(master)"
}

config() {
  local host; host=$(first_ready)
  [ -n "$host" ] || die "no ready team (run: $0 seed)"
  local probe good="" step v; probe=$(mktemp)
  ( end=$(( $(date +%s) + 16 ))
    while [ "$(date +%s)" -lt "$end" ]; do TMO=0.5 via "$host" | cut -d' ' -f1 >>"$probe"; sleep 0.02; done ) &
  local pid=$!
  for step in \
    'push a good version (rate limit 1000 per 10 s)|{"rate_limit":1000,"reason":"demo: good"}' \
    'push a valid but broken version (healthz answers 500): each gateway rolls back|{"rate_limit":1000,"extra":["http-request return status 500 if { path /__gw/healthz }"],"reason":"demo: broken"}' \
    'push a syntax error: rejected by haproxy -c, never reaches HAProxy|{"rate_limit":1000,"extra":["this-is-not-a-directive"],"reason":"demo: typo"}'; do
    say "${step%%|*}"
    v=$(api POST /v1/config "${step#*|}" | jq -r .version)
    good=${good:-$v}
    sleep 3
    api GET /v1/status | jq -r '.gateways[] | "   \(.name): tried \(.config_tried) -> \(.config_outcome), serves \(.config_version)"'
  done
  say "manual rollback to $good"
  api POST "/v1/config/$good/rollback" | jq -r '"   new version \(.version): \(.reason)"'
  sleep 3
  api GET /v1/status | jq -r '.gateways[] | "   \(.name): serves \(.config_version) (\(.config_outcome))"'
  wait "$pid"
  say "$host meanwhile: $(grep -c '^200' "$probe") x 200, $(grep -vc '^200' "$probe" || true) errors"
  rm -f "$probe"
}

teardown() {
  say "ending hackathon $HACK: sandboxes and routes go, IPs wait in quarantine until both gateways ack"
  api DELETE "/v1/hackathons/$HACK" >/dev/null
  local t last="" line st; t=$(now)
  for _ in $(seq 300); do
    st=$(api GET /v1/status)
    line="teams $(jq -c .teams <<<"$st")  ip_pool $(jq -c .ip_pool <<<"$st")"
    [ "$line" != "$last" ] && printf '   %6s ms  %s\n' "$(ms "$t" "$(now)")" "$line" && last=$line
    [ "$(jq '.ip_pool.quarantine // 0' <<<"$st")" = 0 ] && [ "$(api GET "/v1/hackathons/$HACK/teams" | jq length)" = 0 ] && break
    sleep 0.5
  done
  note "hackathon $HACK is ended; the next seed or spinup starts a new one automatically"
}

status() {
  api GET /v1/status | jq '{gateways: [.gateways[] | {name, vrrp: .vrrp_state, alive, in_sync, config_version}], teams, ip_pool, alerts}' 2>/dev/null ||
    api GET /v1/status
  docker ps --filter name=cstam- --format 'table {{.Names}}\t{{.Status}}'
  note "VIP held by: $(master)"
}

# down: stop the platform and the team containers, keep everything (make up resumes it)
down() {
  local ids; ids=$(docker ps -q --filter label=cstam.sandbox)
  [ -z "$ids" ] || docker stop $ids >/dev/null
  compose stop
  say "stopped (data and teams kept: make up resumes)"
}
# reset: remove the containers, the team sandboxes, the network and the database
reset() {
  local ids; ids=$(docker ps -aq --filter label=cstam.sandbox)
  [ -z "$ids" ] || docker rm -f $ids >/dev/null
  compose down -v --remove-orphans
  rm -f .mode
  sed -i.bak 's/^HACK=.*/HACK=demo/' .env && rm -f .env.bak
  say "removed everything, database included (make up starts fresh)"
}

felcloud_mode() { [ "$(cat .mode 2>/dev/null)" = felcloud ]; }

felcloud_check() {
  need openstack
  export OS_CLOUD=${OS_CLOUD:-cstam}
  say "our VMs (cstam-cp .5, cstam-gw1 .11, cstam-gw2 .12 should be ACTIVE)"
  openstack server list --name '^cstam-' -c Name -c Status -c Networks
  say "floating IPs (none = FelCloud's public pool is still full: the VMs are unreachable from outside)"
  openstack floating ip list -c 'Floating IP Address' -c 'Fixed IP Address' -c Port
  say "instance quota (a team VM needs one free instance)"
  openstack limits show --absolute -f value | grep -E 'maxTotalInstances|totalInstancesUsed' || true
}

felcloud_ids() {
  need openstack
  export OS_CLOUD=${OS_CLOUD:-cstam}
  local net sub sg
  net=$(openstack network show cstam-sandbox-net -f value -c id)
  sub=$(openstack subnet show cstam-sandbox-subnet -f value -c id)
  sg=$(openstack security group show cstam-team -f value -c id)
  sed -i.bak -e "s/^CSTAM_NETWORK_ID=.*/CSTAM_NETWORK_ID=$net/" -e "s/^CSTAM_SUBNET_ID=.*/CSTAM_SUBNET_ID=$sub/" \
    -e "s/^CSTAM_TEAM_SG_ID=.*/CSTAM_TEAM_SG_ID=$sg/" .env && rm -f .env.bak
  say "written to .env: network $net, subnet $sub, team security group $sg"
}

# jury: the guided demo. Press Enter between steps; each step prints what to say.
jury() {
  pause() { printf '\n\033[1;33m▶ %s\033[0m  [Enter]' "$1"; read -r _; }
  felcloud_mode && note "FelCloud mode: spin-ups create real VMs (~25 s), routing steps are skipped"
  [ -n "$(master)" ] || die "the stack is not up: run '$0 up' first"
  urls
  pause "1. Teams: register 4 teams (console: Overview, watch the IP pool)"
  seed 4
  pause "2. One team, timed: API call -> sandbox -> route on both gateways -> page via the VIP"
  spinup "jury$(date +%H%M)"
  if ! felcloud_mode; then
    pause "3. Stress: 20 teams at the same time"
    stress 20
    pause "4. Planned failover (maintenance): the VIP moves in ~0.3 s (console: Overview)"
    failover planned
    pause "5. Crash: freeze the MASTER, keepalived moves the VIP in ~1.5 s"
    failover crash
    pause "6. Bad config: validated, rolled back automatically, zero dropped requests (console: Config)"
    config
  fi
  pause "7. Team portal: a team deploys its own image and decides if it is public"
  portal "team01"
  pause "8. Teardown: end the hackathon, IPs quarantined then recycled (console: IP pool)"
  teardown
  say "done. Thank you!"
}

case "${1:-}" in
  up|urls|seed|spinup|portal|stress|traffic|failover|config|teardown|status|jury) cmd=$1; shift; "$cmd" "$@" ;;
  logs) shift; compose logs -f --tail 50 "$@" ;;
  down) down ;;
  reset) reset ;;
  fresh) reset; up; for img in nginx:alpine traefik/whoami; do
           note "pre-pulling $img (team deploys start at once)"; docker pull -q "$img" >/dev/null 2>&1 || note "could not pull $img (offline?)"
         done ;;
  felcloud-check) felcloud_check ;;
  felcloud-ids) felcloud_ids ;;
  *) sed -n '2,28p' "$0"; exit 2 ;;
esac
