import { NextRequest, NextResponse } from 'next/server';
import { SESSION_COOKIE, verifySession } from '@/lib/auth';
import { setSecurityQuestion } from '@/lib/db';
import { hashPassword } from '@/lib/password';

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
  const { question, answer } = (body ?? {}) as Record<string, unknown>;
  if (typeof question !== 'string' || !question.trim() || question.length > 200) {
    return NextResponse.json({ error: '請選擇或輸入一個安全問題。' }, { status: 400 });
  }
  if (typeof answer !== 'string' || !answer.trim() || answer.length > 200) {
    return NextResponse.json({ error: '請輸入安全問題的答案。' }, { status: 400 });
  }

  try {
    const answerHash = await hashPassword(answer.trim().toLowerCase());
    await setSecurityQuestion(email, question.trim(), answerHash);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('set security question error', err);
    return NextResponse.json({ error: '更新失敗，請稍後再試一次。' }, { status: 500 });
  }
}
