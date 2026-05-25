import { state, getMachinesArray, MACHINE_PROFILES } from '../../store/state.js';

function pickRelevantMachine(query) {
  const text = (query || '').toLowerCase();
  const machines = getMachinesArray();

  const exact = machines.find(machine => text.includes(machine.id.toLowerCase()));
  if (exact) return exact;

  // FUTURE: Restore furnace routing when the furnace process is re-enabled.
  if (text.includes('horno') || text.includes('térmica') || text.includes('termic')) {
    return machines.find(machine => machine.process === 'FURNACE') || machines[0];
  }

  if (text.includes('llen') || text.includes('botella') || text.includes('tapa') || text.includes('etiqu')) {
    return machines.find(machine => machine.process === 'BOTTLING') || machines[0];
  }

  return machines[0] || null;
}

function summariseMachine(machine) {
  if (!machine) return 'No hay máquinas disponibles en este momento.';
  const profile = MACHINE_PROFILES[machine.id];
  const qualityEntries = Object.entries(machine.quality || {}).slice(0, 3);
  const qualities = qualityEntries.length
    ? qualityEntries.map(([name, value]) => `${name}=${Number(value).toFixed(2)}`).join(', ')
    : 'sin variables de calidad activas';

  return [
    `${machine.id} (${machine.name})`,
    `estado=${machine.status}, temp=${Number(machine.temp || 0).toFixed(1)}°C, vib=${Number(machine.vib || 0).toFixed(2)}g, OEE=${Number(machine.oee || 0).toFixed(1)}%, defecto=${Number(machine.defect || 0).toFixed(2)}%`,
    `variables clave: ${qualities}`,
    profile ? `límites: tempWarn=${profile.tempWarn}, tempCrit=${profile.tempCrit}` : '',
  ].filter(Boolean).join(' | ');
}

export function ruleBasedResponse(messages, systemPrompt, csvContext) {
  const lastUser = [...messages].reverse().find(message => message.role === 'user')?.content || '';
  const machine = pickRelevantMachine(lastUser);
  const text = lastUser.toLowerCase();
  const metrics = state.machines;

  const lines = [];
  if (text.includes('temperatura')) {
    lines.push(`Temperatura en ${machine?.id || 'planta'}: ${Number(machine?.temp || 0).toFixed(1)}°C.`);
  }
  if (text.includes('vibr')) {
    lines.push(`Vibración actual: ${Number(machine?.vib || 0).toFixed(2)}g.`);
  }
  if (text.includes('oee')) {
    lines.push(`OEE actual: ${Number(machine?.oee || 0).toFixed(1)}%.`);
  }
  if (text.includes('defect')) {
    lines.push(`Defecto estimado: ${Number(machine?.defect || 0).toFixed(2)}%.`);
  }
  if (text.includes('setpoint')) {
    const profile = MACHINE_PROFILES[machine?.id];
    const target = machine?.setpointOverride ?? profile?.tempBase ?? machine?.temp ?? 0;
    lines.push(`Setpoint activo: ${Number(target).toFixed(1)}.`);
  }

  if (!lines.length) {
    lines.push(`La máquina más relevante ahora es ${machine?.id || 'N/D'}: ${summariseMachine(machine)}.`);
  }

  const activeCriticals = Object.values(metrics).filter(m => m.status === 'CRITICAL').length;
  const activeWarnings = Object.values(metrics).filter(m => m.status === 'WARN').length;

  lines.push(`Alertas activas: ${state.alerts.filter(alert => alert.status !== 'closed').length} (críticas: ${activeCriticals}, warnings: ${activeWarnings}).`);

  if (csvContext) {
    lines.push('Usé el contexto CSV adjunto como referencia adicional para interpretar la respuesta.');
  }

  return {
    text: lines.join(' '),
    mode: 'rule-based',
  };
}
