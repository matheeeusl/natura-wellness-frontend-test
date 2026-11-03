export const REQUEST_TIMEOUT_MS = 15_000;

export class TimeoutError extends Error {
  constructor() {
    super("Request timed out");
    this.name = "TimeoutError";
  }
}

/** Stops waiting after the timeout. The request itself keeps running, so it can still land later. */
export function withTimeout<T>(request: Promise<T>, timeoutMs = REQUEST_TIMEOUT_MS): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new TimeoutError()), timeoutMs);
    request.then(resolve, reject).finally(() => clearTimeout(timer));
  });
}
