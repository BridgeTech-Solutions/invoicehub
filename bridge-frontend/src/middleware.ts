import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// Auth tokens are stored in localStorage (client-side only).
// Route protection is handled by the dashboard layout client-side.
// This middleware only handles the root redirect.
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Redirect root to login
  if (pathname === '/') {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|logos/).*)'],
}
