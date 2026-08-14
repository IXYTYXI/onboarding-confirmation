# 入职确认页使用说明

## 文件说明

- `onboarding-preview.html`：候选人打开的入职确认页面。
- `onion-background.png`：页面背景图。
- `local-bridge.mjs`：本地测试用回传服务，负责把点击结果写回飞书多维表格，并在异常时发送飞书消息提醒。

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

使用业务 ID 时，服务会按 `记录 ID`、`投递ID`、`ID` 依次搜索匹配记录。

## 注意事项

- 不要把 `file:///` 链接发给候选人正式使用。
- 不要把飞书凭证放进前端页面。
- 当前 `local-bridge.mjs` 仅适合本地测试，正式环境建议部署为线上后端接口。
- 如果多维表字段名或表 ID 变化，需要同步修改 `local-bridge.mjs` 中的配置。
