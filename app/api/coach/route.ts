import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { buildSystemPrompt, CoachMode } from '@/lib/systemPrompt';
import { getModule } from '@/lib/modules';
import { SESSION_COOKIE, verifySession } from '@/lib/auth';
import { appendMessage, completeCase, createCase, getCaseOwner } from '@/lib/db';

export const runtime = 'nodejs';

// 結束對練的訊息內容是 ChatApp.tsx 固定送出的那句話（見 finishRoleplay()），
// 用它判斷這一輪回覆是不是這個個案的講評，藉此觸發分數擷取與個案結案。
const FINISH_MESSAGE_PREFIX = '結束對練並取得講評';

// 評分擷取是盡力而為：掃描教練回覆裡「數字+分」的片段取平均，不是真的結構化
// 評分協議（跟 skill.md 要求教練用自然語言給分的現況相符）。抓不到分數時
// score 留 null，不影響個案照常標記為已完成。
function extractScore(reply: string): number | null {
  const matches = [...reply.matchAll(/(\d{1,3})\s*分/g)]
    .map((m) => Number(m[1]))
    .filter((n) => n >= 0 && n <= 100);
  if (matches.length === 0) return null;
  return Math.round(matches.reduce((sum, n) => sum + n, 0) / matches.length);
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: '請提供有效的 JSON。' }, { status: 400 });
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return NextResponse.json({ error: '請提供有效的請求內容。' }, { status: 400 });
  }
  const { moduleId, mode, messages, caseId: rawCaseId } = body as Record<string, unknown>;
  if (typeof moduleId !== 'string' || (mode !== 'case' && mode !== 'roleplay')) {
    return NextResponse.json({ error: '模組或模式無效。' }, { status: 400 });
  }
  const caseId = typeof rawCaseId === 'number' && Number.isInteger(rawCaseId) ? rawCaseId : null;

  const module = getModule(moduleId);
  if (!module || !module.enabled) {
    return NextResponse.json({ error: '這個模組還沒有教材，敬請期待。' }, { status: 400 });
  }
  if (!Array.isArray(messages) || messages.length === 0 || messages.length > 80) {
    return NextResponse.json({ error: '缺少對話內容。' }, { status: 400 });
  }
  if (!messages.every((message: unknown) =>
    message && typeof message === 'object' &&
    ((message as ChatMessage).role === 'user' || (message as ChatMessage).role === 'assistant') &&
    typeof (message as ChatMessage).content === 'string' &&
    (message as ChatMessage).content.trim().length > 0 &&
    (message as ChatMessage).content.length <= 12000
  ) || messages[0].role !== 'user' || messages[messages.length - 1].role !== 'user') {
    return NextResponse.json({ error: '對話格式或內容長度無效。' }, { status: 400 });
  }
  if (JSON.stringify(messages).length > 100000) {
    return NextResponse.json({ error: '對話內容過長。' }, { status: 413 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: '伺服器尚未設定 ANTHROPIC_API_KEY，請參考 README 設定後再試一次。' },
      { status: 500 },
    );
  }

  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const userEmail = token ? await verifySession(token) : null;

  // 個案若帶了 caseId，確認是同一位登入者的個案才允許續寫，避免有人猜別人的
  // caseId 把訊息寫進別人的紀錄裡。
  if (caseId !== null && userEmail) {
    const owner = await getCaseOwner(caseId).catch(() => null);
    if (owner !== null && owner !== userEmail) {
      return NextResponse.json({ error: '個案不存在或無權存取。' }, { status: 403 });
    }
  }

  const anthropic = new Anthropic({ apiKey });
  const system = buildSystemPrompt(moduleId, mode as CoachMode);
  const lastUserMessage = messages[messages.length - 1] as ChatMessage;

  try {
    const response = await anthropic.messages.create({
      model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-5',
      max_tokens: 2000,
      system,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
    });

    const reply = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('\n');

    // 個案記錄是加分功能，寫入失敗不能讓教練回覆跟著失敗——錯誤只記錄，不拋出。
    let effectiveCaseId = caseId;
    if (userEmail) {
      try {
        if (effectiveCaseId === null) {
          const created = await createCase(userEmail, moduleId, module.line, lastUserMessage.content);
          effectiveCaseId = created.id;
        } else {
          await appendMessage(effectiveCaseId, 'user', lastUserMessage.content);
        }
        await appendMessage(effectiveCaseId, 'assistant', reply);
        if (lastUserMessage.content.startsWith(FINISH_MESSAGE_PREFIX)) {
          await completeCase(effectiveCaseId, extractScore(reply), lastUserMessage.content.slice(0, 200));
        }
      } catch (dbErr) {
        console.error('case persistence error', dbErr);
      }
    }

    return NextResponse.json({ reply, caseId: effectiveCaseId });
  } catch (err) {
    console.error('coach api error', err);
    return NextResponse.json({ error: 'AI 教練暫時無法回應，請稍後再試一次。' }, { status: 502 });
  }
}
