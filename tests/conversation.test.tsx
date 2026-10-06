import React from 'react';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { create, act, type ReactTestRenderer } from 'react-test-renderer';
import Home from '../app/page';
import { NextRequest } from 'next/server';
import { POST } from '../app/api/coach/route';
import { canContinue, FINAL_FEEDBACK, historyLength, MAX_HISTORY_LENGTH, MAX_MESSAGES, validReply, type ChatMessage } from '../lib/conversation';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}
const response = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });
function button(app: ReactTestRenderer, text: string) {
  return app.root.findAllByType('button').find(b => b.children.some(child => child === text))!;
}
async function click(app: ReactTestRenderer, text: string) {
  const target = button(app, text);
  assert.ok(target, `missing button ${text}`);
  assert.ok(!target.props.disabled, `disabled button ${text}`);
  await act(async () => { await target.props.onClick(); });
}
async function input(app: ReactTestRenderer, id: string, value: string) {
  await act(async () => { app.root.findByProps({ id }).props.onChange({ target: { value } }); });
}
async function mount(t: any, fetcher: typeof fetch) {
  const original = globalThis.fetch;
  globalThis.fetch = fetcher;
  let app!: ReactTestRenderer;
  await act(async () => { app = create(<Home />); });
  t.after(async () => {
    await act(async () => { app.unmount(); });
    globalThis.fetch = original;
  });
  return app;
}

test('maximum accepted request plus reply still fits final feedback, including JSON escaping', () => {
  const history: ChatMessage[] = Array.from({ length: 76 }, (_, i) => ({ role: i % 2 ? 'user' : 'assistant', content: '字'.repeat(900) }));
  history[0].role = 'user';
  history[0].content += '字'.repeat(80000 - historyLength(history));
  assert.equal(historyLength(history), 80000);
  assert.ok(canContinue(history));
  const reply = '"'.repeat(7900);
  assert.ok(validReply(reply));
  history.push({ role: 'assistant', content: reply }, { role: 'user', content: FINAL_FEEDBACK });
  assert.ok(history.length <= MAX_MESSAGES);
  assert.ok(historyLength(history) <= MAX_HISTORY_LENGTH);
  assert.ok(!canContinue(history));
  assert.ok(!validReply('"'.repeat(8100)));
  assert.ok(!validReply('字'.repeat(12001)));
  assert.ok(!validReply(' '));
});

for (const kind of ['count', 'length']) {
  test(`conversation bounded by ${kind} preserves all history and retries final feedback`, async t => {
    const requests: { mode: string; messages: ChatMessage[] }[] = [];
    let attempts = 0;
    const app = await mount(t, async (_url, options) => {
      const body = JSON.parse(options!.body as string);
      requests.push(body);
      assert.ok(body.messages.length <= MAX_MESSAGES);
      assert.ok(historyLength(body.messages) <= MAX_HISTORY_LENGTH);
      if (body.messages.at(-1).content === FINAL_FEEDBACK && attempts++ === 0) {
        return response({ error: '模擬暫時錯誤' }, 502);
      }
      return response({ reply: kind === 'length' ? '回'.repeat(11000) : '教練回覆' });
    });
    await input(app, 'case-input', '原始個案不能遺失');
    await click(app, '開始個案分析');
    await click(app, '開始角色扮演');
    for (let turn = 0; turn < 40; turn++) {
      await input(app, 'chat-draft', '追問' + turn);
      if (button(app, '送出').props.disabled) break;
      await click(app, '送出');
    }
    assert.ok(button(app, '送出').props.disabled);
    const beforeFinal = requests.at(-1)!.messages;
    await click(app, '取得總結並結束本次對話');
    assert.ok(button(app, '送出').props.disabled);
    await click(app, '重試');
    assert.deepEqual(requests.at(-1), requests.at(-2));
    assert.deepEqual(requests.at(-1)!.messages.slice(0, -2), beforeFinal);
    assert.equal(requests.at(-1)!.messages[0].content, '原始個案不能遺失');
    assert.equal(requests.at(-1)!.mode, 'roleplay');
    assert.ok(app.root.findByProps({ id: 'chat-draft' }).props.disabled);
    await click(app, '換一個個案');
    assert.equal(app.root.findByProps({ id: 'case-input' }).props.value, '');
  });
}

