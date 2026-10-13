export type CoachLine = 'S' | 'R' | 'M';

export interface CoachModule {
  id: string;
  line: CoachLine;
  name: string;
  tagline: string;
  enabled: boolean;
}

export const LINES: { id: CoachLine; name: string }[] = [
  { id: 'S', name: '銷售' },
  { id: 'R', name: '增員' },
  { id: 'M', name: '輔導' },
];

export const MODULES: CoachModule[] = [
  {
    id: 'prospecting-appointment',
    line: 'S',
    name: '主顧開拓 與 電話約訪',
    tagline: 'S1–S2 從名單到約到見面，定聯與電話約訪話術',
    enabled: true,
  },
  {
    id: 'need-analysis',
    line: 'S',
    name: '需求分析・找痛點',
    tagline: 'S3–S4 初步面談到發掘需求，帶你找到客戶的痛點切入點',
    enabled: true,
  },
  {
    id: 'proposal-presentation',
    line: 'S',
    name: '說明建議書',
    tagline: 'S5 緊扣痛點的生活化描述與敲年期敲額度',
    enabled: true,
  },
  {
    id: 'closing-referral',
    line: 'S',
    name: '成交與轉介',
    tagline: 'S6 反對問題處理、激勵成交、要求轉介',
    enabled: true,
  },
  {
    id: 'recruit-list-contact',
    line: 'R',
    name: '取得準增名單 與 接觸準增',
    tagline: 'R1–R2 名單來源健康度、工作溫度計 25 題、信任恆等式',
    enabled: true,
  },
  {
    id: 'recruit-first-interview',
    line: 'R',
    name: '一次面談・發掘需求',
    tagline: 'R3 判斷推力，飛機話術、1998、人牛馬狗老虎話術',
    enabled: true,
  },
  {
    id: 'recruit-second-interview',
    line: 'R',
    name: '二次面談・說明事業',
    tagline: 'R4 創造拉力，百元話術、邀約新人班、不被商品框架',
    enabled: true,
  },
  {
    id: 'recruit-decision-onboarding',
    line: 'R',
    name: '決定聘用 與 新人報聘',
    tagline: 'R5–R6 380 話術／20分鐘OPP、同業增員主戰場、報聘流程',
    enabled: true,
  },
  {
    id: 'team-coaching-cross-line',
    line: 'M',
    name: '輔導十字線',
    tagline: '判斷團隊夥伴所在象限，給出對應的輔導方式',
    enabled: true,
  },
];

export function getModule(id: string): CoachModule | undefined {
  return MODULES.find((m) => m.id === id);
}

export function modulesForLine(line: CoachLine): CoachModule[] {
  return MODULES.filter((m) => m.line === line);
}
