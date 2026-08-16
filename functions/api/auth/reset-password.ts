import { HttpError, json, readJson } from '../_lib/http';
import { hashPassword, sha256Hex } from '../_lib/crypto';

export const onRequestPost = async (context: any) => {
  const { env, request } = context;
  const body = await readJson(request);
  const token = String(body.token || '');
  const newPassword = String(body.newPassword || '');
  if (!token) throw new HttpError(400, 'Missing token.');
  if (newPassword.length < 8 || newPassword.length > 200) {
    throw new HttpError(400, 'Password must be at least 8 characters.');
  }

  const tokenHash = await sha256Hex(token);
  const row = await env.DB.prepare(
    "SELECT user_id, expires_at, used_at FROM auth_tokens WHERE token_hash = ?1 AND kind = 'reset'"
  )
    .bind(tokenHash)
    .first();
  if (!row || row.used_at || row.expires_at < Date.now()) {
    throw new HttpError(400, 'This reset link is invalid or has expired. Request a new one.');
  }

  // Update password, burn the token, and sign out every existing session.
  await env.DB.batch([
    env.DB.prepare('UPDATE users SET password_hash = ?1 WHERE id = ?2').bind(await hashPassword(newPassword), row.user_id),
    env.DB.prepare('UPDATE auth_tokens SET used_at = ?1 WHERE token_hash = ?2').bind(Date.now(), tokenHash),
    env.DB.prepare('DELETE FROM sessions WHERE user_id = ?1').bind(row.user_id),
  ]);
  return json({ ok: true });
};
