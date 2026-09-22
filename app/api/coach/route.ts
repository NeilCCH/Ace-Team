import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { buildSystemPrompt, CoachMode } from '@/lib/systemPrompt';
import { getModule } from '@/lib/modules';

export const runtime = 'nodejs';

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
  const { moduleId, mode, messages } = body as Record<string, unknown>;
  if (typeof moduleId !== 'string' || (mode !== 'case' && mode !== 'roleplay')) {
    return NextResponse.json({ error: '模組或模式無效。' }, { status: 400 });
  }

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

  const anthropic = new Anthropic({ apiKey });
  const system = buildSystemPrompt(moduleId, mode as CoachMode);

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

    return NextResponse.json({ reply });
  } catch (err) {
    console.error('coach api error', err);
    return NextResponse.json({ error: 'AI 教練暫時無法回應，請稍後再試一次。' }, { status: 502 });
  }
}
