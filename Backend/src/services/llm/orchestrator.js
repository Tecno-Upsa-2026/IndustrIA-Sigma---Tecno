import { getMachinesArray, getActiveAlerts, state } from '../../store/state.js';
import { calcGlobalMetrics } from '../../simulation/metrics.js';
import { callProvider } from './provider.js';
import { ruleBasedResponse } from './rule-based.js';

const PROVIDERS = [
  { provider: 'groq', model: 'llama-3.3-70b-versatile' },
  { provider: 'gemini', model: 'gemini-2.0-flash' },
  { provider: 'openrouter', model: 'meta-llama/llama-3.2-3b-instruct:free' },
];

function buildInsightsPrompt(systemPrompt) {
  return `${systemPrompt}\n\nGenerá exactamente 4 insights en formato JSON array. Cada elemento debe tener: tag, c, t, ago, conf. Respondé solo el JSON array.`;
}

function buildRuleBasedInsights() {
  const machines = getMachinesArray();
  const metrics = calcGlobalMetrics();
  const critical = machines.filter(machine => machine.status === 'CRITICAL');
  const warn = machines.filter(machine => machine.status === 'WARN');
  const hottest = [...machines].sort((a, b) => (b.temp || 0) - (a.temp || 0))[0];
  const mostVib = [...machines].sort((a, b) => (b.vib || 0) - (a.vib || 0))[0];

  return [
    critical[0] && { tag: 'CRÍTICO', c: 'red', t: `${critical[0].id} en estado crítico`, ago: 'ahora', conf: '—' },
    warn[0] && { tag: 'ATENCIÓN', c: 'amber', t: `${warn[0].id} requiere atención`, ago: 'ahora', conf: '—' },
    hottest && { tag: 'TEMP', c: 'cyan', t: `${hottest.id} es la máquina más caliente`, ago: '1m', conf: '—' },
    mostVib && { tag: 'VIB', c: 'ai', t: `${mostVib.id} concentra la mayor vibración`, ago: '1m', conf: '—' },
    metrics && { tag: 'OEE', c: 'green', t: `OEE global ${metrics.oee}%`, ago: '1m', conf: '—' },
    state.alerts && { tag: 'ALERTAS', c: 'amber', t: `${getActiveAlerts().length} alertas activas`, ago: '1m', conf: '—' },
  ].filter(Boolean).slice(0, 4);
}

async function tryProviders(messages, systemPrompt, context, options = {}) {
  const preparedMessages = [{ role: 'system', content: systemPrompt }, ...messages];
  for (const providerConfig of PROVIDERS) {
    try {
      const text = await callProvider(providerConfig, preparedMessages, options);
      if (text) {
        return { text, provider: providerConfig.provider, mode: 'llm' };
      }
    } catch (error) {
      if (!['429', '503'].some(code => String(error.message || '').includes(code))) {
        // Continue to the next provider regardless of the exact failure.
      }
    }
  }

  return ruleBasedResponse(preparedMessages, systemPrompt, context);
}

export async function chat(messages, systemPrompt, context = null) {
  return tryProviders(messages, systemPrompt, context, { timeoutMs: 15000, maxTokens: 700, temperature: 0.4 });
}

export async function generateInsights(systemPrompt) {
  const insightPrompt = buildInsightsPrompt(systemPrompt);
  const result = await tryProviders([
    { role: 'user', content: insightPrompt },
  ], systemPrompt, null, { timeoutMs: 15000, maxTokens: 400, temperature: 0.2 });

  if (result.mode === 'rule-based') {
    return { insights: buildRuleBasedInsights(), mode: 'rule-based', provider: 'rule-based' };
  }

  const match = result.text.match(/\[[\s\S]*\]/);
  if (!match) {
    return { insights: buildRuleBasedInsights(), mode: 'rule-based', provider: 'rule-based' };
  }

  try {
    return { insights: JSON.parse(match[0]), mode: result.mode, provider: result.provider };
  } catch {
    return { insights: buildRuleBasedInsights(), mode: 'rule-based', provider: 'rule-based' };
  }
}
