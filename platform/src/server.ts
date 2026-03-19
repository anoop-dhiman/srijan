import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync, mkdirSync } from 'fs';

import { getDb, closeDb } from './db/store.js';
import { setupAdmin } from './security/auth.js';
import { setupWebSocket } from './routes/chat.js';
import authRouter from './routes/auth.js';
import configRouter from './routes/config.js';
import secretsRouter from './routes/secrets.js';
import appsRouter from './routes/apps.js';

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

app.use(cors());
app.use(express.json());

// API routes
app.use('/api/auth', authRouter);
app.use('/api/config', configRouter);
app.use('/api/secrets', secretsRouter);
app.use('/api/apps', appsRouter);

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', version: '0.1.0' });
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
const db = getDb();
setupAdmin(ADMIN_PASSWORD);

const server = createServer(app);
setupWebSocket(server);

server.listen(PORT, () => {
  console.log(`Srijan platform running on http://localhost:${PORT}`);
  console.log(`Admin user created with default password (change in production)`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('Shutting down...');
  server.close();
  closeDb();
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('Shutting down...');
  server.close();
  closeDb();
  process.exit(0);
});
