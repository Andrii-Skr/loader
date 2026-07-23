SHELL := /usr/bin/env bash

ENV_FILE ?= .env.docker
PROD_SCRIPT := ./scripts/deploy-prod.sh

.PHONY: prod-deploy prod-up prod-migrate prod-down prod-restart prod-logs prod-status

prod-deploy:
	DOCKER_ENV_FILE="$(ENV_FILE)" "$(PROD_SCRIPT)" deploy

prod-up:
	DOCKER_ENV_FILE="$(ENV_FILE)" "$(PROD_SCRIPT)" up

prod-migrate:
	DOCKER_ENV_FILE="$(ENV_FILE)" "$(PROD_SCRIPT)" migrate

prod-down:
	DOCKER_ENV_FILE="$(ENV_FILE)" "$(PROD_SCRIPT)" down

prod-restart:
	DOCKER_ENV_FILE="$(ENV_FILE)" "$(PROD_SCRIPT)" restart

prod-logs:
	DOCKER_ENV_FILE="$(ENV_FILE)" "$(PROD_SCRIPT)" logs

prod-status:
	DOCKER_ENV_FILE="$(ENV_FILE)" "$(PROD_SCRIPT)" status
