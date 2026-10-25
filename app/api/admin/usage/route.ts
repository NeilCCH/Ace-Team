import { NextRequest, NextResponse } from 'next/server';
import { SESSION_COOKIE, verifySession, isAdminEmail } from '@/lib/auth';
import { getApiUsageByUser } from '@/lib/db';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const email = token ? await verifySession(token) : null;
  if (!email || !isAdminEmail(email)) {
    return NextResponse.json({ error: '沒有權限。' }, { status: 403 });
  }

  try {
    const usage = await getApiUsageByUser();
    return NextResponse.json({ usage });
  } catch (err) {
    console.error('admin usage api error', err);
    return NextResponse.json({ error: '讀取失敗，請確認資料庫已設定。' }, { status: 500 });
  }
}
