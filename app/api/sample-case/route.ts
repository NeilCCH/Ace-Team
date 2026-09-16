import { NextRequest, NextResponse } from 'next/server';
import { readSampleCase } from '@/lib/systemPrompt';
import { getModule } from '@/lib/modules';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const moduleId = req.nextUrl.searchParams.get('moduleId') ?? '';
  const module = getModule(moduleId);
  if (!module || !module.enabled) {
    return NextResponse.json({ error: '這個模組還沒有範例個案。' }, { status: 400 });
  }

  try {
    const sampleCase = readSampleCase(moduleId);
    return NextResponse.json({ sampleCase });
  } catch (err) {
    console.error('sample-case api error', err);
    return NextResponse.json({ error: '讀取範例個案失敗。' }, { status: 500 });
  }
}
