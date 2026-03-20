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

// API routes
app.use('/api/auth', authRouter);
app.use('/api/config', configRouter);
app.use('/api/secrets', secretsRouter);
app.use('/api/apps', appsRouter);
app.use('/api/git', gitRouter);
app.use('/api/sessions/:id/cost', costRouter);
app.use('/api/containers', containersRouter);
app.use('/api/workspaces', workspacesRouter);
app.use('/api/workspaces', filesRouter);
app.use('/api/sessions', sessionsRouter);
app.use('/api/users', usersRouter);

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
const webDist = join(__dirname, '../web/dist');
if (existsSync(webDist)) {
  app.use(express.static(webDist));
  app.get('/{*splat}', (_req, res) => {
    res.sendFile(join(webDist, 'index.html'));
  });
}

// Initialize
checkSecretSecurity();
const db = getDb();
setupAdmin(ADMIN_PASSWORD);

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

  if (pathname === '/api/chat') {
    chatWss.handleUpgrade(request, socket, head, (ws) => {
      chatWss.emit('connection', ws, request, payload, token);
    });
  } else if (pathname === '/api/terminal') {
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
  log.info('Admin user created with default password (change in production)');
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
