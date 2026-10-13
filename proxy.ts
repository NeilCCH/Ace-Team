import { NextRequest, NextResponse } from 'next/server';
import { SESSION_COOKIE, verifySession } from '@/lib/auth';

export async function proxy(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const email = token ? await verifySession(token) : null;
  if (email) return NextResponse.next();

  if (req.nextUrl.pathname.startsWith('/api/')) {
    return NextResponse.json({ error: '請先登入。' }, { status: 401 });
  }
  const loginUrl = new URL('/login', req.url);
  loginUrl.searchParams.set('next', req.nextUrl.pathname);
  return NextResponse.redirect(loginUrl);
}

// 瀏覽器／OS 在使用者登入前就會去抓 manifest 與圖示（判斷能不能加到主畫面），
// 所以 PWA 相關的靜態資源一定要排除在登入閘門之外，否則抓到的會是 /login
// 這個 HTML 頁面而不是真正的圖示，PWA 會整個裝不起來。matcher 必須是靜態
// 字串（Next.js 在編譯期解析），不能用變數組字串。
export const config = {
  matcher: [
    '/((?!_next/static|_next/image|login|api/login|apply|api/apply|manifest.webmanifest|sw.js|favicon.ico|apple-icon.png|icon0.png|icon1.png|icon-192.png|icon-512.png|icon-maskable-192.png|icon-maskable-512.png).*)',
  ],
};
