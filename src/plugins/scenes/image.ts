import path from 'node:path';
import { z } from 'zod';
import { kenBurns, stillFromUrl } from '../../pipeline/segments';
import type { SceneRenderer } from '../../plugin';

const schema = z.object({
  kind: z.literal('image'),
  /** Index into the source images listed in the prompt. */
  index: z.number().int().min(0),
});

export const imageScene: SceneRenderer<typeof schema> = {
  kind: 'image',
  schema,
  hint: 'image — real art that ships with the source. Fill index with one of the source image indexes given below; pick it only when that picture illustrates the beat.',
  async render(ctx, scene, index, out) {
    const url = ctx.item.images[scene.index];
    if (!url) throw new Error(`no source image ${scene.index}`);
    const still = path.join(ctx.dir, `beat-${index}.jpg`);
    if (!(await Bun.file(still).exists()) && !(await stillFromUrl(url, still))) {
      throw new Error(`source image ${scene.index} unusable`);
    }
    await kenBurns(still, ctx.window[1] - ctx.window[0], out);
  },
};
