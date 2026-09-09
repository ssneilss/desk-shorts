import path from 'node:path';
import { VIDEO, cfg, paths } from '../config';
import { ffmpeg, log, writeAtomic } from '../util';
import { buildAss, type Caption } from './captions';
import { ENCODE, concat } from './segments';
import type { ClipScript } from './script';
import type { VoiceResult } from './voice';

const { w, h } = VIDEO;
const PIP = { width: 400, margin: 48 };

const beatTitles = (script: ClipScript, beats: [number, number][]): Caption[] =>
  script.beats.map((beat, i) => ({
    start: beats[i]?.[0] ?? 0,
    end: Math.max((beats[i]?.[1] ?? 0) - 0.15, (beats[i]?.[0] ?? 0) + 0.5),
    text: beat.onScreen,
  }));

/** `between()` sum over the beats that are not already showing the presenter. */
const pipEnable = (script: ClipScript, beats: [number, number][]) =>
  beats
    .filter((_, i) => script.beats[i]?.scene.kind !== 'presenter')
    .map(([from, to]) => `between(t,${from.toFixed(2)},${to.toFixed(2)})`)
    .join('+');

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
  segments: string[],
  presenter?: string,
): Promise<RenderResult> {
  const silent = path.join(dir, 'silent.mp4');
  await concat(segments, silent);

  const font = cfg.lang.startsWith('zh') ? 'Noto Sans CJK SC' : 'Noto Sans';
  await writeAtomic(
    path.join(dir, 'captions.ass'),
    buildAss(voice.captions, beatTitles(script, voice.beats), { width: w, height: h, font }),
  );

  const hasBgm = await Bun.file(paths.bgm).exists();
  const total = voice.durationSec;
  const enable = presenter ? pipEnable(script, voice.beats) : '';

  const inputs = ['-i', 'silent.mp4', '-i', voice.audio];
  const chains: string[] = [];
  let video = '0:v';
  let next = 2;

  if (presenter && enable) {
    inputs.push('-i', presenter);
    chains.push(
      `[${next}:v]scale=${PIP.width}:-2[pip]`,
      `[${video}][pip]overlay=W-w-${PIP.margin}:H-h-${PIP.margin}:enable='${enable}'[pip_out]`,
    );
    video = 'pip_out';
    next += 1;
  }
  chains.push(`[${video}]ass=captions.ass[v]`);

  if (hasBgm) {
    inputs.push('-stream_loop', '-1', '-i', paths.bgm);
    chains.push(
      `[${next}:a]volume=-18dB,afade=t=out:st=${Math.max(total - 1, 0).toFixed(2)}:d=1[bg]`,
      '[1:a][bg]amix=inputs=2:duration=first:normalize=0[a]',
    );
  }

  await ffmpeg(
    [
      ...inputs,
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
