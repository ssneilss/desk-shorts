import path from 'node:path';
import { registry, type Resolved, type SceneCtx } from '../plugin';
import { log } from '../util';
import type { ClipScript } from './script';
import type { Selected } from './select';
import type { VoiceResult } from './voice';

export interface ScenesInput {
  dir: string;
  item: Selected;
  script: ClipScript;
  voice: VoiceResult;
  resolved: Resolved;
  /** Whole-narration presenter track, when the recipe has one. */
  presenter?: string;
}

export const segmentPaths = (dir: string, count: number) =>
  Array.from({ length: count }, (_, i) => path.join(dir, `seg-${i}.mp4`));

/** One silent `seg-<i>.mp4` per beat, rendered by the scene plugin the script picked. */
export async function scenesFor(input: ScenesInput): Promise<string[]> {
  const { dir, item, script, voice, resolved, presenter } = input;
  const segments = segmentPaths(dir, script.beats.length);

  for (const [i, beat] of script.beats.entries()) {
    const out = segments[i] as string;
    if (await Bun.file(out).exists()) continue;

    const ctx: SceneCtx = {
      dir,
      item,
      script,
      persona: resolved.persona,
      window: voice.beats[i] ?? [0, 1],
      ...(presenter ? { presenter } : {}),
    };

    try {
      await registry.scene(beat.scene.kind).render(ctx, beat.scene, i, out);
    } catch (err) {
      if (beat.scene.kind === 'concept') throw err;
      log(`scenes: beat ${i} ${beat.scene.kind} failed (${(err as Error).message}), using concept`);
      const fallback = { kind: 'concept', visualPrompt: `${script.title}. ${beat.onScreen}` };
      await registry.scene('concept').render(ctx, fallback, i, out);
    }
  }

  return segments;
}
