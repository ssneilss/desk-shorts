#!/usr/bin/env bash
# Render a few clips locally from real firm data so they can be reviewed before scheduling.
#
#   scripts/samples.sh [env-files] [limit] [extra generate flags...]
#
# `env-files` is comma-separated; later files do not override earlier ones. The alpha-v2 app
# keeps API keys in .env.local and BUCKET / AWS_REGION / OPENSEARCH_URL in .env.development.
# Output lands in ./samples (workspace root for this run): samples/shorts/media/<date>/*.mp4
# plus the daily JSON and the per-clip .work cache, so a rerun resumes rather than repeats.
set -euo pipefail

ENV_FILES=${1:-$HOME/alpha-v2/.env.local,$HOME/alpha-v2/.env.development}
LIMIT=${2:-3}
shift $(( $# > 2 ? 2 : $# ))
ENV_FLAGS=()
for file in ${ENV_FILES//,/ }; do ENV_FLAGS+=("--env-file=$file"); done

export PROJECT_WORKSPACE_ROOT=${SAMPLES_ROOT:-$PWD/samples}
export SHORTS_LANG=${SHORTS_LANG:-zh}
export SHORTS_RECIPE=${SHORTS_RECIPE:-presenter}
SOURCES=${SHORTS_SOURCES:-signal-desk,desk}

run() { bun "${ENV_FLAGS[@]}" run src/index.ts "$@"; }

run generate --limit "$LIMIT" --sources "$SOURCES" "$@"
run validate
ls -la "$PROJECT_WORKSPACE_ROOT"/shorts/media/*/*.mp4
