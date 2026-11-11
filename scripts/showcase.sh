#!/usr/bin/env bash
# scripts/showcase.sh: the demo video, reproducible on your machine.
#
# A hackathon goes up, 24 teams register at once (each gets an IP, a slot and a subdomain),
# one team signs in with its own token and deploys a website from a Docker image, and the site
# answers at its subdomain through the gateways' VIP. Then a planned failover, with no visible gap.
#
#   scripts/showcase.sh run [IMAGE]   the whole story; Enter between steps (STEP=0: no pauses)
#   scripts/showcase.sh up            start the stack if it is not up and build the Orbit image
#   scripts/showcase.sh hackathon     create the hackathon ($SHOW_HACK, domain $SHOW_HACK.localhost)
#   scripts/showcase.sh team [NAME]   spin up one team, print its token and portal link
#   scripts/showcase.sh burst [N]     N teams register at the same time (default 23)
#   scripts/showcase.sh deploy [NAME] [IMAGE] [PORT]
#                                     deploy IMAGE with NAME's own team token (not the admin's)
#   scripts/showcase.sh failover      planned failover of the MASTER, then failback
#   scripts/showcase.sh status        teams, IP pool, gateways
#   scripts/showcase.sh end           end the hackathon: sandboxes removed, IPs quarantined
#   scripts/showcase.sh doctor [NAME] why a team page does not answer (paste the output)
#
# IMAGE defaults to cstam/orbit-landing:1.0 (demo/orbit-site, built locally). Any image works
# if it listens on port 80 or 8000-8099: nginx:alpine, ghcr.io/you/app:1.0, a local tag...
#
# MOCK=1 drives the mock instead (demo/docker-compose.mock.yml, http://localhost:8090): the
# console against a simulated control plane, no gateways, no team containers. It is what the
# video was filmed on; use it when the full stack can't run. Same commands, same API.
set -euo pipefail
cd "$(dirname "$0")/.."

die() { echo "showcase: $*" >&2; exit 1; }
say() { printf '\n\033[1;32m== %s\033[0m\n' "$*"; }
note() { printf '\033[2m   %s\033[0m\n' "$*"; }
need() { for c in "$@"; do command -v "$c" >/dev/null || die "missing '$c' (install it first)"; done; }

if [ -s .env ]; then set -a; . ./.env; set +a; fi
MOCK=${MOCK:-0}
SHOW_HACK=${SHOW_HACK:-cstam-finals}
SHOW_TEAM=${SHOW_TEAM:-orbit-labs}
ORBIT_IMAGE=cstam/orbit-landing:1.0
if [ "$MOCK" = 1 ]; then
  CSTAM_ADMIN_TOKEN=${CSTAM_ADMIN_TOKEN:-1b4850a40736cb65bccc586e893081bb}
  API=http://127.0.0.1:8090; EDGE=$API; PUBLIC=8090; CONSOLE=http://localhost:8090
else
  API="http://127.0.0.1:${FRONTEND_PORT:-8080}"; EDGE="http://127.0.0.1:${EDGE_PORT:-8000}"
  PUBLIC=${EDGE_PORT:-8000}; CONSOLE="http://localhost:${FRONTEND_PORT:-8080}"
fi
DOMAIN=$SHOW_HACK.localhost
STATE=.showcase   # team tokens are shown once by the API: keep them here (gitignored)

api() { # api METHOD PATH [JSON]   (admin token)
  curl -sS -m 30 -X "$1" -H "Authorization: Bearer ${CSTAM_ADMIN_TOKEN:?no admin token: run make up first}" \
    -H "Content-Type: application/json" ${3:+-d "$3"} "$API$2"
}
team_api() { # team_api TOKEN METHOD PATH [JSON]   (a team's own token)
  curl -sS -m 30 -X "$2" -H "Authorization: Bearer $1" -H "Content-Type: application/json" ${4:+-d "$4"} "$API$3"
}
url() { [ "$PUBLIC" = 80 ] && echo "http://$1/" || echo "http://$1:$PUBLIC/"; }
pause() { if [ "${STEP:-1}" = 1 ] && [ -t 0 ]; then printf '\n\033[1;33m▶ %s\033[0m  [Enter]' "$1"; read -r _; else say "$1"; fi; }
team_id() { api GET "/v1/hackathons/$SHOW_HACK/teams" | jq -r --arg n "$1" '[.[] | select(.name==$n)][0].id // empty'; }
token_of() { [ -f "$STATE/$1.token" ] && cat "$STATE/$1.token" || true; }
save_token() { mkdir -p "$STATE"; chmod 700 "$STATE"; printf '%s' "$2" >"$STATE/$1.token"; chmod 600 "$STATE/$1.token"; }

