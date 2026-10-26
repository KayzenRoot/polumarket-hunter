export interface FetchResponse {
  readonly ok: boolean;
  readonly status: number;
  text(): Promise<string>;
  json(): Promise<unknown>;
  headers?: { get(name: string): string | null };
}

export interface FetchInit {
  readonly method?: string;
  readonly headers?: Readonly<Record<string, string>>;
  readonly body?: string;
  readonly signal?: AbortSignal;
}

export type FetchLike = (url: string, init?: FetchInit) => Promise<FetchResponse>;

export function defaultFetch(): FetchLike {
  return (url, init) => (globalThis.fetch as unknown as FetchLike)(url, init);
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}
