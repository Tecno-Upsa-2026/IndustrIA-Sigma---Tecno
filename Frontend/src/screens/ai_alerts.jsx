import { useState, useEffect, useRef } from 'react'
import { Card, Chip, Stat, PageHeader } from '../shell'
import { SparkLine } from '../charts'
import { I } from '../icons'
import { useData } from '../context/DataContext'
import { supabase } from '../lib/supabase'

// ─── Pearson correlation ──────────────────────────────────────────────────────
function pearsonCorr(xs, ys) {
  const n = Math.min(xs.length, ys.length);
  if (n < 3) return 0;
  const mx = xs.slice(0,n).reduce((a,b)=>a+b,0)/n;
  const my = ys.slice(0,n).reduce((a,b)=>a+b,0)/n;
  const num = xs.slice(0,n).reduce((acc,x,i) => acc+(x-mx)*(ys[i]-my), 0);
  const da  = Math.sqrt(xs.slice(0,n).reduce((acc,x) => acc+(x-mx)**2, 0));
  const db  = Math.sqrt(ys.slice(0,n).reduce((acc,y) => acc+(y-my)**2, 0));
  return da && db ? num/(da*db) : 0;
}

// ─── Detect statistical anomalies from a CSV file ────────────────────────────
function detectCSVAlerts(csvData, machineId) {
  if (!csvData?.rows?.length || csvData.rows.length < 5) return [];
  const { header, rows } = csvData;
  const source = machineId || csvData.name?.replace(/\.\w+$/, '') || 'CSV';

  const numCols = header.filter(h =>
    h.toLowerCase() !== 'fecha_hora' && !isNaN(parseFloat(rows[0]?.[h]))
  );

  const alerts = [];
  let seq = 1000;
  const now = new Date().toLocaleTimeString('es-MX', { hour:'2-digit', minute:'2-digit', second:'2-digit' });

  numCols.forEach(col => {
    const vals = rows.map(r => parseFloat(r[col])).filter(v => !isNaN(v));
    if (vals.length < 5) return;

    const mean = vals.reduce((a,b) => a+b, 0) / vals.length;
    const sd   = Math.sqrt(vals.reduce((a,b) => a+(b-mean)**2, 0) / vals.length);
    if (sd < 1e-9) return;

    const ucl  = mean + 3*sd;
    const lcl  = mean - 3*sd;
    const wh   = mean + 2*sd;
    const wl   = mean - 2*sd;
    const last = vals[vals.length - 1];
    const label = col.replace(/_/g, ' ');
    const sigmas = ((last - mean) / sd).toFixed(1);

    const base = { machine: source, col, vals, mean, sd, ucl, lcl, time: now };

    // ── OOC: outside ±3σ (CRITICAL) ──────────────────────────────────────────
    if (last > ucl) {
      alerts.push({ ...base, id:`CSV-${seq++}`, sev:'CRITICAL',
        title: `${label} — límite superior excedido`,
        detail: `Último ${last.toFixed(3)} > LCS ${ucl.toFixed(3)} (${sigmas}σ sobre media).`,
        ai: `Acción inmediata — ${label} = ${last.toFixed(3)} supera LCS en ${(last-ucl).toFixed(3)} unidades.\n• Verificar causa asignable: desgaste, cambio de lote o falla de actuador.\n• Si el valor continúa subiendo, detener proceso.\n• MTTR estimado: 15–25 min con técnico asignado.\n• Costo evitable estimado: 8–12 % en defectos si se actúa en < 2 h.`
      });
    } else if (last < lcl) {
      alerts.push({ ...base, id:`CSV-${seq++}`, sev:'CRITICAL',
        title: `${label} — límite inferior excedido`,
        detail: `Último ${last.toFixed(3)} < LCI ${lcl.toFixed(3)} (${Math.abs(sigmas)}σ bajo media).`,
        ai: `Acción inmediata — caída crítica en ${label}.\n• Verificar falla de sensor, pérdida de presión o cambio de material.\n• Detener y tomar muestra de verificación.\n• Escalar a ingeniería si persiste > 5 min.`
      });
    }
    // ── Warning zone ±2σ–3σ (HIGH) ───────────────────────────────────────────
    else if (last > wh) {
      alerts.push({ ...base, id:`CSV-${seq++}`, sev:'HIGH',
        title: `${label} en zona de advertencia alta`,
        detail: `Valor ${last.toFixed(3)} entre +2σ y +3σ (${sigmas}σ).`,
        ai: `Monitoreo urgente — ${label} en zona alta.\n• Ajustar setpoint o verificar condición de equipo.\n• Próxima muestra en 5–10 min.\n• Si alcanza LCS = ${ucl.toFixed(3)}, escalar de inmediato.`
      });
    } else if (last < wl) {
      alerts.push({ ...base, id:`CSV-${seq++}`, sev:'HIGH',
        title: `${label} en zona de advertencia baja`,
        detail: `Valor ${last.toFixed(3)} entre -2σ y -3σ (${sigmas}σ).`,
        ai: `Monitoreo urgente — ${label} en zona baja.\n• Verificar parámetros de proceso.\n• Tomar acción correctiva si la tendencia continúa.`
      });
    }

    // ── WECO R2: 7 puntos consecutivos del mismo lado de la media ────────────
    if (vals.length >= 7) {
      const last7   = vals.slice(-7);
      const allAbove = last7.every(v => v > mean);
      const allBelow = last7.every(v => v < mean);
      if ((allAbove || allBelow) && !alerts.find(a => a.col === col && (a.sev === 'CRITICAL' || a.sev === 'HIGH'))) {
        alerts.push({ ...base, id:`CSV-${seq++}`, sev:'HIGH',
          title: `Deriva en ${label} — WECO Regla 2`,
          detail: `7 puntos consecutivos ${allAbove?'sobre':'bajo'} la media (${mean.toFixed(3)}).`,
          ai: `Deriva sistemática en ${label} (WECO R2).\n• Causa especial probable: ajuste de operario, desgaste progresivo o cambio de proveedor.\n• Aplicar análisis de cambio de proceso.\n• Revisar últimas acciones de mantenimiento en bitácora.`
        });
      }
    }

    // ── WECO R3: 6 puntos consecutivos en tendencia ───────────────────────────
    if (vals.length >= 6 && !alerts.find(a => a.col === col)) {
      const last6 = vals.slice(-6);
      const asc  = last6.every((v,i) => i===0 || v > last6[i-1]);
      const desc = last6.every((v,i) => i===0 || v < last6[i-1]);
      if (asc || desc) {
        alerts.push({ ...base, id:`CSV-${seq++}`, sev:'MEDIUM',
          title: `Tendencia ${asc?'creciente':'decreciente'} en ${label}`,
          detail: `6 puntos consecutivos ${asc?'ascendentes':'descendentes'}. Regla WECO 3.`,
          ai: `Tendencia ${asc?'ascendente':'descendente'} en ${label} (WECO R3).\n• Investigar causa especial antes de que alcance la zona de control.\n• Verificar programa de mantenimiento preventivo.`
        });
      }
    }
  });

  const order = { CRITICAL:0, HIGH:1, MEDIUM:2, LOW:3 };
  return alerts.sort((a,b) => order[a.sev] - order[b.sev]);
}

