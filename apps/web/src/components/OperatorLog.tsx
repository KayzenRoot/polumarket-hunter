import type { EngineEvent } from '@polyhunter/core';
import { formatDateTime } from '@polyhunter/core';
import { StatusPill } from './StatusPill.js';

const VISIBLE_KINDS = new Set([
  'operator_action',
  'auto_kill',
  'kill_switch',
  'kill_switch_reset',
  'engine_paused',
  'engine_resumed',
  'orders_cancelled',
  'flattened',
]);

export function OperatorLog({ events }: { readonly events: readonly EngineEvent[] }) {
  const visible = events.filter((event) => VISIBLE_KINDS.has(event.kind)).slice(0, 8);
  return (
    <section className="card operator-log" aria-label="Operator log">
      <div className="card-head">
        <div>
          <span className="eyebrow">Audit</span>
          <h3>Operator log</h3>
        </div>
        <span className="muted">newest first</span>
      </div>
      {visible.length === 0 ? (
        <p className="muted">No operator or kill events in this session.</p>
      ) : (
        <ul className="rejection-list">
          {visible.map((event) => (
            <li key={`${event.at}-${event.kind}-${event.message}`}>
              <span>{formatDateTime(event.at)}</span>
              <StatusPill
                tone={
                  event.severity === 'error'
                    ? 'negative'
                    : event.severity === 'warn'
                      ? 'warning'
                      : 'neutral'
                }
                dot={false}
              >
                {event.kind}
              </StatusPill>
              <strong>{event.message}</strong>
              {event.details !== null ? <small>{event.details}</small> : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
