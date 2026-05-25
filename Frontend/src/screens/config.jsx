import { useState } from 'react'
import { Card, Chip, PageHeader } from '../shell'
import { I } from '../icons'
import { useData } from '../context/DataContext'

// ─── Unit guesser for CSV column names ────────────────────────────────────────
const UNIT_MAP = [
  { keys:['temperatura','temp'],   unit:'°C'   },
  { keys:['presion','pressure'],   unit:'bar'  },
  { keys:['vibracion','vib'],      unit:'g'    },
  { keys:['rpm','velocidad'],      unit:'rpm'  },
  { keys:['flujo','flow'],         unit:'L/m'  },
  { keys:['humedad','hr'],         unit:'%'    },
  { keys:['oee'],                  unit:'%'    },
  { keys:['carga','load'],         unit:'%'    },
  { keys:['torque'],               unit:'N·m'  },
  { keys:['diametro','diameter','medida','dim'], unit:'mm' },
  { keys:['peso','weight'],        unit:'g'    },
  { keys:['densidad'],             unit:'g/cc' },
];

function guessUnit(col) {
  const low = col.toLowerCase();
  return UNIT_MAP.find(u => u.keys.some(k => low.includes(k)))?.unit || '—';
}

function getColVal(row, header, ...keys) {
  for (const k of keys) {
    const col = header.find(h => h.toLowerCase().includes(k));
    if (col) { const v = parseFloat(row[col]); if (!isNaN(v)) return v; }
  }
  return null;
}

// ─── Build machine list merging CSV last-row data with mock fallback ──────────
function buildMachineList(csvFiles, machinesMap) {
  const csvIds = Object.keys(csvFiles);

  // Machines that have a CSV: derive live values from last row
  const csvMachines = csvIds.map(id => {
    const csv      = csvFiles[id];
    const fallback = machinesMap[id] || {};
    if (!csv?.rows?.length) return null;
    const last = csv.rows[csv.rows.length - 1];
    const h    = csv.header;

    const temp = getColVal(last, h, 'temperatura','temp')   ?? fallback.temp ?? 0;
    const vib  = getColVal(last, h, 'vibracion','vib')      ?? fallback.vib  ?? 0;
    const oee  = getColVal(last, h, 'oee')                  ?? fallback.oee  ?? 0;
    const rpm  = getColVal(last, h, 'rpm','velocidad')      ?? fallback.rpm  ?? 0;
    const load = getColVal(last, h, 'carga','load')         ?? fallback.load ?? 0;

    let status = 'RUNNING';
    const tLim = id.includes('OVN') ? 248 : id.includes('INJ') ? 220 : 80;
    if (temp > tLim || vib > 0.9) status = 'CRITICAL';
    else if (temp > tLim * 0.92 || vib > 0.55) status = 'WARN';
    else if (oee < 5 && load < 5) status = 'IDLE';

    return {
      id,
      name:   fallback.name || csv.name?.replace(/\.\w+$/, '').replace(/_/g,' ') || id,
      line:   fallback.line || 'CSV',
      status,
      temp, vib, oee, rpm, load,
      rows:   csv.rows.length,
      cols:   csv.header.filter(h2 => h2.toLowerCase() !== 'fecha_hora' && !isNaN(parseFloat(csv.rows[0]?.[h2]))).length,
      hasCSV: true,
    };
  }).filter(Boolean);

  // Machines without a CSV: use backend or mock
  const csvIdSet = new Set(csvIds);
  const backendArr = Object.values(machinesMap);
  const rest = backendArr
    .filter(m => !csvIdSet.has(m.id))
    .map(m => ({ ...m, hasCSV: false }));

  return [...csvMachines, ...rest];
}

