'use client';

import { useRouter } from 'next/navigation';

export default function LogoutButton() {
  const router = useRouter();
  const logout = async () => {
    await fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'logout' }),
    });
    router.replace('/login');
    router.refresh();
  };
  return (
    <button className="logout-button" onClick={() => void logout()}>
      Sair da conta
    </button>
  );
}
