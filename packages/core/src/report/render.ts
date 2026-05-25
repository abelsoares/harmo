import type { AggregateRow } from '@src/aggregate';
import type { ReportData } from './queries';

const STYLES = `
  :root {
    color-scheme: light dark;
    --bg: #0e1014;
    --surface: #161a22;
    --surface-2: #1d222d;
    --border: #262c3a;
    --text: #e6e9ef;
    --muted: #8a93a6;
    --accent: #7aa6ff;
    --accent-2: #a78bfa;
    --good: #4ade80;
    --warn: #fbbf24;
    --bad: #f87171;
  }
  @media (prefers-color-scheme: light) {
    :root {
      --bg: #fafbfc;
      --surface: #ffffff;
      --surface-2: #f4f5f8;
      --border: #e2e6ee;
      --text: #15171c;
      --muted: #6b7280;
    }
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    background: var(--bg);
    color: var(--text);
    font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, sans-serif;
    font-size: 14px;
    line-height: 1.5;
    padding: 32px 24px;
  }
  .wrap { max-width: 1100px; margin: 0 auto; }
  header { margin-bottom: 32px; }
  h1 { font-size: 28px; margin: 0 0 4px; font-weight: 700; letter-spacing: -0.01em; }
  h2 { font-size: 18px; margin: 32px 0 12px; font-weight: 600; }
  h3 { font-size: 14px; margin: 0 0 12px; font-weight: 600; color: var(--muted); text-transform: uppercase; letter-spacing: 0.04em; }
  .subtitle { color: var(--muted); font-size: 14px; }
  .grid { display: grid; gap: 14px; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); }
  .card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 16px 18px;
  }
  .card .label { color: var(--muted); font-size: 12px; font-weight: 500; text-transform: uppercase; letter-spacing: 0.04em; }
  .card .value { font-size: 26px; font-weight: 700; margin-top: 6px; letter-spacing: -0.01em; }
  .card .unit { color: var(--muted); font-size: 14px; font-weight: 500; margin-left: 4px; }
  .card .sub { color: var(--muted); font-size: 12px; margin-top: 6px; }
  .chart-card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 20px 22px;
    margin-bottom: 16px;
  }
  .chart-card svg { width: 100%; height: auto; display: block; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  table th, table td { padding: 8px 12px; text-align: left; border-bottom: 1px solid var(--border); }
  table th { font-weight: 600; color: var(--muted); text-transform: uppercase; font-size: 11px; letter-spacing: 0.04em; }
  table tr:last-child td { border-bottom: none; }
  table td.num { text-align: right; font-variant-numeric: tabular-nums; }
  footer { margin-top: 48px; color: var(--muted); font-size: 12px; text-align: center; }
  .pill { display: inline-block; padding: 2px 8px; border-radius: 999px; background: var(--surface-2); font-size: 11px; color: var(--muted); }
  .row-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
  @media (max-width: 720px) { .row-2 { grid-template-columns: 1fr; } }
`;

function escapeHtml(input: string): string {
  return input.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function fmtNumber(n: number, options: Intl.NumberFormatOptions = {}): string {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 2, ...options }).format(n);
}

function fmtDate(d: Date | null | undefined): string {
  if (!d) {
    return '—';
  }

  return d.toISOString().slice(0, 10);
}

function fmtDateTime(d: Date | null | undefined): string {
  if (!d) {
    return '—';
  }

  return `${d.toISOString().replace('T', ' ').slice(0, 16)}Z`;
}

function fmtDuration(seconds: number): string {
  if (seconds < 60) {
    return `${seconds}s`;
  }

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }

  return `${minutes}m`;
}

