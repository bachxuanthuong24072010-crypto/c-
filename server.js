import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(__dirname, "public");
const WORKSPACE = path.join(__dirname, "workspace");
const PORT = Number(process.env.PORT || 8787);
const HOST = "127.0.0.1";
const MAX_BODY = 2 * 1024 * 1024;
const MAX_OUTPUT = 1024 * 1024;
const RUN_TIMEOUT_MS = 5000;
const COMPILE_TIMEOUT_MS = 30000;
const ALLOWED_EXT = new Set([".cpp", ".h", ".hpp", ".txt", ".INP", ".OUT", ".in", ".out"]);
const runs = new Map();

fs.mkdirSync(WORKSPACE, { recursive: true });

function safeName(name) {
  if (typeof name !== "string" || !/^[a-zA-Z0-9_.-]{1,80}$/.test(name) || name === "." || name === "..") {
    throw new Error("Tên tệp không hợp lệ.");
  }
  if (!ALLOWED_EXT.has(path.extname(name))) throw new Error("Định dạng tệp chưa được hỗ trợ.");
  return name;
}
function send(res, status, data, type = "application/json; charset=utf-8") {
  res.writeHead(status, { "Content-Type": type, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
  res.end(type.startsWith("application/json") ? JSON.stringify(data) : data);
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", chunk => {
      raw += chunk;
      if (raw.length > MAX_BODY) {
        reject(new Error("Dữ liệu gửi lên quá lớn."));
        req.destroy();
      }
    });
    req.on("end", () => {
      try { resolve(JSON.parse(raw || "{}")); }
      catch { reject(new Error("Dữ liệu JSON không hợp lệ.")); }
    });
    req.on("error", reject);
  });
}
function killTree(child) {
  if (!child || child.exitCode !== null) return;
  try {
    if (process.platform !== "win32" && child.pid) process.kill(-child.pid, "SIGKILL");
    else child.kill("SIGKILL");
  } catch {
    try { child.kill("SIGKILL"); } catch {}
  }
}
function runCommand(command, args, cwd, timeoutMs, runRecord, stage) {
  return new Promise(resolve => {
    const child = spawn(command, args, {
      cwd, stdio: ["ignore", "pipe", "pipe"],
      detached: process.platform !== "win32",
      env: { ...process.env, HOME: process.env.HOME || os.homedir() }
    });
    runRecord.child = child;
    runRecord.stage = stage;
    let stdout = "", stderr = "", finished = false, truncated = false;
    const append = (current, chunk) => {
      const next = current + chunk.toString("utf8");
      if (next.length > MAX_OUTPUT) { truncated = true; return next.slice(0, MAX_OUTPUT); }
      return next;
    };
    child.stdout.on("data", chunk => { stdout = append(stdout, chunk); });
    child.stderr.on("data", chunk => { stderr = append(stderr, chunk); });
    const timer = setTimeout(() => {
      if (finished) return;
      runRecord.timedOut = true;
      killTree(child);
    }, timeoutMs);
    child.on("error", error => {
      if (finished) return;
      finished = true; clearTimeout(timer);
      resolve({ code: -1, stdout, stderr: stderr + error.message, truncated });
    });
    child.on("close", code => {
      if (finished) return;
      finished = true; clearTimeout(timer);
      resolve({ code: code ?? -1, stdout, stderr, truncated });
    });
  });
}
async function beginRun(body) {
  const filename = safeName(body.filename || "main.cpp");
  if (path.extname(filename).toLowerCase() !== ".cpp") throw new Error("Tệp chạy phải có đuôi .cpp.");
  if (typeof body.code !== "string" || body.code.length > 500000) throw new Error("Mã nguồn không hợp lệ hoặc quá lớn.");
  const id = randomUUID();
  const record = {
    id, status: "compiling", stage: "compile", stdout: "", stderr: "",
    startedAt: Date.now(), compileStartedAt: Date.now(), compileDurationMs: null,
    runStartedAt: null, durationMs: null, child: null, timedOut: false, cancelled: false
  };
  runs.set(id, record);

  (async () => {
    const runDir = path.join(WORKSPACE, ".runs", id);
    fs.mkdirSync(runDir, { recursive: true });
    for (const entry of fs.readdirSync(WORKSPACE, { withFileTypes: true })) {
      if (!entry.isFile()) continue;
      const ext = path.extname(entry.name);
      if (ALLOWED_EXT.has(ext) && entry.name !== filename) {
        fs.copyFileSync(path.join(WORKSPACE, entry.name), path.join(runDir, entry.name));
      }
    }
    fs.writeFileSync(path.join(runDir, filename), body.code, "utf8");
    const compiler = process.env.CXX || "clang++";
    const compile = await runCommand(compiler, ["-std=c++17", "-O0", "-I", path.join(__dirname, "include"), filename, "-o", "program"], runDir, COMPILE_TIMEOUT_MS, record, "compile");
    record.compileDurationMs = Date.now() - record.compileStartedAt;
    record.stderr = compile.stderr;
    if (record.cancelled) { record.status = "finished"; record.exitCode = -1; }
    else if (record.timedOut) {
      record.status = "finished"; record.stderr += "\nBiên dịch vượt quá thời gian cho phép."; record.exitCode = -1;
    } else if (compile.code !== 0) {
      record.status = "finished"; record.exitCode = compile.code;
    } else {
      record.status = "running";
      const inputFile = path.join(runDir, ".stdin");
      fs.writeFileSync(inputFile, typeof body.input === "string" ? body.input : "", "utf8");
      const executablePath = path.join(runDir, process.platform === "win32" ? "program.exe" : "program");
      record.runStartedAt = Date.now();
      const child = spawn(executablePath, [], {
        cwd: runDir, stdio: ["pipe", "pipe", "pipe"],
        detached: process.platform !== "win32"
      });
      record.child = child; record.stage = "run";
      let out = "", err = "", capped = false, ended = false;
      const timer = setTimeout(() => {
        if (!ended) { record.timedOut = true; killTree(child); }
      }, RUN_TIMEOUT_MS);
      child.stdout.on("data", chunk => {
        if (out.length < MAX_OUTPUT) out += chunk.toString("utf8").slice(0, MAX_OUTPUT - out.length);
        else capped = true;
      });
      child.stderr.on("data", chunk => {
        if (err.length < MAX_OUTPUT) err += chunk.toString("utf8").slice(0, MAX_OUTPUT - err.length);
        else capped = true;
      });
      child.on("error", error => { err += error.message; });
      child.on("close", code => {
        ended = true; clearTimeout(timer);
        record.stdout = out;
        record.stderr += err;
        if (record.timedOut) record.stderr += "\nChương trình đã vượt quá giới hạn 5 giây và bị dừng.";
        if (capped) record.stderr += "\nĐầu ra đã bị giới hạn kích thước.";
        record.exitCode = code ?? -1;
        record.status = "finished";
        record.durationMs = Date.now() - record.runStartedAt;
        // Copy files produced by freopen("name.OUT", "w", stdout) back to workspace.
        for (const outputEntry of fs.readdirSync(runDir, { withFileTypes: true })) {
          if (!outputEntry.isFile()) continue;
          const outputExtension = path.extname(outputEntry.name);
          if (outputExtension === ".OUT" || outputExtension === ".out") {
            fs.copyFileSync(path.join(runDir, outputEntry.name), path.join(WORKSPACE, outputEntry.name));
          }
        }
        record.child = null;
      });
      child.stdin.end(typeof body.input === "string" ? body.input : "");
    }
    if (record.status === "finished") {
      record.durationMs = record.runStartedAt === null ? 0 : Date.now() - record.runStartedAt;
      record.child = null;
    }
  })().catch(error => {
    record.status = "finished";
    record.stderr = error.message;
    record.exitCode = -1;
    record.durationMs = Date.now() - record.startedAt;
    record.child = null;
  });
  return id;
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${HOST}:${PORT}`);
    if (req.method === "GET" && url.pathname === "/api/health") return send(res, 200, { ok: true, compiler: process.env.CXX || "clang++" });

    if (url.pathname === "/api/files" && req.method === "GET") {
      const files = fs.readdirSync(WORKSPACE, { withFileTypes: true })
        .filter(item => item.isFile() && ALLOWED_EXT.has(path.extname(item.name)))
        .map(item => {
          const stat = fs.statSync(path.join(WORKSPACE, item.name));
          return { name: item.name, size: stat.size, modified: stat.mtimeMs };
        });
      return send(res, 200, { files });
    }
    if (url.pathname === "/api/files" && req.method === "POST") {
      const body = await readBody(req);
      const name = safeName(body.name);
      if (fs.existsSync(path.join(WORKSPACE, name))) return send(res, 409, { error: "Tệp đã tồn tại." });
      fs.writeFileSync(path.join(WORKSPACE, name), String(body.content || ""), "utf8");
      return send(res, 201, { ok: true, name });
    }
    if (url.pathname.startsWith("/api/files/") && req.method === "GET") {
      const name = safeName(decodeURIComponent(url.pathname.slice("/api/files/".length)));
      const target = path.join(WORKSPACE, name);
      if (!fs.existsSync(target)) return send(res, 404, { error: "Không tìm thấy tệp." });
      return send(res, 200, { name, content: fs.readFileSync(target, "utf8") });
    }
    if (url.pathname.startsWith("/api/files/") && req.method === "PUT") {
      const name = safeName(decodeURIComponent(url.pathname.slice("/api/files/".length)));
      const body = await readBody(req);
      fs.writeFileSync(path.join(WORKSPACE, name), String(body.content ?? ""), "utf8");
      return send(res, 200, { ok: true, name });
    }
    if (url.pathname.startsWith("/api/files/") && req.method === "DELETE") {
      const name = safeName(decodeURIComponent(url.pathname.slice("/api/files/".length)));
      const target = path.join(WORKSPACE, name);
      if (!fs.existsSync(target)) return send(res, 404, { error: "Không tìm thấy tệp." });
      fs.unlinkSync(target);
      return send(res, 200, { ok: true });
    }
    if (url.pathname === "/api/run" && req.method === "POST") {
      const body = await readBody(req);
      const id = await beginRun(body);
      return send(res, 202, { id });
    }
    if (url.pathname.startsWith("/api/run/") && req.method === "GET") {
      const id = url.pathname.split("/").pop();
      const record = runs.get(id);
      if (!record) return send(res, 404, { error: "Không tìm thấy phiên chạy." });
      return send(res, 200, {
        id, status: record.status, stage: record.stage, stdout: record.stdout,
        stderr: record.stderr, exitCode: record.exitCode ?? null,
        durationMs: record.durationMs ?? null, compileDurationMs: record.compileDurationMs ?? null,
        ran: record.runStartedAt !== null, timedOut: record.timedOut
      });
    }
    if (url.pathname.startsWith("/api/run/") && url.pathname.endsWith("/stop") && req.method === "POST") {
      const id = url.pathname.split("/")[3];
      const record = runs.get(id);
      if (!record) return send(res, 404, { error: "Không tìm thấy phiên chạy." });
      record.cancelled = true;
      killTree(record.child);
      record.status = "finished"; record.stderr += "\nĐã dừng theo yêu cầu.";
      record.exitCode = -1; record.child = null;
      record.durationMs = record.runStartedAt === null ? 0 : Date.now() - record.runStartedAt;
      return send(res, 200, { ok: true });
    }

    const requested = url.pathname === "/" ? "index.html" : decodeURIComponent(url.pathname.slice(1));
    const target = path.resolve(PUBLIC, requested);
    if (!target.startsWith(path.resolve(PUBLIC) + path.sep) && target !== path.resolve(PUBLIC, "index.html")) {
      return send(res, 403, { error: "Không được phép truy cập." });
    }
    if (!fs.existsSync(target) || !fs.statSync(target).isFile()) return send(res, 404, "Không tìm thấy.", "text/plain; charset=utf-8");
    const ext = path.extname(target);
    const types = { ".html":"text/html; charset=utf-8", ".js":"text/javascript; charset=utf-8", ".css":"text/css; charset=utf-8", ".json":"application/json; charset=utf-8", ".svg":"image/svg+xml" };
    send(res, 200, fs.readFileSync(target), types[ext] || "application/octet-stream");
  } catch (error) {
    send(res, 400, { error: error.message || "Có lỗi xảy ra." });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Coding C++ đang chạy tại http://${HOST}:${PORT}`);
  console.log(`Thư mục bài làm: ${WORKSPACE}`);
});
