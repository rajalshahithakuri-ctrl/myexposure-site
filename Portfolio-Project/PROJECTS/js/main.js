// main.js — single-page app controller. No framework, just DOM + fetch,
// so the whole thing runs by opening index.html (or any static host) with
// zero build step, as long as the backend API is reachable.

let state = {
  user: JSON.parse(localStorage.getItem('sp_user') || 'null'),
  currentSemester: null,
  currentSubject: null,
  resourceTab: 'notes', // notes | pyqs | doubts
};

// ---------- Toasts ----------
function toast(message, type = '') {
  const wrap = document.getElementById('toastWrap');
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = message;
  wrap.appendChild(el);
  setTimeout(() => el.remove(), 3500);
}

// ---------- View switching ----------
function showView(name) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  const view = document.getElementById(`view-${name}`);
  if (view) view.classList.add('active');
  document.querySelectorAll('.nav-link').forEach(b => b.classList.toggle('active', b.dataset.view === name));
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function go(name) {
  if ((name === 'developer') && !(state.user && state.user.role === 'developer')) {
    toast('This area is for developer accounts only.', 'error');
    showView('home');
    return;
  }
  showView(name);
  if (name === 'home') loadSemesters();
  if (name === 'doubts') loadAllDoubts();
  if (name === 'developer') loadDeveloperPanel();
}

// ---------- Auth ----------
function renderAuthArea() {
  const area = document.getElementById('headerAuthArea');
  if (state.user) {
    area.innerHTML = `
      <div class="user-chip">
        <span>${escapeHtml(state.user.name)}</span>
        <span class="role-badge">${state.user.role}</span>
      </div>
      <button class="btn btn-outline btn-sm" id="logoutBtn">Log out</button>
    `;
    document.getElementById('logoutBtn').onclick = logout;
  } else {
    area.innerHTML = `
      <button class="btn btn-outline btn-sm" id="loginBtn">Log in</button>
      <button class="btn btn-primary btn-sm" id="registerBtn">Sign up</button>
    `;
    document.getElementById('loginBtn').onclick = () => openModal('login');
    document.getElementById('registerBtn').onclick = () => openModal('register');
  }
  document.getElementById('devNavLink').style.display = state.user && state.user.role === 'developer' ? 'inline-block' : 'none';
}

function logout() {
  localStorage.removeItem('sp_token');
  localStorage.removeItem('sp_user');
  state.user = null;
  renderAuthArea();
  toast('Logged out.');
  go('home');
}

function openModal(kind) {
  const backdrop = document.getElementById('modalBackdrop');
  const box = document.getElementById('modalBox');
  if (kind === 'login') {
    box.innerHTML = `
      <button class="modal-close" onclick="closeModal()">&times;</button>
      <h3>Log in</h3>
      <form class="stacked" id="loginForm">
        <label>Email</label>
        <input type="email" name="email" required />
        <label>Password</label>
        <input type="password" name="password" required />
        <button class="btn btn-primary" type="submit">Log in</button>
        <p style="font-size:.85rem;color:var(--muted)">No account? <a href="#" onclick="openModal('register');return false;">Sign up</a></p>
      </form>
    `;
    document.getElementById('loginForm').onsubmit = handleLogin;
  } else {
    box.innerHTML = `
      <button class="modal-close" onclick="closeModal()">&times;</button>
      <h3>Create account</h3>
      <form class="stacked" id="registerForm">
        <label>Full name</label>
        <input type="text" name="name" required />
        <label>Email</label>
        <input type="email" name="email" required />
        <label>Password (min 6 characters)</label>
        <input type="password" name="password" minlength="6" required />
        <label>Developer signup code (optional — leave blank for a student account)</label>
        <input type="text" name="devCode" placeholder="Only for content maintainers" />
        <button class="btn btn-primary" type="submit">Create account</button>
        <p style="font-size:.85rem;color:var(--muted)">Already have an account? <a href="#" onclick="openModal('login');return false;">Log in</a></p>
      </form>
    `;
    document.getElementById('registerForm').onsubmit = handleRegister;
  }
  backdrop.style.display = 'flex';
}
function closeModal() { document.getElementById('modalBackdrop').style.display = 'none'; }

