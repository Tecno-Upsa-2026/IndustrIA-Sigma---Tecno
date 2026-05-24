import { useState, useEffect } from 'react'
import { Card, Chip, PageHeader, Toggle } from '../shell'
import { MACHINES as MOCK_MACHINES } from '../data'
import { I } from '../icons'
import { useData } from '../context/DataContext'

export default function ConfigScreen(){
  const { machines: machinesMap, config, users: liveUsers, actions } = useData();
  const [tab, setTab] = useState('machines');

  useEffect(() => {
    actions.fetchConfig().catch(()=>{});
  }, []);

  const machinesArr = Object.keys(machinesMap).length ? Object.values(machinesMap) : MOCK_MACHINES;
  const wecoRules   = config?.wecoRules || {};
  const spcLimits   = config?.spcLimits || [];
  const users       = liveUsers.length  ? liveUsers  : FALLBACK_USERS;

  const tabs = [
    {id:'machines', l:'Máquinas',    ic:I.cpu},
    {id:'spc',      l:'Límites SPC', ic:I.chart},
    {id:'users',    l:'Usuarios',    ic:I.user},
    {id:'variables',l:'Variables',   ic:I.layers},
  ];

  return (
    <div className="p-6 space-y-5">
      <PageHeader
        eyebrow="// SYSTEM CONFIG"
        title="Configuración"
        desc="Parámetros de máquinas, límites estadísticos, roles, variables de proceso y escenarios de simulación."
        actions={<Chip color="amber">Modo administrador</Chip>}
      />

      <div className="flex gap-1 panel rounded-md p-1 w-fit hairline">
        {tabs.map(t=>(
          <button key={t.id} onClick={()=>setTab(t.id)} className={`px-3 py-1.5 text-xs rounded flex items-center gap-2 ${tab===t.id?'bg-cyan2-400/15 text-cyan2-400 border border-cyan2-400/30':'text-slate-400 hover:text-white'}`}>
            <span>{t.ic}</span>{t.l}
          </button>
        ))}
      </div>

      {tab==='machines'  && <MachinesConfig machines={machinesArr}/>}
      {tab==='spc'       && <SPCConfig wecoRules={wecoRules} spcLimits={spcLimits} onToggleWECO={actions.toggleWECO}/>}
      {tab==='users'     && <UsersConfig users={users} onInvite={actions.inviteUser} onDelete={actions.deleteUser}/>}
      {tab==='variables' && <VariablesConfig/>}
    </div>
  );
}

