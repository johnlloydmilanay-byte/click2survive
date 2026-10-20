'use strict';
// PDF reports for both dashboards (jsPDF + AutoTable, loaded on first use so the
// dashboards stay light).
//
// Every report follows the same reading order so teachers, school heads and parents
// can skim it: header → "At a glance" numbers → Key findings (plain sentences) →
// Recommended next steps → numbered detail sections → "How to read this report" →
// signatures. PdfReport is the layout helper; the insight helpers turn data into the
// plain-language findings; the build*Report functions assemble each document.
// Reports open in an in-app preview (Print / Download); phones download directly.

const PDF_LIBS = [
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js'
];
let _pdfLibs = null;
function loadPdfLibs(){
  if (_pdfLibs) return _pdfLibs;
  _pdfLibs = PDF_LIBS.reduce((p, src) => p.then(() => new Promise((res, rej) => {
    const s = document.createElement('script'); s.src = src; s.onload = res;
    s.onerror = () => rej(new Error('Could not load the PDF library. Check your internet connection.'));
    document.head.appendChild(s);
  })), Promise.resolve()).catch(e => { _pdfLibs = null; throw e; });
  return _pdfLibs;
}
// The logo is an SVG; jsPDF needs a bitmap, so draw it onto a canvas once.
let _logoPng = null;
function loadLogoPng(){
  if (_logoPng) return _logoPng;
  _logoPng = new Promise(res => {
    const img = new Image();
    img.onload = () => { try { const c = document.createElement('canvas'); c.width = c.height = 240; c.getContext('2d').drawImage(img, 0, 0, 240, 240); res(c.toDataURL('image/png')); } catch(e){ res(null); } };
    img.onerror = () => res(null);
    img.src = 'icons/logo-mark.svg';
  });
  return _logoPng;
}

// The built-in PDF fonts only cover Latin-1, so map the few symbols this data uses.
function pdfSafe(v){
  return String(v == null ? '' : v)
    .replace(/[“”„]/g, '"').replace(/[‘’‚]/g, "'").replace(/[–—−]/g, '-').replace(/…/g, '...')
    .replace(/≥/g, '>=').replace(/≤/g, '<=').replace(/≠/g, '!=').replace(/→/g, '->').replace(/·/g, '-')
    .replace(/ρ/g, 'rho').replace(/Δ/g, 'delta').replace(/[✓✔]/g, 'Yes').replace(/[✗✕]/g, 'No')
    .replace(/[^\x00-\xFF]/g, '');
}
function clip(s, n){ s = String(s || ''); return s.length > n ? s.slice(0, n - 1).trimEnd() + '...' : s; }

const PDF_TONE = {
  good:{ fill:[233,247,233], text:[10,107,10], bar:[12,163,12] },
  warn:{ fill:[255,246,224], text:[134,90,0], bar:[250,178,25] },
  serious:{ fill:[253,240,234], text:[163,64,26], bar:[236,131,90] },
  crit:{ fill:[252,234,234], text:[180,35,35], bar:[208,59,59] },
  info:{ fill:[239,246,255], text:[29,78,216], bar:[37,99,235] },
  none:{ fill:[241,245,249], text:[71,85,105], bar:[203,213,225] }
};
const INK = [15,23,42], INK2 = [71,85,105], INK3 = [100,116,139], LINE = [226,232,240], SOFT = [248,250,252], BRAND = [37,99,235], NAVY = [15,27,51];
const PASS = 75; // DepEd passing mark

function reportSchoolName(){ try { return localStorage.getItem('c2s_report_school') || ''; } catch(e){ return ''; } }

// ── Plain-language labels ─────────────────────────────────────────────────
function studentStatus(p){
  if (p == null) return { label:'Not yet played', tone:'none' };
  if (p >= PASS) return { label:'Passed', tone:'good' };
  if (p >= 50) return { label:'Almost there', tone:'warn' };
  return { label:'Needs support', tone:'crit' };
}
function itemStatus(p){
  if (p == null) return { label:'No answers yet', tone:'none' };
  if (p >= PASS) return { label:'Learned', tone:'good' };
  if (p >= 50) return { label:'Review', tone:'warn' };
  return { label:'Re-teach', tone:'crit' };
}
function plainDifficulty(p){
  if (p == null) return '-';
  return p >= 81 ? 'Very easy' : p >= 61 ? 'Easy' : p >= 41 ? 'Moderate' : p >= 21 ? 'Hard' : 'Very hard';
}
function plainQuality(D){
  if (D == null) return 'Not enough data';
  if (D >= .30) return 'Good question';
  if (D >= .20) return 'Fair - could be clearer';
  if (D >= 0) return 'Weak - revise wording';
  return 'Problem - check answer key';
}
function pctOf(n, d){ return d ? Math.round(n / d * 100) : 0; }
function plural(n, one, many){ return `${n} ${n === 1 ? one : (many || one + 's')}`; }
function namesList(arr, max){ max = max || 6; const s = arr.slice(0, max).join(', '); return arr.length > max ? `${s} and ${arr.length - max} more` : s; }

class PdfReport {
  constructor(o){
    const { jsPDF } = window.jspdf;
    this.doc = new jsPDF({ unit:'mm', format:'a4', orientation:'portrait' });
    this.W = this.doc.internal.pageSize.getWidth(); this.H = this.doc.internal.pageSize.getHeight();
    this.M = 14; this.CW = this.W - 2 * this.M; this.title = o.title; this.y = 0; this.sec = 0;
    this.doc.setProperties({ title:pdfSafe(o.title), subject:'Click to Survive report', author:pdfSafe(o.author || ''), creator:'Click to Survive' });
    this._header(o);
  }
  _header(o){
    const d = this.doc, M = this.M;
    d.setFillColor(...NAVY); d.rect(0, 0, this.W, 32, 'F');
    d.setFillColor(...BRAND); d.rect(0, 32, this.W, 1.2, 'F');
    let tx = M;
    if (o.logo){ try { d.addImage(o.logo, 'PNG', M, 7, 18, 18); tx = M + 22; } catch(e){} }
    d.setTextColor(255,255,255); d.setFont('helvetica','bold'); d.setFontSize(15); d.text('Click to Survive', tx, 15);
    d.setFont('helvetica','normal'); d.setFontSize(8.5); d.setTextColor(191,205,228);
    const school = reportSchoolName();
    d.text(pdfSafe(school || 'Disaster Risk Education - Science'), tx, 21);
    if (school){ d.setFontSize(7.5); d.text('Disaster Risk Education - Science', tx, 25.5); }
    d.setFontSize(7.5); d.setTextColor(147,197,253); d.text(pdfSafe((o.kind || 'REPORT').toUpperCase()), this.W - M, 13, { align:'right' });
    d.setFontSize(8); d.setTextColor(191,205,228);
    d.text(pdfSafe(new Date().toLocaleDateString([], { year:'numeric', month:'long', day:'numeric' })), this.W - M, 19, { align:'right' });
    if (o.author) d.text(pdfSafe('Prepared by ' + o.author), this.W - M, 24.5, { align:'right' });

    d.setTextColor(...INK); d.setFont('helvetica','bold'); d.setFontSize(18);
    d.text(pdfSafe(o.title), M, 45);
    let y = 45;
    if (o.subtitle){ d.setFont('helvetica','normal'); d.setFontSize(10); d.setTextColor(...INK2); d.text(pdfSafe(o.subtitle), M, y + 6); y += 6; }
    if (o.meta && o.meta.length){
      y += 5;
      const cols = Math.min(4, o.meta.length), rows = Math.ceil(o.meta.length / cols), cw = this.CW / cols, h = rows * 12 + 4;
      d.setFillColor(...SOFT); d.setDrawColor(...LINE); d.roundedRect(M, y, this.CW, h, 2, 2, 'FD');
      o.meta.forEach(([k, v], i) => {
        const cx = M + 4 + (i % cols) * cw, cy = y + 6 + Math.floor(i / cols) * 12;
        d.setFont('helvetica','normal'); d.setFontSize(7); d.setTextColor(...INK3); d.text(pdfSafe(k).toUpperCase(), cx, cy);
        d.setFont('helvetica','bold'); d.setFontSize(9.5); d.setTextColor(...INK); d.text(d.splitTextToSize(pdfSafe(v), cw - 6)[0], cx, cy + 5);
      });
      y += h;
    }
    this.y = y + 7;
  }
  ensure(h){ if (this.y + h > this.H - 18){ this.doc.addPage(); this.y = 18; return true; } return false; }

