import { describe, expect, test } from 'bun:test';
import { planChunks } from '../src/pipeline/presenter';

const windows: [number, number][] = [
  [0, 8],
  [8, 14],
  [14, 21],
  [21, 30],
];

describe('presenter chunking', () => {
  test('keeps the whole track in one chunk when it fits', () => {
    expect(planChunks(windows, 60)).toEqual([[0, 30]]);
  });

  test('groups greedily on beat boundaries without exceeding the limit', () => {
    expect(planChunks(windows, 15)).toEqual([
      [0, 14],
      [14, 21],
      [21, 30],
    ]);
  });

  test('stays contiguous and covers the track', () => {
    for (const max of [5, 9, 15, 60]) {
      const chunks = planChunks(windows, max);
      expect(chunks[0]?.[0]).toBe(0);
      expect(chunks[chunks.length - 1]?.[1]).toBe(30);
      chunks.forEach((chunk, i) => {
        if (i) expect(chunk[0]).toBe(chunks[i - 1]?.[1] as number);
        expect(chunk[1]).toBeGreaterThan(chunk[0]);
      });
    }
  });

  test('gives an over-long beat its own chunk', () => {
    expect(planChunks([[0, 20], [20, 24]], 15)).toEqual([
      [0, 20],
      [20, 24],
    ]);
  });
});
