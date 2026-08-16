import { randomToken, sha256Hex } from './crypto';

export const SESSION_COOKIE = 'tt_session';
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export function parseCookie(request: Request, name: string): string | null {
  const header = request.headers.get('Cookie');
  if (!header) return null;
  for (const part of header.split(';')) {
    const [k, ...rest] = part.trim().split('=');
    if (k === name) return rest.join('=');
  }
  return null;
}

export async function createSession(env: any, userId: string): Promise<string> {
  const token = randomToken();
  const now = Date.now();
  await env.DB.prepare(
    'INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?1, ?2, ?3, ?4)'
  )
    .bind(await sha256Hex(token), userId, now, now + SESSION_TTL_MS)
    .run();
  return token;
}

export function sessionCookie(token: string): string {
  return `${SESSION_COOKIE}=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${SESSION_TTL_MS / 1000}`;
}

export function clearedSessionCookie(): string {
  return `${SESSION_COOKIE}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`;
}

export async function getUserFromRequest(env: any, request: Request): Promise<any | null> {
  const token = parseCookie(request, SESSION_COOKIE);
  if (!token) return null;
  const row = await env.DB.prepare(
    `SELECT u.id, u.username, u.email, u.email_verified, s.expires_at
     FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = ?1`
  )
    .bind(await sha256Hex(token))
    .first();
  if (!row) return null;
  if (row.expires_at < Date.now()) return null;
  return { id: row.id, username: row.username, email: row.email, email_verified: row.email_verified };
}

export async function deleteSession(env: any, request: Request): Promise<void> {
  const token = parseCookie(request, SESSION_COOKIE);
  if (!token) return;
  await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?1').bind(await sha256Hex(token)).run();
}

// Piggybacked cleanup: purge this user's expired sessions and stale tokens.
export async function purgeExpired(env: any, userId: string): Promise<void> {
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare('DELETE FROM sessions WHERE user_id = ?1 AND expires_at < ?2').bind(userId, now),
    env.DB.prepare('DELETE FROM auth_tokens WHERE user_id = ?1 AND expires_at < ?2').bind(userId, now),
  ]);
}
