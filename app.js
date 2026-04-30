// -------------------- Helpers --------------------
function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, function(c) {
    return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
  });
}
function pad2(n) { return String(n).padStart(2, '0'); }
function clamp(n, min, max) { return Math.min(max, Math.max(min, n)); }
function normalizeNewlines(text) { return String(text ?? '').replace(/\r\n?/g, '\n'); }

// -------------------- Theme (system/dark/light) --------------------
const LS_THEME = 'mdnotes_theme';
const themeSelect = document.getElementById('themeSelect');
let systemMql = null;
let systemListener = null;

function resolveSystemTheme() {
  return (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light';
}
function detachSystemListener() {
  if (systemMql && systemListener) {
    try { systemMql.removeEventListener('change', systemListener); }
    catch (e) { try { systemMql.removeListener(systemListener); } catch (e2) {} }
  }
  systemMql = null;
  systemListener = null;
}
function attachSystemListener() {
  detachSystemListener();
  if (!window.matchMedia) return;
  systemMql = window.matchMedia('(prefers-color-scheme: dark)');
  systemListener = function() { document.body.dataset.theme = resolveSystemTheme(); };
  try { systemMql.addEventListener('change', systemListener); }
  catch (e) { try { systemMql.addListener(systemListener); } catch (e2) {} }
}
function applyThemePref(pref) {
  const p = (pref === 'light' || pref === 'dark' || pref === 'system') ? pref : 'system';
  localStorage.setItem(LS_THEME, p);
  if (themeSelect) themeSelect.value = p;
  if (p === 'system') {
    document.body.dataset.theme = resolveSystemTheme();
    attachSystemListener();
  } else {
    detachSystemListener();
    document.body.dataset.theme = p;
  }
}
function loadTheme() {
  applyThemePref(localStorage.getItem(LS_THEME) || 'system');
}

// -------------------- Settings menu --------------------
const settingsBtn = document.getElementById('btnSettings');
const settingsPanel = document.getElementById('settingsPanel');
function closeSettings() { settingsPanel.classList.remove('open'); }
function toggleSettings() { settingsPanel.classList.toggle('open'); }
settingsBtn.addEventListener('click', function(e) { e.stopPropagation(); toggleSettings(); });
settingsPanel.addEventListener('click', function(e) { e.stopPropagation(); });
window.addEventListener('click', function() { closeSettings(); });
window.addEventListener('keydown', function(e) { if (e.key === 'Escape') closeSettings(); });
if (themeSelect) themeSelect.addEventListener('change', function() { applyThemePref(themeSelect.value); });

// -------------------- Today panel (local date) --------------------
const elDoy = document.getElementById('doy');
const elIsoWeek = document.getElementById('isoweek');
const elOnThisDay = document.getElementById('onThisDay');
const btnOnThisDay = document.getElementById('btnOnThisDay');
let cachedOnThisDay = { key: null, events: [] };

function dayOfYearLocal(d) {
  const start = new Date(d.getFullYear(), 0, 0);
  const diff = d - start;
  return Math.floor(diff / 86400000);
}
function isoWeekLocal(d) {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
  return { year: date.getUTCFullYear(), week: weekNo };
}
function wikiTitleToUrl(title) {
  return 'https://en.wikipedia.org/wiki/' + encodeURIComponent(String(title || '').replace(/ /g, '_'));
}
function pickRandomEvent() {
  const arr = cachedOnThisDay.events || [];
  if (!arr.length) {
    elOnThisDay.textContent = 'No “On this day” data available.';
    return;
  }
  const e = arr[Math.floor(Math.random() * arr.length)];
  const year = e.year ? String(e.year) : '';
  const text = e.text || '';
  let url = null;
  let label = null;
  try {
    const p = (e.pages && e.pages[0]) ? e.pages[0] : null;
    if (p) {
      url = p.content_urls && p.content_urls.desktop && p.content_urls.desktop.page ? p.content_urls.desktop.page : null;
      label = p.title || null;
      if (!url && p.title) url = wikiTitleToUrl(p.title);
    }
  } catch (err) {}
  if (url) {
    const safeLabel = escapeHtml(label || 'Wikipedia');
    elOnThisDay.innerHTML = '<b>' + escapeHtml(year) + '</b> — ' + escapeHtml(text)
      + ' <span class="hint">·</span> <a href="' + url + '" target="_blank" rel="noopener">' + safeLabel + '</a>';
  } else {
    elOnThisDay.innerHTML = '<b>' + escapeHtml(year) + '</b> — ' + escapeHtml(text);
  }
}
async function loadOnThisDay(forceFetch) {
  const now = new Date();
  const mm = pad2(now.getMonth() + 1);
  const dd = pad2(now.getDate());
  const key = mm + '-' + dd;
  elDoy.textContent = String(dayOfYearLocal(now));
  const iso = isoWeekLocal(now);
  elIsoWeek.textContent = iso.year + '-W' + String(iso.week).padStart(2, '0');
  if (!forceFetch && cachedOnThisDay.key === key && cachedOnThisDay.events.length) {
    pickRandomEvent();
    return;
  }
  elOnThisDay.textContent = 'Loading “On this day”…';
  const url = 'https://api.wikimedia.org/feed/v1/wikipedia/en/onthisday/events/' + mm + '/' + dd;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    const events = Array.isArray(data && data.events) ? data.events : [];
    cachedOnThisDay = { key: key, events: events };
    pickRandomEvent();
  } catch (e) {
    elOnThisDay.textContent = 'Could not load “On this day” (offline or blocked).';
  }
}
function scheduleNextMidnightRefresh() {
  const now = new Date();
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 2);
  const ms = Math.max(1000, next - now);
  setTimeout(function() { loadOnThisDay(true); scheduleNextMidnightRefresh(); }, ms);
}
btnOnThisDay.addEventListener('click', function() {
  if (cachedOnThisDay.events && cachedOnThisDay.events.length) pickRandomEvent();
  else loadOnThisDay(true);
});