  // Numbered section heading: a blue number chip, the title, an optional one-line explainer.
  section(text, sub){
    this.y += 3;
    const d = this.doc, l = sub ? d.splitTextToSize(pdfSafe(sub), this.CW) : [];
    this.ensure(14 + l.length * 3.9);
    this.sec++;
    d.setFillColor(...BRAND); d.circle(this.M + 3.2, this.y - 1.3, 3.2, 'F');
    d.setTextColor(255,255,255); d.setFont('helvetica','bold'); d.setFontSize(8.5); d.text(String(this.sec), this.M + 3.2, this.y - .1, { align:'center' });
    d.setTextColor(...INK); d.setFontSize(12.5); d.text(pdfSafe(text), this.M + 9, this.y);
    this.y += 5;
    if (l.length){ d.setFont('helvetica','normal'); d.setFontSize(8.5); d.setTextColor(...INK2); d.text(l, this.M, this.y); this.y += l.length * 3.9 + 1.5; }
    this.y += 1.5;
  }
  subheading(text){
    this.ensure(9);
    const d = this.doc; d.setFont('helvetica','bold'); d.setFontSize(9.5); d.setTextColor(...INK); d.text(pdfSafe(text), this.M, this.y); this.y += 4.5;
  }
  para(text, o){
    o = o || {};
    const d = this.doc; d.setFont('helvetica', o.bold ? 'bold' : 'normal'); d.setFontSize(o.size || 9); d.setTextColor(...(o.color || INK2));
    const l = d.splitTextToSize(pdfSafe(text), this.CW - (o.indent||0));
    this.ensure(l.length * 4 + 2); d.text(l, this.M + (o.indent||0), this.y); this.y += l.length * ((o.size || 9) * .43) + (o.gap ?? 2);
  }
  // Big-number boxes. k = { label, value, sub, tone }
  kpis(list){
    const d = this.doc, M = this.M, per = Math.min(4, list.length), gap = 3, w = (this.CW - gap*(per-1)) / per, h = 22;
    for (let i = 0; i < list.length; i += per){
      this.ensure(h + 3);
      list.slice(i, i + per).forEach((k, j) => {
        const x = M + j * (w + gap), t = PDF_TONE[k.tone] || null;
        d.setFillColor(255,255,255); d.setDrawColor(...LINE); d.roundedRect(x, this.y, w, h, 2, 2, 'FD');
        d.setFillColor(...(t ? t.bar : BRAND)); d.rect(x, this.y + 2, 1.1, h - 4, 'F');
        d.setFont('helvetica','normal'); d.setFontSize(7.5); d.setTextColor(...INK3); d.text(d.splitTextToSize(pdfSafe(k.label), w - 7)[0], x + 4, this.y + 5.5);
        d.setFont('helvetica','bold'); d.setFontSize(16); d.setTextColor(...(t ? t.text : INK)); d.text(pdfSafe(k.value), x + 4, this.y + 13.5);
        if (k.sub){ d.setFont('helvetica','normal'); d.setFontSize(7.5); d.setTextColor(...INK2); d.text(d.splitTextToSize(pdfSafe(k.sub), w - 7)[0], x + 4, this.y + 18.5); }
      });
      this.y += h + 3;
    }
    this.y += 1;
  }
  // Coloured note with a title and bullet points (findings, next steps, tips).
  callout(title, items, tone){
    items = (items || []).filter(Boolean);
    if (!items.length) return;
    const d = this.doc, t = PDF_TONE[tone || 'info'], tw = this.CW - 13;
    d.setFontSize(9);
    const lines = items.map(s => d.splitTextToSize(pdfSafe(s), tw));
    const h = 10 + lines.reduce((a, l) => a + l.length * 4 + 1.6, 0) + 1;
    this.ensure(Math.min(h, 120));
    d.setFillColor(...t.fill); d.roundedRect(this.M, this.y, this.CW, h, 2, 2, 'F');
    d.setFillColor(...t.bar); d.rect(this.M, this.y, 1.4, h, 'F');
    d.setFont('helvetica','bold'); d.setFontSize(10); d.setTextColor(...t.text); d.text(pdfSafe(title), this.M + 5, this.y + 6.5);
    let yy = this.y + 12;
    d.setFont('helvetica','normal'); d.setFontSize(9); d.setTextColor(...INK);
    lines.forEach(l => {
      d.setFillColor(...t.bar); d.circle(this.M + 6.5, yy - 1.2, .8, 'F');
      d.text(l, this.M + 9, yy); yy += l.length * 4 + 1.6;
    });
    this.y += h + 4;
  }
  // Horizontal bars with a dashed 75% passing line. rows = [{label, value, right, tone}]
  bars(rows, o){
    o = o || {};
    if (!rows.length) return;
    const d = this.doc, M = this.M, lw = o.labelW || 62, rw = o.rightW || 30, bx = M + lw, bw = this.CW - lw - rw;
    d.setFont('helvetica','normal'); d.setFontSize(8.3);
    const labels = rows.map(r => d.splitTextToSize(pdfSafe(r.label), lw - 3).slice(0, 2));
    const rhs = labels.map(l => l.length > 1 ? 9.6 : 7.2);
    const total = rhs.reduce((a, b) => a + b, 0) + 6;
    if (total < 110) this.ensure(total);
    d.setFont('helvetica','normal'); d.setFontSize(7); d.setTextColor(...INK3);
    d.text('0%', bx, this.y); d.text('100%', bx + bw, this.y, { align:'right' });
    if (o.pass !== false){ d.setTextColor(...INK2); d.text(`${PASS}% passing`, bx + bw * PASS / 100, this.y, { align:'center' }); }
    this.y += 2.5;
    rows.forEach((r, i) => {
      const rh = rhs[i], by = this.y + (rh - 3.8) / 2 - .8;
      this.ensure(rh);
      d.setFont('helvetica','normal'); d.setFontSize(8.3); d.setTextColor(...INK);
      d.text(labels[i], M, this.y + (labels[i].length > 1 ? 3 : 3.6));
      d.setFillColor(...LINE); d.roundedRect(bx, by, bw, 3.8, 1.2, 1.2, 'F');
      const v = Math.max(0, Math.min(100, r.value || 0));
      if (v){ d.setFillColor(...(PDF_TONE[r.tone || itemStatus(r.value).tone] || PDF_TONE.none).bar); d.roundedRect(bx, by, Math.max(1.5, bw * v / 100), 3.8, 1.2, 1.2, 'F'); }
      d.setFont('helvetica','bold'); d.setFontSize(8.3); d.setTextColor(...INK); d.text(pdfSafe(r.right), this.W - M, by + 2.9, { align:'right' });
      if (o.pass !== false){ // dashed passing line, drawn per row so it survives page breaks
        const px = bx + bw * PASS / 100; d.setDrawColor(...INK2); d.setLineWidth(.25); d.setLineDashPattern([.8, .8], 0);
        d.line(px, this.y, px, this.y + rh); d.setLineDashPattern([], 0);
      }
      this.y += rh;
    });
    this.y += 3;
  }
  // One stacked bar showing how many students sit in each mastery group.
  masteryStack(scores, notPlayed){
    const { groups, total } = masteryGroups(scores, notPlayed);
    if (!total){ this.para('No students yet.'); return; }
    const d = this.doc, M = this.M, w = this.CW;
    this.ensure(22);
    let x = M;
    const segs = [...groups.map(g => ({ n:g.n, t:g.tone })), { n:notPlayed || 0, t:'none' }];
    segs.forEach(s => {
      if (!s.n) return; const sw = w * s.n / total;
      d.setFillColor(...PDF_TONE[s.t].bar); d.rect(x, this.y, Math.max(.8, sw - .6), 7, 'F');
      if (sw > 9){ d.setFont('helvetica','bold'); d.setFontSize(8); d.setTextColor(s.t === 'none' || s.t === 'warn' ? 15 : 255, s.t === 'none' || s.t === 'warn' ? 23 : 255, s.t === 'none' || s.t === 'warn' ? 42 : 255); d.text(String(s.n), x + sw / 2, this.y + 4.8, { align:'center' }); }
      x += sw;
    });
    this.y += 11;
    d.setFontSize(8); let lx = M;
    [...groups.map(g => [`${g.label} (${g.range})`, g.n, g.tone]), ...(notPlayed ? [['Not yet played', notPlayed, 'none']] : [])].forEach(([l, n, t]) => {
      const txt = pdfSafe(`${l}: ${n}`); const tw = d.getTextWidth(txt) + 9;
      if (lx + tw > this.W - M){ lx = M; this.y += 5; }
      d.setFillColor(...PDF_TONE[t].bar); d.rect(lx, this.y - 2.6, 3, 3, 'F'); d.setFont('helvetica','normal'); d.setTextColor(...INK2); d.text(txt, lx + 4.5, this.y); lx += tw;
    });
    this.y += 7;
  }
  // AutoTable wrapper. toneCols: { colIndex: rowIndex => tone } colours those cells.
  table(head, body, o){
    o = o || {};
    if (!body.length){ this.para(o.empty || 'Nothing to show yet.', { color:INK3 }); return; }
    const est = (body.length + 1) * 7.5;
    this.ensure(est <= 70 ? est : 22); // short tables stay together; long ones start with a few rows
    const toneCols = o.toneCols || {};
    this.doc.autoTable({
      startY: this.y, head:[head.map(pdfSafe)], body: body.map(r => r.map(pdfSafe)),
      margin:{ left:this.M, right:this.M, top:18, bottom:18 }, theme:'plain',
      styles:{ font:'helvetica', fontSize:o.fontSize || 8.4, cellPadding:{ top:2, bottom:2, left:2.2, right:2.2 }, textColor:INK, valign:'middle', overflow:'linebreak', lineColor:LINE, lineWidth:{ bottom:.2 } },
      headStyles:{ fillColor:[241,245,249], textColor:INK2, fontStyle:'bold', fontSize:(o.fontSize || 8.4) - .4, lineWidth:0 },
      alternateRowStyles:{ fillColor:[251,252,254] },
      columnStyles: o.columnStyles || {},
      showHead:'everyPage',
      didParseCell: data => {
        if (data.section !== 'body') return;
        const f = toneCols[data.column.index]; if (!f) return;
        const tone = f(data.row.index); const t = tone && PDF_TONE[tone]; if (!t) return;
        data.cell.styles.fillColor = t.fill; data.cell.styles.textColor = t.text; data.cell.styles.fontStyle = 'bold';
      }
    });
    this.y = this.doc.lastAutoTable.finalY + 5;
  }
  // Two-column glossary at the end of each report.
  guide(entries){
    this.section('How to read this report');
    this.table(['Term', 'What it means'], entries, { fontSize:8, columnStyles:{ 0:{ cellWidth:44, fontStyle:'bold' } } });
  }
  signatures(labels){
    this.ensure(32); this.y += 6;
    const d = this.doc, w = this.CW / labels.length;
    labels.forEach(([role, name], i) => {
      const x = this.M + i * w;
      d.setFont('helvetica','normal'); d.setFontSize(8.5); d.setTextColor(...INK2); d.text(pdfSafe(role), x, this.y);
      d.setDrawColor(...INK3); d.setLineWidth(.3); d.line(x, this.y + 13, x + w - 12, this.y + 13);
      d.setFont('helvetica','bold'); d.setTextColor(...INK); d.text(pdfSafe(name || ''), x, this.y + 11);
      d.setFont('helvetica','normal'); d.setFontSize(7.5); d.setTextColor(...INK3); d.text('Signature over printed name / Date', x, this.y + 17);
    });
    this.y += 22;
  }
  finish(filename){
    const d = this.doc, n = d.getNumberOfPages();
    for (let i = 1; i <= n; i++){
      d.setPage(i);
      if (i > 1){ d.setFont('helvetica','bold'); d.setFontSize(8); d.setTextColor(...INK3); d.text(pdfSafe('Click to Survive  |  ' + this.title), this.M, 10); d.setDrawColor(...LINE); d.setLineWidth(.3); d.line(this.M, 12, this.W - this.M, 12); }
      d.setDrawColor(...LINE); d.setLineWidth(.3); d.line(this.M, this.H - 12, this.W - this.M, this.H - 12);
      d.setFont('helvetica','normal'); d.setFontSize(7.5); d.setTextColor(...INK3);
      d.text(pdfSafe('Click to Survive  |  ' + this.title + '  |  For school use only'), this.M, this.H - 7);
      d.text(`Page ${i} of ${n}`, this.W - this.M, this.H - 7, { align:'right' });
    }
    _lastPdf = { doc: d, filename, title: this.title };
    return filename;
  }
}

