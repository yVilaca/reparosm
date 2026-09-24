import { NextResponse } from 'next/server.js';

const hasSessionCookie = (request: Request) =>
  request.headers
    .get('cookie')
    ?.split(';')
    .some((cookie) => cookie.trim().startsWith('reparosm_session='));

export async function proxy(request: Request) {
  // The panel layout performs the authoritative database-backed session check.
  if (hasSessionCookie(request)) return NextResponse.next();
  return NextResponse.redirect(new URL('/login', request.url));
}

export const config = {
  matcher: ['/', '/ordens/:path*'],
};
