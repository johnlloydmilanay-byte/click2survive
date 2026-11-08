'use strict';
// Seeds sample accounts for testing into the live Firebase project:
//   · one section per grade level (GRADE_LEVELS in js/game-data.js),
//   · five students per section (Student ID is their login),
//   · one teacher per section (username + generated password), assigned to it,
//   · one active session per section, so students can play straight away.
// Every document is tagged `sample: true` and uses fixed IDs (sample-g7, SAMPLE-G7-01, …),
// so running it again resets the same accounts (with new teacher passwords), and
//   node tools/seed-sample-data.js --remove
// deletes all of it. Generated logins are written to sample-data/sample-accounts.json,
// which is kept out of Git (.gitignore) and out of Hosting (firebase.json).
//
// Runs as the account signed in to the Firebase CLI (`npx firebase-tools login`), using
// the CLI's own API client, so it needs no service-account key. Pass the firebase-tools
// package directory as the first argument if it can't be found automatically.

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const PROJECT = 'click2survive-764f4';
const ROOT = path.join(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'sample-data');
const REMOVE = process.argv.includes('--remove');

function findFirebaseTools(){
  const arg = process.argv.slice(2).find(a => !a.startsWith('--'));
  if (arg) return arg;
  const npx = path.join(os.homedir(), '.npm', '_npx');
  const found = fs.existsSync(npx) ? fs.readdirSync(npx).map(d => path.join(npx, d, 'node_modules', 'firebase-tools'))
    .filter(d => fs.existsSync(path.join(d, 'lib', 'apiv2.js')))
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs) : [];
  if (!found.length) throw new Error('firebase-tools not found — run `npx -y firebase-tools --version` once, or pass its path.');
  return found[0];
}
const FT = findFirebaseTools();
const { requireAuth } = require(path.join(FT, 'lib', 'requireAuth'));
const { Client } = require(path.join(FT, 'lib', 'apiv2'));
const { getGlobalDefaultAccount } = require(path.join(FT, 'lib', 'auth'));

// Grade levels and the same username → email mapping the app uses (session.js).
const GRADE_LEVELS = [7, 8, 9, 10, 11, 12];
const usernameToEmail = u => String(u).trim().toLowerCase().replace(/[^a-z0-9._-]/g, '') + '@click2survive.local';
// Same ambiguity-free charset as randomCredentialString() in session.js.
function password(n){
  const cs = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  return [...crypto.randomBytes(n)].map(b => cs[b % cs.length]).join('');
}

const SECTIONS = { 7:'Sampaguita', 8:'Narra', 9:'Mabini', 10:'Rizal', 11:'STEM A', 12:'STEM B' };
const TEACHERS = { 7:'Ana Santos', 8:'Ramon Dela Cruz', 9:'Liza Bautista', 10:'Carlo Reyes', 11:'Grace Villanueva', 12:'Paolo Mendoza' };
const STUDENTS = {
  7:  ['Juan Dela Cruz','Maria Clara Reyes','Jose Mari Santos','Angelica Bautista','Mark Anthony Lim'],
  8:  ['Kristine Joy Garcia','John Paul Mendoza','Princess Mae Cruz','Christian Villanueva','Rhea Mae Aquino'],
  9:  ['Joshua Ramos','Andrea Nicole Flores','Kevin Castillo','Janine Torres','Miguel Fernandez'],
  10: ['Patricia Ann Gonzales','Carl Justin Rivera','Bea Marie Navarro','Lorenzo Pascual','Shiela Mae Domingo'],
  11: ['Gabriel Salazar','Jasmine Rose Aguilar','Nathaniel Ocampo','Camille Joy Manalo','Rafael Javier'],
  12: ['Isabella Marquez','Vincent Paul Soriano','Hannah Grace Tolentino','Adrian Mercado','Kimberly Ann Valdez']
};
const sectionId = g => `sample-g${g}`;
const sessionId = g => `sample-g${g}`;
const studentId = (g, i) => `SAMPLE-G${g}-${String(i + 1).padStart(2, '0')}`;
const teacherUsername = g => `sample.teacher${g}`;

// ─── Firestore REST helpers ───
const DOCS = `projects/${PROJECT}/databases/(default)/documents`;
function enc(v){
  if (v === null || v === undefined) return { nullValue: null };
  if (v instanceof Date) return { timestampValue: v.toISOString() };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === 'string') return { stringValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(enc) } };
  return { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, enc(x)])) } };
}
const setDoc = (p, data) => ({ update: { name: `${DOCS}/${p}`, fields: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, enc(v)])) } });
const delDoc = p => ({ delete: `${DOCS}/${p}` });

