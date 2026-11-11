# CSTAM platform: one entry point. Everything runs in Docker; scripts/demo.sh does the work.
#   make up            start the whole platform locally          make demo      guided jury demo
#   make up-felcloud   same, team sandboxes = real FelCloud VMs   make down      stop (keeps data)
D := scripts/demo.sh

.PHONY: up up-felcloud down reset fresh status urls logs demo seed spinup portal stress traffic failover crash config teardown \
        felcloud-check felcloud-ids test test-backend test-frontend build

up:             ## build and start everything locally (http://localhost:8080)
	@$(D) up
up-felcloud:    ## start with the OpenStack driver: spin-ups create VMs on FelCloud
	@$(D) up felcloud
down:           ## stop everything, keep data and teams (make up resumes)
	@$(D) down
fresh:          ## clean slate for a demo: reset + up + pre-pull nginx:alpine and traefik/whoami
	@$(D) fresh
reset:          ## remove everything, database included
	@$(D) reset
status:         ## gateways, teams, IP pool, containers
	@$(D) status
urls:           ## console URL and tokens
	@$(D) urls
logs:           ## follow the logs (make logs S=cpd)
	@$(D) logs $(S)

demo:           ## the guided jury demo (Enter between steps)
	@$(D) jury
seed:           ## 4 teams (make seed N=8)
	@$(D) seed $(or $(N),4)
spinup:         ## one team, timed (make spinup NAME=alpha)
	@$(D) spinup $(or $(NAME),alpha)
portal:         ## a team's portal token (make portal NAME=alpha): deploy images, public/private
	@$(D) portal $(or $(NAME),alpha)
stress:         ## N teams at once (make stress N=50)
	@$(D) stress $(or $(N),20)
traffic:        ## steady load for the Traffic page (make traffic S=60)
	@$(D) traffic $(or $(S),30)
failover:       ## planned failover + failback
	@$(D) failover planned
crash:          ## freeze the MASTER gateway, watch keepalived move the VIP
	@$(D) failover crash
config:         ## broken config -> automatic rollback -> manual rollback
	@$(D) config
teardown:       ## end the hackathon, watch the IPs get recycled
	@$(D) teardown

felcloud-check: ## read-only: our FelCloud VMs, floating IPs, quota
	@$(D) felcloud-check
felcloud-ids:   ## read-only: write the FelCloud network IDs into .env
	@$(D) felcloud-ids

build:          ## build the images without starting
	docker compose build
test: test-backend test-frontend  ## unit tests, in containers (no Go or Node needed)
test-backend:
	docker run --rm -v "$(CURDIR)/backend:/src" -w /src golang:1.25-bookworm go test -count=1 ./...
test-frontend:
	docker run --rm -v "$(CURDIR)/frontend:/app" -v cstam-frontend-modules:/app/node_modules -w /app node:22-alpine sh -c "npm ci --no-audit --no-fund && npm test"
