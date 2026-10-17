.PHONY: install dev worker up up-obs down migrate seed lint typecheck format test test-unit test-integration e2e build start lhci load alerts-test images tf-validate deploy teardown wau

install:
	npm ci

dev:            ## Next.js dev server on :3100 (needs `make up`)
	npm run dev

worker:         ## background worker (reminders, digest)
	npm run worker

up:             ## Postgres, Redis, Mailpit
	docker compose up -d postgres redis mailpit

up-obs:         ## + Prometheus, Alertmanager, Grafana, Tempo
	docker compose --profile observability up -d

down:           ## everything, including data
	docker compose --profile observability --profile app down -v

migrate:
	npm run db:migrate

seed:
	npm run seed

lint:
	npm run lint && npm run format:check

typecheck:
	npx next typegen && npm run typecheck

format:
	npm run format

test:           ## unit + integration (Testcontainers) with coverage
	npm test

test-unit:
	npm run test:unit

test-integration:
	npm run test:integration

e2e:            ## Playwright + axe against :3100 (start the server first, or let Playwright run `npm run start`)
	npm run e2e

build:
	npm run build

start:
	npm run start

lhci:           ## Lighthouse CI, mobile, against a running :3100
	npm run lhci

load:           ## k6 p95 of the public pages against :3100; writes load/results/latest.json
	bash load/run-load.sh

alerts-test:
	docker run --rm -v "$(CURDIR)/observability:/w" -w /w --entrypoint promtool prom/prometheus:v3.5.0 test rules alerts_test.yml

images:
	docker build --target web -t coursemates/web:local .
	docker build --target worker -t coursemates/worker:local .

tf-validate:
	docker run --rm -v "$(CURDIR)/infra/terraform:/w" -w /w hashicorp/terraform:1.9 init -backend=false -input=false >/dev/null && docker run --rm -v "$(CURDIR)/infra/terraform:/w" -w /w hashicorp/terraform:1.9 validate

deploy:         ## Fly.io: worker (migrations) then web; needs flyctl and the secrets set (docs/DEPLOY.md)
	bash scripts/deploy.sh

teardown:       ## destroys the Fly apps and the Terraform resources
	bash scripts/teardown.sh

wau:            ## weekly active users from the database
	npm run wau
