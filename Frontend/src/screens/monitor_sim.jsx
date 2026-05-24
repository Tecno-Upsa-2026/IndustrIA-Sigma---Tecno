import { useState, useEffect } from 'react'
import { Card, Chip, PageHeader, StatusDot } from '../shell'
import { Gauge, LiveWave } from '../charts'
import { MACHINES as MOCK_MACHINES } from '../data'
import { I } from '../icons'
import { useData } from '../context/DataContext'

function computeLocal(params) {
  const tDelta = (params.temp - 200) / 10;
  const vDelta = (params.vibration - 0.4) * 5;
  const sDelta = (params.speed - 70) / 12;
  const defect = Math.max(0.2, 1.4 + tDelta*tDelta*0.15 + vDelta*vDelta*0.4 + sDelta*sDelta*0.18);
  const yld    = Math.max(80, 99.6 - defect * 1.4);
  const cp     = Math.max(0.5, 1.42 - Math.abs(tDelta)*0.05 - Math.abs(vDelta)*0.12);
  return {
    defect, yield: yld, cp, cpk: cp - 0.11,
    sigma: 3 + (cp - 1) * 2,
    production: Math.round(580 + params.speed * 1.4 - defect * 8),
  };
}

function ParamSlider({ label, unit, min, max, step, value, onChange, ideal }) {
  const idealPct = ((ideal - min) / (max - min)) * 100;
  const off      = Math.abs(value - ideal) / (max - min);
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
        <div className="absolute top-[-2px] w-0.5 h-2 bg-grind-400"
             style={{left:`${idealPct}%`, boxShadow:'0 0 4px #10B981'}}/>
      </div>
      <div className="flex justify-between text-[9px] text-slate-500 num mt-0.5">
        <span>{min}</span>
        <span className="text-grind-400">●target {ideal}{unit}</span>
        <span>{max}</span>
      </div>
    </div>
  );
}

function ImpactRow({ label, value, delta, target, invert }) {
  const good  = invert ? delta < 0 : delta >= 0;
  const color = good ? '#10B981' : '#EF4444';
  return (
    <div className="flex items-center justify-between panel rounded p-2">
      <div>
        <div className="text-[10px] uppercase tracking-widest text-slate-500">{label}</div>
        <div className="num text-base text-white">{value}</div>
      </div>
      <div className="text-right">
        <div className="num text-xs" style={{color}}>{delta >= 0 ? '+' : ''}{typeof delta==='number' ? delta.toFixed(2) : delta}</div>
        <div className="text-[9px] text-slate-500">vs {target}</div>
      </div>
    </div>
  );
}

