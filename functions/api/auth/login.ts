import { HttpError, json, readJson, getIP } from '../_lib/http';
import { verifyPassword } from '../_lib/crypto';
import { createSession, sessionCookie, purgeExpired } from '../_lib/session';
import { rateLimit } from '../_lib/ratelimit';

export const onRequestPost = async (context: any) => {
  const { env, request } = context;
  const body = await readJson(request);
  const email = String(body.email || '').trim().toLowerCase();
  const password = String(body.password || '');

  const window = 15 * 60 * 1000;
  await rateLimit(env, `login:${getIP(request)}`, 10, window);
  await rateLimit(env, `login:${email}`, 10, window);

  const user = await env.DB.prepare(
    'SELECT id, username, email, email_verified, password_hash FROM users WHERE email = ?1'
  )
    .bind(email)
    .first();
  if (!user || !(await verifyPassword(password, user.password_hash))) {
    throw new HttpError(401, 'Incorrect email or password.');
  }

  context.waitUntil(purgeExpired(env, user.id));
  const session = await createSession(env, user.id);
  return json(
    { user: { id: user.id, username: user.username, email: user.email, emailVerified: !!user.email_verified } },
    200,
    { 'Set-Cookie': sessionCookie(session) }
  );
};