// ─── Real correlations between CSV columns ────────────────────────────────────
function computeCorrelations(csvData, targetCol) {
  if (!csvData?.rows?.length || !targetCol) return null;
  const { header, rows } = csvData;
  const targetVals = rows.map(r => parseFloat(r[targetCol])).filter(v => !isNaN(v));
  const palette = ['#F59E0B','#3B82F6','#22D3EE','#A855F7'];

  return header
    .filter(h => h !== targetCol && h.toLowerCase() !== 'fecha_hora' && !isNaN(parseFloat(rows[0]?.[h])))
    .map(col => {
      const vals = rows.map(r => parseFloat(r[col])).filter(v => !isNaN(v));
      return { l: col.replace(/_/g,' '), c: pearsonCorr(vals, targetVals) };
    })
    .filter(x => Math.abs(x.c) > 0.02)
    .sort((a,b) => Math.abs(b.c) - Math.abs(a.c))
    .slice(0, 4)
    .map((x, i) => ({ ...x, col: palette[i] || '#64748B' }));
}

// ─── Compute OOC rate across all numeric columns ──────────────────────────────
function computeOOCStats(csvData) {
  if (!csvData?.rows?.length) return null;
  const { header, rows } = csvData;
  const numCols = header.filter(h =>
    h.toLowerCase() !== 'fecha_hora' && !isNaN(parseFloat(rows[0]?.[h]))
  );
  let total = 0, ooc = 0;
  numCols.forEach(col => {
    const vals = rows.map(r => parseFloat(r[col])).filter(v => !isNaN(v));
    if (vals.length < 5) return;
    const mean = vals.reduce((a,b)=>a+b,0)/vals.length;
    const sd   = Math.sqrt(vals.reduce((a,b)=>a+(b-mean)**2,0)/vals.length);
    const ucl = mean+3*sd, lcl = mean-3*sd;
    total += vals.length;
    ooc   += vals.filter(v => v > ucl || v < lcl).length;
  });
  return total > 0 ? { total, ooc, rate: (ooc/total*100) } : null;
}

