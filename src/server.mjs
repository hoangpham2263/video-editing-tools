// Video Editing Tools' window (ui/) served on 127.0.0.1. A thin layer over scripts/: every read and write goes through
// the same functions the agents run, so the server has no video logic of its own (the agents analyze and build).
// core/launch.ps1 starts this file with --no-open and finds it by /api/root; each install gets its own port from its
// folder (47000 + hash, skipping 8775/8785/47595), VET_PORT overrides.
import { createServer } from "node:http";
import { spawn, execFile } from "node:child_process";
import { existsSync, mkdirSync, openSync, readFileSync, statSync, renameSync, appendFileSync, createReadStream, createWriteStream, rmSync } from "node:fs";
import { join, dirname, extname, resolve, sep, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { pipeline } from "node:stream/promises";
import { createConfigApi } from "../core/setup/config-api.mjs";
import { PWSH, toolEnv, psCommand, appWindow } from "../core/platform.mjs";
import { workspace, projectDir, writeJson } from "../scripts/lib.mjs";
import { newProject, listProjects, showProject, sampleCreate, sampleRename, sampleRemove } from "../scripts/project.mjs";
import { listVideos, mark } from "../scripts/review.mjs";
import { promptText } from "../scripts/prompts.mjs";
import { progressView, newRun } from "../scripts/progress.mjs";
import { listLogs } from "../scripts/runlog.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const SKIP = [8775, 8785, 47595];
const hashPort = () => { let p = 47000 + (parseInt(createHash("sha1").update(root).digest("hex").slice(0, 6), 16) % 1000); while (SKIP.includes(p)) p++; return p; };
const BASE_PORT = Number(process.env.VET_PORT || hashPort());
let PORT = BASE_PORT;
const logs = join(workspace, "logs");
const configApi = createConfigApi({ hubRoot: root, pwsh: PWSH, env: toolEnv });
mkdirSync(logs, { recursive: true });

const logFile = (name) => {
  const file = join(logs, name);
  try { if (statSync(file).size > 1024 * 1024) renameSync(file, file.replace(/\.log$/, ".old.log")); } catch {}
  return file;
};
const logError = (where, text) => { try { appendFileSync(logFile("app-errors.log"), `[${new Date().toISOString()}] ${where}\n  ${String(text).trim().replace(/\n/g, "\n  ")}\n\n`); } catch {} };
process.on("uncaughtException", (e) => { logError("Video Editing Tools server", e.stack || e); process.exit(1); });
process.on("unhandledRejection", (e) => logError("Video Editing Tools server", e?.stack || e));

const TYPES = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".mp4": "video/mp4", ".mov": "video/quicktime", ".webm": "video/webm", ".m4v": "video/mp4", ".mkv": "video/x-matroska", ".txt": "text/plain; charset=utf-8" };
const CORE_ASSETS = ["tool.css", "hub.js"];
const version = () => { try { return readFileSync(join(root, "workspace", "version.txt"), "utf8").trim(); } catch { try { return JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version || ""; } catch { return ""; } } };
const q = (p) => p.replace(/'/g, "''");
const pwshOut = (command, timeout) => new Promise((done, fail) => execFile(PWSH, psCommand(command), { cwd: root, env: toolEnv, timeout, windowsHide: true }, (err, out) => (err ? fail(err) : done(String(out).trim()))));

// ----- HTTP -----
const send = (res, status, data) => { res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }); res.end(JSON.stringify(data)); };
const isObject = (v) => !!v && typeof v === "object" && !Array.isArray(v);
const body = async (req, limit = 2 * 1024 * 1024) => {
  const chunks = []; let size = 0;
  for await (const c of req) { size += c.length; if (size > limit) throw new Error("Request too large."); chunks.push(c); }
  const text = Buffer.concat(chunks).toString("utf8").trim();
  if (!text) return {};
  let data;
  try { data = JSON.parse(text); } catch { throw new Error("The request is not valid JSON."); }
  if (!isObject(data)) throw new Error("The request must be a JSON object.");
  return data;
};

