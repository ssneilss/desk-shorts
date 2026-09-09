import path from 'node:path';

const str = (key: string, fallback = '') => process.env[key]?.trim() || fallback;

export const root = str('PROJECT_WORKSPACE_ROOT') || process.cwd();

export const cfg = {
  bucket: str('BUCKET'),
  region: str('AWS_REGION', 'us-east-1'),
  deskProjectId: str('SHORTS_DESK_PROJECT_ID', '3XXSRSd'),
  lang: str('SHORTS_LANG', 'en'),
  textModel: str('SHORTS_TEXT_MODEL', 'gpt-5-mini'),
  imageModel: str('SHORTS_IMAGE_MODEL', 'gpt-image-1'),
  ttsModel: str('SHORTS_TTS_MODEL', 'gpt-4o-mini-tts'),
  videoModel: str('SHORTS_VIDEO_MODEL'),
  voiceId: str('SHORTS_VOICE_ID', '21m00Tcm4TlvDq8ikWAM'),
  style: str(
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
  inbox: path.join(root, 'inbox'),
  inboxDone: path.join(root, 'inbox', 'done'),
  bgm: path.join(root, 'assets', 'bgm.mp3'),
};

export const VIDEO = { w: 1080, h: 1920, fps: 30 } as const;
