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

function getHistoricalLimits(profile, variableName) {
  return profile?.variables?.[variableName]?.historicalControlLimits
    || profile?.historicalControlLimits?.[variableName]
    || null;
}

function getSeries(machineId, variableName) {
  return state.machineHistory?.[machineId]?.[variableName] || [];
}

function checkHistoricalThresholds(machine, profile, variableName, value, now) {
  const limits = getHistoricalLimits(profile, variableName);
  const series = getSeries(machine.id, variableName);
  if (!limits || series.length < 6) return;

  const mean = limits.mean ?? limits.center ?? profile.variables?.[variableName]?.base_value ?? value;
  const sd = Math.max(limits.std ?? profile.variables?.[variableName]?.noise ?? 0.01, 0.01);
  const z = (value - mean) / sd;
  const absZ = Math.abs(z);

  const critKey = key(machine.id, `${variableName}_hist_crit`);
  const highKey = key(machine.id, `${variableName}_hist_high`);
  const medKey = key(machine.id, `${variableName}_hist_med`);

  if (absZ > 3) {
    if (!activeThresholds[critKey]) {
      raiseAlert(
        machine,
        `${variableName}_hist_crit`,
        'CRITICAL',
        `${variableName} fuera de 3σ — ${machine.id}`,
        `${variableName}=${value.toFixed(3)} supera la media histórica en ${absZ.toFixed(2)}σ.`,
        'Revisar la deriva del proceso y validar la causa asignable contra el histórico calibrado.',
        now,
      );
    }
    return;
  }
  if (activeThresholds[critKey]) resolveAlert(machine.id, `${variableName}_hist_crit`);

  const last7 = series.slice(-7);
  if (last7.length === 7) {
    const sameSide = last7.every(sample => sample > mean) || last7.every(sample => sample < mean);
    if (sameSide) {
      if (!activeThresholds[highKey]) {
        raiseAlert(
          machine,
          `${variableName}_hist_high`,
          'HIGH',
          `${variableName} con deriva histórica — ${machine.id}`,
          `7 puntos consecutivos del mismo lado de la media histórica para ${variableName}.`,
          'Aplicar revisión de causa especial y ajustar setpoint o mantenimiento preventivo.',
          now,
        );
      }
    } else if (activeThresholds[highKey]) {
      resolveAlert(machine.id, `${variableName}_hist_high`);
    }
  }

  const last6 = series.slice(-6);
  if (last6.length === 6) {
    let increasing = true;
    let decreasing = true;
    for (let i = 1; i < last6.length; i++) {
      if (!(last6[i] > last6[i - 1])) increasing = false;
      if (!(last6[i] < last6[i - 1])) decreasing = false;
    }
    if (increasing || decreasing) {
      if (!activeThresholds[medKey]) {
        raiseAlert(
          machine,
          `${variableName}_hist_med`,
          'MEDIUM',
          `${variableName} con tendencia monotónica — ${machine.id}`,
          `6 puntos consecutivos ${increasing ? 'ascendentes' : 'descendentes'} en ${variableName}.`,
          'Monitorear tendencia y revisar si hay un cambio de proceso o instrumento.',
          now,
        );
      }
    } else if (activeThresholds[medKey]) {
      resolveAlert(machine.id, `${variableName}_hist_med`);
    }
  }
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

  for (const [variableName, entry] of Object.entries(machine.vars || {})) {
    const current = entry?.value;
    if (!Number.isFinite(current)) continue;
    checkHistoricalThresholds(machine, profile, variableName, current, now);
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