// ─── Compute SPC limits from all loaded CSVs ──────────────────────────────────
function computeCSVLimits(csvFiles) {
  const limits = [];
  Object.entries(csvFiles).forEach(([machineId, csvData]) => {
    if (!csvData?.rows?.length) return;
    const numCols = csvData.header.filter(h =>
      h.toLowerCase() !== 'fecha_hora' && !isNaN(parseFloat(csvData.rows[0]?.[h]))
    );
    numCols.forEach(col => {
      const vals = csvData.rows.map(r => parseFloat(r[col])).filter(v => !isNaN(v));
      if (vals.length < 5) return;
      const mean = vals.reduce((a,b)=>a+b,0)/vals.length;
      const sd   = Math.sqrt(vals.reduce((a,b)=>a+(b-mean)**2,0)/vals.length);
      if (sd < 1e-9) return;
      const usl = mean + 2.5*sd, lsl = mean - 2.5*sd;
      const ucl = mean + 3*sd,   lcl = mean - 3*sd;
      const cp  = (usl-lsl)/(6*sd);
      const cpk = Math.min((usl-mean)/(3*sd),(mean-lsl)/(3*sd));
      limits.push({
        id: `${machineId}_${col}`,
        char: `${col.replace(/_/g,' ')}`,
        machine: machineId,
        target: mean.toFixed(3),
        usl: usl.toFixed(3), lsl: lsl.toFixed(3),
        ucl: ucl.toFixed(3), lcl: lcl.toFixed(3),
        cp: cp.toFixed(2), cpk: cpk.toFixed(2),
        n: vals.length,
        unit: guessUnit(col),
      });
    });
  });
  return limits.sort((a,b) => a.machine.localeCompare(b.machine));
}

// ─── Extract variable catalogue from all CSVs ─────────────────────────────────
function extractCSVVariables(csvFiles) {
  const palette = ['#F59E0B','#3B82F6','#EF4444','#22D3EE','#A855F7','#10B981','#EC4899','#64748B'];
  const vars = [];
  let ci = 0;
  const seen = new Set();

  Object.entries(csvFiles).forEach(([machineId, csvData]) => {
    if (!csvData?.rows?.length) return;
    csvData.header.forEach(col => {
      const key = `${machineId}_${col}`;
      if (seen.has(key)) return;
      if (col.toLowerCase() === 'fecha_hora') return;
      const vals = csvData.rows.map(r => parseFloat(r[col])).filter(v => !isNaN(v));
      if (vals.length < 2) return;
      seen.add(key);
      const mean = vals.reduce((a,b)=>a+b,0)/vals.length;
      const sd   = Math.sqrt(vals.reduce((a,b)=>a+(b-mean)**2,0)/vals.length);
      vars.push({
        n:       col.replace(/_/g,' '),
        col,
        machine: machineId,
        c:       palette[ci++ % palette.length],
        u:       guessUnit(col),
        min:     Math.min(...vals).toFixed(2),
        max:     Math.max(...vals).toFixed(2),
        mean:    mean.toFixed(2),
        sd:      sd.toFixed(3),
        n_rows:  vals.length,
        tag:     `io.${machineId.toLowerCase()}.${col}`,
      });
    });
  });
  return vars;
}

// ─── Screen ───────────────────────────────────────────────────────────────────
export default function ConfigScreen(){
  const { machines: machinesMap, users: liveUsers, csvFiles, actions } = useData();
  const [tab, setTab] = useState('machines');

  const csvCount    = Object.keys(csvFiles).length;
  const machineList = buildMachineList(csvFiles, machinesMap);
  const csvLimits   = computeCSVLimits(csvFiles);
  const csvVars     = extractCSVVariables(csvFiles);

  const users = liveUsers;

  const tabs = [
    { id:'machines', l:'Máquinas',    ic:I.cpu   },
    { id:'spc',      l:'Límites SPC', ic:I.chart },
    { id:'users',    l:'Usuarios',    ic:I.user  },
    { id:'variables',l:'Variables',   ic:I.layers},
  ];

  const dataSource = csvCount > 0
    ? `CSV · ${csvCount} archivo${csvCount !== 1 ? 's' : ''} cargado${csvCount !== 1 ? 's' : ''}`
    : 'Demo · datos simulados';

  return (
    <div className="p-6 space-y-5">
      <PageHeader
        eyebrow="// SYSTEM CONFIG"
        title="Configuración"
        desc="Parámetros de máquinas, límites estadísticos, roles, variables de proceso y escenarios de simulación."
        actions={
          <div className="flex items-center gap-2">
            <span className={`text-[9px] px-2 py-0.5 rounded border ${
              csvCount > 0
                ? 'bg-grind-400/10 text-grind-400 border-grind-400/25'
                : 'bg-slate-700 text-slate-500 border-slate-600'
            }`}>{dataSource}</span>
            <Chip color="amber">Modo administrador</Chip>
          </div>
        }
      />

      <div className="flex gap-1 panel rounded-md p-1 w-fit hairline">
        {tabs.map(t=>(
          <button key={t.id} onClick={()=>setTab(t.id)}
                  className={`px-3 py-1.5 text-xs rounded flex items-center gap-2 ${tab===t.id?'bg-cyan2-400/15 text-cyan2-400 border border-cyan2-400/30':'text-slate-400 hover:text-white'}`}>
            <span>{t.ic}</span>{t.l}
          </button>
        ))}
      </div>

      {tab==='machines'  && <MachinesTab machines={machineList} csvCount={csvCount}/>}
      {tab==='spc'       && <SPCTab csvLimits={csvLimits}/>}
      {tab==='users'     && <UsersTab users={users} onInvite={actions.inviteUser} onDelete={actions.deleteUser}/>}
      {tab==='variables' && <VariablesTab csvVars={csvVars}/>}
    </div>
  );
}