// ── Preview: show the finished PDF in a dialog with Print and Download ─────
let _lastPdf = null, _previewUrl = null;
function ensurePreviewDialog(){
  let m = document.getElementById('pdf-preview');
  if (m) return m;
  m = document.createElement('div');
  m.className = 'modal-overlay'; m.id = 'pdf-preview'; m.style.display = 'none';
  m.innerHTML = `<div class="modal-card pdf-card" role="dialog" aria-modal="true" aria-labelledby="pdf-preview-title" tabindex="-1">
    <div class="pdf-bar">
      <div class="pdf-name">${ico('file-earmark-pdf')}<div><h2 id="pdf-preview-title">Report preview</h2><div class="modal-sub" id="pdf-preview-sub"></div></div></div>
      <div class="row">
        <button class="btn secondary" id="pdf-print-btn">${ico('printer')}Print</button>
        <button class="btn primary" id="pdf-dl-btn">${ico('download')}Download PDF</button>
        <button class="icon-btn" onclick="closeModal('pdf-preview')" aria-label="Close preview">${ico('x-lg')}</button>
      </div>
    </div>
    <iframe id="pdf-frame" title="Report preview"></iframe>
  </div>`;
  document.body.appendChild(m);
  return m;
}
function previewWanted(){ return !(matchMedia('(pointer: coarse)').matches || innerWidth < 760); }
function showPdfPreview(pdf){
  const m = ensurePreviewDialog();
  if (_previewUrl) URL.revokeObjectURL(_previewUrl);
  _previewUrl = URL.createObjectURL(pdf.doc.output('blob'));
  document.getElementById('pdf-preview-title').textContent = pdf.title;
  document.getElementById('pdf-preview-sub').textContent = `${pdf.doc.getNumberOfPages()} page${pdf.doc.getNumberOfPages()===1?'':'s'} · ${pdf.filename}`;
  const frame = document.getElementById('pdf-frame');
  frame.src = _previewUrl + '#view=FitH';
  document.getElementById('pdf-dl-btn').onclick = () => { pdf.doc.save(pdf.filename); toast(`Downloaded ${pdf.filename}`); };
  document.getElementById('pdf-print-btn').onclick = () => {
    try { frame.contentWindow.focus(); frame.contentWindow.print(); }
    catch(e){ window.open(_previewUrl, '_blank'); }
  };
  openModal('pdf-preview');
}

