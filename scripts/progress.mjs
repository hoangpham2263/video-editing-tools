// Run progress for the app's Prompt tab: one file per mode, workspace/runs/current-<mode>.json
//   { run_id, mode, project, agent, created, updated, finished, steps: [{ n, key, name, state, detail, at }] }
// The app's Copy prompt makes a new pending run; the agent reports each step (numbered like RUNBOOK.md).
//   node scripts/progress.mjs new   --mode analyze|build [--project <id>] [--agent claude]
//   node scripts/progress.mjs step  --mode <mode> --key <key> [--state running|done|failed] [--detail "..."]
//   node scripts/progress.mjs finish --mode <mode> [--result "..."]
//   node scripts/progress.mjs show  --mode <mode>
import path from "node:path";
import { workspace, readJson, writeJson, stamp, main } from "./lib.mjs";

export const MODES = ["analyze", "build"];
export const STEPS = {
  analyze: [["sample", "Read sample"], ["analyze", "Analyze style"], ["style", "Write style.json"]],
  build: [["sources", "Check sources"], ["build", "Cut & render"], ["check", "Self-check"], ["review", "To review"]],
};
export const STATES = ["pending", "running", "done", "failed", "stopped"];
export const STALE_MS = 6 * 3600 * 1000;
const validMode = (m) => { if (!MODES.includes(m)) throw new Error(`Mode must be one of ${MODES.join(", ")}.`); return m; };
export const progressFile = (mode) => path.join(workspace, "runs", `current-${validMode(mode)}.json`);
export const readRun = (mode) => readJson(progressFile(mode), null);

export function newRun(mode, { project = "", agent = "" } = {}) {
  const now = stamp();
  return writeJson(progressFile(mode), { run_id: now.replace(/[-:.TZ]/g, "").slice(0, 14), mode, project, agent, created: now, updated: now, finished: "", result: "", steps: STEPS[validMode(mode)].map(([key, name], i) => ({ n: i + 1, key, name, state: "pending", detail: "", at: "" })) });
}
export function track(mode, key, { state = "running", detail = "" } = {}) {
  if (!STATES.includes(state)) throw new Error(`State must be one of ${STATES.join(", ")}.`);
  const run = readRun(mode) || newRun(mode);
  const step = run.steps.find((s) => s.key === key);
  if (!step) throw new Error(`Unknown step ${key} for ${mode}.`);
  Object.assign(step, { state, detail: String(detail || ""), at: stamp() });
  run.updated = stamp();
  return writeJson(progressFile(mode), run);
}
export function finishRun(mode, { result = "" } = {}) {
  const run = readRun(mode);
  if (!run) throw new Error(`No ${mode} run.`);
  run.finished = run.updated = stamp(); run.result = String(result || "");
  return writeJson(progressFile(mode), run);
}
export function progressView(mode, now = Date.now()) {
  const run = readRun(mode);
  return { mode, run, active: !!run && !run.finished && now - Date.parse(run.updated || 0) < STALE_MS };
}

main(import.meta.url, (a) => {
  const [cmd] = a._;
  if (cmd === "new") return { run: newRun(a.mode, { project: a.project || "", agent: a.agent || "" }) };
  if (cmd === "step") return { run: track(a.mode, a.key, { state: a.state || "running", detail: a.detail || "" }) };
  if (cmd === "finish") return { run: finishRun(a.mode, { result: a.result || "" }) };
  if (cmd === "show") return progressView(a.mode);
  throw new Error("Usage: progress.mjs new|step|finish|show --mode analyze|build");
});
