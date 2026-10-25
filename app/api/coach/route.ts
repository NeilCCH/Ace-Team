import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { buildSystemPrompt, CoachMode } from '@/lib/systemPrompt';
import { getModule } from '@/lib/modules';
import { SESSION_COOKIE, verifySession } from '@/lib/auth';
import { appendMessage, completeCase, createCase, getCaseOwner, recordApiUsage } from '@/lib/db';

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

// 目前只支援圖片附件（拍紙本資料最常見的情境）。PDF/文件附件需要較新版本的
// Anthropic SDK（這個repo目前是0.32.1，還沒有document content block的型別），
// 之後真的有需求再評估升級SDK、加回文件支援。
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const MAX_ATTACHMENTS_PER_MESSAGE = 4;
// base64 解碼後的位元組數上限；對應前端 5MB 的原始檔案上限，留一點餘裕。
const MAX_ATTACHMENT_BYTES = 7 * 1024 * 1024;
// 有附件的請求，JSON payload 可能輕易超過純文字對話的大小，拉高上限。
const MAX_PAYLOAD_BYTES = 20 * 1024 * 1024;

interface Attachment {
  name: string;
  mediaType: string;
  data: string;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  attachments?: Attachment[];
}

function base64ByteLength(b64: string): number {
  const clean = b64.replace(/=+$/, '');
  return Math.floor((clean.length * 3) / 4);
}

function isValidAttachment(a: unknown): a is Attachment {
  if (!a || typeof a !== 'object') return false;
  const { name, mediaType, data } = a as Record<string, unknown>;
  if (typeof name !== 'string' || typeof mediaType !== 'string' || typeof data !== 'string') return false;
  if (!ALLOWED_IMAGE_TYPES.includes(mediaType)) return false;
  if (!/^[A-Za-z0-9+/]+=*$/.test(data) || data.length === 0) return false;
  if (base64ByteLength(data) > MAX_ATTACHMENT_BYTES) return false;
  return true;
}

function isValidMessage(message: unknown): message is ChatMessage {
  if (!message || typeof message !== 'object') return false;
  const m = message as ChatMessage;
  if (m.role !== 'user' && m.role !== 'assistant') return false;
  if (typeof m.content !== 'string' || m.content.length > 12000) return false;
  if (m.attachments !== undefined) {
    if (!Array.isArray(m.attachments) || m.attachments.length > MAX_ATTACHMENTS_PER_MESSAGE) return false;
    if (!m.attachments.every(isValidAttachment)) return false;
  }
  // 純文字訊息仍要求非空白；帶附件時允許只有圖片、沒有文字說明。
  if (m.content.trim().length === 0 && (!m.attachments || m.attachments.length === 0)) return false;
  return true;
}

type UserContentBlock = Anthropic.ImageBlockParam | Anthropic.TextBlockParam;

function toAnthropicContent(message: ChatMessage): string | UserContentBlock[] {
  if (!message.attachments || message.attachments.length === 0) return message.content;
  const blocks: UserContentBlock[] = message.attachments.map((a) => ({
    type: 'image',
    source: { type: 'base64', media_type: a.mediaType as 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif', data: a.data },
  }));
  if (message.content.trim()) blocks.push({ type: 'text', text: message.content });
  return blocks;
}

// 附件本身的 base64 內容不存進資料庫（避免資料庫被圖片塞爆），只記錄檔名提示。
function toPersistedText(message: ChatMessage): string {
  const names = (message.attachments ?? []).map((a) => a.name).join('、');
  if (!message.content.trim()) return names ? `[附件：${names}]` : '';
  return names ? `${message.content}\n[附件：${names}]` : message.content;
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
  if (
    !messages.every(isValidMessage) ||
    (messages[0] as ChatMessage).role !== 'user' ||
    (messages[messages.length - 1] as ChatMessage).role !== 'user'
  ) {
    return NextResponse.json({ error: '對話格式、內容長度或附件格式無效。' }, { status: 400 });
  }
  if (Buffer.byteLength(JSON.stringify(messages), 'utf-8') > MAX_PAYLOAD_BYTES) {
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
  const typedMessages = messages as ChatMessage[];
  const lastUserMessage = typedMessages[typedMessages.length - 1];

  try {
    const response = await anthropic.messages.create({
      model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-5',
      // claude-sonnet-5 思考預設是開著的（adaptive，這個舊版SDK型別裡還沒有
      // thinking 參數可以關掉），思考本身也算在 max_tokens 裡——2000太低，
      // 思考一吃掉大半預算，正式回覆文字就被截斷甚至整段是空的。拉高到
      // 8192 留足夠空間給思考＋實際回覆。
      max_tokens: 8192,
      system,
      messages: typedMessages.map((m) => ({ role: m.role, content: toAnthropicContent(m) })),
    });

    // 用量記錄：不管這次回覆最後是不是空的，token 都已經花掉了，所以在
    // 空回覆判斷之前就記，管理後台看到的用量才跟實際API花費一致。寫入
    // 失敗不影響教練回覆，只記錯誤。
    if (userEmail) {
      try {
        await recordApiUsage(userEmail, moduleId, response.usage.input_tokens, response.usage.output_tokens);
      } catch (usageErr) {
        console.error('api usage logging error', usageErr);
      }
    }

    const reply = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('\n');

    // 空回覆不要悄悄回傳——前端收到空字串會直接不渲染任何文字，畫面上只
    // 剩下按鈕，看起來像壞掉。明確回報成錯誤，讓使用者看得到「重試」。
    if (!reply.trim()) {
      console.error('coach api empty reply', { stop_reason: response.stop_reason, model: response.model });
      return NextResponse.json({ error: 'AI 教練沒有產生回覆內容，請重試一次。' }, { status: 502 });
    }

    // 個案記錄是加分功能，寫入失敗不能讓教練回覆跟著失敗——錯誤只記錄，不拋出。
    let effectiveCaseId = caseId;
    if (userEmail) {
      try {
        const persistedText = toPersistedText(lastUserMessage);
        if (effectiveCaseId === null) {
          const created = await createCase(userEmail, moduleId, module.line, persistedText);
          effectiveCaseId = created.id;
        } else {
          await appendMessage(effectiveCaseId, 'user', persistedText);
        }
        await appendMessage(effectiveCaseId, 'assistant', reply);
        if (lastUserMessage.content.startsWith(FINISH_MESSAGE_PREFIX)) {
          await completeCase(effectiveCaseId, extractScore(reply), persistedText.slice(0, 200));
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
