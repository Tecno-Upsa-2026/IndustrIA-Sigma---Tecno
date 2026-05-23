import { useState, useEffect, useRef } from 'react'
import { Card, Chip, PageHeader } from '../shell'
import { I } from '../icons'
import { useData } from '../context/DataContext'

export default function AIScreen(){
  const { aiInsights, aiModels, conversations, actions } = useData();
  const [convId,   setConvId]   = useState(null);
  const [messages, setMessages] = useState([
    { role:'system', t:'Copiloto IA inicializado · contexto: planta MX-01, último turno B' },
    { role:'ai',     t:'Hola Luis. Detecté 3 anomalías relevantes en las últimas 2h.', meta:[
      {l:'Vibración PRS-12', v:'+14%', c:'amber'},
      {l:'Cp INJ-07', v:'0.89', c:'red'},
      {l:'Temperatura OVN-09', v:'248.5°C', c:'red'},
    ]},
  ]);
  const [input,    setInput]    = useState('');
  const [loading,  setLoading]  = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => {
    actions.fetchAIInsights().catch(()=>{});
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const send = async () => {
    if (!input.trim() || loading) return;
    const text = input.trim();
    setInput('');
    setMessages(m => [...m, { role:'user', t:text }]);
    setLoading(true);
    try {
      const res = await actions.chat(text, convId);
      if (res.conversationId) setConvId(res.conversationId);
      const r = res.response;
      setMessages(m => [...m, {
        role: 'ai',
        t:    r.t || r.text,
        meta: r.meta,
        insight: r.insight,
        actions: r.actions,
        pFailure: r.pFailure,
        timeRemaining: r.timeRemaining,
      }]);
    } catch {
      setMessages(m => [...m, { role:'ai', t:'No se pudo conectar con el backend.' }]);
    } finally {
      setLoading(false);
    }
  };

  const insights = aiInsights.length ? aiInsights : FALLBACK_INSIGHTS;
  const models   = aiModels.length   ? aiModels   : FALLBACK_MODELS;

  return (
    <div className="p-6 space-y-5">
      <PageHeader
        eyebrow="// AI COPILOT"
        title="IA Industrial"
        desc="Copiloto conversacional para análisis de procesos, predicciones y recomendaciones automáticas."
        actions={
          <div className="flex items-center gap-2">
            <Chip color="ai"><span className="w-1.5 h-1.5 rounded-full bg-ai-400 pulse-dot"/>IndustrIA-AI v2.41</Chip>
            <button className="panel rounded-md px-3 py-2 text-xs text-slate-300 hairline">{I.copy} Histórico</button>
          </div>
        }
      />

      <div className="grid grid-cols-12 gap-4">
        <Card title="Sesión · ANALYST-447" subtitle="Contexto: Planta MX-01, últimas 24h" className="col-span-12 xl:col-span-8" accent="ai" glow="shadow-glowAi">
          <div className="h-[520px] flex flex-col">
            <div className="flex-1 overflow-y-auto pr-2 space-y-3">
              {messages.map((m,i)=>(
                <Message key={i} m={m}/>
              ))}
              {loading && (
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded grid place-items-center shrink-0 text-ai-400" style={{background:'rgba(168,85,247,0.12)', boxShadow:'inset 0 0 0 1px rgba(168,85,247,0.4)'}}>{I.bot}</div>
                  <div className="panel-strong rounded-2xl px-4 py-2.5" style={{border:'1px solid rgba(168,85,247,0.25)'}}>
                    <span className="text-ai-400 text-xs animate-pulse">Analizando planta MX-01…</span>
                  </div>
                </div>
              )}
              <div ref={bottomRef}/>
            </div>

            <div className="mt-3 flex gap-2 flex-wrap">
              {[
                '¿Por qué cayó el Cp de INJ-07?',
                'Predice fallas en próximas 4h',
                'Genera reporte DMAIC',
                'Compara turnos A vs B',
                'Sugerir setpoints óptimos',
              ].map(p=>(
                <button key={p} onClick={()=>setInput(p)} className="panel rounded-full px-3 py-1.5 text-[11px] text-slate-300 hover:text-ai-400 hairline">{p}</button>
              ))}
            </div>

            <div className="mt-3 flex items-center gap-2 panel-strong rounded-md px-3 py-2 focus-within:glow-ai" style={{color:'#A855F7'}}>
              <span className="text-ai-400">{I.brain}</span>
              <input value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>e.key==='Enter'&&send()} placeholder="Pregunta al copiloto industrial…" className="bg-transparent outline-none flex-1 text-sm text-white"/>
              <span className="kbd">↵</span>
              <button onClick={send} disabled={loading} className="ml-1 px-3 py-1.5 rounded text-[#06080F] text-xs font-semibold flex items-center gap-1 disabled:opacity-50" style={{background:'linear-gradient(90deg,#A855F7,#22D3EE)', boxShadow:'0 0 14px rgba(168,85,247,0.5)'}}>
                {I.send} Enviar
              </button>
            </div>
            <div className="text-[10px] text-slate-500 mt-1.5 flex items-center justify-between">
              <span>El copiloto puede ejecutar acciones (PM, ajuste setpoint) con tu aprobación.</span>
              <span className="num">2.4M tokens contexto · planta MX-01</span>
            </div>
          </div>
        </Card>

        <div className="col-span-12 xl:col-span-4 space-y-4">
          <Card title="Modelos activos" accent="ai">
            <div className="space-y-2">
              {models.map(m=>(
                <div key={m.n} className="panel rounded p-2.5 flex items-center gap-3">
                  <div className="w-1 self-stretch rounded" style={{background:m.c, boxShadow:`0 0 6px ${m.c}`}}/>
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <div className="text-xs text-white">{m.n}</div>
                      <div className="num text-[10px] text-slate-500">{m.v}</div>
                    </div>
                    <div className="h-1 mt-1 rounded bg-slate-700/40 overflow-hidden">
                      <div className="h-full rounded" style={{width:`${m.conf}%`, background:m.c}}/>
                    </div>
                  </div>
                  <span className="num text-xs" style={{color:m.c}}>{m.conf}%</span>
                </div>
              ))}
            </div>
          </Card>

          <Card title="Insights del turno" subtitle="14:00 — ahora" accent="cyan">
            <div className="space-y-2">
              {insights.map((x,i)=>(
                <div key={i} className="panel rounded p-2.5">
                  <div className="flex items-center gap-2 mb-1">
                    <Chip color={x.c==='red'?'red':(x.c==='ai'?'ai':(x.c==='green'?'green':'cyan'))}>{x.tag}</Chip>
                    <span className="num text-[10px] text-slate-500 ml-auto">{x.ago}</span>
                  </div>
                  <div className="text-xs text-slate-200">{x.t}</div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

const FALLBACK_INSIGHTS = [
  {tag:'PATRÓN',     c:'cyan',  t:'Vibración PRS-12 sube los lunes 8–10am.',                  ago:'21m'},
  {tag:'CORRELACIÓN',c:'ai',    t:'Cp INJ-07 correlaciona 0.78 con humedad ambiente.',          ago:'14m'},
  {tag:'ANOMALÍA',   c:'red',   t:'Pico térmico OVN-09 fuera de baseline 6σ.',                 ago:'7m'},
  {tag:'OPORTUNIDAD',c:'green', t:'Ahorro estimado $1.2K/día reduciendo speed -5%.',            ago:'35m'},
];

const FALLBACK_MODELS = [
  {n:'Anomaly-Detect',  v:'v2.41', conf:97, c:'#A855F7'},
  {n:'Predict-Failure', v:'v1.8',  conf:91, c:'#22D3EE'},
  {n:'Process-Optim',   v:'v3.0',  conf:88, c:'#3B82F6'},
  {n:'Vision-QA',       v:'v0.9',  conf:82, c:'#10B981'},
];

function Message({ m }){
  if(m.role==='system'){
    return <div className="text-center text-[10px] num text-slate-600 tracking-widest uppercase">{m.t}</div>;
  }
  if(m.role==='user'){
    return (
      <div className="flex items-start gap-3 justify-end">
        <div className="panel-strong rounded-2xl rounded-tr-sm px-4 py-2 max-w-[75%] text-sm text-white" style={{border:'1px solid rgba(34,211,238,0.18)'}}>{m.t}</div>
        <div className="w-8 h-8 rounded grid place-items-center text-white text-xs font-semibold shrink-0" style={{background:'linear-gradient(135deg,#22D3EE,#A855F7)'}}>LM</div>
      </div>
    );
  }
  const text = m.t || m.text || '';
  return (
    <div className="flex items-start gap-3">
      <div className="w-8 h-8 rounded grid place-items-center shrink-0 text-ai-400" style={{background:'rgba(168,85,247,0.12)', boxShadow:'inset 0 0 0 1px rgba(168,85,247,0.4)'}}>{I.bot}</div>
      <div className="max-w-[80%]">
        <div className="text-[10px] tracking-widest uppercase text-ai-400 mb-1">IndustrIA-AI</div>
        <div className="panel-strong rounded-2xl rounded-tl-sm px-4 py-2.5 text-sm text-slate-100" style={{border:'1px solid rgba(168,85,247,0.25)'}}>
          <div style={{whiteSpace:'pre-wrap'}}>{text}</div>
          {m.meta && (
            <div className="grid grid-cols-3 gap-2 mt-3">
              {m.meta.map((x,i)=>(
                <div key={i} className="panel rounded p-2">
                  <div className="text-[10px] text-slate-500 uppercase tracking-widest">{x.l}</div>
                  <div className={`num text-base mt-0.5 ${x.c==='red'?'text-crit-400':(x.c==='amber'?'text-warn-400':'text-cyan2-400')}`}>{x.v}</div>
                </div>
              ))}
            </div>
          )}
          {m.insight && (
            <div className="mt-3 panel rounded p-3 border border-crit-400/30" style={{boxShadow:'0 0 14px rgba(239,68,68,0.15)'}}>
              <div className="flex items-center gap-2 mb-2"><span className="text-crit-400">{I.alert}</span><span className="text-[10px] tracking-widest text-crit-400 uppercase">Riesgo alto</span></div>
              <div className="grid grid-cols-3 gap-2 text-[11px]">
                <div><div className="text-slate-500">P(falla 4h)</div><div className="num text-crit-400 text-base">{m.pFailure || 78}%</div></div>
                <div><div className="text-slate-500">Tiempo restante</div><div className="num text-warn-400 text-base">{m.timeRemaining || '~3.2h'}</div></div>
                <div><div className="text-slate-500">Costo evitable</div><div className="num text-grind-400 text-base">$18.4K</div></div>
              </div>
            </div>
          )}
          {m.actions && (
            <div className="flex gap-2 mt-3">
              <button className="px-3 py-1.5 text-xs rounded bg-ai-400/15 border border-ai-400/40 text-ai-400 hover:bg-ai-400/25 flex items-center gap-1">{I.check} Aprobar PM-2098</button>
              <button className="px-3 py-1.5 text-xs rounded panel hairline text-slate-300 hover:text-white">Ver detalle</button>
              <button className="px-3 py-1.5 text-xs rounded panel hairline text-slate-300 hover:text-white">{I.copy} Copiar</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
