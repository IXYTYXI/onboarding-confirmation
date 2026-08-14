# 部署说明（GitLab CI + 本机 Docker）

正文使用中文；命令、路径、URL 保持英文原文。

## 流程

推送到 **`main`** → GitLab Pipeline → 本机 Shell Runner（tag: `onboarding-confirmation`）→ `deploy/ci-deploy.sh` → 更新代码 → `docker compose build && up -d` → 检查 `/healthz`。

飞书 CLI 登录态在 Docker volume `lark-cli-data` 中，部署脚本**不会**删除该 volume。

> 本机分钟级自动 pull 的兜底 timer **已关闭**，请以 GitLab CI / 手动部署为准。

## 分支约定

- **唯一开发与部署分支：`main`**（含「只能提交一次」等最新逻辑）
- 仓库若仍以 `master` 为默认分支，请在 GitLab 改为 `main`：  
  **Settings → Repository → Branch defaults → Default branch → `main`**
- `master` 为受保护分支且与 `main` 无共同祖先时，不能直接 force 对齐；可在改完默认分支后关闭旧 MR，并删除或停用 `master`

## 一次性准备

### 1. 注册 Shell Runner

在项目 **Settings → CI/CD → Runners** 中 Create project runner：

1. Tags 填：`onboarding-confirmation`
2. 本机执行：

```bash
bash deploy/register-runner.sh <RUNNER_TOKEN>
```

### 2. 验证

1. push 到 `main`，或在 GitLab 对最新 commit 点 **Run pipeline**
2. 访问：`http://127.0.0.1:8787/onboarding-preview.html`
3. `curl -fsS http://127.0.0.1:8787/healthz` 应返回 `"ok":true`

## 本地手动部署（不走 CI）

```bash
cd /data/program/onboarding-confirmation
bash deploy/ci-deploy.sh
```


## 环境变量

仓库根目录提供 `.env.example`。部署机建议：

```bash
cd /data/program/onboarding-confirmation
cp -n .env.example .env   # 仅首次；已有 .env 不要覆盖
# 编辑 .env 后：
bash deploy/ci-deploy.sh
```

`ci-deploy.sh` 已排除 `.env` / `.env.*`，CI 更新代码时不会清掉部署机上的本地配置。

## 安全

- 不要把 App Secret、`.env`、device code、二维码 PNG 提交进仓库
- `DRY_RUN` 等可通过 GitLab CI/CD Variables 或部署机环境变量覆盖（见 `docker-compose.yml`）
