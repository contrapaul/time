import { HttpError, json } from '../_lib/http';

/**
 * Read a shared timetable. No account needed: whoever holds the link can
 * look, which is the whole point of handing it to a colleague.
 *
 * The token is the only key, so it is matched exactly and nothing about the
 * owner beyond their username comes back.
 */
export const onRequestGet = async (context: any) => {
  const token = String(context.params.token || '');
  if (token.length < 20) throw new HttpError(404, 'That link does not work.');

  const row = await context.env.DB.prepare(
    `SELECT t.id, t.name, t.data, t.updated_at, u.username
     FROM timetables t JOIN users u ON u.id = t.user_id
     WHERE t.share_token = ?1`
  )
    .bind(token)
    .first();
  if (!row) throw new HttpError(404, 'That link does not work. It may have been turned off.');

  return json({
    timetable: {
      id: row.id,
      name: row.name,
      owner: row.username,
      updatedAt: row.updated_at,
      data: JSON.parse(row.data),
    },
  });
};
