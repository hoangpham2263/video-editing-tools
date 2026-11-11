// Review state of one build: workspace/projects/<id>/out/<run>/review.json {status: ready|approved|dropped, at, sample}.
// The build (scripts/build.mjs) writes review.json with sample = the sample id it followed; mark keeps it.
//   node scripts/review.mjs mark <id> <run> ready|approved|dropped
//   node scripts/review.mjs list
import fs from "node:fs";
import path from "node:path";
import { projectsDir, projectDir, readJson, writeJson, stamp, main } from "./lib.mjs";

export const STATUSES = ["ready", "approved", "dropped"];
const runDir = (id, run) => {
  if (!/^[\w.-]+$/.test(String(run || ""))) throw new Error(`Bad run: ${run}`);
  const d = path.join(projectDir(id), "out", run);
  if (!fs.existsSync(d)) throw new Error(`Unknown build ${id}/${run}.`);
  return d;
};
export function mark(id, run, status) {
  if (!STATUSES.includes(status)) throw new Error(`Status must be one of ${STATUSES.join(", ")}.`);
  const file = path.join(runDir(id, run), "review.json");
  return writeJson(file, { ...readJson(file, {}), status, at: stamp() });
}
const pick = (dir, exts) => { try { const f = fs.readdirSync(dir).sort().find((n) => exts.includes(path.extname(n).toLowerCase())); return f ? path.join(dir, f) : ""; } catch { return ""; } };
// Every build in workspace/projects/*/out/*/ with its status (no review.json = still building).
export function listVideos() {
  const list = [];
  let ids = [];
  try { ids = fs.readdirSync(projectsDir); } catch {}
  for (const id of ids) {
    const outDir = path.join(projectsDir, id, "out");
    const p = readJson(path.join(projectsDir, id, "project.json"), {});
    let runs = [];
    try { runs = fs.readdirSync(outDir).filter((r) => fs.statSync(path.join(outDir, r)).isDirectory()); } catch {}
    for (const run of runs) {
      const dir = path.join(outDir, run);
      const review = readJson(path.join(dir, "review.json"), null);
      list.push({ project: id, project_name: p.name || id, run, dir, status: review?.status || "building", at: review?.at || "", sample: review?.sample || "", sample_name: readJson(path.join(projectsDir, id, "samples", String(review?.sample || "-"), "sample.json"), {})?.name || review?.sample || "", video: pick(dir, [".mp4", ".mov", ".webm"]), cover: pick(dir, [".png", ".jpg", ".jpeg", ".webp"]) });
    }
  }
  return list.sort((a, b) => String(b.run).localeCompare(String(a.run)));
}

main(import.meta.url, (a) => {
  const [cmd, id, run, status] = a._;
  if (cmd === "mark") return { review: mark(id, run, status) };
  if (cmd === "list") return { videos: listVideos() };
  throw new Error("Usage: review.mjs mark <id> <run> ready|approved|dropped | list");
});
