'use client';

import {
  CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';

/** Fixed hue order — a series keeps its color when other series are toggled off. */
const SERIES_COLORS = ['var(--s1)', 'var(--s2)', 'var(--s3)', 'var(--s4)'];

export type Series = { key: string; label: string };

export function TrendChart({
  data, series, xKey = 'label', height = 260, title, unit = '',
}: {
  data: Record<string, any>[];
  series: Series[];
  xKey?: string;
  height?: number;
  title?: string;
  unit?: string;
}) {
  return (
    <figure className="panel m-0 p-3">
      {title && <figcaption className="mb-2 text-sm font-semibold">{title}</figcaption>}
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -18 }}>
          <CartesianGrid strokeDasharray="2 4" vertical={false} />
          <XAxis dataKey={xKey} tickLine={false} axisLine={false} />
          <YAxis tickLine={false} axisLine={false} width={48} unit={unit} />
          <Tooltip
            contentStyle={{
              background: 'var(--panel)',
              border: '1px solid var(--line)',
              borderRadius: 6,
              fontSize: 12,
              color: 'var(--ink)',
            }}
            labelStyle={{ color: 'var(--ink-2)', fontWeight: 600 }}
          />
          {series.length > 1 && <Legend iconType="plainline" wrapperStyle={{ fontSize: 11 }} />}
          {series.map((s, i) => (
            <Line
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.label}
              stroke={SERIES_COLORS[i % SERIES_COLORS.length]}
              strokeWidth={2}
              dot={{ r: 3, strokeWidth: 0 }}
              activeDot={{ r: 5 }}
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </figure>
  );
}
