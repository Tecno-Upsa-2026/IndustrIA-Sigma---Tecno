import { useState, useEffect } from 'react'
import { Card, Chip, PageHeader, StatusDot } from '../shell'
import { MACHINES as MOCK_MACHINES } from '../data'
import { I } from '../icons'
import { useData } from '../context/DataContext'

// ─── CSV parser ───────────────────────────────────────────────────────────────
function parseCSV(text) {
  const lines  = text.trim().split('\n');
  const header = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
  const rows   = lines.slice(1).map(line => {
    const vals = line.split(',');
    return Object.fromEntries(header.map((h, i) => [h, (vals[i] || '').trim().replace(/^"|"$/g, '')]));
  }).filter(r => Object.values(r).some(v => v !== ''));
  return { header, rows };
}

function getNumericCols(header, rows) {
  return header.filter(h => h.toLowerCase() !== 'fecha_hora' && !isNaN(parseFloat(rows[0]?.[h])));
}

// ─── Map CSV columns → slider params ─────────────────────────────────────────
const COL_MAP = {
  temp:      ['temperatura_c', 'temp_zona1_c', 'temp_zona2_c', 'temperatura'],
  speed:     ['velocidad_pct', 'velocidad_cinta_m_min', 'velocidad_avance_mm_min', 'rpm', 'velocidad'],
  pressure:  ['presion_bar', 'presion', 'profundidad_corte_mm'],
  vibration: ['vibracion_g', 'vibracion'],
  torque:    ['torque_nm', 'torque'],
};

function extractParams(row) {
  const find = (keys) => {
    for (const k of keys) {
      const match = Object.keys(row).find(c => c.toLowerCase() === k);
      if (match && !isNaN(parseFloat(row[match]))) return parseFloat(row[match]);
    }
    return null;
  };
  return {
    temp:      find(COL_MAP.temp)      ?? 204,
    speed:     find(COL_MAP.speed)     ?? 78,
    pressure:  find(COL_MAP.pressure)  ?? 124,
    vibration: find(COL_MAP.vibration) ?? 0.42,
    torque:    find(COL_MAP.torque)    ?? 214,
  };
}

// ─── Physics model (local prediction) ────────────────────────────────────────
function computeLocal(params) {
  const tDelta = (params.temp - 200) / 10;
  const vDelta = (params.vibration - 0.4) * 5;
  const sDelta = (params.speed - 70) / 12;
  const defect = Math.max(0.2, 1.4 + tDelta*tDelta*0.15 + vDelta*vDelta*0.4 + sDelta*sDelta*0.18);
  const yld    = Math.max(80, 99.6 - defect * 1.4);
  const cp     = Math.max(0.5, 1.42 - Math.abs(tDelta)*0.05 - Math.abs(vDelta)*0.12);
  return { defect, yield: yld, cp, cpk: cp - 0.11, sigma: 3 + (cp - 1) * 2,
           production: Math.round(580 + params.speed * 1.4 - defect * 8) };
}

// ─── Mini sparkline ───────────────────────────────────────────────────────────
const COLORS = ['#22D3EE','#10B981','#F59E0B','#A855F7','#EF4444','#3B82F6','#EC4899','#14B8A6'];

