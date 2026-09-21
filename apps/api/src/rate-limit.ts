import type { Context, MiddlewareHandler } from "hono";
export type RateLimitOptions = {
  limit?: number;
  windowMs?: number;
  maxClients?: number;
  globalLimit?: number;
  key?: (c: Context) => string;
  now?: () => number;
};
/** Per-process bounded fixed-window limiter. Never trust caller-supplied forwarding headers. */
export function rateLimit(options: RateLimitOptions = {}): MiddlewareHandler {
  const limit = options.limit ?? 120,
    windowMs = options.windowMs ?? 60000,
    maxClients = options.maxClients ?? 10000,
    globalLimit = options.globalLimit ?? 1200;
  for (const n of [limit, windowMs, maxClients, globalLimit])
    if (!Number.isSafeInteger(n) || n < 1)
      throw new Error("Invalid rate limit configuration");
  const clients = new Map<string, { count: number; reset: number }>();
  let sweep = 0,
    global = { count: 0, reset: 0 };
  return async (c, next) => {
    const now = (options.now ?? Date.now)();
    if (now >= sweep) {
      for (const [key, b] of clients) if (b.reset <= now) clients.delete(key);
      sweep = now + windowMs;
    }
    if (global.reset <= now) global = { count: 0, reset: now + windowMs };
    const key = options.key?.(c) ?? "local";
    let bucket = clients.get(key);
    if (bucket && bucket.reset <= now) {
      clients.delete(key);
      bucket = undefined;
    }
    if (!bucket && clients.size < maxClients) {
      bucket = { count: 0, reset: now + windowMs };
      clients.set(key, bucket);
    }
    c.header("X-RateLimit-Limit", String(limit));
    if (!bucket || bucket.count >= limit || global.count >= globalLimit) {
      const reset = Math.max(
        bucket?.reset ?? now + windowMs,
        global.count >= globalLimit ? global.reset : 0,
      );
      c.header(
        "Retry-After",
        String(Math.max(1, Math.ceil((reset - now) / 1000))),
      );
      c.header("X-RateLimit-Remaining", "0");
      return c.json(
        { error: "Too many requests. Retry after the indicated delay." },
        429,
      );
    }
    bucket.count++;
    global.count++;
    c.header("X-RateLimit-Remaining", String(limit - bucket.count));
    await next();
  };
}
