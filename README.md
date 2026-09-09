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
plugins/sources/               pipeline/                            plugins/
  signal-desk  ─┐                sources    load each --sources plugin        ← source
  desk         ─┼─ SourceItem →  select     rank against the book, dedupe, cap
  documents    ─┤                script     LLM → title, caption, 4-6 beats   ← persona + scene hints
  inbox/*.md   ─┘                voice      TTS + timings → captions[]        ← voice
                                 presenter  portrait speaking the narration   ← avatar (optional)
                                 scenes     one seg-<i>.mp4 per beat          ← scene per beat
                                 render     concat → pip → mux → burn .ass
                                 publish    media + merged, validated daily JSON
```

Where the day's items come from, which persona speaks, which TTS runs, which scene kinds a beat may
pick and whether there is an on-camera presenter are all plugins; a **recipe** composes the
clip-making ones (see [Plugins](#plugins)).

Every step caches under `.work/<date>/<clipId>/`, so a rerun resumes rather than repeats. Delete a
clip's work directory to force it to regenerate.

## Sources

A source is a plugin (`{ id, load(date) }`, `src/plugins/sources/`) registered in
`src/plugins/index.ts`; `--sources` names the ones a run reads and is validated against the
registry. A source that throws costs the run only its own items.

| source | where it reads |
| --- | --- |
| `signal-desk` | `content/daily/<date>.json` + `content/calls/<url_id>.json` in the `$SHORTS_SIGNAL_PROJECT_ID` workspace |
| `desk` | `explore/daily/<date>.json` in the `$SHORTS_DESK_PROJECT_ID` workspace (latest ≤ date) |
| `documents` | OpenSearch `internal_documents` at `$OPENSEARCH_URL`, `created_at` in `[date-1d, date]` |
| `inbox` | local `inbox/*.md` with optional `title` / `href` / `kind` / `date` / `images` front matter |

Workspace files come from `$EFS_PATH/projects/<id>/…` when the runtime has mirrored that project
onto this host, and from `s3://$BUCKET/projects/<id>/…` otherwise — same key either way.

`signal-desk` is the lead source: each usable item becomes a `meeting` clip carrying the
standfirst, takeaway, key figures and, when the call file is readable, its sections and notable
quotes (~8k chars). Signal Desk runs three times a day, so a missing file falls back up to five
days and the run log names the date actually used. Links go to
`https://signal-desk.triatasolution.com/articles/<url_id>.html`, else the item's `source_url`.

`documents` reads raw sell-side and expert-call documents — `SHORTS_DOC_TYPES` picks the types, 40
newest first — and appends the companies named inside them so the coverage book can see them. With
`OPENSEARCH_URL` unset it logs and returns nothing.

Processed inbox files move to `inbox/done/`. Every source exposes `images: string[]` (https only) —
the artwork the `image` scene may quote; `inbox` reads it from a space- or comma-separated
`images:` line.

### Coverage book

`src/book.ts` loads the firm's live positions (`s3://$BUCKET/daily-updates/live-portfolio.json`)
and analyst watchlists (`…/watchlist.json`), caches them at `.work/<date>/book.json`, and scores
every item: **2** for a held name, **1** for a watched one. `select` adds `3 ×` that score to its
ranking, so what the desk owns leads the feed; `SHORTS_COVERAGE_ONLY=1` drops everything else. An
unreachable book is logged and the run ranks without it.

Matching is deliberately precision-first, ported from the morning desk: a ticker (any of `1024 HK`,
`1024.HK`, `1024_HK`, `(1024.HK)` in the text) or an exact multi-word company phrase. One-word
matches are not enough evidence — they promoted the wrong story upstream — so a single-token name
like `MEITUAN` is reachable by ticker only.

## Setup in the app

1. Create a project in alpha-v2 and connect it to GitHub.
2. Clone this repo into the project workspace root — the workspace root *is* the checkout, so the
   agent's `cwd` and `PROJECT_WORKSPACE_ROOT` both point at it.
3. Set `SHORTS_PROJECT_ID` in the app to that project's id so `/shorts` reads
   `<workspace>/shorts/daily/*.json` and presigns `projects/<id>/shorts/media/…`.
4. Add a schedule whose prompt is the contents of `PROMPT.md`.

## Plugins

A **recipe** names the personas a clip may use, the scene kinds its beats may pick, an optional
avatar provider and the layout. `SHORTS_RECIPE` selects one (default `classic`).

| recipe | personas | scenes | avatar | layout |
| --- | --- | --- | --- | --- |
| `classic` | `analyst` | `concept` | — | `scenes` |
| `presenter` | all five | `presenter`, `chart`, `image`, `concept` | `hedra` | `pip` |

| kind | id | what it is |
| --- | --- | --- |
| voice | `elevenlabs` | `/with-timestamps`, per-character alignment |
| voice | `openrouter` | `/audio/speech` (MiniMax by default), then `/audio/transcriptions` for word timings |
| voice | `openai` | `audio.speech`, timings derived from the measured duration |
| scene | `concept` | generated still (or the source image on beat 1), Ken Burns |
| scene | `image` | one of `item.images[]`, fitted to portrait, Ken Burns |
| scene | `chart` | 2-8 figures quoted from the source as a bar or line chart (ECharts → SVG → PNG), Ken Burns |
| scene | `presenter` | the presenter track, sliced to the beat |
| avatar | `hedra` | Hedra v3: upload portrait + narration, submit, poll, download the mp4 |

Personas (`src/plugins/personas.ts`) come in Mandarin and English twins: `anchor`, `analyst`,
`hype`, `gentle`, `skeptic` speak Chinese, `<id>-en` speaks English; `SHORTS_LANG` picks the twin.
Each carries the tone injected into the script prompt, its voice provider and voice id, optional
delivery tags (`[excited]`), and the prompt that generates `assets/personas/<id>.png` on first use.
Committed portrait art always wins.

The Mandarin five speak through `openrouter` with MiniMax system voices
(`Chinese (Mandarin)_Male_Announcer`, `_Wise_Women`, `_Unrestrained_Young_Man`, `_Warm_Girl`,
`_Humorous_Elder`) and a MiniMax `emotion` each; the English twins stay on `elevenlabs`. MiniMax
honours neither delivery tags nor an instruction, so the voice strips tags before synthesis and the
Mandarin personas declare none.

The `hedra` avatar animates the persona portrait with the model `SHORTS_HEDRA_MODEL` names
(default `kling-ai-avatar-v2`, chunked at 58 s to stay under its 60 s audio cap;
`hedra-character-3` takes up to 600 s), at
9:16 and 720p. Narration longer than one call is chunked and concatenated.

Overrides, all optional: `SHORTS_RECIPE`, `SHORTS_PERSONA`, `SHORTS_VOICE`, `SHORTS_AVATAR`
(`--recipe <id>` beats `SHORTS_RECIPE`). A persona whose voice provider has no key falls back to
the first provider that does.

**Adding one** — write a file under `src/plugins/{sources,voices,scenes,avatars}/` exporting a
`Source`, `VoiceProvider`, `SceneRenderer` or `AvatarProvider` (types in `src/plugin.ts`), then add
one line to `src/plugins/index.ts`. A source only has to turn a date into `SourceItem[]`; the
registry makes it selectable with `--sources`. A scene renderer declares the zod `schema` the
script LLM must fill and a one-line `hint` telling it when to pick that scene;
`src/pipeline/segments.ts` has the shared
ffmpeg helpers (`kenBurns`, `fitVideo`, `slice`, `concat`, `stillFromUrl`, `stillFromPrompt`).
Recipes live in `src/plugins/recipes.ts`.

## Environment

Provided by the host: `OPENROUTER_API_KEY`, `OPENAI_API_KEY`, `OPENAI_BASE_URL`,
`ELEVENLABS_API_KEY`, `HEDRA_API_KEY`, `BUCKET`, `AWS_REGION`, `PROJECT_WORKSPACE_ROOT`,
`AGENT_PROJECT_ID`, `EFS_PATH` (`/mnt` in production — the mirror of every project workspace; off
that host the same files come from S3), `OPENSEARCH_URL` (the domain holding `internal_documents`,
signed SigV4 as `es` in `AWS_REGION`; unset disables the `documents` source).

Knobs (all optional, see `.env.example`): `SHORTS_TEXT_MODEL` (default `gpt-5-mini`), `SHORTS_LANG`
(`en` | `zh`), `SHORTS_STYLE`, `SHORTS_IMAGE_MODEL`, `SHORTS_TTS_MODEL`,
`SHORTS_OPENROUTER_TTS_MODEL` (default `minimax/speech-2.8-turbo`), `SHORTS_ALIGN_MODEL` (default
`openai/whisper-1`), `SHORTS_VOICE_ID`, `SHORTS_HEDRA_MODEL`, `SHORTS_DESK_PROJECT_ID`,
`SHORTS_SIGNAL_PROJECT_ID` (default `SOWL83z`), `SHORTS_DOC_TYPES` (default
`sell_side_report,sell_side_comments,expert_call`), `SHORTS_COVERAGE_ONLY` (default off),
`HEDRA_BASE_URL` (default `https://api.hedra.com/v3`), plus the plugin selectors above.

The script step runs on OpenRouter when `OPENROUTER_API_KEY` is set and falls back to OpenAI.
A persona whose voice provider has no key speaks through the first provider that does; the
`openai` voice derives timings from the measured duration.

**Images** take the same route as the script: `POST /images` on OpenRouter when it has a key, else
`POST /images/generations` on OpenAI. `SHORTS_IMAGE_MODEL` overrides the model; left empty each
route keeps its own default (`google/gemini-2.5-flash-image` on OpenRouter, `gpt-image-1` on
OpenAI). Both are asked for 9:16 — `aspect_ratio` on OpenRouter, the closest `1024x1536` on OpenAI.

The `openrouter` voice has no timestamped TTS to call, so it synthesises with
`SHORTS_OPENROUTER_TTS_MODEL` and transcribes its own mp3 with `SHORTS_ALIGN_MODEL`
(`response_format: verbose_json`, `timestamp_granularities: ["word"]`) to recover word timings. A
failed or unsupported transcription only costs the clip its per-word captions — the pipeline then
times them from the measured duration. `openai/gpt-4o-transcribe` is *not* a valid align model:
OpenRouter rejects `verbose_json` on it.

## Cost and latency per clip (estimates, not measured)

| step | cost | wall clock |
| --- | --- | --- |
| script (`gpt-5-mini`, ~4k tokens) | ~$0.005 | 10-25 s |
| voice (ElevenLabs ~700 chars) | ~$0.05-0.10 | 5-15 s |
| voice (OpenAI fallback) | ~$0.01 | 5-10 s |
| voice (`minimax/speech-2.8-turbo`, $0.06 per 1k chars, plus `whisper-1` alignment) | ~$0.02-0.03 | 10-20 s |
| stills (`gemini-2.5-flash-image`, 4-6 portraits) | ~$0.16-0.24 | 30-90 s |
| stills (`gpt-image-1`, 4-6 portraits) | ~$0.15-0.25 | 60-150 s |
| persona portrait (~$0.04 either route, once per persona) | ~$0.04 | 15-30 s |
| chart scene (ECharts + resvg, local) | free | < 1 s |
| presenter (`kling-ai-avatar-v2`, 720p) | ~$0.056 per second of narration | minutes per 60 s chunk |
| presenter (`hedra-character-3`, 720p) | ~$0.05/s, ~$0.0625/s at 1080p | minutes per chunk |
| ffmpeg render | — | 20-60 s |

So roughly **$0.25 and 2-4 minutes per clip** with the `classic` recipe. A default six-clip day is a
couple of dollars and under half an hour. Recipes with a presenter add one avatar generation per
15-60 s chunk of narration on top. Hedra deletes a job's output 48 hours after it
completes, which costs us nothing: the avatar step downloads it as soon as the job finishes. Every beat that picks `chart` is rendered locally, so it drops a
still out of the image bill rather than adding to it.

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

# Three review clips from real firm data into ./samples, using the alpha-v2 env files:
scripts/samples.sh                       # env files, limit and extra flags are optional
scripts/samples.sh "" 1 --dry-run        # scripts only
```

`PROJECT_WORKSPACE_ROOT` falls back to `process.cwd()`, so a local checkout behaves like the
workspace. `assets/bgm.mp3` is optional; drop one in and every clip is mixed with it at -18 dB.
