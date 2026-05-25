import { useState, useEffect, useRef, useCallback } from 'react'
import { Card, Chip, PageHeader, StatusDot } from '../shell'
import { LiveWave } from '../charts'
import { I } from '../icons'
import { useData } from '../context/DataContext'

// ─── Process variable slider ──────────────────────────────────────────────────
function ParamSlider({ label, unit, min, max, step, value, onChange, ideal }) {
  const idealPct = ((ideal - min) / (max - min)) * 100;
  const off      = Math.abs(value - ideal) / Math.max(max - min, 1);
  const color    = off > 0.18 ? '#EF4444' : (off > 0.08 ? '#F59E0B' : '#22D3EE');
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] uppercase tracking-widest text-slate-400">{label}</span>
        <span className="num text-sm font-semibold" style={{ color }}>
          {typeof value === 'number' ? value.toFixed(value % 1 ? 3 : 0) : value}
          <span className="text-slate-500 text-[10px] ml-1">{unit}</span>
        </span>
      </div>
      <div className="relative">
        <input type="range" min={min} max={max} step={step} value={value}
               onChange={e => onChange(parseFloat(e.target.value))} className="w-full"/>
        <div className="absolute top-[-2px] w-0.5 h-2 bg-grind-400"
             style={{ left: `${Math.min(99, Math.max(1, idealPct))}%`, boxShadow: '0 0 4px #10B981' }}/>
      </div>
      <div className="flex justify-between text-[9px] text-slate-500 num mt-0.5">
        <span>{typeof min === 'number' ? min.toFixed(min % 1 ? 2 : 0) : min}</span>
        <span className="text-grind-400">● {typeof ideal === 'number' ? ideal.toFixed(ideal % 1 ? 2 : 0) : ideal}{unit}</span>
        <span>{typeof max === 'number' ? max.toFixed(max % 1 ? 2 : 0) : max}</span>
      </div>
    </div>
  );
}

// ─── Impact row ───────────────────────────────────────────────────────────────
function ImpactRow({ label, value, delta, target, invert }) {
  const good  = invert ? delta < 0 : delta >= 0;
  const color = good ? '#10B981' : '#EF4444';
  return (
    <div className="flex items-center justify-between panel rounded p-2.5">
      <div>
        <div className="text-[10px] uppercase tracking-widest text-slate-500">{label}</div>
        <div className="num text-base text-white">{value}</div>
      </div>
      <div className="text-right">
        <div className="num text-xs" style={{ color }}>{delta >= 0 ? '+' : ''}{typeof delta === 'number' ? delta.toFixed(2) : delta}</div>
        <div className="text-[9px] text-slate-500">vs {target}</div>
      </div>
    </div>
  );
}

// ─── AI suggestion based on actual machine variable deviations ────────────────
function AISuggestion({ params, machineVars, backendResult }) {
  const issues = [];

  if (machineVars) {
    for (const [varName, value] of Object.entries(params)) {
      const entry = machineVars[varName];
      if (!entry) continue;
      const range = Math.max(entry.max - entry.min, 1);
      const dev   = Math.abs(value - entry.base_value) / range;
      if (dev > 0.12) {
        const dir = value > entry.base_value ? 'elevado' : 'bajo';
        issues.push(`${varName.replace(/_/g, ' ')} ${dir} (${value.toFixed(2)} ${entry.unit || ''})`);
      }
      if (issues.length >= 2) break;
    }
  }

  if (backendResult?.defect > 3.5)
    issues.push(`Tasa de defecto alta (${backendResult.defect.toFixed(1)}%) — ejecutá simulación`);

  if (!issues.length)
    return <span>Parámetros dentro de zona óptima ±2σ. Producción estable.</span>;
  return <span>{issues[0]}</span>;
}

