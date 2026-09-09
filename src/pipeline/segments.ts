import { VIDEO, cfg } from '../config';
import { generateImage } from '../providers/images';
import { cachedFile, ffmpeg, httpBytes, log, probeSize, writeAtomic } from '../util';

const { w, h, fps } = VIDEO;

/** Stills are kept at 1.5x output size so the Ken Burns zoom stays sharp. */
export const STILL = { w: 1620, h: 2880 } as const;

export const ENCODE = [
  '-c:v', 'libx264', '-profile:v', 'main', '-level:v', '4.0', '-preset', 'veryfast',
  '-crf', '21', '-maxrate', '4000k', '-bufsize', '8000k',
  '-g', String(fps * 2), '-keyint_min', String(fps * 2), '-sc_threshold', '0',
  '-pix_fmt', 'yuv420p',
];

const frameCount = (seconds: number) => Math.max(2, Math.round(seconds * fps));

const encodeSegment = (args: string[], seconds: number, out: string) =>
  ffmpeg([...args, '-frames:v', String(frameCount(seconds)), '-r', String(fps), '-an', ...ENCODE, out]);

/** Slow zoom over a still, exactly `seconds` long. */
export const kenBurns = (still: string, seconds: number, out: string) =>
  encodeSegment(
    [
      '-i', still,
      '-vf',
      `zoompan=z='min(1.0+0.0009*on,1.14)':d=${frameCount(seconds)}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=${w}x${h}:fps=${fps},setsar=1,format=yuv420p`,
    ],
    seconds,
    out,
  );

const fit = (seconds: number) =>
  `scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h},fps=${fps},setsar=1,tpad=stop_mode=clone:stop_duration=${seconds.toFixed(3)},setpts=PTS-STARTPTS,format=yuv420p`;

/** Crop a video to 9:16 and hold its last frame until `seconds`. */
export const fitVideo = (src: string, seconds: number, out: string) =>
  encodeSegment(['-i', src, '-vf', fit(seconds)], seconds, out);

/** `seconds` of `src` starting at `from`, fitted to 9:16. */
export const slice = (src: string, from: number, seconds: number, out: string) =>
  encodeSegment(['-ss', from.toFixed(3), '-i', src, '-vf', fit(seconds)], seconds, out);

export async function concat(parts: string[], out: string) {
  const list = `${out}.txt`;
  await writeAtomic(list, parts.map((file) => `file '${file}'`).join('\n'));
  await ffmpeg(['-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', out]);
}

const toPortrait = (src: string, out: string) =>
  ffmpeg([
    '-i', src,
    '-vf',
    `scale=${STILL.w}:${STILL.h}:force_original_aspect_ratio=increase,crop=${STILL.w}:${STILL.h},setsar=1`,
    '-frames:v', '1', '-q:v', '3', out,
  ]);

/** Fetch `url` into a portrait still at `out`; false when it is missing or too small. */
export async function stillFromUrl(url: string, out: string): Promise<boolean> {
  try {
    const raw = `${out}.src`;
    await writeAtomic(raw, await httpBytes(url));
    const { width, height } = await probeSize(raw);
    if (width < 480 || height < 480) throw new Error(`too small (${width}x${height})`);
    await toPortrait(raw, out);
    return true;
  } catch (err) {
    log(`scenes: source image unusable (${(err as Error).message})`);
    return false;
  }
}

/** Generate a still from `prompt` (cached as `<out>.png`) and fit it to portrait. */
export async function stillFromPrompt(prompt: string, out: string): Promise<void> {
  const raw = await cachedFile(`${out}.png`, () => generateImage(`${prompt}. ${cfg.style}`));
  await toPortrait(raw, out);
}
