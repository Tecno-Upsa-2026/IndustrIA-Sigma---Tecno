import { useState, useRef, useEffect } from 'react'
import { Card, Chip, PageHeader, StatusDot } from '../shell'
import { LiveWave } from '../charts'
import { MACHINES as MOCK_MACHINES } from '../data'
import { I } from '../icons'
import { useData } from '../context/DataContext'
import { supabase } from '../lib/supabase'

// ─── Extract real sensor values from a CSV last row ───────────────────────────
const CSV_SENSOR_MAP = {
  temp:  ['temperatura_c','temp_zona1_c','temp_zona2_c','temperatura'],
  vib:   ['vibracion_g','vibracion'],
  load:  ['velocidad_pct','carga_pct','carga'],
  oee:   ['oee_pct','oee'],
  rpm:   ['rpm'],
};
function extractFromCsvRow(row) {
  const find = (keys) => {
    for (const k of keys) {
      const col = Object.keys(row).find(c => c.toLowerCase() === k);
      if (col && !isNaN(parseFloat(row[col]))) return parseFloat(row[col]);
    }
    return null;
  };
  return {
    temp: find(CSV_SENSOR_MAP.temp),
    vib:  find(CSV_SENSOR_MAP.vib),
    load: find(CSV_SENSOR_MAP.load),
    oee:  find(CSV_SENSOR_MAP.oee),
    rpm:  find(CSV_SENSOR_MAP.rpm),
  };
}

// Auto-detect machine ID from filename (e.g. "BTL-03_historico.csv" → "BTL-03")
function detectMachineId(fileName, machinesArr) {
  const upper = fileName.toUpperCase();
  const match = machinesArr.find(m => upper.includes(m.id.toUpperCase()));
  return match?.id || fileName.replace(/\.(csv|txt)$/i, '');
}

// ─── CSV parser ────────────────────────────────────────────────────────────────
function parseCSV(text) {
  const lines  = text.trim().split('\n');
  const header = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g,''));
  const rows   = lines.slice(1).map(line => {
    const vals = line.split(',');
    return Object.fromEntries(header.map((h,i) => [h, (vals[i]||'').trim().replace(/^"|"$/g,'')]));
  }).filter(r => Object.values(r).some(v => v !== ''));
  return { header, rows };
}

function getNumericCols(header, rows) {
  return header.filter(h => h.toLowerCase() !== 'fecha_hora' && !isNaN(parseFloat(rows[0]?.[h])));
}