async function handleLogin(e) {
  e.preventDefault();
  const f = new FormData(e.target);
  try {
    const { token, user } = await api.login({ email: f.get('email'), password: f.get('password') });
    localStorage.setItem('sp_token', token);
    localStorage.setItem('sp_user', JSON.stringify(user));
    state.user = user;
    closeModal();
    renderAuthArea();
    toast(`Welcome back, ${user.name}!`, 'success');
  } catch (err) { toast(err.message, 'error'); }
}

async function handleRegister(e) {
  e.preventDefault();
  const f = new FormData(e.target);
  try {
    const { token, user } = await api.register({
      name: f.get('name'), email: f.get('email'), password: f.get('password'),
      devCode: f.get('devCode') || undefined,
    });
    localStorage.setItem('sp_token', token);
    localStorage.setItem('sp_user', JSON.stringify(user));
    state.user = user;
    closeModal();
    renderAuthArea();
    toast(`Account created. Welcome, ${user.name}!`, 'success');
  } catch (err) { toast(err.message, 'error'); }
}

function requireLogin() {
  if (!state.user) { toast('Please log in first.', 'error'); openModal('login'); return false; }
  return true;
}

// ---------- Home: semesters ----------
async function loadSemesters() {
  const grid = document.getElementById('semesterGrid');
  grid.innerHTML = '<p class="empty-state">Loading semesters…</p>';
  try {
    const semesters = await api.semesters();
    grid.className = 'grid grid-4';
    grid.innerHTML = semesters.map(s => `
      <div class="card sem-card" onclick="openSemester(${s.semester})">
        <div class="sem-num">${s.semester}</div>
        <div class="sem-label">Semester ${s.semester} · ${s.subject_count} subject${s.subject_count === 1 ? '' : 's'}</div>
      </div>
    `).join('');
  } catch (err) {
    grid.innerHTML = `<p class="empty-state">Could not load semesters: ${escapeHtml(err.message)}</p>`;
  }
}

async function openSemester(sem) {
  state.currentSemester = sem;
  showView('subjects');
  document.getElementById('subjectsSemTitle').textContent = `Semester ${sem} — Subjects`;
  const list = document.getElementById('subjectList');
  list.innerHTML = '<p class="empty-state">Loading subjects…</p>';
  try {
    const subjects = await api.subjects(sem);
    if (!subjects.length) { list.innerHTML = '<p class="empty-state">No subjects added for this semester yet.</p>'; return; }
    list.innerHTML = subjects.map(s => `
      <div class="card subject-row">
        <div><span class="name">${escapeHtml(s.name)}</span>${s.code ? `<span class="code">${escapeHtml(s.code)}</span>` : ''}</div>
        <button class="btn btn-ghost btn-sm" onclick="openSubject(${s.id}, '${escapeAttr(s.name)}')">Open →</button>
      </div>
    `).join('');
  } catch (err) {
    list.innerHTML = `<p class="empty-state">Could not load subjects: ${escapeHtml(err.message)}</p>`;
  }
}

// ---------- Subject detail: notes / pyqs / doubts tabs ----------
function openSubject(id, name) {
  state.currentSubject = { id, name };
  showView('subject');
  document.getElementById('subjectTitle').textContent = name;
  setResourceTab('notes');
}

function setResourceTab(tab) {
  state.resourceTab = tab;
  document.querySelectorAll('#subjectTabs button').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  if (tab === 'notes') loadResourceList('note');
  if (tab === 'pyqs') loadResourceList('pyq');
  if (tab === 'doubts') loadSubjectDoubts();
}

async function loadResourceList(type) {
  const wrap = document.getElementById('subjectContent');
  wrap.innerHTML = '<p class="empty-state">Loading…</p>';
  try {
    const items = type === 'note'
      ? await api.notes(state.currentSubject.id)
      : await api.pyqs(state.currentSubject.id);

    if (!items.length) {
      wrap.innerHTML = `<div class="empty-state">No ${type === 'note' ? 'notes' : 'past year questions'} uploaded yet for this subject.
        ${state.user && state.user.role === 'developer' ? `<br/><br/><button class="btn btn-primary btn-sm" onclick="go('developer')">Upload from Developer Panel</button>` : ''}
      </div>`;
      return;
    }

    wrap.className = 'grid grid-3';
    wrap.innerHTML = items.map(it => resourceCardHtml(type, it)).join('');
  } catch (err) {
    wrap.innerHTML = `<p class="empty-state">Could not load: ${escapeHtml(err.message)}</p>`;
  }
}

