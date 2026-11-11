Analyze a sample video for Video Editing Tools ({{AGENT}}).

Tool folder: {{TOOL}}
Project: {{PROJECT}}  Sample: {{SAMPLE}}

Read {{TOOL}}/AGENTS.md and {{TOOL}}/RUNBOOK.md (mode "Analyze sample"), then run each step:
1. node scripts/progress.mjs step --mode analyze --key sample
2. node scripts/analyze.mjs {{PROJECT}} {{SAMPLE}}
3. node scripts/progress.mjs finish --mode analyze; node scripts/runlog.mjs add --mode analyze --project {{PROJECT}} --agent {{AGENT}}

Take only HOW the sample is edited (shot length, cover, text, captions, order, pacing, music or not). Never copy its content, logo or music.