function MachinesConfig({ machines }){
  return (
    <Card title="Catálogo de máquinas" subtitle={`${machines.length} activos registrados`} accent="cyan"
      action={<button className="px-3 py-1.5 text-xs rounded bg-cyan2-400/15 border border-cyan2-400/40 text-cyan2-400 flex items-center gap-1">{I.plus} Añadir</button>}>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-[10px] tracking-widest uppercase text-slate-500">
            <tr className="hairline-bottom">
              <th className="text-left py-2">ID</th><th className="text-left">Nombre</th><th className="text-left">Línea</th><th className="text-left">Tipo</th><th className="text-left">Setpoint</th><th className="text-left">Estado</th><th className="text-left">Última PM</th><th></th>
            </tr>
          </thead>
          <tbody>
            {machines.map(m=>(
              <tr key={m.id} className="hairline-bottom hover:bg-white/[0.02]">
                <td className="py-2 num text-cyan2-400">{m.id}</td>
                <td className="text-white">{m.name}</td>
                <td className="text-slate-300">{m.line}</td>
                <td className="text-slate-400">{m.id.split('-')[0]}</td>
                <td className="num text-slate-300">{(m.temp||0).toFixed(1)}°C</td>
                <td><Chip color={m.status==='CRITICAL'?'red':(m.status==='WARN'?'amber':(m.status==='RUNNING'?'green':'slate'))}>{m.status}</Chip></td>
                <td className="num text-slate-400 text-xs">12 May 2026</td>
                <td className="text-right">
                  <button className="text-slate-500 hover:text-cyan2-400 mr-2">{I.settings}</button>
                  <button className="text-slate-500 hover:text-crit-400">{I.x}</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

const WECO_LABELS = {
  r1: 'WECO Rule 1 · 1 punto fuera 3σ',
  r2: 'WECO Rule 2 · 9 puntos mismo lado',
  r3: 'WECO Rule 3 · 6 puntos crecientes',
  r5: 'WECO Rule 5 · 2 de 3 en zona A',
  r8: 'Nelson Rule 8 · 8 fuera zona C',
};

function SPCConfig({ wecoRules, spcLimits, onToggleWECO }){
  const displayLimits = spcLimits.length ? spcLimits : FALLBACK_SPC_LIMITS;
  const wecoEntries   = Object.keys(wecoRules).length
    ? Object.entries(wecoRules)
    : Object.entries({ r1:true, r2:true, r3:true, r5:true, r8:false });

  return (
    <div className="grid grid-cols-12 gap-4">
      <Card title="Límites de control" subtitle="Por característica clave" className="col-span-12 xl:col-span-8" accent="cyan">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-[10px] tracking-widest uppercase text-slate-500">
              <tr className="hairline-bottom">
                <th className="text-left py-2">Característica</th><th className="text-left">Target</th><th className="text-left">USL</th><th className="text-left">LSL</th><th className="text-left">UCL</th><th className="text-left">LCL</th><th className="text-left">Cp objetivo</th>
              </tr>
            </thead>
            <tbody>
              {displayLimits.map(r=>(
                <tr key={r.id || r.n} className="hairline-bottom hover:bg-white/[0.02]">
                  <td className="py-2 text-white">{r.char || r.n}</td>
                  <td className="num text-cyan2-400">{r.target || r.t}</td>
                  <td className="num text-warn-400">{r.usl}</td>
                  <td className="num text-warn-400">{r.lsl}</td>
                  <td className="num text-crit-400">{r.ucl}</td>
                  <td className="num text-crit-400">{r.lcl}</td>
                  <td className="num text-grind-400">{Number(r.cp||1.33).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <Card title="Reglas activas" className="col-span-12 xl:col-span-4" accent="amber">
        <div className="space-y-2">
          {wecoEntries.map(([key, on])=>(
            <div key={key} className="panel rounded p-2.5 flex items-center justify-between">
              <span className="text-xs text-slate-200">{WECO_LABELS[key] || key}</span>
              <Toggle on={Boolean(on)} onClick={()=>onToggleWECO(key, !on).catch(()=>{})}/>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

function UsersConfig({ users, onInvite, onDelete }){
  const [inviting, setInviting] = useState(false);

  const handleInvite = async () => {
    const name  = prompt('Nombre del usuario:');
    const email = prompt('Email:');
    if (!name || !email) return;
    setInviting(true);
    await onInvite({ name, email }).catch(()=>{});
    setInviting(false);
  };

  return (
    <Card title="Usuarios y roles" subtitle={`${users.length} cuentas activas`} accent="cyan"
      action={<button onClick={handleInvite} disabled={inviting} className="px-3 py-1.5 text-xs rounded bg-cyan2-400/15 border border-cyan2-400/40 text-cyan2-400 flex items-center gap-1 disabled:opacity-50">{I.plus} Invitar</button>}>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-[10px] tracking-widest uppercase text-slate-500">
            <tr className="hairline-bottom"><th className="text-left py-2">Usuario</th><th className="text-left">Rol</th><th className="text-left">Email</th><th className="text-left">Acceso</th><th className="text-left">2FA</th><th className="text-left">Último login</th><th></th></tr>
          </thead>
          <tbody>
            {users.map(u=>(
              <tr key={u.id} className="hairline-bottom hover:bg-white/[0.02]">
                <td className="py-2.5">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded grid place-items-center text-xs text-white font-semibold" style={{background:'linear-gradient(135deg,#22D3EE,#A855F7)'}}>{u.avatar || (u.name||'').slice(0,2).toUpperCase()}</div>
                    <span className="text-white">{u.name}</span>
                  </div>
                </td>
                <td><Chip color={u.role==='Service Account'?'ai':'slate'}>{u.role}</Chip></td>
                <td className="num text-xs text-slate-400">{u.email}</td>
                <td className="text-slate-300">{u.access}</td>
                <td>{u.fa?<span className="text-grind-400">{I.check}</span>:<span className="text-slate-600">{I.x}</span>}</td>
                <td className="num text-xs text-slate-400">{u.lastLogin}</td>
                <td className="text-right">
                  {u.id !== 'u1' && <button onClick={()=>onDelete(u.id).catch(()=>{})} className="text-slate-500 hover:text-crit-400">{I.x}</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function VariablesConfig(){
  return (
    <Card title="Variables de proceso" subtitle="Telemetría registrada" accent="cyan">
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
        {[
          {n:'temperatura',c:'#F59E0B',u:'°C',  r:'0-300'},
          {n:'presion',    c:'#3B82F6',u:'bar', r:'0-200'},
          {n:'vibracion',  c:'#EF4444',u:'g',   r:'0-2.0'},
          {n:'flujo',      c:'#22D3EE',u:'L/m', r:'0-100'},
          {n:'torque',     c:'#A855F7',u:'N·m', r:'0-400'},
          {n:'humedad',    c:'#3B82F6',u:'%',   r:'0-100'},
          {n:'acustica',   c:'#22D3EE',u:'dB',  r:'30-110'},
          {n:'velocidad',  c:'#10B981',u:'rpm', r:'0-12000'},
        ].map(v=>(
          <div key={v.n} className="panel rounded p-3">
            <div className="flex items-center justify-between">
              <span className="w-1.5 h-1.5 rounded-full" style={{background:v.c, boxShadow:`0 0 6px ${v.c}`}}/>
              <span className="text-[10px] num text-slate-500">[{v.r}] {v.u}</span>
            </div>
            <div className="num text-sm text-white mt-2">{v.n}</div>
            <div className="text-[10px] text-slate-500 num">tag: io.sensors.{v.n}</div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function SimsConfig(){
  return (
    <Card title="Escenarios de simulación" subtitle="Configuraciones guardadas y compartidas" accent="ai">
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {[
          {n:'Eco mode',         d:'Reduce speed 10%, ahorra 6.4% kWh', t:'Energía',    c:'#10B981'},
          {n:'Quality boost',    d:'Optimiza Cp a 1.55 sacrificando 4% velocidad', t:'Calidad', c:'#22D3EE'},
          {n:'Heat stress test', d:'Sube temperatura +15°C y observa falla', t:'Stress',  c:'#EF4444'},
          {n:'Maint preview',    d:'Simula paro programado de 4h en línea 2', t:'Mantto', c:'#F59E0B'},
          {n:'Demand spike',     d:'Producción +25% durante 6h', t:'Producción', c:'#A855F7'},
          {n:'New SKU 1284',     d:'Receta nueva con material PA66', t:'Receta',   c:'#3B82F6'},
        ].map(s=>(
          <div key={s.n} className="panel rounded p-3 hover:border-ai-400/30 transition cursor-pointer">
            <div className="flex items-center justify-between">
              <Chip color="ai">{s.t}</Chip>
              <button className="text-slate-500 hover:text-cyan2-400">{I.arrowR}</button>
            </div>
            <div className="font-display text-base font-semibold text-white mt-2">{s.n}</div>
            <div className="text-[11px] text-slate-400 mt-1">{s.d}</div>
            <div className="mt-2 h-1 rounded bg-slate-700/40 overflow-hidden">
              <div className="h-full" style={{width:'66%', background:s.c, boxShadow:`0 0 6px ${s.c}`}}/>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

const FALLBACK_USERS = [
  {id:'u1', name:'Luis Mendoza', role:'Plant Engineer', email:'l.mendoza@nexus.io', access:'Total',    fa:true,  lastLogin:'hace 4m',  avatar:'LM'},
  {id:'u2', name:'Ana Rivera',   role:'Quality Lead',   email:'a.rivera@nexus.io', access:'Quality',  fa:true,  lastLogin:'hace 1h',  avatar:'AR'},
  {id:'u3', name:'Carlos Núñez', role:'Maintenance',    email:'c.nunez@nexus.io',  access:'Mantto',   fa:false, lastLogin:'hace 6h',  avatar:'CN'},
  {id:'u4', name:'Sofia Pérez',  role:'Operator B',     email:'s.perez@nexus.io',  access:'Operación',fa:true,  lastLogin:'hace 12m', avatar:'SP'},
];

const FALLBACK_SPC_LIMITS = [
  {id:'sl1', n:'Diámetro inyector', t:12.50, usl:12.65, lsl:12.35, ucl:12.62, lcl:12.38, cp:1.33},
  {id:'sl2', n:'Espesor pared',     t: 2.40, usl: 2.48, lsl: 2.32, ucl: 2.47, lcl: 2.33, cp:1.33},
  {id:'sl3', n:'Peso pieza',        t:48.0,  usl:48.6,  lsl:47.4,  ucl:48.5,  lcl:47.5,  cp:1.50},
  {id:'sl4', n:'Temperatura curado',t:214,   usl:220,   lsl:208,   ucl:219,   lcl:209,   cp:1.33},
  {id:'sl5', n:'Densidad',          t: 1.18, usl: 1.22, lsl: 1.14, ucl: 1.21, lcl: 1.15, cp:1.50},
];
