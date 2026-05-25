export function fmtNumber(n: number, opts: Intl.NumberFormatOptions = {}): string {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 2, ...opts }).format(n);
}

export function fmtDate(d: Date | string | null | undefined): string {
  if (!d) {
    return '—';
  }
  const date = typeof d === 'string' ? new Date(d) : d;

  return date.toISOString().slice(0, 10);
}

export function fmtDuration(seconds: number): string {
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

export function daysBetween(from: Date, to: Date): number {
  return Math.max(1, Math.round((to.getTime() - from.getTime()) / 86_400_000));
}

export function toISO(d: Date): string {
  return d.toISOString();
}

export function rangeFromPreset(preset: 'today' | '7d' | '30d' | '90d' | '365d' | 'all'): { from: Date; to: Date } {
  const to = new Date();

  to.setUTCHours(0, 0, 0, 0);
  to.setUTCDate(to.getUTCDate() + 1); // include today

  const from = new Date(to);

  switch (preset) {
    case 'today':
      from.setUTCDate(from.getUTCDate() - 1);
      break;
    case '7d':
      from.setUTCDate(from.getUTCDate() - 7);
      break;
    case '30d':
      from.setUTCDate(from.getUTCDate() - 30);
      break;
    case '90d':
      from.setUTCDate(from.getUTCDate() - 90);
      break;
    case '365d':
      from.setUTCDate(from.getUTCDate() - 365);
      break;
    case 'all':
      from.setUTCFullYear(2018, 0, 1);
      break;
  }

  return { from, to };
}
