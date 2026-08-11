import { API_BASE } from './api';

export interface User {
  id: string;
  email: string;
  createdAt?: string;
}

async function authFetch<T>(
  path: string,
  options: RequestInit = {},
  cookieHeader?: string
): Promise<T> {
  const isBrowser = typeof window !== 'undefined';
  const headers = new Headers(options.headers);

  if (options.body && typeof options.body === 'string' && !headers.has('content-type')) {
    headers.set('content-type', 'application/json');
  }
  if (!isBrowser && cookieHeader) {
    headers.set('cookie', cookieHeader);
  }

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    credentials: isBrowser ? 'same-origin' : undefined,
    headers,
  } as RequestInit);

  if (!res.ok) {
    let text = '';
    try {
      text = await res.text();
    } catch {
      /* ignore */
    }
    if (text.startsWith('{')) {
      try {
        const json = JSON.parse(text) as { error?: string; message?: string };
        text = json.error || json.message || text;
      } catch {
        // keep text
      }
    }
    throw new Error(text || `Request failed with ${res.status}`);
  }

  if (res.status === 204) {
    return undefined as T;
  }
  return res.json() as T;
}

export async function register(email: string, password: string): Promise<{ user: User }> {
  return authFetch('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}

export async function login(email: string, password: string): Promise<{ user: User }> {
  return authFetch('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}

export async function logout(): Promise<void> {
  await authFetch('/auth/logout', { method: 'POST' });
}

export async function getSession(cookieHeader?: string): Promise<User | null> {
  try {
    const data = await authFetch<{ user?: User }>('/auth/me', { method: 'GET' }, cookieHeader);
    return data?.user ?? null;
  } catch {
    return null;
  }
}
