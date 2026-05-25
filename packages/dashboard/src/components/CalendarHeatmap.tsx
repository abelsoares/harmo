type DailyPoint = { date: Date; value: number };

type Props = {
  data: DailyPoint[];
  rangeDays?: number;
  hue?: number;
  label?: string;
};

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

export function CalendarHeatmap({ data, rangeDays = 365, hue = 215, label = '' }: Props) {
  const cellSize = 11;
  const cellGap = 3;
  const padding = { top: 20, right: 16, bottom: 28, left: 32 };

  const today = new Date();
  const end = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  const start = new Date(end.getTime() - (rangeDays - 1) * 86_400_000);

  const valueByDay = new Map<string, number>();

  for (const d of data) {
    const key = d.date.toISOString().slice(0, 10);

    valueByDay.set(key, (valueByDay.get(key) ?? 0) + d.value);
  }

  type Cell = { date: Date; value: number; col: number; row: number };
  const cells: Cell[] = [];
  const startDow = (start.getUTCDay() + 6) % 7;
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
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const monthLabels: Array<{ x: number; m: string }> = [];
  let lastMonth = -1;

  for (const c of cells) {
    if (c.row === 0) {
      const m = c.date.getUTCMonth();

      if (m !== lastMonth) {
        monthLabels.push({ x: padding.left + c.col * (cellSize + cellGap), m: monthNames[m] });
        lastMonth = m;
      }
    }
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width={W}
        height={H}
        style={{ maxWidth: '100%' }}
        role="img"
        aria-label={`Calendar heatmap of ${label || 'activity'} over the last ${rangeDays} days`}
      >
        <title>{`Calendar heatmap of ${label || 'activity'} over the last ${rangeDays} days`}</title>
        {monthLabels.map(l => (
          <text key={`${l.x}-${l.m}`} x={l.x} y={padding.top - 6} fontSize={10} fill="var(--muted)">
            {l.m}
          </text>
        ))}
        {['Mon', '', 'Wed', '', 'Fri', '', ''].map((dow, i) =>
          dow ? (
            <text
              key={dow}
              x={padding.left - 4}
              y={padding.top + i * (cellSize + cellGap) + cellSize - 1}
              textAnchor="end"
              fontSize={10}
              fill="var(--muted)"
            >
              {dow}
            </text>
          ) : null
        )}
        {cells.map(c => {
          const x = padding.left + c.col * (cellSize + cellGap);
          const y = padding.top + c.row * (cellSize + cellGap);
          const intensity = c.value === 0 ? 0 : Math.min(1, c.value / upper);
          const fill = intensity === 0 ? 'var(--surface-2)' : `hsl(${hue}, 80%, ${70 - intensity * 40}%)`;

          return (
            <rect key={c.date.toISOString()} x={x} y={y} width={cellSize} height={cellSize} rx={2} fill={fill}>
              <title>{`${c.date.toISOString().slice(0, 10)}: ${Math.round(c.value)}`}</title>
            </rect>
          );
        })}
      </svg>
      <div style={{ marginTop: 8, color: 'var(--muted)', fontSize: 12 }}>
        {activeDays} active days · total {Math.round(total).toLocaleString()} {label}
      </div>
    </div>
  );
}
