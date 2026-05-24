import { useState, useEffect } from 'react'
import { Card, Chip, PageHeader, StatusDot } from '../shell'
import { LiveWave } from '../charts'
import { MACHINES as MOCK_MACHINES } from '../data'
import { I } from '../icons'
import { useData } from '../context/DataContext'

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

// ─── Physics model ────────────────────────────────────────────────────────────
function computeLocal(params) {
  const tDelta = (params.temp - 200) / 10;
  const vDelta = (params.vibration - 0.4) * 5;
  const sDelta = (params.speed - 70) / 12;
  const defect = Math.max(0.2, 1.4 + tDelta*tDelta*0.15 + vDelta*vDelta*0.4 + sDelta*sDelta*0.18);
  const yld    = Math.max(80, 99.6 - defect * 1.4);
  const cp     = Math.max(0.5, 1.42 - Math.abs(tDelta)*0.05 - Math.abs(vDelta)*0.12);
  return {
    defect,
    yield:      yld,
    cp,
    cpk:        cp - 0.11,
    sigma:      3 + (cp - 1) * 2,
    production: Math.round(580 + params.speed * 1.4 - defect * 8),
  };
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
          {typeof value === 'number' ? value.toFixed(unit === 'g' ? 2 : 0) : value}
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

// ─── AI suggestion ────────────────────────────────────────────────────────────
function AISuggestion({ params, result }) {
  const issues = [];
  if (Math.abs(params.temp - 200) > 15)
    issues.push(`Temperatura ${params.temp > 200 ? '+' : ''}${(params.temp - 200).toFixed(0)}°C del setpoint — impacto directo en Cpk`);
  if (params.vibration > 0.62)
    issues.push(`Vibración ${params.vibration.toFixed(2)}g — inspeccionar rodamientos`);
  if (Math.abs(params.pressure - 120) > 22)
    issues.push(`Presión ${params.pressure > 120 ? 'elevada' : 'baja'} (${params.pressure} bar) — verificar válvulas`);
  if (result.defect > 3.5)
    issues.push(`Tasa de defecto alta (${result.defect.toFixed(1)}%) — ajustar parámetros críticos`);
  if (!issues.length)
    return <span>Parámetros dentro de zona óptima ±2σ. Producción estable.</span>;
  return <span>{issues[0]}</span>;
}

// ─── Main screen ──────────────────────────────────────────────────────────────
export default function MonitorSimScreen() {
  const { machines: machinesMap, csvFiles } = useData();
  const machinesArr = Object.keys(machinesMap).length ? Object.values(machinesMap) : MOCK_MACHINES;

  const [selected, setSelected] = useState(() => {
    const withCsv = machinesArr.find(m => csvFiles[m.id]);
    return withCsv?.id || machinesArr[0]?.id || 'INJ-07';
  });
  const [params, setParams] = useState({ temp:204, speed:78, pressure:124, vibration:0.42, torque:214 });

  const machine = machinesArr.find(m => m.id === selected) || machinesArr[0];
  const csvData = csvFiles[selected] || null;

  // Sync sliders to CSV last row when machine or CSV changes
  useEffect(() => {
    if (!csvData) return;
    const lastRow = csvData.rows[csvData.rows.length - 1] || {};
    setParams(extractParams(lastRow));
  }, [selected, csvData?.name]);

  const r           = computeLocal(params);
  const statusMap   = { RUNNING:'Operando', WARN:'Atención', CRITICAL:'Crítico', IDLE:'En espera' };
  const statusColor = { RUNNING:'#10B981', WARN:'#F59E0B', CRITICAL:'#EF4444', IDLE:'#64748B' };
  const sc          = statusColor[machine?.status] || '#64748B';
  const accentMap   = { RUNNING:'green', WARN:'amber', CRITICAL:'red', IDLE:'slate' };
  const accent      = accentMap[machine?.status] || 'cyan';
  const impactAccent = r.defect > 4 ? 'red' : r.defect > 2.5 ? 'amber' : 'green';

  // Numeric columns from CSV for the "valores actuales" strip
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

      {/* Current CSV values strip — compact, only if CSV loaded */}
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
          <button onClick={() => setParams(extractParams(lastRow))}
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
            <LiveWave color={sc} amp={machine?.status === 'IDLE' ? 1 : machine?.status === 'CRITICAL' ? 10 : 6}
                      base={50} speed={machine?.status === 'IDLE' ? 800 : 200} height={36}/>
          </div>
          <div className="space-y-2">
            {[
              { l:'OEE',        v: machine?.oee   != null ? machine.oee.toFixed(1)   + ' %'  : '—' },
              { l:'Temperatura',v: machine?.temp  != null ? machine.temp.toFixed(1)  + ' °C' : '—' },
              { l:'Vibración',  v: machine?.vib   != null ? machine.vib.toFixed(2)   + ' g'  : '—' },
              { l:'Carga',      v: machine?.load  != null ? machine.load.toFixed(0)  + ' %'  : '—' },
              { l:'Defectos',   v: machine?.defect!= null ? machine.defect.toFixed(2)+ ' %'  : '—' },
              { l:'Línea',      v: machine?.line  || '—' },
            ].map(s => (
              <div key={s.l} className="flex items-center justify-between hairline-bottom pb-1.5 last:border-0 last:pb-0">
                <span className="text-[10px] uppercase tracking-widest text-slate-500">{s.l}</span>
                <span className="num text-sm text-white">{s.v}</span>
              </div>
            ))}
          </div>
        </Card>

        {/* Process variable sliders */}
        <Card title="Variables de proceso"
              subtitle={csvData ? `Inicializado desde CSV · ${machine?.id}` : `Setpoints manuales · ${machine?.id}`}
              className="col-span-12 xl:col-span-4" accent="cyan">
          <div className="space-y-4">
            <ParamSlider label="Temperatura" unit="°C"  min={150} max={300} step={1}    ideal={200} value={params.temp}      onChange={v => setParams(p => ({ ...p, temp:v }))}/>
            <ParamSlider label="Velocidad"   unit="%"   min={0}   max={100} step={1}    ideal={70}  value={params.speed}     onChange={v => setParams(p => ({ ...p, speed:v }))}/>
            <ParamSlider label="Presión"     unit="bar" min={80}  max={180} step={1}    ideal={120} value={params.pressure}  onChange={v => setParams(p => ({ ...p, pressure:v }))}/>
            <ParamSlider label="Vibración"   unit="g"   min={0.1} max={1.5} step={0.01} ideal={0.4} value={params.vibration} onChange={v => setParams(p => ({ ...p, vibration:v }))}/>
            <ParamSlider label="Torque"      unit="N·m" min={120} max={320} step={1}    ideal={210} value={params.torque}    onChange={v => setParams(p => ({ ...p, torque:v }))}/>
          </div>
          <div className="mt-4 panel rounded p-3 flex items-start gap-2 border border-ai-400/30">
            <span className="text-ai-400 mt-0.5 shrink-0">{I.bot}</span>
            <div className="text-xs text-slate-300">
              <div className="text-[10px] tracking-[0.25em] uppercase text-ai-400 mb-1">SUGERENCIA IA</div>
              <AISuggestion params={params} result={r}/>
            </div>
          </div>
        </Card>

        {/* Impact predictor */}
        <Card title="Impacto predicho"
              subtitle="Modelo físico local · ajustá sliders para simular"
              className="col-span-12 xl:col-span-5"
              accent={impactAccent}
              glow={r.defect > 4 ? 'shadow-glowCrit' : ''}>
          <div className="space-y-2">
            <ImpactRow label="Cp"         value={r.cp.toFixed(2)}            delta={r.cp - 1.42}        target="1.33"/>
            <ImpactRow label="Cpk"        value={r.cpk.toFixed(2)}           delta={r.cpk - 1.31}       target="1.33"/>
            <ImpactRow label="Sigma σ"    value={r.sigma.toFixed(2)}         delta={r.sigma - 4.61}     target="4.5"/>
            <ImpactRow label="Defectos"   value={r.defect.toFixed(2) + '%'}  delta={r.defect - 1.4}     target="1.5"  invert/>
            <ImpactRow label="Yield"      value={r.yield.toFixed(1) + '%'}   delta={r.yield - 98.6}     target="98"/>
            <ImpactRow label="Producción" value={r.production + ' u/h'}      delta={r.production - 612} target="600"/>
          </div>

          {/* Visual quality indicator */}
          <div className="mt-4 panel rounded p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] uppercase tracking-widest text-slate-500">Índice de calidad estimado</span>
              <span className="num text-sm font-semibold"
                    style={{ color: r.defect > 4 ? '#EF4444' : r.defect > 2.5 ? '#F59E0B' : '#10B981' }}>
                {r.defect > 4 ? 'CRÍTICO' : r.defect > 2.5 ? 'ATENCIÓN' : 'ÓPTIMO'}
              </span>
            </div>
            <div className="h-2 rounded bg-slate-700/50 overflow-hidden">
              <div className="h-full rounded transition-all duration-500"
                   style={{
                     width: `${Math.min(100, r.yield)}%`,
                     background: r.defect > 4
                       ? 'linear-gradient(90deg,#EF4444,#F59E0B)'
                       : r.defect > 2.5
                       ? 'linear-gradient(90deg,#F59E0B,#22D3EE)'
                       : 'linear-gradient(90deg,#10B981,#22D3EE)',
                   }}/>
            </div>
            <div className="flex justify-between text-[9px] text-slate-500 num mt-1">
              <span>Yield {r.yield.toFixed(1)}%</span>
              <span>{r.production} u/h</span>
            </div>
          </div>
        </Card>

      </div>
    </div>
  );
}
