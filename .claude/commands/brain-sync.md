# Brain Sync — Capture project state to Open Brain

Capture the current state of this project as a milestone thought in Open Brain MCP.

## Steps

0. **CLAUDE.md check** — before capturing to Open Brain, read the conversation and ask yourself one question:

   > "Did this session reveal something that would *genuinely burn future Claude instances* if they didn't know it?"

   The bar is high. Examples that qualify:
   - A constraint discovered through failure (e.g. "LibreOffice silently exits 0 with no output on PPTX")
   - A non-obvious API incompatibility or payload format gotcha
   - A decision where the *wrong* default would corrupt data or waste significant time

   Examples that do NOT qualify:
   - General patterns or code style
   - Things already derivable from reading the code
   - Workflow preferences or "nice to know" context
   - Anything that belongs in Open Brain instead

   If something qualifies: append it to the relevant section in CLAUDE.md (e.g. under an existing heading, or the Ingest Decision Log). One concise line or short paragraph — no new sections unless truly warranted. If nothing qualifies, skip this step entirely.

1. Run these commands to gather context:
```
   git log --oneline -10
   git branch --show-current
   git diff --name-only HEAD~1 HEAD
```

2. Use the Open Brain MCP tool `capture_thought` with these exact parameters:
   - **content**: Concise summary of what was built/changed this session. Include: features shipped, key architecture decisions, files changed, open issues or next steps. Max 1800 characters.
   - **access_level**: `secret`
   - **type**: `meeting_debrief`
   - **source**: `claude_code`
   - **topics**: 3–5 relevant tags (e.g. `["Pulse", "UI", "Playwright", "dashboard"]`)
   - **action_items**: Open TODOs or next steps from this session

## Rules
- Never invent content — only capture what actually happened
- Keep content under 1800 characters, compress if needed
- Always include the branch name in content and at least 3 topics
- If nothing meaningful changed, skip the capture