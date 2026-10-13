import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: '銷售 AI 教練',
    short_name: '銷售AI教練',
    description: '個案分析陪練系統',
    start_url: '/',
    display: 'standalone',
    background_color: '#f6f5f2',
    theme_color: '#0f4c5c',
    lang: 'zh-Hant',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icon-maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