function DigitalTwin({ params, defectRate, tick }) {
  const t = tick * 5;
  const stations = [
    { x:80,  y:80, label:'INTAKE', color:'#22D3EE' },
    { x:210, y:80, label:'INJECT', color: params.temp>235?'#EF4444':(params.temp>220?'#F59E0B':'#22D3EE') },
    { x:340, y:80, label:'PRESS',  color: params.pressure>150?'#F59E0B':'#22D3EE' },
    { x:470, y:80, label:'CURE',   color:'#3B82F6' },
    { x:600, y:80, label:'PACK',   color:'#A855F7' },
  ];
  const units = Array.from({length:6}).map((_,i) => ({
    pos: ((i*100 + t) % 560),
    bad: ((i*7+tick) % 17) < defectRate,
  }));
  return (
    <div className="relative">
      <div className="absolute inset-0 grid-bg-sm opacity-30 rounded"/>
      <svg width="100%" viewBox="0 0 680 200" className="relative">
        <line x1="30" y1="80" x2="660" y2="80" stroke="rgba(148,163,184,0.2)" strokeWidth="5"/>
        <line x1="30" y1="80" x2="660" y2="80" stroke="#22D3EE" strokeWidth="5" strokeDasharray="10 18" opacity="0.6" className="flow-dash"/>
        {stations.map((s,i) => (
          <g key={i}>
            <rect x={s.x-40} y={s.y-30} width="80" height="60" rx="6" fill="rgba(15,23,42,0.9)" stroke={s.color} strokeWidth="1.2"/>
            <text x={s.x} y={s.y-8}  fill="#E2E8F0" fontSize="9"  textAnchor="middle" fontWeight="600">{s.label}</text>
            <text x={s.x} y={s.y+8}  fill={s.color}   fontSize="8"  textAnchor="middle" fontFamily="JetBrains Mono">
              {s.label==='INJECT'?params.temp+'°C':s.label==='PRESS'?params.pressure+'bar':'OK'}
            </text>
            <text x={s.x} y={s.y+22} fill="#64748B" fontSize="7"  textAnchor="middle" fontFamily="JetBrains Mono">S-0{i+1}</text>
          </g>
        ))}
        {units.map((u,i) => (
          <circle key={i} cx={30+u.pos} cy={80} r="5" fill={u.bad?'#EF4444':'#22D3EE'} opacity="0.95"
                  style={{filter:`drop-shadow(0 0 5px ${u.bad?'#EF4444':'#22D3EE'})`}}/>
        ))}
        <g transform="translate(30,140)">
          {[
            {label:'TEMP',  v:params.temp+'°C',              c: params.temp>235?'#EF4444':'#F59E0B', x:0},
            {label:'SPEED', v:params.speed+'%',              c:'#22D3EE', x:140},
            {label:'PRES',  v:params.pressure+'bar',         c:'#3B82F6', x:280},
            {label:'VIB',   v:params.vibration.toFixed(2)+'g', c: params.vibration>0.7?'#EF4444':'#22D3EE', x:420},
            {label:'TORQ',  v:params.torque+'Nm',            c:'#A855F7', x:560},
          ].map(s => (
            <g key={s.label} transform={`translate(${s.x},0)`}>
              <rect x="0" y="0" width="110" height="34" rx="4" fill="rgba(11,16,32,0.9)" stroke="rgba(148,163,184,0.15)"/>
              <text x="7" y="13" fill="#64748B" fontSize="7"  fontFamily="JetBrains Mono">{s.label}</text>
              <text x="7" y="28" fill={s.c}     fontSize="12" fontFamily="JetBrains Mono" fontWeight="600">{s.v}</text>
            </g>
          ))}
        </g>
        <g transform="translate(530,18)">
          <text x="0" y="0"  fill="#64748B" fontSize="8" fontFamily="JetBrains Mono">DEFECTOS PREDICHOS</text>
          <text x="0" y="18" fill={defectRate>4?'#EF4444':(defectRate>2.5?'#F59E0B':'#10B981')} fontSize="20" fontFamily="JetBrains Mono" fontWeight="700">{defectRate.toFixed(2)}%</text>
        </g>
      </svg>
    </div>
  );
}

