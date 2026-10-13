import { NextRequest, NextResponse } from 'next/server';
import { isAdminEmail } from '@/lib/auth';
import { applyForAccount } from '@/lib/db';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: '請提供有效的 JSON。' }, { status: 400 });
  }
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: '請輸入 Email。' }, { status: 400 });
  }
  const { email, name, note } = body as Record<string, unknown>;
  if (typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
    return NextResponse.json({ error: '請輸入有效的 Email。' }, { status: 400 });
  }
  if (name !== undefined && (typeof name !== 'string' || name.length > 100)) {
    return NextResponse.json({ error: '姓名格式無效。' }, { status: 400 });
  }
  if (note !== undefined && (typeof note !== 'string' || note.length > 500)) {
    return NextResponse.json({ error: '備註太長。' }, { status: 400 });
  }

  const normalizedEmail = email.trim().toLowerCase();
  if (isAdminEmail(normalizedEmail)) {
    return NextResponse.json({ status: 'approved', message: '這個帳號已經是管理員，可以直接登入。' });
  }

  try {
    const account = await applyForAccount(
      normalizedEmail,
      typeof name === 'string' && name.trim() ? name.trim() : null,
      typeof note === 'string' && note.trim() ? note.trim() : null,
    );
    const message =
      account.status === 'approved'
        ? '這個帳號已經開通，可以直接登入。'
        : '已送出申請，請等候管理員開通後再登入。';
    return NextResponse.json({ status: account.status, message });
  } catch (err) {
    console.error('apply api error', err);
    return NextResponse.json({ error: '申請失敗，請稍後再試一次。' }, { status: 500 });
  }
}