# page HOST: GET / through the public entry (the edge = local floating IP) with that Host
page() { curl -s -m 2 -D - -o /dev/null -H "Host: $1" "$EDGE/" | tr -d '\r' | awk -F': ' 'NR==1{split($0,a," "); c=a[2]} tolower($1)=="x-served-by"{g=$2} END{print (c?c:"000")" "(g?g:"-")}' ; }
page_body() { curl -s -m 2 -H "Host: $1" "$EDGE/"; }
has_err() { jq -e '(.error // "") | length > 0' <<<"$1" >/dev/null 2>&1; }

wait_ready() { # wait_ready NAME [SECONDS]: team state ready
  local id; id=$(team_id "$1"); [ -n "$id" ] || die "no team $1 in $SHOW_HACK"
  for _ in $(seq $((${2:-90} * 5))); do
    case $(api GET "/v1/teams/$id" | jq -r .state) in
      ready) return 0 ;;
      failed) die "team $1 failed: $(api GET "/v1/teams/$id" | jq -r .error)" ;;
    esac
    sleep 0.2
  done
  die "team $1 not ready after ${2:-90} s"
}

# ------------------------------------------------------------------------------- commands ----
up() {
  need curl jq
  if [ "$MOCK" = 1 ]; then
    need docker
    curl -sf -m 2 "$API/healthz" >/dev/null 2>&1 || {
      say "starting the mock (console + simulated control plane) on $CONSOLE"
      CSTAM_ADMIN_TOKEN=$CSTAM_ADMIN_TOKEN docker compose -f demo/docker-compose.mock.yml up -d --build
      for _ in $(seq 60); do curl -sf -m 2 "$API/healthz" >/dev/null 2>&1 && break; sleep 1; done
    }
    curl -sf -m 2 "$API/healthz" >/dev/null || die "the mock does not answer on $API"
    return
  fi
  need docker
  if ! curl -sf -m 2 "$API/healthz" >/dev/null 2>&1; then
    say "the stack is not up: starting it (scripts/demo.sh up, a few minutes the first time)"
    scripts/demo.sh up
    set -a; . ./.env; set +a
  fi
  curl -sf -m 2 "$API/healthz" >/dev/null || die "the console does not answer on $API"
  say "building the mock team site $ORBIT_IMAGE (demo/orbit-site, cached after the first time)"
  docker build --network host -q -t "$ORBIT_IMAGE" demo/orbit-site >/dev/null
  note "image $ORBIT_IMAGE ready (local tag: cpd runs it on this Docker, no registry needed)"
}

hackathon() {
  local st r
  st=$(api GET "/v1/hackathons/$SHOW_HACK" | jq -r '.state // empty')
  if [ "$st" = active ]; then note "hackathon $SHOW_HACK is already up ($DOMAIN)"; return; fi
  if [ -n "$st" ]; then
    die "hackathon $SHOW_HACK has ended (names stay taken). Pick another: SHOW_HACK=finals2 $0 run"
  fi
  r=$(api POST /v1/hackathons "{\"name\":\"$SHOW_HACK\",\"domain\":\"$DOMAIN\",\"lease_ttl_seconds\":172800}")
  has_err "$r" && die "hackathon: $(jq -r .error <<<"$r")"
  say "hackathon $SHOW_HACK is up: teams are published at <team>.$DOMAIN"
}

