# AGENTS

- The app (src/server.mjs + ui/) only shows and manages: projects, files, prompts, review. It has no video logic.
- Agents do the work by running scripts/ (see RUNBOOK.md). Editing rules: references/rules.md (highest priority).
- Copy only how a sample is edited; never its content, logo or music.
- workspace/ never goes to git. GitHub is backup only, never a step.
- Do not run tests unless the user asks; check syntax with `node --check`.
- Commit under the user's name, no AI/Co-Authored-By lines. Do not push unless asked.
