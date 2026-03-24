import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { authMiddleware, requireAdmin } from '../security/auth.js';
import { getDb } from '../db/store.js';

const router = Router();
router.use(authMiddleware);

// GET /api/roles — list all roles (any authenticated user)
router.get('/', (_req: Request, res: Response) => {
  const db = getDb();
  const roles = db.prepare('SELECT * FROM agent_roles ORDER BY is_default DESC, name ASC').all();
  res.json(roles);
});

// POST /api/roles — create role (admin only)
router.post('/', requireAdmin, (req: Request, res: Response) => {
  const { name, display_name, description, system_prompt_addition, allowed_tools, blocked_tools, subdir } = req.body;
  if (!name || !display_name) {
    res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'name and display_name required' } });
    return;
  }
  if (!/^[a-z][a-z0-9_-]*$/.test(name)) {
    res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'name must be lowercase alphanumeric with hyphens/underscores' } });
    return;
  }
  const db = getDb();
  try {
    db.prepare(`
      INSERT INTO agent_roles (id, name, display_name, description, system_prompt_addition, allowed_tools, blocked_tools, subdir, is_default, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, datetime('now'))
    `).run(
      uuidv4(), name, display_name,
      description || '',
      system_prompt_addition || '',
      allowed_tools || null,
      blocked_tools || '[]',
      subdir || ''
    );
    const created = db.prepare('SELECT * FROM agent_roles WHERE name = ?').get(name);
    res.status(201).json(created);
  } catch (err: any) {
    if (err.message?.includes('UNIQUE')) {
      res.status(409).json({ error: { code: 'CONFLICT', message: 'Role name already exists' } });
    } else {
      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: err.message } });
    }
  }
});

// PUT /api/roles/:id — update role (admin only)
router.put('/:id', requireAdmin, (req: Request, res: Response) => {
  const { id } = req.params;
  const { display_name, description, system_prompt_addition, allowed_tools, blocked_tools, subdir } = req.body;
  const db = getDb();
  const existing = db.prepare('SELECT * FROM agent_roles WHERE id = ?').get(id);
  if (!existing) {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Role not found' } });
    return;
  }
  db.prepare(`
    UPDATE agent_roles SET
      display_name = ?,
      description = ?,
      system_prompt_addition = ?,
      allowed_tools = ?,
      blocked_tools = ?,
      subdir = ?
    WHERE id = ?
  `).run(
    display_name ?? (existing as any).display_name,
    description ?? (existing as any).description,
    system_prompt_addition ?? (existing as any).system_prompt_addition,
    allowed_tools !== undefined ? allowed_tools : (existing as any).allowed_tools,
    blocked_tools ?? (existing as any).blocked_tools,
    subdir ?? (existing as any).subdir,
    id
  );
  res.json(db.prepare('SELECT * FROM agent_roles WHERE id = ?').get(id));
});

// DELETE /api/roles/:id — delete non-default role (admin only)
router.delete('/:id', requireAdmin, (req: Request, res: Response) => {
  const { id } = req.params;
  const db = getDb();
  const role = db.prepare('SELECT * FROM agent_roles WHERE id = ?').get(id) as any;
  if (!role) {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Role not found' } });
    return;
  }
  if (role.is_default) {
    res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Cannot delete default roles' } });
    return;
  }
  db.prepare('DELETE FROM agent_roles WHERE id = ?').run(id);
  res.json({ ok: true });
});

export default router;
