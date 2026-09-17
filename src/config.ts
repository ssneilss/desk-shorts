import path from 'node:path';

const str = (key: string, fallback = '') => process.env[key]?.trim() || fallback;

const flag = (key: string) => /^(1|true|yes|on)$/i.test(str(key));

export const root = str('PROJECT_WORKSPACE_ROOT') || process.cwd();

export const cfg = {
  bucket: str('BUCKET'),
  region: str('AWS_REGION', 'us-east-1'),
  /** Where the runtime mirrors every project workspace; absent on a laptop. */
  efsPath: str('EFS_PATH'),
  opensearchUrl: str('OPENSEARCH_URL'),
  deskProjectId: str('SHORTS_DESK_PROJECT_ID', '3XXSRSd'),
  signalProjectId: str('SHORTS_SIGNAL_PROJECT_ID', 'SOWL83z'),
  docTypes: str('SHORTS_DOC_TYPES', 'sell_side_report,sell_side_comments,expert_call'),
  /** Keep only items the firm holds or watches. */
  coverageOnly: flag('SHORTS_COVERAGE_ONLY'),
  lang: str('SHORTS_LANG', 'en'),
  textModel: str('SHORTS_TEXT_MODEL', 'gpt-5-mini'),
  /** Empty means "let the image route pick its own default" (see `providers/images.ts`). */
  imageModel: str('SHORTS_IMAGE_MODEL'),
  ttsModel: str('SHORTS_TTS_MODEL', 'gpt-4o-mini-tts'),
  openrouterTtsModel: str('SHORTS_OPENROUTER_TTS_MODEL', 'minimax/speech-2.8-turbo'),
  /** Whisper, not `gpt-4o-transcribe`: OpenRouter rejects `verbose_json` on the latter. */
  alignModel: str('SHORTS_ALIGN_MODEL', 'openai/whisper-1'),
  hedraModel: str('SHORTS_HEDRA_MODEL', 'kling-ai-avatar-v2'),
  voiceId: str('SHORTS_VOICE_ID', '21m00Tcm4TlvDq8ikWAM'),
  recipe: str('SHORTS_RECIPE', 'classic'),
  persona: str('SHORTS_PERSONA'),
  /** Script shape id; `SHORTS_STYLE` below is the image art direction, not this. */
  style: str('SHORTS_SCRIPT_STYLE'),
  voice: str('SHORTS_VOICE'),
  avatar: str('SHORTS_AVATAR'),
  artStyle: str(
    'SHORTS_STYLE',
    'editorial financial illustration, muted navy/ivory palette, no text, no logos',
  ),
};

export const paths = {
  dailyDir: path.join(root, 'shorts', 'daily'),
  daily: (date: string) => path.join(root, 'shorts', 'daily', `${date}.json`),
  mediaDir: (date: string) => path.join(root, 'shorts', 'media', date),
  mediaRef: (date: string, clipId: string, ext: string) =>
    `shorts/media/${date}/${clipId}.${ext}`,
  workDate: (date: string) => path.join(root, '.work', date),
  work: (date: string, clipId: string) => path.join(root, '.work', date, clipId),
  runLog: (date: string) => path.join(root, '.work', date, 'run.log'),
  book: (date: string) => path.join(root, '.work', date, 'book.json'),
  inbox: path.join(root, 'inbox'),
  inboxDone: path.join(root, 'inbox', 'done'),
  bgm: path.join(root, 'assets', 'bgm.mp3'),
  portrait: (personaId: string) => path.join(root, 'assets', 'personas', `${personaId}.png`),
};

export const VIDEO = { w: 1080, h: 1920, fps: 30 } as const;
