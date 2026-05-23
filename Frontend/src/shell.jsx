import React, { useState, useEffect, useRef } from 'react'
import { I } from './icons'
import { NAV } from './data'

export function StatusDot({ status }){
  const map = {
    RUNNING:  'bg-grind-400 shadow-[0_0_8px_#10B981]',
    WARN:     'bg-warn-400 shadow-[0_0_8px_#F59E0B]',
    CRITICAL: 'bg-crit-400 shadow-[0_0_8px_#EF4444]',
    IDLE:     'bg-slate-500',
    OFFLINE:  'bg-slate-600',
  };
  return <span className={`inline-block w-2 h-2 rounded-full pulse-dot ${map[status]||'bg-slate-500'}`}/>;
}

export function Chip({ children, color='cyan', className='' }){
  const map = {
    cyan:  'bg-cyan2-400/10 text-cyan2-400 border-cyan2-400/30',
    green: 'bg-grind-400/10 text-grind-400 border-grind-400/30',
    red:   'bg-crit-400/10 text-crit-400 border-crit-400/30',
    amber: 'bg-warn-400/10 text-warn-400 border-warn-400/30',
    ai:    'bg-ai-400/10 text-ai-400 border-ai-400/30',
    slate: 'bg-slate-400/10 text-slate-300 border-slate-400/20',
  };
  return <span className={`chip border ${map[color]||map.slate} ${className}`}>{children}</span>;
}

export function Card({ title, subtitle, action, glow, className='', bodyClass='', children, accent='cyan' }){
  const accentColor = {
    cyan:'text-cyan2-400', green:'text-grind-400', red:'text-crit-400',
    ai:'text-ai-400', amber:'text-warn-400'
  }[accent] || 'text-cyan2-400';
  const currentColor = {
    cyan:'#22D3EE', red:'#EF4444', ai:'#A855F7', green:'#10B981', amber:'#F59E0B'
  }[accent] || '#22D3EE';
  return (
    <div className={`panel rounded-lg overflow-hidden ${glow||''} ${className} corners`} style={{color: currentColor}}>
      {(title||action) && (
        <div className="flex items-center justify-between px-4 py-3 hairline-bottom" style={{color:'#E2E8F0'}}>
          <div className="flex items-center gap-2">
            <span className={`w-1 h-3 ${accentColor.replace('text-','bg-')} rounded-sm`} style={{boxShadow:`0 0 6px currentColor`}}/>
            <div>
              <div className="text-[11px] tracking-[0.22em] uppercase text-slate-300 font-medium">{title}</div>
              {subtitle && <div className="text-[10px] text-slate-500 mt-0.5">{subtitle}</div>}
            </div>
          </div>
          {action}
        </div>
      )}
      <div className={`p-4 ${bodyClass}`} style={{color:'#E2E8F0'}}>{children}</div>
    </div>
  );
}

export function Stat({ label, value, unit, accent='cyan', delta, sub, big=false }){
  const color = { cyan:'#22D3EE', green:'#10B981', red:'#EF4444', ai:'#A855F7', amber:'#F59E0B', slate:'#94A3B8' }[accent];
  const deltaColor = delta && delta.startsWith('-') ? '#EF4444' : '#10B981';
  return (
    <div>
      <div className="text-[10px] tracking-[0.25em] uppercase text-slate-400">{label}</div>
      <div className="flex items-baseline gap-1.5 mt-1">
        <div className={`num font-semibold ${big?'text-5xl':'text-3xl'}`} style={{color, textShadow:`0 0 18px ${color}55`}}>{value}</div>
        {unit && <div className="text-slate-400 text-sm">{unit}</div>}
      </div>
      <div className="flex items-center gap-2 mt-1">
        {delta && <span className="num text-[11px]" style={{color:deltaColor}}>{delta}</span>}
        {sub   && <span className="text-[11px] text-slate-500">{sub}</span>}
      </div>
    </div>
  );
}

export function Toggle({ on }){
  return (
    <div className={`w-9 h-5 rounded-full relative transition ${on?'bg-cyan2-400/30':'bg-slate-700/60'}`}
         style={on?{boxShadow:'inset 0 0 0 1px rgba(34,211,238,0.5)'}:{}}>
      <span className={`absolute top-0.5 ${on?'left-[18px] bg-cyan2-400':'left-0.5 bg-slate-400'} w-4 h-4 rounded-full transition`}
            style={on?{boxShadow:'0 0 8px #22D3EE'}:{}}/>
    </div>
  );
}

