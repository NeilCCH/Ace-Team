import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { SESSION_COOKIE, verifySession } from '@/lib/auth';
import ChatApp from './ChatApp';

export default async function Page() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  const email = token ? await verifySession(token) : null;
  // The middleware already gates this route — this is a defense-in-depth check in case the
  // middleware matcher is ever reconfigured to exclude it.
  if (!email) redirect('/login');

  return <ChatApp email={email} />;
}