function lineChart(rows: AggregateRow[], options: { width?: number; height?: number; color?: string } = {}): string {
  const W = options.width ?? 1000;
  const H = options.height ?? 200;
  const padding = { top: 12, right: 12, bottom: 24, left: 44 };
  const color = options.color ?? 'var(--accent)';

  if (rows.length === 0) {
    return `<svg viewBox="0 0 ${W} ${H}"><text x="${W / 2}" y="${H / 2}" text-anchor="middle" fill="var(--muted)" font-size="13">no data in range</text></svg>`;
  }

  const xs = rows.map(r => r.bucketStart.getTime());
  const ys = rows.map(r => r.value);
  const xMin = Math.min(...xs);
  const xMax = Math.max(...xs);
  const yMin = Math.min(0, ...ys);
  const yMax = Math.max(...ys);
  const yPad = (yMax - yMin) * 0.08 || 1;
  const yLo = yMin;
  const yHi = yMax + yPad;

  const innerW = W - padding.left - padding.right;
  const innerH = H - padding.top - padding.bottom;

  const xScale = (x: number) =>
    xMax === xMin ? padding.left + innerW / 2 : padding.left + ((x - xMin) / (xMax - xMin)) * innerW;
  const yScale = (y: number) => padding.top + innerH - ((y - yLo) / (yHi - yLo)) * innerH;

  const path = rows
    .map((r, i) => `${i === 0 ? 'M' : 'L'} ${xScale(r.bucketStart.getTime()).toFixed(1)} ${yScale(r.value).toFixed(1)}`)
    .join(' ');

  const fillPath = `${path} L ${xScale(xMax).toFixed(1)} ${padding.top + innerH} L ${xScale(xMin).toFixed(1)} ${padding.top + innerH} Z`;

  const yTicks = 4;
  const yAxis: string[] = [];

  for (let i = 0; i <= yTicks; i++) {
    const v = yLo + (yHi - yLo) * (i / yTicks);
    const y = yScale(v);

    yAxis.push(
      `<line x1="${padding.left}" y1="${y.toFixed(1)}" x2="${W - padding.right}" y2="${y.toFixed(1)}" stroke="var(--border)" stroke-dasharray="2,3" />`
    );
    yAxis.push(
      `<text x="${padding.left - 6}" y="${(y + 3).toFixed(1)}" text-anchor="end" font-size="10" fill="var(--muted)">${fmtNumber(v, { maximumFractionDigits: 1 })}</text>`
    );
  }

  const xTicks = Math.min(6, rows.length);
  const xAxis: string[] = [];

  for (let i = 0; i < xTicks; i++) {
    const idx = Math.round((i / (xTicks - 1 || 1)) * (rows.length - 1));
    const row = rows[idx];
    const x = xScale(row.bucketStart.getTime());

    xAxis.push(
      `<text x="${x.toFixed(1)}" y="${(H - 8).toFixed(1)}" text-anchor="middle" font-size="10" fill="var(--muted)">${fmtDate(row.bucketStart)}</text>`
    );
  }

  return `
    <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
      <defs>
        <linearGradient id="g-line-${Math.random().toString(36).slice(2, 8)}" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="${color}" stop-opacity="0.35"/>
          <stop offset="100%" stop-color="${color}" stop-opacity="0"/>
        </linearGradient>
      </defs>
      ${yAxis.join('\n')}
      <path d="${fillPath}" fill="${color}" fill-opacity="0.12" />
      <path d="${path}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" />
      ${xAxis.join('\n')}
    </svg>
  `;
}

