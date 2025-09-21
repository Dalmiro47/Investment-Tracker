import { NextRequest, NextResponse } from 'next/server';

// Create session cookie
export async function POST(req: NextRequest) {
  const auth = req.headers.get('authorization') ?? '';
  if (!auth.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: { 'Cache-Control': 'no-store' } });
  }
  const token = auth.slice(7);

  const res = NextResponse.json({ status: 'success' }, { headers: { 'Cache-Control': 'no-store' } });
  res.cookies.set('x-firebase-session', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 5, // 5 days
    sameSite: 'lax',
  });
  return res;
}

// Delete session cookie
export async function DELETE() {
  const res = NextResponse.json({ status: 'success' }, { headers: { 'Cache-Control': 'no-store' } });
  res.cookies.delete('x-firebase-session');
  return res;
}
