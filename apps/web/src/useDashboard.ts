import type { ControlRequest, MarketDetail, StateResponse } from '@polyhunter/core';
import { useCallback, useEffect, useState } from 'react';
import { ApiError, api } from './api.js';

export type ConnectionState = 'connecting' | 'live' | 'offline';

export interface DashboardController {
  readonly state: StateResponse | null;
  readonly error: string | null;
  readonly connection: ConnectionState;
  readonly controlPending: boolean;
  readonly controlError: string | null;
  refresh: () => Promise<void>;
  control: (action: ControlRequest['action']) => Promise<void>;
  clearControlError: () => void;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function useDashboard(): DashboardController {
  const [state, setState] = useState<StateResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [connection, setConnection] = useState<ConnectionState>('connecting');
  const [controlPending, setControlPending] = useState(false);
  const [controlError, setControlError] = useState<string | null>(null);

  const applyState = useCallback((next: StateResponse) => {
    setState(next);
    setError(null);
  }, []);

  const refresh = useCallback(async () => {
    try {
      const next = await api.state();
      applyState(next);
      setConnection('live');
    } catch (refreshError) {
      setError(messageOf(refreshError));
      setConnection('offline');
    }
  }, [applyState]);

  useEffect(() => {
    let cancelled = false;
    void refresh();

    const source = new EventSource('/api/stream');
    source.addEventListener('open', () => {
      if (!cancelled) {
        setConnection('live');
      }
    });
    source.addEventListener('state', (event) => {
      if (cancelled) {
        return;
      }
      try {
        const next = JSON.parse((event as MessageEvent).data as string) as StateResponse;
        applyState(next);
        setConnection('live');
      } catch (parseError) {
        setError(messageOf(parseError));
      }
    });
    source.onerror = () => {
      if (!cancelled) {
        setConnection('offline');
      }
    };

    return () => {
      cancelled = true;
      source.close();
    };
  }, [applyState, refresh]);

  useEffect(() => {
    if (connection !== 'offline') {
      return;
    }
    const timer = window.setInterval(() => {
      void refresh();
    }, 10_000);
    return () => {
      window.clearInterval(timer);
    };
  }, [connection, refresh]);

  const control = useCallback(async (action: ControlRequest['action']) => {
    setControlPending(true);
    setControlError(null);
    try {
      const next = await api.control(action);
      setState(next);
    } catch (controlFailure) {
      const message =
        controlFailure instanceof ApiError ? controlFailure.message : messageOf(controlFailure);
      setControlError(message);
    } finally {
      setControlPending(false);
    }
  }, []);

  const clearControlError = useCallback(() => {
    setControlError(null);
  }, []);

  return {
    state,
    error,
    connection,
    controlPending,
    controlError,
    refresh,
    control,
    clearControlError,
  };
}

export function useMarketDetail(tokenId: string | null): {
  detail: MarketDetail | null;
  loading: boolean;
  error: string | null;
} {
  const [detail, setDetail] = useState<MarketDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (tokenId === null) {
      setDetail(null);
      setLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    const load = async (): Promise<void> => {
      try {
        const next = await api.marketDetail(tokenId);
        if (!cancelled) {
          setDetail(next);
          setError(null);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(messageOf(loadError));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void load();
    const timer = window.setInterval(() => {
      void load();
    }, 1500);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [tokenId]);

  return { detail, loading, error };
}
