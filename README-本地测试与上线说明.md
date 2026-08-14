# 入职确认页使用说明

## 文件说明

- `onboarding-preview.html`：候选人打开的入职确认页面。
- `onion-background.png`：页面背景图。
- `local-bridge.mjs`：本地测试用回传服务，负责把点击结果写回飞书多维表格，并在异常时发送飞书消息提醒。

## 环境变量（协作必读）

其他人改完代码后要能直接部署，请先配置环境变量，**不要改坏容器部署所需项**。

### 推荐做法

```bash
cp .env.example .env
# 按需编辑 .env，然后：
docker compose up -d --build
# 或本地直接跑：
# set -a; source .env; set +a; node local-bridge.mjs
```

- `.env.example`：可提交到 GitHub/GitLab，给全员看默认值与说明
- `.env`：本机/部署机私有配置，已被 `.gitignore`，**不要提交**
- 部署脚本会保留部署目录里已有的 `.env`，不会被 `git clean` / `rsync` 清掉

### 必看变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `HOST` | `0.0.0.0` | 容器内必须是 `0.0.0.0`；写死 `127.0.0.1` 会导致健康检查/端口映射失败 |
| `PORT` | `8787` | 服务端口；`Dockerfile` 的 HEALTHCHECK 也依赖它 |
| `DRY_RUN` | `0` | `1`=干跑不写表；正式环境用 `0` |
| `BASE_TOKEN` | 见 `.env.example` | 多维表格 base token |
| `TABLE_ID` | 见 `.env.example` | 多维表格 table id |
| `FIELD_ID` | 见 `.env.example` | 「回传信息」字段 id |
| `LOOKUP_FIELDS` | `记录 ID,投递ID,ID` | 业务 ID 查找字段顺序 |
| `ALERT_ENABLED` | `1` | `0` 关闭飞书异常提醒 |
| `ALERT_USER_ID` | 见 `.env.example` | 异常提醒收件人 open_id |

可选：`STATIC_ROOT`、`LARK_CLI_BIN`、`LARK_CLI_SCRIPT`（容器镜像已装 `lark-cli` 时一般不用设）。

### 本地 PowerShell 临时设置

```powershell
Copy-Item .env.example .env
# 或临时：
$env:HOST="0.0.0.0"
$env:PORT="8787"
$env:DRY_RUN="1"
node .\local-bridge.mjs
```

### 合并/提交代码时注意

- **业务逻辑**（ID 兼容、提交校验等）可以改
- **部署能力**不要删：`/healthz`、`HOST` 绑定、静态页服务、`Dockerfile` / `.gitlab-ci.yml` / `deploy/`
- 推送到 GitLab `main` 会触发自动 Docker 部署；GitHub 同步不影响线上

## 当前回传逻辑

页面只允许提交一次。

- 首次进入链接时，页面会请求 `/status` 查询该候选人对应记录是否已有回传信息。
- 如果 `回传信息` 已有内容，页面直接显示：`已提交`。
- 如果没有提交过，页面显示 `确认入职` 和 `拒绝入职` 两个按钮。
- 点击任一按钮后，服务端会再次检查是否已有提交记录。
- 如果已有记录，不再写入，返回不可重复提交。
- 如果没有记录，则把按钮文字写入多维表格的 `回传信息` 字段。
- 提交完成后，页面显示：`已提交`、`不可重复提交，如有问题可咨询对接HR`。

## 飞书异常提醒

`local-bridge.mjs` 已加入异常提醒。服务运行中如果出现请求异常，会通过飞书私聊发送提醒。

默认收件人：

```text
ou_7101a2af89955673362022fa3f60c8be
```

这是当前本机 `lark-cli` 登录用户。可通过环境变量修改：

```powershell
$env:ALERT_USER_ID="ou_xxx"
node .\local-bridge.mjs
```

关闭异常提醒：

```powershell
$env:ALERT_ENABLED="0"
node .\local-bridge.mjs
```

会触发提醒的异常包括：

- `recordId` 或 `candidateId` 无法定位记录。
- 读取多维表格记录失败。
- 写入多维表格失败。
- 请求体 JSON 格式异常。
- 服务运行中的未捕获异常。

## 本地测试步骤

1. 打开 PowerShell。
2. 进入项目目录：

```powershell
cd "C:\Users\Administrator\Documents\入职确认网站"
```

3. 启动本地回传服务：

```powershell
node .\local-bridge.mjs
```

4. 打开带候选人参数的页面，例如：

```text
file:///C:/Users/Administrator/Documents/%E5%85%A5%E8%81%8C%E7%A1%AE%E8%AE%A4%E7%BD%91%E7%AB%99/onboarding-preview.html?recordId=recvrYctofZ739
```

也可以使用业务 ID：

```text
file:///C:/Users/Administrator/Documents/%E5%85%A5%E8%81%8C%E7%A1%AE%E8%AE%A4%E7%BD%91%E7%AB%99/onboarding-preview.html?candidateId=7666736086395783467
```

## 干跑测试

如果只想测试流程，不真实写入多维表格：

```powershell
cd "C:\Users\Administrator\Documents\入职确认网站"
$env:DRY_RUN="1"
node .\local-bridge.mjs
```

取消干跑：

```powershell
Remove-Item Env:DRY_RUN -ErrorAction SilentlyContinue
node .\local-bridge.mjs
```

## 正式上线说明

本地 `file:///` 链接不能直接发给候选人正式使用。正式上线需要：

- 页面有公网 HTTPS 地址。
- 回传接口也有公网 HTTPS 地址。
- 页面中的接口地址改成线上接口域名。

现在前端默认接口是：

```js
const API_BASE = window.MULTIDIMENSION_ENDPOINT || "http://127.0.0.1:8787";
```

上线后可以改成：

```js
const API_BASE = "https://你的域名/api";
```

并确保线上后端提供：

- `POST /status`
- `POST /submit`

## 当前多维表配置

- `base_token`：`T533b6qQma5Y6gs1laCcTIL2ngf`
- `table_id`：`tblVjMV66M1JDAF3`
- 回写字段：`回传信息`
- 回写字段 ID：`fldsUS8hLE`
- 默认候选人查找字段：`记录 ID`、`投递ID`、`ID`

## 链接参数

优先推荐使用 Base 原生记录 ID：

```text
?recordId=recxxxx
```

如果没有 Base 原生记录 ID，也可以用业务 ID：

```text
?candidateId=业务ID
```

也兼容这些写法：

```text
?ID=业务ID
?id=业务ID
?投递ID=业务ID
```

使用业务 ID 时，服务会按 `记录 ID`、`投递ID`、`ID` 依次搜索匹配记录。

## 注意事项

- 不要把 `file:///` 链接发给候选人正式使用。
- 不要把飞书凭证放进前端页面。
- 当前 `local-bridge.mjs` 仅适合本地测试，正式环境建议部署为线上后端接口。
- 如果多维表字段名或表 ID 变化，需要同步修改 `local-bridge.mjs` 中的配置。
