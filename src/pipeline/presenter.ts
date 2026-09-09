import path from 'node:path';
import { paths } from '../config';
import type { AvatarProvider, Persona } from '../plugin';
import { generateImage } from '../providers/images';
import { cachedFile, ffmpeg, log } from '../util';
import { concat, fitVideo } from './segments';
import type { VoiceResult } from './voice';

/** Greedily group beat windows into contiguous chunks no longer than `maxSeconds`. */
export function planChunks(
  windows: [number, number][],
  maxSeconds: number,
): [number, number][] {
  const chunks: [number, number][] = [];
  for (const [start, end] of windows) {
    const last = chunks[chunks.length - 1];
    if (last && end - last[0] <= maxSeconds) last[1] = end;
    else chunks.push([last ? last[1] : start, end]);
  }
  return chunks;
}

/** Committed art in `assets/personas/` wins; otherwise generate it once. */
const portraitFor = (persona: Persona) =>
  cachedFile(paths.portrait(persona.id), async () => {
    log(`presenter: generating portrait for ${persona.id}`);
    return generateImage(persona.portraitPrompt);
  });

const sliceAudio = (src: string, from: number, seconds: number, out: string) =>
  ffmpeg([
    '-ss', from.toFixed(3), '-t', seconds.toFixed(3), '-i', src,
    '-c:a', 'libmp3lame', '-b:a', '128k', out,
  ]);

/** The persona speaking the whole narration, as one 9:16 track. */
export async function presenterFor(
  dir: string,
  persona: Persona,
  voice: VoiceResult,
  avatar: AvatarProvider,
): Promise<string> {
  const out = path.join(dir, 'presenter.mp4');
  if (await Bun.file(out).exists()) return out;

  const portrait = await portraitFor(persona);
  const chunks = planChunks(voice.beats, avatar.maxSeconds);
  log(`presenter: ${persona.id} via ${avatar.id}, ${chunks.length} chunk(s)`);

  const parts: string[] = [];
  for (const [i, [from, to]] of chunks.entries()) {
    const seconds = to - from;
    let audio = voice.audio;
    if (chunks.length > 1) {
      audio = path.join(dir, `presenter-${i}.mp3`);
      if (!(await Bun.file(audio).exists())) await sliceAudio(voice.audio, from, seconds, audio);
    }
    const animated = await cachedFile(path.join(dir, `avatar-${i}.mp4`), () =>
      avatar.animate({ portrait, audio, seconds }),
    );
    const part = chunks.length === 1 ? out : path.join(dir, `presenter-${i}.mp4`);
    await fitVideo(animated, seconds, part);
    parts.push(part);
  }

  if (parts.length > 1) await concat(parts, out);
  return out;
}
