'use strict';
// Shared helpers for the Teacher and Super Admin dashboards: formatting, the DepEd
// mastery scale, item analysis, small chart pieces (bars, gauge, stacked bands),
// navigation, theme, dialogs, tooltip, toast and CSV export. Loaded after
// game-data.js so item analysis can show each question's real text and choices.

function esc(s){ return String(s==null?'':s).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
// Bootstrap Icons glyph; decorative unless a label is given.
function ico(name, label){ return label ? `<i class="bi bi-${name}" role="img" aria-label="${esc(label)}"></i>` : `<i class="bi bi-${name}" aria-hidden="true"></i>`; }
function emptyHTML(text, icon){ return `<div class="empty">${ico(icon || 'inbox')}${esc(text)}</div>`; }

// Firestore Timestamps, ISO strings and epoch millis all show up in this data
// (sessions use server timestamps, attempts use ISO strings).
function toMillis(v){
  if (v == null) return 0;
  if (typeof v === 'number') return v;
  if (typeof v.toMillis === 'function') return v.toMillis();
  const t = Date.parse(v); return isNaN(t) ? 0 : t;
}
function fmtWhen(v, withYear){
  const t = toMillis(v); if (!t) return '–';
  const o = { month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' };
  if (withYear) o.year = 'numeric';
  return new Date(t).toLocaleString([], o);
}
function fmtDate(v){ const t = toMillis(v); return t ? new Date(t).toLocaleDateString([], { year:'numeric', month:'long', day:'numeric' }) : '–'; }
function fmtAgo(v){
  const t = toMillis(v); if (!t) return '–';
  const s = Math.round((Date.now() - t) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return Math.round(s/60) + ' min ago';
  if (s < 86400) return Math.round(s/3600) + ' h ago';
  if (s < 86400*7) return Math.round(s/86400) + ' d ago';
  return fmtWhen(v);
}
function pct(n){ return n == null || isNaN(n) ? '–' : Math.round(n) + '%'; }
function mean(arr){ return arr.length ? arr.reduce((a,b)=>a+b,0) / arr.length : null; }
function initials(name){ return String(name||'?').trim().split(/\s+/).slice(0,2).map(w=>w[0]||'').join('').toUpperCase() || '?'; }

// ── DepEd mastery scale (Mean Percentage Score descriptors, DepEd Memo 160 s.2012).
// Colour groups the seven descriptors into four status tones; the label text is
// always shown next to the colour so meaning never rests on colour alone.
const MASTERY = [
  { min:96, label:'Mastered',                     tone:'good' },
  { min:86, label:'Closely approximating mastery', tone:'good' },
  { min:66, label:'Moving towards mastery',        tone:'warn' },
  { min:35, label:'Average mastery',               tone:'serious' },
  { min:15, label:'Low mastery',                   tone:'crit' },
  { min:5,  label:'Very low mastery',              tone:'crit' },
  { min:0,  label:'Absolutely no mastery',         tone:'crit' }
];
const MASTERY_GROUPS = [
  { tone:'good',    label:'Mastered / near mastery', range:'86–100%' },
  { tone:'warn',    label:'Moving towards mastery',  range:'66–85%' },
  { tone:'serious', label:'Average',                 range:'35–65%' },
  { tone:'crit',    label:'Low',                     range:'0–34%' }
];
const TONE_ICON = { good:'check-circle-fill', warn:'arrow-up-right-circle-fill', serious:'dash-circle-fill', crit:'exclamation-circle-fill', none:'circle' };
function mastery(p){
  if (p == null || isNaN(p)) return { label:'No data', tone:'none' };
  return MASTERY.find(m => Math.round(p) >= m.min) || MASTERY[MASTERY.length-1];
}
function masteryBadge(p){ const m = mastery(p); return `<span class="badge ${m.tone}">${ico(TONE_ICON[m.tone])}${esc(m.label)}</span>`; }
function liveBadge(text){ return `<span class="badge live"><span class="dot" aria-hidden="true"></span>${esc(text || 'Active')}</span>`; }
function closedBadge(){ return `<span class="badge none">${ico('lock')}Closed</span>`; }

// Classical test theory labels for an item.
function difficultyLabel(p){
  if (p == null) return '–';
  return p >= 81 ? 'Very easy' : p >= 61 ? 'Easy' : p >= 41 ? 'Average' : p >= 21 ? 'Difficult' : 'Very difficult';
}
function discrimination(d){
  if (d == null) return { label:'Not enough data', decision:'–', tone:'none' };
  if (d >= .40) return { label:'Very good', decision:'Retain', tone:'good' };
  if (d >= .30) return { label:'Good', decision:'Retain', tone:'good' };
  if (d >= .20) return { label:'Fair', decision:'Revise', tone:'warn' };
  if (d >= 0)   return { label:'Poor', decision:'Revise', tone:'serious' };
  return { label:'Negative', decision:'Reject / rewrite', tone:'crit' };
}

// ── Chart pieces ───────────────────────────────────────────────────────────
// The visible % text carries the value for screen readers; the track is decorative.
function barHTML(p, opts){
  opts = opts || {};
  const v = p == null ? 0 : Math.max(0, Math.min(100, p));
  const tone = opts.tone === 'seq' ? '' : (opts.tone || mastery(p).tone);
  const tip = opts.tip ? ` data-tip="${esc(opts.tip)}" tabindex="0"` : '';
  return `<div class="bar"${tip}><div class="bar-track" aria-hidden="true"><div class="bar-fill ${tone}" style="width:${v}%"></div></div><span class="bar-val">${pct(p)}</span>${opts.tip?`<span class="sr-only">, ${esc(opts.tip)}</span>`:''}</div>`;
}
function gaugeSVG(p, size){
  size = size || 92;
  const r = size/2 - 8, c = 2*Math.PI*r, v = p == null ? 0 : Math.max(0, Math.min(100, p));
  const tone = mastery(p).tone;
  const col = tone === 'none' ? 'var(--track)' : `var(--${tone})`;
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" role="img" aria-label="${pct(p)}, ${esc(mastery(p).label)}">
    <circle cx="${size/2}" cy="${size/2}" r="${r}" fill="none" stroke="var(--track)" stroke-width="9"/>
    <circle cx="${size/2}" cy="${size/2}" r="${r}" fill="none" stroke="${col}" stroke-width="9" stroke-linecap="round"
      stroke-dasharray="${(v/100)*c} ${c}" transform="rotate(-90 ${size/2} ${size/2})"/>
    <text x="50%" y="50%" text-anchor="middle" dominant-baseline="central" fill="var(--tx)" font-size="${size*.22}" font-weight="700">${p==null?'–':Math.round(p)+'%'}</text>
  </svg>`;
}
function masteryGroups(scores, notPlayed){
  const groups = MASTERY_GROUPS.map(g => ({ ...g, n:0 }));
  scores.forEach(p => { const t = mastery(p).tone; const g = groups.find(x => x.tone === t); if (g) g.n++; });
  return { groups, notPlayed: notPlayed || 0, total: scores.length + (notPlayed || 0) };
}
// Students spread across the four mastery groups (plus "not yet played").
function masteryStackHTML(scores, notPlayed){
  const { groups, total } = masteryGroups(scores, notPlayed);
  if (!total) return emptyHTML('No students yet.', 'people');
  const summary = groups.map(g => `${g.label}: ${g.n}`).join(', ') + (notPlayed ? `, Not yet played: ${notPlayed}` : '');
  const seg = (n, cls, tip) => n ? `<div class="${cls}" style="flex:${n}" data-tip="${esc(tip)}"></div>` : '';
  return `<div class="stack" role="img" aria-label="${esc('Students by mastery level. ' + summary)}">${groups.map(g => seg(g.n, 'bg-'+g.tone, `${g.label} (${g.range}): ${g.n} student${g.n===1?'':'s'}`)).join('')}${seg(notPlayed, 'bg-none', `Not yet played: ${notPlayed}`)}</div>
    <ul class="legend">${groups.map(g => `<li><i class="sw bg-${g.tone}" aria-hidden="true"></i>${esc(g.label)} <b>${g.n}</b></li>`).join('')}${notPlayed?`<li><i class="sw bg-none" aria-hidden="true"></i>Not yet played <b>${notPlayed}</b></li>`:''}</ul>`;
}
function statHTML(o){
  return `<div class="stat"><div class="stat-top"><span class="stat-l">${esc(o.label)}</span>${o.icon?`<span class="stat-ico ${o.tone||''}">${ico(o.icon)}</span>`:''}</div>
    <div class="stat-n">${o.value}</div>${o.sub!=null?`<div class="stat-s">${o.sub}</div>`:''}</div>`;
}

// ── Attempt scoping ───────────────────────────────────────────────────────
// mode: 'all' every completed run; 'first' / 'latest' one run per student.
function scopeAttempts(attempts, f){
  f = f || {};
  let a = attempts.filter(x => (!f.grade || x.grade === f.grade) && (!f.sectionId || x.sectionId === f.sectionId) && (!f.sessionId || x.sessionId === f.sessionId));
  if (f.mode === 'first' || f.mode === 'latest'){
    const by = new Map();
    a.forEach(x => {
      const cur = by.get(x.studentId), t = toMillis(x.finishedAt);
      if (!cur || (f.mode === 'latest' ? t > toMillis(cur.finishedAt) : t < toMillis(cur.finishedAt))) by.set(x.studentId, x);
    });
    a = [...by.values()];
  }
  return a;
}
const MODE_LABEL = { all:'All runs', first:'First run per student', latest:'Latest run per student' };
function latestByStudent(attempts){
  const m = new Map();
  attempts.forEach(a => { const c = m.get(a.studentId); if (!c || toMillis(a.finishedAt) > toMillis(c.finishedAt)) m.set(a.studentId, a); });
  return m;
}

// ── Item analysis ─────────────────────────────────────────────────────────
// p (difficulty index) = % of responses correct. D (discrimination index) =
// p(upper 27% of runs by total score) − p(lower 27%), only when ≥ 6 runs exist.
function computeItemAnalysis(grade, attempts, results){
  const gd = (typeof GRADES !== 'undefined' && GRADES[grade]) || null;
  const scen = gd ? gd.scenarios : [];
  const ids = new Set(attempts.map(a => a.id));
  const rs = results.filter(r => ids.has(r.attemptId));
  const sorted = [...attempts].sort((a,b) => (b.percentScore||0) - (a.percentScore||0));
  const n = sorted.length, k = n >= 6 ? Math.max(2, Math.round(n * .27)) : 0;
  const upper = new Set(sorted.slice(0, k).map(a => a.id));
  const lower = new Set(sorted.slice(n - k).map(a => a.id));

  const by = new Map();
  const ensure = i => { if (!by.has(i)) by.set(i, { idx:i, n:0, correct:0, counts:new Map(), up:[0,0], lo:[0,0], correctOption:null }); return by.get(i); };
  scen.forEach((_, i) => ensure(i));
  rs.forEach(r => {
    const b = ensure(r.scenarioIndex);
    const ok = r.outcome === 'correct';
    b.n++; if (ok) b.correct++;
    const key = r.chosenOption == null ? 'none' : r.chosenOption;
    b.counts.set(key, (b.counts.get(key)||0) + 1);
    if (r.correctOption != null) b.correctOption = r.correctOption;
    if (upper.has(r.attemptId)){ b.up[0]++; if (ok) b.up[1]++; }
    if (lower.has(r.attemptId)){ b.lo[0]++; if (ok) b.lo[1]++; }
  });

  const items = [...by.values()].sort((a,b) => a.idx - b.idx).map(b => {
    const s = scen[b.idx] || {};
    const p = b.n ? (b.correct / b.n) * 100 : null;
    const D = k && b.up[0] && b.lo[0] ? (b.up[1]/b.up[0]) - (b.lo[1]/b.lo[0]) : null;
    let options;
    if (s.lab){
      const keys = [...b.counts.keys()].filter(x => x !== 'none').sort((x,y) => x - y);
      if (b.correctOption != null && !keys.includes(b.correctOption)) keys.push(b.correctOption), keys.sort((x,y)=>x-y);
      options = keys.map(key => ({ key, letter:String(key), text:`Loaded ${key} passenger${key===1?'':'s'}`, count:b.counts.get(key)||0, correct:key === b.correctOption }));
    } else {
      options = (s.opts || []).map((t, i) => ({ key:i, letter:String.fromCharCode(65+i), text:t, count:b.counts.get(i)||0, correct:i === s.ci }));
      [...b.counts.keys()].filter(x => x !== 'none' && !(s.opts||[])[x]).forEach(x => options.push({ key:x, letter:String.fromCharCode(65+Number(x)), text:'(choice no longer in the item)', count:b.counts.get(x), correct:x === b.correctOption }));
    }
    if (b.counts.get('none')) options.push({ key:'none', letter:'–', text:'No answer recorded', count:b.counts.get('none'), correct:false });
    const wrong = options.filter(o => !o.correct && o.count > 0).sort((a,b) => b.count - a.count);
    return {
      idx:b.idx, no:b.idx+1, n:b.n, correct:b.correct, p, D,
      question: s.q || s.objective || s.sit || `Item ${b.idx+1}`,
      situation: s.q ? s.sit : (s.objective ? s.sit : ''),
      comp: s.comp || (gd && gd.topic) || 'General',
      feedback: s.fb || '', lab: !!s.lab, options, topWrong: wrong[0] || null
    };
  });

  const compMap = new Map();
  items.forEach(it => {
    if (!compMap.has(it.comp)) compMap.set(it.comp, { comp:it.comp, n:0, correct:0, items:[] });
    const c = compMap.get(it.comp); c.n += it.n; c.correct += it.correct; c.items.push(it.no);
  });
  const competencies = [...compMap.values()].map(c => ({ ...c, p: c.n ? c.correct/c.n*100 : null }));
  const mps = mean(attempts.map(a => a.percentScore || 0));
  const answered = items.filter(i => i.n);
  return { grade, gd, attempts:n, students:new Set(attempts.map(a => a.studentId)).size, mps, items, competencies, groupSize:k,
    least: answered.filter(i => i.p < 75).sort((a,b) => a.p - b.p), learned: answered.filter(i => i.p >= 75).length, answered: answered.length };
}
function trimDot(s){ return String(s||'').replace(/[.\s]+$/, ''); }

function itemAnalysisHTML(ia){
  if (!ia.attempts) return `<div class="panel">${emptyHTML('No completed runs match these filters yet. Results appear here as soon as students finish a run.', 'clipboard-data')}</div>`;
  const m = mastery(ia.mps);
  const head = `
  <div class="stat-row">
    <div class="stat"><div class="stat-top"><span class="stat-l">Mean percentage score</span></div>
      <div class="gauge" style="margin-top:.3rem">${gaugeSVG(ia.mps, 76)}<div>${masteryBadge(ia.mps)}<div class="stat-s" style="margin-top:.35rem">DepEd MPS descriptor</div></div></div></div>
    ${statHTML({ label:'Runs analysed', icon:'journal-check', value:ia.attempts, sub:`${ia.students} student${ia.students===1?'':'s'}` })}
    ${statHTML({ label:'Items learned (≥ 75%)', icon:'check2-circle', tone:'good', value:`${ia.learned}<small> / ${ia.answered}</small>`, sub:'75% is the DepEd passing mark' })}
    ${statHTML({ label:'Least-learned items', icon:'exclamation-triangle', tone:ia.least.length?'warn':'good', value:ia.least.length, sub: ia.least.length ? 'Items ' + ia.least.map(i=>'#'+i.no).join(', ') : 'None below 75%' })}
  </div>`;

  const comps = `
  <section class="panel" aria-labelledby="ia-comp-h">
    <div class="panel-h"><h3 id="ia-comp-h">${ico('diagram-3')}Learning by competency</h3></div>
    <p class="panel-hint">How much of each competency the class has learned: the share of all answers on that competency's items that were correct.</p>
    <div class="table-wrap"><table>
      <thead><tr><th scope="col">Competency</th><th scope="col">Items</th><th scope="col" class="num">Responses</th><th scope="col" style="min-width:200px">% learned</th><th scope="col">Mastery level</th></tr></thead>
      <tbody>${ia.competencies.map(c => `<tr>
        <th scope="row" style="font-weight:600">${esc(c.comp)}</th><td>${c.items.map(n=>'#'+n).join(', ')}</td><td class="num">${c.n}</td>
        <td>${barHTML(c.p, { tip:`${c.correct} of ${c.n} answers correct` })}</td><td>${c.n ? masteryBadge(c.p) : ''}</td></tr>`).join('')}</tbody>
    </table></div>
  </section>`;

  const cards = ia.items.map(it => {
    const d = discrimination(it.D);
    const maxCount = Math.max(1, ...it.options.map(o => o.count));
    const opts = it.options.map(o => {
      const share = it.n ? o.count / it.n * 100 : 0;
      const isTop = it.topWrong && o.key === it.topWrong.key;
      return `<li class="opt ${o.correct?'correct':''} ${isTop?'top-wrong':''}" data-tip="${esc(`${o.count} of ${it.n} chose this (${Math.round(share)}%)`)}">
        <span class="letter" aria-hidden="true">${o.correct ? ico('check-lg') : esc(o.letter)}</span>
        <span class="txt"><span class="sr-only">Choice ${esc(o.letter)}: </span>${esc(o.text)}${o.correct?'<span class="tag right">Correct answer</span>':''}${isTop?'<span class="tag wrong">Most-picked wrong</span>':''}</span>
        <div class="bar-track" aria-hidden="true"><div class="opt-fill" style="width:${o.count/maxCount*100}%"></div></div>
        <span class="cnt">${o.count} · ${Math.round(share)}%</span></li>`;
    }).join('');
    return `<article class="item" aria-labelledby="item-q-${it.no}">
      <div class="item-h">
        <div class="item-no" aria-hidden="true">${it.no}</div>
        <div class="item-body">
          <h4 class="item-q" id="item-q-${it.no}"><span class="sr-only">Item ${it.no}: </span>${esc(it.question)}</h4>
          ${it.situation ? `<p class="item-sub">${esc(it.situation)}</p>` : ''}
          <div class="item-kpis">
            <span class="chip">${esc(it.comp)}</span>
            ${it.n ? `<span class="k">Difficulty: <b>${difficultyLabel(it.p)}</b></span>
            <span class="k" data-tip="Upper 27% vs lower 27% of runs">Discrimination: <b>${d.label}${it.D!=null?' ('+it.D.toFixed(2)+')':''}</b></span>
            <span class="badge ${d.tone}">${d.decision === '–' ? 'Needs 6 or more runs' : 'Decision: ' + d.decision}</span>` : '<span class="k">No responses yet</span>'}
          </div>
        </div>
        <div class="item-pct"><div class="n">${pct(it.p)}</div><div class="l">${it.n ? `${it.correct} of ${it.n} correct` : '—'}</div>${it.n?`<div style="margin-top:.3rem">${masteryBadge(it.p)}</div>`:''}</div>
      </div>
      ${it.n ? `<ul class="opts" aria-label="Answer distribution">${opts}</ul>` : ''}
      ${it.n && it.topWrong && it.p < 75 ? `<div class="item-fb">${ico('lightbulb')}<div><b>Misconception to re-teach:</b> ${it.topWrong.count} answer${it.topWrong.count===1?'':'s'} chose “${esc(trimDot(it.topWrong.text))}”. ${esc(it.feedback)}</div></div>` : ''}
    </article>`;
  }).join('');

  return head + comps + `<section class="panel" aria-labelledby="ia-items-h"><div class="panel-h"><h3 id="ia-items-h">${ico('list-ol')}Item-by-item</h3></div>
    <p class="panel-hint">The difficulty index is the % who answered correctly. Discrimination compares the top 27% and bottom 27% of runs: a good item is answered correctly more often by stronger students. The bars show which choice students picked.</p>
    <div class="items">${cards}</div></section>`;
}
function itemAnalysisCSV(ia){
  const rows = [['Item','Competency','Question','Responses','Correct','% Correct','Mastery','Difficulty','Discrimination D','Decision','Most-picked wrong answer','Option distribution']];
  ia.items.forEach(it => {
    const d = discrimination(it.D);
    rows.push([it.no, it.comp, it.question, it.n, it.correct, it.p==null?'':Math.round(it.p), it.n?mastery(it.p).label:'', it.n?difficultyLabel(it.p):'',
      it.D==null?'':it.D.toFixed(2), it.n?d.decision:'', it.topWrong?it.topWrong.text:'',
      it.options.map(o => `${o.letter}${o.correct?'*':''}=${o.count}`).join(' ')]);
  });
  return rows;
}

// ── Students / sections rollups ───────────────────────────────────────────
function sectionRollup(section, students, attempts){
  const roster = students.filter(s => s.sectionId === section.id);
  const latest = latestByStudent(attempts.filter(a => a.sectionId === section.id));
  const scores = [...latest.values()].map(a => a.percentScore || 0);
  const enrolled = Math.max(roster.length, section.studentCount || 0);
  return { ...section, enrolled, played:latest.size, participation: enrolled ? latest.size/enrolled*100 : null, mps: mean(scores), scores, runs: attempts.filter(a => a.sectionId === section.id).length };
}

// ── Firestore 'in' chunking (max 10 values per query), merged live ─────────
function watchChunkedIn(collectionRef, field, ids, onMerge, onErr){
  if (!ids.length){ onMerge([]); return () => {}; }
  const chunks = [];
  for (let i = 0; i < ids.length; i += 10) chunks.push(ids.slice(i, i+10));
  const perChunk = new Map();
  const unsubs = chunks.map((chunk, i) => collectionRef.where(field, 'in', chunk).onSnapshot(snap => {
    perChunk.set(i, snap.docs.map(d => ({ id: d.id, ...d.data() })));
    onMerge([].concat(...perChunk.values()));
  }, err => { if (onErr) onErr(err); }));
  return () => unsubs.forEach(u => u());
}

// ── CSV export ────────────────────────────────────────────────────────────
function downloadCSV(filename, rows){
  const cell = v => { const s = String(v == null ? '' : v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  const blob = new Blob(['﻿' + rows.map(r => r.map(cell).join(',')).join('\n')], { type:'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
function slug(s){ return String(s||'').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'export'; }

// ── Navigation (hash-routed so refresh / back keep the current page) ──────
function initTabs(onChange){
  const tabs = [...document.querySelectorAll('.tab[data-tab]')];
  const title = document.getElementById('page-title');
  const show = (name, focus) => {
    if (!tabs.some(t => t.dataset.tab === name)) name = tabs[0].dataset.tab;
    tabs.forEach(t => { if (t.dataset.tab === name) t.setAttribute('aria-current', 'page'); else t.removeAttribute('aria-current'); });
    document.querySelectorAll('.view[data-view]').forEach(v => v.classList.toggle('active', v.dataset.view === name));
    const tab = tabs.find(t => t.dataset.tab === name);
    if (title && tab) title.textContent = tab.dataset.title || tab.textContent.trim();
    document.title = `${tab ? (tab.dataset.title || tab.textContent.trim()) : ''} · ${document.body.dataset.app || 'Click to Survive'}`;
    setNavOpen(false);
    if (focus){ const h = document.querySelector(`.view[data-view="${name}"] h2`); if (h){ h.setAttribute('tabindex', '-1'); h.focus({ preventScroll:true }); } }
    if (onChange) onChange(name);
  };
  tabs.forEach(t => t.addEventListener('click', () => { history.replaceState(null, '', '#' + t.dataset.tab); show(t.dataset.tab, true); }));
  window.addEventListener('hashchange', () => show(location.hash.slice(1)));
  show(location.hash.slice(1));
  return name => { history.replaceState(null, '', '#' + name); show(name, true); window.scrollTo({ top:0 }); };
}
function setNavOpen(open){
  const app = document.querySelector('.app'); if (!app) return;
  app.classList.toggle('nav-open', open);
  const b = document.getElementById('menu-btn'); if (b) b.setAttribute('aria-expanded', open);
  if (open){ const t = document.querySelector('.tab[aria-current="page"]') || document.querySelector('.tab'); t && t.focus(); }
}
function toggleNav(){ setNavOpen(!document.querySelector('.app').classList.contains('nav-open')); }

// ── Theme ─────────────────────────────────────────────────────────────────
function currentTheme(){ return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light'; }
function toggleTheme(){
  const next = currentTheme() === 'light' ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', next);
  try { localStorage.setItem('c2s_dash_theme', next); } catch(e) {}
  syncThemeButton();
}
function syncThemeButton(){
  const b = document.getElementById('theme-btn'); if (!b) return;
  const dark = currentTheme() === 'dark';
  b.innerHTML = `${ico(dark ? 'sun' : 'moon-stars')}<span>${dark ? 'Light' : 'Dark'}</span>`;
  b.setAttribute('aria-label', dark ? 'Switch to light theme' : 'Switch to dark theme');
}

// ── Dialogs: focus moves in, Tab stays inside, Escape closes, focus returns ──
const _modalReturn = new Map();
const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea,[tabindex]:not([tabindex="-1"])';
function openModal(id){
  const m = document.getElementById(id);
  if (m.style.display !== 'flex') _modalReturn.set(id, document.activeElement);
  m.style.display = 'flex';
  const card = m.querySelector('.modal-card');
  const first = card.querySelector('[autofocus]') || card.querySelector(FOCUSABLE);
  (first || card).focus();
}
function closeModal(id){
  const m = document.getElementById(id);
  if (m.style.display === 'none') return;
  m.style.display = 'none';
  const back = _modalReturn.get(id); _modalReturn.delete(id);
  if (back && document.contains(back)) back.focus();
}
document.addEventListener('keydown', e => {
  const open = [...document.querySelectorAll('.modal-overlay')].filter(m => m.style.display === 'flex').pop();
  if (e.key === 'Escape'){
    if (open && !open.hasAttribute('data-static')) closeModal(open.id);
    else if (document.querySelector('.app.nav-open')) setNavOpen(false);
  }
  if (e.key === 'Tab' && open){
    const f = [...open.querySelectorAll(FOCUSABLE)].filter(x => x.offsetParent !== null);
    if (!f.length) return;
    if (e.shiftKey && document.activeElement === f[0]){ e.preventDefault(); f[f.length-1].focus(); }
    else if (!e.shiftKey && document.activeElement === f[f.length-1]){ e.preventDefault(); f[0].focus(); }
  }
});
document.addEventListener('click', e => { if (e.target.classList && e.target.classList.contains('modal-overlay') && !e.target.hasAttribute('data-static')) closeModal(e.target.id); });

// ── Tooltip (mouse + keyboard focus) and toast (announced politely) ───────
(function(){
  const tip = document.createElement('div'); tip.id = 'tip'; tip.setAttribute('aria-hidden', 'true');
  const toastEl = document.createElement('div'); toastEl.id = 'toast'; toastEl.setAttribute('role', 'status'); toastEl.setAttribute('aria-live', 'polite');
  document.addEventListener('DOMContentLoaded', () => { document.body.append(tip, toastEl); syncThemeButton(); });
  const place = (x, y) => {
    const left = Math.min(x + 14, innerWidth - tip.offsetWidth - 8);
    const top = y + 16 + tip.offsetHeight > innerHeight ? y - tip.offsetHeight - 10 : y + 16;
    tip.style.left = Math.max(8, left) + 'px'; tip.style.top = top + 'px';
  };
  const showFor = t => { tip.textContent = t.getAttribute('data-tip'); tip.classList.add('on'); };
  document.addEventListener('mouseover', e => {
    const t = e.target.closest && e.target.closest('[data-tip]');
    if (!t){ tip.classList.remove('on'); return; } showFor(t);
  });
  document.addEventListener('mousemove', e => { if (tip.classList.contains('on')) place(e.clientX, e.clientY); });
  document.addEventListener('focusin', e => {
    const t = e.target.closest && e.target.closest('[data-tip]');
    if (!t || !e.target.matches(':focus-visible')){ tip.classList.remove('on'); return; }
    showFor(t); const r = t.getBoundingClientRect(); place(r.left, r.bottom - 8);
  });
  document.addEventListener('focusout', () => tip.classList.remove('on'));
  let tmr = null;
  window.toast = (msg, kind) => {
    toastEl.innerHTML = `${ico(kind === 'err' ? 'exclamation-octagon-fill' : 'check-circle-fill')}<span>${esc(msg)}</span>`;
    toastEl.className = 'on' + (kind === 'err' ? ' err' : '');
    clearTimeout(tmr); tmr = setTimeout(() => { toastEl.className = ''; }, 3500);
  };
})();

function setMsg(id, text, kind){
  const el = document.getElementById(id); if (!el) return;
  el.innerHTML = text ? `${kind === 'err' ? ico('exclamation-circle') : kind === 'ok' ? ico('check-circle') : ''}<span>${esc(text)}</span>` : '';
  el.className = 'msg' + (kind ? ' ' + kind : '');
}

// ── Student detail (shared by both dashboards; needs the #student-modal markup) ──
let _stCtx = null;
function renderStudentDetail(s, attempts, results, fns){
  const runs = [...attempts].sort((a,b) => toMillis(b.finishedAt) - toMillis(a.finishedAt));
  _stCtx = { student:s, runs, results, fns };
  const best = runs.length ? Math.max(...runs.map(a => a.percentScore||0)) : null;
  const first = runs[runs.length-1], last = runs[0];
  document.getElementById('st-avatar').textContent = initials(s.name);
  document.getElementById('st-title').textContent = s.name;
  document.getElementById('st-sub').textContent = `${s.id} · Grade ${s.grade} · ${fns.sectionName(s.sectionId) || s.sectionName || ''}`;
  const growth = runs.length > 1 ? last.percentScore - first.percentScore : null;
  document.getElementById('st-stats').innerHTML =
    statHTML({ label:'Latest score', icon:'bullseye', value: last ? pct(last.percentScore) : '–', sub: last ? masteryBadge(last.percentScore) : 'Not yet played' })
    + statHTML({ label:'Best score', icon:'trophy', value: pct(best) })
    + statHTML({ label:'Runs', icon:'arrow-repeat', value: runs.length })
    + statHTML({ label:'Growth (first to latest)', icon: growth>0?'graph-up-arrow':growth<0?'graph-down-arrow':'dash-lg', tone: growth>0?'good':growth<0?'crit':'', value: growth==null?'–':(growth>0?'+':'')+Math.round(growth)+' pts' });
  document.getElementById('st-history').innerHTML = runs.length ? runs.map(a => `<tr><td class="nowrap"><button class="link" onclick="showStudentRun('${a.id}')" aria-label="Show answers from ${esc(fmtWhen(a.finishedAt))}">${esc(fmtWhen(a.finishedAt))}</button></td><td>${esc(fns.sessionLabel(a.sessionId))}</td><td>${barHTML(a.percentScore)}</td></tr>`).join('')
    : `<tr><td colspan="3">${emptyHTML('No runs yet.', 'hourglass')}</td></tr>`;
  showStudentRun(last ? last.id : null);
}
function showStudentRun(attemptId){
  const el = document.getElementById('st-items');
  const a = attemptId && _stCtx && _stCtx.runs.find(x => x.id === attemptId);
  if (!a){ document.getElementById('st-items-title').textContent = 'Answers'; el.innerHTML = emptyHTML('This student has not finished a run yet.', 'hourglass'); return; }
  document.getElementById('st-items-title').textContent = `Answers · ${fmtWhen(a.finishedAt)}`;
  const rs = studentRunItems(a, _stCtx.results);
  if (!rs.length){ el.innerHTML = emptyHTML('No per-item answers available for this run.'); return; }
  el.innerHTML = `<ul class="hbars" style="list-style:none">${rs.map(r => `
    <li class="hbar three"><span class="badge ${r.ok?'good':'crit'}">${ico(r.ok?'check-lg':'x-lg')}<span class="sr-only">${r.ok?'Correct':'Wrong'}, </span>Item ${r.no}</span>
      <span class="name" data-tip="${esc(r.question)}">${esc(r.comp)}</span><span class="meta">${esc(r.pick)}</span></li>`).join('')}</ul>`;
}
function studentRunItems(a, results){
  const gd = typeof GRADES !== 'undefined' && GRADES[a.grade];
  const L = i => i == null ? '?' : String.fromCharCode(65 + Number(i));
  return results.filter(r => r.attemptId === a.id).sort((x,y) => x.scenarioIndex - y.scenarioIndex).map(r => {
    const sc = (gd && gd.scenarios[r.scenarioIndex]) || {};
    const ok = r.outcome === 'correct';
    const pick = sc.lab ? `Loaded ${r.chosenOption} (max ${r.correctOption})` : r.chosenOption == null ? 'No answer' : `Chose ${L(r.chosenOption)}${ok ? '' : ', answer is ' + L(sc.ci ?? r.correctOption)}`;
    return { no:r.scenarioIndex+1, ok, pick, comp: sc.comp || (gd && gd.topic) || '', question: sc.q || sc.objective || '' };
  });
}

// Table rows are clickable with the mouse, but the real control is the button in
// the row (keyboard and screen-reader users reach that). A row click forwards to it.
function rowClick(e, tr){
  if (e.target.closest('button,a,input,select')) return;
  const b = tr.querySelector('[data-primary]'); if (b) b.click();
}
function studentNameBtn(id, name, opts){
  opts = opts || {};
  return `<button class="name-btn" data-primary data-sid="${esc(id)}" onclick="openStudent(this.dataset.sid)">${opts.avatar===false?'':`<span class="avatar" style="width:28px;height:28px;font-size:.68rem" aria-hidden="true">${esc(initials(name))}</span>`}<span class="nm">${esc(name)}</span><span class="sr-only">, view details</span></button>`;
}
function saveSchoolName(v){ try { localStorage.setItem('c2s_report_school', v.trim()); } catch(e){} }