function barChart(rows: AggregateRow[], options: { width?: number; height?: number; color?: string } = {}): string {
  const W = options.width ?? 1000;
  const H = options.height ?? 200;
  const padding = { top: 12, right: 12, bottom: 24, left: 44 };
  const color = options.color ?? 'var(--accent)';

  if (rows.length === 0) {
    return `<svg viewBox="0 0 ${W} ${H}"><text x="${W / 2}" y="${H / 2}" text-anchor="middle" fill="var(--muted)" font-size="13">no data in range</text></svg>`;
  }

  const ys = rows.map(r => r.value);
  const yMax = Math.max(...ys, 0);
  const yPad = yMax * 0.08 || 1;
  const yHi = yMax + yPad;
  const innerW = W - padding.left - padding.right;
  const innerH = H - padding.top - padding.bottom;
  const barW = Math.max(2, innerW / rows.length - 2);
  const xStep = innerW / rows.length;

  const bars = rows
    .map((r, i) => {
      const x = padding.left + i * xStep + (xStep - barW) / 2;
      const h = (r.value / yHi) * innerH;
      const y = padding.top + innerH - h;

      return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barW.toFixed(1)}" height="${h.toFixed(1)}" fill="${color}" rx="1" />`;
    })
    .join('');

  const yTicks = 4;
  const yAxis: string[] = [];

  for (let i = 0; i <= yTicks; i++) {
    const v = (yHi * i) / yTicks;
    const y = padding.top + innerH - (v / yHi) * innerH;

    yAxis.push(
      `<line x1="${padding.left}" y1="${y.toFixed(1)}" x2="${W - padding.right}" y2="${y.toFixed(1)}" stroke="var(--border)" stroke-dasharray="2,3" />`
    );
    yAxis.push(
      `<text x="${padding.left - 6}" y="${(y + 3).toFixed(1)}" text-anchor="end" font-size="10" fill="var(--muted)">${fmtNumber(v, { maximumFractionDigits: 0 })}</text>`
    );
  }

  const xTicks = Math.min(6, rows.length);
  const xAxis: string[] = [];

  for (let i = 0; i < xTicks; i++) {
    const idx = Math.round((i / (xTicks - 1 || 1)) * (rows.length - 1));
    const row = rows[idx];
    const x = padding.left + idx * xStep + xStep / 2;

    xAxis.push(
      `<text x="${x.toFixed(1)}" y="${(H - 8).toFixed(1)}" text-anchor="middle" font-size="10" fill="var(--muted)">${fmtDate(row.bucketStart)}</text>`
    );
  }

  return `
    <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
      ${yAxis.join('\n')}
      ${bars}
      ${xAxis.join('\n')}
    </svg>
  `;
}

function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) {
    return 0;
  }

  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);

  if (lo === hi) {
    return sorted[lo];
  }

  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

// GitHub-style calendar heatmap. Last 365 days, 53 columns × 7 rows.
// Each cell is one day; color intensity is the value relative to the dataset's 95th percentile
// (so a single huge outlier doesn't wash everything else out).
function calendarHeatmap(
  daily: Array<{ date: Date; value: number }>,
  options: { label: string; colorHue?: number; rangeDays?: number } = { label: '' }
): string {
  const rangeDays = options.rangeDays ?? 365;
  const colorHue = options.colorHue ?? 215; // blue-ish
  const cellSize = 11;
  const cellGap = 3;
  const padding = { top: 20, right: 16, bottom: 28, left: 32 };

  // Build last-N-days index keyed by UTC YYYY-MM-DD.
  const today = new Date();
  const end = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  const start = new Date(end.getTime() - (rangeDays - 1) * 86_400_000);

  const valueByDay = new Map<string, number>();

  for (const d of daily) {
    const key = d.date.toISOString().slice(0, 10);
    const prior = valueByDay.get(key) ?? 0;

    valueByDay.set(key, prior + d.value);
  }

  // Walk every day from start..end. Compute cells.
  type Cell = { date: Date; value: number; col: number; row: number };
  const cells: Cell[] = [];
  // Anchor week-0 to the Monday on/before `start`. JS getUTCDay: Sun=0 ... Sat=6 → Mon=1.
  const startDow = (start.getUTCDay() + 6) % 7; // 0 = Monday
  const anchorMs = start.getTime() - startDow * 86_400_000;

  for (let i = 0; i < rangeDays; i++) {
    const ms = start.getTime() + i * 86_400_000;
    const date = new Date(ms);
    const key = date.toISOString().slice(0, 10);
    const value = valueByDay.get(key) ?? 0;
    const offsetDays = Math.floor((ms - anchorMs) / 86_400_000);
    const col = Math.floor(offsetDays / 7);
    const row = offsetDays % 7;

    cells.push({ date, value, col, row });
  }

  const nonZero = cells
    .map(c => c.value)
    .filter(v => v > 0)
    .sort((a, b) => a - b);
  const upper = nonZero.length > 0 ? Math.max(1, quantile(nonZero, 0.95)) : 1;
  const total = cells.reduce((s, c) => s + c.value, 0);
  const activeDays = cells.filter(c => c.value > 0).length;
  const cols = Math.max(...cells.map(c => c.col)) + 1;
  const W = padding.left + padding.right + cols * (cellSize + cellGap);
  const H = padding.top + padding.bottom + 7 * (cellSize + cellGap);

  const cellSvg = cells
    .map(c => {
      const x = padding.left + c.col * (cellSize + cellGap);
      const y = padding.top + c.row * (cellSize + cellGap);

      if (c.value === 0) {
        return `<rect x="${x}" y="${y}" width="${cellSize}" height="${cellSize}" rx="2" fill="var(--surface-2)"/>`;
      }

      const intensity = Math.min(1, c.value / upper);
      const lightness = 70 - intensity * 40;
      const fill = `hsl(${colorHue}, 80%, ${lightness.toFixed(0)}%)`;
      const tooltip = `${c.date.toISOString().slice(0, 10)}: ${fmtNumber(c.value, { maximumFractionDigits: 0 })}`;

      return `<rect x="${x}" y="${y}" width="${cellSize}" height="${cellSize}" rx="2" fill="${fill}"><title>${escapeHtml(tooltip)}</title></rect>`;
    })
    .join('');

  // Month labels along the top.
  const monthLabels: string[] = [];
  let lastMonth = -1;

  for (const c of cells) {
    if (c.row === 0) {
      const m = c.date.getUTCMonth();

      if (m !== lastMonth) {
        const monthName = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][m];
        const x = padding.left + c.col * (cellSize + cellGap);

        monthLabels.push(
          `<text x="${x}" y="${padding.top - 6}" font-size="10" fill="var(--muted)">${monthName}</text>`
        );
        lastMonth = m;
      }
    }
  }

  // Day-of-week labels on the left.
  const dowLabels = ['Mon', '', 'Wed', '', 'Fri', '', ''];
  const dowSvg = dowLabels
    .map((label, i) => {
      if (!label) {
        return '';
      }
      const y = padding.top + i * (cellSize + cellGap) + cellSize - 1;

      return `<text x="${padding.left - 4}" y="${y}" text-anchor="end" font-size="10" fill="var(--muted)">${label}</text>`;
    })
    .join('');

  return `
    <div style="overflow-x:auto;">
      <svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" style="max-width:100%;">
        ${monthLabels.join('')}
        ${dowSvg}
        ${cellSvg}
      </svg>
      <div style="margin-top:8px; color:var(--muted); font-size:12px;">
        ${activeDays} active day${activeDays === 1 ? '' : 's'} · total ${fmtNumber(total, { maximumFractionDigits: 0 })} ${escapeHtml(options.label)}
      </div>
    </div>
  `;
}

