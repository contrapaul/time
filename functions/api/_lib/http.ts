// Shared HTTP helpers for all /api functions.

export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function json(data: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...headers },
  });
}

export async function readJson(request: Request): Promise<any> {
  try {
    return await request.json();
  } catch {
    throw new HttpError(400, 'Invalid JSON body');
  }
}

export function getIP(request: Request): string {
  return request.headers.get('CF-Connecting-IP') || 'local';
}

export function requireUser(data: any): { id: string; username: string; email: string; email_verified: number } {
  if (!data.user) throw new HttpError(401, 'Sign in required');
  return data.user;
}
