# CSTAM × FelCloud: the Resilient IP Optimizer

Each hackathon team gets an isolated sandbox with one private IP and one subdomain. The sandboxes sit behind
two redundant gateways (one VIP) that never drop traffic when they reload. The IPAM recycles private IPs
safely, and an admin console drives everything.

This repo holds the whole platform: backend, frontend, Docker setup, FelCloud infrastructure, and the
demo scripts.

```
backend/      Go: cpd (control plane), gwagent (gateway agent), cstamctl (load tool), Dockerfile
frontend/     React admin console (Vite, TanStack Query, Tailwind), Dockerfile (nginx)
deploy/local/ edge.cfg: the local stand-in for FelCloud's floating IP
deploy/felcloud/  systemd units, cloud-init and env files for the real FelCloud VMs
infra/        Pulumi (Go): FelCloud network, router, security groups, VIP port, VMs
scripts/demo.sh   start, drive and demo the platform (the Makefile calls it)
docker-compose.yml           the whole platform on one machine
docker-compose.felcloud.yml  override: team sandboxes become real FelCloud VMs
```

## Quick start (local, about 3 minutes the first time)

You need Docker with the compose plugin, plus `curl`, `jq` and `openssl`. You don't need Go or Node.

```bash
make up        # builds and starts everything, creates .env with fresh tokens, prints the URLs
make seed      # hackathon "demo" with 4 teams, each checked through the VIP
```

Open **http://localhost:8080** (React console) and paste the admin token that `make up` printed
(`make urls` shows it again). The console is the only UI, and it also serves the REST API at
`localhost:8080/v1` (nginx proxies it to cpd, which is not published on its own).

**Team pages** are at `http://<team>.<hackathon domain>:8000/`, e.g. `http://team01.demo.localhost:8000/`.
The **open** link next to each ready team in the console builds that URL for you. Two rules apply locally:

- Port 8000 is the edge (the local "floating IP"). Set `EDGE_PORT=80` in `.env` for URLs without a port,
  if nothing else on your machine uses port 80.
- The hackathon domain must end in `.localhost` (e.g. `hack1.localhost`), because browsers resolve any
  `*.localhost` name to your own machine. A domain like `hack1.cstam.felcloud.tn` is real DNS that points
  nowhere, so its team pages can't open locally. Test without a browser:
  `curl -H "Host: team01.demo.localhost" http://localhost:8000/`

**Admin or viewer token:** the admin token controls everything (spin up, tear down, failover, config,
rollback). The viewer token sees every page live, but the console hides the buttons and the API answers
403 to any change. Give the viewer token to the jury or mentors so they can look around safely.

| Command | What it shows |
| --- | --- |
| `make demo` | **Guided jury demo**: one step per Enter, each with a caption |
| `make spinup NAME=alpha` | One team, timed from the API call to its own page answering through the VIP |
| `make stress N=20` | 20 registrations at once: p50/p95, all IPs distinct |
| `make failover` | Planned failover (~0.3 s), then failback |
| `make crash` | Freezes the MASTER gateway; keepalived moves the VIP in ~1.5 s |
| `make config` | Broken HAProxy config, rolled back automatically, then manual rollback; 0 dropped requests |
| `make traffic` | Steady load, so the console's Traffic page is live |
| `make teardown` | Ends the hackathon. IPs go to quarantine, then back to the pool |
| `make status` / `make logs S=cpd` | What's running |
| `make down` / `make reset` | Stop and keep everything (`make up` resumes) / remove everything, database included |

After `make teardown` the hackathon is ended (its name stays taken). The next `make seed` moves on to `demo2`, `demo3`... and saves the name in `.env`.

**npm or Go downloads time out during the build?** Builds already use the host network, cache npm
packages and retry. If it still fails, build the console on your machine and let Docker copy it:
`cd frontend && npm ci && npm run build && cd ..`, set `FRONTEND_TARGET=prebuilt` in `.env`, then `make up`.

## Local or FelCloud? The three ways to run it

The code is the same everywhere. Only two things change: **where the sandboxes are created** and
**who can reach the gateways**.

