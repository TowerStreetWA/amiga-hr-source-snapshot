import type { Request, Response, NextFunction, RequestHandler } from "express";

type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

function clientKey(req: Request): string {
  const fwd = req.headers["x-forwarded-for"];
  const ip = Array.isArray(fwd) ? fwd[0] : (fwd ?? "").toString().split(",")[0]?.trim();
  return ip || req.ip || req.socket.remoteAddress || "unknown";
}

export function rateLimit(opts: {
  windowMs: number;
  max: number;
  keyPrefix: string;
  keyGenerator?: (req: Request, clientAddress: string) => string;
}): RequestHandler {
  const { windowMs, max, keyPrefix, keyGenerator } = opts;
  return (req: Request, res: Response, next: NextFunction) => {
    const now = Date.now();
    const address = clientKey(req);
    const key = `${keyPrefix}:${keyGenerator ? keyGenerator(req, address) : address}`;
    const existing = buckets.get(key);
    if (!existing || existing.resetAt < now) {
      buckets.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }
    existing.count += 1;
    if (existing.count > max) {
      const retryAfter = Math.max(1, Math.ceil((existing.resetAt - now) / 1000));
      res.setHeader("Retry-After", String(retryAfter));
      res.status(429).json({ error: "Too many requests, please slow down." });
      return;
    }
    next();
  };
}

setInterval(() => {
  const now = Date.now();
  for (const [k, v] of buckets) if (v.resetAt < now) buckets.delete(k);
}, 60_000).unref?.();
