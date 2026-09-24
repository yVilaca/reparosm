import { NextResponse } from 'next/server.js';
import { currentAccount } from '@/lib/auth';

export async function proxy(request: Request) {
  if (await currentAccount(request)) return NextResponse.next();
  return NextResponse.redirect(new URL('/login', request.url));
}

export const config = {
  matcher: ['/', '/ordens/:path*'],
};
