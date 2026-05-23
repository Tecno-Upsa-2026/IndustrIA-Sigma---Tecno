import { Router } from 'express';
import { state, getMachinesArray, getActiveAlerts } from '../store/state.js';
import { calcGlobalMetrics } from '../simulation/metrics.js';

const router = Router();

// ── Context-aware AI response engine ─────────────────────────────────────────
function aiRespond(query, convHistory) {
  const q       = query.toLowerCase();
  const machines = getMachinesArray();
  const alerts   = getActiveAlerts();
  const metrics  = calcGlobalMetrics();
  const ovn      = state.machines['OVN-09'];
  const inj      = state.machines['INJ-07'];

  // ── OVN-09 / temperature queries ────────────────────────────────────────
  if (q.includes('ovn') || q.includes('horno') || q.includes('temperatura') && q.includes('crítica')) {
    return {
      text: `OVN-09 muestra drift térmico sostenido. Temperatura actual: ${ovn?.temp.toFixed(1)}°C (límite: 248°C). El patrón indica un incremento de ~0.8°C cada 5 minutos. Basado en la trayectoria, estimo falla en ${ovn?.temp > 248 ? '~2.1h' : '~3.4h'}.`,
      insight: true,
      pFailure: Math.round(55 + (ovn?.temp - 240) * 3),
      timeRemaining: ovn?.temp > 248 ? '~2.1h' : '~3.4h',
      avoidableCost: '$18,400',
      actions: true,
    };
  }

  // ── Cp / capability ──────────────────────────────────────────────────────
  if (q.includes('cp') || q.includes('capability') || q.includes('cpk') || q.includes('inj-07')) {
    const cp = parseFloat((1.55 - (inj?.temp - 218) * 0.015).toFixed(3));
    return {
      text: `Cp de INJ-07 actualmente en ${cp < 1 ? cp.toFixed(2) : cp.toFixed(2)}. La variabilidad aumentó porque la temperatura de cilindro subió ${(inj?.temp - 218).toFixed(1)}°C sobre el óptimo (218°C). Tres acciones recomendadas: ① Bajar setpoint a 218°C. ② Verificar boquilla #3. ③ Aumentar frecuencia de muestreo a cada 5 min.`,
      meta: [
        { l:'Cp actual',   v: cp.toFixed(2),  c: cp < 1 ? 'red' : 'amber' },
        { l:'Cp objetivo', v:'1.33',           c:'cyan' },
        { l:'Δ requerido', v:`+${(1.33 - cp).toFixed(2)}`, c:'amber' },
      ],
    };
  }

  // ── Failure prediction ────────────────────────────────────────────────────
  if (q.includes('falla') || q.includes('predic') || q.includes('próximas 4h') || q.includes('4h')) {
    const critMachines = machines.filter(m => m.status === 'CRITICAL' || m.status === 'WARN');
    const list = critMachines.map(m => `• **${m.id}**: ${m.status} — temp ${m.temp.toFixed(1)}°C, vib ${m.vib.toFixed(2)}g`).join('\n');
    return {
      text: `Análisis predictivo para las próximas 4 horas:\n\n${list}\n\nProbabilidad de parada no planeada: ${critMachines.length > 1 ? '68%' : '34%'}. Acción prioritaria: atender OVN-09.`,
      meta: [
        { l:'Máquinas en riesgo', v: String(critMachines.length), c:'red' },
        { l:'P(parada 4h)',       v: critMachines.length > 1 ? '68%' : '34%', c:'amber' },
        { l:'Costo evitable',     v:'$21K',   c:'green' },
      ],
    };
  }

  // ── DMAIC report ─────────────────────────────────────────────────────────
  if (q.includes('dmaic') || q.includes('reporte')) {
    return {
      text: `Reporte DMAIC generado para proyecto INJ-07:\n\n**Define**: Reducir defectos en línea 2 de 4.8% → 1.5%.\n**Measure**: Cp=0.89, DPMO=${metrics.dpmo}.\n**Analyze**: Causa raíz = drift térmico en cilindro.\n**Improve**: Setpoint ajustado -8°C → Cp subió a 1.18.\n**Control**: SPC activo, reglas WECO 1-3-5.`,
      actions: true,
    };
  }

  // ── Shift comparison ─────────────────────────────────────────────────────
  if (q.includes('turno') || q.includes('turno a') || q.includes('turno b')) {
    return {
      text: `Comparación Turno A vs Turno B (últimas 24h):\n\n| Métrica | Turno A | Turno B |\n|---|---|---|\n| OEE | 89.2% | 87.4% |\n| DPMO | 1,180 | ${metrics.dpmo} |\n| Defectos | 3.1% | ${(metrics.dpmo/10000).toFixed(1)}% |\n\nTurno A muestra mejor rendimiento. Correlación identificada con experiencia del operador en INJ-07.`,
    };
  }

  // ── Optimal setpoints ────────────────────────────────────────────────────
  if (q.includes('setpoint') || q.includes('optim') || q.includes('óptimo')) {
    return {
      text: `Setpoints óptimos calculados mediante modelo de optimización RSM:\n\n• **OVN-09**: 230°C (actual: ${ovn?.temp.toFixed(1)}°C) → reducirá defectos en ~38%\n• **INJ-07**: 218°C (actual: ${inj?.temp.toFixed(1)}°C) → mejorará Cp a ~1.33\n• **PRS-12**: Presión 145 bar (actual: 150) → reducirá vibración 12%`,
      actions: true,
      meta: [
        { l:'Mejora Cp esperada',    v:'+0.44',    c:'green' },
        { l:'Reducción defectos',    v:'-38%',     c:'green' },
        { l:'Ahorro estimado/día',   v:'$1,200',   c:'cyan'  },
      ],
    };
  }

  // ── General analysis (default) ────────────────────────────────────────────
  const critCount = machines.filter(m => m.status === 'CRITICAL').length;
  const warnCount = machines.filter(m => m.status === 'WARN').length;
  return {
    text: `Análisis general · Planta MX-01 · ${new Date().toLocaleTimeString()}:\n\n• OEE global: **${metrics.oee}%** ${metrics.oee > 87 ? '✓' : '⚠'}\n• DPMO: **${metrics.dpmo}** (sigma ${metrics.sigma})\n• Alertas activas: **${metrics.activeAlerts}** (${critCount} críticas, ${warnCount} advertencias)\n• Producción/h: **${metrics.production} pzs**\n\nPrioridad: ${critCount > 0 ? `atender OVN-09 (sobrecalentamiento).` : 'operación estable, mantener monitoreo.'}`,
    meta: [
      { l:'OEE',    v:`${metrics.oee}%`,   c: metrics.oee > 85 ? 'green' : 'amber' },
      { l:'Alertas', v:String(metrics.activeAlerts), c: critCount > 0 ? 'red' : 'cyan' },
      { l:'Sigma',  v:String(metrics.sigma), c:'cyan' },
    ],
  };
}

