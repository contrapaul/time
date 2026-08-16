import { HttpError, json, readJson, getIP } from '../_lib/http';
import { hashPassword, randomToken, sha256Hex } from '../_lib/crypto';
import { createSession, sessionCookie } from '../_lib/session';
import { rateLimit } from '../_lib/ratelimit';
import { sendVerifyEmail } from '../_lib/email';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME_RE = /^[a-zA-Z0-9_-]{3,24}$/;

export const onRequestPost = async (context: any) => {
  const { env, request } = context;
  await rateLimit(env, `signup:${getIP(request)}`, 5, 60 * 60 * 1000);

  const body = await readJson(request);
  const email = String(body.email || '').trim().toLowerCase();
  const username = String(body.username || '').trim();
  const password = String(body.password || '');

  if (!EMAIL_RE.test(email) || email.length > 254) throw new HttpError(400, 'Please enter a valid email address.');
  if (!USERNAME_RE.test(username)) {
    throw new HttpError(400, 'Username must be 3-24 characters: letters, numbers, - or _ only.');
  }
  if (password.length < 8 || password.length > 200) {
    throw new HttpError(400, 'Password must be at least 8 characters.');
  }

  const existing = await env.DB.prepare(
    'SELECT email, username FROM users WHERE email = ?1 OR username = ?2'
  )
    .bind(email, username)
    .first();
  if (existing) {
    const which = existing.email.toLowerCase() === email ? 'email' : 'username';
    throw new HttpError(409, `That ${which} is already taken.`);
  }

  const userId = crypto.randomUUID();
  const now = Date.now();
  await env.DB.prepare(
    'INSERT INTO users (id, email, username, password_hash, email_verified, created_at) VALUES (?1, ?2, ?3, ?4, 0, ?5)'
  )
    .bind(userId, email, username, await hashPassword(password), now)
    .run();

  // Email verification token (24h). Send is best-effort in the background.
  const verifyToken = randomToken();
  await env.DB.prepare(
    "INSERT INTO auth_tokens (token_hash, user_id, kind, expires_at) VALUES (?1, ?2, 'verify', ?3)"
  )
    .bind(await sha256Hex(verifyToken), userId, now + 24 * 60 * 60 * 1000)
    .run();
  const origin = new URL(request.url).origin;
  context.waitUntil(sendVerifyEmail(env, email, `${origin}/?verify=${verifyToken}`));

  const session = await createSession(env, userId);
  return json(
    { user: { id: userId, username, email, emailVerified: false } },
    200,
    { 'Set-Cookie': sessionCookie(session) }
  );
};
