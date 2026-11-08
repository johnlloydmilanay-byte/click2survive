'use strict';
// Turns sample-data/sample-accounts.json (written by seed-sample-data.js) into a printable
// A4 PDF, sample-data/Click-to-Survive-Sample-Accounts.pdf, via headless Google Chrome.
// The PDF contains test passwords, so it stays in sample-data/ (not committed, not deployed).

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const DIR = path.join(__dirname, '..', 'sample-data');
const A = JSON.parse(fs.readFileSync(path.join(DIR, 'sample-accounts.json'), 'utf8'));
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[c]));
const band = g => g >= 11 ? 'Senior High School' : 'Junior High School';
const when = new Date(A.generatedAt).toLocaleString('en-PH', { dateStyle:'long', timeStyle:'short', timeZone:'Asia/Manila' });
const site = A.site;

const teacherRows = A.grades.map(g => `<tr>
  <td class="c"><b>${g.grade}</b><br><span class="lvl">${g.grade >= 11 ? 'SHS' : 'JHS'}</span></td><td>${esc(g.section)}</td>
  <td>${esc(g.teacher.name)}</td><td class="mono">${esc(g.teacher.username)}</td><td class="mono pw">${esc(g.teacher.password)}</td>
  <td class="c"><span class="live">● Active</span></td></tr>`).join('');

const rosters = A.grades.map(g => `<section class="roster">
  <h3>Grade ${g.grade} · ${esc(g.section)} <span class="tag">${band(g.grade)}</span></h3>
  <p class="meta">Teacher: <b>${esc(g.teacher.name)}</b> (${esc(g.teacher.username)}) · Session: <b>${esc(g.sessionLabel)}</b> (active)</p>
  <table><thead><tr><th class="c" style="width:8%">No.</th><th style="width:30%">Student ID (login)</th><th>Name</th><th style="width:16%">Tested by / ✓</th></tr></thead>
  <tbody>${g.students.map((s, i) => `<tr><td class="c">${i + 1}</td><td class="mono id">${esc(s.id)}</td><td>${esc(s.name)}</td><td></td></tr>`).join('')}</tbody></table>
</section>`).join('');

