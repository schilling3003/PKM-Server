import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getSession } from './lib/auth';

export async function middleware(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith('/workspaces')) {
    const cookie = request.headers.get('cookie') || '';
    const user = await getSession(cookie);
    if (!user) {
      const loginUrl = new URL('/login', request.url);
      return NextResponse.redirect(loginUrl);
    }
  }
  return NextResponse.next();
}

export const config = {
  matcher: '/workspaces/:path*',
};
