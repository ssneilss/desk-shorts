import path from 'node:path';
import { cfg } from '../config';
import { sh } from '../util';

const bucket = () => {
  if (!cfg.bucket) throw new Error('BUCKET is not set');
  return cfg.bucket;
};

export const s3Uri = (key: string) => `s3://${bucket()}/${key.replace(/^\/+/, '')}`;

export const s3Text = (key: string) => sh(['aws', 's3', 'cp', s3Uri(key), '-']);

/** Entry names directly under `prefix` (folders without their trailing slash). */
export async function s3List(prefix: string): Promise<string[]> {
  const out = await sh(['aws', 's3', 'ls', `${s3Uri(prefix).replace(/\/?$/, '/')}`]);
  return out
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) =>
      line.startsWith('PRE ') ? line.slice(4).replace(/\/$/, '') : (line.split(/\s+/).pop() ?? ''),
    )
    .filter(Boolean);
}

/** Newest entry at or before `upTo`, comparing names lexicographically. */
export async function s3Latest(prefix: string, upTo?: string): Promise<string | null> {
  const names = (await s3List(prefix)).sort((a, b) => b.localeCompare(a));
  return names.find((name) => !upTo || name.slice(0, upTo.length) <= upTo) ?? null;
}

export const workspaceKey = (projectId: string, relPath: string) =>
  `projects/${projectId}/${relPath.replace(/^\/+/, '')}`;

/**
 * One file out of another project's workspace. The runtime mirrors every
 * workspace onto `$EFS_PATH`, so a sibling project is a sibling directory;
 * off that host the same key comes from S3.
 */
export async function workspaceFile(projectId: string, relPath: string): Promise<string> {
  const key = workspaceKey(projectId, relPath);
  if (cfg.efsPath) {
    const local = Bun.file(path.join(cfg.efsPath, key));
    if (await local.exists()) return local.text();
  }
  return s3Text(key);
}
