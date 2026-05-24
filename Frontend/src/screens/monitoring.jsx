import { useState } from 'react'
import { Card, Chip, PageHeader, StatusDot } from '../shell'
import { Gauge, LiveWave } from '../charts'
import { I } from '../icons'
import { useData } from '../context/DataContext'

export default function MonitoringScreen(){
  const { machines: machinesMap } = useData();
  const machinesArr = Object.values(machinesMap);

  const [selected, setSelected] = useState('BTL-03');
  const machine = machinesArr.find(m=>m.id===selected) || machinesArr[0];

  return (
    <div className="p-6 space-y-5">
      <PageHeader
        eyebrow="// SCADA · REAL-TIME"
        title="Monitoreo en Tiempo Real"
        desc="Vista de telemetría continua de sensores, máquinas y nodos de planta."
        actions={
          <div className="flex items-center gap-2">
            <Chip color="green"><span className="w-1.5 h-1.5 rounded-full bg-grind-400 pulse-dot"/>LIVE · 42ms</Chip>
            <button className="panel rounded-md px-3 py-2 text-xs text-slate-300 hairline flex items-center gap-2 hover:text-cyan2-400">{I.layers} Topología</button>
            <button className="panel rounded-md px-3 py-2 text-xs text-slate-300 hairline flex items-center gap-2 hover:text-cyan2-400">{I.pause} Pausar feed</button>
          </div>
        }
      />

      <div className="grid grid-cols-12 gap-4">
        {machinesArr.length === 0 && (
          <Card title="Esperando backend" subtitle="Sin datos en TICK todavía" className="col-span-12" accent="cyan">
            <div className="text-sm text-slate-400">La vista de monitoreo se alimenta solo del backend en producción. Cuando llegue el primer TICK aparecerán las máquinas reales.</div>
          </Card>
        )}
        <Card title="Topología de planta" subtitle="Querétaro MX-01 · 2 líneas · 10 submáquinas" className="col-span-12 xl:col-span-8" accent="cyan">
          <PlantTopology selected={selected} onSelect={setSelected} machines={machinesArr}/>
          <div className="grid grid-cols-4 gap-2 mt-3">
            {[
              {l:'Nodos online',    v:'26/28', c:'green'},
              {l:'Sensores activos',v:'412',   c:'cyan'},
              {l:'Throughput',      v:'1.4 GB/h', c:'cyan'},
              {l:'Latencia red',    v:'42 ms', c:'green'},
            ].map(s=>(
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
                accent={machine.status==='CRITICAL'?'red':(machine.status==='WARN'?'amber':'cyan')}
                glow={machine.status==='CRITICAL'?'shadow-glowCrit':''}>
            <div className="flex items-center justify-between mb-3">
              <Chip color={machine.status==='CRITICAL'?'red':(machine.status==='WARN'?'amber':'green')}>
                <StatusDot status={machine.status}/>{machine.status}
              </Chip>
              <span className="num text-[11px] text-slate-500">SN · {machine.id.replace('-','')}-2026</span>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <Gauge value={machine.oee||0}        label="OEE"      size={110} thickness={9} color="#22D3EE"/>
              <Gauge value={machine.load||0}       label="Carga"    size={110} thickness={9} color="#3B82F6" warn={85} crit={95}/>
              <Gauge value={(machine.defect||0)*10} label="Defectos" unit="‰" max={100} size={110} thickness={9} color="#EF4444" warn={30} crit={60}/>
            </div>
            <div className="space-y-2 mt-4">
              {[
                {l:'Temperatura', v:(machine.temp||0).toFixed(1), u:'°C', c:'#F59E0B', amp:6,   ic:I.thermo},
                {l:'Vibración',   v:(machine.vib||0).toFixed(2),  u:'g',  c:'#EF4444', amp:0.5, ic:I.wave},
                {l:'RPM',         v:machine.rpm||0,               u:'',   c:'#22D3EE', amp:80,  ic:I.gauge},
                {l:'Humedad',     v:'34.2',                       u:'%',  c:'#3B82F6', amp:3,   ic:I.drop},
              ].map(s=>(
                <div key={s.l} className="flex items-center gap-3 panel rounded p-2">
                  <span style={{color:s.c}}>{s.ic}</span>
                  <div className="w-20">
                    <div className="text-[10px] text-slate-500 uppercase tracking-widest">{s.l}</div>
                    <div className="num text-sm" style={{color:s.c}}>{s.v}<span className="text-slate-500 text-[10px] ml-1">{s.u}</span></div>
                  </div>
                  <div className="flex-1">
                    <LiveWave color={s.c} amp={s.amp} base={50} speed={140} height={32}/>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>

      <Card title="Muro de sensores · live feed" subtitle="Telemetría 1 Hz · todas las líneas" accent="cyan"
        action={<div className="flex items-center gap-3 text-[10px] text-slate-500">
          <span className="flex items-center gap-1"><span className="w-2 h-2 bg-grind-400 rounded-full pulse-dot"/>OK</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 bg-warn-400 rounded-full"/>Warn</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 bg-crit-400 rounded-full"/>Crit</span>
        </div>}>
        <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-3">
          {[
            {id:'T-101', n:'Temperatura', v:(machinesArr[0]?.temp||68.4).toFixed(1), u:'°C',  c:'#F59E0B', s:'OK'},
            {id:'P-204', n:'Presión',     v:'124.7', u:'bar', c:'#3B82F6', s:'OK'},
            {id:'V-318', n:'Vibración',   v:(machinesArr[0]?.vib||0.71).toFixed(2), u:'g', c:'#EF4444', s:'WARN'},
            {id:'F-422', n:'Flujo',       v:'48.2',  u:'L/m', c:'#22D3EE', s:'OK'},
            {id:'T-512', n:'Torque',      v:'214',   u:'N·m', c:'#A855F7', s:'OK'},
            {id:'H-601', n:'Humedad',     v:'34.2',  u:'%',   c:'#3B82F6', s:'OK'},
            {id:'C-712', n:'CO₂',         v:'0.04',  u:'%',   c:'#10B981', s:'OK'},
            {id:'A-822', n:'Acústica',    v:'82.1',  u:'dB',  c:'#22D3EE', s:'OK'},
            {id:'T-902', n:'Temp Horno',  v:(machinesMap['FUR-01']?.temp||221.0).toFixed(1), u:'°C', c:'#EF4444', s:'CRIT'},
            {id:'P-913', n:'Presión H',   v:'88.4',  u:'bar', c:'#3B82F6', s:'OK'},
            {id:'V-018', n:'Vib X-Axis',  v:'0.42',  u:'g',   c:'#22D3EE', s:'OK'},
            {id:'O-128', n:'O₂',          v:'20.9',  u:'%',   c:'#10B981', s:'OK'},
          ].map(sn=>{
            const sc = sn.s==='CRIT'?'#EF4444':(sn.s==='WARN'?'#F59E0B':'#10B981');
            return (
              <div key={sn.id} className="panel rounded p-3 relative"
                   style={{borderColor: sn.s!=='OK'?`${sc}55`:'', boxShadow: sn.s==='CRIT'?'0 0 18px rgba(239,68,68,0.25)':''}}>
                <div className="flex items-center justify-between">
                  <div className="text-[10px] num text-slate-500">{sn.id}</div>
                  <span className="w-2 h-2 rounded-full" style={{background:sc, boxShadow:`0 0 6px ${sc}`}}/>
                </div>
                <div className="text-[10px] text-slate-400">{sn.n}</div>
                <div className="num text-xl mt-1" style={{color:sn.c}}>{sn.v}<span className="text-[10px] text-slate-500 ml-1">{sn.u}</span></div>
                <div className="mt-1.5"><LiveWave color={sn.c} amp={6} base={50} speed={150} height={24}/></div>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}

function PlantTopology({ selected, onSelect, machines }){
  const machineMap = Object.fromEntries((machines||[]).map(m=>[m.id,m]));
  const nodes = [
    { id:'IN',     x: 80,  y: 200, kind:'io', label:'Materia prima' },
    { id:'BTL-01', x: 200, y: 80,  kind:'m',  label:'Tanque' },
    { id:'BTL-02', x: 320, y: 120, kind:'m',  label:'Bomba' },
    { id:'BTL-03', x: 440, y: 200, kind:'m',  label:'Llenadora' },
    { id:'BTL-04', x: 560, y: 120, kind:'m',  label:'Banda' },
    { id:'BTL-05', x: 680, y: 200, kind:'m',  label:'Tapadora' },
    { id:'BTL-06', x: 800, y: 120, kind:'m',  label:'Etiquetadora' },
    { id:'FUR-01', x: 320, y: 300, kind:'m',  label:'Horno' },
    { id:'FUR-02', x: 480, y: 300, kind:'m',  label:'Ventilación' },
    { id:'FUR-03', x: 640, y: 300, kind:'m',  label:'Sensores' },
    { id:'FUR-04', x: 800, y: 300, kind:'m',  label:'PID' },
    { id:'OUT',    x: 920, y: 200, kind:'io', label:'Almacén' },
  ];
  const links = [
    ['IN','BTL-01'], ['BTL-01','BTL-02'], ['BTL-02','BTL-03'], ['BTL-03','BTL-04'], ['BTL-04','BTL-05'], ['BTL-05','BTL-06'], ['BTL-06','OUT'],
    ['IN','FUR-01'], ['FUR-01','FUR-02'], ['FUR-02','FUR-03'], ['FUR-03','FUR-04'], ['FUR-04','OUT'],
  ];
  const nodeMap = Object.fromEntries(nodes.map(n=>[n.id,n]));
  return (
    <div className="relative">
      <div className="absolute inset-0 grid-bg-sm opacity-40 rounded pointer-events-none"/>
      <svg width="100%" viewBox="0 0 960 420" className="relative">
        {links.map(([a,b],i)=>{
          const A=nodeMap[a], B=nodeMap[b];
          return <line key={`bg-${i}`} x1={A.x} y1={A.y} x2={B.x} y2={B.y} stroke="rgba(148,163,184,0.18)" strokeWidth="2"/>;
        })}
        {links.map(([a,b],i)=>{
          const A=nodeMap[a], B=nodeMap[b];
          return <line key={`flow-${i}`} x1={A.x} y1={A.y} x2={B.x} y2={B.y} stroke="#22D3EE" strokeWidth="2" className="flow-dash" opacity="0.7"/>;
        })}
        {nodes.map(n=>{
          const isSel   = n.id===selected;
          const liveM   = machineMap[n.id];
          const isCrit  = liveM?.status==='CRITICAL';
          const isWarn  = liveM?.status==='WARN';
          const color   = isCrit ? '#EF4444' : (isWarn ? '#F59E0B' : '#22D3EE');
          if(n.kind==='io'){
            return (
              <g key={n.id} onClick={()=>onSelect && onSelect(n.id)} style={{cursor:'pointer'}}>
                <rect x={n.x-44} y={n.y-22} width="88" height="44" rx="6" fill="rgba(11,16,32,0.85)" stroke="rgba(148,163,184,0.35)"/>
                <text x={n.x} y={n.y-4}  fill="#94A3B8" fontSize="10" textAnchor="middle" fontFamily="JetBrains Mono">{n.id}</text>
                <text x={n.x} y={n.y+11} fill="#E2E8F0" fontSize="10" textAnchor="middle">{n.label}</text>
              </g>
            );
          }
          return (
            <g key={n.id} onClick={()=>onSelect && onSelect(n.id)} style={{cursor:'pointer'}}>
              {(isCrit || isWarn) && <circle cx={n.x} cy={n.y} r="40" fill="none" stroke={color} strokeOpacity="0.4" className="blip"/>}
              <rect x={n.x-52} y={n.y-30} width="104" height="60" rx="8" fill="rgba(15,23,42,0.92)" stroke={isSel?'#22D3EE':color} strokeWidth={isSel?2:1.2} style={{filter:isSel?'drop-shadow(0 0 10px #22D3EE)':''}}/>
              <path d={`M ${n.x-52} ${n.y-26} v -4 h 4`} stroke={color} fill="none"/>
              <path d={`M ${n.x+52} ${n.y-26} v -4 h -4`} stroke={color} fill="none"/>
              <circle cx={n.x-40} cy={n.y-18} r="3" fill={color} style={{filter:`drop-shadow(0 0 4px ${color})`}}/>
              <text x={n.x-30} y={n.y-15} fill="#94A3B8" fontSize="9" fontFamily="JetBrains Mono">{n.id}</text>
              <text x={n.x}    y={n.y+2}  fill="#E2E8F0" fontSize="11" textAnchor="middle" fontWeight="600">{n.label}</text>
              <text x={n.x}    y={n.y+18} fill={color}   fontSize="9"  textAnchor="middle" fontFamily="JetBrains Mono">
                {liveM?.oee?.toFixed(1) || '—'} % OEE
              </text>
            </g>
          );
        })}
        <g transform="translate(20,380)">
          <text x="0" y="0" fill="#64748B" fontSize="10" fontFamily="JetBrains Mono">FLOW · MATERIAL → PRODUCTO</text>
        </g>
      </svg>
    </div>
  );
}
