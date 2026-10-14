import { NextRequest, NextResponse } from 'next/server';
import { SESSION_COOKIE, verifySession, isAdminEmail } from '@/lib/auth';
import { decideUserAccount, listUserAccounts, setUserPassword } from '@/lib/db';
import { hashPassword, isValidPassword } from '@/lib/password';

export const runtime = 'nodejs';

async function requireAdmin(req: NextRequest): Promise<string | null> {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const email = token ? await verifySession(token) : null;
  return email && isAdminEmail(email) ? email : null;
}

export async function GET(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: '沒有權限。' }, { status: 403 });

  try {
    const users = await listUserAccounts();
    return NextResponse.json({ users });
  } catch (err) {
    console.error('admin users list error', err);
    return NextResponse.json({ error: '讀取失敗，請確認資料庫已設定。' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: '沒有權限。' }, { status: 403 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: '請提供有效的 JSON。' }, { status: 400 });
  }
  const { email, decision } = (body ?? {}) as Record<string, unknown>;
  if (typeof email !== 'string' || (decision !== 'approved' && decision !== 'rejected')) {
    return NextResponse.json({ error: '參數無效。' }, { status: 400 });
  }

  try {
    const updated = await decideUserAccount(email.trim().toLowerCase(), decision, admin);
    if (!updated) return NextResponse.json({ error: '找不到這個帳號申請。' }, { status: 404 });
    return NextResponse.json({ user: updated });
  } catch (err) {
    console.error('admin users decide error', err);
    return NextResponse.json({ error: '更新失敗。' }, { status: 500 });
  }
}

// 幫忘記密碼的使用者重設一組暫用密碼（沒有寄信機制，管理員手動把這組密碼
// 告訴對方，例如用LINE）；使用者登入後建議立刻去「更改密碼」換成自己的。
export async function PATCH(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: '沒有權限。' }, { status: 403 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: '請提供有效的 JSON。' }, { status: 400 });
  }
  const { email, newPassword } = (body ?? {}) as Record<string, unknown>;
  if (typeof email !== 'string' || !isValidPassword(newPassword)) {
    return NextResponse.json({ error: '參數無效，密碼至少需要 8 個字元。' }, { status: 400 });
  }

  try {
    const hash = await hashPassword(newPassword);
    await setUserPassword(email.trim().toLowerCase(), hash);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('admin reset password error', err);
    return NextResponse.json({ error: '重設失敗。' }, { status: 500 });
  }
}
