import {NextRequest, NextResponse} from 'next/server';

export const runtime = 'nodejs';          // force Node runtime on Vercel
export const dynamic = 'force-dynamic';   // disable static optimization
export const revalidate = 0;              // no ISR caching for this route

// Set the session cookie
export async function POST(req: NextRequest) {
  const bearer = req.headers.get('authorization') ?? '';
  const token = bearer.startsWith('Bearer ') ? bearer.slice(7) : '';

  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const res = NextResponse.json({ status: 'success' });
  res.cookies.set('x-firebase-session', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 5, // 5 days
    sameSite: 'lax',
  });
  return res;
}

// Delete the session cookie
export async function DELETE() {
  const res = NextResponse.json({ status: 'success' });
  res.cookies.delete('x-firebase-session');
  return res;
}