// ─── Map any alert (backend or CSV) to its best CSV column ───────────────────
const ALERT_KW = [
  { patterns: ['temperatura','temp','°c','sobrecalent'], cols: ['temperatura','temp'] },
  { patterns: ['vibr','vib','desbal'], cols: ['vibracion','vib'] },
  { patterns: ['presi','hydraul'],    cols: ['presion','pressure','presion_bar'] },
  { patterns: ['cp','cpk','capabil'], cols: ['diametro','diameter','medida','dim'] },
  { patterns: ['rpm','velocidad'],    cols: ['rpm','velocidad'] },
  { patterns: ['humedad'],            cols: ['humedad','hr'] },
  { patterns: ['oee','ciclo'],        cols: ['oee','ciclo'] },
  { patterns: ['carga','load'],       cols: ['carga','load'] },
];

function matchAlertToColumn(alert, csvData) {
  if (!alert || !csvData?.header) return null;
  const text = `${alert.title} ${alert.detail || ''}`.toLowerCase();
  const numCols = csvData.header.filter(h =>
    h.toLowerCase() !== 'fecha_hora' && !isNaN(parseFloat(csvData.rows[0]?.[h]))
  );
  for (const { patterns, cols } of ALERT_KW) {
    if (patterns.some(p => text.includes(p))) {
      const hit = numCols.find(c => cols.some(k => c.toLowerCase().includes(k)));
      if (hit) return hit;
    }
  }
  return numCols[0] || null;
}

// ─── CSV context for the AI chat ─────────────────────────────────────────────
function buildCsvContext(data) {
  if (!data) return null;
  const { header, rows, name } = data;
  const numCols = header.filter(h => !isNaN(parseFloat(rows[0]?.[h])));
  const stats = numCols.map(col => {
    const vals = rows.map(r => parseFloat(r[col])).filter(v => !isNaN(v));
    if (!vals.length) return null;
    const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
    return `${col}: min=${Math.min(...vals).toFixed(2)}, max=${Math.max(...vals).toFixed(2)}, media=${mean.toFixed(2)}, último=${vals[vals.length-1].toFixed(2)}`;
  }).filter(Boolean).join('\n');
  const lastRows = rows.slice(-30);
  const csvText  = [header.join(','), ...lastRows.map(r => header.map(h => r[h]).join(','))].join('\n');
  return `Archivo: ${name} (${rows.length} registros)\nEstadísticas:\n${stats}\n\nÚltimas ${lastRows.length} filas:\n${csvText}`;
}

