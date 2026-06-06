import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
  // Only protect /admin routes
  if (request.nextUrl.pathname.startsWith('/admin')) {
    const authHeader = request.headers.get('authorization')
    const urlPassword = request.nextUrl.searchParams.get('pwd')
    
    const adminPassword = process.env.ADMIN_PASSWORD
    
    // Check password from header or query param
    const isAuthorized = 
      (authHeader && authHeader === `Bearer ${adminPassword}`) ||
      (urlPassword && urlPassword === adminPassword)

    // For the UI, we might use a cookie. Let's check for a cookie named admin_token
    const adminCookie = request.cookies.get('admin_token')?.value
    const isCookieAuthorized = adminCookie === adminPassword
    
    if (!isAuthorized && !isCookieAuthorized && !request.nextUrl.pathname.startsWith('/admin/login')) {
      return NextResponse.redirect(new URL('/admin/login', request.url))
    }
  }

  // Same for specific API routes
  if (request.nextUrl.pathname.startsWith('/api/admin')) {
    const authHeader = request.headers.get('authorization')
    const adminPassword = process.env.ADMIN_PASSWORD
    const adminCookie = request.cookies.get('admin_token')?.value
    
    if (authHeader !== `Bearer ${adminPassword}` && adminCookie !== adminPassword) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/admin/:path*', '/api/admin/:path*'],
}
