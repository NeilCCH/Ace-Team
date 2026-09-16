import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { buildSystemPrompt, CoachMode } from '@/lib/systemPrompt';
import { getModule } from '@/lib/modules';

export const runtime = 'nodejs';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface CoachRequestBody {
  moduleId: string;
  mode: CoachMode;
  messages: ChatMessage[];
}

export async function POST(req: NextRequest) {
  const body = (await req.json()) as CoachRequestBody;
  const { moduleId, mode, messages } = body;

  const module = getModule(moduleId);
  if (!module || !module.enabled) {
    return NextResponse.json({ error: '這個模組還沒有教材，敬請期待。' }, { status: 400 });
  }
  if (!Array.isArray(messages) || messages.length === 0) {
    return NextResponse.json({ error: '缺少對話內容。' }, { status: 400 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: '伺服器尚未設定 ANTHROPIC_API_KEY，請參考 README 設定後再試一次。' },
      { status: 500 },
    );
  }

  const anthropic = new Anthropic({ apiKey });
  const system = buildSystemPrompt(moduleId, mode);

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
