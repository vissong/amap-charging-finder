import { describe, expect, it, vi } from "vitest";

import { createRequestRateLimiter } from "../../server/request-rate-limiter";

describe("request rate limiter", () => {
  it("spaces concurrent request starts so a rolling second never exceeds QPS", async () => {
    let now = 0;
    const waits: number[] = [];
    const starts: number[] = [];
    const limiter = createRequestRateLimiter({
      maxQps: 3,
      now: () => now,
      wait: async (milliseconds) => {
        waits.push(milliseconds);
        now += milliseconds;
      },
    });

    await Promise.all(
      Array.from({ length: 5 }, () =>
        limiter.schedule(async () => {
          starts.push(now);
        }),
      ),
    );

    expect(starts).toEqual([0, 334, 668, 1_002, 1_336]);
    expect(waits).toEqual([334, 334, 334, 334]);
  });

  it("does not wait for a slow upstream response before starting the next request", async () => {
    let now = 0;
    let finishFirst!: () => void;
    const limiter = createRequestRateLimiter({
      maxQps: 3,
      now: () => now,
      wait: async (milliseconds) => {
        now += milliseconds;
      },
    });

    const first = limiter.schedule(
      () =>
        new Promise<void>((resolve) => {
          finishFirst = resolve;
        }),
    );
    const second = limiter.schedule(async () => now);

    await expect(second).resolves.toBe(334);
    finishFirst();
    await first;
  });

  it("keeps the queue moving after an upstream request rejects", async () => {
    let now = 0;
    const limiter = createRequestRateLimiter({
      maxQps: 3,
      now: () => now,
      wait: async (milliseconds) => {
        now += milliseconds;
      },
    });

    const failed = limiter.schedule(async () => {
      throw new Error("upstream failed");
    });
    const recovered = limiter.schedule(async () => now);

    await expect(failed).rejects.toThrow("upstream failed");
    await expect(recovered).resolves.toBe(334);
  });

  it("rechecks the clock when a timer wakes up early", async () => {
    let now = 0;
    let wakeEarly = true;
    const waits: number[] = [];
    const starts: number[] = [];
    const limiter = createRequestRateLimiter({
      maxQps: 3,
      now: () => now,
      wait: async (milliseconds) => {
        waits.push(milliseconds);
        now += wakeEarly ? milliseconds - 1 : milliseconds;
        wakeEarly = false;
      },
    });

    await Promise.all([
      limiter.schedule(async () => starts.push(now)),
      limiter.schedule(async () => starts.push(now)),
    ]);

    expect(starts).toEqual([0, 334]);
    expect(waits).toEqual([334, 1]);
  });

  it("applies a shared cooldown to every queued request", async () => {
    let now = 0;
    const starts: number[] = [];
    const limiter = createRequestRateLimiter({
      maxQps: 3,
      now: () => now,
      wait: async (milliseconds) => {
        now += milliseconds;
      },
    });

    await limiter.schedule(async () => starts.push(now));
    limiter.coolDown(1_000);
    await Promise.all([
      limiter.schedule(async () => starts.push(now)),
      limiter.schedule(async () => starts.push(now)),
    ]);

    expect(starts).toEqual([0, 1_000, 1_334]);
  });

  it("rejects excess queued requests instead of growing without bound", async () => {
    let now = 0;
    const limiter = createRequestRateLimiter({
      maxQps: 3,
      maxQueueSize: 2,
      now: () => now,
      wait: async (milliseconds) => {
        now += milliseconds;
      },
    });

    const first = limiter.schedule(async () => undefined);
    const second = limiter.schedule(async () => undefined);

    await expect(
      limiter.schedule(async () => undefined),
    ).rejects.toMatchObject({ code: "QUEUE_FULL" });
    await Promise.all([first, second]);
  });

  it("expires a request that cannot start within the queue SLA", async () => {
    let now = 0;
    const limiter = createRequestRateLimiter({
      maxQps: 1,
      maxQueueWaitMilliseconds: 500,
      now: () => now,
      wait: async (milliseconds) => {
        now += milliseconds;
      },
    });

    const first = limiter.schedule(async () => undefined);
    const expired = limiter.schedule(async () => undefined);

    await first;
    await expect(expired).rejects.toMatchObject({ code: "QUEUE_TIMEOUT" });
  });

  it("removes an aborted request from the public queue immediately", async () => {
    let now = 0;
    const controller = new AbortController();
    const limiter = createRequestRateLimiter({
      maxQps: 1,
      now: () => now,
      wait: async (milliseconds) => {
        now += milliseconds;
      },
    });

    const first = limiter.schedule(async () => undefined);
    const aborted = limiter.schedule(async () => undefined, {
      signal: controller.signal,
    });
    controller.abort();

    await expect(aborted).rejects.toMatchObject({ code: "ABORTED" });
    await first;
  });

  it("releases the FIFO gate when the request currently waiting aborts", async () => {
    let now = 0;
    let notifyWaitStarted!: () => void;
    const waitStarted = new Promise<void>((resolve) => {
      notifyWaitStarted = resolve;
    });
    const controller = new AbortController();
    const limiter = createRequestRateLimiter({
      maxQps: 1,
      now: () => now,
      wait: async () => {
        notifyWaitStarted();
        await new Promise(() => {});
      },
    });

    await limiter.schedule(async () => undefined);
    const aborted = limiter.schedule(async () => undefined, {
      signal: controller.signal,
    });
    await waitStarted;
    const following = limiter.schedule(async () => now);
    now = 1_000;
    controller.abort();

    await expect(aborted).rejects.toMatchObject({ code: "ABORTED" });
    await expect(following).resolves.toBe(1_000);
  });

  it("keeps aborted tombstones within the bounded internal FIFO capacity", async () => {
    let now = 0;
    let notifyWaitStarted!: () => void;
    const waitStarted = new Promise<void>((resolve) => {
      notifyWaitStarted = resolve;
    });
    const headController = new AbortController();
    const limiter = createRequestRateLimiter({
      maxQps: 1,
      maxQueueSize: 3,
      now: () => now,
      wait: async () => {
        notifyWaitStarted();
        await new Promise(() => {});
      },
    });

    await limiter.schedule(async () => undefined);
    const head = limiter.schedule(async () => undefined, {
      signal: headController.signal,
    });
    await waitStarted;

    const firstController = new AbortController();
    const firstAborted = limiter.schedule(async () => undefined, {
      signal: firstController.signal,
    });
    firstController.abort();
    const secondController = new AbortController();
    const secondAborted = limiter.schedule(async () => undefined, {
      signal: secondController.signal,
    });
    secondController.abort();

    await Promise.all([
      expect(firstAborted).rejects.toMatchObject({ code: "ABORTED" }),
      expect(secondAborted).rejects.toMatchObject({ code: "ABORTED" }),
    ]);
    await expect(
      limiter.schedule(async () => undefined),
    ).rejects.toMatchObject({ code: "QUEUE_FULL" });

    now = 1_000;
    headController.abort();
    await expect(head).rejects.toMatchObject({ code: "ABORTED" });
  });

  it("counts the waiting FIFO head within the exact queue capacity", async () => {
    let now = 0;
    let notifyWaitStarted!: () => void;
    const waitStarted = new Promise<void>((resolve) => {
      notifyWaitStarted = resolve;
    });
    const headController = new AbortController();
    const queuedController = new AbortController();
    const limiter = createRequestRateLimiter({
      maxQps: 1,
      maxQueueSize: 2,
      now: () => now,
      wait: async () => {
        notifyWaitStarted();
        await new Promise(() => {});
      },
    });

    await limiter.schedule(async () => undefined);
    const head = limiter.schedule(async () => undefined, {
      signal: headController.signal,
    });
    await waitStarted;
    const queued = limiter.schedule(async () => undefined, {
      signal: queuedController.signal,
    });

    await expect(
      limiter.schedule(async () => undefined),
    ).rejects.toMatchObject({ code: "QUEUE_FULL" });

    now = 1_000;
    headController.abort();
    queuedController.abort();
    await Promise.all([
      expect(head).rejects.toMatchObject({ code: "ABORTED" }),
      expect(queued).rejects.toMatchObject({ code: "ABORTED" }),
    ]);
  });

  it("clears the default wait timer when the FIFO head aborts", async () => {
    vi.useFakeTimers();
    try {
      const controller = new AbortController();
      const limiter = createRequestRateLimiter({ maxQps: 1 });

      await limiter.schedule(async () => undefined);
      const waiting = limiter.schedule(async () => undefined, {
        signal: controller.signal,
      });
      for (let index = 0; index < 4; index += 1) {
        await Promise.resolve();
      }
      expect(vi.getTimerCount()).toBe(1);

      controller.abort();
      await expect(waiting).rejects.toMatchObject({ code: "ABORTED" });
      await Promise.resolve();

      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});
