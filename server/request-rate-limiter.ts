import { performance } from "node:perf_hooks";

export type RequestRateLimitErrorCode =
  | "QUEUE_FULL"
  | "QUEUE_TIMEOUT"
  | "ABORTED";

export class RequestRateLimitError extends Error {
  readonly code: RequestRateLimitErrorCode;

  constructor(code: RequestRateLimitErrorCode, message: string) {
    super(message);
    this.name = "RequestRateLimitError";
    this.code = code;
  }
}

interface ScheduleOptions {
  signal?: AbortSignal;
}

export interface RequestRateLimiter {
  schedule<T>(
    request: () => Promise<T>,
    options?: ScheduleOptions,
  ): Promise<T>;
  coolDown(milliseconds: number): void;
}

interface CreateRequestRateLimiterOptions {
  maxQps: number;
  maxQueueSize?: number;
  maxQueueWaitMilliseconds?: number;
  now?: () => number;
  wait?: (milliseconds: number, signal?: AbortSignal) => Promise<void>;
}

function wait(
  milliseconds: number,
  signal?: AbortSignal,
): Promise<void> {
  if (signal?.aborted) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(finish, milliseconds);
    function finish() {
      clearTimeout(timer);
      signal?.removeEventListener("abort", finish);
      resolve();
    }
    signal?.addEventListener("abort", finish, { once: true });
    if (signal?.aborted) finish();
  });
}

function abortedError(): RequestRateLimitError {
  return new RequestRateLimitError(
    "ABORTED",
    "Request was aborted while waiting for the AMap rate limiter",
  );
}

export function createRequestRateLimiter({
  maxQps,
  maxQueueSize = 30,
  maxQueueWaitMilliseconds = 10_000,
  now = () => performance.now(),
  wait: waitImpl = wait,
}: CreateRequestRateLimiterOptions): RequestRateLimiter {
  if (!Number.isInteger(maxQps) || maxQps < 1) {
    throw new Error("maxQps must be a positive integer");
  }
  if (!Number.isInteger(maxQueueSize) || maxQueueSize < 1) {
    throw new Error("maxQueueSize must be a positive integer");
  }
  if (
    !Number.isFinite(maxQueueWaitMilliseconds) ||
    maxQueueWaitMilliseconds <= 0
  ) {
    throw new Error("maxQueueWaitMilliseconds must be positive");
  }

  const minimumIntervalMilliseconds = Math.ceil(1_000 / maxQps);
  let nextStartAt = 0;
  let pendingGateNodes = 0;
  let startGate: Promise<void> = Promise.resolve();

  return {
    schedule<T>(
      request: () => Promise<T>,
      { signal }: ScheduleOptions = {},
    ): Promise<T> {
      if (signal?.aborted) return Promise.reject(abortedError());
      if (pendingGateNodes >= maxQueueSize) {
        return Promise.reject(
          new RequestRateLimitError(
            "QUEUE_FULL",
            "AMap request queue is full",
          ),
        );
      }

      pendingGateNodes += 1;
      const queuedAt = now();
      let resolveResult!: (value: T | PromiseLike<T>) => void;
      let rejectResult!: (reason?: unknown) => void;
      const result = new Promise<T>((resolve, reject) => {
        resolveResult = resolve;
        rejectResult = reject;
      });
      let settled = false;
      let gateNodePending = true;
      let abortListener: (() => void) | undefined;
      let wakeGate: (() => void) | undefined;
      const gateAbort = signal
        ? new Promise<void>((resolve) => {
            wakeGate = resolve;
          })
        : undefined;
      const removeAbortListener = () => {
        if (abortListener) {
          signal?.removeEventListener("abort", abortListener);
        }
      };
      const releaseGateNode = () => {
        if (gateNodePending) {
          gateNodePending = false;
          pendingGateNodes -= 1;
        }
      };
      const rejectOnce = (error: unknown) => {
        if (settled) return;
        settled = true;
        removeAbortListener();
        rejectResult(error);
      };
      const startRequest = () => {
        if (settled) return;
        let upstreamRequest: Promise<T>;
        try {
          upstreamRequest = request();
        } catch (error) {
          rejectOnce(error);
          return;
        }
        settled = true;
        removeAbortListener();
        resolveResult(upstreamRequest);
      };

      if (signal) {
        abortListener = () => {
          wakeGate?.();
          rejectOnce(abortedError());
        };
        signal.addEventListener("abort", abortListener, { once: true });
        if (signal.aborted) abortListener();
      }

      const gateRun = startGate.then(async () => {
        try {
          while (true) {
            if (signal?.aborted) throw abortedError();

            const currentTime = now();
            const queueAge = currentTime - queuedAt;
            const remainingQueueTime = maxQueueWaitMilliseconds - queueAge;
            if (remainingQueueTime <= 0) {
              throw new RequestRateLimitError(
                "QUEUE_TIMEOUT",
                "AMap request waited too long in the rate-limit queue",
              );
            }

            const delay = nextStartAt - currentTime;
            if (delay <= 0) break;
            const timer = waitImpl(
              Math.ceil(Math.min(delay, remainingQueueTime)),
              signal,
            );
            await (gateAbort ? Promise.race([timer, gateAbort]) : timer);
          }

          const startedAt = now();
          nextStartAt =
            Math.max(nextStartAt, startedAt) + minimumIntervalMilliseconds;
          releaseGateNode();
          startRequest();
        } catch (error) {
          releaseGateNode();
          rejectOnce(error);
        }
      });

      startGate = gateRun.then(
        () => undefined,
        () => undefined,
      );
      return result;
    },

    coolDown(milliseconds: number): void {
      if (!Number.isFinite(milliseconds) || milliseconds <= 0) return;
      nextStartAt = Math.max(nextStartAt, now() + Math.ceil(milliseconds));
    },
  };
}
