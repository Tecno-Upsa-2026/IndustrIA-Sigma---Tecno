import { useState, useEffect } from 'react'
import { Card, Chip, PageHeader } from '../shell'
import { SparkLine } from '../charts'
import { makeSeries } from '../data'
import { I } from '../icons'
import { useData } from '../context/DataContext'

export default function ReportsScreen(){
  const { reports: liveReports, actions } = useData();
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    actions.fetchReports().catch(()=>{});
  }, []);

  const reports = liveReports.length ? liveReports : FALLBACK_REPORTS;

  const handleGenerate = async (tipo) => {
    if (creating) return;
    setCreating(true);
    try {
      await actions.createReport({ tipo, nombre: `${tipo} — ${new Date().toLocaleDateString('es-MX')}` });
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id) => {
    await actions.deleteReport(id).catch(()=>{});
  };

  const preview = reports.find(r => r.estado === 'Listo') || reports[0];

  return (
    <div className="p-6 space-y-5">
      <PageHeader
        eyebrow="// REPORTING"
        title="Reportes y Auditoría"
        desc="Generación, archivado y exportación de reportes DMAIC, SPC, energéticos y de IA."
        actions={
          <div className="flex items-center gap-2">
            <button className="panel rounded-md px-3 py-2 text-xs text-slate-300 hairline flex items-center gap-2 hover:text-cyan2-400">{I.filter} Filtros</button>
            <button onClick={()=>handleGenerate('DMAIC')} disabled={creating} className="px-3 py-2 text-xs rounded-md bg-cyan2-400/15 border border-cyan2-400/40 text-cyan2-400 flex items-center gap-2 disabled:opacity-50">{I.plus} Nuevo reporte</button>
          </div>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          {n:'DMAIC',   d:'Define · Measure · Analyze · Improve · Control', c:'#A855F7', ic:I.flask},
          {n:'SPC',     d:'X̄-R, MR, capability, histogramas', c:'#22D3EE', ic:I.chart},
          {n:'IA',      d:'Insights, predicciones y anomalías', c:'#A855F7', ic:I.brain},
          {n:'Energía', d:'kWh por línea, turno y SKU', c:'#F59E0B', ic:I.bolt},
        ].map(t=>(
          <div key={t.n} className="panel rounded-lg p-4 relative overflow-hidden corners group cursor-pointer hover:border-cyan2-400/30 transition" style={{color:t.c}} onClick={()=>handleGenerate(t.n)}>
            <div className="absolute -top-6 -right-6 opacity-10 text-[120px]" style={{color:t.c}}>{t.ic}</div>
            <div className="text-[10px] tracking-widest uppercase text-slate-500">Plantilla</div>
            <div className="font-display text-xl font-bold text-white mt-1 flex items-center gap-2"><span style={{color:t.c}}>{t.ic}</span>{t.n}</div>
            <div className="text-[11px] text-slate-400 mt-1">{t.d}</div>
            <button className="mt-3 text-[11px] flex items-center gap-1" style={{color:t.c}}>{I.plus} Generar</button>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-12 gap-4">
        <Card title="Reportes recientes" subtitle={`${reports.length} documentos`} className="col-span-12 xl:col-span-8" accent="cyan">
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
                  <th className="text-left"></th>
                </tr>
              </thead>
              <tbody>
                {reports.map(r=>(
                  <tr key={r.id} className="hairline-bottom hover:bg-white/[0.02] cursor-pointer">
                    <td className="py-2.5 num text-cyan2-400">{r.id}</td>
                    <td><Chip color={r.tipo==='IA'?'ai':(r.tipo==='SPC'?'cyan':(r.tipo==='Energía'?'amber':'ai'))}>{r.tipo}</Chip></td>
                    <td className="text-white">{r.nombre}</td>
                    <td className="text-slate-400">{r.autor}</td>
                    <td className="num text-slate-400 text-xs">{r.fecha}</td>
                    <td>
                      <Chip color={r.estado==='Listo'?'green':(r.estado==='Generando'?'cyan':(r.estado==='Borrador'?'slate':'amber'))}>
                        {r.estado==='Generando' && <span className="w-1.5 h-1.5 rounded-full bg-cyan2-400 pulse-dot mr-1"/>}
                        {r.estado}
                      </Chip>
                    </td>
                    <td className="text-right">
                      {r.estado==='Listo' && <button className="text-slate-500 hover:text-cyan2-400 mr-3" title="Descargar">{I.download}</button>}
                      <button onClick={()=>handleDelete(r.id)} className="text-slate-500 hover:text-crit-400" title="Eliminar">{I.trash || I.close}</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        {preview && (
          <Card title={`Vista previa · ${preview.id}`} subtitle={`${preview.tipo} · ${preview.nombre}`} className="col-span-12 xl:col-span-4" accent="ai" glow="shadow-glowAi">
            <div className="panel-strong rounded p-4 relative overflow-hidden" style={{aspectRatio:'8.5/11'}}>
              <div className="absolute inset-0 grid-bg-sm opacity-30"/>
              <div className="relative">
                <div className="text-[9px] tracking-[0.25em] text-cyan2-400 uppercase">// IndustrIA Σ · {preview.tipo} REPORT</div>
                <div className="font-display text-lg font-bold text-white mt-1 leading-tight">{preview.nombre}</div>
                <div className="text-[10px] text-slate-500 num mt-1">{preview.id} · {preview.fecha}</div>
                <div className="mt-3 grid grid-cols-3 gap-1 text-center">
                  {[{l:'Cp',v:'1.42'},{l:'Yield',v:'98.6'},{l:'σ',v:'4.6'}].map(x=>(
                    <div key={x.l} className="panel rounded p-1.5">
                      <div className="num text-sm text-cyan2-400">{x.v}</div>
                      <div className="text-[8px] text-slate-500">{x.l}</div>
                    </div>
                  ))}
                </div>
                <div className="mt-3">
                  <SparkLine data={makeSeries(30, 50, 4, 0.4)} h={50} stroke="#A855F7" fill="rgba(168,85,247,0.2)"/>
                </div>
                <div className="mt-2 space-y-1">
                  {['Causa raíz · drift térmico','Acción · setpoint -8°C','Resultado · defectos -38%'].map((l,i)=>(
                    <div key={i} className="flex items-center gap-1.5 text-[10px] text-slate-300">
                      <span className="w-1 h-1 rounded-full bg-cyan2-400"/>{l}
                    </div>
                  ))}
                </div>
                <div className="mt-3 text-[8px] num text-slate-500">página 1 / 14</div>
              </div>
            </div>
            <div className="flex gap-2 mt-3">
              <button className="flex-1 px-3 py-2 text-xs rounded bg-cyan2-400/15 border border-cyan2-400/40 text-cyan2-400 flex items-center justify-center gap-1">{I.download} PDF</button>
              <button className="flex-1 px-3 py-2 text-xs rounded panel hairline text-slate-300 flex items-center justify-center gap-1">{I.copy} Duplicar</button>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}

const FALLBACK_REPORTS = [
  {id:'RPT-2026-0421', tipo:'DMAIC',   nombre:'Reducción defectos INJ-07', autor:'L. Mendoza', fecha:'21 May 2026', estado:'Listo',    size:'4.2 MB'},
  {id:'RPT-2026-0420', tipo:'SPC',     nombre:'Capability mensual CNC',    autor:'A. Rivera',  fecha:'20 May 2026', estado:'Listo',    size:'2.1 MB'},
  {id:'RPT-2026-0419', tipo:'IA',      nombre:'Predicción fallas Q2',      autor:'NEXUS-AI',   fecha:'19 May 2026', estado:'Listo',    size:'1.8 MB'},
  {id:'RPT-2026-0418', tipo:'Energía', nombre:'Consumo turno B',           autor:'L. Mendoza', fecha:'18 May 2026', estado:'Borrador', size:'—'},
  {id:'RPT-2026-0417', tipo:'Pareto',  nombre:'Causas defecto OVN-09',     autor:'A. Rivera',  fecha:'17 May 2026', estado:'Listo',    size:'880 KB'},
  {id:'RPT-2026-0416', tipo:'DMAIC',   nombre:'Mejora OEE línea 1',        autor:'C. Núñez',   fecha:'15 May 2026', estado:'Revisión', size:'3.0 MB'},
];