team() {
  local name=${1:-$SHOW_TEAM} r id tok
  id=$(team_id "$name")
  if [ -z "$id" ]; then
    r=$(api POST "/v1/hackathons/$SHOW_HACK/teams" "{\"name\":\"$name\"}")
    has_err "$r" && die "team $name: $(jq -r .error <<<"$r")"
    tok=$(jq -r .token <<<"$r")
    printf '   202 provisioning   %-14s ip %-12s slot %s\n' "$name" "$(jq -r .ip <<<"$r")" "$(jq -r .slot <<<"$r")"
  else
    tok=$(api POST "/v1/teams/$id/token" | jq -r '.token // empty')   # a new one: the old stops working
  fi
  [ -n "$tok" ] || die "no token for $name"
  save_token "$name" "$tok"
  wait_ready "$name"
  if [ "$MOCK" != 1 ]; then
    local code=""
    for _ in $(seq 40); do code=$(page "$name.$DOMAIN" | cut -d' ' -f1); [ "$code" = 200 ] && break; sleep 0.25; done
    [ "$code" = 200 ] || { echo "   ! $name is ready but its page answers $code through the VIP"; doctor "$name"; die "stopped: paste the doctor output above"; }
  fi
  say "team $name is ready, its page answers through the VIP"
  cat <<EOF

  Team token     $tok
  Sign in at     $CONSOLE  (a new tab or a private window: each tab keeps its own sign-in)
  Its address    $(url "$name.$DOMAIN")
EOF
}

burst() {
  local n=${1:-23} i names=(nova byte-club quantum-bees null-island deep-fork lambda-lions packet-storm segfault
    hexagon zero-day-zebras cache-me async-ants tensor-tigers ping-pong git-gud bit-bandits cloud-nine
    kernel-sanders syntax-errors docker-dragons ip-freely sudo-squad merge-conflict)
  say "$n teams register at the same time"
  local tmp; tmp=$(mktemp -d)
  for ((i = 0; i < n; i++)); do
    local nm=${names[i]:-team$(printf %02d "$i")}
    ( api POST "/v1/hackathons/$SHOW_HACK/teams" "{\"name\":\"$nm\"}" >"$tmp/$i.json" ) &
  done
  wait
  local ok=0
  for ((i = 0; i < n; i++)); do
    if jq -e .ip "$tmp/$i.json" >/dev/null 2>&1; then
      ok=$((ok + 1)); printf '   202  %-16s %-12s slot %s\n' "$(jq -r .name "$tmp/$i.json")" "$(jq -r .ip "$tmp/$i.json")" "$(jq -r .slot "$tmp/$i.json")"
    else
      printf '   ---  %s\n' "$(jq -r '.error // "no answer"' "$tmp/$i.json" 2>/dev/null)"
    fi
  done
  rm -rf "$tmp"
  local ips; ips=$(api GET "/v1/hackathons/$SHOW_HACK/teams" | jq -r '.[].ip' | sort | uniq -d | wc -l)
  note "$ok accepted, duplicate IPs: $ips. Watch them turn ready in the console (IP pool, Teams)"
}

deploy() {
  local name=${1:-$SHOW_TEAM} image=${2:-$ORBIT_IMAGE} port=${3:-80} tok r host
  tok=$(token_of "$name")
  [ -n "$tok" ] || { team "$name" >/dev/null; tok=$(token_of "$name"); }
  [ "$(team_api "$tok" GET /v1/whoami | jq -r .role)" = team ] || { team "$name" >/dev/null; tok=$(token_of "$name"); }
  r=$(team_api "$tok" GET /v1/team)
  if [ "$(jq -r .image <<<"$r")" = "$image" ] && [ "$(jq -r .state <<<"$r")" = ready ] && [ "${FORCE:-0}" != 1 ]; then
    note "$name already runs $image (deployed from the portal?): nothing to do, FORCE=1 redeploys"
  else
  say "$name deploys $image (port $port) with its own team token"
  r=$(team_api "$tok" POST /v1/team/deploy "{\"image\":\"$image\",\"app_port\":$port}")
  has_err "$r" && die "deploy: $(jq -r .error <<<"$r")"
  note "202: same IP $(jq -r .ip <<<"$r"), same slot, same subdomain; visitors see a maintenance page meanwhile"
  sleep 1
  for _ in $(seq 300); do
    r=$(team_api "$tok" GET /v1/team)
    [ "$(jq -r .state <<<"$r")" = ready ] && break
    sleep 0.3
  done
  [ "$(jq -r .error <<<"$r")" = "" ] || [ "$(jq -r .error <<<"$r")" = null ] || die "deploy failed, the previous version is back: $(jq -r .error <<<"$r")"
  fi
  host=$name.$DOMAIN
  say "live: $(url "$host")"
  if [ "$MOCK" = 1 ]; then note "mock: answered by the simulated gateway"; return; fi
  for _ in $(seq 50); do [[ $(page "$host") == 200* ]] && break; sleep 0.2; done
  printf '   through the VIP:  HTTP %s\n' "$(page "$host" | sed 's/ /, served by /')"
  note "open it in your browser: *.localhost names resolve to your machine"
}

