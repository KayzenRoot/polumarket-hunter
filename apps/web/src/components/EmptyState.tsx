import type { ReactNode } from 'react';

export function EmptyState({
  title,
  message,
  action,
}: {
  title: string;
  message: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <div className="empty-orbit" aria-hidden="true">
        <span />
      </div>
      <strong>{title}</strong>
      <p>{message}</p>
      {action}
    </div>
  );
}
