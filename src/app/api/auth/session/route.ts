'use server';

import {NextRequest, NextResponse} from 'next/server';
import {cookies} from 'next/headers';

// Set the session cookie
export async function POST(req: NextRequest) {
  const bearer = req.headers.get('Authorization');
  if (!bearer) {
    return new Response('Unauthorized', {status: 401});
  }
  const token = bearer.split(' ')[1];

  const cookieStore = cookies();
  cookieStore.set('x-firebase-session', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 5, // 5 days
    sameSite: 'lax',
  });

  return NextResponse.json({status: 'success'});
}

// Delete the session cookie
export async function DELETE() {
  const cookieStore = cookies();
  cookieStore.delete('x-firebase-session');
  return NextResponse.json({status: 'success'});
}