// ─── Mini sparkline (pure SVG, no dependency) ─────────────────────────────────
function MiniChart({ data, color='#22D3EE' }) {
  if (!data || data.length < 2) return null;
  const min = Math.min(...data), max = Math.max(...data), range = max - min || 1;
  const w = 200, h = 40, pad = 4;
  const xs = data.map((_,i) => pad + (i/(data.length-1))*(w-pad*2));
  const ys = data.map(v    => h-pad-(((v-min)/range)*(h-pad*2)));
  const d  = xs.map((x,i) => `${i?'L':'M'}${x.toFixed(1)} ${ys[i].toFixed(1)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full" style={{height:40}}>
      <path d={d} fill="none" stroke={color} strokeWidth="1.5" style={{filter:`drop-shadow(0 0 3px ${color})`}}/>
    </svg>
  );
}

// ─── CSV historical view ───────────────────────────────────────────────────────
const CHART_COLORS = ['#22D3EE','#10B981','#F59E0B','#A855F7','#EF4444','#3B82F6'];

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
          <div className="w-16 h-16 rounded-2xl grid place-items-center" style={{background:'rgba(34,211,238,0.08)', border:'1px dashed rgba(34,211,238,0.3)'}}>
            <span className="text-cyan2-400">{I.upload}</span>
          </div>
          <div className="text-center">
            <div className="text-slate-300 text-sm font-medium">No hay datos cargados</div>
            <div className="text-slate-500 text-xs mt-1 max-w-xs">El nombre del archivo debe incluir el ID de la máquina (ej: BTL-03_historico.csv). Todos los demás screens leerán de este CSV.</div>
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
                          className={`px-2 py-1 text-[10px] rounded ${activeCsvId===id?'bg-cyan2-400/15 text-cyan2-400 border border-cyan2-400/30':'text-slate-400 hover:text-white panel'}`}>
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

      {/* Mini trend charts per variable */}
      {numCols.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 mb-4">
          {numCols.slice(0, 6).map((col, i) => {
            const vals = data.rows.map(r => parseFloat(r[col])).filter(v => !isNaN(v));
            const last = vals[vals.length-1];
            const min  = Math.min(...vals), max = Math.max(...vals);
            return (
              <div key={col} className="panel rounded p-3">
                <div className="text-[9px] uppercase tracking-widest text-slate-500 truncate">{col.replace(/_/g,' ')}</div>
                <div className="num text-lg mt-0.5" style={{color: CHART_COLORS[i % CHART_COLORS.length]}}>
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

      {/* Data table */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="text-[9px] tracking-widest uppercase text-slate-500">
            <tr className="hairline-bottom">
              <th className="text-left py-2 pr-3">#</th>
              {data.header.map(h => <th key={h} className="text-left pr-3 whitespace-nowrap">{h.replace(/_/g,' ')}</th>)}
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

// ─── Process variable sliders ──────────────────────────────────────────────────
function ParamSlider({ label, unit, min, max, step, value, onChange, ideal }) {
  const pct      = ((value-min)/(max-min))*100;
  const idealPct = ((ideal-min)/(max-min))*100;
  const off      = Math.abs(value-ideal)/(max-min);
  const color    = off > 0.18 ? '#EF4444' : (off > 0.08 ? '#F59E0B' : '#22D3EE');
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] uppercase tracking-widest text-slate-400">{label}</span>
        <span className="num text-sm font-semibold" style={{color}}>
          {typeof value === 'number' ? value.toFixed(unit==='g'?2:0) : value}
          <span className="text-slate-500 text-[10px] ml-1">{unit}</span>
        </span>
      </div>
      <div className="relative">
        <input type="range" min={min} max={max} step={step} value={value}
               onChange={e => onChange(parseFloat(e.target.value))} className="w-full"/>
        <div className="absolute top-[-2px] w-0.5 h-2 bg-grind-400" style={{left:`${idealPct}%`, boxShadow:'0 0 4px #10B981'}}/>
      </div>
      <div className="flex justify-between text-[9px] text-slate-500 num mt-0.5">
        <span>{min}</span>
        <span className="text-grind-400">●target {ideal}{unit}</span>
        <span>{max}</span>
      </div>
    </div>
  );
}

// ─── Machine mini card ─────────────────────────────────────────────────────────
function MachineMini({ m, selected, onSelect, hasCSV }) {
  const stMap = {
    RUNNING:  { c:'#10B981', txt:'Operando' },
    WARN:     { c:'#F59E0B', txt:'Atención' },
    CRITICAL: { c:'#EF4444', txt:'Crítico' },
    IDLE:     { c:'#64748B', txt:'En espera' },
  };
  const s    = stMap[m.status] || stMap.IDLE;
  const isSel = selected === m.id;
  return (
    <div onClick={() => onSelect(m.id)}
         className={`panel rounded-md p-3 relative overflow-hidden cursor-pointer transition ${isSel?'border-cyan2-400/40':''}`}
         style={isSel?{boxShadow:'0 0 16px rgba(34,211,238,0.2)'}:{}}>
      <div className="absolute top-0 left-0 right-0 h-px" style={{background:`linear-gradient(90deg, transparent, ${s.c}, transparent)`}}/>
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
          <span className="num" style={{color: (m.anomalyScore || 0) > 0.7 ? '#EF4444' : ((m.anomalyScore || 0) > 0.4 ? '#F59E0B' : '#10B981')}}>{((m.anomalyScore || 0) * 100).toFixed(0)}%</span>
        </div>
        <div className="h-1.5 rounded bg-slate-700/40 overflow-hidden mt-1">
          <div className="h-full rounded" style={{width:`${Math.min(100, (m.anomalyScore || 0) * 100)}%`, background:(m.anomalyScore || 0) > 0.7 ? '#EF4444' : ((m.anomalyScore || 0) > 0.4 ? '#F59E0B' : '#10B981')}}/>
        </div>
      </div>
      <div className="flex items-end justify-between">
        <div>
          <div className="text-[9px] uppercase tracking-widest text-slate-500">OEE</div>
          <div className="num text-lg" style={{color:s.c}}>{(m.oee||0).toFixed(1)}<span className="text-[10px] text-slate-500 ml-0.5">%</span></div>
        </div>
        <div className="flex-1 ml-3">
          <LiveWave color={s.c} amp={m.status==='IDLE'?1:m.status==='CRITICAL'?10:6} base={50} speed={m.status==='IDLE'?800:200} height={28}/>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-1 mt-2 text-[9px]">
        <div><div className="text-slate-500">T°</div><div className="num text-slate-200">{(m.temp||0).toFixed(1)}</div></div>
        <div><div className="text-slate-500">Vib</div><div className="num text-slate-200">{(m.vib||0).toFixed(2)}</div></div>
        <div><div className="text-slate-500">Load</div><div className="num text-slate-200">{(m.load||0).toFixed(0)}%</div></div>
      </div>
    </div>
  );
}

// ─── Simulation engine ─────────────────────────────────────────────────────────
function simTick(machines, params, selectedId) {
  return machines.map(m => {
    const isSel = m.id === selectedId;

    let temp = m.temp + (Math.random() - 0.5) * 1.5;
    let vib  = m.vib  + (Math.random() - 0.5) * 0.04;
    let load = m.load + (Math.random() - 0.5) * 2.5;

    // Apply process variable overrides to selected machine
    if (isSel) {
      temp = params.temp      + (Math.random() - 0.5) * 2.5;
      vib  = params.vibration + (Math.random() - 0.5) * 0.05;
      load = params.speed     + (Math.random() - 0.5) * 3;
    }

    // Clamp to realistic ranges
    temp = Math.max(20,   Math.min(280, temp));
    vib  = Math.max(0.05, Math.min(1.5,  vib));
    load = Math.max(0,    Math.min(100,  load));

    // Status thresholds
    let status;
    if (load < 4)                                    status = 'IDLE';
    else if (temp > 245 || vib > 0.88 || load > 95) status = 'CRITICAL';
    else if (temp > 225 || vib > 0.65 || load > 85) status = 'WARN';
    else                                             status = 'RUNNING';

    const oeeBase = { RUNNING:91, WARN:74, CRITICAL:57, IDLE:0 }[status];
    const oee     = Math.max(0, Math.min(100, oeeBase + (Math.random() - 0.5) * 6));
    const defect  = Math.max(0, m.defect + (Math.random() - 0.5) * 0.4
      + (isSel ? Math.abs(params.temp - 200) * 0.015 : 0));

    return { ...m, temp, vib, load, status, oee, defect };
  });
}

// ─── Local AI insights (no backend needed) ────────────────────────────────────
function generateLocalInsights(machines) {
  const critical = machines.filter(m => m.status === 'CRITICAL');
  const warn     = machines.filter(m => m.status === 'WARN');
  const hottest  = [...machines].sort((a,b) => b.temp - a.temp)[0];
  const mostVib  = [...machines].sort((a,b) => b.vib - a.vib)[0];
  const lowOee   = machines.filter(m => m.status !== 'IDLE' && m.oee < 70);

  const out = [];

  if (critical.length) out.push({
    tag:'CRÍTICO', c:'red',
    t: `${critical.map(m=>m.id).join(', ')} fuera de límites — revisar de inmediato.`,
    ago:'ahora', conf:'97%',
  });

  if (warn.length) out.push({
    tag:'ATENCIÓN', c:'amber',
    t: `${warn.map(m=>m.id).join(', ')} en zona de advertencia. Monitorear tendencia.`,
    ago:'<1 min', conf:'88%',
  });

  if (hottest?.temp > 232) out.push({
    tag:'TEMPERATURA', c:'red',
    t: `${hottest.id} registra ${hottest.temp.toFixed(1)}°C — supera umbral de 230°C.`,
    ago:'ahora', conf:'93%',
  });

  if (!out.length && mostVib?.vib > 0.6) out.push({
    tag:'VIBRACIÓN', c:'amber',
    t: `${mostVib.id} vib ${mostVib.vib.toFixed(2)}g — posible desbalance. Agendar inspección.`,
    ago:'<2 min', conf:'82%',
  });

  if (lowOee.length) out.push({
    tag:'OEE BAJO', c:'ai',
    t: `${lowOee.map(m=>`${m.id} (${m.oee.toFixed(0)}%)`).join(', ')} por debajo del 70%.`,
    ago:'<5 min', conf:'79%',
  });

  if (!out.length) out.push({
    tag:'ÓPTIMO', c:'green',
    t: 'Todos los equipos dentro de parámetros normales. Sin anomalías detectadas.',
    ago:'ahora', conf:'99%',
  });

  return out;
}

// ─── Process variable AI suggestion ───────────────────────────────────────────
function getProcessSuggestion(p) {
  const issues = [];
  if (Math.abs(p.temp - 200) > 15)
    issues.push(`Temperatura ${p.temp > 200 ? '+' : ''}${(p.temp-200).toFixed(0)}°C de setpoint — riesgo de defectos`);
  if (p.vibration > 0.62)
    issues.push(`Vibración ${p.vibration.toFixed(2)}g — inspeccionar rodamientos`);
  if (Math.abs(p.pressure - 120) > 22)
    issues.push(`Presión ${p.pressure > 120 ? 'elevada' : 'baja'} (${p.pressure} bar) — verificar válvulas`);
  if (p.speed > 90)
    issues.push('Velocidad al límite — riesgo de desgaste prematuro');
  return issues.length
    ? issues.join(' · ')
    : 'Parámetros dentro de zona óptima ±2σ. Sistema estable.';
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────
export default function Dashboard() {
  const { machines: machinesMap, csvFiles, activeCsvId, aiInsights, actions } = useData();
  const isBackendConnected = Object.keys(machinesMap).length > 0;

  const [selectedMachine, setSelectedMachine] = useState('BTL-03');
  const [params, setParams] = useState({ temp:204, speed:78, pressure:124, vibration:0.42, torque:214 });
  const [simMachines, setSimMachines] = useState(MOCK_MACHINES);

  // Use backend data when available, otherwise local simulation
  const machinesArr   = isBackendConnected ? Object.values(machinesMap) : simMachines;
  const displayInsights = aiInsights.length ? aiInsights : generateLocalInsights(machinesArr);

  // Refs so simulation tick always sees latest values without restarting the interval
  const paramsRef   = useRef(params);
  const selectedRef = useRef(selectedMachine);
  useEffect(() => { paramsRef.current = params;         }, [params]);
  useEffect(() => { selectedRef.current = selectedMachine; }, [selectedMachine]);

  // Simulation tick — only when backend is offline
  useEffect(() => {
    if (isBackendConnected) return;
    const id = setInterval(() => {
      setSimMachines(prev => simTick(prev, paramsRef.current, selectedRef.current));
    }, 2500);
    return () => clearInterval(id);
  }, [isBackendConnected]);

  // When a CSV is loaded for any machine, seed that machine's sim values from the CSV last row
  useEffect(() => {
    setSimMachines(prev => prev.map(m => {
      const csv = csvFiles[m.id];
      if (!csv?.rows?.length) return m;
      const vals = extractFromCsvRow(csv.rows[csv.rows.length - 1]);
      const update = {};
      if (vals.temp != null) update.temp = vals.temp;
      if (vals.vib  != null) update.vib  = vals.vib;
      if (vals.load != null) update.load = vals.load;
      if (vals.oee  != null) update.oee  = vals.oee;
      if (vals.rpm  != null) update.rpm  = vals.rpm;
      return Object.keys(update).length ? { ...m, ...update } : m;
    }));
  }, [csvFiles]);

  // Sync sliders when selected machine changes OR when its CSV arrives
  useEffect(() => {
    const csv = csvFiles[selectedMachine];
    if (csv?.rows?.length) {
      const vals = extractFromCsvRow(csv.rows[csv.rows.length - 1]);
      setParams(p => ({
        ...p,
        ...(vals.temp != null ? { temp:      vals.temp } : {}),
        ...(vals.vib  != null ? { vibration: vals.vib  } : {}),
        ...(vals.load != null ? { speed:     vals.load } : {}),
      }));
    } else {
      const m = machinesArr.find(x => x.id === selectedMachine);
      if (!m) return;
      setParams(p => ({
        ...p,
        temp:      parseFloat(m.temp.toFixed(1)),
        vibration: parseFloat(m.vib.toFixed(2)),
        speed:     parseFloat(m.load.toFixed(0)),
      }));
    }
  }, [selectedMachine, csvFiles]);

  useEffect(() => { actions.fetchAIInsights().catch(() => {}); }, []);

  // Load CSVs from Supabase Storage on mount
  useEffect(() => {
    if (!supabase) return;
    supabase.from('csv_files').select('*').then(async ({ data, error }) => {
      if (error || !data?.length) return;
      for (const file of data) {
        if (!file.storage_path) continue;
        const { data: blob } = await supabase.storage.from('csv-files').download(file.storage_path);
        if (!blob) continue;
        const text = await blob.text();
        const parsed = parseCSV(text);
        actions.addCsv(file.machine_id, { name: file.file_name, ...parsed });
      }
    });
  }, []);

  const csvEntries    = Object.entries(csvFiles);
  const activeCsvData = csvFiles[activeCsvId] || null;

  const handleAddCsv = async (fileName, parsed, rawText) => {
    const id = detectMachineId(fileName, machinesArr);
    actions.addCsv(id, { name: fileName, ...parsed });
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

  const handleSelectCsv = (id) => actions.setActiveCsv(id);

  const critCount = machinesArr.filter(m => m.status === 'CRITICAL').length;
  const warnCount = machinesArr.filter(m => m.status === 'WARN').length;

  return (
    <div className="p-6 space-y-5">
      <PageHeader
        eyebrow="// CONTROL CENTER"
        title="Dashboard"
        desc="Histórico de máquinas, estado de planta y simulación de variables."
        actions={
          <div className="flex items-center gap-2 text-xs">
            {critCount > 0 && <span className="px-2 py-1 rounded bg-crit-400/10 border border-crit-400/30 text-crit-400">{critCount} crítico{critCount>1?'s':''}</span>}
            {warnCount > 0 && <span className="px-2 py-1 rounded bg-warn-400/10 border border-warn-400/30 text-warn-400">{warnCount} atención</span>}
            {!critCount && !warnCount && <span className="text-grind-400 text-[10px] tracking-widest uppercase">Todos operando</span>}
          </div>
        }
      />

      {/* 1. CSV historical data */}
      <CSVSection
        csvEntries={csvEntries}
        activeCsvId={activeCsvId}
        activeCsvData={activeCsvData}
        onAdd={handleAddCsv}
        onSelect={handleSelectCsv}
        onRemove={handleRemoveCsv}
      />

      {/* 2. Machine status grid */}
      <Card
        title="Estado de máquinas"
        subtitle={`${machinesArr.length} equipos · ${Object.keys(csvFiles).length} con datos reales CSV · ${isBackendConnected ? 'backend online' : 'simulación local'}`}
        accent="cyan">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {machinesArr.map(m => (
            <MachineMini key={m.id} m={m} selected={selectedMachine} onSelect={setSelectedMachine} hasCSV={!!csvFiles[m.id]}/>
          ))}
        </div>
      </Card>

      {/* 3. AI copilot + Process variables */}
      <div className="grid grid-cols-12 gap-4">
        <Card title="Copiloto IA · Insights" subtitle="Análisis automático en tiempo real"
              className="col-span-12 xl:col-span-5" accent="ai" glow="shadow-glowAi">
          <div className="space-y-2">
            {displayInsights.map((x, i) => {
              const col = x.c==='red'?'#EF4444':(x.c==='amber'?'#F59E0B':(x.c==='green'?'#10B981':(x.c==='ai'?'#A855F7':'#22D3EE')));
              const chipColor = x.c==='red'?'red':(x.c==='amber'?'amber':(x.c==='green'?'green':'cyan'));
              return (
                <div key={i} className="panel rounded-md p-3 flex items-start gap-3 hover:border-ai-400/30 transition">
                  <div className="shrink-0 w-8 h-8 rounded grid place-items-center"
                       style={{color: col, background:`rgba(${x.c==='red'?'239,68,68':(x.c==='amber'?'245,158,11':(x.c==='green'?'16,185,129':(x.c==='ai'?'168,85,247':'34,211,238')))},0.12)`}}>
                    {I.bot}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Chip color={chipColor}>{x.tag}</Chip>
                      {x.conf && x.conf !== '—' && <span className="text-[10px] text-slate-500 num">conf {x.conf}</span>}
                      <span className="text-[10px] text-slate-500 ml-auto">{x.ago}</span>
                    </div>
                    <div className="text-sm text-slate-200">{x.t}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        <Card title="Variables de proceso"
              subtitle={`Setpoints · ${selectedMachine} — clic en máquina para cambiar`}
              className="col-span-12 xl:col-span-7" accent="cyan">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
            <ParamSlider label="Temperatura" unit="°C"  min={150} max={260} step={1}    ideal={200} value={params.temp}      onChange={v=>setParams(p=>({...p,temp:v}))}/>
            <ParamSlider label="Velocidad"   unit="%"   min={0}   max={100} step={1}    ideal={70}  value={params.speed}     onChange={v=>setParams(p=>({...p,speed:v}))}/>
            <ParamSlider label="Presión"     unit="bar" min={80}  max={180} step={1}    ideal={120} value={params.pressure}  onChange={v=>setParams(p=>({...p,pressure:v}))}/>
            <ParamSlider label="Vibración"   unit="g"   min={0.1} max={1.2} step={0.01} ideal={0.4} value={params.vibration} onChange={v=>setParams(p=>({...p,vibration:v}))}/>
            <ParamSlider label="Torque"      unit="N·m" min={120} max={320} step={1}    ideal={210} value={params.torque}    onChange={v=>setParams(p=>({...p,torque:v}))}/>
          </div>
          <div className="mt-4 panel rounded p-3 flex items-start gap-2 border border-ai-400/30">
            <span className="text-ai-400 mt-0.5 shrink-0">{I.bot}</span>
            <div className="text-xs text-slate-300">
              <div className="text-[10px] tracking-[0.25em] uppercase text-ai-400 mb-1">SUGERENCIA IA · {selectedMachine}</div>
              {getProcessSuggestion(params)}
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
