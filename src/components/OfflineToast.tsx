'use client';
import { useEffect, useState } from 'react';

export default function OfflineToast() {
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    // Initial check
    setOffline(!navigator.onLine);

    const onOnline = () => setOffline(false);
    const onOffline = () => setOffline(true);

    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  if (!offline) return null;
  return (
    <div
      role="status"
      className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-md bg-amber-900/80 px-3 py-2 text-sm text-amber-50 shadow-lg backdrop-blur"
    >
      You’re offline. Viewing cached data.
    </div>
  );
}
