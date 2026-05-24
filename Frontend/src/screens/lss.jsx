import { useEffect, useState, useRef } from 'react'
import { Card, Stat, PageHeader, Chip } from '../shell'
import { SparkLine, ParetoChart, Histogram, ControlChart } from '../charts'
import { PARETO, ISHIKAWA } from '../data'
import { I } from '../icons'
import { useData } from '../context/DataContext'
import { generatePDF } from '../lib/pdf'
import { supabase } from '../lib/supabase'

// ─── SPC calculation from raw values ─────────────────────────────────────────
function erf(x) {
  const a1=0.254829592, a2=-0.284496736, a3=1.421413741, a4=-1.453152027, a5=1.061405429, p=0.3275911;
  const sign = x < 0 ? -1 : 1;
  const t = 1 / (1 + p * Math.abs(x));
  const y = 1 - (((((a5*t+a4)*t)+a3)*t+a2)*t+a1)*t*Math.exp(-x*x);
  return sign * y;
}
function normalCDF(x, mean, sd) { return 0.5 * (1 + erf((x - mean) / (sd * Math.SQRT2))); }

function computeSPCStats(values) {
  if (!values || values.length < 5) return null;
  const n    = values.length;
  const mean = values.reduce((a, b) => a + b, 0) / n;
  const sd   = Math.sqrt(values.reduce((a, b) => a + (b - mean) ** 2, 0) / n);
  if (sd < 1e-9) return null;

  const ucl = mean + 3 * sd;
  const lcl = mean - 3 * sd;
  // Specification limits: ±2.5σ (tighter than control limits)
  const usl = mean + 2.5 * sd;
  const lsl = mean - 2.5 * sd;

  const cp  = (usl - lsl) / (6 * sd);
  const cpu = (usl - mean) / (3 * sd);
  const cpl = (mean - lsl) / (3 * sd);
  const cpk = Math.min(cpu, cpl);
  const pp  = cp;
  const ppk = cpk;

  // Sigma level and yield from normal distribution
  const sigma   = Math.max(0, 3 + (cpk - 1) * 2);
  const yieldPct = (normalCDF(usl, mean, sd) - normalCDF(lsl, mean, sd)) * 100;

  // Moving range stats
  const mr     = values.slice(1).map((v, i) => Math.abs(v - values[i]));
  const mrMean = mr.reduce((a, b) => a + b, 0) / mr.length;

  // Skewness
  const skewness = values.reduce((a, b) => a + ((b - mean) / sd) ** 3, 0) / n;

  return { mean, sd, ucl, lcl, usl, lsl, cp, cpk, pp, ppk, sigma, yield: yieldPct, mr, mrMean, skewness };
}

// ─── Pearson correlation ──────────────────────────────────────────────────────
function pearsonCorr(xs, ys) {
  const n = Math.min(xs.length, ys.length);
  if (n < 3) return 0;
  const mx = xs.slice(0,n).reduce((a,b)=>a+b,0)/n;
  const my = ys.slice(0,n).reduce((a,b)=>a+b,0)/n;
  const num = xs.slice(0,n).reduce((acc,x,i)=>acc+(x-mx)*(ys[i]-my),0);
  const da  = Math.sqrt(xs.slice(0,n).reduce((acc,x)=>acc+(x-mx)**2,0));
  const db  = Math.sqrt(ys.slice(0,n).reduce((acc,y)=>acc+(y-my)**2,0));
  return da && db ? num/(da*db) : 0;
}

// ─── Pareto from CSV ──────────────────────────────────────────────────────────
function computeCSVPareto(csvData) {
  if (!csvData?.rows?.length) return null;
  const numCols = csvData.header.filter(h =>
    h.toLowerCase() !== 'fecha_hora' && !isNaN(parseFloat(csvData.rows[0]?.[h]))
  );
  // Quality column to correlate against (prefer defectos, else yield inverted)
  const qualCol = numCols.find(h => /defecto|defect/i.test(h))
    || numCols.find(h => /yield/i.test(h));
  const qualVals = qualCol
    ? csvData.rows.map(r => parseFloat(r[qualCol])).filter(v => !isNaN(v))
    : null;
  const srcCols = numCols.filter(h => h !== qualCol);

  const items = srcCols.map(col => {
    const vals = csvData.rows.map(r => parseFloat(r[col])).filter(v => !isNaN(v));
    if (vals.length < 3) return null;
    let score;
    if (qualVals && qualVals.length === vals.length) {
      // correlation with defects (higher = more impact)
      const corr = pearsonCorr(vals, qualVals);
      // if quality col is yield (higher=good), invert sign
      score = /yield/i.test(qualCol) ? Math.abs(-corr) * 100 : Math.abs(corr) * 100;
    } else {
      const mean = vals.reduce((a,b)=>a+b,0)/vals.length;
      const sd   = Math.sqrt(vals.reduce((a,b)=>a+(b-mean)**2,0)/vals.length);
      score = mean !== 0 ? (sd/Math.abs(mean))*100 : sd;
    }
    const label = col.replace(/_/g,' ').replace(/\b\w/g, c => c.toUpperCase());
    return { cause: label, count: score, col };
  }).filter(Boolean).sort((a,b) => b.count - a.count).slice(0, 7);

  if (!items.length) return null;
  // Scale so the largest bar = 100 and others are proportional integers
  const max = items[0].count;
  return items.map(it => ({ cause: it.cause, count: Math.max(1, Math.round((it.count/max)*100)) }));
}

