import { NextRequest, NextResponse } from 'next/server';
import { isAllowedEmail, signSession, SESSION_COOKIE, SESSION_MAX_AGE_SECONDS } from '@/lib/auth';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: '請提供有效的 JSON。' }, { status: 400 });
  }
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: '請輸入帳號與驗證碼。' }, { status: 400 });
  }
  const { email, code } = body as Record<string, unknown>;
  if (typeof email !== 'string' || !email.trim() || typeof code !== 'string' || !code) {
    return NextResponse.json({ error: '請輸入帳號與驗證碼。' }, { status: 400 });
  }

  const accessCode = process.env.ACCESS_CODE;
  if (!accessCode || !process.env.SESSION_SECRET) {
    return NextResponse.json(
      { error: '伺服器尚未設定存取權限，請聯絡管理員（需設定 ACCESS_CODE 與 SESSION_SECRET）。' },
      { status: 500 },
    );
  }

  if (!isAllowedEmail(email) || code !== accessCode) {
    return NextResponse.json({ error: '帳號或驗證碼不正確。' }, { status: 401 });
  }

  const token = await signSession(email.trim().toLowerCase());
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
  return res;
}
