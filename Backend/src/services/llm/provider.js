const DEFAULT_TIMEOUT = 15000;

function withTimeout(timeoutMs = DEFAULT_TIMEOUT) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return { controller, timer };
}

function extractText(data) {
  return data?.choices?.[0]?.message?.content?.trim?.() || data?.candidates?.[0]?.content?.parts?.map(part => part.text || '').join('')?.trim?.() || '';
}

async function callGroq(messages, options = {}) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error('GROQ_API_KEY no configurada');

  const { controller, timer } = withTimeout(options.timeoutMs);
  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: options.model || 'llama-3.3-70b-versatile',
        messages,
        temperature: options.temperature ?? 0.4,
        max_tokens: options.maxTokens ?? 700,
      }),
    });

    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({}));
      throw new Error(errorBody.error?.message || `Groq error ${response.status}`);
    }

    return extractText(await response.json());
  } finally {
    clearTimeout(timer);
  }
}

async function callGemini(messages, options = {}) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY no configurada');

  const systemPrompt = messages.filter(message => message.role === 'system').map(message => message.content).join('\n\n');
  const contents = messages.filter(message => message.role !== 'system').map(message => ({
    role: message.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: message.content }],
  }));

  const { controller, timer } = withTimeout(options.timeoutMs);
  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        systemInstruction: systemPrompt ? { parts: [{ text: systemPrompt }] } : undefined,
        contents,
        generationConfig: {
          temperature: options.temperature ?? 0.4,
          maxOutputTokens: options.maxTokens ?? 700,
        },
      }),
    });

    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({}));
      throw new Error(errorBody.error?.message || `Gemini error ${response.status}`);
    }

    return extractText(await response.json());
  } finally {
    clearTimeout(timer);
  }
}

async function callOpenRouter(messages, options = {}) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error('OPENROUTER_API_KEY no configurada');

  const { controller, timer } = withTimeout(options.timeoutMs);
  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        'HTTP-Referer': process.env.OPENROUTER_REFERER || 'http://localhost:3001',
        'X-Title': process.env.OPENROUTER_APP_NAME || 'IndustrIA Sigma',
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: options.model || 'meta-llama/llama-3.2-3b-instruct:free',
        messages,
        temperature: options.temperature ?? 0.4,
        max_tokens: options.maxTokens ?? 700,
      }),
    });

    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({}));
      throw new Error(errorBody.error?.message || `OpenRouter error ${response.status}`);
    }

    return extractText(await response.json());
  } finally {
    clearTimeout(timer);
  }
}

export async function callProvider(providerConfig, messages, options = {}) {
  const provider = providerConfig?.provider || providerConfig?.name;
  if (provider === 'groq') return callGroq(messages, { ...options, ...providerConfig });
  if (provider === 'gemini') return callGemini(messages, { ...options, ...providerConfig });
  if (provider === 'openrouter') return callOpenRouter(messages, { ...options, ...providerConfig });
  throw new Error(`Proveedor no soportado: ${provider}`);
}