function MiniChart({ data, color = '#22D3EE' }) {
  if (!data || data.length < 2) return null;
  const min = Math.min(...data), max = Math.max(...data), range = max - min || 1;
  const w = 200, h = 48, pad = 4;
  const xs = data.map((_, i) => pad + (i / (data.length - 1)) * (w - pad * 2));
  const ys = data.map(v => h - pad - ((v - min) / range) * (h - pad * 2));
  const d  = xs.map((x, i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${ys[i].toFixed(1)}`).join(' ');
  const area = `${d} L${xs[xs.length-1].toFixed(1)} ${h} L${xs[0].toFixed(1)} ${h} Z`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full" style={{ height: 48 }}>
      <path d={area} fill={color} opacity="0.08"/>
      <path d={d}    fill="none"  stroke={color} strokeWidth="1.5"
            style={{ filter: `drop-shadow(0 0 3px ${color})` }}/>
    </svg>
  );
}

// ─── Process variable slider ──────────────────────────────────────────────────
function ParamSlider({ label, unit, min, max, step, value, onChange, ideal }) {
  const idealPct = ((ideal - min) / (max - min)) * 100;
  const off      = Math.abs(value - ideal) / (max - min);
  const color    = off > 0.18 ? '#EF4444' : (off > 0.08 ? '#F59E0B' : '#22D3EE');
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] uppercase tracking-widest text-slate-400">{label}</span>
        <span className="num text-sm font-semibold" style={{ color }}>
          {typeof value === 'number' ? value.toFixed(unit === 'g' ? 2 : (unit === 'm/min' ? 2 : 0)) : value}
          <span className="text-slate-500 text-[10px] ml-1">{unit}</span>
        </span>
      </div>
      <div className="relative">
        <input type="range" min={min} max={max} step={step} value={value}
               onChange={e => onChange(parseFloat(e.target.value))} className="w-full"/>
        <div className="absolute top-[-2px] w-0.5 h-2 bg-grind-400"
             style={{ left: `${idealPct}%`, boxShadow: '0 0 4px #10B981' }}/>
      </div>
      <div className="flex justify-between text-[9px] text-slate-500 num mt-0.5">
        <span>{min}</span>
        <span className="text-grind-400">● {ideal}{unit}</span>
        <span>{max}</span>
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

// ─── CSV telemetry view ───────────────────────────────────────────────────────
function CSVView({ csvData, machine }) {
  const numCols  = getNumericCols(csvData.header, csvData.rows);
  const lastRow  = csvData.rows[csvData.rows.length - 1] || {};
  const lastRows = csvData.rows.slice(-50);

  return (
    <Card title={`Telemetría · ${machine.id}`}
          subtitle={`${csvData.name} · ${csvData.rows.length} registros · ${numCols.length} variables`}
          accent="cyan">

      {/* Last-row "current" values */}
      <div className="grid grid-cols-3 md:grid-cols-6 gap-2 mb-4">
        {numCols.slice(0, 6).map((col, i) => {
          const v = parseFloat(lastRow[col]);
          return (
            <div key={col} className="panel rounded p-2.5">
              <div className="text-[9px] uppercase tracking-widest text-slate-500 truncate mb-1">
                {col.replace(/_/g, ' ')}
              </div>
              <div className="num text-lg font-semibold" style={{ color: COLORS[i % COLORS.length] }}>
                {isNaN(v) ? '—' : v.toFixed(2)}
              </div>
            </div>
          );
        })}
      </div>

      {/* Sparklines grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 mb-4">
        {numCols.slice(0, 6).map((col, i) => {
          const vals = csvData.rows.map(r => parseFloat(r[col])).filter(v => !isNaN(v));
          const min  = Math.min(...vals), max = Math.max(...vals);
          return (
            <div key={col} className="panel rounded p-2.5">
              <div className="text-[9px] uppercase tracking-widest text-slate-500 truncate">{col.replace(/_/g, ' ')}</div>
              <MiniChart data={vals.slice(-40)} color={COLORS[i % COLORS.length]}/>
              <div className="flex justify-between text-[9px] text-slate-600 num mt-1">
                <span>↓{min.toFixed(1)}</span><span>↑{max.toFixed(1)}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Data table */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="text-[9px] tracking-widest uppercase text-slate-500">
            <tr className="hairline-bottom">
              <th className="text-left py-2 pr-3">#</th>
              {csvData.header.map(h => (
                <th key={h} className="text-left pr-3 whitespace-nowrap">{h.replace(/_/g, ' ')}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {lastRows.map((row, i) => (
              <tr key={i} className="hairline-bottom hover:bg-white/[0.02]">
                <td className="py-1.5 pr-3 num text-slate-500">{csvData.rows.length - lastRows.length + i + 1}</td>
                {csvData.header.map(h => {
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

// ─── Main screen ──────────────────────────────────────────────────────────────
export default function MonitorSimScreen() {
  const { machines: machinesMap, csvFiles } = useData();
  const machinesArr = Object.keys(machinesMap).length ? Object.values(machinesMap) : MOCK_MACHINES;

  const [selected, setSelected] = useState(() => {
    // Default to first machine that has CSV data, or first machine
    const withCsv = machinesArr.find(m => csvFiles[m.id]);
    return withCsv?.id || machinesArr[0]?.id || 'INJ-07';
  });
  const [params, setParams] = useState({ temp:204, speed:78, pressure:124, vibration:0.42, torque:214 });

  const machine      = machinesArr.find(m => m.id === selected) || machinesArr[0];
  const csvData      = csvFiles[selected] || null;
  const hasCsvForAny = Object.keys(csvFiles).length;

  // Init sliders from CSV last row whenever machine selection changes
  useEffect(() => {
    if (!csvData) return;
    const lastRow = csvData.rows[csvData.rows.length - 1] || {};
    setParams(extractParams(lastRow));
  }, [selected, csvData?.name]);

  const r           = computeLocal(params);
  const statusColor = machine?.status === 'CRITICAL' ? 'red' : (machine?.status === 'WARN' ? 'amber' : 'cyan');

  return (
    <div className="p-6 space-y-5">
      <PageHeader
        eyebrow="// MONITOREO · MÁQUINA A MÁQUINA"
        title="Monitoreo y Simulación"
        desc="Seleccioná una máquina, cargá su CSV y analizá telemetría + simulación de variables."
        actions={
          <div className="flex items-center gap-2">
            {csvData
              ? <Chip color="green"><span className="w-1.5 h-1.5 rounded-full bg-grind-400 pulse-dot mr-1"/>{csvData.rows.length} registros</Chip>
              : <Chip color="slate">Sin CSV — subí desde Dashboard</Chip>}
            {hasCsvForAny > 0 && <Chip color="cyan">{hasCsvForAny} máq. cargadas</Chip>}
          </div>
        }
      />

      {/* Machine selector */}
      <div className="flex gap-2 flex-wrap">
        {machinesArr.map(m => {
          const isSel  = m.id === selected;
          const hasCSV = !!csvFiles[m.id];
          const sc     = m.status === 'CRITICAL' ? '#EF4444' : (m.status === 'WARN' ? '#F59E0B' : '#10B981');
          return (
            <button key={m.id} onClick={() => setSelected(m.id)}
                    className={`flex items-center gap-2 px-3 py-2 rounded-md text-xs transition border ${
                      isSel
                        ? 'bg-cyan2-400/15 border-cyan2-400/40 text-cyan2-400'
                        : 'panel border-transparent text-slate-400 hover:text-white'
                    }`}>
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: sc, boxShadow: `0 0 5px ${sc}` }}/>
              <span className="font-mono font-semibold">{m.id}</span>
              <span className="text-slate-500 hidden sm:inline">{m.name}</span>
              {hasCSV && <span className="text-grind-400 text-[9px]">●CSV</span>}
            </button>
          );
        })}
      </div>

      {/* CSV section — read-only, uploaded from Dashboard */}
      {csvData ? (
        <CSVView csvData={csvData} machine={machine}/>
      ) : (
        <Card title={`Telemetría · ${selected}`} subtitle={machine?.name} accent="cyan">
          <div className="flex flex-col items-center justify-center py-14 gap-3 text-center">
            <span className="text-cyan2-400 opacity-30 text-4xl">{I.table}</span>
            <div className="text-slate-300 text-sm font-medium">No hay CSV para {selected}</div>
            <div className="text-slate-500 text-xs max-w-xs">
              Subí el archivo <span className="text-cyan2-400 font-mono">{selected}_historico.csv</span> desde el <span className="text-cyan2-400">Dashboard</span> para ver la telemetría aquí.
            </div>
          </div>
        </Card>
      )}

      {/* Variables + Impact — always visible, initialized from CSV when loaded */}
      <div className="grid grid-cols-12 gap-4">

        <Card title="Variables de proceso"
              subtitle={csvData ? `Sliders inicializados desde CSV · ${machine?.id}` : `Setpoints · ${machine?.id}`}
              className="col-span-12 xl:col-span-5" accent="cyan">
          <div className="space-y-4">
            <ParamSlider label="Temperatura" unit="°C"   min={150} max={300} step={1}    ideal={200} value={params.temp}      onChange={v => setParams(p => ({ ...p, temp:v }))}/>
            <ParamSlider label="Velocidad"   unit="%"    min={0}   max={100} step={1}    ideal={70}  value={params.speed}     onChange={v => setParams(p => ({ ...p, speed:v }))}/>
            <ParamSlider label="Presión"     unit="bar"  min={80}  max={180} step={1}    ideal={120} value={params.pressure}  onChange={v => setParams(p => ({ ...p, pressure:v }))}/>
            <ParamSlider label="Vibración"   unit="g"    min={0.1} max={1.5} step={0.01} ideal={0.4} value={params.vibration} onChange={v => setParams(p => ({ ...p, vibration:v }))}/>
            <ParamSlider label="Torque"      unit="N·m"  min={120} max={320} step={1}    ideal={210} value={params.torque}    onChange={v => setParams(p => ({ ...p, torque:v }))}/>
          </div>
          {csvData && (
            <button onClick={() => setParams(extractParams(csvData.rows[csvData.rows.length - 1] || {}))}
                    className="mt-4 w-full panel rounded py-2 text-xs text-slate-400 hover:text-cyan2-400 transition hairline flex items-center justify-center gap-1">
              {I.refresh} Restablecer desde último registro CSV
            </button>
          )}
        </Card>

        <Card title="Impacto predicho" subtitle="Modelo físico local · ajustá sliders para simular"
              className="col-span-12 xl:col-span-4"
              accent={(r.defect || 0) > 4 ? 'red' : ((r.defect || 0) > 2.5 ? 'amber' : 'green')}
              glow={(r.defect || 0) > 4 ? 'shadow-glowCrit' : ''}>
          <div className="space-y-2">
            <ImpactRow label="Cp"         value={r.cp.toFixed(2)}           delta={r.cp - 1.42}        target="1.33"/>
            <ImpactRow label="Cpk"        value={r.cpk.toFixed(2)}          delta={r.cpk - 1.31}       target="1.33"/>
            <ImpactRow label="Sigma σ"    value={r.sigma.toFixed(2)}        delta={r.sigma - 4.61}     target="4.5"/>
            <ImpactRow label="Defectos"   value={r.defect.toFixed(2) + '%'} delta={r.defect - 1.4}     target="1.5"  invert/>
            <ImpactRow label="Yield"      value={r.yield.toFixed(1) + '%'}  delta={r.yield - 98.6}     target="98"/>
            <ImpactRow label="Producción" value={r.production + ' u/h'}     delta={r.production - 612} target="600"/>
          </div>
          <div className="mt-4 panel rounded p-3 flex items-start gap-2 border border-ai-400/30">
            <span className="text-ai-400 mt-0.5">{I.bot}</span>
            <div className="text-xs text-slate-300">
              <div className="text-[10px] tracking-[0.25em] uppercase text-ai-400 mb-1">SUGERENCIA</div>
              {Math.abs((params.temp - 200) / 10) > 0.5
                ? 'Reducir temperatura a 200°C para minimizar defectos.'
                : (params.vibration > 0.65
                  ? 'Vibración elevada — inspeccionar rodamientos.'
                  : 'Parámetros dentro de zona óptima ±2σ.')}
            </div>
          </div>
        </Card>

        <Card title={`Máquina · ${machine?.id || '—'}`} subtitle={machine?.name}
              className="col-span-12 xl:col-span-3"
              accent={statusColor}>
          <div className="space-y-3">
            {[
              { l: 'Estado',     v: machine?.status === 'CRITICAL' ? 'Crítico' : machine?.status === 'WARN' ? 'Atención' : machine?.status === 'IDLE' ? 'En espera' : 'Operando' },
              { l: 'Línea',      v: machine?.line || '—' },
              { l: 'OEE',        v: machine?.oee != null ? machine.oee.toFixed(1) + ' %' : '—' },
              { l: 'Temperatura',v: machine?.temp   != null ? machine.temp.toFixed(1)   + ' °C' : '—' },
              { l: 'Vibración',  v: machine?.vib    != null ? machine.vib.toFixed(2)    + ' g'  : '—' },
              { l: 'RPM',        v: machine?.rpm    != null ? Math.round(machine.rpm).toLocaleString() : '—' },
              { l: 'Carga',      v: machine?.load   != null ? machine.load.toFixed(0)   + ' %'  : '—' },
              { l: 'Defectos',   v: machine?.defect != null ? machine.defect.toFixed(2) + ' %'  : '—' },
            ].map(s => (
              <div key={s.l} className="flex items-center justify-between hairline-bottom pb-2 last:border-0 last:pb-0">
                <span className="text-[10px] uppercase tracking-widest text-slate-500">{s.l}</span>
                <span className="num text-sm text-white">{s.v}</span>
              </div>
            ))}
          </div>
          {csvData && (
            <div className="mt-4 panel rounded p-2.5 text-[10px] text-slate-400 text-center">
              {csvData.rows.length} registros · último: {csvData.rows[csvData.rows.length - 1]?.fecha_hora || '—'}
            </div>
          )}
        </Card>

      </div>
    </div>
  );
}
