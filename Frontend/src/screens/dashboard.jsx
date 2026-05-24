import { useState, useRef, useEffect } from 'react'
import { Card, Chip, PageHeader, StatusDot } from '../shell'
import { LiveWave } from '../charts'
import { MACHINES as MOCK_MACHINES } from '../data'
import { I } from '../icons'
import { useData } from '../context/DataContext'

// Auto-detect machine ID from filename (e.g. "INJ-07_historico.csv" → "INJ-07")
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
    reader.onload = ev => { onAdd(file.name, parseCSV(ev.target.result)); };
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
            <div className="text-slate-500 text-xs mt-1 max-w-xs">El nombre del archivo debe incluir el ID de la máquina (ej: INJ-07_historico.csv). Todos los demás screens leerán de este CSV.</div>
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
function MachineMini({ m, selected, onSelect }) {
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
          <div className="num text-[10px] text-slate-500">{m.id}</div>
          <div className="text-xs font-medium text-white">{m.name}</div>
        </div>
        <StatusDot status={m.status}/>
      </div>
      <div className="text-[10px] text-slate-500 mb-2">{m.line} · {s.txt}</div>
      <div className="flex items-end justify-between">
        <div>
          <div className="text-[9px] uppercase tracking-widest text-slate-500">OEE</div>
          <div className="num text-lg" style={{color:s.c}}>{(m.oee||0).toFixed(1)}<span className="text-[10px] text-slate-500 ml-0.5">%</span></div>
        </div>
        <div className="flex-1 ml-3">
          <LiveWave color={s.c} amp={6} base={50} speed={200} height={28}/>
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

// ─── Main Dashboard ───────────────────────────────────────────────────────────
export default function Dashboard() {
  const { machines: machinesMap, csvFiles, activeCsvId, aiInsights, actions } = useData();
  const machinesArr = Object.keys(machinesMap).length ? Object.values(machinesMap) : MOCK_MACHINES;

  const [selectedMachine, setSelectedMachine] = useState('INJ-07');
  const [params, setParams] = useState({ temp:204, speed:78, pressure:124, vibration:0.42, torque:214 });

  useEffect(() => { actions.fetchAIInsights().catch(() => {}); }, []);

  const csvEntries   = Object.entries(csvFiles);           // [[id, data], ...]
  const activeCsvData = csvFiles[activeCsvId] || null;

  const handleAddCsv = (fileName, parsed) => {
    const id = detectMachineId(fileName, machinesArr);
    actions.addCsv(id, { name: fileName, ...parsed });
  };
  const handleRemoveCsv = (id) => actions.removeCsv(id);
  const handleSelectCsv = (id) => actions.setActiveCsv(id);

  return (
    <div className="p-6 space-y-5">
      <PageHeader
        eyebrow="// CONTROL CENTER"
        title="Dashboard"
        desc="Histórico de máquinas, estado de planta y simulación de variables."
        actions={null}
      />

      {/* 1. CSV historical data — main section */}
      <CSVSection
        csvEntries={csvEntries}
        activeCsvId={activeCsvId}
        activeCsvData={activeCsvData}
        onAdd={handleAddCsv}
        onSelect={handleSelectCsv}
        onRemove={handleRemoveCsv}
      />

      {/* 2. Machine status grid */}
      <Card title="Estado de máquinas" subtitle={`${machinesArr.length} activos · línea Q1-Q4`} accent="cyan">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {machinesArr.map(m => (
            <MachineMini key={m.id} m={m} selected={selectedMachine} onSelect={setSelectedMachine}/>
          ))}
        </div>
      </Card>

      {/* 3. AI copilot + Process variables */}
      <div className="grid grid-cols-12 gap-4">
        <Card title="Copiloto IA · Insights" subtitle="Recomendaciones automáticas en tiempo real"
              className="col-span-12 xl:col-span-5" accent="ai" glow="shadow-glowAi">
          <div className="space-y-2">
            {(aiInsights.length ? aiInsights : [
              {tag:'CARGANDO', c:'ai', t:'Consultando IA…', ago:'—', conf:'—'},
            ]).map((x, i) => {
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
              subtitle={`Setpoints · ${selectedMachine} — máquina seleccionada`}
              className="col-span-12 xl:col-span-7" accent="cyan">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
            <ParamSlider label="Temperatura" unit="°C"  min={150} max={260} step={1}    ideal={200} value={params.temp}      onChange={v=>setParams(p=>({...p,temp:v}))}/>
            <ParamSlider label="Velocidad"   unit="%"   min={0}   max={100} step={1}    ideal={70}  value={params.speed}     onChange={v=>setParams(p=>({...p,speed:v}))}/>
            <ParamSlider label="Presión"     unit="bar" min={80}  max={180} step={1}    ideal={120} value={params.pressure}  onChange={v=>setParams(p=>({...p,pressure:v}))}/>
            <ParamSlider label="Vibración"   unit="g"   min={0.1} max={1.2} step={0.01} ideal={0.4} value={params.vibration} onChange={v=>setParams(p=>({...p,vibration:v}))}/>
            <ParamSlider label="Torque"      unit="N·m" min={120} max={320} step={1}    ideal={210} value={params.torque}    onChange={v=>setParams(p=>({...p,torque:v}))}/>
          </div>
          <div className="mt-4 panel rounded p-3 flex items-start gap-2 border border-ai-400/30">
            <span className="text-ai-400 mt-0.5">{I.bot}</span>
            <div className="text-xs text-slate-300">
              <div className="text-[10px] tracking-[0.25em] uppercase text-ai-400 mb-1">SUGERENCIA IA</div>
              {Math.abs((params.temp-200)/10) > 0.5
                ? 'Reducir temperatura a 200°C para minimizar defectos.'
                : (Math.abs((params.vibration-0.4)*5) > 0.4
                  ? 'Vibración alta: inspeccionar rodamientos.'
                  : 'Parámetros dentro de zona óptima ±2σ.')}
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
