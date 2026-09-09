import { createHash } from 'node:crypto';
import { appendFileSync, mkdirSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export const tail = (text: string, lines = 30) =>
  text.trim().split('\n').slice(-lines).join('\n');

let logPath: string | null = null;

export function initLog(file: string) {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, '');
  logPath = file;
}

export function log(...parts: unknown[]) {
  const line = parts.map((p) => (typeof p === 'string' ? p : JSON.stringify(p))).join(' ');
  console.log(line);
  if (logPath) appendFileSync(logPath, `${line}\n`);
}

export async function sh(
  cmd: string[],
  opts: { input?: Uint8Array; cwd?: string } = {},
): Promise<string> {
  const proc = Bun.spawn(cmd, {
    stdin: opts.input ?? 'ignore',
    stdout: 'pipe',
    stderr: 'pipe',
    cwd: opts.cwd,
  });
  const [out, err, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  if (code !== 0) throw new Error(`${cmd[0]} exited ${code}\n$ ${cmd.join(' ')}\n${tail(err)}`);
  return out;
}

export const ffmpeg = (args: string[], cwd?: string) =>
  sh(['ffmpeg', '-y', '-hide_banner', '-loglevel', 'error', ...args], { cwd });

export async function probeSize(file: string): Promise<{ width: number; height: number }> {
  const out = await sh([
    'ffprobe', '-v', 'error', '-select_streams', 'v:0',
    '-show_entries', 'stream=width,height', '-of', 'csv=p=0:s=x', file,
  ]);
  const [width, height] = out.trim().split('x').map(Number);
  if (!width || !height) throw new Error(`not a decodable image/video: ${file}`);
  return { width, height };
}

export async function duration(file: string): Promise<number> {
  const out = await sh([
    'ffprobe', '-v', 'error', '-show_entries', 'format=duration',
    '-of', 'default=nw=1:nk=1', file,
  ]);
  const value = Number.parseFloat(out.trim());
  if (!Number.isFinite(value) || value <= 0) throw new Error(`no duration for ${file}`);
  return value;
}

/** Stable, URL-safe clip id matching the schema's /^[A-Za-z0-9_-]{4,64}$/. */
export const clipId = (...parts: string[]) =>
  createHash('sha256').update(parts.join(' ')).digest('base64url').slice(0, 12);

export const stripHtml = (html: string) =>
  html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|li|div|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&(?:quot|#34);/g, '"')
    .replace(/&(?:#39|apos);/g, "'")
    .replace(/[^\S\n]+/g, ' ')
    .replace(/ ?\n ?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

const TICKER_NOISE = new Set([
  'THE', 'AND', 'FOR', 'USD', 'CNY', 'HKD', 'CEO', 'CFO', 'GDP', 'CPI', 'PPI', 'YOY', 'QOQ',
  'EPS', 'IPO', 'ETF', 'API', 'NEW', 'AI', 'US', 'UK', 'EU', 'HK', 'CN',
  'Q1', 'Q2', 'Q3', 'Q4', 'FY', 'BPS', 'YTD', 'EMEA', 'APAC', 'LATAM', 'COGS', 'CAPEX', 'OPEX',
  'EBITDA', 'EBIT', 'GMV', 'DAU', 'MAU', 'ARPU', 'ASP', 'ROE', 'ROIC', 'AUM', 'NAV', 'PMI', 'FX',
  'ESG', 'SAAS', 'ADR', 'ADS', 'PE', 'PB', 'EV',
]);

const TICKER_RE = /^(?:\d{4,6}(?:\.(?:HK|SZ|SS|SH))?|[A-Z]{1,5}(?:\.[A-Z]{1,3})?)$/;

/** Shaped like an exchange symbol and not a finance acronym. */
export const isTicker = (value: string) => TICKER_RE.test(value) && !TICKER_NOISE.has(value);

export function extractTickers(
  text: string,
  explicit: (string | null | undefined)[] = [],
): string[] {
  const found = new Set<string>();
  for (const value of explicit) {
    const t = value?.trim().toUpperCase();
    if (t && /^[A-Z0-9.]{1,12}$/.test(t)) found.add(t);
  }
  for (const match of text.matchAll(/\b(?:\d{4,6}\.(?:HK|SZ|SS|SH)|[A-Z]{2,5})\b/g)) {
    if (!TICKER_NOISE.has(match[0])) found.add(match[0]);
  }
  return [...found].slice(0, 6);
}

export const httpsUrls = (values: (string | null | undefined)[]): string[] =>
  values.filter((value): value is string => Boolean(value?.startsWith('https://')));

/** Trim to `max` characters on a word boundary; long bodies only cost tokens. */
export function capText(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(' '), max - 200)).trimEnd()}…`;
}

export const ensureDir = (dir: string) => mkdirSync(dir, { recursive: true });

export async function writeAtomic(file: string, data: string | Uint8Array) {
  ensureDir(path.dirname(file));
  const tmp = `${file}.tmp-${process.pid}`;
  await Bun.write(tmp, data);
  renameSync(tmp, file);
}

export const writeJson = (file: string, value: unknown) =>
  writeAtomic(file, `${JSON.stringify(value, null, 2)}\n`);

export async function readJson<T>(file: string): Promise<T | null> {
  const handle = Bun.file(file);
  return (await handle.exists()) ? ((await handle.json()) as T) : null;
}

/** Memoise a pipeline step on disk so reruns are idempotent. */
export async function cached<T>(file: string, produce: () => Promise<T>): Promise<T> {
  const hit = await readJson<T>(file);
  if (hit !== null) return hit;
  const value = await produce();
  await writeJson(file, value);
  return value;
}

export async function cachedFile(
  file: string,
  produce: () => Promise<Uint8Array>,
): Promise<string> {
  if (await Bun.file(file).exists()) return file;
  await writeAtomic(file, await produce());
  return file;
}

type Req = {
  method?: string;
  headers?: Record<string, string>;
  json?: unknown;
  /** Multipart body; unlike `json` it leaves the content type to fetch's boundary. */
  body?: FormData;
};

async function request(url: string, init: Req): Promise<Response> {
  const empty = init.json === undefined && init.body === undefined;
  const res = await fetch(url, {
    method: init.method ?? (empty ? 'GET' : 'POST'),
    headers: {
      ...(init.json === undefined ? {} : { 'content-type': 'application/json' }),
      ...init.headers,
    },
    body: init.body ?? (init.json === undefined ? undefined : JSON.stringify(init.json)),
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} ${url}\n${tail(await res.text(), 8)}`);
  return res;
}

export const httpJson = async <T>(url: string, init: Req = {}): Promise<T> =>
  (await request(url, init)).json() as Promise<T>;

export const httpBytes = async (url: string, init: Req = {}): Promise<Uint8Array> =>
  new Uint8Array(await (await request(url, init)).arrayBuffer());

export const isoDate = (d = new Date()) => d.toISOString().slice(0, 10);

export const shiftDate = (date: string, days: number) =>
  isoDate(new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000));

export const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
