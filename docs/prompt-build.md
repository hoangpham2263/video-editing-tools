Build a video for Video Editing Tools ({{AGENT}}).

Tool folder: {{TOOL}}
Project: {{PROJECT}}  Sample: {{SAMPLE}}

Read {{TOOL}}/AGENTS.md and {{TOOL}}/RUNBOOK.md (mode "Build video"), then run each step:
1. node scripts/progress.mjs step --mode build --key sources
2. node scripts/build.mjs {{PROJECT}} --sample {{SAMPLE}}
3. node scripts/check.mjs {{PROJECT}} <run>  (look at the stills and the cover before handing it in)
4. node scripts/review.mjs mark {{PROJECT}} <run> ready
5. node scripts/progress.mjs finish --mode build; node scripts/runlog.mjs add --mode build --project {{PROJECT}} --agent {{AGENT}}

Use only the project source clips (source/). Rules: references/rules.md.
