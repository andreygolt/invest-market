import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const isPublic =
    pathname === '/' ||
    pathname === '/login' ||
    pathname === '/pending' ||
    pathname === '/parml-lab' ||
    pathname.startsWith('/apply') ||
    pathname.startsWith('/invite/') ||
    pathname.startsWith('/api/apply') ||
    pathname.startsWith('/api/invite/') ||
    pathname.startsWith('/api/auth/');

  if (isPublic) {
    return NextResponse.next({ request });
  }

  let supabaseResponse = NextResponse.next({ request });
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  const { data: profile } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();

  if (!profile) {
    return NextResponse.redirect(new URL('/pending', request.url));
  }

  const role = profile.role as string;

  // Redirect to correct home on root dashboard access
  if (pathname === '/dashboard') {
    if (role === 'project') {
      return NextResponse.redirect(new URL('/project', request.url));
    }
    if (['superadmin', 'admin', 'moderator', 'manager'].includes(role)) {
      return NextResponse.redirect(new URL('/admin/dashboard', request.url));
    }
  }

  // Block project users from investor area
  if (pathname.startsWith('/catalog') || pathname.startsWith('/deals')) {
    if (role === 'project') {
      return NextResponse.redirect(new URL('/project', request.url));
    }
  }

  // Block investors from admin/project areas
  if (pathname.startsWith('/admin') && role === 'investor') {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }
  if (pathname.startsWith('/project') && role === 'investor') {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  return supabaseResponse;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/health).*)'],
};
