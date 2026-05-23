import { useEffect } from 'react'
import { Card, Chip, PageHeader } from '../shell'
import { ControlChart, Histogram } from '../charts'
import { SPC_DATA } from '../data'
import { I } from '../icons'
import { useData } from '../context/DataContext'

export default function SPCScreen(){
  const { spcData, actions } = useData();

  useEffect(() => {
    actions.fetchSPCAll().catch(()=>{});
  }, []);

  // Use live INJ-07 SPC data if available, else fall back to mock
  const liveINJ = spcData['INJ-07'];
  const points   = liveINJ?.points?.map(p => p.value) || SPC_DATA.points;
  const stats    = liveINJ?.stats || {};

  const subgroups = points;
  const mr = subgroups.slice(1).map((v,i)=> Math.abs(v - subgroups[i]));
  const mrMean = mr.reduce((a,b)=>a+b,0)/mr.length;

  const displayData = {
    points: subgroups,
    mean:   stats.mean  || SPC_DATA.mean,
    sd:     stats.sd    || SPC_DATA.sd,
    ucl:    stats.ucl   || SPC_DATA.ucl,
    lcl:    stats.lcl   || SPC_DATA.lcl,
    usl:    stats.usl   || SPC_DATA.usl,
    lsl:    stats.lsl   || SPC_DATA.lsl,
    cp:     stats.cp    || SPC_DATA.cp,
    cpk:    stats.cpk   || SPC_DATA.cpk,
    oocIndices:  stats.oocIndices  || SPC_DATA.oocIndices  || [],
    wecoIndices: stats.wecoIndices || SPC_DATA.wecoIndices || [],
  };

  return (
    <div className="p-6 space-y-5">
      <PageHeader
        eyebrow="// STATISTICAL PROCESS CONTROL"
        title="SPC · Control Estadístico"
        desc="Cartas de control X̄–R, MR, histogramas y monitoreo de reglas WECO en tiempo real."
        actions={
          <div className="flex items-center gap-2">
            <div className="panel rounded-md px-3 py-2 text-xs text-slate-300 hairline flex items-center gap-2">
              <span className="text-cyan2-400">{I.cpu}</span> Característica · Diámetro 12.5mm
            </div>
            <button className="panel rounded-md px-3 py-2 text-xs text-slate-300 hairline">Tamaño subgrupo · 5</button>
            <button className="px-3 py-2 text-xs rounded-md bg-cyan2-400/15 border border-cyan2-400/40 text-cyan2-400 flex items-center gap-2">{I.download} PDF</button>
          </div>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        {[
          {l:'X̄',    v:displayData.mean.toFixed(2),  c:'cyan'},
          {l:'σ',    v:displayData.sd.toFixed(3),    c:'cyan'},
          {l:'UCL',  v:displayData.ucl.toFixed(2),   c:'red'},
          {l:'LCL',  v:displayData.lcl.toFixed(2),   c:'red'},
          {l:'Cp',   v:(displayData.cp||1.42).toFixed(2),  c:'green'},
          {l:'Cpk',  v:(displayData.cpk||1.31).toFixed(2), c:'green'},
        ].map(k=>(
          <div key={k.l} className="panel rounded p-3 corners" style={{color: k.c==='red'?'#EF4444':(k.c==='green'?'#10B981':'#22D3EE')}}>
            <div className="text-[10px] uppercase tracking-widest text-slate-500">{k.l}</div>
            <div className="num text-2xl mt-1" style={{color: k.c==='red'?'#EF4444':(k.c==='green'?'#10B981':'#22D3EE'), textShadow:`0 0 14px ${k.c==='red'?'#EF444455':(k.c==='green'?'#10B98155':'#22D3EE55')}`}}>{k.v}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-12 gap-4">
        <Card title="X̄ Chart · subgrupos n=5" subtitle="40 subgrupos · puntos OOC resaltados" className="col-span-12 xl:col-span-8" accent="cyan"
          action={
            <div className="flex gap-1 text-[10px]">
              <Chip color="red">2 OOC</Chip>
              <Chip color="amber">1 WECO</Chip>
            </div>
          }>
          <ControlChart data={displayData.points} mean={displayData.mean} ucl={displayData.ucl} lcl={displayData.lcl} usl={displayData.usl} lsl={displayData.lsl} w={780} h={260}/>
        </Card>

        <Card title="Reglas WECO" subtitle="Detección automática de patrones" className="col-span-12 xl:col-span-4" accent="amber">
          <div className="space-y-2">
            {[
              {n:'1', t:'1 punto fuera de 3σ', s:'OOC #28', c:'red', hit:true},
              {n:'2', t:'9 puntos al mismo lado de X̄', s:'no detectado', c:'green'},
              {n:'3', t:'6 puntos consecutivos crecientes', s:'no detectado', c:'green'},
              {n:'4', t:'14 puntos alternando', s:'no detectado', c:'green'},
              {n:'5', t:'2 de 3 puntos en zona A', s:'#33 #34', c:'amber', hit:true},
              {n:'6', t:'4 de 5 puntos en zona B', s:'no detectado', c:'green'},
              {n:'7', t:'15 puntos en zona C', s:'no detectado', c:'green'},
              {n:'8', t:'8 puntos fuera de zona C', s:'no detectado', c:'green'},
            ].map(r=>(
              <div key={r.n} className="panel rounded p-2 flex items-start gap-2" style={r.hit?{borderColor: r.c==='red'?'rgba(239,68,68,0.35)':'rgba(245,158,11,0.35)', boxShadow:`0 0 14px ${r.c==='red'?'rgba(239,68,68,0.18)':'rgba(245,158,11,0.18)'}`}:{}}>
                <div className={`w-6 h-6 rounded grid place-items-center text-[10px] num font-semibold ${r.hit?(r.c==='red'?'bg-crit-400/15 text-crit-400 border border-crit-400/40':'bg-warn-400/15 text-warn-400 border border-warn-400/40'):'bg-slate-700/40 text-slate-500'}`}>R{r.n}</div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-slate-200">{r.t}</div>
                  <div className={`text-[10px] num ${r.c==='red'?'text-crit-400':(r.c==='amber'?'text-warn-400':'text-slate-500')}`}>{r.s}</div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-12 gap-4">
        <Card title="Moving Range (MR)" subtitle="40 puntos" className="col-span-12 xl:col-span-7" accent="cyan">
          <ControlChart data={mr} mean={mrMean} ucl={mrMean*3.27} lcl={0} usl={mrMean*3.27+0.05} lsl={-0.001} w={680} h={200}/>
        </Card>
        <Card title="Histograma · distribución" subtitle="Con curva normal ajustada" className="col-span-12 xl:col-span-5" accent="ai">
          <Histogram data={subgroups} bins={14} w={420} h={220} color="#A855F7"/>
          <div className="grid grid-cols-3 gap-2 mt-2 text-[11px]">
            <div className="panel rounded p-2"><div className="text-slate-500">μ</div><div className="num text-white">{displayData.mean.toFixed(3)}</div></div>
            <div className="panel rounded p-2"><div className="text-slate-500">σ</div><div className="num text-white">{displayData.sd.toFixed(3)}</div></div>
            <div className="panel rounded p-2"><div className="text-slate-500">Skew</div><div className="num text-white">0.14</div></div>
          </div>
        </Card>
      </div>

      <Card title="Datos de subgrupos · últimas 40 lecturas" subtitle="Característica diámetro [mm]" accent="cyan">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="text-[10px] tracking-widest uppercase text-slate-500">
              <tr className="hairline-bottom">
                <th className="text-left py-2 px-2">#</th>
                <th className="text-left">Timestamp</th>
                <th className="text-left">X̄</th>
                <th className="text-left">R</th>
                <th className="text-left">σ</th>
                <th className="text-left">USL</th><th className="text-left">LSL</th>
                <th className="text-left">Estado</th>
                <th className="text-left">WECO</th>
              </tr>
            </thead>
            <tbody>
              {subgroups.slice(-10).map((v,i)=>{
                const idx = subgroups.length-10+i;
                const ooc = v>displayData.ucl || v<displayData.lcl;
                const warn = v>displayData.usl || v<displayData.lsl;
                const t = new Date(Date.now()-(10-i)*60000);
                return (
                  <tr key={idx} className="hairline-bottom hover:bg-white/[0.02]">
                    <td className="py-1.5 px-2 num text-slate-500">{idx+1}</td>
                    <td className="num text-slate-400">{t.toLocaleTimeString()}</td>
                    <td className={`num ${ooc?'text-crit-400':warn?'text-warn-400':'text-white'}`}>{v.toFixed(3)}</td>
                    <td className="num text-slate-300">{(Math.random()*0.4+0.1).toFixed(3)}</td>
                    <td className="num text-slate-300">{(Math.random()*0.2+0.05).toFixed(3)}</td>
                    <td className="num text-slate-500">{displayData.usl.toFixed(2)}</td>
                    <td className="num text-slate-500">{displayData.lsl.toFixed(2)}</td>
                    <td>{ooc?<Chip color="red">OOC</Chip>:warn?<Chip color="amber">WARN</Chip>:<Chip color="green">OK</Chip>}</td>
                    <td className="text-[10px] num text-slate-500">{ooc?'R1':warn?'R5':'—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
