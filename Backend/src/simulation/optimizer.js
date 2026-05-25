import { predictBottlingMetrics } from './bottling.js';
// FUTURE: Restore furnace prediction routing when multi-process support is enabled.
import { predictFurnaceMetrics } from './furnace.js';

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function pickPrediction(profile, vars) {
  if (profile.process === 'BOTTLING') return predictBottlingMetrics(vars, profile);
  // FUTURE: Re-enable furnace prediction routing when furnace simulation returns.
  if (profile.process === 'FURNACE') return predictFurnaceMetrics(vars, profile);
  return { defect: 0, oee: 0 };
}

function candidateValues(entry) {
  const base = entry.base_value;
  const sigma = Math.max(entry.noise || Math.abs(base) * 0.02 || 0.1, 0.01);
  return [base - 2 * sigma, base - sigma, base, base + sigma, base + 2 * sigma].map(value => clamp(value, entry.min, entry.max));
}

function cartesianLimited(variables, candidatesMap, limit) {
  const results = [];

  function walk(index, current) {
    if (results.length >= limit) return;
    if (index >= variables.length) {
      results.push({ ...current });
      return;
    }

    const name = variables[index];
    for (const value of candidatesMap.get(name) || []) {
      current[name] = value;
      walk(index + 1, current);
      if (results.length >= limit) return;
    }
  }

  walk(0, {});
  return results;
}

function buildCandidateSet(profile) {
  const operative = Object.entries(profile.variables)
    .filter(([, entry]) => entry.type === 'operative' && entry.spring != null)
    .map(([name]) => name);

  const candidatesMap = new Map();
  for (const name of operative) {
    candidatesMap.set(name, candidateValues(profile.variables[name]));
  }

  let selected = [...operative];
  while (selected.length > 1 && Math.pow(5, selected.length) > 500) {
    selected = selected.slice(0, selected.length - 1);
  }

  return { selected, candidatesMap };
}

function scoreCombination(prediction) {
  const defectScore = clamp(prediction.defect / 20, 0, 1);
  const oeeScore = 1 - clamp(prediction.oee / 100, 0, 1);
  return defectScore * 0.7 + oeeScore * 0.3;
}

export function optimize(profile, constraints = {}) {
  if (!profile?.variables) return null;

  const { selected, candidatesMap } = buildCandidateSet(profile);
  const limit = Math.min(constraints.maxCombinations || 500, 500);
  const combos = cartesianLimited(selected, candidatesMap, limit);
  const evaluations = [];

  const baseVars = Object.fromEntries(
    Object.entries(profile.variables).map(([name, entry]) => [name, entry.base_value]),
  );

  for (const combo of combos) {
    const vars = { ...baseVars, ...combo };
    const prediction = pickPrediction(profile, vars);
    const cost = scoreCombination(prediction);
    evaluations.push({
      params: combo,
      cost,
      defect: prediction.defect,
      oee: prediction.oee,
    });
  }

  evaluations.sort((a, b) => a.cost - b.cost);
  return evaluations[0] || null;
}

export function getRecommendedSetpoints(profile, constraints = {}) {
  if (!profile?.variables) return [];

  const { selected, candidatesMap } = buildCandidateSet(profile);
  const limit = Math.min(constraints.maxCombinations || 500, 500);
  const combos = cartesianLimited(selected, candidatesMap, limit);

  const baseVars = Object.fromEntries(
    Object.entries(profile.variables).map(([name, entry]) => [name, entry.base_value]),
  );

  const ranked = combos.map(combo => {
    const vars = { ...baseVars, ...combo };
    const prediction = pickPrediction(profile, vars);
    return {
      params: combo,
      cost: scoreCombination(prediction),
      defect: prediction.defect,
      oee: prediction.oee,
    };
  }).sort((a, b) => a.cost - b.cost);

  return ranked.slice(0, 3);
}
