import { useState, useEffect } from 'react'
import { Card, Chip, PageHeader } from '../shell'
import { I } from '../icons'
import { supabase } from '../lib/supabase'
import { downloadSavedPDF } from '../lib/pdf'

export default function ReportsScreen() {
  const [reports,  setReports]  = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [dlId,     setDlId]     = useState(null);

  const fetchReports = async () => {
    if (!supabase) { setLoading(false); return; }
    const { data, error } = await supabase
      .from('reports')
      .select('*')
      .order('created_at', { ascending: false });
    if (!error && data) setReports(data);
    setLoading(false);
  };

  useEffect(() => { fetchReports(); }, []);

  const handleDownload = async (r) => {
    const path = r.content?.storage_path;
    if (!path) return;
    setDlId(r.id);
    await downloadSavedPDF(path, `${r.id}.pdf`);
    setDlId(null);
  };

  const handleDelete = async (id) => {
    if (!supabase) return;
    const r = reports.find(x => x.id === id);
    if (r?.content?.storage_path) {
      await supabase.storage.from('reports').remove([r.content.storage_path]);
    }
    await supabase.from('reports').delete().eq('id', id);
    setReports(prev => prev.filter(x => x.id !== id));
  };

  const typeColor = (t) =>
    t === 'IA' ? 'ai' : t === 'SPC' || t === 'LSS' ? 'cyan' : t === 'Energía' ? 'amber' : 'ai';

  return (
    <div className="p-6 space-y-5">
      <PageHeader
        eyebrow="// REPORTING"
        title="Reportes y Auditoría"
        desc="Generación, archivado y exportación de reportes LSS, SPC e IA."
        actions={
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500">{reports.length} documentos guardados</span>
          </div>
        }
      />

      {/* Info card */}
      <div className="panel rounded-lg p-4 border border-cyan2-400/20 flex items-start gap-3">
        <span className="text-cyan2-400 mt-0.5">{I.info || I.bot}</span>
        <div className="text-sm text-slate-300">
          Para generar un reporte andá a <span className="text-cyan2-400 font-medium">Lean Six Sigma</span> y
          apretá el botón <span className="text-cyan2-400 font-medium">PDF</span> — captura toda la pantalla
          (gráficos incluidos), lo descarga y lo guarda acá automáticamente.
        </div>
      </div>

      {/* Reports table */}
      <Card title="Reportes guardados" subtitle={`${reports.length} documentos`} accent="cyan">
        {loading ? (
          <div className="py-8 text-center text-slate-500 text-sm animate-pulse">Cargando reportes…</div>
        ) : reports.length === 0 ? (
          <div className="py-12 flex flex-col items-center gap-3">
            <div className="w-14 h-14 rounded-xl grid place-items-center"
                 style={{background:'rgba(34,211,238,0.07)', border:'1px dashed rgba(34,211,238,0.25)'}}>
              <span className="text-cyan2-400">{I.download}</span>
            </div>
            <div className="text-slate-400 text-sm">No hay reportes aún</div>
            <div className="text-slate-600 text-xs">Generá uno desde la pantalla Lean Six Sigma</div>
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
                    <td className="text-white text-xs max-w-[240px] truncate">{r.name}</td>
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
                        title="Descargar PDF">
                        {dlId === r.id
                          ? <span className="w-3 h-3 border border-cyan2-400 border-t-transparent rounded-full animate-spin inline-block"/>
                          : I.download}
                      </button>
                      <button
                        onClick={() => handleDelete(r.id)}
                        className="text-slate-500 hover:text-crit-400"
                        title="Eliminar">
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
    </div>
  );
}