failover() {
  [ "$MOCK" = 1 ] && note "mock: the failover only changes the console, nothing routes"
  local m host=${1:-$SHOW_TEAM.$DOMAIN}
  m=$(api GET /v1/status | jq -r '[.gateways[] | select(.vrrp_state=="MASTER")][0].name // empty')
  [ -n "$m" ] || die "no MASTER gateway"
  say "planned failover of $m while $host is probed every 50 ms"
  local log; log=$(mktemp)
  ( for _ in $(seq 80); do page "$host" >>"$log"; sleep 0.05; done ) &
  local probe=$!
  sleep 1
  api POST "/v1/gateways/$m/failover" >/dev/null
  wait "$probe"
  note "probes: $(wc -l <"$log"), not 200: $(grep -vc '^200' "$log" || true), served by: $(awk '{print $2}' "$log" | uniq | paste -sd'>' -)"
  rm -f "$log"
  sleep 1
  api POST "/v1/gateways/$m/failback" >/dev/null
  note "$m comes back as BACKUP (nopreempt): no second switch"
}

doctor() { # doctor [TEAM]: why does a team page not answer? Paste the whole output.
  local name=${1:-$SHOW_TEAM} t ip port ctr gw
  say "doctor: $name.$DOMAIN"
  echo "--- mode: $(cat .mode 2>/dev/null || echo '?')   docker: $(docker version -f '{{.Server.Version}}' 2>&1 | head -1)   $(uname -sr)"
  echo "--- platform containers"
  docker ps -a --filter name=cstam- --format '{{.Names}}\t{{.Status}}\t{{.Image}}' | grep -v 'cstam-.*-.*-' | sort
  echo "--- gateways (cpd's view)"; status 2>&1 | sed 's/^/   /'
  t=$(api GET "/v1/hackathons/$SHOW_HACK/teams" | jq -c --arg n "$name" '[.[] | select(.name==$n)][0] // empty')
  [ -n "$t" ] || { echo "no team $name in $SHOW_HACK"; return; }
  echo "--- team (cpd's view)"; jq -c '{name, state, ip, slot, app_port, image, exposed, error}' <<<"$t"
  ip=$(jq -r .ip <<<"$t"); port=$(jq -r .app_port <<<"$t")
  echo "--- route (what the gateways should serve)"
  api GET /v1/routes | jq -c --arg ip "$ip" '{generation, route: [.routes[] | select(.addr==$ip)]}'
  echo "--- team containers (label cstam.sandbox)"
  docker ps -a --filter label=cstam.sandbox --format '{{.Names}}\t{{.Status}}\t{{.Image}}\t{{.Networks}}' | head -8
  ctr=$(docker ps -a --filter label=cstam.team="$name" --format '{{.Names}}' | head -1)
  if [ -n "$ctr" ]; then
    echo "--- $ctr"
    docker inspect -f 'state={{.State.Status}} exit={{.State.ExitCode}} err={{.State.Error}} restarts={{.RestartCount}} ip={{range $k,$v := .NetworkSettings.Networks}}{{$k}}:{{$v.IPAddress}} {{end}} sysctls={{.HostConfig.Sysctls}} caps_drop={{.HostConfig.CapDrop}}' "$ctr"
    docker logs --tail 15 "$ctr" 2>&1 | sed 's/^/   log: /'
    if docker logs --tail 3 "$ctr" 2>&1 | grep -q "operation not permitted"; then
      echo "   >>> this Docker refuses to exec containers started with no-new-privileges (Docker from snap?)."
      echo "   >>> fix: make down && make up   (it probes this and sets DOCKER_NO_NEW_PRIVS=false), then make reset if old teams stay broken"
    fi
    echo "--- inside $ctr: who listens"
    docker exec "$ctr" sh -c 'netstat -ltn 2>/dev/null || ss -ltn 2>/dev/null || cat /proc/net/tcp' 2>&1 | head -8 | sed 's/^/   /'
  else
    echo "--- no container for team $name"
  fi
  for gw in gw1 gw2; do
    echo "--- from cstam-$gw to $ip:$port"
    docker exec "cstam-$gw" curl -sS -m 3 -o /dev/null -w '   HTTP %{http_code} in %{time_total}s\n' "http://$ip:$port/" 2>&1 | sed 's/^/   /'
    docker exec "cstam-$gw" sh -c "grep -n -A2 'be_slot$(printf %03d "$(jq -r .slot <<<"$t")")\$' /etc/haproxy/haproxy.cfg | head -4; grep -c . /etc/haproxy/maps/hosts.map 2>/dev/null; grep '$name' /etc/haproxy/maps/hosts.map 2>/dev/null" 2>&1 | sed 's/^/   cfg: /'
    docker logs --tail 6 "cstam-$gw" 2>&1 | sed 's/^/   log: /'
  done
  echo "--- through the edge (the local floating IP)"
  curl -s -m 3 -D - -o /dev/null -H "Host: $name.$DOMAIN" "$EDGE/" | tr -d '\r' | grep -iE '^HTTP|served|config|retry' | sed 's/^/   /'
  echo "--- cpd log"; docker logs --tail 12 cstam-cpd 2>&1 | sed 's/^/   /'
}

