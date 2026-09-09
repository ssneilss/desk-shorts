import { z } from 'zod';
import { slice } from '../../pipeline/segments';
import type { SceneRenderer } from '../../plugin';

const schema = z.object({ kind: z.literal('presenter') });

export const presenterScene: SceneRenderer<typeof schema> = {
  kind: 'presenter',
  schema,
  hint: 'presenter — the host on camera, full frame. Nothing to fill; use it for the hook and for beats that are pure opinion.',
  async render(ctx, _scene, _index, out) {
    if (!ctx.presenter) throw new Error('no presenter track');
    await slice(ctx.presenter, ctx.window[0], ctx.window[1] - ctx.window[0], out);
  },
};
