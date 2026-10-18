'use strict';
// PDF reports for both dashboards (jsPDF + AutoTable, loaded on first use so the
// dashboards stay light). PdfReport is a small layout helper — header, KPI boxes,
// bar lists, tables, signature block, page footer — and the build*Report
// functions below turn dashboard data into the actual documents.

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

// The built-in PDF fonts only cover Latin-1, so map the few symbols this data uses.
function pdfSafe(v){
  return String(v == null ? '' : v)
    .replace(/[“”„]/g, '"').replace(/[‘’‚]/g, "'").replace(/[–—−]/g, '-').replace(/…/g, '...')
    .replace(/≥/g, '>=').replace(/≤/g, '<=').replace(/≠/g, '!=').replace(/→/g, '->').replace(/·/g, '-')
    .replace(/ρ/g, 'rho').replace(/Δ/g, 'delta').replace(/[✓✔]/g, 'Yes').replace(/[✗✕]/g, 'No')
    .replace(/[^\x00-\xFF]/g, '');
}

const PDF_TONE = {
  good:{ fill:[233,247,233], text:[10,107,10], bar:[12,163,12] },
  warn:{ fill:[255,246,224], text:[134,90,0], bar:[250,178,25] },
  serious:{ fill:[253,240,234], text:[163,64,26], bar:[236,131,90] },
  crit:{ fill:[252,234,234], text:[180,35,35], bar:[208,59,59] },
  none:{ fill:[241,245,249], text:[71,85,105], bar:[203,213,225] }
};
const INK = [15,23,42], INK2 = [71,85,105], INK3 = [100,116,139], LINE = [226,232,240], BRAND = [37,99,235], NAVY = [15,27,51];

function reportSchoolName(){ try { return localStorage.getItem('c2s_report_school') || ''; } catch(e){ return ''; } }

