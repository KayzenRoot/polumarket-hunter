import type { ReactNode } from 'react';

export type KpiTone = 'neutral' | 'positive' | 'negative' | 'warning';

interface KpiCardProps {
  readonly label: string;
  readonly value: string;
  readonly sub?: string;
  readonly tone?: KpiTone;
  readonly accent?: ReactNode;
}

export function KpiCard({ label, value, sub, tone = 'neutral', accent }: KpiCardProps) {
  return (
    <article className={`kpi-card kpi-${tone}`}>
      <div className="kpi-head">
        <span className="kpi-label">{label}</span>
        {accent}
      </div>
      <strong className="kpi-value">{value}</strong>
      {sub !== undefined ? <span className="kpi-sub">{sub}</span> : null}
    </article>
  );
}