// ─── Ishikawa from CSV ────────────────────────────────────────────────────────
const M6 = {
  'Máquina':    ['temperatura','temp','vibracion','torque','rpm','presion_bar'],
  'Material':   ['humedad','material','pellet'],
  'Método':     ['velocidad','presion','ciclo','setpoint'],
  'Medición':   ['diametro','diameter','medida','dim','oee'],
  'Mano obra':  [],
  'Medio amb.': ['hr','temp_amb','ambiente'],
};

function buildCSVIshikawa(csvData, problem) {
  if (!csvData?.rows?.length) return null;
  const numCols = csvData.header.filter(h =>
    h.toLowerCase() !== 'fecha_hora' && !isNaN(parseFloat(csvData.rows[0]?.[h]))
  );
  // Compute σ and CV per column
  const stats = {};
  numCols.forEach(col => {
    const vals = csvData.rows.map(r => parseFloat(r[col])).filter(v => !isNaN(v));
    if (vals.length < 2) return;
    const mean = vals.reduce((a,b)=>a+b,0)/vals.length;
    const sd   = Math.sqrt(vals.reduce((a,b)=>a+(b-mean)**2,0)/vals.length);
    stats[col] = { mean, sd, cv: mean !== 0 ? (sd/Math.abs(mean))*100 : 0 };
  });

  const assigned = new Set();
  const branches = Object.entries(M6).map(([cat, kw]) => {
    const matched = numCols.filter(col => {
      if (assigned.has(col)) return false;
      const low = col.toLowerCase();
      return kw.some(k => low.includes(k));
    }).sort((a,b) => (stats[b]?.cv||0) - (stats[a]?.cv||0)).slice(0, 3);
    matched.forEach(c => assigned.add(c));

    const causes = matched.length
      ? matched.map(col => {
          const s = stats[col];
          const name = col.replace(/_/g,' ');
          return s ? `${name} (σ=${s.sd.toFixed(2)})` : name;
        })
      : [`${cat}: sin datos`];
    return { name: cat, causes };
  });

  // Remaining cols → Medición branch
  numCols.filter(c => !assigned.has(c)).slice(0, 2).forEach(col => {
    const s = stats[col];
    const cause = s ? `${col.replace(/_/g,' ')} (σ=${s.sd.toFixed(2)})` : col.replace(/_/g,' ');
    const med = branches.find(b => b.name === 'Medición');
    if (med && med.causes.length < 3) med.causes.push(cause);
  });

  return { problem: problem || ISHIKAWA.problem, branches };
}

const PHASE_META = [
  { p:'D', name:'Define',  c:'#22D3EE' },
  { p:'M', name:'Measure', c:'#22D3EE' },
  { p:'A', name:'Analyze', c:'#A855F7' },
  { p:'I', name:'Improve', c:'#F59E0B' },
  { p:'C', name:'Control', c:'#64748B' },
];

