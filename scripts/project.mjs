// Projects: workspace/projects/<id>/{project.json, source/, samples/<sid>/{video, sample.json, analysis/, style.json}, out/<run>/}.
// Many samples per project, each with its own analysis; source clips are shared by the whole project.
//   node scripts/project.mjs new --name "<name>" [--note "..."] [--caption_lang vi]
//   node scripts/project.mjs list | show <id> | set-status <id> <status> | remove <id>
//   node scripts/project.mjs sample-add <id> <video-file> | sample-list <id> | sample-show <id> <sid> | sample-remove <id> <sid> | sample-rename <id> <sid> --name "..."
import fs from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { projectsDir, projectDir, readJson, writeJson, stamp, main } from "./lib.mjs";

const slug = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/gi, "d").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "project";
const files = (dir) => { try { return fs.readdirSync(dir).filter((f) => fs.statSync(path.join(dir, f)).isFile()).map((f) => ({ name: f, path: path.join(dir, f), size: fs.statSync(path.join(dir, f)).size })); } catch { return []; } };
const count = (dir) => { try { return fs.readdirSync(dir).length; } catch { return 0; } };

export function newProject({ name, note = "", caption_lang = "vi" }) {
  if (!String(name || "").trim()) throw new Error("Missing project name.");
  let id;
  do id = `${slug(name)}-${randomBytes(2).toString("hex")}`; while (fs.existsSync(projectDir(id)));
  const dir = projectDir(id);
  for (const d of ["samples", "source", "out"]) fs.mkdirSync(path.join(dir, d), { recursive: true });
  const project = { id, name: String(name).trim(), note: String(note || ""), caption_lang: String(caption_lang || "vi"), created: stamp(), status: "new" };
  writeJson(path.join(dir, "project.json"), project);
  return project;
}
export function listProjects() {
  let ids = [];
  try { ids = fs.readdirSync(projectsDir); } catch {}
  return ids.map((id) => readJson(path.join(projectsDir, id, "project.json"))).filter(Boolean)
    .map((p) => { const d = path.join(projectsDir, p.id); return { ...p, samples: count(path.join(d, "samples")), sources: count(path.join(d, "source")), runs: count(path.join(d, "out")) }; })
    .sort((a, b) => String(b.created).localeCompare(String(a.created)));
}
export function showProject(id) {
  const dir = projectDir(id);
  const project = readJson(path.join(dir, "project.json"));
  if (!project) throw new Error(`Unknown project ${id}.`);
  return { project, dir, samples: listSamples(id), source: files(path.join(dir, "source")) };
}
export function setStatus(id, status) {
  const file = path.join(projectDir(id), "project.json");
  const p = readJson(file);
  if (!p) throw new Error(`Unknown project ${id}.`);
  return writeJson(file, { ...p, status: String(status) });
}
export function removeProject(id) {
  const dir = projectDir(id);
  if (!fs.existsSync(path.join(dir, "project.json"))) throw new Error(`Unknown project ${id}.`);
  fs.rmSync(dir, { recursive: true, force: true });
  return { removed: id };
}

// ----- samples -----
const VIDEO_EXT = [".mp4", ".mov", ".webm", ".m4v", ".mkv"];
const sampleDir = (id, sid) => { if (!/^[a-z0-9][a-z0-9-]*$/.test(String(sid || ""))) throw new Error(`Bad sample id: ${sid}`); return path.join(projectDir(id), "samples", sid); };
const sampleVideo = (dir) => files(dir).find((f) => VIDEO_EXT.includes(path.extname(f.name).toLowerCase())) || null;
// A new empty samples/<sid>/ (sid = slug of the file name + 4 random chars); the caller writes the video into it.
export function sampleCreate(id, fileName) {
  if (!fs.existsSync(path.join(projectDir(id), "project.json"))) throw new Error(`Unknown project ${id}.`);
  const base = path.basename(String(fileName || "sample.mp4"));
  let sid;
  do sid = `${slug(base.replace(/\.[^.]+$/, ""))}-${randomBytes(2).toString("hex")}`; while (fs.existsSync(sampleDir(id, sid)));
  const dir = sampleDir(id, sid);
  fs.mkdirSync(path.join(dir, "analysis"), { recursive: true });
  const sample = { id: sid, name: base, created: stamp(), status: "new" };
  writeJson(path.join(dir, "sample.json"), sample);
  return { sample, dir, file: path.join(dir, base.replace(/[^\w.-]+/g, "_")) };
}
export function sampleAdd(id, src) {
  if (!fs.existsSync(src)) throw new Error(`No file ${src}.`);
  const r = sampleCreate(id, src);
  fs.copyFileSync(src, r.file);
  return r.sample;
}
export function sampleShow(id, sid) {
  const dir = sampleDir(id, sid);
  const sample = readJson(path.join(dir, "sample.json"));
  if (!sample) throw new Error(`Unknown sample ${id}/${sid}.`);
  const style = readJson(path.join(dir, "style.json"));
  return { ...sample, dir, video: sampleVideo(dir)?.path || "", has_style: !!style, analyzed: !!style || sample.status === "analyzed", style };
}
export function listSamples(id) {
  let sids = [];
  try { sids = fs.readdirSync(path.join(projectDir(id), "samples")); } catch {}
  return sids.map((sid) => { try { return sampleShow(id, sid); } catch { return null; } }).filter(Boolean).sort((a, b) => String(a.created).localeCompare(String(b.created)));
}
export function sampleRename(id, sid, name) {
  if (!String(name || "").trim()) throw new Error("Missing name.");
  const file = path.join(sampleDir(id, sid), "sample.json");
  const s = readJson(file);
  if (!s) throw new Error(`Unknown sample ${id}/${sid}.`);
  return writeJson(file, { ...s, name: String(name).trim() });
}
export function sampleRemove(id, sid) {
  const dir = sampleDir(id, sid);
  if (!fs.existsSync(path.join(dir, "sample.json"))) throw new Error(`Unknown sample ${id}/${sid}.`);
  fs.rmSync(dir, { recursive: true, force: true });
  return { removed: sid };
}

main(import.meta.url, (a) => {
  const [cmd, id, x] = a._;
  if (cmd === "new") return { project: newProject({ name: a.name, note: a.note, caption_lang: a.caption_lang }) };
  if (cmd === "list") return { projects: listProjects() };
  if (cmd === "show") return showProject(id);
  if (cmd === "set-status") return { project: setStatus(id, x) };
  if (cmd === "remove") return removeProject(id);
  if (cmd === "sample-add") return { sample: sampleAdd(id, x) };
  if (cmd === "sample-list") return { samples: listSamples(id) };
  if (cmd === "sample-show") return { sample: sampleShow(id, x) };
  if (cmd === "sample-rename") return { sample: sampleRename(id, x, a.name) };
  if (cmd === "sample-remove") return sampleRemove(id, x);
  throw new Error("Usage: project.mjs new|list|show|set-status|remove");
});
