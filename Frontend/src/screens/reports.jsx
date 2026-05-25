import { useState, useEffect, useMemo } from 'react'
import { Card, Chip, PageHeader } from '../shell'
import { I } from '../icons'
import { supabase } from '../lib/supabase'
import { generateDataReport, downloadSavedPDF } from '../lib/pdf'
import { getReports, getReportBlob, deleteLocalReport } from '../lib/reportStore'
import { useData } from '../context/DataContext'

// ─── Stats from CSV column ────────────────────────────────────────────────────
function computeStats(rows, col) {
  const vals = rows.map(r => parseFloat(r[col])).filter(v => !isNaN(v));
  if (vals.length < 5) return null;
  const n    = vals.length;
  const mean = vals.reduce((a,b) => a+b, 0) / n;
  const sd   = Math.sqrt(vals.reduce((a,b) => a+(b-mean)**2, 0) / n);
  if (sd < 1e-9) return null;
  const ucl = mean+3*sd, lcl = mean-3*sd;
  const usl = mean+2.5*sd, lsl = mean-2.5*sd;
  const cp  = (usl-lsl)/(6*sd);
  const cpk = Math.min((usl-mean)/(3*sd), (mean-lsl)/(3*sd));
  const oocCount = vals.filter(v => v>ucl||v<lcl).length;
  const yieldPct = vals.filter(v => v>=lsl&&v<=usl).length/n*100;
  return { mean, sd, ucl, lcl, usl, lsl, cp, cpk, oocCount, yield: yieldPct };
}

function numericCols(csvData) {
  if (!csvData?.header?.length || !csvData?.rows?.length) return [];
  return csvData.header.filter(h => !isNaN(parseFloat(csvData.rows[0]?.[h])));
}

const TYPE_OPTS = ['SPC', 'LSS', 'Alertas', 'DMAIC', 'Energía', 'General'];
const typeColor = t => t==='LSS'||t==='SPC' ? 'cyan' : t==='Alertas'||t==='DMAIC' ? 'red' : t==='Energía' ? 'amber' : 'ai';

