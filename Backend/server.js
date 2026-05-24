import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { broadcaster } from './src/ws/broadcaster.js';
import { startEngine } from './src/simulation/engine.js';
import router from './src/routes/index.js';

const PORT = process.env.PORT || 3001;
const app  = express();
const httpServer = createServer(app);

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(cors({ origin: '*' }));
app.use(express.json());

// ── REST API ──────────────────────────────────────────────────────────────────
app.use('/api', router);

// ── WebSocket ─────────────────────────────────────────────────────────────────
const wss = new WebSocketServer({ server: httpServer, path: '/ws' });
broadcaster.init(wss);

// ── Simulation engine ─────────────────────────────────────────────────────────
startEngine();

// ── Start ─────────────────────────────────────────────────────────────────────
httpServer.listen(PORT, () => {
  console.log(`\n  IndustrIA Σ Backend  →  http://localhost:${PORT}`);
  console.log(`  WebSocket            →  ws://localhost:${PORT}/ws`);
  console.log(`  Simulation engine    →  RUNNING (1 Hz tick)\n`);
});
