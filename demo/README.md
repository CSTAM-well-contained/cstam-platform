# Showcase: reproduce the demo video on your machine

The video's story, run for real on your own machine:
1. A hackathon goes up.
2. 24 teams register at once.
3. One team signs in with its own token and deploys a website from a Docker image.
4. The site answers at its own subdomain through the gateways' VIP.
5. A planned failover moves the VIP, and the site keeps answering.

```
demo/orbit-site/          the mock team site (nginx:alpine + one page): cstam/orbit-landing:1.0
demo/mock/                a simulated control plane + the real console, for machines without the full stack
demo/docker-compose.mock.yml
scripts/showcase.sh       drives either one through the REST API, step by step
```

## Full stack (recommended)

You need Docker with the compose plugin, `curl` and `jq`, the same as `make up`.

```bash
make showcase          # starts the stack if needed, builds the Orbit image, then runs the story
```

Press Enter between steps; `STEP=0 make showcase` runs without pauses. Keep the console open on
**http://localhost:8080**. The script prints the admin token, so sign in with it and watch each step happen live.

At step 4 you can deploy by hand instead:

1. Open a private window at http://localhost:8080.
2. Sign in with the **team token** that the script printed. You land on the team portal.
3. Container image: `cstam/orbit-landing:1.0`, port `80`, then click **Deploy**.
4. Press Enter in the terminal. The script sees the image is already running and moves on.

The site is at **http://orbit-labs.cstam-finals.localhost:8000/**. `*.localhost` names resolve to your
own machine in every browser. The page footer shows which gateway served it, plus the sandbox's IP and team.

### Your own image

Any image that listens on port 80 or 8000-8099 works:

```bash
scripts/showcase.sh deploy orbit-labs nginx:alpine
scripts/showcase.sh deploy orbit-labs my-site:dev 8080      # a local tag: no registry needed
scripts/showcase.sh deploy orbit-labs ghcr.io/you/app:1.0
```

A local tag works because `cpd` starts team containers on your own Docker. If an image doesn't start,
the previous version comes back and the portal shows why.

### One step at a time

```bash
scripts/showcase.sh up              # stack + Orbit image
scripts/showcase.sh hackathon       # cstam-finals, domain cstam-finals.localhost
scripts/showcase.sh team orbit-labs # prints its team token (also saved in .showcase/, gitignored)
scripts/showcase.sh burst 23        # 23 registrations at the same time, all IPs distinct
scripts/showcase.sh deploy          # orbit-labs deploys cstam/orbit-landing:1.0 with its own token
scripts/showcase.sh failover        # planned failover, probing the site every 50 ms
scripts/showcase.sh status
scripts/showcase.sh end             # end the hackathon: IPs quarantined, then back in the pool
```

A hackathon's name stays taken after it ends. For another run, pick a new name:
`SHOW_HACK=finals2 make showcase`.

## Mock mode (no full stack)

The video was filmed on this mode: the real React console running against a simulated control
plane, in a single container. It has no Postgres, no HAProxy and no team containers. Every API answer
has the real shape, but nothing actually routes. Use it when the full stack can't run on a machine:

```bash
make showcase-mock     # builds and starts cstam/mock:local on http://localhost:8090, then runs the story
```

Sign in with the admin token from `.env` (the mock uses it too). The site is at
http://orbit-labs.cstam-finals.localhost:8090/. Stop it with
`docker compose -f demo/docker-compose.mock.yml down`.
