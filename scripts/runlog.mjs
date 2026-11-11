// Run log: one JSON file per finished run in workspace/logs/runs/<id>.json, shown in the app's Log tab.
//   node scripts/runlog.mjs add --mode analyze|build --project <id> [--agent claude] [--notes "..."] [--result ok|failed]
//   node scripts/runlog.mjs list [--project <id>] [--mode <mode>]
//   node scripts/runlog.mjs show <log-id>
import fs from "node:fs";
import path from "node:path";
import { workspace, readJson, writeJson, stamp, main } from "./lib.mjs";

export const runsDir = () => path.join(workspace, "logs", "runs");
export function addLog({ mode, project = "", agent = "", notes = "", result = "ok" }) {
  if (!mode) throw new Error("Missing --mode.");
  const at = stamp();
  const id = `${at.replace(/[-:.TZ]/g, "").slice(0, 14)}-${mode}`;
  return writeJson(path.join(runsDir(), `${id}.json`), { id, mode, project, agent, notes: String(notes || ""), result, at });
}
export function listLogs({ project = "", mode = "", limit = 0 } = {}) {
  let names = [];
  try { names = fs.readdirSync(runsDir()).filter((f) => f.endsWith(".json")); } catch {}
  const logs = names.map((f) => readJson(path.join(runsDir(), f))).filter(Boolean)
    .filter((l) => (!project || l.project === project) && (!mode || l.mode === mode))
    .sort((a, b) => String(b.at).localeCompare(String(a.at)));
  return limit ? logs.slice(0, limit) : logs;
}
export function showLog(id) {
  if (!/^[\w-]+$/.test(String(id || ""))) throw new Error(`Bad log id: ${id}`);
  const log = readJson(path.join(runsDir(), `${id}.json`));
  if (!log) throw new Error(`Unknown log ${id}.`);
  return log;
}

main(import.meta.url, (a) => {
  const [cmd, id] = a._;
  if (cmd === "add") return { log: addLog({ mode: a.mode, project: a.project || "", agent: a.agent || "", notes: a.notes || "", result: a.result || "ok" }) };
  if (cmd === "list") return { logs: listLogs({ project: a.project || "", mode: a.mode || "" }) };
  if (cmd === "show") return { log: showLog(id) };
  throw new Error("Usage: runlog.mjs add|list|show");
});
