import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import { supabase } from './supabase';

// ─── Shared: save PDF blob to Supabase + reports table ─────────────────────────
async function savePDFToSupabase(doc, { type, name, author }) {
  if (!supabase) return null;
  const now      = new Date();
  const reportId = `RPT-${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}-${Date.now().toString().slice(-4)}`;
  const fileName = `${reportId}.pdf`;
  try {
    const blob = doc.output('blob');
    const { error: upErr } = await supabase.storage
      .from('reports')
      .upload(fileName, blob, { contentType: 'application/pdf', upsert: true });
    if (!upErr) {
      await supabase.from('reports').insert({
        id: reportId, type, name, author, status: 'Listo',
        content: { storage_path: fileName },
      });
    }
  } catch (e) { console.error('[PDF] Supabase save error:', e.message); }
  return reportId;
}

// ─── Screenshot PDF (html2canvas) ─────────────────────────────────────────────
export async function generatePDF({ elementId, tipo, nombre, autor = 'Sistema' }) {
  const el = document.getElementById(elementId);
  if (!el) throw new Error('Elemento no encontrado');

  const canvas  = await html2canvas(el, {
    backgroundColor: '#06080F', scale: 2, useCORS: true,
    logging: false, scrollX: 0, scrollY: -window.scrollY,
  });

  const imgData = canvas.toDataURL('image/png');
  const doc     = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW   = doc.internal.pageSize.getWidth();
  const pageH   = doc.internal.pageSize.getHeight();
  const imgH    = (canvas.height * pageW) / canvas.width;

  let remaining = imgH, yOffset = 0;
  while (remaining > 0) {
    doc.addImage(imgData, 'PNG', 0, yOffset, pageW, imgH);
    remaining -= pageH;
    yOffset   -= pageH;
    if (remaining > 0) doc.addPage();
  }

  doc.save(`${tipo}-${Date.now()}.pdf`);
  return await savePDFToSupabase(doc, { type: tipo, name: nombre, author: autor });
}

