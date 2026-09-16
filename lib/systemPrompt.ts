import fs from 'node:fs';
import path from 'node:path';

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

  const modeNote =
    mode === 'roleplay'
      ? '目前模式：角色扮演對練。請依 SKILL 設定中的「角色扮演模式」規則，切換成扮演客戶本人回應業務員，不要用教練身份說話，直到業務員明確要求結束對練，才依五步骨架給評分與回饋。'
      : '目前模式：個案分析陪練。請依 SKILL 設定中的通用五步骨架，逐步分析業務員貼上的個案。';

  return [
    '# 教練技能設定（skill.md）',
    skill,
    '# 框架卡（framework.md）',
    framework,
    `# 目前對練模式\n\n${modeNote}`,
  ].join('\n\n---\n\n');
}