// Runs a builder with a busy state on the button that triggered it, then previews it.
async function generatePdf(btn, build){
  const label = btn ? btn.innerHTML : '';
  if (btn){ btn.disabled = true; btn.setAttribute('aria-busy', 'true'); btn.innerHTML = `${ico('hourglass-split')}<span>Preparing…</span>`; }
  try{
    await loadPdfLibs();
    window.__reportLogo = await loadLogoPng();
    _lastPdf = null;
    const name = build();
    if (!_lastPdf) throw new Error('The report could not be created.');
    if (previewWanted()) showPdfPreview(_lastPdf);
    else { _lastPdf.doc.save(_lastPdf.filename); toast(`Report downloaded: ${name}`); }
  }catch(e){
    console.error(e); toast(e.message || 'Could not generate the report.', 'err');
  }finally{
    if (btn){ btn.disabled = false; btn.removeAttribute('aria-busy'); btn.innerHTML = label; }
  }
}
function newReport(o){ return new PdfReport({ ...o, logo: window.__reportLogo }); }

// ── Insight helpers: turn the numbers into plain sentences ────────────────
// cls = { roster:[student], attempts:[attempt], results:[result], grade, sectionName(id) }
function classInsights(cls){
  const latest = latestByStudent(cls.attempts);
  const scores = [...latest.values()].map(a => a.percentScore || 0);
  const mps = mean(scores), n = cls.roster.length, played = cls.roster.filter(s => latest.has(s.id));
  const notPlayed = cls.roster.filter(s => !latest.has(s.id));
  const passed = played.filter(s => latest.get(s.id).percentScore >= PASS);
  const support = played.filter(s => latest.get(s.id).percentScore < 50).sort((a,b) => latest.get(a.id).percentScore - latest.get(b.id).percentScore);
  const ia = computeItemAnalysis(cls.grade, cls.attempts, cls.results);
  const comps = ia.competencies.filter(c => c.n).sort((a,b) => b.p - a.p);
  const items = ia.items.filter(i => i.n).sort((a,b) => a.p - b.p);
  // Growth: first vs latest run for students who played more than once.
  const growth = [];
  played.forEach(s => {
    const runs = cls.attempts.filter(a => a.studentId === s.id).sort((a,b) => toMillis(a.finishedAt) - toMillis(b.finishedAt));
    if (runs.length > 1) growth.push(runs[runs.length-1].percentScore - runs[0].percentScore);
  });
  const findings = [], actions = [];
  if (!n){ findings.push('No students are enrolled yet.'); return { latest, scores, mps, ia, findings, actions, passed, support, notPlayed, comps, items }; }
  findings.push(`${played.length} of ${n} students (${pctOf(played.length, n)}%) have finished at least one run.`);
  if (played.length){
    findings.push(`The average score is ${pct(mps)}, which is "${mastery(mps).label}" on the DepEd scale. ${passed.length} student${passed.length===1?'':'s'} (${pctOf(passed.length, played.length)}% of those who played) reached the ${PASS}% passing mark.`);
    if (comps.length > 1) findings.push(`Strongest topic: ${comps[0].comp} (${pct(comps[0].p)} correct). Weakest topic: ${comps[comps.length-1].comp} (${pct(comps[comps.length-1].p)} correct).`);
    else if (comps.length === 1) findings.push(`Topic covered: ${comps[0].comp} (${pct(comps[0].p)} correct).`);
    if (items.length){
      const h = items[0];
      findings.push(`The hardest question was Item ${h.no} - only ${pct(h.p)} answered it correctly${h.topWrong ? `; the most common wrong answer was "${clip(trimDot(h.topWrong.text), 90)}"` : ''}.`);
    }
    if (growth.length) { const g = mean(growth); findings.push(`${plural(growth.length, 'student')} played more than once; on average their score ${g >= 0 ? 'went up' : 'went down'} by ${Math.abs(Math.round(g))} points from their first to their latest run.`); }
  }
  const reteach = items.filter(i => i.p < 50);
  if (reteach.length){
    const w = reteach[0];
    actions.push(`Re-teach ${reteach.length === 1 ? `Item ${w.no}` : `Items ${reteach.map(i => i.no).join(', ')}`} (below 50% correct). Start with the misconception behind Item ${w.no}${w.topWrong ? `: many chose "${clip(trimDot(w.topWrong.text), 80)}"` : ''}.`);
  } else if (items.some(i => i.p < PASS)) {
    actions.push(`Briefly review Items ${items.filter(i => i.p < PASS).map(i => i.no).join(', ')} - most students are close but below ${PASS}%.`);
  }
  if (support.length) actions.push(`Give extra help to ${plural(support.length, 'student')} who scored below 50%: ${namesList(support.map(s => s.name))}.`);
  if (notPlayed.length) actions.push(`Follow up with ${plural(notPlayed.length, 'student')} who have not played yet: ${namesList(notPlayed.map(s => s.name))}.`);
  if (played.length && !support.length && !reteach.length) actions.push('The class is doing well. Consider enrichment activities or moving to the next topic.');
  return { latest, scores, mps, ia, findings, actions, passed, support, notPlayed, comps, items };
}

