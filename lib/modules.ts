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
    id: 'prospecting',
    name: '主顧開拓',
    tagline: '教材整理中，敬請期待',
    enabled: false,
  },
  {
    id: 'appointment',
    name: '電話約訪',
    tagline: '教材整理中，敬請期待',
    enabled: false,
  },
];

export function getModule(id: string): CoachModule | undefined {
  return MODULES.find((m) => m.id === id);
}
