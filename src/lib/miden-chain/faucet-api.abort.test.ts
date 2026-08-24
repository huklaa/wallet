import { faucetFetch } from './faucet-api';

type MockResponse = Pick<Response, 'ok' | 'status' | 'json' | 'text' | 'headers'>;

const fetchMock = jest.fn();
Object.defineProperty(globalThis, 'fetch', {
  value: fetchMock,
  writable: true,
  configurable: true
});

function errorResponse(status: number, headers: Record<string, string> = {}): MockResponse {
  return {
    ok: false,
    status,
    headers: new Headers(headers),
    json: () => Promise.reject(new Error('not json')),
    text: () => Promise.resolve('error')
  };
}

describe('faucetFetch caller cancellation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('forwards a caller abort to an in-flight fetch', async () => {
    const caller = new AbortController();
    fetchMock.mockImplementation(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
        })
    );

    const pending = faucetFetch('https://faucet-api.example/pow', { signal: caller.signal }, 10_000);
    caller.abort();

    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('aborts during Retry-After without sending the retry request', async () => {
    jest.useFakeTimers();
    try {
      const caller = new AbortController();
      fetchMock.mockResolvedValueOnce(errorResponse(429, { 'retry-after': '30' }));

      const pending = faucetFetch('https://faucet-api.example/pow', { signal: caller.signal });
      await Promise.resolve();
      caller.abort();
      await jest.runAllTimersAsync();

      await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
      expect(fetchMock).toHaveBeenCalledTimes(1);
    } finally {
      jest.useRealTimers();
    }
  });
});
