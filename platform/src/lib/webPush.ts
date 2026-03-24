import webPush from 'web-push';
import { getDb } from '../db/store.js';
import { createLogger } from './logger.js';

const log = createLogger('webPush');

const VAPID_SUBJECT = 'mailto:srijan@localhost';

export function getVapidKeys(): { publicKey: string; privateKey: string } {
  const db = getDb();
  const row = db.prepare(`SELECT value FROM config WHERE key = 'vapid_keys'`).get() as { value: string } | undefined;
  if (row) {
    return JSON.parse(row.value);
  }
  const keys = webPush.generateVAPIDKeys();
  db.prepare(`INSERT OR REPLACE INTO config (key, value) VALUES ('vapid_keys', ?)`).run(JSON.stringify(keys));
  return keys;
}

export function initWebPush(): void {
  try {
    const keys = getVapidKeys();
    webPush.setVapidDetails(VAPID_SUBJECT, keys.publicKey, keys.privateKey);
    log.info('Web Push VAPID keys initialised');
  } catch (err) {
    log.warn({ err }, 'Failed to initialise Web Push');
  }
}

export async function sendPushToUser(
  userId: string,
  payload: { title: string; body: string; url?: string },
): Promise<void> {
  const db = getDb();
  const subs = db.prepare(
    `SELECT id, endpoint, keys_json FROM push_subscriptions WHERE user_id = ?`,
  ).all(userId) as { id: string; endpoint: string; keys_json: string }[];

  await Promise.all(
    subs.map(async (sub) => {
      const keys = JSON.parse(sub.keys_json);
      const pushSub = { endpoint: sub.endpoint, keys };
      try {
        await webPush.sendNotification(pushSub, JSON.stringify(payload));
      } catch (err: any) {
        if (err.statusCode === 410) {
          // Subscription is gone — delete it
          db.prepare(`DELETE FROM push_subscriptions WHERE id = ?`).run(sub.id);
          log.info({ subscriptionId: sub.id }, 'Removed expired push subscription (410 Gone)');
        } else {
          log.warn({ err, subscriptionId: sub.id }, 'Failed to send push notification');
        }
      }
    }),
  );
}

export async function sendPushToSession(
  sessionId: string,
  payload: { title: string; body: string; url?: string },
): Promise<void> {
  const db = getDb();
  const session = db.prepare(`SELECT user_id as userId FROM sessions WHERE id = ?`).get(sessionId) as
    | { userId: string }
    | undefined;
  if (!session) {
    log.warn({ sessionId }, 'sendPushToSession: session not found');
    return;
  }
  await sendPushToUser(session.userId, payload);
}
