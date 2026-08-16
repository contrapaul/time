import { HttpError, json, readJson, requireUser } from '../_lib/http';

// A year of overrides is a few tens of KB. This is a guard rail, not a budget.
const MAX_DATA_BYTES = 400 * 1024;

export const onRequestGet = async (context: any) => {
  const user = requireUser(context.data);
  const row = await context.env.DB.prepare(
    'SELECT * FROM timetables WHERE id = ?1 AND user_id = ?2'
  )
    .bind(context.params.id, user.id)
    .first();
  if (!row) throw new HttpError(404, 'Timetable not found.');
  return json({ timetable: shape(row) });
};

/**
 * Upsert. Last write wins, except that a client holding an older copy than
 * the server gets a 409 and has to look at what it would have overwritten.
 * A timetable is small enough that a silent merge would cost more bugs than
 * it saves keystrokes.
 */
export const onRequestPut = async (context: any) => {
  const { env, request, params } = context;
  const user = requireUser(context.data);
  const body = await readJson(request);

  const name = String(body.name || '').slice(0, 120);
  const updatedAt = Number(body.updatedAt) || Date.now();
  if (!name || !body.data) throw new HttpError(400, 'Missing name or data.');

  const data = JSON.stringify(body.data);
  if (data.length > MAX_DATA_BYTES) throw new HttpError(413, 'That timetable is too large.');

  const existing = await env.DB.prepare(
    'SELECT user_id, updated_at FROM timetables WHERE id = ?1'
  )
    .bind(params.id)
    .first();
  if (existing && existing.user_id !== user.id) throw new HttpError(403, 'Not your timetable.');
  if (existing && body.baseUpdatedAt != null && existing.updated_at > Number(body.baseUpdatedAt)) {
    throw new HttpError(409, 'A newer version of this timetable is already saved.');
  }

  const now = Date.now();
  await env.DB.prepare(
    `INSERT INTO timetables (id, user_id, name, data, created_at, updated_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6)
     ON CONFLICT(id) DO UPDATE SET name = ?3, data = ?4, updated_at = ?6`
  )
    .bind(params.id, user.id, name, data, now, updatedAt)
    .run();
  return json({ ok: true, updatedAt });
};

export const onRequestDelete = async (context: any) => {
  const user = requireUser(context.data);
  const res = await context.env.DB.prepare(
    'DELETE FROM timetables WHERE id = ?1 AND user_id = ?2'
  )
    .bind(context.params.id, user.id)
    .run();
  if (!res.meta.changes) throw new HttpError(404, 'Timetable not found.');
  return json({ ok: true });
};

function shape(row: any) {
  return {
    id: row.id,
    name: row.name,
    shareToken: row.share_token,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    data: JSON.parse(row.data),
  };
}
