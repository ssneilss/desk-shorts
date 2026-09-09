import path from 'node:path';
import { VIDEO, cfg, paths } from '../config';
import { ffmpeg, log, writeAtomic } from '../util';
import { buildAss, type Caption } from './captions';
import type { ClipScript } from './script';
import type { BeatVisual } from './visuals';
import type { VoiceResult } from './voice';

const { w, h, fps } = VIDEO;
const ENCODE = ['-c:v', 'libx264', '-crf', '20', '-preset', 'veryfast', '-pix_fmt', 'yuv420p'];

const kenBurns = (frames: number) =>
  `zoompan=z='min(1.0+0.0009*on,1.14)':d=${frames}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=${w}x${h}:fps=${fps},setsar=1,format=yuv420p`;

const fit = (seconds: number) =>
  `scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h},fps=${fps},setsar=1,tpad=stop_mode=clone:stop_duration=${seconds.toFixed(3)},setpts=PTS-STARTPTS,format=yuv420p`;

async function segment(dir: string, visual: BeatVisual, seconds: number, out: string) {
  const frames = Math.max(2, Math.round(seconds * fps));
  const args = visual.video
    ? ['-i', visual.video, '-vf', fit(seconds)]
    : ['-i', visual.image, '-vf', kenBurns(frames)];
  await ffmpeg([...args, '-frames:v', String(frames), '-r', String(fps), '-an', ...ENCODE, out], dir);
}

const beatTitles = (script: ClipScript, beats: [number, number][]): Caption[] =>
  script.beats.map((beat, i) => ({
    start: beats[i]?.[0] ?? 0,
    end: Math.max((beats[i]?.[1] ?? 0) - 0.15, (beats[i]?.[0] ?? 0) + 0.5),
    text: beat.onScreen,
  }));

export interface RenderResult {
  video: string;
  poster: string;
  posterBlur: string;
  durationSec: number;
}

export async function render(
  dir: string,
  script: ClipScript,
  voice: VoiceResult,
  visuals: BeatVisual[],
): Promise<RenderResult> {
  const segments: string[] = [];
  for (const [i, window] of voice.beats.entries()) {
    const visual = visuals[i];
    if (!visual) throw new Error(`no visual for beat ${i}`);
    const name = `seg-${i}.mp4`;
    await segment(dir, visual, window[1] - window[0], name);
    segments.push(name);
  }

  await writeAtomic(
    path.join(dir, 'concat.txt'),
    segments.map((name) => `file '${name}'`).join('\n'),
  );
  await ffmpeg(['-f', 'concat', '-safe', '0', '-i', 'concat.txt', '-c', 'copy', 'silent.mp4'], dir);

  const font = cfg.lang.startsWith('zh') ? 'Noto Sans CJK SC' : 'Noto Sans';
  await writeAtomic(
    path.join(dir, 'captions.ass'),
    buildAss(voice.captions, beatTitles(script, voice.beats), { width: w, height: h, font }),
  );

  const hasBgm = await Bun.file(paths.bgm).exists();
  const total = voice.durationSec;
  const chains = ['[0:v]ass=captions.ass[v]'];
  if (hasBgm) {
    chains.push(
      `[2:a]volume=-18dB,afade=t=out:st=${Math.max(total - 1, 0).toFixed(2)}:d=1[bg]`,
      '[1:a][bg]amix=inputs=2:duration=first:normalize=0[a]',
    );
  }

  await ffmpeg(
    [
      '-i', 'silent.mp4',
      '-i', voice.audio,
      ...(hasBgm ? ['-stream_loop', '-1', '-i', paths.bgm] : []),
      '-filter_complex', chains.join(';'),
      '-map', '[v]', '-map', hasBgm ? '[a]' : '1:a',
      ...ENCODE,
      '-c:a', 'aac', '-b:a', '128k', '-ar', '44100',
      '-t', total.toFixed(3),
      '-movflags', '+faststart',
      'clip.mp4',
    ],
    dir,
  );

  await ffmpeg(
    ['-ss', Math.min(1, total / 3).toFixed(2), '-i', 'clip.mp4', '-frames:v', '1', '-q:v', '3', 'poster.jpg'],
    dir,
  );

  let posterBlur = '';
  for (const quality of ['8', '16', '24']) {
    await ffmpeg(['-i', 'poster.jpg', '-vf', 'scale=20:-2', '-q:v', quality, 'blur.jpg'], dir);
    const bytes = Buffer.from(await Bun.file(path.join(dir, 'blur.jpg')).arrayBuffer());
    posterBlur = `data:image/jpeg;base64,${bytes.toString('base64')}`;
    if (posterBlur.length <= 4096) break;
  }
  if (posterBlur.length > 4096) {
    log('render: blur placeholder too large, dropping it');
    posterBlur = '';
  }

  return {
    video: path.join(dir, 'clip.mp4'),
    poster: path.join(dir, 'poster.jpg'),
    posterBlur,
    durationSec: total,
  };
}
