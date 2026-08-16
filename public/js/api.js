/* Thin wrapper around /api. Fires `time:auth` on document whenever the
   signed-in user changes.

   Api.user: undefined = not asked yet, null = signed out, object = signed in. */

let _user;

async function req(method, path, body) {
  const opts = { method, headers: {}, credentials: 'same-origin' };
  if (body !== undefined) {
    opts.body = JSON.stringify(body);
    opts.headers['Content-Type'] = 'application/json';
  }
  const res = await fetch(path, opts);
  let data = null;
  try { data = await res.json(); } catch {}
  if (!res.ok) {
    const err = new Error((data && data.error) || `Request failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return data;
}

function setUser(u) {
  const changed = JSON.stringify(_user ?? null) !== JSON.stringify(u ?? null);
  _user = u;
  Api.user = u;
  if (changed) document.dispatchEvent(new CustomEvent('time:auth', { detail: { user: u } }));
}

export const Api = {
  user: undefined,

  async me() {
    try {
      const d = await req('GET', '/api/auth/me');
      setUser(d.user);
      return d.user;
    } catch {
      setUser(null); // offline, or no backend in front of us: behave as signed out
      return null;
    }
  },

  async signup(email, username, password) {
    const d = await req('POST', '/api/auth/signup', { email, username, password });
    setUser(d.user);
    return d.user;
  },
  async login(email, password) {
    const d = await req('POST', '/api/auth/login', { email, password });
    setUser(d.user);
    return d.user;
  },
  async logout() {
    await req('POST', '/api/auth/logout', {});
    setUser(null);
  },

  verifyEmail(token) { return req('POST', '/api/auth/verify-email', { token }); },
  resendVerify() { return req('POST', '/api/auth/resend-verify', {}); },
  requestReset(email) { return req('POST', '/api/auth/request-reset', { email }); },
  resetPassword(token, newPassword) { return req('POST', '/api/auth/reset-password', { token, newPassword }); },

  listTimetables() { return req('GET', '/api/timetables'); },
  getTimetable(id) { return req('GET', `/api/timetables/${id}`); },
  putTimetable(id, body) { return req('PUT', `/api/timetables/${id}`, body); },
  deleteTimetable(id) { return req('DELETE', `/api/timetables/${id}`); },

  shareTimetable(id) { return req('POST', `/api/timetables/${id}/share`, {}); },
  unshareTimetable(id) { return req('DELETE', `/api/timetables/${id}/share`); },
  getShared(token) { return req('GET', `/api/shared/${token}`); },
};