function PlantTopology({ selected, onSelect, machines }) {
  const machineMap = Object.fromEntries((machines||[]).map(m => [m.id, m]));
  const nodes = [
    { id:'IN',     x:60,  y:200, kind:'io', label:'Materia prima' },
    { id:'CNC-04', x:180, y:120, kind:'m',  label:'CNC A4' },
    { id:'CNC-21', x:180, y:280, kind:'m',  label:'CNC L21' },
    { id:'PRS-12', x:310, y:120, kind:'m',  label:'Press 12' },
    { id:'WLD-02', x:310, y:280, kind:'m',  label:'Robot R2' },
    { id:'INJ-07', x:440, y:200, kind:'m',  label:'Injection 07' },
    { id:'OVN-09', x:570, y:200, kind:'m',  label:'Oven 9' },
    { id:'PCK-03', x:700, y:200, kind:'m',  label:'Pack 3' },
    { id:'OUT',    x:820, y:200, kind:'io', label:'Almacén' },
  ];
  const links = [['IN','CNC-04'],['IN','CNC-21'],['CNC-04','PRS-12'],['CNC-21','WLD-02'],['PRS-12','INJ-07'],['WLD-02','INJ-07'],['INJ-07','OVN-09'],['OVN-09','PCK-03'],['PCK-03','OUT']];
  const nodeMap = Object.fromEntries(nodes.map(n => [n.id, n]));
  return (
    <div className="relative">
      <div className="absolute inset-0 grid-bg-sm opacity-40 rounded pointer-events-none"/>
      <svg width="100%" viewBox="0 0 900 400" className="relative">
        {links.map(([a,b],i) => { const A=nodeMap[a],B=nodeMap[b]; return <line key={i} x1={A.x} y1={A.y} x2={B.x} y2={B.y} stroke="rgba(148,163,184,0.18)" strokeWidth="2"/>; })}
        {links.map(([a,b],i) => { const A=nodeMap[a],B=nodeMap[b]; return <line key={`f${i}`} x1={A.x} y1={A.y} x2={B.x} y2={B.y} stroke="#22D3EE" strokeWidth="2" className="flow-dash" opacity="0.7"/>; })}
        {nodes.map(n => {
          const isSel  = n.id === selected;
          const liveM  = machineMap[n.id];
          const isCrit = liveM?.status === 'CRITICAL';
          const isWarn = liveM?.status === 'WARN';
          const color  = isCrit ? '#EF4444' : (isWarn ? '#F59E0B' : '#22D3EE');
          if (n.kind === 'io') return (
            <g key={n.id} onClick={() => onSelect(n.id)} style={{cursor:'pointer'}}>
              <rect x={n.x-44} y={n.y-22} width="88" height="44" rx="6" fill="rgba(11,16,32,0.85)" stroke="rgba(148,163,184,0.35)"/>
              <text x={n.x} y={n.y-4}  fill="#94A3B8" fontSize="9"  textAnchor="middle" fontFamily="JetBrains Mono">{n.id}</text>
              <text x={n.x} y={n.y+11} fill="#E2E8F0" fontSize="10" textAnchor="middle">{n.label}</text>
            </g>
          );
          return (
            <g key={n.id} onClick={() => onSelect(n.id)} style={{cursor:'pointer'}}>
              {(isCrit||isWarn) && <circle cx={n.x} cy={n.y} r="40" fill="none" stroke={color} strokeOpacity="0.4" className="blip"/>}
              <rect x={n.x-52} y={n.y-30} width="104" height="60" rx="8" fill="rgba(15,23,42,0.92)"
                    stroke={isSel?'#22D3EE':color} strokeWidth={isSel?2:1.2}
                    style={{filter:isSel?'drop-shadow(0 0 10px #22D3EE)':''}}/>
              <circle cx={n.x-40} cy={n.y-18} r="3" fill={color} style={{filter:`drop-shadow(0 0 4px ${color})`}}/>
              <text x={n.x-30} y={n.y-15} fill="#94A3B8" fontSize="8"  fontFamily="JetBrains Mono">{n.id}</text>
              <text x={n.x}    y={n.y+2}  fill="#E2E8F0" fontSize="10" textAnchor="middle" fontWeight="600">{n.label}</text>
              <text x={n.x}    y={n.y+18} fill={color}   fontSize="9"  textAnchor="middle" fontFamily="JetBrains Mono">
                {liveM?.oee?.toFixed(1) || '—'} % OEE
              </text>
            </g>
          );
        })}
        <text x="20" y="390" fill="#64748B" fontSize="9" fontFamily="JetBrains Mono">FLOW · MATERIAL → PRODUCTO</text>
      </svg>
    </div>
  );
}