class PdfReport {
  constructor(o){
    const { jsPDF } = window.jspdf;
    this.doc = new jsPDF({ unit:'mm', format:'a4', orientation:o.landscape ? 'landscape' : 'portrait' });
    this.W = this.doc.internal.pageSize.getWidth(); this.H = this.doc.internal.pageSize.getHeight();
    this.M = 14; this.title = o.title; this.y = 0;
    this.doc.setProperties({ title:pdfSafe(o.title), subject:'Click to Survive report', author:pdfSafe(o.author || ''), creator:'Click to Survive' });
    this._header(o);
  }
  _header(o){
    const d = this.doc, M = this.M;
    d.setFillColor(...NAVY); d.rect(0, 0, this.W, 30, 'F');
    d.setFillColor(...BRAND); d.rect(0, 30, this.W, 1.2, 'F');
    d.setTextColor(255,255,255); d.setFont('helvetica','bold'); d.setFontSize(15);
    d.text('Click to Survive', M, 13);
    d.setFont('helvetica','normal'); d.setFontSize(8.5); d.setTextColor(191,205,228);
    const school = reportSchoolName();
    d.text(pdfSafe((school ? school + '  |  ' : '') + 'DepEd Disaster Risk Education - Science'), M, 19);
    d.setFontSize(8); d.text(pdfSafe('Generated ' + new Date().toLocaleString([], { dateStyle:'long', timeStyle:'short' })), this.W - M, 13, { align:'right' });
    if (o.author) d.text(pdfSafe('Prepared by ' + o.author), this.W - M, 19, { align:'right' });
    d.setTextColor(...INK); d.setFont('helvetica','bold'); d.setFontSize(17);
    d.text(pdfSafe(o.title), M, 43);
    let y = 43;
    if (o.subtitle){ d.setFont('helvetica','normal'); d.setFontSize(9.5); d.setTextColor(...INK2); const l = d.splitTextToSize(pdfSafe(o.subtitle), this.W - 2*M); d.text(l, M, y + 6); y += 6 + (l.length-1)*4.2; }
    if (o.meta && o.meta.length){
      y += 5;
      const cols = Math.min(4, o.meta.length), cw = (this.W - 2*M) / cols;
      o.meta.forEach(([k, v], i) => {
        const cx = M + (i % cols) * cw, cy = y + Math.floor(i / cols) * 11;
        d.setFont('helvetica','normal'); d.setFontSize(7.5); d.setTextColor(...INK3); d.text(pdfSafe(k).toUpperCase(), cx, cy + 3);
        d.setFont('helvetica','bold'); d.setFontSize(9.5); d.setTextColor(...INK); d.text(d.splitTextToSize(pdfSafe(v), cw - 3)[0], cx, cy + 8);
      });
      y += Math.ceil(o.meta.length / cols) * 11;
    }
    d.setDrawColor(...LINE); d.setLineWidth(.3); d.line(M, y + 3, this.W - M, y + 3);
    this.y = y + 9;
  }
  ensure(h){ if (this.y + h > this.H - 18){ this.doc.addPage(); this.y = 16; } }
  heading(text, sub){
    this.y += 3;
    this.ensure(sub ? 16 : 12);
    const d = this.doc;
    d.setFillColor(...BRAND); d.rect(this.M, this.y - 3.6, 1.2, 5, 'F');
    d.setFont('helvetica','bold'); d.setFontSize(11.5); d.setTextColor(...INK); d.text(pdfSafe(text), this.M + 3.5, this.y);
    this.y += 5;
    if (sub){ d.setFont('helvetica','normal'); d.setFontSize(8.5); d.setTextColor(...INK2); const l = d.splitTextToSize(pdfSafe(sub), this.W - 2*this.M); d.text(l, this.M, this.y + 1); this.y += l.length * 3.8 + 2; }
    this.y += 1;
  }
  para(text, o){
    o = o || {};
    const d = this.doc; d.setFont('helvetica', o.bold ? 'bold' : 'normal'); d.setFontSize(o.size || 9); d.setTextColor(...(o.color || INK2));
    const l = d.splitTextToSize(pdfSafe(text), this.W - 2*this.M - (o.indent||0));
    this.ensure(l.length * 4 + 2); d.text(l, this.M + (o.indent||0), this.y); this.y += l.length * 4 + (o.gap ?? 2);
  }
  kpis(list){
    const d = this.doc, M = this.M, per = Math.min(4, list.length), gap = 3, w = (this.W - 2*M - gap*(per-1)) / per, h = 19;
    for (let i = 0; i < list.length; i += per){
      this.ensure(h + 3);
      list.slice(i, i + per).forEach((k, j) => {
        const x = M + j * (w + gap), t = PDF_TONE[k.tone] || null;
        d.setFillColor(...(t ? t.fill : [248,250,252])); d.setDrawColor(...LINE); d.roundedRect(x, this.y, w, h, 2, 2, 'FD');
        d.setFont('helvetica','normal'); d.setFontSize(7.5); d.setTextColor(...INK3); d.text(pdfSafe(k.label).toUpperCase(), x + 3, this.y + 5);
        d.setFont('helvetica','bold'); d.setFontSize(14); d.setTextColor(...(t ? t.text : INK)); d.text(pdfSafe(k.value), x + 3, this.y + 12.5);
        if (k.sub){ d.setFont('helvetica','normal'); d.setFontSize(7.5); d.setTextColor(...INK2); d.text(d.splitTextToSize(pdfSafe(k.sub), w - 6)[0], x + 3, this.y + 16.8); }
      });
      this.y += h + 3;
    }
    this.y += 2;
  }
  // Horizontal bars: rows = [{label, value (0-100), right, tone}]
  bars(rows){
    const d = this.doc, M = this.M, lw = 74, rw = 30, bw = this.W - 2*M - lw - rw - 4;
    rows.forEach(r => {
      this.ensure(7);
      d.setFont('helvetica','normal'); d.setFontSize(8.5); d.setTextColor(...INK); d.text(d.splitTextToSize(pdfSafe(r.label), lw - 2)[0], M, this.y + 3);
      d.setFillColor(...LINE); d.roundedRect(M + lw, this.y, bw, 3.6, 1.2, 1.2, 'F');
      const v = Math.max(0, Math.min(100, r.value || 0));
      if (v){ d.setFillColor(...(PDF_TONE[r.tone || mastery(r.value).tone] || PDF_TONE.none).bar); d.roundedRect(M + lw, this.y, Math.max(1.5, bw * v / 100), 3.6, 1.2, 1.2, 'F'); }
      d.setFont('helvetica','bold'); d.setTextColor(...INK); d.text(pdfSafe(r.right), this.W - M, this.y + 3, { align:'right' });
      this.y += 6.5;
    });
    this.y += 2;
  }
  masteryStack(scores, notPlayed){
    const { groups, total } = masteryGroups(scores, notPlayed);
    if (!total){ this.para('No students yet.'); return; }
    const d = this.doc, M = this.M, w = this.W - 2*M;
    this.ensure(18);
    let x = M;
    [...groups.map(g => ({ n:g.n, c:PDF_TONE[g.tone].bar })), { n:notPlayed||0, c:PDF_TONE.none.bar }].forEach(s => {
      if (!s.n) return; const sw = w * s.n / total; d.setFillColor(...s.c); d.rect(x, this.y, Math.max(.8, sw - .6), 5, 'F'); x += sw;
    });
    this.y += 9;
    d.setFontSize(8); let lx = M;
    [...groups.map(g => [g.label + ' (' + g.range + ')', g.n, PDF_TONE[g.tone].bar]), ...(notPlayed ? [['Not yet played', notPlayed, PDF_TONE.none.bar]] : [])].forEach(([l, n, c]) => {
      const txt = pdfSafe(`${l}: ${n}`); const tw = d.getTextWidth(txt) + 9;
      if (lx + tw > this.W - M){ lx = M; this.y += 5; }
      d.setFillColor(...c); d.rect(lx, this.y - 2.6, 3, 3, 'F'); d.setFont('helvetica','normal'); d.setTextColor(...INK2); d.text(txt, lx + 4.5, this.y); lx += tw;
    });
    this.y += 7;
  }
  // AutoTable wrapper. toneCols: { colIndex: rowIndex => tone } colours those cells.
  table(head, body, o){
    o = o || {};
    this.ensure(18);
    const toneCols = o.toneCols || {};
    this.doc.autoTable({
      startY: this.y, head:[head.map(pdfSafe)], body: body.map(r => r.map(pdfSafe)),
      margin:{ left:this.M, right:this.M, top:16, bottom:18 }, theme:'grid',
      styles:{ font:'helvetica', fontSize:o.fontSize || 8.3, cellPadding:1.8, textColor:INK, lineColor:LINE, lineWidth:.2, valign:'middle', overflow:'linebreak' },
      headStyles:{ fillColor:[241,245,249], textColor:INK2, fontStyle:'bold', fontSize:(o.fontSize || 8.3) - .3 },
      alternateRowStyles:{ fillColor:[250,251,253] },
      columnStyles: o.columnStyles || {},
      didParseCell: data => {
        if (data.section !== 'body') return;
        const f = toneCols[data.column.index]; if (!f) return;
        const tone = f(data.row.index); const t = tone && PDF_TONE[tone]; if (!t) return;
        data.cell.styles.fillColor = t.fill; data.cell.styles.textColor = t.text; data.cell.styles.fontStyle = 'bold';
      }
    });
    this.y = this.doc.lastAutoTable.finalY + 6;
  }
  signatures(labels){
    this.ensure(30); this.y += 8;
    const d = this.doc, w = (this.W - 2*this.M) / labels.length;
    labels.forEach(([role, name], i) => {
      const x = this.M + i * w;
      d.setFont('helvetica','normal'); d.setFontSize(8.5); d.setTextColor(...INK2); d.text(pdfSafe(role), x, this.y);
      d.setDrawColor(...INK3); d.setLineWidth(.3); d.line(x, this.y + 13, x + w - 12, this.y + 13);
      d.setFont('helvetica','bold'); d.setTextColor(...INK); d.text(pdfSafe(name || ''), x, this.y + 11);
      d.setFont('helvetica','normal'); d.setFontSize(7.5); d.setTextColor(...INK3); d.text('Signature over printed name / Date', x, this.y + 17);
    });
    this.y += 22;
  }
  save(filename){
    const d = this.doc, n = d.getNumberOfPages();
    for (let i = 1; i <= n; i++){
      d.setPage(i);
      if (i > 1){ d.setFont('helvetica','bold'); d.setFontSize(8); d.setTextColor(...INK3); d.text(pdfSafe('Click to Survive  |  ' + this.title), this.M, 9); d.setDrawColor(...LINE); d.line(this.M, 11, this.W - this.M, 11); }
      d.setDrawColor(...LINE); d.line(this.M, this.H - 12, this.W - this.M, this.H - 12);
      d.setFont('helvetica','normal'); d.setFontSize(7.5); d.setTextColor(...INK3);
      d.text(pdfSafe('Click to Survive  |  ' + this.title), this.M, this.H - 7);
      d.text(`Page ${i} of ${n}`, this.W - this.M, this.H - 7, { align:'right' });
    }
    d.save(filename);
  }
}

