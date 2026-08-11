import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { randomUUID } from 'node:crypto';
import { getSession } from './lib/auth';

function buildCsp(request: NextRequest, nonce: string) {
  const s3Origin = process.env.S3_ENDPOINT
    ? new URL(process.env.S3_ENDPOINT).origin
    : 'http://localhost:9000';
  const apiOrigin = process.env.API_BASE_URL
    ? new URL(process.env.API_BASE_URL).origin
    : 'http://localhost:4000';

  return (
    [
      "default-src 'self'",
      `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
      `style-src 'self' 'nonce-${nonce}'`,
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
  const nonce = Buffer.from(randomUUID()).toString('base64');
  const csp = buildCsp(request, nonce);

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('Content-Security-Policy', csp);

  const next = NextResponse.next({
    request: { headers: requestHeaders },
  });
  next.headers.set('Content-Security-Policy', csp);

  if (request.nextUrl.pathname.startsWith('/workspaces')) {
    const cookie = request.headers.get('cookie') || '';
    const user = await getSession(cookie);
    if (!user) {
      const loginUrl = new URL('/login', request.url);
      return NextResponse.redirect(loginUrl, { headers: next.headers });
    }
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
