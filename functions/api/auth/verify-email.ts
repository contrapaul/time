import { HttpError, json, readJson } from '../_lib/http';
import { sha256Hex } from '../_lib/crypto';

export const onRequestPost = async (context: any) => {
  const { env, request } = context;
  const body = await readJson(request);
  const token = String(body.token || '');
  if (!token) throw new HttpError(400, 'Missing token.');

  const tokenHash = await sha256Hex(token);
  const row = await env.DB.prepare(
    "SELECT user_id, expires_at, used_at FROM auth_tokens WHERE token_hash = ?1 AND kind = 'verify'"
  )
    .bind(tokenHash)
    .first();
  if (!row || row.used_at || row.expires_at < Date.now()) {
    throw new HttpError(400, 'This verification link is invalid or has expired.');
  }

  await env.DB.batch([
    env.DB.prepare('UPDATE auth_tokens SET used_at = ?1 WHERE token_hash = ?2').bind(Date.now(), tokenHash),
    env.DB.prepare('UPDATE users SET email_verified = 1 WHERE id = ?1').bind(row.user_id),
  ]);
  return json({ ok: true });
};