// Runs a builder with a busy state on the button that triggered it.
async function generatePdf(btn, build){
  const label = btn ? btn.innerHTML : '';
  if (btn){ btn.disabled = true; btn.setAttribute('aria-busy', 'true'); btn.innerHTML = `${ico('hourglass-split')}<span>Generating…</span>`; }
  try{
    await loadPdfLibs();
    const name = build();
    toast(`Report downloaded: ${name}`);
  }catch(e){
    console.error(e); toast(e.message || 'Could not generate the report.', 'err');
  }finally{
    if (btn){ btn.disabled = false; btn.removeAttribute('aria-busy'); btn.innerHTML = label; }
  }
}

// ── Shared report sections ────────────────────────────────────────────────
function scaleLegend(r){
  r.heading('How to read this report');
  r.table(['DepEd mastery level (MPS)', 'Range'], [
    ['Mastered','96-100%'],['Closely approximating mastery','86-95%'],['Moving towards mastery','66-85%'],
    ['Average mastery','35-65%'],['Low mastery','15-34%'],['Very low mastery','5-14%'],['Absolutely no mastery','0-4%']
  ], { toneCols:{ 0: i => mastery([98,90,75,50,25,10,2][i]).tone }, columnStyles:{ 1:{ cellWidth:40 } } });
  r.para('Difficulty index (% correct): 81-100 very easy, 61-80 easy, 41-60 average, 21-40 difficult, 0-20 very difficult. Discrimination index D (upper 27% minus lower 27% of runs): 0.40+ very good, 0.30-0.39 good (retain), 0.20-0.29 fair (revise), below 0.20 poor (revise), negative (reject or rewrite). D is shown only when at least 6 runs are analysed.', { size:8 });
}
function itemSummaryTable(r, ia){
  r.table(['#','Competency','Responses','% correct','Mastery','Difficulty','D','Decision'],
    ia.items.map(it => { const d = discrimination(it.D); return [it.no, it.comp, it.n, pct(it.p), it.n ? mastery(it.p).label : '-', it.n ? difficultyLabel(it.p) : '-', it.D == null ? '-' : it.D.toFixed(2), it.n ? d.decision : '-']; }),
    { toneCols:{ 3: i => ia.items[i].n ? mastery(ia.items[i].p).tone : null, 7: i => ia.items[i].n && ia.items[i].D != null ? discrimination(ia.items[i].D).tone : null },
      columnStyles:{ 0:{ cellWidth:8, halign:'center' }, 2:{ halign:'right', cellWidth:20 }, 3:{ halign:'right', cellWidth:18 }, 6:{ halign:'right', cellWidth:12 } } });
}
function competencyTable(r, ia){
  r.table(['Competency','Items','Responses','% learned','Mastery level'],
    ia.competencies.map(c => [c.comp, c.items.map(n => '#'+n).join(', '), c.n, pct(c.p), c.n ? mastery(c.p).label : '-']),
    { toneCols:{ 3: i => ia.competencies[i].n ? mastery(ia.competencies[i].p).tone : null }, columnStyles:{ 2:{ halign:'right', cellWidth:22 }, 3:{ halign:'right', cellWidth:22 } } });
}
function iaKpis(r, ia){
  r.kpis([
    { label:'Mean percentage score', value:pct(ia.mps), sub:mastery(ia.mps).label, tone:mastery(ia.mps).tone },
    { label:'Runs analysed', value:String(ia.attempts), sub:`${ia.students} student${ia.students===1?'':'s'}` },
    { label:'Items learned (>= 75%)', value:`${ia.learned} / ${ia.answered}`, sub:'75% = passing mark' },
    { label:'Least-learned items', value:String(ia.least.length), sub: ia.least.length ? 'Items ' + ia.least.map(i => '#'+i.no).join(', ') : 'None below 75%', tone: ia.least.length ? 'warn' : 'good' }
  ]);
}