// ─── Data PDF (programmatic, no html2canvas) ───────────────────────────────────
export async function generateDataReport({ type, machine, col, name, author = 'Sistema', stats, alerts = [], csvRows = 0 }) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const W   = doc.internal.pageSize.getWidth();
  const H   = doc.internal.pageSize.getHeight();
  const pad = 14;
  const now = new Date();

  // Color helpers
  const fill = (...c) => doc.setFillColor(...c);
  const ink  = (...c) => doc.setTextColor(...c);
  const line = (...c) => doc.setDrawColor(...c);

  // ── Dark header bar ──────────────────────────────────────────────────────────
  fill(6, 8, 15); doc.rect(0, 0, W, 30, 'F');

  doc.setFont('helvetica', 'bold'); doc.setFontSize(8);
  ink(34, 211, 238);
  doc.text('NEXUS · INDUSTRIAL INTELLIGENCE PLATFORM', pad, 10);

  doc.setFontSize(17);
  ink(255, 255, 255);
  doc.text(name || `Reporte ${type}`, pad, 22);

  doc.setFontSize(8); doc.setFont('helvetica', 'normal');
  ink(100, 116, 139);
  doc.text(now.toLocaleDateString('es-MX', { dateStyle: 'long' }), W - pad, 10, { align: 'right' });
  doc.text(`Generado por ${author}`, W - pad, 17, { align: 'right' });

  fill(34, 211, 238); doc.rect(0, 30, W, 0.7, 'F');

  let y = 40;

  // ── Metadata row ─────────────────────────────────────────────────────────────
  const meta = [
    { label: 'Tipo',      value: type    || '—' },
    { label: 'Máquina',   value: machine || '—' },
    { label: 'Variable',  value: col     || '—' },
    { label: 'Registros', value: csvRows ? String(csvRows) : '—' },
  ];
  const mW = (W - 2 * pad) / meta.length;
  meta.forEach(({ label, value }, i) => {
    const x = pad + i * mW;
    doc.setFontSize(7); doc.setFont('helvetica', 'normal'); ink(100, 116, 139);
    doc.text(label.toUpperCase(), x, y);
    doc.setFontSize(10); doc.setFont('helvetica', 'bold'); ink(30, 41, 59);
    doc.text(String(value), x, y + 6);
  });
  y += 16;

  line(226, 232, 240); doc.setLineWidth(0.3);
  doc.line(pad, y, W - pad, y);
  y += 7;

  // ── SPC stats ────────────────────────────────────────────────────────────────
  if (stats) {
    doc.setFontSize(9); doc.setFont('helvetica', 'bold'); ink(34, 211, 238);
    doc.text('ESTADÍSTICAS DE PROCESO (SPC)', pad, y);
    y += 7;

    const rows = [
      ['Media (X̄)',   fmt(stats.mean, 4), 'σ (desv. est.)',  fmt(stats.sd,  5)],
      ['UCL',          fmt(stats.ucl,  4), 'LCL',             fmt(stats.lcl, 4)],
      ['USL',          fmt(stats.usl,  4), 'LSL',             fmt(stats.lsl, 4)],
      ['Cp',           fmt(stats.cp,   3), 'Cpk',             fmt(stats.cpk, 3)],
    ];
    const cW = (W - 2 * pad) / 4;
    rows.forEach((row, ri) => {
      const ry = y + ri * 8;
      if (ri % 2 === 0) { fill(248, 250, 252); doc.rect(pad, ry - 4, W - 2*pad, 8, 'F'); }
      row.forEach((cell, ci) => {
        const x = pad + ci * cW + 2;
        if (ci % 2 === 0) {
          doc.setFontSize(7); doc.setFont('helvetica', 'normal'); ink(100, 116, 139);
        } else {
          doc.setFontSize(9); doc.setFont('helvetica', 'bold'); ink(30, 41, 59);
        }
        doc.text(cell, x, ry);
      });
    });
    y += rows.length * 8 + 4;

    // Capability verdict
    const cpk = stats.cpk ?? 0;
    const [capLabel, capR, capG, capB] =
      cpk >= 1.33 ? ['Proceso CAPAZ — Cpk ≥ 1.33', 16, 185, 129]
    : cpk >= 1.0  ? ['Proceso MARGINAL — 1.0 ≤ Cpk < 1.33', 245, 158, 11]
    :               ['Proceso NO CAPAZ — Cpk < 1.0', 239, 68, 68];
    doc.setFontSize(9); doc.setFont('helvetica', 'bold'); ink(capR, capG, capB);
    doc.text(`● ${capLabel}`, pad, y);
    y += 5;

    if (stats.oocCount != null) {
      doc.setFontSize(8); doc.setFont('helvetica', 'normal'); ink(100, 116, 139);
      doc.text(`Puntos fuera de control (OOC): ${stats.oocCount}  ·  Muestras totales: ${csvRows}`, pad, y);
      y += 5;
    }

    // Sigma level & yield
    const sigma     = Math.max(0, 3 + (cpk - 1) * 2).toFixed(2);
    const yieldPct  = stats.yield != null ? stats.yield.toFixed(1) : null;
    doc.setFontSize(8); doc.setFont('helvetica', 'normal'); ink(30, 41, 59);
    doc.text(`Nivel sigma: ${sigma}σ${yieldPct ? `  ·  Yield estimado: ${yieldPct}%` : ''}`, pad, y);
    y += 5;

    line(226, 232, 240); doc.line(pad, y, W - pad, y); y += 7;
  }

  // ── Alerts section ───────────────────────────────────────────────────────────
  if (alerts.length > 0) {
    doc.setFontSize(9); doc.setFont('helvetica', 'bold'); ink(34, 211, 238);
    doc.text(`ALERTAS ACTIVAS (${alerts.length})`, pad, y);
    y += 6;

    const colW = [22, 28, 90, 22];
    const hdrs = ['Sev', 'Máquina', 'Descripción', 'Estado'];

    fill(6, 8, 15); doc.rect(pad, y - 4, W - 2*pad, 7, 'F');
    let cx = pad;
    hdrs.forEach((h, i) => {
      doc.setFontSize(7); doc.setFont('helvetica', 'bold'); ink(34, 211, 238);
      doc.text(h, cx + 1.5, y);
      cx += colW[i];
    });
    y += 5;

    alerts.slice(0, 15).forEach((a, ri) => {
      if (y > H - 20) { doc.addPage(); y = 20; }
      if (ri % 2 === 0) { fill(248, 250, 252); doc.rect(pad, y - 4, W - 2*pad, 7, 'F'); }
      const sevC = a.sev === 'CRITICAL' ? [239,68,68] : a.sev === 'HIGH' ? [245,158,11] : [100,116,139];
      const cells = [a.sev || '—', a.machine || '—', (a.title || '—').slice(0, 44), a.status || '—'];
      let cx2 = pad;
      cells.forEach((txt, i) => {
        doc.setFontSize(7.5);
        doc.setFont('helvetica', i === 0 ? 'bold' : 'normal');
        ink(...(i === 0 ? sevC : [30, 41, 59]));
        doc.text(txt, cx2 + 1.5, y);
        cx2 += colW[i];
      });
      y += 7;
    });
    if (alerts.length > 15) {
      doc.setFontSize(7.5); ink(100, 116, 139);
      doc.text(`+ ${alerts.length - 15} alertas más…`, pad, y);
    }
  }

  // ── Footer ───────────────────────────────────────────────────────────────────
  fill(6, 8, 15); doc.rect(0, H - 12, W, 12, 'F');
  doc.setFontSize(7); doc.setFont('helvetica', 'normal'); ink(100, 116, 139);
  doc.text('© 2026 NEXUS Industries · Confidential', pad, H - 5);
  doc.text(`${now.toISOString()}`, W - pad, H - 5, { align: 'right' });

  const fileName = `Reporte-${type}-${Date.now()}.pdf`;
  doc.save(fileName);
  return await savePDFToSupabase(doc, { type, name: name || `Reporte ${type}`, author });
}

function fmt(v, decimals = 3) {
  return v != null && !isNaN(v) ? Number(v).toFixed(decimals) : '—';
}

// ─── Download from Supabase Storage ───────────────────────────────────────────
export async function downloadSavedPDF(storagePath, fileName) {
  if (!supabase) return;
  const { data, error } = await supabase.storage.from('reports').download(storagePath);
  if (error || !data) { console.error('[Storage] download:', error?.message); return; }
  const url = URL.createObjectURL(data);
  const a   = document.createElement('a');
  a.href = url; a.download = fileName || storagePath.split('/').pop();
  a.click();
  URL.revokeObjectURL(url);
}
