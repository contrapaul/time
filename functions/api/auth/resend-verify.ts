import { HttpError, json, requireUser } from '../_lib/http';
import { randomToken, sha256Hex } from '../_lib/crypto';
import { rateLimit } from '../_lib/ratelimit';
import { sendVerifyEmail } from '../_lib/email';

// Send a fresh verification email to the signed-in (unverified) user.
export const onRequestPost = async (context: any) => {
  const { env, request } = context;
  const user = requireUser(context.data);
  if (user.email_verified) throw new HttpError(400, 'Your email is already verified.');

  await rateLimit(env, `resend-verify:${user.id}`, 3, 60 * 60 * 1000);

  const token = randomToken();
  await env.DB.prepare(
    "INSERT INTO auth_tokens (token_hash, user_id, kind, expires_at) VALUES (?1, ?2, 'verify', ?3)"
  )
    .bind(await sha256Hex(token), user.id, Date.now() + 24 * 60 * 60 * 1000)
    .run();
  const origin = new URL(request.url).origin;
  await sendVerifyEmail(env, user.email, `${origin}/?verify=${token}`);
  return json({ ok: true });
};
