const DEFAULT_OUTBOUND_TIMEOUT_MS = 10_000;

/** Bound provider requests so API actions and worker leases cannot hang forever. */
export function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit = {},
  timeoutMs = DEFAULT_OUTBOUND_TIMEOUT_MS,
): Promise<Response> {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) {
    throw new RangeError('HTTP timeout must be a positive safe integer');
  }

  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  const requestSignal =
    init.signal ?? (input instanceof Request ? input.signal : null);
  const signal = requestSignal
    ? AbortSignal.any([requestSignal, timeoutSignal])
    : timeoutSignal;

  return fetch(input, { ...init, signal });
}
