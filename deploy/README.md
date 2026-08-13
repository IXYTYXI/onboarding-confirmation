# 部署说明（GitLab CI + 本机 Docker）

正文使用中文；命令、路径、URL 保持英文原文。

## 流程

推送到 `main` / `master` → GitLab Pipeline → 本机 Shell Runner（tag: `onboarding-confirmation`）→ `deploy/ci-deploy.sh` → 更新代码 → `docker compose build && up -d` → 检查 `/healthz`。

飞书 CLI 登录态在 Docker volume `lark-cli-data` 中，部署脚本**不会**删除该 volume。

### 本机兜底（Runner 未就绪时）

本机已安装用户级 systemd timer `onboarding-auto-deploy.timer`：每分钟 `git fetch`，发现 `origin/main` 有新提交则自动 build/up。

```bash
systemctl --user status onboarding-auto-deploy.timer
bash deploy/auto-pull-deploy.sh   # 也可手动执行
```

## 一次性准备

### 1. 在 GitLab 建空项目

打开 `https://gitlab.yc345.tv/`，新建项目（例如 `onboarding-confirmation`），不要勾选自动生成 README（本地已有代码）。

### 2. 本机初始化并推送

在部署机上：

```bash
cd /data/program/onboarding-confirmation
git init -b main
git remote add origin <你的 GitLab 仓库 SSH 或 HTTPS URL>
git add .
git status
git commit -m "chore: 初始化入职确认服务与 GitLab CI"
git push -u origin main
```

把 `<你的 GitLab 仓库 SSH 或 HTTPS URL>` 换成真实地址后再执行。

### 3. 注册 / 启用 Shell Runner（正式走 GitLab CI）

在项目 **Settings → CI/CD → Runners** 中创建 Project Runner：

1. Tags 填：`onboarding-confirmation`（须与 `.gitlab-ci.yml` 一致）
2. 复制 token，在本机执行：

```bash
bash deploy/register-runner.sh <RUNNER_TOKEN>
```

确认 `/home/master/bin/gitlab-runner` 进程在跑后，再 push 到 `main` 即可看到 Pipeline 自动部署。

> 若暂时还没注册 Runner，本机 `onboarding-auto-deploy.timer` 仍会每分钟拉取并部署，push 后约 1 分钟生效。

### 4. 验证

1. 再 push 一次到 `main`，或在 GitLab 对最新 commit 点 **Run pipeline**
2. Pipeline 成功后访问：`http://127.0.0.1:8787/onboarding-preview.html`
3. `curl -fsS http://127.0.0.1:8787/healthz` 应返回 `"ok":true`

## 本地手动部署（不走 CI）

```bash
cd /data/program/onboarding-confirmation
bash deploy/ci-deploy.sh
```

## 安全

- 不要把 App Secret、`.env`、device code、二维码 PNG 提交进仓库
- `DRY_RUN` 等可通过 GitLab CI/CD Variables 或部署机环境变量覆盖（见 `docker-compose.yml`）
