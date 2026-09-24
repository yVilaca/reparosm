'use client';

import { useRouter } from 'next/navigation';
import Login from '@/components/login';
import '../accounts.css';

export default function LoginPage() {
  const router = useRouter();
  return <Login onLogin={() => router.replace('/ordens')} />;
}