// ─── Main screen ──────────────────────────────────────────────────────────────
export default function MonitorSimScreen() {
  const { machines: machinesMap, csvFiles, simulator, machineHistory, recommendations, compareResults, actions } = useData();
  const machinesArr = Object.values(machinesMap);

  const [selected, setSelected]     = useState(() => machinesArr[0]?.id || 'BTL-03');
  const [params, setParams]          = useState({});
  const [simRunning, setSimRunning]  = useState(false);
  const [recommendLoading, setRecommendLoading] = useState(false);

  const machine   = machinesMap[selected] || machinesArr[0];
  const csvData   = csvFiles[selected] || null;
  const liveHistory = machineHistory[selected];
  const activeRecommendation = recommendations?.[selected] || null;
  const activeCompare = compareResults?.[selected] || null;

  // Operative (non-quality) vars for this machine — used for sliders
  const operativeVars = machine
    ? Object.entries(machine.vars || {}).filter(([, e]) => e.type !== 'quality')
    : [];

  // Sync sliders when machine changes: use live values from TICK
  useEffect(() => {
    if (!machine?.vars) return;
    const initial = {};
    for (const [k, e] of Object.entries(machine.vars)) {
      if (e.type !== 'quality') {
        initial[k] = parseFloat((e.value ?? e.base_value ?? 0).toFixed(4));
      }
    }
    setParams(initial);
  }, [selected]);

  // Debounced backend param sync — 600 ms after last slider move
  const debounceRef = useRef(null);
  const syncBackend = useCallback((p) => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      actions.updateSimParams({ machineId: selected, vars: p }).catch(() => {});
    }, 600);
  }, [actions, selected]);

  const handleParam = (key, val) => {
    const next = { ...params, [key]: val };
    setParams(next);
    syncBackend(next);
  };

  const handleRunSim = async () => {
    setSimRunning(true);
    try { await actions.runSimulator(); } catch (_) {}
    setSimRunning(false);
  };

  const handleRecommend = async () => {
    if (!selected) return;
    setRecommendLoading(true);
    try {
      const rec = await actions.fetchRecommendations(selected);
      const top = rec?.scenarios?.[0];
      if (top?.recommendedParams) {
        await actions.fetchCompare({ machineId: selected, recommendedParams: top.recommendedParams });
      }
    } catch (_) {}
    setRecommendLoading(false);
  };

  // Resync sliders from last CSV row
  const handleResyncFromCsv = () => {
    if (!csvData?.rows?.length || !machine?.vars) return;
    const lastRow = csvData.rows[csvData.rows.length - 1];
    const synced  = { ...params };
    for (const [varName, entry] of Object.entries(machine.vars)) {
      if (entry.type === 'quality') continue;
      const key = Object.keys(lastRow).find(k =>
        k.toLowerCase() === varName.toLowerCase() ||
        k.toLowerCase().replace(/_/g, '') === varName.toLowerCase().replace(/_/g, '')
      );
      if (key && !isNaN(parseFloat(lastRow[key]))) {
        synced[varName] = parseFloat(lastRow[key]);
      }
    }
    setParams(synced);
  };

  const br          = simulator?.results && Object.keys(simulator.results).length ? simulator.results : null;
  const statusMap   = { RUNNING:'Operando', WARN:'Atención', CRITICAL:'Crítico', IDLE:'En espera' };
  const statusColor = { RUNNING:'#10B981', WARN:'#F59E0B', CRITICAL:'#EF4444', IDLE:'#64748B' };
  const sc          = statusColor[machine?.status] || '#64748B';
  const accentMap   = { RUNNING:'green', WARN:'amber', CRITICAL:'red', IDLE:'slate' };
  const accent      = accentMap[machine?.status] || 'cyan';
  const impactAccent = br ? (br.defect > 4 ? 'red' : br.defect > 2.5 ? 'amber' : 'green') : 'cyan';

  // CSV last row strip
  const numCols = csvData
    ? csvData.header.filter(h => h.toLowerCase() !== 'fecha_hora' && !isNaN(parseFloat(csvData.rows[0]?.[h]))).slice(0, 6)
    : [];
  const lastRow = csvData?.rows[csvData.rows.length - 1] || {};

  return (
    <div className="p-6 space-y-5">
      <PageHeader
        eyebrow="// SIMULACIÓN · MÁQUINA A MÁQUINA"
        title="Simulador de escenarios"
        desc="Seleccioná una máquina, ajustá los parámetros y observá el impacto predicho en calidad y producción."
        actions={
          <div className="flex items-center gap-2">
            {csvData
              ? <Chip color="green"><span className="w-1.5 h-1.5 rounded-full bg-grind-400 pulse-dot mr-1"/>{csvData.rows.length} registros cargados</Chip>
              : <Chip color="slate">Sin CSV — subí desde Dashboard</Chip>}
          </div>
        }
      />

      {/* Machine selector */}
      {machinesArr.length === 0 && (
        <Card title="Esperando backend" subtitle="Sin máquinas en TICK todavía" accent="cyan">
          <div className="text-sm text-slate-400">Este simulador usa datos reales del backend. Cuando llegue el estado inicial aparecerán las máquinas disponibles.</div>
        </Card>
      )}
      <div className="flex gap-2 flex-wrap">
        {machinesArr.map(m => {
          const isSel  = m.id === selected;
          const hasCSV = !!csvFiles[m.id];
          const c      = statusColor[m.status] || '#64748B';
          return (
            <button key={m.id} onClick={() => setSelected(m.id)}
                    className={`flex items-center gap-2 px-3 py-2 rounded-md text-xs transition border ${
                      isSel
                        ? 'bg-cyan2-400/15 border-cyan2-400/40 text-cyan2-400'
                        : 'panel border-transparent text-slate-400 hover:text-white'
                    }`}>
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: c, boxShadow: `0 0 5px ${c}` }}/>
              <span className="font-mono font-semibold">{m.id}</span>
              <span className="text-slate-500 hidden sm:inline">{m.name}</span>
              {hasCSV && <span className="text-grind-400 text-[9px]">●csv</span>}
            </button>
          );
        })}
      </div>

      {/* CSV last row strip */}
      {csvData && numCols.length > 0 && (
        <div className="panel rounded-lg px-4 py-3 flex items-center gap-6 flex-wrap">
          <div className="text-[9px] uppercase tracking-widest text-slate-500 shrink-0">
            Último registro · {lastRow.fecha_hora || csvData.rows.length + ' pts'}
          </div>
          {numCols.map((col, i) => {
            const v = parseFloat(lastRow[col]);
            const colors = ['#22D3EE','#10B981','#F59E0B','#A855F7','#EF4444','#3B82F6'];
            return (
              <div key={col} className="flex items-center gap-1.5">
                <span className="text-[9px] uppercase tracking-widest text-slate-500">{col.replace(/_/g,' ')}</span>
                <span className="num text-sm font-semibold" style={{ color: colors[i % colors.length] }}>
                  {isNaN(v) ? '—' : v.toFixed(2)}
                </span>
              </div>
            );
          })}
          <button onClick={handleResyncFromCsv}
                  className="ml-auto text-[10px] text-slate-500 hover:text-cyan2-400 flex items-center gap-1 transition">
            {I.refresh} Resincronizar sliders
          </button>
        </div>
      )}

      {/* Main simulation area */}
      <div className="grid grid-cols-12 gap-4">

        {/* Machine status */}
        <Card title={machine?.id || '—'} subtitle={machine?.name}
              className="col-span-12 xl:col-span-3" accent={accent}>
          <div className="flex items-center gap-3 mb-4">
            <StatusDot status={machine?.status}/>
            <span className="text-sm font-medium" style={{ color: sc }}>
              {statusMap[machine?.status] || '—'}
            </span>
          </div>
          <div className="mb-4">
            <LiveWave data={liveHistory?.temp} color={sc}
                      amp={machine?.status === 'IDLE' ? 1 : machine?.status === 'CRITICAL' ? 10 : 6}
                      base={50} speed={machine?.status === 'IDLE' ? 800 : 200} height={36}/>
          </div>
          <div className="space-y-2">
            {[
              { l:'OEE',        v: machine?.oee    != null ? machine.oee.toFixed(1)    + ' %'  : '—' },
              { l:'Defectos',   v: machine?.defect != null ? machine.defect.toFixed(2) + ' %'  : '—' },
              { l:'Proceso',    v: machine?.process || '—' },
              { l:'Línea',      v: machine?.line   || '—' },
            ].map(s => (
              <div key={s.l} className="flex items-center justify-between hairline-bottom pb-1.5 last:border-0 last:pb-0">
                <span className="text-[10px] uppercase tracking-widest text-slate-500">{s.l}</span>
                <span className="num text-sm text-white">{s.v}</span>
              </div>
            ))}
          </div>

          {/* Live sparklines per variable from TICK history */}
          {liveHistory && operativeVars.slice(0, 3).map(([varName, entry]) => {
            const series = liveHistory[varName];
            if (!series || series.length < 2) return null;
            return (
              <div key={varName} className="mt-3">
                <div className="flex items-center justify-between mb-0.5">
                  <span className="text-[9px] uppercase tracking-widest text-slate-500">{varName.replace(/_/g,' ')}</span>
                  <span className="num text-[10px] text-slate-300">{series[series.length-1]?.toFixed(2)} {entry.unit}</span>
                </div>
                <LiveWave data={series} color="#22D3EE" height={20}/>
              </div>
            );
          })}
        </Card>

        {/* Dynamic process variable sliders */}
        <Card title="Variables de proceso"
              subtitle={`${operativeVars.length} variables operativas · ${machine?.id || '—'}`}
              className="col-span-12 xl:col-span-4" accent="cyan">
          <div className="space-y-4 max-h-[520px] overflow-y-auto pr-1">
            {operativeVars.length === 0 && (
              <div className="text-slate-500 text-sm text-center py-6">
                Esperando datos del backend…
              </div>
            )}
            {operativeVars.map(([varName, entry]) => {
              const stepRaw = entry.noise ? Math.max(0.001, entry.noise * 0.1) : 0.1;
              const step    = parseFloat(stepRaw.toFixed(stepRaw < 0.01 ? 4 : stepRaw < 0.1 ? 3 : stepRaw < 1 ? 2 : 0));
              return (
                <ParamSlider
                  key={varName}
                  label={varName.replace(/_/g, ' ')}
                  unit={entry.unit || ''}
                  min={entry.min}
                  max={entry.max}
                  step={step}
                  ideal={entry.base_value}
                  value={params[varName] ?? entry.value}
                  onChange={v => handleParam(varName, v)}
                />
              );
            })}
          </div>
          <div className="mt-4 panel rounded p-3 flex items-start gap-2 border border-ai-400/30">
            <span className="text-ai-400 mt-0.5 shrink-0">{I.bot}</span>
            <div className="text-xs text-slate-300">
              <div className="text-[10px] tracking-[0.25em] uppercase text-ai-400 mb-1">SUGERENCIA IA · {machine?.id}</div>
              <AISuggestion params={params} machineVars={machine?.vars} backendResult={br}/>
            </div>
          </div>
          <button
            onClick={handleRunSim}
            disabled={simRunning}
            className="mt-3 w-full py-2 rounded-md text-xs font-semibold bg-cyan2-400/15 border border-cyan2-400/40 text-cyan2-400 hover:bg-cyan2-400/25 disabled:opacity-40 transition flex items-center justify-center gap-2">
            {simRunning
              ? <><span className="w-3 h-3 border border-cyan2-400/40 border-t-cyan2-400 rounded-full animate-spin"/>Ejecutando…</>
              : <>{I.pulse} Ejecutar simulación en backend</>}
          </button>
          <button
            onClick={handleRecommend}
            disabled={recommendLoading}
            className="mt-2 w-full py-2 rounded-md text-xs font-semibold bg-ai-400/15 border border-ai-400/40 text-ai-400 hover:bg-ai-400/25 disabled:opacity-40 transition flex items-center justify-center gap-2">
            {recommendLoading ? 'Generando…' : 'Generar recomendaciones IA'}
          </button>
        </Card>

        {/* Impact predictor */}
        <Card title="Impacto predicho"
              subtitle={br ? 'Backend · resultado real del motor de simulación' : 'Ejecutá la simulación para ver resultados'}
              className="col-span-12 xl:col-span-5"
              accent={impactAccent}
              glow={br?.defect > 4 ? 'shadow-glowCrit' : ''}>
          {br ? (
            <>
              <div className="mb-2 px-2 py-1 rounded text-[9px] tracking-widest uppercase text-grind-400 bg-grind-400/10 border border-grind-400/20">
                Resultados del backend — {machine?.id} · parámetros enviados
              </div>
              <div className="space-y-2">
                <ImpactRow label="Cp"         value={br.cp.toFixed(2)}           delta={br.cp - 1.33}         target="1.33"/>
                <ImpactRow label="Cpk"        value={br.cpk.toFixed(2)}          delta={br.cpk - 1.33}        target="1.33"/>
                <ImpactRow label="Sigma σ"    value={br.sigma.toFixed(2)}        delta={br.sigma - 4.5}       target="4.5"/>
                <ImpactRow label="Defectos"   value={br.defect.toFixed(2) + '%'} delta={br.defect - 1.4}     target="1.5" invert/>
                <ImpactRow label="Yield"      value={br.yield.toFixed(1) + '%'}  delta={br.yield - 98}        target="98"/>
                <ImpactRow label="Producción" value={br.production + ' u/h'}     delta={br.production - 600}  target="600"/>
              </div>

              <div className="mt-4 panel rounded p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] uppercase tracking-widest text-slate-500">Índice de calidad estimado</span>
                  <span className="num text-sm font-semibold"
                        style={{ color: br.defect > 4 ? '#EF4444' : br.defect > 2.5 ? '#F59E0B' : '#10B981' }}>
                    {br.defect > 4 ? 'CRÍTICO' : br.defect > 2.5 ? 'ATENCIÓN' : 'ÓPTIMO'}
                  </span>
                </div>
                <div className="h-2 rounded bg-slate-700/50 overflow-hidden">
                  <div className="h-full rounded transition-all duration-500"
                       style={{
                         width: `${Math.min(100, br.yield)}%`,
                         background: br.defect > 4
                           ? 'linear-gradient(90deg,#EF4444,#F59E0B)'
                           : br.defect > 2.5
                           ? 'linear-gradient(90deg,#F59E0B,#22D3EE)'
                           : 'linear-gradient(90deg,#10B981,#22D3EE)',
                       }}/>
                </div>
                <div className="flex justify-between text-[9px] text-slate-500 num mt-1">
                  <span>Yield {br.yield.toFixed(1)}%</span>
                  <span>{br.production} u/h</span>
                </div>
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center py-10 text-slate-500 gap-3">
              <div className="w-10 h-10 rounded-full border border-slate-600 flex items-center justify-center text-slate-600">
                {I.pulse}
              </div>
              <div className="text-sm text-center">Sin resultados del backend</div>
              <div className="text-xs text-slate-600 text-center">Ajustá los sliders y presioná<br/>"Ejecutar simulación en backend"</div>
            </div>
          )}
        </Card>

      </div>

      {(activeCompare || activeRecommendation) && (
        <Card title="Comparativa IA" subtitle="Baseline histórico, estado actual y estado recomendado" accent="ai">
          {activeCompare ? (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
              {[
                { label: 'Baseline histórico', value: activeCompare.baseline },
                { label: 'Estado actual', value: activeCompare.current },
                { label: 'Recomendado por IA', value: activeCompare.recommended },
              ].map(column => (
                <div key={column.label} className="panel rounded p-3">
                  <div className="text-[10px] uppercase tracking-widest text-slate-500 mb-2">{column.label}</div>
                  <div className="space-y-1 text-xs text-slate-300 num">
                    <div>Defectos: {column.value.defect.toFixed(2)}%</div>
                    <div>OEE: {column.value.oee.toFixed(1)}%</div>
                    <div>Cp: {column.value.cp.toFixed(2)}</div>
                    <div>Cpk: {column.value.cpk.toFixed(2)}</div>
                    <div>Sigma: {column.value.sigma.toFixed(2)}</div>
                    <div>Producción: {column.value.production}</div>
                    <div>Energía: {column.value.energy}</div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-sm text-slate-500">Generá una recomendación para ver la comparativa.</div>
          )}
          {activeCompare?.improvement && (
            <div className="mt-3 text-xs text-slate-400">
              Mejora estimada: defectos {activeCompare.improvement.defectPct.toFixed(2)}%, OEE {activeCompare.improvement.oeePts.toFixed(2)} pts, sigma {activeCompare.improvement.sigmaPts.toFixed(2)} pts.
            </div>
          )}
          {activeRecommendation?.scenarios?.length ? (
            <div className="mt-3 text-[11px] text-slate-500">
              Recomendaciones activas: {activeRecommendation.scenarios.map(s => s.variable).join(', ')}
            </div>
          ) : null}
        </Card>
      )}
    </div>
  );
}
