import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { broadcaster } from './src/ws/broadcaster.js';
import { startEngine } from './src/simulation/engine.js';
import router from './src/routes/index.js';
import { loadSimulationFromCSV } from './src/store/state.js';
import { calibrateFromDataRows, applyCalibration } from './src/simulation/calibrator.js';

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
  const calibrations = calibrateFromDataRows(csvData.dataRows);
  const updated = applyCalibration(calibrations);
  console.log(`  [CSV] Configuración cargada: ${Object.keys(csvData.machines).length} máquinas, ${updated} variables calibradas`);
} catch (error) {
  console.warn(`  [CSV] No se pudo cargar o calibrar: ${error.message}`);
}

startEngine();

httpServer.listen(PORT, () => {
  console.log(`\n  IndustrIA Σ Backend  →  http://localhost:${PORT}`);
  console.log(`  WebSocket            →  ws://localhost:${PORT}/ws`);
  console.log(`  Simulation engine    →  RUNNING (1 Hz tick)\n`);
});
