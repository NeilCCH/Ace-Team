import fs from 'node:fs';
import path from 'node:path';
import { MODULES } from './modules';

const CONTENT_ROOT = path.join(process.cwd(), 'content', 'modules');

export type CoachMode = 'case' | 'roleplay';

function readContentFile(moduleId: string, fileName: string): string {
  const filePath = path.join(CONTENT_ROOT, moduleId, fileName);
  return fs.readFileSync(filePath, 'utf-8');
}

export function readSampleCase(moduleId: string): string {
  return readContentFile(moduleId, 'sample-case.md');
}

export function buildSystemPrompt(moduleId: string, mode: CoachMode): string {
  const skill = readContentFile(moduleId, 'skill.md');
  const framework = readContentFile(moduleId, 'framework.md');

  // 讓教練熟悉整個 S 線其他階段的框架卡，避免對話自然帶到下一階段內容時
  // 只能拒答——但診斷、評分、判斷是否完成這個階段，一律只依上面這個模組
  // 自己的框架卡與技能設定為準，不能用這份參考資料取代其他模組的完整陪練。
  const otherModules = MODULES.filter((m) => m.id !== moduleId && m.enabled);
  const crossModuleRef = otherModules.length
    ? [
        '# 其他模組參考資料（跨模組知識，僅供你理解整個銷售流程的上下文）',
        '你現在陪練的是上面這個模組，分析、診斷、給評分、判斷這個階段是否完成，一律只依上面的「教練技能設定」與「框架卡」為準。',
        '下面是業務流程其他階段的框架卡，提供給你參考，讓你在業務員的對話自然帶到其他階段內容時，能給出正確、有依據的簡短回應或銜接建議，而不是因為超出範圍就拒答。',
        '但不要用這些參考資料去取代、或搶著做屬於其他模組的完整診斷——那種情況仍然要提醒業務員，這段內容建議切換到對應模組，才能得到完整的陪練。',
        ...otherModules.map((m) => `## ${m.name}\n\n${readContentFile(m.id, 'framework.md')}`),
      ].join('\n\n')
    : '';

  const modeNote =
    mode === 'roleplay'
      ? '目前模式：角色扮演對練。請依 SKILL 設定中的「角色扮演模式」規則，切換成扮演客戶本人回應業務員，不要用教練身份說話，直到業務員明確要求結束對練，才依五步骨架給評分與回饋。'
      : '目前模式：個案分析陪練。請依 SKILL 設定中的通用五步骨架，逐步分析業務員貼上的個案。';

  return [
    '# 教練技能設定（skill.md）',
    skill,
    '# 框架卡（framework.md）',
    framework,
    crossModuleRef,
    `# 目前對練模式\n\n${modeNote}`,
  ].filter(Boolean).join('\n\n---\n\n');
}
