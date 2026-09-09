import { z } from 'zod';

/**
 * Self-contained copy of `@alpha/shared/lib/shorts` (+ the primitives it pulls
 * from `morning-desk`). Keep in sync with alpha-v2 — the app validates with its
 * own copy, so a drift here ships clips the feed will reject.
 */
const SHORT_URL_RE = /^\/u\/[A-Za-z0-9_-]{4,}/;
const APP_RELATIVE_RE = /^\/[a-z]/;

export function urlProblem(url: string): string | null {
  if (!url) return 'is empty';
  if (SHORT_URL_RE.test(url) || url.startsWith('https://')) return null;
  if (url.startsWith('http://')) return 'uses http:// (must be https://)';
  if (APP_RELATIVE_RE.test(url)) return null;
  if (url.startsWith('/')) {
    return 'is not a recognised app-relative path (must be /u/{id} or /<lowercase-segment>…)';
  }
  return 'is neither /u/{id}, an https:// URL, nor an app-relative /path';
}

export const urlSchema = z.string().superRefine((value, ctx) => {
  const problem = urlProblem(value);
  if (problem) ctx.addIssue({ code: 'custom', message: `URL ${problem}` });
});

export const labelSchema = z.string().trim().min(1);

const BLUR_PREFIX = 'data:image/jpeg;base64,';
export const BLUR_MAX_CHARS = 4096;

export const blurDataUrlSchema = z
  .string()
  .startsWith(BLUR_PREFIX, `blur placeholder must start with ${BLUR_PREFIX}`)
  .max(BLUR_MAX_CHARS, `blur placeholder exceeds ${BLUR_MAX_CHARS} characters`);

const WORKSPACE_MEDIA_RE = /^shorts\/media\/[A-Za-z0-9_\-./]+\.(mp4|webm|jpg|jpeg|png|webp)$/;

export const mediaRefSchema = z.union([
  z.string().regex(WORKSPACE_MEDIA_RE, 'must be shorts/media/<…>.<mp4|webm|jpg|png|webp>'),
  urlSchema,
]);

export const isWorkspaceMedia = (ref: string) => WORKSPACE_MEDIA_RE.test(ref);

export const SHORTS_SOURCE_KINDS = [
  'meeting',
  'report',
  'news',
  'daily-update',
  'desk',
  'other',
] as const;

export const shortsCaptionSchema = z.object({
  start: z.number().min(0),
  end: z.number().min(0),
  text: labelSchema,
});

export const shortsSourceSchema = z.object({
  kind: z.enum(SHORTS_SOURCE_KINDS),
  title: labelSchema,
  href: urlSchema.optional(),
  publishedAt: z.string().optional(),
});

export const shortsClipSchema = z.object({
  id: z.string().regex(/^[A-Za-z0-9_-]{4,64}$/),
  title: labelSchema,
  caption: z.string().default(''),
  video: mediaRefSchema,
  poster: mediaRefSchema.optional(),
  posterBlur: blurDataUrlSchema.optional(),
  durationSec: z.number().positive(),
  captions: z.array(shortsCaptionSchema).default([]),
  source: shortsSourceSchema,
  tickers: z.array(labelSchema).default([]),
  tags: z.array(labelSchema).default([]),
  createdAt: z.string().datetime({ offset: true }),
});

export const shortsDocSchema = z.object({
  v: z.literal(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  clips: z.array(shortsClipSchema).min(1),
});

export type ShortsDoc = z.infer<typeof shortsDocSchema>;
export type ShortsClip = z.infer<typeof shortsClipSchema>;
export type ShortsCaption = z.infer<typeof shortsCaptionSchema>;
export type ShortsSource = z.infer<typeof shortsSourceSchema>;
export type ShortsSourceKind = (typeof SHORTS_SOURCE_KINDS)[number];

export function parseShortsDoc(
  text: string,
): { doc: ShortsDoc; errors?: undefined } | { doc?: undefined; errors: string[] } {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (err) {
    return { errors: [`not valid JSON: ${(err as Error).message}`] };
  }
  const result = shortsDocSchema.safeParse(raw);
  if (!result.success) {
    return {
      errors: result.error.issues.map(
        (issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`,
      ),
    };
  }
  return { doc: result.data };
}
