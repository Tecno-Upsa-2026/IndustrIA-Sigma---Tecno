import { useEffect } from 'react'
import { Card, Stat, PageHeader, Chip } from '../shell'
import { SparkLine, ParetoChart, Histogram } from '../charts'
import { PARETO, ISHIKAWA, SPC_DATA, makeSeries } from '../data'
import { I } from '../icons'
import { useData } from '../context/DataContext'

export default function LSSScreen(){
  const { lss, metrics, actions } = useData();

  useEffect(() => {
    actions.fetchLSS().catch(()=>{});
  }, []);

  // Overlay live DPMO / sigma if available
  const liveDPMO  = metrics?.dpmo  || null;
  const liveSigma = metrics?.sigma || null;
  const liveOEE   = metrics?.oee   || null;
  const liveYield = metrics?.yield || null;
  const phases = [
    {p:'D', name:'Define',  pct:100, c:'#22D3EE'},
    {p:'M', name:'Measure', pct:100, c:'#22D3EE'},
    {p:'A', name:'Analyze', pct:74,  c:'#A855F7'},
    {p:'I', name:'Improve', pct:32,  c:'#F59E0B'},
    {p:'C', name:'Control', pct:8,   c:'#64748B'},
  ];

  return (
    <div className="p-6 space-y-5">
      <PageHeader
        eyebrow="// LEAN SIX SIGMA"
        title="Analytics LSS"
        desc="Análisis profundo de capability, causas raíz, DPMO y proyectos DMAIC en curso."
        actions={
          <div className="flex items-center gap-2">
            <div className="panel rounded-md px-3 py-2 text-xs text-slate-300 hairline flex items-center gap-2">
              <span className="text-cyan2-400">{I.flask}</span> Proyecto · INJ-07 yield uplift
            </div>
            <button className="panel rounded-md px-3 py-2 text-xs text-slate-300 hairline flex items-center gap-2 hover:text-cyan2-400">{I.plus} Nuevo proyecto</button>
          </div>
        }
      />

      <Card title="Proyecto DMAIC · INJ-07" subtitle="Reducción de defectos en línea 2 · Q1 2026" accent="ai">
        <div className="grid grid-cols-5 gap-2">
          {phases.map((p,i)=>(
            <div key={p.p} className="panel rounded p-3 relative overflow-hidden">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-8 h-8 rounded grid place-items-center font-display font-bold text-lg"
                  style={{color: p.c, background: `${p.c}1c`, boxShadow:`inset 0 0 0 1px ${p.c}55`}}>{p.p}</div>
                <div>
                  <div className="text-[10px] uppercase tracking-widest text-slate-500">Fase {i+1}</div>
                  <div className="text-sm text-white font-medium">{p.name}</div>
                </div>
              </div>
              <div className="h-1.5 rounded bg-slate-700/40 overflow-hidden">
                <div className="h-full" style={{width:`${p.pct}%`, background:p.c, boxShadow:`0 0 6px ${p.c}`}}/>
              </div>
              <div className="text-[10px] num text-slate-500 mt-1">{p.pct}% completado</div>
            </div>
          ))}
        </div>
      </Card>

      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-3">
        {[
          {l:'DPMO',          v: liveDPMO  ? String(liveDPMO)  : '1,243',       d:'-138 (7d)', accent:'green'},
          {l:'Sigma Level',   v: liveSigma ? `${liveSigma}σ`   : '4.61σ',       d:'+0.08',     accent:'cyan'},
          {l:'Yield',         v: liveYield ? `${liveYield}%`   : '98.6%',       d:'+0.3%',     accent:'green'},
          {l:'RTY',           v:'93.2%',   d:'+1.1%',     accent:'cyan'},
          {l:'Cp / Cpk',      v: (metrics?.cp && metrics?.cpk) ? `${metrics.cp} / ${metrics.cpk}` : '1.42 / 1.31', d:'+0.04', accent:'cyan'},
          {l:'Ahorro YTD',    v:'$182K',   d:'+$12K mes', accent:'ai'},
        ].map(k=>(
          <div key={k.l} className="panel rounded p-3 relative overflow-hidden corners" style={{color: k.accent==='green'?'#10B981':(k.accent==='ai'?'#A855F7':'#22D3EE')}}>
            <Stat label={k.l} value={k.v} delta={k.d} accent={k.accent}/>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-12 gap-4">
        <Card title="Pareto · causas de defecto" subtitle="80/20 · vital few" className="col-span-12 xl:col-span-7" accent="cyan">
          <ParetoChart data={PARETO} w={680} h={260}/>
          <div className="mt-2 flex items-center gap-4 text-[10px] text-slate-400">
            <span className="flex items-center gap-1"><span className="w-3 h-2 bg-cyan2-400 rounded-sm"/>frecuencia</span>
            <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-ai-400"/>acumulado %</span>
          </div>
        </Card>

        <Card title="Capability analysis" subtitle="Pieza-clave · diámetro inyector" className="col-span-12 xl:col-span-5" accent="ai">
          <div className="flex items-center justify-around mb-3">
            {[{l:'Cp',v:1.42},{l:'Cpk',v:1.31},{l:'Pp',v:1.39},{l:'Ppk',v:1.27}].map(x=>(
              <div key={x.l} className="text-center">
                <div className="num text-2xl text-ai-400" style={{textShadow:'0 0 14px #A855F755'}}>{x.v}</div>
                <div className="text-[10px] text-slate-500 uppercase tracking-widest">{x.l}</div>
              </div>
            ))}
          </div>
          <Histogram data={SPC_DATA.points} bins={14} w={420} h={170} color="#A855F7"/>
          <div className="grid grid-cols-3 gap-2 mt-3 text-[10px]">
            <div className="panel rounded p-2"><div className="text-slate-500">LSL</div><div className="num text-warn-400">{SPC_DATA.lsl.toFixed(2)}</div></div>
            <div className="panel rounded p-2"><div className="text-slate-500">μ</div><div className="num text-white">{SPC_DATA.mean.toFixed(2)}</div></div>
            <div className="panel rounded p-2"><div className="text-slate-500">USL</div><div className="num text-warn-400">{SPC_DATA.usl.toFixed(2)}</div></div>
          </div>
        </Card>
      </div>

      <Card title="Ishikawa · 6M" subtitle={ISHIKAWA.problem} accent="cyan">
        <IshikawaDiagram/>
      </Card>

      <div className="grid grid-cols-12 gap-4">
        <Card title="DPMO trend · 30d" className="col-span-12 xl:col-span-6" accent="green">
          <div className="num text-3xl text-grind-400" style={{textShadow:'0 0 14px #10B98155'}}>1,243</div>
          <div className="text-[11px] text-slate-500">defectos por millón de oportunidades</div>
          <div className="mt-3">
            <SparkLine data={makeSeries(30, 1500, 90, -10).map(v=>Math.max(900,v))} h={120} stroke="#10B981" fill="rgba(16,185,129,0.18)"/>
          </div>
        </Card>
        <Card title="Yield por línea" className="col-span-12 xl:col-span-6" accent="cyan">
          <div className="space-y-3">
            {[
              {l:'Línea 1', y:99.4, c:'#10B981'},
              {l:'Línea 2', y:96.8, c:'#F59E0B'},
              {l:'Línea 3', y:91.2, c:'#EF4444'},
              {l:'Línea 4', y:98.9, c:'#10B981'},
            ].map(l=>(
              <div key={l.l}>
                <div className="flex justify-between text-[11px] mb-1"><span className="text-slate-300">{l.l}</span><span className="num" style={{color:l.c}}>{l.y}%</span></div>
                <div className="h-1.5 rounded bg-slate-700/40 overflow-hidden">
                  <div className="h-full rounded" style={{width:`${l.y}%`, background:`linear-gradient(90deg,${l.c},${l.c}aa)`, boxShadow:`0 0 6px ${l.c}`}}/>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

function IshikawaDiagram(){
  const w=900, h=320;
  const spine = { x1:50, y1:h/2, x2:w-80, y2:h/2 };
  const bones = ISHIKAWA.branches;
  return (
    <div className="relative">
      <div className="absolute inset-0 grid-bg-sm opacity-30"/>
      <svg width="100%" viewBox={`0 0 ${w} ${h}`} className="relative">
        <line x1={spine.x1} y1={spine.y1} x2={spine.x2} y2={spine.y2} stroke="#22D3EE" strokeWidth="2"/>
        <path d={`M ${spine.x2} ${spine.y2-8} L ${spine.x2+18} ${spine.y2} L ${spine.x2} ${spine.y2+8} Z`} fill="#22D3EE" style={{filter:'drop-shadow(0 0 6px #22D3EE)'}}/>
        <rect x={w-78} y={h/2-22} width="140" height="44" rx="6" fill="rgba(168,85,247,0.12)" stroke="#A855F7"/>
        <text x={w-8} y={h/2-2} fill="#A855F7" fontSize="9" textAnchor="middle" fontFamily="JetBrains Mono">PROBLEMA</text>
        <text x={w-8} y={h/2+14} fill="#fff" fontSize="11" textAnchor="middle" fontWeight="600">Defectos lote</text>
        {bones.map((b,i)=>{
          const top = i<3;
          const x = 130 + (i%3)*220;
          const yEnd = top ? 60 : h-60;
          const yStart = h/2;
          return (
            <g key={b.name}>
              <line x1={x} y1={yEnd} x2={x+ (top?-30: -30)} y2={yStart} stroke="#22D3EE" strokeWidth="1.5"/>
              <text x={x-30} y={yEnd-(top?6:-18)} fill="#22D3EE" fontSize="11" fontWeight="600" fontFamily="Inter">{b.name}</text>
              {b.causes.map((c,j)=>{
                const cx = x + 40 + j*0;
                const cy = top ? yEnd + 8 + j*16 : yEnd - 8 - j*16;
                return (
                  <g key={j}>
                    <line x1={cx-20} y1={cy} x2={cx+34} y2={cy} stroke="rgba(148,163,184,0.4)" strokeWidth="1"/>
                    <text x={cx-22} y={cy+3} fill="#94A3B8" fontSize="9" textAnchor="end">{c}</text>
                  </g>
                );
              })}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
