import { useEffect, useRef, useState } from 'react'
import { mulberry32 } from './data'

// SparkLine: continuous line with optional area fill
export function SparkLine({ data, w=160, h=42, stroke='#22D3EE', fill='rgba(34,211,238,0.18)', strokeWidth=1.6, showDots=false }){
  if(!data || !data.length) return null;
  const min = Math.min(...data), max = Math.max(...data);
  const sx = (i)=> (i/(data.length-1))*w;
  const sy = (v)=> h - ((v-min)/((max-min)||1))*h;
  const d = data.map((v,i)=> `${i?'L':'M'}${sx(i).toFixed(1)} ${sy(v).toFixed(1)}`).join(' ');
  const area = `${d} L ${w} ${h} L 0 ${h} Z`;
  return (
    <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
      <path d={area} fill={fill}/>
      <path d={d} fill="none" stroke={stroke} strokeWidth={strokeWidth} strokeLinejoin="round" strokeLinecap="round"/>
      {showDots && <circle cx={sx(data.length-1)} cy={sy(data[data.length-1])} r="2.5" fill={stroke}/>}
    </svg>
  );
}

// Gauge: arc gauge from 0..max
export function Gauge({ value=72, max=100, label, unit='%', color='#22D3EE', size=140, thickness=10, warn=80, crit=95 }){
  const r = (size-thickness)/2;
  const cx = size/2, cy = size/2;
  const start = -210, end = 30;
  const range = end - start;
  const frac = Math.min(1, Math.max(0, value/max));
  const polar = (ang)=>[ cx + r*Math.cos(ang*Math.PI/180), cy + r*Math.sin(ang*Math.PI/180) ];
  const pathArc = (a1,a2)=>{
    const [x1,y1] = polar(a1), [x2,y2] = polar(a2);
    const large = (a2-a1) > 180 ? 1 : 0;
    return `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2}`;
  };
  const active = value >= crit ? '#EF4444' : (value >= warn ? '#F59E0B' : color);
  const gradId = `gg-${label}-${size}`;
  return (
    <div className="relative" style={{width:size,height:size}}>
      <svg width={size} height={size}>
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor={active} stopOpacity="0.85"/>
            <stop offset="1" stopColor={active} stopOpacity="0.45"/>
          </linearGradient>
        </defs>
        <path d={pathArc(start, end)} fill="none" stroke="rgba(148,163,184,0.18)" strokeWidth={thickness} strokeLinecap="round"/>
        <path d={pathArc(start, start + range*frac)} fill="none" stroke={`url(#${gradId})`} strokeWidth={thickness} strokeLinecap="round" style={{filter:`drop-shadow(0 0 6px ${active}aa)`}}/>
        {Array.from({length:11}).map((_,i)=>{
          const a = start + (range*i/10);
          const [x1,y1] = polar(a);
          const r2 = r - thickness;
          const [x2,y2] = [cx + r2*Math.cos(a*Math.PI/180), cy + r2*Math.sin(a*Math.PI/180)];
          return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="rgba(148,163,184,0.25)" strokeWidth="1"/>;
        })}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <div className="num text-3xl font-semibold" style={{color:active, textShadow:`0 0 14px ${active}55`}}>
          {typeof value==='number'? value.toFixed(value%1?1:0):value}
          <span className="text-sm text-slate-400 ml-1">{unit}</span>
        </div>
        {label && <div className="text-[10px] tracking-[0.25em] text-slate-400 uppercase mt-1">{label}</div>}
      </div>
    </div>
  );
}

