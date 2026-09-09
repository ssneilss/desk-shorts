import path from 'node:path';
import { z } from 'zod';
import { kenBurns, stillFromPrompt, stillFromUrl } from '../../pipeline/segments';
import type { SceneRenderer } from '../../plugin';

const schema = z.object({
  kind: z.literal('concept'),
  visualPrompt: z.string(),
});

export const conceptScene: SceneRenderer<typeof schema> = {
  kind: 'concept',
  schema,
  hint: 'concept — the default; an illustrated still. Fill visualPrompt with one image description, no text or logos in frame.',
  async render(ctx, scene, index, out) {
    const still = path.join(ctx.dir, `beat-${index}.jpg`);
    if (!(await Bun.file(still).exists())) {
      const source = index === 0 ? ctx.item.images[0] : undefined;
      if (!source || !(await stillFromUrl(source, still))) {
        await stillFromPrompt(scene.visualPrompt, still);
      }
    }
    await kenBurns(still, ctx.window[1] - ctx.window[0], out);
  },
};
