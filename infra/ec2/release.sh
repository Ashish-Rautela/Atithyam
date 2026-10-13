#!/bin/bash
# Runs in the pipeline's Deploy stage (CodeBuild). Needs APP_NAME, ENV_NAME and imagetag.txt.
#  1. Stores the deploy script, app settings and (after success) the image tag in SSM, so a
#     replaced instance can start the same version on its own at boot.
#  2. Runs infra/ec2/deploy.sh on the instance through SSM Run Command and waits for it.
#  3. Smoke-tests the live site through CloudFront (UI, health, database-backed API).
set -euo pipefail

: "${APP_NAME:?}" "${ENV_NAME:?}"
REGION=${AWS_REGION:-${AWS_DEFAULT_REGION:?}}
export AWS_DEFAULT_REGION=$REGION
TAG=$(cat imagetag.txt)
P=/$APP_NAME/$ENV_NAME
echo "Deploying image tag $TAG to $APP_NAME-$ENV_NAME"

put_file() {
  aws ssm put-parameter --name "$1" --type String --tier Intelligent-Tiering --overwrite \
    --value "file://$2" >/dev/null
}
put_file "$P/deploy/script" infra/ec2/deploy.sh
put_file "$P/deploy/app-env" infra/ec2/app.env

# ---- find the instance and wait until SSM can reach it (a new instance needs a few minutes)
IID=""
for _ in $(seq 1 60); do
  IID=$(aws ec2 describe-instances \
    --filters "Name=tag:Project,Values=$APP_NAME" "Name=tag:Environment,Values=$ENV_NAME" \
              "Name=tag:Role,Values=app" "Name=instance-state-name,Values=running" \
    --query 'Reservations[].Instances[].InstanceId' --output text | awk '{print $1}')
  if [ -n "$IID" ] && [ "$IID" != "None" ]; then
    PING=$(aws ssm describe-instance-information --filters "Key=InstanceIds,Values=$IID" \
      --query 'InstanceInformationList[0].PingStatus' --output text)
    [ "$PING" = "Online" ] && break
  fi
  echo "Waiting for the instance to come online in SSM..."
  sleep 10
done
[ -n "$IID" ] && [ "${PING:-}" = "Online" ] || { echo "No online instance found for $APP_NAME-$ENV_NAME"; exit 1; }
echo "Instance $IID"

# ---- run the deploy script on the instance
PARAMS=$(jq -n --arg p "$P" --arg r "$REGION" --arg t "$TAG" '{
  commands: [
    "cloud-init status --wait >/dev/null 2>&1 || true",
    "install -d -m 700 /opt/rip",
    "aws ssm get-parameter --region \($r) --name \($p)/deploy/script --query Parameter.Value --output text > /opt/rip/deploy.sh",
    "bash /opt/rip/deploy.sh \($t)"
  ],
  executionTimeout: ["1200"]
}')
CMD_ID=$(aws ssm send-command --instance-ids "$IID" --document-name AWS-RunShellScript \
  --comment "deploy $TAG" --parameters "$PARAMS" --timeout-seconds 600 \
  --query Command.CommandId --output text)
echo "SSM command $CMD_ID"

STATUS=Pending
for _ in $(seq 1 130); do
  sleep 10
  STATUS=$(aws ssm get-command-invocation --command-id "$CMD_ID" --instance-id "$IID" \
    --query Status --output text 2>/dev/null || echo Pending)
  case "$STATUS" in Pending|InProgress|Delayed) continue ;; *) break ;; esac
done
echo "----- instance output -----"
aws ssm get-command-invocation --command-id "$CMD_ID" --instance-id "$IID" \
  --query StandardOutputContent --output text || true
echo "----- instance errors -----"
aws ssm get-command-invocation --command-id "$CMD_ID" --instance-id "$IID" \
  --query StandardErrorContent --output text | tail -n 60 || true
[ "$STATUS" = "Success" ] || { echo "Deploy on the instance ended with status $STATUS"; exit 1; }

# A replaced instance boots straight into this version.
aws ssm put-parameter --name "$P/deploy/image-tag" --type String --overwrite --value "$TAG" >/dev/null

# ---- smoke test through CloudFront
URL=$(aws ssm get-parameter --name "$P/infra" --query Parameter.Value --output text \
  | sed -n 's/^PUBLIC_URL=//p')
echo "Smoke-testing $URL"
check() {
  for _ in $(seq 1 12); do
    if curl -fsS -m 20 "$URL$1" | grep -q "$2"; then echo "  ok  $1"; return 0; fi
    sleep 15
  done
  echo "  FAILED  $1 (expected to contain: $2)"
  return 1
}
check /api/health '"ok":true'
check /api/cities '"items"'
check / 'id="root"'
check /seeding 'id="root"' # client-side route served by the SPA fallback
echo "Live: $URL (image $TAG)"
