import { useState } from 'react'
import { Particles, Chip } from '../shell'
import { I } from '../icons'
import { api } from '../lib/api'
import { auth } from '../lib/auth'

const DEMO_USERS = [
  { id:'u1', email:'l.mendoza@nexus.io', password:'demo1234', name:'L. Mendoza', role:'Plant Engineer', avatar:'LM' },
  { id:'u2', email:'admin@nexus.io',     password:'admin1234', name:'Admin',      role:'Administrator',  avatar:'AD' },
];

export default function LoginScreen({ onLogin }){
  const [user,    setUser]    = useState('l.mendoza@nexus.io');
  const [pass,    setPass]    = useState('demo1234');
  const [loading, setLoading] = useState(false);
  const [show,    setShow]    = useState(false);
  const [error,   setError]   = useState('');

  async function submit(e){
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const data = await api.login({ email: user, password: pass });
      auth.setTokens(data);
      onLogin(data.user);
    } catch {
      // Backend unavailable — validate against local demo credentials
      const demo = DEMO_USERS.find(u => u.email === user && u.password === pass);
      if (demo) {
        onLogin(demo);
      } else {
        setError('Credenciales incorrectas · demo: l.mendoza@nexus.io / demo1234');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen relative overflow-hidden flex">
      <div className="absolute inset-0 grid-bg opacity-60"/>
      <div className="absolute inset-0"><Particles density={70}/></div>
      <div className="absolute inset-0 pointer-events-none" style={{
        background:'radial-gradient(800px 500px at 20% 30%, rgba(34,211,238,0.18), transparent 60%), radial-gradient(700px 500px at 85% 70%, rgba(168,85,247,0.16), transparent 60%)'
      }}/>

      {/* HUD readouts */}
      <div className="absolute top-6 left-6 right-6 flex items-center justify-between text-[10px] text-slate-500 tracking-[0.25em] uppercase z-10 num">
        <div className="flex items-center gap-3">
          <span className="w-1.5 h-1.5 bg-cyan2-400 pulse-dot rounded-full"/>NEXUS · INDUSTRIAL INTELLIGENCE PLATFORM
        </div>
        <div className="flex items-center gap-6">
          <span>NODE · MX-01</span>
          <span>BUILD 2.41.0</span>
          <span>UPLINK · 42ms</span>
          <span className="text-grind-400">● SYSTEM ONLINE</span>
        </div>
      </div>

      {/* Left: branding panel */}
      <div className="hidden lg:flex flex-1 items-center justify-center relative">
        <div className="relative">
          <svg width="540" height="540" viewBox="0 0 540 540" className="opacity-60">
            <defs>
              <radialGradient id="rg" cx="50%" cy="50%" r="50%">
                <stop offset="0" stopColor="rgba(34,211,238,0.15)"/>
                <stop offset="1" stopColor="rgba(34,211,238,0)"/>
              </radialGradient>
            </defs>
            <circle cx="270" cy="270" r="250" fill="url(#rg)"/>
            {[60,120,180,240].map(r=>(
              <circle key={r} cx="270" cy="270" r={r} fill="none" stroke="rgba(34,211,238,0.2)" strokeDasharray="2 6"/>
            ))}
            {[0,30,60,90,120,150].map(a=>(
              <line key={a} x1="270" y1="270" x2={270+250*Math.cos(a*Math.PI/180)} y2={270+250*Math.sin(a*Math.PI/180)} stroke="rgba(148,163,184,0.15)"/>
            ))}
            <g style={{transformOrigin:'270px 270px', animation:'spin 7s linear infinite'}}>
              <defs>
                <linearGradient id="sw" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0" stopColor="rgba(34,211,238,0)"/>
                  <stop offset="1" stopColor="rgba(34,211,238,0.55)"/>
                </linearGradient>
              </defs>
              <path d="M270 270 L 520 270 A 250 250 0 0 0 290 23 Z" fill="url(#sw)" opacity="0.6"/>
            </g>
            {[[120,180],[420,160],[380,400],[140,400],[300,90],[470,300]].map(([x,y],i)=>(
              <g key={i}>
                <circle cx={x} cy={y} r="3" fill="#22D3EE"/>
                <circle cx={x} cy={y} r="3" fill="none" stroke="#22D3EE" className="blip" style={{animationDelay:`${i*0.3}s`}}/>
              </g>
            ))}
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="relative w-28 h-28 rounded-2xl grid place-items-center" style={{
              background:'linear-gradient(135deg,#22D3EE,#3B82F6 55%,#A855F7)',
              boxShadow:'0 0 80px rgba(34,211,238,0.5), 0 0 20px rgba(168,85,247,0.4)'
            }}>
              <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="#06080F" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 20V4l8 6 8-6v16"/><circle cx="12" cy="14" r="2.2" fill="#06080F"/>
              </svg>
            </div>
          </div>
        </div>

        <div className="absolute bottom-16 left-16 max-w-md">
          <div className="text-cyan2-400 text-[10px] tracking-[0.35em] uppercase mb-3">// SYSTEM STATUS</div>
          <h1 className="font-display text-4xl font-bold text-white leading-tight">Industrial<br/>Intelligence<br/><span className="text-glow-cyan text-cyan2-400">Platform</span></h1>
          <p className="text-slate-400 mt-4">Lean Six Sigma · AI · Predictive Analytics. Centro de control distribuido para procesos industriales de alta criticidad.</p>
          <div className="grid grid-cols-3 gap-3 mt-6">
            {[{l:'Plantas',v:'12'},{l:'Activos',v:'487'},{l:'Sensores',v:'3.2K'}].map(s=>(
              <div key={s.l} className="panel rounded p-3">
                <div className="num text-2xl text-white">{s.v}</div>
                <div className="text-[10px] text-slate-500 tracking-widest uppercase">{s.l}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right: form panel */}
      <div className="flex-1 flex items-center justify-center p-8 relative">
        <form onSubmit={submit} className="w-full max-w-md relative">
          <div className="panel-strong rounded-xl p-8 corners relative overflow-hidden" style={{color:'#22D3EE'}}>
            <div className="absolute inset-0 grid-bg-sm opacity-30 pointer-events-none"/>
            <div className="relative" style={{color:'#E2E8F0'}}>
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-[10px] tracking-[0.3em] uppercase text-cyan2-400">// AUTH GATEWAY</div>
                  <h2 className="font-display text-2xl font-bold text-white mt-1">Acceso seguro</h2>
                </div>
                <Chip color="green"><span className="w-1 h-1 rounded-full bg-grind-400 pulse-dot"/>SECURE</Chip>
              </div>
              <p className="text-sm text-slate-400 mt-2">Autenticación bifactor habilitada · TLS 1.3 · ISO 27001</p>

              <div className="space-y-4 mt-6">
                <div>
                  <label className="text-[10px] tracking-[0.25em] uppercase text-slate-400">Identidad corporativa</label>
                  <div className="flex items-center gap-2 mt-1.5 panel rounded-md px-3 py-2.5 focus-within:glow-cyan transition">
                    <span className="text-cyan2-400">{I.user}</span>
                    <input value={user} onChange={e=>setUser(e.target.value)} className="bg-transparent outline-none flex-1 text-sm text-white" placeholder="usuario@empresa.com"/>
                  </div>
                </div>
                <div>
                  <label className="text-[10px] tracking-[0.25em] uppercase text-slate-400">Clave de acceso</label>
                  <div className="flex items-center gap-2 mt-1.5 panel rounded-md px-3 py-2.5 focus-within:glow-cyan transition">
                    <span className="text-cyan2-400">{I.lock}</span>
                    <input type={show?'text':'password'} value={pass} onChange={e=>setPass(e.target.value)} className="bg-transparent outline-none flex-1 text-sm text-white num tracking-widest"/>
                    <button type="button" onClick={()=>setShow(s=>!s)} className="text-slate-500 hover:text-cyan2-400">{I.eye}</button>
                  </div>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <label className="flex items-center gap-2 text-slate-400 cursor-pointer">
                    <span className="w-4 h-4 rounded border border-slate-600 bg-slate-800/50 grid place-items-center text-cyan2-400">{I.check}</span>
                    Mantener sesión en este nodo
                  </label>
                  <a className="text-cyan2-400 hover:underline" href="#">Token de respaldo</a>
                </div>

                {error && (
                  <div className="rounded-md px-3 py-2 text-xs text-crit-400 bg-crit-400/10 border border-crit-400/30 num">{error}</div>
                )}
                <button type="submit" disabled={loading} className="relative w-full mt-2 py-3 rounded-md font-semibold text-[#06080F] overflow-hidden group">
                  <span className="absolute inset-0" style={{background:'linear-gradient(90deg,#22D3EE,#3B82F6,#A855F7)'}}/>
                  <span className="absolute inset-0 opacity-60 sweep"/>
                  <span className="relative z-10 flex items-center justify-center gap-2 tracking-wide">
                    {loading
                      ? (<><span className="w-3 h-3 border-2 border-[#06080F] border-t-transparent rounded-full animate-spin"/> AUTENTICANDO…</>)
                      : (<>INICIAR SESIÓN {I.arrowR}</>)}
                  </span>
                </button>

                <div className="flex items-center gap-3 my-2">
                  <div className="flex-1 h-px bg-slate-700/50"/>
                  <div className="text-[10px] text-slate-500 tracking-widest">o continuar con</div>
                  <div className="flex-1 h-px bg-slate-700/50"/>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {['SSO','SAML','Azure AD'].map(p=>(
                    <button key={p} type="button" className="panel rounded-md py-2 text-xs text-slate-300 hover:text-cyan2-400 hairline">{p}</button>
                  ))}
                </div>
              </div>

              <div className="mt-6 grid grid-cols-3 gap-2 num text-[10px] text-slate-500">
                <div className="panel rounded p-2"><span className="text-grind-400">●</span> Lat 42ms</div>
                <div className="panel rounded p-2"><span className="text-cyan2-400">●</span> Region MX</div>
                <div className="panel rounded p-2"><span className="text-ai-400">●</span> AI v2.41</div>
              </div>
            </div>
          </div>
          <div className="mt-4 text-center text-[10px] text-slate-500 tracking-[0.25em] uppercase">© 2026 NEXUS Industries · Confidential</div>
        </form>
      </div>
    </div>
  );
}
