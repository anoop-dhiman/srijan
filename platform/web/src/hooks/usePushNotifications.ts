import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '../lib/api';

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

interface UsePushNotificationsReturn {
  supported: boolean;
  enabled: boolean;
  loading: boolean;
  enable: () => Promise<void>;
  disable: () => Promise<void>;
  error: string | null;
}

export function usePushNotifications(): UsePushNotificationsReturn {
  const supported =
    typeof window !== 'undefined' &&
    'Notification' in window &&
    'serviceWorker' in navigator &&
    'PushManager' in window;

  const [enabled, setEnabled] = useState(() => {
    return localStorage.getItem('srijan_push_enabled') === '1';
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sync enabled state from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem('srijan_push_enabled') === '1';
    setEnabled(stored);
  }, []);

  const enable = useCallback(async () => {
    if (!supported) {
      setError('Push notifications are not supported in this browser.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      // 1. Request permission
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') {
        setError('Notification permission was denied.');
        setLoading(false);
        return;
      }

      // 2. Register service worker
      const reg = await navigator.serviceWorker.register('/sw.js');

      // 3. Fetch VAPID public key
      const { publicKey } = await apiFetch('/push/vapid-public-key');

      // 4. Subscribe to push
      const subscription = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });

      // 5. POST subscription to server
      await apiFetch('/push/subscribe', {
        method: 'POST',
        body: JSON.stringify(subscription.toJSON()),
      });

      localStorage.setItem('srijan_push_enabled', '1');
      setEnabled(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to enable push notifications.');
    } finally {
      setLoading(false);
    }
  }, [supported]);

  const disable = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Unsubscribe from PushManager
      if (supported) {
        const reg = await navigator.serviceWorker.getRegistration('/sw.js');
        if (reg) {
          const sub = await reg.pushManager.getSubscription();
          if (sub) await sub.unsubscribe();
        }
      }

      // DELETE subscription from server
      await apiFetch('/push/subscribe', { method: 'DELETE' });

      localStorage.removeItem('srijan_push_enabled');
      setEnabled(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to disable push notifications.');
    } finally {
      setLoading(false);
    }
  }, [supported]);

  return { supported, enabled, loading, enable, disable, error };
}
