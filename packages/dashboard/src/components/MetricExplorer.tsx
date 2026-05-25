import type { ApiAggregateRow, ApiBucket, ApiMetric } from '@harmo/api-client';
import { useMemo, useState } from 'react';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { client, SUBJECT_ID } from '../client';
import { useAsync } from '../hooks';
import { fmtDate, fmtNumber } from '../util';

type Props = { metrics: ApiMetric[]; from: Date; to: Date; timezone: string };

export function MetricExplorer({ metrics, from, to, timezone }: Props) {
  const numeric = useMemo(() => metrics.filter(m => m.value_kind === 'quantity'), [metrics]);
  const [metric, setMetric] = useState<string>(numeric[0]?.metric ?? 'heart_rate');
  const [bucket, setBucket] = useState<ApiBucket>('day');
  const selected = numeric.find(m => m.metric === metric);
  const agg = selected?.default_agg;
  const data = useAsync(
    () =>
      client.aggregate({
        subjectId: SUBJECT_ID,
        metric,
        bucket,
        from,
        to,
        timezone
      }),
    [metric, bucket, from.getTime(), to.getTime(), timezone]
  );

  const rows: ApiAggregateRow[] = data.data?.data ?? [];
  const isBar = agg === 'sum';

  return (
    <div>
      <div className="metric-explorer-controls">
        <span className="label">Metric</span>
        <select value={metric} onChange={e => setMetric(e.target.value)}>
          {numeric.map(m => (
            <option key={m.metric} value={m.metric}>
              {m.metric} ({m.canonical_unit ?? '—'})
            </option>
          ))}
        </select>
        <span className="label">Bucket</span>
        <select value={bucket} onChange={e => setBucket(e.target.value as ApiBucket)}>
          <option value="hour">hour</option>
          <option value="day">day</option>
          <option value="week">week</option>
          <option value="month">month</option>
        </select>
        <span className="pill">agg: {agg ?? '—'}</span>
        {selected?.resolve_overlap && <span className="pill">overlap resolved</span>}
      </div>
      {data.loading && <div className="loading">loading…</div>}
      {data.error && <div className="error">{data.error}</div>}
      {!data.loading && !data.error && rows.length === 0 && <div className="empty">no data in range</div>}
      {!data.loading && rows.length > 0 && (
        <ResponsiveContainer width="100%" height={300}>
          {isBar ? (
            <BarChart data={rows.map(r => ({ ...r, label: fmtDate(r.bucket_start) }))}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="label" interval="preserveStartEnd" minTickGap={32} />
              <YAxis tickFormatter={v => fmtNumber(Number(v), { maximumFractionDigits: 0 })} />
              <Tooltip
                contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8 }}
                formatter={(v: unknown) => [fmtNumber(Number(v), { maximumFractionDigits: 2 }), metric]}
              />
              <Bar dataKey="value" fill="var(--accent)" radius={[2, 2, 0, 0]} />
            </BarChart>
          ) : (
            <AreaChart data={rows.map(r => ({ ...r, label: fmtDate(r.bucket_start) }))}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="label" interval="preserveStartEnd" minTickGap={32} />
              <YAxis tickFormatter={v => fmtNumber(Number(v), { maximumFractionDigits: 1 })} />
              <Tooltip
                contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8 }}
                formatter={(v: unknown) => [fmtNumber(Number(v), { maximumFractionDigits: 2 }), metric]}
              />
              <Area
                type="monotone"
                dataKey="value"
                stroke="var(--accent-2)"
                fill="var(--accent-2)"
                fillOpacity={0.12}
                strokeWidth={2}
              />
            </AreaChart>
          )}
        </ResponsiveContainer>
      )}
    </div>
  );
}
