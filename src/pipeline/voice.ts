import path from 'node:path';
import { cfg } from '../config';
import type { Resolved, Speech } from '../plugin';
import { clamp, duration, log, readJson, writeAtomic, writeJson } from '../util';
import {
  charTimesFromWords,
  groupCaptions,
  linearCharTimes,
  spanTime,
  stripTags,
  tokenize,
  wordsFromCharTimes,
  type Caption,
} from './captions';
import type { ClipScript } from './script';

const SEP = '\n\n';

export interface VoiceResult {
  audio: string;
  durationSec: number;
  /** One `[start, end]` window per beat, contiguous and covering the track. */
  beats: [number, number][];
  captions: Caption[];
}

export const narrationText = (beats: { narration: string }[]) =>
  beats.map((b) => b.narration.trim()).join(SEP);

/** Char offsets of each beat inside `narrationText`. */
export function charSpans(beats: { narration: string }[]): [number, number][] {
  let cursor = 0;
  return beats.map((beat) => {
    const from = cursor;
    cursor += beat.narration.trim().length;
    const span: [number, number] = [from, cursor];
    cursor += SEP.length;
    return span;
  });
}

/** Snap raw windows so they are contiguous, monotonic and end on the track. */
export function contiguous(spans: [number, number][], total: number): [number, number][] {
  let prev = 0;
  return spans.map(([, end], i) => {
    const start = i === 0 ? 0 : prev;
    const last = i === spans.length - 1;
    const next = last ? total : clamp(end, start + 0.5, total);
    prev = next;
    return [start, Math.max(next, start + 0.5)] as [number, number];
  });
}

/** Whatever alignment the provider returned, as char times for the clean text. */
function charTimes(speech: Speech, text: string, total: number) {
  if (speech.charTimes?.starts.length === text.length) return speech.charTimes;
  if (speech.charTimes) log('voice: alignment out of step with the text, timing another way');
  if (speech.words?.length) return charTimesFromWords(text, speech.words, total);
  return linearCharTimes(text.length, total);
}

export async function voiceFor(
  dir: string,
  script: ClipScript,
  resolved: Resolved,
): Promise<VoiceResult> {
  const audio = path.join(dir, 'narration.mp3');
  const metaFile = path.join(dir, 'voice.json');
  const hit = await readJson<VoiceResult>(metaFile);
  if (hit && (await Bun.file(audio).exists())) return hit;

  const clean = script.beats.map((beat) => ({ narration: stripTags(beat.narration) }));
  const text = narrationText(clean);
  const speech = await resolved.voice.synthesize({
    text: narrationText(script.beats),
    lang: cfg.lang,
    persona: resolved.persona,
  });
  await writeAtomic(audio, speech.audio);

  const durationSec = await duration(audio);
  const { starts, ends } = charTimes(speech, text, durationSec);
  const words = wordsFromCharTimes(tokenize(text), starts, ends, durationSec);

  const result: VoiceResult = {
    audio,
    durationSec,
    beats: contiguous(
      charSpans(clean).map(([from, to]) => spanTime(from, to, starts, ends, durationSec)),
      durationSec,
    ),
    captions: groupCaptions(words),
  };

  await writeJson(metaFile, result);
  return result;
}
