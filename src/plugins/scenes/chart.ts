import path from 'node:path';
import { Resvg } from '@resvg/resvg-js';
import * as echarts from 'echarts';
import { z } from 'zod';
import { cfg } from '../../config';
import { STILL, kenBurns } from '../../pipeline/segments';
import type { SceneRenderer } from '../../plugin';
import { writeAtomic } from '../../util';

/**
 * `unit` is nullable rather than optional: OpenAI structured outputs demand every
 * property in `required`, so an absent unit arrives as null.
 */
const schema = z.object({
  kind: z.literal('chart'),
  type: z.enum(['bar', 'line']),
  title: z.string(),
  unit: z.string().nullable(),
  series: z.array(z.object({ label: z.string(), value: z.number() })).min(2).max(8),
});

export type ChartScene = z.infer<typeof schema>;

const BG = '#0b1a33';
const INK = '#f5f1e6';
const ACCENT = '#e8b34a';
const MUTED = 'rgba(245, 241, 230, 0.18)';

const LABEL_MAX: Record<string, number> = { zh: 8, en: 12 };

const shorten = (label: string, max: number) => {
  const clean = label.replace(/\s+/g, ' ').trim();
  return clean.length <= max ? clean : `${clean.slice(0, max - 1)}…`;
};

const number = (value: number) =>
  Number.isInteger(value) ? String(value) : String(Number(value.toFixed(2)));

const valueLabel = {
  show: true,
  position: 'top' as const,
  color: INK,
  fontSize: 52,
  fontWeight: 600,
  distance: 18,
  formatter: (p: { value: number }) => number(p.value),
};

function option(scene: ChartScene, lang: string) {
  const max = LABEL_MAX[lang.slice(0, 2)] ?? LABEL_MAX.en;
  return {
    animation: false,
    backgroundColor: BG,
    title: {
      text: scene.title,
      left: 'center',
      top: '13%',
      textStyle: {
        color: INK,
        fontSize: 72,
        fontWeight: 600,
        lineHeight: 96,
        width: STILL.w - 220,
        overflow: 'break',
      },
    },
    grid: { left: 120, right: 120, top: '27%', height: '45%', containLabel: true },
    xAxis: {
      type: 'category',
      data: scene.series.map((point) => shorten(point.label, max as number)),
      axisLine: { lineStyle: { color: MUTED, width: 3 } },
      axisTick: { show: false },
      axisLabel: { color: INK, fontSize: 48, margin: 26, interval: 0 },
    },
    yAxis: {
      type: 'value',
      name: scene.unit ?? '',
      nameGap: 34,
      nameTextStyle: { color: INK, fontSize: 44, align: 'left' },
      axisLine: { show: false },
      axisLabel: { color: INK, fontSize: 44, margin: 22, formatter: number },
      splitLine: { lineStyle: { color: MUTED, width: 2 } },
    },
    series: [
      scene.type === 'bar'
        ? {
            type: 'bar',
            data: scene.series.map((point) => point.value),
            barMaxWidth: 190,
            itemStyle: { color: ACCENT, borderRadius: [10, 10, 0, 0] },
            label: valueLabel,
          }
        : {
            type: 'line',
            data: scene.series.map((point) => point.value),
            lineStyle: { color: ACCENT, width: 10 },
            itemStyle: { color: ACCENT },
            symbolSize: 26,
            label: valueLabel,
          },
    ],
  };
}

/** The chart as an SVG string at `STILL` size; no ffmpeg, no network. */
export function chartSvg(scene: ChartScene, lang: string = cfg.lang): string {
  const chart = echarts.init(null, null, {
    renderer: 'svg',
    ssr: true,
    width: STILL.w,
    height: STILL.h,
  });
  chart.setOption(option(scene, lang));
  const svg = chart.renderToSVGString();
  chart.dispose();
  return svg;
}

export const chartPng = (scene: ChartScene, lang: string = cfg.lang): Uint8Array =>
  new Resvg(chartSvg(scene, lang), {
    font: { loadSystemFonts: true, defaultFontFamily: 'Noto Sans CJK SC' },
    fitTo: { mode: 'width', value: STILL.w },
  })
    .render()
    .asPng();

export const chartScene: SceneRenderer<typeof schema> = {
  kind: 'chart',
  schema,
  hint: 'chart — a bar or line chart, rendered locally. Pick it only when the beat compares 2-8 numbers quoted verbatim from the source; never estimate or extrapolate. Fill type, a title in the script language, unit (null when the numbers are bare), and series labels that stay precise (营业利润率, not 利率) within 8 characters in Chinese or 12 in English.',
  async render(ctx, scene, index, out) {
    const still = path.join(ctx.dir, `chart-${index}.png`);
    if (!(await Bun.file(still).exists())) await writeAtomic(still, chartPng(scene));
    await kenBurns(still, ctx.window[1] - ctx.window[0], out);
  },
};
