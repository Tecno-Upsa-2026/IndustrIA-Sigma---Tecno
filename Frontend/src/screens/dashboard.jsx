import { useState, useEffect, useRef } from 'react'
import { Card, PageHeader, StatusDot } from '../shell'
import { LiveWave, ControlChart, Donut } from '../charts'
import { I } from '../icons'
import { useData } from '../context/DataContext'
import { supabase } from '../lib/supabase'

// ─── CSV parser (wide-first, long-format pivot fallback) ──────────────────────
function pivotLongFormat(dataLines) {
  const rows = dataLines.slice(1)
    .map(line => {
      const [ts, , varName, value] = line.split(',').map(s => s.trim());
      return { ts, varName, value };
    })
    .filter(r => r.ts && r.varName && r.value !== '');
  const map = new Map();
  for (const r of rows) {
    if (!map.has(r.ts)) map.set(r.ts, { ts: r.ts });
    map.get(r.ts)[r.varName] = r.value;
  }
  const vars       = [...new Set(rows.map(r => r.varName))];
  const header     = ['ts', ...vars];
  const wideRows   = Array.from(map.values())
    .sort((a, b) => Number(a.ts) - Number(b.ts))
    .map(r => Object.fromEntries(header.map(h => [h, r[h] ?? ''])));
  return { header, rows: wideRows };
}

function parseCSV(text) {
  const allLines = text.trim().split('\n');

  // 1. Prefer #WIDE_DATA section
  const wideIdx = allLines.findIndex(l => l.trim() === '#WIDE_DATA');
  if (wideIdx >= 0) {
    const wideLines = allLines.slice(wideIdx + 1).filter(l => l.trim());
    const header = wideLines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
    const rows = wideLines.slice(1).map(line => {
      const vals = line.split(',');
      return Object.fromEntries(header.map((h, i) => [h, (vals[i] || '').trim().replace(/^"|"$/g, '')]));
    }).filter(r => Object.values(r).some(v => v !== ''));
    return { header, rows };
  }

  // 2. Long-format #DATA section → pivot to wide
  const dataIdx = allLines.findIndex(l => l.trim() === '#DATA');
  if (dataIdx >= 0) {
    const dataLines = allLines.slice(dataIdx + 1).filter(l => l.trim() && !l.trim().startsWith('#'));
    if (dataLines.length > 1) return pivotLongFormat(dataLines);
  }

  // 3. Generic CSV (skip comment lines)
  const dataLines = allLines.filter(l => !l.trim().startsWith('#'));
  if (!dataLines.length) return { header: [], rows: [] };
  const header = dataLines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
  const rows = dataLines.slice(1).map(line => {
    const vals = line.split(',');
    return Object.fromEntries(header.map((h, i) => [h, (vals[i] || '').trim().replace(/^"|"$/g, '')]));
  }).filter(r => Object.values(r).some(v => v !== ''));
  return { header, rows };
}

function getNumericCols(header, rows) {
  return header.filter(h => h.toLowerCase() !== 'fecha_hora' && h !== 'ts' && !isNaN(parseFloat(rows[0]?.[h])));
}

function detectMachineId(fileName, machinesArr) {
  const upper = fileName.toUpperCase();
  const match = machinesArr.find(m => upper.includes(m.id.toUpperCase()));
  return match?.id || fileName.replace(/\.(csv|txt)$/i, '');
}

// ─── Statistics ───────────────────────────────────────────────────────────────
function calcStats(vals) {
  const n    = vals.length;
  const mean = vals.reduce((a, b) => a + b, 0) / n;
  const std  = Math.sqrt(vals.reduce((a, b) => a + (b - mean) ** 2, 0) / n);
  return { mean, std };
}

function defectToSigma(defectPct) {
  const dpmo = Math.max(0.001, defectPct * 10000);
  return Math.max(1, Math.min(6, parseFloat((0.8406 + Math.sqrt(29.37 - 2.221 * Math.log(dpmo))).toFixed(2))));
}

