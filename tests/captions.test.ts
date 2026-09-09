import { describe, expect, test } from 'bun:test';
import {
  assEscape,
  assTime,
  buildAss,
  charTimesFromWords,
  groupCaptions,
  joinWords,
  linearCharTimes,
  stripTags,
  tokenize,
  wordsFromCharTimes,
  type Word,
} from '../src/pipeline/captions';
import { charSpans, contiguous, narrationText } from '../src/pipeline/voice';

const words = (texts: string[], step = 0.4): Word[] =>
  texts.map((text, i) => ({ text, start: i * step, end: i * step + step * 0.9 }));

describe('caption grouping', () => {
  test('caps groups at maxWords and keeps every word', () => {
    const captions = groupCaptions(words(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']), {
      maxGap: 10,
      maxChars: 999,
    });
    expect(captions.map((c) => c.text)).toEqual(['a b c d e', 'f g h']);
    expect(captions[0]?.start).toBe(0);
    expect(captions[1]?.end).toBeCloseTo(3.16, 5);
  });

  test('breaks on sentence punctuation once past minWords', () => {
    const captions = groupCaptions(words(['one', 'two', 'three.', 'four', 'five']), { maxGap: 10 });
    expect(captions.map((c) => c.text)).toEqual(['one two three.', 'four five']);
  });

  test('breaks on a long silent gap', () => {
    const spoken: Word[] = [
      { text: 'margins', start: 0, end: 0.4 },
      { text: 'held', start: 0.4, end: 0.8 },
      { text: 'up', start: 0.8, end: 1.2 },
      { text: 'then', start: 3, end: 3.4 },
    ];
    expect(groupCaptions(spoken).map((c) => c.text)).toEqual(['margins held up', 'then']);
  });

  test('never emits an empty or backwards caption', () => {
    for (const caption of groupCaptions(words(['a', 'b', 'c', 'd']))) {
      expect(caption.text.length).toBeGreaterThan(0);
      expect(caption.end).toBeGreaterThan(caption.start);
    }
  });
});

describe('tokenizing', () => {
  test('keeps char offsets for latin words', () => {
    expect(tokenize('PDD beat by 4%')).toEqual([
      { text: 'PDD', from: 0, to: 3 },
      { text: 'beat', from: 4, to: 8 },
      { text: 'by', from: 9, to: 11 },
      { text: '4%', from: 12, to: 14 },
    ]);
  });

  test('splits CJK per glyph and joins it without spaces', () => {
    const tokens = tokenize('毛利率回升');
    expect(tokens).toHaveLength(5);
    expect(joinWords(tokens)).toBe('毛利率回升');
    expect(joinWords([{ text: 'PDD' }, { text: 'beat' }])).toBe('PDD beat');
  });

  test('maps char times onto words', () => {
    const text = 'aa bb cc';
    const { starts, ends } = linearCharTimes(text.length, 8);
    const mapped = wordsFromCharTimes(tokenize(text), starts, ends, 8);
    expect(mapped[0]?.start).toBeCloseTo(0, 5);
    expect(mapped[2]?.end).toBeCloseTo(8, 5);
  });
});

describe('delivery tags', () => {
  test('are stripped from the narration used for captions', () => {
    expect(stripTags('[excited] PDD beat by 4%')).toBe('PDD beat by 4%');
    expect(stripTags('毛利率[serious]回升')).toBe('毛利率 回升');
    expect(stripTags('up 4% [see note]')).toBe('up 4% [see note]');
  });
});

