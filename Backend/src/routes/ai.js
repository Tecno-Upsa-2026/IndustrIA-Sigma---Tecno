import { Router } from 'express';
import { state, getMachinesArray, getActiveAlerts } from '../store/state.js';
import { calcGlobalMetrics } from '../simulation/metrics.js';
import { supabase } from '../lib/supabase.js';

const router = Router();

const GROQ_KEY   = process.env.GROQ_API_KEY;
const GROQ_MODEL = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';
const GROQ_URL   = 'https://api.groq.com/openai/v1/chat/completions';

// ── Build live plant context for system prompt ────────────────────────────────
function buildPlantContext() {
  const machines = getMachinesArray();
  const alerts   = getActiveAlerts();
  const metrics  = calcGlobalMetrics();

  const machineList = machines.map(m =>
    `  - ${m.id} (${m.name}): estado=${m.status}, temp=${m.temp?.toFixed(1)}°C, vib=${m.vib?.toFixed(2)}g, OEE=${m.oee?.toFixed(1)}%, defectos=${m.defect?.toFixed(1)}%`
  ).join('\n');

  const alertList = alerts.slice(0, 5).map(a =>
    `  - [${a.sev}] ${a.machineId || a.machine}: ${a.message || a.title}`
  ).join('\n') || '  (ninguna)';

  return `Eres el asistente de IA industrial de IndustrIA Sigma, planta Querétaro MX-01.
Tenés acceso a datos en tiempo real de la planta. Respondé SIEMPRE en español, de forma concisa y técnica.
Usá datos concretos de la planta en tus respuestas. Cuando des recomendaciones, sé específico (valores, máquinas, acciones).

ESTADO ACTUAL DE LA PLANTA (${new Date().toLocaleTimeString('es-MX')}):
Máquinas:
${machineList}

Alertas activas: ${alerts.length}
${alertList}

Métricas globales:
  - OEE global: ${metrics.oee}%
  - DPMO: ${metrics.dpmo}
  - Nivel sigma: ${metrics.sigma}σ
  - Producción/h: ${metrics.production} piezas
  - Alertas críticas: ${alerts.filter(a => a.sev === 'CRITICAL').length}

Enfocate en: calidad (Cp, Cpk, DPMO), OEE, mantenimiento predictivo y optimización de proceso.
Sé directo. Sin introducciones largas. Máximo 3 párrafos o puntos concretos.`;
}

