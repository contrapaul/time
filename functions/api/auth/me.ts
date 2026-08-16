import { json } from '../_lib/http';

export const onRequestGet = async (context: any) => {
  const u = context.data.user;
  return json({
    user: u ? { id: u.id, username: u.username, email: u.email, emailVerified: !!u.email_verified } : null,
  });
};