for (const action of ['switch', 'edit', 'start']) {
  test(`late sample cannot overwrite after ${action}, even if transport ignores abort`, async t => {
    const late = deferred<Response>();
    let signal: AbortSignal | undefined;
    const app = await mount(t, async (url, options) => {
      if (String(url).includes('sample-case')) {
        signal = options!.signal as AbortSignal;
        return late.promise;
      }
      return response({ reply: '已分析手動個案' });
    });
    await input(app, 'case-input', '手動個案');
    let loading!: Promise<void>;
    await act(async () => { loading = button(app, '載入範例個案').props.onClick(); });
    if (action === 'switch') {
      await act(async () => { app.root.findAllByProps({ className: 'module-item ' })[0].props.onClick(); });
    } else if (action === 'edit') {
      await input(app, 'case-input', '新輸入請保留');
    } else {
      await click(app, '開始個案分析');
    }
    assert.ok(signal!.aborted);
    await act(async () => { late.resolve(response({ sampleCase: '舊範例' })); await loading; });
    if (action === 'start') await click(app, '換一個個案');
    assert.equal(app.root.findByProps({ id: 'case-input' }).props.value, action === 'edit' ? '新輸入請保留' : '');
    assert.ok(!button(app, '載入範例個案').props.disabled);
  });
}

test('old completion cannot clear a newer sample request loading state', async t => {
  const old = deferred<Response>(), latest = deferred<Response>();
  let count = 0;
  const app = await mount(t, async () => (++count === 1 ? old.promise : latest.promise));
  let first!: Promise<void>, second!: Promise<void>;
  await act(async () => { first = button(app, '載入範例個案').props.onClick(); });
  await input(app, 'case-input', '取消舊請求');
  await act(async () => { second = button(app, '載入範例個案').props.onClick(); });
  await act(async () => { old.resolve(response({ sampleCase: '舊範例' })); await first; });
  assert.ok(button(app, '載入中…').props.disabled);
  await act(async () => { latest.resolve(response({ sampleCase: '新範例' })); await second; });
  assert.equal(app.root.findByProps({ id: 'case-input' }).props.value, '新範例');
  assert.ok(!button(app, '載入範例個案').props.disabled);
});

test('server rejects over-limit histories before calling AI', async () => {
  const body = { moduleId: 'need-analysis', mode: 'case', messages: Array.from({ length: 81 }, () => ({ role: 'user', content: '測試' })) };
  const send = () => POST(new NextRequest('http://localhost/api/coach', { method: 'POST', body: JSON.stringify(body) }));
  assert.equal((await send()).status, 400);
  body.messages = Array.from({ length: 10 }, () => ({ role: 'user', content: '字'.repeat(11000) }));
  assert.equal((await send()).status, 413);
});

test('failed roleplay transitions retry the original mode and update the badge only on success', async t => {
  const requests: any[] = [];
  const failures = new Set<string>();
  const app = await mount(t, async (_url, options) => {
    const body = JSON.parse(options!.body as string);
    requests.push(body);
    const text = body.messages.at(-1).content;
    if ((text.startsWith('開始角色扮演') || text.startsWith('結束對練')) && !failures.has(text)) {
      failures.add(text);
      return response({ error: '模擬失敗' }, 502);
    }
    return response({ reply: '成功回覆' });
  });
  await input(app, 'case-input', '測試個案');
  await click(app, '開始個案分析');
  await click(app, '開始角色扮演');
  assert.equal(app.root.findByProps({ className: 'mode-badge' }).children[0], '個案分析');
  await click(app, '重試');
  assert.deepEqual(requests.at(-1), requests.at(-2));
  assert.equal(app.root.findByProps({ className: 'mode-badge' }).children[0], '角色扮演中');
  await click(app, '結束對練並取得講評');
  await click(app, '重試');
  assert.deepEqual(requests.at(-1), requests.at(-2));
  assert.equal(app.root.findByProps({ className: 'mode-badge' }).children[0], '個案分析');
  assert.ok(!app.root.findByProps({ id: 'chat-draft' }).props.disabled);
});