// -------------------- Editor --------------------
let toastEditor = null;
let suppressEditorChange = false;

function initEditor() {
  const Editor = window.toastui && window.toastui.Editor;
  if (!Editor) {
    throw new Error('TOAST UI Editor failed to load.');
  }
  toastEditor = new Editor({
    el: document.querySelector('#editorHost'),
    height: '100%',
    initialEditType: 'wysiwyg',
    usageStatistics: false,
    hideModeSwitch: false,
    initialValue: ''
  });
  if (typeof toastEditor.on === 'function') {
    toastEditor.on('change', function() {
      if (!suppressEditorChange) markDirty(true);
    });
  }
}
function getEditorText() {
  return toastEditor ? normalizeNewlines(toastEditor.getMarkdown()) : '';
}
function setEditorText(text) {
  if (!toastEditor) return;
  suppressEditorChange = true;
  toastEditor.setMarkdown(normalizeNewlines(text || ''));
  suppressEditorChange = false;
}
function focusEditor() {
  try { if (toastEditor && typeof toastEditor.focus === 'function') toastEditor.focus(); } catch (e) {}
}

// -------------------- Notes vault (File System Access API) --------------------
const DB_NAME = 'mdnotes-db';
const DB_STORE = 'handles';
const HANDLE_KEY = 'vaultDirHandle';
const LS_FLAG = 'mdnotes_hasVault';
let dirHandle = null;
let currentFileHandle = null;
let currentName = null;
let dirty = false;

const elFileList = document.getElementById('filelist');
const elFolderBadge = document.getElementById('folderBadge');
const elCountBadge = document.getElementById('countBadge');
const elDirtyHint = document.getElementById('dirtyHint');
const elStatus = document.getElementById('statusText');
const btnPick = document.getElementById('btnPick');
const btnForget = document.getElementById('btnForget');
const btnNew = document.getElementById('btnNew');
const btnSave = document.getElementById('btnSave');
const btnRename = document.getElementById('btnRename');
const btnDelete = document.getElementById('btnDelete');
const sortMode = document.getElementById('sortMode');
const autosaveSecInput = document.getElementById('autosaveSec');
const btnAutosaveApply = document.getElementById('btnAutosaveApply');
const btnAutosaveReset = document.getElementById('btnAutosaveReset');

