import { NextRequest, NextResponse } from 'next/server';
import { getSecurityQuestion } from '@/lib/db';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: '請提供有效的 JSON。' }, { status: 400 });
  }
  const { email } = (body ?? {}) as Record<string, unknown>;
  if (typeof email !== 'string' || !email.trim()) {
    return NextResponse.json({ error: '請輸入 Email。' }, { status: 400 });
  }

  try {
    const question = await getSecurityQuestion(email.trim().toLowerCase());
    if (!question) {
      return NextResponse.json({ error: '找不到這個帳號的安全問題設定，請聯絡管理員協助重設密碼。' }, { status: 404 });
    }
    return NextResponse.json({ question });
  } catch (err) {
    console.error('forgot-password question error', err);
    return NextResponse.json({ error: '讀取失敗，請稍後再試一次。' }, { status: 500 });
  }
}
