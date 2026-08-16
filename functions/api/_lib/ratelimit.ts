import { HttpError } from './http';

// Fixed-window rate limiter backed by the rate_limits table.
// Throws 429 when `key` exceeds `max` hits within `windowMs`.
export async function rateLimit(env: any, key: string, max: number, windowMs: number): Promise<void> {
  const now = Date.now();
  const row = await env.DB.prepare(
    `INSERT INTO rate_limits (key, count, window_end) VALUES (?1, 1, ?2)
     ON CONFLICT(key) DO UPDATE SET
       count = CASE WHEN window_end < ?3 THEN 1 ELSE count + 1 END,
       window_end = CASE WHEN window_end < ?3 THEN ?2 ELSE window_end END
     RETURNING count`
  )
    .bind(key, now + windowMs, now)
    .first();
  if (row && row.count > max) {
    throw new HttpError(429, 'Too many attempts. Please wait a while and try again.');
  }
}