function resourceCardHtml(type, it) {
  const label = type === 'note' ? 'Notes' : `PYQ${it.year ? ' · ' + escapeHtml(it.year) : ''}`;
  const rating = it.avg_rating ? `<span class="stars">★ ${it.avg_rating}</span> <span style="color:var(--muted);font-size:.8rem">(${it.rating_count})</span>` : `<span style="color:var(--muted);font-size:.8rem">No ratings yet</span>`;
  return `
    <div class="card resource-card">
      <div class="meta">${label} · uploaded by ${escapeHtml(it.uploader_name || 'developer')}</div>
      <div class="title">${escapeHtml(it.title)}</div>
      ${it.description ? `<div class="desc">${escapeHtml(it.description)}</div>` : ''}
      <div>${rating}</div>
      <div class="resource-actions">
        <a class="btn btn-primary btn-sm" href="${api.fileUrl(it.filename)}" target="_blank" rel="noopener">View PDF</a>
        <button class="btn btn-ghost btn-sm" onclick="openRateModal('${type}', ${it.id}, '${escapeAttr(it.title)}')">Rate</button>
        <button class="btn btn-ghost btn-sm" onclick="openReportModal('${type}', ${it.id}, '${escapeAttr(it.title)}')">Report issue</button>
      </div>
    </div>
  `;
}

// ---------- Ratings ----------
function openRateModal(type, id, title) {
  if (!requireLogin()) return;
  const backdrop = document.getElementById('modalBackdrop');
  const box = document.getElementById('modalBox');
  box.innerHTML = `
    <button class="modal-close" onclick="closeModal()">&times;</button>
    <h3>Rate: ${escapeHtml(title)}</h3>
    <form class="stacked" id="rateForm">
      <label>Stars (1–5)</label>
      <select name="stars" required>
        <option value="5">★★★★★ Excellent</option>
        <option value="4">★★★★ Good</option>
        <option value="3">★★★ Okay</option>
        <option value="2">★★ Weak</option>
        <option value="1">★ Poor</option>
      </select>
      <label>Comment (optional)</label>
      <textarea name="comment" rows="3"></textarea>
      <button class="btn btn-primary" type="submit">Submit rating</button>
    </form>
  `;
  document.getElementById('rateForm').onsubmit = async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    try {
      await api.rate({ resource_type: type, resource_id: id, stars: Number(f.get('stars')), comment: f.get('comment') });
      toast('Thanks for rating!', 'success');
      closeModal();
      loadResourceList(type);
    } catch (err) { toast(err.message, 'error'); }
  };
  backdrop.style.display = 'flex';
}

// ---------- Reports (error-fix room) ----------
function openReportModal(type, id, title) {
  if (!requireLogin()) return;
  const backdrop = document.getElementById('modalBackdrop');
  const box = document.getElementById('modalBox');
  box.innerHTML = `
    <button class="modal-close" onclick="closeModal()">&times;</button>
    <h3>Report an issue</h3>
    <p style="font-size:.85rem;color:var(--muted)">Flag "${escapeHtml(title)}" for a developer to review — wrong file, wrong subject, broken link, typo, etc.</p>
    <form class="stacked" id="reportForm">
      <label>What's wrong?</label>
      <textarea name="description" rows="4" required placeholder="Describe the issue…"></textarea>
      <button class="btn btn-primary" type="submit">Submit report</button>
    </form>
  `;
  document.getElementById('reportForm').onsubmit = async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    try {
      await api.submitReport({ resource_type: type, resource_id: id, description: f.get('description') });
      toast('Report sent to the developer team.', 'success');
      closeModal();
    } catch (err) { toast(err.message, 'error'); }
  };
  backdrop.style.display = 'flex';
}

// ---------- Doubts (subject-scoped) ----------
async function loadSubjectDoubts() {
  const wrap = document.getElementById('subjectContent');
  wrap.className = '';
  wrap.innerHTML = `
    <div class="section-heading">
      <div></div>
      <button class="btn btn-primary btn-sm" onclick="openAskDoubtModal(${state.currentSubject.id})">Ask a doubt</button>
    </div>
    <div id="subjectDoubtsList" class="card"><p class="empty-state">Loading…</p></div>
  `;
  try {
    const doubts = await api.doubts(state.currentSubject.id);
    renderDoubtsList(doubts, 'subjectDoubtsList');
  } catch (err) {
    document.getElementById('subjectDoubtsList').innerHTML = `<p class="empty-state">${escapeHtml(err.message)}</p>`;
  }
}

