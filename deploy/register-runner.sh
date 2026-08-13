#!/usr/bin/env bash
# 注册本项目专用 Shell Runner（在 GitLab UI 创建 runner 后拿到 token 再执行）
# 用法:
#   bash deploy/register-runner.sh <glrt-xxxx>
set -euo pipefail

TOKEN="${1:-${RUNNER_TOKEN:-}}"
if [[ -z "$TOKEN" ]]; then
  echo "用法: bash deploy/register-runner.sh <RUNNER_TOKEN>" >&2
  echo "在 GitLab: 项目 → Settings → CI/CD → Runners → Create project runner" >&2
  echo "Tags 填: onboarding-confirmation" >&2
  exit 1
fi

RUNNER_BIN="${GITLAB_RUNNER_BIN:-/home/master/bin/gitlab-runner}"
CONFIG="${GITLAB_RUNNER_CONFIG:-/home/master/.gitlab-runner/config.toml}"

"$RUNNER_BIN" register \
  --non-interactive \
  --url "https://gitlab.yc345.tv/" \
  --token "$TOKEN" \
  --executor shell \
  --shell bash \
  --description "futurebuilder-onboarding-confirmation" \
  --tag-list "onboarding-confirmation" \
  --builds-dir /home/master/builds \
  --cache-dir /home/master/.gitlab-runner/cache \
  --config "$CONFIG"

echo "注册完成。确认 gitlab-runner 进程在跑后，push 到 main 即可触发部署。"
"$RUNNER_BIN" list --config "$CONFIG" || true
