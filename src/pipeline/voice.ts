import path from 'node:path';
import { cfg } from '../config';
import { hasElevenLabs, ttsWithTimestamps } from '../providers/elevenlabs';
import { speech } from '../providers/openai';
import { clamp, duration, log, readJson, writeAtomic, writeJson } from '../util';
import {
  groupCaptions,
  linearCharTimes,
  spanTime,
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

export async function voiceFor(dir: string, script: ClipScript): Promise<VoiceResult> {
  const audio = path.join(dir, 'narration.mp3');
  const metaFile = path.join(dir, 'voice.json');
  const hit = await readJson<VoiceResult>(metaFile);
  if (hit && (await Bun.file(audio).exists())) return hit;

  const text = narrationText(script.beats);
  let starts: number[] | null = null;
  let ends: number[] | null = null;

  if (hasElevenLabs()) {
    const res = await ttsWithTimestamps(text, cfg.voiceId);
    await writeAtomic(audio, res.audio);
    if (res.alignment && res.alignment.characters.length === text.length) {
      starts = res.alignment.character_start_times_seconds;
      ends = res.alignment.character_end_times_seconds;
    } else {
      log('voice: alignment missing or out of step with the text, timing by char rate');
    }
  } else {
    log('voice: no ELEVENLABS_API_KEY, using OpenAI speech with derived timings');
    await writeAtomic(audio, await speech(text));
  }

  const durationSec = await duration(audio);
  const linear = linearCharTimes(text.length, durationSec);
  const charStart = starts ?? linear.starts;
  const charEnd = ends ?? linear.ends;

  const words = wordsFromCharTimes(tokenize(text), charStart, charEnd, durationSec);
  const result: VoiceResult = {
    audio,
    durationSec,
    beats: contiguous(
      charSpans(script.beats).map(([from, to]) =>
        spanTime(from, to, charStart, charEnd, durationSec),
      ),
      durationSec,
    ),
    captions: groupCaptions(words),
  };

  await writeJson(metaFile, result);
  return result;
}
