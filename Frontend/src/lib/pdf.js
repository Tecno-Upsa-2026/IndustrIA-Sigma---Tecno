import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import { supabase } from './supabase';

export async function generatePDF({ elementId, tipo, nombre, autor = 'Sistema' }) {
  const el = document.getElementById(elementId);
  if (!el) throw new Error('Elemento no encontrado');

  // Capture the element
  const canvas = await html2canvas(el, {
    backgroundColor: '#06080F',
    scale: 2,
    useCORS: true,
    logging: false,
    scrollX: 0,
    scrollY: -window.scrollY,
  });

  const imgData  = canvas.toDataURL('image/png');
  const pdf      = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW    = pdf.internal.pageSize.getWidth();
  const pageH    = pdf.internal.pageSize.getHeight();
  const imgH     = (canvas.height * pageW) / canvas.width;

  // Add pages if content overflows
  let remaining = imgH;
  let yOffset   = 0;
  while (remaining > 0) {
    pdf.addImage(imgData, 'PNG', 0, yOffset, pageW, imgH);
    remaining -= pageH;
    yOffset   -= pageH;
    if (remaining > 0) pdf.addPage();
  }

  // Generate ID and filename
  const now      = new Date();
  const reportId = `RPT-${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}-${Date.now().toString().slice(-4)}`;
  const fileName = `${reportId}.pdf`;

  // Download to browser
  pdf.save(fileName);

  // Save to Supabase Storage + reports table
  if (supabase) {
    try {
      const pdfBlob  = pdf.output('blob');
      const path     = fileName;

      const { error: upErr } = await supabase.storage
        .from('reports')
        .upload(path, pdfBlob, { contentType: 'application/pdf', upsert: true });

      if (upErr) {
        console.error('[Storage] PDF upload:', upErr.message);
      } else {
        await supabase.from('reports').insert({
          id:     reportId,
          type:   tipo,
          name:   nombre,
          author: autor,
          status: 'Listo',
          content: { storage_path: path },
        });
      }
    } catch (e) {
      console.error('[PDF] Supabase save error:', e.message);
    }
  }

  return reportId;
}

export async function downloadSavedPDF(storagePath, fileName) {
  if (!supabase) return;
  const { data, error } = await supabase.storage.from('reports').download(storagePath);
  if (error || !data) { console.error('[Storage] download:', error?.message); return; }
  const url = URL.createObjectURL(data);
  const a   = document.createElement('a');
  a.href    = url;
  a.download = fileName || storagePath.split('/').pop();
  a.click();
  URL.revokeObjectURL(url);
}