// ----- security: only this app's own window may drive it (same rules as social-autopilot) -----
// Uploads send the file as the body with Content-Type application/octet-stream plus the token header (preflighted too).
const TOKEN = randomBytes(24).toString("hex");
const hosts = () => [`127.0.0.1:${PORT}`, `localhost:${PORT}`];
const BOOT = `<meta name="sa-token" content="${TOKEN}">`;
const withBoot = (html) => (/<head[^>]*>/i.test(html) ? html.replace(/<head[^>]*>/i, (m) => m + BOOT) : BOOT + html);
const sameToken = (v) => { const a = Buffer.from(String(v || "")), b = Buffer.from(TOKEN); return a.length === b.length && timingSafeEqual(a, b); };
function refuse(req, path) {
  if (!hosts().includes(String(req.headers.host || "").toLowerCase())) return "This server only accepts requests to its own 127.0.0.1 or localhost address.";
  if (req.method === "GET" || req.method === "HEAD") return "";
  const origin = req.headers.origin;
  if (origin !== undefined && !hosts().map((h) => `http://${h}`).includes(origin)) return "Requests from other pages are blocked.";
  if (path === "/api/quit" && origin === undefined && !req.headers["sec-fetch-site"]) return "";
  if (!/^application\/(json|octet-stream)\b/i.test(String(req.headers["content-type"] || ""))) return "Requests must send Content-Type: application/json.";
  if (!sameToken(req.headers["x-sa-token"])) return "Missing or wrong session token (X-SA-Token). Restart the app and try again.";
  return "";
}

const sendFile = (res, file, req) => {
  if (!existsSync(file) || !statSync(file).isFile()) { res.writeHead(404); return res.end(); }
  const size = statSync(file).size;
  const type = TYPES[extname(file).toLowerCase()] || "application/octet-stream";
  const range = /^bytes=(\d*)-(\d*)$/.exec(String(req?.headers.range || ""));
  if (range && (range[1] || range[2])) {
    let start = range[1] ? Number(range[1]) : size - Number(range[2]);
    let end = range[1] && range[2] ? Number(range[2]) : size - 1;
    if (start < 0) start = 0;
    if (start >= size || end < start) { res.writeHead(416, { "content-range": `bytes */${size}` }); return res.end(); }
    end = Math.min(end, size - 1);
    res.writeHead(206, { "content-type": type, "content-length": end - start + 1, "content-range": `bytes ${start}-${end}/${size}`, "accept-ranges": "bytes", "cache-control": "no-store" });
    return createReadStream(file, { start, end }).pipe(res);
  }
  const headers = { "content-type": type, "content-length": size, "accept-ranges": "bytes", "cache-control": "no-store" };
  if (req && new URL(req.url, "http://x").searchParams.get("download")) headers["content-disposition"] = `attachment; filename="${basename(file).replace(/[^\w.-]/g, "_")}"`;
  res.writeHead(200, headers);
  createReadStream(file).pipe(res);
};
// Only files inside this tool's workspace/ are served to the window.
const allowedFile = (p) => { const full = resolve(String(p || "")); return full.startsWith(workspace + sep) && existsSync(full); };

function restart() {
  const out = openSync(logFile("server.log"), "a");
  spawn(process.execPath, [join(here, "server.mjs"), "--no-open"], { cwd: root, detached: true, windowsHide: true, stdio: ["ignore", out, out], env: { ...process.env, VET_WAIT_PORT: "1" } }).unref();
  setTimeout(() => process.exit(0), 300);
}
const api = async (res, fn) => { try { send(res, 200, await fn()); } catch (e) { send(res, 400, { error: e.message }); } };
const sendHtml = (res, file) => {
  if (!existsSync(file) || !statSync(file).isFile()) { res.writeHead(404); return res.end(); }
  const html = withBoot(readFileSync(file, "utf8"));
  res.writeHead(200, { "content-type": TYPES[".html"], "content-length": Buffer.byteLength(html), "cache-control": "no-store" });
  res.end(html);
};
const safeName = (n) => basename(String(n || "")).replace(/[^\w.-]+/g, "_").replace(/^\.+/, "") || `file-${Date.now()}`;
const MAX_UPLOAD = 4 * 1024 * 1024 * 1024;
// The upload body (the raw file) streamed to disk; a partial file is removed on error.
async function saveBody(req, file) {
  if (Number(req.headers["content-length"] || 0) > MAX_UPLOAD) throw new Error("File too large.");
  mkdirSync(dirname(file), { recursive: true });
  try { await pipeline(req, createWriteStream(file)); } catch (e) { rmSync(file, { force: true }); throw e; }
  return { name: basename(file), path: file, size: statSync(file).size };
}