// ── Report: item analysis ─────────────────────────────────────────────────
function buildItemAnalysisReport(ia, meta){
  const r = new PdfReport({ title:`Item Analysis Report - Grade ${ia.grade}`, subtitle: ia.gd ? ia.gd.topic : '', author:meta.author, meta:[
    ['Grade', `Grade ${ia.grade}`], ['Section', meta.section || 'All sections'], ['Session', meta.session || 'All sessions'], ['Runs counted', MODE_LABEL[meta.mode] || 'All runs'] ] });
  if (!ia.attempts){ r.para('No completed runs match these filters yet.'); r.save(meta.filename); return meta.filename; }
  iaKpis(r, ia);
  r.heading('Learning by competency', 'Share of all answers on each competency\'s items that were correct.');
  competencyTable(r, ia);
  r.heading('Item statistics');
  itemSummaryTable(r, ia);
  if (ia.least.length){
    r.heading('Least-learned items and misconceptions to re-teach');
    ia.least.forEach(it => r.para(`Item ${it.no} (${pct(it.p)} correct): ${it.topWrong ? `${it.topWrong.count} answer(s) chose "${trimDot(it.topWrong.text)}". ` : ''}${it.feedback}`, { size:8.5, gap:2.5 }));
  }
  r.heading('Answer distribution per item');
  ia.items.forEach(it => {
    r.ensure(30);
    r.para(`Item ${it.no}. ${it.question}`, { bold:true, color:INK, size:9, gap:1 });
    r.para(`${it.comp}  |  ${it.n ? `${it.correct} of ${it.n} correct (${pct(it.p)}), ${mastery(it.p).label}` : 'No responses yet'}`, { size:8, gap:1.5 });
    if (it.n) r.table(['Choice','Answer','Chosen by','Share'], it.options.map(o => [o.letter + (o.correct ? ' (key)' : ''), o.text, o.count, Math.round(it.n ? o.count/it.n*100 : 0) + '%']),
      { fontSize:7.8, toneCols:{ 0: i => it.options[i].correct ? 'good' : (it.topWrong && it.options[i].key === it.topWrong.key ? 'serious' : null) },
        columnStyles:{ 0:{ cellWidth:18 }, 2:{ halign:'right', cellWidth:20 }, 3:{ halign:'right', cellWidth:16 } } });
  });
  scaleLegend(r);
  r.signatures([['Prepared by', meta.author], ['Checked / noted by', '']]);
  r.save(meta.filename); return meta.filename;
}

