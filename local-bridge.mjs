import http from "node:http";
import { spawn } from "node:child_process";
import path from "node:path";

const PORT = Number(process.env.PORT || 8787);
const BASE_TOKEN = process.env.BASE_TOKEN || "T533b6qQma5Y6gs1laCcTIL2ngf";
const TABLE_ID = process.env.TABLE_ID || "tblVjMV66M1JDAF3";
const WRITE_FIELD_ID = process.env.FIELD_ID || "fldsUS8hLE";
const LOOKUP_FIELDS = (process.env.LOOKUP_FIELDS || "\u8bb0\u5f55 ID,\u6295\u9012ID,ID")
  .split(",")
  .map((item) => item.trim())
  .filter(Boolean);
const DRY_RUN = process.env.DRY_RUN === "1";
const ALERT_ENABLED = process.env.ALERT_ENABLED !== "0";
const ALERT_USER_ID = process.env.ALERT_USER_ID || "ou_7101a2af89955673362022fa3f60c8be";
const CLI_SCRIPT =
  process.env.LARK_CLI_SCRIPT ||
  path.join(process.env.APPDATA || "", "npm", "node_modules", "@larksuite", "cli", "scripts", "run.js");

function sendJson(res, status, body) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
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

function runCli(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [CLI_SCRIPT, ...args], {
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"]
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

async function notifyException({ title, error, context = {} }) {
  if (!ALERT_ENABLED || !ALERT_USER_ID) {
    return;
  }

  const lines = [
    "\u5165\u804c\u786e\u8ba4\u670d\u52a1\u5f02\u5e38\u63d0\u9192",
    `\u7c7b\u578b\uff1a${title}`,
    `\u65f6\u95f4\uff1a${new Date().toLocaleString("zh-CN", { hour12: false })}`,
    `\u7aef\u53e3\uff1a${PORT}`,
    `recordId\uff1a${context.recordId || "-"}`,
    `candidateId\uff1a${context.candidateId || "-"}`,
    `path\uff1a${context.path || "-"}`,
    "",
    "\u5f02\u5e38\u4fe1\u606f\uff1a",
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

  throw new Error(`\u672a\u627e\u5230\u5339\u914d\u8bb0\u5f55\uff1a${candidateId}`);
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
  const submitted = value !== null && value !== undefined && String(value).trim() !== "";

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
    candidateId: String(parsed.candidateId || parsed.candidate_id || parsed.id || "").trim()
  };
}

const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") {
    sendJson(res, 204, {});
    return;
  }

  if (req.method !== "POST" || (req.url !== "/submit" && req.url !== "/status")) {
    sendJson(res, 404, { ok: false, message: "not found" });
    return;
  }

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
        message: "\u5df2\u63d0\u4ea4\uff0c\u4e0d\u53ef\u91cd\u590d\u63d0\u4ea4"
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

server.listen(PORT, "127.0.0.1", () => {
  console.log(`bridge listening on http://127.0.0.1:${PORT}`);
  if (DRY_RUN) {
    console.log("DRY_RUN=1 is enabled; no records will be written.");
  }
  if (ALERT_ENABLED) {
    console.log(`feishu alert enabled for ${ALERT_USER_ID}`);
  }
});
