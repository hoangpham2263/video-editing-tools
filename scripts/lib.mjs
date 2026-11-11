// Shared helpers for scripts/: paths, atomic JSON read/write, and out() (one JSON object on stdout: {ok,...}).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const toolRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const workspace = path.join(toolRoot, "workspace");
export const projectsDir = path.join(workspace, "projects");
export const projectDir = (id) => {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(String(id || ""))) throw new Error(`Bad project id: ${id}`);
  return path.join(projectsDir, id);
};
export const stamp = () => new Date().toISOString();

export function readJson(file, fallback = null) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return fallback; }
}
export function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + "\n");
  fs.renameSync(tmp, file);
  return data;
}
export const out = (data) => { process.stdout.write(JSON.stringify({ ok: true, ...data }) + "\n"); };
export const fail = (error) => { process.stdout.write(JSON.stringify({ ok: false, error: String(error?.message || error) }) + "\n"); process.exitCode = 1; };
// True only when the file is executed directly (not imported by the server).
export const isMain = (url) => !!process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(url);
export function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) { const k = a.slice(2); const v = argv[i + 1] !== undefined && !argv[i + 1].startsWith("--") ? argv[++i] : true; args[k] = v; }
    else args._.push(a);
  }
  return args;
}
export const main = async (url, fn) => { if (!isMain(url)) return; try { out(await fn(parseArgs(process.argv.slice(2)))); } catch (e) { fail(e); } };
