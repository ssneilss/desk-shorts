# desk-shorts

Turns the firm's daily investment content into vertical short-form video and publishes it for the
`/shorts` mobile feed in `alpha-v2`.

Each run produces, inside the project workspace:

- `shorts/daily/<YYYY-MM-DD>.json` — `{ v: 1, date, clips: [...] }`, validated against the same
  schema the app uses (`packages/shared/src/lib/shorts.ts`, mirrored in `src/schema.ts`).
- `shorts/media/<YYYY-MM-DD>/<clipId>.mp4` — 1080x1920 H.264 + AAC, faststart.
- `shorts/media/<YYYY-MM-DD>/<clipId>.jpg` — poster; a 20px-wide JPEG data URI rides in the JSON as
  `posterBlur`.

Git carries code and the daily JSON only. Media is excluded and reaches the app through the
workspace S3 sync (`projects/<projectId>/shorts/media/…`), which the app presigns for playback.

## Pipeline

```
sources/                      pipeline/
  desk           ─┐             select   rank, dedupe, cap at --limit
  daily-updates  ─┼─ SourceItem  script   LLM → title, caption, 4-6 beats
  inbox/*.md     ─┘             voice    TTS + word timings → captions[]
                                visuals  source image or generated still (+ optional i2v)
                                render   ffmpeg: Ken Burns → concat → mux → burn .ass
                                publish  media + merged, validated daily JSON
```

Every step caches under `.work/<date>/<clipId>/`, so a rerun resumes rather than repeats. Delete a
clip's work directory to force it to regenerate.

## Sources

| source | where it reads |
| --- | --- |
| `desk` | `s3://$BUCKET/projects/$SHORTS_DESK_PROJECT_ID/explore/daily/<date>.json` (latest ≤ date) |
| `daily-updates` | `s3://$BUCKET/daily-updates/<year>/<latest>/data/all-updates.json` |
| `inbox` | local `inbox/*.md` with optional `title` / `href` / `kind` / `date` front matter |

Processed inbox files move to `inbox/done/`.

## Setup in the app

1. Create a project in alpha-v2 and connect it to GitHub.
2. Clone this repo into the project workspace root — the workspace root *is* the checkout, so the
   agent's `cwd` and `PROJECT_WORKSPACE_ROOT` both point at it.
3. Set `SHORTS_PROJECT_ID` in the app to that project's id so `/shorts` reads
   `<workspace>/shorts/daily/*.json` and presigns `projects/<id>/shorts/media/…`.
4. Add a schedule whose prompt is the contents of `PROMPT.md`.

## Environment

Provided by the host: `OPENAI_API_KEY`, `OPENAI_BASE_URL`, `OPENROUTER_API_KEY`,
`ELEVENLABS_API_KEY`, `DASHSCOPE_API_KEY`, `DASHSCOPE_BASE_URL`, `BUCKET`, `AWS_REGION`,
`PROJECT_WORKSPACE_ROOT`, `AGENT_PROJECT_ID`.

Knobs (all optional, see `.env.example`): `SHORTS_TEXT_MODEL` (default `gpt-5-mini`), `SHORTS_LANG`
(`en` | `zh`), `SHORTS_STYLE`, `SHORTS_IMAGE_MODEL`, `SHORTS_TTS_MODEL`, `SHORTS_VOICE_ID`,
`SHORTS_VIDEO_MODEL` (set to e.g. `wan2.5-i2v-preview` to enable DashScope image-to-video instead of
Ken Burns), `SHORTS_DESK_PROJECT_ID`.

Without `OPENAI_API_KEY` the script step falls back to OpenRouter; without `ELEVENLABS_API_KEY` the
voice step falls back to OpenAI `audio.speech` and derives timings from the measured duration.

## Cost and latency per clip (estimates, not measured)

| step | cost | wall clock |
| --- | --- | --- |
| script (`gpt-5-mini`, ~4k tokens) | ~$0.005 | 10-25 s |
| voice (ElevenLabs ~700 chars) | ~$0.05-0.10 | 5-15 s |
| voice (OpenAI fallback) | ~$0.01 | 5-10 s |
| stills (`gpt-image-1`, 4-6 portraits) | ~$0.15-0.25 | 60-150 s |
| motion (DashScope i2v, 4-6 x 5 s) | ~$1-3 | 5-12 min |
| ffmpeg render | — | 20-60 s |

So roughly **$0.25 and 2-4 minutes per clip** with Ken Burns, or **$1.50-3.50 and 8-15 minutes**
with image-to-video. A default six-clip day is a couple of dollars and under half an hour.

## Local development

```bash
bun install
bun run typecheck && bun test

# Inspect the scripts without spending on audio, images or render:
bun run generate --date 2026-09-09 --limit 2 --dry-run

# Full run from one source, then validate the output:
bun run generate --limit 1 --sources inbox
bun run validate

# Re-render one clip from its cached .work directory:
bun run render-one <clipId> --date 2026-09-09
```

`PROJECT_WORKSPACE_ROOT` falls back to `process.cwd()`, so a local checkout behaves like the
workspace. `assets/bgm.mp3` is optional; drop one in and every clip is mixed with it at -18 dB.
