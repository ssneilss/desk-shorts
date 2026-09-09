import { describe, expect, test } from 'bun:test';
import { type ChartScene, chartScene, chartSvg } from '../src/plugins/scenes/chart';

const bar: ChartScene = {
  kind: 'chart',
  type: 'bar',
  title: 'Q2 revenue by desk',
  unit: 'USD bn',
  series: [
    { label: 'Equities', value: 158.2 },
    { label: 'Credit', value: 121 },
    { label: 'Macro', value: 96.4 },
  ],
};

const zh: ChartScene = {
  kind: 'chart',
  type: 'line',
  title: '三家券商二季度营收',
  unit: '亿元',
  series: [
    { label: '中信', value: 158.2 },
    { label: '华泰', value: 121 },
  ],
};

describe('chartSvg', () => {
  test('draws the title, every label, the unit and the values', () => {
    const svg = chartSvg(bar, 'en');
    expect(svg).toContain(bar.title);
    for (const point of bar.series) expect(svg).toContain(point.label);
    expect(svg).toContain('USD bn');
    expect(svg).toContain('158.2');
  });

  test('renders both a bar and a line variant at still size', () => {
    for (const scene of [bar, { ...bar, type: 'line' as const }]) {
      const svg = chartSvg(scene, 'en');
      expect(svg).toStartWith('<svg width="1620" height="2880"');
      expect(svg).toContain('#0b1a33');
    }
  });

  test('keeps Chinese labels and drops the axis name when there is no unit', () => {
    expect(chartSvg(zh, 'zh')).toContain('中信');
    expect(chartSvg({ ...bar, unit: null }, 'en')).not.toContain('USD bn');
  });
});

describe('chart schema', () => {
  const parse = (scene: unknown) => chartScene.schema.safeParse(scene).success;

  test('accepts a well-formed scene', () => {
    expect(parse(bar)).toBe(true);
    expect(parse({ ...bar, unit: null })).toBe(true);
  });

  test('rejects a single-point series', () => {
    expect(parse({ ...bar, series: bar.series.slice(0, 1) })).toBe(false);
  });

  test('rejects a non-numeric value', () => {
    expect(parse({ ...bar, series: [{ label: 'a', value: '12' }, { label: 'b', value: 3 }] })).toBe(false);
  });
});