// ControlChart with limits
export function ControlChart({ data, mean, ucl, lcl, usl, lsl, w=720, h=240, color='#22D3EE' }){
  const min = Math.min(lcl, lsl)-0.4;
  const max = Math.max(ucl, usl)+0.4;
  const padL=42, padR=16, padT=18, padB=22;
  const innerW = w - padL - padR;
  const innerH = h - padT - padB;
  const sx = (i)=> padL + (i/(data.length-1))*innerW;
  const sy = (v)=> padT + (1-(v-min)/(max-min))*innerH;
  const path = data.map((v,i)=>`${i?'L':'M'}${sx(i).toFixed(1)} ${sy(v).toFixed(1)}`).join(' ');
  return (
    <svg width="100%" viewBox={`0 0 ${w} ${h}`}>
      <defs>
        <linearGradient id="cc-grad" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity=".4"/>
          <stop offset="1" stopColor={color} stopOpacity="0"/>
        </linearGradient>
      </defs>
      {[0,.25,.5,.75,1].map((p,i)=>{
        const y = padT + p*innerH;
        return <line key={i} x1={padL} x2={w-padR} y1={y} y2={y} stroke="rgba(148,163,184,0.08)"/>;
      })}
      <rect x={padL} y={sy(usl)} width={innerW} height={sy(lsl)-sy(usl)} fill="rgba(34,211,238,0.05)"/>
      <line x1={padL} x2={w-padR} y1={sy(ucl)}  y2={sy(ucl)}  stroke="rgba(239,68,68,0.55)"  strokeDasharray="6 4"/>
      <line x1={padL} x2={w-padR} y1={sy(lcl)}  y2={sy(lcl)}  stroke="rgba(239,68,68,0.55)"  strokeDasharray="6 4"/>
      <line x1={padL} x2={w-padR} y1={sy(usl)}  y2={sy(usl)}  stroke="rgba(245,158,11,0.55)" strokeDasharray="2 4"/>
      <line x1={padL} x2={w-padR} y1={sy(lsl)}  y2={sy(lsl)}  stroke="rgba(245,158,11,0.55)" strokeDasharray="2 4"/>
      <line x1={padL} x2={w-padR} y1={sy(mean)} y2={sy(mean)} stroke="rgba(34,211,238,0.7)"/>
      <path d={path} fill="none" stroke={color} strokeWidth="1.5"/>
      {data.map((v,i)=>{
        const ooc  = v > ucl || v < lcl;
        const warn = v > usl || v < lsl;
        return <circle key={i} cx={sx(i)} cy={sy(v)} r={ooc?4:2.5} fill={ooc?'#EF4444':(warn?'#F59E0B':color)} stroke={ooc?'#fff':'none'} strokeWidth={ooc?0.6:0} style={ooc?{filter:'drop-shadow(0 0 6px #EF4444)'}:{}}/>;
      })}
      <text x={padL-4} y={sy(ucl)+3}  fill="#EF4444" fontSize="9" textAnchor="end" fontFamily="JetBrains Mono">UCL</text>
      <text x={padL-4} y={sy(lcl)+3}  fill="#EF4444" fontSize="9" textAnchor="end" fontFamily="JetBrains Mono">LCL</text>
      <text x={padL-4} y={sy(mean)+3} fill="#22D3EE" fontSize="9" textAnchor="end" fontFamily="JetBrains Mono">X̄</text>
      <text x={padL-4} y={sy(usl)+3}  fill="#F59E0B" fontSize="9" textAnchor="end" fontFamily="JetBrains Mono">USL</text>
      <text x={padL-4} y={sy(lsl)+3}  fill="#F59E0B" fontSize="9" textAnchor="end" fontFamily="JetBrains Mono">LSL</text>
    </svg>
  );
}

// Histogram with normal fit
export function Histogram({ data, bins=14, color='#22D3EE', w=300, h=160 }){
  const min = Math.min(...data), max = Math.max(...data);
  const step = (max-min)/bins;
  const counts = Array(bins).fill(0);
  data.forEach(v=>{ const b = Math.min(bins-1, Math.floor((v-min)/step)); counts[b]++; });
  const maxC = Math.max(...counts);
  const padL=20,padR=8,padT=10,padB=18;
  const iW = w-padL-padR, iH = h-padT-padB;
  const bw = iW/bins;
  const mean = data.reduce((a,b)=>a+b,0)/data.length;
  const sd   = Math.sqrt(data.reduce((a,b)=>a+(b-mean)**2,0)/data.length);
  const pdf  = (x)=> (1/(sd*Math.sqrt(2*Math.PI)))*Math.exp(-0.5*((x-mean)/sd)**2);
  const samples = 60;
  const pathPts = [];
  let maxP = 0;
  for(let i=0;i<=samples;i++){ const x = min + (i/samples)*(max-min); maxP = Math.max(maxP, pdf(x)); }
  for(let i=0;i<=samples;i++){
    const x  = min + (i/samples)*(max-min);
    const px = padL + ((x-min)/(max-min))*iW;
    const py = padT + (1 - pdf(x)/maxP*0.9)*iH;
    pathPts.push(`${i?'L':'M'}${px.toFixed(1)} ${py.toFixed(1)}`);
  }
  return (
    <svg width="100%" viewBox={`0 0 ${w} ${h}`}>
      {counts.map((c,i)=>{
        const bh = (c/maxC)*iH;
        return <rect key={i} x={padL+i*bw+1} y={padT+iH-bh} width={bw-2} height={bh} fill={color} opacity="0.65" rx="1"/>;
      })}
      <path d={pathPts.join(' ')} fill="none" stroke="#A855F7" strokeWidth="1.5" opacity="0.9"/>
    </svg>
  );
}