function renderDoubtsList(doubts, targetId) {
  const el = document.getElementById(targetId);
  if (!doubts.length) { el.innerHTML = '<p class="empty-state">No doubts posted yet. Be the first to ask!</p>'; return; }
  el.innerHTML = doubts.map(d => `
    <div class="doubt-item">
      <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;">
        <a href="#" onclick="openDoubtThread(${d.id});return false;" style="font-weight:700;">${escapeHtml(d.title)}</a>
        <span class="badge ${d.resolved ? 'badge-resolved' : 'badge-open'}">${d.resolved ? 'Resolved' : 'Open'}</span>
      </div>
      <div style="font-size:.83rem;color:var(--muted);margin-top:4px;">by ${escapeHtml(d.author_name)} · ${d.reply_count} repl${d.reply_count === 1 ? 'y' : 'ies'}</div>
    </div>
  `).join('');
}

async function loadAllDoubts() {
  const el = document.getElementById('allDoubtsList');
  el.innerHTML = '<p class="empty-state">Loading…</p>';
  try {
    const doubts = await api.doubts();
    renderDoubtsList(doubts, 'allDoubtsList');
  } catch (err) { el.innerHTML = `<p class="empty-state">${escapeHtml(err.message)}</p>`; }
}

function openAskDoubtModal(subjectId) {
  if (!requireLogin()) return;
  const backdrop = document.getElementById('modalBackdrop');
  const box = document.getElementById('modalBox');
  box.innerHTML = `
    <button class="modal-close" onclick="closeModal()">&times;</button>
    <h3>Ask a doubt</h3>
    <form class="stacked" id="askForm">
      <label>Title</label>
      <input type="text" name="title" required />
      <label>Describe your doubt</label>
      <textarea name="body" rows="4" required></textarea>
      <button class="btn btn-primary" type="submit">Post doubt</button>
    </form>
  `;
  document.getElementById('askForm').onsubmit = async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    try {
      await api.askDoubt({ subject_id: subjectId || null, title: f.get('title'), body: f.get('body') });
      toast('Doubt posted!', 'success');
      closeModal();
      if (subjectId) loadSubjectDoubts(); else loadAllDoubts();
    } catch (err) { toast(err.message, 'error'); }
  };
  backdrop.style.display = 'flex';
}

async function openDoubtThread(id) {
  showView('doubtThread');
  const el = document.getElementById('doubtThreadContent');
  el.innerHTML = '<p class="empty-state">Loading…</p>';
  try {
    const d = await api.doubt(id);
    el.innerHTML = `
      <div class="card" style="margin-bottom:16px;">
        <div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px;">
          <h2 style="margin:0;">${escapeHtml(d.title)}</h2>
          <span class="badge ${d.resolved ? 'badge-resolved' : 'badge-open'}">${d.resolved ? 'Resolved' : 'Open'}</span>
        </div>
        <p style="color:var(--muted);font-size:.85rem;">Asked by ${escapeHtml(d.author_name)}</p>
        <p>${escapeHtml(d.body)}</p>
        ${(state.user && (state.user.id === d.user_id || state.user.role === 'developer') && !d.resolved) ?
          `<button class="btn btn-ghost btn-sm" onclick="resolveDoubt(${d.id})">Mark as resolved</button>` : ''}
      </div>
      <h3>Replies (${d.replies.length})</h3>
      <div class="card" style="margin-bottom:16px;">
        ${d.replies.length ? d.replies.map(r => `
          <div class="doubt-item">
            <div style="font-size:.85rem;color:var(--muted);">${escapeHtml(r.author_name)} ${r.author_role === 'developer' ? '<span class="role-badge" style="background:var(--success)">DEV</span>' : ''}</div>
            <div>${escapeHtml(r.body)}</div>
          </div>
        `).join('') : '<p class="empty-state">No replies yet.</p>'}
      </div>
      <form class="stacked" id="replyForm">
        <label>Add a reply</label>
        <textarea name="body" rows="3" required></textarea>
        <button class="btn btn-primary" type="submit">Post reply</button>
      </form>
    `;
    document.getElementById('replyForm').onsubmit = async (e) => {
      e.preventDefault();
      if (!requireLogin()) return;
      const f = new FormData(e.target);
      try {
        await api.replyDoubt(id, f.get('body'));
        toast('Reply posted.', 'success');
        openDoubtThread(id);
      } catch (err) { toast(err.message, 'error'); }
    };
  } catch (err) {
    el.innerHTML = `<p class="empty-state">${escapeHtml(err.message)}</p>`;
  }
}

