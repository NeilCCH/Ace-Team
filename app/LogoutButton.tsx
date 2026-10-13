'use client';

export default function LogoutButton() {
  return (
    <button
      type="button"
      className="session-logout"
      onClick={async () => {
        await fetch('/api/logout', { method: 'POST' });
        window.location.href = '/login';
      }}
    >
      登出
    </button>
  );
}
