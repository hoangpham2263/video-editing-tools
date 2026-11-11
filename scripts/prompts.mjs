// The prompts the app's Prompt tab copies: docs/prompt-analyze.md and docs/prompt-build.md,
// with {{TOOL}} = this repo's folder, {{PROJECT}} = the project id, {{SAMPLE}} = the sample id, {{AGENT}} = claude|codex.
//   node scripts/prompts.mjs analyze|build <project-id> [--sample <sid>] [--agent claude|codex]
import fs from "node:fs";
import path from "node:path";
import { toolRoot, main } from "./lib.mjs";

export const PROMPT_MODES = { analyze: "prompt-analyze.md", build: "prompt-build.md" };
export const AGENTS = ["claude", "codex"];
export function promptText(mode, { project = "", sample = "", agent = "claude" } = {}) {
  const file = PROMPT_MODES[mode];
  if (!file) throw new Error(`Mode must be one of ${Object.keys(PROMPT_MODES).join(", ")}.`);
  if (!AGENTS.includes(agent)) throw new Error(`Agent must be one of ${AGENTS.join(", ")}.`);
  const text = fs.readFileSync(path.join(toolRoot, "docs", file), "utf8");
  return text.replace(/\{\{TOOL\}\}/g, toolRoot).replace(/\{\{PROJECT\}\}/g, project || "<project-id>").replace(/\{\{SAMPLE\}\}/g, sample || "<sample-id>").replace(/\{\{AGENT\}\}/g, agent).trim() + "\n";
}

main(import.meta.url, (a) => ({ prompt: promptText(a._[0], { project: a._[1] || "", sample: a.sample || "", agent: a.agent || "claude" }) }));
