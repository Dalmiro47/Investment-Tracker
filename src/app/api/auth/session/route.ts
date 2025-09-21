'use server';

import {NextRequest, NextResponse} from 'next/server';

// Set the session cookie
export async function POST(req: NextRequest) {
  const bearer = req.headers.get('Authorization');
  if (!bearer) {
    return new Response('Unauthorized', {status: 401});
  }
  const token = bearer.split(' ')[1];

  const response = NextResponse.json({status: 'success'});

  response.cookies.set('x-firebase-session', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 5, // 5 days
    sameSite: 'lax',
  });

  return response;
}

// Delete the session cookie
export async function DELETE() {
  const response = NextResponse.json({status: 'success'});
  response.cookies.delete('x-firebase-session');
  return response;
}