// Pareto chart
export function ParetoChart({ data, w=520, h=240 }){
  const padL=30,padR=40,padT=14,padB=36;
  const iW = w-padL-padR, iH = h-padT-padB;
  const max   = Math.max(...data.map(d=>d.count));
  const total = data.reduce((a,b)=>a+b.count,0);
  let cum = 0;
  const cumPts = data.map((d)=>{ cum += d.count; return cum/total; });
  const bw = iW/data.length;
  return (
    <svg width="100%" viewBox={`0 0 ${w} ${h}`}>
      {[0,.25,.5,.75,1].map((p,i)=>{
        const y = padT + p*iH;
        return <line key={i} x1={padL} x2={w-padR} y1={y} y2={y} stroke="rgba(148,163,184,0.08)"/>;
      })}
      <defs>
        <linearGradient id="pareto-bar" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#22D3EE"/>
          <stop offset="1" stopColor="#0891B2"/>
        </linearGradient>
      </defs>
      {data.map((d,i)=>{
        const bh  = (d.count/total)*iH;
        const x   = padL + i*bw + 6;
        const bwi = bw - 12;
        return (
          <g key={i}>
            <rect x={x} y={padT+iH-bh} width={bwi} height={bh} fill="url(#pareto-bar)"/>
            <text x={x+bwi/2} y={h-padB+14}  fill="#94A3B8" fontSize="10" textAnchor="middle">{d.cause}</text>
            <text x={x+bwi/2} y={padT+iH-bh-4} fill="#E2E8F0" fontSize="10" textAnchor="middle" fontFamily="JetBrains Mono">{d.count}</text>
          </g>
        );
      })}
      <path d={cumPts.map((p,i)=>{
        const x = padL + (i+1)*bw;
        const y = padT + (1-p)*iH;
        return `${i?'L':'M'}${x.toFixed(1)} ${y.toFixed(1)}`;
      }).join(' ')} fill="none" stroke="#A855F7" strokeWidth="1.6"/>
      {cumPts.map((p,i)=>{
        const x = padL + (i+1)*bw;
        const y = padT + (1-p)*iH;
        return <circle key={i} cx={x} cy={y} r="3" fill="#A855F7" style={{filter:'drop-shadow(0 0 6px #A855F7)'}}/>;
      })}
      <line x1={padL} x2={w-padR} y1={padT+0.2*iH} y2={padT+0.2*iH} stroke="rgba(168,85,247,0.45)" strokeDasharray="4 4"/>
      <text x={w-padR+4} y={padT+0.2*iH+3} fill="#A855F7" fontSize="10" fontFamily="JetBrains Mono">80%</text>
    </svg>
  );
}

// Live waveform with autoscroll
export function LiveWave({ color='#22D3EE', amp=10, base=50, speed=80, height=80, smooth=0.18, drift=0 }){
  const [buf, setBuf] = useState(()=> Array(60).fill(base));
  useEffect(()=>{
    const id = setInterval(()=>{
      setBuf(prev=>{
        const last   = prev[prev.length-1];
        const target = base + (Math.random()-0.5)*amp + drift;
        const next   = last + (target-last)*smooth;
        return [...prev.slice(1), next];
      });
    }, speed);
    return ()=> clearInterval(id);
  },[base,amp,speed,smooth,drift]);
  return <SparkLine data={buf} h={height} stroke={color} fill={color+'22'} strokeWidth={1.8} showDots/>;
}

// Donut
export function Donut({ value=92, label='OEE', color='#22D3EE', size=120, thickness=12 }){
  const r    = (size-thickness)/2;
  const c    = 2*Math.PI*r;
  const frac = Math.min(1, value/100);
  return (
    <div className="relative" style={{width:size,height:size}}>
      <svg width={size} height={size}>
        <circle cx={size/2} cy={size/2} r={r} stroke="rgba(148,163,184,0.15)" strokeWidth={thickness} fill="none"/>
        <circle cx={size/2} cy={size/2} r={r} stroke={color} strokeWidth={thickness} fill="none"
          strokeDasharray={`${c*frac} ${c}`} strokeLinecap="round"
          transform={`rotate(-90 ${size/2} ${size/2})`}
          style={{filter:`drop-shadow(0 0 8px ${color}aa)`}}/>
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <div className="num text-xl font-semibold" style={{color}}>{value.toFixed(1)}%</div>
        <div className="text-[9px] tracking-[0.2em] text-slate-400 uppercase">{label}</div>
      </div>
    </div>
  );
}

// Heatmap grid (24h × 7d)
export function Heatmap({ cols=24, rows=7, seed=1, color='#22D3EE' }){
  const r = mulberry32(seed);
  const cells = [];
  for(let y=0;y<rows;y++) for(let x=0;x<cols;x++){
    const v = Math.max(0, Math.min(1, 0.2 + Math.sin((x+y)/3)*0.25 + (r()-0.5)*0.5));
    cells.push({x,y,v});
  }
  return (
    <div className="grid gap-0.5" style={{gridTemplateColumns:`repeat(${cols}, 1fr)`}}>
      {cells.map((c,i)=>(
        <div key={i} className="h-3 rounded-[2px]" style={{background:`rgba(34,211,238,${0.08 + c.v*0.85})`, boxShadow: c.v>0.85?`0 0 6px ${color}`:'none'}}/>
      ))}
    </div>
  );
}