// ── Report: class / section performance ───────────────────────────────────
// d = { grade, sectionLabel, sections:[rollup], roster:[student], attempts, results, sectionName(id) }
function buildClassReport(d, meta){
  const latest = latestByStudent(d.attempts);
  const scores = [...latest.values()].map(a => a.percentScore || 0);
  const mps = mean(scores);
  const r = new PdfReport({ title:`Class Performance Report - Grade ${d.grade}`, subtitle: (GRADES[d.grade] || {}).topic || '', author:meta.author, meta:[
    ['Grade', `Grade ${d.grade}`], ['Section', d.sectionLabel || 'All sections'], ['Students', String(d.roster.length)], ['Teacher', meta.teacher || meta.author || '-'] ] });
  r.kpis([
    { label:'Students', value:String(d.roster.length), sub:`${d.sections.length} section${d.sections.length===1?'':'s'}` },
    { label:'Participation', value:pct(d.roster.length ? latest.size/d.roster.length*100 : null), sub:`${latest.size} of ${d.roster.length} played` },
    { label:'Mean percentage score', value:pct(mps), sub:mastery(mps).label, tone:mastery(mps).tone },
    { label:'Completed runs', value:String(d.attempts.length) }
  ]);
  r.heading('Mastery distribution', 'Each student\'s most recent run, on the DepEd mastery scale.');
  r.masteryStack(scores, Math.max(0, d.roster.length - latest.size));
  if (d.sections.length > 1){
    r.heading('Performance by section');
    r.table(['Section','Students','Played','Participation','Mean score','Mastery level'],
      d.sections.map(s => [s.name, s.enrolled, s.played, pct(s.participation), pct(s.mps), s.played ? mastery(s.mps).label : '-']),
      { toneCols:{ 4: i => d.sections[i].played ? mastery(d.sections[i].mps).tone : null }, columnStyles:{ 1:{halign:'right'}, 2:{halign:'right'}, 3:{halign:'right'}, 4:{halign:'right'} } });
  }
  const ia = computeItemAnalysis(d.grade, d.attempts, d.results);
  if (ia.attempts){
    r.heading('Learning by competency');
    competencyTable(r, ia);
    if (ia.least.length){ r.heading('Least-learned items'); r.bars(ia.least.map(it => ({ label:`Item ${it.no} - ${it.comp}`, value:it.p, right:`${pct(it.p)} (${it.correct}/${it.n})` }))); }
  }
  r.heading('Student results', 'Latest completed run per student. Students who have not played are listed last.');
  const rows = d.roster.map(s => ({ s, a: latest.get(s.id), runs: d.attempts.filter(x => x.studentId === s.id).length }))
    .sort((x,y) => (d.sectionName(x.s.sectionId)).localeCompare(d.sectionName(y.s.sectionId)) || (!!y.a - !!x.a) || (x.s.name||'').localeCompare(y.s.name||''));
  r.table(['#','Student','Student ID','Section','Latest score','Correct','Mastery level','Runs'],
    rows.map((x, i) => [i+1, x.s.name, x.s.id, d.sectionName(x.s.sectionId) || x.s.sectionName, x.a ? pct(x.a.percentScore) : '-', x.a ? `${x.a.solvedCount}/${x.a.totalScenarios}` : '-', x.a ? mastery(x.a.percentScore).label : 'Not yet played', x.runs]),
    { toneCols:{ 4: i => rows[i].a ? mastery(rows[i].a.percentScore).tone : null }, columnStyles:{ 0:{ cellWidth:8, halign:'center' }, 4:{halign:'right'}, 5:{halign:'right'}, 7:{halign:'right', cellWidth:12} } });
  scaleLegend(r);
  r.signatures([['Prepared by', meta.author], ['Noted by', '']]);
  r.save(meta.filename); return meta.filename;
}