describe('char times from words', () => {
  test('lands each word on its own chars', () => {
    const text = 'PDD beat guidance';
    const { starts, ends } = charTimesFromWords(
      text,
      [
        { text: 'PDD', start: 0, end: 1 },
        { text: 'beat', start: 1, end: 2 },
        { text: 'guidance', start: 2, end: 3 },
      ],
      3,
    );
    expect(starts).toHaveLength(text.length);
    expect(starts[0]).toBeCloseTo(0, 5);
    expect(starts[text.indexOf('beat')]).toBeCloseTo(1, 5);
    expect(starts[text.indexOf('guidance')]).toBeCloseTo(2, 5);
    expect(ends[text.length - 1]).toBeCloseTo(3, 5);
  });

  test('interpolates tokens the provider skipped', () => {
    const text = 'a b c d';
    const { starts } = charTimesFromWords(
      text,
      [
        { text: 'a', start: 0, end: 1 },
        { text: 'd', start: 3, end: 4 },
      ],
      4,
    );
    expect(starts[text.indexOf('b')]).toBeCloseTo(1, 5);
    expect(starts[text.indexOf('c')]).toBeCloseTo(2, 5);
    expect(starts[text.indexOf('d')]).toBeCloseTo(3, 5);
  });

  test('spreads a multi-glyph CJK word over its glyphs', () => {
    const text = '毛利率回升';
    const { starts, ends } = charTimesFromWords(
      text,
      [
        { text: '毛利率', start: 0, end: 3 },
        { text: '回升', start: 3, end: 5 },
      ],
      5,
    );
    expect(starts[0]).toBeCloseTo(0, 5);
    expect(starts[3]).toBeCloseTo(3, 5);
    expect(ends[4]).toBeCloseTo(5, 5);
  });

  test('ignores punctuation when matching', () => {
    const text = 'Margins held, then fell.';
    const { starts } = charTimesFromWords(
      text,
      [
        { text: 'Margins', start: 0, end: 1 },
        { text: 'held', start: 1, end: 2 },
        { text: 'then', start: 2, end: 3 },
        { text: 'fell', start: 3, end: 4 },
      ],
      4,
    );
    expect(starts[text.indexOf('then')]).toBeCloseTo(2, 5);
  });

  test('interpolates digits the transcriber spelled out', () => {
    const text = '营收391亿';
    const { starts, ends } = charTimesFromWords(
      text,
      [
        { text: '营收', start: 0, end: 1 },
        { text: '三百九十一', start: 1, end: 3 },
        { text: '亿', start: 3, end: 4 },
      ],
      4,
    );
    expect(starts[2]).toBeCloseTo(1, 5);
    expect(ends[4]).toBeCloseTo(3, 5);
    expect(starts[5]).toBeCloseTo(3, 5);
  });
});

describe('ass output', () => {
  test.each([
    [0, '0:00:00.00'],
    [1.5, '0:00:01.50'],
    [61.505, '0:01:01.51'],
    [3661.234, '1:01:01.23'],
    [-5, '0:00:00.00'],
  ])('formats %p as %p', (seconds, expected) => {
    expect(assTime(seconds)).toBe(expected);
  });

  test('escapes braces and newlines', () => {
    expect(assEscape('a {b}\nc')).toBe('a b\\Nc');
  });

  test('emits titles before captions with the right styles', () => {
    const ass = buildAss(
      [{ start: 0, end: 1, text: 'hello' }],
      [{ start: 0, end: 2, text: 'HOOK' }],
    );
    expect(ass).toContain('PlayResX: 1080');
    expect(ass).toContain('Dialogue: 0,0:00:00.00,0:00:02.00,Title,,0,0,0,,HOOK');
    expect(ass).toContain('Dialogue: 0,0:00:00.00,0:00:01.00,Caption,,0,0,0,,hello');
    expect(ass.indexOf('Title,')).toBeLessThan(ass.indexOf('Caption,,'));
  });
});

describe('beat windows', () => {
  const beats = [{ narration: 'One two.' }, { narration: 'Three four.' }];

  test('char spans line up with the joined narration', () => {
    const text = narrationText(beats);
    const [first, second] = charSpans(beats);
    expect(text.slice(first?.[0], first?.[1])).toBe('One two.');
    expect(text.slice(second?.[0], second?.[1])).toBe('Three four.');
  });

  test('windows are contiguous and cover the track', () => {
    const windows = contiguous(
      [
        [0, 4],
        [4.2, 9],
      ],
      10,
    );
    expect(windows[0]?.[0]).toBe(0);
    expect(windows[1]?.[0]).toBe(windows[0]?.[1]);
    expect(windows[1]?.[1]).toBe(10);
  });
});
