import { httpBytes, httpJson, log } from '../util';

const BASE = () =>
  process.env.DASHSCOPE_BASE_URL?.trim().replace(/\/$/, '') ||
  'https://dashscope-intl.aliyuncs.com';

const key = () => {
  const value = process.env.DASHSCOPE_API_KEY?.trim();
  if (!value) throw new Error('DASHSCOPE_API_KEY is not set');
  return value;
};

interface TaskResponse {
  output?: {
    task_id?: string;
    task_status?: string;
    video_url?: string;
    message?: string;
  };
  message?: string;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Async image-to-video (e.g. `wan2.5-i2v-preview`): submit with
 * `X-DashScope-Async: enable`, then poll `/api/v1/tasks/{id}` until it settles.
 * `imageUrl` accepts an https URL or a `data:image/...;base64,` URI.
 */
export async function imageToVideo(opts: {
  model: string;
  imageUrl: string;
  prompt: string;
  durationSec?: number;
  timeoutMs?: number;
}): Promise<Uint8Array> {
  const submitted = await httpJson<TaskResponse>(
    `${BASE()}/api/v1/services/aigc/video-generation/video-synthesis`,
    {
      headers: { authorization: `Bearer ${key()}`, 'X-DashScope-Async': 'enable' },
      json: {
        model: opts.model,
        input: { img_url: opts.imageUrl, prompt: opts.prompt },
        parameters: { duration: opts.durationSec ?? 5, resolution: '720P', prompt_extend: true },
      },
    },
  );

  const taskId = submitted.output?.task_id;
  if (!taskId) throw new Error(`no task_id: ${submitted.message ?? JSON.stringify(submitted)}`);

  const deadline = Date.now() + (opts.timeoutMs ?? 10 * 60_000);
  while (Date.now() < deadline) {
    await sleep(6_000);
    const task = await httpJson<TaskResponse>(`${BASE()}/api/v1/tasks/${taskId}`, {
      headers: { authorization: `Bearer ${key()}` },
    });
    const status = task.output?.task_status;
    if (status === 'SUCCEEDED') {
      const url = task.output?.video_url;
      if (!url) throw new Error(`task ${taskId} succeeded without video_url`);
      return httpBytes(url);
    }
    if (status === 'FAILED' || status === 'CANCELED' || status === 'UNKNOWN') {
      throw new Error(`task ${taskId} ${status}: ${task.output?.message ?? ''}`);
    }
    log(`dashscope ${taskId}: ${status ?? 'PENDING'}`);
  }
  throw new Error(`task ${taskId} timed out`);
}
