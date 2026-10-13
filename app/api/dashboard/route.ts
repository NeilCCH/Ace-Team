import { NextRequest, NextResponse } from 'next/server';
import { SESSION_COOKIE, verifySession } from '@/lib/auth';
import { getDashboardStats } from '@/lib/db';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const userEmail = token ? await verifySession(token) : null;
  if (!userEmail) {
    return NextResponse.json({ error: '請先登入。' }, { status: 401 });
  }

  try {
    const stats = await getDashboardStats(userEmail);
    return NextResponse.json(stats);
  } catch (err) {
    console.error('dashboard api error', err);
    return NextResponse.json({ error: '儀表板資料讀取失敗，請確認資料庫已設定。' }, { status: 500 });
  }
}
