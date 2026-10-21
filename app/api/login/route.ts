import { NextRequest, NextResponse } from 'next/server';
import { isAdminEmail, signSession, SESSION_COOKIE, SESSION_MAX_AGE_SECONDS } from '@/lib/auth';
import { getPasswordHash, getUserAccount } from '@/lib/db';
import { verifyPassword } from '@/lib/password';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: '請提供有效的 JSON。' }, { status: 400 });
  }
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: '請輸入帳號與密碼。' }, { status: 400 });
  }
  const { email, password } = body as Record<string, unknown>;
  if (typeof email !== 'string' || !email.trim() || typeof password !== 'string' || !password) {
    return NextResponse.json({ error: '請輸入帳號與密碼。' }, { status: 400 });
  }

  const accessCode = process.env.ACCESS_CODE;
  if (!accessCode || !process.env.SESSION_SECRET) {
    return NextResponse.json(
      { error: '伺服器尚未設定存取權限，請聯絡管理員（需設定 ACCESS_CODE 與 SESSION_SECRET）。' },
      { status: 500 },
    );
  }

  const normalizedEmail = email.trim().toLowerCase();
  const fail = (message: string) => NextResponse.json({ error: message }, { status: 401 });

  if (isAdminEmail(normalizedEmail)) {
    // 管理員：已經設定過個人密碼就只認個人密碼；還沒設定過，ACCESS_CODE
    // 當作一次性的開通密碼，登入後建議去「更改密碼」設一組自己的。
    const existingHash = await getPasswordHash(normalizedEmail).catch(() => null);
    const ok = existingHash ? await verifyPassword(password, existingHash) : password === accessCode;
    if (!ok) return fail('密碼不正確。');
  } else {
    // 一般使用者：一定要先申請（/apply）、經管理員開通（status=approved），
    // 且密碼要對得上申請時自己設定的那組。這裡刻意把「還沒申請／審核中／
    // 被拒絕」跟「密碼真的打錯」分開講——這是內部小團隊工具，不是對外
    // 服務，講清楚原因比防止email列舉更重要，不然使用者會一直以為是自己
    // 密碼打錯，其實只是帳號還沒開通。
    const account = await getUserAccount(normalizedEmail).catch(() => null);
    if (!account) return fail('這個帳號還沒有申請紀錄，請先到「申請帳號」頁面申請。');
    if (account.status === 'pending') return fail('帳號還在等候管理員開通，請聯絡管理員。');
    if (account.status === 'rejected') return fail('這個帳號的申請未通過，請聯絡管理員。');
    const existingHash = await getPasswordHash(normalizedEmail).catch(() => null);
    // 沒有密碼雜湊是帳號本身的設定問題（例如密碼功能上線前申請的舊紀錄），
    // 不是使用者打錯密碼——分開講才不會讓人一直以為是自己打錯。
    if (!existingHash) return fail('這個帳號沒有設定密碼，請聯絡管理員到後台重設密碼。');
    if (!(await verifyPassword(password, existingHash))) return fail('密碼不正確。');
  }

  const token = await signSession(normalizedEmail);
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
