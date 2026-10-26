import { NextRequest, NextResponse } from 'next/server';
import { SESSION_COOKIE, verifySession, isAdminEmail } from '@/lib/auth';

export const runtime = 'nodejs';

// Anthropic 沒有「剩餘額度」這個API（查過官方文件確認過，Usage/Cost Admin
// API只回報「花了多少」，不回報「帳戶裡還剩多少」——那個數字只存在
// Console的Billing頁面）。這裡退而求其次，查「這個月已經花了多少美金」，
// 用 Cost Report Admin API：https://api.anthropic.com/v1/organizations/cost_report
//
// 這支API不在這個repo安裝的Anthropic SDK裡（舊版SDK沒有對應的方法型別，
// 而且官方文件本來就說Usage/Cost報表只能用raw HTTP呼叫，所有語言的SDK
// 都沒包），所以這裡直接用 fetch 呼叫，不透過 @anthropic-ai/sdk。
//
// 需要的憑證是 ANTHROPIC_ADMIN_API_KEY（sk-ant-admin...），跟一般對話用
// 的 ANTHROPIC_API_KEY 是不同等級、权限更高的金鑰，要到 Anthropic Console
// 的 Settings → Admin API Keys 申請，不會共用現有那組。

interface CostReportResult {
  amount: string;
  currency: string;
}

interface CostReportBucket {
  starting_at: string;
  ending_at: string;
  results: CostReportResult[];
}

interface CostReportResponse {
  data: CostReportBucket[];
  has_more: boolean;
  next_page: string | null;
}

export async function GET(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const email = token ? await verifySession(token) : null;
  if (!email || !isAdminEmail(email)) {
    return NextResponse.json({ error: '沒有權限。' }, { status: 403 });
  }

  const adminKey = process.env.ANTHROPIC_ADMIN_API_KEY;
  if (!adminKey) {
    return NextResponse.json(
      {
        error:
          '尚未設定 ANTHROPIC_ADMIN_API_KEY，還沒開啟費用查詢。這是另一組跟一般對話用的 API Key 不同、權限更高的 Admin 金鑰，要到 Anthropic Console（Settings → Admin API Keys）申請，再到 Vercel 的環境變數加上去。',
      },
      { status: 501 },
    );
  }

  // 本月從 1 號 00:00（UTC）到現在。bucket_width 固定用API文件裡費用報表
  // 唯一支援的 1d，limit 給 31 涵蓋最長的月份，一次就能拿到不用分頁。
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const params = new URLSearchParams({
    starting_at: monthStart.toISOString(),
    ending_at: now.toISOString(),
    bucket_width: '1d',
    limit: '31',
  });

  try {
    const res = await fetch(`https://api.anthropic.com/v1/organizations/cost_report?${params.toString()}`, {
      headers: {
        'anthropic-version': '2023-06-01',
        'x-api-key': adminKey,
      },
      cache: 'no-store',
    });
    const body = (await res.json()) as CostReportResponse | { type?: string; error?: { message?: string } };

    if (!res.ok) {
      console.error('admin cost report error', body);
      const message = 'error' in body && body.error?.message ? body.error.message : `HTTP ${res.status}`;
      return NextResponse.json({ error: `查詢費用失敗（${message}），請確認 Admin API Key 是否有效。` }, { status: 502 });
    }

    const report = body as CostReportResponse;
    let totalCents = 0;
    let currency = 'USD';
    for (const bucket of report.data) {
      for (const result of bucket.results) {
        totalCents += Number(result.amount);
        currency = result.currency || currency;
      }
    }

    return NextResponse.json({
      currency,
      totalUsd: totalCents / 100,
      periodStart: monthStart.toISOString(),
      periodEnd: now.toISOString(),
    });
  } catch (err) {
    console.error('admin cost report fetch error', err);
    return NextResponse.json({ error: '查詢費用失敗，請稍後再試。' }, { status: 502 });
  }
}
