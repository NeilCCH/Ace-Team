# 銷售 AI 教練（Sales AI Coach）

公勝保經高雄業務中心的業務教練 APP。業務員貼上客戶個案（CN 客戶需求表／面談紀錄），
AI 教練依方法論框架逐步診斷、給出下一步話術建議，也可以角色扮演對練。

這個專案是從「Claude Code 技能」起步包（貼在對話裡用的 SKILL.md）長成一個真正的
網頁 APP：同一套方法論內容，改成後端呼叫 Claude API，前端做成聊天介面，之後可以
直接部署給整個業務中心用，也可以再包裝成手機 APP（PWA）。

## 目前範圍（MVP）

只做一個模組：**需求分析・找痛點**（S3–S4 初步面談到發掘需求）。其他模組
（主顧開拓、電話約訪…）先在介面上留位置、顯示「教材整理中」，等這個模組校準
穩定後，比照同樣的資料結構擴充即可，不用改架構。

## 架構

- **前端＋後端**：Next.js（App Router + TypeScript），可直接部署到 Vercel。
- **AI**：後端 API route（`app/api/coach/route.ts`）呼叫 Anthropic Claude API，
  用你自己的 API Key，回應即時串接回聊天畫面。
- **教練的「知識」放在檔案裡，不是寫死在程式碼裡**：
  `content/modules/<模組>/skill.md`（教練規則）＋ `framework.md`（方法論框架卡）
  ＋ `sample-case.md`（測試用範例個案）。要調校教練的口吻或深度，改這幾份
  Markdown 就好，不用碰程式。
- 新增模組＝在 `content/modules/` 底下新增一個資料夾，放同樣三份檔案，再到
  `lib/modules.ts` 把它標成 `enabled: true`。

```
content/modules/need-analysis/
├── skill.md          教練規則（原 SKILL.md）
├── framework.md       方法論框架卡
└── sample-case.md     測試用範例個案
```

## 本機執行

1. 安裝套件：
   ```bash
   npm install
   ```
2. 複製 `.env.example` 為 `.env.local`，填入你的 Anthropic API Key
   （到 https://console.anthropic.com 申請）：
   ```bash
   cp .env.example .env.local
   ```
3. 啟動：
   ```bash
   npm run dev
   ```
   打開 http://localhost:3000。

## 部署（之後給團隊用）

最簡單的方式是把這個 repo 接到 [Vercel](https://vercel.com)（GitHub 登入、
選這個 repo、在專案設定填 `ANTHROPIC_API_KEY` 環境變數即可，會自動建置部署）。
部署後同事打開網址就能用，之後要包成手機 APP，也可以先用「加入主畫面」
（PWA）的方式，不用重寫。

## 目前故意先不做的事（下一步再考慮）

- **多人帳號／權限**：現在沒有登入機制，誰有網址就能用，也共用同一支 API Key
  的額度。給整個業務中心用之前，建議至少加一層簡單密碼或帳號。
- **對話紀錄保存**：目前對話只存在瀏覽器當下畫面，重新整理就消失。之後若要
  累積「售後反饋」讓教練越校越準，需要接資料庫。
- **串流回覆**：現在是等教練整段回覆完才顯示，之後可以改成逐字顯示（體感更快）。

## 這次的教練規則來源

`content/modules/need-analysis/` 底下的內容，來自上傳的
`sales-coach-starter` 起步包，直接沿用其中的技能定義、框架卡與範例個案，
沒有更動方法論本身。
