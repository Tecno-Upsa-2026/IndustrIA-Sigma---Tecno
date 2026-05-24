import { Router } from 'express';
import { state, getMachinesArray, getActiveAlerts } from '../store/state.js';
import { calcGlobalMetrics } from '../simulation/metrics.js';
import { supabase } from '../lib/supabase.js';
import { chat, generateInsights } from '../services/llm/orchestrator.js';

const router = Router();

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

  const aiResult = await chat(history, systemPrompt, csvContext);
  const text = aiResult.text || 'No se pudo generar una respuesta.';

  // Save AI response
  await dbSaveMessage(convId, 'ai', text);
  const aiMsg = { role: 'ai', t: text, ts: Date.now() };
  memConv.messages.push(aiMsg);

  res.json({ conversationId: convId, response: aiMsg, provider: aiResult.provider, mode: aiResult.mode });
});

// GET /api/ai/insights
router.get('/insights', async (_req, res) => {
  try {
    const now = Date.now();
    if (insightsCache.data && now - insightsCache.ts < 5 * 60 * 1000) {
      return res.json(insightsCache.data);
    }

    const result = await generateInsights(buildPlantContext());
    insightsCache = { data: result, ts: now };
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/ai/models
router.get('/models', (_req, res) => {
  res.json([
    { n: 'llama 3.3', v: 'Groq', conf: 97, c: '#A855F7' },
    { n: 'Anomaly-Detect',  v: 'v2.41', conf: 91, c: '#22D3EE' },
    { n: 'Predict-Failure', v: 'v1.8',  conf: 88, c: '#3B82F6' },
    { n: 'Process-Optim',   v: 'v3.0',  conf: 84, c: '#10B981' },
  ]);
});

export default router;
