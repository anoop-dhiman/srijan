import { Router, Request, Response } from 'express';
import { WebSocket } from 'ws';
import { authMiddleware } from '../security/auth.js';
import { getSession, getSessionEvents, saveEvent } from '../agent/session.js';
import { createEvent } from '../agent/events.js';
import { getDb } from '../db/store.js';
import { chatWss } from './chat.js';

const router = Router();
router.use(authMiddleware);

router.get('/:id/recording', (req: Request, res: Response) => {
  const id = req.params.id as string;
  const user = (req as any).user;

  const session = getSession(id);
  if (!session) {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Session not found' } });
    return;
  }

  if (session.userId !== user.userId) {
    res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Access denied' } });
    return;
  }

  const events = getSessionEvents(id);

  const db = getDb();
  const costRow = db
    .prepare('SELECT COALESCE(SUM(cost_usd), 0) as total FROM token_usage WHERE session_id = ?')
    .get(id) as { total: number };

  res.json({ session, events, totalCostUsd: costRow.total });
});

// POST /api/sessions/:id/plan — called by MCP tool via registration token
router.post('/:id/plan', (req: Request, res: Response) => {
  const sessionId = req.params.id as string;
  const regToken = req.headers['x-registration-token'] as string;

  if (!regToken) {
    res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Registration token required' } });
    return;
  }

  const db = getDb();
  const session = db.prepare('SELECT id, registration_token FROM sessions WHERE id = ?').get(sessionId) as any;
  if (!session || session.registration_token !== regToken) {
    res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Invalid registration token' } });
    return;
  }

  const { title, steps } = req.body;
  if (!title || !Array.isArray(steps)) {
    res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'title and steps required' } });
    return;
  }

  // Save the plan event to DB
  const planEvent = createEvent(sessionId, 'plan_proposed', { title, steps });
  saveEvent(planEvent);

  // Broadcast to all WS clients subscribed to this session
  const payload = JSON.stringify({ type: 'agent_event', data: { ...planEvent, sessionId, type: 'plan_proposed' } });
  chatWss.clients.forEach((client: WebSocket) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  });

  res.json({ ok: true });
});

export default router;
