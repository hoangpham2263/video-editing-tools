# Video Editing Tools

Local app to make vertical (9:16) videos in the style of a sample video. Same window as social-autopilot.

## Open the app
- Windows: double-click `start-app.cmd`. macOS: `start-app.command`.
- Port: from the folder (47000 + hash, skips 8775/8785/47595); override with `VET_PORT`. Address in `workspace/server-address.json`.

## Flow
1. **Overview**: New project (name, note, caption language).
2. **Project**: add sample videos (one or more).
3. **Project**: add source clips (shared by the project).
4. **Prompt**: pick Analyze sample or Build video, agent, project, sample; Copy prompt; paste into Claude Code / Codex in this folder. Run progress shows below.
5. **Videos**: To review / Approved / Dropped; Approve, Drop, Download.

Steps and commands: [RUNBOOK.md](RUNBOOK.md). Rules for agents: [AGENTS.md](AGENTS.md).
All data lives in `workspace/` (not in git).
