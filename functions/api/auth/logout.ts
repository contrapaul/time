import { json } from '../_lib/http';
import { deleteSession, clearedSessionCookie } from '../_lib/session';

export const onRequestPost = async (context: any) => {
  await deleteSession(context.env, context.request);
  return json({ ok: true }, 200, { 'Set-Cookie': clearedSessionCookie() });
};