export default function AIAlertsScreen() {
  const { alerts: liveAlerts, csvFiles, activeCsvId, machineHistory, csvDiagnostics, recommendations, actions } = useData();

  const hasBackend = liveAlerts.length > 0;
  const hasCSV     = !!csvFiles[activeCsvId] || Object.keys(csvFiles).length > 0;
  const active     = liveAlerts.filter(a => a.status !== 'closed');

  const activeCSV = csvFiles[activeCsvId] || Object.values(csvFiles)[0] || null;
  const activeDiagnostics = activeCsvId ? csvDiagnostics?.[activeCsvId] || null : null;
  const activeRecommendation = activeCsvId ? recommendations?.[activeCsvId] || null : null;

  const [filter,   setFilter]   = useState('ALL');
  const [selected, setSelected] = useState(null);
  const [aiRec,    setAiRec]    = useState({ id: null, text: null, loading: false });
  const recConvId  = useRef(null);

  // Keep selected pointing at a valid alert
  useEffect(() => {
    if (!selected || !active.find(a => a.id === selected)) {
      setSelected(active[0]?.id ?? null);
    }
  }, [active.length]);

  useEffect(() => {
    if (!activeCsvId) return;
    actions.fetchDiagnostics(activeCsvId).catch(() => {});
  }, [activeCsvId]);

  // Chat state
  const WELCOME = { role:'ai', t:'Hola. Tengo acceso a los datos del CSV cargado y a las alertas detectadas. Podés preguntarme sobre temperaturas, vibraciones, defectos, tendencias o cualquier variable del proceso.' };
  const [chatMsgs,    setChatMsgs]    = useState([WELCOME]);
  const [chatInput,   setChatInput]   = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [chatReady,   setChatReady]   = useState(false);
  const chatConvId = useRef(null);
  const chatEndRef = useRef(null);

  useEffect(() => {
    if (!supabase) { setChatReady(true); return; }
    supabase
      .from('conversations')
      .select('id, messages(role, content, created_at)')
      .order('created_at', { ascending: false })
      .limit(1)
      .single()
      .then(({ data }) => {
        if (data?.messages?.length) {
          chatConvId.current = data.id;
          const loaded = data.messages
            .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
            .map(m => ({ role: m.role, t: m.content }));
          setChatMsgs([WELCOME, ...loaded]);
        }
      })
      .finally(() => setChatReady(true));
  }, []);

  const visible = filter === 'ALL' ? active : active.filter(a => a.sev === filter);
  const sel     = active.find(a => a.id === selected) || active[0] || null;

  // ── AI recommendation: try backend, fall back to local text ──────────────
  useEffect(() => {
    if (!sel || sel.id === aiRec.id) return;
    // Immediately set local text
    setAiRec({ id: sel.id, text: sel.ai || null, loading: true });
    const prompt = `Alerta ${sel.sev} en ${sel.machine}: "${sel.title}". ${sel.detail || ''}\nDá una recomendación concreta: acción inmediata, costo evitable estimado y tiempo de resolución. Sé breve y específico.`;
    actions.chat(prompt, recConvId.current)
      .then(res => {
        recConvId.current = res.conversationId;
        setAiRec({ id: sel.id, text: res.response?.t || res.response?.text, loading: false });
      })
      .catch(() => setAiRec({ id: sel.id, text: sel.ai || 'Revisar telemetría y ajustar setpoints.', loading: false }));
  }, [sel?.id]);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior:'smooth' }); }, [chatMsgs]);

  const handleChat = async (e) => {
    e.preventDefault();
    const txt = chatInput.trim();
    if (!txt || chatLoading) return;
    setChatInput('');
    setChatMsgs(prev => [...prev, { role:'user', t:txt }]);
    setChatLoading(true);
    try {
      const res = await actions.chat(txt, chatConvId.current, activeCsvId || null);
      chatConvId.current = res.conversationId;
      setChatMsgs(prev => [...prev, { role:'ai', t: res.response?.t || '—' }]);
    } catch {
      setChatMsgs(prev => [...prev, { role:'ai', t:'Error al consultar la IA. Verificá la conexión al backend.' }]);
    } finally {
      setChatLoading(false);
    }
  };

  const handleAck   = async (id) => { await actions.acknowledgeAlert(id).catch(() => {}); };
  const handleClose = async (id) => {
    await actions.closeAlert(id).catch(() => {});
    const remaining = active.filter(a => a.id !== id);
    setSelected(remaining[0]?.id ?? null);
  };

  // ── Stats ─────────────────────────────────────────────────────────────────
  const critCount = active.filter(a => a.sev === 'CRITICAL').length;
  const highCount = active.filter(a => a.sev === 'HIGH').length;
  const medCount  = active.filter(a => a.sev === 'MEDIUM').length;

  const oocStats = activeCSV ? computeOOCStats(activeCSV) : null;
  const totalRows = activeCSV
    ? Object.values(csvFiles).reduce((s, d) => s + (d.rows?.length||0), 0)
    : 0;

  // ── Detail: find CSV data for selected alert (CSV-generated or backend) ──────
  const selCsvData = sel?.col
    ? (activeCSV)                                   // CSV alert: already has col
    : (csvFiles[sel?.machine] || activeCSV || null); // backend/mock alert: look up by machine id

  const selCol = sel?.col || (selCsvData ? matchAlertToColumn(sel, selCsvData) : null);

  // Compute control limits from CSV column when the alert doesn't carry them
  const selStats = (() => {
    if (sel?.mean != null) return { mean: sel.mean, sd: sel.sd, ucl: sel.ucl, lcl: sel.lcl };
    if (!selCol || !selCsvData) return null;
    const vals = selCsvData.rows.map(r => parseFloat(r[selCol])).filter(v => !isNaN(v));
    if (vals.length < 5) return null;
    const mean = vals.reduce((a,b)=>a+b,0)/vals.length;
    const sd   = Math.sqrt(vals.reduce((a,b)=>a+(b-mean)**2,0)/vals.length);
    return { mean, sd, ucl: mean+3*sd, lcl: mean-3*sd };
  })();

  const selTelemetry = sel?.vals?.length
    ? sel.vals.slice(-40)
    : (selCol && selCsvData
        ? selCsvData.rows.map(r => parseFloat(r[selCol])).filter(v => !isNaN(v)).slice(-40)
        : (machineHistory[sel?.machine]?.temp?.slice(-40) ?? []));

  const selColor = sel?.sev === 'CRITICAL' ? '#EF4444' : (sel?.sev === 'HIGH' ? '#F59E0B' : '#22D3EE');

  const correlations = (selCol && selCsvData)
    ? (computeCorrelations(selCsvData, selCol) || [])
    : [];

  const hasRealCorrs = correlations.length > 0;

  const dataSource = hasBackend ? (hasCSV ? `Backend + CSV · ${totalRows} registros` : 'Backend · tiempo real')
    : hasCSV ? `CSV · ${totalRows} registros`
    : 'Sin datos — backend offline';

  return (
    <div className="p-6 space-y-5">
      <PageHeader
        eyebrow="// IA + CENTRO DE ALERTAS"
        title="IA + Alertas"
        desc="Detección automática, escalado y recomendaciones IA para anomalías de proceso, calidad y mantenimiento."
        actions={
          <div className="flex items-center gap-2">
            {critCount > 0 && <Chip color="red"><span className="pulse-dot w-1.5 h-1.5 rounded-full bg-crit-400 mr-1"/>{critCount} críticas</Chip>}
            {highCount > 0 && <Chip color="amber">{highCount} altas</Chip>}
            {medCount  > 0 && <Chip color="cyan">{medCount} medias</Chip>}
            <span className={`text-[9px] px-2 py-0.5 rounded border ${
              hasCSV ? 'bg-grind-400/10 text-grind-400 border-grind-400/25'
              : hasBackend ? 'bg-cyan2-400/10 text-cyan2-400 border-cyan2-400/25'
              : 'bg-slate-700 text-slate-500 border-slate-600'
            }`}>{dataSource}</span>
            <button onClick={() => actions.markAllAlertsRead().catch(() => {})}
                    className="panel rounded-md px-3 py-2 text-xs text-slate-300 hairline flex items-center gap-1">
              {I.check} Marcar todo
            </button>
          </div>
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="panel rounded p-4 corners" style={{color:'#22D3EE'}}>
          <Stat label="Alertas activas" value={String(active.length)}
          delta={hasCSV ? `${critCount} críticas` : '+3 hoy'} accent="cyan"/>
        </div>
        <div className="panel rounded p-4 corners" style={{color:'#10B981'}}>
          <Stat label={oocStats ? '% Puntos OOC' : 'MTTR promedio'}
                value={oocStats ? `${oocStats.rate.toFixed(1)}%` : '18m'}
                delta={oocStats ? `${oocStats.ooc}/${oocStats.total} pts` : '-3m'}
                accent="green"/>
        </div>
        <div className="panel rounded p-4 corners" style={{color:'#10B981'}}>
          <Stat label={hasCSV ? 'Variables monitoreadas' : 'Falsos positivos'}
                value={hasCSV
                  ? String(activeCSV ? activeCSV.header.filter(h => h.toLowerCase() !== 'fecha_hora' && !isNaN(parseFloat(activeCSV.rows[0]?.[h]))).length : 0)
                  : '4.2%'}
                delta={hasCSV ? `CSV: ${activeCSV?.name || '—'}` : '-1.1%'}
                accent="green"/>
        </div>
        <div className="panel rounded p-4 corners" style={{color:'#F59E0B'}}>
          <Stat label={hasCSV ? 'Registros analizados' : 'Tiempo a respuesta'}
                value={hasCSV ? String(totalRows) : '2.4m'}
                delta={hasCSV ? `${Object.keys(csvFiles).length} archivo${Object.keys(csvFiles).length !== 1 ? 's' : ''}` : '+0.2m'}
                accent="amber"/>
        </div>
      </div>

      {activeDiagnostics && (
        <Card title={`Diagnóstico · ${activeDiagnostics.machineId}`} subtitle={activeDiagnostics.summary} accent="ai">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <div className="panel rounded p-3">
              <div className="text-[10px] uppercase tracking-widest text-slate-500 mb-2">Variables fuera de norma</div>
              <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                {activeDiagnostics.flaggedVariables.length ? activeDiagnostics.flaggedVariables.map(variable => (
                  <div key={variable.name} className="hairline-bottom pb-2 last:pb-0 last:border-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm text-white">{variable.name}</span>
                      <span className="num text-xs text-ai-400">{variable.sigmaDelta.toFixed(2)}σ</span>
                    </div>
                    <div className="text-[11px] text-slate-400">
                      actual {variable.current.toFixed(3)}{variable.unit ? ` ${variable.unit}` : ''} · base {variable.historicalMean.toFixed(3)} · tendencia {variable.trend}
                    </div>
                    {variable.correlatedWith.length > 0 && (
                      <div className="text-[10px] text-slate-500 mt-1">
                        Correlaciones: {variable.correlatedWith.map(item => `${item.name}(r=${item.corr.toFixed(2)})`).join(', ')}
                      </div>
                    )}
                  </div>
                )) : <div className="text-sm text-slate-500">Todas las variables están dentro de parámetros.</div>}
              </div>
            </div>
            <div className="panel rounded p-3">
              <div className="flex items-center justify-between mb-2">
                <div className="text-[10px] uppercase tracking-widest text-slate-500">Recomendaciones IA</div>
                <button
                  onClick={() => actions.fetchRecommendations(activeCsvId).catch(() => {})}
                  className="px-2 py-1 rounded text-[10px] bg-cyan2-400/15 border border-cyan2-400/30 text-cyan2-400">
                  Generar recomendaciones
                </button>
              </div>
              <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                {activeRecommendation?.scenarios?.length ? activeRecommendation.scenarios.map((scenario, index) => (
                  <div key={index} className="panel rounded p-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm text-white">{scenario.variable}</span>
                      <span className="num text-xs text-grind-400">conf {Math.round(scenario.confidence * 100)}%</span>
                    </div>
                    <div className="text-[11px] text-slate-400">
                      {scenario.from.toFixed(3)}{scenario.unit ? ` ${scenario.unit}` : ''} → {scenario.to.toFixed(3)}{scenario.unit ? ` ${scenario.unit}` : ''}
                    </div>
                    <div className="text-[10px] text-slate-500 mt-1">
                      Δ defectos {scenario.impact.defectDelta.toFixed(2)} · Δ OEE {scenario.impact.oeeDelta.toFixed(2)} · Δ σ {scenario.impact.sigmaDelta.toFixed(2)}
                    </div>
                  </div>
                )) : <div className="text-sm text-slate-500">Todavía no hay recomendaciones generadas para este CSV.</div>}
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* Alert list + Detail */}
      <div className="grid grid-cols-12 gap-4">
        <Card title="Bandeja" subtitle={`${visible.length} alertas`}
              className="col-span-12 xl:col-span-5" accent="cyan"
              action={
                <div className="flex gap-1">
                  {['ALL','CRITICAL','HIGH','MEDIUM'].map(f => (
                    <button key={f} onClick={() => setFilter(f)}
                            className={`px-2 py-1 text-[10px] rounded ${filter===f?'bg-cyan2-400/15 text-cyan2-400 border border-cyan2-400/30':'text-slate-400 hover:text-white'}`}>
                      {f === 'ALL' ? 'Todos' : f}
                    </button>
                  ))}
                </div>
              }>
          <div className="space-y-2 max-h-[640px] overflow-y-auto pr-1">
            {visible.length === 0 && (
              <div className="text-center py-8 text-slate-500 text-sm">
                {hasCSV
                  ? 'No se detectaron anomalías estadísticas en los datos del CSV.'
                  : 'No hay alertas activas.'}
              </div>
            )}
            {visible.map(a => {
              const sc    = a.sev==='CRITICAL'?'#EF4444':(a.sev==='HIGH'?'#F59E0B':(a.sev==='MEDIUM'?'#22D3EE':'#64748B'));
              const isSel = a.id === selected;
              return (
                <div key={a.id} onClick={() => setSelected(a.id)}
                     className={`panel rounded-md p-3 cursor-pointer transition ${isSel?'border border-cyan2-400/30':'hover:bg-white/[0.02]'}`}
                     style={isSel?{boxShadow:`0 0 16px ${sc}25`}:{}}>
                  <div className="flex items-start gap-3">
                    <div className="w-1 self-stretch rounded" style={{background:sc, boxShadow:`0 0 6px ${sc}`}}/>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <Chip color={a.sev==='CRITICAL'?'red':(a.sev==='HIGH'?'amber':(a.sev==='MEDIUM'?'cyan':'slate'))}>{a.sev}</Chip>
                        <span className="num text-[10px] text-slate-500">{a.machine}</span>
                        <span className="num text-[10px] text-slate-500 ml-auto">{a.time}</span>
                      </div>
                      <div className="text-sm text-white font-medium mt-1">{a.title}</div>
                      {a.detail && <div className="text-[11px] text-slate-400 mt-0.5">{a.detail}</div>}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        {sel ? (
          <Card title={`Alerta · ${sel.id}`} subtitle={sel.machine}
                className="col-span-12 xl:col-span-7"
                accent={sel.sev==='CRITICAL'?'red':(sel.sev==='HIGH'?'amber':'cyan')}
                glow={sel.sev==='CRITICAL'?'shadow-glowCrit':''}>
            <div className="flex items-start gap-4 pb-4 hairline-bottom">
              <div className="w-12 h-12 rounded grid place-items-center"
                   style={{color:selColor, background:`${selColor}1e`, boxShadow:`inset 0 0 0 1px ${selColor}55`}}>
                {I.alert}
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <Chip color={sel.sev==='CRITICAL'?'red':(sel.sev==='HIGH'?'amber':'cyan')}>{sel.sev}</Chip>
                  <span className="num text-[10px] text-slate-500">disparada {sel.time}</span>
                  {selCol && <span className="num text-[10px] text-slate-600">· {selCol.replace(/_/g,' ')}</span>}
                </div>
                <div className="font-display text-lg font-semibold text-white mt-1">{sel.title}</div>
                {sel.detail && <div className="text-sm text-slate-400">{sel.detail}</div>}
                {selStats && (
                  <div className="flex gap-3 mt-2 text-[10px] num text-slate-500">
                    <span>μ={selStats.mean.toFixed(3)}</span>
                    <span>σ={selStats.sd.toFixed(3)}</span>
                    <span>LCS={selStats.ucl.toFixed(3)}</span>
                    <span>LCI={selStats.lcl.toFixed(3)}</span>
                  </div>
                )}
              </div>
              <div className="flex flex-col gap-2 items-end">
                <button onClick={() => handleAck(sel.id)} className="px-3 py-1.5 text-xs rounded bg-cyan2-400/15 border border-cyan2-400/40 text-cyan2-400 flex items-center gap-1">{I.check} Reconocer</button>
                <button className="px-3 py-1.5 text-xs rounded panel hairline text-slate-300">Escalar</button>
                <button onClick={() => handleClose(sel.id)} className="px-3 py-1.5 text-xs rounded panel hairline text-slate-300">Cerrar</button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 mt-4">
              <div className="panel rounded p-3">
                <div className="text-[10px] uppercase tracking-widest text-slate-500 mb-2">
                  {selCol ? `${selCol.replace(/_/g,' ')} · últimos ${Math.min(selTelemetry.length, 40)} puntos` : 'Telemetría afectada · ±30min'}
                </div>
                <SparkLine data={selTelemetry} h={90} stroke={selColor} fill={`${selColor}2e`}/>
                {selStats && (
                  <div className="flex gap-3 text-[9px] num text-slate-500 mt-1">
                    <span style={{color:selColor}}>LCS {selStats.ucl.toFixed(2)}</span>
                    <span className="text-slate-400">μ {selStats.mean.toFixed(2)}</span>
                    <span style={{color:selColor}}>LCI {selStats.lcl.toFixed(2)}</span>
                  </div>
                )}
              </div>
              <div className="panel rounded p-3">
                <div className="text-[10px] uppercase tracking-widest text-slate-500 mb-2">
                  {hasRealCorrs ? 'Correlaciones reales · CSV' : 'Variables correlacionadas'}
                </div>
                <div className="space-y-1.5">
                  {correlations.map(x => (
                    <div key={x.l}>
                      <div className="flex justify-between text-[11px]">
                        <span className="text-slate-300">{x.l}</span>
                        <span className="num" style={{color:x.col}}>r={x.c.toFixed(2)}</span>
                      </div>
                      <div className="h-1 rounded bg-slate-700/40 overflow-hidden">
                        <div className="h-full" style={{width:`${Math.abs(x.c)*100}%`, background:x.col}}/>
                      </div>
                    </div>
                  ))}
                  {correlations.length === 0 && (
                    <div className="text-[11px] text-slate-500">No hay correlaciones significativas.</div>
                  )}
                </div>
              </div>
            </div>

            <div className="mt-4 panel-strong rounded p-4 border" style={{borderColor:'rgba(168,85,247,0.35)', boxShadow:'0 0 24px rgba(168,85,247,0.15)'}}>
              <div className="flex items-center gap-2">
                <span className="text-ai-400">{I.brain}</span>
                <span className="text-[10px] tracking-widest text-ai-400 uppercase">RECOMENDACIÓN IA</span>
                {aiRec.loading && <span className="text-[10px] text-slate-500 animate-pulse">analizando…</span>}
              </div>
              <div className="text-sm text-slate-200 mt-2 leading-relaxed whitespace-pre-wrap">
                {aiRec.id === sel.id
                  ? (aiRec.text || sel.ai || 'Revisar telemetría y ajustar setpoints.')
                  : (sel.ai || 'Revisar telemetría y ajustar setpoints.')}
              </div>
              <div className="flex gap-2 mt-3">
                <button className="px-3 py-1.5 text-xs rounded text-[#06080F] font-semibold"
                        style={{background:'linear-gradient(90deg,#A855F7,#22D3EE)', boxShadow:'0 0 12px rgba(168,85,247,0.5)'}}>
                  Aplicar automático
                </button>
                <button className="px-3 py-1.5 text-xs rounded panel hairline text-slate-300">Asignar técnico</button>
                <button className="px-3 py-1.5 text-xs rounded panel hairline text-slate-300">Crear PM</button>
              </div>
            </div>
          </Card>
        ) : (
          <Card title="Detalle" subtitle="Seleccioná una alerta" className="col-span-12 xl:col-span-7" accent="cyan">
            <div className="h-64 flex items-center justify-center text-slate-500 text-sm">
              {hasCSV
                ? 'Cargá un CSV en Dashboard para detectar anomalías automáticamente.'
                : 'No hay alertas activas. El sistema monitoreará en tiempo real.'}
            </div>
          </Card>
        )}
      </div>

      {/* CSV IA Chat */}
      <Card title="Chat IA · Análisis de datos reales"
            subtitle={activeCSV
              ? `CSV: ${activeCSV.name} · ${activeCSV.rows.length} registros · ${Object.keys(csvFiles).length} archivo${Object.keys(csvFiles).length !== 1 ? 's' : ''} cargado${Object.keys(csvFiles).length !== 1 ? 's' : ''}`
              : 'Subí un CSV en Dashboard para análisis con datos reales del proceso'}
            accent="ai" glow="shadow-glowAi">
        <div className="h-72 overflow-y-auto space-y-3 mb-4 pr-1 flex flex-col">
          {chatMsgs.map((m, i) => (
            <div key={i} className={`flex gap-2 ${m.role === 'user' ? 'flex-row-reverse' : ''}`}>
              <div className={`w-7 h-7 rounded shrink-0 grid place-items-center ${m.role === 'ai' ? 'bg-ai-400/15 text-ai-400' : 'bg-cyan2-400/15 text-cyan2-400'}`}>
                {m.role === 'ai' ? I.bot : I.user}
              </div>
              <div className={`max-w-[80%] rounded-lg px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap ${m.role === 'ai' ? 'panel text-slate-200' : 'text-cyan2-300 border border-cyan2-400/20'}`}
                   style={m.role === 'user' ? {background:'rgba(34,211,238,0.07)'} : {}}>
                {m.t}
              </div>
            </div>
          ))}
          {chatLoading && (
            <div className="flex gap-2">
              <div className="w-7 h-7 rounded shrink-0 grid place-items-center bg-ai-400/15 text-ai-400">{I.bot}</div>
              <div className="panel rounded-lg px-3 py-2 text-sm text-slate-500 animate-pulse">Analizando datos…</div>
            </div>
          )}
          <div ref={chatEndRef}/>
        </div>
        <form onSubmit={handleChat} className="flex gap-2">
          <input
            value={chatInput}
            onChange={e => setChatInput(e.target.value)}
            placeholder={activeCSV
              ? `Preguntá sobre ${activeCSV.name}… (anomalías detectadas, correlaciones, tendencias)`
              : 'Preguntá sobre el estado de la planta o cargá un CSV para análisis real…'}
            className="flex-1 panel rounded-md px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 outline-none border border-transparent focus:border-ai-400/40 transition"
          />
          <button type="submit" disabled={chatLoading || !chatInput.trim()}
                  className="px-4 py-2 text-xs rounded-md font-semibold disabled:opacity-40 transition flex items-center gap-1.5"
                  style={{background:'linear-gradient(90deg,#A855F7,#22D3EE)', color:'#06080F', boxShadow:'0 0 12px rgba(168,85,247,0.4)'}}>
            {I.send}
          </button>
        </form>
      </Card>
    </div>
  );
}