async function resolveDoubt(id) {
  try {
    await api.resolveDoubt(id);
    toast('Marked as resolved.', 'success');
    openDoubtThread(id);
  } catch (err) { toast(err.message, 'error'); }
}

// ---------- Developer panel ----------
async function loadDeveloperPanel() {
  await populateDevSubjectSelects();
  setDevTab('upload');
}

function setDevTab(tab) {
  document.querySelectorAll('#devTabs button').forEach(b => b.classList.toggle('active', b.dataset.devtab === tab));
  document.querySelectorAll('.dev-panel').forEach(p => p.style.display = 'none');
  document.getElementById(`devPanel-${tab}`).style.display = 'block';
  if (tab === 'manage') loadDevManageLists();
  if (tab === 'reports') loadDevReports();
  if (tab === 'subjects') loadDevSubjects();
}

async function populateDevSubjectSelects() {
  try {
    const subjects = await api.subjects();
    const options = subjects.map(s => `<option value="${s.id}">Sem ${s.semester} — ${escapeHtml(s.name)}</option>`).join('');
    ['noteSubjectSelect', 'pyqSubjectSelect'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.innerHTML = options;
    });
  } catch (err) { toast(err.message, 'error'); }
}

// Upload note
document.addEventListener('DOMContentLoaded', () => {
  const noteForm = document.getElementById('uploadNoteForm');
  if (noteForm) {
    noteForm.onsubmit = async (e) => {
      e.preventDefault();
      const fd = new FormData(noteForm);
      try {
        await api.uploadNote(fd);
        toast('Note uploaded.', 'success');
        noteForm.reset();
      } catch (err) { toast(err.message, 'error'); }
    };
  }
  const pyqForm = document.getElementById('uploadPyqForm');
  if (pyqForm) {
    pyqForm.onsubmit = async (e) => {
      e.preventDefault();
      const fd = new FormData(pyqForm);
      try {
        await api.uploadPyq(fd);
        toast('PYQ uploaded.', 'success');
        pyqForm.reset();
      } catch (err) { toast(err.message, 'error'); }
    };
  }
  const subjectForm = document.getElementById('addSubjectForm');
  if (subjectForm) {
    subjectForm.onsubmit = async (e) => {
      e.preventDefault();
      const fd = new FormData(subjectForm);
      try {
        await api.createSubject({ semester: Number(fd.get('semester')), name: fd.get('name'), code: fd.get('code') });
        toast('Subject added.', 'success');
        subjectForm.reset();
        populateDevSubjectSelects();
        loadDevSubjects();
      } catch (err) { toast(err.message, 'error'); }
    };
  }
});

async function loadDevManageLists() {
  const notesEl = document.getElementById('devNotesList');
  const pyqsEl = document.getElementById('devPyqsList');
  notesEl.innerHTML = '<p class="empty-state">Loading…</p>';
  pyqsEl.innerHTML = '<p class="empty-state">Loading…</p>';
  try {
    const [notes, pyqs] = await Promise.all([api.notes(), api.pyqs()]);
    notesEl.innerHTML = notes.length ? notes.map(n => devResourceRow('note', n)).join('') : '<p class="empty-state">No notes yet.</p>';
    pyqsEl.innerHTML = pyqs.length ? pyqs.map(p => devResourceRow('pyq', p)).join('') : '<p class="empty-state">No PYQs yet.</p>';
  } catch (err) { toast(err.message, 'error'); }
}

