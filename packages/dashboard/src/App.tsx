import type { ApiAggregateRow } from '@harmo/api-client';
import { useMemo, useState } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';
import { client, SUBJECT_ID } from './client';
import { CalendarHeatmap } from './components/CalendarHeatmap';
import { DateRangeBar } from './components/DateRangeBar';
import { MetricExplorer } from './components/MetricExplorer';
import { StatCard } from './components/StatCard';
import { useAsync } from './hooks';
import { daysBetween, fmtDate, fmtDuration, fmtNumber, rangeFromPreset } from './util';

const PIE_COLORS = ['#7aa6ff', '#a78bfa', '#4ade80', '#fbbf24', '#f87171', '#22d3ee', '#fb7185', '#facc15'];

export function App() {
  const initial = rangeFromPreset('30d');
  const [from, setFrom] = useState<Date>(initial.from);
  const [to, setTo] = useState<Date>(initial.to);
  const [timezone, setTimezone] = useState('Europe/Lisbon');
  const days = daysBetween(from, to);

  const health = useAsync(() => client.health(), []);
  const metricsRes = useAsync(() => client.metrics(), []);
  const summary = useAsync(
    () => client.summary({ subjectId: SUBJECT_ID, from, to, timezone }),
    [from.getTime(), to.getTime(), timezone]
  );
  const steps = useAsync(
    () => client.aggregate({ subjectId: SUBJECT_ID, metric: 'step_count', bucket: 'day', from, to, timezone }),
    [from.getTime(), to.getTime(), timezone]
  );
  const energy = useAsync(
    () =>
      client.aggregate({ subjectId: SUBJECT_ID, metric: 'active_energy_burned', bucket: 'day', from, to, timezone }),
    [from.getTime(), to.getTime(), timezone]
  );
  const exercise = useAsync(
    () => client.aggregate({ subjectId: SUBJECT_ID, metric: 'apple_exercise_time', bucket: 'day', from, to, timezone }),
    [from.getTime(), to.getTime(), timezone]
  );
  const standTime = useAsync(
    () => client.aggregate({ subjectId: SUBJECT_ID, metric: 'apple_stand_time', bucket: 'day', from, to, timezone }),
    [from.getTime(), to.getTime(), timezone]
  );
  const restingHr = useAsync(
    () =>
      client.aggregate({
        subjectId: SUBJECT_ID,
        metric: 'resting_heart_rate',
        bucket: 'day',
        from,
        to,
        timezone,
        agg: 'avg'
      }),
    [from.getTime(), to.getTime(), timezone]
  );
  const heartRate = useAsync(() => {
    const hrBucket: 'hour' | 'day' | 'week' = days > 365 ? 'week' : days > 60 ? 'day' : 'hour';

    return client.aggregate({
      subjectId: SUBJECT_ID,
      metric: 'heart_rate',
      bucket: hrBucket,
      from,
      to,
      timezone,
      agg: 'avg'
    });
  }, [from.getTime(), to.getTime(), timezone, days]);
  const bodyMass = useAsync(
    () =>
      client.aggregate({
        subjectId: SUBJECT_ID,
        metric: 'body_mass',
        bucket: 'day',
        from,
        to,
        timezone,
        agg: 'latest'
      }),
    [from.getTime(), to.getTime(), timezone]
  );
  const vo2 = useAsync(
    () =>
      client.aggregate({ subjectId: SUBJECT_ID, metric: 'vo2_max', bucket: 'day', from, to, timezone, agg: 'latest' }),
    [from.getTime(), to.getTime(), timezone]
  );
  const distance = useAsync(
    () =>
      client.aggregate({
        subjectId: SUBJECT_ID,
        metric: 'distance_walking_running',
        bucket: 'day',
        from,
        to,
        timezone
      }),
    [from.getTime(), to.getTime(), timezone]
  );
  const workouts = useAsync(
    () => client.workouts({ subjectId: SUBJECT_ID, from, to, limit: 20 }),
    [from.getTime(), to.getTime()]
  );
  const sources = useAsync(() => client.sources({ subjectId: SUBJECT_ID, includeSampleCount: true }), []);

  const stepsTotal = useMemo(() => (steps.data?.data ?? []).reduce((s, r) => s + r.value, 0), [steps.data]);
  const stepsAvg = stepsTotal > 0 && days > 0 ? stepsTotal / days : 0;
  const energyTotal = useMemo(() => (energy.data?.data ?? []).reduce((s, r) => s + r.value, 0), [energy.data]);
  const distanceTotal = useMemo(() => (distance.data?.data ?? []).reduce((s, r) => s + r.value, 0), [distance.data]);
  const exerciseTotal = useMemo(() => (exercise.data?.data ?? []).reduce((s, r) => s + r.value, 0), [exercise.data]);
  const restingHrLatest = useMemo(() => {
    const arr = restingHr.data?.data ?? [];

    return arr.length > 0 ? arr[arr.length - 1].value : null;
  }, [restingHr.data]);
  const hrAvgInRange = useMemo(() => {
    const arr = heartRate.data?.data ?? [];

    if (arr.length === 0) {
      return null;
    }

    const total = arr.reduce((s, r) => s + r.value * r.sample_count, 0);
    const count = arr.reduce((s, r) => s + r.sample_count, 0);

    return count > 0 ? total / count : null;
  }, [heartRate.data]);
  const bodyMassLatest = useMemo(() => {
    const arr = bodyMass.data?.data ?? [];

    return arr.length > 0 ? arr[arr.length - 1].value : null;
  }, [bodyMass.data]);

  const workoutPie = useMemo(() => {
    const byActivity = summary.data?.data.workouts_by_activity ?? [];

    return byActivity.slice(0, 8).map((w, i) => ({
      name: w.activity_type,
      value: w.count,
      color: PIE_COLORS[i % PIE_COLORS.length]
    }));
  }, [summary.data]);

  function aggregateRows(rows: ApiAggregateRow[]) {
    return rows.map(r => ({ ...r, label: fmtDate(r.bucket_start) }));
  }

  return (
    <div className="wrap">
      <header>
        <h1>Harmo dashboard</h1>
        <div className="subtitle">
          {health.data?.data.db.connected ? (
            <>
              <span style={{ color: 'var(--good)' }}>●</span> connected · registry v{health.data.data.registry_version}
            </>
          ) : health.error ? (
            <span style={{ color: 'var(--bad)' }}>● disconnected — is `npm run api` running?</span>
          ) : (
            <>loading…</>
          )}
          {summary.data?.data && (
            <>
              {' · '}
              {fmtNumber(summary.data.data.totals.samples, { maximumFractionDigits: 0 })} samples ·{' '}
              {summary.data.data.totals.workouts} workouts · {summary.data.data.totals.sources} sources
            </>
          )}
        </div>
      </header>

      <DateRangeBar
        from={from}
        to={to}
        onChange={(f, t) => {
          setFrom(f);
          setTo(t);
        }}
        timezone={timezone}
        onTimezoneChange={setTimezone}
      />

      <h2>Overview ({days} days)</h2>
      <div className="grid">
        <StatCard
          label="Total steps"
          value={fmtNumber(stepsTotal, { maximumFractionDigits: 0 })}
          sub={stepsAvg > 0 ? `avg ${fmtNumber(stepsAvg, { maximumFractionDigits: 0 })}/day` : undefined}
        />
        <StatCard label="Distance" value={fmtNumber(distanceTotal, { maximumFractionDigits: 1 })} unit="km" />
        <StatCard label="Active energy" value={fmtNumber(energyTotal, { maximumFractionDigits: 0 })} unit="kcal" />
        <StatCard label="Exercise minutes" value={fmtNumber(exerciseTotal, { maximumFractionDigits: 0 })} unit="min" />
        <StatCard
          label="Avg heart rate"
          value={hrAvgInRange !== null ? fmtNumber(hrAvgInRange, { maximumFractionDigits: 0 }) : '—'}
          unit={hrAvgInRange !== null ? 'bpm' : undefined}
        />
        <StatCard
          label="Latest resting HR"
          value={restingHrLatest !== null ? fmtNumber(restingHrLatest, { maximumFractionDigits: 0 }) : '—'}
          unit={restingHrLatest !== null ? 'bpm' : undefined}
        />
        <StatCard
          label="Latest body mass"
          value={bodyMassLatest !== null ? fmtNumber(bodyMassLatest, { maximumFractionDigits: 1 }) : '—'}
          unit={bodyMassLatest !== null ? 'kg' : undefined}
        />
        <StatCard
          label="Workouts"
          value={summary.data ? String(summary.data.data.totals.workouts) : '—'}
          sub={
            summary.data
              ? fmtDuration(summary.data.data.workouts_by_activity.reduce((s, w) => s + w.total_duration_seconds, 0)) +
                ' total'
              : undefined
          }
        />
      </div>

      <h2>Steps — last 365 days</h2>
      <div className="panel">
        <CalendarHeatmap
          data={(steps.data?.data ?? []).map(r => ({ date: new Date(r.bucket_start), value: r.value }))}
          rangeDays={365}
          hue={215}
          label="steps"
        />
      </div>

      <div className="row-2">
        <div>
          <h2>Steps per day</h2>
          <div className="panel">
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={aggregateRows(steps.data?.data ?? [])}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="label" interval="preserveStartEnd" minTickGap={32} />
                <YAxis tickFormatter={v => fmtNumber(Number(v), { maximumFractionDigits: 0 })} />
                <Tooltip
                  contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8 }}
                  formatter={(v: unknown) => [fmtNumber(Number(v), { maximumFractionDigits: 0 }), 'steps']}
                />
                <Bar dataKey="value" fill="var(--accent)" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div>
          <h2>Active energy / day</h2>
          <div className="panel">
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={aggregateRows(energy.data?.data ?? [])}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="label" interval="preserveStartEnd" minTickGap={32} />
                <YAxis tickFormatter={v => fmtNumber(Number(v), { maximumFractionDigits: 0 })} />
                <Tooltip
                  contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8 }}
                  formatter={(v: unknown) => [fmtNumber(Number(v), { maximumFractionDigits: 0 }), 'kcal']}
                />
                <Bar dataKey="value" fill="var(--warn)" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="row-2">
        <div>
          <h2>Apple Stand time</h2>
          <div className="panel">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={aggregateRows(standTime.data?.data ?? [])}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="label" interval="preserveStartEnd" minTickGap={32} />
                <YAxis />
                <Tooltip
                  contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8 }}
                />
                <Bar dataKey="value" fill="var(--good)" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div>
          <h2>Apple Exercise time</h2>
          <div className="panel">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={aggregateRows(exercise.data?.data ?? [])}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="label" interval="preserveStartEnd" minTickGap={32} />
                <YAxis />
                <Tooltip
                  contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8 }}
                />
                <Bar dataKey="value" fill="var(--accent-2)" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <h2>Heart rate (avg)</h2>
      <div className="panel">
        <ResponsiveContainer width="100%" height={260}>
          <AreaChart data={aggregateRows(heartRate.data?.data ?? [])}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="label" interval="preserveStartEnd" minTickGap={32} />
            <YAxis tickFormatter={v => fmtNumber(Number(v), { maximumFractionDigits: 0 })} />
            <Tooltip
              contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8 }}
              formatter={(v: unknown) => [fmtNumber(Number(v), { maximumFractionDigits: 1 }), 'bpm']}
            />
            <Area
              type="monotone"
              dataKey="value"
              stroke="var(--bad)"
              fill="var(--bad)"
              fillOpacity={0.12}
              strokeWidth={2}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="row-3">
        <div>
          <h2>Resting HR</h2>
          <div className="panel">
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={aggregateRows(restingHr.data?.data ?? [])}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="label" interval="preserveStartEnd" minTickGap={32} />
                <YAxis />
                <Tooltip
                  contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8 }}
                />
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke="var(--bad)"
                  fill="var(--bad)"
                  fillOpacity={0.1}
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div>
          <h2>Body mass</h2>
          <div className="panel">
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={aggregateRows(bodyMass.data?.data ?? [])}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="label" interval="preserveStartEnd" minTickGap={32} />
                <YAxis domain={['auto', 'auto']} />
                <Tooltip
                  contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8 }}
                />
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke="var(--accent-2)"
                  fill="var(--accent-2)"
                  fillOpacity={0.1}
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div>
          <h2>VO₂ max</h2>
          <div className="panel">
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={aggregateRows(vo2.data?.data ?? [])}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="label" interval="preserveStartEnd" minTickGap={32} />
                <YAxis />
                <Tooltip
                  contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8 }}
                />
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke="var(--good)"
                  fill="var(--good)"
                  fillOpacity={0.1}
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="row-2">
        <div>
          <h2>Workouts by activity (all-time)</h2>
          <div className="panel">
            {workoutPie.length === 0 ? (
              <div className="empty">no workouts</div>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie
                    data={workoutPie}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={90}
                    innerRadius={50}
                    paddingAngle={2}
                  >
                    {workoutPie.map(entry => (
                      <Cell key={entry.name} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8 }}
                  />
                </PieChart>
              </ResponsiveContainer>
            )}
            <table style={{ marginTop: 8 }}>
              <thead>
                <tr>
                  <th>Activity</th>
                  <th className="num">Count</th>
                  <th className="num">Total</th>
                </tr>
              </thead>
              <tbody>
                {(summary.data?.data.workouts_by_activity ?? []).map(w => (
                  <tr key={w.activity_type}>
                    <td>{w.activity_type}</td>
                    <td className="num">{w.count}</td>
                    <td className="num">{fmtDuration(w.total_duration_seconds)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div>
          <h2>Recent workouts (in range)</h2>
          <div className="panel">
            {workouts.loading && <div className="loading">loading…</div>}
            {workouts.error && <div className="error">{workouts.error}</div>}
            {!workouts.loading && (workouts.data?.data ?? []).length === 0 && (
              <div className="empty">no workouts in range</div>
            )}
            {(workouts.data?.data ?? []).length > 0 && (
              <table>
                <thead>
                  <tr>
                    <th>When</th>
                    <th>Activity</th>
                    <th>Duration</th>
                    <th>Source</th>
                  </tr>
                </thead>
                <tbody>
                  {(workouts.data?.data ?? []).map(w => (
                    <tr key={w.id}>
                      <td>{new Date(w.start_time).toISOString().replace('T', ' ').slice(0, 16)}Z</td>
                      <td>{w.activity_type}</td>
                      <td>{fmtDuration(w.duration_s)}</td>
                      <td>{w.source_name}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      <h2>Metric explorer</h2>
      <div className="panel">
        {metricsRes.data ? (
          <MetricExplorer metrics={metricsRes.data.data} from={from} to={to} timezone={timezone} />
        ) : (
          <div className="loading">loading metrics…</div>
        )}
      </div>

      <h2>Sources</h2>
      <div className="panel">
        {sources.loading && <div className="loading">loading…</div>}
        {(sources.data?.data ?? []).length > 0 && (
          <table>
            <thead>
              <tr>
                <th>Source</th>
                <th>Vendor</th>
                <th>Hardware</th>
                <th className="num">Samples</th>
              </tr>
            </thead>
            <tbody>
              {(sources.data?.data ?? []).slice(0, 30).map(s => (
                <tr key={s.id}>
                  <td>{s.source_name}</td>
                  <td>
                    <span className="pill">{s.vendor}</span>
                  </td>
                  <td>{s.hardware_version ?? '—'}</td>
                  <td className="num">
                    {s.sample_count !== undefined ? fmtNumber(s.sample_count, { maximumFractionDigits: 0 }) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <footer>harmo dashboard · React + Vite · powered by @harmo/api-client</footer>
    </div>
  );
}
