import { useState } from 'react'
import { Card, Chip, Stat, PageHeader } from '../shell'
import { SparkLine } from '../charts'
import { ALERTS as MOCK_ALERTS, makeSeries } from '../data'
import { I } from '../icons'
import { useData } from '../context/DataContext'

export default function AIAlertsScreen() {
  const { alerts: liveAlerts, actions } = useData();
  const allAlerts = liveAlerts.length ? liveAlerts : MOCK_ALERTS;
  const active    = allAlerts.filter(a => a.status !== 'closed');

  const [filter,   setFilter]   = useState('ALL');
  const [selected, setSelected] = useState(active[0]?.id);

  const visible    = filter === 'ALL' ? active : active.filter(a => a.sev === filter);
  const sel        = active.find(a => a.id === selected) || active[0];
  const critCount  = active.filter(a => a.sev === 'CRITICAL').length;
  const highCount  = active.filter(a => a.sev === 'HIGH').length;
  const medCount   = active.filter(a => a.sev === 'MEDIUM').length;

  const handleAck   = async (id) => { await actions.acknowledgeAlert(id).catch(() => {}); };
  const handleClose = async (id) => {
    await actions.closeAlert(id).catch(() => {});
    const remaining = active.filter(a => a.id !== id);
    if (remaining.length) setSelected(remaining[0].id);
  };

  return (
    <div className="p-6 space-y-5">
      <PageHeader
        eyebrow="// IA + CENTRO DE ALERTAS"
        title="IA + Alertas"
        desc="Detección automática, escalado y recomendaciones IA para anomalías de proceso, calidad y mantenimiento."
        actions={
          <div className="flex items-center gap-2">
            {critCount > 0 && <Chip color="red"><span className="pulse-dot w-1.5 h-1.5 rounded-full bg-crit-400 mr-1"/>{critCount} críticas</Chip>}
            {highCount > 0 && <Chip color="amber">{highCount} altas</Chip>}
            {medCount  > 0 && <Chip color="cyan">{medCount} medias</Chip>}
            <button onClick={() => actions.markAllAlertsRead().catch(() => {})}
                    className="panel rounded-md px-3 py-2 text-xs text-slate-300 hairline flex items-center gap-1">
              {I.check} Marcar todo
            </button>
          </div>
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          {l:'Alertas activas',    v:String(active.length), d:'+3 hoy', c:'cyan'},
          {l:'MTTR promedio',      v:'18m',   d:'-3m',    c:'green'},
          {l:'Falsos positivos',   v:'4.2%',  d:'-1.1%',  c:'green'},
          {l:'Tiempo a respuesta', v:'2.4m',  d:'+0.2m',  c:'amber'},
        ].map(k => (
          <div key={k.l} className="panel rounded p-4 corners" style={{color: k.c==='green'?'#10B981':(k.c==='amber'?'#F59E0B':'#22D3EE')}}>
            <Stat label={k.l} value={k.v} delta={k.d} accent={k.c}/>
          </div>
        ))}
      </div>

      {/* Alert list + Detail */}
      <div className="grid grid-cols-12 gap-4">
        <Card title="Bandeja" subtitle={`${visible.length} alertas`}
              className="col-span-12 xl:col-span-5" accent="cyan"
              action={
                <div className="flex gap-1">
                  {['ALL','CRITICAL','HIGH','MEDIUM','LOW'].map(f => (
                    <button key={f} onClick={() => setFilter(f)}
                            className={`px-2 py-1 text-[10px] rounded ${filter===f?'bg-cyan2-400/15 text-cyan2-400 border border-cyan2-400/30':'text-slate-400 hover:text-white'}`}>
                      {f}
                    </button>
                  ))}
                </div>
              }>
          <div className="space-y-2 max-h-[640px] overflow-y-auto pr-1">
            {visible.map(a => {
              const sc    = a.sev==='CRITICAL'?'#EF4444':(a.sev==='HIGH'?'#F59E0B':(a.sev==='MEDIUM'?'#22D3EE':'#64748B'));
              const isSel = a.id === selected;
              return (
                <div key={a.id} onClick={() => setSelected(a.id)}
                     className={`panel rounded-md p-3 cursor-pointer transition ${isSel?'border border-cyan2-400/30':'hover:bg-white/[0.02]'}`}
                     style={isSel?{boxShadow:`0 0 16px ${sc}25`}:{}}>
                  <div className="flex items-start gap-3">
                    <div className="w-1 self-stretch rounded" style={{background:sc, boxShadow:`0 0 6px ${sc}`}}/>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <Chip color={a.sev==='CRITICAL'?'red':(a.sev==='HIGH'?'amber':(a.sev==='MEDIUM'?'cyan':'slate'))}>{a.sev}</Chip>
                        <span className="num text-[10px] text-slate-500">{a.id} · {a.machine}</span>
                        <span className="num text-[10px] text-slate-500 ml-auto">{a.time}</span>
                      </div>
                      <div className="text-sm text-white font-medium mt-1">{a.title}</div>
                      {a.detail && <div className="text-[11px] text-slate-400 mt-0.5">{a.detail}</div>}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        {sel && (
          <Card title={`Alerta · ${sel.id}`} subtitle={sel.machine}
                className="col-span-12 xl:col-span-7"
                accent={sel.sev==='CRITICAL'?'red':(sel.sev==='HIGH'?'amber':'cyan')}
                glow={sel.sev==='CRITICAL'?'shadow-glowCrit':''}>
            <div className="flex items-start gap-4 pb-4 hairline-bottom">
              <div className="w-12 h-12 rounded grid place-items-center"
                   style={{color: sel.sev==='CRITICAL'?'#EF4444':'#F59E0B', background:`${sel.sev==='CRITICAL'?'rgba(239,68,68,0.12)':'rgba(245,158,11,0.12)'}`, boxShadow:`inset 0 0 0 1px ${sel.sev==='CRITICAL'?'rgba(239,68,68,0.4)':'rgba(245,158,11,0.4)'}`}}>
                {I.alert}
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <Chip color={sel.sev==='CRITICAL'?'red':(sel.sev==='HIGH'?'amber':'cyan')}>{sel.sev}</Chip>
                  <span className="num text-[10px] text-slate-500">disparada {sel.time}</span>
                </div>
                <div className="font-display text-lg font-semibold text-white mt-1">{sel.title}</div>
                {sel.detail && <div className="text-sm text-slate-400">{sel.detail}</div>}
              </div>
              <div className="flex flex-col gap-2 items-end">
                <button onClick={() => handleAck(sel.id)} className="px-3 py-1.5 text-xs rounded bg-cyan2-400/15 border border-cyan2-400/40 text-cyan2-400 flex items-center gap-1">{I.check} Reconocer</button>
                <button className="px-3 py-1.5 text-xs rounded panel hairline text-slate-300">Escalar</button>
                <button onClick={() => handleClose(sel.id)} className="px-3 py-1.5 text-xs rounded panel hairline text-slate-300">Cerrar</button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 mt-4">
              <div className="panel rounded p-3">
                <div className="text-[10px] uppercase tracking-widest text-slate-500 mb-2">Telemetría afectada · ±30min</div>
                <SparkLine data={makeSeries(40, 50, 6, 0.6)} h={90} stroke="#EF4444" fill="rgba(239,68,68,0.18)"/>
                <div className="text-[10px] text-slate-500 num mt-1">temperatura · °C</div>
              </div>
              <div className="panel rounded p-3">
                <div className="text-[10px] uppercase tracking-widest text-slate-500 mb-2">Variables correlacionadas</div>
                <div className="space-y-1.5">
                  {[
                    {l:'Vibración', c:0.78, col:'#F59E0B'},
                    {l:'Presión',   c:0.62, col:'#3B82F6'},
                    {l:'Humedad',   c:0.41, col:'#22D3EE'},
                    {l:'Voltaje',  c:-0.32, col:'#A855F7'},
                  ].map(x => (
                    <div key={x.l}>
                      <div className="flex justify-between text-[11px]">
                        <span className="text-slate-300">{x.l}</span>
                        <span className="num" style={{color:x.col}}>r={x.c.toFixed(2)}</span>
                      </div>
                      <div className="h-1 rounded bg-slate-700/40 overflow-hidden">
                        <div className="h-full" style={{width:`${Math.abs(x.c)*100}%`, background:x.col}}/>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-4 panel-strong rounded p-4 border" style={{borderColor:'rgba(168,85,247,0.35)', boxShadow:'0 0 24px rgba(168,85,247,0.15)'}}>
              <div className="flex items-center gap-2">
                <span className="text-ai-400">{I.brain}</span>
                <span className="text-[10px] tracking-widest text-ai-400 uppercase">RECOMENDACIÓN IA · confianza 92%</span>
              </div>
              <div className="text-sm text-white mt-2">{sel.ai || 'Analizar telemetría y ajustar setpoints del proceso.'}</div>
              <div className="grid grid-cols-3 gap-2 mt-3 text-[11px]">
                <div className="panel rounded p-2"><div className="text-slate-500">Acción sugerida</div><div className="text-white">Reducir setpoint · 230°C</div></div>
                <div className="panel rounded p-2"><div className="text-slate-500">Costo evitable</div><div className="num text-grind-400">$18,400</div></div>
                <div className="panel rounded p-2"><div className="text-slate-500">Tiempo estimado</div><div className="num text-white">8 min</div></div>
              </div>
              <div className="flex gap-2 mt-3">
                <button className="px-3 py-1.5 text-xs rounded text-[#06080F] font-semibold"
                        style={{background:'linear-gradient(90deg,#A855F7,#22D3EE)', boxShadow:'0 0 12px rgba(168,85,247,0.5)'}}>
                  Aplicar automático
                </button>
                <button className="px-3 py-1.5 text-xs rounded panel hairline text-slate-300">Asignar técnico</button>
                <button className="px-3 py-1.5 text-xs rounded panel hairline text-slate-300">Crear PM</button>
              </div>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
