// api.js — FRONTEND-ONLY MOCK BACKEND.
// The original api.js talked to a real Express server over fetch(). That
// server isn't part of this package, so every call was failing (that's why
// "semester loading and miscellaneous things" couldn't fetch anything).
//
// This version keeps the exact same `api.xxx()` function names/signatures
// that main.js already calls, but implements them entirely in the browser
// using localStorage as a tiny fake database. No server, no build step —
// just open index.html.
//
// NOTE: this is a demo-grade mock, not a real backend:
//  - passwords are stored as-is in localStorage (fine for a local demo,
//    never do this with a real backend)
//  - uploaded PDFs are stored as base64 data URLs in localStorage, which
//    has a ~5-10MB per-origin quota — keep demo uploads small
//  - data lives only in this browser; clearing site data resets everything
//  - the developer signup code is: DEV2026

const DEV_SIGNUP_CODE = 'DEV2026';
const DB_KEY = 'sp_mock_db_v1';

// btoa() only accepts Latin1 (single-byte) characters and throws on things
// like em dashes, curly quotes, or emoji. This encodes any UTF-8 string
// (including seed text) safely to base64.
function utf8ToBase64(str) {
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  bytes.forEach(b => { binary += String.fromCharCode(b); });
  return btoa(binary);
}

// ---------- tiny fake database ----------
function seedDb() {
  const now = () => new Date().toISOString();
  const devUser = { id: 1, name: 'Demo Developer', email: 'dev@example.com', password: 'password123', role: 'developer' };
  const studentUser = { id: 2, name: 'Demo Student', email: 'student@example.com', password: 'password123', role: 'student' };

  const subjects = [
    { id: 1, semester: 1, name: 'Engineering Mathematics I', code: 'MATH101' },
    { id: 2, semester: 1, name: 'Programming Fundamentals', code: 'CSC101' },
    { id: 3, semester: 2, name: 'Engineering Mathematics II', code: 'MATH102' },
    { id: 4, semester: 2, name: 'Data Structures', code: 'CSC102' },
    { id: 5, semester: 3, name: 'Discrete Structures', code: 'CSC201' },
    { id: 6, semester: 3, name: 'Object Oriented Programming', code: 'CSC202' },
  ];

  const notes = [
    { id: 1, subject_id: 2, title: 'Intro to Loops & Conditionals', description: 'Chapter 3 summary notes.', filename: 'seed-note-1.txt', original_name: 'loops-conditionals.txt', uploaded_by: 1, created_at: now(), fileDataUrl: 'data:text/plain;base64,' + utf8ToBase64('Sample note content - replace with a real upload.') },
  ];
  const pyqs = [
    { id: 1, subject_id: 2, title: '2024 Mid-term', year: '2024', filename: 'seed-pyq-1.txt', original_name: 'midterm-2024.txt', uploaded_by: 1, created_at: now(), fileDataUrl: 'data:text/plain;base64,' + utf8ToBase64('Sample past-year-question content - replace with a real upload.') },
  ];

  const doubts = [
    { id: 1, subject_id: 2, user_id: 2, title: 'Difference between while and do-while?', body: 'When would I actually prefer a do-while loop?', resolved: false, created_at: now() },
  ];
  const doubt_replies = [];
  const ratings = [];
  const reports = [];

  return {
    users: [devUser, studentUser],
    subjects, notes, pyqs, doubts, doubt_replies, ratings, reports,
    counters: { subjects: 6, notes: 1, pyqs: 1, doubts: 1, doubt_replies: 0, reports: 0, users: 2 },
  };
}

function loadDb() {
  let raw;
  try { raw = JSON.parse(localStorage.getItem(DB_KEY)); } catch (e) { raw = null; }
  if (!raw) {
    raw = seedDb();
    saveDb(raw);
  }
  return raw;
}
function saveDb(db) { localStorage.setItem(DB_KEY, JSON.stringify(db)); }
function nextId(db, collection) { db.counters[collection] = (db.counters[collection] || 0) + 1; return db.counters[collection]; }