// ─── Local mini sparkline ─────────────────────────────────────────────────────
const CHART_COLORS = ['#22D3EE', '#10B981', '#F59E0B', '#A855F7', '#EF4444', '#3B82F6'];

function MiniChart({ data, color = '#22D3EE' }) {
  if (!data || data.length < 2) return null;
  const min = Math.min(...data), max = Math.max(...data), range = max - min || 1;
  const w = 200, h = 40, pad = 4;
  const xs = data.map((_, i) => pad + (i / (data.length - 1)) * (w - pad * 2));
  const ys = data.map(v => h - pad - ((v - min) / range) * (h - pad * 2));
  const d  = xs.map((x, i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${ys[i].toFixed(1)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full" style={{ height: 40 }}>
      <path d={d} fill="none" stroke={color} strokeWidth="1.5" style={{ filter: `drop-shadow(0 0 3px ${color})` }}/>
    </svg>
  );
}

// ─── CSV section ──────────────────────────────────────────────────────────────
function CSVSection({ csvEntries, activeCsvId, activeCsvData, onAdd, onSelect, onRemove }) {
  const fileRef = useRef(null);
  const data    = activeCsvData;

  const handleFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => { onAdd(file.name, parseCSV(ev.target.result), ev.target.result); };
    reader.readAsText(file);
    e.target.value = '';
  };

  if (csvEntries.length === 0) {
    return (
      <Card title="Histórico de máquinas · datos reales" subtitle="Subí un CSV para visualizar el histórico" accent="cyan">
        <div className="flex flex-col items-center justify-center py-12 gap-4">
          <div className="w-16 h-16 rounded-2xl grid place-items-center" style={{ background: 'rgba(34,211,238,0.08)', border: '1px dashed rgba(34,211,238,0.3)' }}>
            <span className="text-cyan2-400">{I.upload}</span>
          </div>
          <div className="text-center">
            <div className="text-slate-300 text-sm font-medium">No hay datos cargados</div>
            <div className="text-slate-500 text-xs mt-1 max-w-xs">Usá los archivos de Ejemplos CSV/ (BTL-01 a BTL-06). El nombre debe incluir el ID de la máquina.</div>
          </div>
          <button onClick={() => fileRef.current?.click()}
                  className="flex items-center gap-2 px-4 py-2 text-xs rounded-md bg-cyan2-400/15 border border-cyan2-400/40 text-cyan2-400 hover:bg-cyan2-400/25 transition">
            {I.upload} Subir CSV
          </button>
          <input ref={fileRef} type="file" accept=".csv,.txt" className="hidden" onChange={handleFile}/>
        </div>
      </Card>
    );
  }

  const numCols  = data ? getNumericCols(data.header, data.rows) : [];
  const lastRows = data ? data.rows.slice(-40) : [];

  return (
    <Card title="Histórico de máquinas · datos reales"
          subtitle={data ? `${data.rows.length} registros · ${numCols.length} variables · ${activeCsvId}` : ''}
          accent="cyan"
          action={
            <div className="flex items-center gap-2 flex-wrap">
              {csvEntries.map(([id, f]) => (
                <div key={id} className="flex items-center gap-1">
                  <button onClick={() => onSelect(id)}
                          className={`px-2 py-1 text-[10px] rounded ${activeCsvId === id ? 'bg-cyan2-400/15 text-cyan2-400 border border-cyan2-400/30' : 'text-slate-400 hover:text-white panel'}`}>
                    {id}
                  </button>
                  <button onClick={() => onRemove(id)} className="text-slate-600 hover:text-crit-400">{I.x}</button>
                </div>
              ))}
              <button onClick={() => fileRef.current?.click()} className="flex items-center gap-1 px-2 py-1 text-[10px] rounded bg-cyan2-400/15 border border-cyan2-400/40 text-cyan2-400">
                {I.plus} Agregar
              </button>
              <input ref={fileRef} type="file" accept=".csv,.txt" className="hidden" onChange={handleFile}/>
            </div>
          }>

      {numCols.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 mb-4">
          {numCols.slice(0, 6).map((col, i) => {
            const vals = data.rows.map(r => parseFloat(r[col])).filter(v => !isNaN(v));
            const last = vals[vals.length - 1];
            const min  = Math.min(...vals), max = Math.max(...vals);
            return (
              <div key={col} className="panel rounded p-3">
                <div className="text-[9px] uppercase tracking-widest text-slate-500 truncate">{col.replace(/_/g, ' ')}</div>
                <div className="num text-lg mt-0.5" style={{ color: CHART_COLORS[i % CHART_COLORS.length] }}>
                  {isNaN(last) ? '—' : last.toFixed(2)}
                </div>
                <MiniChart data={vals.slice(-30)} color={CHART_COLORS[i % CHART_COLORS.length]}/>
                <div className="flex justify-between text-[9px] text-slate-600 num mt-1">
                  <span>↓{min.toFixed(1)}</span><span>↑{max.toFixed(1)}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="text-[9px] tracking-widest uppercase text-slate-500">
            <tr className="hairline-bottom">
              <th className="text-left py-2 pr-3">#</th>
              {data.header.map(h => <th key={h} className="text-left pr-3 whitespace-nowrap">{h.replace(/_/g, ' ')}</th>)}
            </tr>
          </thead>
          <tbody>
            {lastRows.map((row, i) => (
              <tr key={i} className="hairline-bottom hover:bg-white/[0.02]">
                <td className="py-1.5 pr-3 num text-slate-500">{data.rows.length - lastRows.length + i + 1}</td>
                {data.header.map(h => {
                  const v = row[h];
                  const n = parseFloat(v);
                  return (
                    <td key={h} className="pr-3 num whitespace-nowrap text-slate-200">
                      {!isNaN(n) ? n.toFixed(2) : v}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

// ─── Machine mini card ────────────────────────────────────────────────────────
function MachineMini({ m, selected, onSelect, hasCSV, liveHistory }) {
  const stMap = {
    RUNNING:  { c: '#10B981', txt: 'Operando' },
    WARN:     { c: '#F59E0B', txt: 'Atención' },
    CRITICAL: { c: '#EF4444', txt: 'Crítico'  },
    IDLE:     { c: '#64748B', txt: 'En espera' },
  };
  const s    = stMap[m.status] || stMap.IDLE;
  const isSel = selected === m.id;
  return (
    <div onClick={() => onSelect(m.id)}
         className={`panel rounded-md p-3 relative overflow-hidden cursor-pointer transition ${isSel ? 'border-cyan2-400/40' : ''}`}
         style={isSel ? { boxShadow: '0 0 16px rgba(34,211,238,0.2)' } : {}}>
      <div className="absolute top-0 left-0 right-0 h-px" style={{ background: `linear-gradient(90deg, transparent, ${s.c}, transparent)` }}/>
      <div className="flex items-center justify-between mb-1.5">
        <div>
          <div className="num text-[10px] text-slate-500 flex items-center gap-1.5">
            {m.id}
            {hasCSV && <span className="text-[8px] px-1 rounded bg-grind-400/15 text-grind-400 border border-grind-400/30 tracking-wider">CSV</span>}
          </div>
          <div className="text-xs font-medium text-white">{m.name}</div>
        </div>
        <StatusDot status={m.status}/>
      </div>
      <div className="text-[10px] text-slate-500 mb-2">{m.line} · {s.txt}</div>
      <div className="mb-2">
        <div className="flex items-center justify-between text-[9px] uppercase tracking-widest text-slate-500">
          <span>Anomaly</span>
          <span className="num" style={{ color: (m.anomalyScore || 0) > 0.7 ? '#EF4444' : ((m.anomalyScore || 0) > 0.4 ? '#F59E0B' : '#10B981') }}>
            {((m.anomalyScore || 0) * 100).toFixed(0)}%
          </span>
        </div>
        <div className="h-1.5 rounded bg-slate-700/40 overflow-hidden mt-1">
          <div className="h-full rounded" style={{ width: `${Math.min(100, (m.anomalyScore || 0) * 100)}%`, background: (m.anomalyScore || 0) > 0.7 ? '#EF4444' : ((m.anomalyScore || 0) > 0.4 ? '#F59E0B' : '#10B981') }}/>
        </div>
      </div>
      <div className="flex items-end justify-between">
        <div>
          <div className="text-[9px] uppercase tracking-widest text-slate-500">OEE</div>
          <div className="num text-lg" style={{ color: s.c }}>{(m.oee || 0).toFixed(1)}<span className="text-[10px] text-slate-500 ml-0.5">%</span></div>
        </div>
        <div className="flex-1 ml-3">
          <LiveWave data={liveHistory?.temp} color={s.c} amp={m.status === 'IDLE' ? 1 : m.status === 'CRITICAL' ? 10 : 6} base={50} speed={m.status === 'IDLE' ? 800 : 200} height={28}/>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-1 mt-2 text-[9px]">
        <div><div className="text-slate-500">T°</div><div className="num text-slate-200">{(m.temp || 0).toFixed(1)}</div></div>
        <div><div className="text-slate-500">Vib</div><div className="num text-slate-200">{(m.vib || 0).toFixed(2)}</div></div>
        <div><div className="text-slate-500">Load</div><div className="num text-slate-200">{(m.load || 0).toFixed(0)}%</div></div>
      </div>
    </div>
  );
}

// ─── Plant KPI row ────────────────────────────────────────────────────────────
function KPIRow({ machines }) {
  const active    = machines.filter(m => m.status !== 'IDLE');
  const avgOEE    = active.length ? active.reduce((s, m) => s + (m.oee    || 0), 0) / active.length : 0;
  const avgDefect = active.length ? active.reduce((s, m) => s + (m.defect || 0), 0) / active.length : 0;
  const sigma     = avgDefect > 0 ? defectToSigma(avgDefect) : 0;
  const totalProd = machines.reduce((s, m) => s + (m.production || 0), 0);

  const kpis = [
    { label: 'OEE PLANTA',  value: avgOEE > 0 ? avgOEE.toFixed(1) + ' %' : '—',    color: avgOEE >= 85 ? '#10B981' : avgOEE >= 70 ? '#F59E0B' : '#EF4444' },
    { label: 'DEFECTOS',    value: avgDefect > 0 ? avgDefect.toFixed(2) + ' %' : '—', color: avgDefect < 1.5 ? '#10B981' : avgDefect < 3.5 ? '#F59E0B' : '#EF4444' },
    { label: 'NIVEL SIGMA', value: sigma > 0 ? sigma.toFixed(2) + ' σ' : '—',       color: sigma >= 4.5 ? '#10B981' : sigma >= 3 ? '#F59E0B' : '#EF4444' },
    { label: 'PRODUCCIÓN',  value: totalProd > 0 ? totalProd + ' u/h' : '— u/h',    color: '#22D3EE' },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {kpis.map(k => (
        <div key={k.label} className="panel rounded-lg p-4">
          <div className="text-[9px] uppercase tracking-widest text-slate-500 mb-2">{k.label}</div>
          <div className="num text-2xl font-semibold" style={{ color: k.color, textShadow: `0 0 20px ${k.color}44` }}>
            {k.value}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── OEE donut grid ───────────────────────────────────────────────────────────
function OEEGrid({ machines, selected, onSelect }) {
  const colorMap = { RUNNING: '#10B981', WARN: '#F59E0B', CRITICAL: '#EF4444', IDLE: '#64748B' };
  return (
    <div className="grid grid-cols-3 gap-3 place-items-center py-2">
      {machines.slice(0, 6).map(m => {
        const color = colorMap[m.status] || '#64748B';
        const isSel = m.id === selected;
        return (
          <div key={m.id} onClick={() => onSelect(m.id)}
               className={`flex flex-col items-center cursor-pointer rounded-lg p-2 w-full transition ${isSel ? 'bg-cyan2-400/10 border border-cyan2-400/30' : 'hover:bg-white/5 border border-transparent'}`}>
            <Donut value={m.oee || 0} label={m.id} color={color} size={88} thickness={9}/>
            <div className="text-[9px] text-slate-500 mt-1 text-center leading-tight">{m.name}</div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Quality control chart ────────────────────────────────────────────────────
function QualityPanel({ machine, csvData, liveHistory }) {
  if (!machine) return <div className="py-8 text-center text-slate-500 text-sm">Seleccioná una máquina</div>;

  // Pick best quality variable from machine.vars
  const qualEntry = Object.entries(machine.vars || {}).find(([, e]) => e.type === 'quality');
  const qualName  = qualEntry?.[0];
  const qualVar   = qualEntry?.[1];

  // Resolve data series — CSV first, liveHistory fallback
  let series = [], varLabel = '', unit = '';

  if (csvData?.rows?.length >= 5 && csvData.header.length) {
    const numCols = getNumericCols(csvData.header, csvData.rows);
    // Fuzzy match quality var name against CSV column names
    const col = qualName && numCols.find(h =>
      h.toLowerCase().replace(/[^a-z]/g, '').includes(qualName.toLowerCase().replace(/_/g, ''))
    );
    const useCol = col || numCols.find(h => !['oee', 'defecto', 'yield'].some(k => h.toLowerCase().includes(k))) || numCols[0];
    if (useCol) {
      series   = csvData.rows.map(r => parseFloat(r[useCol])).filter(v => !isNaN(v));
      varLabel = useCol.replace(/_/g, ' ');
      unit     = '';
    }
  }

  if (!series.length && liveHistory && qualName && liveHistory[qualName]?.length) {
    series   = liveHistory[qualName];
    varLabel = qualName.replace(/_/g, ' ');
    unit     = qualVar?.unit || '';
  }

  // Final fallback: primary operative var from liveHistory
  if (!series.length && liveHistory) {
    const opEntry = Object.entries(machine.vars || {}).find(([, e]) => e.type !== 'quality');
    const opName  = opEntry?.[0];
    if (opName && liveHistory[opName]?.length) {
      series   = liveHistory[opName];
      varLabel = opName.replace(/_/g, ' ');
      unit     = opEntry?.[1]?.unit || '';
    }
  }

  if (series.length < 5) {
    return (
      <div className="flex flex-col items-center justify-center py-10 gap-3 text-slate-500 text-sm">
        <div className="w-8 h-8 rounded-full border border-slate-600 grid place-items-center text-slate-600">{I.pulse}</div>
        <div>Sin datos suficientes — subí el CSV de {machine.id} o esperá más ticks del backend</div>
      </div>
    );
  }

  const { mean, std } = calcStats(series);
  const ucl  = qualVar?.crit        ?? mean + 3 * std;
  const lcl  = qualVar?.warn != null ? mean - (ucl - mean)  : mean - 3 * std;
  const usl  = qualVar?.quality_usl ?? mean + 2 * std;
  const lsl  = qualVar?.quality_lsl ?? mean - 2 * std;

  const chartData = series.slice(-50);
  const oocCount  = chartData.filter(v => v > ucl || v < lcl).length;

  return (
    <>
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div className="flex items-center gap-3 text-[10px]">
          <span className="uppercase tracking-widest text-slate-500">Variable:</span>
          <span className="text-cyan2-400">{varLabel}{unit ? ` [${unit}]` : ''}</span>
          {oocCount > 0 && <span className="px-2 py-0.5 rounded bg-crit-400/10 border border-crit-400/30 text-crit-400">{oocCount} OOC</span>}
        </div>
        <div className="flex items-center gap-4 text-[9px] num text-slate-500">
          <span>X̄ {mean.toFixed(3)}</span>
          <span className="text-crit-400">LCS {ucl.toFixed(3)}</span>
          <span className="text-warn-400">LES {usl.toFixed(3)}</span>
          <span className="text-warn-400">LEI {lsl.toFixed(3)}</span>
          <span className="text-crit-400">LCI {lcl.toFixed(3)}</span>
        </div>
      </div>
      <ControlChart data={chartData} mean={mean} ucl={ucl} lcl={lcl} usl={usl} lsl={lsl}/>
    </>
  );
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────
export default function Dashboard() {
  const { machines: machinesMap, csvFiles, activeCsvId, connected, machineHistory, recommendations, actions } = useData();

  const [selectedMachine, setSelectedMachine] = useState('BTL-03');

  const machinesArr   = Object.values(machinesMap);
  const csvEntries    = Object.entries(csvFiles);
  const activeCsvData = csvFiles[activeCsvId] || null;
  const machine       = machinesMap[selectedMachine] || machinesArr[0];
  const selCsvData    = csvFiles[selectedMachine] || activeCsvData;
  const liveHistory   = machineHistory[selectedMachine];

  const critCount = machinesArr.filter(m => m.status === 'CRITICAL').length;
  const warnCount = machinesArr.filter(m => m.status === 'WARN').length;
  const improvementMachines = Object.values(recommendations || {}).filter(rec => rec?.scenarios?.length).length;

  // Load CSVs from Supabase Storage on mount
  useEffect(() => {
    if (!supabase) return;
    supabase.from('csv_files').select('*').then(async ({ data, error }) => {
      if (error || !data?.length) return;
      for (const file of data) {
        if (!file.storage_path) continue;
        const { data: blob } = await supabase.storage.from('csv-files').download(file.storage_path);
        if (!blob) continue;
        const text   = await blob.text();
        const parsed = parseCSV(text);
        actions.addCsv(file.machine_id, { name: file.file_name, ...parsed });
      }
    });
  }, []);

  useEffect(() => {
    const ids = Object.keys(csvFiles);
    if (!ids.length) return;
    ids.forEach(id => {
      actions.fetchDiagnostics(id).catch(() => {});
      actions.fetchRecommendations(id).catch(() => {});
    });
  }, [Object.keys(csvFiles).join('|')]);

  const handleAddCsv = async (fileName, parsed, rawText) => {
    const id = detectMachineId(fileName, machinesArr);
    actions.addCsv(id, { name: fileName, ...parsed });
    if (rawText) {
      actions.recalibrateFromCsv({ machineId: id, csvContent: rawText, fileName }).catch(err => {
        console.warn('Recalibrate falló (puede ignorarse):', err.message);
      });
    }
    if (!supabase) return;
    const path = `${id}/${fileName}`;
    const blob = new Blob([rawText], { type: 'text/csv' });
    const { error: upErr } = await supabase.storage.from('csv-files').upload(path, blob, { upsert: true });
    if (upErr) { console.error('[Storage] upload:', upErr.message); return; }
    const { error: dbErr } = await supabase.from('csv_files').upsert({
      machine_id:   id,
      file_name:    fileName,
      row_count:    parsed.rows.length,
      columns:      parsed.header,
      storage_path: path,
    }, { onConflict: 'machine_id' });
    if (dbErr) console.error('[DB] csv_files upsert:', dbErr.message);
  };

  const handleRemoveCsv = async (id) => {
    actions.removeCsv(id);
    if (!supabase) return;
    const { data } = await supabase.from('csv_files').select('storage_path').eq('machine_id', id).single();
    if (data?.storage_path) await supabase.storage.from('csv-files').remove([data.storage_path]);
    await supabase.from('csv_files').delete().eq('machine_id', id);
  };

  return (
    <div className="p-6 space-y-5">
      <PageHeader
        eyebrow="// CONTROL CENTER"
        title="Dashboard"
        desc="Monitoreo en tiempo real · línea BTL completa · 6 equipos"
        actions={
          <div className="flex items-center gap-2 text-xs">
            {critCount > 0 && <span className="px-2 py-1 rounded bg-crit-400/10 border border-crit-400/30 text-crit-400">{critCount} crítico{critCount > 1 ? 's' : ''}</span>}
            {warnCount > 0 && <span className="px-2 py-1 rounded bg-warn-400/10 border border-warn-400/30 text-warn-400">{warnCount} atención</span>}
            {!critCount && !warnCount && machinesArr.length > 0 && (
              <span className="text-grind-400 text-[10px] tracking-widest uppercase flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-grind-400 pulse-dot"/>Todos operando
              </span>
            )}
          </div>
        }
      />

      <Card title="Recomendaciones activas" subtitle="Potencial de mejora detectado desde los CSVs cargados" accent="ai">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="panel rounded p-3">
            <div className="text-[10px] uppercase tracking-widest text-slate-500">Máquinas con potencial</div>
            <div className="num text-2xl text-ai-400 mt-1">{improvementMachines}</div>
          </div>
          <div className="panel rounded p-3">
            <div className="text-[10px] uppercase tracking-widest text-slate-500">CSV cargados</div>
            <div className="num text-2xl text-cyan2-400 mt-1">{Object.keys(csvFiles).length}</div>
          </div>
          <div className="panel rounded p-3">
            <div className="text-[10px] uppercase tracking-widest text-slate-500">Estado</div>
            <div className="text-sm text-slate-300 mt-1">
              {improvementMachines > 0
                ? `Potencial de mejora identificado en ${improvementMachines} máquinas.`
                : 'Todavía no hay recomendaciones generadas.'}
            </div>
          </div>
        </div>
      </Card>

      {/* CSV histórico */}
      <CSVSection
        csvEntries={csvEntries}
        activeCsvId={activeCsvId}
        activeCsvData={activeCsvData}
        onAdd={handleAddCsv}
        onSelect={actions.setActiveCsv}
        onRemove={handleRemoveCsv}
      />

      {/* Estado de máquinas — BTL completa */}
      <Card
        title="Estado de máquinas · línea BTL"
        subtitle={machinesArr.length
          ? `${machinesArr.length} equipos · ${Object.keys(csvFiles).length} con CSV · ${connected ? 'backend online' : 'reconectando…'}`
          : 'Esperando datos del backend…'}
        accent="cyan">
        {machinesArr.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 gap-3 text-slate-500">
            <div className="w-8 h-8 border-2 border-cyan2-400/40 border-t-cyan2-400 rounded-full animate-spin"/>
            <div className="text-sm">Conectando al backend…</div>
            <div className="text-xs text-slate-600">Iniciá el servidor con <code className="num text-slate-400">npm run dev</code></div>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
            {machinesArr.map(m => (
              <MachineMini key={m.id} m={m} selected={selectedMachine} onSelect={setSelectedMachine}
                           hasCSV={!!csvFiles[m.id]} liveHistory={machineHistory[m.id]}/>
            ))}
          </div>
        )}
      </Card>

      {/* KPIs de planta */}
      {machinesArr.length > 0 && <KPIRow machines={machinesArr}/>}

      {/* Gráfico de control + donuts OEE */}
      {machinesArr.length > 0 && (
        <div className="grid grid-cols-12 gap-4">
          <Card
            title={`Gráfico de control · ${machine?.id || '—'}`}
            subtitle={`${machine?.name || '—'} — variable de calidad primaria · clic en máquina para cambiar`}
            className="col-span-12 xl:col-span-8"
            accent="cyan">
            <QualityPanel machine={machine} csvData={selCsvData} liveHistory={liveHistory}/>
          </Card>

          <Card
            title="OEE por máquina"
            subtitle="Línea BTL · rendimiento global"
            className="col-span-12 xl:col-span-4"
            accent="green">
            <OEEGrid machines={machinesArr} selected={selectedMachine} onSelect={setSelectedMachine}/>
          </Card>
        </div>
      )}
    </div>
  );
}
