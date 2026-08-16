import { json, requireUser } from '../_lib/http';

// Metadata only. The blob is fetched per timetable, so opening the picker
// does not drag a year of overrides down the wire.
export const onRequestGet = async (context: any) => {
  const user = requireUser(context.data);
  const { results } = await context.env.DB.prepare(
    `SELECT id, name, share_token, created_at, updated_at
     FROM timetables WHERE user_id = ?1 ORDER BY updated_at DESC`
  )
    .bind(user.id)
    .all();
  return json({
    timetables: results.map((t: any) => ({
      id: t.id,
      name: t.name,
      shareToken: t.share_token,
      createdAt: t.created_at,
      updatedAt: t.updated_at,
    })),
  });
};
