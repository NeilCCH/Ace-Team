import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { SESSION_COOKIE, verifySession, isAdminEmail } from '@/lib/auth';
import AdminPanel from './AdminPanel';

export default async function AdminPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  const email = token ? await verifySession(token) : null;
  if (!email) redirect('/login?next=/admin');
  if (!isAdminEmail(email)) redirect('/');

  return <AdminPanel />;
}