function devResourceRow(type, it) {
  return `
    <div class="subject-row" style="border-bottom:1px solid var(--border);padding:10px 0;">
      <div><strong>${escapeHtml(it.title)}</strong><div style="font-size:.8rem;color:var(--muted)">${escapeHtml(it.original_name)}</div></div>
      <div style="display:flex;gap:6px;">
        <a class="btn btn-ghost btn-sm" href="${api.fileUrl(it.filename)}" target="_blank">View</a>
        <button class="btn btn-danger btn-sm" onclick="deleteResource('${type}', ${it.id})">Delete</button>
      </div>
    </div>
  `;
}

async function deleteResource(type, id) {
  if (!confirm('Delete this file permanently?')) return;
  try {
    if (type === 'note') await api.deleteNote(id); else await api.deletePyq(id);
    toast('Deleted.', 'success');
    loadDevManageLists();
  } catch (err) { toast(err.message, 'error'); }
}

async function loadDevSubjects() {
  const el = document.getElementById('devSubjectsList');
  el.innerHTML = '<p class="empty-state">Loading…</p>';
  try {
    const subjects = await api.subjects();
    el.innerHTML = subjects.map(s => `
      <div class="subject-row" style="border-bottom:1px solid var(--border);padding:10px 0;">
        <div><strong>Sem ${s.semester}</strong> — ${escapeHtml(s.name)} ${s.code ? `<span class="code">${escapeHtml(s.code)}</span>` : ''}</div>
        <div style="display:flex;gap:6px;">
          <button class="btn btn-ghost btn-sm" onclick="renameSubject(${s.id}, '${escapeAttr(s.name)}')">Rename</button>
          <button class="btn btn-danger btn-sm" onclick="removeSubject(${s.id})">Delete</button>
        </div>
      </div>
    `).join('');
  } catch (err) { toast(err.message, 'error'); }
}

async function renameSubject(id, currentName) {
  const name = prompt('New subject name:', currentName);
  if (!name) return;
  try {
    await api.updateSubject(id, { name });
    toast('Subject updated.', 'success');
    loadDevSubjects();
    populateDevSubjectSelects();
  } catch (err) { toast(err.message, 'error'); }
}

async function removeSubject(id) {
  if (!confirm('Delete this subject and all its notes/PYQs?')) return;
  try {
    await api.deleteSubject(id);
    toast('Subject deleted.', 'success');
    loadDevSubjects();
    populateDevSubjectSelects();
  } catch (err) { toast(err.message, 'error'); }
}

// ---------- Developer: error reports (the "fix errors" room) ----------
async function loadDevReports() {
  const el = document.getElementById('devReportsList');
  el.innerHTML = '<p class="empty-state">Loading…</p>';
  try {
    const reports = await api.reports();
    if (!reports.length) { el.innerHTML = '<p class="empty-state">No reports. Nice and tidy!</p>'; return; }
    el.innerHTML = reports.map(r => `
      <div class="card" style="margin-bottom:10px;">
        <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;">
          <div>
            <span class="badge badge-${r.status === 'open' ? 'open' : r.status === 'resolved' ? 'resolved' : 'progress'}">${r.status.replace('_',' ')}</span>
            <span style="font-size:.8rem;color:var(--muted);margin-left:8px;">${escapeHtml(r.resource_type)} #${r.resource_id ?? '-'} · reported by ${escapeHtml(r.reporter_name)}</span>
          </div>
          <select class="status-select" onchange="changeReportStatus(${r.id}, this.value)">
            <option value="open" ${r.status === 'open' ? 'selected' : ''}>Open</option>
            <option value="in_progress" ${r.status === 'in_progress' ? 'selected' : ''}>In progress</option>
            <option value="resolved" ${r.status === 'resolved' ? 'selected' : ''}>Resolved</option>
          </select>
        </div>
        <p style="margin:10px 0 0;">${escapeHtml(r.description)}</p>
      </div>
    `).join('');
  } catch (err) { toast(err.message, 'error'); }
}

async function changeReportStatus(id, status) {
  try {
    await api.updateReportStatus(id, status);
    toast('Status updated.', 'success');
    loadDevReports();
  } catch (err) { toast(err.message, 'error'); }
}

// ---------- Utilities ----------
function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str).replace(/[&<>"']/g, (m) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[m]));
}
function escapeAttr(str) { return escapeHtml(str).replace(/'/g, "\\'"); }

// ---------- Init ----------
document.addEventListener('DOMContentLoaded', () => {
  renderAuthArea();
  go('home');
});
