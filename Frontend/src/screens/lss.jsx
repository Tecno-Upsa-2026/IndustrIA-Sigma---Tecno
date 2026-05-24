import { useEffect } from 'react'
import { Card, Stat, PageHeader, Chip } from '../shell'
import { SparkLine, ParetoChart, Histogram, ControlChart } from '../charts'
import { PARETO, ISHIKAWA, SPC_DATA } from '../data'
import { I } from '../icons'
import { useData } from '../context/DataContext'

export default function LSSScreen() {
  const { lss, metrics, spcData, actions } = useData();

  useEffect(() => {
    actions.fetchLSS().catch(() => {});
    actions.fetchSPCAll().catch(() => {});
  }, []);

  const liveSigma = metrics?.sigma || null;
  const liveYield = metrics?.yield || null;

  const phases = [
    {p:'D', name:'Define',  pct:100, c:'#22D3EE'},
    {p:'M', name:'Measure', pct:100, c:'#22D3EE'},
    {p:'A', name:'Analyze', pct:74,  c:'#A855F7'},
    {p:'I', name:'Improve', pct:32,  c:'#F59E0B'},
    {p:'C', name:'Control', pct:8,   c:'#64748B'},
  ];

  // SPC data — live if available, demo data otherwise
  const liveINJ = spcData['INJ-07'];
  const points  = liveINJ?.points?.map(p => p.value) || SPC_DATA.points;
  const stats   = liveINJ?.stats || {};
  const hasSPC  = points.length > 0;

  const spc = {
    points,
    mean: stats.mean ?? SPC_DATA.mean,
    sd:   stats.sd   ?? SPC_DATA.sd,
    ucl:  stats.ucl  ?? SPC_DATA.ucl,
    lcl:  stats.lcl  ?? SPC_DATA.lcl,
    usl:  stats.usl  ?? SPC_DATA.usl,
    lsl:  stats.lsl  ?? SPC_DATA.lsl,
    cp:   stats.cp   ?? SPC_DATA.cp  ?? 1.42,
    cpk:  stats.cpk  ?? SPC_DATA.cpk ?? 1.31,
  };

  const mr     = points.slice(1).map((v,i) => Math.abs(v - points[i]));
  const mrMean = mr.reduce((a,b) => a+b, 0) / mr.length;

  return (
    <div className="p-6 space-y-5">
      <PageHeader
        eyebrow="// LEAN SIX SIGMA · SPC"
        title="Lean Six Sigma"
        desc="DMAIC, análisis de capacidad, Ishikawa, control estadístico y distribución — por máquina."
        actions={
          <div className="flex items-center gap-2">
            <div className="panel rounded-md px-3 py-2 text-xs text-slate-300 hairline flex items-center gap-2">
              <span className="text-cyan2-400">{I.flask}</span> Proyecto · INJ-07 yield uplift
            </div>
            <button className="px-3 py-2 text-xs rounded-md bg-cyan2-400/15 border border-cyan2-400/40 text-cyan2-400 flex items-center gap-2">
              {I.download} PDF
            </button>
          </div>
        }
      />

      {/* DMAIC Phases */}
      <Card title="Proyecto DMAIC · INJ-07" subtitle="Reducción de defectos en línea 2 · Q1 2026" accent="ai">
        <div className="grid grid-cols-5 gap-2">
          {phases.map((p,i) => (
            <div key={p.p} className="panel rounded p-3 relative overflow-hidden">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-8 h-8 rounded grid place-items-center font-display font-bold text-lg"
                     style={{color:p.c, background:`${p.c}1c`, boxShadow:`inset 0 0 0 1px ${p.c}55`}}>{p.p}</div>
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

      {/* SPC Stats — in Spanish */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        {[
          {l:'Media (X̄)',         v: spc.mean != null ? spc.mean.toFixed(2) : '—', c:'cyan'},
          {l:'Desv. estándar (σ)', v: spc.sd   != null ? spc.sd.toFixed(3)   : '—', c:'cyan'},
          {l:'Lím. Control Sup.', v: spc.ucl  != null ? spc.ucl.toFixed(2)  : '—', c:'red'},
          {l:'Lím. Control Inf.', v: spc.lcl  != null ? spc.lcl.toFixed(2)  : '—', c:'red'},
          {l:'Cp',                v: spc.cp   != null ? spc.cp.toFixed(2)   : '—', c:'green'},
          {l:'Cpk',               v: spc.cpk  != null ? spc.cpk.toFixed(2)  : '—', c:'green'},
        ].map(k => (
          <div key={k.l} className="panel rounded p-3 corners"
               style={{color: k.c==='red'?'#EF4444':(k.c==='green'?'#10B981':'#22D3EE')}}>
            <div className="text-[10px] uppercase tracking-widest text-slate-500">{k.l}</div>
            <div className="num text-2xl mt-1"
                 style={{color: k.c==='red'?'#EF4444':(k.c==='green'?'#10B981':'#22D3EE'), textShadow:`0 0 14px ${k.c==='red'?'#EF444455':(k.c==='green'?'#10B98155':'#22D3EE55')}`}}>
              {k.v}
            </div>
          </div>
        ))}
      </div>

      {/* KPI strip — remove DPMO and RTY */}
      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-4 gap-3">
        {[
          {l:'Sigma Level', v: liveSigma ? `${liveSigma}σ` : '4.61σ',  d:'+0.08',    accent:'cyan'},
          {l:'Yield',       v: liveYield ? `${liveYield}%` : '98.6%',   d:'+0.3%',   accent:'green'},
          {l:'Cp / Cpk',    v: `${spc.cp.toFixed(2)} / ${spc.cpk.toFixed(2)}`,        d:'+0.04', accent:'cyan'},
          {l:'Ahorro YTD',  v: metrics?.savings ? `$${metrics.savings}` : '$182K',    d:'+$12K', accent:'ai'},
        ].map(k => (
          <div key={k.l} className="panel rounded p-3 relative overflow-hidden corners"
               style={{color: k.accent==='green'?'#10B981':(k.accent==='ai'?'#A855F7':'#22D3EE')}}>
            <Stat label={k.l} value={k.v} delta={k.d} accent={k.accent}/>
          </div>
        ))}
      </div>

      {/* Pareto + Capability */}
      <div className="grid grid-cols-12 gap-4">
        <Card title="Pareto · causas de defecto" subtitle="80/20 · vital few" className="col-span-12 xl:col-span-7" accent="cyan">
          <ParetoChart data={PARETO} w={680} h={260}/>
          <div className="mt-2 flex items-center gap-4 text-[10px] text-slate-400">
            <span className="flex items-center gap-1"><span className="w-3 h-2 bg-cyan2-400 rounded-sm"/>frecuencia</span>
            <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-ai-400"/>acumulado %</span>
          </div>
        </Card>

        <Card title="Análisis de capacidad" subtitle="Pieza clave · diámetro inyector" className="col-span-12 xl:col-span-5" accent="ai">
          <div className="flex items-center justify-around mb-3">
            {[{l:'Cp',v:spc.cp},{l:'Cpk',v:spc.cpk},{l:'Pp',v:stats.pp||1.39},{l:'Ppk',v:stats.ppk||1.27}].map(x => (
              <div key={x.l} className="text-center">
                <div className="num text-2xl text-ai-400" style={{textShadow:'0 0 14px #A855F755'}}>{typeof x.v === 'number' ? x.v.toFixed(2) : '—'}</div>
                <div className="text-[10px] text-slate-500 uppercase tracking-widest">{x.l}</div>
              </div>
            ))}
          </div>
          <Histogram data={spc.points} bins={14} w={420} h={160} color="#A855F7"/>
          <div className="grid grid-cols-3 gap-2 mt-3 text-[10px]">
            <div className="panel rounded p-2"><div className="text-slate-500">Lím. Inferior</div><div className="num text-warn-400">{spc.lsl.toFixed(2)}</div></div>
            <div className="panel rounded p-2"><div className="text-slate-500">Media (μ)</div><div className="num text-white">{spc.mean.toFixed(2)}</div></div>
            <div className="panel rounded p-2"><div className="text-slate-500">Lím. Superior</div><div className="num text-warn-400">{spc.usl.toFixed(2)}</div></div>
          </div>
        </Card>
      </div>

      {/* Ishikawa */}
      <Card title="Ishikawa · 6M" subtitle={ISHIKAWA.problem} accent="cyan">
        <IshikawaDiagram/>
      </Card>

      {/* Control chart X̄ */}
      <Card title="Carta de control X̄ · subgrupos n=5"
            subtitle="40 subgrupos · puntos fuera de control resaltados" accent="cyan">
        <ControlChart data={spc.points} mean={spc.mean} ucl={spc.ucl} lcl={spc.lcl}
                      usl={spc.usl} lsl={spc.lsl} w={1000} h={260}/>
      </Card>

      {/* Moving Range + Histogram */}
      <div className="grid grid-cols-12 gap-4">
        <Card title="Rango Móvil (MR)" subtitle="40 puntos" className="col-span-12 xl:col-span-7" accent="cyan">
          <ControlChart data={mr} mean={mrMean} ucl={mrMean*3.27} lcl={0}
                        usl={mrMean*3.27+0.05} lsl={-0.001} w={680} h={200}/>
        </Card>
        <Card title="Histograma · distribución" subtitle="Con curva normal ajustada" className="col-span-12 xl:col-span-5" accent="ai">
          <Histogram data={points} bins={14} w={420} h={200} color="#A855F7"/>
          <div className="grid grid-cols-3 gap-2 mt-2 text-[11px]">
            <div className="panel rounded p-2"><div className="text-slate-500">Media (μ)</div><div className="num text-white">{spc.mean.toFixed(3)}</div></div>
            <div className="panel rounded p-2"><div className="text-slate-500">Desv. (σ)</div><div className="num text-white">{spc.sd.toFixed(3)}</div></div>
            <div className="panel rounded p-2"><div className="text-slate-500">Asimetría</div><div className="num text-white">{stats.skewness != null ? stats.skewness.toFixed(2) : '0.14'}</div></div>
          </div>
        </Card>
      </div>

      {/* Data table — last 40 readings, without WECO */}
      <Card title="Datos de subgrupos · últimas 40 lecturas" subtitle="Característica diámetro [mm]" accent="cyan">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="text-[10px] tracking-widest uppercase text-slate-500">
              <tr className="hairline-bottom">
                <th className="text-left py-2 px-2">#</th>
                <th className="text-left">Fecha/Hora</th>
                <th className="text-left">Media (X̄)</th>
                <th className="text-left">Rango móvil</th>
                <th className="text-left">Lím. Superior</th>
                <th className="text-left">Lím. Inferior</th>
                <th className="text-left">Estado</th>
              </tr>
            </thead>
            <tbody>
              {points.slice(-10).map((v, i) => {
                const idx  = points.length - 10 + i;
                const ooc  = v > spc.ucl || v < spc.lcl;
                const warn = v > spc.usl || v < spc.lsl;
                const mrV  = idx > 0 ? Math.abs(v - points[idx - 1]) : 0;
                const t    = new Date(Date.now() - (10-i) * 60000);
                return (
                  <tr key={idx} className="hairline-bottom hover:bg-white/[0.02]">
                    <td className="py-1.5 px-2 num text-slate-500">{idx+1}</td>
                    <td className="num text-slate-400">{t.toLocaleTimeString()}</td>
                    <td className={`num ${ooc?'text-crit-400':warn?'text-warn-400':'text-white'}`}>{v.toFixed(3)}</td>
                    <td className="num text-slate-300">{mrV.toFixed(3)}</td>
                    <td className="num text-slate-500">{spc.usl.toFixed(2)}</td>
                    <td className="num text-slate-500">{spc.lsl.toFixed(2)}</td>
                    <td>{ooc ? <Chip color="red">OOC</Chip> : warn ? <Chip color="amber">WARN</Chip> : <Chip color="green">OK</Chip>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function IshikawaDiagram() {
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
        <text x={w-8} y={h/2-2}  fill="#A855F7" fontSize="9" textAnchor="middle" fontFamily="JetBrains Mono">PROBLEMA</text>
        <text x={w-8} y={h/2+14} fill="#fff"    fontSize="11" textAnchor="middle" fontWeight="600">Defectos lote</text>
        {bones.map((b, i) => {
          const top  = i < 3;
          const x    = 130 + (i%3) * 220;
          const yEnd = top ? 60 : h-60;
          return (
            <g key={b.name}>
              <line x1={x} y1={yEnd} x2={x-30} y2={h/2} stroke="#22D3EE" strokeWidth="1.5"/>
              <text x={x-30} y={yEnd-(top?6:-18)} fill="#22D3EE" fontSize="11" fontWeight="600" fontFamily="Inter">{b.name}</text>
              {b.causes.map((c, j) => {
                const cx = x + 40;
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
