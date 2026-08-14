import http from "node:http";
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = process.env.STATIC_ROOT || __dirname;
const PORT = Number(process.env.PORT || 8787);
const HOST = process.env.HOST || "0.0.0.0";
const BASE_TOKEN = process.env.BASE_TOKEN || "T533b6qQma5Y6gs1laCcTIL2ngf";
const TABLE_ID = process.env.TABLE_ID || "tblVjMV66M1JDAF3";
const WRITE_FIELD_ID = process.env.FIELD_ID || "fldsUS8hLE";
const LOOKUP_FIELDS = (process.env.LOOKUP_FIELDS || "记录 ID,投递ID,ID")
  .split(",")
  .map((item) => item.trim())
  .filter(Boolean);
const DRY_RUN = process.env.DRY_RUN === "1";
const ALERT_ENABLED = process.env.ALERT_ENABLED !== "0";
const ALERT_USER_ID =
  process.env.ALERT_USER_ID || "ou_7101a2af89955673362022fa3f60c8be";

function resolveCli() {
  if (process.env.LARK_CLI_BIN) {
    return { command: process.env.LARK_CLI_BIN, argsPrefix: [] };
  }

  const which = spawnSync("sh", ["-c", "command -v lark-cli"], {
    encoding: "utf8"
  });
  if (which.status === 0 && which.stdout.trim()) {
    return { command: which.stdout.trim(), argsPrefix: [] };
  }

  const script =
    process.env.LARK_CLI_SCRIPT ||
    path.join(
      process.env.APPDATA || "",
      "npm",
      "node_modules",
      "@larksuite",
      "cli",
      "scripts",
      "run.js"
    );

  if (script && fs.existsSync(script)) {
    return { command: process.execPath, argsPrefix: [script] };
  }

  throw new Error(
    "未找到 lark-cli。请安装 @larksuite/cli，或设置 LARK_CLI_BIN / LARK_CLI_SCRIPT"
  );
}

const CLI = (() => {
  try {
    return resolveCli();
  } catch (error) {
    console.warn(String(error.message || error));
    return null;
  }
})();

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".json": "application/json; charset=utf-8",
  ".ico": "image/x-icon"
};

function sendJson(res, status, body) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS, GET",
    "Access-Control-Allow-Headers": "Content-Type"
  });
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 1_000_000) {
        reject(new Error("request too large"));
        req.destroy();
      }
    });
    req.on("end", () => resolve(raw));
    req.on("error", reject);
  });
}

function escapeJsonText(value) {
  return JSON.stringify(value).replace(/[\u007f-\uFFFF]/g, (ch) => {
    const code = ch.charCodeAt(0).toString(16).padStart(4, "0");
    return `\\u${code}`;
  });
}

function formatError(error) {
  if (error instanceof Error) {
    return error.stack || error.message;
  }
  return String(error);
}

function compact(value, maxLength = 1200) {
  const text = String(value || "");
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
}

function runCli(args) {
  if (!CLI) {
    return Promise.reject(
      new Error("lark-cli 未就绪，请先在容器内完成安装与登录")
    );
  }

  return new Promise((resolve, reject) => {
    const child = spawn(CLI.command, [...CLI.argsPrefix, ...args], {
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
      env: process.env
    });

    let stdout = "";
    let stderr = "";

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }
      reject(new Error(stderr || stdout || `lark-cli exited with code ${code}`));
    });
  });
}

function parseJsonOutput(output) {
  const text = String(output || "").trim();
  return text ? JSON.parse(text) : null;
}

async function notifyException({ title, error, context = {} }) {
  if (!ALERT_ENABLED || !ALERT_USER_ID) {
    return;
  }

  const lines = [
    "入职确认服务异常提醒",
    `类型：${title}`,
    `时间：${new Date().toLocaleString("zh-CN", { hour12: false })}`,
    `端口：${PORT}`,
    `recordId：${context.recordId || "-"}`,
    `candidateId：${context.candidateId || "-"}`,
    `path：${context.path || "-"}`,
    "",
    "异常信息：",
    compact(formatError(error))
  ];

  try {
    await runCli([
      "im",
      "+messages-send",
      "--as",
      "user",
      "--user-id",
      ALERT_USER_ID,
      "--text",
      lines.join("\n"),
      "--json"
    ]);
  } catch (notifyError) {
    console.error("failed to send feishu alert:", formatError(notifyError));
  }
}

async function findRecordIdByCandidate(candidateId) {
  for (const fieldName of LOOKUP_FIELDS) {
    const result = await runCli([
      "base",
      "+record-search",
      "--base-token",
      BASE_TOKEN,
      "--table-id",
      TABLE_ID,
      "--as",
      "user",
      "--keyword",
      candidateId,
      "--search-field",
      fieldName,
      "--format",
      "json",
      "--limit",
      "5"
    ]);

    const parsed = parseJsonOutput(result.stdout);
    const recordIds = parsed?.data?.record_id_list || [];
    if (recordIds.length > 0) {
      return { recordId: recordIds[0], matchedField: fieldName };
    }
  }

  throw new Error(`未找到匹配记录：${candidateId}`);
}

async function resolveRecord({ recordId, candidateId }) {
  if (recordId) {
    return { recordId, matchedField: null };
  }

  if (candidateId) {
    return findRecordIdByCandidate(candidateId);
  }

  throw new Error("recordId or candidateId is required");
}