const LS_AUTOSAVE_SEC = 'mdnotes_autosave_sec';
const AUTOSAVE_DEFAULT = 10;
const AUTOSAVE_MIN = 5;
const AUTOSAVE_MAX = 300;
let autosaveTimer = null;
let autosaveSec = AUTOSAVE_DEFAULT;

function setStatus(msg) { elStatus.textContent = msg; }
function setRememberInfo(msg) { document.getElementById('rememberInfo').textContent = msg; }
function supportsFSA() {
  return ('showDirectoryPicker' in window) && ('FileSystemFileHandle' in window);
}
function markDirty(state) {
  dirty = !!state;
  elDirtyHint.style.display = 'inline';
  elDirtyHint.textContent = dirty ? '● unsaved' : '● saved';
  elDirtyHint.style.color = dirty ? 'var(--danger)' : 'var(--ok)';
}
function openDB() {
  return new Promise(function(resolve, reject) {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = function() {
      const db = req.result;
      if (!db.objectStoreNames.contains(DB_STORE)) db.createObjectStore(DB_STORE);
    };
    req.onsuccess = function() { resolve(req.result); };
    req.onerror = function() { reject(req.error); };
  });
}
async function idbSet(key, value) {
  const db = await openDB();
  return new Promise(function(resolve, reject) {
    const tx = db.transaction(DB_STORE, 'readwrite');
    tx.objectStore(DB_STORE).put(value, key);
    tx.oncomplete = function() { db.close(); resolve(true); };
    tx.onerror = function() { db.close(); reject(tx.error); };
  });
}
async function idbGet(key) {
  const db = await openDB();
  return new Promise(function(resolve, reject) {
    const tx = db.transaction(DB_STORE, 'readonly');
    const req = tx.objectStore(DB_STORE).get(key);
    req.onsuccess = function() { db.close(); resolve(req.result); };
    req.onerror = function() { db.close(); reject(req.error); };
  });
}
async function idbDel(key) {
  const db = await openDB();
  return new Promise(function(resolve, reject) {
    const tx = db.transaction(DB_STORE, 'readwrite');
    tx.objectStore(DB_STORE).delete(key);
    tx.oncomplete = function() { db.close(); resolve(true); };
    tx.onerror = function() { db.close(); reject(tx.error); };
  });
}
async function ensurePermission(handle, mode) {
  const opts = { mode: mode || 'readwrite' };
  if ((await handle.queryPermission(opts)) === 'granted') return true;
  if ((await handle.requestPermission(opts)) === 'granted') return true;
  return false;
}
async function rememberFolder(handle) {
  try {
    await idbSet(HANDLE_KEY, handle);
    localStorage.setItem(LS_FLAG, '1');
    setRememberInfo('Remembering: yes');
  } catch (e) {
    localStorage.removeItem(LS_FLAG);
    setRememberInfo('Remembering: failed');
  }
}
async function forgetFolder() {
  try { await idbDel(HANDLE_KEY); } catch (e) {}
  localStorage.removeItem(LS_FLAG);
  setRememberInfo('Remembering: (none)');
  dirHandle = null;
  currentFileHandle = null;
  currentName = null;
  elFolderBadge.textContent = 'No folder selected';
  elFileList.innerHTML = '';
  elCountBadge.textContent = '0 notes';
  setEditorText('');
  markDirty(false);
  setStatus('Forgot folder. Use Settings → Pick Notes Folder.');
}
function loadAutosave() {
  const raw = localStorage.getItem(LS_AUTOSAVE_SEC);
  const n = raw ? parseInt(raw, 10) : AUTOSAVE_DEFAULT;
  autosaveSec = clamp(Number.isFinite(n) ? n : AUTOSAVE_DEFAULT, AUTOSAVE_MIN, AUTOSAVE_MAX);
  autosaveSecInput.value = String(autosaveSec);
}
function startAutosave() {
  if (autosaveTimer) clearInterval(autosaveTimer);
  autosaveTimer = setInterval(async function() {
    if (!dirty) return;
    if (!dirHandle || !currentFileHandle) return;
    try {
      const ok = await ensurePermission(currentFileHandle, 'readwrite');
      if (!ok) return;
      const content = getEditorText();
      const writable = await currentFileHandle.createWritable();
      await writable.write(content);
      await writable.close();
      markDirty(false);
      setStatus('Auto-saved ' + currentName + ' (' + new Date().toLocaleTimeString() + ')');
      await refreshList();
    } catch (e) {}
  }, autosaveSec * 1000);
}
async function pickFolder() {
  if (!supportsFSA()) {
    alert('Use Chrome or Edge (File System Access API required).');
    return;
  }
  closeSettings();
  dirHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
  const ok = await ensurePermission(dirHandle, 'readwrite');
  if (!ok) { setStatus('Permission denied for folder.'); return; }
  await rememberFolder(dirHandle);
  elFolderBadge.textContent = 'Folder selected';
  setStatus('Folder ready.');
  await refreshList();
}
async function tryRestoreFolder() {
  if (!supportsFSA()) return false;
  if (localStorage.getItem(LS_FLAG) !== '1') return false;
  try {
    const handle = await idbGet(HANDLE_KEY);
    if (!handle) { localStorage.removeItem(LS_FLAG); return false; }
    const ok = await ensurePermission(handle, 'readwrite');
    if (!ok) { setRememberInfo('Remembering: yes (permission needed)'); return false; }
    dirHandle = handle;
    elFolderBadge.textContent = 'Folder selected';
    setRememberInfo('Remembering: yes');
    await refreshList();
    setStatus('Re-opened previous folder.');
    return true;
  } catch (e) {
    localStorage.removeItem(LS_FLAG);
    return false;
  }
}
async function listMdFiles() {
  const out = [];
  for await (const entry of dirHandle.values()) {
    if (entry.kind === 'file' && entry.name.toLowerCase().endsWith('.md')) out.push(entry);
  }
  return out;
}
async function refreshList() {
  if (!dirHandle) {
    elFileList.innerHTML = '';
    elCountBadge.textContent = '0 notes';
    return;
  }
  const files = await listMdFiles();
  const metas = [];
  for (const fh of files) {
    const f = await fh.getFile();
    metas.push({ name: fh.name, handle: fh, modified: f.lastModified || 0 });
  }
  metas.sort(function(a, b) {
    if (sortMode.value === 'modified') return (b.modified - a.modified);
    return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
  });
  elFileList.innerHTML = '';
  elCountBadge.textContent = String(metas.length) + ' notes';
  for (const m of metas) {
    const div = document.createElement('div');
    div.className = 'file' + (currentName === m.name ? ' active' : '');
    const when = m.modified ? new Date(m.modified).toLocaleString() : '';
    div.innerHTML = '<span>📝</span>'
      + '<div style="flex:1;min-width:0">'
      + '<div style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + escapeHtml(m.name) + '</div>'
      + '<div class="meta">' + escapeHtml(when) + '</div>'
      + '</div>';
    div.addEventListener('click', function() { openFile(m.handle, m.name); });
    elFileList.appendChild(div);
  }
}
async function openFile(handle, name) {
  if (dirty && !confirm('You have unsaved changes. Discard and open another file?')) return;
  const ok = await ensurePermission(handle, 'readwrite');
  if (!ok) { setStatus('Permission denied for file.'); return; }
  const file = await handle.getFile();
  const text = await file.text();
  currentFileHandle = handle;
  currentName = name;
  setEditorText(text);
  markDirty(false);
  await refreshList();
  focusEditor();
  setStatus('Opened ' + name);
}
async function newNote() {
  if (dirty && !confirm('You have unsaved changes. Discard and create new note?')) return;
  currentFileHandle = null;
  currentName = null;
  setEditorText('# New note\n\n- Item\n  - Sub item\n\nStart writing…\n');
  markDirty(true);
  await refreshList();
  focusEditor();
  setStatus('New note (not saved yet).');
}
async function saveNote() {
  if (!dirHandle) { await pickFolder(); if (!dirHandle) return; }
  if (!currentFileHandle) {
    let name = prompt('Note name (without extension):', 'New Note');
    if (!name) return;
    name = name.replace(/[\\/:*?"<>|]+/g, '-').trim();
    if (!name) return;
    if (!name.toLowerCase().endsWith('.md')) name += '.md';
    currentFileHandle = await dirHandle.getFileHandle(name, { create: true });
    currentName = name;
  }
  const ok = await ensurePermission(currentFileHandle, 'readwrite');
  if (!ok) { setStatus('Permission denied for save.'); return; }
  const content = getEditorText();
  const writable = await currentFileHandle.createWritable();
  await writable.write(content);
  await writable.close();
  markDirty(false);
  await refreshList();
  setStatus('Saved ' + currentName);
}
async function renameNote() {
  if (!dirHandle || !currentFileHandle || !currentName) { alert('Open a note first.'); return; }
  let newName = prompt('Rename to (without extension):', currentName.replace(/\.md$/i, ''));
  if (!newName) return;
  newName = newName.replace(/[\\/:*?"<>|]+/g, '-').trim();
  if (!newName.toLowerCase().endsWith('.md')) newName += '.md';
  const content = getEditorText();
  const newHandle = await dirHandle.getFileHandle(newName, { create: true });
  const writable = await newHandle.createWritable();
  await writable.write(content);
  await writable.close();
  await dirHandle.removeEntry(currentName);
  currentFileHandle = newHandle;
  currentName = newName;
  markDirty(false);
  await refreshList();
  setStatus('Renamed to ' + newName);
}
async function deleteNote() {
  if (!dirHandle || !currentName) { alert('Open a note first.'); return; }
  if (!confirm('Delete ' + currentName + '? This cannot be undone.')) return;
  await dirHandle.removeEntry(currentName);
  currentFileHandle = null;
  currentName = null;
  setEditorText('');
  markDirty(false);
  await refreshList();
  setStatus('Deleted note.');
}

// -------------------- Wire events --------------------
btnPick.addEventListener('click', pickFolder);
btnForget.addEventListener('click', function() { closeSettings(); forgetFolder(); });
btnNew.addEventListener('click', newNote);
btnSave.addEventListener('click', saveNote);
btnRename.addEventListener('click', renameNote);
btnDelete.addEventListener('click', deleteNote);
sortMode.addEventListener('change', function() { refreshList(); });
window.addEventListener('keydown', function(e) {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); saveNote(); }
  if (e.key === 'F2') { e.preventDefault(); renameNote(); }
});

function applyAutosaveFromUI() {
  const n = parseInt(autosaveSecInput.value, 10);
  autosaveSec = clamp(Number.isFinite(n) ? n : AUTOSAVE_DEFAULT, AUTOSAVE_MIN, AUTOSAVE_MAX);
  localStorage.setItem(LS_AUTOSAVE_SEC, String(autosaveSec));
  autosaveSecInput.value = String(autosaveSec);
  startAutosave();
  closeSettings();
  setStatus('Auto-save set to ' + autosaveSec + 's');
}
btnAutosaveApply.addEventListener('click', applyAutosaveFromUI);
btnAutosaveReset.addEventListener('click', function() {
  autosaveSec = AUTOSAVE_DEFAULT;
  localStorage.setItem(LS_AUTOSAVE_SEC, String(autosaveSec));
  autosaveSecInput.value = String(autosaveSec);
  startAutosave();
  closeSettings();
  setStatus('Auto-save reset to ' + autosaveSec + 's');
});

// -------------------- Boot --------------------
(function init() {
  document.getElementById('saveKey').textContent = navigator.platform.includes('Mac') ? '⌘S' : 'Ctrl+S';
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js');
  }
  loadTheme();
  loadAutosave();
  loadOnThisDay(false);
  scheduleNextMidnightRefresh();
  initEditor();
  startAutosave();
  if (!supportsFSA()) {
    elFolderBadge.textContent = 'Limited mode';
    setRememberInfo('Remembering: unsupported');
    setStatus('Use Chrome/Edge for folder write access.');
    return;
  }
  const had = localStorage.getItem(LS_FLAG) === '1';
  setRememberInfo(had ? 'Remembering: yes (restoring...)' : 'Remembering: (none)');
  tryRestoreFolder();
  refreshList();
  markDirty(false);
})();
