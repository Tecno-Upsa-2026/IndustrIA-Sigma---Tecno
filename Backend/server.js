import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { broadcaster } from './src/ws/broadcaster.js';
import { startEngine } from './src/simulation/engine.js';
import router from './src/routes/index.js';
import { loadSimulationFromCSV } from './src/store/state.js';

const PORT = process.env.PORT || 3001;
const app = express();
const httpServer = createServer(app);

app.use(cors({ origin: '*' }));
app.use(express.json());

app.use('/api', router);

const wss = new WebSocketServer({ server: httpServer, path: '/ws' });
broadcaster.init(wss);

try {
  const csvData = loadSimulationFromCSV();
  const machineCount = Object.keys(csvData.machines).length;
  const varCount = Object.values(csvData.profiles || {})
    .reduce((sum, p) => sum + Object.keys(p.variables || {}).length, 0);
  const corrCount = Object.values(csvData.profiles || {})
    .filter(p => p.correlations && Object.keys(p.correlations).length > 0).length;
  console.log(`  [CSV] ${machineCount} máquinas · ${varCount} variables · ${corrCount} con correlaciones calibradas`);
} catch (error) {
  console.warn(`  [CSV] No se pudo cargar: ${error.message}`);
}

startEngine();

httpServer.listen(PORT, () => {
  console.log(`\n  IndustrIA Σ Backend  →  http://localhost:${PORT}`);
  console.log(`  WebSocket            →  ws://localhost:${PORT}/ws`);
  console.log(`  Simulation engine    →  RUNNING (1 Hz tick)\n`);
});