function statCard(label: string, value: string, sub?: string, unit?: string): string {
  return `
    <div class="card">
      <div class="label">${escapeHtml(label)}</div>
      <div class="value">${escapeHtml(value)}${unit ? `<span class="unit">${escapeHtml(unit)}</span>` : ''}</div>
      ${sub ? `<div class="sub">${escapeHtml(sub)}</div>` : ''}
    </div>
  `;
}

function rowsSum(rows: AggregateRow[]): number {
  return rows.reduce((s, r) => s + r.value, 0);
}

function rowsAvg(rows: AggregateRow[]): number | null {
  if (rows.length === 0) {
    return null;
  }

  const total = rows.reduce((s, r) => s + r.value * r.sampleCount, 0);
  const count = rows.reduce((s, r) => s + r.sampleCount, 0);

  return count === 0 ? null : total / count;
}

export function renderReport(data: ReportData): string {
  const days = Math.max(1, Math.round((data.range.to.getTime() - data.range.from.getTime()) / 86_400_000));

  const totalSteps = rowsSum(data.dailySteps);
  const avgSteps = data.dailySteps.length ? totalSteps / data.dailySteps.length : 0;
  const totalActiveKcal = rowsSum(data.dailyActiveEnergy);
  const totalDistanceKm = rowsSum(data.dailyDistance);
  const avgHr = rowsAvg(data.heartRate.avg);
  const minHr = data.heartRate.min.length ? Math.min(...data.heartRate.min.map(r => r.value)) : null;
  const maxHr = data.heartRate.max.length ? Math.max(...data.heartRate.max.map(r => r.value)) : null;
  const latestBodyMass = data.bodyMass.length ? data.bodyMass[data.bodyMass.length - 1].value : null;

  const perMetricRows = data.perMetric
    .map(m => {
      const span =
        m.firstAt && m.lastAt ? Math.max(1, Math.round((m.lastAt.getTime() - m.firstAt.getTime()) / 86_400_000)) : 0;
      const rate = span > 0 ? m.sampleCount / span : 0;

      return `
      <tr>
        <td>${escapeHtml(m.metric)}</td>
        <td class="num">${fmtNumber(m.sampleCount, { maximumFractionDigits: 0 })}</td>
        <td>${fmtDate(m.firstAt)}</td>
        <td>${fmtDate(m.lastAt)}</td>
        <td class="num">${span > 0 ? `${span}d` : '—'}</td>
        <td class="num">${rate >= 1 ? fmtNumber(rate, { maximumFractionDigits: 1 }) : rate > 0 ? fmtNumber(rate, { maximumFractionDigits: 2 }) : '—'}</td>
      </tr>`;
    })
    .join('');

  const sourceRows = data.sources
    .map(
      s => `
      <tr>
        <td>${escapeHtml(s.name)} <span class="pill">${escapeHtml(s.vendor)}</span></td>
        <td class="num">${fmtNumber(s.sampleCount, { maximumFractionDigits: 0 })}</td>
      </tr>`
    )
    .join('');

  const workoutByActivityRows = data.workouts.byActivity
    .map(
      a => `
      <tr>
        <td>${escapeHtml(a.activityType)}</td>
        <td class="num">${a.count}</td>
        <td class="num">${fmtDuration(a.totalDurationSeconds)}</td>
      </tr>`
    )
    .join('');

  const recentWorkoutRows = data.workouts.recent
    .map(
      w => `
      <tr>
        <td>${fmtDateTime(w.startTime)}</td>
        <td>${escapeHtml(w.activityType)}</td>
        <td>${fmtDuration(w.durationSeconds)}</td>
        <td>${escapeHtml(w.sourceName)}</td>
      </tr>`
    )
    .join('');

  const sleepRows = data.sleepCategories
    .map(
      s => `
      <tr>
        <td>${escapeHtml(s.category)}</td>
        <td class="num">${fmtNumber(s.samples, { maximumFractionDigits: 0 })}</td>
      </tr>`
    )
    .join('');

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>harmo report — ${escapeHtml(data.subjectId)}</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>${STYLES}</style>
</head>
<body>
  <div class="wrap">
    <header>
      <h1>Harmo health report</h1>
      <div class="subtitle">
        subject <strong>${escapeHtml(data.subjectId)}</strong>
        · range ${fmtDate(data.range.from)} → ${fmtDate(data.range.to)} (${days} days)
        · timezone ${escapeHtml(data.timezone)}
      </div>
    </header>

    <h2>Overview</h2>
    <div class="grid">
      ${statCard('Total samples', fmtNumber(data.totals.samples, { maximumFractionDigits: 0 }), `across ${data.perMetric.length} metrics`)}
      ${statCard('Workouts', fmtNumber(data.workouts.count, { maximumFractionDigits: 0 }), data.workouts.totalDurationSeconds > 0 ? `${fmtDuration(data.workouts.totalDurationSeconds)} total` : undefined)}
      ${statCard('Sources', fmtNumber(data.totals.sources, { maximumFractionDigits: 0 }))}
      ${statCard('Quarantined', fmtNumber(data.totals.quarantine, { maximumFractionDigits: 0 }))}
      ${statCard('Total steps', fmtNumber(totalSteps, { maximumFractionDigits: 0 }), data.dailySteps.length ? `avg ${fmtNumber(avgSteps, { maximumFractionDigits: 0 })}/day` : undefined)}
      ${statCard('Avg heart rate', avgHr !== null ? fmtNumber(avgHr, { maximumFractionDigits: 1 }) : '—', minHr !== null && maxHr !== null ? `range ${fmtNumber(minHr)} – ${fmtNumber(maxHr)}` : undefined, avgHr !== null ? 'bpm' : undefined)}
      ${statCard('Active energy', fmtNumber(totalActiveKcal, { maximumFractionDigits: 0 }), undefined, 'kcal')}
      ${statCard('Distance', fmtNumber(totalDistanceKm, { maximumFractionDigits: 1 }), undefined, 'km')}
      ${latestBodyMass !== null ? statCard('Latest body mass', fmtNumber(latestBodyMass, { maximumFractionDigits: 1 }), undefined, 'kg') : ''}
    </div>

    <h2>Activity heatmap — steps</h2>
    <div class="chart-card">
      ${calendarHeatmap(
        data.dailySteps.map(r => ({ date: r.bucketStart, value: r.value })),
        { label: 'steps', colorHue: 215, rangeDays: 365 }
      )}
    </div>

    <h2>Activity heatmap — workouts</h2>
    <div class="chart-card">
      ${calendarHeatmap(
        data.dailyWorkouts.map(d => ({ date: d.date, value: d.count })),
        { label: 'workouts', colorHue: 130, rangeDays: 365 }
      )}
    </div>

    <h2>Steps per day</h2>
    <div class="chart-card">
      ${barChart(data.dailySteps, { color: 'var(--accent)' })}
    </div>

    <h2>Active energy per day</h2>
    <div class="chart-card">
      ${barChart(data.dailyActiveEnergy, { color: 'var(--warn)' })}
    </div>

    <div class="row-2">
      <div>
        <h2>Apple Stand time (min/day)</h2>
        <div class="chart-card">${barChart(data.dailyStandTime, { color: 'var(--accent)' })}</div>
      </div>
      <div>
        <h2>Apple Exercise time (min/day)</h2>
        <div class="chart-card">${barChart(data.dailyExerciseTime, { color: 'var(--good)' })}</div>
      </div>
    </div>

    <h2>Heart rate (${escapeHtml(data.hrBucket)}ly average)</h2>
    <div class="chart-card">
      ${lineChart(data.heartRate.avg, { color: 'var(--bad)' })}
    </div>

    <div class="row-2">
      <div>
        <h2>Resting heart rate (daily avg)</h2>
        <div class="chart-card">${lineChart(data.restingHr, { color: 'var(--bad)' })}</div>
      </div>
      <div>
        <h2>VO₂ max trend</h2>
        <div class="chart-card">${lineChart(data.vo2Max, { color: 'var(--accent-2)' })}</div>
      </div>
    </div>

    <h2>Body mass (latest per day)</h2>
    <div class="chart-card">
      ${lineChart(data.bodyMass, { color: 'var(--accent-2)' })}
    </div>

    <div class="row-2">
      <div>
        <h2>Workouts by activity</h2>
        <div class="chart-card">
          <table>
            <thead><tr><th>Activity</th><th class="num">Count</th><th class="num">Total</th></tr></thead>
            <tbody>${workoutByActivityRows || '<tr><td colspan="3" style="text-align:center;color:var(--muted)">no workouts</td></tr>'}</tbody>
          </table>
        </div>
      </div>
      <div>
        <h2>Sleep categories</h2>
        <div class="chart-card">
          <table>
            <thead><tr><th>Category</th><th class="num">Samples</th></tr></thead>
            <tbody>${sleepRows || '<tr><td colspan="2" style="text-align:center;color:var(--muted)">no sleep data</td></tr>'}</tbody>
          </table>
        </div>
      </div>
    </div>

    <h2>Recent workouts</h2>
    <div class="chart-card">
      <table>
        <thead><tr><th>Start</th><th>Activity</th><th>Duration</th><th>Source</th></tr></thead>
        <tbody>${recentWorkoutRows || '<tr><td colspan="4" style="text-align:center;color:var(--muted)">no workouts</td></tr>'}</tbody>
      </table>
    </div>

    <h2>Metrics breakdown</h2>
    <div class="chart-card">
      <table>
        <thead><tr><th>Metric</th><th class="num">Samples</th><th>First</th><th>Last</th><th class="num">Span</th><th class="num">Rate (/day)</th></tr></thead>
        <tbody>${perMetricRows || '<tr><td colspan="6" style="text-align:center;color:var(--muted)">no samples</td></tr>'}</tbody>
      </table>
    </div>

    <h2>Sources</h2>
    <div class="chart-card">
      <table>
        <thead><tr><th>Source</th><th class="num">Samples</th></tr></thead>
        <tbody>${sourceRows || '<tr><td colspan="2" style="text-align:center;color:var(--muted)">no sources</td></tr>'}</tbody>
      </table>
    </div>

    <footer>
      Generated ${new Date().toISOString()} · harmo v0
    </footer>
  </div>
</body>
</html>`;
}