// ─── Component ────────────────────────────────────────────────────────────────
export default function ReportsScreen() {
  const { csvFiles, alerts: liveAlerts } = useData();
  const [reports,       setReports]       = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [dlId,          setDlId]          = useState(null);
  const [confirmId,     setConfirmId]     = useState(null);   // delete confirmation
  const [genOpen,       setGenOpen]       = useState(false);  // generate modal
  const [generating,    setGenerating]    = useState(false);

  // Generate modal state
  const [gType,    setGType]    = useState('SPC');
  const [gMachine, setGMachine] = useState('');
  const [gCol,     setGCol]     = useState('');
  const [gName,    setGName]    = useState('');
  const [gAuthor,  setGAuthor]  = useState('Sistema');

  const csvMachines = Object.keys(csvFiles);
  const activeMachine = gMachine || csvMachines[0] || '';
  const csvData       = csvFiles[activeMachine] || null;
  const cols          = useMemo(() => numericCols(csvData), [csvData]);
  const activeCol     = gCol || cols[0] || '';

  // Auto-fill name when type/machine changes
  useEffect(() => {
    setGName(`${gType} · ${activeMachine || 'General'} · ${new Date().toLocaleDateString('es-MX')}`);
  }, [gType, activeMachine]);

  useEffect(() => { setGCol(''); }, [activeMachine]);

  const fetchReports = async () => {
    try {
      const data = await getReports();
      setReports(data);
    } catch (e) {
      console.error('[Reports] fetchReports error:', e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchReports(); }, []);

  // ── Download ────────────────────────────────────────────────────────────────
  const handleDownload = async (r) => {
    setDlId(r.id);
    try {
      const blob = await getReportBlob(r.id);
      if (blob) {
        const url = URL.createObjectURL(blob);
        const a   = document.createElement('a');
        a.href = url; a.download = `${r.id}.pdf`;
        a.click();
        URL.revokeObjectURL(url);
      } else if (r.content?.storage_path && supabase) {
        await downloadSavedPDF(r.content.storage_path, `${r.id}.pdf`);
      }
    } finally {
      setDlId(null);
    }
  };

  // ── Delete (with confirmation) ──────────────────────────────────────────────
  const confirmDelete = async () => {
    if (!confirmId) return;
    await deleteLocalReport(confirmId);
    if (supabase) {
      const r = reports.find(x => x.id === confirmId);
      if (r?.content?.storage_path) {
        supabase.storage.from('reports').remove([r.content.storage_path]).catch(() => {});
      }
      supabase.from('reports').delete().eq('id', confirmId).catch(() => {});
    }
    setReports(prev => prev.filter(x => x.id !== confirmId));
    setConfirmId(null);
  };

  // ── Generate report ─────────────────────────────────────────────────────────
  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const stats  = csvData && activeCol ? computeStats(csvData.rows, activeCol) : null;
      const alerts = gType === 'Alertas' || gType === 'General' ? liveAlerts : [];
      const id = await generateDataReport({
        type:    gType,
        machine: activeMachine,
        col:     activeCol,
        name:    gName,
        author:  gAuthor,
        stats,
        alerts,
        csvRows: csvData?.rows?.length ?? 0,
      });
      setGenOpen(false);
      await fetchReports();
    } catch (e) {
      console.error('[Reports] generate error:', e.message);
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="p-6 space-y-5">
      <PageHeader
        eyebrow="// REPORTING"
        title="Reportes y Auditoría"
        desc="Generación, archivado y exportación de reportes LSS, SPC e IA."
        actions={
          <div className="flex items-center gap-3">
            <span className="text-xs text-slate-500">{reports.length} documento{reports.length !== 1 ? 's' : ''}</span>
            <button
              onClick={() => setGenOpen(true)}
              className="flex items-center gap-2 px-3 py-2 text-xs rounded-md bg-cyan2-400/15 border border-cyan2-400/40 text-cyan2-400 hover:bg-cyan2-400/25 transition"
            >
              {I.download} Generar reporte
            </button>
          </div>
        }
      />

      {/* Info card — only when no reports */}
      {!loading && reports.length === 0 && (
        <div className="panel rounded-lg p-4 border border-cyan2-400/20 flex items-start gap-3">
          <span className="text-cyan2-400 mt-0.5 shrink-0">{I.bot}</span>
          <div className="text-sm text-slate-300">
            Usá el botón <span className="text-cyan2-400 font-medium">Generar reporte</span> para crear un PDF con los datos del CSV actual.
            También podés generar reportes visuales desde{' '}
            <span className="text-cyan2-400 font-medium">Lean Six Sigma</span> con el botón PDF de esa pantalla.
          </div>
        </div>
      )}

      {/* Reports table */}
      <Card title="Reportes guardados" subtitle={`${reports.length} documentos`} accent="cyan">
        {loading ? (
          <div className="py-8 text-center text-slate-500 text-sm animate-pulse">Cargando reportes…</div>
        ) : reports.length === 0 ? (
          <div className="py-12 flex flex-col items-center gap-3">
            <div className="w-14 h-14 rounded-xl grid place-items-center"
                 style={{background:'rgba(34,211,238,0.07)', border:'1px dashed rgba(34,211,238,0.25)'}}>
              <span className="text-cyan2-400 text-2xl">{I.download}</span>
            </div>
            <div className="text-slate-400 text-sm">No hay reportes aún</div>
            <div className="text-slate-600 text-xs">Usá el botón <span className="text-cyan2-400">Generar reporte</span> arriba</div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-[10px] tracking-widest uppercase text-slate-500">
                <tr className="hairline-bottom">
                  <th className="text-left py-2">ID</th>
                  <th className="text-left">Tipo</th>
                  <th className="text-left">Nombre</th>
                  <th className="text-left">Autor</th>
                  <th className="text-left">Fecha</th>
                  <th className="text-left">Estado</th>
                  <th className="text-right"></th>
                </tr>
              </thead>
              <tbody>
                {reports.map(r => (
                  <tr key={r.id} className="hairline-bottom hover:bg-white/[0.02]">
                    <td className="py-2.5 num text-cyan2-400 text-xs">{r.id}</td>
                    <td><Chip color={typeColor(r.type)}>{r.type}</Chip></td>
                    <td className="text-white text-xs max-w-[200px] truncate">{r.name}</td>
                    <td className="text-slate-400 text-xs">{r.author}</td>
                    <td className="num text-slate-400 text-xs">
                      {new Date(r.created_at).toLocaleDateString('es-MX')}
                    </td>
                    <td><Chip color="green">{r.status}</Chip></td>
                    <td className="text-right">
                      <button
                        onClick={() => handleDownload(r)}
                        disabled={dlId === r.id}
                        className="text-slate-500 hover:text-cyan2-400 mr-3 disabled:opacity-40"
                        title="Descargar PDF"
                      >
                        {dlId === r.id
                          ? <span className="w-3 h-3 border border-cyan2-400 border-t-transparent rounded-full animate-spin inline-block"/>
                          : I.download}
                      </button>
                      <button
                        onClick={() => setConfirmId(r.id)}
                        className="text-slate-500 hover:text-crit-400"
                        title="Eliminar"
                      >
                        {I.x}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* ── Delete confirmation modal ───────────────────────────────────────── */}
      {confirmId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{background:'rgba(6,8,15,0.85)'}}>
          <div className="panel-strong rounded-xl p-6 w-full max-w-sm corners relative overflow-hidden">
            <div className="absolute inset-0 grid-bg-sm opacity-20 pointer-events-none"/>
            <div className="relative">
              <div className="w-12 h-12 rounded-full grid place-items-center mx-auto mb-4"
                   style={{background:'rgba(239,68,68,0.1)', border:'1px solid rgba(239,68,68,0.3)'}}>
                <span className="text-crit-400 text-xl">{I.warn}</span>
              </div>
              <h3 className="font-display text-lg font-bold text-white text-center mb-1">¿Eliminar reporte?</h3>
              <p className="text-slate-400 text-sm text-center mb-6">
                Se borrará el PDF de <span className="text-white font-medium">{confirmId}</span> del almacenamiento. Esta acción no se puede deshacer.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setConfirmId(null)}
                  className="flex-1 py-2.5 rounded-md text-sm text-slate-300 panel hairline hover:text-white transition"
                >
                  Cancelar
                </button>
                <button
                  onClick={confirmDelete}
                  className="flex-1 py-2.5 rounded-md text-sm font-semibold text-white transition"
                  style={{background:'rgba(239,68,68,0.25)', border:'1px solid rgba(239,68,68,0.5)'}}
                >
                  Sí, eliminar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Generate report modal ───────────────────────────────────────────── */}
      {genOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{background:'rgba(6,8,15,0.85)'}}>
          <div className="panel-strong rounded-xl p-6 w-full max-w-md corners relative overflow-hidden">
            <div className="absolute inset-0 grid-bg-sm opacity-20 pointer-events-none"/>
            <div className="relative">
              <div className="flex items-center justify-between mb-5">
                <div>
                  <div className="text-[10px] tracking-[0.3em] uppercase text-cyan2-400 mb-1">// NUEVO REPORTE</div>
                  <h3 className="font-display text-xl font-bold text-white">Generar reporte</h3>
                </div>
                <button onClick={() => setGenOpen(false)} className="text-slate-500 hover:text-white">{I.x}</button>
              </div>

              <div className="space-y-4">
                {/* Type */}
                <div>
                  <label className="text-[10px] tracking-[0.25em] uppercase text-slate-400">Tipo de reporte</label>
                  <div className="flex flex-wrap gap-2 mt-1.5">
                    {TYPE_OPTS.map(t => (
                      <button
                        key={t}
                        onClick={() => setGType(t)}
                        className={`px-3 py-1.5 rounded text-xs transition border ${
                          gType === t
                            ? 'bg-cyan2-400/15 border-cyan2-400/40 text-cyan2-400'
                            : 'panel border-slate-700 text-slate-400 hover:text-white'
                        }`}
                      >{t}</button>
                    ))}
                  </div>
                </div>

                {/* Machine */}
                {csvMachines.length > 0 && (
                  <div>
                    <label className="text-[10px] tracking-[0.25em] uppercase text-slate-400">Máquina / CSV</label>
                    <select
                      value={activeMachine}
                      onChange={e => setGMachine(e.target.value)}
                      className="mt-1.5 w-full panel rounded-md px-3 py-2.5 text-sm text-white bg-transparent outline-none cursor-pointer"
                    >
                      {csvMachines.map(id => (
                        <option key={id} value={id} className="bg-slate-900">{csvFiles[id]?.name || id}</option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Column */}
                {cols.length > 0 && (
                  <div>
                    <label className="text-[10px] tracking-[0.25em] uppercase text-slate-400">Variable / columna</label>
                    <select
                      value={activeCol}
                      onChange={e => setGCol(e.target.value)}
                      className="mt-1.5 w-full panel rounded-md px-3 py-2.5 text-sm text-cyan2-400 bg-transparent outline-none cursor-pointer"
                    >
                      {cols.map(c => (
                        <option key={c} value={c} className="bg-slate-900">{c}</option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Name */}
                <div>
                  <label className="text-[10px] tracking-[0.25em] uppercase text-slate-400">Nombre del reporte</label>
                  <input
                    value={gName}
                    onChange={e => setGName(e.target.value)}
                    className="mt-1.5 w-full panel rounded-md px-3 py-2.5 text-sm text-white bg-transparent outline-none focus:glow-cyan transition"
                    placeholder="Nombre del reporte"
                  />
                </div>

                {/* Author */}
                <div>
                  <label className="text-[10px] tracking-[0.25em] uppercase text-slate-400">Autor</label>
                  <input
                    value={gAuthor}
                    onChange={e => setGAuthor(e.target.value)}
                    className="mt-1.5 w-full panel rounded-md px-3 py-2.5 text-sm text-white bg-transparent outline-none focus:glow-cyan transition"
                    placeholder="Tu nombre"
                  />
                </div>

                {/* CSV info */}
                {csvData && activeCol && (
                  <div className="rounded-md px-3 py-2 text-xs flex items-center gap-2"
                       style={{background:'rgba(16,185,129,0.07)', border:'1px solid rgba(16,185,129,0.2)'}}>
                    <span className="text-grind-400">●</span>
                    <span className="text-slate-300">{csvData.rows.length} registros · columna <span className="text-cyan2-400">{activeCol}</span> disponible</span>
                  </div>
                )}
                {csvMachines.length === 0 && (
                  <div className="rounded-md px-3 py-2 text-xs flex items-center gap-2"
                       style={{background:'rgba(245,158,11,0.07)', border:'1px solid rgba(245,158,11,0.2)'}}>
                    <span className="text-warn-400">{I.warn}</span>
                    <span className="text-slate-300">Sin CSV cargado — el reporte no incluirá estadísticas SPC</span>
                  </div>
                )}
              </div>

              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => setGenOpen(false)}
                  className="flex-1 py-2.5 rounded-md text-sm text-slate-300 panel hairline hover:text-white transition"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleGenerate}
                  disabled={generating}
                  className="flex-1 relative py-2.5 rounded-md text-sm font-semibold text-[#06080F] overflow-hidden disabled:opacity-50"
                >
                  <span className="absolute inset-0" style={{background:'linear-gradient(90deg,#22D3EE,#3B82F6,#A855F7)'}}/>
                  <span className="relative z-10 flex items-center justify-center gap-2">
                    {generating
                      ? <><span className="w-3 h-3 border-2 border-[#06080F] border-t-transparent rounded-full animate-spin"/>Generando…</>
                      : <>{I.download} Generar PDF</>}
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