status() {
  api GET /v1/status | jq -r '"routes generation \(.generation)",
    "ip pool: \(.ip_pool | to_entries | map("\(.key) \(.value)") | join(", "))",
    "teams:   \(.teams | to_entries | map("\(.key) \(.value)") | join(", "))",
    (.gateways[] | "\(.name): \(.vrrp_state) gen \(.acked_generation) config \(.config_version)")'
}

end_() {
  api DELETE "/v1/hackathons/$SHOW_HACK" | jq -r '"hackathon \(.name): \(.state // .error)"'
  note "sandboxes and routes go away, IPs wait in quarantine, then return to the pool"
  rm -rf "$STATE"
}

run() {
  local image=${1:-$ORBIT_IMAGE}
  up
  cat <<EOF

  Console      $CONSOLE   admin token: $CSTAM_ADMIN_TOKEN
  Hackathon    $SHOW_HACK   ($DOMAIN)

  Sign in to the console as admin and keep it on screen: every step below shows up live.
EOF
  pause "1. Spin up the hackathon $SHOW_HACK"
  hackathon
  pause "2. Register the team $SHOW_TEAM: IP, slot and subdomain now, sandbox right after"
  team "$SHOW_TEAM"
  pause "3. 23 more teams hit register at the same time (console: IP pool)"
  burst 23
  pause "4. $SHOW_TEAM deploys $image. Do it in the console with the team token above (private
   window, Deploy), or just press Enter and the script deploys it with that token"
  deploy "$SHOW_TEAM" "$image"
  pause "5. Planned failover: the VIP moves, the site keeps answering"
  failover
  say "done"
  cat <<EOF
   console      $CONSOLE
   the site     $(url "$SHOW_TEAM.$DOMAIN")
   team token   $(token_of "$SHOW_TEAM")
   clean up     $0 end   (then SHOW_HACK=another-name for a new run)
EOF
}

case "${1:-}" in
  run|up|hackathon|team|burst|deploy|failover|status|doctor) cmd=$1; shift; "$cmd" "$@" ;;
  end) end_ ;;
  *) sed -n '2,25p' "$0"; exit 2 ;;
esac