// ── Report: one session ───────────────────────────────────────────────────
// d = { session, sectionName, teacherName, attempts (this session), roster, results, studentName(id) }
function buildSessionReport(d, meta){
  const s = d.session, latest = latestByStudent(d.attempts);
  const scores = [...latest.values()].map(a => a.percentScore || 0), mps = mean(scores);
  const r = new PdfReport({ title:`Session Report - ${s.label || 'Session'}`, author:meta.author, meta:[
    ['Grade', `Grade ${s.grade}`], ['Section', d.sectionName], ['Teacher', d.teacherName || '-'], ['Status', s.status === 'active' ? 'Active' : 'Closed'],
    ['Started', fmtWhen(s.createdAt, true)], ['Ended', s.closedAt ? fmtWhen(s.closedAt, true) : '-'] ] });
  r.kpis([
    { label:'Played', value:`${latest.size} / ${d.roster.length}`, sub:`${d.attempts.length} run${d.attempts.length===1?'':'s'} in total` },
    { label:'Mean percentage score', value:pct(mps), sub:mastery(mps).label, tone:mastery(mps).tone },
    { label:'Highest', value: scores.length ? pct(Math.max(...scores)) : '-' },
    { label:'Lowest', value: scores.length ? pct(Math.min(...scores)) : '-' }
  ]);
  r.heading('Mastery distribution');
  r.masteryStack(scores, Math.max(0, d.roster.length - latest.size));
  r.heading('Results', 'Latest run per student in this session, highest first.');
  const played = [...latest.values()].sort((a,b) => (b.percentScore||0) - (a.percentScore||0));
  const notPlayed = d.roster.filter(x => !latest.has(x.id));
  r.table(['Rank','Student','Student ID','Score','Correct','Mastery level','Finished'],
    [...played.map((a, i) => [i+1, d.studentName(a.studentId), a.studentId, pct(a.percentScore), `${a.solvedCount}/${a.totalScenarios}`, mastery(a.percentScore).label, fmtWhen(a.finishedAt)]),
     ...notPlayed.map(x => ['-', x.name, x.id, '-', '-', 'Not yet played', '-'])],
    { toneCols:{ 3: i => i < played.length ? mastery(played[i].percentScore).tone : null }, columnStyles:{ 0:{ cellWidth:11, halign:'center' }, 3:{halign:'right'}, 4:{halign:'right'} } });
  const ia = computeItemAnalysis(s.grade, d.attempts, d.results);
  if (ia.attempts){ r.heading('Item analysis for this session'); competencyTable(r, ia); itemSummaryTable(r, ia); }
  r.signatures([['Prepared by', meta.author], ['Noted by', '']]);
  r.save(meta.filename); return meta.filename;
}

