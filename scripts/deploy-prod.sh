#!/usr/bin/env bash

set -Eeuo pipefail

readonly PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${DOCKER_ENV_FILE:-$PROJECT_DIR/.env.docker}"

if [[ "$ENV_FILE" != /* ]]; then
  ENV_FILE="$PROJECT_DIR/$ENV_FILE"
fi

usage() {
  cat <<'EOF'
Usage: ./scripts/deploy-prod.sh <command>

Commands:
  deploy   Apply migrations and build, start, and health-check the app.
  migrate  Apply Prisma migrations only.
  up       Build, start, and health-check the app without migrations.
  down     Stop and remove application containers (uploads volume is retained).
  restart  Restart the application container.
  logs     Follow application logs.
  status   Show application container status.
EOF
}

fail() {
  printf 'Error: %s\n' "$*" >&2
  exit 1
}

require_runtime() {
  command -v docker >/dev/null 2>&1 || fail "Docker is not installed or not available in PATH."
  docker compose version >/dev/null 2>&1 || fail "Docker Compose v2 is required."
  [[ -f "$ENV_FILE" ]] || fail "Production environment file was not found: $ENV_FILE"
}

compose() {
  DOCKER_ENV_FILE="$ENV_FILE" docker compose \
    --project-directory "$PROJECT_DIR" \
    --env-file "$ENV_FILE" \
    "$@"
}

deploy() {
  compose --profile migrate run --rm migrate
  compose up -d --build --wait app
  compose ps
}

case "${1:-}" in
  deploy)
    require_runtime
    deploy
    ;;
  migrate)
    require_runtime
    compose --profile migrate run --rm migrate
    ;;
  up)
    require_runtime
    compose up -d --build --wait app
    compose ps
    ;;
  down)
    require_runtime
    compose down
    ;;
  restart)
    require_runtime
    compose restart app
    compose ps
    ;;
  logs)
    require_runtime
    compose logs --tail="${LOG_TAIL:-200}" --follow app
    ;;
  status)
    require_runtime
    compose ps
    ;;
  -h|--help|help)
    usage
    ;;
  *)
    usage >&2
    exit 2
    ;;
esac