// Auto-compute phase progress from real data
function autoPhases(spc, points, csvFiles, activeCsvId) {
  const hasCSV  = Object.keys(csvFiles).length > 0;
  const csvRows = activeCsvId ? (csvFiles[activeCsvId]?.rows?.length ?? 0) : 0;
  const cp      = spc.cp  ?? 0;
  const cpk     = spc.cpk ?? 0;
  const hasSPC  = points.length > 0 && cp > 0;
  const ooc     = hasSPC ? points.filter(v => v > spc.ucl || v < spc.lcl).length : 0;

  // D: have a machine identified + CSV = fully defined
  const D = hasCSV ? 100 : 60;

  // M: based on data quantity
  const M = !hasCSV ? 30 : csvRows >= 30 ? 100 : Math.round((csvRows / 30) * 100);

  // A: based on SPC analysis depth
  let A = 20;
  if (hasSPC) A = ooc > 0 ? 82 : 68;

  // I: based on Cpk vs 1.33 target
  let Iv = 15;
  if (hasSPC) {
    if (cpk >= 1.33)      Iv = 85;
    else if (cpk >= 1.0)  Iv = 55;
    else                  Iv = 30;
  }

  // C: sustained control — all recent 10 points within limits?
  let C = 8;
  if (hasSPC && points.length >= 10) {
    const recent = points.slice(-10);
    const allOk  = recent.every(v => v >= spc.lcl && v <= spc.ucl);
    C = allOk && cpk >= 1.33 ? 60 : allOk ? 38 : 18;
  }

  return { D, M, A: Math.min(100, A), I: Math.min(100, Iv), C: Math.min(100, C) };
}