export function Particles({ density=70 }){
  const ref = useRef(null);
  useEffect(()=>{
    const cvs = ref.current; if(!cvs) return;
    const ctx = cvs.getContext('2d');
    let raf;
    const resize = ()=>{ cvs.width = cvs.clientWidth; cvs.height = cvs.clientHeight; };
    resize(); window.addEventListener('resize', resize);
    const pts = Array.from({length:density}).map(()=>({
      x: Math.random()*cvs.width, y: Math.random()*cvs.height,
      vx:(Math.random()-0.5)*0.25, vy:(Math.random()-0.5)*0.25,
      r: Math.random()*1.6+0.4,
    }));
    const tick = ()=>{
      ctx.clearRect(0,0,cvs.width,cvs.height);
      pts.forEach(p=>{
        p.x+=p.vx; p.y+=p.vy;
        if(p.x<0||p.x>cvs.width) p.vx*=-1;
        if(p.y<0||p.y>cvs.height) p.vy*=-1;
      });
      for(let i=0;i<pts.length;i++) for(let j=i+1;j<pts.length;j++){
        const a=pts[i], b=pts[j]; const dx=a.x-b.x, dy=a.y-b.y; const d=Math.sqrt(dx*dx+dy*dy);
        if(d<110){
          ctx.strokeStyle = `rgba(34,211,238,${(1-d/110)*0.18})`;
          ctx.lineWidth=0.6; ctx.beginPath(); ctx.moveTo(a.x,a.y); ctx.lineTo(b.x,b.y); ctx.stroke();
        }
      }
      pts.forEach(p=>{ ctx.fillStyle='rgba(148,197,255,0.55)'; ctx.beginPath(); ctx.arc(p.x,p.y,p.r,0,Math.PI*2); ctx.fill(); });
      raf = requestAnimationFrame(tick);
    };
    tick();
    return ()=>{ cancelAnimationFrame(raf); window.removeEventListener('resize', resize); };
  },[density]);
  return <canvas ref={ref} className="absolute inset-0 w-full h-full"/>;
}

