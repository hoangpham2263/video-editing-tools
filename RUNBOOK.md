# RUNBOOK

All commands run in the tool folder. Each step is one command; each prints one JSON line `{ok, ...}`.
Files: `workspace/projects/<id>/{project.json, source/, samples/<sid>/{video, sample.json, analysis/, style.json}, out/<run>/}`.

## Mode 1: Analyze sample
1. `node scripts/progress.mjs step --mode analyze --key sample`
2. `node scripts/analyze.mjs <id> <sid>` (writes samples/<sid>/style.json)
3. `node scripts/progress.mjs finish --mode analyze` then `node scripts/runlog.mjs add --mode analyze --project <id>`

## Mode 2: Build video
1. `node scripts/progress.mjs step --mode build --key sources`
2. `node scripts/build.mjs <id> --sample <sid>` (writes out/<run>/ with video, cover, review.json incl. sample)
3. `node scripts/check.mjs <id> <run>` (stills per shot, cover)
4. `node scripts/review.mjs mark <id> <run> ready` (shows in Videos > To review)
5. `node scripts/progress.mjs finish --mode build` then `node scripts/runlog.mjs add --mode build --project <id>`

Projects: `node scripts/project.mjs new --name "..." | list | show <id> | sample-add <id> <file> | sample-list <id> | sample-remove <id> <sid>`.