const GUIDE_BASIC = [
  ['Score', 'The share of questions a student answered correctly in one run of the game.'],
  ['Average score (MPS)', 'Mean Percentage Score: the average of every student\'s latest score.'],
  [`Passing mark (${PASS}%)`, 'The DepEd passing level. The dashed line in the charts marks it.'],
  ['Mastery level', 'DepEd descriptor for a score: Mastered (96-100%), Closely approximating mastery (86-95%), Moving towards mastery (66-85%), Average (35-65%), Low (15-34%), Very low (5-14%), Absolutely no mastery (0-4%).'],
  ['Passed / Almost there / Needs support', `Passed = ${PASS}% or higher. Almost there = 50-74%. Needs support = below 50%.`],
  ['Learned / Review / Re-teach', `For a question or topic: Learned = ${PASS}%+ answered correctly; Review = 50-74%; Re-teach = below 50%.`]
];
const GUIDE_ITEMS = [
  ['Difficulty', 'How many students got the question right: Very easy (81-100%), Easy (61-80%), Moderate (41-60%), Hard (21-40%), Very hard (0-20%).'],
  ['Question quality (D)', 'Discrimination index: compares the top 27% and bottom 27% of runs. A good question is answered correctly more often by stronger students (D 0.30 or higher). Needs at least 6 runs.'],
  ['Most common wrong answer', 'The wrong choice picked most often - usually the misconception to address first.']
];
function competencyRows(ia){ return ia.competencies.filter(c => c.n).map(c => ({ label:c.comp, value:c.p, right:`${pct(c.p)}  (${c.correct}/${c.n})` })); }
function itemRows(ia){ return ia.items.filter(i => i.n).map(i => ({ label:`Item ${i.no} - ${i.comp}`, value:i.p, right:`${pct(i.p)}  (${i.correct}/${i.n})` })); }
function scoreBandTable(r, scores, notPlayed){
  const { groups } = masteryGroups(scores, notPlayed); const total = scores.length + notPlayed;
  r.table(['Mastery group', 'Score range', 'Students', 'Share of class'],
    [...groups.map(g => [g.label, g.range, g.n, pctOf(g.n, total) + '%']), ...(notPlayed ? [['Not yet played', '-', notPlayed, pctOf(notPlayed, total) + '%']] : [])],
    { toneCols:{ 0: i => i < groups.length ? groups[i].tone : 'none' }, columnStyles:{ 2:{ halign:'right' }, 3:{ halign:'right' } } });
}

// ── Report: class / section performance ───────────────────────────────────
// d = { grade, sectionLabel, sections:[rollup], roster:[student], attempts, results, sectionName(id) }
function buildClassReport(d, meta){
  const ins = classInsights(d);
  const played = d.roster.length - ins.notPlayed.length;
  const r = newReport({ kind:'Class report', title:`Class Performance Report`, subtitle:`Grade ${d.grade} - ${(GRADES[d.grade] || {}).topic || ''}`, author:meta.author, meta:[
    ['Grade', `Grade ${d.grade}`], ['Section', d.sectionLabel || 'All sections'], ['Teacher', meta.teacher || meta.author || '-'], ['Runs counted', `${d.attempts.length} (latest per student)`] ] });
  r.kpis([
    { label:'Students who played', value:`${played} / ${d.roster.length}`, sub:`${pctOf(played, d.roster.length)}% participation`, tone: played === d.roster.length && played ? 'good' : 'info' },
    { label:'Average score', value:pct(ins.mps), sub:mastery(ins.mps).label, tone:mastery(ins.mps).tone },
    { label:`Passed (${PASS}% or higher)`, value:String(ins.passed.length), sub: played ? `${pctOf(ins.passed.length, played)}% of players` : '-', tone: ins.passed.length ? 'good' : 'none' },
    { label:'Need support (below 50%)', value:String(ins.support.length), sub: ins.support.length ? 'See next steps' : 'None', tone: ins.support.length ? 'crit' : 'good' }
  ]);
  r.callout('Key findings', ins.findings, 'info');
  r.callout('Recommended next steps', ins.actions, 'warn');

  r.section('How the class is doing', 'Each student is counted once, using their most recent run.');
  r.masteryStack(ins.scores, ins.notPlayed.length);
  scoreBandTable(r, ins.scores, ins.notPlayed.length);
  if (d.sections.length > 1){
    r.subheading('By section');
    r.bars(d.sections.filter(s => s.played).map(s => ({ label:s.name, value:s.mps, right:`${pct(s.mps)}  (${s.played}/${s.enrolled} played)` })), { rightW:40 });
  }
  if (ins.ia.attempts){
    r.section('What students learned, by topic', `Share of answers on each topic's questions that were correct. Topics below ${PASS}% need more teaching.`);
    r.bars(competencyRows(ins.ia));
    r.section('Results per question', 'Each bar is one question in the game. Short bars show the questions most students got wrong.');
    r.bars(itemRows(ins.ia));
    r.table(['Item','Question','Correct','Status','Most common wrong answer'],
      ins.ia.items.filter(i => i.n).map(i => [i.no, clip(i.question, 110), pct(i.p), itemStatus(i.p).label, i.topWrong && i.p < PASS ? `"${clip(trimDot(i.topWrong.text), 70)}" (${i.topWrong.count})` : '-']),
      { fontSize:7.8, toneCols:{ 3: k => itemStatus(ins.ia.items.filter(i => i.n)[k].p).tone }, columnStyles:{ 0:{ cellWidth:10, halign:'center' }, 2:{ cellWidth:15, halign:'right' }, 3:{ cellWidth:18 }, 4:{ cellWidth:50 } } });
  }
  r.section('Student results', `Latest run for each student. Status: Passed = ${PASS}%+, Almost there = 50-74%, Needs support = below 50%.`);
  const rows = d.roster.map(s => ({ s, a: ins.latest.get(s.id), runs: d.attempts.filter(x => x.studentId === s.id).length }))
    .sort((x,y) => (d.sectionName(x.s.sectionId)).localeCompare(d.sectionName(y.s.sectionId)) || (x.s.name||'').localeCompare(y.s.name||''));
  r.table(['#','Student','Student ID','Section','Score','Correct','Status','Mastery level','Runs'],
    rows.map((x, i) => [i+1, x.s.name, x.s.id, d.sectionName(x.s.sectionId) || x.s.sectionName, x.a ? pct(x.a.percentScore) : '-', x.a ? `${x.a.solvedCount}/${x.a.totalScenarios}` : '-', studentStatus(x.a ? x.a.percentScore : null).label, x.a ? mastery(x.a.percentScore).label : '-', x.runs]),
    { fontSize:7.9, toneCols:{ 6: i => studentStatus(rows[i].a ? rows[i].a.percentScore : null).tone }, columnStyles:{ 0:{ cellWidth:8, halign:'center' }, 4:{ halign:'right', cellWidth:13 }, 5:{ halign:'right', cellWidth:14 }, 6:{ cellWidth:25 }, 8:{ halign:'right', cellWidth:12 } } });
  r.guide(GUIDE_BASIC);
  r.signatures([['Prepared by', meta.author], ['Noted by', '']]);
  return r.finish(meta.filename);
}

