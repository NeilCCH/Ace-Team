/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // 開啟 Next.js 內建的安全性自動升級通知／代理，收到已知安全漏洞公告時
  // 會在 build 階段提醒（見這次升級本身就是被這個機制觸發的）。
  experimental: {
    agentUpgrade: 'security',
  },
};

export default nextConfig;