| | **1. Local** (`make up`) | **2. FelCloud sandboxes** (`make up-felcloud`) | **3. Full FelCloud** (VMs) |
| --- | --- | --- | --- |
| cpd, Postgres, gateways, console | your laptop, in Docker | your laptop, in Docker | cstam-cp, cstam-gw1, cstam-gw2 on FelCloud |
| Team sandbox | a container at its IPAM IP | **a real FelCloud VM** at its IPAM IP | a real FelCloud VM |
| Team page through the VIP | yes, `team.demo.localhost:8000` | no: your laptop can't reach FelCloud's private network | yes, through the floating IP |
| Failover, rollback, IP recycling | yes | yes (on the local gateways) | yes |
| Needs | Docker | Docker + `clouds.yaml` + the network IDs | **FelCloud floating IPs** (pool full so far) |
| Use it for | the live demo | showing VMs appearing in **Horizon** | production |

**For the jury:** run mode 1 for the full live demo. Optionally, open Horizon next to it and use
mode 2 to show a spin-up creating a real VM on FelCloud. Mode 3 is the real deployment. It needs public IPs
from FelCloud: until then the VMs exist (Pulumi) but nobody outside can reach them.

### Mode 2: FelCloud sandboxes from your laptop

```bash
# once: your OpenStack application credential in ~/.config/openstack/clouds.yaml (cloud "cstam")
make felcloud-check   # read-only: our VMs, floating IPs, free instance quota
make felcloud-ids     # read-only: writes the network, subnet and security group IDs into .env
make down && make up-felcloud
```

Each spin-up in the console now creates `cstam-<hackathon>-<team>` in Horizon (ACTIVE in ~25 s), and
each teardown deletes it. The project has room for about 6 team VMs. Go back with
`make down && make up`.

### Mode 3: full FelCloud deployment (needs floating IPs)

1. `cd infra/pulumi && pulumi preview && pulumi up` (creates the floating IPs once FelCloud has free ones).
2. Control plane (`cstam-cp`, 10.20.0.5): copy the `cpd` binary (from `docker compose build`, or
   `go build ./cmd/cpd` in `backend/`), `deploy/felcloud/systemd/cpd.service` and `/etc/cstam/cpd.env`
   (from `deploy/felcloud/env/cpd.env.example`), then `systemctl enable --now cpd`.
3. Each gateway (`ssh -J cp`): copy `gwagent` and `deploy/felcloud/systemd/`, write the env file from
   `deploy/felcloud/env/gwagent.env.example`, then run
   `sudo deploy/felcloud/systemd/install-gateway.sh <bin dir> <env file>`.
4. Console: keep `ssh -L 8443:10.20.0.5:8443 cp` open, then run
   `docker run --rm --network host -e CPD_UPSTREAM=http://127.0.0.1:8443 cstam/frontend:local` (console on localhost:8080)
   (or `CPD_URL=http://localhost:8443 npm run dev` in `frontend/`).

## How the local stack mirrors FelCloud

```
 browser ──► localhost:8080  frontend (nginx) ──/v1──► cpd 10.20.0.5 ──► postgres 10.20.0.4
                                                        │  creates team containers (Docker socket)
 browser ──► localhost:8000  edge  ("floating IP") ──► VIP 10.20.0.10 ── gw1 .11 (MASTER) / gw2 .12 (BACKUP)
                                                                  └──► team containers 10.20.0.32-.191
```

The Docker network is FelCloud's subnet: same /24, same addresses, real HAProxy, keepalived (VRRP, the
VIP moves between gw1 and gw2) and Postgres. Only two things differ. A local container stands in for each
team VM, and the edge stands in for the floating IP.
Isolation between teams is enforced by Neutron security groups on FelCloud, not on the local bridge.

## Development

```bash
make test                        # Go and frontend unit tests, in containers
cd backend && go test ./...      # with a local Go 1.25
cd frontend && npm ci && CPD_URL=http://localhost:8080 npm run dev   # console with hot reload against the stack
```

API contract: `backend/api/openapi.yaml`. Regenerate the console types with `npm run gen:api` in `frontend/`.
`QUARANTINE=10s` in `.env` keeps IP recycling visible in a demo. Production uses 60s.