// ── Report: item analysis ─────────────────────────────────────────────────
function buildItemAnalysisReport(ia, meta){
  const r = newReport({ kind:'Item analysis', title:'Item Analysis Report', subtitle:`Grade ${ia.grade} - ${ia.gd ? ia.gd.topic : ''}`, author:meta.author, meta:[
    ['Grade', `Grade ${ia.grade}`], ['Section', meta.section || 'All sections'], ['Session', meta.session || 'All sessions'], ['Runs counted', MODE_LABEL[meta.mode] || 'All runs'] ] });
  if (!ia.attempts){ r.callout('No results yet', ['No completed runs match these filters. Results appear as soon as students finish a run.'], 'info'); return r.finish(meta.filename); }
  const answered = ia.items.filter(i => i.n), sorted = [...answered].sort((a,b) => a.p - b.p);
  const reteach = answered.filter(i => i.p < 50), review = answered.filter(i => i.p >= 50 && i.p < PASS);
  const weakQ = answered.filter(i => i.D != null && i.D < .2);
  r.kpis([
    { label:'Average score', value:pct(ia.mps), sub:mastery(ia.mps).label, tone:mastery(ia.mps).tone },
    { label:'Runs analysed', value:String(ia.attempts), sub:`${plural(ia.students, 'student')}` },
    { label:`Questions learned (${PASS}%+)`, value:`${ia.learned} / ${ia.answered}`, tone: ia.learned === ia.answered ? 'good' : 'info' },
    { label:'Questions to re-teach', value:String(reteach.length), sub:'Below 50% correct', tone: reteach.length ? 'crit' : 'good' }
  ]);
  const findings = [
    `Students answered ${pct(ia.mps)} of all questions correctly on average ("${mastery(ia.mps).label}").`,
    sorted.length ? `Easiest question: Item ${sorted[sorted.length-1].no} (${pct(sorted[sorted.length-1].p)} correct). Hardest: Item ${sorted[0].no} (${pct(sorted[0].p)} correct).` : '',
    ia.competencies.filter(c => c.n).length > 1 ? (() => { const c = ia.competencies.filter(c => c.n).sort((a,b) => a.p - b.p); return `Weakest topic: ${c[0].comp} (${pct(c[0].p)}). Strongest topic: ${c[c.length-1].comp} (${pct(c[c.length-1].p)}).`; })() : '',
    weakQ.length ? `${plural(weakQ.length, 'question')} (${weakQ.map(i => 'Item ' + i.no).join(', ')}) did not separate stronger and weaker students well; check their wording or answer key.` : (ia.groupSize ? 'All questions separate stronger and weaker students reasonably well.' : 'Question quality needs at least 6 runs to measure.')
  ];
  const actions = [
    reteach.length ? `Re-teach: ${reteach.map(i => `Item ${i.no} (${pct(i.p)})`).join(', ')}. See the most common wrong answers in section 3.` : '',
    review.length ? `Quick review: ${review.map(i => `Item ${i.no} (${pct(i.p)})`).join(', ')}.` : '',
    weakQ.length ? `Revise the wording of ${weakQ.map(i => 'Item ' + i.no).join(', ')} before the next session.` : '',
    !reteach.length && !review.length ? 'All questions are at or above the passing mark - no re-teaching needed.' : ''
  ];
  r.callout('Key findings', findings, 'info');
  r.callout('Recommended next steps', actions, 'warn');

  r.section('Learning by topic', 'Share of answers on each topic\'s questions that were correct.');
  r.bars(competencyRows(ia));
  r.section('Question summary', 'One row per question. Status and quality are explained at the end of the report.');
  r.table(['Item','Topic','Answered','Correct','Status','Difficulty','Question quality (D)'],
    answered.map(i => [i.no, i.comp, i.n, pct(i.p), itemStatus(i.p).label, plainDifficulty(i.p), i.D == null ? 'Not enough data' : `${plainQuality(i.D)} (${i.D.toFixed(2)})`]),
    { fontSize:7.9, toneCols:{ 4: k => itemStatus(answered[k].p).tone, 6: k => answered[k].D == null ? null : discrimination(answered[k].D).tone },
      columnStyles:{ 0:{ cellWidth:10, halign:'center' }, 2:{ cellWidth:17, halign:'right' }, 3:{ cellWidth:15, halign:'right' }, 4:{ cellWidth:18 }, 5:{ cellWidth:20 } } });
  r.section('Question details', 'What each question asked, how many chose each answer, and what to re-teach.');
  ia.items.forEach(it => {
    r.ensure(18 + (it.n ? it.options.length * 9.6 + 6 : 0)); // keep each question's heading and chart together
    const st = itemStatus(it.p);
    r.para(`Item ${it.no}. ${it.question}`, { bold:true, color:INK, size:9.3, gap:1.2 });
    r.para(`${it.comp}  |  ${it.n ? `${it.correct} of ${it.n} answered correctly (${pct(it.p)}) - ${st.label}` : 'No answers yet'}`, { size:8, gap:2 });
    if (!it.n) return;
    r.bars(it.options.map(o => ({ label:`${o.letter}${o.correct ? ' (correct)' : ''}: ${o.text}`, value: it.n ? o.count / it.n * 100 : 0, right:`${o.count}  (${pctOf(o.count, it.n)}%)`, tone: o.correct ? 'good' : (it.topWrong && o.key === it.topWrong.key ? 'serious' : 'none') })), { pass:false, labelW:96, rightW:22 });
    if (it.p < PASS && it.topWrong) r.callout(`What to re-teach for Item ${it.no}`, [`${plural(it.topWrong.count, 'answer')} chose "${trimDot(it.topWrong.text)}".`, it.feedback ? `Key idea: ${it.feedback}` : ''], 'warn');
    else r.y += 2;
  });
  r.guide([...GUIDE_BASIC, ...GUIDE_ITEMS]);
  r.signatures([['Prepared by', meta.author], ['Checked / noted by', '']]);
  return r.finish(meta.filename);
}