// simulate network latency + async nature of fetch()
function delay(value, ms = 120) {
  return new Promise((resolve, reject) => setTimeout(() => {
    if (value instanceof Error) reject(value); else resolve(value);
  }, ms));
}

function currentUser() {
  try { return JSON.parse(localStorage.getItem('sp_user') || 'null'); } catch (e) { return null; }
}
function requireAuth() {
  const u = currentUser();
  if (!u) throw new Error('You must be logged in.');
  return u;
}
function requireRole(role) {
  const u = requireAuth();
  if (u.role !== role) throw new Error(`Only a ${role} account can do this.`);
  return u;
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Could not read the selected file.'));
    reader.readAsDataURL(file);
  });
}

// ---------- api ----------
const api = {
  // ---- auth ----
  register: ({ name, email, password, devCode }) => {
    const db = loadDb();
    if (!name || !email || !password) return delay(new Error('Name, email and password are required.'));
    if (password.length < 6) return delay(new Error('Password must be at least 6 characters.'));
    const emailLc = email.toLowerCase();
    if (db.users.some(u => u.email === emailLc)) return delay(new Error('An account with this email already exists.'));
    let role = 'student';
    if (devCode) {
      if (devCode === DEV_SIGNUP_CODE) role = 'developer';
      else return delay(new Error('Developer signup code is incorrect.'));
    }
    const user = { id: nextId(db, 'users'), name, email: emailLc, password, role };
    db.users.push(user);
    saveDb(db);
    const safeUser = { id: user.id, name: user.name, email: user.email, role: user.role };
    return delay({ token: `mock-token-${safeUser.id}`, user: safeUser });
  },

  login: ({ email, password }) => {
    const db = loadDb();
    if (!email || !password) return delay(new Error('Email and password are required.'));
    const user = db.users.find(u => u.email === email.toLowerCase());
    if (!user || user.password !== password) return delay(new Error('Invalid email or password.'));
    const safeUser = { id: user.id, name: user.name, email: user.email, role: user.role };
    return delay({ token: `mock-token-${safeUser.id}`, user: safeUser });
  },

  me: () => {
    try { return delay({ user: requireAuth() }); }
    catch (err) { return delay(err); }
  },

  // ---- semesters / subjects ----
  semesters: () => {
    const db = loadDb();
    const counts = {};
    db.subjects.forEach(s => { counts[s.semester] = (counts[s.semester] || 0) + 1; });
    const semesters = Array.from({ length: 8 }, (_, i) => ({ semester: i + 1, subject_count: counts[i + 1] || 0 }));
    return delay(semesters);
  },

  subjects: (semester) => {
    const db = loadDb();
    let rows = db.subjects.slice();
    if (semester) rows = rows.filter(s => Number(s.semester) === Number(semester));
    rows.sort((a, b) => a.semester - b.semester || a.name.localeCompare(b.name));
    return delay(rows);
  },

  createSubject: ({ semester, name, code }) => {
    try {
      requireRole('developer');
      if (!semester || !name) return delay(new Error('semester and name are required.'));
      const db = loadDb();
      const subject = { id: nextId(db, 'subjects'), semester: Number(semester), name, code: code || '' };
      db.subjects.push(subject);
      saveDb(db);
      return delay(subject);
    } catch (err) { return delay(err); }
  },

  updateSubject: (id, { name, code, semester }) => {
    try {
      requireRole('developer');
      const db = loadDb();
      const existing = db.subjects.find(s => s.id === Number(id));
      if (!existing) return delay(new Error('Subject not found.'));
      if (name != null) existing.name = name;
      if (code != null) existing.code = code;
      if (semester != null) existing.semester = Number(semester);
      saveDb(db);
      return delay(existing);
    } catch (err) { return delay(err); }
  },

  deleteSubject: (id) => {
    try {
      requireRole('developer');
      const db = loadDb();
      db.subjects = db.subjects.filter(s => s.id !== Number(id));
      db.notes = db.notes.filter(n => n.subject_id !== Number(id));
      db.pyqs = db.pyqs.filter(p => p.subject_id !== Number(id));
      saveDb(db);
      return delay({ ok: true });
    } catch (err) { return delay(err); }
  },

  // ---- notes ----
  notes: (subjectId) => {
    const db = loadDb();
    let rows = db.notes.slice();
    if (subjectId) rows = rows.filter(n => n.subject_id === Number(subjectId));
    rows = rows.map(n => {
      const uploader = db.users.find(u => u.id === n.uploaded_by);
      const out = { ...n, uploader_name: uploader ? uploader.name : 'developer' };
      delete out.fileDataUrl;
      if (subjectId) {
        const rs = db.ratings.filter(r => r.resource_type === 'note' && r.resource_id === n.id);
        out.rating_count = rs.length;
        out.avg_rating = rs.length ? Math.round((rs.reduce((a, r) => a + r.stars, 0) / rs.length) * 10) / 10 : null;
      }
      return out;
    });
    rows.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    return delay(rows);
  },

  uploadNote: async (formData) => {
    try {
      requireRole('developer');
      const subject_id = formData.get('subject_id');
      const title = formData.get('title');
      const description = formData.get('description');
      const file = formData.get('file');
      if (!subject_id || !title || !(file && file.size)) return delay(new Error('subject_id, title and a PDF file are required.'));
      const dataUrl = await fileToDataUrl(file);
      const db = loadDb();
      const user = currentUser();
      const note = {
        id: nextId(db, 'notes'), subject_id: Number(subject_id), title, description: description || '',
        filename: `note-${Date.now()}-${file.name}`, original_name: file.name, uploaded_by: user.id,
        created_at: new Date().toISOString(), fileDataUrl: dataUrl,
      };
      db.notes.push(note);
      saveDb(db);
      const out = { ...note }; delete out.fileDataUrl;
      return delay(out);
    } catch (err) { return delay(err instanceof Error ? err : new Error('Could not save file — it may be too large for local storage.')); }
  },

  updateNote: (id, { title, description, subject_id }) => {
    try {
      requireRole('developer');
      const db = loadDb();
      const existing = db.notes.find(n => n.id === Number(id));
      if (!existing) return delay(new Error('Note not found.'));
      if (title != null) existing.title = title;
      if (description != null) existing.description = description;
      if (subject_id != null) existing.subject_id = Number(subject_id);
      saveDb(db);
      const out = { ...existing }; delete out.fileDataUrl;
      return delay(out);
    } catch (err) { return delay(err); }
  },

  deleteNote: (id) => {
    try {
      requireRole('developer');
      const db = loadDb();
      const existing = db.notes.find(n => n.id === Number(id));
      if (!existing) return delay(new Error('Note not found.'));
      db.notes = db.notes.filter(n => n.id !== Number(id));
      saveDb(db);
      return delay({ ok: true });
    } catch (err) { return delay(err); }
  },

  // ---- pyqs ----
  pyqs: (subjectId) => {
    const db = loadDb();
    let rows = db.pyqs.slice();
    if (subjectId) rows = rows.filter(p => p.subject_id === Number(subjectId));
    rows = rows.map(p => {
      const uploader = db.users.find(u => u.id === p.uploaded_by);
      const out = { ...p, uploader_name: uploader ? uploader.name : 'developer' };
      delete out.fileDataUrl;
      if (subjectId) {
        const rs = db.ratings.filter(r => r.resource_type === 'pyq' && r.resource_id === p.id);
        out.rating_count = rs.length;
        out.avg_rating = rs.length ? Math.round((rs.reduce((a, r) => a + r.stars, 0) / rs.length) * 10) / 10 : null;
      }
      return out;
    });
    rows.sort((a, b) => (b.year || '').localeCompare(a.year || '') || new Date(b.created_at) - new Date(a.created_at));
    return delay(rows);
  },

  uploadPyq: async (formData) => {
    try {
      requireRole('developer');
      const subject_id = formData.get('subject_id');
      const title = formData.get('title');
      const year = formData.get('year');
      const file = formData.get('file');
      if (!subject_id || !title || !(file && file.size)) return delay(new Error('subject_id, title and a PDF file are required.'));
      const dataUrl = await fileToDataUrl(file);
      const db = loadDb();
      const user = currentUser();
      const pyq = {
        id: nextId(db, 'pyqs'), subject_id: Number(subject_id), title, year: year || '',
        filename: `pyq-${Date.now()}-${file.name}`, original_name: file.name, uploaded_by: user.id,
        created_at: new Date().toISOString(), fileDataUrl: dataUrl,
      };
      db.pyqs.push(pyq);
      saveDb(db);
      const out = { ...pyq }; delete out.fileDataUrl;
      return delay(out);
    } catch (err) { return delay(err instanceof Error ? err : new Error('Could not save file — it may be too large for local storage.')); }
  },

  updatePyq: (id, { title, year, subject_id }) => {
    try {
      requireRole('developer');
      const db = loadDb();
      const existing = db.pyqs.find(p => p.id === Number(id));
      if (!existing) return delay(new Error('PYQ not found.'));
      if (title != null) existing.title = title;
      if (year != null) existing.year = year;
      if (subject_id != null) existing.subject_id = Number(subject_id);
      saveDb(db);
      const out = { ...existing }; delete out.fileDataUrl;
      return delay(out);
    } catch (err) { return delay(err); }
  },

  deletePyq: (id) => {
    try {
      requireRole('developer');
      const db = loadDb();
      const existing = db.pyqs.find(p => p.id === Number(id));
      if (!existing) return delay(new Error('PYQ not found.'));
      db.pyqs = db.pyqs.filter(p => p.id !== Number(id));
      saveDb(db);
      return delay({ ok: true });
    } catch (err) { return delay(err); }
  },

  // ---- doubts ----
  doubts: (subjectId) => {
    const db = loadDb();
    let rows = db.doubts.slice();
    if (subjectId) rows = rows.filter(d => d.subject_id === Number(subjectId));
    rows = rows.map(d => {
      const author = db.users.find(u => u.id === d.user_id);
      const reply_count = db.doubt_replies.filter(r => r.doubt_id === d.id).length;
      return { ...d, author_name: author ? author.name : 'Unknown', reply_count };
    });
    rows.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    return delay(rows);
  },

  doubt: (id) => {
    const db = loadDb();
    const d = db.doubts.find(x => x.id === Number(id));
    if (!d) return delay(new Error('Doubt not found.'));
    const author = db.users.find(u => u.id === d.user_id);
    const replies = db.doubt_replies
      .filter(r => r.doubt_id === d.id)
      .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
      .map(r => {
        const ru = db.users.find(u => u.id === r.user_id);
        return { ...r, author_name: ru ? ru.name : 'Unknown', author_role: ru ? ru.role : 'student' };
      });
    return delay({ ...d, author_name: author ? author.name : 'Unknown', replies });
  },

  askDoubt: ({ subject_id, title, body }) => {
    try {
      const user = requireAuth();
      if (!title || !body) return delay(new Error('title and body are required.'));
      const db = loadDb();
      const doubt = { id: nextId(db, 'doubts'), subject_id: subject_id || null, user_id: user.id, title, body, resolved: false, created_at: new Date().toISOString() };
      db.doubts.push(doubt);
      saveDb(db);
      return delay(doubt);
    } catch (err) { return delay(err); }
  },

  replyDoubt: (id, body) => {
    try {
      const user = requireAuth();
      if (!body) return delay(new Error('body is required.'));
      const db = loadDb();
      const doubt = db.doubts.find(d => d.id === Number(id));
      if (!doubt) return delay(new Error('Doubt not found.'));
      const reply = { id: nextId(db, 'doubt_replies'), doubt_id: Number(id), user_id: user.id, body, created_at: new Date().toISOString() };
      db.doubt_replies.push(reply);
      saveDb(db);
      return delay(reply);
    } catch (err) { return delay(err); }
  },

  resolveDoubt: (id) => {
    try {
      const user = requireAuth();
      const db = loadDb();
      const doubt = db.doubts.find(d => d.id === Number(id));
      if (!doubt) return delay(new Error('Doubt not found.'));
      if (doubt.user_id !== user.id && user.role !== 'developer') {
        return delay(new Error('Only the asker or a developer can resolve this.'));
      }
      doubt.resolved = true;
      saveDb(db);
      return delay({ ok: true });
    } catch (err) { return delay(err); }
  },

  // ---- ratings ----
  ratings: (resourceType, resourceId) => {
    const db = loadDb();
    const rows = db.ratings
      .filter(r => r.resource_type === resourceType && r.resource_id === Number(resourceId))
      .map(r => {
        const u = db.users.find(x => x.id === r.user_id);
        return { ...r, author_name: u ? u.name : 'Unknown' };
      })
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    const average = rows.length ? Math.round((rows.reduce((a, r) => a + r.stars, 0) / rows.length) * 100) / 100 : 0;
    return delay({ average, count: rows.length, ratings: rows });
  },

  rate: ({ resource_type, resource_id, stars, comment }) => {
    try {
      const user = requireAuth();
      if (!resource_type || !resource_id || !stars) return delay(new Error('resource_type, resource_id and stars are required.'));
      if (stars < 1 || stars > 5) return delay(new Error('stars must be between 1 and 5.'));
      const db = loadDb();
      const existing = db.ratings.find(r => r.resource_type === resource_type && r.resource_id === Number(resource_id) && r.user_id === user.id);
      if (existing) {
        existing.stars = stars; existing.comment = comment || ''; existing.created_at = new Date().toISOString();
      } else {
        db.ratings.push({ resource_type, resource_id: Number(resource_id), user_id: user.id, stars, comment: comment || '', created_at: new Date().toISOString() });
      }
      saveDb(db);
      return delay({ ok: true });
    } catch (err) { return delay(err); }
  },

  // ---- reports ----
  reports: () => {
    try {
      requireRole('developer');
      const db = loadDb();
      const rows = db.reports
        .map(r => {
          const u = db.users.find(x => x.id === r.reported_by);
          return { ...r, reporter_name: u ? u.name : 'Unknown', reporter_email: u ? u.email : '' };
        })
        .sort((a, b) => (a.status === 'resolved') - (b.status === 'resolved') || new Date(b.created_at) - new Date(a.created_at));
      return delay(rows);
    } catch (err) { return delay(err); }
  },

  submitReport: ({ resource_type, resource_id, description }) => {
    try {
      const user = requireAuth();
      if (!description) return delay(new Error('description is required.'));
      const db = loadDb();
      const report = {
        id: nextId(db, 'reports'), resource_type: resource_type || 'other', resource_id: resource_id || null,
        reported_by: user.id, description, status: 'open', created_at: new Date().toISOString(),
      };
      db.reports.push(report);
      saveDb(db);
      return delay(report);
    } catch (err) { return delay(err); }
  },

  updateReportStatus: (id, status) => {
    try {
      requireRole('developer');
      if (!['open', 'in_progress', 'resolved'].includes(status)) return delay(new Error('status must be open, in_progress, or resolved.'));
      const db = loadDb();
      const report = db.reports.find(r => r.id === Number(id));
      if (!report) return delay(new Error('Report not found.'));
      report.status = status;
      saveDb(db);
      return delay(report);
    } catch (err) { return delay(err); }
  },

  // ---- files ----
  fileUrl: (filename) => {
    const db = loadDb();
    const match = db.notes.find(n => n.filename === filename) || db.pyqs.find(p => p.filename === filename);
    return match ? match.fileDataUrl : '#';
  },
};
