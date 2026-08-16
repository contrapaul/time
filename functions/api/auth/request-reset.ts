import { json, readJson, getIP } from '../_lib/http';
import { randomToken, sha256Hex } from '../_lib/crypto';
import { rateLimit } from '../_lib/ratelimit';
import { sendResetEmail } from '../_lib/email';

// Always returns 200 so account existence cannot be probed.
export const onRequestPost = async (context: any) => {
  const { env, request } = context;
  const body = await readJson(request);
  const email = String(body.email || '').trim().toLowerCase();

  await rateLimit(env, `reset:${getIP(request)}`, 5, 60 * 60 * 1000);
  await rateLimit(env, `reset:${email}`, 3, 60 * 60 * 1000);

  const user = await env.DB.prepare('SELECT id FROM users WHERE email = ?1').bind(email).first();
  if (user) {
    const token = randomToken();
    await env.DB.prepare(
      "INSERT INTO auth_tokens (token_hash, user_id, kind, expires_at) VALUES (?1, ?2, 'reset', ?3)"
    )
      .bind(await sha256Hex(token), user.id, Date.now() + 60 * 60 * 1000)
      .run();
    const origin = new URL(request.url).origin;
    context.waitUntil(sendResetEmail(env, email, `${origin}/?reset=${token}`));
  }
  return json({ ok: true });
};
