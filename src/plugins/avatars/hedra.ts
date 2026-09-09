import { cfg } from '../../config';
import type { AvatarProvider, Plugin } from '../../plugin';
import { awaitJob, download, hasHedra, submit, upload } from '../../providers/hedra';
import { log } from '../../util';

interface ModelSpec {
  maxSeconds: number;
  resolution: string;
  /** Character-3 requires a prompt; Kling merely accepts one. */
  needsPrompt?: boolean;
}

const MODELS: Record<string, ModelSpec> = {
  'kling-ai-avatar-v2': { maxSeconds: 58, resolution: '720p' },
  'hedra-character-3': { maxSeconds: 600, resolution: '720p', needsPrompt: true },
};

const UNKNOWN: ModelSpec = { maxSeconds: 60, resolution: '720p' };

const spec = (model: string) => MODELS[model] ?? UNKNOWN;

/** Longest audio one call of `model` accepts, per its `/v3/models/{id}/openapi.json`. */
export const maxSecondsFor = (model: string) => spec(model).maxSeconds;

const FRAMING =
  'The person speaks straight to camera, steady head-and-shoulders framing, natural expression';

export const hedraAvatar: AvatarProvider = {
  id: 'hedra',
  available: hasHedra,
  maxSeconds: maxSecondsFor(cfg.hedraModel),
  async animate({ portrait, audio, seconds, prompt }) {
    const model = cfg.hedraModel;
    const { resolution, needsPrompt } = spec(model);
    log(`hedra: uploading portrait for ${model}`);
    const startImage = await upload(portrait);
    log(`hedra: uploading narration (${seconds.toFixed(1)}s)`);
    const track = await upload(audio);
    const id = await submit(model, {
      start_image: startImage,
      audio: track,
      aspect_ratio: '9:16',
      resolution,
      ...(needsPrompt || prompt ? { prompt: prompt ?? FRAMING } : {}),
    });
    log(`hedra: job ${id} submitted`);
    return download(await awaitJob(id));
  },
};

export const hedraPlugin: Plugin = { id: 'hedra', avatars: [hedraAvatar] };
