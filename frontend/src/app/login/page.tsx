'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

// 舊的登入網址：登入改由 Cloudflare Access 處理，直接進主控台
export default function LoginPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/dashboard');
  }, [router]);

  return (
    <div className="min-vh-100 d-flex align-items-center justify-content-center">
      <div className="spinner-border text-secondary" />
    </div>
  );
}