export function Sidebar({ active, onNavigate }){
  const grouped = NAV.reduce((acc,n)=>{ (acc[n.group]=acc[n.group]||[]).push(n); return acc;}, {});
  return (
    <aside className="relative z-10 w-[248px] panel-strong border-r border-slate-700/40 flex flex-col">
      {/* Logo */}
      <div className="h-16 px-4 flex items-center gap-3 hairline-bottom">
        <div className="relative w-9 h-9 rounded-md flex items-center justify-center shrink-0"
             style={{background:'linear-gradient(135deg,#22D3EE,#3B82F6 60%,#A855F7)', boxShadow:'0 0 18px rgba(34,211,238,0.45)'}}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#06080F" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 20V4l8 6 8-6v16"/>
            <circle cx="12" cy="14" r="2.2" fill="#06080F"/>
          </svg>
          <div className="absolute -inset-px rounded-md ring-1 ring-cyan2-400/40 pointer-events-none"/>
        </div>
        <div className="leading-tight">
          <div className="font-display font-bold tracking-wide text-white text-[15px]">IndustrIA<span className="text-cyan2-400"> Σ</span></div>
          <div className="text-[10px] tracking-[0.22em] text-slate-400 uppercase">Industrial Intelligence</div>
        </div>
      </div>

      {/* Plant selector */}
      <div className="px-3 py-3 hairline-bottom">
        <div className="flex items-center gap-2 px-2 py-2 panel rounded-md">
          <div className="w-2 h-2 rounded-full bg-grind-400 pulse-dot"/>
          <div className="flex-1">
            <div className="text-[10px] tracking-[0.2em] uppercase text-slate-500">Planta</div>
            <div className="text-xs font-medium text-white">Querétaro · MX-01</div>
          </div>
          <span className="text-slate-500">{I.caret}</span>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-4">
        {Object.entries(grouped).map(([group, items])=>(
          <div key={group}>
            <div className="px-3 pb-1 text-[9px] tracking-[0.3em] text-slate-500 uppercase">{group}</div>
            <div className="space-y-0.5">
              {items.map(it=>{
                const isActive = active===it.id;
                return (
                  <button key={it.id} onClick={()=>onNavigate(it.id)}
                    className={`group w-full flex items-center gap-3 px-3 py-2 rounded-md transition relative
                      ${isActive ? 'text-white bg-gradient-to-r from-cyan2-400/15 to-transparent' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}>
                    {isActive && <span className="absolute left-0 top-1.5 bottom-1.5 w-[2px] bg-cyan2-400 rounded-full" style={{boxShadow:'0 0 8px #22D3EE'}}/>}
                    <span className={isActive?'text-cyan2-400':''}>{it.icon}</span>
                    <span className="text-sm flex-1 text-left">{it.label}</span>
                    {it.badge && <span className="text-[10px] num px-1.5 py-0.5 rounded bg-crit-400/15 text-crit-400 border border-crit-400/30">{it.badge}</span>}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className="px-3 py-3 hairline-top">
        <div className="panel rounded-md p-3 relative overflow-hidden">
          <div className="absolute inset-0 grid-bg-sm opacity-30"/>
          <div className="relative">
            <div className="flex items-center gap-2">
              <span className="text-ai-400">{I.brain}</span>
              <div className="text-xs text-white font-medium">Modelo IA v2.41</div>
            </div>
            <div className="text-[10px] text-slate-500 mt-1">Última inferencia: hace 2s</div>
            <div className="mt-2 h-1 rounded bg-slate-700/50 overflow-hidden">
              <div className="h-full bg-gradient-to-r from-ai-400 to-cyan2-400 w-3/4" style={{boxShadow:'0 0 8px #A855F7'}}/>
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}

export function Topbar({ title, breadcrumb, onLogout }){
  const [time,setTime] = useState(new Date());
  useEffect(()=>{ const id=setInterval(()=>setTime(new Date()),1000); return ()=>clearInterval(id); },[]);
  const fmt = (n)=> String(n).padStart(2,'0');
  return (
    <header className="h-16 px-6 flex items-center gap-6 hairline-bottom panel-strong relative z-10">
      <div className="flex items-center gap-3">
        <div className="text-[10px] tracking-[0.25em] text-slate-500 uppercase">{breadcrumb}</div>
        <span className="text-slate-700">/</span>
        <div className="font-display text-white text-lg font-semibold tracking-wide">{title}</div>
      </div>

      <div className="flex-1 max-w-md mx-auto">
        <div className="flex items-center gap-2 panel rounded-md px-3 py-1.5 hairline">
          <span className="text-slate-500">{I.search}</span>
          <input className="bg-transparent outline-none flex-1 text-sm placeholder:text-slate-500" placeholder="Buscar máquinas, lotes, alertas, KPIs…"/>
          <span className="kbd">⌘K</span>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div className="hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded panel hairline">
          <span className="w-1.5 h-1.5 rounded-full bg-grind-400 pulse-dot"/>
          <span className="text-[11px] tracking-wide text-slate-300">LIVE</span>
          <span className="text-[11px] num text-slate-500 ml-1">42ms</span>
        </div>
        <div className="hidden md:flex flex-col items-end leading-tight">
          <div className="num text-[15px] text-white">{fmt(time.getHours())}:{fmt(time.getMinutes())}:{fmt(time.getSeconds())}</div>
          <div className="text-[10px] text-slate-500">UTC-6 · Turno B</div>
        </div>
        <button className="relative w-9 h-9 panel rounded-md grid place-items-center text-slate-300 hover:text-cyan2-400 hairline">
          {I.bell}
          <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-crit-400 text-[9px] grid place-items-center text-white num" style={{boxShadow:'0 0 10px #EF4444'}}>7</span>
        </button>
        <div className="flex items-center gap-2 panel rounded-md px-2 py-1 hairline">
          <div className="w-7 h-7 rounded grid place-items-center text-white text-xs font-semibold"
               style={{background:'linear-gradient(135deg,#22D3EE,#A855F7)'}}>LM</div>
          <div className="leading-tight">
            <div className="text-xs text-white">L. Mendoza</div>
            <div className="text-[10px] text-slate-500">Plant Engineer</div>
          </div>
          <span className="text-slate-500">{I.caret}</span>
        </div>
        <button onClick={onLogout} className="text-slate-500 hover:text-crit-400" title="Salir">{I.power}</button>
      </div>
    </header>
  );
}

export function PageHeader({ eyebrow, title, desc, actions }){
  return (
    <div className="flex items-end justify-between mb-5">
      <div>
        <div className="text-[10px] tracking-[0.3em] text-cyan2-400 uppercase">{eyebrow}</div>
        <h1 className="font-display text-2xl font-bold text-white mt-1">{title}</h1>
        {desc && <p className="text-sm text-slate-400 mt-1 max-w-xl">{desc}</p>}
      </div>
      {actions}
    </div>
  );
}