export default function LSSScreen() {
  const { lss, metrics, spcData, csvFiles, activeCsvId, actions } = useData();
  const [exporting,    setExporting]    = useState(false);
  const [manualPhases, setManualPhases] = useState({});
  const [editingPhase, setEditingPhase] = useState(null);
  const [editVal,      setEditVal]      = useState('');
  const [selMachine,   setSelMachine]   = useState('');
  const inputRef = useRef(null);

  const csvMachines = Object.keys(csvFiles);
  const backendMachines = Object.keys(spcData);
  const machineId   = selMachine || activeCsvId || csvMachines[0] || backendMachines[0] || '';

  useEffect(() => {
    actions.fetchLSS().catch(() => {});
    actions.fetchSPCAll().catch(() => {});
  }, []);

  // Load saved manual overrides from Supabase
  useEffect(() => {
    if (!supabase) return;
    supabase.from('dmaic_projects').select('phases_manual').eq('machine_id', machineId).single()
      .then(({ data }) => { if (data?.phases_manual) setManualPhases(data.phases_manual); });
  }, [machineId]);

  // Focus input when editing starts
  useEffect(() => {
    if (editingPhase) inputRef.current?.focus();
  }, [editingPhase]);

  const handleExportPDF = async () => {
    setExporting(true);
    try {
      await generatePDF({
        elementId: 'lss-capture',
        tipo:      'LSS',
        nombre:    `Lean Six Sigma · ${machineId} · ${new Date().toLocaleDateString('es-MX')}`,
        autor:     'Sistema',
      });
    } catch (e) {
      console.error('[PDF]', e.message);
      alert('Error al generar PDF: ' + e.message);
    } finally {
      setExporting(false);
    }
  };

  const startEdit = (p, currentPct) => {
    setEditingPhase(p);
    setEditVal(String(currentPct));
  };

  const commitEdit = async (p) => {
    const pct = Math.max(0, Math.min(100, parseInt(editVal, 10) || 0));
    const next = { ...manualPhases, [p]: pct };
    setManualPhases(next);
    setEditingPhase(null);
    if (!supabase) return;
    await supabase.from('dmaic_projects').upsert(
      { machine_id: machineId, phases_manual: next, updated_at: new Date().toISOString() },
      { onConflict: 'machine_id' }
    );
  };

  const resetPhase = async (p) => {
    const next = { ...manualPhases };
    delete next[p];
    setManualPhases(next);
    if (!supabase) return;
    await supabase.from('dmaic_projects').upsert(
      { machine_id: machineId, phases_manual: next, updated_at: new Date().toISOString() },
      { onConflict: 'machine_id' }
    );
  };

  const liveSigma = metrics?.sigma || null;
  const liveYield = metrics?.yield || null;

  // ── CSV column selector for SPC ──────────────────────────────────────────────
  const [spcCol, setSpcCol] = useState(null);

  const activeCSV   = csvFiles[machineId] || csvFiles[activeCsvId] || Object.values(csvFiles)[0] || null;
  const numericCols = activeCSV
    ? activeCSV.header.filter(h =>
        h.toLowerCase() !== 'fecha_hora' &&
        !isNaN(parseFloat(activeCSV.rows[0]?.[h]))
      )
    : [];

  // Auto-select best column when CSV loads
  useEffect(() => {
    if (!numericCols.length) return;
    const preferred = numericCols.find(c => /diametro|diameter|medida|valor|dim/i.test(c));
    setSpcCol(prev => prev && numericCols.includes(prev) ? prev : (preferred || numericCols[0]));
  }, [activeCSV?.name]);

  // Compute SPC from selected CSV column
  const csvValues  = activeCSV && spcCol
    ? activeCSV.rows.map(r => parseFloat(r[spcCol])).filter(v => !isNaN(v))
    : [];
  const csvSPC = computeSPCStats(csvValues);

  // Priority: backend > CSV
  const liveINJ      = spcData[machineId];
  const backendPts   = liveINJ?.points?.map(p => p.value) || [];
  const backendStats = liveINJ?.stats || {};
  const hasBackend   = backendPts.length > 0;

  const points = hasBackend ? backendPts : csvValues;
  const hasSPC = points.length > 0;
  const usingCSV = !hasBackend && csvValues.length > 0;

  // Merge stats from best available source
  const src = hasBackend ? backendStats : (csvSPC || {});
  const spc = hasSPC ? {
    points,
    mean: src.mean,
    sd:   src.sd,
    ucl:  src.ucl,
    lcl:  src.lcl,
    usl:  src.usl,
    lsl:  src.lsl,
    cp:   src.cp,
    cpk:  src.cpk,
    pp:   src.pp ?? src.cp,
    ppk:  src.ppk ?? src.cpk,
  } : null;

  const mr       = points.slice(1).map((v, i) => Math.abs(v - points[i]));
  const mrMean   = mr.reduce((a, b) => a + b, 0) / (mr.length || 1);
  const skewness = src.skewness ?? (hasBackend ? backendStats.skewness : null);

  // Live sigma/yield: prefer CSV-computed over hardcoded fallback
  const displaySigma = liveSigma ?? (usingCSV && csvSPC ? csvSPC.sigma.toFixed(2) + 'σ' : null);
  const displayYield = liveYield ?? (usingCSV && csvSPC ? csvSPC.yield.toFixed(1) + '%' : null);

  if (!hasSPC || !spc) {
    return (
      <div id="lss-capture" className="p-6 space-y-5">
        <PageHeader
          eyebrow="// LEAN SIX SIGMA · SPC"
          title="Lean Six Sigma"
          desc="DMAIC, análisis de capacidad, Ishikawa, control estadístico y distribución — por máquina."
        />
        <Card title="Esperando datos" subtitle="Sin TICK del backend ni CSV cargado" accent="cyan">
          <div className="text-sm text-slate-400">Carga un CSV o espera datos reales del backend para mostrar SPC, Pareto y DMAIC.</div>
        </Card>
      </div>
    );
  }

  // Pareto and Ishikawa: real CSV data when available
  const csvPareto   = activeCSV ? computeCSVPareto(activeCSV)       : null;
  const csvIshikawa = activeCSV ? buildCSVIshikawa(activeCSV, `Análisis · ${machineId}`) : null;
  const paretoData   = csvPareto   || PARETO;
  const ishikawaData = csvIshikawa || ISHIKAWA;

  return (
    <div id="lss-capture" className="p-6 space-y-5">
      <PageHeader
        eyebrow="// LEAN SIX SIGMA · SPC"
        title="Lean Six Sigma"
        desc="DMAIC, análisis de capacidad, Ishikawa, control estadístico y distribución — por máquina."
        actions={
          <div className="flex items-center gap-2 flex-wrap">
            {csvMachines.length > 0 && (
              <select
                value={machineId}
                onChange={e => { setSelMachine(e.target.value); setManualPhases({}); setSpcCol(null); }}
                className="panel rounded-md px-3 py-2 text-xs text-cyan2-400 bg-transparent outline-none cursor-pointer"
              >
                {csvMachines.map(id => (
                  <option key={id} value={id} className="bg-slate-900">{csvFiles[id]?.name || id}</option>
                ))}
              </select>
            )}
            {csvMachines.length === 0 && (
              <div className="panel rounded-md px-3 py-2 text-xs text-slate-300 hairline flex items-center gap-2">
                <span className="text-cyan2-400">{I.flask}</span> Proyecto · {machineId}
              </div>
            )}
            <button onClick={handleExportPDF} disabled={exporting}
                    className="px-3 py-2 text-xs rounded-md bg-cyan2-400/15 border border-cyan2-400/40 text-cyan2-400 flex items-center gap-2 disabled:opacity-50">
              {exporting
                ? <><span className="w-3 h-3 border-2 border-cyan2-400 border-t-transparent rounded-full animate-spin"/> Generando…</>
                : <>{I.download} PDF</>}
            </button>
          </div>
        }
      />

      {/* DMAIC Phases */}
      {(() => {
        const auto   = autoPhases(spc, points, csvFiles, activeCsvId);
        const phases = PHASE_META.map(ph => {
          const pct      = manualPhases[ph.p] ?? auto[ph.p];
          const isManual = ph.p in manualPhases;
          return { ...ph, pct, isManual };
        });
        return (
          <Card title={`Proyecto DMAIC · ${machineId}`}
                subtitle={`${activeCSV ? activeCSV.name : 'Sin CSV'} · ${csvValues.length} registros — clic en % para editar`}
                accent="ai">
            <div className="grid grid-cols-5 gap-2">
              {phases.map((p, i) => (
                <div key={p.p} className="panel rounded p-3 relative overflow-hidden group">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-8 h-8 rounded grid place-items-center font-display font-bold text-lg"
                         style={{color:p.c, background:`${p.c}1c`, boxShadow:`inset 0 0 0 1px ${p.c}55`}}>{p.p}</div>
                    <div>
                      <div className="flex items-center gap-1">
                        <span className="text-[10px] uppercase tracking-widest text-slate-500">Fase {i+1}</span>
                        {p.isManual
                          ? <span title="Editado manualmente" className="text-[8px] px-1 rounded bg-warn-400/15 text-warn-400 border border-warn-400/25">manual</span>
                          : <span title="Calculado automáticamente" className="text-[8px] px-1 rounded bg-cyan2-400/10 text-cyan2-400 border border-cyan2-400/20">auto</span>}
                      </div>
                      <div className="text-sm text-white font-medium">{p.name}</div>
                    </div>
                  </div>
                  <div className="h-1.5 rounded bg-slate-700/40 overflow-hidden">
                    <div className="h-full transition-all duration-700"
                         style={{width:`${p.pct}%`, background:p.c, boxShadow:`0 0 6px ${p.c}`}}/>
                  </div>
                  {/* Editable percentage */}
                  <div className="mt-1.5 flex items-center justify-between">
                    {editingPhase === p.p ? (
                      <input
                        ref={inputRef}
                        type="number" min="0" max="100"
                        value={editVal}
                        onChange={e => setEditVal(e.target.value)}
                        onBlur={() => commitEdit(p.p)}
                        onKeyDown={e => { if (e.key==='Enter') commitEdit(p.p); if (e.key==='Escape') setEditingPhase(null); }}
                        className="w-12 bg-slate-800 border border-cyan2-400/40 rounded px-1 text-xs num text-cyan2-400 outline-none"
                      />
                    ) : (
                      <button
                        onClick={() => startEdit(p.p, p.pct)}
                        className="text-[10px] num text-slate-500 hover:text-cyan2-400 transition"
                        title="Clic para editar">
                        {p.pct}% completado
                      </button>
                    )}
                    {p.isManual && (
                      <button onClick={() => resetPhase(p.p)}
                              className="text-[8px] text-slate-600 hover:text-crit-400 transition opacity-0 group-hover:opacity-100"
                              title="Resetear a valor automático">
                        ↺ auto
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        );
      })()}

      {/* Column selector + data source badge */}
      {numericCols.length > 0 && (
        <div className="panel rounded-lg px-4 py-2.5 flex items-center gap-3 flex-wrap">
          <span className="text-[10px] uppercase tracking-widest text-slate-500 shrink-0">Variable SPC</span>
          <div className="flex gap-1.5 flex-wrap">
            {numericCols.map(col => (
              <button key={col} onClick={() => setSpcCol(col)}
                      className={`px-2 py-1 text-[10px] rounded transition border ${
                        spcCol === col
                          ? 'bg-cyan2-400/15 border-cyan2-400/40 text-cyan2-400'
                          : 'panel border-transparent text-slate-500 hover:text-white'
                      }`}>
                {col.replace(/_/g, ' ')}
              </button>
            ))}
          </div>
          <span className={`ml-auto text-[9px] px-2 py-0.5 rounded border ${
            usingCSV
              ? 'bg-grind-400/10 text-grind-400 border-grind-400/25'
              : hasBackend
              ? 'bg-cyan2-400/10 text-cyan2-400 border-cyan2-400/25'
              : 'bg-slate-700 text-slate-500 border-slate-600'
          }`}>
            {usingCSV ? `CSV · ${csvValues.length} valores` : hasBackend ? 'Backend · tiempo real' : 'Demo · datos ejemplo'}
          </span>
        </div>
      )}

      {/* SPC Stats */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        {[
          {l:'Media (X̄)',         v: spc.mean != null ? spc.mean.toFixed(2) : '—', c:'cyan'},
          {l:'Desv. estándar (σ)', v: spc.sd   != null ? spc.sd.toFixed(3)   : '—', c:'cyan'},
          {l:'Lím. Control Sup.', v: spc.ucl  != null ? spc.ucl.toFixed(2)  : '—', c:'red'},
          {l:'Lím. Control Inf.', v: spc.lcl  != null ? spc.lcl.toFixed(2)  : '—', c:'red'},
          {l:'Cp',                v: spc.cp   != null ? spc.cp.toFixed(2)   : '—', c:'green'},
          {l:'Cpk',               v: spc.cpk  != null ? spc.cpk.toFixed(2)  : '—', c:'green'},
        ].map(k => (
          <div key={k.l} className="panel rounded p-3 corners"
               style={{color: k.c==='red'?'#EF4444':(k.c==='green'?'#10B981':'#22D3EE')}}>
            <div className="text-[10px] uppercase tracking-widest text-slate-500">{k.l}</div>
            <div className="num text-2xl mt-1"
                 style={{color: k.c==='red'?'#EF4444':(k.c==='green'?'#10B981':'#22D3EE'), textShadow:`0 0 14px ${k.c==='red'?'#EF444455':(k.c==='green'?'#10B98155':'#22D3EE55')}`}}>
              {k.v}
            </div>
          </div>
        ))}
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { l:'Sigma Level', v: displaySigma ?? `${(3+(spc.cpk-1)*2).toFixed(2)}σ`, d: usingCSV ? 'CSV real' : 'demo', accent:'cyan' },
          { l:'Yield',       v: displayYield ?? `${((normalCDF(spc.usl,spc.mean,spc.sd)-normalCDF(spc.lsl,spc.mean,spc.sd))*100).toFixed(1)}%`, d: usingCSV ? 'CSV real' : 'demo', accent:'green' },
          { l:'Cp / Cpk',    v: `${spc.cp.toFixed(2)} / ${spc.cpk.toFixed(2)}`, d: usingCSV ? 'calculado' : 'demo', accent:'cyan' },
          { l:'Ahorro YTD',  v: metrics?.savings ? `$${metrics.savings}` : '$182K', d:'+$12K', accent:'ai' },
        ].map(k => (
          <div key={k.l} className="panel rounded p-3 relative overflow-hidden corners"
               style={{color: k.accent==='green'?'#10B981':(k.accent==='ai'?'#A855F7':'#22D3EE')}}>
            <Stat label={k.l} value={k.v} delta={k.d} accent={k.accent}/>
          </div>
        ))}
      </div>

      {/* Pareto + Capability */}
      <div className="grid grid-cols-12 gap-4">
        <Card title="Pareto · variabilidad de proceso"
              subtitle={csvPareto ? `Correlación con defectos · ${activeCSV?.rows?.length} registros` : '80/20 · vital few · datos demo'}
              className="col-span-12 xl:col-span-7" accent="cyan">
          <ParetoChart data={paretoData} w={680} h={260}/>
          <div className="mt-2 flex items-center gap-4 text-[10px] text-slate-400">
            <span className="flex items-center gap-1"><span className="w-3 h-2 bg-cyan2-400 rounded-sm"/>
              {csvPareto ? 'correlación con defectos (|r|×100)' : 'frecuencia'}
            </span>
            <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-ai-400"/>acumulado %</span>
          </div>
        </Card>

        <Card title="Análisis de capacidad" subtitle={spcCol ? spcCol.replace(/_/g,' ') : 'variable seleccionada'} className="col-span-12 xl:col-span-5" accent="ai">
          <div className="flex items-center justify-around mb-3">
            {[{l:'Cp',v:spc.cp},{l:'Cpk',v:spc.cpk},{l:'Pp',v:spc.pp},{l:'Ppk',v:spc.ppk}].map(x => (
              <div key={x.l} className="text-center">
                <div className="num text-2xl text-ai-400" style={{textShadow:'0 0 14px #A855F755'}}>{typeof x.v === 'number' ? x.v.toFixed(2) : '—'}</div>
                <div className="text-[10px] text-slate-500 uppercase tracking-widest">{x.l}</div>
              </div>
            ))}
          </div>
          <Histogram data={spc.points} bins={14} w={420} h={160} color="#A855F7"/>
          <div className="grid grid-cols-3 gap-2 mt-3 text-[10px]">
            <div className="panel rounded p-2"><div className="text-slate-500">Lím. Inferior</div><div className="num text-warn-400">{spc.lsl.toFixed(2)}</div></div>
            <div className="panel rounded p-2"><div className="text-slate-500">Media (μ)</div><div className="num text-white">{spc.mean.toFixed(2)}</div></div>
            <div className="panel rounded p-2"><div className="text-slate-500">Lím. Superior</div><div className="num text-warn-400">{spc.usl.toFixed(2)}</div></div>
          </div>
        </Card>
      </div>

      {/* Ishikawa */}
      <Card title="Ishikawa · 6M"
            subtitle={csvIshikawa ? `Variables del CSV mapeadas a 6M · ${activeCsvId}` : ISHIKAWA.problem}
            accent="cyan">
        <IshikawaDiagram data={ishikawaData}/>
      </Card>

      {/* Control charts — all 3 in one section */}
      <Card title="Control estadístico de proceso · SPC" subtitle="Carta X̄ · Rango Móvil · Distribución" accent="cyan">
        {/* Carta X̄ */}
        <div className="mb-1">
          <div className="text-[10px] tracking-[0.22em] uppercase text-slate-500 mb-2">Carta de control X̄ · subgrupos n=5</div>
          <ControlChart data={spc.points} mean={spc.mean} ucl={spc.ucl} lcl={spc.lcl}
                        usl={spc.usl} lsl={spc.lsl} w={1000} h={240}/>
        </div>

        <div className="hairline-bottom my-4"/>

        {/* Rango Móvil + Histograma */}
        <div className="grid grid-cols-12 gap-4">
          <div className="col-span-12 xl:col-span-7">
            <div className="text-[10px] tracking-[0.22em] uppercase text-slate-500 mb-2">Rango Móvil (MR) · 40 puntos</div>
            <ControlChart data={mr} mean={mrMean} ucl={mrMean*3.27} lcl={0}
                          usl={mrMean*3.27+0.05} lsl={-0.001} w={680} h={190}/>
          </div>
          <div className="col-span-12 xl:col-span-5">
            <div className="text-[10px] tracking-[0.22em] uppercase text-slate-500 mb-2">Histograma · distribución normal ajustada</div>
            <Histogram data={points} bins={14} w={420} h={190} color="#A855F7"/>
            <div className="grid grid-cols-3 gap-2 mt-3 text-[11px]">
              <div className="panel rounded p-2"><div className="text-slate-500">Media (μ)</div><div className="num text-white">{spc.mean.toFixed(3)}</div></div>
              <div className="panel rounded p-2"><div className="text-slate-500">Desv. (σ)</div><div className="num text-white">{spc.sd.toFixed(3)}</div></div>
              <div className="panel rounded p-2"><div className="text-slate-500">Asimetría</div><div className="num text-white">{skewness != null ? skewness.toFixed(2) : '—'}</div></div>
            </div>
          </div>
        </div>
      </Card>

      {/* Data table — last 40 readings */}
      {(() => {
        const tsKey    = activeCSV?.header?.find(h => /^(ts|timestamp|fecha|fecha_hora|time|hora)$/i.test(h));
        const tableRows = usingCSV
          ? activeCSV.rows.slice(-40).map((r, i, arr) => {
              const v   = parseFloat(r[spcCol]);
              const prv = i > 0 ? parseFloat(arr[i-1][spcCol]) : v;
              return { v, mrV: Math.abs(v - prv), ts: tsKey ? r[tsKey] : null };
            })
          : points.slice(-40).map((v, i, arr) => ({
              v, mrV: i > 0 ? Math.abs(v - arr[i-1]) : 0, ts: null
            }));
        const startIdx = usingCSV ? activeCSV.rows.length - tableRows.length : points.length - tableRows.length;
        const colLabel = usingCSV && spcCol ? spcCol.replace(/_/g,' ') : 'valor';

        return (
          <Card
            title={`Datos · últimas ${tableRows.length} lecturas · ${colLabel}`}
            subtitle={usingCSV ? `${machineId} · ${activeCSV.rows.length} registros totales` : 'Datos demo'}
            accent="cyan"
          >
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="text-[10px] tracking-widest uppercase text-slate-500">
                  <tr className="hairline-bottom">
                    <th className="text-left py-2 px-2">#</th>
                    <th className="text-left">Fecha/Hora</th>
                    <th className="text-left">{colLabel}</th>
                    <th className="text-left">Rango móvil</th>
                    <th className="text-left">UCL</th>
                    <th className="text-left">LCL</th>
                    <th className="text-left">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {tableRows.map(({ v, mrV, ts }, i) => {
                    if (isNaN(v)) return null;
                    const ooc  = v > spc.ucl || v < spc.lcl;
                    const warn = !ooc && (v > spc.usl || v < spc.lsl);
                    const time = ts || new Date(Date.now() - (tableRows.length-i)*60000).toLocaleTimeString();
                    return (
                      <tr key={i} className="hairline-bottom hover:bg-white/[0.02]">
                        <td className="py-1.5 px-2 num text-slate-500">{startIdx+i+1}</td>
                        <td className="num text-slate-400">{time}</td>
                        <td className={`num font-semibold ${ooc?'text-crit-400':warn?'text-warn-400':'text-white'}`}>{v.toFixed(3)}</td>
                        <td className="num text-slate-300">{mrV.toFixed(4)}</td>
                        <td className="num text-slate-500">{spc.ucl.toFixed(3)}</td>
                        <td className="num text-slate-500">{spc.lcl.toFixed(3)}</td>
                        <td>{ooc ? <Chip color="red">OOC</Chip> : warn ? <Chip color="amber">WARN</Chip> : <Chip color="green">OK</Chip>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        );
      })()}
    </div>
  );
}

function IshikawaDiagram({ data }) {
  data = data || ISHIKAWA;
  const W = 980, H = 360;
  const SY  = H / 2;          // spine Y = 180
  const SX1 = 30, SX2 = 816;
  const ARR = SX2 + 18;       // arrow tip
  const BX  = ARR + 5;        // problem box left = 839
  const BW  = 134, BH = 46;   // right edge = 973 < 980 ✓

  const cols = [215, 455, 695];

  return (
    <div className="w-full">
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{display:'block'}}>

        {/* Spine */}
        <line x1={SX1} y1={SY} x2={SX2} y2={SY}
              stroke="#22D3EE" strokeWidth="2"
              style={{filter:'drop-shadow(0 0 4px rgba(34,211,238,0.5))'}}/>

        {/* Arrowhead */}
        <path d={`M ${SX2} ${SY-8} L ${ARR} ${SY} L ${SX2} ${SY+8} Z`}
              fill="#22D3EE" style={{filter:'drop-shadow(0 0 6px #22D3EE)'}}/>

        {/* Problem box */}
        <rect x={BX} y={SY - BH/2} width={BW} height={BH}
              rx="6" fill="rgba(168,85,247,0.14)" stroke="#A855F7" strokeWidth="1.5"
              style={{filter:'drop-shadow(0 0 10px rgba(168,85,247,0.35))'}}/>
        <text x={BX + BW/2} y={SY - 6}
              fill="#A855F7" fontSize="8" textAnchor="middle"
              fontFamily="'JetBrains Mono', monospace" letterSpacing="2">PROBLEMA</text>
        <text x={BX + BW/2} y={SY + 13}
              fill="#fff" fontSize="9.5" textAnchor="middle" fontWeight="600">
          {data.problem}
        </text>

        {data.branches.map((b, i) => {
          const top  = i < 3;
          const bx   = cols[i % 3];
          const tipX = bx + 18;
          const tipY = top ? 55 : H - 55;
          const hitX = bx - 18;
          const hitY = SY;

          return (
            <g key={b.name}>
              {/* Diagonal bone */}
              <line x1={tipX} y1={tipY} x2={hitX} y2={hitY}
                    stroke="#22D3EE" strokeWidth="1.5" opacity="0.72"/>

              {/* Junction dot on spine */}
              <circle cx={hitX} cy={hitY} r="3" fill="#22D3EE" opacity="0.5"/>

              {/* Branch name */}
              <text x={tipX + 2} y={top ? tipY - 13 : tipY + 21}
                    fill="#22D3EE" fontSize="11.5" fontWeight="700"
                    textAnchor="middle" fontFamily="Inter, sans-serif">
                {b.name}
              </text>

              {/* Causes */}
              {b.causes.map((cause, j) => {
                const t  = (j + 1) / (b.causes.length + 1);
                const cx = tipX + t * (hitX - tipX);
                const cy = tipY + t * (hitY - tipY);
                return (
                  <g key={j}>
                    <circle cx={cx} cy={cy} r="2" fill="#22D3EE" opacity="0.5"/>
                    <line x1={cx} y1={cy} x2={cx - 58} y2={cy}
                          stroke="rgba(148,163,184,0.38)" strokeWidth="1"/>
                    <text x={cx - 61} y={cy + 3.5}
                          fill="#94A3B8" fontSize="8.5" textAnchor="end"
                          fontFamily="Inter, sans-serif">
                      {cause}
                    </text>
                  </g>
                );
              })}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
