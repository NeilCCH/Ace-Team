import type { Metadata, Viewport } from 'next';
import './globals.css';
import ServiceWorkerRegister from './ServiceWorkerRegister';

export const metadata: Metadata = {
  title: '銷售 AI 教練',
  description: '個案分析陪練系統',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: '銷售AI教練',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#0f4c5c',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-Hant">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        {children}
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
