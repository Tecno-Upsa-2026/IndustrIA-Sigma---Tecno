// ─────────────────────────────────────────────────────────────────────────────
// Alert generation logic.
// Called every tick to check thresholds and emit/clear alerts.
// ─────────────────────────────────────────────────────────────────────────────

import { state, MACHINE_PROFILES, nextAlertId, addEvent } from '../store/state.js';
import { broadcaster } from '../ws/broadcaster.js';

const activeThresholds = {};

function key(machineId, type) {
  return `${machineId}:${type}`;
}

function formatTime(ts) {
  const date = new Date(ts);
  const pad = value => String(value).padStart(2, '0');
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function raiseAlert(machine, type, sev, title, detail, ai, now) {
  const alert = {
    id: nextAlertId(),
    sev,
    machine: machine.id,
    title,
    detail,
    time: formatTime(now),
    ts: now,
    ai,
    status: 'active',
  };

  state.alerts.unshift(alert);
  activeThresholds[key(machine.id, type)] = alert.id;
  addEvent(title, sev === 'CRITICAL' ? 'critical' : 'warn');
  broadcaster.emit({ type: 'ALERT_NEW', alert });
}

function resolveAlert(machineId, type) {
  delete activeThresholds[key(machineId, type)];
  addEvent(`Condición resuelta ${machineId}`, 'ok');
}

function checkGenericThreshold(machine, profile, variableName, value, now) {
  const variable = profile?.variables?.[variableName];
  if (!variable) return;
  if (value === 0 && !machine.vars?.[variableName]) return;

  const inverted = ['precision', 'hardness', 'residual_humidity', 'thermal_uniformity', 'color_uniformity', 'stability'].includes(variableName);
  const warnKey = key(machine.id, `${variableName}_warn`);
  const critKey = key(machine.id, `${variableName}_crit`);

  const warnBreached = inverted ? value <= variable.warn : value >= variable.warn;
  const critBreached = inverted ? value <= variable.crit : value >= variable.crit;

  if (critBreached && !activeThresholds[critKey]) {
    raiseAlert(
      machine,
      `${variableName}_crit`,
      'CRITICAL',
      `${variableName} crítico — ${machine.id}`,
      `${variableName} ${value.toFixed(2)} supera el límite crítico ${variable.crit}.`,
      'Revisar el proceso y validar la calibración del parámetro.',
      now,
    );
  } else if (!critBreached && activeThresholds[critKey]) {
    resolveAlert(machine.id, `${variableName}_crit`);
  }

  if (warnBreached && !activeThresholds[warnKey] && !critBreached) {
    raiseAlert(
      machine,
      `${variableName}_warn`,
      'HIGH',
      `${variableName} elevado — ${machine.id}`,
      `${variableName} ${value.toFixed(2)} excede el umbral de advertencia ${variable.warn}.`,
      'Monitorear tendencia y preparar corrección preventiva.',
      now,
    );
  } else if (!warnBreached && activeThresholds[warnKey]) {
    resolveAlert(machine.id, `${variableName}_warn`);
  }
}

export function checkThresholds(machine) {
  const profile = MACHINE_PROFILES[machine.id];
  if (!profile || machine.status === 'IDLE') return;

  const now = Date.now();

  if (machine.anomalyScore != null && machine.anomalyScore > 0.7) {
    const anomalyKey = key(machine.id, 'anomaly');
    if (!activeThresholds[anomalyKey]) {
      raiseAlert(
        machine,
        'anomaly',
        'CRITICAL',
        `Anomalía detectada — ${machine.id}`,
        `El score de anomalía llegó a ${machine.anomalyScore.toFixed(2)}.`,
        'Revisar la serie temporal y los últimos cambios de setpoint.',
        now,
      );
    }
  } else if (activeThresholds[key(machine.id, 'anomaly')]) {
    resolveAlert(machine.id, 'anomaly');
  }

  checkGenericThreshold(machine, profile, 'temperature', machine.temp ?? 0, now);
  checkGenericThreshold(machine, profile, 'vibration', machine.vib ?? 0, now);
  checkGenericThreshold(machine, profile, 'pressure', machine.pressure ?? machine.vars?.pressure?.value ?? 0, now);
  checkGenericThreshold(machine, profile, 'precision', machine.precision ?? machine.vars?.precision?.value ?? 0, now);
  checkGenericThreshold(machine, profile, 'hardness', machine.hardness ?? machine.vars?.hardness?.value ?? 0, now);
}

let eventTimer = 0;
export function maybeGenerateEvent() {
  eventTimer++;
  if (eventTimer % 45 !== 0) return;

  const lines = [
    { label: 'Lote completado · rendimiento 98.4%', kind: 'ok' },
    { label: 'Calibración automática BTL-03', kind: 'info' },
    { label: 'Backup datos completado', kind: 'info' },
    { label: 'Modelo IA actualizó predicciones', kind: 'ai' },
  ];

  const event = lines[Math.floor(Math.random() * lines.length)];
  addEvent(event.label, event.kind);
  broadcaster.emit({ type: 'EVENT_NEW', event: state.events[0] });
}
