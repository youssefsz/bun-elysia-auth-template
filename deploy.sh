#!/bin/bash

set -euo pipefail

APP_NAME="bun-elysia-auth"
HEALTH_PATH="http://localhost:3000/health"
MAX_ATTEMPTS=60
SLEEP_SECONDS=2

if docker compose version >/dev/null 2>&1; then
  COMPOSE_CMD=(docker compose)
elif command -v docker-compose >/dev/null 2>&1; then
  COMPOSE_CMD=(docker-compose)
else
  echo "Neither 'docker compose' nor 'docker-compose' is available."
  exit 1
fi

compose() {
  "${COMPOSE_CMD[@]}" "$@"
}

is_running() {
  local name="$1"
  docker ps --format '{{.Names}}' | grep -wq "$name"
}

echo "Starting blue/green deployment for ${APP_NAME}..."

if is_running "${APP_NAME}-blue"; then
  TARGET="green"
  CURRENT="blue"
elif is_running "${APP_NAME}-green"; then
  TARGET="blue"
  CURRENT="green"
else
  TARGET="blue"
  CURRENT=""
fi

echo "Current active instance: ${CURRENT:-none}"
echo "Deploying to: ${TARGET}"

echo "Building ${TARGET} image..."
compose build "${TARGET}"

echo "Running database migrations..."
compose run --rm "${TARGET}" bun run db:migrate

echo "Starting ${TARGET} container..."
compose up -d "${TARGET}"

echo "Waiting for ${TARGET} to become healthy..."
ATTEMPTS=0

while [ "${ATTEMPTS}" -lt "${MAX_ATTEMPTS}" ]; do
  HEALTH=$(docker inspect --format='{{.State.Health.Status}}' "${APP_NAME}-${TARGET}" 2>/dev/null || true)

  if [ "${HEALTH}" = "healthy" ]; then
    echo "${TARGET} is healthy."
    break
  fi

  if [ "${HEALTH}" = "unhealthy" ]; then
    echo "Deployment failed: ${TARGET} reported unhealthy."
    docker logs --tail 50 "${APP_NAME}-${TARGET}" || true
    compose stop "${TARGET}" || true
    exit 1
  fi

  ATTEMPTS=$((ATTEMPTS + 1))
  echo "Health status: ${HEALTH:-starting} (${ATTEMPTS}/${MAX_ATTEMPTS})"
  sleep "${SLEEP_SECONDS}"
done

if [ "${ATTEMPTS}" -eq "${MAX_ATTEMPTS}" ]; then
  echo "Timed out waiting for ${TARGET} health check at ${HEALTH_PATH}."
  compose stop "${TARGET}" || true
  exit 1
fi

if [ -n "${CURRENT}" ] && is_running "${APP_NAME}-${CURRENT}"; then
  echo "Stopping old instance: ${CURRENT}"
  compose stop "${CURRENT}"
fi

echo "Deployment complete. Active instance: ${TARGET}"