// ── Routes ────────────────────────────────────────────────────────────────────

// GET /api/ai/conversations
router.get('/conversations', (_req, res) => {
  res.json(state.conversations);
});

// POST /api/ai/chat
router.post('/chat', (req, res) => {
  const { message, conversationId } = req.body;
  if (!message?.trim()) return res.status(400).json({ error: 'message requerido' });

  // Find or create conversation
  let conv = state.conversations.find(c => c.id === conversationId);
  if (!conv) {
    conv = { id: `conv-${Date.now()}`, messages: [], createdAt: Date.now() };
    state.conversations.unshift(conv);
  }

  // Add user message
  const userMsg = { role:'user', t: message, ts: Date.now() };
  conv.messages.push(userMsg);

  // Generate AI response
  const aiResp = aiRespond(message, conv.messages);
  const aiMsg  = { role:'ai', ts: Date.now(), ...aiResp };
  conv.messages.push(aiMsg);

  res.json({ conversationId: conv.id, response: aiMsg });
});

// GET /api/ai/insights — turno insights panel
router.get('/insights', (_req, res) => {
  const ovn  = state.machines['OVN-09'];
  const inj  = state.machines['INJ-07'];
  const mtrs = calcGlobalMetrics();

  res.json([
    { tag:'ANOMALÍA',    c:'red',   t:`Pico térmico OVN-09 — ${ovn?.temp.toFixed(1)}°C (baseline 6σ)`,   ago: '7m'  },
    { tag:'CORRELACIÓN', c:'ai',    t:`Cp INJ-07 correlaciona 0.78 con humedad ambiente`,                 ago: '14m' },
    { tag:'PATRÓN',      c:'cyan',  t:`Vibración PRS-12 sube los lunes 8–10am`,                          ago: '21m' },
    { tag:'OPORTUNIDAD', c:'green', t:`Ahorro estimado $1.2K/día reduciendo speed -5% en línea 2`,        ago: '35m' },
  ]);
});

// GET /api/ai/models
router.get('/models', (_req, res) => {
  res.json([
    { n:'Anomaly-Detect',  v:'v2.41', conf:97, c:'#A855F7' },
    { n:'Predict-Failure', v:'v1.8',  conf:91, c:'#22D3EE' },
    { n:'Process-Optim',   v:'v3.0',  conf:88, c:'#3B82F6' },
    { n:'Vision-QA',       v:'v0.9',  conf:82, c:'#10B981' },
  ]);
});

export default router;
