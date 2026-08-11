import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getSession } from './lib/auth';

function buildCsp() {
  const s3Origin = process.env.S3_ENDPOINT
    ? new URL(process.env.S3_ENDPOINT).origin
    : 'http://localhost:9000';
  const apiOrigin = process.env.API_BASE_URL
    ? new URL(process.env.API_BASE_URL).origin
    : 'http://localhost:4000';

  const isDev = process.env.NODE_ENV === 'development';

  return (
    [
      "default-src 'self'",
      isDev
        ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
        : "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      `img-src 'self' ${s3Origin} data: blob:`,
      `connect-src 'self' ${apiOrigin}`,
      "font-src 'self'",
      "object-src 'none'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join('; ') + ';'
  );
}

export async function proxy(request: NextRequest) {
  const csp = buildCsp();

  const next = NextResponse.next();
  next.headers.set('Content-Security-Policy', csp);

  const pathname = request.nextUrl.pathname;
  const cookie = request.headers.get('cookie') || '';
  const user = await getSession(cookie);

  // Redirect unauthenticated users away from authenticated-only routes.
  if (!user && (pathname === '/' || pathname.startsWith('/workspaces'))) {
    const loginUrl = new URL('/login', request.url);
    return NextResponse.redirect(loginUrl, { headers: next.headers });
  }

  // Authenticated users don't need the login page.
  if (user && pathname === '/login') {
    const homeUrl = new URL('/', request.url);
    return NextResponse.redirect(homeUrl, { headers: next.headers });
  }

  return next;
}

export const config = {
  matcher: [
    {
      source: '/((?!api|_next/static|_next/image|favicon.ico).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
};
