const anomalyHistory = {};

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function createRng(seed = 12345) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function hashText(text) {
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = Math.imul(31, hash) + text.charCodeAt(i) | 0;
  }
  return hash >>> 0;
}

function cFactor(n) {
  if (n <= 1) return 0;
  return 2 * Math.log(n - 1) + 0.5772 - (2 * (n - 1)) / n;
}

function ensureHistory(machine, profile) {
  if (!anomalyHistory[machine.id]) {
    anomalyHistory[machine.id] = { window: {}, scores: [], continuousCount: 0, samples: 0 };
  }

  const history = anomalyHistory[machine.id];
  for (const [name, entry] of Object.entries(profile.variables || {})) {
    if (entry.type !== 'operative') continue;
    if (!history.window[name]) history.window[name] = [];
    const value = machine.vars?.[name]?.value ?? machine[name] ?? entry.base_value;
    history.window[name].push(value);
    if (history.window[name].length > 200) history.window[name].shift();
  }

  history.samples += 1;
  return history;
}

function pathLengthForTree(values, currentValue, rng, depth = 0) {
  if (!values.length) return depth;
  if (values.length <= 1 || depth > 12) return depth + cFactor(values.length || 1);

  const min = Math.min(...values);
  const max = Math.max(...values);
  if (min === max) return depth + cFactor(values.length);

  const split = min + rng() * (max - min);
  const left = [];
  const right = [];
  for (const value of values) {
    if (value < split) left.push(value);
    else right.push(value);
  }

  const currentSide = currentValue < split ? left : right;
  if (!currentSide.length || currentSide.length === values.length) {
    return depth + 1 + cFactor(values.length);
  }

  return pathLengthForTree(currentSide, currentValue, rng, depth + 1);
}

function scoreTree(windowValues, currentValue, rng) {
  const sample = windowValues.length > 64 ? [...windowValues].sort(() => rng() - 0.5).slice(0, 64) : [...windowValues];
  if (sample.length <= 1) return 0;
  const pathLength = pathLengthForTree(sample, currentValue, rng);
  const cn = cFactor(sample.length);
  if (cn <= 0) return 0;
  return Math.pow(2, -pathLength / cn);
}

export function detectAnomaly(machine, profile) {
  const history = ensureHistory(machine, profile);
  const operativeVars = Object.entries(profile.variables || {}).filter(([, entry]) => entry.type === 'operative' && entry.spring != null);
  if (!operativeVars.length) {
    machine.anomalyScore = 0;
    history.scores.push(0);
    if (history.scores.length > 200) history.scores.shift();
    return 0;
  }

  const enoughData = operativeVars.every(([name]) => (history.window[name] || []).length >= 30);
  if (!enoughData) {
    machine.anomalyScore = 0;
    history.continuousCount = 0;
    history.scores.push(0);
    if (history.scores.length > 200) history.scores.shift();
    return 0;
  }

  const rng = createRng(hashText(machine.id) ^ history.samples);
  let total = 0;
  let trees = 0;

  for (let i = 0; i < 50; i++) {
    const [varName] = operativeVars[Math.floor(rng() * operativeVars.length)];
    const windowValues = history.window[varName] || [];
    const currentValue = machine.vars?.[varName]?.value ?? machine[varName] ?? windowValues[windowValues.length - 1] ?? 0;
    total += scoreTree(windowValues, currentValue, rng);
    trees++;
  }

  const avgScore = trees ? total / trees : 0;
  let anomalyScore = clamp(avgScore, 0, 1);

  if (anomalyScore >= 0.7) history.continuousCount += 1;
  else if (history.continuousCount > 0) history.continuousCount -= 1;

  if (history.continuousCount >= 3) {
    anomalyScore = Math.max(anomalyScore, 0.72);
  }

  machine.anomalyScore = parseFloat(anomalyScore.toFixed(4));
  history.scores.push(machine.anomalyScore);
  if (history.scores.length > 200) history.scores.shift();
  return machine.anomalyScore;
}

export function getAnomalyTrend(machineId) {
  return (anomalyHistory[machineId]?.scores || []).slice(-20);
}

export { anomalyHistory };
