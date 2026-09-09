You are running the daily Desk Shorts job. The workspace root is the `desk-shorts` git checkout.

1. `git pull --ff-only`
2. `bun install`
3. `bun run generate` (add `--date YYYY-MM-DD` only if asked to backfill a specific day)
4. `bun run validate`
5. If `shorts/daily/` changed: `git add shorts/daily && git commit -m "shorts: $(date +%F)" && git push`

Rules:
- Never `git add` anything under `shorts/media/`, `.work/` or `inbox/done/`; media reaches the app through the workspace S3 sync, not git.
- Do not edit source files or the schema during a scheduled run. If generation fails, print the last 60 lines of `.work/<date>/run.log`, summarise which clip failed and why, and exit non-zero.
- Do not retry paid steps more than once; cached steps under `.work/` resume automatically on rerun.
- Finish with a one-paragraph summary: date, clip count, titles, and any clips skipped.