// ─── Máquinas ─────────────────────────────────────────────────────────────────
function MachinesTab({ machines, csvCount }){
  const [confirmDelete, setConfirmDelete] = useState(null); // machine id to confirm
  const [list, setList] = useState(null); // local override after delete

  const displayed    = list ?? machines;
  const csvMachines  = displayed.filter(m => m.hasCSV).length;
  const subtitle     = csvCount > 0
    ? `${displayed.length} activos · ${csvMachines} con datos CSV`
    : `${displayed.length} activos registrados`;

  const handleDelete = (id) => {
    setList((displayed).filter(m => m.id !== id));
    setConfirmDelete(null);
  };

  return (
    <>
      {/* Confirmation modal */}
      {confirmDelete && (() => {
        const m = displayed.find(x => x.id === confirmDelete);
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center"
               style={{background:'rgba(6,8,15,0.75)', backdropFilter:'blur(4px)'}}>
            <div className="panel rounded-xl p-6 w-80 border border-crit-400/30 shadow-glowCrit">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded grid place-items-center bg-crit-400/15 text-crit-400">
                  {I.alert}
                </div>
                <div>
                  <div className="text-white font-semibold">Eliminar máquina</div>
                  <div className="text-[11px] text-slate-400">Esta acción no se puede deshacer</div>
                </div>
              </div>
              <div className="panel rounded-md px-3 py-2 mb-4">
                <div className="num text-cyan2-400 text-sm">{m?.id}</div>
                <div className="text-slate-300 text-xs">{m?.name} · {m?.line}</div>
              </div>
              <div className="flex gap-2">
                <button onClick={() => setConfirmDelete(null)}
                        className="flex-1 px-3 py-2 text-xs rounded panel hairline text-slate-300 hover:text-white transition">
                  Cancelar
                </button>
                <button onClick={() => handleDelete(confirmDelete)}
                        className="flex-1 px-3 py-2 text-xs rounded bg-crit-400/15 border border-crit-400/40 text-crit-400 font-semibold hover:bg-crit-400/25 transition">
                  Sí, eliminar
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      <Card title="Catálogo de máquinas" subtitle={subtitle} accent="cyan"
        action={<button className="px-3 py-1.5 text-xs rounded bg-cyan2-400/15 border border-cyan2-400/40 text-cyan2-400 flex items-center gap-1">{I.plus} Añadir</button>}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-[10px] tracking-widest uppercase text-slate-500">
              <tr className="hairline-bottom">
                <th className="text-left py-2">ID</th>
                <th className="text-left">Nombre</th>
                <th className="text-left">Línea</th>
                <th className="text-left">Tipo</th>
                <th className="text-left">Temp (último)</th>
                <th className="text-left">OEE</th>
                <th className="text-left">Vibración</th>
                <th className="text-left">Estado</th>
                <th className="text-left">Datos</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {displayed.map(m => (
                <tr key={m.id} className="hairline-bottom hover:bg-white/[0.02]">
                  <td className="py-2 num text-cyan2-400">{m.id}</td>
                  <td className="text-white">{m.name}</td>
                  <td className="text-slate-300">{m.line}</td>
                  <td className="text-slate-400">{m.id.split('-')[0]}</td>
                  <td className="num text-slate-300">{(m.temp||0).toFixed(1)}°C</td>
                  <td className="num text-slate-300">{m.oee ? `${m.oee.toFixed(1)}%` : '—'}</td>
                  <td className="num text-slate-300">{m.vib ? `${m.vib.toFixed(3)}g` : '—'}</td>
                  <td><Chip color={m.status==='CRITICAL'?'red':(m.status==='WARN'?'amber':(m.status==='RUNNING'?'green':'slate'))}>{m.status}</Chip></td>
                  <td>
                    {m.hasCSV
                      ? <span className="text-[10px] px-1.5 py-0.5 rounded bg-grind-400/15 text-grind-400 border border-grind-400/25 num">{m.rows}r·{m.cols}v</span>
                      : <span className="text-[10px] text-slate-600">backend</span>}
                  </td>
                  <td className="text-right">
                    <button onClick={() => setConfirmDelete(m.id)}
                            className="text-slate-500 hover:text-crit-400 transition"
                            title="Eliminar máquina">
                      {I.x}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {csvCount === 0 && (
          <div className="mt-3 px-3 py-2 rounded border border-slate-700 text-[11px] text-slate-500">
            Subí un CSV en Dashboard para una máquina — sus valores reales aparecerán aquí automáticamente.
          </div>
        )}
      </Card>
    </>
  );
}

// ─── Límites SPC ──────────────────────────────────────────────────────────────
function SPCTab({ csvLimits }){
  const displayLimits = csvLimits.length ? csvLimits : FALLBACK_SPC_LIMITS;
  const isCSV         = csvLimits.length > 0;

  return (
    <Card title="Límites de control"
          subtitle={isCSV ? `Calculados del CSV · ${displayLimits.length} características` : 'Demo · valores estáticos'}
          accent="cyan"
          action={isCSV && <span className="text-[9px] px-2 py-0.5 rounded border bg-grind-400/10 text-grind-400 border-grind-400/25">CSV real</span>}>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-[10px] tracking-widest uppercase text-slate-500">
            <tr className="hairline-bottom">
              {isCSV && <th className="text-left py-2">Máquina</th>}
              <th className="text-left py-2">Característica</th>
              <th className="text-left">Media (μ)</th>
              <th className="text-left">LES (USL)</th>
              <th className="text-left">LEI (LSL)</th>
              <th className="text-left">LCS (UCL)</th>
              <th className="text-left">LCI (LCL)</th>
              <th className="text-left">Cp</th>
              <th className="text-left">Cpk</th>
              {isCSV && <th className="text-left">N</th>}
            </tr>
          </thead>
          <tbody>
            {displayLimits.map(r => {
              const cpVal   = parseFloat(r.cp);
              const cpColor = cpVal >= 1.33 ? '#10B981' : cpVal >= 1.0 ? '#F59E0B' : '#EF4444';
              return (
                <tr key={r.id} className="hairline-bottom hover:bg-white/[0.02]">
                  {isCSV && <td className="py-2 num text-[11px] text-cyan2-400">{r.machine}</td>}
                  <td className="py-2 text-white text-xs">
                    {r.char || r.n}
                    {r.unit && r.unit !== '—' && <span className="text-slate-500 ml-1">[{r.unit}]</span>}
                  </td>
                  <td className="num text-cyan2-400">{r.target ?? r.t}</td>
                  <td className="num text-warn-400">{r.usl}</td>
                  <td className="num text-warn-400">{r.lsl}</td>
                  <td className="num text-crit-400">{r.ucl}</td>
                  <td className="num text-crit-400">{r.lcl}</td>
                  <td className="num" style={{color:cpColor}}>{r.cp}</td>
                  <td className="num" style={{color:cpColor}}>{r.cpk ?? '—'}</td>
                  {isCSV && <td className="num text-[11px] text-slate-500">{r.n}</td>}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {!isCSV && (
        <div className="mt-3 px-3 py-2 rounded border border-slate-700 text-[11px] text-slate-500">
          Subí un CSV en Dashboard para ver los límites estadísticos reales calculados de los datos.
        </div>
      )}
    </Card>
  );
}

// ─── Usuarios ─────────────────────────────────────────────────────────────────
const ROLES = ['Plant Engineer','Quality Lead','Maintenance','Operator','Administrator','Service Account'];
const ACCESS_OPTS = ['Total','Quality','Mantto','Operación','Solo lectura'];

function UsersTab({ users, onInvite, onDelete }){
  const [modal,    setModal]    = useState(false);
  const [sending,  setSending]  = useState(false);
  const [sent,     setSent]     = useState(false);
  const [form,     setForm]     = useState({ name:'', email:'', role:'Operator', access:'Operación' });
  const [formErr,  setFormErr]  = useState('');

  const openModal  = () => { setForm({ name:'', email:'', role:'Operator', access:'Operación' }); setFormErr(''); setSent(false); setModal(true); };
  const closeModal = () => { setModal(false); setSent(false); };

  const handleSend = async () => {
    if (!form.name.trim())  return setFormErr('El nombre es requerido.');
    if (!form.email.trim()) return setFormErr('El email es requerido.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) return setFormErr('Email inválido.');
    setFormErr('');
    setSending(true);
    try {
      await onInvite(form);
      setSent(true);
    } catch (e) {
      setFormErr(e?.message || 'No se pudo enviar la invitación. Verificá que el backend esté corriendo.');
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      {/* Invite modal */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center"
             style={{background:'rgba(6,8,15,0.78)', backdropFilter:'blur(4px)'}}>
          <div className="panel rounded-xl p-6 w-96 border border-cyan2-400/25" style={{boxShadow:'0 0 40px rgba(34,211,238,0.15)'}}>
            {sent ? (
              <div className="text-center py-4">
                <div className="w-14 h-14 rounded-full bg-grind-400/15 grid place-items-center mx-auto mb-4">
                  <span className="text-grind-400 text-2xl">{I.check}</span>
                </div>
                <div className="text-white font-semibold text-lg">¡Invitación enviada!</div>
                <div className="text-slate-400 text-sm mt-2">
                  Se envió un email a <span className="text-cyan2-400">{form.email}</span> con un enlace para crear su contraseña.
                </div>
                <button onClick={closeModal}
                        className="mt-5 px-5 py-2 text-xs rounded bg-cyan2-400/15 border border-cyan2-400/40 text-cyan2-400">
                  Cerrar
                </button>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between mb-5">
                  <div>
                    <div className="text-[10px] tracking-[0.25em] uppercase text-cyan2-400">// INVITAR USUARIO</div>
                    <div className="text-white font-semibold mt-0.5">Nuevo acceso al sistema</div>
                  </div>
                  <button onClick={closeModal} className="text-slate-500 hover:text-white">{I.x}</button>
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="text-[10px] tracking-widest uppercase text-slate-500">Nombre completo</label>
                    <input value={form.name} onChange={e => setForm(f => ({...f, name: e.target.value}))}
                           placeholder="Ana García"
                           className="w-full mt-1 panel rounded-md px-3 py-2 text-sm text-white outline-none border border-transparent focus:border-cyan2-400/40 transition"/>
                  </div>
                  <div>
                    <label className="text-[10px] tracking-widest uppercase text-slate-500">Email</label>
                    <input value={form.email} onChange={e => setForm(f => ({...f, email: e.target.value}))}
                           placeholder="ana@empresa.com" type="email"
                           className="w-full mt-1 panel rounded-md px-3 py-2 text-sm text-white outline-none border border-transparent focus:border-cyan2-400/40 transition"/>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[10px] tracking-widest uppercase text-slate-500">Rol</label>
                      <select value={form.role} onChange={e => setForm(f => ({...f, role: e.target.value}))}
                              className="w-full mt-1 panel rounded-md px-3 py-2 text-sm text-white outline-none border border-transparent focus:border-cyan2-400/40 bg-transparent">
                        {ROLES.map(r => <option key={r} value={r} className="bg-slate-900">{r}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-[10px] tracking-widest uppercase text-slate-500">Acceso</label>
                      <select value={form.access} onChange={e => setForm(f => ({...f, access: e.target.value}))}
                              className="w-full mt-1 panel rounded-md px-3 py-2 text-sm text-white outline-none border border-transparent focus:border-cyan2-400/40 bg-transparent">
                        {ACCESS_OPTS.map(a => <option key={a} value={a} className="bg-slate-900">{a}</option>)}
                      </select>
                    </div>
                  </div>

                  {formErr && (
                    <div className="rounded-md px-3 py-2 text-xs text-crit-400 bg-crit-400/10 border border-crit-400/30">{formErr}</div>
                  )}
                </div>

                <div className="flex gap-2 mt-5">
                  <button onClick={closeModal}
                          className="flex-1 px-3 py-2 text-xs rounded panel hairline text-slate-300 hover:text-white transition">
                    Cancelar
                  </button>
                  <button onClick={handleSend} disabled={sending}
                          className="flex-1 px-3 py-2 text-xs rounded bg-cyan2-400/15 border border-cyan2-400/40 text-cyan2-400 font-semibold hover:bg-cyan2-400/25 transition disabled:opacity-50 flex items-center justify-center gap-2">
                    {sending
                      ? <><span className="w-3 h-3 border-2 border-cyan2-400 border-t-transparent rounded-full animate-spin"/> Enviando…</>
                      : <>{I.send} Enviar invitación</>}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      <Card title="Usuarios y roles"
            subtitle={users.length ? `${users.length} cuenta${users.length !== 1 ? 's' : ''} activa${users.length !== 1 ? 's' : ''}` : 'Sin usuarios registrados'}
            accent="cyan"
            action={<button onClick={openModal} className="px-3 py-1.5 text-xs rounded bg-cyan2-400/15 border border-cyan2-400/40 text-cyan2-400 flex items-center gap-1">{I.plus} Invitar</button>}>

        {users.length === 0 ? (
          <div className="py-12 text-center">
            <div className="w-12 h-12 rounded-full bg-slate-800 grid place-items-center mx-auto mb-3 text-slate-600">
              {I.user}
            </div>
            <div className="text-slate-400 text-sm">No hay usuarios aún</div>
            <div className="text-slate-600 text-xs mt-1">Usá el botón <span className="text-cyan2-400">+ Invitar</span> para agregar personas al sistema</div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-[10px] tracking-widest uppercase text-slate-500">
                <tr className="hairline-bottom">
                  <th className="text-left py-2">Usuario</th>
                  <th className="text-left">Rol</th>
                  <th className="text-left">Email</th>
                  <th className="text-left">Acceso</th>
                  <th className="text-left">Estado</th>
                  <th className="text-left">Último login</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {users.map(u => (
                  <tr key={u.id} className="hairline-bottom hover:bg-white/[0.02]">
                    <td className="py-2.5">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded grid place-items-center text-xs text-white font-semibold"
                             style={{background:'linear-gradient(135deg,#22D3EE,#A855F7)'}}>
                          {u.avatar || (u.name||'').slice(0,2).toUpperCase()}
                        </div>
                        <span className="text-white">{u.name}</span>
                      </div>
                    </td>
                    <td><Chip color={u.role==='Service Account'?'ai':'slate'}>{u.role}</Chip></td>
                    <td className="num text-xs text-slate-400">{u.email}</td>
                    <td className="text-slate-300">{u.access}</td>
                    <td>
                      {u.invited
                        ? <span className="text-[10px] px-1.5 py-0.5 rounded bg-warn-400/10 text-warn-400 border border-warn-400/20">pendiente</span>
                        : <span className="text-[10px] px-1.5 py-0.5 rounded bg-grind-400/10 text-grind-400 border border-grind-400/20">activo</span>}
                    </td>
                    <td className="num text-xs text-slate-400">{u.lastLogin}</td>
                    <td className="text-right">
                      <button onClick={() => onDelete(u.id).catch(()=>{})} className="text-slate-500 hover:text-crit-400">{I.x}</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}

// ─── Variables ────────────────────────────────────────────────────────────────
function VariablesTab({ csvVars }){
  const vars = csvVars.length ? csvVars : FALLBACK_VARS;
  const isCSV = csvVars.length > 0;

  return (
    <Card title="Variables de proceso"
          subtitle={isCSV ? `${vars.length} variables detectadas del CSV` : 'Catálogo estático · demo'}
          accent="cyan">
      {!isCSV && (
        <div className="mb-3 px-3 py-2 rounded border border-slate-700 text-[11px] text-slate-500">
          Subí un CSV en Dashboard para ver las variables reales con sus rangos calculados.
        </div>
      )}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
        {vars.map((v, i) => (
          <div key={i} className="panel rounded p-3">
            <div className="flex items-center justify-between">
              <span className="w-1.5 h-1.5 rounded-full" style={{background:v.c, boxShadow:`0 0 6px ${v.c}`}}/>
              {isCSV
                ? <span className="text-[9px] px-1 rounded bg-grind-400/10 text-grind-400 border border-grind-400/20">{v.machine}</span>
                : <span className="text-[10px] num text-slate-500">[{v.r}] {v.u}</span>
              }
            </div>
            <div className="num text-sm text-white mt-2">{v.n}</div>
            {isCSV ? (
              <div className="grid grid-cols-3 gap-1 mt-1.5 text-[9px] num">
                <div className="text-slate-500">min<br/><span className="text-slate-300">{v.min}</span></div>
                <div className="text-slate-500">μ<br/><span className="text-cyan2-400">{v.mean}</span></div>
                <div className="text-slate-500">max<br/><span className="text-slate-300">{v.max}</span></div>
              </div>
            ) : (
              <div className="text-[10px] text-slate-500 num">rango: {v.r} {v.u}</div>
            )}
            <div className="text-[9px] text-slate-600 num mt-1">{v.tag}</div>
          </div>
        ))}
      </div>
    </Card>
  );
}

// ─── Fallbacks ────────────────────────────────────────────────────────────────
const FALLBACK_SPC_LIMITS = [
  {id:'sl1', char:'Diámetro inyector', target:'12.500', usl:'12.650', lsl:'12.350', ucl:'12.620', lcl:'12.380', cp:'1.33', cpk:'1.28'},
  {id:'sl2', char:'Espesor pared',     target:'2.400',  usl:'2.480',  lsl:'2.320',  ucl:'2.470',  lcl:'2.330',  cp:'1.33', cpk:'1.25'},
  {id:'sl3', char:'Peso pieza',        target:'48.000', usl:'48.600', lsl:'47.400', ucl:'48.500', lcl:'47.500', cp:'1.50', cpk:'1.45'},
  {id:'sl4', char:'Temperatura cura',  target:'214.0',  usl:'220.0',  lsl:'208.0',  ucl:'219.0',  lcl:'209.0',  cp:'1.33', cpk:'1.20'},
  {id:'sl5', char:'Densidad',          target:'1.180',  usl:'1.220',  lsl:'1.140',  ucl:'1.210',  lcl:'1.150',  cp:'1.50', cpk:'1.42'},
];

const FALLBACK_VARS = [
  {n:'temperatura', c:'#F59E0B', u:'°C',   r:'0–300',   tag:'io.sensors.temperatura'},
  {n:'presion',     c:'#3B82F6', u:'bar',  r:'0–200',   tag:'io.sensors.presion'},
  {n:'vibracion',   c:'#EF4444', u:'g',    r:'0–2.0',   tag:'io.sensors.vibracion'},
  {n:'flujo',       c:'#22D3EE', u:'L/m',  r:'0–100',   tag:'io.sensors.flujo'},
  {n:'torque',      c:'#A855F7', u:'N·m',  r:'0–400',   tag:'io.sensors.torque'},
  {n:'humedad',     c:'#3B82F6', u:'%',    r:'0–100',   tag:'io.sensors.humedad'},
  {n:'acustica',    c:'#22D3EE', u:'dB',   r:'30–110',  tag:'io.sensors.acustica'},
  {n:'velocidad',   c:'#10B981', u:'rpm',  r:'0–12000', tag:'io.sensors.velocidad'},
];