async function getSubmission(recordId) {
  const result = await runCli([
    "base",
    "+record-get",
    "--base-token",
    BASE_TOKEN,
    "--table-id",
    TABLE_ID,
    "--record-id",
    recordId,
    "--field-id",
    WRITE_FIELD_ID,
    "--format",
    "json",
    "--as",
    "user"
  ]);

  const parsed = parseJsonOutput(result.stdout);
  const value = parsed?.data?.data?.[0]?.[0];
  const submitted =
    value !== null && value !== undefined && String(value).trim() !== "";

  return {
    submitted,
    value: submitted ? String(value) : ""
  };
}

async function writeChoice({ recordId, buttonText }) {
  const payload = { [WRITE_FIELD_ID]: buttonText };
  const args = [
    "base",
    "+record-upsert",
    "--base-token",
    BASE_TOKEN,
    "--table-id",
    TABLE_ID,
    "--record-id",
    recordId,
    "--as",
    "user",
    "--json",
    escapeJsonText(payload)
  ];

  if (DRY_RUN) {
    args.push("--dry-run");
  }

  return runCli(args);
}

async function readJsonRequest(req) {
  const raw = await readBody(req);
  const parsed = raw ? JSON.parse(raw) : {};

  return {
    buttonText: String(parsed.buttonText || "").trim(),
    recordId: String(parsed.recordId || parsed.record_id || "").trim(),
    candidateId: String(
      parsed.candidateId || parsed.candidate_id || parsed.id || ""
    ).trim()
  };
}

function safeJoin(root, requestPath) {
  const decoded = decodeURIComponent(requestPath.split("?")[0]);
  const cleaned = decoded.replace(/^\/+/, "") || "onboarding-preview.html";
  const full = path.normalize(path.join(root, cleaned));
  if (
    !full.startsWith(path.normalize(root + path.sep)) &&
    full !== path.normalize(root)
  ) {
    return null;
  }
  return full;
}

function serveStatic(req, res) {
  const urlPath = req.url === "/" ? "/onboarding-preview.html" : req.url;
  const filePath = safeJoin(ROOT, urlPath);
  if (!filePath) {
    sendJson(res, 403, { ok: false, message: "forbidden" });
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      sendJson(res, 404, { ok: false, message: "not found" });
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      "Content-Type": MIME[ext] || "application/octet-stream",
      "Cache-Control": "no-cache"
    });
    res.end(data);
  });
}

const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") {
    sendJson(res, 204, {});
    return;
  }

  if (req.method === "GET" && req.url === "/healthz") {
    sendJson(res, 200, {
      ok: true,
      dryRun: DRY_RUN,
      cliReady: Boolean(CLI),
      alertEnabled: ALERT_ENABLED,
      cli: CLI ? { command: CLI.command, argsPrefix: CLI.argsPrefix } : null
    });
    return;
  }

  if (
    req.method === "POST" &&
    (req.url === "/submit" || req.url === "/status")
  ) {
    let body = null;

    try {
      body = await readJsonRequest(req);
      const resolved = await resolveRecord(body);
      const current = await getSubmission(resolved.recordId);

      if (req.url === "/status") {
        sendJson(res, 200, {
          ok: true,
          submitted: current.submitted,
          value: current.value,
          recordId: resolved.recordId,
          candidateId: body.candidateId,
          matchedField: resolved.matchedField
        });
        return;
      }

      if (!body.buttonText) {
        sendJson(res, 400, { ok: false, message: "buttonText is required" });
        return;
      }

      if (current.submitted) {
        sendJson(res, 409, {
          ok: false,
          alreadySubmitted: true,
          submitted: true,
          value: current.value,
          recordId: resolved.recordId,
          message: "已提交，不可重复提交"
        });
        return;
      }

      const result = await writeChoice({
        recordId: resolved.recordId,
        buttonText: body.buttonText
      });

      sendJson(res, 200, {
        ok: true,
        dryRun: DRY_RUN,
        submitted: true,
        buttonText: body.buttonText,
        recordId: resolved.recordId,
        candidateId: body.candidateId,
        matchedField: resolved.matchedField,
        cli: result.stdout ? result.stdout.trim() : undefined
      });
    } catch (error) {
      await notifyException({
        title: "request_error",
        error,
        context: {
          path: req.url,
          recordId: body?.recordId,
          candidateId: body?.candidateId
        }
      });

      sendJson(res, 500, {
        ok: false,
        message: error instanceof Error ? error.message : String(error)
      });
    }
    return;
  }

  if (req.method === "GET") {
    serveStatic(req, res);
    return;
  }

  sendJson(res, 404, { ok: false, message: "not found" });
});

server.on("clientError", async (error, socket) => {
  await notifyException({ title: "client_error", error });
  socket.end("HTTP/1.1 400 Bad Request\r\n\r\n");
});

process.on("uncaughtException", async (error) => {
  console.error(error);
  await notifyException({ title: "uncaught_exception", error });
});

process.on("unhandledRejection", async (reason) => {
  console.error(reason);
  await notifyException({ title: "unhandled_rejection", error: reason });
});

server.listen(PORT, HOST, () => {
  console.log(`bridge listening on http://${HOST}:${PORT}/`);
  console.log(`page: http://${HOST}:${PORT}/onboarding-preview.html`);
  console.log(`submit: http://${HOST}:${PORT}/submit`);
  console.log(`healthz: http://${HOST}:${PORT}/healthz`);
  if (CLI) {
    console.log(`cli: ${CLI.command} ${CLI.argsPrefix.join(" ")}`.trim());
  } else {
    console.log("cli: not found");
  }
  if (DRY_RUN) {
    console.log("DRY_RUN=1 is enabled; no records will be written.");
  }
  if (ALERT_ENABLED) {
    console.log(`feishu alert enabled for ${ALERT_USER_ID}`);
  }
});