async function handle(req, res) {
  const url = new URL(req.url, "http://localhost");
  const path = url.pathname;
  const get = (k) => url.searchParams.get(k) || "";
  const refused = refuse(req, path);
  if (refused) return send(res, 403, { error: refused });
  if (path === "/api/root") return send(res, 200, { root, service: "video-editing-tools", protocol: 1, version: version(), pid: process.pid });
  if (path === "/api/quit" && req.method === "POST") { send(res, 200, { ok: true }); setTimeout(() => { server.close(); process.exit(0); }, 200); return; }
  if (path === "/api/client-error" && req.method === "POST") return api(res, async () => { const b = await body(req); logError("Window", `${b.message}\n${b.stack || ""}`); return { ok: true }; });

  // ----- projects and samples (scripts/project.mjs) -----
  if (path === "/api/projects" && req.method === "GET") return api(res, () => ({ projects: listProjects() }));
  if (path === "/api/projects" && req.method === "POST") return api(res, async () => { const b = await body(req); return { project: newProject({ name: b.name, note: b.note, caption_lang: b.caption_lang }) }; });
  let m = /^\/api\/projects\/([a-z0-9-]+)$/.exec(path);
  if (m && req.method === "GET") return api(res, () => showProject(m[1]));
  m = /^\/api\/projects\/([a-z0-9-]+)\/upload$/.exec(path);
  if (m && req.method === "POST") return api(res, async () => {
    const kind = get("kind");
    const name = safeName(get("name"));
    if (kind === "sample") { const s = sampleCreate(m[1], name); try { return { sid: s.sample.id, sample: s.sample, file: await saveBody(req, s.file) }; } catch (e) { sampleRemove(m[1], s.sample.id); throw e; } }
    if (kind === "source") { showProject(m[1]); return { file: await saveBody(req, join(projectDir(m[1]), "source", name)) }; }
    throw new Error("kind must be sample or source.");
  });
  m = /^\/api\/projects\/([a-z0-9-]+)\/samples\/([a-z0-9-]+)$/.exec(path);
  if (m && req.method === "POST") return api(res, async () => ({ sample: sampleRename(m[1], m[2], (await body(req)).name) }));
  if (m && req.method === "DELETE") return api(res, () => sampleRemove(m[1], m[2]));
  m = /^\/api\/projects\/([a-z0-9-]+)\/source\/([^/]+)$/.exec(path);
  if (m && req.method === "DELETE") return api(res, () => { const f = join(projectDir(m[1]), "source", safeName(decodeURIComponent(m[2]))); if (!existsSync(f)) throw new Error("No such file."); rmSync(f); return { removed: basename(f) }; });

  // ----- files, videos, prompts, progress, log -----
  if (path === "/api/file") return allowedFile(get("path")) ? sendFile(res, resolve(get("path")), req) : (res.writeHead(404), res.end());
  if (path === "/api/videos" && req.method === "GET") return api(res, () => ({ videos: listVideos() }));
  m = /^\/api\/videos\/(approve|drop)$/.exec(path);
  if (m && req.method === "POST") return api(res, async () => { const b = await body(req); return { review: mark(String(b.project || ""), String(b.run || ""), m[1] === "approve" ? "approved" : "dropped") }; });
  if (path === "/api/prompt" && req.method === "GET") return api(res, () => ({ prompt: promptText(get("mode"), { project: get("project"), sample: get("sample"), agent: get("agent") || "claude" }) }));
  if (path === "/api/progress" && req.method === "GET") return api(res, () => ({ analyze: progressView("analyze"), build: progressView("build") }));
  if (path === "/api/progress" && req.method === "POST") return api(res, async () => { const b = await body(req); return { run: newRun(String(b.mode || ""), { project: String(b.project || ""), agent: String(b.agent || "") }) }; });
  if (path === "/api/log" && req.method === "GET") return api(res, () => ({ logs: listLogs({ project: get("project"), mode: get("mode") }) }));

  // ----- setup, update, reload (core/assets/hub.js) -----
  if (path === "/setup" && req.method === "GET") return sendHtml(res, join(root, "core", "setup", "page.html"));
  if (await configApi(req, res, path)) return;
  if (path === "/api/update-check") {
    const out = await pwshOut(`. '${q(join(root, "core", "update.ps1"))}' -NoRun; [pscustomobject]@{ current = (Get-InstalledVersion '${q(root)}'); next = (Get-AppUpdate '${q(root)}') } | ConvertTo-Json -Compress`, 60000).catch(() => "");
    res.writeHead(out ? 200 : 502, { "content-type": TYPES[".json"] });
    return res.end(out || "{}");
  }
  if (path === "/api/update" && req.method === "POST") {
    const ok = await pwshOut(`. '${q(join(root, "core", "update.ps1"))}' -NoRun; Update-App '${q(root)}'`, 300000).then(() => true, () => false);
    send(res, ok ? 200 : 500, { ok });
    if (ok) setTimeout(() => { server.close(); restart(); }, 300);
    return;
  }
  if (path === "/api/reload" && req.method === "POST") { send(res, 200, { ok: true }); setTimeout(() => { server.close(); restart(); }, 300); return; }
  if (path === "/api/run") return send(res, 200, { running: false });

  if (path === "/icon.svg") return sendFile(res, join(root, "icon.svg"), req);
  const asset = /^\/core\/assets\/([\w.-]+)$/.exec(path);
  if (asset) return CORE_ASSETS.includes(asset[1]) ? sendFile(res, join(root, "core", "assets", asset[1]), req) : (res.writeHead(404), res.end());
  const rel = path === "/" ? "index.html" : path.slice(1);
  const file = resolve(root, "ui", rel);
  if (!file.startsWith(resolve(root, "ui") + sep)) { res.writeHead(404); return res.end(); }
  return extname(file).toLowerCase() === ".html" ? sendHtml(res, file) : sendFile(res, file, req);
}

