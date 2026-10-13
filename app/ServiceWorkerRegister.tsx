'use client';

import { useEffect } from 'react';

export default function ServiceWorkerRegister() {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        // PWA 離線快取是加分功能，註冊失敗不影響網站正常使用
      });
    }
  }, []);

  return null;
}
