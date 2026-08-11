'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSession, logout, type User } from '../lib/auth';

export function UserNav() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    getSession()
      .then(setUser)
      .catch(() => setUser(null));
  }, []);

  async function handleLogout() {
    await logout();
    setUser(null);
    router.push('/login');
  }

  if (!user) {
    return null;
  }

  return (
    <div className="flex items-center gap-3 text-sm text-gray-700">
      <span className="truncate max-w-[12rem]" title={user.email}>
        {user.email}
      </span>
      <button
        type="button"
        onClick={handleLogout}
        className="rounded bg-gray-200 px-2 py-1 hover:bg-gray-300"
      >
        Logout
      </button>
    </div>
  );
}
