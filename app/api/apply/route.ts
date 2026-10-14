import { NextRequest, NextResponse } from 'next/server';
import { isAdminEmail } from '@/lib/auth';
import { applyForAccount } from '@/lib/db';
import { hashPassword, isValidPassword } from '@/lib/password';

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
  const { email, name, note, password, securityQuestion, securityAnswer } = body as Record<string, unknown>;
  if (typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
    return NextResponse.json({ error: '請輸入有效的 Email。' }, { status: 400 });
  }
  if (name !== undefined && (typeof name !== 'string' || name.length > 100)) {
    return NextResponse.json({ error: '姓名格式無效。' }, { status: 400 });
  }
  if (note !== undefined && (typeof note !== 'string' || note.length > 500)) {
    return NextResponse.json({ error: '備註太長。' }, { status: 400 });
  }
  if (!isValidPassword(password)) {
    return NextResponse.json({ error: '密碼至少需要 8 個字元。' }, { status: 400 });
  }
  if (typeof securityQuestion !== 'string' || !securityQuestion.trim() || securityQuestion.length > 200) {
    return NextResponse.json({ error: '請選擇或輸入一個安全問題。' }, { status: 400 });
  }
  if (typeof securityAnswer !== 'string' || !securityAnswer.trim() || securityAnswer.length > 200) {
    return NextResponse.json({ error: '請輸入安全問題的答案。' }, { status: 400 });
  }

  const normalizedEmail = email.trim().toLowerCase();
  if (isAdminEmail(normalizedEmail)) {
    return NextResponse.json({ status: 'approved', message: '這個帳號已經是管理員，可以直接登入，不用在這裡申請。' });
  }

  try {
    const passwordHash = await hashPassword(password);
    // 答案忽略大小寫與前後空白，避免使用者忘記密碼時因為大小寫不同而卡住。
    const securityAnswerHash = await hashPassword(securityAnswer.trim().toLowerCase());
    const account = await applyForAccount(
      normalizedEmail,
      typeof name === 'string' && name.trim() ? name.trim() : null,
      typeof note === 'string' && note.trim() ? note.trim() : null,
      passwordHash,
      securityQuestion.trim(),
      securityAnswerHash,
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
