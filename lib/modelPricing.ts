// Anthropic 官方定價，查證於 2026-10-06（透過 claude-api 技能確認，不是
// 憑記憶寫的）。單位是每百萬 token 的美金價格，只列這個專案可能用到的
// 現行模型。
//
// 這裡是唯一需要手動更新的地方：如果之後改了 ANTHROPIC_MODEL 環境變數
// 指到一個不在這張表裡的模型（新模型、或官方調整了現有模型的價格），
// estimateCostUsd() 會回傳 null，後台顯示「—」而不是算出錯誤的金額
// 誤導人——發現顯示「—」時，就是該回來更新這張表了。
export const MODEL_PRICING: Record<string, { inputPerMillion: number; outputPerMillion: number }> = {
  'claude-fable-5-1': { inputPerMillion: 10.0, outputPerMillion: 50.0 },
  'claude-mythos-5-1': { inputPerMillion: 10.0, outputPerMillion: 50.0 },
  'claude-fable-5': { inputPerMillion: 10.0, outputPerMillion: 50.0 },
  'claude-opus-5-5': { inputPerMillion: 4.0, outputPerMillion: 20.0 },
  'claude-opus-5': { inputPerMillion: 5.0, outputPerMillion: 25.0 },
  'claude-opus-4-8': { inputPerMillion: 5.0, outputPerMillion: 25.0 },
  'claude-opus-4-7': { inputPerMillion: 5.0, outputPerMillion: 25.0 },
  'claude-opus-4-6': { inputPerMillion: 5.0, outputPerMillion: 25.0 },
  'claude-sonnet-5-5': { inputPerMillion: 2.0, outputPerMillion: 10.0 },
  'claude-sonnet-5': { inputPerMillion: 2.0, outputPerMillion: 10.0 },
  'claude-sonnet-4-6': { inputPerMillion: 3.0, outputPerMillion: 15.0 },
  'claude-haiku-5-5': { inputPerMillion: 0.1, outputPerMillion: 0.5 },
  'claude-haiku-4-5': { inputPerMillion: 1.0, outputPerMillion: 5.0 },
};

export function estimateCostUsd(model: string, inputTokens: number, outputTokens: number): number | null {
  const pricing = MODEL_PRICING[model];
  if (!pricing) return null;
  return (inputTokens / 1_000_000) * pricing.inputPerMillion + (outputTokens / 1_000_000) * pricing.outputPerMillion;
}