// ── Report: one session ───────────────────────────────────────────────────
// d = { session, sectionName, teacherName, attempts (this session), roster, results, studentName(id) }
function buildSessionReport(d, meta){
  const s = d.session;
  const ins = classInsights({ roster:d.roster, attempts:d.attempts, results:d.results, grade:s.grade });
  const played = d.roster.length - ins.notPlayed.length;
  const r = newReport({ kind:'Session report', title:`Session Results: ${s.label || 'Session'}`, subtitle:`Grade ${s.grade} - ${d.sectionName}`, author:meta.author, meta:[
    ['Section', d.sectionName], ['Teacher', d.teacherName || '-'], ['Started', fmtWhen(s.createdAt, true)], ['Status', s.status === 'active' ? 'Still open' : `Closed ${s.closedAt ? fmtWhen(s.closedAt) : ''}`] ] });
  r.kpis([
    { label:'Students who played', value:`${played} / ${d.roster.length}`, sub:`${d.attempts.length} run${d.attempts.length===1?'':'s'} in total`, tone: played === d.roster.length && played ? 'good' : 'info' },
    { label:'Average score', value:pct(ins.mps), sub:mastery(ins.mps).label, tone:mastery(ins.mps).tone },
    { label:`Passed (${PASS}%+)`, value:String(ins.passed.length), tone: ins.passed.length ? 'good' : 'none' },
    { label:'Highest / lowest', value: ins.scores.length ? `${pct(Math.max(...ins.scores))} / ${pct(Math.min(...ins.scores))}` : '-' }
  ]);
  r.callout('Key findings', ins.findings, 'info');
  r.callout('Recommended next steps', ins.actions, 'warn');
  r.section('Results', 'Latest run per student in this session, highest score first.');
  const playedRows = [...ins.latest.values()].sort((a,b) => (b.percentScore||0) - (a.percentScore||0));
  r.table(['Rank','Student','Student ID','Score','Correct','Status','Finished'],
    [...playedRows.map((a, i) => [i+1, d.studentName(a.studentId), a.studentId, pct(a.percentScore), `${a.solvedCount}/${a.totalScenarios}`, studentStatus(a.percentScore).label, fmtWhen(a.finishedAt)]),
     ...ins.notPlayed.map(x => ['-', x.name, x.id, '-', '-', 'Not yet played', '-'])],
    { toneCols:{ 5: i => i < playedRows.length ? studentStatus(playedRows[i].percentScore).tone : 'none' }, columnStyles:{ 0:{ cellWidth:11, halign:'center' }, 3:{ halign:'right' }, 4:{ halign:'right' } } });
  r.section('Mastery in this session');
  r.masteryStack(ins.scores, ins.notPlayed.length);
  if (ins.ia.attempts){
    r.section('Results per question');
    r.bars(itemRows(ins.ia));
    r.section('Learning by topic');
    r.bars(competencyRows(ins.ia));
  }
  r.guide(GUIDE_BASIC);
  r.signatures([['Prepared by', meta.author], ['Noted by', '']]);
  return r.finish(meta.filename);
}

// ── Report: one student (written so parents can read it too) ──────────────
// d = { student, sectionName, runs, results, sessionLabel(id) }
function buildStudentReport(d, meta){
  const s = d.student, runs = [...d.runs].sort((a,b) => toMillis(b.finishedAt) - toMillis(a.finishedAt));
  const last = runs[0], first = runs[runs.length-1];
  const best = runs.length ? Math.max(...runs.map(a => a.percentScore||0)) : null;
  const growth = runs.length > 1 ? last.percentScore - first.percentScore : null;
  const firstName = String(s.name || 'The student').split(/\s+/)[0];
  const r = newReport({ kind:'Student report', title:'Student Progress Report', subtitle:s.name, author:meta.author, meta:[
    ['Student', s.name], ['Student ID', s.id], ['Grade', `Grade ${s.grade}`], ['Section', d.sectionName] ] });
  const runIds = new Set(runs.map(a => a.id));
  const ia = computeItemAnalysis(s.grade, runs, d.results.filter(x => runIds.has(x.attemptId)));
  const comps = ia.competencies.filter(c => c.n).sort((a,b) => b.p - a.p);
  const items = last ? studentRunItems(last, d.results) : [];
  const missed = items.filter(x => !x.ok);
  r.kpis([
    { label:'Latest score', value: last ? pct(last.percentScore) : '-', sub: last ? studentStatus(last.percentScore).label : 'Not yet played', tone: last ? studentStatus(last.percentScore).tone : 'none' },
    { label:'Best score', value:pct(best), sub: best == null ? '' : mastery(best).label },
    { label:'Times played', value:String(runs.length) },
    { label:'Progress (first to latest)', value: growth == null ? '-' : (growth > 0 ? '+' : '') + Math.round(growth) + ' pts', sub: growth == null ? 'Play again to see progress' : growth > 0 ? 'Improving' : growth < 0 ? 'Went down' : 'No change', tone: growth > 0 ? 'good' : growth < 0 ? 'crit' : null }
  ]);
  const summary = !last ? [`${firstName} has not finished a run of the game yet.`] : [
    `In the latest run (${fmtWhen(last.finishedAt, true)}), ${firstName} answered ${last.solvedCount} of ${last.totalScenarios} questions correctly - a score of ${pct(last.percentScore)} ("${mastery(last.percentScore).label}").`,
    last.percentScore >= PASS ? `This is at or above the ${PASS}% passing mark.` : `This is below the ${PASS}% passing mark.`,
    comps.length ? `Strongest topic: ${comps[0].comp} (${pct(comps[0].p)}).${comps.length > 1 ? ` Needs the most practice: ${comps[comps.length-1].comp} (${pct(comps[comps.length-1].p)}).` : ''}` : '',
    growth != null ? `Across ${runs.length} runs the score ${growth > 0 ? 'improved' : growth < 0 ? 'dropped' : 'stayed the same'}${growth ? ` by ${Math.abs(Math.round(growth))} points` : ''}.` : ''
  ];
  r.callout('Summary', summary, 'info');
  const gd = GRADES[s.grade] || {};
  const tips = missed.slice(0, 4).map(x => { const sc = (gd.scenarios || [])[x.no - 1] || {}; return sc.fb ? `Item ${x.no} (${x.comp}): ${sc.fb}` : `Item ${x.no}: review ${x.comp}.`; });
  if (last) r.callout(missed.length ? 'Ideas to talk about at home or in class' : 'Great work', missed.length ? tips : [`${firstName} answered every question correctly in the latest run. Encourage them to explain the science behind each safe choice.`], missed.length ? 'warn' : 'good');
  if (comps.length){ r.section('Learning by topic', 'Across all of this student\'s runs.'); r.bars(comps.map(c => ({ label:c.comp, value:c.p, right:`${pct(c.p)}  (${c.correct}/${c.n})` }))); }
  if (last){
    r.section('Answers in the latest run', fmtWhen(last.finishedAt, true));
    const sc = gd.scenarios || [];
    const L = i => i == null ? '-' : String.fromCharCode(65 + Number(i));
    const rows = d.results.filter(x => x.attemptId === last.id).sort((a,b) => a.scenarioIndex - b.scenarioIndex).map(x => {
      const q = sc[x.scenarioIndex] || {}, ok = x.outcome === 'correct';
      const chose = q.lab ? `Loaded ${x.chosenOption}` : (x.chosenOption == null ? 'No answer' : `${L(x.chosenOption)}. ${(q.opts || [])[x.chosenOption] || ''}`);
      const right = q.lab ? `Safe maximum ${x.correctOption}` : `${L(q.ci ?? x.correctOption)}. ${(q.opts || [])[q.ci ?? x.correctOption] || ''}`;
      return { ok, row:[x.scenarioIndex + 1, q.q || q.objective || '', ok ? 'Correct' : 'Wrong', chose, ok ? '-' : right] };
    });
    r.table(['Item','Question','Result','Student\'s answer','Correct answer'], rows.map(x => x.row),
      { fontSize:7.6, toneCols:{ 2: i => rows[i].ok ? 'good' : 'crit' }, columnStyles:{ 0:{ cellWidth:10, halign:'center' }, 1:{ cellWidth:58 }, 2:{ cellWidth:15 } } });
  }
  r.section('Run history');
  r.table(['Date','Session','Score','Correct','Status'], runs.map(a => [fmtWhen(a.finishedAt, true), d.sessionLabel(a.sessionId), pct(a.percentScore), `${a.solvedCount}/${a.totalScenarios}`, studentStatus(a.percentScore).label]),
    { toneCols:{ 4: i => studentStatus(runs[i].percentScore).tone }, columnStyles:{ 2:{ halign:'right' }, 3:{ halign:'right' } }, empty:'No runs yet.' });
  r.guide(GUIDE_BASIC.slice(0, 5));
  r.signatures([['Teacher', meta.author], ['Parent / guardian', '']]);
  return r.finish(meta.filename);
}

