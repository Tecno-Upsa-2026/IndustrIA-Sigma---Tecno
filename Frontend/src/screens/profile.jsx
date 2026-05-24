import { useState, useEffect } from 'react'
import { Card, Chip, Stat, PageHeader, Toggle } from '../shell'
import { I } from '../icons'
import { useData } from '../context/DataContext'

export default function ProfileScreen(){
  const { profile: liveProfile, actions } = useData();
  const [saved, setSaved] = useState(false);
  const [form,  setForm]  = useState(null);

  useEffect(() => {
    actions.fetchProfile().catch(()=>{});
  }, []);

  const p = liveProfile || FALLBACK_PROFILE;

  useEffect(() => {
    if (p) setForm({ firstName: p.firstName||'', lastName: p.lastName||'', email: p.email||'', phone: p.phone||'' });
  }, [liveProfile]);

  const handleSave = async () => {
    if (!form) return;
    await actions.updateProfile(form).catch(()=>{});
    setSaved(true);
    setTimeout(()=>setSaved(false), 2000);
  };

  return (
    <div className="p-6 space-y-5">
      <PageHeader
        eyebrow="// USER PROFILE"
        title="Perfil de Usuario"
        desc="Tu cuenta, preferencias, sesiones activas y credenciales de seguridad."
        actions={
          <div className="flex gap-2">
            <button onClick={()=>setForm({ firstName: p.firstName, lastName: p.lastName, email: p.email, phone: p.phone })} className="panel rounded-md px-3 py-2 text-xs text-slate-300 hairline">Cancelar</button>
            <button onClick={handleSave} className={`px-3 py-2 text-xs rounded-md flex items-center gap-1 ${saved?'bg-grind-400/15 border border-grind-400/40 text-grind-400':'bg-cyan2-400/15 border border-cyan2-400/40 text-cyan2-400'}`}>
              {I.check} {saved ? 'Guardado' : 'Guardar cambios'}
            </button>
          </div>
        }
      />

      <div className="grid grid-cols-12 gap-4">
        <Card title="Identidad" className="col-span-12 xl:col-span-4" accent="cyan">
          <div className="flex flex-col items-center text-center">
            <div className="relative">
              <div className="w-28 h-28 rounded-2xl grid place-items-center text-white text-3xl font-display font-bold" style={{background:'linear-gradient(135deg,#22D3EE,#3B82F6 60%,#A855F7)', boxShadow:'0 0 40px rgba(34,211,238,0.35)'}}>{p.avatar || 'LM'}</div>
              <span className="absolute bottom-1 right-1 w-4 h-4 rounded-full bg-grind-400 border-2 border-ink-900 pulse-dot" style={{boxShadow:'0 0 8px #10B981'}}/>
            </div>
            <div className="font-display text-xl font-bold text-white mt-3">{p.name || 'Luis Mendoza'}</div>
            <div className="text-sm text-slate-400">{p.role || 'Plant Engineer'} · {p.plant || 'Querétaro MX-01'}</div>
            <Chip color="ai" className="mt-2">SECURITY CLEARANCE · Ω-2</Chip>
            <div className="grid grid-cols-3 gap-2 mt-5 w-full">
              {[{l:'Reportes',v:'48'},{l:'Sims',v:'214'},{l:'Alertas\nresueltas',v:'1.4K'}].map(s=>(
                <div key={s.l} className="panel rounded p-2 text-center">
                  <div className="num text-base text-white">{s.v}</div>
                  <div className="text-[9px] text-slate-500 uppercase tracking-widest whitespace-pre-line">{s.l}</div>
                </div>
              ))}
            </div>
          </div>
        </Card>

        <Card title="Información de cuenta" className="col-span-12 xl:col-span-8" accent="cyan">
          {form ? (
            <div className="grid grid-cols-2 gap-4">
              <EditField label="Nombre"   value={form.firstName} onChange={v=>setForm(f=>({...f,firstName:v}))}/>
              <EditField label="Apellido" value={form.lastName}  onChange={v=>setForm(f=>({...f,lastName:v}))}/>
              <EditField label="Email"    value={form.email}     onChange={v=>setForm(f=>({...f,email:v}))}/>
              <EditField label="Teléfono" value={form.phone}     onChange={v=>setForm(f=>({...f,phone:v}))}/>
              <Field label="Rol"          value={p.role          || '—'}/>
              <Field label="Departamento" value={p.department    || '—'}/>
              <Field label="Planta"       value={p.plant         || '—'}/>
              <Field label="Turno"        value={p.shift         || '—'}/>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4">
              <Field label="Nombre"        value={p.firstName  || '—'}/>
              <Field label="Apellido"      value={p.lastName   || '—'}/>
              <Field label="Email"         value={p.email      || '—'}/>
              <Field label="Teléfono"      value={p.phone      || '—'}/>
              <Field label="Rol"           value={p.role       || '—'}/>
              <Field label="Departamento"  value={p.department || '—'}/>
              <Field label="Planta"        value={p.plant      || '—'}/>
              <Field label="Turno"         value={p.shift      || '—'}/>
            </div>
          )}
          <div className="hairline-top mt-5 pt-4 grid grid-cols-2 gap-4">
            <Field label="Idioma"       value={p.language       || '—'}/>
            <Field label="Zona horaria" value={p.timezone       || '—'}/>
            <Field label="Tema"         value={p.prefs?.theme   || '—'}/>
            <Field label="Densidad UI"  value={p.prefs?.density || '—'}/>
          </div>
        </Card>

      </div>
    </div>
  );
}

function Field({ label, value }){
  return (
    <div>
      <label className="text-[10px] tracking-widest uppercase text-slate-500">{label}</label>
      <div className="mt-1 panel rounded px-3 py-2 text-sm text-white num">{value}</div>
    </div>
  );
}

function EditField({ label, value, onChange }){
  return (
    <div>
      <label className="text-[10px] tracking-widest uppercase text-slate-500">{label}</label>
      <input value={value || ''} onChange={e=>onChange(e.target.value)}
             className="mt-1 w-full panel rounded px-3 py-2 text-sm text-white bg-transparent outline-none focus:border-cyan2-400/50 transition num"/>
    </div>
  );
}

const FALLBACK_PROFILE = {
  firstName:'Luis', lastName:'Mendoza', name:'Luis Mendoza',
  email:'l.mendoza@nexus.io', phone:'+52 442 ••• 4231',
  role:'Plant Engineer', department:'Operaciones', plant:'Querétaro · MX-01', shift:'B (14:00 – 22:00)',
  language:'Español (MX)', timezone:'America/Mexico_City',
  avatar:'LM',
  prefs:{ push:true, sms:true, email:true, sounds:false, focus:false, aiProactive:true },
};

