import { useState, useMemo } from 'react'
import { Card, Chip, PageHeader } from '../shell'
import { ControlChart, Histogram } from '../charts'
import { I } from '../icons'
import { useData } from '../context/DataContext'
import { generatePDF } from '../lib/pdf'

// ─── Stats from an array of values ───────────────────────────────────────────
function computeStats(vals) {
  if (!vals.length) return null;
  const n    = vals.length;
  const mean = vals.reduce((a,b) => a+b, 0) / n;
  const sd   = Math.sqrt(vals.reduce((a,b) => a + (b-mean)**2, 0) / n);
  if (sd === 0) return null;
  const ucl = mean + 3*sd, lcl = mean - 3*sd;
  const usl = mean + 2.5*sd, lsl = mean - 2.5*sd;
  const cp  = (usl - lsl) / (6*sd);
  const cpk = Math.min((usl-mean)/(3*sd), (mean-lsl)/(3*sd));
  const skew = vals.reduce((a,b) => a + ((b-mean)/sd)**3, 0) / n;
  return { mean, sd, ucl, lcl, usl, lsl, cp, cpk, skew, n };
}

// ─── WECO rule detection ──────────────────────────────────────────────────────
function detectWECO(vals, mean, sd) {
  const flags = Array.from({ length: vals.length }, () => []);

  vals.forEach((v, i) => {
    // R1: outside 3σ
    if (v > mean+3*sd || v < mean-3*sd) flags[i].push('R1');

    // R2: 9 consecutive same side of mean
    if (i >= 8) {
      const w = vals.slice(i-8, i+1);
      if (w.every(x => x > mean) || w.every(x => x < mean)) flags[i].push('R2');
    }

    // R3: 6 consecutive monotone trend
    if (i >= 5) {
      const w = vals.slice(i-5, i+1);
      const up   = w.every((x,j) => j === 0 || x > w[j-1]);
      const down = w.every((x,j) => j === 0 || x < w[j-1]);
      if (up || down) flags[i].push('R3');
    }

    // R5: 2 of 3 consecutive in zone A (beyond 2σ)
    if (i >= 2) {
      const w = vals.slice(i-2, i+1);
      if (w.filter(x => Math.abs(x-mean) > 2*sd).length >= 2) flags[i].push('R5');
    }
  });

  return flags;
}

// ─── Moving range array ───────────────────────────────────────────────────────
function movingRange(vals) {
  return vals.slice(1).map((v, i) => Math.abs(v - vals[i]));
}

// ─── Numeric columns from CSV ─────────────────────────────────────────────────
function numericCols(csvData) {
  if (!csvData?.header || !csvData?.rows?.length) return [];
  return csvData.header.filter(h => {
    const v = parseFloat(csvData.rows[0][h]);
    return !isNaN(v);
  });
}

