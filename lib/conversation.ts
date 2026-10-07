export type ChatMessage = { role: 'user' | 'assistant'; content: string };

export const MAX_MESSAGES = 80;
export const MAX_HISTORY_LENGTH = 100000;
export const MAX_MESSAGE_LENGTH = 12000;
export const MAX_REPLY_JSON_LENGTH = 16000;
// Leave room for one bounded assistant reply and the final feedback request.
export const CONTINUE_MESSAGES = 76;
export const CONTINUE_LENGTH = 80000;
export const FINAL_FEEDBACK = '結束對練並取得講評。請停止扮演客戶，依完整對話整理本次重點、具體評分、做得好的地方及下一步建議；未演練的項目請標示未評分。';

export function historyLength(messages: ChatMessage[]): number {
  return JSON.stringify(messages.map(({ role, content }) => ({ role, content }))).length;
}

export function canContinue(messages: ChatMessage[]): boolean {
  return messages.length <= CONTINUE_MESSAGES && historyLength(messages) <= CONTINUE_LENGTH;
}

export function validReply(reply: string): boolean {
  return reply.trim().length > 0 && reply.length <= MAX_MESSAGE_LENGTH &&
    JSON.stringify({ role: 'assistant', content: reply }).length <= MAX_REPLY_JSON_LENGTH;
}
