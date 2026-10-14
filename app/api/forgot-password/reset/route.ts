import { NextRequest, NextResponse } from 'next/server';
import { getSecurityAnswerHash, setUserPassword } from '@/lib/db';
import { hashPassword, isValidPassword, verifyPassword } from '@/lib/password';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: '請提供有效的 JSON。' }, { status: 400 });
  }
  const { email, answer, newPassword } = (body ?? {}) as Record<string, unknown>;
  if (typeof email !== 'string' || !email.trim()) {
    return NextResponse.json({ error: '請輸入 Email。' }, { status: 400 });
  }
  if (typeof answer !== 'string' || !answer.trim()) {
    return NextResponse.json({ error: '請輸入安全問題的答案。' }, { status: 400 });
  }
  if (!isValidPassword(newPassword)) {
    return NextResponse.json({ error: '新密碼至少需要 8 個字元。' }, { status: 400 });
  }

  const normalizedEmail = email.trim().toLowerCase();

  try {
    const answerHash = await getSecurityAnswerHash(normalizedEmail);
    if (!answerHash || !(await verifyPassword(answer.trim().toLowerCase(), answerHash))) {
      return NextResponse.json({ error: '答案不正確。' }, { status: 401 });
    }
    const passwordHash = await hashPassword(newPassword);
    await setUserPassword(normalizedEmail, passwordHash);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('forgot-password reset error', err);
    return NextResponse.json({ error: '重設失敗，請稍後再試一次。' }, { status: 500 });
  }
}