const server = createServer((req, res) => handle(req, res).catch((e) => send(res, 500, { error: e.message })));
function listen(attempt = 0) {
  server.once("error", (e) => {
    if (e.code === "EADDRINUSE" && process.env.VET_WAIT_PORT && attempt < 50) return setTimeout(() => listen(attempt + 1), 200);
    if (e.code === "EADDRINUSE") {
      return fetch(`http://127.0.0.1:${PORT}/api/root`).then((r) => r.json()).then((info) => {
        if (info.root !== root) throw new Error("other");
        if (!process.argv.includes("--no-open")) appWindow(`http://127.0.0.1:${PORT}/`);
        process.exit(0);
      }).catch(() => {
        if (PORT - BASE_PORT >= 20) throw e;
        PORT++; while (SKIP.includes(PORT)) PORT++;
        listen(attempt);
      });
    }
    throw e;
  });
  server.listen(PORT, "127.0.0.1", () => {
    try { writeJson(join(workspace, "server-address.json"), { root, service: "video-editing-tools", port: PORT, pid: process.pid, started: new Date().toISOString() }); } catch {}
    console.log(`Video Editing Tools: http://127.0.0.1:${PORT}/`);
    if (!process.argv.includes("--no-open")) appWindow(`http://127.0.0.1:${PORT}/`);
  });
}
listen();
