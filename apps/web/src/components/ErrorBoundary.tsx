import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertIcon, RefreshIcon } from './Icons.js';

interface ErrorBoundaryState {
  readonly error: Error | null;
}

export class ErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  public override state: ErrorBoundaryState = { error: null };

  public static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  public override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[polyhunter] render error', error, info.componentStack);
  }

  public override render(): ReactNode {
    if (this.state.error === null) {
      return this.props.children;
    }
    return (
      <div className="loading-screen" role="alert">
        <span className="brand-mark is-danger">
          <AlertIcon width={30} height={30} />
        </span>
        <strong>Dashboard crashed</strong>
        <p>{this.state.error.message}</p>
        <div className="operator-controls">
          <button
            type="button"
            className="button button-primary"
            onClick={() => window.location.reload()}
          >
            <RefreshIcon width={14} height={14} />
            Reload dashboard
          </button>
          <button
            type="button"
            className="button button-ghost"
            onClick={() => this.setState({ error: null })}
          >
            Try again
          </button>
        </div>
        <code>npm run doctor</code>
        <span className="muted">
          The paper ledger and session data are safe; this screen only replaces the failed render.
        </span>
      </div>
    );
  }
}
