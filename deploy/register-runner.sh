#!/usr/bin/env bash
# 注册本项目专用 Shell Runner
# Tags 必须在 GitLab「Create project runner」页面填写（如 onboarding-confirmation）
# 用法: bash deploy/register-runner.sh <glrt-xxxx>
set -euo pipefail

TOKEN="${1:-${RUNNER_TOKEN:-}}"
if [[ -z "$TOKEN" ]]; then
  echo "用法: bash deploy/register-runner.sh <RUNNER_TOKEN>" >&2
  exit 1
fi

RUNNER_BIN="${GITLAB_RUNNER_BIN:-/home/master/bin/gitlab-runner}"
CONFIG="${GITLAB_RUNNER_CONFIG:-/home/master/.gitlab-runner/config.toml}"

"$RUNNER_BIN" register \
  --non-interactive \
  --url "https://gitlab.yc345.tv" \
  --token "$TOKEN" \
  --executor shell \
  --shell bash \
  --description "futurebuilder-onboarding-confirmation" \
  --builds-dir /home/master/builds \
  --cache-dir /home/master/.gitlab-runner/cache \
  --config "$CONFIG"

echo "注册完成。请确认 GitLab 上该 Runner 的 Tags 含 onboarding-confirmation，且进程在跑。"
"$RUNNER_BIN" list --config "$CONFIG" || true
