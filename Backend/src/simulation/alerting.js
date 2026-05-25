// ─────────────────────────────────────────────────────────────────────────────
// Alert generation logic.
// Historical alerts run on a 5-tick cadence using a rolling 5-sample average.
// Alerts require 3 consecutive calm checks before they are resolved.
// ─────────────────────────────────────────────────────────────────────────────

import { buildMachineDiagnostics } from '../services/llm/csv-diagnostics.js';
import { state, MACHINE_PROFILES, nextAlertId, addEvent } from '../store/state.js';
import { broadcaster } from '../ws/broadcaster.js';

const activeThresholds = {};
const resolutionCounters = {};

function key(machineId, type) {
  return `${machineId}:${type}`;
}

function formatTime(ts) {
  const date = new Date(ts);
  const pad = value => String(value).padStart(2, '0');
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function findActiveAlert(machineId, type) {
  return state.alerts.find(alert => alert.machine === machineId && alert.type === type && alert.status === 'active') || null;
}

function raiseAlert(machine, type, sev, title, detail, ai, source, now) {
  const existing = findActiveAlert(machine.id, type);
  if (existing) {
    existing.sev = sev;
    existing.title = title;
    existing.detail = detail;
    existing.ai = ai;
    existing.source = source;
    existing.ts = now;
    existing.time = formatTime(now);
    existing.status = 'active';
    broadcaster.emit({ type: 'ALERT_UPDATE', alert: existing });
    return existing;
  }

  const alert = {
    id: nextAlertId(),
    type,
    sev,
    machine: machine.id,
    title,
    detail,
    time: formatTime(now),
    ts: now,
    ai,
    source,
    status: 'active',
  };

  state.alerts.unshift(alert);
  activeThresholds[key(machine.id, type)] = alert.id;
  resolutionCounters[key(machine.id, type)] = 0;
  addEvent(title, sev === 'CRITICAL' ? 'critical' : 'warn');
  broadcaster.emit({ type: 'ALERT_NEW', alert });
  return alert;
}

function resolveAlert(machineId, type) {
  const alertKey = key(machineId, type);
  delete activeThresholds[alertKey];
  delete resolutionCounters[alertKey];

  const alert = findActiveAlert(machineId, type);
  if (alert) {
    alert.status = 'closed';
    alert.resolvedAt = Date.now();
  }

  addEvent(`Condición resuelta ${machineId}`, 'ok');
  broadcaster.emit({ type: 'ALERT_RESOLVED', machineId, alertType: type, alertId: alert?.id || null });
}

function getSeries(machineId, variableName) {
  return state.machineHistory?.[machineId]?.[variableName] || [];
}

function average(values) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function historicalDecision(variable, windowAvg) {
  const highCrit = windowAvg >= variable.ucl;
  const lowCrit = windowAvg <= variable.lcl;
  const highWarn = windowAvg >= variable.warnUpper;
  const lowWarn = windowAvg <= variable.warnLower;

  if (highCrit || lowCrit) {
    return {
      sev: 'CRITICAL',
      side: highCrit ? 'alta' : 'baja',
      source: 'historical-window',
      title: `${variable.name} fuera de 3σ — ${variable.machineId}`,
    };
  }

  if (highWarn || lowWarn) {
    return {
      sev: 'HIGH',
      side: highWarn ? 'alta' : 'baja',
      source: 'historical-window',
      title: `${variable.name} en zona de advertencia — ${variable.machineId}`,
    };
  }

  return null;
}

function updateResolutionState(machineId, type, breached) {
  const alertKey = key(machineId, type);
  if (breached) {
    resolutionCounters[alertKey] = 0;
    return false;
  }

  if (!activeThresholds[alertKey]) return false;
  resolutionCounters[alertKey] = (resolutionCounters[alertKey] || 0) + 1;
  if (resolutionCounters[alertKey] < 3) return false;

  resolveAlert(machineId, type);
  return true;
}

function checkAnomaly(machine, now) {
  const anomalyKey = key(machine.id, 'anomaly');
  const anomalyAlert = findActiveAlert(machine.id, 'anomaly');
  const breached = machine.anomalyScore != null && machine.anomalyScore > 0.7;

  if (breached) {
    raiseAlert(
      machine,
      'anomaly',
      'CRITICAL',
      `Anomalía detectada — ${machine.id}`,
      `El score de anomalía llegó a ${machine.anomalyScore.toFixed(2)}.`,
      'Revisar la serie temporal y los últimos cambios de setpoint.',
      'anomaly',
      now,
    );
    resolutionCounters[anomalyKey] = 0;
    return;
  }

  if (anomalyAlert) updateResolutionState(machine.id, 'anomaly', false);
}

function checkHistoricalWindow(machine, variable, now) {
  const series = getSeries(machine.id, variable.name);
  if (series.length < 5) return;

  const window = series.slice(-5);
  const windowAvg = average(window);
  const decision = historicalDecision(variable, windowAvg);
  const alertType = `${variable.name}_window`;

  if (decision) {
    const sigmaDelta = (windowAvg - variable.historicalMean) / Math.max(variable.historicalStd, 0.01);
    const unit = variable.unit ? ` ${variable.unit}` : '';
    const detail = `Media móvil 5 pts = ${windowAvg.toFixed(3)}${unit} · media histórica ${variable.historicalMean.toFixed(3)}${unit} · ${sigmaDelta.toFixed(2)}σ.`;
    const ai = decision.sev === 'CRITICAL'
      ? 'Aislar la variable, confirmar causa asignable y ajustar el proceso antes del siguiente bloque de producción.'
      : 'Ajustar setpoint o intervenir mantenimiento preventivo antes de que la deriva alcance 3σ.';

    raiseAlert(
      machine,
      alertType,
      decision.sev,
      decision.title,
      detail,
      ai,
      decision.source,
      now,
    );
    resolutionCounters[key(machine.id, alertType)] = 0;
    return;
  }

  updateResolutionState(machine.id, alertType, false);
}

export function checkThresholds(machine) {
  const profile = MACHINE_PROFILES[machine.id];
  if (!profile || machine.status === 'IDLE') return;

  const now = Date.now();
  checkAnomaly(machine, now);

  const shouldRunHistorical = (Number(state.tick || 0) % 5) === 0;
  if (!shouldRunHistorical) return;

  const diagnostics = buildMachineDiagnostics(machine.id);
  const flaggedVariables = diagnostics?.flaggedVariables || [];
  if (!flaggedVariables.length) return;

  for (const variable of flaggedVariables) {
    checkHistoricalWindow(machine, variable, now);
  }
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
