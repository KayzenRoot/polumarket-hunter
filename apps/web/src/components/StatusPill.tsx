import type { ReactNode } from 'react';

export type PillTone = 'positive' | 'negative' | 'warning' | 'neutral' | 'info';

export function StatusPill({
  tone,
  children,
  dot = true,
}: {
  tone: PillTone;
  children: ReactNode;
  dot?: boolean;
}) {
  return (
    <span className={`pill pill-${tone}`}>
      {dot ? <span className="pill-dot" aria-hidden="true" /> : null}
      {children}
    </span>
  );
}
