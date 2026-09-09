import path from 'node:path';
import { httpBytes, httpJson, log } from '../util';

const BASE = process.env.HEDRA_BASE_URL?.trim() || 'https://api.hedra.com/v3';

export const hasHedra = () => Boolean(process.env.HEDRA_API_KEY?.trim());

const auth = () => {
  const apiKey = process.env.HEDRA_API_KEY?.trim();
  if (!apiKey) throw new Error('HEDRA_API_KEY is not set');
  return { authorization: `Key ${apiKey}` };
};

/** What a model's media input takes: the presigned handle `POST /v3/files` hands back. */
export interface FileRef {
  source: 'url';
  url: string;
}

export type JobState = 'IN_QUEUE' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED';

export interface Job {
  job_id: string;
  status: JobState;
  outputs?: { url?: string | null; content_type?: string | null; status?: string }[];
  error?: { code?: string; message?: string } | null;
}

/** `POST /v3/files` — free, sniffs its own content type, and the handle lapses after an hour. */
export async function upload(file: string): Promise<FileRef> {
  const form = new FormData();
  form.append('file', Bun.file(file), path.basename(file));
  const { url } = await httpJson<{ url: string }>(`${BASE}/files`, { headers: auth(), body: form });
  return { source: 'url', url };
}

/** `POST /v3/models/{model}` — the 202 ack carries the job id. */
export async function submit(model: string, input: Record<string, unknown>): Promise<string> {
  const ack = await httpJson<{ job_id: string }>(`${BASE}/models/${model}`, {
    headers: auth(),
    json: { input },
  });
  return ack.job_id;
}

const result = (id: string) => httpJson<Job>(`${BASE}/jobs/${id}`, { headers: auth() });

/** Poll `GET /v3/jobs/{id}/status` until it settles, then read the result envelope. */
export async function awaitJob(id: string, timeoutMs = 900_000, pollMs = 5_000): Promise<Job> {
  const deadline = Date.now() + timeoutMs;
  let seen = '';
  while (Date.now() < deadline) {
    const { status } = await httpJson<{ status: JobState }>(`${BASE}/jobs/${id}/status`, {
      headers: auth(),
    });
    if (status !== seen) {
      log(`hedra: job ${id} ${status.toLowerCase()}`);
      seen = status;
    }
    if (status === 'COMPLETED') return result(id);
    if (status === 'FAILED') {
      const failed = await result(id);
      throw new Error(`hedra: job ${id} failed: ${failed.error?.message ?? 'no reason given'}`);
    }
    await Bun.sleep(pollMs);
  }
  throw new Error(`hedra: job ${id} was ${seen || 'unseen'} after ${Math.round(timeoutMs / 1000)}s`);
}

/** Outputs are deleted 48h after a job completes, so pull the bytes straight away. */
export async function download(job: Job): Promise<Uint8Array> {
  const url = job.outputs?.find((out) => out.url)?.url;
  if (!url) throw new Error(`hedra: job ${job.job_id} completed with no output url`);
  return httpBytes(url);
}
