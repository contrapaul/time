import { HttpError, json } from './_lib/http';
import { getUserFromRequest } from './_lib/session';

// Runs before every /api/* request: attaches the signed-in user (or null)
// to context.data.user and converts thrown errors into JSON responses.
export const onRequest = async (context: any) => {
  try {
    context.data.user = await getUserFromRequest(context.env, context.request);
    return await context.next();
  } catch (e: any) {
    if (e instanceof HttpError) return json({ error: e.message }, e.status);
    console.error('Unhandled API error:', e && e.stack ? e.stack : e);
    return json({ error: 'Internal server error' }, 500);
  }
};