(async () => {
  const acct = getGlobalDefaultAccount();
  if (!acct) throw new Error('Not signed in — run `npx -y firebase-tools login` first.');
  const who = await requireAuth({ user: acct.user, tokens: acct.tokens });
  console.log(`Signed in as ${who} · project ${PROJECT}`);
  const db = new Client({ urlPrefix: 'https://firestore.googleapis.com', auth: true, apiVersion: 'v1' });
  const idt = new Client({ urlPrefix: 'https://identitytoolkit.googleapis.com', auth: true, apiVersion: 'v1' });
  const commit = writes => db.post(`${DOCS}:commit`, { writes });
  const lookupUid = async email => {
    const r = await idt.post(`projects/${PROJECT}/accounts:lookup`, { email: [email] });
    return r.body.users && r.body.users[0] ? r.body.users[0].localId : null;
  };

  if (REMOVE){
    const writes = [];
    for (const g of GRADE_LEVELS){
      writes.push(delDoc(`sections/${sectionId(g)}`), delDoc(`sessions/${sessionId(g)}`));
      STUDENTS[g].forEach((_, i) => writes.push(delDoc(`students/${studentId(g, i)}`)));
      const uid = await lookupUid(usernameToEmail(teacherUsername(g)));
      if (uid){
        writes.push(delDoc(`teachers/${uid}`));
        await idt.post(`projects/${PROJECT}/accounts:delete`, { localId: uid });
      }
    }
    await commit(writes);
    console.log(`Removed sample sections, students, teachers and sessions (${writes.length} documents).`);
    console.log('Note: runs/answers the sample students saved (attempts, scenarioResults, history) are kept;');
    console.log('remove those students from the Super Admin Students page first if you want them gone too.');
    return;
  }

  const now = new Date();
  const accounts = { project: PROJECT, generatedAt: now.toISOString(), site: `https://${PROJECT}.web.app`, grades: [] };
  const writes = [];
  for (const g of GRADE_LEVELS){
    const secName = `SAMPLE – ${SECTIONS[g]}`;
    // Teacher login: create, or reset the password if it already exists from an earlier run.
    const username = teacherUsername(g), email = usernameToEmail(username), pw = password(10);
    const name = `${TEACHERS[g]} (Sample)`;
    let uid = await lookupUid(email);
    if (uid) await idt.post(`projects/${PROJECT}/accounts:update`, { localId: uid, password: pw, displayName: name });
    else uid = (await idt.post(`projects/${PROJECT}/accounts`, { email, password: pw, displayName: name })).body.localId;

    writes.push(setDoc(`sections/${sectionId(g)}`, { grade: g, name: secName, studentCount: STUDENTS[g].length, createdBy: 'sample-seed', createdAt: now, sample: true }));
    writes.push(setDoc(`teachers/${uid}`, { name, username, assignedSectionIds: [sectionId(g)], createdBy: 'sample-seed', createdAt: now, sample: true }));
    const students = STUDENTS[g].map((n, i) => ({ id: studentId(g, i), name: n }));
    students.forEach(s => writes.push(setDoc(`students/${s.id}`, {
      name: s.name, grade: g, sectionId: sectionId(g), sectionName: secName,
      latestPercent: null, latestSolved: null, latestTotal: null, latestAt: null, attemptCount: 0,
      createdAt: now, sample: true })));
    const label = `Sample Session · Grade ${g}`;
    writes.push(setDoc(`sessions/${sessionId(g)}`, { teacherId: uid, grade: g, sectionId: sectionId(g), sectionName: secName,
      label, status: 'active', attemptCount: 0, avgPercent: 0, createdAt: now, closedAt: null, sample: true }));
    accounts.grades.push({ grade: g, section: secName, sessionLabel: label, teacher: { name, username, email, password: pw, uid }, students });
  }
  await commit(writes);
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUT_DIR, 'sample-accounts.json'), JSON.stringify(accounts, null, 2));
  console.log(`Seeded ${GRADE_LEVELS.length} sections, ${GRADE_LEVELS.length} teachers, ${accounts.grades.reduce((n, x) => n + x.students.length, 0)} students and ${GRADE_LEVELS.length} active sessions (${writes.length} documents).`);
  console.log('Logins written to sample-data/sample-accounts.json (not committed, not deployed).');
})().catch(e => { console.error('Failed:', e.status || '', e.message); process.exit(1); });
