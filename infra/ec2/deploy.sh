#!/bin/bash
# Runs ON the EC2 instance as root (sent by the pipeline through SSM, or at first boot).
# Usage: deploy.sh <image-tag>
# Pulls the image, writes the container settings (secrets included) and restarts:
#   rip-api     API + built UI on port 80   (WORKER_MODE=off)
#   rip-worker  scraping + analysis worker  (headed Chromium in a virtual display, or headless)
# If the new version fails its health check, the previous version is started again.
set -euo pipefail

TAG=${1:?usage: deploy.sh <image-tag>}
# shellcheck disable=SC1091
. /etc/rip.env # APP ENV REGION (written at first boot)
export AWS_DEFAULT_REGION=$REGION
P=/$APP/$ENV
D=/opt/rip
install -d -m 700 $D
command -v jq >/dev/null || dnf install -y -q jq

param() { aws ssm get-parameter --name "$1" --query Parameter.Value --output text; }
secret() { aws secretsmanager get-secret-value --secret-id "$1" --query SecretString --output text; }

# ---- settings
param "$P/infra" > $D/infra.env
# shellcheck disable=SC1091
. $D/infra.env # IMAGE_REPO DB_HOST DB_PORT DB_NAME DB_SECRET_ARN APP_SECRET_ARN LOG_GROUP PUBLIC_URL BACKGROUND_SCRAPING HEADED_BROWSER
DB_JSON=$(secret "$DB_SECRET_ARN")
APP_JSON=$(secret "$APP_SECRET_ARN")
DB_USER=$(jq -r .username <<<"$DB_JSON")
DB_PASS=$(jq -r .password <<<"$DB_JSON")

umask 077
# Later lines win: repo settings (infra/ec2/app.env) < stack settings < secrets.
{
  param "$P/deploy/app-env"
  echo
  echo "BACKGROUND_SCRAPING=$BACKGROUND_SCRAPING"
  echo "DATABASE_URL=postgres://$DB_USER:$DB_PASS@$DB_HOST:$DB_PORT/$DB_NAME"
  jq -r 'to_entries[] | select(.value != "") | "\(.key)=\(.value)"' <<<"$APP_JSON"
} | grep -Ev '^[[:space:]]*(#|$)' | tac | awk -F= '!seen[$1]++' | tac > $D/app.env

# ---- image
aws ecr get-login-password | docker login --username AWS --password-stdin "${IMAGE_REPO%%/*}" >/dev/null
IMAGE=$IMAGE_REPO:$TAG
docker pull -q "$IMAGE"
PREV=$(cat $D/current-tag 2>/dev/null || true)

LOGS=(--log-driver awslogs --log-opt "awslogs-region=$REGION" --log-opt "awslogs-group=$LOG_GROUP")
if [ "$HEADED_BROWSER" = "true" ]; then WORKER_DISPLAY=(-e HEADLESS=false -e USE_XVFB=1); else WORKER_DISPLAY=(-e HEADLESS=true -e USE_XVFB=0); fi

stop_all() {
  # The worker hands its running jobs back to the queue on SIGTERM.
  docker stop -t 45 rip-worker >/dev/null 2>&1 || true
  docker stop -t 15 rip-api >/dev/null 2>&1 || true
  docker rm rip-worker rip-api >/dev/null 2>&1 || true
}

healthy() {
  # /api/cities reads the database, so this proves migrations ran and the DB is reachable.
  for _ in $(seq 1 60); do
    curl -fsS -m 5 http://127.0.0.1/api/cities >/dev/null 2>&1 && return 0
    sleep 3
  done
  return 1
}

start() {
  local image=$1
  stop_all
  docker run -d --name rip-api --restart unless-stopped -p 80:4000 \
    --env-file $D/app.env -e WORKER_MODE=off -e HEADLESS=true \
    -v rip-data:/app/server/data \
    "${LOGS[@]}" --log-opt awslogs-stream=api "$image" >/dev/null
  healthy || return 1
  docker run -d --name rip-worker --restart unless-stopped --init --shm-size 1g \
    --env-file $D/app.env -e WORKER_MODE=off "${WORKER_DISPLAY[@]}" \
    -v rip-data:/app/server/data -v rip-profile:/app/server/.browser-profile \
    "${LOGS[@]}" --log-opt awslogs-stream=worker "$image" node src/apps/worker/main.js >/dev/null
  sleep 8
  [ "$(docker inspect -f '{{.State.Running}}' rip-worker)" = "true" ]
}

if start "$IMAGE"; then
  echo "$TAG" > $D/current-tag
  docker image prune -af --filter "until=168h" >/dev/null 2>&1 || true
  echo "Deployed $TAG - API healthy, worker running"
  exit 0
fi

echo "Version $TAG failed its health check. Last API log lines:"
docker logs --tail 60 rip-api 2>&1 || true
docker logs --tail 30 rip-worker 2>&1 || true
if [ -n "$PREV" ] && [ "$PREV" != "$TAG" ]; then
  echo "Rolling back to $PREV"
  start "$IMAGE_REPO:$PREV" && echo "Rolled back to $PREV" || echo "Rollback to $PREV also failed"
fi
exit 1
