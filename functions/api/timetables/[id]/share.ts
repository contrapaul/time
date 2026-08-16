import { HttpError, json, requireUser } from '../../_lib/http';
import { randomToken } from '../../_lib/crypto';

/**
 * Create or rotate a share link.
 *
 * Rotating is how revoking-and-resharing works: the old token stops
 * resolving the moment a new one is written, so a link handed to the wrong
 * person can always be taken back.
 *
 * Verification is required first. A share link is anonymous hosting on
 * someone else's domain, and an unverified address is not an account.
 */
export const onRequestPost = async (context: any) => {
  const { env, params } = context;
  const user = requireUser(context.data);

  if (!user.email_verified) {
    throw new HttpError(403, 'Verify your email address before sharing.');
  }

  const owned = await env.DB.prepare(
    'SELECT id FROM timetables WHERE id = ?1 AND user_id = ?2'
  )
    .bind(params.id, user.id)
    .first();
  if (!owned) throw new HttpError(404, 'Timetable not found.');

  const token = randomToken();
  await env.DB.prepare('UPDATE timetables SET share_token = ?1 WHERE id = ?2')
    .bind(token, params.id)
    .run();
  return json({ shareToken: token });
};

export const onRequestDelete = async (context: any) => {
  const { env, params } = context;
  const user = requireUser(context.data);
  const res = await env.DB.prepare(
    'UPDATE timetables SET share_token = NULL WHERE id = ?1 AND user_id = ?2'
  )
    .bind(params.id, user.id)
    .run();
  if (!res.meta.changes) throw new HttpError(404, 'Timetable not found.');
  return json({ ok: true });
};
