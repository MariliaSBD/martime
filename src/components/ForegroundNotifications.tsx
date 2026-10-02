import { useEffect } from 'react';
import { useToast } from './ui';

/** 14.2: with the app open, a push also shows as an in-app notice. */
export function ForegroundNotifications() {
  const toast = useToast();
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    const onMsg = (e: MessageEvent) => {
      if (e.data?.type === 'push' && e.data.body) toast(String(e.data.body));
    };
    navigator.serviceWorker.addEventListener('message', onMsg);
    return () => navigator.serviceWorker.removeEventListener('message', onMsg);
  }, [toast]);
  return null;
}
