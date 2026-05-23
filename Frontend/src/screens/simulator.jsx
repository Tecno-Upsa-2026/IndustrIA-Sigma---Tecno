import { useState, useEffect } from 'react'
import { Card, PageHeader } from '../shell'
import { Donut } from '../charts'
import { I } from '../icons'
import { useData } from '../context/DataContext'

export default function SimulatorScreen(){
  const { simulator, actions } = useData();
  const [localParams, setLocalParams] = useState({
    temp:204, speed:78, pressure:124, vibration:0.42, torque:214,
    ...simulator.params
  });
  const [tick, setTick] = useState(0);

  const running = simulator.status === 'running';

  useEffect(()=>{
    if(!running) return;
    const id = setInterval(()=> setTick(t=>t+1), 800);
    return ()=> clearInterval(id);
  },[running]);

  // Live results from backend when running, else compute locally
  const r = (running && simulator.results && Object.keys(simulator.results).length)
    ? simulator.results
    : computeLocal(localParams);

  const handleParamChange = (key, val) => {
    const next = { ...localParams, [key]: val };
    setLocalParams(next);
    if (running) actions.updateSimParams(next).catch(()=>{});
  };

  const handleToggle = async () => {
    if (running) await actions.stopSimulator().catch(()=>{});
    else         await actions.runSimulator().catch(()=>{});
  };

  const handleReset = async () => {
    await actions.resetSimulator().catch(()=>{});
    setLocalParams({ temp:204, speed:78, pressure:124, vibration:0.42, torque:214 });
  };

  const scenarios = simulator.scenarios || [];

  return (
    <div className="p-6 space-y-5">
      <PageHeader
        eyebrow="// DIGITAL TWIN · WHAT-IF"
        title="Simulador Industrial"
        desc="Modifica parámetros del gemelo digital y observa el impacto en calidad, capability y producción."
        actions={
          <div className="flex items-center gap-2">
            <button onClick={handleToggle} className="panel rounded-md px-3 py-2 text-xs text-slate-300 hairline flex items-center gap-2 hover:text-cyan2-400">
              {running?I.pause:I.play} {running?'Pausar':'Reanudar'}
            </button>
            <button onClick={handleReset} className="panel rounded-md px-3 py-2 text-xs text-slate-300 hairline flex items-center gap-2 hover:text-cyan2-400">{I.refresh} Reset</button>
            <button className="px-3 py-2 text-xs rounded-md bg-cyan2-400/15 border border-cyan2-400/40 text-cyan2-400 flex items-center gap-2">{I.bolt} Aplicar a INJ-07</button>
          </div>
        }
      />

      <div className="grid grid-cols-12 gap-4">
        <Card title="Variables de proceso" subtitle="Setpoints · INJ-07 Injection Line 2" className="col-span-12 xl:col-span-4" accent="cyan">
          <div className="space-y-4">
            <Slider label="Temperatura" unit="°C"  min={150} max={260} step={1}    ideal={200} value={localParams.temp}      onChange={v=>handleParamChange('temp',v)}/>
            <Slider label="Velocidad"   unit="%"   min={0}   max={100} step={1}    ideal={70}  value={localParams.speed}     onChange={v=>handleParamChange('speed',v)}/>
            <Slider label="Presión"     unit="bar" min={80}  max={180} step={1}    ideal={120} value={localParams.pressure}  onChange={v=>handleParamChange('pressure',v)}/>
            <Slider label="Vibración"   unit="g"   min={0.1} max={1.2} step={0.01} ideal={0.4} value={localParams.vibration} onChange={v=>handleParamChange('vibration',v)}/>
            <Slider label="Torque"      unit="N·m" min={120} max={320} step={1}    ideal={210} value={localParams.torque}    onChange={v=>handleParamChange('torque',v)}/>
          </div>
          <div className="mt-4 panel rounded p-3 flex items-start gap-2 border border-ai-400/30">
            <span className="text-ai-400 mt-0.5">{I.bot}</span>
            <div className="text-xs text-slate-300">
              <div className="text-[10px] tracking-[0.25em] uppercase text-ai-400 mb-1">SUGERENCIA IA</div>
              {Math.abs((localParams.temp-200)/10)>0.5 ? 'Reducir temperatura a 200°C para minimizar defectos.'
                : (Math.abs((localParams.vibration-0.4)*5)>0.4 ? 'Vibración alta: inspeccionar rodamientos.'
                  : 'Parámetros dentro de zona óptima ±2σ.')}
            </div>
          </div>
        </Card>

        <Card title="Gemelo digital · INJ-07" subtitle={`tick ${tick} · ${running?'RUNNING':'PAUSED'}`} className="col-span-12 xl:col-span-5" accent="cyan">
          <DigitalTwin params={localParams} defectRate={r.defect||0} tick={tick}/>
        </Card>

        <div className="col-span-12 xl:col-span-3 space-y-4">
          <Card title="Impacto" subtitle="Predicción del modelo"
                accent={(r.defect||0)>4?'red':((r.defect||0)>2.5?'amber':'green')}
                glow={(r.defect||0)>4?'shadow-glowCrit':''}>
            <div className="space-y-3">
              <ImpactRow label="Cp"         value={(r.cp||0).toFixed(2)}                  delta={(r.cp||0)-1.42}           target={1.33}/>
              <ImpactRow label="Cpk"        value={(r.cpk||0).toFixed(2)}                 delta={(r.cpk||0)-1.31}          target={1.33}/>
              <ImpactRow label="Sigma σ"    value={(r.sigma||0).toFixed(2)}               delta={(r.sigma||0)-4.61}        target={4.5}/>
              <ImpactRow label="Defectos"   value={(r.defect||0).toFixed(2)+'%'}          delta={(r.defect||0)-1.4}        target={1.5}  invert/>
              <ImpactRow label="Yield"      value={(r.yield||0).toFixed(1)+'%'}           delta={(r.yield||0)-98.6}        target={98}/>
              <ImpactRow label="Producción" value={(r.production||0)+' u/h'}              delta={(r.production||0)-612}    target={600}/>
            </div>
          </Card>
          <Card title="Confianza modelo" accent="ai">
            <div className="flex items-center gap-3">
              <Donut value={87.3} label="CONF" color="#A855F7" size={84} thickness={9}/>
              <div className="text-[11px] text-slate-400 leading-relaxed">
                Modelo <span className="text-ai-400 num">XGBoost-v2.41</span> entrenado con <span className="num">1.2M</span> registros. Última inferencia: hace 320ms.
              </div>
            </div>
          </Card>
        </div>
      </div>

      <Card title="Histórico de simulaciones" subtitle="Escenarios guardados" accent="cyan">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-[10px] tracking-widest uppercase text-slate-500">
              <tr className="hairline-bottom">
                <th className="text-left py-2">ID</th><th className="text-left">Escenario</th><th className="text-left">Cp</th>
                <th className="text-left">Defectos</th><th className="text-left">Yield</th><th className="text-left">Producción</th>
                <th className="text-left">Ahorro</th><th></th>
              </tr>
            </thead>
            <tbody>
              {(scenarios.length ? scenarios : FALLBACK_SCENARIOS).map(r=>(
                <tr key={r.id} className="hairline-bottom hover:bg-white/[0.02]">
                  <td className="py-2 num text-cyan2-400">{r.id}</td>
                  <td className="text-slate-200">{r.s || r.name}</td>
                  <td className="num text-slate-200">{r.cp}</td>
                  <td className={`num ${r.bad?'text-crit-400':(r.good?'text-grind-400':'text-slate-200')}`}>{r.d || r.defect}</td>
                  <td className="num text-slate-200">{r.y || r.yield}</td>
                  <td className="num text-slate-200">{r.p || r.production}</td>
                  <td className={`num ${r.bad?'text-crit-400':(r.good?'text-grind-400':'text-slate-200')}`}>{r.sv || r.savings || '—'}</td>
                  <td>
                    {r.good && <span className="chip border bg-grind-400/10 text-grind-400 border-grind-400/30">APLICADO</span>}
                    {r.bad  && <span className="chip border bg-crit-400/10 text-crit-400 border-crit-400/30">DESCARTADO</span>}
                    {!r.good && !r.bad && <span className="chip border bg-slate-400/10 text-slate-300 border-slate-400/20">REVISIÓN</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function computeLocal(params){
  const tDelta = (params.temp-200)/10;
  const vDelta = (params.vibration-0.4)*5;
  const sDelta = (params.speed-70)/12;
  const defect = Math.max(0.2, 1.4 + tDelta*tDelta*0.15 + vDelta*vDelta*0.4 + sDelta*sDelta*0.18);
  const yield_ = Math.max(80, 99.6 - defect*1.4);
  const cp     = Math.max(0.5, 1.42 - Math.abs(tDelta)*0.05 - Math.abs(vDelta)*0.12);
  return {
    defect, yield: yield_, cp, cpk: cp - 0.11,
    sigma: 3 + (cp-1)*2,
    production: Math.round(580 + params.speed*1.4 - defect*8),
  };
}

const FALLBACK_SCENARIOS = [
  {id:'SIM-0241', s:'Baseline turno B',       cp:1.42, d:'1.40%', y:'98.6%', p:'612', sv:'—',        good:false, bad:false},
  {id:'SIM-0242', s:'Temp -8°C / Speed +5%', cp:1.51, d:'0.92%', y:'99.1%', p:'628', sv:'+$1.2K/d', good:true,  bad:false},
  {id:'SIM-0243', s:'Reducir presión 8 bar',  cp:1.46, d:'1.18%', y:'98.8%', p:'608', sv:'+$0.4K/d', good:false, bad:false},
  {id:'SIM-0244', s:'Modo eco · -10% speed',  cp:1.55, d:'0.84%', y:'99.2%', p:'576', sv:'+$0.9K/d', good:false, bad:false},
  {id:'SIM-0245', s:'Stress test +12% vib',   cp:0.94, d:'5.2%',  y:'94.1%', p:'581', sv:'-$3.1K/d', good:false, bad:true},
];

function Slider({ label, unit, min, max, step, value, onChange, ideal }){
  const pct      = ((value-min)/(max-min))*100;
  const idealPct = ((ideal-min)/(max-min))*100;
  const off      = Math.abs(value-ideal)/(max-min);
  const color    = off>0.18 ? '#EF4444' : (off>0.08 ? '#F59E0B' : '#22D3EE');
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-[11px] uppercase tracking-widest text-slate-400">{label}</span>
        <span className="num text-sm font-semibold" style={{color}}>
          {typeof value==='number'? value.toFixed(unit==='g'?2:0): value}
          <span className="text-slate-500 text-[10px] ml-1">{unit}</span>
        </span>
      </div>
      <div className="relative">
        <input type="range" min={min} max={max} step={step} value={value}
               onChange={e=>onChange(parseFloat(e.target.value))} className="w-full"/>
        <div className="absolute top-[-2px] w-0.5 h-2 bg-grind-400" style={{left:`${idealPct}%`, boxShadow:'0 0 4px #10B981'}}/>
      </div>
      <div className="flex justify-between text-[9px] text-slate-500 num mt-0.5">
        <span>{min}</span><span className="text-grind-400">●target {ideal}{unit}</span><span>{max}</span>
      </div>
    </div>
  );
}

function ImpactRow({ label, value, delta, target, invert }){
  const good  = invert ? delta<0 : delta>=0;
  const color = good ? '#10B981' : '#EF4444';
  return (
    <div className="flex items-center justify-between panel rounded p-2">
      <div>
        <div className="text-[10px] uppercase tracking-widest text-slate-500">{label}</div>
        <div className="num text-base text-white">{value}</div>
      </div>
      <div className="text-right">
        <div className="num text-xs" style={{color}}>{delta>=0?'+':''}{typeof delta==='number'? delta.toFixed(2):delta}</div>
        <div className="text-[9px] text-slate-500">vs {target}</div>
      </div>
    </div>
  );
}

function DigitalTwin({ params, defectRate, tick }){
  const t = tick*5;
  const stations = [
    { x:80,  y:100, label:'INTAKE', color:'#22D3EE' },
    { x:220, y:100, label:'INJECT', color: params.temp>235?'#EF4444':(params.temp>220?'#F59E0B':'#22D3EE') },
    { x:360, y:100, label:'PRESS',  color: params.pressure>150?'#F59E0B':'#22D3EE' },
    { x:500, y:100, label:'CURE',   color:'#3B82F6' },
    { x:640, y:100, label:'PACK',   color:'#A855F7' },
  ];
  const units = Array.from({length:8}).map((_,i)=>({
    pos: ((i*80 + t) % 600),
    bad: ((i*7+tick)%17)<defectRate
  }));
  return (
    <div className="relative">
      <div className="absolute inset-0 grid-bg-sm opacity-30 rounded"/>
      <svg width="100%" viewBox="0 0 720 260" className="relative">
        <line x1="40" y1="100" x2="700" y2="100" stroke="rgba(148,163,184,0.2)" strokeWidth="6"/>
        <line x1="40" y1="100" x2="700" y2="100" stroke="#22D3EE" strokeWidth="6" strokeDasharray="10 18" opacity="0.6" className="flow-dash"/>
        {stations.map((s,i)=>(
          <g key={i}>
            <rect x={s.x-36} y={s.y-32} width="72" height="64" rx="6" fill="rgba(15,23,42,0.9)" stroke={s.color} strokeWidth="1.2"/>
            <rect x={s.x-32} y={s.y-28} width="64" height="6" fill={s.color} opacity="0.25"/>
            <circle cx={s.x-26} cy={s.y-20} r="2" fill={s.color} style={{filter:`drop-shadow(0 0 4px ${s.color})`}}/>
            <text x={s.x} y={s.y-4}  fill="#E2E8F0" fontSize="10" textAnchor="middle" fontWeight="600">{s.label}</text>
            <text x={s.x} y={s.y+12} fill={s.color} fontSize="9"  textAnchor="middle" fontFamily="JetBrains Mono">
              {s.label==='INJECT'?params.temp+'°C':s.label==='PRESS'?params.pressure+'bar':s.label==='CURE'?'214°C':'OK'}
            </text>
            <text x={s.x} y={s.y+24} fill="#64748B" fontSize="8"  textAnchor="middle" fontFamily="JetBrains Mono">S-0{i+1}</text>
          </g>
        ))}
        {units.map((u,i)=>(
          <g key={i}>
            <circle cx={40+u.pos} cy={100} r="6" fill={u.bad?'#EF4444':'#22D3EE'} opacity="0.95" style={{filter:`drop-shadow(0 0 6px ${u.bad?'#EF4444':'#22D3EE'})`}}/>
            <circle cx={40+u.pos} cy={100} r="6" fill="none" stroke={u.bad?'#EF4444':'#22D3EE'} opacity="0.3"/>
          </g>
        ))}
        <g transform="translate(40,170)">
          <SensorTag x={0}   label="TEMP"  v={params.temp+'°C'}                 c={params.temp>235?'#EF4444':'#F59E0B'}/>
          <SensorTag x={140} label="SPEED" v={params.speed+'%'}                 c="#22D3EE"/>
          <SensorTag x={280} label="PRES"  v={params.pressure+'bar'}            c="#3B82F6"/>
          <SensorTag x={420} label="VIB"   v={params.vibration.toFixed(2)+'g'}  c={params.vibration>0.7?'#EF4444':'#22D3EE'}/>
          <SensorTag x={560} label="TORQ"  v={params.torque+'Nm'}               c="#A855F7"/>
        </g>
        <g transform="translate(560,30)">
          <text x="0" y="0"  fill="#64748B" fontSize="9" fontFamily="JetBrains Mono">DEFECTOS PREDICHOS</text>
          <text x="0" y="22" fill={defectRate>4?'#EF4444':(defectRate>2.5?'#F59E0B':'#10B981')} fontSize="22" fontFamily="JetBrains Mono" fontWeight="600">{defectRate.toFixed(2)}%</text>
        </g>
      </svg>
    </div>
  );
}

function SensorTag({x,label,v,c}){
  return (
    <g transform={`translate(${x},0)`}>
      <rect x="0" y="0" width="120" height="36" rx="4" fill="rgba(11,16,32,0.9)" stroke="rgba(148,163,184,0.15)"/>
      <text x="8" y="14" fill="#64748B" fontSize="8"  fontFamily="JetBrains Mono">{label}</text>
      <text x="8" y="30" fill={c}       fontSize="14" fontFamily="JetBrains Mono" fontWeight="600">{v}</text>
      <circle cx="110" cy="10" r="2" fill={c} style={{filter:`drop-shadow(0 0 3px ${c})`}}/>
    </g>
  );
}
