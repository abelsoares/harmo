type Props = {
  label: string;
  value: string;
  unit?: string;
  sub?: string;
};

export function StatCard({ label, value, unit, sub }: Props) {
  return (
    <div className="card">
      <div className="label">{label}</div>
      <div className="value">
        {value}
        {unit && <span className="unit">{unit}</span>}
      </div>
      {sub && <div className="sub">{sub}</div>}
    </div>
  );
}