// ── Report: whole school (Super Admin) ────────────────────────────────────
// d = { grades:[gradeRollup], sections:[rollup + teacherNames], teachers:[{name, username, sections, students, sessions, mps}], students, attempts, sessions }
function buildSchoolReport(d, meta){
  const latest = latestByStudent(d.attempts);
  const scores = [...latest.values()].map(a => a.percentScore || 0), mps = mean(scores);
  const played = latest.size, passed = scores.filter(p => p >= PASS).length;
  const r = newReport({ kind:'School report', title:'School Summary Report', subtitle:'All grades, sections and teachers', author:meta.author, meta:[
    ['Teachers', String(d.teachers.length)], ['Sections', String(d.sections.length)], ['Students', String(d.students.length)], ['Sessions held', String(d.sessions.length)] ] });
  r.kpis([
    { label:'Students who played', value:`${played} / ${d.students.length}`, sub:`${pctOf(played, d.students.length)}% participation`, tone:'info' },
    { label:'School average score', value:pct(mps), sub:mastery(mps).label, tone:mastery(mps).tone },
    { label:`Passed (${PASS}%+)`, value:String(passed), sub: played ? `${pctOf(passed, played)}% of players` : '-', tone: passed ? 'good' : 'none' },
    { label:'Live sessions now', value:String(d.sessions.filter(s => s.status === 'active').length), sub:`${d.attempts.length} runs completed` }
  ]);
  const gp = d.grades.filter(g => g.played).sort((a,b) => b.mps - a.mps);
  const secs = [...d.sections].sort((a,b) => a.grade - b.grade || a.name.localeCompare(b.name));
  const sp = secs.filter(s => s.played).sort((a,b) => b.mps - a.mps);
  const noTeacher = secs.filter(s => !s.teacherNames), idleT = d.teachers.filter(t => !t.sections), noRuns = d.grades.filter(g => !g.played && g.students);
  r.callout('Key findings', [
    `${played} of ${d.students.length} registered students (${pctOf(played, d.students.length)}%) have played; the school average is ${pct(mps)} ("${mastery(mps).label}").`,
    gp.length > 1 ? `Highest grade level: Grade ${gp[0].g} (${pct(gp[0].mps)}). Lowest: Grade ${gp[gp.length-1].g} (${pct(gp[gp.length-1].mps)}).` : '',
    sp.length > 1 ? `Top section: G${sp[0].grade} ${sp[0].name} (${pct(sp[0].mps)}). Section needing the most support: G${sp[sp.length-1].grade} ${sp[sp.length-1].name} (${pct(sp[sp.length-1].mps)}).` : '',
    noRuns.length ? `No results yet for ${noRuns.map(g => 'Grade ' + g.g).join(', ')}.` : ''
  ], 'info');
  r.callout('Recommended next steps', [
    noTeacher.length ? `Assign a teacher to ${plural(noTeacher.length, 'section')}: ${noTeacher.map(s => `G${s.grade} ${s.name}`).join(', ')}.` : '',
    idleT.length ? `${plural(idleT.length, 'teacher has', 'teachers have')} no sections yet: ${namesList(idleT.map(t => t.name))}.` : '',
    sp.length && sp[sp.length-1].mps < 50 ? `Support G${sp[sp.length-1].grade} ${sp[sp.length-1].name}: its average is below 50%.` : '',
    d.students.length - played ? `Encourage the ${d.students.length - played} students who have not played to join their next session.` : ''
  ], 'warn');
  r.section('Mastery across the school', 'Each student counted once, using their most recent run.');
  r.masteryStack(scores, Math.max(0, d.students.length - played));
  r.section('Learning by grade level');
  r.table(['Grade','Topic','Sections','Students','Played','Average','Mastery level'],
    d.grades.map(g => [`Grade ${g.g}`, g.gd ? g.gd.topic : '', g.secs.length, g.students, `${g.played} (${pctOf(g.played, g.students)}%)`, g.played ? pct(g.mps) : '-', g.played ? mastery(g.mps).label : 'No results yet']),
    { toneCols:{ 5: i => d.grades[i].played ? mastery(d.grades[i].mps).tone : null }, columnStyles:{ 2:{halign:'right'},3:{halign:'right'},4:{halign:'right'},5:{halign:'right'} } });
  if (sp.length){ r.section('Section ranking', 'Average of each student\'s latest score.'); r.bars(sp.map(s => ({ label:`G${s.grade} ${s.name}`, value:s.mps, right:`${pct(s.mps)}  (${s.played}/${s.enrolled})` }))); }
  r.section('All sections');
  r.table(['Grade','Section','Teacher(s)','Students','Played','Average','Mastery level'],
    secs.map(s => [s.grade, s.name, s.teacherNames || 'None assigned', s.enrolled, s.played, s.played ? pct(s.mps) : '-', s.played ? mastery(s.mps).label : '-']),
    { toneCols:{ 5: i => secs[i].played ? mastery(secs[i].mps).tone : null, 2: i => secs[i].teacherNames ? null : 'warn' }, columnStyles:{ 0:{cellWidth:13,halign:'center'}, 3:{halign:'right'}, 4:{halign:'right'}, 5:{halign:'right'} } });
  r.section('Teachers');
  r.table(['Teacher','Username','Assigned sections','Students','Sessions','Class average'],
    d.teachers.map(t => [t.name, t.username, t.sections || 'None assigned', t.students, t.sessions, pct(t.mps)]),
    { toneCols:{ 5: i => d.teachers[i].mps == null ? null : mastery(d.teachers[i].mps).tone, 2: i => d.teachers[i].sections ? null : 'warn' }, columnStyles:{ 3:{halign:'right'}, 4:{halign:'right'}, 5:{halign:'right'} } });
  r.guide(GUIDE_BASIC);
  r.signatures([['Prepared by', meta.author], ['Noted by (School Head)', '']]);
  return r.finish(meta.filename);
}