export default function MonitorSimScreen() {
  const { machines: machinesMap, simulator, actions } = useData();
  const machinesArr = Object.keys(machinesMap).length ? Object.values(machinesMap) : MOCK_MACHINES;

  const [selected, setSelected] = useState('INJ-07');
  const [params, setParams] = useState({ temp:204, speed:78, pressure:124, vibration:0.42, torque:214 });
  const [tick, setTick] = useState(0);

  const running = simulator.status === 'running';
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setTick(t => t+1), 800);
    return () => clearInterval(id);
  }, [running]);

  const machine = machinesArr.find(m => m.id === selected) || machinesArr[0];
  const r = computeLocal(params);

  const handleParamChange = (key, val) => {
    const next = { ...params, [key]: val };
    setParams(next);
    if (running) actions.updateSimParams(next).catch(() => {});
  };

  const handleToggle = async () => {
    if (running) await actions.stopSimulator().catch(() => {});
    else         await actions.runSimulator().catch(() => {});
  };

  const handleReset = () => {
    actions.resetSimulator().catch(() => {});
    setParams({ temp:204, speed:78, pressure:124, vibration:0.42, torque:214 });
    setTick(0);
  };

  const statusColor = machine?.status==='CRITICAL'?'red':(machine?.status==='WARN'?'amber':'cyan');

  return (
    <div className="p-6 space-y-5">
      <PageHeader
        eyebrow="// MONITOREO Y GEMELO DIGITAL"
        title="Monitoreo y Simulación"
        desc="Telemetría en tiempo real + simulación de variables del proceso para la máquina seleccionada."
        actions={
          <div className="flex items-center gap-2">
            <Chip color="green"><span className="w-1.5 h-1.5 rounded-full bg-grind-400 pulse-dot"/>LIVE</Chip>
            <button onClick={handleToggle} className="panel rounded-md px-3 py-2 text-xs text-slate-300 hairline flex items-center gap-2 hover:text-cyan2-400">
              {running ? I.pause : I.play} {running ? 'Pausar' : 'Reanudar'}
            </button>
            <button onClick={handleReset} className="panel rounded-md px-3 py-2 text-xs text-slate-300 hairline flex items-center gap-2 hover:text-cyan2-400">
              {I.refresh} Reset
            </button>
            <button className="px-3 py-2 text-xs rounded-md bg-cyan2-400/15 border border-cyan2-400/40 text-cyan2-400 flex items-center gap-2">
              {I.bolt} Aplicar a {selected}
            </button>
          </div>
        }
      />

      {/* Row 1: Topology + Machine detail */}
      <div className="grid grid-cols-12 gap-4">
        <Card title="Topología de planta" subtitle="Querétaro MX-01 · 4 líneas · 28 nodos"
              className="col-span-12 xl:col-span-8" accent="cyan">
          <PlantTopology selected={selected} onSelect={setSelected} machines={machinesArr}/>
          <div className="grid grid-cols-4 gap-2 mt-3">
            {[
              {l:'Nodos online',    v:'26/28', c:'green'},
              {l:'Sensores activos',v:'412',   c:'cyan'},
              {l:'Throughput',      v:'1.4 GB/h', c:'cyan'},
              {l:'Latencia red',    v:'42 ms', c:'green'},
            ].map(s => (
              <div key={s.l} className="panel rounded p-2">
                <div className="text-[10px] text-slate-500 uppercase tracking-widest">{s.l}</div>
                <div className={`num text-base ${s.c==='green'?'text-grind-400':'text-cyan2-400'}`}>{s.v}</div>
              </div>
            ))}
          </div>
        </Card>

        {machine && (
          <Card title={`Detalle · ${machine.id}`} subtitle={`${machine.name} · ${machine.line}`}
                className="col-span-12 xl:col-span-4"
                accent={statusColor}
                glow={machine.status==='CRITICAL'?'shadow-glowCrit':''}>
            <div className="flex items-center justify-between mb-3">
              <Chip color={machine.status==='CRITICAL'?'red':(machine.status==='WARN'?'amber':'green')}>
                <StatusDot status={machine.status}/> {machine.status==='CRITICAL'?'Crítico':machine.status==='WARN'?'Atención':machine.status==='IDLE'?'En espera':'Operando'}
              </Chip>
              <span className="num text-[11px] text-slate-500">SN · {machine.id.replace('-','')}-2026</span>
            </div>
            <div className="grid grid-cols-3 gap-3 mb-4">
              <Gauge value={machine.oee||0}         label="OEE"      size={100} thickness={8} color="#22D3EE"/>
              <Gauge value={machine.load||0}        label="Carga"    size={100} thickness={8} color="#3B82F6" warn={85} crit={95}/>
              <Gauge value={(machine.defect||0)*10} label="Defectos" unit="‰" max={100} size={100} thickness={8} color="#EF4444" warn={30} crit={60}/>
            </div>
            <div className="space-y-2">
              {[
                {l:'Temperatura', v:(machine.temp||0).toFixed(1), u:'°C', c:'#F59E0B', amp:6,   ic:I.thermo},
                {l:'Vibración',   v:(machine.vib||0).toFixed(2),  u:'g',  c:'#EF4444', amp:0.5, ic:I.wave},
                {l:'RPM',         v:String(machine.rpm||0),        u:'',   c:'#22D3EE', amp:80,  ic:I.gauge},
                {l:'Humedad',     v:'34.2',                        u:'%',  c:'#3B82F6', amp:3,   ic:I.drop},
              ].map(s => (
                <div key={s.l} className="flex items-center gap-3 panel rounded p-2">
                  <span style={{color:s.c}}>{s.ic}</span>
                  <div className="w-20">
                    <div className="text-[10px] text-slate-500 uppercase tracking-widest">{s.l}</div>
                    <div className="num text-sm" style={{color:s.c}}>{s.v}<span className="text-slate-500 text-[10px] ml-1">{s.u}</span></div>
                  </div>
                  <div className="flex-1">
                    <LiveWave color={s.c} amp={s.amp} base={50} speed={140} height={28}/>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>

      {/* Row 2: Variables + Digital Twin + Impact */}
      <div className="grid grid-cols-12 gap-4">
        <Card title="Variables de proceso" subtitle={`Setpoints · ${selected}`}
              className="col-span-12 xl:col-span-3" accent="cyan">
          <div className="space-y-4">
            <ParamSlider label="Temperatura" unit="°C"  min={150} max={260} step={1}    ideal={200} value={params.temp}      onChange={v=>handleParamChange('temp',v)}/>
            <ParamSlider label="Velocidad"   unit="%"   min={0}   max={100} step={1}    ideal={70}  value={params.speed}     onChange={v=>handleParamChange('speed',v)}/>
            <ParamSlider label="Presión"     unit="bar" min={80}  max={180} step={1}    ideal={120} value={params.pressure}  onChange={v=>handleParamChange('pressure',v)}/>
            <ParamSlider label="Vibración"   unit="g"   min={0.1} max={1.2} step={0.01} ideal={0.4} value={params.vibration} onChange={v=>handleParamChange('vibration',v)}/>
            <ParamSlider label="Torque"      unit="N·m" min={120} max={320} step={1}    ideal={210} value={params.torque}    onChange={v=>handleParamChange('torque',v)}/>
          </div>
          <div className="mt-4 panel rounded p-3 flex items-start gap-2 border border-ai-400/30">
            <span className="text-ai-400 mt-0.5">{I.bot}</span>
            <div className="text-xs text-slate-300">
              <div className="text-[10px] tracking-[0.25em] uppercase text-ai-400 mb-1">SUGERENCIA IA</div>
              {Math.abs((params.temp-200)/10)>0.5 ? 'Reducir temperatura a 200°C.' : (Math.abs((params.vibration-0.4)*5)>0.4 ? 'Vibración alta: inspeccionar rodamientos.' : 'Parámetros dentro de zona óptima ±2σ.')}
            </div>
          </div>
        </Card>

        <Card title="Gemelo digital" subtitle={`${selected} · tick ${tick} · ${running?'EJECUTANDO':'PAUSADO'}`}
              className="col-span-12 xl:col-span-6" accent="cyan">
          <DigitalTwin params={params} defectRate={r.defect||0} tick={tick}/>
        </Card>

        <Card title="Impacto" subtitle="Predicción del modelo"
              className="col-span-12 xl:col-span-3"
              accent={(r.defect||0)>4?'red':((r.defect||0)>2.5?'amber':'green')}
              glow={(r.defect||0)>4?'shadow-glowCrit':''}>
          <div className="space-y-2">
            <ImpactRow label="Cp"         value={(r.cp||0).toFixed(2)}           delta={(r.cp||0)-1.42}        target={1.33}/>
            <ImpactRow label="Cpk"        value={(r.cpk||0).toFixed(2)}          delta={(r.cpk||0)-1.31}       target={1.33}/>
            <ImpactRow label="Sigma σ"    value={(r.sigma||0).toFixed(2)}        delta={(r.sigma||0)-4.61}     target={4.5}/>
            <ImpactRow label="Defectos"   value={(r.defect||0).toFixed(2)+'%'}   delta={(r.defect||0)-1.4}     target={1.5}  invert/>
            <ImpactRow label="Yield"      value={(r.yield||0).toFixed(1)+'%'}    delta={(r.yield||0)-98.6}     target={98}/>
            <ImpactRow label="Producción" value={(r.production||0)+' u/h'}       delta={(r.production||0)-612} target={600}/>
          </div>
        </Card>
      </div>
    </div>
  );
}
