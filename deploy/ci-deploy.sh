#!/usr/bin/env bash
# GitLab CI：在构建机上将代码同步到部署目录，并 docker compose build/up。
# 不删除 docker volume（lark-cli-data），以保留飞书 CLI 登录态。
set -euo pipefail

DEPLOY_DIR="${DEPLOY_DIR:-/data/program/onboarding-confirmation}"
SOURCE_DIR="${CI_PROJECT_DIR:-$(cd "$(dirname "$0")/.." && pwd)}"
HEALTHCHECK_URL="${HEALTHCHECK_URL:-http://127.0.0.1:8787/healthz}"
COMPOSE_CMD="${COMPOSE_CMD:-docker compose}"

if [[ ! -d "$SOURCE_DIR" ]]; then
  echo "源目录不存在: $SOURCE_DIR" >&2
  exit 1
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "未找到 docker 命令" >&2
  exit 1
fi

mkdir -p "$DEPLOY_DIR"

echo "同步代码: $SOURCE_DIR -> $DEPLOY_DIR"
rsync -a \
  --delete \
  --exclude .git \
  --exclude .gitignore \
  --exclude .env \
  --exclude .env.* \
  --exclude .device_code \
  --exclude 'lark-device-auth.png' \
  --exclude '*.log' \
  "$SOURCE_DIR/" "$DEPLOY_DIR/"

cd "$DEPLOY_DIR"

echo "构建镜像..."
$COMPOSE_CMD build

echo "启动服务（保留已有 volume）..."
$COMPOSE_CMD up -d

echo "等待健康检查: $HEALTHCHECK_URL"
ok=0
for _ in $(seq 1 30); do
  if curl -fsS "$HEALTHCHECK_URL" >/tmp/onboarding-healthz.json 2>/dev/null; then
    cat /tmp/onboarding-healthz.json
    echo
    ok=1
    break
  fi
  sleep 2
done

if [[ "$ok" -ne 1 ]]; then
  echo "健康检查失败" >&2
  $COMPOSE_CMD ps || true
  $COMPOSE_CMD logs --tail=80 || true
  exit 1
fi

echo "部署完成: $DEPLOY_DIR"
$COMPOSE_CMD ps
