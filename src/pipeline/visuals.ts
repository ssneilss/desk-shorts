import path from 'node:path';
import { cfg } from '../config';
import { imageToVideo } from '../providers/dashscope';
import { image as generateImage } from '../providers/openai';
import { ffmpeg, httpBytes, log, probeSize, writeAtomic } from '../util';
import type { ClipScript } from './script';
import type { Selected } from './select';

/** Stills are kept at 1.5x output size so the Ken Burns zoom stays sharp. */
const STILL = { w: 1620, h: 2880 };

export interface BeatVisual {
  image: string;
  video?: string;
}

const exists = (file: string) => Bun.file(file).exists();

const toPortrait = (src: string, out: string) =>
  ffmpeg([
    '-i', src,
    '-vf',
    `scale=${STILL.w}:${STILL.h}:force_original_aspect_ratio=increase,crop=${STILL.w}:${STILL.h},setsar=1`,
    '-frames:v', '1', '-q:v', '3', out,
  ]);

async function sourceImage(dir: string, url: string): Promise<string | null> {
  try {
    const file = path.join(dir, 'source-image');
    await writeAtomic(file, await httpBytes(url));
    const { width, height } = await probeSize(file);
    if (width < 480 || height < 480) throw new Error(`too small (${width}x${height})`);
    return file;
  } catch (err) {
    log(`visuals: source image unusable (${(err as Error).message}), generating instead`);
    return null;
  }
}

async function dataUrl(file: string): Promise<string> {
  const bytes = Buffer.from(await Bun.file(file).arrayBuffer());
  return `data:image/jpeg;base64,${bytes.toString('base64')}`;
}

export async function visualsFor(
  dir: string,
  script: ClipScript,
  item: Selected,
  beatWindows: [number, number][],
): Promise<BeatVisual[]> {
  const visuals: BeatVisual[] = [];

  for (const [i, beat] of script.beats.entries()) {
    const still = path.join(dir, `beat-${i}.jpg`);
    if (!(await exists(still))) {
      const src = i === 0 && item.image ? await sourceImage(dir, item.image) : null;
      if (src) {
        await toPortrait(src, still);
      } else {
        const raw = path.join(dir, `beat-${i}.png`);
        await writeAtomic(raw, await generateImage(`${beat.visualPrompt}. ${cfg.style}`));
        await toPortrait(raw, still);
      }
    }

    const visual: BeatVisual = { image: still };
    const clip = path.join(dir, `beat-${i}.mp4`);
    if (cfg.videoModel) {
      if (await exists(clip)) {
        visual.video = clip;
      } else {
        try {
          const seconds = Math.min(5, Math.max(3, Math.round((beatWindows[i]?.[1] ?? 5) - (beatWindows[i]?.[0] ?? 0))));
          await writeAtomic(
            clip,
            await imageToVideo({
              model: cfg.videoModel,
              imageUrl: await dataUrl(still),
              prompt: beat.visualPrompt,
              durationSec: seconds,
            }),
          );
          visual.video = clip;
        } catch (err) {
          log(`visuals: beat ${i} i2v failed (${(err as Error).message}), using Ken Burns`);
        }
      }
    }
    visuals.push(visual);
  }

  return visuals;
}
