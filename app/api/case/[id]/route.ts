import { NextRequest, NextResponse } from 'next/server';
import { SESSION_COOKIE, verifySession } from '@/lib/auth';
import { getCaseById, getCaseMessages } from '@/lib/db';

export const runtime = 'nodejs';

// 中斷後再繼續：讀回個案的模組／訓練線跟完整歷史訊息，讓前端重建對話畫面。
// 只有個案本人能讀，不看 status——進行中或已完成都能回頭看，但前端目前只
// 會對「進行中」的個案顯示「繼續」按鈕。
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const userEmail = token ? await verifySession(token) : null;
  if (!userEmail) {
    return NextResponse.json({ error: '請先登入。' }, { status: 401 });
  }

  const { id } = await params;
  const caseId = Number(id);
  if (!Number.isInteger(caseId)) {
    return NextResponse.json({ error: '個案編號無效。' }, { status: 400 });
  }

  try {
    const record = await getCaseById(caseId);
    if (!record) {
      return NextResponse.json({ error: '找不到這個個案。' }, { status: 404 });
    }
    if (record.user_email !== userEmail) {
      return NextResponse.json({ error: '無權查看這個個案。' }, { status: 403 });
    }
    const messages = await getCaseMessages(caseId);
    return NextResponse.json({
      id: record.id,
      moduleId: record.module_id,
      line: record.line,
      status: record.status,
      messages,
    });
  } catch (err) {
    console.error('case detail api error', err);
    return NextResponse.json({ error: '個案資料讀取失敗，請確認資料庫已設定。' }, { status: 500 });
  }
}
