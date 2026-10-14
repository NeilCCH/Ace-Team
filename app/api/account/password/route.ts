import { NextRequest, NextResponse } from 'next/server';
import { isAdminEmail, SESSION_COOKIE, verifySession } from '@/lib/auth';
import { getPasswordHash, setUserPassword } from '@/lib/db';
import { hashPassword, isValidPassword, verifyPassword } from '@/lib/password';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const email = token ? await verifySession(token) : null;
  if (!email) return NextResponse.json({ error: '請先登入。' }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: '請提供有效的 JSON。' }, { status: 400 });
  }
  const { currentPassword, newPassword } = (body ?? {}) as Record<string, unknown>;
  if (typeof currentPassword !== 'string' || !currentPassword) {
    return NextResponse.json({ error: '請輸入目前的密碼。' }, { status: 400 });
  }
  if (!isValidPassword(newPassword)) {
    return NextResponse.json({ error: '新密碼至少需要 8 個字元。' }, { status: 400 });
  }

  const accessCode = process.env.ACCESS_CODE;
  const existingHash = await getPasswordHash(email).catch(() => null);

  // 一般使用者一定要有既有密碼（申請時自己設的）才能改；管理員如果還沒設過
  // 個人密碼，允許用 ACCESS_CODE 當作「目前密碼」來完成第一次設定。
  let currentOk = false;
  if (existingHash) {
    currentOk = await verifyPassword(currentPassword, existingHash);
  } else if (isAdminEmail(email) && accessCode) {
    currentOk = currentPassword === accessCode;
  }
  if (!currentOk) {
    return NextResponse.json({ error: '目前的密碼不正確。' }, { status: 401 });
  }

  try {
    const newHash = await hashPassword(newPassword);
    await setUserPassword(email, newHash);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('change password error', err);
    return NextResponse.json({ error: '更新失敗，請稍後再試一次。' }, { status: 500 });
  }
}
