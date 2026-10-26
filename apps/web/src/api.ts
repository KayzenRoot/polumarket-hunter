import type { ApiResponse, ControlRequest, MarketDetail, StateResponse } from '@polyhunter/core';

const TOKEN_KEY = 'polyhunter.apiToken';

export class ApiError extends Error {
  public readonly code: string;

  public constructor(code: string, message: string) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
  }
}

export function getApiToken(): string | null {
  try {
    return window.localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setApiToken(token: string | null): void {
  try {
    if (token === null || token.trim().length === 0) {
      window.localStorage.removeItem(TOKEN_KEY);
      return;
    }
    window.localStorage.setItem(TOKEN_KEY, token.trim());
  } catch {
    // Storage can be unavailable in private browsing; the API still works locally.
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  headers.set('accept', 'application/json');
  if (init?.body !== undefined) {
    headers.set('content-type', 'application/json');
  }
  const token = getApiToken();
  if (token !== null) {
    headers.set('x-api-token', token);
  }

  const response = await fetch(path, { ...init, headers });
  let payload: ApiResponse<T>;
  try {
    payload = (await response.json()) as ApiResponse<T>;
  } catch {
    throw new ApiError('invalid_response', `server returned HTTP ${response.status}`);
  }
  if (!response.ok || !payload.ok) {
    throw new ApiError(
      payload.ok ? 'request_failed' : payload.error.code,
      payload.ok ? `server returned HTTP ${response.status}` : payload.error.message,
    );
  }
  return payload.data;
}

export const api = {
  state: (): Promise<StateResponse> => request<StateResponse>('/api/state'),
  marketDetail: (tokenId: string): Promise<MarketDetail> =>
    request<MarketDetail>(`/api/markets/${encodeURIComponent(tokenId)}`),
  control: (action: ControlRequest['action']): Promise<StateResponse> =>
    request<StateResponse>('/api/control', {
      method: 'POST',
      body: JSON.stringify({ action }),
    }),
};
