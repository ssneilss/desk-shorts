import { afterEach, describe, expect, test } from 'bun:test';
import { hedraAvatar, hedraPlugin, maxSecondsFor } from '../src/plugins/avatars/hedra';
import { awaitJob } from '../src/providers/hedra';

const realFetch = globalThis.fetch;
const realKey = process.env.HEDRA_API_KEY;

const json = (body: unknown) =>
  new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });

/** Answers `/status` from `states` in order, and the result envelope from `envelope`. */
function stubJob(states: string[], envelope: unknown) {
  let poll = 0;
  globalThis.fetch = (async (input: Request | URL | string) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.endsWith('/status')) return json({ job_id: 'job_1', status: states[poll++] });
    return json(envelope);
  }) as typeof fetch;
}

afterEach(() => {
  globalThis.fetch = realFetch;
  if (realKey === undefined) delete process.env.HEDRA_API_KEY;
  else process.env.HEDRA_API_KEY = realKey;
});

describe('hedra avatar', () => {
  test('derives maxSeconds from the model id', () => {
    expect(maxSecondsFor('kling-ai-avatar-v2')).toBe(58);
    expect(maxSecondsFor('hedra-character-3')).toBe(600);
    expect(maxSecondsFor('some-model-shipped-later')).toBe(60);
  });

  test('is available only with a key', () => {
    delete process.env.HEDRA_API_KEY;
    expect(hedraAvatar.available()).toBe(false);
    process.env.HEDRA_API_KEY = 'key_id:secret';
    expect(hedraAvatar.available()).toBe(true);
  });

  test('ships as a plugin but registers nowhere', () => {
    expect(hedraPlugin.avatars).toEqual([hedraAvatar]);
  });
});

describe('awaitJob', () => {
  test('polls until COMPLETED, then reads the outputs', async () => {
    process.env.HEDRA_API_KEY = 'key_id:secret';
    stubJob(['IN_QUEUE', 'IN_PROGRESS', 'COMPLETED'], {
      job_id: 'job_1',
      status: 'COMPLETED',
      outputs: [{ url: 'https://example.test/out.mp4' }],
    });
    const job = await awaitJob('job_1', 5_000, 0);
    expect(job.outputs?.[0]?.url).toBe('https://example.test/out.mp4');
  });

  test('surfaces the failure message from the envelope', async () => {
    process.env.HEDRA_API_KEY = 'key_id:secret';
    stubJob(['FAILED'], {
      job_id: 'job_1',
      status: 'FAILED',
      error: { code: 'MODERATION_FAILED', message: 'input rejected' },
    });
    await expect(awaitJob('job_1', 5_000, 0)).rejects.toThrow(
      'hedra: job job_1 failed: input rejected',
    );
  });

  test('gives up once the timeout passes', async () => {
    process.env.HEDRA_API_KEY = 'key_id:secret';
    stubJob(['IN_PROGRESS', 'IN_PROGRESS'], {});
    await expect(awaitJob('job_1', -1, 0)).rejects.toThrow(/job_1 was unseen after/);
  });
});
