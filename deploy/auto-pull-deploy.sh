#!/usr/bin/env bash
# 本机兜底：轮询 origin/main，有新提交则自动 docker compose 部署。
# 用于 GitLab Runner 尚未注册时，push 后仍能更新容器。
set -euo pipefail

DEPLOY_DIR="${DEPLOY_DIR:-/data/program/onboarding-confirmation}"
BRANCH="${DEPLOY_BRANCH:-main}"
HEALTHCHECK_URL="${HEALTHCHECK_URL:-http://127.0.0.1:8787/healthz}"
COMPOSE_CMD="${COMPOSE_CMD:-docker compose}"
export GIT_SSH_COMMAND="${GIT_SSH_COMMAND:-ssh -i /home/master/.ssh/id_ed25519_gitlab_yc345 -o IdentitiesOnly=yes -o BatchMode=yes -o StrictHostKeyChecking=accept-new}"

cd "$DEPLOY_DIR"

git fetch origin "$BRANCH"
LOCAL="$(git rev-parse HEAD)"
REMOTE="$(git rev-parse "origin/$BRANCH")"

if [[ "$LOCAL" == "$REMOTE" ]]; then
  echo "无新提交: $(git rev-parse --short HEAD)"
  exit 0
fi

echo "发现新提交: $(git rev-parse --short "$LOCAL") -> $(git rev-parse --short "$REMOTE")"
git checkout -f -B "$BRANCH" "origin/$BRANCH"
git reset --hard "origin/$BRANCH"
git clean -fd -e '.env' -e '.env.*'

$COMPOSE_CMD build
$COMPOSE_CMD up -d --remove-orphans

ok=0
for _ in $(seq 1 45); do
  if curl -fsS "$HEALTHCHECK_URL" >/dev/null 2>&1; then
    ok=1
    break
  fi
  sleep 2
done

if [[ "$ok" -ne 1 ]]; then
  echo "健康检查失败" >&2
  $COMPOSE_CMD logs --tail=50 || true
  exit 1
fi

echo "自动部署完成: $(git rev-parse --short HEAD)"
curl -fsS "$HEALTHCHECK_URL" || true
echo