// ── Report: one student ───────────────────────────────────────────────────
// d = { student, sectionName, runs, results, sessionLabel(id) }
function buildStudentReport(d, meta){
  const s = d.student, runs = [...d.runs].sort((a,b) => toMillis(b.finishedAt) - toMillis(a.finishedAt));
  const last = runs[0], first = runs[runs.length-1];
  const best = runs.length ? Math.max(...runs.map(a => a.percentScore||0)) : null;
  const growth = runs.length > 1 ? last.percentScore - first.percentScore : null;
  const r = new PdfReport({ title:'Student Progress Report', subtitle:s.name, author:meta.author, meta:[
    ['Student', s.name], ['Student ID', s.id], ['Grade', `Grade ${s.grade}`], ['Section', d.sectionName] ] });
  r.kpis([
    { label:'Latest score', value: last ? pct(last.percentScore) : '-', sub: last ? mastery(last.percentScore).label : 'Not yet played', tone: last ? mastery(last.percentScore).tone : null },
    { label:'Best score', value:pct(best) },
    { label:'Runs completed', value:String(runs.length) },
    { label:'Growth (first to latest)', value: growth == null ? '-' : (growth > 0 ? '+' : '') + Math.round(growth) + ' pts', tone: growth > 0 ? 'good' : growth < 0 ? 'crit' : null }
  ]);
  const runIds = new Set(runs.map(a => a.id));
  const ia = computeItemAnalysis(s.grade, runs, d.results.filter(x => runIds.has(x.attemptId)));
  if (ia.attempts){ r.heading('Learning by competency', 'Across all of this student\'s runs.'); r.bars(ia.competencies.filter(c => c.n).map(c => ({ label:c.comp, value:c.p, right:`${pct(c.p)} (${c.correct}/${c.n})` }))); }
  r.heading('Run history');
  r.table(['Finished','Session','Score','Correct','Mastery level'], runs.map(a => [fmtWhen(a.finishedAt, true), d.sessionLabel(a.sessionId), pct(a.percentScore), `${a.solvedCount}/${a.totalScenarios}`, mastery(a.percentScore).label]),
    { toneCols:{ 2: i => mastery(runs[i].percentScore).tone }, columnStyles:{ 2:{halign:'right'}, 3:{halign:'right'} } });
  if (last){
    const items = studentRunItems(last, d.results);
    r.heading('Answers in the latest run', fmtWhen(last.finishedAt, true));
    r.table(['Item','Competency','Result','Answer'], items.map(x => [x.no, x.comp, x.ok ? 'Correct' : 'Wrong', x.pick]),
      { toneCols:{ 2: i => items[i].ok ? 'good' : 'crit' }, columnStyles:{ 0:{ cellWidth:12, halign:'center' }, 2:{ cellWidth:20 } } });
  }
  r.signatures([['Prepared by', meta.author], ['Parent / guardian', '']]);
  r.save(meta.filename); return meta.filename;
}

