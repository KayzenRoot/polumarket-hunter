import type { FetchLike, FetchResponse } from '../src/index.js';

export function jsonResponse(payload: unknown, status = 200): FetchResponse {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
    text: async () => JSON.stringify(payload),
  };
}

export function textResponse(text: string, status = 200): FetchResponse {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => JSON.parse(text) as unknown,
    text: async () => text,
  };
}

export function sequenceFetch(
  responses: readonly FetchResponse[],
): FetchLike & { calls: string[] } {
  const calls: string[] = [];
  let index = 0;
  const fetchImpl = (async (url: string) => {
    calls.push(url);
    const response = responses[Math.min(index, responses.length - 1)];
    index += 1;
    if (response === undefined) {
      throw new Error('no response configured');
    }
    return response;
  }) as FetchLike & { calls: string[] };
  fetchImpl.calls = calls;
  return fetchImpl;
}

export function rejectingFetch(message = 'network down'): FetchLike {
  return async () => {
    throw new Error(message);
  };
}
