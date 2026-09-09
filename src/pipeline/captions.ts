export interface Token {
  text: string;
  /** Char offsets into the full narration text. */
  from: number;
  to: number;
}

export interface Word {
  text: string;
  start: number;
  end: number;
}

export interface Caption {
  start: number;
  end: number;
  text: string;
}

const CJK = /[\u3000-\u9fff\uf900-\ufaff\uff00-\uffef]/;

/** Whitespace runs, with CJK split per glyph so captions break sensibly. */
export function tokenize(text: string): Token[] {
  const tokens: Token[] = [];
  for (const run of text.matchAll(/\S+/g)) {
    const value = run[0];
    const base = run.index ?? 0;
    if (!CJK.test(value)) {
      tokens.push({ text: value, from: base, to: base + value.length });
      continue;
    }
    let buf = '';
    let start = 0;
    const flush = (at: number) => {
      if (buf) tokens.push({ text: buf, from: base + start, to: base + at });
      buf = '';
    };
    for (let i = 0; i < value.length; i += 1) {
      const ch = value[i] as string;
      if (CJK.test(ch)) {
        flush(i);
        tokens.push({ text: ch, from: base + i, to: base + i + 1 });
      } else {
        if (!buf) start = i;
        buf += ch;
      }
    }
    flush(value.length);
  }
  return tokens;
}

/** Even char-rate timing, used when the TTS provider returns no alignment. */
export function linearCharTimes(length: number, total: number) {
  const starts = new Array<number>(length);
  const ends = new Array<number>(length);
  for (let i = 0; i < length; i += 1) {
    starts[i] = (total * i) / length;
    ends[i] = (total * (i + 1)) / length;
  }
  return { starts, ends };
}

const at = (times: number[], index: number, fallback: number) =>
  times[Math.min(Math.max(index, 0), times.length - 1)] ?? fallback;

export function wordsFromCharTimes(
  tokens: Token[],
  starts: number[],
  ends: number[],
  total: number,
): Word[] {
  return tokens.map((t) => {
    const start = at(starts, t.from, 0);
    const end = Math.max(at(ends, t.to - 1, total), start + 0.04);
    return { text: t.text, start, end: Math.min(end, total) };
  });
}

/** Char window `[from, to)` mapped to a time window. */
export function spanTime(
  from: number,
  to: number,
  starts: number[],
  ends: number[],
  total: number,
): [number, number] {
  const start = at(starts, from, 0);
  return [start, Math.min(Math.max(at(ends, to - 1, total), start + 0.1), total)];
}

export function joinWords(words: { text: string }[]): string {
  return words.reduce((acc, w, i) => {
    if (i === 0) return w.text;
    const prev = words[i - 1]?.text ?? '';
    const glue = CJK.test(prev.slice(-1)) || CJK.test(w.text[0] ?? '') ? '' : ' ';
    return acc + glue + w.text;
  }, '');
}

const SENTENCE_END = /[.!?;:,。！？；：，]$/;

export function groupCaptions(
  words: Word[],
  opts: { minWords?: number; maxWords?: number; maxChars?: number; maxGap?: number } = {},
): Caption[] {
  const { minWords = 3, maxWords = 5, maxChars = 42, maxGap = 0.7 } = opts;
  const captions: Caption[] = [];
  let buf: Word[] = [];

  const flush = () => {
    if (!buf.length) return;
    const first = buf[0] as Word;
    const last = buf[buf.length - 1] as Word;
    captions.push({ start: first.start, end: Math.max(last.end, first.start + 0.2), text: joinWords(buf) });
    buf = [];
  };

  words.forEach((word, i) => {
    buf.push(word);
    const next = words[i + 1];
    const gap = next ? next.start - word.end : Infinity;
    const long = joinWords(buf).length >= maxChars;
    const breakable = buf.length >= minWords && (SENTENCE_END.test(word.text) || gap > maxGap);
    if (!next || buf.length >= maxWords || long || breakable) flush();
  });

  flush();
  return captions;
}

const pad = (n: number, width = 2) => String(Math.floor(n)).padStart(width, '0');

/** ASS timestamp: `H:MM:SS.cc`. */
export function assTime(seconds: number): string {
  const clamped = Math.max(0, seconds);
  const cs = Math.round(clamped * 100);
  return `${Math.floor(cs / 360000)}:${pad((cs / 6000) % 60)}:${pad((cs / 100) % 60)}.${pad(cs % 100)}`;
}

export const assEscape = (text: string) =>
  text.replace(/\\/g, '\\\\').replace(/[{}]/g, '').replace(/\r?\n/g, '\\N').trim();

const style = (name: string, font: string, size: number, alignment: number, marginV: number) =>
  `Style: ${name},${font},${size},&H00FFFFFF,&H00FFFFFF,&H00201808,&H80000000,-1,0,0,0,100,100,0,0,1,2,0,${alignment},80,80,${marginV},1`;

export function buildAss(
  captions: Caption[],
  titles: Caption[],
  opts: { width?: number; height?: number; font?: string } = {},
): string {
  const { width = 1080, height = 1920, font = 'Noto Sans' } = opts;
  const line = (name: string, c: Caption) =>
    `Dialogue: 0,${assTime(c.start)},${assTime(c.end)},${name},,0,0,0,,${assEscape(c.text)}`;

  return [
    '[Script Info]',
    'ScriptType: v4.00+',
    'WrapStyle: 0',
    'ScaledBorderAndShadow: yes',
    `PlayResX: ${width}`,
    `PlayResY: ${height}`,
    '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    style('Caption', font, 62, 2, Math.round(height * 0.16)),
    style('Title', font, 52, 8, Math.round(height * 0.14)),
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, Effect, Text',
    ...titles.filter((t) => t.text.trim()).map((t) => line('Title', t)),
    ...captions.filter((c) => c.text.trim()).map((c) => line('Caption', c)),
    '',
  ].join('\n');
}
