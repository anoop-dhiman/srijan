import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { createServer, IncomingMessage } from 'http';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync, mkdirSync } from 'fs';
import { parse } from 'url';

import { getDb, closeDb } from './db/store.js';
import { setupAdmin, verifyToken, checkSecretSecurity } from './security/auth.js';
import { requestIdMiddleware } from './middleware/requestId.js';
import { createLogger } from './lib/logger.js';
import { getDockerInfo } from './docker/manager.js';
import { initCaddyRouteId } from './docker/caddy.js';

const log = createLogger('server');
import { setupWebSocket, chatWss } from './routes/chat.js';
import { setupTerminal, terminalWss } from './routes/terminal.js';
import authRouter from './routes/auth.js';
import configRouter from './routes/config.js';
import secretsRouter from './routes/secrets.js';
import appsRouter from './routes/apps.js';
import gitRouter from './routes/git.js';
import costRouter from './routes/cost.js';
import containersRouter from './routes/containers.js';
import workspacesRouter from './routes/workspaces.js';
import filesRouter from './routes/files.js';
import sessionsRouter from './routes/sessions.js';
import usersRouter from './routes/users.js';
import spendingRouter from './routes/spending.js';
import pluginsRouter, { ensureOfficialMarketplace } from './routes/plugins.js';
import rolesRouter from './routes/roles.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PORT = parseInt(process.env.PORT || '8080', 10);
const ADMIN_PASSWORD = process.env.SRIJAN_ADMIN_PASSWORD || 'admin';

// Ensure data directory exists
const dataDir = process.env.SRIJAN_DATA_DIR || join(__dirname, '../data');
if (!existsSync(dataDir)) {
  mkdirSync(dataDir, { recursive: true });
}

const app = express();

// CORS: restrict to explicitly allowed origins
const allowedOrigins = (process.env.SRIJAN_ORIGIN || '')
  .split(',')
  .map(o => o.trim())
  .filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no Origin header (same-origin / server-to-server)
    if (!origin) return callback(null, true);
    if (allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    callback(new Error('CORS: origin not allowed'));
  },
  credentials: true,
}));
app.use(requestIdMiddleware);
app.use(express.json());

// API routes (all under /forge/api so path is consistent whether accessed via Caddy, Vite proxy, or directly)
app.use('/forge/api/auth', authRouter);
app.use('/forge/api/config', configRouter);
app.use('/forge/api/secrets', secretsRouter);
app.use('/forge/api/apps', appsRouter);
app.use('/forge/api/git', gitRouter);
app.use('/forge/api/sessions/:id/cost', costRouter);
app.use('/forge/api/containers', containersRouter);
app.use('/forge/api/workspaces', workspacesRouter);
app.use('/forge/api/workspaces', filesRouter);
app.use('/forge/api/sessions', sessionsRouter);
app.use('/forge/api/users', usersRouter);
app.use('/forge/api/spending', spendingRouter);
app.use('/forge/api/plugins', pluginsRouter);
app.use('/forge/api/roles', rolesRouter);

// Health check
app.get('/health', async (_req, res) => {
  let dbStatus: 'ok' | 'error' = 'ok';
  let dockerStatus: 'ok' | 'unavailable' = 'ok';

  try {
    getDb().prepare('SELECT 1').get();
  } catch {
    dbStatus = 'error';
  }

  try {
    const info = await getDockerInfo();
    if (!info) dockerStatus = 'unavailable';
  } catch {
    dockerStatus = 'unavailable';
  }

  const overallStatus = dbStatus === 'error' ? 'error' : dockerStatus === 'unavailable' ? 'degraded' : 'ok';
  const httpStatus = overallStatus === 'error' ? 503 : 200;

  res.status(httpStatus).json({
    status: overallStatus,
    version: '0.1.0',
    uptime: process.uptime(),
    db: dbStatus,
    docker: dockerStatus,
  });
});

// Global error handler — ensure all unhandled errors return JSON
app.use((err: any, _req: any, res: any, _next: any) => {
  log.error({ err }, 'Unhandled error');
  const status = err.status || err.statusCode || 500;
  res.status(status).json({ error: { code: 'INTERNAL_ERROR', message: err.message || 'Internal server error' } });
});

// Serve frontend static files (after build)
// Mounted at /forge to match the Vite base path; root redirects to /forge/ for convenience
const webDist = join(__dirname, '../web/dist');
if (existsSync(webDist)) {
  app.use('/forge', express.static(webDist));
  app.get('/forge/{*splat}', (_req, res) => res.sendFile(join(webDist, 'index.html')));
}

// Initialize
checkSecretSecurity();
const db = getDb();
const adminCreated = setupAdmin(ADMIN_PASSWORD);
if (adminCreated) {
  if (!process.env.SRIJAN_ADMIN_PASSWORD) {
    log.warn('Admin user created with default password — set SRIJAN_ADMIN_PASSWORD in production');
  } else {
    log.info('Admin user created');
  }
}

const server = createServer(app);
setupWebSocket();
setupTerminal();

// Single WebSocket upgrade dispatcher (R2)
server.on('upgrade', (request: IncomingMessage, socket, head) => {
  const { pathname, query } = parse(request.url || '', true);

  const token = query.token as string;
  if (!token) {
    socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
    socket.destroy();
    return;
  }

  const payload = verifyToken(token);
  if (!payload) {
    socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
    socket.destroy();
    return;
  }

  if (pathname === '/forge/api/chat') {
    chatWss.handleUpgrade(request, socket, head, (ws) => {
      chatWss.emit('connection', ws, request, payload, token);
    });
  } else if (pathname === '/forge/api/terminal') {
    const sessionId = query.sessionId as string || '';
    terminalWss.handleUpgrade(request, socket, head, (ws) => {
      terminalWss.emit('connection', ws, request, payload, sessionId);
    });
  } else {
    socket.destroy();
  }
});

server.listen(PORT, () => {
  log.info(`Srijan platform running on http://localhost:${PORT}`);
  // Tag Caddy's host-route subroute so dynamic app routes land inside it
  // (avoids the terminal: true route shadowing dynamically added routes)
  initCaddyRouteId().catch(err => log.warn({ err: err.message }, 'initCaddyRouteId failed at startup'));
  // Ensure the official Claude plugin marketplace is registered in the container's Claude home
  ensureOfficialMarketplace().catch(() => {});
});

// Graceful shutdown
process.on('SIGTERM', () => {
  log.info('Shutting down...');
  server.close();
  closeDb();
  process.exit(0);
});

process.on('SIGINT', () => {
  log.info('Shutting down...');
  server.close();
  closeDb();
  process.exit(0);
});
