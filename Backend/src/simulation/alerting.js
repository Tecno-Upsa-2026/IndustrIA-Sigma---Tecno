// ─────────────────────────────────────────────────────────────────────────────
// Alert generation logic.
// Called every tick to check thresholds and emit/clear alerts.
// ─────────────────────────────────────────────────────────────────────────────

import { state, MACHINE_PROFILES, nextAlertId, addEvent } from '../store/state.js';
import { broadcaster } from '../ws/broadcaster.js';

// Tracks which threshold alerts are currently active per machine+type
const activeThresholds = {};

function key(machineId, type) { return `${machineId}:${type}`; }

function formatTime(ts) {
  const d = new Date(ts);
  const p = n => String(n).padStart(2,'0');
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

export function checkThresholds(machine) {
  const p = MACHINE_PROFILES[machine.id];
  if (!p || machine.status === 'IDLE') return;

  const now = Date.now();

  // ── Temperature CRITICAL ──────────────────────────────────────────────────
  const tempCritKey = key(machine.id, 'temp_crit');
  if (machine.temp >= p.tempCrit && !activeThresholds[tempCritKey]) {
    const alert = {
      id: nextAlertId(), sev:'CRITICAL', machine: machine.id,
      title:`Temperatura crítica — ${machine.id}`,
      detail:`Temperatura ${machine.temp.toFixed(1)}°C supera límite ${p.tempCrit}°C.`,
      time: formatTime(now), ts: now,
      ai:`Reducir setpoint inmediatamente. Verificar sistema de refrigeración.`,
      status: 'active',
    };
    state.alerts.unshift(alert);
    activeThresholds[tempCritKey] = alert.id;
    addEvent(`Temperatura crítica ${machine.id}`, 'critical');
    broadcaster.emit({ type:'ALERT_NEW', alert });
  } else if (machine.temp < p.tempCrit - 3 && activeThresholds[tempCritKey]) {
    resolveAlert(activeThresholds[tempCritKey], machine.id, 'temp_crit');
  }

  // ── Temperature WARN ─────────────────────────────────────────────────────
  const tempWarnKey = key(machine.id, 'temp_warn');
  if (machine.temp >= p.tempWarn && machine.temp < p.tempCrit && !activeThresholds[tempWarnKey]) {
    const alert = {
      id: nextAlertId(), sev:'HIGH', machine: machine.id,
      title:`Temperatura elevada — ${machine.id}`,
      detail:`Temperatura ${machine.temp.toFixed(1)}°C supera umbral de advertencia ${p.tempWarn}°C.`,
      time: formatTime(now), ts: now,
      ai:`Monitorear tendencia. Considerar reducción de carga.`,
      status: 'active',
    };
    state.alerts.unshift(alert);
    activeThresholds[tempWarnKey] = alert.id;
    addEvent(`Temperatura elevada ${machine.id}`, 'warn');
    broadcaster.emit({ type:'ALERT_NEW', alert });
  } else if (machine.temp < p.tempWarn - 3 && activeThresholds[tempWarnKey]) {
    resolveAlert(activeThresholds[tempWarnKey], machine.id, 'temp_warn');
  }

  // ── Vibration CRITICAL ────────────────────────────────────────────────────
  const vibCritKey = key(machine.id, 'vib_crit');
  if (machine.vib >= p.vibCrit && !activeThresholds[vibCritKey]) {
    const alert = {
      id: nextAlertId(), sev:'CRITICAL', machine: machine.id,
      title:`Vibración crítica — ${machine.id}`,
      detail:`Vibración ${machine.vib.toFixed(3)}g supera límite ${p.vibCrit}g.`,
      time: formatTime(now), ts: now,
      ai:`Detener máquina para inspección. Verificar balanceo y rodamientos.`,
      status: 'active',
    };
    state.alerts.unshift(alert);
    activeThresholds[vibCritKey] = alert.id;
    addEvent(`Vibración crítica ${machine.id}`, 'critical');
    broadcaster.emit({ type:'ALERT_NEW', alert });
  } else if (machine.vib < p.vibCrit - 0.05 && activeThresholds[vibCritKey]) {
    resolveAlert(activeThresholds[vibCritKey], machine.id, 'vib_crit');
  }
}

function resolveAlert(alertId, machineId, type) {
  const k = key(machineId, type);
  delete activeThresholds[k];
  addEvent(`Condición resuelta ${machineId}`, 'ok');
}

// Auto-generate random realistic events occasionally
let eventTimer = 0;
export function maybeGenerateEvent() {
  eventTimer++;
  if (eventTimer % 45 === 0) {
    const lines = [
      { label:'Lote completado · rendimiento 98.4%', kind:'ok' },
      { label:'Calibración automática CNC-04',        kind:'info' },
      { label:'Backup datos completado',              kind:'info' },
      { label:'Modelo IA actualizó predicciones',     kind:'ai' },
    ];
    const e = lines[Math.floor(Math.random() * lines.length)];
    addEvent(e.label, e.kind);
    broadcaster.emit({ type:'EVENT_NEW', event: state.events[0] });
  }
}