// ── Call Groq API ─────────────────────────────────────────────────────────────
async function callGroq(messages, maxTokens = 600) {
  if (!GROQ_KEY) throw new Error('GROQ_API_KEY no configurada');

  const res = await fetch(GROQ_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${GROQ_KEY}` },
    body: JSON.stringify({
      model:       GROQ_MODEL,
      messages,
      max_tokens:  maxTokens,
      temperature: 0.4,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `Groq error ${res.status}`);
  }

  const data = await res.json();
  return data.choices[0].message.content.trim();
}

// ── Supabase helpers ──────────────────────────────────────────────────────────
async function dbGetOrCreateConversation(conversationId) {
  if (!supabase) return null;

  if (conversationId) {
    const { data } = await supabase
      .from('conversations')
      .select('id')
      .eq('id', conversationId)
      .single();
    if (data) return data.id;
  }

  const newId = `conv-${Date.now()}`;
  const { data, error } = await supabase
    .from('conversations')
    .insert({ id: newId })
    .select('id')
    .single();

  if (error) { console.error('[Supabase] insert conversation:', error.message); return null; }
  return data.id;
}

async function dbSaveMessage(conversationId, role, content) {
  if (!supabase || !conversationId) return;
  const { error } = await supabase
    .from('messages')
    .insert({ conversation_id: conversationId, role, content });
  if (error) console.error('[Supabase] insert message:', error.message);
}

async function dbGetHistory(conversationId, limit = 10) {
  if (!supabase || !conversationId) return [];
  const { data, error } = await supabase
    .from('messages')
    .select('role, content')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true })
    .limit(limit);
  if (error) { console.error('[Supabase] get history:', error.message); return []; }
  return data || [];
}

async function dbGetConversations() {
  if (!supabase) return state.conversations;
  const { data, error } = await supabase
    .from('conversations')
    .select('id, created_at, messages(role, content, created_at)')
    .order('created_at', { ascending: false })
    .limit(20);
  if (error) { console.error('[Supabase] get conversations:', error.message); return state.conversations; }
  return (data || []).map(c => ({
    id:        c.id,
    createdAt: new Date(c.created_at).getTime(),
    messages:  (c.messages || []).map(m => ({ role: m.role, t: m.content, ts: new Date(m.created_at).getTime() })),
  }));
}

// ── Insights cache (refresh every 5 min) ──────────────────────────────────────
let insightsCache = { data: null, ts: 0 };

async function generateInsights() {
  const now = Date.now();
  if (insightsCache.data && now - insightsCache.ts < 5 * 60 * 1000) {
    return insightsCache.data;
  }

  const systemPrompt = buildPlantContext();
  const userPrompt   = `Generá exactamente 4 insights del estado actual de la planta, en formato JSON array.
Cada insight debe tener: tag (1 palabra en mayúsculas), c (color: red|amber|cyan|green|ai), t (texto del insight, máx 90 chars), ago (tiempo estimado, ej "hace 3m"), conf (confianza como %, ej "91%").
Respondé SOLO con el JSON array, sin texto extra. Ejemplo: [{"tag":"ANOMALÍA","c":"red","t":"...","ago":"hace 5m","conf":"91%"}]`;

  try {
    const raw  = await callGroq([
      { role: 'system', content: systemPrompt },
      { role: 'user',   content: userPrompt },
    ], 400);

    const match = raw.match(/\[[\s\S]*\]/);
    if (!match) throw new Error('No JSON array in response');
    const insights = JSON.parse(match[0]);

    insightsCache = { data: insights, ts: now };
    return insights;
  } catch (e) {
    const machines = getMachinesArray();
    const crit     = machines.filter(m => m.status === 'CRITICAL');
    const warn     = machines.filter(m => m.status === 'WARN');
    const metrics  = calcGlobalMetrics();

    const fallback = [
      crit[0] && { tag:'CRÍTICO', c:'red',   t:`${crit[0].id} en estado crítico — temp ${crit[0].temp?.toFixed(1)}°C`, ago:'ahora', conf:'—' },
      warn[0] && { tag:'ATENCIÓN',c:'amber', t:`${warn[0].id} requiere atención — vibración ${warn[0].vib?.toFixed(2)}g`, ago:'ahora', conf:'—' },
      { tag:'OEE',  c:'cyan', t:`OEE global: ${metrics.oee}% — sigma nivel ${metrics.sigma}σ`, ago:'1m', conf:'—' },
      { tag:'DPMO', c:'ai',   t:`DPMO actual: ${metrics.dpmo} — producción ${metrics.production} pzs/h`, ago:'1m', conf:'—' },
    ].filter(Boolean).slice(0, 4);

    insightsCache = { data: fallback, ts: now };
    return fallback;
  }
}

// ── Routes ────────────────────────────────────────────────────────────────────

// GET /api/ai/conversations
router.get('/conversations', async (_req, res) => {
  try {
    const convs = await dbGetConversations();
    res.json(convs);
  } catch {
    res.json(state.conversations);
  }
});

// POST /api/ai/chat
router.post('/chat', async (req, res) => {
  const { message, conversationId, csvContext } = req.body;
  if (!message?.trim()) return res.status(400).json({ error: 'message requerido' });

  // Persist conversation in Supabase (fallback to in-memory)
  const convId = await dbGetOrCreateConversation(conversationId) || (() => {
    let c = state.conversations.find(c => c.id === conversationId);
    if (!c) { c = { id: `conv-${Date.now()}`, messages: [], createdAt: Date.now() }; state.conversations.unshift(c); }
    return c.id;
  })();

  // Save user message
  await dbSaveMessage(convId, 'user', message);

  // Also mirror in-memory for in-session history if Supabase is up
  let memConv = state.conversations.find(c => c.id === convId);
  if (!memConv) { memConv = { id: convId, messages: [], createdAt: Date.now() }; state.conversations.unshift(memConv); }
  memConv.messages.push({ role: 'user', t: message, ts: Date.now() });

  // Build system prompt
  const systemPrompt = buildPlantContext() +
    (csvContext ? `\n\nDATOS CSV ADJUNTOS (usá estos datos reales para responder):\n${csvContext}` : '');

  // Get history from Supabase or memory
  const dbHistory = await dbGetHistory(convId, 10);
  const history = (dbHistory.length ? dbHistory : memConv.messages.slice(-10)).map(m => ({
    role:    m.role === 'ai' ? 'assistant' : 'user',
    content: m.content || m.t || '',
  }));

  let text;
  try {
    text = await callGroq([{ role: 'system', content: systemPrompt }, ...history]);
  } catch (e) {
    console.error('[AI] Groq error:', e.message);
    text = `Error al conectar con el modelo IA: ${e.message}. Verificá la API key en .env.`;
  }

  // Save AI response
  await dbSaveMessage(convId, 'ai', text);
  const aiMsg = { role: 'ai', t: text, ts: Date.now() };
  memConv.messages.push(aiMsg);

  res.json({ conversationId: convId, response: aiMsg });
});

// GET /api/ai/insights
router.get('/insights', async (_req, res) => {
  try {
    const insights = await generateInsights();
    res.json(insights);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/ai/models
router.get('/models', (_req, res) => {
  res.json([
    { n: GROQ_MODEL.split('-').slice(0, 2).join(' '), v: 'Groq', conf: 97, c: '#A855F7' },
    { n: 'Anomaly-Detect',  v: 'v2.41', conf: 91, c: '#22D3EE' },
    { n: 'Predict-Failure', v: 'v1.8',  conf: 88, c: '#3B82F6' },
    { n: 'Process-Optim',   v: 'v3.0',  conf: 84, c: '#10B981' },
  ]);
});

export default router;
