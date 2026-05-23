import { Card, Stat, PageHeader, Chip, StatusDot } from '../shell'
import { Gauge, LiveWave, Heatmap } from '../charts'
import { MACHINES as MOCK_MACHINES, ALERTS as MOCK_ALERTS, EVENTS as MOCK_EVENTS, PROD_TREND } from '../data'
import { I } from '../icons'
import { useData } from '../context/DataContext'

export default function Dashboard(){
  const { machines: machinesMap, alerts: liveAlerts, events: liveEvents, metrics, production } = useData();

  const machinesArr  = Object.keys(machinesMap).length ? Object.values(machinesMap) : MOCK_MACHINES;
  const alerts       = liveAlerts.length  ? liveAlerts  : MOCK_ALERTS;
  const events       = liveEvents.length  ? liveEvents  : MOCK_EVENTS;
  const m            = metrics || {};
  const prodData     = production.length  ? production  : PROD_TREND;

  const kpis = [
    { label:'OEE Global',      value: m.oee    ? `${m.oee}`           : '87.4',       unit:'%',   accent:'cyan',  delta:'+2.1%', sub:'vs ayer' },
    { label:'Producción',      value: m.production ? `${m.production}` : '12,438',     unit:'u',   accent:'green', delta:'+4.6%', sub:'turno B' },
    { label:'Sigma Level',     value: m.sigma  ? `${m.sigma}`          : '4.61',       unit:'σ',   accent:'ai',    delta:'+0.08', sub:'capability' },
    { label:'DPMO',            value: m.dpmo   ? `${m.dpmo}`           : '1,243',      unit:'',    accent:'amber', delta:'-138',  sub:'7d avg' },
    { label:'Cp / Cpk',        value: m.cp && m.cpk ? `${m.cp} / ${m.cpk}` : '1.42 / 1.31', unit:'', accent:'cyan', delta:'+0.04', sub:'INJ-07 línea 2' },
    { label:'Energía',         value: m.energy ? `${m.energy}`         : '412',        unit:'kWh', accent:'amber', delta:'+1.8%', sub:'última hora' },
    { label:'Alertas activas', value: m.activeAlerts != null ? `${m.activeAlerts}` : '7', unit:'', accent:'red', delta:'+3', sub:'2 críticas' },
    { label:'Yield',           value: m.yield  ? `${m.yield}`          : '98.6',       unit:'%',   accent:'green', delta:'+0.3%', sub:'lote 44871' },
  ];

  return (
    <div className="p-6 space-y-5">
      <PageHeader
        eyebrow="// CONTROL CENTER"
        title="Dashboard de Producción"
        desc="Estado consolidado de operaciones, calidad, energía y mantenimiento predictivo."
        actions={
          <div className="flex items-center gap-2">
            <button className="panel rounded-md px-3 py-2 text-xs text-slate-300 hairline flex items-center gap-2 hover:text-cyan2-400">{I.filter} Filtros</button>
            <button className="panel rounded-md px-3 py-2 text-xs text-slate-300 hairline flex items-center gap-2 hover:text-cyan2-400">{I.refresh} Auto · 5s</button>
            <button className="px-3 py-2 text-xs rounded-md bg-cyan2-400/15 border border-cyan2-400/40 text-cyan2-400 hover:bg-cyan2-400/25 flex items-center gap-2">{I.download} Exportar</button>
          </div>
        }
      />

      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-3">
        {kpis.map(k=>(
          <div key={k.label} className="panel rounded-lg p-4 relative overflow-hidden corners"
               style={{color: k.accent==='red'?'#EF4444':(k.accent==='amber'?'#F59E0B':(k.accent==='green'?'#10B981':(k.accent==='ai'?'#A855F7':'#22D3EE')))}}>
            <Stat {...k}/>
          </div>
        ))}
      </div>

      {/* OEE + production trend */}
      <div className="grid grid-cols-12 gap-4">
        <Card title="OEE Global · 24h" subtitle="Disponibilidad × Rendimiento × Calidad" className="col-span-12 xl:col-span-5" accent="cyan"
          action={<div className="flex gap-1">{['24h','7d','30d'].map((p,i)=><button key={p} className={`px-2 py-1 text-[10px] rounded ${i===0?'bg-cyan2-400/15 text-cyan2-400 border border-cyan2-400/30':'text-slate-400 hover:text-white'}`}>{p}</button>)}</div>}>
          <div className="flex items-center gap-6">
            <Gauge value={parseFloat(m.oee) || 87.4} label="OEE" color="#22D3EE" size={170} thickness={12}/>
            <div className="flex-1 space-y-3">
              {[
                {l:'Disponibilidad', v:94.1, c:'#22D3EE'},
                {l:'Rendimiento',    v:92.8, c:'#3B82F6'},
                {l:'Calidad',        v:99.6, c:'#10B981'},
              ].map(b=>(
                <div key={b.l}>
                  <div className="flex justify-between text-[11px] mb-1"><span className="text-slate-300">{b.l}</span><span className="num" style={{color:b.c}}>{b.v}%</span></div>
                  <div className="h-1.5 rounded bg-slate-700/40 overflow-hidden">
                    <div className="h-full rounded" style={{width:`${b.v}%`, background:`linear-gradient(90deg, ${b.c}, ${b.c}aa)`, boxShadow:`0 0 8px ${b.c}`}}/>
                  </div>
                </div>
              ))}
              <div className="grid grid-cols-3 gap-2 pt-2">
                {[{l:'MTBF',v:'214h'},{l:'MTTR',v:'18m'},{l:'Takt',v:'42s'}].map(s=>(
                  <div key={s.l} className="panel rounded p-2"><div className="num text-base text-white">{s.v}</div><div className="text-[10px] text-slate-500 uppercase tracking-widest">{s.l}</div></div>
                ))}
              </div>
            </div>
          </div>
        </Card>

        <Card title="Producción · Últimas 24h" subtitle="Unidades / hora — todas las líneas" className="col-span-12 xl:col-span-7" accent="cyan">
          <div className="flex items-end gap-6 mb-3">
            <Stat label="Total turno" value="12,438" unit="u" big accent="cyan"/>
            <Stat label="Tasa actual" value={m.production ? `${m.production}` : '612'} unit="u/h" accent="green" delta="+4.6%"/>
            <Stat label="Setpoint" value="600" unit="u/h" accent="slate"/>
            <div className="ml-auto flex gap-3 text-[10px] text-slate-400">
              <span className="flex items-center gap-1"><span className="w-2 h-2 bg-cyan2-400 rounded-sm"/>Real</span>
              <span className="flex items-center gap-1"><span className="w-2 h-0.5 bg-ai-400"/>Forecast IA</span>
              <span className="flex items-center gap-1"><span className="w-2 h-0.5 bg-slate-500 border-dashed"/>Target</span>
            </div>
          </div>
          <ProductionTrend data={prodData}/>
        </Card>
      </div>

      {/* Machine grid + alerts + IA */}
      <div className="grid grid-cols-12 gap-4">
        <Card title="Estado de máquinas" subtitle="8 activos · línea Q1-Q4" className="col-span-12 xl:col-span-7" accent="cyan"
          action={<Chip color="slate">{machinesArr.length} assets</Chip>}>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {machinesArr.map(m=>(<MachineMini key={m.id} m={m}/>))}
          </div>
        </Card>

        <div className="col-span-12 xl:col-span-5 space-y-4">
          <Card title="Copiloto IA · Insights" subtitle="Recomendaciones automáticas en tiempo real" accent="ai" glow="shadow-glowAi">
            <div className="space-y-2">
              {[
                {tag:'PREDICCIÓN', txt:'Falla probable en OVN-09 en ~3.2h por temperatura sostenida.', conf:'92%', t:'hace 14s', c:'red'},
                {tag:'OPTIMIZAR',  txt:'Reducir setpoint INJ-07 a 198°C ahorra 6.4% energía sin afectar Cp.', conf:'87%', t:'hace 2m', c:'cyan'},
                {tag:'CALIDAD',    txt:'Detecté drift en caliper de WLD-02. Recalibrar en próximo turno.', conf:'81%', t:'hace 11m', c:'amber'},
              ].map((x,i)=>(
                <div key={i} className="panel rounded-md p-3 flex items-start gap-3 hover:border-ai-400/30 transition">
                  <div className={`shrink-0 w-8 h-8 rounded grid place-items-center`}
                       style={{color: x.c==='red'?'#EF4444':(x.c==='amber'?'#F59E0B':'#22D3EE'), background:`rgba(${x.c==='red'?'239,68,68':(x.c==='amber'?'245,158,11':'34,211,238')},0.12)`}}>{I.bot}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Chip color={x.c==='red'?'red':(x.c==='amber'?'amber':'cyan')}>{x.tag}</Chip>
                      <span className="text-[10px] text-slate-500 num">conf {x.conf}</span>
                      <span className="text-[10px] text-slate-500 ml-auto">{x.t}</span>
                    </div>
                    <div className="text-sm text-slate-200">{x.txt}</div>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <Card title="Línea de eventos" accent="cyan">
            <div className="relative pl-4">
              <div className="absolute left-1 top-0 bottom-0 w-px bg-slate-700"/>
              {events.slice(0,7).map((e,i)=>{
                const color = { critical:'#EF4444', warn:'#F59E0B', ok:'#10B981', info:'#22D3EE', ai:'#A855F7'}[e.kind] || '#22D3EE';
                return (
                  <div key={e.id || i} className="relative pl-4 py-1.5">
                    <span className="absolute -left-[5px] top-2.5 w-2.5 h-2.5 rounded-full" style={{background:color, boxShadow:`0 0 8px ${color}`}}/>
                    <div className="flex items-center gap-2">
                      <span className="num text-[11px] text-slate-500">{e.t || new Date(e.ts).toLocaleTimeString()}</span>
                      <span className="text-xs text-slate-200">{e.label}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        </div>
      </div>

      {/* Bottom row */}
      <div className="grid grid-cols-12 gap-4">
        <Card title="Heatmap · defectos por hora × día" subtitle="Semana actual · 168 ventanas" className="col-span-12 xl:col-span-6" accent="cyan">
          <Heatmap cols={24} rows={7} seed={9}/>
          <div className="flex items-center justify-between mt-3 text-[10px] text-slate-500 num">
            <div>00h ────────────────────────── 23h</div>
            <div className="flex items-center gap-2">
              <span>menos</span>
              <div className="flex gap-px">
                {[0.1,0.25,0.45,0.65,0.85].map((v,i)=><div key={i} className="w-3 h-2.5 rounded-sm" style={{background:`rgba(34,211,238,${v})`}}/>)}
              </div>
              <span>más</span>
            </div>
          </div>
        </Card>

        <Card title="Consumo energético · kWh" subtitle="6h · líneas activas" className="col-span-12 xl:col-span-3" accent="amber">
          <div className="num text-3xl text-warn-400" style={{textShadow:'0 0 14px #F59E0B55'}}>{m.energy || 412} <span className="text-sm text-slate-400">kWh</span></div>
          <div className="text-[11px] text-slate-500">Pico: 488 · base 280</div>
          <div className="mt-3"><LiveWave color="#F59E0B" amp={14} base={50} speed={150} height={70}/></div>
          <div className="grid grid-cols-4 gap-2 mt-3 text-[10px]">
            {[{l:'L1',v:108},{l:'L2',v:131},{l:'L3',v:96},{l:'L4',v:77}].map(x=>(
              <div key={x.l} className="panel rounded p-2 text-center">
                <div className="num text-sm text-white">{x.v}</div>
                <div className="text-slate-500">{x.l}</div>
              </div>
            ))}
          </div>
        </Card>

        <Card title="Alertas activas" subtitle="Prioridad descendente" className="col-span-12 xl:col-span-3" accent="red">
          <div className="space-y-2">
            {alerts.filter(a=>a.status!=='closed').slice(0,4).map(a=>(
              <div key={a.id} className="panel rounded-md p-2.5 flex items-start gap-2">
                <span className={`w-2 h-2 rounded-full mt-1.5 ${a.sev==='CRITICAL'?'bg-crit-400 pulse-dot':(a.sev==='HIGH'?'bg-warn-400':'bg-cyan2-400')}`} style={{boxShadow: a.sev==='CRITICAL'?'0 0 8px #EF4444':''}}/>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2"><span className="text-[10px] num text-slate-500">{a.id}</span><Chip color={a.sev==='CRITICAL'?'red':(a.sev==='HIGH'?'amber':'cyan')}>{a.sev}</Chip></div>
                  <div className="text-xs text-white truncate">{a.title}</div>
                  <div className="text-[10px] text-slate-500 num">{a.machine} · {a.time}</div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

function MachineMini({ m }){
  const stMap = {
    RUNNING:  {c:'#10B981', txt:'Operando'},
    WARN:     {c:'#F59E0B', txt:'Atención'},
    CRITICAL: {c:'#EF4444', txt:'Crítico'},
    IDLE:     {c:'#64748B', txt:'En espera'},
  };
  const s = stMap[m.status] || stMap.IDLE;
  return (
    <div className="panel rounded-md p-3 relative overflow-hidden hover:border-cyan2-400/30 transition cursor-pointer group">
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
        <div><div className="text-slate-500">Load</div><div className="num text-slate-200">{m.load||0}%</div></div>
      </div>
    </div>
  );
}

function ProductionTrend({ data }){
  const values   = data.map(p=>p.value);
  if (!values.length) return null;
  const forecast = values.map((v,i)=> i<18? null : v + 30 + (i-18)*5);
  const w=720, h=180, padL=28, padR=10, padT=8, padB=22;
  const min = Math.min(...values)-50, max = Math.max(...values)+120;
  const iW  = w-padL-padR, iH = h-padT-padB;
  const sx=(i)=> padL + (i/(values.length-1))*iW;
  const sy=(v)=> padT + (1-(v-min)/(max-min))*iH;
  const dPath  = values.map((v,i)=>`${i?'L':'M'}${sx(i).toFixed(1)} ${sy(v).toFixed(1)}`).join(' ');
  const fcPath = forecast.map((v,i)=> v==null?null:`${i===18?'M':'L'}${sx(i).toFixed(1)} ${sy(v).toFixed(1)}`).filter(Boolean).join(' ');
  return (
    <svg width="100%" viewBox={`0 0 ${w} ${h}`}>
      <defs>
        <linearGradient id="pt-fill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#22D3EE" stopOpacity=".4"/>
          <stop offset="1" stopColor="#22D3EE" stopOpacity="0"/>
        </linearGradient>
      </defs>
      {[0,.25,.5,.75,1].map((p,i)=><line key={i} x1={padL} x2={w-padR} y1={padT+p*iH} y2={padT+p*iH} stroke="rgba(148,163,184,0.07)"/>)}
      <line x1={padL} x2={w-padR} y1={sy(600)} y2={sy(600)} stroke="rgba(148,163,184,0.35)" strokeDasharray="4 6"/>
      <path d={`${dPath} L ${sx(values.length-1)} ${h-padB} L ${sx(0)} ${h-padB} Z`} fill="url(#pt-fill)"/>
      <path d={dPath} fill="none" stroke="#22D3EE" strokeWidth="2" style={{filter:'drop-shadow(0 0 6px #22D3EEaa)'}}/>
      {fcPath && <path d={fcPath} fill="none" stroke="#A855F7" strokeWidth="1.8" strokeDasharray="4 4"/>}
      {values.map((v,i)=> i%4===0 && <circle key={i} cx={sx(i)} cy={sy(v)} r="2" fill="#22D3EE"/>)}
      {values.map((_,i)=> i%4===0 && <text key={i} x={sx(i)} y={h-4} fill="#64748B" fontSize="9" textAnchor="middle" fontFamily="JetBrains Mono">{i}h</text>)}
    </svg>
  );
}