const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Click to Survive — Sample Accounts for Testing</title>
<style>
  @page { size: A4; margin: 16mm 14mm 16mm; }
  * { box-sizing: border-box; }
  body { font: 10.5pt/1.45 -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #111827; margin: 0; }
  h1 { font-size: 16.5pt; margin: 0 0 2pt; letter-spacing: -.2pt; }
  h2 { font-size: 13pt; margin: 16pt 0 6pt; padding-bottom: 3pt; border-bottom: 1.5pt solid #0f766e; color: #0f172a; }
  h3 { font-size: 11.5pt; margin: 0 0 2pt; }
  .sub { color: #475569; margin: 0 0 10pt; }
  .head { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 2.5pt solid #0f766e; padding-bottom: 8pt; margin-bottom: 10pt; }
  .head .right { text-align: right; font-size: 8.5pt; color: #475569; white-space: nowrap; padding-left: 12pt; }
  .lvl { font-size: 7.5pt; color: #0f766e; font-weight: 700; }
  table.keep, tr { break-inside: avoid; }
  .note { border: 1pt solid #f59e0b; background: #fffbeb; border-radius: 4pt; padding: 7pt 9pt; font-size: 9.5pt; margin: 8pt 0; }
  .box { border: 1pt solid #cbd5e1; border-radius: 4pt; padding: 6pt 10pt; margin: 5pt 0; }
  table { width: 100%; border-collapse: collapse; font-size: 9.5pt; margin-top: 4pt; }
  th, td { border: .75pt solid #94a3b8; padding: 4pt 5pt; text-align: left; vertical-align: top; }
  th { background: #e2e8f0; font-weight: 700; }
  td.c, th.c { text-align: center; }
  .mono { font-family: "SF Mono", Menlo, Consolas, monospace; font-size: 9.5pt; }
  .pw { font-weight: 700; letter-spacing: .4pt; }
  .id { font-weight: 700; }
  .live { color: #15803d; font-size: 8.5pt; font-weight: 700; }
  .tag { font-size: 8pt; font-weight: 600; color: #0f766e; border: .75pt solid #0f766e; border-radius: 8pt; padding: 0 5pt; margin-left: 4pt; vertical-align: middle; }
  .meta { color: #334155; font-size: 9pt; margin: 0 0 3pt; }
  ol { margin: 4pt 0 0 14pt; padding: 0; } li { margin: 2pt 0; }
  .roster { break-inside: avoid; margin: 0 0 12pt; }
  .pb { break-before: page; }
  .url { font-family: "SF Mono", Menlo, Consolas, monospace; font-size: 9.5pt; word-break: break-all; }
  .sig { display: flex; gap: 24pt; margin-top: 22pt; }
  .sig div { flex: 1; border-top: .75pt solid #334155; padding-top: 3pt; font-size: 9pt; color: #475569; text-align: center; }
</style></head><body>

<div class="head">
  <div><h1>Click to Survive — Sample Accounts for Testing</h1>
  <p class="sub" style="margin:0">Web-based decision simulation · Forces and motion in localized disaster contexts · Grades 7–12</p></div>
  <div class="right">Generated ${esc(when)}<br>Firebase project: ${esc(A.project)}</div>
</div>

<div class="note"><b>For testing only.</b> These accounts and their sessions are sample data, tagged <i>sample</i> in the database, and can be removed at any time. Do not use them for real learners or for the study’s actual data collection. <b>Confidential:</b> this page lists test passwords — share it only with the testers.</div>

<h2>1. Where to log in</h2>
<div class="box">
  <b>Students</b> — <span class="url">${esc(site)}</span><br>Open the site → <b>Student</b> → <b>Log In</b> tab → type the <b>Student ID</b> exactly as listed (no password) → <b>Log In</b>.
</div>
<div class="box">
  <b>Teachers</b> — <span class="url">${esc(site)}</span> → <b>Teacher / Admin</b><br>Enter the <b>Username</b> and <b>Password</b> below (passwords are case-sensitive).
</div>
<div class="box">
  <b>Super Admin</b> — <span class="url">${esc(site)}</span> → <b>Teacher / Admin</b> (same form)<br>Use the school’s existing Super Admin account (not included in this document).
</div>

<h2>2. Sections, teachers and active sessions</h2>
<p class="meta">One section per grade level. Each teacher is assigned to that section, and each section already has an <b>active session</b>, so students can press <b>Enter Session</b> right after logging in.</p>
<table class="keep"><thead><tr><th class="c" style="width:8%">Grade</th><th style="width:21%">Section</th><th style="width:24%">Teacher</th><th style="width:20%">Username</th><th style="width:15%">Password</th><th class="c">Session</th></tr></thead>
<tbody>${teacherRows}</tbody></table>

<h2>3. Suggested test flow</h2>
<ol>
  <li><b>Student:</b> log in with a Student ID from Section 4 → the menu shows the grade, topic and <i>Session active</i> → <b>Enter Session</b> (first login runs a short practice tutorial).</li>
  <li>Watch each scenario, answer the question, read the feedback and physics explanation, then <b>Take Control</b> and walk to the safe spot.</li>
  <li>After the last item, the result screen should say <i>Saved to your teacher's records</i>.</li>
  <li><b>Teacher:</b> log in → the Overview, Sessions, Students and Item Analysis pages show that student’s run; try a PDF report.</li>
  <li><b>Super Admin:</b> the Overview lists Junior High (7–10) and Senior High (11–12) grades with the sample sections and teachers.</li>
</ol>
<p class="meta" style="margin-top:6pt">Grades 7, 11 and 12 use the six-item instrument with one 3D scene per item; Grades 8–10 use their existing scenario sets.</p>

<h2>4. Student accounts (5 per section)</h2>
${rosters}

<div class="sig"><div>Prepared by</div><div>Checked / Received by</div><div>Date</div></div>
</body></html>`;

const htmlPath = path.join(DIR, 'sample-accounts.html');
const pdfPath = path.join(DIR, 'Click-to-Survive-Sample-Accounts.pdf');
fs.writeFileSync(htmlPath, html);
execFileSync(CHROME, ['--headless=new', '--disable-gpu', '--no-pdf-header-footer', `--print-to-pdf=${pdfPath}`, 'file://' + htmlPath], { stdio: 'ignore' });
console.log('Wrote ' + path.relative(path.join(__dirname, '..'), pdfPath));
