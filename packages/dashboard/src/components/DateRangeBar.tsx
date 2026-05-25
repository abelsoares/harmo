import { rangeFromPreset } from '../util';

type Preset = '7d' | '30d' | '90d' | '365d' | 'all';

type Props = {
  from: Date;
  to: Date;
  onChange: (from: Date, to: Date) => void;
  timezone: string;
  onTimezoneChange: (tz: string) => void;
};

const PRESETS: Array<{ id: Preset; label: string }> = [
  { id: '7d', label: '7d' },
  { id: '30d', label: '30d' },
  { id: '90d', label: '90d' },
  { id: '365d', label: '1y' },
  { id: 'all', label: 'All' }
];

function activePreset(from: Date, to: Date): Preset | null {
  for (const p of PRESETS) {
    const r = rangeFromPreset(p.id);

    if (
      Math.abs(r.from.getTime() - from.getTime()) < 86_400_000 &&
      Math.abs(r.to.getTime() - to.getTime()) < 86_400_000
    ) {
      return p.id;
    }
  }

  return null;
}

export function DateRangeBar({ from, to, onChange, timezone, onTimezoneChange }: Props) {
  const active = activePreset(from, to);

  return (
    <div className="toolbar">
      <span className="label">Range</span>
      <div className="group">
        {PRESETS.map(p => (
          <button
            key={p.id}
            type="button"
            className={`btn ${active === p.id ? 'active' : ''}`}
            onClick={() => {
              const r = rangeFromPreset(p.id);

              onChange(r.from, r.to);
            }}
          >
            {p.label}
          </button>
        ))}
      </div>
      <span className="label" style={{ marginLeft: 12 }}>
        From
      </span>
      <input
        type="date"
        value={from.toISOString().slice(0, 10)}
        onChange={e => {
          const newFrom = new Date(`${e.target.value}T00:00:00Z`);

          if (!Number.isNaN(newFrom.getTime())) {
            onChange(newFrom, to);
          }
        }}
      />
      <span className="label">To</span>
      <input
        type="date"
        value={to.toISOString().slice(0, 10)}
        onChange={e => {
          const newTo = new Date(`${e.target.value}T00:00:00Z`);

          if (!Number.isNaN(newTo.getTime())) {
            onChange(from, newTo);
          }
        }}
      />
      <div className="spacer" />
      <span className="label">Timezone</span>
      <select
        value={timezone}
        onChange={e => onTimezoneChange(e.target.value)}
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 8,
          color: 'var(--text)',
          padding: '7px 10px',
          fontSize: 13,
          fontFamily: 'inherit'
        }}
      >
        <option value="UTC">UTC</option>
        <option value="Europe/Lisbon">Europe/Lisbon</option>
        <option value="Europe/London">Europe/London</option>
        <option value="America/New_York">America/New_York</option>
        <option value="America/Los_Angeles">America/Los_Angeles</option>
      </select>
    </div>
  );
}
