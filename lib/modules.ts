export interface CoachModule {
  id: string;
  name: string;
  tagline: string;
  enabled: boolean;
}

export const MODULES: CoachModule[] = [
  {
    id: 'need-analysis',
    name: '需求分析・找痛點',
    tagline: 'S3–S4 初步面談到發掘需求，帶你找到客戶的痛點切入點',
    enabled: true,
  },
  {
    id: 'prospecting-appointment',
    name: '主顧開拓與電話約訪',
    tagline: 'S1–S2 從名單到約到見面，定聯與電話約訪話術',
    enabled: true,
  },
  {
    id: 'proposal-presentation',
    name: '說明建議書',
    tagline: 'S5 緊扣痛點的生活化描述與敲年期敲額度',
    enabled: true,
  },
  {
    id: 'closing-referral',
    name: '成交與轉介',
    tagline: 'S6 反對問題處理、激勵成交、要求轉介',
    enabled: true,
  },
];

export function getModule(id: string): CoachModule | undefined {
  return MODULES.find((m) => m.id === id);
}