// ── Report: whole school (Super Admin) ────────────────────────────────────
// d = { grades:[gradeRollup], sections:[rollup + teachers], teachers:[{name, username, sections, students, sessions, mps}], students, attempts, sessions }
function buildSchoolReport(d, meta){
  const latest = latestByStudent(d.attempts);
  const scores = [...latest.values()].map(a => a.percentScore || 0), mps = mean(scores);
  const r = new PdfReport({ title:'School Summary Report', subtitle:'All grades, sections and teachers', author:meta.author, meta:[
    ['Teachers', String(d.teachers.length)], ['Sections', String(d.sections.length)], ['Students', String(d.students.length)], ['Sessions', String(d.sessions.length)] ] });
  r.kpis([
    { label:'Students', value:String(d.students.length), sub:`${latest.size} have played` },
    { label:'Participation', value:pct(d.students.length ? latest.size/d.students.length*100 : null) },
    { label:'School mean score', value:pct(mps), sub:mastery(mps).label, tone:mastery(mps).tone },
    { label:'Completed runs', value:String(d.attempts.length), sub:`${d.sessions.filter(s => s.status==='active').length} live session(s)` }
  ]);
  r.heading('Mastery distribution');
  r.masteryStack(scores, Math.max(0, d.students.length - latest.size));
  r.heading('Learning by grade level');
  r.table(['Grade','Topic','Sections','Teachers','Students','Participation','Mean score','Mastery level'],
    d.grades.map(g => [`Grade ${g.g}`, g.gd ? g.gd.topic : '', g.secs.length, g.teachers, g.students, pct(g.participation), pct(g.mps), g.played ? mastery(g.mps).label : '-']),
    { toneCols:{ 6: i => d.grades[i].played ? mastery(d.grades[i].mps).tone : null }, columnStyles:{ 2:{halign:'right'},3:{halign:'right'},4:{halign:'right'},5:{halign:'right'},6:{halign:'right'} } });
  r.heading('Sections');
  const secs = [...d.sections].sort((a,b) => a.grade - b.grade || a.name.localeCompare(b.name));
  r.table(['Grade','Section','Teacher(s)','Students','Played','Mean score','Mastery level'],
    secs.map(s => [s.grade, s.name, s.teacherNames || 'None assigned', s.enrolled, s.played, pct(s.mps), s.played ? mastery(s.mps).label : '-']),
    { toneCols:{ 5: i => secs[i].played ? mastery(secs[i].mps).tone : null, 2: i => secs[i].teacherNames ? null : 'warn' }, columnStyles:{ 0:{cellWidth:13,halign:'center'}, 3:{halign:'right'}, 4:{halign:'right'}, 5:{halign:'right'} } });
  r.heading('Teachers');
  r.table(['Teacher','Username','Assigned sections','Students','Sessions','Class mean'],
    d.teachers.map(t => [t.name, t.username, t.sections || 'None assigned', t.students, t.sessions, pct(t.mps)]),
    { toneCols:{ 5: i => d.teachers[i].mps == null ? null : mastery(d.teachers[i].mps).tone }, columnStyles:{ 3:{halign:'right'}, 4:{halign:'right'}, 5:{halign:'right'} } });
  scaleLegend(r);
  r.signatures([['Prepared by', meta.author], ['Noted by (School Head)', '']]);
  r.save(meta.filename); return meta.filename;
}