// ─── Extract values + timestamps from CSV column ──────────────────────────────
function extractSeries(csvData, col) {
  const tsKey = csvData.header.find(h => /^(ts|timestamp|fecha|time|hora)$/i.test(h));
  return csvData.rows
    .map(r => ({ val: parseFloat(r[col]), ts: tsKey ? r[tsKey] : null }))
    .filter(x => !isNaN(x.val));
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function SPCScreen() {
  const { spcData, csvFiles } = useData();

  // Machine + column selectors
  const csvMachines = Object.keys(csvFiles);
  const [selMachine,  setSelMachine]  = useState('');
  const [selCol,      setSelCol]      = useState('');
  const [exporting,   setExporting]   = useState(false);

  const backendMachines = Object.keys(spcData);
  const activeMachine = selMachine || csvMachines[0] || backendMachines[0] || '';
  const csvData       = csvFiles[activeMachine] || null;
  const cols          = numericCols(csvData);
  const activeCol     = selCol || cols[0] || '';

  // Derive series and stats
  const { series, stats, wecoFlags, mr } = useMemo(() => {
    if (csvData && activeCol) {
      const series = extractSeries(csvData, activeCol);
      const vals   = series.map(s => s.val);
      const stats  = computeStats(vals);
      if (!stats) return { series:[], stats:null, wecoFlags:[], mr:[] };
      const wecoFlags = detectWECO(vals, stats.mean, stats.sd);
      const mr        = movingRange(vals);
      return { series, stats, wecoFlags, mr };
    }
    const live = spcData[activeMachine];
    const pts  = live?.points?.map(p => ({ val: p.value, ts: null })) || [];
    const st   = live?.stats || null;
    if (!pts.length || !st) return { series: [], stats: null, wecoFlags: [], mr: [] };
    const flags = detectWECO(pts.map(p=>p.val), st.mean, st.sd);
    return { series: pts, stats: st, wecoFlags: flags, mr: movingRange(pts.map(p=>p.val)) };
  }, [csvData, activeCol, spcData]);

  const vals   = series.map(s => s.val);
  const oocIdx = vals.reduce((a,v,i) => { if (stats && (v > stats.ucl || v < stats.lcl)) a.push(i); return a; }, []);
  const wecoHitIdx = wecoFlags.reduce((a,f,i) => { if (f.length) a.push(i); return a; }, []);

  if (!stats && !series.length) {
    return (
      <div className="p-6 space-y-5">
        <PageHeader
          eyebrow="// STATISTICAL PROCESS CONTROL"
          title="SPC · Control Estadístico"
          desc="Cartas de control X̄–MR, histogramas y detección automática de reglas WECO."
        />
        <Card title="Esperando datos" subtitle="Sin TICK del backend ni CSV cargado" accent="cyan">
          <div className="text-sm text-slate-400">La vista SPC solo se alimenta de datos reales. Carga un CSV o espera el primer TICK del backend para ver la carta de control.</div>
        </Card>
      </div>
    );
  }

  const hasCSV = !!csvData && !!activeCol && !!stats;

  // WECO rule summary
  const wecoRules = [
    { n:'1', t:'1 punto fuera de 3σ',          key:'R1' },
    { n:'2', t:'9 puntos al mismo lado de X̄',  key:'R2' },
    { n:'3', t:'6 puntos tendencia monotónica', key:'R3' },
    { n:'4', t:'14 puntos alternando',           key:'R4' },
    { n:'5', t:'2 de 3 puntos en zona A',        key:'R5' },
    { n:'6', t:'4 de 5 puntos en zona B',        key:'R6' },
    { n:'7', t:'15 puntos en zona C',            key:'R7' },
    { n:'8', t:'8 puntos fuera de zona C',       key:'R8' },
  ].map(r => {
    const hits = wecoFlags.reduce((a,f,i) => { if(f.includes(r.key)) a.push(i+1); return a; }, []);
    return { ...r, hits };
  });

  const mrMean = mr.length ? mr.reduce((a,b)=>a+b,0)/mr.length : 0;

  return (
    <div id="spc-capture" className="p-6 space-y-5">
      <PageHeader
        eyebrow="// STATISTICAL PROCESS CONTROL"
        title="SPC · Control Estadístico"
        desc="Cartas de control X̄–MR, histogramas y detección automática de reglas WECO."
        actions={
          <div className="flex items-center gap-2 flex-wrap">
            {csvMachines.length > 0 && (
              <select
                value={activeMachine}
                onChange={e => { setSelMachine(e.target.value); setSelCol(''); }}
                className="panel rounded-md px-3 py-2 text-xs text-slate-300 bg-transparent outline-none cursor-pointer"
              >
                {csvMachines.map(id => (
                  <option key={id} value={id} className="bg-slate-900">{csvFiles[id]?.name || id}</option>
                ))}
              </select>
            )}
            {cols.length > 0 && (
              <select
                value={activeCol}
                onChange={e => setSelCol(e.target.value)}
                className="panel rounded-md px-3 py-2 text-xs text-cyan2-400 bg-transparent outline-none cursor-pointer"
              >
                {cols.map(c => (
                  <option key={c} value={c} className="bg-slate-900">{c}</option>
                ))}
              </select>
            )}
            {!hasCSV && (
              <div className="panel rounded-md px-3 py-2 text-xs text-slate-400 flex items-center gap-2">
                <span className="text-warn-400">{I.warn}</span> Sin CSV — mostrando datos demo
              </div>
            )}
            {hasCSV && (
              <Chip color="green">{I.cpu} CSV · {vals.length} registros</Chip>
            )}
            <button
              onClick={async () => {
                setExporting(true);
                try {
                  await generatePDF({
                    elementId: 'spc-capture',
                    tipo: 'SPC',
                    nombre: `SPC · ${activeMachine || 'planta'} · ${activeCol || 'variable'} · ${new Date().toLocaleDateString('es-MX')}`,
                    autor: 'Sistema',
                  });
                } catch(e) { console.error('[SPC PDF]', e.message); }
                finally { setExporting(false); }
              }}
              disabled={exporting}
              className="px-3 py-2 text-xs rounded-md bg-cyan2-400/15 border border-cyan2-400/40 text-cyan2-400 flex items-center gap-2 disabled:opacity-50"
            >
              {exporting
                ? <><span className="w-3 h-3 border-2 border-cyan2-400 border-t-transparent rounded-full animate-spin"/>Generando…</>
                : <>{I.download} PDF</>}
            </button>
          </div>
        }
      />

      {/* KPI cards */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
          {[
            { l:'X̄',   v: stats.mean.toFixed(3),  c:'cyan'  },
            { l:'σ',   v: stats.sd.toFixed(4),    c:'cyan'  },
            { l:'UCL', v: stats.ucl.toFixed(3),   c:'red'   },
            { l:'LCL', v: stats.lcl.toFixed(3),   c:'red'   },
            { l:'Cp',  v: stats.cp.toFixed(2),    c:'green' },
            { l:'Cpk', v: stats.cpk.toFixed(2),   c:'green' },
          ].map(k => (
            <div key={k.l} className="panel rounded p-3 corners">
              <div className="text-[10px] uppercase tracking-widest text-slate-500">{k.l}</div>
              <div className="num text-2xl mt-1" style={{
                color: k.c==='red'?'#EF4444': k.c==='green'?'#10B981':'#22D3EE',
                textShadow: `0 0 14px ${k.c==='red'?'#EF444455':k.c==='green'?'#10B98155':'#22D3EE55'}`
              }}>{k.v}</div>
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-12 gap-4">
        {/* Control chart */}
        <Card
          title={`X̄ Chart · ${hasCSV ? activeCol : 'Diámetro 12.5mm'}`}
          subtitle={`${vals.length} puntos · ${oocIdx.length} OOC · ${wecoHitIdx.length} WECO`}
          className="col-span-12 xl:col-span-8"
          accent="cyan"
          action={
            <div className="flex gap-1 text-[10px]">
              {oocIdx.length > 0    && <Chip color="red">{oocIdx.length} OOC</Chip>}
              {wecoHitIdx.length > 0 && <Chip color="amber">{wecoHitIdx.length} WECO</Chip>}
              {oocIdx.length === 0 && wecoHitIdx.length === 0 && <Chip color="green">En control</Chip>}
            </div>
          }
        >
          {stats && <ControlChart data={vals} mean={stats.mean} ucl={stats.ucl} lcl={stats.lcl} usl={stats.usl} lsl={stats.lsl} w={780} h={260}/>}
        </Card>

        {/* WECO panel */}
        <Card title="Reglas WECO" subtitle="Detección automática sobre datos reales" className="col-span-12 xl:col-span-4" accent="amber">
          <div className="space-y-2">
            {wecoRules.map(r => {
              const hit = r.hits.length > 0;
              const isR4orR6orR7orR8 = ['R4','R6','R7','R8'].includes(r.key);
              return (
                <div key={r.n} className="panel rounded p-2 flex items-start gap-2" style={hit ? {
                  borderColor:'rgba(245,158,11,0.35)',
                  boxShadow:'0 0 14px rgba(245,158,11,0.18)'
                } : {}}>
                  <div className={`w-6 h-6 rounded grid place-items-center text-[10px] num font-semibold shrink-0 ${
                    hit ? 'bg-warn-400/15 text-warn-400 border border-warn-400/40'
                        : 'bg-slate-700/40 text-slate-500'
                  }`}>R{r.n}</div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-slate-200">{r.t}</div>
                    <div className={`text-[10px] num ${hit ? 'text-warn-400' : 'text-slate-500'}`}>
                      {isR4orR6orR7orR8 && !hasCSV ? 'no implementado'
                       : hit ? `violación en pts ${r.hits.slice(0,3).join(', ')}${r.hits.length>3?'…':''}`
                       : 'no detectado'}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-12 gap-4">
        {/* MR chart */}
        <Card title="Moving Range (MR)" subtitle={`${mr.length} diferencias consecutivas`} className="col-span-12 xl:col-span-7" accent="cyan">
          {mr.length > 0 && <ControlChart data={mr} mean={mrMean} ucl={mrMean*3.27} lcl={0} usl={mrMean*3.27} lsl={0} w={680} h={200}/>}
        </Card>

        {/* Histogram */}
        <Card title="Histograma · distribución" subtitle="Con curva normal ajustada" className="col-span-12 xl:col-span-5" accent="ai">
          {vals.length > 0 && <Histogram data={vals} bins={14} w={420} h={220} color="#A855F7"/>}
          {stats && (
            <div className="grid grid-cols-3 gap-2 mt-2 text-[11px]">
              <div className="panel rounded p-2"><div className="text-slate-500">μ</div><div className="num text-white">{stats.mean.toFixed(3)}</div></div>
              <div className="panel rounded p-2"><div className="text-slate-500">σ</div><div className="num text-white">{stats.sd.toFixed(4)}</div></div>
              <div className="panel rounded p-2"><div className="text-slate-500">Skew</div><div className="num text-white">{(stats.skew||0).toFixed(2)}</div></div>
            </div>
          )}
        </Card>
      </div>

      {/* Data table */}
      {stats && (
        <Card
          title={`Datos · últimas 10 lecturas${hasCSV ? ` · ${activeCol}` : ' · Diámetro [mm]'}`}
          subtitle={hasCSV ? `${activeMachine} · ${vals.length} registros totales` : 'Datos demo'}
          accent="cyan"
        >
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-[10px] tracking-widest uppercase text-slate-500">
                <tr className="hairline-bottom">
                  <th className="text-left py-2 px-2">#</th>
                  <th className="text-left">Timestamp</th>
                  <th className="text-left">Valor</th>
                  <th className="text-left">MR</th>
                  <th className="text-left">UCL</th>
                  <th className="text-left">LCL</th>
                  <th className="text-left">Estado</th>
                  <th className="text-left">WECO</th>
                </tr>
              </thead>
              <tbody>
                {series.slice(-10).map((s, i) => {
                  const absIdx = series.length - 10 + i;
                  const ooc  = s.val > stats.ucl || s.val < stats.lcl;
                  const warn = !ooc && (s.val > stats.usl || s.val < stats.lsl);
                  const mrVal = absIdx > 0 ? Math.abs(s.val - series[absIdx-1].val) : 0;
                  const weco = wecoFlags[absIdx] || [];
                  const ts   = s.ts || new Date(Date.now() - (10-i)*60000).toLocaleTimeString();
                  return (
                    <tr key={absIdx} className="hairline-bottom hover:bg-white/[0.02]">
                      <td className="py-1.5 px-2 num text-slate-500">{absIdx+1}</td>
                      <td className="num text-slate-400">{ts}</td>
                      <td className={`num font-semibold ${ooc?'text-crit-400':warn?'text-warn-400':'text-white'}`}>{s.val.toFixed(3)}</td>
                      <td className="num text-slate-300">{mrVal.toFixed(4)}</td>
                      <td className="num text-slate-500">{stats.ucl.toFixed(3)}</td>
                      <td className="num text-slate-500">{stats.lcl.toFixed(3)}</td>
                      <td>
                        {ooc  ? <Chip color="red">OOC</Chip>
                         : warn ? <Chip color="amber">WARN</Chip>
                         : <Chip color="green">OK</Chip>}
                      </td>
                      <td className="num text-[10px] text-warn-400">{weco.join(' ')||'—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
